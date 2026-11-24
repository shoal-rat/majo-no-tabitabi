// The rubble heap of the rubble puzzles (gameplay/wilds-puzzles.js kind 'rubble'): a rockfall of split, angular blocks
// piled over the chest — a ring of big blocks sunk in the ground and leaning in, two or three wedged on top, slabs on
// edge, talus chips at the foot. Facet kit (rock_facet.mjs): every stone an exact convex piece with bevelled edges; the
// fresh fracture faces paler than the weathered skin; moss only on the oldest low blocks. Neutral stone (~#9b9b9b) so the
// game tints it per site (pass grey, quarry sandstone, aqueduct limestone). Origin = ground centre (the chest).
// Same footprint as the old heap (~3.6 m across, ~1.9 m tall; the collider r 1.6 m / 1.9 m stays in the game).
import { Mesh, prng, fbm, norm, add, mul, dot, ss, planeD, bevelPiece, emitPiece, hullPlanes, stonePaint, mossCap, FLOOR } from './props_activity_lib.mjs';

export const PARTS = {
  stone: { name: 'Rubble', surface: 'rock', look: { rim: 0.22, wrap: 0.3 } },
  moss: { name: 'Moss', surface: 'none', look: { rim: 0.3, wrap: 0.5 } },
};

/** rotate a direction by yaw (Y) then pitch about the local X */
const rot = (v, yaw, pitch, roll = 0) => {
  let [x, y, z] = v;
  [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
  [x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)];
  [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
  return [x, y, z];
};
/** a split stone: hull planes of an ellipsoid (half sizes s) turned and placed at c; `fresh` planes = fracture faces */
function stone(rnd, { s, c, yaw = 0, pitch = 0, roll = 0, count = 9, fresh = 2, floor = null }) {
  const local = hullPlanes(rnd, { size: s, count, cut: [0.8, 1], tilt: 0.5, noUnder: false });
  // a few big flat cuts: the faces it split along (crisp, paler)
  for (let k = 0; k < fresh; k++) {
    const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * 0.9, n = norm([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]);
    const sup = Math.hypot(s[0] * n[0], s[1] * n[1], s[2] * n[2]);
    local.push(planeD(n, sup * (0.55 + rnd() * 0.2), 'fresh'));
  }
  const pl = local.map((p) => { const n = rot(p.n, yaw, pitch, roll); return { ...p, n, d: p.d + dot(n, c) }; });
  if (floor !== null) pl.push(FLOOR(floor));
  return pl;
}

// per LOD: bevel widths (edge, fresh), talus count, corner facets, moss detail
const L = [
  { edge: 0.035, fresh: 0.014, talus: 12, corners: true, minAngle: 0.2, moss: { rings: 4, segs: 14 } },
  { edge: 0.045, fresh: 0, talus: 6, corners: false, minAngle: 0.45, moss: { rings: 2, segs: 9 } },
  { edge: 0, fresh: 0, talus: 0, corners: false, minAngle: 0.5, moss: null },
];

function buildLod(lod) {
  const o = L[lod], m = new Mesh(), rnd = prng(4417);
  const stones = [];
  // the ring of big blocks, sunk and leaning in over the chest
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + (rnd() - 0.5) * 0.4, d = 0.95 + rnd() * 0.35;
    const w = 0.55 + rnd() * 0.25, h = 0.45 + rnd() * 0.3, dep = 0.45 + rnd() * 0.2;
    stones.push({ pl: stone(rnd, { s: [w, h, dep], c: [Math.sin(a) * d, h * 0.55, Math.cos(a) * d], yaw: a + (rnd() - 0.5) * 0.8, pitch: -0.25 - rnd() * 0.25, roll: (rnd() - 0.5) * 0.3, count: 10, fresh: 2, floor: -0.05 }), mossy: k === 1 || k === 4, H: h * 2, cx: Math.sin(a) * d * 1.1, cz: Math.cos(a) * d * 1.1 });
  }
  // wedged on top: the keystones of the heap
  for (let k = 0; k < 3; k++) {
    const a = k * 2.2 + 0.4, d = k === 0 ? 0.1 : 0.55;
    const w = 0.5 + rnd() * 0.2, h = 0.35 + rnd() * 0.15, dep = 0.42 + rnd() * 0.15;
    stones.push({ pl: stone(rnd, { s: [w, h, dep], c: [Math.sin(a) * d, (k === 0 ? 1.4 : 1.05) + rnd() * 0.1, Math.cos(a) * d], yaw: rnd() * 6.28, pitch: (rnd() - 0.5) * 0.6, roll: (rnd() - 0.5) * 0.6, count: 9, fresh: 2 }), H: h * 2 });
  }
  // a slab on edge against the heap
  stones.push({ pl: stone(rnd, { s: [0.55, 0.6, 0.16], c: [1.55, 0.5, -0.5], yaw: 1.2, pitch: 0, roll: -0.35, count: 8, fresh: 1, floor: -0.05 }), H: 1.2 });
  // talus chips at the foot
  for (let k = 0; k < o.talus; k++) {
    const a = k * 2.399 + 0.3, d = 1.55 + (k % 4) * 0.16 + rnd() * 0.1, sz = 0.12 + (k % 3) * 0.07;
    stones.push({ pl: stone(rnd, { s: [sz * 1.2, sz * 0.7, sz], c: [Math.sin(a) * d, sz * 0.4, Math.cos(a) * d], yaw: rnd() * 6.28, pitch: (rnd() - 0.5) * 0.5, count: 7, fresh: 1, floor: -0.02 }), H: sz, chip: true });
  }
  if (lod === 2) stones.splice(11);   // far: no talus, the heap's mass only
  for (const [i, s] of stones.entries()) {
    const width = (e) => {
      if (e.ka === 'floor' || e.kb === 'floor') return 0;
      const fresh = e.ka === 'fresh' || e.kb === 'fresh';
      if (e.corner) return lod === 0 && !s.chip ? o.edge * 0.7 : 0;
      if (fresh) return o.fresh;
      if (lod === 1 && e.angle < 0.6) return 0;
      return s.chip ? o.edge * 0.45 : o.edge;
    };
    const pc = bevelPiece(s.pl, width, { corners: o.corners && !s.chip, minAngle: o.minAngle });
    const base = stonePaint({ H: s.H, seed: 11 + i, warm: 0.35 });
    emitPiece(m, pc, (c) => {
      const v = base(c);
      // fracture faces: paler, cooler, no weathering drift
      if (c.kind === 'fresh') return [v[0] * 1.1, v[1] * 1.12, v[2] * 1.14];
      // the skin on top catches lichen-pale bloom, the underside stays damp
      const k = 1 + 0.05 * ss(0.4, 0.9, c.n[1]) * fbm(c.p[0] * 5, c.p[1] * 5, c.p[2] * 5, i, 2);
      return [v[0] * k, v[1] * k, v[2] * k];
    }, { part: 'stone', tag: i });
    s.pc = pc;
  }
  if (o.moss) for (const [i, s] of stones.entries()) {
    if (!s.mossy) continue;
    const pcs = [s.pl];
    // find the top centre: sample a small grid for the highest top
    let best = null;
    for (let gx = -0.6; gx <= 0.6; gx += 0.1) for (let gz = -0.6; gz <= 0.6; gz += 0.1) {
      const cx = s.cx + gx, cz = s.cz + gz;
      let lo = -1e9, hi = 1e9;
      for (const p of s.pl) {
        const a = p.n[1], b = p.d - p.n[0] * cx - p.n[2] * cz;
        if (Math.abs(a) < 1e-9) { if (b < 0) { hi = -1e9; break; } continue; }
        if (a > 0) hi = Math.min(hi, b / a); else lo = Math.max(lo, b / a);
      }
      if (lo <= hi && hi < 1e8 && (!best || hi > best.y)) best = { x: cx, z: cz, y: hi };
    }
    if (best) mossCap(m, pcs, { at: [best.x, best.z], R: 0.26, T: 0.035, seed: 5 + i, ...o.moss, part: 'moss' });
  }
  return m;
}

export default {
  name: 'rubble_heap', parts: PARTS, lods: 3, views: [[30, 20], [200, 35]],
  notes: 'Rubble heap for the rubble puzzles (gameplay/wilds-puzzles.js): a rockfall of split angular blocks built from exact planes (facet kit), bevelled weathered edges, paler fracture faces, talus chips, moss on the oldest low blocks. Neutral stone ~#9b9b9b (the game tints it per site). Origin = ground centre (the chest), ~3.6 m across, ~1.9 m tall.',
  build: buildLod,
};
