// Enemy core: body, reactor, physics capsule, movement / knockback / statuses, damage resolution, death dissolve.
// The per-type brains live in types.js (def.think); rivals and bosses reuse the same Enemy with their own defs.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { PAL, glow } from '../core/mats.js';
import { clamp, damp, dampAngle, angleDiff, TAU } from '../core/util.js';
import { acquireCreature } from '../actors/creature.js';
import { createActor, makeActorShadowBlob, healActor } from '../actors/rig.js';
import { cancelTimers } from './attacks.js';
import { initPoise } from './wards.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const GRAV = 22;
let nextId = 1;
const actorPool = new Map();
// phones (core/assets.js MOB): a pooled humanoid foe holds its person's model; one not reused for POOL_IDLE s is freed
// so the asset store can let that model go (checked on any foe's build / dispose, at most every 5 s)
const POOL_IDLE = 60;
let poolCheck = 0;
function drainPool() {
  const now = G.time.real;
  if (!G.quality?.mobile || now - poolCheck < 5) return;
  poolCheck = now;
  for (const p of actorPool.values()) {
    for (let i = p.length - 1; i >= 0; i--) {
      const a = p[i];
      if (now - (a._pooledAt ?? now) < POOL_IDLE) continue;
      p.splice(i, 1);
      try { a.dispose(); a.model?.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); }); } catch (e) { G.reportError('combat:actor', e); }
    }
  }
}

const EL_TEXT = { fire: 0xffa055, water: 0x7fd4ff, ice: 0xcff6ff, wind: 0xb6f5d0, thunder: 0xd2a8ff, earth: 0xe0b878, sun: 0xffe08a, moon: 0xc8b8ff };

// ---- small floating health bar (shown for a few seconds after a hit) -----------------------------------------------
let barGeo = null, barBg = null, barFg = null;
function makeBar() {
  if (!barGeo) {
    barGeo = new THREE.PlaneGeometry(1, 0.09);
    barBg = new THREE.MeshBasicMaterial({ color: 0x140c22, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false, toneMapped: false });
    barFg = new THREE.MeshBasicMaterial({ color: 0xff5a7a, depthTest: false, depthWrite: false, toneMapped: false });
  }
  const g = new THREE.Group();
  const bg = new THREE.Mesh(barGeo, barBg), fg = new THREE.Mesh(barGeo, barFg);
  bg.scale.set(1.06, 1.5, 1); fg.position.z = 0.001;
  bg.renderOrder = 998; fg.renderOrder = 999;
  g.add(bg, fg);
  g.userData.fg = fg;
  g.visible = false;
  return g;
}

export class Enemy {
  constructor(type, def, pos, opts = {}) {
    this.id = nextId++;
    this.type = type;
    this.def = def;
    this.team = 'enemy';
    this.pos = new THREE.Vector3().copy(pos);
    this.vel = new THREE.Vector3();
    this.move = new THREE.Vector3();
    this.home = new THREE.Vector3().copy(pos);
    this.yaw = opts.yaw ?? Math.random() * TAU;
    this.maxHp = Math.round((opts.hp ?? def.hp ?? 50) * (opts.hpMul ?? 1));
    this.hp = this.maxHp;
    this.radius = def.radius ?? 0.5;
    this.height = def.height ?? 1.2;
    this.material = def.material || 'shade';
    this.fly = !!def.fly;
    this.hover = def.hover ?? 0;
    this.boss = !!def.boss;
    this.dead = false;
    this.held = false;
    this.stunT = 0;
    this.iframes = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.atk = null;          // current telegraphed attack
    this.cd = 1 + Math.random();
    this.aggro = !!opts.aggro;
    this.camp = opts.camp || null;
    this.wave = opts.wave || null;
    this.persistent = !!opts.persistent;
    this.grounded = true;
    this.atkMul = 1;
    this.slow = 1;
    this.light = 0;
    this.veil = 0;
    this.empowerT = 0;
    this.fleeT = 0;
    this.lastHitT = -99;
    this.hitBy = null;
    this.dormant = false;
    this.k = 1;
    this.data = {};
    this.opts = opts;
    this.speedMul = opts.speedMul ?? 1;
    this.dmgMul = opts.dmgMul ?? 1;
    this._lightT = Math.random() * 0.25;
    this._barT = 0;
    this.haste = 1;
    this.handlesSlow = true;   // elements: this mover applies reactor.speedMul itself (step)
    this.ward = null;
    this.elite = false;
    this.affixes = null;
    this.build(opts);
    initPoise(this);
  }

  build(opts = {}) {
    const def = this.def;
    drainPool();
    if (def.humanoid) {
      const key = def.asset + '|' + (def.tint || '');
      const pool = actorPool.get(key);
      this._actorKey = key;
      this.actor = pool && pool.length ? pool.pop() : createActor(def.asset, { castShadow: true });
      const self = this;
      this.actor.footGround = (x, z) => G.world.groundAt(x, z, self.pos.y + 0.6);
      this.actor.group.visible = true;
      if (def.tint === 'shade' && !this.actor._shadeTinted) { this.actor.setTint({ dark: true, emissive: def.eyeColor ?? PAL.shadeEye }); this.actor._shadeTinted = true; }
      G.scene.add(this.actor.group);
      this.blob = makeActorShadowBlob(0.5, 0.4);
      G.scene.add(this.blob);
      this.actor.play('idle');
    } else {
      // upgrade 3: hand-built bodies (jelly, hitogata, flame) replace some asset models; ?crv=1 keeps the old models for A/B
      const prim = def.primitive && !(G.params?.crv === '1' && def.asset) ? def.primitive : null;
      this.cr = acquireCreature(def.asset, { scale: def.scale ?? 1, tint: prim && def.asset ? null : def.tint, eyeColor: def.eyeColor, clips: def.clips, primitive: prim, key: prim ? 'prim:' + this.type : undefined, castShadow: def.castShadow ?? true, blobRadius: def.blobRadius });
      if (!def.boss && !opts.noAppear) this.cr.appear(0.55);
      this.cr.addTo();
      this.cr.play(this.fly ? 'fly' : 'idle');
    }
    this.view = this.actor ? this.actor.group : this.cr.group;
    this.bar = makeBar();
    G.scene.add(this.bar);
    this.registerReactor();
    if (G.physics?.addCharacter && def.capsule !== false) {
      try { this.physChar = G.physics.addCharacter({ getPos: () => this.pos, radius: this.radius, height: this.height, owner: this }); }
      catch (e) { this.physChar = null; G.reportError('combat:capsule', e); }
    }
  }

  registerReactor() {
    if (!G.elements?.register) return;
    const self = this, def = this.def;
    this.reactor = G.elements.register({
      owner: this, kind: 'creature', material: this.material, getPos: () => this.pos, radius: this.radius, height: this.height,
      team: 'enemy', living: true, flammable: def.flammable, burnTime: def.burnTime, immune: def.immune, conductive: def.conductive,
      on: {
        hit(r, element, power, h) { self.onElementHit(element, power, h); },
        burnTick(r, dt) {
          self._burnAcc = (self._burnAcc || 0) + (def.burnDps ?? 6) * dt;
          if (self._burnAcc >= 3) { const d = self._burnAcc; self._burnAcc = 0; G.combat?.damage(self, d, { element: 'fire', dot: true, silentHit: true }); }
        },
        shock(r, power) { self.stun(0.5 + 0.4 * Math.min(2, power)); },
        freeze() { self.stopAttack(); },
        shatter() { self._shatterT = G.time.t; },
        light(r, power) { if (self.material === 'shade' && !self.boss) self.fleeT = Math.max(self.fleeT, 1.2 * power); },
      },
    });
  }

  /** Elements callback → damage with the right multipliers (§3.2). */
  onElementHit(element, power, h) {
    if (this.dead || !h || h.team === 'enemy') {
      if (h && h.team === 'enemy' && element === 'moon' && this.material === 'shade' && !h.heavy) this.empower(0.6);
      return;
    }
    let mult = h.mult || 1;
    const def = this.def;
    if (element === 'moon' && this.material === 'shade' && h.empower && !h.heavy) {
      // moonlight feeds them: heal + stronger for a while
      this.empower(power);
      return;
    }
    if (def.mult && def.mult[element] != null) mult *= def.mult[element];
    const base = h.damage ?? 8 * power;
    if (!(base > 0)) return;
    G.combat?.damage(this, base * mult, { element, power, source: h.source, mult, heavy: h.heavy, shatter: h.shatter, purify: h.purify, dir: h.dir, pos: h.pos, reaction: h.reaction, fusion: h.fusion });
  }

  empower(power) {
    const heal = Math.round(6 + 6 * power);
    this.hp = Math.min(this.maxHp, this.hp + heal);
    this.empowerT = 6;
    _v.copy(this.pos); _v.y += this.height + 0.3;
    G.fx?.text?.(_v, '+' + heal, { color: 0xc8a8ff, size: 0.9 });
    G.fx?.burst('aura_moon', _v, { scale: 0.8 });
  }

  stun(sec) { this.stunT = Math.max(this.stunT, sec); if (sec > 0.25) this.stopAttack(); }
  get frozen() { return !!(this.reactor && this.reactor.frozen > 0); }
  get burning() { return !!(this.reactor && this.reactor.burning > 0); }
  get center() { return _w.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z); }
  centerOut(out) { return out.set(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z); }

  stopAttack() {
    if (this.atk) { try { this.atk.cancel?.(this); } catch (e) { G.reportError('combat:cancel', e); } this.atk = null; }
  }

  /** Start a telegraphed attack: tell(e) now, fire(e) after windup, then recover seconds of nothing. */
  attack(name, windup, recover, fire, o = {}) {
    this.atk = { name, t: 0, windup, recover, fire, fired: false, cancel: o.cancel, during: o.during, lock: o.lock !== false };
    o.tell?.(this);
  }

  playState(s, o) {
    if (this.actor) return this.actor.play(s, o);
    return this.cr ? this.cr.play(s, o) : false;
  }

  face(x, z, dt, rate = 8) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw = dt > 0 ? dampAngle(this.yaw, want, rate, dt) : want;
  }

  /** Common physics + status step. Returns the AI time factor (0 = cannot act this frame). */
  step(dt) {
    const W = G.world;
    // environment: light weakens shades, darkness emboldens them
    this._lightT -= dt;
    if (this._lightT <= 0) {
      this._lightT = 0.25;
      const c = this.centerOut(_v);
      this.light = G.elements?.lightAt ? G.elements.lightAt(c) : (G.env?.light ?? 1);
      this.veil = W.veilAt(this.pos.x, this.pos.z);
    }
    if (this.material === 'shade') {
      const empower = this.empowerT > 0 ? 1.3 : 1;
      this.atkMul = (1 + 0.3 * this.veil) * (1 - 0.35 * this.light) * empower * this.dmgMul;
      this.slow = 1 - 0.45 * clamp(this.light * (this.boss ? 0.6 : 1));
    } else { this.atkMul = this.dmgMul; this.slow = 1; }
    if (this.empowerT > 0) this.empowerT -= dt;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.fleeT > 0) this.fleeT -= dt;

    // time bubbles of the other side
    let k = 1;
    const tb = G.spells?.timeBubbles;
    if (tb) for (let i = 0; i < tb.length; i++) {
      const b = tb[i];
      if (b.team === 'enemy' || !b.pos) continue;
      const dx = this.pos.x - b.pos.x, dz = this.pos.z - b.pos.z, dy = this.pos.y - b.pos.y;
      if (dx * dx + dz * dz + dy * dy < b.radius * b.radius) k = Math.min(k, b.scale ?? 0.25);
    }
    this.k = k;
    const frozen = this.frozen;
    const kd = dt * k;
    if (this.cr) this.cr.setTimeScale(frozen ? 0 : k * (this.stunT > 0 ? 0.6 : 1));
    if (this.actor) this.actor.timeScale = frozen ? 0 : k;

    if (this.held) { this.vel.set(0, 0, 0); this.move.set(0, 0, 0); this.grounded = false; return 0; }
    if (this.def.anchored) { this.move.set(0, 0, 0); this.vel.set(0, 0, 0); this.grounded = true; return frozen ? 0 : k; }

    // integrate: AI move (horizontal) + external velocity (knockback, throws, leaps)
    // elements' statuses slow the stride (muddy 0.45, chilled 0.7, frozen 0); knockback keeps its full speed
    const mv = frozen ? 0 : (this.reactor?.speedMul ?? 1);
    let nx = this.pos.x + (this.move.x * mv + this.vel.x) * kd;
    let nz = this.pos.z + (this.move.z * mv + this.vel.z) * kd;
    if (!this.fly && !this.def.swim && W.isWater(nx, nz) && !W.isWater(this.pos.x, this.pos.z) && this.vel.lengthSq() < 30) { nx = this.pos.x; nz = this.pos.z; this.move.set(0, 0, 0); }
    this.pos.x = nx; this.pos.z = nz;
    const gy = W.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6);
    const ground = this.def.swim ? Math.max(gy, -0.3) : gy;
    if (this.fly && !frozen && this.stunT <= 0 && !this._grounded) {
      const want = Math.max(ground + this.hover + (this.data.dy || 0), 0.6 + this.hover * 0.5);
      this.vel.y = damp(this.vel.y, 0, 3, kd);
      this.pos.y = damp(this.pos.y, want, 3, kd) + this.vel.y * kd;
      this.grounded = false;
    } else {
      this.vel.y -= GRAV * kd;
      this.pos.y += this.vel.y * kd;
      if (this.pos.y <= ground) {
        if (this.vel.y < -14 && !this.boss) G.combat?.damage(this, Math.round((-this.vel.y - 12) * 2.2), { element: 'earth', heavy: true, by: 'fall' });
        this.pos.y = ground;
        if (this.vel.y < 0) this.vel.y = 0;
        this.grounded = true;
      } else this.grounded = this.pos.y - ground < 0.05;
    }
    // friction on the external velocity
    const fr = this.grounded ? 7 : 0.6;
    const f = Math.exp(-fr * kd);
    this.vel.x *= f; this.vel.z *= f;
    if (this.def.collide !== false && W.resolveCollisions) W.resolveCollisions(this.pos, this.radius, this.height);
    // drowned shades: deep water washes them away
    if (!this.fly && !this.def.swim && this.pos.y < -1.0 && W.isWater(this.pos.x, this.pos.z) && !this.boss) G.combat?.kill(this, 'water');

    if (this.stunT > 0) { this.stunT -= kd; this.move.set(0, 0, 0); return 0; }
    if (frozen) { this.move.set(0, 0, 0); return 0; }
    return k * this.slow;
  }

  /** Run the current telegraphed attack. Returns true while it owns the enemy. */
  stepAttack(dt) {
    const a = this.atk;
    if (!a) return false;
    a.t += dt;
    if (a.during) { try { a.during(this, a, dt); } catch (e) { G.reportError('combat:during', e); } }
    if (!a.fired && a.t >= a.windup) {
      a.fired = true;
      try { a.fire(this, a); } catch (e) { G.reportError('combat:attack:' + a.name, e); }
    }
    if (a.fired && a.t >= a.windup + a.recover) { if (this.atk === a) this.atk = null; return false; }
    if (a.lock) this.move.set(0, 0, 0);
    return true;
  }

  /** Visual placement (after AI). */
  render(dt) {
    const y = this.pos.y + (this.def.bob ? Math.sin(G.time.t * 2.2 + this.id) * this.def.bob : 0);
    if (this.cr) {
      const a = this.atk;
      this.cr.tell = a && !a.fired && a.windup > 0 && !this.dead ? clamp(a.t / a.windup) : 0;   // look only: exaggerates the existing wind-up
      this.cr.place(this.pos.x, y, this.pos.z, this.yaw); this.cr.update(dt);
    }
    if (this.actor) {
      // built while its model was still loading (the people's models keep coming after play starts): the real one in
      if (this.actor.placeholder) {
        const h = healActor(this.actor, { castShadow: true });
        if (h) { this.actor = h; this.view = h.group; }
      }
      const g = this.actor.group;
      g.position.set(this.pos.x, y, this.pos.z);
      g.rotation.y = this.yaw;
      this.actor.plant = this.grounded ? 1 : 0;
      this.actor.update(dt);
      const gy = G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
      this.blob?.userData.place(this.pos.x, gy, this.pos.z, Math.max(0, this.pos.y - gy));
    }
    // health bar
    const bar = this.bar;
    if (bar) {
      this._barT -= dt;
      const show = !this.dead && !this.def.noBar && !G.ui?.foePlates && this._barT > 0 && this.hp < this.maxHp;
      bar.visible = show;
      if (show) {
        bar.position.set(this.pos.x, this.pos.y + this.height + 0.45, this.pos.z);
        bar.quaternion.copy(G.camera.quaternion);
        const s = clamp(0.6 + this.radius * 0.8, 0.6, 2.2);
        bar.scale.setScalar(s);
        const fg = bar.userData.fg, f = clamp(this.hp / this.maxHp);
        fg.scale.x = Math.max(0.001, f); fg.position.x = -(1 - f) * 0.5;
      }
    }
  }

  hitFlash() {
    this._barT = 4;
    if (this.cr) this.cr.flash(0.07);
    else if (this.actor) {
      this.actor.flash?.(0.07);
      if (!this.atk && !this.actor.busy) this.actor.play('hit', { layer: 'upper' });
    }
  }

  /** Remove the body from every system (reactor, capsule) — the visual may still dissolve. */
  detach() {
    if (this.reactor) { try { G.elements?.unregister(this.reactor); } catch (e) { G.reportError('combat:unregister', e); } this.reactor = null; }
    if (this.physChar) { try { this.physChar.remove(); } catch (e) { G.reportError('combat:capsule', e); } this.physChar = null; }
    cancelTimers(this);
    this.atk = null;
  }

  /** Free everything (visual included). */
  dispose() {
    this.detach();
    if (this.cr) { this.cr.release(); this.cr = null; }
    if (this.actor) {
      const a = this.actor;
      a.group.parent?.remove(a.group);
      a.footGround = null;
      let p = actorPool.get(this._actorKey);
      if (!p) actorPool.set(this._actorKey, (p = []));
      if (p.length < 4 && !this.def.noPool && !a.placeholder) { a.stop?.('upper', 0); a.play('idle', { fade: 0 }); a._pooledAt = G.time.real; p.push(a); }
      else { try { a.dispose(); a.model?.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); }); } catch (e) { G.reportError('combat:actor', e); } }
      this.actor = null;
    }
    if (this.blob) { this.blob.parent?.remove(this.blob); this.blob.geometry.dispose(); this.blob.material.dispose(); this.blob = null; }
    if (this.bar) { this.bar.parent?.remove(this.bar); this.bar = null; }
    for (const f of this.extras || []) { try { f(); } catch (e) { G.reportError('combat:extra', e); } }
    this.extras = null;
  }

  /** Register a cleanup function (emitters, meshes owned by this enemy). */
  own(fn) { (this.extras || (this.extras = [])).push(fn); }
}

export { EL_TEXT, GRAV, t, glow };
