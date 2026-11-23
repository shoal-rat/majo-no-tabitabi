// The countryside rock family (round "art-stone", 2026-11-24): six stones built from exact planes with the facet kit
// (rock_facet.mjs). Every one: big crisp planes with bevelled edges that catch the light, bedding steps and joints cut as
// real geometry (separate pieces), moss as a separate soft cushion. Vertex colour only, three LODs.
//
//   node tools/sculpt/assets/rock_family.mjs [name ...]      -> assets/models/sculpt/rock_<name>.glb + .manifest.json,
//                                                               sheets in .tmp/sculpt/rock_family/
//
// Shapes (origin = foot centre, +Y up, about 1 m; the game fits each into its species' box):
//   rock_field    a field boulder: broad weathered crown, one shoulder cracked off by frost, moss on the damp north top
//   rock_split    a boulder split in two by a frost joint, the halves leaning apart; moss on the taller half
//   rock_ledge    a bedded block: three beds dipping east, each stepped back (ledges), a joint through the crest
//   rock_shelf    a low wide slab of two thick beds, the top one cracked across; a broad moss mat
//   rock_crag     a tall crag of jointed columns with bedding steps; moss and a grass cushion on the crown
//   rock_cobble   two or three small angular stones lying together with moss between (ground clutter)
// LODs: 0 = every edge bevelled + corner facets + fine moss; 1 = only the strong edges bevelled, coarse moss; 2 = sharp
// planes, a moss fan.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, prng, plane, planeD, norm, add, mul, dot, ss, hex, bevelPiece, emitPiece, mossCap, stonePaint, hullPlanes, insetPlanes,
  FLOOR, Mesh, xform, writeGLB, writeFragment, previewSheet,
} from './rock_facet.mjs';

export const PARTS = {
  stone: { name: 'Rock', surface: 'rock', look: { rim: 0.22, wrap: 0.3 } },
  moss: { name: 'Moss', surface: 'none', look: { rim: 0.3, wrap: 0.5 } },
};

/** bevel widths per LOD: crown (weathered top edges), edge (the rest), crack (joint lips) */
function widths(lod, H, { crown = 0.05, edge = 0.024, crack = 0.012, crownY = 0.55 } = {}) {
  return (e) => {
    if (e.ka === 'floor' || e.kb === 'floor') return 0;
    if (lod >= 2) return 0;
    const isCrack = e.ka === 'crack' || e.kb === 'crack';
    if (lod === 1 && (e.angle < 0.55 || isCrack)) return 0;
    if (e.corner) return lod === 0 ? edge * 0.8 : 0;
    if (isCrack) return crack;
    const up = Math.min(e.na[1], e.nb[1]) > -0.15 && Math.max(e.na[1], e.nb[1]) > 0.35;
    const k = up ? ss(crownY * H - 0.1, crownY * H + 0.1, e.mid[1]) : 0;
    return (edge + (crown - edge) * k) * (lod === 1 ? 1.2 : 1);
  };
}
const MOSS = (lod) => (lod === 0 ? { rings: 4, segs: 14 } : lod === 1 ? { rings: 2, segs: 10 } : { rings: 1, segs: 7 });
const pieceOpts = (lod) => ({ corners: lod === 0, minAngle: lod === 0 ? 0.2 : 0.3 });

/** a V joint: piece A keeps n.x <= c - g0 - k*y, piece B keeps n.x >= c + g0 + k*y (the gap opens upward) */
function joint(n, c, { g0 = -0.01, k = 0.05 } = {}) {
  const u = norm(n);
  return {
    a: planeD(add(u, [0, k, 0]), c - g0, 'crack'),
    b: planeD(add(mul(u, -1), [0, k, 0]), -(c + g0), 'crack'),
  };
}

/** a ring of side planes: azimuths (deg), each [az, dist, ny (outward lean), atY] -> planes through (dir * dist, atY) */
const ring = (list, kind = 'face') => list.map(([az, dist, ny = 0.05, y = 0]) => { const a = az * Math.PI / 180, n = norm([Math.sin(a), ny, Math.cos(a)]); return plane(n, [Math.sin(a) * dist, y, Math.cos(a) * dist], kind); });

// ---------------------------------------------------------------------------------------------------------- shapes
const SHAPES = {
  // a field boulder: h/w ~0.8 (the species boxes the game fits it into). Hand-set planes: six unequal sides that lean in,
  // a hipped crown (four planes ~40 deg off the top) on a tilted top face, a tucked foot; a frost joint takes off the
  // south-east shoulder
  field(lod) {
    const H = 0.82;
    const env = [
      ...ring([[8, 0.5, 0.1], [62, 0.46, 0.16], [118, 0.52, 0.04], [176, 0.47, 0.12], [232, 0.5, 0.08], [298, 0.44, 0.14]]),
      ...ring([[30, 0.5, 0.95, 0.42], [118, 0.46, 0.8, 0.48], [205, 0.42, 1.05, 0.5], [290, 0.38, 0.9, 0.52]]),   // hipped crown
      plane([0.14, 1, -0.1], [0, H, 0]),                        // the broad top
      ...ring([[90, 0.5, -0.35, 0.05], [250, 0.5, -0.3, 0.04]]), // tucked foot
      FLOOR(),
    ];
    const j = joint([0.7, 0.05, 0.71], 0.27, { g0: -0.03, k: 0.07 });
    const mesh = new Mesh(), paint = stonePaint({ H, seed: 3, warm: 0.4 }), W = widths(lod, H, { crown: 0.055, crownY: 0.5 });
    const A = bevelPiece([...env, j.a], W, pieceOpts(lod)), B = bevelPiece([...env, j.b], W, pieceOpts(lod));
    emitPiece(mesh, A, paint); emitPiece(mesh, B, paint);
    mossCap(mesh, [A.planes, B.planes], { at: [-0.06, -0.14], R: 0.27, T: 0.04, seed: 7, ...MOSS(lod) });
    return mesh;
  },
  // a boulder split in two, halves leaning apart
  split(lod) {
    const rnd = prng(202), H = 0.84;
    const env = [...hullPlanes(rnd, { size: [0.5, 0.48, 0.46], c: [0, 0.34, 0], count: 12, cut: [0.82, 1], tilt: 0.45 }), plane([-0.1, 1, 0.08], [0, H, 0]), FLOOR()];
    const n = norm([0.95, 0, 0.3]);
    const mesh = new Mesh(), paint = stonePaint({ H, seed: 5, warm: 0.3 }), W = widths(lod, H, { crown: 0.045 });
    const A = bevelPiece([...env, planeD(n, -0.035, 'crack')], W, pieceOpts(lod));
    const B = bevelPiece([...env, planeD(mul(n, -1), -0.035, 'crack')], W, pieceOpts(lod));
    // lean the halves apart about their feet (small turns, so the foot stays on the ground)
    const lean = (s) => xform({ at: [n[0] * s * 0.012, 0, n[2] * s * 0.012], roll: -s * 0.05 * n[0], pitch: s * 0.05 * n[2] });
    const ma = new Mesh(), mb = new Mesh();
    emitPiece(ma, A, paint); emitPiece(mb, B, paint);
    mossCap(ma, [A.planes], { at: [-0.16, -0.06], R: 0.22, T: 0.032, seed: 11, ...MOSS(lod) });
    mesh.append(ma, lean(-1)).append(mb, lean(1));
    return mesh;
  },
  // a cuesta block: beds dipping 22 deg east. West: a steep scarp where every bed ends in a ledge (each one stepped
  // back more than the one below, unequal thickness); east: the long dip slope (the top of the hard top bed); a joint
  // through the two upper beds breaks the crest into two teeth
  ledge(lod) {
    const dip = 22 * Math.PI / 180, nb = [Math.sin(dip), Math.cos(dip), 0], H = 1.0;
    const sides = [
      plane([0.06, 0.12, 1], [0, 0, 0.4]), plane([-0.04, 0.1, -1], [0, 0, -0.38]),
      plane([0.55, 0.15, 0.8], [0.4, 0, 0.3]), plane([0.6, 0.18, -0.78], [0.42, 0, -0.27]),
      plane([-0.62, 0.12, 0.75], [-0.42, 0, 0.3]), plane([-0.7, 0.1, -0.7], [-0.42, 0, -0.28]),
      plane([1, 0.55, 0.05], [0.6, 0, 0]),                     // east toe
    ];
    const scarp = (inset) => plane([-1, 0.14, 0.06], [-0.52 + inset, 0, 0]);
    // [u0, u1, scarp inset, flank inset]: thick hard beds with one thin soft parting
    const beds = [[-1, 0.3, 0, 0], [0.3, 0.42, 0.05, 0.02], [0.42, 0.66, 0.07, 0.012], [0.66, 0.79, 0.14, 0.03]];
    const mesh = new Mesh(), W = widths(lod, H, { crown: 0.04, edge: 0.022, crownY: 0.6 });
    const paint = stonePaint({ H, seed: 9, warm: 0.35, bands: (p) => dot(p, nb) / 0.25 });
    const all = [];
    const j = joint([0.2, 0.08, 1], 0.05, { g0: -0.08, k: 0.11 });
    beds.forEach(([u0, u1, si, fi], i) => {
      const pl = [...insetPlanes(sides, (p) => (p.n[0] > 0.9 ? 0 : fi)), scarp(si), FLOOR(), planeD(nb, u1, 'bed')];
      if (u0 > -1) pl.push(planeD(mul(nb, -1), -u0 + 0.004, 'bed'));
      if (i >= 2) {
        const a = bevelPiece([...pl, j.a], W, pieceOpts(lod)), b = bevelPiece([...pl, j.b], W, pieceOpts(lod));
        emitPiece(mesh, a, paint); emitPiece(mesh, b, paint); all.push(a.planes, b.planes);
      } else { const a = bevelPiece(pl, W, pieceOpts(lod)); emitPiece(mesh, a, paint); all.push(a.planes); }
    });
    // moss on the dip slope's damp north half and in the soft parting's ledge on the scarp
    mossCap(mesh, all, { at: [0.12, -0.16], R: 0.24, T: 0.035, seed: 13, maxSlope: 0.8, ...MOSS(lod) });
    if (lod < 2) mossCap(mesh, all, { at: [-0.42, -0.08], R: 0.11, T: 0.025, seed: 17, wobble: 0.4, ...MOSS(lod + 1) });
    return mesh;
  },
  // a low wide slab: two thick beds, the top one cracked across; a broad moss mat
  shelf(lod) {
    const rnd = prng(404), H = 0.5;
    const env = [...hullPlanes(rnd, { size: [0.62, 0.36, 0.55], c: [0, 0.16, 0], count: 9, cut: [0.86, 1], tilt: 0.3 }), FLOOR()];
    const nb = norm([0.05, 1, 0.08]);
    const mesh = new Mesh(), paint = stonePaint({ H, seed: 15, warm: 0.3 }), W = widths(lod, H, { crown: 0.045, edge: 0.022, crownY: 0.6 });
    const low = bevelPiece([...env, planeD(nb, 0.24, 'bed')], W, pieceOpts(lod));
    const topPl = [...insetPlanes(env.filter((p) => p.kind !== 'floor'), () => 0.035), FLOOR(), planeD(mul(nb, -1), -0.236, 'bed'), plane([0.12, 1, -0.05], [0, H, 0])];
    const j = joint([0.35, 0, 1], 0.02, { g0: -0.24, k: 0.5 });
    const a = bevelPiece([...topPl, j.a], W, pieceOpts(lod)), b = bevelPiece([...topPl, j.b], W, pieceOpts(lod));
    emitPiece(mesh, low, paint); emitPiece(mesh, a, paint); emitPiece(mesh, b, paint);
    mossCap(mesh, [low.planes, a.planes, b.planes], { at: [0.08, -0.2], R: 0.3, T: 0.035, seed: 19, ...MOSS(lod) });
    return mesh;
  },
  // a tall crag: one mass split by two vertical joints into three columns of different heights, each with a bedding
  // step a little over half way (the upper drum stepped back) and a tilted cap; moss on the caps. h/w ~1.35
  crag(lod) {
    const H = 1.36;
    const env = ring([[0, 0.38, 0.06], [58, 0.42, 0.08], [116, 0.4, 0.05], [180, 0.36, 0.07], [238, 0.44, 0.06], [300, 0.4, 0.09]]);
    const mesh = new Mesh(), paint = stonePaint({ H, seed: 21, warm: 0.3 }), W = widths(lod, H, { crown: 0.05, edge: 0.024, crownY: 0.7 });
    const jn = [norm([1, 0, 0.18]), norm([1, 0, -0.12])], jc = [-0.12, 0.16], gap = 0.012;
    const cols = [
      { lo: null, hi: 0, h: 1.08, cap: [-0.3, 1, 0.1], step: 0.6 },
      { lo: 0, hi: 1, h: 1.36, cap: [0.12, 1, -0.22], step: 0.78 },
      { lo: 1, hi: null, h: 0.9, cap: [0.38, 1, 0.12], step: 0.48 },
    ];
    const all = [];
    cols.forEach((c, i) => {
      const cut = [];
      if (c.lo !== null) cut.push(planeD(mul(jn[c.lo], -1), -(jc[c.lo] + gap), 'crack'));
      if (c.hi !== null) cut.push(planeD(jn[c.hi], jc[c.hi] - gap, 'crack'));
      const capN = norm(c.cap), cx = c.lo === null ? -0.3 : c.hi === null ? 0.3 : 0.02;
      const low = [...env, ...cut, FLOOR(), planeD([0, 1, 0], c.step, 'bed')];
      const hi = [...insetPlanes(env, () => 0.025 + 0.01 * i), ...cut, planeD([0, -1, 0], -c.step + 0.004, 'bed'), plane(capN, [cx, c.h, 0])];
      const a = bevelPiece(low, W, pieceOpts(lod)), b = bevelPiece(hi, W, pieceOpts(lod));
      emitPiece(mesh, a, paint); emitPiece(mesh, b, paint); all.push(a.planes, b.planes);
    });
    mossCap(mesh, all, { at: [-0.28, 0.02], R: 0.14, T: 0.035, seed: 23, ...MOSS(lod) });
    mossCap(mesh, all, { at: [0.02, -0.05], R: 0.15, T: 0.035, seed: 29, ...MOSS(lod) });
    if (lod < 2) mossCap(mesh, all, { at: [0.32, 0.04], R: 0.12, T: 0.03, seed: 31, ...MOSS(lod + 1) });
    return mesh;
  },
  // two or three small angular stones lying together, moss between: ground clutter, h/w ~0.8
  cobble(lod) {
    const mesh = new Mesh(), all = [];
    const stones = [
      { c: [-0.14, 0, 0.02], s: [0.3, 0.36, 0.28], seed: 41 },
      { c: [0.22, 0, -0.08], s: [0.24, 0.26, 0.22], seed: 42 },
      { c: [0.06, 0, 0.24], s: [0.18, 0.16, 0.17], seed: 43 },
    ];
    for (const st of stones) {
      const r = prng(st.seed), H = st.s[1] * 1.6;
      const pl = [...hullPlanes(r, { size: st.s, c: [st.c[0], st.s[1] * 0.6, st.c[2]], count: 9, cut: [0.8, 1], tilt: 0.5 }), plane([(r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4], [st.c[0], H, st.c[2]]), FLOOR()];
      const p = bevelPiece(pl, widths(lod, H, { crown: 0.04, edge: 0.022 }), pieceOpts(lod));
      emitPiece(mesh, p, stonePaint({ H, seed: st.seed, warm: 0.4 })); all.push(p.planes);
    }
    mossCap(mesh, all, { at: [0.04, 0.06], R: 0.2, T: 0.03, seed: 47, maxSlope: 1.6, ...MOSS(lod) });
    return mesh;
  },
};

export const NAMES = Object.keys(SHAPES);
/** the three LOD meshes of a shape */
export const buildShape = (name) => [0, 1, 2].map((l) => SHAPES[name](l));

async function main(names) {
  const out = path.join(ROOT, '.tmp/sculpt/rock_family');
  const items = [];
  for (const nm of names) {
    const lods = buildShape(nm), name = 'rock_' + nm;
    const res = await writeGLB(path.join(ROOT, 'assets/models/sculpt', name + '.glb'), name, lods, PARTS, { family: 'rock_family', shape: nm });
    const b = lods[0].bounds();
    writeFragment(name, {
      size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]], tris: res.tris, parts: PARTS, source: 'tools/sculpt/assets/rock_family.mjs (facet kit, rock_facet.mjs)',
      notes: `Facet rock (${nm}): exact planes with bevelled edges, beds / joints as geometry, moss cushion as its own primitive (Moss_none). Vertex colour only (COLOR_0 linear rgb, neutral stone ~#9b9b9b; moss its own green). LOD tris ${res.tris.join(' / ')}. Origin = foot centre, ~1 m unit; the game fits it into the species box (flora/procgen.js facetRock).`,
    });
    console.log(name.padEnd(12), 'tris', res.tris.join(' / '), ' ', res.kb, 'KB');
    items.push({ mesh: lods[0], az: 30, label: nm + ' L0 ' + res.tris[0] }, { mesh: lods[0], az: 210, el: 30, label: 'back' }, { mesh: lods[1], az: 30, label: 'L1 ' + res.tris[1], wire: true }, { mesh: lods[2], az: 30, label: 'L2 ' + res.tris[2] });
  }
  await previewSheet(path.join(out, 'sheet.png'), 'ROCK FAMILY - FACET KIT', items);
  console.log('sheet .tmp/sculpt/rock_family/sheet.png');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  main(a.length ? a : NAMES).catch((e) => { console.error(e); process.exit(1); });
}
