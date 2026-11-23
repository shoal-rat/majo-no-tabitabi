// Shared character rig: the heroine, every NPC, duelist and humanoid shade is a createActor().
//
//   const a = createActor('char_akari', { castShadow: true });
//   scene.add(a.group);  a.play('run');  a.setSpeed(1.2);  a.play('cast_throw');   // upper-body overlay, legs keep running
//   a.lookAt(targetVec3);  a.setExpression('joy', 1);  a.attach(gohei, 'handR', { pos: [..], rot: [..] });
//   a.update(dt);  // every frame (the owner calls it)
//
// Logical states map to library clips through src/actors/clips.js. Clips are shared: for characters whose hips are not at
// 0.887 m the hips position track is cloned and rescaled once per asset id (cached).
// Layers: a FULL layer (locomotion / full-body one-shots, cross-faded) and an UPPER layer (spine-and-up overlay). While
// the upper layer has weight U, each full-layer clip is split into its full action at weight w·(1-U) and a legs-only
// twin at w·U, so upper bones see exactly the overlay and the legs exactly the locomotion.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { CLIPS, UPPER_BONE, CAST_BODY } from './clips.js';
import { OUTFITS } from '../data/outfits.js';
import { broomMotion, fitBroomPose } from './broom-pose.js';
import { heroineRotationTrack, fitLandingKnee } from './heroine-motion.js';
import { toon, glow, hookMaterial } from '../core/mats.js';
import { createSprings } from './spring.js';
import { createFlightDynamics } from './flight-dynamics.js';
import { createTravellerCloth } from './travellerCloth.js';
import { updateCelGlobals, CEL_U, SHADOW_PROXY_LAYER, SEE_LINES } from './celmat.js';
import { splitCelPart, restoreCelParts } from './celmerge.js';
import { clamp, damp } from '../core/util.js';

let FLASH_MAT = null; // shared hit-flash material (all rigs)

const LIB_HIPS = 0.887;
const LIB_IDS = ['anim_ual', 'anim_miko']; // the shared humanoid clip libraries
const warnedLib = new Set();
const HIPS_TRACK = 'J_Bip_C_Hips.position';
const DEFAULT_BONES = {
  head: 'J_Bip_C_Head', neck: 'J_Bip_C_Neck', chest: 'J_Bip_C_Chest', upperChest: 'J_Bip_C_UpperChest', spine: 'J_Bip_C_Spine',
  hips: 'J_Bip_C_Hips', handR: 'J_Bip_R_Hand', handL: 'J_Bip_L_Hand', footR: 'J_Bip_R_Foot', footL: 'J_Bip_L_Foot',
  thighR: 'J_Bip_R_UpperLeg', thighL: 'J_Bip_L_UpperLeg', kneeR: 'J_Bip_R_LowerLeg', kneeL: 'J_Bip_L_LowerLeg',
  armR: 'J_Bip_R_UpperArm', armL: 'J_Bip_L_UpperArm', foreR: 'J_Bip_R_LowerArm', foreL: 'J_Bip_L_LowerArm',
};

// ---- clip cache: assetId -> { full: Map, upper: Map, lower: Map } ------------------------------------------------
const libs = new Map();
function lib(assetId, model) {
  let L = libs.get(assetId);
  if (L) return L;
  const info = G.assets?.info(assetId) || {};
  const k = info.hipsHeight ? info.hipsHeight / LIB_HIPS : 1;
  let src = (G.assets?.clips(assetId)) || [];
  // both shared libraries on every humanoid, even if a manifest rewrite dropped one from clipsFrom (warned once)
  if (src.length && info.clipsFrom && G.assets) {
    const have = new Set(src.map((c) => c.name));
    for (const libId of LIB_IDS) {
      const extra = G.assets.clips(libId) || [];
      if (!extra.length || have.has(extra[0].name)) continue;
      if (!warnedLib.has(assetId)) { warnedLib.add(assetId); console.warn(`[rig] ${assetId}: clipsFrom lacks ${libId}, merged here`); }
      src = src.concat(extra.filter((c) => !have.has(c.name)));
    }
  }
  L = { k, full: new Map(), upper: new Map(), lower: new Map(), names: new Set() };
  // drop tracks for bones this character does not have (anim_miko keys the heroine's J_Sec_ / HairJoint chains): no
  // per-action PropertyBinding warnings, no dead bindings
  const nodes = new Set();
  model?.traverse((o) => { if (o.name) nodes.add(o.name); });
  const missing = (tr) => nodes.size && !nodes.has(tr.name.slice(0, tr.name.lastIndexOf('.')));
  const heroine = OUTFITS.some(outfit => outfit.asset === assetId);
  for (const c of src) {
    let clip = c;
    if (c.tracks.some(missing)) { clip = c.clone(); clip.tracks = clip.tracks.filter((tr) => !missing(tr)); }
    if (Math.abs(k - 1) > 0.002) {
      if (clip === c) clip = c.clone();
      for (const tr of clip.tracks) {
        if (tr.name !== HIPS_TRACK) continue;
        const v = tr.values.slice();
        for (let i = 0; i < v.length; i += 3) { v[i] *= k; v[i + 1] *= k; v[i + 2] *= k; }
        tr.values = v;
      }
    }
    if (heroine) {
      // Keep the shared library immutable for NPCs. Build corrected tracks once,
      // before the full / upper / lower animation layers split this same clip.
      const landing=fitLandingKnee(clip,model);
      const changed=clip.tracks.map(track=>track.name.endsWith('.quaternion')
        ? heroineRotationTrack(c.name,track.name.slice(0,-11),track.values) : null);
      if (landing || broomMotion(c.name) || changed.some(Boolean)) {
        if (clip === c) clip=c.clone();
        clip.tracks.forEach((track,i)=>{
          const correction=landing?.get(track.name);
          if(correction){track.times=correction.times;track.values=correction.values;}
          else if(changed[i])track.values=changed[i];
        });
        const riding=fitBroomPose(clip,model);
        if(riding)for(const track of clip.tracks){
          const curve=riding.get(track.name);
          if(curve){track.times=curve.times;track.values=curve.values;}
        }
      }
    }
    L.full.set(c.name, clip);
    L.names.add(c.name);
  }
  libs.set(assetId, L);
  return L;
}
// which: 'full' | 'upper' | 'lower' | 'bfull' / 'blower' (private copies for the locomotion blend, so its actions never
// share a mixer action with the same clip played as a plain state during a cross-fade)
function part(L, name, which) {
  if (which === 'full') return L.full.get(name) || null;
  const m = L[which] || (L[which] = new Map());
  let c = m.get(name);
  if (c) return c;
  const base = L.full.get(name);
  if (!base) return null;
  if (which === 'bfull') c = new THREE.AnimationClip(base.name + '__blend', base.duration, base.tracks);
  else {
    const up = which === 'upper';
    const tracks = base.tracks.filter((t) => UPPER_BONE.test(t.name.split('.')[0]) === up);
    c = new THREE.AnimationClip(base.name + (up ? '__upper' : which === 'blower' ? '__blower' : '__lower'), base.duration, tracks);
  }
  m.set(name, c);
  return c;
}
const GAIT_KEYS = ['idle', 'walk', 'run', 'sprint'];
const VOWELS = ['a', 'i', 'u', 'e', 'o'];
const PAUSE_CH = '\uff0c\u3002\uff01\uff1f\u3001\u2026\u2014\uff1b\uff1a,.!?;:~\uff5e \n'; // punctuation (escaped: not player text)

// ---- shared temporaries -----------------------------------------------------------------------------------------------
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion();
const _e1 = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** Rotate a bone by a WORLD-space rotation q (about its own pivot). */
const _rq1 = new THREE.Quaternion(), _rq2 = new THREE.Quaternion();
function rotateBoneWorld(bone, q) {
  bone.getWorldQuaternion(_rq1);
  bone.parent.getWorldQuaternion(_rq2).invert();
  bone.quaternion.copy(_rq2.multiply(q).multiply(_rq1));
  bone.updateMatrixWorld(true);
}

// draw-call pass LOD distances (m), docs/api/actors-look.md "Distance"
const CEL_FAR = 25, OUTLINE_LOD = 30, FACE_OUTLINE_LOD = 22, ANIM_LOD = 60;

/**
 * setTint for a merged character part (actors/celmerge.js): the same changes as for the separate materials, per slot.
 * Dark: the eyes become their own glowing draw (split out of the merged mesh), the rest deep violet with a spirit rim.
 */
function tintMerged(mesh, src, o) {
  const c = src.clone();
  c.userData.shared = false;
  const U = c.celU, slots = c.cel.slots;
  if (o.dark) {
    splitCelPart(mesh, /EyeIris|EyeHighlight/, glow(o.emissive ?? 0xff3b6b, 3.2));
    splitCelPart(mesh, /EyeWhite/, glow(0x0b0718, 1));
    const dk = new THREE.Color(o.color ?? 0x110a22);
    slots.forEach((s, i) => { U.uSlC.value[i].x = dk.r; U.uSlC.value[i].y = dk.g; U.uSlC.value[i].z = dk.b; U.uSlE.value[i].set(0, 0, 0, -1); });
    c.setSpirit(o.rim ?? 0x8a3cff, (s) => (/Hair/.test(s.name) ? 0.9 : 0.7));
  } else {
    if (o.color != null) { const k = new THREE.Color(o.color); for (const v of U.uSlC.value) { v.x *= k.r; v.y *= k.g; v.z *= k.b; } }
    if (o.emissive != null) { const e = new THREE.Color(o.emissive).multiplyScalar(o.emissiveIntensity ?? 0.6); for (const v of U.uSlE.value) { v.x = e.r; v.y = e.g; v.z = e.b; } }
  }
  hookMaterial(c);
  return c;
}

/** Primitive stand-in when the model asset is missing (never crash a subset build). */
function placeholderModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.8, 4, 10), toon(0xfbf6ec));
  body.position.y = 0.75;
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.55, 12), toon(0xd8362c));
  skirt.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), toon(0x2b2238));
  head.position.y = 1.38;
  for (const m of [body, skirt, head]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  const mk = (name, x, y, z, parent = g) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  const hips = mk('J_Bip_C_Hips', 0, 0.887, 0);
  mk('J_Bip_C_Spine', 0, 0.1, 0, hips); mk('J_Bip_C_Chest', 0, 0.3, 0, hips); mk('J_Bip_C_Head', 0, 0.5, 0, hips);
  mk('J_Bip_R_Hand', -0.25, 0.0, 0.05, hips); mk('J_Bip_L_Hand', 0.25, 0.0, 0.05, hips);
  g.userData.placeholder = true;
  return g;
}

/**
 * Create a character.
 * @param {string} assetId  e.g. 'char_akari'
 * @param {object} opts { castShadow=true, receiveShadow=true, state='idle', footGround?(x,z)->y, lookLimits?{yaw,pitch} }
 */
export function createActor(assetId, opts = {}) {
  const info = G.assets?.info(assetId) || {};
  const boneNames = { ...DEFAULT_BONES, ...(info.bones || {}) };
  let model = G.assets?.ready?.(assetId) ? G.assets.model(assetId) : null;
  if (!model) model = placeholderModel();
  const group = new THREE.Group();
  group.name = 'actor:' + assetId;
  group.add(model);
  const castShadow = opts.castShadow !== false, receiveShadow = opts.receiveShadow !== false;
  const morphMeshes = [];
  const ridingHems = [];
  let hemFold = 0;
  const skinned = [];
  const outlines = [];
  const seeLines = [];   // heroine-look: brows / lash line through the own fringe (celmat buildSeeLines), near only
  const shadowPx = { mesh: null, real: [], on: null };   // cloth.md: merged shadow caster (crowd cost)
  model.traverse((o) => {
    if (!o.isMesh) return;
    // the asset decides which parts may cast (face details / outlines never do); the owner can only switch it all off
    o.castShadow = castShadow && o.castShadow !== false && !o.userData.outline; o.receiveShadow = receiveShadow && !o.userData.outline;
    if (o.userData.outline) outlines.push(o);
    if (o.userData.seeLines) seeLines.push(o);
    if (o.userData.shadowProxy) { shadowPx.mesh = o; o.receiveShadow = false; } else if (o.userData.proxied && o.castShadow) shadowPx.real.push(o);
    if (o.isSkinnedMesh) { skinned.push(o); o.frustumCulled = false; }
    if (o.morphTargetDictionary && o.morphTargetInfluences) morphMeshes.push(o);
    const hemTarget = o.morphTargetDictionary?.sideSaddleFold;
    if (hemTarget !== undefined) ridingHems.push([o,hemTarget]);
  });

  const bones = {};
  for (const k in boneNames) bones[k] = model.getObjectByName(boneNames[k]) || null;
  const L = model.userData.placeholder ? { k: 1, full: new Map(), upper: new Map(), lower: new Map(), names: new Set() } : lib(assetId, model);
  const mixer = new THREE.AnimationMixer(model);
  const travellerCloth = createTravellerCloth(model, bones);
  const ride = OUTFITS.some(o => o.asset === assetId) ? createFlightDynamics(model,bones,twoBoneTo) : null;
  // secondary motion + life (hair / skirt springs, eye darts, breathing)
  const springs = model.userData.placeholder || G.params?.celoff ? null : createSprings(model, { scale: (info.hipsHeight || LIB_HIPS) / LIB_HIPS, chains: info.secondaryChains, defaults: info.springDefaults, legacyMotion: !!G.params?.springv1 });
  const eyes = [model.getObjectByName('J_Adj_L_FaceEye'), model.getObjectByName('J_Adj_R_FaceEye')].filter(Boolean);
  const eyeRest = eyes.map((e) => e.quaternion.clone());

  // ---- layers ----
  const full = [];   // { state, def, action, lower, w, target, rate, once, end, onDone, next, done }
  const upper = [];
  let lastLoop = 'idle';

  function makeAction(clip, once, speed, from) {
    const action = mixer.clipAction(clip);
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.setEffectiveWeight(0);
    action.timeScale = speed;
    action.time = from || 0;
    action.paused = false;
    action.play();
    return action;
  }
  function makeEntry(state, def, layer, o) {
    const once = o.once ?? !(o.loop ?? def.loop);
    if (def.blend) {
      // locomotion blend: one part per gait, phase-locked (see _loco)
      const parts = [];
      for (const g of GAIT_KEYS) {
        const gs = actor.gaits[g]; const gd = gs && CLIPS[gs];
        const clip = gd && gd.clip && part(L, gd.clip, 'bfull');
        if (!clip) continue;
        parts.push({ gait: g, def: gd, blend: true, action: makeAction(clip, false, g === 'idle' ? 1 : 0, 0), lower: null, wk: g === 'idle' ? 1 : 0,
          v: (gd.v || 0) * L.k, dur: clip.duration });
      }
      if (!parts.length) return null;
      return {
        state, def, layer, action: parts[0].action, parts, lower: null, w: 0, target: 1, fade: Math.max(0.001, o.fade ?? def.fade ?? 0.2),
        once: false, end: parts[0].dur, baseSpeed: 1, onDone: null, next: null, done: false, phase: 0,
      };
    }
    if (def.multi) {
      const parts = [];
      for (const st of def.multi) {
        const gd = CLIPS[st]; const clip = gd && gd.clip && part(L, gd.clip, 'bfull');
        if (clip) parts.push({ gait: st, def: gd, blend: true, action: makeAction(clip, false, 1, 0), lower: null, wk: parts.length ? 0 : 1, dur: clip.duration });
      }
      if (!parts.length) return null;
      return {
        state, def, layer, action: parts[0].action, parts, multi: true, lower: null, w: 0, target: 1, fade: Math.max(0.001, o.fade ?? def.fade ?? 0.2),
        once: false, end: parts[0].dur, baseSpeed: 1, onDone: null, next: null, done: false,
      };
    }
    const clip = part(L, def.clip, layer === 'upper' ? 'upper' : 'full');
    if (!clip) return null;
    const action = makeAction(clip, once, o.speed ?? def.speed ?? 1, o.from ?? def.from);
    return {
      state, def, layer, action, lower: null, w: 0, target: 1, fade: Math.max(0.001, o.fade ?? def.fade ?? 0.2),
      once, end: Math.min(def.to ?? clip.duration, clip.duration), baseSpeed: action.timeScale,
      onDone: o.onDone || null, next: o.next || def.next || null, done: false,
    };
  }
  function fadeOutAll(list, fade, except) {
    for (const e of list) if (e !== except) { e.target = 0; e.fade = Math.max(0.001, fade); }
  }

  const actor = {
    assetId, group, model, mixer, bones, info,
    get flightMotion() { return ride?.metrics || null; },
    /** Current state of the full-body layer, and of the upper overlay ('' if none). */
    current: '', upperState: '',
    /** True while a full-body one-shot is playing (dodge, land, death…). */
    get busy() { const e = full[full.length - 1]; return !!(e && e.once && !e.done && e.target > 0); },
    /** 0..1 progress of the newest full-layer clip. */
    get progress() { const e = full[full.length - 1]; return e ? clamp((e.action.time - (e.def.from || 0)) / Math.max(1e-3, e.end - (e.def.from || 0))) : 0; },
    /** Seconds per cycle of the current full-layer clip (at its current speed). */
    has(state) { const d = CLIPS[state]; return !!(d && (d.blend || d.multi || L.names.has(d.clip))); },
    /** Locomotion gaits of the 'move' blend (state names). Change before the first move() (e.g. shades, formal walkers). */
    gaits: { idle: 'idle', walk: 'walk', run: 'run', sprint: 'sprint', ...(opts.gaits || {}) },
    /**
     * ★ Locomotion: play the phase-locked idle/walk/run/sprint blend at ground speed v (m/s). Feet stay planted because
     * the cycle rate is v / (blended stride per cycle), measured per clip. o: { back (walk backwards), fade, force }.
     * A full-body one-shot that is still playing is not interrupted unless o.force.
     */
    move(v, o = {}) {
      this._moveV = Math.max(0, v || 0); this._moveBack = !!o.back;
      if (this.current !== 'move' && (o.force || !this.busy)) this.play('move', { fade: o.fade });
      return this;
    },
    _moveV: 0, _moveBack: false,
    /** Hand IK: reach.R / reach.L = { w, target: Vector3 } or { w, fn(handWorldPos, out) -> Vector3|null } (e.g. closest point on a handle).
     *  Foot reach: reach.FR / reach.FL = { w, target } (climbing). */
    reach: { R: null, L: null, FR: null, FL: null },
    /** Weights of the secondary parts of a `multi` state (e.g. { glide_l: 0.4 }). */
    blendW: {},
    /** Lower-body yaw (rad) relative to the facing: legs run toward the movement while the chest keeps facing (strafe). */
    legYaw: 0, _legYaw: 0,
    /** 0..1 exertion: faster, deeper breathing (after sprinting / casting). */
    exert: 0,
    /** Idle fidgets (Idle_Fidget_A / _B after 8–15 s standing still). */
    fidgets: !!opts.fidgets, _idleT: 0, _fidgetAt: 8 + Math.random() * 7,
    /** What the right hand's wand should do now: 'hold' | 'hide' | undefined (free), from the clips playing. */
    goheiMode() {
      let U = 0; for (const e of upper) U += e.w;
      const ut = upper[upper.length - 1], ft = full[full.length - 1];
      if (U > 0.35 && ut && ut.target > 0) return ut.def.gohei;
      return ft ? ft.def.gohei : undefined;
    },
    /** Seconds into the newest entry of a layer playing `state` (null if it is not playing). */
    timeOf(state) {
      for (const list of [upper, full]) { const e = list[list.length - 1]; if (e && e.state === state) return e.action.time; }
      return null;
    },
    /** Charm throw: round-robin through the three variants (retrigger every ~0.33 s). */
    _charm: 0,
    playCharm(o = {}) { const s = ['charm_a', 'charm_b', 'charm_c'][this._charm++ % 3]; return this.play(s, { layer: 'upper', restart: true, ...o }); },
    /**
     * Play a logical state. Same looping state again = no-op (unless opts.restart). opts: { fade, loop, speed, once, onDone,
     * next (state to go to when a one-shot ends), layer:'full'|'upper' (default from clips.js), restart, from (start time, s) }
     * Returns true if the state exists.
     */
    play(state, o = {}) {
      if (state == null) return false;
      const def = CLIPS[state];
      if (!def || !(def.blend || def.multi || L.names.has(def.clip))) return false;
      const layer = o.layer || def.layer || 'full';
      const list = layer === 'upper' ? upper : full;
      const top = list[list.length - 1];
      const once = o.once ?? !(o.loop ?? def.loop);
      if (top && top.state === state && top.target > 0 && !o.restart && !(once && top.done)) {
        if (o.speed != null) { top.baseSpeed = o.speed; top.action.timeScale = o.speed; }
        if (o.onDone) top.onDone = o.onDone;
        return true;
      }
      // reuse an entry still fading out
      let e = null;
      const i = list.findIndex((x) => x.state === state);
      if (i >= 0) {
        e = list[i]; list.splice(i, 1);
        e.target = 1; e.fade = Math.max(0.001, o.fade ?? def.fade ?? 0.2);
        if (!e.parts) {
          e.once = once; e.done = false; e.onDone = o.onDone || null; e.next = o.next || def.next || null;
          e.action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
          e.baseSpeed = e.action.timeScale = (o.speed ?? def.speed ?? 1);
          e.action.paused = false; e.action.enabled = true;
          if (once || o.restart) e.action.time = o.from ?? def.from ?? 0;
          e.action.play();
        }
      } else {
        e = makeEntry(state, def, layer, o);
        if (!e) return false;
      }
      fadeOutAll(list, e.fade, e);
      list.push(e);
      if (layer === 'upper') this.upperState = state;
      else { this.current = state; if (!once) lastLoop = state; }
      if (e.lower) { e.lower.time = e.action.time; e.lower.timeScale = e.action.timeScale; }
      return true;
    },
    /** Fade out a layer ('upper' default). With state given, only if that state is the one playing. */
    stop(layer = 'upper', fade = 0.2, state) {
      const list = layer === 'upper' ? upper : full;
      const top = list[list.length - 1];
      if (state && (!top || top.state !== state)) return;
      fadeOutAll(list, fade, null);
      if (layer === 'upper') this.upperState = '';
    },
    /** Playback-rate multiplier of the current full-layer clip. */
    setSpeed(k) { const e = full[full.length - 1]; if (e && !e.parts) e.action.timeScale = e.baseSpeed * k; },
    /** Match a locomotion clip to a ground speed in m/s (uses clips.js `v`). */
    setGroundSpeed(v) {
      const e = full[full.length - 1];
      if (e && e.parts) this._moveV = Math.max(0, v);
      else if (e && e.def.v) e.action.timeScale = clamp(v / (e.def.v * L.k), 0.35, 2.4) * (e.def.speed || 1);
    },
    /** Freeze / unfreeze all animation (frozen status, hit-stop of one actor). */
    paused: false,
    timeScale: 1,

    // ---- face ----
    expressions: {},
    setExpression(name, weight = 1, speed = 8) {
      const x = this.expressions[name] || (this.expressions[name] = { cur: 0, target: 0, speed });
      x.target = clamp(weight, 0, 1); x.speed = speed;
    },
    clearExpressions() { for (const k in this.expressions) this.expressions[k].target = 0; },
    blinkEnabled: true,
    /** Blink-rate multiplier (mood: > 1 tense / hurt, < 1 calm). */
    blinkRate: 1,
    _blinkT: 1 + Math.random() * 3, _blinkPh: -1,

    // ---- head look ----
    _look: new THREE.Vector3(), _lookOn: false, _lookW: 0, _lookYaw: 0, _lookPitch: 0,
    lookLimits: opts.lookLimits || { yaw: 1.15, pitch: 0.55 },
    /** Turn head + neck toward a world point (clamped); null to release. Keeps a copy of the vector. */
    lookAt(p) { if (p) { this._look.copy(p); this._lookOn = true; } else this._lookOn = false; },

    // ---- props ----
    /** Parent obj to a bone ('handR', 'head', ...; unknown key -> model root). opts { pos:[x,y,z], rot:[x,y,z], scale } */
    attach(obj, boneKey, o = {}) {
      const b = bones[boneKey] || model;
      b.add(obj);
      if (o.pos) obj.position.fromArray(o.pos);
      if (o.rot) obj.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
      if (o.scale != null) typeof o.scale === 'number' ? obj.scale.setScalar(o.scale) : obj.scale.fromArray(o.scale);
      obj.traverse((m) => { if (m.isMesh && !m.userData.outline) { m.castShadow = castShadow; m.receiveShadow = receiveShadow; } });
      if (!this._attached.some((a) => a[0] === obj)) this._attached.push([obj, boneKey]);   // wardrobe: adopt() moves them
      return obj;
    },
    detach(obj) { obj.parent?.remove(obj); this._attached = this._attached.filter((a) => a[0] !== obj); },
    _attached: [],

    // ---- wardrobe (docs/api/heroine.md "Wardrobe") ----------------------------------------------------------------------
    /** Take over another rig's live state, so a model swap (same skeleton, other outfit) shows no jump: both animation
     *  layers with their clips, weights and times, the locomotion phase, expressions, blink, look-at, hand IK, speaking,
     *  every plain number / flag (exertion, leg yaw, pause …), the props added with attach() (re-parented to the same bone,
     *  local transform kept), an active tint (re-applied) and a running hit flash (its remaining time). Call before this rig's first update; then update(0), resetSprings(). `o` is left without props. */
    adopt(o) {
      if (!o || !o._layers) return this;
      for (const k of Object.keys(o)) {
        if (k === 'assetId' || k === 'fidgets' || k === 'animLod' || k === '_celFar' || k === '_flashT' || k === 'springs') continue;
        const d = Object.getOwnPropertyDescriptor(o, k), dn = Object.getOwnPropertyDescriptor(this, k);
        if (!d || !('value' in d) || !dn || !('value' in dn)) continue;
        if (typeof d.value === 'number' || typeof d.value === 'boolean' || typeof d.value === 'string') this[k] = d.value;
      }
      Object.assign(this.gaits, o.gaits); Object.assign(this.blendW, o.blendW);
      this.reach.R = o.reach.R; this.reach.L = o.reach.L; this.lookLimits = o.lookLimits; this._say = o._say;
      this._look.copy(o._look); this.footLock = o.footLock;
      this.expressions = {}; for (const k in o.expressions) this.expressions[k] = { ...o.expressions[k] };
      for (const [layer, src, dst] of [['full', o._layers.full, full], ['upper', o._layers.upper, upper]]) {
        for (const e of dst) { e.action.stop(); if (e.parts) for (const p of e.parts) p.action.stop(); }
        dst.length = 0;
        for (const s of src) {
          const n = makeEntry(s.state, s.def, layer, { fade: s.fade, once: s.once, onDone: s.onDone, next: s.next });
          if (!n) continue;
          for (const k of ['w', 'target', 'fade', 'once', 'end', 'baseSpeed', 'onDone', 'next', 'done', 'phase', 'cut']) if (k in s) n[k] = s[k];
          const cp = (a, b) => { if (!a || !b) return; a.time = b.time; a.timeScale = b.timeScale; a.paused = b.paused; a.setEffectiveWeight(b.getEffectiveWeight()); };
          if (n.parts && s.parts) for (let i = 0; i < n.parts.length; i++) { const q = s.parts.find((x) => x.gait === n.parts[i].gait); if (q) { n.parts[i].wk = q.wk; cp(n.parts[i].action, q.action); } }
          else cp(n.action, s.action);
          dst.push(n);
        }
      }
      lastLoop = o._layers.lastLoop();
      for (const [obj, key] of o._attached) {
        if (!obj.parent) continue;
        (bones[key] || model).add(obj);                       // Object3D.add keeps the local position / rotation / scale
        this._attached.push([obj, key]);
      }
      o._attached = [];
      // the look of the moment: a tint (shade version, a duel's tint …) is re-applied to this model, a running hit flash
      // goes on for the rest of its time (the old rig's tinted clones are freed with it)
      if (o._tint) this.setTint(o._tint);
      if (o._flashT > 0) this.flash(o._flashT);
      return this;
    },
    /** wardrobe: the layer lists, for adopt() on the rig that replaces this one */
    _layers: { full, upper, lastLoop: () => lastLoop },

    // ---- tint (shade versions) ----
    _orig: null,
    _tint: null,
    /** { color, emissive, dark } → near-black body with glowing eyes when dark; null restores the original look. */
    setTint(o) {
      if (this._flashT > 0) this._endFlash();
      this._tint = o ? { ...o } : null;          // wardrobe: adopt() re-applies it to the next model
      // heroine-look: the see-through face lines keep their own material (a toon clone would drop the row / offset shader);
      // a dark shade version hides them
      if (!this._orig) { this._orig = new Map(); model.traverse((m) => { if (m.isMesh && !m.userData.outline && !m.userData.seeLines) this._orig.set(m, m.material); }); }
      this._seeOff = !!o?.dark;
      for (const [m, mat] of this._orig) {
        if (m.celSrcGeo || m.celSplit) restoreCelParts(m);
        if (!o) { m.material = mat; continue; }
        const mats = Array.isArray(mat) ? mat : [mat];
        const out = mats.map((src) => {
          if (src.cel?.multi) return tintMerged(m, src, o);
          const name = src.name || '';
          const eye = /EyeIris|EyeHighlight/.test(name);
          if (o.dark && eye) return glow(o.emissive ?? 0xff3b6b, 3.2);
          if (o.dark && /EyeWhite/.test(name)) return glow(0x0b0718, 1);
          const c = src.clone();
          c.userData.shared = false;
          if (o.dark) {
            // living darkness: deep violet body that still takes the cel shading, a breathing glow on the silhouette
            c.map = null; c.color = new THREE.Color(o.color ?? 0x110a22);
            if (c.emissive) { c.emissive.set(0x000000); c.emissiveMap = null; }
            if (c.isCelMaterial) c.setSpirit(o.rim ?? 0x8a3cff, /Hair/.test(name) ? 0.9 : 0.7);
          }
          else if (o.color != null && c.color) c.color.multiply(new THREE.Color(o.color));
          if (o.emissive != null && !o.dark && c.emissive) { c.emissive.set(o.emissive); c.emissiveIntensity = o.emissiveIntensity ?? 0.6; }
          hookMaterial(c);
          return c;
        });
        m.material = Array.isArray(mat) ? out : out[0];
      }
    },

    // ---- hit flash: one shared material for every rig, nothing is cloned ----
    _flashT: 0,
    _flashSaved: null,
    /** Paint the whole body flat white-pink for `sec` seconds (restored in update). Cheap: no material clones. */
    flash(sec = 0.08) {
      if (!FLASH_MAT) FLASH_MAT = glow(0xfff2f6, 1.4);
      if (!this._flashSaved) {
        this._flashSaved = [];
        model.traverse((m) => { if (m.isMesh && m.visible && !m.userData.outline) { this._flashSaved.push(m, m.material); m.material = FLASH_MAT; } });
      }
      this._flashT = Math.max(this._flashT, sec);
    },
    _endFlash() {
      const sv = this._flashSaved;
      if (sv) for (let i = 0; i < sv.length; i += 2) sv[i].material = sv[i + 1];
      this._flashSaved = null; this._flashT = 0;
    },

    // ---- feet on the ground ----
    /** (x,z)->ground y used for the pelvis drop + leg IK on uneven ground; null = off. */
    footGround: opts.footGround || null,
    /** 0..1: how much foot planting applies now (owner sets ~1 when standing on the ground, 0 in the air). */
    plant: 0,
    /** 0..1: stance pinning of the feet in locomotion (owner: 1 on solid ground, 0 in the air / sliding); null = use plant. */
    footLock: null,
    _pelvis: 0,

    update(dt) {
      // draw-call pass (docs/api/actors-look.md "Distance"): actors created with animLod (folk, cast NPCs) beyond 60 m pose
      // every 2nd frame (every 4th beyond 100 m) with the summed step; the camera distance is last frame's
      if (this.animLod && this._camD > ANIM_LOD && G.player?.rig !== this) {
        this._lodAcc += dt;
        if ((this._lodN = (this._lodN + 1) % (this._camD > 100 ? 4 : 2)) !== 0) return;
        dt = this._lodAcc; this._lodAcc = 0;
      } else if (this._lodAcc) { dt += this._lodAcc; this._lodAcc = 0; }
      if (this._flashT > 0 && (this._flashT -= Math.max(dt, 1 / 120)) <= 0) this._endFlash();
      const sdt = this.paused ? 0 : dt * this.timeScale;
      // fade weights
      stepLayer(full, sdt, dt);
      stepLayer(upper, sdt, dt);
      let U = 0;
      for (const e of upper) U += e.w;
      U = Math.min(1, U);
      for (const e of full) {
        if (e.multi) {
          let rest = 1; const m = e.parts[0].action;
          for (let i = 1; i < e.parts.length; i++) {
            const p = e.parts[i]; p.wk = damp(p.wk, clamp(this.blendW[p.gait] || 0), 10, dt); rest -= p.wk;
            p.action.time = (m.time / e.parts[0].dur) * p.dur; p.action.timeScale = 0;
          }
          e.parts[0].wk = Math.max(0, rest);
          for (const p of e.parts) weighPart(p, e.w * p.wk, U);
        } else if (e.parts) { this._loco(e, sdt, dt); for (const p of e.parts) weighPart(p, e.w * p.wk, U); }
        else weighPart(e, e.w, U);
      }
      for (const e of upper) e.action.setEffectiveWeight(e.w);
      mixer.update(sdt);
      // three's PropertyMixer only writes a bone when its blended value differs from the previous frame's. Everything after
      // this line (IK, look-at, breathing, leg yaw) edits the bones in place, so an unchanged frame (dt = 0 in hitstop / time
      // scale 0, a held end pose) would keep last frame's edited pose and stack the edits again — that folded a leg up after a
      // sprint stop. Poison the reference accumulator so every binding is written fresh each frame (~150 writes, a few µs).
      forceRewrite(mixer);
      if (e0Moved(this)) this._legs(dt);
      this._castBody(dt);
      // one-shot ends
      checkDone(full, true);
      checkDone(upper, false);
      if (this.fidgets) this._fidget(dt, U);
      // face
      this._face(dt);
      // breathing (additive on the animated chest), talking
      if (!G.params?.celoff) this._life(dt);
      // look
      if (bones.head) this._lookUpdate(dt);
      if (ride && G.player?.rig === this) ride.update(sdt,G.player,this.travellerSeat,G.elements?.visualWindAt || G.elements?.windAt);
      // feet
      if (this.footGround && bones.footL && bones.thighL) this._feet(dt);
      else if (this._pelvis !== 0) { this._pelvis = damp(this._pelvis, 0, 10, dt); model.position.y = this._pelvis; }
      // hand IK (a hand that must stay on something: the broom handle, a drum, a pole)
      for (const side of ['R', 'L']) {
        const r = this.reach[side];
        if (!r || !(r.w > 0.01) || !bones['arm' + side] || !bones['fore' + side] || !bones['hand' + side]) continue;
        model.updateMatrixWorld(true);
        const hand = bones['hand' + side];
        const T = r.fn ? r.fn(hand.getWorldPosition(_vR), _vR2) : r.target;
        if (!T) continue;
        hand.getWorldPosition(_vR); _vR.lerp(T, clamp(r.w));
        const hq = hand.getWorldQuaternion(_q4).clone();
        twoBoneTo(bones['arm' + side], bones['fore' + side], hand, _vR);
        if (r.keepRot) rotateBoneWorld(hand, _q3.copy(hq).multiply(hand.getWorldQuaternion(_q2).invert()));
      }
      // foot reach (climbing: feet on a wall face): reach.FR / reach.FL = { w, target } -> two-bone leg toward the target,
      // knee toward the body's forward
      for (const side of ['R', 'L']) {
        const r = this.reach['F' + side];
        if (!r || !(r.w > 0.01) || !r.target || !bones['thigh' + side] || !bones['knee' + side] || !bones['foot' + side]) continue;
        model.updateMatrixWorld(true);
        const foot = bones['foot' + side];
        foot.getWorldPosition(_vR); _vR.lerp(r.target, clamp(r.w));
        _vR2.set(0, 0, 1).applyQuaternion(model.getWorldQuaternion(_q4));
        legTwoBone(bones['thigh' + side], bones['knee' + side], foot, _vR, _vR2);
      }
      travellerCloth?.reset();
      if (!G.params?.celoff) { this._eyes(dt); this._secondary(dt); this._contact(); }
      travellerCloth?.update(dt, this.travellerSeat);
      if (ridingHems.length) {
        const target = this.travellerSeat ? 1 : 0;
        hemFold = target + (hemFold - target) * Math.exp(-18 * dt);
        for (const [mesh, index] of ridingHems) mesh.morphTargetInfluences[index] = hemFold;
      }
    },

    // ---- life: breathing, eye darts, springs, outline LOD, contact shadow ----
    _breathT: Math.random() * 10,
    _eyeT: 0.5, _eyeY: 0, _eyeP: 0, _eyeTY: 0, _eyeTP: 0,
    /** Secondary motion on/off (hair / skirt springs). */
    springs: !!springs,
    /** Talking: mouth flaps through vowels and a light smile blends in (NPCs talking to the heroine do it on their own). */
    speaking: false,
    _talkT: 0,
    _camD: 0,
    /** Animation LOD (opts.animLod): beyond ANIM_LOD m the pose is updated every 2nd / 4th frame. */
    animLod: !!opts.animLod, _lodAcc: 0, _lodN: 0,
    _celFar: false,
    // ---- locomotion blend: gait weights from speed, one shared phase, cycle rate from the measured stride ----
    _loco(e, sdt, dt) {
      const v = this._moveV, P = e.parts;
      if (!e.anch) {
        let vw = 0, vr = 0, vs = 0;
        for (const p of P) { if (p.gait === 'walk') vw = p.v; else if (p.gait === 'run') vr = p.v; else if (p.gait === 'sprint') vs = p.v; }
        const A = [];
        if (P.some((p) => p.gait === 'idle')) A.push([0, 'idle']);
        if (vw) A.push([0.55 * vw, 'walk'], [1.35 * vw, 'walk']);
        if (vr) A.push([Math.max(0.75 * vr, 1.4 * vw), 'run'], [1.05 * vr, 'run']);
        if (vs) A.push([Math.max(vs, 1.1 * vr), 'sprint']);
        if (!A.length) A.push([0, P[0].gait]);
        e.anch = A;
      }
      const A = e.anch;
      let ga = A[A.length - 1][1], gb = ga, f = 0;
      if (v <= A[0][0]) { ga = gb = A[0][1]; }
      else for (let i = 0; i < A.length - 1; i++) {
        if (v <= A[i + 1][0]) { ga = A[i][1]; gb = A[i + 1][1]; f = (v - A[i][0]) / Math.max(1e-4, A[i + 1][0] - A[i][0]); break; }
      }
      let sum = 0;
      for (const p of P) {
        const tw = (p.gait === ga ? 1 - f : 0) + (p.gait === gb ? f : 0);
        p.wk = dt > 0 ? damp(p.wk, tw, 9, dt) : tw; sum += p.wk;
      }
      let mw = 0, D = 0, walkD = 0;
      for (const p of P) {
        p.wk /= Math.max(1e-4, sum);
        if (p.gait !== 'idle') { mw += p.wk; D += p.wk * p.v * p.dur; if (p.gait === 'walk') walkD = p.v * p.dur; }
      }
      D = mw > 1e-3 ? D / mw : (walkD || 1);
      const rate = D > 1e-3 ? v / D : 0;
      e.phase = (((e.phase + rate * sdt * (this._moveBack ? -1 : 1)) % 1) + 1) % 1;
      for (const p of P) {
        if (p.gait === 'idle') { p.action.timeScale = 1; continue; }
        p.action.timeScale = 0;
        p.action.time = ((e.phase + (p.def.sync || 0)) % 1) * p.dur;
      }
    },
    /** Live gait weights of the blend (debug / tests): { idle, walk, run, sprint, phase }. */
    get gaitWeights() {
      const e = full.find((x) => x.parts); if (!e) return null;
      const o = { phase: +e.phase.toFixed(3) }; for (const p of e.parts) o[p.gait] = +p.wk.toFixed(2); return o;
    },
    _legs(dt) {
      this._legYaw = damp(this._legYaw, this.legYaw, 8, dt);
      const a = this._legYaw;
      if (Math.abs(a) < 1e-3 || !bones.hips) return;
      model.updateMatrixWorld(true);
      group.getWorldQuaternion(_q1);
      _v1.set(0, 1, 0).applyQuaternion(_q1);
      _q2.setFromAxisAngle(_v1, a); rotateBoneWorld(bones.hips, _q2);
      if (bones.spine) { _q2.setFromAxisAngle(_v1, -a * 0.55); rotateBoneWorld(bones.spine, _q2); }
      const ch = bones.chest || bones.upperChest;
      if (ch) { _q2.setFromAxisAngle(_v1, -a * 0.45); rotateBoneWorld(ch, _q2); }
    },
    // ---- full-body cast overlay (CAST_BODY in clips.js): wind-up, snap through the release, follow-through, recoil ----
    _cb: null, _cbW: 0, _castDrop: 0,
    _castBody(dt) {
      const e = upper[upper.length - 1];
      const prm = e && e.target > 0 && e.def.release != null && !G.params?.nocastbody ? CAST_BODY[e.def.clip] : null;   // ?nocastbody=1: A/B
      if (prm && (!this._cb || this._cb.e !== e || this._cb.t0 > e.action.time + 1e-3)) this._cb = { e, prm, t0: e.action.time, q: (e.def.from || 0) > 0 };
      const c = this._cb;
      if (!c || !bones.spine) { this._castDrop = 0; return; }
      const E = c.e, rel = E.def.release, sp = Math.max(0.3, E.action.timeScale || E.baseSpeed || 1);
      // real seconds from the release (− before); once the clip is done or fading, the follow-through runs on its own clock
      const live = E === e && E.target > 0 && !E.done;
      const x = c.x = live ? (E.action.time - rel) / sp : (c.x ?? 0) + (this.paused ? 0 : dt * this.timeScale);
      const ant = Math.max(0.08, (rel - c.t0) / sp);             // wind-up window actually played
      const k = c.q ? 0.75 : 1, P = c.prm;
      let f, lean, drop;
      if (x < 0) { const u = clamp(1 + x / ant); const s = u * u * (3 - 2 * u); f = -0.55 * s; lean = -(P.rear || 0.05) * s; drop = 0.5 * s; }
      else if (x < 0.09) { const u = x / 0.09; f = -0.55 + 1.55 * u; lean = P.lean * u; drop = 0.5 + 0.5 * u; }
      else { const d = Math.exp(-(x - 0.09) / (c.q ? 0.26 : 0.36)); f = d; lean = P.lean * d - (c.q ? 0 : P.recoil) * Math.sin(Math.min(1, (x - 0.09) / 0.6) * Math.PI) * (1 - d); drop = d; }
      // the overlay lives with the clip's weight; it ends with it
      // weight: with the clip while it fades in; afterwards it stays until it has settled, unless another upper clip takes over
      let w = live ? clamp(E.w / 0.6) : 1;
      if (!live && e && e !== E && e.target > 0) { c.cut = Math.min(c.cut ?? 1, clamp(1 - e.w * 1.6)); w = c.cut; }
      if (w < 0.01 || x > 1.6 || (!live && x < 0)) { this._cb = null; this._castDrop = damp(this._castDrop, 0, 10, dt); return; }
      model.updateMatrixWorld(true);
      group.getWorldQuaternion(_q1);
      const up = _v1.set(0, 1, 0).applyQuaternion(_q1), right = _v2.set(-1, 0, 0).applyQuaternion(_q1), fwd = _v3.set(0, 0, 1).applyQuaternion(_q1);
      const tw = P.tw * f * k * w, ln = lean * k * w, rl = P.roll * f * k * w;
      // hips lead a little, the spine and chest carry the twist; lean + side bend in the spine
      if (bones.hips) { _q2.setFromAxisAngle(up, tw * 0.22); rotateBoneWorld(bones.hips, _q2); }
      _q2.setFromAxisAngle(up, tw * 0.38); _q3.setFromAxisAngle(right, -ln * 0.55); _q2.multiply(_q3); _q3.setFromAxisAngle(fwd, rl); _q2.multiply(_q3);
      rotateBoneWorld(bones.spine, _q2);
      const ch = bones.chest || bones.upperChest;
      if (ch) { _q2.setFromAxisAngle(up, tw * 0.4); _q3.setFromAxisAngle(right, -ln * 0.45); _q2.multiply(_q3); rotateBoneWorld(ch, _q2); }
      // the free arm swings out against the throw (balance), most at the snap
      if (bones.armL && P.arm) { _q2.setFromAxisAngle(fwd, P.arm * Math.abs(f) * k * w); rotateBoneWorld(bones.armL, _q2); }
      this._castDrop = P.drop * drop * k * w;
    },
    _fidget(dt, U) {
      const still = (this.current === 'idle' || (this.current === 'move' && this._moveV < 0.05)) && U < 0.01 && !this.busy && !this.speaking && !this.paused;
      if (!still) { this._idleT = 0; return; }
      this._idleT += dt;
      if (this._idleT < this._fidgetAt) return;
      this._idleT = 0; this._fidgetAt = 9 + Math.random() * 8;
      if (Math.random() < 0.6) this.play('fidget_a'); else this.play('fidget_b', { once: true });
    },
    /** Lip-sync a line: mouth shapes follow the text at the dialogue box's typing pace (cps), pausing on punctuation. */
    say(text, cps = 34) { this._say = { chars: Array.from(String(text || '')), i: 0, acc: 0, wait: 0, cps, v: 'a' }; this.speaking = true; },
    _say: null,
    _life(dt) {
      if (this.paused) return;
      this._breathT += dt;
      const ch = bones.upperChest || bones.chest;
      if (ch) {
        this._breathPh = (this._breathPh || 0) + dt * (1.55 + 2.6 * this.exert);
        const b = Math.sin(this._breathPh);
        _q1.setFromAxisAngle(_v1.set(1, 0, 0), -(0.018 + 0.03 * this.exert) * b);
        ch.quaternion.multiply(_q1);
      }
      // talking: with say(text) the mouth walks the text (one vowel shape per character, closed on punctuation, done when
      // the line is fully typed); plain `speaking` (or an NPC facing the heroine while the box is up) flaps generically
      const sy = this._say;
      if (sy && this.speaking) {
        let open = 0;
        if (sy.wait > 0) sy.wait -= dt;
        else if (sy.i < sy.chars.length) {
          sy.acc += dt * sy.cps;
          while (sy.acc >= 1 && sy.i < sy.chars.length) {
            sy.acc -= 1; const ch = sy.chars[sy.i++];
            if (PAUSE_CH.includes(ch)) { sy.wait = 0.13; sy.acc = 0; sy.v = ''; break; }
            sy.v = VOWELS[(ch.codePointAt(0) * 7) % 5];
          }
          // each character: open quickly, ease half shut before the next
          open = sy.v ? 0.25 + 0.55 * Math.sin(Math.PI * clamp(sy.acc)) : 0;
        }
        for (const k of VOWELS) this.setExpression(k, k === sy.v ? open : 0, 26);
        if (sy.i >= sy.chars.length && sy.wait <= 0) { this._say = null; for (const k of VOWELS) this.setExpression(k, 0, 14); }
        this._talkT = 0;
      } else {
        if (sy && !this.speaking) { this._say = null; for (const k of VOWELS) this.setExpression(k, 0, 14); }
        const auto = !this.speaking && this._lookOn && G.ui?.talking && !ride && this._camD < 9 && !G.dialogue?.active;
        const talk = this.speaking || auto;
        if (talk || this._talkT > 0) {
          this._talkT = talk ? this._talkT + dt : 0;
          const t = this._talkT;
          const open = talk ? clamp(0.5 + 0.5 * Math.sin(t * 13.0) * Math.sin(t * 3.1 + 1.3)) * 0.55 : 0;
          this.setExpression('a', open * (0.6 + 0.4 * Math.sin(t * 2.3)), 22);
          this.setExpression('o', open * 0.35 * (0.5 + 0.5 * Math.sin(t * 1.7)), 22);
        }
      }
    },
    _eyes(dt) {
      if (!eyes.length || this.paused) return;
      this._eyeT -= dt;
      if (this._eyeT <= 0) {
        // saccade: a new small glance, longer fixations than glances
        this._eyeT = 0.5 + Math.random() * 2.2;
        const r = Math.random();
        this._eyeTY = r < 0.45 ? 0 : (Math.random() - 0.5) * 0.22;
        this._eyeTP = r < 0.45 ? 0 : (Math.random() - 0.5) * 0.08;
      }
      // the eyes lead the head toward a look target
      const ty = this._eyeTY + clamp(this._lookOn ? this._lookYawRaw * 0.3 : 0, -0.14, 0.14);
      this._eyeY = damp(this._eyeY, ty, 28, dt);
      this._eyeP = damp(this._eyeP, this._eyeTP, 28, dt);
      _e1.set(this._eyeP, this._eyeY, 0, 'YXZ');
      _q1.setFromEuler(_e1);
      for (let i = 0; i < eyes.length; i++) eyes[i].quaternion.copy(eyeRest[i]).multiply(_q1);
    },
    _lookYawRaw: 0,
    _secondary(dt) {
      updateCelGlobals(G);
      const cam = G.camera;
      let d = 0;
      if (cam) { group.getWorldPosition(_v3); d = _v3.distanceTo(cam.position); }
      this._camD = d;
      const far = CEL_U.uOutFar.value;
      // outlines (draw-call pass): the body hull stops at OUTLINE_LOD m, the thin face hull (weight 0.45) at FACE_OUTLINE_LOD
      // (both under half a pixel wide there on 'high'); 'med' / 'low' end sooner through uOutFar
      const ov = d < Math.min(far, OUTLINE_LOD) && group.visible, fv = d < Math.min(far, FACE_OUTLINE_LOD) && group.visible;
      for (const o of outlines) o.visible = o.morphTargetInfluences ? fv : ov;
      for (const o of seeLines) o.visible = d < SEE_LINES.far && group.visible && !this._seeOff;
      // merged characters: far view (one body draw + HairBack) beyond CEL_FAR m, with a metre of hysteresis
      const cf = this._celFar ? d > CEL_FAR - 1 : d > CEL_FAR + 1;
      if (cf !== this._celFar) {
        this._celFar = cf;
        model.traverse((o) => { const l = o.userData.celLod; if (l) o.visible = (l === 'far') === cf; });
      }
      // shadow proxy: one merged caster instead of ~13 when the sun's shadow camera sees its layer (else the real casters)
      if (shadowPx.mesh) {
        const on = castShadow && !!G.lights?.sun?.shadow?.camera?.layers.isEnabled(SHADOW_PROXY_LAYER);
        if (on !== shadowPx.on) { shadowPx.on = on; shadowPx.mesh.castShadow = on; for (const o of shadowPx.real) o.castShadow = !on; }
      }
      if (!springs || !this.springs || dt <= 0 || this.paused || !group.visible) return;
      // solver LOD (docs/api/cloth.md): the heroine always full; others full < 14 m, 30 Hz cloth-only to the cut-off,
      // static hang beyond it (every 3rd frame past 60 m) and always on 'low'
      const q = G.quality?.name;
      const hero = G.player?.rig === this;
      let lod = 0;
      if (!hero) {
        // crowd budget: only the SPR_FULL nearest others run at full rate (ranking from the previous frame)
        const f = G.time.frame;
        if (f !== _sprRank.frame) { _sprRank.frame = f; const a = _sprRank.list; a.sort((x, y) => x - y); _sprRank.cut = a.length > SPR_FULL ? a[SPR_FULL - 1] : Infinity; a.length = 0; }
        _sprRank.list.push(d);
        if (q === 'low' || d > (q === 'med' ? 24 : 34)) lod = 2;
        else if (d > 14 || d > _sprRank.cut) lod = 1;
        if (lod === 2 && (this._sprT = (this._sprT || 0) + 1) % (d > 60 ? 4 : 2)) return;   // the static hang needs no 60 Hz
        if (this._forceLod != null) lod = this._forceLod;   // perf tests only
      }
      let wind = null;
      // visualWindAt = the world wind plus visual-only gusts (beam struggle, blasts): cloth whips, bodies are not pushed
      if (G.elements?.windAt) { try { wind = (G.elements.visualWindAt || G.elements.windAt)(_v3, _vW); } catch (e) { wind = null; } }
      let water = 0;
      if (hero) water = G.player.state === 'swim' ? 1 : 0;
      else if (bones.hips && G.world?.isWater?.(_v3.x, _v3.z)) { bones.hips.getWorldPosition(_v4); water = _v4.y < (G.world.seaLevel ?? 0) + 0.1 ? 1 : 0; }
      _sprO.wind = wind; _sprO.water = water; _sprO.lod = lod;
      springs.update(dt * this.timeScale, _sprO);
    },
    /** Debug (tests): the spring solver of this actor, or null. */
    get _springs() { return springs; },
    /** Snap the springs to the current pose (call after a teleport / cutscene cut; big jumps are detected anyway). */
    resetSprings() { springs?.reset(); ride?.clear(); },
    _blob: null,
    _contact() {
      if (opts.blob === false || model.userData.placeholder) return;
      const parent = group.parent;
      if (!parent || !group.visible) { if (this._blob) this._blob.visible = false; return; }
      if (!this._blob) { this._blob = makeActorShadowBlob(0.36, 0.34); this._blob.userData.actorOwned = true; }
      const scene = G.scene || parent;
      if (this._blob.parent !== scene) scene.add(this._blob);
      group.getWorldPosition(_v3);
      // an owner that places its own blob near the feet (enemies) wins: don't stack two
      if (nearExternalBlob(_v3)) { this._blob.visible = false; return; }
      const gy = this.footGround ? this.footGround(_v3.x, _v3.z) : G.world?.groundAt ? G.world.groundAt(_v3.x, _v3.z, _v3.y + 0.5) : _v3.y;
      this._blob.userData.place(_v3.x, Number.isFinite(gy) ? gy : _v3.y, _v3.z, Math.max(0, _v3.y - (Number.isFinite(gy) ? gy : _v3.y)));
    },

    _face(dt) {
      if (!morphMeshes.length) return;
      let blink = 0;
      if (this.blinkEnabled && !this.paused) {
        this._blinkT -= dt * (this.blinkRate || 1);
        if (this._blinkT <= 0) { this._blinkPh = 0; this._blinkT = 1.8 + Math.random() * 3.6; if (Math.random() < 0.18) this._blinkT = 0.22; }
        if (this._blinkPh >= 0) {
          this._blinkPh += dt / 0.16;
          blink = this._blinkPh < 0.5 ? this._blinkPh * 2 : Math.max(0, 2 - this._blinkPh * 2);
          if (this._blinkPh >= 1) this._blinkPh = -1;
        }
      }
      for (const k in this.expressions) { const x = this.expressions[k]; x.cur = damp(x.cur, x.target, x.speed, dt); }
      const ex = this.expressions;
      for (const m of morphMeshes) {
        const d = m.morphTargetDictionary, inf = m.morphTargetInfluences;
        for (const k in ex) { const i = d[k]; if (i !== undefined) inf[i] = ex[k].cur; }
        const bi = d.blink;
        if (bi !== undefined) {
          // expressions that close the eyes already (joy/fun) leave less room for the blink
          const closed = (ex.joy?.cur || 0) * 0.8 + (ex.blink?.cur || 0);
          inf[bi] = clamp(Math.max(ex.blink?.cur || 0, blink * (1 - clamp(closed))));
        }
      }
    },

    _lookUpdate(dt) {
      const head = bones.head, neck = bones.neck;
      let ty = 0, tp = 0, tw = 0;
      if (this._lookOn) {
        head.getWorldPosition(_v1);
        _v2.copy(this._look).sub(_v1);
        // into the actor's frame (group orientation)
        group.getWorldQuaternion(_q1).invert();
        _v2.applyQuaternion(_q1);
        const yaw = Math.atan2(_v2.x, _v2.z);
        const pitch = Math.atan2(_v2.y, Math.hypot(_v2.x, _v2.z));
        const lim = this.lookLimits;
        if (Math.abs(yaw) < lim.yaw + 0.6) { ty = clamp(yaw, -lim.yaw, lim.yaw); tp = clamp(-pitch, -lim.pitch, lim.pitch); tw = 1; }
      }
      this._lookYawRaw = ty;
      this._lookYaw = damp(this._lookYaw, ty, 6, dt);
      this._lookPitch = damp(this._lookPitch, tp, 6, dt);
      this._lookW = damp(this._lookW, tw, 4, dt);
      const w = this._lookW;
      if (w < 0.01) return;
      group.getWorldQuaternion(_q1);
      _q4.copy(_q1).invert();
      // world-space rotation = groupQ * (yaw about up, then pitch about the turned right axis) * groupQ^-1
      const apply = (bone, f) => {
        if (!bone) return;
        _e1.set(this._lookPitch * f * w, this._lookYaw * f * w, 0, 'YXZ');
        _q2.setFromEuler(_e1);
        _q3.copy(_q1).multiply(_q2).multiply(_q4);
        rotateBoneWorld(bone, _q3);
      };
      if (neck) { neck.parent.updateMatrixWorld(true); apply(neck, 0.4); apply(head, 0.6); }
      else { head.parent.updateMatrixWorld(true); apply(head, 1); }
    },

    _feet(dt) {
      const gfn = this.footGround;
      const plant = clamp(this.plant);
      group.updateMatrixWorld(true);
      const oy = group.getWorldPosition(_v4).y;
      let target = 0, lifts = [0, 0];
      if (plant > 0.01) {
        bones.footL.getWorldPosition(_v1); const dL = gfn(_v1.x, _v1.z) - oy;
        bones.footR.getWorldPosition(_v2); const dR = gfn(_v2.x, _v2.z) - oy;
        if (Number.isFinite(dL) && Number.isFinite(dR)) {
          target = clamp(Math.min(dL, dR) - (this._castDrop || 0), -0.36, 0.05) * plant;
          lifts = [clamp(dL - target, 0, 0.36) * plant, clamp(dR - target, 0, 0.36) * plant];
        }
      }
      this._pelvis = damp(this._pelvis, target, 14, dt);
      this._lift = this._lift || [0, 0];
      this._lift[0] = damp(this._lift[0], lifts[0], 16, dt);
      this._lift[1] = damp(this._lift[1], lifts[1], 16, dt);
      model.position.y = this._pelvis;
      model.updateMatrixWorld(true);
      _vW.set(0, 0, 1).applyQuaternion(group.getWorldQuaternion(_q4));
      // foot lock (stance pinning): while a foot is down during locomotion its world xz stays where it touched, so a
      // clip whose stride does not match the ground speed exactly (unequal half-strides, gait blends) no longer skates.
      // Released when the foot lifts, the drift passes 0.32 m or the gait stops; the leg solve keeps every guard.
      const lk = this._lock || (this._lock = [{ w: 0, m: 0, x: 0, z: 0, tx: 0, tz: 0 }, { w: 0, m: 0, x: 0, z: 0, tx: 0, tz: 0 }]);
      const loco = (this.footLock ?? plant) > 0.5 && this.current === 'move' && this._moveV > 0.6 && !this.paused && !G.params?.nofootlock;
      for (let i = 0; i < 2; i++) {
        const th = i ? bones.thighR : bones.thighL, kn = i ? bones.kneeR : bones.kneeL, ft = i ? bones.footR : bones.footL;
        const toe = ft.children.find((c) => c.isBone) || null;
        const L0 = lk[i];
        ft.getWorldPosition(_vT); _vT.y += this._lift[i];
        if (toe) toe.getWorldPosition(_vTo).y += this._lift[i]; else _vTo.copy(_vT);
        // stance: the heel phase pins the ankle where it touched; at heel-off the toe takes over as the pivot (so the
        // natural heel-toe roll stays and nothing skates). m: 0 free, 1 ankle pinned, 2 toe pinned.
        let ox = 0, oz = 0, want = 0;
        if (loco && dt <= 0) { want = L0.m ? 1 : 0; if (L0.m) { const P2 = L0.m === 2 ? _vTo : _vT; ox = L0.x - P2.x; oz = L0.z - P2.z; } }   // a held frame keeps its pin
        else if (loco) {
          const gA = gfn(_vT.x, _vT.z), gT = gfn(_vTo.x, _vTo.z);
          const hA = Number.isFinite(gA) ? _vT.y - gA : 1, hT = Number.isFinite(gT) ? _vTo.y - gT : 1;
          L0.bA = Math.min((L0.bA ?? hA) + dt * 0.25, hA); L0.bT = Math.min((L0.bT ?? hT) + dt * 0.25, hT);
          if (hA < L0.bA + 0.04 && L0.m !== 2) { if (L0.m !== 1) { L0.m = 1; L0.x = _vT.x; L0.z = _vT.z; } ox = L0.x - _vT.x; oz = L0.z - _vT.z; }
          else if (L0.m && hT < L0.bT + 0.03) { if (L0.m !== 2) { L0.m = 2; L0.x = L0.tx; L0.z = L0.tz; } ox = L0.x - _vTo.x; oz = L0.z - _vTo.z; }
          else L0.m = 0;
          // a pin that drags too far (turn on the spot, a shove) lets go and re-plants
          if (L0.m && ox * ox + oz * oz > 0.1) L0.m = 0;
          want = L0.m ? 1 : 0;
        } else { L0.m = 0; L0.bA = L0.bT = undefined; }
        if (want) { L0.ox = ox; L0.oz = oz; }
        L0.w = want ? Math.min(1, L0.w + dt * 30) : Math.max(0, L0.w - dt * 14);
        if (L0.w > 0.01) {
          // keep the foot's animated world orientation (else the sole swings with the re-aimed shin and the toes skate)
          ft.getWorldQuaternion(_qF);
          _vT.x += (L0.ox || 0) * L0.w; _vT.z += (L0.oz || 0) * L0.w; legTwoBone(th, kn, ft, _vT, _vW);
          ft.updateWorldMatrix(true, false);
          rotateBoneWorld(ft, _q3.copy(_qF).multiply(ft.getWorldQuaternion(_q2).invert()));
        }
        else if (this._lift[i] > 0.005) legIK(th, kn, ft, this._lift[i], _vW);
        if (toe) { toe.updateWorldMatrix(true, false); toe.getWorldPosition(_vTo); L0.tx = _vTo.x; L0.tz = _vTo.z; }
      }
      // soles follow the slope under each planted foot (pitch + roll from the ground normal, capped at ~26°)
      if (plant > 0.05) for (const f of [bones.footL, bones.footR]) {
        f.getWorldPosition(_v1);
        const e = 0.14, hx0 = gfn(_v1.x - e, _v1.z), hx1 = gfn(_v1.x + e, _v1.z), hz0 = gfn(_v1.x, _v1.z - e), hz1 = gfn(_v1.x, _v1.z + e);
        if (!Number.isFinite(hx0 + hx1 + hz0 + hz1)) continue;
        _v2.set(hx0 - hx1, 2 * e, hz0 - hz1);
        if (Math.abs(_v2.x) + Math.abs(_v2.z) > 1.2 * e || Math.abs(_v2.x) + Math.abs(_v2.z) < 0.004) continue; // steps / flat
        _v2.normalize();
        _q1.setFromUnitVectors(UP, _v2);
        _q2.identity().slerp(_q1, plant);
        rotateBoneWorld(f, _q2);
      }
    },

    dispose() {
      if (this._flashSaved) this._endFlash();
      if (this._blob) { this._blob.parent?.remove(this._blob); this._blob.geometry.dispose(); this._blob.material.dispose(); this._blob = null; }
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      group.parent?.remove(group);
      if (this._orig) for (const [m] of this._orig) { if (m.celSrcGeo || m.celSplit) restoreCelParts(m); const mm = Array.isArray(m.material) ? m.material : [m.material]; for (const x of mm) if (x && x.userData && x.userData.shared === false) x.dispose(); }
      // per-instance skeletons (bone textures) — geometry and shared materials belong to the asset cache
      const sk = new Set();
      model.traverse((m) => { if (m.isSkinnedMesh && m.skeleton) sk.add(m.skeleton); });
      for (const k of sk) { try { k.dispose(); } catch (e) { /* already gone */ } }
    },
  };

  // full-layer action (or blend part) at weight w: split into the full clip and a legs-only twin while the upper overlay is on
  function weighPart(e, w, U) {
    e.action.setEffectiveWeight(w * (1 - U));
    if (U > 0.001 && w > 0) {
      if (!e.lower) {
        const lc = part(L, e.def.clip, e.blend ? 'blower' : 'lower');
        if (lc) { e.lower = mixer.clipAction(lc); e.lower.setLoop(e.action.loop, Infinity); e.lower.clampWhenFinished = true; e.lower.play(); }
      }
      if (e.lower) { e.lower.enabled = true; e.lower.time = e.action.time; e.lower.timeScale = e.action.timeScale; e.lower.paused = e.action.paused; e.lower.setEffectiveWeight(w * U); }
    } else if (e.lower) e.lower.setEffectiveWeight(0);
  }
  function e0Moved(a) { return Math.abs(a._legYaw) > 1e-3 || Math.abs(a.legYaw) > 1e-3; }
  function stepLayer(list, sdt, dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      const r = (dt > 0 ? dt : 0) / e.fade;
      e.w = e.target > e.w ? Math.min(e.target, e.w + r) : Math.max(e.target, e.w - r);
      if (e.w <= 0 && e.target <= 0) {
        e.action.setEffectiveWeight(0); e.action.stop();
        if (e.lower) { e.lower.setEffectiveWeight(0); e.lower.stop(); }
        if (e.parts) for (const p of e.parts) { p.action.setEffectiveWeight(0); p.action.stop(); if (p.lower) { p.lower.setEffectiveWeight(0); p.lower.stop(); } }
        list.splice(i, 1);
      }
    }
  }
  function checkDone(list, isFull) {
    const e = list[list.length - 1];
    if (!e || !e.once || e.done || e.target <= 0) return;
    const a = e.action;
    if (a.time < e.end - 1e-3 && !(a.paused && a.time >= a.getClip().duration - 1e-3)) return;
    e.done = true;
    if (e.end < a.getClip().duration) a.paused = true; // hold the trimmed end pose while the next state fades in
    let handled = false;
    if (e.onDone) { try { handled = e.onDone(actor, e.state) === true; } catch (err) { G.reportError('actor:onDone', err); } }
    if (handled) return;
    if (e.next) { actor.play(e.next, { fade: 0.18 }); return; }
    if (isFull) { if (actor.current === e.state) actor.play(lastLoop === e.state ? 'idle' : lastLoop, { fade: 0.2 }); }
    else { e.target = 0; e.fade = 0.18; if (actor.upperState === e.state) actor.upperState = ''; }
  }

  actor.play(opts.state || 'idle', { fade: 0.001 });
  actor.update(0);
  return actor;
}

/** Make the next mixer.update() write every binding (see the call site). Uses three's PropertyMixer buffer layout
 *  [incoming | accu0 | accu1 | orig | …]: the region just applied becomes a finite sentinel, so the next compare differs.
 *  A finite value (not NaN) keeps lerp / slerp with weight 0 exact if no action feeds the binding next frame. */
function forceRewrite(mixer) {
  const B = mixer._bindings, idx = mixer._accuIndex;
  if (!B) return;
  for (let i = 0, n = B.length; i < n; i++) {
    const m = B[i], buf = m.buffer;
    if (buf && typeof buf[0] === 'number') buf[m.valueSize * (idx + 1)] = -7.77e7;
  }
}

/** Leg IK: raise the foot by `lift` metres (world up), bending the knee FORWARD (pole IK), with hard guards. */
function legIK(thigh, knee, foot, lift, fwd) {
  if (!thigh || !knee || !foot) return;
  foot.getWorldPosition(_vT).addScaledVector(UP, lift);
  legTwoBone(thigh, knee, foot, _vT, fwd);
}
const _qF = new THREE.Quaternion(), _vTo = new THREE.Vector3();
const _vT = new THREE.Vector3(), _vKd = new THREE.Vector3(), _vPo = new THREE.Vector3(), _vDi = new THREE.Vector3();
/**
 * Two-bone leg solve toward world point Tw with the knee in front (pole = the animated knee direction when it is clearly
 * bent forward, else the body's forward). Guards: the foot target never comes higher than 55 % of the leg length below the
 * hip, the leg never folds tighter than 55 % or straighter than 99.9 % of its length, and the knee never ends above the hip.
 */
function legTwoBone(thigh, knee, foot, Tw, fwd) {
  const H = thigh.getWorldPosition(_v1), K = knee.getWorldPosition(_v2), F = foot.getWorldPosition(_v3);
  const a = H.distanceTo(K), b = K.distanceTo(F), L = a + b;
  if (!(a > 1e-4 && b > 1e-4)) return;
  const T = _v4.copy(Tw);
  T.y = Math.min(T.y, H.y - 0.55 * L);
  const dir = _vDi.copy(T).sub(H);
  let c = dir.length();
  if (!(c > 1e-4)) return;
  dir.multiplyScalar(1 / c);
  c = clamp(c, Math.max(0.55 * L, Math.abs(a - b) + 1e-3), L - 1e-3);
  T.copy(H).addScaledVector(dir, c);
  // pole: the animated knee offset off the hip->target line, if it is bent and points forward; otherwise forward
  const po = _vPo.copy(K).sub(H);
  po.addScaledVector(dir, -po.dot(dir));
  const pl = po.length();
  _vHK.copy(fwd).addScaledVector(dir, -fwd.dot(dir));
  const fl = _vHK.length();
  if (fl > 1e-4) _vHK.multiplyScalar(1 / fl);
  if (pl > 0.06 * a && (fl < 1e-4 || po.dot(_vHK) > 0.25 * pl)) po.multiplyScalar(1 / pl);
  else if (fl > 1e-4) po.copy(_vHK);
  else return;
  const x = (a * a - b * b + c * c) / (2 * c);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const Kd = _vKd.copy(H).addScaledVector(dir, x).addScaledVector(po, h);
  if (Kd.y > H.y - 0.05 * a) { Kd.y = H.y - 0.05 * a; Kd.sub(H).setLength(a).add(H); } // never a knee above the hip
  // thigh: current knee -> desired knee
  _vFK.copy(K).sub(H).normalize();
  _vAx.copy(Kd).sub(H).normalize();
  _q1.setFromUnitVectors(_vFK, _vAx);
  rotateBoneWorld(thigh, _q1);
  // shin: current foot -> target
  knee.getWorldPosition(K); foot.getWorldPosition(F);
  _vFK.copy(F).sub(K).normalize();
  _vAx.copy(T).sub(K).normalize();
  _q1.setFromUnitVectors(_vFK, _vAx);
  rotateBoneWorld(knee, _q1);
}
/** Two-bone IK: put the end bone's origin at world point T (keeps the current bend plane). */
function twoBoneTo(thigh, knee, foot, Tw) {
  const H = thigh.getWorldPosition(_v1), K = knee.getWorldPosition(_v2), F = foot.getWorldPosition(_v3);
  const T = _v4.copy(Tw);
  const a = H.distanceTo(K), b = K.distanceTo(F);
  const c = clamp(H.distanceTo(T), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  // knee: change the inner angle so |HF| = c
  const hk = _vHK.copy(H).sub(K), fk = _vFK.copy(F).sub(K);
  const th0 = hk.angleTo(fk);
  const th1 = Math.acos(clamp((a * a + b * b - c * c) / (2 * a * b), -1, 1));
  const axis = _vAx.crossVectors(hk, fk);
  if (axis.lengthSq() < 1e-10) { thigh.getWorldQuaternion(_q1); axis.set(1, 0, 0).applyQuaternion(_q1); }
  axis.normalize();
  _q1.setFromAxisAngle(axis, th1 - th0);
  rotateBoneWorld(knee, _q1);
  // thigh: swing so the foot points at the target
  foot.getWorldPosition(F);
  thigh.getWorldPosition(H);
  _vFK.copy(F).sub(H).normalize();
  _vHK.copy(T).sub(H).normalize();
  _q1.setFromUnitVectors(_vFK, _vHK);
  rotateBoneWorld(thigh, _q1);
}
const _vR = new THREE.Vector3(), _vR2 = new THREE.Vector3();
const _sprO = { wind: null, water: 0, lod: 0 };
const SPR_FULL = 4;                      // others simulated at full rate at once (nearest first)
const _sprRank = { frame: -1, cut: Infinity, list: [] };
const _vHK = new THREE.Vector3(), _vFK = new THREE.Vector3(), _vAx = new THREE.Vector3(), _vW = new THREE.Vector3();

// blobs placed by owners (makeActorShadowBlob users) this frame: an actor's own contact shadow steps aside near them
const extBlobs = [];
function nearExternalBlob(p) {
  const f = G.time?.frame;
  for (let i = extBlobs.length - 1; i >= 0; i--) {
    const b = extBlobs[i];
    if (!b.parent) { extBlobs.splice(i, 1); continue; }
    if (b.visible && f - (b.userData.frame ?? -9) <= 2 && Math.abs(b.position.x - p.x) < 0.6 && Math.abs(b.position.z - p.z) < 0.6) return true;
  }
  return false;
}

let _blobTex = null;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.55, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _blobTex = new THREE.CanvasTexture(c);
  return _blobTex;
}
// draw-call pass (docs/api/actors-look.md "Distance"): every blob used to be its own transparent draw (one per actor,
// creature, enemy and NPC: 14 in the village). The blob objects stay (same API: position, visible, material.opacity,
// dispose) but no longer draw themselves (layers.mask = 0); ONE instanced draw places all live blobs each frame.
// Same quad, texture, colour, fog and polygon offset; blending the same dark colour is order-independent. ?perf=0 = before.
const BLOB_COL = 0x0b0718;
const blobLive = new Set();
let blobBatch = null;
function blobBatchMesh() {
  if (blobBatch) return blobBatch;
  const m = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: BLOB_COL,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
  m.name = 'actorBlobs';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aBlobA;\nvarying float vBlobA;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlobA = aBlobA;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBlobA;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vBlobA );');
  };
  m.customProgramCacheKey = () => 'actorBlobs1';
  const make = (cap) => {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    geo.setAttribute('aBlobA', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
    const im = new THREE.InstancedMesh(geo, m, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.name = 'actorBlob';   // water/reflect.js skips it by this name, as it skipped the single blobs
    im.renderOrder = 1; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    im.count = 0;
    im.onBeforeRender = fill;
    return im;
  };
  const _m = new THREE.Matrix4(), _s = new THREE.Matrix4();
  function fill() {
    let n = 0;
    const im = blobBatch;
    for (const b of blobLive) {
      if (!b.parent) { blobLive.delete(b); continue; }
      const a = b.material.opacity;
      if (!b.visible || !(a > 0.001)) continue;
      if (n >= im.instanceMatrix.count) break;
      const d = b.userData.blobR * 2;
      _m.multiplyMatrices(b.matrixWorld, _s.makeScale(d, d, d));
      im.setMatrixAt(n, _m);
      im.geometry.attributes.aBlobA.array[n] = a;
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true; im.geometry.attributes.aBlobA.needsUpdate = true;
    // grow for the next frame when full
    if (n >= im.instanceMatrix.count && blobLive.size > n) {
      const nb = make(im.instanceMatrix.count * 2);
      im.parent?.add(nb); im.parent?.remove(im); im.geometry.dispose(); im.dispose();
      blobBatch = nb;
    }
  }
  blobBatch = make(64);
  return blobBatch;
}

/**
 * Cheap round contact shadow for distant actors (no shadow-map cost). Add it to the scene (NOT under the actor) and call
 * blob.place(x, groundY, z, height?) each frame; it fades as the actor rises above the ground.
 */
export function makeActorShadowBlob(radius = 0.45, opacity = 0.42) {
  const m = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity, color: BLOB_COL,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2), m);
  mesh.renderOrder = 1;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.name = 'actorBlob';
  const batched = G.params?.perf !== '0' && G.params?.blobbatch !== '0';
  if (batched) { mesh.layers.mask = 0; mesh.userData.blobR = radius; blobLive.add(mesh); }
  mesh.userData.place = (x, gy, z, h = 0) => {
    mesh.position.set(x, gy + 0.04, z);
    mesh.userData.frame = G.time?.frame;
    if (!mesh.userData.actorOwned && !mesh.userData.listed) { mesh.userData.listed = true; extBlobs.push(mesh); }
    const k = clamp(1 - h / 8);
    m.opacity = opacity * k;
    mesh.scale.setScalar(1 + (1 - k) * 0.6);
    mesh.visible = k > 0.02;
    if (batched) {
      const B = blobBatchMesh();
      if (B.parent !== G.scene && G.scene) G.scene.add(B);
      if (!blobLive.has(mesh)) blobLive.add(mesh);
    }
  };
  return mesh;
}
