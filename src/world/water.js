// Water: one stylised surface at y = 0 (sea, 镜湖, 暮川, 雾见泉, 月池 and any crater dug below sea level).
// MeshPhong base passed through hookMaterial (Veil light, coloured shadows, height fog) with a custom shader
// (src/world/water/glsl.js):
//  * see-through shallows: opacity from the optical path through the baked depth, body colour deepening to the land's
//    deep tone; soft caustics on the shallow bed by day; glowing motes drifting in the night water;
//  * painted waves from a mip-mapped normal texture (calm far away, calmer still on 镜湖 and 月池), a long swell on the
//    open sea (vertex), flow-mapped currents and drifting foam along the rivers (faster in the narrows);
//  * shore foam lip, swash lines rolling up the beaches, whitecaps on the open sea, two-tone painterly foam;
//  * reflections: tiered planar targets (src/world/water/reflect.js) with mirrored actors, the screen-space sky layer +
//    analytic sky; sun glitter path + glints by day; at night a crisp shimmering golden ring and its glitter path;
//  * rings: ripples (API), wakes behind the swimming heroine and the low broom, rain rings where it rains.
// The mesh follows the camera (snapped, geometric grid: fine near the camera, reaching the far plane).
import * as THREE from 'three';
import { hookMaterial } from '../core/mats.js';
import { heightAt, SEA_LEVEL } from './ground.js';
import { VEIL, POI, MOAT } from '../data/world.js';
import { TRIAL_LAKE, trialLakeActive, trialLakeContains } from './trial-lake.js';
import { SUN_DIR, SUN_ANGULAR_RADIUS } from './veil.js';
import { U } from '../render/atmo.js';
import { waterDetailTexture, flowTexture } from './water/maps.js';
import { FlightWake } from './water/flight-wake.js';
import { plantWake, wakeFoam } from './flora/wake-field.js';
import { DATA_HALF } from './terrain/textures.js';
import { PlanarReflection } from './water/reflect.js';
import { createLegacyWater } from './water/legacy.js';
import { MAX_RIPPLES, MAX_WAKES, VERT_PARS, VERT_MAIN, fragPars, FRAG_COLOR, FRAG_NORMAL, fragReflect } from './water/glsl.js';

/** Grid that is ~2 m apart near the centre and stretches to ±4500 m at the rim. */
function waterGeometry(n = 128, near = 2, far = 4500, exponent = 4) {
  const a = near * n / 2;
  const f = (s) => Math.sign(s) * (a * Math.abs(s) + (far - a) * Math.pow(Math.abs(s), exponent));
  const pos = new Float32Array((n + 1) * (n + 1) * 3), idx = new Uint16Array(n * n * 6);
  const axis = new Float32Array(n+1);
  for (let i=0; i<=n; i++) axis[i] = f(2*i/n-1);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const o = (j * (n + 1) + i) * 3;
    pos[o] = axis[i]; pos[o + 1] = 0; pos[o + 2] = axis[j];
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a0 = j * (n + 1) + i, b = a0 + 1, c = a0 + n + 1, d = c + 1;
    const o = (j*n+i)*6;
    idx[o] = a0; idx[o+1] = c; idx[o+2] = b; idx[o+3] = b; idx[o+4] = c; idx[o+5] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(new THREE.BufferAttribute(idx,1));
  return g;
}

// JS twin of the shader's open-sea swell (glsl.js SWELL + VERT_MAIN mask), for surfaceAt()
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function swellAt(x, z, depth, t, cam) {
  const lake = POI.lake;
  const cl = 1 - ss(lake.r - 25, lake.r + 10, Math.hypot(x - lake.x, z - lake.z));
  const md = Math.hypot(x - MOAT.x, z - MOAT.z);
  const calm = Math.max(trialLakeContains(x,z)?1:0,cl, ss(MOAT.r0 - 8, MOAT.r0 + 2, md) * (1 - ss(MOAT.r1 - 2, MOAT.r1 + 10, md)));
  const far = cam ? ss(140, 380, Math.hypot(x - cam.x, z - cam.z)) : 0;
  const k = ss(4, 10, depth) * (1 - calm) * (1 - far);
  if (k <= 0) return 0;
  const a1 = 0.165 * (0.8 * x + 0.6 * z) - 1.27 * t, a2 = 0.262 * (-0.3 * x + 0.954 * z) - 1.60 * t, a3 = 0.419 * (0.954 * x - 0.3 * z) - 2.03 * t;
  return (0.18 * Math.sin(a1) + 0.10 * Math.sin(a2) + 0.05 * Math.sin(a3)) * k;
}

export function createWater(G, { data, noise }) {
  if (G.params?.water === 'legacy') { const w = createLegacyWater(G, { data, noise }); w.stats = () => ({ tier: -1, reflection: false, ms: 0, calls: 0 }); return w; }
  const qn = G.quality?.name || 'high';
  const WQ = qn === 'low' ? 0 : qn === 'med' ? 1 : 2;
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
  const wakes = Array.from({ length: MAX_WAKES }, () => new THREE.Vector4(0, 0, -99, 0));
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); black.needsUpdate = true;
  // phones (core/boot.js QUALITY.mobile): a smaller mirror refreshed less often; off while the frame sheds cost ('perf:lite')
  const mob = !!G.quality?.mobile;
  const refl = new PlanarReflection({ level: SEA_LEVEL, scale: [0.33, 0.45, 0.60][WQ], maxWidth: mob ? 400 : [530, 840, 1280][WQ], detail: WQ });
  const lake = POI.lake;
  const uniforms = {
    wData: { value: data }, wDetail: { value: waterDetailTexture(noise) }, wFlow: { value: flowTexture() },
    wReflTex: { value: refl.rt.texture }, wSkyLow: { value: black }, wSkyHemisphere: { value: black }, wHasHemisphere: { value: 0 },
    wTime: { value: 0 }, wRingK: { value: 0 }, wReflK: { value: 0 }, wSkyK: { value: 0 }, wRain: { value: 0 }, wDebug: { value: 0 },
    wVeil: { value: new THREE.Vector4(VEIL.x, VEIL.z, VEIL.inner, VEIL.outer) },
    wLake: { value: new THREE.Vector4(lake.x, lake.z, lake.r, 0) },
    wMoat: { value: new THREE.Vector4(MOAT.x, MOAT.z, MOAT.r0, MOAT.r1) },
    wTrial: {value:new THREE.Vector4(TRIAL_LAKE.x,TRIAL_LAKE.z,0,TRIAL_LAKE.rz)},
    wAtmosphere:{value:new THREE.Vector2(1,0)}, wWind:{value:1},
    wSunDir: U.mvSunDir, wSunCol: U.mvSunCam, wRingCol: U.mvRingCol,
    wReflMat: { value: refl.textureMatrix }, wViewProj: { value: new THREE.Matrix4() }, wInvViewProj: { value: new THREE.Matrix4() },
    wRipples: { value: ripples }, wWakes: { value: wakes },
    // refraction (round 2): the opaque scene captured just before the water draws (G.post.captureOpaque)
    wRefrTex: { value: black }, wRefrDepth: { value: black }, wRefrK: { value: 0 },
    wScreenInv: { value: new THREE.Vector2(1, 1) }, wNearFar: { value: new THREE.Vector2(0.1, 1000) },
  };
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: 2, transparent: true, depthWrite: true });
  mat.name = 'water';
  // The water shader supplies its own waves and surface colour. Free the triplanar
  // atlas sampler so refraction, the mirror and cloud lighting fit WebGL 2's 16 units.
  mat.defines = { MV_OWN_SURFACE_DETAIL: 1 };
  mat.userData.surface = 'none';
  mat.userData.look = { rim: 0, spec: 0, wrap: 0.5, band: 0, detail: 0, trans: 0 };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fragPars(WQ))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
      .replace('#include <envmap_fragment>', '#include <envmap_fragment>\n' + fragReflect(SUN_ANGULAR_RADIUS * 1.02));
  };
  mat.customProgramCacheKey = () => 'mvWaterPressure7:' + WQ;
  hookMaterial(mat);

  const baseGrid = waterGeometry(WQ === 0 ? 96 : 128);
  const pressureGrid = waterGeometry([120,152,176][WQ],[.65,.54,.48][WQ],4500,12);
  const mesh = new THREE.Mesh(baseGrid, mat);
  mesh.name = 'water';
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = -10;  // first among transparent things: particles above it draw on top, below it are hidden
  mesh.position.y = SEA_LEVEL;
  G.scene.add(mesh);

  // ---- is any water on screen? (the reflection pass is skipped when not) -------------------------------------------
  const _ray = new THREE.Vector3(), _o = new THREE.Vector3();
  let seen = true, seenFrame = 0, rainTick = 0, rainTarget = 0;
  // weight of water samples on a 9x7 screen grid: near water counts fully, far water (where a reflection is a few
  // pixels tall and the sky layer does the job) counts little. The pass runs when the weight passes ~2 samples.
  function waterOnScreen(cam) {
    if (cam.position.y < SEA_LEVEL) return 0;
    const rider = G.player;
    if (heightAt(cam.position.x, cam.position.z) < SEA_LEVEL ||
        (rider && rider.pos.distanceToSquared(cam.position) < 180 * 180 && heightAt(rider.pos.x, rider.pos.z) < SEA_LEVEL)) return 3;
    _o.copy(cam.position);
    let w = 0;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 9; i++) {
      _ray.set(-1 + (i + 0.5) / 9 * 2, -1 + (j + 0.5) / 7 * 2, 0.5).unproject(cam).sub(_o).normalize();
      if (_ray.y > -1e-4) continue;
      const t = (_o.y - SEA_LEVEL) / -_ray.y;
      if (t > 1600) continue;
      const x = _o.x + _ray.x * t, z = _o.z + _ray.z * t;
      if (heightAt(x, z) < SEA_LEVEL + 0.02) w += t < 350 ? 1 : 0.45;
    }
    return w;
  }
  let busy = false, reflSkip = 0;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (busy || camera !== G.camera) return;
    uniforms.wViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    uniforms.wInvViewProj.value.copy(uniforms.wViewProj.value).invert();
    // refraction source: colour + depth of everything drawn before the water (opaque world + farther transparents)
    let cap = null;
    if (WQ > 0 && water.refract) { try { cap = G.post?.captureOpaque?.(renderer); } catch (e) { cap = null; G.reportError?.('water:refract', e); } }
    if (cap) {
      uniforms.wRefrTex.value = cap.color; uniforms.wRefrDepth.value = cap.depth; uniforms.wRefrK.value = 1;
      uniforms.wScreenInv.value.set(1 / cap.width, 1 / cap.height); uniforms.wNearFar.value.set(camera.near, camera.far);
    } else uniforms.wRefrK.value = 0;
    // the reflection normally ran already in beforeScene (before the scene pass); this is the fallback path
    if (!preDone) reflectNow(renderer, scene, camera);
    preDone = false;
  };
  // amortised: refresh every `reflectEvery` frames while the camera moves, every `reflectStill` frames while it is
  // still (the texture keeps the matrix it was drawn with, so a skipped frame shows a reflection one frame old, never a
  // misplaced one)
  let preDone = false;
  const _lastP = new THREE.Vector3(1e9, 0, 0), _lastQ = new THREE.Quaternion();
  function reflectNow(renderer, scene, camera) {
    if (!refl) return;
    // Probe after the orbit/cutscene camera has reached its final pose.
    const moved = _lastP.distanceToSquared(camera.position);
    if (++seenFrame >= 7 || moved > 36 || !refl.frames) {
      seenFrame = 0;
      seen = waterOnScreen(camera) > 0;
    }
    const on = water.reflect && seen && camera.position.y > SEA_LEVEL + 0.004;
    const was = uniforms.wReflK.value > 0;
    if (!on) {
      uniforms.wReflK.value = water.reflect ? Math.max(0, uniforms.wReflK.value - 0.12) : 0;
      return;
    }
    uniforms.wReflK.value = Math.min(1, uniforms.wReflK.value + 0.25);
    if (refl.hero !== G.player?.group) { refl.hero = G.player?.group; refl.skipAge = Infinity; }
    const still = _lastP.distanceToSquared(camera.position) < 4e-4 && Math.abs(_lastQ.dot(camera.quaternion)) > 0.999995;
    const dynamic = G.player?.onBroom && G.player.speed > 0.7;
    if (was && moved < 9 && ++reflSkip < (still && !dynamic ? water.reflectStill : water.reflectEvery)) return;
    reflSkip = 0;
    _lastP.copy(camera.position); _lastQ.copy(camera.quaternion);
    busy = true;
    try { refl.render(renderer, scene, camera, [mesh, G.sky?.mesh]); } catch (e) { uniforms.wReflK.value = 0; G.reportError?.('water:reflect', e); }
    busy = false;
  }

  let rip = 0, wk = 0, wadeT = 0, wakeT = 0, foamT = -Infinity;
  const water = {
    mesh, material: mat, uniforms, level: SEA_LEVEL, reflection: refl,
    /** Planar reflection pass on/off (false falls back to the sky layer). */
    reflect: true,
    /** Screen-space refraction of the bed through the waves (med / high; needs the post pipeline). */
    refract: true,
    /** Reflection refresh interval in frames (1 = every frame). */
    reflectEvery: mob ? 4 : [3, 2, 1][WQ],
    /** Refresh interval while the camera is still (round 3). */
    reflectStill: mob ? 12 : [9, 7, 4][WQ],
    /** Draw the planar reflection now, before the scene pass (called by the sky system with the final camera pose). */
    beforeScene(renderer, camera) {
      if (!refl || camera !== G.camera) return;
      preDone = true;
      camera.updateMatrixWorld();
      reflectNow(renderer, G.scene, camera);
    },
    /** Height of the water surface at (x,z): 0 where there is water (ground below sea level), else -Infinity. */
    levelAt(x, z) { return heightAt(x, z) < SEA_LEVEL ? SEA_LEVEL : -Infinity; },
    /**
     * Visible surface including the sea swell and local pressure field. -Infinity on dry land.
     */
    surfaceAt(x, z) {
      const h = heightAt(x, z);
      if (!(h < SEA_LEVEL)) return -Infinity;
      return SEA_LEVEL + swellAt(x, z, SEA_LEVEL - h, uniforms.wTime.value, G.camera?.position) + flightWake.field.heightAt(x,z);
    },
    kindAt(x,z) {return heightAt(x,z)>=SEA_LEVEL?'land':trialLakeContains(x,z)?'craterLake':G.world.riverDist(x,z)<24?'river':'openWater';},
    /** Water depth at (x,z) in metres (0 on dry land). */
    depthAt(x, z) { return Math.max(0, SEA_LEVEL - heightAt(x, z)); },
    /** Expanding ring on the surface (splash, wading, a cast landing in water). strength 0..1.5. */
    ripple(x, z, strength = 1) {
      if (!(heightAt(x, z) < SEA_LEVEL)) return false;
      const r = ripples[rip]; rip = (rip + 1) % MAX_RIPPLES;
      r.set(x, z, uniforms.wTime.value, Math.min(1.5, Math.max(0.05, strength)));
      return true;
    },
    /** Alias kept for splash hooks: ripple + optional fx. */
    splash(pos, strength = 1) {
      if (water.ripple(pos.x, pos.z, strength)) { G.fx?.burst?.('splash', pos); return true; }
      return false;
    },
    /** One wake ring (used for swimming / low flight; anything moving through the water may call it). */
    wake(x, z, strength = 0.6) {
      if (!(heightAt(x, z) < SEA_LEVEL)) return false;
      wakes[wk].set(x, z, uniforms.wTime.value, Math.min(1.2, Math.max(0.05, strength))); wk = (wk + 1) % MAX_WAKES;
      return true;
    },
    /** { tier, reflection: on/off, ms (CPU, smoothed), calls } of the reflection pass. */
    stats() { return { tier: WQ, reflection: uniforms.wReflK.value > 0, ms: refl ? +refl.ms.toFixed(2) : 0, calls: refl && uniforms.wReflK.value > 0 ? refl.calls : 0 }; },
    update(dt) {
      uniforms.wTime.value += dt;
      const cam = G.camera, c = cam.position;
      uniforms.wRingK.value = U.mvRingK.value;
      uniforms.wTrial.value.z=trialLakeActive()?TRIAL_LAKE.rx:0;
      const skyWeather=G.journeyWeather?.state;
      uniforms.wWind.value=skyWeather?.wind??1;
      uniforms.wAtmosphere.value.set(skyWeather?.sunlight??1,Math.max(skyWeather?.night||0,skyWeather?.eclipse||0));
      if (G.sky?.waterEnvironment) {
        uniforms.wSkyHemisphere.value=G.sky.waterEnvironment;
        uniforms.wHasHemisphere.value=1;
      }
      const low = G.sky?.mesh?.material?.uniforms?.uLow?.value;
      if (low && WQ > 0) { uniforms.wSkyLow.value = low; uniforms.wSkyK.value = 1; }
      if (dt > 0) {
        flightWake.update(dt, uniforms.wTime.value, depthVersion !== data.version);
        depthVersion = data.version;
      }
      const t = G.time?.t ?? 0;
      if (wakeFoam.until > t + 60) wakeFoam.until = -Infinity;   // the clock was reset
      // the broom's foam trail: copied from the shared wake map a few times a second while it lasts
      const foamy = wakeFoam.until > t;
      // (faster while skimming, so the fresh foam joins the whitewater behind the brush)
      if ((foamy || flightWake.field.foamInk) && (t - foamT > (flightWake.strength > .012 ? .12 : .25) || t < foamT)) {
        foamT = t;
        const P = G.player?.pos ?? c;
        flightWake.field.paintFoam(foamy ? plantWake.gMeadowMemory.value?.image?.data : null, plantWake.gMeadowBounds.value, P.x, P.z);
      }
      const hasPressure = flightWake.field.remaining > 0 || flightWake.field.foamInk;
      const gridStep = hasPressure ? .5 : 4;
      mesh.position.x = Math.round(c.x/gridStep)*gridStep;
      mesh.position.z = Math.round(c.z/gridStep)*gridStep;
      mesh.geometry = hasPressure ? pressureGrid : baseGrid;
      // rain
      if (WQ > 0 && --rainTick <= 0) {
        rainTick = 15;
        try { rainTarget = G.elements?.isRainingAt?.(c.x, c.z) ? 1 : 0; } catch (e) { rainTarget = 0; }
      }
      uniforms.wRain.value += (rainTarget - uniforms.wRain.value) * Math.min(1, dt * 0.8);
      // wading / swimming / low broom: rings and wakes
      const P = G.player, p = P?.pos;
      if (p && dt > 0) {
        wadeT -= dt; wakeT -= dt;
        const sp = P.speed ?? 0;
        const inWater = p.y < SEA_LEVEL + 0.4 && heightAt(p.x, p.z) < SEA_LEVEL;
        if (!P.onBroom && wadeT <= 0 && inWater && (sp > 0.6 || P.state === 'swim')) {
          water.ripple(p.x, p.z, sp > 0.6 ? 0.7 : 0.3);
          wadeT = sp > 3 ? 0.4 : 0.7;
        }
        if (wakeT <= 0) {
          if (!P.onBroom && inWater && sp > 0.8) { water.wake(p.x, p.z, 0.55 + Math.min(0.4, sp * 0.08)); wakeT = 0.14; }

        }
      }
    },
  };
  // Survey newly exposed wave cells from the same terrain depth texture the water
  // draws. Bilerp includes the dynamic flooded basin and the latest crater edits.
  const image = data.image, n = image.width, toWorldUV = n/(2*DATA_HALF);
  const fromHalf = THREE.DataUtils.fromHalfFloat;
  function depthForWave(x,z) {
    const u = Math.max(0, Math.min(n-1.0001,(x+DATA_HALF)*toWorldUV-.5));
    const v = Math.max(0, Math.min(n-1.0001,(z+DATA_HALF)*toWorldUV-.5));
    const i = Math.floor(u), j = Math.floor(v), k = 4*(j*n+i), row = 4*n;
    const a = u-i, b = v-j, r = image.data;
    const lo = (1-a)*fromHalf(r[k]) + a*fromHalf(r[k+4]);
    const hi = (1-a)*fromHalf(r[k+row]) + a*fromHalf(r[k+row+4]);
    return SEA_LEVEL - ((1-b)*lo + b*hi);
  }
  let depthVersion = data.version;
  const flightWake = new FlightWake(G, water, WQ, depthForWave);
  uniforms.wPressureMap = { value: flightWake.field.texture };
  uniforms.wPressureRegion = { value: flightWake.field.mapping };
  uniforms.wFoamRegion = { value: flightWake.field.foamMapping };
  water.flightWakeStats = () => flightWake.stats();
  water.impact = (pos, power) => flightWake.impact(pos, power);
  // anything landing in the water makes rings
  G.events.on('element:applied', (e) => { if (e?.pos && Math.abs(e.pos.y - SEA_LEVEL) < 3) water.ripple(e.pos.x, e.pos.z, 0.6 + Math.min(0.8, (e.radius || 1) * 0.08)); });
  G.events.on('physics:impact', (e) => { if (e?.pos && Math.abs(e.pos.y - SEA_LEVEL) < 1.2 && e.speed > 3) water.ripple(e.pos.x, e.pos.z, Math.min(1.2, e.speed * 0.08)); });
  if (mob) G.events.on('perf:lite', (e) => { water.reflect = !(e?.level >= 1); });
  return water;
}
