// The broom wake's footprint on the ground and on the water.
//
// Parts of the stamping model (a soft bell with a broad faint skirt across the track, petal loss
// rising with the wind the vortex pair drives over the ground, the outside of a turn taking more,
// patchy tufts, foam laid as freshness that later reads as churn, lace and flecks) are adapted
// from Petalwake (src/fx/strip.js, src/fx/wake.js), MIT License, Copyright (c) 2026 Jacob Miller.
// The storage is this game's own: CPU tiles instead of render targets. Petalwake's notice:
//
// MIT License
//
// Copyright (c) 2026 Jacob Miller
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// Storage: sparse world tiles (8 x 8 texels) from a fixed pool keep their history for ~2 min, so
// a track survives the player flying off and coming back. The GPU copy is a rolling window around
// the player addressed toroidally (texel = world texel mod N, RepeatWrapping): moving the window
// only re-encodes the tiles that enter it. A tile is re-encoded when it is stamped and every
// quarter second while it recovers. Nothing is allocated after construction.
//   r, g = lean of the blades (signed), b = how far they are laid over,
//   a    = petals stripped (land) or foam freshness (water).
import * as THREE from 'three';

const TILE = 8;
// leanX, leanZ, laid, laid time, laid duration, strip, strip time, strip duration, foam, foam time
const STRIDE = 10;
const FOAM_TAU = 9;
const DECAY_STEP = .25;
export const WAKE_LIFE = 125;   // the longest any texel keeps a mark (s)
const smooth = THREE.MathUtils.smoothstep;
const key = (ix, iz) => (iz + 32768) * 65536 + ix + 32768;
const mod = (a, n) => ((a % n) + n) % n;

/** Laid-over grass rises again over `dur` seconds (18-40 s: deeper for a faster pass). */
export function laidLeft(age, dur) {
  return age < 0 || age >= dur ? 0 : 1 - smooth(age, .12 * dur, dur);
}
/** Stripped flowers grow their petals back over `dur` seconds (70-120 s). */
export function stripLeft(age, dur) {
  return age < 0 || age >= dur ? 0 : 1 - smooth(age, .2 * dur, dur);
}
/** Foam freshness: 1 = just churned. The water shader turns it into churn, lace, then flecks. */
export function foamLeft(age) {
  return age < 0 || age > 5 * FOAM_TAU ? 0 : Math.exp(-age / FOAM_TAU);
}

/** Where flakes tear loose across a swath of half-width W: most under the two vortex cores. */
export function coreWeight(lat, W) {
  const d = (Math.abs(lat) - .45 * W) / (.35 * W);
  return .3 + .7 * Math.exp(-d * d);
}

/** Window and pool size per quality tier (phones keep the map at 128²). */
export function wakeFieldSize(q) {
  const small = !q || q.mobile || q.name === 'low';
  return small ? { cell: 1.5, n: 128, tiles: 320 } : { cell: 1, n: 256, tiles: 640 };
}

export const plantWake = {
  gMeadowMemory: { value: null },
  gMeadowBounds: { value: new THREE.Vector4() },
};
/** Game time until which foam laid on water may still show (the water keeps its fine grid). */
export const wakeFoam = { until: -Infinity };
// gMeadowBounds = window origin x, z (m), window span (m; 0 = nothing to read), texel (m).
export const plantWakeGLSL = /* glsl */`
uniform sampler2D gMeadowMemory;
uniform vec4 gMeadowBounds;
// xy = sideways lean, z = laid over, w = missing flower petals.
vec4 plantWakeAt(vec2 root) {
  if (gMeadowBounds.z <= 0.) return vec4(0.);
  vec2 local = root - gMeadowBounds.xy;
  float edge = min(min(local.x, local.y), gMeadowBounds.z - max(local.x, local.y));
  if (edge < gMeadowBounds.w) return vec4(0.);
  vec4 m = textureLod(gMeadowMemory, root / gMeadowBounds.z, 0.);
  return vec4((m.rg*255.-128.)/127., m.ba) * smoothstep(gMeadowBounds.w, 6.*gMeadowBounds.w, edge);
}
// Colour of laid grass: lay = blade lean (xy of plantWakeAt), toEye = ground point - eye (xz).
vec3 laidTone(vec3 col, vec2 lay, vec2 fromEye) {
  float away = dot(lay / max(length(lay), .05), normalize(fromEye + vec2(1e-3)));
  vec3 across = col * vec3(.72, .85, .68);
  vec3 shade = col * vec3(.50, .66, .48);
  vec3 silver = mix(col, vec3(dot(col, vec3(.30, .59, .11))), .3) * 1.34 + vec3(.022, .03, .022);
  return away < 0. ? mix(across, shade, -away) : mix(across, silver, away);
}
`;

function hash(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
/** Tufts a metre or three across hold on, or go early. 0..1. */
export function wakePatch(x, z) {
  return .62 * valueNoise(x / 2.7, z / 2.7) + .38 * valueNoise(x / .95 + 17.3, z / .95 - 5.1);
}

export class MeadowWakeField {
  constructor(size = wakeFieldSize({ name: 'high' })) {
    this.cell = size.cell;
    this.n = size.n;
    this.slots = this.n / TILE;
    this.tiles = new Map();
    this.pool = Array.from({ length: size.tiles }, () => ({
      key: -1, ix: 0, iz: 0, time: -Infinity, dirty: false, data: new Float32Array(TILE * TILE * STRIDE),
    }));
    this.cursor = 0;
    const S = this.slots;
    this.slotKey = new Float64Array(S * S).fill(-1);
    this.slotTile = new Array(S * S).fill(null);
    this.slotInk = new Uint8Array(S * S);
    const data = new Uint8Array(this.n * this.n * 4);
    for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = 128;
    this.texture = new THREE.DataTexture(data, this.n, this.n, THREE.RGBAFormat);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.generateMipmaps = false;
    this.texture.name = 'wake: lean, laid, stripped petals / foam';
    this.texture.needsUpdate = true;
    this.bounds = new THREE.Vector4();
    this.tx0 = this.tz0 = NaN;
    this.lastDecay = this.lastUpload = -Infinity;
    this.dirty = 0;
    this.inked = 0;
    this.stamped = 0;
  }

  // ---- tiles
  release(tile) {
    if (tile.key !== -1 && this.tiles.get(tile.key) === tile) this.tiles.delete(tile.key);
    tile.key = -1;
  }
  allocate(time) {
    const pool = this.pool;
    for (let n = 0; n < pool.length; n++) {
      const t = pool[this.cursor];
      this.cursor = (this.cursor + 1) % pool.length;
      if (t.key === -1) return t;
      if (time - t.time >= WAKE_LIFE || time < t.time - 1) { this.release(t); return t; }
    }
    // Every tile is still recovering: the one allocated longest ago gives way.
    const t = pool[this.cursor];
    this.cursor = (this.cursor + 1) % pool.length;
    this.release(t);
    return t;
  }
  tileAt(tx, tz, time) {
    const id = key(tx, tz);
    let tile = this.tiles.get(id);
    if (!tile) {
      tile = this.allocate(time);
      tile.key = id; tile.ix = tx * TILE; tile.iz = tz * TILE; tile.time = time;
      tile.data.fill(0);
      this.tiles.set(id, tile);
      const S = this.slots, slot = mod(tz, S) * S + mod(tx, S);
      if (this.slotKey[slot] === id) this.slotTile[slot] = tile;
    }
    if (!tile.dirty) { tile.dirty = true; this.dirty++; }
    tile.time = Math.max(tile.time, time);
    return tile;
  }

  /**
   * Stamp the ground (or water) between two recorded cross sections of the air trail.
   * survey(x, z) -> meadow grows here; water(x, z) -> open water here.
   * release(x, z, side, pressure, petalLoss, lateral) is called per stamped meadow texel.
   */
  sweep(fromX, fromZ, s, survey, release, water) {
    this.force = 0;
    if (s.bare && !s.wet) return;
    const close = 1 - smooth(s.clearance, .8, 6.5);   // a broom 3 m up still lays a clear swath
    const force = Math.min(1.2, s.drive * close * (s.gust ?? 1));
    if (force < .02) return;
    const run = Math.hypot(s.x - fromX, s.z - fromZ);
    if (run < .05) return;
    const dx = (s.x - fromX) / run, dz = (s.z - fromZ) / run;
    const cell = this.cell, turn = s.turn || 0, f1 = Math.min(1, force);
    const W = 1.45 + 3.3 * force;                  // half-width of the laid channel's core (m)
    const shift = turn * (.45 + 1.25 * force);     // the pair is thrown to the outside of a turn
    const reach = W * 2.4 * (1 + .4 * Math.abs(turn)) + Math.abs(shift) + cell;
    const stripPeak = 1 - Math.exp(-Math.pow(force / .55, 1.6));
    const laidDur = 18 + 22 * f1, stripDur = 70 + 50 * f1;
    // ∫ coreWeight·√pressure across the swath (m): lets the flakes be counted per metre flown
    // rather than per texel, so a narrow low-speed swath still sheds a clear stream
    this.W = W; this.shift = shift; this.force = force; this.swath = 0;
    for (let l = -2.4 * W; l <= 2.4 * W; l += .2 * W) {
      const q = l * l / (.3844 * W * W), b = .74 * Math.exp(-q) + .26 * Math.exp(-q / 5.3);
      this.swath += coreWeight(l, W) * Math.sqrt(Math.min(1, force * b * 1.3)) * .2 * W;
    }
    const i0 = Math.floor((Math.min(fromX, s.x) - reach) / cell), i1 = Math.floor((Math.max(fromX, s.x) + reach) / cell);
    const j0 = Math.floor((Math.min(fromZ, s.z) - reach) / cell), j1 = Math.floor((Math.max(fromZ, s.z) + reach) / cell);
    const time = s.time;
    for (let iz = j0; iz <= j1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const x = (ix + .5) * cell, z = (iz + .5) * cell, rx = x - fromX, rz = z - fromZ;
      const along = rx * dx + rz * dz;
      // Each texel takes the stronger of the stamps that reach it (max, not sum), so consecutive
      // segments overlap a little instead of feathering: a feathered seam would leave a weaker
      // stripe across the track at every section.
      if (along < -.4 * cell || along > run + .4 * cell) continue;
      const lat0 = rz * dx - rx * dz;              // + is the outside of a positive turn
      const lat = lat0 - shift;
      const side = lat < 0 ? -1 : 1, outer = turn * side;
      const bank = 1 + .42 * outer;
      const sig = .62 * W * (1 + .25 * outer);
      const q = lat * lat / (sig * sig);
      const bell = .74 * Math.exp(-q) + .26 * Math.exp(-q / 5.3);
      const pressure = Math.min(1, force * bank * bell * 1.3);
      if (pressure < .02) continue;
      if (s.wet) {
        if (!water?.(x, z)) continue;
        // a churned track right under the broom, its edge wandering, and the surface torn on
        // either side where the vortices sweep over it
        const r = (.9 + 1.7 * force) * (.72 + .2 * Math.sin(x * 1.31 + z * .73) + .16 * Math.sin(x * .47 - z * 1.93));
        const core = (1 - smooth(Math.abs(lat0), .2 * r, r)) * Math.min(1, force * 1.35);
        const ring = (Math.abs(lat) - .85 * W) / (.45 + .35 * force);
        const torn = Math.exp(-ring * ring) * .55 * force * bank;
        const fresh = Math.min(1, Math.max(core, torn));
        if (fresh < .02) continue;
        const tile = this.tileAt(Math.floor(ix / TILE), Math.floor(iz / TILE), time);
        const d = tile.data, i = ((iz - tile.iz) * TILE + ix - tile.ix) * STRIDE;
        d[i + 8] = Math.max(d[i + 8] * foamLeft(time - d[i + 9]), fresh);
        d[i + 9] = time;
        wakeFoam.until = Math.max(wakeFoam.until, time + 5 * FOAM_TAU * fresh);
        this.stamped++;
        continue;
      }
      if (!survey(x, z)) continue;
      const tile = this.tileAt(Math.floor(ix / TILE), Math.floor(iz / TILE), time);
      const d = tile.data, i = ((iz - tile.iz) * TILE + ix - tile.ix) * STRIDE;
      // laid over: along the middle the air dragged with the rider combs the blades flat in the
      // direction of travel (one lay, like a mown stripe); toward the edges they fan outward
      const laidAge = time - d[i + 3], keep = laidLeft(laidAge, d[i + 4]);
      const oldLaid = d[i + 2] * keep;
      const laid = Math.max(oldLaid, Math.min(.96, pressure * .97));
      const fan = Math.max(-1, Math.min(1, lat / (.35 * W))) * bank;
      const comb = .85 - .5 * Math.min(1, Math.abs(fan));
      const k = Math.min(1, pressure * 1.6);
      d[i] = THREE.MathUtils.clamp(d[i] * keep * (1 - k) + pressure * (dx * comb - dz * fan * .8), -1, 1);
      d[i + 1] = THREE.MathUtils.clamp(d[i + 1] * keep * (1 - k) + pressure * (dz * comb + dx * fan * .8), -1, 1);
      d[i + 4] = laid > oldLaid + .01 ? Math.max(laidDur, d[i + 4] - laidAge) : Math.max(1, d[i + 4] - laidAge);
      d[i + 2] = laid; d[i + 3] = time;
      // petals: most from the middle of the track, more the faster the pass, the outside of a
      // turn takes more; the map keeps the most ever taken, a second pass takes the difference
      const stripAge = time - d[i + 6];
      const oldStrip = d[i + 5] * stripLeft(stripAge, d[i + 7]);
      const sigS = .55 * W * (1 + .3 * outer), qs = lat * lat / (sigS * sigS);
      const take = Math.min(.98, stripPeak * bank * (.78 * Math.exp(-qs) + .22 * Math.exp(-qs / 5.3)) *
        (.8 + .4 * wakePatch(x, z)) * 1.15);
      const loss = Math.max(0, take - oldStrip);
      if (loss > 0) { d[i + 5] = take; d[i + 6] = time; d[i + 7] = stripDur; }
      this.stamped++;
      release?.(x, z, side, pressure, loss, lat);
    }
  }

  /** Decayed state at a world point (tools and tests). */
  at(x, z, time) {
    const cell = this.cell, ix = Math.floor(x / cell), iz = Math.floor(z / cell);
    const tile = this.tiles.get(key(Math.floor(ix / TILE), Math.floor(iz / TILE)));
    if (!tile || time - tile.time >= WAKE_LIFE) return { x: 0, z: 0, flat: 0, strip: 0, foam: 0 };
    const d = tile.data, i = ((iz - tile.iz) * TILE + ix - tile.ix) * STRIDE;
    const e = laidLeft(time - d[i + 3], d[i + 4]);
    return { x: d[i] * e, z: d[i + 1] * e, flat: d[i + 2] * e, strip: d[i + 5] * stripLeft(time - d[i + 6], d[i + 7]),
      foam: d[i + 8] * foamLeft(time - d[i + 9]) };
  }

  encode(tile, slot, time) {
    const S = this.slots, n = this.n, image = this.texture.image.data;
    const sx = (slot % S) * TILE, sz = Math.floor(slot / S) * TILE;
    const d = tile.data;
    let ink = 0;
    for (let j = 0; j < TILE; j++) {
      let o = ((sz + j) * n + sx) * 4, i = j * TILE * STRIDE;
      for (let k = 0; k < TILE; k++, o += 4, i += STRIDE) {
        const e = d[i + 4] > 0 ? laidLeft(time - d[i + 3], d[i + 4]) : 0;
        const strip = d[i + 7] > 0 ? d[i + 5] * stripLeft(time - d[i + 6], d[i + 7]) : 0;
        const foam = d[i + 8] > 0 ? d[i + 8] * foamLeft(time - d[i + 9]) : 0;
        const laid = d[i + 2] * e, a = Math.max(strip, foam);
        image[o] = 128 + Math.round(127 * d[i] * e);
        image[o + 1] = 128 + Math.round(127 * d[i + 1] * e);
        image[o + 2] = Math.round(255 * laid);
        image[o + 3] = Math.round(255 * a);
        if (laid > .004 || a > .004) ink = 1;
      }
    }
    if (this.slotInk[slot] !== ink) this.inked += ink ? 1 : -1;
    this.slotInk[slot] = ink;
    return ink;
  }
  clearSlot(slot) {
    const S = this.slots, n = this.n, image = this.texture.image.data;
    const sx = (slot % S) * TILE, sz = Math.floor(slot / S) * TILE;
    for (let j = 0; j < TILE; j++) {
      for (let k = 0, o = ((sz + j) * n + sx) * 4; k < TILE; k++, o += 4) {
        image[o] = image[o + 1] = 128; image[o + 2] = image[o + 3] = 0;
      }
    }
    if (this.slotInk[slot]) this.inked--;
    this.slotInk[slot] = 0;
  }

  /** Bring the GPU window (centred on x, z) up to date. Cheap when nothing changed. */
  refresh(x, z, time) {
    const S = this.slots, cell = this.cell;
    const tx0 = Math.floor(x / (cell * TILE)) - (S >> 1), tz0 = Math.floor(z / (cell * TILE)) - (S >> 1);
    const moved = tx0 !== this.tx0 || tz0 !== this.tz0;
    const decay = time - this.lastDecay >= DECAY_STEP || time < this.lastDecay;
    // fresh stamps reach the GPU at up to 30 Hz (one texture upload each)
    const stamped = this.dirty && (time - this.lastUpload >= 1 / 30 || time < this.lastUpload);
    if (!moved && !stamped && !(decay && (this.inked || this.tiles.size))) return false;
    this.lastUpload = time;
    if (decay) this.lastDecay = time;
    this.tx0 = tx0; this.tz0 = tz0;
    let changed = false;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const tx = tx0 + i, tz = tz0 + j, id = key(tx, tz);
      const slot = mod(tz, S) * S + mod(tx, S);
      const fresh = this.slotKey[slot] !== id;
      let tile = fresh ? this.tiles.get(id) || null : this.slotTile[slot];
      if (tile && (tile.key !== id || time - tile.time >= WAKE_LIFE || time < tile.time - 1)) {
        if (tile.key === id) this.release(tile);
        tile = null;
      }
      this.slotKey[slot] = id; this.slotTile[slot] = tile;
      if (!tile) { if (this.slotInk[slot]) { this.clearSlot(slot); changed = true; } continue; }
      if (fresh || tile.dirty || (decay && this.slotInk[slot])) {
        if (tile.dirty) { tile.dirty = false; this.dirty--; }
        this.encode(tile, slot, time);
        changed = true;
      }
    }
    // Stamps outside the window (never in practice) must not keep the refresh awake.
    if (this.dirty) for (let k = 0; k < this.pool.length; k++) if (this.pool[k].dirty) { this.pool[k].dirty = false; this.dirty--; }
    this.bounds.set(tx0 * TILE * cell, tz0 * TILE * cell, this.inked ? this.n * cell : 0, cell);
    if (changed) this.texture.needsUpdate = true;
    return changed;
  }
}
