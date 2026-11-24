// The carter's handcart (gameplay/errands-props.js makeCart; he pushes it over the frozen ford): a plank bed on two
// side rails over an axle, side boards on stakes, a tail board, two long shafts sloping forward to a cross grip with a
// prop leg under them; two spoked wheels (felloes, iron tyres, turned hubs, ten spokes each); a load of ribbed pumpkins
// with curled stems on a bed of straw. Faces +Z (the shafts), origin on the ground between the wheels (as before:
// bed at 0.62 m, wheels r 0.43 m at x +-0.62, z 0.1).
import { Mesh, prng, fbm, add, mul, C, mixc, scalec, beam, boxFT, lathe, tube, blob, spline, frame, smoothFrom } from './props_activity_lib.mjs';

export const PARTS = {
  wood: { name: 'CartWood', surface: 'wood', look: { detail: 0.35, rim: 0.3 } },
  iron: { name: 'CartIron', surface: 'metal', look: { spec: 0.45, specPower: 40, rim: 0.4 } },
  crop: { name: 'CartCrop', surface: 'none', look: { rim: 0.3, wrap: 0.4, spec: 0.15 } },
};
const WOOD = C(0x8f6a42), WOOD_D = C(0x5a4330), IRON = C(0x4d4a48), PUMP = [C(0xdd8a33), C(0xc9702a), C(0xe39a3c)], STEM = C(0x6a6a34), STRAW = C(0xd6b86a);
const L = [
  { bev: 0.008, spokes: 10, ring: 28, sides: 8, pump: 14, prib: 18, straw: 9 },
  { bev: 0.012, spokes: 8, ring: 18, sides: 6, pump: 10, prib: 10, straw: 4 },
  { bev: 0, spokes: 4, ring: 12, sides: 5, pump: 7, prib: 6, straw: 0 },
];

function buildLod(lod) {
  const o = L[lod], m = new Mesh(), bev = o.bev, r = prng(9091);
  const wood = (t = 1, seed = 1) => (c) => scalec(mixc(WOOD, WOOD_D, 0.12 + 0.22 * fbm(c.p[0] * 30, c.p[1] * 30, c.p[2] * 3, seed, 2)), t * (1 + 0.12 * (c.chamfer || 0)));
  const iron = (t = 1) => (c) => scalec(IRON, t * (1 + 0.2 * (c.chamfer || 0)) * (0.95 + 0.1 * Math.max(0, c.n[1])));
  // bed: planks along Z with gaps, side rails under them, the axle
  const nP = 5;
  for (let k = 0; k < nP; k++) { const x0 = -0.52 + k * (1.04 / nP); boxFT(m, [x0 + 0.006, 0.58, -0.85, x0 + 1.04 / nP - 0.006, 0.625, 0.85], { bevel: bev, part: 'wood', col: wood(0.88 + r() * 0.22, k + 1) }); }
  for (const s of [-1, 1]) boxFT(m, [s * 0.5 - 0.035, 0.5, -0.88, s * 0.5 + 0.035, 0.58, 0.9], { bevel: bev, part: 'wood', col: wood(0.8, 9) });
  boxFT(m, [-0.7, 0.4, 0.06, 0.7, 0.46, 0.14], { bevel: bev, part: 'wood', col: wood(0.75, 11) });
  // side boards (two planks each) on stakes; the tail board
  for (const s of [-1, 1]) {
    for (const [y0, y1] of [[0.63, 0.77], [0.79, 0.93]]) boxFT(m, [s * 0.53 - 0.022, y0, -0.85, s * 0.53 + 0.022, y1, 0.85], { bevel: bev, part: 'wood', col: wood(0.9 + r() * 0.15, 20 + y0 * 10) });
    for (const z of [-0.78, 0, 0.78]) boxFT(m, [s * 0.575 - 0.025, 0.5, z - 0.03, s * 0.575 + 0.025, 0.96, z + 0.03], { bevel: bev, part: 'wood', col: wood(0.78, 30) });
    if (lod < 2) for (const z of [-0.78, 0, 0.78]) boxFT(m, [s * 0.575 - 0.03, 0.52, z - 0.035, s * 0.575 + 0.03, 0.56, z + 0.035], { bevel: 0.004, part: 'iron', col: iron(1) });
  }
  for (const [y0, y1] of [[0.63, 0.77], [0.79, 0.93]]) boxFT(m, [-0.53, y0, -0.88, 0.53, y1, -0.84], { bevel: bev, part: 'wood', col: wood(0.92, 40 + y0 * 10) });
  // shafts: sloping down to the front, a turned cross grip, a prop leg
  for (const s of [-1, 1]) beam(m, [s * 0.45, 0.6, -0.4], [s * 0.42, 0.56, 1.78], 0.055, 0.06, { bevel: bev, part: 'wood', col: wood(0.85, 50 + s) });
  for (const s of [-1, 1]) beam(m, [s * 0.42, 0.56, 1.78], [s * 0.36, 0.52, 1.9], 0.05, 0.05, { bevel: bev, part: 'wood', col: wood(0.85, 52 + s) });
  tube(m, [[-0.42, 0.53, 1.86], [0.42, 0.53, 1.86]], { r: 0.022, sides: o.sides, part: 'wood', col: wood(1.05, 54), cap0: 'flat', cap1: 'flat' });
  beam(m, [0, 0.0, 1.1], [0, 0.56, 1.1], 0.05, 0.05, { bevel: bev, part: 'wood', col: wood(0.8, 56) });
  beam(m, [-0.44, 0.52, 1.1], [0.44, 0.52, 1.1], 0.05, 0.045, { bevel: bev, part: 'wood', col: wood(0.82, 57) });
  // wheels: felloe ring, iron tyre, hub, spokes
  for (const s of [-1, 1]) {
    const cx = s * 0.62, cy = 0.43, cz = 0.1, R0 = 0.37, R1 = 0.41;
    const ring = (rad) => { const pts = []; for (let k = 0; k < o.ring; k++) { const a = (k / o.ring) * Math.PI * 2; pts.push([cx, cy + Math.sin(a) * rad, cz + Math.cos(a) * rad]); } return pts; };
    tube(m, ring((R0 + R1) / 2), { r: (R1 - R0) / 2, aspect: [1, 1.5], sides: Math.max(4, o.sides - 2), closed: true, part: 'wood', up: [1, 0, 0], col: wood(0.8, 60 + s) });
    tube(m, ring(R1 + 0.012), { r: 0.014, aspect: [1, 2.6], sides: 4, closed: true, part: 'iron', up: [1, 0, 0], col: iron(1) });
    const hub = frame([cx, cy, cz], [0, 1, 0], [s, 0, 0], [0, 0, 1]);
    lathe(m, [[0, -0.1], [0.05, -0.1], [0.07, -0.07], [0.075, 0], [0.07, 0.06], [0.05, 0.09], [0.03, 0.11], [0, 0.11]], { sides: o.sides, part: 'wood', crease: 40, col: wood(0.75, 70), xf: { p: (v) => hub.p([v[0], v[1], v[2]]), n: (v) => hub.n([v[0], v[1], v[2]]) } });
    if (lod < 2) lathe(m, [[0.06, -0.075], [0.08, -0.07], [0.08, -0.04], [0.06, -0.035]], { sides: o.sides, part: 'iron', crease: 40, col: iron(1.05), xf: hub });
    for (let k = 0; k < o.spokes; k++) {
      const a = (k / o.spokes) * Math.PI * 2 + 0.15, d = [0, Math.sin(a), Math.cos(a)];
      tube(m, [add([cx, cy, cz], mul(d, 0.06)), add([cx, cy, cz], mul(d, R0 + 0.01))], { r: (t) => 0.019 * (1 - 0.3 * t), aspect: [1, 0.75], sides: Math.max(4, o.sides - 2), part: 'wood', col: wood(0.95, 80 + k), cap0: false, cap1: false });
    }
  }
  // straw bedding and the pumpkins on it
  for (let k = 0; k < o.straw; k++) {
    const x = -0.4 + (k % 3) * 0.4 + (r() - 0.5) * 0.1, z = -0.6 + Math.floor(k / 3) * 0.6 + (r() - 0.5) * 0.15;
    blob(m, { r: [0.22, 0.05, 0.26], seg: 8, rings: 4, part: 'crop', col: (c) => scalec(STRAW, 0.9 + 0.2 * fbm(c.p[0] * 40, c.p[1] * 40, c.p[2] * 40, k, 1)), xf: { p: (v) => add(v, [x, 0.64, z]), n: (v) => v }, disp: (d) => 1 + 0.15 * fbm(d[0] * 5, d[1] * 5, d[2] * 5, k, 2) });
  }
  const spots = [[-0.25, -0.45, 0.25], [0.25, -0.4, 0.23], [0.02, -0.02, 0.26], [-0.28, 0.42, 0.22], [0.27, 0.48, 0.24], [0.02, 0.0, 0.2, 0.3], [-0.05, 0.65, 0.17]];
  spots.slice(0, lod === 2 ? 5 : spots.length).forEach(([x, z, rr, lift = 0], i) => {
    const y = 0.64 + rr * 0.72 + lift, col = PUMP[i % 3], from = m.nv;
    lathe(m, [[0, -rr * 0.78], [rr * 0.55, -rr * 0.72], [rr * 0.92, -rr * 0.35], [rr, 0], [rr * 0.9, rr * 0.42], [rr * 0.5, rr * 0.7], [rr * 0.12, rr * 0.74], [0, rr * 0.68]], {
      sides: o.pump * 2, part: 'crop', crease: 80, wob: (a) => -0.07 * Math.abs(Math.cos(a * o.prib / 4)) ** 0.6,
      col: ({ a, n }) => scalec(col, (0.88 + 0.14 * Math.abs(Math.sin(a * o.prib / 4))) * (0.9 + 0.12 * Math.max(0, n[1]))),
      xf: { p: (v) => add(v, [x, y, z]), n: (v) => v },
    });
    smoothFrom(m, from);   // the ribs shade as ribs
    const top = [x, y + rr * 0.7, z];
    tube(m, spline([top, add(top, [0.01, 0.05, 0]), add(top, [0.04, 0.08, 0.02])], 2), { r: (t) => 0.022 * (1 - 0.4 * t), sides: 5, part: 'crop', col: STEM, cap0: false, cap1: 'flat' });
    if (lod === 0 && i % 2 === 0) { const c0 = add(top, [0.04, 0.08, 0.02]), pts = []; for (let k = 0; k <= 10; k++) { const a = k * 0.9; pts.push(add(c0, [0.04 * Math.cos(a) * (1 - k / 14), -0.012 * k, 0.04 * Math.sin(a) * (1 - k / 14)])); } tube(m, pts, { r: 0.004, sides: 3, part: 'crop', col: STEM, cap0: false, cap1: false }); }
  });
  return m;
}

export default {
  name: 'cart_hand', parts: PARTS, lods: 3, views: [[35, 18], [220, 25]], sheetSize: 340,
  notes: "The carter's handcart (gameplay/errands-props.js makeCart): plank bed, side boards on stakes, tail board, shafts with a cross grip and a prop leg, two spoked wheels with iron tyres and turned hubs, ribbed pumpkins on straw. Faces +Z, origin on the ground between the wheels; bed 0.62 m, wheels r 0.43 m.",
  build: buildLod,
};
