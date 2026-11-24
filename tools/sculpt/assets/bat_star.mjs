// 啄星蝠 — the star-pecking bat that harries broom riders (combat/beasts.js TYPES.moth), sculpted on the skeleton and clips
// of mon_bat (Quaternius, CC0). The form is the studio's moth-bat (shade_bat.mjs: plump furred body, ringed abdomen, big
// leaf ears, a pale ruff, ribbed membranes with a torn fringe); this asset gives it a coat of the night it hunts in:
// warm brown fur, a cream ruff, amber eyes, membranes of deep night indigo flecked with small gold stars (they glow).
// Every part keeps the shade bat's shading (its lilac value map) and is re-coloured by luminance, part by part.
// After every build:  node tools/sculpt/assets/beast_kit.mjs post bat_star   (drops the pack eye node, welds, glow uv)
import shadeBat from './shade_bat.mjs';
import * as P from '../sdf.mjs';

const RAMP = {
  fur: ['#2f231d', '#6f523f', '#b39274'], ruff: ['#a8936e', '#e6d8b8', '#fbf4e2'], abdomen: ['#3a2c24', '#7d6450', '#c2a988'],
  dark: ['#241a16', '#4b3a30', '#7a6352'], membrane: ['#1c1834', '#3a3468', '#6d64a2'], eye: ['#160c08', '#b8741c', '#ffd27a'],
};
const PART_RAMP = {
  body: 'fur', head: 'fur', snout: 'fur', brow: 'fur', ear: 'fur', leg: 'dark', arm: 'dark', finger: 'dark', thumb: 'dark',
  ruff: 'ruff', abdomen: 'abdomen', membrane: 'membrane', eye: 'eye',
};
const lum = (c) => 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2];
function ramp(name, t) {
  const [a, b, c] = RAMP[name].map((h) => P.color(h));
  return t < 0.5 ? P.mix(a, b, t * 2) : P.mix(b, c, (t - 0.5) * 2);
}
// star flecks on the membranes: a jittered grid in space, one star in a few cells
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
export function star(x, y, z) {
  const cs = 0.055, ix = Math.floor(x / cs), iy = Math.floor(y / cs), iz = Math.floor(z / cs);
  let best = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
    const h = hash(ix + a, iy + b, iz + d);
    if (h < 0.8) continue;
    const cx = (ix + a + hash(ix + a, iy + b + 7, iz + d)) * cs, cy = (iy + b + hash(ix + a + 3, iy + b, iz + d)) * cs, cz = (iz + d + hash(ix + a, iy + b, iz + d + 5)) * cs;
    best = Math.max(best, P.ss(0.016, 0.006, Math.hypot(x - cx, y - cy, z - cz)));
  }
  return best;
}

export default {
  ...shadeBat,
  name: 'bat_star',
  id: 'sculpt_bat_star',
  dropNodes: ['Eyes'],
  glowColor: [1.0, 0.78, 0.35],
  headView: [[-0.0215, 0.82, 0.33], 0.75],
  notes: 'Clip use: idle=Bat_Flying, move=Bat_Flying, attack=Bat_Attack, death=Bat_Death. Sculpted star-pecking bat on the mon_bat skeleton (joints, IBMs, clips unchanged; form from shade_bat.mjs). Vertex colours; TEXCOORD_0.x = glow of the amber eyes and the gold star flecks.',
  build(ctx) {
    const bat = shadeBat.build(ctx);
    const { S } = ctx;
    for (const [name, rn] of Object.entries(PART_RAMP)) {
      const p = S.part(name), orig = p.paint;
      if (!orig) continue;
      p.paint = (c) => {
        const L = Math.min(1, lum(orig(c)) / 0.85);
        let col = ramp(rn, L);
        if (rn === 'membrane') col = P.mix(col, P.color('#ffe6a0'), star(c.x, c.y, c.z));
        return col;
      };
    }
    return bat;
  },
};

/** beast_kit post: the amber eyes and the gold stars glow */
export function glow(s) {
  const gold = s[0] > 0.8 && s[1] > 0.6 && s[2] < 0.75 && s[0] - s[2] > 0.2 ? 1 : 0;
  const amber = s[0] > 0.6 && s[1] > 0.35 && s[1] < 0.62 && s[2] < 0.25 ? 1 : 0;
  return Math.max(gold * 0.9, amber * 0.6);
}
