// Trilithon lintel of the Stone Crown (trilithons, src/world/builders/landmarks.js). Replaces the 4.6 x 1.0 x 1.2 box,
// same size and centre; also the fallen lintel and (scaled) the low altar stone in the middle of the horseshoe.
// INTENT
//  silhouette: a heavy dressed beam of sandstone, its long sides following the curve of the horseshoe, thicker at the
//    top edge than below (the builders' correction for the eye), shoulders worn round.
//  big forms: the curved beam; the two mortise hollows underneath where the tenons sit.
//  eye rests on: the rain-worn top with its moss cushions and lichen, the softened ends, a cracked corner.
//  not: a box, a straight bar, sharp new edges.
// Coordinates: metres, origin = the stone's centre, +Y up, long axis X, local -Z faces the circle's centre (curve).
import * as P from '../sdf.mjs';
import { hex, mix, ss, clamp, fbm, cell, paintStone, mossCushions, paintMoss, dropTo, SARSEN } from './lm_kit.mjs';
import { field } from './landmarks_lib.mjs';

const F = field();
const L = 4.6, Hh = 1.0, D = 1.2, R = 9.5;

export default {
  name: 'lm_lintel', id: 'sculpt_lm_lintel',
  voxel: 0.014,
  fieldVoxel: [0.014, 0.026],
  lodField: [0, 1, 1],
  vcAll: true,
  lods: [2400, 800, 260],
  ground: null,
  aoRange: 0.4,
  aoStrength: 0.45,
  cavityDark: 0.35,
  cavity: [0.02, 0.09],
  creaseAngle: 50,
  bandSlack: 0.06,
  closeSheet: [[25, 6, 1.2, 0], [200, 6, 1.2, 0], [110, 4, 2.2, 0], [330, 5, -1.2, 0]],
  materials: { stone: { name: 'Sandstone', surface: 'stone' }, moss: { name: 'Moss', surface: 'none' } },
  gameMats: { stone: 'Sandstone', moss: 'Moss' },
  notes: 'Sculpted trilithon lintel (landmarks trilithons; also the fallen lintel and the altar stone, scaled). Vertex colours on every LOD. Sandstone -> carved-stone family, Moss -> ivy.',

  build({ S }) {
    S.part('stone', { mat: 'stone', paint: paintLintel });
    S.part('fresh', { mat: 'stone', paint: (c) => mix(hex('#e8d8b8'), hex('#cdb894'), c.cavity) });
    S.part('moss', { mat: 'moss', paint: paintMoss });
    // the beam: a little wider at the top, ends rounded over
    let s = P.roundBox([L, Hh, D], 0.13).taper(0.06);
    s = s.warp((x, y, z, o) => { o[2] = -(x * x) / (2 * R) + (L * L) / (16 * R); o[1] = -0.04 * (x * x) / 5.3; }, { lip: 1.12, grow: 0.3 });
    if (!F) {
      // mortise hollows underneath (where the uprights' tenons sit)
      for (const mx of [-1.35, 1.35]) s = s.cut(P.ellipsoid([0.38, 0.19, 0.31]).at(mx, -Hh / 2 - 0.02, -(mx * mx) / (2 * R) + (L * L) / (16 * R)));
      s = s.rough({ type: 'fbm', scale: 0.8, amp: 0.03, oct: 2, seed: 13 });
      s = s.rough({ type: 'fbm', scale: 0.3, amp: 0.01, seed: 14 });
      // rain channels along the top
      s = s.groove([[-1.8, Hh / 2 + 0.005, 0.05], [-0.6, Hh / 2 + 0.01, 0.12], [0.7, Hh / 2 + 0.01, 0.02], [1.7, Hh / 2 - 0.01, 0.1]], { width: 0.09 });
      s = s.part('stone');
      s = s.chip({ at: [L / 2 - 0.12, Hh / 2 - 0.1, D / 2 - 0.25], dir: [1, 0.6, 0.8], depth: 0.22, spread: 0.6, seed: 15, paint: 'fresh' });
      // moss cushions on the top, mostly at the shaded north end
      const rnd = S.prng(16), at = [];
      for (let i = 0; i < 5; i++) {
        const x = -2.0 + rnd() * 1.6, z = (rnd() - 0.5) * 0.7 - (x * x) / (2 * R) + (L * L) / (16 * R), y = dropTo(s, x, z, 1.5);
        if (y != null) at.push([x, y, z, 0.1 + rnd() * 0.08]);
      }
      s = s.softAdd(mossCushions(rnd, at).part('moss'), 0.02);
    } else s = s.part('stone');
    return s;
  },
};

function paintLintel(c) {
  let col = paintStone(c, SARSEN, { foot: -10, lichen: 1, moss: 0.8, streak: 0.5 });
  col = mix(col, hex('#e8dabd'), clamp(c.ny, 0, 1) * 0.25);              // sun-bleached top
  col = mix(col, hex('#8c7e68'), clamp(-c.ny, 0, 1) * 0.25);             // the shaded underside
  return col;
}
