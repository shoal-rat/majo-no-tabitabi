// Street furniture of the City of Magic, modelled (art pass "modelled, not painted"): turned lamp posts with a lantern
// cage round the blue orb, wall lanterns, an octagonal fountain with moulded coping, panels, a baluster and bowl, spouts
// and falling water, market stalls with turned posts, plank counters, a striped awning with a scalloped valance, slatted
// crates of fruit, baskets, a barrel and sacks, and stone planters with leafy clumps in flower. Builders write into a
// ByMat (one geometry per material) so the site bake merges them like any primitive; the callers keep the glow parts
// (orbs, warm lamps) as before so the night lamp pools still find them.
import * as THREE from 'three';
import { mat } from './kit.js';
import { GeoBuilder, ByMat, hash01, plain } from './city-geo.js';

const C = (hex) => plain(mat.paint(hex));
const fruitM = [0xc8463a, 0xe08a32, 0xd8c24a, 0x8d4a8a, 0x7fae4a, 0xe0645a].map(C),
  leafM = [0x6c9a52, 0x5f8c4a, 0x7aa65c].map(C),
  petalM = [0xd65a4f, 0xe794a8, 0xf3eee2, 0xebc85a, 0xb77ad0].map(C),
  stripe = plain(mat.cloth(0xf3eee2)),
  wicker = mat.wood(0xb08a55),
  burlap = plain(mat.cloth(0xb59a6e)),
  soil = mat.paint(0x5a4836),
  water = mat.paint(0x9fd3e0),
  spray = mat.paint(0xd2eff6),
  bread = C(0xc98a4a);

/** A round fruit (6-sided lathe, slightly squat), into builder b at (x, y, z) with radius r. */
function fruit(b, x, y, z, r, seg = 6) {
  b.lathe([[0.001, -r * 0.85], [r * 0.75, -r * 0.6], [r, 0], [r * 0.8, r * 0.6], [0.001, r * 0.8]], seg, x, y, z);
}
function octa(b, x, y, z, rx, ry, rz = rx) {
  const P = [[x + rx, y, z], [x, y + ry, z], [x - rx, y, z], [x, y - ry * 0.5, z], [x, y, z + rz], [x, y, z - rz]];
  for (const [i, j, k] of [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [1, 0, 5], [2, 1, 5], [3, 2, 5], [0, 3, 5]]) {
    const c = [(P[i][0] + P[j][0] + P[k][0]) / 3 - x, (P[i][1] + P[j][1] + P[k][1]) / 3 - y, (P[i][2] + P[j][2] + P[k][2]) / 3 - z];
    b.tri(P[i], P[j], P[k], c);
  }
}
/** A five-petalled flower head facing up (with a little tilt), centre at (x, y, z). */
function flower(b, centre, x, y, z, r, tilt = 0) {
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const pt = (a, rr) => [x + Math.cos(a) * rr, y + Math.sin(a) * rr * st + 0.01, z + Math.sin(a) * rr * ct];
  for (let k = 0; k < 10; k++) {
    const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
    b.tri([x, y + 0.015, z], pt(a0, k % 2 ? r * 0.45 : r), pt(a1, k % 2 ? r : r * 0.45), [0, 1, 0]);
  }
  octa(centre, x, y + 0.02, z, r * 0.3, r * 0.25);
}

// ---------------------------------------------------------------- lamps
/** Street lamp: turned iron base and shaft, brass collars and cup, a four-post lantern cage and roof round the orb. */
export function streetLamp(g, iron, brass, lite) {
  const B = new ByMat(), I = B.get(iron), Br = B.get(brass);
  const sg = lite ? 6 : 8;
  I.lathe(lite ? [[0.28, 0], [0.24, 0.4], [0.1, 0.7], [0.085, 0.8]] : [[0.3, 0], [0.3, 0.1], [0.26, 0.16], [0.24, 0.4], [0.17, 0.5], [0.15, 0.62], [0.1, 0.7], [0.085, 0.8]], sg, 0, 0, 0, 0, Math.PI / 8, true);
  I.lathe([[0.085, 0.8], [0.068, 3.42]], sg);
  Br.lathe([[0.07, 1.12], [0.12, 1.16], [0.12, 1.26], [0.07, 1.3]], 8);
  Br.lathe([[0.068, 3.38], [0.14, 3.52], [0.2, 3.7], [0.25, 3.78], [0.08, 3.82]], 10);
  for (let k = 0; k < (lite ? 0 : 4); k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, px = Math.sin(a) * 0.34, pz = Math.cos(a) * 0.34;
    I.box(px - 0.018, 3.78, pz - 0.018, px + 0.018, 4.58, pz + 0.018, 'nypy');
  }
  I.lathe([[0.36, 4.55], [0.41, 4.6], [0.41, 4.67], [0.33, 4.69]], 8, 0, 0, 0, 0, Math.PI / 8, true);
  I.lathe([[0.44, 4.66], [0.13, 4.88], [0.06, 4.95]], 4, 0, 0, 0, 1, Math.PI / 4, true);
  Br.lathe([[0.001, 4.93], [0.06, 4.99], [0.05, 5.05], [0.001, 5.12]], 6);
  if (!lite)
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 9; i++) { const t = i / 9, a = -Math.PI / 2 + t * Math.PI * 1.3; pts.push([s * (0.07 + 0.2 * t + Math.cos(a) * 0.06 * (1 - t)), 3.0 + 0.55 * t + Math.sin(a) * 0.08, 0]); }
      Br.tube(pts, 0.016, 4);
    }
  B.flush(g);
}
/** Wall lantern on an iron scroll bracket, out from a wall at x = 0 along +x (dir -1: along -x); warm glow kept by caller. */
export function wallLantern(g, iron, y, z, dir, lite) {
  const B = new ByMat(), I = B.get(iron), d = dir;
  I.box(d > 0 ? 0 : -0.04, y - 0.25, z - 0.09, d > 0 ? 0.04 : 0, y + 0.25, z + 0.09);
  const pts = [];
  for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push([d * (0.02 + 0.55 * t), y + 0.12 * Math.sin(t * Math.PI) - 0.1 * t, z]); }
  I.tube(pts, 0.025, 3);
  if (!lite) { const sc = []; for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 1.5; sc.push([d * (0.12 + Math.cos(a) * 0.09), y - 0.12 + Math.sin(a) * 0.09, z]); } I.tube(sc, 0.014, 3); }
  const cx = d * 0.55, top = y - 0.12;
  if (!lite)
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2, px = cx + Math.sin(a) * 0.17, pz = z + Math.cos(a) * 0.17;
      I.box(px - 0.012, top - 0.5, pz - 0.012, px + 0.012, top - 0.06, pz + 0.012, 'nypyny');
    }
  I.lathe([[0.22, top - 0.08], [0.07, top + 0.06], [0.03, top + 0.12]], 4, cx, 0, z, 1, Math.PI / 4, true);
  I.lathe([[0.2, top - 0.54], [0.2, top - 0.5], [0.001, top - 0.62]], 4, cx, 0, z, 0, Math.PI / 4, true);
  B.flush(g);
  return [cx, top - 0.28, z];
}

// ---------------------------------------------------------------- fountain
/** The octagonal fountain (radius 3.86 m): basin, panels, baluster and bowl, spouts and falling water; gem by caller. */
export function fountainModel(g, stone, coping, brass, lite) {
  const B = new ByMat(), S = B.get(stone), K = B.get(coping), W = B.get(water);
  const ph = Math.PI / 8;
  S.lathe([[3.72, 0], [3.72, 0.1], [3.6, 0.18], [3.6, 0.68]], 8, 0, 0, 0, 0, ph, true);
  K.lathe([[3.6, 0.68], [3.78, 0.74], [3.88, 0.84], [3.88, 0.96], [3.76, 1.03], [3.42, 1.03], [3.36, 0.97], [3.36, 0.72]], 8, 0, 0, 0, 0, ph, true);
  W.lathe([[3.37, 0.78], [0.001, 0.78]], 8, 0, 0, 0, 0, ph);
  // raised panels on the basin's faces
  const ap = 3.6 * Math.cos(Math.PI / 8);
  for (let k = 0; k < (lite ? 0 : 8); k++) {
    const t = new GeoBuilder();
    t.bevel(-1.05, 0.26, -0.02, 1.05, 0.58, 0.045, 0.02, '');
    S.append(t, new THREE.Matrix4().makeRotationY((k * Math.PI) / 4).setPosition(Math.sin((k * Math.PI) / 4) * ap, 0, Math.cos((k * Math.PI) / 4) * ap));
  }
  // finials on four corners of the coping
  for (let k = 0; k < 4; k++) {
    const a = ph + (k * Math.PI) / 2, r = 3.66;
    K.lathe([[0.18, 1.02], [0.12, 1.08], [0.09, 1.16], [0.2, 1.3], [0.21, 1.4], [0.12, 1.52], [0.001, 1.6]], 8, Math.sin(a) * r, 0, Math.cos(a) * r);
  }
  // baluster, bowl, the little upper baluster
  K.lathe([[0.78, 0.7], [0.78, 0.9], [0.6, 1.0], [0.48, 1.3], [0.63, 1.72], [0.67, 1.86], [0.45, 2.1], [0.4, 2.42], [0.62, 2.5]], 12);
  S.lathe([[0.42, 2.45], [0.95, 2.56], [1.32, 2.72], [1.52, 2.9], [1.58, 3.0], [1.48, 3.06], [1.38, 3.0]], 16);
  W.lathe([[1.39, 2.97], [0.001, 2.97]], 16);
  K.lathe([[0.22, 2.96], [0.3, 3.1], [0.18, 3.4], [0.26, 3.6], [0.13, 3.78]], 10);
  // four spouts from bronze masks on the baluster, arcs of water into the basin
  const Br = B.get(brass);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4, sx = Math.sin(a), sz = Math.cos(a);
    const mask = new GeoBuilder();
    mask.lathe([[0.001, 0], [0.17, 0.02], [0.17, 0.08], [0.001, 0.1]], 8);
    Br.append(mask, new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).setPosition(sx * 0.55, 1.55, sz * 0.55));
    Br.tube([[sx * 0.6, 1.52, sz * 0.6], [sx * 0.78, 1.5, sz * 0.78], [sx * 0.88, 1.44, sz * 0.88]], 0.045, 6);
    const arc = [], rads = [];
    for (let i = 0; i <= 9; i++) { const t = i / 9, r = 0.9 + 1.5 * t; arc.push([sx * r, 1.44 + 0.35 * t - 1.0 * t * t, sz * r]); rads.push(0.034 - 0.012 * t); }
    B.get(spray).tube(arc, rads, 5);
  }
  B.flush(g);
}

// ---------------------------------------------------------------- market stall
/**
 * A market stall in its own frame (counter along x, customers at +z): turned posts, a plank counter and boarded front,
 * a striped awning with a scalloped valance, slatted crates of fruit, a basket of loaves, a barrel, sacks, a sign.
 * mats: { wood, trim, iron, cloth } (cloth = the stall's colour).
 */
export function stallModel(g, m, i, lite) {
  const B = new ByMat(), Wd = B.get(m.wood), Tr = B.get(m.trim);
  // counter: planks on bearers, boarded front and sides
  for (let k = 0; k < 5; k++) Wd.slab(-1.42, 0.84, -0.66 + k * 0.265, 1.42, 0.92, -0.66 + k * 0.265 + 0.253, 0.012, false);
  for (let k = 0; k < 9; k++) Wd.box(-1.4 + k * 0.311 + 0.006, 0.06, 0.6, -1.4 + (k + 1) * 0.311 - 0.006, 0.84, 0.64, 'ny');
  Tr.box(-1.42, 0.7, 0.64, 1.42, 0.78, 0.67, 'ny');
  Tr.box(-1.42, 0.08, 0.64, 1.42, 0.16, 0.67, 'ny');
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) Wd.box(s * 1.38 - 0.02, 0.06, -0.62 + k * 0.31, s * 1.38 + 0.02, 0.84, -0.62 + (k + 1) * 0.31 - 0.01, 'ny');
  // turned posts: the back pair taller (the awning slopes to the customers)
  for (const sx of [-1.3, 1.3])
    for (const [sz, top] of [[-0.62, 2.74], [0.62, 2.36]])
      Tr.lathe([[0.075, 0], [0.075, 0.1], [0.055, 0.2], [0.05, top - 0.25], [0.07, top - 0.16], [0.065, top - 0.06], [0.04, top]], lite ? 5 : 7, sx, 0, sz);
  // awning: stripes from the back bar down to the front bar, sagging between the posts, seen from both sides
  const Ac = B.get(m.cloth), As = B.get(stripe), nS = 8, nV = lite ? 3 : 5;
  const P = (u, v) => [-1.62 + 3.24 * u, 2.76 - 0.42 * v - 0.09 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v), -0.78 + 1.86 * v];
  for (let k = 0; k < nS; k++) {
    const A = k % 2 ? As : Ac;
    for (let j = 0; j < nV; j++) {
      const u0 = k / nS, u1 = (k + 1) / nS, v0 = j / nV, v1 = (j + 1) / nV;
      A.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), [0, 1, 0.2]);
      A.quad(P(u0, v1), P(u1, v1), P(u1, v0), P(u0, v0), [0, -1, -0.2]);
    }
    // scalloped valance tab hanging from the front edge
    const a = P(k / nS, 1), c = P((k + 1) / nS, 1), tab = [];
    for (let q = 0; q <= 4; q++) { const t = q / 4, x = a[0] + (c[0] - a[0]) * t; tab.push([x, a[1] - 0.18 - 0.1 * Math.sin(Math.PI * t), a[2] + 0.01]); }
    for (let q = 0; q < 4; q++) {
      const x0 = tab[q][0], x1 = tab[q + 1][0];
      A.quad([x0, a[1], a[2] + 0.01], [x1, a[1], a[2] + 0.01], [x1, tab[q + 1][1], a[2] + 0.01], [x0, tab[q][1], a[2] + 0.01], [0, 0, 1]);
      A.quad([x1, a[1], a[2] - 0.005], [x0, a[1], a[2] - 0.005], [x0, tab[q][1], a[2] - 0.005], [x1, tab[q + 1][1], a[2] - 0.005], [0, 0, -1]);
    }
  }
  const I = B.get(m.iron);
  I.tube([[-1.66, 2.36, 1.09], [1.66, 2.36, 1.09]], 0.03, 5, true);
  I.tube([[-1.66, 2.77, -0.78], [1.66, 2.77, -0.78]], 0.03, 5, true);
  // two slatted crates of fruit on the counter, a basket of loaves
  for (const [cx, kind] of [[-0.75, i], [0.05, i + 2]]) {
    crate(Wd, cx, 0.92, 0.12, 0.56, 0.24, 0.42);
    const F = B.get(fruitM[kind % fruitM.length]);
    for (let a = 0; a < 4; a++) for (let c2 = 0; c2 < 3; c2++) fruit(F, cx - 0.2 + a * 0.135 + (hash01(i + a, c2) - 0.5) * 0.02, 1.12 + (hash01(c2, a + i) * 0.03), 0.12 - 0.13 + c2 * 0.13, 0.068);
    if (!lite) for (let a = 0; a < 2; a++) fruit(F, cx - 0.07 + a * 0.13, 1.23, 0.08 + a * 0.05, 0.066);
  }
  const Wk = B.get(wicker);
  Wk.lathe([[0.001, 0.92], [0.2, 0.93], [0.26, 1.0], [0.24, 1.04], [0.28, 1.08], [0.26, 1.13], [0.3, 1.17], [0.27, 1.17], [0.22, 1.0], [0.001, 0.99]], 10, 0.88, 0, 0.1, 0, 0, true);
  const Br = B.get(bread);
  for (let k = 0; k < 3; k++) {
    const t = new GeoBuilder();
    t.lathe([[0.001, -0.16], [0.07, -0.11], [0.08, 0], [0.07, 0.11], [0.001, 0.16]], 6);
    Br.append(t, new THREE.Matrix4().makeRotationZ(Math.PI / 2 + (k - 1) * 0.25).setPosition(0.85 + (k - 1) * 0.09, 1.13 + (k === 1 ? 0.05 : 0), 0.1 + (k - 1) * 0.06));
  }
  // a barrel of apples, sacks, a crate of greens on the ground
  Wd.lathe([[0.001, 0], [0.27, 0], [0.31, 0.2], [0.33, 0.38], [0.31, 0.56], [0.27, 0.74], [0.24, 0.74], [0.001, 0.72]], lite ? 8 : 12, 1.75, 0, -0.3);
  for (const y of [0.12, 0.62]) I.lathe([[0.3, y - 0.03], [0.32, y], [0.32, y + 0.03], [0.3, y + 0.05]], lite ? 8 : 12, 1.75, 0, -0.3, 0, 0, true);
  const Fa = B.get(fruitM[0]);
  for (let k = 0; k < (lite ? 3 : 6); k++) fruit(Fa, 1.75 + Math.cos(k * 1.1) * 0.13 * (k ? 1 : 0), 0.79, -0.3 + Math.sin(k * 1.1) * 0.13 * (k ? 1 : 0), 0.07);
  const Sk = B.get(burlap);
  for (const [sx, sz, h] of [[-1.85, 0.25, 0.62], [-1.9, -0.35, 0.5]]) Sk.lathe([[0.001, 0], [0.22, 0.02], [0.26, h * 0.4], [0.2, h * 0.85], [0.07, h * 0.95], [0.09, h + 0.06], [0.001, h + 0.08]], lite ? 6 : 9, sx, 0, sz);
  if (!lite) {
    crate(Wd, -1.25, 0, 0.95, 0.56, 0.3, 0.4);
    const Lf = B.get(leafM[i % 3]);
    for (let a = 0; a < 3; a++) for (let c2 = 0; c2 < 2; c2++) octa(Lf, -1.45 + a * 0.2, 0.3, 0.85 + c2 * 0.2, 0.1, 0.09);
    // a painted board hanging from the front bar
    for (const s of [-1, 1]) I.tube([[s * 0.35, 2.36, 1.09], [s * 0.35, 2.08, 1.1]], 0.008, 3);
    Tr.slab(-0.42, 1.82, 1.08, 0.42, 2.08, 1.12, 0.012, false);
  }
  B.flush(g);
}
/** Slatted crate (open top) centred x, z, foot at y; w x h x d. */
function crate(b, x, y, z, w, h, d) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, t = 0.025;
  b.box(x0, y, z0, x1, y + 0.02, z1);
  for (const [px, pz] of [[x0, z0], [x1 - t, z0], [x0, z1 - t], [x1 - t, z1 - t]]) b.box(px, y, pz, px + t, y + h, pz + t);
  for (const yy of [y + 0.03, y + h * 0.55]) {
    const sh = h * 0.35;
    b.box(x0, yy, z1 - 0.015, x1, yy + sh, z1, 'nz');
    b.box(x0, yy, z0, x1, yy + sh, z0 + 0.015, 'pz');
    b.box(x0, yy, z0, x0 + 0.015, yy + sh, z1, 'px');
    b.box(x1 - 0.015, yy, z0, x1, yy + sh, z1, 'nx');
  }
}

// ---------------------------------------------------------------- planter
/** Stone planter trough (2.2 x 0.8) with leafy clumps in flower; frame: long side along x. */
export function planterModel(g, coping, seed, lite) {
  const B = new ByMat(), K = B.get(coping);
  K.slab(-1.12, 0, -0.42, 1.12, 0.12, 0.42, 0.02, true);
  K.box(-1.02, 0.12, -0.34, 1.02, 0.6, 0.34, 'ny');
  K.slab(-1.14, 0.6, -0.44, 1.14, 0.72, 0.44, 0.03, true);
  B.get(soil).quad([-1.0, 0.73, -0.32], [1.0, 0.73, -0.32], [1.0, 0.73, 0.32], [-1.0, 0.73, 0.32], [0, 1, 0]);
  const n = lite ? 4 : 7;
  for (let k = 0; k < n; k++) {
    const x = -0.85 + (1.7 * k) / (n - 1), z = (hash01(seed, k) - 0.5) * 0.3, L = B.get(leafM[(seed + k) % 3]);
    const r = 0.2 + 0.08 * hash01(k, seed);
    L.lathe([[0.001, 0.7], [r, 0.78], [r * 1.05, 0.88], [r * 0.7, 1.0], [0.001, 1.04]], 6, x, 0, z, 0, k);
  }
  if (!lite) {
    const P = B.get(petalM[seed % petalM.length]), P2 = B.get(petalM[(seed + 2) % petalM.length]), Cn = B.get(petalM[3]);
    for (let k = 0; k < 10; k++) {
      const x = -0.9 + 1.8 * hash01(seed + k, 1), z = (hash01(seed, k + 3) - 0.5) * 0.4, y = 0.98 + 0.06 * hash01(k, seed + 2);
      flower(k % 3 ? P : P2, k % 3 ? Cn : B.get(petalM[0]), x, y, z, 0.07, (hash01(k, 9) - 0.5) * 0.6);
    }
  }
  B.flush(g);
}
