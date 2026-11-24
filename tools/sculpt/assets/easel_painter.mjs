// The painter's easel (gameplay/errands-props.js makeEasel; the hat errand's painter works at it): a field easel of
// three bevelled legs (two splayed in front, a hinged back leg), a tray ledge with a lip and an upper crossbar, a top
// clamp; a stretched canvas with a moor landscape painted in vertex colour (sky, far hills, heather, the road), linen at
// the back; at its foot a paint box with an open lid, paint pots, a jar of brushes and a palette with dabs of colour.
// Faces +Z (the painting), origin on the ground under the canvas; legs 1.65 m, canvas 0.58 x 0.44 m centred at 0.97 m.
import { Mesh, fbm, add, mul, norm, ss, C, mixc, scalec, beam, boxFT, lathe, tube, blob, frame, toLin } from './props_activity_lib.mjs';

export const PARTS = {
  wood: { name: 'EaselWood', surface: 'wood', look: { detail: 0.3, rim: 0.3 } },
  paint: { name: 'EaselPaint', surface: 'none', look: { rim: 0.25, wrap: 0.35 } },
};
const WOOD = C(0x8a6440), WOOD_D = C(0x5e4430), LINEN = C(0xe9dfc8);
const L = [{ bev: 0.006, gx: 32, gy: 24, sides: 12, pots: 5, brushes: 5 }, { bev: 0.01, gx: 12, gy: 9, sides: 8, pots: 3, brushes: 3 }, { bev: 0, gx: 6, gy: 4, sides: 6, pots: 0, brushes: 0 }];

/** the painting on the canvas at (u, v) 0..1 (left -> right, bottom -> top): the moor toward far hills under a pale sky */
function painting(u, v) {
  const hill = 0.52 + 0.08 * Math.sin(u * 5.1 + 0.7) + 0.04 * Math.sin(u * 13.0);
  const far = 0.6 + 0.05 * Math.sin(u * 3.3 + 2.0);
  const road = Math.abs(u - (0.62 - v * 0.35)) < 0.05 * (1 - v * 1.4) && v < 0.5;
  const n = fbm(u * 9, v * 9, 1.3, 7, 2);
  if (v > far) { // sky: warm near the horizon, blue up top, a cloud
    const c = mixc(C(0xf1dfb8), C(0x9cc0de), ss(far, 0.98, v));
    const cloud = ss(0.25, 0.55, fbm(u * 3 + 1, v * 6, 2, 3, 3)) * ss(far + 0.05, far + 0.2, v);
    return mixc(c, C(0xfbf6ee), cloud * 0.8);
  }
  if (v > hill) return mixc(C(0x8e8fb6), C(0xa9a7c6), n * 0.5 + 0.3);                 // far hills, lavender
  if (road) return mixc(C(0xc8b48a), C(0xa98f68), n * 0.5 + 0.5);                     // the road
  const heather = ss(0.1, 0.35, fbm(u * 6, v * 5, 4, 9, 2)) * ss(0.1, 0.45, v);
  return mixc(mixc(C(0x7fa05a), C(0x5d8a45), v * 1.4), C(0x9b6a9a), heather * 0.7);   // the moor, heather patches
}

function buildLod(lod) {
  const o = L[lod], m = new Mesh(), bev = o.bev;
  const wood = (t = 1) => (c) => scalec(mixc(WOOD, WOOD_D, 0.15 + 0.2 * fbm(c.p[0] * 30, c.p[1] * 3, c.p[2] * 30, 5, 2)), t * (1 + 0.12 * c.chamfer));
  // legs: two front legs splayed, meeting under the top; a back leg on its hinge
  for (const s of [-1, 1]) beam(m, [s * 0.34, 0, 0.06], [s * 0.05, 1.66, -0.04], 0.042, 0.034, { bevel: bev, part: 'wood', col: wood(1) });
  beam(m, [0, 0, -0.52], [0, 1.58, -0.075], 0.04, 0.032, { bevel: bev, part: 'wood', col: wood(0.92) });
  boxFT(m, [-0.04, 1.58, -0.1, 0.04, 1.66, -0.01], { bevel: bev, part: 'wood', col: wood(0.85) });   // hinge block
  // tray ledge with a lip, upper crossbar, top clamp
  boxFT(m, [-0.36, 0.69, -0.0, 0.36, 0.72, 0.12], { bevel: bev, part: 'wood', col: wood(1.05) });
  boxFT(m, [-0.36, 0.72, 0.105, 0.36, 0.745, 0.12], { bevel: bev * 0.6, part: 'wood', col: wood(1) });
  boxFT(m, [-0.24, 1.3, -0.055, 0.24, 1.34, -0.025], { bevel: bev, part: 'wood', col: wood(0.95) });
  boxFT(m, [-0.09, 1.18, 0.0, 0.09, 1.215, 0.075], { bevel: bev, part: 'wood', col: wood(0.9) });
  // the canvas: stretcher bars, a painted face (+Z) and linen at the back; leaning back a little on the ledge
  const tilt = -0.1, cf = frame([0, 0.955, 0.078], [1, 0, 0], [0, Math.cos(tilt), Math.sin(tilt)], [0, -Math.sin(tilt), Math.cos(tilt)]);
  const W = 0.58, H = 0.44;
  for (const [x0, y0, x1, y1] of [[-W / 2, -H / 2, W / 2, -H / 2 + 0.03], [-W / 2, H / 2 - 0.03, W / 2, H / 2], [-W / 2, -H / 2, -W / 2 + 0.03, H / 2], [W / 2 - 0.03, -H / 2, W / 2, H / 2]]) {
    boxFT(m, [x0, y0, -0.022, x1, y1, -0.002], { bevel: bev * 0.5, part: 'wood', col: () => scalec(LINEN, 0.82), xf: cf });
  }
  const gx = o.gx, gy = o.gy, base = m.nv, nF = cf.n([0, 0, 1]);
  for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
    const u = i / gx, v = j / gy, edge = Math.min(u, 1 - u, v, 1 - v);
    const c = scalec(painting(u, v), 0.97 + 0.06 * fbm(u * 40, v * 40, 3, 4, 1) - 0.08 * (1 - ss(0, 0.04, edge)));
    m.v(cf.p([(u - 0.5) * W, (v - 0.5) * H, 0.002]), nF, c.map(toLin), 'paint');
  }
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) { const a = base + j * (gx + 1) + i, b = a + 1, c = a + gx + 2, d = a + gx + 1; m.tri(a, b, c); m.tri(a, c, d); }
  // canvas edges (wrapped linen) and the back
  boxFT(m, [-W / 2, -H / 2, -0.004, W / 2, H / 2, 0.0], { bevel: 0, part: 'paint', col: () => scalec(LINEN, 0.9), xf: cf, skip: (k) => false });
  // the paint box at the left foot, lid open, pots and a jar of brushes; the palette on the box
  if (lod < 2) {
    const bx = frame([-0.56, 0, 0.08], [Math.cos(0.3), 0, -Math.sin(0.3)], [0, 1, 0], [Math.sin(0.3), 0, Math.cos(0.3)]);
    boxFT(m, [-0.17, 0, -0.11, 0.17, 0.11, 0.11], { bevel: bev, part: 'wood', col: wood(0.8), xf: bx });
    boxFT(m, [-0.165, 0.105, -0.105, 0.165, 0.112, 0.105], { bevel: 0, part: 'wood', col: () => scalec(WOOD_D, 0.6), xf: bx });   // the dark inside
    boxFT(m, [-0.17, 0.11, -0.13, 0.17, 0.125, 0.09], { bevel: bev * 0.5, part: 'wood', col: wood(0.85), xf: { p: (v) => bx.p([v[0], 0.11 + (v[2] + 0.11) * 0.98, -0.11 - (v[1] - 0.11) - 0.012]), n: (v) => bx.n([v[0], v[2], -v[1]]) } });   // lid, opened back
    const potCols = [C(0xd8452f), C(0x3f63a8), C(0xe8c048), C(0x5d9a50), C(0xf2eee6)];
    for (let k = 0; k < o.pots; k++) {
      const px = -0.12 + k * 0.06, pz = -0.03 + (k % 2) * 0.05, c = potCols[k];
      lathe(m, [[0, 0.11], [0.022, 0.11], [0.024, 0.15], [0.02, 0.16], [0, 0.155]], { sides: o.sides, part: 'paint', crease: 40, col: ({ k: pk }) => (pk >= 3 ? c : C(0xd9d2c2)), xf: { p: (v) => bx.p(add(v, [px, 0, pz])), n: (v) => bx.n(v) } });
    }
    // jar of brushes
    lathe(m, [[0, 0.11], [0.03, 0.11], [0.032, 0.2], [0.028, 0.205], [0, 0.2]], { sides: o.sides, part: 'paint', crease: 40, col: C(0x8fb0b0), xf: { p: (v) => bx.p(add(v, [0.12, 0, 0.02])), n: (v) => bx.n(v) } });
    for (let k = 0; k < o.brushes; k++) {
      const a = k * 1.3, tip = bx.p([0.12 + Math.sin(a) * 0.035, 0.36 + (k % 3) * 0.03, 0.02 + Math.cos(a) * 0.035]), root = bx.p([0.12 + Math.sin(a) * 0.01, 0.13, 0.02 + Math.cos(a) * 0.01]);
      tube(m, [root, tip], { r: 0.0045, sides: 4, part: 'wood', col: k % 2 ? C(0xb0353a) : C(0x2f2a28), cap0: false, cap1: 'flat' });
      const d = norm([tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]]);
      tube(m, [tip, add(tip, mul(d, 0.03))], { r: (t) => 0.006 * (1 - 0.6 * t), sides: 4, part: 'paint', col: C(0x6a5440), cap0: 'flat', cap1: 'tip' });
    }
    // the palette: a flat board with a thumb hole side, dabs of paint
    const pf = { p: (v) => bx.p(add(v, [-0.03, 0.128, 0.0])), n: (v) => bx.n(v) };
    blob(m, { r: [0.14, 0.008, 0.095], seg: o.sides, rings: 5, part: 'wood', col: C(0xc9a47a), xf: pf });
    potCols.forEach((c, k) => { if (k < o.pots) blob(m, { r: [0.018, 0.006, 0.015], seg: 6, rings: 3, part: 'paint', col: c, xf: { p: (v) => pf.p(add(v, [Math.cos(k * 0.9 + 0.5) * 0.09, 0.006, Math.sin(k * 0.9 + 0.5) * 0.06])), n: pf.n } }); });
  }
  return m;
}

export default {
  name: 'easel_painter', parts: PARTS, lods: 3, views: [[25, 12], [200, 15]], sheetSize: 340,
  notes: "The painter's field easel (gameplay/errands-props.js makeEasel): bevelled legs, ledge, clamp; a canvas with a moor landscape painted in vertex colour; a paint box with pots, a jar of brushes and a palette at its foot. Faces +Z, origin on the ground; legs 1.65 m.",
  build: buildLod,
};
