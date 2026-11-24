// Standing stone (landmarks: the Stone Crown's outer ring, the moor circle, the kerb round the ancient tree; lying on
// its side where a stone has fallen). Replaces the plain boxes and the stretched dodecahedra of the first map round.
// The game scales it per stone (nominal 1.15 x 3.2 x 0.8 m, 0.4 m of it under the ground).
//   LM_VAR=a (default) | b — two stones; build each: LM_VAR=b node tools/sculpt/assets/landmarks_lib.mjs ...lm_standing.mjs
// INTENT
//  silhouette: an undressed slab of moorland grit set on end: broad faces, a ragged slanting top, one shoulder higher.
//  big forms: a few big fracture planes meeting at crisp edges; the crown rounded by millennia of rain.
//  eye rests on: the weathered crown with lichen rosettes, a split down one face, cup marks low on the broad face.
//  wear: lichen on the weather side (-X) and the top, moss and a damp dark band at the foot.
//  not: a box, a blob, symmetric.
// Coordinates: metres, origin = the foot centre (0.4 m below the ground line), +Y up, broad faces +-Z.
import * as P from '../sdf.mjs';
import { hex, mix, ss, clamp, paintStone, facetStone, stonePlanes, plane, cupMarks, GRIT } from './lm_kit.mjs';
import { field } from './landmarks_lib.mjs';

const F = field();
const VAR = process.env.LM_VAR || 'a';
const GROUND = 0.4;
const SEED = { a: 31, b: 47 }[VAR] || 31;

export default {
  name: 'lm_standing_' + VAR, id: 'sculpt_lm_standing_' + VAR,
  voxel: 0.012,
  fieldVoxel: [0.012, 0.022],
  lodField: [0, 1, 1],
  vcAll: true,
  lods: [2000, 700, 220],
  ground: GROUND,
  aoRange: 0.4,
  aoStrength: 0.5,
  cavityDark: 0.35,
  cavity: [0.015, 0.08],
  creaseAngle: 48,
  bandSlack: 0.05,
  closeSheet: [[25, 5, 1.6, 1.6], [200, 5, 1.6, 1.6], [110, 4, 1.6, 1.8], [330, 3, 1.7, 2.6]],
  materials: { stone: { name: 'Stone', surface: 'stone' } },
  gameMats: { stone: 'Stone' },
  notes: 'Sculpted standing stone ' + VAR + ' (landmarks outer ring, stone circle, tree kerb; also lying as a fallen stone). Vertex colours on every LOD. Stone -> carved-stone family. Scaled per stone.',

  build({ S }) {
    S.part('stone', { mat: 'stone', paint: (c) => paintStone(c, GRIT, { foot: GROUND, lichen: 1, moss: 0.8, streak: 0.7 }) });
    S.part('fresh', { mat: 'stone', paint: (c) => mix(hex('#d6d0c2'), hex('#b8b1a2'), c.cavity) });
    const rnd = S.prng(SEED);
    // a slab: two broad faces, narrow edges, a top slanting one way (variant b: a peaked, leaning top)
    const top = VAR === 'b'
      ? [plane([0.55, 1, 0.08], [0.1, 3.05, 0]), plane([-0.7, 1, -0.05], [-0.2, 3.0, 0])]
      : [plane([-0.35, 1, 0.12], [0, 3.1, 0]), plane([0.9, 0.6, 0], [0.5, 2.85, 0])];
    const planes = stonePlanes(rnd, { size: [0.6, 1.75, 0.42], c: [0, 1.5, 0], count: 9, cut: [0.95, 1.08], extra: [
      plane([0, -0.02, 1], [0, 0, 0.4]), plane([0.05, 0.02, -1], [0, 0, -0.4]), plane([1, -0.04, 0.1], [0.58, 0, 0]), plane([-1, 0.03, -0.08], [-0.56, 0, 0]), ...top,
    ] });
    let s = facetStone(planes, { k: 0.008, kSoft: 0.08, floor: 0, soft: (x, y) => ss(2.55, 3.05, y), bounds: [-0.9, 0, -0.7, 0.9, 3.5, 0.7] });
    if (!F) {
      s = s.rough({ type: 'fbm', scale: 0.25, amp: 0.012, seed: SEED + 1 });
      s = s.part('stone');
      s = s.crack(VAR === 'b' ? [[0.1, 2.9, 0.39], [0.18, 2.3, 0.4], [0.05, 1.6, 0.4], [0.12, 1.1, 0.4]] : [[-0.2, 3.0, -0.38], [-0.12, 2.4, -0.39], [-0.24, 1.8, -0.39]], { width: 0.04, jag: 0.03, seed: SEED + 2 });
      s = s.chip({ at: VAR === 'b' ? [-0.5, 2.7, 0.3] : [0.5, 2.6, -0.3], dir: VAR === 'b' ? [-1, 0.5, 1] : [1, 0.5, -1], depth: 0.14, spread: 0.55, seed: SEED + 3, paint: 'fresh' });
      s = cupMarks(s, [[-0.15, 1.1, 0.405, 0.055], [0.05, 1.18, 0.405, 0.045], [-0.05, 0.95, 0.405, 0.04]]);
    } else s = s.part('stone');
    return s;
  },
};
