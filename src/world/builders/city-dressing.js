// The lived-in layer of the City of Magic (art round 2): laundry strung across the side streets between facing
// fronts, potted plants on balconies and doorsteps, broom racks on the balconies witches land on, notice boards with
// pinned papers at the squares. Static geometry merged by the site bake (the laundry hangs in clothify materials, so
// it sways with the wind). CITY_DRESS collects the spots the animated life (life/city-ambient.js) needs.
import * as THREE from 'three';
import { mat, clothify } from './kit.js';
import { GeoBuilder, ByMat, hash01, plain } from './city-geo.js';

/** World-space spots for life/city-ambient.js, filled while the city is built (cleared at each build). */
export const CITY_DRESS = { smoke: [], cats: [], glints: [], books: [], lanterns: [], pigeons: [], windows: [] };
export function resetDress() {
  for (const k in CITY_DRESS) CITY_DRESS[k].length = 0;
}
const wash = [0xf4efe4, 0xc9d6e6].map((c) => plain(mat.cloth(c))), // two colours: each is a draw per block
  rope = mat.wood(0xb59a6e),
  pot = mat.stone(0xb7704c),
  leaf = [0x6c9a52, 0x5f8c4a, 0x7aa65c].map((c) => plain(mat.paint(c))),
  bloom = [0xd65a4f, 0xe794a8, 0xebc85a, 0xf3eee2, 0xb77ad0].map((c) => plain(mat.paint(c))),
  wood = mat.wood(0x6e4c38),
  straw = plain(mat.paint(0xd8b26a)),
  paper = [0xf4efe4, 0xebe0c6, 0xe8d7b0, 0xdfe6ea].map((c) => plain(mat.paint(c))),
  brass = mat.metal(0xcf9f52),
  roofM = mat.tile(0xa8472d);

/**
 * Washing line across a side street from (ax, y, az) to (bx, y, bz) (site frame, absolute y): a sagging rope and a
 * row of garments, sheets and socks pegged on it (their cloth sways). Adds to group g (site-frame group at origin).
 */
export function laundryLine(g, ax, az, bx, bz, y, seed, lite) {
  const L = Math.hypot(bx - ax, bz - az), n = lite ? 6 : 10, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([ax + (bx - ax) * t, y - 0.45 * 4 * t * (1 - t), az + (bz - az) * t]); }
  const r = new GeoBuilder();
  r.tube(pts, 0.012, 3);
  r.mesh(rope, g);
  const yaw = Math.atan2(bx - ax, bz - az), items = Math.max(2, Math.floor((L - 1.6) / (lite ? 1.6 : 0.95)));
  for (let k = 0; k < items; k++) {
    const t = 0.12 + (0.76 * (k + 0.5)) / items, kind = Math.floor(hash01(seed, k) * 4), mw = [0.62, 0.95, 0.34, 0.5][kind], mh = [0.7, 1.0, 0.36, 0.55][kind];
    const px = ax + (bx - ax) * t, pz = az + (bz - az) * t, py = y - 0.45 * 4 * t * (1 - t) - 0.02;
    const geo = garment(kind, mw, mh);
    const m = clothify(wash[Math.floor(hash01(k, seed) * wash.length)], 0.16, 1);
    if (m.side !== THREE.DoubleSide) m.side = THREE.DoubleSide;
    const o = new THREE.Mesh(geo, m);
    o.position.set(px, py, pz);
    o.rotation.y = yaw + Math.PI / 2;
    o.castShadow = false; // thin cloth: no shadow pass (one draw fewer per cascade)
    o.receiveShadow = true;
    g.add(o);
  }
}
/** A garment hanging from its top edge at y = 0 (x across): shirt (sleeves), sheet, sock, towel; uv for clothify. */
function garment(kind, w, h) {
  const P = [], U = [], I = [], nx = 4, ny = 4;
  const out = (u, v) => {
    let x = (u - 0.5) * w, y = -v * h;
    if (kind === 0 && v < 0.35) x *= 1 + 0.55 * (1 - v / 0.35); // shirt: sleeves out at the shoulders
    if (kind === 0 && v > 0.35) x *= 0.82;
    return [x, y, 0.015 * Math.sin(u * 9 + v * 3)];
  };
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const u = i / nx, v = j / ny; P.push(...out(u, v)); U.push(u, 1 - v); }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; I.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** A clay pot with a leafy plant (in flower on some), foot at (x, y, z) in B's frame; r = pot radius. */
export function pottedPlant(B, x, y, z, r, seed, lite) {
  B.get(pot).lathe([[0.001, y], [r * 0.75, y], [r, y + r * 1.4], [r * 1.1, y + r * 1.5], [0.001, y + r * 1.4]], 6, x, 0, z, 0, 0, true);
  B.get(leaf[seed % 3]).lathe([[0.001, y + r * 1.3], [r * 1.35, y + r * 1.8], [r * 1.15, y + r * 2.6], [0.001, y + r * 2.9]], 5, x, 0, z, 0, seed);
  if (!lite && hash01(seed, 3) > 0.5) for (let q = 0; q < 3; q++) { const a = q * 1.7 + seed; B.get(bloom[(q + seed) % 5]).lathe([[0.001, 0], [0.04, 0.02], [0.001, 0.045]], 5, x + Math.cos(a) * r * 0.85, y + r * 2.45, z + Math.sin(a) * r * 0.85); }
}

/** Broom rack on a wall at z = zf facing +z: a pegged rail with two or three brooms hanging bristles down. */
export function broomRack(B, x, y, zf, seed) {
  B.get(wood).slab(x - 0.55, y, zf, x + 0.55, y + 0.1, zf + 0.1, 0.015, false);
  const n = 2 + (seed % 2);
  for (let i = 0; i < n; i++) {
    const px = x - 0.35 + (0.7 * i) / Math.max(1, n - 1);
    B.get(wood).box(px - 0.02, y + 0.03, zf + 0.1, px + 0.02, y + 0.07, zf + 0.2);
    B.get(wood).lathe([[0.017, y + 0.12], [0.017, y - 1.05], [0.05, y - 1.12]], 5, px, 0, zf + 0.16);
    B.get(straw).lathe([[0.05, y - 1.1], [0.13, y - 1.45], [0.001, y - 1.5]], 6, px, 0, zf + 0.16);
  }
}

/** Notice board: two posts, a framed board under a little tiled hood, papers pinned at angles. Centre x, z, yaw. */
export function noticeBoard(g, x, y, z, yaw, seed) {
  const B = new ByMat(), W = B.get(wood);
  for (const s of [-1, 1]) W.box(s * 0.7 - 0.06, 0, -0.06, s * 0.7 + 0.06, 2.35, 0.06);
  W.box(-0.72, 0.85, -0.04, 0.72, 2.05, 0.04);
  W.box(-0.78, 2.05, -0.06, 0.78, 2.12, 0.08);
  W.box(-0.78, 0.8, -0.06, 0.78, 0.86, 0.08);
  for (const s of [-1, 1]) { const q = new GeoBuilder(); q.box(-0.06, 0, -0.95, 0.06, 0.04, 0.0); B.get(roofM).append(q, new THREE.Matrix4().makeRotationZ(s * 0.5).setPosition(0, 2.42, 0.45)); }
  B.get(roofM).box(-0.9, 2.22, -0.3, 0.9, 2.26, 0.3);
  for (let k = 0; k < 7; k++) {
    const pw = 0.22 + 0.14 * hash01(seed, k), ph = 0.28 + 0.12 * hash01(k, seed), px = -0.5 + (k % 4) * 0.33 + 0.05 * hash01(seed + k, 2), py = 1.15 + Math.floor(k / 4) * 0.48;
    const p = new GeoBuilder();
    p.quad([-pw / 2, -ph / 2, 0], [pw / 2, -ph / 2, 0], [pw / 2, ph / 2, 0], [-pw / 2, ph / 2, 0], [0, 0, 1]);
    for (const zz of [0.046, -0.046]) B.get(paper[k % 4]).append(p, new THREE.Matrix4().makeRotationY(zz > 0 ? 0 : Math.PI).multiply(new THREE.Matrix4().makeRotationZ((hash01(k, 7) - 0.5) * 0.25)).setPosition(px, py, zz));
    B.get(brass).lathe([[0.001, 0], [0.02, 0.005], [0.001, 0.012]], 4, px, py + ph / 2 - 0.04, 0.046);
  }
  const o = new THREE.Group();
  B.flush(o);
  o.position.set(x, y, z);
  o.rotation.y = yaw;
  g.add(o);
}
