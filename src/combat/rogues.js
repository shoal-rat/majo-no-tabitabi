// People of the road: bandit mages who fight like duelling witches, the 黑帚 raiders who chase brooms through the sky,
// and a pickpocket witch who grabs a purse and runs for it on her broom.
//   caster  拦路魔法使 — volleys of luminous bullets, an element signature (fire seals, ice lances, lightning calls, water
//                        bubbles, rock barrages, gusts), counter-casts that meet her spells mid-air, a shield against
//                        bombardment, sidesteps; after a big cast there is a short counter window (破绽).
//   raider  黑帚强盗   — the same duel kit on a broom: circles, strafes, swoops through her; wind / thunder or a broken
//                        stance knocks him off the broom, and on the ground he is just a slower bandit mage.
//   thief   扒手魔女   — sneaks up on a walker, lifts some stardust (or a dango) and flees on a broom. Every hit shakes
//                        some loot loose; bring her down and the purse comes back with interest.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp, TAU, angleDiff } from '../core/util.js';
import { addItem } from '../core/save.js';
import { createBroom } from '../player/broom.js';
import { moveToward, fleeFrom, distP, headPos } from './types.js';
import { after, flatDir, playerAlive, hurtPlayer, warnAt } from './attacks.js';
import { front } from './beasts.js';
import { dressRogue } from './bodies.js';
import { volley, lightning, rockBarrage, starRain, seal, counterCast, incomingAt, bolt, EL_COL, ANSWER } from './patterns.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();
const LOOKS = {
  caster: { cloak: 0x6e4f86, hat: 0x46345a, band: 0xd0703a, scarf: 0x8a7458 },
  raider: { cloak: 0x33303e, hat: 0x26232e, band: 0xb83a3a, scarf: 0x5a2a2e, feather: 0x15151c },
  thief: { cloak: 0x6a9a4a, hat: null, scarf: 0xd8c27a },
};
const MAGE_ELS = ['fire', 'ice', 'thunder', 'water', 'wind', 'earth'];

// ---- body & mount ------------------------------------------------------------------------------------------------------
function dress(e, look) {
  const a = e.actor;
  if (!a) return;
  if (a._rogueLook !== look) {
    a._rogueLook = look;
    a._rogueParts = dressRogue(a, LOOKS[look]);
    a.setTint({ color: look === 'thief' ? 0xd8dcc8 : 0xb8b0c4 });
  }
}
function broomOf(e) {
  const a = e.actor;
  if (!a) return null;
  if (!a._rogueBroom) a._rogueBroom = createBroom({}, { tilt: a.group, rig: a }).holder;
  return a._rogueBroom;
}
function mount(e, on) {
  const a = e.actor, b = broomOf(e);
  e.data.mounted = on;
  e.fly = on;
  if (b) { b.visible = on; b.scale.setScalar(1); }
  if (a) {
    a.travellerSeat = on ? b : null;
    a.stop?.('upper', 0.1);
    a.play(on ? 'sit_broom' : 'idle', { fade: 0.2 });
  }
}
function castCtx(e) {
  if (!e.data.ctx) e.data.ctx = { owner: e, team: 'enemy', alive: () => !e.dead && !e.data.down, dmgK: 1, hand: (out) => hand(e, out) };
  e.data.ctx.dmgK = (e.atkMul || 1) * (e.camp ? 0.75 : 1);
  return e.data.ctx;
}
function hand(e, out) { return out.set(e.pos.x + Math.sin(e.yaw) * 0.45 + Math.cos(e.yaw) * 0.25, e.pos.y + (e.data.mounted ? 1.45 : 1.3), e.pos.z + Math.cos(e.yaw) * 0.45 - Math.sin(e.yaw) * 0.25); }
function gesture(e, name) { e.actor?.play(name, { layer: 'upper', restart: true }); }
function tellAt(e, el, dur, big = false) {
  hand(e, _o);
  G.fx?.burst('charge_done', _o, { color: EL_COL[el] ?? 0xffe9b0, scale: big ? 1.2 : 0.7 });
  // a rune circle stands up in front of the wand, facing her; it flares when the spell leaves
  const P = G.player;
  if (P) { _d.set(P.pos.x - _o.x, P.pos.y + 1 - _o.y, P.pos.z - _o.z).normalize(); G.fx?.circle?.(_w.copy(_o).addScaledVector(_d, 0.35), { normal: _d, radius: big ? 1.15 : 0.62, color: EL_COL[el] ?? 0xffe9b0, dur, out: 'flare', draw: Math.min(0.3, dur * 0.4) }); }
  if (!e.data.mounted) G.fx?.sigil?.(e.pos, { color: EL_COL[el] ?? 0xffe9b0, radius: big ? 2.2 : 1.3, dur, intensity: big ? 1.8 : 1.2 });
  G.audio?.sfx('charge', { pos: e.pos, vol: big ? 0.8 : 0.5 });
}
/** after a committed cast: a short window where hits land ×1.5 (combat.damage reads exposedT) */
function opening(e, sec) { e.exposedT = Math.max(e.exposedT || 0, sec); }

// ---- defence: counter-cast, shield, sidestep ----------------------------------------------------------------------------
function defend(e, dt, cfg) {
  const D = e.data;
  D.ccd -= dt; D.gcd -= dt; D.dcd -= dt;
  if (D.guard) { D.guardT -= dt; if (D.guardT <= 0 || e.stunT > 0) { try { D.guard.stop?.(); } catch (er) { /* */ } D.guard = null; e.actor?.stop('upper', 0.15); opening(e, 1.0); } return !!D.guard; }
  e.centerOut(_v);
  const inc = incomingAt(_v, 14, 0.82);
  // bombardment: three or more of her bolts in the air at once -> shield up
  let volleyIn = 0;
  const list = G.spells?.projectiles || [];
  for (let i = 0; i < list.length && volleyIn < 3; i++) { const p = list[i]; if (p.alive && p.team === 'player' && p.pos.distanceToSquared(_v) < 196) volleyIn++; }
  if (!inc && volleyIn < 3) return false;
  const r = Math.random();
  if (inc && D.ccd <= 0 && ANSWER[inc.el] && r < cfg.counter) {
    D.ccd = cfg.ccd ?? 3.2;
    gesture(e, 'cast_throw');
    counterCast(castCtx(e), inc, { el: ANSWER[inc.el], power: 1.2 });
    return true;
  }
  if (D.gcd <= 0 && (volleyIn >= 3 || r < cfg.counter + cfg.guard)) {
    D.gcd = 3.4;
    e.dir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    try { D.guard = G.spells?.cast('guard', 'small', { caster: e, team: 'enemy', dir: e.dir }) || null; } catch (er) { D.guard = null; }
    D.guardT = volleyIn >= 3 ? 1.5 : 1.0;
    e.actor?.play('guard', { layer: 'upper' });
    return true;
  }
  if (!D.mounted && D.dcd <= 0 && inc && r < cfg.counter + cfg.guard + cfg.dodge) {
    D.dcd = 2.4;
    flatDir(G.player.pos, e.pos, _d);
    const s = Math.random() < 0.5 ? 1 : -1;
    e.vel.x += -_d.z * s * 11; e.vel.z += _d.x * s * 11;
    e.iframes = 0.35;
    e.actor?.play('dodge', { once: true });
    G.fx?.burst('dash', e.pos, { dir: _w.set(-_d.z * s, 0, _d.x * s) });
    G.audio?.sfx('dodge', { pos: e.pos });
    return true;
  }
  return false;
}

// ---- the move book ------------------------------------------------------------------------------------------------------
/** Pick and start one move for a mage of element el. Returns true when a move started. */
function castMove(e, el, d) {
  const P = G.player, D = e.data;
  const c = castCtx(e);
  const big = D.bigCd <= 0 && d < 22;
  const mounted = D.mounted;
  // signature moves (the "big" casts) come round every ~7 s; between them, volleys
  if (big) {
    D.bigCd = 6.5 + Math.random() * 2.5;
    let windup = 0.95, fire;
    const target = P.pos.clone();
    const air = P.onBroom && P.pos.y - G.world.groundAt(P.pos.x, P.pos.z, P.pos.y + 1) > 3;
    if (mounted && !P.onBroom) { fire = () => starRain(c, P.pos.clone(), { n: 7, radius: 5, el, damage: 9, delay: 0.85 }); }
    else if (mounted || (air && (el === 'thunder' || el === 'fire'))) fire = () => volley(c, P, { n: 7, fan: 0.6, gap: 0.05, el, speed: 24, radius: 0.6, damage: 7, turn: 0.5 });
    else if (el === 'thunder') fire = () => {
      const pts = [P.pos.clone(), P.pos.clone().addScaledVector(_d.set(P.vel.x, 0, P.vel.z), 0.8), P.pos.clone().add(_w.set((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7))];
      lightning(c, pts, { delay: 0.9, radius: 2.3, damage: 13 });
    };
    else if (el === 'earth') fire = () => rockBarrage(c, P, { n: 5, rise: 0.7, speed: 22, damage: 11 });
    else if (el === 'fire') fire = () => { seal(c, target, { el: 'fire', radius: 1.9, delay: 1.4, damage: 14, answer: ['water', 'ice'] }); volley(c, P, { n: 3, fan: 0.3, el: 'fire', speed: 17, damage: 9, delay: 0.5 }); };
    else if (el === 'ice') fire = () => volley(c, P, { n: 5, fan: 0.12, gap: 0.13, el: 'ice', shape: 'lance', speed: 30, size: 0.5, damage: 8, turn: 0.15, sweep: true });
    else if (el === 'water') fire = () => volley(c, P, { n: 4, fan: 1.1, gap: 0.12, el: 'water', speed: 9, size: 0.55, damage: 9, turn: 1.4, life: 4.5, splash: 1.2 });
    else if (el === 'wind') fire = () => {
      // a gust she has to brace for (guard holds her ground), then bullets riding it
      hand(e, _o); flatDir(e.pos, P.pos, _d);
      G.elements?.apply('wind', _o, 14, 1.0, { team: 'enemy', source: e, dir: _d.clone(), halfAngle: 0.45, damage: 6, noGround: true });
      G.fx?.burst('hit_wind', _o, { scale: 1.6, dir: _d });
      G.audio?.sfx('gust', { pos: _o });
      volley(c, P, { n: 4, fan: 0.4, el: 'wind', speed: 20, damage: 7, delay: 0.25 });
    };
    else fire = () => volley(c, P, { n: 6, fan: 0.7, el, speed: 16, damage: 8 });
    e.attack('big', windup, 0.9, (en) => { gesture(en, 'cast_raise'); fire(); opening(en, 1.2); }, {
      tell: (en) => { gesture(en, 'cast_channel'); tellAt(en, el, windup, true); if (el !== 'thunder' && !mounted) warnAt(target, 1.6, windup, EL_COL[el]); },
      during: (en) => en.face(P.pos.x, P.pos.z, 0.016, 10),
    });
    return true;
  }
  // a volley of magic bullets in her own colour
  const n = mounted ? 4 : 5;
  e.attack('volley', 0.55, 0.45, (en) => {
    gesture(en, 'cast_throw');
    volley(c, P, { n, fan: mounted ? 0.22 : 0.5, gap: 0.075, el: el === 'earth' ? 'sun' : el, color: EL_COL[el], speed: mounted ? 24 : 18, size: 0.3, radius: mounted ? 0.6 : undefined, damage: 7, turn: 0.4 });
  }, { tell: (en) => { gesture(en, 'cast_raise'); tellAt(en, el, 0.55); }, during: (en) => en.face(P.pos.x, P.pos.z, 0.016, 10) });
  return true;
}

// ---- ground mage brain --------------------------------------------------------------------------------------------------
const MAGE_CFG = { counter: 0.45, guard: 0.3, dodge: 0.25, range: [8, 14] };
function mageThink(e, dt) {
  const D = e.data;
  e.dir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
  if (D.aura) D.aura.pos.copy(e.pos);
  const s = front(e, dt);
  if (s !== 'fight') { if (s === 'idle') locomote(e); return; }
  const P = G.player, d = distP(e);
  const hdt = dt * (e.haste || 1);
  D.cd -= hdt; D.bigCd -= hdt;
  if (defend(e, dt, e.def.cfg || MAGE_CFG)) { e.face(P.pos.x, P.pos.z, dt, 10); e.move.set(0, 0, 0); return; }
  if (D.cd <= 0 && d < 26) { D.cd = 1.6 + Math.random() * 1.2; castMove(e, D.el, d); return; }
  footwork(e, dt, d, (e.def.cfg || MAGE_CFG).range);
  locomote(e);
}
function footwork(e, dt, dist, range) {
  const P = G.player, D = e.data;
  const [rmin, rmax] = range;
  if ((D.sideT -= dt) <= 0) { D.sideT = 1.8 + Math.random() * 2; D.side = Math.random() < 0.5 ? 1 : -1; }
  const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, dd = Math.max(0.01, Math.hypot(dx, dz));
  const rx = dx / dd, rz = dz / dd;
  const pull = dist > rmax ? -1 : dist < rmin ? 1 : 0;
  const sp = (e.def.speed ?? 3.6) * e.speedMul * e.slow;
  e.move.set((-rz * D.side + rx * pull) * sp * 0.75, 0, (rx * D.side + rz * pull) * sp * 0.75);
  e.face(P.pos.x, P.pos.z, dt, 9);
}
function locomote(e) {
  const a = e.actor;
  if (!a || e.data.mounted) return;
  const mv = Math.hypot(e.move.x, e.move.z);
  const rel = mv > 0.4 ? angleDiff(e.yaw, Math.atan2(e.move.x, e.move.z)) : 0;
  const back = Math.abs(rel) > 1.95;
  a.legYaw = back ? clamp(angleDiff(Math.PI, rel), -0.95, 0.95) : clamp(rel, -1.05, 1.05);
  if (!a.busy || a.current === 'move') a.move(mv, { back });
}

// ---- raider brain -------------------------------------------------------------------------------------------------------
const RAIDER_CFG = { counter: 0.35, guard: 0.25, dodge: 0, range: [9, 14], ccd: 4 };
function raiderThink(e, dt) {
  const D = e.data, P = G.player;
  e.dir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
  if (D.down) {
    // knocked off: lie there until the stun wears off, then fight on foot; remount after a while
    if (!e.grounded || e.stunT > 0) { e.move.set(0, 0, 0); return; }
    if (D.down === 1) { D.down = 2; e.actor?.play('land_hard', { once: true }); D.remountT = 8 + Math.random() * 3; }
    D.remountT -= dt;
    if (D.remountT <= 0 && !e.atk) {
      D.down = 0;
      G.fx?.burst('summon', e.centerOut(_v), { color: 0xffd27a, scale: 0.8 });
      G.audio?.sfx('broom_summon', { pos: e.pos, vol: 0.7 });
      mount(e, true);
      e.vel.y = 6;
      return;
    }
    mageThink(e, dt);
    return;
  }
  const s = front(e, dt);
  if (D.leaving) return;
  if (s !== 'fight') {
    const gy = G.world.groundAt(e.pos.x, e.pos.z, e.pos.y + 2);
    D.dy = clamp(gy + 7 - gy - e.hover, -e.hover + 1, 40);
    return;
  }
  const d = distP(e);
  const hdt = dt * (e.haste || 1);
  D.cd -= hdt; D.bigCd -= hdt; D.swoopCd -= hdt;
  // altitude: a rider is met at her own height, a walker is circled from above
  const gy = G.world.groundAt(e.pos.x, e.pos.z, e.pos.y + 2);
  const wantY = P.onBroom ? P.pos.y + 1.5 + Math.sin(G.time.t * 0.9 + e.id) * 2 : G.world.groundAt(P.pos.x, P.pos.z, P.pos.y + 2) + 7;
  if (D.swoop > 0) {
    D.swoop -= dt;
    e.move.copy(D.swoopV);
    D.dy = clamp(D.swoopY - gy - e.hover, -e.hover + 0.6, 60);
    _v.set(P.pos.x, P.pos.y + 1, P.pos.z);
    if (!D.hit && e.centerOut(_w).distanceTo(_v) < 2.4) { D.hit = true; hurtPlayer(e, 10, { knock: 6, element: 'wind' }); G.fx?.burst('hit_wind', _v, { scale: 1 }); }
    if (D.swoop <= 0) D.cd = Math.max(D.cd, 0.8);
    e.face(e.pos.x + D.swoopV.x, e.pos.z + D.swoopV.z, dt, 10);
    return;
  }
  D.dy = clamp(wantY - gy - e.hover, -e.hover + 1, 80);
  if (defend(e, dt, RAIDER_CFG)) { orbit(e, dt, 0.4); return; }
  if (D.swoopCd <= 0 && d < 22 && d > 6) {
    D.swoopCd = 6 + Math.random() * 3;
    const target = new THREE.Vector3();
    e.attack('swoop', 0.65, 0.1, (en) => {
      target.set(P.pos.x + P.vel.x * 0.3, P.pos.y + 0.6, P.pos.z + P.vel.z * 0.3);
      _d.subVectors(target, en.pos); _d.y = 0;
      const len = Math.max(0.1, _d.length());
      en.data.swoopV = new THREE.Vector3(_d.x / len * 21, 0, _d.z / len * 21);
      en.data.swoopY = target.y - 0.8;
      en.data.swoop = (len + 8) / 21;
      en.data.hit = false;
      G.audio?.sfx('broom_boost', { pos: en.pos });
      G.fx?.burst('dash', en.pos, { color: 0x8a2a2a, scale: 0.9 });
    }, { tell: (en) => { G.fx?.burst('charge_done', en.centerOut(_v), { color: 0xff6a4a, scale: 0.8 }); G.audio?.sfx('whoosh', { pos: en.pos, pitch: 0.8 }); gesture(en, 'cast_raise'); },
      during: (en) => en.face(P.pos.x, P.pos.z, 0.016, 10) });
    return;
  }
  if (D.cd <= 0 && d < 28) { D.cd = 2.0 + Math.random() * 1.2; castMove(e, D.el, d); return; }
  orbit(e, dt, 1);
}
function orbit(e, dt, k) {
  const P = G.player, D = e.data;
  if (P.onBroom && P.speed > 6) {
    // a broom chase: fly alongside her, a little ahead and above, trading spells; a boosting broom (28) leaves him behind
    if ((D.sideT -= dt) <= 0) { D.sideT = 4 + Math.random() * 4; D.side = Math.random() < 0.5 ? 1 : -1; }
    const hx = Math.sin(P.yaw), hz = Math.cos(P.yaw);
    const tx = P.pos.x + P.vel.x * 0.5 + hz * 10 * D.side, tz = P.pos.z + P.vel.z * 0.5 - hx * 10 * D.side;
    const dx = tx - e.pos.x, dz = tz - e.pos.z, dd = Math.hypot(dx, dz);
    const sp = Math.min(22, 8 + dd * 1.6) * e.speedMul * k;
    if (dd > 0.3) e.move.set(dx / dd * sp, 0, dz / dd * sp); else e.move.set(P.vel.x, 0, P.vel.z);
    e.face(P.pos.x, P.pos.z, dt, 8);
    return;
  }
  const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, dd = Math.max(0.01, Math.hypot(dx, dz));
  const rx = dx / dd, rz = dz / dd, R = 14;
  if ((D.sideT -= dt) <= 0) { D.sideT = 3 + Math.random() * 3; D.side = Math.random() < 0.5 ? 1 : -1; }
  const pull = clamp((dd - R) * 0.25, -1, 1);
  // she flies at 16: on her broom a raider keeps pace by cutting the corner toward where she is heading
  const lead = P.onBroom ? 0.8 : 0;
  const sp = (P.onBroom ? 13.5 : 10) * e.speedMul * k;
  e.move.set((-rz * D.side - rx * pull) * sp + P.vel.x * lead * 0.5, 0, (rx * D.side - rz * pull) * sp + P.vel.z * lead * 0.5);
  e.face(P.pos.x, P.pos.z, dt, 8);
}
function knockOff(e) {
  const D = e.data;
  if (!D.mounted || D.down) return;
  mount(e, false);
  D.down = 1;
  e.stun(2.2);
  opening(e, 3.5);
  e.vel.y = 2;
  e.actor?.play('fall', { fade: 0.1 });
  e.centerOut(_v);
  G.fx?.burst('hit_wind', _v, { scale: 1.3 });
  G.fx?.text?.(_v.setY(e.pos.y + 2.2), t('combat.knocked'), { color: 0xffe7a4, size: 1.05, dur: 1.4 });
  G.fx?.starburst?.(e.centerOut(_v), { color: 0xffe7a4, radius: 1.8 });
  G.audio?.sfx('broom_dismiss', { pos: e.pos });
  G.events.emit('enemy:knocked', { enemy: e });
}

// ---- thief brain ---------------------------------------------------------------------------------------------------------
function thiefThink(e, dt) {
  const D = e.data, P = G.player;
  e.dir.set(Math.sin(e.yaw), 0, Math.cos(e.yaw));
  if (!playerAlive() || G.mode !== 'play') { e.move.set(0, 0, 0); return; }
  if (G.combat?.calm) { G.combat.despawn(e); return; }
  const d = distP(e);
  if (D.state === 'sneak') {
    // creep up from behind; if she turns and spots her close, or hits her, run
    // quick feet: faster than her walk (5.5), slower than her sprint (8.5) — a heroine who hears her can outrun her
    moveToward(e, P.pos.x, P.pos.z, 6.6, dt, 1.0);
    if (e.actor && !e.actor.busy) e.actor.move(6.6);
    if (G.time.t - e.lastHitT < 0.3) { flee(e, false); return; }
    if (d < 1.6 && !P.onBroom) { grab(e); return; }
    if (P.onBroom || (D.sneakT -= dt) <= 0) { G.combat?.despawn(e); return; }
    return;
  }
  if (D.state === 'grabbed') { e.move.set(0, 0, 0); return; }
  if (D.state === 'down') {
    e.move.set(0, 0, 0);
    if (e.grounded && e.stunT <= 0) { D.state = 'flee'; mount(e, true); e.vel.y = 5; }
    return;
  }
  // flee: up and away on the broom, weaving, slower than a boosting broom but faster than a cruising one
  D.fleeT += dt;
  const gy = G.world.groundAt(e.pos.x, e.pos.z, e.pos.y + 2);
  D.dy = clamp(gy + 9 + Math.sin(D.fleeT * 1.3) * 2 - gy - e.hover, -e.hover + 1, 40);
  flatDir(P.pos, e.pos, _d);
  const wv = Math.sin(D.fleeT * 1.7) * 0.6;
  const dx = _d.x * Math.cos(wv) - _d.z * Math.sin(wv), dz = _d.x * Math.sin(wv) + _d.z * Math.cos(wv);
  const sp = 17.5 * e.speedMul;
  e.move.set(dx * sp, 0, dz * sp);
  e.face(e.pos.x + dx, e.pos.z + dz, dt, 6);
  D.pelletT -= dt;
  if (D.pelletT <= 0 && d < 30) {
    D.pelletT = 2.6 + Math.random();
    // a puff of glitter thrown back over her shoulder: it dazzles more than it hurts
    hand(e, _o); _d.subVectors(_v.set(P.pos.x, P.pos.y + 1, P.pos.z), _o).normalize();
    bolt(castCtx(e), _o.clone(), _d.clone(), { el: 'wind', color: 0xc8f0a0, speed: 14, size: 0.35, damage: 3, turn: 0.6, target: P, life: 2.5 });
  }
  if (D.fleeT > 45 || d > 150) {
    if (D.loot > 0) G.ui?.toast?.(t('combat.thief.escaped', { n: D.loot }), { dur: 3.5 });
    G.fx?.burst('summon', e.centerOut(_v), { color: 0xc8f0a0, scale: 1 });
    G.combat?.despawn(e);
  }
}
function grab(e) {
  const D = e.data;
  const inv = G.state?.inventory || {};
  const dust = inv.stardust || 0;
  let n = 0;
  if (dust >= 10) { n = Math.min(45, Math.max(6, Math.floor(dust * 0.22))); addItem(G, 'stardust', -n); D.loot = n; G.ui?.toast?.(t('combat.thief.stole', { n }), { dur: 3 }); }
  else if ((inv.dango || 0) > 0) { addItem(G, 'dango', -1); D.dango = 1; G.ui?.toast?.(t('combat.thief.stoleDango'), { dur: 3 }); }
  e.actor?.play('pickup', { once: true });
  G.audio?.sfx('coin', { pos: e.pos });
  G.fx?.burst('pickup', e.centerOut(_v), { color: 0xffd76a });
  after(0.6, () => { if (!e.dead) flee(e, true); }, e);
  D.state = 'grabbed';
}
function flee(e, told) {
  const D = e.data;
  D.state = 'flee'; D.fleeT = 0; D.pelletT = 2;
  e.aggro = true;
  mount(e, true);
  e.vel.y = 6;
  if (told || D.loot || D.dango) G.ui?.toast?.(t('combat.thief.fled'), { dur: 3 });
  G.events.emit('enemy:thief', { enemy: e, state: 'flee' });
}
function thiefHit(e, amount, info) {
  const D = e.data;
  if (D.state === 'sneak') return;
  if (D.loot > 0 && !info.dot) {
    const n = Math.max(1, Math.ceil(D.loot * 0.3));
    D.loot -= n;
    addItem(G, 'stardust', n);
    G.fx?.text?.(_v.set(e.pos.x, e.pos.y + 2.3, e.pos.z), t('combat.thief.dropped', { n }), { color: 0xffd76a, size: 0.85 });
    G.audio?.sfx('coin', { pos: e.pos });
  }
  if (D.mounted && (info.element === 'wind' || info.element === 'thunder' || e.hp < e.maxHp * 0.45)) {
    mount(e, false);
    D.state = 'down';
    e.stun(2.5);
    e.vel.y = 1;
    G.fx?.text?.(_v.set(e.pos.x, e.pos.y + 2.2, e.pos.z), t('combat.knocked'), { color: 0xffe7a4, size: 1.0 });
  }
}

// ---- defs ----------------------------------------------------------------------------------------------------------------
export function installRogues(TYPES) {
  TYPES.caster = {
    humanoid: true, asset: 'char_villager_c', tint: 'rogue_caster', hp: 440, radius: 0.45, height: 1.7, speed: 3.8, sight: 22, material: 'flesh', ranged: true,
    drops: { stardust: [5, 8], heart: 0.4 }, poise: 175, staggerT: 1.3, cfg: MAGE_CFG,
    onSpawn(e) {
      dress(e, 'caster');
      e.dir = new THREE.Vector3(0, 0, 1);
      Object.assign(e.data, { el: e.opts.element || MAGE_ELS[(e.id * 5) % MAGE_ELS.length], cd: 1.5, bigCd: 3 + Math.random() * 2, ccd: 1, gcd: 0, dcd: 0, side: 1, sideT: 0 });
      const aura = G.fx?.emitter?.('aura_' + e.data.el, { color: EL_COL[e.data.el], scale: 0.5 });
      if (aura) { e.data.aura = aura; e.own(() => aura.remove()); }
      e.own(() => { try { e.data.guard?.stop?.(); } catch (er) { /* */ } });
    },
    think: mageThink,
  };
  TYPES.raider = {
    humanoid: true, asset: 'char_town_a', tint: 'rogue_raider', hp: 640, radius: 0.5, height: 1.7, speed: 3.6, sight: 30, material: 'flesh', ranged: true,
    fly: true, hover: 1.2, drops: { stardust: [6, 9], heart: 0.4 }, poise: 130, staggerT: 1.3, cfg: { ...MAGE_CFG, range: [7, 12] },
    onSpawn(e) {
      dress(e, 'raider');
      e.dir = new THREE.Vector3(0, 0, 1);
      Object.assign(e.data, { el: e.opts.element || (e.id % 2 ? 'wind' : 'thunder'), cd: 1.8, bigCd: 4 + Math.random() * 2, ccd: 1.5, gcd: 0, dcd: 0, side: 1, sideT: 0, swoopCd: 3 + Math.random() * 2, down: 0 });
      mount(e, true);
      e.own(() => { try { e.data.guard?.stop?.(); } catch (er) { /* */ } if (e.actor) { e.actor.travellerSeat = null; if (e.actor._rogueBroom) e.actor._rogueBroom.visible = false; } });
    },
    think: raiderThink,
    onDamaged(e, amount, info) {
      if (e.dead) return;
      if (e.data.mounted && (info.element === 'wind' || info.element === 'thunder' || info.heavy)) knockOff(e);
    },
  };
  TYPES.thief = {
    humanoid: true, asset: 'char_villager_b', tint: 'rogue_thief', hp: 64, radius: 0.42, height: 1.6, speed: 4.4, sight: 0, material: 'flesh',
    fly: false, hover: 1.2, drops: { stardust: [2, 3] }, poise: 22, noKnock: false, rally: false,
    onSpawn(e) {
      dress(e, 'thief');
      e.dir = new THREE.Vector3(0, 0, 1);
      Object.assign(e.data, { state: 'sneak', sneakT: 40, loot: 0, dango: 0, fleeT: 0, pelletT: 2 });
      mount(e, false);
      e.persistent = true;
      e.own(() => { if (e.actor) { e.actor.travellerSeat = null; if (e.actor._rogueBroom) e.actor._rogueBroom.visible = false; } });
      e.onZero = () => {
        const D = e.data;
        const back = (D.loot || 0) + 15;
        addItem(G, 'stardust', back);
        if (D.dango) addItem(G, 'dango', D.dango + 1);
        D.loot = 0;
        G.ui?.toast?.(t('combat.thief.caught'), { dur: 3 });
        G.fx?.burst('pickup', e.centerOut(_v), { color: 0xffd76a, scale: 1.4 });
        G.audio?.sfx('coin', { pos: e.pos });
        G.combat?.kill(e, 'caught', { noDrop: true });
      };
    },
    think: thiefThink,
    onDamaged: thiefHit,
  };
  // the stagger of a mounted rider throws him off the broom too
  G.events.on('enemy:stagger', ({ enemy }) => { if (enemy?.type === 'raider') knockOff(enemy); });
}
export { mount, knockOff };
