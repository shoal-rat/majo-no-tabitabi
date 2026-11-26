// Baked tree impostors (environment round 2). At boot every tree species that has a far tier is rendered from its own
// near model into an atlas: F azimuths at a low elevation, two layers — albedo (premultiplied by coverage; the crown is
// the painted shade with a white tint, the trunk its real bark colour) and normal (model space, premultiplied, A = the
// instance-tint mask). Far trees are then ONE draw call of camera-facing quads (cylindrical for the camera, facing the
// light in the shadow pass) that pick the two nearest frames, blend them, rebuild the instance tint / land multiplier /
// per-clump hue drift / night glow and are lit by the shared look (hookMaterial) with the baked normals — so a forest
// at 80–900 m is the same painted crowns, not blobs. Near models dither out while impostors dither in (fFade).
// Shadow casting: the same instances, packed nearest first, cast into the far cascade (prefix `shadowCount`); a block of
// shadow-only instances in front of them (`skip`, hidden in the colour pass) gives trees between the near-model shadow
// range (52 m) and the far tier their shadows too.
import * as THREE from 'three';
import { canopyPigment, crownPlane } from './canopyBrush.js';
import { toonGradient, hookMaterial } from '../../core/mats.js';
import { FU, PALETTE_GLSL, CORE_LEAF } from './material.js';

const F = 8;            // azimuth frames per species
const ELEV = 0.16;      // bake camera elevation (y of the unit view direction before normalising)
const ELEV2 = 1.0;      // round 3: second pitch row (45°), so crowns look right from high vantage points

// ------------------------------------------------------------------ bake
const BAKE_VS = /* glsl */`
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec3 color; attribute vec2 uv; attribute vec4 aCard; attribute float aMix; attribute vec4 aLeaf;
uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
uniform vec4 crownC; uniform vec3 crownR; uniform vec3 core; uniform float paintedCrown;
${crownPlane}
varying vec3 vC; varying vec2 vUv; varying vec3 vN; varying float vMix;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float cr = cos(aCard.w), sr = sin(aCard.w);
  vec2 ov = vec2(aCard.x * cr - aCard.y * sr, aCard.x * sr + aCard.y * cr) * aCard.z;
  mv.xy += ov;
  gl_Position = projectionMatrix * mv;
  vC = color; vUv = uv; vN = normal; vMix = aMix;
  // look round: the same crown-volume normal and shade as the near cards (material.js VERT_CROWN)
  if (crownC.w > 0.5) {
    vec3 rgt = vec3(modelViewMatrix[0][0], modelViewMatrix[1][0], modelViewMatrix[2][0]);
    vec3 upv = vec3(modelViewMatrix[0][1], modelViewMatrix[1][1], modelViewMatrix[2][1]);
    vec3 rel = (position + rgt * ov.x + upv * ov.y - crownC.xyz) * crownR;
    float rl = length(rel);
    vec3 n = normalize(rel * crownR + vec3(0.0, 1e-4, 0.0));
    vN = normalize(n * 0.86 + normalize(normal + vec3(0.0, 1e-4, 0.0)) * 0.14 + vec3(0.0, 0.1, 0.0));
    vec3 hue = color / max(color.g, 1e-3);
    float o = smoothstep(0.25, 1.05, rl);
    float up = clamp(rel.y / max(rl, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
    float upS = smoothstep(0.18, 0.82, up);
    vec3 rk = position + rgt * ov.x + upv * ov.y - aLeaf.xyz;
    float upK = smoothstep(0.3, 0.74, clamp(rk.y / max(length(rk), 1e-3) * 0.5 + 0.5, 0.0, 1.0));
    if (paintedCrown > 0.5) vC = crownPlane((aLeaf.xyz-crownC.xyz)*crownR,hue,core);
    else vC = hue * (mix(0.6, 1.0, o) * (0.7 + 0.34 * upS) * (0.6 + 0.55 * upK)) * mix(core, vec3(1.0), o * (0.55 + 0.45 * upS));
  }
}`;
const BAKE_FS = /* glsl */`
precision highp float;
${canopyPigment}
uniform sampler2D map; uniform float paintedCrown; uniform float hasMap; uniform float tintPart; uniform vec3 col2; uniform vec3 mixCol; uniform float mode;
varying vec3 vC; varying vec2 vUv; varying vec3 vN; varying float vMix;
void main() {
  vec4 t = hasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0, 1.0, 0.0, 1.0);
  if (t.a < 0.42) discard;
  vec3 c; float mask;
  if (hasMap > 0.5) { c = vC * mix(col2, vec3(1.0), t.g) * (paintedCrown > 0.5 ? canopyPigment(t.r) : vec3(0.25 + t.r)); mask = t.g * tintPart; }
  else { c = vC; mask = tintPart; }
  c = mix(c, mixCol * (hasMap > 0.5 ? 0.25 + t.r : 1.0), vMix);
  mask *= 1.0 - vMix;
  if (mode < 0.5) gl_FragColor = vec4(c, 1.0);
  else {
    vec3 n = normalize(vN + vec3(0.0, 1e-4, 0.0)) * (gl_FrontFacing ? 1.0 : -1.0);
    gl_FragColor = vec4(n * 0.5 + 0.5, mask);
  }
}`;

/** Detach and delete a render target's depth renderbuffer (three made it; nothing draws into the target again). */
function dropDepth(r, rt) {
  const p = r.properties.get(rt), rb = p.__webglDepthbuffer;
  if (!rb || Array.isArray(rb)) return;
  const gl = r.getContext();
  r.setRenderTarget(rt);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, null);
  gl.deleteRenderbuffer(rb);
  p.__webglDepthbuffer = undefined;
  rt.depthBuffer = false;
}

/**
 * Bake impostor frames for the given models. models: [{ model }] (near models in model space).
 * Returns { albedo, normal, cols, rows, cell, info: [{ cx, cy, cz, he }] } or null when no renderer is present.
 */
export function bakeImpostors(G, models, cell) {
  const r = G.renderer;
  if (!r || !models.length) return null;
  const cols = F * 2, rows = Math.ceil(models.length / 2) * 2; // two pitch rows per pair of species
  const W = cols * cell, H = rows * cell;
  const mk = () => {
    const t = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, type: THREE.UnsignedByteType });
    t.texture.colorSpace = THREE.NoColorSpace; t.texture.anisotropy = 4;
    return t;
  };
  const rtA = mk(), rtN = mk();
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const mats = [];
  const meshes = models.map((m) => m.model.parts.map((p) => {
    const tex = !!(p.map && p.mat && p.mat.tex);
    const mx = p.mat && p.mat.mix ? p.mat.mix : [1, 1, 1, 0];
    const c2 = (p.mat && p.mat.col2) || [0.3, 0.45, 0.2];
    const cw = m.model.crown, vol = !!(p.mat && p.mat.bill && p.mat.leaf && cw);
    const mat = new THREE.RawShaderMaterial({
      vertexShader: BAKE_VS, fragmentShader: BAKE_FS, side: THREE.DoubleSide,
      uniforms: {
        paintedCrown: { value: p.mat?.paintedCrown ? 1 : 0 }, map: { value: tex ? p.map : null }, hasMap: { value: tex ? 1 : 0 }, tintPart: { value: p.rule.mode === 'tint' ? 1 : 0 },
        col2: { value: new THREE.Vector3(c2[0], c2[1], c2[2]) }, mixCol: { value: new THREE.Vector3(mx[0], mx[1], mx[2]) }, mode: { value: 0 },
        crownC: { value: new THREE.Vector4(vol ? cw.cx : 0, vol ? cw.cy : 0, vol ? cw.cz : 0, vol ? 1 : 0) },
        crownR: { value: new THREE.Vector3(...(vol ? [cw.rx, cw.ry, cw.rz] : [1, 1, 1]).map((r) => 1 / Math.max(0.05, r))) },
        core: { value: new THREE.Vector3(...((p.mat && p.mat.core) || CORE_LEAF)) },
      },
    });
    mats.push(mat);
    const mesh = new THREE.Mesh(p.geo, mat);
    mesh.frustumCulled = false; mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }));
  const info = models.map((m) => {
    const b = m.model.box;
    const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    return { cx: c.x, cy: c.y, cz: c.z, he: Math.max(s.y * 0.5, Math.hypot(s.x, s.z) * 0.5) * 1.06 };
  });
  // renderer state
  const prevRT = r.getRenderTarget(), prevCol = r.getClearColor(new THREE.Color()), prevA = r.getClearAlpha();
  const prevAuto = r.autoClear, prevShadow = r.shadowMap.autoUpdate;
  r.autoClear = false; r.shadowMap.autoUpdate = false;
  r.setClearColor(0x000000, 0);
  const dir = new THREE.Vector3();
  for (const [mode, rt] of [[0, rtA], [1, rtN]]) {
    for (const m of mats) m.uniforms.mode.value = mode;
    r.setRenderTarget(rt);
    rt.scissorTest = false; rt.viewport.set(0, 0, W, H);
    r.setRenderTarget(rt);
    r.clear(true, true, true);
    for (let s = 0; s < models.length; s++) {
      for (let k = 0; k < meshes.length; k++) for (const me of meshes[k]) me.visible = k === s;
      const I = info[s];
      cam.left = -I.he; cam.right = I.he; cam.top = I.he; cam.bottom = -I.he;
      cam.near = 0.1; cam.far = I.he * 6 + 10; cam.updateProjectionMatrix();
      for (let f2 = 0; f2 < F * 2; f2++) {
        const f = f2 % F, pr = f2 >= F ? 1 : 0;
        const th = (f / F) * Math.PI * 2;
        dir.set(Math.cos(th), pr ? ELEV2 : ELEV, Math.sin(th)).normalize();
        cam.position.set(I.cx + dir.x * (I.he * 3 + 4), I.cy + dir.y * (I.he * 3 + 4), I.cz + dir.z * (I.he * 3 + 4));
        cam.up.set(0, 1, 0);
        cam.lookAt(I.cx, I.cy, I.cz);
        cam.updateMatrixWorld();
        const col = (s % 2) * F + f, row = Math.floor(s / 2) * 2 + pr;
        rt.viewport.set(col * cell, row * cell, cell, cell);
        rt.scissor.set(col * cell, row * cell, cell, cell); rt.scissorTest = true;
        r.setRenderTarget(rt);
        r.render(scene, cam);
      }
    }
    rt.scissorTest = false; rt.viewport.set(0, 0, W, H);
  }
  // phones (docs/api/perf.md "Phone memory, round 2"): the depth buffers were for the bake only; the atlases are only
  // sampled from now on. 2 × 11.8 MB at the mobile cell size
  if (G.quality?.mobile) for (const rt of [rtA, rtN]) dropDepth(r, rt);
  r.setRenderTarget(prevRT);
  r.setClearColor(prevCol, prevA);
  r.autoClear = prevAuto; r.shadowMap.autoUpdate = prevShadow;
  for (const ms of meshes) for (const me of ms) scene.remove(me);
  for (const m of mats) m.dispose();
  return { albedo: rtA.texture, normal: rtN.texture, rtA, rtN, cols, rows, cell, info };
}

// ------------------------------------------------------------------ runtime material
const VERT_PARS = /* glsl */`
attribute vec3 aCol0;
attribute vec3 aCol1;
attribute vec4 aFx;
attribute vec4 aImp;     // model-space frame centre xyz, half extent (model units)
attribute float aImpS;   // species slot in the atlas
uniform vec4 impGrid;    // cols, rows, frames, skip (instances drawn only into shadow maps)
uniform float impPitch;  // 1: use the high pitch row + tilt (0 = round-2 behaviour, A/B only: URL param implow)
uniform vec4 fCam;
uniform vec4 fFade;
uniform float fTime;
uniform vec3 fWind;
varying vec2 vI0;
varying vec2 vI1;
varying float vIT;
varying float vIP;
varying vec3 vIC0;
varying vec3 vIC1;
varying vec4 vIFx;
varying vec3 vIAx;
varying vec3 vIAy;
varying vec3 vIAz;
varying vec2 vIUv;
varying float vFFade;
`;
const VERT_MAIN = /* glsl */`
vec3 transformed;
{
  mat3 im = mat3(instanceMatrix);
  vec3 io = instanceMatrix[3].xyz;
  vec3 cW = (instanceMatrix * vec4(aImp.xyz, 1.0)).xyz;
  float he = aImp.w * length(im[0]);
  bool ortho = projectionMatrix[3][3] > 0.5;
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 toC = ortho ? -fwd : cameraPosition - cW;
  vec3 rgt, up;
  if (ortho) {
    rgt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  } else {
    vec2 h = normalize(toC.xz + vec2(1e-4, 0.0));
    rgt = vec3(h.y, 0.0, -h.x); up = vec3(0.0, 1.0, 0.0);
    // round 3: tilt the quad toward a camera above (spherical billboard): the frames are baked perpendicular to the view
    vec3 tn = toC / max(length(toC), 1e-3);
    up = normalize(mix(up, cross(tn, rgt), impPitch) + vec3(0.0, 1e-5, 0.0));
  }
  // a little sway of the top edge with the wind
  float sw = (position.y * 0.5 + 0.5) * (position.y * 0.5 + 0.5) * 0.025 * he;
  vec3 wp = cW + (rgt * position.x + up * position.y) * he + fWind * sw * (0.8 + 0.2 * sin(fTime * 1.3 + aFx.z * 6.3));
  if (float(gl_InstanceID) < impGrid.w) wp = cW;
  transformed = he > 1e-4 ? inverse(im) * (wp - io) : vec3(0.0);
  vec3 ax = normalize(im[0] + vec3(1e-6, 0.0, 0.0)), ay = normalize(im[1] + vec3(0.0, 1e-6, 0.0)), az = normalize(im[2] + vec3(0.0, 0.0, 1e-6));
  vIAx = ax; vIAy = ay; vIAz = az;
  vec2 ld = vec2(dot(toC, ax), dot(toC, az));
  float phi = atan(ld.y, ld.x + 1e-5);
  float fr = fract(phi / 6.2831853 + 1.0) * impGrid.z;
  float f0 = floor(fr);
  vIT = fr - f0;
  float f1 = mod(f0 + 1.0, impGrid.z);
  vec2 luv = position.xy * 0.5 + 0.5;
  vIUv = luv;
  float slot = floor(aImpS);
  vec2 base = vec2(mod(slot, 2.0) * impGrid.z, floor(slot * 0.5 + 0.01) * 2.0); // two pitch rows per species pair
  vI0 = (base + vec2(f0, 0.0) + luv) / impGrid.xy;
  vI1 = (base + vec2(f1, 0.0) + luv) / impGrid.xy;
  // pitch rows: 0 = low (9°), 1 = high (45°); blend by the view elevation in instance space
  float el = dot(toC / max(length(toC), 1e-3), ay);
  vIP = ortho ? 0.0 : smoothstep(0.2, 0.62, el) * impPitch;
  vIC0 = aCol0; vIC1 = aCol1; vIFx = aFx;
  vFFade = 1.0;
  if (fFade.z != 0.0) { // per-instance window: the species' near-tier end is in the slot's fraction (x 1024 m)
    float nearD = fract(aImpS) * 1024.0;
    float k = smoothstep(nearD - fFade.y, nearD, length(io - fCam.xyz));
    vFFade = fFade.z > 0.0 ? 1.0 - k : k;
    // Fade individual skyline trees over 55 m; distant stands no longer disappear as whole chunks.
    if (fFade.w > 0.0) vFFade *= 1.0 - smoothstep(fFade.w - 55.0, fFade.w, length(io.xz - fCam.xz));
  }
}
`;
const OBJ_NORMAL = /* glsl */`
vec3 objectNormal = vec3(0.0, 0.0, 1.0);
{
  mat3 imN = mat3(instanceMatrix);
  vec3 cWN = (instanceMatrix * vec4(aImp.xyz, 1.0)).xyz;
  vec3 tc = projectionMatrix[3][3] > 0.5 ? vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : cameraPosition - cWN;
  if (dot(imN[0], imN[0]) > 1e-8) objectNormal = normalize(inverse(imN) * normalize(tc + vec3(0.0, 1e-4, 0.0)));
}
`;
const FRAG_PARS = /* glsl */`
uniform sampler2D impA;
uniform sampler2D impN;
uniform vec4 impGrid;
uniform vec4 fFade;
uniform float impCell;
varying vec2 vI0;
varying vec2 vI1;
varying float vIT;
varying float vIP;
varying vec3 vIC0;
varying vec3 vIC1;
varying vec4 vIFx;
varying vec3 vIAx;
varying vec3 vIAy;
varying vec3 vIAz;
varying vec2 vIUv;
varying float vFFade;
vec3 impWN = vec3(0.0, 1.0, 0.0);
float impMask = 0.0;
${PALETTE_GLSL}
`;
const FRAG_SAMPLE = /* glsl */`
vec2 iOff = vec2(0.0, 1.0 / impGrid.y);
vec4 iA = mix(texture2D(impA, vI0), texture2D(impA, vI1), vIT);
if (vIP > 0.01) iA = mix(iA, mix(texture2D(impA, vI0 + iOff), texture2D(impA, vI1 + iOff), vIT), vIP);
float iCov = iA.a;
{
  vec2 dx = dFdx(vI0 * impGrid.xy * impCell), dy = dFdy(vI0 * impGrid.xy * impCell);
  float lod = max(0.0, 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-6)));
  iCov = clamp(iCov * (1.15 + 0.22 * lod), 0.0, 1.0);
}
`;
const FRAG_MAP = /* glsl */`
{
  ${FRAG_SAMPLE}
  vec4 iN = mix(texture2D(impN, vI0), texture2D(impN, vI1), vIT);
  if (vIP > 0.01) iN = mix(iN, mix(texture2D(impN, vI0 + iOff), texture2D(impN, vI1 + iOff), vIT), vIP);
  float inv = 1.0 / max(iA.a, 1e-3);
  vec3 alb = iA.rgb * inv;
  vec3 nm = iN.rgb * inv * 2.0 - 1.0;
  impMask = clamp(iN.a * inv, 0.0, 1.0);
  impWN = normalize(vIAx * nm.x + vIAy * nm.y + vIAz * nm.z + vec3(0.0, 1e-4, 0.0));
  // painted clump drift: neighbouring hues / values across the crown (as the near model's per-clump drift)
  float ph = vIFx.z * 6.2832;
  float hr = 0.5 * sin(vIUv.x * 11.0 + ph * 3.0 + sin(vIUv.y * 7.0 + ph)) * sin(vIUv.y * 9.0 - ph * 2.0 + 1.3);
  float th = hr * 0.5, ct = cos(th), st = sin(th);
  vec3 kx = vec3(0.57735);
  vec3 tc = max(vIC0 * ct + cross(kx, vIC0) * st + kx * dot(kx, vIC0) * (1.0 - ct), vec3(0.0));
  tc *= 0.94 + 0.12 * (hr + 0.5);
  diffuseColor.rgb *= alb * mix(vIC1, tc, impMask);
  // charred trees lose the crown
  iCov *= mix(1.0, step(0.5, vIFx.w), impMask);
  diffuseColor.a *= iCov;
}
`;
const FRAG_NORMAL = /* glsl */`
normal = normalize((viewMatrix * vec4(impWN, 0.0)).xyz);
`;
// look round: coverage fade on MSAA tiers (overlap cross-fade with the near models, see material.js); dither on 'low'
const FRAG_FADE = /* glsl */`
#ifndef ALPHA_TO_COVERAGE
if (vFFade < 0.999) {
  float dz = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (fFade.z < 0.0) dz = 1.0 - dz;
  if (dz > vFFade) discard;
}
#endif
`;
const FRAG_FADE_A2C = /* glsl */`
#ifdef ALPHA_TO_COVERAGE
if (vFFade < 0.999) {
  diffuseColor.a *= abs(fFade.z) > 1.5 ? clamp(vFFade * 2.0, 0.0, 1.0) : vFFade;
  if (diffuseColor.a <= 0.004) discard;
}
#endif
`;
const FRAG_EMIT = /* glsl */`
totalEmissiveRadiance += fPal(vIFx.y) * (vIFx.x * 0.32 * impMask);
`;

function patchVertex(sh, U, depth) {
  Object.assign(sh.uniforms, FU, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <begin_vertex>', VERT_MAIN);
  if (!depth) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', OBJ_NORMAL);
}

/** Impostor batch: same packing interface as batches.Batch (begin / add / end / set / hide / setRanges / setFade). */
export class ImpostorBatch {
  constructor(G, atlas, n, cap, opts) {
    this.name = opts.name || 'far-imp';
    this.n = n;
    this.cap = Math.max(1, Math.min(n, cap));
    this.mat = new Float32Array(n * 16);
    this.c0 = new Float32Array(n * 3);
    this.c1 = new Float32Array(n * 3);
    this.fx = new Float32Array(n * 4);
    this.imp = new Float32Array(n * 4);
    this.ims = new Float32Array(n);
    this.count = 0; this.shadowCount = 0; this.skip = 0; this.dirty = true;
    this.dist = 1e9;
    const c = this.cap;
    const ia = (k) => new THREE.InstancedBufferAttribute(new Float32Array(c * k), k).setUsage(THREE.DynamicDrawUsage);
    this.aMat = ia(16); this.aC0 = ia(3); this.aC1 = ia(3); this.aFx = ia(4); this.aImp = ia(4); this.aImpS = ia(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aCol0', this.aC0); geo.setAttribute('aCol1', this.aC1); geo.setAttribute('aFx', this.aFx);
    geo.setAttribute('aImp', this.aImp); geo.setAttribute('aImpS', this.aImpS);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const msaa = !!(G.quality && G.quality.name !== 'low');
    const U = {
      impA: { value: atlas.albedo }, impN: { value: atlas.normal },
      impGrid: { value: new THREE.Vector4(atlas.cols, atlas.rows, F, 0) },
      impCell: { value: atlas.cell },
      impPitch: { value: (typeof location !== 'undefined' && /[?&]implow\b/.test(location.search)) ? 0 : 1 },
      fFade: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
    this.U = U;
    const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), side: THREE.DoubleSide, alphaTest: msaa ? 0.02 : 0.5 });
    m.alphaToCoverage = msaa;
    m.name = 'flora-imp';
    m.userData.surface = 'none';
    m.userData.look = { trans: 0.6, rim: 0.24, wrap: 0.55 };
    m.onBeforeCompile = (sh) => {
      patchVertex(sh, U, false);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + FRAG_FADE)
        .replace('#include <map_fragment>', FRAG_MAP)
        .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n' + FRAG_FADE_A2C)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMIT);
    };
    m.customProgramCacheKey = () => 'mvFloraImp2';
    hookMaterial(m);
    // shadow caster: the same quads facing the light, cut by the baked coverage; no skip (shadow-only block casts)
    const UD = { ...U, impGrid: { value: new THREE.Vector4(atlas.cols, atlas.rows, F, 0) } };
    const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    d.onBeforeCompile = (sh) => {
      patchVertex(sh, UD, true);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS.replace(PALETTE_GLSL, ''))
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n{\n' + FRAG_SAMPLE + '\nif (iCov * mix(1.0, step(0.5, vIFx.w), 1.0) < 0.5) discard;\n}\n');
    };
    d.customProgramCacheKey = () => 'mvFloraImpDepth1';
    const mesh = new THREE.InstancedMesh(geo, m, c);
    mesh.instanceMatrix = this.aMat;
    mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
    mesh.name = 'flora:' + this.name;
    mesh.castShadow = !!opts.castShadow; mesh.receiveShadow = true;
    mesh.customDepthMaterial = d;
    const self = this;
    mesh.onBeforeShadow = function () { this.count = self.shadowCount; };
    mesh.onAfterShadow = function () { this.count = self.count; };
    G.scene.add(mesh);
    this.meshes = [mesh];
    this.fade = [U.fFade.value];
    this.tris = 2;
  }
  setFade(a, b, mode, horizon = 0) { this.U.fFade.value.set(a, b, mode, horizon); }
  setRanges(starts, counts) { this.cStart = starts; this.cCount = counts; }
  begin() { this.count = 0; this.shadowCount = 0; this.skip = 0; }
  /** shadowOnly: these instances only cast (they must all be added before any visible one). */
  add(c, shadow, shadowOnly = false) {
    let k = this.cCount.get(c);
    if (!k) return;
    const s = this.cStart.get(c);
    k = Math.min(k, this.cap - this.count);
    if (k <= 0) return;
    const o = this.count;
    this.aMat.array.set(this.mat.subarray(s * 16, (s + k) * 16), o * 16);
    this.aC0.array.set(this.c0.subarray(s * 3, (s + k) * 3), o * 3);
    this.aC1.array.set(this.c1.subarray(s * 3, (s + k) * 3), o * 3);
    this.aFx.array.set(this.fx.subarray(s * 4, (s + k) * 4), o * 4);
    this.aImp.array.set(this.imp.subarray(s * 4, (s + k) * 4), o * 4);
    this.aImpS.array.set(this.ims.subarray(s, s + k), o);
    this.count += k;
    if (shadowOnly) this.skip = this.count;
    if (shadow || shadowOnly) this.shadowCount = this.count;
  }
  end() {
    const n = this.count;
    for (const a of [this.aMat, this.aC0, this.aC1, this.aFx, this.aImp, this.aImpS]) {
      a.clearUpdateRanges();
      if (n) { a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
    }
    this.U.impGrid.value.w = this.skip;
    const m = this.meshes[0];
    m.count = n; m.visible = n > 0;
  }
  /** Write one instance: matrix (base of the tree), colours, fx, and the species frame info { cx, cy, cz, he, slot }. */
  set(i, matrix, c0, c1, fx, inf) {
    if (matrix) matrix.toArray(this.mat, i * 16);
    if (c0) { this.c0[i * 3] = c0[0]; this.c0[i * 3 + 1] = c0[1]; this.c0[i * 3 + 2] = c0[2]; }
    if (c1) { this.c1[i * 3] = c1[0]; this.c1[i * 3 + 1] = c1[1]; this.c1[i * 3 + 2] = c1[2]; }
    if (fx) { this.fx[i * 4] = fx[0]; this.fx[i * 4 + 1] = fx[1]; this.fx[i * 4 + 2] = fx[2]; this.fx[i * 4 + 3] = fx[3]; }
    if (inf) { this.imp[i * 4] = inf.cx; this.imp[i * 4 + 1] = inf.cy; this.imp[i * 4 + 2] = inf.cz; this.imp[i * 4 + 3] = inf.he; this.ims[i] = inf.slot; }
    this.dirty = true;
  }
  hide(i) { this.mat.fill(0, i * 16, i * 16 + 16); this.dirty = true; }
}
