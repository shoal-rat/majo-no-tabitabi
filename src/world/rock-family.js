// The countryside rock family (round art-stone, 2026-11-24): six stones built from exact planes with bevelled edges,
// beds and joints as geometry and moss as its own soft cushion (tools/sculpt/assets/rock_family.mjs, GLBs
// assets/models/sculpt/rock_<shape>.glb, G.sculpt type 'rockfam'). One source for every user:
//   * flora rock species (flora/procgen.js ROCKS): instanced, fitted into the species box;
//   * kit sites (builders/journey-waysides.js, the trial clearing): siteRock() gives a placeable group that merges into
//     the site's surface families (vertex colours, no extra draw per stone).
// Shapes: field (boulder, frost-split shoulder) · split (halves leaning apart) · ledge (stepped dipping beds) ·
// shelf (low two-bed slab) · crag (tall jointed columns) · cobble (small stones lying together).
// Colour: COLOR_0 is linear and written once (core/assets.js SCULPT_VC_OK). Stone is neutral (mean ~#9b9b9b): times a
// tint / NEUTRAL gives the land's stone. Moss keeps its own green.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { toon } from '../core/mats.js';
import { sculptVcMat } from './builders/kit.js';

export const ROCK_SHAPES = ['field', 'split', 'ledge', 'shelf', 'crag', 'cobble'];
export const rockId = (shape) => 'sculpt_rock_' + shape;
/** linear value of the neutral stone the GLBs are painted around */
export const NEUTRAL = new THREE.Color(0x9b9b9b).r;

/** is the family in use (G.sculpt switch, asset loaded)? */
export const rockFamilyOn = (shape = 'field') => !!G.sculpt?.on?.('rockfam') && !!G.assets?.raw?.(rockId(shape));

/**
 * LOD for the current quality tier. `clutter` = the small, numerous stones in the grass. 0: every edge bevelled + corner
 * facets (~400-800 triangles), 1: strong edges only (~200-500), 2: sharp planes (~70-120).
 */
export function rockLod(clutter = false) {
  const q = G.quality || { name: 'high' };
  if (q.mobile || q.name === 'low') return clutter ? 2 : 1;
  if (q.name === 'med') return clutter ? 1 : 0;
  return clutter ? 1 : 0;
}

const _parts = new Map();
/**
 * The stone and moss geometry of one LOD of a shape, in the GLB frame (foot centre at the origin, ~1 m). Shared: never
 * edit. { stone, moss (may be null), box } or null when the asset is missing.
 */
export const rockParts = (shape, lod) => familyParts(rockId(shape), lod);
/** the same split for any facet-kit GLB (stone primitives vs `Moss_*` primitives), by asset id */
export function familyParts(id, lod) {
  const k = id + ':' + lod;
  if (_parts.has(k)) return _parts.get(k);
  const raw = G.assets?.raw?.(id);
  let out = null;
  if (raw) {
    raw.scene.updateMatrixWorld(true);
    const lists = { stone: [], moss: [] };
    raw.scene.traverse((o) => {
      if (!o.isMesh) return;
      let lodOf = -1;
      for (let p = o; p && lodOf < 0; p = p.parent) { const m = /_LOD(\d)$/.exec(p.name || ''); if (m) lodOf = +m[1]; }
      if (lodOf !== lod) return;
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      (/^Moss/.test(o.material?.name || '') ? lists.moss : lists.stone).push(g);
    });
    const merge = (l) => {
      if (!l.length) return null;
      if (l.length === 1) return l[0];
      const pos = [], nrm = [], col = [], idx = [];
      for (const g of l) {
        const o = pos.length / 3, p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
        for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.getX(i), c.getY(i), c.getZ(i)); }
        const ix = g.index; for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + o);
      }
      const m = new THREE.BufferGeometry();
      m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      m.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); m.setIndex(idx);
      return m;
    };
    const stone = merge(lists.stone);
    if (stone) {
      stone.computeBoundingBox();
      out = { stone, moss: merge(lists.moss), box: stone.boundingBox.clone() };
    }
  }
  _parts.set(k, out);
  return out;
}

/**
 * Fit a copy of `geo` into a box: width W (x), depth D (z), top H above the foot, foot sunk by `sink` of the height; the
 * normals follow the non-uniform scale (inverse transpose, renormalised). colour(r, g, b, i) -> [r, g, b] or null.
 * Returns a new non-shared BufferGeometry (position, normal, color).
 */
export function fitRock(geo, box, { W, D, H, sink = 0.06 }) {
  const bw = box.max.x - box.min.x, bd = box.max.z - box.min.z, bh = box.max.y - Math.max(0, box.min.y);
  const kx = W / bw, kz = D / bd, ky = H / (bh * (1 - sink));
  const mx = (box.max.x + box.min.x) / 2, mz = (box.max.z + box.min.z) / 2, dy = -sink * bh * ky;
  const p = geo.attributes.position, n = geo.attributes.normal, c = geo.attributes.color, N = p.count;
  const pos = new Float32Array(N * 3), nrm = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (p.getX(i) - mx) * kx; pos[i * 3 + 1] = p.getY(i) * ky + dy; pos[i * 3 + 2] = (p.getZ(i) - mz) * kz;
    const nx = n.getX(i) / kx, ny = n.getY(i) / ky, nz = n.getZ(i) / kz, l = Math.hypot(nx, ny, nz) || 1;
    nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
    col[i * 3] = c.getX(i); col[i * 3 + 1] = c.getY(i); col[i * 3 + 2] = c.getZ(i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (geo.index) g.setIndex(geo.index.clone());
  return g;
}

/**
 * Site materials for family stones: smooth-shaded (the bevels catch the light; the kit's flat stone materials would
 * facet them), white vertex-coloured copies (albedo in the colour attribute, one family per site), surface detail low so
 * the planes and edges carry the form rather than painted cracks. Moss: soft, no surface detail.
 */
export function siteRockMats() {
  return {
    stone: sculptVcMat(toon(0xa59c90, { surface: 'stone', look: { detail: 0.35, bump: 0.4, rim: 0.22, wrap: 0.3 } })),
    moss: sculptVcMat(toon(0x6c8a4a, { surface: 'none', look: { rim: 0.3, wrap: 0.5 } })),
  };
}

/**
 * A family stone for a kit site: a group of one or two meshes (stone, moss) sized w x h x d (full extents, metres; the
 * foot at the group origin, sunk `sink` of the height), stone coloured as `tint` (hex or [r,g,b] linear) relative to the
 * neutral paint. Materials default to siteRockMats() (vertex-coloured white copies, see builders/kit.js sculptVcMat), so
 * the stones merge into one family per site. Returns null when the family is off or the asset is missing.
 * Example (a kit Site): `const g = siteRock('field', { w: 1.2, h: 0.9, d: 1.1, tint: 0x8d9084 }); if (g) site.add(g, x, groundY, z, yaw);`
 */
export function siteRock(shape, { w, h, d, tint = 0x9b9b9b, lod = rockLod(false), sink = 0.06, stoneMat = null, mossMat = null, moss = true }) {
  if (!rockFamilyOn(shape)) return null;
  if (!stoneMat) { const m = siteRockMats(); stoneMat = m.stone; mossMat = mossMat || m.moss; }
  const P = rockParts(shape, lod);
  if (!P) return null;
  const t = Array.isArray(tint) ? tint : new THREE.Color(tint).toArray();
  const k = [t[0] / NEUTRAL, t[1] / NEUTRAL, t[2] / NEUTRAL];
  const grp = new THREE.Group();
  grp.name = 'rockfam:' + shape;
  const stone = fitRock(P.stone, P.box, { W: w, D: d, H: h, sink });
  const c = stone.attributes.color;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k[0], c.getY(i) * k[1], c.getZ(i) * k[2]);
  const ms = new THREE.Mesh(stone, stoneMat); ms.castShadow = true; ms.receiveShadow = true; grp.add(ms);
  if (moss && P.moss) {
    const mm = new THREE.Mesh(fitRock(P.moss, P.box, { W: w, D: d, H: h, sink }), mossMat || stoneMat);
    mm.castShadow = false; mm.receiveShadow = true; grp.add(mm);
  }
  return grp;
}
