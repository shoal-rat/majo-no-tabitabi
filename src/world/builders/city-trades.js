// Street level of the City of Magic's houses (art round 2, "a living city"): front doors up a couple of stone steps in
// a moulded surround, panelled leaves with a knocker, a fanlight, a wall lantern; and the shops, each with its trade
// (bakery, apothecary, broom and wand maker, bookshop, tailor, florist) — a mullioned shop window over a stall board,
// a striped awning with a scalloped valance in the trade's colours, a signboard on a scrolled iron bracket with the
// trade's emblem hung under it (no lettering), and goods set out by the door. Arcaded shop rows step the shop floor
// back behind round arches on piers. Builders write into a ByMat (site bake merges them); the warm lamp glow is
// returned to the caller so it stays a lamp for the night pools.
import * as THREE from 'three';
import { mat } from './kit.js';
import { GeoBuilder, ByMat, hash01, frontRing, fixWinding, plain } from './city-geo.js';
import { wallLantern } from './city-market.js';

const C = {
  stone: mat.stone(0xe3d8c2),
  step: mat.stone(0xa39583),
  door: mat.wood(0x5c3a2c),
  doorDk: mat.wood(0x4a2e22),
  frame: mat.wood(0x5a4232),
  wood: mat.wood(0x6e4c38),
  glass: mat.paint(0x3d5667),
  lit: plain(mat.paint(0xe6c48c)), // a lamp-lit shop interior behind the panes
  brass: mat.metal(0xcf9f52),
  iron: mat.paint(0x35393f),
  cream: plain(mat.cloth(0xf3eee2)),
  board: mat.wood(0x7b5a3e)
};
const P = (hex) => plain(mat.paint(hex)),
  CL = (hex) => plain(mat.cloth(hex));
/** Trades: awning colour, signboard colour, emblem colours. */
export const TRADES = [
  { id: 'bakery', awn: CL(0xc0563f), sign: P(0xe9d3a0), em: [P(0xc98a4a), P(0xe7c27a)] },
  { id: 'apothecary', awn: CL(0x4f7259), sign: P(0x2f4a3c), em: [P(0x7ad0a8), P(0xd9b45a)] },
  { id: 'broom', awn: CL(0x5b4a8a), sign: P(0x3a2f52), em: [P(0x8a5a35), P(0xd8b26a)] },
  { id: 'books', awn: CL(0x3d5f8c), sign: P(0xe8dfcc), em: [P(0x9e3b35), P(0xf3eee2)] },
  { id: 'tailor', awn: CL(0xb76f8a), sign: P(0xf0e2e6), em: [P(0xbfc6cc), P(0x9e3b35)] },
  { id: 'florist', awn: CL(0x6c9a52), sign: P(0xf4efe4), em: [P(0xe794a8), P(0x5f8c4a)] }
];
export const tradeOf = (seed) => TRADES[Math.floor(hash01(seed, 61) * TRADES.length)];

// ---------------------------------------------------------------- doors
/**
 * Front door centred at x on a wall face at z = zf (facing +z): steps, surround, panelled leaf, fanlight, knocker.
 * lantern: side (+1 / -1) of a wall lantern, 0 for none. Returns the lantern's glow point or null.
 */
export function frontDoor(g, x, zf, seed, lite, lantern = 0) {
  const B = new ByMat(), arched = hash01(seed, 63) > 0.5, w = 1.1, hgt = 2.3;
  // two dressed steps
  B.get(C.step).slab(x - 0.95, 0, zf, x + 0.95, 0.17, zf + 0.62, 0.03, true);
  if (!lite) B.get(C.step).slab(x - 0.8, 0.17, zf, x + 0.8, 0.32, zf + 0.34, 0.03, true);
  // moulded surround (an arched head on some houses)
  const pts = [[x - w / 2, 0.32, -1, 0], [x - w / 2, hgt, arched ? -1 : -1, arched ? 0 : 1]];
  if (arched) for (let i = 1; i < 6; i++) { const a = Math.PI - (i / 6) * Math.PI; pts.push([x + Math.cos(a) * (w / 2), hgt + Math.sin(a) * 0.32, Math.cos(a), Math.sin(a)]); }
  pts.push([x + w / 2, hgt, 1, arched ? 0 : 1], [x + w / 2, 0.32, 1, 0]);
  const S = B.get(C.stone), from = S.tris;
  if (lite) S.box(x - w / 2 - 0.16, 0.32, zf - 0.06, x + w / 2 + 0.16, hgt + 0.16, zf + 0.06, 'nz');
  else {
    frontRing(S, pts, zf + 0.14, zf, zf - 0.06, [0.17, 0.05]);
    fixWinding(S, from);
  }
  if (!arched) S.slab(x - w / 2 - 0.3, hgt + 0.17, -0.02 + zf, x + w / 2 + 0.3, hgt + 0.3, zf + 0.2, 0.03, false);
  // leaf: a slab with raised panels, a fanlight above, a ring knocker and a knob
  const D = B.get(C.door), top = arched ? hgt + 0.3 : hgt;
  D.box(x - w / 2, 0.32, zf - 0.08, x + w / 2, hgt - (arched ? 0 : 0.42), zf - 0.04, 'nz');
  B.get(C.glass).quad([x - w / 2, hgt - (arched ? 0 : 0.42), zf - 0.05], [x + w / 2, hgt - (arched ? 0 : 0.42), zf - 0.05], [x + w / 2, top, zf - 0.05], [x - w / 2, top, zf - 0.05], [0, 0, 1]);
  if (arched) for (let i = 0; i < 6; i++) { const a0 = (i / 6) * Math.PI, a1 = ((i + 1) / 6) * Math.PI; B.get(C.glass).tri([x, hgt, zf - 0.05], [x + Math.cos(a0) * w / 2, hgt + Math.sin(a0) * 0.32, zf - 0.05], [x + Math.cos(a1) * w / 2, hgt + Math.sin(a1) * 0.32, zf - 0.05], [0, 0, 1]); }
  B.get(C.frame).box(x - w / 2, hgt - (arched ? 0.04 : 0.46), zf - 0.05, x + w / 2, hgt - (arched ? 0 : 0.42), zf - 0.02, 'nz');
  if (!lite) {
    const Pn = B.get(C.doorDk), yT = hgt - (arched ? 0 : 0.42);
    for (const [y0, y1] of [[0.5, yT - 0.15]]) for (const s of [-1, 1]) Pn.bevel(x + (s < 0 ? -w / 2 + 0.1 : 0.05), y0, zf - 0.04, x + (s < 0 ? -0.05 : w / 2 - 0.1), y1, zf - 0.005, 0.02, '');
  }
  B.flush(g);
  if (!lantern) return null;
  const lg = new THREE.Group();
  lg.position.set(x + lantern * (w / 2 + 0.42), 0, zf);
  lg.rotation.y = -Math.PI / 2;
  g.add(lg);
  const [lx, ly, lz] = wallLantern(lg, C.iron, 2.65, 0, 1, true);
  // lantern point back in the door's frame
  return [x + lantern * (w / 2 + 0.42) - lz, ly, zf + lx];
}

// ---------------------------------------------------------------- shop fronts
/** Striped awning with a scalloped valance: w wide, out from a wall at z = zf, its back edge at y. */
export function awning(B, x, y, zf, w, depth, colA, colB, lite) {
  const nS = Math.max(4, Math.round(w / 0.42)), nV = lite ? 2 : 4;
  const P = (u, v) => [x - w / 2 + w * u, y - 0.55 * v - 0.06 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v), zf + 0.02 + depth * v];
  for (let k = 0; k < nS; k++) {
    const A = B.get(k % 2 ? colB : colA);
    for (let j = 0; j < nV; j++) {
      const u0 = k / nS, u1 = (k + 1) / nS, v0 = j / nV, v1 = (j + 1) / nV;
      A.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), [0, 1, 0.3]);
      A.quad(P(u0, v1), P(u1, v1), P(u1, v0), P(u0, v0), [0, -1, -0.3]);
    }
    const a = P(k / nS, 1), c = P((k + 1) / nS, 1);
    for (let q = 0; q < (lite ? 0 : 3); q++) {
      const t0 = q / 3, t1 = (q + 1) / 3, x0 = a[0] + (c[0] - a[0]) * t0, x1 = a[0] + (c[0] - a[0]) * t1;
      const y0 = a[1] - 0.16 - 0.08 * Math.sin(Math.PI * t0), y1 = a[1] - 0.16 - 0.08 * Math.sin(Math.PI * t1);
      A.quad([x0, a[1], a[2]], [x1, a[1], a[2]], [x1, y1, a[2]], [x0, y0, a[2]], [0, 0, 1]);
      A.quad([x1, a[1], a[2] - 0.004], [x0, a[1], a[2] - 0.004], [x0, y0, a[2] - 0.004], [x1, y1, a[2] - 0.004], [0, 0, -1]);
    }
  }
  const I = B.get(C.iron);
  I.tube([[x - w / 2, y - 0.55, zf + depth], [x + w / 2, y - 0.55, zf + depth]], 0.022, 4, true);
  for (const s of [-1, 1]) I.tube([[x + (s * w) / 2, y, zf], [x + (s * w) / 2, y - 0.55, zf + depth]], 0.016, 4);
}
/** The trade's emblem hung under its signboard, centred (x, y, z), facing +z (seen from both sides of the street). */
function emblem(B, t, x, y, z, lite = false) {
  const sd = lite ? 4 : 6, np = lite ? 14 : 28;
  const [a, b] = t.em.map((m) => B.get(m));
  if (t.id === 'bakery') {
    // a pretzel
    const pts = [];
    for (let i = 0; i <= np; i++) { const u = (i / np) * Math.PI * 2; pts.push([x + 0.26 * Math.sin(u) * (1 + 0.35 * Math.cos(u)), y + 0.2 * Math.sin(2 * u) * 0.9 - 0.06 * Math.cos(u), z + 0.04 * Math.cos(3 * u)]); }
    a.tube(pts, 0.045, sd);
  } else if (t.id === 'apothecary') {
    a.lathe([[0.001, -0.22], [0.15, -0.2], [0.18, -0.08], [0.12, 0.06], [0.05, 0.1], [0.05, 0.2], [0.001, 0.2]], 8, x, y, z);
    b.lathe([[0.065, 0.18], [0.07, 0.26], [0.001, 0.28]], 6, x, y, z);
  } else if (t.id === 'broom') {
    for (const s of [-1, 1]) {
      const m = new THREE.Matrix4().makeRotationZ(s * 0.55).setPosition(x, y, z + s * 0.03), t2 = new GeoBuilder();
      t2.lathe([[0.016, 0.42], [0.016, -0.05], [0.05, -0.1], [0.11, -0.34], [0.001, -0.36]], 6);
      a.append(t2, m);
    }
    b.box(x - 0.05, y - 0.04, z - 0.06, x + 0.05, y + 0.04, z + 0.06);
  } else if (t.id === 'books') {
    for (const s of [-1, 1]) {
      const t2 = new GeoBuilder();
      t2.box(0, -0.18, -0.012, 0.3, 0.18, 0.012);
      a.append(t2, new THREE.Matrix4().makeRotationY(s > 0 ? -0.35 : Math.PI + 0.35).setPosition(x, y, z));
      const t3 = new GeoBuilder();
      t3.box(0.01, -0.16, 0.012, 0.28, 0.16, 0.03);
      b.append(t3, new THREE.Matrix4().makeRotationY(s > 0 ? -0.35 : Math.PI + 0.35).setPosition(x, y, z));
    }
  } else if (t.id === 'tailor') {
    for (const s of [-1, 1]) {
      a.tube([[x, y + 0.05, z], [x + s * 0.12, y + 0.3, z + s * 0.02]], 0.018, 4, true);
      const ring = [];
      for (let i = 0; i <= 10; i++) { const u = (i / 10) * Math.PI * 2; ring.push([x - s * 0.08 + Math.cos(u) * 0.07, y - 0.1 + Math.sin(u) * 0.07, z]); }
      a.tube(ring, 0.016, 4);
    }
    b.lathe([[0.06, -0.05], [0.09, -0.05], [0.09, -0.03], [0.05, -0.03], [0.05, 0.03], [0.09, 0.03], [0.09, 0.05], [0.06, 0.05]], 8, x + 0.24, y - 0.18, z, 0, 0, true);
  } else {
    a.lathe([[0.001, 0.1], [0.12, 0.12], [0.16, 0.22], [0.1, 0.3], [0.001, 0.28]], 8, x, y - 0.1, z);
    b.lathe([[0.09, -0.12], [0.12, 0.1], [0.08, 0.1], [0.06, -0.1]], 8, x, y - 0.1, z, 1);
  }
}
/**
 * A shop front on a wall at z = zf facing +z: the shop window (centre wx, width ww) and the door at doorX.
 * Returns { glint: [x, y, z] | null } — a point in the window for the spell shops' sparkle.
 */
export function shopFront(g, t, wx, ww, doorX, zf, seed, lite) {
  const B = new ByMat(), F = B.get(C.frame);
  // mullioned window over a panelled stall board
  F.box(wx - ww / 2 - 0.1, 0.62, zf - 0.02, wx + ww / 2 + 0.1, 2.86, zf + 0.08, 'nz');
  B.get(C.lit).quad([wx - ww / 2, 0.82, zf + 0.085], [wx + ww / 2, 0.82, zf + 0.085], [wx + ww / 2, 2.72, zf + 0.085], [wx - ww / 2, 2.72, zf + 0.085], [0, 0, 1]);
  const nm = Math.max(2, Math.round(ww / 0.7));
  for (let i = 1; i < nm; i++) F.box(wx - ww / 2 + (ww * i) / nm - 0.025, 0.82, zf + 0.085, wx - ww / 2 + (ww * i) / nm + 0.025, 2.72, zf + 0.12, 'nz');
  F.box(wx - ww / 2, 2.2, zf + 0.085, wx + ww / 2, 2.25, zf + 0.12, 'nz');
  B.get(C.stone).slab(wx - ww / 2 - 0.2, 0.5, zf - 0.02, wx + ww / 2 + 0.2, 0.64, zf + 0.32, 0.03, false);
  if (!lite) for (let i = 0; i < nm; i++) B.get(C.door).bevel(wx - ww / 2 + (ww * i) / nm + 0.06, 0.12, zf, wx - ww / 2 + (ww * (i + 1)) / nm - 0.06, 0.44, zf + 0.04, 0.015, '');
  // the trade's awning
  awning(B, wx, 3.42, zf, ww + 0.7, 1.25, t.awn, C.cream, lite);
  // hanging sign on a scrolled bracket beside the door
  const sx = doorX + Math.sign(doorX || 1) * 0.82, I = B.get(C.iron);
  I.box(sx - 0.05, 3.25, zf - 0.02, sx + 0.05, 3.75, zf + 0.04);
  I.tube([[sx, 3.62, zf], [sx, 3.66, zf + 0.5], [sx, 3.62, zf + 1.05]], 0.022, 4, true);
  if (!lite) {
    const sc = [];
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 1.6; sc.push([sx, 3.48 + Math.sin(a) * 0.12, zf + 0.25 + Math.cos(a) * 0.12]); }
    I.tube(sc, 0.014, 4);
    for (const dz of [0.6, 1.0]) I.tube([[sx, 3.62, zf + dz], [sx, 3.42, zf + dz]], 0.008, 3);
  }
  const Sg = B.get(t.sign), sb = new GeoBuilder();
  sb.slab(-0.04, -0.34, -0.26, 0.04, 0.0, 0.26, 0.012, false);
  sb.box(-0.04, -0.34, -0.26, 0.04, -0.33, 0.26);
  Sg.append(sb, new THREE.Matrix4().makeTranslation(sx, 3.42, zf + 0.8));
  B.get(C.board).box(sx - 0.05, 3.36, zf + 0.52, sx + 0.05, 3.42, zf + 1.08);
  const em = new ByMat();
  emblem(em, t, 0, 0, 0, lite);
  for (const [m, gb] of em.map) B.get(m).append(gb, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(sx, 2.78, zf + 0.8));
  // goods by the door
  if (!lite) goods(B, t, wx, ww, zf, seed);
  B.flush(g);
  return { glint: t.id === 'apothecary' || t.id === 'broom' ? [wx, 1.8, zf + 0.12] : null, book: t.id === 'books' ? [wx, zf + 1.4] : null };
}
const goodsM = { bread: P(0xc98a4a), crust: P(0xa96a35), pot: mat.stone(0xb7704c), leaf: P(0x6c9a52), bloom: [0xd65a4f, 0xe794a8, 0xebc85a, 0xf3eee2].map(P), straw: P(0xd8b26a), cloth: [0x9e3b35, 0x3d5f8c, 0xd9b45a, 0x6c9a52].map((c) => CL(c)), wicker: mat.wood(0xb08a55), glass: P(0x7ad0a8) };
function goods(B, t, wx, ww, zf, seed) {
  const x0 = wx - ww / 2 + 0.3, z = zf + 0.45;
  if (t.id === 'bakery') {
    B.get(C.wood).slab(x0 - 0.25, 0.42, z - 0.22, x0 + 0.65, 0.5, z + 0.22, 0.02, false);
    for (const s of [-1, 1]) B.get(C.wood).box(x0 + 0.2 + s * 0.38, 0, z - 0.18, x0 + 0.2 + s * 0.38 + 0.05, 0.42, z + 0.18);
    B.get(goodsM.wicker).lathe([[0.001, 0.5], [0.2, 0.51], [0.26, 0.62], [0.23, 0.62], [0.001, 0.58]], 10, x0 + 0.2, 0, z, 0, 0, true);
    for (let k = 0; k < 3; k++) { const t2 = new GeoBuilder(); t2.lathe([[0.001, -0.15], [0.07, -0.1], [0.075, 0], [0.065, 0.1], [0.001, 0.15]], 6); B.get(k % 2 ? goodsM.crust : goodsM.bread).append(t2, new THREE.Matrix4().makeRotationZ(Math.PI / 2 + (k - 1) * 0.3).setPosition(x0 + 0.12 + k * 0.08, 0.66, z + (k - 1) * 0.06)); }
  } else if (t.id === 'apothecary' || t.id === 'florist') {
    for (let k = 0; k < 3; k++) {
      const px = x0 + k * 0.42, r = 0.15 + 0.03 * k;
      B.get(goodsM.pot).lathe([[0.001, 0], [r * 0.8, 0], [r, r * 1.5], [r * 1.08, r * 1.6], [r * 0.95, r * 1.6], [0.001, r * 1.45]], 8, px, 0, z, 0, 0, true);
      B.get(goodsM.leaf).lathe([[0.001, r * 1.4], [r * 1.3, r * 1.9], [r * 1.1, r * 2.7], [0.001, r * 3.0]], 6, px, 0, z, 0, k);
      if (t.id === 'florist') for (let q = 0; q < 4; q++) { const a = q * 1.7 + k; B.get(goodsM.bloom[(q + seed) % 4]).lathe([[0.001, 0], [0.045, 0.02], [0.001, 0.05]], 5, px + Math.cos(a) * r * 0.8, r * 2.6, z + Math.sin(a) * r * 0.8); }
    }
    if (t.id === 'apothecary') for (let k = 0; k < 3; k++) B.get(goodsM.glass).lathe([[0.001, 0.5], [0.05, 0.5], [0.05, 0.62], [0.02, 0.68], [0.02, 0.72], [0.001, 0.72]], 6, wx + ww / 2 - 0.3 - k * 0.12, 0, zf + 0.22);
  } else if (t.id === 'broom') {
    for (let k = 0; k < 3; k++) {
      const t2 = new GeoBuilder();
      t2.lathe([[0.017, 1.7], [0.017, 0.5], [0.05, 0.44], [0.12, 0.08], [0.001, 0.0]], 6);
      B.get(k === 1 ? goodsM.straw : C.wood).append(t2, new THREE.Matrix4().makeRotationZ(-0.16 + k * 0.03).setPosition(x0 - 0.1 + k * 0.32, 0.02, zf + 0.25));
    }
  } else if (t.id === 'tailor') {
    B.get(goodsM.cloth[seed % 4]).lathe([[0.001, 0.95], [0.18, 1.0], [0.16, 1.2], [0.2, 1.4], [0.13, 1.5], [0.05, 1.56], [0.001, 1.58]], 10, x0 + 0.1, 0, z);
    B.get(C.wood).lathe([[0.025, 0], [0.025, 0.95]], 5, x0 + 0.1, 0, z, 0);
    B.get(C.wood).lathe([[0.22, 0], [0.18, 0.05], [0.001, 0.06]], 6, x0 + 0.1, 0, z);
    for (let k = 0; k < 3; k++) { const t2 = new GeoBuilder(); t2.lathe([[0.09, -0.4], [0.09, 0.4]], 8, 0, 0, 0, 3); B.get(goodsM.cloth[(seed + k + 1) % 4]).append(t2, new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(x0 + 0.7, 0.1 + k * 0.17, z + (k % 2) * 0.05)); }
  } else if (t.id === 'books') {
    // a cart of books at rest (its twin floats nearby: life/city-ambient.js)
    B.get(C.wood).box(x0 - 0.2, 0.45, z - 0.25, x0 + 0.75, 0.52, z + 0.25);
    for (let k = 0; k < 7; k++) B.get(goodsM.cloth[k % 4]).box(x0 - 0.15 + k * 0.12, 0.52, z - 0.16, x0 - 0.06 + k * 0.12, 0.52 + 0.2 + 0.05 * (k % 3), z + 0.16);
    for (const sx of [x0 - 0.1, x0 + 0.65]) { const t2 = new GeoBuilder(); t2.lathe([[0.001, -0.03], [0.2, -0.03], [0.2, 0.03], [0.001, 0.03]], 10); B.get(C.iron).append(t2, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(sx, 0.2, z + 0.28)); }
  }
}

// ---------------------------------------------------------------- arcades
/**
 * Arcade along a shop front: n round arches on piers at the front line z = zf (facing +z), w wide, GF tall, the shop
 * wall set back `back` metres. Returns pier x positions (for colliders).
 */
export function arcade(g, w, zf, GF, back, n, stoneM, lite) {
  const B = new ByMat(), S = B.get(stoneM), pw = 0.5, span = (w - pw) / n - pw, piers = [];
  for (let i = 0; i <= n; i++) {
    const px = -w / 2 + pw / 2 + i * (span + pw);
    piers.push(px);
    S.slab(px - pw / 2 - 0.04, 0, zf - 0.04 - pw, px + pw / 2 + 0.04, 0.35, zf + 0.04, 0.03, true);
    S.box(px - pw / 2, 0.35, zf - pw, px + pw / 2, GF - 0.9, zf, 'ny');
    S.slab(px - pw / 2 - 0.06, GF - 0.98, zf - pw - 0.06, px + pw / 2 + 0.06, GF - 0.86, zf + 0.06, 0.03, false);
  }
  const R = span / 2, ys = GF - 0.86;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + pw + span / 2 + i * (span + pw), segs = lite ? 5 : 9;
    for (const [z0, z1, face] of [[zf - pw, zf, 1]]) {
      for (let k = 0; k < segs; k++) {
        const a0 = (k / segs) * Math.PI, a1 = ((k + 1) / segs) * Math.PI;
        const pi = (a, r) => [cx + Math.cos(a) * r, Math.min(GF, ys + Math.sin(a) * r * 0.62)];
        const [ax, ay] = pi(a0, R), [bx, by] = pi(a1, R);
        // spandrel above the arch up to the floor line, and the soffit of the arch
        S.quad([ax, ay, z1], [bx, by, z1], [bx, GF, z1], [ax, GF, z1], [0, 0, face]);
        S.quad([ax, ay, z0], [ax, ay, z1], [bx, by, z1], [bx, by, z0], [-(Math.cos(a0) + Math.cos(a1)), -1, 0]);
      }
    }
  }
  S.box(-w / 2, GF - 0.02, zf - pw, w / 2, GF + 0.06, zf + 0.02, 'ny');
  // the arcade's ceiling over the walk
  B.get(C.wood).quad([-w / 2, GF - 0.01, zf - back], [w / 2, GF - 0.01, zf - back], [w / 2, GF - 0.01, zf - pw], [-w / 2, GF - 0.01, zf - pw], [0, -1, 0]);
  B.flush(g);
  return piers;
}
