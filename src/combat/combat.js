// combat — G.combat: enemies, damage, lock-on, camps / nests / waves, duels, bosses and the living creatures of the world.
// DESIGN §3.4, §3.5, §6.10. Modules: enemy.js (body + damage resolution), types.js (seven foes), attacks.js (telegraphs,
// orbs, shockwaves, scheduler), spawner.js (camps, waves, nests), duel.js (rival mages), bosses.js, wildlife.js.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { PAL } from '../core/mats.js';
import { clamp } from '../core/util.js';
import { Enemy, EL_TEXT, drainPool } from './enemy.js';
import { TYPES } from './types.js';
import { after, cancelTimers, updateTimers, timerCount } from './attacks.js';
import { createSpawner, MAX_ACTIVE } from './spawner.js';
import { createDuels } from './duel.js';
import { createBosses } from './bosses.js';
import { createWildlife } from './wildlife.js';
import { creaturePoolStats } from '../actors/creature.js';
import { warmScene, warmCreatures } from '../render/warmup.js';
import { installBeasts } from './beasts.js';
import { installRogues } from './rogues.js';
import { wardHit, updateWard, poiseHit, updatePoise, affixEvent, COUNTER, counterOf, makeElite } from './wards.js';
import { updatePatterns, clearPatterns } from './patterns.js';
import { createEncounters } from './encounters.js';
import { createCombo } from './combo.js';
import { createTrials } from './trials.js';
import { warnAt, shockwave } from './attacks.js';
import { installPacing, committed, hitFeedback, checkRally, fling, updateFling, mine } from './pacing.js';

/** plain damage numbers (the charm stream, unaligned blows): white to gold */
const DMG_GOLD = 0xffc24e, DMG_CRIT = 0xffae3a;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();
const SLEEP_R = 62;

const enemies = [];
const dying = [];
let spawner = null, duels = null, bosses = null, wildlife = null, encounters = null, combo = null, trials = null;
let combatT = -99;

const C = {
  enemies,
  TYPES,
  MAX_ACTIVE,
  lockTarget: null,
  /** true while something is actively fighting the heroine (drives the battle music). */
  inCombat: false,
  campsEnabled: true,
  /** set by encounters every frame: story scenes / the eclipse crossing / a trial — foes stand down */
  calm: false,
  /** tests: spawn journey camps even before the heroine has left home */
  forceArmed: false,
  /** the clearing trial (combat/trials.js) while it runs, else null */
  trial: null,
  counterOf,
  /** makeElite(e, affixes): turn a spawned foe into an elite (encounters.js uses it; the pacing probe too) */
  makeElite,
  /** extra lock-on targets that are not Enemies (Fran in the spar): { pos, height, radius, lockRange, dead } like the
   *  bosses' lock points; one that is not dead also counts as a fight (inCombat: music, the touch lock button) */
  lockExtras: [],
  nestsEnabled: true,
  wildlifeEnabled: true,
  after,

  /** ★ spawn(type, pos, opts) -> Enemy | null. opts: { aggro, persistent, camp, wave, hp, hpMul, dmgMul, speedMul, yaw, element, def, snap } */
  spawn(type, pos, opts = {}) {
    const def = opts.def || TYPES[type];
    if (!def || !pos) { if (!def) G.reportError('combat:spawn', new Error('unknown enemy type ' + type)); return null; }
    try {
      _v.set(pos.x, pos.y, pos.z);
      if (opts.snap !== false || !(pos.y === pos.y)) {
        const gy = G.world.groundAt(_v.x, _v.z, (pos.y === pos.y ? pos.y : 1e4) + 1);
        _v.y = def.fly ? gy + (def.hover ?? 1) : gy;
      }
      const e = new Enemy(type, def, _v, opts);
      if (def.onSpawn) def.onSpawn(e);
      enemies.push(e);
      G.events.emit('enemy:spawned', { enemy: e });
      return e;
    } catch (err) { G.reportError('combat:spawn:' + type, err); return null; }
  },

  /** ★ damage(enemy, amount, info) -> damage dealt. info: { element, source, mult, heavy, shatter, purify, dot, dir, pos, by, silentHit } */
  damage(e, amount, info = {}) {
    if (!e || e.dead || !(amount > 0)) return 0;
    if (e.iframes > 0 && !info.dot) return 0;
    let n = amount;
    let countered = false, exposed = false, brokeWard = false;
    if (!info.force) {
      if (e.def.damageScale) n *= e.def.damageScale(e, info);
      if (e.material === 'shade') n *= 1 + 0.3 * clamp(e.light);
      if (e.exposedT > 0 && !info.dot) { n *= 1.5; exposed = true; info.mult = (info.mult || 1) * 1.5; }
      if (e.ward && e.ward.hp > 0) {
        const c = COUNTER[e.ward.el];
        countered = !!(info.element && c && c.includes(info.element));
        n = Math.max(n > 0 ? 1 : 0, wardHit(e, n, info));
        if (!e.ward || e.ward.hp <= 0) { countered = true; brokeWard = true; }
      }
    }
    if (e.onDamage) n = e.onDamage(n, info);
    if (!(n > 0)) return 0;
    n = Math.max(1, Math.round(n));
    e.hp -= n;
    e.lastHitT = G.time.t;
    if (info.source && info.source !== e) e.hitBy = info.source;
    e.aggro = true;
    combatT = G.time.t;
    const at = e.centerOut(_v);
    at.y = e.pos.y + e.height + 0.25;
    const big = n >= 30 || info.shatter;
    if (!info.silentText) {
      // a big hit pops on its own: the hit-stop tier (≥30), a shatter, a ward broken by this blow, or a reaction / crit
      // (exposed, a multiplier) that lands for real; the rest roll into one number per element (src/fx/text.js)
      const crit = exposed || (info.mult || 1) > 1.01;
      const pop = !info.dot && (big || brokeWard || ((crit || !!info.reaction) && n >= 18));
      const el = info.element && info.element !== 'sun' ? info.element : '';
      // tint: the element's colour (white → violet for thunder …); plain blows white → gold, a plain crit a deeper gold
      G.fx?.text?.(at, String(n), { kind: 'dmg', target: e, n, el, big: pop, color: el ? EL_TEXT[el] : crit ? DMG_CRIT : DMG_GOLD });
    }
    if (!info.dot) {
      e.hitFlash();
      // a committed wind-up (pacing.js) holds through flinches: it pushes less and is not cancelled
      const held = committed(e);
      if (!e.def.heavy && !e.boss && !e.def.noKnock) {
        if (info.dir && info.dir.lengthSq && info.dir.lengthSq() > 0.01) _f.set(info.dir.x, 0, info.dir.z);
        else { const s = info.source?.pos || G.player?.pos; if (s) _f.set(e.pos.x - s.x, 0, e.pos.z - s.z); else _f.set(0, 0, 0); }
        if (_f.lengthSq() > 1e-4) {
          _f.normalize();
          // airborne foes barely brake (friction 0.6), so a body in the air takes less push and only real blows lift it
          const kb = clamp(1.5 + n * 0.12, 1.5, 9) * (info.heavy ? 1.5 : 1) * (held ? 0.3 : 1) * (e.grounded || e.fly ? 1 : 0.4);
          e.vel.x += _f.x * kb; e.vel.z += _f.z * kb;
          if (n >= 26 && !e.fly && !held && e.grounded) e.vel.y = Math.max(e.vel.y, 2.5);
        }
        // a flinch needs a real blow and comes at most every 1.2 s: the charm stream no longer stun-locks a foe
        if (n >= 18 && !held && G.time.t - (e._flinchT ?? -9) > 1.2) { e._flinchT = G.time.t; e.stun(Math.min(0.45, 0.1 + n * 0.006)); }
      }
      if (!info.silentHit) G.audio?.sfx(big || exposed ? 'hit_heavy' : 'enemy_hit', { pos: e.pos, vol: big ? 0.9 : exposed ? 0.7 : 0.6, pitch: exposed && !big ? 1.25 : 0.92 + Math.random() * 0.16 });
      hitFeedback(e, n, info, exposed);
      if (e.cr && !e.atk && !e.cr.busy && e.cr.has('hit')) e.cr.play('hit', { once: true, speed: 1.4 });
    }
    G.events.emit('enemy:hit', { enemy: e, amount: n, element: info.element || null, pos: e.pos.clone(), by: info.source || null, dot: !!info.dot, countered, exposed, reaction: info.reaction || null });
    try { e.def.onDamaged?.(e, n, info); } catch (err) { G.reportError('combat:onDamaged', err); }
    // the killing blow does not stagger, rally or trigger an affix (a dying blink elite used to teleport beside her)
    if (!e.dead && e.hp > 0) { poiseHit(e, n, info, countered); affixEvent(e, 'onDamaged', n, info); checkRally(e); }
    if (e.hp <= 0 && !e.dead) {
      if (e.onZero) { e.hp = 0; e.onZero(info); }
      else C.kill(e, info.by || info.element || 'hit');
    }
    return n;
  },

  /** Kill now. o: { silent (no event / drops / count), noDrop } */
  kill(e, by = 'hit', o = {}) {
    if (!e || e.dead) return;
    e.dead = true;
    e.hp = 0;
    const i = enemies.indexOf(e);
    if (i >= 0) enemies.splice(i, 1);
    if (C.lockTarget === e) C.lockTarget = null;
    const pos = e.centerOut(new THREE.Vector3());
    e.detach();
    try { e.def.onDeath?.(e, by); } catch (err) { G.reportError('combat:onDeath', err); }
    if (!o.silent) affixEvent(e, 'onDeath', pos);
    if (!o.silent) {
      G.fx?.burst(e.material === 'paper' ? 'hit_fire' : 'purify', pos, { scale: clamp(0.8 + e.radius * 0.8, 0.8, 3), color: e.def.dissolve });
      if (by === 'sun' || by === 'purify') G.fx?.burst('hit_sun', pos, { scale: 1.2 });
      G.events.emit('enemy:killed', { enemy: e, type: e.type, pos, by });
      if (G.state?.stats) G.state.stats.kills = (G.state.stats.kills || 0) + 1;
      if (!o.noDrop) drop(e, pos);
      combatT = G.time.t;
      if (by !== 'self' && by !== 'split' && by !== 'caught') { fling(e); if (mine(e.hitBy) || e.hitBy == null) G.hitstop(0.05); }
    }
    spawner?.onKilled(e);
    if (e.actor) { e.actor.play('death', { once: true }); e._dieT = 1.6; }
    else e.cr?.dissolve(o.silent ? 0.15 : 0.9, e.def.dissolve ?? PAL.shadeGlow);
    dying.push(e);
  },

  /** Remove without dying (streaming out). */
  despawn(e) {
    if (!e) return;
    const i = enemies.indexOf(e);
    if (i >= 0) enemies.splice(i, 1);
    if (C.lockTarget === e) C.lockTarget = null;
    e.dead = true;
    spawner?.onKilled(e);
    e.dispose();
  },

  /** ★ nearest(pos, r, filter?) -> Enemy | null */
  nearest(pos, r = 20, filter) {
    let best = null, bd = r * r;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const dx = e.pos.x - pos.x, dy = (e.pos.y + e.height * 0.5) - pos.y, dz = e.pos.z - pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd && (!filter || filter(e))) { bd = d; best = e; }
    }
    return best;
  },
  /** All live enemies within r (array, new). */
  within(pos, r) { return enemies.filter((e) => !e.dead && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < r); },

  /** ★ spawnWave(id | list, pos?, opts?) -> Promise (resolves when all are dead) */
  spawnWave(id, pos, opts) { return spawner ? spawner.spawnWave(id, pos, opts) : Promise.resolve(); },
  /** ★ startDuel(id, opts?) -> Promise<boolean won>. opts: { pos, testWin } */
  startDuel(id, opts) { return duels ? duels.start(id, opts) : Promise.resolve(false); },
  /** ★ startBoss(id, opts?) -> Promise<boolean won>. opts: { testWin } */
  startBoss(id, opts) { return bosses ? bosses.start(id, opts) : Promise.resolve(false); },
  leaveDuel() {
    const d = duels?.active;
    if (!d || d.boss || d.over || !d.opts.practice) return false;
    duels.abort();
    return true;
  },
  get duel() { return duels?.active || null; },
  get boss() { return bosses?.active || null; },

  /** Lock-on: cycle to the next target in front of the camera (null clears). */
  cycleLock() {
    const P = G.player, cam = G.camera;
    if (!P || !cam) return null;
    cam.getWorldDirection(_f);
    const cand = [];
    // boss lock points (无明's weak points) join the candidates, with their own range
    const lp = C.boss?.enemy?.data?.lockPoints;
    let pool = lp && lp.length ? enemies.filter((e) => !e.data?.lockPoints).concat(lp) : enemies;
    if (C.lockExtras.length) pool = pool.concat(C.lockExtras);
    for (const e of pool) {
      if (e.dead || e.dormant) continue;
      const d = e.pos.distanceTo(P.pos);
      if (d > (e.lockRange || 35)) continue;
      _w.set(e.pos.x - cam.position.x, e.pos.y + e.height * 0.5 - cam.position.y, e.pos.z - cam.position.z).normalize();
      const dot = _w.dot(_f);
      if (dot < 0.2) continue;
      cand.push({ e, s: (1 - dot) * 30 + d * 0.15 });
    }
    cand.sort((a, b) => a.s - b.s);
    if (!cand.length) { C.lockTarget = null; return null; }
    const idx = cand.findIndex((c) => c.e === C.lockTarget);
    C.lockTarget = idx < 0 ? cand[0].e : idx + 1 < cand.length ? cand[idx + 1].e : null;
    G.audio?.sfx(C.lockTarget ? 'ui_select' : 'ui_cancel_soft', { vol: 0.5 });
    return C.lockTarget;
  },

  /** A volatile elite's last word: a ring that bursts 1.3 s after it falls. */
  volatileBlast(at) {
    warnAt(at, 4.6, 1.3, 0xffb347);
    C.after(1.3, () => { shockwave(null, at, 4.6, 16, { color: 0xffb347, burst: 'explosion', jumpable: false, knock: 8, shake: 0.35, impulse: 10 }); G.audio?.sfx('explosion', { pos: at }); });
  },
  get encounters() { return encounters; },
  get combo() { return combo; },
  get trials() { return trials; },

  /** Remove every enemy, wave, nest, duel, boss (not the wildlife). */
  clear() {
    duels?.abort(); bosses?.abort();
    trials?.abort();
    encounters?.clear();
    clearPatterns();
    combo?.reset();
    for (const e of enemies.slice()) C.despawn(e);
    for (const e of dying) e.dispose();
    dying.length = 0;
    spawner?.clear();
    cancelTimers();
    C.lockTarget = null;
  },
  stats() {
    return { enemies: enemies.length, dying: dying.length, timers: timerCount(), awake: enemies.filter((e) => !e.dormant).length, ...creaturePoolStats(),
      wildlife: wildlife?.count || 0, camps: spawner?.camps.filter((c) => c.spawned).length || 0, nests: spawner?.nests.filter((n) => n.built).length || 0,
      duel: duels?.active?.id || null, boss: bosses?.active?.id || null, inCombat: C.inCombat, journey: encounters?.stats?.() || null };
  },
  get spawner() { return spawner; },
  get wildlife() { return wildlife; },
};

function drop(e, pos) {
  const d = e.def.drops;
  if (!d || !G.gameplay?.spawnPickup || e.noDrop) return;
  try {
    if (d.stardust) { const [a, b] = d.stardust; const n = a + Math.floor(Math.random() * (b - a + 1)); if (n > 0) G.gameplay.spawnPickup('stardust', pos, n); }
    // fix2: help when she is hurting — hp under 40 % raises the heart chance (every foe can drop one), under 25 % it is
    // certain; mana under 25 % at night gives a mana orb half the time
    const P = G.player, hpF = P && P.maxHp ? P.hp / P.maxHp : 1;
    const heart = hpF < 0.25 ? 1 : hpF < 0.4 ? Math.max(d.heart || 0, 0.55) : (d.heart || 0);
    if (heart && Math.random() < heart) G.gameplay.spawnPickup('heart', pos, 1);
    if (P && P.maxMana && P.mana / P.maxMana < 0.25 && (G.env?.light ?? 1) < 0.5 && Math.random() < 0.5) G.gameplay.spawnPickup('mana', pos, 1);
  } catch (err) { G.reportError('combat:drop', err); }
}

function updateEnemies(dt) {
  const P = G.player;
  const px = P?.pos?.x ?? G.env.focus.x, pz = P?.pos?.z ?? G.env.focus.z;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (!e || e.dead) continue;
    const d = Math.hypot(e.pos.x - px, e.pos.z - pz);
    e.dormant = d > SLEEP_R && !e.persistent && !e.boss && !e.def.awake;
    if (e.dormant) { e.move.set(0, 0, 0); continue; }
    try {
      const k = e.step(dt);
      if (!e.dead && k > 0 && !e.held) e.def.think?.(e, dt * e.k);
      else if (!e.dead && e.def.passive) e.def.passive(e, dt);
      if (!e.dead) updatePoise(e, dt);
      if (e.data.eliteAura) e.data.eliteAura.pos.set(e.pos.x, e.pos.y + 0.2, e.pos.z);
    } catch (err) { G.reportError('combat:enemy:' + e.type, err); }
    if (e.aggro && d < 30) combatT = G.time.t;
  }
  // separation (≤ 24 actives: n² is fine) and keep clear of the heroine
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dormant || a.held || a.def.collide === false) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dormant || b.held || b.def.collide === false) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-6 || Math.abs(a.pos.y - b.pos.y) > 2) continue;
      const d = Math.sqrt(d2), push = (rr - d) * 0.5;
      const wa = a.boss ? 0 : b.boss ? 1 : 0.5;
      a.pos.x -= dx / d * push * 2 * wa; a.pos.z -= dz / d * push * 2 * wa;
      b.pos.x += dx / d * push * 2 * (1 - wa); b.pos.z += dz / d * push * 2 * (1 - wa);
    }
    if (P && !P.dead && !a.fly) {
      const dx = a.pos.x - P.pos.x, dz = a.pos.z - P.pos.z, rr = a.radius + 0.42;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6 && Math.abs(a.pos.y - P.pos.y) < 1.6) { const d = Math.sqrt(d2); a.pos.x += dx / d * (rr - d); a.pos.z += dz / d * (rr - d); }
    }
  }
  for (const e of enemies) { if (!e.dormant || e._lastRender === undefined) { e.render(dt); e._lastRender = 1; } if (e.ward) updateWard(e, dt); }
  for (let i = dying.length - 1; i >= 0; i--) {
    const e = dying[i];
    let done;
    if (e.actor) { e.render(dt); e._dieT -= dt; done = e._dieT <= 0; if (e._dieT < 0.8 && !e._puffed) { e._puffed = true; G.fx?.burst('purify', e.centerOut(_v), { scale: 1.4 }); e.actor.group.visible = false; e.blob && (e.blob.visible = false); } }
    else { updateFling(e, dt); e.cr?.update(dt); done = !e.cr || e.cr.dissolved; if (e.bar) e.bar.visible = false; }
    if (done) { dying.splice(i, 1); e.dispose(); }
  }
}

export const combatSystem = {
  name: 'combat',
  async init(G) {
    G.combat = C;
    installPacing();
    installBeasts(TYPES);
    installRogues(TYPES);
    spawner = createSpawner(C);        // waves (the clearing trial); the journey's camps live in encounters.js
    encounters = createEncounters(C);
    combo = createCombo(C);
    trials = createTrials(C);
    trials.install();
    duels = createDuels(C);
    C._duels = duels;
    bosses = createBosses(C);
    wildlife = createWildlife(C);
    // thrown props (and 月引 throws) hurt what they hit
    G.events.on('physics:impact', (ev) => {
      if (!ev || ev.surface !== 'character' || !(ev.speed > 6) || !ev.body || !ev.pos) return;
      // physics now names what it hit (ev.owner); fall back to the nearest enemy for older payloads
      const own = ev.owner && enemies.includes(ev.owner) && !ev.owner.dead ? ev.owner : null;
      if (ev.owner && !own) return;   // hit the heroine / an NPC, not an enemy
      const e = own || C.nearest(ev.pos, 2.6, (x) => !x.boss || true);
      if (!e || G.time.t - (e._propHitT || -9) < 0.35) return;
      e._propHitT = G.time.t;
      const dmg = clamp(ev.speed * 1.4 + (ev.body.mass || 20) * 0.25, 8, 60);
      C.damage(e, dmg, { element: 'earth', heavy: true, dir: ev.body.vel, by: 'prop' });
    });
    // bright sun magic scatters shades
    G.events.on('element:applied', (ev) => {
      if (!ev || ev.element !== 'sun' || ev.team !== 'player' || !ev.pos || (ev.radius || 0) < 3) return;
      for (const e of enemies) {
        if (e.dead || e.material !== 'shade' || e.boss || e.def.brave || e.def.noFlee) continue;
        if (Math.hypot(e.pos.x - ev.pos.x, e.pos.z - ev.pos.z) < ev.radius + 7) e.fleeT = Math.max(e.fleeT, 2.4);
      }
    });
    G.events.on('mode:changed', (ev) => { if (ev.mode === 'title') C.clear(); });
    G.events.on('player:respawn', () => { for (const e of enemies) if (!e.persistent) { e.aggro = false; } });
    if (G.debug) G.debug.combat = C;
  },
  start(G) {
    if (G.state) {
      G.state.defeated = G.state.defeated || {};
      G.state.stats = G.state.stats || { kills: 0, deaths: 0, distance: 0 };
    }
    C.clear();
    wildlife?.start?.();
    // perf pass (docs/api/perf.md "Hitches"): compile hidden programs and pre-pool one creature per kind, a frame each
    if (!C._warmed && G.params?.perf !== '0' && !G.params?.nowarm) {
      C._warmed = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        warmScene(G);
        const list = [];
        for (const [type, def] of Object.entries(TYPES)) {
          if (def.humanoid || (def.asset && !G.assets?.has(def.asset) && !def.primitive)) continue;
          const prim = def.primitive && !(G.params?.crv === '1' && def.asset) ? def.primitive : null;   // same as Enemy
          list.push([def.asset, { scale: def.scale ?? 1, tint: prim && def.asset ? null : def.tint, eyeColor: def.eyeColor, clips: def.clips, primitive: prim, key: prim ? 'prim:' + type : undefined, castShadow: def.castShadow ?? true, blobRadius: def.blobRadius }]);
        }
        if (wildlife?.warmList) list.push(...wildlife.warmList());
        warmCreatures(G, list);
      }));
    }
  },
  update(dt) {
    if (!(dt > 0)) return;
    try {
      updateTimers(dt);
      if (G.mode === 'play' && G.input?.pressed?.('lock')) C.cycleLock();
      const lt = C.lockTarget;
      if (lt && (lt.dead || !G.player || lt.pos.distanceTo(G.player.pos) > (lt.lockRange ? lt.lockRange + 10 : 45))) C.lockTarget = null;

      encounters.update(dt);
      updateEnemies(dt);
      drainPool();   // phones: pooled foes nobody reused for a minute go (enemy.js; at most every 5 s, cheap otherwise)
      updatePatterns(dt);
      combo.update(dt);
      trials.update(dt);
      duels.update(dt);
      bosses.update(dt);
      if (C.wildlifeEnabled) wildlife.update(dt);
      C.inCombat = !!(duels.active || bosses.active) || C.lockExtras.some((x) => !x.dead) || (G.time.t - combatT < 4 && enemies.some((e) => e.aggro && !e.dormant));
    } catch (err) { G.reportError('combat:update', err); }
  },
};
