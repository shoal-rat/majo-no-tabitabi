// Trilithon upright of the Stone Crown (trilithons, src/world/builders/landmarks.js). Replaces the 1.6 x h x 1.1 box: the
// game scales this 7.0 m stone to each upright's height (6.2 - 7.6 m), keeping the old base (0.5 m under the ground).
// INTENT
//  silhouette: a tall dressed sandstone pillar that tapers and swells a little (entasis), shoulders rounded by weather,
//    a knob of a tenon on top where the lintel sits.
//  big forms: four broad hammer-dressed faces, slightly convex, meeting at softened arrises.
//  eye rests on: the weathered crown (rain flutes running down from the top on the west face), a long crack, a
//    knocked-off shoulder, a ring of cup marks low on the inner face.
//  wear: lichen crusts and streaks on the weather side (-X), moss low and in the cracks, the foot damp and dark.
//  not: a box, smooth and even, the same on every side.
// Coordinates: metres, origin = the stone's base centre (0.5 m below the ground line), +Y up, the inner face (towards
// the circle's centre) is +Z, the long axis X.
import * as P from '../sdf.mjs';
import { hex, mix, ss, clamp, fbm, cell, paintStone, cupMarks, SARSEN } from './lm_kit.mjs';
import { field } from './landmarks_lib.mjs';

const F = field();
const H = 7.0, W = 1.6, D = 1.1, GROUND = 0.5;
// where the faces are after the taper and the warp below (for cutting details INTO the surface)
const sw = (y) => Math.sin((y / H) * Math.PI) * 0.045, lean = (y) => (y / H) * (y / H) * 0.06;
const westX = (y) => -(W / 2) * (1 - 0.022 * y) - sw(y) * 0.6 + lean(y);   // the -X (weather) face
const innerZ = (y) => (D / 2) * (1 - 0.022 * y) + sw(y) * 0.5;                // the +Z (inner) face

export default {
  name: 'lm_upright', id: 'sculpt_lm_upright',
  voxel: 0.016,
  fieldVoxel: [0.016, 0.028],
  lodField: [0, 1, 1],
  vcAll: true,
  lods: [3200, 1000, 300],
  ground: GROUND,
  aoRange: 0.5,
  aoStrength: 0.5,
  cavityDark: 0.35,
  cavity: [0.02, 0.1],
  creaseAngle: 50,
  bandSlack: 0.06,
  closeSheet: [[25, 9, 2.2, 3.5], [200, 9, 2.2, 3.5], [110, 6, 1.7, 2.5], [330, 5, 1.8, 4.5]],
  materials: { stone: { name: 'Sandstone', surface: 'stone' } },
  gameMats: { stone: 'Sandstone' },
  notes: 'Sculpted trilithon upright (landmarks trilithons). Vertex colours on every LOD. Material Sandstone merges into the carved-stone family. Scaled in y per upright.',

  build({ S }) {
    S.part('stone', { mat: 'stone', paint: paintUpright });
    S.part('fresh', { mat: 'stone', paint: (c) => mix(hex('#e8d8b8'), hex('#cdb894'), c.cavity) });
    // tapering, swelling block
    let s = P.roundBox([W, H, D], 0.16).at(0, H / 2, 0).taper(-0.022);
    s = s.warp((x, y, z, o) => {                       // entasis + a slight lean and twist of a hand-dressed stone
      const t = y / H, sw = Math.sin(t * Math.PI) * 0.045;
      o[0] = Math.sign(x) * sw * 0.6 + t * t * 0.06; o[2] = Math.sign(z) * sw * 0.5 + x * t * 0.012;
    }, { lip: 1.15, grow: 0.12 });
    s = s.add(P.ellipsoid([0.34, 0.16, 0.28]).at(0.05, H - 0.04, 0.02));      // tenon knob
    if (!F) {
      // the dressing: broad, gentle swells (no facets: chisel scoops read as holes on a stone this size), then the
      // hammer texture as a low roughness
      s = s.rough({ type: 'fbm', scale: 0.9, amp: 0.035, oct: 2, seed: 3 });
      s = s.rough({ type: 'fbm', scale: 0.3, amp: 0.01, seed: 4 });
      // rain flutes down the crown on the weather side
      for (let i = 0; i < 4; i++) {
        const z0 = -0.3 + i * 0.2, y1 = H - 1.0 - i * 0.25;
        s = s.groove([[westX(H - 0.1) + 0.01, H - 0.1, z0], [westX(H - 0.6) + 0.01, H - 0.6, z0 + 0.03], [westX(y1) + 0.01, y1, z0 + 0.02]], { width: 0.075 });
      }
      const ck = [H - 0.1, H - 1.2, H - 2.6, H - 3.4].map((y, i) => [[0.25, 0.18, 0.3, 0.22][i], y, innerZ(y) - 0.004]);
      s = s.crack(ck, { width: 0.04, jag: 0.035, seed: 5 });
      s = s.part('stone');
      s = s.chip({ at: [W / 2 - 0.1, H - 0.25, -D / 2 + 0.1], dir: [1, 0.7, -1], depth: 0.2, spread: 0.55, seed: 6, paint: 'fresh' });
      s = cupMarks(s, [[-0.35, 1.5, 0.085], [-0.13, 1.4, 0.075], [-0.28, 1.2, 0.07], [-0.5, 1.28, 0.065]].map(([x, y, r]) => [x, y, innerZ(y) + 0.01, r]));
    } else s = s.part('stone');
    return s;
  },
};

function paintUpright(c) {
  let col = paintStone(c, SARSEN, { foot: GROUND, lichen: 1, moss: 0.7, streak: 0.8 });
  // sun-bleached crown, darker damp-stained lower third
  col = mix(col, hex('#e6d8bc'), ss(H - 1.5, H, c.y) * clamp(c.ny + 0.4, 0, 1) * 0.35);
  col = mix(col, hex('#a69477'), ss(GROUND + 1.4, GROUND, c.y) * 0.25);
  return col;
}
