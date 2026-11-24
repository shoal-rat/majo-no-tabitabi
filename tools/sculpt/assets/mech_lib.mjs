// Shared toolkit of the page-trial sites (stele_page.mjs, mech_*.mjs) and the rock golem (golem_rock.mjs), round
// art-figures (2026-11-24). Not an asset. Everything is built as a mesh, like the facet kit (rock_facet.mjs):
//  - stone: exact convex pieces with bevelled edges (box / prism / any half-spaces), the facet kit's bevelPiece + emitPiece;
//  - turned, swept and carved parts: three.js geometry generators (lathe, tube, extrude with bevel, blobs) appended into
//    the same Mesh with vertex-colour paint (iron, bronze, wax, the glowing sigils);
//  - moss: the facet kit's mossCap cushions;
//  - out: rock_facet.writeGLB (root <name>, <name>_LOD0..n, one primitive per part, COLOR_0 linear once ->
//    core/assets.js SCULPT_VC_OK), the manifest fragment and a CPU preview sheet.
// The game merges the pieces per material into the site's meshes (gameplay/wilds-pages.js) or skins them (combat golem).
import * as THREE from 'three';
import path from 'node:path';
import {
  ROOT, prng, fbm, plane, planeD, norm, add, sub, mul, dot, cross, ss, clamp, hex, toLin, bevelPiece, emitPiece, mossCap,
  stonePaint, hullPlanes, FLOOR, Mesh, xform, writeGLB, writeFragment, previewSheet,
} from './rock_facet.mjs';

export { THREE, ROOT, prng, fbm, plane, planeD, norm, add, sub, mul, dot, cross, ss, clamp, hex, toLin, bevelPiece, emitPiece, mossCap, stonePaint, hullPlanes, FLOOR, Mesh, xform };

/** material families (glTF material = `${name}_${surface}`; the game keys on the name) */
export const PARTS = {
  stone: { name: 'Stone', surface: 'stone', look: { rim: 0.22, wrap: 0.3 } },
  moss: { name: 'Moss', surface: 'none', look: { rim: 0.3, wrap: 0.5 } },
  iron: { name: 'Iron', surface: 'metal', look: { spec: 0.5, specPower: 40, rim: 0.35 } },
  bronze: { name: 'Bronze', surface: 'metal', look: { spec: 0.6, specPower: 36, rim: 0.4 } },
  wax: { name: 'Wax', surface: 'none', look: { wrap: 0.6, rim: 0.3 } },
  wood: { name: 'Wood', surface: 'wood', look: { rim: 0.25 } },
  glow: { name: 'Glow', surface: 'none' },
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const col = (h) => hex(typeof h === 'string' ? parseInt(h.slice(1), 16) : h);

// ------------------------------------------------------------------------------------------------------ stone pieces
/** the LOD being built: above 0, pieces drop their corner facets and the bevels of short edges (< 0.12 m) */
export const LOD = { cur: 0 };
export const setLod = (l) => { LOD.cur = l; };
/** emit a bevelled convex piece (half-spaces) into `mesh` through an optional transform; returns the piece */
export function piece(mesh, planes, { bevel = 0.02, paint, part = 'stone', xf = null, minAngle = 0.2, corners = true, skip, tag = null } = {}) {
  // the facet kit clips from a +-6 m box: a piece reaching past it is built about its own middle and moved back
  let c = null;
  {
    const ys = planes.filter((q) => Math.abs(q.n[1]) > 0.99).map((q) => q.d / q.n[1]);
    if (ys.some((y) => Math.abs(y) > 5.5) && ys.length >= 2) { const m = (Math.min(...ys) + Math.max(...ys)) / 2; c = [0, m, 0]; planes = planes.map((q) => ({ ...q, d: q.d - q.n[1] * m })); }
  }
  const W0 = typeof bevel === 'function' ? bevel : (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bevel * 0.8 : bevel);
  const W1 = LOD.cur > 0 ? (e) => (e.corner || e.len < 0.12 ? 0 : W0(e)) : W0;
  const W = c ? (e) => W1({ ...e, a: add(e.a, c), b: add(e.b, c), mid: add(e.mid, c) }) : W1;
  const p = bevelPiece(planes, W, { minAngle, corners: corners && LOD.cur === 0 });
  if (!p.faces.length) return p;
  const m = xf || c ? new Mesh() : mesh;
  const paint0 = paint || stonePaint();
  emitPiece(m, p, c ? (q) => paint0({ ...q, p: add(q.p, c) }) : paint0, { part, tag, ...(skip ? { skip } : {}) });
  if (c) for (let i = 1; i < m.pos.length; i += 3) m.pos[i] += c[1];
  if (c) p.planes = p.planes.map((q) => ({ ...q, d: q.d + q.n[1] * c[1] }));
  if (xf || c) mesh.append(m, xf);
  return p;
}
/** the half-spaces of an axis box [x0, y0, z0, x1, y1, z1] (+ extra planes); `floor`: the bottom face is buried (dropped) */
export function boxPlanes([x0, y0, z0, x1, y1, z1], { floor = false, extra = [] } = {}) {
  return [
    planeD([1, 0, 0], x1), planeD([-1, 0, 0], -x0), planeD([0, 1, 0], y1), floor ? planeD([0, -1, 0], -y0, 'floor') : planeD([0, -1, 0], -y0),
    planeD([0, 0, 1], z1), planeD([0, 0, -1], -z0), ...extra,
  ];
}
/** an n-sided prism about Y from y0 (radius r0) to y1 (radius r1), first side facing +Z rotated by `rot` (deg) */
export function prismPlanes(n, r0, r1, y0, y1, { rot = 0, floor = false, cx = 0, cz = 0, extra = [] } = {}) {
  const out = [];
  const slope = (r0 - r1) / Math.max(1e-6, y1 - y0);
  for (let i = 0; i < n; i++) {
    const a = (rot + (i * 360) / n) * Math.PI / 180, nn = norm([Math.sin(a), slope, Math.cos(a)]);
    out.push(plane(nn, [cx + Math.sin(a) * r0, y0, cz + Math.cos(a) * r0]));
  }
  out.push(planeD([0, 1, 0], y1), floor ? planeD([0, -1, 0], -y0, 'floor') : planeD([0, -1, 0], -y0));
  return [...out, ...extra];
}

/** a block of a ring wall about (cx, cz): azimuths a0..a1 (deg, from +Z toward +X), radii rIn..rOut, y0..y1; `gap` m of
 *  joint on each side; outer and inner faces are planes at the middle azimuth (a coursed, faceted wall) */
export function ringBlockPlanes(a0, a1, rIn, rOut, y0, y1, { gap = 0.006, cx = 0, cz = 0, floor = false, lean = 0, extra = [] } = {}) {
  const r = (d) => d * Math.PI / 180, am = r((a0 + a1) / 2), dir = (a) => [Math.sin(a), 0, Math.cos(a)];
  const m = dir(am), c = [cx, 0, cz];
  const side = (a, s) => { const t = [Math.cos(a) * s, 0, -Math.sin(a) * s]; return planeD(t, t[0] * cx + t[2] * cz - gap); };
  const out = [
    plane(norm([m[0], lean, m[2]]), [cx + m[0] * rOut, y0, cz + m[2] * rOut]), plane([-m[0], 0, -m[2]], [cx + m[0] * rIn, 0, cz + m[2] * rIn]),
    side(r(a0), -1), side(r(a1), 1),
    planeD([0, 1, 0], y1), floor ? planeD([0, -1, 0], -y0, 'floor') : planeD([0, -1, 0], -y0),
  ];
  void c;
  return [...out, ...extra];
}
/** a thin curved sheet with thickness: f(u, v) -> [x, y, z] for u, v in 0..1 (u along, v across); both faces + the rim */
export function sheetGeo(f, nu, nv, thick) {
  const P = [], idx = [];
  const at = (u, v) => f(u, v);
  const nrm = (u, v) => { const e = 1e-3, a = at(u, v), du = sub(at(Math.min(1, u + e), v), at(Math.max(0, u - e), v)), dv = sub(at(u, Math.min(1, v + e)), at(u, Math.max(0, v - e))); const n = cross(du, dv); return Math.hypot(...n) < 1e-12 ? [0, 0, 1] : norm(n); };
  const grid = (sgn) => {
    const base = P.length / 3;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const u = i / nu, v = j / nv, p = at(u, v), n = nrm(u, v), t = (thick(u, v) / 2) * sgn; P.push(p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t); }
    return base;
  };
  const A = grid(1), B = grid(-1), id = (b, i, j) => b + i * (nv + 1) + j;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    idx.push(id(A, i, j), id(A, i + 1, j), id(A, i + 1, j + 1), id(A, i, j), id(A, i + 1, j + 1), id(A, i, j + 1));
    idx.push(id(B, i, j), id(B, i + 1, j + 1), id(B, i + 1, j), id(B, i, j), id(B, i, j + 1), id(B, i + 1, j + 1));
  }
  // rim: the four borders stitched between the two faces
  const edge = (list) => { for (let k = 0; k + 1 < list.length; k++) { const [i0, j0] = list[k], [i1, j1] = list[k + 1]; idx.push(id(A, i0, j0), id(B, i0, j0), id(B, i1, j1), id(A, i0, j0), id(B, i1, j1), id(A, i1, j1)); } };
  const L = []; for (let i = 0; i <= nu; i++) L.push([i, 0]); edge(L);
  const R = []; for (let i = nu; i >= 0; i--) R.push([i, nv]); edge(R);
  const T = []; for (let j = 0; j <= nv; j++) T.push([nu, j]); edge(T);
  const Bt = []; for (let j = nv; j >= 0; j--) Bt.push([0, j]); edge(Bt);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------- three.js geometry
/**
 * Append a three BufferGeometry: paint(c) -> sRGB [r, g, b] with c = { p, n, fn, kind: 'face', chamfer: 0, piece: tag,
 * u, v } (uv when the generator has one). xf: rock_facet xform or a THREE.Matrix4. flat: face normals.
 */
export function addGeo(mesh, geo, { paint, part = 'stone', xf = null, matrix = null, tag = null, flat = false } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (matrix) { g = g.clone(); g.applyMatrix4(matrix); }
  if (flat || !g.attributes.normal) g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
  // weld: one vertex per (position, normal, colour, part) within this geometry (generators emit unshared triangles)
  const weld = new Map(), q = (v, k) => Math.round(v * k);
  const vert = (p, n, c, pt) => {
    const key = q(p[0], 1e5) + ',' + q(p[1], 1e5) + ',' + q(p[2], 1e5) + ',' + q(n[0], 500) + ',' + q(n[1], 500) + ',' + q(n[2], 500) + ',' + q(c[0], 400) + ',' + q(c[1], 400) + ',' + q(c[2], 400) + pt;
    let id = weld.get(key);
    if (id === undefined) { id = mesh.v(p, n, c, pt); weld.set(key, id); }
    return id;
  };
  for (let i = 0; i + 2 < P.count; i += 3) {
    const ids = [];
    const a = [P.getX(i), P.getY(i), P.getZ(i)], b = [P.getX(i + 1), P.getY(i + 1), P.getZ(i + 1)], c3 = [P.getX(i + 2), P.getY(i + 2), P.getZ(i + 2)];
    let fn = cross(sub(b, a), sub(c3, a));
    if (Math.hypot(...fn) < 1e-12) continue;
    fn = norm(fn);
    for (let k = 0; k < 3; k++) {
      let p = [P.getX(i + k), P.getY(i + k), P.getZ(i + k)], n = flat ? fn : [N.getX(i + k), N.getY(i + k), N.getZ(i + k)];
      let f = fn;
      if (xf) { p = xf.p(p); n = xf.n(n); f = xf.n(fn); }
      const srgb = paint({ p, n, fn: f, kind: 'face', chamfer: 0, piece: tag, u: UV ? UV.getX(i + k) : 0, v: UV ? UV.getY(i + k) : 0 });
      ids.push(vert(p, n, srgb.map(toLin), part));
    }
    if (ids[0] !== ids[1] && ids[1] !== ids[2] && ids[0] !== ids[2]) mesh.tri(ids[0], ids[1], ids[2]);
  }
  return mesh;
}
/** surface of revolution: profile [[r, y], ...] about Y (open: no caps unless the profile touches the axis) */
export const lathe = (profile, segs = 16, phi0 = 0, phiLen = Math.PI * 2) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), segs, phi0, phiLen);
/** a tube along points [[x, y, z], ...] (Catmull-Rom), radius r */
export const tube = (points, r, { seg = 24, radial = 8, closed = false, tension = 0.5 } = {}) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', tension), seg, r, radial, closed);
/** a 2D shape (THREE.Shape in XY) pushed out along +Z by `depth` from z = 0, bevelled `bevel` m round its edge */
export function extrude(shape, depth, { bevel = 0.006, seg = 2, curve = 14 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: curve, steps: 1 });
  g.translate(0, 0, bevel);
  return g;
}
/** an ellipsoid blob */
export const blob = ([x, y, z], [rx, ry, rz], { w = 10, h = 7 } = {}) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).translate(x, y, z);
/** a Matrix4 from position / Euler (rad, XYZ) / scale */
export function mat4(at = [0, 0, 0], rot = [0, 0, 0], s = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])), new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])));
  return m;
}
/** annulus shape (outer R, inner r) */
export function ring2(R, r, n = 48) { const s = new THREE.Shape(); s.absarc(0, 0, R, 0, Math.PI * 2, false); const h = new THREE.Path(); h.absarc(0, 0, r, 0, Math.PI * 2, true); s.holes.push(h); void n; return s; }
/** polygon shape from [[x, y], ...] */
export function poly2(pts, holes = []) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); s.closePath();
  for (const hp of holes) { const h = new THREE.Path(); h.moveTo(hp[0][0], hp[0][1]); for (const p of hp.slice(1)) h.lineTo(p[0], p[1]); h.closePath(); s.holes.push(h); }
  return s;
}

// ------------------------------------------------------------------------------------------------------------ paint
/** carved stone: the facet kit's value story (bleached top, pale worn edges, damp foot) + lichen and rain streaks */
export function carvedStone({ H = 2, seed = 1, warm = 0.35, base = 0.7, tint = [1, 1, 1], lichen = 0.5, streak = 0.5, westX = -1, chip = null } = {}) {
  const sp = stonePaint({ H, seed, warm, base });
  const lc = col('#b7b46e'), ld = col('#7d8a52'), st = col('#6c665e'), fresh = col('#e3ddd0');
  return (c) => {
    let v = sp(c);
    v = [v[0] * tint[0], v[1] * tint[1], v[2] * tint[2]];
    const { p, n } = c;
    // rain streaks: vertical, under overhangs and tops, on side faces
    const s = ss(0.62, 0.86, 0.5 + 0.5 * fbm(p[0] * 9 + seed, p[1] * 0.7, p[2] * 9, seed + 21, 2)) * ss(0.55, 0.15, Math.abs(n[1])) * streak;
    v = mixc(v, mul(st, 1.05), s * 0.35);
    // lichen crusts on the weather side (local -X) and the tops
    const w = ss(-0.2, 0.7, n[0] * westX + 0.4 * n[1]);
    const l = ss(0.58, 0.72, 0.5 + 0.5 * fbm(p[0] * 7, p[1] * 7, p[2] * 7, seed + 33, 3)) * w * lichen;
    v = mixc(v, mixc(lc, ld, 0.5 + 0.5 * fbm(p[0] * 30, p[1] * 30, p[2] * 30, seed, 1)), l * 0.7);
    if (chip && c.piece === 'chip') v = mixc(v, fresh, 0.5);
    return v;
  };
}
/** wrought iron: dark, rust in hollows and low, pale on worn edges facing up */
export function ironPaint({ seed = 3, rust = 0.5 } = {}) {
  const a = col('#4a4846'), b = col('#5e5b58'), r = col('#8a5232');
  return (c) => {
    const { p, n } = c;
    let v = mixc(a, b, 0.5 + 0.5 * fbm(p[0] * 14, p[1] * 14, p[2] * 14, seed, 2));
    v = mixc(v, r, rust * ss(0.55, 0.8, 0.5 + 0.5 * fbm(p[0] * 6, p[1] * 3, p[2] * 6, seed + 5, 3)) * (0.5 + 0.5 * ss(0.6, 0, p[1])));
    return mixc(v, col('#8c8a86'), ss(0.6, 1, n[1]) * 0.2);
  };
}
/** old bronze / copper: warm metal with verdigris on the up-facing and sheltered parts */
export function bronzePaint({ seed = 4, green = 0.5, metal = '#a8743e', dark = '#6e4a2a', verd = '#6fae94' } = {}) {
  return (c) => {
    const { p, n } = c;
    let v = mixc(col(metal), col(dark), 0.5 + 0.5 * fbm(p[0] * 10, p[1] * 10, p[2] * 10, seed, 2));
    const g = green * ss(0.45, 0.7, 0.5 + 0.5 * fbm(p[0] * 8, p[1] * 8, p[2] * 8, seed + 9, 3) + 0.25 * n[1]);
    v = mixc(v, col(verd), clamp(g, 0, 1) * 0.8);
    return mixc(v, col('#e8c48a'), ss(0.75, 1, Math.abs(n[0]) * 0.6 + n[1] * 0.5) * 0.25);
  };
}
export const flat = (h, k = 0) => () => (k ? mul(col(h), 1 + k) : col(h));

// ----------------------------------------------------------------------------------------------------------- output
/**
 * Write one asset: lods = [Mesh, ...] (LOD0 first), parts used from PARTS. Returns { tris, kb }; writes the fragment.
 */
export async function writeAsset(name, lods, { notes, source, parts = PARTS, extras = {} } = {}) {
  const used = {};
  for (const m of lods) for (const pt of new Set(m.part)) if (parts[pt]) used[pt] = parts[pt];
  const res = await writeGLB(path.join(ROOT, 'assets/models/sculpt', name + '.glb'), name, lods, used, extras);
  const b = lods[0].bounds();
  writeFragment(name, { size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]], tris: res.tris, parts: used, notes, source });
  return { ...res, bounds: b };
}
export async function sheet(name, items, opts) {
  await previewSheet(path.join(ROOT, '.tmp/sculpt', name, 'sheet.png'), name.toUpperCase(), items, opts);
}
