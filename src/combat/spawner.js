// Camps (streamed by distance, respawning), story waves, and the three 影巢 nests around 千年枫.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { PAL, glow, toon } from '../core/mats.js';
import { clamp, TAU, mulberry32 } from '../core/util.js';
import { CAMPS, NESTS, WAVES } from '../data/camps.js';
import { TYPES } from './types.js';
import { DARK } from './attacks.js';

const _v = new THREE.Vector3();
export const MAX_ACTIVE = 24;
const SPAWN_R = 70, DESPAWN_R = 110;

export function createSpawner(C) {
  const camps = CAMPS.map((c) => ({ ...c, alive: new Set(), spawned: false, clearedAt: -1e9 }));
  const waves = [];
  const nests = NESTS.map((n) => ({ ...n, nBr: n.brambles || 6, built: false, core: null, brambles: [], children: new Set(), spawnT: 3, k: 0, opened: false, group: null, em: null }));
  let acc = 0;

  function free() { return MAX_ACTIVE - C.enemies.length; }
  function ringPos(x, z, r, i, n, out) {
    const a = (i / Math.max(1, n)) * TAU + Math.random() * 0.6;
    const d = r * (0.35 + 0.6 * Math.random());
    return out.set(x + Math.cos(a) * d, NaN, z + Math.sin(a) * d);
  }

  // ---- camps ---------------------------------------------------------------------------------------------------------
  function spawnCamp(c) {
    let total = 0;
    for (const [, n] of c.kinds) total += n;
    if (free() < total) return;
    let i = 0;
    for (const [type, n] of c.kinds) for (let k = 0; k < n; k++) {
      ringPos(c.x, c.z, c.r, i++, total, _v);
      const e = C.spawn(type, _v, { camp: c });
      if (e) c.alive.add(e);
    }
    c.spawned = true;
  }
  function despawnCamp(c) {
    for (const e of c.alive) C.despawn(e);
    c.alive.clear();
    c.spawned = false;
  }

  // ---- waves ---------------------------------------------------------------------------------------------------------
  /** ★ spawnWave(id | list, pos?, opts?) -> Promise resolved when every member is dead. */
  function spawnWave(idOrList, pos, opts = {}) {
    let kinds = [], r = opts.r ?? 7, at = pos;
    if (typeof idOrList === 'string') {
      const w = WAVES[idOrList];
      if (!w) { G.reportError('combat:wave', new Error('unknown wave ' + idOrList)); return Promise.resolve(); }
      kinds = w.kinds; r = opts.r ?? w.r ?? r;
      if (!at) at = w.at;
    } else if (Array.isArray(idOrList)) kinds = idOrList.map((k) => (Array.isArray(k) ? k : [k, 1]));
    if (!at) { const P = G.player; at = P ? { x: P.pos.x + Math.sin(P.yaw) * 9, z: P.pos.z + Math.cos(P.yaw) * 9 } : { x: 0, z: 0 }; }
    const wave = { id: typeof idOrList === 'string' ? idOrList : 'list', members: new Set(), resolve: null, done: false };
    const promise = new Promise((res) => { wave.resolve = res; });
    let total = 0;
    for (const [, n] of kinds) total += n;
    let i = 0;
    for (const [type, n] of kinds) for (let k = 0; k < n; k++) {
      ringPos(at.x, at.z, r, i, total, _v);
      const p = _v.clone();
      const delay = (opts.stagger ?? 0.18) * i++;
      wave.members.add(p); // placeholder until spawned, so the wave is not "done" early
      const go = () => {
        wave.members.delete(p);
        const e = C.spawn(type, p, { aggro: opts.aggro !== false, persistent: true, wave, hpMul: opts.hpMul });
        if (e) {
          wave.members.add(e);
          e.centerOut(_v);
          G.fx?.burst('summon', _v, { color: opts.color ?? (type === 'paper' ? 0xfff1c4 : DARK), scale: 0.9 });
          opts.onSpawn?.(e);
        }
        check(wave);
      };
      if (delay > 0) C.after(delay, go); else go();
    }
    waves.push(wave);
    check(wave);
    return promise;
  }
  function check(w) {
    if (w.done) return;
    for (const m of w.members) if (!m.isVector3 && !m.dead) return; else if (m.isVector3) return;
    w.done = true;
    const i = waves.indexOf(w); if (i >= 0) waves.splice(i, 1);
    w.resolve?.();
  }

  // ---- nests ---------------------------------------------------------------------------------------------------------
  function buildNest(n) {
    n.built = true;
    n.y = G.world.groundAt(n.x, n.z);
    const pos = new THREE.Vector3(n.x, n.y, n.z);
    const core = C.spawn('nest', pos, { persistent: true, aggro: true, yaw: 0 });
    if (!core) { n.built = false; return; }
    core.nest = n;
    n.core = core;
    n.opened = false;
    // brambles: thorny arcs caging the core, each a wood reactor that must burn away
    const rng = mulberry32(n.x * 31 + n.z * 7);
    const geos = brambleGeos();
    for (let i = 0; i < n.nBr; i++) {
      const a = (i / n.nBr) * TAU + rng() * 0.3;
      const mesh = new THREE.Mesh(geos[i % geos.length], brambleMat());
      mesh.position.set(n.x, 0, n.z);
      mesh.rotation.y = a;
      mesh.scale.setScalar(0.95 + rng() * 0.25);
      mesh.position.y = G.world.groundAt(n.x + Math.cos(a) * 2.6, n.z - Math.sin(a) * 2.6) - 0.15;
      mesh.castShadow = true; mesh.receiveShadow = true;
      G.scene.add(mesh);
      // reactor at the arc's middle (local +x is the arc's side, rotated by a around y)
      const mid = new THREE.Vector3(n.x + Math.cos(a) * 2.3, mesh.position.y, n.z - Math.sin(a) * 2.3);
      const b = { mesh, alive: true, wither: 0, reactor: null };
      if (G.elements?.register) {
        b.reactor = G.elements.register({
          owner: b, kind: 'hazard', material: 'wood', pos: mid, radius: 1.5, height: 2.6, team: 'enemy', flammable: 1, burnTime: 3.2, freezable: false,
          on: {
            burnout() { killBramble(n, b); },
            hit(r, el, power, h) {
              if (h && h.team === 'enemy') return;
              if (el === 'fire' || (el === 'thunder' && h && h.split)) { /* elements already ignites */ }
              else if (G.time.t - (n._tipT || -9) > 1.2) { n._tipT = G.time.t; G.fx?.text?.(_v.copy(mid).setY(mid.y + 2.8), t('combat.brambleTip'), { color: 0xffb070, size: 0.8 }); }
            },
          },
        });
      }
      n.brambles.push(b);
    }
    const em = G.fx?.emitter?.('miasma', { color: DARK, scale: 0.8 });
    if (em) { em.pos.set(n.x, n.y + 0.6, n.z); n.em = em; }
  }
  function killBramble(n, b) {
    if (!b.alive) return;
    b.alive = false;
    b.wither = 0.001;
    if (b.reactor) { try { G.elements?.unregister(b.reactor); } catch (e) { G.reportError('combat:bramble', e); } b.reactor = null; }
    _v.copy(b.mesh.position); _v.y += 1.2;
    G.fx?.burst('wood_break', _v, { scale: 1.2 });
    G.fx?.burst('ignite', _v, { scale: 1 });
    G.audio?.sfx('wood_break', { pos: _v });
    if (!n.brambles.some((x) => x.alive) && !n.opened && n.core && !n.core.dead) {
      n.opened = true;
      n.core.centerOut(_v);
      G.fx?.burst('clash_big', _v, { color: 0xff8a3a, color2: DARK, scale: 0.9 });
      G.audio?.sfx('shatter_rock', { pos: _v });
      G.ui?.toast?.(t('combat.nestOpen'), { dur: 3 });
    }
  }
  function clearNest(n, keepCore = false) {
    for (const b of n.brambles) {
      if (b.reactor) { try { G.elements?.unregister(b.reactor); } catch (e) { /* ignore */ } }
      b.mesh.parent?.remove(b.mesh);
    }
    n.brambles.length = 0;
    n.em?.remove(); n.em = null;
    if (!keepCore && n.core && !n.core.dead) C.despawn(n.core);
    n.core = null;
    n.built = false;
  }

  TYPES.nest = {
    asset: null, primitive: makeNestMesh, tint: null, hp: 320, radius: 1.1, height: 2.2, material: 'shade', heavy: true, brave: true, boss: false,
    noFlee: true, collide: false, speed: 0, drops: { stardust: [10, 14], heart: 1 }, dissolve: 0xffd27a, castShadow: false, blobRadius: 1.2,
    damageScale(e) {
      const n = e.nest;
      if (n && n.brambles.some((b) => b.alive)) {
        if (G.time.t - (e._shieldT || -9) > 0.8) { e._shieldT = G.time.t; G.fx?.text?.(e.centerOut(_v).setY(e.pos.y + e.height + 0.6), t('combat.nestShielded'), { kind: 'word', target: e, color: 0xb48cff, size: 0.9 }); }
        return 0;
      }
      return 1;
    },
    think(e, dt) {
      const n = e.nest;
      e.k2 = (e.k2 || 0) + dt;
      const m = e.cr?.model;
      if (m) {
        const p = 1 + Math.sin(e.k2 * 3.2) * 0.06 + (G.time.t - e.lastHitT < 0.2 ? 0.08 : 0);
        m.scale.setScalar(p);
        const coreMesh = m.userData.core;
        if (coreMesh) coreMesh.rotation.y += dt * 0.8;
      }
      e.move.set(0, 0, 0);
      if (!n || G.mode !== 'play') return;
      const P = G.player;
      if (!P || P.dead) return;
      const d = Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
      for (const c of n.children) if (c.dead) n.children.delete(c);
      n.spawnT -= dt;
      if (d < 34 && n.spawnT <= 0 && n.children.size < 3 && C.enemies.length < MAX_ACTIVE) {
        n.spawnT = 7.5;
        const type = n.kinds[n.k++ % n.kinds.length];
        const a = Math.random() * TAU;
        _v.set(e.pos.x + Math.cos(a) * 3.2, e.pos.y, e.pos.z + Math.sin(a) * 3.2);
        const c = C.spawn(type, _v, { aggro: true, persistent: true });
        if (c) {
          n.children.add(c);
          c.centerOut(_v);
          G.fx?.burst('summon', _v, { color: DARK, scale: 1 });
          G.audio?.sfx('cast_dark', { pos: _v, vol: 0.8 });
        }
      }
    },
    onDeath(e) {
      const n = e.nest;
      if (!n) return;
      if (G.state) { G.state.defeated = G.state.defeated || {}; G.state.defeated[n.id] = true; }
      e.centerOut(_v);
      G.fx?.burst('boss_death', _v, { scale: 0.6 });
      G.fx?.burst('purify', _v, { scale: 2 });
      G.fx?.shake?.(0.4, 0.5);
      for (const c of n.children) if (!c.dead) C.kill(c, 'purify');
      n.children.clear();
      clearNest(n, true);
      n.done = true;
    },
  };

  return {
    camps, nests, waves, spawnWave,
    update(dt) {
      // brambles withering away
      for (const n of nests) for (let i = n.brambles.length - 1; i >= 0; i--) {
        const b = n.brambles[i];
        if (b.wither > 0) {
          b.wither += dt;
          const k = clamp(b.wither / 0.8);
          b.mesh.scale.setScalar(Math.max(0.01, 1 - k));
          b.mesh.position.y -= dt * 0.8;
          if (k >= 1) { b.mesh.parent?.remove(b.mesh); n.brambles.splice(i, 1); }
        }
      }
      acc -= dt;
      if (acc > 0) return;
      acc = 0.5;
      const P = G.player;
      if (!P || !P.pos) return;
      const now = G.time.t;
      for (const c of camps) {
        for (const e of c.alive) if (e.dead) c.alive.delete(e);
        const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z);
        if (c.spawned && c.alive.size === 0) { c.spawned = false; c.clearedAt = now; }
        if (!c.spawned && d < SPAWN_R && now - c.clearedAt > c.respawn && C.campsEnabled) spawnCamp(c);
        else if (c.spawned && d > DESPAWN_R) despawnCamp(c);
      }
      for (const n of nests) {
        if (n.done || G.state?.defeated?.[n.id]) { if (n.built) clearNest(n); n.done = true; continue; }
        const d = Math.hypot(P.pos.x - n.x, P.pos.z - n.z);
        if (!n.built && d < 90 && C.nestsEnabled) buildNest(n);
        else if (n.built && d > 140) clearNest(n);
      }
    },
    clear() {
      for (const c of camps) { despawnCamp(c); c.clearedAt = -1e9; }
      for (const n of nests) { if (n.built) clearNest(n); n.done = false; }
      for (const w of waves.slice()) { w.done = true; w.resolve?.(); }
      waves.length = 0;
    },
    onKilled(e) {
      if (e.camp) e.camp.alive.delete(e);
      if (e.wave) check(e.wave);
    },
    nestById(id) { return nests.find((n) => n.id === id) || null; },
  };
}

// ---- meshes ----------------------------------------------------------------------------------------------------------
let _bGeos = null, _bMat = null;
function brambleMat() {
  if (!_bMat) _bMat = toon(0x2c1636, { emissive: 0x12061c });
  return _bMat;
}
/** Three thorny arc variants: a tube from one foot up over and down, with thorns along it (merged). */
function brambleGeos() {
  if (_bGeos) return _bGeos;
  _bGeos = [];
  const rng = mulberry32(77);
  for (let v = 0; v < 3; v++) {
    const pts = [];
    const span = 1.15 + v * 0.18, h = 2.2 + v * 0.35;
    for (let i = 0; i <= 8; i++) {
      const u = i / 8, a = -span / 2 + span * u;
      const r = 2.6 + Math.sin(u * Math.PI * 2 + v) * 0.25;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(u * Math.PI) * h + (rng() - 0.5) * 0.2, -Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const parts = [new THREE.TubeGeometry(curve, 28, 0.13, 6, false)];
    for (let i = 0; i < 16; i++) {
      const u = 0.06 + 0.88 * (i / 15);
      const p = curve.getPointAt(u), tg = curve.getTangentAt(u);
      const thorn = new THREE.ConeGeometry(0.06, 0.34, 4);
      const side = new THREE.Vector3(rng() - 0.5, rng() - 0.3, rng() - 0.5).cross(tg).normalize();
      thorn.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), side));
      thorn.translate(p.x + side.x * 0.15, p.y + side.y * 0.15, p.z + side.z * 0.15);
      parts.push(thorn);
    }
    // a second thinner strand twined around
    const pts2 = pts.map((p, i) => p.clone().add(new THREE.Vector3(Math.sin(i * 1.7) * 0.22, Math.cos(i * 1.3) * 0.18, Math.cos(i * 1.7) * 0.22)));
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 24, 0.06, 5, false));
    const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()), false);
    merged.computeVertexNormals();
    _bGeos.push(merged);
  }
  return _bGeos;
}
let _nGeo = null;
/** The nest's core: a dark husk of cracked shards around a slowly turning violet heart. */
function makeNestMesh() {
  if (!_nGeo) {
    const shards = [];
    const rng = mulberry32(5);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      const g = new THREE.ConeGeometry(0.32, 1.6 + rng() * 0.7, 5);
      g.translate(0, 0.8, 0);
      g.rotateZ(-0.55 - rng() * 0.25);
      g.rotateY(a);
      shards.push(g.toNonIndexed());
    }
    _nGeo = { husk: mergeGeometries(shards, false), heart: new THREE.IcosahedronGeometry(0.62, 1), inner: new THREE.IcosahedronGeometry(0.38, 0) };
    _nGeo.husk.computeVertexNormals();
  }
  const g = new THREE.Group();
  const husk = new THREE.Mesh(_nGeo.husk, toon(PAL.shadeDeep, { emissive: 0x1a0830 }));
  husk.position.y = 0.1;
  const heart = new THREE.Mesh(_nGeo.heart, glow(0x8a3cff, 2.4));
  heart.position.y = 1.25;
  const inner = new THREE.Mesh(_nGeo.inner, glow(0xff5ab8, 3));
  inner.position.y = 1.25;
  husk.castShadow = true;
  g.add(husk, heart, inner);
  g.userData.core = heart;
  return g;
}
