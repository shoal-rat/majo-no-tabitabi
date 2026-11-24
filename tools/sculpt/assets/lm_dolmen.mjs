// The west dolmen (dolmen, src/world/builders/landmarks.js): three slab supports under a great capstone. Replaces three
// boxes and a stretched dodecahedron; the same supports' places, heights and turns, the capstone's top at the same
// height (the player's platform: a 1.9 m disc at 2.95 m), so the colliders stay.
// INTENT
//  silhouette: a huge, thick, slightly tilted table of grey grit resting on three leaning slabs, dark gap beneath.
//  big forms: the capstone's broad planes and ragged rim; the three slabs, each with its own lean.
//  eye rests on: the rim of the capstone (overhang, a big old spall on the north side), the dark chamber, cup marks on
//    the top, moss cushions where rain stands.
//  wear: lichen on the weather side and the top, moss on the north faces and in the chamber, damp feet.
//  not: a table on legs, regular, clean.
// Coordinates: metres, origin = site centre 0.3 m below the ground (the supports' foot), +Y up, as the builder's frame.
import * as P from '../sdf.mjs';
import { hex, mix, ss, clamp, paintStone, facetStone, stonePlanes, plane, cupMarks, mossCushions, paintMoss, dropTo, GRIT } from './lm_kit.mjs';
import { field } from './landmarks_lib.mjs';

const F = field();
const GROUND = 0.3;
const SUP = [[-1.4, -0.9, 2.2], [1.5, -0.7, 2.3], [0, 1.4, 2.1]];   // x, z, height (box 0.9 x h x 1.6, turned x * 0.5 rad)

export default {
  name: 'lm_dolmen', id: 'sculpt_lm_dolmen',
  voxel: 0.016,
  fieldVoxel: [0.016, 0.03],
  lodField: [0, 1, 1],
  vcAll: true,
  lods: [5000, 1600, 500],
  ground: GROUND,
  aoRange: 0.7,
  aoStrength: 0.55,
  cavityDark: 0.35,
  cavity: [0.02, 0.1],
  creaseAngle: 48,
  bandSlack: 0.06,
  closeSheet: [[25, 7, 1.6, 1.6], [200, 7, 1.6, 1.6], [110, 6, 1.7, 1.8], [330, 4.5, 3.6, 2.6]],
  materials: { stone: { name: 'Stone', surface: 'stone' }, moss: { name: 'Moss', surface: 'none' } },
  gameMats: { stone: 'Stone', moss: 'Moss' },
  notes: 'Sculpted dolmen (landmarks west_dolmen): three supports + capstone, the old supports placed exactly and the capstone top at the old platform height. Vertex colours on every LOD. Stone -> carved-stone family, Moss -> ivy.',

  build({ S }) {
    S.part('stone', { mat: 'stone', paint: (c) => paintStone(c, GRIT, { foot: GROUND, lichen: 1, moss: 1, streak: 0.6 }) });
    S.part('fresh', { mat: 'stone', paint: (c) => mix(hex('#d6d0c2'), hex('#b8b1a2'), c.cavity) });
    S.part('moss', { mat: 'moss', paint: paintMoss });
    const rnd = S.prng(61);
    const parts = [];
    // supports: thick slabs, broad faces +-x in their own frame, tops a little ragged, a slight lean
    for (const [i, [x, z, h]] of SUP.entries()) {
      const pl = stonePlanes(rnd, { size: [0.5, h * 0.55, 0.86], c: [0, h / 2, 0], count: 8, cut: [0.97, 1.12], extra: [
        plane([1, 0.03, 0.05], [0.45, 0, 0]), plane([-1, 0.02, -0.04], [-0.45, 0, 0]), plane([0.05, 0, 1], [0, 0, 0.8]), plane([0, 0, -1], [0, 0, -0.8]),
        plane([(rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3], [0, h + 0.05, 0]),
      ] });
      let s = facetStone(pl, { k: 0.014, kSoft: 0.1, floor: 0, soft: (px, py) => ss(h - 0.4, h, py), bounds: [-0.8, 0, -1.1, 0.8, h + 0.4, 1.1] });
      s = s.turn((rnd() - 0.5) * 3, 0, (i === 1 ? -3 : 3)).turn(0, x * 0.5 * 180 / Math.PI, 0).at(x, 0, z);
      parts.push(s);
    }
    // capstone: a thick irregular table, top near flat at 2.95 m, underside resting on the supports, turned like the old
    const cp = stonePlanes(rnd, { size: [2.55, 0.5, 1.95], c: [0, 2.58, 0], count: 13, cut: [0.84, 1.0], noUnder: false, extra: [
      plane([0.04, 1, -0.05], [0, 2.97, 0]), plane([0.05, -1, 0.06], [0, 2.17, 0]),
    ] });
    let cap = facetStone(cp, { k: 0.016, kSoft: 0.16, floor: null, soft: (x, y, z) => ss(2.75, 3.0, y) * 0.8, bounds: [-3, 1.9, -2.4, 3, 3.3, 2.4] });
    cap = cap.turn(0.06 * 57.3, 0.3 * 57.3, -0.08 * 57.3);
    if (!F) {
      cap = cap.rough({ type: 'fbm', scale: 0.35, amp: 0.016, seed: 62 }).part('stone');
      cap = cap.chip({ at: [-0.6, 2.55, -1.75], dir: [-0.2, -0.3, -1], depth: 0.3, spread: 0.6, seed: 63, paint: 'fresh' });
      cap = cup(cap);
    } else cap = cap.part('stone');
    let all = S.union(...parts.map((p) => (F ? p : p.rough({ type: 'fbm', scale: 0.5, amp: 0.025, oct: 2, seed: 64 }).rough({ type: 'fbm', scale: 0.2, amp: 0.008, seed: 65 })).part('stone')), cap);
    if (!F) {
      // moss cushions in the hollows of the capstone's top and at the supports' feet on the north
      const at = [];
      for (let i = 0; i < 6; i++) {
        const a = rnd() * 6.28, r = 0.3 + rnd() * 1.0, x = Math.cos(a) * r, z = Math.sin(a) * r, y = dropTo(cap, x, z, 4);
        if (y != null) at.push([x, y, z, 0.12 + rnd() * 0.08]);
      }
      for (const [x, z] of [[-1.2, -1.5], [1.2, -1.3], [0.4, 1.0]]) at.push([x, 0.42, z, 0.18]);
      all = all.softAdd(mossCushions(rnd, at).part('moss'), 0.02);
    }
    return all;
  },
};
// cup marks pecked into the top of the capstone
function cup(s) { return cupMarks(s, [[0.4, 2.97, 0.3, 0.07], [0.62, 2.97, 0.12, 0.06], [0.25, 2.97, -0.05, 0.05], [-0.8, 2.96, 0.6, 0.06]].map(([x, y, z, r]) => [x, y + 0.02, z, r])); }
