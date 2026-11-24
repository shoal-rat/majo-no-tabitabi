// Landmarks of the open countryside (map round, 2026-11-22): the built pieces of src/data/landmarks.js.
// Every landmark is one Site (baked into a few meshes, far LOD by structures.js). Far versions stop at a distance that
// follows the scale (small 320 m, medium 1100 m, large: never) so the far tier stays a handful of draws.
// Rock set pieces (tors, crag falls, quarry face, tarn rim) are built by world/landforms/setpieces.js and the plants
// (giant tree, flower valley, dead wood, rockfalls) by the flora countryside planting; their builders here only add the
// made things around them (a stone ring, a crane, a bench...).
// Style: the anime's European countryside — limestone and granite, lime-washed plaster, red tile and grey slate,
// thatch, weathered timber. Nothing is placed on a road or near a story anchor (the data keeps them clear).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../../core/game.js';
import { toon } from '../../core/mats.js';
import { box, cyl, cone, torus, sphere } from '../../core/geo.js';
import { mulberry32 } from '../../core/util.js';
import { Site, mat, M, beam, rod, bevelBox, sculptVcMat } from './kit.js';
import { sculptGroup, sculptAsset } from './sculpt.js';
import { LANDMARKS } from '../../data/landmarks.js';
import { siteRock, rockLod, familyParts, siteRockMats, pieces } from '../rock-family.js';

// ---------------------------------------------------------------- materials (shared by every landmark)
const ST = {
  lime: mat.stone(0xbab29c), grey: mat.stone(0xa5a199), sand: mat.stone(0xc8b090), dark: mat.stone(0x7f7a71),
  mossy: mat.stone(0x98a084), old: mat.stone(0x9e978a), white: mat.stone(0xe6e1d4),
};
const WD = { wood: mat.wood(0x7d5e44), dark: mat.wood(0x4f3f31), old: mat.wood(0x8e7c66), light: mat.wood(0xa58660), bark: mat.wood(0x6e5843) };
const RF = { tile: mat.tile(0xb9634b), tileDark: mat.tile(0x94503f), slate: mat.tile(0x60707c), thatch: mat.thatch(0xc6a464), moss: mat.tile(0x7d8a5c) };
const plaster = mat.plaster(0xece2c9), plasterWarm = mat.plaster(0xe6cfa9), glass = mat.paint(0x3f4b56), iron = mat.metal(0x3d3b3a);
const red = mat.paint(0xb5473d), cream = mat.paint(0xf1eadb), straw = mat.thatch(0xd6b768), canvas = mat.cloth(0xe3d6b4);
const ivy = mat.paint(0x5f8a46), earth = mat.paint(0x6a5844), ember = mat.paint(0x40302a);
let lamp = null;

// ---------------------------------------------------------------- sculpted pieces (tools/sculpt/assets/lm_*.mjs)
// Vertex-coloured LODs with no textures, merged into the site's own baked meshes (builders/sculpt.js sculptGroup): the
// stone and stone slates into one smooth stone family, wood, straw, iron and offerings into theirs, so a sculpted
// landmark adds no draw call. Detail follows the quality tier. ?sculpt=0 (G.sculpt.enabled false) or a missing asset
// builds the first round's primitives instead.
// smooth stone whose painted surface layer is kept low: the sculpt's own form and vertex colour carry the detail
const CARVED = toon(0xffffff, { surface: 'stone', look: { detail: 0.45, bump: 0.5 } });
const SCULPT_MAT = (n) => (/^(Limestone|Sandstone|Slate|Stone)/.test(n) ? CARVED : /^Wood/.test(n) ? WD.wood : /^Straw/.test(n) ? M.straw()
  : /^Iron/.test(n) ? iron : /^Moss/.test(n) ? ivy : cream);
/** 0 = full detail (high), 1 = med, 2 = low / phones */
const lmTier = () => { const q = G.quality || {}; return q.mobile || q.name === 'low' ? 2 : q.name === 'med' ? 1 : 0; };
// The kit's COLOR_0 is linear albedo x its baked AO / cavity, which leaves a piece darker than the site surfaces it
// stands among (those carry the game's own vertex shading instead). The pieces are lifted once here, in linear and
// with the hue kept (core/assets.js's sRGB re-encode for the SCULPT_TYPES ids would also pale and grey them).
const LIFT = 1.45;
const _colourFixed = new Set();
function fixColours(id, raw) {
  if (_colourFixed.has(id) || G.sculpt?.typeOf?.(id)) return;
  _colourFixed.add(id);
  const done = new Set();
  raw.scene.traverse((o) => {
    const c = o.isMesh && o.geometry?.attributes?.color;
    if (!c || done.has(c)) return;
    done.add(c);
    for (let i = 0; i < c.count; i++) {
      const r = c.getX(i), g = c.getY(i), b = c.getZ(i), k = Math.min(LIFT, 0.97 / Math.max(r, g, b, 1e-3));
      c.setXYZ(i, r * k, g * k, b * k);
    }
  });
}
/** a placeable group of sculpted piece `id` at LOD `lod` (clamped to what the asset has), or null (old primitives) */
function piece(id, lod) {
  if (G.sculpt?.enabled === false) return null;
  const raw = G.assets?.raw?.(id);
  if (!raw) return null;
  fixColours(id, raw);
  const A = sculptAsset(id);
  return sculptGroup(id, Math.min(lod, (A?.lods.length || 1) - 1), SCULPT_MAT, { hero: false });
}
/** place piece `id` with its origin at local (x, y, z), Euler (rx, ry, rz), scale (sx, sy, sz); false when missing */
function put(site, id, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1, lod = lmTier()) {
  const g = piece(id, lod);
  if (!g) return false;
  g.position.set(x, y, z); g.rotation.set(rx, ry, rz); g.scale.set(sx, sy, sz);
  site.add(g);
  return true;
}
/** full size [x, y, z] of a piece's LOD0 */
const sizeOf = (id) => { const b = sculptAsset(id)?.box; return b ? [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z] : [1, 1, 1]; };
/** a standing stone (lm_standing_a|b) laid on its side: centred on (x, y, z), length `len` along local x, heading ry */
function putLying(site, id, x, y, z, ry, len, hgt, dep, tilt = 0) {
  const g = piece(id, lmTier());
  if (!g) return false;
  const [w, H, d] = sizeOf(id), sy = len / H;
  g.scale.set(hgt / w, sy, dep / d); g.position.set(0, -H * sy / 2, 0);
  const holder = new THREE.Group(); holder.add(g);
  holder.position.set(x, y, z); holder.rotation.set(0, ry, Math.PI / 2 + tilt);
  site.add(holder);
  return true;
}
const UPRIGHT = 'sculpt_lm_upright', LINTEL = 'sculpt_lm_lintel', STAND = ['sculpt_lm_standing_a', 'sculpt_lm_standing_b'];
/** a standing stone whose foot is at local (x, g, z), `h` tall from the foot (the old box's base and height) */
function putStanding(site, k, x, g, z, w, h, d, ry, rx, rz) {
  const id = STAND[k & 1], [sw, sh, sd] = sizeOf(id);
  return put(site, id, x, g, z, ry, rx, rz, w / sw, h / sh, d / sd);
}

const rockGeo = new THREE.DodecahedronGeometry(1, 0);
function add(site, mesh, rx = 0, rz = 0) { mesh.rotation.x += rx; mesh.rotation.z += rz; return site.add(mesh); }
function B(site, w, h, d, m, x, y, z, ry = 0, rx = 0, rz = 0) { const o = box(w, h, d, m, x, y, z); o.rotation.set(rx, ry, rz); return site.add(o); }
function stone(site, x, y, z, sx, sy, sz, m, ry = 0, rx = 0, rz = 0) {
  const o = new THREE.Mesh(rockGeo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
  o.castShadow = o.receiveShadow = true; return site.add(o);
}
/** gable end (triangle) as an extruded shape, apex up, in the local x/y plane at z, thickness t */
function gableEnd(site, w, h, t, m, x, y, z, ry = 0) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }); g.translate(0, 0, -t / 2);
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; return site.add(o);
}
/** a pitched roof (two slabs) over a w x d footprint, ridge along local z, eaves at y */
function pitched(site, w, d, rise, m, x, y, z, ry = 0, over = 0.45, t = 0.16) {
  const half = w / 2 + over, len = Math.hypot(half, rise), a = Math.atan2(rise, half);
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
  for (const s of [-1, 1]) {
    const slab = box(len + 0.1, t, d + over * 2, m, s * half / 2, rise / 2, 0); slab.rotation.z = -s * a; g.add(slab);
  }
  g.add(box(0.22, 0.2, d + over * 2 + 0.05, m, 0, rise + 0.05, 0));
  return site.add(g);
}
// ---------------------------------------------------------------- built pieces (map round 2: real joinery and masonry)
// Every piece is its own mesh, so the baked vertex shading gives each stone, board and tile row its own tone. Counts
// follow the quality tier (lmTier): 0 everything, 1 no rafter tails / flower boxes, 2 plain plinth, fewer rows.
/** a board / beam lying on a wall face: centre (x, y, z), length along its own x, `hgt` up the wall, `th` proud; the
 *  face it lies on looks along heading ry (0 = +z); rz turns it in the wall plane (braces); top edges chamfered */
function plank(g, m, x, y, z, len, hgt, th, ry = 0, rz = 0, b = 0.018) {
  const o = bevelBox(len, th, hgt, m, x, y, z, b);
  o.rotation.set(Math.PI / 2, ry, rz, 'YZX');
  g.add(o);
  return o;
}
/** a dressed stone (top edges chamfered) */
function block(g, m, x, y, z, w, h, d, ry = 0, b = 0.03) { const o = bevelBox(w, h, d, m, x, y, z, b); o.rotation.y = ry; g.add(o); return o; }
/** wall faces of a w x d footprint: [heading, half-length along the face, distance of the face from the centre] */
const faces = (w, d) => [[0, w / 2, d / 2], [Math.PI, w / 2, d / 2], [Math.PI / 2, d / 2, w / 2], [-Math.PI / 2, d / 2, w / 2]];
/** point on face (heading a, distance f from the centre) at u along the face, `out` in front of it */
const onFace = (a, f, u, out = 0) => [Math.sin(a) * (f + out) + Math.cos(a) * u, Math.cos(a) * (f + out) - Math.sin(a) * u];
const isWood = (m) => m?.userData?.surface === 'wood';

/** the plinth's top course: dressed stones round the footprint (w x d), top at gy */
function plinthStones(g, w, d, gy, m, seed) {
  const r = mulberry32(seed * 7 + 3), h = 0.3;
  for (const [a, half, f] of faces(w, d)) {
    let u = -half + (a === 0 || a === Math.PI ? 0 : 0.3);
    const end = half - (a === 0 || a === Math.PI ? 0 : 0.3);
    while (u < end - 0.05) {
      const l = Math.min(end - u, 0.45 + r() * 0.5), [px, pz] = onFace(a, f, u + l / 2, -0.15);
      block(g, m, px, gy - h / 2 + 0.01, pz, l - 0.03, h * (0.92 + r() * 0.08), 0.32, a, 0.035);
      u += l;
    }
  }
}
/** dressed corner stones up a wall, alternating long and short along each face */
function quoins(g, w, d, gy, wallH, m) {
  const hq = 0.3, n = Math.floor(wallH / hq);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 0; k < n; k++) {
    const long = (k + (sx * sz > 0 ? 0 : 1)) % 2 === 0, y = gy + k * hq + hq / 2;
    const lx = long ? 0.55 : 0.3, lz = long ? 0.3 : 0.55;
    block(g, m, sx * (w / 2 - lx / 2 + 0.03), y, sz * (d / 2 - lz / 2 + 0.03), lx, hq - 0.025, lz, 0, 0.025);
  }
}
/** half-timbering on all four walls: sill, wall plate, posts, a mid rail and braces in the end bays */
function halfTimber(g, w, d, gy, wallH, T) {
  const m = WD.dark, t = 0.07, b = 0.17;
  for (const [a, half, f] of faces(w, d)) {
    const front = a === 0 || a === Math.PI, at = (u, y, len, hgt, rz = 0) => { const [px, pz] = onFace(a, f, u, t / 2 - 0.012); plank(g, m, px, y, pz, len, hgt, t, a, rz); };
    at(0, gy + b / 2, 2 * half, b);                         // sill beam
    at(0, gy + wallH - b / 2, 2 * half, b);                 // wall plate
    const bays = front ? 4 : 2, mid = gy + wallH * 0.52;
    for (let k = 0; k <= bays; k++) at(-half + (2 * half * k) / bays + (k === 0 ? b / 2 : k === bays ? -b / 2 : 0), gy + wallH / 2, wallH, b * 0.9, Math.PI / 2);
    at(0, mid, 2 * half - 0.1, b * 0.85);                   // mid rail
    if (T < 2) for (const s of [-1, 1]) {                   // braces from the sill to the rail in the end bays
      const bw = (2 * half) / bays, u0 = s * (half - b), u1 = s * (half - bw + b * 0.6), y0 = gy + b, y1 = mid;
      at((u0 + u1) / 2, (y0 + y1) / 2, Math.hypot(u1 - u0, y1 - y0), b * 0.75, Math.atan2(y1 - y0, u1 - u0));
    }
  }
}
/** board-and-batten: battens proud on every wall of a timber barn / shed */
function battens(g, w, d, gy, wallH, m, T) {
  const step = T < 2 ? 0.34 : 0.68;
  for (const [a, half, f] of faces(w, d)) for (let u = -half + step / 2; u < half; u += step) {
    const [px, pz] = onFace(a, f, u, 0.02);
    plank(g, m, px, gy + wallH / 2, pz, wallH, 0.07, 0.035, a, Math.PI / 2, 0.012);
  }
}
/**
 * Tiled / slated roof over a w x d body, ridge along x, eave at y = ey: a deck slab per side, then real courses (each
 * row laid a little flatter than the slope, so its lower edge stands proud), half-round ridge tiles, barge boards and a
 * fascia. Thatch: a thick coat with a rolled eave and ridge instead of courses.
 */
function roofOver(g, w, d, rise, ey, m, T) {
  const half = d / 2 + 0.5, len = Math.hypot(half, rise) + 0.1, a = Math.atan2(rise, half), L = w + 0.9;
  const thatch = m.userData?.surface === 'thatch', slate = m === RF.slate;
  const deckT = thatch ? 0.32 : 0.12;
  for (const s of [-1, 1]) {
    const deck = box(L, deckT, len, m, 0, ey + rise / 2, s * half / 2); deck.rotation.x = s * a; g.add(deck);
    if (thatch) {
      // the rolled eave and a stepped course line half way up
      const eave = cyl(0.2, 0.2, L + 0.05, m, 0, ey - 0.02, s * (half + 0.02), 8); eave.rotation.z = Math.PI / 2; g.add(eave);
      const c2 = box(L + 0.04, 0.12, len * 0.45, m, 0, 0, 0);
      c2.position.set(0, ey + rise * 0.3 + Math.cos(a) * (deckT / 2 + 0.05), s * (half * 0.7 + Math.sin(a) * 0.05)); c2.rotation.x = s * a; g.add(c2);
      continue;
    }
    const exp = slate ? 0.24 : 0.34, n = Math.max(3, Math.round(len / exp / (T === 2 ? 2 : 1))), step = len / n, t = 0.05;
    for (let k = 0; k < n; k++) {
      // row k from the eave: centre along the slope (from the ridge) and out of the deck
      const u = len - (k + 0.5) * step, lay = step * 1.35, out = deckT / 2 + t / 2 + 0.005;
      const row = box(L + (k % 2 ? 0.04 : 0), t, lay, m, 0, 0, 0);
      const cy = ey + rise - Math.sin(a) * u + Math.cos(a) * out, cz = s * (Math.cos(a) * u + Math.sin(a) * out);
      row.position.set(0, cy, cz); row.rotation.x = s * (a - t * 0.9 / lay); g.add(row);
    }
  }
  if (thatch) { const rg = cyl(0.26, 0.26, L + 0.1, m, 0, ey + rise + 0.06, 0, 8); rg.rotation.z = Math.PI / 2; g.add(rg); }
  else if (T < 2) {
    const n = Math.max(3, Math.round(L / 0.42));
    for (let k = 0; k < n; k++) { const rt = cyl(0.12, 0.12, L / n - 0.015, m, -L / 2 + (k + 0.5) * L / n, ey + rise + 0.1, 0, 8); rt.rotation.z = Math.PI / 2; g.add(rt); }
  } else g.add(box(L + 0.05, 0.22, 0.26, m, 0, ey + rise + 0.06, 0));
  // barge boards up the verges and a fascia along each eave
  for (const sx of [-1, 1]) for (const s of [-1, 1]) g.add(beam(sx * (L / 2 + 0.03), ey - 0.06, s * (half + 0.02), sx * (L / 2 + 0.03), ey + rise - 0.02, 0, 0.06, 0.2, WD.dark));
  if (!thatch) for (const s of [-1, 1]) g.add(box(L, 0.16, 0.05, WD.dark, 0, ey - 0.1, s * (half + 0.06)));
  // rafter tails under the eaves
  if (T === 0 && !thatch) for (const s of [-1, 1]) for (let xx = -w / 2 + 0.3; xx <= w / 2 - 0.2; xx += 0.6) {
    const rt = box(0.08, 0.11, 0.55, WD.dark, xx, ey + rise * (0.23 / half) - (deckT / 2 + 0.055) / Math.cos(a), s * (half - 0.23)); rt.rotation.x = s * a; g.add(rt);
  }
}
/** a window on a wall face: casing, glass set back, glazing bars, sill; shutters (open) on the front */
function windowOn(g, cx, cy, fz, ww, wh, shutters, flowers, T) {
  const cas = WD.wood, tb = 0.09;
  g.add(box(ww, wh, 0.06, glass, cx, cy, fz + 0.01));
  for (const s of [-1, 1]) plank(g, cas, cx + s * (ww / 2 + tb / 2), cy, fz + 0.035, wh + tb * 2, tb, 0.07, 0, Math.PI / 2);
  plank(g, cas, cx, cy + wh / 2 + tb / 2, fz + 0.035, ww + tb * 2, tb, 0.07);
  if (T < 2) { g.add(box(0.035, wh, 0.03, cas, cx, cy, fz + 0.05)); g.add(box(ww, 0.035, 0.03, cas, cx, cy + wh * 0.08, fz + 0.05)); }
  block(g, ST.lime, cx, cy - wh / 2 - 0.05, fz + 0.07, ww + 0.3, 0.09, 0.2, 0, 0.02);       // stone sill
  if (shutters) for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(cx + s * (ww / 2 + tb), cy, fz + 0.06); sh.rotation.y = -s * 0.35; g.add(sh);
    const sw = ww / 2 + 0.06, nb = 3;
    for (let k = 0; k < nb; k++) sh.add(box(sw / nb - 0.012, wh + 0.12, 0.04, red, s * (sw * (k + 0.5) / nb), 0, 0));
    if (T < 2) for (const hy of [-0.32, 0.32]) sh.add(box(sw, 0.08, 0.03, red, s * sw / 2, hy * wh, 0.035));
  }
  if (flowers && T === 0) {
    g.add(box(ww + 0.1, 0.18, 0.2, WD.wood, cx, cy - wh / 2 - 0.2, fz + 0.18));
    for (let k = 0; k < 5; k++) g.add(sphere(0.09, k % 2 ? red : ivy, cx - ww / 2 + 0.05 + k * (ww - 0.1) / 4, cy - wh / 2 - 0.08, fz + 0.19, 6, 4));
  }
}
/** a plank door with frame, strap hinges, latch and a step stone */
function doorOn(g, cx, gy, fz, dw = 1.0, dh = 2.0, T = 0) {
  const nb = 4;
  for (let k = 0; k < nb; k++) g.add(box(dw / nb - 0.012, dh, 0.06, WD.dark, cx - dw / 2 + (k + 0.5) * dw / nb, gy + dh / 2, fz + 0.02));
  for (const s of [-1, 1]) plank(g, WD.wood, cx + s * (dw / 2 + 0.06), gy + dh / 2 + 0.04, fz + 0.04, dh + 0.1, 0.12, 0.08, 0, Math.PI / 2);
  plank(g, WD.wood, cx, gy + dh + 0.1, fz + 0.05, dw + 0.36, 0.16, 0.1);
  if (T < 2) { for (const hy of [0.3, dh - 0.3]) g.add(box(dw * 0.6, 0.05, 0.02, iron, cx - dw * 0.18, gy + hy, fz + 0.06)); g.add(box(0.05, 0.14, 0.04, iron, cx + dw * 0.33, gy + dh * 0.5, fz + 0.07)); }
  block(g, ST.grey, cx, gy - 0.07, fz + 0.3, dw + 0.4, 0.16, 0.55, 0, 0.03);
}
/** cottage / farmhouse: plinth, walls (quoins or half-timbering or battens), gables, roof, door, windows, chimney.
 *  Footprint, colliders and the returned eave height are those of the first map round. */
function house(site, o) {
  const { x, z, w, d, wallH, rise, ry = 0, walls = plaster, roof = RF.tile, base = ST.grey, chimney = true, timber = false, seed = 1 } = o;
  const r = mulberry32(seed), T = lmTier();
  let y0 = Infinity;
  const corner = (a, b) => [x + (a * w / 2) * Math.cos(ry) + (b * d / 2) * Math.sin(ry), z - (a * w / 2) * Math.sin(ry) + (b * d / 2) * Math.cos(ry)];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) y0 = Math.min(y0, site.h(...corner(a, b)));
  const yb = y0 - 0.3;
  const hi = Math.max(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => site.h(...corner(a, b))));
  const gy = hi + 0.25;
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; site.add(g);
  // plinth: a recessed core, its top course of dressed stones
  g.add(box(w + 0.22, gy - yb, d + 0.22, base, 0, (gy + yb) / 2, 0));
  if (T < 2) plinthStones(g, w + 0.3, d + 0.3, gy, base, seed);
  g.add(box(w, wallH, d, walls, 0, gy + wallH / 2, 0));
  const wood = isWood(walls);
  if (timber) halfTimber(g, w, d, gy, wallH, T);
  else if (wood) battens(g, w, d, gy, wallH, walls === WD.dark ? WD.old : WD.dark, T);
  else if (T < 2) quoins(g, w, d, gy, wallH, walls === ST.lime ? ST.white : ST.lime);   // never the wall's own material: its crevice term would darken the whole face
  // gable ends (ridge along local x)
  for (const s of [-1, 1]) {
    const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise); tri.lineTo(-d / 2, 0);
    const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }); tg.translate(0, 0, -0.1);
    const m = new THREE.Mesh(tg, walls); m.position.set(s * (w / 2 - 0.1), gy + wallH, 0); m.rotation.y = Math.PI / 2; m.castShadow = m.receiveShadow = true; g.add(m);
    if (timber) {   // collar beam and king post in the gable
      plank(g, WD.dark, s * (w / 2 + 0.02), gy + wallH + rise * 0.42, 0, d * 0.56, 0.15, 0.07, s * Math.PI / 2);
      plank(g, WD.dark, s * (w / 2 + 0.02), gy + wallH + rise * 0.21, 0, rise * 0.42, 0.15, 0.07, s * Math.PI / 2, Math.PI / 2);
    }
  }
  roofOver(g, w, d, rise, gy + wallH, roof, T);
  // door + windows on the front (+z), windows on the back
  doorOn(g, -w * 0.18, gy, d / 2, 1.0, Math.min(2.0, wallH - 0.35), T);
  for (const wx of [w * 0.12, w * 0.34]) if (wx + 0.5 < w / 2) windowOn(g, wx, gy + wallH * 0.58, d / 2, 0.8, 0.9, true, r() < 0.6, T);
  for (const wx of [-w * 0.25, w * 0.25]) { g.add(box(0.8, 0.9, 0.1, glass, wx, gy + wallH * 0.58, -d / 2 - 0.04)); if (T < 2) block(g, ST.lime, wx, gy + wallH * 0.58 - 0.5, -d / 2 - 0.07, 1.0, 0.09, 0.2, 0, 0.02); }
  if (chimney) {
    const cx = w * 0.32 * (r() < 0.5 ? -1 : 1), ch = rise + 1.4, cy = gy + wallH + rise * 0.6;
    g.add(box(0.7, ch, 0.7, ST.grey, cx, cy, 0));
    const top = cy + ch / 2;
    block(g, ST.lime, cx, top + 0.06, 0, 0.86, 0.12, 0.86, 0, 0.02);
    block(g, ST.grey, cx, top + 0.2, 0, 0.74, 0.16, 0.74, 0, 0.03);
    if (T < 2) for (const s of [-1, 1]) g.add(cyl(0.09, 0.11, 0.32, mat.tile(0xa8654c), cx + s * 0.16, top + 0.42, 0, 8));
  }
  site.colBox(x, z, w / 2 + 0.1, d / 2 + 0.1, ry, yb, gy + wallH + rise);
  site.footprint(x, z, ry, w / 2, d / 2, gy + wallH);
  return gy;
}
function barn(site, x, z, w, d, h, ry, seed) {
  const gy = house(site, { x, z, w, d, wallH: h, rise: d * 0.42, ry, walls: WD.old, roof: RF.slate, chimney: false, seed });
  const T = lmTier(), g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; site.add(g);
  // the great double door: two leaves of boards, a Z of ledges and braces on each, the frame and a hay-loft hatch above
  const dw = 2.6, dh = 2.8, cx = w * 0.15, fz = d / 2 + 0.06;
  for (const s of [-1, 1]) {
    const lx = cx + s * dw / 4;
    g.add(box(dw / 2 - 0.02, dh, 0.08, WD.dark, lx, gy + dh / 2, fz));
    for (const hy of [0.35, dh - 0.35]) plank(g, WD.wood, lx, gy + hy, fz + 0.04, dw / 2 - 0.1, 0.16, 0.05);
    if (T < 2) plank(g, WD.wood, lx, gy + dh / 2, fz + 0.04, Math.hypot(dw / 2 - 0.2, dh - 0.9), 0.14, 0.05, 0, -s * Math.atan2(dh - 0.9, dw / 2 - 0.2));
  }
  plank(g, WD.dark, cx, gy + dh + 0.1, fz + 0.05, dw + 0.4, 0.2, 0.1);
  g.add(box(1.2, 1.0, 0.08, WD.dark, cx, gy + h - 0.8, fz));   // hay-loft hatch
  return gy;
}
function fenceRun(site, x0, z0, x1, z1, m = WD.old, post = 2.4) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / post)), T = lmTier();
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n, y = site.h(x, z);
    // split post with a weathered, sloped top
    const p = bevelBox(0.14, 1.12, 0.13, m, x, y + 0.48, z, 0.04); p.rotation.y = k * 1.3; site.add(p);
    if (k < n) {
      const xn = x0 + (x1 - x0) * (k + 1) / n, zn = z0 + (z1 - z0) * (k + 1) / n, yn = site.h(xn, zn);
      // split rails: rough six-sided poles, a little sag and twist each
      for (const hy of [0.45, 0.88]) site.add(T < 2 ? rod(x, y + hy, z, xn, yn + hy - 0.02, zn, 0.055, m, 6) : beam(x, y + hy, z, xn, yn + hy, zn, 0.07, 0.09, m));
    }
  }
}
function stack(site, x, z, ry, n, len) { // log pile: bark-dark logs, pale cut ends, two stakes
  const y = site.h(x, z), T = lmTier(), r = mulberry32(Math.round(x * 13 + z * 7) >>> 0);
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; site.add(g);
  for (let row = 0; row < 3; row++) for (let i = 0; i < n - row; i++) {
    const rr = 0.16 + r() * 0.04, lx = (i - (n - row - 1) / 2) * 0.38, ly = 0.19 + row * 0.33, dz = (r() - 0.5) * 0.12;
    const log = cyl(rr, rr * 1.05, len, WD.bark, lx, ly, dz, T < 2 ? 9 : 7); log.rotation.x = Math.PI / 2; g.add(log);
    if (T < 2) for (const s of [-1, 1]) { const e = cyl(rr - 0.015, rr - 0.015, 0.02, WD.light, lx, ly, dz + s * (len / 2 + 0.005), 9); e.rotation.x = Math.PI / 2; g.add(e); }
  }
  for (const s of [-1, 1]) g.add(rod(s * (n * 0.19 + 0.12), -0.2, 0, s * (n * 0.19 + 0.16), 1.0, 0, 0.05, WD.old, 5));
  return g;
}
/** haystack: a bellied rick on a low drum, a darker thatched cap, a pole through the top and two bands of rope */
function hay(site, x, z, s = 1) {
  const y = site.h(x, z), T = lmTier(), seg = T < 2 ? 14 : 9;
  const prof = [[0, 0], [1.5, 0], [1.62, 0.5], [1.58, 1.1], [1.32, 1.65], [0.95, 2.15], [0.5, 2.55], [0.12, 2.75], [0, 2.78]].map(([a, b]) => new THREE.Vector2(a * s, b * s));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, seg), straw); body.position.set(x, y - 0.05, z); body.castShadow = body.receiveShadow = true; site.add(body);
  const cap = [[0, 2.98], [0.72, 2.42], [1.06, 2.05], [1.0, 2.0], [0.6, 2.4], [0, 2.7]].map(([a, b]) => new THREE.Vector2(a * s, b * s));
  const c = new THREE.Mesh(new THREE.LatheGeometry(cap, seg), RF.thatch); c.position.set(x, y - 0.05, z); c.castShadow = c.receiveShadow = true; site.add(c);
  site.add(rod(x, y + 2.6 * s, z, x + 0.05, y + 3.4 * s, z, 0.05, WD.old, 5));
  if (T < 2) for (const by of [1.1, 1.75]) site.add(torus((by < 1.5 ? 1.6 : 1.3) * s, 0.025, M.rope(), x, y - 0.05 + by * s, z, 4, 20)).rotation.x = Math.PI / 2;
}

// ---------------------------------------------------------------- large
function watchtower(site, r) {
  const y = site.h(0, 0) - 0.6, R = 3.4, H = 21;
  site.add(cyl(R + 0.5, R + 0.9, 1.4, ST.dark, 0, y + 0.6, 0, 14));
  site.add(cyl(R, R + 0.35, H, ST.old, 0, y + H / 2, 0, 14));
  for (const by of [6.5, 13.5]) site.add(cyl(R + 0.22, R + 0.22, 0.32, ST.lime, 0, y + by, 0, 14));
  // broken crown: merlons of uneven height, a bite out of the west side
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2, bite = Math.cos(a - 2.4) > 0.55;
    const h = bite ? 0.6 + r() * 1.2 : 1.6 + r() * 1.8 - (k % 2) * 0.9;
    B(site, 1.25, h, 0.9, ST.old, Math.sin(a) * (R - 0.25), y + H + h / 2 - (bite ? 2.2 : 0), Math.cos(a) * (R - 0.25), a);
  }
  // windows, door, ivy
  for (const [a, wy] of [[0.3, 4], [2.1, 9], [4.2, 12], [1.2, 16.5], [3.4, 18.5]]) B(site, 0.6, 1.3, 0.5, glass, Math.sin(a) * (R + 0.02), y + wy, Math.cos(a) * (R + 0.02), a);
  B(site, 1.3, 2.4, 0.5, WD.dark, 0, y + 1.9, R + 0.12, 0);
  for (let k = 0; k < 7; k++) { const a = 3.5 + r() * 1.6; B(site, 1.2 + r(), 2 + r() * 4, 0.2, ivy, Math.sin(a) * (R + 0.15), y + 2 + r() * 12, Math.cos(a) * (R + 0.15), a); }
  // fallen blocks
  for (let k = 0; k < 9; k++) { const a = 2 + r() * 1.4, d = R + 1.5 + r() * 6; stone(site, Math.sin(a) * d, site.h(Math.sin(a) * d, Math.cos(a) * d) + 0.2, Math.cos(a) * d, 0.5 + r() * 0.4, 0.35, 0.45 + r() * 0.3, ST.old, r() * 3); }
  site.colCyl(0, 0, R + 0.4, y - 1, y + H);
  site.platDisc(0, 0, R - 0.6, y + H - 0.4, 1.0);
}
function windmill(site, ctx, x, z, ry, s, r) {
  const y = site.h(x, z) - 0.4, H = 8.6 * s;
  site.add(cyl(2.2 * s, 2.95 * s, H, plaster, x, y + H / 2, z, 12));
  site.add(cyl(2.35 * s, 2.4 * s, 0.3, WD.dark, x, y + H, z, 12));
  site.add(cone(2.8 * s, 3.2 * s, RF.thatch, x, y + H + 1.6 * s, z, 12));
  B(site, 1.0, 1.9, 0.2, WD.dark, x + Math.sin(ry) * 2.9 * s, y + 1.0, z + Math.cos(ry) * 2.9 * s, ry);
  const hubX = x + Math.sin(ry) * 2.8 * s, hubZ = z + Math.cos(ry) * 2.8 * s, hubY = y + H - 1.2 * s;
  const sails = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
    arm.add(box(0.14, 6.2 * s, 0.16, WD.dark, 0, 3.05 * s, 0));
    arm.add(box(1.05 * s, 3.6 * s, 0.05, canvas, 0.5 * s, 4.1 * s, 0));
    for (let j = 0; j < 7; j++) arm.add(box(1.2 * s, 0.05, 0.08, WD.wood, 0.5 * s, 2.4 * s + j * 0.55 * s, 0.05));
    sails.add(arm);
  }
  const holder = new THREE.Group(); holder.rotation.y = ry; holder.add(sails);
  site.addDynamic(holder, hubX, hubY, hubZ, 0);
  const speed = 0.25 + r() * 0.2;
  ctx.tick((dt) => { sails.rotation.z += dt * speed * (G.journeyWeather?.state.wind || 1); });
  site.colCyl(x, z, 2.9 * s, y - 1, y + H);
}
function windmills(site, ctx, r) {
  windmill(site, ctx, 0, 0, 0.6, 1.15, r);
  windmill(site, ctx, -17, 9, 0.3, 0.92, r);
  windmill(site, ctx, 14, 13, 0.9, 0.85, r);
  house(site, { x: -4, z: 17, w: 6, d: 4.4, wallH: 2.8, rise: 2, ry: 0.5, roof: RF.thatch, seed: 3 });
  stack(site, 3, 18, 0.4, 4, 2.2);
  for (let k = 0; k < 4; k++) hay(site, -12 + k * 3.6, -9 + r() * 3, 0.8);
}
function beaconKeep(site, ctx, r) {
  const y = site.h(0, 0) - 0.8;
  // curtain wall: ring of thick segments with breaches
  const R = 20;
  for (let k = 0; k < 18; k++) {
    if (k === 4 || k === 5 || k === 12) continue;
    const a = k / 18 * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R, g = site.h(x, z) - 0.6;
    const h = 3.2 + r() * 2.6 - (k % 3 === 0 ? 1.6 : 0);
    B(site, 7.2, h, 1.6, ST.old, x, g + h / 2, z, a + Math.PI / 2);
    site.colBox(x, z, 3.6, 0.8, a + Math.PI / 2, g - 1, g + h);
  }
  // square keep, one corner collapsed
  const K = 5.2, H = 16;
  for (const [x, z, w, d, h] of [[0, -K, K * 2 + 1, 1.2, H], [0, K, K * 2 + 1, 1.2, H - 5], [-K, 0, 1.2, K * 2, H], [K, 0, 1.2, K * 2, H - 7]]) {
    B(site, w, h, d, ST.grey, x, y + h / 2, z);
  }
  B(site, K * 2 + 1.2, 0.8, K * 2 + 1.2, ST.dark, 0, y + H - 0.4, 0);
  site.colBox(0, 0, K + 0.6, K + 0.6, 0, y - 1, y + H);
  site.platBox(0, 0, K, K, 0, y + H, 1);
  for (let k = 0; k < 8; k++) { const a = r() * 6.28, d = K + 2 + r() * 8; stone(site, Math.sin(a) * d, site.h(Math.sin(a) * d, Math.cos(a) * d) + 0.25, Math.cos(a) * d, 0.7, 0.45, 0.6, ST.grey, r() * 3); }
  // the beacon: an iron basket of split wood on the keep top
  const by = y + H;
  site.add(cyl(1.1, 0.7, 1.0, iron, 0, by + 1.4, 0, 8));
  site.add(cyl(0.12, 0.12, 1.0, iron, 0, by + 0.5, 0, 6));
  for (let k = 0; k < 6; k++) { const l = cyl(0.09, 0.1, 1.5, WD.wood, Math.sin(k) * 0.4, by + 2.0, Math.cos(k) * 0.4, 5); l.rotation.set(0.5 * Math.sin(k * 2), 0, 0.5 * Math.cos(k * 2)); site.add(l); }
  site.add(torus(0.95, 0.06, iron, 0, by + 1.9, 0));
}
function trilithons(site, r) {
  const y = site.h(0, 0);
  for (let k = 0; k < 5; k++) { // horseshoe of three-stone gates
    const a = -1.3 + k * 0.65, R = 9.5, x = Math.sin(a) * R, z = Math.cos(a) * R, g = site.h(x, z) - 0.5;
    const h = 6.2 + r() * 1.4;
    // sculpted uprights (lm_upright: 7 m, scaled to h; the cup-marked face inward) and lintels (lm_lintel, curved with
    // the horseshoe and laid along it: the first round's box lintels lay across the gates by mistake)
    for (const s of [-1, 1]) {
      const ux = x + Math.cos(a) * s * 1.35, uz = z - Math.sin(a) * s * 1.35, tx = (r() - 0.5) * 0.04, tz = (r() - 0.5) * 0.05;
      put(site, UPRIGHT, ux, g, uz, a + Math.PI, tx, tz, 1, h / 7, 1) || B(site, 1.6, h, 1.1, ST.sand, ux, g + h / 2, uz, a, tx, tz);
    }
    if (k !== 3) { const tz = (r() - 0.5) * 0.06; put(site, LINTEL, x, g + h + 0.45, z, a, 0, tz) || B(site, 4.6, 1.0, 1.2, ST.sand, x, g + h + 0.45, z, a + Math.PI / 2, 0, tz); }
    else put(site, LINTEL, x + 3, site.h(x + 3, z) + 0.3, z + 1, a, 0.04, 0.1, 0.96, 1, 1.05) || stone(site, x + 3, site.h(x + 3, z) + 0.4, z + 1, 2.2, 0.5, 0.65, ST.sand, a, 0, 0.1);
    site.colBox(x, z, 0.7, 2.2, a + Math.PI / 2, g - 1, g + h);
  }
  for (let k = 0; k < 16; k++) { // outer ring
    const a = k / 16 * Math.PI * 2, R = 17, x = Math.sin(a) * R, z = Math.cos(a) * R, g = site.h(x, z) - 0.4;
    if (k % 5 === 2) { putLying(site, STAND[k & 1], x, g + 0.55, z, a, 2.8, 0.9, 1.1, 0.06) || stone(site, x, g + 0.5, z, 1.4, 0.45, 0.6, ST.sand, a, 0, 0.08); continue; }
    const h = 2.6 + r() * 1.6, tx = (r() - 0.5) * 0.08, tz = (r() - 0.5) * 0.08;
    putStanding(site, k, x, g, z, 1.1, h, 0.75, a, tx, tz) || B(site, 1.1, h, 0.75, ST.sand, x, g + h / 2, z, a, tx, tz);
    site.colCyl(x, z, 0.7, g - 1, g + h);
  }
  put(site, LINTEL, 0, y + 0.12, 0, 0.3, 0, 0, 3.2 / 4.6, 0.55, 1) || B(site, 3.2, 0.5, 1.2, ST.grey, 0, y + 0.15, 0, 0.3);   // altar stone
}
function lighthouse(site, ctx, r) {
  const y = site.h(0, 0) - 0.5, H = 18;
  site.add(cyl(3.4, 3.7, 1.6, ST.grey, 0, y + 0.7, 0, 16));
  const bands = 6;
  for (let k = 0; k < bands; k++) {
    const r0 = 2.9 - k * 0.12, h = H / bands;
    site.add(cyl(r0 - 0.12, r0, h, k % 2 ? red : ST.white, 0, y + 1.4 + h * (k + 0.5), 0, 16));
  }
  const top = y + 1.4 + H;
  site.add(cyl(2.6, 2.4, 0.35, ST.grey, 0, top + 0.15, 0, 16));
  site.add(torus(2.45, 0.05, iron, 0, top + 1.2, 0));
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; site.add(cyl(0.04, 0.04, 1.0, iron, Math.sin(a) * 2.45, top + 0.75, Math.cos(a) * 2.45, 4)); }
  site.add(cyl(1.35, 1.35, 2.2, glass, 0, top + 1.45, 0, 12));
  lamp = lamp || M.lampWarm(1.6);
  site.add(cyl(0.7, 0.7, 1.2, lamp, 0, top + 1.45, 0, 10));
  site.add(cone(1.7, 1.6, red, 0, top + 3.35, 0, 12));
  site.add(sphere(0.3, iron, 0, top + 4.3, 0, 8, 6));
  site.colCyl(0, 0, 3.0, y - 1, top + 4);
  site.platDisc(0, 0, 2.35, top + 0.35, 0.8);
  house(site, { x: -7.5, z: 4, w: 6.5, d: 4.6, wallH: 2.7, rise: 2.0, ry: 0.2, walls: ST.white, roof: RF.slate, seed: 5 });
}
function aqueduct(site, l, r) {
  const L = l.len, span = 9.2, n = Math.floor(L / span);
  // the channel top follows a gentle fall from end to end, high over the dips
  let topA = -1e9;
  for (let k = 0; k <= n; k++) topA = Math.max(topA, site.h(0, -L / 2 + k * span));
  const top0 = topA + 9;
  const missing = new Set([Math.floor(n * 0.36), Math.floor(n * 0.36) + 1, Math.floor(n * 0.74)]);
  for (let k = 0; k < n; k++) {
    const z0 = -L / 2 + k * span, zc = z0 + span / 2;
    const top = top0 - (k / n) * 2.2;
    const g0 = Math.min(site.h(0, z0), site.h(0, z0 + span)) - 1.2;
    // pier at z0
    const pierH = top - g0;
    if (!missing.has(k) || !missing.has(k - 1)) {
      const ph = missing.has(k - 1) && missing.has(k) ? pierH * 0.5 : pierH - (missing.has(k) || missing.has(k - 1) ? 2.4 + r() * 2 : 0);
      B(site, 2.4, ph, 2.6, ST.lime, 0, g0 + ph / 2, z0);
      site.colBox(0, z0, 1.2, 1.3, 0, g0, g0 + ph);
    }
    if (missing.has(k)) { for (let j = 0; j < 5; j++) stone(site, (r() - 0.5) * 6, site.h(0, zc) + 0.3, zc + (r() - 0.5) * 7, 0.8 + r() * 0.5, 0.45, 0.6, ST.lime, r() * 3); continue; }
    // arch span: rectangle with a round-headed opening
    const sh = new THREE.Shape();
    const bot = top - 6.4, spring = top - 4.2, half = span / 2 - 1.2;
    sh.moveTo(-span / 2, bot); sh.lineTo(span / 2, bot); sh.lineTo(span / 2, top); sh.lineTo(-span / 2, top); sh.lineTo(-span / 2, bot);
    const hole = new THREE.Path(); hole.moveTo(-half, bot - 0.01); hole.lineTo(half, bot - 0.01); hole.lineTo(half, spring); hole.absarc(0, spring, half, 0, Math.PI, false); hole.lineTo(-half, bot - 0.01);
    sh.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 2.2, bevelEnabled: false, curveSegments: 6 }); geo.translate(0, 0, -1.1);
    const m = new THREE.Mesh(geo, ST.lime); m.position.set(0, 0, zc); m.rotation.y = Math.PI / 2; m.castShadow = m.receiveShadow = true; site.add(m);
    // channel lips + a little moss
    for (const s of [-1, 1]) B(site, 0.35, 0.6, span, ST.old, s * 0.95, top + 0.3, zc);
    if (r() < 0.4) B(site, 1.2, 0.08, span * 0.7, ivy, 0, top + 0.05, zc);
    site.platBox(0, zc, 1.1, span / 2, 0, top, 1.0);
  }
}

// ---------------------------------------------------------------- medium
function bridgeRuin(site, r) {
  // two arches across the brook (local x = across the water); the far arch has fallen
  const bankA = site.h(-13, 0), bankB = site.h(13, 0), top = Math.max(bankA, bankB) + 3.4;
  for (const [x, ok] of [[-6, true], [6, false]]) {
    const sh = new THREE.Shape(), half = 4.8, spring = top - 2.8;
    sh.moveTo(-6, -3); sh.lineTo(6, -3); sh.lineTo(6, top); sh.lineTo(-6, top); sh.lineTo(-6, -3);
    const hole = new THREE.Path(); hole.moveTo(-half, -3.01); hole.lineTo(half, -3.01); hole.lineTo(half, spring); hole.absarc(0, spring, half, 0, Math.PI, false); hole.lineTo(-half, -3.01);
    sh.holes.push(hole);
    if (ok) {
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 3.0, bevelEnabled: false, curveSegments: 7 }); geo.translate(0, 0, -1.5);
      const m = new THREE.Mesh(geo, ST.grey); m.position.set(x, 0, 0); m.castShadow = m.receiveShadow = true; site.add(m);
      for (const s of [-1, 1]) B(site, 12, 0.7, 0.3, ST.old, x, top + 0.35, s * 1.35);
      site.platBox(x, 0, 6, 1.4, 0, top, 1);
    } else {
      // stump of the pier and fallen voussoirs in the water
      B(site, 2.0, top + 3, 3.0, ST.grey, x + 5.5, (top - 3) / 2, 0);
      for (let k = 0; k < 7; k++) stone(site, x + (r() - 0.5) * 8, -1.6 + r() * 0.8, (r() - 0.5) * 5, 0.9, 0.6, 0.7, ST.grey, r() * 3, r(), r());
    }
  }
  B(site, 2.4, top + 3, 3.2, ST.grey, 0, (top - 3) / 2, 0);
  site.colBox(-6, 0, 6, 1.5, 0, top - 3.2, top);
}
function hermitCottage(site, r) {
  const gy = house(site, { x: 0, z: 0, w: 5.4, d: 4.2, wallH: 2.5, rise: 2.3, walls: ST.mossy, roof: RF.thatch, timber: false, seed: 11 });
  fenceRun(site, -6, 4, 4, 7.5); fenceRun(site, 4, 7.5, 6.5, 3);
  stack(site, -4.2, -3.2, 0.2, 5, 2.4);
  for (let k = 0; k < 6; k++) { const x = -3 + k * 1.3, z = 5.2; site.add(cyl(0.3, 0.24, 0.4, ST.sand, x, site.h(x, z) + 0.2, z, 7)); }
  B(site, 1.6, 0.45, 0.5, WD.old, 3.5, site.h(3.5, 3.2) + 0.45, 3.2, 0.3); // bench
  site.add(cyl(0.6, 0.6, 0.7, ST.grey, -5.5, site.h(-5.5, 1) + 0.35, 1, 10)); // water butt
}
function farmstead(site, ctx, l, r) {
  house(site, { x: 0, z: 0, w: 9, d: 6, wallH: 4.6, rise: 3.0, walls: r() < 0.5 ? plaster : plasterWarm, roof: RF.tile, timber: r() < 0.5, seed: 21 + l.x });
  barn(site, 14, -6, 12, 8, 5.2, Math.PI / 2, 22);
  house(site, { x: -10, z: -8, w: 4.6, d: 3.4, wallH: 2.4, rise: 1.6, walls: WD.old, roof: RF.moss, chimney: false, seed: 23 });
  fenceRun(site, -16, 10, 6, 14); fenceRun(site, 6, 14, 10, 24); fenceRun(site, -16, 10, -16, 24); fenceRun(site, -16, 24, 10, 24);
  for (let k = 0; k < 3; k++) hay(site, 20 + k * 3.8, 6 + r() * 3, 0.9);
  stack(site, -5.5, -5, 0.1, 4, 2.6);
  farmCart(site, 8, 4, 0.4);
  // the yard well: a rubble wellhead with its plank lid half off (lm_well b)
  put(site, 'sculpt_lm_well_b', -4, site.h(-4, 7), 7, 0.6) || site.add(cyl(0.9, 1.0, 0.9, ST.grey, -4, site.h(-4, 7) + 0.45, 7, 12));
}
/** a four-wheeled farm cart by the barn: plank bed with side boards, spoked wheels on axles, a drawbar down */
function farmCart(site, cx, cz, ry) {
  const cy = site.h(cx, cz), T = lmTier(), g = new THREE.Group(); g.position.set(cx, cy, cz); g.rotation.y = ry; site.add(g);
  for (let k = -2; k <= 2; k++) g.add(box(0.3, 0.06, 3.0, WD.wood, k * 0.31, 0.86, 0));
  for (const s of [-1, 1]) { plank(g, WD.wood, s * 0.8, 1.02, 0, 3.0, 0.26, 0.05, s * Math.PI / 2); g.add(box(0.12, 0.1, 3.1, WD.dark, s * 0.6, 0.78, 0)); }
  for (const t of [-1, 1]) {
    plank(g, WD.wood, 0, 1.02, t * 1.5, 1.6, 0.26, 0.05, t > 0 ? 0 : Math.PI);
    g.add(rod(-1.0, 0.55, t * 1.0, 1.0, 0.55, t * 1.0, 0.05, WD.dark, 6));
    for (const s of [-1, 1]) {
      const wh = new THREE.Group(); wh.position.set(s * 0.95, 0.55, t * 1.0); wh.rotation.y = Math.PI / 2; g.add(wh);
      wh.add(torus(0.53, 0.05, WD.dark, 0, 0, 0, 6, T < 2 ? 20 : 12));
      const hub = cyl(0.09, 0.09, 0.2, WD.dark, 0, 0, 0, 8); hub.rotation.x = Math.PI / 2; wh.add(hub);
      if (T < 2) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; wh.add(rod(0, 0, 0, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0, 0.022, WD.wood, 5)); }
    }
  }
  g.add(beam(0, 0.7, 1.55, 0, 0.05, 3.2, 0.09, 0.09, WD.dark));   // drawbar resting on the ground
}
function stoneCircle(site, r) {
  for (let k = 0; k < 13; k++) {
    const a = k / 13 * Math.PI * 2 + (r() - 0.5) * 0.1, R = 11 + (r() - 0.5), x = Math.sin(a) * R, z = Math.cos(a) * R, g = site.h(x, z) - 0.4;
    if (k === 7) { putLying(site, STAND[1], x, g + 0.5, z, a, 2.6, 0.8, 1.1, -0.05) || stone(site, x, g + 0.45, z, 1.3, 0.4, 0.55, ST.grey, a); continue; }
    const h = 1.8 + r() * 1.5, tx = (r() - 0.5) * 0.12, tz = (r() - 0.5) * 0.12;
    putStanding(site, k, x, g, z, 1.15, h, 0.8, a, tx, tz) || stone(site, x, g + h / 2, z, 0.6, h / 2, 0.42, ST.grey, a, tx, tz);
    site.colCyl(x, z, 0.55, g - 1, g + h);
  }
  // the recumbent stone in the middle
  putLying(site, STAND[0], 0, site.h(0, 0) + 0.3, 0, 0.4, 2.6, 0.95, 1.6, 0.04) || stone(site, 0, site.h(0, 0) + 0.3, 0, 1.4, 0.5, 0.9, ST.mossy, 0.4);
}
function chapelRuin(site, r) {
  const y = site.h(0, 0) - 0.5, L = 13, Wd = 7, H = 6;
  for (const s of [-1, 1]) { // side walls with window gaps, broken tops
    for (let k = 0; k < 4; k++) {
      const z = -L / 2 + 1.6 + k * 3.3, h = H - (s > 0 ? k * 0.9 : (3 - k) * 0.6) - r() * 0.8;
      B(site, 0.9, h, 2.2, ST.lime, s * Wd / 2, y + h / 2, z);
    }
    site.colBox(s * Wd / 2, 0, 0.45, L / 2, 0, y - 1, y + H - 1);
  }
  // gable end with a pointed window (east) and a stump of the west front
  const sh = new THREE.Shape(); sh.moveTo(-Wd / 2 - 0.45, 0); sh.lineTo(Wd / 2 + 0.45, 0); sh.lineTo(Wd / 2 + 0.45, H); sh.lineTo(0, H + 3.6); sh.lineTo(-Wd / 2 - 0.45, H); sh.lineTo(-Wd / 2 - 0.45, 0);
  const hole = new THREE.Path(); hole.moveTo(-0.9, 2.2); hole.lineTo(0.9, 2.2); hole.lineTo(0.9, 4.6); hole.quadraticCurveTo(0.8, 5.8, 0, 6.5); hole.quadraticCurveTo(-0.8, 5.8, -0.9, 4.6); hole.lineTo(-0.9, 2.2);
  sh.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: false, curveSegments: 5 }); geo.translate(0, 0, -0.45);
  const m = new THREE.Mesh(geo, ST.lime); m.position.set(0, y, -L / 2); m.castShadow = m.receiveShadow = true; site.add(m);
  B(site, 1.4, 1.6, 0.9, ST.lime, 0, y + H + 3.6 + 0.4, -L / 2); // bell-cote stump
  for (const s of [-1, 1]) B(site, 2.2, 3.4 - (s > 0 ? 1.6 : 0), 0.9, ST.lime, s * 2.4, y + 1.7, L / 2);
  site.colBox(0, -L / 2, Wd / 2, 0.45, 0, y - 1, y + H);
  // fallen roof beams and rubble inside
  for (let k = 0; k < 3; k++) site.add(beam(-2 + k * 1.6, y + 0.3, -3 + k, 1.5 - k, y + 1.4 + k * 0.3, 2 + k, 0.22, 0.22, WD.dark));
  for (let k = 0; k < 10; k++) stone(site, (r() - 0.5) * 6, y + 0.6, (r() - 0.5) * 11, 0.4 + r() * 0.3, 0.25, 0.35, ST.lime, r() * 3);
  B(site, 1.6, 1.0, 0.8, ST.grey, 0, y + 0.9, -L / 2 + 1.4); // altar block
}
function charcoalCamp(site, r) {
  const y = site.h(0, 0);
  site.add(sphere(3.2, earth, 0, y - 1.2, 0, 14, 8)).scale.set(1, 0.62, 1);
  for (let k = 0; k < 5; k++) site.add(cyl(0.15, 0.2, 0.5, ember, Math.sin(k * 1.3) * 1.8, y + 0.4, Math.cos(k * 1.3) * 1.8, 5));
  stack(site, 5.5, -2, 0.3, 6, 2.6); stack(site, 6.2, 2.5, -0.2, 5, 2.4); stack(site, -6, 1.2, 1.4, 6, 2.6);
  // lean-to of poles and bark
  const lx = -3, lz = 6, ly = site.h(lx, lz);
  for (let k = 0; k < 6; k++) site.add(beam(lx - 2 + k * 0.8, ly, lz + 1.4, lx - 2 + k * 0.8, ly + 2.2, lz - 0.6, 0.1, 0.1, WD.dark));
  B(site, 4.4, 0.08, 2.8, WD.old, lx, ly + 1.2, lz + 0.4, 0, 0.95);
  site.add(cyl(0.38, 0.42, 0.6, WD.wood, 2.5, site.h(2.5, 5) + 0.3, 5, 8));
}
function shepherdHut(site, r) {
  const y = site.h(0, 0) - 0.3;
  site.add(cyl(2.4, 2.6, 2.2, ST.grey, 0, y + 1.1, 0, 14));
  site.add(cone(3.0, 2.6, RF.thatch, 0, y + 3.4, 0, 14));
  B(site, 0.9, 1.6, 0.4, WD.dark, 0, y + 0.8, 2.45);
  site.colCyl(0, 0, 2.6, y - 1, y + 4);
  // the fold: a ring of low wall
  for (let k = 0; k < 22; k++) {
    if (k === 3) continue;
    const a = k / 22 * Math.PI * 2, R = 7.5, x = 4 + Math.sin(a) * R, z = Math.cos(a) * R, g = site.h(x, z);
    B(site, 2.2, 0.9, 0.6, ST.old, x, g + 0.35, z, a + Math.PI / 2);
  }
}
function dolmen(site, r) {
  const y = site.h(0, 0) - 0.3;
  // sculpted as one piece (lm_dolmen: the same supports, the capstone's top at the platform)
  const carved = put(site, 'sculpt_lm_dolmen', 0, y, 0);
  for (const [x, z, h] of [[-1.4, -0.9, 2.2], [1.5, -0.7, 2.3], [0, 1.4, 2.1]]) { if (!carved) B(site, 0.9, h, 1.6, ST.grey, x, y + h / 2, z, x * 0.5); site.colCyl(x, z, 0.7, y - 1, y + h); }
  if (!carved) stone(site, 0, y + 2.6, 0, 2.6, 0.45, 2.0, ST.grey, 0.3, 0.06, -0.08);
  site.platDisc(0, 0, 1.9, y + 2.95, 0.6);
}
function quarryKit(site, r) {
  // a timber derrick, a cart and stacked cut blocks at the foot of the face (the face itself: setpieces.js)
  const x = 4, z = 10, y = site.h(x, z);
  site.add(beam(x - 1.5, y, z, x, y + 7, z - 1, 0.25, 0.25, WD.dark)); site.add(beam(x + 1.5, y, z, x, y + 7, z - 1, 0.25, 0.25, WD.dark)); site.add(beam(x, y, z + 2.5, x, y + 7, z - 1, 0.25, 0.25, WD.dark));
  site.add(beam(x, y + 6.6, z - 1, x - 5, y + 5.4, z - 4, 0.2, 0.2, WD.wood));
  site.add(rod(x - 5, y + 5.4, z - 4, x - 5, y + 1.6, z - 4, 0.03, M.rope()));
  for (let k = 0; k < 6; k++) B(site, 1.4, 0.8, 0.9, ST.lime, -6 + (k % 3) * 1.5, site.h(-6, 12) + 0.4 + Math.floor(k / 3) * 0.8, 12 + (r() - 0.5) * 0.2, (r() - 0.5) * 0.1);
}
function pier(site, r) {
  // deck from the shore out over the water along local +z
  const y = 1.6;
  for (let k = 0; k < 18; k++) {
    const z = k * 1.2;
    B(site, 2.6, 0.12, 1.1, WD.old, 0, y, z, 0, 0, (r() - 0.5) * 0.04);
    if (k % 3 === 0) for (const s of [-1, 1]) site.add(cyl(0.12, 0.14, 4.5, WD.dark, s * 1.2, y - 2.0, z, 6));
  }
  site.platBox(0, 10.5, 1.3, 11, 0, y + 0.06, 0.4);
  B(site, 3.2, 2.4, 2.6, WD.old, -2.8, site.h(-2.8, -3) + 1.2, -3, 0.2);
  B(site, 3.6, 0.15, 3.0, RF.slate, -2.8, site.h(-2.8, -3) + 2.5, -3, 0.2, 0.15);
  const boat = G.assets?.model?.('bld_boat_rowing');
  if (boat) { boat.position.set(2.4, 0.1, 16); boat.rotation.y = 0.3; site.add(boat); }
  for (let k = 0; k < 3; k++) site.add(cyl(0.25, 0.25, 0.7, WD.wood, -1 + k * 0.6, y + 0.4, 20, 8));
}
function boathouse(site, r) {
  const gy = house(site, { x: 0, z: 0, w: 5, d: 7, wallH: 2.6, rise: 2.2, walls: WD.old, roof: RF.slate, chimney: false, seed: 31 });
  const boat = G.assets?.model?.('bld_boat_rowing');
  if (boat) { boat.position.set(4.5, site.h(4.5, 6) + 0.1, 6); boat.rotation.y = 1.2; site.add(boat); }
  for (let k = 0; k < 3; k++) { const x = -4 + k * 2.2, z = 6; site.add(cyl(0.07, 0.08, 2.2, WD.dark, x, site.h(x, z) + 1.1, z, 5)); if (lmTier() < 2) site.add(cyl(0.1, 0.1, 0.06, WD.wood, x, site.h(x, z) + 2.22, z, 6)); }
  // a net hung to dry between the posts: the mesh, a head rope and a row of cork floats
  B(site, 4.6, 1.4, 0.04, mat.cloth(0x6f7f74), -1.8, site.h(-1.8, 6) + 1.2, 6);
  if (lmTier() < 2) {
    site.add(rod(-4, site.h(-4, 6) + 2.0, 6, 0.4, site.h(0.4, 6) + 2.0, 6, 0.025, M.rope(), 4));
    for (let k = 0; k < 9; k++) { const x = -3.9 + k * 0.52; site.add(sphere(0.07, cream, x, site.h(-1.8, 6) + 0.52, 6.02, 6, 4)).scale.set(1.4, 1, 1); }
  }
}
function apiary(site, r) {
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * 2.8 - 1.4, x = Math.sin(a) * 5, z = Math.cos(a) * 5 - 2, y = site.h(x, z);
    // sculpted hives (lm_hive: straw skeps under hackles, painted box hives), entrances to the garden's middle
    if (put(site, k % 2 ? 'sculpt_lm_hive_skep' : 'sculpt_lm_hive_box', x, y, z, a + Math.PI + (r() - 0.5) * 0.3)) continue;
    if (k % 2) { site.add(cone(0.42, 0.75, straw, x, y + 0.78, z, 9)); site.add(cyl(0.44, 0.44, 0.35, straw, x, y + 0.3, z, 9)); }
    else { B(site, 0.6, 0.65, 0.55, cream, x, y + 0.42, z, a); B(site, 0.75, 0.08, 0.7, RF.slate, x, y + 0.8, z, a); }
    B(site, 0.6, 0.12, 0.6, WD.old, x, y + 0.06, z, a);
  }
  put(site, 'sculpt_lm_bench', 0, site.h(0, 3), 3, Math.PI + 0.1, 0, 0, 0.95, 1, 1) || B(site, 1.8, 0.45, 0.5, WD.old, 0, site.h(0, 3) + 0.45, 3, 0.1);
}
// ---------------------------------------------------------------- small
function swing(site, ctx, r) {
  const y = site.h(2.6, 0);
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(cyl(0.025, 0.025, 4.4, M.rope(), s * 0.42, -2.2, 0, 4));
  g.add(box(1.05, 0.08, 0.36, WD.light, 0, -4.4, 0));
  site.addDynamic(g, 2.6, y + 5.0, 0, 0.4);
  let t = r() * 6;
  ctx.tick((dt) => { t += dt; g.rotation.x = 0.12 * Math.sin(t * 1.3) * (0.6 + 0.4 * (G.journeyWeather?.state.wind || 1)); });
}
function cairn(site, r) {
  let y = site.h(0, 0);
  // sculpted stack of field stones (lm_cairn, 2.1 m like the old one), each cairn turned its own way
  const carved = put(site, 'sculpt_lm_cairn', 0, y, 0, r() * 6.283);
  for (let k = 0; k < 7; k++) { const s = 0.85 - k * 0.1; if (!carved) stone(site, (r() - 0.5) * 0.2, y + s * 0.4, (r() - 0.5) * 0.2, s, s * 0.45, s * 0.9, k % 2 ? ST.grey : ST.old, r() * 3); y += s * 0.55; }
  site.colCyl(0, 0, 0.8, y - 3, y);
}
function wayShrine(site, r) {
  // carved post, niche head and stone-slate roof (lm_shrine.mjs); origin on the ground, niche to the road (+z)
  if (put(site, 'sculpt_lm_shrine', 0, site.h(0, 0), 0, 0, 0, 0, 1, 1, 1, lmTier() ? 1 : 0)) {
    const y = site.h(0, 0);
    site.colBox(0, 0, 0.5, 0.45, 0, y - 1.2, y + 2.4);
    return;
  }
  const y = site.h(0, 0) - 0.2;
  B(site, 0.9, 1.4, 0.7, ST.lime, 0, y + 0.7, 0);
  B(site, 1.05, 0.9, 0.85, ST.lime, 0, y + 1.85, 0);
  B(site, 0.6, 0.6, 0.2, ST.dark, 0, y + 1.85, 0.36);
  site.add(sphere(0.16, cream, 0, y + 1.8, 0.3, 8, 6));
  gableEnd(site, 1.3, 0.55, 1.1, RF.slate, 0, y + 2.3, 0, Math.PI / 2);
  for (const s of [-1, 1]) site.add(cyl(0.05, 0.05, 0.16, cream, s * 0.3, y + 1.46, 0.42, 6));
  for (let k = 0; k < 5; k++) site.add(sphere(0.07, k % 2 ? red : mat.paint(0xf0d050), (r() - 0.5) * 0.6, y + 1.43, 0.42 + r() * 0.1, 6, 4));
  site.colBox(0, 0, 0.5, 0.45, 0, y - 1, y + 2.6);
}
function bench(site, r) {
  const y = site.h(0, 0);
  if (put(site, 'sculpt_lm_bench', 0, y, 0)) return;   // carpenter's bench (lm_bench), front +z as before
  B(site, 1.9, 0.07, 0.42, WD.light, 0, y + 0.46, 0);
  B(site, 1.9, 0.32, 0.06, WD.light, 0, y + 0.78, -0.2, 0, -0.18);
  for (const s of [-1, 1]) B(site, 0.08, 0.46, 0.4, WD.dark, s * 0.8, y + 0.23, 0);
}
function well(site, r) {
  const y = site.h(0, 0) - 0.1;
  // rubble wellhead, posts, windlass and shingled roof (lm_well a); same collider
  if (put(site, 'sculpt_lm_well_a', 0, y + 0.1, 0)) { site.colCyl(0, 0, 1.05, y - 1, y + 1); return; }
  site.add(cyl(1.0, 1.05, 0.95, ST.grey, 0, y + 0.47, 0, 14));
  site.add(cyl(0.78, 0.78, 0.97, glass, 0, y + 0.5, 0, 14));
  for (const s of [-1, 1]) site.add(box(0.14, 2.0, 0.14, WD.dark, s * 0.95, y + 1.4, 0));
  pitched(site, 1.6, 1.3, 0.6, RF.tile, 0, y + 2.35, 0, Math.PI / 2, 0.15, 0.08);
  site.add(cyl(0.18, 0.15, 0.3, WD.wood, 0.2, y + 1.3, 0, 8));
  site.colCyl(0, 0, 1.05, y - 1, y + 1);
}
function stoneRing(site, R, n, r) {
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.283, x = Math.sin(a) * R, z = Math.cos(a) * R, ry = r() * 3;
    // mossy field stones of the countryside rock family (world/rock-family.js), else the old blobs
    const g = siteRock(k % 3 ? 'field' : 'cobble', { w: 1.0, h: 0.55, d: 0.9, tint: ST.mossy.color.toArray(), lod: rockLod(false) });
    if (g) site.add(g, x, site.h(x, z), z, ry); else stone(site, x, site.h(x, z) + 0.15, z, 0.5, 0.3, 0.45, ST.mossy, ry);
  }
}

/** yaw (local +z) toward the deepest water within 40 m, or `fallback` */
function seaward(x, z, fallback) {
  let best = fallback, low = 0;
  for (let k = 0; k < 32; k++) {
    const a = k / 32 * Math.PI * 2;
    let d = 0;
    for (const r of [15, 25, 40]) d += G.world.heightAt(x + Math.sin(a) * r, z + Math.cos(a) * r);
    if (d < low) { low = d; best = a; }
  }
  return best;
}
export async function buildLandmarks(ctx) {
  const t0 = performance.now();
  const built = [];
  for (const l of LANDMARKS) {
    let rot = l.angle || 0;
    if (l.kind === 'bridgeRuin') rot -= Math.PI / 2; // the deck runs along local x
    if (l.kind === 'pier' || l.kind === 'boathouse') rot = seaward(l.x, l.z, rot);
    const site = new Site('lm_' + l.id, l.x, l.z, rot), r = mulberry32(Math.round(l.x * 31 + l.z * 17) >>> 0);
    try {
      switch (l.kind) {
        case 'watchtower': watchtower(site, r); break;
        case 'windmills': windmills(site, ctx, r); break;
        case 'beaconKeep': beaconKeep(site, ctx, r); break;
        case 'trilithons': trilithons(site, r); break;
        case 'lighthouse': lighthouse(site, ctx, r); break;
        case 'aqueduct': aqueduct(site, l, r); break;
        case 'bridgeRuin': bridgeRuin(site, r); break;
        case 'hermitCottage': hermitCottage(site, r); break;
        case 'farmstead': farmstead(site, ctx, l, r); break;
        case 'stoneCircle': stoneCircle(site, r); break;
        case 'chapelRuin': chapelRuin(site, r); break;
        case 'charcoalCamp': charcoalCamp(site, r); break;
        case 'shepherdHut': shepherdHut(site, r); break;
        case 'dolmen': dolmen(site, r); break;
        case 'quarry': quarryKit(site, r); break;
        case 'pier': pier(site, r); break;
        case 'boathouse': boathouse(site, r); break;
        case 'apiary': apiary(site, r); break;
        case 'swingTree': swing(site, ctx, r); break;
        case 'cairn': cairn(site, r); break;
        case 'wayShrine': wayShrine(site, r); break;
        case 'bench': bench(site, r); break;
        case 'well': well(site, r); break;
        case 'ancientTree': stoneRing(site, 11, 16, r); break;
        case 'flowerValley': bench(site, r); break;
        default: break; // rock / plant pieces only (tor, cragFalls, tarn, fallenGiant, rockfall, snags)
      }
    } catch (e) { G.reportError('landmarks:' + l.id, e); continue; }
    if (!site.root.children.length) continue;
    await site.bakeSliced(ctx.step);
    const cut = l.scale === 'small' ? 320 : l.scale === 'medium' ? 1100 : 0;
    ctx.place('lm_' + l.id, { site, group: site.baked, landmark: l, cut });
    built.push(l.id);
  }
  return { built, ms: Math.round(performance.now() - t0) };
}
