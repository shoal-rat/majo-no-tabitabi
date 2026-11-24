// Saya's practice field outside the City of Magic (episode two; errands round, 2026-11-23): the worn earth track that
// rings the field is a footpath loop in src/data/world.js ROADS ('practice_track', painted by the terrain shader:
// pale dirt, wheel / foot ruts, grass kept off it and thinned along its shoulders). This builder adds the props a
// training ground has: round targets on easel stands along the south edge, striped slalom posts on the west side, a
// bench by the path from the city, a broom rack. Everything stays outside the track's width, away from the story spots
// (the practice anchor where Saya teaches, the ring course to the north-west: story/episode-scenes.js flightOffsets).
// Round art-ground (2026-11-24): the props are made the way a carpenter would: coiled straw bosses with a pinned
// canvas face and cords bound round the rim on a lashed three-leg easel with a rest rail; turned and carved slalom poles
// with beads, painted bands, a turned finial and a pennant in the wind; a bench of crowned planks on splayed legs whose
// wedged through-tenons show on the seat, with stretchers and a pegged back rail; a rack of posts on cross-halved feet
// with braces, a through-tenoned, pegged rail and pegs, brooms with bound bristle heads. Dressed timber is bevelled
// prisms (builders/facet-prism.js: chamfered arrises), turned work is lathed. Same colliders; ?sculpt=0: the old props.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { box, cyl, sphere, torus } from '../../core/geo.js';
import { Site, mat, sculptVcMat, clothify } from './kit.js';
import { JOURNEY_ANCHORS } from '../../data/journey-map.js';
import { PRACTICE_TRACK } from '../../data/world.js';
import { Tris, block, linHex } from './facet-prism.js';

const wood = mat.wood(0x7b5c3e), dark = mat.wood(0x4d3b2b), straw = mat.cloth(0xd8be7a), paintW = mat.paint(0xf1e9d6),
  paintR = mat.paint(0xb5453a), paintB = mat.paint(0x3f5f8f), iron = mat.metal(0x4b4642), bristle = mat.cloth(0xb9955a);
const rope = mat.cloth(0xb59d6c), twine = mat.cloth(0x8a6f45);
const modelled = () => G.sculpt?.enabled !== false;
const fine = () => !G.quality?.mobile && G.quality?.name !== 'low';

// ---------------------------------------------------------------------------------------------- carpentry helpers
const OAK = linHex(0x8c6c4a), OAK_DARK = linHex(0x5a4532), GREY = linHex(0x7d6c5a);
/** timber paint: worn arrises paler, end grain darker, a faint per-piece drift */
const timberPaint = (base, k = 1) => (part, p, n, P, N) => {
  let v = k;
  if (part === 'edge') v *= 1.14;
  else if (part === 'top' || part === 'bottom') v *= 0.82;          // end grain (the prism runs along the timber)
  if (N[1] > 0.7 && part === 'side') v *= 1.06;                       // sun-bleached upper faces
  return [base[0] * v, base[1] * v, base[2] * v];
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** a dressed timber from a to b ([x, y, z]), section w (across) x d, every arris chamfered by c; `roll` turns it about its axis */
function timber(T, a, b, w, d, c, paint, roll = 0) {
  _a.fromArray(a); _b.fromArray(b);
  _y.subVectors(_b, _a); const L = _y.length(); _y.normalize();
  _x.set(0, 1, 0); if (Math.abs(_y.y) > 0.9) _x.set(1, 0, 0);
  _z.crossVectors(_x, _y).normalize(); _x.crossVectors(_y, _z).normalize();
  if (roll) { _x.applyAxisAngle(_y, roll); _z.applyAxisAngle(_y, roll); }
  const m = new THREE.Matrix4().makeBasis(_x, _y, _z).setPosition(_a.clone().add(_b).multiplyScalar(0.5));
  return block(T, w, L, d, c, paint, m);
}
/** the vertex-coloured timber of one prop as a mesh (joins the site's wood family) */
function timberMesh(T) {
  const m = new THREE.Mesh(T.geometry(), sculptVcMat(mat.wood(0x7b5c3e)));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/** turned work: a lathe about local y from a profile [[r, y], ...] */
function lathe(profile, material, seg = 14) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg);
  const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true;
  return m;
}
/** a cord along points (a tube) */
function cord(points, r, material, seg = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 5, false), material); m.castShadow = false; m.receiveShadow = true;
  return m;
}

/** The modelled target: coiled straw boss, pinned canvas face, cords round the rim, lashed easel with a rest rail. */
function targetModel(g) {
  const T = new Tris(), legP = timberPaint(OAK, 0.95), railP = timberPaint(OAK_DARK);
  // easel: two front legs splayed, a back leg, a rest rail across the front legs, a tie under the apex
  for (const sx of [-1, 1]) timber(T, [sx * 0.58, -0.05, 0.22], [sx * 0.17, 1.74, 0.0], 0.075, 0.06, 0.012, legP, sx * 0.05);
  timber(T, [0, -0.05, -0.78], [0, 1.66, -0.06], 0.07, 0.06, 0.012, legP);
  timber(T, [-0.56, 0.6, 0.205], [0.56, 0.6, 0.205], 0.09, 0.05, 0.01, railP);              // the rest the boss stands on
  timber(T, [-0.3, 1.5, 0.07], [0.3, 1.5, 0.07], 0.05, 0.035, 0.008, railP);               // tie between the front legs
  for (const sx of [-1, 1]) timber(T, [sx * 0.5, 0.65, 0.245], [sx * 0.5, 0.75, 0.255], 0.03, 0.03, 0.005, railP);   // stop pegs
  g.add(timberMesh(T));
  // lashing round the apex: a few turns of cord
  for (let i = 0; i < 3; i++) { const t = torus(0.055, 0.009, rope, 0, 1.66 - i * 0.025, -0.02, 5, 10); t.rotation.x = Math.PI / 2 - 0.3; g.add(t); }
  // the boss: coiled straw (ridges on the back, a rounded rim), canvas face, rings painted on it, cords bound round
  const face = new THREE.Group(); face.position.set(0, 1.18, 0.12); face.rotation.x = -0.12;
  const prof = [[0, -0.082]];
  for (let i = 1; i <= 9; i++) prof.push([i * 0.054, -0.088 - (i % 2) * 0.007]);      // coil ridges on the back
  for (let k = 0; k <= 8; k++) { const t = -Math.PI / 2 + (k / 8) * Math.PI; prof.push([0.505 + 0.065 * Math.cos(t), 0.088 * Math.sin(t)]); }
  prof.push([0.47, 0.09], [0, 0.094]);
  const boss = lathe(prof, straw, fine() ? 28 : 18); boss.geometry.rotateX(Math.PI / 2); face.add(boss);
  [[0.5, 0.38, paintW], [0.38, 0.26, paintB], [0.26, 0.14, paintW], [0.14, 0, paintR]].forEach(([r0, r1, m], i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r1, r0, fine() ? 28 : 18), m); ring.position.z = 0.097 + i * 0.0025; face.add(ring);
  });
  for (let i = 0; i < 4; i++) { const a = (i + 0.5) * Math.PI / 2, pin = cyl(0.008, 0.008, 0.02, iron, Math.cos(a) * 0.47, Math.sin(a) * 0.47, 0.106, 5); pin.rotation.x = Math.PI / 2; face.add(pin); }
  const nC = fine() ? 8 : 6;
  for (let i = 0; i < nC; i++) {
    const a = (i / nC) * Math.PI * 2 + 0.2, c = Math.cos(a), sn = Math.sin(a), at = (r, z) => [c * r, sn * r, z];
    face.add(cord([at(0.47, 0.1), at(0.545, 0.085), at(0.585, 0.02), at(0.578, -0.05), at(0.5, -0.1), at(0.2, -0.1), at(0.04, -0.094)], 0.011, rope, fine() ? 16 : 10));
  }
  g.add(face);
}
/** A round practice target: a straw boss painted with rings, leaning on an easel stand (faces local +z). */
function target(site, x, z, ry) {
  const g = new THREE.Group(), y = site.h(x, z);
  if (modelled()) { targetModel(g); site.add(g, x, y, z, ry); site.colBox(x, z, 0.62, 0.3, ry, y - 0.5, y + 1.8); return; }
  for (const s of [-1, 1]) { const leg = box(0.07, 1.5, 0.07, wood, s * 0.42, 0.72, 0.08); leg.rotation.z = s * 0.16; leg.rotation.x = 0.1; g.add(leg); }
  const back = box(0.07, 1.45, 0.07, wood, 0, 0.66, -0.42); back.rotation.x = -0.42; g.add(back);
  const face = new THREE.Group(); face.position.set(0, 1.18, 0.12); face.rotation.x = -0.12;
  const boss = cyl(0.56, 0.56, 0.16, straw, 0, 0, 0, 20); boss.rotation.x = Math.PI / 2; face.add(boss);
  [[0.5, paintW], [0.38, paintB], [0.26, paintW], [0.14, paintR]].forEach(([r, m], i) => { const d = cyl(r, r, 0.02, m, 0, 0, 0.085 + i * 0.004, 20); d.rotation.x = Math.PI / 2; face.add(d); });
  g.add(face);
  site.add(g, x, y, z, ry);
  site.colBox(x, z, 0.62, 0.3, ry, y - 0.5, y + 1.8);
}
/** a pennant hanging from the pole: a long triangle, both faces, swaying in the wind from its hoist (clothify) */
function pennant(material, h = 0.3, L = 0.52) {
  const n = 8, pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, half = (h / 2) * (1 - t * 0.92), x = 0.1 + t * L, zz = 0.025 * Math.sin(t * 5.2) * t;
    pos.push(x, half, zz, x, -half, zz); uv.push(0.5 + half, 1 - t, 0.5 - half, 1 - t);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, clothify(material, 0.14)); m.castShadow = true;
  return m;
}
/** The modelled pole: turned, a carved bead at each band, painted bands, a turned finial, driven wedges at its foot. */
function postModel(g, k) {
  const R = 0.088, prof = [[0, -0.3], [0.1, -0.3], [0.1, 0.02], [0.118, 0.05], [0.118, 0.12], [0.1, 0.16], [R + 0.004, 0.24]];
  const bands = [];
  for (let i = 0; i < 4; i++) bands.push(1.1 + i * 0.55);
  for (const b of bands) { prof.push([R, b - 0.03], [R + 0.016, b - 0.012], [R, b + 0.004]); }
  prof.push([R - 0.006, 2.98], [0.075, 3.02], [0.05, 3.06], [0.058, 3.1], [0.086, 3.16], [0.09, 3.22], [0.07, 3.3], [0.03, 3.34], [0.012, 3.42], [0, 3.43]);
  g.add(lathe(prof, wood, fine() ? 12 : 8));
  bands.forEach((b, i) => g.add(lathe([[R + 0.004, b], [R + 0.004, b + 0.22]], i % 2 ? paintW : (k % 2 ? paintR : paintB), fine() ? 12 : 8)));
  g.add(torus(0.074, 0.009, iron, 0, 3.035, 0, 5, 12).rotateX(Math.PI / 2));
  const fl = pennant(k % 2 ? paintR : paintB); fl.position.y = 2.86; g.add(fl);
  for (let i = 0; i < 3; i++) {   // wedges driven round the foot
    const a = i * 2.1 + k, w = cyl(0.0, 0.035, 0.16, dark, Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13, 4); w.rotation.z = Math.cos(a) * 0.35; w.rotation.x = -Math.sin(a) * 0.35; g.add(w);
  }
}
/** A tall slalom post with painted bands and a pennant at the top. */
function post(site, x, z, k) {
  const y = site.h(x, z), g = new THREE.Group();
  if (modelled()) { postModel(g, k); site.add(g, x, y, z, k * 0.7); site.colCyl(x, z, 0.14, y - 0.5, y + 3.3); return; }
  g.add(cyl(0.09, 0.11, 3.2, wood, 0, 1.6, 0, 8));
  for (let i = 0; i < 4; i++) g.add(cyl(0.1, 0.1, 0.22, i % 2 ? paintW : (k % 2 ? paintR : paintB), 0, 1.1 + i * 0.55, 0, 8));
  const flag = box(0.02, 0.32, 0.5, k % 2 ? paintR : paintB, 0, 3.0, 0.27); g.add(flag);
  g.add(sphere(0.1, iron, 0, 3.25, 0, 8, 6));
  site.add(g, x, y, z, k * 0.7);
  site.colCyl(x, z, 0.14, y - 0.5, y + 3.3);
}
/** The modelled bench: two crowned planks on splayed legs with wedged through-tenons, stretchers, a pegged back. */
function benchModel(g) {
  const T = new Tris(), seatP = timberPaint(OAK, 1.05), legP = timberPaint(OAK_DARK), endP = timberPaint(OAK_DARK, 0.7), pegP = timberPaint(GREY, 0.8);
  for (const sz of [-0.105, 0.105]) timber(T, [-0.95, 0.455, sz], [0.95, 0.455, sz], 0.2, 0.055, 0.012, seatP, Math.PI / 2);
  for (const sx of [-1, 1]) {
    // front legs through the seat: the tenon's end grain shows on the seat, a little proud, with its wedge
    const top = [sx * 0.72, 0.485, 0.1];
    timber(T, [sx * 0.8, 0, 0.19], [top[0], 0.43, top[2]], 0.06, 0.06, 0.01, legP);
    timber(T, [top[0], 0.483, top[2]], [top[0], 0.489, top[2]], 0.045, 0.045, 0.004, endP);
    timber(T, [top[0], 0.484, top[2]], [top[0], 0.491, top[2]], 0.05, 0.008, 0.001, pegP);
    // the bearer under each end of the seat, notched round the rear leg
    timber(T, [sx * 0.74, 0.405, -0.27], [sx * 0.74, 0.405, 0.2], 0.05, 0.045, 0.008, legP);
  }
  // side stretchers (through-tenoned, the ends proud of the legs) and the long stretcher
  for (const sx of [-1, 1]) timber(T, [sx * 0.775, 0.16, -0.23], [sx * 0.775, 0.16, 0.23], 0.045, 0.04, 0.008, legP, Math.PI / 2);
  timber(T, [-0.79, 0.19, 0], [0.79, 0.19, 0], 0.05, 0.04, 0.008, legP);
  // back: posts rising from the rear legs, a back rail tenoned into them, two pegs each
  for (const sx of [-1, 1]) {
    // rear legs run on up as the back posts, raked back a little
    timber(T, [sx * 0.8, 0, -0.19], [sx * 0.86, 0.97, -0.29], 0.058, 0.055, 0.009, legP);
    timber(T, [sx * 0.85, 0.76, -0.285], [sx * 0.85, 0.76, -0.235], 0.014, 0.014, 0.002, pegP);
    timber(T, [sx * 0.86, 0.86, -0.295], [sx * 0.86, 0.86, -0.245], 0.014, 0.014, 0.002, pegP);
  }
  timber(T, [-0.92, 0.81, -0.265], [0.92, 0.81, -0.265], 0.17, 0.035, 0.01, seatP, Math.PI / 2);
  g.add(timberMesh(T));
}
/** A plain plank bench on two trestles (faces local +z). */
function bench(site, x, z, ry) {
  const y = site.h(x, z), g = new THREE.Group();
  if (modelled()) { benchModel(g); site.add(g, x, y, z, ry); site.colBox(x, z, 0.98, 0.26, ry, y - 0.5, y + 0.95); return; }
  g.add(box(1.9, 0.08, 0.42, wood, 0, 0.46, 0));
  for (const s of [-1, 1]) { g.add(box(0.08, 0.44, 0.36, dark, s * 0.75, 0.22, 0)); }
  g.add(box(1.9, 0.3, 0.05, wood, 0, 0.78, -0.2));
  for (const s of [-1, 1]) g.add(box(0.06, 0.4, 0.06, dark, s * 0.85, 0.62, -0.2));
  site.add(g, x, y, z, ry);
  site.colBox(x, z, 0.98, 0.26, ry, y - 0.5, y + 0.95);
}
/** a practice broom: turned shaft, a bristle head bound with twine and an iron band */
function broomModel() {
  const b = new THREE.Group();
  b.add(lathe([[0, 0.3], [0.03, 0.3], [0.026, 0.9], [0.023, 1.5], [0.026, 1.53], [0, 1.55]], wood, 8));
  const head = [[0, -0.05]];
  for (let i = 0; i <= 6; i++) { const t = i / 6; head.push([0.17 - 0.012 * (i % 2), -0.05 + t * 0.02]); }
  head.push([0.15, 0.04], [0.1, 0.2], [0.06, 0.33], [0.045, 0.4], [0, 0.4]);
  b.add(lathe(head, bristle, 12));
  // the bristle ends: tufts splaying out past the head's rim, so it ends ragged, not in a cone
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.3 * (i % 3), r = 0.08 + 0.07 * ((i * 7) % 5) / 4, k = 0.2 + 0.25 * r / 0.15;
    const t = cyl(0.002, 0.011, 0.11 + 0.05 * ((i * 3) % 4) / 3, bristle, Math.cos(a) * r, -0.09, Math.sin(a) * r, 4);
    t.rotation.set(Math.sin(a) * k, 0, -Math.cos(a) * k); b.add(t);
  }
  for (const [yb, rr] of [[0.3, 0.052], [0.34, 0.047], [0.12, 0.128]]) b.add(torus(rr, 0.009, twine, 0, yb, 0, 4, 12).rotateX(Math.PI / 2));
  b.add(torus(0.072, 0.009, iron, 0, 0.2, 0, 4, 12).rotateX(Math.PI / 2));
  return b;
}
/** The modelled rack: posts on cross-halved feet with braces, a through-tenoned and pegged rail, three brooms. */
function rackModel(g) {
  const T = new Tris(), postP = timberPaint(OAK_DARK), railP = timberPaint(OAK), pegP = timberPaint(GREY, 0.85);
  for (const sx of [-1, 1]) {
    const x = sx * 0.8;
    timber(T, [x, 0, 0], [x, 1.3, 0], 0.09, 0.09, 0.012, postP);
    timber(T, [x - 0.27, 0.04, 0], [x + 0.27, 0.04, 0], 0.08, 0.07, 0.01, postP, Math.PI / 2);    // cross-halved feet
    timber(T, [x, 0.045, -0.27], [x, 0.045, 0.27], 0.08, 0.075, 0.01, postP);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) timber(T, [x + dx * 0.22, 0.08, dz * 0.22], [x + dx * 0.04, 0.36, dz * 0.04], 0.04, 0.04, 0.007, postP);
    timber(T, [x - 0.012, 1.12, 0.06], [x - 0.012, 1.12, -0.06], 0.018, 0.018, 0.003, pegP);      // rail pegs through the post
  }
  timber(T, [-0.92, 1.12, 0], [0.92, 1.12, 0], 0.07, 0.07, 0.01, railP);
  timber(T, [-0.86, 0.28, 0.02], [0.86, 0.28, 0.02], 0.06, 0.05, 0.009, railP);
  g.add(timberMesh(T));
  // the brooms stand head up (bristles kept off the wet grass), shafts leaning on the top rail
  for (let i = 0; i < 3; i++) {
    const b = broomModel();
    b.rotation.set(Math.PI - 0.28, i * 0.9, (i - 1) * 0.05, 'XYZ');
    b.position.set(-0.55 + i * 0.55, 1.49, -0.06);
    g.add(b);
  }
}
/** A broom rack: two posts, a rail, three practice brooms leaning on it. */
function rack(site, x, z, ry) {
  const y = site.h(x, z), g = new THREE.Group();
  if (modelled()) { rackModel(g); site.add(g, x, y, z, ry); site.colBox(x, z, 0.9, 0.3, ry, y - 0.5, y + 1.4); return; }
  for (const s of [-1, 1]) g.add(box(0.09, 1.3, 0.09, dark, s * 0.8, 0.65, 0));
  g.add(box(1.8, 0.07, 0.07, wood, 0, 1.12, 0));
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    b.add(cyl(0.025, 0.03, 1.5, wood, 0, 0.75, 0, 6));
    const head = cyl(0.05, 0.16, 0.42, bristle, 0, 0.12, 0, 8); b.add(head);
    b.add(torus(0.06, 0.015, iron, 0, 0.36, 0, 5, 10));
    b.position.set(-0.55 + i * 0.55, 0, 0.22); b.rotation.x = -0.28; b.rotation.z = (i - 1) * 0.06;
    g.add(b);
  }
  site.add(g, x, y, z, ry);
  site.colBox(x, z, 0.9, 0.3, ry, y - 0.5, y + 1.4);
}

export async function buildPracticeField(ctx) {
  const a = JOURNEY_ANCHORS.practice;
  const site = new Site('practiceField', a.x, a.z, 0);
  const { rx, rz } = PRACTICE_TRACK;
  // three targets in a row beyond the south curve, facing the field
  for (const [x, k] of [[-9, 0], [-2.5, 1], [4, 2]]) target(site, x, rz + 5.6 + (k === 1 ? 0.8 : 0), Math.PI + (x * 0.012));
  // slalom posts down the west side, inside the track
  for (let k = 0; k < 4; k++) post(site, -rx + 7.5 + (k % 2) * 1.6, -2 + k * 4.2, k);
  // a bench by the path from the city, outside the east curve, looking over the field; the broom rack beside it
  bench(site, rx + 5.2, 7.5, -Math.PI / 2 - 0.25);
  rack(site, rx + 4.4, 11.6, -Math.PI / 2 - 0.4);
  await site.bakeSliced(ctx.step);
  ctx.place('practiceField', { site, group: site.baked });
}
