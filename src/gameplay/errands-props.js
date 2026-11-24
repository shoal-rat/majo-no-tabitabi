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
import { pieces } from '../world/rock-family.js';
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

/** A wide-brimmed felt traveller's hat with a red band and a pale feather (origin = the brim's centre). */
export function makeHat() {
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

/** The painter's easel with a small canvas (faces +z; origin on the ground). */
export function makeEasel() {
  const g = new THREE.Group(), wood = toon(0x7a5a3c), canvas = toon(0xeee6d2), paint = toon(0x7f9a6a), sky = toon(0xa9c0d8);
  for (const s of [-1, 1]) { const leg = box(0.04, 1.65, 0.04, wood, s * 0.26, 0.8, 0); leg.rotation.z = s * 0.12; g.add(leg); }
  const back = box(0.04, 1.6, 0.04, wood, 0, 0.78, -0.34); back.rotation.x = -0.32; g.add(back);
  g.add(box(0.62, 0.04, 0.06, wood, 0, 0.72, 0.03));
  g.add(box(0.58, 0.44, 0.025, canvas, 0, 0.97, 0.02));
  g.add(box(0.5, 0.12, 0.03, paint, 0, 0.86, 0.025));
  g.add(box(0.5, 0.2, 0.03, sky, 0, 1.05, 0.025));
  return bakeStatic(g);
}

/** A low field stone to sit on (top at 0.44 m; origin under the sitter's hips, the stone reaches back from there). */
export function makeSeat() {
  const g = new THREE.Group(), st = toon(0x9a958a);
  const s = cyl(0.3, 0.38, 0.44, st, 0, 0.22, -0.12, 9); s.scale.x = 1.25; s.scale.z = 0.7; g.add(s);
  return bakeStatic(g);
}

/**
 * The shepherd's stove: a squat iron box stove with a pipe and a pot. Returns { group, light(on), tick(t) } — the flame
 * glows through the door and smoke leaves the pipe while it burns (tick only near the camera).
 */
export function makeStove() {
  const g = new THREE.Group(), iron = toon(0x3e3a38), rust = toon(0x5a4438), stone = toon(0x8c877c), potM = toon(0x2e2c2b);
  const base = new THREE.Group();
  base.add(cyl(0.55, 0.6, 0.18, stone, 0, 0.09, 0, 10));
  base.add(box(0.62, 0.56, 0.52, iron, 0, 0.46, 0));
  base.add(box(0.66, 0.05, 0.56, rust, 0, 0.76, 0));
  base.add(cyl(0.07, 0.07, 1.25, iron, -0.18, 1.38, -0.12, 8));
  base.add(cyl(0.11, 0.08, 0.08, iron, -0.18, 2.03, -0.12, 8));
  base.add(cyl(0.17, 0.14, 0.2, potM, 0.12, 0.88, 0.04, 10));
  base.add(torus(0.12, 0.012, iron, 0.12, 1.02, 0.04, 6, 12));
  for (const s of [-1, 1]) base.add(box(0.04, 0.22, 0.04, iron, s * 0.26, 0.11, 0.2));
  g.add(bakeStatic(base));
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

/** The carter's handcart heaped with pumpkins (faces +z; origin on the ground between the wheels). */
export function makeCart() {
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

/** A long ice sheet (length along local z, width along x) floating on the ford; origin = its centre at the water line. */
export function makeIceSheet(len, wid) {
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
