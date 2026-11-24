// The shepherd's stove (gameplay/errands-props.js makeStove; the stove errand lights it): a squat cast-iron box stove on
// four bowed legs, cast ribs and corner rivets, a top plate with a lip and two cooking rings, a fire door framed and
// barred (the game's door glow and flame sit behind the bars at z 0.265), an ash drawer, a flue with collar joints, a
// damper key and a cone rain cap; a pot with a lid and bail on the front ring; on a hearth slab of stone, split logs at
// the back. Origin on the ground, front (door) +Z; the flue's mouth at (-0.18, 2.1, -0.12) where the game puffs smoke.
import { Mesh, fbm, add, ss, C, mixc, scalec, piece, boxFT, lathe, tube, blob, spline, planeD, frame } from './props_activity_lib.mjs';

export const PARTS = {
  iron: { name: 'StoveIron', surface: 'metal', look: { spec: 0.4, specPower: 36, rim: 0.4 } },
  stone: { name: 'StoveStone', surface: 'stone', look: { detail: 0.3, rim: 0.22, wrap: 0.3 } },
  wood: { name: 'StoveWood', surface: 'bark', look: { detail: 0.3, rim: 0.25 } },
};
const IRON = C(0x45413f), RUST = C(0x6a4a3a), STONE = C(0x9a948a), BARK = C(0x5e4636), CUT = C(0xc9a679), POT = C(0x343130);
const L = [{ bev: 0.008, sides: 16, ribs: true, logs: 3, bars: 5 }, { bev: 0.012, sides: 10, ribs: false, logs: 2, bars: 3 }, { bev: 0, sides: 7, ribs: false, logs: 0, bars: 0 }];

function buildLod(lod) {
  const o = L[lod], m = new Mesh(), bev = o.bev;
  const iron = (t = 1) => (c) => {
    const rust = ss(0.25, 0.6, fbm(c.p[0] * 7, c.p[1] * 7, c.p[2] * 7, 3, 2) * 0.5 + 0.5) * 0.45;
    return scalec(mixc(IRON, RUST, rust * (c.n[1] > 0.5 ? 1 : 0.5)), t * (1 + 0.25 * (c.chamfer || 0)));
  };
  // hearth slab: an octagon of stone, bevelled
  const hp = [planeD([0, 1, 0], 0.16), planeD([0, -1, 0], 0.02)];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; hp.push(planeD([Math.sin(a), 0.08, Math.cos(a)], 0.55)); }
  piece(m, { planes: hp, bevel: bev ? 0.02 : 0, part: 'stone', col: (c) => scalec(STONE, (0.9 + 0.12 * fbm(c.p[0] * 4, 0, c.p[2] * 4, 8, 2)) * (1 + 0.1 * c.chamfer) * (c.n[1] > 0.5 ? 1.06 : 0.92)) });
  // legs: bowed cast legs with a foot pad
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = [sx * 0.26, 0.24, sz * 0.2], foot = [sx * 0.3, 0.16, sz * 0.24];
    tube(m, spline([top, add(top, [sx * 0.03, -0.04, sz * 0.02]), foot], 2), { r: (t) => 0.026 * (1 - 0.3 * t), sides: Math.max(4, o.sides / 2), part: 'iron', col: iron(0.9), cap0: false, cap1: 'flat' });
    if (lod < 2) lathe(m, [[0, 0.16], [0.032, 0.16], [0.03, 0.175], [0, 0.18]], { sides: Math.max(5, o.sides / 2), part: 'iron', col: iron(0.85), xf: { p: (v) => add(v, [foot[0], 0, foot[2]]), n: (v) => v } });
  }
  // the box: body, cast ribs, corner rivets
  boxFT(m, [-0.3, 0.22, -0.25, 0.3, 0.72, 0.25], { bevel: bev * 2, part: 'iron', col: iron(1) });
  if (o.ribs) for (const y of [0.34, 0.6]) {
    boxFT(m, [-0.312, y - 0.012, -0.262, 0.312, y + 0.012, 0.262], { bevel: 0.006, part: 'iron', col: iron(1.08) });
  }
  if (lod === 0) for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.27, 0.67]) blob(m, { r: [0.012, 0.012, 0.012], seg: 6, rings: 4, part: 'iron', col: iron(1.15), xf: { p: (v) => add(v, [sx * 0.302, y, sz * 0.252]), n: (v) => v } });
  // fire door: raised frame round the opening, bars in front of the glow, a latch knob
  for (const [x0, y0, x1, y1] of [[-0.16, 0.3, 0.16, 0.33], [-0.16, 0.51, 0.16, 0.54], [-0.16, 0.3, -0.13, 0.54], [0.13, 0.3, 0.16, 0.54]]) boxFT(m, [x0, y0, 0.245, x1, y1, 0.275], { bevel: bev * 0.6, part: 'iron', col: iron(1.1) });
  for (let k = 0; k < o.bars; k++) { const x = -0.1 + (k / Math.max(1, o.bars - 1)) * 0.2; boxFT(m, [x - 0.008, 0.33, 0.268, x + 0.008, 0.51, 0.282], { bevel: 0.003, part: 'iron', col: iron(1.05) }); }
  if (lod < 2) blob(m, { r: [0.02, 0.02, 0.02], seg: 8, rings: 5, part: 'iron', col: C(0xb08a4a), xf: { p: (v) => add(v, [0.19, 0.42, 0.275]), n: (v) => v } });
  // ash drawer
  boxFT(m, [-0.15, 0.235, 0.245, 0.15, 0.285, 0.27], { bevel: bev * 0.6, part: 'iron', col: iron(0.95) });
  if (lod < 2) boxFT(m, [-0.04, 0.252, 0.27, 0.04, 0.266, 0.29], { bevel: 0.003, part: 'iron', col: iron(1.1) });
  // top plate with a lip and two cooking rings
  boxFT(m, [-0.33, 0.72, -0.28, 0.33, 0.77, 0.28], { bevel: bev * 1.5, part: 'iron', col: iron(1.05) });
  for (const [x, z] of [[0.12, 0.04], [-0.12, 0.1]]) lathe(m, [[0.1, 0.77], [0.105, 0.778], [0.08, 0.78], [0.075, 0.772]], { sides: o.sides, part: 'iron', col: iron(1.15), xf: { p: (v) => add(v, [x, 0, z]), n: (v) => v } });
  // flue: pipe with collar joints, a damper key, a cone rain cap over the mouth
  const fx = -0.18, fz = -0.12;
  lathe(m, [[0.075, 0.76], [0.07, 0.8], [0.07, 2.04], [0.0, 2.04]], { sides: o.sides, part: 'iron', crease: 50, col: (c) => scalec(iron(0.95)({ p: c.p, n: c.n, chamfer: 0 }), 1), xf: { p: (v) => add(v, [fx, 0, fz]), n: (v) => v } });
  if (lod < 2) for (const y of [1.05, 1.45, 1.85]) lathe(m, [[0.07, y - 0.025], [0.08, y - 0.02], [0.08, y + 0.02], [0.07, y + 0.025]], { sides: o.sides, part: 'iron', col: iron(1.05), xf: { p: (v) => add(v, [fx, 0, fz]), n: (v) => v } });
  if (lod < 2) { tube(m, [[fx - 0.12, 1.2, fz], [fx + 0.12, 1.2, fz]], { r: 0.008, sides: 4, part: 'iron', col: iron(1), cap0: 'flat', cap1: 'flat' }); boxFT(m, [fx + 0.1, 1.185, fz - 0.025, fx + 0.14, 1.215, fz + 0.025], { bevel: 0.004, part: 'iron', col: iron(1.1) }); }
  // rain cap on three short stays (smoke leaves under it at y ~2.1)
  lathe(m, [[0, 2.2], [0.15, 2.12], [0.16, 2.13], [0, 2.24]], { sides: o.sides, part: 'iron', crease: 30, col: iron(0.95), xf: { p: (v) => add(v, [fx, 0, fz]), n: (v) => v } });
  if (lod < 2) for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; tube(m, [[fx + Math.sin(a) * 0.066, 2.03, fz + Math.cos(a) * 0.066], [fx + Math.sin(a) * 0.1, 2.15, fz + Math.cos(a) * 0.1]], { r: 0.006, sides: 3, part: 'iron', col: iron(1), cap0: false, cap1: false }); }
  // the pot on the front ring: belly, rim, lid with a knob, a bail handle
  const px = 0.12, pz = 0.04;
  lathe(m, [[0, 0.78], [0.12, 0.785], [0.165, 0.85], [0.16, 0.93], [0.15, 0.95], [0.158, 0.958], [0.15, 0.965], [0.0, 0.965]], { sides: o.sides, part: 'iron', crease: 45, col: (c) => scalec(POT, 1 + 0.2 * Math.max(0, c.n[1])), xf: { p: (v) => add(v, [px, 0, pz]), n: (v) => v } });
  lathe(m, [[0, 0.965], [0.148, 0.965], [0.13, 0.985], [0.05, 0.998], [0.02, 1.0], [0.022, 1.02], [0.0, 1.03]], { sides: o.sides, part: 'iron', crease: 45, col: scalec(POT, 1.15), xf: { p: (v) => add(v, [px, 0, pz]), n: (v) => v } });
  if (lod < 2) { const pts = []; for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); pts.push([px + Math.cos(a) * 0.165, 0.93 + Math.sin(a) * 0.13, pz]); } tube(m, pts, { r: 0.006, sides: 4, part: 'iron', col: iron(1.1), cap0: 'flat', cap1: 'flat' }); }
  // split logs at the back of the hearth
  for (let k = 0; k < o.logs; k++) {
    const y = 0.16 + 0.05 + (k === 2 ? 0.08 : 0), z = -0.36 + (k % 2) * 0.1 - (k === 2 ? 0.05 : 0), x0 = 0.05 + (k % 2) * 0.04;
    const f = frame([x0, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    lathe(m, [[0, -0.2], [0.048, -0.2], [0.05, -0.19], [0.05, 0.19], [0.048, 0.2], [0, 0.2]], {
      sides: Math.max(6, o.sides / 2), part: 'wood', crease: 40, col: ({ n, p }) => (Math.abs(n[1]) > 0.7 ? CUT : scalec(BARK, 0.92 + 0.14 * fbm(p[0] * 20, p[1] * 3, p[2] * 20, k, 2))),
      xf: { p: (v) => f.p([v[1], -v[0], v[2]]), n: (v) => f.n([v[1], -v[0], v[2]]) },
    });
  }
  return m;
}

export default {
  name: 'stove_iron', parts: PARTS, lods: 3, views: [[30, 15], [210, 25]], sheetSize: 340,
  notes: "The shepherd's cast-iron stove (gameplay/errands-props.js makeStove): bowed legs, ribs, rivets, framed and barred fire door (the game's glow behind it), ash drawer, top plate with rings, flue with collars, damper and rain cap, a pot with lid and bail, hearth slab, split logs. Origin on the ground, door +Z; flue mouth (-0.18, 2.1, -0.12).",
  build: buildLod,
};
