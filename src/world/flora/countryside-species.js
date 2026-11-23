// Procedural countryside species (map round, 2026-11-22): crops, hedges, heath, walls, fences, bales and three trees.
// Registered into procgen's EXTRA_RECIPES, so they go through the same instanced batches, wind, culling, fading,
// burning and crater removal as every other plant (species.js lists their kind / draw distance).
//   lavender  a round tuft of grey-green stems with purple flower spikes (spikes take the instance tint)
//   wheat     a tuft of straw stalks with plump ears (ears take the tint: gold wheat, green-gold barley)
//   heather   a low wide mound of fine foliage (tinted mauve / rose); gorse: dark mound with yellow flower specks
//   hedge     a dense two-metre bush, planted shoulder to shoulder along field edges
//   oak       a broad landmark tree with a low wide crown; apple: a small orchard tree with red fruit; hawthorn: a wind-bent
//             lone tree in blossom on the moor and the pass
//   drywall   2.4 m of dry-stone wall laid along local +x: the sculpted wall (laidWall) or the old coursed boxes
//   fence     3 m of post-and-rail fence along local +x; haybale: a round bale lying on its side
import * as THREE from 'three';
import { mulberry32 } from '../../core/util.js';
import { TILE } from './atlas.js';
import { foliageAtlas } from './atlas.js';
import { EXTRA_RECIPES, PROC } from './procgen.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { familyParts } from '../rock-family.js';

const { GB, model, bush, broadTree, LEAF_LOOK, DS, lin } = PROC;

// a flat ribbon from a to b (width w at a, w2 at b), normal roughly up / sideways for soft lighting
function ribbon(gb, a, b, w, w2, shadeA, shadeB, side) {
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const l = Math.hypot(dx, dz) || 1;
  const sx = side ? side[0] : -dz / l, sz = side ? side[1] : dx / l;
  const n = [sx * 0.3, 1, sz * 0.3];
  const i0 = gb.v(a[0] - sx * w, a[1], a[2] - sz * w, n[0], n[1], n[2], shadeA);
  const i1 = gb.v(a[0] + sx * w, a[1], a[2] + sz * w, n[0], n[1], n[2], shadeA);
  const i2 = gb.v(b[0] + sx * w2, b[1], b[2] + sz * w2, n[0], n[1], n[2], shadeB);
  const i3 = gb.v(b[0] - sx * w2, b[1], b[2] - sz * w2, n[0], n[1], n[2], shadeB);
  gb.q(i0, i1, i2, i3);
}
// a spindle (two crossed diamonds) from base c along axis d, length L, half width w
function spindle(gb, c, d, L, w, shade, yaw) {
  for (let k = 0; k < 2; k++) {
    const a = yaw + k * Math.PI / 2, sx = Math.cos(a), sz = Math.sin(a);
    const top = [c[0] + d[0] * L, c[1] + d[1] * L, c[2] + d[2] * L];
    const mid = [c[0] + d[0] * L * 0.45, c[1] + d[1] * L * 0.45, c[2] + d[2] * L * 0.45];
    const n = [sz * 0.4, 0.8, -sx * 0.4];
    const b0 = gb.v(c[0], c[1], c[2], n[0], n[1], n[2], shade * 0.8);
    const l0 = gb.v(mid[0] - sx * w, mid[1], mid[2] - sz * w, n[0], n[1], n[2], shade * 0.95);
    const t0 = gb.v(top[0], top[1], top[2], n[0], n[1], n[2], shade * 1.12);
    const r0 = gb.v(mid[0] + sx * w, mid[1], mid[2] + sz * w, n[0], n[1], n[2], shade * 0.95);
    gb.q(b0, r0, t0, l0);
  }
}
/** Tuft of stems with spike heads. P: { n, H, R, headL, headW, stem (hex), stemW, droop, leaves } */
function spikes(P, seed) {
  const rnd = mulberry32(seed);
  const stems = new GB(), heads = new GB();
  for (let i = 0; i < P.n; i++) {
    const a = i * 2.39996 + rnd() * 0.5, r = P.R * Math.sqrt((i + 0.5) / P.n);
    const lean = P.lean * (0.4 + 0.6 * r / P.R);
    const h = P.H * (0.82 + rnd() * 0.3);
    const bx = Math.cos(a) * r * 0.25, bz = Math.sin(a) * r * 0.25;
    const tx = Math.cos(a) * (r + lean * h), tz = Math.sin(a) * (r + lean * h), ty = h - P.headL * 0.6;
    const mx = (bx + tx) / 2 + Math.cos(a) * P.droop * 0.3, mz = (bz + tz) / 2 + Math.sin(a) * P.droop * 0.3, my = ty * 0.55;
    ribbon(stems, [bx, 0, bz], [mx, my, mz], P.stemW, P.stemW * 0.85, 0.62, 0.8);
    ribbon(stems, [mx, my, mz], [tx, ty, tz], P.stemW * 0.85, P.stemW * 0.6, 0.8, 0.95);
    const dl = Math.hypot(tx - mx, ty - my, tz - mz) || 1;
    const d = [(tx - mx) / dl, (ty - my) / dl, (tz - mz) / dl];
    spindle(heads, [tx, ty, tz], d, P.headL, P.headW, 0.82 + rnd() * 0.18, rnd() * 3);
  }
  for (let k = 0; k < (P.leaves || 0); k++) { // narrow basal leaves
    const a = k * 2.1 + rnd(), L = P.H * 0.28 * (0.7 + rnd() * 0.5);
    ribbon(stems, [0, 0.02, 0], [Math.cos(a) * L, L * 0.55, Math.sin(a) * L], P.stemW * 2.2, P.stemW * 0.4, 0.55, 0.8);
  }
  return model([
    { geo: stems.build(), rule: { mode: 'mul', base: P.stem }, side: DS, mat: { look: LEAF_LOOK } },
    { geo: heads.build(), rule: { mode: 'tint', glow: 0.5 }, side: DS, mat: { look: { trans: 0.6, rim: 0.3, wrap: 0.55 } } },
  ]);
}

// ---------------------------------------------------------------- stone and timber
const box = (gb, cx, cy, cz, sx, sy, sz, ry, rz, col, faces = 0b111111, jit = null) => {
  // 8 corners, optional per-corner jitter (irregular stones); flat-shaded faces
  const cs = Math.cos(ry), sn = Math.sin(ry), cz2 = Math.cos(rz), sz2 = Math.sin(rz);
  const P = [];
  for (let k = 0; k < 8; k++) {
    let x = (k & 1 ? 1 : -1) * sx, y = (k & 2 ? 1 : -1) * sy, z = (k & 4 ? 1 : -1) * sz;
    if (jit) { x += jit[k * 3]; y += jit[k * 3 + 1]; z += jit[k * 3 + 2]; }
    const x1 = x * cz2 - y * sz2, y1 = x * sz2 + y * cz2;
    P.push([cx + x1 * cs + z * sn, cy + y1, cz - x1 * sn + z * cs]);
  }
  const F = [[0, 2, 6, 4, -1, 0, 0, 1], [1, 5, 7, 3, 1, 0, 0, 2], [0, 4, 5, 1, 0, -1, 0, 4], [2, 3, 7, 6, 0, 1, 0, 8], [0, 1, 3, 2, 0, 0, -1, 16], [4, 6, 7, 5, 0, 0, 1, 32]];
  for (const [a, b, c, d, , , , bit] of F) {
    if (!(faces & bit)) continue;
    const pa = P[a], pb = P[b], pc = P[c];
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
    let nx = uz * vy - uy * vz, ny = ux * vz - uz * vx, nz = uy * vx - ux * vy; // the corner table winds inward: flip
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const lit = 0.82 + 0.18 * ny;
    const c3 = typeof col === 'function' ? col(ny) : [col[0] * lit, col[1] * lit, col[2] * lit];
    const ids = [a, b, c, d].map((q) => gb.v(P[q][0], P[q][1], P[q][2], nx, ny, nz, c3));
    gb.q(ids[0], ids[3], ids[2], ids[1]);
  }
};
const STONES = [0xb3ab95, 0xa49e8c, 0xc1b8a0, 0x9d9a8d, 0xaea38a, 0x98968a].map(lin);
/**
 * The laid wall (round art-stone, tools/sculpt/assets/wall_drystone.mjs, G.sculpt type 'drywall'): three offset courses of
 * rounded through-stones, a leaning cope on edge, moss on the cope; segments continue the bond end to end. LOD by tier
 * (phones / low: the domed-fan LOD, about the old wall's cost). Moss rides in the same part via aMix (no added draw).
 */
function laidWall(G) {
  if (!G?.sculpt?.on?.('drywall')) return null;
  const q = G.quality || {};
  const P = familyParts('sculpt_wall_drystone', q.mobile || q.name === 'low' ? 1 : 0);
  if (!P) return null;
  const geos = [P.stone.clone(), P.moss?.clone()].filter(Boolean);
  geos.forEach((g, j) => g.setAttribute('aMix', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(j * 0.6), 1)));
  const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return model([{ geo, rule: { mode: 'mul' }, side: THREE.FrontSide, mat: { surface: 'rock', look: { rim: 0.2, wrap: 0.35 }, mix: [1, 1, 1, 1] } }]);
}
function drywall(seed) {
  const rnd = mulberry32(seed);
  const gb = new GB();
  const L = 2.4, H = 0.92, B = 0.32, T = 0.22; // half thickness at base / top
  const jit = () => Array.from({ length: 24 }, () => (rnd() - 0.5) * 0.045);
  let y = 0;
  const rows = [0.24, 0.2, 0.19, 0.16];
  rows.forEach((rh, r) => {
    let x = -L / 2 - rnd() * 0.25;
    const half = B + (T - B) * ((y + rh / 2) / H);
    while (x < L / 2) {
      const len = 0.28 + rnd() * 0.34, x0 = Math.max(-L / 2, x), x1 = Math.min(L / 2, x + len);
      if (x1 - x0 > 0.06) {
        const base = STONES[Math.floor(rnd() * STONES.length)], ao = 0.7 + 0.3 * (y / H) + (rnd() - 0.5) * 0.1;
        const col = [base[0] * ao, base[1] * ao, base[2] * ao];
        const ends = (x0 <= -L / 2 + 0.001 ? 1 : 0) | (x1 >= L / 2 - 0.001 ? 2 : 0);
        box(gb, (x0 + x1) / 2, y + rh / 2, (rnd() - 0.5) * 0.04, (x1 - x0) / 2 - 0.008, rh / 2 - 0.006, half + rnd() * 0.03, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05, col, 0b111000 | ends, jit());
      }
      x += len;
    }
    y += rh;
  });
  // cope stones on edge along the top
  let x = -L / 2 + 0.05;
  while (x < L / 2 - 0.06) {
    const w = 0.045 + rnd() * 0.035, h = 0.16 + rnd() * 0.09;
    const base = STONES[Math.floor(rnd() * STONES.length)], k = 0.95 + rnd() * 0.12;
    box(gb, x + w, y + h / 2 - 0.02, 0, w, h / 2, T + 0.02, 0, (rnd() - 0.5) * 0.3, (ny) => { const m = 0.84 + 0.16 * ny; return [base[0] * k * m * 0.92, base[1] * k * m, base[2] * k * m * 0.9]; }, 0b111000 | 3, jit());
    x += w * 2 + 0.012;
  }
  // a little moss along the foot (slightly proud, greenish)
  const moss = lin(0x7f8f5c);
  for (let k = 0; k < 3; k++) box(gb, -0.8 + k * 0.8 + (rnd() - 0.5) * 0.3, 0.06, (rnd() < 0.5 ? -1 : 1) * (B + 0.02), 0.25 + rnd() * 0.15, 0.06, 0.03, 0, 0, moss, 0b111000);
  const geo = gb.build();
  return model([{ geo, rule: { mode: 'mul' }, side: THREE.FrontSide, mat: { surface: 'rock', look: { rim: 0.2, wrap: 0.35 } } }]);
}
function fence(seed) {
  const rnd = mulberry32(seed);
  const gb = new GB();
  const wood = lin(0x8f7a5e), dark = lin(0x6e5d48);
  box(gb, -1.5, 0.55, 0, 0.065, 0.6, 0.065, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.06, dark, 0b111011);
  box(gb, 0, 0.5, 0, 0.05, 0.55, 0.05, 0.2, (rnd() - 0.5) * 0.06, dark, 0b111011);
  for (const [y, sag] of [[0.5, 0.03], [0.92, 0.04]]) {
    for (const [a, b] of [[-1.5, 0], [0, 1.5]]) {
      const m = (a + b) / 2, rz = (rnd() - 0.5) * 0.04;
      box(gb, m, y - sag * 0.5, 0.07, (b - a) / 2 + 0.04, 0.045, 0.028, 0, rz, wood, 0b111111);
    }
  }
  return model([{ geo: gb.build(), rule: { mode: 'mul' }, side: THREE.FrontSide, mat: { surface: 'wood', look: { rim: 0.2, wrap: 0.35 } } }]);
}
function haybale(seed) {
  const rnd = mulberry32(seed);
  const gb = new GB();
  const R = 0.72, Lh = 0.62, seg = 16;
  const straw = lin(0xd8bd70);
  const ring = [];
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const k = 0.86 + 0.14 * Math.max(0, sa) + (rnd() - 0.5) * 0.06;
    const c = [straw[0] * k, straw[1] * k, straw[2] * k];
    ring.push([gb.v(-Lh, R + sa * R, ca * R, 0, sa, ca, c), gb.v(Lh, R + sa * R, ca * R, 0, sa, ca, c)]);
  }
  for (let s = 0; s < seg; s++) gb.q(ring[s][0], ring[s][1], ring[s + 1][1], ring[s + 1][0]);
  for (const side of [-1, 1]) { // flat ends with a darker spiral of rolled straw
    const c0 = gb.v(side * Lh, R, 0, side, 0, 0, [straw[0] * 0.8, straw[1] * 0.78, straw[2] * 0.7]);
    const rim = [];
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2, sp = 0.86 + 0.1 * Math.sin(a * 3 + side);
      rim.push(gb.v(side * Lh, R + Math.sin(a) * R * 0.98, Math.cos(a) * R * 0.98, side, 0, 0, [straw[0] * sp, straw[1] * sp * 0.97, straw[2] * sp * 0.88]));
    }
    for (let s = 0; s < seg; s++) side > 0 ? gb.t(c0, rim[s + 1], rim[s]) : gb.t(c0, rim[s], rim[s + 1]);
  }
  return model([{ geo: gb.build(), rule: { mode: 'mul' }, side: THREE.FrontSide, mat: { surface: 'paint', look: { rim: 0.25, wrap: 0.45 } } }]);
}

// ---------------------------------------------------------------- trees
function withFruit(m, seed, n, size, colour, cy, rx, ry) {
  const rnd = mulberry32(seed ^ 0x9e37);
  const gb = new GB();
  for (let k = 0; k < n; k++) {
    const a = rnd() * Math.PI * 2, t = rnd() * 1.6 - 0.6, rr = Math.sqrt(Math.max(0.1, 1 - t * t));
    const p = [Math.cos(a) * rr * rx * 0.92, cy + t * ry * 0.75, Math.sin(a) * rr * rx * 0.92];
    PROC.bill(gb, p, size, TILE.blossom, [p[0], p[1] - cy + 0.4, p[2]], 1, null, rnd);
  }
  m.parts.push({ geo: gb.build({ uv: true, card: true }), rule: { mode: 'mul', base: colour, crown: true }, map: foliageAtlas(), side: DS, mat: { bill: true, tex: true, col2: lin(0x7a2a1e) } });
  return m;
}

Object.assign(EXTRA_RECIPES, {
  lavender: (G, s) => spikes({ n: 12, H: 0.62, R: 0.3, lean: 0.32, droop: 0.04, headL: 0.17, headW: 0.026, stemW: 0.006, stem: 0x7c9468, leaves: 5 }, s),
  wheat: (G, s) => spikes({ n: 18, H: 1.0, R: 0.46, lean: 0.06, droop: 0.02, headL: 0.13, headW: 0.03, stemW: 0.007, stem: 0xc6b16a, leaves: 3 }, s),
  heather: (G, s) => bush({ H: 0.5, R: 0.78, clumps: 5, cards: 4, tile: TILE.bush }, s),
  gorse: (G, s) => {
    const m = bush({ H: 1.05, R: 0.85, clumps: 6, cards: 5, tile: TILE.bush, berries: 30 }, s);
    const fl = m.parts[1];
    if (fl) { fl.rule = { mode: 'mul', base: 0xf3c63a }; fl.mat.col2 = lin(0xb88a18); }
    return m;
  },
  hedge: (G, s) => bush({ H: 2.05, R: 1.45, clumps: 9, cards: 6, tile: TILE.bush }, s),
  oak: (G, s) => broadTree({ H: 11, R: 6.6, shape: 'umbrella', clumps: 22, cards: 11, tile: TILE.broad, trunkR: 0.62, crownY: 0.52, clumpK: 0.4, bark: lin(0x5f4b3c) }, s),
  ancient: (G, s) => broadTree({ H: 44, R: 23, shape: 'umbrella', clumps: 44, cards: 12, tile: TILE.broad, trunkR: 2.6, crownY: 0.5, clumpK: 0.34, lean: 0.03, bark: lin(0x58463a) }, s),
  apple: (G, s) => withFruit(broadTree({ H: 4.6, R: 2.5, shape: 'dome', clumps: 10, cards: 8, tile: TILE.broad, trunkR: 0.2, crownY: 0.6, bark: lin(0x5e4a3a) }, s), s, 26, 0.17, 0xc9473a, 4.6 * 0.68, 2.5, 4.6 * 0.3),
  hawthorn: (G, s) => broadTree({ H: 5.4, R: 3.1, shape: 'umbrella', clumps: 11, cards: 10, tile: TILE.blossom, trunkR: 0.22, crownY: 0.6, lean: 0.14, cardK: 1.2, bark: lin(0x5a4639) }, s),
  drywall: (G, s) => laidWall(G) || drywall(s),
  fence: (G, s) => fence(s),
  haybale: (G, s) => haybale(s),
});
