// The wind trial's stone harp (gameplay/wilds-pages.js MECH.harp): wind sings through seven strings strung between a
// carved stone yoke and a stone string bar, carried by two pillars. Replaces two box pillars, two box bars and two cones.
// INTENT
//  silhouette: two slim octagonal pillars on square plinths, each crowned by a capital and a little pyramid finial,
//    a heavy yoke laid across their tops (its upper edge a shallow gable), a low string bar between their feet.
//  big forms: the pillars / the yoke / the string bar.
//  the eye rests on: the bronze tuning pins along the yoke and the bar (one per string), the spiral of wind carved on the
//    yoke's face, the moss at the pillars' feet.
//  wear: wind from the west (local -X): lichen on that side, the finial on that side chipped; the bar's top worn pale.
// Coordinates: origin = ground at the harp's centre, +Z = the side the game shows first (it turns the group by the site's
// face). Kept from the old build: pillars at x = +-1.5, strings at x = -1.05 + k 0.35 (k 0..6) from y 0.655 to 3.205 in
// z = 0 (the strings stay the game's own glowing meshes), top 3.9 m.
//   node tools/sculpt/assets/mech_harp.mjs
import {
  THREE, prng, plane, planeD, Mesh, mossCap, piece, boxPlanes, prismPlanes, addGeo, lathe, extrude, poly2, mat4,
  carvedStone, bronzePaint, writeAsset, sheet,
  setLod,
} from './mech_lib.mjs';

const PX = 1.5, YB = 0.66, YT = 3.205;

function harp(lod) {
  setLod(lod);
  const mesh = new Mesh(), rnd = prng(71);
  const paint = carvedStone({ H: 4, seed: 71, warm: 0.35, base: 0.68 });
  const bronze = bronzePaint({ seed: 72, green: 0.55 });
  const bev = lod === 0 ? 0.022 : 0.03;
  const B = (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bev * 0.8 : bev);
  const moss = [];
  for (const sx of [-1, 1]) {
    const x = sx * PX;
    // plinth (sunk), base moulding, octagonal shaft with entasis, capital, neck, pyramid finial
    const pl = piece(mesh, boxPlanes([x - 0.4, -0.25, -0.37, x + 0.4, 0.2, 0.37], { floor: true, extra: [plane([sx * 0.2, 1, 0.1], [x, 0.205, 0])] }), { bevel: B, paint });
    moss.push(pl);
    piece(mesh, prismPlanes(8, 0.33, 0.31, 0.19, 0.36, { rot: 22.5, cx: x }), { bevel: B, paint });
    piece(mesh, prismPlanes(8, 0.29, 0.255, 0.35, 2.92, { rot: 22.5, cx: x }), { bevel: (e) => (e.corner ? bev * 0.7 : Math.abs(e.b[1] - e.a[1]) > 1 ? bev * 1.3 : bev), paint });
    piece(mesh, prismPlanes(8, 0.27, 0.32, 2.9, 3.02, { rot: 22.5, cx: x }), { bevel: B, paint });
    piece(mesh, boxPlanes([x - 0.34, 3.0, -0.3, x + 0.34, 3.14, 0.3]), { bevel: B, paint });
    // the yoke rests on 3.14 .. 3.62; neck and finial above it
    piece(mesh, boxPlanes([x - 0.2, 3.42, -0.2, x + 0.2, 3.7, 0.2]), { bevel: bev * 0.7, paint });
    const fin = prismPlanes(4, 0.24, 0.0, 3.68, 4.02, { rot: 45, cx: x });
    if (sx < 0) fin.push(plane([-0.7, 0.6, 0.4], [x - 0.12, 3.85, 0.08]));     // the west finial chipped
    piece(mesh, fin, { bevel: bev * 0.8, paint });
  }
  // the yoke: one long block, the top a shallow gable, the ends cut back on the slant; a wind spiral carved on its face
  const yoke = [
    ...boxPlanes([-1.86, 3.14, -0.22, 1.86, 3.8, 0.22]),
    plane([0.07, 1, 0], [0, 3.6, 0]), plane([-0.07, 1, 0], [0, 3.6, 0]),
    plane([1, 0.45, 0], [1.86, 3.3, 0]), plane([-1, 0.45, 0], [-1.86, 3.3, 0]),
  ];
  const Y = piece(mesh, yoke, { bevel: B, paint });
  {
    const o = [], i = [];
    for (let k = 0; k <= 50; k++) { const t = k / 50, a = 0.4 + t * Math.PI * 2.1, r = 0.15 - t * 0.12, w = 0.028 - t * 0.016; o.push([Math.cos(a) * (r + w / 2), Math.sin(a) * (r + w / 2)]); i.push([Math.cos(a) * (r - w / 2), Math.sin(a) * (r - w / 2)]); }
    addGeo(mesh, extrude(poly2([...o, ...i.reverse()]), 0.012, { bevel: 0.004 }), { paint, matrix: mat4([0, 3.42, 0.218]) });
    // gust lines either side
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) piece(mesh, boxPlanes([sx * (0.26 + k * 0.05) - (sx < 0 ? 0.32 - k * 0.07 : 0), 3.34 + k * 0.07, 0.215, sx * (0.26 + k * 0.05) + (sx > 0 ? 0.32 - k * 0.07 : 0), 3.36 + k * 0.07, 0.232]), { bevel: 0.004, paint, corners: false });
  }
  // the string bar between the plinths: a stone beam, its top worn pale
  piece(mesh, boxPlanes([-1.2, 0.42, -0.17, 1.2, YB - 0.012, 0.17], { extra: [plane([0, 1, 0.35], [0, YB - 0.015, 0.1]), plane([0, 1, -0.35], [0, YB - 0.015, -0.1])] }), { bevel: B, paint: carvedStone({ H: 1, seed: 74, base: 0.74 }) });
  // bronze: a pin and a collar for every string at the bar, a peg with a turned head under the yoke
  for (let k = 0; k < 7; k++) {
    const x = -1.05 + k * 0.35;
    addGeo(mesh, lathe([[0, YB - 0.02], [0.03, YB - 0.02], [0.032, YB + 0.01], [0.018, YB + 0.02], [0.012, YB + 0.035], [0, YB + 0.04]], lod === 0 ? 10 : 6), { paint: bronze, part: 'bronze', matrix: mat4([x, 0, 0]) });
    addGeo(mesh, lathe([[0, YT - 0.03], [0.026, YT - 0.025], [0.03, YT + 0.0], [0.016, YT + 0.02], [0.016, 3.16], [0, 3.16]], lod === 0 ? 10 : 6), { paint: bronze, part: 'bronze', matrix: mat4([x, 0, 0]) });
    // the tuning key: a short bar through the yoke's face with a knob
    addGeo(mesh, lathe([[0, 0], [0.018, 0], [0.018, 0.09], [0.035, 0.1], [0.035, 0.13], [0, 0.135]], lod === 0 ? 8 : 5), { paint: bronze, part: 'bronze', matrix: mat4([x, 3.26, 0.2], [Math.PI / 2, 0, 0]) });
  }
  // moss at the pillars' feet (north = -Z) and in the yoke's middle
  const MOSS = lod === 0 ? { rings: 3, segs: 12 } : { rings: 2, segs: 8 };
  let s = 81;
  for (const P of moss) for (const at of [[-0.15, -0.22], [0.25, -0.2]]) mossCap(mesh, [P.planes], { at: [at[0] + (P === moss[0] ? -PX : PX), at[1]], R: 0.14 + rnd() * 0.06, T: 0.03, seed: s++, ...MOSS });
  mossCap(mesh, [Y.planes], { at: [-0.5, -0.1], R: 0.13, T: 0.025, seed: s++, ...MOSS });
  return mesh;
}

async function main() {
  const lods = [harp(0), harp(1)];
  const r = await writeAsset('mech_harp', lods, {
    source: 'tools/sculpt/assets/mech_harp.mjs (node, facet kit + three.js generators)',
    notes: 'Wind page trial: stone harp (octagonal pillars on plinths, capitals, finials, gabled yoke with a carved wind spiral, stone string bar, bronze pins and tuning keys per string, moss). The strings stay the game\'s own glowing meshes. Vertex colours on every LOD.',
    extras: { family: 'page_sites', mech: 'harp' },
  });
  console.log('mech_harp tris', r.tris.join(' / '), 'KB', r.kb);
  await sheet('mech_harp', [{ mesh: lods[0], az: 20, el: 10, label: 'front' }, { mesh: lods[0], az: 200, el: 15, label: 'back' }, { mesh: lods[1], az: 40, el: 20, label: 'lod1' }], { cols: 3, ts: 420 });
}
main().catch((e) => { console.error(e); process.exit(1); });
