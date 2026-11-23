// Hilltop cairn (cairn, src/world/builders/landmarks.js): the five lookout cairns where the ring courses start. Replaces
// seven stretched dodecahedra; the same height (2.1 m) and footprint (collider r 0.8 m), the top where the old top was.
// INTENT
//  silhouette: a slightly leaning, tapering stack of flat field stones, each laid by a walker, a pointed stone on top.
//  big forms: eight or nine stones from a broad, half-buried footing to a small cap, every one its own shape and tilt.
//  eye rests on: the dark gaps between the stones with little chinking stones pushed in, the top stone, the lichen.
//  wear: pale lichen on the tops and the weather side, moss low and on the north, the footing sunk in turf.
//  not: a column of identical pancakes, a single lump, symmetric.
// Coordinates: metres, origin = ground level at the centre, +Y up.
import * as P from '../sdf.mjs';
import { hex, mix, ss, clamp, fbm, paintStone, facetStone, stonePlanes, plane, mossCushions, paintMoss, GRIT } from './lm_kit.mjs';
import { field, bunion } from './landmarks_lib.mjs';

const F = field();
// stones: [radius x, radius z, thickness, lean of the stack at that level (x, z), turn]
const STONES = [[0.8, 0.68, 0.36], [0.7, 0.6, 0.3], [0.62, 0.55, 0.28], [0.55, 0.47, 0.26], [0.47, 0.41, 0.24], [0.4, 0.34, 0.22], [0.33, 0.28, 0.2], [0.26, 0.22, 0.2]];
const TOP = 2.1;

export default {
  name: 'lm_cairn', id: 'sculpt_lm_cairn',
  voxel: 0.009,
  fieldVoxel: [0.009, 0.018],
  lodField: [0, 1, 1],
  vcAll: true,
  lods: [4200, 1300, 420],
  ground: 0,
  aoRange: 0.25,
  aoStrength: 0.6,
  cavityDark: 0.4,
  cavity: [0.012, 0.05],
  creaseAngle: 46,
  bandSlack: 0.05,
  closeSheet: [[25, 4, 1.5, 1.0], [200, 4, 1.5, 1.0], [110, 3, 1.6, 1.2], [330, 2.5, 2.3, 1.6]],
  materials: { stone: { name: 'Stone', surface: 'stone' }, moss: { name: 'Moss', surface: 'none' } },
  gameMats: { stone: 'Stone', moss: 'Moss' },
  notes: 'Sculpted hilltop cairn (landmarks cairn): stacked field stones, chinking, a pointed top stone; 2.1 m like the old stack. Vertex colours on every LOD. Stone -> carved-stone family, Moss -> ivy.',

  build({ S }) {
    S.part('stone', { mat: 'stone', paint: paintCairn });
    S.part('moss', { mat: 'moss', paint: paintMoss });
    const rnd = S.prng(81);
    const list = [];
    let y = -0.12;                                   // the footing stone sits in the turf
    const n = STONES.length;
    for (let i = 0; i < n; i++) {
      const [rx, rz, t] = STONES[i];
      const lx = 0.06 * Math.sin(i * 0.9) + i * 0.012, lz = 0.05 * Math.cos(i * 1.3);
      const cy = y + t / 2;
      const pl = stonePlanes(rnd, { size: [rx, t * 0.62, rz], c: [0, 0, 0], count: 10, cut: [0.84, 1.0], noUnder: false, extra: [
        plane([(rnd() - 0.5) * 0.25, 1, (rnd() - 0.5) * 0.25], [0, t / 2, 0]), plane([(rnd() - 0.5) * 0.2, -1, (rnd() - 0.5) * 0.2], [0, -t / 2, 0]),
      ] });
      let s = facetStone(pl, { k: 0.01, kSoft: 0.05, floor: null, soft: (x, yy) => ss(0, t / 2, yy) * 0.7, bounds: [-rx - 0.1, -t, -rz - 0.1, rx + 0.1, t, rz + 0.1] });
      s = s.turn((rnd() - 0.5) * 6, rnd() * 360, (rnd() - 0.5) * 6).at(lx, cy, lz);
      list.push(s);
      y += t * 0.9;                                  // each stone settles a little into the one below
    }
    // the pointed top stone, set on end
    const tp = stonePlanes(rnd, { size: [0.13, 0.24, 0.1], c: [0, 0, 0], count: 9, cut: [0.86, 1.0], noUnder: false });
    list.push(facetStone(tp, { k: 0.01, kSoft: 0.04, floor: null, bounds: [-0.3, -0.4, -0.3, 0.3, 0.4, 0.3] }).turn(4, 30, -6).at(0.1, TOP - 0.2, 0.0));
    // chinking: small stones pushed into the joints, a few fallen at the foot
    for (let i = 0; i < 14; i++) {
      const lvl = Math.floor(rnd() * 5), a = rnd() * 6.28, R = STONES[lvl][0] * 0.88, yy = -0.12 + STONES.slice(0, lvl + 1).reduce((s2, st) => s2 + st[2] * 0.9, 0);
      const sp = stonePlanes(rnd, { size: [0.07 + rnd() * 0.05, 0.04, 0.06], c: [0, 0, 0], count: 8, noUnder: false });
      list.push(facetStone(sp, { k: 0.008, kSoft: 0.03, floor: null, bounds: [-0.2, -0.15, -0.2, 0.2, 0.15, 0.2] }).turn(0, rnd() * 360, 0).at(Math.sin(a) * R, yy, Math.cos(a) * R));
    }
    for (let i = 0; i < 6; i++) {
      const a = rnd() * 6.28, R = 0.85 + rnd() * 0.35;
      const sp = stonePlanes(rnd, { size: [0.12 + rnd() * 0.08, 0.07, 0.1], c: [0, 0, 0], count: 8, noUnder: false });
      list.push(facetStone(sp, { k: 0.008, kSoft: 0.04, floor: null, bounds: [-0.3, -0.2, -0.3, 0.3, 0.2, 0.3] }).turn(0, rnd() * 360, 0).at(Math.sin(a) * R, 0.0, Math.cos(a) * R));
    }
    let all = bunion(S, list).part('stone');
    if (!F) {
      all = all.rough({ type: 'fbm', scale: 0.12, amp: 0.006, seed: 82 }).part('stone');
      // moss in the lowest joints on the north side and round the foot
      // (the footing's top is at about 0.06 m, the second stone's at 0.33 m; radii 0.75 / 0.65)
      const at = [];
      for (let i = 0; i < 6; i++) { const a = Math.PI + (rnd() - 0.5) * 2.4, lv = i % 2, R = [0.66, 0.56][lv]; at.push([Math.sin(a) * R, [0.07, 0.34][lv], Math.cos(a) * R, 0.09]); }
      for (let i = 0; i < 4; i++) { const a = Math.PI + (rnd() - 0.5) * 2, R = 0.82 + rnd() * 0.1; at.push([Math.sin(a) * R, 0.0, Math.cos(a) * R, 0.12]); }
      all = all.softAdd(mossCushions(rnd, at).part('moss'), 0.02);
    }
    return all;
  },
};

function paintCairn(c) {
  const { x, y, z } = c;
  // every stone from a different field: per-layer tone (warm grit, grey, a reddish one)
  const k = Math.floor((y + 0.12) / 0.25 + 0.5 * fbm(x * 2, y * 2, z * 2, 83, 1));
  const base = [GRIT, ['#d3c6ab', '#b6a689'], GRIT, ['#cdbfae', '#ad9c88'], ['#d6cfbf', '#b4ac9c']][((k % 5) + 5) % 5];
  return paintStone(c, base, { foot: 0, lichen: 1, moss: 0.8, streak: 0.4 });
}
