// The marker steles of the six page trials (gameplay/wilds-pages.js buildMarker): one per element, carved by the old
// travelling witch who left the pages. Replaces the box slab + box foot + box cap + torus / octahedron glow.
// INTENT
//  silhouette: a slightly tapering slab with a segmental arched head under a small gabled capstone, on a rough, wider
//    foot stone half sunk in the grass; leaning a hair, one top corner knocked off.
//  big forms: the foot stone / the slab / the capstone.
//  the eye rests on: the raised roundel on the face with the element's sigil standing out of it, lit from within (the
//    Glow part: the game's glowing sigil material), three rows of worn carved letters under it, a small star over it.
//  wear: rain from the west (local -X): lichen crusts and streaks there; moss on the foot's back and in the capstone's lee;
//    the face's edges rounded, the knocked-off corner paler.
//  must NOT look like: a gravestone, a box, a modern sign.
// Coordinates: metres, origin = ground at the foot's centre (the foot goes 0.14 m into the ground), +Z = the carved face
// (the game turns it to the mechanism). Old footprint 1.25 x 0.56 m, height 2.33 m, sigil centre (0, 1.45, 0.17): kept.
//
//   node tools/sculpt/assets/stele_page.mjs [wind thunder fire earth water ice]   -> assets/models/sculpt/stele_<el>.glb
import {
  THREE, prng, fbm, plane, planeD, norm, ss, Mesh, mossCap, piece, boxPlanes, addGeo, extrude, ring2, poly2, mat4,
  carvedStone, col, mixc, writeAsset, sheet,
  setLod,
} from './mech_lib.mjs';

const FACE = 0.16;                 // the slab's front face (z); back face at -FACE
const SIG = [0, 1.45];             // sigil centre (x, y) on the face
const ELS = ['wind', 'thunder', 'fire', 'earth', 'water', 'ice'];
const SEED = { wind: 11, thunder: 23, fire: 37, earth: 41, water: 53, ice: 67 };

// ------------------------------------------------------------------------------------------------------------ sigils
// each in XY about (0, 0), about 0.42 m across
function sigil(el) {
  const S = new THREE.Shape();
  if (el === 'fire') {
    // three tongues: a tall middle one, a right one, a lower left one, over a round belly; a teardrop hollow low inside
    S.moveTo(0, -0.2);
    S.bezierCurveTo(0.12, -0.2, 0.17, -0.1, 0.15, -0.02);
    S.bezierCurveTo(0.14, 0.04, 0.11, 0.07, 0.125, 0.14);
    S.bezierCurveTo(0.07, 0.1, 0.05, 0.06, 0.045, 0.02);
    S.bezierCurveTo(0.06, 0.1, 0.035, 0.17, 0.0, 0.235);
    S.bezierCurveTo(-0.04, 0.15, -0.06, 0.09, -0.045, 0.03);
    S.bezierCurveTo(-0.07, 0.06, -0.1, 0.07, -0.125, 0.09);
    S.bezierCurveTo(-0.17, 0.0, -0.17, -0.1, -0.12, -0.15);
    S.bezierCurveTo(-0.08, -0.19, -0.04, -0.2, 0, -0.2);
    const h = new THREE.Path();
    h.moveTo(0.0, -0.15); h.bezierCurveTo(0.06, -0.15, 0.065, -0.09, 0.035, -0.05); h.bezierCurveTo(0.02, -0.03, 0.01, -0.01, 0.005, 0.02);
    h.bezierCurveTo(-0.025, -0.02, -0.06, -0.06, -0.055, -0.1); h.bezierCurveTo(-0.05, -0.135, -0.03, -0.15, 0.0, -0.15);
    S.holes.push(h);
    return [S];
  }
  if (el === 'water') {
    S.moveTo(0, 0.21); S.bezierCurveTo(0.05, 0.12, 0.14, 0.03, 0.13, -0.07);
    S.absarc(0, -0.07, 0.13, 0, Math.PI, true);
    S.bezierCurveTo(-0.14, 0.03, -0.05, 0.12, 0, 0.21);
    const h = new THREE.Path(); h.absarc(-0.035, -0.08, 0.05, Math.PI * 0.55, Math.PI * 1.25, false); h.absarc(-0.035, -0.08, 0.025, Math.PI * 1.25, Math.PI * 0.55, true); S.holes.push(h);
    return [S];
  }
  if (el === 'ice') {
    const pts = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = i % 2 ? 0.065 : 0.21; pts.push([Math.sin(a) * r, Math.cos(a) * r]); }
    const hex6 = []; for (let i = 5; i >= 0; i--) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; hex6.push([Math.sin(a) * 0.035, Math.cos(a) * 0.035]); }
    // side barbs on each arm
    const out = [poly2(pts, [hex6])];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, ux = Math.sin(a), uy = Math.cos(a), vx = Math.cos(a), vy = -Math.sin(a);
      for (const s of [-1, 1]) {
        const bx = ux * 0.13, by = uy * 0.13;
        out.push(poly2([[bx + vx * s * 0.012, by + vy * s * 0.012], [bx + ux * 0.02 + vx * s * 0.07, by + uy * 0.02 + vy * s * 0.07], [bx + ux * 0.045 + vx * s * 0.055, by + uy * 0.045 + vy * s * 0.055], [bx + ux * 0.03 + vx * s * 0.0, by + uy * 0.03 + vy * s * 0.0]]));
      }
    }
    return out;
  }
  if (el === 'wind') {
    // a spiral ribbon of two and a quarter turns, thinning to its inner end
    const o = [], i = [];
    for (let k = 0; k <= 60; k++) {
      const t = k / 60, a = 0.4 + t * Math.PI * 2.25, r = 0.205 - t * 0.17, w = 0.034 - t * 0.02;
      o.push([Math.cos(a) * (r + w / 2), Math.sin(a) * (r + w / 2)]); i.push([Math.cos(a) * (r - w / 2), Math.sin(a) * (r - w / 2)]);
    }
    return [poly2([...o, ...i.reverse()]), poly2([[0.15, 0.12], [0.24, -0.08], [0.21, -0.1], [0.12, 0.09]])];
  }
  if (el === 'thunder') return [poly2([[-0.05, 0.21], [0.1, 0.21], [0.02, 0.045], [0.12, 0.045], [-0.08, -0.22], [-0.01, -0.035], [-0.1, -0.035]])];
  // earth: two peaks over a ground line
  return [poly2([[-0.2, -0.12], [-0.07, 0.12], [-0.01, 0.03], [0.07, 0.19], [0.21, -0.12]], [[[0.07, 0.12], [0.11, 0.05], [0.07, 0.07], [0.03, 0.05]]]), poly2([[-0.21, -0.19], [0.21, -0.19], [0.19, -0.155], [-0.19, -0.155]])];
}

// --------------------------------------------------------------------------------------------------------- the stele
function stele(el, lod) {
  setLod(lod);
  const seed = SEED[el], rnd = prng(seed), mesh = new Mesh();
  const lean = (rnd() - 0.5) * 0.035, H = 2.33;
  const paint = carvedStone({ H, seed, warm: 0.35, base: 0.7, tint: [1.02, 1.0, 0.97] });
  const footPaint = carvedStone({ H, seed: seed + 1, warm: 0.45, base: 0.62, lichen: 0.7 });
  const bev = lod === 0 ? 0.022 : 0.03;
  // ---- foot stone: rough, wider, sunk, the top edges well worn, one corner knocked off
  const foot = [
    ...boxPlanes([-0.66, -0.14, -0.31, 0.66, 0.2, 0.32], { floor: true }),
    plane([0.12, 1, 0.05], [0, 0.205, 0]), plane([-0.6, 0.55, 0.05], [-0.62, 0.15, 0]), plane([0.6, 0.5, -0.1], [0.62, 0.16, 0]),
    plane([0.05, 0.6, 0.7], [0, 0.16, 0.3]), plane([0.0, 0.55, -0.8], [0, 0.16, -0.3]),
    plane([-0.7, 0.4, 0.6], [-0.55, 0.12, 0.25], 'face'),   // the knocked-off corner
  ];
  const F = piece(mesh, foot, { bevel: lod === 0 ? 0.03 : 0.04, paint: footPaint });
  // ---- the slab: tapering, flat-topped, a hair of lean (built upright, turned about its foot); the long vertical edges
  // carry a wide chamfer, the rest a narrow one
  const y0 = 0.19, yTop = 2.0, wb = 0.465, wt = 0.39;
  const slab = [
    plane([1, (wb - wt) / (yTop - y0), 0], [wb, y0, 0]), plane([-1, (wb - wt) / (yTop - y0), 0], [-wb, y0, 0]),
    planeD([0, 0, 1], FACE), plane([0, 0.012, -1], [0, y0, -FACE - 0.005]), planeD([0, -1, 0], -y0, 'floor'), planeD([0, 1, 0], yTop),
    plane([0.6, 0.5, -0.62], [0.36, 1.96, -0.13], 'face'),          // the knocked-off back corner
  ];
  const xfLean = { p: (p) => { const c = Math.cos(lean), s = Math.sin(lean); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; }, n: (n) => { const c = Math.cos(lean), s = Math.sin(lean); return [n[0] * c - n[1] * s, n[0] * s + n[1] * c, n[2]]; } };
  const slabM = new Mesh();
  const vert = (e) => Math.abs(e.b[1] - e.a[1]) > 0.5;
  const SL = piece(slabM, slab, { bevel: (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bev * 0.8 : vert(e) ? bev * 1.9 : bev), paint, minAngle: 0.15 });
  // ---- a string course under the capstone, then the capstone: a small overhanging gabled roof of stone
  piece(slabM, boxPlanes([-wt - 0.045, yTop - 0.005, -FACE - 0.04, wt + 0.045, yTop + 0.07, FACE + 0.04]), { bevel: bev * 0.7, paint });
  const cap = [
    ...boxPlanes([-0.56, yTop + 0.065, -0.27, 0.56, yTop + 0.45, 0.27]),
    plane([0, 1, 0.78], [0, yTop + 0.38, 0]), plane([0, 1, -0.78], [0, yTop + 0.38, 0]),
  ];
  const CP = piece(slabM, cap, { bevel: bev * 0.9, paint });
  // ---- carved relief on the face: roundel, the sigil (glow), a star above, rows of letters below
  const z = FACE - 0.002;
  addGeo(slabM, extrude(ring2(0.3, 0.25), 0.02, { bevel: 0.007, curve: lod === 0 ? 32 : 18, seg: 1 }), { paint, matrix: mat4([SIG[0], SIG[1], z]) });
  addGeo(slabM, extrude(ring2(0.236, 0.224), 0.008, { bevel: 0.002, curve: lod === 0 ? 32 : 18, seg: 1 }), { paint: () => [1, 1, 1], part: 'glow', matrix: mat4([SIG[0], SIG[1], z + 0.002]) });
  for (const sh of sigil(el)) addGeo(slabM, extrude(sh, 0.016, { bevel: 0.005, curve: lod === 0 ? 12 : 6, seg: lod === 0 ? 2 : 1 }), { paint: () => [1, 1, 1], part: 'glow', matrix: mat4([SIG[0], SIG[1], z]) });
  // a four-point star under the arch
  const star = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 0.022 : 0.06; star.push([Math.sin(a) * r, Math.cos(a) * r]); }
  addGeo(slabM, extrude(poly2(star), 0.012, { bevel: 0.004 }), { paint, matrix: mat4([0, 1.86, z]) });
  // a moulded band framing the panel: two raised fillets down the sides, one across under the letters
  for (const sx of [-1, 1]) piece(slabM, boxPlanes([sx * 0.355 - 0.02, 0.5, z - 0.01, sx * 0.355 + 0.02, 1.78, z + 0.016]), { bevel: 0.007, paint });
  piece(slabM, boxPlanes([-0.375, 0.47, z - 0.01, 0.375, 0.52, z + 0.016]), { bevel: 0.007, paint });
  piece(slabM, boxPlanes([-0.375, 1.76, z - 0.01, 0.375, 1.8, z + 0.016]), { bevel: 0.006, paint });
  if (lod === 0) {
    // three rows of worn letters: short raised strokes, ticks and dots
    for (let row = 0; row < 3; row++) {
      let x = -0.29 + rnd() * 0.03;
      const y = 0.98 - row * 0.12;
      while (x < 0.28) {
        const k = rnd(), w = k < 0.5 ? 0.025 + rnd() * 0.05 : k < 0.8 ? 0.012 : 0.03;
        const h = k < 0.5 ? 0.012 : k < 0.8 ? 0.05 : 0.028;
        if (x + w > 0.3) break;
        piece(slabM, boxPlanes([x, y - h / 2 + (k < 0.5 ? (rnd() - 0.5) * 0.02 : 0), z - 0.004, x + w, y + h / 2, z + 0.007]), { bevel: 0.003, paint, corners: false });
        x += w + 0.018 + rnd() * 0.03;
        if (rnd() < 0.18) x += 0.05;    // word gap
      }
    }
  }
  // ---- moss: the foot's back and a corner, the capstone's lee (north = local -Z)
  const MOSS = lod === 0 ? { rings: 4, segs: 14 } : { rings: 2, segs: 9 };
  mossCap(mesh, [F.planes], { at: [-0.4, -0.2], R: 0.2, T: 0.035, seed: seed + 5, ...MOSS });
  mossCap(mesh, [F.planes], { at: [0.5, -0.16], R: 0.13, T: 0.03, seed: seed + 6, ...MOSS });
  mossCap(mesh, [F.planes], { at: [0.55, 0.22], R: 0.09, T: 0.025, seed: seed + 7, ...MOSS });
  mossCap(slabM, [CP.planes], { at: [-0.1, -0.16], R: 0.16, T: 0.025, seed: seed + 8, ...MOSS });
  void SL;
  mesh.append(slabM, xfLean);
  return mesh;
}

async function main() {
  const want = process.argv.slice(2).filter((a) => ELS.includes(a));
  const list = want.length ? want : ELS;
  const items = [];
  for (const el of list) {
    const name = 'stele_' + el;
    const lods = [stele(el, 0), stele(el, 1)];
    const r = await writeAsset(name, lods, {
      source: 'tools/sculpt/assets/stele_page.mjs (node, facet kit + three.js generators)',
      notes: `Page-trial marker stele (${el}): tapering arched slab, capstone, worn foot stone, raised roundel with the element sigil (part Glow: the game's sigil glow), carved letters, lichen, moss. Vertex colours on every LOD, no textures; merged per material into the site (gameplay/wilds-pages.js).`,
      extras: { family: 'page_sites', element: el },
    });
    console.log(name, 'tris', r.tris.join(' / '), 'KB', r.kb, 'size', [r.bounds[3] - r.bounds[0], r.bounds[4] - r.bounds[1], r.bounds[5] - r.bounds[2]].map((v) => v.toFixed(2)).join(' x '));
    items.push({ mesh: lods[0], label: el, az: 20, el: 10 }, { mesh: lods[0], label: el + ' back', az: 200, el: 15 });
  }
  await sheet('stele_page', items, { cols: 4, ts: 360 });
}
main().catch((e) => { console.error(e); process.exit(1); });
