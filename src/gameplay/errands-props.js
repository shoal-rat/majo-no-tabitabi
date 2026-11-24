// Small props of the roadside errands (src/gameplay/errands.js): the painter's felt hat and easel, the shepherd's
// iron stove, the carter's handcart, a sitting stone, the ice sheet over the ford; and the sculpted-prop helper the open
// country's activity props share (wilds-puzzles.js briar / rubble / pack chest, wilds-rings.js ring gates).
// Sculpted props (round art-props, tools/sculpt/assets/props_activity_lib.mjs): vertex-coloured GLBs with three LODs,
// G.sculpt type 'props-activity' (core/assets.js; ?sculpt=0 or a list without it builds the old primitives). Nothing here
// has words.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { box, cyl, cone, sphere, torus, bakeStatic } from '../core/geo.js';
import { toon, glowDynamic, own } from '../core/mats.js';
import { mulberry32 } from '../core/util.js';
import { pieces, NEUTRAL } from '../world/rock-family.js';
import { sculptVcMat } from '../world/builders/kit.js';

// ---- sculpted props ------------------------------------------------------------------------------------------------
/** is sculpt asset `id` of the activity props in use (switch on, asset loaded)? */
export const propsSculptOn = (id) => !!G.sculpt?.on?.('props-activity') && !!G.assets?.raw?.(id);

/**
 * Which LOD shows from which camera distance, by quality tier (k scales the distances to the object's size):
 * phones and low start on the middle LOD, med / high on the full one.
 */
function lodPlan(k = 1) {
  const q = G.quality || { name: 'high' };
  if (q.mobile) return [[1, 0], [2, 12 * k]];
  if (q.name === 'low') return [[1, 0], [2, 24 * k]];
  if (q.name === 'med') return [[0, 0], [1, 14 * k], [2, 42 * k]];
  return [[0, 0], [1, 22 * k], [2, 64 * k]];
}

/** a vertex-coloured copy of a toon material (white: the GLB's colour is the albedo), tinted when `tint` is given */
export function propMat(hex, opts, tint = null) {
  const m = sculptVcMat(toon(hex, opts));
  if (!tint) return m;
  const t = own(m); t.color.copy(tint); return t;
}

/**
 * A sculpted prop as a THREE.LOD (levels by lodPlan, switched by three each frame against the camera): each level a
 * group of meshes, one per primitive of that LOD (material by its GLB material name from `mats`, `mats['*']` for the
 * rest). Geometry is shared by every instance (never edit it). null when the asset is missing or the switch is off.
 * opts: { k (LOD distance scale), cast, recv, name, levels: [[lod, dist], ...] (overrides the plan) }.
 */
export function sculptedProp(id, mats, { k = 1, cast = true, recv = true, name = '', levels = null } = {}) {
  if (!propsSculptOn(id)) return null;
  const lod = new THREE.LOD();
  lod.name = name || id;
  for (const [l, d] of levels || lodPlan(k)) {
    const by = pieces(id, l);
    if (!by) continue;
    const g = new THREE.Group();
    for (const [mn, geo] of Object.entries(by)) {
      const mat = mats[mn] || mats['*'];
      if (!mat) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast; mesh.receiveShadow = recv;
      g.add(mesh);
    }
    lod.addLevel(g, d);
  }
  return lod.levels.length ? lod : null;
}

// ---- the errands' props -------------------------------------------------------------------------------------------
// tools/sculpt/assets/{hat_felt,easel_painter,stove_iron,cart_hand,seat_stone}.mjs; the ice sheet is built here (its
// length follows the ford). Each maker falls back to the first round's primitives when the sculpt is off.
let _em = null;
function errandMats() {
  if (_em) return _em;
  const D = THREE.DoubleSide;
  _em = {
    hat: { HatFelt_cloth: propMat(0x5b4a3b, { surface: 'cloth', look: { detail: 0.3, rim: 0.4, wrap: 0.45 } }),
      HatFeather_none: propMat(0xece4cf, { side: D, surface: 'none', look: { trans: 0.3, rim: 0.35, wrap: 0.5 } }) },
    easel: { EaselWood_wood: propMat(0x7a5a3c, { surface: 'wood', look: { detail: 0.3, rim: 0.3 } }),
      EaselPaint_none: propMat(0xeee6d2, { surface: 'none', look: { rim: 0.25, wrap: 0.35 } }) },
    stove: { StoveIron_metal: propMat(0x3e3a38, { surface: 'metal', look: { spec: 0.4, specPower: 36, rim: 0.4 } }),
      StoveStone_stone: propMat(0x8c877c, { surface: 'stone', look: { detail: 0.3, rim: 0.22, wrap: 0.3 } }),
      StoveWood_bark: propMat(0x5e4636, { surface: 'bark', look: { detail: 0.3, rim: 0.25 } }) },
    cart: { CartWood_wood: propMat(0x86653f, { surface: 'wood', look: { detail: 0.35, rim: 0.3 } }),
      CartIron_metal: propMat(0x4d4a48, { surface: 'metal', look: { spec: 0.45, specPower: 40, rim: 0.4 } }),
      CartCrop_none: propMat(0xd9822e, { surface: 'none', look: { rim: 0.3, wrap: 0.4, spec: 0.15 } }) },
    // the sitting stone: the old stone's warm grey over the GLB's neutral paint
    seat: { SeatStone_rock: propMat(0xa59c90, { surface: 'stone', look: { detail: 0.35, bump: 0.4, rim: 0.22, wrap: 0.3 } }, new THREE.Color(0x9a958a).multiplyScalar(1 / NEUTRAL)),
      Moss_none: propMat(0x6c8a4a, { surface: 'none', look: { rim: 0.3, wrap: 0.5 } }) },
  };
  return _em;
}

/** The painter's felt hat: rolled, waved brim, pinched crown, red band and bow, barred feather (origin = the brim's centre). */
export function makeHat() {
  const h = sculptedProp('sculpt_hat_felt', errandMats().hat, { k: 0.3, recv: false });
  if (!h) return oldHat();
  h.name = 'errand_hat';
  return h;
}
/** The painter's field easel with a painted canvas and his paint box at its foot (faces +z; origin on the ground). */
export function makeEasel() {
  const e = sculptedProp('sculpt_easel_painter', errandMats().easel, { k: 0.6 });
  if (!e) return oldEasel();
  e.name = 'errand_easel';
  return e;
}
/** A low field stone to sit on (top at 0.44 m; origin under the sitter's hips, the stone reaches back from there). */
export function makeSeat() {
  const s = sculptedProp('sculpt_seat_stone', errandMats().seat, { k: 0.4 });
  if (!s) return oldSeat();
  s.name = 'errand_seat';
  return s;
}

/**
 * The shepherd's stove: a squat cast-iron stove with a flue, a pot and a hearth slab. Returns { group, light(on), tick(t) }
 * — the flame glows through the barred door and smoke leaves the pipe while it burns (tick only near the camera).
 */
export function makeStove() {
  const g = new THREE.Group();
  g.add(sculptedProp('sculpt_stove_iron', errandMats().stove, { k: 0.8, name: 'errand_stove' }) || oldStoveBase());
  const doorMat = glowDynamic(0xff8a3a, 0.05);
  const door = box(0.26, 0.2, 0.02, doorMat, 0, 0.42, 0.265); g.add(door);
  const flame = new THREE.Group();
  const outer = cone(0.12, 0.32, glowDynamic(0xff7a2a, 1.6, { transparent: true, opacity: 0.85, depthWrite: false }), 0, 0.16, 0, 8);
  const inner = cone(0.07, 0.22, glowDynamic(0xffd27a, 2.0, { transparent: true, opacity: 0.9, depthWrite: false }), 0, 0.11, 0, 8);
  flame.add(outer, inner); flame.position.set(0, 0.36, 0.27); flame.visible = false;
  for (const m of [outer, inner, door]) m.castShadow = false;
  g.add(flame);
  let lit = false;
  return {
    group: g,
    get lit() { return lit; },
    light(on) { lit = !!on; flame.visible = lit; doorMat.userData.setGlow?.(lit ? 1.8 : 0.05); },
    tick(t) {
      if (!lit) return;
      outer.scale.set(1 + 0.1 * Math.sin(t * 13), 1 + 0.2 * Math.sin(t * 9.3), 1);
      inner.scale.y = 1 + 0.25 * Math.sin(t * 15.7);
      doorMat.userData.setGlow?.(1.6 + 0.3 * Math.sin(t * 7.1) * Math.sin(t * 3.3));
    },
    /** world position of the pipe's mouth (smoke) */
    pipe: new THREE.Vector3(-0.18, 2.1, -0.12),
  };
}

/** The carter's handcart: spoked wheels, plank bed, shafts, ribbed pumpkins on straw (faces +z; origin on the ground between the wheels). */
export function makeCart() {
  const c = sculptedProp('sculpt_cart_hand', errandMats().cart, { k: 0.8 });
  if (!c) return oldCart();
  c.name = 'errand_cart';
  return c;
}

/**
 * A long ice sheet (length along local z, width along x) floating on the ford; origin = its centre at the water line.
 * Sculpted (switch on): floes of jagged outline split by dark seams, bevelled frosty rims over clear blue middles, the top
 * 0.34 m over the water line (the brook's ripples never wash over it), hairline cracks on the plates and air bubbles
 * caught under the surface (finer tiers). One transparent vertex-coloured mesh.
 */
export function makeIceSheet(len, wid) {
  if (!G.sculpt?.on?.('props-activity')) return oldIceSheet(len, wid);
  const q = G.quality || { name: 'high' }, fine = !q.mobile && q.name !== 'low';
  const rnd = mulberry32(Math.round(len * 1000 + wid * 37) >>> 0);
  const TOP = 0.34, BOT = -0.12, BEV = 0.04, GAP = 0.035;
  const pos = [], nrm = [], col = [], idx = [];
  const cTop = new THREE.Color(0xd6eefc), cMid = new THREE.Color(0xa9d6f2), cRim = new THREE.Color(0xf4fbff), cSide = new THREE.Color(0x9fd0ee), cCrack = new THREE.Color(0x7fb3d6), cBub = new THREE.Color(0xffffff);
  const v = (x, y, z, nx, ny, nz, c) => { pos.push(x, y, z); nrm.push(nx, ny, nz); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  // seams across the strip (jagged polylines left -> right), floes between them; some floes split along the strip
  const seams = [], step = wid / 5;
  const seam = (z0) => { const pts = []; for (let x = -wid / 2; x <= wid / 2 + 1e-6; x += step) pts.push([x, z0 + (rnd() - 0.5) * 0.5]); return pts; };
  seams.push(Array.from({ length: 6 }, (_, i) => [-wid / 2 + i * step, -len / 2]));
  for (let z = -len / 2 + 1.4 + rnd(); z < len / 2 - 1.0; z += 1.3 + rnd() * 1.4) seams.push(seam(z));
  seams.push(Array.from({ length: 6 }, (_, i) => [-wid / 2 + i * step, len / 2]));
  const floes = [];
  for (let k = 0; k + 1 < seams.length; k++) {
    const a = seams[k], b = seams[k + 1];
    if (rnd() < 0.45) {   // split along the strip at a jagged middle line
      const sx = (rnd() - 0.5) * wid * 0.3, j = Math.round((sx + wid / 2) / step);
      const ji = Math.max(1, Math.min(4, j));
      floes.push([...a.slice(0, ji + 1), ...b.slice(0, ji + 1).reverse()]);
      floes.push([...a.slice(ji), ...b.slice(ji).reverse()]);
    } else floes.push([...a, ...b.slice().reverse()]);
  }
  const _o = new THREE.Vector3();
  for (const poly of floes) {
    // centroid, inset by the seam gap; the plate's own height
    let cx = 0, cz = 0; for (const [x, z] of poly) { cx += x; cz += z; } cx /= poly.length; cz /= poly.length;
    const inset = (p, d) => { const dx = p[0] - cx, dz = p[1] - cz, l = Math.hypot(dx, dz) || 1; const k = Math.max(0, (l - d) / l); return [cx + dx * k, cz + dz * k]; };
    const outer = poly.map((p) => inset(p, GAP)), inner = poly.map((p) => inset(p, GAP + BEV));
    const top = TOP + (rnd() - 0.5) * 0.04, n = poly.length;
    // top: a fan, clear blue in the middle, frosting toward the rim
    const c0 = v(cx, top, cz, 0, 1, 0, cMid);
    const ring = inner.map(([x, z]) => v(x, top, z, 0, 1, 0, cTop));
    for (let i = 0; i < n; i++) idx.push(c0, ring[(i + 1) % n], ring[i]);
    // bevelled rim and sides
    const rimT = inner.map(([x, z], i) => { _o.set(outer[i][0] - cx, 0, outer[i][1] - cz).normalize(); return v(x, top, z, _o.x * 0.6, 0.8, _o.z * 0.6, cRim); });
    const rimB = outer.map(([x, z]) => { _o.set(x - cx, 0, z - cz).normalize(); return v(x, top - BEV, z, _o.x * 0.6, 0.8, _o.z * 0.6, cRim); });
    const sT = outer.map(([x, z]) => { _o.set(x - cx, 0, z - cz).normalize(); return v(x, top - BEV, z, _o.x, 0, _o.z, cSide); });
    const sB = outer.map(([x, z]) => { _o.set(x - cx, 0, z - cz).normalize(); return v(x, BOT, z, _o.x, 0, _o.z, cSide); });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(rimT[i], rimT[j], rimB[j], rimT[i], rimB[j], rimB[i]);
      idx.push(sT[i], sT[j], sB[j], sT[i], sB[j], sB[i]);
    }
    if (!fine) continue;
    // hairline cracks: a thin zig-zag from a rim point toward the middle
    for (let c = 0; c < 2; c++) {
      const s0 = inner[Math.floor(rnd() * n)];
      let px = s0[0], pz = s0[1];
      for (let k = 0; k < 4; k++) {
        const tx = px + (cx - px) * (0.25 + rnd() * 0.15) + (rnd() - 0.5) * 0.3, tz = pz + (cz - pz) * (0.25 + rnd() * 0.15) + (rnd() - 0.5) * 0.3;
        const dx = tx - px, dz = tz - pz, l = Math.hypot(dx, dz) || 1, w = 0.009 * (1 - k * 0.2), ox = -dz / l * w, oz = dx / l * w, y = top + 0.003;
        const a = v(px + ox, y, pz + oz, 0, 1, 0, cCrack), b = v(px - ox, y, pz - oz, 0, 1, 0, cCrack), cc = v(tx - ox, y, tz - oz, 0, 1, 0, cCrack), d = v(tx + ox, y, tz + oz, 0, 1, 0, cCrack);
        idx.push(a, cc, b, a, d, cc);
        px = tx; pz = tz;
      }
    }
    // air bubbles caught under the surface: small white discs seen through the clear top
    for (let b = 0; b < 5; b++) {
      const t = rnd() * 0.6, a = rnd() * Math.PI * 2, pi = inner[Math.floor(rnd() * n)];
      const bx = cx + (pi[0] - cx) * t + Math.cos(a) * 0.05, bz = cz + (pi[1] - cz) * t + Math.sin(a) * 0.05, r = 0.025 + rnd() * 0.045, y = top - 0.05 - rnd() * 0.08;
      const m0 = v(bx, y, bz, 0, 1, 0, cBub), rr = [];
      for (let k = 0; k < 6; k++) { const aa = (k / 6) * Math.PI * 2; rr.push(v(bx + Math.cos(aa) * r, y, bz + Math.sin(aa) * r * 0.8, 0, 1, 0, cTop)); }
      for (let k = 0; k < 6; k++) idx.push(m0, rr[(k + 1) % 6], rr[k]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeBoundingSphere();
  const mat = toon(0xffffff, { vertexColors: true, transparent: true, opacity: 0.88, surface: 'none', look: { spec: 1, specPower: 80, rim: 0.6 } });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 4; mesh.castShadow = false; mesh.receiveShadow = true;
  const g = new THREE.Group(); g.add(mesh);
  g.name = 'errand_ice';
  return g;
}

// ---- the first round's primitives (sculpt switch off) ---------------------------------------------------------------
function oldHat() {
  const g = new THREE.Group();
  const felt = toon(0x5b4a3b), dark = toon(0x433629), band = toon(0x9a3b33), quill = toon(0xece4cf);
  g.add(cyl(0.31, 0.31, 0.022, felt, 0, 0, 0, 22));
  g.add(cyl(0.135, 0.165, 0.16, felt, 0, 0.09, 0, 16));
  g.add(cyl(0.12, 0.135, 0.02, dark, 0, 0.175, 0, 16));
  g.add(cyl(0.168, 0.168, 0.045, band, 0, 0.035, 0, 16));
  const f = new THREE.Group();
  f.add(box(0.018, 0.006, 0.26, quill, 0, 0, 0.11));
  const vane = sphere(0.04, quill, 0, 0, 0.17, 6, 4); vane.scale.set(0.5, 0.15, 2.0); f.add(vane);
  f.position.set(0.16, 0.06, 0); f.rotation.set(-0.55, 0.4, 0.2);
  g.add(f);
  const baked = bakeStatic(g, { castShadow: true, receiveShadow: false });   // one draw per material, moved as a whole
  baked.name = 'errand_hat';
  return baked;
}
function oldEasel() {
  const g = new THREE.Group(), wood = toon(0x7a5a3c), canvas = toon(0xeee6d2), paint = toon(0x7f9a6a), sky = toon(0xa9c0d8);
  for (const s of [-1, 1]) { const leg = box(0.04, 1.65, 0.04, wood, s * 0.26, 0.8, 0); leg.rotation.z = s * 0.12; g.add(leg); }
  const back = box(0.04, 1.6, 0.04, wood, 0, 0.78, -0.34); back.rotation.x = -0.32; g.add(back);
  g.add(box(0.62, 0.04, 0.06, wood, 0, 0.72, 0.03));
  g.add(box(0.58, 0.44, 0.025, canvas, 0, 0.97, 0.02));
  g.add(box(0.5, 0.12, 0.03, paint, 0, 0.86, 0.025));
  g.add(box(0.5, 0.2, 0.03, sky, 0, 1.05, 0.025));
  return bakeStatic(g);
}
function oldSeat() {
  const g = new THREE.Group(), st = toon(0x9a958a);
  const s = cyl(0.3, 0.38, 0.44, st, 0, 0.22, -0.12, 9); s.scale.x = 1.25; s.scale.z = 0.7; g.add(s);
  return bakeStatic(g);
}
function oldStoveBase() {
  const iron = toon(0x3e3a38), rust = toon(0x5a4438), stone = toon(0x8c877c), potM = toon(0x2e2c2b);
  const base = new THREE.Group();
  base.add(cyl(0.55, 0.6, 0.18, stone, 0, 0.09, 0, 10));
  base.add(box(0.62, 0.56, 0.52, iron, 0, 0.46, 0));
  base.add(box(0.66, 0.05, 0.56, rust, 0, 0.76, 0));
  base.add(cyl(0.07, 0.07, 1.25, iron, -0.18, 1.38, -0.12, 8));
  base.add(cyl(0.11, 0.08, 0.08, iron, -0.18, 2.03, -0.12, 8));
  base.add(cyl(0.17, 0.14, 0.2, potM, 0.12, 0.88, 0.04, 10));
  base.add(torus(0.12, 0.012, iron, 0.12, 1.02, 0.04, 6, 12));
  for (const s of [-1, 1]) base.add(box(0.04, 0.22, 0.04, iron, s * 0.26, 0.11, 0.2));
  return bakeStatic(base);
}
function oldCart() {
  const g = new THREE.Group(), wood = toon(0x86653f), dark = toon(0x4f3c2a), pump = toon(0xd9822e), pump2 = toon(0xc46a22), stem = toon(0x5a6a30);
  g.add(box(1.1, 0.08, 1.7, wood, 0, 0.62, 0));
  for (const s of [-1, 1]) { g.add(box(0.06, 0.32, 1.7, wood, s * 0.55, 0.8, 0)); }
  g.add(box(1.1, 0.32, 0.06, wood, 0, 0.8, -0.85));
  for (const s of [-1, 1]) { const w = torus(0.38, 0.05, dark, s * 0.62, 0.42, 0.1, 6, 16); w.rotation.y = Math.PI / 2; g.add(w); const hub = cyl(0.07, 0.07, 0.12, dark, s * 0.62, 0.42, 0.1, 8); hub.rotation.z = Math.PI / 2; g.add(hub); }
  for (const s of [-1, 1]) { const h = box(0.05, 0.05, 1.0, dark, s * 0.45, 0.7, 1.25); h.rotation.x = 0.25; g.add(h); }
  const pts = [[-0.25, -0.4], [0.25, -0.35], [0, 0.05], [-0.28, 0.45], [0.27, 0.5], [0.02, -0.02]];
  pts.forEach(([x, z], i) => { const p = sphere(0.24 - (i % 3) * 0.03, i % 2 ? pump : pump2, x, 0.88 + (i === 5 ? 0.25 : 0), z, 10, 7); p.scale.y = 0.78; g.add(p); g.add(cyl(0.02, 0.03, 0.08, stem, x, 1.06 + (i === 5 ? 0.25 : 0), z, 5)); });
  const baked = bakeStatic(g);
  baked.name = 'errand_cart';
  return baked;
}
function oldIceSheet(len, wid) {
  const g = new THREE.Group();
  const top = toon(0xdff2ff, { transparent: true, opacity: 0.9, surface: 'none', look: { spec: 1, specPower: 80, rim: 0.6 } });
  const side = toon(0x9fd0ee, { transparent: true, opacity: 0.85, surface: 'none' });
  // top 0.34 m over the water line, so the brook's ripples never wash over it
  const slab = box(wid, 0.46, len, top, 0, 0.11, 0); slab.renderOrder = 4; g.add(slab);
  for (let k = 0; k < 7; k++) { const f = box(wid * (0.3 + 0.15 * (k % 3)), 0.3, 1.2 + (k % 2), side, (k % 2 ? 1 : -1) * wid * 0.42, 0.06, -len / 2 + (k + 0.5) * len / 7); f.rotation.y = 0.3 * (k % 3 - 1); g.add(f); }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
  g.name = 'errand_ice';
  return g;
}
