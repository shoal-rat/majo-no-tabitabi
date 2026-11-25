// Bosses (DESIGN §3.5): 胧牙 the shade wolf king at 千年枫, 灯喰蛾 the lantern-eating moth over 镜心屿,
// 胧夜 the moon priestess (duel engine, all eight elements, mandatory beam struggle) and 无明 (a towering shadow with
// weak points that only open when lit). Each: 'boss:start' → 'boss:phase' → 'boss:defeated', G.state.defeated[id].
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { PAL, glow } from '../core/mats.js';
import { clamp, TAU } from '../core/util.js';
import { ARENAS } from '../data/camps.js';
import { warnAt, shockwave, melee, darkOrb, skyFall, flatDir, hurtPlayer, inArc, DARK } from './attacks.js';
import { moveToward, circle } from './types.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();
const ALL_EL = ['fire', 'water', 'ice', 'wind', 'thunder', 'earth', 'sun', 'moon'];

export function createBosses(C) {
  const B = { active: null };

  function begin(id, enemy, opts, extra = {}) {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const b = { id, enemy, opts, resolve, phase: 1, over: false, t: 0, adds: [], endT: 0, hpShown: -1, ...extra };
    B.active = b;
    const name = t('combat.boss.' + id);
    G.events.emit('boss:start', { id, name });
    G.ui?.banner?.(name, t('combat.boss.sub.' + id), { foe: true });
    b.offDied = G.events.on('player:died', () => { if (B.active === b && !b.over) end(false); });
    return { b, promise };
  }

  function setPhase(b, p) {
    if (b.phase >= p) return;
    b.phase = p;
    G.events.emit('boss:phase', { id: b.id, phase: p });
    G.fx?.shake?.(0.35, 0.6);
    G.audio?.sfx('roar', { pos: b.enemy?.pos, vol: 1 });
  }

  function end(won) {
    const b = B.active;
    if (!b || b.over) return;
    b.over = true; b.won = won;
    const e = b.enemy;
    if (won) {
      if (G.state) { G.state.defeated = G.state.defeated || {}; G.state.defeated[b.id] = true; }
      if (e) {
        e.centerOut(_v);
        G.fx?.burst('boss_death', _v, { scale: clamp(e.height / 3, 1, 4) });
        G.hitstop(0.18); G.fx?.shake?.(0.6, 1);
        if (!e.dead && !e.actor) C.kill(e, 'purify', { noDrop: false });
      }
      G.events.emit('boss:defeated', { id: b.id });
      G.ui?.toast?.(t('combat.boss.win', { name: t('combat.boss.' + b.id) }), { dur: 3.5 });
    }
    for (const a of b.adds) if (!a.dead) C.kill(a, 'purify');
  }

  function cleanup(b) {
    b.offDied?.();
    G.ui?.bossBar?.(null);
    G.ui?.struggle?.(null);
    for (const f of b.cleanup || []) { try { f(); } catch (er) { G.reportError('combat:boss:cleanup', er); } }
    if (b.enemy && !b.enemy.dead) C.despawn(b.enemy);
  }

  function testDrain(b, dt) {
    if (!b.opts?.testWin || b.t < 1.2 || b.over) return;
    const e = b.enemy;
    b.drain = (b.drain || 0) + e.maxHp * 0.12 * dt;
    if (b.drain >= 1) { const n = Math.floor(b.drain); b.drain -= n; C.damage(e, n, { element: 'sun', force: true, silentText: true, silentHit: true, dot: true }); }
  }

  // ===== 胧牙 — giant shade wolf ==========================================================================================
  function startOboroga(opts) {
    const A = ARENAS.oboroga;
    const P = G.player;
    const def = {
      asset: 'ani_wolf', scale: 7, tint: 'shade', hp: 1400, radius: 3, height: 5, speed: 6.5, boss: true, heavy: true, brave: true, noBar: true, awake: true,
      clips: { idle: 'Idle', move: 'Walk', run: 'Gallop', attack: 'Attack', leap: 'Gallop_Jump', death: 'Death', hit: 'Idle_HitReact_Left' },
      blobRadius: 4.5, drops: { stardust: [40, 50], heart: 1 },
      damageScale(e, info) {
        const lit = e.burning || e.light > 0.45;
        if (lit && (info.element === 'fire' || info.element === 'sun') && G.time.t - (e.data.staggerT || -99) > 9 && info.mult > 1) {
          e.data.staggerT = G.time.t; e.stopAttack(); e.stun(1.6);
          G.fx?.text?.(e.centerOut(_v).setY(e.pos.y + e.height + 0.8), t('combat.boss.stagger'), { kind: 'word', target: e, color: 0xffd27a, size: 1.3 });
        }
        return lit ? 1.6 : 1;
      },
      think: wolfThink,
    };
    const sp = new THREE.Vector3(A.x, 0, A.z - A.r * 0.55);
    const e = C.spawn('boss', sp, { def, persistent: true, aggro: true, yaw: 0 });
    if (!e) return Promise.resolve(false);
    e.bossId = 'oboroga';
    const em = G.fx?.emitter?.('miasma', { color: DARK, scale: 1 });
    if (em) { e.data.em = em; e.own(() => em.remove()); }
    Object.assign(e.data, { cd: 2, howl: 18 });
    if (P && Math.hypot(P.pos.x - A.x, P.pos.z - A.z) > A.r) P.teleport?.(A.x, undefined, A.z + A.r * 0.5);
    const { b, promise } = begin('oboroga', e, opts);
    b.onUpdate = (bb) => {
      const f = e.hp / e.maxHp;
      if (f < 0.6) { if (bb.phase < 2) { setPhase(bb, 2); howl(e, bb); } }
      if (f < 0.25) setPhase(bb, 3);
    };
    e.onZero = () => end(true);
    return promise;
  }
  function howl(e, b) {
    e.stopAttack();
    e.attack('howl', 1.1, 0.6, (en) => {
      G.audio?.sfx('howl', { pos: en.pos, vol: 1.2 });
      G.fx?.ring?.(en.pos, { color: DARK, radius: 16, dur: 0.9, intensity: 2 });
      G.fx?.shake?.(0.4, 0.8);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU;
        _v.set(en.pos.x + Math.cos(a) * 7, en.pos.y, en.pos.z + Math.sin(a) * 7);
        const w = C.spawn('wolf', _v, { aggro: true, persistent: true, dmgMul: 1.3, speedMul: 1.15 });
        if (w) { b.adds.push(w); G.fx?.burst('summon', w.centerOut(_w), { color: DARK }); }
      }
    }, { tell: (en) => { en.cr?.play('idle'); G.fx?.burst('charge_done', en.centerOut(_v).setY(en.pos.y + en.height), { color: PAL.shadeEye, scale: 2.5 }); G.audio?.sfx('growl', { pos: en.pos, vol: 1.2, pitch: 0.6 }); } });
  }
  function wolfThink(e, dt) {
    const P = G.player, S = e.data, b = B.active;
    if (S.em) S.em.pos.set(e.pos.x, e.pos.y + 1.2, e.pos.z);
    if (!P || P.dead || !b || b.over || G.mode !== 'play') { e.move.set(0, 0, 0); return; }
    if (e.stepAttack(dt)) return;
    const d = Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
    S.cd -= dt; S.howl -= dt;
    const fast = b.phase >= 3 ? 0.7 : 1;
    if (b.phase >= 2 && S.howl <= 0) { S.howl = 24; b.adds = b.adds.filter((a) => !a.dead); if (b.adds.length < 2) { howl(e, b); return; } }
    if (d < 7 && (S.cd <= 0 || S.stalk > 0)) {
      S.cd = 1.8 * fast; S.stalk = 0;
      e.attack('bite', 0.55 * fast, 0.7, (en) => {
        en.cr?.play('attack', { once: true, speed: 1.3 });
        melee(en, 7, 0.9, 20, { knock: 9, scale: 2 });
        G.audio?.sfx('growl', { pos: en.pos, pitch: 0.7 });
      }, { tell: (en) => { G.fx?.burst('charge_done', _o.set(en.pos.x + Math.sin(en.yaw) * 3, en.pos.y + 2.8, en.pos.z + Math.cos(en.yaw) * 3), { color: PAL.shadeEye, scale: 1.4 }); },
        during: (en) => en.face(P.pos.x, P.pos.z, dt, 5) });
      return;
    }
    if (S.cd <= 0 && d < 30) {
      S.cd = 3.6 * fast;
      const n = b.phase >= 3 ? 2 : 1;
      // every other opening it stalks in for a bite instead of leaping (fix2: the bite used to never happen)
      S.turn = (S.turn || 0) + 1;
      if (S.turn % 2 === 0 && d > 7) { S.stalk = 2.6; S.cd = 0.4; return; }
      leap(e, n);
      return;
    }
    if (S.stalk > 0) {
      S.stalk -= dt;
      moveToward(e, P.pos.x, P.pos.z, e.def.speed * 1.35, dt, 1);
      e.face(P.pos.x, P.pos.z, dt, 4);
      if (!e.cr?.busy) e.playState('run');
      return;
    }
    circle(e, 12, e.def.speed, dt, Math.floor(G.time.t / 5) % 2 ? 1 : -1);
    if (!e.cr?.busy) e.playState('run');
  }
  function leap(e, n) {
    const P = G.player;
    const target = P.pos.clone();
    e.attack('leap', 0.9, 0.5, (en) => {
      const dx = target.x - en.pos.x, dz = target.z - en.pos.z;
      const T = 0.85;
      en.vel.set(dx / T, 22 * T * 0.5, dz / T);
      en.yaw = Math.atan2(dx, dz);
      en.cr?.play('leap', { once: true, speed: 0.8, next: 'run' });
      C.after(T, () => {
        shockwave(en, en.pos, 5.5, 26, { burst: 'dust', shake: 0.6, knock: 10, impulse: 14 });
        G.fx?.burst('hit_earth', en.pos, { scale: 1.8 }); // fix2: 'crater' is the meteor's radius-9 fire blast (white-out at 3 m)
        G.audio?.sfx('quake', { pos: en.pos });
        G.hitstop(0.05);
        if (n > 1 && !en.dead) C.after(0.35, () => { if (!en.dead) leap(en, n - 1); }, en);
      }, en);
    }, { tell: (en) => {
      warnAt(target, 5.5, 0.9 + 0.85);
      G.audio?.sfx('growl', { pos: en.pos, pitch: 0.6 });
      en.cr?.play('idle', { fade: 0.1 });
    }, during: (en, a) => { if (!a.fired) { en.face(target.x, target.z, 0.016, 10); if (en.cr) en.cr.model.position.y = -0.5 * clamp(a.t / a.windup); } else if (en.cr) en.cr.model.position.y = 0; },
      cancel: (en) => { if (en.cr) en.cr.model.position.y = 0; } });
  }

  // ===== 灯喰蛾 — the lantern-eating moth ===================================================================================
  function startMoth(opts) {
    const A = ARENAS.tomoshigui;
    const def = {
      asset: 'mon_bat', scale: 5.5, tint: 'shade', eyeColor: 0xffc070, hp: 2200, // final-play2: 1200 fell in 16 s to held charms, before it ever tried to eat a lamp radius: 2.6, height: 3.4, fly: true, hover: 14, bob: 0.6, speed: 9,
      boss: true, heavy: true, brave: true, noBar: true, awake: true, capsule: true, blobRadius: 3.5, drops: { stardust: [40, 50], heart: 1 },
      clips: { idle: 'Bat_Flying', fly: 'Bat_Flying', move: 'Bat_Flying', attack: 'Bat_Attack', hit: 'Bat_Hit', death: 'Bat_Death' },
      damageScale(e, info) {
        if (['ice', 'wind', 'thunder'].includes(info.element) && !e._grounded) {
          e.data.wing = (e.data.wing || 0) + (info.element === 'wind' ? 1.4 : 1);
          if (e.data.wing >= 4) ground(e);
        }
        return e._grounded ? 2 : e.data.eating ? 1.5 : 1;
      },
      think: mothThink,
    };
    const e = C.spawn('boss', new THREE.Vector3(A.x, 0, A.z - 18), { def, persistent: true, aggro: true });
    if (!e) return Promise.resolve(false);
    e.bossId = 'tomoshigui';
    Object.assign(e.data, { ang: 0, cd: 4, eat: 8, wing: 0 }); // first lamp-eating at 8 s (was 14) so the fight shows its trick early
    const { b, promise } = begin('tomoshigui', e, opts);
    b.onUpdate = (bb) => { const f = e.hp / e.maxHp; if (f < 0.66) setPhase(bb, 2); if (f < 0.33) setPhase(bb, 3); };
    e.onZero = () => { e._grounded = true; end(true); };
    return promise;
  }
  function ground(e) {
    e._grounded = true; e.data.wing = 0; e.data.groundT = 6; e.stopAttack(); e.data.eating = null;
    e.data.beam?.remove?.(); e.data.beam = null;
    G.fx?.text?.(e.centerOut(_v).setY(e.pos.y + 4), t('combat.boss.grounded'), { kind: 'word', target: e, color: 0xbfefff, size: 1.35 });
    G.audio?.sfx('wing_flap', { pos: e.pos, pitch: 0.5 });
    e.cr?.play('hit', { once: true });
  }
  function mothThink(e, dt) {
    const P = G.player, S = e.data, b = B.active, A = ARENAS.tomoshigui;
    if (!P || P.dead || !b || b.over || G.mode !== 'play') { e.move.set(0, 0, 0); return; }
    if (e._grounded) {
      e.move.set(0, 0, 0);
      S.groundT -= dt;
      if (e.grounded && !S.landed) { S.landed = true; shockwave(e, e.pos, 4, 10, { burst: 'splash', shake: 0.4 }); }
      if (S.groundT <= 0 && !e.dead && e.hp > 0) { e._grounded = false; S.landed = false; e.vel.y = 8; G.audio?.sfx('wing_flap', { pos: e.pos, pitch: 0.6 }); }
      return;
    }
    if (S.eating) {
      const L = S.eating;
      e.move.set(0, 0, 0);
      moveToward(e, L.pos.x, L.pos.z, 12, dt, 1);
      S.dy = (L.pos.y + 5) - (G.world.groundAt(e.pos.x, e.pos.z) + e.hover);
      // fly over the lamp first (fix2: it used to drain from 50 m away), then drain it
      const far = Math.hypot(L.pos.x - e.pos.x, L.pos.z - e.pos.z) > 7;
      S.eatGo = (S.eatGo || 0) + dt;
      if (far && S.eatGo < 9) { e.face(L.pos.x, L.pos.z, dt, 3); return; }
      if (!S.beam) S.beam = G.fx?.beam?.({ from: L.pos, to: e.pos, color: 0xffd27a, width: 0.5, sparks: true, light: false, intensity: 1 }) || null;
      S.eatT += dt;
      if (S.beam) S.beam.set(_v.set(L.pos.x, L.pos.y + 1, L.pos.z), e.centerOut(_w));
      if (S.eatT > 3.2) {
        const heal = Math.round(e.maxHp * 0.1);
        e.hp = Math.min(e.maxHp, e.hp + heal);
        G.fx?.text?.(e.centerOut(_v).setY(e.pos.y + 4), '+' + heal, { color: 0xffd27a, size: 1.3 });
        G.elements?.apply('wind', _v.set(L.pos.x, L.pos.y + 0.5, L.pos.z), 1.5, 1, { team: 'enemy', source: e, damage: 0, noGround: true });
        try { L.douse?.({ by: 'moth' }); } catch (er) { G.reportError('combat:mothEat', er); }
        S.beam?.remove?.(); S.beam = null; S.eating = null; S.dy = 0;
      }
      return;
    }
    if (e.stepAttack(dt)) return;
    S.cd -= dt; S.eat -= dt;
    if (S.eat <= 0) {
      S.eat = 22;
      // gameplay's lit stone lanterns first (they can be doused); elements reactors as the fallback
      const LL = G.gameplay?.litLanterns ? G.gameplay.litLanterns(_v.set(A.x, 0, A.z), 70)[0] : null;
      const L = LL || (G.elements?.nearest ? G.elements.nearest(_v.set(A.x, 0, A.z), 70, (r) => r.kind === 'lantern' && (r.lit > 0 || r.owner?.lit === true)) : null);
      if (L) {
        S.eating = L; S.eatT = 0; S.eatGo = 0; S.beam = null;
        G.ui?.toast?.(t('combat.boss.mothEats'), { dur: 3 });
        return;
      }
    }
    if (S.cd <= 0) {
      S.cd = (b.phase >= 2 ? 5 : 7) + Math.random() * 2;
      if (b.phase >= 2 && Math.random() < 0.45) {
        e.attack('volley', 0.8, 0.6, (en) => {
          for (let i = 0; i < 5; i++) C.after(i * 0.15, () => { if (!en.dead) { en.centerOut(_o); darkOrb(en, _o, G.player, { speed: 13, damage: 12, turn: 0.4, size: 0.7, big: true }); } }, en);
        }, { tell: (en) => { G.fx?.burst('charge_done', en.centerOut(_v), { color: DARK, scale: 2.5 }); G.audio?.sfx('charge', { pos: en.pos }); } });
      } else dive(e);
      return;
    }
    // orbit high over the island
    S.ang += dt * 0.32 * (b.phase >= 3 ? 1.4 : 1);
    const tx = A.x + Math.cos(S.ang) * 18, tz = A.z + Math.sin(S.ang) * 18;
    moveToward(e, tx, tz, e.def.speed, dt, 0.5);
    e.face(P.pos.x, P.pos.z, dt, 2);
    S.dy = 0;
  }
  function dive(e) {
    const P = G.player;
    const target = P.pos.clone();
    e.attack('dive', 1.25, 1.0, (en) => {
      en.data.dy = -(en.hover - 1.5);
      const dx = target.x - en.pos.x, dz = target.z - en.pos.z, d = Math.hypot(dx, dz) || 1;
      en.vel.set(dx / d * 26, 0, dz / d * 26);
      en.cr?.play('attack', { once: true });
      G.audio?.sfx('whoosh', { pos: en.pos, vol: 1.1 });
      C.after(Math.min(1.1, d / 26 + 0.15), () => {
        shockwave(en, target, 3.8, 22, { burst: 'hit_dark', shake: 0.45, knock: 9, jumpable: false });
        en.data.dy = 0;
      }, en);
    }, { tell: (en) => {
      warnAt(target, 3.8, 1.25 + 0.6);
      G.audio?.sfx('squeak', { pos: en.pos, pitch: 0.5, vol: 1.2 });
      G.fx?.burst('charge_done', en.centerOut(_v), { color: 0xffc070, scale: 2 });
    }, during: (en) => en.face(target.x, target.z, 0.016, 6) });
  }

  // ===== 胧夜 — the moon priestess (duel engine) ==============================================================================
  function startOboroyo(opts) {
    const duels = C._duels;
    if (!duels) return Promise.resolve(false);
    const p = duels.start('oboroyo', { boss: true, testWin: opts.testWin, pos: ARENAS.oboroyo, r: ARENAS.oboroyo.r, beamAt: -1 });
    const d = duels.active;
    if (!d) return p;
    const e = d.enemy;
    e.data.beamed = true;
    const bRec = { id: 'oboroyo', enemy: e, phase: 1, over: false, t: 0, adds: [], opts, proxy: true };
    B.active = bRec;
    let wonStruggle = false;
    const off = G.events.on('beam:struggle', (ev) => {
      if (ev.state === 'end' && ev.winner === 'player' && d.invuln) {
        wonStruggle = true; d.invuln = false;
        e.stopAttack(); e.stun(2.5);
        C.damage(e, e.maxHp * 0.08, { element: 'sun', force: true });
        G.ui?.toast?.(t('combat.boss.struggleWon'), { dur: 3 });
      }
    });
    d.onUpdate = (dd, dt) => {
      const f = e.hp / e.maxHp;
      if (bRec.phase < 2 && f < 0.66) {
        setPhase(bRec, 2);
        dd.invuln = true; dd.phase = 2;
        G.ui?.toast?.(t('combat.boss.mustStruggle'), { dur: 3.5 });
        bRec.beamT = 0.5;
      }
      if (dd.invuln && !dd.opts.testWin) {
        bRec.beamT -= dt;
        if (bRec.beamT <= 0 && !e.data.beam && !e.atk) { bRec.beamT = 4.5; duels.beamPiece(e, { color: 0xb48cff, duration: 7, windup: 1.2 }); }
      } else if (dd.invuln && dd.opts.testWin) { dd.invuln = false; wonStruggle = true; }
      if (bRec.phase < 3 && f < 0.33 && !dd.invuln) {
        setPhase(bRec, 3); dd.phase = 3;
        G.spells?.cast?.('moon', 'big', { caster: e, team: 'enemy', point: G.player.pos.clone(), origin: e.centerOut(_v).clone(), dir: e.dir });
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * TAU;
          _v.set(dd.cx + Math.cos(a) * 9, dd.cy, dd.cz + Math.sin(a) * 9);
          const c = C.spawn('caster', _v, { aggro: true, persistent: true, element: ALL_EL[Math.floor(Math.random() * 8)] });
          if (c) { (dd.adds || (dd.adds = [])).push(c); G.fx?.burst('summon', c.centerOut(_w), { color: DARK }); }
        }
      }
    };
    return p.then((won) => {
      off();
      if (B.active === bRec) B.active = null;
      G.ui?.bossBar?.(null);
      if (won) {
        if (G.state) { G.state.defeated = G.state.defeated || {}; G.state.defeated.oboroyo = true; }
        G.events.emit('boss:defeated', { id: 'oboroyo' });
      }
      return won;
    });
  }

  // ===== 无明 — the towering shadow ===========================================================================================
  function startMumyo(opts) {
    const A = ARENAS.mumyo;
    const top = G.world.groundAt(A.x, A.z, 1e4);
    const base = new THREE.Vector3(A.x, top - 40, A.z - 46); // fix2: was -62 — the weak points sat ~77 m away, out of every spell's reach
    const def = {
      asset: 'mon_ghost', scale: 24, tint: 'shade', eyeColor: 0xffb04a, hp: 3000, radius: 6, height: 34, boss: true, heavy: true, brave: true, noBar: true, awake: true,
      capsule: false, collide: false, anchored: true, castShadow: false, blob: false, blobRadius: 0.1, immune: ALL_EL.slice(), noKnock: true,
      clips: { idle: 'Flying_Idle', fly: 'Flying_Idle', attack: 'Punch', hit: 'HitReact', death: 'Death' },
      damageScale(e, info) { return info.weak ? 1 : 0; },
      think: mumyoThink,
    };
    // final-play2: dmgMul 0.7 — in the dark of the palace its shade bonus made the hand 39–54 (two hits from full hp) and the rain ~29
    const e = C.spawn('boss', base, { def, persistent: true, aggro: true, yaw: 0, snap: false, dmgMul: 0.7 });
    if (!e) return Promise.resolve(false);
    e.bossId = 'mumyo';
    e.pos.copy(base);
    e.fly = false; e._static = true;
    Object.assign(e.data, { rise: 0, top, cd: 4, base: base.clone() });
    // weak points: three glowing hearts on the shadow, opened by sunlight (日 / 金环)
    const pts = [[-0.24, 0.62], [0.24, 0.62], [0, 0.4]];
    const weak = [];
    const geo = new THREE.SphereGeometry(1.4, 16, 12);
    for (const [ox, oy] of pts) {
      const mesh = new THREE.Mesh(geo, glow(0x5a2a90, 1.6));
      G.scene.add(mesh);
      const w = { mesh, openT: 0, ox, oy, pos: new THREE.Vector3(), foot: new THREE.Vector3(), reactor: null };
      w.reactor = G.elements?.register?.({
        owner: w, kind: 'creature', material: 'shade', getPos: () => w.foot.copy(w.pos).setY(w.pos.y - 1.4), radius: 1.6, height: 2.8, team: 'enemy', living: true, immune: ['burning', 'wet', 'frozen', 'shocked'],
        on: {
          hit(r, el, power, h) {
            if (!h || h.team === 'enemy' || B.active?.enemy !== e || e.data.breath) return;
            if (el === 'sun' && w.openT <= 0) { w.openT = 7; G.fx?.burst('purify', w.pos, { scale: 2.5 }); G.audio?.sfx('purify', { pos: w.pos }); G.fx?.text?.(_v.copy(w.pos).setY(w.pos.y + 2.5), t('combat.boss.weakOpen'), { color: 0xffd27a, size: 1.3 }); }
            if (w.openT > 0) C.damage(e, (h.damage ?? 8 * power) * (h.mult || 1) * 1.2, { element: el, weak: true, source: h.source });
          },
        },
      }) || null;
      weak.push(w);
    }
    e.data.weak = weak;
    // lock-on proxies (combat.cycleLock / hud reticle / player aim): pos = foot of the weak point's sphere
    e.data.lockPoints = weak.map((w) => ({
      isLockPoint: true, weak: w, boss: e, pos: w.foot, height: 2.8, radius: 1.6, lockRange: 95,
      get hp() { return e.hp; }, get maxHp() { return e.maxHp; }, get dead() { return e.dead || e.hp <= 0 || B.active?.enemy !== e; },
      get open() { return w.openT > 0; },
    }));
    e.own(() => { for (const w of weak) { w.mesh.parent?.remove(w.mesh); if (w.reactor) G.elements?.unregister(w.reactor); } geo.dispose(); });
    const em = G.fx?.emitter?.('miasma', { color: DARK, scale: 4, radius: 10 });
    if (em) { e.data.em = em; e.own(() => em.remove()); }
    // 金环 (kinkan) opens every weak point
    const offK = G.events.on('spell:cast', (ev) => { if (ev && ev.spell === 'kinkan' && ev.team === 'player') for (const w of weak) w.openT = 10; });
    e.own(offK);
    const { b, promise } = begin('mumyo', e, opts);
    G.fx?.shake?.(0.6, 3);
    G.audio?.sfx('rumble', { vol: 1.2 });
    b.onUpdate = (bb) => {
      const f = e.hp / e.maxHp;
      if (f < 0.66) setPhase(bb, 2);
      if (f < 0.25 && bb.phase < 3) { setPhase(bb, 3); e.data.breathDue = true; }
    };
    // fix2: the final breath struggle is mandatory — until it is won the shadow cannot fall below 4 %
    e.onDamage = (n) => (e.data.breathWon || B.active?.opts?.testWin ? n : Math.min(n, Math.max(0, e.hp - Math.ceil(e.maxHp * 0.04))));
    e.onZero = () => {
      e.data.sinking = true;
      end(true);
    };
    const offS = G.events.on('beam:struggle', (ev) => {
      if (ev.state !== 'end' || !e.data.breath || B.active?.enemy !== e) return;
      e.data.breath = false;
      if (ev.winner === 'player') {
        G.ui?.toast?.(t('combat.boss.struggleWon'), { dur: 3 });
        e.data.breathWon = true;
        for (const w of weak) w.openT = 12;
        C.damage(e, e.maxHp * 0.12, { element: 'sun', force: true });
      } else e.data.breathRetry = 5;
    });
    e.own(offS);
    return promise;
  }
  function mumyoThink(e, dt) {
    const S = e.data, P = G.player, b = B.active, A = ARENAS.mumyo;
    // rise behind the palace
    S.rise = Math.min(1, S.rise + dt / 5);
    const k = S.rise * S.rise * (3 - 2 * S.rise);
    e.pos.set(S.base.x, S.base.y + k * 40 + Math.sin(G.time.t * 0.6) * 0.6, S.base.z);
    e.vel.set(0, 0, 0); e.move.set(0, 0, 0);
    if (P) e.face(P.pos.x, P.pos.z, dt, 0.5);
    for (const w of S.weak) {
      w.openT = Math.max(0, w.openT - dt);
      const h = e.height;
      w.pos.set(e.pos.x + Math.cos(e.yaw) * w.ox * h + Math.sin(e.yaw) * 4.5, e.pos.y + w.oy * h, e.pos.z - Math.sin(e.yaw) * w.ox * h + Math.cos(e.yaw) * 4.5);
      w.mesh.position.copy(w.pos);
      w.foot.copy(w.pos).setY(w.pos.y - 1.4);
      const open = w.openT > 0;
      const want = open ? 'open' : 'shut';
      if (w.state !== want) { w.state = want; w.mesh.material = open ? glow(0xffd27a, 3.2) : glow(0x5a2a90, 1.6); }
      w.mesh.scale.setScalar(open ? 1 + Math.sin(G.time.t * 8) * 0.08 : 0.8);
    }
    if (S.em) S.em.pos.set(e.pos.x, e.pos.y + 8, e.pos.z);
    if (!P || P.dead || !b || b.over || G.mode !== 'play' || S.rise < 1) return;
    if (S.breath) {
      if (S.beam && S.beam.alive) { e.centerOut(_o); _o.y = e.pos.y + e.height * 0.55; S.beam.origin?.copy?.(_o); }
      else if (!G.spells?.struggle) S.breath = false;
      return;
    }
    if (e.stepAttack(dt)) return;
    S.cd -= dt;
    if (S.breathRetry > 0) S.breathRetry -= dt;
    if (S.breathDue && S.cd <= 0 && !(S.breathRetry > 0) && !b.opts?.testWin) { S.cd = 3; breath(e); return; }
    if (S.cd > 0) return;
    const r = Math.random();
    const ph = b.phase;
    S.cd = (ph >= 2 ? 3.2 : 4.2) + Math.random();
    if (r < 0.4) {
      // the hand: a vast slam on the heroine
      const target = P.pos.clone();
      e.attack('hand', 1.6, 0.6, (en) => {
        _v.copy(target); _v.y += 30;
        G.fx?.lightning?.(_v, target, { color: DARK, branches: 4, dur: 0.3, width: 1.2 });
        shockwave(en, target, 6.5, 30, { burst: 'explosion_big', color: DARK, shake: 0.8, knock: 7, impulse: 9 }); // knock 12 / impulse 16 threw her off the palace
        G.audio?.sfx('explosion_big', { pos: target });
      }, { tell: (en) => { warnAt(target, 6.5, 1.6); en.cr?.play('attack', { once: true, speed: 0.6 }); G.audio?.sfx('rumble', { pos: target }); } });
    } else if (r < 0.75) {
      // dark rain across the arena
      e.attack('rain', 0.6, 2.5, (en) => {
        const n = ph >= 2 ? 11 : 8;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * A.r;
          _v.set(A.x + Math.cos(a) * d, P.pos.y, A.z + Math.sin(a) * d);
          if (i === 0) _v.copy(P.pos);
          skyFall(en, _v.clone(), { delay: 1.1 + i * 0.12, radius: 2.6, damage: 16 });
        }
      }, { tell: (en) => { G.fx?.burst('charge_done', en.centerOut(_v), { color: DARK, scale: 6 }); } });
    } else {
      // sweeping claw: a line of sigils from one side of the arena to the other, struck in order
      const a0 = Math.random() * TAU;
      const pts = [];
      for (let i = 0; i < 7; i++) {
        const u = i / 6 - 0.5;
        pts.push(new THREE.Vector3(A.x + Math.cos(a0) * u * A.r * 1.8 + Math.cos(a0 + Math.PI / 2) * (P.pos.x - A.x) * 0, P.pos.y, A.z + Math.sin(a0) * u * A.r * 1.8));
      }
      // shift the line onto the heroine
      const off = _d.set(P.pos.x - A.x, 0, P.pos.z - A.z);
      const nrm = _w.set(-Math.sin(a0), 0, Math.cos(a0));
      const s = off.dot(nrm);
      for (const p of pts) p.addScaledVector(nrm, s);
      e.attack('sweep', 0.3, 2.2, (en) => {
        pts.forEach((p, i) => C.after(1.0 + i * 0.12, () => shockwave(en, p, 3.4, 20, { burst: 'hit_dark', shake: 0.25, knock: 8, jumpable: true }), en));
      }, { tell: () => { pts.forEach((p, i) => warnAt(p, 3.4, 1.3 + i * 0.12)); } });
    }
  }
  function breath(e) {
    const S = e.data;
    G.ui?.toast?.(t('combat.boss.breathTell', { key: G.input?.keyLabel?.('cast') || '' }), { dur: 3.5 });
    e.attack('breath', 2.0, 0.2, (en) => {
      const P = G.player;
      _o.set(en.pos.x + Math.sin(en.yaw) * 5, en.pos.y + en.height * 0.55, en.pos.z + Math.cos(en.yaw) * 5);
      _d.set(P.pos.x - _o.x, P.pos.y + 1 - _o.y, P.pos.z - _o.z).normalize();
      let h = null;
      try { h = G.spells?.cast?.('sun', 'big', { caster: en, origin: _o.clone(), dir: _d.clone(), team: 'enemy', duration: 10, strength: 1.15, power: 1.4, len: 95, target: P }); } catch (er) { G.reportError('combat:breath', er); }
      if (h) { try { h.fx?.setColor?.(0x9a4cff); h.lookEl = 'shadow'; h.lookColor = 0x9a4cff; } catch (er) { /* ignore */ } S.beam = h; S.breath = true; }
    }, { tell: (en) => {
      en.centerOut(_v); _v.y = en.pos.y + en.height * 0.55;
      G.fx?.burst('charge_done', _v, { color: DARK, scale: 8 });
      G.audio?.sfx('charge', { pos: _v, vol: 1.2 });
      for (const w of S.weak) w.openT = 0;
    } });
  }

  // ===== shared runner =======================================================================================================
  /** ★ startBoss(id, opts) -> Promise<boolean won>. opts: { testWin } */
  function start(id, opts = {}) {
    if (B.active) abort();
    try {
      if (id === 'oboroga') return startOboroga(opts);
      if (id === 'tomoshigui') return startMoth(opts);
      if (id === 'oboroyo') return startOboroyo(opts);
      if (id === 'mumyo') return startMumyo(opts);
    } catch (err) { G.reportError('combat:boss:' + id, err); return Promise.resolve(false); }
    G.reportError('combat:boss', new Error('unknown boss ' + id));
    return Promise.resolve(false);
  }

  function update(dt) {
    const b = B.active;
    if (!b || b.proxy) return;
    b.t += dt;
    const e = b.enemy;
    if (!b.over) {
      testDrain(b, dt);
      // final-play2: thrown off the palace by 无明's hand (or flown away on the broom), she used to land 200 m below with the
      // fight still running and the boss bar up. Far from the arena for 4 s = the fight is called off (the normal retry path).
      const A = ARENAS[b.id], P = G.player;
      if (A && P && !P.dead) {
        const far = Math.hypot(P.pos.x - A.x, P.pos.z - A.z) > A.r + 45 || (b.id === 'mumyo' && e.data.top != null && P.pos.y < e.data.top - 25);
        b.leftT = far ? (b.leftT || 0) + dt : 0;
        if (b.leftT > 4) { G.ui?.toast?.(t('combat.boss.left', { name: t('combat.boss.' + b.id) }), { dur: 3.5 }); end(false); }
      }
      try { b.onUpdate?.(b, dt); } catch (err) { G.reportError('combat:boss:update', err); }
      if (e.hp <= 0 && !b.over) end(true);
    }
    const hpk = Math.round(e.hp);
    if (hpk !== b.hpShown && !b.over) {
      b.hpShown = hpk;
      G.ui?.bossBar?.({ name: t('combat.boss.' + b.id), hp: Math.max(0, e.hp), max: e.maxHp, kind: 'shade', sub: t('combat.boss.sub.' + b.id) });
    }
    if (b.over) {
      b.endT += dt;
      if (e.data.sinking) e.data.base.y -= dt * 8;
      if (b.endT > (b.won ? 3 : 1.5)) {
        B.active = null;
        cleanup(b);
        b.resolve(b.won);
      }
    }
  }

  function abort() {
    const b = B.active;
    if (!b) return;
    if (b.proxy) { B.active = null; C._duels?.abort(); return; }
    b.over = true; b.won = false;
    B.active = null;
    for (const a of b.adds) if (!a.dead) C.despawn(a);
    cleanup(b);
    b.resolve(false);
  }

  B.start = start; B.update = update; B.abort = abort;
  return B;
}
