// Hand-modelled parts for the hometown houses and the story rooms (art round "home", 2026-11): chamfered timbers and
// dressed stones, windows set back behind real surrounds with sills, sashes, shutters and flower boxes, plank doors in
// framed openings with a doorstep, tiled roofs laid course by course (barrel rolls or slates) with ridge rolls, deep
// eaves on rafter tails, barge boards and chimneys. Form comes from bevels and modelled relief, not from painted
// detail: every part is plain geometry in the caller's group (front = +z, y up), and the site bake merges it per
// material; colour variants of one surface collapse into one draw call (kit.js collapseFamilies).
// Detail scales with G.quality (homeDetail(): 0 phones / low, 1 med, 2 high): louvres, glazing bars, tile segments,
// plinth courses and flower counts drop on the lower tiers; silhouettes stay the same.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { bevelBox } from './kit.js';

/** 0 = phones / low, 1 = med, 2 = high. */
export function homeDetail() {
  const q = G.quality || {};
  return q.mobile || q.name === 'low' ? 0 : q.name === 'med' ? 1 : 2;
}
function mesh(geo, m) { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; return o; }
/** kit bevelBox (worn top arrises) above the phone tier, a plain box on it. */
export function stone(w, h, d, m, x, y, z, b = 0.03) { return homeDetail() === 0 ? slab(w, h, d, m, x, y, z) : bevelBox(w, h, d, m, x, y, z, b); }

// ---------------------------------------------------------------------------------------------------------------
// Chamfered box: every edge cut by b (6 faces + 12 bevels + 8 corners = 44 triangles, flat normals), so arrises
// catch a line of light the way a planed beam or a dressed stone does. Cached per size.
const _cg = new Map();
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _c = new THREE.Vector3();
export function chamferGeo(w, h, d, b = 0.02) {
  const bb = Math.max(0.002, Math.min(b, w * 0.3, h * 0.3, d * 0.3));
  const key = w.toFixed(3) + ',' + h.toFixed(3) + ',' + d.toFixed(3) + ',' + bb.toFixed(3);
  let g = _cg.get(key);
  if (g) return g;
  const X = w / 2, Y = h / 2, Z = d / 2;
  // corner (sx,sy,sz) seen from face f (0 = x, 1 = y, 2 = z): pulled in by bb along the other two axes
  const V = (sx, sy, sz, f) => (f === 0 ? [sx * X, sy * (Y - bb), sz * (Z - bb)] : f === 1 ? [sx * (X - bb), sy * Y, sz * (Z - bb)] : [sx * (X - bb), sy * (Y - bb), sz * Z]);
  const S = [-1, 1], polys = [];
  for (const s of S) {
    polys.push([V(s, -1, -1, 0), V(s, 1, -1, 0), V(s, 1, 1, 0), V(s, -1, 1, 0)]);
    polys.push([V(-1, s, -1, 1), V(1, s, -1, 1), V(1, s, 1, 1), V(-1, s, 1, 1)]);
    polys.push([V(-1, -1, s, 2), V(1, -1, s, 2), V(1, 1, s, 2), V(-1, 1, s, 2)]);
  }
  for (const a of S) for (const c of S) {
    polys.push([V(-1, a, c, 1), V(1, a, c, 1), V(1, a, c, 2), V(-1, a, c, 2)]);
    polys.push([V(a, -1, c, 0), V(a, 1, c, 0), V(a, 1, c, 2), V(a, -1, c, 2)]);
    polys.push([V(a, c, -1, 0), V(a, c, 1, 0), V(a, c, 1, 1), V(a, c, -1, 1)]);
  }
  for (const sx of S) for (const sy of S) for (const sz of S) polys.push([V(sx, sy, sz, 0), V(sx, sy, sz, 1), V(sx, sy, sz, 2)]);
  const pos = [];
  for (const q of polys) {
    _a.set(...q[1]).sub(_v.set(...q[0])); _c.set(...q[2]).sub(_v); _a.cross(_c);
    let mx = 0, my = 0, mz = 0;
    for (const p of q) { mx += p[0]; my += p[1]; mz += p[2]; }
    const p = _a.x * mx + _a.y * my + _a.z * mz < 0 ? [...q].reverse() : q;
    for (let i = 1; i < p.length - 1; i++) pos.push(...p[0], ...p[i], ...p[i + 1]);
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.userData.shared = true;
  _cg.set(key, g);
  return g;
}
/** Chamfered box centred on (x, y, z); b <= 0, and every box on phones / low, gives a plain box (12 triangles). */
export function cbox(w, h, d, m, x = 0, y = 0, z = 0, b = 0.02) {
  if (b <= 0 || homeDetail() === 0) return slab(w, h, d, m, x, y, z);
  const o = mesh(chamferGeo(w, h, d, b), m);
  o.position.set(x, y, z);
  return o;
}
const _up = new THREE.Vector3(), _dir = new THREE.Vector3(), _xa = new THREE.Vector3(), _ya = new THREE.Vector3(), _mb = new THREE.Matrix4();
/**
 * Chamfered beam from (x0,y0,z0) to (x1,y1,z1): section w (across, horizontal-ish) x h (along `up`, default world y).
 * Unlike kit beam() the roll is fixed by `up`, so flat boards stay flat.
 */
export function cbeam(x0, y0, z0, x1, y1, z1, w, h, m, b = 0.018, up = null) {
  _dir.set(x1 - x0, y1 - y0, z1 - z0);
  const len = _dir.length();
  _dir.multiplyScalar(1 / len);
  if (b <= 0 || homeDetail() === 0) b = 0;
  _up.copy(up || _ya.set(0, 1, 0));
  if (Math.abs(_up.dot(_dir)) > 0.98) _up.set(1, 0, 0);
  _xa.crossVectors(_up, _dir).normalize();
  _ya.crossVectors(_dir, _xa);
  const o = b ? mesh(chamferGeo(w, h, len, b), m) : slab(w, h, len, m);
  o.quaternion.setFromRotationMatrix(_mb.makeBasis(_xa, _ya, _dir));
  o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return o;
}
/** Plain box with a rotation (tiny parts where a bevel would not read). */
const _bg = new Map();
export function slab(w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const k = w.toFixed(3) + ',' + h.toFixed(3) + ',' + d.toFixed(3);
  let g = _bg.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); g.userData.shared = true; _bg.set(k, g); }
  const o = mesh(g, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}

/**
 * Arc shell along +z from 0 to len: radius r0 at z=0 to r1 at z=len, angles a0..a1 (from +x toward +y), seg facets,
 * the far end closed by a fan (a tile's nose). Barrel tiles, ridge rolls, half-round gutters. Cached.
 */
const _arc = new Map();
export function arcGeo(r0, r1, len, a0, a1, seg, cap = true) {
  const key = [r0, r1, len, a0, a1].map((v) => v.toFixed(3)).join(',') + ',' + seg + (cap ? 'c' : '');
  let g = _arc.get(key);
  if (g) return g;
  const pos = [], P = (r, a, z) => [r * Math.cos(a), r * Math.sin(a), z];
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const A = P(r0, t0, 0), B = P(r0, t1, 0), C = P(r1, t1, len), D = P(r1, t0, len);
    pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    if (cap) pos.push(0, 0, len, ...D, ...C);
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // the cap fan's centre vertex is shared only in position: flat normals keep the nose a crisp disc
  g.userData.shared = true;
  _arc.set(key, g);
  return g;
}

/** A frame whose local axes are a roof slope: x along the ridge, y off the slope, z down the slope. */
export function slopeFrame(sgn, ridgeY, angle, z0 = 0) {
  const f = new THREE.Group();
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const D = new THREE.Vector3(sgn * ca, -sa, 0), N = new THREE.Vector3(sgn * sa, ca, 0), R = new THREE.Vector3().crossVectors(N, D);
  f.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, N, D));
  f.position.set(0, ridgeY, z0);
  return f;
}

// ---------------------------------------------------------------------------------------------------------------
// Windows. Opening w x h centred (x, y) in a wall whose face is the plane z = z0 (outside = +z). The glass sits on the
// wall face; the surround, head and sill stand proud of it, so the pane reads as set back behind a deep reveal.
// P: { surround, sash, glass, sill, shutter, iron, box, leaf, bloom: [m...] }   o: { shutters, louvre, box, keystone,
// panes: 4|6, inner (room side: casing + stool, no shutters), lv, seed }
export function homeWindow(g, P, x, y, z0, w, h, o = {}) {
  const lv = o.lv ?? homeDetail(), sur = o.surround ?? 0.15, dep = o.depth ?? 0.14, rnd = o.rnd || Math.random;
  const fm = P.surround, k = lv ? 1 : 0;   // phones: plain boxes for the small parts
  // surround: jambs, head (with a keystone on the stone houses), sill on two little corbels
  for (const s of [-1, 1]) g.add(cbox(sur, h + 0.02, dep, fm, x + s * (w / 2 + sur / 2), y, z0 + dep / 2, 0.022));
  g.add(cbox(w + sur * 2 + 0.1, sur + 0.04, dep + 0.04, o.inner ? fm : P.head || fm, x, y + h / 2 + sur / 2 + 0.01, z0 + (dep + 0.04) / 2, 0.025));
  if (o.keystone && !o.inner) g.add(cbox(0.2, sur + 0.12, dep + 0.08, P.head || fm, x, y + h / 2 + sur / 2 + 0.03, z0 + (dep + 0.08) / 2, 0.025));
  const sillD = o.inner ? dep + 0.1 : dep + 0.17;
  g.add(stone(w + sur * 2 + 0.16, 0.085, sillD, P.sill, x, y - h / 2 - 0.0425, z0 + sillD / 2, 0.025));
  if (lv > 0 && !o.inner) for (const s of [-1, 1]) g.add(cbox(0.1, 0.13, 0.12, P.sill, x + s * (w / 2 + sur - 0.02), y - h / 2 - 0.15, z0 + 0.06, 0.015));
  if (o.inner) g.add(cbox(w + sur * 2, 0.16, 0.035, fm, x, y - h / 2 - 0.17, z0 + 0.018, 0.01)); // apron under the stool
  // glass on the wall face, then the casement: frame, mullion, transom and (high tier) glazing bars
  g.add(slab(w, h, 0.02, P.glass, x, y, z0 + 0.012));
  const sm = P.sash, zf = z0 + 0.04, fw = 0.07;
  for (const s of [-1, 1]) {
    g.add(cbox(fw, h, 0.05, sm, x + s * (w / 2 - fw / 2), y, zf, 0.012 * k));
    g.add(cbox(w, fw, 0.05, sm, x, y + s * (h / 2 - fw / 2), zf, 0.012 * k));
  }
  g.add(cbox(0.06, h - fw * 2, 0.05, sm, x, y, zf + 0.005, 0.012 * k));
  const ty = y + h * 0.2;
  g.add(cbox(w - fw * 2, 0.06, 0.05, sm, x, ty, zf + 0.005, 0.012 * k));
  if (lv >= 1 && (o.panes || 6) > 4) {
    const top = y + h / 2 - fw, bot = y - h / 2 + fw;
    for (const s of [-1, 1]) g.add(slab(0.028, ty - bot, 0.03, sm, x + s * w * 0.25, (ty + bot) / 2, zf + 0.008));
    if (lv >= 2) g.add(slab(w - fw * 2, 0.028, 0.03, sm, x, (ty + bot) / 2, zf + 0.008));
    if (top - ty > 0.5) for (const s of [-1, 1]) g.add(slab(0.028, top - ty, 0.03, sm, x + s * w * 0.25, (ty + top) / 2, zf + 0.008));
  }
  if (o.shutters && !o.inner) {
    const sw = w / 2 + 0.03;
    for (const s of [-1, 1]) shutter(g, P, x + s * (w / 2 + sur + 0.03 + sw / 2), y, z0 + 0.03, sw, h + 0.04, s, o.louvre, lv);
  }
  if (o.box && !o.inner) flowerBox(g, P, x, y - h / 2 + 0.005, z0 + dep + 0.04, w + 0.18, lv, rnd);   // sits on the sill
}
/** One shutter leaf, opened back flat against the wall; `side` = -1 left of the window, +1 right. */
function shutter(g, P, x, y, z, sw, sh, side, louvre, lv) {
  const m = P.shutter, t = 0.05, b = lv ? 0.012 : 0;
  // stiles and rails
  for (const s of [-1, 1]) g.add(cbox(0.075, sh, t, m, x + s * (sw / 2 - 0.0375), y, z + t / 2, b));
  for (const yy of [-1, 0, 1]) g.add(cbox(sw - 0.15, 0.085, t, m, x, y + yy * (sh / 2 - 0.0425), z + t / 2, b));
  if (louvre && lv >= 1) {
    // angled slats in both panels
    const n = Math.max(4, Math.round((sh / 2 - 0.13) / (lv >= 2 ? 0.085 : 0.13)));
    for (const half of [-1, 1]) {
      const y0 = y + (half < 0 ? -sh / 2 + 0.085 : 0.0425), y1 = y + (half < 0 ? -0.0425 : sh / 2 - 0.085);
      for (let i = 0; i < n; i++) g.add(slab(sw - 0.15, 0.012, 0.07, m, x, y0 + ((i + 0.5) * (y1 - y0)) / n, z + t / 2, -0.62));
    }
  } else {
    // ledged boards between the frame
    const nb = lv >= 1 ? 3 : 1;
    for (let i = 0; i < nb; i++) g.add(slab((sw - 0.15) / nb - 0.008, sh - 0.17, 0.03, m, x - (sw - 0.15) / 2 + ((i + 0.5) * (sw - 0.15)) / nb, y, z + 0.018));
    if (lv >= 1) g.add(cbeam(x - (sw / 2 - 0.08), y - sh / 2 + 0.12, z + t + 0.01, x + (sw / 2 - 0.08), y - 0.06, z + t + 0.01, 0.06, 0.02, m, 0.006, _ya.set(0, 0, 1)));
  }
  // strap hinges on the hinge side (towards the window)
  if (lv >= 1) for (const yy of [-0.32, 0.32]) g.add(slab(sw * 0.42, 0.035, 0.012, P.iron, x - side * (sw * 0.29), y + yy * sh, z + t + 0.007));
}
/** Window box with mounded greens and flowers. Width w centred x, bottom y, front z. */
export function flowerBox(g, P, x, y, z, w, lv = homeDetail(), rnd = Math.random) {
  g.add(cbox(w, 0.22, 0.24, P.box, x, y + 0.11, z, 0.015));
  g.add(slab(w - 0.06, 0.02, 0.2, P.soil || P.box, x, y + 0.215, z));
  const mounds = lv >= 2 ? Math.round(w / 0.2) : lv >= 1 ? Math.round(w / 0.3) : Math.round(w / 0.45);
  for (let i = 0; i < mounds; i++) {
    const xx = x - w / 2 + 0.1 + ((i + 0.5) * (w - 0.2)) / mounds;
    const o = mesh(icoGeo(0.17), P.leaf);
    o.position.set(xx, y + 0.29 + rnd() * 0.05, z + (rnd() - 0.5) * 0.06);
    o.scale.set(1.1 + rnd() * 0.3, 0.85 + rnd() * 0.3, 0.95);
    o.rotation.set(rnd() * 0.5, rnd() * 3, 0);
    g.add(o);
  }
  // trailing greens over the front edge
  if (lv >= 1) for (let i = 0; i < mounds - 1; i += 2) {
    const o = mesh(icoGeo(0.1), P.leaf);
    o.position.set(x - w / 2 + 0.2 + ((i + 1) * (w - 0.3)) / mounds, y + 0.08 - rnd() * 0.06, z + 0.13);
    o.scale.set(0.9, 1.5, 0.7);
    g.add(o);
  }
  const blooms = lv >= 2 ? Math.round(w / 0.1) : lv >= 1 ? Math.round(w / 0.17) : Math.round(w / 0.3);
  for (let i = 0; i < blooms; i++) {
    const o = mesh(icoGeo(lv >= 2 ? 0.07 : 0.085), P.bloom[i % P.bloom.length]);
    o.position.set(x - w / 2 + 0.08 + rnd() * (w - 0.16), y + 0.36 + rnd() * 0.14, z + 0.04 + (rnd() - 0.5) * 0.16);
    g.add(o);
  }
}
const _ico = new Map();
/** 20-triangle blob with round (radial) normals: leaf mounds and blossom read soft, not faceted. */
function icoGeo(r) {
  let gg = _ico.get(r);
  if (!gg) {
    gg = new THREE.IcosahedronGeometry(r, 0);
    const P = gg.attributes.position, N = gg.attributes.normal;
    for (let i = 0; i < P.count; i++) { _v.set(P.getX(i), P.getY(i), P.getZ(i)).normalize(); N.setXYZ(i, _v.x, _v.y, _v.z); }
    gg.userData.shared = true; _ico.set(r, gg);
  }
  return gg;
}
export { icoGeo };

// ---------------------------------------------------------------------------------------------------------------
/**
 * Plank door in a framed opening dw x dh standing on y = 0, centred x, wall face z0 (outside +z). A dressed doorstep,
 * jambs and head proud of the wall, the leaf set back behind them: vertical boards, ledges, strap hinges, a ring pull.
 * P: { frame, leaf, iron, step, glass }   o: { lv, light (small glazed light high in the leaf), keystone, hood, rnd }
 */
export function homeDoor(g, P, x, z0, dw, dh, o = {}) {
  const lv = o.lv ?? homeDetail(), rnd = o.rnd || Math.random, fd = 0.22, k = lv ? 1 : 0;
  g.add(stone(dw + 0.55, 0.1, 0.36, P.step, x, 0.05, z0 + 0.18, 0.025));
  for (const s of [-1, 1]) g.add(cbox(0.2, dh + 0.04, fd, P.frame, x + s * (dw / 2 + 0.1), (dh + 0.04) / 2, z0 + fd / 2, 0.025));
  g.add(cbox(dw + 0.64, 0.26, fd + 0.05, P.frame, x, dh + 0.15, z0 + (fd + 0.05) / 2, 0.03));
  if (o.keystone) g.add(cbox(0.24, 0.36, fd + 0.09, P.frame, x, dh + 0.2, z0 + (fd + 0.09) / 2, 0.03));
  // the leaf: boards with hairline gaps, each a little proud or shy of the next
  const n = Math.max(4, Math.round(dw / 0.21)), pw = dw / n, zl = z0 + 0.035;
  for (let i = 0; i < n; i++) {
    const bx = x - dw / 2 + (i + 0.5) * pw;
    if (o.light && i > 0 && i < n - 1 && lv >= 1) {
      g.add(cbox(pw - 0.012, dh * 0.68, 0.05, P.leaf, bx, dh * 0.34, zl + (rnd() - 0.5) * 0.008, 0.008));
      g.add(cbox(pw - 0.012, dh * 0.08, 0.05, P.leaf, bx, dh * 0.96, zl, 0.008));
    } else g.add(cbox(pw - 0.012, dh, 0.05, P.leaf, bx, dh / 2, zl + (rnd() - 0.5) * 0.008, 0.008 * k));
  }
  if (o.light && lv >= 1) {
    const lw = pw * (n - 2), ly = dh * 0.8, lh = dh * 0.2;
    g.add(slab(lw, lh, 0.02, P.glass, x, ly, zl - 0.01));
    g.add(slab(0.03, lh, 0.03, P.iron, x, ly, zl + 0.01));
    g.add(slab(lw, 0.03, 0.03, P.iron, x, ly, zl + 0.01));
  }
  if (lv >= 1) for (const yy of [0.16, o.light ? 0.6 : 0.5, 0.86]) g.add(cbox(dw - 0.06, 0.1, 0.035, P.leaf, x, dh * yy, zl + 0.04, 0.01));
  // strap hinges (hinge side -x) and a ring pull
  for (const yy of [0.16, 0.86]) {
    g.add(slab(dw * 0.62, 0.045, 0.014, P.iron, x - dw / 2 + dw * 0.31, dh * yy, zl + 0.065));
    if (lv >= 1) g.add(slab(0.075, 0.075, 0.016, P.iron, x - dw / 2 + dw * 0.62, dh * yy, zl + 0.065, 0, 0, Math.PI / 4));
  }
  g.add(cbox(0.1, 0.16, 0.016, P.iron, x + dw * 0.32, dh * 0.47, zl + 0.064, 0.004));
  if (lv >= 1) {
    const ring = mesh(torusGeo(0.06, 0.011), P.iron);
    ring.position.set(x + dw * 0.32, dh * 0.47 - 0.05, zl + 0.08);
    g.add(ring);
  }
  if (o.hood) {
    // a little pent roof on two brackets over the door
    const hy = dh + 0.55, hd = 0.75;
    const roof = cbox(dw + 1.0, 0.08, hd, P.hood || P.frame, x, hy, z0 + hd / 2 + 0.02, 0.015);
    roof.rotation.x = 0.28;
    g.add(roof);
    for (const s of [-1, 1]) {
      g.add(cbeam(x + s * (dw / 2 + 0.3), hy - 0.65, z0 + 0.02, x + s * (dw / 2 + 0.3), hy - 0.12, z0 + hd - 0.1, 0.07, 0.09, P.frame, 0.012));
      g.add(cbox(0.07, 0.09, hd - 0.1, P.frame, x + s * (dw / 2 + 0.3), hy - 0.12, z0 + (hd - 0.1) / 2, 0.012));
    }
  }
}
const _tor = new Map();
function torusGeo(r, t) { const k = r + ',' + t; let gg = _tor.get(k); if (!gg) { gg = new THREE.TorusGeometry(r, t, 4, 12); gg.userData.shared = true; _tor.set(k, gg); } return gg; }

// ---------------------------------------------------------------------------------------------------------------
/**
 * Gable roof, ridge along z, slopes falling to ±x. Eave line at y0, outer eave edge at x = ±hw, ridge at y0 + rise,
 * gable overhangs to z = ±hd. The tile surface lies on the plane through the eave edge and the ridge (the plane the
 * roof landing pads of the callers follow). P: { deck, tiles: [m...], ridge, fascia, rafter, barge }
 * o: { kind: 'roll'|'slate', wall: half width of the walls below (rafter tails start there), wallD: half depth,
 *      lv, rnd, deckT, barge: true }
 */
export function tiledRoof(g, P, hw, hd, y0, rise, o = {}) {
  const lv = o.lv ?? homeDetail(), rnd = o.rnd || Math.random, deckT = o.deckT ?? 0.13;
  const ang = Math.atan2(rise, hw), L = Math.hypot(hw, rise), ridgeY = y0 + rise, D = hd * 2;
  const kind = o.kind || 'roll';
  for (const sgn of [-1, 1]) {
    const f = slopeFrame(sgn, ridgeY, ang);
    // deck (its underside is the soffit) and the fascia board across the eave
    f.add(slab(D, deckT, L + 0.04, P.deck, 0, -deckT / 2, L / 2 - 0.01));
    f.add(cbox(D + 0.02, 0.2, 0.05, P.fascia, 0, -deckT + 0.02, L - 0.03, 0.012));
    if (kind === 'slate') slates(f, P, D, L, lv, rnd);
    else rolls(f, P, D, L, lv, rnd);
    // rafter tails under the eave, from the wall face out
    if (o.wall != null) {
      const vw = (o.wall / hw) * L, ext = (o.wallD ?? hd - 0.5) - 0.2;
      const step = lv >= 1 ? 0.62 : 1.5;
      const n = Math.max(2, Math.round((ext * 2) / step));
      for (let i = 0; i <= n; i++) {
        const u = -ext + (2 * ext * i) / n;
        f.add(cbox(0.085, 0.13, L - vw + 0.02, P.rafter, u, -deckT - 0.065, (vw + L) / 2 - 0.04, 0.014));
      }
    }
    // barge boards along both rakes
    if (o.barge !== false) for (const s of [-1, 1]) f.add(cbox(0.085, 0.3, L + 0.12, P.barge || P.fascia, s * (hd + 0.04), -0.03, L / 2, 0.016));
    g.add(f);
  }
  ridgeRoll(g, P, ridgeY, hd, ang, lv);
  return { ang, L, ridgeY };
}
/** Barrel tiles: columns of half-round caps down the slope, course by course, each nose standing a little proud. */
function rolls(f, P, D, L, lv, rnd) {
  const pitch = lv ? 0.3 : 0.38, cols = Math.max(2, Math.round(D / pitch)), pc = D / cols;
  const course = lv >= 2 ? 0.42 : lv >= 1 ? 0.84 : 0;
  const tiles = P.tiles;
  for (let j = 0; j < cols; j++) {
    const u = -D / 2 + (j + 0.5) * pc;
    if (!course) {
      // phones: one roll per column, the courses suggested by the deck tone only
      const o = mesh(arcGeo(0.12, 0.13, L + 0.03, 0, Math.PI, 3), tiles[j % tiles.length]);
      o.position.set(u, 0.0, 0);
      f.add(o);
      continue;
    }
    const n = Math.max(2, Math.round(L / course)), c = L / n;
    for (let i = 0; i < n; i++) {
      const o = mesh(arcGeo(0.1, 0.118, c + 0.07, 0, Math.PI, lv >= 2 ? 5 : 4), tiles[Math.floor(rnd() * tiles.length)]);
      o.position.set(u + (rnd() - 0.5) * 0.012, 0.004, i * c - 0.04);
      o.rotation.x = -0.055 - rnd() * 0.02;           // the lower end lifts: the nose stands proud of the course below
      o.rotation.z = (rnd() - 0.5) * 0.04;
      f.add(o);
    }
  }
}
/** Slates: staggered courses of thin rectangular slates with hairline joints, each slate tilted on the one below. */
function slates(f, P, D, L, lv, rnd) {
  const course = 0.36, n = Math.max(3, Math.round(L / course)), c = L / n, tiles = P.tiles;
  if (lv === 0) {
    for (let i = 0; i < n; i++) { const o = slab(D, 0.035, c + 0.08, tiles[i % tiles.length], 0, 0.02, i * c + c / 2 - 0.02, -0.06); f.add(o); }
    return;
  }
  const sw = lv >= 2 ? 0.34 : 0.62;
  for (let i = 0; i < n; i++) {
    const off = i % 2 ? sw / 2 : 0;
    for (let u = -D / 2 - off; u < D / 2 - 0.02; u += sw) {
      const a = Math.max(-D / 2, u), b = Math.min(D / 2, u + sw), w = b - a;
      if (w < 0.06) continue;
      const o = slab(w - 0.014, 0.03, c + 0.09, tiles[Math.floor(rnd() * tiles.length)], (a + b) / 2, 0.022 + rnd() * 0.006, i * c + c / 2 - 0.025, -0.07 - rnd() * 0.025, 0, (rnd() - 0.5) * 0.03);
      f.add(o);
    }
  }
}
/** Ridge: overlapping round ridge tiles over a mortar bed, end caps at both gables. */
function ridgeRoll(g, P, ridgeY, hd, ang, lv) {
  const r = 0.17, len = lv ? 0.46 : 1.6, n = Math.max(2, Math.round((hd * 2 + 0.1) / len)), step = (hd * 2 + 0.1) / n;
  const seg = lv >= 2 ? 8 : 6;
  for (let i = 0; i < n; i++) {
    const o = mesh(arcGeo(r, r + 0.012, step + 0.05, -0.35, Math.PI + 0.35, seg, i === n - 1), P.ridge);
    o.position.set(0, ridgeY + 0.035, -hd - 0.05 + i * step);
    o.rotation.x = -0.02;
    g.add(o);
  }
  const cap = mesh(arcGeo(r + 0.012, r + 0.012, 0.01, -0.35, Math.PI + 0.35, seg, true), P.ridge);
  cap.rotation.y = Math.PI;
  cap.position.set(0, ridgeY + 0.035, -hd - 0.05);
  g.add(cap);
  g.add(slab(0.22, 0.12, hd * 2 + 0.06, P.mortar || P.ridge, 0, ridgeY - 0.02, 0));
}

/**
 * Chimney stack rising through a roof slope: body from y0 to top, corbelled courses near the top, a capping slab,
 * clay pots. (x, z) is the stack centre in the caller's frame.
 */
export function chimney(g, P, x, z, y0, top, o = {}) {
  const w = o.w ?? 0.72, d = o.d ?? 0.84, lv = o.lv ?? homeDetail();
  g.add(cbox(w, top - y0, d, P.stack, x, (y0 + top) / 2, z, 0.03));
  if (lv >= 1) for (let yy = top - 0.95; yy > y0 + 0.3; yy -= 0.62) g.add(slab(w + 0.03, 0.05, d + 0.03, P.joint || P.stack, x, yy, z));
  g.add(cbox(w + 0.12, 0.12, d + 0.12, P.stack, x, top - 0.34, z, 0.02));
  g.add(cbox(w + 0.22, 0.1, d + 0.22, P.cap, x, top - 0.2, z, 0.02));
  g.add(cbox(w + 0.06, 0.16, d + 0.06, P.stack, x, top - 0.07, z, 0.02));
  const pots = lv ? o.pots ?? 1 : 1;
  for (let i = 0; i < pots; i++) {
    const px = x + (pots > 1 ? (i - 0.5) * w * 0.5 : 0);
    const pot = mesh(potGeo(), P.pot);
    pot.position.set(px, top + 0.01, z);
    g.add(pot);
  }
}
let _pot = null;
function potGeo() {
  if (_pot) return _pot;
  const pts = [[0.0, 0], [0.15, 0], [0.135, 0.06], [0.12, 0.3], [0.145, 0.33], [0.145, 0.38], [0.1, 0.38], [0.1, 0.12], [0, 0.12]].map(([r, y]) => new THREE.Vector2(r, y));
  _pot = new THREE.LatheGeometry(pts, lvSeg());
  _pot.deleteAttribute('uv'); _pot.computeVertexNormals();
  _pot.userData.shared = true;
  return _pot;
}
function lvSeg() { return homeDetail() >= 2 ? 10 : 7; }

// ---------------------------------------------------------------------------------------------------------------
/** Tapered tube along a curve (vine stems, twigs): radius r0 at the start to r1 at the end, flat facets. */
export function taperTube(curve, r0, r1, radial, segs) {
  const fr = curve.computeFrenetFrames(segs, false), pos = [];
  const pt = new THREE.Vector3(), rings = [], centres = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, r = r0 + (r1 - r0) * t, N = fr.normals[i], B = fr.binormals[i];
    curve.getPointAt(t, pt);
    centres.push(pt.clone());
    const ring = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      ring.push([pt.x + r * (c * N.x + s * B.x), pt.y + r * (c * N.y + s * B.y), pt.z + r * (c * N.z + s * B.z)]);
    }
    rings.push(ring);
  }
  const tri = (a, b, c, ctr) => {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _c.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _a.cross(_c);
    const out = _a.x * (a[0] - ctr.x) + _a.y * (a[1] - ctr.y) + _a.z * (a[2] - ctr.z) >= 0;
    if (out) pos.push(...a, ...b, ...c); else pos.push(...a, ...c, ...b);
  };
  for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) {
    const k2 = (k + 1) % radial, A = rings[i][k], B = rings[i][k2], C = rings[i + 1][k2], D = rings[i + 1][k];
    tri(A, B, C, centres[i]); tri(A, C, D, centres[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** A leaf with a folded midrib, both sides drawn: length L along +z from the stalk, width W, face up (+y). */
const _leaf = new Map();
export function leafGeo(L = 0.24, W = 0.1) {
  const k = L + ',' + W;
  let g = _leaf.get(k);
  if (g) return g;
  const B = [0, 0, 0], T = [0, 0, L], Lf = [-W, 0.25 * W, L * 0.42], Rt = [W, 0.25 * W, L * 0.42], M = [0, -0.06 * W, L * 0.46];
  const f = [B, M, Lf, M, T, Lf, B, Rt, M, M, Rt, T];
  const pos = [];
  for (let i = 0; i < f.length; i += 3) pos.push(...f[i], ...f[i + 1], ...f[i + 2]);
  for (let i = 0; i < f.length; i += 3) pos.push(...f[i], ...f[i + 2], ...f[i + 1]);
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.userData.shared = true;
  _leaf.set(k, g);
  return g;
}
/**
 * A climbing vine on a wall whose face is z = wallZ (outside +z): a tapered woody stem through pts ([x,y,z]...),
 * side shoots, leaves laid flat towards the viewer, hanging racemes of blossom. P: { stem, leaf: [m...], bloom: [m...] }
 */
export function vine(g, P, pts, o = {}) {
  const lv = o.lv ?? homeDetail(), rnd = o.rnd || Math.random;
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  g.add(mesh(taperTube(curve, o.r0 ?? 0.07, o.r1 ?? 0.022, lv ? 6 : 4, pts.length * (lv ? 4 : 2)), P.stem));
  const p = new THREE.Vector3(), n = pts.length;
  const leaves = lv >= 2 ? 4 : lv >= 1 ? 3 : 2;
  for (let i = 1; i < n; i++) {
    curve.getPointAt(Math.min(1, i / n + 0.02), p);
    const side = i % 2 ? 1 : -1, len = 0.45 + rnd() * 0.35;
    const ex = p.x + side * len, ey = p.y + 0.15 + rnd() * 0.25, ez = p.z + 0.02 + rnd() * 0.05;
    const shoot = new THREE.CatmullRomCurve3([p.clone(), new THREE.Vector3((p.x + ex) / 2, (p.y + ey) / 2 + 0.08, (p.z + ez) / 2 + 0.03), new THREE.Vector3(ex, ey, ez)]);
    g.add(mesh(taperTube(shoot, 0.028, 0.01, lv ? 5 : 3, lv ? 4 : 2), P.stem));
    for (const [cx, cy, cz, kk] of [[ex, ey, ez, leaves], [(p.x + ex) / 2, (p.y + ey) / 2, (p.z + ez) / 2, leaves - 1]]) {
      for (let j = 0; j < kk; j++) {
        const lf = mesh(leafGeo(0.24 + rnd() * 0.1, 0.1 + rnd() * 0.04), P.leaf[(i + j) % P.leaf.length]);
        lf.rotation.order = 'ZYX';
        lf.rotation.set(Math.PI / 2 - 0.35 + rnd() * 0.5, (rnd() - 0.5) * 0.6, (j / kk) * Math.PI * 2 + rnd());
        lf.position.set(cx + (rnd() - 0.5) * 0.08, cy + (rnd() - 0.5) * 0.08, cz + 0.02 + rnd() * 0.04);
        g.add(lf);
      }
    }
    // a raceme of blossom hanging from every third node
    if (P.bloom && i > 1 && i % 3 === 1) {
      const fx = (p.x + ex) / 2 + side * 0.1, fy = (p.y + ey) / 2, fz = Math.max(p.z, ez) + 0.1;
      const k = lv >= 2 ? 7 : lv >= 1 ? 5 : 3;
      for (let j = 0; j < k; j++) {
        const b = mesh(icoGeo(0.095 * (1 - (j / k) * 0.55)), P.bloom[j % P.bloom.length]);
        b.position.set(fx + Math.sin(j * 2.1) * 0.04, fy - 0.05 - j * 0.085, fz + Math.cos(j * 1.7) * 0.03);
        g.add(b);
      }
    }
  }
}
