// The painter's felt hat (gameplay/errands-props.js makeHat; the hat errand blows it away): a wide soft-felt traveller's
// hat — the brim rolled at the edge and waved (sides up, front snapped down), a crown pinched at the front with a crease
// on top, a red band with a flat bow on the left, a barred pale feather tucked in at the right-back.
// Origin = the brim's centre (where the old hat's origin was), front +Z; brim r 0.31 m, crown ~0.18 m (as before).
import { Mesh, fbm, add, mul, norm, ss, C, mixc, scalec, lathe, tube, blade, blob, spline, smoothFrom } from './props_activity_lib.mjs';

export const PARTS = {
  felt: { name: 'HatFelt', surface: 'cloth', look: { detail: 0.3, rim: 0.4, wrap: 0.45 } },
  feather: { name: 'HatFeather', surface: 'none', look: { trans: 0.3, rim: 0.35, wrap: 0.5 } },
};
const FELT = C(0x5f4c3c), FELT_TOP = C(0x6f5a47), FELT_UNDER = C(0x463729), BAND = C(0xa13d34), QUILL = C(0xeee6d1), BAR = C(0x7a5a3e);
const L = [{ sides: 40, segs: 10, quill: 6 }, { sides: 22, segs: 5, quill: 4 }, { sides: 12, segs: 3, quill: 3 }];

/** warp the vertices from index `from` on: fn(p) -> new p (normals are recomputed smooth afterwards) */
function warpFrom(m, from, fn) {
  for (let v = from; v < m.nv; v++) { const q = fn([m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]]); m.pos[v * 3] = q[0]; m.pos[v * 3 + 1] = q[1]; m.pos[v * 3 + 2] = q[2]; }
  smoothFrom(m, from);
}
const angle = (p) => Math.atan2(p[0], p[2]);   // 0 = front (+Z), + toward +X
/** the brim's wave at angle a and radius r: sides lift, the front snaps down a little more than the back */
const brimY = (a, r) => { const k = ss(0.16, 0.31, r) ** 1.4; return k * (0.03 * -Math.cos(2 * a) * 0.8 + 0.008 - 0.016 * Math.max(0, Math.cos(a))); };
/** the crown's front pinches: two dents left and right of the front, deeper toward the top */
const pinch = (a, y) => (Math.exp(-((a - 0.62) ** 2) / 0.07) + Math.exp(-((a + 0.62) ** 2) / 0.07)) * ss(0.05, 0.17, y);

function buildLod(lod) {
  const o = L[lod], m = new Mesh();
  // brim: under-surface outward, rolled edge, top surface inward (a closed section turned round)
  let from = m.nv;
  lathe(m, [[0.156, -0.006], [0.22, -0.008], [0.282, -0.004], [0.306, 0.002], [0.317, 0.012], [0.311, 0.022], [0.293, 0.02], [0.24, 0.013], [0.156, 0.012]], {
    sides: o.sides, part: 'felt', crease: 70,
    col: ({ n, r }) => scalec(n[1] < 0 ? FELT_UNDER : mixc(FELT, FELT_TOP, ss(0.25, 0.31, r) * 0.4), 0.95 + 0.08 * fbm(r * 30, n[1] * 3, 0, 2, 2)),
  });
  warpFrom(m, from, (p) => { const a = angle(p), r = Math.hypot(p[0], p[2]); return [p[0], p[1] + brimY(a, r), p[2]]; });
  // crown with a crease on top, pinched at the front
  from = m.nv;
  lathe(m, [[0.164, -0.006], [0.163, 0.04], [0.157, 0.1], [0.147, 0.148], [0.139, 0.167], [0.124, 0.178], [0.09, 0.173], [0.05, 0.16], [0.02, 0.154], [0, 0.153]], {
    sides: o.sides, part: 'felt', crease: 75,
    col: ({ y, n }) => scalec(mixc(FELT, FELT_TOP, ss(0.12, 0.18, y) * 0.7), 0.94 + 0.06 * Math.max(0, n[1])),
  });
  warpFrom(m, from, (p) => {
    const a = angle(p), r = Math.hypot(p[0], p[2]), k = 1 - 0.17 * pinch(a, p[1]);
    // the top's front-to-back crease: the middle line sinks
    const crease = p[1] > 0.14 ? -0.018 * Math.exp(-((p[0] / 0.05) ** 2)) * ss(0.02, 0.1, 0.14 - Math.abs(p[2]) + 0.05) : 0;
    return [p[0] * k, p[1] + crease + brimY(a, Math.max(0.16, r)) * 0.6, p[2] * k];
  });
  // band and its bow (left side, -X)
  from = m.nv;
  lathe(m, [[0.16, 0.012], [0.169, 0.016], [0.171, 0.04], [0.169, 0.064], [0.158, 0.068]], {
    sides: o.sides, part: 'felt', crease: 60, col: ({ n }) => scalec(BAND, 0.95 + 0.1 * Math.max(0, n[1])),
  });
  warpFrom(m, from, (p) => { const a = angle(p); return [p[0], p[1] + brimY(a, 0.17) * 0.6, p[2]]; });
  if (lod < 2) {
    const bc = [-0.176, 0.042 + brimY(-Math.PI / 2, 0.17) * 0.6, 0.02];
    for (const s of [-1, 1]) blob(m, { r: [0.012, 0.02, 0.034], seg: lod ? 6 : 9, rings: lod ? 4 : 6, part: 'felt', col: scalec(BAND, 0.92), xf: { p: (v) => add(add(v, bc), [0, s * 0.004, s * 0.03]), n: (v) => v } });
    blob(m, { r: [0.011, 0.016, 0.014], seg: 6, rings: 4, part: 'felt', col: scalec(BAND, 1.05), xf: { p: (v) => add(v, add(bc, [-0.004, 0, 0])), n: (v) => v } });
    for (const s of [-1, 1]) tube(m, spline([add(bc, [-0.004, -0.008, 0]), add(bc, [-0.01, -0.035, s * 0.012]), add(bc, [-0.006, -0.06, s * 0.024])], 3), { r: 0.006, aspect: [0.35, 1.6], sides: 4, part: 'felt', col: scalec(BAND, 0.9), cap0: false, cap1: 'flat' });
  }
  // the feather: quill from under the band at the right-back, sweeping up and back; a barred vane
  const fa = 2.25, base = [Math.sin(fa) * 0.172, 0.03 + brimY(fa, 0.17) * 0.6, Math.cos(fa) * 0.172];
  const dir = norm([Math.sin(fa) * 0.35, 0.62, Math.cos(fa) * 0.35 - 0.5]);
  const qpts = spline([base, add(base, mul(dir, 0.11)), add(add(base, mul(dir, 0.22)), [0.0, -0.01, -0.03]), add(add(base, mul(dir, 0.3)), [0.01, -0.035, -0.07])], o.quill);
  tube(m, qpts, { r: (t) => 0.0045 * (1 - 0.7 * t), sides: 4, part: 'feather', col: QUILL, cap0: false, cap1: 'tip' });
  const vDir = norm([qpts[qpts.length - 1][0] - qpts[2][0], qpts[qpts.length - 1][1] - qpts[2][1], qpts[qpts.length - 1][2] - qpts[2][2]]);
  blade(m, {
    base: qpts[2], dir: vDir, up: norm([Math.cos(fa), 0.15, -Math.sin(fa)]), len: 0.25, wid: 0.03, segs: o.segs, cols: 3, fold: 0.12, curl: -0.35, twist: 0.3, part: 'feather',
    shape: (u) => Math.min(1, 0.5 + 1.2 * u) * (1 - u ** 3),
    col: ({ u }) => scalec(Math.sin(u * 22) > 0.35 ? BAR : QUILL, u > 0.86 ? 0.75 : 1),
  });
  return m;
}

export default {
  name: 'hat_felt', parts: PARTS, lods: 3, views: [[30, 25], [200, 15]], sheetSize: 320,
  notes: "The painter's felt hat (gameplay/errands-props.js makeHat): rolled and waved brim, pinched crown with a top crease, red band with a bow, barred feather. Origin = brim centre, front +Z, brim r 0.31 m. The feather (HatFeather) is a single sheet: drawn double-sided.",
  build: buildLod,
};
