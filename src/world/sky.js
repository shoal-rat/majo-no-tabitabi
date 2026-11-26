// sky — the sky dome, the lights, fog, shadows and the whole post-processing pipeline (DESIGN.md §4, §6.6).
//   G.sky    = { mesh, exposure, flash(color, dur), setRingBoost(k), setWeather({ rain, cloud }), state }
//   G.lights = { sun, hemi }
//   G.post   = { composer, enabled, flags, setDOF(on, focusDist), setGrade(name), set(flag, on), sceneCalls,
//                captureOpaque(renderer), opaque }   (opaque scene colour + depth for refraction, see docs/api/look.md)
// Everything that depends on the Veil is evaluated twice: per fragment (material hook, sky shader) and at the camera
// (lights, fog for unhooked materials, exposure, grading) — see src/render/atmo.js.
import { createJourneyWeather } from './journey-weather.js';
import * as THREE from 'three';
import { G } from '../core/game.js';
import { addMaterialHook, hookMaterial } from '../core/mats.js';
import { cloudBase, CLOUD_THICKNESS } from '../render/cloud-layer.js';
import { SUN_DIR, veilAt, moonDirAt, moonSeparationAt } from './veil.js';
import { U, pal, palScalars, daylightFromVeil, sunVisibleFraction, basisAround, LAMP_RES, LAMP_CELL } from '../render/atmo.js';
import { updateCloudField } from '../render/cloud-field.js';
import { createSkyDome } from '../render/skydome.js';
import { veilHook, refreshLook, LOOK_DEFAULTS, setHookDebug, HOOK_DEBUG_BITS, setGpuHook } from '../render/veilhook.js';
import { SURFACES } from '../render/surfaces.js';
import { setupSunShadow } from '../render/shadows.js';
import { createPipeline, GRADES, LOOKS, lookOf } from '../render/post.js';
import { clamp, smoothstep, damp } from '../core/util.js';
import { BELL, CORE, CITY_Y, CORE_Y, BELL_SQUARES } from '../data/bellcrown.js';

const SUN_INTENSITY = 3.45;
const PRESETS = {
  low: { samples: 0, fxaa: true, ao: false, bloom: false, shafts: true, sharpen: 0 },
  med: { samples: 4, fxaa: false, ao: false, bloom: true, shafts: true, sharpen: 0.7 },
  high: { samples: 4, fxaa: false, smaa: true, ao: true, bloom: true, shafts: true, sharpen: 0.8 }, // light r3: 0.5 -> 0.8 (clamped CAS, no ringing)
  // phones (core/boot.js QUALITY.mobile, systems see 'low'): rendered at >= 1080 lines, close to the screen's own pixels,
  // so no FXAA and no sharpen (two full-screen passes fewer: the tone pass only runs for bloom / sharpen) and no sun
  // shafts (a full-res pass a 6-inch screen hardly shows). Judged on 1:1 crops at 844x390 @3x: the edges stay clean.
  mobile: { samples: 0, fxaa: false, ao: false, bloom: false, shafts: false, sharpen: 0 },
};

// scratch (no per-frame allocations)
const _c = new THREE.Color(), _c2 = new THREE.Color();
const _sc = {};
const _contactCands = [];

// ---- lamp pools (look round 2, light r3) ---------------------------------------------------------------------------
// Glowing lanterns (glow() / glowDynamic() materials: MeshBasicMaterial, toneMapped false, warm and bright) light the
// ground and walls around them — no light objects, no draw calls, no shadow. Their positions come from the geometry
// itself: the static places are merged per block, so each glow mesh's vertices are clustered once (0.5 m cells,
// connected components) and every compact cluster (lantern-sized, not a window pane) is one lamp. Built lazily, one
// mesh per frame, only while the camera is in the night half of the Veil.
// Light r3: instead of the six nearest lamps in uniforms (pools popped as the choice changed), EVERY lamp within the
// map is splatted into U.mvLampMap, a 128 x 128 m camera-centred map (1 m texels, snapped to 8 m so it never swims);
// re-baked only when the map moves, the lamp set changes, a lamp's brightness changes or a new lamp fades in.
const _lampSeen = new WeakSet();   // meshes already looked at
const _lampMeshQ = [];             // glow meshes waiting to be clustered
const _lamps = [];                 // { x, y, z, reach, mat, mesh, born }
let _lampScanT = 99;
const LM = { ox: 1e9, oz: 1e9, sig: -1, acc: new Float32Array(LAMP_RES * LAMP_RES * 4), used: 0, bakes: 0, ramp: false, t: 0, frame: 0, lastBake: -99 };
function isLampMat(m) {
  if (!m || Array.isArray(m) || !m.isMeshBasicMaterial || m.toneMapped !== false || m.transparent && m.opacity < 0.5) return false;
  const c = m.color;
  // Town lamps can be unlit when first discovered. Register by their full colour; the pool follows their live intensity.
  const full = m.userData.glowAtFullStrength;
  const r = full ? full[0] : c.r, g = full ? full[1] : c.g, b = full ? full[2] : c.b;
  return r > 0.9 && r >= b * 1.6 && r + g > 1.3;
}
function clusterLamps(mesh) {
  const pos = mesh.geometry?.attributes?.position;
  if (!pos || pos.count > 400000) return;
  mesh.updateMatrixWorld();
  const e = mesh.matrixWorld.elements, cells = new Map(), CS = 0.5;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
    const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12], y = e[1] * lx + e[5] * ly + e[9] * lz + e[13], z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
    const key = Math.floor(x / CS) + ',' + Math.floor(y / CS) + ',' + Math.floor(z / CS);
    let c = cells.get(key);
    if (!c) { c = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9, Math.floor(x / CS), Math.floor(y / CS), Math.floor(z / CS), 0]; cells.set(key, c); }
    if (x < c[0]) c[0] = x; if (y < c[1]) c[1] = y; if (z < c[2]) c[2] = z;
    if (x > c[3]) c[3] = x; if (y > c[4]) c[4] = y; if (z > c[5]) c[5] = z;
  }
  const stack = [];
  for (const c0 of cells.values()) {
    if (c0[9]) continue;
    c0[9] = 1; stack.push(c0);
    const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    let n = 0;
    while (stack.length) {
      const c = stack.pop(); n++;
      for (let k = 0; k < 3; k++) { if (c[k] < b[k]) b[k] = c[k]; if (c[k + 3] > b[k + 3]) b[k + 3] = c[k + 3]; }
      if (n > 64) continue; // a sheet of windows: stop growing, it is rejected below anyway
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const nb = cells.get((c[6] + dx) + ',' + (c[7] + dy) + ',' + (c[8] + dz));
        if (nb && !nb[9]) { nb[9] = 1; stack.push(nb); }
      }
    }
    const sx = b[3] - b[0], sy = b[4] - b[1], sz = b[5] - b[2];
    const mx = Math.max(sx, sy, sz), mn = Math.min(sx, sy, sz);
    if (n > 64 || mx > 1.7 || mn < 0.14) continue; // panes, strips and sheets are not lanterns
    _lamps.push({ x: (b[0] + b[3]) / 2, y: (b[1] + b[4]) / 2, z: (b[2] + b[5]) / 2, reach: Math.min(6.0, 2.4 + mx * 3.0), size: mx, mat: mesh.material, mesh,
      mx: e[12], my: e[13], mz: e[14], dead: false, born: LM.t });
  }
}
// a lamp is only used while its mesh is still in the scene and has not moved (a carried lantern is not a lamp)
function lampAlive(l) {
  if (l.dead) return false;
  const e = l.mesh.matrixWorld.elements;
  if (Math.abs(e[12] - l.mx) + Math.abs(e[13] - l.my) + Math.abs(e[14] - l.mz) > 0.01) { l.dead = true; return false; }
  let o = l.mesh;
  for (let i = 0; i < 12 && o; i++) { if (o === G.scene) return o.visible !== false && l.mesh.visible !== false; o = o.parent; }
  return false;
}
function scanLamps() {
  G.scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || _lampSeen.has(o)) return;
    _lampSeen.add(o);
    if (isLampMat(o.material)) _lampMeshQ.push(o);
  });
}
// pool colour of one lamp (linear, x strength): the lantern's hue pushed toward amber, so a white kosode beside a lamp
// turns warm instead of white; brightness follows the material (dimmed / relit town lamps)
function lampColour(l, out) {
  const mc = l.mat.color, m = Math.max(mc.r, mc.g, mc.b, 1e-3);
  // the night ambient is ~1 (lifted palette): a big lantern's pool must be a few times that; the small lanterns of a
  // festival string give less (a whole string of full-strength pools turned the square into one warm sheet)
  const k = Math.min(1, m / 2.4) * 5.0 * Math.min(1, Math.max(0.3, l.size / 0.9));
  out[0] = k; out[1] = Math.min(0.78, Math.max(mc.g / m * 0.96, 0.49)) * k; out[2] = Math.min(0.39, Math.max(mc.b / m * 0.68, 0.19)) * k;
  return out;
}
const _lc = [0, 0, 0];
/** Bake U.mvLampMap around the camera when anything that shows in it changed; set the night fade. */
function updateLampPools(cam, v, rdt) {
  const box = U.mvLampBox.value;
  const nightK = smoothstep(0.45, 0.85, v);
  LM.t += rdt; LM.frame++;
  box.w = nightK;
  if (nightK <= 0) return;
  _lampScanT += rdt;
  if (_lampScanT > 1.5) { _lampScanT = 0; scanLamps(); }
  // up to ~3 ms of clustering per frame (one mesh per frame left a town reached by a fast jump dark for seconds)
  if (_lampMeshQ.length) { const t0 = performance.now(); do clusterLamps(_lampMeshQ.pop()); while (_lampMeshQ.length && performance.now() - t0 < 3); }
  const SIZE = LAMP_RES * LAMP_CELL, half = SIZE / 2;
  const ox = Math.round((cam.position.x - half) / 8) * 8, oz = Math.round((cam.position.z - half) / 8) * 8;
  // signature of what the map shows: lamps inside it, their brightness, liveness and fade-in
  let sig = _lamps.length * 7.13, ramp = false;
  for (let i = 0; i < _lamps.length; i++) {
    const l = _lamps[i];
    if (l.x < ox - 6 || l.x > ox + SIZE + 6 || l.z < oz - 6 || l.z > oz + SIZE + 6) continue;
    if (!lampAlive(l)) { sig += i * 0.37; continue; }
    const age = LM.t - l.born;
    if (age < 0.8) ramp = true;
    sig += l.mat.color.r * (i + 1) * 0.011 + l.mat.color.g * 0.7;
  }
  const moved = ox !== LM.ox || oz !== LM.oz;
  const changed = Math.abs(sig - LM.sig) > 1e-6 || ramp || (LM.ramp && !ramp);
  if (!moved && (!changed || LM.frame - LM.lastBake < 3)) return; // fades / dimming: at most every third frame
  LM.lastBake = LM.frame;
  LM.ramp = ramp;
  LM.ox = ox; LM.oz = oz; LM.sig = sig;
  const acc = LM.acc; acc.fill(0);
  let used = 0;
  for (let i = 0; i < _lamps.length; i++) {
    const l = _lamps[i];
    if (l.dead || l.x < ox - 6 || l.x > ox + SIZE + 6 || l.z < oz - 6 || l.z > oz + SIZE + 6 || !lampAlive(l)) continue;
    lampColour(l, _lc);
    const fade = Math.min(1, (LM.t - l.born) / 0.8);
    const r = l.reach, r2 = r * r;
    const lum = (0.2126 * _lc[0] + 0.7152 * _lc[1] + 0.0722 * _lc[2]) * fade;
    if (lum <= 0) continue;
    used++;
    const gx = (l.x - ox) / LAMP_CELL - 0.5, gz = (l.z - oz) / LAMP_CELL - 0.5; // texel-centre coordinates
    const i0 = Math.max(0, Math.ceil(gx - r / LAMP_CELL)), i1 = Math.min(LAMP_RES - 1, Math.floor(gx + r / LAMP_CELL));
    const j0 = Math.max(0, Math.ceil(gz - r / LAMP_CELL)), j1 = Math.min(LAMP_RES - 1, Math.floor(gz + r / LAMP_CELL));
    for (let j = j0; j <= j1; j++) {
      const dz = (j - gz) * LAMP_CELL;
      for (let ii = i0; ii <= i1; ii++) {
        const dx = (ii - gx) * LAMP_CELL, q = (dx * dx + dz * dz) / r2;
        if (q >= 1) continue;
        const f = (1 - q) * (1 - q) * (1 - q) * fade, o = (j * LAMP_RES + ii) * 4; // cubic: a defined core, a soft rim
        acc[o] += _lc[0] * f; acc[o + 1] += _lc[1] * f; acc[o + 2] += _lc[2] * f; acc[o + 3] += lum * f * l.y;
      }
    }
  }
  const tex = U.mvLampMap.value, data = tex.image.data, toH = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < acc.length; i++) data[i] = acc[i] === 0 ? 0 : toH(acc[i]);
  tex.needsUpdate = true;
  box.x = ox; box.y = oz;
  LM.used = used; LM.bakes++;
}
const _grade = { lift: [0, 0, 0], gain: [0, 0, 0], sh: [1, 1, 1], sat: 1, vib: 0, knee: 0, contrast: 1, midLift: 0, vig: 0, vigCol: [0, 0, 0] };

function lerpGrade(a, b, t, o) {
  for (let i = 0; i < 3; i++) {
    o.lift[i] = a.lift[i] + (b.lift[i] - a.lift[i]) * t;
    o.gain[i] = a.gain[i] + (b.gain[i] - a.gain[i]) * t;
    o.vigCol[i] = a.vigCol[i] + (b.vigCol[i] - a.vigCol[i]) * t;
    o.sh[i] = (a.sh?.[i] ?? 1) + ((b.sh?.[i] ?? 1) - (a.sh?.[i] ?? 1)) * t;
  }
  o.sat = a.sat + (b.sat - a.sat) * t; o.vib = (a.vib || 0) + ((b.vib || 0) - (a.vib || 0)) * t; o.knee = (a.knee || 0) + ((b.knee || 0) - (a.knee || 0)) * t; o.contrast = a.contrast + (b.contrast - a.contrast) * t; o.vig = a.vig + (b.vig - a.vig) * t;
  o.midLift = a.midLift + (b.midLift - a.midLift) * t;
  o.hiRoll = (a.hiRoll || 0) + ((b.hiRoll || 0) - (a.hiRoll || 0)) * t;
  return o;
}

export const skySystem = {
  name: 'sky',
  pausable: false,

  async init(G) {
    const scene = G.scene, renderer = G.renderer, q = G.quality || { name: 'high', shadowSize: 2048 };
    // GPU pass (docs/api/perf.md "GPU pass"): ?gpu=0 (or ?perf=0) restores every pre-pass GPU path, ?gpuoff=a,b single
    // changes (sc = per-fragment shadow coordinates, grade = tone map once + bloom add in one pass)
    {
      const off = new Set(String(G.params.gpuoff || '').split(',').map((x) => x.trim()).filter(Boolean));
      const old = G.params.gpu === '0' || G.params.perf === '0';
      G.gpuPass = { old, on: (k) => !old && !off.has(k) };
      // phones (QUALITY.mobile): the shadow taps' early-out is on (a texture-bound handheld GPU saves 4 of 9 taps where
      // the centre and four outer taps agree; no gain measured on the M5, so desktop tiers keep it off); ?gputap=0 = off
      setGpuHook({ old, sc: G.gpuPass.on('sc'), tap: !old && (G.params.gputap === '1' || (!!q.mobile && G.params.gputap !== '0')) });
    }
    addMaterialHook(veilHook);
    // look tiers: detail on, fine detail scale, cloud shadows (docs/api/look.md)
    U.mvQ.value.set(1, q.name === 'low' ? 0 : 1, 1, 0);
    // the City of Magic's street canyons (veilhook mvCanyonSky): the tall-house streets keep ~1/3 of the sky fill
    // at the bottom, full again by balcony height; the squares stay open
    U.mvCanyonBox.value.set(BELL.boxX, BELL.boxZ, BELL.halfW, BELL.halfD);
    U.mvCanyonY.value.set(CITY_Y, CORE_Y, 0.68, 24);
    U.mvCanyonCore.value.set(BELL.x + CORE.x, BELL.z + CORE.z, CORE.r, 0);
    BELL_SQUARES.slice(0, 5).forEach((s, i) => U.mvCanyonOpen.value[i].set(BELL.x + s.x, BELL.z + s.z, s.r, 0));

    // ---- sky dome ----
    const dome = createSkyDome(q.mobile ? 'mobile' : q.name);
    scene.add(dome.mesh);
    scene.background = null;
    renderer.setClearColor(0x000000, 1);

    // ---- lights ----
    const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY);
    sun.name = 'mvSun';
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    hemi.name = 'mvHemi';
    scene.add(sun, sun.target, hemi);
    const shadow = setupSunShadow(G, sun, q);
    scene.fog = new THREE.FogExp2(0xc4dcec, 0.0008);
    G.lights = { sun, hemi };

    // ---- post ----
    const tierPreset = (q.mobile && PRESETS.mobile) || PRESETS[q.name] || PRESETS.high;
    const preset = { ...tierPreset };
    if (q.bloom === false) preset.bloom = false;
    if (renderer.getPixelRatio() > 1.3 && preset.samples > 2 && q.name !== 'high') preset.samples = 2; // retina: fewer MSAA samples (not on high: grass edges)
    const s = G.settings || {};
    for (const [k, key] of [['ao', 'postAO'], ['bloom', 'postBloom'], ['shafts', 'postShafts']]) if (typeof s[key] === 'boolean') preset[k] = preset[k] && s[key];
    if (G.params.msaa !== undefined && Number.isFinite(+G.params.msaa)) preset.samples = +G.params.msaa; // ?msaa=<n> (perf tests)
    preset.gpuGrade = G.gpuPass.on('grade'); // GPU pass: tone map once + bloom added in the tone pass (?gpuoff=grade)
    preset.aoNormals = G.params.perf !== '0'; // perf pass: shared half-res AO normals (?perf=0 = three's per-tap reconstruction)
    preset.tone = G.params.tone === '0' ? 0 : 1; // ?tone=0: the old ACES fit (look-round A/B)
    preset.cloudUniforms = dome.uniforms;
    preset.quality = q.name;
    preset.mobile = !!q.mobile;   // phones: lighter targets (render/post.js createPipeline)
    preset.sunShadow = sun.shadow;
    const pipe = createPipeline(renderer, scene, G.camera, preset);
    Object.assign(pipe.scenePass.compMat.uniforms, {
      tCloudLight: { value: dome.lowRT.textures[1] }, tCloudDepth: { value: dome.lowRT.textures[2] }, uCloudBase: dome.uniforms.uCloudH
    });
    renderer.info.autoReset = false;

    const st = (this.state = {
      dome, sun, hemi, shadow, pipe, preset,
      exposure: 1, ringBoost: 1, ringBoostTarget: 1,
      flashCol: new THREE.Color(), flashT: 0, flashDur: 1,
      grade: null, rain: 0, rainTarget: 0, cloud: null, autoRain: 0,
      time: 0, sunVis: 1, cover: 0,
    });

    G.journeyWeather = createJourneyWeather(G);
    const sky = (G.sky = {
      mesh: dome.mesh, waterEnvironment: dome.waterEnvironment,
      cloudLayer() {
        const base=dome.uniforms.uCloudH.value;
        return {base,top:base+CLOUD_THICKNESS};
      },
      uniforms: U,
      /** Same as core/mats.js hookMaterial (handy for tests / code that has no import path). */
      hookMaterial: (m) => hookMaterial(m),
      /** user exposure multiplier (1 = automatic exposure for the place) */
      exposure: 1,
      /** Brief flash of the whole sky + screen. color: hex / css / THREE.Color; dur in seconds. */
      flash(color = 0xffffff, dur = 0.5) {
        try { st.flashCol.set(color); } catch (e) { st.flashCol.set(0xffffff); }
        st.flashDur = Math.max(0.05, dur); st.flashT = st.flashDur;
      },
      /** Golden ring brightness multiplier (1 = normal; the ending pushes it to ~3). Eased. */
      setRingBoost(k = 1) { st.ringBoostTarget = Math.max(0, +k || 0); },
      /** Weather: { rain: 0..1, cloud: 0..1 (cover override, null = default) }. Also accepts { rainAt: bool }. */
      setWeather(w = {}) {
        if (w.rain !== undefined) st.rainTarget = clamp(+w.rain || 0, 0, 1);
        if (w.rainAt !== undefined) st.rainTarget = w.rainAt ? 1 : 0;
        if (w.cloud !== undefined) st.cloud = w.cloud === null ? null : clamp(+w.cloud, 0, 1);
      },
      /** Camera-local atmosphere numbers of the last frame (read-only, for debugging/tests). */
      /** Lamp pools (tests): { known, used (in the last bake), bakes, origin, night }. */
      /** World positions of every registered lamp (read-only copy; the ambient-life layer hangs its lantern moths on them). */
      lampList() { return _lamps.map((l) => ({ x: l.x, y: l.y, z: l.z })); },
      get lamps() { return { known: _lamps.length, used: LM.used, bakes: LM.bakes, origin: [LM.ox, LM.oz], night: +U.mvLampBox.value.w.toFixed(2) }; },
      get info() { return { veil: U.mvCamVeil.value, sunVis: st.sunVis, cover: st.cover, ringK: U.mvRingK.value, exposure: st.exposure, shaftK: pipe.scenePass.shaftK }; },
    });

    const post = (G.post = {
      composer: pipe.composer,
      enabled: true,
      flags: { ao: preset.ao, bloom: !!preset.bloom, shafts: preset.shafts, grade: true, aa: preset.fxaa, smaa: !!preset.smaa, dof: false },
      sceneCalls: 0,
      /**
       * Refraction source (round 2): call from a transparent object's onBeforeRender while the main scene draws.
       * Returns { color (HDR linear, before transparents), depth (DepthTexture of the same frame), width, height } —
       * captured once per frame, after all opaque objects — or null (not the main scene pass / post disabled).
       */
      /** Dynamic resolution: render the pipeline at this pixel ratio (null = the canvas's), the canvas keeps its size. */
      setRenderScale: (pr) => pipe.setRenderScale(pr),
      get renderSize() { return pipe.size; },
      /** The pipeline object (tests / look tuning only). */
      get pipe() { return pipe; },
      captureOpaque: (renderer) => (post.enabled ? pipe.scenePass.captureOpaque(renderer || G.renderer) : null),
      /** The last capture of this frame (or of an earlier frame), null before the first. */
      get opaque() { return pipe.scenePass.capInfo || null; },
      /** Depth of field (cutscenes/dialogue): focus distance in metres. */
      setDOF(on, focusDist = 8) {
        post.flags.dof = !!on;
        pipe.scenePass.setDOF(!!on);
        const u = pipe.scenePass.compMat.uniforms;
        u.uFocus.value = Math.max(0.5, focusDist);
        u.uFocusRange.value = Math.max(2, focusDist * 0.6);
      },
      /** The look presets and grades (look tuning / tests only; G.settings.look picks the look). */
      looks: LOOKS, grades: GRADES,
      /** Force a colour grade: 'sun' | 'dusk' | 'night' | 'neutral'; null / 'auto' = follow the Veil. */
      setGrade(name) { st.grade = name && name !== 'auto' && GRADES[name] ? name : null; },
      /** Toggle one stage: 'ao' | 'bloom' | 'shafts' | 'grade' | 'aa'. */
      set(flag, on) {
        on = !!on;
        if (flag === 'ao') { if (on) pipe.scenePass.makeAO(); pipe.scenePass.ao = on; }
        else if (flag === 'bloom') pipe.bloom.enabled = on;
        else if (flag === 'shafts') pipe.scenePass.shafts = on;
        else if (flag === 'aa') pipe.fxaa.enabled = on;
        else if (flag === 'smaa') pipe.smaa.enabled = on;
        else if (flag === 'tone') { pipe.grade.material.uniforms.uTone.value = on ? 1 : 0; return; } // look round: filmic (on) / old ACES fit
        else if (flag === 'dof') { post.setDOF(on, pipe.scenePass.compMat.uniforms.uFocus.value); return; }
        else if (flag !== 'grade') return;
        post.flags[flag] = on;
      },
    });
    void sky;
    // look layer (docs/api/look.md): knobs for tests / tools
    G.look = {
      surfaces: SURFACES, defaults: LOOK_DEFAULTS, uniforms: U,
      /** Re-read material.userData.look / .surface after changing them at runtime. */
      refresh: (m) => refreshLook(m),
      /** { detail, fine, clouds, debug } on/off (debug: show the surface pattern as albedo). */
      set(o = {}) { const q4 = U.mvQ.value; if ('detail' in o) q4.x = o.detail ? 1 : 0; if ('fine' in o) q4.y = o.fine ? 1 : 0; if ('clouds' in o) q4.z = o.clouds ? 1 : 0; if ('debug' in o) q4.w = o.debug ? 1 : 0; },
      shadows: shadow,
      /** GPU pass probes only (tools/perf/gpuprobe.js): hook debug variant by names ('flat', 'noshadow', …) or bits; 0 = normal. */
      /** GPU pass A/B (probes): hook switches { old, sc, tap } and post { grade }, recompiles the hooked materials. */
      gpuSwitch(o = {}) {
        if ('grade' in o) preset.gpuGrade = !!o.grade;
        const h = {}; for (const k of ['old', 'sc', 'tap']) if (k in o) h[k] = !!o[k];
        if (Object.keys(h).length) { setGpuHook(h); G.scene.traverse((x) => { for (const m of [].concat(x.material || [])) if (m) m.needsUpdate = true; }); }
      },
      hookDebug(v) {
        const bits = typeof v === 'number' ? v : [].concat(v || []).reduce((b, n) => b | (HOOK_DEBUG_BITS[n] || 0), 0);
        setHookDebug(bits);
        G.scene.traverse((o) => { for (const m of [].concat(o.material || [])) if (m) m.needsUpdate = true; });
        return bits;
      },
    };

    G.events.on('resize', ({ w, h }) => { try { pipe.setSize(w, h); } catch (e) { G.reportError('sky:resize', e); } });
    G.events.on('settings:changed', (set) => {
      for (const [k, key] of [['ao', 'postAO'], ['bloom', 'postBloom'], ['shafts', 'postShafts']]) {
        // the settings only switch OFF what the tier has: any settings write (a volume slider) used to turn AO and shafts
        // on for 'low' / phones (and AO on 'med') until the next reload
        if (typeof set?.[key] === 'boolean') post.set(k, set[key] && !!tierPreset[k] && (k !== 'bloom' || q.bloom !== false));
      }
    });

    // phones shedding cost (core/boot.js 'perf:lite' level 2): drop the painterly surface detail and the drifting cloud
    // shadows (two uniform switches in the lighting hook); back on when the frame has room again
    if (q.mobile) G.events.on('perf:lite', (e) => { const lite = e?.level >= 2, v = U.mvQ.value; v.x = lite ? 0 : 1; v.z = lite ? 0 : 1; });

    G.renderFrame = () => this.render();
  },

  update(dt, rdt) {
    const st = this.state;
    if (!st) return;
    if (!G.paused) G.journeyWeather.update(dt);
    st.time += rdt;
    U.mvTime.value = G.time.t; // sky animation follows game time (frozen while paused)
    if (st.flashT > 0) st.flashT = Math.max(0, st.flashT - rdt);
    st.ringBoost = damp(st.ringBoost, st.ringBoostTarget, 1.6, rdt);
    if ((G.time.frame & 15) === 0 && G.elements?.isSpellRainAt) {
      const p = G.camera.position;
      try { st.autoRain = G.elements.isSpellRainAt(p.x, p.z) ? 1 : 0; } catch (e) { st.autoRain = 0; }
    }
    st.rain = damp(st.rain, Math.max(st.rainTarget, st.autoRain, G.journeyWeather.state.rain), 0.8, rdt);
  },

  updateContacts(cam) {
    const slots = U.mvContact.value, cp = cam.position;
    let n = 0;
    const p = G.player?.pos;
    if (p && !G.player.hidden) { slots[n++].set(p.x, p.y, p.z, 0.85); } // round 2: wider than the hakama hem
    const cands = _contactCands; cands.length = 0;
    const consider = (pos, r) => {
      if (!pos) return;
      const d2 = (pos.x - cp.x) ** 2 + (pos.z - cp.z) ** 2;
      if (d2 < 1600) cands.push([d2, pos, r]);
    };
    try {
      if (G.npcs?.list?.forEach) G.npcs.list.forEach((nn) => { if (nn?.pos && nn.visible !== false) consider(nn.pos, 0.7); });
      const en = G.combat?.enemies;
      if (en) for (let i = 0; i < en.length && i < 64; i++) { const e = en[i]; if (e?.pos && !e.dead) consider(e.pos, Math.min(1.6, 0.4 + (e.height || 1) * 0.3)); }
    } catch (e) { cands.length = 0; }
    if (cands.length > 1) cands.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < cands.length && n < 4; i++) { const [, pos, r] = cands[i]; slots[n++].set(pos.x, pos.y, pos.z, r); }
    while (n < 4) slots[n++].set(0, -1e4, 0, 0);
  },

  /** Per-frame camera-dependent setup + draw. Runs inside G.renderFrame (after the camera has its final pose). */
  render() {
    const st = this.state, r = G.renderer, cam = G.camera;
    r.info.reset();
    const rdt = G.time.rdt || 0.016;
    const cx = cam.position.x, cz = cam.position.z;
    const v = veilAt(cx, cz);
    const day = daylightFromVeil(v);
    U.mvSunDir.value.copy(SUN_DIR);G.env.sunDir.copy(SUN_DIR);
    palScalars(v, _sc);

    // Sun / Moon as seen from the camera
    const sep = moonSeparationAt(cx, cz);
    st.sunVis = sunVisibleFraction(sep);
    st.cover = 1 - st.sunVis;
    const du = st.dome.uniforms;
    moonDirAt(cx, cz, du.uMoonDir.value);
    basisAround(SUN_DIR, du.uSunU.value, du.uSunV.value);
    basisAround(du.uMoonDir.value, du.uMoonU.value, du.uMoonV.value);
    du.uCover.value = st.cover; du.uSunVis.value = st.sunVis;
    du.uCam.value.copy(cam.position);
    const ringK = smoothstep(0.86, 0.995, st.cover);
    const rain = st.rain;
    const weather = G.journeyWeather.state;
    const overcast = Math.max(rain, smoothstep(.40,.90,weather.cover));
    du.uWeather.value.set(overcast,weather.warmth);
    du.uSkyNight.value=weather.night;
    const dark=Math.max(weather.night,weather.eclipse*.88);
    du.uCloudH.value = cloudBase(overcast);
    const cloudShape=updateCloudField(G.state?.playTime ?? G.time.t,weather.cover,rain,st.cloud);
    du.uCloudCover.value=cloudShape.x;
    U.mvCloud.value.set(du.uCloudCover.value, du.uCloudH.value, .84 * (1 - st.cover), 0);

    // shared uniforms
    U.mvCamVeil.value = v;
    U.mvSunVis.value = st.sunVis;
    U.mvRingK.value = ringK;
    U.mvRingBoost.value = st.ringBoost;
    pal('sunTint', v, _c).multiplyScalar(day);
    U.mvSunCam.value.copy(_c);
    st.sun.color.copy(_c);
    st.sun.color.r *= 1 + weather.warmth*.15;
    st.sun.color.g *= 1 - weather.warmth*.035;
    st.sun.color.b *= 1 - weather.warmth*.18;
    // The cloud column already attenuates direct sun per surface. Keep the key
    // in an opening (or above the deck) and apply only broad atmospheric loss here.
    const look = lookOf(G.settings?.look); // the chosen look (settings): light ratio here, haze / grade below
    st.sun.intensity=SUN_INTENSITY*(1-overcast*.24)*weather.sunlight*look.key;
    // In clear daylight the sky fills the shaded facade. When the sun disappears
    // into stratus or below the horizon, the sky supplies a larger share of its light.
    const daylightFill = .74 + .31 * overcast;
    st.hemi.intensity=(daylightFill+(1-daylightFill)*dark)*(1-.72*dark)*(1+(look.fill-1)*(1-dark)*(1-overcast));
    U.mvHemiMul.value = st.hemi.intensity;
    pal('hemiSky', v, st.hemi.color);
    pal('hemiGnd', v, st.hemi.groundColor);
    pal('fog', v, U.mvFogCam.value);
    U.mvFogCam.value.lerp(_c2.setRGB(.34,.415,.50),overcast*.75);
    U.mvFogCam.value.lerp(_c2.setRGB(.095,.144,.205),dark*.89);
    // the chosen look (settings): soft = a paler, thicker daylight haze so distant land falls back into the air
    U.mvFogCam.value.lerp(_c2.setRGB(.62,.75,.86),look.haze*(1-dark)*(1-overcast*.6));
    const fogD = _sc.fogDensity * (.74 + overcast*1.04 + rain*1.45) * (1 + (look.fog - 1) * (1 - dark));
    U.mvFogDensity.value = fogD;
    G.scene.fog.color.copy(U.mvFogCam.value);
    G.scene.fog.density = Math.sqrt(fogD * 600) / 600;

    // flash
    const fk = st.flashT > 0 ? Math.pow(st.flashT / st.flashDur, 2) : 0;
    U.mvFlash.value.copy(st.flashCol).multiplyScalar(fk * 0.8);

    // contact shadows under the heroine and the nearest people / creatures (veilhook mvContactAt)
    this.updateContacts(cam);
    updateLampPools(cam, Math.max(v,weather.night,weather.eclipse*.80), rdt);
    // shadows follow the focus
    st.shadow.update((G.player?.pos ? daylightFromVeil(veilAt(G.player.pos.x, G.player.pos.z)) : day)*weather.sunlight);

    // exposure (eye adaptation)
    const daylightExposure = 1 - .04 * weather.sunlight * (1 - .4 * overcast);
    const target = daylightExposure*(1+.09*dark)*_sc.exposure * (G.sky.exposure ?? 1) * (1 - rain * 0.12) * (1 + (st.ringBoost - 1) * 0.06);
    st.exposure = st.exposure === 1 && !st._expInit ? target : damp(st.exposure, target, 1.8, rdt);
    st._expInit = true;

    cam.updateMatrixWorld();
    st.dome.renderLow(r, cam, G.post.enabled ? st.pipe.size : null);
    st.pipe.scenePass.cloudShafts.updateMap(r);
    // water mirror before the scene pass (never switch the MSAA scene target mid-pass)
    try { G.water?.beforeScene?.(r, cam); } catch (e) { G.reportError?.('water:reflect', e); }

    const post = G.post;
    if (!post.enabled) {
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = st.exposure;
      r.setRenderTarget(null);
      r.render(G.scene, cam);
      post.sceneCalls = r.info.render.calls;
      G.fx?.drawOverlay?.(r, cam);
      return;
    }
    const pipe = st.pipe, sp = pipe.scenePass;
    // Aerosol scattering needs actual, unocculted sunlight. Above the layer
    // the dome's own bright cloud tops and dark shadows carry the contrast.
    const underCloud=1-smoothstep(du.uCloudH.value-2,du.uCloudH.value+19,cam.position.y);
    const sunAboveHorizon=smoothstep(.025,.14,SUN_DIR.y);
    // capped: facing a low sun, stronger beams turned the whole frame milky
    sp.shaftK=post.flags.shafts ? Math.min(1.0, look.shafts*st.sunVis*(1-weather.night)*(1-overcast*.91)
      *underCloud*sunAboveHorizon*(1+weather.warmth*.19)) : 0;
    sp.compMat.uniforms.uShaftCol.value.setRGB(1, .93-weather.warmth*.10, .82-weather.warmth*.24);
    sp.compMat.uniforms.uExposure.value = st.exposure;
    // bloom by place
    pipe.bloom.threshold = _sc.bloomThreshold;
    pipe.bloom.strength = _sc.bloomStrength * (1 + (st.ringBoost - 1) * 0.12) * look.bloom;
    pipe.bloom.radius = 0.15; // light r3 (was 0.3): less spread, so glows do not bleed over edges and lettering
    // grading
    const gu = pipe.grade.material.uniforms;
    const twilight = .51 * (1-smoothstep(-.035,.36,SUN_DIR.y));
    const gradePhase = Math.max(v,twilight,weather.night,.8*weather.eclipse);
    let g;
    if (st.grade) g = GRADES[st.grade];
    else {
      const gs = GRADES[look.sun], gd = GRADES[look.dusk], gn = GRADES[look.night];
      g = gradePhase < .5 ? lerpGrade(gs, gd, smoothstep(.05,.5,gradePhase), _grade) : lerpGrade(gd, gn, smoothstep(.5,.92,gradePhase), _grade);
    }
    gu.uToneExp.value = look.tone.exp; gu.uToneCt.value = look.tone.ct; gu.uToneSat.value = look.tone.sat;
    gu.uLift.value.fromArray(g.lift); gu.uGain.value.fromArray(g.gain); gu.uVigCol.value.fromArray(g.vigCol); gu.uShTint.value.fromArray(g.sh || [1, 1, 1]);
    gu.uMidLift.value = g.midLift;
    gu.uSat.value = g.sat; gu.uVib.value = g.vib || 0; gu.uSatKnee.value = g.knee || 0; gu.uHiRoll.value = g.hiRoll || 0; gu.uContrast.value = g.contrast; gu.uVig.value = g.vig;
    gu.uGradeOn.value = post.flags.grade ? 1 : 0;
    gu.uFlash.value.copy(st.flashCol).multiplyScalar(fk * 0.45);

    r.toneMapping = THREE.NoToneMapping;
    pipe.render();
    post.sceneCalls = sp.sceneCalls;
    G.fx?.drawOverlay?.(r, cam);   // floating labels over the finished picture
  },
};
