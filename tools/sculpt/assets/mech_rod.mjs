// The thunder trial's lightning rod (gameplay/wilds-pages.js MECH.rod): an iron rod on the stump of an old round tower;
// a copper strap runs down the tower and along the ground into the seal stone, where the struck lightning goes.
// Replaces a cylinder stump, four boxes, a thin cylinder, a bar, a cone, a box strap and a cylinder seal stone.
// INTENT
//  silhouette: a squat round tower of coursed ashlar, broken off unevenly, four teeth of its parapet left; out of it a
//    tall iron rod with collars, a cross bar with knobs and a crowned point; three iron stays brace it.
//  big forms: the tower stump / the rod / the seal stone in front.
//  the eye rests on: the crown of spikes at the top, the green-brown copper strap with its rivets down the front, the
//    bolt carved on the seal stone (inside the game's glowing ring).
//  wear: the parapet ragged; lightning scorch round the rod's foot; rust streaks under the stays; moss in the joints of
//    the north side and on the broken top.
// Coordinates: origin = ground at the tower's centre, +Z = the front (strap, seal stone at z 2.6). Kept from the old
// build: stump radius 1.75 at the foot / 1.5 at the top (collider r 1.75 up to 3.9), parapet top ~3.9, rod top 9.9 - 10.1
// (rodTop 9.9), seal stone r 1.0 with its top at 0.26 (the game's glyph ring lies at y 0.28 on it).
//   node tools/sculpt/assets/mech_rod.mjs
import {
  prng, plane, planeD, Mesh, mossCap, piece, boxPlanes, prismPlanes, ringBlockPlanes, addGeo, lathe, tube, extrude, poly2, mat4,
  carvedStone, ironPaint, bronzePaint, writeAsset, sheet, mixc, col, ss,
  setLod,
} from './mech_lib.mjs';

const COURSES = [[-0.35, 0.42], [0.42, 1.18], [1.18, 1.92], [1.92, 2.68], [2.68, 3.42]];
const rOut = (y) => 1.75 - (y + 0.35) / 3.77 * 0.25;

function rod(lod) {
  setLod(lod);
  const mesh = new Mesh(), rnd = prng(91);
  const scorch = (p) => ss(1.9, 0.6, Math.hypot(p[0], p[2])) * ss(3.0, 3.45, p[1]);
  const base = carvedStone({ H: 3.5, seed: 91, warm: 0.4, base: 0.64, lichen: 0.6 });
  const paint = (c) => mixc(base(c), col('#3a3430'), scorch(c.p) * 0.55);
  const iron = ironPaint({ seed: 92, rust: 0.55 });
  const copper = bronzePaint({ seed: 93, green: 0.65, metal: '#b06a3c', dark: '#7a4426', verd: '#5fa58a' });
  const bev = lod === 0 ? 0.03 : 0.04;
  const B = (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bev * 0.8 : bev);
  const tops = [];
  // ---- the stump: five courses of twelve blocks, each course turned half a block, the top course broken
  COURSES.forEach(([y0, y1], c) => {
    const n = 12, off = (c % 2) * 15 + (rnd() - 0.5) * 4;
    for (let i = 0; i < n; i++) {
      const a0 = off + (i * 360) / n, a1 = a0 + 360 / n;
      let top = y1;
      if (c === COURSES.length - 1) {
        // the broken parapet: four teeth stand (around the old merlons), the rest lower and ragged
        const am = ((a0 + a1) / 2 + 360) % 360, tooth = [0, 72, 216, 288].some((t) => Math.abs(((am - t + 540) % 360) - 180) < 14);
        top = tooth ? 3.9 + rnd() * 0.08 : y0 + 0.18 + rnd() * 0.3;
      }
      const ro = rOut(y0) + (rnd() - 0.5) * 0.02, ri = Math.max(0.55, ro - 0.5);
      const extra = [];
      if (c === COURSES.length - 1 && top < 3.6) extra.push(plane([(rnd() - 0.5) * 0.5, 1, (rnd() - 0.5) * 0.5], [0, top, 0]));
      const P = piece(mesh, ringBlockPlanes(a0, a1, ri, ro, y0, Math.min(top, 3.98), { gap: 0.008, floor: c === 0, lean: 0.07, extra }), { bevel: B, paint, minAngle: 0.12 });
      if (c >= COURSES.length - 2) tops.push(P);
    }
  });
  // the core: rubble fill seen from above, the rod's socket block in the middle
  piece(mesh, prismPlanes(12, 1.2, 1.18, 0.0, 3.0, { rot: 7 }), { bevel: 0.0, paint: carvedStone({ H: 3, seed: 95, base: 0.5 }) });
  piece(mesh, prismPlanes(8, 0.32, 0.26, 2.9, 3.18, { rot: 22.5 }), { bevel: bev * 0.6, paint });
  // ---- the iron rod: octagonal, collars, cross bar with knobs, crowned point
  const ironDetail = lod === 0 ? 1 : 0;
  piece(mesh, prismPlanes(8, 0.085, 0.06, 3.1, 9.62, { rot: 22.5 }), { bevel: 0.012, paint: iron, part: 'iron', corners: false });
  for (const y of [3.2, 4.6, 6.1, 7.6]) piece(mesh, prismPlanes(8, 0.125, 0.12, y, y + 0.12, { rot: 22.5 }), { bevel: 0.015, paint: iron, part: 'iron', corners: false });
  piece(mesh, boxPlanes([-0.56, 8.57, -0.035, 0.56, 8.64, 0.035]), { bevel: 0.01, paint: iron, part: 'iron', corners: false });
  for (const sx of [-1, 1]) piece(mesh, prismPlanes(6, 0.065, 0.065, 8.56, 8.66, { cx: sx * 0.6 }).concat([plane([sx, 1, 0], [sx * 0.6, 8.68, 0]), plane([sx, -1, 0], [sx * 0.6, 8.54, 0])]), { bevel: 0.01, paint: iron, part: 'iron', corners: false });
  // the crown: a knob, four bent spikes round a tall middle point
  addGeo(mesh, lathe([[0.0, 9.52], [0.1, 9.56], [0.13, 9.64], [0.1, 9.72], [0.05, 9.76], [0.05, 9.8], [0, 9.8]], 8), { paint: iron, part: 'iron' });
  piece(mesh, prismPlanes(4, 0.06, 0.0, 9.78, 10.12, { rot: 45 }), { bevel: 0.0, paint: iron, part: 'iron', corners: false });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, ox = Math.sin(a), oz = Math.cos(a);
    addGeo(mesh, tube([[ox * 0.08, 9.7, oz * 0.08], [ox * 0.16, 9.78, oz * 0.16], [ox * 0.17, 9.9, oz * 0.17], [ox * 0.15, 9.98, oz * 0.15]], 0.016, { seg: 6 + 4 * ironDetail, radial: 5 }), { paint: iron, part: 'iron' });
  }
  // three stays from the parapet to the rod
  for (const a of [0.35, 2.45, 4.55]) {
    const sx = Math.sin(a), sz = Math.cos(a);
    addGeo(mesh, tube([[sx * 1.25, 3.3, sz * 1.25], [sx * 0.65, 4.2, sz * 0.65], [sx * 0.1, 5.05, sz * 0.1]], 0.028, { seg: 8, radial: 6, tension: 0 }), { paint: iron, part: 'iron' });
    piece(mesh, boxPlanes([sx * 1.25 - 0.08, 3.22, sz * 1.25 - 0.08, sx * 1.25 + 0.08, 3.34, sz * 1.25 + 0.08]), { bevel: 0.01, paint: iron, part: 'iron', corners: false });
  }
  piece(mesh, prismPlanes(8, 0.12, 0.12, 5.0, 5.12, { rot: 22.5 }), { bevel: 0.015, paint: iron, part: 'iron', corners: false });
  // ---- the copper strap: up the rod a little, down the front of every course, along the ground to the seal stone
  const strapPts = [[0, 4.05, 0.08], [0, 3.5, 0.1]];
  for (let c = COURSES.length - 1; c >= 0; c--) { const [y0, y1] = COURSES[c]; strapPts.push([0, Math.min(y1, 3.42) - 0.02, rOut(y0) + 0.012], [0, y0 + 0.04, rOut(y0) + 0.012]); }
  strapPts.push([0, 0.02, 1.8], [0, 0.02, 1.62]);
  for (let k = 0; k + 1 < strapPts.length; k++) {
    const [a, b] = [strapPts[k], strapPts[k + 1]];
    if (Math.hypot(a[1] - b[1], a[2] - b[2]) < 0.01) continue;
    const dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dy, dz), th = Math.atan2(dz, dy);
    // a thin flat band from a to b, 0.12 wide, 0.012 thick
    piece(mesh, boxPlanes([-0.06, 0, -0.006, 0.06, L, 0.006]), { bevel: 0.003, paint: copper, part: 'bronze', corners: false, xf: { p: (p) => [p[0], a[1] + p[1] * Math.cos(th) - p[2] * Math.sin(th), a[2] + p[1] * Math.sin(th) + p[2] * Math.cos(th)], n: (n) => [n[0], n[1] * Math.cos(th) - n[2] * Math.sin(th), n[1] * Math.sin(th) + n[2] * Math.cos(th)] } });
    // rivets on the strap's outer face (away from the stone)
    let ny = -Math.sin(th), nz = Math.cos(th);
    if (ny + nz < 0) { ny = -ny; nz = -nz; }
    if (lod === 0) for (let t = 0.25; t < L; t += 0.42) addGeo(mesh, lathe([[0, 0], [0.018, 0], [0.014, 0.012], [0, 0.016]], 6), { paint: copper, part: 'bronze', matrix: mat4([0, a[1] + dy * (t / L) + ny * 0.005, a[2] + dz * (t / L) + nz * 0.005], [Math.atan2(nz, ny), 0, 0]) });
  }
  // the strap's foot: a copper plate bolted down where it meets the seal stone
  piece(mesh, boxPlanes([-0.1, 0.0, 1.56, 0.1, 0.05, 1.82]), { bevel: 0.008, paint: copper, part: 'bronze', corners: false });
  // ---- the seal stone: a round slab, a lightning bolt carved standing out of its top, scorched
  const sealPaint = carvedStone({ H: 0.4, seed: 97, base: 0.6, lichen: 0.3 });
  piece(mesh, prismPlanes(lod === 0 ? 18 : 12, 1.02, 0.96, -0.12, 0.26, { cz: 2.6, floor: true }), { bevel: lod === 0 ? 0.03 : 0.04, paint: sealPaint });
  addGeo(mesh, extrude(poly2([[-0.05, 0.21], [0.1, 0.21], [0.02, 0.045], [0.12, 0.045], [-0.08, -0.22], [-0.01, -0.035], [-0.1, -0.035]].map(([x, y]) => [x * 1.6, y * 1.6])), 0.02, { bevel: 0.006 }), { paint: sealPaint, matrix: mat4([0, 0.25, 2.6], [-Math.PI / 2, 0, 0]) });
  // ---- moss: on the broken top and the north foot
  const MOSS = lod === 0 ? { rings: 3, segs: 12 } : { rings: 2, segs: 8 };
  let s = 101;
  for (const P of tops.filter(() => rnd() < 0.35).slice(0, 6)) {
    const pl = P.planes.filter((q) => q.kind !== 'chamfer');
    const top = pl.find((q) => q.n[1] > 0.8);
    if (!top) continue;
    // the block's middle: average of its outer / inner planes' foot points is unknown here; sample on the ring
    const a = Math.atan2(pl[0].n[0], pl[0].n[2]), r = 1.45;
    mossCap(mesh, [P.planes], { at: [Math.sin(a) * r, Math.cos(a) * r], R: 0.16, T: 0.03, seed: s++, ...MOSS });
  }
  return mesh;
}

async function main() {
  const lods = [rod(0), rod(1)];
  const r = await writeAsset('mech_rod', lods, {
    source: 'tools/sculpt/assets/mech_rod.mjs (node, facet kit + three.js generators)',
    notes: 'Thunder page trial: lightning rod on a broken round tower of coursed ashlar (five courses, four parapet teeth), octagonal iron rod with collars, cross bar, crowned point and three stays, copper strap with rivets down the front into a round seal stone with a carved bolt. Vertex colours on every LOD.',
    extras: { family: 'page_sites', mech: 'rod' },
  });
  console.log('mech_rod tris', r.tris.join(' / '), 'KB', r.kb, 'top', r.bounds[4].toFixed(2));
  await sheet('mech_rod', [{ mesh: lods[0], az: 15, el: 8, label: 'front' }, { mesh: lods[0], az: 200, el: 35, label: 'back high' }, { mesh: lods[1], az: 60, el: 15, label: 'lod1' }], { cols: 3, ts: 420 });
}
main().catch((e) => { console.error(e); process.exit(1); });
