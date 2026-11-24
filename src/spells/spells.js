// 灵诀 — the spell system (DESIGN §3.2–§3.4, §6.9) → G.spells
// The book (learn / select / knows), player input (charm stream, tap / charge / release casting, guard, cranes, ultimate),
// the shared ★ cast() entry used by the player and AI duelists, the projectile world with 飞弹相克, beams and 对波,
// telekinesis, time bubbles, the 「契」 gauge, and training dummies for tests.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp } from '../core/util.js';
import { BOOK, ELEMENT_ORDER, ARTS, COLORS, damageOf } from './book.js';
import { CLIPS, CAST_OF } from '../actors/clips.js';
import { createVisuals } from './visuals.js';
import { createProjectiles, hostileReactor, targetPoint } from './projectiles.js';
import { FORMS } from './forms.js';
import { createEntities } from './entities.js';
import { createBeams } from './beams.js';
import { createArts } from './arts.js';
import { makeDummy, DUMMIES } from './dummy.js';
import { createFusions } from './fusions.js';   // 元素交织: spell-on-spell fusions

const CHARGE_TIME = 0.9;
const CHARM_RATE = 1 / 3;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

// internal context shared by the sub-modules
const S = {
  ents: [], timers: [], timeBubbles: [], holding: null, guards: [],
  proj: null, beams: null, arts: null, V: null, toastT: {},
};
let gaugeFullShown = false;

S.after = (sec, fn) => { S.timers.push({ t: sec, fn }); };
S.shake = (amount, pos) => {
  if (!G.fx?.shake || !(amount > 0)) return;
  const f = G.camera ? G.camera.position : G.env.focus;
  const d = pos ? pos.distanceTo(f) : 0;
  const k = clamp(1.15 - d / 55);
  if (k > 0.02) G.fx.shake(amount * k);
};
S.toast = (key, params) => {
  const now = G.time.real;
  if (now - (S.toastT[key] || -9) < 1.4) return;
  S.toastT[key] = now;
  G.ui?.toast?.(t('spells.msg.' + key, params), { dur: 1.6 });
  if (key === 'noMana' || key === 'cooldown') G.audio?.sfx('ui_error', { vol: 0.5 });
};
S.bubbleScale = (pos, team) => {
  let s = 1;
  const tb = S.timeBubbles;
  for (let i = 0; i < tb.length; i++) {
    const b = tb[i];
    if (!b || !b.pos || (team && b.team === team)) continue;
    if (pos.distanceToSquared(b.pos) < b.radius * b.radius) s = Math.min(s, b.scale ?? 0.25);
  }
  return s;
};
S.handPos = (out) => {
  const P = G.player;
  if (!P) return out.set(0, 0, 0);
  const h = P.rig?.bones?.handR;
  if (h && P.group?.visible !== false) {
    h.getWorldPosition(out);
    if (Number.isFinite(out.x) && out.distanceToSquared(P.pos) < 9) return out;
  }
  out.copy(P.pos); out.y += P.onBroom ? 1.3 : 1.25;
  out.x += Math.sin(P.yaw) * 0.45; out.z += Math.cos(P.yaw) * 0.45;
  return out;
};
S.addGauge = (k, team = 'player') => {
  if (team !== 'player' || !G.state || !(k > 0)) return;
  const before = G.state.gauge || 0;
  G.state.gauge = clamp(before + k, 0, 1);
  if (G.state.gauge >= 1 && before < 1 && !gaugeFullShown) {
    gaugeFullShown = true;
    if (knows('kinkan')) { S.toast('gaugeFull'); G.audio?.sfx('bell_small', { vol: 0.6 }); }
  }
  if (G.state.gauge < 1) gaugeFullShown = false;
};

// ---- 飞弹相克 -----------------------------------------------------------------------------------------------------
function weight(p) { return p.power * (p.form === 'big' ? 2.2 : p.shape === 'charm' ? 0.45 : 1); }
S.clash = (a, b) => {
  const A = a.el, B = b.el;
  const has = (x, y) => (A === x && B === y) || (A === y && B === x);
  const pos = _v.addVectors(a.pos, b.pos).multiplyScalar(0.5).clone();
  let result;
  const wa = weight(a), wb = weight(b);
  if (has('fire', 'water')) {
    result = 'steam';
    G.fx?.burst('steam', pos, { scale: 2.2, power: 1.5 });
    G.fx?.burst('clash', pos, { color: COLORS.fire, color2: COLORS.water });
    G.audio?.sfx('steam_sizzle', { pos, vol: 1.1 });
    G.elements?.apply('water', pos, 2.5, 0.5, { team: 'neutral', noGround: true });
    S.proj.release(a, 'clash'); S.proj.release(b, 'clash');
  } else if (has('fire', 'ice')) {
    result = 'cancel';
    G.fx?.burst('steam', pos, { scale: 1.2 });
    G.fx?.burst('splash', pos, { scale: 0.8 });
    G.audio?.sfx('steam_sizzle', { pos, vol: 0.7 });
    S.proj.release(a, 'clash'); S.proj.release(b, 'clash');
  } else if (has('thunder', 'water')) {
    result = 'conduct';
    const th = A === 'thunder' ? a : b, wa2 = A === 'water' ? a : b;
    G.fx?.lightning(wa2.pos, th.pos, { color: COLORS.thunder, branches: 4, dur: 0.3 });
    G.elements?.apply('thunder', pos, 4, 1, { source: th.owner, team: th.team, damage: Math.round(th.damage * 0.6) });
    th.power += 0.3;
    S.proj.release(wa2, 'clash');
  } else if (has('sun', 'moon')) {
    result = 'cancel';
    G.fx?.burst('clash_big', pos, { color: COLORS.sun, color2: COLORS.moon, scale: 0.7 });
    S.proj.release(a, 'clash'); S.proj.release(b, 'clash');
  } else if (Math.abs(wa - wb) < 0.18 * Math.max(wa, wb)) {
    result = 'cancel';
    G.fx?.burst('clash', pos, { color: a.color, color2: b.color, scale: 1 + 0.3 * Math.max(wa, wb) });
    S.proj.release(a, 'clash'); S.proj.release(b, 'clash');
  } else {
    const win = wa > wb ? a : b, lose = win === a ? b : a;
    result = win === a ? 'a' : 'b';
    const ww = weight(win), wl = weight(lose);
    win.power = Math.max(0.2, win.power * (ww - wl) / ww);
    G.fx?.burst('clash', pos, { color: win.color, color2: lose.color, scale: 0.9 });
    S.proj.release(lose, 'clash');
  }
  G.audio?.sfx('hit_heavy', { pos, vol: 0.7 });
  S.shake(0.15, pos);
  if (a.team === 'player' || b.team === 'player') S.addGauge(0.05);
  G.events.emit('spell:clash', { pos, a: A, b: B, result });
};

// ---- book state ---------------------------------------------------------------------------------------------------
const isElement = (id) => ELEMENT_ORDER.includes(id);
function level(id) {
  if (!G.state) return 0;
  if (isElement(id)) return G.state.spells?.[id] | 0;
  if (id === 'charm') return 1;
  return G.state.abilities?.[id] ? 1 : 0;
}
function knows(id) { return level(id) > 0; }

function entry(id) {
  const d = BOOK[id];
  const art = !isElement(id);
  return {
    id, element: d.element, art,
    get name() { return t('spells.book.' + id + '.name'); },
    get desc() { return t('spells.book.' + id + '.desc'); },
    get small() { return t('spells.book.' + id + '.small'); },
    get big() { return d.big ? t('spells.book.' + id + '.big') : ''; },
    get smallDesc() { return t('spells.book.' + id + '.smallDesc'); },
    get bigDesc() { return d.big ? t('spells.book.' + id + '.bigDesc') : ''; },
    get level() { return level(id); },
    cost: { small: d.small.cost, big: d.big ? d.big.cost : 0, perSec: d.big?.perSec || d.small.perSec || 0 },
    cd: { small: d.small.cd, big: d.big ? d.big.cd : 0 },
    damage: { small: damageOf(id, 'small'), big: d.big ? damageOf(id, 'big') : 0 },
    color: COLORS[id], icon: art ? id : 'el_' + id,
  };
}

// ---- cast ---------------------------------------------------------------------------------------------------------
function casterPos(c, out) {
  const p = c && (c.pos || c.group?.position);
  return p ? out.copy(p) : out.set(0, 0, 0);
}

/** Player auto-aim: the aimed target, else the nearest hostile within a narrow cone. */
function autoTarget(origin, dir, team, range = 38, cone = 0.9) {
  const A = G.player?.aim;
  if (A?.target && !A.target.dead && A.target !== G.player) return A.target;
  let best = null, bs = -1;
  const consider = (obj, p) => {
    _w.subVectors(p, origin);
    const d = _w.length();
    if (d < 1 || d > range) return;
    const c = _w.dot(dir) / d;
    if (c < cone) return;
    const s = c - d / (range * 4);
    if (s > bs) { bs = s; best = obj; }
  };
  const en = G.combat?.enemies;
  if (en) for (const e of en) if (e && !e.dead && e.team !== team && e.pos) consider(e, targetPoint(e, _d));
  if (G.elements?.query) {
    _v.copy(origin).addScaledVector(dir, range * 0.5);
    G.elements.query(_v, range * 0.55, (r) => { if (hostileReactor(r, team) && (r.living || r.kind === 'creature') && r.owner !== G.player) consider(r.owner && r.owner.pos ? r.owner : r, _d.set(r.pos.x, r.cy, r.pos.z)); });
  }
  return best;
}

/**
 * ★ cast(spellId, form, { caster, origin, dir, target, point, team, power, duration?, strength? }) -> handle
 * The raw effect: no mana, cooldown or knowledge checks (the player's input layer does those). Same path for AI.
 */
function cast(spellId, form = 'small', o = {}) {
  const def = BOOK[spellId];
  if (!def) return null;
  if (form !== 'big' || !def.big) form = 'small';
  const caster = o.caster || G.player || null;
  const team = o.team || caster?.team || 'player';
  const isP = caster === G.player && !!G.player;
  const A = isP ? G.player.aim : null;
  const dir = new THREE.Vector3();
  if (o.dir) dir.copy(o.dir);
  else if (A?.dir) dir.copy(A.dir);
  else if (caster?.dir) dir.copy(caster.dir);
  else if (caster && typeof caster.yaw === 'number') dir.set(Math.sin(caster.yaw), 0, Math.cos(caster.yaw));
  else dir.set(0, 0, 1);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const cp = casterPos(caster, new THREE.Vector3());
  const origin = new THREE.Vector3();
  if (o.origin) origin.copy(o.origin);
  else if (isP) S.handPos(origin);
  else origin.copy(cp).setY(cp.y + (caster?.height || 1.6) * 0.75).addScaledVector(dir, 0.6);
  let point = o.point ? new THREE.Vector3().copy(o.point) : A ? A.point.clone() : null;
  let target = o.target !== undefined ? o.target : null;
  if (o.target === undefined && isP && (spellId === 'charm' || def.element === 'fire' || spellId === 'water' || spellId === 'ice' || spellId === 'thunder')) target = autoTarget(origin, dir, team);
  if (isP && point && !o.dir) {
    _d.subVectors(point, origin);
    if (_d.lengthSq() > 1) dir.copy(_d.normalize());
  }
  if (target && (spellId === 'charm' || spellId === 'fire' || spellId === 'thunder') && !point) point = targetPoint(target, new THREE.Vector3());
  const c = { S, id: spellId, form, caster, team, origin, dir, point, target, power: o.power ?? 1, casterPos: cp, duration: o.duration, strength: o.strength };
  let res = null;
  try {
    if (spellId === 'guard') res = S.arts.startGuard(c);
    else if (spellId === 'shikigami') res = S.arts.summon(c);
    else if (spellId === 'kinkan') res = S.arts.kinkan(c);
    else res = FORMS[spellId]?.[form]?.(c) || {};
  } catch (e) { G.reportError('spells:cast:' + spellId, e); res = {}; }
  // combat (broom fights): a spell thrown from a flying broom keeps most of the broom's speed, so it leaves her hand
  // instead of crawling ahead of her; lobbed shots only when they home (their arc was solved for a standing caster)
  const pj = isP && G.player.onBroom ? res?.projectile : null;
  if (pj && pj.alive && (!pj.gravity || pj.target)) { const v = G.player.vel; pj.vel.x += v.x * 0.8; pj.vel.z += v.z * 0.8; pj.vel.y += v.y * 0.5; pj.speed = pj.vel.length(); }
  const handle = Object.assign(res && typeof res === 'object' && !Array.isArray(res) && !res.isVector3 ? res : {}, { spell: spellId, form, team, caster });
  if (typeof handle.stop !== 'function') handle.stop = () => {};
  G.events.emit('spell:cast', { caster, spell: spellId, form, pos: origin, dir, team });
  return handle;
}

// ---- the player's hands ---------------------------------------------------------------------------------------------
const PI = {
  charging: false, charge: 0, chargeDone: false, chargeEm: null, chargeId: null, charmT: 0, beam: null, guard: null, cd: {},
  charmN: 0, pending: [],
};
/**
 * The player's cast gesture and when the spell leaves her hand (seconds after the input), per spell and form.
 * - charm: three throw variants round-robin; the card leaves at once (the flick is 0.05 s from the clip's start).
 * - small elemental forms (tap): `cast_<el>_q` starts 0.12 s before the clip's release mark at 1.25x, so the spell leaves
 *   ~0.1 s after the press, in sync with the hand: instant to the thumb, and the gesture still reads.
 * - big forms (released after the 0.9 s charge, which already played Charge_Loop as the anticipation): the element's full
 *   cast from 0.32 s before its release mark, so the follow-through is the element's own and the release is 0.3 s away.
 * - channelled forms (sun beam, moon grab), guard: no delay.
 * - shikigami / kinkan: full anticipation (rare, big moments).
 */
function castPlan(id, form, def, f) {
  if (id === 'charm') return { anim: ['charm_a', 'charm_b', 'charm_c'][PI.charmN++ % 3], delay: 0 };
  if (id === 'kinkan') { const d = CLIPS.kinkan_release; return { anim: 'kinkan_release', from: 0.24, delay: (d.release - 0.24) / d.speed }; }
  if (id === 'shikigami') { const d = CLIPS.cast_summon; return { anim: 'cast_summon', delay: d.release / d.speed }; }
  if (f.anim === 'cast_channel' || f.anim === 'guard' || def.art) return { anim: f.anim, delay: 0 };
  const st = CAST_OF[def.element];
  if (!st) return { anim: f.anim, delay: 0 };
  if (form === 'big') { const d = CLIPS[st]; const from = Math.max(0, d.release - 0.32 * d.speed); return { anim: st, from, delay: (d.release - from) / d.speed }; }
  const q = CLIPS[st + '_q']; return { anim: st + '_q', delay: (q.release - q.from) / q.speed };
}
function cdLeft(id, form) { return Math.max(0, (PI.cd[id + ':' + form] || 0) - G.time.t); }
function canAct() {
  const P = G.player;
  // both hands are on the wall while she climbs (spells wait until she stands, hangs off the broom or lets go)
  return !!P && !P.dead && G.mode === 'play' && P.control !== false && P.state !== 'climb';
}
/** Player cast with all the rules: knowledge, cooldown, mana, gauge, animation. */
function tryCast(id, form = 'small', silent = false) {
  const P = G.player;
  if (!P) return null;
  const def = BOOK[id];
  if (!def) return null;
  if (!knows(id) || (form === 'big' && level(id) < 2 && isElement(id))) { if (!silent) S.toast('unknown'); return null; }
  const f = def[form] || def.small;
  if (cdLeft(id, form) > 0) { if (!silent && f.cd > 1) S.toast('cooldown', { name: t('spells.book.' + id + '.' + (form === 'big' ? 'big' : 'small')) }); return null; }
  if (id === 'kinkan' && (G.state.gauge || 0) < 1) { if (!silent) S.toast('gaugeEmpty'); return null; }
  if (id === 'shikigami' && S.arts.cranes) { if (!silent) S.toast('cranesOut'); return null; }
  if (f.cost > 0 && !P.spendMana(f.cost)) { if (!silent) S.toast('noMana'); return null; }
  if (id === 'kinkan') G.state.gauge = 0;
  PI.cd[id + ':' + form] = G.time.t + f.cd;
  const plan = f.anim ? castPlan(id, form, def, f) : { delay: 0 };
  if (plan.anim) P.playAction?.(plan.anim, { faceAim: true, from: plan.from });
  const fire = () => {
    const h = cast(id, form, { caster: P, team: 'player' });
    if (h && h.failed && f.cost > 0) P.addMana?.(f.cost);
    if (h && h.failed && id === 'moon') S.toast('nothingToGrab');
    return h;
  };
  // the spell leaves at the gesture's release mark (aim is read then: the hand and the camera ray at release)
  if (plan.delay > 0.02) { PI.pending.push({ t: plan.delay, fire }); return { pending: true, spell: id, form, alive: true, stop() {} }; }
  return fire();
}
function stopCharge() {
  PI.charging = false; PI.charge = 0; PI.chargeDone = false;
  if (PI.chargeEm) { PI.chargeEm.remove?.(); PI.chargeEm = null; }
}
function selectedId() { return G.state?.selectedSpell || null; }

function playerInput(dt) {
  const inp = G.input;
  const P = G.player;
  if (!P) return;
  // casts waiting for their release mark (dropped if she died or lost control meanwhile)
  for (let i = PI.pending.length - 1; i >= 0; i--) {
    const q = PI.pending[i];
    if ((q.t -= dt) > 0) continue;
    PI.pending.splice(i, 1);
    if (!P.dead && G.mode === 'play') q.fire();
  }
  if (!canAct()) {
    if (PI.charging) stopCharge();
    if (PI.beam && (P.dead || G.mode !== 'play')) { PI.beam.stop(); PI.beam = null; }
    if (PI.guard && (P.dead || !inp.held('guard'))) { S.arts.stopGuard(PI.guard); PI.guard = null; }
    if (P.dead && S.arts.holdsFor(P)) S.arts.drop();
    return;
  }
  // selection: 1–8, mouse wheel
  for (let i = 0; i < 8; i++) {
    if (inp.pressed('el' + (i + 1))) { const id = ELEMENT_ORDER[i]; if (knows(id)) api.select(id); else S.toast('unknown'); }
  }
  if (inp.wheel && !G.ui?.wheelOpen && !PI.charging) {
    const known = ELEMENT_ORDER.filter(knows);
    if (known.length) {
      const i = known.indexOf(selectedId());
      api.select(known[(i + (inp.wheel > 0 ? 1 : -1) + known.length) % known.length]);
    }
  }
  const struggling = S.beams.struggle && (S.beams.struggle.a.caster === P || S.beams.struggle.b.caster === P);
  // attack: charm stream / drop held thing / mash in a struggle
  if (inp.pressed('attack')) {
    if (struggling) { S.beams.mash(); G.fx?.burst('hit_sun', S.handPos(_v), { scale: 0.5 }); }
    else if (S.arts.holdsFor(P)) { S.arts.drop(); PI.charmT = 0.35; }
    else PI.charmT = 0;
  }
  if (!struggling && inp.held('attack') && !S.arts.holdsFor(P)) {
    PI.charmT -= dt;
    if (PI.charmT <= 0) { PI.charmT += CHARM_RATE; if (PI.charmT < 0) PI.charmT = CHARM_RATE; tryCast('charm', 'small', true); }
  }
  // cast: tap = small, hold = charge → big
  const sel = selectedId();
  if (inp.pressed('cast') && sel) {
    if (S.arts.holdsFor(P)) { cast('moon', 'small', { caster: P, team: 'player' }); P.playAction?.('cast_throw', { faceAim: true }); }
    else if (level(sel) >= 2) {
      stopCharge();
      PI.charging = true; PI.chargeId = sel;
      PI.chargeEm = G.fx?.emitter?.('charge', { color: COLORS[sel] }) || null;
      P.playAction?.('cast_channel', { faceAim: true });
      G.audio?.sfx('charge', { pos: P.pos, vol: 0.6 });
    } else if (level(sel) === 1) tryCast(sel, 'small');
    else S.toast('unknown');
  }
  if (PI.charging) {
    if (PI.chargeId !== sel) stopCharge();
    else {
      PI.charge = Math.min(1, PI.charge + dt / CHARGE_TIME);
      if (PI.chargeEm) PI.chargeEm.pos.copy(S.handPos(_v));
      if (PI.charge >= 1 && !PI.chargeDone) {
        PI.chargeDone = true;
        G.fx?.burst('charge_done', S.handPos(_v), { color: COLORS[sel] });
        G.audio?.sfx('bell_small', { pos: P.pos, vol: 0.5, pitch: 1.5 });
        G.cam?.fovKick?.(0.25);
        if (sel === 'sun') {   // 天照 fires as soon as it is ready and runs while held
          stopCharge();
          PI.beam = tryCast('sun', 'big');
          if (PI.beam && !PI.beam.alive) PI.beam = null;
        }
      }
      if (inp.released('cast') || !inp.held('cast')) {
        const big = PI.charge >= 1;
        stopCharge();
        tryCast(sel, big ? 'big' : 'small');
      }
    }
  }
  if (PI.beam && (!inp.held('cast') || !PI.beam.alive)) {
    if (PI.beam.alive) PI.beam.stop();
    PI.beam = null;
    P.playAction?.('cast_end');
  }
  // guard
  if (inp.pressed('guard') && knows('guard') && !PI.guard) PI.guard = tryCast('guard', 'small', true);
  if (PI.guard && !inp.held('guard')) { S.arts.stopGuard(PI.guard); PI.guard = null; }
  if (inp.pressed('summon')) { if (knows('shikigami')) tryCast('shikigami'); else S.toast('unknown'); }
  if (inp.pressed('ultimate')) { if (knows('kinkan')) tryCast('kinkan'); else S.toast('unknown'); }
}

// default impact of G.spells.shoot(): the element lands where it hits; enemy shots never light the grass
const shotDef = {
  impact(p, h) {
    const at = h.point, el = p.data?.el || p.el;
    if (h.water && el === 'fire') { G.fx?.burst('steam', at, { scale: 0.8 }); return; }
    G.elements?.apply(el, at, p.data?.splash ?? 1.2, p.power, { source: p.owner, team: p.team, damage: Math.round(p.damage * p.power), dir: p.vel, noGround: p.team === 'enemy' ? !p.data?.ground : false });
    G.fx?.burst(p.data?.burst || ('hit_' + el), at, { dir: p.vel, scale: 0.8 });
  },
  expire(p) { G.fx?.burst(p.data?.burst || ('hit_' + (p.data?.el || p.el)), p.pos, { scale: 0.4 }); },
};

// ---- public API ---------------------------------------------------------------------------------------------------------
const LIST_IDS = ['charm', ...ELEMENT_ORDER, 'guard', 'shikigami', 'kinkan'];
const api = {
  BOOK, ELEMENT_ORDER, ARTS,
  list: [],
  get selected() { return selectedId(); },
  get gauge() { return clamp(G.state?.gauge || 0, 0, 1); },
  set gauge(v) { if (G.state) G.state.gauge = clamp(+v || 0, 0, 1); },
  get charge() { return PI.charging && level(PI.chargeId) >= 2 ? PI.charge : 0; },
  get holding() { return S.arts?.holding || null; },
  get projectiles() { return S.proj ? S.proj.list : []; },
  /**
   * Public custom projectile (no cast sound, no mana, no animation): it flies, homes, clashes, can be guarded and
   * reflected like any spell projectile. opts { el='moon', origin|pos, dir|vel|target|point, speed=13, size=0.45,
   * radius, color, team='enemy', owner|caster, damage=10, power=1, life=4, turn=0 (homing on `target`), gravity=0,
   * pierce, shape='orb', def:{ impact(p,hit), expire?(p) } (default: apply el at the hit, no ground fire for 'enemy'),
   * splash=1.2, burst, trail, emitter, emitterScale, spell='shot', form='small', data }. Returns the projectile or null.
   */
  shoot(o = {}) {
    if (!S.proj) return null;
    const origin = o.origin || o.pos;
    if (!origin) return null;
    const speed = o.speed ?? 13;
    const tgt = o.target && (o.target.isVector3 ? o.target : o.target.pos);
    const vel = new THREE.Vector3();
    if (o.vel) vel.copy(o.vel);
    else {
      if (o.dir) vel.copy(o.dir);
      else if (o.point || tgt) { vel.subVectors(o.point || tgt, origin); if (!o.point && o.target && !o.target.isVector3) vel.y += (o.target.height || 1.6) * 0.55; }
      else vel.set(0, 0, 1);
      vel.normalize().multiplyScalar(speed);
    }
    const team = o.team || 'enemy', owner = o.owner || o.caster || null;
    const size = o.size ?? 0.45;
    return S.proj.spawn({
      el: o.el || 'moon', shape: o.shape || 'orb', pos: origin, vel, color: o.color ?? COLORS[o.el || 'moon'], size, radius: o.radius ?? Math.max(0.3, size * 0.8),
      power: o.power ?? 1, team, owner, life: o.life ?? 4, gravity: o.gravity || 0, target: o.turn ? o.target || null : null,
      turn: o.turn || 0, pierce: o.pierce || 0, def: o.def || shotDef, damage: o.damage ?? 10, spell: o.spell || 'shot', form: o.form || 'small',
      trail: o.trail, emitter: o.emitter, emitterScale: o.emitterScale,
      data: { S, excludeBody: owner?.physChar || null, el: o.el || 'moon', splash: o.splash, burst: o.burst, ground: o.ground, ...(o.data || {}) },
    });
  },
  get beams() { return S.beams ? S.beams.list : []; },
  get struggle() { return S.beams?.struggle || null; },
  get timeBubbles() { return S.timeBubbles; },
  get guards() { return S.guards; },
  get entities() { return S.ents; },
  get dummies() { return DUMMIES; },
  get guarding() { return !!PI.guard; },
  get beaming() { return !!PI.beam; },
  cast,
  tryCast,
  /** Learn a spell (element: level 1 = small, 2 = big) or an art. Persists, emits 'spell:learned', shows the ceremony. */
  learn(id, lvl = 1, { silent = false } = {}) {
    if (!G.state || !BOOK[id]) return false;
    const before = level(id);
    if (isElement(id)) { G.state.spells[id] = Math.max(G.state.spells[id] | 0, clamp(lvl | 0, 1, 2)); }
    else if (id !== 'charm') G.state.abilities[id] = true;
    const after = level(id);
    if (after === before) return false;
    G.events.emit('spell:learned', { id, level: after });
    if (isElement(id) && !selectedId()) api.select(id);
    if (!silent) {
      const big = after >= 2 && before >= 1;
      G.ui?.learnSpell?.({ id, element: BOOK[id].element, name: big ? t('spells.book.' + id + '.big') : t('spells.book.' + id + '.name'),
        desc: big ? t('spells.book.' + id + '.bigDesc') : t('spells.book.' + id + '.desc'), icon: isElement(id) ? undefined : id });
    }
    return true;
  },
  select(id) {
    if (!isElement(id) || !knows(id) || !G.state) return false;
    if (G.state.selectedSpell === id) return true;
    G.state.selectedSpell = id;
    if (PI.charging) stopCharge();
    G.events.emit('spell:select', { id });
    G.audio?.sfx('ui_move', { vol: 0.4 });
    return true;
  },
  knows,
  level,
  /** Seconds until the player may cast this form again. */
  cooldown(id, form = 'small') { return cdLeft(id, form); },
  /** Tests / ?allspells: every element at level 2 and every art. Silent. */
  learnAll() {
    if (!G.state) return;
    for (const id of ELEMENT_ORDER) G.state.spells[id] = 2;
    for (const a of ['guard', 'shikigami', 'kinkan', 'broom', 'wings']) G.state.abilities[a] = true;
    if (!selectedId()) G.state.selectedSpell = 'fire';
  },
  addGauge(k) { S.addGauge(k, 'player'); },
  makeDummy,
  /** Remove every live spell effect (projectiles, beams, pillars, bubbles, cranes, guards). */
  clear() {
    S.proj?.clear(); S.beams?.clear(); S.arts?.clear(); S.fusions?.clear();
    for (const e of S.ents) { try { e.dispose(); } catch (err) { G.reportError('spells:clear', err); } }
    S.ents.length = 0; S.timers.length = 0;
    stopCharge(); PI.beam = null; PI.guard = null;
  },
  stats() {
    return { projectiles: S.proj?.count || 0, beams: S.beams?.list.length || 0, ents: S.ents.length, timers: S.timers.length, bubbles: S.timeBubbles.length,
      guards: S.guards.length, holding: !!api.holding, cranes: !!S.arts?.cranes, dummies: DUMMIES.length };
  },
};

export const spellsSystem = {
  name: 'spells',
  async init(G) {
    S.V = createVisuals(G.scene);
    S.proj = createProjectiles(S);
    S.beams = createBeams(S);
    S.arts = createArts(S, S.V);
    S.fusions = createFusions(S);
    createEntities(S, S.V);
    if (G.physics && Array.isArray(G.physics.timeBubbles)) S.timeBubbles = G.physics.timeBubbles;
    api.list = LIST_IDS.map(entry);
    G.spells = api;
    G.events.on('element:reaction', (e) => {
      if (!e || e.team !== 'player' || e.fusion) return;   // a fusion's own ticks do not feed the gauge
      S.addGauge(0.028 + 0.01 * Math.min(4, e.count || 1));
    });
    // 元素交织: every combination she makes feeds it (repeating field ticks do not)
    G.events.on('element:combo', (e) => { if (e && e.team === 'player' && !e.quiet) S.addGauge(e.big ? 0.06 : 0.03); });
    G.events.on('player:died', () => { if (PI.beam) { PI.beam.stop(); PI.beam = null; } stopCharge(); if (PI.guard) { S.arts.stopGuard(PI.guard); PI.guard = null; } });
    G.events.on('mode:changed', (e) => { if (e.mode === 'title') api.clear(); });
    if (G.ui && G.ui.providers) G.ui.providers.spells = () => api.list.map((s) => ({ id: s.id, name: s.name, desc: s.desc, level: s.level, element: s.element, small: s.small, big: s.big }));
  },
  start(G) {
    api.clear();
    if (G.params.allspells) api.learnAll();
    const sel = selectedId();
    if (sel && !knows(sel)) G.state.selectedSpell = ELEMENT_ORDER.find(knows) || null;
    if (!sel) G.state.selectedSpell = ELEMENT_ORDER.find(knows) || null;
    gaugeFullShown = (G.state.gauge || 0) >= 1;
  },
  update(dt) {
    try { playerInput(dt); } catch (e) { G.reportError('spells:input', e); }
    if (!(dt > 0)) return;
    for (let i = S.timers.length - 1; i >= 0; i--) {
      const tm = S.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { S.timers.splice(i, 1); try { tm.fn(); } catch (e) { G.reportError('spells:timer', e); } }
    }
    S.proj.update(dt);
    try { S.beams.update(dt); } catch (e) { G.reportError('spells:beams', e); }
    try { S.arts.update(dt); } catch (e) { G.reportError('spells:arts', e); }
    for (let i = S.ents.length - 1; i >= 0; i--) {
      const e = S.ents[i];
      let keep = false;
      try { keep = e.update(dt); } catch (err) { G.reportError('spells:ent:' + e.kind, err); }
      if (!keep) { S.ents.splice(i, 1); try { e.dispose(); } catch (err) { G.reportError('spells:dispose', err); } }
    }
    try { S.fusions?.update(dt); } catch (e) { G.reportError('spells:fusions', e); }
    for (let i = 0; i < DUMMIES.length; i++) DUMMIES[i].update(dt);
  },
  lateUpdate() {
    const V = S.V;
    if (!V) return;
    V.begin();
    S.proj.draw(V);
    V.end();
  },
};
