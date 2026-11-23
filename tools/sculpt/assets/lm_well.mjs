// Field well (well, src/world/builders/landmarks.js: the farm well by the sea; LM_VAR=b: the low wellhead of the four
// farmsteads). Replaces a grey cylinder with a dark disc, two box posts and a two-slab roof; same footprint (wellhead
// r 1.05 m, 0.9 m high; collider unchanged), same post places (x +-0.95) and roof height (ridge ~2.95 m).
// INTENT
//  silhouette: a round wellhead of laid rubble with flat coping stones; two stout posts carrying a little shingled gable
//    roof; a windlass with a coil of rope and a wooden bucket hanging over the dark water (b: a plank lid half off and
//    the bucket standing on the coping).
//  big forms: the rubble drum; the posts and roof; the windlass.
//  eye rests on: the coping worn smooth where buckets are set down, the rope coil, the crank, the bucket's iron hoops.
//  wear: moss low in the joints on the north, lichen on the coping; the posts silvered, the shingles mossy at the eaves.
//  not: a cylinder, symmetric, clean.
// Coordinates: metres, origin = ground level at the wellhead centre, +Y up, ridge along X.
import * as P from '../sdf.mjs';
import { hex, mix, ss, clamp, fbm, paintStone, paintWood, paintIron, slateSlope, mossCushions, paintMoss, facetStone, stonePlanes, plane, GRIT } from './lm_kit.mjs';
import { field, bunion } from './landmarks_lib.mjs';

const F = field();
const VAR = process.env.LM_VAR || 'a';
const RO = 1.0, RI = 0.7, WH = 0.88;           // wellhead outer / inner radius, height of the wall under the coping
const POST = 0.95, PTOP = 2.38, RIDGE = 2.95;

export default {
  name: 'lm_well_' + VAR, id: 'sculpt_lm_well_' + VAR,
  voxel: 0.008,
  fieldVoxel: [0.008, 0.016],
  lodField: [0, 1, 1],
  vcAll: true,
  lods: VAR === 'a' ? [9000, 2200, 800] : [4000, 1500, 600],
  ground: 0,
  aoRange: 0.3,
  aoStrength: 0.55,
  cavityDark: 0.4,
  cavity: [0.01, 0.05],
  creaseAngle: 44,
  bandSlack: 0.05,
  closeSheet: [[25, 4.5, 1.6, 1.2], [200, 4.5, 1.6, 1.2], [110, 3.5, 1.7, 1.0], [330, 2.6, 2.4, 0.6]],
  materials: {
    stone: { name: 'Stone', surface: 'stone' }, wood: { name: 'Wood', surface: 'wood' }, iron: { name: 'Iron', surface: 'metal' },
    water: { name: 'Water', surface: 'none' }, rope: { name: 'Rope', surface: 'cloth' }, moss: { name: 'Moss', surface: 'none' },
  },
  gameMats: { stone: 'Stone', wood: 'Wood', iron: 'Iron', water: 'Water', rope: 'Rope', moss: 'Moss' },
  notes: 'Sculpted field well (landmarks well; LM_VAR=b the farmsteads\' low wellhead). Vertex colours on every LOD. Stone -> carved-stone family, Wood -> wood, Iron -> iron, Water / Rope -> cream (paint), Moss -> ivy.',

  build({ S }) {
    S.part('stone', { mat: 'stone', paint: (c) => paintStone(c, GRIT, { foot: 0, lichen: 0.6, moss: 1, streak: 0.4 }) });
    S.part('coping', { mat: 'stone', paint: paintCoping });
    S.part('wood', { mat: 'wood', paint: (c) => paintWood(c, ['#a3896a', '#7a6149'], 'y') });
    S.part('woodx', { mat: 'wood', paint: (c) => paintWood(c, ['#a3896a', '#7a6149'], 'x') });
    S.part('shingle', { mat: 'wood', paint: paintShingle });
    S.part('bucket', { mat: 'wood', paint: (c) => paintWood(c, ['#9b7b58', '#6f553d'], 'y') });
    S.part('iron', { mat: 'iron', paint: paintIron });
    S.part('water', { mat: 'water', paint: (c) => mix(hex('#2c3c3a'), hex('#4a6460'), ss(0.6, 0.2, Math.hypot(c.x, c.z))) });
    S.part('rope', { mat: 'rope', paint: (c) => mix(mix(hex('#c9b088'), hex('#e0cba3'), c.edge), hex('#7d6a4e'), c.cavity) });
    S.part('moss', { mat: 'moss', paint: paintMoss });
    const rnd = S.prng(VAR === 'a' ? 91 : 93);
    const parts = [];

    // ---------------------------------------------------------------- the rubble drum: courses of single stones
    const core = P.cylinder(RO - 0.04, WH).cut(P.cylinder(RI + 0.04, WH + 0.2).at(0, -0.1, 0)).part('stone');
    parts.push(core);
    if (!F) {
      const courses = 4, ch = WH / courses;
      for (let k = 0; k < courses; k++) {
        const n = 11 + (k % 2), off = rnd() * 360;
        for (let i = 0; i < n; i++) {
          const a = (off + (i + (rnd() - 0.5) * 0.25) * (360 / n)) * Math.PI / 180, len = (2 * Math.PI * RO / n) * (0.88 + rnd() * 0.1);
          const hh = ch * (0.8 + rnd() * 0.15), th = RO - RI;
          const sp = stonePlanes(rnd, { size: [len / 2, hh / 2, th / 2], count: 8, cut: [0.95, 1.08], noUnder: false, extra: [
            plane([0, 0, 1], [0, 0, th / 2]), plane([0, 0, -1], [0, 0, -th / 2]), plane([0, 1, 0], [0, hh / 2, 0]), plane([0, -1, 0], [0, -hh / 2, 0]),
          ] });
          const st = facetStone(sp, { k: 0.01, kSoft: 0.03, floor: null, bounds: [-len, -hh, -th, len, hh, th] });
          const r0 = (RO + RI) / 2 + 0.012 + (rnd() - 0.5) * 0.015;
          parts.push(st.turn(0, a * 180 / Math.PI, 0).at(Math.sin(a) * r0, k * ch + hh / 2 + 0.01, Math.cos(a) * r0).part('stone'));
        }
      }
    }
    // coping: flat slabs round the top, one tilted, the front ones rubbed smooth
    const nc = 9;
    for (let i = 0; i < nc; i++) {
      const a0 = (i / nc) * 360 + 8, a1 = ((i + 1) / nc) * 360 + 8 - 2.5;
      const slab = P.cylinder(RO + 0.06, 0.1).cut(P.cylinder(RI - 0.03, 0.4).at(0, -0.1, 0))
        .intersect(P.plane([Math.cos(a0 * Math.PI / 180), 0, -Math.sin(a0 * Math.PI / 180)]).turn(0, 0, 0))
        .intersect(P.plane([-Math.cos(a1 * Math.PI / 180), 0, Math.sin(a1 * Math.PI / 180)]));
      parts.push(slab.round(0.012).at(0, WH - 0.004 + (i === 3 ? 0.015 : 0), 0).part('coping'));
    }
    // dark water below
    parts.push(P.cylinder(RI + 0.06, 0.03).at(0, 0.18, 0).part('water'));

    if (VAR === 'a') {
      // ---------------------------------------------------------------- posts, braces, windlass, roof
      for (const s of [-1, 1]) {
        let post = P.roundBox([0.15, PTOP - 0.3, 0.16], 0.015).at(s * POST, 0.3 + (PTOP - 0.3) / 2, 0);
        if (!F) post = post.rough({ type: 'fbm', scale: 0.08, amp: 0.004, seed: 94 + s });
        parts.push(post.part('wood'));
        // knee braces under the ridge beam
        parts.push(P.capsule([s * POST, PTOP - 0.45, 0], [s * (POST - 0.32), PTOP - 0.05, 0], 0.035).part('wood'));
      }
      // windlass: axle through the posts, a drum with the rope coiled on it, a crank on +x
      const AY = 1.62;
      parts.push(P.capsule([-POST - 0.1, AY, 0], [POST + 0.12, AY, 0], 0.035).part('woodx'));
      parts.push(P.capsule([-0.32, AY, 0], [0.32, AY, 0], 0.1).part('woodx'));
      // the rope wound on the drum: one coil body with its turns as grooves (no separate rings)
      if (!F) parts.push(P.capsule([-0.22, AY, 0], [0.2, AY, 0], 0.125).strata({ spacing: 0.032, depth: 0.006, width: 0.012, axis: 'x', seed: 98 }).part('rope'));
      parts.push(S.union(P.capsule([POST + 0.12, AY, 0], [POST + 0.14, AY + 0.28, 0], 0.022), P.capsule([POST + 0.14, AY + 0.28, 0], [POST + 0.3, AY + 0.28, 0], 0.022)).part('iron'));
      // the rope down to the bucket hanging in the shaft mouth
      parts.push(P.capsule([0.1, AY - 0.1, 0.06], [0.1, 1.2, 0.06], 0.014).part('rope'));
      parts.push(bucket(S, F).at(0.1, 0.94, 0.06));
      // roof: ridge beam, a board deck, wooden shingles, barge boards
      parts.push(P.roundBox([2 * POST + 0.5, 0.14, 0.14], 0.01).at(0, PTOP + 0.05, 0).part('woodx'));
      const ZW = 0.95, RISE = RIDGE - PTOP - 0.05, XL = POST + 0.25;
      const deck = P.extrude([[-ZW, 0], [ZW, 0], [0, RISE]], XL * 2).turn(0, 90, 0).at(0, PTOP + 0.06, 0)
        .cut(P.extrude([[-ZW + 0.16, -0.01], [ZW - 0.16, -0.01], [0, RISE - 0.16]], XL * 2 + 0.2).turn(0, 90, 0).at(0, PTOP + 0.06, 0));
      parts.push(deck.part('woodx'));
      const top = PTOP + 0.06 + RISE;
      parts.push((F
        ? slateSlope({ yr: top, ze: ZW, rise: RISE, hl: XL, over: 0.05, course: 0.12, sw: 4, t: 0.03, seed: 5, eaveOut: 0.08 })
        : slateSlope({ yr: top, ze: ZW, rise: RISE, hl: XL, over: 0.05, course: 0.1, sw: 0.15, t: 0.02, seed: 5, eaveOut: 0.08 })).mirror('z').part('shingle'));
      parts.push(P.roundBox([2 * XL + 0.12, 0.05, 0.12], 0.012).at(0, top + 0.02, 0).part('shingle'));   // ridge board
    } else {
      // ---------------------------------------------------------------- b: a plank lid half off, the bucket on the coping
      let lid = null;
      for (let i = 0; i < 5; i++) { const b = P.roundBox([1.5, 0.045, 0.2], 0.01).at(0, 0, -0.42 + i * 0.21); lid = lid ? lid.add(b) : b; }
      lid = lid.add(P.roundBox([0.1, 0.05, 1.0], 0.01).at(-0.45, -0.04, 0)).add(P.roundBox([0.1, 0.05, 1.0], 0.01).at(0.45, -0.04, 0));
      parts.push(lid.turn(0, 20, 3).at(-0.35, WH + 0.13, 0.1).part('woodx'));
      parts.push(bucket(S, F).turn(0, 40, 0).at(0.55, WH + 0.1, 0.55));
      parts.push(P.capsule([0.55, WH + 0.38, 0.55], [0.75, WH + 0.12, 0.8], 0.013).add(P.capsule([0.75, WH + 0.12, 0.8], [1.1, 0.03, 1.05], 0.013)).part('rope'));
    }
    let all = bunion(S, parts);
    if (!F) {
      const at = [];
      for (let i = 0; i < 7; i++) { const a = Math.PI + (rnd() - 0.5) * 2.2; at.push([Math.sin(a) * (RO + 0.02), 0.02 + rnd() * 0.15, Math.cos(a) * (RO + 0.02), 0.1]); }
      all = all.softAdd(mossCushions(rnd, at).part('moss'), 0.02);
    }
    return all;
  },
};

/** a coopered bucket with two iron hoops and a bail, origin at its foot */
function bucket(S, F) {
  let b = P.lathe([[0, 0], [0.13, 0], [0.155, 0.24], [0.14, 0.24], [0.117, 0.03], [0, 0.03]], { smooth: 0.005 });
  if (!F) b = b.strata({ spacing: 0.035, depth: 0.003, width: 0.005, axis: 'x', seed: 97 });
  b = b.part('bucket');
  const hoops = P.torus(0.137, 0.01).at(0, 0.05, 0).add(P.torus(0.152, 0.01).at(0, 0.2, 0)).part('iron');
  const bail = P.tube([[-0.155, 0.22, 0], [-0.1, 0.37, 0], [0, 0.4, 0], [0.1, 0.37, 0], [0.155, 0.22, 0]], 0.011).part('iron');
  return b.add(hoops).add(bail);
}
function paintCoping(c) {
  let col = paintStone(c, ['#d0cabd', '#b5ad9e'], { foot: 0, lichen: 0.8, moss: 0.4, streak: 0.2 });
  // the rim rubbed smooth and pale on the front where buckets are set down
  return mix(col, hex('#e4ded0'), ss(0.2, 0.7, c.z) * clamp(c.ny, 0, 1) * 0.4);
}
function paintShingle(c) {
  let col = paintWood(c, ['#8f7a63', '#6c5a48'], 'z');
  col = mix(col, hex('#a29c92'), 0.3);                       // silvered
  const eave = ss(2.62, 2.48, c.y);
  return mix(col, hex('#7b8c4e'), clamp(c.cavity * 1.3 + eave * 0.4, 0, 1) * 0.55);
}
