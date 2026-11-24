// Mesh kit + build driver for the activity props (round art-props, 2026-11-24): the open country's puzzle props
// (briar thicket, rubble heap, pack chest), the witch's ring gates and the roadside errands' props (hat, easel, stove,
// cart, sitting stone). Not a distance field: like the facet kit (rock_facet.mjs) these are built directly as meshes —
// tubes along curves, lathes, bevelled convex pieces, leaf blades and ribbons — so canes stay round, planks stay flat,
// edges are real bevels that catch the light, and every LOD is its own build (fewer sides, fewer leaves) rather than a
// simplified copy (NOTES.md: many-part objects defeat the simplifier).
//
//   node tools/sculpt/assets/props_activity_lib.mjs <asset.mjs ...>    -> assets/models/sculpt/<name>.glb + .manifest.json,
//                                                                         sheets in .tmp/sculpt/<name>/sheet.png
// An asset module exports default { name, parts, lods: n, notes, build(lod) -> Mesh | { [suffix]: Mesh } } (a keyed result
// writes one GLB per key: '<name>' for '', '<name>_<key>' otherwise — the chest's lid swings on its own node).
// Paint is sRGB, written linear ONCE (COLOR_0; core/assets.js SCULPT_VC_OK). Origin and front as the game's old object.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, prng, fbm, norm, add, sub, mul, cross, dot, lerp3, clamp, ss, toLin, hex, planeD, bevelPiece, emitPiece, Mesh, xform,
  writeGLB, writeFragment, previewSheet, hullPlanes, stonePaint, mossCap, plane, FLOOR, insetPlanes,
} from './rock_facet.mjs';

export { ROOT, prng, fbm, norm, add, sub, mul, cross, dot, lerp3, clamp, ss, toLin, hex, planeD, plane, bevelPiece, emitPiece, Mesh, xform,
  hullPlanes, stonePaint, mossCap, FLOOR, insetPlanes };

// ---------------------------------------------------------------------------------------------------------- colour
/** sRGB hex -> [r, g, b] 0..1 (sRGB) */
export const C = (h) => hex(h);
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const scalec = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const lin = (c) => [toLin(clamp(c[0])), toLin(clamp(c[1])), toLin(clamp(c[2]))];
/** colour argument: an sRGB triple or fn(info) -> triple */
const paintOf = (col) => (typeof col === 'function' ? col : () => col);

// ---------------------------------------------------------------------------------------------------------- frames
/** a rigid frame: origin o, axes x y z (orthonormal) -> { p(v), n(v) } for Mesh.append */
export function frame(o, x, y, z, s = 1) {
  const S = Array.isArray(s) ? s : [s, s, s];
  return {
    p: (v) => [o[0] + x[0] * v[0] * S[0] + y[0] * v[1] * S[1] + z[0] * v[2] * S[2], o[1] + x[1] * v[0] * S[0] + y[1] * v[1] * S[1] + z[1] * v[2] * S[2], o[2] + x[2] * v[0] * S[0] + y[2] * v[1] * S[1] + z[2] * v[2] * S[2]],
    n: (v) => norm([x[0] * v[0] / S[0] + y[0] * v[1] / S[1] + z[0] * v[2] / S[2], x[1] * v[0] / S[0] + y[1] * v[1] / S[1] + z[1] * v[2] / S[2], x[2] * v[0] / S[0] + y[2] * v[1] / S[1] + z[2] * v[2] / S[2]]),
  };
}
/** a frame whose local +Y points along dir (roll about it by `roll` rad) */
export function aim(o, dir, roll = 0, s = 1) {
  const y = norm(dir);
  const ref = Math.abs(y[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let x = norm(cross(ref, y)), z = cross(x, y);
  if (roll) { const c = Math.cos(roll), sn = Math.sin(roll); [x, z] = [add(mul(x, c), mul(z, sn)), add(mul(x, -sn), mul(z, c))]; }
  return frame(o, x, y, z, s);
}
/** compose: apply a then b (b(a(v))) */
export const then = (a, b) => ({ p: (v) => b.p(a.p(v)), n: (v) => b.n(a.n(v)) });

// ---------------------------------------------------------------------------------------------------------- curves
/** Catmull-Rom through pts, `n` samples per span (open curve) */
export function spline(pts, n = 6) {
  if (pts.length < 2) return pts.slice();
  const out = [], P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
/** parallel-transport frames along a polyline: [{ p, t, n, b }] (closed = the last point joins the first) */
export function transport(path, closed = false, up = [0, 1, 0]) {
  const N = path.length, F = [];
  const tan = (i) => {
    const a = path[closed ? (i - 1 + N) % N : Math.max(0, i - 1)], b = path[closed ? (i + 1) % N : Math.min(N - 1, i + 1)];
    return norm(sub(b, a));
  };
  let t = tan(0), n = norm(cross(Math.abs(dot(t, up)) > 0.95 ? [1, 0, 0] : up, t));
  for (let i = 0; i < N; i++) {
    const ti = tan(i);
    // rotate the previous normal onto the new tangent (double reflection would be finer; this is enough at our steps)
    n = norm(sub(n, mul(ti, dot(n, ti))));
    F.push({ p: path[i], t: ti, n, b: cross(ti, n) });
    t = ti;
  }
  if (closed) {
    // spread the closing twist evenly so the seam lines up
    const last = F[N - 1], first = F[0];
    let tw = Math.atan2(dot(cross(last.n, first.n), first.t), dot(last.n, first.n));
    for (let i = 0; i < N; i++) {
      const a = tw * i / N, c = Math.cos(a), s = Math.sin(a), f = F[i];
      const n2 = add(mul(f.n, c), mul(f.b, s)); f.n = norm(n2); f.b = cross(f.t, f.n);
    }
  }
  return F;
}

// ---------------------------------------------------------------------------------------------------------- tubes
/**
 * A tube along path (points). r: number | fn(t 0..1, i) ; sides; col: sRGB | fn({ t, a (angle), p, n, i }) ; caps: round
 * cap at the start / end ('flat' | 'tip' | false); closed: loop. twist(t) rad adds a roll to the section (rope strands).
 * aspect: [ax, ay] flattens the section (n axis, b axis).
 */
export function tube(m, path, { r = 0.02, sides = 6, part = 'body', col = [0.5, 0.5, 0.5], cap0 = 'flat', cap1 = 'flat', closed = false, up, aspect = [1, 1], phase = 0 } = {}) {
  const F = transport(path, closed, up), N = F.length, R = typeof r === 'function' ? r : () => r, paint = paintOf(col);
  const rows = [];
  // arc length for t
  const L = [0]; for (let i = 1; i < N; i++) L.push(L[i - 1] + Math.hypot(...sub(path[i], path[i - 1])));
  const total = L[N - 1] || 1;
  for (let i = 0; i < N; i++) {
    const f = F[i], t = L[i] / total, rr = R(t, i), row = [];
    for (let k = 0; k < sides; k++) {
      const a = phase + (k / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const off = add(mul(f.n, ca * rr * aspect[0]), mul(f.b, sa * rr * aspect[1]));
      const nn = norm(add(mul(f.n, ca / aspect[0]), mul(f.b, sa / aspect[1])));
      const p = add(f.p, off);
      row.push(m.v(p, nn, lin(paint({ t, a, p, n: nn, i, r: rr })), part));
    }
    rows.push(row);
  }
  const span = closed ? N : N - 1;
  for (let i = 0; i < span; i++) {
    const A = rows[i], B = rows[(i + 1) % N];
    for (let k = 0; k < sides; k++) { const k2 = (k + 1) % sides; m.tri(A[k], B[k2], B[k]); m.tri(A[k], A[k2], B[k2]); }
  }
  if (!closed) {
    const cap = (row, f, dir, kind, t) => {
      if (!kind) return;
      const rr = R(t, 0);
      const tip = kind === 'tip' ? add(f.p, mul(f.t, dir * rr * 1.6)) : add(f.p, mul(f.t, dir * rr * 0.25));
      const c = m.v(tip, mul(f.t, dir), lin(paint({ t, a: 0, p: tip, n: mul(f.t, dir), i: -1, r: rr, cap: true })), part);
      for (let k = 0; k < sides; k++) { const k2 = (k + 1) % sides; if (dir > 0) m.tri(row[k2], c, row[k]); else m.tri(row[k], c, row[k2]); }
    };
    cap(rows[0], F[0], -1, cap0, 0);
    cap(rows[N - 1], F[N - 1], 1, cap1, 1);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------------- lathe
/**
 * Turn profile [[r, y], ...] about +Y. sides; crease (deg): profile corners sharper than this get split normals;
 * col: sRGB | fn({ p, n, a, k (profile index), r, y }); xf: frame applied after; a0 start angle; arc (rad) < 2PI = part.
 * A profile point with r = 0 closes the shape at the axis (no hole).
 */
export function lathe(m, prof, { sides = 16, part = 'body', col = [0.5, 0.5, 0.5], crease = 40, xf = null, a0 = 0, arc = Math.PI * 2, wob = null } = {}) {
  const paint = paintOf(col), K = prof.length, cosC = Math.cos(crease * Math.PI / 180);
  // profile segment normals in (r, y): outward = (dy, -dr) normalised (profile runs bottom -> top on the outside)
  const segN = [];
  for (let k = 0; k < K - 1; k++) { const dr = prof[k + 1][0] - prof[k][0], dy = prof[k + 1][1] - prof[k][1], l = Math.hypot(dr, dy) || 1; segN.push([dy / l, -dr / l]); }
  // vertex list along the profile with normals (split at creases)
  const pv = [];
  for (let k = 0; k < K; k++) {
    const a = segN[k - 1], b = segN[k];
    if (a && b && a[0] * b[0] + a[1] * b[1] < cosC) { pv.push({ k, n: a, end: true }); pv.push({ k, n: b }); }
    else { const n = a && b ? [a[0] + b[0], a[1] + b[1]] : (a || b); const l = Math.hypot(n[0], n[1]) || 1; pv.push({ k, n: [n[0] / l, n[1] / l] }); }
  }
  const full = arc >= Math.PI * 2 - 1e-6, cols = full ? sides : sides + 1;
  const rows = pv.map((q) => {
    const [r, y] = prof[q.k], row = [];
    for (let s = 0; s < cols; s++) {
      const a = a0 + (s / sides) * arc, ca = Math.cos(a), sa = Math.sin(a);
      const rr = wob ? r * (1 + wob(a, y)) : r;
      let p = [sa * rr, y, ca * rr], n = norm([sa * q.n[0], q.n[1], ca * q.n[0]]);
      const c = lin(paint({ p, n, a, k: q.k, r, y }));
      if (xf) { p = xf.p(p); n = xf.n(n); }
      row.push(m.v(p, n, c, part));
    }
    return { row, end: q.end };
  });
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].end) continue;   // the split pair at a crease is not joined to itself
    const A = rows[i].row, B = rows[i + 1].row;
    for (let s = 0; s < (full ? sides : sides); s++) {
      const s2 = full ? (s + 1) % sides : s + 1;
      // profile runs up; outward winding: A[s], A[s2], B[s2]
      m.tri(A[s], A[s2], B[s2]); m.tri(A[s], B[s2], B[s]);
    }
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------------- pieces
const boxPlanes = ([sx, sy, sz]) => [planeD([1, 0, 0], sx / 2), planeD([-1, 0, 0], sx / 2), planeD([0, 1, 0], sy / 2), planeD([0, -1, 0], sy / 2), planeD([0, 0, 1], sz / 2), planeD([0, 0, -1], sz / 2)];
/**
 * A bevelled convex piece (box by default, or `planes`) centred at the origin, then placed by xf. bevel: m or fn(edge);
 * col: sRGB | fn({ p (local), n, fn, kind, chamfer }); skip(kind) drops faces (e.g. a buried bottom).
 */
export function piece(m, { size = [1, 1, 1], planes = null, bevel = 0.01, part = 'body', col = [0.5, 0.5, 0.5], xf = null, corners = true, skip = () => false, flat = false } = {}) {
  const pl = planes || boxPlanes(size);
  const bw = typeof bevel === 'function' ? bevel : () => bevel;
  const pc = bevelPiece(pl, bw, { corners, minAngle: 0.2 });
  const sub0 = new Mesh();
  const paint = paintOf(col);
  emitPiece(sub0, pc, (c) => paint(c), { skip, part, flat });
  m.append(sub0, xf);
  return m;
}
/** a bevelled box from corner to corner (axis aligned in its frame), placed by xf */
export function boxFT(m, [x0, y0, z0, x1, y1, z1], o = {}) {
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const xf0 = { p: (v) => add(v, c), n: (v) => v };
  return piece(m, { ...o, size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], xf: o.xf ? then(xf0, o.xf) : xf0 });
}
/** a bevelled plank / beam from a to b (centre line), section w (across, perpendicular to `up`) x h (along up) */
export function beam(m, a, b, w, h, o = {}) {
  const d = sub(b, a), L = Math.hypot(...d), y = norm(d);
  const up = o.up || (Math.abs(y[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0]);
  const x = norm(cross(up, y)), z = cross(x, y);
  return piece(m, { ...o, size: [w, L, h], xf: frame(lerp3(a, b, 0.5), x, y, z) });
}

// ---------------------------------------------------------------------------------------------------------- blades
/**
 * A leaf / feather vane / ribbon blade (single sheet: the game draws these materials double-sided). Grows from base along
 * dir; `up` is its face normal before curl; len, wid; shape(u 0..1) -> half-width factor; fold (rad) folds the halves up
 * along the midrib; curl (rad over the length) bends it about its width axis; segs along, cols across (odd).
 */
export function blade(m, { base, dir, up = [0, 1, 0], len = 0.1, wid = 0.04, shape = (u) => Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.8, fold = 0.3, curl = 0.4, twist = 0, segs = 4, cols = 3, part = 'leaf', col = [0.3, 0.5, 0.2] }) {
  const paint = paintOf(col);
  let t = norm(dir), nrm = norm(sub(up, mul(t, dot(up, t)))), side = cross(t, nrm);
  const rows = [];
  let p = base.slice();
  const step = len / segs, h = (cols - 1) / 2;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, w = wid * shape(u), row = [];
    const tw = twist * u, ct = Math.cos(tw), st = Math.sin(tw);
    const sd = add(mul(side, ct), mul(nrm, st)), nn = add(mul(nrm, ct), mul(side, -st));
    for (let j = 0; j < cols; j++) {
      const v = (j - h) / (h || 1);                     // -1 .. 1 across
      const lift = Math.abs(v) * Math.sin(fold) * w;    // halves folded up along the midrib
      const q = add(add(p, mul(sd, v * w * Math.cos(fold))), mul(nn, lift));
      const n2 = norm(add(nn, mul(sd, -Math.sign(v) * Math.sin(fold) * 0.8)));
      row.push(m.v(q, n2, lin(paint({ u, v, p: q })), part));
    }
    rows.push(row);
    // advance and curl: rotate t toward nrm by curl/segs
    const a = curl / segs, ca = Math.cos(a), sa = Math.sin(a);
    p = add(p, mul(t, step));
    [t, nrm] = [norm(add(mul(t, ca), mul(nrm, sa))), norm(add(mul(nrm, ca), mul(t, -sa)))];
    side = cross(t, nrm);
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < cols - 1; j++) {
    const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
    m.tri(a, b, c); m.tri(a, c, d);
  }
  return m;
}
/**
 * A ribbon along path (strip, single sheet): width w (number | fn(t)), the strip's face normal follows `face(t)` or the
 * path's transport normal; colour fn({ t, v }).
 */
export function ribbon(m, path, { w = 0.04, part = 'cloth', col = [0.8, 0.2, 0.2], face = null, cols = 2 } = {}) {
  const F = transport(path), N = F.length, W = typeof w === 'function' ? w : () => w, paint = paintOf(col);
  const L = [0]; for (let i = 1; i < N; i++) L.push(L[i - 1] + Math.hypot(...sub(path[i], path[i - 1])));
  const rows = [];
  for (let i = 0; i < N; i++) {
    const f = F[i], t = L[i] / (L[N - 1] || 1);
    const fn = face ? norm(face(t, f)) : f.n;
    const across = norm(cross(f.t, fn)), row = [];
    for (let j = 0; j < cols; j++) {
      const v = cols === 1 ? 0 : j / (cols - 1) - 0.5, q = add(f.p, mul(across, v * W(t)));
      row.push(m.v(q, fn, lin(paint({ t, v, p: q })), part));
    }
    rows.push(row);
  }
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < cols - 1; j++) { const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j]; m.tri(a, b, c); m.tri(a, c, d); }
  return m;
}

// ---------------------------------------------------------------------------------------------------------- blobs
/** an ellipsoid (UV sphere) of half sizes r[3], placed by xf; disp(p dir) -> radial factor; col fn({ p, n, u, v }) */
export function blob(m, { r = [0.1, 0.1, 0.1], seg = 10, rings = 7, part = 'body', col = [0.5, 0.5, 0.5], xf = null, disp = null } = {}) {
  const paint = paintOf(col), rows = [];
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, th = v * Math.PI, sy = -Math.cos(th), sr = Math.sin(th), row = [];
    for (let j = 0; j < (i === 0 || i === rings ? 1 : seg); j++) {
      const ph = (j / seg) * Math.PI * 2, d = [Math.sin(ph) * sr, sy, Math.cos(ph) * sr];
      const k = disp ? disp(d, v, ph) : 1;
      let p = [d[0] * r[0] * k, d[1] * r[1] * k, d[2] * r[2] * k], n = norm([d[0] / r[0], d[1] / r[1], d[2] / r[2]]);
      const c = lin(paint({ p, n, u: ph / (Math.PI * 2), v, d }));
      if (xf) { p = xf.p(p); n = xf.n(n); }
      row.push(m.v(p, n, c, part));
    }
    rows.push(row);
  }
  for (let i = 0; i < rings; i++) {
    const A = rows[i], B = rows[i + 1];
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      if (A.length === 1) m.tri(A[0], B[j2], B[j]);
      else if (B.length === 1) m.tri(A[j], A[j2], B[0]);
      else { m.tri(A[j], A[j2], B[j2]); m.tri(A[j], B[j2], B[j]); }
    }
  }
  return m;
}

// ---------------------------------------------------------------------------------------------------------- normals
/** recompute smooth normals for the vertices from index `from` on (welded by position within each part) */
export function smoothFrom(m, from = 0) {
  const nv = m.nv, acc = new Float64Array(nv * 3), key = new Map(), group = new Int32Array(nv);
  for (let v = from; v < nv; v++) {
    const k = m.part[v] + ':' + Math.round(m.pos[v * 3] * 1e4) + ',' + Math.round(m.pos[v * 3 + 1] * 1e4) + ',' + Math.round(m.pos[v * 3 + 2] * 1e4);
    let g = key.get(k); if (g === undefined) { g = v; key.set(k, v); } group[v] = g;
  }
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t], b = m.idx[t + 1], c = m.idx[t + 2];
    if (a < from || b < from || c < from) continue;
    const P = (i) => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
    const n = cross(sub(P(b), P(a)), sub(P(c), P(a)));
    for (const v of [a, b, c]) { const g = group[v]; acc[g * 3] += n[0]; acc[g * 3 + 1] += n[1]; acc[g * 3 + 2] += n[2]; }
  }
  for (let v = from; v < nv; v++) { const g = group[v], n = norm([acc[g * 3], acc[g * 3 + 1], acc[g * 3 + 2]]); m.nrm[v * 3] = n[0]; m.nrm[v * 3 + 1] = n[1]; m.nrm[v * 3 + 2] = n[2]; }
  return m;
}

// ---------------------------------------------------------------------------------------------------------- driver
async function buildOne(file) {
  const def = (await import(path.resolve(file))).default;
  const name = def.name, out = path.join(ROOT, '.tmp/sculpt', name);
  fs.mkdirSync(out, { recursive: true });
  const lodsBy = {};   // key -> [Mesh per LOD]
  for (let l = 0; l < def.lods; l++) {
    const r = def.build(l);
    const keyed = r instanceof Mesh ? { '': r } : r;
    for (const [k, mesh] of Object.entries(keyed)) (lodsBy[k] ||= []).push(mesh);
  }
  const items = [], summary = [];
  for (const [k, lods] of Object.entries(lodsBy)) {
    const nm = k ? `${name}_${k}` : name;
    const parts = Object.fromEntries(Object.entries(def.parts).filter(([pt]) => lods.some((m) => m.part.includes(pt))));
    const res = await writeGLB(path.join(ROOT, 'assets/models/sculpt', nm + '.glb'), nm, lods, parts, { family: 'props_activity', asset: name, ...(def.anchors?.[k] ? { anchors: def.anchors[k] } : {}) });
    const b = lods[0].bounds();
    writeFragment(nm, {
      size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]], tris: res.tris, parts,
      source: `tools/sculpt/assets/${name}.mjs (node tools/sculpt/assets/props_activity_lib.mjs)`,
      notes: `${def.notes} LOD tris ${res.tris.join(' / ')}. Vertex colour only (COLOR_0 linear rgb, written once).`,
    });
    summary.push(`${nm.padEnd(18)} tris ${res.tris.join(' / ').padEnd(20)} ${res.kb} KB  size ${[b[3] - b[0], b[4] - b[1], b[5] - b[2]].map((v) => v.toFixed(2)).join(' x ')}`);
    const views = def.views || [[30, 18], [210, 30]];
    for (const [az, el] of views) items.push({ mesh: lods[0], az, el, label: `${nm} L0 ${res.tris[0]}` });
    for (let l = 1; l < lods.length; l++) items.push({ mesh: lods[l], az: views[0][0], el: views[0][1], label: `L${l} ${res.tris[l]}`, wire: l === 1 });
  }
  await previewSheet(path.join(out, 'sheet.png'), `${name.toUpperCase()} - PROPS ACTIVITY KIT`, items, { cols: 4, ts: def.sheetSize || 360 });
  for (const s of summary) console.log(s);
  console.log(`  sheet .tmp/sculpt/${name}/sheet.png`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2).filter((a) => a.endsWith('.mjs'));
  (async () => { for (const f of files) await buildOne(f); })().catch((e) => { console.error(e); process.exit(1); });
}
