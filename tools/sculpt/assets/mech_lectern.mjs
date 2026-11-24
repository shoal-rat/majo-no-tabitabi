// The earth trial's sunken lectern (gameplay/wilds-pages.js MECH.lectern): a stone lectern sunk in the ground inside a
// ring of nine kerb stones; earth lifts it (the game raises it 1 m). Replaces nine boxes, a box column and a box slab.
//   mech_lectern_ring   nine hewn kerb stones half sunk round a 2.3 m circle, their tops dressed, a few cut with an
//                       earth mark, moss on their north shoulders
//   mech_lectern        the lectern (the moving part): a square foot, an octagonal shaft, a corbel, a slanted desk with a
//                       lip, a closed book of stone with bronze clasps on it (the game's glowing ring lies on its cover)
// INTENT
//  silhouette: a low ring of rough blocks; in its middle a reading desk on a post, half in the earth until it rises.
//  the eye rests on: the book with its clasps, the earth marks on the kerb stones.
//  wear: soil stains up the lectern's lower half (it has been buried), the kerb tops weathered round.
// Coordinates: origin = ground at the ring's centre (the lectern: its foot's centre), +Z = the reading side. Kept: kerb
// stones about 0.9 x 0.7 x 0.55 at r 2.3 from y -0.55 to 0.15; the lectern's desk centre (0, 1.35, 0.05) turned -0.32
// rad about X (its low edge, the reading side, at -Z), its book cover (desk frame y 0.222) under the game's glyph.
//   node tools/sculpt/assets/mech_lectern.mjs
import {
  THREE, prng, plane, planeD, Mesh, mossCap, piece, boxPlanes, prismPlanes, addGeo, extrude, poly2, mat4, lathe,
  carvedStone, bronzePaint, writeAsset, sheet, setLod, col, mixc, ss,
} from './mech_lib.mjs';

/** the desk frame: local (x, y, z) on the desk (y up from its centre) -> lectern space */
export const DESK = { at: [0, 1.35, 0.05], tilt: -0.32 };
const deskXf = () => { const c = Math.cos(DESK.tilt), s = Math.sin(DESK.tilt); return { p: (p) => [p[0], DESK.at[1] + p[1] * c - p[2] * s, DESK.at[2] + p[1] * s + p[2] * c], n: (n) => [n[0], n[1] * c - n[2] * s, n[1] * s + n[2] * c] }; };

function ring(lod) {
  setLod(lod);
  const mesh = new Mesh(), rnd = prng(141);
  const paint = carvedStone({ H: 0.7, seed: 141, warm: 0.45, base: 0.6, lichen: 0.7 });
  const mark = carvedStone({ H: 0.7, seed: 142, base: 0.7 });
  const bev = lod === 0 ? 0.03 : 0.04;
  const MOSS = lod === 0 ? { rings: 3, segs: 12 } : { rings: 2, segs: 8 };
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.42 + rnd() * 0.08, d = 0.26 + rnd() * 0.04, top = 0.1 + rnd() * 0.1;
    // a block in its own frame (x along the ring, z outward), dressed top tilting a little, worn shoulders
    const pl = [
      ...boxPlanes([-w, -0.55, -d, w, top + 0.2, d], { floor: true }),
      plane([(rnd() - 0.5) * 0.15, 1, (rnd() - 0.5) * 0.2], [0, top, 0]),
      plane([0.6, 0.7, 0], [w - 0.06, top - 0.02, 0]), plane([-0.6, 0.7, 0], [-w + 0.06, top - 0.02, 0]),
      plane([0, 0.6, 0.7], [0, top - 0.03, d - 0.05]), plane([0, 0.6, -0.7], [0, top - 0.03, -d + 0.05]),
    ];
    { const cx = rnd() < 0.5 ? -1 : 1, cz = rnd() < 0.5 ? -1 : 1; pl.push(plane([cx * 0.7, 0.45, cz * 0.7], [cx * w * 0.78, top - 0.06, cz * d * 0.7])); }   // a knocked corner
    const xf = { p: (p) => [sa * 2.3 + p[0] * ca + p[2] * sa, p[1], ca * 2.3 - p[0] * sa + p[2] * ca], n: (n) => [n[0] * ca + n[2] * sa, n[1], -n[0] * sa + n[2] * ca] };
    const m = new Mesh();
    const P = piece(m, pl, { bevel: (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bev * 0.7 : bev), paint });
    // an earth mark (two peaks) cut proud on the inner face of every third stone
    if (k % 3 === 0 && lod === 0) addGeo(m, extrude(poly2([[-0.12, -0.06], [-0.04, 0.06], [0.0, 0.015], [0.045, 0.09], [0.12, -0.06]]), 0.01, { bevel: 0.004 }), { paint: mark, matrix: mat4([0, top - 0.17, -d + 0.002], [0, Math.PI, 0]) });
    if (ca < 0.3) mossCap(m, [P.planes], { at: [0, d * 0.2], R: 0.17, T: 0.028, seed: 150 + k, ...MOSS });
    mesh.append(m, xf);
  }
  return mesh;
}

function lectern(lod) {
  setLod(lod);
  const mesh = new Mesh();
  const base = carvedStone({ H: 1.5, seed: 161, warm: 0.4, base: 0.68 });
  // soil stains up its lower half: it rises out of the earth
  const paint = (c) => mixc(base(c), col('#6a5640'), ss(0.95, 0.15, c.p[1]) * 0.45);
  const bronze = bronzePaint({ seed: 162, green: 0.45 });
  const bev = lod === 0 ? 0.02 : 0.028;
  const B = (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bev * 0.8 : bev);
  piece(mesh, boxPlanes([-0.38, 0.0, -0.33, 0.38, 0.2, 0.33], { extra: [plane([0, 1, 0.6], [0, 0.2, 0.25]), plane([0, 1, -0.6], [0, 0.2, -0.25]), plane([0.6, 1, 0], [0.3, 0.2, 0]), plane([-0.6, 1, 0], [-0.3, 0.2, 0])] }), { bevel: B, paint });
  piece(mesh, prismPlanes(8, 0.25, 0.22, 0.18, 1.12, { rot: 22.5 }), { bevel: (e) => (e.corner ? bev * 0.7 : Math.abs(e.b[1] - e.a[1]) > 0.5 ? bev * 1.4 : bev), paint });
  piece(mesh, boxPlanes([-0.32, 1.1, -0.28, 0.32, 1.2, 0.28], { extra: [plane([0, -1, 0.7], [0, 1.12, 0.26]), plane([0, -1, -0.7], [0, 1.12, -0.26])] }), { bevel: B, paint });
  // the desk and its lip, in the desk frame
  const xf = deskXf();
  piece(mesh, boxPlanes([-0.55, -0.08, -0.4, 0.55, 0.08, 0.4]), { bevel: B, paint, xf });
  piece(mesh, boxPlanes([-0.53, 0.06, -0.4, 0.53, 0.13, -0.33]), { bevel: 0.01, paint, xf });   // the lip at the low (reading) edge
  // the closed book: covers, the page block (pale edges), bronze corners and two clasps
  const pagePaint = (c) => (Math.abs(c.fn[1]) < 0.5 ? mixc(col('#e8dcc4'), col('#c0b49c'), 0.5 + 0.5 * Math.sin((c.p[0] + c.p[2]) * 700)) : paint(c));
  piece(mesh, boxPlanes([-0.27, 0.08, -0.19, 0.27, 0.1, 0.19]), { bevel: 0.006, paint, xf });
  piece(mesh, boxPlanes([-0.255, 0.098, -0.18, 0.255, 0.2, 0.18]), { bevel: 0.004, paint: pagePaint, xf, corners: false });
  piece(mesh, boxPlanes([-0.275, 0.198, -0.195, 0.275, 0.222, 0.195]), { bevel: 0.007, paint, xf });
  if (lod === 0) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) piece(mesh, boxPlanes([Math.min(sx * 0.275, sx * 0.24), 0.215, Math.min(sz * 0.195, sz * 0.16), Math.max(sx * 0.275, sx * 0.24), 0.228, Math.max(sz * 0.195, sz * 0.16)]), { bevel: 0.004, paint: bronze, part: 'bronze', xf, corners: false });
    for (const sz of [-0.09, 0.09]) piece(mesh, boxPlanes([0.24, 0.1, sz - 0.025, 0.3, 0.226, sz + 0.025]), { bevel: 0.005, paint: bronze, part: 'bronze', xf, corners: false });
  }
  return mesh;
}

async function main() {
  const out = [];
  for (const [name, fn, note] of [
    ['mech_lectern_ring', ring, 'Earth page trial: nine hewn kerb stones round the sunken lectern (dressed tops, worn shoulders, earth marks, moss).'],
    ['mech_lectern', lectern, 'Earth page trial: the rising stone lectern (foot, octagonal shaft, corbel, slanted desk with lip, closed stone book with bronze corners and clasps; soil stains on its buried half).'],
  ]) {
    const lods = [fn(0), fn(1)];
    const r = await writeAsset(name, lods, { source: 'tools/sculpt/assets/mech_lectern.mjs (node, facet kit + three.js generators)', notes: note + ' Vertex colours on every LOD.', extras: { family: 'page_sites', mech: 'lectern' } });
    console.log(name, 'tris', r.tris.join(' / '), 'KB', r.kb);
    out.push({ mesh: lods[0], az: 25, el: 25, label: name });
  }
  await sheet('mech_lectern', out, { cols: 2, ts: 460 });
}
main().catch((e) => { console.error(e); process.exit(1); });
void THREE; void planeD; void lathe;
