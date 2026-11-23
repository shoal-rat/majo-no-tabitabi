// Bee hives of the bee garden (apiary, src/world/builders/landmarks.js). LM_VAR=skep (default): a coiled straw skep under
// its straw hackle on a log stand; LM_VAR=box: a painted wooden hive of stacked lifts under a gabled lid on four legs.
// Replaces cones on cylinders and a cream box with a slate slab; about the same height (1.15 m / 0.95 m) on the same
// 0.6 m stand.
// INTENT
//  silhouette: skep — a bell of straw coils, a pointed thatched cap tied at the top; box — a white stepped tower with a
//    little roof, splayed legs.
//  eye rests on: the coil ridges and binding stitches; the dark entrance at the foot with its landing board; the lid.
//  wear: straw greyed on the weather side, the hive paint flaking to grey wood at the corners and the legs; moss on the
//    stands' feet.
//  not: cones, boxes, clean and new.
// Coordinates: metres, origin = ground level at the centre, +Y up, +Z = the entrance (faces the garden's middle).
import * as P from '../sdf.mjs';
import { hex, mix, ss, clamp, fbm, paintWood, mossCushions, paintMoss } from './lm_kit.mjs';
import { field, bunion } from './landmarks_lib.mjs';

const F = field();
const VAR = process.env.LM_VAR === 'box' ? 'box' : 'skep';

export default {
  name: 'lm_hive_' + VAR, id: 'sculpt_lm_hive_' + VAR,
  voxel: 0.005,
  fieldVoxel: [0.005, 0.01],
  lodField: [0, 1, 1],
  vcAll: true,
  lods: [3200, 1000, 320],
  ground: 0,
  aoRange: 0.18,
  aoStrength: 0.55,
  cavityDark: 0.4,
  cavity: [0.006, 0.03],
  creaseAngle: 42,
  bandSlack: 0.04,
  closeSheet: [[25, 2.2, 1.1, 0.6], [200, 2.2, 1.1, 0.6], [110, 1.8, 1.2, 0.6], [330, 1.4, 1.4, 0.7]],
  materials: { straw: { name: 'Straw', surface: 'thatch' }, wood: { name: 'Wood', surface: 'wood' }, paint: { name: 'Paint', surface: 'paint' }, moss: { name: 'Moss', surface: 'none' } },
  gameMats: { straw: 'Straw', wood: 'Wood', paint: 'Paint', moss: 'Moss' },
  notes: 'Sculpted bee hive ' + VAR + ' (landmarks apiary). Vertex colours on every LOD. Straw -> straw (thatch, no map), Wood -> wood, Paint -> cream (paint), Moss -> ivy.',

  build({ S }) {
    S.part('straw', { mat: 'straw', paint: paintStraw });
    S.part('wood', { mat: 'wood', paint: (c) => paintWood(c, ['#9c8064', '#735a44'], 'y') });
    S.part('woodx', { mat: 'wood', paint: (c) => paintWood(c, ['#9c8064', '#735a44'], 'x') });
    S.part('paint', { mat: 'paint', paint: paintHive });
    S.part('roof', { mat: 'paint', paint: (c) => mix(mix(hex('#8b9196'), hex('#a6abad'), c.edge * 0.6 + clamp(c.ny, 0, 1) * 0.2), hex('#4c5254'), c.cavity * 0.6) });
    S.part('dark', { mat: 'paint', paint: () => hex('#2a241e') });
    S.part('moss', { mat: 'moss', paint: paintMoss });
    const parts = [];
    if (VAR === 'skep') {
      // stand: a sawn log with a round board on it
      let log = P.cylinder(0.17, 0.3);
      if (!F) log = log.strata({ spacing: 0.03, depth: 0.004, width: 0.008, axis: 'x', seed: 111 }).rough({ type: 'fbm', scale: 0.04, amp: 0.003, seed: 112 });
      parts.push(log.part('wood'));
      parts.push(P.cylinder(0.34, 0.045).at(0, 0.3, 0).round(0.008).part('woodx'));
      // the skep: a bell of coils (profile), coil ridges, binding stitches, the entrance notch at the foot
      const B0 = 0.345;
      const bell = [[0, 0], [0.3, 0], [0.31, 0.06], [0.305, 0.2], [0.28, 0.32], [0.23, 0.42], [0.15, 0.49], [0.05, 0.52], [0, 0.52]];
      let skep = P.lathe(bell, { smooth: 0.02 });
      if (!F) {
        skep = skep.strata({ spacing: 0.035, depth: 0.007, width: 0.014, wobble: 0.003, axis: 'y', seed: 113 });
        // binding stitches: short vertical nicks staggered course by course
        for (let k = 1; k < 13; k += 2) {
          const y = 0.03 + k * 0.035, rr = interp(bell, y);
          if (rr < 0.08) continue;
          const n = Math.max(5, Math.round(rr * 20));
          const nick = P.box([0.008, 0.03, 0.03]).at(0, y, rr);
          skep = skep.cut(nick.around(n, (k % 2) * (180 / n)));
        }
      }
      skep = skep.cut(P.roundBox([0.12, 0.08, 0.2], 0.02).at(0, 0, 0.3));                // entrance
      parts.push(skep.at(0, B0, 0).part('straw'));
      // the hackle: a straw cap over the top, tied in a knot
      const hk = [[0, 0], [0.27, 0], [0.24, 0.06], [0.16, 0.16], [0.08, 0.26], [0.03, 0.33], [0, 0.34]];
      let hackle = P.lathe(hk, { smooth: 0.012 }).cut(P.lathe([[0, -0.01], [0.255, -0.01], [0.2, 0.06], [0, 0.17]]));
      if (!F) hackle = hackle.strata({ spacing: 0.02, depth: 0.004, width: 0.006, axis: 'x', seed: 114 }).rough({ type: 'fbm', scale: 0.03, amp: 0.003, seed: 115 });
      parts.push(hackle.at(0, B0 + 0.4, 0).part('straw'));
      parts.push(P.torus(0.04, 0.012).at(0, B0 + 0.69, 0).part('straw'));
    } else {
      // legs splayed, a floor with a landing board, three lifts each overhanging the one below, a gabled lid
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(P.capsule([sx * 0.27, 0, sz * 0.25], [sx * 0.21, 0.24, sz * 0.2], 0.025).part('wood'));
      parts.push(P.roundBox([0.5, 0.05, 0.48], 0.008).at(0, 0.26, 0).part('woodx'));
      parts.push(P.roundBox([0.36, 0.02, 0.14], 0.005).turn(18, 0, 0).at(0, 0.27, 0.29).part('woodx'));   // landing board
      let y = 0.285;
      for (const [w, h] of [[0.5, 0.2], [0.53, 0.2], [0.56, 0.18]]) {
        let lift = P.roundBox([w, h, w - 0.02], 0.008).at(0, y + h / 2, 0);
        lift = lift.add(moulding(w, h).at(0, y, 0));
        parts.push(lift.part('paint'));
        y += h - 0.03;
      }
      // entrance slot
      parts.push(P.box([0.22, 0.025, 0.05]).at(0, 0.3, 0.24).part('dark'));
      // the lid: a shallow gable, roof boards painted grey, ridge along x
      const top = y + 0.03;
      parts.push(P.roundBox([0.64, 0.06, 0.62], 0.01).at(0, top + 0.03, 0).part('paint'));
      const roof = P.extrude([[-0.37, 0], [0.37, 0], [0, 0.13]], 0.68, { round: 0.01 }).turn(0, 90, 0).at(0, top + 0.06, 0);
      parts.push(roof.part('roof'));
    }
    let all = bunion(S, parts);
    if (!F) {
      const rnd = S.prng(116);
      all = all.softAdd(mossCushions(rnd, VAR === 'skep' ? [[0.15, 0.0, -0.08, 0.05], [-0.1, 0.0, -0.15, 0.04]] : [[-0.27, 0.0, -0.25, 0.04]]).part('moss'), 0.01);
    }
    return all;
  },
};
function interp(prof, y) { for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return r0 + (r1 - r0) * (y - y0) / Math.max(1e-6, y1 - y0); } return 0; }
/** a skirt round the foot of a lift (the overlap of a WBC hive) */
function moulding(w, h) { return P.roundBox([w + 0.03, 0.035, w + 0.01], 0.006).at(0, 0.02, 0); }
function paintStraw(c) {
  const { x, y, z, nx, nz, cavity, edge } = c;
  let col = mix(hex('#dcc07a'), hex('#c4a560'), 0.5 + 0.5 * fbm(x * 30, y * 60, z * 30, 117, 2));
  col = mix(col, hex('#a7a08a'), clamp(-nx * 0.7 - nz * 0.3, 0, 1) * 0.35);          // greyed on the weather side
  col = mix(col, hex('#6e5a36'), clamp(cavity * 1.4, 0, 1) * 0.6);
  return mix(col, hex('#ead494'), edge * 0.4);
}
function paintHive(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(hex('#f1ead8'), hex('#e2d8c1'), 0.5 + 0.5 * fbm(x * 8, y * 8, z * 8, 118, 2));
  // paint flaking to grey wood at the corners and edges
  const flake = ss(0.3, 0.6, fbm(x * 25, y * 25, z * 25, 119, 2) + edge * 0.6);
  col = mix(col, hex('#9a9184'), flake * 0.6);
  return mix(col, hex('#7d725f'), clamp(cavity * 1.3, 0, 1) * 0.5);
}
