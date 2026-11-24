// Bevelled prisms built at boot (round art-ground, 2026-11-24): the facet kit's look (tools/sculpt/assets/rock_facet.mjs —
// exact planes, every edge chamfered, the chamfer's vertices carry the normals of the faces they touch so the strip
// shades like a worn, rounded arris while the big faces stay flat) for stones and timbers whose layout is only known in
// the game: paving slabs on the terrain, voussoirs and ashlar of the mill arch, dressed timber of the practice field.
// A prism = a convex polygon (x, z) extruded along local y, caps chamfered, vertical edges optionally bevelled; written
// into a vertex-coloured triangle list (colour = linear albedo, materials are white vertex-colour copies).
import * as THREE from 'three';

const lin1 = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** sRGB hex -> linear [r, g, b] times k */
export const linHex = (h, k = 1) => [lin1(((h >> 16) & 255) / 255) * k, lin1(((h >> 8) & 255) / 255) * k, lin1((h & 255) / 255) * k];

/** growing indexed triangle list with normals and linear vertex colours */
export class Tris {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.idx = []; }
  get nv() { return this.pos.length / 3; }
  get tris() { return this.idx.length / 3; }
  v(p, n, c) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]); return this.nv - 1; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  /** two-sided thin blade (grass, straw): both windings */
  tri2(a, b, c) { this.idx.push(a, b, c, a, c, b); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

const _v = new THREE.Vector3(), _nm = new THREE.Matrix3();
/** shoelace area of an (x, z) polygon; > 0 → the fan (p0, p1, p2) faces -y */
const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

/** inner ring of a convex polygon, each edge moved in by w[i] (null when it folds over) */
function inset(P, N, w) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = N[(i + n - 1) % n], b = N[i];
    const da = a[0] * P[i][0] + a[1] * P[i][1] - w[(i + n - 1) % n], db = b[0] * P[i][0] + b[1] * P[i][1] - w[i];
    const det = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(det) < 1e-4) out.push([P[i][0] - b[0] * w[i], P[i][1] - b[1] * w[i]]);
    else out.push([(da * b[1] - db * a[1]) / det, (a[0] * db - b[0] * da) / det]);
  }
  for (let i = 0; i < n; i++) {   // every inner edge must run the same way as its outer edge (no fold, no flip)
    const p = P[i], q = P[(i + 1) % n], r = out[i], s = out[(i + 1) % n];
    if ((q[0] - p[0]) * (s[0] - r[0]) + (q[1] - p[1]) * (s[1] - r[1]) <= 0) return null;
  }
  return out;
}

/**
 * Write one bevelled prism. poly: convex [[x, z], ...] (either winding). o:
 *   y0, y1        bottom / top of the prism (local y)
 *   top           chamfer width of the top edges (m; number or per-edge array), drop = top * dropK
 *   bottom        chamfer width of the bottom edges (0: sharp)
 *   corner        bevel of the vertical edges (m; each corner cut by a short face that shades round)
 *   dome          the top's middle raised by this much (worn, slightly cushioned face); 0 = flat
 *   skipBottom    leave out the bottom face (buried)
 *   m             THREE.Matrix4 local → output frame (positions; normals by its normal matrix)
 *   paint(part, p, n, pOut, nOut) → linear [r, g, b]; part 'top' | 'edge' | 'side' | 'bottom'; p, n local (p[1] relative:
 *                 0 foot .. 1 top); pOut, nOut in the output frame
 * Returns the number of triangles written.
 */
export function prism(T, poly, o) {
  const { y0 = 0, y1 = 1, top = 0.02, bottom = 0, corner = 0, dome = 0, dropK = 1.1, skipBottom = false, m = null, paint } = o;
  let P = poly.map((p) => [p[0], p[1]]);
  if (area(P) > 0) P.reverse();                               // fan (p0, p1, p2) faces +y
  const n0 = P.length;
  let wTop = Array.isArray(top) ? top.slice() : P.map(() => top);
  if (Array.isArray(top) && area(poly) > 0) { wTop.reverse(); wTop = wTop.slice(1).concat(wTop[0]); }
  // vertical edge bevels: each corner replaced by a short edge; its sides take the neighbours' normals (round shading)
  let bevel = P.map(() => false), wT = wTop;
  if (corner > 0) {
    const Q = [], B = [], W = [];
    for (let i = 0; i < n0; i++) {
      const p = P[i], a = P[(i + n0 - 1) % n0], b = P[(i + 1) % n0];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const c = Math.min(corner, la * 0.3, lb * 0.3);
      Q.push([p[0] + (a[0] - p[0]) / la * c, p[1] + (a[1] - p[1]) / la * c], [p[0] + (b[0] - p[0]) / lb * c, p[1] + (b[1] - p[1]) / lb * c]);
      B.push(true, false);
      W.push(wTop[i], wTop[i]);
    }
    P = Q; bevel = B; wT = W;
  }
  const n = P.length;
  const cx = P.reduce((s, p) => s + p[0], 0) / n, cz = P.reduce((s, p) => s + p[1], 0) / n;
  // outward edge normals (x, z)
  const N = P.map((p, i) => {
    const q = P[(i + 1) % n]; let nx = q[1] - p[1], nz = -(q[0] - p[0]); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    if (nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[1] + q[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    return [nx, nz];
  });
  // the side normal at a vertex of edge e: a bevel edge's vertices take the main edges' normals they join
  const sideN = (e, end) => {
    if (!bevel[e]) return [N[e][0], 0, N[e][1]];
    const k = end ? (e + 1) % n : (e + n - 1) % n;
    const a = N[k]; return [a[0], 0, a[1]];
  };
  const H = Math.max(1e-6, y1 - y0);
  const ringFor = (w) => {
    let k = 1, r = null;
    for (let t = 0; t < 4 && !r; t++, k *= 0.5) r = inset(P, N, w.map((x) => x * k));
    return r || P.map((p) => [p[0], p[1]]);
  };
  const tops = wT.map((w) => Math.max(0, w)), botW = P.map(() => Math.max(0, bottom));
  const It = tops.some((w) => w > 0) ? ringFor(tops) : P;
  const Ib = bottom > 0 ? ringFor(botW) : P;
  // vertex drop of the chamfer = mean of its two edges' widths
  const dropT = P.map((_, i) => dropK * 0.5 * (tops[(i + n - 1) % n] + tops[i]));
  const dropB = bottom > 0 ? P.map(() => dropK * bottom) : P.map(() => 0);
  const out = (p, nn, part) => {
    let q = p, r = nn;
    if (m) { _v.set(p[0], p[1], p[2]).applyMatrix4(m); q = [_v.x, _v.y, _v.z]; _v.set(nn[0], nn[1], nn[2]).applyMatrix3(_nm).normalize(); r = [_v.x, _v.y, _v.z]; }
    return T.v(q, r, paint(part, [p[0], (p[1] - y0) / H, p[2]], nn, q, r));
  };
  if (m) _nm.getNormalMatrix(m);
  const t0 = T.tris;
  const up = [0, 1, 0], dn = [0, -1, 0];
  const topN = (q) => {
    if (!dome) return up;
    const dx = q[0] - cx, dz = q[1] - cz; const l = Math.hypot(dx, dz) || 1, s = Math.min(0.35, dome * 6);
    return [dx / l * s * Math.min(1, l * 2), 1, dz / l * s * Math.min(1, l * 2)].map((v, k, a) => v / Math.hypot(a[0], a[1], a[2]));
  };
  // top face
  {
    const c = out([cx, y1 + dome, cz], up, 'top');
    const ring = It.map((q) => out([q[0], y1, q[1]], topN(q), 'top'));
    for (let i = 0; i < n; i++) T.tri(c, ring[i], ring[(i + 1) % n]);
  }
  // top chamfer strips (mitred at the corners)
  for (let i = 0; i < n; i++) {
    if (It === P) break;
    const j = (i + 1) % n;
    const a = out([It[i][0], y1, It[i][1]], topN(It[i]), 'edge'), b = out([It[j][0], y1, It[j][1]], topN(It[j]), 'edge');
    const c = out([P[j][0], y1 - dropT[j], P[j][1]], sideN(i, true), 'edge'), d = out([P[i][0], y1 - dropT[i], P[i][1]], sideN(i, false), 'edge');
    T.tri(a, c, b); T.tri(a, d, c);
  }
  // sides
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, na = sideN(i, false), nb = sideN(i, true);
    const a = out([P[i][0], y1 - dropT[i], P[i][1]], na, 'side'), b = out([P[j][0], y1 - dropT[j], P[j][1]], nb, 'side');
    const c = out([P[j][0], y0 + dropB[j], P[j][1]], nb, 'side'), d = out([P[i][0], y0 + dropB[i], P[i][1]], na, 'side');
    T.tri(a, d, c); T.tri(a, c, b);
  }
  // bottom chamfer + face
  if (bottom > 0) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = out([P[i][0], y0 + dropB[i], P[i][1]], sideN(i, false), 'edge'), b = out([P[j][0], y0 + dropB[j], P[j][1]], sideN(i, true), 'edge');
    const c = out([Ib[j][0], y0, Ib[j][1]], dn, 'edge'), d = out([Ib[i][0], y0, Ib[i][1]], dn, 'edge');
    T.tri(a, c, b); T.tri(a, d, c);
  }
  if (!skipBottom) {
    const ring = Ib.map((q) => out([q[0], y0, q[1]], dn, 'bottom'));
    for (let i = 1; i + 1 < n; i++) T.tri(ring[0], ring[i + 1], ring[i]);
  }
  return T.tris - t0;
}

/** clip a convex polygon [[x, z], ...] by the half-plane p·u <= c */
export function clipPoly(P, u, c) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const da = a[0] * u[0] + a[1] * u[1] - c, db = b[0] * u[0] + b[1] * u[1] - c;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
/** rectangle w x d (x, z) centred at the origin, as a prism polygon */
export const rect = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];

/**
 * A dressed timber or block: w (x) x h (y) x d (z) centred at its middle, every edge chamfered by `c` (vertical edges as
 * corner bevels, the caps' edges as chamfers), placed by matrix m (null = as is). Extrusion runs along y.
 */
export function block(T, w, h, d, c, paint, m = null, { dome = 0 } = {}) {
  const cc = Math.min(c, w * 0.3, d * 0.3, h * 0.3);
  return prism(T, rect(w, d), { y0: -h / 2, y1: h / 2, top: cc, bottom: cc, corner: cc, dome, dropK: 1, m, paint });
}

/** Matrix4 from position, Euler (x, y, z order 'YXZ' unless given) and scale */
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _pp = new THREE.Vector3();
export function place(x, y, z, rx = 0, ry = 0, rz = 0, order = 'YXZ') {
  _e.set(rx, ry, rz, order); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_pp.set(x, y, z), _q, _s);
}
