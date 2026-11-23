// Prop runtime: one live interactive object = instanced visual slot + G.physics body + G.elements reactor + behaviour.
// Breaking, debris, drops, fireworks, fire sources, lanterns, bells, food and melting live here.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp } from '../core/util.js';
import { CATALOG } from './catalog.js';
let _toneN = 0;
import { getKit, getDebrisKit, alloc, release, writeItem, writeColor, DEBRIS_HALF } from './models.js';

/** Shared runtime state (props.js owns the loop). */
export const S = {
  live: [],              // Prop[]
  ticking: new Set(),    // props with something going on (fuse, swing, flame, melt…)
  pendingBreak: [],      // [prop, by] — breaking never happens inside physics / elements callbacks
  pendingHurt: [],       // creature hits from heavy props, applied in update()
  debris: [],
  rockets: [],
  t: 0,
  onRemoved: null,       // (prop) => void, set by props.js (records / bookkeeping)
};

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color(), _up = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);
const quality = () => clamp(G.quality?.particles ?? 1, 0.35, 1);
const fx = (name, pos, opts) => { try { G.fx?.burst?.(name, pos, opts); } catch (e) { G.reportError('props:fx', e); } };
const sfx = (name, pos, o) => { try { G.audio?.sfx?.(name, { pos, ...o }); } catch (e) { G.reportError('props:sfx', e); } };
const rand = Math.random;

const HIT_SFX = { wood: 'hit_wood', stone: 'hit_stone', metal: 'hit_heavy', ice: 'hit_ice', paper: 'paper', cloth: 'cloth_rustle', flesh: 'hit_body', crystal: 'hit_stone' };
const BASE_DMG = { fire: 3, water: 0, ice: 4, wind: 0, thunder: 18, earth: 30, sun: 0, moon: 0 };

export class Prop {
  constructor(type, def) {
    this.type = type; this.def = def;
    this.kit = getKit(type, def);
    this.slot = null;
    this.body = null; this.reactor = null;
    this.mesh = def.shape === 'hull' && this.kit.hullGeo ? new THREE.Mesh(this.kit.hullGeo) : new THREE.Object3D();
    this.mesh.name = 'prop:' + type;
    this.mesh.userData.prop = this;
    this.maxHp = def.hp ?? 20; this.hp = this.maxHp;
    this.persistent = false; this.rec = null;
    this.alive = true; this.broken = false;
    this.lit = false; this.char = 0; this.flash = 0; this.fuse = 0; this.swing = 0; this.swingV = 0; this.swingZ = 0; this.swingZV = 0;
    this.melt = 0; this.heldT = -99; this.ringT = -99; this.hitSfxT = -99; this.tickT = 0; this.colorT = 0;
    this.base = new THREE.Color(def.tint ?? 0xffffff);
    // per-object tone (Look round): no two crates or pots quite the same value (visual only, never saved)
    { const hv = Math.sin(++_toneN * 12.9898) * 43758.5453, tv = 0.93 + 0.1 * (hv - Math.floor(hv)); this.base.multiplyScalar(tv); }
    this.emitter = null; this.light = null; this.interact = null; this.fuseFx = null;
    this._written = false; this._roast = 0; this.graceT = 0;
  }
  get pos() { return this.body ? this.body.pos : this.mesh.position; }

  // ---- ★ API ------------------------------------------------------------------------------------------------
  /** Hurt the prop. info: { by?, element?, source?, mult? }. Breaks (deferred to the next update) at hp <= 0. */
  damage(n, info = {}) {
    if (!this.alive || this.broken || !(n > 0)) return;
    const def = this.def;
    if (def.behave === 'bell' || def.behave === 'chime') { this.ring(Math.min(1, n / 20)); return; }
    if (def.fragile === Infinity && !(info.element === 'thunder' || info.element === 'earth') && def.hp >= 400) return;
    if (def.behave === 'firework' && n >= 6) { this.lightFuse(info.element === 'thunder' ? 0.35 : 1.2); return; }
    this.hp -= n;
    this.flash = Math.max(this.flash, 0.25); S.ticking.add(this);
    if (this.hp <= 0) queueBreak(this, info.by || info.element || 'hit');
  }
  /** Break now-ish (debris, fx, drops, 'prop:broken'). */
  break(by = 'hit') { queueBreak(this, by); }
  /** Remove without breaking (no fx). */
  remove() { removeProp(this); }
  /** Tint the prop (e.g. while held by 月引). */
  highlight(on) { this._hl = !!on; this.recolor(); }
  /** Fire sources / lanterns: light or put out. Returns true if the state changed. */
  setLit(on) {
    on = !!on;
    if (on === this.lit) return false;
    this.lit = on;
    if (this.rec) this.rec.lit = on;
    if (this.slot != null) this.write(true);
    this.updateLitFx();
    if (on) { sfx(this.def.behave === 'lantern' ? 'lantern_ignite' : 'ignite', this.pos, { vol: 0.6 }); fx('lantern_ignite', this.flamePos(_v), { scale: 0.5 }); }
    else fx('extinguish', this.flamePos(_v), { scale: 0.6 });
    return true;
  }
  ring(power = 1) {
    if (S.t - this.ringT < 0.35) { this.swingV += 0.6 * power; return; }
    this.ringT = S.t;
    this.swingV += (1.6 + 1.4 * power) * (rand() < 0.5 ? 1 : -1) * (this.def.behave === 'chime' ? 1.6 : 1);
    this.swingZV += (rand() - 0.5) * 1.2 * power;
    S.ticking.add(this);
    sfx(this.def.sound, this.pos, { vol: 0.5 + 0.5 * power, pitch: 0.95 + rand() * 0.1 });
    G.events.emit('prop:ring', { type: this.type, pos: this.pos.clone(), prop: this });
  }

  // ---- visuals ------------------------------------------------------------------------------------------------
  flamePos(out) { return out.copy(this.pos).add(_up.set(0, this.def.flameY ?? 0.5, 0).applyQuaternion(this.mesh.quaternion)); }
  write(force) {
    const b = this.body;
    const still = !b || b.sleeping || this.def.fixed;
    if (!force && still && this._written) return;
    this._written = still;
    const k = this.def.behave === 'melt' ? 0.72 + 0.28 * clamp(this.hp / this.maxHp) : 1;
    writeItem(this.kit, this.slot, this.mesh, k, this.lit, this.swing, this.swingZ);
  }
  recolor() {
    if (this.slot == null) return;
    const r = this.reactor;
    _c.copy(this.base);
    if (this.char > 0) _c.multiplyScalar(1 - 0.84 * this.char);
    if (r && r.wet > 0) { _c.r *= 0.72; _c.g *= 0.76; _c.b *= 0.86; }
    if (r && r.frozen > 0) { _c.r *= 0.78; _c.g *= 0.95; _c.b *= 1.25; }
    if (this.flash > 0) { const f = this.flash * (r && r.shocked > 0 ? 3.2 : 1.6); _c.r += f * 0.6; _c.g += f * 0.8; _c.b += f; }
    if (this._hl) { _c.r = _c.r * 0.8 + 0.25; _c.g = _c.g * 0.8 + 0.3; _c.b = _c.b * 0.8 + 0.55; }
    writeColor(this.kit, this.slot, _c, 1);
  }
  updateLitFx() {
    const def = this.def;
    if (this.lit && this.alive && this.slot != null) {
      if (def.behave === 'fire' && !this.emitter && G.fx?.emitter) {
        try { this.emitter = G.fx.emitter('flame', { pos: this.flamePos(new THREE.Vector3()), scale: def.flameScale ?? 1 }); } catch (e) { this.emitter = null; }
      }
      if (!this.light && G.elements?.addLight) this.light = G.elements.addLight({ pos: this.flamePos(new THREE.Vector3()), radius: def.light ?? 8, intensity: 1 });
      S.ticking.add(this);
    } else {
      if (this.emitter) { try { this.emitter.remove(); } catch (e) { /* */ } this.emitter = null; }
      if (this.light) { this.light.remove?.(); this.light = null; }
    }
  }

  // ---- behaviour tick (only while in S.ticking) --------------------------------------------------------------------
  tick(dt) {
    let busy = false;
    const def = this.def, r = this.reactor;
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 2.2); this.recolor(); busy = true; }
    // pendulum (bells, chimes)
    if (def.behave === 'bell' || def.behave === 'chime') {
      const k = def.behave === 'chime' ? 26 : 14, c = def.behave === 'chime' ? 1.4 : 1.0;
      this.swingV += (-k * this.swing - c * this.swingV) * dt; this.swing += this.swingV * dt;
      this.swingZV += (-k * this.swingZ - c * this.swingZV) * dt; this.swingZ += this.swingZV * dt;
      if (def.behave === 'chime' && G.elements?.windAt) {
        const w = G.elements.windAt(this.pos, _v2).length();
        this.swingV += (rand() - 0.5) * w * dt * 2.5;
        if (w > 3.2 && rand() < dt * 0.25 * w) this.ring(clamp(w / 10, 0.2, 0.7));
        busy = true;     // chimes keep listening to the wind while live
      }
      if (Math.abs(this.swing) + Math.abs(this.swingV) + Math.abs(this.swingZ) + Math.abs(this.swingZV) > 0.002) busy = true;
      this.write(true);
    }
    // firework fuse
    if (this.fuse > 0) {
      busy = true;
      this.fuse -= dt;
      if (this.fuseFx) this.flamePos(this.fuseFx.pos);
      if ((this.tickT -= dt) <= 0) {
        this.tickT = 0.09;
        fx('spark', this.flamePos(_v), { color: 0xffd27a, scale: 0.5, count: 0.6 });
        const b = this.body;
        if (b && !b.held && b.type === 'dynamic') { b.wake(); b.applyImpulse(_v2.set((rand() - 0.5) * 0.8, 0.9 + rand() * 0.5, (rand() - 0.5) * 0.8).multiplyScalar(b.mass * 0.35)); }
      }
      if (this.fuse <= 0) { this.fuse = 0; detonate(this); return; }
    }
    // fire sources: feed things put into the flame, roast food beside it, tip over -> spill
    if (this.lit && def.behave === 'fire') {
      busy = true;
      if (this.emitter) this.flamePos(this.emitter.pos);
      if (this.light) this.flamePos(this.light.pos);
      if ((this.tickT -= dt) <= 0) {
        this.tickT = 0.8 + rand() * 0.5;
        const fp = this.flamePos(_v);
        G.elements?.query?.(fp, 2.4, (o) => {
          if (o === r || o.burning || o.charred || !(o.flammable > 0) || o.frozen) return;
          const d = Math.hypot(o.pos.x - fp.x, o.cy - fp.y, o.pos.z - fp.z) - o.radius;
          const food = o.owner instanceof Prop && o.owner.def.roast;
          if (d < 0.35 || (food && d < 1.4)) o.ignite?.(0.6, { source: 'brazier', from: r });
        });
        if (this.body && !def.fixed) {
          _up.set(0, 1, 0).applyQuaternion(this.mesh.quaternion);
          if (_up.y < 0.45) {
            this.setLit(false);
            G.elements?.igniteGround?.(this.pos.x, this.pos.z, 1.6, 0.8);
            G.elements?.apply?.('fire', this.pos, 1.6, 0.6, { source: 'brazier' });
          }
        }
      }
    }
    // boulders, logs and barrels carry their own rolling resistance (def.rolling -> physics add({ rolling }))
    // food roasting: swap for the roasted version a moment after catching fire
    if (this._roast > 0) {
      busy = true;
      if ((this._roast -= dt) <= 0) { this._roast = 0; roast(this); return; }
    }
    // ice / snow: melt beside heat and slowly in full sun
    if (def.behave === 'melt') {
      busy = true;
      if ((this.tickT -= dt) <= 0) {
        this.tickT = 0.5;
        const p = this.pos;
        let rate = 0;
        const day = G.world.daylightAt ? G.world.daylightAt(p.x, p.z) : 1 - G.world.veilAt(p.x, p.z);
        if (day > 0.6 && G.world.mountainMask(p.x, p.z) < 0.3) rate += 0.012 * day;
        if (G.elements?.isBurningAt?.(p.x, p.z)) rate += 0.25;
        const hot = G.elements?.nearest?.(p, 2.6, (o) => o.burning || (o.owner instanceof Prop && o.owner.lit && o.owner.def.behave === 'fire'));
        if (hot) rate += 0.18;
        if (rate > 0) this.meltBy(rate * 0.5 * this.maxHp);
      }
    }
    if (!busy) S.ticking.delete(this);
  }
  meltBy(n) {
    this.hp -= n;
    this.write(true);
    if (this.hp <= 0) queueBreak(this, 'melt');
  }
}

// ---- elements hooks ------------------------------------------------------------------------------------------------
function reactorOpts(p) {
  const def = p.def;
  const kind = def.behave === 'fire' || def.behave === 'lantern' ? 'lantern' : 'prop';
  const size = p.kit.size;
  const o = {
    owner: p, kind, material: def.el || 'wood', getPos: () => p.pos, center: true,
    radius: Math.max(0.15, Math.max(size.x, size.z) * 0.5), height: Math.max(0.2, size.y),
    team: 'neutral', living: false,
    on: {
      ignite: (r, info) => {
        if (kind === 'lantern') return p.setLit(true);
        if (def.behave === 'firework') p.lightFuse(2.2);
        if (def.roast) p._roast = 0.7, S.ticking.add(p);
        if (def.fierce && !p.fierceFx && G.fx?.emitter) {
          try { p.fierceFx = G.fx.emitter('flame', { pos: p.pos.clone(), scale: 1.5 + p.kit.size.x * 0.4 }); } catch (e) { p.fierceFx = null; }
        }
        p.recolor();
        return true;
      },
      light: (r) => (kind === 'lantern' ? p.setLit(true) : false),
      extinguish: (r, info) => {
        if (kind === 'lantern') return p.setLit(false);
        stopFierce(p);
        if (p.fuse > 0 && info && (info.source === 'water' || info.source === 'rain')) { p.fuse = 0; if (p.fuseFx) { p.fuseFx.remove?.(); p.fuseFx = null; } }
        p.recolor();
        return true;
      },
      burnTick: (r, dt) => {
        p.char = Math.min(1, p.char + dt / Math.max(2, r.burnTime * 0.8));
        p.hp -= dt * (p.maxHp / Math.max(2, r.burnTime)) * 0.5;
        if ((p.colorT -= dt) <= 0) { p.colorT = 0.12; p.recolor(); }
        if (p.fierceFx) p.fierceFx.pos.set(p.pos.x, p.pos.y + p.kit.size.y * 0.35, p.pos.z);
        if (def.fierce && (p._fierce = (p._fierce || 0) - dt) <= 0) {
          p._fierce = 0.9;
          G.elements?.apply?.('fire', p.pos, r.radius + 1.6, 0.7, { source: 'fierce', from: p, noGround: false });
          fx('ignite', _v.copy(p.pos).setY(p.pos.y + r.height * 0.5), { scale: 1.2 });
        }
      },
      burnout: () => { p.char = 1; p.recolor(); queueBreak(p, 'fire'); },
      wet: () => p.recolor(), dry: () => p.recolor(),
      freeze: () => p.recolor(), thaw: () => p.recolor(),
      shock: (r, power) => { p.flash = Math.max(p.flash, 0.9); S.ticking.add(p); p.recolor(); if (def.behave === 'bell') p.ring(1); if (def.behave === 'firework') p.lightFuse(0.35); },
      shatter: (r, info) => { if (def.behave === 'bell' || def.behave === 'chime') p.ring(1); else if (def.el === 'stone' || def.el === 'crystal' || def.el === 'ice' || r.frozen >= 0) p.damage(p.maxHp * (def.boulder ? 1.2 : 2), { by: 'thunder', element: 'thunder' }); },
      hit: (r, element, power, hinfo) => onElementHit(p, element, power, hinfo || {}),
    },
  };
  if (def.flammable != null) o.flammable = def.flammable;
  if (def.burnTime != null) o.burnTime = def.burnTime;
  if (def.conductive != null) o.conductive = def.conductive;
  if (def.behave === 'melt') o.immune = ['frozen'];
  return o;
}

function stopFierce(p) { if (p.fierceFx) { try { p.fierceFx.remove(); } catch (e) { /* */ } p.fierceFx = null; } }

function onElementHit(p, element, power, h) {
  const def = p.def;
  if (!p.alive || h.from === p) return;
  if (def.behave === 'bell' || def.behave === 'chime') { if (element !== 'sun' && element !== 'moon') p.ring(clamp(power, 0.3, 1)); return; }
  if (def.behave === 'melt' && (element === 'fire' || element === 'sun')) { p.meltBy(p.maxHp * (element === 'fire' ? 0.55 : 0.2) * power); return; }
  if (def.behave === 'firework' && (element === 'fire' || element === 'thunder')) { p.lightFuse(element === 'thunder' ? 0.35 : 2.0); return; }
  if (def.behave === 'waterjar' && element === 'ice' && p.reactor) { p.reactor.freeze?.(10); }
  let dmg = (h.damage ?? BASE_DMG[element] * 10 * power / 10) * (h.mult || 1);
  if (element === 'fire' && def.el !== 'wood' && def.el !== 'paper' && def.el !== 'cloth' && def.el !== 'grass') dmg *= 0.3;
  if (h.split && def.el === 'wood') dmg = Math.max(dmg, p.maxHp * 1.2);        // lightning splits wooden things
  if (h.shatter) dmg = Math.max(dmg, p.maxHp * (def.boulder ? 1.1 : 2));
  if (p.reactor && p.reactor.frozen > 0 && (element === 'earth' || h.heavy)) dmg *= 1.5;
  if (element === 'water' || element === 'wind' || element === 'moon' || element === 'sun') dmg = 0;
  if (def.fragile === Infinity && def.hp >= 400) dmg = 0;
  if (dmg > 0) p.damage(dmg, { by: element, element, source: h.source });
}

// ---- impacts --------------------------------------------------------------------------------------------------------
function onImpact(p, other, speed, info) {
  if (!p.alive || p.broken) return;
  const def = p.def, b = p.body;
  if (def.behave === 'bell' || def.behave === 'chime') { if (speed > 2) p.ring(clamp(speed / 10, 0.3, 1)); return; }
  if (speed > 4.5 && S.t - p.hitSfxT > 0.18) { p.hitSfxT = S.t; sfx(def.sfxHit || HIT_SFX[def.phys] || 'hit_wood', b.pos, { vol: clamp(speed / 14, 0.25, 1), pitch: 0.9 + rand() * 0.2 }); }
  // creatures struck by heavy, fast props (telekinesis throws, rolling boulders)
  if (info && info.surface === 'character' && info.owner) S.pendingHurt.push([p, info.owner, speed]);
  // carried on a thread (月引, the craft's 牵星线): knocks never break it; it is set down whole
  if (b.held) return;
  const frozen = p.reactor && p.reactor.frozen > 0;
  // struck by something much heavier (a boulder, an iron ball): it hurts more than the speed change says
  if (other && other.mass > b.mass * 2) {
    speed *= Math.min(2.2, Math.sqrt(other.mass / b.mass) / 1.3);
    const ov = other.vel.length();
    if (other.mass > b.mass * 2.5 && ov > 5.5 && def.fragile !== Infinity) p.damage(p.maxHp * (ov - 4.5) / 5, { by: 'crush' });
  }
  const grace = !other && S.t < p.graceT ? 1.5 : 1;
  if (def.behave === 'firework' && speed > (def.fragile ?? 7.5) * grace) { p.lightFuse(1.1); return; }
  const thr = (def.fragile ?? 10) * (frozen ? 0.55 : 1) * grace;   // settling after a plain spawn
  if (speed > thr) {
    const dmg = (speed - thr) * (p.maxHp / 6) * (frozen ? 2 : 1) + (frozen ? p.maxHp * 0.3 : 0);
    p.damage(dmg, { by: 'impact' });
  }
}

function applyHurt(p, owner, speed) {
  if (!p.alive || !owner || owner === p) return;
  const b = p.body;
  const thrown = S.t - p.heldT < 3;
  const mass = b ? b.mass : 20;
  const mom = mass * speed;
  let dmg = clamp((mom - 160) / 24 * (p.def.heavy ?? 0.5), 0, 90);
  if (owner === G.player) { if (thrown || dmg < 6) return; dmg *= 0.5; }
  if (dmg < 1) return;
  const team = thrown ? 'player' : 'neutral';
  if (owner.team && owner.team === team) return;
  const power = clamp(dmg / 30, 0.3, 3);
  const dir = b ? b.vel.clone().setY(0) : new THREE.Vector3();
  if (dir.lengthSq() > 1e-6) dir.normalize();
  const info = { source: p, team, damage: dmg, element: 'earth', power, mult: 1, heavy: mass > 60, dir, pos: p.pos.clone(), prop: p };
  const r = owner.reactor;
  try {
    if (r && r.on && r.on.hit) r.on.hit(r, 'earth', power, info);
    else if (G.combat?.damage && owner.team === 'enemy') G.combat.damage(owner, dmg, info);
  } catch (e) { G.reportError('props:hurt', e); }
  fx('hit_earth', owner.pos || p.pos, { power });
}

// ---- spawn / remove -------------------------------------------------------------------------------------------------
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
/** Build a live prop. pos: centre (or base when opts.base). Returns Prop. */
export function makeProp(type, pos, opts = {}) {
  const def = CATALOG[type];
  const p = new Prop(type, def);
  const kit = p.kit;
  const m = p.mesh;
  // orientation
  const rot = opts.rot;
  if (rot == null) _q.identity();
  else if (typeof rot === 'number') _q.setFromAxisAngle(_v.set(0, 1, 0), rot);
  else if (rot.isQuaternion) _q.copy(rot);
  else if (rot.isEuler) _q.setFromEuler(rot);
  else if (Array.isArray(rot)) _q.setFromEuler(_e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0));
  else if (rot.w != null) _q.set(rot.x, rot.y, rot.z, rot.w);
  else _q.identity();
  m.position.set(pos.x, pos.y, pos.z);
  m.quaternion.copy(_q);
  m.updateMatrix();
  p.persistent = !!opts.persistent;
  if (!opts.vel) p.graceT = S.t + 0.7;
  alloc(kit, p);
  // physics
  const size = kit.size, sh = def.shrink ?? 0.94;
  let shape = def.shape || 'box', psize;
  if (shape === 'sphere') psize = def.r ?? Math.max(0.05, Math.min(size.x, size.y, size.z) * 0.5 * sh + (Math.max(size.x, size.y, size.z) - Math.min(size.x, size.y, size.z)) * 0.15);
  else if (shape === 'cylinder') psize = { r: def.r ?? Math.max(0.04, Math.max(size.x, size.z) * 0.5 * sh), h: Math.max(0.1, size.y * sh) };
  else if (shape === 'hull') psize = null;
  else psize = def.half ?? [Math.max(0.03, size.x * 0.5 * sh), Math.max(0.03, size.y * 0.5 * sh), Math.max(0.03, size.z * 0.5 * sh)];
  if (G.physics?.add) {
    try {
      p.body = G.physics.add({
        mesh: m, shape, size: psize, pos: m.position, quat: m.quaternion, type: def.fixed ? 'fixed' : 'dynamic',
        material: def.phys || 'wood', mass: def.mass, density: def.density, friction: def.friction, restitution: def.restitution, rolling: def.rolling,
        ccd: !!(def.heavy || def.boulder), group: 'prop', owner: p, sleeping: !!opts.sleep && !def.fixed,
        vel: opts.vel, angvel: opts.angvel,
        onImpact: (other, speed, info) => onImpact(p, other, speed, info),
        onRemove: (body, reason) => { if (reason !== 'removed' && p.alive) removeProp(p, true); },
      });
    } catch (e) { G.reportError('props:physics', e); p.body = null; }
  }
  // elements
  if (G.elements?.register) {
    try { p.reactor = G.elements.register(reactorOpts(p)); } catch (e) { G.reportError('props:elements', e); p.reactor = null; }
  }
  if (def.behave === 'fire' || def.behave === 'lantern') {
    const l = opts.lit ?? def.lit;
    p.lit = l === 'auto' ? G.world.veilAt(pos.x, pos.z) > 0.22 : !!l;
  }
  // interactions
  if (G.interact?.add) {
    if (def.behave === 'bell') p.interact = G.interact.add({ getPos: () => p.pos, radius: 2.4, prompt: () => t('props.prompt.ring'), onInteract: () => p.ring(1) });
    else if (def.food && !def.fixed) {
      p.interact = G.interact.add({
        getPos: () => p.pos, radius: 1.8, priority: -1,
        prompt: () => t('props.prompt.pick', { name: t('props.name.' + type) }),
        enabled: () => p.alive && !p.body?.held && !(p.reactor && p.reactor.burning),
        onInteract: () => pickFood(p),
      });
    }
  }
  p.recolor();
  p.write(true);
  p.updateLitFx();
  if (def.behave === 'chime' || def.behave === 'melt') S.ticking.add(p);
  if (opts.burning && p.reactor) p.reactor.ignite?.(1, { source: 'spawn' });
  S.live.push(p);
  return p;
}

function rewriteMoved(item) { item.write(true); item.recolor(); }

export function removeProp(p, fromPhysics = false) {
  if (!p.alive) return;
  p.alive = false;
  S.ticking.delete(p);
  if (p.emitter) { try { p.emitter.remove(); } catch (e) { /* */ } p.emitter = null; }
  if (p.fuseFx) { try { p.fuseFx.remove(); } catch (e) { /* */ } p.fuseFx = null; }
  stopFierce(p);
  if (p.light) { p.light.remove?.(); p.light = null; }
  if (p.interact) { p.interact.remove(); p.interact = null; }
  if (p.reactor) { try { G.elements?.unregister?.(p.reactor); } catch (e) { G.reportError('props:unregister', e); } p.reactor = null; }
  if (p.body && !fromPhysics) { try { G.physics?.remove?.(p.body); } catch (e) { G.reportError('props:remove', e); } }
  release(p.kit, p, rewriteMoved);
  const i = S.live.indexOf(p);
  if (i >= 0) { S.live[i] = S.live[S.live.length - 1]; S.live.pop(); }
  S.onRemoved?.(p);
}

// ---- breaking -------------------------------------------------------------------------------------------------------
function queueBreak(p, by) {
  if (p.broken || !p.alive) return;
  p.broken = true;
  S.pendingBreak.push(p, by);
}

/** Called from props.update(): actually break everything queued. */
export function flushBreaks() {
  const q = S.pendingBreak;
  for (let i = 0; i < q.length; i += 2) { try { doBreak(q[i], q[i + 1]); } catch (e) { G.reportError('props:break', e); } }
  q.length = 0;
  const h = S.pendingHurt;
  for (let i = 0; i < h.length; i++) { try { applyHurt(h[i][0], h[i][1], h[i][2]); } catch (e) { G.reportError('props:hurt', e); } }
  h.length = 0;
}

function doBreak(p, by) {
  if (!p.alive) return;
  const def = p.def;
  const pos = p.pos.clone();
  const vel = p.body ? p.body.vel.clone() : new THREE.Vector3();
  const size = p.kit.size;
  if (def.fx) fx(def.fx, pos, { scale: Math.max(0.6, Math.min(2, size.length() * 0.8)), power: 1 });
  if (by === 'fire') fx('extinguish', pos, { scale: 1 });
  if (def.sfx) sfx(def.sfx, pos, { vol: 0.9, pitch: 0.9 + rand() * 0.2 });
  // debris
  if (def.debris) {
    const n = Math.max(1, Math.round((def.debrisN || 4) * quality()));
    const cols = def.debrisColor || [0xffffff];
    for (let i = 0; i < n; i++) {
      _c.setHex(cols[i % cols.length]);
      if (p.char > 0) _c.multiplyScalar(1 - 0.8 * p.char);
      _v.set((rand() - 0.5) * size.x, (rand() - 0.3) * size.y, (rand() - 0.5) * size.z);
      const out = _v2.copy(_v).normalize().multiplyScalar(2 + rand() * 3).add(vel.clone().multiplyScalar(0.5));
      out.y += 1.5 + rand() * 2.5;
      spawnDebris(def.debris, _v.add(pos), out, _c, def.phys === 'stone' && def.boulder ? 'stone' : def.debris === 'chunk' ? 'stone' : def.debris === 'shard' ? 'stone' : def.debris === 'sliver' ? 'paper' : 'wood', by === 'fire');
    }
  }
  const beh = def.behave;
  if (beh === 'waterjar' || (beh === 'melt' && def.el === 'ice')) {
    const big = beh === 'waterjar';
    fx('splash', pos, { scale: big ? 1.8 : 1, power: big ? 2 : 1 });
    sfx('splash', pos, { vol: big ? 1 : 0.6 });
    if (big) {
      G.elements?.apply?.('water', pos, 3.8, 1.2, { source: 'water_jar' });
      G.elements?.extinguishGround?.(pos.x, pos.z, 4);
      G.elements?.wetGround?.(pos.x, pos.z, 3.5, 20);
    }
  }
  // boulders split into smaller rocks
  if (def.split && CATALOG[def.split.into]) {
    const n = def.split.n || 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand();
      const c = CATALOG[def.split.into];
      const kp = getKit(def.split.into, c);
      const off = _v.set(Math.cos(a) * size.x * 0.25, (rand() - 0.2) * size.y * 0.2, Math.sin(a) * size.z * 0.25);
      const at = pos.clone().add(off);
      at.y = Math.max(at.y, G.world.heightAt(at.x, at.z) + kp.size.y * 0.5 + 0.05);
      const v = vel.clone().multiplyScalar(0.6).add(_v2.set(Math.cos(a) * 3, 2.5 + rand() * 2, Math.sin(a) * 3));
      S.spawn?.(def.split.into, at, { vel: v, rot: rand() * 6.28 });
    }
  }
  // spill contents
  if (def.spill && CATALOG[def.spill]) {
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) S.spawn?.(def.spill, pos.clone().add(_v.set((rand() - 0.5) * 0.5, 0.2 + i * 0.12, (rand() - 0.5) * 0.5)), { vel: _v2.set((rand() - 0.5) * 3, 2 + rand() * 2, (rand() - 0.5) * 3).clone() });
  }
  // drops
  if (def.drops && G.gameplay?.spawnPickup) {
    for (const [kind, chance, a, b] of def.drops) {
      if (rand() > chance) continue;
      const n = a + Math.floor(rand() * (b - a + 1));
      try { G.gameplay.spawnPickup(kind, pos.clone().setY(pos.y + 0.3), n); } catch (e) { G.reportError('props:drop', e); }
    }
  }
  if (p.rec) p.rec.gone = true;
  G.events.emit('prop:broken', { type: p.type, pos, by });
  removeProp(p);
}

// ---- debris (short-lived instanced bodies) ----------------------------------------------------------------------------
const MAX_DEBRIS = 140;
const FADE_T = 0.6;   // pieces shrink away over their last FADE_T seconds instead of popping out
function spawnDebris(kind, pos, vel, color, material, burnt, opts) {
  if (S.debris.length >= MAX_DEBRIS) S.debris[0] && killDebris(S.debris[0], true);
  const kit = getDebrisKit(kind);
  const sc = opts?.scale ?? 1;
  const life = opts?.life ?? 2.8 + rand() * 2.2;
  const d = { kit, slot: null, body: null, obj: new THREE.Object3D(), color: color.clone(), alive: true, t: 0, life, k: 1 };
  d.obj.position.copy(pos);
  d.obj.quaternion.setFromEuler(_e.set(rand() * 6, rand() * 6, rand() * 6));
  if (sc !== 1) d.obj.scale.setScalar(sc);
  alloc(kit, d);
  writeColor(kit, d.slot, d.color, 1);
  writeItem(kit, d.slot, d.obj, 1, false);
  if (G.physics?.add) {
    try {
      const h = DEBRIS_HALF[kind];
      const round = kind === 'chunk' || kind === 'ball' || kind === 'clod' || kind === 'rock';
      d.body = G.physics.add({
        mesh: d.obj, shape: round ? 'sphere' : 'box', size: round ? h[0] * sc : sc === 1 ? h : [h[0] * sc, h[1] * sc, h[2] * sc],
        pos: d.obj.position, quat: d.obj.quaternion, type: 'dynamic', material, group: 'debris', lifetime: life,
        vel, angvel: _v.set((rand() - 0.5) * 14, (rand() - 0.5) * 14, (rand() - 0.5) * 14).clone(),
        onRemove: () => killDebris(d, false),
      });
    } catch (e) { G.reportError('props:debris', e); }
  }
  if (!d.body) d.life = Math.min(d.life, 1.5);
  S.debris.push(d);
  return d;
}
const LOOSE_MAT = { clod: 'flesh', rock: 'stone', chunk: 'stone', splinter: 'wood', plank: 'wood', shard: 'stone', sliver: 'paper', ball: 'flesh' };
/**
 * Loose debris for anyone (destruction, flora): kind 'clod' | 'rock' | 'splinter' | 'chunk' | 'plank' | 'shard' |
 * 'sliver' | 'ball'; vel {x,y,z}; opts { color (hex or Color), scale, life, material }. Pooled and capped with the props'
 * own shards (the oldest piece makes room). Returns false when it could not be made.
 */
export function looseDebris(kind, pos, vel, opts = {}) {
  if (!DEBRIS_HALF[kind] || !pos) return false;
  const c = opts.color;
  if (c && c.isColor) _c.copy(c); else _c.setHex(typeof c === 'number' ? c : 0x8a6a4a);
  try { spawnDebris(kind, pos, vel || _v2.set(0, 4, 0), _c, opts.material || LOOSE_MAT[kind] || 'stone', false, opts); return true; }
  catch (e) { G.reportError('props:looseDebris', e); return false; }
}
function rewriteDebris(d) { writeItem(d.kit, d.slot, d.obj, 1, false); writeColor(d.kit, d.slot, d.color, 1); }
function killDebris(d, removeBody) {
  if (!d.alive) return;
  d.alive = false;
  if (removeBody && d.body) { try { G.physics?.remove?.(d.body); } catch (e) { /* */ } }
  release(d.kit, d, rewriteDebris);
  const i = S.debris.indexOf(d);
  if (i >= 0) S.debris.splice(i, 1);
}
export function updateDebris(dt) {
  for (let i = S.debris.length - 1; i >= 0; i--) {
    const d = S.debris[i];
    d.t += dt;
    if (!d.body && d.t >= d.life) { killDebris(d, false); continue; }
    const k = clamp((d.life - d.t) / FADE_T, 0, 1);
    if (d.body && d.body.sleeping && d._w && k === d.k) continue;
    d._w = !!(d.body && d.body.sleeping);
    d.k = k;
    writeItem(d.kit, d.slot, d.obj, Math.max(0.02, k), false);
  }
}
export function debrisCount() { return S.debris.length; }

// ---- fireworks --------------------------------------------------------------------------------------------------------
Prop.prototype.lightFuse = function (sec) {
  if (!this.alive || this.broken) return;
  if (this.fuse > 0) { this.fuse = Math.min(this.fuse, sec); return; }
  this.fuse = sec; this.tickT = 0;
  S.ticking.add(this);
  if (G.fx?.emitter) { try { this.fuseFx = G.fx.emitter('embers', { pos: this.flamePos(new THREE.Vector3()), rate: 3, scale: 0.6 }); } catch (e) { this.fuseFx = null; } }
  sfx('steam_sizzle', this.pos, { vol: 0.8, pitch: 1.4 });
  sfx('charge', this.pos, { vol: 0.4, pitch: 1.3 });
};

const ROCKET_COLORS = [0xff8fd8, 0xffd27a, 0x6ff3ff, 0xb48cff, 0xff5a4a, 0x9dffb0, 0xfff1c9];
function detonate(p) {
  if (!p.alive) return;
  const pos = p.pos.clone();
  if (p.fuseFx) { try { p.fuseFx.remove(); } catch (e) { /* */ } p.fuseFx = null; }
  try {
    G.physics?.explode?.(pos, 7.5, 13, { up: 0.5, exclude: p.body });
    G.elements?.apply?.('fire', pos, 3.4, 1.2, { source: 'firework', damage: 26, team: 'neutral', from: p });
    fx('explosion', pos.clone().setY(pos.y + 0.4), { power: 1.6, scale: 1.1 });
    fx('spark', pos, { color: 0xffd27a, scale: 2, count: 2 });
    G.fx?.flash?.(pos, 0xffb155, 160, 0.35, 22);
    G.fx?.shake?.(0.42, 0.4);
    G.hitstop?.(0.04);
    sfx('explosion_small', pos, { vol: 1 });
    sfx('firework', pos, { vol: 0.9, delay: 0.05 });
    // neighbours: other barrels catch, fragile things crack
    for (const o of S.live) {
      if (o === p || !o.alive) continue;
      const d = o.pos.distanceTo(pos);
      if (d > 6.5) continue;
      if (o.def.behave === 'firework') o.lightFuse(0.28 + rand() * 0.4 + d * 0.04);
      else o.damage(40 * (1 - d / 6.5), { by: 'firework', element: 'fire' });
    }
    // rockets
    const n = Math.round((5 + rand() * 3) * Math.max(0.5, quality()));
    const base = Math.floor(rand() * ROCKET_COLORS.length);
    for (let i = 0; i < n; i++) launchRocket(pos, ROCKET_COLORS[(base + i * 2) % ROCKET_COLORS.length], i / n);
  } catch (e) { G.reportError('props:firework', e); }
  p.broken = false;
  queueBreak(p, 'firework');
}

const MAX_ROCKETS = 28;
function launchRocket(from, color, f) {
  if (S.rockets.length >= MAX_ROCKETS) return;
  const a = f * Math.PI * 2 + rand() * 0.6;
  const tilt = 0.12 + rand() * 0.3;
  const sp = 18 + rand() * 7;
  const r = {
    pos: from.clone().setY(from.y + 0.8),
    vel: new THREE.Vector3(Math.cos(a) * Math.sin(tilt) * sp, Math.cos(tilt) * sp, Math.sin(a) * Math.sin(tilt) * sp),
    t: 0, life: 0.7 + rand() * 0.4, color, trail: null, sparkT: 0, delay: rand() * 0.25,
  };
  S.rockets.push(r);
}
export function updateRockets(dt) {
  for (let i = S.rockets.length - 1; i >= 0; i--) {
    const r = S.rockets[i];
    if (r.delay > 0) { r.delay -= dt; if (r.delay > 0) continue; sfx('whoosh', r.pos, { vol: 0.5, pitch: 1.4 + rand() * 0.3 }); }
    if (!r.trail && G.fx?.trail) { try { r.trail = G.fx.trail({ color: r.color, color2: 0xffd27a, width: 0.3, life: 0.5, style: 'band', intensity: 1.7 }); } catch (e) { r.trail = null; } }
    r.t += dt;
    r.vel.y -= 9 * dt;
    r.vel.multiplyScalar(1 - 0.4 * dt);
    r.pos.addScaledVector(r.vel, dt);
    r.trail?.push?.(r.pos);
    if ((r.sparkT -= dt) <= 0) { r.sparkT = 0.07; fx('spark', r.pos, { color: r.color, scale: 0.35, count: 0.4 }); }
    if (r.t >= r.life) {
      fx('spark', r.pos, { color: r.color, scale: 5, count: 4, power: 2.5 });
      fx('hit_sun', r.pos, { color: r.color, scale: 3.5, power: 2 });
      fx('hit_thunder', r.pos, { color: r.color, scale: 2.5, power: 1.5 });
      fx('petals', r.pos, { scale: 1.6, count: 1.2 });
      G.fx?.flash?.(r.pos, r.color, 90, 0.4, 40);
      sfx('firework', r.pos, { vol: 0.8, pitch: 0.85 + rand() * 0.3 });
      try { r.trail?.stop?.(); } catch (e) { /* */ }
      S.rockets.splice(i, 1);
    }
  }
}

// ---- food -----------------------------------------------------------------------------------------------------------
function roast(p) {
  if (!p.alive) return;
  const def = p.def;
  const pos = p.pos.clone(), q = p.mesh.quaternion.clone(), vel = p.body ? p.body.vel.clone() : null, rec = p.rec;
  fx('steam', pos, { scale: 0.6 });
  sfx('steam_sizzle', pos, { vol: 0.5 });
  removeProp(p);
  const np = S.spawn?.(def.roast, pos, { rot: q, vel });
  if (np && rec) { rec.type = def.roast; rec.live = np; np.rec = rec; }
}
function pickFood(p) {
  if (!p.alive) return;
  const pos = p.pos.clone();
  try { G.gameplay?.spawnPickup?.(p.def.food, pos, 1); } catch (e) { G.reportError('props:pick', e); }
  fx('pickup', pos, { scale: 0.6 });
  sfx('pickup', pos, { vol: 0.6 });
  if (p.rec) p.rec.gone = true;
  removeProp(p);
}
