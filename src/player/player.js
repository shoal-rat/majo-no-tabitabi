// G.player — the travelling witch Elaina (DESIGN §3.1, §3.4, §6.8): kinematic controller, swimming, dodge, broom, light wings,
// elements reactor, stats / mana / damage, save + events. G.cam lives in camera.js; the shared rig in src/actors/.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { addItem } from '../core/save.js';
import { clamp, damp, dampAngle, angleDiff, lerp } from '../core/util.js';
import { journeyWand } from '../actors/journey-props.js';
import { createActor, makeActorShadowBlob } from '../actors/rig.js';
import { CLIPS } from '../actors/clips.js';
import { createCamera } from './camera.js';
import { createBroom, BROOM } from './broom.js';
import { createWings } from './wings.js';
import { createWardrobe, assetOf, initialOutfit } from './wardrobe.js';   // wardrobe
import { outfitById, journeyOutfit } from '../data/outfits.js';          // wardrobe

// ---- tuning (§3.4) -------------------------------------------------------------------------------------------------
export const MOVE = {
  WALK: 5.5, SPRINT: 8.5, ACCEL: 46, DECEL: 38, TURN: 14, AIR_ACCEL: 15, AIR_TURN: 5,
  GRAVITY: 22, FALL_MUL: 1.18, CUT_MUL: 2.1, MAX_FALL: 42,
  JUMP: 7.5, AIR_JUMP: 7.0, COYOTE: 0.12, BUFFER: 0.15,
  STEP: 0.55, SLIDE_SLOPE: 0.93, MAX_CLIMB: 0.95,
  DODGE_DIST: 6, DODGE_TIME: 0.36, DODGE_IFRAMES: 0.35, DODGE_CD: 0.45,
  SWIM: 3.3, SWIM_FAST: 5.0, SWIM_DEPTH: 1.05,
  GLIDE_SPEED: 9.5, GLIDE_SINK: 2.3, GLIDE_TURN: 2.1,
  RADIUS: 0.4, HEIGHT: 1.6,
};

// Resolve her current episode costume before the player rig is constructed.
export function akariId() { return assetOf(initialOutfit()); }

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _wind = new THREE.Vector3();
const _rayO = new THREE.Vector3(), _rayD = new THREE.Vector3();
const INPUT = { mx: 0, my: 0, wx: 0, wz: 0, wish: 0, sprint: false, jumpP: false, jumpH: false, jumpR: false, down: false, dodge: false, broom: false, heal: false };

/** Surface name under a point, for footsteps. */
function surfaceAt(x, z, y, sup) {
  const W = G.world;
  if (sup && sup.body) return sup.body.material || 'wood';
  const h = W.heightAt(x, z);
  if (y > h + 0.08) return 'wood';                                  // platform / bridge / deck
  if (h < W.seaLevel + 0.05 && W.riverDist(x, z) < 12 || h < W.seaLevel - 0.15) return 'water';
  if (h > 96) return 'snow';
  if (W.roadDist(x, z) < 2.6) return 'path';
  if (h < W.seaLevel + 1.4) return 'sand';
  if (W.slopeAt(x, z) > 0.62) return 'stone';
  return 'grass';
}

function build() {
  const W = G.world;
  const group = new THREE.Group();
  group.name = 'player';
  const tilt = new THREE.Group();
  group.add(tilt);
  G.scene.add(group);

  const P = {
    group, pos: group.position, vel: new THREE.Vector3(), yaw: 0,
    hp: 100, maxHp: 100, mana: 100, maxMana: 100, dead: false,
    state: 'ground', grounded: true, onBroom: false, gliding: false, speed: 0,
    sprinting: false, boosting: false, aiming: false, guarding: false,
    radius: MOVE.RADIUS, height: MOVE.HEIGHT, team: 'player', reactor: null, physChar: null,
    aim: { origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), point: new THREE.Vector3(), dist: 120, target: null, body: null, surface: '' },
    /** Shared rig (createActor) — bones, play(), lookAt()… */
    rig: null,
    broom: null,
    stats: { walk: MOVE.WALK, sprint: MOVE.SPRINT },
    control: true,
  };

  const S = {
    tilt, rig: null, coyote: 0, buffer: 0, jumpCut: false, airJumps: 1, airDodge: true, jumpHeldT: 0,
    dodgeT: 0, dodgeCd: 0, dodgeDir: new THREE.Vector3(), iframes: 0, invuln: 0, lockT: 0, stunT: 0,
    squash: 0, squashV: 0, lean: 0, bank: 0, pitch: 0, prevYaw: 0,
    fallMaxVy: 0, airT: 0, stepAcc: 0, safe: new THREE.Vector3(), safeT: 0,
    swimT: 0, soakT: 0, wade: false, faceAimT: 0, deadT: 0, manaT: 0, lamp: 0,
    slideT: 0, onSlide: false, groundY: 0, support: null, splashCd: 0, glideT: 0,
    wingsLift: 0, immuneTemp: [], expT: 0, lastHurtT: -9, idleT: 0, landLock: 0,
  };
  P._S = S;

  // ---- character ----
  const ACTOR_OPTS = { castShadow: true, fidgets: true, footGround: (x, z) => W.groundAt(x, z, P.pos.y + 0.6) };
  let rig = createActor(akariId(), ACTOR_OPTS);   // `let`: the wardrobe swaps it (setRig below)
  S.rig = rig; P.rig = rig;
  tilt.add(rig.group);
  // ---- wardrobe: G.player.outfit / setOutfit(id) (src/player/wardrobe.js) ----
  S.wardrobe = createWardrobe(P, S, { outfit: initialOutfit(), opts: ACTOR_OPTS, create: createActor, setRig: (r) => { rig = r; S.rig = r; P.rig = r; } });
  Object.defineProperty(P, 'outfit', { get: () => S.wardrobe.outfit, enumerable: true });
  P.setOutfit = (id, o) => S.wardrobe.set(id, o);

  const gohei = journeyWand();
  rig.attach(gohei, 'handR', { pos:[-.075,-.025,0], rot:[Math.PI/2,0,-.25] });
  P.gohei = gohei;

  // In the dark her wand carries a pinprick of light, with the same ambient falloff as flight.
  const focus = new THREE.Mesh(new THREE.IcosahedronGeometry(.010,1),new THREE.MeshBasicMaterial({color:0xffe9be,toneMapped:false}));
  focus.name='Journey_wand_light';focus.position.set(.009,.267,-.003);focus.visible=false;gohei.add(focus);
  const light = new THREE.PointLight(0xffb560, 0, 16, 2);
  light.castShadow = false;
  group.add(light);
  light.position.set(0, 2.1, -0.5);
  S.light = light; S.wandLight = focus;

  // wings of light on the back
  const wings = createWings();
  rig.attach(wings.root, rig.bones.upperChest ? 'upperChest' : 'chest', { pos: [0, 0.04, -0.2] });
  S.wings = wings;

  // broom
  const broom = createBroom(P, S);
  P.broom = broom;

  // soft blob under her (helps read height while jumping / gliding over dark night ground)
  const blob = makeActorShadowBlob(0.42, 0.32);
  G.scene.add(blob);
  S.blob = blob;

  // ---- API ----------------------------------------------------------------------------------------------------
  Object.assign(P, {
    /** Recompute max HP / mana etc. from G.state.upgrades. */
    recalcStats() {
      const u = (G.state && G.state.upgrades) || {};
      const hpFrac = P.maxHp > 0 ? P.hp / P.maxHp : 1;
      P.maxHp = 100 + 20 * (u.hp | 0);
      P.maxMana = 100 + 20 * (u.mana | 0);
      P.hp = Math.min(P.maxHp, P.hp > 0 ? P.hp : hpFrac * P.maxHp);
      P.mana = Math.min(P.maxMana, P.mana);
      return P;
    },
    /** Deal damage. opts { element?, from? (Vector3|object with pos), knock? (number m/s | Vector3), source? }. Returns damage taken. */
    takeDamage(amount, o = {}) {
      if (P.dead || !(amount > 0)) return 0;
      if ((!o.dot && (S.invuln > 0 || S.iframes > 0)) || G.params.god) return 0;
      let a = amount;
      const from = o.from && (o.from.isVector3 ? o.from : o.from.pos || o.from.position);
      if (P.guarding) {
        let front = true;
        if (from) { _v1.subVectors(from, P.pos); _v1.y = 0; front = _v1.lengthSq() < 1e-4 || (_v1.normalize().x * Math.sin(P.yaw) + _v1.z * Math.cos(P.yaw)) > -0.1; }
        if (front) a *= 0.2;
      }
      a = Math.round(a * 10) / 10;
      // damageFloor (duels): hp never drops below it; onDamageFloor(amount, o) is told when a hit reaches it
      const floor = P.damageFloor;
      if (floor != null && P.hp - a <= floor) {
        a = Math.max(0, Math.round((P.hp - floor) * 10) / 10);
        try { P.onDamageFloor?.(amount, o); } catch (e) { G.reportError('player:damageFloor', e); }
      }
      if (a <= 0) return 0;
      P.hp = Math.max(0, P.hp - a);
      S.lastHurtT = G.time.t;
      G.events.emit('player:damaged', { amount: a, element: o.element || null, from: o.from || null });
      _v1.copy(P.pos); _v1.y += 1.1;
      if (o.dot) {
        G.fx?.text?.(_v1.setY(_v1.y + 0.7), String(Math.round(a)), { color: 0xffa060, size: 0.7 });
        if (P.hp <= 0) die(o);
        return a;
      }
      G.fx?.burst(o.element ? 'hit_' + o.element : 'hit_dark', _v1, { scale: 0.7 });
      G.fx?.text?.(_v2.copy(_v1).setY(_v1.y + 0.7), String(Math.round(a)), { color: 0xff6a5a, size: 0.9 });
      G.fx?.shake?.(clamp(a / 45, 0.12, 0.55), 0.3);
      G.audio?.sfx('player_hurt', { pos: P.pos });
      rig.setExpression('sorrow', 1, 14); rig.setExpression('blink', 0.55, 22); S.expT = 0.7;
      // knockback
      let kn = 0;
      if (o.knock && o.knock.isVector3) { P.vel.add(o.knock); kn = o.knock.length(); }
      else if (o.knock > 0) {
        kn = o.knock;
        if (from) { _v1.subVectors(P.pos, from); _v1.y = 0; if (_v1.lengthSq() < 1e-4) _v1.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); _v1.normalize(); }
        else _v1.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
        if (!P.onBroom) { P.vel.x += _v1.x * kn; P.vel.z += _v1.z * kn; if (P.grounded) { P.vel.y = Math.min(4, kn * 0.4); P.grounded = false; } }
      }
      const heavy = a >= 22 || kn >= 6;
      if (P.hp <= 0) { die(o); return a; }
      if (P.guarding && !heavy) { /* the shield took it: spells/arts plays guard_hit */ }
      else if (heavy && !P.onBroom && P.state !== 'swim') { rig.play('hit_heavy', { restart: true }); S.lockT = 0.55; G.hitstop?.(0.05); }
      else rig.play(Math.random() < 0.5 ? 'hit' : 'hit_head', { restart: true });
      S.invuln = Math.max(S.invuln, heavy ? 0.8 : 0.4);
      return a;
    },
    heal(n) {
      if (P.dead || !(n > 0)) return 0;
      const before = P.hp;
      P.hp = Math.min(P.maxHp, P.hp + n);
      const got = P.hp - before;
      if (got > 0) {
        _v1.copy(P.pos); _v1.y += 1;
        G.fx?.burst('heal', _v1);
        G.events.emit('player:healed', { amount: got });
      }
      return got;
    },
    spendMana(n) { if (!(n >= 0)) return false; if (P.mana + 1e-6 < n) return false; P.mana = Math.max(0, P.mana - n); return true; },
    addMana(n) { if (n > 0) P.mana = Math.min(P.maxMana, P.mana + n); return P.mana; },
    /** Move instantly (y optional: ground). Keeps the broom if riding. */
    teleport(x, y, z) {
      if (z === undefined && y !== undefined && !Number.isFinite(y)) y = undefined;
      const gy = W.groundAt(x, z, Number.isFinite(y) ? y + 0.15 : Infinity);
      const yy = Number.isFinite(y) ? y : gy + 0.02;
      P.pos.set(x, yy, z);
      P.vel.set(0, 0, 0);
      S.safe.set(x, Math.max(yy, gy), z);
      S.groundY = gy;
      S.coyote = 0; S.fallMaxVy = 0; S.airT = 0;
      if (!P.onBroom) {
        if (W.isWater(x, z) && gy < W.seaLevel - MOVE.SWIM_DEPTH && yy <= W.seaLevel + 0.2) { P.pos.y = W.seaLevel; setState('swim'); }
        else if (yy <= gy + 0.1) { P.pos.y = gy; setState('ground'); P.grounded = true; }
        else setState('air');
      }
      G.cam?.snap?.();
      if (P.physChar?.pos) P.physChar.pos.copy(P.pos);
      return P;
    },
    /** Give / take control (cutscenes, dialogue). */
    setControl(on) { P.control = !!on; if (!on) { P.vel.x *= 0.2; P.vel.z *= 0.2; } },
    /** i-frames for `sec` seconds. */
    invulnerable(sec = 1) { S.invuln = Math.max(S.invuln, sec); },
    /**
     * Play an action (logical clip state, see src/actors/clips.js): cast_throw, cast_lob, cast_raise, cast_channel, cast_summon,
     * guard, guard_end, hit, death, interact, cheer, consume… opts: { lock (sec, no movement), face (Vector3 to turn to),
     * faceAim (bool, default true for casts), speed, loop, once, onDone, layer, fade }.
     */
    playAction(name, o = {}) {
      if (name === 'guard_end' || name === 'stop') { if (name === 'guard_end') P.guarding = false; rig.stop('upper', 0.15); return true; }
      if (name === 'guard') P.guarding = true;
      if (name === 'death') { die(o); return true; }
      const def = CLIPS[name];
      if (!def) return false;
      if (o.lock) S.lockT = Math.max(S.lockT, o.lock);
      if (o.face) { _v1.subVectors(o.face, P.pos); if (_v1.x * _v1.x + _v1.z * _v1.z > 1e-4) { S.faceYaw = Math.atan2(_v1.x, _v1.z); S.faceAimT = 0.5; } }
      else if (o.faceAim ?? name.startsWith('cast')) S.faceAimT = Math.max(S.faceAimT, 0.55);
      let layer = o.layer || def.layer || 'full';
      // full-body actions cannot run while riding / swimming / in the air: use the upper overlay there
      if (layer === 'full' && (P.onBroom || P.state === 'swim' || !P.grounded) && name !== 'death') layer = 'upper';
      if (layer === 'full' && !def.loop && !o.lock) S.lockT = Math.max(S.lockT, 0.35);
      return rig.play(name, { ...o, layer, restart: o.restart ?? !def.loop });
    },
    stopAction(name) { if (name === 'guard') P.guarding = false; rig.stop('upper', 0.18, name); },
    /** Mount / dismount the broom (respects G.state.abilities.broom, allowed with ?autostart). */
    toggleBroom() { return P.onBroom ? dismount('manual') : mount(); },
    mountBroom() { return mount(); },
    dismountBroom() { return dismount('manual'); },
    /** Bring her back after death (used by G.gameplay.respawnPlayer or the built-in fallback). */
    revive(x, y, z) {
      if (x !== undefined) P.teleport(x, y, z);
      P.dead = false;
      P.hp = P.maxHp;
      P.mana = Math.max(P.mana, P.maxMana * 0.6);
      S.lockT = 0.9; S.invuln = 2.5; S.deadT = 0;
      if (P.reactor) { P.reactor.burning = 0; P.reactor.frozen = 0; P.reactor.shocked = 0; }
      rig.paused = false;
      rig.play('revive', { fade: 0.05, next: 'idle' });
      rig.clearExpressions();
      G.events.emit('player:respawn', {});
      return P;
    },
    /** Respawn at the checkpoint: G.gameplay.respawnPlayer() when present, else the stored checkpoint. */
    respawn() {
      try { G.gameplay?.respawnPlayer?.(); } catch (e) { G.reportError('player:respawn', e); }
      if (P.dead) {
        const cp = (G.state && G.state.checkpoint) || { x: P.pos.x, z: P.pos.z };
        P.revive(cp.x, undefined, cp.z);
      }
    },
  });

  // ---- state helpers ----
  function setState(s) {
    if (P.state === s) return;
    const prev = P.state;
    P.state = s;
    P.grounded = s === 'ground';
    P.onBroom = s === 'broom';
    const gl = s === 'glide';
    if (gl !== P.gliding) { P.gliding = gl; S.wings.set(gl); G.events.emit('player:glide', { on: gl }); if (gl) G.audio?.sfx('wings_open', { pos: P.pos }); }
    if (prev === 'swim' && s !== 'swim') S.swimT = 0;
  }
  S.setState = setState;

  function canBroom() { return !!(G.state?.abilities?.broom || G.params.autostart || G.params.broom); }
  function canWings() { return !!(G.state?.abilities?.wings || G.params.autostart || G.params.wings); }
  function mount() {
    if (P.onBroom || P.dead) return false;
    if (!canBroom()) { G.ui?.toast?.(t('player.noBroom'), { dur: 2 }); return false; }
    if (S.frozen) return false;
    const fromGround = P.grounded;
    setState('broom');
    broom.mount();
    if (fromGround) rig.play('broom_mount', { restart: true });
    S.airJumps = 1;
    return true;
  }
  function dismount(reason) {
    if (!P.onBroom) return false;
    broom.dismount(reason);
    if (reason === 'water') { P.pos.y = W.seaLevel; setState('swim'); splash(0.6); }
    else if (reason === 'ground') { setState('ground'); P.vel.set(0, 0, 0); rig.play('broom_dismount', { fade: 0.08, restart: true }); }
    else {
      setState('air');
      rig.play(reason === 'manual' ? 'broom_dismount' : 'fall', { fade: 0.08, restart: true });
      S.airJumps = 1; S.airDodge = true;
    }
    return true;
  }

  function die(o = {}) {
    if (P.dead) return;
    P.dead = true;
    P.hp = 0;
    if (P.onBroom) broom.dismount('death');
    if (P.state !== 'swim') setState(P.grounded ? 'ground' : 'air');
    S.wings.set(false);
    rig.stop('upper', 0.1);
    rig.play('death', { fade: 0.1 });
    rig.setExpression('sorrow', 0.8);
    S.deadT = 0;
    P.guarding = false;
    if (G.state?.stats) G.state.stats.deaths = (G.state.stats.deaths | 0) + 1;
    G.fx?.shake?.(0.4, 0.4);
    G.events.emit('player:died', { element: o.element || null, from: o.from || null });
  }

  function splash(power) {
    if (S.splashCd > 0) return;
    S.splashCd = 0.25;
    _v1.set(P.pos.x, W.seaLevel + 0.1, P.pos.z);
    if (!G.water?.impact?.(_v1, power)) {
      G.fx?.burst('splash', _v1, { power: clamp(power, 0.3, 2), scale: 0.6 + power * 0.5 });
    }
    G.audio?.sfx('splash', { pos: _v1, vol: clamp(power, 0.3, 1) });
  }
  S.splash = splash;

  // ---- elements reactor ----
  function registerReactor() {
    const E = G.elements;
    if (!E?.register || P.reactor) return;
    P.reactor = E.register({
      owner: P, kind: 'creature', material: 'flesh', getPos: () => P.pos, radius: 0.45, height: 1.6, team: 'player', living: true,
      on: {
        ignite() { rig.setExpression('surprised', 1, 16); S.expT = 0.6; G.audio?.sfx('player_burn', { pos: P.pos }); },
        extinguish() {},
        burnTick(r, dt) {
          // fix2: a burning heroine does not set the grass alight as she runs (elements spreads every burning
          // reactor to the ground under it; one enemy fireball turned into a screen-swallowing night fire)
          r._spread = 99;
          // her own fire (she cast fire nearby in the last 14 s) burns at 40 %, and warns her once per save
          const own = G.time.t - ownFire.t < 14 && Math.hypot(P.pos.x - ownFire.x, P.pos.z - ownFire.z) < 16;
          burnAcc += (own ? 2 : 4) * dt;
          if (own && !G.state?.flags?.fix2OwnFireTip) { if (G.state?.flags) G.state.flags.fix2OwnFireTip = true; G.ui?.toast?.(t('player.ownFire'), { dur: 3 }); }
          if (own) G.ui?.hurt?.(0.25);
          if (burnAcc >= 2) { const d = burnAcc; burnAcc = 0; P.takeDamage(d, { element: 'fire', source: 'burn', dot: true }); }
        },
        wet() {},
        freeze() { S.frozen = true; S.struggle = 0; },
        thaw() { S.frozen = false; rig.paused = false; _v1.copy(P.pos); _v1.y += 1; G.fx?.burst('shatter_ice', _v1, { scale: 0.6 }); },
        shock(r, power, info) {
          if (info && info.team === 'player') return;
          S.stunT = Math.max(S.stunT, 0.45);
          _v1.copy(P.pos); _v1.y += 1;
          G.fx?.burst('spark', _v1, { color: 'thunder' });
        },
        hit(r, element, power, h) {
          if (!h || h.team === 'player') return;
          const base = h.damage ?? 8 * power;
          P.takeDamage(base * (h.mult || 1), { element, from: h.source && (h.source.pos || h.source.isVector3) ? h.source : (h.pos || null), knock: element === 'wind' ? 7 * power : element === 'earth' ? 5 * power : 0, source: h.source });
        },
      },
    });
  }
  // ---- acting face: effort while a cast winds up, a squint on a hit, a smile on a pickup / a learned spell; the dialogue
  // system's expressions always win (nothing here runs while a dialogue is up)
  S.face = { eff: 0, smileT: 0, smile: 0 };
  const faceFree = () => !G.dialogue?.active && !P.dead;
  G.events.on('item:collected', (e) => {
    if (!faceFree() || (e?.pos && e.pos.distanceToSquared?.(P.pos) > 64)) return;
    S.face.smileT = 0.9; S.face.smile = 0.7;
  });
  G.events.on('spell:learned', () => { if (faceFree()) { S.face.smileT = 1.6; S.face.smile = 1; } });
  S.actFace = actFace;
  function actFace(dt) {
    const F = S.face;
    if (!faceFree()) { if (F.eff > 0.01 || F.on) { rig.setExpression('angry', 0, 10); rig.setExpression('i', 0, 10); F.eff = 0; F.on = false; } rig.blinkRate = 1; return; }
    const up = rig.upperState || '';
    const casting = /^(cast|charm|charge|kinkan|summon)/i.test(up) && S.expT <= 0;
    // effort: brows down and teeth set while the cast winds up / snaps, let go on the follow-through
    F.eff = damp(F.eff, casting ? 1 : 0, casting ? 14 : 5, dt);
    if (F.eff > 0.01 || F.on) { F.on = F.eff > 0.01; rig.setExpression('angry', 0.42 * F.eff, 18); rig.setExpression('i', 0.28 * F.eff, 18); }
    if (F.smileT > 0) {
      F.smileT -= dt;
      if (S.expT <= 0) rig.setExpression('joy', F.smileT > 0 ? F.smile : 0, F.smileT > 0 ? 9 : 4);
    }
    // blink rate with the mood: quicker when hurt or straining, slower and calmer when idle
    const hurtK = G.time.t - S.lastHurtT < 2 ? 1 : 0;
    rig.blinkRate = 1 + 0.9 * hurtK + 0.5 * (rig.exert || 0) + 0.3 * F.eff - (P.speed < 0.3 && !hurtK ? 0.25 : 0);
  }
  let burnAcc = 0;
  const ownFire = { t: -99, x: 0, z: 0 };
  P._registerReactor = registerReactor;
  // remember where her own fire landed (ground fire she started burns her more gently)
  G.events.on('element:applied', (e) => {
    if (e && e.team === 'player' && e.element === 'fire' && e.pos) { ownFire.t = G.time.t; ownFire.x = e.pos.x; ownFire.z = e.pos.z; }
  });
  // own spells never hurt / soak / freeze her: immunise for that one apply()
  G.events.on('element:applied', (e) => {
    const r = P.reactor;
    if (!r || !e || e.team !== 'player' || !r.immune || r.immune.has(e.element)) return;
    r.immune.add(e.element);
    S.immuneTemp.push(e.element);
  });

  return { P, S };
}

// ---- per-frame controller ---------------------------------------------------------------------------------------------
function readInput(P, S) {
  const inp = G.input;
  const ok = G.mode === 'play' && P.control && !P.dead && S.lockT <= 0 && S.stunT <= 0 && !S.frozen;
  const I = INPUT;
  I.mx = ok ? inp.moveX : 0; I.my = ok ? inp.moveY : 0;
  I.sprint = ok && inp.held('sprint');
  I.jumpP = ok && inp.pressed('jump'); I.jumpH = ok && inp.held('jump'); I.jumpR = inp.released('jump');
  I.down = ok && inp.held('descend');
  I.dodge = ok && inp.pressed('dodge');
  I.broom = ok && inp.pressed('broom');
  I.heal = ok && inp.pressed('heal');
  // camera-relative wish direction
  const cy = G.cam ? G.cam.yaw : 0;
  const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
  let wx = fx * I.my + rx * I.mx, wz = fz * I.my + rz * I.mx;
  const l = Math.hypot(wx, wz);
  if (l > 1e-4) { wx /= l; wz /= l; }
  // wish = how hard she is asked to move: 1 for keys (a diagonal too), the stick's length for the touch stick (analog walk)
  I.wx = wx; I.wz = wz; I.wish = l > 1e-4 ? Math.min(1, l) : 0;
  return I;
}

function groundBelow(P, S, x, z, y) {
  const W = G.world;
  let g = W.groundAt(x, z, y, MOVE.STEP);
  let sup = G.physics?.supportAt?.(x, z, y, 1.6);
  S.support = null;
  if (sup && sup.y > g && sup.y <= y + MOVE.STEP + 0.02) { g = sup.y; S.support = sup.body || null; return g; }
  // walking into a low prop (crate, plank, bench): her toes find its top before the capsule shoves it -> clean step-up
  const hv = Math.hypot(P.vel.x, P.vel.z);
  if (hv > 0.6 && P.state === 'ground') {
    const k = (MOVE.RADIUS + 0.06) / hv;
    sup = G.physics?.supportAt?.(x + P.vel.x * k, z + P.vel.z * k, y, 0.4);
    if (sup && sup.y > g + 0.05 && sup.y <= y + MOVE.STEP + 0.02 && sup.body?.isDynamic && sup.body.mass >= PUSH.LIGHT) { g = sup.y; S.support = sup.body; }
  }
  return g;
}

// ---- walking into loose props: heavy things hold her back, light things are nudged along at a walking pace --------
const PUSH = { R: MOVE.RADIUS, LIGHT: 12, HEAVY: 85, MAXV: 2.8, KICK: 4.5 };
const _pc = new THREE.Vector3(), _pl = new THREE.Vector3(), _pq = new THREE.Quaternion();
let _pP = null;
function pushOne(b) {
  if (!b.isDynamic || b._held || !b.alive || b.group === 'projectile') return;
  const P = _pP, p = P.pos;
  const cp = b._cp, vx = b._vext ?? 0.5;
  const top = cp.y + vx, bot = cp.y - vx;
  if (bot >= p.y + MOVE.HEIGHT || top <= p.y + 0.05) return;                         // overhead, or underfoot
  if (top <= p.y + MOVE.STEP + 0.02 && b.mass >= PUSH.LIGHT) return;                // low and solid: she steps up onto it
  // closest point of the body's footprint to her axis (box / hull: oriented half extents; round shapes: radius)
  let nx, nz, dist;
  if (b.shape === 'box' || b.shape === 'hull') {
    _pl.set(p.x - cp.x, 0, p.z - cp.z).applyQuaternion(_pq.copy(b.quat).invert());
    const he = b._he;
    const qx = Math.max(-he[0], Math.min(he[0], _pl.x)), qz = Math.max(-he[2], Math.min(he[2], _pl.z));
    _pl.set(_pl.x - qx, 0, _pl.z - qz).applyQuaternion(b.quat);
    nx = _pl.x; nz = _pl.z; dist = Math.hypot(nx, nz);
    if (dist < 1e-4) { nx = p.x - cp.x; nz = p.z - cp.z; dist = -(Math.hypot(nx, nz) || 1e-4); }
  } else {
    nx = p.x - cp.x; nz = p.z - cp.z; dist = (Math.hypot(nx, nz) || 1e-4) - (b._r ?? b.radius);
  }
  const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
  const pen = PUSH.R - dist;
  if (pen <= 0) return;
  const resist = clamp((b.mass - PUSH.LIGHT) / (PUSH.HEAVY - PUSH.LIGHT), 0, 1);
  const vn = -(P.vel.x * nx + P.vel.z * nz);                                         // her speed into the body
  // the prop's pace: light things are kicked a little ahead of her, solid ones move at a shove pace, heavy ones not at all
  const pace = vn <= 0 ? 0 : resist === 0 ? Math.min(PUSH.KICK, vn * 1.15) : Math.min(PUSH.MAXV * (1 - resist), vn);
  if (resist > 0) {
    // she cannot walk through it: back out of the overlap and lean into it at its pace
    p.x += nx * pen * 0.85; p.z += nz * pen * 0.85;
    if (vn > pace) { P.vel.x += nx * (vn - pace); P.vel.z += nz * (vn - pace); }
  }
  if (pace > 0.05) {
    const along = -(b.vel.x * nx + b.vel.z * nz);
    if (along < pace) { _pc.set(b.vel.x - nx * (pace - along), b.vel.y, b.vel.z - nz * (pace - along)); b.setVelocity(_pc); }
  }
}
function pushProps(P, S, dt) {
  const ph = G.physics;
  if (!ph?.overlapSphere || P.onBroom) return;
  _pP = P;
  _pc.set(P.pos.x, P.pos.y + MOVE.HEIGHT * 0.5, P.pos.z);
  ph.overlapSphere(_pc, MOVE.HEIGHT * 0.5 + 0.1, pushOne);
}

function stepGround(dt, P, S, I) {
  const W = G.world;
  const stats = P.stats;
  // speed
  let maxV = I.sprint ? stats.sprint : stats.walk;
  const r = P.reactor;
  if (r) { if (r.burning) maxV *= 1.1; if (r.wet > 0) maxV *= 0.95; if (!r.frozen) maxV *= Math.max(0.4, r.speedMul ?? 1); } // mud / frost fields slow her too
  if (S.wade) maxV *= 0.68;
  if (P.guarding) maxV *= 0.45;
  const air = P.state === 'air' || P.state === 'glide';
  const tvx = I.wx * maxV * I.wish, tvz = I.wz * maxV * I.wish;
  let acc = air ? MOVE.AIR_ACCEL : (I.wish ? MOVE.ACCEL : MOVE.DECEL);
  // sharp reversal on the ground: brake harder
  if (!air && I.wish && P.vel.x * tvx + P.vel.z * tvz < 0) acc *= 1.6;
  const dvx = tvx - P.vel.x, dvz = tvz - P.vel.z;
  const dl = Math.hypot(dvx, dvz), step = acc * dt;
  if (S.dodgeT <= 0 && S.slideT <= 0) {
    if (dl <= step) { P.vel.x = tvx; P.vel.z = tvz; }
    else if (!(air && !I.wish)) { P.vel.x += dvx / dl * step; P.vel.z += dvz / dl * step; }
  }
  P.sprinting = I.sprint && I.wish && !air;
  // facing
  let faceT = null;
  if (S.faceAimT > 0) faceT = S.faceYaw ?? (P.aim ? Math.atan2(P.aim.dir.x, P.aim.dir.z) : null);
  else if (G.combat?.lockTarget && !G.combat.lockTarget.dead && P.state === 'ground') { const lp = G.combat.lockTarget.pos; if (lp) faceT = Math.atan2(lp.x - P.pos.x, lp.z - P.pos.z); }
  if (faceT === null && I.wish) faceT = Math.atan2(I.wx, I.wz);
  if (faceT !== null && S.dodgeT <= 0) P.yaw = dampAngle(P.yaw, faceT, air ? MOVE.AIR_TURN : MOVE.TURN, dt);
}

function integrate(dt, P, S, I) {
  const W = G.world;
  const p = P.pos;
  const ox = p.x, oz = p.z, oy = p.y;
  // dodge drive
  if (S.dodgeT > 0) {
    const k = 1 - S.dodgeT / MOVE.DODGE_TIME; // 0 -> 1
    const v0 = MOVE.DODGE_DIST * 1.5 / MOVE.DODGE_TIME;
    const v = v0 * (1 - k * k);
    P.vel.x = S.dodgeDir.x * v; P.vel.z = S.dodgeDir.z * v;
    S.dodgeT -= dt;
    if (S.dodgeT <= 0) { P.vel.x = S.dodgeDir.x * 4.5; P.vel.z = S.dodgeDir.z * 4.5; }
  }
  // steep slope slide
  if (P.state === 'ground' && !S.support && p.y <= W.heightAt(p.x, p.z) + 0.05) {
    const sl = W.slopeAt(p.x, p.z);
    if (sl > MOVE.SLIDE_SLOPE) {
      const n = W.normalAt(p.x, p.z, _v1);
      const h = Math.hypot(n.x, n.z) || 1;
      const a = MOVE.GRAVITY * Math.sin(sl) * 0.9;
      P.vel.x += n.x / h * a * dt; P.vel.z += n.z / h * a * dt;
      S.slideT = 0.25;
    }
  }
  if (S.slideT > 0) S.slideT -= dt;
  S.onSlide = S.slideT > 0;
  // gravity
  if (P.state === 'air') {
    let g = MOVE.GRAVITY;
    if (P.vel.y < 0) g *= MOVE.FALL_MUL;
    else if (S.jumpCut) g *= MOVE.CUT_MUL;
    P.vel.y = Math.max(-MOVE.MAX_FALL, P.vel.y - g * dt);
  }
  // horizontal move + side collisions
  p.x += P.vel.x * dt; p.z += P.vel.z * dt;
  W.resolveCollisions(p, MOVE.RADIUS, MOVE.HEIGHT);
  pushProps(P, S, dt);
  // block climbing walls of terrain that rise too steeply (cliffs), step up small ledges
  const gNew = groundBelow(P, S, p.x, p.z, Math.max(oy, P.state === 'ground' ? S.groundY : oy));
  const rise = gNew - Math.max(oy, S.groundY);
  const hd = Math.hypot(p.x - ox, p.z - oz);
  const baseY = Math.max(oy, S.groundY);
  // a raised floor / deck too tall to step onto is a wall from the side (she used to walk into verandas waist-deep)
  const slab = P.state === 'ground' && hd > 1e-4 && W.slabAt?.(p.x, p.z, baseY + MOVE.STEP + 0.02, baseY + MOVE.HEIGHT * 0.85);
  if (P.state === 'ground' && ((rise > MOVE.STEP && rise > hd * 2.2) || slab)) {
    // try sliding along one axis
    const gX = groundBelow(P, S, p.x, oz, oy), gZ = groundBelow(P, S, ox, p.z, oy);
    const slabX = slab && W.slabAt(p.x, oz, baseY + MOVE.STEP + 0.02, baseY + MOVE.HEIGHT * 0.85);
    const slabZ = slab && W.slabAt(ox, p.z, baseY + MOVE.STEP + 0.02, baseY + MOVE.HEIGHT * 0.85);
    if (gX - oy <= MOVE.STEP && !slabX) { p.z = oz; P.vel.z = 0; }
    else if (gZ - oy <= MOVE.STEP && !slabZ) { p.x = ox; P.vel.x = 0; }
    else { p.x = ox; p.z = oz; P.vel.x = 0; P.vel.z = 0; }
  } else if (P.state === 'air' && gNew > oy + 0.25 && gNew - oy > MOVE.STEP) {
    // flying into a wall of earth: stop horizontally (keep falling)
    if (gNew - oy > 1.2) { p.x = ox; p.z = oz; P.vel.x *= 0.2; P.vel.z *= 0.2; }
  }
  // vertical
  if (P.state === 'air') p.y += P.vel.y * dt;
  const g = groundBelow(P, S, p.x, p.z, Math.max(p.y, oy));
  if (P.state === 'ground') {
    // stick to the ground going down slopes / steps; leave it when it drops away
    if (g >= p.y - 0.62 || (S.support && g >= p.y - 1.0)) {
      const up = g - p.y;
      if (up > 0.08) S.stepVis = Math.max(S.stepVis || 0, -Math.min(up, 0.6)); // visual ease for step-up
      p.y = g; P.vel.y = 0;
    } else {
      P.state = 'air'; P.grounded = false; S.coyote = MOVE.COYOTE; P.vel.y = Math.min(P.vel.y, 0);
    }
  } else if (P.state === 'air' || P.state === 'glide') {
    if (P.vel.y <= 0 && p.y <= g + 0.02) {
      if (p.y < g - 0.8 && oy < g - 0.4) { /* well below a surface we passed under: keep falling */ }
      else { p.y = g; land(P, S, -P.vel.y); }
    } else if (p.y < g - 0.05 && P.vel.y > 0 && g - p.y < 0.6) {
      p.y = g; // popped up through a slope while rising
    }
  }
  S.groundY = g;
  // ceiling while jumping
  if (P.vel.y > 0 && P.state === 'air') {
    const c = W.ceilingAt(p.x, p.z, oy + MOVE.HEIGHT - 0.2);
    if (p.y + MOVE.HEIGHT > c) { p.y = c - MOVE.HEIGHT; P.vel.y = 0; }
  }
}

// ---- giant mushroom caps: G.flora.bouncePads (static list) through a lazily built 8 m grid
const PAD_CELL = 8;
let padGrid = null, padSrc = null, padN = 0;
function padAt(p, above = 0.6) {
  const pads = G.flora?.bouncePads;
  if (!pads || !pads.length) return null;
  if (pads !== padSrc || pads.length !== padN) {
    padSrc = pads; padN = pads.length; padGrid = new Map();
    for (const pad of pads) {
      const r = pad.radius || 1;
      for (let cx = Math.floor((pad.pos.x - r) / PAD_CELL); cx <= Math.floor((pad.pos.x + r) / PAD_CELL); cx++)
        for (let cz = Math.floor((pad.pos.z - r) / PAD_CELL); cz <= Math.floor((pad.pos.z + r) / PAD_CELL); cz++) {
          const k = cx * 73856093 ^ cz * 19349663;
          let a = padGrid.get(k); if (!a) padGrid.set(k, (a = [])); a.push(pad);
        }
    }
  }
  const a = padGrid.get(Math.floor(p.x / PAD_CELL) * 73856093 ^ Math.floor(p.z / PAD_CELL) * 19349663);
  if (!a) return null;
  for (const pad of a) {
    const dx = p.x - pad.pos.x, dz = p.z - pad.pos.z, r = (pad.radius || 1) * 0.92;
    const dy = p.y - pad.pos.y;
    if (dx * dx + dz * dz < r * r && dy > -0.6 && dy < above) return pad;
  }
  return null;
}

function bounce(P, S, pad, fell) {
  const held = G.mode === 'play' && (G.input?.held?.('jump') || S.buffer > 0);
  const power = pad.power || 16;
  // chainable: arriving fast from a previous bounce keeps some of it; holding jump goes higher
  const v = Math.min(power * 1.45, power * (held ? 1.18 : 0.9) + Math.max(0, fell - power) * 0.25);
  S.setState('air');
  P.vel.y = v;
  P.vel.x *= 0.85; P.vel.z *= 0.85;
  S.airJumps = 1; S.airDodge = true; S.jumpCut = false; S.bouncing = true; S.buffer = 0; S.coyote = 0;
  S.fallMaxVy = 0; S.airT = 0; S.jumpHeldT = 0; S.bounceT = 0; S.bouncePow = held ? 0 : power;
  S.squashV -= clamp(fell / 14, 0.4, 1.2) * 3.4;
  S.rig.play('jump', { restart: true, next: 'fall' });
  _v1.copy(pad.pos); _v1.y += 0.25;
  G.fx?.burst?.('jump', _v1, { color: 0xe7c8ff, scale: 1.3 });
  G.fx?.ring?.(_v1, { color: 0xf0d8ff, radius: (pad.radius || 2) * 1.1, dur: 0.45, y: _v1.y });
  G.flora?.squashPad?.(pad.id, clamp(fell / 16, 0.3, 1));
  G.audio?.sfx('bounce', { pos: P.pos, vol: clamp(0.55 + fell / 30, 0.55, 1), pitch: 1.18 - Math.min(0.3, power / 80) });
  G.events.emit('player:bounce', { pad: pad.id, speed: v });
}

function land(P, S, speed) {
  const rig = S.rig;
  const wasGlide = P.state === 'glide';
  S.bouncing = false;
  const pad = P.state !== 'cutscene' ? padAt(P.pos) : null;
  if (pad) { bounce(P, S, pad, Math.max(speed, S.fallMaxVy, 4)); return; }
  S.setState('ground');
  P.vel.y = 0;
  S.airJumps = 1; S.airDodge = true; S.jumpCut = false;
  const fell = Math.max(speed, S.fallMaxVy);
  S.fallMaxVy = 0;
  if (fell > 3.5) {
    G.events.emit('player:land', { speed: fell });
    S.squashV -= clamp(fell / 16, 0.05, 1.1) * 3.2;
    const moving = Math.hypot(P.vel.x, P.vel.z) > 1.5;
    if (fell > 9) {
      _v1.copy(P.pos); _v1.y += 0.15;
      G.fx?.burst(fell > 15 ? 'land' : 'dust', _v1, { power: clamp(fell / 14, 0.3, 2) });
      if (fell > 15) G.fx?.shake?.(clamp((fell - 15) / 30, 0.05, 0.35), 0.25);
    }
    if (!moving && S.dodgeT <= 0 && (!rig.busy || rig.current === 'jump' || rig.current === 'air_jump')) rig.play(fell > 17 ? 'land_hard' : fell > 12 ? 'land' : 'land_soft', { restart: true });
    else if (moving && fell > 12 && S.dodgeT <= 0) S.squashV -= 1.2; // running landing: a deeper dip, no stop
    if (fell > 12 && !moving) S.landLock = 0.18;
    G.audio?.sfx('land', { pos: P.pos, vol: clamp(fell / 15, 0.3, 1) });
    if (fell > 24 && !wasGlide) P.takeDamage(Math.round((fell - 24) * 3), { source: 'fall' });
  }
}

function tryJump(P, S, I) {
  if (S.buffer <= 0) return false;
  if (P.state === 'ground' || S.coyote > 0) {
    S.buffer = 0; S.coyote = 0;
    P.state = 'air'; P.grounded = false;
    P.vel.y = MOVE.JUMP + (S.support?.vel?.y > 0 ? S.support.vel.y : 0);
    S.jumpCut = false; S.jumpHeldT = 0; S.airT = 0;
    S.rig.play('jump', { restart: true, next: 'fall' });
    S.squashV += 2.2;
    _v1.copy(P.pos); _v1.y += 0.1;
    if (Math.hypot(P.vel.x, P.vel.z) > 6) G.fx?.burst('dust', _v1, { power: 0.4, scale: 0.6 });
    G.events.emit('player:jump', { air: false });
    G.audio?.sfx('jump', { pos: P.pos });
    return true;
  }
  return false;
}

function airJump(P, S, I) {
  if (S.airJumps <= 0) return false;
  S.airJumps--;
  S.buffer = 0;
  P.vel.y = MOVE.AIR_JUMP;
  if (I.wish) { const sp = Math.max(Math.hypot(P.vel.x, P.vel.z), 4); P.vel.x = I.wx * sp; P.vel.z = I.wz * sp; P.yaw = Math.atan2(I.wx, I.wz); }
  S.jumpCut = false; S.jumpHeldT = 0;
  S.rig.play('air_jump', { restart: true, next: 'fall' });
  _v1.copy(P.pos); _v1.y += 0.2;
  G.fx?.burst('jump', _v1, { color: 0xffe9a8 });
  G.fx?.ring?.(_v1, { color: 0xffe2a8, radius: 1.6, dur: 0.4, y: _v1.y });
  G.events.emit('player:jump', { air: true });
  G.audio?.sfx('jump_air', { pos: P.pos });
  return true;
}

function startDodge(P, S, I) {
  if (S.dodgeCd > 0 || S.dodgeT > 0) return false;
  const air = P.state !== 'ground';
  if (air && !S.airDodge) return false;
  // direction: input (camera-relative) or backwards from facing
  let dx, dz;
  if (I.wish) { dx = I.wx; dz = I.wz; }
  else { dx = -Math.sin(P.yaw); dz = -Math.cos(P.yaw); }
  S.dodgeDir.set(dx, 0, dz);
  S.dodgeT = MOVE.DODGE_TIME;
  S.dodgeCd = MOVE.DODGE_TIME + MOVE.DODGE_CD;
  S.iframes = MOVE.DODGE_IFRAMES;
  const locked = G.combat?.lockTarget && !G.combat.lockTarget.dead;
  if (I.wish && !locked) P.yaw = Math.atan2(dx, dz);
  if (air) { S.airDodge = false; P.vel.y = Math.max(P.vel.y, 2.2); }
  S.rig.play('dodge', { restart: true, speed: air ? 2.2 : undefined });
  _v1.copy(P.pos); _v1.y += 0.7;
  G.fx?.burst('dash', _v1, { dir: S.dodgeDir, color: 0xffe9c0 });
  G.events.emit('player:dodge', { dir: S.dodgeDir.clone(), air });
  G.audio?.sfx('dodge', { pos: P.pos });
  return true;
}

function stepSwim(dt, P, S, I) {
  const W = G.world;
  const p = P.pos;
  const maxV = I.sprint ? MOVE.SWIM_FAST : MOVE.SWIM;
  const tvx = I.wx * maxV * I.wish, tvz = I.wz * maxV * I.wish;
  P.vel.x = damp(P.vel.x, tvx, 3.2, dt); P.vel.z = damp(P.vel.z, tvz, 3.2, dt);
  if (I.wish) P.yaw = dampAngle(P.yaw, Math.atan2(I.wx, I.wz), 5, dt);
  S.swimT += dt;
  p.x += P.vel.x * dt; p.z += P.vel.z * dt;
  W.resolveCollisions(p, MOVE.RADIUS, MOVE.HEIGHT);
  const sea = W.seaLevel;
  p.y = damp(p.y, sea + Math.sin(S.swimT * 2.4) * 0.035, 6, dt);
  P.vel.y = 0;
  // soak + put out fire
  S.soakT -= dt;
  if (S.soakT <= 0 && P.reactor) { S.soakT = 0.6; P.reactor.soak?.(12); }
  // wake ripples
  if (I.wish) { S.wakeT = (S.wakeT || 0) - dt; if (S.wakeT <= 0) { S.wakeT = 0.35; _v1.set(p.x, sea + 0.05, p.z); G.fx?.burst('splash', _v1, { scale: 0.3, count: 0.25, power: 0.25 }); } }
  // shallow: stand up
  const g = groundBelow(P, S, p.x, p.z, p.y + 0.2);
  if (g > sea - MOVE.SWIM_DEPTH + 0.08 || !W.isWater(p.x, p.z) && g > sea - 1.4) {
    p.y = Math.max(g, p.y - 0.4);
    S.setState(g >= p.y - 0.05 ? 'ground' : 'air');
    if (P.state === 'ground') p.y = g;
  }
  // jump out (climb a bank)
  if (I.jumpP) {
    S.setState('air');
    P.vel.y = 6.6;
    S.rig.play('jump', { restart: true, next: 'fall' });
    splash(P, S, 0.6);
    G.events.emit('player:jump', { air: false, water: true });
  }
}
function splash(P, S, k) { S.splash(k); }

function stepGlide(dt, P, S, I) {
  // heading turns toward input; constant forward drift; lift from wind / updrafts
  const W = G.world;
  if (I.wish) {
    const want = Math.atan2(I.wx, I.wz);
    const d = angleDiff(P.yaw, want);
    const rate = clamp(d * 3, -MOVE.GLIDE_TURN, MOVE.GLIDE_TURN);
    P.yaw += rate * dt;
    S.bankT = clamp(-rate * 0.3, -0.6, 0.6);
  } else S.bankT = 0;
  const fwd = (I.wish ? MOVE.GLIDE_SPEED : 5.5) * (I.sprint ? 1.35 : 1) * (I.down ? 1.25 : 1);
  P.vel.x = damp(P.vel.x, Math.sin(P.yaw) * fwd, 2.4, dt);
  P.vel.z = damp(P.vel.z, Math.cos(P.yaw) * fwd, 2.4, dt);
  let lift = 0;
  if (G.elements?.windAt) {
    _v1.copy(P.pos); _v1.y += 1;
    const w = G.elements.windAt(_v1, _wind);
    if (w) { lift = Math.max(0, w.y); P.vel.x += w.x * 0.6 * dt; P.vel.z += w.z * 0.6 * dt; }
  }
  S.wingsLift = damp(S.wingsLift, clamp(lift / 8), 3, dt);
  const sink = -(MOVE.GLIDE_SINK * (I.sprint ? 1.6 : 1) * (I.down ? 3.2 : 1));
  const vyT = sink + lift * 1.1;
  P.vel.y = damp(P.vel.y, Math.min(vyT, 14), lift > 0.5 ? 2.2 : 3.5, dt);
  // treat as 'air' for the integrator (gravity off: integrate y here)
  P.pos.y += P.vel.y * dt;
  if (P.pos.y > BROOM.MAX_Y) { P.pos.y = BROOM.MAX_Y; P.vel.y = Math.min(0, P.vel.y); }
  // emitter
  if (S.wingDust) { S.wingDust.pos.copy(P.pos); S.wingDust.pos.y += 1.2; }
}

// ---- system ----------------------------------------------------------------------------------------------------------
let P = null, S = null;

export const playerSystem = {
  name: 'player',
  async init(G) {
    await G.assets?.load?.(akariId());
    ({ P, S } = build());
    G.player = P;
    G.cam = createCamera();
    G.actors = { createActor, makeActorShadowBlob, CLIPS };
    // stand at the spawn behind the title
    const a = G.world.ANCHORS?.spawn || { x: -540, z: 58, face: Math.PI };
    P.teleport(a.x, undefined, a.z);
    P.yaw = a.face || 0;
    G.events.on('save:collect', (st) => {
      if (!P || !st) return;
      st.player = st.player || {};
      const sp = st.player;
      sp.x = +P.pos.x.toFixed(2); sp.z = +P.pos.z.toFixed(2); sp.y = +P.pos.y.toFixed(2); sp.yaw = +P.yaw.toFixed(3);
      sp.hp = Math.round(P.hp * 10) / 10; sp.mana = Math.round(P.mana * 10) / 10;
      if (P.onBroom) sp.y = +(G.world.groundAt(P.pos.x, P.pos.z) + 0.02).toFixed(2);
      st.outfit = P.outfit;   // wardrobe
    });
    G.events.on('mode:changed', ({ mode }) => {
      if (mode !== 'play' && P) { P.vel.x *= 0.3; P.vel.z *= 0.3; }
    });
  },

  start(G) {
    if (!P) return;
    const sp = (G.state && G.state.player) || {};
    P.recalcStats();
    P.hp = Number.isFinite(sp.hp) ? clamp(sp.hp, 1, P.maxHp) : P.maxHp;
    P.mana = Number.isFinite(sp.mana) ? clamp(sp.mana, 0, P.maxMana) : P.maxMana;
    P.dead = false;
    if (P.onBroom) P.broom.dismount('start');
    S.setState('ground');
    const x = Number.isFinite(sp.x) ? sp.x : -540, z = Number.isFinite(sp.z) ? sp.z : 58;
    const floor = G.world.groundAt(x, z, Number.isFinite(sp.y) ? sp.y + 0.5 : G.world.heightAt(x,z) + 1.25);
    P.teleport(x, Number.isFinite(sp.y) ? Math.max(sp.y, floor) : floor, z);
    P.yaw = Number.isFinite(sp.yaw) ? sp.yaw : 0;
    G.cam.setBehind(P.yaw);
    G.cam.snap();
    P._registerReactor();
    if (G.physics?.addCharacter && !P.physChar) {
      try { P.physChar = G.physics.addCharacter({ getPos: () => P.pos, radius: MOVE.RADIUS, height: MOVE.HEIGHT, owner: P }); } catch (e) { G.reportError('player:physChar', e); }
    }
    S.rig.play('idle', { fade: 0.01 });
    // wardrobe: ?outfit= wins over the save; a save without the field (or an unknown id) wears the default
    const want = outfitById(G.params?.outfit) ? G.params.outfit : journeyOutfit(G.state);
    if (G.state) G.state.outfit = want;
    P.setOutfit(want, { quiet: true });
  },

  update(dt) {
    if (!P) return;
    const W = G.world;
    S.wardrobe.tick();   // wardrobe: a pending change of clothes happens here, before anything reads or draws her
    const rig = S.rig;
    // restore temporary self-immunity granted for the player's own spells
    if (S.immuneTemp.length && P.reactor) { for (const e of S.immuneTemp) P.reactor.immune.delete(e); S.immuneTemp.length = 0; }
    if (dt <= 0) { rig.update(0); return; }
    if (!G.started || G.mode === 'title') { titleStage(dt); rig.update(dt); placeVisuals(dt); return; }

    // timers
    S.invuln = Math.max(0, S.invuln - dt); S.iframes = Math.max(0, S.iframes - dt);
    S.lockT = Math.max(0, S.lockT - dt); S.stunT = Math.max(0, S.stunT - dt); S.landLock = Math.max(0, S.landLock - dt);
    S.dodgeCd = Math.max(0, S.dodgeCd - dt); S.faceAimT = Math.max(0, S.faceAimT - dt);
    if (S.faceAimT <= 0) S.faceYaw = null;
    S.coyote = Math.max(0, S.coyote - dt); S.buffer = Math.max(0, S.buffer - dt);
    S.splashCd = Math.max(0, S.splashCd - dt);
    if (S.expT > 0) { S.expT -= dt; if (S.expT <= 0) rig.clearExpressions(); }
    S.actFace?.(dt);

    if (P.dead) {
      S.deadT += dt;
      P.vel.x = damp(P.vel.x, 0, 4, dt); P.vel.z = damp(P.vel.z, 0, 4, dt);
      if (P.state === 'air' || P.state === 'glide') { if (P.state === 'glide') S.setState('air'); integrate(dt, P, S, INPUT_ZERO); }
      if (S.deadT > 2.8 && !S.respawning) { S.respawning = true; P.respawn(); S.respawning = false; }
      rig.update(dt); placeVisuals(dt); return;
    }

    const I = readInput(P, S);
    if (I.jumpP) S.buffer = MOVE.BUFFER;
    if (I.jumpH) S.jumpHeldT += dt; else S.jumpHeldT = 0;

    // frozen: struggle free
    const r = P.reactor;
    if (S.frozen && !(r && r.frozen > 0)) S.frozen = false;
    if (S.frozen) {
      rig.paused = true;
      const inp = G.input;
      const mash = G.mode === 'play' && (inp.pressed('jump') || inp.pressed('forward') || inp.pressed('back') || inp.pressed('left') || inp.pressed('right') || inp.pressed('dodge'));
      if (mash && r) {
        r.frozen = Math.max(0.05, r.frozen - 0.45);
        S.struggle = 0.12;
        _v1.copy(P.pos); _v1.y += 1;
        G.fx?.burst('hit_ice', _v1, { scale: 0.35, count: 0.4 });
        if (r.frozen <= 0.3) r.thaw?.();
      }
      S.struggle = Math.max(0, (S.struggle || 0) - dt);
      P.vel.x = damp(P.vel.x, 0, 6, dt); P.vel.z = damp(P.vel.z, 0, 6, dt);
      if (P.state === 'air' || P.state === 'glide') { if (P.state === 'glide') S.setState('air'); integrate(dt, P, S, I); }
      else if (P.state === 'broom') { P.broom.dismount('frozen'); S.setState('air'); }
      P.state === 'ground' || P.state === 'swim' || P.state === 'air' || S.setState('air');
      rig.update(dt); placeVisuals(dt); afterMove(dt); return;
    }
    rig.paused = false;

    // broom toggle
    if (I.broom) { if (P.onBroom) dismountBroom(); else P.mountBroom(); }
    // heal (团子)
    if (I.heal && !P.onBroom) eatDango();

    switch (P.state) {
      case 'broom': {
        BIN.mx = I.mx; BIN.my = I.my; BIN.up = I.jumpH; BIN.down = I.down; BIN.boost = I.sprint;
        const res = P.broom.fly(dt, BIN);
        if (res === 'landed') {
          const W2 = G.world;
          if (W2.isWater(P.pos.x, P.pos.z) && W2.groundAt(P.pos.x, P.pos.z) < W2.seaLevel - MOVE.SWIM_DEPTH) { P.pos.y = W2.seaLevel; S.setState('swim'); S.splash(0.6); }
          else { P.pos.y = groundBelow(P, S, P.pos.x, P.pos.z, P.pos.y + 0.3); S.setState('ground'); P.vel.set(0, 0, 0); rig.play('broom_dismount', { fade: 0.1, restart: true }); }
        }
        P.boosting = P.broom.boosting;
        break;
      }
      case 'swim':
        stepSwim(dt, P, S, I);
        if (I.dodge) { /* a quick dive-dash in the water */ P.vel.x += Math.sin(P.yaw) * 4; P.vel.z += Math.cos(P.yaw) * 4; S.splash(0.4); }
        break;
      case 'glide':
        stepGlide(dt, P, S, I);
        integrateGlide(dt);
        if (!I.jumpH || !canWings()) { S.setState('air'); }
        break;
      default: { // ground / air
        if (P.state === 'air') { S.airT += dt; S.fallMaxVy = Math.max(S.fallMaxVy, -P.vel.y); }
        else S.airT = 0;
        // jump / air jump / wings
        let jumped = tryJump(P, S, I);
        if (!jumped && P.state === 'air' && I.jumpP && S.bouncing && S.bounceT < 0.18 && S.bouncePow > 0) {
          // pressed just after a mushroom bounce: same as holding it through the landing
          P.vel.y = Math.max(P.vel.y, S.bouncePow * 1.18 - S.bounceT * MOVE.GRAVITY); S.bouncePow = 0; S.buffer = 0; jumped = true;
        }
        if (!jumped && P.state === 'air' && I.jumpP && S.coyote <= 0) {
          // falling onto a mushroom cap: keep the press buffered for the bounce instead of spending the air jump
          if (P.vel.y < 0 && padAt(P.pos, 2.2)) jumped = true;
          else if (S.airJumps > 0) jumped = airJump(P, S, I);
          else if (canWings()) startGlide();
        }
        if (P.state === 'air' && !jumped) {
          if (!I.jumpH && P.vel.y > 0 && !S.jumpCut && !S.bouncing) S.jumpCut = true;
          if (S.bouncing) { S.bounceT = (S.bounceT || 0) + dt; if (P.vel.y <= 0) S.bouncing = false; }
          // hold jump while falling -> unfold the wings
          if (I.jumpH && canWings() && P.vel.y < -1 && S.jumpHeldT > 0.22 && S.airT > 0.25 && !padAt(P.pos, 3)) startGlide();
        }
        if (I.dodge) startDodge(P, S, I);
        stepGround(dt, P, S, I);
        integrate(dt, P, S, I);
        // water entry from ground / air
        const sea = W.seaLevel;
        if (P.state !== 'swim' && W.isWater(P.pos.x, P.pos.z)) {
          const g = S.groundY;
          if (g < sea - MOVE.SWIM_DEPTH && P.pos.y < sea - 0.25) {
            const v = -P.vel.y;
            P.pos.y = sea; P.vel.y = 0; P.vel.x *= 0.5; P.vel.z *= 0.5;
            S.setState('swim');
            S.fallMaxVy = 0;
            S.splash(clamp(v / 8, 0.4, 2));
          }
        }
        S.wade = P.state === 'ground' && S.groundY < sea - 0.25 && S.groundY > sea - MOVE.SWIM_DEPTH - 0.1;
        if (P.state === 'ground') S.coyote = MOVE.COYOTE;
        break;
      }
    }

    afterMove(dt);
    animate(dt, I);
    rig.update(dt);
    placeVisuals(dt);
  },

  lateUpdate() {
    if (!P || !G.started) return;
    updateAim();
  },
};
const INPUT_ZERO = { mx: 0, my: 0, wx: 0, wz: 0, wish: 0 };
const BIN = { mx: 0, my: 0, up: false, down: false, boost: false };

function canWings() { return !!(G.state?.abilities?.wings || G.params.autostart || G.params.wings); }
function startGlide() {
  if (P.state !== 'air') return;
  S.setState('glide');
  S.glideT = 0;
  P.vel.y = Math.max(P.vel.y, -3);
  _v1.copy(P.pos); _v1.y += 1.2;
  G.fx?.burst('feathers', _v1, { color: 0xffe9a8, scale: 0.8 });
  if (!S.wingDust) S.wingDust = G.fx?.emitter?.('wing_dust', { pos: _v1.clone(), rate: 0.8 }) || null;
  if (S.wingDust) S.wingDust.active = true;
}
function integrateGlide(dt) {
  const W = G.world, p = P.pos;
  const ox = p.x, oz = p.z;
  p.x += P.vel.x * dt; p.z += P.vel.z * dt;
  W.resolveCollisions(p, MOVE.RADIUS, MOVE.HEIGHT);
  const g = groundBelow(P, S, p.x, p.z, p.y + 0.3);
  if (g > p.y + 1.2) { p.x = ox; p.z = oz; }
  S.groundY = g;
  if (p.y <= g + 0.02) { p.y = g; land(P, S, Math.max(0, -P.vel.y)); }
  else if (W.isWater(p.x, p.z) && p.y < W.seaLevel + 0.05 && g < W.seaLevel - MOVE.SWIM_DEPTH) { p.y = W.seaLevel; S.setState('swim'); S.splash(0.6); }
  const c = W.ceilingAt(p.x, p.z, p.y + 1);
  if (p.y + MOVE.HEIGHT > c) { p.y = c - MOVE.HEIGHT; P.vel.y = Math.min(0, P.vel.y); }
}
function dismountBroom() {
  P.dismountBroom();
}
function eatDango() {
  if (!G.state) return;
  if ((G.state.inventory.dango | 0) <= 0) { G.ui?.toast?.(t('player.noDango'), { dur: 1.8 }); return; }
  if (P.hp >= P.maxHp - 0.5) { G.ui?.toast?.(t('player.fullHp'), { dur: 1.6 }); return; }
  addItem(G, 'dango', -1);
  P.heal(40);
  P.playAction('consume', { layer: 'upper' });
  S.rig.setExpression('joy', 1); S.expT = 1.2;
}

/** Shared after-move work: safety, mana, footsteps, wings, physics capsule. */
function afterMove(dt) {
  const W = G.world;
  const p = P.pos;
  P.speed = Math.hypot(P.vel.x, P.vel.z);
  // never inside the terrain
  const h = W.heightAt(p.x, p.z);
  if (p.y < h - 0.25 && P.state !== 'swim') {
    if (p.y < h - 2.5 || P.state !== 'air') { p.y = h; if (P.state === 'air' && P.vel.y < 0) land(P, S, -P.vel.y); }
  }
  // remember a safe spot; recover from falling out of the world
  S.safeT -= dt;
  if (P.state === 'ground' && S.safeT <= 0 && !S.onSlide && !W.isWater(p.x, p.z) && S.groundY > W.seaLevel - 0.3) { S.safe.copy(p); S.safeT = 0.5; }
  if (!Number.isFinite(p.x + p.y + p.z) || p.y < -60 || Math.abs(p.x) > 2600 || Math.abs(p.z) > 2600) {
    const s = S.safe;
    P.teleport(s.x, s.y + 0.05, s.z);
    P.takeDamage(8, { source: 'fall' });
    G.ui?.fade?.(0.6, 0.1)?.then?.(() => G.ui?.fade?.(0, 0.5));
  }
  // mana regen: daylight, lit lanterns / light (§3.4)
  if (!(P.onBroom && P.broom.boosting)) {
    S.manaT -= dt;
    if (S.manaT <= 0) {
      S.manaT = 0.15;
      const day = G.env.light ?? 1;
      const L = G.elements?.lightAt ? G.elements.lightAt(_v1.copy(p).setY(p.y + 1)) : day;
      S.lamp = clamp((L - day) * 1.8, 0, 1);
    }
    P.mana = Math.min(P.maxMana, P.mana + (Math.max(1.6, 6 * (G.env.light ?? 1)) + 10 * S.lamp) * dt); // fix2: a night floor (tight, not dead)
  }
  // footsteps (by distance travelled)
  if (P.state === 'ground' && P.speed > 0.8 && S.dodgeT <= 0) {
    S.stepAcc += P.speed * dt;
    const stride = P.speed > 7 ? 1.55 : P.speed > 3.5 ? 1.15 : 0.72;
    if (S.stepAcc >= stride) {
      S.stepAcc = 0;
      const surface = S.wade ? 'water' : surfaceAt(p.x, p.z, p.y, S.support ? { body: S.support } : null);
      G.events.emit('player:step', { surface, speed: P.speed });
      if (surface === 'water' && S.splashCd <= 0) { S.splashCd = 0.2; _v1.set(p.x, W.seaLevel + 0.05, p.z); G.fx?.burst('splash', _v1, { scale: 0.3, count: 0.3, power: 0.3 }); }
      else if (P.speed > 7.5 && (surface === 'path' || surface === 'sand')) { _v1.copy(p); _v1.y += 0.1; G.fx?.burst('dust', _v1, { power: 0.25, scale: 0.45, count: 0.4 }); }
    }
  } else S.stepAcc = 0.5;
  // wing dust off when not gliding
  if (S.wingDust && !P.gliding) S.wingDust.active = false;
  // rig feet: plant only when standing on the ground
  S.rig.plant = P.state === 'ground' && S.dodgeT <= 0 && !S.onSlide ? clamp(1 - P.speed / 3) : 0;
  S.rig.footLock = P.state === 'ground' && S.dodgeT <= 0 && !S.onSlide ? 1 : 0;
}

/** Pick the full-body state from movement; strafing / back-pedalling, turn-in-place, bank blends, look-at. */
function animate(dt, I) {
  const rig = S.rig;
  if (P.dead) return;
  let want = null, v = 0;
  let legYaw = 0, back = false;
  rig.blendW.glide_l = 0; rig.blendW.glide_r = 0;
  const yawRate = dt > 0 ? angleDiff(S.animYaw ?? P.yaw, P.yaw) / dt : 0;
  S.animYaw = P.yaw;
  switch (P.state) {
    case 'broom':
      if (rig.busy && rig.current === 'broom_mount') break;
      want = P.broom.boosting ? 'broom_boost' : 'sit_broom';
      break;
    case 'swim': want = P.speed > 0.6 ? 'swim' : 'swim_idle'; v = P.speed; break;
    case 'glide': {
      want = 'glide';
      // bank into the turn: the Glide_Bank_L / _R clips share Glide_Loop's timing (time-locked blend)
      const b = clamp(-(S.bankT || 0) / 0.45, -1, 1);
      rig.blendW.glide_l = Math.max(0, -b); rig.blendW.glide_r = Math.max(0, b);
      break;
    }
    case 'air':
      if (rig.current === 'broom_dismount' && rig.progress < .39) break;
      if (S.dodgeT > 0 || (rig.busy && (rig.current === 'jump' || rig.current === 'air_jump' || rig.current === 'dodge'))) want = null;
      else want = 'fall';
      break;
    default: {
      if (S.dodgeT > 0) { want = null; break; }
      if (rig.busy && (S.lockT > 0 || P.speed < 0.6)) { want = null; break; }
      if (rig.busy && /^land|broom_dismount/.test(rig.current) && P.speed < 1.5) { want = null; break; }
      if (S.onSlide) { want = 'slide'; break; }
      want = 'move';
      v = P.speed;
      if (v > 0.5) {
        // facing a lock target / the aim while moving elsewhere: legs go with the motion, the chest keeps facing
        const rel = angleDiff(P.yaw, Math.atan2(P.vel.x, P.vel.z));
        if (Math.abs(rel) > 1.95) { back = true; legYaw = clamp(angleDiff(Math.PI, rel), -0.95, 0.95); }
        else legYaw = clamp(rel, -1.05, 1.05);
        if (back) v *= 0.92;
      } else if (v < 0.3 && Math.abs(yawRate) > 1.3) v = Math.min(0.75, Math.abs(yawRate) * 0.22); // turn in place: little steps
    }
  }
  rig.legYaw = legYaw;
  if (want === 'move') rig.move(v, { back, force: true });
  else if (want && rig.current !== want) rig.play(want);
  if (want === 'swim' && rig.current === 'swim') rig.setGroundSpeed(v);
  rig.exert = damp(rig.exert, P.sprinting || P.state === 'swim' && P.speed > 3.5 ? 1 : 0, P.sprinting ? 0.5 : 0.12, dt);
  // head look: lock target > aim while casting > the thing she could use > ahead of the camera when idle
  const lt = G.combat?.lockTarget;
  const it = G.interact?.current;
  if (lt && !lt.dead && lt.pos) { _v1.copy(lt.pos); _v1.y += (lt.height || 1.4) * 0.8; rig.lookAt(_v1); }
  else if (P.state !== 'broom' && P.state !== 'swim' && P.aim && S.faceAimT > 0) rig.lookAt(P.aim.point);
  else if (it && P.state === 'ground' && (it.getPos ? it.getPos(_v1) : it.pos)) { if (it.pos) _v1.copy(it.pos); _v1.y = Math.max(_v1.y, P.pos.y + 0.9); rig.lookAt(_v1); }
  else if (P.state !== 'broom' && P.state !== 'swim' && P.aim && P.speed < 0.5) rig.lookAt(P.aim.point);
  else rig.lookAt(null);
}

/** Visual-only per-frame placement: yaw, tilt / bank, squash, lantern, wings, blob, broom. */
// gohei grip: the attach rotation reads well in motion; standing idle it would cross the skirt, so it eases to a
// wand-at-her-side angle (stick up, a little forward and out) while she stands still
const GOHEI_MOVE = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, -0.25));
const GOHEI_IDLE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.812, -0.375, -0.832));
function placeGohei(dt) {
  const go = P.gohei; if (!go) return;
  // the clip decides: 'hide' (both hands open / on the broom handle) tucks the wand away, 'hold' grips it as authored
  // in a conversation the wand is tucked away (both hands act); otherwise the clip decides
  const mode = G.dialogue?.active && P.state === 'ground' ? 'hide' : S.rig.goheiMode();
  const hs = S.goheiS = damp(S.goheiS ?? 1, mode === 'hide' ? 0 : 1, mode === 'hide' ? 22 : 14, dt);
  go.visible = hs > 0.04;
  go.scale.setScalar(Math.max(0.04, hs));
  const idle = mode !== 'hold' && P.state === 'ground' && (P.speed || 0) < 0.4 && (!S.rig?.busy || S.rig.current === 'idle' || S.rig.current === 'move');
  const k0 = S.goheiK ?? 0;
  const k = S.goheiK = damp(k0, idle ? 1 : 0, idle ? 4 : mode === 'hold' ? 30 : 12, dt);
  if (Math.abs(k - k0) > 1e-4 || S.goheiSet !== true) { go.quaternion.slerpQuaternions(GOHEI_MOVE, GOHEI_IDLE, k); S.goheiSet = true; }
}

/** Title screen: the heroine dances the kagura at the spawn, turned three-quarters to the title camera (camera.js titleShot). */
function titleStage(dt) {
  const rig = S.rig;
  if (rig.current !== 'kagura' && rig.has('kagura')) rig.play('kagura', { fade: 0.6 });
  const c = G.camera;
  if (!c) return;
  const want = Math.atan2(c.position.x - P.pos.x, c.position.z - P.pos.z) - 0.4;
  P.yaw += angleDiff(P.yaw, want) * Math.min(1, dt * 2);
}

function placeVisuals(dt) {
  const W = G.world;
  const g = P.group, tilt = S.tilt;
  placeGohei(dt);
  g.rotation.y = P.yaw;
  // turn rate -> lean
  const yawRate = dt > 0 ? angleDiff(S.prevYaw, P.yaw) / dt : 0;
  S.prevYaw = P.yaw;
  let bank = 0, pitch = 0;
  if (P.state === 'broom') { bank = P.broom.bank; pitch = P.broom.pitch; }
  else if (P.state === 'glide') { bank = (S.bankT || 0); pitch = 0.18 + clamp(-P.vel.y * 0.02, -0.15, 0.2); }
  else if (P.state === 'ground') {
    // lean into turns, into acceleration, back against braking
    const acc = dt > 0 ? (P.speed - (S.prevSpeed ?? P.speed)) / dt : 0;
    S.accF = damp(S.accF || 0, acc, 10, dt);
    bank = clamp(-yawRate * P.speed * 0.012, -0.16, 0.16);
    pitch = (P.sprinting ? 0.07 : 0) + clamp(S.accF * 0.0035, -0.11, 0.09);
  }
  S.prevSpeed = P.speed;
  S.bank = damp(S.bank, bank, 8, dt); S.pitch = damp(S.pitch, pitch, 6, dt);
  // squash spring
  S.squashV += (-S.squash * 170 - S.squashV * 14) * dt;
  S.squash += S.squashV * dt;
  S.squash = clamp(S.squash, -0.28, 0.25);
  const sy = 1 + S.squash, sxz = 1 - S.squash * 0.5;
  tilt.scale.set(sxz, sy, sxz);
  // step-up ease
  S.stepVis = damp(S.stepVis || 0, 0, 14, dt);
  tilt.position.y = S.stepVis;
  tilt.rotation.set(S.pitch, 0, S.bank);
  // frozen shiver
  if (S.frozen && S.struggle > 0) { tilt.position.x = Math.sin(G.time.t * 80) * 0.03; } else tilt.position.x = 0;
  // swim: the origin is on the water line already (clip convention)
  P.broom.visuals(dt);
  // The ride clip contains the two fitted grips. The cloth uses the same
  // physical seat frame as the handle and the hands through turns and boost.
  S.rig.travellerSeat = P.onBroom && P.broom.holder.visible ? P.broom.holder : null;
  // wings
  S.wings.update(dt, S.bank, S.wingsLift, 1 - 0.55 * clamp(((G.env.veil || 0) - 0.2) / 0.6));
  // lantern + light: warm, only under the Veil; on the broom it moves to the tail lantern
  const veil = G.env.veil || 0;
  const night = clamp((veil - 0.25) / 0.55);
  const L = S.light;
  if (P.state === 'broom' && P.broom.holder.visible) {
    // a little below and behind the tail lantern, so the light pools on the ground more than on her
    L.position.set(0, BROOM.SEAT - 0.9, -1.9);
    L.intensity = 1.5 * (P.broom.glow || 0) + 6.5 * night;   // by day it glows only while boosting
    L.distance = 22;
  } else {
    L.position.set(0.35, 2.9, -1.1);
    L.intensity = 6 * night;
    L.distance = 16;
  }
  S.wandLight.visible = night > 0.05 && P.state !== 'broom';
  // blob shadow
  const gy = S.groundY ?? W.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.5);
  S.blob.userData.place(P.pos.x, P.state === 'swim' ? W.seaLevel : gy, P.pos.z, P.pos.y - gy);
  S.blob.visible = S.blob.visible && P.state !== 'swim';
  S.blob.material.opacity *= 0.45 + 0.55 * veil; // the sun casts a real shadow; the blob matters under the Veil
}

/** Camera ray against terrain, physics bodies and actors -> G.player.aim. */
function updateAim() {
  const cam = G.camera;
  const A = P.aim;
  cam.getWorldPosition(_rayO);
  cam.getWorldDirection(_rayD);
  // start the ray level with the player so nothing between camera and heroine is picked
  _v1.copy(P.pos); _v1.y += 1.2;
  const t0 = Math.max(0, _v1.sub(_rayO).dot(_rayD) - 0.6);
  A.origin.copy(_rayO).addScaledVector(_rayD, t0);
  A.dir.copy(_rayD);
  const max = 160;
  let best = G.world.raycastGround(A.origin, A.dir, max, 0.6);
  let body = null, surface = best < max ? 'terrain' : '';
  const hit = G.physics?.raycast?.(A.origin, A.dir, max, { exclude: P.physChar });
  if (hit && hit.dist < best) { best = hit.dist; body = hit.body || null; surface = hit.surface || 'static'; }
  // actors (enemies): ray vs sphere around each capsule
  let target = null;
  const list = G.combat?.enemies;
  if (list && list.length) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.dead || !e.pos) continue;
      const hh = (e.height || 1.6) * 0.5, rr = Math.max(e.radius || 0.5, hh * 0.7) + 0.35; // a little aim assist
      _v2.set(e.pos.x - A.origin.x, e.pos.y + hh - A.origin.y, e.pos.z - A.origin.z);
      const tc = _v2.dot(A.dir);
      if (tc < 0 || tc - rr > best) continue;
      const d2 = _v2.lengthSq() - tc * tc;
      if (d2 > rr * rr) continue;
      const th = tc - Math.sqrt(rr * rr - d2);
      if (th < best) { best = Math.max(0, th); target = e; surface = 'actor'; body = null; }
    }
  }
  if (!target && body && body.owner && body.owner !== P) target = body.owner;
  A.dist = best;
  A.point.copy(A.origin).addScaledVector(A.dir, best);
  // lock-on aim assist: spells go to the locked target's centre (enemies and boss weak points alike)
  const lt = G.combat?.lockTarget;
  if (lt && !lt.dead && lt.pos) {
    A.point.set(lt.pos.x, lt.pos.y + (lt.height || 1.4) * 0.5, lt.pos.z);
    A.dist = A.point.distanceTo(A.origin);
    target = lt.isLockPoint ? null : lt; surface = 'actor'; body = null;
  }
  A.target = target;
  A.body = body;
  A.surface = surface;
  P.aiming = G.mode === 'play' && (G.input.held('cast') || G.input.held('attack'));
}
