// Dry-stone wall segment (round art-stone, 2026-11-24): 2.4 m of countryside wall laid stone by stone, for the flora
// species `drywall` (instanced along every field wall) and the waysides' sheepfolds.
//
//   node tools/sculpt/assets/wall_drystone.mjs    -> assets/models/sculpt/wall_drystone.glb (+ .manifest.json),
//                                                    sheet .tmp/sculpt/wall_drystone/sheet.png
//
// Build: three courses of through-stones on a battered section (0.62 m thick at the foot, 0.46 m under the cope), each
// course offset so the joints never line up and so that identical segments laid end to end continue the bond (a course
// tiles x from -1.2 + e to 1.2 + e); a cope of stones on edge, leaning, of uneven height, with rounded tops; a dark
// hearting core behind the joints; moss on a few copes. Every stone is a rounded cushion: a bevel ring that rolls into
// the joint (normals turned outward) around a slightly domed face, so a stone reads round and soft from any side at a few
// dozen triangles, with crisp outlines. LOD0 bevel ring, LOD1 domed fan (about the old wall's cost), LOD2 plain faces.
// Origin = centre of the foot line, x along the wall, +z = one face; scale 1 (the game keeps the old 2.4 m step).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, prng, norm, add, mul, sub, toLin, hex, ss, fbm, Mesh, mossCap, planeD, writeGLB, writeFragment, previewSheet } from './rock_facet.mjs';

export const PARTS = {
  stone: { name: 'Rock', surface: 'rock', look: { rim: 0.2, wrap: 0.35 } },
  moss: { name: 'Moss', surface: 'none', look: { rim: 0.3, wrap: 0.5 } },
};
const L = 2.4, HB = 0.75, B = 0.31, TT = 0.23;
const halfT = (y) => B + (TT - B) * Math.min(1, Math.max(0, y / HB));
const BATTER = Math.atan2(B - TT, HB);
// the wall's stone colours (sRGB): warm limestones and grey sandstones, close to the old wall's palette
const STONES = [0xc3bba4, 0xb4ae9b, 0xcdc4ab, 0xaeaa9c, 0xbeb397, 0xa8a598].map(hex);

/**
 * One rounded through-stone: outline polygon `poly` [[x, y], ...] (ccw seen from +z), front / back faces on the batter
 * planes set back by recF / recB, a dome of `dome` m. lod 0: bevel ring `bev` m wide; 1: domed fan; 2: flat fan.
 */
function cushion(mesh, poly, { recF = 0, recB = 0, tiltF = 0, tiltB = 0, col, lod, bev = 0.024, dome = 0.008, part = 'stone' }) {
  const n = poly.length, c = poly.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  const span = Math.max(...poly.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));
  for (const side of [1, -1]) {
    const rec = side > 0 ? recF : recB, tilt = side > 0 ? tiltF : tiltB;
    const zAt = (x, y) => side * (halfT(y) - rec - tilt * (x - c[0]));
    const fn = norm([side * tilt * 0, Math.sin(BATTER), side * Math.cos(BATTER)]);
    const out2 = (p) => { const d = [p[0] - c[0], p[1] - c[1]], l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l, 0]; };
    const shade = (k) => col.map((v) => toLin(Math.min(1, v * k)));
    const C = mesh.v([c[0], c[1], zAt(c[0], c[1]) + side * dome], fn, shade(1.05));
    if (lod === 2) {
      const ids = poly.map((p) => mesh.v([p[0], p[1], zAt(p[0], p[1])], fn, shade(0.92)));
      for (let i = 0; i < n; i++) side > 0 ? mesh.tri(C, ids[i], ids[(i + 1) % n]) : mesh.tri(C, ids[(i + 1) % n], ids[i]);
      continue;
    }
    if (lod === 1) {
      const ids = poly.map((p) => { const o = out2(p); return mesh.v([p[0], p[1], zAt(p[0], p[1]) - side * 0.012], norm(add(fn, mul(o, 0.75))), shade(0.88)); });
      for (let i = 0; i < n; i++) side > 0 ? mesh.tri(C, ids[i], ids[(i + 1) % n]) : mesh.tri(C, ids[(i + 1) % n], ids[i]);
      continue;
    }
    // lod 0: inner ring (face edge, normals half turned) + outer ring rolled into the joint
    const w = Math.min(bev, span * 0.35);
    const inner = poly.map((p) => { const o = out2(p); const q = [p[0] - o[0] * w, p[1] - o[1] * w]; return mesh.v([q[0], q[1], zAt(q[0], q[1])], norm(add(fn, mul(o, 0.42))), shade(0.98)); });
    const outer = poly.map((p) => { const o = out2(p); return mesh.v([p[0], p[1], zAt(p[0], p[1]) - side * w * 1.1], norm(add(mul(fn, 0.45), o)), shade(0.8)); });
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (side > 0) { mesh.tri(C, inner[i], inner[j]); mesh.tri(inner[i], outer[i], outer[j]); mesh.tri(inner[i], outer[j], inner[j]); }
      else { mesh.tri(C, inner[j], inner[i]); mesh.tri(inner[i], outer[j], outer[i]); mesh.tri(inner[i], inner[j], outer[j]); }
    }
  }
}
/** rectangle [x0, x1] x [y0, y1] with `cuts` of its corners chamfered (rounded outline) */
function outline(rnd, x0, x1, y0, y1, cuts) {
  const k = () => Math.min(x1 - x0, y1 - y0) * (0.18 + 0.2 * rnd());
  const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]];
  const out = [];
  corners.forEach(([x, y, sx, sy], i) => {
    if (!cuts.includes(i)) { out.push([x, y]); return; }
    const a = k(), b = k() * (0.8 + 0.4 * rnd());
    // ccw order: arriving along the previous edge, leaving along the next
    if (i === 0) out.push([x, y + b], [x + a, y]);
    else if (i === 1) out.push([x - a, y], [x, y + b]);
    else if (i === 2) out.push([x, y - b], [x - a, y]);
    else out.push([x + a, y], [x, y - b]);
  });
  return out;
}

export function buildWall(lod) {
  const mesh = new Mesh(), rnd = prng(2401);
  const courses = [[0, 0.27, 0.0], [0.27, 0.52, 0.19], [0.52, HB, -0.11]];
  const gap = 0.008;
  courses.forEach(([y0, y1], ci) => {
    const e = courses[ci][2];
    let x = -L / 2 + e;
    const end = L / 2 + e;
    while (x < end - 0.01) {
      let len = (ci === 0 ? 0.42 : 0.32) + rnd() * (ci === 0 ? 0.24 : 0.2);
      if (end - (x + len) < 0.22) len = end - x;                    // no slivers at the end of a course
      const col = STONES[Math.floor(rnd() * STONES.length)].map((v) => v * (0.94 + 0.1 * rnd()));
      const yb = y0 + gap + (rnd() - 0.5) * 0.012, yt = y1 - gap + (rnd() - 0.5) * 0.016;
      // two of the four corners rounded off (a random pair), more on LOD0
      const cuts = lod === 2 ? [] : [0, 1, 2, 3].filter(() => rnd() < 0.55).slice(0, lod === 0 ? 3 : 2);
      const poly = outline(rnd, x + gap, x + len - gap, yb, yt, cuts);
      cushion(mesh, poly, { recF: rnd() * 0.022, recB: rnd() * 0.022, tiltF: (rnd() - 0.5) * 0.05, tiltB: (rnd() - 0.5) * 0.05, col, lod, dome: 0.006 + 0.008 * rnd() });
      x += len;
    }
  });
  // hearting: a dark core behind the joints (front and back only)
  const core = [toLin(0.2), toLin(0.19), toLin(0.17)];
  for (const s of [1, -1]) {
    const z0 = s * (halfT(0) - 0.035), z1 = s * (halfT(HB) - 0.035), n = norm([0, Math.sin(BATTER), s * Math.cos(BATTER)]);
    const a = mesh.v([-L / 2, 0, z0], n, core), b = mesh.v([L / 2, 0, z0], n, core), c = mesh.v([L / 2, HB + 0.02, z1], n, core), d = mesh.v([-L / 2, HB + 0.02, z1], n, core);
    if (s > 0) { mesh.tri(a, b, c); mesh.tri(a, c, d); } else { mesh.tri(a, c, b); mesh.tri(a, d, c); }
  }
  // wall heads: the section closed at both ends (inside a run they sit back to back with the neighbour's and never show;
  // at a gate or the end of a wall they close the hollow), in the stone's shadowed value
  const head = STONES[1].map((v) => toLin(v * 0.62));
  for (const s of [1, -1]) {
    const x = s * L / 2, n = [s, 0, 0];
    const p = [[x, 0, -halfT(0)], [x, 0, halfT(0)], [x, HB, halfT(HB)], [x, HB, -halfT(HB)]].map((q) => mesh.v(q, n, head));
    if (s > 0) { mesh.tri(p[0], p[2], p[1]); mesh.tri(p[0], p[3], p[2]); } else { mesh.tri(p[0], p[1], p[2]); mesh.tri(p[0], p[2], p[3]); }
  }
  // cope: stones on edge across the top, packed, leaning, uneven
  let x = -L / 2 + 0.01;
  const copes = [];
  while (x < L / 2 - 0.04) {
    const t = Math.min(L / 2 - x, 0.09 + rnd() * 0.06), h = 0.17 + rnd() * 0.1, lean = (rnd() - 0.5) * 0.14;
    const col = STONES[Math.floor(rnd() * STONES.length)].map((v) => v * (0.88 + 0.1 * rnd()));
    copes.push({ x0: x, x1: x + t - 0.006, h, lean, col });
    x += t;
  }
  const hw = TT + 0.025;
  for (const cp of copes) {
    // the cope's end face (seen from either side of the wall): a slab with a rounded top, extruded across the wall
    const seg = lod === 0 ? 4 : lod === 1 ? 2 : 1;
    const prof = [];                                 // profile in (u across the wall, v up), u from -hw to hw
    prof.push([-hw, 0]);
    for (let i = 0; i <= seg; i++) { const a = Math.PI * (1 - i / seg); prof.push([Math.cos(a) * hw, cp.h - 0.06 + Math.sin(a) * 0.06 * (lod === 2 ? 0 : 1)]); }
    prof.push([hw, 0]);
    const lx = (v) => v * cp.lean;
    const P = (xx, u, v) => [xx + lx(v), HB - 0.02 + v, u];
    // top + rounded shoulders: quads along x between the two big faces; end faces at u = +-hw
    for (let i = 1; i < prof.length - 2; i++) {
      const [u0, v0] = prof[i], [u1, v1] = prof[i + 1];
      const nn = norm([0, u1 - u0, -(v1 - v0)]);
      const nA = norm(add(nn, [0, 0, u0 / hw * 0.6])), nB = norm(add(nn, [0, 0, u1 / hw * 0.6]));
      const sh = (u) => cp.col.map((v) => toLin(v * (0.9 + 0.1 * (1 - Math.abs(u) / hw))));
      const a = mesh.v(P(cp.x0, u0, v0), nA, sh(u0)), b = mesh.v(P(cp.x1, u0, v0), nA, sh(u0)), c = mesh.v(P(cp.x1, u1, v1), nB, sh(u1)), d = mesh.v(P(cp.x0, u1, v1), nB, sh(u1));
      mesh.tri(a, c, b); mesh.tri(a, d, c);
    }
    for (const s of [1, -1]) {        // the two end faces of the cope (across-wall ends), fanned
      const u = s * hw, nE = norm([0, 0.15, s]);
      const vE = cp.h - 0.06;
      const ids = [mesh.v(P(cp.x0, u, 0.02), nE, cp.col.map((v) => toLin(v * 0.85))), mesh.v(P(cp.x1, u, 0.02), nE, cp.col.map((v) => toLin(v * 0.85))), mesh.v(P(cp.x1, u, vE), nE, cp.col.map(toLin)), mesh.v(P(cp.x0, u, vE), nE, cp.col.map(toLin))];
      if (s > 0) { mesh.tri(ids[0], ids[1], ids[2]); mesh.tri(ids[0], ids[2], ids[3]); } else { mesh.tri(ids[0], ids[2], ids[1]); mesh.tri(ids[0], ids[3], ids[2]); }
    }
    // the big faces: only the part that stands above its neighbours shows; a quad from mid height to the top
    if (lod === 0) for (const s of [1, -1]) {
      const xx = s > 0 ? cp.x1 : cp.x0, nS = norm([s, 0.2, 0]);
      const v0 = cp.h * 0.45, v1 = cp.h - 0.04;
      const ids = [[-hw * 0.97, v0], [hw * 0.97, v0], [hw * 0.8, v1], [-hw * 0.8, v1]].map(([u, v]) => mesh.v(P(xx, u, v), nS, cp.col.map((q) => toLin(q * 0.82))));
      if (s > 0) { mesh.tri(ids[0], ids[2], ids[1]); mesh.tri(ids[0], ids[3], ids[2]); } else { mesh.tri(ids[0], ids[1], ids[2]); mesh.tri(ids[0], ids[2], ids[3]); }
    }
  }
  // moss: two soft cushions draped over the cope, on the damp side
  // the copes as convex pieces (flat tops at their own heights) for the moss to lie on
  const top = () => copes.map((cp) => [planeD([0, 1, 0], HB - 0.02 + cp.h - 0.01), planeD([0, 0, 1], hw), planeD([0, 0, -1], hw), planeD([1, 0, 0], cp.x1 + 0.004), planeD([-1, 0, 0], -cp.x0 + 0.004)]);
  if (lod < 2) {
    mossCap(mesh, top(), { at: [-0.5, -0.05], R: 0.22, T: 0.045, seed: 51, rings: lod === 0 ? 3 : 1, segs: lod === 0 ? 10 : 7, maxSlope: 3, lip: 0.06 });
    mossCap(mesh, top(), { at: [0.62, 0.04], R: 0.16, T: 0.04, seed: 53, rings: lod === 0 ? 3 : 1, segs: lod === 0 ? 9 : 6, maxSlope: 3, lip: 0.05 });
  }
  return mesh;
}

async function main() {
  const lods = [0, 1, 2].map(buildWall), name = 'wall_drystone';
  const res = await writeGLB(path.join(ROOT, 'assets/models/sculpt', name + '.glb'), name, lods, PARTS, { family: 'wall', step: L });
  const b = lods[0].bounds();
  writeFragment(name, {
    size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]], tris: res.tris, parts: PARTS, source: 'tools/sculpt/assets/wall_drystone.mjs (facet kit, rock_facet.mjs)',
    notes: `2.4 m dry-stone wall segment: three offset courses of rounded through-stones (bevel ring + dome), leaning cope on edge, dark hearting, moss on the cope (Moss_none). Courses tile end to end. Vertex colour only (linear). LOD tris ${res.tris.join(' / ')}.`,
  });
  console.log(name, 'tris', res.tris.join(' / '), res.kb, 'KB');
  const items = [];
  for (const [i, m] of lods.entries()) items.push({ mesh: m, az: 25, el: 14, label: 'L' + i + ' ' + res.tris[i], zoom: 0.8 }, { mesh: m, az: 160, el: 30, label: 'back', zoom: 0.8 });
  items.push({ mesh: lods[0], az: 60, el: 8, label: 'L0 wire', wire: true, zoom: 0.55 }, { mesh: lods[0], az: 90, el: 4, label: 'along', zoom: 1.3 });
  await previewSheet(path.join(ROOT, '.tmp/sculpt/wall_drystone/sheet.png'), 'DRY-STONE WALL - FACET KIT', items, { cols: 4, ts: 300 });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
