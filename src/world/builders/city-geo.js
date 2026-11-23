// Hand-modelled pieces of the City of Magic (roofs, window bays, stonework, street furniture) are written vertex by
// vertex: a small non-indexed geometry builder with explicit normals, so flat faces stay crisp, round parts (tile
// rolls, turned posts) shade softly, and every piece still merges into the site bake like a primitive does.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

/** Accumulates triangles (position + normal, optional colour) and hands out one BufferGeometry. */
export class GeoBuilder {
  constructor(colours = false) {
    this.p = [];
    this.n = [];
    this.c = colours ? [] : null;
    this.col = [1, 1, 1];
  }
  get tris() {
    return this.p.length / 9;
  }
  /** Current vertex colour (linear rgb) for the following triangles (colour builders only). */
  colour(r, g, b) {
    this.col = g === undefined ? [r.r, r.g, r.b] : [r, g, b];
    return this;
  }
  v(p, n, k = 1) {
    this.p.push(p[0], p[1], p[2]);
    this.n.push(n[0], n[1], n[2]);
    if (this.c) this.c.push(this.col[0] * k, this.col[1] * k, this.col[2] * k);
  }
  /** Flat triangle; wound so that its normal points along `out` when given. */
  tri(a, b, c, out) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    if (out && _n.x * out[0] + _n.y * out[1] + _n.z * out[2] < 0) {
      const t = b;
      b = c;
      c = t;
      _n.negate();
    }
    _n.normalize();
    const n = [_n.x, _n.y, _n.z];
    this.v(a, n);
    this.v(b, n);
    this.v(c, n);
  }
  /** Flat quad a-b-c-d (a convex ring); `out` orients it. */
  quad(a, b, c, d, out) {
    if (!out) {
      _a.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      _b.set(d[0] - b[0], d[1] - b[1], d[2] - b[2]);
      _n.crossVectors(_a, _b);
      out = [_n.x, _n.y, _n.z];
    }
    this.tri(a, b, c, out);
    this.tri(a, c, d, out);
  }
  /** Smooth quad: per-corner normals (a, b, c, d counter-clockwise seen from outside). k = per-corner colour gains. */
  squad(a, b, c, d, na, nb, nc, nd, k = null) {
    this.v(a, na, k ? k[0] : 1);
    this.v(b, nb, k ? k[1] : 1);
    this.v(c, nc, k ? k[2] : 1);
    this.v(a, na, k ? k[0] : 1);
    this.v(c, nc, k ? k[2] : 1);
    this.v(d, nd, k ? k[3] : 1);
  }
  /** Axis-aligned box (min/max corners), the faces in `skip` ('px','nx','py','ny','pz','nz') left out. */
  box(x0, y0, z0, x1, y1, z1, skip = '') {
    const P = (x, y, z) => [x, y, z];
    if (!skip.includes('px')) this.quad(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), [1, 0, 0]);
    if (!skip.includes('nx')) this.quad(P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(x0, y0, z0), [-1, 0, 0]);
    if (!skip.includes('py')) this.quad(P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), [0, 1, 0]);
    if (!skip.includes('ny')) this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [0, -1, 0]);
    if (!skip.includes('pz')) this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [0, 0, 1]);
    if (!skip.includes('nz')) this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), [0, 0, -1]);
  }
  /** Box with chamfered front (+z) edges: a dressed stone / moulded board seen from the front. b = chamfer. */
  bevel(x0, y0, z0, x1, y1, z1, b = 0.02, skip = 'nz') {
    b = Math.min(b, (x1 - x0) * 0.4, (y1 - y0) * 0.4, (z1 - z0) * 0.8);
    const zi = z1 - b;
    const F = [[x0 + b, y0 + b, z1], [x1 - b, y0 + b, z1], [x1 - b, y1 - b, z1], [x0 + b, y1 - b, z1]];
    const R = [[x0, y0, zi], [x1, y0, zi], [x1, y1, zi], [x0, y1, zi]];
    this.quad(F[0], F[1], F[2], F[3], [0, 0, 1]);
    const outs = [[0, -1, 1], [1, 0, 1], [0, 1, 1], [-1, 0, 1]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(R[i], R[j], F[j], F[i], outs[i]);
    }
    // the sides back to the wall
    const B = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]];
    const sides = [['ny', [0, -1, 0]], ['px', [1, 0, 0]], ['py', [0, 1, 0]], ['nx', [-1, 0, 0]]];
    for (let i = 0; i < 4; i++) {
      if (skip.includes(sides[i][0])) continue;
      const j = (i + 1) % 4;
      this.quad(B[i], B[j], R[j], R[i], sides[i][1]);
    }
  }
  /**
   * Convex polygon `poly` ([[x,y],...], either winding) in the xy plane, extruded from z0 to z1, its front (z1) edges
   * chamfered by b: a dressed stone whose arrises catch the light (voussoirs, impost blocks). back = also the z0 face.
   */
  prismBevel(poly, z0, z1, b = 0.03, back = false) {
    const n = poly.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n]; area += ax * by - bx * ay; }
    const sgn = area > 0 ? 1 : -1, ins = [];
    for (let i = 0; i < n; i++) {
      const p = poly[(i + n - 1) % n], c = poly[i], q = poly[(i + 1) % n];
      let ex = c[0] - p[0], ey = c[1] - p[1], el = Math.hypot(ex, ey) || 1;
      const n1 = [(-ey / el) * sgn, (ex / el) * sgn];
      ex = q[0] - c[0]; ey = q[1] - c[1]; el = Math.hypot(ex, ey) || 1;
      const n2 = [(-ey / el) * sgn, (ex / el) * sgn];
      const k = b / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
      ins.push([c[0] + (n1[0] + n2[0]) * k, c[1] + (n1[1] + n2[1]) * k]);
    }
    let cx = 0, cy = 0;
    for (const [x, y] of poly) { cx += x / n; cy += y / n; }
    const zb = z1 - b;
    for (let i = 1; i < n - 1; i++) this.tri([ins[0][0], ins[0][1], z1], [ins[i][0], ins[i][1], z1], [ins[i + 1][0], ins[i + 1][1], z1], [0, 0, 1]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = poly[i], c = poly[j];
      const ox = (a[0] + c[0]) / 2 - cx, oy = (a[1] + c[1]) / 2 - cy;
      this.quad([a[0], a[1], zb], [c[0], c[1], zb], [ins[j][0], ins[j][1], z1], [ins[i][0], ins[i][1], z1], [ox, oy, 1]);
      this.quad([a[0], a[1], z0], [c[0], c[1], z0], [c[0], c[1], zb], [a[0], a[1], zb], [ox, oy, 0]);
    }
    if (back) for (let i = 1; i < n - 1; i++) this.tri([poly[0][0], poly[0][1], z0], [poly[i][0], poly[i][1], z0], [poly[i + 1][0], poly[i + 1][1], z0], [0, 0, -1]);
  }
  /** Box whose top edges are chamfered by b (a dressed slab: sills, caps, copings). skipBottom leaves the underside out. */
  slab(x0, y0, z0, x1, y1, z1, b = 0.025, skipBottom = true) {
    b = Math.min(b, (x1 - x0) * 0.3, (z1 - z0) * 0.3, (y1 - y0) * 0.6);
    const ym = y1 - b;
    const T = [[x0 + b, y1, z0 + b], [x1 - b, y1, z0 + b], [x1 - b, y1, z1 - b], [x0 + b, y1, z1 - b]];
    const R = [[x0, ym, z0], [x1, ym, z0], [x1, ym, z1], [x0, ym, z1]];
    const Bt = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
    this.quad(T[0], T[1], T[2], T[3], [0, 1, 0]);
    const outs = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, o = outs[i];
      this.quad(R[i], R[j], T[j], T[i], [o[0], 1, o[2]]);
      this.quad(Bt[i], Bt[j], R[j], R[i], o);
    }
    if (!skipBottom) this.quad(Bt[0], Bt[1], Bt[2], Bt[3], [0, -1, 0]);
  }
  /** Prism: a convex polygon `poly` ([[x,y],...]) in the xy plane extruded from z0 to z1 (caps + sides). */
  prism(poly, z0, z1, caps = 3) {
    const n = poly.length;
    let cx = 0, cy = 0;
    for (const [x, y] of poly) { cx += x / n; cy += y / n; }
    for (let i = 0; i < n; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % n];
      const ox = (ax + bx) / 2 - cx, oy = (ay + by) / 2 - cy;
      this.quad([ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1], [ox, oy, 0]);
    }
    for (let i = 1; i < n - 1; i++) {
      if (caps & 2) this.tri([poly[0][0], poly[0][1], z1], [poly[i][0], poly[i][1], z1], [poly[i + 1][0], poly[i + 1][1], z1], [0, 0, 1]);
      if (caps & 1) this.tri([poly[0][0], poly[0][1], z0], [poly[i][0], poly[i][1], z0], [poly[i + 1][0], poly[i + 1][1], z0], [0, 0, -1]);
    }
  }
  /**
   * Surface of revolution about +y: profile [[r, y], ...] bottom to top, seg sides, smooth normals around and
   * along. caps: 1 bottom disc, 2 top disc. ox/oy/oz offsets the axis.
   */
  lathe(profile, seg = 10, ox = 0, oy = 0, oz = 0, caps = 0, phase = 0, hard = false) {
    const m = profile.length;
    const nrm = [], seg2 = [];
    for (let i = 0; i < m; i++) {
      const a = profile[Math.max(0, i - 1)], b = profile[Math.min(m - 1, i + 1)];
      const dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1;
      nrm.push([dy / l, -dr / l]);
      if (hard && i < m - 1) {
        const er = profile[i + 1][0] - profile[i][0], ey = profile[i + 1][1] - profile[i][1], el = Math.hypot(er, ey) || 1;
        seg2.push([ey / el, -er / el]);
      }
    }
    for (let s = 0; s < seg; s++) {
      const t0 = phase + (s / seg) * Math.PI * 2, t1 = phase + ((s + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      for (let i = 0; i < m - 1; i++) {
        const [r0, y0] = profile[i], [r1, y1] = profile[i + 1], [nr0, ny0] = hard ? seg2[i] : nrm[i], [nr1, ny1] = hard ? seg2[i] : nrm[i + 1];
        if (r0 < 1e-4 && r1 < 1e-4) continue;
        this.squad(
          [ox + r0 * s0, oy + y0, oz + r0 * c0], [ox + r0 * s1, oy + y0, oz + r0 * c1], [ox + r1 * s1, oy + y1, oz + r1 * c1], [ox + r1 * s0, oy + y1, oz + r1 * c0],
          [nr0 * s0, ny0, nr0 * c0], [nr0 * s1, ny0, nr0 * c1], [nr1 * s1, ny1, nr1 * c1], [nr1 * s0, ny1, nr1 * c0]
        );
      }
      if (caps & 1 && profile[0][0] > 1e-4) {
        const [r, y] = profile[0];
        this.tri([ox, oy + y, oz], [ox + r * s1, oy + y, oz + r * c1], [ox + r * s0, oy + y, oz + r * c0], [0, -1, 0]);
      }
      if (caps & 2 && profile[m - 1][0] > 1e-4) {
        const [r, y] = profile[m - 1];
        this.tri([ox, oy + y, oz], [ox + r * s0, oy + y, oz + r * c0], [ox + r * s1, oy + y, oz + r * c1], [0, 1, 0]);
      }
    }
  }
  /** Tube with a round (seg-sided) section along points pts ([x,y,z]...), radius r (number or per-point array). */
  tube(pts, r, seg = 6, capEnds = false) {
    const m = pts.length, up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
    const rings = [];
    for (let i = 0; i < m; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(m - 1, i + 1)];
      t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      u.copy(Math.abs(t.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).cross(t).normalize();
      w.crossVectors(t, u);
      const rr = Array.isArray(r) ? r[i] : r, ring = [];
      for (let s = 0; s < seg; s++) {
        const q = (s / seg) * Math.PI * 2, nx = u.x * Math.cos(q) + w.x * Math.sin(q), ny = u.y * Math.cos(q) + w.y * Math.sin(q), nz = u.z * Math.cos(q) + w.z * Math.sin(q);
        ring.push([[pts[i][0] + nx * rr, pts[i][1] + ny * rr, pts[i][2] + nz * rr], [nx, ny, nz]]);
      }
      rings.push(ring);
    }
    for (let i = 0; i < m - 1; i++)
      for (let s = 0; s < seg; s++) {
        const j = (s + 1) % seg, A = rings[i][s], B = rings[i][j], C = rings[i + 1][j], D = rings[i + 1][s];
        this.squad(A[0], B[0], C[0], D[0], A[1], B[1], C[1], D[1]);
      }
    if (capEnds)
      for (const [i, sg] of [[0, -1], [m - 1, 1]]) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(m - 1, i + 1)];
        const dir = [(b[0] - a[0]) * sg, (b[1] - a[1]) * sg, (b[2] - a[2]) * sg];
        for (let s = 1; s < seg - 1; s++) this.tri(rings[i][0][0], rings[i][s][0], rings[i][s + 1][0], dir);
      }
  }
  /** Append another builder's triangles transformed by matrix m (THREE.Matrix4). */
  append(other, m) {
    const nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3();
    for (let i = 0; i < other.p.length; i += 3) {
      v.set(other.p[i], other.p[i + 1], other.p[i + 2]).applyMatrix4(m);
      this.p.push(v.x, v.y, v.z);
      v.set(other.n[i], other.n[i + 1], other.n[i + 2]).applyMatrix3(nm).normalize();
      this.n.push(v.x, v.y, v.z);
      if (this.c) this.c.push(...(other.c ? [other.c[i], other.c[i + 1], other.c[i + 2]] : this.col));
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
  /** A shadow-casting mesh of the triangles (null when empty), added to `parent` when given. */
  mesh(material, parent = null) {
    if (!this.p.length) return null;
    const o = new THREE.Mesh(this.geometry(), material);
    o.castShadow = o.receiveShadow = true;
    if (parent) parent.add(o);
    return o;
  }
}

/** Builders keyed by material: `get(m)` returns the builder for m; `flush(parent)` adds one mesh per material. */
export class ByMat {
  constructor() {
    this.map = new Map();
  }
  get(m) {
    let b = this.map.get(m);
    if (!b) this.map.set(m, (b = new GeoBuilder()));
    return b;
  }
  flush(parent) {
    for (const [m, b] of this.map) b.mesh(m, parent);
    this.map.clear();
  }
}

/**
 * Moulded surround of an opening (window, slit, lancet) on a wall facing +z: a front ring, a chamfer down to the wall
 * and a reveal back to the glass plane. See the comment inside for `pts`.
 */
export function frontRing(b, pts, zf, zw, zg, grow, k = 1) {
  // pts: inner outline points [x, y, mx, my] of a U / arch, bottom-left round to bottom-right, (mx, my) the mitre
  // offset of a unit-wide border there; front ring between inner and outer (inner pushed out by grow[0]), chamfer
  // from the outer front edge to the wall (grow[1] more), reveal back to the glass plane zg.
  const out = (p, g) => [p[0] + p[2] * g, p[1] + p[3] * g];
  const nrm = (p) => { const l = Math.hypot(p[2], p[3]) || 1; return [p[2] / l, p[3] / l]; };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const ao = out(a, grow[0]), co = out(c, grow[0]), aw = out(a, grow[0] + grow[1]), cw = out(c, grow[0] + grow[1]);
    const na = nrm(a), nc = nrm(c);
    b.squad([a[0], a[1], zf], [ao[0], ao[1], zf], [co[0], co[1], zf], [c[0], c[1], zf], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [k, k, k, k]);
    b.squad([ao[0], ao[1], zf], [aw[0], aw[1], zw], [cw[0], cw[1], zw], [co[0], co[1], zf], [na[0] * 0.7, na[1] * 0.7, 0.7], [na[0] * 0.7, na[1] * 0.7, 0.7], [nc[0] * 0.7, nc[1] * 0.7, 0.7], [nc[0] * 0.7, nc[1] * 0.7, 0.7], [k, k * 0.97, k * 0.97, k]);
    b.squad([c[0], c[1], zg], [c[0], c[1], zf], [a[0], a[1], zf], [a[0], a[1], zg], [-nc[0], -nc[1], 0], [-nc[0], -nc[1], 0], [-na[0], -na[1], 0], [-na[0], -na[1], 0], [k * 0.72, k * 0.9, k * 0.9, k * 0.72]);
  }
}
/** squad() keeps the caller's corner order: flip the triangles (from triangle index `from`) whose face normal
 *  disagrees with their vertex normals. */
export function fixWinding(b, from) {
  // squad() takes corners in the caller's order: flip any triangle whose face normal disagrees with its vertex normals
  const P = b.p, N = b.n, C = b.c;
  for (let i = from * 9; i < P.length; i += 9) {
    const ax = P[i + 3] - P[i], ay = P[i + 4] - P[i + 1], az = P[i + 5] - P[i + 2];
    const bx = P[i + 6] - P[i], by = P[i + 7] - P[i + 1], bz = P[i + 8] - P[i + 2];
    const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
    if (fx * (N[i] + N[i + 3] + N[i + 6]) + fy * (N[i + 1] + N[i + 4] + N[i + 7]) + fz * (N[i + 2] + N[i + 5] + N[i + 8]) >= 0) continue;
    for (const arr of [P, N, C]) if (arr) for (let k = 0; k < 3; k++) { const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
  }
}
/** Seeded 0..1 hash of two numbers (stable per house / bay). */
export function hash01(a, b = 0) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
