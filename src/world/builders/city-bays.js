// Modelled window bays on the City of Magic's town houses (art pass "modelled, not painted"). Far away the upper
// storeys keep their painted facade (one texture, mage-city.js facadeTex); within RANGE m of the camera every bay of a
// facade that faces the camera gets a modelled window laid exactly over its painted one: a moulded stone surround
// standing off the wall (so the glass sits in a real reveal), a hood cornice or an arched head with a keystone, a
// sill on an apron, casement bars, and per house / per bay variety the painted repeat cannot have — shutters with
// louvres (open or closed, the house's colour), curtains, flower boxes with real flowers, iron balconettes — and
// turned balustrades along the balconies' rails. Instanced: eight InstancedMeshes in all (one draw each), refilled from a spatial grid only when the camera has moved;
// no shadows cast. Phones and the low tier keep the painted facades only.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { toon, own } from '../../core/mats.js';
import { GeoBuilder, hash01, frontRing, fixWinding } from './city-geo.js';

/** Modelled bays within this many metres of the camera: by tier (phones and low: none). */
export const bayRange = () => (G.quality?.mobile || G.quality?.name === 'low' ? 0 : G.quality?.name === 'med' ? 34 : 50);
const FH = 3.15;
const lin = (hex) => new THREE.Color(hex);

// ---- the registry: one record per bay, filled while the town houses are built ----
const rec = []; // [x, y, z, yaw, sx, flags, tint, shutter, curtain, bloom, seed] per bay
const STRIDE = 11;
export const BAY = { ARCH: 1, SHUT: 2, CLOSED: 4, BOX: 8, RAIL: 16, CURTAIN: 32, PANEL: 64, OPEN: 128 };
/**
 * Register a bay: world position of the middle of its storey's floor line on the facade plane, facing yaw (the
 * facade's outward normal is (sin yaw, cos yaw)), width scale sx (bay width / 1.6 m), flags (BAY.*), colour indices.
 */
export function addBay(x, y, z, yaw, sx, flags, tint, shutter, curtain, bloom, seed) {
  rec.push(x, y, z, yaw, sx, flags, tint, shutter, curtain, bloom, seed);
}
export const bayCount = () => rec.length / STRIDE;

// ---- palettes (sRGB) ----
const TINT = [0xf6e9cf, 0xd7dfe4, 0xedd2aa, 0xf2dccf].map((c) => lin(c).multiplyScalar(0.98));
const SHUTTER = [0x56745e, 0x4c6787, 0x8e4c3e, 0x7b5c3d, 0x5f7f86, 0x6c8a5a, 0x3f5a78].map(lin);
const CURTAIN = [0xf3eee2, 0xe9c9c4, 0xd8e2d0, 0xc9d6e6, 0xf0dcb0].map(lin);
const BLOOM = [0xd65a4f, 0xe794a8, 0xf3eee2, 0xebc85a, 0xb77ad0, 0xf08a5a].map(lin);
const IRON = [0x2f3a36, 0x35393f, 0x3d3229].map(lin);
const WOOD = [0x7a5640, 0x6e4c38, 0x86603f].map(lin);

// ---- geometry: one bay 1.6 m wide (x), from its storey floor (y = 0) up, facade plane z = 0, +z out of the wall ----
// The painted window it covers (texture px -> m): glass x +-0.325, y 0.69..2.66; frame to +-0.39, 0.57..2.78;
// shutters +-0.375..0.575; sill +-0.44, 0.42..0.59; arched head: ellipse centre y 2.56.
const GL0 = 0.66, GL1 = 2.66, GX = 0.325, OX = 0.43, WX = 0.47, ZF = 0.09, ZG = 0.02, SPR = 2.56;
function sillAndGlass(b, arched) {
  const stone = lin(0xd9d1c1), sill = lin(0xcdc3b1), bar = lin(0xe6dfd0);
  // apron under the sill (covers the painted sill), then the sill slab with a drip
  b.colour(sill.clone().multiplyScalar(0.92));
  b.box(-0.45, 0.4, 0, 0.45, 0.57, 0.03, 'nz');
  b.colour(sill);
  b.slab(-0.52, 0.56, -0.02, 0.52, 0.68, 0.2, 0.025, false);
  // glass: a dark pane, brighter at the top where it mirrors the sky
  const top = arched ? SPR : GL1, g0 = lin(0x22303c), g1 = lin(0x2c3d4c), g2 = lin(0x5d778a);
  const gv = (x, y, c) => { b.colour(c); b.v([x, y, ZG], [0, 0, 1]); };
  gv(-GX, GL0, g0); gv(GX, GL0, g0); gv(GX, top, g1);
  gv(-GX, GL0, g0); gv(GX, top, g1); gv(-GX, top, g2);
  if (arched) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI;
      gv(0, SPR, g1); gv(Math.cos(a0) * GX, SPR + Math.sin(a0) * 0.5, i < 3 ? g1 : g2); gv(Math.cos(a1) * GX, SPR + Math.sin(a1) * 0.5, i < 2 ? g1 : g2);
    }
  }
  // casement: mullion and transom (and, under an arch, two fanlight bars)
  b.colour(bar);
  b.box(-0.022, GL0, ZG, 0.022, arched ? SPR + 0.5 : GL1, ZG + 0.03, 'nz');
  b.box(-GX, 1.95, ZG, GX, 1.995, ZG + 0.03, 'nz');
  if (arched) {
    b.box(-GX, SPR - 0.02, ZG, GX, SPR + 0.02, ZG + 0.03, 'nz');
  } else {
    // a thin frame round the casements, inside the reveal
    b.box(-GX, GL1 - 0.05, ZG, GX, GL1, ZG + 0.03, 'nz');
    b.box(-GX, GL0, ZG, -GX + 0.045, GL1, ZG + 0.03, 'nz');
    b.box(GX - 0.045, GL0, ZG, GX, GL1, ZG + 0.03, 'nz');
  }
  b.colour(stone);
}
function squareBay() {
  const b = new GeoBuilder(true), stone = lin(0xe2dbcc);
  b.colour(stone);
  const pts = [[-GX, GL0, -1, 0], [-GX, GL1, -1, 1], [GX, GL1, 1, 1], [GX, GL0, 1, 0]];
  frontRing(b, pts, ZF, 0.006, ZG, [OX - GX, WX - OX]);
  fixWinding(b, 0);
  sillAndGlass(b, false);
  // hood cornice over the head
  b.colour(stone.clone().multiplyScalar(1.03));
  b.slab(-0.53, 2.86, -0.02, 0.53, 2.97, 0.15, 0.03, false);
  return b;
}
function archedBay() {
  const b = new GeoBuilder(true), stone = lin(0xe2dbcc);
  b.colour(stone);
  const pts = [[-GX, GL0, -1, 0], [-GX, SPR, -1, 0]];
  const n = 6, AY = 0.5;
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (i / n) * Math.PI, x = Math.cos(a) * GX, y = SPR + Math.sin(a) * AY;
    const nx = Math.cos(a) / GX, ny = Math.sin(a) / AY, l = Math.hypot(nx, ny);
    pts.push([x, y, nx / l, ny / l]);
  }
  pts.push([GX, SPR, 1, 0], [GX, GL0, 1, 0]);
  frontRing(b, pts, ZF, 0.006, ZG, [OX - GX, WX - OX]);
  fixWinding(b, 0);
  sillAndGlass(b, true);
  // keystone at the crown
  b.colour(stone.clone().multiplyScalar(1.04));
  b.bevel(-0.075, SPR + AY - 0.04, 0, 0.075, SPR + AY + 0.27, 0.13, 0.02, '');
  return b;
}
/** One louvred shutter leaf, centred on x = 0 (0.32 m wide), from y 0.64 to 2.72, standing off the wall. */
function shutterLeaf() {
  const b = new GeoBuilder(true), w = 0.16, y0 = 0.64, y1 = 2.72, z0 = 0.004, z1 = 0.05;
  b.colour(1, 1, 1);
  b.bevel(-w, y0, z0, w, y1, z1, 0.012, '');
  // stiles and rails stand proud, louvres slope between them
  const k = 0.82;
  b.colour(k, k, k);
  for (const [ya, yb] of [[y0 + 0.12, 1.58], [1.7, y1 - 0.12]]) {
    const n = Math.round((yb - ya) / 0.11);
    for (let i = 0; i < n; i++) {
      const s0 = ya + ((yb - ya) * i) / n, s1 = ya + ((yb - ya) * (i + 1)) / n;
      b.colour(0.78, 0.78, 0.78);
      b.quad([-w + 0.045, s0, z1 + 0.004], [w - 0.045, s0, z1 + 0.004], [w - 0.045, s1, z1 - 0.012], [-w + 0.045, s1, z1 - 0.012], [0, 0.6, 0.8]);
      b.colour(1.05, 1.05, 1.05);
      b.quad([-w + 0.045, s1 - 0.004, z1 - 0.012], [w - 0.045, s1 - 0.004, z1 - 0.012], [w - 0.045, s1, z1 + 0.012], [-w + 0.045, s1, z1 + 0.012], [0, 1, 0.3]);
    }
  }
  b.colour(1, 1, 1);
  b.box(-w, 1.58, z1, w, 1.7, z1 + 0.012, 'nz');
  return b;
}
function curtains() {
  const b = new GeoBuilder(true);
  for (const s of [-1, 1]) {
    const x0 = s * (GX - 0.01), w = 0.15, folds = 4;
    for (let i = 0; i < folds * 2; i++) {
      const xa = x0 - s * (w * i) / (folds * 2), xb = x0 - s * (w * (i + 1)) / (folds * 2);
      const nx = (i % 2 ? 0.45 : -0.45) * s, kk = i % 2 ? 0.86 : 1.04;
      b.colour(kk, kk, kk);
      b.quad([xa, GL0 + 0.05, ZG + 0.004], [xb, GL0 + 0.05, ZG + 0.004], [xb, GL1 - 0.08, ZG + 0.004], [xa, GL1 - 0.08, ZG + 0.004], [nx, 0, 1]);
    }
  }
  b.colour(0.93, 0.93, 0.93);
  b.quad([-GX, GL1 - 0.2, ZG + 0.005], [GX, GL1 - 0.2, ZG + 0.005], [GX, GL1 - 0.05, ZG + 0.005], [-GX, GL1 - 0.05, ZG + 0.005], [0, 0, 1]);
  return b;
}
/** The lower casement swung open on its left hinge (frame + glass), for an open window. */
function openLeaf() {
  const b = new GeoBuilder(true), t = new GeoBuilder(true), y0 = GL0 + 0.02, y1 = 1.93;
  t.colour(lin(0xe6dfd0));
  t.box(0, y0, 0, GX, y0 + 0.05, 0.035);
  t.box(0, y1 - 0.05, 0, GX, y1, 0.035);
  t.box(0, y0, 0, 0.045, y1, 0.035);
  t.box(GX - 0.045, y0, 0, GX, y1, 0.035);
  t.colour(lin(0x4a6476));
  t.quad([0.045, y0 + 0.05, 0.018], [GX - 0.045, y0 + 0.05, 0.018], [GX - 0.045, y1 - 0.05, 0.018], [0.045, y1 - 0.05, 0.018], [0, 0, 1]);
  t.quad([0.045, y1 - 0.05, 0.016], [GX - 0.045, y1 - 0.05, 0.016], [GX - 0.045, y0 + 0.05, 0.016], [0.045, y0 + 0.05, 0.016], [0, 0, -1]);
  b.append(t, new THREE.Matrix4().makeRotationY(-1.15).setPosition(-GX, 0, ZG + 0.03));
  return b;
}
/** A curtain blown out of an open window (it stirs in the shader: life of the street canyon). */
function curtainFlap() {
  const b = new GeoBuilder(true), rows = 6, x0 = -0.27, x1 = 0.06;
  const P = (u, v) => [x0 + (x1 - x0) * u + 0.06 * v * v, 1.9 - 1.15 * v, ZG + 0.05 + 0.42 * Math.pow(v, 1.6) + 0.03 * Math.sin(u * 6.28)];
  b.colour(1, 1, 1);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < 2; i++) {
      const u0 = i / 2, u1 = (i + 1) / 2, v0 = j / rows, v1 = (j + 1) / rows;
      b.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), [0, 0.3, 1]);
      b.quad(P(u0, v1), P(u1, v1), P(u1, v0), P(u0, v0), [0, -0.3, -1]);
    }
  return b;
}
const uTime = { value: 0 };
function octa(b, x, y, z, r, ry = r) {
  const P = [[x + r, y, z], [x, y + ry, z], [x - r, y, z], [x, y - ry * 0.4, z], [x, y, z + r], [x, y, z - r]];
  const F = [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [1, 0, 5], [2, 1, 5], [3, 2, 5], [0, 3, 5]];
  for (const [i, j, k] of F) {
    const c = [(P[i][0] + P[j][0] + P[k][0]) / 3 - x, (P[i][1] + P[j][1] + P[k][1]) / 3 - y, (P[i][2] + P[j][2] + P[k][2]) / 3 - z];
    b.tri(P[i], P[j], P[k], c);
  }
}
function flowerBox() {
  const b = new GeoBuilder(true), wood = lin(0x6d4a35), leaf = lin(0x4f7a3e), soil = lin(0x4a3628);
  b.colour(wood);
  b.box(-0.42, 0.66, 0.05, 0.42, 0.88, 0.32, 'nz');
  b.colour(wood.clone().multiplyScalar(1.18));
  b.box(-0.43, 0.84, 0.31, 0.43, 0.88, 0.335, 'nz');
  b.colour(soil);
  b.quad([-0.4, 0.885, 0.07], [0.4, 0.885, 0.07], [0.4, 0.885, 0.3], [-0.4, 0.885, 0.3], [0, 1, 0]);
  b.colour(leaf);
  for (let i = 0; i < 4; i++) octa(b, -0.3 + i * 0.2, 0.93, 0.19 + (i % 2) * 0.05, 0.12, 0.1);
  b.colour(leaf.clone().multiplyScalar(0.8));
  for (let i = 0; i < 3; i++) octa(b, -0.2 + i * 0.2, 0.86, 0.3, 0.07, 0.16);
  return b;
}
/** A clump of blossoms (white, tinted per instance), its origin at the clump's foot. */
function bloomClump() {
  const b = new GeoBuilder(true);
  b.colour(1, 1, 1);
  octa(b, 0, 0.08, 0, 0.075, 0.07);
  octa(b, 0.07, 0.05, 0.03, 0.055, 0.05);
  octa(b, -0.06, 0.04, 0.04, 0.05, 0.05);
  return b;
}
/** A French balconette: iron rail across the lower casements. */
function rail() {
  const b = new GeoBuilder(true), z = 0.25;
  b.colour(1, 1, 1);
  b.box(-0.5, 1.6, z - 0.02, 0.5, 1.64, z + 0.025);
  b.box(-0.5, 0.74, z - 0.015, 0.5, 0.77, z + 0.015, 'ny');
  for (let i = 0; i <= 8; i++) {
    const x = -0.46 + (0.92 * i) / 8;
    b.box(x - 0.011, 0.77, z - 0.011, x + 0.011, 1.6, z + 0.011, 'nypy');
  }
  for (const s of [-1, 1]) b.box(s * 0.5 - 0.015, 1.6, 0.02, s * 0.5 + 0.015, 1.63, z, 'pz');
  // a scroll in the middle bay
  const pts = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 1.6; pts.push([Math.cos(a) * 0.11, 1.19 + Math.sin(a) * 0.11, z]); }
  b.tube(pts, 0.012, 4);
  return b;
}

/**
 * One metre of balcony balustrade (vase-shaped balusters on a bottom rail) facing +z, centred on x = 0, its foot on
 * the balcony floor: laid along the existing rails and posts of a balcony (mage-city.js townhouse) within range.
 */
function balustrade() {
  const b = new GeoBuilder(true), t = 0.025;
  b.colour(1, 1, 1);
  b.box(-0.5, 0.08, -0.03, 0.5, 0.16, 0.03);
  const L = [[0.16, 0.03], [0.28, 0.042], [0.42, 0.02], [0.66, 0.045], [0.86, 0.024], [0.93, 0.032]];
  for (let i = 0; i < 5; i++) {
    const x = -0.4 + i * 0.2;
    for (let k = 0; k < L.length - 1; k++) {
      const [y0, w0] = L[k], [y1, w1] = L[k + 1];
      for (const z of [t, -t]) b.quad([x - w0, y0, z], [x + w0, y0, z], [x + w1, y1, z], [x - w1, y1, z], [0, 0, z]);
      for (const sg of [-1, 1]) b.quad([x + sg * w0, y0, -t], [x + sg * w0, y0, t], [x + sg * w1, y1, t], [x + sg * w1, y1, -t], [sg, (w0 - w1) * 2, 0]);
    }
  }
  return b;
}

// ---- runtime: instanced meshes refilled around the camera ----
let state = null;
const CELL = 24;
function mk(builder, material, cap) {
  const geo = builder.geometry();
  const m = new THREE.InstancedMesh(geo, material, cap);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = false;
  m.receiveShadow = true;
  m.visible = false;
  m.name = 'cityBays';
  return m;
}
/**
 * Start the bay layer once every town house has registered its bays (layoutHouses): builds the grid, the seven
 * instanced meshes and the camera-driven refill (ctx.tick). No-op on tiers without modelled bays.
 */
export function startBays(ctx) {
  const R = bayRange(),
    n = bayCount();
  if (!R || !n || state) return null;
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rec[i * STRIDE] / CELL) * 4096 + Math.floor(rec[i * STRIDE + 2] / CELL);
    let l = grid.get(k);
    if (!l) grid.set(k, (l = []));
    l.push(i);
  }
  const cap = Math.min(n, 7000);
  const paint = toon(0xffffff, { vertexColors: true, surface: 'paint', look: { detail: 0.35 } }),
    wood = toon(0xffffff, { vertexColors: true, surface: 'wood', look: { detail: 0.45 } }),
    cloth = toon(0xffffff, { vertexColors: true, surface: 'cloth', look: { trans: 0.25 } }),
    petals = toon(0xffffff, { vertexColors: true, surface: 'paint', look: { trans: 0.3, detail: 0.3 } }),
    metal = toon(0xffffff, { vertexColors: true, surface: 'metal', look: { spec: 0.3, specPower: 30 } });
  const M = {
    sq: mk(squareBay(), paint, cap),
    ar: mk(archedBay(), paint, cap),
    leaf: mk(shutterLeaf(), wood, cap * 2),
    cur: mk(curtains(), cloth, cap),
    box: mk(flowerBox(), wood, Math.ceil(cap * 0.6)),
    bloom: mk(bloomClump(), petals, Math.ceil(cap * 1.8)),
    rail: mk(rail(), metal, Math.ceil(cap * 0.4)),
    bal: mk(balustrade(), wood, Math.ceil(cap * 0.3)),
    open: mk(openLeaf(), paint, Math.ceil(cap * 0.12)),
    flap: mk(curtainFlap(), flapMat(cloth), Math.ceil(cap * 0.12))
  };
  for (const m of Object.values(M)) G.scene.add(m);
  state = { R, grid, M, last: [1e9, 1e9, 1e9], frame: 0, n };
  ctx.tick(update);
  if (G.structures) G.structures.cityBays = bayStats; // probes: bays drawn now
  return state;
}
const _cnt = { sq: 0, ar: 0, leaf: 0, cur: 0, box: 0, bloom: 0, rail: 0, bal: 0, open: 0, flap: 0 };
/** The flap's cloth stirs: more at its free end, phase from where the window is (no per-instance attribute). */
function flapMat(base) {
  const m = own(base);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float fw = clamp((1.9 - position.y) / 1.15, 0.0, 1.0);
      float fph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
      transformed.z += (sin(uTime * 1.9 + fph) * 0.5 + 0.5) * 0.16 * fw * fw;
      transformed.x += sin(uTime * 1.3 + fph * 1.7) * 0.06 * fw;`);
  };
  m.customProgramCacheKey = () => 'cityBayFlap';
  return m;
}
let _fz = 1; // depth scale of the bays being written: they rise out of the wall over the last metres of the range
function put(m, key, x, y, z, c, s, sx, col) {
  const i = _cnt[key];
  if (i >= m.instanceMatrix.count) return;
  const a = m.instanceMatrix.array, o = i * 16;
  a[o] = c * sx; a[o + 1] = 0; a[o + 2] = -s * sx; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = s * _fz; a[o + 9] = 0; a[o + 10] = c * _fz; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
  const ca = m.instanceColor.array;
  ca[i * 3] = col.r; ca[i * 3 + 1] = col.g; ca[i * 3 + 2] = col.b;
  _cnt[key] = i + 1;
}
const _tmp = new THREE.Color();
function update(dt) {
  uTime.value = (uTime.value + (dt || 0)) % 3600;
  const S = state;
  if (!S || !G.camera || (++S.frame & 1)) return;
  const e = G.camera.matrixWorld.elements, cx = e[12], cy = e[13], cz = e[14];
  const L = S.last;
  if ((cx - L[0]) ** 2 + (cy - L[1]) ** 2 + (cz - L[2]) ** 2 < 6.25) return;
  L[0] = cx; L[1] = cy; L[2] = cz;
  for (const k in _cnt) _cnt[k] = 0;
  const R = S.R, R2 = R * R, M = S.M;
  const gx0 = Math.floor((cx - R) / CELL), gx1 = Math.floor((cx + R) / CELL), gz0 = Math.floor((cz - R) / CELL), gz1 = Math.floor((cz + R) / CELL);
  for (let gx = gx0; gx <= gx1; gx++)
    for (let gz = gz0; gz <= gz1; gz++) {
      const l = S.grid.get(gx * 4096 + gz);
      if (!l) continue;
      for (let q = 0; q < l.length; q++) {
        const o = l[q] * STRIDE;
        const x = rec[o], y = rec[o + 1], z = rec[o + 2];
        const dx = cx - x, dy = cy - (y + 1.6), dz = cz - z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2) continue;
        const yaw = rec[o + 3], s = Math.sin(yaw), c = Math.cos(yaw), f = rec[o + 5], sx = rec[o + 4];
        _fz = Math.min(1, Math.max(0.4, (R - Math.sqrt(d2)) / 9));
        if (f & BAY.PANEL) {
          put(M.bal, 'bal', x, y, z, c, s, sx, WOOD[rec[o + 6]]);
          continue;
        }
        if (dx * s + dz * c < -0.5) continue; // the facade faces away (or the camera is inside the house)
        const tint = TINT[rec[o + 6]];
        put(f & BAY.ARCH ? M.ar : M.sq, f & BAY.ARCH ? 'ar' : 'sq', x, y, z, c, s, sx, tint);
        if (f & BAY.SHUT) {
          const col = SHUTTER[rec[o + 7]];
          // open: one leaf each side of the surround; closed: the two leaves over the glass, inside the reveal
          const off = f & BAY.CLOSED ? 0.163 : 0.63, zo = f & BAY.CLOSED ? 0.018 : 0.0;
          for (const sg of [-1, 1]) {
            const lx = sg * off * sx;
            put(M.leaf, 'leaf', x + c * lx + s * zo, y, z - s * lx + c * zo, c, s, sx, col);
          }
        }
        if (f & BAY.CURTAIN) put(M.cur, 'cur', x, y, z, c, s, sx, CURTAIN[rec[o + 8]]);
        if (f & BAY.OPEN) {
          put(M.open, 'open', x, y, z, c, s, sx, tint);
          put(M.flap, 'flap', x, y, z, c, s, sx, CURTAIN[rec[o + 8]]);
        }
        if (f & BAY.RAIL) put(M.rail, 'rail', x, y, z, c, s, sx, IRON[rec[o + 7] % 3]);
        if (f & BAY.BOX) {
          put(M.box, 'box', x, y, z, c, s, sx, tint);
          const sd = rec[o + 10];
          for (let i = 0; i < 3; i++) {
            const lx = (-0.26 + i * 0.26 + (hash01(sd, i) - 0.5) * 0.08) * sx, lz = 0.16 + 0.06 * hash01(sd + 1, i), ly = 0.93 + 0.05 * hash01(sd + 2, i);
            _tmp.copy(BLOOM[(rec[o + 9] + i * (i === 1 ? 2 : 1)) % BLOOM.length]);
            put(M.bloom, 'bloom', x + c * lx + s * lz, y + ly, z - s * lx + c * lz, c, s, 1, _tmp);
          }
        }
      }
    }
  for (const k in M) {
    const m = M[k], n = _cnt[k];
    m.count = n;
    m.visible = n > 0;
    if (!n) continue;
    m.instanceMatrix.clearUpdateRanges();
    m.instanceMatrix.addUpdateRange(0, n * 16);
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.clearUpdateRanges();
    m.instanceColor.addUpdateRange(0, n * 3);
    m.instanceColor.needsUpdate = true;
  }
}
/** Debug / probes: bays drawn now per mesh. */
export function bayStats() {
  return state ? { range: state.R, bays: state.n, ...Object.fromEntries(Object.entries(state.M).map(([k, m]) => [k, m.visible ? m.count : 0])) } : null;
}
