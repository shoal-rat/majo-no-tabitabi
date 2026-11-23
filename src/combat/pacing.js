// Fight pacing ("longer fights" round, 2026-11): what makes a journey fight last and feel good. combat.js calls these
// from damage() / kill() and the dying loop, attacks.js from hurtPlayer(), wards.js owns poise and staggers.
//   committed wind-ups  a foe that has started a telegraphed attack finishes it: flinches no longer cancel it. Stagger,
//                       ward break, shock, freeze and knock-offs still do (those are the answers). A hit during a
//                       wind-up shows an armour glint and pushes the foe less.
//   perfect dodge       dodging through a melee / shockwave hit that would have landed opens the attacker: 「看破」,
//                       exposed 1.8 s, a slow beat.
//   parry               the same blow met by a guard raised within its perfect window (0.25 s, as for reflecting bolts)
//                       is turned aside whole: 「弹开了！」, the attacker exposed 2.2 s, the parry beat.
//   rally               once below 40 % hp (elites 50 %) a foe steels itself: 「背水一战」, its next move comes at once and
//                       it acts 20 % faster for the rest of the fight. def.rally === false opts out (fodder, the thief).
//   hit feedback        tiered hit-stop (the charm stream never stutters), armour glints, starbursts on heavy hits,
//                       a short fling of the body on the killing blow.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp } from '../core/util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const RALLY_AT = 0.4, RALLY_AT_ELITE = 0.5;
let lastDodgeT = -9;

export function installPacing() {
  G.events.on('player:dodge', () => { lastDodgeT = G.time.t; });
}

/** The heroine's own hit (spells and charms carry her as source / caster / owner). */
export function mine(src) { const P = G.player; return !!P && (src === P || src?.caster === P || src?.owner === P); }
/** The magic-bullet stream: her sun-element charms. */
export function isCharm(info) { return info.element === 'sun' && mine(info.source); }

/** A telegraphed attack still winding up: flinches do not cancel it. */
export function committed(e) { const a = e.atk; return !!(a && !a.fired && a.windup >= 0.3); }

/** Hit-stop, glints and starbursts for one landed non-dot hit. */
export function hitFeedback(e, n, info, exposed) {
  const charm = isCharm(info);
  let stop = 0;
  if (info.shatter) stop = 0.09;
  else if (n >= 30) stop = 0.06;
  else if (n >= 18 && !charm) stop = 0.03;
  if (exposed && !charm) stop = Math.max(stop, 0.035);
  if (stop) G.hitstop(stop);
  if (n >= 30 || info.shatter) G.fx?.shake?.(info.shatter ? 0.3 : 0.18, 0.25);
  const now = G.time.t;
  if (committed(e) && now - (e._glintT || -9) > 0.22) {
    // the wind-up holds: a bright glint where the blow glanced off
    e._glintT = now;
    G.fx?.burst('spark', e.centerOut(_v), { scale: 0.55, color: 0xfff0c0 });
  }
  if ((n >= 24 || exposed) && !charm && now - (e._burstT || -9) > 0.15) {
    e._burstT = now;
    G.fx?.starburst?.(e.centerOut(_w), { color: exposed ? 0xffd27a : 0xfff4e0, radius: clamp(0.7 + n / 60, 0.7, 1.6), dur: 0.2, intensity: 1.3 });
  }
}

/** Below the rally line a foe steels itself once: its next move comes now and it fights 20 % faster. */
export function checkRally(e) {
  if (e.rallied || e.dead || e.boss || e.def.rally === false || !(e.maxHp > 0)) return;
  if (e.hp > e.maxHp * (e.elite ? RALLY_AT_ELITE : RALLY_AT)) return;
  e.rallied = true;
  e.haste = (e.haste || 1) * 1.2;
  e.speedMul *= 1.1;
  e.cd = Math.min(e.cd ?? 0, 0.35);
  const D = e.data;
  if (D.cd != null) D.cd = Math.min(D.cd, 0.35);
  if (D.bigCd != null) D.bigCd = Math.min(D.bigCd, 0.5);
  if (D.swoopCd != null) D.swoopCd = Math.min(D.swoopCd, 1.2);
  e.poise = e.poiseMax;   // it shrugs off the very next blow
  e.centerOut(_v);
  G.fx?.burst('charge_done', _v, { color: 0xff6a3a, scale: 1 + e.radius * 0.6 });
  _v.y = e.pos.y + e.height + 0.6;
  G.fx?.text?.(_v, t('combat.rally'), { color: 0xffa070, size: 0.95, dur: 1.3 });
  G.audio?.sfx('growl', { pos: e.pos, pitch: e.def.humanoid ? 1.5 : 0.9, vol: 0.7 });
  if (!e.data.rallyAura) {
    const em = G.fx?.emitter?.('aura_fire', { color: 0xff7a3a, scale: 0.35 + e.radius * 0.35 });
    if (em) { e.data.rallyAura = em; e.own(() => em.remove()); }
  }
  G.events.emit('enemy:rally', { enemy: e });
}

/** Only a blow from close by can be read or parried (not a shard it called down from across the field). */
function close(e) { const P = G.player; return !!P && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < 8 + e.radius; }
/** A dodge through a blow that would have landed: the attacker is open (called by hurtPlayer when nothing got through). */
export function perfectDodge(e) {
  if (!e || e.dead || G.time.t - lastDodgeT > 0.45 || G.time.t - (e._readT || -9) < 1.5 || !close(e)) return false;
  e._readT = G.time.t;
  e.exposedT = Math.max(e.exposedT || 0, 1.8);
  e.centerOut(_v); _v.y = e.pos.y + e.height + 0.55;
  G.fx?.text?.(_v, t('combat.read'), { color: 0xd8f6ff, size: 1.0, dur: 1.2 });
  const P = G.player;
  if (P) G.fx?.duel?.beat?.('dodge', _w.set(P.pos.x, P.pos.y + 1, P.pos.z), { dir: _v.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize() });
  G.events.emit('enemy:read', { enemy: e });
  return true;
}

/** A guard of hers raised within the perfect window, facing the attacker: the blow is turned aside and the foe opened. */
const PERFECT_GUARD = 0.25;
export function parry(e) {
  const P = G.player, L = G.spells?.guards;
  if (!P || !L || !e || e.dead || !close(e)) return false;
  for (let i = 0; i < L.length; i++) {
    const g = L[i];
    if (g.caster !== P || !g.alive || g.t >= PERFECT_GUARD) continue;
    _v.set(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z);
    if (_v.lengthSq() > 1e-4 && (_v.normalize().x * g.fwd.x + _v.z * g.fwd.z) < -0.1) continue;   // from behind: no
    e.exposedT = Math.max(e.exposedT || 0, 2.2);
    e.stun(0.6);
    G.fx?.duel?.beat?.('parry', g.center, { normal: g.fwd, center: g.center });
    G.fx?.text?.(_w.set(P.pos.x, P.pos.y + 2.1, P.pos.z), t('spells.msg.perfect'), { color: 0xffe6a6, size: 1.2, dur: 0.9 });
    G.audio?.sfx('guard', { pos: P.pos, vol: 0.9, pitch: 1.3 });
    G.events.emit('enemy:read', { enemy: e, parry: true });
    return true;
  }
  return false;
}

/** The killing blow throws the body a little before it dissolves (small creatures only). */
export function fling(e) {
  if (!e.cr || e.def.heavy || e.boss || e.def.anchored) return;
  const P = G.player;
  _v.set(e.pos.x - (P?.pos.x ?? e.pos.x), 0, e.pos.z - (P?.pos.z ?? e.pos.z));
  if (_v.lengthSq() < 1e-4) _v.set(Math.sin(e.yaw), 0, Math.cos(e.yaw)).negate();
  _v.normalize();
  e._fling = { x: _v.x * 4.5, y: 3.2, z: _v.z * 4.5, t: 0.55 };
}
/** Dying-loop step of a flung body. */
export function updateFling(e, dt) {
  const f = e._fling;
  if (!f || !e.cr || f.t <= 0) return;
  f.t -= dt;
  f.y -= 22 * dt;
  e.pos.x += f.x * dt; e.pos.z += f.z * dt; e.pos.y += f.y * dt;
  const gy = G.world.groundAt(e.pos.x, e.pos.z, e.pos.y + 1);
  if (e.pos.y < gy) { e.pos.y = gy; f.y = 0; f.x *= 0.5; f.z *= 0.5; }
  e.cr.place(e.pos.x, e.pos.y, e.pos.z, e.yaw);
}
