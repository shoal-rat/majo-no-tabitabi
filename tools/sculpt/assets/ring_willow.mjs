// The ring gates of the broom courses (gameplay/wilds-rings.js, races.js): a witch's ring — three willow withies twisted
// round the hoop and a fourth bound loosely across them, eight brass bands with bead rims holding the bundle, a brass star
// charm hanging at the crown, ribbon streamers (vermilion, cream, indigo, gold) from the lower bands. The game adds the
// soft gold glow inside the hoop (its own additive mesh: bright on the next ring, dim on the rest, a pulse on a pass).
// Built at the nominal course radius R = 3.6 m (the game scales it by radius / 3.6). Hoop in the XY plane, normal +Z
// (the game turns +Z along the course), centre at the origin, ribbons hang toward -Y. One part, drawn double-sided.
import { Mesh, prng, fbm, add, mul, norm, ss, C, mixc, scalec, tube, lathe, ribbon, aim, toLin } from './props_activity_lib.mjs';

export const R = 3.6;
export const PARTS = { ring: { name: 'WitchRing', surface: 'none', look: { rim: 0.35, spec: 0.25, specPower: 30, wrap: 0.35 } } };
const WILLOW = C(0xa4824f), WILLOW_G = C(0x8f8c55), PEEL = C(0xdcc79c), BRASS = C(0xd8aa4c);
const RIBBONS = [C(0xd8452f), C(0xf1e5c6), C(0x40589c), C(0xe0b04a), C(0xd8452f), C(0xf1e5c6)];
// per LOD: strands, samples per hoop, sides, binding withy, band sides, ribbons, ribbon rows, star
const L = [
  { strands: 3, n: 200, sides: 6, bind: true, band: 16, ribbons: 6, rows: 14, star: true },
  { strands: 3, n: 120, sides: 4, bind: false, band: 10, ribbons: 6, rows: 7, star: true },
  { strands: 1, n: 56, sides: 5, bind: false, band: 0, ribbons: 3, rows: 4, star: false },
];
const at = (s) => [R * Math.cos(s), R * Math.sin(s), 0];
const T = (s) => [-Math.sin(s), Math.cos(s), 0];
const Nr = (s) => [Math.cos(s), Math.sin(s), 0];

function buildLod(lod) {
  const o = L[lod], m = new Mesh(), r = prng(2707);
  const turns = 15, rh = 0.06, rs = 0.037;
  // the withies: helices round the hoop line, a third apart; peeled pale patches and a greener fresh withy
  for (let j = 0; j < o.strands; j++) {
    const pts = [];
    for (let i = 0; i < o.n; i++) {
      const s = (i / o.n) * Math.PI * 2, ph = turns * s + (j * Math.PI * 2) / 3, w = o.strands === 1 ? 0 : rh * (1 + 0.08 * Math.sin(3 * s + j * 2));
      pts.push(add(at(s), add(mul(Nr(s), Math.cos(ph) * w), [0, 0, Math.sin(ph) * w])));
    }
    const base = j === 1 ? WILLOW_G : WILLOW;
    tube(m, pts, {
      r: o.strands === 1 ? rh + rs * 0.9 : rs, sides: o.sides, closed: true, part: 'ring', up: [0, 0, 1],
      col: ({ t, n }) => {
        const peel = ss(0.55, 0.75, fbm(t * 40, j * 7.3, 0, 11, 2) * 0.5 + 0.5);
        const c = mixc(base, PEEL, peel * 0.8);
        return scalec(c, 0.9 + 0.12 * fbm(t * 160, j, 1, 5, 1) + 0.06 * n[1]);
      },
    });
  }
  // the binding withy: a thinner rod wound the other way, loosely, over the bundle
  if (o.bind) {
    const pts = [];
    for (let i = 0; i < 200; i++) { const s = (i / 200) * Math.PI * 2, ph = -6 * s; pts.push(add(at(s), add(mul(Nr(s), Math.cos(ph) * 0.09), [0, 0, Math.sin(ph) * 0.09]))); }
    tube(m, pts, { r: 0.016, sides: 4, closed: true, part: 'ring', up: [0, 0, 1], col: ({ t }) => scalec(mixc(WILLOW, PEEL, 0.35), 0.95 + 0.1 * fbm(t * 90, 3, 3, 9, 1)) });
  }
  // brass bands with bead rims at eight places (axis along the hoop)
  const bandAt = [];
  for (let k = 0; k < 8; k++) bandAt.push((k / 8) * Math.PI * 2 + Math.PI / 8);
  if (o.band) for (const s of bandAt) {
    const prof = [[0.094, -0.05], [0.112, -0.05], [0.119, -0.04], [0.112, -0.03], [0.108, 0], [0.112, 0.03], [0.119, 0.04], [0.112, 0.05], [0.094, 0.05], [0.094, -0.05]];
    lathe(m, prof, { sides: o.band, part: 'ring', crease: 35, xf: aim(at(s), T(s)), col: ({ n, k }) => scalec(BRASS, (k % 3 === 2 ? 1.12 : 0.95) * (0.92 + 0.12 * Math.abs(n[1]))) });
  }
  // ribbon streamers from the lower bands: hang, a slow S in the wind, a quarter twist, swallow-cut feel by tapering
  const lower = bandAt.filter((s) => Math.sin(s) < -0.2);   // 202.5, 247.5, 292.5, 337.5 deg
  for (let k = 0; k < o.ribbons; k++) {
    const s = lower[k % lower.length] + (k >= lower.length ? 0.06 : -0.06), len = 1.0 + r() * 0.55, ph = r() * 6.28;
    const top = add(at(s), mul(Nr(s), 0.07)), pts = [];
    for (let i = 0; i <= o.rows; i++) {
      const u = i / o.rows;
      pts.push(add(top, [0.05 * Math.sin(u * 2.5 + ph) * u, -len * u, 0.12 * Math.sin(u * 3.1 + ph) * u + 0.04 * u]));
    }
    const col = RIBBONS[k % RIBBONS.length], tw = (r() - 0.5) * 1.6;
    ribbon(m, pts, {
      w: (u) => 0.15 * (1 - 0.3 * u), part: 'ring', cols: 2,
      face: (u) => [Math.sin(tw * u), 0, Math.cos(tw * u)],
      col: ({ t, v }) => scalec(col, (0.95 + 0.08 * Math.cos(v * 6)) * (1 - 0.08 * t)),
    });
  }
  // the brass star charm at the crown, on a short cord inside the hoop
  if (o.star) {
    const top = add(at(Math.PI / 2), [0, -0.09, 0]), hang = add(top, [0, -0.26, 0]);
    tube(m, [top, add(lerp(top, hang, 0.5), [0, 0, 0.01]), hang], { r: 0.006, sides: 3, part: 'ring', col: C(0x8a2f24), cap0: false, cap1: false });
    star(m, add(hang, [0, -0.1, 0]), 0.11, 0.045, 0.022);
  }
  return m;
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** a five-point star of brass in the XY plane at c (outer radius ro, inner ri, thickness th), bevelled by its sides' tilt */
function star(m, c, ro, ri, th) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ri : ro; pts.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]); }
  const col = BRASS.map(toLin), hi = scalec(BRASS, 1.15).map(toLin);
  for (const sz of [1, -1]) {
    const cv = m.v([c[0], c[1], c[2] + sz * th * 0.9], [0, 0, sz], hi, 'ring');
    const ids = pts.map(([x, y]) => m.v([x, y, c[2] + sz * th * 0.35], norm([(x - c[0]) * 0.4, (y - c[1]) * 0.4, sz]), col, 'ring'));
    for (let i = 0; i < 10; i++) { const a = ids[i], b = ids[(i + 1) % 10]; if (sz > 0) m.tri(cv, a, b); else m.tri(cv, b, a); }
  }
  // the rim between the two faces
  for (let i = 0; i < 10; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % 10], n = norm([y1 - y0, -(x1 - x0), 0]);
    const a = m.v([x0, y0, c[2] + th * 0.35], n, col, 'ring'), b = m.v([x1, y1, c[2] + th * 0.35], n, col, 'ring');
    const d = m.v([x1, y1, c[2] - th * 0.35], n, col, 'ring'), e = m.v([x0, y0, c[2] - th * 0.35], n, col, 'ring');
    m.tri(a, e, d); m.tri(a, d, b);
  }
}

export default {
  name: 'ring_willow', parts: PARTS, lods: 3, views: [[0, 5], [40, 10]], sheetSize: 380,
  notes: `Witch's ring gate for the broom courses (gameplay/wilds-rings.js, races.js): three twisted willow withies and a binding withy, eight brass bands with bead rims, a brass star charm, six ribbon streamers. Hoop radius ${R} m in the XY plane (normal +Z), centre at the origin; the game scales it by radius / ${R} and adds its own additive glow. One material (WitchRing, drawn double-sided for the ribbons).`,
  build: buildLod,
};
