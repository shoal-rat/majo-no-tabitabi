// Ground set-piece stone (round art-ground, 2026-11-24): the granite of the tors and the quarry's cut stone, built from
// exact planes with the facet kit (rock_facet.mjs) like the rock family. Vertex colour only, three LODs; the game bakes
// them into each landmark's rock mesh (src/world/landforms/setpieces.js, G.sculpt type 'ground').
//
//   node tools/sculpt/assets/ground_rocks.mjs [name ...]   -> assets/models/sculpt/ground_<name>.glb + .manifest.json,
//                                                             sheet in .tmp/sculpt/ground_rocks/
//
// Shapes (origin = foot centre, +Y up, ~1 m; the game fits each into the old piece's box):
//   ground_tor_a     a granite tor block: weathered pillow crown (wide chamfers), a sheet joint across it (two beds, the
//                    upper stepped back), a frost joint through the upper bed, moss in the top's hollow
//   ground_tor_b     a rounder, lower tor block, its sheet joint lower, split twice; for the tops of stacks
//   ground_quarry    a quarried block: a flat sawn face dressed in three shallow tooling planes, the arris along its top
//                    split by a row of plug-and-feather drill marks (narrow V joints), rough split back and flanks, a
//                    stepped bed at the top behind the marks, lichen on the old faces
//   ground_spoil     a quarry spoil heap: angular chips and flakes of the cut stone in a low mound, a few big ones on top
//   ground_quarry_face_a / _b   the old quarry face: unequal beds each set back from the one below, weathered rounded
//                    tops, chipped arrises, a joint through the upper beds, soil and grass on top
//   ground_quarry_half  a block half won from the face: fresh sawn block with drill marks, still joined at its back
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, prng, fbm, plane, planeD, norm, add, mul, ss, hex, bevelPiece, emitPiece, mossCap, stonePaint, hullPlanes, insetPlanes,
  FLOOR, Mesh, writeGLB, writeFragment, previewSheet,
} from './rock_facet.mjs';

export const PARTS = {
  stone: { name: 'Rock', surface: 'rock', look: { rim: 0.22, wrap: 0.3 } },
  moss: { name: 'Moss', surface: 'none', look: { rim: 0.3, wrap: 0.5 } },
};
const MOSS = (lod) => (lod === 0 ? { rings: 4, segs: 14 } : lod === 1 ? { rings: 2, segs: 10 } : { rings: 1, segs: 7 });
const opts = (lod) => ({ corners: lod === 0, minAngle: lod === 0 ? 0.2 : 0.3 });
/** a ring of side planes: [azimuth deg, distance, outward lean ny, at y] */
const ring = (list, kind = 'face') => list.map(([az, dist, ny = 0.05, y = 0]) => { const a = az * Math.PI / 180, n = norm([Math.sin(a), ny, Math.cos(a)]); return plane(n, [Math.sin(a) * dist, y, Math.cos(a) * dist], kind); });
/** bevel widths: granite weathers round (wide crown), cut stone keeps crisp arrises; joints get a small lip */
function widths(lod, H, { crown = 0.07, edge = 0.03, crack = 0.012, crownY = 0.5 } = {}) {
  return (e) => {
    if (e.ka === 'floor' || e.kb === 'floor') return 0;
    if (lod >= 2) return 0;
    const isCrack = e.ka === 'crack' || e.kb === 'crack';
    if (lod === 1 && (e.angle < 0.55 || isCrack)) return 0;
    if (e.corner) return lod === 0 ? edge * 0.8 : 0;
    if (isCrack) return crack;
    const up = Math.min(e.na[1], e.nb[1]) > -0.2 && Math.max(e.na[1], e.nb[1]) > 0.3;
    const k = up ? ss(crownY * H - 0.12, crownY * H + 0.12, e.mid[1]) : 0;
    return (edge + (crown - edge) * k) * (lod === 1 ? 1.2 : 1);
  };
}
/** a V joint between piece A (n.x <= c - g0 - k y) and piece B */
function joint(n, c, { g0 = -0.01, k = 0.05 } = {}) {
  const u = norm(n);
  return { a: planeD(add(u, [0, k, 0]), c - g0, 'crack'), b: planeD(add(mul(u, -1), [0, k, 0]), -(c + g0), 'crack') };
}

const SHAPES = {
  // granite tor block: eight leaning sides, a hipped pillow crown, a sheet joint at 55% (upper bed stepped back 4 cm),
  // a frost joint through the upper bed
  tor_a(lod) {
    const H = 0.6, mesh = new Mesh(), all = [];
    const sides = ring([[0, 0.43, 0.06], [45, 0.49, 0.1], [92, 0.52, 0.04], [138, 0.46, 0.09], [182, 0.42, 0.07], [228, 0.49, 0.08], [272, 0.53, 0.03], [318, 0.46, 0.1]]);
    const foot = ring([[30, 0.46, -0.35, 0.05], [150, 0.44, -0.3, 0.05], [260, 0.5, -0.32, 0.05]]);          // undercut by weathering
    const crown = ring([[20, 0.44, 2.4, 0.5], [110, 0.48, 2.1, 0.5], [200, 0.42, 2.5, 0.52], [290, 0.47, 2.2, 0.5]]);  // rounded shoulders
    const top = plane([0.05, 1, -0.04], [0, H, 0]), bed = 0.27;
    const paint = stonePaint({ H, seed: 61, warm: 0.25, base: 0.68 }), W = widths(lod, H, { crown: 0.085, edge: 0.04, crownY: 0.45 });
    const low = bevelPiece([...sides, ...foot, FLOOR(), planeD([0.04, 1, 0.02], bed, 'bed')], W, opts(lod));
    emitPiece(mesh, low, paint); all.push(low.planes);
    const upSides = insetPlanes([...sides, ...crown], (p) => (p.n[1] > 0.5 ? 0.03 : 0.035));
    const j = joint([1, 0, 0.35], 0.08, { g0: -0.012, k: 0.06 });
    for (const half of [j.a, j.b]) {
      const p = bevelPiece([...upSides, top, planeD([-0.04, -1, -0.02], -bed - 0.006, 'bed'), half], W, opts(lod));
      emitPiece(mesh, p, paint); all.push(p.planes);
    }
    mossCap(mesh, all, { at: [-0.12, -0.12], R: 0.2, T: 0.03, seed: 63, ...MOSS(lod) });
    return mesh;
  },
  // rounder, lower block (stack tops): ten sides, a lower sheet joint, the upper bed split twice
  tor_b(lod) {
    const H = 0.56, mesh = new Mesh(), all = [], rnd = prng(71);
    const sides = ring([...Array(10)].map((_, i) => [i * 36 + rnd() * 10, 0.44 + 0.06 * rnd(), 0.1 + 0.06 * rnd()]));
    const crown = ring([[0, 0.42, 1.9, 0.42], [72, 0.44, 2.0, 0.4], [144, 0.4, 1.7, 0.44], [216, 0.45, 2.1, 0.41], [288, 0.42, 1.9, 0.42]]);
    const top = plane([-0.06, 1, 0.05], [0, H, 0]), bed = 0.24;
    const paint = stonePaint({ H, seed: 73, warm: 0.3, base: 0.67 }), W = widths(lod, H, { crown: 0.08, edge: 0.032, crownY: 0.45 });
    const low = bevelPiece([...sides, FLOOR(), planeD([0, 1, 0.03], bed, 'bed')], W, opts(lod));
    emitPiece(mesh, low, paint); all.push(low.planes);
    const up = [...insetPlanes([...sides, ...crown], () => 0.035), top, planeD([0, -1, -0.03], -bed - 0.006, 'bed')];
    const j1 = joint([1, 0, -0.2], -0.12, { g0: -0.01, k: 0.07 }), j2 = joint([1, 0, 0.3], 0.16, { g0: -0.01, k: 0.07 });
    for (const pl of [[j1.a], [j1.b, j2.a], [j2.b]]) {
      const p = bevelPiece([...up, ...pl], W, opts(lod));
      emitPiece(mesh, p, paint); all.push(p.planes);
    }
    mossCap(mesh, all, { at: [0.02, 0.06], R: 0.17, T: 0.028, seed: 77, ...MOSS(lod) });
    return mesh;
  },
  // a quarried block (unit ~0.9 x 1 x 0.9): the sawn face looks +z
  quarry(lod) {
    const H = 1.0, mesh = new Mesh(), all = [], rnd = prng(81);
    const front = 0.42, back = -0.4, sideX = 0.45, top = H, band = 0.3, deep = 0.075;
    // the sawn face in three shallow tooling planes (convex: the tilt rises up the face), crisp, pale and fresh
    const face = [plane([0, -0.05, 1], [0, 0.2, front], 'face', { fresh: 1 }), plane([0, 0.0, 1], [0, 0.55, front + 0.008], 'face', { fresh: 1 }), plane([0, 0.06, 1], [0, 0.85, front - 0.004], 'face', { fresh: 1 })];
    // split (old) back and flanks: a few rough planes
    const rough = [plane([0.08, 0.02, -1], [0, 0, back]), plane([-0.12, 0.05, -1], [-0.2, 0, back + 0.03]), plane([1, 0.03, 0.06], [sideX, 0, 0]), plane([1, 0.08, -0.15], [sideX - 0.02, 0, -0.2]),
      plane([-1, 0.03, 0.04], [-sideX, 0, 0]), plane([-1, 0.1, -0.12], [-sideX + 0.03, 0, -0.2])];
    const env = [...face, ...rough];
    const paint0 = stonePaint({ H, seed: 83, warm: 0.35, base: 0.66 });
    const paint = (c) => {
      const v = paint0(c);
      if (c.n[2] > 0.95 && c.p[2] > front - 0.05) return v.map((x) => x * 1.12);                    // fresh sawn stone, paler
      if (c.kind === 'crack') return v.map((x) => x * 0.8);
      return [v[0] * 1.0, v[1] * 1.01, v[2] * 0.93];                                                   // weathered, faintly lichened
    };
    const W = widths(lod, H, { crown: 0.03, edge: 0.022, crack: 0.004, crownY: 0.8 });
    // body below the band
    const body = bevelPiece([...env, FLOOR(), planeD([0, 1, 0], top - band, 'bed')], W, opts(lod));
    emitPiece(mesh, body, paint); all.push(body.planes);
    // behind the band: the upper bed stepped back 3 cm on top
    const rear = bevelPiece([...env, plane([0, 1, 0.02], [0, top - 0.004, 0]), planeD([0, -1, 0], -(top - band) - 0.004, 'bed'), planeD([0, 0, 1], front - deep, 'crack')], W, opts(lod));
    emitPiece(mesh, rear, paint); all.push(rear.planes);
    // the band along the sawn arris: slices between the drill marks (V joints that open toward the face)
    const n = lod === 2 ? 3 : 6, x0 = -sideX + 0.02, x1 = sideX - 0.02;
    for (let i = 0; i < n; i++) {
      const a = x0 + (x1 - x0) * (i / n), b = x0 + (x1 - x0) * ((i + 1) / n), g = 0.004;
      const pl = [...env, plane([0, 1, 0.02], [0, top - 0.004, 0]), planeD([0, -1, 0], -(top - band) - 0.004, 'bed'), planeD([0, 0, -1], -(front - deep) - 0.004, 'crack')];
      // x >= a + g + k (z - zb) and x <= b - g - k (z - zb): the joint 2.4 cm wide at the back, opening toward the face
      const k = 0.14, zb = front - deep, L = Math.hypot(1, k);
      if (i > 0) pl.push(planeD([-1, 0, k], (-(a + g) + k * zb) / L, 'crack'));
      if (i < n - 1) pl.push(planeD([1, 0, k], (b - g + k * zb) / L, 'crack'));
      const p = bevelPiece(pl, W, opts(lod));
      emitPiece(mesh, p, paint, { tag: 'band' }); all.push(p.planes);
    }
    mossCap(mesh, all, { at: [-0.18, -0.24], R: 0.14, T: 0.022, seed: 87, maxSlope: 0.6, ...MOSS(lod) });
    void rnd;
    return mesh;
  },
  // the old quarry face: bedded rock cut long ago — unequal beds, each cut face set back a little from the one below,
  // weathered rounded tops, chipped arrises, a joint through the upper beds, soil and grass on top
  quarry_face_a(lod) { return faceRock(lod, { seed: 101, beds: [0, 0.34, 0.58, 1.0], steps: [0, 0.035, 0.09], W: 1.0, D: 0.9, joint: 0.12, chips: [1, -1, 1] }); },
  quarry_face_b(lod) { return faceRock(lod, { seed: 131, beds: [0, 0.46, 0.66, 0.82, 1.0], steps: [0, 0.05, 0.03, 0.11], W: 1.0, D: 0.85, joint: -0.18, chips: [-1, 1, -1, 1] }); },
  // a block half won from the face: a fresh sawn block on its bed, cut free at the front and sides, still joined to the
  // rock behind by its back (a narrow channel), the drill marks along its top arris
  quarry_half(lod) {
    const mesh = new Mesh(), all = [], H = 1.0;
    const W = widths(lod, H, { crown: 0.05, edge: 0.022, crack: 0.004, crownY: 0.8 });
    const old = stonePaint({ H, seed: 141, warm: 0.5, base: 0.6 }), fresh = stonePaint({ H, seed: 143, warm: 0.3, base: 0.72 });
    const rough = (x0, x1, z0, z1, y0, y1, extra = []) => [plane([-1, 0.04, 0.08], [x0, 0, 0]), plane([1, 0.05, -0.06], [x1, 0, 0]), plane([0.05, 0.03, -1], [0, 0, z0]),
      plane([0, 0.02, 1], [0, 0, z1]), planeD([0, -1, 0], -y0, y0 > 0 ? 'bed' : 'floor'), plane([0.04, 1, -0.05], [0, y1, 0]), ...extra];
    const base = bevelPiece(rough(-0.5, 0.5, -0.45, 0.46, 0, 0.32), W, opts(lod));
    emitPiece(mesh, base, old); all.push(base.planes);
    const rear = bevelPiece(rough(-0.5, 0.5, -0.45, -0.14, 0.326, 1.0, [plane([0, 0.6, 1], [0, 0.95, -0.12])]), widths(lod, H, { crown: 0.08, edge: 0.03, crownY: 0.7 }), opts(lod));
    emitPiece(mesh, rear, old); all.push(rear.planes);
    // the block: sawn front and flanks, its bed 4 mm above the base, the channel behind it
    const bx = 0.37, front = 0.4, top = 0.86, band = 0.2, deep = 0.06;
    const env = [plane([0, -0.03, 1], [0, 0.5, front], 'face'), plane([-1, 0, 0], [-bx, 0, 0]), plane([1, 0, 0], [bx, 0, 0]), planeD([0, 0, -1], 0.1, 'crack')];
    const paintB = (c) => { const v = fresh(c); return c.kind === 'crack' ? v.map((x) => x * 0.75) : v; };
    const body = bevelPiece([...env, planeD([0, -1, 0], -0.324, 'bed'), planeD([0, 1, 0], top - band, 'bed')], W, opts(lod));
    emitPiece(mesh, body, paintB); all.push(body.planes);
    const rearBand = bevelPiece([...env, plane([0, 1, 0], [0, top, 0]), planeD([0, -1, 0], -(top - band) - 0.004, 'bed'), planeD([0, 0, 1], front - deep, 'crack')], W, opts(lod));
    emitPiece(mesh, rearBand, paintB); all.push(rearBand.planes);
    const n = lod === 2 ? 3 : 5, k = 0.14, zb = front - deep, L = Math.hypot(1, k);
    for (let i = 0; i < n; i++) {
      const a = -bx + 0.01 + (2 * bx - 0.02) * (i / n), b = -bx + 0.01 + (2 * bx - 0.02) * ((i + 1) / n), g = 0.004;
      const pl = [...env, plane([0, 1, 0], [0, top, 0]), planeD([0, -1, 0], -(top - band) - 0.004, 'bed'), planeD([0, 0, -1], -(front - deep) - 0.004, 'crack')];
      if (i > 0) pl.push(planeD([-1, 0, k], (-(a + g) + k * zb) / L, 'crack'));
      if (i < n - 1) pl.push(planeD([1, 0, k], (b - g + k * zb) / L, 'crack'));
      const pc = bevelPiece(pl, W, opts(lod)); emitPiece(mesh, pc, paintB); all.push(pc.planes);
    }
    mossCap(mesh, [rear.planes], { at: [0.05, -0.3], R: 0.24, T: 0.045, seed: 147, maxSlope: 0.7, lip: 0.01, top: hex(0x6f8c46), edge: hex(0x5f5a3b), ...MOSS(lod) });
    return mesh;
  },
  // spoil heap: chips and flakes piled in a low mound (~1.5 m across, 0.5 m high)
  spoil(lod) {
    const mesh = new Mesh(), rnd = prng(91), all = [];
    const n = lod === 0 ? 17 : lod === 1 ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.62 * (i < 4 ? 0.4 : 1);
      const big = i < 4, s = big ? 0.2 + 0.08 * rnd() : 0.09 + 0.1 * rnd();
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const ground = 0.2 * Math.max(0, 1 - (r / 0.72) ** 2);              // the mound's surface under it
      const flat = rnd() < 0.35 ? 0.45 : 0.85;                           // flakes lie flat
      const sz = [s * (0.9 + 0.4 * rnd()), s * flat, s * (0.8 + 0.4 * rnd())];
      const pl = [...hullPlanes(rnd, { size: sz, c: [cx, ground + sz[1] * 0.5, cz], count: 7, cut: [0.78, 1], tilt: 0.6, noUnder: false }), FLOOR(Math.max(0, ground - sz[1] * 0.3))];
      const H = ground + sz[1];
      const p = bevelPiece(pl, widths(lod, H, { crown: 0.018, edge: 0.012, crownY: 0 }), opts(lod));
      if (!p.faces.length) continue;
      emitPiece(mesh, p, stonePaint({ H: 0.5, seed: 93 + i, warm: 0.4, base: rnd() < 0.3 ? 0.58 : 0.7 })); all.push(p.planes);
    }
    // the mound itself: a low dark heap of grit under the chips
    const mound = bevelPiece([...hullPlanes(rnd, { size: [0.78, 0.2, 0.7], c: [0, -0.02, 0], count: 11, cut: [0.9, 1], tilt: 0.2 }), plane([0, 1, 0], [0, 0.17, 0]), FLOOR()], () => 0, opts(2));
    emitPiece(mesh, mound, stonePaint({ H: 0.4, seed: 99, warm: 0.5, base: 0.5 }));
    if (lod < 2) mossCap(mesh, [mound.planes], { at: [0.35, -0.3], R: 0.16, T: 0.02, seed: 97, maxSlope: 1.4, ...MOSS(lod + 1) });
    void all;
    return mesh;
  },
};

/**
 * Bedded rock cut long ago (the old quarry face). o: { seed, beds: [y0, y1, ... top] (fractions of 1 m), steps: front
 * set-back of each bed, W, D, joint (x of a joint through the upper beds), chips: per bed, which front corner is broken }
 */
function faceRock(lod, o) {
  // (moss on the narrow bed ledges folded down the cut faces as green flags: left to the top's soil cushion)
  const mesh = new Mesh(), all = [], rnd = prng(o.seed), H = o.beds[o.beds.length - 1], W2 = o.W / 2, D2 = o.D / 2;
  const old = stonePaint({ H, seed: o.seed, warm: 0.5, base: 0.6 });
  // old faces: darker, rain-streaked down the cut, a damp foot; the ledges' tops bleached
  const paint = (c) => {
    const v = old(c);
    if (c.n[2] > 0.8) { const st = 0.88 + 0.12 * fbm(c.p[0] * 7 + o.seed, 0, c.p[2] * 3, o.seed + 1, 2); return v.map((x) => x * st); }
    return v;
  };
  const Wd = widths(lod, H, { crown: 0.09, edge: 0.03, crack: 0.01, crownY: 0.75 });
  const sides = [plane([-1, 0.04, 0.12 * (rnd() - 0.5)], [-W2, 0, 0]), plane([-1, 0.06, -0.3], [-W2 + 0.03, 0, -D2 * 0.6]),
    plane([1, 0.05, 0.12 * (rnd() - 0.5)], [W2, 0, 0]), plane([1, 0.03, -0.35], [W2 - 0.02, 0, -D2 * 0.6]),
    plane([0.1 * (rnd() - 0.5), 0.04, -1], [0, 0, -D2]), plane([0.4, 0.1, -1], [W2 * 0.6, 0, -D2 + 0.03])];
  const nb = o.beds.length - 1;
  for (let i = 0; i < nb; i++) {
    const y0 = o.beds[i], y1 = o.beds[i + 1], st = o.steps[i] || 0, tilt = (rnd() - 0.5) * 0.08;
    const pl = [...insetPlanes(sides, () => 0.012 * i), plane([0.05 * (rnd() - 0.5), tilt, 1], [0, (y0 + y1) / 2, D2 - st], 'face')];
    pl.push(i ? planeD([0, -1, 0], -y0 - 0.005, 'bed') : FLOOR());
    if (i < nb - 1) pl.push(planeD([0.02 * (rnd() - 0.5), 1, 0.03 * (rnd() - 0.5)], y1, 'bed'));
    else pl.push(plane([0.08 * (rnd() - 0.5), 1, -0.06], [0, y1, 0]), plane([0, 1, 0.9], [0, y1 - 0.06, D2 - st - 0.02]));   // weathered crown rolling over the face
    // a chipped arris: a front corner broken off
    const ch = o.chips?.[i];
    if (ch) pl.push(plane([ch * 0.65, 0.35, 0.68], [ch * (W2 - 0.08 - 0.05 * rnd()), y1 - 0.02, D2 - st - 0.03]));
    // the joint through the upper beds
    const pieces = i >= nb - 2 && o.joint !== undefined ? (() => { const u = norm([1, 0, 0.25]); return [[planeD(add(u, [0, 0.06, 0]), o.joint + 0.006, 'crack')], [planeD(add(mul(u, -1), [0, 0.06, 0]), -o.joint + 0.006, 'crack')]]; })() : [[]];
    for (const extra of pieces) {
      const p = bevelPiece([...pl, ...extra], Wd, opts(lod));
      if (!p.faces.length) continue;
      emitPiece(mesh, p, paint); all.push(p.planes);
    }
  }
  // soil and grass on the top: a broad, thick cushion that browns toward its rim
  mossCap(mesh, all, { at: [(rnd() - 0.5) * 0.2, -0.08], R: 0.34, T: 0.06, seed: o.seed + 9, maxSlope: 1.3, top: hex(0x71904a), edge: hex(0x655e40), ...MOSS(lod) });
  return mesh;
}

export const NAMES = Object.keys(SHAPES);
export const buildShape = (name) => [0, 1, 2].map((l) => SHAPES[name](l));

async function main(names) {
  const out = path.join(ROOT, '.tmp/sculpt/ground_rocks');
  const items = [];
  for (const nm of names) {
    const lods = buildShape(nm), name = 'ground_' + nm;
    const res = await writeGLB(path.join(ROOT, 'assets/models/sculpt', name + '.glb'), name, lods, PARTS, { family: 'ground_rocks', shape: nm });
    const b = lods[0].bounds();
    writeFragment(name, {
      size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]], tris: res.tris, parts: PARTS, source: 'tools/sculpt/assets/ground_rocks.mjs (facet kit, rock_facet.mjs)',
      notes: `Facet stone (${nm}) for the landmark rock set pieces: exact planes with bevelled edges, beds / joints / drill marks as geometry, moss cushion as its own primitive (Moss_none). Vertex colour only (COLOR_0 linear rgb, neutral stone ~#9b9b9b). LOD tris ${res.tris.join(' / ')}. Origin = foot centre, ~1 m unit; src/world/landforms/setpieces.js fits it into each piece's box.`,
    });
    console.log(name.padEnd(16), 'tris', res.tris.join(' / '), ' ', res.kb, 'KB');
    items.push({ mesh: lods[0], az: 30, label: nm + ' L0 ' + res.tris[0] }, { mesh: lods[0], az: 200, el: 28, label: 'back' }, { mesh: lods[1], az: 30, label: 'L1 ' + res.tris[1], wire: true }, { mesh: lods[2], az: 30, label: 'L2 ' + res.tris[2] });
  }
  await previewSheet(path.join(out, 'sheet.png'), 'GROUND ROCKS - FACET KIT', items);
  console.log('sheet .tmp/sculpt/ground_rocks/sheet.png');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  main(a.length ? a : NAMES).catch((e) => { console.error(e); process.exit(1); });
}
