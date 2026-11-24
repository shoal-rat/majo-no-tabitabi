// 霜角鹿 — the frost stag (guardian of the mountain pass), sculpted anew on the skeleton and clips of ani_stag
// (assets/models/refined/ani_stag.glb, Quaternius, CC0). Bind pose, game metres, +Z front, hooves on y = 0.
// INTENT
//  silhouette: a noble, long-legged stag — deep chest, high withers, a long neck carried proud, a fine head with big calm
//    eyes, ears out to the sides, a white flag of a tail. The crystal antlers are NOT in this mesh: the game grows them from
//    the head bone (src/combat/beasts.js frostAntlers, faceted ice that keeps crisp planes the cel path would smooth away);
//    this body carries the two pedicles they stand on.
//  big forms: the chest barrel, the haunch, the neck. medium: the frosted ruff hanging from the throat, shoulder + thigh
//    masses, knees / hocks, the head wedge. small: hooves, nose, eyes, ear cups, the crest locks.
//  the eye rests on: the head (eyes, ears, pedicles) and the ruff under it — the coldest blue lives at the lock tips.
//  story: a creature of the snowline — winter coat silver-white, the back faintly blue like snow in shade, the legs
//    darkening to slate as if wet with melt, the ruff rimed with frost.
//  must not look like: the pack's brown doe, a horse, a goat; a grey blob; noise everywhere.
// After every build:  node tools/sculpt/assets/beast_kit.mjs post stag_frost   (weld weights, colours linear once, glow uv)
import { lock, V } from './beast_kit.mjs';
// KIT_LO=1 builds the low / mobile body (same form, fewer triangles; creature.js picks it by tier).
const LO = !!process.env.KIT_LO;

export default {
  name: LO ? 'stag_frost_lo' : 'stag_frost',
  id: LO ? 'sculpt_froststag_lo' : 'sculpt_froststag',
  rig: { file: 'assets/models/refined/ani_stag.glb' },
  rigCredit: 'Quaternius, CC0 (skeleton + clips)',
  voxel: LO ? 0.006 : 0.0045,
  lods: [LO ? 4000 : 12000],
  ground: 0,
  aoRange: 0.09,
  aoStrength: 0.4,
  cavityDark: 0.22,
  cavity: [0.004, 0.016],
  creaseAngle: 80,
  bandSlack: 0.012,
  weights: { smooth: 4, smoothAlpha: 0.5 },
  headView: [[0, 1.66, 0.78], 0.75],
  dropNodes: ['Stag_Horns'],
  poses: [['Idle', 1.0], ['Walk', 0.4], ['Gallop', 0.2], ['Attack_Headbutt', 0.4], ['Attack_Kick', 0.4], ['Death', 0.9]],
  notes: 'Clip use: idle=Idle, move=Walk, run=Gallop, attack=Attack_Headbutt, death=Death. Sculpted frost stag on the ani_stag skeleton (joints, IBMs, clips unchanged). Vertex colours, no texture; crystal antlers are added by the game on the Head bone.',

  build({ S, rig }) {
    const fur = { mat: 'body', paint: paintCoat };
    // ---- trunk: ribcage barrel, a deep chest in front, withers, loin, a round haunch
    const ribs = S.ellipsoid([0.225, 0.27, 0.42]).turn(-3, 0, 0).at(0, 1.07, -0.04);
    const chest = S.ellipsoid([0.2, 0.235, 0.17]).turn(14, 0, 0).at(0, 1.0, 0.25);
    const brisket = S.ellipsoid([0.12, 0.11, 0.1]).at(0, 0.87, 0.3);
    const withers = S.ellipsoid([0.1, 0.1, 0.21]).turn(-6, 0, 0).at(0, 1.27, 0.15);
    const loin = S.ellipsoid([0.17, 0.13, 0.26]).at(0, 1.19, -0.42);
    const rump = S.ellipsoid([0.205, 0.2, 0.23]).turn(8, 0, 0).at(0, 1.15, -0.74);
    let trunk = S.softUnion(0.08, ribs, chest, withers).softAdd(brisket, 0.07).softAdd(loin, 0.1).softAdd(rump, 0.1);
    // the tuck behind the ribs and a soft flank hollow
    trunk = trunk.softCut(S.ellipsoid([0.3, 0.13, 0.2]).at(0, 0.74, -0.46), 0.08);
    trunk = trunk.softCut(S.ellipsoid([0.05, 0.08, 0.1]).at(0.215, 1.02, -0.44).mirror('x'), 0.05);
    // shoulder blades and thighs: the medium masses that catch the light
    const shoulder = S.ellipsoid([0.06, 0.2, 0.12]).turn(-22, 0, 6).at(0.165, 1.07, 0.2).mirror('x');
    const thigh = S.ellipsoid([0.08, 0.22, 0.17]).turn(14, 0, 0).at(0.14, 0.97, -0.7).mirror('x');
    trunk = trunk.softAdd(shoulder, 0.06).softAdd(thigh, 0.06);
    // ---- neck: deep and narrow, carried proud along the neck bones
    const neck = S.tube([[0, 1.12, 0.3], [0, 1.3, 0.44], [0, 1.48, 0.56], [0, 1.63, 0.64]], (t) => 0.17 - 0.07 * t, { aspect: 0.78 });
    trunk = trunk.softAdd(neck, 0.08);
    // a low mane ridge along the crest, poll to withers (soft, so it reads as winter coat, not a row of plates)
    trunk = trunk.softAdd(S.tube([[0, 1.74, 0.6], [0, 1.6, 0.44], [0, 1.47, 0.3], [0, 1.37, 0.18]], (t) => 0.035 + 0.012 * Math.sin(Math.PI * t), { aspect: 0.7 })
      .rough({ type: 'billow', scale: 0.035, amp: 0.006, seed: 8 }), 0.05);
    // ---- legs. fore: forearm muscle, a knobbed knee, a slim cannon, fetlock, pastern
    const fore = S.softUnion(0.018,
      S.taperedCapsule([0.155, 0.94, 0.22], [0.163, 0.52, 0.238], 0.085, 0.046),
      S.sphere(0.047).at(0.163, 0.49, 0.236),
      S.taperedCapsule([0.163, 0.49, 0.236], [0.163, 0.14, 0.215], 0.038, 0.031),
      S.sphere(0.039).at(0.163, 0.122, 0.213),
      S.taperedCapsule([0.163, 0.122, 0.213], [0.163, 0.055, 0.238], 0.033, 0.034),
    ).mirror('x');
    // hind: gaskin from the stifle back to a sharp hock, then the long cannon down to the hoof
    const hind = S.softUnion(0.02,
      S.taperedCapsule([0.155, 0.9, -0.64], [0.17, 0.63, -0.99], 0.095, 0.046),
      S.sphere(0.047).at(0.17, 0.606, -1.022),
      S.taperedCapsule([0.17, 0.6, -1.02], [0.17, 0.14, -0.94], 0.039, 0.031),
      S.sphere(0.039).at(0.17, 0.12, -0.936),
      S.taperedCapsule([0.17, 0.12, -0.936], [0.17, 0.055, -0.905], 0.033, 0.034),
    ).mirror('x');
    trunk = trunk.softAdd(fore, 0.05).softAdd(hind, 0.06);
    // ---- tail: a short white flag, lifted
    const tail = S.ellipsoid([0.055, 0.085, 0.06]).turn(-40, 0, 0).at(0, 1.2, -0.95)
      .rough({ type: 'billow', scale: 0.03, amp: 0.004, seed: 4 });
    trunk = trunk.softAdd(tail, 0.04);
    let body = trunk.part('coat', fur);

    // ---- hooves: cloven, dark slate, a little dew claw behind
    const hoof = (x, z) => {
      const half = (s) => S.ellipsoid([0.022, 0.04, 0.04]).turn(-8, 0, s * 4).at(x + s * 0.019, 0.03, z + 0.012);
      return S.softUnion(0.004, half(1), half(-1)).cut(S.box([0.2, 0.05, 0.2]).at(x, -0.025, z))
        .add(S.sphere(0.008).at(x + 0.012, 0.095, z - 0.03)).add(S.sphere(0.008).at(x - 0.012, 0.095, z - 0.03));
    };
    const hooves = S.union(hoof(0.163, 0.24), hoof(0.17, -0.9)).mirror('x').part('hoof', { mat: 'body', paint: paintHoof });

    // ---- head: a fine wedge — round cranium, long tapering muzzle, soft cheeks, a dark nose pad
    const cranium = S.ellipsoid([0.118, 0.104, 0.112]).at(0, 1.672, 0.7);
    const muzzle = S.taperedCapsule([0, 1.63, 0.77], [0, 1.555, 0.912], 0.076, 0.036);
    const jaw = S.taperedCapsule([0, 1.575, 0.72], [0, 1.525, 0.885], 0.054, 0.026);
    const cheek = S.ellipsoid([0.048, 0.056, 0.075]).turn(-20, 0, 0).at(0.064, 1.605, 0.74).mirror('x');
    let head = S.softUnion(0.04, cranium, cheek).softAdd(muzzle, 0.05).softAdd(jaw, 0.04);
    // eye sockets (shallow), a soft brow above them, nostrils
    head = head.softCut(S.ellipsoid([0.03, 0.04, 0.044]).turn(0, 26, 0).at(0.104, 1.68, 0.785).mirror('x'), 0.014);
    head = head.part('head', { mat: 'body', paint: paintHead, blend: { from: 'Neck3', to: 'Head', width: 0.07 } });
    // the eyes themselves are the game's (src/actors/creature.js KIT_OWN eyes: an iris texture that blinks) — they sit in
    // these sockets, framed by the dark lid line painted round them
    // ears: long leaves out to the sides and a little back, cupped forward
    const ear = lock([0.08, 1.74, 0.665], [0.3, 1.81, 0.6], 0.062, { thin: [0, 0.3, 1], flat: 0.36, lift: [0, 0.4, 1], curl: 0.08, prof: earProf })
      .softCut(S.ellipsoid([0.09, 0.03, 0.014]).turn(0, 18, 6).at(0.2, 1.776, 0.652), 0.008)
      .mirror('x').part('ear', { mat: 'body', paint: paintEar, bone: 'Head' });
    // pedicles: the two short silver bases the crystal antlers grow from (game: beasts.js frostAntlers)
    const ped = S.taperedCapsule([0.05, 1.74, 0.69], [0.066, 1.8, 0.686], 0.03, 0.027)
      .mirror('x').part('pedicle', { mat: 'body', paint: paintPedicle, bone: 'Head' });
    const nose = S.ellipsoid([0.032, 0.027, 0.026]).at(0, 1.55, 0.948)
      .softCut(S.ellipsoid([0.007, 0.006, 0.011]).turn(0, 20, 0).at(0.018, 1.544, 0.968).mirror('x'), 0.004)
      .part('nose', { mat: 'body', paint: () => S.color('#3e4659'), bone: 'Head' });

    // ---- the frosted ruff: long locks hanging from the throat down over the chest, short ones along the crest
    const locks = [];
    const R = rng(11);
    const throat = [
      // [x, y, z (root on the throat), length, radius, sweep x] — broad overlapping locks: one bib, tips apart at the bottom
      [0, 1.45, 0.66, 0.17, 0.07, 0], [0.06, 1.38, 0.6, 0.19, 0.072, 0.3], [-0.06, 1.38, 0.6, 0.19, 0.072, -0.3],
      [0, 1.3, 0.58, 0.22, 0.08, 0.05], [0.085, 1.24, 0.52, 0.2, 0.072, 0.45], [-0.085, 1.24, 0.52, 0.2, 0.072, -0.45],
      [0.035, 1.15, 0.5, 0.2, 0.075, 0.15], [-0.035, 1.15, 0.5, 0.2, 0.075, -0.15],
    ];
    for (const [x, y, z, L, r, sw] of throat) {
      const a = [x, y, z];
      const dir = V.norm([sw * 0.5, -1, 0.38 + (R() - 0.5) * 0.12]);
      locks.push(lock(a, V.add(a, V.mul(dir, L * (0.92 + R() * 0.16))), r, { thin: [0, 0, 1], flat: 0.55, lift: [sw * 0.3, 0, 1], curl: 0.28, prof: brush }));
    }
    // neck sides: two broad locks each side lying back over the shoulder
    for (const s of [1, -1]) for (const [y, z, L] of [[1.36, 0.5, 0.17], [1.24, 0.42, 0.16]]) {
      const a = [0.07 * s, y, z];
      locks.push(lock(a, V.add(a, V.mul(V.norm([0.3 * s, -0.6, -0.75]), L)), 0.05, { thin: [s, 0.2, 0], flat: 0.45, lift: [s, 0.3, 0], curl: 0.2, prof: brush }));
    }
    const ruff = S.union(...locks).part('ruff', { mat: 'body', paint: paintRuff });

    body = body.softAdd(head, 0.04).softAdd(ruff, 0.035).softAdd(ear, 0.012).softAdd(ped, 0.008).softAdd(nose, 0.006).add(hooves);
    void rig;
    return body;
  },
};

import * as P from '../sdf.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const brush = (h) => Math.max(0.05, Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * h)), 0.6) * (1 - 0.3 * h));
const earProf = (h) => Math.max(0.08, Math.pow(Math.sin(Math.PI * (0.2 + 0.8 * h)), 0.7));

const C = {
  coat: P.color('#eef3f8'), back: P.color('#cfdeed'), belly: P.color('#fbfcfd'), leg: P.color('#a9b9cc'), shin: P.color('#7f90a8'),
  hoof: P.color('#4a5468'), rime: P.color('#a9daf3'), deep: P.color('#5d6c86'),
};
function paintCoat(c) {
  const { y, z, ny, cavity, edge } = c;
  let col = C.coat;
  // the back in cool shade, a pale blue saddle stripe along the spine
  col = P.mix(col, C.back, P.ss(0.25, 0.85, ny) * P.ss(1.05, 1.25, y) * 0.75);
  // belly and inner thighs: near white
  col = P.mix(col, C.belly, P.ss(-0.2, -0.65, ny) * 0.8);
  // legs: slate below the knees / hocks, as if wet with melt
  const knee = z > -0.3 ? 0.5 : 0.62;
  col = P.mix(col, C.leg, P.ss(knee + 0.08, knee - 0.1, y));
  col = P.mix(col, C.shin, P.ss(0.26, 0.1, y));
  // tail: white flag, pale underside
  col = P.mix(col, C.belly, P.ss(-0.86, -0.95, z) * P.ss(1.08, 1.15, y));
  col = P.mix(col, P.color('#ffffff'), edge * 0.25);
  return P.mix(col, C.deep, cavity * 0.25);
}
function paintHead(c) {
  const { x, y, z, ny, cavity } = c;
  let col = P.mix(C.coat, C.back, P.ss(0.3, 0.9, ny) * 0.6);
  // a white muzzle band and chin, a soft blue-grey bridge down the nose
  col = P.mix(col, C.belly, P.ss(-0.1, -0.6, ny) * 0.8);
  col = P.mix(col, P.color('#b7c8da'), P.ss(0.86, 0.94, z) * P.ss(0.4, 0.8, ny) * (1 - P.ss(0.01, 0.04, Math.abs(x))) * 0.0);
  // dark lids: a line framing the eye (anime read of the gaze)
  const e = Math.hypot((Math.abs(x) - 0.09) / 0.03, (y - 1.678) / 0.042, (z - 0.79) / 0.046);
  col = P.mix(col, P.color('#53607a'), P.ss(1.18, 1.0, e) * 0.85);
  return P.mix(col, C.deep, cavity * 0.3);
}
function paintEar(c) {
  const { x, y, z, nz, ny } = c;
  // the front of the cup pale blue with a white fringe; the back like the coat
  const inner = P.ss(0.0, 0.6, nz + ny * 0.3);
  let col = P.mix(C.back, P.color('#c3daf0'), inner);
  col = P.mix(col, P.color('#ffffff'), P.ss(0.18, 0.26, Math.abs(x)) * 0.5);
  col = P.mix(col, P.color('#6f7f99'), P.ss(0.24, 0.275, Math.abs(x)) * 0.6);
  void y; void z;
  return col;
}
function paintPedicle(c) { return P.mix(P.color('#93a9c6'), P.color('#d9ecfa'), P.ss(1.76, 1.8, c.y)); }
function paintHoof(c) { return P.mix(C.hoof, P.color('#8a97ac'), P.ss(0.045, 0.06, c.y) * 0.5 + c.edge * 0.2); }
function paintRuff(c) {
  const { y, edge, cavity } = c;
  // white at the root, rimed blue toward the tips (lower = further down the lock)
  const tip = P.ss(1.35, 0.95, y);
  let col = P.mix(P.color('#f7fafd'), C.rime, tip * 0.9);
  col = P.mix(col, P.color('#ffffff'), edge * 0.35);
  return P.mix(col, P.color('#8aa6c4'), cavity * 0.35);
}
