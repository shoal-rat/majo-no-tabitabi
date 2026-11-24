// Shared building kit for the structures system: materials, the Site helper (local placement + colliders/platforms in
// world space), curved tiled / thatched roofs, and the building types every place is assembled from.
// Everything here only creates geometry; the places bake their sites with bakeStatic() into a few meshes each.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../../core/game.js';
import { PAL, toon, flat, glow, hookMaterial, own } from '../../core/mats.js';
import { noise2, hash2 } from '../../core/util.js';
import { box, cyl, cone, sphere, bakeStatic } from '../../core/geo.js';
import { FU } from '../flora/material.js';
import { t } from '../../core/i18n.js';
import { fontsReady, whenFontsReady } from '../../core/fonts.js';
import { paintLettering, crestFor } from './lettering.js';
import { thatchMap, THATCH_TILE } from '../../render/surfaces.js';

// ---------------------------------------------------------------------------------------------------------------
// Materials (all cached by the core, so calling these anywhere returns the same instance)
const SF = (surface, look) => (look ? { surface, look } : { surface });
// Thatch ROOFS (revision r2): a real UV map painted with straw bundles (render/surfaces.js thatchMap) on smooth shading,
// no triplanar layer (detail 0). The colour is divided by the map's mean so the average colour stays as authored, and a
// mesh without UVs merged into the same material samples the neutral corner texel = the plain colour.
function thatchRoof(c, look) {
  const m = flat(c, { surface: 'thatch', look: { ...(look || {}), detail: 0, roofMap: 1 }, flatShading: false });
  if (!m.map) { const { tex, mean } = thatchMap(); m.map = tex; m.color.multiplyScalar(1 / mean); m.needsUpdate = true; }
  return m;
}
export const M = {
  wood: () => toon(PAL.wood, SF('wood')),
  woodDark: () => toon(PAL.woodDark, SF('wood')),
  woodLight: () => toon(PAL.woodLight, SF('wood')),
  woodOld: () => toon(0x8c7a68, SF('wood', { bump: 1.3 })),          // silvered, weathered boards (farmhouses)
  verm: () => toon(PAL.vermilion, SF('paint', { spec: 0.15, specPower: 30, detail: 0.7 })),
  vermDark: () => toon(PAL.vermilionDark, SF('paint', { spec: 0.15, specPower: 30, detail: 0.7 })),
  plaster: () => toon(PAL.plaster, SF('plaster')),
  plasterWarm: () => toon(0xe8d6b4, SF('plaster')),
  paper: () => toon(PAL.paper, SF('paper', { trans: 0.35 })),
  stone: () => flat(PAL.stone, SF('stone')),
  stoneDark: () => flat(PAL.stoneDark, SF('stone')),
  stoneLight: () => flat(0xc9c6c0, SF('stone')),
  // warm granite, SMOOTH shaded (final sets): statues and lathe lantern bodies catch the cel band as one soft gradient
  // instead of reading as low-poly facets. Boxes / bevelBox / facet() parts keep flat faces from their own normals, so
  // the old users (torii base stones, stilt-house footings, bridge courses) look as before. `carved` is the same
  // material (one draw call wherever a torii already stands).
  stoneWarm: () => toon(0xa59c90, SF('stone')),
  carved: () => M.stoneWarm(),
  moss: () => flat(PAL.moss, SF('earth')),
  tile: () => flat(PAL.roofTile, SF('tile', { spec: .065, specPower: 50 })),
  tileDusk: () => flat(PAL.roofTileDusk, SF('tile', { spec: .065, specPower: 50 })),
  tileNight: () => flat(PAL.roofTileNight, SF('tile', { spec: .065, specPower: 50 })),
  tileRidge: () => flat(0x2c3542, SF('tile', { spec: 0.3, specPower: 40 })),
  thatch: () => thatchRoof(PAL.thatch),
  thatchDark: () => flat(PAL.strawDark, SF('thatch')),
  thatchCut: () => flat(0x9a7a48, SF('thatch', { scale: 0.7 })),       // the cut underside of a thick thatch eave
  shingle: () => flat(0x7a4f3c, SF('wood', { scale: 0.8, bump: 1.4 })), // cypress-bark shingles (shrine roofs)
  shingleEdge: () => flat(0x5e3a2c, SF('wood', { scale: 0.5 })),
  straw: () => toon(PAL.straw, SF('thatch')),
  black: () => toon(0x2a2326, SF('paint', { spec: .095, specPower: 34, detail: 0.5 })),
  gold: () => toon(PAL.gold, SF('metal', { spec: 0.6 })),
  bronze: () => toon(0x6f7d58, SF('metal', { spec: 0.4 })),
  copper: () => flat(0x4f8f80, SF('tile', { spec: 0.3, specPower: 40 })),
  rope: () => toon(0xe8d9a8, SF('thatch', { scale: 0.5 })),
  white: () => toon(PAL.mikoWhite, SF('paper')),
  red: () => toon(PAL.mikoRed, SF('cloth')),
  grass: () => toon(PAL.grassSun, SF('paint')),
  silver: () => toon(0xd8dff0, SF('metal', { spec: 0.5 })),
  moonStone: () => flat(0xb9c3dc, SF('stone')),
  moonStoneDark: () => flat(0x5d6a93, SF('stone')),
  deepBlue: () => toon(0x26346a, SF('tile', { spec: .065, specPower: 50 })),
  rock: () => flat(PAL.rock, SF('rock')),
  rockDark: () => flat(PAL.rockDark, SF('rock')),
  // self-lit
  lampWarm: (k = 2.4) => glow(PAL.lanternWarm, k),
  lampHot: (k = 2.6) => glow(PAL.lanternHot, k),
  lampRed: (k = 2.2) => glow(0xff5a3a, k),
  foxFire: (k = 2.6) => glow(0x7fd8ff, k),
  moonGlow: (k = 2.2) => glow(PAL.moonPale, k),
};
/** Lit toon / flat material with an explicit surface tag (for the custom colours of the town / dusk builders). */
export const mat = {
  wood: (c, look) => toon(c, SF('wood', look)), plaster: (c, look) => toon(c, SF('plaster', look)),
  paint: (c, look) => toon(c, SF('paint', look)), cloth: (c, look) => toon(c, SF('cloth', look)),
  paper: (c, look) => toon(c, SF('paper', { trans: 0.35, ...(look || {}) })), metal: (c, look) => toon(c, SF('metal', { spec: .35, ...(look || {}) })),
  stone: (c, look) => flat(c, SF('stone', look)), tile: (c, look) => flat(c, SF('tile', { spec: .065, specPower: 50, ...(look || {}) })),
  thatch: (c, look) => thatchRoof(c, look), rock: (c, look) => flat(c, SF('rock', look)), lacquer: (c, look) => toon(c, SF('paint', { spec: .095, specPower: 34, detail: 0.5, ...(look || {}) })),
  none: (c, look) => toon(c, SF('none', look)),
};

/**
 * Cloth in the wind (nobori, noren, prayer flags, long banners): a cached copy of `m` whose vertex shader sways the
 * cloth with the flora wind uniforms (FU.fTime, FU.fWind). The sway weight is (1 - uv.y)^1.4 * amp, so the edge the
 * cloth hangs from (uv.y = 1, the top of a plane) stays put and the free end moves most. Works on merged meshes (bakes
 * keep uv); every piece with the same (material, amp) still merges into one draw call.
 */
const _cloth = new Map();
export function clothify(m, amp = 0.22, mode = 0) {
  const k = amp.toFixed(3) + (mode ? 'm' + mode : '');
  let byAmp = _cloth.get(m); if (!byAmp) _cloth.set(m, (byAmp = new Map()));
  let c = byAmp.get(k);
  if (c) return c;
  c = m.isMeshBasicMaterial ? m.clone() : own(m);
  c.userData = { ...m.userData, shared: false, cloth: amp };
  c.onBeforeCompile = (sh) => {
    sh.uniforms.fTime = FU.fTime; sh.uniforms.fWind = FU.fWind;
    sh.vertexShader = 'uniform float fTime;\nuniform vec3 fWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float cw = pow(clamp(1.0 - uv.y, 0.0, 1.0), 1.4) * ${amp.toFixed(3)};
        ${mode === 1 ? 'cw *= 0.25 + 3.0 * clamp(uv.x * (1.0 - uv.x), 0.0, 0.25);' : ''}
        float ws = length(fWind.xz);
        vec2 dir = ws > 0.001 ? fWind.xz / ws : vec2(0.8, 0.6);
        float ph = fTime * 2.2 + dot(position.xz, vec2(0.41, 0.33)) + position.y * 0.7;
        float s = 0.45 + 0.55 * sin(ph) + 0.25 * sin(ph * 2.63 + 1.7);
        float gain = 0.55 + min(ws, 8.0) * 0.1;
        transformed.xz += dir * s * cw * gain;
        transformed.y += (0.5 + 0.5 * sin(ph * 1.7)) * cw * 0.12;
      }`);
  };
  c.customProgramCacheKey = () => 'mvCloth' + k;
  byAmp.set(k, c);
  return c;
}

/** Paper of windows / shoji: plain by day, self-lit in the dusk and the night (veil 0..1 of the place). */
export function windowMat(veil) {
  if (veil > 0.8) return glow(0xffad55, 2.5);
  if (veil > 0.15) return glow(0xffc890, 1.35);
  return M.paper();
}

// ---------------------------------------------------------------------------------------------------------------
// Site: a place's local frame (origin x,z, heading rot). Meshes are added with absolute world y; colliders and
// platforms are converted to world space and registered on G.world. bake() merges everything into a few meshes.
export class Site {
  constructor(name, x, z, rot = 0) {
    this.name = name; this.x = x; this.z = z; this.rot = rot;
    this.c = Math.cos(rot); this.s = Math.sin(rot);
    this.root = new THREE.Group(); this.root.name = name;
    this.root.position.set(x, 0, z); this.root.rotation.y = rot;
    this.colliders = []; this.platforms = []; this.dyn = [];
    /** building footprints (site-local) for the baked vertex shading: { x, z, c, s, hw, hd, eave, tint:[r,g,b] } */
    this.eaves = [];
    this._hc = new Map();
  }
  /** terrain height under a local point, cached on a 0.5 m grid (vertex shading) */
  hc(lx, lz) {
    const k = Math.round(lx * 2) * 100003 + Math.round(lz * 2);
    let v = this._hc.get(k);
    if (v === undefined) { v = this.h(Math.round(lx * 2) / 2, Math.round(lz * 2) / 2); this._hc.set(k, v); }
    return v;
  }
  /** Register a footprint (site-local centre, heading, half extents, absolute eave height) for eave shading + tint. */
  footprint(lx, lz, ry, hw, hd, eave, seed = this.eaves.length) {
    const h = hash2(seed * 7.3 + this.x, seed * 3.1 + this.z), h2 = hash2(seed * 1.7 - this.z, seed * 5.9 + this.x);
    const v = 0.93 + 0.1 * h, w = (h2 - 0.5) * 0.06;
    this.eaves.push({ x: lx, z: lz, c: Math.cos(ry), s: Math.sin(ry), hw, hd, eave, tint: [v * (1 + w), v, v * (1 - w)] });
  }
  /** local (lx,lz) -> world [x,z] */
  wx(lx, lz) { return this.x + lx * this.c + lz * this.s; }
  wz(lx, lz) { return this.z - lx * this.s + lz * this.c; }
  /** terrain height under a local point */
  h(lx, lz) { return G.world.heightAt(this.wx(lx, lz), this.wz(lx, lz)); }
  /** local point of a world point */
  lx(x, z) { const dx = x - this.x, dz = z - this.z; return dx * this.c - dz * this.s; }
  lz(x, z) { const dx = x - this.x, dz = z - this.z; return dx * this.s + dz * this.c; }
  /** Add with a placement (local x, absolute y, local z, heading) — or, with only obj, keep obj's own transform. */
  add(obj, lx, y = 0, lz = 0, ry = 0) { if (lx !== undefined) { obj.position.set(lx, y, lz); obj.rotation.y = ry; } this.root.add(obj); return obj; }
  /** Keep this object live (not merged) — e.g. lanterns with setLit, animated parts. */
  addDynamic(obj, lx = 0, y = 0, lz = 0, ry = 0) { obj.userData.dynamic = true; return this.add(obj, lx, y, lz, ry); }
  colBox(lx, lz, hw, hd, lrot, y0, y1, tag) {
    const c = G.world.addCollider({ box: true, x: this.wx(lx, lz), z: this.wz(lx, lz), hw, hd, rot: this.rot + (lrot || 0), y0, y1, tag: tag || this.name });
    this.colliders.push(c); return c;
  }
  colCyl(lx, lz, r, y0, y1, tag) {
    const c = G.world.addCollider({ x: this.wx(lx, lz), z: this.wz(lx, lz), r, y0, y1, tag: tag || this.name });
    this.colliders.push(c); return c;
  }
  platBox(lx, lz, hw, hd, lrot, top, thick = 1.2, tag) {
    const p = G.world.addPlatform({ box: true, x: this.wx(lx, lz), z: this.wz(lx, lz), hw, hd, rot: this.rot + (lrot || 0), top, thick, tag: tag || this.name });
    this.platforms.push(p); return p;
  }
  platDisc(lx, lz, r, top, thick = 1.2, tag) {
    const p = G.world.addPlatform({ x: this.wx(lx, lz), z: this.wz(lx, lz), r, top, thick, tag: tag || this.name });
    this.platforms.push(p); return p;
  }
  /** Place a building made by one of the builders below: adds it, registers its walls and its roof landing pads. */
  building(b, lx, lz, ry = 0, y = null, { solid = true, roofPads = true, foundation = true } = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const loc = (px, pz) => [lx + px * c + pz * s, lz - px * s + pz * c];
    // sample the footprint: stand on the highest point, fill the gap below with a stone foundation
    const w0 = b.walls[0] || { hw: 1, hd: 1 };
    const fw = (b.foot?.hw ?? w0.hw) + 0.2, fd = (b.foot?.hd ?? w0.hd) + 0.2;
    let hi = -Infinity, lo = Infinity;
    for (const [px, pz] of [[0, 0], [-fw, -fd], [fw, -fd], [-fw, fd], [fw, fd], [0, fd], [0, -fd], [fw, 0], [-fw, 0]]) {
      const [ax, az] = loc(px, pz); const hh = this.h(ax, az); hi = Math.max(hi, hh); lo = Math.min(lo, hh);
    }
    const gy = y ?? hi;
    if (foundation && gy - lo > 0.15) {
      const fh = gy - lo + 0.6;
      const f = box(fw * 2 + 0.3, fh, fd * 2 + 0.3, M.stoneDark(), 0, 0, 0);
      this.add(f, ...[lx, gy - fh / 2 + 0.05, lz], ry);
    }
    this.add(b.group, lx, gy, lz, ry);
    if (b.eaveY) { const w0b = b.walls[0] || { hw: 1, hd: 1 }; this.footprint(lx + (w0b.x || 0) * c + (w0b.z || 0) * s, lz - (w0b.x || 0) * s + (w0b.z || 0) * c, ry, (b.foot?.hw ?? w0b.hw) + 0.4, (b.foot?.hd ?? w0b.hd) + 0.4, gy + b.eaveY); }
    // walls under a roof: climbable, but their top (the eaves) is no floor to stand on (player/climb.js colliderTopAt)
    if (solid) for (const w of b.walls) { const [ax, az] = loc(w.x, w.z); this.colBox(ax, az, w.hw, w.hd, ry, gy + (w.y0 ?? -1), gy + w.y1).eave = true; }
    for (const f of b.floors || []) { const [ax, az] = loc(f.x, f.z); this.platBox(ax, az, f.hw, f.hd, ry, gy + f.top, f.thick ?? 1.2); }
    if (roofPads) for (const p of b.pads || []) { const [ax, az] = loc(p.x || 0, p.z || 0); this.platBox(ax, az, p.hw, p.hd, ry, gy + p.top, 0.9); }
    return gy;
  }
  /** Ground height to stand a footprint (hw x hd, heading ry) on: the highest point, with a stone foundation filling
   *  the gap down to the lowest point when the ground slopes. Returns that height. */
  ground(lx, lz, hw, hd, ry = 0, { foundation = true, mat } = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    let hi = -Infinity, lo = Infinity;
    for (const [px, pz] of [[0, 0], [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, hd], [0, -hd], [hw, 0], [-hw, 0]]) {
      const hh = this.h(lx + px * c + pz * s, lz - px * s + pz * c); hi = Math.max(hi, hh); lo = Math.min(lo, hh);
    }
    if (foundation && hi - lo > 0.15) {
      const fh = hi - lo + 0.6;
      this.add(box(hw * 2 + 0.3, fh, hd * 2 + 0.3, mat || M.stoneDark(), 0, 0, 0), lx, hi - fh / 2 + 0.05, lz, ry);
    }
    return hi;
  }
  /**
   * bake() in boot time slices: the merge is one piece, then the vertex shading runs one merged mesh at a time with
   * `await step()` between (structures.js ctx.step yields when the slice budget is spent). Same result as bake().
   */
  async bakeSliced(step, scene = G.scene) {
    this.baked = await bakeKeepSliced(this.root, step, this.name);
    for (const m of [...this.baked.children]) await shadeMeshSliced(m, this, step);
    collapseFamilies(this.baked);
    scene.add(this.baked);
    return this.baked;
  }
  /** bakeBlocks() in boot time slices (one block's merge, then its shading mesh by mesh). Same result. */
  async bakeBlocksSliced(cell = 36, step, scene = G.scene) {
    const cells = this._cells(cell);
    this.baked = new THREE.Group(); this.baked.name = this.name;
    this.blocks = [];
    for (const r of cells.values()) {
      const b = await bakeKeepSliced(r, step, this.name);
      for (const m of [...b.children]) await shadeMeshSliced(m, this, step);
      collapseFamilies(b);
      b.userData.block = true;
      this.baked.add(b); this.blocks.push(b);
    }
    scene.add(this.baked);
    return this.baked;
  }
  /** Merge into a few meshes and add to the scene. */
  bake(scene = G.scene) {
    this.baked = bakeKeep(this.root);
    try { shadeBaked(this.baked, this); } catch (e) { G.reportError?.('structures:shade:' + this.name, e); }
    collapseFamilies(this.baked);
    scene.add(this.baked);
    return this.baked;
  }
  /**
   * Bake in square blocks of `cell` m (site-local grid, each top-level child goes to the block holding its bounds
   * centre). this.baked becomes a plain group of block groups (each its own bake, frustum-culled on its own) and
   * this.blocks lists them; structures.js gives every block its own near / far swap. Used by large places (万灯镇).
   */
  _cells(cell) {
    this.root.updateMatrixWorld(true);
    const bb = new THREE.Box3(), v = new THREE.Vector3(), cells = new Map();
    for (const ch of [...this.root.children]) {
      bb.setFromObject(ch);
      let k = 'c';
      if (!bb.isEmpty()) { bb.getCenter(v); k = Math.floor(this.lx(v.x, v.z) / cell) + ':' + Math.floor(this.lz(v.x, v.z) / cell); }
      let r = cells.get(k);
      if (!r) { r = new THREE.Group(); r.position.copy(this.root.position); r.rotation.copy(this.root.rotation); r.name = this.name + '_' + k; cells.set(k, r); }
      r.add(ch);
    }
    return cells;
  }
  bakeBlocks(cell = 36, scene = G.scene) {
    const cells = this._cells(cell);
    this.baked = new THREE.Group(); this.baked.name = this.name;
    this.blocks = [];
    for (const r of cells.values()) {
      const b = bakeKeep(r);
      try { shadeBaked(b, this); } catch (e) { G.reportError?.('structures:shade:' + b.name, e); }
      collapseFamilies(b);
      b.userData.block = true;
      this.baked.add(b); this.blocks.push(b);
    }
    scene.add(this.baked);
    return this.baked;
  }
}

/**
 * bakeKeep() in boot time slices: the same merge as core bakeStatic() (same traversal order, attributes, buckets,
 * shadow flags, kept live objects), with `await step()` every few meshes and between the per-material merges.
 */
async function bakeKeepSliced(root, step, label) {
  prepVertexColours(root);
  const pieces = pieceCounts(root);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const buckets = new Map();
  const kept = [], meshes = [];
  const visit = (o) => {
    if (o !== root && o.userData.dynamic) { kept.push(o); return; }
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) {
      const mats = Array.isArray(o.material) ? null : o.material;
      if (mats && o.geometry && o.geometry.attributes.position) meshes.push(o); else kept.push(o);
    } else if (o.isLight || o.isPoints || o.isLine || o.isSprite || o.isInstancedMesh || o.isSkinnedMesh) { kept.push(o); return; }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);
  for (let i = 0; i < meshes.length; i++) {
    const o = meshes[i], mats = o.material;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    rel.multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(rel);
    let b = buckets.get(mats);
    if (!b) buckets.set(mats, (b = { geos: [], cast: false, recv: false }));
    b.geos.push(g);
    b.cast = b.cast || o.castShadow; b.recv = b.recv || o.receiveShadow;
    if (step && (i & 63) === 63) await step(label + ':merge');
  }
  const out = new THREE.Group();
  out.name = root.name || 'baked';
  out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  out.userData = { ...root.userData };
  for (const [mat, b] of buckets) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (step) await step(label + ':merge');
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = b.cast; m.receiveShadow = b.recv;
    out.add(m);
    if (b.geos.length > 1) for (const g of b.geos) g.dispose();
  }
  for (const o of kept) {
    rel.multiplyMatrices(inv, o.matrixWorld);
    o.removeFromParent();
    rel.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  out.name = root.name;
  for (const m of out.children) {
    const list = m.isMesh && pieces.get(m.material);
    if (!list) continue;
    let n = 0; for (const c of list) n += c;
    if (n === m.geometry.attributes.position?.count) m.userData.pieces = list;
  }
  return out;
}
function bakeKeep(root) {
  prepVertexColours(root);
  const pieces = pieceCounts(root);
  const b = bakeStatic(root); b.name = root.name;
  // hand the per-piece vertex ranges to the vertex shading (per-stone / per-plank tone, gradients up each piece)
  for (const m of b.children) {
    const list = m.isMesh && pieces.get(m.material);
    if (!list) continue;
    let n = 0; for (const c of list) n += c;
    if (n === m.geometry.attributes.position?.count) m.userData.pieces = list;
  }
  return b;
}
/** Vertex count of every mesh, per material, in the order bakeStatic() concatenates them (same traversal rules). */
function pieceCounts(root) {
  const out = new Map();
  const visit = (o) => {
    if (o !== root && o.userData.dynamic) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) {
      const m = Array.isArray(o.material) ? null : o.material, P = o.geometry?.attributes?.position;
      if (m && P) { let l = out.get(m); if (!l) out.set(m, (l = [])); l.push(o.geometry.index ? o.geometry.index.count : P.count); }
    } else if (o.isLight || o.isPoints || o.isLine || o.isSprite || o.isInstancedMesh || o.isSkinnedMesh) return;
    for (const c of o.children) visit(c);
  };
  visit(root);
  return out;
}

/**
 * The core bakeStatic() keeps only position / normal / uv, so a staged model with baked vertex colours (refined GLBs)
 * would merge into a `vertexColors` material with no colour attribute -> solid black. Before a bake: meshes whose
 * material wants vertex colours and HAS them are merged here per material (keeping the colours) into one live mesh
 * each; meshes whose material wants them but has none get a clone of the material without vertex colours.
 * Also used by farLOD (which reads the colour attribute).
 */
const _novc = new Map();
/**
 * Sculpted objects (builders/sculpt.js): a white vertex-coloured copy of a site material `m`, in the same surface family
 * as the site's shaded meshes of `m` (same type, surface, look, flags — only the colour differs), so a sculpt's
 * vertex-coloured LOD merges into the family mesh the old primitive version merged into: no added draw call.
 * Meshes using it carry their absolute albedo in the colour attribute (collapseFamilies multiplies by white).
 */
const _sculptVc = new Map();
export function sculptVcMat(m) {
  let v = _sculptVc.get(m);
  if (!v) { v = own(m); v.vertexColors = true; v.color.setRGB(1, 1, 1); v.name = (m.name || '') + '+svc'; _sculptVc.set(m, v); _isVc.add(v); }
  return v;
}
/** Range bookkeeping of sculpt meshes through the merges: each piece's vertex range in the merged geometry. */
function carryRanges(srcGeos, merged) {
  const out = [];
  let off = 0;
  for (const g of srcGeos) {
    for (const r of g.userData.sculptRanges || []) { r.start += off; r.geo = merged; out.push(r); }
    off += g.attributes.position.count;
  }
  if (out.length) merged.userData.sculptRanges = out;
}
export function prepVertexColours(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  const buckets = new Map(), drop = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.dynamic || Array.isArray(o.material) || !o.material) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.dynamic) return;
    const m = o.material, has = !!o.geometry?.attributes?.color;
    if (m.vertexColors && !has) {
      let c = _novc.get(m);
      if (!c) { c = own(m); c.vertexColors = false; c.name = (m.name || '') + '-vc'; _novc.set(m, c); }
      o.material = c;
    } else if (m.vertexColors && has) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const ca = g.attributes.color;
      // normalise to 3-component float colours
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = ca.getX(i); col[i * 3 + 1] = ca.getY(i); col[i * 3 + 2] = ca.getZ(i); }
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (!g.attributes.normal) g.computeVertexNormals();
      // sculpt pieces: same attribute set as the shaded site meshes (uv) so they can join their family
      if (_isVc.has(m)) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      g.morphAttributes = {};
      g.userData = {};
      if (o.userData.sculptRef) {   // builders/sculpt.js: this instance's range, and where it stands (its LOD0 goes there)
        const h = o.userData.sculptRef, r = { start: 0, count: n, geo: null };
        h.ranges.push(r); g.userData.sculptRanges = [r];
        if (!h.recorded) h.recorded = o.matrixWorld.clone();
      }
      rel.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(rel);
      let b = buckets.get(m); if (!b) buckets.set(m, (b = []));
      b.push(g); drop.push(o);
    }
  });
  for (const o of drop) o.visible = false, o.removeFromParent();
  for (const [m, list] of buckets) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    carryRanges(list, merged);
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.dynamic = true; mesh.name = 'vcMerged';
    if (_isVc.has(m)) mesh.userData.famOK = true;   // a sculpt piece: kept out of the bake, merged into its family after
    root.add(mesh);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Baked vertex shading (upgrade 2). Every lit merged mesh of a site gets a vertex colour that the material multiplies:
// darker at ground contact, under the eaves and on soffits, rain streaks on walls, per-tile / per-building variation,
// moss at the foot and on the tops of stone, moss patches on thatch. Materials are swapped for a vertexColors clone.
const _vcMats = new Map();
const _isVc = new WeakSet();
export function vcMat(m) {
  let v = _vcMats.get(m);
  if (!v) { v = own(m); v.vertexColors = true; v.name = (m.name || '') + '+vc'; _vcMats.set(m, v); _isVc.add(v); }
  return v;
}

/**
 * Draw-call pass (docs/api/perf.md "Draw-call pass"): after the vertex shading, every shaded mesh of a baked group
 * whose material differs from another's ONLY by its colour is merged into one mesh per surface family. The material
 * colour is multiplied into the (already present) vertex colour and the family material is white, so the shaded
 * colour is the same number as before (diffuse x vColor). A family = same material type, surface + look, shading
 * flags, program key, and shadow flags of the mesh. Not merged: glow (sky.js finds the night lamp pools by the glow
 * material's colour, the town lamps dim through their material, and a block rarely holds two non-lamp glows of one
 * kind: tried, no gain), mapped materials (far LOD uses a fixed colour for them), farColor, transparent, dynamic.
 * Family materials are cached for the whole game (one material per family across every place).
 */
const _famMats = new Map();
export const familyMaterials = [];
function famKey(mesh) {
  const m = mesh.material;
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || (mesh.userData.dynamic && !mesh.userData.famOK) || !m || Array.isArray(m)) return null;
  if (m.map || m.transparent || m.userData.farColor != null || m.userData.cloth) return null;
  const g = mesh.geometry, A = g?.attributes;
  if (!A?.position || !A.normal || g.morphAttributes?.position) return null;
  if (!_isVc.has(m)) return null;
  if (!A.color || A.color.itemSize !== 3) return null;
  const mk = matFamilyKey(m);
  if (mk == null) return null;
  return [mk, mesh.castShadow ? 1 : 0, mesh.receiveShadow ? 1 : 0, mesh.renderOrder, mesh.layers.mask, mesh.visible ? 1 : 0, Object.keys(A).sort().join(',')].join('|');
}
/** Everything of a lit material that is not its colour (type, flags, program key, surface + look uniforms). */
function matFamilyKey(m) {
  let pk = '';
  try { pk = m.customProgramCacheKey ? m.customProgramCacheKey() : ''; } catch (e) { return null; }
  return [m.type, m.side, m.flatShading ? 1 : 0, m.alphaTest, m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0, m.fog ? 1 : 0, m.toneMapped ? 1 : 0,
    m.gradientMap?.uuid || '', m.emissive ? m.emissive.getHexString() + ':' + m.emissiveIntensity : '', m.polygonOffset ? m.polygonOffsetFactor + ',' + m.polygonOffsetUnits : '',
    m.userData.surface || '', JSON.stringify(m.userData.look || null), /^flora|^terrain|^water|^grass/i.test(m.name || '') ? m.name : '', pk].join('|');
}
/**
 * Props (src/props/models.js): the white family material of a lit vertex-coloured material `m` (no map, not
 * transparent, not cloth), or null. The caller multiplies m.color into its colour attribute.
 */
export function colourFamily(m) {
  if (!m || m.isMeshBasicMaterial || !m.vertexColors || m.map || m.transparent || m.userData.cloth || m.userData.farColor != null) return null;
  if (!(m.isMeshToonMaterial || m.isMeshLambertMaterial)) return null;
  const k = matFamilyKey(m);
  return k == null ? null : familyMat('p|' + k, m);
}
function familyMat(key, rep) {
  let f = _famMats.get(key);
  if (!f) { f = own(rep); f.color.setRGB(1, 1, 1); f.vertexColors = true; f.name = rep.name; f.userData.family = true; _famMats.set(key, f); _isVc.add(f); familyMaterials.push(f); }
  return f;
}
export function collapseFamilies(group) {
  const fams = new Map();
  for (const mesh of group.children) {
    const k = famKey(mesh);
    if (k == null) continue;
    let l = fams.get(k); if (!l) fams.set(k, (l = [])); l.push(mesh);
  }
  const _c = new THREE.Color();
  for (const [k, list] of fams) {
    if (list.length < 2 && list[0].material.userData.family) continue;
    const geos = [];
    for (const mesh of list) {
      const g = mesh.geometry, col = g.attributes.color, c = mesh.material.color, n = col.count;
      _c.copy(c);
      if (_c.r !== 1 || _c.g !== 1 || _c.b !== 1) {
        const arr = col.array;
        for (let i = 0; i < n; i++) { arr[i * 3] *= _c.r; arr[i * 3 + 1] *= _c.g; arr[i * 3 + 2] *= _c.b; }
        col.needsUpdate = true;
      }
      if (!mesh.matrix.equals(_ident)) { mesh.updateMatrix(); g.applyMatrix4(mesh.matrix); }
      geos.push(g);
    }
    const rep = list[0];
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) continue;
    if (geos.length > 1) carryRanges(geos, merged);
    const out = new THREE.Mesh(merged, familyMat(k, rep.material));
    out.castShadow = rep.castShadow; out.receiveShadow = rep.receiveShadow; out.renderOrder = rep.renderOrder; out.layers.mask = rep.layers.mask;
    out.name = rep.name;
    const at = group.children.indexOf(rep);
    for (const mesh of list) { mesh.removeFromParent(); if (geos.length > 1) mesh.geometry.dispose(); }
    group.add(out);
    // keep the place of the first member in the draw order (same sort as before for equal-depth ties)
    group.children.splice(group.children.indexOf(out), 1); group.children.splice(Math.min(at, group.children.length), 0, out);
  }
  return group;
}
const _ident = new THREE.Matrix4();
const sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const n01 = (x, y) => 0.5 + 0.5 * noise2(x, y);
/**
 * Revision r2 — painted crevices on carved stone: a point-based occlusion estimate per vertex (how much of the
 * neighbourhood within r lies IN FRONT of the vertex's normal). Concave places (under the lantern roof, between the
 * petals, where the komainu sits on its pedestal, the joints of stacked pieces) go dark; convex and flat stay clear.
 * Spatial hash, at most 40 neighbours per vertex: a few ms per site at boot, nothing at run time.
 */
/** crevices() in boot time slices (same result): yields through `step` every 2048 vertices. */
async function crevicesSliced(P, N, step, r = 0.2) {
  const n = P.count, occ = new Float32Array(n), inv = 1 / r, r2 = r * r;
  const grid = new Map();
  const key = (ix, iy, iz) => ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) | 0;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(P.getX(i) * inv), Math.floor(P.getY(i) * inv), Math.floor(P.getZ(i) * inv));
    let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i);
  }
  for (let i = 0; i < n; i++) {
    if ((i & 511) === 511) await step('crevices');
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    const ix = Math.floor(x * inv), iy = Math.floor(y * inv), iz = Math.floor(z * inv);
    let s = 0, w = 0, cnt = 0;
    for (let a = -1; a <= 1 && cnt < 40; a++) for (let b = -1; b <= 1 && cnt < 40; b++) for (let c = -1; c <= 1 && cnt < 40; c++) {
      const l = grid.get(key(ix + a, iy + b, iz + c)); if (!l) continue;
      for (let q = 0; q < l.length && cnt < 40; q++) {
        const j = l[q]; if (j === i) continue;
        const dx = P.getX(j) - x, dy = P.getY(j) - y, dz = P.getZ(j) - z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6 || d2 > r2) continue;
        const d = Math.sqrt(d2), f = 1 - d / r, cs = (dx * nx + dy * ny + dz * nz) / d;
        s += Math.max(0, cs) * f; w += f; cnt++;
      }
    }
    occ[i] = w > 0 ? s / w : 0;
  }
  return occ;
}
/** Shade one merged mesh in time slices: the stone crevice term (the slow part) is computed sliced first. */
async function shadeMeshSliced(m, site, step) {
  const mt = m.material;
  if (m.isMesh && !m.isInstancedMesh && !m.userData.dynamic && mt && !Array.isArray(mt) && !mt.isMeshBasicMaterial && !mt.vertexColors && !mt.transparent
    && mt.userData.surface === 'stone' && m.geometry.attributes.position && m.geometry.attributes.normal) {
    m.userData.occ = await crevicesSliced(m.geometry.attributes.position, m.geometry.attributes.normal, step);
    await step(site.name + ':crevices');
  }
  try { shadeBaked({ children: [m] }, site); } catch (e) { G.reportError?.('structures:shade:' + site.name, e); }
  delete m.userData.occ;
  await step(site.name + ':shade');
}
function crevices(P, N, r = 0.2) {
  const n = P.count, occ = new Float32Array(n), inv = 1 / r, r2 = r * r;
  const grid = new Map();
  const key = (ix, iy, iz) => ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) | 0;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(P.getX(i) * inv), Math.floor(P.getY(i) * inv), Math.floor(P.getZ(i) * inv));
    let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(i);
  }
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    const ix = Math.floor(x * inv), iy = Math.floor(y * inv), iz = Math.floor(z * inv);
    let s = 0, w = 0, cnt = 0;
    for (let a = -1; a <= 1 && cnt < 40; a++) for (let b = -1; b <= 1 && cnt < 40; b++) for (let c = -1; c <= 1 && cnt < 40; c++) {
      const l = grid.get(key(ix + a, iy + b, iz + c)); if (!l) continue;
      for (let q = 0; q < l.length && cnt < 40; q++) {
        const j = l[q]; if (j === i) continue;
        const dx = P.getX(j) - x, dy = P.getY(j) - y, dz = P.getZ(j) - z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6 || d2 > r2) continue;
        const d = Math.sqrt(d2), f = 1 - d / r, cs = (dx * nx + dy * ny + dz * nz) / d;
        s += Math.max(0, cs) * f; w += f; cnt++;
      }
    }
    occ[i] = w > 0 ? s / w : 0;
  }
  return occ;
}
/** Shade one baked group of `site` (local frame = site frame). opts.ground=false skips the contact term (sky isles). */
export function shadeBaked(baked, site, opts = {}) {
  const ground = opts.ground !== false;
  const eaves = site.eaves || [];
  for (const mesh of baked.children) {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.userData.dynamic) continue;
    const m = mesh.material;
    if (!m || Array.isArray(m) || m.isMeshBasicMaterial || m.vertexColors || m.transparent) continue;
    const surf = m.userData.surface || 'paint';
    if (surf === 'none') continue;
    const geo = mesh.geometry, P = geo.attributes.position, N = geo.attributes.normal;
    if (!P || !N) continue;
    const n = P.count, col = new Float32Array(n * 3);
    const stoneLike = surf === 'stone' || surf === 'rock', thatch = surf === 'thatch', tile = surf === 'tile', woodish = surf === 'wood' || surf === 'plaster' || surf === 'paint';
    // per-piece frame: [start, y0, y1, tone, warm] (Look round: each stone / plank / post its own tone + gradient)
    const TONE = { stone: 0.32, rock: 0.12, wood: 0.15, plaster: 0.05, paint: 0.05, thatch: 0.06, metal: 0.08, earth: 0.08 }[surf] || 0;
    const pieces = mesh.userData.pieces;
    const occ = surf === 'stone' ? (mesh.userData.occ || crevices(P, N)) : null;
    let pi = -1, pEnd = 0, py0 = 0, py1 = 1, ptone = 1, pwarm = 0;
    const nextPiece = (i) => {
      while (pieces && pEnd <= i && pi < pieces.length - 1) {
        pi++; const st = pEnd; pEnd += pieces[pi];
        let y0 = Infinity, y1 = -Infinity, cx = 0, cz = 0;
        for (let j = st; j < pEnd; j++) { const y = P.getY(j); if (y < y0) y0 = y; if (y > y1) y1 = y; cx += P.getX(j); cz += P.getZ(j); }
        const c = Math.max(1, pEnd - st); cx /= c; cz /= c;
        py0 = y0; py1 = y1;
        const h1 = hash2(cx * 3.17 + site.x, cz * 2.71 + y0 * 1.3), h2 = hash2(cz * 1.93 - y1, cx * 4.07 + site.z);
        ptone = 1 + (h1 - 0.5) * TONE; pwarm = (h2 - 0.5) * TONE * 0.35;
      }
    };
    if (!pieces) { pEnd = n; let y0 = Infinity, y1 = -Infinity; for (let j = 0; j < n; j++) { const y = P.getY(j); if (y < y0) y0 = y; if (y > y1) y1 = y; } py0 = y0; py1 = y1; }
    for (let i = 0; i < n; i++) {
      if (pieces) nextPiece(i);
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), up = N.getY(i);
      const wx = site.wx(x, z), wz = site.wz(x, z);
      let r = 1, g = 1, b = 1, k = 1;
      if (pieces) { k *= ptone; r *= 1 + pwarm; b *= 1 - pwarm; }
      // painted gradient up each piece: a touch darker and warmer low, sun-bleached high; stone gets lit top edges and
      // dark lower joints (the worn arrises catch the light)
      const ph = py1 - py0;
      if (ph > 0.25 && up < 0.6 && (woodish || stoneLike)) {
        const ty = sat((y - py0) / ph);
        k *= 0.9 + 0.14 * ty;
        if (stoneLike && Math.abs(up) < 0.5) { if (ty > 0.97) k *= 1.08; else if (ty < 0.03) k *= 0.9; }
      } else if (stoneLike && up > 0.65 && ph < 0.6) k *= 1.04;
      if (occ) {
        // carved stone, painted: soft top light (tops pale, undersides cool and dark) and dark crevices
        k *= 0.84 + 0.22 * (up * 0.5 + 0.5);
        if (up < -0.3) { k *= 0.82; b *= 1.04; r *= 0.96; }
        if (up > 0.5) { r *= 1.035; b *= 0.95; }                        // sun-warmed tops
        const cv = sat(occ[i] * 3.5);
        k *= 1 - 0.5 * cv; r *= 1 - 0.1 * cv; b *= 1 - 0.16 * cv;     // crevices: deep and olive (old moss), not black
      }
      if (ground) {
        const dy = y - site.hc(x, z);
        // broad soft contact gradient + a narrow damp band at the foot (darker, warmer; not a grey wash)
        const c = sat(dy / 2.2), ao = 0.78 + 0.22 * c * c * (3 - 2 * c);
        const damp = 1 - sat(dy / 0.7);
        const dk = (up > 0.6 ? 0.25 : 1) * (ph < 0.3 ? 0.45 : 1);    // thin slabs: no black skirt
        k *= up > 0.6 ? 1 - (1 - ao) * 0.3 : ao;
        r *= 1 - 0.2 * damp * dk; g *= 1 - 0.24 * damp * dk; b *= 1 - 0.3 * damp * dk;
        // moss / sand gathering at the foot of stone (sides only): olive-dark, patchy
        if (stoneLike && dy < 0.5 && up > -0.3 && up < 0.5) {
          const mm = sat(1 - dy / 0.5) * sat(n01(wx * 1.3, wz * 1.3) * 1.8 - 0.6);
          r *= 1 - 0.24 * mm; g *= 1 - 0.04 * mm; b *= 1 - 0.38 * mm;   // a hint of moss: olive, not black
        }
      }
      // moss / lichen on the tops of stone, patches on thatch
      if (thatch && up > 0.25) {
        const mm = sat((n01(wx * 0.55 + 3.1, wz * 0.55) - 0.62) * 5) * 0.7;
        r *= 1 - 0.3 * mm; g *= 1 - 0.1 * mm; b *= 1 - 0.45 * mm;
        k *= 0.95 + 0.1 * n01(wx * 0.18, wz * 0.18);               // broad sun-bleached / weathered drifts
      } else if (stoneLike && up > 0.65) {
        // weathering on the tops of stone: warm-grey wear and faint lichen, never a green wash
        const mm = sat((n01(wx * 0.55 + 3.1, wz * 0.55) - 0.5) * 4);
        const w = 0.95 + 0.08 * n01(wx * 0.9, wz * 0.9);
        r *= w * (1 - 0.04 * mm); g *= w * (1 - 0.03 * mm); b *= w * (1 - 0.1 * mm);
      }
      // eaves, soffits and per-building tint
      for (let e = 0; e < eaves.length; e++) {
        const f = eaves[e], dx = x - f.x, dz = z - f.z;
        const ax = dx * f.c - dz * f.s, az = dx * f.s + dz * f.c;
        if (Math.abs(ax) > f.hw + 1.4 || Math.abs(az) > f.hd + 1.4) continue;
        r *= f.tint[0]; g *= f.tint[1]; b *= f.tint[2];
        if (y < f.eave + 0.2) {
          if (up < -0.5) k *= 0.78;                                         // soffits, beam undersides
          else if (up < 0.6 && Math.abs(ax) < f.hw + 0.3 && Math.abs(az) < f.hd + 0.3) {
            const d = f.eave - y, s = sat(1 - d / 1.7);                       // stain under the eave: darker, warmer
            k *= 1 - 0.28 * s; r *= 1 + 0.03 * s; b *= 1 - 0.05 * s;
          }
        } else if (thatch || tile) {
          const d = y - f.eave; if (d < 1.0) k *= 0.84 + 0.16 * d;           // rain-darkened eave course
        }
        break;
      }
      // soft vertical weather streaks on walls (broad, low contrast), per-tile variation on roofs
      if (Math.abs(up) < 0.5 && (woodish || stoneLike)) {
        const s2 = n01((wx + wz) * 0.9, y * 0.12 + (wx - wz) * 0.2);
        k *= 0.94 + 0.08 * s2;
      } else if (tile && up > 0.2) {
        k *= 0.94 + 0.1 * hash2(Math.floor(wx / 0.42), Math.floor(wz / 0.42));
      }
      col[i * 3] = r * k; col[i * 3 + 1] = g * k; col[i * 3 + 2] = b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mesh.material = vcMat(m);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Roofs. Footprint half-extents hw (x) / hd (z) including the overhang, rise h, eave at local y = 0.
//   style 'hip'   — four curved slopes, ridge along the longer axis, corners turned up (shrine halls, pavilions)
//   style 'gable' — two curved slopes, ridge along x, open gable ends (town houses, storehouses)
//   style 'thatch'— thick, steep, softly rounded hip of straw (farmhouses)
//   style 'pyramid' — hip with hw == hd (bell pavilion, lantern tower caps)
function profile(s, style) {
  if (style === 'thatch') return 0.62 * s + 0.38 * Math.sin(s * Math.PI * 0.5) ** 2 * s;
  return 0.18 * s + 0.82 * Math.pow(s, 1.75);
}
export function roofParams(o) {
  const th = o.style === 'thatch', sh = !!o.shingle;
  return { hw: o.hw, hd: o.hd, h: o.h, style: o.style || 'hip', lift: o.lift ?? (th ? 0.15 : 0.55), thick: o.thick ?? (th ? 0.75 : sh ? 0.42 : 0.28), tile: o.tile ?? 0.42,
    corr: sh ? 0 : o.corr ?? (th ? 0 : 0.07), shingle: sh, pent: o.ridge === false, sag: o.sag ?? (th ? 0.14 : 0), rafters: o.rafters ?? (!th && Math.min(o.hw, o.hd) > 0.9) };
}
function roofS(P, x, z) {
  const ex = P.hw - Math.abs(x), ez = P.hd - Math.abs(z);
  if (P.style === 'gable') return Math.max(0, Math.min(1, ez / P.hd));
  return Math.max(0, Math.min(1, Math.min(ex, ez) / Math.min(P.hw, P.hd)));
}
/** Height of the roof surface (without tile corrugation) above the eave line at local (x,z). */
export function roofY(P, x, z) {
  const s = roofS(P, x, z);
  const ux = Math.min(1, Math.abs(x) / P.hw), uz = Math.min(1, Math.abs(z) / P.hd);
  let lift;
  if (P.style === 'gable') lift = P.lift * Math.pow(ux, 6) * (1 - s);
  else lift = P.lift * Math.pow(ux * uz, 2.4);
  return P.h * profile(s, P.style) + lift;
}
/** outward direction (xz) of a point on the roof rim: axis-aligned on the sides, diagonal at the corners */
function rimOut(P, x, z) {
  const ax = Math.sign(x) * Math.pow(Math.min(1, Math.abs(x) / P.hw), 10), az = Math.sign(z) * Math.pow(Math.min(1, Math.abs(z) / P.hd), 10);
  const l = Math.hypot(ax, az) || 1;
  return [ax / l, az / l];
}
/** merge simple primitives (geometry + matrix) into one non-indexed geometry with position + normal */
function mergePrims(list) {
  if (!list.length) return null;
  const gs = list.map(([g, m]) => { const q = (g.index ? g.toNonIndexed() : g.clone()); for (const n of Object.keys(q.attributes)) if (n !== 'position' && n !== 'normal') q.deleteAttribute(n); q.applyMatrix4(m); return q; });
  const out = mergeGeometries(gs, false);
  for (const g of gs) g.dispose();
  return out;
}
const _bx = new THREE.BoxGeometry(1, 1, 1);
// eave-end disc: a 6-sided drum with only its outer (+y) cap — 18 triangles instead of a closed 8-sided cylinder's 32
const _cy8 = (() => {
  const side = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), cap = new THREE.CircleGeometry(1, 6);
  cap.rotateX(-Math.PI / 2); cap.rotateY(Math.PI / 2); cap.translate(0, 0.5, 0);
  for (const q of [side, cap]) q.deleteAttribute('uv');
  return mergeGeometries([side.toNonIndexed(), cap.toNonIndexed()], false);
})();
const _mm = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _v4 = new THREE.Vector3(), _s4 = new THREE.Vector3();
function primM(px, py, pz, ry, sx, sy, sz, rx = 0, rz = 0) {
  _e4.set(rx, ry, rz, 'YXZ'); _q4.setFromEuler(_e4);
  return new THREE.Matrix4().compose(_v4.set(px, py, pz), _q4, _s4.set(sx, sy, sz));
}
/**
 * Tiled hip / hip-and-gable top: four trapezoid panels, each fine ACROSS the slope (one vertex per half tile, the
 * corrugation) and coarse DOWN it (the profile curve needs ~6-9 rows) — about a third of the uniform grid's
 * triangles. Rows stay parallel to the eave and are clipped by the hip line (the hip roll covers the seam). The
 * eave row is flat, so the fascia is a straight edge under the round eave-end tiles.
 */
function hipTiled(P, step, coarse) {
  const pos = [], idx = [];
  const d = Math.min(P.hw, P.hd);
  const nv = Math.max(4, Math.min(9, Math.round(d / 0.5)));
  const amp = coarse ? 0 : P.corr;
  for (const [ex, ez] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const half = ex ? P.hd : P.hw;
    const nu = Math.max(4, Math.min(120, Math.round((2 * half) / step)));
    const base = pos.length / 3;
    for (let v = 0; v <= nv; v++) {
      const dep = (v / nv) * d, w = Math.max(0, half - dep);
      for (let u = 0; u <= nu; u++) {
        const a0 = -half + (2 * half * u) / nu, a = Math.max(-w, Math.min(w, a0));
        const x = ex ? ex * (P.hw - dep) : a, z = ex ? a : ez * (P.hd - dep);
        let y = roofY(P, x, z);
        if (v > 0 && u % 2 && Math.abs(a0) < w - 0.02) y += amp;
        pos.push(x, y, z);
      }
    }
    const R = nu + 1;
    const flip = ez === 1 || ex === -1; // keep every panel facing up
    for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) {
      const a = base + v * R + u, b = a + 1, c = a + R + 1, dd = a + R;
      if (flip) idx.push(a, b, dd, b, c, dd); else idx.push(a, dd, b, b, dd, c);
    }
    // fascia under the eave row
    const fb = pos.length / 3;
    for (let u = 0; u <= nu; u++) { const i = base + u; pos.push(pos[i * 3], pos[i * 3 + 1] - P.thick, pos[i * 3 + 2]); }
    for (let u = 0; u < nu; u++) {
      const t0 = base + u, t1 = t0 + 1, b0 = fb + u, b1 = b0 + 1;
      if (flip) idx.push(t0, b0, t1, t1, b0, b1); else idx.push(t0, t1, b0, t1, b1, b0);
    }
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  top.setIndex(idx);
  top.computeVertexNormals();
  return top;
}
const roofCache = new Map();
/** { top (surface + fascia), under (soffit), bands:[geo per edge layer], rafters, eaveTiles } — cached by params */
/**
 * Roof UVs for the straw map (revision r2): u runs around the eave ring (hip: the four sides in turn, continuous across
 * the hips, the ring length an integer number of tiles so the one seam at the (-x, +z) hip matches; gable: along x),
 * v = slope length from the eave in tiles, NEGATIVE going up (so v grows down the slope, as the map is painted).
 */
function roofUV(P) {
  const gable = P.style === 'gable', m = gable ? P.hd : Math.min(P.hw, P.hd);
  const NS = 48, arc = new Float32Array(NS + 1);
  for (let i = 1, py = 0; i <= NS; i++) { const y = P.h * profile(i / NS, P.style); arc[i] = arc[i - 1] + Math.hypot(m / NS, y - py); py = y; }
  const arcAt = (s) => { const f = Math.max(0, Math.min(1, s)) * NS, i = Math.min(NS - 1, Math.floor(f)); return arc[i] + (arc[i + 1] - arc[i]) * (f - i); };
  const total = gable ? 2 * P.hw : 4 * (P.hw + P.hd);
  const n = Math.max(1, Math.round(total / THATCH_TILE)), Tu = total / n;
  const f = (x, z) => {
    let a;
    if (gable) a = x + P.hw;
    else {
      const ex = P.hw - Math.abs(x), ez = P.hd - Math.abs(z), e = Math.max(0, Math.min(ex, ez));
      if (ez <= ex) { const h = Math.max(1e-3, P.hw - e), t = Math.max(0, Math.min(1, (x + h) / (2 * h))); a = z > 0 ? t * 2 * P.hw : 2 * P.hw + 2 * P.hd + (1 - t) * 2 * P.hw; }
      else { const h = Math.max(1e-3, P.hd - e), t = Math.max(0, Math.min(1, (z + h) / (2 * h))); a = x > 0 ? 2 * P.hw + (1 - t) * 2 * P.hd : 4 * P.hw + 2 * P.hd + t * 2 * P.hd; }
    }
    return [a / Tu, -arcAt(roofS(P, x, z)) / THATCH_TILE];
  };
  return { f, n: gable ? 0 : n };
}
/** non-indexed geometry: a triangle straddling the ring seam gets its small u values lifted by n (one ring) */
function fixUVSeam(g, n) {
  if (!n) return;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 3) {
    const a = uv.getX(i), b = uv.getX(i + 1), c = uv.getX(i + 2);
    if (Math.max(a, b, c) - Math.min(a, b, c) > n / 2) for (let k = 0; k < 3; k++) if (uv.getX(i + k) < n / 2) uv.setX(i + k, uv.getX(i + k) + n);
  }
}

export function roofGeometry(o) {
  const P = roofParams(o);
  const k = JSON.stringify(P);
  if (roofCache.has(k)) return roofCache.get(k);
  const coarse = G.quality?.name === 'low' || G.quality?.name === 'med';
  // tile rows: 2 vertices per tile on 'high'; on med / low the rows come from the surface texture only (coarse grid)
  const step = P.corr > 0 ? (coarse ? Math.max(0.6, P.tile * 1.5) : P.tile / 2) : 0.5;
  const nx = Math.max(4, Math.min(120, Math.round((2 * P.hw) / step)));
  const nz = Math.max(4, Math.min(120, Math.round((2 * P.hd) / (P.style === 'gable' ? Math.max(step, 0.6) : step))));
  const hipT = P.corr > 0 && P.style !== 'gable';
  const pos = [], idx = [];
  const vid = (arr) => { pos.push(...arr); return pos.length / 3 - 1; };
  const T = [], B = [], TP = [], loop = [];
  let top;
  if (hipT) top = hipTiled(P, step, coarse);
  else {
  for (let i = 0; i <= nx; i++) {
    T.push([]); B.push([]); TP.push([]);
    for (let j = 0; j <= nz; j++) {
      const x = -P.hw + (2 * P.hw * i) / nx, z = -P.hd + (2 * P.hd * j) / nz;
      let y = roofY(P, x, z);
      const sEdge = roofS(P, x, z);
      if (P.sag) { const along = P.hw >= P.hd ? x / P.hw : z / P.hd; y -= P.sag * Math.sin(Math.PI * sEdge) * (1 - along * along * 0.7); }
      const yb = y - P.thick;
      if (P.corr > 0) {
        const ex = P.hw - Math.abs(x), ez = P.hd - Math.abs(z);
        const side = P.style === 'gable' || ex >= ez;
        const par = side ? i % 2 : j % 2;
        // eave row flat: a straight fascia under the round eave-end tiles (no saw-tooth)
        y += par && sEdge > 1e-4 && !(G.quality?.name === 'low' || G.quality?.name === 'med') ? P.corr : 0;
      } else if (P.style === 'thatch') {
        y += 0.06 * Math.sin(x * 3.1 + z * 1.7) * Math.sin(z * 2.3 - x * 0.7);
      }
      T[i][j] = vid([x, y, z]);
      B[i][j] = [x, yb, z];
      TP[i][j] = [x, y, z];
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = T[i][j], b = T[i + 1][j], c = T[i + 1][j + 1], d = T[i][j + 1];
    idx.push(a, d, b, b, d, c);
  }
  // fascia: boundary loop top -> bottom
  for (let i = 0; i < nx; i++) loop.push([i, 0]);
  for (let j = 0; j < nz; j++) loop.push([nx, j]);
  for (let i = nx; i > 0; i--) loop.push([i, nz]);
  for (let j = nz; j > 0; j--) loop.push([0, j]);
  for (let q = 0; q < loop.length; q++) {
    const [i0, j0] = loop[q], [i1, j1] = loop[(q + 1) % loop.length];
    const t0 = T[i0][j0], t1 = T[i1][j1];
    const b0 = vid(B[i0][j0]), b1 = vid(B[i1][j1]);
    idx.push(t0, t1, b0, t1, b1, b0);
  }
  top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  top.setIndex(idx);
  top.computeVertexNormals();
  // straw map UVs (the fascia ring sits just below the eave line); non-indexed so the seam triangles can be fixed —
  // the bake converts to non-indexed anyway, so this costs no vertices
  const RU = roofUV(P), nT = (nx + 1) * (nz + 1), uvs = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) { const [u, v] = RU.f(pos[i * 3], pos[i * 3 + 2]); uvs[i * 2] = u; uvs[i * 2 + 1] = v + (i >= nT ? 0.03 : 0); }
  top.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  top = top.toNonIndexed();
  fixUVSeam(top, RU.n);
  }
  // soffit, coarse
  const up = [], ui = [];
  const mx = Math.max(4, Math.round(nx / 4)), mz = Math.max(4, Math.round(nz / 4));
  for (let i = 0; i <= mx; i++) for (let j = 0; j <= mz; j++) {
    const x = -P.hw + (2 * P.hw * i) / mx, z = -P.hd + (2 * P.hd * j) / mz;
    up.push(x, roofY(P, x, z) - P.thick, z);
  }
  for (let i = 0; i < mx; i++) for (let j = 0; j < mz; j++) {
    const a = i * (mz + 1) + j, b = (i + 1) * (mz + 1) + j, c = b + 1, d = a + 1;
    ui.push(a, b, d, b, c, d);
  }
  const under = new THREE.BufferGeometry();
  under.setAttribute('position', new THREE.Float32BufferAttribute(up, 3));
  under.setIndex(ui);
  under.computeVertexNormals();

  // --- layered eave edge (thatch: thick cut fringe in two courses; shingle: three thin laminated layers) ---
  // rim points subdivided (fringe teeth ~0.17 m), each band = outer face + (last band) underside back to the soffit
  const rim = [];
  const sub = P.style === 'thatch' ? 3 : 1;
  if (!hipT) for (let q = 0; q < loop.length; q++) {
    const [i0, j0] = loop[q], [i1, j1] = loop[(q + 1) % loop.length];
    const a = TP[i0][j0], b = TP[i1][j1];
    for (let u = 0; u < sub; u++) { const f = u / sub; rim.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - (P.corr > 0 ? 0 : 0), a[2] + (b[2] - a[2]) * f]); }
  }
  const RUb = P.style === 'thatch' ? roofUV(P) : null;
  const bandGeo = (o0, d0, o1, d1, jit, underside, seed) => {
    const bp = [], bu = [], n = rim.length, th = P.thick;
    // revision r2: one clean, thick cut edge — the lower line only swells gently along the eave (no stepped teeth)
    const pt = (q, o, d, j) => { const p = rim[q % n], [ox, oz] = rimOut(P, p[0], p[2]); const jj = j ? j * 0.15 * Math.sin(q * 0.37 + seed * 2.1) : 0; return [p[0] + ox * o, p[1] - d * th - jj, p[2] + oz * o]; };
    // straw map coordinates: u of the rim point, v inside the lit cut tips of the last course (stretched down the face)
    const uq = (q) => (RUb ? RUb.f(rim[q % n][0], rim[q % n][2])[0] : 0);
    const V0 = -0.045, V1 = -0.012;
    for (let q = 0; q < n; q++) {
      const t0 = pt(q, o0, d0, 0), t1 = pt(q + 1, o0, d0, 0);
      const jb0 = pt(q, o1, d1, jit), b1 = pt(q + 1, o1, d1, jit);
      const u0 = uq(q), u1 = uq(q + 1);
      bp.push(...t0, ...t1, ...jb0, ...t1, ...b1, ...jb0);
      bu.push(u0, V0, u1, V0, u0, V1, u1, V0, u1, V1, u0, V1);
      if (underside) {
        const p0 = rim[q], p1 = rim[(q + 1) % n];
        const [ox0, oz0] = rimOut(P, p0[0], p0[2]), [ox1, oz1] = rimOut(P, p1[0], p1[2]);
        const i0 = [p0[0] - ox0 * 0.35, p0[1] - th - 0.02, p0[2] - oz0 * 0.35], i1 = [p1[0] - ox1 * 0.35, p1[1] - th - 0.02, p1[2] - oz1 * 0.35];
        bp.push(...jb0, ...b1, ...i0, ...b1, ...i1, ...i0);
        bu.push(u0, V1, u1, V1, u0, V1, u1, V1, u1, V1, u0, V1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
    if (RUb) fixUVSeam(g, RUb.n);
    g.computeVertexNormals();
    return g;
  };
  const bands = [];
  if (P.style === 'thatch') {
    bands.push(bandGeo(0.03, 0.0, 0.16, 0.62, 0.14, false, 1));
    bands.push(bandGeo(0.16, 0.5, 0.08, 1.12, 0.16, true, 2));
  } else if (P.shingle) {
    bands.push(bandGeo(0.0, 0.0, 0.05, 0.4, 0, false, 1));
    bands.push(bandGeo(0.05, 0.4, 0.08, 0.72, 0, false, 2));
    bands.push(bandGeo(0.08, 0.72, 0.1, 1.08, 0, true, 3));
  }
  // --- rafter ends under the eaves ---
  const rafterList = [];
  if (P.rafters) {
    const edges = P.style === 'gable' ? [[0, 1], [0, -1]] : [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [ex, ez] of edges) {
      const along = ex ? P.hd : P.hw, half = ex ? P.hw : P.hd;
      const n = Math.max(2, Math.floor((2 * along - (P.style === 'gable' ? 0.4 : 1.6)) / 0.45));
      for (let r = 0; r <= n; r++) {
        const a = -along + (P.style === 'gable' ? 0.2 : 0.8) + ((2 * along - (P.style === 'gable' ? 0.4 : 1.6)) * r) / n;
        const inset = 0.42;
        const x = ex ? ex * (half - inset) : a, z = ex ? a : ez * (half - inset);
        const ye = roofY(P, ex ? ex * (half - 0.05) : a, ex ? a : ez * (half - 0.05)) - P.thick, yi = roofY(P, x, z) - P.thick;
        const pitch = Math.atan2(yi - ye, inset);
        const len = 0.85;
        rafterList.push([_bx, primM(x + ex * (len / 2 - inset + 0.02), (ye + yi) / 2 - 0.08, z + ez * (len / 2 - inset + 0.02), ex ? Math.PI / 2 : 0, 0.1, 0.12, len, (ex || ez) * pitch, 0)]);
      }
    }
  }
  // --- eave-end tiles (round discs at every tile ridge) and the flat lip tiles between ---
  const eaveList = [];
  if (P.corr > 0 && Math.min(P.hw, P.hd) > 0.7) {
    const sides = P.style === 'gable' ? [[0, 1], [0, -1]] : [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [ex, ez] of sides) {
      const cnt = ex ? nz : nx;
      for (let c = 1; c < cnt; c++) {
        const x = ex ? ex * P.hw : -P.hw + (2 * P.hw * c) / nx, z = ex ? -P.hd + (2 * P.hd * c) / nz : ez * P.hd;
        if (P.style !== 'gable' && (Math.abs(Math.abs(x) - P.hw) < 0.3 && Math.abs(Math.abs(z) - P.hd) < 0.3) && !(ex ? 0 : 1)) continue;
        const y = roofY(P, x, z);
        if (P.pent && ez < 0) continue;                              // pent roof: the upper edge is against the wall
        if (c % 2) eaveList.push([_cy8, primM(x + ex * 0.05, y + P.corr * 0.55 - 0.03, z + ez * 0.05, Math.atan2(ex, ez), P.tile * 0.3, 0.1, P.tile * 0.3, Math.PI / 2)]);
        // (the flat lip tiles between the discs went with the flat eave row: the fascia already reads as that lip)
      }
    }
  }
  const out = { top, under, P, bands, rafters: mergePrims(rafterList), eaveTiles: mergePrims(eaveList) };
  roofCache.set(k, out);
  return out;
}

const _tube = new Map();
function ridgeTube(pts, r, key, radial = 6, segK = 2) {
  let g = key && _tube.get(key);
  if (g) return g;
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  g = new THREE.TubeGeometry(curve, Math.max(4, Math.round(pts.length * segK)), r, radial, false);
  if (key) _tube.set(key, g);
  return g;
}
/** Ridge-end ornament (onigawara): an extruded demon-tile silhouette (arched crown with flared horns, stepped
 *  shoulders), soft bevel, a round boss with a rim on the face. s = size. Faces +z. */
const _oniGeo = new Map();
function oniGeo(kind, fine) {
  kind += fine ? ':f' : ':c';
  let g = _oniGeo.get(kind);
  if (g) return g;
  const sh = new THREE.Shape();
  sh.moveTo(-0.36, 0); sh.lineTo(0.36, 0); sh.lineTo(0.37, 0.3);
  sh.quadraticCurveTo(0.46, 0.42, 0.52, 0.74);              // flaring horn
  sh.quadraticCurveTo(0.4, 0.66, 0.3, 0.66);
  sh.quadraticCurveTo(0.22, 0.86, 0, 0.88);                // arched crown
  sh.quadraticCurveTo(-0.22, 0.86, -0.3, 0.66);
  sh.quadraticCurveTo(-0.4, 0.66, -0.52, 0.74);
  sh.quadraticCurveTo(-0.46, 0.42, -0.37, 0.3);
  sh.closePath();
  g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: fine ? 2 : 1, curveSegments: fine ? 5 : 3 });
  g.translate(0, 0, -0.1);
  _oniGeo.set(kind, g);
  return g;
}
const _oniRimF = new THREE.TorusGeometry(0.17, 0.022, 4, 16);
function oniTile(mat, s = 1) {
  const g = new THREE.Group();
  // small ridge ends (town houses, sheds) get a coarser profile: they are seen from 10 m+, and there are hundreds
  const fine = s >= 0.8;
  const m = new THREE.Mesh(oniGeo('oni', fine), mat); m.scale.setScalar(s); m.castShadow = m.receiveShadow = true; g.add(m);
  const boss = cyl(0.13 * s, 0.15 * s, 0.07 * s, mat, 0, 0.4 * s, 0.14 * s, fine ? 12 : 8); boss.rotation.x = Math.PI / 2; g.add(boss);
  if (!fine) return g;
  const rim = new THREE.Mesh(_oniRimF, mat); rim.scale.setScalar(s); rim.position.set(0, 0.4 * s, 0.13 * s); g.add(rim);
  for (const sx of [-1, 1]) { const k = sphere(0.045 * s, mat, sx * 0.22 * s, 0.18 * s, 0.13 * s, 6, 4); g.add(k); }
  return g;
}
/**
 * Chigi blade: one board of the crossed gable finial, length L (along +y, centred), with the tip cut in a fork
 * (V notch) and a rectangular wind window near the top; extruded `thick` along x, soft bevel. Cached by size.
 */
const _chigi = new Map();
export function chigiBlade(mat, L = 1.7, wdt = 0.32, thick = 0.12) {
  const k = L + ',' + wdt + ',' + thick;
  let geo = _chigi.get(k);
  if (!geo) {
    const h = L / 2, w = wdt / 2, sh = new THREE.Shape();
    sh.moveTo(-w, -h); sh.lineTo(w, -h); sh.lineTo(w, h - 0.02); sh.lineTo(w * 0.15, h - wdt * 0.55); sh.lineTo(-w, h + wdt * 0.25); sh.closePath();
    const hole = new THREE.Path(); const hy = h - wdt * 1.6;
    hole.moveTo(-w * 0.45, hy - wdt * 0.5); hole.lineTo(w * 0.45, hy - wdt * 0.5); hole.lineTo(w * 0.45, hy + wdt * 0.25); hole.lineTo(-w * 0.45, hy + wdt * 0.25); hole.closePath();
    sh.holes.push(hole);
    geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 1, curveSegments: 2 });
    geo.translate(0, 0, -thick / 2); geo.rotateY(Math.PI / 2);
    _chigi.set(k, geo);
  }
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
  return m;
}
/** Katsuogi: a spindle-shaped log laid across the ridge (axis z), lathe-turned, with metal end caps. */
export function katsuogi(mat, capMat, len = 1.4, r = 0.18) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 8; i++) { const f = i / 8; pts.push(new THREE.Vector2(Math.max(1e-3, r * (0.78 + 0.22 * Math.sin(Math.PI * f))), -len / 2 + f * len)); }
  pts.unshift(new THREE.Vector2(1e-3, -len / 2)); pts.push(new THREE.Vector2(1e-3, len / 2));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), mat); body.rotation.x = Math.PI / 2; body.castShadow = true; g.add(body);
  for (const s of [-1, 1]) { const c = cyl(r * 0.84, r * 0.84, 0.07, capMat, 0, 0, s * (len / 2 - 0.02), 10); c.rotation.x = Math.PI / 2; g.add(c); }
  return g;
}
/** Shachi (golden tiger-fish) ridge ornament for palace roofs: arched body of tapering segments, head down at the
 *  ridge, tail flicked up, dorsal / pectoral fins. s = size (1 = 1.1 m tall). Faces +z (head side toward the ridge end). */
export function shachi(mat, s = 1) {
  const g = new THREE.Group();
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = (0.15 + 0.85 * Math.sin(t * Math.PI * 0.55)) * s, z = (0.32 - 0.62 * t + 0.25 * t * t) * s;
    const r = (0.2 * (1 - t) + 0.05) * s * (i === 0 ? 0.85 : 1);
    const b = sphere(r, mat, 0, y, z, 8, 6); b.scale.set(0.8, 1, 1.25); g.add(b);
  }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.quadraticCurveTo(0.18, 0.1, 0.3, 0.32); fin.quadraticCurveTo(0.12, 0.2, 0, 0.12); fin.closePath();
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.03, bevelEnabled: false, curveSegments: 4 });
  const tail = new THREE.Mesh(fg, mat); tail.scale.setScalar(s * 1.5); tail.rotation.y = Math.PI / 2; tail.position.set(0, 0.95 * s, -0.12 * s); g.add(tail);
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(fg, mat); f.scale.setScalar(s * 0.8); f.rotation.set(0, sx * 0.4, -sx * 0.9); f.position.set(sx * 0.12 * s, 0.32 * s, 0.18 * s); g.add(f); }
  const dorsal = new THREE.Mesh(fg, mat); dorsal.scale.setScalar(s); dorsal.rotation.set(0, Math.PI / 2, 0.4); dorsal.position.set(0, 0.62 * s, 0.12 * s); g.add(dorsal);
  for (const sx of [-1, 1]) g.add(sphere(0.035 * s, M.black(), sx * 0.11 * s, 0.24 * s, 0.38 * s, 6, 4));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/**
 * A complete roof group (eave at y = 0): surface, soffit, layered eave edge, rafter ends, eave-end tiles, ridge
 * (stacked ridge tiles + roll, or a thatch saddle with crossed poles), hip rolls and ridge-end ornaments.
 * o: { hw, hd, h, style, mat, underMat, ridgeMat, rafterMat, edgeMat, lift, thick, tile, corr, shingle, sag, rafters, finial }
 * Returns { group, P, pads:[{hw,hd,top}] } — pads are flat landing boxes that approximate the upper roof.
 */
export function makeRoof(o) {
  const geo = roofGeometry(o);
  const { top, under, P } = geo;
  const g = new THREE.Group();
  const thatch = P.style === 'thatch';
  const mat = o.mat || (P.shingle ? M.shingle() : M.tile());
  const m1 = new THREE.Mesh(top, mat); m1.castShadow = m1.receiveShadow = true; g.add(m1);
  const m2 = new THREE.Mesh(under, o.underMat || M.woodDark()); m2.receiveShadow = true; g.add(m2);
  // layered edge
  const bandMats = thatch ? [mat, o.edgeMat || M.thatchCut()] : [mat, o.edgeMat || M.shingleEdge(), mat];
  geo.bands.forEach((bg, i) => { const bm = new THREE.Mesh(bg, bandMats[i] || mat); bm.castShadow = bm.receiveShadow = true; g.add(bm); });
  if (geo.rafters) { const rm = new THREE.Mesh(geo.rafters, o.rafterMat || o.underMat || M.woodDark()); rm.receiveShadow = true; g.add(rm); }
  if (geo.eaveTiles) { const em = new THREE.Mesh(geo.eaveTiles, o.eaveMat || mat); em.receiveShadow = true; g.add(em); }
  const ridgeMat = o.ridgeMat || (thatch ? M.thatchDark() : P.shingle ? M.shingleEdge() : M.tileRidge());
  const rr = thatch ? 0.32 : 0.14;
  const k = JSON.stringify(P);
  const lift = (x, z, extra) => [x, roofY(P, x, z) + (P.corr || 0) + extra, z];
  const big = Math.min(P.hw, P.hd) > 1.1;
  if (o.ridge === false) { /* pent roof (hisashi): a bare tiled slab, no ridge, verges or ridge-end tiles */ }
  else if (P.style === 'gable') {
    const pts = []; for (let i = 0; i <= 8; i++) { const x = -P.hw + (2 * P.hw * i) / 8; pts.push(lift(x, 0, rr * 0.4)); }
    // stacked ridge tiles (noshi) under the roll
    if (big && !thatch) for (let i = 0; i < 8; i++) { const a = pts[i], b = pts[i + 1]; g.add(beam(a[0], a[1] - 0.1, 0, b[0], b[1] - 0.1, 0, 0.36, 0.24, ridgeMat)); }
    const tm = new THREE.Mesh(ridgeTube(pts, rr * 1.2, k + 'r'), ridgeMat); g.add(tm);
    // verge boards along the gable edges
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const vp = []; for (let i = 0; i <= 6; i++) { const z = (sz * P.hd * i) / 6; vp.push(lift(sx * (P.hw - 0.05), z, -P.thick * 0.3)); }
      g.add(new THREE.Mesh(ridgeTube(vp, 0.09, k + 'v' + sx + sz, 4, 1), ridgeMat)); // verge board: square section
    }
    for (const sx of [-1, 1]) {
      if (big) { const e = oniTile(ridgeMat, Math.min(1.2, P.h / 1.6)); e.position.set(sx * (P.hw - 0.1), pts[sx < 0 ? 0 : 8][1] - 0.15, 0); e.rotation.y = sx * Math.PI / 2; g.add(e); }
      else { const e = oniTile(ridgeMat, 0.5); e.position.set(sx * (P.hw - 0.05), pts[sx < 0 ? 0 : 8][1] - 0.1, 0); e.rotation.y = sx * Math.PI / 2; g.add(e); }
    }
  } else {
    const m = Math.min(P.hw, P.hd);
    const rx = P.hw - m, rz = P.hd - m;
    const yTop = P.h + (P.corr || 0) + rr * 0.4;
    if (rx > 0.05 || rz > 0.05) {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const f = -1 + (2 * i) / 6; pts.push([f * rx, yTop, f * rz]); }
      if (!thatch) {
        g.add(new THREE.Mesh(ridgeTube(pts, rr * 1.25, k + 'r'), ridgeMat));
        if (big) g.add(beam(-rx, yTop - 0.12, -rz, rx, yTop - 0.12, rz, 0.4, 0.3, ridgeMat));
      }
    }
    if (!thatch) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const hp = [];
      for (let i = 0; i <= 8; i++) {
        const f = i / 8;
        const x = sx * (rx + (P.hw - rx) * f), z = sz * (rz + (P.hd - rz) * f);
        hp.push(lift(x * (i === 8 ? 0.985 : 1), z * (i === 8 ? 0.985 : 1), rr * 0.3));
      }
      g.add(new THREE.Mesh(ridgeTube(hp, rr, k + 'h' + sx + sz), ridgeMat));
      if (big) { const c = cone(rr * 1.6, 0.42, ridgeMat, hp[8][0], hp[8][1] + 0.1, hp[8][2], 6); c.rotation.set(sz * 0.6, 0, -sx * 0.6); g.add(c); }
    } else for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      // thatch hips: soft rolled ridge of darker straw
      const hp = [];
      for (let i = 0; i <= 8; i++) { const f = i / 8; const x = sx * (rx + (P.hw - rx) * f), z = sz * (rz + (P.hd - rz) * f); hp.push([x * (i === 8 ? 0.97 : 1), roofY(P, x, z) + rr * 0.15, z * (i === 8 ? 0.97 : 1)]); }
      g.add(new THREE.Mesh(ridgeTube(hp, rr * 0.8, k + 'h' + sx + sz), ridgeMat));
    }
    if (thatch) {
      // ridge saddle: a dark capped bundle along the ridge, crossed poles riding it, bound with rope
      const alongX = rx >= rz, L = Math.max(rx, rz) + 0.55;
      const sd = o.saddleMat || M.woodDark();
      const yS = P.h + 0.18;
      if (alongX) g.add(box(2 * L, 0.42, 0.95, sd, 0, yS, 0)); else g.add(box(0.95, 0.42, 2 * L, sd, 0, yS, 0));
      g.add(alongX ? box(2 * L + 0.2, 0.16, 0.7, ridgeMat, 0, yS + 0.26, 0) : box(0.7, 0.16, 2 * L + 0.2, ridgeMat, 0, yS + 0.26, 0));
      const nPoles = Math.max(2, Math.round((2 * L) / 0.8));
      for (let i = 0; i <= nPoles; i++) {
        const a = -L + 0.15 + ((2 * L - 0.3) * i) / nPoles;
        for (const s of [-1, 1]) {
          if (alongX) g.add(rod(a, yS - 0.45, s * 0.75, a, yS + 0.62, -s * 0.5, 0.045, sd, 5));
          else g.add(rod(s * 0.75, yS - 0.45, a, -s * 0.5, yS + 0.62, a, 0.045, sd, 5));
        }
        if (alongX) g.add(box(0.12, 0.1, 0.16, M.rope(), a, yS + 0.36, 0)); else g.add(box(0.16, 0.1, 0.12, M.rope(), 0, yS + 0.36, a));
      }
    } else {
      if (rx > 0.05 || rz > 0.05) for (const s of [-1, 1]) {
        if (o.shachi) { const e = shachi(o.shachi, Math.min(1.5, P.h / 2.6)); e.position.set(s * rx, yTop - 0.1, s * rz); e.rotation.y = rz > rx ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2); g.add(e); }
        else if (big) { const e = oniTile(ridgeMat, Math.min(1.3, P.h / 2.2)); e.position.set(s * rx, yTop - 0.2, s * rz); e.rotation.y = rz > rx ? 0 : Math.PI / 2; g.add(e); }
        else { const e = oniTile(ridgeMat, 0.55); e.position.set(s * rx, yTop - 0.05, s * rz); e.rotation.y = rz > rx ? 0 : Math.PI / 2; g.add(e); }
      } else g.add(o.finial ? o.finial : cone(0.22, 0.9, M.gold(), 0, yTop + 0.4, 0, 8));
    }
  }
  // landing pads
  const pads = [];
  const bands = [[0.45, 0.58], [0.72, 0.8], [0.9, 0.95]];
  for (const [b, sv] of bands) {
    let hw, hd;
    if (P.style === 'gable') { hw = P.hw * 0.96; hd = P.hd * (1 - b); }
    else { const m = Math.min(P.hw, P.hd); hw = P.hw - b * m; hd = P.hd - b * m; }
    if (hw < 0.3 || hd < 0.3) continue;
    pads.push({ hw, hd, top: P.h * profile(sv, P.style) + (P.corr || 0) });
  }
  return { group: g, P, pads };
}

// ---------------------------------------------------------------------------------------------------------------
// Small reusable bits
export function addAll(g, ...objs) { for (const o of objs) if (o) g.add(o); return g; }
/** Box between two local points on the xz plane (beams, rails, ropes): from (x0,y0,z0) to (x1,y1,z1), section w x h. */
export function beam(x0, y0, z0, x1, y1, z1, w, h, mat) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const m = box(w, h, len, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx, dy, dz).normalize());
  return m;
}
/** Cylinder between two points (posts, poles, rope segments). */
export function rod(x0, y0, z0, x1, y1, z1, r, mat, seg = 6) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const m = cyl(r, r, len, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, seg);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  return m;
}
/** Sagging rope (catenary-ish) between two points as a tube; returns { mesh, points(n) } to hang things on. */
export function rope(a, b, sag, r, mat, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f), a[2] + (b[2] - a[2]) * f));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, r, 5, false);
  const mesh = new THREE.Mesh(g, mat); mesh.castShadow = false;
  return { mesh, at: (f) => { const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f - sag * 4 * f * (1 - f), z = a[2] + (b[2] - a[2]) * f; return [x, y, z]; } };
}

// ---------------------------------------------------------------------------------------------------------------
// Text on canvas (signs, noren, banners), written by hand (builders/lettering.js). Text must already be translated (t()).
// style: 'cloth' | 'resist' | 'paper' | 'inkwood' | 'board' | 'gilded' (inferred from bg / fg when absent);
// crest: 'sun' | 'fox' | 'lantern' | 'wave' | 'crescent' (vertical: above the text; horizontal: lower right corner).
// w / h are the design size; small canvases are baked at 2x so a brush stroke keeps its edge. If the locale's faces are
// not in yet the sign is baked now and re-baked into the same texture when they arrive (fonts.js whenFontsReady).
export function textTexture(lines, { w = 256, h = 128, bg = '#f4e6c4', fg = '#3a2516', vertical = false, size = 0, border = '', style = '', crest, res = 0 } = {}) {
  const k = res || (Math.min(w, h) < 128 ? 2 : 1);
  const cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  const o = { bg, fg, vertical, size: size * k, border, style, crest: crest === undefined && vertical ? crestFor([].concat(lines).join('')) : (crest || '') };
  paintLettering(cv, lines, o);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (!fontsReady()) whenFontsReady(() => { paintLettering(cv, lines, o); tex.needsUpdate = true; });
  return tex;
}
const _shared = new Map();
/** Cache for textured materials that repeat (noren, banners): one material -> merges into one draw call. */
export function sharedMat(key, make) { let m = _shared.get(key); if (!m) { m = make(); _shared.set(key, m); } return m; }
/** Lit (toon) material with a canvas texture — one per sign (not cached). */
export function texMat(tex, opts = {}) {
  const m = new THREE.MeshToonMaterial({ map: tex, color: 0xffffff, ...opts });
  hookMaterial(m);
  return m;
}
/** Self-lit textured material (night signs, glowing noren). */
export function texGlow(tex, k = 1.6, opts = {}) {
  const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1, 1, 1).multiplyScalar(k), ...opts });
  m.toneMapped = false;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Buildings. Every builder returns { group, walls:[{x,z,hw,hd,y1}], floors:[{x,z,hw,hd,top}], pads:[...] }
// in its own frame: origin on the ground at the centre of the footprint, front facing +z.

/**
 * Box whose top edges are chamfered by b (20 triangles): a hand-dressed stone whose worn arrises catch the light —
 * paving slabs, course stones, steps. Same footprint and height as box(); cached per size.
 */
const _bevel = new Map();
export function bevelBox(w, h, d, mat, x = 0, y = 0, z = 0, b = 0.035) {
  const bb = Math.min(b, h * 0.45, w * 0.3, d * 0.3);
  const key = w.toFixed(3) + ',' + h.toFixed(3) + ',' + d.toFixed(3) + ',' + bb.toFixed(3);
  let g = _bevel.get(key);
  if (!g) {
    const X = w / 2, Y = h / 2, Z = d / 2, xi = X - bb, zi = Z - bb, ym = Y - bb;
    const T = [[-xi, Y, -zi], [xi, Y, -zi], [xi, Y, zi], [-xi, Y, zi]];        // top (inset)
    const R = [[-X, ym, -Z], [X, ym, -Z], [X, ym, Z], [-X, ym, Z]];             // outer rim below the chamfer
    const B = [[-X, -Y, -Z], [X, -Y, -Z], [X, -Y, Z], [-X, -Y, Z]];             // bottom
    const quads = [[T[0], T[1], T[2], T[3]], [B[3], B[2], B[1], B[0]]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quads.push([R[i], R[j], T[j], T[i]], [B[i], B[j], R[j], R[i]]); }
    const pos = [];
    const v = new THREE.Vector3(), a = new THREE.Vector3(), c = new THREE.Vector3();
    for (const q of quads) {
      // orient every quad outward (normal away from the centre)
      a.set(...q[1]).sub(v.set(...q[0])); c.set(...q[2]).sub(v); a.cross(c);
      const m = [0, 1, 2].map((k) => (q[0][k] + q[1][k] + q[2][k] + q[3][k]) / 4);
      const qq = a.x * m[0] + a.y * m[1] + a.z * m[2] < 0 ? [q[3], q[2], q[1], q[0]] : q;
      for (const t of [qq[0], qq[1], qq[2], qq[0], qq[2], qq[3]]) pos.push(...t);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    g.userData.shared = true;
    _bevel.set(key, g);
  }
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** Foundation of individual dressed stones around a recessed core: footprint w x d centred at (0, cz), height h. */
export function stoneCourse(g, w, d, cz, h, mat, seed = 0) {
  if (h < 0.2) { g.add(box(w, h, d, mat, 0, h / 2, cz)); return; }
  g.add(box(w - 0.24, h, d - 0.24, M.stoneDark(), 0, h / 2, cz));
  let k = 0;
  const run = (len, place) => {
    let a = -len / 2;
    while (a < len / 2 - 0.05) {
      const l = Math.min(len / 2 - a, 0.55 + 0.5 * hash2(seed + k * 3.3, k * 1.7)); k++;
      const hh = h * (0.93 + 0.07 * hash2(k * 5.1, seed));
      place(a + l / 2, l - 0.035, hh);
      a += l;
    }
  };
  for (const s of [-1, 1]) {
    run(w, (c, l, hh) => g.add(bevelBox(l, hh, 0.3, mat, c, hh / 2, cz + s * (d / 2 - 0.15), 0.04)));
    run(d - 0.6, (c, l, hh) => g.add(bevelBox(0.3, hh, l, mat, s * (w / 2 - 0.15), hh / 2, cz + c, 0.04)));
  }
}

/** Wall panel infill between two posts along x (local), at z = zf, from y0 to y1. kind: plaster|shoji|lattice|wood|open */
function panel(g, kind, x0, x1, zf, y0, y1, o) {
  const w = x1 - x0, cx = (x0 + x1) / 2, h = y1 - y0;
  if (kind === 'open' || w < 0.05) return;
  const frame = o.frameMat || M.woodDark();
  const plaster = o.plasterMat || M.plaster();
  if (kind === 'plaster') {
    g.add(box(w, h, 0.16, plaster, cx, y0 + h / 2, zf));
    g.add(box(w, 0.12, 0.2, frame, cx, y0 + h * 0.62, zf));
    g.add(box(w, 0.3, 0.2, frame, cx, y0 + 0.15, zf));
    if (w > 1.3) g.add(box(0.13, h, 0.19, frame, cx, y0 + h / 2, zf));               // stud (timber framing)
    if (o.koshi) {                                                                    // board wainscot with battens
      const kh = Math.min(0.95, h * 0.36);
      g.add(box(w, kh, 0.19, o.boardMat || M.wood(), cx, y0 + kh / 2, zf + 0.01));
      const nb = Math.max(2, Math.round(w / 0.34));
      for (let i = 1; i < nb; i++) g.add(box(0.045, kh, 0.05, frame, x0 + (w * i) / nb, y0 + kh / 2, zf + 0.11));
      g.add(box(w, 0.06, 0.08, frame, cx, y0 + kh, zf + 0.11));
    }
  } else if (kind === 'wood') {
    const bm = o.boardMat || M.wood();
    g.add(box(w, h, 0.16, bm, cx, y0 + h / 2, zf));
    g.add(box(w, 0.1, 0.2, frame, cx, y0 + h * 0.55, zf));
    // plank siding: vertical battens over the board joints
    const nb = Math.max(2, Math.round(w / 0.3));
    for (let i = 1; i < nb; i++) g.add(box(0.045, h, 0.05, frame, x0 + (w * i) / nb, y0 + h / 2, zf + 0.1));
  } else if (kind === 'shoji' || kind === 'window') {
    const kick = kind === 'window' ? h * 0.42 : 0.32;
    const top = kind === 'window' ? h * 0.82 : h - 0.35;
    g.add(box(w, kick, 0.16, kind === 'window' ? plaster : (o.boardMat || M.wood()), cx, y0 + kick / 2, zf));
    g.add(box(w, h - top, 0.16, plaster, cx, y0 + top + (h - top) / 2, zf));
    const ph = top - kick;
    g.add(box(w - 0.04, ph, 0.08, o.winMat || M.paper(), cx, y0 + kick + ph / 2, zf));
    // lattice (kumiko)
    const nv = Math.max(2, Math.round(w / 0.45));
    for (let i = 1; i < nv; i++) g.add(box(0.035, ph, 0.12, frame, x0 + (w * i) / nv, y0 + kick + ph / 2, zf));
    const nh = Math.max(2, Math.round(ph / 0.42));
    for (let i = 1; i < nh; i++) g.add(box(w, 0.035, 0.12, frame, cx, y0 + kick + (ph * i) / nh, zf));
    g.add(box(w, 0.07, 0.14, frame, cx, y0 + kick, zf)); g.add(box(w, 0.07, 0.14, frame, cx, y0 + top, zf));
  } else if (kind === 'lattice') {
    g.add(box(w - 0.04, h - 0.3, 0.06, o.winMat || M.paper(), cx, y0 + 0.15 + (h - 0.3) / 2, zf - 0.03));
    const n = Math.max(3, Math.round(w / 0.12));
    for (let i = 0; i <= n; i++) g.add(box(0.045, h - 0.3, 0.08, frame, x0 + (w * i) / n, y0 + 0.15 + (h - 0.3) / 2, zf + 0.04));
    g.add(box(w, 0.3, 0.18, frame, cx, y0 + 0.15, zf));
  }
}
/** Run panel() along one side of a rectangle split by posts. side: 'front'|'back'|'left'|'right' */
function wallSide(g, kind, side, hw, hd, y0, y1, pitch, o) {
  if (kind === 'open') return;
  const along = side === 'front' || side === 'back' ? hw : hd;
  const n = Math.max(1, Math.round((2 * along) / pitch));
  const sub = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a0 = -along + (2 * along * i) / n + 0.09, a1 = -along + (2 * along * (i + 1)) / n - 0.09;
    let k = kind;
    if (Array.isArray(kind)) k = kind[i % kind.length];
    panel(sub, k, a0, a1, 0, y0, y1, o);
  }
  if (side === 'front') sub.position.z = hd;
  else if (side === 'back') { sub.position.z = -hd; sub.rotation.y = Math.PI; }
  else if (side === 'left') { sub.position.x = -hw; sub.rotation.y = -Math.PI / 2; }
  else { sub.position.x = hw; sub.rotation.y = Math.PI / 2; }
  g.add(sub);
}

/**
 * Generic Japanese building.
 * o: { w, d, wallH=2.6, base=0.5 (stone plinth height = floor level), plinth='stone'|'none', postMat, postR,
 *      front, back, left, right: 'plaster'|'shoji'|'lattice'|'wood'|'open'|'window' (or arrays per bay),
 *      engawa: veranda depth on the front (0 = none), ring: veranda all round, rail: veranda railing,
 *      roof: { style, over, h, mat, lift }, winMat, steps: true (front steps), pitch: post spacing }
 */
export function building(o) {
  const g = new THREE.Group();
  const W = o.w, D = o.d, hw = W / 2, hd = D / 2;
  const base = o.base ?? 0.5, wallH = o.wallH ?? 2.6;
  const postMat = o.postMat || M.wood(), postR = o.postR ?? 0.13;
  const pitch = o.pitch ?? 1.8;
  const ev = o.engawa ?? 0, ring = !!o.ring;
  // plinth
  if (o.plinth !== 'none') {
    const pm = o.plinthMat || M.stone();
    stoneCourse(g, W + 0.5 + (ring ? ev * 2 : 0), D + 0.5 + (ring ? ev * 2 : ev), ring ? 0 : ev / 2, base, pm, W * 13.7 + D);
  }
  // floor
  g.add(box(W + (ring ? ev * 2 : 0) + 0.2, 0.12, D + (ring ? ev * 2 : ev) + 0.2, o.floorMat || M.woodLight(), 0, base + 0.06, ring ? 0 : ev / 2));
  // posts on the wall line
  const fy = base + 0.12, ty = fy + wallH;
  const nx = Math.max(1, Math.round(W / pitch)), nz = Math.max(1, Math.round(D / pitch));
  for (let i = 0; i <= nx; i++) for (const s of [-1, 1]) g.add(cyl(postR, postR, wallH, postMat, -hw + (W * i) / nx, fy + wallH / 2, s * hd, 8));
  for (let j = 1; j < nz; j++) for (const s of [-1, 1]) g.add(cyl(postR, postR, wallH, postMat, s * hw, fy + wallH / 2, -hd + (D * j) / nz, 8));
  // veranda posts + rail
  if (ev > 0) {
    const ex = ring ? hw + ev - 0.15 : hw, ez = hd + ev - 0.15;
    for (let i = 0; i <= nx; i++) g.add(cyl(postR * 0.85, postR * 0.85, wallH, postMat, -hw + (W * i) / nx, fy + wallH / 2, ez, 8));
    if (ring) {
      for (let j = 0; j <= nz; j++) for (const s of [-1, 1]) g.add(cyl(postR * 0.85, postR * 0.85, wallH, postMat, s * ex, fy + wallH / 2, -hd + (D * j) / nz, 8));
      for (const s of [-1, 1]) g.add(cyl(postR * 0.85, postR * 0.85, wallH, postMat, s * ex, fy + wallH / 2, s > 0 ? ez : -ez, 8));
      for (const s of [-1, 1]) g.add(cyl(postR * 0.85, postR * 0.85, wallH, postMat, s * ex, fy + wallH / 2, ez, 8));
    }
    if (o.rail) {
      const rm = o.railMat || postMat;
      const ry = fy + 0.6;
      const gap = o.steps ? Math.min(1.4, hw * 0.4) : 0;
      if (gap > 0) { g.add(box(hw - gap + (ring ? ev : 0), 0.08, 0.08, rm, -(hw + gap + (ring ? ev : 0)) / 2, ry, ez + 0.1)); g.add(box(hw - gap + (ring ? ev : 0), 0.08, 0.08, rm, (hw + gap + (ring ? ev : 0)) / 2, ry, ez + 0.1)); }
      else g.add(box(W + (ring ? 2 * ev : 0), 0.08, 0.08, rm, 0, ry, ez + 0.1));
      if (ring) for (const s of [-1, 1]) g.add(box(0.08, 0.08, D + 2 * ev, rm, s * (ex + 0.1), ry, 0));
    }
  }
  // walls
  const po = { winMat: o.winMat, frameMat: o.frameMat, boardMat: o.boardMat, plasterMat: o.plasterMat, koshi: o.koshi };
  wallSide(g, o.front ?? 'shoji', 'front', hw, hd, fy, ty, pitch, po);
  wallSide(g, o.back ?? 'plaster', 'back', hw, hd, fy, ty, pitch, po);
  wallSide(g, o.left ?? 'plaster', 'left', hw, hd, fy, ty, pitch, po);
  wallSide(g, o.right ?? 'plaster', 'right', hw, hd, fy, ty, pitch, po);
  // head beams
  const bm = o.beamMat || postMat;
  g.add(box(W + 0.3, 0.22, 0.24, bm, 0, ty - 0.11, hd)); g.add(box(W + 0.3, 0.22, 0.24, bm, 0, ty - 0.11, -hd));
  g.add(box(0.24, 0.22, D + 0.3, bm, hw, ty - 0.11, 0)); g.add(box(0.24, 0.22, D + 0.3, bm, -hw, ty - 0.11, 0));
  if (ev > 0) g.add(box(W + (ring ? 2 * ev : 0.3), 0.2, 0.2, bm, 0, ty - 0.1, hd + ev - 0.15));
  // veranda edge board (nosing) and a shoe stone before a veranda without steps
  if (ev > 0) {
    g.add(box(W + (ring ? 2 * ev : 0) + 0.24, 0.1, 0.14, o.beamMat && o.beamMat !== postMat ? M.woodDark() : M.woodDark(), 0, base + 0.04, hd + ev + 0.06));
    if (!o.steps && base > 0.25) g.add(box(1.1, Math.min(0.24, base * 0.5), 0.6, M.stoneLight(), 0.3, Math.min(0.24, base * 0.5) / 2 - 0.02, hd + ev + 0.55));
  }
  // posts without a plinth stand on round base stones
  if (o.plinth === 'none') for (let i = 0; i <= nx; i++) for (const s of [-1, 1]) g.add(cyl(postR * 1.7, postR * 2.1, 0.22, M.stoneWarm(), -hw + (W * i) / nx, 0.1, s * hd, 7));
  // bracket sets (tokyo) on the wall posts: a bearing block, an arm along the wall with two small blocks, a block outward
  if (o.brackets) {
    const bk = o.bracketMat || postMat;
    const put = (x, z, ry) => {
      const grp = new THREE.Group();
      grp.add(box(0.36, 0.18, 0.36, bk, 0, 0.09, 0));
      grp.add(box(1.0, 0.14, 0.2, bk, 0, 0.25, 0));
      for (const sx of [-0.42, 0.42]) grp.add(box(0.22, 0.13, 0.26, bk, sx, 0.39, 0));
      grp.add(box(0.2, 0.15, 0.95, bk, 0, 0.4, 0.3));
      grp.add(box(0.26, 0.14, 0.26, bk, 0, 0.53, 0.66));
      grp.position.set(x, ty + 0.02, z); grp.rotation.y = ry; g.add(grp);
    };
    for (let i = 0; i <= nx; i++) { put(-hw + (W * i) / nx, hd, 0); put(-hw + (W * i) / nx, -hd, Math.PI); }
    for (let j = 1; j < nz; j++) { put(hw, -hd + (D * j) / nz, Math.PI / 2); put(-hw, -hd + (D * j) / nz, -Math.PI / 2); }
  }
  // steps
  if (o.steps && base > 0.25) {
    const n = Math.max(2, Math.round(base / 0.22));
    const sw = Math.min(W * 0.5, 2.6);
    const z0 = hd + ev + 0.25;
    for (let i = 0; i < n; i++) g.add(box(sw, (base * (i + 1)) / n, 0.34, o.stepMat || M.stone(), 0, (base * (i + 1)) / n / 2, z0 + (n - 1 - i) * 0.34 + 0.17));
  }
  // roof
  const rf = o.roof || {};
  const over = rf.over ?? 1.0;
  const rhw = hw + (ring ? ev : 0) + over, rhd = hd + (ring ? ev : ev / 2) + over;
  const rh = rf.h ?? Math.min(rhw, rhd) * (rf.style === 'thatch' ? 1.05 : 0.62);
  const roof = makeRoof({ ...rf, hw: rhw, hd: rhd, h: rh, style: rf.style || 'hip' });
  const eaveY = ty + (rf.raise ?? 0.05);
  roof.group.position.set(0, eaveY, ring ? 0 : ev / 2);
  g.add(roof.group);
  // gable infill for gable roofs (plaster triangle above the head beam)
  if ((rf.style || 'hip') === 'gable') {
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(-hd - 0.1, 0); shape.lineTo(hd + 0.1, 0); shape.lineTo(0, rh * 0.92); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
      const m = new THREE.Mesh(geo, o.plasterMat || M.plaster()); m.castShadow = m.receiveShadow = true;
      m.rotation.y = Math.PI / 2; m.position.set(s * hw - 0.07, ty, ring ? 0 : 0);
      g.add(m);
      g.add(box(0.2, 0.14, D * 0.9, bm, s * (hw + 0.05), ty + rh * 0.35, 0));
    }
  } else if (rf.style !== 'thatch') {
    // a band of plaster / wood between beam and roof underside to close the gap under curved hips
    g.add(box(W, 0.4, D, o.attic || M.woodDark(), 0, ty + 0.15, 0));
  } else {
    g.add(box(W, 0.6, D, M.woodDark(), 0, ty + 0.2, 0));
  }
  const walls = [{ x: 0, z: 0, hw: hw + 0.15, hd: hd + 0.15, y1: eaveY + 0.2 }];
  const floors = ev > 0 || base > 0.3 ? [{ x: 0, z: ring ? 0 : ev / 2, hw: hw + (ring ? ev : 0) + 0.1, hd: hd + (ring ? ev : ev / 2) + 0.1, top: base + 0.12 }] : [];
  if (o.steps && base > 0.25) {
    // one platform per visible step (a single half-height block left a rise too tall to step onto the veranda)
    const n = Math.max(2, Math.round(base / 0.22)), z0 = hd + ev + 0.25;
    for (let i = 0; i < n; i++) floors.push({ x: 0, z: z0 + (n - 1 - i) * 0.34 + 0.17, hw: Math.min(W * 0.25, 1.3), hd: 0.17, top: (base * (i + 1)) / n, thick: 0.3 + (base * (i + 1)) / n });
  }
  const pads = roof.pads.map((p) => ({ x: 0, z: ring ? 0 : ev / 2, hw: p.hw, hd: p.hd, top: eaveY + p.top }));
  return { group: g, walls, floors, pads, eaveY, roofTop: eaveY + rh, roof };
}

/** Open pavilion: posts, a floor and a roof (temizuya, kagura stage, bell house, stalls). */
export function pavilion(o) {
  const b = building({ ...o, front: 'open', back: o.back ?? 'open', left: o.left ?? 'open', right: o.right ?? 'open' });
  if (o.walkable !== false) b.walls = [];
  return b;
}

/** Two-storey town house (machiya) with lattice ground floor, pent roof, plaster upper floor with slatted windows. */
export function townHouse(o) {
  const g = new THREE.Group();
  const W = o.w ?? 6, D = o.d ?? 6, hw = W / 2, hd = D / 2;
  const winMat = o.winMat || M.paper();
  const lower = building({ w: W, d: D, wallH: 2.7, base: 0.3, front: ['lattice', 'lattice', 'open', 'lattice'], left: 'wood', right: 'wood', back: 'plaster', winMat, pitch: W / 4, plasterMat: o.plasterMat,
    postMat: M.woodDark(), roof: { style: 'gable', over: 0.1, h: 0.01 } });
  // remove the lower roof (keep posts/walls): rebuild below with a pent roof instead
  lower.group.remove(lower.roof.group);
  g.add(lower.group);
  const y1 = 0.42 + 2.7;
  // pent roof (hisashi) along the front: a tilted, corrugated slab
  const slab = makeRoof({ hw: hw + 0.4, hd: 1.0, h: 0.0001, style: 'gable', mat: o.roofMat, lift: 0, corr: 0.06, ridge: false });
  slab.group.rotation.x = 0.42; slab.group.position.set(0, y1 + 0.35, hd + 0.55);
  g.add(slab.group);
  // upper floor
  const up = building({ w: W, d: D - 0.6, wallH: 2.0, base: 0.01, plinth: 'none', front: ['plaster', 'window', 'window', 'plaster'], left: ['plaster', 'window', 'plaster'], right: ['plaster', 'window', 'plaster'], back: 'plaster', winMat, pitch: W / 4, plasterMat: o.plasterMat,
    postMat: M.woodDark(), roof: { style: o.roofStyle || 'gable', over: 0.8, h: 1.6, mat: o.roofMat } });
  up.group.position.set(0, y1 + 0.05, -0.3);
  g.add(up.group);
  // noren curtain + hanging lantern at the door bay
  if (o.noren != null) {
    // o.noren '' = a plain dyed curtain (homes); text = a shop's name (already through t())
    const nm = sharedMat('noren:' + o.noren + (o.norenBg || '') + (o.norenCrest || ''), () => texMat(textTexture(o.noren ? o.noren : [''], { w: 256, h: 128, bg: o.norenBg || '#28304f', fg: '#f4ead2', style: 'resist', crest: o.noren ? (o.norenCrest || '') : '' }), { side: THREE.DoubleSide }));
    const n = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75, 3, 3), clothify(nm, 0.1)); n.position.set(W / 8, 2.55, hd + 0.18); g.add(n);
  }
  const walls = [{ x: 0, z: 0, hw: hw + 0.15, hd: hd + 0.15, y1: y1 + 2.3 }];
  const pads = up.pads.map((p) => ({ x: 0, z: -0.3, hw: p.hw, hd: p.hd, top: y1 + 0.05 + p.top }));
  return { group: g, walls, floors: [], pads, roofTop: y1 + 0.05 + up.roofTop, eaveY: y1 + 2.1 };
}

/** Storehouse (kura): thick white plaster, dark wainscot, small barred window, tiled gable roof. */
export function kura(o = {}) {
  const W = o.w ?? 4.5, D = o.d ?? 3.6;
  const b = building({ w: W, d: D, wallH: o.wallH ?? 3.4, base: 0.55, front: ['plaster', 'wood', 'plaster'], back: 'plaster', left: 'plaster', right: 'plaster', pitch: W / 3,
    postMat: M.plaster(), roof: { style: 'gable', over: 0.6, h: 1.5, mat: o.roofMat } });
  const g = b.group;
  for (const s of [-1, 1]) for (const z of [-1, 1]) g.add(box(W / 2 - 0.1, 0.9, 0.06, M.black(), s * W / 4, 1.05, z * (D / 2 + 0.1)));
  g.add(box(1.0, 1.9, 0.12, M.black(), 0, 1.55, D / 2 + 0.12));
  g.add(box(0.7, 0.5, 0.1, M.black(), 0, 3.4, D / 2 + 0.1));
  return b;
}

/** Tiny wayside shrine (hokora) on a stone base, optionally on stilts. Returns a builder result. */
export function hokora(o = {}) {
  const g = new THREE.Group();
  const s = o.scale ?? 1;
  const stilt = o.stilt ?? 0;
  const baseY = stilt > 0 ? stilt : 0.5 * s;
  if (stilt > 0) {
    for (const x of [-0.55, 0.55]) for (const z of [-0.45, 0.45]) g.add(cyl(0.07 * s, 0.08 * s, stilt, o.postMat || M.verm(), x * s, stilt / 2, z * s, 6));
    g.add(box(1.5 * s, 0.1, 1.3 * s, M.woodDark(), 0, stilt, 0));
    g.add(box(1.5 * s, 0.05, 0.05, o.postMat || M.verm(), 0, stilt * 0.5, 0.45 * s));
  } else g.add(box(1.4 * s, baseY, 1.2 * s, M.stone(), 0, baseY / 2, 0));
  const body = new THREE.Group();
  body.add(box(0.9 * s, 0.8 * s, 0.7 * s, M.woodLight(), 0, 0.4 * s, 0));
  body.add(box(0.5 * s, 0.6 * s, 0.05, o.doorMat || M.woodDark(), 0, 0.38 * s, 0.36 * s));
  body.add(box(0.12 * s, 0.12 * s, 0.03, M.gold(), 0, 0.5 * s, 0.39 * s));
  const r = makeRoof({ hw: 0.75 * s, hd: 0.7 * s, h: 0.45 * s, style: 'gable', mat: o.roofMat || M.tile(), lift: 0.12 * s, corr: 0.03, tile: 0.2, thick: 0.08 });
  r.group.position.y = 0.8 * s; body.add(r.group);
  body.position.y = baseY + 0.05;
  g.add(body);
  return { group: g, walls: [{ x: 0, z: 0, hw: 0.75 * s, hd: 0.65 * s, y1: baseY + 1.3 * s }], floors: [], pads: [], roofTop: baseY + 1.3 * s };
}

/** Wooden fence segment along local x from x0 to x1 at z (posts + rails); kind 'bamboo'|'wood'|'stone'. */
export function fence(g, x0, z0, x1, z1, y, kind = 'wood', mat) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.6));
  const m = mat || (kind === 'bamboo' ? toon(0x9fb36a) : kind === 'stone' ? M.stone() : M.wood());
  const yy = typeof y === 'function' ? y : () => y;
  for (let i = 0; i <= n; i++) {
    const f = i / n, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
    g.add(kind === 'stone' ? box(0.3, 0.9, 0.3, m, x, yy(x, z) + 0.45, z) : cyl(0.06, 0.07, 1.15, m, x, yy(x, z) + 0.55, z, 5));
  }
  const ya = yy(x0, z0), yb = yy(x1, z1);
  for (const hh of kind === 'stone' ? [0.8] : [0.45, 0.9]) g.add(beam(x0, ya + hh, z0, x1, yb + hh, z1, 0.05, 0.06, m));
}

/** Stone stairway: n steps rising from (x0,z0) at y0 to (x1,z1) at y1, width w; adds meshes to `site` and platforms. */
export function stairs(site, x0, z0, y0, x1, z1, y1, w, mat, { landing = 0 } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.ceil(Math.abs(y1 - y0) / 0.3));
  const ry = Math.atan2(x1 - x0, z1 - z0);
  const run = len / n;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
    const hg = site.h(x, z);
    const top = Math.max(y0 + ((y1 - y0) * (i + 1)) / n, hg + 0.14);
    const ground = Math.min(hg, top - 0.3) - 0.6;
    const hgt = top - ground;
    const m = box(w, hgt, run + 0.04, mat || M.stone(), 0, 0, 0);
    site.add(m, x, ground + hgt / 2, z, ry);
    site.platBox(x, z, w / 2, run / 2 + 0.02, ry, top, Math.min(1.2, hgt));
  }
  void landing;
}

import { ANCHORS } from '../../data/world.js';
import { roadDist } from '../ground.js';
/** True when an object of radius r at world (x,z) keeps the 3.5 m anchor circles and `road` m of road free. */
export function isClear(x, z, r = 0.5, { road = 1.6, except = null } = {}) {
  for (const k in ANCHORS) {
    if (except && except.includes(k)) continue;
    const a = ANCHORS[k];
    if (Math.hypot(x - a.x, z - a.z) < 3.5 + r) return false;
  }
  return road <= 0 || roadDist(x, z) >= road + r;
}

import { ROADS } from '../../data/world.js';
/** Nearest point on any road centreline: { x, z, d, dx, dz (unit direction of that segment) }. */
export function nearestRoad(x, z) {
  let best = { d: Infinity, x: 0, z: 0, dx: 1, dz: 0 };
  for (const r of ROADS) for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    let f = ((x - ax) * ex + (z - az) * ez) / l2; f = Math.max(0, Math.min(1, f));
    const px = ax + ex * f, pz = az + ez * f, d = Math.hypot(px - x, pz - z);
    if (d < best.d) { const l = Math.sqrt(l2); best = { d, x: px, z: pz, dx: ex / l, dz: ez / l }; }
  }
  return best;
}

import { toonGradient } from '../../core/mats.js';
let _farLit = null, _farGlow = null;
/**
 * Far level of detail for a baked place: every mesh collapsed into two meshes (lit toon + self-lit) with the source
 * materials' colours baked into vertex colours. Two draw calls instead of a few dozen; no shadows.
 */
export async function farLOD(src, cell = FAR_CELL, step = null, { skipDynamic = false } = {}) {
  // boot time slices: `step` (structures.js ctx.step) between meshes and inside the clustering; same result
  // skipDynamic (draw-call pass stand-ins): leave out live subtrees (userData.dynamic: lit paper, flames, lids)
  const meshes = [];
  const walk = (o) => { if (skipDynamic && o !== src && o.userData.dynamic) return; meshes.push(o); for (const c of o.children) walk(c); };
  walk(src);
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const lit = [], glw = [];
  const col = new THREE.Color();
  for (let mi = 0; mi < meshes.length; mi++) {
    const o = meshes[mi];
    if (step && (mi & 15) === 15) await step('lod:meshes');
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) continue;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const m = mats[0];
    if (!m || !o.geometry?.attributes?.position) continue;
    if (m.transparent && m.blending === THREE.AdditiveBlending) continue;   // glyphs, veils, spills: no far stand-in
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const vc = m.vertexColors && g.attributes.color ? g.attributes.color : null;   // baked shading / model colours
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && !(vc && n === 'color')) g.deleteAttribute(n);
    if (!g.attributes.normal) g.computeVertexNormals();
    rel.multiplyMatrices(inv, o.matrixWorld);
    g.applyMatrix4(rel);
    const isGlow = m.isMeshBasicMaterial;
    col.copy(m.color || col.setRGB(1, 1, 1));
    if (m.map) col.setRGB(isGlow ? 1.2 : 0.85, isGlow ? 1.0 : 0.78, isGlow ? 0.7 : 0.66);
    if (m.userData.farColor != null) col.set(m.userData.farColor);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const vr = vc ? vc.getX(i) : 1, vg = vc ? vc.getY(i) : 1, vb = vc ? vc.getZ(i) : 1;
      arr[i * 3] = col.r * vr; arr[i * 3 + 1] = col.g * vg; arr[i * 3 + 2] = col.b * vb;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.morphAttributes = {};
    (isGlow ? glw : lit).push(g);
  }
  const out = new THREE.Group();
  out.name = (src.name || 'place') + '_far';
  out.position.copy(src.position); out.quaternion.copy(src.quaternion); out.scale.copy(src.scale);
  if (!_farLit) { _farLit = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }); hookMaterial(_farLit); }
  if (!_farGlow) { _farGlow = new THREE.MeshBasicMaterial({ vertexColors: true }); _farGlow.toneMapped = false; }
  for (const [list, mat] of [[lit, _farLit], [glw, _farGlow]]) {
    if (!list.length) continue;
    let merged = mergeGeometries(list, false);
    if (step) await step('lod:merge');
    for (const g of list) g.dispose();
    if (!merged) continue;
    // the far version is only seen beyond ~170 m: collapse detail smaller than FAR_CELL (vertex clustering)
    try { const simp = await clusterSimplify(merged, cell, step); if (simp) { merged.dispose(); merged = simp; } } catch (e) { /* keep the full version */ }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = false; mesh.receiveShadow = false;
    out.add(mesh);
  }
  return out;
}

const FAR_CELL = 0.55; // m — about two pixels at the far swap distance on a 1440 px wide screen
/**
 * Vertex-clustering simplification (non-indexed position/normal/color in, non-indexed out, flat normals): vertices
 * snap to the mean of their grid cell, triangles that collapse are dropped, duplicates removed. Keeps silhouettes and
 * per-face colours; small trims, carvings and railings melt into their parent surfaces. Returns null if no gain.
 */
async function clusterSimplify(g, cell, step = null) {
  const P = g.attributes.position.array, C = g.attributes.color?.array;
  const nTri = P.length / 9;
  const ids = new Int32Array(nTri * 3);
  const map = new Map();
  let sums = [];
  const inv = 1 / cell;
  for (let v = 0; v < nTri * 3; v++) {
    if (step && (v & 16383) === 16383) await step('lod:cluster');
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const key = Math.floor(x * inv) + ',' + Math.floor(y * inv) + ',' + Math.floor(z * inv);
    let id = map.get(key);
    if (id === undefined) { id = map.size; map.set(key, id); sums.push(0, 0, 0, 0); }
    ids[v] = id; const o = id * 4; sums[o] += x; sums[o + 1] += y; sums[o + 2] += z; sums[o + 3]++;
  }
  const seen = new Set(), keep = [];
  for (let t = 0; t < nTri; t++) {
    if (step && (t & 16383) === 16383) await step('lod:cluster');
    let a = ids[t * 3], b = ids[t * 3 + 1], c = ids[t * 3 + 2];
    if (a === b || b === c || a === c) continue;
    // rotation-normalised key (keeps winding, so front / back faces both survive)
    let k;
    if (a < b && a < c) k = a + ',' + b + ',' + c; else if (b < c) k = b + ',' + c + ',' + a; else k = c + ',' + a + ',' + b;
    if (seen.has(k)) continue;
    seen.add(k); keep.push(t);
  }
  if (keep.length > nTri * 0.85) return null;
  const pos = new Float32Array(keep.length * 9), col = new Float32Array(keep.length * 9);
  for (let i = 0; i < keep.length; i++) {
    if (step && (i & 16383) === 16383) await step('lod:cluster');
    const t = keep[i];
    for (let j = 0; j < 3; j++) {
      const id = ids[t * 3 + j], o = id * 4, n = sums[o + 3];
      pos[i * 9 + j * 3] = sums[o] / n; pos[i * 9 + j * 3 + 1] = sums[o + 1] / n; pos[i * 9 + j * 3 + 2] = sums[o + 2] / n;
      if (C) { col[i * 9 + j * 3] = C[t * 9]; col[i * 9 + j * 3 + 1] = C[t * 9 + 1]; col[i * 9 + j * 3 + 2] = C[t * 9 + 2]; }
    }
  }
  sums = null;
  if (step) await step('lod:cluster');
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
