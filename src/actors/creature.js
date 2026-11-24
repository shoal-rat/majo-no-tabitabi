// Small rig for the non-humanoid mon_* / ani_* models (enemies, bosses, wildlife) and the hand-built monsters.
//
//   const c = acquireCreature('ani_wolf', { scale: 1.3, tint: 'shade' });   // pooled; c.release() gives it back
//   c.place(x, y, z, yaw);  c.play('move');  c.play('attack', { once: true, onDone });  c.update(dt);
//
// Clip states come from the manifest notes ("Clip use: idle=…, move=…, attack=…, hit=…, death=…"), matched by substring
// against the model's clip names; opts.clips overrides / adds states (e.g. { run: 'Gallop', eat: 'Eating' }).
// Tints: 'shade' (near-black violet body, glowing eyes), 'paper' (washi white, ink eyes), 'stone', { color, emissive }, null.
// Facing: the models look down +z; group.rotation.y = yaw with facing (sin yaw, cos yaw), like the player.
//
// Upgrade 3 (docs/api/life.md, actors-look.md "Creatures"):
//   group (place / yaw) -> body (procedural motion: breath, squash & stretch, banking, lean, recoil, tell) -> model (clips;
//   game code may still scale / offset the model). Every creature renders with its own "fx" clones of its materials (same
//   programs): flash, spawn (rises out of an ink blot) and death (style per body: paper burns from the edges, shade
//   evaporates upward, slime splats and soaks in, stone crumbles) are uniform changes — no material swap, no pop.
//   Quadruped rigs (Head / Ear* / Tail*) get ear flicks, a sprung tail, a head that looks up at the heroine.
//   Hand-built monsters: makeJelly (影团), makeHitogata (纸魅), makeWispFlame (鬼火) — pass as opts.primitive.
//   ?crv=1 = the pre-upgrade-3 creature look (no motion layer, flat flash, additive dissolve) for A/B shots.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { toon, glow, PAL, hookMaterial, toonGradient } from '../core/mats.js';
import { makeActorShadowBlob } from './rig.js';
import { updateCelGlobals, CEL_U, buildOutlines, outlineMaterial, sameBones, harmonize } from './celmat.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, angleDiff, TAU } from '../core/util.js';

const pools = new Map();
const useCache = new Map();
let flashMat = null;
const OLD = () => G.params?.crv === '1';

/** Parse "Clip use: idle=X, move=Y (…)" from the manifest notes into { idle:'X', move:'Y' }. */
function clipUse(id) {
  if (useCache.has(id)) return useCache.get(id);
  const out = {};
  const notes = G.assets?.info(id)?.notes || '';
  const m = /Clip use:([^.]*)\./.exec(notes);
  if (m) for (const part of m[1].split(',')) {
    const kv = part.split('=');
    if (kv.length < 2) continue;
    const k = kv[0].trim(), v = kv[1].trim().split(/[\s/(]/)[0];
    if (k && v) out[k] = v;
  }
  useCache.set(id, out);
  return out;
}

function findClip(clips, name) {
  if (!name) return null;
  let c = clips.find((x) => x.name === name);
  if (!c) c = clips.find((x) => x.name.endsWith('|' + name) || x.name.endsWith('_' + name));
  if (!c) c = clips.find((x) => x.name.includes(name));
  return c || null;
}

// cel-shaded tints share one clone per (source material, tint) so pooled creatures do not multiply materials
const celTints = new WeakMap();
function celTint(src, key, make) {
  let m = celTints.get(src);
  if (!m) celTints.set(src, (m = new Map()));
  let t = m.get(key);
  if (!t) { t = src.clone(); t.userData.shared = true; make(t); hookMaterial(t); m.set(key, t); }
  return t;
}

function tintMaterial(src, tint, eyeColor) {
  const name = (src && src.name) || '';
  const eye = /eye/i.test(name);
  const pupil = eye && /black|pupil|dark/i.test(name);
  if (src && src.isCelMaterial && !eye && (tint === 'shade' || tint === 'paper' || tint === 'stone')) {
    // living darkness / washi / stone that keep the cel ramp, rim and outline of the body
    return celTint(src, tint, (t) => {
      t.map = null;
      if (t.emissive) { t.emissive.set(0x000000); t.emissiveMap = null; }
      if (tint === 'shade') {
        // deep violet with a living edge: shade bodies are lit by the land like everything else, the rim breathes violet
        const wing = /wing/i.test(name), belly = /belly|light/i.test(name);
        t.color.set(wing ? 0x2a1650 : belly ? 0x2c1a52 : 0x1f1238);
        t.celU.uShadeTint.value.setRGB(0.36, 0.26, 0.7);
        t.celU.uCelP.value.z = 0.75;
        t.setSpirit(wing ? 0xb070ff : 0x9a4cff, 1.0);
      } else if (tint === 'paper') {
        t.color.set(PAL.paper);
        t.celU.uShadeTint.value.setRGB(0.78, 0.74, 0.86);
        t.emissive.set(0x30261a);
      } else {
        // carved stone: grey-violet with painted grain, cool shade, faint cyan veins in the edge glow
        t.color.set(0x8a86a0);
        if (src.userData.sculpt === 'stone') {   // re-sculpted golem: painted stone + moss in the vertex colours, glowing seams
          t.color.set(0xe6e2f2); t.emissive.set(0xffffff); t.emissiveMap = src.emissiveMap; t.emissiveIntensity = 1.3;
        }
        t.celU.uShadeTint.value.setRGB(0.46, 0.5, 0.8);
        t.celU.uCelG.value.x = 0.22;
        if (src.userData.sculpt !== 'stone') t.emissive.set(0x0a0e1e);
        t.setSpirit(0x6ff3ff, 0.32);
      }
    });
  }
  if (tint === 'shade') {
    // fix2: eyes read as coloured embers, not light bulbs (the whole eye disc at 3.4 bloomed to white on bosses)
    if (eye && !pupil) return glow(eyeColor ?? PAL.shadeEye, 1.5);
    if (pupil) return glow(eyeColor ?? PAL.shadeEye, 2.4);
    if (/wing/i.test(name)) return toon(0x2a1450, { emissive: 0x4a1f8a });
    return toon(PAL.shade, { emissive: 0x2a1048 });
  }
  if (tint === 'paper') {
    if (eye && !pupil) return toon(PAL.paper);
    if (pupil) return toon(0x2b2238);
    return toon(PAL.paper, { emissive: 0x30261a });
  }
  if (tint === 'stone') {
    if (eye) return glow(eyeColor ?? PAL.glowCyan, 3);
    return toon(0x6f6c88, { emissive: 0x0e1226 });
  }
  if (tint && typeof tint === 'object') {
    if (eye && tint.eyes != null) return glow(tint.eyes, 3);
    const c = src.clone(); c.userData.shared = false;
    hookMaterial(c);
    if (tint.color != null && c.color) c.color.multiply(new THREE.Color(tint.color));
    if (tint.emissive != null && c.emissive) { c.emissive.set(tint.emissive); c.emissiveIntensity = tint.emissiveIntensity ?? 0.6; }
    return c;
  }
  return src;
}

// ---- fx clones: flash / spawn / death dissolve as uniforms on the creature's own materials -----------------------------
// uFx: x dissolve threshold (0 = whole, 1 = gone), y flash, z tell glow, w eye blink (unused in GLSL)
// uFxC: rgb burning-edge colour, a edge width.   uFxM: gradient weights (top-down, bottom-up, outer-in, noise mix).
// uFxB: x body bottom, y body height, z body radius, w noise frequency.   uFxO: xyz creature origin, w yaw.
const FX_VERT_PARS = /* glsl */`
uniform vec4 uFxO;
varying vec3 vFxP;
`;
const FX_VERT = /* glsl */`
{
  vec3 fxW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz - uFxO.xyz;
  float fxc = cos( uFxO.w ), fxs = sin( uFxO.w );
  vFxP = vec3( fxc * fxW.x - fxs * fxW.z, fxW.y, fxs * fxW.x + fxc * fxW.z );
}
`;
const FX_FRAG_PARS = /* glsl */`
uniform vec4 uFx, uFxC, uFxM, uFxB, uFxT;
varying vec3 vFxP;
float fxH3( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float fxVN( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( fxH3( i ), fxH3( i + vec3( 1, 0, 0 ) ), f.x ), mix( fxH3( i + vec3( 0, 1, 0 ) ), fxH3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( fxH3( i + vec3( 0, 0, 1 ) ), fxH3( i + vec3( 1, 0, 1 ) ), f.x ), mix( fxH3( i + vec3( 0, 1, 1 ) ), fxH3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`;
const FX_FRAG_BEGIN = /* glsl */`
  float fxEdge = 0.0;
  if ( uFx.x > 0.0 ) {
    vec3 fq = vFxP * uFxB.w;
    float fn = fxVN( fq ) * 0.65 + fxVN( fq * 2.7 + 3.1 ) * 0.35;
    float fh = clamp( ( vFxP.y - uFxB.x ) / max( uFxB.y, 1e-3 ), 0.0, 1.0 );
    float fr = clamp( length( vFxP.xz ) / max( uFxB.z, 1e-3 ), 0.0, 1.0 );
    float fg = clamp( uFxM.x * ( 1.0 - fh ) + uFxM.y * fh + uFxM.z * ( 1.0 - fr ), 0.0, 1.0 );
    float fv = mix( fn, fg, uFxM.w );
    float fd = fv - uFx.x * ( 1.0 + uFxC.a );
    if ( fd < 0.0 ) discard;
    fxEdge = 1.0 - smoothstep( 0.0, max( uFxC.a, 1e-3 ), fd );
  }
`;
const FX_FRAG_END = /* glsl */`
  gl_FragColor.rgb = mix( gl_FragColor.rgb, uFxT.rgb, clamp( uFx.z, 0.0, 1.0 ) * 0.4 );
  gl_FragColor.rgb += uFxC.rgb * fxEdge * fxEdge * 2.2;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 1.5, 1.42, 1.48 ), clamp( uFx.y, 0.0, 1.0 ) * 0.72 );
`;
function injectFx(sh, U) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + FX_VERT_PARS)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + FX_VERT);
  let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FX_FRAG_PARS)
    .replace('void main() {', 'void main() {\n' + FX_FRAG_BEGIN);
  const end = f.lastIndexOf('}');
  f = f.slice(0, end) + FX_FRAG_END + f.slice(end);
  sh.fragmentShader = f;
}
function fxUniforms() {
  return {
    uFx: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFxC: { value: new THREE.Vector4(1, 0.5, 0.2, 0.12) },
    uFxM: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFxB: { value: new THREE.Vector4(0, 1, 1, 3) },
    uFxO: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFxT: { value: new THREE.Vector4(1, 0.3, 0.4, 0) },
    uJig: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
}
// hand-built materials keep their own shader patch here (Material.clone() does not copy onBeforeCompile)
const basePatch = new WeakMap();
/** Per-creature clone of a material with the fx uniforms (same program for every creature of a kind). */
function fxClone(src, U) {
  if (!src || src.userData?.noFx) return src;
  const m = src.clone();
  m.userData = { ...src.userData, shared: false, fxOf: src };
  const reg = basePatch.get(src);
  const base = reg ? reg.fn : Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') ? m.onBeforeCompile : null;
  const baseKey = reg ? () => reg.key : Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') ? m.customProgramCacheKey : null;
  m.onBeforeCompile = function (sh, r) { Object.assign(sh.uniforms, U); if (base) base.call(this, sh, r); injectFx(sh, U); };
  m.customProgramCacheKey = function () { return (baseKey ? baseKey.call(this) : '') + '|crfx2'; };
  if (!m.isMeshBasicMaterial && !m.isShaderMaterial) hookMaterial(m);
  return m;
}

// death / spawn styles: gradient weights, edge colour + width, noise frequency, how the body moves
const STYLES = {
  shade: { m: [0, 0.75, 0, 0.55], c: 0xb070ff, w: 0.16, f: 4.2 },     // evaporates upward into motes
  paper: { m: [0, 0, 1.0, 0.6], c: 0xff8a2a, w: 0.1, f: 9 },          // burns from the edges inward
  slime: { m: [0, 0.9, 0, 0.45], c: 0x9a4cff, w: 0.14, f: 5 },        // splats, then soaks in from the top
  stone: { m: [0.7, 0, 0, 0.35], c: 0x6ff3ff, w: 0.08, f: 6 },        // crumbles from the feet up
  light: { m: [0, 0.4, 0, 0.3], c: 0xffe6a8, w: 0.12, f: 5 },
};
const INK = new THREE.Color(0x2a1048);

// ---- quadruped bone life -------------------------------------------------------------------------------------------------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0);
function boneRig(model) {
  let head = null, neck = null;
  const ears = [], tail = [];
  model.traverse((o) => {
    if (!o.isBone) return;
    const n = o.name;
    if (!head && /^Head$/.test(n)) head = o;
    else if (!neck && /^Neck3$|^Neck$/.test(n)) neck = o;
    else if (/^Ear1\.[LR]$/.test(n)) ears.push(o);
    else if (/^Tail[1-8]$/.test(n)) tail.push(o);
  });
  if (!head && !tail.length && !ears.length) return null;
  tail.sort((a, b) => a.name.localeCompare(b.name));
  model.updateMatrixWorld(true);
  _m4.copy(model.matrixWorld).invert();
  const mk = (b) => {
    // creature-space up / side axes expressed in the bone's local frame at the bind pose
    b.getWorldQuaternion(_q); _q2.setFromRotationMatrix(model.matrixWorld).invert(); _q.premultiply(_q2).invert();
    return { b, rest: b.quaternion.clone(), up: UP.clone().applyQuaternion(_q).normalize(), side: SIDE.clone().applyQuaternion(_q).normalize() };
  };
  return { head: head && mk(head), neck: neck && mk(neck), ears: ears.map(mk), tail: tail.map(mk),
    earT: 1 + Math.random() * 3, earK: 0, earS: 1, tailA: 0, tailV: 0, lookY: 0, lookP: 0 };
}
function rot(j, axis, a) { if (a) { _q.setFromAxisAngle(axis, a); j.b.quaternion.multiply(_q); } }

// ---- hand-built monsters --------------------------------------------------------------------------------------------------
let _jellyGeo = null, _jellyMat = null, _coreMat = null, _emberMat = null, _emberHot = null;
const JELLY_VERT_PARS = /* glsl */`
uniform vec4 uJig;      // x: squash (+ tall / - flat), y,z: lean x/z, w: wobble energy
uniform float uCelTime;
float jH( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float jN( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( jH( i ), jH( i + vec3( 1, 0, 0 ) ), f.x ), mix( jH( i + vec3( 0, 1, 0 ) ), jH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( jH( i + vec3( 0, 0, 1 ) ), jH( i + vec3( 1, 0, 1 ) ), f.x ), mix( jH( i + vec3( 0, 1, 1 ) ), jH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
`;
const JELLY_VERT = /* glsl */`
{
  float hy = clamp( transformed.y / 0.62, 0.0, 1.0 );
  float n = jN( transformed * 3.2 + vec3( 0.0, uCelTime * 0.9, uCelTime * 0.4 ) ) - 0.5;
  float wob = sin( uCelTime * 5.5 + transformed.y * 7.0 ) * 0.5 + 0.5;
  transformed += objectNormal * n * ( 0.05 + 0.05 * uJig.w ) * hy;
  transformed.y *= 1.0 + uJig.x;
  transformed.xz *= 1.0 - uJig.x * 0.5 + 0.025 * wob * hy;
  transformed.xz += uJig.yz * hy * hy;
}
`;
function jellyGeometry() {
  if (_jellyGeo) return _jellyGeo;
  const g = new THREE.IcosahedronGeometry(0.5, 7);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // a soft drop: flat sole, round shoulders, a slightly pinched crown
    if (y < -0.08) y = -0.08 + (y + 0.08) * 0.22;
    const t = clamp((y + 0.1) / 0.6);
    const pinch = 1 - 0.18 * t * t;
    x *= pinch * 1.08; z *= pinch * 1.08;
    y = y + 0.12 + 0.06 * t * t;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  _jellyGeo = g;
  return g;
}
function jellyMaterial() {
  if (_jellyMat) return _jellyMat;
  const m = new THREE.MeshToonMaterial({ color: 0x2a1650, transparent: true, opacity: 0.9, emissive: 0x12062a });
  m.userData.surface = 'none';
  m.userData.look = { rim: 0.6, wrap: 0.55, shadowTint: 1 };
  m.userData.shared = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCelTime = CEL_U.uCelTime;
    if (!sh.uniforms.uJig) sh.uniforms.uJig = { value: new THREE.Vector4() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + JELLY_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + JELLY_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCelTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        // translucent jelly: see-through in the middle, dense at the silhouette; a living violet edge that crawls upward
        vec3 jN = normalize( normal ); vec3 jV = normalize( vViewPosition );
        float fr = 1.0 - clamp( abs( dot( jN, jV ) ), 0.0, 1.0 );
        float crawl = 0.75 + 0.25 * sin( uCelTime * 3.0 - vViewPosition.y * 6.0 + fr * 4.0 );
        totalEmissiveRadiance += vec3( 0.62, 0.3, 1.0 ) * ( smoothstep( 0.45, 1.0, fr ) * 0.85 * crawl + 0.04 );
        diffuseColor.a *= mix( 0.62, 1.0, smoothstep( 0.15, 0.85, fr ) );
      }`);
  };
  m.customProgramCacheKey = () => 'jelly1';
  basePatch.set(m, { fn: m.onBeforeCompile, key: 'jelly1' });
  hookMaterial(m);
  _jellyMat = m;
  return m;
}
/** 影团: a translucent shade jelly with an inner ember core, wobbling, with ember eyes. ~1k triangles. */
export function makeJelly() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(jellyGeometry(), jellyMaterial());
  body.renderOrder = 2;
  body.name = 'JellyBody';
  if (!_coreMat) {
    _coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc070ff).multiplyScalar(1.6), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    _coreMat.userData.shared = true;
    _emberMat = glow(0xff5a3c, 2.2);
    _emberHot = glow(0xffd0a0, 3.2);
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 2), _coreMat);
  core.position.set(0, 0.3, -0.02); core.renderOrder = 1; core.name = 'JellyCore';
  core.castShadow = false;
  g.add(core, body);
  for (const s of [-1, 1]) {
    const eye = new THREE.Group(); eye.name = 'Eye';
    const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), _emberMat); e1.scale.set(1.1, 0.75, 0.5);
    const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), _emberHot); e2.position.set(0.012 * s, 0.01, 0.022);
    eye.add(e1, e2);
    eye.position.set(0.13 * s, 0.4, 0.44); eye.rotation.y = 0.28 * s; eye.rotation.z = -0.25 * s;
    g.add(eye);
  }
  g.userData.creature = { motion: 'jelly', style: 'slime', outline: false, h: 0.68, r: 0.55 };
  return g;
}

// 泥沼团 mud spirit (round art-creatures; the bog foe, combat/beasts.js TYPES.blob): a soft wet mound of bog mud — round
// shoulders, a skirt that spreads into its own puddle, drips running down as real lumps, a little pond on its crown with
// reeds and the spirit's warm amber heart glowing in it, big eyes set into the face as shapes, a small mouth. The baked
// crust (fire) is the same mound in pale cracked clay. Sizes as the old mound (0.83 tall, 0.6 round); one draw for the
// body, the crust is hidden until baked. Tessellation by tier (built once).
let _mudGeo = null, _crustGeo = null, _mudMats = null, _reedGeo = null, _eyeParts = null;
const MUD_DRIPS = [[0.4, 0.42, 0.05], [1.35, 0.5, 0.045], [2.2, 0.36, 0.05], [3.05, 0.47, 0.04], [3.9, 0.4, 0.05], [4.8, 0.52, 0.045], [5.6, 0.38, 0.04]];
function mudProfile(y) {   // radius of the mound at height y (0 .. 0.83)
  const t = clamp(y / 0.83, 0, 1);
  const dome = Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2))) * (0.56 - 0.06 * t);
  const skirt = 0.11 * Math.exp(-y * 26);   // the puddle skirt at the foot
  return dome + skirt;
}
function mudGeometry(crust) {
  const lo = !!G.quality?.mobile || G.quality?.name === 'low';
  const NS = lo ? 30 : 46, NR = lo ? 18 : 30;
  const P = [], C = [], I = [];
  const top = new THREE.Color(0xa47b52), mid = new THREE.Color(0x7d5434), low = new THREE.Color(0x4b3020), wet = new THREE.Color(0x5a3a22), sheen = new THREE.Color(0xd9bc92);
  const clay = new THREE.Color(0xe2c79c), clayDark = new THREE.Color(0x8a6a48), c = new THREE.Color();
  for (let r = 0; r <= NR; r++) {
    // rings bunch toward the foot (skirt) and the crown (pond rim)
    const u = r / NR, y = 0.83 * (1 - Math.pow(1 - u, 1.35));
    for (let k = 0; k <= NS; k++) {
      const a = (k / NS) * TAU;
      let R = mudProfile(y);
      // drips: raised runnels down the sides ending in a round bead above the skirt
      let drip = 0;
      for (const [da, len, w] of MUD_DRIPS) {
        const dA = Math.atan2(Math.sin(a - da), Math.cos(a - da)) * R;
        const yEnd = 0.62 - len, yy = (y - yEnd) / len;
        if (yy > -0.25 && yy < 1) { const bead = yy < 0.15 ? Math.exp(-Math.pow((yy - 0.02) / 0.12, 2)) * 1.6 : 1; drip = Math.max(drip, Math.exp(-Math.pow(dA / (w * (yy < 0.15 ? 1.3 : 1)), 2)) * bead * (1 - Math.max(0, yy - 0.7) / 0.3)); }
      }
      R += drip * 0.035;
      // soft lumps (low frequency) and a wavy skirt edge
      R += 0.012 * Math.sin(a * 3 + 1.3) * Math.sin(y * 9) + (y < 0.06 ? 0.02 * Math.sin(a * 5 + 0.7) * (1 - y / 0.06) : 0);
      // the crown pond: a shallow dish on top
      let yy = y;
      if (y > 0.74) { const k2 = (y - 0.74) / 0.09; yy = y - 0.05 * Math.sin(Math.min(1, k2) * Math.PI * 0.5) * k2; }
      const sq = crust ? 1.035 : 1;
      P.push(Math.sin(a) * R * sq, yy * (crust ? 1.02 : 1), Math.cos(a) * R * sq);
      if (!crust) {
        c.copy(low).lerp(mid, smooth01(y / 0.3)).lerp(top, smooth01((y - 0.35) / 0.4));
        c.lerp(wet, drip * 0.7);
        // the wet sheen: a pale streak on the upper front shoulder
        const sh = Math.exp(-Math.pow(Math.atan2(Math.sin(a - 0.5), Math.cos(a - 0.5)) / 0.35, 2)) * Math.exp(-Math.pow((y - 0.6) / 0.07, 2));
        c.lerp(sheen, sh * 0.85);
        if (y < 0.05) c.lerp(wet, 0.6);
      } else {
        // baked clay with dark cracks (cellular seams)
        const cx = Math.sin(a) * 6, cz = Math.cos(a) * 6, cy = y * 7;
        const n1 = vnoise(cx + 3, cy, cz), n2 = vnoise(cx * 2.1, cy * 2.1 + 5, cz * 2.1);
        const crack = Math.max(smooth01(1 - Math.abs(n1 - 0.5) / 0.05), smooth01(1 - Math.abs(n2 - 0.5) / 0.035) * 0.8);
        c.copy(clay).lerp(clayDark, crack * 0.9 + (1 - smooth01(y / 0.4)) * 0.25);
      }
      C.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < NR; r++) for (let k = 0; k < NS; k++) {
    const a = r * (NS + 1) + k, b = a + NS + 1;
    I.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // close the crown (pond floor)
  const ci = P.length / 3; P.push(0, 0.83 - 0.05, 0); C.push(...(crust ? [clay.r, clay.g, clay.b] : [top.r, top.g, top.b]));
  for (let k = 0; k < NS; k++) { const a = NR * (NS + 1) + k; I.push(a, a + 1, ci); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  const w = BGU.mergeVertices(g);   // the seam column (angle 0 = 2 pi) shares its normals with its neighbours
  w.computeVertexNormals();
  return w;
}
function smooth01(x) { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); }
// one vertex-coloured geometry from [geometry, matrix, colour] pieces (position, normal, color; uv dropped)
function paintedMerge(pieces) {
  const out = pieces.map(([geo, m, hex]) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    g.deleteAttribute('uv');
    const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return BGU.mergeGeometries(out, false);
}
const _mm = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
export function makeMudSpirit() {
  if (!_mudGeo) {
    _mudGeo = mudGeometry(false); _crustGeo = mudGeometry(true);
    _mudMats = {
      body: toon(0xffffff, { vertexColors: true, emissive: 0x1a1006 }),
      crust: toon(0xffffff, { vertexColors: true, emissive: 0x3a2610 }),
      parts: toon(0xffffff, { vertexColors: true }),
      eye: toon(0xffffff, { vertexColors: true, emissive: 0x262018 }),
      heart: glow(0xffb347, 2.4),
    };
    // reeds: five tapered blades and two cattail heads standing in the pond; the pond, a lily pad and the smile — one draw
    const sph = new THREE.SphereGeometry(1, 16, 12), disc = new THREE.CircleGeometry(1, 20), rng = (i) => ((Math.sin(i * 77.3) * 43758.5) % 1 + 1) % 1;
    const P = [];
    for (let i = 0; i < 5; i++) {
      const h = 0.3 + rng(i) * 0.22, r = new THREE.ConeGeometry(0.02, h, 4);
      r.translate(0, h / 2, 0); r.rotateZ((rng(i + 9) - 0.5) * 0.6); r.rotateX((rng(i + 19) - 0.5) * 0.5 - 0.15);
      P.push([r, _mm((rng(i + 29) - 0.5) * 0.2, 0.77, (rng(i + 39) - 0.5) * 0.14 - 0.08, 1, 1, 1), 0x7d8f3c]);
    }
    for (const [x, z, h] of [[0.05, -0.1, 0.42], [-0.07, -0.05, 0.36]]) {
      P.push([new THREE.CylinderGeometry(0.008, 0.01, h, 4), _mm(x, 0.77 + h / 2, z, 1, 1, 1), 0x7d8f3c]);
      P.push([new THREE.CapsuleGeometry(0.022, 0.08, 2, 6), _mm(x, 0.77 + h + 0.02, z, 1, 1, 1), 0x6a4a2a]);
    }
    P.push([disc, _mm(0, 0.79, 0, 0.19, 0.19, 1, -Math.PI / 2), 0x3d6f6a]);
    P.push([disc, _mm(0.07, 0.795, 0.06, 0.07, 0.06, 1, -Math.PI / 2), 0x5f8a3a]);
    P.push([new THREE.TorusGeometry(0.04, 0.009, 6, 14, Math.PI), _mm(0, 0.37, 0.488, 1, 1, 1, -0.25, 0, Math.PI), 0x2a1810]);
    _reedGeo = paintedMerge(P);
    // an eye: an almond of white, a big dark pupil, a catch-light (one mesh; the group scale blinks it)
    _eyeParts = {
      L: paintedMerge([[sph, _mm(0, 0, 0, 0.085, 0.1, 0.035), 0xfff4dc], [sph, _mm(-0.006, -0.008, 0.012, 0.058, 0.074, 0.03), 0x1a120c], [sph, _mm(0.018, 0.03, 0.036, 0.02, 0.02, 0.012), 0xffffff]]),
      R: paintedMerge([[sph, _mm(0, 0, 0, 0.085, 0.1, 0.035), 0xfff4dc], [sph, _mm(0.006, -0.008, 0.012, 0.058, 0.074, 0.03), 0x1a120c], [sph, _mm(-0.018, 0.03, 0.036, 0.02, 0.02, 0.012), 0xffffff]]),
      heart: sph,
    };
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(_mudGeo, _mudMats.body); body.name = 'MudBody';
  const crust = new THREE.Mesh(_crustGeo, _mudMats.crust); crust.name = 'MudCrust'; crust.visible = false;
  const heart = new THREE.Mesh(_eyeParts.heart, _mudMats.heart); heart.name = 'Core'; heart.position.set(-0.03, 0.8, 0.05); heart.scale.set(0.045, 0.035, 0.045);
  const parts = new THREE.Mesh(_reedGeo, _mudMats.parts); parts.name = 'MudReeds';
  g.add(body, crust, heart, parts);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(s < 0 ? _eyeParts.L : _eyeParts.R, _mudMats.eye); eye.name = 'Eye';
    eye.position.set(0.135 * s, 0.47, 0.43); eye.rotation.set(-0.12, 0.3 * s, 0);
    g.add(eye);
  }
  g.userData.crust = crust;
  g.userData.creature = { motion: 'jelly', style: 'slime', outline: false, h: 0.83, r: 0.6 };
  return g;
}

// 纸魅 hitogata: a folded paper doll (形代) with an ink face; flutters in the vertex shader
let _paperTex = null, _paperMat = null, _paperGeo = null;
function paperTexture() {
  if (_paperTex) return _paperTex;
  const W = 128, H = 192, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  // silhouette: round head, wide sleeves, a skirt that splits into two legs
  const sil = new Path2D();
  sil.ellipse(64, 30, 21, 23, 0, 0, TAU);
  sil.moveTo(52, 50); sil.lineTo(76, 50);
  sil.quadraticCurveTo(108, 52, 124, 70); sil.lineTo(118, 96); sil.quadraticCurveTo(98, 88, 86, 86);
  sil.lineTo(90, 150); sil.lineTo(84, 186); sil.lineTo(68, 186); sil.lineTo(64, 158); sil.lineTo(60, 186); sil.lineTo(44, 186); sil.lineTo(38, 150);
  sil.lineTo(42, 86); sil.quadraticCurveTo(30, 88, 10, 96); sil.lineTo(4, 70); sil.quadraticCurveTo(20, 52, 52, 50); sil.closePath();
  x.fillStyle = '#fbf3e0'; x.fill(sil);
  x.save(); x.clip(sil);
  // washi fibres and a warm, uneven tone
  for (let i = 0; i < 900; i++) {
    const px = Math.random() * W, py = Math.random() * H, a = Math.random() * TAU, l = 2 + Math.random() * 7;
    x.strokeStyle = Math.random() < 0.5 ? 'rgba(170,140,100,0.10)' : 'rgba(255,255,255,0.35)';
    x.lineWidth = 0.6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,240,210,0)'); gr.addColorStop(1, 'rgba(200,160,110,0.18)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // centre fold crease
  x.strokeStyle = 'rgba(120,96,70,0.28)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(64, 52); x.lineTo(64, 156); x.stroke();
  // ink face: slanted brush eyes and a small open mouth
  x.strokeStyle = '#231a2c'; x.lineCap = 'round';
  x.lineWidth = 3.4; x.beginPath(); x.moveTo(51, 26); x.quadraticCurveTo(56, 23, 60, 29); x.stroke();
  x.beginPath(); x.moveTo(77, 26); x.quadraticCurveTo(72, 23, 68, 29); x.stroke();
  x.fillStyle = '#231a2c'; x.beginPath(); x.ellipse(64, 40, 3.2, 2.2, 0, 0, TAU); x.fill();
  // a vermilion seal on the chest and ink rule lines on the sleeves
  x.fillStyle = 'rgba(214,52,40,0.85)'; x.beginPath(); x.arc(64, 72, 7, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(251,243,224,0.9)'; x.lineWidth = 1.4; x.beginPath(); x.arc(64, 72, 4, 0, TAU); x.stroke();
  x.strokeStyle = 'rgba(35,26,44,0.55)'; x.lineWidth = 1.5;
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(64 + s * (26 + k * 9), 62 + k * 3); x.lineTo(64 + s * (24 + k * 9), 82 + k * 2); x.stroke(); }
  x.restore();
  // ink edge
  x.strokeStyle = 'rgba(60,44,40,0.75)'; x.lineWidth = 1.6; x.stroke(sil);
  _paperTex = new THREE.CanvasTexture(c);
  _paperTex.colorSpace = THREE.SRGBColorSpace;
  _paperTex.anisotropy = 4;
  return _paperTex;
}
function paperGeometry() {
  if (_paperGeo) return _paperGeo;
  // 0.95 m tall doll, folded along the centre (a shallow V toward the back) so it has a body from three quarters
  const g = new THREE.PlaneGeometry(0.62, 0.93, 12, 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXYZ(i, x, y + 0.465, -Math.abs(x) * 0.32 + Math.sin((y + 0.4) * 3.2) * 0.02);
  }
  g.computeVertexNormals();
  _paperGeo = g;
  return g;
}
const PAPER_VERT = /* glsl */`
{
  float ax = abs( transformed.x );
  float sleeve = smoothstep( 0.1, 0.3, ax ) * smoothstep( 0.5, 0.62, transformed.y ) * ( 1.0 - smoothstep( 0.8, 0.9, transformed.y ) );
  float ph = uCelTime * 7.0 + uJig.w * 6.0;
  transformed.z += sin( ph + transformed.y * 5.0 ) * 0.035 * ( 0.4 + transformed.y );
  transformed.y += sin( ph * 1.1 ) * 0.06 * sleeve * ( ax - 0.1 ) * 4.0;
  transformed.z += cos( ph * 1.1 ) * 0.05 * sleeve;
  float hem = 1.0 - smoothstep( 0.0, 0.35, transformed.y );
  transformed.x += sin( ph * 1.3 + transformed.x * 9.0 ) * 0.02 * hem;
  transformed.xz += uJig.yz * transformed.y * 0.6;
}
`;
function paperMaterial() {
  if (_paperMat) return _paperMat;
  const m = new THREE.MeshToonMaterial({ map: paperTexture(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x2a2014 });
  m.userData.surface = 'none';
  m.userData.look = { trans: 0.55, rim: 0.35, wrap: 0.6 };
  m.userData.shared = true;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCelTime = CEL_U.uCelTime;
    if (!sh.uniforms.uJig) sh.uniforms.uJig = { value: new THREE.Vector4() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCelTime;\nuniform vec4 uJig;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + PAPER_VERT);
  };
  m.customProgramCacheKey = () => 'hitogata1';
  basePatch.set(m, { fn: m.onBeforeCompile, key: 'hitogata1' });
  hookMaterial(m);
  _paperMat = m;
  return m;
}
/** 纸魅: a folded paper doll with an ink face (one draw, 400 triangles). */
export function makeHitogata() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(paperGeometry(), paperMaterial());
  m.name = 'Hitogata';
  m.position.y = 0.04;
  g.add(m);
  g.userData.creature = { motion: 'paper', style: 'paper', outline: false, h: 0.97, r: 0.32 };
  return g;
}

// 鬼火: a flickering violet flame with a white-hot heart (additive, unlit)
let _flameGeo = null, _flameMat = null, _flameIn = null;
function flameMaterial(col, hot, k) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCelTime: CEL_U.uCelTime, uCol: { value: new THREE.Color(col).multiplyScalar(k) }, uHot: { value: new THREE.Color(hot).multiplyScalar(k) } },
    vertexShader: /* glsl */`
      uniform float uCelTime; varying float vH; varying float vF;
      void main() {
        vec3 p = position;
        float h = clamp( p.y / 0.9 + 0.5, 0.0, 1.0 );
        // teardrop: the top licks upward and sways
        p.xz *= 1.0 - h * h * 0.75;
        p.y += h * h * 0.25 * ( 0.8 + 0.2 * sin( uCelTime * 9.0 ) );
        p.x += sin( uCelTime * 6.3 + h * 4.0 ) * 0.06 * h * h;
        p.z += cos( uCelTime * 5.1 + h * 3.0 ) * 0.05 * h * h;
        vH = h;
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        vec3 n = normalize( normalMatrix * normal );
        vF = abs( dot( n, normalize( -mv.xyz ) ) );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol, uHot; varying float vH; varying float vF;
      void main() {
        float core = smoothstep( 0.25, 0.95, vF ) * ( 1.0 - vH * 0.7 );
        vec3 c = mix( uCol, uHot, core );
        float a = smoothstep( 0.0, 0.5, vF ) * ( 1.0 - smoothstep( 0.6, 1.0, vH ) * 0.6 );
        gl_FragColor = vec4( c * a, a );
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  m.userData.shared = true; m.userData.noFx = true;
  return m;
}
/** 鬼火: flame body + glow halo + two white eyes. */
export function makeWispFlame(haloMat) {
  if (!_flameGeo) { _flameGeo = new THREE.SphereGeometry(0.34, 18, 14); _flameMat = flameMaterial(0x9a4cff, 0xffe8ff, 1.7); _flameIn = flameMaterial(0xff8ad8, 0xffffff, 1.2); }
  const g = new THREE.Group();
  const f = new THREE.Mesh(_flameGeo, _flameMat); f.position.y = 0.55; f.name = 'Flame';
  const fi = new THREE.Mesh(_flameGeo, _flameIn); fi.position.y = 0.5; fi.scale.setScalar(0.55); fi.name = 'FlameIn';
  g.add(f, fi);
  if (haloMat) { const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), haloMat); halo.position.y = 0.55; g.add(halo); }
  const eyeM = glow(0xffffff, 3);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeM); eye.scale.set(1, 1.3, 0.6); eye.position.set(0.1 * s, 0.56, 0.27); eye.name = 'Eye'; g.add(eye); }
  g.userData.creature = { motion: 'hover', style: 'light', outline: false, h: 0.9, r: 0.35, noFx: true };
  return g;
}

let _inkTex = null;
function inkTexture() {
  if (_inkTex) return _inkTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  // a brushed ink blot: a soft core and ragged splashes
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 56);
  g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.6, 'rgba(0,0,0,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 56, 0, TAU); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.85)';
  for (let i = 0; i < 14; i++) { const a = Math.random() * TAU, d = 34 + Math.random() * 22, r = 2 + Math.random() * 6; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, TAU); x.fill(); }
  _inkTex = new THREE.CanvasTexture(c);
  return _inkTex;
}
let _inkGeo = null;
function makeInkBlot() {
  if (!_inkGeo) _inkGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ map: inkTexture(), color: 0x1a0b30, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const mesh = new THREE.Mesh(_inkGeo, m);
  mesh.renderOrder = 1; mesh.visible = false; mesh.name = 'inkBlot';
  return mesh;
}

// ---- re-sculpted animals (final-beasts round, docs/api/actors-look.md "Re-sculpted animals") -----------------------------
// The asset-pack meshes are the CAGE: all parts of a model are welded into one surface, Loop-subdivided once (round, soft
// masses instead of facets), the head grows a little, the eyes grow and get a glint, and the painted colour of every part
// (material colour x atlas texel x baked AO) becomes a vertex colour. Skin weights are interpolated, so the result is bound to
// the model's own skeleton and every clip keeps working. One material (cel fur, vertex colours, emissive ramp in uv.x) and
// one outline hull per animal instead of one per material. Built once per asset; clones share geometry and material.
const SCULPT = {
  ani_fox: { head: 1.16, eye: 1.7, inflate: 0.9, smooth: 2, belly: 0xfff1e0 },
  ani_deer: { head: 1.12, eye: 1.2, inflate: 0.7, smooth: 2, belly: 0xf3e2c8 },
  ani_stag: { head: 1.08, eye: 1.2, inflate: 0.7, smooth: 1, belly: 0xf3e2c8 },
  ani_chicken: { head: 1.12, eye: 1.5, inflate: 0.6, smooth: 2, round: 0.85 },
  ani_cat: { head: 1.14, eye: 1.5, inflate: 0.6, smooth: 2, round: 0.85 },
  ani_dog: { head: 1.14, eye: 1.55, inflate: 0.8, smooth: 2, belly: 0xf6e6cc },
  mon_golem_big: { head: 1.0, eye: 1, inflate: 0, blocky: 0.15, round: 0.3, stone: true },
};
// bodies made by the offline sculpt kit (tools/sculpt): asset id -> [G.sculpt type, kit asset id]; createCreature swaps them in
const KIT_BODY = { ani_chicken: ['hen', 'sculpt_ani_chicken'], ani_wolf: ['creatures', 'sculpt_wolf_wild'], mon_bat: ['creatures', 'sculpt_bat_star'] };
// glow colours of kit bodies swapped in by KIT_BODY (TEXCOORD_0.x through the ramp): the wolves' amber eyes, the bat's stars
const KIT_GLOW = { sculpt_wolf_wild: 0xff9a2a, sculpt_bat_star: 0xffcf6a };
// foes whose kit body IS their asset (round art-creatures; tools/sculpt/assets/*.mjs + beast_kit.mjs post; G.sculpt type
// 'creatures'): the pack asset they fall back to (?sculpt=0 / type off: the GLB is not even loaded), the death / spawn
// style, the glow colour of TEXCOORD_0.x (ramp).
// The kit body carries its own colours, so the foe's tint is not applied to it (the fallback keeps the old tint).
// eyes: [x, y, z] of the right eye in bind-pose model metres, radii [across, tall, deep], yaw (deg) of its gaze off +x
// toward +z, the iris colour, the bone it rides — a textured cap that blinks (named 'Eye'), crisp at any size.
const KIT_OWN = {
  sculpt_froststag: { type: 'creatures', old: 'ani_stag', style: 'paper', lift: 0x1a3550, eyes: { bone: 'Head', at: [0.094, 1.68, 0.79], r: [0.036, 0.032, 0.016], yaw: 64, iris: 0x3fa9dc } },
  sculpt_embersnake: { type: 'creatures', old: 'mon_serpent', glow: 0xff6a1a, eyes: { bone: 'Mouth', cx: -0.025, at: [0.345, 2.82, 0.53], r: [0.085, 0.078, 0.04], yaw: 70, iris: 0xf2b42a, slit: true } },
};
const kitOn = (type) => !!G.sculpt?.on?.(type);
// low / mobile bodies (the same sculpt at about a third of the triangles, KIT_LO=1 builds): the tier picks one, the other
// is the fallback when only it is loaded (src/core/assets.js loads the tier's own)
const KIT_LO = { sculpt_froststag: 'sculpt_froststag_lo', sculpt_embersnake: 'sculpt_embersnake_lo', sculpt_wolf_wild: 'sculpt_wolf_wild_lo', sculpt_bat_star: 'sculpt_bat_star_lo' };
const kitLoTier = () => !!G.quality?.mobile || G.quality?.name === 'low';
function kitPick(id) {
  const lo = KIT_LO[id], ready = (x) => !!G.assets?.ready?.(x);
  if (!lo) return ready(id) ? id : null;
  const [a, b] = kitLoTier() ? [lo, id] : [id, lo];
  return ready(a) ? a : ready(b) ? b : null;
}
const _kb = new THREE.Matrix4(), _ki = new THREE.Matrix4();
/** The bind frame of a kit body: model space of the sculpt (bind pose) -> the skinned mesh's own space. Voted over the
 *  joints at rest (a few joints' rest differs from their bind), cached per skeleton source. Child of bone b with
 *  matrix = boneInverse(b) x kitFrame shows sculpt-space geometry exactly where the skin puts it. */
function kitFrame(model, sm) {
  if (model.userData.kitFrame) return model.userData.kitFrame;
  model.updateMatrixWorld(true);
  _ki.copy(model.matrixWorld).invert();
  const votes = new Map();
  sm.skeleton.bones.forEach((b, i) => {
    _kb.multiplyMatrices(_ki, b.matrixWorld).multiply(sm.skeleton.boneInverses[i]);
    const k = _kb.elements.map((v) => v.toFixed(3)).join();
    const e = votes.get(k); if (e) e.n++; else votes.set(k, { n: 1, m: _kb.clone() });
  });
  const best = [...votes.values()].sort((a, b) => b.n - a.n)[0];
  return (model.userData.kitFrame = best.m.invert());
}
const kitGlowDone = new WeakSet();
const kitEyeMats = new Map();
let kitEyeGeo = null;
function kitEyeMaterial(iris, slit) {
  let m = kitEyeMats.get(iris + (slit ? 's' : ''));
  if (m) return m;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const ic = new THREE.Color(iris), hex = (c) => '#' + c.getHexString();
  x.fillStyle = '#eef3f8'; x.fillRect(0, 0, 128, 128);
  // a big iris (anime read): dark rim, the colour, a lighter lower half; a round pupil; two catch-lights up and to one side
  let g = x.createRadialGradient(64, 70, 6, 64, 66, 50);
  g.addColorStop(0, hex(ic.clone().multiplyScalar(0.35))); g.addColorStop(0.55, hex(ic)); g.addColorStop(0.86, hex(ic.clone().lerp(new THREE.Color(0xffffff), 0.25))); g.addColorStop(1, hex(ic.clone().multiplyScalar(0.3)));
  x.fillStyle = g; x.beginPath(); x.ellipse(64, 66, 47, 52, 0, 0, TAU); x.fill();
  x.fillStyle = '#0b1020'; x.beginPath(); x.ellipse(64, 66, slit ? 7 : 19, slit ? 40 : 23, 0, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.95)'; x.beginPath(); x.ellipse(50, 44, 13, 11, -0.4, 0, TAU); x.fill();
  x.beginPath(); x.ellipse(80, 88, 5, 4, 0, 0, TAU); x.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshToonMaterial({ map: t, gradientMap: toonGradient(), emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.28 });
  m.name = 'KitEye'; m.userData.shared = true;
  hookMaterial(m);
  kitEyeMats.set(iris + (slit ? 's' : ''), m);
  return m;
}
/** Eyes of a kit body: two textured caps in the sculpt's sockets, riding a bone through its inverse bind matrix. */
function addKitEyes(model, E) {
  let sm = null;
  model.traverse((o) => { if (!sm && o.isSkinnedMesh && !o.userData.outline) sm = o; });
  const bones = sm?.skeleton?.bones, hi = bones ? bones.findIndex((b) => b.name === E.bone) : -1;
  if (hi < 0) return;
  if (!kitEyeGeo) {
    kitEyeGeo = new THREE.SphereGeometry(1, 20, 14);
    const p = kitEyeGeo.attributes.position, uv = kitEyeGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.5 + 0.5, p.getY(i) * 0.5 + 0.5);   // the picture faces +z
  }
  const holder = new THREE.Group(); holder.name = 'KitEyes';
  holder.matrixAutoUpdate = false; holder.matrix.copy(sm.skeleton.boneInverses[hi]).multiply(kitFrame(model, sm));
  bones[hi].add(holder);
  const mat = kitEyeMaterial(E.iris, !!E.slit);
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(kitEyeGeo, mat); e.name = 'Eye';
    e.position.set((E.cx || 0) + E.at[0] * s, E.at[1], E.at[2]);
    e.rotation.y = s * E.yaw * Math.PI / 180;
    e.scale.set(E.r[0], E.r[1], E.r[2]);
    holder.add(e);
  }
}
/** TEXCOORD_0.x of a kit body = glow amount (beast_kit post): emissive colour through the grey ramp; or a flat emissive
 *  lift (the frost stag's coat keeps its cold light in shade, as the old pale recolour did). Once per material. */
function kitGlow(model, color, lift) {
  model.traverse((o) => {
    if (!o.isSkinnedMesh || o.userData.outline) return;
    for (const m of [].concat(o.material)) {
      if (!m || kitGlowDone.has(m) || !m.emissive) continue;
      kitGlowDone.add(m);
      if (color != null && o.geometry?.attributes.uv) { m.emissive.set(color); m.emissiveMap = glowRamp(false); }
      else m.emissive.set(lift ?? 0);
      m.emissiveIntensity = 1; m.needsUpdate = true;
    }
  });
}
const sculpted = new Map();   // assetId -> { geo, outGeo, mat } | null (failed)
const _sv = new THREE.Vector3(), _sm = new THREE.Matrix4(), _sc = new THREE.Color();
const texPix = new WeakMap();
function texelOf(tex, u, v, out) {
  const img = tex?.image;
  if (!img || !img.width) return out.setRGB(1, 1, 1);
  let px = texPix.get(img);
  if (!px) {
    const c = document.createElement('canvas'); c.width = Math.min(256, img.width); c.height = Math.min(256, img.height);
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
    px = { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data }; texPix.set(img, px);
  }
  u = u - Math.floor(u); v = v - Math.floor(v);
  if (tex.flipY !== false) v = 1 - v;   // glTF textures are flipY = false; canvas rows go down
  const i = (Math.min(px.h - 1, (v * px.h) | 0) * px.w + Math.min(px.w - 1, (u * px.w) | 0)) * 4;
  return out.setRGB(px.d[i] / 255, px.d[i + 1] / 255, px.d[i + 2] / 255, THREE.SRGBColorSpace);
}
let _rampWarm = null, _rampCyan = null;
function glowRamp(cyan) {
  if (cyan ? _rampCyan : _rampWarm) return cyan ? _rampCyan : _rampWarm;
  const c = document.createElement('canvas'); c.width = 64; c.height = 1;
  const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 64, 0);
  if (cyan) { g.addColorStop(0, '#000000'); g.addColorStop(0.4, '#0b4a5a'); g.addColorStop(0.75, '#3ee6ff'); g.addColorStop(1, '#e8ffff'); }
  else { g.addColorStop(0, '#000000'); g.addColorStop(0.5, '#3a3a3a'); g.addColorStop(1, '#ffffff'); }
  x.fillStyle = g; x.fillRect(0, 0, 64, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter;
  if (cyan) _rampCyan = t; else _rampWarm = t;
  return t;
}
const vhash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y, z) {   // cheap value noise (CPU, build time only)
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(vhash(ix, iy, iz), vhash(ix + 1, iy, iz), u), L(vhash(ix, iy + 1, iz), vhash(ix + 1, iy + 1, iz), u), v),
    L(L(vhash(ix, iy, iz + 1), vhash(ix + 1, iy, iz + 1), u), L(vhash(ix, iy + 1, iz + 1), vhash(ix + 1, iy + 1, iz + 1), u), v), w);
}

function buildSculpt(model, spec) {
  const parts = [];
  model.updateMatrixWorld(true);
  model.traverse((o) => { if (o.isSkinnedMesh && !o.userData.outline && o.layers.isEnabled(0)) parts.push(o); });
  if (!parts.length) return null;
  const m0 = parts[0];
  for (const p of parts) if (p.skeleton.bones !== m0.skeleton.bones && (p.skeleton.bones.length !== m0.skeleton.bones.length || p.skeleton.bones.some((b, i) => b !== m0.skeleton.bones[i]))) return null;
  for (const p of parts) if (!p.bindMatrix.equals(m0.bindMatrix) || !p.matrix.equals(m0.matrix) || p.parent !== m0.parent) return null;
  const bones = m0.skeleton.bones;
  // ---- weld every part into one surface (position key), painted colour per corner averaged per welded vertex
  let size = 0;
  for (const p of parts) { p.geometry.computeBoundingBox(); size = Math.max(size, p.geometry.boundingBox.getSize(_sv).length()); }
  const q = 2e4 / Math.max(1e-6, size);
  const map = new Map();
  const P = [], W = [], Cl = [], Cn = [], EYE = [], AO = [];
  const tris = [];
  for (const p of parts) {
    const g = p.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const uv = g.attributes.uv, vc = g.attributes.color;
    const mats = [].concat(p.material);
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : pos.count, materialIndex: 0 }];
    const idx = (k) => (g.index ? g.index.getX(k) : k);
    const local = new Array(pos.count);
    const vid = (i, mat) => {
      if (local[i] !== undefined) return local[i];
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = Math.round(x * q) + ',' + Math.round(y * q) + ',' + Math.round(z * q);
      let id = map.get(key);
      if (id === undefined) { id = P.length / 3; map.set(key, id); P.push(x, y, z); W.push(new Map()); Cl.push(0, 0, 0); Cn.push(0); EYE.push(0); AO.push(0); }
      const wm = W[id];
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) { const b = si.getComponent(i, k); wm.set(b, Math.max(wm.get(b) || 0, w)); } }
      // painted colour of this corner
      _sc.copy(mat?.color || _sc.setRGB(1, 1, 1));
      if (mat?.map && uv) { const tc = texelOf(mat.map, uv.getX(i), uv.getY(i), new THREE.Color()); _sc.multiply(tc); }
      let ao = 1;
      if (vc) { ao = (vc.getX(i) + vc.getY(i) + vc.getZ(i)) / 3; _sc.multiplyScalar(Math.min(1.08, ao / 0.93)); }
      Cl[id * 3] += _sc.r; Cl[id * 3 + 1] += _sc.g; Cl[id * 3 + 2] += _sc.b; Cn[id]++; AO[id] += ao;
      if (/eye/i.test(mat?.name || '')) EYE[id] = 1;
      local[i] = id;
      return id;
    };
    for (const gr of groups) {
      const mat = mats[gr.materialIndex ?? 0] || mats[0];
      for (let k = gr.start; k < gr.start + gr.count; k += 3) {
        const a = vid(idx(k), mat), b = vid(idx(k + 1), mat), c = vid(idx(k + 2), mat);
        if (a !== b && b !== c && a !== c) tris.push(a, b, c);
      }
    }
  }
  let nV = P.length / 3;
  for (let i = 0; i < nV; i++) { const n = Math.max(1, Cn[i]); Cl[i * 3] /= n; Cl[i * 3 + 1] /= n; Cl[i * 3 + 2] /= n; AO[i] /= n; }
  // ---- one Loop subdivision (blocky > 0 keeps part of the cage: soft-edged carved blocks)
  const ekey = (a, b) => (a < b ? a * 1048576 + b : b * 1048576 + a);
  const edges = new Map();
  for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = tris[t + e], b = tris[t + (e + 1) % 3], o = tris[t + (e + 2) % 3];
    const k = ekey(a, b); let E = edges.get(k);
    if (!E) edges.set(k, (E = { a, b, opp: [], id: -1 }));
    E.opp.push(o);
  }
  const nbr = Array.from({ length: nV }, () => new Set()), bnd = Array.from({ length: nV }, () => []);
  for (const E of edges.values()) { nbr[E.a].add(E.b); nbr[E.b].add(E.a); if (E.opp.length !== 2) { bnd[E.a].push(E.b); bnd[E.b].push(E.a); } }
  // connected parts (each block of a block-built model), and their boxes
  const comp = new Int32Array(nV).fill(-1); const boxes = [];
  for (let i = 0; i < nV; i++) {
    if (comp[i] >= 0) continue;
    const id = boxes.length, st = [i], B = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; comp[i] = id;
    while (st.length) {
      const v = st.pop();
      for (let k = 0; k < 3; k++) { B[k] = Math.min(B[k], P[v * 3 + k]); B[k + 3] = Math.max(B[k + 3], P[v * 3 + k]); }
      for (const j of nbr[v]) if (comp[j] < 0) { comp[j] = id; st.push(j); }
    }
    boxes.push(B);
  }
  // block-built animals: every block becomes a soft pillow (pulled toward the ellipsoid inside its box)
  if (spec.round) for (let i = 0; i < nV; i++) {
    const B = boxes[comp[i]]; const d = [0, 0, 0], h = [0, 0, 0], c = [0, 0, 0];
    let linf = 0, l2 = 0;
    for (let k = 0; k < 3; k++) { c[k] = (B[k] + B[k + 3]) / 2; h[k] = Math.max(1e-6, (B[k + 3] - B[k]) / 2); d[k] = (P[i * 3 + k] - c[k]) / h[k]; linf = Math.max(linf, Math.abs(d[k])); l2 += d[k] * d[k]; }
    l2 = Math.sqrt(l2); if (l2 < 1e-6) continue;
    const f = 1 + (linf / l2 - 1) * spec.round;
    for (let k = 0; k < 3; k++) P[i * 3 + k] = c[k] + h[k] * d[k] * f;
  }
  // soft masses: Taubin smoothing of the cage (shrink-free)
  for (let it = 0; it < (spec.smooth || 0) * 2; it++) {
    const k = it % 2 ? -0.53 : 0.5, T = new Float32Array(P.length);
    for (let i = 0; i < nV; i++) {
      T[i * 3] = P[i * 3]; T[i * 3 + 1] = P[i * 3 + 1]; T[i * 3 + 2] = P[i * 3 + 2];
      if (bnd[i].length || !nbr[i].size) continue;
      let sx = 0, sy = 0, sz = 0; for (const j of nbr[i]) { sx += P[j * 3]; sy += P[j * 3 + 1]; sz += P[j * 3 + 2]; }
      const n = nbr[i].size;
      T[i * 3] += k * (sx / n - P[i * 3]); T[i * 3 + 1] += k * (sy / n - P[i * 3 + 1]); T[i * 3 + 2] += k * (sz / n - P[i * 3 + 2]);
    }
    for (let i = 0; i < P.length; i++) P[i] = T[i];
  }
  let nB = 0; for (const E of edges.values()) if (E.opp.length !== 2) nB++;
  const dbg = { weld: nV, tris: tris.length / 3, boundary: nB, edges: edges.size, comps: boxes.length };
  const NP = [], NW = [], NC = [], NE = [], NA = [], NK = [];
  const blocky = spec.blocky || 0;
  for (let i = 0; i < nV; i++) {   // moved old vertices
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    let nx, ny, nz;
    if (bnd[i].length) {
      if (bnd[i].length === 2) { const [b1, b2] = bnd[i]; nx = 0.75 * x + 0.125 * (P[b1 * 3] + P[b2 * 3]); ny = 0.75 * y + 0.125 * (P[b1 * 3 + 1] + P[b2 * 3 + 1]); nz = 0.75 * z + 0.125 * (P[b1 * 3 + 2] + P[b2 * 3 + 2]); }
      else { nx = x; ny = y; nz = z; }
    } else {
      const n = nbr[i].size; const be = n === 3 ? 3 / 16 : 3 / (8 * Math.max(1, n));
      let sx = 0, sy = 0, sz = 0; for (const j of nbr[i]) { sx += P[j * 3]; sy += P[j * 3 + 1]; sz += P[j * 3 + 2]; }
      nx = (1 - n * be) * x + be * sx; ny = (1 - n * be) * y + be * sy; nz = (1 - n * be) * z + be * sz;
    }
    NP.push(nx + (x - nx) * blocky, ny + (y - ny) * blocky, nz + (z - nz) * blocky);
    NW.push(W[i]); NC.push(Cl[i * 3], Cl[i * 3 + 1], Cl[i * 3 + 2]); NE.push(EYE[i]); NA.push(AO[i]); NK.push(comp[i]);
  }
  for (const E of edges.values()) {   // edge points
    const { a, b, opp } = E;
    let x, y, z;
    const mx = (P[a * 3] + P[b * 3]) / 2, my = (P[a * 3 + 1] + P[b * 3 + 1]) / 2, mz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2;
    if (opp.length === 2) {
      const [c, d] = opp;
      x = 0.375 * (P[a * 3] + P[b * 3]) + 0.125 * (P[c * 3] + P[d * 3]);
      y = 0.375 * (P[a * 3 + 1] + P[b * 3 + 1]) + 0.125 * (P[c * 3 + 1] + P[d * 3 + 1]);
      z = 0.375 * (P[a * 3 + 2] + P[b * 3 + 2]) + 0.125 * (P[c * 3 + 2] + P[d * 3 + 2]);
    } else { x = mx; y = my; z = mz; }
    NP.push(x + (mx - x) * blocky, y + (my - y) * blocky, z + (mz - z) * blocky);
    const wm = new Map();
    for (const [bi, w] of W[a]) wm.set(bi, (wm.get(bi) || 0) + w * 0.5);
    for (const [bi, w] of W[b]) wm.set(bi, (wm.get(bi) || 0) + w * 0.5);
    NW.push(wm);
    NC.push((Cl[a * 3] + Cl[b * 3]) / 2, (Cl[a * 3 + 1] + Cl[b * 3 + 1]) / 2, (Cl[a * 3 + 2] + Cl[b * 3 + 2]) / 2);
    NE.push(EYE[a] && EYE[b] ? 1 : 0); NA.push((AO[a] + AO[b]) / 2); NK.push(comp[a]);
    E.id = NP.length / 3 - 1;
  }
  const NT = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const ab = edges.get(ekey(a, b)).id, bc = edges.get(ekey(b, c)).id, ca = edges.get(ekey(c, a)).id;
    NT.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  nV = NP.length / 3;
  // block-built: once more on the subdivided surface (the cage faces had no inner vertices to round)
  if (spec.round) {
    const BX = boxes.map(() => [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]);
    for (let i = 0; i < nV; i++) { const B = BX[NK[i]]; for (let k = 0; k < 3; k++) { B[k] = Math.min(B[k], NP[i * 3 + k]); B[k + 3] = Math.max(B[k + 3], NP[i * 3 + k]); } }
    for (let i = 0; i < nV; i++) {
      const B = BX[NK[i]]; const d = [0, 0, 0], h = [0, 0, 0], c = [0, 0, 0]; let linf = 0, l2 = 0;
      for (let k = 0; k < 3; k++) { c[k] = (B[k] + B[k + 3]) / 2; h[k] = Math.max(1e-6, (B[k + 3] - B[k]) / 2); d[k] = (NP[i * 3 + k] - c[k]) / h[k]; linf = Math.max(linf, Math.abs(d[k])); l2 += d[k] * d[k]; }
      l2 = Math.sqrt(l2); if (l2 < 1e-6) continue;
      const f = (1 + (linf / l2 - 1) * spec.round * 0.8) * (1 + 0.24 * spec.round);   // fattened so neighbouring blocks still meet
      for (let k = 0; k < 3; k++) NP[i * 3 + k] = c[k] + h[k] * d[k] * f;
    }
  }
  // ---- skin: top four influences
  const SI = new Uint16Array(nV * 4), SW = new Float32Array(nV * 4);
  for (let i = 0; i < nV; i++) {
    const L = [...NW[i].entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const s = L.reduce((a, e) => a + e[1], 0) || 1;
    L.forEach((e, k) => { SI[i * 4 + k] = e[0]; SW[i * 4 + k] = e[1] / s; });
    if (!L.length) SW[i * 4] = 1;
  }
  // ---- creature axes in mesh space, bone joints in mesh space
  const rel = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(m0.matrixWorld);
  const relInv = rel.clone().invert();
  const fwd = new THREE.Vector3(0, 0, 1).transformDirection(relInv), up = new THREE.Vector3(0, 1, 0).transformDirection(relInv);
  const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const bindInv = m0.bindMatrix.clone().invert();
  const joint = (bi) => new THREE.Vector3().setFromMatrixPosition(_sm.copy(m0.skeleton.boneInverses[bi]).invert().premultiply(bindInv));
  // head subtree
  const headI = bones.findIndex((b) => /^head$/i.test(b.name)) >= 0 ? bones.findIndex((b) => /^head$/i.test(b.name)) : bones.findIndex((b) => /head/i.test(b.name) && !/end|top/i.test(b.name));
  const headSet = new Set();
  if (headI >= 0) { bones[headI].traverse((o) => { const k = bones.indexOf(o); if (k >= 0) headSet.add(k); }); }
  const wHead = new Float32Array(nV);
  for (let i = 0; i < nV; i++) for (let k = 0; k < 4; k++) if (headSet.has(SI[i * 4 + k])) wHead[i] += SW[i * 4 + k];
  if (headI >= 0 && spec.head !== 1) {
    const hc = joint(headI);
    for (let i = 0; i < nV; i++) if (wHead[i] > 0) {
      const k = 1 + (spec.head - 1) * wHead[i];
      NP[i * 3] = hc.x + (NP[i * 3] - hc.x) * k; NP[i * 3 + 1] = hc.y + (NP[i * 3 + 1] - hc.y) * k; NP[i * 3 + 2] = hc.z + (NP[i * 3 + 2] - hc.z) * k;
    }
  }
  // ---- eyes: dark clusters on the head away from the midline (eye materials when the model names them)
  const lum = (i) => 0.3 * NC[i * 3] + 0.59 * NC[i * 3 + 1] + 0.11 * NC[i * 3 + 2];
  const adj = Array.from({ length: nV }, () => []);
  for (let t = 0; t < NT.length; t += 3) for (let e = 0; e < 3; e++) adj[NT[t + e]].push(NT[t + (e + 1) % 3]);
  const named = NE.some((x) => x);
  const isEye = (i) => (named ? NE[i] : lum(i) < 0.05) && wHead[i] > 0.5;
  const seenV = new Uint8Array(nV);
  const glowA = new Float32Array(nV);
  let hcx = 0; if (headI >= 0) hcx = joint(headI).dot(side);
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.Float32BufferAttribute(NP, 3)); g0.setIndex(NT); g0.computeVertexNormals();
  const NN = g0.attributes.normal;
  if (spec.eye > 1) for (let i = 0; i < nV; i++) {
    if (seenV[i] || !isEye(i)) continue;
    const cl = [i]; seenV[i] = 1;
    for (let h = 0; h < cl.length; h++) for (const j of adj[cl[h]]) if (!seenV[j] && isEye(j)) { seenV[j] = 1; cl.push(j); }
    if (cl.length < 3 || cl.length > nV * 0.08) continue;
    const c = new THREE.Vector3(), n = new THREE.Vector3();
    for (const j of cl) { c.x += NP[j * 3]; c.y += NP[j * 3 + 1]; c.z += NP[j * 3 + 2]; n.x += NN.getX(j); n.y += NN.getY(j); n.z += NN.getZ(j); }
    c.multiplyScalar(1 / cl.length); n.normalize();
    if (Math.abs(c.dot(side) - hcx) < size * 0.012) continue;   // on the midline: the nose, not an eye
    let rad = 0; for (const j of cl) rad = Math.max(rad, _sv.set(NP[j * 3] - c.x, NP[j * 3 + 1] - c.y, NP[j * 3 + 2] - c.z).length());
    const ek = named ? Math.min(spec.eye, 1.2) : spec.eye;
    const hl = new THREE.Vector3().copy(up).addScaledVector(fwd, 0.35).addScaledVector(n, -up.dot(n)).normalize().multiplyScalar(rad * 0.42 * ek);
    const hl2 = hl.clone().multiplyScalar(-0.75);
    for (const j of cl) {
      _sv.set(NP[j * 3] - c.x, NP[j * 3 + 1] - c.y, NP[j * 3 + 2] - c.z);
      const dn = _sv.dot(n);
      _sv.addScaledVector(n, -dn).multiplyScalar(ek).addScaledVector(n, dn + rad * 0.12);
      NP[j * 3] = c.x + _sv.x; NP[j * 3 + 1] = c.y + _sv.y; NP[j * 3 + 2] = c.z + _sv.z;
      const d1 = _sv.distanceTo(hl) / (rad * ek), d2 = _sv.distanceTo(hl2) / (rad * ek);
      const r = _sv.length() / (rad * ek);
      // glossy eye: deep brown-black core, a warm lower ring, two glints
      const ring = Math.min(1, Math.max(0, (r - 0.45) / 0.3)) * (1 - Math.min(1, Math.max(0, (r - 0.85) / 0.15)));
      const low = Math.max(0, -_sv.dot(up) / (rad * ek));
      NC[j * 3] = 0.02 + ring * low * 0.25; NC[j * 3 + 1] = 0.012 + ring * low * 0.12; NC[j * 3 + 2] = 0.008 + ring * low * 0.04;
      const gl = Math.max(d1 < 0.24 ? 1 : 0, d2 < 0.12 ? 0.8 : 0);
      if (gl) { NC[j * 3] = NC[j * 3 + 1] = NC[j * 3 + 2] = 1; glowA[j] = gl; }
    }
  }
  // ---- inflate a little (Loop shrinks thin legs), stone: moss on the tops, glowing seams in the crevices of the torso
  g0.attributes.position.array.set(NP); g0.computeVertexNormals();
  const N2 = g0.attributes.normal;
  const infl = (spec.inflate || 0) * size * 0.004;
  const UV = new Float32Array(nV * 2);
  let coreK = -1;
  if (spec.stone) { let bv = -1; for (let k = 0; k < boxes.length; k++) { const B = boxes[k]; const vol = (B[3] - B[0]) * (B[4] - B[1]) * (B[5] - B[2]); if (vol > bv) { bv = vol; coreK = k; } } }
  const limb = new Set(); bones.forEach((b, k) => { if (/arm|hand|leg|foot|shin|thigh|shoulder|finger/i.test(b.name)) limb.add(k); });
  for (let i = 0; i < nV; i++) {
    const nx = N2.getX(i), ny = N2.getY(i), nz = N2.getZ(i);
    if (infl && !glowA[i]) { NP[i * 3] += nx * infl; NP[i * 3 + 1] += ny * infl; NP[i * 3 + 2] += nz * infl; }
    let gl = glowA[i] * 0.9;
    if (spec.stone) {
      const x = NP[i * 3], y = NP[i * 3 + 1], z = NP[i * 3 + 2];
      const upn = nx * up.x + ny * up.y + nz * up.z;
      const f = 12 / size;
      const mo = (limb.has(SI[i * 4]) ? 0 : 1) * Math.max(0, Math.min(1, (upn - 0.55) / 0.3)) * Math.max(0, Math.min(1, (vnoise(x * f, y * f, z * f) - 0.4) / 0.2));
      // carved blocks: one cool grey stone, each block its own tone, a little of the painted atlas left, mottled
      const tone = 0.86 + 0.24 * vhash(NK[i] * 1.7, 3.1, 0.7);
      const v = tone * (0.9 + 0.2 * vnoise(x * f * 0.6 + 7, y * f * 0.6, z * f * 0.6)) * (0.75 + 0.25 * Math.min(1, NA[i] / 0.93));
      NC[i * 3] = (NC[i * 3] * 0.2 + 0.8 * 0.33) * v; NC[i * 3 + 1] = (NC[i * 3 + 1] * 0.2 + 0.8 * 0.33) * v; NC[i * 3 + 2] = (NC[i * 3 + 2] * 0.2 + 0.8 * 0.4) * v;
      NC[i * 3] += (0.07 - NC[i * 3]) * mo * 0.75; NC[i * 3 + 1] += (0.15 - NC[i * 3 + 1]) * mo * 0.75; NC[i * 3 + 2] += (0.035 - NC[i * 3 + 2]) * mo * 0.75;
      // the core: light leaking from the front faces of the chest block
      if (NK[i] === coreK) {
        const fn = nx * fwd.x + ny * fwd.y + nz * fwd.z;
        gl = Math.max(gl, Math.max(0, fn - 0.3) / 0.7 * 0.9);
      }
    }
    if (!spec.stone && !glowA[i] && lum(i) > 0.04) {
      // painted fur: a darker back, a light belly / throat, big soft value masses
      const upn = nx * up.x + ny * up.y + nz * up.z;
      const f = 5 / size, x = NP[i * 3], y = NP[i * 3 + 1], z = NP[i * 3 + 2];
      const v = 0.94 + 0.12 * vnoise(x * f, y * f, z * f);
      const back = Math.max(0, Math.min(1, (upn - 0.45) / 0.4)) * 0.16;
      for (let c = 0; c < 3; c++) NC[i * 3 + c] *= v * (1 - back);
      if (spec.belly) {
        _sc.set(spec.belly).convertSRGBToLinear();
        // cold grey patches of the asset pack (muzzle, chest, tail tip) become the warm cream of the belly
        const mx = Math.max(NC[i * 3], NC[i * 3 + 1], NC[i * 3 + 2]), mn = Math.min(NC[i * 3], NC[i * 3 + 1], NC[i * 3 + 2]);
        if (mx > 0.08 && (mx - mn) / mx < 0.18) { const k = Math.min(1, mx * 1.6 + 0.25); NC[i * 3] = _sc.r * k; NC[i * 3 + 1] = _sc.g * k; NC[i * 3 + 2] = _sc.b * k; }
        const bl = Math.max(0, Math.min(1, (-upn - 0.2) / 0.45)) * 0.55 * (1 - wHead[i] * 0.4);
        NC[i * 3] += (_sc.r - NC[i * 3]) * bl; NC[i * 3 + 1] += (_sc.g - NC[i * 3 + 1]) * bl; NC[i * 3 + 2] += (_sc.b - NC[i * 3 + 2]) * bl;
      }
    }
    UV[i * 2] = gl; UV[i * 2 + 1] = 0.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(NP, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(NC, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  geo.setIndex(NT);
  geo.computeVertexNormals();
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  // material: the cel fur of the original body, painted by the vertex colours, glowing through the ramp
  const srcM = [].concat(m0.material).find((x) => x?.isCelMaterial) || null;
  const mat = srcM ? srcM.clone() : null;
  if (!mat) return null;
  mat.map = null; mat.vertexColors = true; mat.color.set(0xffffff);
  mat.emissive.set(0xffffff); mat.emissiveMap = glowRamp(!!spec.stone); mat.emissiveIntensity = 1;
  mat.name = 'Sculpt'; mat.userData.sculpt = spec.stone ? 'stone' : 'fur'; mat.userData.shared = true;
  mat.needsUpdate = true;
  hookMaterial(mat);
  // outline hull once (the cel outline builder on a throw-away mesh)
  const tmp = new THREE.Group(); const sm = new THREE.SkinnedMesh(geo, mat); tmp.add(sm);
  sm.bind(m0.skeleton, m0.bindMatrix);
  const outs = buildOutlines(tmp);
  const outGeo = outs[0]?.geometry || null;
  return { geo, outGeo, mat, dbg };
}

/** Build cost / size of the re-sculpted bodies (tests). */
export function sculptStats() {
  // (also reachable as window.__mvSculpt() from headless test scripts)
  const o = {}; for (const [k, v] of sculpted) o[k] = v ? { tris: v.tris, ms: +v.ms.toFixed(1), ...v.dbg } : null; return o; }

/** Replace the parts of a fresh model clone with the shared sculpted body (no-op when the asset has no sculpt). */
function applySculpt(assetId, model) {
  if (typeof window !== 'undefined' && !window.__mvSculpt) window.__mvSculpt = sculptStats;
  const spec = SCULPT[assetId];
  if (!spec || G.params?.sculpt === '0') return false;
  let S = sculpted.get(assetId);
  if (S === undefined) {
    const t0 = performance.now();
    try { S = buildSculpt(model, spec); } catch (e) { G.reportError('creature:sculpt', e); S = null; }
    if (S) { S.ms = performance.now() - t0; S.tris = S.geo.index.count / 3; }
    sculpted.set(assetId, S);
  }
  if (!S) return false;
  const parts = [], drop = [];
  model.traverse((o) => { if (o.isSkinnedMesh && !o.userData.outline && o.layers.isEnabled(0)) parts.push(o); else if (o.isMesh && (o.userData.outline || !o.layers.isEnabled(0))) drop.push(o); });
  if (!parts.length) return false;
  const m0 = parts[0];
  const mesh = new THREE.SkinnedMesh(S.geo, S.mat);
  mesh.name = 'SculptBody'; mesh.position.copy(m0.position); mesh.quaternion.copy(m0.quaternion); mesh.scale.copy(m0.scale);
  m0.parent.add(mesh);
  mesh.bind(m0.skeleton, m0.bindMatrix);
  if (S.outGeo) {
    const om = new THREE.SkinnedMesh(S.outGeo, outlineMaterial());
    om.name = 'SculptBody_outline'; om.userData.outline = true; om.castShadow = false; om.receiveShadow = false; om.frustumCulled = false;
    om.position.copy(m0.position); om.quaternion.copy(m0.quaternion); om.scale.copy(m0.scale);
    m0.parent.add(om); om.bind(m0.skeleton, m0.bindMatrix);
  }
  for (const o of [...parts, ...drop]) o.parent?.remove(o);
  return true;
}

function placeholder() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), toon(PAL.shade));
  body.position.y = 0.45; body.scale.set(1, 0.85, 1.1);
  const eyeM = glow(PAL.shadeEye, 3);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeM); e.position.set(0.15 * s, 0.6, 0.42); e.name = 'Eye'; g.add(e); }
  g.add(body);
  return g;
}

// motion presets per body: breath (scale), bank (roll per yaw-rate × speed), lean (pitch per speed), spring stiffness
const MOTION = {
  quad: { breath: 0.018, bank: 0.05, lean: 0.012, k: 120, c: 11, hop: 0 },
  heavy: { breath: 0.012, bank: 0.025, lean: 0.01, k: 90, c: 10, hop: 0 },
  fly: { breath: 0.02, bank: 0.12, lean: 0.03, k: 110, c: 9, hop: 0 },
  hover: { breath: 0.03, bank: 0.08, lean: 0.035, k: 100, c: 8, hop: 0 },
  paper: { breath: 0.0, bank: 0.14, lean: 0.06, k: 140, c: 8, hop: 0 },
  jelly: { breath: 0.04, bank: 0.03, lean: 0.03, k: 80, c: 5, hop: 1 },
  fish: { breath: 0.0, bank: 0.1, lean: 0.0, k: 120, c: 12, hop: 0 },
  bird: { breath: 0.02, bank: 0.05, lean: 0.03, k: 140, c: 12, hop: 0 },
};
function motionOf(id) {
  if (!id) return 'hover';
  if (/koi/.test(id)) return 'fish';
  if (/chicken/.test(id)) return 'bird';
  if (/bat|ghost|bee|birdling|eye|squid/.test(id)) return 'fly';
  if (/golem|cyclops|tree|mushroom_king/.test(id)) return 'heavy';
  if (/slime|glub/.test(id)) return 'jelly';
  return 'quad';
}
function styleOf(tint, cfg) {
  if (cfg?.style) return cfg.style;
  if (tint === 'shade') return 'shade';
  if (tint === 'paper') return 'paper';
  if (tint === 'stone') return 'stone';
  return 'light';
}

// ---- draw-call pass (docs/api/actors-look.md "Draw-call pass"): untinted asset-pack animals (cow, horse, wolf, koi…) are
// one SkinnedMesh per untextured material (5–8 draws). Parts whose cel uniforms match except the colour merge into one
// mesh with the colour folded into the vertex colour (same maths per fragment: diffuse x vColor). Eye meshes (blink by name), maps,
// morphs and tinted creatures (setTint keys on part names) stay as they are. Built once per asset; clones share it.
const merges = new Map();   // key (geometry + material ids) -> { geo, mat } | null
const sameV = (a, b) => (a === b) || (a && b && a.equals ? a.equals(b) : false);
function celKey(m) {
  if (!m?.isCelMaterial || m.cel?.multi || m.map || m.emissiveMap || m.alphaMap || m.normalMap || m.transparent || m.alphaTest > 0) return null;
  return m;
}
// vertex colours the merge can fold: rgb, or rgba with alpha 1 everywhere (an opaque part's alpha changes nothing)
function opaqueColors(c) {
  if (!c || c.itemSize === 3) return true;
  if (c.itemSize !== 4) return false;
  for (let i = 0; i < c.count; i++) if (c.getW(i) < 0.999) return false;
  return true;
}
function compatible(a, b) {
  if (a.cel.kind !== b.cel.kind || a.side !== b.side || a.opacity !== b.opacity || a.depthWrite !== b.depthWrite || a.fog !== b.fog
    || a.blending !== b.blending || a.toneMapped !== b.toneMapped || !a.emissive.equals(b.emissive) || a.emissiveIntensity !== b.emissiveIntensity
    || a.customProgramCacheKey?.() !== b.customProgramCacheKey?.() || a.userData.sculpt !== b.userData.sculpt) return false;
  for (const k in a.celU) if (!sameV(a.celU[k].value, b.celU[k]?.value)) return false;
  return true;
}
function mergeCreatureParts(model, clips) {
  if (G.params?.castmerge === '0' || G.params?.perf === '0') return 0;
  // nodes the clips move (some asset-pack rigs animate the mesh nodes themselves: the slime's Body / HandL…) stay
  const animated = new Set();
  for (const c of clips || []) for (const t of c.tracks || []) animated.add(t.name.slice(0, t.name.lastIndexOf('.')));
  model.updateMatrixWorld(true);
  const cand = [];
  model.traverse((o) => {
    // a mesh with children (bones or parts hung under it) stays: removing it would cut them off the animated tree
    if (!o.isSkinnedMesh || o.children.length || animated.has(o.name) || o.userData.outline || /Eye|Core|Flame/.test(o.name) || Array.isArray(o.material) || !o.visible) return;
    const g = o.geometry;
    if (!celKey(o.material) || (o.material.vertexColors && !opaqueColors(g.attributes.color)) || g.morphAttributes.position || g.groups.length > 1 || !g.attributes.normal || !g.attributes.skinIndex) return;
    cand.push(o);
  });
  const groups = [];
  for (const o of cand) {
    const gr = groups.find((l) => { const a = l[0]; return sameBones(a.skeleton, o.skeleton) && a.bindMatrix.equals(o.bindMatrix) && a.matrixWorld.equals(o.matrixWorld)
      && a.parent === o.parent && a.renderOrder === o.renderOrder && compatible(a.material, o.material); });
    if (gr) gr.push(o); else groups.push([o]);
  }
  let saved = 0;
  for (const list of groups) {
    if (list.length < 2) continue;
    const key = list.map((o) => o.geometry.id + ':' + o.material.id).join(',');
    let rec = merges.get(key);
    if (rec === undefined) {
      rec = null;
      try {
        const names = Object.keys(list[0].geometry.attributes).filter((n) => n !== 'color' && list.every((o) => o.geometry.attributes[n]));
        const geos = list.map((o) => {
          const g = o.geometry, c = new THREE.BufferGeometry(), n = g.attributes.position.count;
          for (const a of names) c.setAttribute(a, g.attributes[a]);
          if (g.index) c.setIndex(g.index);
          // the colour three would use: vertex colour (if the part has them) x material colour
          const col = new Float32Array(n * 3), k = o.material.color, vc = o.material.vertexColors ? g.attributes.color : null;
          for (let i = 0; i < n; i++) {
            col[i * 3] = k.r * (vc ? vc.getX(i) : 1); col[i * 3 + 1] = k.g * (vc ? vc.getY(i) : 1); col[i * 3 + 2] = k.b * (vc ? vc.getZ(i) : 1);
          }
          c.setAttribute('color', new THREE.BufferAttribute(col, 3));
          return c;
        });
        const idx = geos.some((g) => g.index);
        const hz = harmonize(idx ? geos.map((g) => (g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]))) : geos);
        const geo = BGU.mergeGeometries(hz, false);
        if (geo) {
          geo.computeBoundingSphere(); geo.computeBoundingBox();
          const mat = list[0].material.clone();
          mat.color.setRGB(1, 1, 1); mat.vertexColors = true;
          mat.name = 'CelMergedFur:' + list.map((o) => o.material.name || '?').join('+');
          mat.userData = { ...list[0].material.userData };
          hookMaterial(mat);
          rec = { geo, mat };
        }
      } catch (e) { console.warn('[creature] part merge skipped', e); }
      merges.set(key, rec);
    }
    if (!rec) continue;
    const first = list[0];
    const mesh = new THREE.SkinnedMesh(rec.geo, rec.mat);
    mesh.name = 'cel:creature';
    mesh.position.copy(first.position); mesh.quaternion.copy(first.quaternion); mesh.scale.copy(first.scale);
    mesh.castShadow = list.some((o) => o.castShadow); mesh.receiveShadow = list.some((o) => o.receiveShadow);
    mesh.renderOrder = first.renderOrder;
    mesh.userData.mergedParts = list.map((o) => o.material.name || '');
    first.parent.add(mesh);
    mesh.bind(first.skeleton, first.bindMatrix);
    for (const o of list) o.parent.remove(o);
    saved += list.length - 1;
  }
  return saved;
}

/**
 * Create a creature (not pooled). opts: { scale=1, tint=null, eyeColor, clips:{state:clipName}, castShadow=true,
 * blob=true, blobRadius, primitive: Object3D | () => Object3D (use this instead of a model), motion, style }
 */
export function createCreature(assetId, opts = {}) {
  const scale = opts.scale ?? 1;
  const old = OLD();
  const group = new THREE.Group();
  group.name = 'creature:' + assetId;
  // a body from the sculpt kit (G.sculpt type, e.g. 'hen' -> sculpt_ani_chicken: same skeleton + clips, its own smooth
  // vertex-coloured body) replaces the asset-pack mesh, and applySculpt must not re-subdivide it / read its colours as AO
  const kit = !opts.primitive && !old && KIT_BODY[assetId];
  const kitId = kit && kitOn(kit[0]) ? kitPick(kit[1]) : null;
  const own = !opts.primitive && KIT_OWN[assetId];
  const ownId = own && !old && kitOn(own.type) ? kitPick(assetId) : null;
  if (own) {
    if (ownId) opts = Object.assign({}, opts, { tint: null });
    else assetId = own.old;
  }
  const ownKit = !!ownId;
  const srcId = kitId || ownId || assetId;   // the asset whose model (and clips) is used
  let model = (typeof opts.primitive === 'function' ? opts.primitive() : opts.primitive) || (assetId ? G.assets?.model(srcId) : null);
  const missing = !model;
  if (!model) model = placeholder();
  else if (!opts.primitive && !old && !kitId && !ownKit) applySculpt(assetId, model);
  if (!missing && kitId && KIT_GLOW[kit[1]] != null && !opts.tint) kitGlow(model, KIT_GLOW[kit[1]]);
  if (!missing && (kitId || ownKit)) {
    if (ownKit && own.style) model.userData.creature = Object.assign({}, model.userData.creature, { style: own.style });
    if (ownKit && (own.glow != null || own.lift != null)) kitGlow(model, own.glow, own.lift);
    if (ownKit && own.eyes) addKitEyes(model, own.eyes);
    if (ownKit) { let sm = null; model.traverse((o) => { if (!sm && o.isSkinnedMesh && !o.userData.outline) sm = o; }); if (sm) kitFrame(model, sm); }
  }
  if (!missing && !opts.primitive && !old && !opts.tint && !SCULPT[assetId] && !kitId && !ownKit) mergeCreatureParts(model, model.userData.clips || G.assets?.clips(assetId));
  const cfg = model.userData.creature || null;
  model.scale.multiplyScalar(scale);
  const s0 = model.scale.x;
  const body = new THREE.Group(); body.name = 'creatureBody';
  body.add(model);
  group.add(body);
  const castShadow = opts.castShadow ?? true;
  const meshes = [];
  const outlines = [];
  const eyes = [];
  model.traverse((o) => {
    if (o.userData.outline) { outlines.push(o); return; }
    if (o.name === 'Eye') eyes.push(o);
    if (o.isMesh || o.isSkinnedMesh) {
      o.castShadow = castShadow && !/Eye|Core|Flame/.test(o.name); o.receiveShadow = true;
      o.frustumCulled = !o.isSkinnedMesh; // skinned bounds do not follow the animation
      meshes.push(o);
    }
  });
  const orig = new Map(meshes.map((m) => [m, m.material]));
  const cur = new Map(orig);
  // skinned bounds: pose the skeleton first, or the box is the raw bind-space mesh (often in centimetres, 100x too big)
  model.updateMatrixWorld(true);
  for (const m of meshes) if (m.isSkinnedMesh && m.skeleton) { m.skeleton.update(); m.computeBoundingBox(); }
  const box = new THREE.Box3().setFromObject(model);
  const height = Math.max(0.2, box.max.y - box.min.y);
  const length = Math.max(box.max.z - box.min.z, box.max.x - box.min.x);

  const clips = missing ? [] : (model.userData.clips || G.assets?.clips(srcId) || []);
  const mixer = clips.length ? new THREE.AnimationMixer(model) : null;
  const table = Object.assign({}, clipUse(assetId), opts.clips || {});
  const actions = new Map();
  const blob = opts.blob === false ? null : makeActorShadowBlob(opts.blobRadius ?? Math.max(0.3, length * 0.42), 0.4);

  // upgrade 3: per-creature fx uniforms + clones, motion state, bone life
  const U = fxUniforms();
  U.uFxB.value.set(box.min.y, height, Math.max(0.2, length * 0.5), 3);
  const fxOn = !old && !cfg?.noFx;
  const fxCache = new Map();
  const fxOf = (mat) => {
    if (!fxOn) return mat;
    if (Array.isArray(mat)) return mat.map(fxOf);
    let f = fxCache.get(mat);
    if (!f) { f = fxClone(mat, U); fxCache.set(mat, f); }
    return f;
  };
  const motion = MOTION[opts.motion || cfg?.motion || motionOf(assetId)] || MOTION.quad;
  const bones = !old && !missing && !opts.primitive ? boneRig(model) : null;
  const ink = old ? null : makeInkBlot();
  const M = { px: 0, py: 0, pz: 0, yaw: 0, init: false, vx: 0, vy: 0, vz: 0, spd: 0, yawRate: 0,
    sq: 0, sqv: 0, pit: 0, pitv: 0, roll: 0, rollv: 0, bank: 0, lean: 0, ph: Math.random() * TAU, t: 0,
    tell: 0, tellPrev: 0, flash: 0, app: 0, appDur: 0.5, blinkT: 1 + Math.random() * 3, blink: 0, near: 1e9, look: null };

  const c = {
    id: assetId, group, body, model, mixer, scale, height, length, blob, missing, U, eyes,
    state: '', timeScale: 1, busy: false, _onDone: null, _next: null, _flashT: 0, _diss: null, _dissMat: null, tint: null,
    style: styleOf(opts.tint, cfg), motion,
    /** 0..1 attack wind-up (set every frame by the owner while an attack is being told; 0 otherwise). */
    tell: 0,
    /** world point the head turns toward (animals), or null. */
    lookAt: null,
    has(s) { return !!(mixer && table[s] && findClip(clips, table[s])); },
    action(s) {
      if (!mixer) return null;
      if (actions.has(s)) return actions.get(s);
      const clip = findClip(clips, table[s]);
      const a = clip ? mixer.clipAction(clip) : null;
      actions.set(s, a);
      return a;
    },
    /** play(state, { fade=0.2, loop, speed=1, once, onDone, next }) — one-shots fall back to `next` or the last loop. */
    play(s, o = {}) {
      let a = c.action(s);
      if (!a) { if (s === 'run') return c.play('move', o); if (s === 'fly') return c.play('idle', o); if (s !== 'idle' && !o.once) return c.play('idle', o); if (o.once) { o.onDone?.(c); } return false; }
      const once = !!o.once;
      if (c.state === s && !once && !o.restart) { a.timeScale = o.speed ?? a.timeScale; return true; }
      const fade = o.fade ?? 0.2;
      const prev = c.state ? c.action(c.state) : null;
      a.reset();
      a.enabled = true;
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.timeScale = o.speed ?? 1;
      a.setEffectiveWeight(1);
      if (prev && prev !== a) a.crossFadeFrom(prev, fade, false); else a.fadeIn(fade);
      a.play();
      if (!once) c._loop = s;
      c.state = s; c.busy = once; c._onDone = once ? (o.onDone || null) : null; c._next = once ? (o.next || null) : null;
      return true;
    },
    setTimeScale(k) { c.timeScale = k; },
    setTint(t, eyeColor) {
      c.tint = t;
      if (!cfg?.style) c.style = styleOf(t, cfg);
      for (const [m, mat] of orig) {
        const mats = Array.isArray(mat) ? mat : [mat];
        const out = mats.map((x) => fxOf(t ? tintMaterial(x, t, eyeColor) : x));
        const v = Array.isArray(mat) ? out : out[0];
        cur.set(m, v); m.material = v;
      }
      if (eyeColor != null) U.uFxT.value.set(...new THREE.Color(eyeColor).toArray(), 0);
      else if (t === 'shade') U.uFxT.value.set(...new THREE.Color(PAL.shadeEye).toArray(), 0);
    },
    /** Hit: a flash that fades, a squash and a recoil away from the blow. */
    flash(sec = 0.08) {
      if (c._diss) return;
      if (!fxOn) {
        if (!flashMat) flashMat = glow(0xfff2f6, 1.5);
        c._flashT = sec;
        // halos and other see-through shells keep their own material (a flashed halo reads as an opaque white disc)
        for (const m of meshes) if (!cur.get(m)?.transparent) m.material = flashMat;
        M.sqv -= 2.6;
        return;
      }
      M.flash = 1; c._flashT = Math.max(sec, 0.06) * 2.2;
      M.sqv -= 2.6; M.pitv -= 5.5;
    },
    /** Rise out of an ink blot (spawn presentation; gameplay is live at once). */
    appear(dur = 0.55) {
      if (!fxOn || c._diss) return;
      M.app = dur; M.appDur = dur;
      const st = STYLES[c.style] || STYLES.shade;
      U.uFxM.value.set(0, 1, 0, 0.7); U.uFxB.value.w = st.f;
      U.uFxC.value.set(INK.r * 2, INK.g * 2, INK.b * 2, 0.14);
      U.uFx.value.x = 1;
      M.sq = -0.35; M.sqv = 0;
      for (const o of outlines) o.visible = false;
      if (ink && c.style !== 'light') { ink.visible = true; ink.material.opacity = 0; }
    },
    /** Dissolve over dur seconds in the creature's own style (call update each frame). */
    dissolve(dur = 0.9, color = PAL.shadeGlow) {
      if (c._diss) return;
      if (!fxOn) {
        if (!c._dissMat) c._dissMat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
        c._dissMat.color.set(color).multiplyScalar(1.6);
        c._dissMat.opacity = 1;
        c._diss = { t: 0, dur, s0: model.scale.x, old: true };
        for (const m of meshes) { m.material = c._dissMat; m.castShadow = false; }
        for (const o of outlines) o.visible = false;
        return;
      }
      const st = STYLES[c.style] || STYLES.shade;
      c._diss = { t: 0, dur, s0: model.scale.x, motes: false };
      M.app = 0; M.flash = 0;
      U.uFxM.value.set(...st.m); U.uFxB.value.w = st.f;
      const col = new THREE.Color(c.style === 'paper' || c.style === 'stone' ? st.c : color);
      U.uFxC.value.set(col.r, col.g, col.b, st.w);
      for (const m of meshes) m.castShadow = false;
      for (const o of outlines) o.visible = false;
    },
    get dissolving() { return !!c._diss; },
    get dissolved() { return !!c._diss && c._diss.t >= c._diss.dur; },
    place(x, y, z, yaw) {
      group.position.set(x, y, z);
      if (yaw !== undefined) group.rotation.y = yaw;
      if (blob) {
        const gy = G.world ? G.world.groundAt(x, z, y + 0.5) : 0;
        blob.userData.place(x, gy, z, Math.max(0, y - gy));
      }
    },
    update(dt) {
      const cam = G.camera;
      const dist = cam ? group.position.distanceTo(cam.position) : 0;
      M.near = dist;
      if (bones && dist < 32) restBones(bones);
      // far creatures: the mixer runs at half rate (two steps folded into one)
      if (mixer && dt > 0) {
        if (dist < 45 || old) mixer.update(dt * c.timeScale);
        else { M.acc = (M.acc || 0) + dt; if ((M.skip = !M.skip)) { mixer.update(M.acc * c.timeScale); M.acc = 0; } }
      }
      if (outlines.length) {
        updateCelGlobals(G);
        const v = !c._diss && !(M.app > 0) && !!cam && dist < CEL_U.uOutFar.value;
        for (const o of outlines) o.visible = v;
      } else if (opts.primitive) updateCelGlobals(G);
      if (c.busy && c.state) {
        const a = c.action(c.state);
        if (!a || !a.isRunning() || a.time >= a.getClip().duration - 1e-3) {
          const cb = c._onDone, nx = c._next;
          c.busy = false; c._onDone = null; c._next = null;
          let handled = false;
          if (cb) { try { handled = cb(c) === true; } catch (e) { G.reportError('creature:onDone', e); } }
          if (!handled && !c.busy) c.play(nx || c._loop || 'idle', { fade: 0.18 });
        }
      }
      if (old) { oldFx(dt); return; }
      if (dt > 0) life(dt, dist);
      if (bones && dist < 32 && dt > 0) boneLife(bones, dt);
    },
    addTo(parent = G.scene) {
      parent.add(group);
      if (blob) G.scene.add(blob);
      if (ink) G.scene.add(ink);
      return c;
    },
    reset() {
      c._diss = null; c._flashT = 0; c.busy = false; c._onDone = null; c._next = null; c.timeScale = 1; c.tell = 0; c.lookAt = null;
      model.scale.setScalar(s0); model.position.set(0, 0, 0);
      body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.setScalar(1);
      group.rotation.set(0, 0, 0); group.scale.setScalar(1); group.visible = true;
      for (const m of meshes) { m.material = cur.get(m); m.castShadow = castShadow && !/Eye|Core|Flame/.test(m.name); }
      for (const o of outlines) o.visible = true;
      for (const e of eyes) e.scale.y = e.userData.sy ?? (e.userData.sy = e.scale.y);
      U.uFx.value.set(0, 0, 0, 0); U.uJig.value.set(0, 0, 0, 0);
      Object.assign(M, { init: false, sq: 0, sqv: 0, pit: 0, pitv: 0, roll: 0, rollv: 0, bank: 0, lean: 0, tell: 0, tellPrev: 0, flash: 0, app: 0, blink: 0 });
      if (ink) ink.visible = false;
      if (blob) blob.visible = true;
      if (bones) restBones(bones);
      if (mixer) { mixer.stopAllAction(); c.state = ''; }
    },
    remove() { group.parent?.remove(group); blob?.parent?.remove(blob); ink?.parent?.remove(ink); },
    /** Return to the pool (pooled creatures) or dispose. */
    release() {
      c.remove();
      if (c._poolKey) { c.reset(); const p = pools.get(c._poolKey); if (p && p.length < 24) { p.push(c); return; } }
      c.dispose();
    },
    dispose() {
      c.remove();
      mixer?.stopAllAction();
      if (mixer) mixer.uncacheRoot(model);
      model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
      c._dissMat?.dispose();
      for (const f of fxCache.values()) f.dispose?.();
      for (const mat of cur.values()) for (const x of [].concat(mat)) if (x && x.userData && x.userData.shared === false && !x.userData.fxOf) x.dispose();
      blob?.geometry.dispose(); blob?.material.dispose();
      ink?.material.dispose();
    },
  };

  // ---- the pre-upgrade flash / dissolve (?crv=1) --------------------------------------------------------------------------
  function oldFx(dt) {
    if (c._flashT > 0) {
      c._flashT -= dt;
      if (c._flashT <= 0 && !c._diss) for (const m of meshes) m.material = cur.get(m);
    }
    if (c._diss) {
      const d = c._diss;
      d.t += dt;
      const k = clamp(d.t / d.dur);
      c._dissMat.opacity = (1 - k) * (1 - k);
      model.scale.setScalar(d.s0 * (1 - 0.55 * k));
      model.position.y = k * 0.6 * height;
      if (blob) blob.visible = k < 0.5;
    }
  }

  // ---- procedural body life ------------------------------------------------------------------------------------------------
  function life(dt, dist) {
    const p = group.position;
    M.t += dt;
    if (!M.init) { M.px = p.x; M.py = p.y; M.pz = p.z; M.yaw = group.rotation.y; M.init = true; }
    const idt = 1 / Math.max(dt, 1e-3);
    const vx = (p.x - M.px) * idt, vy = (p.y - M.py) * idt, vz = (p.z - M.pz) * idt;
    const yr = angleDiff(M.yaw, group.rotation.y) * idt;
    M.px = p.x; M.py = p.y; M.pz = p.z; M.yaw = group.rotation.y;
    // teleports / respawns: no spring kick
    const jump = Math.abs(vx) + Math.abs(vz) > 60 || Math.abs(vy) > 60;
    const spd = jump ? M.spd : Math.hypot(vx, vz);
    M.spd = damp(M.spd, spd, 8, dt);
    M.yawRate = damp(M.yawRate, jump ? 0 : clamp(yr, -8, 8), 10, dt);
    // landings squash (vertical speed snaps from falling to resting)
    if (!jump && M.vy < -3 && vy > -0.5 && motion.hop >= 0) M.sqv -= clamp(-M.vy * 0.25, 0, 2.2) * (motion.hop ? 1.6 : 0.6);
    if (!jump && motion.hop && M.vy < 1.5 && vy > 4) M.sqv += 2.2;   // take-off stretch
    M.vy = jump ? 0 : vy;
    // attack tell: crouch + lean back + shiver while winding up, a stretch the moment it is released
    const tell = clamp(c.tell);
    if (M.tellPrev > 0.45 && tell === 0 && !c._diss) { M.sqv += 3.2; M.pitv += 6; }
    M.tellPrev = tell;
    M.tell = damp(M.tell, tell, 14, dt);
    // springs (squash, pitch recoil, roll)
    const k = motion.k, cc = motion.c;
    M.sqv += (-k * M.sq - cc * M.sqv) * dt; M.sq += M.sqv * dt;
    M.pitv += (-k * M.pit - cc * M.pitv) * dt; M.pit += M.pitv * dt;
    M.sq = clamp(M.sq, -0.5, 0.5); M.pit = clamp(M.pit, -0.6, 0.6);
    const bankT = clamp(-M.yawRate * Math.min(M.spd, 9) * motion.bank, -0.4, 0.4);
    M.bank = damp(M.bank, bankT, 6, dt);
    M.lean = damp(M.lean, clamp(M.spd * motion.lean, 0, 0.3), 5, dt);
    // breathing (slower when resting), blink
    const br = Math.sin(M.t * (M.spd > 0.5 ? 4.2 : 2.1) + M.ph) * motion.breath;
    const sh = M.tell > 0.01 ? Math.sin(M.t * 47) * 0.025 * M.tell : 0;
    let sy = 1 + M.sq + br - 0.14 * M.tell;
    let sxz = 1 / Math.sqrt(Math.max(0.3, 1 + M.sq)) - br * 0.5 + 0.06 * M.tell;
    // death presentation in the body
    if (c._diss) {
      const d = c._diss; d.t += dt;
      const kk = clamp(d.t / d.dur);
      let u = kk;
      if (c.style === 'slime') {
        // splat flat first, then soak in
        const s1 = clamp(kk / 0.3);
        sy *= 1 - 0.68 * s1; sxz *= 1 + 0.5 * s1;
        u = clamp((kk - 0.22) / 0.78);
      } else if (c.style === 'shade') { sy *= 1 + 0.25 * kk; sxz *= 1 - 0.15 * kk; body.position.y = kk * 0.35 * height; }
      else if (c.style === 'paper') { sxz *= 1 - 0.2 * kk; body.position.y = kk * 0.25; body.rotation.z = Math.sin(kk * 9) * 0.15 * kk; }
      else if (c.style === 'light') { sy *= 1 + 0.6 * kk; sxz *= 1 - 0.6 * kk; }
      U.uFx.value.x = Math.min(1.0, u * 1.02);
      if (!d.motes && kk > 0.35 && (c.style === 'shade' || c.style === 'slime')) { d.motes = true; G.fx?.burst('hit_dark', _vp.set(p.x, p.y + height * 0.6, p.z), { scale: clamp(0.5 + height * 0.3, 0.5, 2.5) }); }
      if (blob) blob.visible = kk < 0.6;
      if (ink && ink.visible) { ink.material.opacity *= 0.9; }
    }
    // spawn: rise out of the ink
    if (M.app > 0) {
      M.app -= dt;
      const a = clamp(1 - M.app / M.appDur);
      U.uFx.value.x = Math.max(0, 1 - a * 1.08);
      body.position.y = -(1 - a) * (1 - a) * height * 0.45;
      if (ink) {
        const r = Math.max(0.5, length * 0.75);
        ink.visible = true;
        const gy = G.world ? G.world.groundAt(p.x, p.z, p.y + 0.5) : p.y;
        ink.position.set(p.x, gy + 0.03, p.z);
        ink.scale.setScalar(r * (0.4 + 0.7 * Math.min(1, a * 2.2)));
        ink.material.opacity = 0.85 * Math.min(1, a * 4) * (1 - clamp((a - 0.6) / 0.4));
      }
      if (M.app <= 0) { U.uFx.value.x = 0; body.position.y = 0; if (ink) ink.visible = false; }
    } else if (!c._diss && body.position.y !== 0) body.position.y = 0;
    body.scale.set(sxz, Math.max(0.2, sy), sxz);
    body.rotation.x = M.lean - 0.18 * M.tell + M.pit * 0.6;
    body.rotation.z = M.bank + sh;
    // fx uniforms
    U.uFxO.value.set(p.x, p.y, p.z, group.rotation.y);
    if (M.flash > 0) { M.flash = Math.max(0, M.flash - dt / Math.max(0.05, c._flashT)); }
    U.uFx.value.y = M.flash * M.flash;
    U.uFx.value.z = M.tell * (0.7 + 0.3 * Math.sin(M.t * 22));
    // jelly / paper vertex uniforms: lean against motion, wobble energy
    U.uJig.value.set(M.sq * 0.5, M.bank * -0.15, M.lean * 0.3, clamp(Math.abs(M.sqv) * 0.3 + M.spd * 0.15, 0, 1.5));
    // blinks (eyes named 'Eye')
    if (eyes.length && dist < 30) {
      M.blinkT -= dt;
      if (M.blinkT <= 0) { M.blink = 1; M.blinkT = 2 + Math.random() * 4; }
      if (M.blink > 0) M.blink = Math.max(0, M.blink - dt / 0.14);
      const b = M.blink > 0 ? Math.abs(M.blink * 2 - 1) : 1;
      const f = 0.12 + 0.88 * b * (1 + 0.25 * M.tell);
      for (const e of eyes) e.scale.y = (e.userData.sy ?? (e.userData.sy = e.scale.y)) * f;
    }
  }
  function restBones(R) {
    if (R.head) R.head.b.quaternion.copy(R.head.rest);
    if (R.neck) R.neck.b.quaternion.copy(R.neck.rest);
    for (const j of R.ears) j.b.quaternion.copy(j.rest);
    for (const j of R.tail) j.b.quaternion.copy(j.rest);
  }
  // the mixer has written this frame's pose (or the rest pose for untracked bones): add life on top
  function boneLife(R, dt) {
    // tail: a spring that lags behind turns and swings with the gait
    const drive = -M.yawRate * 0.22 + Math.sin(M.t * (M.spd > 2 ? 9 : 2.2) + M.ph) * (M.spd > 2 ? 0.12 : 0.07);
    R.tailV += ((drive - R.tailA) * 60 - R.tailV * 9) * dt; R.tailA += R.tailV * dt;
    const n = R.tail.length;
    for (let i = 0; i < n; i++) rot(R.tail[i], R.tail[i].up, R.tailA * (0.5 + i / n) * (c.style === 'shade' ? 1.2 : 1));
    // ears: a flick now and then, pinned back during a tell or a flight
    R.earT -= dt;
    if (R.earT <= 0) { R.earT = 1.5 + Math.random() * 4; R.earK = 1; R.earS = Math.random() < 0.5 ? -1 : 1; }
    R.earK = Math.max(0, R.earK - dt * 6);
    const flick = Math.sin(R.earK * Math.PI) * 0.45;
    const pin = clamp(M.tell + (M.spd > 5 ? 0.6 : 0));
    for (let i = 0; i < R.ears.length; i++) {
      const j = R.ears[i];
      rot(j, j.side, -0.5 * pin + (i % 2 ? flick * R.earS : -flick * R.earS * 0.6));
    }
    // head: looks toward lookAt (the heroine, a threat) within limits, lifts during a tell
    let wy = 0, wp = 0;
    const L = c.lookAt;
    if (L && R.head) {
      const p = group.position;
      const dx = L.x - p.x, dz = L.z - p.z, dd = Math.hypot(dx, dz);
      if (dd > 0.3 && dd < 14) {
        wy = clamp(angleDiff(group.rotation.y, Math.atan2(dx, dz)), -1.0, 1.0);
        wp = clamp(Math.atan2((L.y ?? p.y) + 1.0 - (p.y + height * 0.7), dd), -0.3, 0.45);
        if (Math.abs(angleDiff(group.rotation.y, Math.atan2(dx, dz))) > 2.2) wy = 0;
      }
    }
    R.lookY = damp(R.lookY, wy, 4, dt); R.lookP = damp(R.lookP, wp, 4, dt);
    if (R.head) { rot(R.head, R.head.up, R.lookY * 0.6); rot(R.head, R.head.side, -R.lookP * 0.6 - M.tell * 0.2); }
    if (R.neck) { rot(R.neck, R.neck.up, R.lookY * 0.4); rot(R.neck, R.neck.side, -R.lookP * 0.4); }
  }

  if (opts.tint) c.setTint(opts.tint, opts.eyeColor);
  else if (fxOn) for (const [m, mat] of orig) { const v = fxOf(mat); cur.set(m, v); m.material = v; }
  return c;
}
const _vp = new THREE.Vector3();

/** Pooled createCreature: same options; the pool key is asset + tint + scale. c.release() returns it. */
export function acquireCreature(assetId, opts = {}) {
  const key = (opts.key || assetId) + '|' + (typeof opts.tint === 'string' ? opts.tint : opts.tint ? JSON.stringify(opts.tint) : '') + '|' + (opts.scale ?? 1) + '|' + (opts.eyeColor ?? '');
  let p = pools.get(key);
  if (!p) pools.set(key, (p = []));
  const c = p.pop() || createCreature(assetId, opts);
  c._poolKey = key;
  c.reset();
  return c;
}

export function creaturePoolStats() {
  let n = 0;
  for (const p of pools.values()) n += p.length;
  return { pools: pools.size, pooled: n };
}
