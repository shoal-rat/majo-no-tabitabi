// Foe "feel" layer shared by every journey foe: elemental wards (a shell only the countering element breaks), poise and
// staggers, elite affixes, and the small helpers the damage pipeline in combat.js calls.
//
//   ward    e.ward = { el, hp, max, regen, downT, mesh, mat }   — up: HP takes 15 % chip, the counter element hits the shell
//           ×3 (secondary ×1.6, a matching reaction ×2, any fusion ×3), anything else ×0.25. Broken: stagger 2.4 s, exposed ×1.5 for 4 s,
//           reforms after `regen` s. Events 'enemy:ward' { enemy, state: 'break'|'reform', el }.
//   poise   e.poise / e.poiseMax — hits wear it down (heavy ×1.8, counter ×1.5, shatter ×2, a reaction ×1.6, weaving
//           — an element other than the last one that struck it — ×1.5, the charm stream ×0.6); at 0 the foe staggers
//           (stun ×1.25 def.staggerT, knocked back a step, 'enemy:stagger' { enemy, interrupted }), then it refills to a
//           25 % larger stance (cap 2×) and cannot be worn down again for 1 s after it recovers (no stunlock). A stagger
//           during a wind-up interrupts it: 「打断」, a longer opening, 'enemy:interrupt'. Regenerates after 2.5 s
//           without hits.
//   affixes e.affixes = ['frenzy', ...] — elites. See AFFIXES.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp, TAU } from '../core/util.js';
import { mine } from './pacing.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3();

/** Which elements break which ward: [primary, secondary]. Mirrors the reaction table (water douses fire, fire melts ice …). */
export const COUNTER = {
  fire: ['water', 'ice'],
  ice: ['fire', 'earth'],
  wind: ['ice', 'earth'],
  thunder: ['earth', 'water'],
  water: ['thunder', 'ice'],
  earth: ['thunder', 'wind'],
};
/** Reactions (G.elements.apply hinfo.reaction) that also crack a ward of this element. */
const WARD_REACT = { fire: ['extinguish', 'steam', 'steamblast'], ice: ['melt', 'thaw', 'steam', 'steamblast'], water: ['conduct', 'freeze', 'chargedfog'],
  earth: ['shatter', 'overload'], thunder: ['mire'], wind: ['freeze'] };
export const WARD_COLOR = { fire: 0xff7a2a, ice: 0xbfefff, wind: 0x9ff0c0, thunder: 0xc39bff, water: 0x58c6ff, earth: 0xd6a96a };

// ---- ward shell ------------------------------------------------------------------------------------------------------
let shellGeo = null;
const SHELL_VS = /* glsl */`
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SHELL_FS = /* glsl */`
uniform vec3 uColor; uniform float uTime; uniform float uHit; uniform float uFill; uniform float uCrack;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 2.2);
  // hexagonal-ish facets drifting over the shell
  vec3 q = vP * 5.0 + vec3(0.0, uTime * 0.6, 0.0);
  vec3 c = floor(q); float cell = h(c);
  float edge = smoothstep(0.42, 0.5, max(abs(fract(q.x)-0.5), max(abs(fract(q.y)-0.5), abs(fract(q.z)-0.5))));
  float band = step(vP.y * 0.5 + 0.5, uFill + 0.02);
  float a = (rim * 0.75 + edge * 0.22 * (0.6 + 0.4 * sin(uTime * 3.0 + cell * 6.28)) + uHit * 0.55) * band;
  a *= 1.0 - uCrack * step(0.55, cell);
  gl_FragColor = vec4(uColor * (1.1 + uHit * 1.6), clamp(a, 0.0, 0.9));
}`;
function makeShell(el) {
  if (!shellGeo) shellGeo = new THREE.IcosahedronGeometry(1, 3);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(WARD_COLOR[el] || 0xffffff) }, uTime: { value: 0 }, uHit: { value: 0 }, uFill: { value: 1 }, uCrack: { value: 0 } },
  });
  const m = new THREE.Mesh(shellGeo, mat);
  m.renderOrder = 5;
  m.frustumCulled = false;
  return m;
}

/** Give e an elemental ward of `max` points. o: { regen = 14 (s until it reforms), silent } */
const WARD_CAP = 360;   // a shell is a gate (4–5 counter hits), not a grind: it never grows past this, however big the foe
export function addWard(e, el, max, o = {}) {
  if (!COUNTER[el]) return null;
  max = Math.min(max, WARD_CAP);
  removeWard(e);
  const mesh = makeShell(el);
  G.scene.add(mesh);
  e.ward = { el, hp: max, max, regen: o.regen ?? 14, downT: 0, mesh, mat: mesh.material, hit: 0, fill: 1, tipT: -9 };
  e.own(() => removeWard(e));
  return e.ward;
}
export function removeWard(e) {
  const w = e.ward;
  if (!w) return;
  w.mesh.parent?.remove(w.mesh);
  w.mat.dispose();
  e.ward = null;
}
/** The countering elements of a ward ('' when none). */
export function counterOf(el) { return COUNTER[el] || null; }

/**
 * Route a hit through the ward. Returns the HP damage that gets through (n when no ward / ward down).
 * info: the combat.damage info (element, reaction, heavy, shatter, dot, source).
 */
export function wardHit(e, n, info) {
  const w = e.ward;
  if (!w || w.hp <= 0) return n;
  const el = info.element;
  const c = COUNTER[w.el];
  let k = 0.25;
  if (el && c && el === c[0]) k = 3;
  else if (el && c && el === c[1]) k = 1.6;
  if (info.reaction && WARD_REACT[w.el]?.includes(info.reaction)) k = Math.max(k, 2);
  if (info.fusion) k = Math.max(k, 3);   // a fusion (合咏, two of her spells made one) cracks any shell like its counter
  if (info.dot) k *= 0.5;
  const before = w.hp;
  w.hp = Math.max(0, w.hp - n * k);
  w.hit = 1;
  e.centerOut(_v); _v.y = e.pos.y + e.height + 0.5;
  if (w.hp <= 0) { breakWard(e); return Math.round(n * 0.5); }
  if (k < 1 && !info.dot) {
    // the shell takes the blow: a lattice ripple facing whoever struck it (vfx ward flash)
    const src = info.source?.pos || G.player?.pos;
    e.centerOut(_w);
    if (src) _n.set(src.x - _w.x, 0, src.z - _w.z).normalize(); else _n.set(0, 0, 1);
    G.fx?.ward?.(_w.addScaledVector(_n, Math.max(e.radius * 1.5, e.height * 0.62) * 0.9), _n, { radius: Math.max(0.9, e.radius * 1.4), color: WARD_COLOR[w.el], dur: 0.28 });
  }
  if (k < 1 && !info.dot && G.time.t - w.tipT > 1.6 && info.source === G.player) {
    w.tipT = G.time.t;
    G.fx?.text?.(_v, t('combat.ward.resist', { el: t('core.element.' + c[0]) }), { kind: 'word', target: e, color: WARD_COLOR[c[0]] ?? WARD_COLOR[w.el], size: 0.92, dur: 1.2 });   // in the answer's colour
    G.audio?.sfx('guard', { pos: e.pos, vol: 0.45, pitch: 1.4 });
  } else if (k >= 1 && before > 0) G.fx?.burst('hit_' + w.el, _v, { scale: 0.7 });
  return Math.round(n * 0.15);
}

export function breakWard(e) {
  const w = e.ward;
  if (!w) return;
  w.hp = 0; w.downT = w.regen;
  e.centerOut(_v);
  G.fx?.burst('shatter_ice', _v, { scale: 1.6, color: WARD_COLOR[w.el] });
  G.fx?.burst('clash_big', _v, { color: WARD_COLOR[w.el], color2: 0xffffff, scale: 0.6 });
  G.fx?.flash?.(_v, WARD_COLOR[w.el], 60, 0.25, 14);
  _v.y = e.pos.y + e.height + 0.7;
  G.fx?.text?.(_v, t('combat.ward.broken'), { kind: 'word', target: e, color: 0xfff0c0, size: 1.2, dur: 1.4 });
  G.audio?.sfx('shatter_crystal', { pos: e.pos });
  e.centerOut(_w);
  G.fx?.starburst?.(_w, { color: WARD_COLOR[w.el], radius: 2.2 });
  if (G.fx?.duel?.beat) G.fx.duel.beat('break', _w, {}); else { G.hitstop(0.07); G.fx?.shake?.(0.22, 0.25); }
  e.stun(2.4);
  e.exposedT = Math.max(e.exposedT || 0, 4);
  G.events.emit('enemy:ward', { enemy: e, state: 'break', el: w.el });
}

/** Per-frame ward animation + regen (called from Enemy.render via combat). */
export function updateWard(e, dt) {
  const w = e.ward;
  if (!w) return;
  if (w.hp <= 0) {
    w.downT -= dt;
    w.fill = 0;
    if (w.downT <= 0 && !e.dead) {
      w.hp = w.max; w.fill = 0.01;
      e.centerOut(_v);
      G.fx?.burst('charge_done', _v, { color: WARD_COLOR[w.el], scale: 1 });
      G.events.emit('enemy:ward', { enemy: e, state: 'reform', el: w.el });
    }
  } else w.fill = Math.min(1, w.fill + dt * 1.2);
  w.hit = Math.max(0, w.hit - dt * 4);
  const show = !e.dead && !e.dormant && w.fill > 0.001;
  w.mesh.visible = show;
  if (!show) return;
  const r = Math.max(e.radius * 1.5, e.height * 0.62);
  w.mesh.position.set(e.pos.x, e.pos.y + e.height * 0.52, e.pos.z);
  w.mesh.scale.set(r * 1.05, e.height * 0.66 + 0.2, r * 1.05);
  const U = w.mat.uniforms;
  U.uTime.value = G.time.t + e.id;
  U.uHit.value = w.hit;
  U.uFill.value = w.fill;
  U.uCrack.value = clamp(1 - w.hp / w.max) * 0.8;
}

// ---- poise / stagger -------------------------------------------------------------------------------------------------
export function initPoise(e) {
  const d = e.def;
  e.poiseMax = d.poise ?? Math.round(e.maxHp * (d.heavy ? 0.7 : 0.4));
  e.poise = e.poiseMax;
  e.exposedT = 0;
}
export function poiseHit(e, n, info, countered) {
  if (!(e.poiseMax > 0) || info.dot) return;
  const now = G.time.t;
  const el = info.element || null;
  // weaving: an element other than the last one that struck this foe (within 4 s) hits its stance harder
  const weave = !!(el && e._elLast && el !== e._elLast && now - e._elT < 4);
  if (el) { e._elLast = el; e._elT = now; }
  if (e._poiseLockT > 0) return;   // just back on its feet: no stunlock
  let k = info.heavy ? 1.8 : 1;
  if (countered) k *= 1.5;
  if (info.shatter) k *= 2;
  if (info.reaction) k *= 1.6;
  if (weave) k *= 1.5;
  if (el === 'sun' && mine(info.source)) k *= 0.6;   // the charm stream chips; spells break
  e.poise -= n * k;
  e._poiseT = 2.5;
  if (e.poise <= 0) {
    e.poiseBase ??= e.poiseMax;
    e.staggers = (e.staggers || 0) + 1;
    e.poiseMax = Math.min(Math.round(e.poiseBase * 2), Math.round(e.poiseMax * 1.25));
    e.poise = e.poiseMax;
    const sec = (e.def.staggerT ?? (e.def.heavy ? 1.6 : 1.1)) * 1.25;
    const interrupted = !!(e.atk && !e.atk.fired);
    e.stun(sec);
    e._poiseLockT = sec + 1;
    e.exposedT = Math.max(e.exposedT || 0, sec + (interrupted ? 1.4 : 0.8));
    // knocked back a step, away from whoever broke it
    if (!e.def.heavy && !e.boss && !e.def.noKnock) {
      const src = info.source?.pos || G.player?.pos;
      if (src) { _n.set(e.pos.x - src.x, 0, e.pos.z - src.z); if (_n.lengthSq() > 1e-4) { _n.normalize(); e.vel.x += _n.x * 5; e.vel.z += _n.z * 5; if (!e.fly) e.vel.y = Math.max(e.vel.y, 3); } }
    }
    e.centerOut(_v); _v.y = e.pos.y + e.height + 0.55;
    G.fx?.text?.(_v, t(interrupted ? 'combat.interrupt' : 'combat.stagger'), { kind: 'word', target: e, color: interrupted ? 0xffe27a : 0xffd98a, size: interrupted ? 1.15 : 1.05, dur: 1.2 });
    G.fx?.burst('spark', _v, { scale: interrupted ? 1.3 : 0.9, color: 0xffe7a4 });
    G.fx?.starburst?.(e.centerOut(_w), { color: 0xffe7a4, radius: interrupted ? 1.8 : 1.3, dur: 0.28 });
    G.audio?.sfx('hit_heavy', { pos: e.pos, vol: 0.8, pitch: interrupted ? 1.05 : 1.2 });
    G.hitstop(interrupted ? 0.09 : 0.07);
    G.fx?.shake?.(interrupted ? 0.26 : 0.18, 0.25);
    if (e.cr) e.cr.play('hit', { once: true, speed: 0.8 });
    G.events.emit('enemy:stagger', { enemy: e, interrupted });
    if (interrupted) G.events.emit('enemy:interrupt', { enemy: e });
  }
}
export function updatePoise(e, dt) {
  if (e._poiseLockT > 0) e._poiseLockT -= dt;
  if (e._poiseT > 0) e._poiseT -= dt;
  else if (e.poise < e.poiseMax) e.poise = Math.min(e.poiseMax, e.poise + e.poiseMax * 0.18 * dt);
  if (e.exposedT > 0) e.exposedT -= dt;
}

// ---- elite affixes ---------------------------------------------------------------------------------------------------
/** Affix id -> { color, apply(e), onDamaged?(e, n, info), onDeath?(e), onHitPlayer?(e) } */
export const AFFIXES = {
  frenzy: {
    color: 0xff7a3a,
    apply(e) { e.speedMul *= 1.3; e.haste = (e.haste || 1) * 1.3; },
  },
  warded: {
    color: 0x9fd8ff,
    apply(e) {
      if (e.ward) return;
      const els = ['fire', 'ice', 'thunder', 'water'];
      addWard(e, e.opts.wardEl || els[(e.id * 7) % els.length], Math.round(e.maxHp * 0.4), { regen: 16 });
    },
  },
  bulwark: {
    color: 0xd6a96a,
    apply(e) { e.maxHp = Math.round(e.maxHp * 1.5); e.hp = e.maxHp; e.poiseMax *= 2.2; e.poise = e.poiseMax; },
  },
  blink: {
    color: 0xc39bff,
    onDamaged(e) {
      if (e.dead || G.time.t - (e._blinkT || -9) < 3.5 || Math.random() > 0.45) return;
      e._blinkT = G.time.t;
      const P = G.player;
      if (!P) return;
      e.centerOut(_v);
      G.fx?.burst('summon', _v, { color: 0xc39bff, scale: 0.8 });
      const a = Math.random() * TAU, r = 5 + Math.random() * 3;
      e.pos.x = P.pos.x + Math.cos(a) * r; e.pos.z = P.pos.z + Math.sin(a) * r;
      e.pos.y = G.world.groundAt(e.pos.x, e.pos.z, P.pos.y + 3) + (e.fly ? e.hover : 0);
      e.vel.set(0, 0, 0);
      e.centerOut(_v);
      G.fx?.burst('summon', _v, { color: 0xc39bff, scale: 0.8 });
      G.audio?.sfx('teleport', { pos: e.pos, vol: 0.6 });
    },
  },
  leech: {
    color: 0x58c6ff,
    onHitPlayer(e) {
      const P = G.player;
      if (!P || !(P.mana > 30)) return;
      P.mana = Math.max(30, P.mana - 8);
      _v.copy(P.pos); _v.y += 1.2;
      G.fx?.burst('hit_water', _v, { scale: 0.6 });
    },
    onDeath(e, pos) { G.gameplay?.spawnPickup?.('mana', pos, 1); },
  },
  volatile: {
    color: 0xffb347,
    onDeath(e, pos) {
      const at = pos.clone();
      G.combat?.volatileBlast?.(at);
    },
  },
  pack: {
    color: 0xffe08a,
    apply(e) { e.data.packLeader = true; },
  },
};
/** Apply affixes to a freshly spawned foe (scale bump, aura, plate title). */
export function makeElite(e, list) {
  e.elite = true;
  e.affixes = list.slice();
  for (const a of list) { try { AFFIXES[a]?.apply?.(e); } catch (err) { G.reportError('combat:affix:' + a, err); } }
  const col = AFFIXES[list[0]]?.color ?? 0xffe08a;
  const em = G.fx?.emitter?.('aura_sun', { color: col, scale: 0.45 + e.radius * 0.5 });
  if (em) { e.data.eliteAura = em; e.own(() => em.remove()); }
  if (e.cr) e.cr.group.scale.setScalar(1.18);
  e.dmgMul *= 1.15;
}
/** Hook calls into affixes (onDamaged / onDeath / onHitPlayer). */
export function affixEvent(e, kind, ...args) {
  if (!e.affixes) return;
  for (const a of e.affixes) { const f = AFFIXES[a]?.[kind]; if (f) { try { f(e, ...args); } catch (err) { G.reportError('combat:affix:' + a, err); } } }
}
