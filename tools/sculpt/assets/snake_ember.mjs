// 余烬蛇 — the ember serpent (fire guardian of the wilds), sculpted anew on the skeleton and clips of mon_serpent
// (assets/models/creatures/mon_serpent.glb, Quaternius, CC0). Bind pose, game metres, +Z front. The pack body sits 2.5 cm
// off the centre line (x = -0.025): everything is modelled about x = 0 and moved there at the end.
// INTENT
//  silhouette: a cobra that rises out of its own coil — a flared hood wider than the head, a broad wedge head with big
//    gold eyes, the body ringed in plates like banked coals, the tail lying back along the ground.
//  big forms: the coil and the upright chest, the hood, the head. medium: body segments (rings that step down toward the
//    tail), belly scutes, brow horns, jaw. small: keeled scales on the back, fangs, nostrils.
//  the eye rests on: the head and hood — eyes (the game's, src/actors/creature.js KIT_OWN), the ember eye-spots on the hood.
//  story: a creature of a banked fire — charcoal and deep red plates, the cracks between them still glowing (TEXCOORD_0.x
//    glow via beast_kit post), a warm gold belly, ash-pale edges where the plates are worn.
//  must not look like: the pack's green cartoon tube; a dragon; a worm; noise everywhere.
// After every build:  node tools/sculpt/assets/beast_kit.mjs post snake_ember   (weld weights, glow uv)
import { lock, V } from './beast_kit.mjs';

const CX = -0.025;
// centre line from the tail tip to the head (x = 0), read from slices of the pack body
const PATH = [[0, 0.25, -1.24], [0, 0.255, -1.0], [0, 0.265, -0.72], [0, 0.28, -0.42], [0, 0.3, -0.14], [0, 0.34, 0.1], [0, 0.42, 0.34],
  [0, 0.58, 0.56], [0, 0.8, 0.7], [0, 1.0, 0.74], [0, 1.2, 0.72], [0, 1.4, 0.6], [0, 1.6, 0.42], [0, 1.8, 0.22], [0, 2.0, 0.12], [0, 2.2, 0.11], [0, 2.4, 0.15], [0, 2.56, 0.24]];
const RAD = (t) => (t < 0.1 ? 0.025 + 0.085 * (t / 0.1) : t < 0.3 ? 0.11 + 0.06 * ((t - 0.1) / 0.2) : t < 0.6 ? 0.17 + 0.075 * ((t - 0.3) / 0.3) : 0.245 - 0.05 * ((t - 0.6) / 0.4));
// dense samples of the centre line: point, tangent, belly direction (tangent turned -90 deg in the y-z plane), t
const SAMP = (() => {
  const pts = []; for (let i = 0; i < PATH.length - 1; i++) for (let k = 0; k < 12; k++) pts.push(V.lerp(PATH[i], PATH[i + 1], k / 12)); pts.push(PATH[PATH.length - 1]);
  // Catmull-Rom-ish smoothing
  for (let it = 0; it < 6; it++) for (let i = 1; i < pts.length - 1; i++) pts[i] = V.lerp(pts[i], V.mul(V.add(pts[i - 1], pts[i + 1]), 0.5), 0.5);
  let L = 0; const cum = [0]; for (let i = 1; i < pts.length; i++) { L += V.len(V.sub(pts[i], pts[i - 1])); cum.push(L); }
  return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], t = V.norm(V.sub(b, a)); return { p, t, belly: [0, -t[2], t[1]], u: cum[i] / L }; });
})();
const near = (x, y, z) => { let best = SAMP[0], bd = 1e9; for (const s of SAMP) { const d = (x - s.p[0]) ** 2 + (y - s.p[1]) ** 2 + (z - s.p[2]) ** 2; if (d < bd) { bd = d; best = s; } } return best; };
const NSEG = 24;

export default {
  name: 'snake_ember',
  id: 'sculpt_embersnake',
  rig: { file: 'assets/models/creatures/mon_serpent.glb' },
  rigCredit: 'Quaternius, CC0 (skeleton + clips)',
  voxel: 0.0062,
  lods: [14000],
  ground: 0,
  aoRange: 0.1,
  aoStrength: 0.4,
  cavityDark: 0.15,
  cavity: [0.005, 0.02],
  creaseAngle: 80,
  bandSlack: 0.015,
  weights: { smooth: 4, smoothAlpha: 0.5 },
  glowColor: [1.0, 0.45, 0.12],
  headView: [[CX, 2.6, 0.45], 1.9],
  poses: [['SnakeArmature|Snake_Idle', 0.6], ['SnakeArmature|Snake_Walk', 0.3], ['SnakeArmature|Snake_Attack', 0.3], ['SnakeArmature|Snake_Jump', 0.45]],
  notes: 'Clip use: idle=Snake_Idle, move=Snake_Walk, attack=Snake_Attack. Sculpted ember serpent on the mon_serpent skeleton (joints, IBMs, clips unchanged). Vertex colours; TEXCOORD_0.x = ember glow (the game adds emissive through a ramp); eyes added by the game on the Mouth bone.',

  build({ S }) {
    // ---- body: ringed segments along the centre line, each a little fuller at its front end so the rings step
    const segs = [];
    const at = (u) => { const i = Math.min(SAMP.length - 1, Math.max(0, Math.round(u * (SAMP.length - 1)))); return SAMP[i]; };
    for (let i = 0; i < NSEG; i++) {
      const u0 = i / NSEG, u1 = (i + 1.06) / NSEG, a = at(u0), b = at(Math.min(1, u1));
      segs.push(S.taperedCapsule(a.p, b.p, RAD(u0) * 0.9, RAD(Math.min(1, u1)) * 1.04));
    }
    let body = S.softUnion(0.012, ...segs);
    // keeled scales on the back and sides (small cells), never on the belly
    body = body.rough({ type: 'cells', scale: 0.045, amp: 0.0045, seed: 5, mask: (x, y, z, nx, ny, nz) => {
      const s = near(x, y, z); const bd = (nx * s.belly[0] + ny * s.belly[1] + nz * s.belly[2]); return P.ss(0.1, -0.4, bd); } });
    body = body.part('body', { mat: 'body', paint: paintBody });

    // ---- hood: two flaps flared from the neck behind the head, cupped forward, ribbed on the front
    const hoodFlap = S.ellipsoid([0.36, 0.5, 0.085]).turn(-16, 0, 14).at(0.24, 2.12, 0.02)
      .warp((x, y, z, o) => { o[2] = 0.45 * Math.pow(Math.max(0, x - 0.08), 2); }, { lip: 1.5 })
      .mirror('x');
    let hood = hoodFlap.cut(S.ellipsoid([0.5, 0.18, 0.4]).at(0, 1.48, 0.3));   // the hood's lower edge sweeps up into the neck
    hood = hood.part('hood', { mat: 'body', paint: paintHood });

    // ---- head: a broad wedge — skull, snout, a strong lower jaw, brow horns, the mouth open a little (bind pose)
    const skull = S.ellipsoid([0.37, 0.33, 0.46]).at(0, 2.74, 0.33);
    const snout = S.ellipsoid([0.27, 0.215, 0.4]).at(0, 2.63, 0.8);
    let head = S.softUnion(0.08, skull, snout);
    head = head.softCut(S.box([1.2, 0.2, 1.2]).at(0, 2.33, 0.74), 0.02);                               // the upper jaw's flat underside
    head = head.softCut(S.ellipsoid([0.075, 0.055, 0.07]).at(0.35, 2.82, 0.52).mirror('x'), 0.025);      // eye sockets
    head = head.softCut(S.ellipsoid([0.022, 0.016, 0.03]).turn(0, 20, 0).at(0.08, 2.68, 1.1).mirror('x'), 0.008);   // nostrils
    // brow scales: a ridge over each eye ending in a short swept-back horn
    const brow = S.softUnion(0.03,
      S.ellipsoid([0.11, 0.05, 0.18]).turn(0, 12, -14).at(0.27, 2.99, 0.5),
      S.taperedCapsule([0.28, 3.02, 0.34], [0.36, 3.14, 0.05], 0.062, 0.016)).mirror('x');
    head = head.softAdd(brow, 0.03);
    head = head.rough({ type: 'cells', scale: 0.05, amp: 0.004, seed: 9, mask: 'up' });
    head = head.part('head', { mat: 'body', paint: paintHead });
    const jaw = S.softUnion(0.06, S.ellipsoid([0.24, 0.11, 0.38]).at(0, 2.3, 0.66), S.ellipsoid([0.22, 0.13, 0.24]).at(0, 2.3, 0.34))
      .part('jaw', { mat: 'body', paint: paintJaw });
    const fangs = S.union(S.taperedCapsule([0.12, 2.44, 0.98], [0.125, 2.35, 1.0], 0.022, 0.004), S.taperedCapsule([0.09, 2.31, 0.92], [0.09, 2.38, 0.93], 0.015, 0.003))
      .mirror('x').part('fang', { mat: 'body', paint: () => S.color('#fff3df') });
    // the mouth's dark inside: a soft pad between the jaws
    const mouth = S.ellipsoid([0.2, 0.05, 0.34]).at(0, 2.39, 0.68).part('mouth', { mat: 'body', paint: () => S.color('#5a1418') });

    // a forked tongue of flame along the tongue bones, out past the snout
    const tongue = S.softUnion(0.012,
      S.tube([[0, 2.405, 0.72], [0, 2.385, 0.95], [0, 2.36, 1.17], [0, 2.34, 1.3]], (t) => 0.032 - 0.012 * t, { aspect: 1.6, up: [1, 0, 0] }),
      S.taperedCapsule([0, 2.34, 1.29], [0.05, 2.325, 1.44], 0.02, 0.006), S.taperedCapsule([0, 2.34, 1.29], [-0.05, 2.325, 1.44], 0.02, 0.006))
      .part('tongue', { mat: 'body', paint: (c) => P.mix(C.ember, C.hot, P.ss(1.2, 1.42, c.z)) });
    let snake = body.softAdd(hood, 0.09).add(tongue).softAdd(head, 0.07).softAdd(jaw, 0.03).add(mouth).add(fangs);
    return snake.at(CX, 0, 0);
  },
};

import * as P from '../sdf.mjs';
const C = {
  coal: P.color('#3b2327'), red: P.color('#86302a'), ash: P.color('#a8786a'), ember: P.color('#ff7a1e'), hot: P.color('#ffc35a'),
  belly: P.color('#dc8128'), bellyHi: P.color('#f0ae45'),
};
function paintBody(c) {
  const x = c.x - CX, { y, z, nx, ny, nz, cavity, edge } = c;
  const s = near(x, y, z);
  const bd = nx * s.belly[0] + ny * s.belly[1] + nz * s.belly[2];
  // the ring this point lies on: 0 at its back seam .. 1 at its front
  const ring = (s.u * NSEG) % 1;
  // back: charcoal at the ridge, deep red down the sides; plates paler toward their worn front edge
  let col = P.mix(C.red, C.coal, P.ss(-0.2, -0.8, bd));
  col = P.mix(col, C.ash, P.ss(0.55, 0.95, ring) * 0.35 + edge * 0.25);
  // belly scutes: gold plates with a light leading edge
  const belly = P.ss(0.42, 0.72, bd);
  col = P.mix(col, P.mix(C.belly, C.bellyHi, P.ss(0.4, 0.9, ring)), belly);
  // ember cracks: the seams between rings and the deepest creases glow (strongest on the back, cool toward the tail tip)
  const seam = P.ss(0.12, 0.0, Math.min(ring, 1 - ring)) * (1 - belly * 0.7);
  const crack = Math.max(seam * P.ss(0.08, 0.3, s.u), P.ss(0.35, 0.75, cavity) * (1 - belly));
  col = P.mix(col, P.mix(C.ember, C.hot, crack * 0.5), crack * 0.9);
  return col;
}
function paintHood(c) {
  const x = Math.abs(c.x - CX), { y, z, nz, cavity, edge } = c;
  // front (toward +z) like the belly in gold with dark rib lines; back charcoal with two ember eye-spots
  const front = P.ss(-0.1, 0.35, nz);
  let col = P.mix(C.coal, C.red, P.ss(0.5, 0.15, x) * 0.6);
  col = P.mix(col, P.mix(C.belly, C.bellyHi, P.ss(1.8, 2.3, y)), front * 0.85);
  const rib = Math.abs(((x * 9) % 1) - 0.5) < 0.08 ? 1 : 0;
  col = P.mix(col, C.red, rib * front * 0.5);
  // the eye-spots: a glowing ring with a dark centre on the back of each flap
  const d = Math.hypot(x - 0.3, y - 2.12) / 0.1;
  const spot = P.ss(1.0, 0.75, d) * P.ss(0.35, 0.55, d) * (1 - front);
  col = P.mix(col, C.ember, spot);
  col = P.mix(col, C.ember, P.ss(0.5, 0.85, cavity) * (1 - front) * 0.8);
  col = P.mix(col, C.ash, edge * 0.35);
  void z;
  return col;
}
function paintHead(c) {
  const x = Math.abs(c.x - CX), { y, ny, cavity, edge } = c;
  let col = P.mix(C.red, C.coal, P.ss(0.2, 0.8, ny));
  // a warm lip line along the upper jaw, ash on the brow ridges, embers in the deepest scale seams
  col = P.mix(col, C.belly, P.ss(2.47, 2.4, y) * 0.8);
  col = P.mix(col, C.ash, P.ss(2.84, 2.95, y) * P.ss(0.15, 0.25, x) * 0.6 + edge * 0.3);
  col = P.mix(col, C.ember, P.ss(0.45, 0.8, cavity) * 0.85);
  return col;
}
function paintJaw(c) { return P.mix(P.mix(C.belly, C.bellyHi, P.ss(-0.2, -0.8, c.ny)), C.red, P.ss(2.36, 2.4, c.y) * 0.6); }

/** beast_kit post: glow from where the point is (the ring seams on the back and sides, the hood's eye-spots, the tongue)
 *  plus the ember hue of the paint (cavity cracks, scale seams of the head). p / n: bind position and normal. */
export function glow(s, p, n) {
  const x = p[0] - CX, [, y, z] = p;
  let g = 0;
  if (y < 2.45 || z < 0.1) {
    const sm = near(x, y, z), bd = n[0] * sm.belly[0] + n[1] * sm.belly[1] + n[2] * sm.belly[2];
    const ring = (sm.u * NSEG) % 1, seam = P.ss(0.1, 0.0, Math.min(ring, 1 - ring)) * P.ss(0.42, 0.1, bd) * P.ss(0.08, 0.3, sm.u);
    if (Math.hypot(x, y - sm.p[1], z - sm.p[2]) < RAD(sm.u) * 1.3) g = Math.max(g, seam);
  }
  // hood eye-spots (back of the flaps)
  const ax = Math.abs(x);
  if (ax > 0.12 && y > 1.6 && y < 2.6 && n[2] < 0.1) { const d = Math.hypot(ax - 0.3, y - 2.12) / 0.1; g = Math.max(g, P.ss(1.0, 0.75, d) * P.ss(0.35, 0.55, d)); }
  // the tongue
  if (z > 1.0 && y < 2.42 && y > 2.25) g = Math.max(g, 0.8);
  // the ember hue (paint): deep cracks and seams the position rule does not know
  const k = Math.max(0, Math.min(1, (s[0] - s[2] - 0.5) / 0.3)) * Math.max(0, 1 - Math.abs(s[1] / Math.max(0.05, s[0]) - 0.52) / 0.18);
  return Math.max(g, k * 0.8);
}
