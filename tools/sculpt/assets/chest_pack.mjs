// The puzzle chests' pack chest (gameplay/wilds-puzzles.js makeChestAt): a traveller's iron-banded chest — red-brown
// planks laid in three courses with real gaps, corner posts, a skid, iron bands wrapping the body and riveted over the
// barrel lid, brass corner caps, lock plate with keyhole, hasp and side ring handles; the lid's staves follow the arc and
// its gable ends are bevelled boards. Two GLBs: chest_pack (body) and chest_pack_lid (origin at the hinge line, which the
// game puts at (0, 0.54, -0.31) on the body and swings about X). Footprint as the game's chest (1.0 x 0.62 m, 0.85 m tall)
// so the chest's interact radius, collider and the glowing inside (game side) keep fitting. Front = +Z.
import { Mesh, prng, fbm, add, mul, norm, ss, C, mixc, scalec, piece, boxFT, beam, tube, planeD, frame } from './props_activity_lib.mjs';

export const PARTS = {
  wood: { name: 'ChestWood', surface: 'wood', look: { detail: 0.35, rim: 0.3 } },
  metal: { name: 'ChestIron', surface: 'metal', look: { spec: 0.6, specPower: 44, rim: 0.45 } },
};
const WOOD = C(0x9a5236), WOOD_D = C(0x5e3a28), CORE = C(0x3a2418), IRON = C(0x585c66), BRASS = C(0xcfa651);
const W = 1.0, D = 0.62, Y0 = 0.06, Y1 = 0.54;

const L = [
  { bev: 0.008, rivets: true, sides: 8, arc: 7, tube: 6 },
  { bev: 0.012, rivets: false, sides: 6, arc: 5, tube: 4 },
  { bev: 0, rivets: false, sides: 4, arc: 4, tube: 3 },
];
/** plank paint: grain streaks along `axis`, darker worn ends, sun-bleached top, a plank-to-plank tone */
const plank = (tone, axis = 0, seed = 1) => (c) => {
  const p = c.p, g = fbm(p[0] * (axis === 0 ? 2 : 40), p[1] * (axis === 1 ? 2 : 40), p[2] * (axis === 2 ? 2 : 40), seed, 2);
  const base = scalec(mixc(WOOD, WOOD_D, 0.12 + 0.18 * g), tone);
  return scalec(base, (1 + 0.1 * c.chamfer) * (1 + 0.06 * ss(0.3, 0.9, c.n[1])));
};
const metal = (col) => (c) => scalec(col, (1 + 0.18 * c.chamfer) * (0.94 + 0.08 * Math.max(0, c.n[1])));

function body(lod) {
  const o = L[lod], m = new Mesh(), r = prng(3301), bev = o.bev;
  const P = (sz, at, col, part = 'wood', b = bev) => boxFT(m, [at[0] - sz[0] / 2, at[1] - sz[1] / 2, at[2] - sz[2] / 2, at[0] + sz[0] / 2, at[1] + sz[1] / 2, at[2] + sz[2] / 2], { bevel: b, part, col });
  // skid and the dark core that shows in the plank gaps
  P([W + 0.06, 0.06, D + 0.06], [0, 0.03, 0], plank(0.62, 0, 2), 'wood', bev * 1.5);
  P([W - 0.07, 0.47 - Y0, D - 0.07], [0, (Y0 + 0.47) / 2, 0], () => CORE, 'wood', 0);
  // planks: three courses on each face, small gaps and offsets (each its own tone)
  const n = 3, ph = (Y1 - Y0) / n;
  for (let i = 0; i < n; i++) {
    const y = Y0 + ph * (i + 0.5);
    for (const s of [-1, 1]) {
      const t1 = 0.86 + r() * 0.2, t2 = 0.86 + r() * 0.2, j = (r() - 0.5) * 0.006;
      P([W - 0.1, ph - 0.014, 0.036], [j, y, s * (D / 2 - 0.018)], plank(t1, 0, 10 + i * 2 + s));
      P([0.036, ph - 0.014, D - 0.1], [s * (W / 2 - 0.018), y, j], plank(t2, 2, 20 + i * 2 + s));
    }
  }
  // corner posts and brass caps top and bottom
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P([0.075, Y1 - Y0 + 0.02, 0.075], [sx * (W / 2 - 0.03), (Y0 + Y1) / 2, sz * (D / 2 - 0.03)], plank(0.72, 1, 30 + sx + sz * 2), 'wood', bev * 1.3);
    if (lod < 2) for (const yy of [Y0 + 0.045, Y1 - 0.03]) P([0.105, 0.09, 0.105], [sx * (W / 2 - 0.03), yy, sz * (D / 2 - 0.03)], metal(BRASS), 'metal', bev * 1.4);
  }
  // iron bands round the body (front, under, back) with rivets; the rim band
  for (const bx of [-0.3, 0.3]) {
    for (const s of [-1, 1]) P([0.07, Y1 - Y0, 0.016], [bx, (Y0 + Y1) / 2, s * (D / 2 + 0.008)], metal(IRON), 'metal', bev * 0.6);
    if (o.rivets) for (const s of [-1, 1]) for (const y of [Y0 + 0.06, (Y0 + Y1) / 2, Y1 - 0.07]) P([0.022, 0.022, 0.012], [bx, y, s * (D / 2 + 0.02)], metal(scalec(IRON, 1.15)), 'metal', 0.005);
  }
  // the rim band: a frame round the mouth (open inside: the game's gold glow shows when the lid lifts)
  for (const s of [-1, 1]) {
    P([W + 0.02, 0.05, 0.05], [0, Y1 - 0.02, s * (D / 2 - 0.015)], metal(IRON), 'metal', bev * 0.8);
    P([0.05, 0.05, D - 0.08], [s * (W / 2 - 0.015), Y1 - 0.02, 0], metal(IRON), 'metal', bev * 0.8);
  }
  // lock plate (brass, keyhole) and the staple the hasp drops over
  P([0.17, 0.17, 0.024], [0, Y1 - 0.11, D / 2 + 0.014], metal(BRASS), 'metal', bev);
  P([0.026, 0.05, 0.01], [0, Y1 - 0.13, D / 2 + 0.03], () => scalec(CORE, 0.6), 'metal', 0);
  if (lod < 2) P([0.05, 0.03, 0.03], [0, Y1 - 0.045, D / 2 + 0.035], metal(scalec(IRON, 1.1)), 'metal', 0.004);
  // side ring handles on mount plates
  for (const s of [-1, 1]) {
    P([0.02, 0.07, 0.15], [s * (W / 2 + 0.01), Y1 - 0.14, 0], metal(IRON), 'metal', bev * 0.6);
    if (lod < 2) {
      const pts = []; for (let k = 0; k <= o.arc; k++) { const a = Math.PI * (k / o.arc); pts.push([s * (W / 2 + 0.035), Y1 - 0.15 - Math.sin(a) * 0.075, Math.cos(a) * 0.075]); }
      tube(m, pts, { r: 0.012, sides: o.tube, part: 'metal', col: scalec(IRON, 1.1), cap0: 'flat', cap1: 'flat' });
    }
  }
  return m;
}

function lid(lod) {
  const o = L[lod], m = new Mesh(), r = prng(3302), bev = o.bev;
  // lid space: hinge line at the origin, the lid runs +Z over the depth; arc of the barrel top in (y, z)
  const arc = (th) => [0.08 + Math.sin(th) * 0.19, D / 2 - Math.cos(th) * D / 2];
  const N = o.arc, pts = [], nrms = [];
  for (let i = 0; i <= N; i++) { const th = (i / N) * Math.PI; pts.push(arc(th)); const ny = (D / 2) * Math.sin(th), nz = -0.19 * Math.cos(th), l = Math.hypot(ny, nz); nrms.push([ny / l, nz / l]); }
  const off = (i, d) => [pts[i][0] + nrms[i][0] * d, pts[i][1] + nrms[i][1] * d];
  boxFT(m, [-W / 2, 0, 0, W / 2, 0.08, D], { bevel: bev * 1.2, part: 'wood', col: plank(0.8, 0, 40) });   // lid frame
  // staves following the arc (each a bevelled board along X)
  for (let i = 0; i < N; i++) {
    const [ya, za] = pts[i], [yb, zb] = pts[i + 1], mid = [0, (ya + yb) / 2, (za + zb) / 2];
    const tz = norm([0, yb - ya, zb - za]), nrm = norm([0, zb - za, -(yb - ya)]), len = Math.hypot(yb - ya, zb - za) + 0.006;
    piece(m, { size: [W - 0.05, 0.036, len], bevel: bev, part: 'wood', col: plank(0.84 + r() * 0.22, 0, 50 + i), xf: frame(add(mid, mul(nrm, -0.012)), [1, 0, 0], nrm, tz) });
  }
  // gable ends: bevelled half-ellipse boards (convex: a bed plane and one plane per arc span, thickness along X)
  for (const s of [-1, 1]) {
    const planes = [planeD([0, -1, 0], -0.0), planeD([1, 0, 0], 0.018), planeD([-1, 0, 0], 0.018)];
    for (let i = 0; i < N; i++) {
      const [ya, za] = pts[i], [yb, zb] = pts[i + 1], n2 = norm([0, zb - za, -(yb - ya)]);
      planes.push(planeD(n2, n2[1] * ya + n2[2] * za - 0.006));
    }
    piece(m, { planes, bevel: bev, part: 'wood', col: plank(0.62, 1, 60 + s), xf: frame([s * (W / 2 - 0.02), 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]) });
  }
  // iron straps over the arc with rivets, hinge straps, the brass hasp at the front
  for (const bx of [-0.3, 0.3]) {
    const sp = pts.map((_, i) => { const [y, z] = off(i, 0.012); return [bx, y, z]; });
    tube(m, sp, { r: 0.022, sides: o.tube, aspect: [0.35, 1.6], part: 'metal', col: metal(IRON)({ chamfer: 0, n: [0, 1, 0] }), cap0: 'flat', cap1: 'flat' });
    if (o.rivets) for (let i = 1; i < N; i++) { const [y, z] = off(i, 0.019); boxFT(m, [bx - 0.011, y - 0.011, z - 0.011, bx + 0.011, y + 0.011, z + 0.011], { bevel: 0.005, part: 'metal', col: metal(scalec(IRON, 1.15)) }); }
    boxFT(m, [bx - 0.045, 0.015, -0.02, bx + 0.045, 0.045, 0.15], { bevel: bev * 0.6, part: 'metal', col: metal(IRON) });
  }
  boxFT(m, [-0.06, -0.07, D + 0.004, 0.06, 0.07, D + 0.026], { bevel: bev, part: 'metal', col: metal(BRASS) });
  return m;
}

export default {
  name: 'chest_pack', parts: PARTS, lods: 3, views: [[35, 20], [215, 30]], sheetSize: 320,
  notes: 'Iron-banded pack chest for the landmark puzzles (gameplay/wilds-puzzles.js makeChestAt): bevelled planks with gaps, corner posts, iron bands and rivets, brass caps, lock plate, ring handles; barrel lid of staves with bevelled gable ends. chest_pack = body (origin ground centre, front +Z), chest_pack_lid = lid (origin on the hinge line; the game mounts it at (0, 0.54, -0.31) and swings it about X).',
  build: (lod) => ({ '': body(lod), lid: lid(lod) }),
};
