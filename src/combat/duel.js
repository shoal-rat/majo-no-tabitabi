// Duels with rival mages (阳葵 / 九重 / 六花 / 鸣) and the engine 胧夜 reuses as a boss. Rivals are humanoids that use the
// player's own spell book through G.spells.cast: small forms with a short tell, guard against incoming bolts, dodges,
// a charged big form announced as a set piece, and a sun beam that invites the beam struggle.
// A duel has a ring, ends at 0 hp without death (the loser kneels) and restores both afterwards.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { glow } from '../core/mats.js';
import { clamp, TAU, angleDiff } from '../core/util.js';
import { DUEL_RINGS, ARENAS } from '../data/camps.js';
import { flatDir, darkOrb, warnAt, DARK } from './attacks.js';
import { createWitchTrial } from './witchTrial.js';
import { incoming } from './types.js';
import { CLIPS, CAST_OF } from '../actors/clips.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();
const ALL = ['fire', 'water', 'ice', 'wind', 'thunder', 'earth', 'sun', 'moon'];

/** Personalities. range = preferred [min,max] distance; cd = small-cast cooldown; big = seconds between set pieces. */
export const RIVALS = {
  himawari: { asset: 'char_himawari', el: 'fire', hp: 260, speed: 4.6, range: [5, 10], cd: 1.15, big: 10, beam: 0.95, dodge: 0.25, guard: 0.35, power: 0.8 },
  kokonoe: { asset: 'char_kokonoe', el: 'wind', hp: 240, speed: 5.2, range: [8, 13], cd: 1.3, big: 12, beam: 1.0, dodge: 0.45, guard: 0.3, power: 0.8, feint: 6.5 },
  rikka: { asset: 'char_rikka', el: 'ice', hp: 270, speed: 3.6, range: [11, 16], cd: 1.5, big: 11, beam: 1.05, dodge: 0.3, guard: 0.6, power: 0.85, keepAway: true },
  naru: { asset: 'char_naru', el: 'thunder', hp: 240, speed: 4.8, range: [9, 14], cd: 1.2, big: 10, beam: 1.0, dodge: 0.4, guard: 0.3, power: 0.8, triple: true },
  oboroyo: { asset: 'char_oboroyo', el: 'all', hp: 1100, speed: 4.4, range: [8, 15], cd: 1.0, big: 8, beam: 1.15, dodge: 0.4, guard: 0.5, power: 0.65, boss: true, tint: true }, // pt-b: power 1 → small casts hit 28–35, the earth big form 99 (one-shot)
};

export function createDuels(C) {
  const D = { active: null };
  let ringMesh = null, wallMesh = null;

  function ringVisual(cx, cy, cz, r, color) {
    if (!ringMesh) {
      ringMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 96), glow(0xffd27a, 2.2));
      ringMesh.rotation.x = Math.PI / 2;
      const wm = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      wallMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), wm);
    }
    ringMesh.material = glow(color, 2.2);
    wallMesh.material.color.set(color).multiplyScalar(1.2);
    ringMesh.scale.set(r, r, r); ringMesh.position.set(cx, cy + 0.15, cz);
    wallMesh.scale.set(r, 3.2, r); wallMesh.position.set(cx, cy + 1.6, cz);
    G.scene.add(ringMesh, wallMesh);
  }
  function hideRing() { ringMesh?.parent?.remove(ringMesh); wallMesh?.parent?.remove(wallMesh); }

  function confine(pos, cx, cz, r) {
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d > r) { pos.x = cx + dx / d * r; pos.z = cz + dz / d * r; return true; }
    return false;
  }

  function hand(e, out) { return out.set(e.pos.x + Math.sin(e.yaw) * 0.5 + Math.cos(e.yaw) * 0.25, e.pos.y + 1.25, e.pos.z + Math.cos(e.yaw) * 0.5 - Math.sin(e.yaw) * 0.25); }
  /** Play the element's own cast gesture so its release mark lands `lead` seconds from now (when the spell spawns). */
  function castAt(en, el, lead) {
    const st = CAST_OF[el] || 'cast_fire', d = CLIPS[st];
    let speed = d.speed || 1, from = d.release - lead * speed;
    if (from < 0) { from = 0; speed = Math.max(0.5, d.release / Math.max(0.05, lead)); }
    en.actor?.play(st, { layer: 'upper', restart: true, from, speed });
  }
  function pickEl(cfg) { return cfg.el === 'all' ? ALL[Math.floor(Math.random() * ALL.length)] : cfg.el; }
  function elColor(el) { return G.fx?.elementColor?.(el, 0xffd27a) ?? 0xffd27a; }

  function cast(e, el, form, extra = {}) {
    const P = G.player;
    if (!P || !G.spells?.cast) return null;
    hand(e, _o);
    flatDir(e.pos, P.pos, _d);
    try {
      return G.spells.cast(el, form, { caster: e, origin: _o.clone(), dir: _d.clone(), target: P, point: extra.point || P.pos.clone(), team: 'enemy', power: (e.cfg.power ?? 1) * (extra.power ?? 1), ...extra });
    } catch (err) { G.reportError('combat:duelcast', err); return null; }
  }

  /** The rival brain (def.think). */
  function think(e, dt) {
    const d0 = D.active;
    const cfg = e.cfg, S = e.data, P = G.player;
    e.dir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    if (S.aura) S.aura.pos.copy(e.pos);
    if (!d0 || d0.over || !P || P.dead || G.mode !== 'play') { e.move.set(0, 0, 0); return; }
    if (S.guard) { S.guardT -= dt; if (S.guardT <= 0) { try { S.guard.stop?.(); } catch (er) { /* ignore */ } S.guard = null; e.actor?.stop('upper', 0.15); } }
    if (S.beam) {
      e.move.set(0, 0, 0);
      e.face(P.pos.x, P.pos.z, dt, 2);
      if (!S.beam.alive) { S.beam = null; e.actor?.play('cast_end', { layer: 'upper' }); }
      return;
    }
    if (e.stepAttack(dt)) { e.face(P.pos.x, P.pos.z, dt, 8); return; }
    const dist = Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
    S.cd -= dt; S.big -= dt; S.gcd -= dt; S.dcd -= dt; S.feint -= dt;

    // defence: guard or dodge an incoming bolt
    if (S.gcd <= 0 && incoming(e, 10)) {
      S.gcd = 2.2;
      const r = Math.random();
      if (r < cfg.guard) {
        try { S.guard = G.spells?.cast('guard', 'small', { caster: e, team: 'enemy', dir: e.dir }) || null; } catch (er) { S.guard = null; }
        S.guardT = 0.9;
        e.actor?.play('guard', { layer: 'upper' });
        return;
      }
      if (r < cfg.guard + cfg.dodge && S.dcd <= 0) { dodge(e); return; }
    }
    // the beam set piece (once per phase, below 55 % hp) — invites the struggle
    if (!S.beamed && e.hp < e.maxHp * (d0.beamAt ?? 0.55)) { S.beamed = true; beamPiece(e); return; }
    // kokonoe: teleport feint
    if (cfg.feint && S.feint <= 0 && dist < 16) { S.feint = cfg.feint + Math.random() * 2; feint(e); return; }
    // the big form as a set piece
    if (S.big <= 0) { S.big = cfg.big + Math.random() * 3; bigPiece(e); return; }
    // rikka slips away from close range with a frost burst
    if (cfg.keepAway && dist < 4.5 && S.cd <= 0) {
      S.cd = 2.5;
      e.attack('frost', 0.7, 0.6, (en) => { cast(en, 'ice', 'big', { point: en.pos.clone() }); dodge(en, true); },
        { tell: (en) => { warnAt(en.pos, 8, 0.7, 0xbfefff); castAt(en, 'ice', 0.7); } });
      return;
    }
    if (S.cd <= 0 && dist < 26) {
      S.cd = cfg.cd * (0.8 + Math.random() * 0.5) * (d0.phase >= 2 ? 0.8 : 1);
      const el = pickEl(cfg);
      const n = cfg.triple && Math.random() < 0.4 ? 3 : 1;
      e.attack('cast', el === 'thunder' ? 0.45 : 0.35, 0.35, (en) => {
        for (let i = 1; i < n; i++) C.after(i * 0.32 - 0.12, () => { if (!en.dead) castAt(en, el, 0.12); }, en);
        for (let i = 0; i < n; i++) C.after(i * 0.32, () => { if (!en.dead && D.active && !D.active.over) cast(en, el, 'small', { point: _v.set(P.pos.x + (i ? (Math.random() - 0.5) * 4 : 0), P.pos.y, P.pos.z + (i ? (Math.random() - 0.5) * 4 : 0)).clone() }); }, en);
        if (cfg.boss && Math.random() < 0.35) C.after(0.25, () => { if (!en.dead) { hand(en, _o); darkOrb(en, _o, P, { speed: 12, damage: 12, turn: 0.5 }); } }, en);
      }, { tell: (en) => { castAt(en, el, el === 'thunder' ? 0.45 : 0.35); G.fx?.sigil?.(en.pos, { color: elColor(el), radius: 1.1, dur: 0.45 }); } });
      return;
    }
    // footwork: keep the preferred range, strafe around
    const [rmin, rmax] = cfg.range;
    S.side = S.sideT > 0 ? S.side : (Math.random() < 0.5 ? 1 : -1);
    S.sideT = (S.sideT > 0 ? S.sideT : 2 + Math.random() * 2) - dt;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, dd = Math.max(0.01, Math.hypot(dx, dz));
    const rx = dx / dd, rz = dz / dd;
    const pull = dist > rmax ? -1 : dist < rmin ? 1 : 0;
    const sp = cfg.speed * (d0.phase >= 2 ? 1.15 : 1);
    e.move.set((-rz * S.side + rx * pull) * sp * 0.75, 0, (rx * S.side + rz * pull) * sp * 0.75);
    e.face(P.pos.x, P.pos.z, dt, 9);
    // footwork: the speed-matched gait blend; legs run toward the motion while the chest keeps facing her (strafe / back-step)
    if (e.actor) {
      const mv = Math.hypot(e.move.x, e.move.z);
      let rel = mv > 0.4 ? angleDiff(e.yaw, Math.atan2(e.move.x, e.move.z)) : 0;
      const back = Math.abs(rel) > 1.95;
      e.actor.legYaw = back ? clamp(angleDiff(Math.PI, rel), -0.95, 0.95) : clamp(rel, -1.05, 1.05);
      if (!e.actor.busy || e.actor.current === 'move') e.actor.move(mv, { back });
    }
  }

  function dodge(e, back = false) {
    const P = G.player;
    flatDir(P.pos, e.pos, _d);
    const s = Math.random() < 0.5 ? 1 : -1;
    const dx = back ? _d.x : -_d.z * s, dz = back ? _d.z : _d.x * s;
    e.vel.x += dx * 11; e.vel.z += dz * 11;
    e.iframes = 0.35;
    e.data.dcd = 1.6;
    e.actor?.play('dodge', { once: true });
    G.fx?.burst('dash', e.pos, { dir: _d.set(dx, 0, dz) });
    G.audio?.sfx('dodge', { pos: e.pos });
  }

  function feint(e) {
    const P = G.player;
    const a = P.yaw + Math.PI + (Math.random() - 0.5) * 1.2;
    const to = new THREE.Vector3(P.pos.x + Math.sin(a) * 7, 0, P.pos.z + Math.cos(a) * 7);
    if (D.active) confine(to, D.active.cx, D.active.cz, D.active.r - 1);
    to.y = G.world.groundAt(to.x, to.z, P.pos.y + 2);
    G.fx?.burst('leaves', to, { scale: 1.2 });
    e.attack('feint', 0.5, 0.2, (en) => {
      G.fx?.burst('leaves', en.centerOut(_v), { scale: 1.5 });
      G.fx?.burst('hit_wind', _v, { scale: 1.2 });
      en.pos.copy(to); en.vel.set(0, 0, 0);
      G.fx?.burst('hit_wind', en.centerOut(_v), { scale: 1.2 });
      G.audio?.sfx('teleport', { pos: en.pos });
      en.face(P.pos.x, P.pos.z, 0);
      en.data.cd = 0.25;
    }, { tell: (en) => { G.fx?.burst('leaves', en.centerOut(_v), { scale: 0.8 }); en.iframes = 0.6; } });
  }

  function bigPiece(e) {
    const P = G.player, cfg = e.cfg;
    const el = cfg.el === 'all' ? ['fire', 'ice', 'thunder', 'earth', 'wind', 'moon'][Math.floor(Math.random() * 6)] : cfg.el;
    const target = P.pos.clone();
    const name = t('spells.book.' + el + '.big');
    const windup = D.active?.trial ? 2.05 : 1.4;
    const marks = [];
    e.attack('big', windup, 0.8, (en) => {
      cast(en, el, 'big', { point: el === 'moon' || el === 'thunder' || el === 'earth' ? P.pos.clone() : target, power: cfg.boss ? 0.45 : 1 }); // (extra.power replaces cfg.power in cast())
    }, { tell: (en) => {
      D.active?.trial?.telegraph();
      const casting=en.atk;
      en.actor?.play('cast_channel', { layer: 'upper' });   // gather (Charge_Loop), then the element's gesture lands on the spawn
      C.after(windup - 0.34, () => { if (!en.dead && en.atk===casting) castAt(en, el, 0.34); }, en);
      marks.push(G.fx?.sigil?.(en.pos, { color: elColor(el), radius: 2.6, dur: windup, intensity: 1.8, tracked: true }));
      G.fx?.burst('charge_done', en.centerOut(_v), { color: elColor(el), scale: 1.4 });
      _v.y += 1.6;
      G.fx?.text?.(_v, name, { kind: 'word', target: en, color: elColor(el), size: 1.25, dur: windup });
      G.audio?.sfx('charge', { pos: en.pos });
      if (el !== 'thunder' && el !== 'moon') warnAt(target, el === 'earth' ? 9 : el === 'fire' ? 7 : 6, windup + 0.6, elColor(el), marks);
    }, cancel: () => { for (const stop of marks) stop?.(); }, during: (en) => { en.face(P.pos.x, P.pos.z, 0.016, 6); } });
  }

  function beamPiece(e, o = {}) {
    G.ui?.toast?.(t('combat.duel.beamTell', { key: G.input?.keyLabel?.('cast') || '' }), { dur: 3.5 });
    e.attack('beam', o.windup ?? 1.5, 0.1, (en) => {
      const h = cast(en, 'sun', 'big', { duration: o.duration ?? 5.5, strength: en.cfg.beam ?? 1 });
      if (h) { en.data.beam = h; if (o.color) { try { h.fx?.setColor?.(o.color); } catch (er) { /* ignore */ } } }
    }, { tell: (en) => {
      en.actor?.play('cast_channel', { layer: 'upper' });
      G.fx?.sigil?.(en.pos, { color: o.color ?? 0xffd27a, radius: 2.2, dur: o.windup ?? 1.5, intensity: 2 });
      G.fx?.burst('charge_done', en.centerOut(_v), { color: o.color ?? 0xffd27a, scale: 1.6 });
      G.audio?.sfx('charge', { pos: en.pos });
    } });
  }

  /** ★ startDuel(id, opts) -> Promise<boolean won>. opts: { pos:{x,z}, r, testWin, boss } */
  function start(id, opts = {}) {
    const cfg = RIVALS[id];
    if (!cfg) { G.reportError('combat:duel', new Error('unknown rival ' + id)); return Promise.resolve(false); }
    if (D.active) abort();
    const P = G.player;
    const ringDef = opts.pos ? { x: opts.pos.x, z: opts.pos.z, r: opts.r ?? 15 } : (DUEL_RINGS[id] || ARENAS[id] || { x: P?.pos.x ?? 0, z: P?.pos.z ?? 0, r: 15 });
    const cx = ringDef.x, cz = ringDef.z, r = opts.r ?? ringDef.r;
    const cy = G.world.groundAt(cx, cz, 1e4);
    const isBoss = !!(cfg.boss || opts.boss);
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    const d = { id, cfg, cx, cz, cy, r, resolve, over: false, won: false, t: 0, phase: 1, boss: isBoss, opts, hpShown: -1, beamAt: opts.beamAt ?? (isBoss ? 0.66 : 0.55) };
    D.active = d;
    // the heroine into the ring
    if (P) {
      const pd = Math.hypot(P.pos.x - cx, P.pos.z - cz);
      if (pd > r - 1 || opts.place !== false) { const px = cx, pz = cz + r * 0.55; P.teleport?.(px, undefined, pz); if (P.yaw !== undefined) P.yaw = Math.PI; }
      d.restore = { hpFloor: null };
      if (isBoss && P.takeDamage && cfg.power != null && cfg.power < 1) {
        // final-play2: most spell entities take their damage from the spell book and ignore the caster's power, so 胧夜's
        // power 0.65 never applied (small casts hit 31, the earth big form 99 = a one-shot from full hp). Her hits on the
        // heroine are scaled here, and anything past 35 is softened further (meteor 99 -> ~44, struggle blast 60 -> ~36).
        const orig = P.takeDamage, k = cfg.power;
        d.restore.orig = orig;
        P.takeDamage = function (amount, o = {}) {
          const s = o && o.source, ow = d.enemy;
          if (ow && s && (s === ow || s.caster === ow || s.owner === ow)) {
            let a = amount * k;
            if (a > 35) a = 35 + (a - 35) * 0.3;
            return orig.call(this, a, o);
          }
          return orig.call(this, amount, o);
        };
      }
      if (!isBoss && P.takeDamage) {
        {
          // player.damageFloor: hp stays >= 1, the hit that reaches it loses the duel
          d.restore.floor = { prev: P.damageFloor ?? null, prevCb: P.onDamageFloor ?? null };
          P.damageFloor = 1;
          P.onDamageFloor = () => { if (D.active === d && !d.over) d.lose = true; };
        }
      }
    }
    const def = {
      humanoid: true, asset: cfg.asset, tint: null, material: 'flesh', hp: cfg.hp, radius: 0.45, height: 1.65, boss: true, heavy: true, noBar: true, awake: true,
      speed: cfg.speed, sight: 99, think, capsule: true, brave: true,
    };
    const e = C.spawn('rival', new THREE.Vector3(cx, cy, cz - r * 0.5), { def, persistent: true, aggro: true, yaw: 0 });
    if (!e) { D.active = null; resolve(false); return promise; }
    e.cfg = cfg; e.rivalId = id;
    e.dir = new THREE.Vector3(0, 0, 1);
    Object.assign(e.data, { cd: 1.5, big: cfg.big * 0.6, gcd: 0, dcd: 0, feint: cfg.feint ?? 99, side: 1, sideT: 0 });
    if (cfg.tint && e.actor) e.actor.setTint({ color: 0x9a86d8, emissive: 0x3a1670, emissiveIntensity: 0.5 });
    const aura = G.fx?.emitter?.('aura_' + (cfg.el === 'all' ? 'moon' : cfg.el), { color: cfg.el === 'all' ? DARK : cfg.el, scale: 0.8 });
    if (aura) { e.data.aura = aura; e.own(() => aura.remove()); }
    e.onZero = () => finish(true);
    if (isBoss) e.onDamage = (n, info) => (d.invuln && !info.force ? 0 : n);
    d.enemy = e;
    if (!isBoss) { d.trial = createWitchTrial(d); e.onDamage = d.trial.hit; }
    ringVisual(cx, cy, cz, r, isBoss ? 0xb48cff : elColor(cfg.el));
    G.fx?.ring?.(_v.set(cx, cy, cz), { color: 0xffd27a, radius: r, dur: 1 });
    G.audio?.sfx('taiko', { vol: 0.9 });
    const name = t('combat.rival.' + id);
    if (isBoss) G.events.emit('boss:start', { id, name });
    else G.events.emit('duel:start', { id });
    G.ui?.banner?.(name, t(isBoss ? 'combat.boss.sub.' + id : 'combat.duel.sub'), { foe: true });
    d.offDied = G.events.on('player:died', () => { if (D.active === d && !d.over) finish(false); });
    return promise;
  }

  function finish(won) {
    const d = D.active;
    if (!d || d.over) return;
    d.over = true; d.won = won; d.endT = 0;
    const e = d.enemy, P = G.player;
    try { e.data.guard?.stop?.(); e.data.beam?.stop?.(); } catch (er) { /* ignore */ }
    e.stopAttack(); e.move.set(0, 0, 0);
    e.iframes = 99;
    if (won) {
      e.actor?.stop('upper', 0.1);
      e.actor?.play('kneel_work', { fade: 0.35 });
      G.fx?.burst('hit_sun', e.centerOut(_v), { scale: 1.6 });
      G.hitstop(0.12); G.fx?.shake?.(0.3, 0.4);
      G.ui?.toast?.(t(d.boss ? 'combat.boss.win' : 'combat.duel.win', { name: t('combat.rival.' + d.id) }), { dur: 3 });
    } else {
      if (P && !P.dead) { P.setControl?.(false); P.playAction?.('kneel_work', { loop: true }); }
      e.actor?.play('cheer', { fade: 0.3 });
      G.ui?.toast?.(t('combat.duel.lose'), { dur: 3 });
    }
  }

  function cleanup(d) {
    const P = G.player;
    if (d.restore?.orig && P) P.takeDamage = d.restore.orig;
    if (d.restore?.floor && P) { P.damageFloor = d.restore.floor.prev; P.onDamageFloor = d.restore.floor.prevCb; }
    d.trial?.close();
    d.offDied?.();
    hideRing();
    G.ui?.bossBar?.(null);
    G.ui?.struggle?.(null);
    if (d.enemy && !d.enemy.dead) { d.enemy.stopAttack(); C.despawn(d.enemy); }
    for (const a of d.adds || []) if (!a.dead) C.kill(a, 'purify');
    if (P && !d.boss) {
      P.setControl?.(true);
      if (!P.dead) { P.hp = P.maxHp; P.mana = P.maxMana; P.rig?.play?.('idle'); }
      G.spells?.clear?.();
    }
  }

  function update(dt) {
    const d = D.active;
    if (!d) return;
    d.t += dt;
    const e = d.enemy, P = G.player;
    if (!d.over && P && !P.dead) {
      if (confine(P.pos, d.cx, d.cz, d.r - 0.4)) G.fx?.burst('spark', _v.set(P.pos.x, P.pos.y + 1, P.pos.z), { scale: 0.4, color: 0xffd27a });
      confine(e.pos, d.cx, d.cz, d.r - 0.8);
      if (d.lose) finish(false);
      d.trial?.tick(dt);
      if (d.opts.testWin && d.t > 1.5) { d.drain = (d.drain || 0) + e.maxHp * 0.16 * dt; if (d.drain >= 1) { const n = Math.floor(d.drain); d.drain -= n; C.damage(e, n, { element: 'sun', force: true, silentText: true, silentHit: true, dot: true }); } }
      if (d.boss) d.onUpdate?.(d, dt);
    }
    const hpk = Math.round(e.hp);
    if (hpk !== d.hpShown && !d.over) {
      d.hpShown = hpk;
      G.ui?.bossBar?.({ name: t('combat.rival.' + d.id), hp: Math.max(0, e.hp), max: e.maxHp, kind: d.boss ? 'boss' : 'duel', element: d.cfg.el === 'all' ? 'moon' : d.cfg.el, sub: t(d.boss ? 'combat.boss.sub.' + d.id : 'combat.duel.sub') });
    }
    if (d.over) {
      d.endT += dt;
      if (d.endT > 2.6) {
        D.active = null;
        cleanup(d);
        if (!d.boss) G.events.emit('duel:end', { id: d.id, won: d.won });
        d.resolve(d.won);
      }
    }
  }

  function abort() {
    const d = D.active;
    if (!d) return;
    d.over = true; d.won = false;
    D.active = null;
    cleanup(d);
    if (!d.boss) G.events.emit('duel:end', { id: d.id, won: false });
    d.resolve(false);
  }

  D.start = start; D.update = update; D.abort = abort; D.finish = finish; D.beamPiece = beamPiece; D.cast = cast;
  return D;
}
