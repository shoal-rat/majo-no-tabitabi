// The lake windmill (round art-stone, 2026-11-24): the tower mill on the hill above the trial lake, built piece by
// piece with the facet kit (rock_facet.mjs). Two GLBs: the mill (static) and its sails (they turn about local z).
//
//   node tools/sculpt/assets/mill_lake.mjs   -> assets/models/sculpt/mill_lake.glb, mill_lake_sails.glb (+ fragments),
//                                              sheet .tmp/sculpt/mill_lake/sheet.png
//
// Same footprint as the old box tower (base radius 3.15 m, 2.45 m under the curb, curb at 8.4 m, roof apex 11.7 m, front
// = +z) so its collider and roof platform stay. Pieces:
//   tower  a footing ring of big rough stones, then courses of dressed limestone blocks laid round the batter, every
//          course offset by half a block, each block a cushion (bevel ring rolled into the joint, domed face); a dark
//          mortar core behind the joints; a projecting cornice course under the curb
//   door   timber frame (posts, lintel, a little hood), plank door with iron straps, a stone step
//   windows timber frames with a mullion and two plank shutters, sills of stone
//   cap    a timber curb, a bell-flared conical roof of fish-scale slate in rows (the old roof's blue kept), a lead finial;
//          the windshaft housing: a timber-framed gable box on the front with braces; a tail pole with struts and a
//          winding wheel at the back (the cap turns the sails into the wind)
//   sails  (separate GLB, hub at the origin, plane z = 0) a canister with two stocks, four whips with lattice (sail bars,
//          hemlath, inner rail) and canvas: three cloths spread with a little billow, one furled along its whip
// LOD0 for every tier but phones / low (LOD1: domed-fan blocks, fewer slate rows, sharp beams).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, prng, norm, add, mul, sub, cross, dot, toLin, hex, ss, fbm, Mesh, plane, planeD, bevelPiece, emitPiece, writeGLB, writeFragment, previewSheet } from './rock_facet.mjs';

export const PARTS = {
  stone: { name: 'MillStone', surface: 'stone', look: { detail: 0.3, bump: 0.35 } },
  timber: { name: 'MillTimber', surface: 'wood', look: { detail: 0.4 } },
  slate: { name: 'MillSlate', surface: 'paint', look: { detail: 0.2, spec: 0.08, specPower: 40 } },
  cloth: { name: 'MillCloth', surface: 'cloth', look: { trans: 0.25 } },
  iron: { name: 'MillIron', surface: 'metal', look: { spec: 0.3 } },
};
const H = 8.4, R0 = 3.15, R1 = 2.45;
const rAt = (y) => R0 + (R1 - R0) * Math.max(0, Math.min(1, y / H));
const SLOPE = Math.atan2(R0 - R1, H);           // the batter (outward normal tilts up by this)
const LIME = [0xbdb49c, 0xb3aa92, 0xc6bca3, 0xaba38d, 0xb8ab8e, 0xc1b79d].map(hex);
const TIMBER = hex(0x6f5541), TIMBER_D = hex(0x54412f), PLANK = hex(0x7d5d42), IRON = hex(0x3c3d44);
const SLATE = [0x5f6e82, 0x687790, 0x58667c, 0x6b7a8e].map(hex), CLOTH = hex(0xe9dfc4);
const lin = (c, k = 1) => c.map((v) => toLin(Math.min(1, v * k)));

// ------------------------------------------------------------------------------------------------- tower surface
/** a point on the tower face at arc angle a (rad, 0 = +z), height y, pushed out by `off` along the normal */
function towerPt(a, y, off = 0) {
  const r = rAt(y) + off * Math.cos(SLOPE);
  return [Math.sin(a) * r, y + off * Math.sin(SLOPE), Math.cos(a) * r];
}
const towerN = (a) => norm([Math.sin(a) * Math.cos(SLOPE), Math.sin(SLOPE), Math.cos(a) * Math.cos(SLOPE)]);

/**
 * A dressed block on the tower: outline [[a, y], ...] (arc angle, height; ccw seen from outside), cushion as the wall
 * stones: domed face, bevel ring rolling into the joint (lod 0) or a domed fan (lod 1).
 */
function towerBlock(mesh, poly, col, lod, { proud = 0, bev = 0.024, dome = 0.012 } = {}) {
  const n = poly.length, c = poly.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  const rc = rAt(c[1]);
  // outline direction in the face (tangent u along the arc, v up the batter)
  const out2 = (p) => { const du = (p[0] - c[0]) * rc, dv = p[1] - c[1], l = Math.hypot(du, dv) || 1; return [du / l, dv / l]; };
  const dirAt = (a, d) => { const t = [Math.cos(a), 0, -Math.sin(a)], up = norm([-Math.sin(a) * Math.sin(SLOPE), Math.cos(SLOPE), -Math.cos(a) * Math.sin(SLOPE)]); return norm(add(mul(t, d[0]), mul(up, d[1]))); };
  const C = mesh.v(towerPt(c[0], c[1], proud + dome), towerN(c[0]), lin(col, 1.05), 'stone');
  if (lod >= 1) {
    const ids = poly.map((p) => mesh.v(towerPt(p[0], p[1], proud - 0.014), norm(add(towerN(p[0]), mul(dirAt(p[0], out2(p)), 0.75))), lin(col, 0.86), 'stone'));
    for (let i = 0; i < n; i++) mesh.tri(C, ids[i], ids[(i + 1) % n]);
    return;
  }
  const w = bev;
  const inner = poly.map((p) => { const o = out2(p); const q = [p[0] - (o[0] * w) / rc, p[1] - o[1] * w]; return mesh.v(towerPt(q[0], q[1], proud), norm(add(towerN(q[0]), mul(dirAt(q[0], o), 0.42))), lin(col, 0.98), 'stone'); });
  const outer = poly.map((p) => { const o = out2(p); return mesh.v(towerPt(p[0], p[1], proud - w * 0.7), norm(add(mul(towerN(p[0]), 0.45), dirAt(p[0], o))), lin(col, 0.8), 'stone'); });
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; mesh.tri(C, inner[i], inner[j]); mesh.tri(inner[i], outer[i], outer[j]); mesh.tri(inner[i], outer[j], inner[j]); }
}
/** arc-rectangle [a0, a1] x [y0, y1] with some corners cut (rounded outline), ccw from outside */
function arcOutline(rnd, a0, a1, y0, y1, cuts, r) {
  const k = () => Math.min((a1 - a0) * r, y1 - y0) * (0.16 + 0.18 * rnd());
  const out = [];
  const cs = [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];
  cs.forEach(([a, y], i) => {
    if (!cuts.includes(i)) { out.push([a, y]); return; }
    const da = k() / r, dy = k();
    if (i === 0) out.push([a, y + dy], [a + da, y]);
    else if (i === 1) out.push([a - da, y], [a, y + dy]);
    else if (i === 2) out.push([a, y - dy], [a - da, y]);
    else out.push([a + da, y], [a, y - dy]);
  });
  // already ccw seen from outside (x = sin a: +a runs to the right of a viewer facing the wall)
  return out;
}

// ---------------------------------------------------------------------------------------------------- timber
/** a bevelled beam from a to b, cross-section w (along `side`) x h, `up` hint; part / colour */
function beam(mesh, a, b, w, h, col, { up = [0, 1, 0], part = 'timber', bev = 0.012, lod = 0, k = 1 } = {}) {
  const d = norm(sub(b, a)), len = Math.hypot(...sub(b, a));
  let s = cross(d, up); if (Math.hypot(...s) < 1e-3) s = cross(d, [1, 0, 0]); s = norm(s);
  const u = norm(cross(s, d)), m = mul(add(a, b), 0.5);
  const pl = [
    plane(d, add(m, mul(d, len / 2))), plane(mul(d, -1), sub(m, mul(d, len / 2))),
    plane(s, add(m, mul(s, w / 2))), plane(mul(s, -1), sub(m, mul(s, w / 2))),
    plane(u, add(m, mul(u, h / 2))), plane(mul(u, -1), sub(m, mul(u, h / 2))),
  ];
  const piece = bevelPiece(pl, () => (lod === 0 ? Math.min(bev, w * 0.3, h * 0.3) : 0), { corners: false });
  emitPiece(mesh, piece, (c) => { const g = 0.92 + 0.12 * c.n[1] + 0.08 * c.chamfer; return col.map((v) => v * g * k); }, { part, skip: () => false });
}
/** a flat convex polygon facing n (winding fixed here: Newell normal turned to agree with n) with a colour */
function poly(mesh, pts, n, col, part) {
  let nw = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; nw = add(nw, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); }
  if (dot(nw, n) < 0) pts = pts.slice().reverse();
  const ids = pts.map((p) => mesh.v(p, n, col, part));
  for (let i = 1; i + 1 < ids.length; i++) mesh.tri(ids[0], ids[i], ids[i + 1]);
}

// ------------------------------------------------------------------------------------------------------ the mill
const DOOR = { a: 0.21, y0: 0.42, y1: 2.55 }, WINDOWS = [{ a: 0.13, y0: 3.75, y1: 4.75, y: 4.25 }, { a: 0.12, y0: 5.95, y1: 6.85, y: 6.4 }];
/** the angular half-width (rad) of the opening a course [y0, y1] must leave free, 0 if none (frames cover the cut ends) */
function opening(y0, y1) {
  if (y1 > DOOR.y0 && y0 < DOOR.y1 + 0.1) return DOOR.a * 0.99;
  for (const w of WINDOWS) if (y1 > w.y0 && y0 < w.y1 + 0.06) return w.a * 0.99;
  return 0;
}

export function buildMill(lod) {
  const mesh = new Mesh(), rnd = prng(1818);
  // footing ring: big rough stones on the ground, a little proud
  const foot = 0.52, ring = 15;
  for (let j = 0; j < ring; j++) {
    const a0 = (j / ring) * Math.PI * 2 + 0.006, a1 = ((j + 1) / ring) * Math.PI * 2 - 0.006;
    if (Math.abs(((a0 + a1) / 2 + Math.PI) % (Math.PI * 2) - Math.PI) < DOOR.a * 0.6) continue;
    const col = LIME[Math.floor(rnd() * LIME.length)].map((v) => v * 0.9);
    towerBlock(mesh, arcOutline(rnd, a0, a1, -0.6, foot - 0.008, [2, 3].filter(() => rnd() < 0.7), R0), col, lod, { proud: 0.07, bev: 0.05, dome: 0.03 });
  }
  // courses of dressed blocks
  const courses = 18, ch = (H - 0.3 - foot) / courses;
  for (let k = 0; k < courses; k++) {
    const y0 = foot + k * ch, y1 = y0 + ch, r = rAt(y0 + ch / 2);
    const nb = Math.max(14, Math.round((2 * Math.PI * r) / (0.68 + 0.1 * (k % 3))));
    const off = (k % 2) * 0.5 + rnd() * 0.2;
    const oa = opening(y0, y1);
    for (let j = 0; j < nb; j++) {
      let a0 = ((j + off) / nb) * Math.PI * 2 - Math.PI, a1 = ((j + 1 + off) / nb) * Math.PI * 2 - Math.PI;   // -pi..pi, 0 = front
      const col = LIME[Math.floor(rnd() * LIME.length)].map((v) => v * (0.95 + 0.08 * rnd()) * (0.94 + 0.06 * (k / courses)));
      const g = 0.006 / r;
      const cuts = lod === 0 ? [0, 1, 2, 3].filter(() => rnd() < 0.35).slice(0, 2) : [];
      const prd = (rnd() - 0.5) * 0.012;
      // a block that runs into an opening is cut back to its jamb (both sides kept when it spans it)
      const spans = oa && a1 > -oa && a0 < oa ? [[a0, -oa], [oa, a1]].filter(([p, q]) => (q - p) * r > 0.1) : [[a0, a1]];
      for (const [p, q] of spans) towerBlock(mesh, arcOutline(rnd, p + g, q - g, y0 + 0.006, y1 - 0.006, cuts, r), col, lod, { proud: prd });
    }
  }
  // cornice: a projecting course under the curb
  const cy0 = H - 0.3, ncor = 26;
  for (let j = 0; j < ncor; j++) {
    const a0 = (j / ncor) * Math.PI * 2 + 0.004, a1 = ((j + 1) / ncor) * Math.PI * 2 - 0.004;
    towerBlock(mesh, arcOutline(rnd, a0, a1, cy0, H - 0.01, [], R1), LIME[j % LIME.length].map((v) => v * 0.97), lod, { proud: 0.09, bev: 0.035, dome: 0.006 });
  }
  // mortar core behind the joints: a 32-sided cone band, dark
  const seg = 32, core = lin(hex(0x988e7d));
  for (let j = 0; j < seg; j++) {
    const a0 = (j / seg) * Math.PI * 2, a1 = ((j + 1) / seg) * Math.PI * 2;
    const p = [towerPt(a0, -0.6, -0.032), towerPt(a1, -0.6, -0.032), towerPt(a1, H, -0.032), towerPt(a0, H, -0.032)];
    const ids = p.map((q, i) => mesh.v(q, towerN(i === 0 || i === 3 ? a0 : a1), core, 'stone'));
    mesh.tri(ids[0], ids[2], ids[1]); mesh.tri(ids[0], ids[3], ids[2]);
  }
  // ---- door: plank leaf in front of the core, timber frame, hood, iron straps, stone step
  const dz = (y) => rAt(y) - 0.012;
  const dw = Math.sin(DOOR.a) * rAt(1) * 0.96;
  const planks = 6;
  for (let i = 0; i < planks; i++) {
    const x0 = -dw + (2 * dw * i) / planks + 0.006, x1 = -dw + (2 * dw * (i + 1)) / planks - 0.006;
    const k = 0.92 + 0.12 * rnd(), top = DOOR.y1 - 0.02;
    poly(mesh, [[x0, DOOR.y0, dz(DOOR.y0)], [x1, DOOR.y0, dz(DOOR.y0)], [x1, top, dz(top)], [x0, top, dz(top)]], norm([0, Math.sin(SLOPE), 1]), lin(PLANK, k), 'timber');
  }
  for (const yy of [0.9, 2.1]) beam(mesh, [-dw * 0.95, yy, dz(yy) + 0.02], [dw * 0.55, yy, dz(yy) + 0.02], 0.022, 0.06, IRON, { part: 'iron', lod, up: [0, 0, 1] });
  const fz = (y) => rAt(y) + 0.02;
  beam(mesh, [-dw - 0.06, DOOR.y0 - 0.02, fz(DOOR.y0)], [-dw - 0.06, DOOR.y1 + 0.08, fz(DOOR.y1)], 0.15, 0.16, TIMBER, { lod, up: [0, 0, 1] });
  beam(mesh, [dw + 0.06, DOOR.y0 - 0.02, fz(DOOR.y0)], [dw + 0.06, DOOR.y1 + 0.08, fz(DOOR.y1)], 0.15, 0.16, TIMBER, { lod, up: [0, 0, 1] });
  beam(mesh, [-dw - 0.22, DOOR.y1 + 0.13, fz(DOOR.y1) + 0.01], [dw + 0.22, DOOR.y1 + 0.13, fz(DOOR.y1) + 0.01], 0.2, 0.18, TIMBER_D, { lod, up: [0, 0, 1] });
  // hood: a small slate-covered pent over the door on two brackets
  const hy = DOOR.y1 + 0.42, pz0 = rAt(hy) - 0.02, pz1 = pz0 + 0.62;
  poly(mesh, [[-dw - 0.35, hy, pz0], [-dw - 0.35, hy - 0.26, pz1], [dw + 0.35, hy - 0.26, pz1], [dw + 0.35, hy, pz0]].reverse(), norm([0, 1, 0.42]), lin(SLATE[0], 1.05), 'slate');
  poly(mesh, [[-dw - 0.35, hy - 0.26, pz1], [-dw - 0.35, hy - 0.3, pz1], [dw + 0.35, hy - 0.3, pz1], [dw + 0.35, hy - 0.26, pz1]], [0, 0, 1], lin(TIMBER_D), 'timber');
  for (const sx of [-1, 1]) beam(mesh, [sx * (dw + 0.2), DOOR.y1 + 0.2, rAt(DOOR.y1)], [sx * (dw + 0.2), hy - 0.27, pz1 - 0.06], 0.08, 0.08, TIMBER_D, { lod });
  // step
  const st = bevelPiece([plane([0, 1, 0], [0, 0.2, 0]), plane([0, -1, 0], [0, -0.3, 0]), plane([1, 0, 0.05], [dw + 0.25, 0, 0]), plane([-1, 0, 0.05], [-dw - 0.25, 0, 0]), plane([0.1, 0.1, 1], [0, 0, R0 + 0.62]), plane([0, 0, -1], [0, 0, R0 - 0.2])], () => (lod === 0 ? 0.03 : 0), { corners: false });
  emitPiece(mesh, st, (c) => LIME[2].map((v) => v * (0.86 + 0.1 * c.n[1] + 0.06 * c.chamfer)), { part: 'stone', skip: (k) => false });
  // ---- windows: frame, mullion, dark glass, two shutters folded open against the wall, stone sill
  for (const w of WINDOWS) {
    const ww = Math.sin(w.a) * rAt(w.y) * 0.94, z = (y) => rAt(y) - 0.018;
    poly(mesh, [[-ww, w.y0, z(w.y0)], [ww, w.y0, z(w.y0)], [ww, w.y1, z(w.y1)], [-ww, w.y1, z(w.y1)]], norm([0, Math.sin(SLOPE), 1]), lin(hex(0x2e3440)), 'iron');
    const f = (y) => rAt(y) + 0.015;
    beam(mesh, [-ww - 0.05, w.y0 - 0.04, f(w.y0)], [-ww - 0.05, w.y1 + 0.05, f(w.y1)], 0.1, 0.1, TIMBER, { lod, up: [0, 0, 1] });
    beam(mesh, [ww + 0.05, w.y0 - 0.04, f(w.y0)], [ww + 0.05, w.y1 + 0.05, f(w.y1)], 0.1, 0.1, TIMBER, { lod, up: [0, 0, 1] });
    beam(mesh, [-ww - 0.12, w.y1 + 0.08, f(w.y1)], [ww + 0.12, w.y1 + 0.08, f(w.y1)], 0.14, 0.12, TIMBER_D, { lod, up: [0, 0, 1] });
    beam(mesh, [0, w.y0, f(w.y0) - 0.03], [0, w.y1, f(w.y1) - 0.03], 0.05, 0.06, TIMBER, { lod, up: [0, 0, 1] });
    beam(mesh, [-ww, (w.y0 + w.y1) / 2, f(w.y) - 0.03], [ww, (w.y0 + w.y1) / 2, f(w.y) - 0.03], 0.04, 0.05, TIMBER, { lod, up: [0, 0, 1] });
    // sill
    const sp = bevelPiece([plane([0, 1, 0.1], [0, w.y0 - 0.06, 0]), plane([0, -1, 0], [0, w.y0 - 0.16, 0]), plane([1, 0, 0], [ww + 0.16, 0, 0]), plane([-1, 0, 0], [-ww - 0.16, 0, 0]), plane([0, 0.15, 1], [0, 0, rAt(w.y0) + 0.12]), plane([0, 0, -1], [0, 0, rAt(w.y0) - 0.2])], () => (lod === 0 ? 0.015 : 0), { corners: false });
    emitPiece(mesh, sp, (c) => LIME[0].map((v) => v * (0.88 + 0.1 * c.n[1])), { part: 'stone', skip: () => false });
    // shutters: plank leaves hinged on the frame, swung back against the wall (on the batter)
    for (const sx of [-1, 1]) {
      const a0 = sx * (Math.asin((ww + 0.1) / rAt(w.y))), a1 = a0 + sx * (2 * ww * 0.5 + 0.02) / rAt(w.y);
      for (let i = 0; i < 3; i++) {
        const t0 = i / 3, t1 = (i + 1) / 3 - 0.03;
        const aa = a0 + (a1 - a0) * t0, ab = a0 + (a1 - a0) * t1;
        const q = [towerPt(aa, w.y0, 0.03), towerPt(ab, w.y0, 0.03), towerPt(ab, w.y1, 0.03), towerPt(aa, w.y1, 0.03)];
        poly(mesh, sx > 0 ? q.reverse() : q, towerN((aa + ab) / 2), lin(hex(0x5d7a8a), 0.95 + 0.08 * i), 'timber');
      }
    }
  }
  // ---- cap: timber curb, flared fish-scale slate cone, finial
  const curbN = 24, cr = R1 + 0.16;
  for (let j = 0; j < curbN; j++) {
    const a0 = (j / curbN) * Math.PI * 2, a1 = ((j + 1) / curbN) * Math.PI * 2;
    beam(mesh, [Math.sin(a0) * cr, H + 0.12, Math.cos(a0) * cr], [Math.sin(a1) * cr, H + 0.12, Math.cos(a1) * cr], 0.24, 0.26, TIMBER_D, { lod, bev: 0.02 });
  }
  const apex = 11.7, eave = H + 0.25, RE = 3.0;
  const rows = lod === 0 ? 11 : 7, around = lod === 0 ? 40 : 28;
  // roof profile: radius at t (0 eave .. 1 apex): a bell flare at the eave
  const rr = (t) => RE * (1 - t) * (1 + 0.18 * Math.pow(1 - t, 3) * 0) + 0.06 * (1 - t);
  const yy = (t) => eave + (apex - eave) * (t + 0.12 * t * (1 - t)) - 0.25 * Math.pow(1 - t, 4);
  for (let i = 0; i < rows; i++) {
    const t0 = i / rows, t1 = (i + 1.25) / rows;   // each row overlaps the next
    const n0 = (() => { const dr = rr(t1) - rr(t0), dy = yy(t1) - yy(t0); return [dy, -dr]; })();
    const off = (i % 2) * 0.5;
    for (let j = 0; j < around; j++) {
      const a0 = ((j + off) / around) * Math.PI * 2, a1 = ((j + 1 + off) / around) * Math.PI * 2, am = (a0 + a1) / 2;
      const col = SLATE[(i * 7 + j * 3) % SLATE.length];
      const nrm = (a) => norm([Math.sin(a) * n0[0], -n0[1] * 1 + 0, Math.cos(a) * n0[0]]);
      // shingle: top edge straight, bottom edge a round scale (centre lower), a lip of thickness at the bottom
      const P = (a, t, lift = 0) => [Math.sin(a) * (rr(t) + lift), yy(t), Math.cos(a) * (rr(t) + lift)];
      const tb = t0 - 0.12 / rows;   // the scale's round tip dips below the row line
      const lip = 0.035;
      const c0 = lin(col, 0.84), c1 = lin(col, 1.0), c2 = lin(col, 1.08);
      const nn = norm([Math.sin(am) * Math.abs(n0[0]), Math.abs(n0[1]), Math.cos(am) * Math.abs(n0[0])]);
      if (lod === 0) {
        const v = [mesh.v(P(a0, t0, lip), nn, c1, 'slate'), mesh.v(P(am, tb, lip), nn, c1, 'slate'), mesh.v(P(a1, t0, lip), nn, c1, 'slate'), mesh.v(P(a1, t1, 0), nn, c2, 'slate'), mesh.v(P(a0, t1, 0), nn, c2, 'slate'), mesh.v(P((a0 * 0.7 + am * 0.3), (t0 + tb) / 2 + 0.002, lip), nn, c1, 'slate'), mesh.v(P((a1 * 0.7 + am * 0.3), (t0 + tb) / 2 + 0.002, lip), nn, c1, 'slate')];
        // face: fan from the top middle
        const top = mesh.v(P(am, t1, 0), nn, c2, 'slate');
        const ring2 = [v[4], v[0], v[5], v[1], v[6], v[2], v[3]];
        for (let q = 0; q + 1 < ring2.length; q++) mesh.tri(top, ring2[q + 1], ring2[q]);
        // the lip: the scale's thickness under its edge
        const under = [P(a0, t0, 0), P((a0 * 0.7 + am * 0.3), (t0 + tb) / 2 + 0.002, 0), P(am, tb, 0), P((a1 * 0.7 + am * 0.3), (t0 + tb) / 2 + 0.002, 0), P(a1, t0, 0)].map((p) => mesh.v(p, norm(add(nn, [0, -1.2, 0])), c0, 'slate'));
        const edge = [v[0], v[5], v[1], v[6], v[2]];
        for (let q = 0; q < 4; q++) { mesh.tri(edge[q], edge[q + 1], under[q + 1]); mesh.tri(edge[q], under[q + 1], under[q]); }
      } else {
        const a = mesh.v(P(a0, t0, lip), nn, c1, 'slate'), b = mesh.v(P(am, tb, lip), nn, c1, 'slate'), c = mesh.v(P(a1, t0, lip), nn, c1, 'slate'), d = mesh.v(P(a1, t1, 0), nn, c2, 'slate'), e = mesh.v(P(a0, t1, 0), nn, c2, 'slate');
        mesh.tri(e, b, a); mesh.tri(e, d, b); mesh.tri(d, c, b);
      }
    }
  }
  // finial: lead cone + ball + spike
  const fin = lin(hex(0x8f959c));
  const lathe = (prof, segs) => {
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2, a1 = ((j + 1) / segs) * Math.PI * 2;
      for (let i = 0; i + 1 < prof.length; i++) {
        const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
        const n0 = norm([y1 - y0, r0 - r1, 0]);
        const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r], N = (a) => norm([Math.sin(a) * n0[0], n0[1], Math.cos(a) * n0[0]]);
        const ids = [mesh.v(P(a0, r0, y0), N(a0), fin, 'iron'), mesh.v(P(a1, r0, y0), N(a1), fin, 'iron'), mesh.v(P(a1, r1, y1), N(a1), fin, 'iron'), mesh.v(P(a0, r1, y1), N(a0), fin, 'iron')];
        mesh.tri(ids[0], ids[1], ids[2]); mesh.tri(ids[0], ids[2], ids[3]);
      }
    }
  };
  lathe([[0.3, apex - 0.5], [0.16, apex + 0.05], [0.12, apex + 0.18], [0.17, apex + 0.3], [0.12, apex + 0.42], [0.03, apex + 0.5], [0.02, apex + 0.95], [0.001, apex + 1.0]], lod === 0 ? 10 : 6);
  // ---- windshaft housing: a timber-framed gable box on the front of the cap
  const hz0 = R1 - 0.3, hz1 = R1 + 1.0, hx = 0.78, hy0 = H + 0.25, hy1 = H + 1.25, ridge = H + 1.85;
  const boards = lin(hex(0x7a6250));
  for (const sx of [-1, 1]) poly(mesh, sx > 0 ? [[hx, hy0, hz0], [hx, hy0, hz1], [hx, hy1, hz1], [hx, hy1, hz0]] : [[-hx, hy0, hz0], [-hx, hy1, hz0], [-hx, hy1, hz1], [-hx, hy0, hz1]], [sx, 0, 0], boards, 'timber');
  poly(mesh, [[-hx, hy0, hz1], [hx, hy0, hz1], [hx, hy1, hz1], [0, ridge, hz1], [-hx, hy1, hz1]], [0, 0, 1], boards, 'timber');
  poly(mesh, [[-hx, hy0, hz0], [-hx, hy0, hz1], [hx, hy0, hz1], [hx, hy0, hz0]], [0, -1, 0], lin(TIMBER_D, 0.8), 'timber');
  for (const sx of [-1, 1]) {   // the housing's slate roof, overhanging
    const e0 = [sx * (hx + 0.16), hy1 - 0.12, hz0 - 0.2], e1 = [sx * (hx + 0.16), hy1 - 0.12, hz1 + 0.22], r0 = [0, ridge + 0.06, hz0 - 0.2], r1 = [0, ridge + 0.06, hz1 + 0.22];
    const nn = norm([sx * (ridge - hy1 + 0.18), hx + 0.16, 0]);
    poly(mesh, sx > 0 ? [e0, r0, r1, e1] : [e0, e1, r1, r0], nn, lin(SLATE[1], 1.04), 'slate');
  }
  // frame posts and braces on the housing's faces
  for (const sx of [-1, 1]) {
    beam(mesh, [sx * (hx + 0.02), hy0 - 0.05, hz1 + 0.02], [sx * (hx + 0.02), hy1 + 0.02, hz1 + 0.02], 0.12, 0.12, TIMBER, { lod });
    beam(mesh, [sx * (hx + 0.03), hy0 + 0.05, hz0 + 0.1], [sx * (hx + 0.03), hy1 - 0.05, hz1 - 0.1], 0.08, 0.06, TIMBER_D, { lod, up: [sx, 0, 0] });
  }
  beam(mesh, [-hx - 0.06, hy1 + 0.02, hz1 + 0.04], [hx + 0.06, hy1 + 0.02, hz1 + 0.04], 0.12, 0.12, TIMBER, { lod });
  beam(mesh, [-hx - 0.06, hy0 - 0.02, hz1 + 0.04], [hx + 0.06, hy0 - 0.02, hz1 + 0.04], 0.14, 0.14, TIMBER_D, { lod });
  // the windshaft: an iron-bound timber shaft out of the housing to the canister (tilted back 8 deg)
  const hub = HUB;
  beam(mesh, [0, hub[1] - 0.05, hz1 - 0.3], [0, hub[1], hub[2] - 0.3], 0.32, 0.32, TIMBER_D, { lod, bev: 0.04 });
  // ---- tail pole with two struts and a winding wheel (back of the cap)
  const tp0 = [0, H + 0.2, -R1 + 0.1], tp1 = [0, 1.25, -R0 - 4.1];
  beam(mesh, tp0, tp1, 0.2, 0.22, TIMBER, { lod, bev: 0.025 });
  for (const sx of [-1, 1]) beam(mesh, [sx * 1.25, H + 0.3, -R1 * 0.55], [0, 5.2, -R0 - 1.45], 0.12, 0.12, TIMBER_D, { lod });
  const wc = [0, 1.2, -R0 - 3.7], wr = 0.62, ws = lod === 0 ? 12 : 8;
  for (let j = 0; j < ws; j++) {
    const a0 = (j / ws) * Math.PI * 2, a1 = ((j + 1) / ws) * Math.PI * 2;
    beam(mesh, [wc[0] + 0.16, wc[1] + Math.cos(a0) * wr, wc[2] + Math.sin(a0) * wr], [wc[0] + 0.16, wc[1] + Math.cos(a1) * wr, wc[2] + Math.sin(a1) * wr], 0.07, 0.09, TIMBER_D, { lod, up: [1, 0, 0] });
    if (j % 2 === 0) beam(mesh, [wc[0] + 0.16, wc[1], wc[2]], [wc[0] + 0.16, wc[1] + Math.cos(a0) * wr, wc[2] + Math.sin(a0) * wr], 0.04, 0.04, TIMBER, { lod: 1 });
  }
  return mesh;
}
// the sails' hub in the mill's frame (the game puts the sails group here and turns it about its z)
export const HUB = [0, H + 0.75, R1 + 1.55];

// --------------------------------------------------------------------------------------------------------- sails
export function buildSails(lod) {
  const mesh = new Mesh(), rnd = prng(77);
  // canister: a square block on the shaft
  beam(mesh, [0, 0, -0.32], [0, 0, 0.22], 0.62, 0.62, TIMBER_D, { lod, bev: 0.05 });
  beam(mesh, [0, 0, 0.22], [0, 0, 0.3], 0.5, 0.5, IRON, { lod, part: 'iron', bev: 0.02 });
  const L = 6.2, inner = 1.3;
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2 + 0.25, d = [Math.sin(ang), Math.cos(ang), 0], s = [Math.cos(ang), -Math.sin(ang), 0];
    const P = (along, side, z = 0) => [d[0] * along + s[0] * side, d[1] * along + s[1] * side, z];
    // whip: tapering spar
    beam(mesh, P(0.25, 0, 0.02), P(L, 0, 0.02), 0.17, 0.15, TIMBER, { lod, bev: 0.02, up: [0, 0, 1] });
    // lattice: hemlath (outer rail), inner rail, sail bars
    const hem = 1.12, bars = lod === 0 ? 13 : 9;
    beam(mesh, P(inner, hem, 0.05), P(L, hem, 0.05), 0.07, 0.09, TIMBER, { lod, up: [0, 0, 1] });
    beam(mesh, P(inner, -0.24, 0.05), P(L, -0.24, 0.05), 0.05, 0.06, TIMBER, { lod, up: [0, 0, 1] });
    for (let b = 0; b <= bars; b++) { const t = inner + ((L - inner) * b) / bars; beam(mesh, P(t, -0.26, 0.09), P(t, hem + 0.04, 0.09), 0.045, 0.05, TIMBER, { lod: 1, up: [0, 0, 1] }); }
    // canvas: three spread with a gentle billow, one furled along its whip
    if (i !== 2) {
      const nu = lod === 0 ? 4 : 2, nv = lod === 0 ? 10 : 5, base = mesh.nv;
      for (let a = 0; a <= nv; a++) for (let b = 0; b <= nu; b++) {
        const t = inner + 0.08 + ((L - inner - 0.16) * a) / nv, sd = -0.18 + ((hem + 0.12) * b) / nu;
        const bil = 0.11 * Math.sin((b / nu) * Math.PI) * Math.sin(((a / nv) * 0.85 + 0.08) * Math.PI);
        const p = P(t, sd, 0.0 - bil);
        const n = norm([0, 0, 1]);
        const nn = norm(add(n, mul(s, -0.6 * Math.cos((b / nu) * Math.PI) * 0.4)));
        const shade = 0.93 + 0.07 * Math.sin((b / nu) * Math.PI) + 0.03 * fbm(t * 2, sd * 2, i, 3, 1);
        mesh.v(p, nn, lin(CLOTH, shade), 'cloth');
      }
      for (let a = 0; a < nv; a++) for (let b = 0; b < nu; b++) {
        const q = (aa, bb) => base + aa * (nu + 1) + bb;
        mesh.tri(q(a, b), q(a + 1, b), q(a + 1, b + 1)); mesh.tri(q(a, b), q(a + 1, b + 1), q(a, b + 1));
        // the back side (seen from behind the mill)
        mesh.tri(q(a, b), q(a + 1, b + 1), q(a + 1, b)); mesh.tri(q(a, b), q(a, b + 1), q(a + 1, b + 1));
      }
    } else {
      // furled: a roll of canvas lashed along the whip
      beam(mesh, P(inner + 0.1, 0.16, 0.1), P(L - 0.2, 0.16, 0.1), 0.2, 0.17, CLOTH.map((v) => v * 0.93), { lod, part: 'cloth', bev: 0.06, up: [0, 0, 1] });
      for (let b = 0; b < 4; b++) { const t = inner + 0.6 + b * 1.15; beam(mesh, P(t, 0.03, 0.1), P(t, 0.29, 0.1), 0.04, 0.23, hex(0x8c6c48), { lod: 1, up: [0, 0, 1] }); }
    }
  }
  return mesh;
}

async function main() {
  const out = {};
  for (const [name, fn] of [['mill_lake', buildMill], ['mill_lake_sails', buildSails]]) {
    const lods = [0, 1].map(fn);
    const res = await writeGLB(path.join(ROOT, 'assets/models/sculpt', name + '.glb'), name, lods, PARTS, { family: 'mill', hub: HUB });
    const b = lods[0].bounds();
    writeFragment(name, {
      size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]], tris: res.tris, parts: PARTS, source: 'tools/sculpt/assets/mill_lake.mjs (facet kit, rock_facet.mjs)',
      notes: name === 'mill_lake'
        ? `The lake tower mill (static): coursed limestone blocks on the batter, footing, cornice, door / windows with timber frames, timber curb, flared fish-scale slate roof, windshaft housing, tail pole and winding wheel. Vertex colour only (linear). Hub of the sails at [${HUB.join(', ')}]. LOD tris ${res.tris.join(' / ')}.`
        : `The lake mill's sails (they turn about local z; origin = hub): canister, four whips with lattice and canvas (one furled). Vertex colour only. LOD tris ${res.tris.join(' / ')}.`,
    });
    console.log(name.padEnd(16), 'tris', res.tris.join(' / '), res.kb, 'KB');
    out[name] = lods;
  }
  // preview: the mill with its sails at the hub
  const both = (l) => { const m = new Mesh(); m.append(out.mill_lake[l]); const s = out.mill_lake_sails[l]; for (let i = 0; i < s.nv; i++) m.v([s.pos[i * 3] + HUB[0], s.pos[i * 3 + 1] + HUB[1], s.pos[i * 3 + 2] + HUB[2]], [s.nrm[i * 3], s.nrm[i * 3 + 1], s.nrm[i * 3 + 2]], [s.col[i * 3], s.col[i * 3 + 1], s.col[i * 3 + 2]].map((v) => Math.pow(v, 1 / 2.2)).map(toLin), s.part[i]); const o = m.nv - s.nv; for (const i of s.idx) m.idx.push(i + o); return m; };
  const m0 = both(0), m1 = both(1);
  await previewSheet(path.join(ROOT, '.tmp/sculpt/mill_lake/sheet.png'), 'LAKE MILL - FACET KIT', [
    { mesh: m0, az: 20, el: 10, label: 'LOD0 front' }, { mesh: m0, az: 140, el: 15, label: 'back' }, { mesh: m1, az: 20, el: 10, label: 'LOD1' },
    { mesh: m0, az: 300, el: 25, label: 'three-quarter' }, { mesh: out.mill_lake[0], az: 10, el: 5, label: 'door', zoom: 0.4 }, { mesh: m0, az: 60, el: 40, label: 'roof', zoom: 0.6 },
  ], { cols: 3, ts: 360 });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
