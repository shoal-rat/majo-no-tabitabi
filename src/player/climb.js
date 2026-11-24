// Climbing, ledge vaults and climbing out of the water (docs/JOURNEY.md §5 "Movement and craft"; docs/api/player.md
// "Climb, swim and stamina round").
//
// A wall is found from colliders and the land, never from mesh tags: G.world.collidersNear (house and city walls,
// towers, piers, boulders: boxes, or cylinders at least CLIMB.MIN_R across; a collider may opt out with climb: false or
// be a ladder with climb: 'ladder') and the terrain (rising above her chest, steeper than she can walk). Every probe works
// on module-level scratch objects: nothing is allocated per frame.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { clamp, damp, dampAngle } from '../core/util.js';
import { STAMINA } from './stamina.js';

export const CLIMB = {
  UP: 1.5, SIDE: 1.8, DOWN: 2.4, LADDER: 2.2,   // m/s on a wall (and up / down a ladder)
  GAP: 0.47,            // her axis to the wall face while she clings
  REACH: 0.55,          // a wall this far beyond her body is grabbed
  PUSH: 0.18,           // seconds walking into a wall before she takes hold
  MIN_R: 0.9,           // thinner cylinders (tree trunks, posts) are not walls
  CHEST: 1.0, HANDS: 1.5,
  VAULT: 2.1,           // a ledge up to this above her feet is vaulted onto from a jump
  BANK: 1.3,            // a bank up to this above the water is climbed out of
  JUMP: 2.0, JUMP_T: 0.36,
  REGRAB: 0.45,         // after letting go
  MANTLE_T: 0.6,
  WALK: 0.93,           // = MOVE.SLIDE_SLOPE: steeper land is a wall
};

const R = 0.4;
// probe result (shared; the next probe overwrites it)
export const wall = { ok: false, kind: '', dist: 0, nx: 0, nz: 0, top: Infinity, col: null };
const best = { d: 0, nx: 0, nz: 0, top: 0, col: null, ladder: false };
let qx = 0, qy = 0, qz = 0, qdx = 0, qdz = 0, qreach = 0;

function visitCol(c) {
  const y = qy + CLIMB.CHEST;
  if (c.climb === false || !(c.y1 < 1e5) || y > c.y1 + 0.3 || y < c.y0) return false;
  const ladder = c.climb === 'ladder';
  if (!c.box && !ladder && !(c.r >= CLIMB.MIN_R)) return false;
  let d, nx, nz;
  if (c.box) {
    const dx = qx - c.x, dz = qz - c.z;
    const cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const ex = lx - clamp(lx, -c.hw, c.hw), ez = lz - clamp(lz, -c.hd, c.hd);
    d = Math.hypot(ex, ez);
    if (d < 1e-5) return false;
    const ux = ex / d, uz = ez / d;
    nx = ux * cs + uz * sn; nz = -ux * sn + uz * cs;
  } else {
    const dx = qx - c.x, dz = qz - c.z, l = Math.hypot(dx, dz);
    if (l < 1e-5) return false;
    d = l - c.r; nx = dx / l; nz = dz / l;
  }
  if (d > R + qreach || d < 0.05) return false;
  if (-(nx * qdx + nz * qdz) < 0.45) return false;           // not in front of her
  if (d < best.d) { best.d = d; best.nx = nx; best.nz = nz; best.top = c.y1; best.col = c; best.ladder = ladder; }
  return false;
}

/** Is there a wall in front of feet (x, y, z) along (dx, dz) within reach? Fills `wall`. */
export function probe(x, y, z, dx, dz, reach = CLIMB.REACH) {
  const W = G.world;
  wall.ok = false; wall.col = null;
  const l = Math.hypot(dx, dz);
  if (!W || l < 1e-5) return wall;
  dx /= l; dz /= l;
  qx = x; qy = y; qz = z; qdx = dx; qdz = dz; qreach = reach;
  best.d = Infinity; best.col = null;
  W.collidersNear?.(x + dx * reach * 0.5, z + dz * reach * 0.5, R + reach + 0.2, visitCol);
  // the land: rising above her chest within reach and too steep to walk
  const cy = y + CLIMB.CHEST;
  let prev = R * 0.6, hit = -1;
  for (let k = 1; k <= 4; k++) {
    const s = R * 0.6 + (reach + R * 0.4) * k / 4;
    if (W.heightAt(x + dx * s, z + dz * s) > cy) { hit = s; break; }
    prev = s;
  }
  if (hit > 0 && hit < best.d) {
    let a = prev, b = hit;
    for (let k = 0; k < 5; k++) { const m = (a + b) * 0.5; if (W.heightAt(x + dx * m, z + dz * m) > cy) b = m; else a = m; }
    const sx = x + dx * b, sz = z + dz * b;
    const n = W.normalAt(sx, sz, _n);
    const h = Math.hypot(n.x, n.z);
    // steep where she touches it (a gentle hill that merely rises past her chest is walked up, not climbed)
    if (h > 0.3 && W.slopeAt(sx, sz) > CLIMB.WALK + 0.02 && -(n.x * dx + n.z * dz) / h > 0.3) {
      best.d = b; best.nx = n.x / h; best.nz = n.z / h; best.top = Infinity; best.col = null; best.ladder = false;
    }
  }
  if (best.d === Infinity) return wall;
  wall.ok = true; wall.kind = best.col ? (best.ladder ? 'ladder' : 'collider') : 'terrain';
  wall.dist = best.d; wall.nx = best.nx; wall.nz = best.nz; wall.top = best.top; wall.col = best.col;
  return wall;
}
const _n = new THREE.Vector3();

// ---- collider tops she can stand on (a boulder, a pier, a stone wall: not house walls under a roof) ------------------
let tx = 0, tz = 0, ty = 0, tTop = -Infinity;
function visitTop(c) {
  if (c.eave || c.climb === false || !(c.y1 < 1e5) || c.y1 > ty + 0.06 || c.y1 <= tTop) return false;
  if (c.box) {
    const dx = tx - c.x, dz = tz - c.z, cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
    if (Math.abs(dx * cs - dz * sn) > c.hw - 0.02 || Math.abs(dx * sn + dz * cs) > c.hd - 0.02) return false;
  } else if ((tx - c.x) ** 2 + (tz - c.z) ** 2 > (c.r - 0.05) ** 2 || c.r < 0.45) return false;
  tTop = c.y1;
  return false;
}
/** Highest collider top under (x, z) that feet at y are on or above (else -Infinity). */
export function colliderTopAt(x, z, y) {
  tx = x; tz = z; ty = y; tTop = -Infinity;
  G.world?.collidersNear?.(x, z, 0.05, visitTop);
  return tTop;
}

/** Where she would stand past a ledge: fills `ledge` and returns true when there is a floor within reach of her hands. */
export const ledge = { x: 0, y: 0, z: 0 };
export function findLedge(p, nx, nz, dist, handsY) {
  const W = G.world;
  for (let k = 0; k < 4; k++) {
    const s = dist + 0.3 + k * 0.25;
    const x = p.x - nx * s, z = p.z - nz * s;
    let g = W.groundAt(x, z, handsY + 0.5, 1.2);
    const ct = colliderTopAt(x, z, handsY + 0.5);
    if (ct > g) g = ct;
    if (g > handsY + 0.45 || g < p.y + 0.35) continue;
    // land under the floor point must be walkable, or the floor is a platform / collider top
    if (g <= W.heightAt(x, z) + 0.05 && W.slopeAt(x, z) > CLIMB.WALK) continue;
    // room to stand: nothing solid at her chest there
    ledge.x = x - nx * 0.15; ledge.y = g; ledge.z = z - nz * 0.15;
    return true;
  }
  return false;
}

// ---- the climb controller (player.js owns the state machine and calls these) -------------------------------------------
/**
 * @param P G.player   @param S its private state (S.climb holds the wall frame)
 */
export function startClimb(P, S, w, how) {
  const C = S.climb || (S.climb = { nx: 0, nz: 1, kind: '', col: null, phase: 0, jumpT: 0, jx: 0, jy: 0, slipT: 0, moveK: 0, hint: false });
  C.nx = w.nx; C.nz = w.nz; C.kind = w.kind; C.col = w.col; C.jumpT = 0; C.moveK = 0; C.eaveTold = false; C.t = 0;
  // stand off the face at GAP
  P.pos.x += w.nx * (CLIMB.GAP - w.dist); P.pos.z += w.nz * (CLIMB.GAP - w.dist);
  P.vel.set(0, 0, 0);
  P.yaw = Math.atan2(-w.nx, -w.nz);
  S.setState('climb');
  S.airJumps = 1; S.airDodge = true; S.fallMaxVy = 0;
  G.audio?.sfx?.('land', { pos: P.pos, vol: 0.35, pitch: 1.4 });
  G.events.emit('player:climb', { on: true, kind: w.kind, how });
  return true;
}

export function stopClimb(P, S, why) {
  if (P.state !== 'climb') return;
  S.climbCd = CLIMB.REGRAB;
  S.setState('air');
  G.events.emit('player:climb', { on: false, why });
}

/** Begin a mantle onto (ledge.x, ledge.y, ledge.z). */
export function startMantle(P, S, from) {
  const M = S.mantle || (S.mantle = { t: 0, dur: 0, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 });
  M.t = 0; M.x0 = P.pos.x; M.y0 = P.pos.y; M.z0 = P.pos.z; M.x1 = ledge.x; M.y1 = ledge.y; M.z1 = ledge.z;
  M.dur = CLIMB.MANTLE_T * clamp(0.55 + (ledge.y - P.pos.y) / 2.4, 0.6, 1.25);
  P.vel.set(0, 0, 0);
  P.yaw = Math.atan2(M.x1 - M.x0, M.z1 - M.z0);
  S.setState('climb');
  S.climb = S.climb || { nx: 0, nz: 1, kind: '', col: null, phase: 0, jumpT: 0, jx: 0, jy: 0, slipT: 0, moveK: 0 };
  S.climb.kind = 'mantle';
  S.rig.play('climb', { restart: true, fade: 0.08 });
  G.audio?.sfx?.('jump', { pos: P.pos, vol: 0.5, pitch: 0.85 });
  G.events.emit('player:mantle', { from, rise: +(M.y1 - M.y0).toFixed(2) });
}

/** One frame on a wall. Returns nothing; changes state through S.setState / land(). */
export function stepClimb(dt, P, S, I, h) {
  const p = P.pos, C = S.climb, W = G.world;
  // ---- mantle: up first, then over the edge
  if (C.kind === 'mantle') {
    const M = S.mantle;
    M.t += dt;
    const k = clamp(M.t / M.dur);
    const ky = 1 - (1 - Math.min(1, k * 1.5)) ** 2, kx = k * k * (3 - 2 * k);
    p.x = M.x0 + (M.x1 - M.x0) * kx; p.z = M.z0 + (M.z1 - M.z0) * kx; p.y = M.y0 + (M.y1 - M.y0) * ky;
    if (k >= 1) { p.set(M.x1, M.y1, M.z1); S.setState('ground'); S.groundY = M.y1; P.vel.set(0, 0, 0); S.climbCd = 0.2; G.events.emit('player:climb', { on: false, why: 'mantle' }); }
    return;
  }
  const st = P.stam;
  const ladder = C.kind === 'ladder';
  // ---- let go / kick off / climb jump
  if (I.down || I.dodge) { stopClimb(P, S, 'drop'); P.vel.x = C.nx * 1.2; P.vel.z = C.nz * 1.2; return; }
  if (I.jumpP && C.jumpT <= 0) {
    if (I.my < -0.5) {   // jump away from the wall
      stopClimb(P, S, 'kick');
      P.vel.set(C.nx * 5.5, 6, C.nz * 5.5); P.yaw = Math.atan2(C.nx, C.nz);
      S.rig.play('jump', { restart: true, next: 'fall' });
      G.events.emit('player:jump', { air: false, wall: true });
      return;
    }
    if (ladder || st.spend(STAMINA.CLIMB_JUMP)) {
      C.jumpT = CLIMB.JUMP_T;
      const l = Math.hypot(I.mx, Math.max(0, I.my)) || 1;
      C.jx = I.wish ? I.mx / l : 0; C.jy = I.wish ? Math.max(0, I.my) / l : 1;
      if (C.jx === 0 && C.jy === 0) C.jy = 1;
      G.fx?.burst?.('dust', p, { scale: 0.4, count: 0.4 });
      G.audio?.sfx?.('jump', { pos: p, vol: 0.6 });
      G.events.emit('player:jump', { air: false, climb: true });
    }
  }
  // ---- out of stamina: she slips off
  if (!ladder && (st.winded || st.value <= 0)) { stopClimb(P, S, 'winded'); return; }
  // ---- movement on the wall
  const rx = C.nz, rz = -C.nx;                       // her right while she faces the wall (-n)
  let vu, vs;
  if (C.jumpT > 0) {
    const k = C.jumpT / CLIMB.JUMP_T, v = CLIMB.JUMP / CLIMB.JUMP_T * 1.6 * k;
    vu = C.jy * v; vs = C.jx * v; C.jumpT -= dt;
  } else {
    vu = I.my * (I.my > 0 ? (ladder ? CLIMB.LADDER : CLIMB.UP) : (ladder ? CLIMB.LADDER : CLIMB.DOWN));
    vs = ladder ? 0 : I.mx * CLIMB.SIDE;
  }
  const moving = Math.abs(vu) + Math.abs(vs) > 0.05;
  C.moveK = damp(C.moveK, moving ? 1 : 0, 10, dt);
  if (!ladder) {
    const rain = C.kind === 'terrain' && (G.journeyWeather?.rainAt?.(p.x, p.z) ?? 0) > 0.48 ? STAMINA.RAIN : 1;
    st.drain((moving && C.jumpT <= 0 ? STAMINA.CLIMB : STAMINA.CLIMB_HOLD) * rain, dt);
  }
  const ox = p.x, oy = p.y, oz = p.z;
  p.x += rx * vs * dt; p.z += rz * vs * dt; p.y += vu * dt;
  C.phase += (Math.abs(vu) + Math.abs(vs) * 0.8) * dt * (Math.PI * 2 / 0.85);
  // collider top: the hands reached it
  if (C.col && p.y + CLIMB.HANDS > C.col.y1) {
    if (vu > 0 && findLedge(p, C.nx, C.nz, CLIMB.GAP, C.col.y1 + 0.05)) { startMantle(P, S, 'wall'); return; }
    if (vu > 0 && C.col.eave && !C.eaveTold) { C.eaveTold = true; G.events.emit('player:eave', { col: C.col }); }
    p.y = Math.min(p.y, C.col.y1 - CLIMB.HANDS);   // nothing to stand on up there (a roof above the eaves): she hangs at the top
  }
  // keep the wall in front of her (follows curves, corners and the land's bends)
  const w = probe(p.x, p.y, p.z, -C.nx, -C.nz, CLIMB.REACH + 0.25);
  if (w.ok) {
    C.nx = damp(C.nx, w.nx, 10, dt); C.nz = damp(C.nz, w.nz, 10, dt);
    const l = Math.hypot(C.nx, C.nz) || 1; C.nx /= l; C.nz /= l;
    p.x += w.nx * (CLIMB.GAP - w.dist); p.z += w.nz * (CLIMB.GAP - w.dist);
    if (w.col !== C.col) { C.col = w.col; C.kind = w.kind; }
  } else {
    // no wall at her chest any more: over the top (a ledge to climb onto), past an edge sideways (step back), or gone
    if (vu > 0 && findLedge(p, C.nx, C.nz, CLIMB.GAP - 0.1, p.y + CLIMB.HANDS + 0.3)) { startMantle(P, S, 'top'); return; }
    if (Math.abs(vs) > 0.05) { p.x = ox; p.z = oz; p.y = Math.max(p.y, oy); }
    else if (vu > 0) { p.y = oy; }
    else { stopClimb(P, S, 'lost'); return; }
  }
  W.resolveCollisions(p, R, 1.6);
  // feet back on the ground going down
  C.t += dt;
  const g = h.groundBelow(P, S, p.x, p.z, p.y + 0.3);
  if (p.y <= g + 0.04) {
    p.y = g;
    // going down onto the ground, or up a face that has eased into walkable land under her feet (a cliff's shoulder)
    if (vu <= 0.01 || (C.t > 0.4 && (g > W.heightAt(p.x, p.z) + 0.05 || W.slopeAt(p.x, p.z) < CLIMB.WALK))) { S.setState('ground'); S.groundY = g; S.climbCd = 0.35; G.events.emit('player:climb', { on: false, why: 'ground' }); return; }
  }
  P.yaw = dampAngle(P.yaw, Math.atan2(-C.nx, -C.nz), 12, dt);
  P.vel.set(rx * vs, vu, rz * vs);
}

/** Should she take hold of the wall ahead now? (ground / air / glide / swim). Returns true if she did (climb or mantle). */
export function tryGrab(P, S, I, dt, from) {
  if (S.climbCd > 0 || !P.control || P.guarding || P.dead || S.dodgeT > 0 || G.mode !== 'play') { S.wallPush = 0; return false; }
  if (P.holding) { S.wallPush = 0; return false; }   // the star thread (craft) keeps her hands busy
  let dx, dz;
  if (from === 'ground') { if (!I.wish) { S.wallPush = 0; return false; } dx = I.wx; dz = I.wz; }
  else {
    dx = I.wish ? I.wx : P.vel.x; dz = I.wish ? I.wz : P.vel.z;
    if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(P.yaw); dz = Math.cos(P.yaw); }
  }
  const p = P.pos;
  const fy = from === 'swim' ? p.y - 0.75 : p.y;
  let w = probe(p.x, fy, p.z, dx, dz, from === 'ground' ? 0.25 : CLIMB.REACH);
  // a low wall (above a step, below her chest): only ever climbed over, never clung to
  let low = false;
  if (!w.ok && from === 'ground') { w = probe(p.x, fy - 0.5, p.z, dx, dz, 0.25); low = w.ok; }
  if (!w.ok) { S.wallPush = 0; return false; }
  const facing = -(w.nx * dx + w.nz * dz) / (Math.hypot(dx, dz) || 1);
  if (facing < 0.55) { S.wallPush = 0; return false; }
  // a low top within reach of her hands: vault (a jump at a ledge, a bank out of the water)
  if (from === 'ground') {
    S.wallPush = (S.wallPush || 0) + dt;
    if (S.wallPush < CLIMB.PUSH) return false;
  }
  // a low top within reach of her hands: up and over (walking into a waist-high ledge, a jump at a ledge, a bank)
  const topRoom = from === 'swim' ? CLIMB.BANK : from === 'ground' ? 1.3 : CLIMB.VAULT;
  if (findLedge(p, w.nx, w.nz, w.dist, fy + topRoom) && ledge.y - fy <= topRoom + 0.05) {
    if (from !== 'swim' && from !== 'ground' && P.vel.y > 4) return false;   // still rising: wait for the top of the jump
    S.wallPush = 0;
    startMantle(P, S, from);
    return true;
  }
  if (low) return false;
  if (!P.stam.can() && w.kind !== 'ladder') { if (from === 'ground' && !S._windTold) { S._windTold = true; G.events.emit('player:climb', { on: false, why: 'winded' }); } return false; }
  S._windTold = false; S.wallPush = 0;
  if (from === 'swim') P.pos.y = G.world.seaLevel - 0.55;
  return startClimb(P, S, w, from);
}

/** Pose on the wall: hands and feet on the face (hand IK + foot reach), an alternating reach while moving. */
const _t = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
export function poseClimb(P, S, rig, V) {
  const C = S.climb;
  if (P.state !== 'climb' || !C || C.kind === 'mantle') {
    if (rig.reach.R?._climb) rig.reach.R = null;
    if (rig.reach.L?._climb) rig.reach.L = null;
    if (rig.reach.FR?._climb) rig.reach.FR = null;
    if (rig.reach.FL?._climb) rig.reach.FL = null;
    return;
  }
  const p = P.pos, nx = C.nx, nz = C.nz, rx = nz, rz = -nx;
  const fx = p.x - nx * (CLIMB.GAP - 0.07), fz = p.z - nz * (CLIMB.GAP - 0.07);   // a hair off the face
  const ph = C.phase, mk = C.moveK;
  const set = (o, side, up, k) => { o.x = fx + rx * side; o.y = p.y + up; o.z = fz + nz * k + rz * side; };
  set(V[0], 0.22, CLIMB.HANDS + 0.12 + 0.16 * mk * Math.sin(ph), 0);
  set(V[1], -0.22, CLIMB.HANDS + 0.12 + 0.16 * mk * Math.sin(ph + Math.PI), 0);
  set(V[2], 0.14, 0.3 + 0.14 * mk * Math.sin(ph + Math.PI), 0.1);
  set(V[3], -0.14, 0.3 + 0.14 * mk * Math.sin(ph), 0.1);
  const r = rig.reach;
  r.R = V.rR || (V.rR = { w: 1, target: V[0], _climb: true }); r.L = V.rL || (V.rL = { w: 1, target: V[1], _climb: true });
  r.FR = V.rFR || (V.rFR = { w: 1, target: V[2], _climb: true }); r.FL = V.rFL || (V.rFL = { w: 1, target: V[3], _climb: true });
}
