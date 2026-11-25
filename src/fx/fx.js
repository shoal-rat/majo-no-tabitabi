// G.fx — visual effects (DESIGN §6.3). GPU particle pools, ribbon trails, ground rings / magic circles, beams,
// lightning, pooled flash lights, floating text, screen shake and the ambient motes of the three lands.
//
// Files: particles.js (pools + analytic shader)  atlas.js (procedural sprites)  recipes.js (every named burst/emitter)
//        ribbons.js (trails)  bolts.js (beams + lightning)  decals.js (rings, sigils, light pools)  lights.js (flash)
//        text.js (floating words)  ambient.js (land motes)  glsl.js (shared shader bits)
//
// Common opts for burst()/emitter(): { color, color2, scale, count, dir, normal, power, grounded, radius, height }
//   color   hex / THREE.Color / css string / element name ('fire' …) — tints the magic parts, never smoke or debris
//   scale   size multiplier (1 = the recipe's nominal size)          count  particle-count multiplier (1 = recipe)
//   dir     launch / travel direction                                 normal surface normal (default +y; hits default to −dir)
//   power   0.25..3 — more particles, brighter light, harder shake    grounded  force ground rings on/off (auto)
// Time base: game time (pauses with the menu, slows with hitstop). Everything is pooled; nothing allocates per frame.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { makeAtlas, makeSigil } from './atlas.js';
import { ParticlePool, ctx, emit, GLOW, SOFT } from './particles.js';
import { shared } from './glsl.js';
import { makeRecipes, ELEMENT_COLOR } from './recipes.js';
import { Ribbons } from './ribbons.js';
import { Bolts, MAX_BEAMS, BEAM_EL } from './bolts.js';
import { Decals, RING, SIGIL, DISC } from './decals.js';
import { FlashLights } from './lights.js';
import { FloatText, TEXT_K } from './text.js';
import { Ambient } from './ambient.js';
import { Shapes } from './shapes.js';
import { makeKit } from './kit.js';
import { installMagic } from './magic.js';
import { Circles, makeCircleTexture, CIRCLE, WARD, BURST } from './circles.js';
import { installDuel } from './duel.js';
import { clamp, smoothstep, TAU } from '../core/util.js';

const GLOW_CAP = 4600, SOFT_CAP = 3400;          // 8000 particles in all (DESIGN §8)
const REBASE_AT = 1200, REBASE_BY = 1000;          // keep shader time small for float precision
const NO = Object.freeze({});
/** Bursts much larger than their nominal scale: distance LOD measures their distance in units of this. */
const BIG = { explosion_big: 2.5, crater: 3.5, greatlantern: 3.5, boss_death: 2.5, boss_death_end: 2.5, clash_big: 2.5, levelup: 1.5, magic_circle: 1.5 };
const UP = new THREE.Vector3(0, 1, 0);

// ---- scratch ------------------------------------------------------------------------------------------------------
const _c = new THREE.Color(), _c2 = new THREE.Color();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _w = new THREE.Vector3();
const _right = new THREE.Vector3(), _up = new THREE.Vector3();
const warned = new Set();

/** Any colour-ish thing -> sRGB hex, or -1. */
function hexOf(c) {
  if (c === undefined || c === null) return -1;
  if (typeof c === 'number') return c;
  if (c.isColor) return c.getHex();
  if (typeof c === 'string') {
    if (ELEMENT_COLOR[c] !== undefined) return ELEMENT_COLOR[c];
    return _c2.set(c).getHex();
  }
  return -1;
}
/** linear THREE.Color from hex (scratch `out`). */
const lin = (hex, out = _c) => out.setHex(hex);

/** Pale tint for the crisp lines of a circle (its colour lifted toward white). */
function coreOf(hex) { return _c2.setHex(hex).lerp(_c.setRGB(1, 1, 1), 0.6).getHex(); }
// one scratch options object for ground circles (circles.add reads it at once)
const CO = { pos: null, normal: null, ref: null, radius: 1, color: 0, core: 0, intensity: 1.4, spin: 0.8, layers: 15, dur: 1, outDur: 0.3, out: 'fade',
  draw: 0.3, style: CIRCLE, fill: 1, delay: 0, handle: false, charge: -1, tracked: false };
function circleOpts(pos, normal, radius, hex, dur, I, spin, delay = 0, tracked = false) {
  CO.pos = pos; CO.normal = normal; CO.ref = null; CO.radius = radius; CO.color = hex; CO.core = coreOf(hex); CO.intensity = I; CO.spin = spin;
  CO.layers = radius < 1.2 ? 13 : 15; CO.dur = Math.max(0.1, dur); CO.outDur = Math.min(0.45, CO.dur * 0.3); CO.out = 'fade';
  CO.draw = Math.min(0.4, Math.max(0.12, CO.dur * 0.28)); CO.style = CIRCLE; CO.fill = 1; CO.delay = delay; CO.handle = false; CO.charge = -1; CO.tracked = tracked;
  return CO;
}

function warnOnce(kind, name) {
  const k = kind + ':' + name;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(`[fx] unknown ${kind} "${name}" (ignored)`);
}

// ---- the system ---------------------------------------------------------------------------------------------------
let now = 0;
let pools, ribbons, bolts, decals, lights, texts, ambient, R, shapes, K, circles, overlay;
const emitters = [];       // live handles
const laterQ = [];         // pooled delayed bursts
const beams = [];          // live beam handles

/** Emission state shared with recipes.js (X.E). */
const E = {
  color: -1, color2: -1, scale: 1, k: 1, power: 1, grounded: false, x: 0, y: 0, z: 0, radius: 0, height: 0,
  rate: 1, dt: 0, em: null, dist: 0, count: 1,
};

function camDist(x, y, z) { const p = G.camera.position; return Math.hypot(x - p.x, y - p.y, z - p.z); }
function lod(d) { return d < 40 ? 1 : Math.max(0.2, 40 / d); }
function groundY(x, z, y) {
  const W = G.world;
  if (!W) return y;
  return W.groundAt ? W.groundAt(x, z, y + 0.5) : W.heightAt(x, z);
}
const groundAtXZ = (x, z) => G.world.groundAt(x, z);
function windAt(x, y, z, out) {
  const el = G.elements;
  if (el?.windAt) {
    _v2.set(x, y, z);
    const r = (el.visualWindAt || el.windAt)(_v2, out);   // particles also feel the visual-only gusts
    if (r && r !== out && r.isVector3) out.copy(r);
    return out;
  }
  return out.set(0.55, 0, 0.25);    // a gentle breeze when nobody simulates wind
}

/** Fill ctx / E for an effect centred at pos. */
function prime(pos, opts, isHit, name) {
  const c = ctx;
  c.now = now; c.x = pos.x; c.y = pos.y; c.z = pos.z;
  c.sweep = false; c.dt = 0; c.px = pos.x; c.py = pos.y; c.pz = pos.z;
  c.vx = c.vy = c.vz = 0;
  const n = opts.normal, d = opts.dir;
  if (n) { _v.copy(n); if (_v.lengthSq() < 1e-8) _v.copy(UP); _v.normalize(); }
  else if (isHit && d) { _v.copy(d).negate(); if (_v.lengthSq() < 1e-8) _v.copy(UP); _v.normalize(); }
  else _v.copy(UP);
  c.nx = _v.x; c.ny = _v.y; c.nz = _v.z;
  if (d) { _v.copy(d); if (_v.lengthSq() < 1e-8) _v.set(c.nx, c.ny, c.nz); _v.normalize(); c.dx = _v.x; c.dy = _v.y; c.dz = _v.z; }
  else { c.dx = c.nx; c.dy = c.ny; c.dz = c.nz; }
  windAt(pos.x, pos.y, pos.z, _w);
  c.wx = _w.x; c.wy = _w.y; c.wz = _w.z;
  const scale = opts.scale ?? 1;
  c.scale = scale; c.speed = 1; c.delay = 0; c.area = 1; c.hk = 1;
  E.color = hexOf(opts.color); E.color2 = hexOf(opts.color2);
  c.c0 = E.color; c.c1 = -1;
  E.scale = scale;
  E.power = clamp(opts.power ?? 1, 0.25, 3);
  E.count = opts.count ?? 1;
  E.x = pos.x; E.y = pos.y; E.z = pos.z;
  E.radius = opts.radius || 0; E.height = opts.height || 0;
  E.dist = camDist(pos.x, pos.y, pos.z);
  E.k = (G.quality?.particles ?? 1) * (opts.count ?? 1) * lod(E.dist / (Math.max(1, scale) * (BIG[name] || 1))) * E.power;
  E.grounded = opts.grounded ?? Math.abs(pos.y - groundY(pos.x, pos.z, pos.y)) < 0.8 * Math.max(1, scale);
}

// ---- helpers the recipes use (X) ----------------------------------------------------------------------------------
const X = {
  E,
  get K() { return K; },
  get combustion() { return api.magic?.combustion; },
  get magic() { return api.magic; },
  get duel() { return api.duel; },
  /** unit vector from the current burst centre toward the camera (out) */
  toCam(out) { const cp = G.camera.position; out.set(cp.x - ctx.x, cp.y - ctx.y, cp.z - ctx.z); const l = out.length(); return l > 1e-4 ? out.divideScalar(l) : out.set(0, 1, 0); },
  /** vfx: a camera-facing starburst at the burst centre (circles.js BURST) */
  star(radius, hex, dur = 0.3, delay = 0) {
    if (E.dist > 120 || E.k < 0.12) return;
    _v2.set(ctx.x, ctx.y, ctx.z);
    circles.add({ pos: _v2, normal: UP, radius, color: hex, core: 0xffffff, intensity: 1.5, dur, outDur: dur * 0.75, out: 'fade', style: BURST, delay });
  },
  fireLight(p) {
    if (G.quality?.particles >= 0.6 && p.pos.distanceToSquared(G.camera.position) < 45 * 45) lights.trackProjectile(p, lin(0xff7527));
  },
  get now() { return now; },
  p(s, n) { emit(pools, s, n * E.k); },
  q(s, rate) { emit(pools, s, rate * E.rate * E.dt * E.k); },
  one(s) { emit(pools, s, 1); },
  count(n) { const v = n * E.rate * E.dt * E.k; let k = v | 0; if (Math.random() < v - k) k++; return k; },
  area(R0) { const r = E.radius || R0; ctx.area = r / R0; return (r / R0) * (r / R0); },
  at(x, y, z) { ctx.x = x; ctx.y = y; ctx.z = z; ctx.sweep = false; },
  ground(x, z, y) { return groundY(x, z, y); },
  /** brief hit-stop for big impacts near the camera (visual pacing; never stacks past the longest request) */
  hitstop(sec) { if (G.settings?.shake !== false) G.hitstop?.(sec, 0.06); },
  every(sec) { const em = E.em; if (!em) return true; if (now - em.tick >= sec) { em.tick = now; return true; } return false; },
  _decal(style, radius, hex, dur, I, delay, p3, spin) {
    const c = ctx;
    let x = c.x, y = c.y, z = c.z, nx = c.nx, ny = c.ny, nz = c.nz;
    if (E.grounded) { y = groundY(x, z, y) + 0.06; nx = 0; ny = 1; nz = 0; }
    decals.add(style, x, y, z, nx, ny, nz, lin(hex), radius * E.scale, now + c.delay + delay, dur, I, spin, p3);
  },
  // final-duel: power no longer pushes ground rings / discs past the displayable range (big impacts flooded the ground)
  ring(radius, hex, dur, delay = 0) { X._decal(RING, radius, hex, dur, 1.8 * Math.min(1.2, Math.sqrt(E.power)), delay, 0.16, 0); },
  disc(radius, hex, dur, I = 1) { X._decal(DISC, radius, hex, dur, I * Math.min(1.2, E.power), 0, 0, 0); },
  sigil(radius, hex, dur, I = 1) {   // vfx: the layered rune circle (circles.js) instead of the flat sigil decal
    const c = ctx;
    let y = c.y, nx = c.nx, ny = c.ny, nz = c.nz;
    if (E.grounded) { y = groundY(c.x, c.z, y) + 0.07; nx = 0; ny = 1; nz = 0; }
    _v2.set(c.x, y, c.z); _w.set(nx, ny, nz);
    circles.add(circleOpts(_v2, _w, radius * E.scale, hex, dur, I * 1.3, 0.7, c.delay));
  },
  /** circle at the burst centre facing the normal (or flat on the ground when grounded) — recipes use it */
  circle(o) { if (E.dist > 140) return null; o.pos = o.pos || _v2.set(ctx.x, ctx.y, ctx.z); return circles.add(o); },
  light(hex, intensity, dur, distance) {
    if (E.dist > 160) return;
    const s = E.scale;
    lights.flash(ctx.x + ctx.nx * 0.6 * s, ctx.y + ctx.ny * 0.6 * s, ctx.z + ctx.nz * 0.6 * s, lin(hex), intensity * E.power * Math.max(1, s * s), dur, distance * Math.sqrt(Math.max(s, 0.3)));
  },
  shake(amount, dur) {
    const near = 8 + 6 * E.scale, far = near + 45 * E.scale;
    const k = 1 - smoothstep(near, far, E.dist);
    if (k > 0) api.shake(amount * k * Math.sqrt(E.power), dur);
  },
  later(t, name, dx, dy, dz, scale) {
    let it = null;
    for (let i = 0; i < laterQ.length; i++) if (!laterQ[i].on) { it = laterQ[i]; break; }
    if (!it) { if (laterQ.length >= 64) return; it = { on: false, at: 0, name: '', x: 0, y: 0, z: 0, scale: 1, color: -1, color2: -1, count: 1, power: 1, grounded: undefined }; laterQ.push(it); }
    it.on = true; it.at = now + t; it.name = name;
    it.x = E.x + dx; it.y = E.y + dy; it.z = E.z + dz; it.scale = E.scale * scale;
    it.color = E.color; it.color2 = E.color2; it.power = E.power;
    it.count = E.count;
  },
  arc(n, len, hex, dur) {
    const c = ctx, s = E.scale, col = lin(hex);
    for (let i = 0; i < n; i++) {
      // random direction in the hemisphere around the normal
      let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      if (x * c.nx + y * c.ny + z * c.nz < 0) { x = -x; y = -y; z = -z; }
      const L = len * s * (0.55 + 0.45 * Math.random());
      bolts.bolt(c.x, c.y, c.z, c.x + x * L, c.y + y * L, c.z + z * L, col, 0.07 * Math.sqrt(s), 1.3, now + Math.random() * dur * 0.5, dur, 1, 0.8);
    }
  },
};

// ---- handles ------------------------------------------------------------------------------------------------------
const NULL_TRAIL = Object.freeze({ push() { return this; }, stop() {}, reset() { return this; }, setColor() { return this; }, setWidth() { return this; }, remove() {} });

class Emitter {
  constructor(name, fn, opts) {
    this.name = name; this.fn = fn;
    this.pos = new THREE.Vector3();
    if (opts.pos) this.pos.copy(opts.pos);
    this.dir = opts.dir ? new THREE.Vector3().copy(opts.dir).normalize() : null;
    this.normal = opts.normal ? new THREE.Vector3().copy(opts.normal).normalize() : null;
    this.rate = opts.rate ?? 1;
    this.active = opts.active ?? true;
    this.color = opts.color; this.color2 = opts.color2;
    this.scale = opts.scale ?? 1; this.count = opts.count ?? 1; this.power = opts.power ?? 1;
    this.radius = opts.radius || 0; this.height = opts.height || 0;
    this.range = opts.range ?? 150 + (this.radius || 0);
    this.prev = this.pos.clone(); this.fresh = true; this.tick = -1e9;
    this.removed = false;
  }
  stop() { this.active = false; this.dropShapes(); }
  dropShapes() {
    if (this.shapes) { for (const h of this.shapes) h?.kill?.(0.2); this.shapes = null; }
    // vfx: held circles (a charge) linger a moment so a cast can flare them, then fold away; gusts stop
    if (this.circles) { for (const h of this.circles) api.magic?.lingerCircle?.(h) || h?.release?.('collapse', 0.22); this.circles = null; }
    if (this.gust) { this.gust.remove?.(); this.gust = null; }
  }
  remove() { this.active = false; this.dropShapes(); if (!this.removed) { this.removed = true; const i = emitters.indexOf(this); if (i >= 0) emitters.splice(i, 1); } }
}

class Beam {
  constructor(slot, opts) {
    this.slot = slot;
    this.from = new THREE.Vector3(); this.to = new THREE.Vector3();
    if (opts.from) this.from.copy(opts.from);
    if (opts.to) this.to.copy(opts.to);
    this.hex = hexOf(opts.color ?? 0xffd27a); if (this.hex < 0) this.hex = 0xffd27a;
    this.col = new THREE.Color().setHex(this.hex);
    this.width = opts.width ?? 1.4;
    this.intensity = opts.intensity ?? 1;
    this.setElement(opts.el);
    this.sparks = opts.sparks ?? true;
    this.light = opts.light ?? true;
    this.fade = 0; this.dying = false; this.removed = false;
    this.lastLight = -1;
    this.clashing = null;
    this.tick = -1e9;
  }
  set(from, to) { if (from) this.from.copy(from); if (to) this.to.copy(to); return this; }
  setWidth(w) { this.width = w; return this; }
  setColor(c) { const h = hexOf(c); if (h >= 0) { this.hex = h; this.col.setHex(h); } return this; }
  setIntensity(i) { this.intensity = i; return this; }
  /** Paint the beam in an element's palette ('sun', 'fire', … 'shadow'); unknown / null = its own colour. */
  setElement(el) { const k = BEAM_EL.indexOf(el); this.el = k >= 0 ? el : null; this.style = k >= 0 ? 1 + k : 10; return this; }
  remove() { this.dying = true; }
}

// ---- shake (trauma model) -----------------------------------------------------------------------------------------
const shakeState = { trauma: 0, decay: 1, t: 0 };
function shakeUpdate(rdt) {
  const s = shakeState, off = api.shakeOffset;
  s.t += rdt;
  if (s.trauma <= 0) { off.set(0, 0, 0); return; }
  s.trauma = Math.max(0, s.trauma - s.decay * rdt);
  const setting = G.settings?.shake;
  const amt = setting === false ? 0 : typeof setting === 'number' ? setting : 1;
  const k = s.trauma * s.trauma * 0.55 * amt;
  const t = s.t;
  const nx = Math.sin(t * 41.3) * 0.55 + Math.sin(t * 23.1 + 1.7) * 0.3 + Math.sin(t * 67.7 + 4.1) * 0.15;
  const ny = Math.sin(t * 37.9 + 2.3) * 0.55 + Math.sin(t * 19.7 + 0.4) * 0.3 + Math.sin(t * 71.3 + 5.2) * 0.15;
  const e = G.camera.matrixWorld.elements;
  _right.set(e[0], e[1], e[2]); _up.set(e[4], e[5], e[6]);
  off.set(0, 0, 0).addScaledVector(_right, nx * k).addScaledVector(_up, ny * k);
}

// ---- public API ---------------------------------------------------------------------------------------------------
const api = {
  /** World-space camera offset from screen shake. The camera adds it to its position every frame. */
  shakeOffset: new THREE.Vector3(),
  ELEMENT_COLOR,
  /** Element name -> sRGB hex (or the fallback). */
  elementColor: (el, fallback = 0xffffff) => ELEMENT_COLOR[el] ?? fallback,

  burst(name, pos, opts = NO) {
    if (!R) return;
    const fn = R.bursts[name];
    if (!fn) { warnOnce('burst', name); return; }
    if (!pos) return;
    opts = opts || NO;
    try {
      const isHit = name.startsWith('hit_');
      prime(pos, opts, isHit, name);
      if (E.dist > (G.quality?.viewDist ?? 2400) * 0.4 && E.scale < 4) return;
      E.em = null;
      if (isHit && E.dist < 65 && E.k > 0.15) {
        _v.set(ctx.nx, ctx.ny, ctx.nz);
        api.magic?.combustion?.impactTrails(pos, _v, E.scale * 0.65, E.color >= 0 ? E.color : (ELEMENT_COLOR[name.slice(4)] ?? 0xffd38a), 4);
      }
      fn();
    } catch (e) { G.reportError('fx.burst:' + name, e); }
  },

  emitter(name, opts = NO) {
    opts = opts || NO;
    let fn = R?.emitters[name];
    if (!fn) {
      warnOnce('emitter', name);
      fn = null;
    }
    const h = new Emitter(name, fn, opts);
    if (fn) emitters.push(h); else h.removed = true;
    return h;
  },

  trail(opts = NO) {
    opts = opts || NO;
    const h0 = hexOf(opts.color ?? 0xfff3c4), h1 = hexOf(opts.color2 ?? opts.color ?? 0xffd27a);
    lin(h0 < 0 ? 0xfff3c4 : h0, _c); lin(h1 < 0 ? 0xffd27a : h1, _c2);
    const st = opts.style === 'band' ? 1 : opts.style === 'streaks' ? 2 : opts.style === 'comet' ? 3 : typeof opts.style === 'number' ? opts.style : 0;
    const tr = ribbons.create(_c, _c2, opts.width ?? 0.35, opts.life ?? 0.45, opts.add ?? 1, opts.intensity ?? 2.2, opts.taper ?? 1, st);
    if (!tr) return NULL_TRAIL;
    if (opts.pos) tr.push(opts.pos);
    return tr;
  },

  ring(pos, opts = NO) {
    if (!pos) return;
    opts = opts || NO;
    const hex = hexOf(opts.color ?? 0xffffff);
    const y = opts.y ?? groundY(pos.x, pos.z, pos.y) + 0.06;
    return decals.add(RING, pos.x, y, pos.z, 0, 1, 0, lin(hex < 0 ? 0xffffff : hex), opts.radius ?? 4, now + (opts.delay ?? 0), opts.dur ?? 0.6,
      opts.intensity ?? 1.8, 0, opts.thickness ?? 0.16, opts.tracked);
  },

  /** Spinning magic circle on the ground (extra). opts { color, radius, dur, intensity, spin, y, tracked } — vfx: drawn as the
   *  layered rune circle (circles.js): it draws itself on, turns layer against layer and fades. tracked → a kill function. */
  sigil(pos, opts = NO) {
    if (!pos) return;
    opts = opts || NO;
    const h0 = hexOf(opts.color ?? 0xffd98a), hex = h0 < 0 ? 0xffd98a : h0;
    _v2.set(pos.x, opts.y ?? groundY(pos.x, pos.z, pos.y) + 0.07, pos.z);
    const r = circles.add(circleOpts(_v2, UP, opts.radius ?? 2, hex, opts.dur ?? 1.5, (opts.intensity ?? 1) * 1.3, (opts.spin ?? 0.7) * 1.1, 0, !!opts.tracked));
    return opts.tracked ? (typeof r === 'function' ? r : () => {}) : undefined;
  },

  /**
   * vfx: a layered magic circle anywhere, facing `normal` (default up). opts { normal | dir, ref, radius = 1, color (hex / element),
   * core, intensity = 1.4, spin = 0.9, layers (mask: 1 outer band, 2 star, 4 inner ring, 8 core; 15 = all), dur = 0.8,
   * outDur, out: 'flare' | 'collapse' | 'fade', draw (seconds to draw on), fill, delay, handle, charge (0..1, held only), ground (bool:
   * flat on the ground below pos), tracked }. Returns a handle { pos, normal, radius, charge, release(style, dur), kill(),
   * setColor(), setIntensity(), setLayers(), alive } with opts.handle, a kill function with opts.tracked, else true; null when full.
   */
  circle(pos, opts = NO) {
    if (!pos || !circles) return null;
    opts = opts || NO;
    const h0 = hexOf(opts.color ?? 0xffd98a), hex = h0 < 0 ? 0xffd98a : h0;
    const n = opts.normal || opts.dir || UP;
    let p = pos;
    if (opts.ground) { p = _v2.set(pos.x, groundY(pos.x, pos.z, pos.y) + 0.07, pos.z); }
    try {
      return circles.add({ pos: p, normal: opts.ground ? UP : n, ref: opts.ref, radius: opts.radius ?? 1, color: hex, core: opts.core ?? coreOf(hex),
        intensity: opts.intensity ?? 1.4, spin: opts.spin ?? 0.9, layers: opts.layers ?? 15, dur: opts.dur ?? 0.8, outDur: opts.outDur, out: opts.out ?? 'flare',
        draw: opts.draw ?? 0.22, style: CIRCLE, fill: opts.fill ?? 1, delay: opts.delay, handle: !!opts.handle, charge: opts.charge, tracked: opts.tracked });
    } catch (e) { G.reportError('fx.circle', e); return null; }
  },
  /** vfx: hexagonal shield-lattice flash facing `normal` (a guard taking a blow). opts { radius = 1.4, color, core, intensity = 1.6, dur = 0.32 } */
  ward(pos, normal, opts = NO) {
    if (!pos || !circles) return;
    opts = opts || NO;
    const h0 = hexOf(opts.color ?? 0xffd98a), hex = h0 < 0 ? 0xffd98a : h0;
    circles.add({ pos, normal: normal || UP, radius: opts.radius ?? 1.4, color: hex, core: opts.core ?? coreOf(hex), intensity: opts.intensity ?? 1.6,
      dur: opts.dur ?? 0.32, outDur: (opts.dur ?? 0.32) * 0.7, out: 'fade', style: WARD, delay: opts.delay });
  },
  /** vfx: camera-facing starburst (perfect parry, decisive hit). opts { radius = 2, color, core, intensity = 1.6, dur = 0.34, delay } */
  starburst(pos, opts = NO) {
    if (!pos || !circles) return;
    opts = opts || NO;
    const h0 = hexOf(opts.color ?? 0xfff0c0), hex = h0 < 0 ? 0xfff0c0 : h0;
    circles.add({ pos, normal: UP, radius: opts.radius ?? 2, color: hex, core: opts.core ?? 0xffffff, intensity: opts.intensity ?? 1.6,
      dur: opts.dur ?? 0.34, outDur: (opts.dur ?? 0.34) * 0.75, out: 'fade', style: BURST, delay: opts.delay });
  },

  beam(opts = NO) {
    opts = opts || NO;
    const slot = bolts.allocBeam();
    const b = new Beam(slot, opts);
    if (slot < 0) { b.removed = true; return b; }     // all eight slots busy: an inert handle
    beams.push(b);
    return b;
  },

  lightning(from, to, opts = NO) {
    if (!from || !to) return;
    opts = opts || NO;
    const hex0 = hexOf(opts.color ?? 0xc9a0ff), hex = hex0 < 0 ? 0xc9a0ff : hex0;
    const dur = opts.dur ?? 0.28, br = opts.branches ?? 3, w = opts.width ?? 0.36;
    lin(hex);
    // vfx: the channel glows on after the strike and cools away (opts.afterglow 0..1; short arcs get a little)
    bolts.after = clamp(opts.afterglow ?? (dur >= 0.2 ? 0.6 : 0.2), 0, 1);
    bolts.bolt(from.x, from.y, from.z, to.x, to.y, to.z, _c, w, opts.intensity ?? 1.6, now, dur, br);
    if (opts.groundRadius > 0 && G.world && Math.abs(to.y - G.world.groundAt(to.x, to.z)) < .85) {
      bolts.after *= 0.7;
      bolts.ground(to, opts.groundRadius, _c, now + .035, groundAtXZ, Math.min(8, br + 1));
    }
    bolts.after = 0;
    if (opts.impact !== false) {
      prime(to, NO, false);
      ctx.c0 = hex; E.color = hex;
      emit(pools, R.P.ltGlow, 1); emit(pools, R.P.ltSparks, 14 * E.k);
      X.light(hex, 120, dur * 1.2, 16);
    }
  },

  flash(pos, color, intensity = 50, dur = 0.25, distance) {
    if (!pos) return;
    const h = hexOf(color ?? 0xffffff);
    lights.flash(pos.x, pos.y, pos.z, lin(h < 0 ? 0xffffff : h), intensity, dur, distance ?? Math.max(6, Math.sqrt(intensity) * 2.2));
  },

  shake(amount, dur = 0.3) {
    if (!(amount > 0)) return;
    const s = shakeState;
    s.trauma = Math.min(1, s.trauma + amount);
    s.decay = Math.max(s.trauma / Math.max(dur, 0.05), 0.4);
  },

  /** Floating label (text.js). opts: { color, size, dur, kind: 'dmg'|'word'|'call', target, n, el, big } — see text.js. */
  text(pos, string, opts = NO) {
    if (!pos || string === undefined || string === null) return;
    opts = opts || NO;
    const h = hexOf(opts.color ?? 0xffffff);
    // one anchor per owner, so its lanes line up: a target's labels sit over its head, her callouts over hers
    let x = pos.x, y = pos.y, z = pos.z;
    const tg = opts.target, P = G.player;
    if (opts.kind === 'call' && P?.pos) { x = P.pos.x; y = P.pos.y + (P.height || 1.6) * 0.85; z = P.pos.z; }
    else if (tg?.pos && typeof tg.height === 'number' && (opts.kind === 'dmg' || opts.kind === 'word')) y = tg.pos.y + tg.height + 0.2;
    // exactly one Math.random() per label, as before: the seeded game sequence (and every recorded take) stays the same
    texts.add(x, y, z, String(string), lin(h < 0 ? 0xffffff : h), opts, now, Math.random());
  },
  /** Draw the floating labels over the finished frame (G.renderFrame calls it after the post chain). */
  drawOverlay(renderer, camera) {
    if (!overlay || !texts?.mesh.visible || !(texts.live(now) > 0)) return;
    texts.flush();
    const ac = renderer.autoClear, tm = renderer.toneMapping;
    renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(null);
    renderer.render(overlay, camera);
    renderer.autoClear = ac; renderer.toneMapping = tm;
  },
  /** Room the target's floating labels take above their anchor right now, in text size units (0 = none). */
  textTop(target) { return texts ? texts.top(target, now) : 0; },
  /** Screen px of `units` text size units at `depth` metres. focal = the camera's focal length in CSS px (the HUD passes
   *  its own, so no layout is read mid-frame); without it the canvas height is read. */
  textPx(units, depth, focal) {
    const cam = G.camera;
    if (!cam || !(depth > 0)) return 0;
    if (!(focal > 0)) focal = ((G.renderer?.domElement?.clientHeight || 1) * 0.5) / Math.tan(((cam.fov || 60) * Math.PI) / 360);
    return (units * Math.min(9, Math.max(0.3, depth * TEXT_K)) / depth) * focal;
  },

  /** A mesh effect shape (shapes.js). opts.pos required; opts.handle = true returns a live handle. Colours sRGB hex. */
  shape(opts) {
    if (!shapes || !opts?.pos) return null;
    try { return shapes.add(opts, now); } catch (e) { G.reportError('fx.shape', e); return null; }
  },
  /** The element kit (kit.js) for systems that compose their own effects. */
  get kit() { return K; },

  /** Kill everything on screen (scene changes, tests). */
  clear() {
    pools[0].clear(); pools[1].clear(); decals.clear(); shapes.clear(); circles.clear(); api.magic?.clear?.(); api.duel?.clear?.(); texts.clear(); lights.clear(); ribbons.clear();
    for (const b of beams) { bolts.freeBeam(b.slot); b.removed = true; }
    beams.length = 0;
    for (const it of laterQ) it.on = false;
    shakeState.trauma = 0; api.shakeOffset.set(0, 0, 0);
  },

  /** Counters for tests / the debug overlay. O(capacity) — do not call every frame. */
  stats() {
    return {
      glow: pools[0].live(now), soft: pools[1].live(now), live: pools[0].live(now) + pools[1].live(now), cap: GLOW_CAP + SOFT_CAP,
      trails: ribbons.activeCount, beams: beams.length, bolts: bolts.live(now) - beams.length, decals: decals.live(now),
      lights: lights.active, emitters: emitters.length, shapes: shapes.live, circles: circles.live(now), texts: texts.live(now), time: +now.toFixed(2),
      spawned: pools[0].spawned + pools[1].spawned,
    };
  },
  get names() { return { bursts: Object.keys(R.bursts), emitters: Object.keys(R.emitters) }; },
  /** Ambient motes controller: { enabled, density, weights }. */
  ambient: null,
};

// ---- per-frame work -----------------------------------------------------------------------------------------------
function runEmitters(dt) {
  const q = G.quality?.particles ?? 1;
  for (let i = 0; i < emitters.length; i++) {
    const h = emitters[i];
    const p = h.pos;
    if (!h.active || !h.fn) { h.prev.copy(p); h.fresh = true; continue; }
    const d = camDist(p.x, p.y, p.z);
    if (d > h.range) { h.prev.copy(p); h.fresh = true; continue; }
    const c = ctx;
    c.now = now; c.x = p.x; c.y = p.y; c.z = p.z;
    const mx = p.x - h.prev.x, my = p.y - h.prev.y, mz = p.z - h.prev.z, moved = Math.hypot(mx, my, mz);
    const jump = h.fresh || moved > 8;
    c.sweep = !jump && moved > 0.02; c.px = h.prev.x; c.py = h.prev.y; c.pz = h.prev.z; c.dt = dt;
    if (jump) { c.vx = c.vy = c.vz = 0; } else { c.vx = mx / dt; c.vy = my / dt; c.vz = mz / dt; }
    const n = h.normal || UP;
    c.nx = n.x; c.ny = n.y; c.nz = n.z;
    const dd = h.dir || n;
    c.dx = dd.x; c.dy = dd.y; c.dz = dd.z;
    windAt(p.x, p.y, p.z, _w); c.wx = _w.x; c.wy = _w.y; c.wz = _w.z;
    c.scale = h.scale; c.speed = 1; c.delay = 0; c.area = 1; c.hk = 1;
    if (typeof h.color !== 'number') h.color = hexOf(h.color);
    if (typeof h.color2 !== 'number') h.color2 = hexOf(h.color2);
    E.color = h.color; E.color2 = h.color2; c.c0 = h.color; c.c1 = -1;
    E.scale = h.scale; E.power = h.power; E.x = p.x; E.y = p.y; E.z = p.z; E.radius = h.radius; E.height = h.height;
    E.dist = d; E.rate = Math.max(0, h.rate); E.dt = dt; E.em = h; E.grounded = false;
    E.k = q * h.count * (h.radius > 4 ? 1 : lod(d));
    try { h.fn(); } catch (e) { G.reportError('fx.emitter:' + h.name, e); h.active = false; }
    h.prev.copy(p); h.fresh = false;
  }
  E.em = null;
}

function runBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    if (b.dying) b.fade -= dt / 0.18; else b.fade = Math.min(1, b.fade + dt / 0.12);
    if (b.dying && b.fade <= 0) { bolts.freeBeam(b.slot); b.removed = true; beams.splice(i, 1); continue; }
    if (b.removed) { beams.splice(i, 1); continue; }
    b.clashing = null;
  }
  // beams whose heads meet: a clash ball where they collide
  for (let i = 0; i < beams.length; i++) {
    const a = beams[i];
    for (let j = i + 1; j < beams.length; j++) {
      const b = beams[j];
      if (a.to.distanceToSquared(b.to) < 2.25 && !a.dying && !b.dying) { a.clashing = b; b.clashing = a; }
    }
  }
  const q = G.quality?.particles ?? 1;
  for (let i = 0; i < beams.length; i++) {
    const b = beams[i];
    const f = b.from, t = b.to;
    const w = b.width * (0.85 + 0.15 * Math.sin(now * 23 + i));
    bolts.setBeam(b.slot, f.x, f.y, f.z, t.x, t.y, t.z, b.col, w * 0.5 * Math.max(0.2, b.fade), b.intensity, b.fade, b.style);
    if (dt <= 0 || b.fade <= 0.05) continue;
    const L = f.distanceTo(t);
    if (L < 1e-3) continue;
    const c = ctx;
    _v.subVectors(t, f).divideScalar(L);
    c.now = now; c.sweep = false; c.delay = 0; c.speed = 1; c.area = 1; c.hk = 1; c.c1 = -1;
    c.vx = c.vy = c.vz = 0; c.wx = 0.3; c.wy = 0; c.wz = 0;
    const s = Math.max(0.5, b.width / 0.9);
    c.scale = s; E.scale = s; E.dist = camDist(t.x, t.y, t.z); E.k = q * b.fade; E.power = 1; E.grounded = false;
    c.c0 = b.hex; E.color = b.hex;
    // motes peeling off along the beam
    const nm = emitCount(L * 3.5 * dt * q);
    for (let k = 0; k < nm; k++) {
      const u = Math.random();
      c.x = f.x + (t.x - f.x) * u; c.y = f.y + (t.y - f.y) * u; c.z = f.z + (t.z - f.z) * u;
      c.nx = _v.x; c.ny = _v.y; c.nz = _v.z; c.dx = _v.x; c.dy = _v.y; c.dz = _v.z;
      emit(pools, R.P.bmMote, 1);
    }
    // start glow at the caster's hand (a painted beam draws its own flare in the shader)
    c.x = f.x; c.y = f.y; c.z = f.z;
    if (b.style === 10) emit(pools, R.P.bmStartGlow, 10 * dt * q * 3);
    if (b.clashing) {
      if (b.clashing.slot > b.slot) continue;   // the pair is handled once
      const o = b.clashing;
      _v2.addVectors(t, o.to).multiplyScalar(0.5);
      c.x = _v2.x; c.y = _v2.y; c.z = _v2.z;
      c.dx = _v.x; c.dy = _v.y; c.dz = _v.z; c.nx = _v.x; c.ny = _v.y; c.nz = _v.z;
      E.color = b.hex; E.color2 = o.hex; E.x = c.x; E.y = c.y; E.z = c.z;
      E.rate = 1; E.dt = dt; E.em = b; E.radius = 0;
      R.emitters.clash_ball();
      E.em = null;
      continue;
    }
    if (!b.sparks) continue;
    // the end that hits something: glow, star, sparks spraying back
    c.x = t.x; c.y = t.y; c.z = t.z;
    c.nx = -_v.x; c.ny = -_v.y; c.nz = -_v.z; c.dx = c.nx; c.dy = c.ny; c.dz = c.nz;
    emit(pools, R.P.bmEndGlow, 14 * dt * q);
    emit(pools, R.P.bmEndStar, 5 * dt * q);
    emit(pools, R.P.bmEndSparks, 36 * dt * q * b.fade);
    if (b.light && now - b.lastLight > 0.1 && E.dist < 160) {
      b.lastLight = now;
      lights.flash(t.x - _v.x * 0.8, t.y - _v.y * 0.8, t.z - _v.z * 0.8, lin(b.hex), 60 * b.intensity * s * s, 0.16, 14 * s);
    }
  }
}
function emitCount(v) { let k = v | 0; if (Math.random() < v - k) k++; return k; }

function runLater() {
  for (let i = 0; i < laterQ.length; i++) {
    const it = laterQ[i];
    if (!it.on || now < it.at) continue;
    it.on = false;
    _v.set(it.x, it.y, it.z);
    LATER_OPTS.scale = it.scale; LATER_OPTS.color = it.color < 0 ? undefined : it.color; LATER_OPTS.color2 = it.color2 < 0 ? undefined : it.color2;
    LATER_OPTS.count = it.count; LATER_OPTS.power = it.power;
    api.burst(it.name, _v, LATER_OPTS);
  }
}
const LATER_OPTS = { scale: 1, color: undefined, color2: undefined, count: 1, power: 1 };

function updateAmbientLight() {
  // smoke / dust / leaves are lit by roughly the light that lights the ground
  const L = G.lights, A = shared.uAmbient.value;
  if (L?.hemi && L?.sun) {
    A.copy(L.hemi.color).multiplyScalar(L.hemi.intensity * 0.55);
    _c2.copy(L.sun.color).multiplyScalar(L.sun.intensity * 0.32);
    A.add(_c2);
    if (L.moon?.isLight) { _c2.copy(L.moon.color).multiplyScalar(L.moon.intensity * 0.3); A.add(_c2); }
    if (L.ambient?.isLight) { _c2.copy(L.ambient.color).multiplyScalar(L.ambient.intensity * 0.5); A.add(_c2); }
  } else {
    const v = G.env.veil;
    if (v < 0.5) A.setRGB(1.5, 1.45, 1.4).lerp(_c2.setRGB(1.2, 0.85, 0.65), v * 2);
    else A.setRGB(1.2, 0.85, 0.65).lerp(_c2.setRGB(0.22, 0.26, 0.42), (v - 0.5) * 2);
  }
  A.r = Math.max(A.r, 0.1); A.g = Math.max(A.g, 0.11); A.b = Math.max(A.b, 0.16);
}

function flushAll() {
  if (!pools) return;
  pools[0].flush(); pools[1].flush();
  shapes.update(now, 0, G.camera.position);
  circles.update(now);
  ribbons.mesh.onBeforeRender(); bolts.mesh.onBeforeRender(); decals.mesh.onBeforeRender(); circles.flush();
  texts.flush();
}

function rebase() {
  const d = REBASE_BY;
  pools[0].rebase(d); pools[1].rebase(d); shapes.rebase(d); circles.rebase(d); api.magic?.rebase?.(d); ribbons.rebase(d); bolts.rebase(d); decals.rebase(d); texts.rebase(d);
  for (const it of laterQ) it.at -= d;
  for (const h of emitters) h.tick -= d;
  for (const b of beams) { b.lastLight -= d; b.tick -= d; }
  now -= d;
}

export const fxSystem = {
  name: 'fx',
  pausable: true,

  async init(G) {
    const atlas = makeAtlas(), sigil = makeSigil();
    pools = [new ParticlePool(GLOW_CAP, atlas.texture, 30), new ParticlePool(SOFT_CAP, atlas.texture, 20)];
    ribbons = new Ribbons(26);
    bolts = new Bolts(640, 34);
    decals = new Decals(96, sigil.texture, 10);
    lights = new FlashLights(G.scene);
    texts = new FloatText(60, { slots: G.quality?.particles < 0.6 ? 32 : 64, renderer: () => G.renderer });
    ambient = new Ambient(pools);
    shapes = new Shapes(G.quality?.particles < 0.6 ? 96 : 192, 22);
    circles = new Circles(G.quality?.particles < 0.6 ? 24 : 40, makeCircleTexture(512), 24);
    K = makeKit({
      add: (o) => { try { return shapes.add(o, now); } catch (e) { G.reportError('fx.kit', e); return null; } },
      ground: (x, z, y) => groundY(x, z, y),
      quality: () => Math.min(1, G.quality?.particles ?? 1),
    });
    R = makeRecipes(X);
    G.scene.add(decals.mesh, shapes.mesh, circles.mesh, pools[SOFT].mesh, ribbons.mesh, pools[GLOW].mesh, bolts.mesh);
    // floating labels are drawn over the finished picture (drawOverlay), not in the scene: no tone curve, grade, haze
    // or depth-of-field touches them, and they stay crisp at full canvas resolution while the scene renders scaled
    overlay = new THREE.Scene();
    overlay.matrixWorldAutoUpdate = false;
    overlay.add(texts.mesh);
    api.textMesh = texts.mesh;
    api.ambient = ambient;
    api._atlas = atlas; api._sigil = sigil;
    G.fx = api;
    // upload whatever was spawned after our lateUpdate (late systems) before the scene is projected
    const scene = G.scene, prev = scene.onBeforeRender;
    scene.onBeforeRender = function (...a) { if (prev) prev.apply(this, a); flushAll(); };
    G.events.on('mode:changed', ({ mode }) => { if (mode === 'title') api.clear(); });
    api.magic = installMagic(G, api, X);
    api.duel = installDuel(G, api, X);
  },

  start() { api.clear(); },

  update(dt, rdt) {
    now += dt;
    if (now > REBASE_AT) rebase();
    shared.uTime.value = now; texts.uTime.value = now;
    circles.update(now);
    circles.material.uniforms.uGain.value = 1 - 0.3 * Math.min(1, Math.max(0, G.env?.veil ?? 0));
    ribbons.update(now, dt);
    lights.update(dt);
    bolts.releaseExpired(now);
    shakeUpdate(rdt);
    updateAmbientLight();
    // canvas path (no post chain): additive light is display-encoded so glows look as bright as they are
    shared.uAddGamma.value = 0.8;
    // the night grade lifts everything: additive light gets a softer clip there so glows keep a hue instead of blowing white
    shared.uAddGain.value = 0.5 - 0.15 * Math.min(1, Math.max(0, G.env?.veil ?? 0));
    if (dt > 0) {
      runLater();
      runEmitters(dt);
      windAt(G.env.focus.x, G.env.focus.y, G.env.focus.z, _w);
      ambient.update(dt, now, _w);
    }
    runBeams(dt);
    if (dt > 0) shapes.update(now, dt, G.camera.position);
    api.magic?.update?.(dt, now);
    api.duel?.update?.(dt, rdt, now);
  },

  lateUpdate() { flushAll(); },
};
