// Way shrine (wayShrine, src/world/builders/landmarks.js): the five little roadside shrines on the country roads. Replaces
// the box pillar + box head + extruded gable of the first map round; same footprint (collider 1.0 x 0.9 m), about the
// same height (ridge 2.8 m over the ground).
// INTENT
//  silhouette: a slim carved post on a stepped foot carrying a broader head with a round-arched niche, under a steep
//    little roof of stone slates whose eaves and verges stand well out; a thin iron finial on the ridge.
//  big forms: the rough foot stone and the moulded plinth; the stop-chamfered shaft; the corbelled head; the slate roof.
//  eye rests on: the niche (a small hooded figure, two candle stubs, a jar of field flowers on the worn sill), the
//    ragged lower edges of the slates, the carved rosette on the shaft.
//  wear: rain from the west (-X): lichen crusts and streaks there, moss in the joints and on the north slates; the sill
//    and the front of the plinth rubbed pale by hands; candle soot inside the niche; one corner of the foot knocked off.
//  not: a box with a lid, symmetric weathering, evenly detailed, toy-new.
// Coordinates: metres, origin = ground level at the footprint centre (the foot stone goes 0.15 m into the ground),
// +Y up, +Z = front (the road side).
import * as P from '../sdf.mjs';
import { hex, mix, ss, clamp, fbm, cell, chamferPost, moulding, archOutline, slateSlope, paintStone, paintSlate, paintIron } from './lm_kit.mjs';
import { field } from './landmarks_lib.mjs';

const F = field();            // 0 = full detail, 1 = simpler field for the far LODs
const LIME = ['#e0d2b1', '#c9b995'];
// key heights
const PL0 = 0.15, PL1 = 0.41, SH0 = 0.45, SH1 = 1.43, HD0 = 1.55, HD1 = 2.22, CR1 = 2.28, RISE = 0.46, RIDGE = CR1 + RISE;
const NICHE = { w: 0.46, y0: 1.67, ys: 1.9, z: 0.41, depth: 0.3 };

export default {
  name: 'lm_shrine', id: 'sculpt_lm_shrine',
  voxel: 0.007,
  fieldVoxel: [0.007, 0.011],
  lodField: [0, 1, 1],
  vcAll: true,
  lods: [7000, 2200, 700],
  ground: 0,
  aoRange: 0.3,
  aoStrength: 0.55,
  cavityDark: 0.35,
  cavity: [0.008, 0.04],
  creaseAngle: 42,
  bandSlack: 0.04,
  quickVoxel: 1.6,
  closeSheet: [[25, 3.5, 1.6, 1.6], [200, 3.5, 1.6, 1.6], [110, 4.5, 1.7, 1.4], [330, 2.6, 1.9, 1.9]],
  materials: {
    stone: { name: 'Limestone', surface: 'stone' },
    slate: { name: 'Slate', surface: 'tile' },
    offer: { name: 'Offering', surface: 'paint' },
    iron: { name: 'Iron', surface: 'metal' },
  },
  gameMats: { stone: 'Limestone', slate: 'Slate', offer: 'Offering', iron: 'Iron' },
  notes: 'Sculpted way shrine (landmarks wayShrine). Vertex colours on every LOD, no textures. Materials Limestone / Slate / Offering / Iron merge into the carved-stone, cream and iron families of the landmark site.',

  build({ S }) {
    // parts in a fixed order (both fields register the same ids)
    S.part('stone', { mat: 'stone', paint: (c) => paintStone(c, LIME, { foot: 0.05 }) });
    S.part('foot', { mat: 'stone', paint: (c) => paintStone(c, ['#c9c0a7', '#a99f86'], { moss: 1, lichen: 0.5, foot: 0.05 }) });
    S.part('worn', { mat: 'stone', paint: paintWorn });
    S.part('plinth', { mat: 'stone', paint: paintPlinth });
    S.part('niche', { mat: 'stone', paint: paintNiche });
    S.part('chip', { mat: 'stone', paint: (c) => mix(hex('#e2dac6'), hex('#c9bfa6'), c.cavity) });
    S.part('slate', { mat: 'slate', paint: (c) => paintSlate(c) });
    S.part('ridge', { mat: 'slate', paint: (c) => paintSlate(c, { light: '#b0afa8', dark: '#94958f' }) });
    S.part('figure', { mat: 'offer', paint: paintFigure });
    S.part('wax', { mat: 'offer', paint: paintWax });
    S.part('jar', { mat: 'offer', paint: (c) => mix(mix(hex('#c27b52'), hex('#e0a47a'), c.edge * 0.6), hex('#6e4a33'), c.cavity * 0.6) });
    S.part('flower', { mat: 'offer', paint: paintFlower });
    S.part('iron', { mat: 'iron', paint: paintIron });
    const part = (n) => (s) => s.part(n);

    // ---------------------------------------------------------------- foot stone: rough, wider, sunk, one corner off
    let foot = P.roundBox([1.0, 0.3, 0.88], 0.035).at(0, 0, 0).part('foot');
    if (!F) {
      foot = foot.chisel({ count: 9, depth: 0.012, radius: 0.16, seed: 3, where: (x, y, z) => (y > 0.05 ? 1 : 0) })
        .chip({ at: [-0.5, 0.15, 0.44], dir: [-1, 0.6, 1], depth: 0.07, spread: 0.6, seed: 4, paint: 'chip' })
        .rough({ type: 'fbm', scale: 0.12, amp: 0.004, seed: 5 });
    }
    // ---------------------------------------------------------------- plinth with a sloped wash up to the shaft
    let plinth = chamferPost([0.82, PL1 - PL0, 0.72], { c: 0.03, r: 0.008 }).at(0, PL0, 0);
    const wash = moulding(0.56, 0.46, [[0.13, PL1 - 0.01], [0.13, PL1 + 0.012], [0.03, SH0 + 0.02], [0, SH0 + 0.03]]);
    plinth = plinth.add(wash).part('plinth');
    if (!F) plinth = plinth.wear(0.006, { seed: 6 });

    // ---------------------------------------------------------------- shaft: stop-chamfered post, carved rosette in front
    let shaft = chamferPost([0.56, SH1 - SH0, 0.46], { c: 0.055, r: 0.006, stop: [0.0, SH1 - SH0, 0.07] }).at(0, SH0, 0).part('stone');
    if (!F) {
      const ry = 0.98, rz = 0.23;
      // sunk roundel, six raised petals and a boss
      shaft = shaft.cut(P.cylinder(0.12, 0.05).turn(90, 0, 0).at(0, ry, rz - 0.015));
      const petal = P.ellipsoid([0.026, 0.06, 0.016]).at(0, 0.055, 0);
      let ros = P.sphere(0.022).scale([1, 1, 0.7]);
      for (let i = 0; i < 6; i++) ros = ros.add(petal.turn(0, 0, i * 60));
      shaft = shaft.add(ros.at(0, ry, rz - 0.008).part('stone'));
      shaft = shaft.crack([[0.2, 0.62, 0.231], [0.16, 0.7, 0.232], [0.18, 0.79, 0.232], [0.13, 0.86, 0.232]], { width: 0.006, jag: 0.008, seed: 7 });
      shaft = shaft.rough({ type: 'fbm', scale: 0.08, amp: 0.002, seed: 8 });
    }
    // ---------------------------------------------------------------- collar: a splayed corbel out to the head
    const collar = moulding(0.56, 0.46, [[0, SH1 - 0.03], [0.025, SH1 - 0.005], [0.025, SH1 + 0.025], [0.16, HD0 - 0.015], [0.18, HD0 + 0.005]]).part('stone');

    // ---------------------------------------------------------------- head with the arched niche
    let head = chamferPost([0.92, HD1 - HD0, 0.82], { c: 0.025, r: 0.008 }).at(0, HD0, 0).part('stone');
    // archivolt: a raised band round the arch on the front face
    const band = P.extrude(archOutline(0.64, NICHE.y0 - 0.02, NICHE.ys, 22), 0.05).at(0, 0, NICHE.z).part('stone');
    head = head.add(band);
    const hole = P.extrude(archOutline(NICHE.w, NICHE.y0, NICHE.ys, 22), NICHE.depth * 2 + 0.1, { round: 0.01 }).at(0, 0, NICHE.z + 0.05);
    head = head.cut(hole.part('niche'), { paintCut: true });
    // the sill: a moulded ledge standing out under the niche, worn hollow in the middle
    let sill = P.roundBox([0.66, 0.055, 0.15], 0.014).at(0, NICHE.y0 - 0.026, NICHE.z + 0.02).part('worn');
    if (!F) sill = sill.cut(P.ellipsoid([0.2, 0.03, 0.06]).at(0, NICHE.y0 + 0.012, NICHE.z + 0.06));
    if (!F) head = head.wear(0.005, { seed: 9 }).rough({ type: 'fbm', scale: 0.1, amp: 0.002, seed: 10 });
    // cornice under the roof
    const cornice = moulding(0.92, 0.82, [[0, HD1 - 0.01], [0.03, HD1 + 0.015], [0.065, CR1 - 0.02], [0.065, CR1]]).part('stone');

    // ---------------------------------------------------------------- roof: gable core, stone slates, ridge, finial
    const ZW = 0.47, XL = 0.49;
    const core = P.extrude([[-ZW, 0], [ZW, 0], [0, RISE]], XL * 2).turn(0, 90, 0).at(0, CR1, 0).part('stone');
    let roof;
    if (!F) {
      roof = slateSlope({ yr: RIDGE, ze: ZW, rise: RISE, hl: XL, over: 0.07, course: 0.1, sw: 0.15, t: 0.024, seed: 2, eaveOut: 0.13 })
        .mirror('z').part('slate');
    } else {
      // far field: whole courses without the single slates, so the stepped eave line survives the simplifier
      roof = slateSlope({ yr: RIDGE, ze: ZW, rise: RISE, hl: XL, over: 0.07, course: 0.13, sw: 3, t: 0.034, seed: 2, eaveOut: 0.13 })
        .mirror('z').part('slate');
    }
    // ridge: half-round ridge stones with joints
    let ridge = P.capsule([-XL - 0.06, 0, 0], [XL + 0.06, 0, 0], 0.045).scale([1, 0.85, 1]).at(0, RIDGE + 0.02, 0);
    if (!F) for (const jx of [-0.28, 0.02, 0.3]) ridge = ridge.cut(P.box([0.008, 0.2, 0.2]).at(jx, RIDGE + 0.02, 0));
    ridge = ridge.part('ridge');
    // iron finial: a rod, a ring with four short rays
    let fin = P.capsule([0, RIDGE + 0.04, 0], [0, RIDGE + 0.26, 0], 0.012);
    fin = fin.add(P.torus(0.055, 0.011).turn(90, 0, 0).at(0, RIDGE + 0.2, 0));
    if (!F) for (const az of [-90, 0, 90]) fin = fin.add(P.capsule([0, 0.075, 0], [0, 0.115, 0], 0.009).turn(0, 0, az).at(0, RIDGE + 0.2, 0));
    fin = fin.part('iron');

    // ---------------------------------------------------------------- the niche: figure, candles, jar of flowers
    const sy = NICHE.y0;
    const extras = [];
    // hooded figure (no face: a veil drawn forward), on a small round pedestal
    {
      const fz = 0.25;
      let fig = P.lathe([[0, 0], [0.075, 0], [0.072, 0.03], [0.06, 0.1], [0.052, 0.2], [0.045, 0.25], [0.03, 0.27], [0, 0.27]], { smooth: 0.008 });
      if (!F) fig = fig.strata({ spacing: 0.022, depth: 0.004, width: 0.008, wobble: 0.01, axis: 'x', seed: 12 });
      fig = fig.add(P.ellipsoid([0.048, 0.06, 0.05]).at(0, 0.3, -0.006));               // hooded head
      fig = fig.add(P.ellipsoid([0.035, 0.03, 0.03]).at(0, 0.2, 0.045));                 // folded hands
      fig = fig.add(P.cylinder(0.085, 0.03).at(0, -0.03, 0));                            // pedestal
      extras.push(fig.at(0, sy + 0.03, fz).part('figure'));
    }
    if (!F) {
      // candle stubs with drips and wax pools
      for (const [cx, h] of [[-0.16, 0.085], [0.17, 0.055]]) {
        let cd = P.cylinder(0.019, h).at(cx, sy, 0.43);
        cd = cd.add(P.ellipsoid([0.034, 0.008, 0.03]).at(cx, sy + 0.003, 0.43));
        cd = cd.add(P.ellipsoid([0.007, 0.018, 0.007]).at(cx + 0.017, sy + h * 0.55, 0.435));
        cd = cd.cut(P.cylinder(0.011, 0.02).at(cx, sy + h - 0.006, 0.43));
        cd = cd.add(P.capsule([cx, sy + h - 0.01, 0.43], [cx, sy + h + 0.012, 0.43], 0.0045));
        extras.push(cd.part('wax'));
      }
      // a little clay jar with field flowers
      const jx = 0.07, jz = 0.44;
      extras.push(P.lathe([[0, 0], [0.028, 0], [0.036, 0.03], [0.03, 0.06], [0.024, 0.07], [0.028, 0.078], [0, 0.078]], { smooth: 0.004 }).at(jx, sy, jz).part('jar'));
      const rnd = S.prng(17);
      let fl = null;
      for (let i = 0; i < 7; i++) {
        const a = rnd() * 6.28, r = 0.02 + rnd() * 0.03, h = 0.1 + rnd() * 0.05;
        const b = P.sphere(0.014 + rnd() * 0.006).at(jx + Math.sin(a) * r, sy + h, jz + Math.cos(a) * r * 0.8);
        fl = fl ? fl.add(b) : b;
      }
      fl = fl.add(P.ellipsoid([0.035, 0.03, 0.03]).at(jx, sy + 0.085, jz));
      extras.push(fl.part('flower'));
      // a bunch of wildflowers laid on the plinth wash, three offering pebbles
      // (on the sloped wash: its surface is at y 0.422 at z 0.36 rising to 0.47 at z 0.26)
      const washY = (z) => 0.422 + (0.36 - z) * 0.48;
      let bunch = P.capsule([-0.15, washY(0.32) + 0.012, 0.32], [0.04, washY(0.31) + 0.012, 0.31], 0.015);
      for (let i = 0; i < 6; i++) { const z = 0.3 + rnd() * 0.04; bunch = bunch.add(P.sphere(0.017).at(-0.17 - rnd() * 0.05, washY(z) + 0.016 + rnd() * 0.02, z)); }
      extras.push(bunch.part('flower'));
      for (const [px, pz] of [[0.17, 0.33], [0.22, 0.34], [0.19, 0.31]]) extras.push(P.ellipsoid([0.024, 0.016, 0.02]).at(px, washY(pz) + 0.008, pz).part('chip'));
    }

    let all = S.union(foot, plinth, shaft, collar, head, sill, cornice, core, roof, ridge, fin, ...extras);
    return all;
  },
};

function paintPlinth(c) {
  // the front of the plinth and wash rubbed pale where people kneel and lay flowers
  const col = paintStone(c, LIME, { foot: 0.05 });
  const rub = ss(0.25, 0.4, c.z) * ss(0.36, 0.2, Math.abs(c.x)) * ss(PL0 + 0.1, PL1, c.y) * clamp(c.nz + c.ny, 0, 1);
  return mix(col, hex('#e7dfca'), rub * 0.5);
}
function paintWorn(c) {
  // hands and knees: pale, smooth, a little warm
  return mix(paintStone(c, LIME, { lichen: 0.2, moss: 0.2, foot: 0.05 }), hex('#e7dfca'), 0.45);
}
function paintNiche(c) {
  const { y, z, cavity } = c;
  let col = mix(hex('#cfc5ad'), hex('#bdb39b'), 0.5 + 0.5 * fbm(c.x * 8, y * 8, z * 8, 51, 2));
  // candle soot rising up the back and into the vault
  col = mix(col, hex('#5a5048'), ss(1.9, 2.12, y) * 0.35);
  return mix(col, hex('#6c6656'), cavity * 0.5);
}
function paintFigure(c) {
  const { x, y, z, ny, cavity, edge } = c;
  let col = mix(hex('#efe8d6'), hex('#ddd3bc'), 0.5 + 0.5 * fbm(x * 30, y * 30, z * 30, 61, 2));
  // faded blue on the mantle and hood (flaking)
  const mantle = ss(1.79, 1.84, y) * ss(0.1, 0.6, fbm(x * 40, y * 40, z * 40, 62, 2) + 0.5);
  col = mix(col, hex('#a6b9cc'), mantle * 0.55);
  col = mix(col, hex('#8a8170'), clamp(cavity * 1.3, 0, 1) * 0.6);
  return mix(col, hex('#fbf6ea'), edge * 0.4);
}
function paintWax(c) {
  const { y, cavity, edge } = c;
  const top = ss(NICHE.y0 + 0.05, NICHE.y0 + 0.09, y);
  let col = mix(hex('#f1e7cc'), hex('#fff7e2'), edge * 0.5);
  col = mix(col, hex('#3a2e26'), top * ss(0.4, 0.9, cavity + 0.4) * 0.8);
  return col;
}
function paintFlower(c) {
  const { x, y, z, ny, cavity } = c;
  const k = cell(x * 40, y * 40, z * 40, 71);
  const id = fbm(Math.floor(x * 50), Math.floor(y * 50), Math.floor(z * 50), 72, 1);
  let col = id > 0.15 ? hex('#d24a3e') : id > -0.2 ? hex('#ecc94c') : hex('#f2eee4');
  if (y < NICHE.y0 + 0.08 && y > PL1 + 0.06) col = hex('#5f7f3c');
  if (y < PL1 + 0.05 && Math.abs(x + 0.05) < 0.11) col = mix(hex('#5f7f3c'), hex('#7b9a4a'), k);   // stalks of the bunch
  return mix(col, hex('#3e4a2a'), cavity * 0.5);
}
