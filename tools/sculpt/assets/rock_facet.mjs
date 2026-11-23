// Facet kit: stone built from exact planes (round "art-stone", 2026-11-24). Not a kit asset module (no distance field):
// the SDF path melts big plain faces into soft pillows once simplified (NOTES.md "From the first installation"), so
// stone that must read as crisp planes is built here directly as a mesh.
//  - polytope(planes): the exact convex solid of a set of half-spaces (clipped from a box, faces as polygons);
//  - bevel: every edge between two faces is chamfered by a plane through the bisector, `width` m into each face; the
//    chamfer's vertices take the normals of the faces they touch, so the strip shades like a rounded edge that catches
//    the light while the big faces stay flat (weighted normals, the hard-surface trick);
//  - pieces: a stone is a few convex pieces (beds stepped back from one another, halves split by a joint), each bevelled;
//  - moss: a soft cushion (its own mesh, smooth normals) laid over the top of the pieces, edge tucked into the stone;
//  - paint: vertex colour only, value story in sRGB written as linear (no textures: everything here is instanced or
//    merged). Neutral stone (mean ~#9b9b9b) so the game's land / species tints keep their meaning; moss has its own colour.
// Shared by the rock family (rock_family.mjs), the dry-stone walls (wall_drystone.mjs) and the lake mill (mill_lake.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fbm, prng } from '../noise.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export { prng, fbm };

// ------------------------------------------------------------------------------------------------------------ vectors
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** plane with outward normal n through point `at`; kind tags the faces it makes (colour, bevel rules) */
export const plane = (n, at, kind = 'face', extra = {}) => { const u = norm(n); return { n: u, d: dot(u, at), kind, ...extra }; };
/** plane with outward normal n at signed distance d from the origin */
export const planeD = (n, d, kind = 'face', extra = {}) => ({ n: norm(n), d, kind, ...extra });

// ------------------------------------------------------------------------------------------------------- the solid
const EPS = 1e-7;
function boxFaces(B) {
  const P = (x, y, z) => [x * B, y * B, z * B];
  const f = (n, pts) => ({ plane: { n, d: B, kind: 'box' }, pts });
  return [
    f([1, 0, 0], [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)]),
    f([-1, 0, 0], [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1)]),
    f([0, 1, 0], [P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)]),
    f([0, -1, 0], [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1)]),
    f([0, 0, 1], [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)]),
    f([0, 0, -1], [P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1)]),
  ];
}
function dedupe(pts, eps = 1e-6) {
  const out = [];
  for (const p of pts) if (!out.some((q) => Math.abs(q[0] - p[0]) < eps && Math.abs(q[1] - p[1]) < eps && Math.abs(q[2] - p[2]) < eps)) out.push(p);
  return out;
}
function dedupeRing(pts, eps = 1e-6) {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps || Math.abs(q[2] - p[2]) > eps) out.push(p); }
  while (out.length > 1) { const a = out[0], b = out[out.length - 1]; if (Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps && Math.abs(a[2] - b[2]) < eps) out.pop(); else break; }
  return out;
}
/** clip a convex solid (faces) by n.x <= d; returns the new faces (the cut adds one cap face carrying `pl`) */
function clip(faces, pl) {
  let any = false, all = true;
  for (const f of faces) for (const p of f.pts) { const s = dot(pl.n, p) - pl.d; if (s > EPS) any = true; else all = false; }
  if (!any) return faces;
  if (all) return [];
  const out = [], cap = [];
  for (const f of faces) {
    const P = f.pts, res = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], da = dot(pl.n, a) - pl.d, db = dot(pl.n, b) - pl.d;
      if (da <= EPS) res.push(a);
      if (Math.abs(da) <= EPS) cap.push(a);
      if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) { const p = lerp3(a, b, da / (da - db)); res.push(p); cap.push(p); }
    }
    const r = dedupeRing(res);
    if (r.length >= 3) out.push({ plane: f.plane, pts: r });
  }
  const cp = dedupe(cap);
  if (cp.length >= 3) {
    const c = cp.reduce((s, p) => add(s, p), [0, 0, 0]).map((v) => v / cp.length);
    const u = norm(Math.abs(pl.n[1]) < 0.9 ? cross([0, 1, 0], pl.n) : cross([1, 0, 0], pl.n)), v = cross(pl.n, u);
    cp.sort((p, q) => Math.atan2(dot(sub(p, c), v), dot(sub(p, c), u)) - Math.atan2(dot(sub(q, c), v), dot(sub(q, c), u)));
    out.push({ plane: pl, pts: cp });
  }
  return out;
}
/** the convex solid of half-spaces n.x <= d (faces: [{ plane, pts (ccw from outside) }]) */
export function polytope(planes, B = 6) {
  let faces = boxFaces(B);
  for (const pl of planes) { faces = clip(faces, pl); if (!faces.length) break; }
  return faces;
}
const key3 = (p) => p.map((v) => Math.round(v * 1e5)).join(',');
/** edges shared by two faces: [{ a, b (points), fa, fb (faces) }] */
export function edgesOf(faces) {
  const m = new Map(), out = [];
  for (const f of faces) for (let i = 0; i < f.pts.length; i++) {
    const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length], ka = key3(a), kb = key3(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
    const e = m.get(k);
    if (e) { e.fb = f; out.push(e); } else m.set(k, { a, b, fa: f, fb: null });
  }
  return out;
}

/**
 * A bevelled convex piece. planes: half-spaces (kind 'face' | 'bed' | 'crack' | 'floor' | ...). width(edge) -> chamfer
 * width in m on each face (0 = sharp); edge = { a, b, na, nb, ka, kb (kinds), angle (rad between the normals), mid }.
 * Returns { faces, planes (all, chamfers included), base (the planes before the bevel) }.
 */
export function bevelPiece(planes, width, { minAngle = 0.2, corners = true } = {}) {
  const base = polytope(planes);
  const chamfers = [];
  for (const e of edgesOf(base)) {
    if (!e.fb) continue;
    const na = e.fa.plane.n, nb = e.fb.plane.n, ang = Math.acos(clamp(dot(na, nb), -1, 1));
    if (ang < minAngle) continue;
    const info = { a: e.a, b: e.b, na, nb, ka: e.fa.plane.kind, kb: e.fb.plane.kind, angle: ang, mid: lerp3(e.a, e.b, 0.5), len: Math.hypot(...sub(e.b, e.a)) };
    const w = width(info);
    if (!(w > 0)) continue;
    const m = norm(add(na, nb));
    chamfers.push({ n: m, d: dot(m, e.a) - w * Math.sin(ang / 2), kind: 'chamfer', parents: [e.fa.plane, e.fb.plane] });
  }
  let faces = base;
  for (const c of chamfers) faces = clip(faces, c);
  // corners: where three or more chamfers meet, a small facet facing the mean of the faces around the vertex keeps the
  // corner from ending in a needle
  if (corners) {
    const vk = new Map();
    for (const f of base) for (const p of f.pts) { const k = key3(p); const v = vk.get(k) || vk.set(k, { p, ns: [] }).get(k); v.ns.push(f.plane.n); }
    for (const { p, ns } of vk.values()) {
      if (ns.length < 3) continue;
      const m = norm(ns.reduce((s, n) => add(s, n), [0, 0, 0]));
      const w = width({ a: p, b: p, na: ns[0], nb: ns[1], ka: 'corner', kb: 'corner', angle: 1, mid: p, len: 0, corner: true });
      if (!(w > 0)) continue;
      faces = clip(faces, { n: m, d: dot(m, p) - w * 0.9, kind: 'chamfer', parents: [] });
    }
  }
  return { faces, base: planes, planes: [...planes, ...chamfers] };
}

/** vertical span of a convex piece (its planes) over (x, z): the top y, or null when (x, z) is outside */
export function topOf(planes, x, z) {
  let lo = -1e9, hi = 1e9;
  for (const p of planes) {
    const a = p.n[1], b = p.d - p.n[0] * x - p.n[2] * z;
    if (Math.abs(a) < 1e-9) { if (b < 0) return null; continue; }
    if (a > 0) hi = Math.min(hi, b / a); else lo = Math.max(lo, b / a);
  }
  return lo <= hi && hi < 1e8 ? hi : null;
}

// --------------------------------------------------------------------------------------------------------- the mesh
/** growing triangle mesh: pos / nrm / col (linear rgb) / idx, plus the part of every vertex (material name) */
export class Mesh {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.idx = []; this.part = []; }
  get nv() { return this.pos.length / 3; }
  get tris() { return this.idx.length / 3; }
  v(p, n, c, part = 'stone') { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]); this.part.push(part); return this.nv - 1; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  append(m, xf = null) {
    const o = this.nv;
    for (let i = 0; i < m.nv; i++) {
      let p = [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]], n = [m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]];
      if (xf) { p = xf.p(p); n = xf.n(n); }
      this.v(p, n, [m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]], m.part[i]);
    }
    for (const i of m.idx) this.idx.push(i + o);
    return this;
  }
  /** split by part: { part: { pos, nrm, col, idx } } (typed arrays) */
  byPart() {
    const out = {};
    for (let t = 0; t < this.idx.length; t += 3) {
      const pt = this.part[this.idx[t]];
      const o = out[pt] || (out[pt] = { map: new Map(), pos: [], nrm: [], col: [], idx: [] });
      for (let k = 0; k < 3; k++) {
        const v = this.idx[t + k];
        let r = o.map.get(v);
        if (r === undefined) { r = o.pos.length / 3; o.map.set(v, r); o.pos.push(this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]); o.nrm.push(this.nrm[v * 3], this.nrm[v * 3 + 1], this.nrm[v * 3 + 2]); o.col.push(this.col[v * 3], this.col[v * 3 + 1], this.col[v * 3 + 2]); }
        o.idx.push(r);
      }
    }
    for (const k in out) { const o = out[k]; out[k] = { pos: Float32Array.from(o.pos), nrm: Float32Array.from(o.nrm), col: Float32Array.from(o.col), idx: Uint32Array.from(o.idx) }; }
    return out;
  }
  bounds() { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < this.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], this.pos[i + k]); b[k + 3] = Math.max(b[k + 3], this.pos[i + k]); } return b; }
}

/** rigid transform helpers for Mesh.append: rotate about Y by `yaw`, then about the local axes, then translate */
export function xform({ at = [0, 0, 0], yaw = 0, pitch = 0, roll = 0, scale = 1 } = {}) {
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const rot = (v) => {
    let [x, y, z] = v;
    [y, z] = [y * cp - z * sp, y * sp + z * cp];     // pitch about X
    [x, y] = [x * cr - y * sr, x * sr + y * cr];     // roll about Z
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];    // yaw about Y
    return [x, y, z];
  };
  return {
    p: (v) => add(rot([v[0] * s[0], v[1] * s[1], v[2] * s[2]]), at),
    n: (v) => norm(rot([v[0] / s[0], v[1] / s[1], v[2] / s[2]])),
  };
}

/**
 * Write a bevelled piece into a mesh. paint(c) -> sRGB [r,g,b] with c = { p, n (shading), fn (face normal), kind,
 * chamfer (0/1), piece }. skip(kind) drops faces (the buried floor). Chamfer vertices take the normal of the base face
 * they lie on (smooth edge highlight); a vertex on no base face (a corner) takes the mean of the faces around it.
 */
export function emitPiece(mesh, piece, paint, { skip = (k) => k === 'floor', part = 'stone', tag = null, flat = false } = {}) {
  const basePl = piece.planes.filter((p) => p.kind !== 'chamfer');
  for (const f of piece.faces) {
    const kind = f.plane.kind;
    if (skip(kind)) continue;
    const ids = [];
    for (const p of f.pts) {
      let n = f.plane.n;
      if (kind === 'chamfer' && !flat) {
        const on = basePl.filter((q) => Math.abs(dot(q.n, p) - q.d) < 2e-5 && q.kind !== 'floor');
        if (on.length === 1) n = on[0].n;
        else if (on.length > 1) n = norm(on.reduce((s, q) => add(s, q.n), [0, 0, 0]));
        else { const par = (f.plane.parents || []).filter((q) => q.kind !== 'floor'); n = par.length ? norm(add(f.plane.n, mul(par.reduce((s, q) => add(s, q.n), [0, 0, 0]), 0.5 / par.length))) : f.plane.n; }
      }
      const srgb = paint({ p, n, fn: f.plane.n, kind: kind === 'chamfer' ? ((f.plane.parents || [])[0]?.kind || 'face') : kind, chamfer: kind === 'chamfer' ? 1 : 0, piece: tag });
      ids.push(mesh.v(p, n, srgb.map(toLin), part));
    }
    for (let i = 1; i + 1 < ids.length; i++) mesh.tri(ids[0], ids[i], ids[i + 1]);
  }
  return mesh;
}

// --------------------------------------------------------------------------------------------------------- moss
/**
 * A moss cushion over the top of `pieces` (plane lists): a polar heightfield around `at` [x, z] with a noisy outline of
 * mean radius R that stops where the top runs out or turns steeper than `maxSlope` (+ a small lip over the edge), raised
 * T at its middle and tucked 6 mm into the stone at its rim (no seam to see). Smooth normals: a soft mass.
 * colours: { top, edge } sRGB. Returns the number of triangles added.
 */
export function mossCap(mesh, pieces, { at, R = 0.25, T = 0.035, seed = 1, rings = 4, segs = 14, maxSlope = 1.15, lip = 0.03, wobble = 0.3,
  top = hex(0x6c8a4a), edge = hex(0x4b6339), part = 'moss', minR = 0.04 } = {}) {
  const topAt = (x, z) => { let y = null; for (const pl of pieces) { const t = topOf(pl, x, z); if (t !== null && (y === null || t > y)) y = t; } return y; };
  const y0 = topAt(at[0], at[1]);
  if (y0 === null) return 0;
  const rnd = prng(seed);
  const ph = rnd() * 10;
  const radii = [];
  for (let j = 0; j < segs; j++) {
    const a = (j / segs) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    const want = R * (1 + wobble * (0.65 * Math.sin(a * 2 + ph) + 0.35 * Math.sin(a * 3 + ph * 1.7)) + wobble * 0.4 * (rnd() - 0.5));
    let r = 0, prev = y0;
    const step = Math.max(0.008, R / 30);
    for (; r < want; r += step) {
      const y = topAt(at[0] + dx * (r + step), at[1] + dz * (r + step));
      if (y === null || (prev - y) / step > maxSlope) break;
      prev = y;
    }
    radii.push(Math.max(minR, Math.min(want, r + lip)));
  }
  // smooth the outline once (no spikes between neighbouring rays)
  const rr = radii.map((r, j) => 0.25 * radii[(j + segs - 1) % segs] + 0.5 * r + 0.25 * radii[(j + 1) % segs]);
  const yAt = (x, z, f) => {
    let t = topAt(x, z);
    if (t === null) { // past the edge: follow the nearest top inward a little lower (the lip folds over)
      let k = 1; for (; k < 8 && t === null; k++) t = topAt(at[0] + (x - at[0]) * (1 - k * 0.06), at[1] + (z - at[1]) * (1 - k * 0.06));
      t = (t ?? y0) - 0.02 * k;
    }
    const lump = 1 + 0.22 * fbm(x * 9, 0, z * 9, seed + 3, 2);
    return t + T * lump * Math.pow(Math.max(0, 1 - f * f), 0.55) - 0.006 * ss(0.85, 1, f);
  };
  const base = mesh.nv, grid = [];
  const centre = [at[0], yAt(at[0], at[1], 0), at[1]];
  grid.push([centre]);
  for (let i = 1; i <= rings; i++) {
    const f = Math.pow(i / rings, 0.7), ring = [];
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2, x = at[0] + Math.cos(a) * rr[j] * f, z = at[1] + Math.sin(a) * rr[j] * f;
      ring.push([x, yAt(x, z, f), z]);
    }
    grid.push(ring);
  }
  // vertices (normals: accumulated face normals), colours: lighter on top and in the sun, darker at the rim
  const P = [], C = [];
  const colAt = (p, f) => {
    const k = ss(0.35, 1, f), n = 0.5 + 0.5 * fbm(p[0] * 5, 0, p[2] * 5, seed + 9, 2);
    return [0, 1, 2].map((c) => (top[c] * (1 - k) + edge[c] * k) * (0.94 + 0.12 * n));
  };
  P.push(centre); C.push(colAt(centre, 0));
  for (let i = 1; i <= rings; i++) for (let j = 0; j < segs; j++) { P.push(grid[i][j]); C.push(colAt(grid[i][j], Math.pow(i / rings, 0.7))); }
  const id = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * segs + (j % segs));
  const T3 = [];
  for (let j = 0; j < segs; j++) T3.push([id(0, 0), id(1, j + 1), id(1, j)]);
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) { T3.push([id(i, j), id(i, j + 1), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i + 1, j)]); }
  const N = P.map(() => [0, 0, 0]);
  for (const [a, b, c] of T3) { const n = cross(sub(P[b], P[a]), sub(P[c], P[a])); for (const v of [a, b, c]) N[v] = add(N[v], n); }
  // the cushion faces up: flip winding if the first face points down
  const flip = cross(sub(P[T3[0][1]], P[T3[0][0]]), sub(P[T3[0][2]], P[T3[0][0]]))[1] < 0;
  P.forEach((p, i) => { let n = norm(N[i]); if (flip) n = mul(n, -1); n = norm(add(n, [0, 0.35, 0])); mesh.v(p, n, C[i].map(toLin), part); });
  for (const [a, b, c] of T3) flip ? mesh.tri(base + a, base + c, base + b) : mesh.tri(base + a, base + b, base + c);
  return T3.length;
}

// --------------------------------------------------------------------------------------------------------- paint
/**
 * Stone value (sRGB grey, mean ~0.61 = #9b9b9b, the game's neutral): bleached tops, pale worn edges (chamfers), wet
 * dark crack walls and ledge undersides, a damp foot, a slow drift between faces. Calm big faces: no speckle.
 * o: { H (height), seed, warm (0..1 warm drift), crack (value of crack walls), base }
 */
export function stonePaint(o = {}) {
  const H = o.H || 1, seed = o.seed || 1, base = o.base ?? 0.66;
  return (c) => {
    const { p, n, chamfer, kind } = c;
    let v = base + 0.07 * fbm(p[0] * 1.6 + 3, p[1] * 1.6, p[2] * 1.6, seed, 2);
    v += 0.1 * ss(0.25, 0.95, n[1]);                       // bleached top
    v -= 0.07 * ss(-0.1, -0.7, n[1]);                      // ledge undersides
    v += 0.07 * chamfer;                                   // worn edges catch the light
    if (kind === 'crack') v -= o.crack ?? 0.17;            // the joint's walls: wet and dark
    if (o.bands) v += 0.035 * Math.sin(o.bands(p) * Math.PI * 2);
    v *= 0.8 + 0.2 * ss(0, Math.min(0.2, H * 0.3), p[1]);   // damp foot
    const w = (o.warm ?? 0.3) * fbm(p[0] * 0.9 + 11, p[1] * 0.9, p[2] * 0.9, seed + 5, 1);
    return [v * (1 + 0.04 * w), v, v * (1 - 0.05 * w)];
  };
}

// ---------------------------------------------------------------------------------------------------------- shapes
/** facets around an ellipsoid of half sizes `size` centred at c: `count` planes cut at cut[0..1] of the support */
export function hullPlanes(rnd, { size, c = [0, 0, 0], count = 10, cut = [0.82, 1], tilt = 0.35, noUnder = true, kind = 'face' }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const yy = 1 - 2 * (i + 0.5) / count, r = Math.sqrt(Math.max(0, 1 - yy * yy)), a = i * 2.39996 + rnd() * 0.9;
    let n = norm([Math.cos(a) * r + (rnd() - 0.5) * tilt, yy + (rnd() - 0.5) * tilt * 0.8, Math.sin(a) * r + (rnd() - 0.5) * tilt]);
    if (noUnder && n[1] < -0.05) n = norm([n[0], -0.05 * Math.hypot(n[0], n[2]), n[2]]);
    const sup = Math.hypot(size[0] * n[0], size[1] * n[1], size[2] * n[2]);
    out.push(planeD(n, sup * (cut[0] + (cut[1] - cut[0]) * rnd()) + dot(n, c), kind));
  }
  return out;
}
/** the same planes pushed in by `inset(plane)` m (a bed stepped back from the one below) */
export const insetPlanes = (planes, inset) => planes.map((p) => ({ ...p, d: p.d - inset(p) }));
export const FLOOR = (y = 0) => planeD([0, -1, 0], -y, 'floor');

// ------------------------------------------------------------------------------------------------------- GLB output
/**
 * Write a sculpt-style GLB: root `<name>`, children `<name>_LOD0..n`, one primitive per part, material
 * `<Material>_<surface>` (vertex colours, no textures), COLOR_0 linear RGB. parts: { partName: { name, surface, look } }.
 */
export async function writeGLB(file, name, lods, parts, extras = {}) {
  const { Document, NodeIO } = await import('@gltf-transform/core');
  const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene(name);
  const root = doc.createNode(name);
  const mats = {};
  const matOf = (pt) => {
    if (mats[pt]) return mats[pt];
    const s = parts[pt] || { name: pt, surface: 'stone' };
    return (mats[pt] = doc.createMaterial(`${s.name}_${s.surface}`).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0)
      .setExtras({ surface: s.surface, look: s.look || {}, sculpt: { lod: 'vertex', facet: true } }));
  };
  const tris = [];
  lods.forEach((m, i) => {
    const mesh = doc.createMesh(`${name}_LOD${i}`);
    const split = m.byPart();
    let t = 0;
    for (const pt of Object.keys(parts)) {
      const g = split[pt]; if (!g) continue;
      const big = g.pos.length / 3 > 65535;
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(g.pos).setBuffer(buf))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(g.nrm).setBuffer(buf))
        .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(g.col).setBuffer(buf))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(big ? g.idx : Uint16Array.from(g.idx)).setBuffer(buf))
        .setMaterial(matOf(pt));
      mesh.addPrimitive(prim);
      t += g.idx.length / 3;
    }
    tris.push(t);
    root.addChild(doc.createNode(`${name}_LOD${i}`).setMesh(mesh).setExtras({ lod: i, tris: t }));
  });
  root.setExtras({ sculpt: { facet: true, lods: tris, colour: 'COLOR_0 linear rgb (written once: assets.js SCULPT_VC_OK)', ...extras } });
  scene.addChild(root);
  const bin = await new NodeIO().writeBinary(doc);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bin);
  return { tris, kb: Math.round(bin.length / 1024) };
}

/** the manifest fragment next to the GLB (applied with tools/manifest-patch.mjs) */
export function writeFragment(name, { size, tris, parts, notes, source }) {
  const id = 'sculpt_' + name;
  const frag = { [id]: {
    file: `models/sculpt/${name}.glb`, type: 'model', license: 'CC0 (original work)', author: 'sculpted for this project',
    source, scale: 1, size: size.map((v) => +v.toFixed(3)), tris: tris[0], lods: tris,
    materials: Object.values(parts).map((s) => `${s.name}_${s.surface}`),
    mats: Object.fromEntries(Object.values(parts).map((s) => [`${s.name}_${s.surface}`, { surface: s.surface, look: s.look || {} }])),
    notes,
  } };
  const f = path.join(ROOT, 'assets/models/sculpt', name + '.manifest.json');
  fs.writeFileSync(f, JSON.stringify(frag, null, 1) + '\n');
  return f;
}

/** preview tiles of a mesh with the kit's CPU renderer (form check; the game is the judge) */
export async function previewSheet(file, title, items, { cols = 4, ts = 300 } = {}) {
  const R = await import('../preview.mjs');
  const tiles = [];
  for (const it of items) {
    const g = it.mesh, b = g.bounds(), cc = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    const dist = R.fitDistance(b, 35, 0.8);
    const m = { pos: Float32Array.from(g.pos), nrm: Float32Array.from(g.nrm), idx: Uint32Array.from(g.idx), col: Float32Array.from(g.col), base: [1, 1, 1] };
    tiles.push({ img: R.render([m], R.orbit(cc, it.az ?? 30, it.el ?? 18, dist * (it.zoom || 1), 35, ts, ts), { wire: !!it.wire, ss: 2 }), label: it.label || '' });
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  R.savePNG(file, R.sheet(tiles, cols, { title }));
}
