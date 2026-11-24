// The briar thicket of the bramble puzzles (gameplay/wilds-puzzles.js kind 'bramble'): a dome of arching bramble canes
// round the chest — canes rise from crowns in a ring, arch out and droop, some tips rooting in the grass, a few arch right
// over the middle; hooked prickles on every cane, three-leaflet leaves at the nodes (dusty green, bronze, dried tan: a
// thicket dry enough to burn), a few berry clusters, dead pale canes and broken sticks at the foot.
// Same footprint as the old canes (dome ~3.4 m across, ~2.1 m tall; the collider r 1.55 m / 2.2 m stays in the game).
// Origin = ground centre (where the chest stands). Parts: canes (+ prickles, berries) and leaves (drawn double-sided).
import { Mesh, toLin, prng, fbm, norm, add, sub, mul, cross, lerp3, ss, C, mixc, scalec, spline, transport, tube, blade, blob } from './props_activity_lib.mjs';

export const PARTS = {
  cane: { name: 'BriarCane', surface: 'bark', look: { detail: 0.25, rim: 0.25, wrap: 0.35 } },
  leaf: { name: 'BriarLeaf', surface: 'none', look: { trans: 0.45, rim: 0.3, wrap: 0.5 } },
};
// per LOD: canes, path samples per span, sides, prickle spacing (m, 0 = none), leaf node spacing, leaflets, blade segs
const L = [
  { canes: 28, n: 4, sides: 5, prick: 0.17, node: 0.21, leaflets: 3, segs: 2, cols: 3, berries: 1, sticks: 5, laterals: 2, leafK: 1 },
  { canes: 22, n: 3, sides: 4, prick: 0, node: 0.25, leaflets: 3, segs: 2, cols: 2, berries: 0.5, sticks: 3, laterals: 1, leafK: 1.1 },
  { canes: 14, n: 2, sides: 3, prick: 0, node: 0.32, leaflets: 1, segs: 2, cols: 2, berries: 0, sticks: 0, laterals: 0, leafK: 1.9 },
];
const CANE = C(0x6e4537), CANE_TIP = C(0x8a5a45), CANE_BASE = C(0x4a3a2c), DEAD = C(0x9a8a70), PRICKLE = C(0xc79a7a);
const LEAF = [C(0x5f7f3a), C(0x7f8c47), C(0x8a5a36), C(0xa58b5a), C(0x4f6c36)];   // green, olive, bronze, dried, deep

function buildLod(lod) {
  const o = L[lod], m = new Mesh(), r = prng(7101);
  const canes = [];
  for (let i = 0; i < 28; i++) {
    // the same 28 cane draws at every LOD (a LOD keeps the first o.canes, spread round the ring): the silhouette holds
    const th0 = (((i * 11) % 28) / 28) * Math.PI * 2 + (r() - 0.5) * 0.4, rc = 0.3 + r() * 0.55;
    const over = i % 5 === 2;                         // arches right over the middle (the dome's roof)
    const dead = i % 7 === 4;
    const th = over ? th0 + Math.PI + (r() - 0.5) * 0.8 : th0 + (r() - 0.5) * 0.7;
    const H = over ? 1.55 + r() * 0.45 : 0.95 + r() * 0.85, R = over ? 1.1 + r() * 0.6 : 1.6 + r() * 0.55, tipY = r() < 0.45 ? 0.02 : 0.12 + r() * 0.45;
    const c0 = [Math.sin(th0) * rc, -0.06, Math.cos(th0) * rc], dir = [Math.sin(th), 0, Math.cos(th)];
    const at = (k, y) => add(over ? lerp3(c0, mul(dir, R), k) : add(c0, mul(dir, (R - rc) * k)), [0, y, 0]);
    const side = [dir[2], 0, -dir[0]], wob = () => mul(side, (r() - 0.5) * 0.26);
    const ctrl = [c0, add(at(0.1, H * 0.5), wob()), add(at(0.32, H * 0.93), wob()), add(at(0.52, H), wob()), add(at(0.76, H * 0.66), wob()), add(at(1, tipY), wob())];
    canes.push({ ctrl, r0: dead ? 0.016 : 0.018 + r() * 0.008, dead, over, seed: r() * 1000, berries: !dead && i % 5 === 1, leafy: !dead });
  }
  // canes: zig-zag a little at the nodes (a bramble bends at every leaf)
  for (let ci = 0; ci < o.canes; ci++) {
    const c = canes[ci], rr = prng(c.seed | 0);
    let path = spline(c.ctrl, o.n);
    path = path.map((p, i) => (i % 2 === 1 && i > 2 ? add(p, [(rr() - 0.5) * 0.04, (rr() - 0.5) * 0.02, (rr() - 0.5) * 0.04]) : p));
    const radius = (t) => c.r0 * (1 - 0.72 * t);
    tube(m, path, {
      r: radius, sides: o.sides, part: 'cane', cap0: false, cap1: 'tip',
      col: ({ t, n }) => {
        const base = c.dead ? DEAD : mixc(mixc(CANE_BASE, CANE, ss(0, 0.25, t)), CANE_TIP, ss(0.6, 1, t));
        const lit = 0.92 + 0.12 * Math.max(0, n[1]);
        return scalec(base, lit * (0.94 + 0.12 * fbm(t * 9, c.seed, 0, 3, 2)));
      },
    });
    const F = transport(path), N = F.length;
    const Ls = [0]; for (let i = 1; i < N; i++) Ls.push(Ls[i - 1] + Math.hypot(...sub(path[i], path[i - 1])));
    const total = Ls[N - 1];
    const sample = (s) => { let i = 1; while (i < N - 1 && Ls[i] < s) i++; const k = (s - Ls[i - 1]) / ((Ls[i] - Ls[i - 1]) || 1); return { p: lerp3(path[i - 1], path[i], k), f: F[i], t: s / total }; };
    // hooked prickles: short cones leaning back toward the base
    if (o.prick) for (let s = 0.12; s < total * 0.92; s += o.prick * (0.7 + rr() * 0.6)) {
      const { p, f, t } = sample(s), a = rr() * Math.PI * 2, rad = radius(t);
      const out = norm(add(mul(f.n, Math.cos(a)), mul(f.b, Math.sin(a))));
      const len = 0.016 + rr() * 0.01, tip = add(add(p, mul(out, rad + len)), mul(f.t, -len * 0.7));
      const u = f.t, w = cross(out, u), bw = 0.0055;
      const b0 = add(p, mul(out, rad * 0.8)), base = [add(b0, mul(u, bw)), add(add(b0, mul(u, -bw)), mul(w, bw)), add(add(b0, mul(u, -bw)), mul(w, -bw))];
      const lc = c.dead ? scalec(DEAD, 1.08) : PRICKLE, i0 = m.nv;
      const nTip = norm(add(out, mul(f.t, -0.6)));
      for (const q of base) m.v(q, norm(sub(q, p)), lc.map(toLin), 'cane');
      m.v(tip, nTip, lc.map(toLin), 'cane');
      m.tri(i0, i0 + 1, i0 + 3); m.tri(i0 + 1, i0 + 2, i0 + 3); m.tri(i0 + 2, i0, i0 + 3);
    }
    // a compound leaf at p (cane frame f), alternating side k
    const leafAt = (p, f, k) => {
      const sideA = k % 2 ? 1 : -1, out = norm(add(add(mul(f.b, sideA), mul(f.t, 0.55)), [0, 0.35, 0]));
      const kind = rr(), base = kind < 0.48 ? LEAF[0] : kind < 0.68 ? LEAF[1] : kind < 0.79 ? LEAF[2] : kind < 0.88 ? LEAF[3] : LEAF[4];
      const pet = add(p, mul(out, 0.045)), sz = (0.115 + rr() * 0.045) * o.leafK;
      const up = norm(add([0, 1, 0], mul(out, -0.3)));
      const angs = o.leaflets === 3 ? [0, 0.85, -0.85] : [0];
      angs.forEach((da, j) => {
        const ca = Math.cos(da), sa = Math.sin(da), w2 = cross(up, out);
        const d = norm(add(add(mul(out, ca), mul(w2, sa)), [0, -0.12 - rr() * 0.2, 0]));
        const len = sz * (j === 0 ? 1 : 0.8), tone = 0.88 + rr() * 0.22;
        blade(m, {
          base: j === 0 ? pet : add(pet, mul(out, -0.01)), dir: d, up, len, wid: len * 0.42, fold: 0.35 + rr() * 0.25, curl: -0.25 - rr() * 0.5, twist: (rr() - 0.5) * 0.6,
          segs: o.segs, cols: o.cols, part: 'leaf',
          shape: (u) => Math.min(1, Math.sin(Math.PI * Math.min(1, u * 1.08 + 0.02)) ** 0.75) * (1 - 0.15 * u),
          col: ({ u, v }) => {
            const rib = 1 + 0.1 * (1 - Math.min(1, Math.abs(v) * 3));
            const dryTip = base === LEAF[3] || base === LEAF[2] ? 1 : ss(0.75, 1, u) * 0.35;
            return scalec(mixc(base, LEAF[3], dryTip * 0.25), tone * rib * (0.92 + 0.1 * u));
          },
        });
      });
    };
    // leaves at the nodes (more toward the outer, sunlit part of the arch)
    if (c.leafy) for (let s = 0.3 + rr() * 0.1, k = 0; s < total * 0.97; s += o.node * (0.8 + rr() * 0.4), k++) {
      const { p, f, t } = sample(s);
      if (t < 0.25 && rr() < 0.75) continue;
      leafAt(p, f, k);
    }
    // side shoots off the top of the arch: short, leafy, reaching out and up (the thicket's leaf mass)
    if (c.leafy) for (let l = 0; l < o.laterals; l++) {
      const { p, f, t } = sample(total * (0.34 + 0.22 * l + rr() * 0.08)), rad = radius(t);
      const out = norm(add(add(mul(f.b, l % 2 ? 1 : -1), mul(f.t, 0.6)), [0, 0.45, 0])), len = 0.32 + rr() * 0.25;
      const q1 = add(p, mul(out, len * 0.5)), q2 = add(add(p, mul(out, len)), [0, -0.06, 0]);
      const lp = spline([p, add(q1, [0, 0.05, 0]), q2], 2);
      tube(m, lp, { r: (u) => rad * 0.55 * (1 - 0.6 * u), sides: Math.max(3, o.sides - 2), part: 'cane', col: mixc(CANE, CANE_TIP, 0.6), cap0: false, cap1: 'tip' });
      const lf = transport(lp);
      for (let k = 1; k < lp.length; k += lod ? 2 : 1) leafAt(lp[k], lf[k], k + l);
    }
    // berry clusters (ripe black and unripe red drupes)
    if (c.berries && o.berries && rr() < o.berries + 0.2) {
      const { p } = sample(total * 0.62);
      for (let b = 0; b < 4; b++) {
        const q = add(p, [(rr() - 0.5) * 0.07, -0.03 - rr() * 0.05, (rr() - 0.5) * 0.07]), ripe = b % 3 !== 2;
        blob(m, { r: [0.013, 0.015, 0.013], seg: lod ? 5 : 7, rings: lod ? 3 : 5, part: 'cane', col: ({ n }) => scalec(ripe ? C(0x3b2a44) : C(0xa0372e), 0.9 + 0.35 * Math.max(0, n[1])), xf: { p: (v) => add(v, q), n: (v) => v } });
      }
    }
  }
  // dead sticks and snapped canes lying at the foot
  for (let s = 0; s < o.sticks; s++) {
    const a = s * 2.4 + 0.6, d0 = 1.0 + (s % 3) * 0.3, a2 = a + 0.9 + (s % 2) * 0.6, len = 0.6 + (s % 3) * 0.25;
    const p0 = [Math.sin(a) * d0, 0.02, Math.cos(a) * d0], p1 = add(p0, [Math.sin(a2) * len, 0.05, Math.cos(a2) * len]);
    tube(m, spline([p0, add(lerp3(p0, p1, 0.5), [0, 0.04, 0]), p1], 2), { r: (t) => 0.014 * (1 - 0.4 * t), sides: lod ? 4 : 5, part: 'cane', col: scalec(DEAD, 0.95), cap0: 'flat', cap1: 'flat' });
  }
  return m;
}

export default {
  name: 'briar_thicket', parts: PARTS, lods: 3, views: [[30, 16], [200, 40]],
  notes: 'Briar thicket for the bramble puzzles (gameplay/wilds-puzzles.js): arching bramble canes with hooked prickles, three-leaflet leaves (green / bronze / dried), berry clusters, dead sticks. Origin = ground centre (the chest), dome ~3.4 m x ~2.1 m. Leaves are a single sheet: the game draws BriarLeaf double-sided.',
  build: buildLod,
};
