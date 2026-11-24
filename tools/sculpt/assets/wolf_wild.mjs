// 荒原狼 — the moorland wolf of the journey's packs, sculpted on the skeleton and clips of ani_wolf (Quaternius, CC0).
// The form is the studio's sculpted wolf (wolf_lib.mjs: deep keeled chest, tucked waist, jointed legs, long wedge head,
// a crest of brush-stroke locks, a heavy brush tail) built at its pooled-wolf density; this asset gives it a coat of its
// own instead of the shade's ink value map: cool grey back with a dark saddle, cream throat / belly / muzzle, a dark mask
// edge round amber eyes, locks pale at the tips. Bind pose, game metres, +Z front, feet on y = 0.
// INTENT
//  silhouette / big forms: as wolf_lib (a hunter, never a dog). the eye rests on: amber eyes in the dark mask, the pale
//  throat ruff. story: a wild animal of the heath — sun-bleached tips, darker legs from the wet heather. must not look
//  like: the pack's flat grey dog, the violet shade wolf, a husky.
// After every build:  node tools/sculpt/assets/beast_kit.mjs post wolf_wild   (weld weights, glow uv for the eyes)
import { buildWolf, rotHead, lockParam } from './wolf_lib.mjs';
import * as P from '../sdf.mjs';

export default {
  name: 'wolf_wild',
  id: 'sculpt_wolf_wild',
  rig: { file: 'assets/models/refined/ani_wolf.glb' },
  rigCredit: 'Quaternius, CC0 (skeleton + clips)',
  voxel: 0.0036,
  lods: [5600],
  ground: 0,
  aoRange: 0.07,
  aoStrength: 0.4,
  cavityDark: 0.22,
  cavity: [0.003, 0.012],
  creaseAngle: 80,
  hardAngle: 70,
  bandSlack: 0.012,
  materials: { body: { name: 'Main' }, eye: { name: 'Main' }, ember: { name: 'Main' } },
  weights: { smooth: 4, smoothAlpha: 0.5 },
  dropNodes: ['Eyes'],
  glowColor: [0.9, 0.55, 0.15],
  headView: [[0, 0.6, 0.62], 0.55],
  poses: [['Idle', 0.8], ['Walk', 0.3], ['Gallop', 0.12], ['Gallop', 0.36], ['Attack', 0.55], ['Death', 0.9]],
  notes: 'Clip use: idle=Idle, move=Walk, run=Gallop, attack=Attack, death=Death. Sculpted moorland wolf on the ani_wolf skeleton (joints, IBMs, clips unchanged; form from wolf_lib.mjs at the pooled density). Vertex colours; TEXCOORD_0.x = eye glow.',

  build({ S, rig }) {
    const w = buildWolf(S, rig, { lod: true });
    // the coat: every part of the studio wolf repainted (part() with the same name updates its paint)
    const fur = { paint: paintFur };
    for (const n of ['fur', 'foreleg', 'hindleg']) S.part(n, fur);
    S.part('paw', { paint: (c) => P.mix(C.ink, C.deep, P.ss(0.03, 0.0, c.y) * 0.6 + c.cavity * 0.3) });
    S.part('claw', { paint: (c) => P.mix(P.color('#d9ccb4'), C.low, P.ss(0.0, 0.02, c.y)) });
    S.part('fang', { paint: () => P.color('#f4ecdc') });
    S.part('head', { paint: paintHead });
    S.part('nose', { paint: () => P.color('#2f2925') });
    S.part('eye', { paint: () => P.color('#f2a531') });
    S.part('core', { paint: () => P.color('#1c1410') });
    S.part('ember', { paint: () => P.color('#3a2a24') });
    S.part('ear', { paint: (c) => { const lp = lockParam(c.x, c.y, c.z, ['ear']); return P.mix(P.mix(C.mid, C.ink, P.ss(0.5, 1.0, lp.h) * 0.7), C.deep, c.cavity * 0.5); } });
    S.part('mane', { paint: paintMane });
    S.part('tailroot', { paint: paintTail });
    S.part('tail', { paint: paintTail });
    for (let i = 0; i < 8; i++) S.part('tail' + i, { paint: paintTail });
    return w;
  },
};

const C = {
  hi: P.color('#eeebe3'), mid: P.color('#a3a09a'), low: P.color('#85827c'), ink: P.color('#4d4a46'), deep: P.color('#363433'),
};
function saddle(y, z) {
  const edge = 0.535 + 0.014 * Math.sin(z * 47 + 0.6) + 0.008 * Math.sin(z * 113) + 0.03 * P.ss(0.25, 0.42, z) + 0.02 * P.ss(-0.05, -0.15, z);
  return P.ss(edge - 0.012, edge + 0.008, y) * P.ss(-0.17, -0.08, z) * P.ss(0.42, 0.33, z);
}
function paintFur(c) {
  const { y, z, ny, cavity, edge } = c;
  let col = P.mix(C.mid, C.hi, P.ss(-0.2, 0.7, ny) * 0.35);
  // the throat, chest and belly cream
  col = P.mix(col, C.hi, P.ss(0.2, 0.4, z) * P.ss(0.45, 0.32, y) * 0.75);
  col = P.mix(col, C.hi, P.ss(-0.3, -0.75, ny) * 0.7);
  // the dark saddle over the back
  col = P.mix(col, C.ink, saddle(y, z) * 0.8);
  // legs darker toward the paws (wet heather)
  col = P.mix(col, C.low, P.ss(0.3, 0.12, y) * 0.6);
  col = P.mix(col, C.hi, edge * 0.25);
  return P.mix(col, C.deep, cavity * 0.2);
}
function paintHead(c) {
  const { ny, nz, cavity, edge } = c;
  const [, y, z] = rotHead([c.x, c.y, c.z], -1);
  let col = P.mix(C.mid, C.hi, P.ss(-0.1, 0.8, ny) * 0.4);
  // cream muzzle, cheeks and jaw; a darker brow and crown
  col = P.mix(col, C.hi, P.ss(0.6, 0.545, y) * 0.8);
  col = P.mix(col, C.hi, P.ss(0.66, 0.7, z) * 0.6);
  col = P.mix(col, C.low, P.ss(0.62, 0.66, y) * P.ss(0.67, 0.6, z) * 0.6);
  // the mask edge: a dark line framing the eyes (the gaze reads at range)
  const hood = P.ss(0.598, 0.608, y - 0.22 * (z - 0.64)) * P.ss(0.674, 0.662, z) * P.ss(0.62, 0.6, y);
  col = P.mix(col, C.ink, hood * 0.7);
  col = P.mix(col, C.deep, P.ss(0.725, 0.74, z) * 0.7);   // nose leather round the nose
  col = P.mix(col, C.hi, edge * 0.3);
  void nz;
  return P.mix(col, C.deep, cavity * 0.4);
}
function paintMane(c) {
  const lp = lockParam(c.x, c.y, c.z);
  const h = lp.h < 0 ? 0 : lp.h;
  // throat ruff cream; the crest grey at the root, sun-bleached at the tips
  if (lp.kind === 'ruff') return P.mix(P.mix(C.hi, C.mid, P.ss(0.6, 1.0, h) * 0.3), C.deep, c.cavity * 0.3);
  let col = P.mix(C.ink, C.mid, P.ss(0.0, 0.5, h));
  col = P.mix(col, C.hi, P.ss(0.6, 1.0, h) * 0.8);
  col = P.mix(col, C.hi, c.edge * 0.3);
  return P.mix(col, C.deep, c.cavity * 0.3);
}
function paintTail(c) {
  const lp = lockParam(c.x, c.y, c.z, ['tail']);
  let col = P.mix(C.low, C.mid, P.ss(-0.2, 0.7, c.ny));
  if (lp.h >= 0) col = P.mix(col, C.hi, P.ss(0.5, 1.0, lp.h) * 0.7);
  col = P.mix(col, C.ink, P.ss(-0.6, -0.68, c.z) * 0.6);   // a dark tip
  col = P.mix(col, C.hi, c.edge * 0.25);
  return P.mix(col, C.deep, c.cavity * 0.35);
}

/** beast_kit post: the amber eyes glow a little (a predator's eyes in the heath) */
export function glow(s) {
  const amber = s[0] > 0.75 && s[1] > 0.45 && s[1] < 0.75 && s[2] < 0.35 ? 1 : 0;
  return amber * 0.45;
}
