// folk_basket — a market basket carried by the City of Magic residents (src/world/builders/mage-folk.js: it hangs from
// the hand bone of the baked crowd body, upright, the grip anchor in the hand). Origin = foot centre, +Z = the
// resident's front, the bail runs front to back (held at the side).
// INTENT
//  silhouette: a deep oval withy basket with a tall bentwood bail, a cloth folded over one end, loaves and apples
//    showing at the other.
//  big forms: the woven body / the thick rim / the bail.
//  the eye rests on: the checked cloth, the round loaf and the red apples, the straw bindings at the bail roots.
//  wear: rods silvered toward the rim, a darker base, the bail rubbed pale where the hand holds it.
//  must NOT look like: the berry basket (wide, low), a bucket, a box.
//   SCULPT_THREADS=2 node tools/sculpt/assets/_smallprops.mjs tools/sculpt/assets/folk_basket.mjs [--quick]
import * as P from '../sdf.mjs';
import { pickMats, withyWeave, strawPaint, apple, applePaint, stalkPaint, ropePaint, FAR, C, mix, ss } from './containers_lib.mjs';

const RX = 0.17, RZ = 0.12, H = 0.17, WALL = 0.012, FLOOR = 0.018, BAIL = 0.39;
// outside profile (radius along x; z is scaled by RZ / RX)
const OUT = [[0.12, 0.0], [0.145, 0.03], [0.162, 0.08], [0.17, 0.13], [RX, H]];

export default {
  name: 'folk_basket', id: 'sculpt_folk_basket',
  voxel: 0.0018, lods: [2400, 800, 300], farFrom: 2, farVoxel: 2.2,
  ground: 0, aoRange: 0.05, cavity: [0.003, 0.016], creaseAngle: 40,
  materials: pickMats('straw', 'food', 'fruit'),
  anchors: { grip: [0, BAIL, 0] },
  notes: 'Market basket for the City of Magic residents (oval withy body, bentwood bail along z with straw bindings, a checked cloth, a loaf, apples). Vertex colours on every LOD, no textures: drawn instanced and posed to a hand on the CPU (builders/mage-folk.js).',

  build() {
    const far = FAR();
    const prof = [[0, 0], ...OUT, [RX - WALL, H - 0.006]];
    for (let i = OUT.length - 2; i >= 1; i--) prof.push([OUT[i][0] - WALL, Math.max(FLOOR, OUT[i][1])]);
    prof.push([0, FLOOR]);
    let body = P.lathe(prof, { smooth: 0.003 }).scale([1, 1, RZ / RX]);
    body = withyWeave(body, { y0: 0.01, y1: H - 0.014, pitch: 0.016, stakes: 22, amp: 0.0024, groove: 0.0018, far });
    let all = body.part('fb_weave', { mat: 'straw', paint: weavePaint });
    let rim = P.torus(RX - WALL / 2, 0.011).scale([1, 0.85, RZ / RX]).at(0, H - 0.002, 0);
    all = all.add(rim.part('fb_rim', { mat: 'straw', paint: strawPaint({ light: '#d8b676', dark: '#ac8a52' }) }));
    // the bail: a split-wood strip bent over front to back, a little proud, ends sunk inside the rim
    const R = RZ - 0.01, bp = [];
    for (let i = 0; i <= 14; i++) { const a = Math.PI * i / 14; bp.push([0.004 * Math.sin(a), H - 0.03 + Math.sin(a) * (BAIL - H + 0.03), -Math.cos(a) * R]); }
    const bail = P.tube(bp, 0.009, { aspect: 1.8, up: [1, 0, 0] });
    all = all.add(bail.part('fb_bail', { mat: 'straw', paint: (c) => mix(mix(C('#a8804e'), C('#d8b880'), c.edge * 0.6 + 0.5 * ss(BAIL - 0.04, BAIL, c.y)), C('#4a3420'), c.cavity * 0.6) }));
    if (!far) {
      let bind = null;
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 16; i++) { const t = i / 16, a = t * Math.PI * 6; pts.push([Math.cos(a) * 0.015, H - 0.016 + t * 0.036, s * R + Math.sin(a) * 0.015]); }
        const w = P.tube(pts, 0.004, { smooth: false });
        bind = bind ? bind.add(w) : w;
      }
      all = all.add(bind.part('fb_bind', { mat: 'straw', paint: ropePaint({ light: '#e8d08e', dark: '#b89860' }) }));
    }
    // a checked cloth folded over the back half, its corner hanging over the rim
    const cloth = P.roundBox([0.27, 0.03, 0.13], 0.012).at(-0.01, H - 0.004, -0.045).turn(0, 0, 4)
      .add(P.roundBox([0.07, 0.07, 0.012], 0.006).at(-0.12, H - 0.03, -0.112).turn(8, 0, 0))
      .rough({ type: 'fbm', scale: 0.05, amp: far ? 0 : 0.004, seed: 4 });
    all = all.add(cloth.part('fb_cloth', { mat: 'food', paint: clothPaint }));
    // a round loaf and apples at the front end
    const loaf = P.ellipsoid([0.06, 0.04, 0.05]).at(0.05, H + 0.012, 0.045).turn(0, 20, 0);
    let bread = loaf;
    if (!far) for (let k = 0; k < 3; k++) bread = bread.softCut(P.capsule([0.02 - k * 0.022, H + 0.052, 0.0], [0.035 - k * 0.022, H + 0.05, 0.09], 0.006).turn(0, 20, 0), 0.004);
    all = all.add(bread.part('fb_bread', { mat: 'food', paint: (c) => mix(mix(C('#c07a3a'), C('#e8b46e'), ss(0.1, 0.9, c.ny) * 0.6 + c.edge * 0.3), C('#5a3018'), c.cavity * 0.7) }));
    let red = null, st = null;
    for (const [x, z, r] of [[-0.06, 0.05, 0.034], [-0.035, 0.0, 0.032], [0.105, -0.01, 0.031]]) {
      const a = apple([x, H + 0.006, z], r, { far });
      red = red ? red.add(a.body) : a.body;
      if (a.stalk) st = st ? st.add(a.stalk) : a.stalk;
    }
    all = all.add(red.part('fb_apple', { mat: 'fruit', paint: applePaint({}) }));
    if (st) all = all.add(st.part('fb_stalk', { mat: 'fruit', paint: stalkPaint }));
    return all;
  },
};

function weavePaint(c) {
  const { x, y, z, cavity, edge } = c;
  let col = mix(C('#d0ae74'), C('#a6845a'), 0.5 + 0.5 * P.fbm(x * 22, y * 60, z * 22, 4, 2));
  col = mix(col, C('#c8c0ac'), ss(0.08, 0.16, y) * 0.22);
  col = mix(col, C('#6a5032'), ss(0.035, 0.0, y) * 0.5);
  col = mix(col, C('#f0dcaa'), edge * 0.4);
  return mix(col, C('#4a361c'), cavity * 0.6);
}
function clothPaint(c) {
  // undyed linen with two red woven stripes near its hem (a check would blur in vertex colours at this size)
  const u = Math.abs(c.z + 0.045), band = ss(0.04, 0.046, u) * ss(0.058, 0.052, u);
  let col = mix(C('#efe6d4'), C('#c4483c'), band);
  col = mix(col, C('#fffaf0'), c.edge * 0.3 + ss(0.3, 0.9, c.ny) * 0.1);
  return mix(col, C('#5a3a2a'), c.cavity * 0.5);
}
