// Shared attack pieces for enemies, rivals and bosses: telegraphs, melee arcs, shockwaves, dark orbs, falling shards.
// Every hostile action is announced first (a sigil on the ground, a glow, a crouch) — never an unreadable hit.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { PAL } from '../core/mats.js';
import { clamp } from '../core/util.js';
import { affixEvent } from './wards.js';
import { perfectDodge, parry } from './pacing.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
export const DARK = 0x8a3cff;
export const DARK2 = 0x2a0a50;
export const WARN = 0xff3b6b;

/** Ground telegraph: a spinning sigil that fills for `dur` seconds where something will land. */
export function warnAt(pos, radius, dur, color = WARN, handles = null) {
  const y = G.world.groundAt(pos.x, pos.z, pos.y + 2);
  _v.set(pos.x, y, pos.z);
  const sigil = G.fx?.sigil?.(_v, { color, radius, dur, intensity: 1.4, spin: 1.2, tracked: !!handles });
  const ring = G.fx?.ring?.(_v, { color, radius, dur: dur * 0.95, intensity: 0.9, thickness: 0.12, tracked: !!handles });
  handles?.push(sigil, ring);
}

/** Horizontal distance from the player to p and whether the player is targetable. */
export function playerAlive() {
  const P = G.player;
  return !!(P && !P.dead && P.pos);
}

/** Is the player inside a frontal arc of `e` (range m, half-angle rad)? */
export function inArc(e, range, half) {
  const P = G.player;
  if (!playerAlive()) return false;
  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dy = P.pos.y - e.pos.y;
  const d = Math.hypot(dx, dz);
  if (d > range + 0.4 || Math.abs(dy) > Math.max(2.2, e.height)) return false;
  if (d < 0.6) return true;
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  return (dx * fx + dz * fz) / d >= Math.cos(half);
}

/** Damage the player from an enemy, scaled by the enemy's current attack multiplier. */
/** fix2: camp foes threaten rather than delete — a night camp standing still costs ~25 hp in 5 s at base stats */
export const CAMP_K = 0.6;
export function campK(e) { return e && e.camp && !e.boss ? CAMP_K : 1; }
export function hurtPlayer(e, amount, o = {}) {
  if (!playerAlive()) return 0;
  const m = e ? (e.atkMul ?? 1) * campK(e) : 1;
  let a = Math.round(amount * m);
  // ambushers want the purse, not her life: they never take her below their mercy floor
  if (e && e.mercyFloor != null) a = Math.min(a, Math.max(0, Math.floor(G.player.hp - e.mercyFloor)));
  if (!(a > 0)) return 0;
  if (e && parry(e)) return 0;   // a guard raised just in time turns the blow aside whole (pacing.js)
  const dealt = G.player.takeDamage?.(a, { element: o.element, from: o.from || (e ? e.pos : null), knock: o.knock ?? 0, source: e }) || 0;
  if (dealt > 0 && e) { e._hitPlayerT = G.time.t; if (e.affixes) affixEvent(e, 'onHitPlayer'); }
  else if (e && !dealt) perfectDodge(e);   // she dodged through it: the attacker is open (pacing.js)
  return dealt;
}

/** Melee: hits if the player is in the arc. */
export function melee(e, range, half, dmg, o = {}) {
  if (!inArc(e, range, half)) return false;
  hurtPlayer(e, dmg, o);
  _v.copy(G.player.pos); _v.y += 1;
  G.fx?.burst(o.burst || 'hit_dark', _v, { scale: o.scale || 0.9, color: o.color || DARK });
  return true;
}

/**
 * Shockwave: an expanding ring; the player is hit if grounded within radius (jumping / dodging avoids it).
 * Also pushes props and applies `element` to the world when given.
 */
export function shockwave(e, pos, radius, dmg, o = {}) {
  const P = G.player;
  _v.copy(pos); _v.y = G.world.groundAt(pos.x, pos.z, pos.y + 2);
  G.fx?.ring?.(_v, { color: o.color ?? DARK, radius, dur: 0.5, intensity: 2, thickness: 0.5 });
  G.fx?.burst(o.burst || 'dust', _v, { scale: radius / 3, power: 1.5 });
  G.fx?.shake?.(o.shake ?? 0.35, 0.35);
  G.physics?.explode?.(_v, radius, o.impulse ?? 9, { up: 0.6 });
  if (o.element) G.elements?.apply(o.element, _v, radius, o.power ?? 1, { source: e, team: 'enemy', damage: 0, noGround: o.noGround });
  if (playerAlive()) {
    const d = Math.hypot(P.pos.x - _v.x, P.pos.z - _v.z);
    const airborne = P.pos.y - G.world.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.5) > 0.6;
    if (d <= radius && !(o.jumpable !== false && airborne)) {
      hurtPlayer(e, dmg * (o.falloff ? 1 - 0.5 * d / radius : 1), { element: o.element, from: _v, knock: o.knock ?? 7 });
      return true;
    }
  }
  return false;
}

/** Visible orb bolt that dodges / guards / clashes like a spell: a re-skinned spells projectile. */
const orbDef = {
  impact(p, h) {
    const at = h.point;
    const el = p.team === 'enemy' ? (p.data?.el || 'moon') : 'sun';
    G.elements?.apply(el, at, p.data?.splash ?? 1.2, p.power, { source: p.owner, team: p.team, damage: Math.round(p.damage * p.power), dir: p.vel, noGround: !p.data?.ground });
    G.fx?.burst(p.team === 'enemy' ? 'hit_dark' : 'hit_sun', at, { dir: p.vel, scale: p.data?.big ? 1.6 : 0.9 });
    G.audio?.sfx('hit_dark', { pos: at, vol: 0.7 });
    if (p.data?.onImpact) { try { p.data.onImpact(p, at); } catch (e) { G.reportError('combat:orb', e); } }
  },
  expire(p) { G.fx?.burst('hit_dark', p.pos, { scale: 0.5 }); },
};

/**
 * Dark orb from `caster` toward `target` (Vector3 or object with pos). opts: { speed=13, damage=10, turn=0.7, size=0.5,
 * life=4, power=1, el='moon', splash, big, gravity, onImpact }. Returns the projectile or null (no spells system).
 */
export function darkOrb(caster, origin, target, o = {}) {
  if (!G.spells?.shoot && !G.spells?.cast) return null;
  const tp = target && (target.isVector3 ? target : target.pos);
  if (!tp) return null;
  _w.copy(tp); if (!target.isVector3) _w.y += (target.height || 1.6) * 0.55;
  _d.subVectors(_w, origin).normalize();
  let p = null;
  try {
    // spells.shoot: a plain projectile (no charm paper sfx); older spells builds fall back to a re-skinned charm
    if (G.spells.shoot) p = G.spells.shoot({ el: o.el || 'moon', origin, dir: _d, speed: o.speed ?? 13, target: o.turn === 0 ? null : target, turn: o.turn ?? 0.7, team: 'enemy', owner: caster, power: o.power ?? 1, def: orbDef, color: o.color ?? DARK, size: o.size ?? 0.5, trail: { color: o.color ?? DARK, color2: DARK2, width: 0.2, life: 0.25, intensity: 1.4 } });
    else p = G.spells.cast('charm', 'small', { caster, origin, dir: _d, target: o.turn === 0 ? null : target, team: 'enemy', power: o.power ?? 1 })?.projectile;
  } catch (e) { G.reportError('combat:darkOrb', e); return null; }
  if (!p) return null;
  const speed = o.speed ?? 13;
  p.vel.copy(_d).multiplyScalar(speed); p.speed = speed;
  p.el = o.el || 'moon'; p.shape = 'orb'; p.color = o.color ?? DARK; p.size = o.size ?? 0.5; p.radius = Math.max(0.3, p.size * 0.8);
  p.turn = o.turn ?? 0.7; p.life = o.life ?? 4; p.damage = Math.round((o.damage ?? 10) * campK(caster)); p.gravity = o.gravity || 0; p.def = orbDef;
  p.spell = 'dark'; p.form = o.big ? 'big' : 'small';
  p.data = Object.assign({}, p.data || {}, { el: o.el || 'moon', splash: o.splash, big: o.big, onImpact: o.onImpact, ground: o.ground, excludeBody: null });
  try { p.trail?.setColor?.(o.color ?? DARK, DARK2); } catch (e) { /* trail optional */ }
  if (!p.emitter && G.fx?.emitter) { p.emitter = G.fx.emitter('aura_moon', { color: o.color ?? DARK, scale: 0.6 * (o.size ?? 0.5) / 0.5 }); p.emitter.pos.copy(p.pos); }
  G.audio?.sfx('cast_dark', { pos: origin, vol: 0.7 });
  return p;
}

/** A shard / meteor falling from the sky onto pos after `delay` (with a ground warning). */
export function skyFall(e, pos, o = {}) {
  const delay = o.delay ?? 1.1, radius = o.radius ?? 2.2;
  const at = pos.clone();
  at.y = G.world.groundAt(at.x, at.z, at.y + 2);
  warnAt(at, radius, delay, o.color ?? WARN);
  return after(delay, () => {
    _w.copy(at); _w.y += 14;
    G.fx?.lightning?.(_w, at, { color: o.color ?? DARK, branches: 1, dur: 0.18, width: 0.5 });
    shockwave(e, at, radius, o.damage ?? 14, { color: o.color ?? DARK, burst: 'hit_dark', jumpable: false, knock: 4, shake: 0.15, element: o.element, impulse: 5 });
  });
}

// ---- tiny game-time scheduler (paused with the game, cleared with combat) -----------------------------------------
const timers = [];
export function after(sec, fn, owner = null) { const t = { t: sec, fn, owner }; timers.push(t); return t; }
export function cancelTimers(owner) { for (let i = timers.length - 1; i >= 0; i--) if (!owner || timers[i].owner === owner) timers.splice(i, 1); }
export function updateTimers(dt) {
  for (let i = timers.length - 1; i >= 0; i--) {
    const t = timers[i];
    if (t.owner && t.owner.dead) { timers.splice(i, 1); continue; }
    t.t -= dt;
    if (t.t <= 0) { timers.splice(i, 1); try { t.fn(); } catch (e) { G.reportError('combat:timer', e); } }
  }
}
export function timerCount() { return timers.length; }

/** Flatten a direction to XZ and normalise into out. */
export function flatDir(from, to, out) {
  out.set(to.x - from.x, 0, to.z - from.z);
  const l = out.length();
  if (l > 1e-5) out.divideScalar(l); else out.set(0, 0, 1);
  return out;
}

export { clamp, PAL };
