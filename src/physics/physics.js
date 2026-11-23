// physics — the Rapier world of the game (DESIGN §6.1): fixed 1/60 s steps with an accumulator, render interpolation,
// lazily built heightfield ground, a mirror of every static obstacle / slab of G.world, rigid props with materials,
// water, wind, time bubbles, character capsules and the queries everyone else uses (raycast, supportAt, explode …).
//
// Module layout: consts (tunables) · terrain (heightfield chunks) · statics (G.world mirror) · body (PhysBody)
//                forces (water / wind / bubbles / rolling) · queries · characters · debug (wire overlay) · this file.
//
// Meshes handed to add() are driven in WORLD space: keep them as direct children of the scene (or of an untransformed group).
import RAPIER from '@dimforge/rapier3d-compat';
import { G } from '../core/game.js';
import { STEP, MAX_STEPS, GRAVITY, GROUPS, MAX_SPEED, IMPACT_SPEED, IMPACT_GAP, IMPACT_PER_FRAME } from './consts.js';
import { createTerrain } from './terrain.js';
import { createStatics } from './statics.js';
import { createBody, PhysBody } from './body.js';
import { createForces } from './forces.js';
import { createQueries } from './queries.js';
import { createCharacters } from './characters.js';
import { createDebug } from './debug.js';

/** Seconds a body takes to shrink away at the end of its lifetime. */
const FADE = 0.45;
/** Focus (player / camera) keeps ground built this far around it. */
const FOCUS_REACH = 40;
/** A body that a character capsule bumps into leaves at no more than min(max, k × walker speed + min) m/s. */
const SHOVE = { k: 0.6, min: 0.8, max: 5, mass: 40 };

let P = null;

function makeApi() {
  const api = {
    RAPIER, world: null,
    /** Highest number of dynamic bodies; adding beyond it removes the oldest debris (then the oldest expiring body). */
    maxDynamic: 260,
    /** [{ pos: Vector3, radius, scale }] — filled by spells (月晕). Bodies inside run at `scale` speed. */
    timeBubbles: [],
    PhysBody,
    get count() { return P ? P.dyn.length : 0; },
    /** The PhysBody that owns a Rapier collider (or a collider handle), or null. */
    bodyOf(col) { return P ? P.byHandle.get(typeof col === 'number' ? col : col?.handle) || null : null; },
    get bodies() { return P ? P.all : []; },
    /** +1 if a G.world box `rot` turns like Object3D.rotation.y, -1 if the other way (measured at init). */
    get rotSense() { return P ? P.statics.rotSense : 1; },
  };

  /** ★ add({...}) -> PhysBody (see DESIGN §6.1). Extra options: vel, angvel, sleeping, offset, onRemove, keepMesh. */
  api.add = (o = {}) => {
    let b;
    try { b = createBody(P, o); } catch (e) { G.reportError('physics:add', e); return null; }
    b._keepMesh = !!o.keepMesh;
    b._fresh = true;
    P.all.push(b);
    P.byHandle.set(b.col.handle, b);
    if (b.isDynamic) {
      P.dyn.push(b);
      if (b.group === 'debris') P.debris.push(b);
      P.terrain.cover(b._cp.x, b._cp.z, b.radius + 2);
      enforceBudget(b);
    }
    return b;
  };

  /** ★ remove(body). The mesh stays where it is (the caller owns it). */
  api.remove = (b) => drop(b, 'removed');

  api.explode = (pos, radius, impulse, opts) => P.queries.explode(pos, radius, impulse, opts);
  api.pushCone = (origin, dir, range, halfAngle, impulse) => P.queries.pushCone(origin, dir, range, halfAngle, impulse);
  api.raycast = (origin, dir, maxDist, opts) => P.queries.raycast(origin, dir, maxDist, opts);
  api.overlapSphere = (pos, r, cb) => P.queries.overlapSphere(pos, r, cb);
  api.supportAt = (x, z, y, maxDrop) => P.queries.supportAt(x, z, y, maxDrop);
  api.addCharacter = (o) => P.characters.add(o || {});
  /** Closest body within r of pos (filter(body) -> bool optional). Handy for 月引 picking. */
  api.nearest = (pos, r, filter) => P.queries.nearest(pos, r, filter);
  /** Height of the ground the solver collides with at (x, z) (the heightfield facet, else the analytic terrain). */
  api.groundAt = (x, z) => P.terrain.surfaceAt(x, z);
  /** Wake every dynamic body whose centre is within r (horizontally) of (x, z). */
  api.wakeArea = (x, z, r) => P.wakeArea(x, z, r);
  /** Mirror every pending G.world collider / platform right now (normally a few hundred per frame). */
  api.syncStatics = () => P.statics.flush();
  /** Wireframe overlay of all colliders near the focus. debug(true|false); debug() toggles. Returns the new state. */
  api.debug = (on) => P.debug.set(on === undefined ? !P.debug.on : on);
  /** Numbers for tests / perf overlays. */
  api.stats = () => {
    let awake = 0;
    for (let i = 0; i < P.dyn.length; i++) if (!P.dyn[i].sleeping) awake++;
    return {
      bodies: P.all.length, dynamic: P.dyn.length, awake, sleeping: P.dyn.length - awake, debris: P.debris.length,
      chunks: P.terrain.chunks.size, chunksBuilt: P.terrain.built, statics: P.statics.count, staticsPending: P.statics.pending(),
      characters: P.chars.length, steps: P.stepsTotal, stepMs: +P.stepMs.toFixed(3), rescued: P.rescued, impacts: P.impacts,
      colliders: P.world.colliders.len(), skips: P.skips,
      // per-frame cost of each phase (ms, smoothed): sync = statics + terrain flush, house = housekeeping,
      // steps = all fixed steps (skipped ones are nearly free), interp = mesh interpolation
      prof: { sync: +P.prof.sync.toFixed(3), house: +P.prof.house.toFixed(3), steps: +P.prof.steps.toFixed(3), interp: +P.prof.interp.toFixed(3) },
    };
  };
  return api;
}

// ---- body bookkeeping --------------------------------------------------------------------------------------------
function swapOut(arr, b) {
  const i = arr.indexOf(b);
  if (i < 0) return;
  arr[i] = arr[arr.length - 1];
  arr.pop();
}
function drop(b, reason) {
  if (!b || !b.alive) return;
  b.alive = false;
  P.byHandle.delete(b.col.handle);
  try { P.world.removeRigidBody(b.rb); } catch (e) { G.reportError('physics:remove', e); }
  swapOut(P.all, b);
  if (b.isDynamic) swapOut(P.dyn, b);
  if (b.group === 'debris') { const i = P.debris.indexOf(b); if (i >= 0) P.debris.splice(i, 1); }
  if (reason !== 'removed' && b.mesh && !b._keepMesh && b.mesh.parent) b.mesh.parent.remove(b.mesh);
  if (b.onRemove) { try { b.onRemove(b, reason); } catch (e) { G.reportError('physics:onRemove', e); } }
}
function enforceBudget(added) {
  let guard = 16;
  while (P.dyn.length > P.api.maxDynamic && guard-- > 0) {
    let victim = null;
    for (let i = 0; i < P.debris.length; i++) { const d = P.debris[i]; if (d !== added && d.alive && !d._held) { victim = d; break; } }
    if (!victim) {
      // no debris left: the expiring body closest to its end goes
      let best = Infinity;
      for (let i = 0; i < P.dyn.length; i++) {
        const d = P.dyn[i];
        if (d === added || d._held || d.lifetime === Infinity) continue;
        const left = d.lifetime - d.age;
        if (left < best) { best = left; victim = d; }
      }
    }
    if (!victim) return;
    drop(victim, 'budget');
  }
}

// ---- the step ----------------------------------------------------------------------------------------------------
function preStep() {
  P.charMoved = P.characters.preStep();
  P.forces.begin();
  const dyn = P.dyn, terrain = P.terrain;
  let awake = 0;
  for (let i = 0; i < dyn.length; i++) {
    const b = dyn[i];
    const rb = b.rb;
    if (rb.isSleeping()) { b.sleeping = true; continue; }
    b.sleeping = false; awake++;
    // impulses / velocity changes made by others since the last step are only in the solver: refresh the mirrors first
    rb.linvel(b.vel); rb.angvel(b.angvel);
    b._gy = terrain.surfaceAt(b._cp.x, b._cp.z);
    P.forces.pre(b, STEP);
    b._pv.copy(b.vel);
    b._hit = false; b._shove = null;
  }
  P.awakeN = awake;
}

function onContact(h1, h2, started) {
  const a = P.byHandle.get(h1), c = P.byHandle.get(h2);
  if (a && a.kind === 'body') touchPair(a, c, started);
  if (c && c.kind === 'body') touchPair(c, a, started);
}
function touchPair(b, other, started) {
  const ch = other && other.kind === 'char';
  if (started) { b._nc++; b._hit = true; b._other = other || null; if (ch) { b._shove = other; b._charC = (b._charC || 0) + 1; b._char = other; } }
  else { if (b._nc > 0) b._nc--; if (ch && b._charC > 0) b._charC--; }
}

function postStep() {
  const dyn = P.dyn;
  const g = GRAVITY * STEP;
  for (let i = 0; i < dyn.length; i++) {
    const b = dyn[i];
    const rb = b.rb;
    b._p0.copy(b.pos); b._q0.copy(b.quat);
    if (rb.isSleeping()) {
      if (!b.sleeping) { b.sleeping = true; b.vel.set(0, 0, 0); b.angvel.set(0, 0, 0); }
      continue;
    }
    b.sleeping = false;
    rb.translation(b.pos); rb.rotation(b.quat); rb.linvel(b.vel); rb.angvel(b.angvel);
    b._syncCentre();
    const v = b.vel;
    const l2 = v.x * v.x + v.y * v.y + v.z * v.z;
    // fix2: put creeping bodies to sleep — light apples nudged by wind or rocking on a static never reached Rapier's
    // sleep threshold, kept the world awake and cost a full step every frame. Grounded, slower than ~0.3 m/s (rim speed
    // too) for 1.2 s, not held, not in water, not touched by a capsule -> asleep (any hit, blast or push wakes it).
    const aw = b.angvel, rr = b.radius || 0.3;
    if (b.grounded && !(b.submerged > 0) && !b._held && !(b._charC > 0) && l2 < 0.09 && (aw.x * aw.x + aw.y * aw.y + aw.z * aw.z) * rr * rr < 0.09) {
      b._calmT = (b._calmT || 0) + STEP;
      if (b._calmT > 1.2) { b._calmT = 0; rb.sleep(); b.sleeping = true; v.set(0, 0, 0); aw.set(0, 0, 0); continue; }
    } else b._calmT = 0;
    if (l2 > MAX_SPEED * MAX_SPEED) { v.multiplyScalar(MAX_SPEED / Math.sqrt(l2)); rb.setLinvel(v, false); }
    else if (b._shove || (b._charC > 0 && b._char?.alive)) {
      // walked into (first bump and every step it stays in touch): an unstoppable (kinematic) capsule would bat props away
      // at full running speed -> a firm, mass-limited shove instead (heavy things barely budge, nothing keeps sliding)
      const cv = (b._shove || b._char).vel;
      const lim = Math.min(SHOVE.max, SHOVE.k * Math.sqrt(cv.x * cv.x + cv.z * cv.z) + SHOVE.min) * Math.min(1, Math.max(0.2, SHOVE.mass / Math.max(1, b.mass)));
      const h2 = v.x * v.x + v.z * v.z;
      if (h2 > lim * lim) { const k = lim / Math.sqrt(h2); v.x *= k; v.z *= k; rb.setLinvel(v, false); b.angvel.multiplyScalar(0.5); rb.setAngvel(b.angvel, false); }
    }
    // ---- hard hits ----
    if (b._hit || b._nc > 0) {
      const s = b.timeScale;
      const dx = v.x - b._pv.x, dy = v.y - b._pv.y + g * s * s, dz = v.z - b._pv.z;
      const sp = Math.sqrt(dx * dx + dy * dy + dz * dz) / s;
      if (sp > IMPACT_SPEED && P.t - b._impactT > IMPACT_GAP) impact(b, b._hit ? b._other : null, sp);
    }
  }
  // kinematic / fixed bodies moved by their owners
  const all = P.all;
  P.kinMoved = false;
  for (let i = 0; i < all.length; i++) {
    const b = all[i];
    if (b.type !== 'kinematic') continue;
    b._p0.copy(b.pos); b._q0.copy(b.quat);
    b.rb.translation(b.pos); b.rb.rotation(b.quat);
    if (!b._p0.equals(b.pos) || !b._q0.equals(b.quat)) P.kinMoved = true;
    b._syncCentre();
  }
}

/**
 * One hard hit. speed = how sharply b's own velocity changed (as before); relSpeed = closing speed of the two surfaces
 * before the step (b against the other body / capsule / still ground); impulse = b.mass × speed (N·s, a 25 kg crate
 * stopped from 4 m/s ≈ 100).
 */
function impact(b, other, speed) {
  if (P.impactsThisFrame >= IMPACT_PER_FRAME) return;
  P.impactsThisFrame++; P.impacts++;
  b._impactT = P.t;
  const ob = other && other.kind === 'body' ? other : null;
  if (ob) ob._impactT = P.t;            // one event per collision, not one per partner
  const surface = !other ? 'terrain' : other.kind === 'char' ? 'character' : other.kind;
  const pos = b.pos.clone();
  const s = b.timeScale || 1;
  let ox = 0, oy = 0, oz = 0;
  if (ob && ob.isDynamic && !ob.sleeping) { ox = ob._pv.x; oy = ob._pv.y; oz = ob._pv.z; } else if (other && other.kind === 'char') { ox = other.vel.x; oy = other.vel.y; oz = other.vel.z; }
  const relSpeed = Math.sqrt((b._pv.x - ox) ** 2 + (b._pv.y - oy) ** 2 + (b._pv.z - oz) ** 2) / s;
  const impulse = b.mass * speed;
  if (b.onImpact) { try { b.onImpact(ob, speed, { pos, surface, owner: other ? other.owner ?? null : null, relSpeed, impulse }); } catch (e) { G.reportError('physics:onImpact', e); } }
  if (ob && ob.onImpact) { try { ob.onImpact(b, speed, { pos, surface: 'body', owner: b.owner, relSpeed, impulse }); } catch (e) { G.reportError('physics:onImpact', e); } }
  // owner = what was hit (the character's / partner body's owner, e.g. an enemy); bodyOwner = owner of the moving body
  G.events.emit('physics:impact', { body: b, other: ob, speed, pos, surface, relSpeed, impulse, owner: other ? other.owner ?? null : null, bodyOwner: b.owner ?? null });
}

function splash(b, speed) {
  if (P.t - (b._splashT ?? -9) < 0.5) return;
  b._splashT = P.t;
  const p = P.splashPos.set(b._cp.x, 0, b._cp.z);
  const size = Math.min(2.5, 0.4 + b.radius * 0.8 + speed * 0.05);
  G.fx?.burst?.('splash', p, { size, power: Math.min(1, speed / 14) });
  G.audio?.sfx?.('splash', { pos: p, vol: Math.min(1, 0.2 + speed / 16), pitch: Math.max(0.6, 1.3 - b.radius * 0.5) });
}

/** Ground for everything that moves, lifetimes, lost bodies. Once per rendered frame, before the steps. */
function housekeeping(dt) {
  const dyn = P.dyn, terrain = P.terrain;
  const f = G.env.focus;
  if (f && f.x === f.x) terrain.cover(f.x, f.z, FOCUS_REACH);
  for (let i = dyn.length - 1; i >= 0; i--) {
    const b = dyn[i];
    const c = b._cp;
    if (!(c.x === c.x) || !(c.y === c.y)) { drop(b, 'lost'); continue; }
    if (b.lifetime !== Infinity) {
      b.age += dt;
      const left = b.lifetime - b.age;
      if (left <= 0) { drop(b, 'lifetime'); continue; }
      if (left < FADE && b.mesh) {
        if (!b._s0) b._s0 = b.mesh.scale.clone();
        b.mesh.scale.copy(b._s0).multiplyScalar(Math.max(0.02, left / FADE));
      }
    } else b.age += dt;
    if (b.sleeping && !b._fresh) continue;
    b._fresh = false;
    const sp = Math.abs(b.vel.x) + Math.abs(b.vel.z);
    terrain.cover(c.x, c.z, b.radius + 1 + sp * STEP * MAX_STEPS);
    // safety net: fell through the ground (a tunnelling bug, a teleport into a hill) -> put it back on top
    const gy = terrain.surfaceAt(c.x, c.z);
    if (c.y < gy - 1.5 - b.radius) {
      if (c.y < -400 || b.group === 'debris') { drop(b, 'lost'); continue; }
      P.rescued++;
      P.tmp.set(b.pos.x, b.pos.y + (gy + b._vext + 0.05 - c.y), b.pos.z);
      b.setPosition(P.tmp);
      b.setVelocity(P.zero);
    }
  }
}

function interpolate(alpha) {
  const all = P.all;
  for (let i = 0; i < all.length; i++) {
    const b = all[i], m = b.mesh;
    if (!m || b.type === 'fixed') continue;
    if (b.sleeping && b._still) continue;
    m.position.lerpVectors(b._p0, b.pos, alpha);
    m.quaternion.slerpQuaternions(b._q0, b.quat, alpha);
    // a sleeping body needs one last exact placement, then nothing until it wakes
    b._still = b.sleeping && b._p0.equals(b.pos);
  }
}

export const physicsSystem = {
  name: 'physics',
  pausable: true,
  async init(g) {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    world.timestep = STEP;
    const api = makeApi();
    api.world = world;
    P = {
      RAPIER, world, G: g, api,
      byHandle: new Map(), all: [], dyn: [], debris: [], chars: [],
      frame: 0, t: 0, acc: 0, stepsTotal: 0, stepMs: 0, rescued: 0, impacts: 0, impactsThisFrame: 0,
      prof: { sync: 0, house: 0, steps: 0, interp: 0 }, skips: 0, lastColliders: -1, stirred: 2, noSkip: false,
      /** true when a fixed step would change nothing (see update) */
      quiet() {
        if (P.noSkip || P.stirred > 0) { if (P.stirred > 0) P.stirred--; return false; }
        if (P.awakeN > 0 || P.kinMoved) return false;
        if (P.world.colliders.len() !== P.lastColliders) return false;
        // moving capsules only matter next to a dynamic body (capsules collide with props / debris only, and queries
        // skip them unless asked) — a heroine running through an empty field does not need the solver
        if (P.charMoved) {
          const ch = P.chars, dyn = P.dyn;
          for (let i = 0; i < ch.length; i++) {
            const h = ch[i];
            if (!h.enabled || (h.vel.x === 0 && h.vel.y === 0 && h.vel.z === 0)) continue;
            const reach = h.radius + h.height * 0.5 + 2 + Math.sqrt(h.vel.x * h.vel.x + h.vel.z * h.vel.z) * STEP * 3;
            for (let j = 0; j < dyn.length; j++) {
              const c = dyn[j]._cp, R = reach + dyn[j].radius;
              const dx = c.x - h.pos.x, dy = c.y - h.pos.y, dz = c.z - h.pos.z;
              if (dx * dx + dy * dy + dz * dz < R * R) return false;
            }
          }
          // skipped while moving: the capsules are placed exactly (no sweep) on the next real step
          for (let i = 0; i < ch.length; i++) ch[i]._fresh = true;
        }
        return true;
      },
      awakeN: 0, charMoved: false, kinMoved: false, sig: -1,
      events: new RAPIER.EventQueue(true),
      tmp: new g.THREE.Vector3(), zero: new g.THREE.Vector3(), splashPos: new g.THREE.Vector3(),
      splash,
      touch(b) {
        if (!b.isDynamic) return;
        P.terrain.cover(b._cp.x, b._cp.z, b.radius + 2);
        b._fresh = true; b._still = false;
      },
      wakeArea(x, z, r) {
        const d = P.dyn;
        for (let i = 0; i < d.length; i++) {
          const b = d[i];
          const dx = b._cp.x - x, dz = b._cp.z - z, R = r + b.radius;
          if (dx * dx + dz * dz < R * R) { b.rb.wakeUp(); b.sleeping = false; b._still = false; b._fresh = true; }
        }
      },
      regroup(b, group) {
        if (!b.alive) return;
        const wasDebris = b.group === 'debris';
        b.group = group; b._gkey = group;
        if (!b._held) b.col.setCollisionGroups(GROUPS[group]);
        if (wasDebris && group !== 'debris') { const i = P.debris.indexOf(b); if (i >= 0) P.debris.splice(i, 1); }
        if (!wasDebris && group === 'debris' && b.isDynamic) P.debris.push(b);
      },
    };
    P.terrain = createTerrain(P);
    P.statics = createStatics(P);
    P.forces = createForces(P);
    P.queries = createQueries(P);
    P.characters = createCharacters(P);
    P.debug = createDebug(P);
    g.events.on('terrain:deformed', (e) => { P.terrain.onDeform(e); P.wakeArea((e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2, (e.x1 - e.x0) / 2 + 2); });
    g.physics = api;
    P.statics.sync();
  },
  start() {},
  update(dt) {
    if (!P) return;
    P.frame++;
    P.impactsThisFrame = 0;
    const pf = P.prof, now = performance.now.bind(performance);
    let ta = now();
    // the static mirror and reshaped ground are brought up to date even while paused (cheap, keeps queries right)
    P.statics.sync();
    P.terrain.flush();
    P.debug.update();
    // anything added / removed / rebuilt since the last frame (statics, ground chunks, bodies) -> step for real
    const sig = P.statics.count * 7919 + P.terrain.built * 104729 + P.terrain.chunks.size * 31 + P.all.length * 1299709 + P.chars.length;
    if (sig !== P.sig) { P.sig = sig; P.stirred = Math.max(P.stirred, 2); }
    let tb = now(); pf.sync = pf.sync * 0.95 + (tb - ta) * 0.05;
    if (!(dt > 0)) return;
    housekeeping(dt);
    ta = now(); pf.house = pf.house * 0.95 + (ta - tb) * 0.05;
    P.acc += dt;
    let n = 0, skipped = 0;
    const t0 = ta;
    while (P.acc >= STEP && n < MAX_STEPS) {
      preStep();
      // fix2: a world at rest (no awake body, no capsule or kinematic body moved, no collider added or removed since
      // the last real step) is not stepped — Rapier's solver and broad phase cost ~1 ms per step even with nothing to do
      if (P.quiet()) { skipped++; P.skips++; }
      else {
        P.world.step(P.events);
        P.events.drainCollisionEvents(onContact);
        P.lastColliders = P.world.colliders.len();
      }
      P.t += STEP;
      postStep();
      P.acc -= STEP; n++;
    }
    if (P.acc > STEP) P.acc = STEP;            // fell behind: drop the backlog instead of spiralling
    tb = now();
    if (n) { P.stepsTotal += n; if (n > skipped) P.stepMs = P.stepMs * 0.9 + (tb - t0) / n * 0.1; }
    pf.steps = pf.steps * 0.95 + (tb - t0) * 0.05;
    interpolate(P.acc / STEP);
    pf.interp = pf.interp * 0.95 + (now() - tb) * 0.05;
  },
};
