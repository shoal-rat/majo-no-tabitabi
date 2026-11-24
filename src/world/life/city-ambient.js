// Ambient life of the City of Magic (art round 2, "a living city"): smoke curling from chimneys, paper lanterns
// floating over the squares and the avenues, pigeons pecking round the fountains, cats loafing on the ridges and roof
// terraces with a lazy tail, sparkles in the spell shops' windows, a bookseller's cart that floats beside its shop,
// and warm lit windows that come up when the light goes (eclipse, dusk). Spots come from the builders
// (builders/city-dressing.js CITY_DRESS); everything is instanced, all motion is in the shaders (one time uniform),
// nothing is allocated per frame, and counts scale with the quality tier. Purely visual: no colliders, no save.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { toon, own, glow } from '../../core/mats.js';
import { CITY_LIFE } from '../../data/city-life.js';
import { BELL } from '../../data/bellcrown.js';
import { GeoBuilder, hash01 } from '../builders/city-geo.js';
import { CITY_DRESS } from '../builders/city-dressing.js';

const uTime = { value: 0 },
  uLight = { value: 1 };
const tier = () => (G.quality?.mobile ? 0 : G.quality?.name === 'high' ? 2 : G.quality?.name === 'med' ? 1 : 0);

/** Patch a hooked lit material's vertex stage (runs before the look hook, which chains). */
function animated(base, key, decl, body) {
  const m = own(base);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float aPhase;\n' + decl + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + body);
  };
  m.customProgramCacheKey = () => 'cityAmb:' + key;
  return m;
}
function instanced(geo, m, n, name, shadow = false) {
  const im = new THREE.InstancedMesh(geo, m, Math.max(1, n));
  im.count = n;
  im.frustumCulled = false;
  im.castShadow = false;
  im.receiveShadow = shadow;
  im.name = 'cityAmbient:' + name;
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)), 1));
  return im;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function place(im, i, x, y, z, yaw, s = 1, phase = 0) {
  _q.setFromEuler(_e.set(0, yaw, 0));
  im.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(s, s, s)));
  im.geometry.attributes.aPhase.setX(i, phase);
}

// ---------------------------------------------------------------- smoke (camera-facing puffs, rising and fading)
function smoke(spots, perSpot) {
  const n = spots.length * perSpot;
  if (!n) return null;
  const geo = new THREE.PlaneGeometry(1, 1);
  const m = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime, uLight },
    vertexShader: `uniform float uTime; attribute float aPhase; varying float vT; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){
        float t = fract(uTime * 0.085 + aPhase);
        vec3 o = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sway = sin(uTime * 0.7 + aPhase * 40.0) * 0.35 * t;
        o += vec3(1.6 * t + sway, 5.5 * t, 0.9 * t - sway * 0.5);
        float sz = mix(0.45, 1.9, t);
        vec4 mv = viewMatrix * vec4(o, 1.0);
        mv.xy += position.xy * sz;
        vT = t; vUv = uv;
        gl_Position = projectionMatrix * mv;
        vec4 mvPosition = mv;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uLight; varying float vT; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.35, 1.0, r)) * smoothstep(0.0, 0.12, vT) * (1.0 - vT) * 0.42;
        if (a < 0.01) discard;
        vec3 c = mix(vec3(0.55, 0.55, 0.6), vec3(0.93, 0.92, 0.9), uLight) * (0.92 + 0.08 * (1.0 - r));
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true
  });
  const im = instanced(geo, m, n, 'smoke');
  let i = 0;
  for (const [x, y, z, fl] of spots) for (let k = 0; k < perSpot; k++, i++) place(im, i, x + (fl > 1 ? ((k % fl) - (fl - 1) / 2) * 0.68 : 0), y, z, 0, 1, k / perSpot + hash01(x, z) * 0.37);
  return im;
}

// ---------------------------------------------------------------- floating paper lanterns
function lanterns(spots) {
  if (!spots.length) return null;
  const b = new GeoBuilder();
  b.lathe([[0.001, -0.3], [0.12, -0.28], [0.22, -0.12], [0.24, 0.05], [0.2, 0.22], [0.11, 0.3], [0.001, 0.31]], 8);
  const m = glow(0xffb45c, 2.1).clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float aPhase;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.y += sin(uTime * 0.55 + aPhase * 6.28) * 0.45;
      transformed.x += sin(uTime * 0.31 + aPhase * 11.0) * 0.25;`);
  };
  m.customProgramCacheKey = () => 'cityAmb:lantern';
  const geo = b.geometry(),
    im = instanced(geo, m, spots.length, 'lanterns');
  spots.forEach(([x, y, z], i) => place(im, i, x, y, z, 0, 0.9 + 0.3 * hash01(x, z), hash01(z, x)));
  return im;
}

// ---------------------------------------------------------------- pigeons round the fountains
function pigeons(spots, per) {
  const n = spots.length * per;
  if (!n) return null;
  const b = new GeoBuilder(true), body = new THREE.Color(0x8d929c), neck = new THREE.Color(0x6f8a8a), beak = new THREE.Color(0xd8a05a);
  b.colour(body);
  const shell = new GeoBuilder();
  shell.lathe([[0.001, -0.14], [0.055, -0.1], [0.07, 0.0], [0.055, 0.08], [0.001, 0.11]], 5);
  b.append(shell, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.1, 0));
  b.colour(neck);
  const head = new GeoBuilder();
  head.lathe([[0.001, -0.04], [0.035, -0.02], [0.03, 0.03], [0.001, 0.045]], 5);
  b.append(head, new THREE.Matrix4().makeTranslation(0, 0.2, 0.1));
  b.colour(beak);
  b.tri([-0.008, 0.2, 0.14], [0.008, 0.2, 0.14], [0, 0.195, 0.17], [0, 0.3, 1]);
  b.colour(body.clone().multiplyScalar(0.7));
  b.tri([-0.05, 0.12, -0.12], [0.05, 0.12, -0.12], [0, 0.1, -0.24], [0, 1, 0]);
  const m = animated(toon(0xffffff, { vertexColors: true, surface: 'none' }), 'pigeon', '', `
      float pk = pow(max(0.0, sin(uTime * 2.3 + aPhase * 37.0)), 6.0);
      if (position.z > 0.05) { float a = pk * 0.9; float yy = transformed.y - 0.12; float zz = transformed.z - 0.05;
        transformed.y = 0.12 + yy * cos(a) - zz * sin(a); transformed.z = 0.05 + yy * sin(a) + zz * cos(a); }`);
  const im = instanced(b.geometry(), m, n, 'pigeons', true);
  let i = 0;
  for (const [x, y, z, r] of spots)
    for (let k = 0; k < per; k++, i++) {
      const a = hash01(x + k, z) * 6.28, onRim = k % 3 === 0, rr = onRim ? r - 0.15 : r + 0.8 + 3.5 * hash01(k, x);
      place(im, i, x + Math.sin(a) * rr, y + (onRim ? 1.03 : 0), z + Math.cos(a) * rr, a + (hash01(k, z) - 0.5) * 2, 1, hash01(k, x + z));
    }
  return im;
}

// ---------------------------------------------------------------- cats on the roofs
function cats(spots) {
  if (!spots.length) return null;
  const b = new GeoBuilder(true), fur = new THREE.Color(1, 1, 1), ear = new THREE.Color(0.85, 0.72, 0.72);
  b.colour(fur);
  const loaf = new GeoBuilder();
  loaf.lathe([[0.001, -0.2], [0.09, -0.17], [0.12, 0.0], [0.1, 0.14], [0.001, 0.2]], 7);
  b.append(loaf, new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(new THREE.Matrix4().makeScale(1, 0.85, 1)).setPosition(0, 0.1, 0));
  const head = new GeoBuilder();
  head.lathe([[0.001, -0.07], [0.07, -0.04], [0.075, 0.02], [0.05, 0.065], [0.001, 0.075]], 7);
  b.append(head, new THREE.Matrix4().makeTranslation(0, 0.2, 0.17));
  b.colour(ear);
  for (const s of [-1, 1]) b.tri([s * 0.02, 0.255, 0.17], [s * 0.06, 0.255, 0.15], [s * 0.045, 0.31, 0.16], [0, 0, 1]);
  b.colour(fur);
  const tail = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; tail.push([0.1 * Math.sin(t * 2.4), 0.03 + 0.05 * t, -0.18 - 0.2 * t]); }
  b.tube(tail, 0.022, 4);
  const geo = b.geometry();
  const m = animated(toon(0xffffff, { vertexColors: true, surface: 'none', look: { rim: 0.4 } }), 'cat', '', `
      if (position.z < -0.17) { float w = clamp((-position.z - 0.17) / 0.22, 0.0, 1.0);
        transformed.x += sin(uTime * 1.3 + aPhase * 20.0 + w * 2.0) * 0.09 * w; }
      if (position.y > 0.14 && position.z > 0.1) { float a = sin(uTime * 0.37 + aPhase * 9.0) * 0.35;
        float x0 = transformed.x, z0 = transformed.z - 0.17; transformed.x = x0 * cos(a) + z0 * sin(a); transformed.z = 0.17 - x0 * sin(a) + z0 * cos(a); }`);
  const im = instanced(geo, m, spots.length, 'cats', true);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);
  const coats = [0xe39a52, 0x2c2a2e, 0x9a9aa2, 0xf2ede4, 0x7a5a3e].map((c) => new THREE.Color(c));
  spots.forEach(([x, y, z, yaw], i) => {
    place(im, i, x, y, z, yaw, 1.6, hash01(x, z));
    im.setColorAt(i, coats[Math.floor(hash01(z, x) * coats.length)]);
  });
  return im;
}

// ---------------------------------------------------------------- sparkles at the spell shops
function glints(spots, per) {
  const n = spots.length * per;
  if (!n) return null;
  const geo = new THREE.PlaneGeometry(1, 1);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `uniform float uTime; attribute float aPhase; varying vec2 vUv; varying float vA;
      void main(){
        float t = fract(uTime * 0.35 + aPhase);
        vec3 o = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        o.y += t * 0.5;
        vec4 mv = viewMatrix * vec4(o, 1.0);
        float s = 0.18 * sin(t * 3.14159);
        mv.xy += position.xy * s;
        vUv = uv; vA = sin(t * 3.14159);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec2 vUv; varying float vA;
      void main(){
        vec2 d = abs(vUv - 0.5) * 2.0;
        float star = max(1.0 - smoothstep(0.0, 0.12, d.x) * 1.0, 0.0) * (1.0 - d.y) + max(1.0 - smoothstep(0.0, 0.12, d.y), 0.0) * (1.0 - d.x);
        float a = clamp(star, 0.0, 1.0) * vA;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.65) * 2.2 * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const im = instanced(geo, m, n, 'glints');
  let i = 0;
  for (const [x, y, z] of spots) for (let k = 0; k < per; k++, i++) place(im, i, x + (hash01(k, x) - 0.5) * 1.2, y + (hash01(x, k) - 0.5) * 0.8, z + 0.15, 0, 1, k / per + hash01(z, k) * 0.3);
  return im;
}

// ---------------------------------------------------------------- the floating book cart
function bookCarts(spots) {
  if (!spots.length) return null;
  const b = new GeoBuilder(true), wood = new THREE.Color(0x6e4c38), cols = [0x9e3b35, 0x3d5f8c, 0xd9b45a, 0x6c9a52, 0xe8dfcc].map((c) => new THREE.Color(c));
  b.colour(wood);
  b.box(-0.5, 0, -0.28, 0.5, 0.08, 0.28);
  for (const s of [-1, 1]) b.box(s * 0.5 - 0.03, 0.08, -0.28, s * 0.5 + 0.03, 0.3, 0.28);
  for (let k = 0; k < 8; k++) { b.colour(cols[k % 5]); b.box(-0.44 + k * 0.11, 0.08, -0.18, -0.36 + k * 0.11, 0.3 + 0.06 * (k % 3), 0.18); }
  b.colour(cols[0]);
  b.box(-0.12, 0.42, -0.14, 0.14, 0.47, 0.16);
  const m = animated(toon(0xffffff, { vertexColors: true, surface: 'wood', look: { detail: 0.4 } }), 'cart', '', `
      float bob = sin(uTime * 0.9 + aPhase * 6.28);
      float rk = sin(uTime * 0.6 + aPhase * 3.0) * 0.06;
      transformed.y += 0.75 + bob * 0.12 + transformed.x * rk;
      if (position.y > 0.4) { transformed.y += 0.25 + sin(uTime * 1.7 + aPhase) * 0.08; transformed.x += sin(uTime * 0.8) * 0.1; }`);
  const im = instanced(b.geometry(), m, spots.length, 'bookCart', true);
  spots.forEach(([x, y, z, yaw], i) => place(im, i, x, y, z, yaw, 1, hash01(x, z)));
  return im;
}

// ---------------------------------------------------------------- warm windows
function warmWindows(spots) {
  if (!spots.length) return null;
  const geo = new THREE.PlaneGeometry(0.64, 1.98);
  geo.translate(0, 1.66, 0.0215);
  const m = new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  m.toneMapped = false;
  const im = new THREE.InstancedMesh(geo, m, spots.length);
  im.frustumCulled = false;
  im.name = 'cityAmbient:windows';
  spots.forEach(([x, y, z, yaw, sx], i) => {
    _q.setFromEuler(_e.set(0, yaw, 0));
    im.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, 1, 1)));
  });
  return im;
}

// ---------------------------------------------------------------- runtime
let S = null;
/**
 * Called by mage-city.js layoutHouses (ctx.tick): the meshes are made on the first tick after the city is baked
 * (CITY_LIFE.ready), when every spot is known.
 */
export function startAmbient(ctx) {
  if (S) return;
  S = { built: false, group: null, wm: null, d2: 0 };
  ctx.tick(tick);
}
function build() {
  const T = tier(), D = CITY_DRESS, g = new THREE.Group();
  g.name = 'city-ambient';
  const pick = (arr, k) => arr.filter((_, i) => i % k === 0);
  // phones and the low tier: smoke from a third of the chimneys and the pigeons only (two draws)
  const parts = T
    ? [smoke(D.smoke, T === 2 ? 6 : 4), lanterns(D.lanterns), pigeons(D.pigeons, T === 2 ? 18 : 12), cats(D.cats), glints(D.glints, 5), bookCarts(D.books), (S.wm = warmWindows(D.windows))]
    : [smoke(pick(D.smoke, 3), 3), pigeons(D.pigeons, 6)];
  for (const p of parts) if (p) g.add(p);
  G.scene.add(g);
  S.group = g;
  S.built = true;
  if (G.structures) G.structures.cityAmbient = () => Object.fromEntries(g.children.map((c) => [c.name, c.count]));
}
function tick(dt) {
  if (!S) return;
  if (!S.built) {
    if (CITY_LIFE.ready) build();
    return;
  }
  uTime.value = (uTime.value + (dt || 0)) % 3600;
  const cam = G.camera;
  if (!cam) return;
  const e = cam.matrixWorld.elements, dx = e[12] - (BELL.x - 2), dz = e[14] - (BELL.z - 90);
  const near = dx * dx + dz * dz < 420 * 420;
  if (S.group.visible !== near) S.group.visible = near;
  if (!near) return;
  const light = G.env?.light ?? 1;
  uLight.value = light;
  if (S.wm) {
    const k = Math.min(1, Math.max(0, (0.72 - light) / 0.4));
    S.wm.visible = k > 0.01;
    S.wm.material.opacity = 0.85 * k;
  }
}
