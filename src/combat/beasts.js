// The wild side of the journey bestiary. installBeasts(TYPES) re-skins the engine's base foes for the Wandering-Witch
// borderlands and adds the new ones. Every foe asks for a different answer:
//   paper     流浪书页   — stray grimoire pages: flutter, paper-cut darts; any fire ends them
//   blob      泥沼团     — bog mud: splits when struck, fire bakes it hard, then earth / thunder / a heavy hit shatters it
//   wolf      荒原狼     — packs: one baits in front while the others flank behind; fire scares them, wind scatters them
//   moth      啄星蝠     — harries broom riders, dives and nibbles mana; wind tumbles it out of the sky, thunder chains
//   wisp      迷路的灯火 — drifts in and bursts into flame; water / wind snuff it
//   golem     隘口石卫   — stone shell (thunder / earth crack it), slams, rock barrages
//   froststag 霜角鹿     — ice ward only fire breaks; charges, frost stomps, ice lances
//   embersnake 余烬蛇    — fire ward only water breaks; lobbed fire, coiled bites, a ring of flame
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp, TAU } from '../core/util.js';
import { moveToward, circle, fleeFrom, wander, anim, headPos, distP } from './types.js';
import { warnAt, melee, shockwave, after, flatDir, inArc, hurtPlayer, playerAlive } from './attacks.js';
import { addWard } from './wards.js';
import { makePages, flapPages, makeMud, makeLostFlame, addFrostCrown } from './bodies.js';
import { bolt, volley, rockBarrage, EL_COL } from './patterns.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();

// ---- shared front matter ------------------------------------------------------------------------------------------------
/**
 * Aggro, calm, leash, fear. Returns 'busy' | 'idle' | 'fight'.
 * - calm (story scenes, G.combat.calm): stop, forget the heroine, drift home.
 * - ground foes do not aggro on a heroine flying high above them (they watch her pass).
 * - a foe of a camp gives up 40 m past its camp and walks home, healing.
 */
export function front(e, dt) {
  const P = G.player, C = G.combat;
  if (!playerAlive() || G.mode !== 'play') { e.move.set(0, 0, 0); anim(e, false); return 'busy'; }
  if (e.data.leaving) return 'busy';   // ambushers flying off (encounters steers them)
  if (C?.calm && !e.boss && !e.ignoreCalm) { e.aggro = false; if (e.atk) e.stopAttack(); wander(e, dt, (e.def.speed ?? 2) * 0.4); anim(e, e.move.lengthSq() > 0.05); return 'idle'; }
  if (e.stepAttack(dt)) return 'busy';
  // a steam cloud hides her: nobody new finds her in it, and those who had her lose her after a moment
  if (G.elements?.concealedAt?.(P.pos)) {
    if (!e.aggro && !e.data.seek) { wander(e, dt, (e.def.speed ?? 2) * 0.4); anim(e, e.move.lengthSq() > 0.05); return 'idle'; }
    // lost her: search around the spot she was last seen at, then give up
    if (e.aggro) { e.aggro = false; e.stopAttack(); e.data.seek = { x: P.pos.x + (Math.random() - 0.5) * 5, z: P.pos.z + (Math.random() - 0.5) * 5, t: 4 }; }
    const sk = e.data.seek;
    sk.t -= dt;
    if (sk.t <= 0 || moveToward(e, sk.x, sk.z, (e.def.speed ?? 2) * 0.55, dt, 0.8) <= 0.8) { if (sk.t <= 0) e.data.seek = null; else e.move.set(0, 0, 0); }
    anim(e, e.move.lengthSq() > 0.05);
    return 'idle';
  }
  e.data.seek = null;
  const d = distP(e);
  const up = P.pos.y - e.pos.y;
  const sight = e.def.sight ?? 14;
  const reach = e.fly || e.def.ranged ? 30 : 11;
  if (!e.aggro && ((d < sight && up < reach) || G.time.t - e.lastHitT < 0.5)) {
    e.aggro = true; e.cd = Math.max(e.cd, 1.0 + Math.random() * 1.4); e.onAggro?.();
    G.events.emit('enemy:aggro', { enemy: e });
  }
  const home = e.camp || e.data.leash;
  if (e.aggro && !e.persistent && !e.boss && home && Math.hypot(P.pos.x - e.home.x, P.pos.z - e.home.z) > (home.r ?? 8) + 40) {
    e.aggro = false; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.5);
  }
  if (e.fearT > 0) {
    e.fearT -= dt;
    fleeFrom(e, P.pos.x, P.pos.z, (e.def.speed ?? 3) * 1.25, dt); anim(e, true, true); return 'busy';
  }
  if (!e.aggro) {
    if (Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z) > (e.camp?.r ?? 8) * 1.6) { moveToward(e, e.home.x, e.home.z, (e.def.speed ?? 2) * 0.6, dt, 1); anim(e, true); }
    else { wander(e, dt, (e.def.speed ?? 2) * 0.4); anim(e, e.move.lengthSq() > 0.05); }
    return 'idle';
  }
  return 'fight';
}
/** Fear of fire for beasts: a fire hit or a blaze at their paws sends them running for a moment. */
function scare(e, sec = 2.2) {
  if (e.fearT > 0.5 || e.elite || G.time.t < (e._braveT ?? -1)) return;
  e.fearT = sec;
  e._braveT = G.time.t + sec + 6;   // it comes back angrier: no new scare for 6 s (fire buys time, it does not end the fight)
  e.stopAttack();
  if (G.time.t - (e._fearTxt || -9) > 5) { e._fearTxt = G.time.t; G.fx?.text?.(_v.set(e.pos.x, e.pos.y + e.height + 0.5, e.pos.z), t('combat.fear'), { color: 0xffb070, size: 0.85 }); }
  G.audio?.sfx('growl', { pos: e.pos, pitch: 1.6, vol: 0.6 });
}
function hasteDt(e, dt) { return dt * (e.haste || 1); }

// ---- the defs ---------------------------------------------------------------------------------------------------------
export function installBeasts(TYPES) {
  // 流浪书页 — stray pages
  TYPES.paper = {
    asset: null, primitive: makePages, scale: 1.45, tint: null, castShadow: true, blobRadius: 0.45, material: 'paper', hp: 110, radius: 0.5, height: 1.9, fly: true, hover: 0.35,
    bob: 0.16, speed: 3.8, sight: 12, flammable: 1, burnTime: 2.5, burnDps: 30, mult: { fire: 3, wind: 2 }, drops: { stardust: [1, 3], heart: 0.05 }, poise: 40,
    dissolve: 0xfff1c4, ranged: true,
    think(e, dt) {
      flapPages(e, G.time.t, e.atk ? 1 : 0.35);
      const s = front(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      e.cd -= hasteDt(e, dt);
      if (d < 4 && e.cd <= 0) {
        e.cd = 1.7 + Math.random() * 1.2;
        e.attack('slap', 0.5, 0.6, (en) => {
          flatDir(en.pos, P.pos, _d);
          en.vel.addScaledVector(_d, 11);
          after(0.18, () => melee(en, 1.6, 1.2, 6, { burst: 'hit_wind', color: 0xfff1c4, knock: 3 }), en);
        }, { tell: (en) => { en.data.dy = 0.5; G.audio?.sfx('paper', { pos: en.pos, vol: 0.6, pitch: 1.4 }); },
          during: (en, a) => { en.face(P.pos.x, P.pos.z, dt, 10); if (a.fired) en.data.dy = 0; } });
        return;
      }
      if (d >= 4 && d < 13 && e.cd <= 0) {
        // paper cuts: three cream darts flicked off the leaves
        e.cd = 2.6 + Math.random();
        e.attack('cuts', 0.55, 0.4, (en) => {
          volley({ owner: en, team: 'enemy', alive: () => !en.dead, dmgK: en.atkMul, hand: (o) => o.set(en.pos.x, en.pos.y + 0.95, en.pos.z) }, P,
            { n: 3, fan: 0.35, gap: 0.07, el: 'wind', color: 0xfff1c4, speed: 16, size: 0.18, damage: 4, turn: 0.2 });
        }, { tell: (en) => { G.fx?.burst('charge_done', _v.set(en.pos.x, en.pos.y + 0.95, en.pos.z), { color: 0xffe0a0, scale: 0.45 }); } });
        return;
      }
      circle(e, 3.4, e.def.speed, dt, e.id % 2 ? 1 : -1);
      if (d > 7) moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 3);
    },
  };

  // 泥沼团 — bog mud
  TYPES.blob = {
    asset: null, primitive: makeMud, tint: null, material: 'flesh', hp: 240, radius: 0.62, height: 0.85, speed: 1.9, sight: 12, drops: { stardust: [2, 3], heart: 0.1 },
    poise: 95, dissolve: 0xc9a57a, mult: { earth: 1.3 },
    think(e, dt) {
      const D = e.data;
      if (D.bakedT > 0) {
        D.bakedT -= dt;
        e.slow = Math.min(e.slow, 0.35);
        if (D.bakedT <= 0) { const c = e.cr?.model?.userData.crust; if (c) c.visible = false; }
      }
      const s = front(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      e.cd -= hasteDt(e, dt) * (D.bakedT > 0 ? 0.35 : 1);
      if (d < 6.5 && e.cd <= 0 && e.grounded) {
        e.cd = 2.6 + Math.random();
        const target = new THREE.Vector3(P.pos.x, P.pos.y, P.pos.z);
        e.attack('hop', 0.75, 0.7, (en) => {
          const dx = target.x - en.pos.x, dz = target.z - en.pos.z;
          const T = 0.62;
          en.vel.set(dx / T, 22 * T * 0.5, dz / T);
          after(T, () => {
            // a splatter of mud: wet (thunder conducts through her now) and a little shove
            shockwave(en, en.pos, 2.3, 11, { burst: 'splash', shake: 0.14, knock: 5, color: 0xb08a5a, element: 'water', power: 0.4, noGround: true });
            G.audio?.sfx('slime', { pos: en.pos });
          }, en);
        }, { tell: (en) => { warnAt(target, 2.3, 0.75 + 0.62, 0xc9a57a); G.audio?.sfx('slime', { pos: en.pos, vol: 0.6, pitch: 0.8 }); } });
        return;
      }
      moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 1.8);
      anim(e, d > 1.8);
    },
    damageScale(e, info) {
      if (!(e.data.bakedT > 0)) return info.element === 'water' ? 0.4 : 1;
      return info.element === 'earth' || info.element === 'thunder' || info.heavy || info.shatter ? 2.6 : 0.6;
    },
    onDamaged(e, amount, info) {
      const D = e.data;
      if (e.dead) return;
      if (info.element === 'fire' && !(D.bakedT > 0)) {
        D.bakedT = 8;
        const c = e.cr?.model?.userData.crust; if (c) c.visible = true;
        G.fx?.burst('steam', e.centerOut(_v), { scale: 1 });
        G.fx?.text?.(_v.set(e.pos.x, e.pos.y + e.height + 0.4, e.pos.z), t('combat.baked'), { color: 0xf0c890, size: 0.85 });
        return;
      }
      if (info.element === 'water' && !(D.bakedT > 0)) { e.hp = Math.min(e.maxHp, e.hp + 8); return; }
      if (D.gen >= 1 || D.split || D.bakedT > 0 || info.dot) return;
      if (e.hp > e.maxHp * 0.65 || e.hp <= 6) return;
      D.split = true;
      const hp = Math.max(8, Math.round(e.hp * 0.55));
      for (const sgn of [-1, 1]) {
        _v.set(e.pos.x + Math.cos(e.yaw) * 0.9 * sgn, e.pos.y + 0.3, e.pos.z - Math.sin(e.yaw) * 0.9 * sgn);
        const c = G.combat?.spawn('blob_small', _v, { aggro: true, hp, camp: e.camp, persistent: e.persistent, wave: e.wave, noAppear: true });
        if (c) { c.data.gen = 1; c.vel.set(Math.cos(e.yaw) * 4 * sgn, 6, -Math.sin(e.yaw) * 4 * sgn); c.encounter = e.encounter; }
      }
      G.fx?.burst('splash', e.centerOut(_w), { scale: 1.4 });
      if (G.time.t - (G.combat._splitTip || -99) > 60) { G.combat._splitTip = G.time.t; G.fx?.text?.(_w.setY(e.pos.y + 1.6), t('combat.splitTip'), { color: 0xf0c890, size: 0.75, dur: 2 }); }
      G.audio?.sfx('slime', { pos: e.pos, pitch: 1.2 });
      G.combat?.kill(e, 'split', { silent: true });
    },
  };
  TYPES.blob_small = Object.assign({}, TYPES.blob, { scale: 0.62, hp: 75, radius: 0.42, height: 0.58, speed: 2.5, drops: { stardust: [1, 1] }, poise: 28, rally: false, onDamaged: TYPES.blob.onDamaged });

  // 荒原狼 — the pack
  TYPES.wolf = {
    asset: 'ani_wolf', scale: 1.6, tint: null, material: 'flesh', hp: 240, radius: 0.6, height: 1.15, speed: 7, sight: 18, drops: { stardust: [2, 4], heart: 0.12 },
    poise: 100, staggerT: 1.2, flammable: 0.5, burnDps: 8,
    clips: { idle: 'Idle', move: 'Walk', run: 'Gallop', attack: 'Attack', hit: 'Idle_HitReact_Left', death: 'Death', leap: 'Gallop_Jump' },
    onAggro() {},
    think(e, dt) {
      const D = e.data;
      if (e.burning && !(e.fearT > 0)) scare(e, 1.6);
      // a blaze at its paws
      D.fireT = (D.fireT ?? Math.random()) - dt;
      if (D.fireT <= 0) { D.fireT = 0.5; if (G.elements?.isBurningAt?.(e.pos.x, e.pos.z)) scare(e, 1.2); }
      const s = front(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      e.cd -= hasteDt(e, dt);
      if (D.bite > 0) {
        D.bite -= dt;
        if (inArc(e, 1.8, 1.0)) { D.bite = 0; hurtPlayer(e, 13, { knock: 6 }); G.fx?.burst('hit_earth', _v.copy(P.pos).setY(P.pos.y + 1), { scale: 0.9 }); }
        return;
      }
      // the pack: who is alive, who is the bait (lowest id), who is lunging
      const L = G.combat?.enemies || [];
      let bait = e, lunging = 0, n = 0, rank = 0;
      for (let i = 0; i < L.length; i++) {
        const o = L[i];
        if (o.dead || o.type !== 'wolf' || !o.aggro || (o.encounter || o.camp) !== (e.encounter || e.camp)) continue;
        n++;
        if (o.id < bait.id) bait = o;
        if (o.id < e.id) rank++;
        if (o !== e && (o.atk || o.data.bite > 0)) lunging++;
      }
      // her facing: the pack watches where she looks
      const fy = P.onBroom ? P.yaw : (G.cam ? G.cam.yaw + Math.PI : P.yaw);
      const fx = Math.sin(fy), fz = Math.cos(fy);
      const toE = flatDir(P.pos, e.pos, _d);
      const facing = toE.x * fx + toE.z * fz;   // 1 = in front of her eyes
      const isBait = bait === e || n < 2;
      // the bait strikes when she looks away — or when she has stared it down for 1.2 s with nothing happening
      if (e.cd <= 0 && lunging === 0) D.ready = (D.ready || 0) + dt; else D.ready = 0;
      if (e.cd <= 0 && lunging === 0 && d > 2.5 && d < 11 && (isBait ? facing < 0.55 || D.ready > 1.2 : facing < 0.2)) {
        e.cd = 2.8 + Math.random() * 1.4;
        const target = new THREE.Vector3();
        const quick = !isBait;   // a flanker strikes faster: the reason to keep turning
        e.attack('lunge', quick ? 0.5 : 0.7, 0.7, (en) => {
          flatDir(en.pos, target, _d);
          en.vel.set(_d.x * 16, 5.5, _d.z * 16);
          en.yaw = Math.atan2(_d.x, _d.z);
          en.cr?.play('leap', { once: true, speed: 1.3, next: 'run' });
          en.data.bite = Math.min(13, en.pos.distanceTo(target) + 2) / 16 + 0.1;
          G.audio?.sfx('growl', { pos: en.pos, pitch: 1.2 });
        }, { tell: (en) => {
          target.set(P.pos.x, P.pos.y, P.pos.z);
          warnAt(target, 1.4, quick ? 0.55 : 0.75, 0xff6a4a);
          headPos(en, _v, 0.75);
          G.fx?.burst('charge_done', _v, { color: 0xffb070, scale: 0.5 });
          G.audio?.sfx('growl', { pos: en.pos });
        }, during: (en, a) => { if (!a.fired) en.face(target.x, target.z, dt, 12); } });
        return;
      }
      if (D.leader && !D.howled) {
        D.howled = true;
        G.audio?.sfx('growl', { pos: e.pos, pitch: 0.7, vol: 1 });
        for (const o of L) if (o.type === 'wolf' && !o.dead && (o.encounter || o.camp) === (e.encounter || e.camp)) o.haste = Math.max(o.haste || 1, 1.2);
      }
      if (isBait) {
        // the bait holds her gaze at 7 m, sidestepping
        if (d > 10) moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 7);
        else circle(e, 7, e.def.speed * 0.45, dt, (Math.floor(G.time.t / 3) + e.id) % 2 ? 1 : -1);
      } else {
        // flankers run for the space behind her shoulders
        const side = rank % 2 ? 1 : -1, ang = fy + Math.PI + side * (0.75 + 0.25 * (rank >> 1));
        const tx = P.pos.x + Math.sin(ang) * 6.5, tz = P.pos.z + Math.cos(ang) * 6.5;
        moveToward(e, tx, tz, e.def.speed * (d > 14 ? 1 : 0.85), dt, 0.8);
        e.face(P.pos.x, P.pos.z, dt, 6);
      }
      anim(e, e.move.lengthSq() > 0.2, true);
    },
    onDamaged(e, amount, info) {
      if (e.dead) return;
      if (info.element === 'fire') scare(e, 1.6);
      if (info.element === 'wind' && info.dir) { _d.set(info.dir.x, 0, info.dir.z).normalize(); e.vel.addScaledVector(_d, 7); e.vel.y = Math.max(e.vel.y, 3); }
      if (e.data.leader && !e.data.called && e.hp < e.maxHp * 0.5) {
        e.data.called = true;
        G.audio?.sfx('growl', { pos: e.pos, pitch: 0.6, vol: 1 });
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * TAU;
          const w = G.combat?.spawn('wolf', _v.set(e.pos.x + Math.cos(a) * 18, NaN, e.pos.z + Math.sin(a) * 18), { aggro: true, camp: e.camp });
          if (w) w.encounter = e.encounter;
        }
      }
    },
  };

  // 啄星蝠 — broom harriers
  TYPES.moth = {
    asset: 'mon_bat', scale: 1.3, tint: null, material: 'flesh', hp: 220, radius: 0.55, height: 0.75, fly: true, hover: 3.4, bob: 0.25,
    speed: 7, sight: 22, drops: { stardust: [2, 3], heart: 0.06 }, flammable: 0.8, burnDps: 14, conductive: true, poise: 70, ranged: true, mult: { wind: 1.4 },
    clips: { idle: 'Bat_Flying', fly: 'Bat_Flying', move: 'Bat_Flying', attack: 'Bat_Attack', hit: 'Bat_Hit', death: 'Bat_Death' },
    think(e, dt) {
      const D = e.data;
      const s = front(e, dt); if (s !== 'fight') { D.dy = 0; return; }
      const P = G.player, d = distP(e);
      const gy = G.world.groundAt(e.pos.x, e.pos.z, e.pos.y + 1);
      const onBroom = P.onBroom;
      e.cd -= hasteDt(e, dt);
      if (D.dive > 0) {
        D.dive -= dt;
        e.move.copy(D.diveV);
        D.dy = (D.diveY - gy) - e.hover;
        e.pos.y += (D.diveY - e.pos.y) * Math.min(1, dt * 8);
        _v.set(P.pos.x, P.pos.y + 1, P.pos.z);
        if (!D.bit && e.centerOut(_w).distanceTo(_v) < 1.9) {
          D.bit = true;
          hurtPlayer(e, 6, { knock: 0 });
          // a nibble of her mana — never so much that the broom fails her
          if (P.mana > 30) P.mana = Math.max(30, P.mana - 7);
          G.fx?.burst('hit_wind', _v, { scale: 0.7 });
        }
        if (D.dive <= 0) e.cd = 1.8 + Math.random() * 1.6;
        return;
      }
      // follow her up: a rider is chased at her own height, a walker is circled from above
      const wantY = onBroom ? P.pos.y + 1.2 + Math.sin(G.time.t * 1.3 + e.id) * 1.5 : P.pos.y + 3.2;
      D.dy = clamp(wantY - gy - e.hover, -e.hover + 0.5, 60);
      if (e.cd <= 0 && d < (onBroom ? 16 : 11)) {
        const target = new THREE.Vector3();
        e.attack('dive', 0.5, 0.15, (en) => {
          target.set(P.pos.x + P.vel.x * 0.35, P.pos.y + 1, P.pos.z + P.vel.z * 0.35);
          _d.subVectors(target, en.pos); _d.y = 0;
          const len = Math.max(0.1, _d.length());
          en.data.diveV = new THREE.Vector3(_d.x / len * 22, 0, _d.z / len * 22);
          en.data.diveY = target.y - 0.4;
          en.data.dive = Math.min(0.8, (len + 4) / 22);
          en.data.bit = false;
          en.playState('attack', { once: true });
          G.audio?.sfx('wing_flap', { pos: en.pos, pitch: 1.6 });
        }, { tell: (en) => { headPos(en, _o, 0.6); G.fx?.burst('charge_done', _o, { color: 0xff8a6a, scale: 0.55 }); G.audio?.sfx('wing_flap', { pos: en.pos, pitch: 1.3, vol: 0.8 }); },
          during: (en) => en.face(P.pos.x, P.pos.z, dt, 12) });
        return;
      }
      if (onBroom) {
        // a loose swarm on her flank: they lag behind a cruising broom, so flying on is an answer too
        const off = (e.id % 5) * 1.3 - 2.6;
        const hx = Math.sin(P.yaw), hz = Math.cos(P.yaw);
        const tx = P.pos.x - hx * 5 + hz * off * 2, tz = P.pos.z - hz * 5 - hx * off * 2;
        moveToward(e, tx, tz, 13, dt, 0.5);
        e.face(P.pos.x, P.pos.z, dt, 8);
      } else circle(e, 8, e.def.speed * 0.8, dt, e.id % 2 ? 1 : -1);
      anim(e, true);
    },
    onDamaged(e, amount, info) {
      if (e.dead) return;
      // a gust tumbles it out of the air for a moment
      if (info.element === 'wind' || info.element === 'thunder') { e.stun(1.5); e.data.dive = 0; e.vel.y = -2; }
    },
  };

  // 迷路的灯火 — lost flames
  TYPES.wisp = {
    asset: null, primitive: makeLostFlame, tint: null, castShadow: false, blobRadius: 0.35, hp: 60, radius: 0.45, height: 0.95, fly: true, hover: 1.2,
    bob: 0.2, speed: 2.6, sight: 14, immune: ['fire'], mult: { water: 4, wind: 2 }, drops: { stardust: [1, 3] }, noFlee: true, dissolve: 0xffb060, poise: 10, rally: false,
    onSpawn(e) {
      const em = G.fx?.emitter?.('flame', { color: 0xffa040, scale: 0.5 });
      if (em) { e.data.em = em; e.own(() => em.remove()); }
    },
    think(e, dt) {
      if (e.data.em) { e.centerOut(e.data.em.pos); e.data.em.active = !e.dead; }
      const core = e.cr?.model;
      if (core) { const p = 1 + Math.sin(G.time.t * 7 + e.id) * 0.06 + (e.atk ? 0.4 * clamp(e.atk.t / e.atk.windup) : 0); core.scale.setScalar(p); }
      const s = front(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      if (d < 3.4 && Math.abs(P.pos.y - e.pos.y) < 3) {
        e.attack('burst', 1.0, 0.1, (en) => {
          en.centerOut(_v);
          G.elements?.apply('fire', _v, 2.2, 1.0, { source: en, team: 'enemy', damage: 0, noGround: true });
          G.fx?.burst('explosion', _v, { color: 0xffa040, scale: 1 });
          G.audio?.sfx('explosion', { pos: _v });
          shockwave(en, _v, 3.4, 16, { color: 0xff7a2a, burst: 'hit_fire', jumpable: false, knock: 7, shake: 0.28 });
          G.combat?.kill(en, 'self', { silent: false, noDrop: true });
        }, { tell: (en) => { warnAt(en.pos, 3.4, 1.0, 0xff7a2a); G.audio?.sfx('ignite', { pos: en.pos }); },
          during: (en) => { if (en.data.em) en.data.em.rate = 3; } });
        return;
      }
      moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 2.5);
      e.data.dy = clamp(P.pos.y - G.world.groundAt(e.pos.x, e.pos.z) - 0.2, 0, 20);
    },
  };

  // 隘口石卫 — the old stone guards of the pass
  const golem = TYPES.golem;
  golem.poise = 360; golem.staggerT = 1.8; golem.hp = 950; golem.armor = 320;
  golem.think = function (e, dt) {
    const s = front(e, dt); if (s !== 'fight') return;
    const P = G.player, d = distP(e);
    e.cd -= hasteDt(e, dt);
    if (d < 5.2 && e.cd <= 0) {
      e.cd = 3.2 + Math.random();
      e.attack('slam', 1.15, 1.1, (en) => {
        shockwave(en, en.pos, 5.4, 22, { burst: 'shatter_rock', shake: 0.5, knock: 9, impulse: 12, color: 0xd6c3a0 });
        G.fx?.burst('crater', en.pos, { scale: 0.45 });
        G.audio?.sfx('quake', { pos: en.pos });
        G.hitstop(0.05);
      }, { tell: (en) => { warnAt(en.pos, 5.4, 1.15, 0xd6c3a0); en.cr?.play('attack', { once: true, speed: 0.75 }); G.audio?.sfx('rumble', { pos: en.pos, vol: 0.7 }); },
        during: (en) => en.face(P.pos.x, P.pos.z, dt, 3) });
      return;
    }
    if (d > 5.2 && d < 26 && e.cd <= 0) {   // was > 7: a heroine kiting at 6 m left it standing idle
      e.cd = 4.2 + Math.random() * 1.6;
      e.attack('barrage', 0.8, 1.6, (en) => {
        rockBarrage({ owner: en, team: 'enemy', alive: () => !en.dead, dmgK: en.atkMul }, P, { n: 5, rise: 0.8, speed: 22, damage: 11, ring: 2.8 });
      }, { tell: (en) => { headPos(en, _o, 1); G.fx?.burst('charge_done', _o, { color: 0xd6c3a0, scale: 1.2 }); G.audio?.sfx('rumble', { pos: en.pos }); en.cr?.play('attack', { once: true, speed: 0.6 }); },
        during: (en) => en.face(P.pos.x, P.pos.z, dt, 4) });
      return;
    }
    moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 3.5);
    anim(e, d > 3.5);
  };
  golem.drops = { stardust: [6, 9], heart: 0.5 };

  // 霜角鹿 — frost stag
  TYPES.froststag = {
    asset: 'ani_stag', scale: 1.05, tint: 'paper', material: 'flesh', hp: 520, radius: 0.85, height: 2.2, speed: 4.6, sight: 18, immune: ['frozen'],
    drops: { stardust: [6, 9], heart: 0.4 }, poise: 210, staggerT: 1.6, mult: { fire: 1.3 },
    clips: { idle: 'Idle', move: 'Walk', run: 'Gallop', attack: 'Attack_Headbutt', kick: 'Attack_Kick', hit: 'Idle_HitReact_Left', death: 'Death', leap: 'Gallop_Jump' },
    onSpawn(e) {
      addWard(e, 'ice', Math.round(e.maxHp * 0.5), { regen: 14 });
      // a white stag: the sculpted coat carries its colour in the vertices, so the pale coat is set on its own clone
      e.cr?.model.traverse((o) => {
        if (!o.isMesh || o.userData.outline || !o.material || Array.isArray(o.material) || o.userData._frost) return;
        o.userData._frost = true;
        const m = o.material;
        if (m.vertexColors) { m.vertexColors = false; m.needsUpdate = true; }
        m.color?.set(0xdfeeff);
        if (m.emissive) m.emissive.set(0x18324a);
      });
      try { if (e.cr) e.data.crown = addFrostCrown(e.cr); } catch (err) { G.reportError('combat:crown', err); }
      const em = G.fx?.emitter?.('aura_ice', { color: 0xbfefff, scale: 0.7 });
      if (em) { e.data.aura = em; e.own(() => em.remove()); }
      e.own(() => { e.data.crown?.parent?.remove(e.data.crown); });
    },
    think(e, dt) {
      const D = e.data;
      if (D.aura) D.aura.pos.copy(e.pos);
      if (D.charge > 0) {
        D.charge -= dt;
        e.move.copy(D.chargeV);
        if (!D.hit && inArc(e, 2.0, 0.9)) { D.hit = true; hurtPlayer(e, 18, { knock: 9 }); G.fx?.burst('hit_ice', _v.copy(G.player.pos).setY(G.player.pos.y + 1), { scale: 1.1 }); }
        if (D.charge <= 0) { e.move.set(0, 0, 0); e.cd = 1.6; }
        anim(e, true, true);
        return;
      }
      const s = front(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      e.cd -= hasteDt(e, dt);
      if (e.cd <= 0 && d > 6 && d < 20 && Math.random() < 0.6) {
        e.cd = 4 + Math.random();
        const target = new THREE.Vector3();
        e.attack('charge', 0.85, 0.3, (en) => {
          flatDir(en.pos, target, _d);
          en.data.chargeV = new THREE.Vector3(_d.x * 17, 0, _d.z * 17);
          en.data.charge = Math.min(1.3, (en.pos.distanceTo(target) + 5) / 17);
          en.data.hit = false;
          en.yaw = Math.atan2(_d.x, _d.z);
          G.audio?.sfx('hit_earth', { pos: en.pos });
        }, { tell: (en) => {
          target.set(P.pos.x, P.pos.y, P.pos.z);
          flatDir(en.pos, target, _d);
          // the lane, marked with frost rings
          for (let k = 1; k <= 4; k++) { _v.copy(en.pos).addScaledVector(_d, k * 4); warnAt(_v, 1.3, 0.85, 0xbfefff); }
          en.cr?.play('kick', { once: true, speed: 0.8 });
          G.audio?.sfx('growl', { pos: en.pos, pitch: 0.8 });
        }, during: (en, a) => { if (!a.fired) en.face(target.x, target.z, dt, 10); } });
        return;
      }
      if (e.cd <= 0 && d < 6.5) {
        e.cd = 3.4 + Math.random();
        e.attack('stomp', 0.95, 0.9, (en) => {
          shockwave(en, en.pos, 6, 12, { burst: 'shatter_ice', shake: 0.3, knock: 6, color: 0xbfefff, element: 'ice', power: 0.8, noGround: true });
          G.audio?.sfx('ice_shatter', { pos: en.pos });
        }, { tell: (en) => { warnAt(en.pos, 6, 0.95, 0xbfefff); en.cr?.play('attack', { once: true, speed: 0.7 }); G.audio?.sfx('crystal', { pos: en.pos }); } });
        return;
      }
      if (e.cd <= 0 && d < 24) {
        e.cd = 3 + Math.random();
        e.attack('lances', 0.7, 0.6, (en) => {
          volley({ owner: en, team: 'enemy', alive: () => !en.dead, dmgK: en.atkMul, hand: (o) => headPos(en, o, 1.05) }, P,
            { n: 3, fan: 0.3, gap: 0.12, el: 'ice', shape: 'lance', speed: 24, size: 0.5, damage: 9, turn: 0.25, rise: 0.04 });
        }, { tell: (en) => { headPos(en, _o, 1.05); G.fx?.burst('charge_done', _o, { color: 0xbfefff, scale: 0.9 }); G.audio?.sfx('crystal', { pos: en.pos, pitch: 1.2 }); },
          during: (en) => en.face(P.pos.x, P.pos.z, dt, 8) });
        return;
      }
      if (d > 9) moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 8);
      else circle(e, 9, e.def.speed * 0.6, dt, e.id % 2 ? 1 : -1);
      anim(e, true, d > 12);
    },
  };

  // 余烬蛇 — ember serpent
  TYPES.embersnake = {
    asset: 'mon_serpent', scale: 0.82, tint: { color: 0xffa070, emissive: 0x7a2000, emissiveIntensity: 0.45 }, material: 'flesh', hp: 470, radius: 0.8, height: 2.3,
    speed: 2.8, sight: 16, immune: ['burning', 'fire'], drops: { stardust: [6, 9], heart: 0.4 }, poise: 185, staggerT: 1.5, mult: { water: 1.3, ice: 1.2 },
    clips: { idle: 'Snake_Idle', move: 'Snake_Walk', attack: 'Snake_Attack', leap: 'Snake_Jump', hit: 'Snake_Idle', death: 'Snake_Idle' },
    onSpawn(e) {
      addWard(e, 'fire', Math.round(e.maxHp * 0.5), { regen: 13 });
      const em = G.fx?.emitter?.('embers', { color: 0xff8a3a, scale: 0.8 });
      if (em) { e.data.em = em; e.own(() => em.remove()); }
    },
    think(e, dt) {
      const D = e.data;
      if (D.em) { D.em.pos.set(e.pos.x, e.pos.y + 1.4, e.pos.z); D.em.active = !!(e.ward && e.ward.hp > 0); }
      const s = front(e, dt); if (s !== 'fight') return;
      const P = G.player, d = distP(e);
      e.cd -= hasteDt(e, dt);
      if (e.cd <= 0 && d < 4.2) {
        e.cd = 2.6 + Math.random();
        e.attack('bite', 0.6, 0.7, (en) => {
          en.cr?.play('attack', { once: true, speed: 1.3 });
          after(0.15, () => melee(en, 3.4, 1.0, 15, { burst: 'hit_fire', color: 0xff8a3a, knock: 6, element: 'fire' }), en);
        }, { tell: (en) => { warnAt(_v.copy(en.pos).addScaledVector(flatDir(en.pos, P.pos, _d), 2), 1.8, 0.6, 0xff8a3a); G.audio?.sfx('steam', { pos: en.pos, pitch: 1.4 }); },
          during: (en) => en.face(P.pos.x, P.pos.z, dt, 9) });
        return;
      }
      if (e.cd <= 0 && d < 7 && Math.random() < 0.4) {
        e.cd = 4 + Math.random();
        e.attack('ring', 1.0, 0.8, (en) => {
          shockwave(en, en.pos, 5, 13, { burst: 'hit_fire', color: 0xff8a3a, element: 'fire', power: 0.7, noGround: true, knock: 6, shake: 0.25 });
          G.audio?.sfx('ignite', { pos: en.pos });
        }, { tell: (en) => { warnAt(en.pos, 5, 1.0, 0xff8a3a); en.cr?.play('leap', { once: true, speed: 0.8 }); } });
        return;
      }
      if (e.cd <= 0 && d < 22) {
        e.cd = 3.2 + Math.random();
        e.attack('spit', 0.7, 0.6, (en) => {
          for (let i = 0; i < 3; i++) after(i * 0.16, () => {
            if (en.dead || !playerAlive()) return;
            headPos(en, _o, 0.95);
            _v.set(P.pos.x + (i ? (Math.random() - 0.5) * 5 : 0), P.pos.y, P.pos.z + (i ? (Math.random() - 0.5) * 5 : 0));
            const dist = Math.hypot(_v.x - _o.x, _v.z - _o.z), sp = 15, T = dist / sp;
            _d.set((_v.x - _o.x) / Math.max(0.1, T), (_v.y - _o.y) / Math.max(0.1, T) + 0.5 * 9 * T, (_v.z - _o.z) / Math.max(0.1, T));
            const len = _d.length();
            bolt({ owner: en, team: 'enemy', dmgK: en.atkMul }, _o.clone(), _d.clone().divideScalar(len), { el: 'fire', speed: len, gravity: 9, size: 0.42, damage: 10, splash: 1.4, turn: 0, life: 3 });
            en.cr?.play('attack', { once: true, speed: 1.6 });
          }, en);
          G.audio?.sfx('cast_fire', { pos: en.pos });
        }, { tell: (en) => { headPos(en, _o, 0.95); G.fx?.burst('charge_done', _o, { color: 0xff8a3a, scale: 0.8 }); G.audio?.sfx('steam', { pos: en.pos, pitch: 1.1 }); },
          during: (en) => en.face(P.pos.x, P.pos.z, dt, 8) });
        return;
      }
      if (d > 8) moveToward(e, P.pos.x, P.pos.z, e.def.speed, dt, 6);
      else circle(e, 7, e.def.speed * 0.5, dt, e.id % 2 ? 1 : -1);
      anim(e, e.move.lengthSq() > 0.1);
    },
  };
}
export { scare };
