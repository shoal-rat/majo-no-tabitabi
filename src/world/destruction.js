// destruction — magic leaves its mark on the land (terrain agent). G.destruction.
//
// Listens to what spells already announce ('element:applied', 'spell:meteor', 'physics:impact') and decides, per
// element, what each blast does to the world. No spell code is touched: everything happens through G.world.deform
// (persistent stamps in the save), G.terrain.scorch (fading marks), G.flora (trees fall / burn / rocks crack; the wreck
// is persisted here), G.props.debris (pooled clods, stones and splinters) and G.fx / G.audio for the feel.
//
//   fire    bolt: a scorched star, a few sods thrown; charged blast: a scorched pit, clods and stones, trees beside it fall
//   thunder strike: a small blackened pit with forked burn streaks; the great strike: a deeper one
//   earth   rock pillar: the ground heaves into a low rocky mound that stays; meteor: rim of flying earth and stone, dust
//   sun     beam: a burnt line where it sweeps; a sun burst: a glassy scorched pit
//   wind    a tornado that lingers strips the grass and flowers bare (they grow back) and topples small trees
//   ice     frost bloom (elements) + ice shards; freezes crater ponds (ponds.js)
//   water   mud in bare earth (terrain shader) and fills crater ponds
// Story places never change (G.world.carveGuard): the city, the hometown, Fran's cottage and practice ground, the
// farewell hill and every story anchor. Walls of every pit slump to a slope she can walk out of (ground.js STAMP_SLUMP).
import * as THREE from 'three';
import { G as GG } from '../core/game.js';
import { clamp } from '../core/util.js';
import { flat } from '../core/mats.js';
import { createPonds } from './destruction-ponds.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Color();
const TAU = Math.PI * 2;
const rand = Math.random;

// how deep repeated blasts may drill one spot (metres below the land as it grew) and how high earth may heap
const CAP_DEPTH = { fire: 2.6, thunder: 2.2, sun: 2.6, earth: 3.2 };
const CAP_MOUND = 2.2;
// debris budget: pieces per second shared by every blast (the props pool holds 140 for everything)
const DEBRIS_PER_S = 46;
// persisted flora wreck records
const WRECK_CAP = 420;
// burnt ground: the scorch channel fades linearly over BURN_FADE s (terrain/textures.js FADE.burn); marks are kept in
// 4 m cells so a reload paints them back at the strength they had (≤ BURN_CAP saved, dropped once faded)
const BURN_FADE = 360, BURN_CELL = 4, BURN_CAP = 300;
// a crater's floor: bare for GREEN_START s, then grass reclaims it to (1 - GREEN_LEFT) density by GREEN_START + GREEN_SPAN
const GREEN_START = 600, GREEN_SPAN = 1800, GREEN_LEFT = 0.35;
// an earth heave is this exact stamp (r, rim 0, amount > 0): its broken rock comes back with it after a load
const HEAVE_R = 3.6;
const REMNANT_CAP = 48, REMNANT_PIECES = 4;

const SOIL = {
  sun: [0x6e5038, 0x7d5d40, 0x5a4330, 0x8a6a48],
  dusk: [0x7a5a3a, 0x8a6440, 0x63462e, 0x96704a],
  night: [0x3f4256, 0x4a4a5e, 0x35384a, 0x55566c],
};
const SOD = { sun: 0x5d8a3a, dusk: 0x9a8a3a, night: 0x2f5a5a };
const STONE = { sun: [0x9a99a2, 0x86848e, 0xa9a7ae], dusk: [0x8a7a80, 0x9a8a88, 0x7a6c70], night: [0x4c4f66, 0x5a5d74, 0x41445a] };

export const destructionSystem = {
  name: 'destruction',
  pausable: true,

  init(G) {
    const queue = [];           // { kind, element, x, y, z, radius, power, team, source }
    const st = {
      carves: 0, marks: 0, debris: 0, felled: 0, stripped: 0, blasts: 0, skipped: 0, thuds: 0,
      budget: DEBRIS_PER_S, seenState: null, restored: false, beamT: 0, beamX: 1e9, beamZ: 1e9,
    };
    const winds = [];           // lingering wind spots (tornadoes): { x, z, t, n }
    const thudT = new WeakMap();
    let ponds = null;
    const q = () => clamp(G.quality?.particles ?? 1, 0.35, 1);
    const W = () => G.world;

    // ---- listen -------------------------------------------------------------------------------------------------
    G.events.on('element:applied', (e) => {
      const p = e?.pos;
      if (!p || !Number.isFinite(p.x) || queue.length > 96) return;
      // the caller may reuse its vector: copy the numbers now. The apply's own options ride along as e.info (elements).
      const info = e.info || e;
      queue.push({ kind: 'el', element: e.element, x: p.x, y: p.y, z: p.z, radius: e.radius || 1, power: e.power ?? 1, team: e.team || 'neutral',
        source: e.source ?? null, noGround: !!info.noGround, heavy: !!info.heavy, aimed: !!info.dir });
    });
    G.events.on('spell:meteor', (e) => {
      const p = e?.pos;
      if (!p) return;
      queue.push({ kind: 'meteor', element: 'earth', x: p.x, y: p.y, z: p.z, radius: 9, power: 2, team: 'player', crater: !!e.crater });
    });
    G.events.on('physics:impact', (e) => {
      try {
        const b = e?.body;
        if (!b || e.other || !(e.speed >= 9) || !(b.mass >= 120) || b.group === 'debris') return;
        const t = G.time?.t ?? 0;
        if (t - (thudT.get(b) ?? -9) < 0.45) return;
        thudT.set(b, t);
        const p = e.pos || b.pos;
        if (p && queue.length < 96) queue.push({ kind: 'thud', element: null, x: p.x, y: p.y, z: p.z, radius: 1.5, power: Math.min(3, e.speed / 9), team: 'neutral' });
      } catch (err) { G.reportError('destruction:impact', err); }
    });
    G.events.on('terrain:deformed', (e) => {
      if (!e || e.kind === 'trialLake') return;
      if (e.kind === 'spell') {
        const k = scarKey(e.x, e.z);
        if (!scarT.has(k)) scarT.set(k, now());
        if (e.amount < 0) noteBurn(e.x, e.z, e.r * 0.85, Math.min(0.85, 0.6 + -e.amount * 0.06));   // terrain.js paints this rim
      }
      G.flora?.grass?.refreshScars?.();
      try { ponds?.onDeform(e); } catch (err) { G.reportError('destruction:ponds', err); }
      try { remnantsOnDeform(e); } catch (err) { G.reportError('destruction:remnants', err); }
    });

    // ---- broken rock left on an earth heave (derived from the persistent heave stamps) ---------------------------------
    const remnants = [];   // { x, z, seed }
    let remMesh = null, remDirty = false;
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
    function remnantMesh() {
      if (remMesh || !G.scene) return remMesh;
      const geo = new THREE.IcosahedronGeometry(1, 0);
      const P = geo.attributes.position;
      // jitter by position (the faces do not share vertices: equal corners must move alike or the rock cracks open)
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const k = 0.78 + 0.42 * Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453 % 1);
        P.setXYZ(i, x * k, y * k * 0.9, z * k);
      }
      geo.computeVertexNormals();
      remMesh = new THREE.InstancedMesh(geo, flat(0xffffff, { surface: 'rock' }), REMNANT_CAP * REMNANT_PIECES);
      remMesh.name = 'destruction:remnants';
      remMesh.castShadow = true; remMesh.receiveShadow = true;
      remMesh.count = 0;
      remMesh.setColorAt(0, _c.set(1, 1, 1));
      G.scene.add(remMesh);
      return remMesh;
    }
    function remnantsOnDeform(e) {
      if (e.kind === 'resetSpell') {
        for (let i = remnants.length - 1; i >= 0; i--) if (Math.hypot(remnants[i].x - e.x, remnants[i].z - e.z) < e.r + 1) { remnants.splice(i, 1); remDirty = true; }
        return;
      }
      if (e.amount > 0.3 && Math.abs(e.r - HEAVE_R) < 1e-3) {
        if (!remnants.some((r) => Math.hypot(r.x - e.x, r.z - e.z) < 1.5)) {
          if (remnants.length >= REMNANT_CAP) remnants.shift();
          remnants.push({ x: e.x, z: e.z, seed: ((Math.round(e.x * 4) * 73856093) ^ (Math.round(e.z * 4) * 19349663)) >>> 0 });
        }
        remDirty = true;
        return;
      }
      if (remnants.some((r) => Math.abs(r.x - e.x) < e.r + 3 && Math.abs(r.z - e.z) < e.r + 3)) remDirty = true;
    }
    function writeRemnants() {
      remDirty = false;
      const M = remnantMesh();
      if (!M) return;
      let n = 0;
      for (const r of remnants) {
        let h = r.seed || 1;
        const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) / 4294967296);
        const L = land(r.x, r.z);
        for (let k = 0; k < REMNANT_PIECES; k++) {
          const big = k === 0;
          const a = rnd() * TAU, d = big ? rnd() * 0.5 : 0.8 + rnd() * 1.1;
          const x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d;
          const sz = big ? 0.75 + rnd() * 0.35 : 0.28 + rnd() * 0.3;
          _q.setFromEuler(_e.set((rnd() - 0.5) * 0.7, rnd() * TAU, (rnd() - 0.5) * 0.7));
          _m.compose(_p.set(x, W().heightAt(x, z) + sz * (big ? 0.25 : 0.1), z), _q, _s.set(sz * (0.8 + rnd() * 0.3), sz * (big ? 1.25 : 0.7), sz));
          M.setMatrixAt(n, _m);
          _c.setHex(STONE[L][(k + (r.seed & 3)) % 3]).multiplyScalar(0.85 + rnd() * 0.2);
          M.setColorAt(n, _c);
          n++;
        }
      }
      M.count = n;
      M.instanceMatrix.needsUpdate = true;
      if (M.instanceColor) M.instanceColor.needsUpdate = true;
      M.computeBoundingSphere?.();
    }
    G.events.on('terrain:scorch', (e) => { if (e?.kind === 'burn' && Number.isFinite(e.x)) noteBurn(e.x, e.z, e.r || 2, e.strength ?? 1); });
    G.events.on('save:collect', (state) => {
      try {
        if (!state) return;
        const rec = G.flora?.wreck?.records?.(WRECK_CAP);
        const prev = state.destruction && typeof state.destruction === 'object' ? state.destruction : {};
        const keep = Array.isArray(rec) ? rec : (prev.v === 2 && Array.isArray(prev.flora) ? prev.flora : []);
        state.destruction = { v: 2, flora: keep, burns: saveBurns(), scarT: saveScarTimes(state.spellScars) };
      } catch (err) { G.reportError('destruction:save', err); }
    });

    // ---- burnt ground that heals: remembered per 4 m cell, painted back on load at the strength it had --------------
    const now = () => G.state?.playTime ?? G.time?.t ?? 0;
    const burns = new Map();   // 'ix,iz' -> { x, z, r, s, t }
    const left = (b, t) => b.s - (t - b.t) / BURN_FADE;
    function noteBurn(x, z, r, strength) {
      const t = now(), k = Math.round(x / BURN_CELL) + ',' + Math.round(z / BURN_CELL);
      const b = burns.get(k);
      if (b) { b.s = Math.min(1, Math.max(left(b, t), strength)); b.t = t; b.r = Math.max(b.r, r); return; }
      if (burns.size > 900) pruneBurns(t, true);
      burns.set(k, { x, z, r, s: Math.min(1, strength), t });
    }
    function pruneBurns(t, hard) {
      for (const [k, b] of burns) if (left(b, t) <= 0.03) burns.delete(k);
      if (hard && burns.size > 900) { const old = [...burns.entries()].sort((a, b) => a[1].t - b[1].t); for (let i = 0; i < old.length - 600; i++) burns.delete(old[i][0]); }
    }
    function saveBurns() {
      const t = now();
      pruneBurns(t, false);
      const list = [...burns.values()].sort((a, b) => b.t - a.t).slice(0, BURN_CAP);
      const out = [];
      for (const b of list) out.push(Math.round(b.x * 10), Math.round(b.z * 10), Math.round(b.r * 10), Math.round(left(b, t) * 100), Math.round(t));
      return out;
    }
    function loadBurns(list) {
      burns.clear();
      if (!Array.isArray(list)) return 0;
      const t = now();
      let n = 0;
      for (let k = 0; k + 4 < list.length; k += 5) {
        const x = list[k] / 10, z = list[k + 1] / 10, r = list[k + 2] / 10, s0 = list[k + 3] / 100, t0 = Math.min(list[k + 4], t);
        if (![x, z, r, s0, t0].every(Number.isFinite) || r <= 0 || r > 40) continue;
        const s = s0 - (t - t0) / BURN_FADE;
        if (s <= 0.03) continue;
        G.terrain?.scorch?.(x, z, r, 'burn', s);
        burns.set(Math.round(x / BURN_CELL) + ',' + Math.round(z / BURN_CELL), { x, z, r, s, t });
        // what still lies bare under it stays bare, and grows back on the same clock (edges first)
        G.flora?.removeInRadius?.(x, z, r, { plantsOnly: true, regrow: Math.max(4, s * BURN_FADE - 210), spread: 180 * Math.min(1, s) });
        n++;
      }
      return n;
    }

    // ---- when each crater was dug (its floor greens over slowly); unknown (older saves) = long ago -------------------
    const scarT = new Map();   // 'x·4,z·4' -> playTime
    const scarKey = (x, z) => Math.round(x * 4) + ',' + Math.round(z * 4);
    function saveScarTimes(stamps) {
      const out = [];
      if (!Array.isArray(stamps)) return out;
      const seen = new Set();
      for (const s of stamps) {
        const k = scarKey(s[0], s[1]);
        if (seen.has(k) || !scarT.has(k)) continue;
        seen.add(k);
        out.push(Math.round(s[0] * 4), Math.round(s[1] * 4), Math.round(scarT.get(k)));
      }
      return out;
    }
    function loadScarTimes(list) {
      scarT.clear();
      if (!Array.isArray(list)) return;
      for (let k = 0; k + 2 < list.length; k += 3) if (list.slice(k, k + 3).every(Number.isFinite)) scarT.set(list[k] + ',' + list[k + 1], list[k + 2]);
    }

    // ---- helpers ----------------------------------------------------------------------------------------------------
    function land(x, z) {
      const v = W().veilAt?.(x, z) ?? 0;
      return v > 0.82 ? 'night' : v > 0.1 ? 'dusk' : 'sun';
    }
    const pick = (a) => a[(rand() * a.length) | 0];
    /** Distance attenuation of feedback (camera shake, rumble) from the camera. */
    function nearK(x, y, z, far = 60) {
      const c = G.camera?.position;
      if (!c) return 1;
      return clamp(1 - (Math.hypot(c.x - x, c.y - y, c.z - z) - 8) / far, 0, 1);
    }
    function spend(n) {
      const k = Math.min(n, Math.floor(st.budget));
      st.budget -= k;
      return k;
    }
    /** Earth thrown out of a blast: n pieces (before quality), sods on top, stones among them. */
    function throwEarth(x, y, z, n, { speed = 7, up = 7, stones = 0.25, sods = 0.25, size = 1, spread = 1 } = {}) {
      const deb = G.props?.debris;
      if (!deb) return 0;
      const m = spend(Math.round(n * q()));
      const L = land(x, z);
      for (let k = 0; k < m; k++) {
        const a = rand() * TAU, s = speed * (0.45 + rand() * 0.75);
        const r0 = spread * (0.4 + rand() * 1.2);
        _v.set(x + Math.cos(a) * r0, y + 0.35 + rand() * 0.5, z + Math.sin(a) * r0);
        _w.set(Math.cos(a) * s, up * (0.55 + rand() * 0.7), Math.sin(a) * s);
        const roll = rand();
        if (roll < stones) deb('rock', _v, _w, { color: pick(STONE[L]), scale: size * (0.6 + rand() * 0.9), life: 4.5 + rand() * 3 });
        else deb('clod', _v, _w, { color: roll < stones + sods ? SOD[L] : pick(SOIL[L]), scale: size * (0.55 + rand() * 0.8), life: 3.5 + rand() * 2.5 });
      }
      st.debris += m;
      return m;
    }
    /** A ragged burnt star around (x, z): `rays` streaks of small marks reaching `reach` metres. */
    function scorchStar(x, z, core, reach, rays, strength = 1, jag = 0.35, kind = 'burn') {
      const T = G.terrain;
      if (!T?.scorch) return;
      T.scorch(x, z, core, kind, strength);
      if (kind === 'burn') noteBurn(x, z, core + reach * 0.5, strength * 0.85);
      const a0 = rand() * TAU;
      for (let i = 0; i < rays; i++) {
        let a = a0 + (i / rays) * TAU + (rand() - 0.5) * 0.5;
        let px = x, pz = z;
        const steps = 2 + ((reach / 1.8) | 0);
        const len = reach * (0.6 + rand() * 0.5);
        for (let k = 1; k <= steps; k++) {
          a += (rand() - 0.5) * jag * 2;
          const d = len / steps;
          px += Math.cos(a) * d; pz += Math.sin(a) * d;
          T.scorch(px, pz, Math.max(0.7, core * 0.42 * (1 - k / (steps + 1))), kind, strength * (1 - 0.3 * k / steps));
        }
      }
      st.marks++;
    }
    /** Carve (amount < 0) or heap (amount > 0) through the persistent stamps, with per-spot limits. */
    function carve(x, z, r, amount, rim, cap) {
      const w = W();
      if (!w?.deform) return null;
      const guard = w.carveGuard?.(x, z) ?? w.protectionAt?.(x, z) ?? 0;
      if (guard >= 0.999) return null;
      const off = w.deformOffsetAt?.(x, z) ?? 0;
      if (amount < 0) { const room = cap + off; if (room <= 0.06) return null; amount = Math.max(amount, -room); }
      else { const room = cap - off; if (room <= 0.06) return null; amount = Math.min(amount, room); }
      // quantised so repeats at one spot merge into one stamp in the save
      x = Math.round(x * 4) / 4; z = Math.round(z * 4) / 4;
      r = Math.round(r * 20) / 20; amount = Math.round(amount * 100) / 100;
      if (Math.abs(amount) < 0.06) return null;
      const res = w.deform(x, z, r, amount, { rim, source: 'destruction' });
      if (res) st.carves++;
      return res;
    }
    function rumble(x, y, z, vol, pitch = 0.8, name = 'rock_fall') {
      if (!(vol > 0.03)) return;   // out of earshot (a zero volume upsets the mixer)
      G.audio?.sfx?.(name, { pos: _v.set(x, y, z), vol: Math.min(1.4, vol), pitch });
    }
    function shake(x, y, z, amount, dur = 0.35, far = 60) {
      const k = nearK(x, y, z, far);
      if (k > 0.02) G.fx?.shake?.(amount * k, dur);
    }
    /** Rocks in reach take a blow (they crack, then burst; G.flora.wreck persists both). */
    function bruiseRocks(x, z, r, element, power, info) {
      const wr = G.flora?.wreck;
      if (!wr?.rocksNear) return;
      for (const i of wr.rocksNear(x, z, r)) wr.bruise(i, element, power, info);
    }
    /** Trees right beside a blast are thrown down away from it (stumps stay, persisted). */
    function topple(x, z, r, opts) {
      const F = G.flora;
      if (!F?.treesNear || !F.fell) return 0;
      _v.set(x, 0, z);
      let n = 0;
      for (const t of F.treesNear(_v, r)) {
        if ((W().carveGuard?.(t.pos.x, t.pos.z) ?? 0) >= 0.999) continue;
        if (opts?.maxH && t.height > opts.maxH) continue;
        _w.set(t.pos.x - x, 0, t.pos.z - z);
        if (opts?.swirl) _w.set(-_w.z, 0, _w.x).addScaledVector(_v.set(t.pos.x - x, 0, t.pos.z - z), 0.4);
        if (F.fell(t.id, _w)) { n++; st.felled++; }
        if (opts?.max && n >= opts.max) break;
      }
      return n;
    }
    function where(e) {
      const w = W();
      const h = w.heightAt(e.x, e.z);
      const top = w.groundAt ? w.groundAt(e.x, e.z, e.y + 1.2) : h;
      return { h, top, platform: top > h + 0.35, water: h < (w.seaLevel ?? 0) + 0.15, agl: e.y - Math.max(h, top) };
    }

    // ---- the rules ------------------------------------------------------------------------------------------------
    function onFire(e, g) {
      ponds?.thaw(e.x, e.z, e.radius);
      const big = e.radius >= 5.5 && e.power >= 1.15;
      if (big) {
        const k = clamp(e.power / 1.4, 0.7, 1.5);
        st.blasts++;
        carve(e.x, e.z, 2.5 + 0.35 * k, -0.85 * k, 0.4, CAP_DEPTH.fire);
        scorchStar(e.x, e.z, 3.6, 6.5, 8, 1, 0.3);
        throwEarth(e.x, g.h, e.z, 12, { speed: 8, up: 8, stones: 0.2, sods: 0.3, spread: 1.6 });
        G.fx?.burst?.('dust', _v.set(e.x, g.h + 0.5, e.z), { scale: 2.2 });
        topple(e.x, e.z, 3.2);
        bruiseRocks(e.x, e.z, 5, 'fire', e.power, { blast: true });
        rumble(e.x, g.h, e.z, 0.7 * nearK(e.x, g.h, e.z), 0.75, 'rock_crumble');
        G.flora?.grass?.clear?.(e.x, e.z, 4.2, 160);
      } else if (e.radius >= 2.4 && e.power >= 0.75) {
        scorchStar(e.x, e.z, 1.5, 2.6, 5, 0.85, 0.45);
        throwEarth(e.x, g.h, e.z, 3, { speed: 4, up: 5, stones: 0, sods: 0.5, size: 0.8, spread: 0.6 });
        G.flora?.grass?.clear?.(e.x, e.z, 1.6, 120);
      }
    }
    function onThunder(e, g) {
      const great = e.radius >= 3.8 && e.power >= 1.5;
      st.blasts++;
      if (great) {
        carve(e.x, e.z, 2.4, -1.3, 0.42, CAP_DEPTH.thunder);
        scorchStar(e.x, e.z, 2.6, 6, 6, 1, 0.75);
        throwEarth(e.x, g.h, e.z, 9, { speed: 7, up: 9, stones: 0.3, sods: 0.25, spread: 1.2 });
        bruiseRocks(e.x, e.z, 4.5, 'thunder', e.power, { split: true });
        rumble(e.x, g.h, e.z, 0.8 * nearK(e.x, g.h, e.z), 0.65);
      } else {
        carve(e.x, e.z, 1.6, -0.6, 0.45, CAP_DEPTH.thunder);
        scorchStar(e.x, e.z, 1.6, 3.4, 4, 0.95, 0.8);
        throwEarth(e.x, g.h, e.z, 4, { speed: 5, up: 7, stones: 0.25, sods: 0.3, size: 0.8, spread: 0.6 });
        bruiseRocks(e.x, e.z, 2.8, 'thunder', e.power, { split: true });
      }
      G.flora?.grass?.clear?.(e.x, e.z, great ? 3 : 1.5, 140);
    }
    function onEarth(e, g) {
      // a rock pillar thrusting up (apply at the ground + ~1 m, radius ~2.8): the ground heaves around its foot
      if (e.radius >= 2 && e.radius <= 4.2 && g.agl > -0.5 && g.agl < 2.2 && e.team !== 'enemy' && (e.heavy || !e.noGround)) {
        st.blasts++;
        carve(e.x, e.z, 3.6, 1.1, 0, CAP_MOUND);
        throwEarth(e.x, g.h, e.z, 6, { speed: 5, up: 6, stones: 0.45, sods: 0.25, spread: 2.2 });
        bruiseRocks(e.x, e.z, 3.6, 'earth', e.power, null);
      }
    }
    function onMeteor(e) {
      const w = W(), h = w.heightAt(e.x, e.z);
      st.blasts++;
      // the meteor dug its own crater (spells/entities.js): throw its earth, raise the dust, crack what stands near
      throwEarth(e.x, h, e.z, 26, { speed: 11, up: 12, stones: 0.35, sods: 0.25, size: 1.25, spread: 4 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + rand() * 0.5, d = 9 + rand() * 3;
        const x = e.x + Math.cos(a) * d, z = e.z + Math.sin(a) * d;
        G.fx?.burst?.('dust', _v.set(x, w.heightAt(x, z) + 0.6, z), { scale: 2.4 });
      }
      scorchStar(e.x, e.z, 7.5, 13, 10, 1, 0.3);
      bruiseRocks(e.x, e.z, 14, 'earth', 2.5, { heavy: true });
      topple(e.x, e.z, 17, { maxH: 30 });
      rumble(e.x, h, e.z, 1.1 * nearK(e.x, h, e.z, 90), 0.55);
      shake(e.x, h, e.z, 0.35, 0.8, 90);
    }
    function onSun(e, g) {
      if (e.power >= 1.5) ponds?.thaw(e.x, e.z, e.radius);
      if (e.radius >= 4 && e.power >= 2.2) {
        st.blasts++;
        carve(e.x, e.z, clamp(e.radius * 0.32, 1.6, 3.4), -1.0, 0.32, CAP_DEPTH.sun);
        scorchStar(e.x, e.z, clamp(e.radius * 0.55, 2.5, 6), clamp(e.radius * 0.9, 4, 10), 9, 1, 0.25);
        throwEarth(e.x, g.h, e.z, 8, { speed: 8, up: 8, stones: 0.25, sods: 0.2, spread: 1.5 });
        bruiseRocks(e.x, e.z, e.radius * 0.6, 'sun', e.power, null);
        G.flora?.grass?.clear?.(e.x, e.z, clamp(e.radius * 0.6, 2, 6), 180);
      } else if (e.radius >= 1.6 && e.radius <= 3 && e.power < 2) {
        // the beam's burning spot: a line of burnt ground where it sweeps
        const t = G.time?.t ?? 0;
        if (t - st.beamT < 0.07 && Math.hypot(e.x - st.beamX, e.z - st.beamZ) < 0.8) return;
        st.beamT = t; st.beamX = e.x; st.beamZ = e.z;
        G.terrain?.scorch?.(e.x, e.z, 1.15, 'burn', 0.9);
        noteBurn(e.x, e.z, 1.15, 0.9);
        G.flora?.grass?.clear?.(e.x, e.z, 1.1, 150);
        if (rand() < 0.25) throwEarth(e.x, g.h, e.z, 1, { speed: 2, up: 3, stones: 0, sods: 0.6, size: 0.6, spread: 0.3 });
      }
    }
    function onIce(e, g) {
      ponds?.freeze(e.x, e.z, e.radius + 1);
      if (e.radius >= 6 && e.power >= 1.5) {
        const deb = G.props?.debris;
        if (deb) {
          const m = spend(Math.round(8 * q()));
          for (let k = 0; k < m; k++) {
            const a = rand() * TAU, s = 3 + rand() * 4;
            _v.set(e.x + Math.cos(a) * 1.5, g.h + 0.6, e.z + Math.sin(a) * 1.5);
            _w.set(Math.cos(a) * s, 4 + rand() * 4, Math.sin(a) * s);
            deb('shard', _v, _w, { color: k % 2 ? 0xd8f4ff : 0x9fd8ff, scale: 1.4 + rand() * 1.2, life: 3 + rand() * 2, material: 'ice' });
          }
          st.debris += m;
        }
        G.terrain?.scorch?.(e.x, e.z, e.radius * 1.15, 'frost', 1);
      }
    }
    function onWater(e) {
      ponds?.fill(e.x, e.z, e.radius, e.power);
    }
    function onWind(e, g) {
      // a wind that keeps blowing on one spot (the tornado ticks every ~0.8 s) strips it bare; an aimed gust does not
      if (e.aimed) return;
      const t = G.time?.t ?? 0;
      let spot = null;
      for (const s of winds) if (t - s.t < 1.5 && Math.hypot(s.x - e.x, s.z - e.z) < 3) { spot = s; break; }
      if (!spot) { if (winds.length > 8) winds.shift(); spot = { x: e.x, z: e.z, t, n: 0 }; winds.push(spot); }
      spot.t = t; spot.n++; spot.x += (e.x - spot.x) * 0.5; spot.z += (e.z - spot.z) * 0.5;
      if (spot.n < 2 || e.team === 'enemy') return;
      const R = clamp(e.radius, 3, 8);
      G.flora?.grass?.clear?.(e.x, e.z, R * 1.05, 70);
      G.flora?.removeInRadius?.(e.x, e.z, R * 0.85, { plantsOnly: true, regrow: 140 });
      st.stripped++;
      throwEarth(e.x, g.h, e.z, 2, { speed: 3, up: 10, stones: 0, sods: 0.8, size: 0.7, spread: R * 0.6 });
      if (spot.n >= 4 && spot.n % 2 === 0) topple(e.x, e.z, R * 0.95, { maxH: 11, max: 1, swirl: true });
    }
    function onThud(e) {
      const w = W(), h = w.heightAt(e.x, e.z);
      if (e.y - h > 1.6) return;
      st.thuds++;
      G.fx?.burst?.('dust', _v.set(e.x, h + 0.2, e.z), { scale: 0.8 + e.power * 0.4 });
      throwEarth(e.x, h, e.z, 2, { speed: 2.5, up: 3.5, stones: 0, sods: 0.4, size: 0.7, spread: 0.4 });
    }

    function handle(e) {
      if (e.kind === 'meteor') { onMeteor(e); return; }
      if (e.kind === 'thud') { onThud(e); return; }
      // the rock pillar's own blow is a heavy, ground-less earth apply: it is exactly what heaves the ground
      if (e.noGround && !(e.element === 'earth' && e.heavy)) { if (e.element === 'ice') ponds?.freeze(e.x, e.z, e.radius + 1); return; }
      const g = where(e);
      if (g.water) { if (e.element === 'ice') ponds?.freeze(e.x, e.z, e.radius + 1); return; }
      // high above the ground (a hit in the air or on a crown) or on a deck / roof / bridge: the land stays
      if (g.platform || g.agl > e.radius * 0.5 + 1.8) { if (e.element === 'water') onWater(e); return; }
      if ((W().carveGuard?.(e.x, e.z) ?? 0) >= 0.999) { st.skipped++; return; }
      if (e.team === 'enemy' && e.element !== 'wind') {
        // enemy magic scuffs, but never reshapes or wrecks
        if (e.radius >= 3 && e.power >= 1.2) throwEarth(e.x, g.h, e.z, 3, { speed: 4, up: 5, stones: 0.2, sods: 0.3, size: 0.8 });
        return;
      }
      switch (e.element) {
        case 'fire': onFire(e, g); break;
        case 'thunder': onThunder(e, g); break;
        case 'earth': onEarth(e, g); break;
        case 'sun': onSun(e, g); break;
        case 'ice': onIce(e, g); break;
        case 'water': onWater(e, g); break;
        case 'wind': onWind(e, g); break;
      }
    }

    /** One frame's events: a meteor swallows the fire / earth applies it made at the same spot; same-element blasts
     *  within 1.5 m merge into the strongest. */
    const batch = [];
    function drain() {
      batch.length = 0;
      for (const e of queue) {
        if (e.kind === 'meteor') {
          for (let i = batch.length - 1; i >= 0; i--) { const b = batch[i]; if (b.kind === 'el' && Math.hypot(b.x - e.x, b.z - e.z) < 3 && b.radius >= 6) batch.splice(i, 1); }
          batch.push(e); continue;
        }
        if (e.kind === 'el') {
          if (e.element === 'earth' && e.radius >= 8) continue;   // the meteor's own apply: handled by 'spell:meteor'
          if (e.element === 'fire' && batch.some((b) => b.kind === 'meteor' && Math.hypot(b.x - e.x, b.z - e.z) < 3)) continue;
          const twin = e.element !== 'wind' && e.element !== 'sun' && batch.find((b) => b.kind === 'el' && b.element === e.element && Math.hypot(b.x - e.x, b.z - e.z) < 1.5);
          if (twin) { if (e.radius * e.power > twin.radius * twin.power) Object.assign(twin, e); continue; }
        }
        batch.push(e);
      }
      queue.length = 0;
      for (const e of batch) {
        try { handle(e); } catch (err) { G.reportError('destruction:' + (e.element || e.kind), err); }
      }
    }

    // ---- persistence: flora wreck in G.state.destruction (terrain stamps live in G.state.spellScars) ---------------
    function resync() {
      const wr = G.flora?.wreck;
      if (!wr) return false;
      if (st.restored) wr.reset();
      const D = G.state?.destruction || {};
      loadScarTimes(D.scarT);
      const n = Array.isArray(D.flora) ? wr.apply(D.flora, D.v === 2 ? 4 : 3) : 0;
      st.lastBurns = loadBurns(D.burns);
      G.flora?.grass?.refreshScars?.();
      st.restored = true;
      st.lastRestore = n;
      return true;
    }

    // ---- grass: the persistent bare ground nearest the camera -------------------------------------------------------
    const feedTmp = [];
    function scarFeed(cx, cz, out) {
      const list = W().spellScarList?.();
      if (!list) return 0;
      feedTmp.length = 0;
      const tNow = now();
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        const d = Math.hypot(s[0] - cx, s[1] - cz);
        if (d > 170) continue;
        const A = Math.abs(s[3]);
        // bare where the bowl is deeper than ~0.3 m (craters) or the heap taller than ~0.6 m (rocky mounds)
        const thr = s[3] < 0 ? 0.25 : 0.6;
        if (A <= thr) continue;
        // the grass shader clears fully inside 0.75 r and thins out to 1.08 r: put the full clear where the earth shows
        const rb = s[2] * Math.sqrt(Math.max(0, 1 - Math.sqrt(thr / A))) / 0.78 + 0.3;
        // the floor greens over: bare for GREEN_START, then the grass takes it back to GREEN_LEFT bareness
        const t0 = scarT.get(scarKey(s[0], s[1]));
        const g = t0 === undefined ? 1 : clamp((tNow - t0 - GREEN_START) / GREEN_SPAN, 0, 1);
        const k = 1 - (1 - GREEN_LEFT) * g, rr = rb * (1 - 0.2 * g);
        let dup = false;
        for (const f of feedTmp) if (Math.abs(f.x - s[0]) < 0.6 && Math.abs(f.z - s[1]) < 0.6) { f.r = Math.max(f.r, rr); f.k = Math.max(f.k, k); dup = true; break; }
        if (!dup) feedTmp.push({ x: s[0], z: s[1], r: rr, d, k });
        if (feedTmp.length > 64) break;
      }
      feedTmp.sort((a, b) => a.d - b.d);
      const n = Math.min(feedTmp.length, 12);
      out.length = n;
      for (let i = 0; i < n; i++) { const f = feedTmp[i]; out[i] = out[i] || { x: 0, z: 0, r: 0, k: 1 }; out[i].x = f.x; out[i].z = f.z; out[i].r = f.r; out[i].k = f.k; }
      return n;
    }

    // ---- public API ----------------------------------------------------------------------------------------------------
    G.destruction = {
      /** Queue a blast as if a spell had applied `element` there (tests, scripted scenes). */
      blast(element, pos, radius = 3, power = 1, opts = {}) {
        if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z) || queue.length > 96) return false;
        queue.push({ kind: 'el', element, x: pos.x, y: pos.y ?? W().heightAt(pos.x, pos.z) + 0.5, z: pos.z, radius, power, team: opts.team || 'player', source: opts.source ?? null, noGround: false, heavy: !!opts.heavy });
        return true;
      },
      /** Carve / heap the ground with the destruction rules (story guard, depth caps, quantised stamps). */
      carve: (x, z, r, amount, rim = 0.3, cap = 3) => carve(x, z, r, amount, rim, cap),
      /** Throw n pieces of earth from (x, y, z). */
      throwEarth: (x, y, z, n, opts) => throwEarth(x, y, z, n, opts),
      /** True where magic may reshape the land. */
      canCarve: (x, z) => (W().carveGuard?.(x, z) ?? 0) < 0.999,
      get ponds() { return ponds; },
      /** Remembered burnt cells: [{ x, z, r, s, t }] (strength s at playTime t). */
      get burns() { return [...burns.values()]; },
      /** Restoration (craft 溯光): burnt cells within r of (x, z) heal now — the scorch drains to `level` (call it with a
       *  falling level for the animation; 0 drops the records) and the burnt plants and grass come straight back. */
      unburn(x, z, r, level = 0) {
        G.terrain?.unscorch?.(x, z, r, 'burn', level);
        if (level > 0.001) return 0;
        let n = 0;
        for (const [k, b] of burns) if (Math.hypot(b.x - x, b.z - z) < r + b.r * 0.5) { burns.delete(k); n++; }
        G.flora?.grass?.restore?.(x, z, r + 1);
        G.flora?.regrowIn?.(x, z, r + 1, 1.2);
        return n;
      },
      /** Restoration: the crater / heap stamps whose centre lies within r of (x, z), scaled to `k` of their depth (1 =
       *  as dug, 0 = gone: the land as it was, and the stamps leave the save). Returns how many stamps it touched. */
      uncarve(x, z, r, k = 0) {
        const w = W(), list = w.spellScarList?.();
        if (!list || !w.restoreSpellScars) return 0;
        const base = this._uncarve || (this._uncarve = { x: 1e9, z: 1e9, r: 0, src: null });
        // remember the stamps as dug the first time this spot is touched, so each step scales from the original depth
        if (Math.hypot(base.x - x, base.z - z) > 0.5 || base.r !== r || !base.src) {
          base.x = x; base.z = z; base.r = r;
          base.src = list.map((s) => s.slice());
        }
        const near = (s) => Math.hypot(s[0] - x, s[1] - z) < r;
        let n = 0;
        const out = [];
        for (const s of base.src) {
          if (!near(s)) { out.push(s); continue; }
          n++;
          if (k > 0.02) { const c = s.slice(); c[3] = Math.round(s[3] * k * 100) / 100; if (Math.abs(c[3]) >= 0.05) out.push(c); }
        }
        if (!n) return 0;
        w.restoreSpellScars(out);
        if (k <= 0.02) base.src = null;
        G.flora?.grass?.refreshScars?.();
        return n;
      },
      /** playTime a crater at (x, z) was dug, or undefined. */
      scarTime: (x, z) => scarT.get(scarKey(x, z)),
      TIMES: { BURN_FADE, GREEN_START, GREEN_SPAN, GREEN_LEFT },
      /** Broken rock pieces on earth heaves: [{ x, z }] (derived from the heave stamps). */
      get remnants() { return remnants; },
      /** Re-apply the persisted wreck of G.state (called by itself when G.state is replaced by a load / reset). */
      resync,
      stats() {
        const { seenState, ...rest } = st;
        return { ...rest, queue: queue.length, winds: winds.length, scars: W().spellScarList?.().length ?? 0, savedScars: W().saveSpellScars?.().length ?? 0,
          wreck: G.flora?.wreck?.stats?.() ?? null, ponds: ponds?.stats?.() ?? null, burns: burns.size };
      },
    };
    this._drain = drain;
    this._st = st;
    this._resync = resync;
    try { ponds = createPonds(G); } catch (err) { G.reportError('destruction:ponds', err); ponds = null; }
    this._ponds = ponds;
    this._feed = scarFeed;
    this._prune = () => pruneBurns(now(), false);
    this._remnants = () => { if (remDirty) writeRemnants(); };
  },

  start(G) {
    this._st.seenState = null;
  },

  update(dt) {
    const G = GG;
    try {
      const st = this._st;
      st.budget = Math.min(DEBRIS_PER_S, st.budget + DEBRIS_PER_S * Math.max(dt, 0));
      if (G.flora?.grass && G.flora.grass.scarFeed !== this._feed) { G.flora.grass.scarFeed = this._feed; G.flora.grass.refreshScars?.(); }
      // a load / new game replaced G.state: bring the persisted wreck back (after the flora installed its API)
      if (G.state && st.seenState !== G.state && G.flora?.wreck) {
        if (this._resync()) st.seenState = G.state;
      }
      this._drain();
      if ((this._pruneT = (this._pruneT ?? 10) - dt) <= 0) { this._pruneT = 10; this._prune(); }
      this._ponds?.update(dt);
      this._remnants();
    } catch (err) { G.reportError('destruction:update', err); }
  },
};
