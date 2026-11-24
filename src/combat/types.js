// The seven kinds of foe (DESIGN §3.5): look, numbers and a small brain each. Every attack has a tell:
//   纸魅 paper  — shiver and rise, then a darting slap. Burns at once.
//   影团 blob   — squashes down (ground sigil), hops and slams. Non-sun hits split it once.
//   影狼 wolf   — circles, crouches with a growl and flaring eyes, then lunges in a straight line.
//   灯蛾 moth   — hovers at range, glows, spits slow dark orbs; flutters to anything burning.
//   鬼火 wisp   — drifts close, swells and flickers over a sigil, then bursts into fire. Water snuffs it.
//   晶傀 golem  — crystal armour (thunder / earth shatter it), raises its arms over a wide sigil, then slams.
//   影巫 caster — humanoid shade: strafes, dark orb volleys + one element, guards, clashes projectiles.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { PAL, glow, toon } from '../core/mats.js';
import { t } from '../core/i18n.js';
import { clamp, TAU, angleDiff } from '../core/util.js';
import { makeJelly, makeHitogata, makeWispFlame } from '../actors/creature.js';
import { makeRockGolem, rockGolemOn } from './golem-body.js';
import { warnAt, melee, shockwave, darkOrb, skyFall, after, flatDir, inArc, hurtPlayer, playerAlive, DARK, campK } from './attacks.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();

// ---- movement helpers ----------------------------------------------------------------------------------------------
function distP(e) { const P = G.player; return P ? Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) : 1e9; }
export function moveToward(e, x, z, speed, dt, stop = 0.2) {
  const dx = x - e.pos.x, dz = z - e.pos.z, d = Math.hypot(dx, dz);
  if (d <= stop) { e.move.set(0, 0, 0); return d; }
  const s = speed * e.slow * e.speedMul;
  e.move.set(dx / d * s, 0, dz / d * s);
  e.face(x, z, dt, 7);
  return d;
}
/** Circle the player at radius r (dir = ±1), easing toward that radius. */
export function circle(e, r, speed, dt, dir = 1) {
  const P = G.player;
  const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.max(0.01, Math.hypot(dx, dz));
  const rx = dx / d, rz = dz / d;
  const tx = -rz * dir, tz = rx * dir;
  const pull = clamp((d - r) * 0.6, -1, 1);
  const s = speed * e.slow * e.speedMul;
  e.move.set((tx - rx * pull) * s, 0, (tz - rz * pull) * s);
  e.face(P.pos.x, P.pos.z, dt, 8);
}
function fleeFrom(e, x, z, speed, dt) {
  const dx = e.pos.x - x, dz = e.pos.z - z, d = Math.max(0.01, Math.hypot(dx, dz));
  e.move.set(dx / d * speed, 0, dz / d * speed);
  e.face(e.pos.x + dx, e.pos.z + dz, dt, 9);
}
function wander(e, dt, speed = 1.2) {
  const D = e.data;
  D.wt = (D.wt ?? 0) - dt;
  if (D.wt <= 0 || !D.wp) {
    D.wt = 2.5 + Math.random() * 4;
    const r = (e.camp?.r ?? 6) * 0.8, a = Math.random() * TAU;
    D.wp = { x: e.home.x + Math.cos(a) * r * Math.random(), z: e.home.z + Math.sin(a) * r * Math.random(), rest: Math.random() < 0.45 };
  }
  if (D.wp.rest) { e.move.set(0, 0, 0); return; }
  if (moveToward(e, D.wp.x, D.wp.z, speed, dt, 0.5) <= 0.5) D.wp.rest = true;
}
function anim(e, moving, run = false) {
  if (e.atk || e.stunT > 0) return;
  if (e.cr?.busy) return;
  e.playState(moving ? (run ? 'run' : 'move') : (e.fly ? 'fly' : 'idle'));
}
/** Shared front matter of every brain: aggro, leash, flee from bright sun. Returns 'busy' | 'idle' | 'fight'. */
function common(e, dt) {
  const P = G.player;
  if (!playerAlive() || G.mode !== 'play') { e.move.set(0, 0, 0); anim(e, false); return 'busy'; }
  if (e.stepAttack(dt)) return 'busy';
  const d = distP(e);
  const sight = (e.def.sight ?? 14) * (1 + 0.3 * e.veil);
  if (!e.aggro && (d < sight || G.time.t - e.lastHitT < 0.5)) { e.aggro = true; e.cd = Math.max(e.cd, 1.2 + Math.random() * 1.6); e.onAggro?.(); } // fix2: staggered first strikes
  if (e.aggro && !e.persistent && !e.boss && e.camp && Math.hypot(P.pos.x - e.home.x, P.pos.z - e.home.z) > (e.camp.r ?? 8) + 34) {
    e.aggro = false; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.5);
  }
  if (e.fleeT > 0 && e.material === 'shade' && !e.def.brave) {
    fleeFrom(e, P.pos.x, P.pos.z, (e.def.speed ?? 3) * 1.4, dt); anim(e, true, true); return 'busy';
  }
  if (!e.aggro) { wander(e, dt, (e.def.speed ?? 2) * 0.45); anim(e, e.move.lengthSq() > 0.05); return 'idle'; }
  return 'fight';
}
function headPos(e, out, up = 0.8) { return out.set(e.pos.x + Math.sin(e.yaw) * e.radius * 0.8, e.pos.y + e.height * up, e.pos.z + Math.cos(e.yaw) * e.radius * 0.8); }

// ---- the types -----------------------------------------------------------------------------------------------------
export const TYPES = {
  paper: {
    asset: 'mon_ghost', primitive: makeHitogata, scale: 0.62, tint: 'paper', material: 'paper', hp: 24, radius: 0.4, height: 0.9, fly: true, hover: 0.7, bob: 0.12,
    speed: 3.4, sight: 11, flammable: 1, burnTime: 2, burnDps: 45, mult: { fire: 3, wind: 2 }, drops: { stardust: [1, 2], heart: 0.08 },
    clips: { fly: 'Flying_Idle', move: 'Fast_Flying', attack: 'Headbutt', hit: 'HitReact', death: 'Death' }, dissolve: 0xfff1c4,
    think(e, dt) {
      const s = common(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      e.cd -= dt;
      if (d < 4.2 && e.cd <= 0) {
        e.cd = 1.6 + Math.random() * 1.2;
        e.attack('slap', 0.55, 0.6, (en) => {
          flatDir(en.pos, P.pos, _d);
          en.vel.addScaledVector(_d, 11);
          after(0.18, () => melee(en, 1.6, 1.2, 6, { burst: 'hit_wind', color: 0xfff1c4, knock: 3 }), en);
          en.playState('attack', { once: true });
        }, { tell: (en) => { en.data.dy = 0.6; G.audio?.sfx('paper', { pos: en.pos, vol: 0.6, pitch: 1.4 }); G.fx?.burst('hit_wind', en.pos, { scale: 0.4, color: 0xfff1c4 }); },
          during: (en, a) => { en.face(P.pos.x, P.pos.z, dt, 10); en.yaw += Math.sin(a.t * 60) * 0.05; if (a.fired) en.data.dy = 0; } });
        return;
      }
      circle(e, 3.2, e.def.speed, dt, e.id % 2 ? 1 : -1);
      if (d > 7) moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 3);
      anim(e, true);
    },
  },

  blob: {
    asset: 'mon_slime', primitive: makeJelly, scale: 1.5, tint: 'shade', hp: 60, radius: 0.6, height: 0.85, speed: 1.7, sight: 12, drops: { stardust: [2, 3], heart: 0.1 },
    clips: { idle: 'Slime_Idle', move: 'Slime_Walk', attack: 'Slime_Attack', death: 'Slime_Death' },
    think(e, dt) {
      const s = common(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      e.cd -= dt;
      if (d < 6.5 && e.cd <= 0 && e.grounded) {
        e.cd = 2.6 + Math.random();
        const target = new THREE.Vector3(P.pos.x, P.pos.y, P.pos.z);
        e.attack('hop', 0.75, 0.7, (en) => {
          const dx = target.x - en.pos.x, dz = target.z - en.pos.z, dd = Math.max(0.1, Math.hypot(dx, dz));
          const T = 0.62;
          en.vel.set(dx / T, 22 * T * 0.5, dz / T);
          en.cr?.play('attack', { once: true, speed: 1.2 });
          en.data.landing = true;
          after(T, () => { en.data.landing = false; shockwave(en, en.pos, 2.2, 12, { burst: 'hit_dark', shake: 0.15, knock: 5 }); G.audio?.sfx('slime', { pos: en.pos }); }, en);
        }, { tell: (en) => { warnAt(target, 2.2, 0.75 + 0.62); G.audio?.sfx('slime', { pos: en.pos, vol: 0.6, pitch: 0.8 }); },
          during: (en, a) => { if (!a.fired && en.cr) en.cr.model.scale.y = en.cr.model.scale.x * (1 - 0.3 * clamp(a.t / a.windup)); else if (en.cr) en.cr.model.scale.y = en.cr.model.scale.x; },
          cancel: (en) => { if (en.cr) en.cr.model.scale.y = en.cr.model.scale.x; } });
        return;
      }
      moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 1.8);
      anim(e, d > 1.8);
    },
    onDamaged(e, amount, info) {
      if (e.data.gen >= 1 || e.data.split || e.dead || info.element === 'sun' || info.element === 'fire') return;
      if (e.hp > e.maxHp * 0.65 || e.hp <= 6) return;
      e.data.split = true;
      const hp = Math.max(8, Math.round(e.hp * 0.55));
      for (const s of [-1, 1]) {
        _v.set(e.pos.x + Math.cos(e.yaw) * 0.9 * s, e.pos.y + 0.3, e.pos.z - Math.sin(e.yaw) * 0.9 * s);
        const c = G.combat?.spawn('blob_small', _v, { aggro: true, hp, camp: e.camp, persistent: e.persistent, wave: e.wave });
        if (c) { c.data.gen = 1; c.vel.set(Math.cos(e.yaw) * 4 * s, 6, -Math.sin(e.yaw) * 4 * s); }
      }
      G.fx?.burst('hit_dark', e.centerOut(_w), { scale: 1.5 });
      G.audio?.sfx('slime', { pos: e.pos, pitch: 1.2 });
      G.combat?.kill(e, 'split', { silent: true });
    },
  },

  wolf: {
    asset: 'ani_wolf', scale: 1.3, tint: 'shade', hp: 70, radius: 0.55, height: 1.0, speed: 6.5, sight: 16, drops: { stardust: [2, 4], heart: 0.12 },
    clips: { idle: 'Idle', move: 'Walk', run: 'Gallop', attack: 'Attack', hit: 'Idle_HitReact_Left', death: 'Death', leap: 'Gallop_Jump' },
    think(e, dt) {
      const s = common(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      e.cd -= dt;
      let pack = 0;
      const L = G.combat?.enemies || [];
      for (let i = 0; i < L.length; i++) if (L[i] !== e && L[i].type === 'wolf' && L[i].atk && !L[i].dead) pack++;
      if (d < 11 && d > 3 && e.cd <= 0 && pack === 0) {
        e.cd = 3 + Math.random() * 1.5;
        const target = new THREE.Vector3();
        e.attack('lunge', 0.7, 0.8, (en) => {
          flatDir(en.pos, target, _d);
          const dist = Math.min(13, Math.hypot(target.x - en.pos.x, target.z - en.pos.z) + 2);
          const T = dist / 16;
          en.vel.set(_d.x * 16, 5.5, _d.z * 16);
          en.yaw = Math.atan2(_d.x, _d.z);
          en.cr?.play('leap', { once: true, speed: 1.3, next: 'run' });
          en.data.bite = T + 0.1;
          G.audio?.sfx('growl', { pos: en.pos, pitch: 1.2 });
        }, { tell: (en) => {
          target.set(P.pos.x, P.pos.y, P.pos.z);
          warnAt(target, 1.4, 0.75, 0xff3b6b);
          en.centerOut(_v); headPos(en, _v, 0.75);
          G.fx?.burst('charge_done', _v, { color: PAL.shadeEye, scale: 0.6 });
          G.audio?.sfx('growl', { pos: en.pos });
          en.cr?.play('idle', { fade: 0.1 });
        }, during: (en, a) => { if (!a.fired) { en.face(target.x, target.z, dt, 12); if (en.cr) en.cr.model.position.y = -0.12 * clamp(a.t / a.windup); } else if (en.cr) en.cr.model.position.y = 0; },
          cancel: (en) => { if (en.cr) en.cr.model.position.y = 0; } });
        return;
      }
      if (e.data.bite > 0) {
        e.data.bite -= dt;
        if (inArc(e, 1.7, 1.0)) { e.data.bite = 0; hurtPlayer(e, 14, { knock: 6 }); G.fx?.burst('hit_dark', P.pos.clone().setY(P.pos.y + 1), { scale: 1 }); }
        return;
      }
      if (d > 12) moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 8);
      else circle(e, 7, e.def.speed * 0.7, dt, e.id % 2 ? 1 : -1);
      anim(e, true, true);
    },
  },

  moth: {
    asset: 'mon_bat', scale: 1.05, tint: 'shade', eyeColor: 0xffb0ff, hp: 45, radius: 0.55, height: 0.7, fly: true, hover: 3.2, bob: 0.25,
    speed: 4, sight: 18, drops: { stardust: [2, 3], heart: 0.08 }, flammable: 0.8, burnDps: 14,
    clips: { idle: 'Bat_Flying', fly: 'Bat_Flying', move: 'Bat_Flying', attack: 'Bat_Attack', hit: 'Bat_Hit', death: 'Bat_Death' },
    think(e, dt) {
      const s = common(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      // moth to a flame: anything burning nearby draws it in
      const D = e.data;
      D.flameT = (D.flameT ?? 0) - dt;
      if (D.flameT <= 0) {
        D.flameT = 1;
        D.flame = G.elements?.nearest ? G.elements.nearest(e.pos, 16, (r) => r.burning > 0 && r.owner !== e && r.kind !== 'creature') : null;
      }
      if (D.flame && D.flame.burning > 0 && !e.atk) {
        moveToward(e, D.flame.pos.x, D.flame.pos.z, e.def.speed, dt, 0.6);
        D.dy = Math.max(-2.2, (D.flame.pos.y + 1.5) - (G.world.groundAt(e.pos.x, e.pos.z) + e.hover));
        return;
      }
      D.dy = 0;
      e.cd -= dt;
      if (d < 20 && e.cd <= 0) {
        e.cd = 2.2 + Math.random() * 1.4;
        e.attack('orb', 0.65, 0.4, (en) => {
          headPos(en, _o, 0.6);
          darkOrb(en, _o, P, { speed: 11, damage: 10, turn: 0.6, size: 0.45 });
          en.playState('attack', { once: true });
        }, { tell: (en) => { headPos(en, _o, 0.6); G.fx?.burst('charge_done', _o, { color: DARK, scale: 0.6 }); G.audio?.sfx('wing_flap', { pos: en.pos, pitch: 1.3 }); },
          during: (en) => en.face(P.pos.x, P.pos.z, dt, 10) });
        return;
      }
      circle(e, 10, e.def.speed, dt, e.id % 2 ? 1 : -1);
      anim(e, true);
    },
  },

  wisp: {
    asset: null, primitive: () => (G.params?.crv === '1' ? makeWispMesh() : makeWispFlame(haloMat())), tint: null, castShadow: false, blobRadius: 0.35, hp: 30, radius: 0.45, height: 0.9, fly: true, hover: 1.3,
    bob: 0.2, speed: 2.4, sight: 14, immune: ['fire'], mult: { water: 4, sun: 1 }, drops: { stardust: [1, 3] }, noFlee: true, dissolve: 0xc87bff,
    onSpawn(e) {
      const em = G.fx?.emitter?.('flame', { color: 0xb070ff, scale: 0.55 });
      if (em) { e.data.em = em; e.own(() => em.remove()); }
    },
    think(e, dt) {
      if (e.data.em) { e.centerOut(e.data.em.pos); e.data.em.active = !e.dead; }
      const core = e.cr?.model;
      if (core) { const p = 1 + Math.sin(G.time.t * 7 + e.id) * 0.06 + (e.atk ? 0.35 * clamp(e.atk.t / e.atk.windup) : 0); core.scale.setScalar(p); }
      const s = common(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      if (d < 3.4) {
        e.attack('burst', 1.0, 0.1, (en) => {
          en.centerOut(_v);
          G.elements?.apply('fire', _v, 2.2, 1.2, { source: en, team: 'enemy', damage: 0, noGround: true }); // fix2: no grass fire
          G.fx?.burst('explosion', _v, { color: 0xb070ff, scale: 1.1 });
          G.audio?.sfx('explosion', { pos: _v });
          shockwave(en, _v, 3.4, 18, { color: 0xff7a2a, burst: 'hit_fire', jumpable: false, knock: 7, shake: 0.3 });
          G.combat?.kill(en, 'self', { silent: false, noDrop: true });
        }, { tell: (en) => { warnAt(en.pos, 3.4, 1.0, 0xff7a2a); G.audio?.sfx('ignite', { pos: en.pos }); },
          during: (en) => { if (en.data.em) en.data.em.rate = 3; } });
        return;
      }
      moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 2.5);
    },
  },

  golem: {
    // body: the sculpted rock golem on this skeleton (combat/golem-body.js) while it is in use, else the pack golem in 'stone'
    get primitive() { return rockGolemOn() ? makeRockGolem : null; },
    asset: 'mon_golem_big', scale: 0.72, tint: 'stone', eyeColor: PAL.glowCyan, material: 'stone', hp: 220, radius: 1.0, height: 2.6, speed: 2.0, sight: 16,
    brave: true, heavy: true, armor: 110, drops: { stardust: [5, 8], heart: 0.5 }, mult: { wind: 0.4 },
    clips: { idle: 'Idle', move: 'Walk', run: 'Run', attack: 'Attack', hit: 'HitRecieve', death: 'Death' },
    onSpawn(e) {
      e.armor = e.def.armor;
      // the sculpted body carries its crystal crown (pooled bodies come back with it hidden by the last armour break)
      const crown = e.view?.getObjectByName?.('GolemShards');
      if (crown) { crown.visible = true; e.data.shards = crown; return; }
      const g = new THREE.Group();
      const m = glow(0x9fd8ff, 2.2), m2 = toon(0x5a7dff, { emissive: 0x1b2a6a });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        const h = 0.35 + (i % 3) * 0.18;
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.16, h, 5), i % 2 ? m : m2);
        shard.position.set(Math.cos(a) * 0.55, 2.05 + Math.sin(a * 2) * 0.12, -0.15 + Math.sin(a) * 0.35);
        shard.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.5);
        g.add(shard);
      }
      e.view.add(g);
      e.data.shards = g;
      e.own(() => { g.parent?.remove(g); g.traverse((o) => o.geometry?.dispose()); });
    },
    onDamaged(e, amount, info) {
      if (!(e.armor > 0)) return;
      const breaker = info.element === 'thunder' || info.element === 'earth' || info.shatter || info.heavy;
      e.armor -= amount * (breaker ? 2.5 : 0.25) + (G.time.t - (e._shatterT ?? -9) < 0.05 ? 45 : 0);
      if (e.armor <= 0) {
        e.armor = 0;
        e.centerOut(_v); _v.y += 0.6;
        G.fx?.burst('shatter_rock', _v, { scale: 1.6 });
        G.fx?.burst('shatter_ice', _v, { scale: 1.2, color: 0x9fd8ff });
        G.audio?.sfx('shatter_crystal', { pos: _v });
        G.fx?.text?.(_v, t('combat.armorBreak'), { color: 0x9fd8ff, size: 1.2 });
        if (e.data.shards) e.data.shards.visible = false;
        e.stun(1.6);
        G.hitstop(0.08);
      }
    },
    damageScale(e, info) {
      if (!(e.armor > 0)) return 1;
      return info.element === 'thunder' || info.element === 'earth' || info.shatter ? 0.8 : 0.3;
    },
    think(e, dt) {
      const s = common(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      e.cd -= dt;
      if (d < 5.2 && e.cd <= 0) {
        e.cd = 3.4 + Math.random();
        e.attack('slam', 1.15, 1.1, (en) => {
          shockwave(en, en.pos, 5.4, 22, { burst: 'shatter_rock', shake: 0.5, knock: 9, impulse: 12, color: 0x9fd8ff });
          G.fx?.burst('crater', en.pos, { scale: 0.45 });
          G.audio?.sfx('quake', { pos: en.pos });
          G.hitstop(0.05);
        }, { tell: (en) => { warnAt(en.pos, 5.4, 1.15, 0x9fd8ff); en.cr?.play('attack', { once: true, speed: 0.75 }); G.audio?.sfx('rumble', { pos: en.pos, vol: 0.7 }); },
          during: (en) => en.face(P.pos.x, P.pos.z, dt, 3) });
        return;
      }
      if (d > 9 && d < 22 && e.cd <= 0) {
        e.cd = 5 + Math.random() * 2;
        e.attack('shards', 0.9, 1.2, (en) => {
          for (let i = 0; i < 3; i++) {
            _v.set(P.pos.x + (Math.random() - 0.5) * 5, P.pos.y, P.pos.z + (Math.random() - 0.5) * 5);
            if (i === 0) _v.copy(P.pos);
            skyFall(en, _v, { delay: 1.0 + i * 0.25, radius: 2, damage: 12, color: 0x9fd8ff });
          }
        }, { tell: (en) => { headPos(en, _o, 1); G.fx?.burst('charge_done', _o, { color: 0x9fd8ff, scale: 1.2 }); G.audio?.sfx('crystal', { pos: en.pos }); } });
        return;
      }
      moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 3.5);
      anim(e, d > 3.5);
    },
  },

  caster: {
    humanoid: true, asset: 'char_villager_c', tint: 'shade', hp: 140, radius: 0.45, height: 1.7, speed: 3.4, sight: 20, material: 'shade',
    drops: { stardust: [4, 7], heart: 0.5 }, brave: false,
    onSpawn(e) {
      const els = ['fire', 'ice', 'thunder', 'wind'];
      e.data.el = e.opts.element || els[e.id % els.length];
      e.dir = new THREE.Vector3(0, 0, 1);
      const aura = G.fx?.emitter?.('aura_moon', { color: DARK, scale: 0.7 });
      if (aura) { e.data.aura = aura; e.own(() => aura.remove()); }
    },
    think(e, dt) {
      e.dir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
      if (e.data.aura) e.data.aura.pos.copy(e.pos);
      if (e.data.guard) { e.data.guardT -= dt; if (e.data.guardT <= 0 || e.stunT > 0) { try { e.data.guard.stop?.(); } catch (er) { /* ignore */ } e.data.guard = null; e.actor?.stop('upper', 0.15); } }
      const s = common(e, dt); if (s !== 'fight') { anim(e, e.move.lengthSq() > 0.05); return; }
      const P = G.player, d = distP(e);
      e.cd -= dt;
      // guard against an incoming player bolt
      e.data.gcd = (e.data.gcd ?? 0) - dt;
      if (e.data.gcd <= 0 && !e.data.guard && incoming(e, 9)) {
        e.data.gcd = 4.5;
        try { e.data.guard = G.spells?.cast('guard', 'small', { caster: e, team: 'enemy', dir: e.dir }) || null; } catch (er) { e.data.guard = null; }
        e.data.guardT = 1.1;
        e.actor?.play('guard', { layer: 'upper' });
      }
      if (e.cd <= 0 && d < 24 && !e.data.guard) {
        const useEl = Math.random() < 0.4;
        e.cd = useEl ? 3.4 : 2.4 + Math.random();
        e.attack(useEl ? 'element' : 'volley', useEl ? 0.9 : 0.6, 0.5, (en) => {
          en.actor?.play('cast_throw', { layer: 'upper' });
          headPos(en, _o, 0.72);
          if (useEl) {
            try { G.spells?.cast(en.data.el, 'small', { caster: en, origin: _o.clone(), dir: flatDir(en.pos, P.pos, _d).clone(), target: P, point: P.pos.clone(), team: 'enemy', power: 0.42 * en.atkMul * campK(en) }); } // fix2: player-book damage (thunder 35) was tuned for 140-hp foes
            catch (er) { G.reportError('combat:caster', er); }
          } else for (let i = 0; i < 3; i++) after(i * 0.18, () => { if (!en.dead) { headPos(en, _o, 0.72); darkOrb(en, _o, P, { speed: 12, damage: 9, turn: 0.5, size: 0.42 }); } }, en);
        }, { tell: (en) => {
          en.actor?.play('cast_raise', { layer: 'upper' });
          G.fx?.sigil?.(en.pos, { color: useEl ? (G.fx?.elementColor?.(en.data.el, DARK) ?? DARK) : DARK, radius: 1.3, dur: 0.9 });
          G.audio?.sfx('charge', { pos: en.pos, vol: 0.6 });
        }, during: (en) => en.face(P.pos.x, P.pos.z, dt, 10) });
        return;
      }
      if (d > 14) moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 10);
      else if (d < 7) fleeFrom(e, P.pos.x, P.pos.z, e.def.speed * 0.8, dt);
      else circle(e, 10, e.def.speed * 0.6, dt, (Math.floor(G.time.t / 4) + e.id) % 2 ? 1 : -1);
      e.face(P.pos.x, P.pos.z, dt, 8);
      if (e.actor && !e.actor.busy) e.actor.play(e.move.lengthSq() > 0.2 ? 'walk' : 'shade_idle');
      e.actor?.setGroundSpeed?.(Math.hypot(e.move.x, e.move.z));
    },
  },
};
TYPES.blob_small = Object.assign({}, TYPES.blob, { scale: 1.0, hp: 30, radius: 0.42, height: 0.58, speed: 2.4, drops: { stardust: [1, 1] }, onDamaged: null });

/** Is a hostile (player-side) projectile closing in on e within range? */
export function incoming(e, range) {
  const list = G.spells?.projectiles;
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.alive || p.team === 'enemy') continue;
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d > range || d < 0.5) continue;
    if ((p.vel.x * dx + p.vel.z * dz) / (d * Math.max(0.1, Math.hypot(p.vel.x, p.vel.z))) > 0.85) return true;
  }
  return false;
}

// ---- 鬼火 body: a violet flame core with two pale eyes (no model needed) -------------------------------------------
let wispGeo = null;
function makeWispMesh() {
  if (!wispGeo) wispGeo = { core: new THREE.IcosahedronGeometry(0.32, 2), halo: new THREE.SphereGeometry(0.5, 14, 10), eye: new THREE.SphereGeometry(0.055, 8, 6) };
  const g = new THREE.Group();
  const core = new THREE.Mesh(wispGeo.core, glow(0xd7a8ff, 2.6));
  const halo = new THREE.Mesh(wispGeo.halo, haloMat());
  core.position.y = 0.55; halo.position.y = 0.55;
  g.add(core, halo);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(wispGeo.eye, glow(0xffffff, 3)); eye.position.set(0.11 * s, 0.6, 0.29); g.add(eye); }
  return g;
}
let _halo = null;
function haloMat() {
  if (!_halo) { _halo = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a3cff).multiplyScalar(1.4), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); _halo.userData.shared = true; }
  return _halo;
}

export { distP, common, anim, headPos, fleeFrom, wander };
