// Country bench (bench, src/world/builders/landmarks.js: the sea-view and north-wood benches, the flower valley, the
// hermit's porch). Replaces three thin boxes: same length (1.9 m), seat height (0.49 m) and depth.
// INTENT
//  silhouette: a sturdy carpenter's bench: two thick seat boards, plank legs with an arched cut-out, a sloping back of
//    one broad board and a top rail on two back posts.
//  big forms: the seat; the two end frames; the back.
//  eye rests on: the seat worn pale and dished in the middle, the round-over of the front edge, a knot, the pegs.
//  wear: silvered grey on top and on the weather end, moss in the foot of the legs, lichen spots on the top rail.
//  not: three boxes, sharp new timber, symmetric weathering.
// Coordinates: metres, origin = ground level at the bench centre, +Y up, +Z = the front (where one sits), length X.
import * as P from '../sdf.mjs';
import { hex, mix, ss, clamp, fbm, paintWood, mossCushions, paintMoss } from './lm_kit.mjs';
import { field, bunion } from './landmarks_lib.mjs';

const F = field();
const L = 1.9, SEAT = 0.49;

export default {
  name: 'lm_bench', id: 'sculpt_lm_bench',
  voxel: 0.006,
  fieldVoxel: [0.006, 0.012],
  lodField: [0, 1, 1],
  vcAll: true,
  lods: [3000, 1000, 320],
  ground: 0,
  aoRange: 0.2,
  aoStrength: 0.5,
  cavityDark: 0.35,
  cavity: [0.008, 0.035],
  creaseAngle: 40,
  bandSlack: 0.04,
  closeSheet: [[25, 2.6, 1.3, 0.5], [200, 2.6, 1.3, 0.5], [110, 2.2, 1.4, 0.5], [330, 1.8, 1.6, 0.4]],
  materials: { wood: { name: 'Wood', surface: 'wood' }, iron: { name: 'Iron', surface: 'metal' }, moss: { name: 'Moss', surface: 'none' } },
  gameMats: { wood: 'Wood', iron: 'Iron', moss: 'Moss' },
  notes: 'Sculpted country bench (landmarks bench, flower valley, hermit cottage). Vertex colours on every LOD. Wood -> wood family, Moss -> ivy.',

  build({ S }) {
    S.part('seat', { mat: 'wood', paint: paintSeat });
    S.part('frame', { mat: 'wood', paint: (c) => silver(paintWood(c, ['#a3876a', '#7a6149'], 'y'), c) });
    S.part('rail', { mat: 'wood', paint: (c) => silver(paintWood(c, ['#a3876a', '#7a6149'], 'x'), c) });
    S.part('moss', { mat: 'moss', paint: paintMoss });
    const parts = [];
    // seat: two boards with a gap, the front edge rounded over, dished in the middle
    for (const [z, w] of [[0.1, 0.22], [-0.13, 0.2]]) {
      let b = P.roundBox([L, 0.065, w], 0.018).at(0, SEAT - 0.033, z);
      if (!F) b = b.cut(P.ellipsoid([0.5, 0.012, 0.16]).at(-0.25, SEAT + 0.004, z)).cut(P.ellipsoid([0.45, 0.01, 0.15]).at(0.4, SEAT + 0.004, z));
      if (!F) b = b.rough({ type: 'fbm', scale: 0.05, amp: 0.0015, seed: 101 });
      parts.push(b.part('seat'));
    }
    // end frames: a plank leg with an arched foot cut, a bearer under the seat, a back post rising behind
    for (const s of [-1, 1]) {
      const x = s * 0.78;
      let leg = P.roundBox([0.06, SEAT - 0.065, 0.4], 0.01).at(x, (SEAT - 0.065) / 2, 0.0);
      leg = leg.cut(P.cylinder(0.11, 0.2).turn(0, 0, 90).at(x + 0.1, 0.0, 0.0));        // the arched foot
      parts.push(leg.part('frame'));
      parts.push(P.roundBox([0.09, 0.06, 0.5], 0.01).at(x, SEAT - 0.095, -0.01).part('rail'));
      const post = P.roundBox([0.06, 0.62, 0.07], 0.012).turn(-12, 0, 0).at(x, SEAT + 0.2, -0.235);
      parts.push(post.part('frame'));
      if (!F) for (const py of [SEAT - 0.095]) parts.push(P.cylinder(0.012, 0.012).turn(0, 0, 90).at(x + s * 0.045, py, 0.12).part('frame'));   // pegs
    }
    // stretcher between the legs, low
    parts.push(P.roundBox([1.56, 0.06, 0.05], 0.01).at(0, 0.14, -0.05).part('rail'));
    // back: one broad board and a top rail, sloping back
    const back = P.roundBox([L - 0.08, 0.17, 0.035], 0.012).turn(-12, 0, 0).at(0, SEAT + 0.24, -0.265);
    const top = P.roundBox([L, 0.06, 0.07], 0.018).turn(-12, 0, 0).at(0, SEAT + 0.47, -0.305);
    parts.push(back.part('rail'), top.part('rail'));
    let all = bunion(S, parts);
    if (!F) {
      const rnd = S.prng(102);
      all = all.softAdd(mossCushions(rnd, [[-0.78, 0.0, 0.17, 0.05], [0.78, 0.0, -0.2, 0.05], [-0.8, 0.0, -0.18, 0.04]]).part('moss'), 0.01);
    }
    return all;
  },
};
/** silver the timber where the weather gets at it (tops, the -X end) */
function silver(col, c) { return mix(col, hex('#aaa59c'), clamp(c.ny * 0.5 + 0.2 + ss(0.2, -0.9, c.x) * 0.3, 0, 1) * 0.5); }
function paintSeat(c) {
  let col = silver(paintWood(c, ['#a88a6a', '#806650'], 'x'), c);
  // sat on: pale, smooth, a little warm in the hollows
  const sit = clamp(c.ny, 0, 1) * (ss(0.75, 0.2, Math.abs(c.x + 0.25)) + ss(0.7, 0.2, Math.abs(c.x - 0.4))) * ss(-0.22, 0.05, c.z);
  col = mix(col, hex('#d2bf9f'), clamp(sit, 0, 1) * 0.45);
  // a dark knot
  const k = Math.hypot(c.x - 0.62, c.z + 0.1);
  return mix(col, hex('#4b3a2c'), ss(0.03, 0.012, k) * clamp(c.ny, 0, 1));
}
