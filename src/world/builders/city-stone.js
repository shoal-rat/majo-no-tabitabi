// Carved stonework and cloth of the City of Magic's great gate and its towers (art pass "modelled, not painted"):
// wedge voussoirs with dressed arrises, moulded string courses and impost blocks, corbel tables and machicolations,
// capped merlons, cruciform arrow slits in stone surrounds, pointed lancets, spires laid in courses, and banners that
// hang in real folds. Everything is plain geometry in the site's own materials, merged by the site bake.
import * as THREE from 'three';
import { clothify } from './kit.js';
import { GeoBuilder, frontRing, fixWinding } from './city-geo.js';

/**
 * Wedge voussoirs round an arch centred (cx, cy) in a wall face at z = zf (facing +z): n stones from angle a0 to a1,
 * intrados radius r0, extrados r1 (alternate stones longer and prouder: a stepped extrados), the middle one a keystone.
 * mats(i) -> GeoBuilder for stone i (keystone: i === -1).
 */
export function voussoirs(get, cx, cy, zf, r0, r1, n, { a0 = 0, a1 = Math.PI, sink = 0.3, proud = 0.3, alt = 0.08, key = 0.4, b = 0.05, back = false } = {}) {
  const mid = n % 2 ? (n - 1) / 2 : -1;
  for (let i = 0; i < n; i++) {
    const ta = a0 + ((a1 - a0) * i) / n, tb = a0 + ((a1 - a0) * (i + 1)) / n;
    const isKey = i === mid, odd = i % 2 === 1;
    const ro = isKey ? r1 + key : r1 + (odd ? alt * 2 : 0);
    const pr = isKey ? proud + 0.18 : proud + (odd ? alt : 0);
    const kb = isKey ? 0.06 : 0;
    const poly = [
      [cx + Math.cos(ta) * r0, cy + Math.sin(ta) * r0],
      [cx + Math.cos(ta - kb) * ro, cy + Math.sin(ta - kb) * ro],
      [cx + Math.cos(tb + kb) * ro, cy + Math.sin(tb + kb) * ro],
      [cx + Math.cos(tb) * r0, cy + Math.sin(tb) * r0]
    ];
    get(isKey ? -1 : i).prismBevel(poly, zf - sink, zf + pr, b * (isKey ? 1.6 : 1), back);
  }
}

/**
 * A moulding run along x (x0..x1) on a wall face at z = zf facing +z, its foot at y: profile [[out, up], ...] from the
 * wall at the bottom round to the wall at the top (convex). String courses, imposts, cornices.
 */
export function mouldX(b, profile, x0, x1, y, zf) {
  const P = profile.map(([o, u]) => [o + zf, u + y]);
  for (let k = 0; k < P.length - 1; k++) {
    const [z0, y0] = P[k], [z1, y1] = P[k + 1], dz = z1 - z0, dy = y1 - y0;
    b.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1], [0, -dz, dy]);
  }
  for (const [x, s] of [[x0, -1], [x1, 1]]) for (let k = 1; k < P.length - 1; k++) b.tri([x, P[0][1], P[0][0]], [x, P[k][1], P[k][0]], [x, P[k + 1][1], P[k + 1][0]], [s, 0, 0]);
}
/** The same profile turned round a tower of radius r (its foot at y). */
export function mouldRing(b, profile, r, y, seg = 20) {
  b.lathe(profile.map(([o, u]) => [r + o, y + u]), seg, 0, 0, 0, 0, 0, true);
}
export const STRING = [[0, 0], [0.1, 0.05], [0.2, 0.08], [0.24, 0.16], [0.24, 0.3], [0.17, 0.36], [0, 0.42]];
export const IMPOST = [[0, 0], [0.16, 0.06], [0.26, 0.18], [0.3, 0.34], [0.3, 0.52], [0, 0.6]];
export const PLINTH = [[0, 0], [0.35, 0], [0.35, 0.3], [0.2, 0.42], [0.12, 0.62], [0, 0.66]];

/** A corbel of three stepped stones under a parapet, on a wall face at z = zf facing +z, its top at y. */
export function corbel(b, x, y, zf, w = 0.55, depth = 0.7) {
  const st = [[w, 0.32, depth], [w * 0.88, 0.3, depth * 0.66], [w * 0.74, 0.28, depth * 0.34]];
  let yy = y;
  for (const [cw, ch, cd] of st) {
    b.slab(x - cw / 2, yy - ch, zf - 0.05, x + cw / 2, yy, zf + cd, 0.025, false);
    yy -= ch;
  }
}

/** Merlon with a chamfered coping cap (and, if slit, a dark loop in its face), centred x, foot at y, on z0..z1. */
export function merlon(stone, cap, dark, x, y, w, h, z0, z1, slit = false) {
  stone.box(x - w / 2, y, z0, x + w / 2, y + h, z1, 'ny');
  cap.slab(x - w / 2 - 0.06, y + h, z0 - 0.06, x + w / 2 + 0.06, y + h + 0.2, z1 + 0.06, 0.05, false);
  if (slit && dark) {
    dark.quad([x - 0.06, y + h * 0.25, z1 + 0.006], [x + 0.06, y + h * 0.25, z1 + 0.006], [x + 0.06, y + h * 0.8, z1 + 0.006], [x - 0.06, y + h * 0.8, z1 + 0.006], [0, 0, 1]);
  }
}

/**
 * Cruciform arrow slit in a stone surround on a wall at z = 0 facing +z (centre x, y, slit height h): the stone frame
 * into `stone`, the dark loop into `dark` (built facing +z; turn it with a matrix for round towers).
 */
export function arrowSlit(stone, dark, x, y, h) {
  const z = 0.012;
  const q = (x0, y0, x1, y1) => dark.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1]);
  q(x - 0.06, y - h / 2, x + 0.06, y + h / 2);
  q(x - 0.26, y + h * 0.08, x + 0.26, y + h * 0.08 + 0.1);
  q(x - 0.1, y - h / 2 - 0.02, x + 0.1, y - h / 2 + 0.16);
  const pts = [[x - 0.14, y - h / 2 - 0.12, -1, 0], [x - 0.14, y + h / 2, -1, 1], [x + 0.14, y + h / 2, 1, 1], [x + 0.14, y - h / 2 - 0.12, 1, 0]];
  const from = stone.tris;
  frontRing(stone, pts, 0.09, 0.004, 0.0, [0.14, 0.05]);
  fixWinding(stone, from);
  stone.slab(x - 0.36, y - h / 2 - 0.28, -0.02, x + 0.36, y - h / 2 - 0.12, 0.16, 0.03, false);
}

/** Pointed-arch outline points [x, y, mitre x, mitre y] of an opening w wide, h tall (equilateral head), foot at (x, y). */
export function pointedOutline(x, y, w, h, n = 5) {
  const rise = w * 0.866,
    spring = y + Math.max(0.1, h - rise),
    pts = [[x - w / 2, y, -1, 0], [x - w / 2, spring, -1, 0]];
  const arc = (i) => Math.PI - (Math.PI / 3) * (i / n);
  for (let i = 1; i < n; i++) pts.push([x + w / 2 + Math.cos(arc(i)) * w, spring + Math.sin(arc(i)) * w, Math.cos(arc(i)), Math.sin(arc(i))]);
  pts.push([x, spring + rise, 0, 1.155]);
  for (let i = n - 1; i >= 1; i--) pts.push([x - w / 2 - Math.cos(arc(i)) * w, spring + Math.sin(arc(i)) * w, -Math.cos(arc(i)), Math.sin(arc(i))]);
  pts.push([x + w / 2, spring, 1, 0], [x + w / 2, y, 1, 0]);
  return pts;
}
/** A lancet window (pointed head) on a wall at z = 0 facing +z: moulded surround into stone, glass into dark. */
export function lancet(stone, dark, x, y, w, h, frame = 0.22, mullion = true) {
  const pts = pointedOutline(x, y, w, h);
  const from = stone.tris;
  frontRing(stone, pts, 0.16, 0.004, 0.0, [frame, 0.08]);
  fixWinding(stone, from);
  const c = [x, y + h * 0.45, 0.01];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    dark.tri(c, [p[0], p[1], 0.01], [q[0], q[1], 0.01], [0, 0, 1]);
  }
  if (mullion) stone.box(x - 0.06, y, 0.0, x + 0.06, y + h - w * 0.5, 0.1, 'nz');
  stone.slab(x - w / 2 - frame - 0.1, y - 0.22, -0.02, x + w / 2 + frame + 0.1, y, 0.24, 0.03, false);
}

/**
 * A spire laid in courses (lathe): base radius r, height h, course height c, its eave flared out like a bell;
 * hard-edged so every course's lip throws a line. Foot at y.
 */
export function coursedSpire(b, r, h, c, y = 0, seg = 16, flare = 0.25) {
  const n = Math.max(4, Math.round(h / c)), prof = [];
  const rad = (t) => r * (1 - t) + (t < 0.12 ? flare * (1 - t / 0.12) ** 2 : 0);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, lip = 0.06 * (1 - t0 * 0.7);
    prof.push([rad(t0) + lip, y + t0 * h], [Math.max(0.001, rad(t1)), y + t1 * h]);
  }
  prof.push([0, y + h]);
  b.lathe(prof, seg, 0, 0, 0, 1, Math.PI / seg, true);
}

/**
 * Banner of width w hanging h from its top edge at (0, 0, 0) in real folds (pleats deepening toward a swallow-tailed
 * foot), with uv for the cloth sway (kit.js clothify: uv.y = 1 at the hem it hangs from). Returns { cloth, hem }:
 * geometries for the cloth and its gold edging.
 */
export function bannerGeometry(w, h, folds = 4) {
  const nx = folds * 2 + 1, ny = 10, P = [], U = [], I = [];
  const fold = (u, v) => (0.03 + 0.13 * v) * Math.cos(u * folds * Math.PI * 2 + 0.6);
  const ys = (u, v) => -v * h + (v > 0.999 ? h * 0.12 * (1 - Math.abs(u * 2 - 1)) : 0);
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i < nx * 2; i++) {
      const u = i / (nx * 2 - 1), v = j / ny;
      P.push(-w / 2 + u * w * (1 - 0.06 * v), ys(u, v), fold(u, v));
      U.push(u, 1 - v);
    }
  const row = nx * 2;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      I.push(a, c, b, b, c, d);
    }
  const cloth = new THREE.BufferGeometry();
  cloth.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  cloth.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  cloth.setIndex(I);
  cloth.computeVertexNormals();
  // gold edging: strips along both sides and the swallow-tail foot, lifted a hair off the cloth
  const E = [], EU = [], EI = [];
  const strip = (pts) => {
    const base = E.length / 3;
    for (const [x, y, z, v, dx, dy] of pts) {
      E.push(x, y, z + 0.012, x + dx, y + dy, z + 0.012);
      EU.push(0.5, v, 0.5, v);
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = base + k * 2;
      EI.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  const at = (u, v) => [-w / 2 + u * w * (1 - 0.06 * v), ys(u, v), fold(u, v)];
  for (const [u, dx] of [[0, 0.14], [1, -0.14]]) {
    const pts = [];
    for (let j = 0; j <= ny; j++) { const v = j / ny, p = at(u, v); pts.push([p[0], p[1], p[2], 1 - v, dx, 0]); }
    strip(pts);
  }
  const foot = [];
  for (let i = 0; i < row; i++) { const u = i / (row - 1), p = at(u, 1); foot.push([p[0], p[1], p[2], 0, 0, 0.16]); }
  strip(foot);
  // an embroidered device at the breast: a gold lozenge in a ring of eight points
  const v0 = 0.34, R0 = w * 0.2, base = E.length / 3;
  const onCloth = (dx, dy) => {
    const v = v0 - dy / h, p = at(0.5 + dx / (w * (1 - 0.06 * v)), v);
    E.push(p[0], p[1], p[2] + 0.05);
    EU.push(0.5, 1 - v);
  };
  onCloth(0, 0);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, r = k % 2 ? R0 * 0.55 : R0;
    onCloth(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let k = 0; k < 16; k++) EI.push(base, base + 1 + k, base + 1 + ((k + 1) % 16));
  const hem = new THREE.BufferGeometry();
  hem.setAttribute('position', new THREE.Float32BufferAttribute(E, 3));
  hem.setAttribute('uv', new THREE.Float32BufferAttribute(EU, 2));
  hem.setIndex(EI);
  hem.computeVertexNormals();
  return { cloth, hem };
}
/** Hang a pleated banner (cloth in `m`, edging in `edge`) from an iron rod with finials; top edge at (x, y, z). */
export function hangBanner(g, x, y, z, w, h, m, edge, rodM, finialM) {
  const { cloth, hem } = bannerGeometry(w, h);
  const cm = clothify(m, 0.22), em = clothify(edge, 0.22);
  for (const mm of [cm, em]) if (mm.side !== THREE.DoubleSide) mm.side = THREE.DoubleSide;
  const a = new THREE.Mesh(cloth, cm), e = new THREE.Mesh(hem, em);
  for (const o of [a, e]) {
    o.position.set(x, y, z + 0.18);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
  const b = new GeoBuilder();
  b.tube([[x - w / 2 - 0.35, y + 0.08, z + 0.18], [x + w / 2 + 0.35, y + 0.08, z + 0.18]], 0.07, 6, true);
  b.mesh(rodM, g);
  const f = new GeoBuilder();
  for (const s of [-1, 1]) f.lathe([[0.001, -0.14], [0.12, -0.06], [0.1, 0.04], [0.04, 0.1], [0.06, 0.18], [0.001, 0.3]], 8, x + s * (w / 2 + 0.45), y + 0.08, z + 0.18);
  f.mesh(finialM, g);
}

// ---------------------------------------------------------------- the cathedral's tracery
/**
 * Outline of mage-city.js pointedArch(w, h) (straight jambs to 0.62 h, then two quadratic curves to the apex), as
 * frontRing points [x, y, mitre x, mitre y], foot centre at (0, 0).
 */
export function archOutline(w, h, n = 5) {
  const P0 = [-w / 2, h * 0.62], P1 = [-w * 0.46, h * 0.88], P2 = [0, h];
  const bez = (t) => [(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]];
  const tan = (t) => [2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1])];
  const left = [[-w / 2, 0, -1, 0], [-w / 2, h * 0.62, -1, 0]];
  for (let i = 1; i < n; i++) {
    const t = i / n, [x, y] = bez(t), [tx, ty] = tan(t), l = Math.hypot(tx, ty);
    left.push([x, y, -ty / l, tx / l]);
  }
  const [ax, ay] = tan(1), al = Math.hypot(ax, ay), nl = [-ay / al, ax / al], k = 1 / Math.max(0.3, nl[1]);
  const pts = [...left, [0, h, 0, k]];
  for (let i = left.length - 1; i >= 0; i--) pts.push([-left[i][0], left[i][1], -left[i][2], left[i][3]]);
  return pts;
}
/**
 * Moulded frame round a pointedArch() opening of w x h whose glass front sits at (x, y, z) in group g: surround with a
 * chamfer and reveal, a mullion and a foiled oculus in the head when the light is wide enough.
 */
export function archFrame(g, stoneM, x, y, z, w, h, frame = 0.16) {
  const b = new GeoBuilder(), pts = archOutline(w, h);
  frontRing(b, pts, 0.13, -0.05, 0.0, [frame, 0.05]);
  fixWinding(b, 0);
  if (w >= 1.3) {
    b.box(-0.05, 0, 0, 0.05, h * 0.66, 0.08, 'nz');
    const r = w * 0.17, cy = h * 0.62 + (h * 0.38) * 0.42, ring = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; ring.push([Math.cos(a) * r, cy + Math.sin(a) * r, 0.04]); }
    b.tube(ring, 0.045, 5);
    b.box(-0.05, h * 0.62, 0, 0.05, cy - r, 0.08, 'nz');
  }
  const m = b.mesh(stoneM, g);
  m.position.set(x, y, z);
  return m;
}
/** Archivolt: a round moulding (tube) following a pointedArch outline of w x h, foot centre (x, y, z), in g. */
export function archivolt(b, x, y, z, w, h, r) {
  const pts = archOutline(w, h, 8).map(([px, py]) => [x + px, y + py, z]);
  b.tube(pts, r, 6, true);
}
/**
 * Stone tracery in front of a rose window of radius R centred (x, y, z) facing +z: a moulded outer ring, twelve
 * colonnette spokes, a foil between each pair, an inner ring with six small foils, a boss.
 */
export function roseTracery(b, x, y, z, R, lite = false) {
  const circle = (cx, cy, r, n) => { const p = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; p.push([x + cx + Math.cos(a) * r, y + cy + Math.sin(a) * r, z]); } return p; };
  b.tube(circle(0, 0, R * 1.04, 40), R * 0.1, 6);
  b.tube(circle(0, 0, R * 0.96, 40), R * 0.035, 5);
  b.tube(circle(0, 0, R * 0.4, 24), R * 0.045, 5);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    b.tube([[x + c * R * 0.43, y + s * R * 0.43, z], [x + c * R * 0.95, y + s * R * 0.95, z]], R * 0.026, 5);
    if (lite) continue;
    const m = a + Math.PI / 12;
    b.tube(circle(Math.cos(m) * R * 0.72, Math.sin(m) * R * 0.72, R * 0.15, 14), R * 0.02, 4);
    if (i % 2 === 0) b.tube(circle(Math.cos(a) * R * 0.25, Math.sin(a) * R * 0.25, R * 0.1, 10), R * 0.018, 4);
  }
  const boss = new GeoBuilder();
  boss.lathe([[0.001, -R * 0.02], [R * 0.09, 0], [R * 0.06, R * 0.06], [0.001, R * 0.08]], 8);
  b.append(boss, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, y, z));
}
