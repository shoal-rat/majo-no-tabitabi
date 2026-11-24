// The fire trial's candles (gameplay/wilds-pages.js MECH.candles): five wrought-iron candle stands round a stone
// reading pedestal with an open stone book. Fire lights the candles; the game keeps its own flames at each wick.
// Replaces a box pedestal, a box slab, a box book, iron cylinders, dishes and wax cylinders.
//   mech_candles    the pedestal: moulded foot, a chamfered shaft, a cornice, a slanted desk with an open book of stone;
//                   wax spilt from old vigils on the cornice
//   mech_candle_a   a stand 1.0 m to the pan: tripod of scrolled iron legs, a turned shaft with knops, a drip pan, a
//   mech_candle_b   ... 1.35 m          thick church candle with wax runs, its top melted into a cup, a wick
// INTENT
//  silhouette: tall thin iron candlesticks with three curling feet around a squat stone lectern.
//  the eye rests on: the wax runs and the pooled wax in the pans, the open book's pages, the scrolls of the feet.
//  wear: soot on the book and over the wicks, rust on the iron feet, wax drips on the stone.
// Coordinates: origin = ground at the piece's centre, +Z = the pedestal's reading side. Kept: candle wax from h + 0.05
// to h + 0.75 (flame at h + 0.76, h = 1.0 / 1.35), pedestal footprint ~1.1 x 0.8, desk top ~1.43.
//   node tools/sculpt/assets/mech_candles.mjs
import {
  THREE, extrude, prng, plane, Mesh, mossCap, piece, boxPlanes, prismPlanes, addGeo, lathe, tube, blob, mat4, sheetGeo,
  carvedStone, ironPaint, writeAsset, sheet, setLod, col, mixc, ss, fbm,
} from './mech_lib.mjs';

const waxPaint = (seed = 5) => (c) => {
  const { p, n } = c;
  let v = mixc(col('#fdf6e4'), col('#f2e4c2'), 0.5 + 0.5 * fbm(p[0] * 20, p[1] * 6, p[2] * 20, seed, 2));
  v = mixc(v, col('#fff6e2'), ss(0.5, 1, n[1]) * 0.35);
  return v;
};

function pedestal(lod) {
  setLod(lod);
  const mesh = new Mesh(), rnd = prng(111);
  const paint = carvedStone({ H: 1.5, seed: 111, warm: 0.4, base: 0.68 });
  const bev = lod === 0 ? 0.02 : 0.028;
  const B = (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bev * 0.8 : bev);
  const foot = piece(mesh, boxPlanes([-0.52, -0.2, -0.42, 0.52, 0.16, 0.42], { floor: true, extra: [plane([0, 1, 0.5], [0, 0.17, 0.3]), plane([0, 1, -0.5], [0, 0.17, -0.3]), plane([0.5, 1, 0], [0.4, 0.17, 0]), plane([-0.5, 1, 0], [-0.4, 0.17, 0])] }), { bevel: B, paint });
  // shaft with wide chamfers on its four corners
  const sh = boxPlanes([-0.36, 0.15, -0.27, 0.36, 1.12, 0.27], { extra: [0, 1, 2, 3].map((k) => { const a = Math.PI / 4 + k * Math.PI / 2; return plane([Math.sin(a), 0, Math.cos(a)], [Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4]); }) });
  piece(mesh, sh, { bevel: B, paint });
  // a flame carved on the shaft's reading side inside a raised frame
  {
    const F = new THREE.Shape();
    F.moveTo(0, -0.13); F.bezierCurveTo(0.09, -0.13, 0.12, -0.06, 0.1, 0.0); F.bezierCurveTo(0.09, 0.05, 0.07, 0.07, 0.08, 0.11);
    F.bezierCurveTo(0.04, 0.08, 0.03, 0.05, 0.03, 0.02); F.bezierCurveTo(0.04, 0.08, 0.02, 0.12, 0.0, 0.16); F.bezierCurveTo(-0.03, 0.1, -0.04, 0.06, -0.03, 0.02);
    F.bezierCurveTo(-0.05, 0.04, -0.07, 0.05, -0.08, 0.07); F.bezierCurveTo(-0.11, 0.0, -0.11, -0.07, -0.08, -0.1); F.bezierCurveTo(-0.05, -0.125, -0.03, -0.13, 0, -0.13);
    addGeo(mesh, extrude(F, 0.014, { bevel: 0.005, curve: lod === 0 ? 10 : 5 }), { paint, matrix: mat4([0, 0.68, 0.27]) });
    for (const [x0, y0, x1, y1] of [[-0.23, 0.36, -0.2, 0.98], [0.2, 0.36, 0.23, 0.98], [-0.23, 0.36, 0.23, 0.39], [-0.23, 0.95, 0.23, 0.98]]) piece(mesh, boxPlanes([x0, y0, 0.26, x1, y1, 0.284]), { bevel: 0.006, paint, corners: false });
  }
  // cornice: a projecting slab with a hollow under its edge (two steps)
  piece(mesh, boxPlanes([-0.44, 1.1, -0.34, 0.44, 1.18, 0.34]), { bevel: B, paint });
  const cor = piece(mesh, boxPlanes([-0.55, 1.17, -0.42, 0.55, 1.27, 0.42]), { bevel: B, paint });
  // the desk: slanted to the reader (+Z), a lip along its low edge
  const tilt = -0.18, xfD = { p: (p) => { const c = Math.cos(tilt), s = Math.sin(tilt); return [p[0], 1.33 + p[1] * c - p[2] * s, p[1] * s + p[2] * c]; }, n: (n) => { const c = Math.cos(tilt), s = Math.sin(tilt); return [n[0], n[1] * c - n[2] * s, n[1] * s + n[2] * c]; } };
  piece(mesh, boxPlanes([-0.52, -0.07, -0.38, 0.52, 0.05, 0.38]), { bevel: B, paint, xf: xfD });
  piece(mesh, boxPlanes([-0.5, 0.04, 0.32, 0.5, 0.09, 0.38]), { bevel: 0.01, paint, xf: xfD });
  // the open book: two page blocks rising to the spine, covers under them, the page edges pale
  const pagePaint = (c) => (Math.abs(c.fn[1]) < 0.6 ? mixc(col('#efe6d2'), col('#c8bca4'), 0.5 + 0.5 * Math.sin(c.p[1] * 900)) : mixc(mixc(paint(c), col('#efe6d2'), 0.35), col('#4a403a'), ss(0.16, 0.02, Math.abs(c.p[0])) * 0.35));   // soot in the gutter
  for (const sx of [-1, 1]) {
    piece(mesh, boxPlanes([sx > 0 ? 0.0 : -0.36, 0.045, -0.25, sx > 0 ? 0.36 : 0.0, 0.075, 0.25]), { bevel: 0.006, paint, xf: xfD });
    piece(mesh, boxPlanes([sx > 0 ? 0.01 : -0.34, 0.07, -0.235, sx > 0 ? 0.34 : -0.01, 0.17, 0.235], { extra: [plane([-sx * 0.5, 1, 0], [0, 0.09, 0]), plane([sx * 0.09, 1, 0], [sx * 0.34, 0.125, 0])] }), { bevel: 0.006, paint: pagePaint, xf: xfD });
  }
  // a ribbon bookmark hanging over the low edge
  addGeo(mesh, sheetGeo((u, v) => [0.12 + (v - 0.5) * 0.03, 1.36 - u * 0.16 - u * u * 0.05, 0.2 + u * 0.16], 6, 1, () => 0.004), { paint: () => col('#a8382e'), part: 'wax' });
  // old wax spilt on the cornice corners
  const wp = waxPaint(7);
  for (const [x, z] of [[0.46, 0.33], [-0.47, 0.31], [0.44, -0.33]]) {
    addGeo(mesh, blob([x, 1.27, z], [0.07 + rnd() * 0.03, 0.018, 0.06 + rnd() * 0.03], { w: 10, h: 5 }), { paint: wp, part: 'wax' });
    addGeo(mesh, lathe([[0.0, 1.27], [0.03, 1.27], [0.028, 1.33], [0.022, 1.345], [0, 1.35]], 8), { paint: wp, part: 'wax', matrix: mat4([x * 0.92, 0, z * 0.9]) });
    addGeo(mesh, blob([x * 1.03, 1.22, z * 1.04], [0.014, 0.05, 0.014], { w: 6, h: 5 }), { paint: wp, part: 'wax' });
  }
  const MOSS = lod === 0 ? { rings: 3, segs: 12 } : { rings: 2, segs: 8 };
  mossCap(mesh, [foot.planes], { at: [-0.35, -0.32], R: 0.15, T: 0.028, seed: 113, ...MOSS });
  void cor;
  return mesh;
}

function stand(h, lod, seed) {
  setLod(lod);
  const mesh = new Mesh(), rnd = prng(seed);
  const iron = ironPaint({ seed, rust: 0.6 });
  const wp = waxPaint(seed);
  const rad = lod === 0 ? 8 : 6;
  // three scrolled legs from the shaft's foot knop to the ground, curling up at the toes
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4, ox = Math.sin(a), oz = Math.cos(a);
    const P = [[ox * 0.03, 0.3, oz * 0.03], [ox * 0.12, 0.2, oz * 0.12], [ox * 0.24, 0.06, oz * 0.24], [ox * 0.3, 0.02, oz * 0.3], [ox * 0.34, 0.05, oz * 0.34], [ox * 0.32, 0.09, oz * 0.32], [ox * 0.28, 0.075, oz * 0.28]];
    addGeo(mesh, tube(P, 0.022, { seg: lod === 0 ? 20 : 10, radial: rad - 2 }), { paint: iron, part: 'iron' });
  }
  // turned shaft with knops, the drip pan, a spike
  const prof = [[0, 0.26], [0.055, 0.27], [0.06, 0.33], [0.03, 0.36], [0.026, h * 0.5 - 0.04], [0.05, h * 0.5], [0.026, h * 0.5 + 0.04], [0.024, h - 0.08], [0.045, h - 0.05], [0.04, h - 0.02]];
  addGeo(mesh, lathe(prof, rad), { paint: iron, part: 'iron' });
  addGeo(mesh, lathe([[0.0, h - 0.03], [0.04, h - 0.03], [0.2, h + 0.0], [0.235, h + 0.035], [0.24, h + 0.05], [0.225, h + 0.045], [0.19, h + 0.02], [0, h + 0.015]], lod === 0 ? 18 : 10), { paint: iron, part: 'iron' });
  // the candle: wax from h + 0.05 to h + 0.75, its top melted into a cup, runs of wax down its side, a pool in the pan
  const top = h + 0.75;
  const cp = [[0, h + 0.02], [0.17, h + 0.02], [0.17, h + 0.05], [0.155, h + 0.08], [0.152, top - 0.06], [0.156, top - 0.012], [0.145, top + 0.005], [0.11, top - 0.012], [0.04, top - 0.03], [0, top - 0.032]];
  addGeo(mesh, lathe(cp, lod === 0 ? 16 : 10), { paint: wp, part: 'wax' });
  const runs = lod === 0 ? 7 : 4;
  for (let k = 0; k < runs; k++) {
    const a = rnd() * Math.PI * 2, len = 0.12 + rnd() * 0.45, ox = Math.sin(a), oz = Math.cos(a);
    const P = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; P.push([ox * (0.156 + 0.006 * Math.sin(t * 3)), top - 0.01 - t * len, oz * (0.156 + 0.006 * Math.sin(t * 3))]); }
    addGeo(mesh, tube(P, 0.012 + rnd() * 0.008, { seg: 8, radial: 5 }), { paint: wp, part: 'wax' });
    addGeo(mesh, blob(P[5], [0.018, 0.022, 0.018], { w: 6, h: 4 }), { paint: wp, part: 'wax' });
  }
  addGeo(mesh, blob([0.08, h + 0.04, 0.05], [0.09, 0.016, 0.07], { w: 10, h: 4 }), { paint: wp, part: 'wax' });
  // the wick, sooted
  addGeo(mesh, tube([[0, top - 0.04, 0], [0.004, top + 0.005, 0], [0.012, top + 0.022, 0.004]], 0.005, { seg: 4, radial: 4 }), { paint: () => col('#2a2420'), part: 'iron' });
  void rnd;
  return mesh;
}

async function main() {
  const out = [];
  for (const [name, fn, note] of [
    ['mech_candles', (l) => pedestal(l), 'Fire page trial: stone reading pedestal (moulded foot, chamfered shaft, cornice, slanted desk) with an open stone book, a ribbon, spilt wax.'],
    ['mech_candle_a', (l) => stand(1.0, l, 121), 'Fire page trial: wrought-iron candle stand (pan at 1.0 m): scrolled tripod, turned shaft with knops, drip pan, church candle with wax runs, melted cup and wick (the game lights it).'],
    ['mech_candle_b', (l) => stand(1.35, l, 131), 'Fire page trial: wrought-iron candle stand (pan at 1.35 m), as mech_candle_a.'],
  ]) {
    const lods = [fn(0), fn(1)];
    const r = await writeAsset(name, lods, { source: 'tools/sculpt/assets/mech_candles.mjs (node, facet kit + three.js generators)', notes: note + ' Vertex colours on every LOD.', extras: { family: 'page_sites', mech: 'candles' } });
    console.log(name, 'tris', r.tris.join(' / '), 'KB', r.kb);
    out.push({ mesh: lods[0], az: 25, el: 15, label: name });
  }
  await sheet('mech_candles', out, { cols: 3, ts: 420 });
}
main().catch((e) => { console.error(e); process.exit(1); });
