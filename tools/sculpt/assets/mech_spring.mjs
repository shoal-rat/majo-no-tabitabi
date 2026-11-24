// The ice trial's falling spring (gameplay/wilds-pages.js MECH.spring): water falls from a carved spout set into a crag
// into a round stone basin; ice stops it (the game keeps its own falling sheet, pool and icicles). Replaces five
// stretched dodecahedra, a box spout and a cylinder basin.
//   mech_spring   the crag (jointed blocks of bedded rock with moss and a grass cushion), the dressed spout stone set
//                 into it with a channel and a drip lip, a small ice star carved over the spout, the basin of curved blocks
// INTENT
//  silhouette: a rough rock face higher than a person with a stone spout jutting from it at 3 m; a round basin in front.
//  big forms: the crag / the spout stone / the basin.
//  the eye rests on: the spout's lip (where the water leaves), the wet dark streak under it, the basin's worn rim.
//  wear: the rock wet and dark round the fall, moss on every ledge, the basin's rim polished by hands.
// Coordinates: origin = ground at the spring's centre, +Z = the basin side. Kept: spout lip at (0, ~2.98, 0.2) (the sheet
// falls from there), basin r 1.25 - 1.35, rim 0.42, pool at 0.36 inside r 1.12 round (0, z 1.0); the crag behind
// (collider r 2.4 round z -1.6), top ~4.6.
//   node tools/sculpt/assets/mech_spring.mjs
import {
  THREE, prng, plane, planeD, norm, Mesh, mossCap, piece, boxPlanes, ringBlockPlanes, hullPlanes, addGeo, extrude, mat4,
  carvedStone, stonePaint, writeAsset, sheet, setLod, col, mixc, ss, fbm,
} from './mech_lib.mjs';

function spring(lod) {
  setLod(lod);
  const mesh = new Mesh(), rnd = prng(201);
  const bev = lod === 0 ? 0.04 : 0.05;
  const wet = (p) => ss(0.9, 0.2, Math.abs(p[0])) * ss(3.2, 2.6, p[1]) * ss(-0.6, 0.1, p[2]);
  const rockBase = stonePaint({ H: 4.6, seed: 201, warm: 0.3, base: 0.6 });
  const rock = (c) => mixc(rockBase(c), col('#3c4448'), wet(c.p) * 0.55);
  const MOSS = lod === 0 ? { rings: 4, segs: 14 } : { rings: 2, segs: 9 };
  const W = (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bev * 0.7 : e.ka === 'crack' || e.kb === 'crack' ? bev * 0.4 : bev);
  // ---- the crag: bedded blocks, each a hull of planes, stepped back as they rise; a joint splits the middle one
  const blocks = [
    { c: [0, 1.0, -1.75], s: [1.75, 1.2, 1.05], cut: [0.86, 1] },
    { c: [-1.9, 0.8, -1.3], s: [0.95, 0.95, 0.95], cut: [0.84, 1] },
    { c: [1.85, 1.0, -1.4], s: [0.9, 1.1, 0.9], cut: [0.84, 1] },
    { c: [-0.75, 2.65, -1.9], s: [1.05, 0.85, 0.9], cut: [0.86, 1] },
    { c: [0.85, 2.6, -1.85], s: [0.95, 0.9, 0.9], cut: [0.86, 1] },
    { c: [0.1, 3.95, -2.05], s: [1.3, 0.7, 0.85], cut: [0.84, 1] },
    { c: [-1.45, 3.15, -2.1], s: [0.65, 0.7, 0.65], cut: [0.84, 1] },
  ];
  const tops = [];
  blocks.forEach((b, i) => {
    const pl = hullPlanes(prng(211 + i), { size: b.s, c: b.c, count: 11, cut: b.cut, tilt: 0.35 });
    pl.push(plane([0.05, 1, 0.08], [b.c[0], b.c[1] + b.s[1] * 0.92, b.c[2]]));       // a broad bedded top
    pl.push(plane([0, -1, 0.05], [b.c[0], b.c[1] - b.s[1] * 0.95, b.c[2]], b.c[1] - b.s[1] < 0.1 ? 'floor' : 'face'));
    // keep the spout's slot and the fall clear
    if (Math.abs(b.c[0]) < 1.0) pl.push(planeD([0, 0, 1], -0.55 - (i === 0 ? 0.05 : 0)));
    const P = piece(mesh, pl, { bevel: W, paint: rock, minAngle: 0.15 });
    tops.push(P);
  });
  // ---- the spout stone: a dressed block set into the crag, a U channel along its top, a lip with a drip notch
  const sp = carvedStone({ H: 3.2, seed: 221, base: 0.66, lichen: 0.3 });
  const spout = (c) => mixc(sp(c), col('#46505a'), ss(0.25, 0.0, Math.abs(c.p[0])) * ss(-0.9, 0.2, c.p[2]) * 0.45);
  piece(mesh, boxPlanes([-0.45, 2.55, -1.3, 0.45, 3.35, -0.55]), { bevel: 0.025, paint: spout });             // the block in the crag
  piece(mesh, boxPlanes([-0.26, 2.78, -0.6, 0.26, 2.9, 0.16], { extra: [plane([0, 1, 1.4], [0, 2.9, 0.16])] }), { bevel: 0.015, paint: spout });   // channel floor
  for (const sx of [-1, 1]) piece(mesh, boxPlanes([sx > 0 ? 0.14 : -0.26, 2.88, -0.6, sx > 0 ? 0.26 : -0.14, 3.06, 0.12], { extra: [plane([0, 1, 1.1], [0, 3.06, 0.05])] }), { bevel: 0.015, paint: spout });
  // a little ice star carved over the spout
  const star = new THREE.Shape(); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = i % 2 ? 0.035 : 0.12; (i ? star.lineTo : star.moveTo).call(star, Math.sin(a) * r, Math.cos(a) * r); }
  addGeo(mesh, extrude(star, 0.014, { bevel: 0.004 }), { paint: sp, matrix: mat4([0, 3.17, -0.552]) });
  // ---- the basin: ten curved blocks round (0, 1.0), rim worn round and pale; a floor slab inside under the pool
  const bp = carvedStone({ H: 0.5, seed: 231, base: 0.68, lichen: 0.4 });
  const basinPaint = (c) => mixc(bp(c), col('#e8e2d6'), ss(0.38, 0.43, c.p[1]) * 0.3);
  for (let i = 0; i < 10; i++) {
    const a0 = i * 36 + 4, a1 = a0 + 36;
    piece(mesh, ringBlockPlanes(a0, a1, 1.12, 1.36, -0.15, 0.42, { cz: 1.0, gap: 0.008, floor: true, lean: 0.06 }), { bevel: (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.mid[1] > 0.3 ? 0.035 : 0.02), paint: basinPaint, minAngle: 0.1 });
  }
  addGeo(mesh, new THREE.CylinderGeometry(1.13, 1.13, 0.1, lod === 0 ? 28 : 16).translate(0, 0.25, 1.0), { paint: (c) => mixc(bp(c), col('#4a5660'), 0.4) });
  // ---- moss on the crag's ledges and a grass cushion on its crown
  let s = 241;
  for (const [i, at, R] of [[0, [-0.8, -1.4], 0.32], [1, [-1.9, -1.2], 0.3], [2, [1.9, -1.3], 0.28], [3, [-0.7, -1.7], 0.3], [4, [0.9, -1.7], 0.25], [5, [0.2, -2.0], 0.45], [6, [-1.25, -2.0], 0.22]]) {
    mossCap(mesh, [tops[i].planes], { at, R, T: 0.045, seed: s++, ...MOSS });
  }
  void rnd; void norm; void fbm;
  return mesh;
}

async function main() {
  const lods = [spring(0), spring(1)];
  const r = await writeAsset('mech_spring', lods, {
    source: 'tools/sculpt/assets/mech_spring.mjs (node, facet kit + three.js generators)',
    notes: 'Ice page trial: crag of bedded rock blocks with moss, a dressed spout stone with a channel and lip (the game\'s falling sheet starts at its lip), a carved ice star, a basin of ten curved blocks with a worn rim. Vertex colours on every LOD.',
    extras: { family: 'page_sites', mech: 'spring' },
  });
  console.log('mech_spring tris', r.tris.join(' / '), 'KB', r.kb, 'size', [r.bounds[3] - r.bounds[0], r.bounds[4] - r.bounds[1], r.bounds[5] - r.bounds[2]].map((v) => v.toFixed(2)).join(' x '));
  await sheet('mech_spring', [{ mesh: lods[0], az: 20, el: 12, label: 'front' }, { mesh: lods[0], az: 140, el: 25, label: 'side' }, { mesh: lods[1], az: 0, el: 30, label: 'lod1' }], { cols: 3, ts: 420 });
}
main().catch((e) => { console.error(e); process.exit(1); });
