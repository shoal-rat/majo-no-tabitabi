// landforms — procedural rock geometry: chiselled blobs / strata slabs / basalt prism clusters / tapered tubes, and the
// world-space vertex shading (strata bands, cavity, under-side shade, moss, snow) baked into merged meshes.
// Prototypes are built in unit-ish object space once; pieces are transformed copies baked into per-cell buffers.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise2 } from '../../core/util.js';

export const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------------------------------------ prototypes
/**
 * Chiselled rock prototype: a lat-long sphere whose radius is the smooth-min over random cutting planes (bevelled
 * facets), optionally terraced into strata (each band recessed at its foot, with a lip at its top = overhang ledges).
 * Returns { pos: Float32Array, idx: Uint32Array|Uint16Array, cav: Float32Array (0 recess .. 1 proud), ny0 } in [-1,1]³.
 * Same `seed` + params at two resolutions gives matching silhouettes (LOD pair).
 */
export function protoRock({ seed = 1, w = 14, h = 12, planes = 10, flat = 0.7, bands = 0, lip = 0.16, bottom = -0.35, fracture = 0.06, box = 0, taper = 0, sharp = 40 } = {}) {
  const rnd = mulberry32(seed);
  const P = [];
  // box > 0: a block first (4 sides + top, slightly skewed), the random planes then only chip its edges and corners —
  // reads as a quarried slab / broken pillar instead of a pebble when stretched
  if (box > 0) {
    const a0 = rnd() * 0.5;
    for (let k = 0; k < 4; k++) { const a = a0 + k * Math.PI / 2 + (rnd() - 0.5) * 0.35; P.push([Math.cos(a), (rnd() - 0.5) * 0.2, Math.sin(a), 0.78 + rnd() * 0.12]); }
    const tl = Math.hypot(0.25, 1);
    P.push([(rnd() - 0.5) * 0.5 / tl, 1 / tl, (rnd() - 0.5) * 0.5 / tl, 0.85 + rnd() * 0.1]);
  }
  const np = planes + 3;
  for (let k = 0; k < np; k++) {
    const yy = 1 - 2 * (k + 0.5) / np, rr = Math.sqrt(1 - yy * yy), a = k * 2.39996 + rnd() * 0.7;
    let nx = Math.cos(a) * rr + (rnd() - 0.5) * 0.35, ny = yy * (k === 0 ? 1 : flat + 0.3), nz = Math.sin(a) * rr + (rnd() - 0.5) * 0.35;
    const l = Math.hypot(nx, ny, nz) || 1;
    P.push([nx / l, ny / l, nz / l, box > 0 ? 0.88 + rnd() * 0.3 * (1 - box * 0.5) : 0.55 + rnd() * 0.45]);
  }
  const ph = rnd() * 10, ph2 = rnd() * 10;
  const T_ = new Float32Array(P.length);
  let g = new THREE.SphereGeometry(1, w, h);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const cav = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // smooth-min over the planes' hit distances, evaluated relative to the nearest one (a plain sum of exp(-k·t)
    // underflows below any epsilon and collapsed every rock into a sphere)
    const kk = sharp;
    let tmin = 3;
    for (let k = 0; k < P.length; k++) { const p = P[k], d = x * p[0] + y * p[1] + z * p[2]; const t = d > 0.05 ? Math.min(3, p[3] / d) : 3; T_[k] = t; if (t < tmin) tmin = t; }
    let acc = 0;
    for (let k = 0; k < P.length; k++) acc += Math.exp(-kk * (T_[k] - tmin));
    let r = Math.min(1.1, tmin - Math.log(acc) / kk) * 0.8;
    // vertical fracture lines (cracks running down the face)
    const ang = Math.atan2(z, x);
    r *= 1 - fracture * Math.pow(Math.abs(Math.sin(ang * 5 + ph + 0.6 * Math.sin(y * 3 + ph2))), 6);
    let X = x * r, Y = y * r, Z = z * r;
    let c = sstep(0.6, 0.84, r);
    if (bands > 0 && Math.abs(y) < 0.97) {
      const f = ((Y * 0.5 + 0.5) * bands + ph + 0.15 * Math.sin(ang * 3 + ph2)) % 1;
      // f: 0 at the foot of a band .. 1 at its top. Recess the foot, keep a proud lip near the top.
      const inset = lip * (1 - sstep(0.18, 0.62, f)) + lip * 0.5 * sstep(0.9, 1.0, f);
      const side = 1 - Math.abs(y) ** 4;
      X *= 1 - inset * side; Z *= 1 - inset * side;
      c *= 1 - 0.6 * (1 - sstep(0.1, 0.5, f));
    }
    if (taper > 0) { const tf = 1 - taper * sat(Y * 0.5 + 0.5) ** 1.3; X *= tf; Z *= tf; }
    if (Y < bottom) Y = bottom + (Y - bottom) * 0.3;               // settle: flattened base, buried anyway
    pos.setXYZ(i, X, Y, Z);
    cav[i] = c;
  }
  g.computeVertexNormals();
  return { geo: g, cav };
}

/**
 * Basalt / fluted prism cluster: n prisms (5–7 sides) of different heights around the origin, tops cut at a tilt.
 * Object space: base y = 0, height up to 1 (scaled by the piece), footprint radius ~1.
 */
export function protoPrisms({ seed = 1, n = 5, rows = 4, sidesMin = 5, sidesMax = 7 } = {}) {
  const rnd = mulberry32(seed);
  const p = [], idx = [], cv = [];
  const cols = [];
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, d = k === 0 ? 0 : 0.35 + rnd() * 0.45;
    cols.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 0.32 + rnd() * 0.22, h: k === 0 ? 1 : 0.45 + rnd() * 0.5, s: sidesMin + Math.floor(rnd() * (sidesMax - sidesMin + 1)), tilt: (rnd() - 0.5) * 0.25, ta: rnd() * 6.28 });
  }
  for (const c of cols) {
    const base = p.length / 3;
    const S = c.s;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const taper = 1 - 0.12 * t + 0.04 * Math.sin(t * 7 + c.ta);
      for (let s = 0; s <= S; s++) {
        const a = (s % S) / S * Math.PI * 2 + c.ta;
        const ex = Math.cos(a) * c.r * taper, ez = Math.sin(a) * c.r * taper;
        // tilted top cut
        const top = c.h * (1 + c.tilt * (Math.cos(a - c.ta) * c.r));
        p.push(c.x + ex, -0.15 + (top + 0.15) * t, c.z + ez);
        cv.push(0.55 + 0.45 * t);
      }
    }
    for (let r = 0; r < rows; r++) for (let s = 0; s < S; s++) {
      const a = base + r * (S + 1) + s, b = a + 1, cc = a + S + 1, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    // cap (separate verts for a crisp edge)
    const cb = p.length / 3;
    p.push(c.x, c.h * (1 + 0.02), c.z); cv.push(1);
    for (let s = 0; s < S; s++) {
      const a = (s / S) * Math.PI * 2 + c.ta;
      const top = c.h * (1 + c.tilt * (Math.cos(a - c.ta) * c.r));
      p.push(c.x + Math.cos(a) * c.r * 0.88, top - 0.004, c.z + Math.sin(a) * c.r * 0.88); cv.push(0.95);
    }
    for (let s = 0; s < S; s++) idx.push(cb, cb + 1 + ((s + 1) % S), cb + 1 + s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geo: g, cav: new Float32Array(cv) };
}

// ------------------------------------------------------------------------------------------------ baking
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

/**
 * Accumulates transformed prototype copies into one indexed buffer with per-vertex colour.
 * add() returns { v0, v1 } (vertex range) so pieces can later be moved / hidden in place.
 */
export class Bake {
  constructor() { this.p = []; this.n = []; this.c = []; this.idx = []; this.nv = 0; }
  /** proto { geo, cav }, matrix (Matrix4), shade(wx,wy,wz,nx,ny,nz,cav,ly, proto, i) -> [r,g,b] (ly = object-space y, -1..1;
   *  proto / i: the source vertex, for prototypes that carry their own colour — the facet stones of setpieces.js) */
  add(proto, m, shade) {
    const pos = proto.geo.attributes.position, nrm = proto.geo.attributes.normal, cav = proto.cav;
    _nm.getNormalMatrix(m);
    const v0 = this.nv;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i); const ly = _v.y; _v.applyMatrix4(m);
      _n.fromBufferAttribute(nrm, i).applyMatrix3(_nm).normalize();
      this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z);
      const c = shade(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, cav ? cav[i] : 1, ly, proto, i);
      this.c.push(c[0], c[1], c[2]);
    }
    const ix = proto.geo.index.array;
    for (let i = 0; i < ix.length; i++) this.idx.push(ix[i] + v0);
    this.nv += pos.count;
    return { v0, v1: this.nv };
  }
  /** raw triangle soup helpers for hand-made shapes */
  vert(x, y, z, nx, ny, nz, c) { this.p.push(x, y, z); const l = Math.hypot(nx, ny, nz) || 1; this.n.push(nx / l, ny / l, nz / l); this.c.push(c[0], c[1], c[2]); return this.nv++; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  get empty() { return this.nv === 0; }
  build({ normals = false } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    if (normals) g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

/**
 * Painted rock shading in world space. pal: { base, alt, dark, moss?, mossK, snowLine?, snowK, lichen? }.
 * Strata bands follow world height so neighbouring pieces line up into one layered face.
 */
export function rockShader(pal) {
  return (x, y, z, nx, ny, nz, cav, ly) => {
    const n1 = noise2(x * 0.045, z * 0.045), n2 = noise2(x * 0.21 + 7.1, z * 0.21 - 3.3 + y * 0.15);
    const sw = 0.5 + 0.5 * Math.sin(y * 0.33 + n1 * 2.2);                     // broad warm / cool strata
    let c = mix3(pal.base, pal.alt, sw * 0.8);
    const band = 0.88 + 0.12 * Math.sin(y * 1.35 + n1 * 3 + n2 * 0.8);         // fine strata lines
    const cv = 0.72 + 0.28 * cav;                                               // recesses darker
    const under = ny < 0 ? 1 - 0.32 * Math.min(1, -ny * 1.4) : 1 + 0.1 * sstep(0.35, 0.95, ny);
    const foot = 0.78 + 0.22 * sstep(-0.6, 0.1, ly);                            // contact shade near the ground
    const k = band * cv * under * foot * (0.94 + 0.12 * n2);
    c = [c[0] * k, c[1] * k, c[2] * k];
    if (pal.moss && pal.mossK > 0) {
      const m = sstep(0.5, 0.82, ny + 0.28 * n2 + 0.12 * n1) * pal.mossK * (pal.snowLine ? 1 - sstep(pal.snowLine - 30, pal.snowLine - 10, y) : 1);
      if (m > 0) c = mix3(c, pal.moss.map((v) => v * (0.85 + 0.2 * n2)), m);
    }
    if (pal.snowLine) {
      const s = sstep(pal.snowLine - 6, pal.snowLine + 8, y + 16 * n1) * sstep(0.18, 0.55, ny + 0.18 * n2) * (pal.snowK ?? 1);
      if (s > 0) c = mix3(c, [0.93 + 0.05 * n2, 0.95 + 0.04 * n2, 1.0], s);
    }
    if (pal.lichen) {
      const l = sstep(0.55, 0.85, n2 * 0.5 + 0.5) * 0.35 * sat(ny + 0.5);
      if (l > 0) c = mix3(c, pal.lichen, l);
    }
    return c;
  };
}

/** Rock palettes per land (linear RGB). */
export const PALS = {
  // tuned against the terrain's own rock (lavender-grey) and grass so pieces read as part of the hill, not pebbles on it
  sun:    { base: lin(0xc2b8b0), alt: lin(0xaaa3b2), moss: lin(0x86bf55), mossK: 0.6 },
  mtn:    { base: lin(0xb2adbd), alt: lin(0x9a94a8), moss: lin(0x7fae5a), mossK: 0.35, snowLine: 104 },
  dusk:   { base: lin(0xb89a8a), alt: lin(0xa08c96), moss: lin(0xb8a050), mossK: 0.45 },
  night:  { base: lin(0x6a6688), alt: lin(0x565e7e), moss: lin(0x3a7a84), mossK: 0.4, lichen: lin(0x3fb8b0) },
  palace: { base: lin(0x4c4864), alt: lin(0x3c3a56), mossK: 0, lichen: lin(0x6a78b8) },
  coast:  { base: lin(0xc8bcaa), alt: lin(0xb0a49c), moss: lin(0x8cbf55), mossK: 0.7 },
};

/** Land palette at (x,z) blended by the Veil weight. */
export function palAt(W, x, z, extra = null) {
  const v = W.veilAt(x, z);
  const mm = W.mountainMask(x, z);
  let p;
  if (v > 0.82) p = PALS.night; else if (v > 0.25) p = PALS.dusk; else p = mm > 0.12 ? PALS.mtn : PALS.sun;
  if (mm > 0.12 && v <= 0.82) p = { ...p, snowLine: PALS.mtn.snowLine };
  return extra ? { ...p, ...extra } : p;
}
