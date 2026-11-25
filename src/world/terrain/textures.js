// Terrain data textures shared by the terrain and water shaders.
//  * data   : RGBA half-float, 1024² over [-1024, 1024]² (2 m texels).  R = ground height (with craters),
//             G = distance to the nearest footpath, B = distance to the nearest river centreline,
//             A = wall shade 0..1 (near the walls / footprints of buildings; baked in terrain.start by bakeWallMask).
//  * noise  : 256² RGBA8 tileable value-noise (R/G/B = fbm at three base periods, A = ridged "vein" noise).
//  * scorch : RGBA8 1024² over the same square: R = burn, G = wet, B = frost, A = organic forest floor under established crowns. Painted on 'terrain:scorch',
//             fades back by itself (see ScorchLayer.tick).
import * as THREE from 'three';
import { ATLAS_HALF, ATLAS_SAMPLES } from '../../data/atlas.js';
import { heightAt, roadDist, riverDist } from '../ground.js';
import { bakeGet, bakePut } from '../../core/bakecache.js';
import { slice } from '../../core/boottime.js';
import { G } from '../../core/game.js';

export const DATA_N = ATLAS_SAMPLES;
export const DATA_HALF = ATLAS_HALF;               // world half-extent covered by the data / scorch textures
export const DATA_CELL = (DATA_HALF * 2) / DATA_N; // 2 m

const toHalf = THREE.DataUtils.toHalfFloat;
const ROAD_CAP = 30, RIVER_CAP = 120;

/** Texel centre (world) of column i. */
const wx = (i) => -DATA_HALF + (i + 0.5) * DATA_CELL;

export function createDataTexture(arr0 = null) {
  const N = DATA_N;
  const arr = arr0 || new Uint16Array(N * N * 4);
  if (!arr0) for (let j = 0; j < N; j++) fillDataRow(arr, j);
  const tex = new THREE.DataTexture(arr, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Boot path (perf pass, docs/api/perf.md "Boot and loading"): the same texture, from the bake cache when this build
 * baked it before (~200 ms of height / road / river sampling), else computed in time slices and stored.
 */
export async function createDataTextureAsync() {
  const N = DATA_N;
  if (typeof __JOURNEY_FIELD__ !== 'undefined' && __JOURNEY_FIELD__) {
    try {
      // stall-safe (players reported boots stuck for good): a connection that stops sending is dropped after 18 s and the
      // field is computed below, as after an error; one try, computing it is cheaper than fetching it again
      const url = 'assets/_terrain_cache/'+__JOURNEY_FIELD__+'.gz';
      const gz = G.assets?.fetchUrl ? await G.assets.fetchUrl(url, { tries: 1 }) : await fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null));
      if (!gz) throw new Error('no terrain cache');
      const buf = await new Response(new Response(gz).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      if (buf.byteLength === N*N*8) return createDataTexture(new Uint16Array(buf));
    } catch (err) { console.warn('Terrain field unavailable; rebuilding from survey', err); }
  }
  const buf = await bakeGet('terrain-data');
  if (buf && buf.byteLength === N * N * 8) return createDataTexture(new Uint16Array(buf));
  const arr = new Uint16Array(N * N * 4);
  for (let j = 0; j < N; j++) { fillDataRow(arr, j); if ((j & 15) === 15) await slice(); }
  bakePut('terrain-data', arr.buffer.slice(0));
  return createDataTexture(arr);
}

export function fillDataRow(arr, j) {
  const N = DATA_N;
  {
    const z = wx(j);
    for (let i = 0; i < N; i++) {
      const x = wx(i);
      const h = heightAt(x, z);
      const o = (j * N + i) * 4;
      arr[o] = toHalf(h);
      // footpaths / rivers only matter on land; skip the open sea (cheap early-out)
      if (h > -15.5) {
        arr[o + 1] = toHalf(Math.min(ROAD_CAP, roadDist(x, z)));
        arr[o + 2] = toHalf(Math.min(RIVER_CAP, riverDist(x, z)));
      } else { arr[o + 1] = toHalf(ROAD_CAP); arr[o + 2] = toHalf(RIVER_CAP); }
      arr[o + 3] = 0;
    }
  }
}

/** Re-sample the height channel inside a world rectangle (after a crater / mound) and upload only those rows. */
export function refreshDataRect(tex, x0, x1, z0, z1) {
  const N = DATA_N, arr = tex.image.data;
  const i0 = Math.max(0, Math.floor((x0 + DATA_HALF) / DATA_CELL) - 1), i1 = Math.min(N - 1, Math.ceil((x1 + DATA_HALF) / DATA_CELL) + 1);
  const j0 = Math.max(0, Math.floor((z0 + DATA_HALF) / DATA_CELL) - 1), j1 = Math.min(N - 1, Math.ceil((z1 + DATA_HALF) / DATA_CELL) + 1);
  if (i0 > i1 || j0 > j1) return;
  for (let j = j0; j <= j1; j++) {
    const z = wx(j);
    for (let i = i0; i <= i1; i++) arr[(j * N + i) * 4] = toHalf(heightAt(wx(i), z));
    tex.addUpdateRange((j * N + i0) * 4, (i1 - i0 + 1) * 4);
  }
  tex.needsUpdate = true;
}

/**
 * Wall shade into the A channel: 1 at the foot of a building wall / plinth, fading out over `reach` metres. Sources are
 * the box colliders (walls, houses, fences > 1.2 m) and low box platforms (floors, plinths) — whatever the builders
 * registered. Called once from terrain.start() (all systems have built by then). Returns the number of sources.
 */
export function bakeWallMask(tex, colliders, platforms, heightFn, reach = 4) {
  const N = DATA_N, arr = tex.image.data;
  const fromHalf = THREE.DataUtils.fromHalfFloat;
  let n = 0;
  const paint = (b) => {
    const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
    const ex = Math.abs(b.hw * c) + Math.abs(b.hd * s) + reach, ez = Math.abs(b.hw * s) + Math.abs(b.hd * c) + reach;
    const i0 = Math.max(0, Math.floor((b.x - ex + DATA_HALF) / DATA_CELL)), i1 = Math.min(N - 1, Math.ceil((b.x + ex + DATA_HALF) / DATA_CELL));
    const j0 = Math.max(0, Math.floor((b.z - ez + DATA_HALF) / DATA_CELL)), j1 = Math.min(N - 1, Math.ceil((b.z + ez + DATA_HALF) / DATA_CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = wx(i) - b.x, dz = wx(j) - b.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const d = Math.hypot(Math.max(0, Math.abs(lx) - b.hw), Math.max(0, Math.abs(lz) - b.hd));
      const t = Math.max(0, 1 - d / reach), v = t * t * (3 - 2 * t);
      const o = (j * N + i) * 4 + 3;
      if (v > fromHalf(arr[o])) arr[o] = toHalf(v);
    }
    n++;
  };
  for (const b of colliders) {
    if (!b.box || b.dead || b.tag === 'landforms' || Math.max(b.hw, b.hd) < 1.2) continue;
    if (Number.isFinite(b.y1) && b.y1 - heightFn(b.x, b.z) < 0.8) continue;   // low kerbs do not shade
    paint(b);
  }
  for (const p of platforms) {
    if (!p.box || p.dead || Math.max(p.hw, p.hd) < 1.5) continue;
    const h = heightFn(p.x, p.z);
    if (p.top - h > 2.5 || p.top - h < 0.15) continue;                        // floors / plinths only (not bridges, isles)
    paint(p);
  }
  tex.clearUpdateRanges?.();                                                   // whole texture (a pending partial range would cut it)
  tex.needsUpdate = true;
  return n;
}

// ---- tileable noise -------------------------------------------------------------------------------------------------
function hashI(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function pnoise(x, y, P, seed) { // periodic value noise, period P lattice cells
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const x0 = ((ix % P) + P) % P, y0 = ((iy % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
  const a = hashI(x0, y0, seed), b = hashI(x1, y0, seed), c = hashI(x0, y1, seed), d = hashI(x1, y1, seed);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}
function pfbm(u, v, P, seed, oct) {
  let s = 0, amp = 0.5, tot = 0, p = P;
  for (let o = 0; o < oct; o++) { s += amp * pnoise(u * p, v * p, p, seed + o * 17); tot += amp; amp *= 0.5; p *= 2; }
  return s / tot;
}
export function createNoiseTexture() {
  const N = 256, arr = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, o = (j * N + i) * 4;
    // stretch contrast: fbm clusters around 0.5
    const st = (x) => Math.max(0, Math.min(255, Math.round(((x - 0.5) * 1.9 + 0.5) * 255)));
    arr[o] = st(pfbm(u, v, 4, 11, 5));
    arr[o + 1] = st(pfbm(u, v, 6, 23, 5));
    arr[o + 2] = st(pfbm(u, v, 8, 37, 4));
    // ridged: sharp bright lines where the noise crosses 0.5
    const r = 1 - Math.abs(pfbm(u, v, 5, 51, 4) * 2 - 1);
    arr[o + 3] = Math.round(Math.pow(r, 2.2) * 255);
  }
  const tex = new THREE.DataTexture(arr, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---- scorch layer -----------------------------------------------------------------------------------------------------
const TILE = 16, TN = DATA_N / TILE;
// seconds for a full-strength mark to fade completely
// Recovery round (destruction): a full burn fades linearly over 6 min. The terrain paints char until ~4 min
// (shader.js burnK), the grass grows back as it falls from 0.58 to 0 (2.5 -> 6 min, grass.js), so one channel carries
// both the fading scorch and the regrowth. wet / frost unchanged.
export const FADE = { burn: 360, wet: 45, frost: 75 };
const CH = { burn: 0, wet: 1, frost: 2 };

export class ScorchLayer {
  constructor() {
    const N = DATA_N;
    this.data = new Uint8Array(N * N * 4);
    this.tex = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.needsUpdate = true;
    this.active = new Set();      // tile indices holding non-zero texels
    this.acc = [0, 0, 0];         // fractional fade accumulators per channel
    this.timer = 0;
    this.marks = 0;               // total paint calls (tests)
  }
  // Dead leaves persist when an individual tree falls. Stamp the actual standing crowns
  // once at world creation; burn/wet/frost updates operate on the other three channels.
  setWoodlandFloor(store,species) {
    const size=DATA_N, cell=DATA_CELL;
    for(let i=0;i<store.n;i++){
      const sp=species[store.sp[i]];
      if(sp.def.kind!=='tree')continue;
      const cr=sp.model.crown;
      const radius=Math.max(2,Math.sqrt(cr.rx*cr.rz)*store.s[i]*1.15);
      const x=store.x[i],z=store.z[i],weight=radius>4 ? .88 : .57;
      const ci=(x+DATA_HALF)/cell-.5,cj=(z+DATA_HALF)/cell-.5,r=radius/cell;
      for(let j=Math.max(0,Math.ceil(cj-r)); j<=Math.min(size-1,Math.floor(cj+r)); j++){
        for(let k=Math.max(0,Math.ceil(ci-r)); k<=Math.min(size-1,Math.floor(ci+r)); k++){
          const rad=1-((k-ci)**2+(j-cj)**2)/(r*r);
          if(rad<=0)continue;
          const a=(j*size+k)*4+3, old=this.data[a];
          this.data[a]=old+Math.round((255-old)*rad*weight);
        }
      }
    }
    this.tex.needsUpdate=true;
  }
  /** Paint a soft round mark. kind: 'burn' | 'wet' | 'frost'; strength 0..1. */
  paint(x, z, r, kind = 'burn', strength = 1) {
    const ch = CH[kind];
    if (ch === undefined || !(r > 0)) return;
    const N = DATA_N, d = this.data;
    const rr = r * 1.25 + DATA_CELL;
    const i0 = Math.max(0, Math.floor((x - rr + DATA_HALF) / DATA_CELL)), i1 = Math.min(N - 1, Math.ceil((x + rr + DATA_HALF) / DATA_CELL));
    const j0 = Math.max(0, Math.floor((z - rr + DATA_HALF) / DATA_CELL)), j1 = Math.min(N - 1, Math.ceil((z + rr + DATA_HALF) / DATA_CELL));
    if (i0 > i1 || j0 > j1) return;
    let any = false;
    for (let j = j0; j <= j1; j++) {
      const tz = wx(j) - z;
      for (let i = i0; i <= i1; i++) {
        const tx = wx(i) - x;
        // ragged edge: per-texel hash wobble so marks are not perfect discs
        const wob = 0.82 + 0.36 * hashI(i, j, 3);
        const dd = Math.sqrt(tx * tx + tz * tz) / (r * wob);
        if (dd >= 1.25) continue;
        const k = dd < 0.75 ? 1 : 1 - (dd - 0.75) / 0.5;
        const v = Math.round(255 * strength * k);
        const base = (j * N + i) * 4, o = base + ch;
        if (v > d[o]) {
          d[o] = v; any = true;
          if (ch === 1 && d[base + 2]) d[base + 2] = Math.max(0, d[base + 2] - v); // water washes frost away
          if (ch === 2 && d[base + 1]) d[base + 1] = Math.max(0, d[base + 1] - (v >> 1)); // frost takes the wet sheen
        }
      }
    }
    if (!any) return;
    for (let j = j0; j <= j1; j++) this.tex.addUpdateRange((j * N + i0) * 4, (i1 - i0 + 1) * 4);
    for (let tj = (j0 / TILE) | 0; tj <= (j1 / TILE) | 0; tj++) for (let ti = (i0 / TILE) | 0; ti <= (i1 / TILE) | 0; ti++) this.active.add(tj * TN + ti);
    this.tex.needsUpdate = true;
    this.marks++;
  }
  /** Pull marks of `kind` inside r of (x, z) down to at most `level` (0..1) — restoration (craft 溯光) drains scorch. */
  erase(x, z, r, kind = 'burn', level = 0) {
    const ch = CH[kind];
    if (ch === undefined || !(r > 0)) return;
    const N = DATA_N, d = this.data, cap = Math.round(255 * Math.max(0, level));
    const rr = r * 1.25 + DATA_CELL;
    const i0 = Math.max(0, Math.floor((x - rr + DATA_HALF) / DATA_CELL)), i1 = Math.min(N - 1, Math.ceil((x + rr + DATA_HALF) / DATA_CELL));
    const j0 = Math.max(0, Math.floor((z - rr + DATA_HALF) / DATA_CELL)), j1 = Math.min(N - 1, Math.ceil((z + rr + DATA_HALF) / DATA_CELL));
    if (i0 > i1 || j0 > j1) return;
    let any = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const tx = wx(i) - x, tz = wx(j) - z;
      if (tx * tx + tz * tz > rr * rr) continue;
      const o = (j * N + i) * 4 + ch;
      if (d[o] > cap) { d[o] = cap; any = true; }
    }
    if (!any) return;
    for (let j = j0; j <= j1; j++) this.tex.addUpdateRange((j * N + i0) * 4, (i1 - i0 + 1) * 4);
    this.tex.needsUpdate = true;
  }
  /** Fade marks back (call every frame with game dt; does real work about once per second). */
  tick(dt) {
    if (!this.active.size) return;
    this.timer += dt;
    if (this.timer < 1) return;
    const step = this.timer; this.timer = 0;
    const dec = [0, 0, 0];
    const rates = [255 / FADE.burn, 255 / FADE.wet, 255 / FADE.frost];
    for (let c = 0; c < 3; c++) { this.acc[c] += rates[c] * step; dec[c] = Math.floor(this.acc[c]); this.acc[c] -= dec[c]; }
    if (!dec[0] && !dec[1] && !dec[2]) return;
    const N = DATA_N, d = this.data;
    let minI = N, maxI = -1, minJ = N, maxJ = -1;
    for (const t of this.active) {
      const ti = t % TN, tj = (t / TN) | 0;
      let live = false;
      for (let j = tj * TILE; j < tj * TILE + TILE; j++) {
        let o = (j * N + ti * TILE) * 4;
        for (let i = 0; i < TILE; i++, o += 4) {
          for (let c = 0; c < 3; c++) {
            const v = d[o + c];
            if (v) { const nv = v > dec[c] ? v - dec[c] : 0; d[o + c] = nv; if (nv) live = true; }
          }
        }
      }
      if (!live) this.active.delete(t);
      minI = Math.min(minI, ti * TILE); maxI = Math.max(maxI, ti * TILE + TILE - 1);
      minJ = Math.min(minJ, tj * TILE); maxJ = Math.max(maxJ, tj * TILE + TILE - 1);
    }
    if (maxI < 0) return;
    for (let j = minJ; j <= maxJ; j++) this.tex.addUpdateRange((j * N + minI) * 4, (maxI - minI + 1) * 4);
    this.tex.needsUpdate = true;
  }
  /** Mark strength 0..1 at (x,z) for kind (tests / gameplay). */
  at(x, z, kind = 'burn') {
    const i = Math.floor((x + DATA_HALF) / DATA_CELL), j = Math.floor((z + DATA_HALF) / DATA_CELL);
    if (i < 0 || j < 0 || i >= DATA_N || j >= DATA_N) return 0;
    return this.data[(j * DATA_N + i) * 4 + (kind==='litter' ? 3 : CH[kind] ?? 0)] / 255;
  }
}
