// Flora life: colliders, lazy element reactors near the heroine, burning trees, felling, shattering rocks and crystals,
// crystal resonance, removal by craters / burns (plants regrow), springy giant mushroom caps.
// Destruction (terrain agent): trees felled by magic leave stumps, burnt trees stay charred, rocks crack under repeated
// blows and shatter into rubble. All of that is a "wreck" record per instance (G.flora.wreck: records() / apply() /
// reset()) that the destruction system persists in the save, so the forest stays as she left it after a reload.
import * as THREE from 'three';
import { flat, glow as glowMat } from '../../core/mats.js';
import { Batch, buildModelParts } from './batches.js';
import { SPECIES } from './species.js';
import { smoothstep, clamp } from '../../core/util.js';

const REG_R = 52, UNREG_R = 66, MAX_REG = 320;
// wreck bits (persisted): CHARRED burnt black, FELLED fell (a stump stays), GONE shattered / blasted away (rubble for big
// rocks), CRACKED a rock split by blows (darker, one more blow away from breaking)
export const WRECK = { CHARRED: 1, FELLED: 2, GONE: 4, CRACKED: 8 };
const WOODY = /^(log|fallen|stump)/;
// field furniture of the countryside (flora/countryside-species.js) breaks too, each in its own way
const FIELD = { fence: 'wood', haybale: 'straw', drywall: 'stone' };
// how much one hit of each element bruises a rock / a fence / a bale (power-scaled); see hpOf for what they take
const BLOW = {
  stone: { thunder: 0.5, fire: 0.1, earth: 0.45, sun: 0.16, ice: 0.04 },
  wood: { thunder: 0.8, fire: 0.45, earth: 0.6, sun: 0.3, wind: 0.22 },
  straw: { thunder: 1, fire: 1, earth: 0.7, sun: 0.5, wind: 0.35 },
};
// recovery (G.state.playTime seconds, so it pauses with the game and carries on after a reload)
export const RECOVER = {
  CHAR_HOLD: 480, CHAR_SPROUT: 240,   // a charred tree stays black 8 min, then leafs out over 4 min (fully green at 12)
  FELL_HOLD: 1200, FELL_GROW: 600,    // a stump puts up a sapling after 20 min that is full grown 10 min later (30)
  PLANT_BURN: 150, PLANT_SPREAD: 180, // burnt plants come back from the edge at 2.5 min to the heart at 5.5 min …
  PLANT_GROW: [18, 28],               // … each growing in over 18–28 s (all back by about 6 min)
};
const SPROUT = [1.06, 1.16, 0.82];    // young leaves: a little yellower and brighter than the tree's own crown
const SHARDS = {
  stone: { kind: 'rock', cols: null, fx: 'shatter_rock', sfx: 'rock_crumble' },
  wood: { kind: 'plank', cols: [0x8b5a3c, 0xa77b52, 0x6b4a33], fx: 'wood_break', sfx: 'wood_break' },
  straw: { kind: 'sliver', cols: [0xd9b46a, 0xc8a86a, 0xe8cf8a], fx: 'dust', sfx: 'cloth_rustle' },
};
const CHAR0 = [0.05, 0.035, 0.03], CHAR1 = [0.17, 0.14, 0.13];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _ax = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

export function createLife(ctx) {
  const { G, S, species, writeInstance, CH, NC, ORG, chunkNear } = ctx;
  // every hide also drops the instance's bounce pad + cap platform (fix2: pads stay in step with removed mushrooms)
  const padOf = new Map(); // instance id -> pad
  function hideInstance(i) {
    ctx.hideInstance(i);
    const pad = padOf.get(i);
    if (pad) {
      padOf.delete(i);
      const k = bouncePads.indexOf(pad); if (k >= 0) bouncePads.splice(k, 1);
      if (pad.platform) pad.platform.dead = true;
    }
  }
  const W = G.world;
  const isTree = (i) => { const k = species[S.sp[i]].def.kind; return k === 'tree'; };
  const kindOf = (i) => species[S.sp[i]].def.kind;
  const defOf = (i) => species[S.sp[i]].def;
  const modelOf = (i) => species[S.sp[i]].model;
  const isStone = (sp) => (sp.def.kind === 'rock' && !WOODY.test(sp.key)) || sp.def.kind === 'crystal';
  const canBreak = (sp) => !!FIELD[sp.key] || (isStone(sp) && !!(sp.def.breakable || sp.def.solid));
  const stuffOf = (i) => FIELD[species[S.sp[i]].key] || 'stone';
  const guarded = (i) => (W.carveGuard?.(S.x[i], S.z[i]) ?? 0) >= 0.999;
  const now = () => G.state?.playTime ?? G.time?.t ?? 0;
  /** Is the heroine (feet within reach) standing where (x, z) would grow back? Nothing regrows inside her. */
  const herNear = (x, z, r) => { const p = G.player?.pos; return !!p && Math.hypot(p.x - x, p.z - z) < r; };
  /** Camera shake that fades with distance (a tree falling 80 m away should not jolt the view). */
  const shakeAt = (p, amount, dur) => {
    const c = G.camera?.position;
    const k = c ? clamp(1 - (Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) - 10) / 50, 0, 1) : 1;
    if (k > 0.02) G.fx?.shake?.(amount * k, dur);
  };

  // slot -> instance per species (to walk a chunk's range)
  for (const sp of species) sp.inst = new Int32Array(sp.n);
  for (let i = 0; i < S.n; i++) species[S.sp[i]].inst[S.slot[i]] = i;

  // ---- colliders, platforms on mushroom caps, bounce pads
  const colliders = new Map(); // i -> collider
  const bouncePads = [];
  let nCol = 0;
  for (let i = 0; i < S.n; i++) {
    const sp = species[S.sp[i]], d = sp.def, m = sp.model, s = S.s[i];
    const x = S.x[i], y = S.y[i], z = S.z[i];
    if (d.kind === 'tree' || d.kind === 'shroom') {
      const r = (d.trunkR || 0.3) * s;
      const top = y + m.height * s;
      if (d.kind === 'shroom') {
        const capY = y + m.box.max.y * s;
        const capR = Math.min(m.box.max.x - m.box.min.x, m.box.max.z - m.box.min.z) * 0.5 * s;
        colliders.set(i, W.addCollider({ x, z, r, y0: y - 1, y1: capY - 1.2, tag: 'flora', climb: false }));
        const platform = W.addPlatform({ x, z, r: capR * 0.55, top: capY - 0.15, thick: 1.0, tag: 'flora-cap' });
        const pad = { pos: new THREE.Vector3(x, capY - 0.15, z), radius: capR * 0.7, power: 15 + Math.min(8, capR * 1.5), id: i };
        Object.defineProperty(pad, 'platform', { value: platform, enumerable: false });
        bouncePads.push(pad); padOf.set(i, pad);
      } else colliders.set(i, W.addCollider({ x, z, r, y0: y - 1, y1: top, tag: 'flora', climb: false }));   // trunks are not climbing walls
      nCol++;
    } else if ((d.kind === 'rock' || d.kind === 'crystal') && (d.solid || d.breakable)) {
      const bw = Math.min(m.box.max.x - m.box.min.x, m.box.max.z - m.box.min.z) * 0.5 * s;
      if (bw < 0.45) continue;
      colliders.set(i, W.addCollider({ x, z, r: bw * 0.8, y0: y - 1, y1: y + m.height * s, tag: 'flora' }));
      nCol++;
    }
  }

  // ---- hidden plants that grow back
  const regrow = []; // { i, t }
  const handles = new Map();
  const reactors = new Map(); // i -> Reactor
  const anims = [];           // felling / fading / resonance
  const burn = new Map();     // i -> { p, burnTime, o0, o1, wt }
  let lastBlast = null;
  // 'element:applied' fires before apply() looks for reactors: register what stands inside the blast right now
  G.events.on('element:applied', (e) => {
    lastBlast = e;
    try { if (e?.pos) registerAround(e.pos.x, e.pos.z, (e.radius || 1) + 5); } catch (err) { G.reportError('flora:applied', err); }
  });
  // blasts register everything that can break in reach; the standing scan around the heroine keeps to trees and the
  // old breakable rocks, so walls / fences / big boulders never crowd trees out of the reactor budget
  function registerAround(x, z, r, all = true) {
    if (!G.elements?.register) return;
    each(x, z, r, (i, sp) => {
      if (sp.def.kind === 'tree' || (all ? canBreak(sp) : (sp.def.breakable && isStone(sp)))) register(i);
    });
  }

  function handle(i) {
    let h = handles.get(i);
    if (!h) {
      const m = modelOf(i);
      h = {
        id: i, key: species[S.sp[i]].key, pos: new THREE.Vector3(S.x[i], S.y[i], S.z[i]),
        height: m.height * S.s[i], radius: Math.max(m.crown.rx, m.crown.rz) * S.s[i],
        crownY: m.crown.cy * S.s[i], crownRY: m.crown.ry * S.s[i],   // crown centre above the foot / half height (fire look)
        get burning() { return !!reactors.get(i)?.burning; }, get charred() { return S.state[i] === 2; }, get felled() { return S.state[i] === 3; },
      };
      handles.set(i, h);
    }
    return h;
  }
  const idOf = (t) => (typeof t === 'number' ? t : t?.id);

  // ---- iterate instances of given kinds in chunks overlapping a circle
  function each(x, z, r, fn) {
    const c0x = Math.max(0, Math.floor((x - r - ORG) / CH)), c1x = Math.min(NC - 1, Math.floor((x + r - ORG) / CH));
    const c0z = Math.max(0, Math.floor((z - r - ORG) / CH)), c1z = Math.min(NC - 1, Math.floor((z + r - ORG) / CH));
    const r2 = r * r;
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = cx + cz * NC, near = chunkNear[c];
      if (!near) continue;
      for (const si of near) {
        const sp = species[si], b = sp.batch, s0 = b.cStart.get(c), k = b.cCount.get(c);
        for (let j = s0; j < s0 + k; j++) {
          const i = sp.inst[j];
          const dx = S.x[i] - x, dz = S.z[i] - z;
          if (dx * dx + dz * dz <= r2) fn(i, sp);
        }
      }
    }
  }

  // ---- colours while burning
  function setCol(i, c0, c1, glowAmt, hue, crown) {
    for (let j = 0; j < 3; j++) { if (c0) S.c0[i * 3 + j] = c0[j]; if (c1) S.c1[i * 3 + j] = c1[j]; }
    if (glowAmt != null) S.fx[i * 4] = glowAmt;
    if (hue != null) S.fx[i * 4 + 1] = hue;
    if (crown != null) S.fx[i * 4 + 3] = crown;
    if (S.state[i] !== 3 && S.state[i] !== 1) writeInstance(i);
  }
  const lerp3 = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };
  const tc0 = [0, 0, 0], tc1 = [0, 0, 0];

  // ---- reactors
  function register(i) {
    const El = G.elements;
    if (!El?.register || reactors.size >= MAX_REG * 1.5 || reactors.has(i) || S.state[i] === 1 || S.state[i] === 3 || S.state[i] === 4) return;
    const d = defOf(i), m = modelOf(i), s = S.s[i];
    const pos = new THREE.Vector3(S.x[i], S.y[i], S.z[i]);
    let r;
    if (d.kind === 'tree') {
      const H = m.height * s;
      r = El.register({
        owner: handle(i), kind: 'tree', material: 'wood', pos, radius: clamp(Math.max(m.crown.rx, m.crown.rz) * s * 0.7, 0.8, 4), height: H,
        burnTime: 14 + H * 1.2, team: 'neutral',
        on: {
          ignite: () => startBurn(i),
          burnTick: (rr, dt) => burnTick(i, dt),
          burnout: () => burnOut(i),
          extinguish: () => { const b = burn.get(i); if (b) setCol(i, null, null, 0, 1, null); },
          hit: (rr, el, power, info) => onTreeHit(i, el, power, info),
        },
      });
      if (S.state[i] === 2) { r.charred = true; }
    } else if (d.kind === 'rock' || d.kind === 'crystal') {
      if (!canBreak(species[S.sp[i]])) return;
      const bw = Math.max(m.box.max.x - m.box.min.x, m.box.max.z - m.box.min.z) * 0.5 * s;
      const stuff = stuffOf(i);
      r = El.register({
        owner: handle(i), kind: 'structure', material: d.kind === 'crystal' ? 'crystal' : stuff === 'straw' ? 'grass' : stuff, pos, radius: Math.max(0.6, bw), height: m.height * s, team: 'neutral',
        on: {
          // fences catch and char; a bale burns away to ash
          ...(stuff !== 'stone' ? {
            burnout: () => { if (stuff === 'straw') shatter(i, { source: 'fire' }, true); else { keepOrig(i); setCol(i, CHAR0, CHAR1, 0, null, null); if (!guarded(i)) mark(i, WRECK.CHARRED); } },
          } : null),
          shatter: (rr, info) => { if (d.breakable) shatter(i, info); else bruise(i, 'earth', 2, info); },
          light: (rr, power) => { if (d.kind === 'crystal') resonate(i, power); },
          hit: (rr, el, power, info) => {
            if (S.state[i] === 3) return;
            if (d.breakable && ((el === 'earth' && (power >= 1.1 || info?.heavy)) || (info?.heavy && el !== 'water'))) shatter(i, info);
            else {
              if (el === 'sun' && d.kind === 'crystal') resonate(i, power);
              bruise(i, el, power, info);
            }
          },
        },
      });
    } else return;
    if (r) reactors.set(i, r);
  }
  const pendingUnreg = [];
  function unregister(i) {
    const r = reactors.get(i);
    if (!r) return;
    reactors.delete(i);
    pendingUnreg.push(r);
  }

  // ---- burning
  function startBurn(i) {
    if (!burn.has(i)) {
      burn.set(i, { p: 0, wt: 0, o0: [S.c0[i * 3], S.c0[i * 3 + 1], S.c0[i * 3 + 2]], o1: [S.c1[i * 3], S.c1[i * 3 + 1], S.c1[i * 3 + 2]], g0: S.fx[i * 4], h0: S.fx[i * 4 + 1] });
    }
    setCol(i, null, null, 0.9, 1, null);
  }
  function burnTick(i, dt) {
    const b = burn.get(i);
    if (!b) return;
    const r = reactors.get(i);
    const bt = r ? r.burnTime || 20 : 20;
    b.p = Math.min(1, b.p + dt / bt);
    b.wt += dt;
    if (b.wt < 0.12) return;
    b.wt = 0;
    const k = smoothstep(0, 0.85, b.p);
    lerp3(b.o0, CHAR0, k, tc0); lerp3(b.o1, CHAR1, smoothstep(0.2, 1, b.p), tc1);
    const flick = 0.75 + 0.25 * Math.sin(G.time.t * 13 + i);
    setCol(i, tc0, tc1, (0.6 + 0.8 * k) * flick * (1 - smoothstep(0.8, 1, b.p)), 1, 1 - smoothstep(0.5, 1, b.p) * 0.92);
  }
  function burnOut(i) {
    const b = burn.get(i);
    if (b) keepOrig(i, b.o0, b.o1, b.g0, b.h0);
    burn.delete(i);
    if (S.state[i] === 0) S.state[i] = 2;
    setCol(i, CHAR0, CHAR1, 0, 1, 0);
    if (!guarded(i)) mark(i, WRECK.CHARRED);
    G.fx?.burst?.('embers', _v.set(S.x[i], S.y[i] + modelOf(i).crown.cy * S.s[i], S.z[i]));
  }

  // ---- felling
  function onTreeHit(i, el, power, info) {
    if (S.state[i] === 3) return;
    const strong = (el === 'thunder' && (info?.split || power >= 0.6)) || (el === 'earth' && power >= 0.9) || info?.heavy ||
      (el === 'fire' && power >= 2.2) || (el === 'wind' && power >= 1.6);
    if (!strong) return;
    let dir = null;
    if (info?.dir && (el === 'wind')) dir = _v2.copy(info.dir);
    else if (lastBlast?.pos) dir = _v2.set(S.x[i] - lastBlast.pos.x, 0, S.z[i] - lastBlast.pos.z);
    fell(i, dir, { splinter: el === 'thunder' || el === 'earth' || !!info?.heavy, char: el === 'thunder' || el === 'fire' });
  }
  /** Fell a tree toward dir. opts.splinter: the trunk bursts (wood shards fly); opts.char: the stump is burnt black. */
  function fell(tree, dir, opts) {
    const i = idOf(tree);
    if (i == null || i < 0 || i >= S.n || !isTree(i) || S.state[i] === 3 || S.state[i] === 1 || S.state[i] === 4) return false;
    const d = new THREE.Vector3(dir?.x ?? 0, 0, dir?.z ?? 0);
    if (d.lengthSq() < 1e-6) { const a = Math.random() * Math.PI * 2; d.set(Math.cos(a), 0, Math.sin(a)); }
    d.normalize();
    keepOrig(i);
    const wasCharred = S.state[i] === 2 || burn.has(i);
    S.state[i] = 3;
    const col = colliders.get(i);
    if (col) col.dead = true;
    const H = modelOf(i).height * S.s[i];
    anims.push({ type: 'fell', i, t: 0, dur: 1.1 + H * 0.06, dir: d, H, landed: false });
    G.fx?.burst?.('wood_break', _v.set(S.x[i], S.y[i] + 1.2, S.z[i]));
    G.audio?.sfx?.('wood_break', { pos: _v });
    if (opts?.splinter) splinters(i, d, H);
    if (!guarded(i)) mark(i, WRECK.FELLED | (opts?.char || wasCharred ? WRECK.CHARRED : 0));
    addStump(i);
    return true;
  }
  /** Shards of the trunk thrown out of a burst tree (pooled prop debris; nothing if props are absent). */
  function splinters(i, dir, H) {
    const deb = G.props?.debris;
    if (!deb) return;
    const n = Math.round(clamp(3 + H * 0.4, 4, 9) * clamp(G.quality?.particles ?? 1, 0.35, 1));
    const tr = (defOf(i).trunkR || 0.3) * S.s[i];
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, up = 0.6 + Math.random() * 1.6;
      _v.set(S.x[i] + Math.cos(a) * tr, S.y[i] + up, S.z[i] + Math.sin(a) * tr);
      _v2.set(Math.cos(a) * (2 + Math.random() * 4) + dir.x * 3, 3 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 4) + dir.z * 3);
      deb('splinter', _v, _v2, { color: k % 3 === 0 ? 0xd9b98a : burn.has(i) || S.state[i] === 2 ? 0x2e2420 : 0x8b5a3c, scale: 0.8 + Math.random() * 0.7 });
    }
  }
  function fellMatrix(i, ang, dir, sink, k) {
    _e.set(S.tx[i], S.rot[i], S.tz[i]); _q.setFromEuler(_e);
    _ax.set(dir.z, 0, -dir.x).normalize();
    _q2.setFromAxisAngle(_ax, ang);
    _q.premultiply(_q2);
    return _m.compose(_v.set(S.x[i], S.y[i] + 0.3 - sink, S.z[i]), _q, _s.setScalar(S.s[i] * k));
  }

  // dynamic stumps (one shared small batch). The list is the felled trees in order; the newest STUMP_CAP are shown.
  let stumps = null;
  const STUMP_CAP = 192;
  const stumpIds = [];
  function stumpBatch() {
    if (stumps === null) {
      const model = (() => { try { return buildModelParts(G, SPECIES.stump); } catch (e) { return null; } })();
      if (!model) { stumps = false; return null; }
      stumps = new Batch(G, model, STUMP_CAP, STUMP_CAP, { name: 'stumps', flex: 0, castShadow: true, dist: 120 });
      stumps.setRanges(new Map([['dyn', 0]]), new Map([['dyn', 0]]));
      ctx.addExtra?.(stumps);
    }
    return stumps || null;
  }
  function writeStump(slot, i) {
    const s = clamp((defOf(i).trunkR || 0.3) * S.s[i] / 0.45, 0.5, 1.8);
    _q.setFromEuler(_e.set(0, S.rot[i], 0));
    // on the ground as it is now (a blast may have dug or heaped it since the tree grew)
    const gy = Math.min(S.y[i], W.heightAt(S.x[i], S.z[i]));
    _m.compose(_v.set(S.x[i], gy + 0.1, S.z[i]), _q, _s.set(s, s * 0.9, s));
    const charred = ((wreck.get(i) || 0) & WRECK.CHARRED) || S.state[i] === 2 || burn.has(i);
    const o = orig.get(i);
    const c1 = charred ? CHAR1 : o ? o.c1 : [S.c1[i * 3], S.c1[i * 3 + 1], S.c1[i * 3 + 2]];
    stumps.set(slot, _m, charred ? CHAR0 : [0.35, 0.5, 0.25], c1, [0, 0, 0, 1]);
  }
  function addStump(i) {
    if (!stumpBatch()) return;
    const k = stumpIds.indexOf(i);
    if (k >= 0) stumpIds.splice(k, 1);
    stumpIds.push(i);
    rebuildStumps();
  }
  function rebuildStumps() {
    if (!stumpBatch()) return;
    const from = Math.max(0, stumpIds.length - STUMP_CAP);
    let n = 0;
    for (let k = from; k < stumpIds.length; k++) writeStump(n++, stumpIds[k]);
    stumps.cCount.set('dyn', n);
    ctx.markDirty();
  }

  function landTree(a) {
    const i = a.i;
    a.landed = true;
    const tip = _v.set(S.x[i] + a.dir.x * a.H * 0.6, S.y[i] + 0.8, S.z[i] + a.dir.z * a.H * 0.6);
    tip.y = W.heightAt(tip.x, tip.z) + 0.8;
    G.fx?.burst?.('dust', tip, { scale: 1.6 });
    if (S.state[i] !== 2 && !burn.has(i)) G.fx?.burst?.('leaves', tip, { scale: 1.4 });
    shakeAt(tip, 0.25, 0.3);
    G.audio?.sfx?.('rock_fall', { pos: tip, vol: 0.7, pitch: 0.7 });
    const r = reactors.get(i);
    if (r) { r.pos.set(S.x[i] + a.dir.x * a.H * 0.35, W.heightAt(S.x[i] + a.dir.x * a.H * 0.35, S.z[i] + a.dir.z * a.H * 0.35), S.z[i] + a.dir.z * a.H * 0.35); r.height = 1.6; r.moved?.(); }
    if (G.props?.spawn) {
      const yaw = Math.atan2(a.dir.x, a.dir.z);
      const n = a.H > 7 ? 2 : 1;
      let ok = 0;
      for (let k = 0; k < n; k++) {
        const f = n === 1 ? 0.35 : 0.22 + k * 0.32;
        const px = S.x[i] + a.dir.x * a.H * f, pz = S.z[i] + a.dir.z * a.H * f;
        try {
          const p = G.props.spawn('log', new THREE.Vector3(px, W.heightAt(px, pz) + 0.7, pz), { rot: yaw, yaw, burning: !!reactors.get(i)?.burning });
          if (p) ok++;
        } catch (e) { G.reportError('flora:log', e); }
      }
      if (ok) { a.type = 'vanish'; a.t = 0; a.dur = 0.5; return; }
    }
    a.type = 'lie'; a.t = 0; a.dur = 14;
  }

  // ---- rocks / crystals
  let debrisGeo = null;
  function shatter(id, info, force = false) {
    const i = idOf(id);
    if (i == null || S.state[i] === 3 || S.state[i] === 1) return false;
    const d = defOf(i);
    if (!d.breakable && !force) return false;
    keepOrig(i);
    S.state[i] = 3;
    hideInstance(i);
    const col = colliders.get(i); if (col) col.dead = true;
    unregister(i);
    cracks.delete(i);
    ctx.markDirty();
    const m = modelOf(i), s = S.s[i];
    const cy = S.y[i] + m.height * s * 0.45;
    const at = new THREE.Vector3(S.x[i], cy, S.z[i]);
    const crystal = d.kind === 'crystal';
    const stuff = stuffOf(i), sh = SHARDS[stuff];
    G.fx?.burst?.(crystal ? 'shatter_ice' : sh.fx, at, { scale: Math.max(1, m.height * s * 0.6) });
    G.fx?.burst?.('dust', _v.set(S.x[i], S.y[i] + 0.4, S.z[i]), { scale: clamp(m.height * s * 0.7, 0.8, 2.6) });
    G.audio?.sfx?.(crystal ? 'crystal_chime' : sh.sfx, { pos: at });
    if (m.height * s > 1.3 && stuff === 'stone') {
      shakeAt(at, clamp(m.height * s * 0.08, 0.12, 0.45), 0.35);
      G.audio?.sfx?.('rock_fall', { pos: at, vol: 0.8, pitch: 0.8 });
      if (m.height * s > 2.2 && G.camera && G.camera.position.distanceTo(at) < 25) G.hitstop?.(0.045);
    }
    if (!guarded(i)) mark(i, WRECK.GONE);
    if (!crystal && stuff === 'stone') addRubble(i);
    if (G.props?.debris && !crystal) {
      const H = m.height * s, n = Math.round(clamp(3 + H * 2.2, 4, 12) * clamp(G.quality?.particles ?? 1, 0.35, 1));
      const night = W.veilAt(S.x[i], S.z[i]);
      const stoneCol = night > 0.6 ? 0x4c4f66 : night > 0.2 ? 0x8a7a80 : 0x9a99a2;
      // long pieces (a wall, a fence) spread their shards along their length (local +x, as they are laid)
      const len = Math.max(0, (m.box.max.x - m.box.min.x) * s * 0.5 - 0.3), ca = Math.cos(S.rot[i]), sa = -Math.sin(S.rot[i]);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + Math.random(), u = (Math.random() * 2 - 1) * len;
        _v.set(at.x + Math.cos(a) * H * 0.25 + ca * u, cy + (Math.random() - 0.3) * H * 0.5, at.z + Math.sin(a) * H * 0.25 + sa * u);
        _v2.set(Math.cos(a) * (2 + Math.random() * 4), 2.5 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 4));
        const col = sh.cols ? sh.cols[k % sh.cols.length] : stoneCol;
        G.props.debris(sh.kind, _v, _v2, { color: col, scale: stuff === 'stone' ? clamp(H * 0.45, 0.7, 2.4) * (0.6 + Math.random() * 0.7) : 1 + Math.random() * 0.6 });
      }
    } else if (G.physics?.add) {
      debrisGeo = debrisGeo || new THREE.IcosahedronGeometry(1, 0);
      const size = Math.max(0.18, m.height * s * 0.22);
      const n = Math.min(7, 3 + Math.floor(m.height * s * 1.5));
      const night = W.veilAt(S.x[i], S.z[i]);
      const mat = crystal ? glowMat(0x9fd8ff, 1.6) : flat(night > 0.6 ? 0x4c4f66 : night > 0.2 ? 0x8a7a80 : 0x9a99a2);
      for (let k = 0; k < n; k++) {
        const mesh = new THREE.Mesh(debrisGeo, mat);
        const sc = size * (0.6 + Math.random() * 0.7);
        mesh.scale.set(sc, sc * (0.6 + Math.random() * 0.5), sc * (0.7 + Math.random() * 0.4));
        mesh.castShadow = true;
        const a = (k / n) * Math.PI * 2 + Math.random();
        const p = new THREE.Vector3(at.x + Math.cos(a) * size, cy + (Math.random() - 0.3) * size * 2, at.z + Math.sin(a) * size);
        mesh.position.copy(p);
        G.scene.add(mesh);
        try {
          G.physics.add({
            mesh, shape: 'hull', pos: p, type: 'dynamic', material: crystal ? 'crystal' : 'stone', group: 'debris', lifetime: 5 + Math.random() * 3,
            vel: { x: Math.cos(a) * (2 + Math.random() * 3), y: 2 + Math.random() * 4, z: Math.sin(a) * (2 + Math.random() * 3) },
          });
        } catch (e) { G.scene.remove(mesh); G.reportError('flora:debris', e); }
      }
    }
    G.events.emit('prop:broken', { type: crystal ? 'crystal' : 'rock', pos: at, by: info?.source || null });
    return true;
  }
  // ---- rocks that crack under repeated blows (thunder, fire blasts, earth, sunfire) and finally burst
  const cracks = new Map();   // i -> accumulated blows
  function rockHp(i) {
    const stuff = stuffOf(i);
    return (stuff === 'straw' ? 0.5 : stuff === 'wood' ? 0.6 : defOf(i).breakable ? 0.8 : FIELD[species[S.sp[i]].key] ? 1 : 1.6) + modelOf(i).height * S.s[i] * 0.35;
  }
  function bruise(i, el, power, info) {
    if (S.state[i] === 3 || S.state[i] === 1 || guarded(i)) return;
    const stuff = stuffOf(i);
    if (el === 'wind' && stuff !== 'stone' && power < 1.2 && !info?.heavy) return;   // a breeze does not break a fence
    let blow = (BLOW[stuff][el] || 0) * clamp(power, 0.3, 3);
    if (info?.heavy) blow += 0.8;
    if (info?.split) blow += 0.25;
    if (!(blow > 0.02)) return;
    const hp = rockHp(i), prev = cracks.get(i) || 0, now = prev + blow;
    cracks.set(i, now);
    const m = modelOf(i), H = m.height * S.s[i];
    _v.set(S.x[i], S.y[i] + H * 0.6, S.z[i]);
    if (now >= hp) { shatter(i, info, true); return; }
    if (prev < hp * 0.45 && now >= hp * 0.45) crackRock(i);
    G.fx?.burst?.(SHARDS[stuff].fx === 'dust' ? 'dust' : SHARDS[stuff].fx, _v, { scale: 0.45 });
  }
  /** A rock split by blows: darker, with a cloud of grit; it bursts on the next good hit. Persisted (CRACKED). */
  function crackRock(i, quiet = false) {
    keepOrig(i);
    for (let j = 0; j < 3; j++) { S.c0[i * 3 + j] *= 0.72; S.c1[i * 3 + j] *= 0.8; }
    if (S.state[i] !== 3 && S.state[i] !== 1) writeInstance(i);
    if (!quiet) {
      G.fx?.burst?.('dust', _v.set(S.x[i], S.y[i] + 0.3, S.z[i]), { scale: 1.2 });
      G.audio?.sfx?.(SHARDS[stuffOf(i)].sfx, { pos: _v, vol: 0.6, pitch: 1.2 });
    }
    if (!guarded(i)) mark(i, WRECK.CRACKED);
  }

  // ---- rubble left where a big rock burst (one shared batch; deterministic pieces per rock)
  let rubble = null;
  const RUBBLE_CAP = 160;
  const rubbleIds = [];
  function rubbleBatch() {
    if (rubble === null) {
      const model = (() => { try { return buildModelParts(G, SPECIES.boulder3); } catch (e) { return null; } })();
      if (!model) { rubble = false; return null; }
      rubble = new Batch(G, model, RUBBLE_CAP, RUBBLE_CAP, { name: 'rubble', flex: 0, castShadow: true, dist: 140 });
      rubble.setRanges(new Map([['dyn', 0]]), new Map([['dyn', 0]]));
      rubble.unit = Math.max(0.3, model.height);
      ctx.addExtra?.(rubble);
    }
    return rubble || null;
  }
  function addRubble(i) {
    if (modelOf(i).height * S.s[i] < 0.9 || rubbleIds.includes(i)) return;
    rubbleIds.push(i);
    rebuildRubble();
  }
  function rebuildRubble() {
    if (!rubbleBatch()) return;
    let n = 0;
    for (let k = rubbleIds.length - 1; k >= 0 && n < RUBBLE_CAP - 5; k--) {
      const i = rubbleIds[k], m = modelOf(i), H = m.height * S.s[i];
      const bw = Math.max(m.box.max.x - m.box.min.x, m.box.max.z - m.box.min.z) * 0.5 * S.s[i];
      const pieces = H > 2.5 ? 5 : H > 1.6 ? 4 : 3;
      let h = (i * 2654435761) >>> 0;
      const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0) / 4294967296);
      for (let p = 0; p < pieces; p++) {
        const a = rnd() * Math.PI * 2, d = bw * (0.15 + rnd() * 0.75);
        const x = S.x[i] + Math.cos(a) * d, z = S.z[i] + Math.sin(a) * d;
        const sc = clamp(H * (0.16 + rnd() * 0.16) / rubble.unit, 0.12, 3);
        _q.setFromEuler(_e.set(rnd() * 0.8, rnd() * 6.28, rnd() * 0.8));
        _m.compose(_v.set(x, W.heightAt(x, z) - sc * rubble.unit * 0.25, z), _q, _s.set(sc, sc * (0.55 + rnd() * 0.4), sc));
        const o = orig.get(i);
        const c0 = o ? o.c0 : [S.c0[i * 3], S.c0[i * 3 + 1], S.c0[i * 3 + 2]], c1 = o ? o.c1 : [S.c1[i * 3], S.c1[i * 3 + 1], S.c1[i * 3 + 2]];
        rubble.set(n++, _m, c0, c1, [0, 0, 0, 1]);
      }
    }
    rubble.cCount.set('dyn', n);
    ctx.markDirty();
  }

  // ---- wreck records (persisted by the destruction system through G.flora.wreck)
  const wreck = new Map();    // i -> WRECK bits, insertion order = oldest first
  const orig = new Map();     // i -> colours before magic touched it (for a reload into a save without this wreck)
  function keepOrig(i, o0, o1, g0, h0) {
    if (orig.has(i)) return;
    orig.set(i, {
      c0: o0 ? o0.slice() : [S.c0[i * 3], S.c0[i * 3 + 1], S.c0[i * 3 + 2]], c1: o1 ? o1.slice() : [S.c1[i * 3], S.c1[i * 3 + 1], S.c1[i * 3 + 2]],
      fx: [g0 ?? S.fx[i * 4], h0 ?? S.fx[i * 4 + 1], S.fx[i * 4 + 2], 1],
    });
  }
  const since = new Map();    // i -> playTime its recovery clock started (charred: burnt out; felled: fell)
  const lastK = new Map();    // i -> last recovery stage written (avoid rewriting every tick)
  function mark(i, bits, t = now()) {
    const old = wreck.get(i) || 0;
    if ((old | bits) === old) return;
    wreck.delete(i);
    wreck.set(i, old | bits);
    if (((bits & WRECK.FELLED) && !(old & WRECK.FELLED)) || ((bits & WRECK.CHARRED) && !(old & (WRECK.CHARRED | WRECK.FELLED)))) { since.set(i, t); lastK.delete(i); }
    wreckVersion++;
  }
  function forget(i) { wreck.delete(i); since.delete(i); lastK.delete(i); orig.delete(i); wreckVersion++; }

  // ---- recovery: charred trees leaf out again, stumps put up saplings (records are dropped once healed) -------------
  const _rm = new THREE.Matrix4();
  function scaledMatrix(i, k) {
    _e.set(S.tx[i], S.rot[i], S.tz[i]); _q.setFromEuler(_e);
    return _rm.compose(_v.set(S.x[i], S.y[i], S.z[i]), _q, _s.setScalar(S.s[i] * k));
  }
  function recoverChar(i, age) {
    const o = orig.get(i);
    if (!o || age < RECOVER.CHAR_HOLD) return;
    const k = clamp((age - RECOVER.CHAR_HOLD) / RECOVER.CHAR_SPROUT, 0, 1);
    if (k >= 1) {
      for (let j = 0; j < 3; j++) { S.c0[i * 3 + j] = o.c0[j]; S.c1[i * 3 + j] = o.c1[j]; }
      for (let j = 0; j < 4; j++) S.fx[i * 4 + j] = o.fx[j];
      if (S.state[i] === 2) S.state[i] = 0;
      const r = reactors.get(i); if (r) r.charred = false;
      if (S.state[i] !== 3 && S.state[i] !== 1) writeInstance(i);
      forget(i);
      return;
    }
    if (Math.abs(k - (lastK.get(i) ?? -1)) < 0.02) return;
    lastK.set(i, k);
    const leaf = smoothstep(0, 0.7, k), bark = smoothstep(0.3, 1, k), young = 1 - smoothstep(0.6, 1, k);
    for (let j = 0; j < 3; j++) {
      const fresh = o.c0[j] * (1 + (SPROUT[j] - 1) * young);
      S.c0[i * 3 + j] = CHAR0[j] + (Math.min(1, fresh) - CHAR0[j]) * leaf;
      S.c1[i * 3 + j] = CHAR1[j] + (o.c1[j] - CHAR1[j]) * bark;
    }
    if (isTree(i)) S.fx[i * 4 + 3] = 0.08 + 0.92 * smoothstep(0, 1, k);   // the crown fills out again
    if (S.state[i] !== 3 && S.state[i] !== 1) writeInstance(i);
  }
  function regrowTree(i, age) {
    if (age < RECOVER.FELL_HOLD) return;
    // a tree whose ground was dug away or heaped up does not come back (its stump stays with the crater)
    if (Math.abs(W.deformOffsetAt?.(S.x[i], S.z[i]) ?? 0) > 0.5) return;
    const H = modelOf(i).height * S.s[i], tr = (defOf(i).trunkR || 0.3) * S.s[i];
    const k = clamp((age - RECOVER.FELL_HOLD) / RECOVER.FELL_GROW, 0, 1);
    const g = 0.12 + 0.88 * (1 - (1 - k) * (1 - k));
    const col = colliders.get(i);
    if (S.state[i] === 3) {
      // the sapling only breaks ground where she is not standing; her waiting pushes the clock back, not the size up
      if (herNear(S.x[i], S.z[i], tr * g + 1.3)) { since.set(i, since.get(i) + 0.5); return; }
      const o = orig.get(i);
      if (o) { for (let j = 0; j < 3; j++) { S.c0[i * 3 + j] = o.c0[j]; S.c1[i * 3 + j] = o.c1[j]; } for (let j = 0; j < 4; j++) S.fx[i * 4 + j] = o.fx[j]; }
      S.state[i] = 4;
      G.fx?.burst?.('leaves', _v2.set(S.x[i], S.y[i] + 0.5, S.z[i]), { scale: 0.5 });
    }
    if (k >= 1 && !herNear(S.x[i], S.z[i], tr + 0.7)) {
      S.state[i] = 0;
      if (col) { col.dead = false; col.r = col.r0 ?? col.r; col.y1 = S.y[i] + H; }
      writeInstance(i);
      const si = stumpIds.indexOf(i); if (si >= 0) { stumpIds.splice(si, 1); rebuildStumps(); }
      forget(i);
      ctx.markDirty();
      return;
    }
    if (Math.abs(g - (lastK.get(i) ?? -1)) < 0.01) return;
    lastK.set(i, g);
    writeInstance(i, scaledMatrix(i, g));
    if (col) {
      if (col.r0 === undefined) col.r0 = col.r;
      // the trunk turns solid once it is a real trunk, and never around her
      if (g >= 0.5 && col.dead && !herNear(S.x[i], S.z[i], tr * g + 0.7)) col.dead = false;
      col.r = col.r0 * g; col.y1 = S.y[i] + H * g;
    }
    if (g >= 0.55) { const si = stumpIds.indexOf(i); if (si >= 0) { stumpIds.splice(si, 1); rebuildStumps(); } }
    ctx.markDirty();
  }
  let recoverT = 0;
  function recoverTick() {
    const t = now();
    for (const [i, bits] of wreck) {
      const s0 = since.get(i);
      if (s0 === undefined) continue;
      if (bits & WRECK.FELLED) { if (isTree(i) && !(bits & WRECK.GONE)) regrowTree(i, t - s0); }
      else if (bits & WRECK.CHARRED) recoverChar(i, t - s0);
    }
  }
  let wreckVersion = 0;
  const q10 = (v) => Math.round(v * 10);
  /** Flat persisted list [x·10, z·10, bits, …] (oldest first, at most `cap` records; charred-only ones go first). */
  function wreckRecords(cap = 420) {
    let ids = [...wreck.keys()];
    if (ids.length > cap) {
      const drop = new Set();
      for (const i of ids) { if (drop.size >= ids.length - cap) break; if (wreck.get(i) === WRECK.CHARRED || wreck.get(i) === WRECK.CRACKED) drop.add(i); }
      ids = ids.filter((i) => !drop.has(i));
      if (ids.length > cap) ids = ids.slice(ids.length - cap);
    }
    const out = [];
    // records this density tier has no instance for (the save came from another quality) are kept as they were
    for (let k = 0; k + 3 < foreign.length && out.length / 4 < cap - ids.length; k += 4) out.push(foreign[k], foreign[k + 1], foreign[k + 2], foreign[k + 3]);
    for (const i of ids) out.push(q10(S.x[i]), q10(S.z[i]), wreck.get(i), Math.round(since.get(i) ?? now()));
    return out;
  }
  const foreign = [];
  /** Find the instance a record points at (same tree / rock at this quality: position to 10 cm). */
  function findInstance(xq, zq) {
    let hit = -1;
    each(xq / 10, zq / 10, 0.3, (i, sp) => {
      if (hit < 0 && q10(S.x[i]) === xq && q10(S.z[i]) === zq && (sp.def.kind === 'tree' || canBreak(sp))) hit = i;
    });
    return hit;
  }
  /** Re-create persisted wreck (after a load). stride 4: [x·10, z·10, bits, playTime], stride 3: the first format (the
   *  clock starts now). Unknown positions are kept aside (another density tier) and saved again as they were. */
  function applyWreck(list, stride = 4) {
    if (!Array.isArray(list)) return 0;
    let n = 0, stumpsDirty = false, rubbleDirty = false;
    const t0 = now();
    for (let k = 0; k + stride - 1 < list.length; k += stride) {
      const xq = list[k], zq = list[k + 1], bits = list[k + 2] | 0, t = stride >= 4 && Number.isFinite(list[k + 3]) ? Math.min(list[k + 3], t0) : t0;
      if (!Number.isFinite(xq) || !Number.isFinite(zq) || bits <= 0 || bits > 15) continue;
      const i = findInstance(xq, zq);
      if (i < 0) { if (foreign.length < 4 * 420) foreign.push(xq, zq, bits, t); continue; }
      n++;
      keepOrig(i);
      wreck.delete(i); wreck.set(i, bits);
      if (bits & (WRECK.FELLED | WRECK.CHARRED)) since.set(i, t);
      lastK.delete(i);
      const tree = isTree(i);
      if (bits & (WRECK.FELLED | WRECK.GONE)) {
        if (S.state[i] !== 3) { S.state[i] = 3; hideInstance(i); }
        const col = colliders.get(i); if (col) col.dead = true;
        unregister(i); burn.delete(i);
        if (tree && (bits & WRECK.FELLED) && !stumpIds.includes(i)) { stumpIds.push(i); stumpsDirty = true; }
        if (!tree && (bits & WRECK.GONE) && stuffOf(i) === 'stone' && defOf(i).kind !== 'crystal' && !rubbleIds.includes(i) && modelOf(i).height * S.s[i] >= 0.9) { rubbleIds.push(i); rubbleDirty = true; }
        continue;
      }
      if (tree && (bits & WRECK.CHARRED)) {
        if (S.state[i] === 0) S.state[i] = 2;
        const r = reactors.get(i); if (r) r.charred = true;
        setCol(i, CHAR0, CHAR1, 0, 1, 0);
      } else if (bits & WRECK.CHARRED) setCol(i, CHAR0, CHAR1, 0, null, null);
      if (!tree && (bits & WRECK.CRACKED) && !cracks.has(i)) { cracks.set(i, rockHp(i) * 0.5); crackRock(i, true); }
    }
    if (stumpsDirty) { if (stumpBatch()) rebuildStumps(); }
    if (rubbleDirty) rebuildRubble();
    recoverTick();   // pick up where the clocks were (a tree that was half leafed out is half leafed out again)
    ctx.markDirty();
    return n;
  }
  /** Undo every wreck record (a different save is being loaded). Instances a crater owns are left to the crater. */
  function resetWreck() {
    for (const [i] of wreck) {
      if (scarPlants.has(i)) continue;
      const o = orig.get(i);
      for (let k = anims.length - 1; k >= 0; k--) if (anims[k].i === i) anims.splice(k, 1);
      burn.delete(i); cracks.delete(i); unregister(i);
      if (o) { for (let j = 0; j < 3; j++) { S.c0[i * 3 + j] = o.c0[j]; S.c1[i * 3 + j] = o.c1[j]; } for (let j = 0; j < 4; j++) S.fx[i * 4 + j] = o.fx[j]; }
      S.state[i] = 0;
      const col = colliders.get(i); if (col) { col.dead = false; if (col.r0 !== undefined) col.r = col.r0; }
      writeInstance(i);
    }
    wreck.clear(); cracks.clear(); foreign.length = 0; since.clear(); lastK.clear();
    stumpIds.length = 0; rubbleIds.length = 0;
    if (stumps) rebuildStumps();
    if (rubble) rebuildRubble();
    wreckVersion++;
    ctx.markDirty();
  }
  const wreckApi = {
    records: wreckRecords, apply: applyWreck, reset: resetWreck, BITS: WRECK,
    get version() { return wreckVersion; },
    /** Bits of an instance (tests). */
    of: (i) => wreck.get(i) || 0,
    stats: () => ({ records: wreck.size, stumps: Math.min(stumpIds.length, STUMP_CAP), rubble: rubbleIds.length, cracked: cracks.size, regrowing: [...wreck.keys()].filter((i) => S.state[i] === 4).length }),
    /** Recovery clock of an instance (playTime it started) — tests. */
    since: (i) => since.get(i),
    /** Run the recovery pass now (tests; the game does it twice a second). */
    recover: () => recoverTick(),
    TIMES: RECOVER,
    /** Strike a rock as an element would (destruction system: blasts bruise outcrops in range). */
    bruise: (i, el, power, info) => bruise(i, el, power, info),
    /** Stone instances (breakable or solid) within r: [instance id]. */
    rocksNear: (x, z, r) => { const out = []; each(x, z, r, (i, sp) => { if (canBreak(sp) && S.state[i] !== 3 && S.state[i] !== 1) out.push(i); }); return out; },
  };

  function resonate(i, power = 1) {
    if (S.state[i] === 3) return;
    const ex = anims.find((a) => a.type === 'chime' && a.i === i);
    if (ex) { ex.t = Math.min(ex.t, 0.3); return; }
    anims.push({ type: 'chime', i, t: 0, dur: 3.2, g0: S.fx[i * 4], k: Math.min(2, power) });
    G.audio?.sfx?.('crystal_chime', { pos: _v.set(S.x[i], S.y[i] + 1, S.z[i]), pitch: 0.85 + (S.fx[i * 4 + 1] || 0) * 0.5 });
    G.fx?.burst?.('spark', _v, { color: 0xbfe8ff });
  }

  // ---- removal
  function removeInRadius(x, z, r, opts = {}) {
    let n = 0;
    const regrowT = opts.regrow ?? 0;
    each(x, z, r, (i, sp) => {
      const k = sp.def.kind;
      if (S.state[i] === 1 || S.state[i] === 3) return;
      if (opts.plantsOnly && k !== 'plant') return;
      if (k === 'plant' && regrowT > 0) {
        S.state[i] = 1;
        // with opts.spread the plants at the edge come back first and the heart of the patch last
        const edge = opts.spread ? opts.spread * (1 - clamp(Math.hypot(S.x[i] - x, S.z[i] - z) / Math.max(0.1, r), 0, 1)) : 0;
        regrow.push({ i, t: regrowT * (0.9 + Math.random() * 0.2) + edge });
      }
      else S.state[i] = 3;
      hideInstance(i);
      const col = colliders.get(i); if (col) col.dead = true;
      unregister(i);
      n++;
    });
    if (n) ctx.markDirty();
    return n;
  }
  const scarPlants = new Map();
  const basinOriginal = new Map();
  let lakeSubmerged = 0;
  function updateLake(e) {
    lakeSubmerged=0;
    // Only this survey changes. Remember the exact pre-event root heights and
    // live states, so resetting a run also restores both near and far batches.
    if(e.active){
      each(e.x,e.z,e.r,(i,sp)=>{
        const x=S.x[i],z=S.z[i];
        if(x<e.x0||x>e.x1||z<e.z0||z>e.z1)return;
        const h=W.heightAt(x,z),drop=h-W.baseHeightAt(x,z);
        if(Math.abs(drop)<.015)return;
        const col=colliders.get(i),r=reactors.get(i);
        basinOriginal.set(i,{y:S.y[i],state:S.state[i],dead:col?.dead,offset:drop});
        S.y[i]+=drop;
        if(col){col.y0+=drop;col.y1+=drop;}
        if(handles.has(i))handles.get(i).pos.y=S.y[i];
        if(r){r.pos.y+=drop;r.moved?.();}
        if(sp.def.kind!=='rock' && h<.45) {
          S.state[i]=3;ctx.hideInstance(i);
          if(col)col.dead=true;
          unregister(i);burn.delete(i);
          lakeSubmerged++;
        }else if(S.state[i]!==1&&S.state[i]!==3)writeInstance(i);
      });
      for(let i=anims.length-1;i>=0;i--)if(basinOriginal.has(anims[i].i)&&S.state[anims[i].i]===3)anims.splice(i,1);
    }else{
      for(const [i,prev] of basinOriginal){
        const col=colliders.get(i),delta=prev.y-S.y[i];
        S.y[i]=prev.y;S.state[i]=prev.state;
        if(handles.has(i))handles.get(i).pos.y=prev.y;
        if(col){col.y0+=delta;col.y1+=delta;col.dead=prev.dead;}
        const r=reactors.get(i);if(r){r.pos.y+=delta;r.moved?.();}
        if(prev.state!==1&&prev.state!==3)writeInstance(i);
      }
      basinOriginal.clear();
    }
    ctx.grass?.refreshField();ctx.markDirty();
  }
  G.events.on('terrain:deformed', (e) => {
    try {
      if (!e || e.r == null) return;
      if(e.kind==='trialLake'){updateLake(e);return;}
      if(e.kind==='resetSpell'){
        each(e.x,e.z,e.r*1.25,(i)=>{
          const old=scarPlants.get(i);if(!old)return;
          S.state[i]=old.state;const col=colliders.get(i);if(col)col.dead=old.dead;
          if(old.state!==1 && old.state!==3)writeInstance(i);
          scarPlants.delete(i);
        });
        for(let i=anims.length-1;i>=0;i--)if(!scarPlants.has(anims[i].i) && anims[i].type==='fell' &&
          Math.hypot(S.x[anims[i].i]-e.x,S.z[anims[i].i]-e.z)<=e.r*1.25)anims.splice(i,1);
        ctx.grass?.refreshField();ctx.markDirty();return;
      }
      each(e.x,e.z,e.r*1.25,i=>{
        if(!scarPlants.has(i))scarPlants.set(i,{state:S.state[i],dead:colliders.get(i)?.dead});
      });
      if(e.kind==='restoreSpell'){
        if (e.r < 6) removeInRadius(e.x, e.z, e.r * 0.85, { plantsOnly: true, regrow: 200 });
        else removeInRadius(e.x,e.z,e.r*.85);
        // an old save's crater (no wreck records then) keeps its ring of trees down; newer craters' felled trees come
        // back from their records (stumps, saplings) instead
        if (e.legacy) each(e.x,e.z,e.r*1.25,(i,sp)=>{
          if(sp.def.kind==='tree' && S.state[i]!==3){S.state[i]=3;hideInstance(i);unregister(i);
            const col=colliders.get(i);if(col)col.dead=true;}
        });
        if (!ctx.grass?.scarFeed) ctx.grass?.clear(e.x,e.z,e.r*1.05,900);
        if (stumpIds.length || rubbleIds.length) settleOnGround(e);
        ctx.markDirty();return;
      }
      // trees caught in the blast fall outward; everything inside the bowl is gone. A small pit (a bolt, a strike, a
      // heave of earth) throws every tree in reach down instead, and only the plants in it go (they grow back).
      const small = e.r < 6;
      each(e.x, e.z, e.r * 1.25, (i, sp) => {
        if (sp.def.kind !== 'tree' || S.state[i] === 3) return;
        const d = Math.hypot(S.x[i] - e.x, S.z[i] - e.z);
        if (small || d > e.r * 0.55) fell(i, _v2.set(S.x[i] - e.x, 0, S.z[i] - e.z), { splinter: d < e.r * 0.7, char: small && e.amount < 0 });
      });
      if (small) removeInRadius(e.x, e.z, e.r * 0.85, { plantsOnly: true, regrow: 200 });
      else removeInRadius(e.x, e.z, e.r * 0.85);
      if (!ctx.grass?.scarFeed) ctx.grass?.clear(e.x, e.z, e.r * 1.05, 900);
      if (stumpIds.length || rubbleIds.length) settleOnGround(e);
    } catch (err) { G.reportError('flora:deformed', err); }
  });
  G.events.on('terrain:scorch', (e) => {
    if (e?.kind !== 'burn') return;
    removeInRadius(e.x, e.z, e.r, { plantsOnly: true, regrow: RECOVER.PLANT_BURN, spread: RECOVER.PLANT_SPREAD });
    registerAround(e.x, e.z, e.r + 6); // a grass fire reaching a grove can catch its trees
  });

  /** Stumps and rubble near a reshaped patch follow the new ground. */
  // (deferred to the next update: a save being loaded replays hundreds of scars in one go)
  let resettle = 0;
  function settleOnGround(e) {
    const R = e.r + 2;
    const near = (i) => Math.abs(S.x[i] - e.x) < R && Math.abs(S.z[i] - e.z) < R;
    if (stumpIds.some(near)) resettle |= 1;
    if (rubbleIds.some(near)) resettle |= 2;
  }

  // ---- per-frame
  let scanT = 0;
  const _fp = new THREE.Vector3();
  const nearFire = (i) => !!G.elements?.isBurningAt?.(S.x[i], S.z[i]);
  /** Springy squash of a giant mushroom (instance id = pad.id), k 0..1. */
  function squashPad(id, k = 1) {
    if (!padOf.has(id) || S.state[id] === 3) return false;
    const ex = anims.find((a) => a.type === 'squash' && a.i === id);
    if (ex) { ex.t = 0; ex.k = Math.max(ex.k * 0.5, k); return true; }
    anims.push({ type: 'squash', i: id, t: 0, dur: 0.75, k: Math.min(1, Math.max(0.1, k)) });
    return true;
  }
  function update(dt) {
    if (G.flora && !G.flora.squashPad) G.flora.squashPad = squashPad; // G.flora is assembled in world/flora.js
    if (G.flora && !G.flora.wreck) G.flora.wreck = wreckApi;
    if (resettle) { if (resettle & 1) rebuildStumps(); if (resettle & 2) rebuildRubble(); resettle = 0; }
    if ((recoverT -= dt) <= 0 && dt > 0) { recoverT = 0.5; try { recoverTick(); } catch (e) { G.reportError('flora:recover', e); } }
    while (pendingUnreg.length) { const r = pendingUnreg.pop(); try { G.elements?.unregister?.(r); } catch (e) { /* */ } }
    if (dt <= 0) return;
    // animations
    for (let k = anims.length - 1; k >= 0; k--) {
      const a = anims[k];
      a.t += dt;
      const i = a.i;
      if (a.type === 'fell') {
        const u = Math.min(1, a.t / a.dur);
        const ang = (u * u * (1.6 - 0.6 * u)) * 1.42;
        writeInstance(i, fellMatrix(i, ang, a.dir, 0, 1));
        if (u >= 1) { landTree(a); if (a.type === 'lie' || a.type === 'vanish') continue; }
      } else if (a.type === 'lie') {
        const u = Math.min(1, a.t / a.dur);
        const k2 = u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2;
        if (u < 1) writeInstance(i, fellMatrix(i, 1.42 + 0.04 * Math.sin(Math.min(1, a.t * 3) * Math.PI), a.dir, (1 - k2) * 0.8, Math.max(0.02, k2)));
        else { hideInstance(i); unregister(i); anims.splice(k, 1); }
      } else if (a.type === 'vanish') {
        const u = Math.min(1, a.t / a.dur);
        if (u < 1) writeInstance(i, fellMatrix(i, 1.42, a.dir, u * 0.5, Math.max(0.02, 1 - u)));
        else { hideInstance(i); unregister(i); anims.splice(k, 1); }
      } else if (a.type === 'squash') {
        const u = a.t / a.dur;
        if (S.state[i] === 3 || S.state[i] === 1) { anims.splice(k, 1); continue; }
        if (u >= 1) { writeInstance(i); anims.splice(k, 1); continue; }
        const w = a.k * Math.exp(-4 * u) * Math.cos(u * Math.PI * 3);
        _e.set(S.tx[i], S.rot[i], S.tz[i]); _q.setFromEuler(_e);
        const sc = S.s[i];
        writeInstance(i, _m.compose(_v.set(S.x[i], S.y[i], S.z[i]), _q, _s.set(sc * (1 + 0.16 * w), sc * (1 - 0.3 * w), sc * (1 + 0.16 * w))));
      } else if (a.type === 'grow') {
        if (S.state[i] !== 0) { anims.splice(k, 1); continue; }
        const u = Math.min(1, a.t / a.dur);
        if (u >= 1) { writeInstance(i); anims.splice(k, 1); continue; }
        writeInstance(i, scaledMatrix(i, 0.04 + 0.96 * (1 - (1 - u) * (1 - u))));
      } else if (a.type === 'chime') {
        const u = a.t / a.dur;
        S.fx[i * 4] = a.g0 + a.k * 1.6 * (1 - u) * (0.75 + 0.25 * Math.sin(a.t * 18));
        if (S.state[i] !== 3) writeInstance(i);
        if (u >= 1) { S.fx[i * 4] = a.g0; if (S.state[i] !== 3) writeInstance(i); anims.splice(k, 1); }
      }
    }
    // regrowth
    for (let k = regrow.length - 1; k >= 0; k--) {
      const g = regrow[k];
      g.t -= dt;
      if (g.t <= 0) {
        const i = g.i;
        if (S.state[i] === 1 && herNear(S.x[i], S.z[i], 1.1)) { g.t = 2; continue; }   // not up through her feet
        if (S.state[i] === 1) {
          S.state[i] = 0;
          const [a, b] = RECOVER.PLANT_GROW;
          anims.push({ type: 'grow', i, t: 0, dur: a + Math.random() * (b - a) });
          writeInstance(i, scaledMatrix(i, 0.04));
          ctx.markDirty();
        }
        regrow.splice(k, 1);
      }
    }
    // lazy reactors around the heroine
    scanT -= dt;
    if (scanT <= 0 && G.elements?.register) {
      scanT = 0.35;
      _fp.copy(G.player?.pos || G.env.focus);
      for (const [i, r] of reactors) {
        if (r.burning || r.charred && burn.has(i) || anims.some((a) => a.i === i)) continue;
        if (Math.hypot(S.x[i] - _fp.x, S.z[i] - _fp.z) > UNREG_R && !nearFire(i)) unregister(i);
      }
      if (reactors.size < MAX_REG) {
        registerAround(_fp.x, _fp.z, REG_R, false);
      }
    }
  }

  function treesNear(pos, r) {
    const out = [];
    each(pos.x, pos.z, r, (i, sp) => { if (sp.def.kind === 'tree' && S.state[i] !== 3 && S.state[i] !== 1 && S.state[i] !== 4) out.push(handle(i)); });
    return out;
  }

  return {
    update, fell, shatter, removeInRadius, treesNear, bouncePads, squashPad, wreck: wreckApi,
    stats() {
      let trees = 0, rocks = 0, plants = 0;
      for (let i = 0; i < S.n; i++) { const k = kindOf(i); if (k === 'tree') trees++; else if (k === 'plant') plants++; else rocks++; }
      return { trees, plants, rocksEtc: rocks, lakeSubmerged, lakeResampled:basinOriginal.size, colliders: nCol, reactors: reactors.size, burning: burn.size, anims: anims.length, pads: bouncePads.length };
    },
  };
}
