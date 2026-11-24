// Ambient life — the five instanced bodies (docs/api/life.md). Each is ONE InstancedMesh (one draw call, no shadow)
// whose motion is done in the vertex shader from per-instance attributes written by the simulation (life.js):
//   bird   (lit cel, hookMaterial)   songbirds, swallows, crows, geese, gulls, eagles, cranes, bats
//   insect (lit cel, hookMaterial)   butterflies, moths, glow-moths, dragonflies, bees — wing shapes cut in the fragment
//   frog   (lit cel, hookMaterial)   river-bank frogs
//   fish   (unlit, alpha)           fish shadows by day, light-fish at night (HDR, blooms)
//   jelly  (unlit, additive)        lantern-jellies over the dark shore
// Shared instance attributes: iColA / iColB (vec3), iAnim (vec4), iShape (vec4); meaning per body below.
import * as THREE from 'three';
import { toonGradient, hookMaterial } from '../../core/mats.js';
import { G } from '../../core/game.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

// ---- geometry helpers ----------------------------------------------------------------------------------------------
// part list -> one non-indexed BufferGeometry with position, normal, color (r: toward colB, g: shade, b: warm accent),
// aPart and aUV
function build(parts) {
  const P = [], N = [], C = [], A = [], UV = [];
  for (const pt of parts) {
    const g = pt.geo.index ? pt.geo.toNonIndexed() : pt.geo;
    if (pt.m) g.applyMatrix4(pt.m);
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      P.push(x, y, z); N.push(n.getX(i), n.getY(i), n.getZ(i));
      const c = typeof pt.col === 'function' ? pt.col(x, y, z) : pt.col;
      C.push(c[0], c[1], c[2]);
      A.push(pt.part);
      UV.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(A, 1));
  geo.setAttribute('aUV', new THREE.Float32BufferAttribute(UV, 2));
  return geo;
}
const M = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// a flat wing / fin surface from a list of span stations [s, zLead, zTrail] in the XZ plane (y = y0), side +x;
// the strip is tessellated along the span so the shader can curl the tip
function wingGeo(st, x0, y0) {
  const P = [], N = [], UV = [];
  for (let i = 0; i < st.length - 1; i++) {
    const [s0, l0, t0] = st[i], [s1, l1, t1] = st[i + 1];
    const a = [x0 + s0, y0, l0], b = [x0 + s0, y0, t0], c = [x0 + s1, y0, l1], d = [x0 + s1, y0, t1];
    const sMax = st[st.length - 1][0];
    const u0 = s0 / sMax, u1 = s1 / sMax;
    for (const [v, u, w] of [[a, u0, 1], [b, u0, 0], [c, u1, 1], [c, u1, 1], [b, u0, 0], [d, u1, 0]]) {
      P.push(...v); N.push(0, 1, 0); UV.push(u, w);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}
const mirrorX = (g) => { const h = g.clone(); h.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1)); flip(h); return h; };
function flip(g) { // keep winding after a mirror (DoubleSide anyway, but normals must stay outward for lighting)
  const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv?.array;
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; const q = n[i + 3 + k]; n[i + 3 + k] = n[i + 6 + k]; n[i + 6 + k] = q; }
    if (uv) { const j = (i / 3) * 2; for (let k = 0; k < 2; k++) { const t = uv[j + 2 + k]; uv[j + 2 + k] = uv[j + 4 + k]; uv[j + 4 + k] = t; } }
  }
}

// ---- shared shader pieces -------------------------------------------------------------------------------------------
const PARS = `
attribute float aPart;
attribute vec2 aUV;
attribute vec3 iColA;
attribute vec3 iColB;
attribute vec4 iAnim;
attribute vec4 iShape;
varying float vLifeGlow;
varying vec2 vLifeUV;
varying vec4 vLifeK;
vec3 lifeRotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
vec3 lifeRotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
`;
const FPARS = `
varying float vLifeGlow;
varying vec2 vLifeUV;
varying vec4 vLifeK;
`;
// colour: color.r = toward colB, color.g = painted shade (AO + back / belly gradient), color.b = warm accent (beak, legs)
const COLOR = (accent) => `
  vec3 lifeC = mix(iColA, iColB, color.r);
  vColor = vec4(mix(lifeC, ${accent}, color.b) * color.g, 1.0);
  vLifeGlow = iAnim.w;
`;

function litMaterial(name, vertexBody, accent, opts = {}) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), vertexColors: true, side: THREE.DoubleSide });
  m.name = 'life-' + name;
  m.userData.surface = 'none';
  m.userData.look = { rim: 0.55, wrap: 0.55, shadowTint: 0.8, trans: opts.trans || 0 };
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + PARS + vertexBody)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\nvec3 lifeP = position;\nlifeBend(lifeP, objectNormal);\nvLifeUV = aUV;\nvLifeK = vec4(iAnim.z, aPart, iShape.z, 0.0);')
      .replace('#include <begin_vertex>', 'vec3 transformed = lifeP;')
      .replace('#include <color_vertex>', COLOR(accent));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FPARS + (opts.fragPars || ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (opts.frag || ''))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vLifeGlow;');
  };
  m.customProgramCacheKey = () => 'mvLife-' + name + '1';
  hookMaterial(m);
  return m;
}

function instanced(geo, mat, cap, name) {
  const ia = (n) => new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n).setUsage(THREE.DynamicDrawUsage);
  const attrs = { iColA: ia(3), iColB: ia(3), iAnim: ia(4), iShape: ia(4) };
  for (const k in attrs) geo.setAttribute(k, attrs[k]);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.name = 'life:' + name;
  mesh.userData.attrs = attrs;
  mesh.userData.cap = cap;
  return mesh;
}

// ---- bird -----------------------------------------------------------------------------------------------------------
// unit body ~1 long, facing +z. parts: 0 body / tail, 1 left wing, 2 right wing, 3 head + beak + eyes, 4 legs, 5 neck
// iAnim: x flap phase (rad), y flap amplitude (rad), z fold (0 open … 1 folded on the flanks), w glow
// iShape: x leg length (0 = tucked), y neck length (0 songbird … 1 crane), z head pitch (peck), w dark-beak flag
const BIRD_V = `
void lifeBend(inout vec3 p, inout vec3 n) {
  if (aPart > 0.5 && aPart < 2.5) {
    float sg = aPart < 1.5 ? 1.0 : -1.0;
    float span = max(abs(p.x) - 0.06, 0.0);
    float a = iAnim.y * sin(iAnim.x) + 0.1;
    vec3 q = lifeRotZ(p - vec3(sg * 0.06, 0.0, 0.0), sg * a);
    q.y += iAnim.y * 0.45 * sin(iAnim.x - 1.2) * span * span;          // the hand lags behind the arm
    vec3 open = q + vec3(sg * 0.06, 0.0, 0.0);
    vec3 nOpen = lifeRotZ(n, sg * a);
    // folded: the span runs back along the flank (shoulder to tail), the chord stands up against the body
    vec3 fold = vec3(sg * (0.128 - 0.05 * span), 0.04 + p.z * 0.4, 0.13 - span * 0.5);
    p = mix(open, fold, iAnim.z);
    n = normalize(mix(nOpen, vec3(sg, 0.35, 0.0), iAnim.z) + vec3(0.0, 1e-4, 0.0));
  } else if (aPart > 2.5 && aPart < 3.5) {
    vec3 pv = vec3(0.0, 0.05, 0.27);
    p = lifeRotX(p - pv, iShape.z) + pv + vec3(0.0, iShape.y * 0.62, iShape.y * 0.1);
    n = lifeRotX(n, iShape.z);
  } else if (aPart > 3.5 && aPart < 4.5) {
    p.y = -0.08 + (p.y + 0.08) * iShape.x;
  } else if (aPart > 4.5) {
    float h = clamp(p.y, 0.0, 1.0);
    p = vec3(p.x, 0.05 + h * iShape.y * 0.62, p.z + h * iShape.y * 0.1);
  }
}
`;
// round art-creatures: a sculpted songbird instead of the blue lozenge — a plump teardrop body (deep breast, tapering to
// the tail root), a round head with a clear beak, wings whose hand splits into five primaries with gaps at the tips, a
// tail fanned out of seven feathers. Same parts / units / attributes, so the flap, fold, legs and neck in BIRD_V and the
// per-species colours work as before. Low tiers (lo) get fewer rings, three primaries and five tail feathers.
function birdBody(lo) {
  // a lathe along z: radius per station, the cross-section deeper below (the breast) than above
  const st = [[0.36, 0.0], [0.33, 0.06], [0.26, 0.1], [0.16, 0.128], [0.04, 0.135], [-0.08, 0.118], [-0.18, 0.09], [-0.26, 0.06], [-0.31, 0.04], [-0.34, 0.0]];
  const NS = lo ? 8 : 12, P = [], I = [];
  for (let i = 0; i < st.length; i++) for (let k = 0; k < NS; k++) {
    const [z, r] = st[i], a = (k / NS) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const down = s < 0 ? 1.12 - 0.15 * (z < -0.1 ? 1 : 0) : 0.9;
    P.push(c * r * 0.92, s * r * down + (z > 0.1 ? -0.012 : 0) + (z < -0.2 ? 0.02 : 0), z);
  }
  // the two tips collapse onto the axis (radius 0): weld them into one vertex each so the normals stay smooth
  for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < NS; k++) {
    const a = i * NS + k, b = (i + 1) * NS + k, c = i * NS + (k + 1) % NS, d = (i + 1) * NS + (k + 1) % NS;
    I.push(a, b, c, c, b, d);
  }
  const g = BGU.mergeVertices(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(P, 3)).setIndex(I));
  g.computeVertexNormals();
  return g;
}
// one feather: a flat tapered blade from root to tip in the y = y0 plane (side +x), w0 wide at the root, pointed
function featherGeo(root, tip, w0, y0, segs = 3) {
  const dx = tip[0] - root[0], dz = tip[1] - root[1], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
  const P = [], N = [], UV = [];
  const at = (t, side) => { const w = w0 * (1 - Math.pow(t, 1.6)) * 0.5 * side; return [root[0] + dx * t + nx * w, y0 + 0.004 * t, root[1] + dz * t + nz * w]; };
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const a = at(t0, 1), b = at(t0, -1), c = at(t1, 1), d = at(t1, -1);
    for (const [v, u, w] of [[a, t0, 1], [b, t0, 0], [c, t1, 1], [c, t1, 1], [b, t0, 0], [d, t1, 0]]) { P.push(...v); N.push(0, 1, 0); UV.push(u, w); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return g;
}
function birdGeo(lo = false) {
  const parts = [];
  // back darker, belly toward cream (warm accent channel), soft AO under the wings
  parts.push({ geo: birdBody(lo), part: 0, col: (x, y, z) => [0.15 * smooth(0, 0.1, y) + 0.1 * smooth(-0.15, -0.3, z), 0.76 + 0.24 * smooth(-0.12, 0.1, y), 0.5 * smooth(0.0, -0.1, y) * smooth(-0.25, 0.0, z)] });
  parts.push({ geo: new THREE.SphereGeometry(1, lo ? 8 : 12, lo ? 6 : 9), m: M(0, 0.1, 0.36, 0.1, 0.098, 0.105), part: 3, col: (x, y) => [0, 0.88 + 0.12 * smooth(0.04, 0.17, y), 0.3 * smooth(0.08, 0.02, y)] });
  // beak: upper and lower mandible, a clear wedge
  parts.push({ geo: new THREE.ConeGeometry(0.034, 0.12, lo ? 5 : 7), m: M(0, 0.085, 0.49, 1, 0.8, 1, Math.PI / 2), part: 3, col: [0, 1, 1] });
  parts.push({ geo: new THREE.ConeGeometry(0.024, 0.08, 5), m: M(0, 0.066, 0.47, 1, 0.7, 1, Math.PI / 2 + 0.25), part: 3, col: [0, 0.85, 1] });
  // eyes, with a pale ring round them
  for (const s of [1, -1]) {
    parts.push({ geo: new THREE.SphereGeometry(0.03, 6, 5), m: M(s * 0.07, 0.125, 0.41, 0.5, 1, 1), part: 3, col: [0, 1, 0.55] });
    parts.push({ geo: new THREE.SphereGeometry(0.022, 6, 5), m: M(s * 0.082, 0.126, 0.413), part: 3, col: [0, 0.06, 0] });
  }
  // tail: a fan of feathers, the middle ones longest
  const NT = lo ? 5 : 7;
  for (let i = 0; i < NT; i++) {
    const f = (i - (NT - 1) / 2) / ((NT - 1) / 2), a = f * 0.62, len = 0.2 - Math.abs(f) * 0.04;
    const g = featherGeo([0, 0], [Math.sin(a) * len, -Math.cos(a) * len], 0.065, 0, 2);
    parts.push({ geo: g, m: M(0, 0.03 + Math.abs(f) * 0.004, -0.28, 1, 1, 1, 0.12), part: 0, col: (x, y, z) => [0.85, 0.78 + 0.1 * smooth(-0.5, -0.36, z), 0] });
  }
  // wings: the arm (coverts) as one panel with a scalloped trailing edge, the hand split into primaries
  const arm = [[0, 0.14, -0.15], [0.16, 0.14, -0.2], [0.32, 0.11, -0.22], [0.44, 0.07, -0.2]];
  const wcol = (x) => { const s = Math.abs(x); return [0.55 + 0.45 * smooth(0.1, 0.6, s), 1.0 - 0.3 * smooth(0.45, 0.95, s), 0]; };
  const wing = [];
  wing.push(wingGeo(arm, 0.06, 0.04));
  // secondaries: rounded tips along the arm's trailing edge
  for (let i = 0; i < (lo ? 3 : 5); i++) {
    const s0 = 0.03 + i * (lo ? 0.13 : 0.08), zt = -0.2 - 0.02 * Math.sin(i);
    wing.push(featherGeo([0.06 + s0 + 0.03, zt + 0.03], [0.06 + s0 + 0.02, zt - 0.07], 0.075, 0.039, 1));
  }
  // primaries: fingers fanning out from the wrist, the outer ones longest, gaps between their tips
  const NP = lo ? 3 : 5;
  for (let i = 0; i < NP; i++) {
    const f = i / (NP - 1);
    const root = [0.06 + 0.42 + 0.02 * f, 0.07 - 0.1 * f], tip = [0.06 + 0.98 - 0.16 * (1 - f) - 0.05 * f, 0.06 - 0.3 * f - 0.02];
    wing.push(featherGeo(root, tip, 0.085 - 0.012 * f, 0.039 - 0.004 * f, 3));
  }
  for (const g of wing) {
    parts.push({ geo: g, part: 1, col: wcol });
    parts.push({ geo: mirrorX(g), part: 2, col: wcol });
  }
  // legs (unit long, scaled by iShape.x) and neck (unit tall, scaled by iShape.y)
  for (const s of [1, -1]) parts.push({ geo: new THREE.CylinderGeometry(0.014, 0.012, 1, 4, 1), m: M(s * 0.045, -0.58, 0.02), part: 4, col: [0, 0.9, 1] });
  parts.push({ geo: new THREE.CylinderGeometry(0.045, 0.06, 1, 6, 4), m: M(0, 0.5, 0.27), part: 5, col: [0, 0.92, 0.1] });
  return build(parts);
}

// ---- insect ---------------------------------------------------------------------------------------------------------
// unit: wing span ±1. parts: 0 body, 1 fore-L, 2 fore-R, 3 hind-L, 4 hind-R
// iAnim: x flap phase, y amplitude, z kind (0 butterfly, 1 moth, 2 dragonfly, 3 bee), w glow
// iShape: x rest angle (dihedral; ~1.45 = wings closed upright), y hind-wing lag, z pattern seed, w body stretch
const INSECT_V = `
void lifeBend(inout vec3 p, inout vec3 n) {
  if (aPart < 0.5) { p.z *= iShape.w; return; }
  float sg = (aPart < 1.5 || (aPart > 2.5 && aPart < 3.5)) ? 1.0 : -1.0;
  float hind = aPart > 2.5 ? 1.0 : 0.0;
  float a = iShape.x + iAnim.y * sin(iAnim.x - hind * iShape.y);
  p = lifeRotZ(p, sg * a);
  n = lifeRotZ(n, sg * a);
}
`;
const INSECT_F = `
if (vLifeK.y > 0.5) {
  float kind = vLifeK.x;
  float hind = vLifeK.y > 2.5 ? 1.0 : 0.0;
  vec2 uv = vLifeUV;
  float d;
  if (kind < 0.5) {        // butterfly: broad rounded fore wing, smaller hind wing
    vec2 c = hind > 0.5 ? vec2(0.45, 0.5) : vec2(0.5, 0.52);
    vec2 r = hind > 0.5 ? vec2(0.55, 0.52) : vec2(0.56, 0.5);
    d = length((uv - c) / r);
  } else if (kind < 1.5) { // moth: triangular fore wing
    d = length((uv - vec2(0.42, 0.5)) / vec2(0.6, 0.48 - 0.18 * uv.x));
  } else if (kind < 2.5) { // dragonfly: long narrow panes
    d = length((uv - vec2(0.5, 0.5)) / vec2(0.55, 0.2));
  } else {                 // bee: small ovals
    d = length((uv - vec2(0.32, 0.5)) / vec2(0.34, 0.3));
  }
  if (d > 1.0) discard;
  float seed = vLifeK.z;
  if (kind < 0.5) {
    float border = smoothstep(0.72, 0.8, d);
    float spot = 1.0 - smoothstep(0.08, 0.13, length(uv - vec2(0.68, 0.62 - 0.2 * hind)));
    float vein = smoothstep(0.06, 0.0, abs(fract(uv.x * 3.0 + uv.y * 0.6 + seed) - 0.5) - 0.44) * 0.25;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.06, 0.1), max(border, vein));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.98, 0.92), spot * (1.0 - border) * 0.85);
    diffuseColor.rgb *= 0.86 + 0.14 * uv.x;
  } else if (kind < 1.5) {
    float mott = 0.5 + 0.5 * sin(uv.x * 17.0 + seed * 6.0) * sin(uv.y * 13.0 + uv.x * 5.0);
    float eye = 1.0 - smoothstep(0.06, 0.1, length(uv - vec2(0.55, 0.5)));
    diffuseColor.rgb *= 0.78 + 0.22 * mott;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), eye * 0.6);
  } else if (kind < 2.5) {
    float vein = smoothstep(0.06, 0.0, abs(uv.y - 0.72)) + smoothstep(0.08, 0.0, abs(fract(uv.x * 9.0) - 0.5) - 0.42) * 0.4;
    diffuseColor.rgb = mix(vec3(0.84, 0.94, 1.0), vec3(0.3, 0.42, 0.5), clamp(vein, 0.0, 1.0) * 0.6);
    diffuseColor.rgb *= 0.9 + 0.1 * smoothstep(1.0, 0.6, d);
  } else {
    diffuseColor.rgb = vec3(0.86, 0.9, 0.95);
  }
} else if (vLifeK.x > 2.5) {
  diffuseColor.rgb *= 0.55 + 0.45 * step(0.5, fract(vLifeUV.y * 4.0)); // bee stripes
}
`;
function insectGeo() {
  const parts = [];
  parts.push({ geo: new THREE.SphereGeometry(1, 8, 6), m: M(0, 0, 0, 0.06, 0.06, 0.42), part: 0, col: (x, y) => [0.0, 0.8 + 0.2 * smooth(-0.05, 0.05, y), 0] });
  parts.push({ geo: new THREE.SphereGeometry(0.075, 6, 5), m: M(0, 0.01, 0.42), part: 0, col: [0, 0.7, 0] });
  const fore = wingGeo([[0, 0.55, -0.05], [0.5, 0.6, -0.08], [1.0, 0.62, -0.06]], 0.02, 0.0);
  const hind = wingGeo([[0, 0.02, -0.55], [0.4, 0.0, -0.6], [0.8, -0.02, -0.55]], 0.02, -0.005);
  parts.push({ geo: fore, part: 1, col: [1, 1, 0] });
  parts.push({ geo: mirrorX(fore), part: 2, col: [1, 1, 0] });
  parts.push({ geo: hind, part: 3, col: [1, 0.92, 0] });
  parts.push({ geo: mirrorX(hind), part: 4, col: [1, 0.92, 0] });
  // body uv.y along the length for bee stripes
  const g = build(parts);
  const p = g.attributes.position, a = g.attributes.aPart, uv = g.attributes.aUV;
  for (let i = 0; i < p.count; i++) if (a.getX(i) === 0) uv.setXY(i, 0, (p.getZ(i) + 0.42) / 0.84);
  return g;
}

// ---- frog -----------------------------------------------------------------------------------------------------------
// unit body ~1 long. parts: 0 body, 1 hind legs (stretch on a hop). iAnim: x —, y leg stretch 0..1, z throat, w glow
const FROG_V = `
void lifeBend(inout vec3 p, inout vec3 n) {
  if (aPart > 0.5) { float k = iAnim.y; p.z -= k * 0.55 * smoothstep(0.1, -0.5, p.z); p.y -= k * 0.12; }
  else if (iAnim.z > 0.0 && p.y < 0.0 && p.z > 0.15) { p.y -= iAnim.z * 0.08; }
}
`;
function frogGeo() {
  const parts = [];
  parts.push({ geo: new THREE.SphereGeometry(1, 12, 8), m: M(0, 0.18, 0, 0.36, 0.22, 0.46, -0.25), part: 0, col: (x, y) => [0.0, 0.8 + 0.2 * smooth(0.05, 0.35, y), 0.7 * smooth(0.14, 0.02, y)] });
  for (const s of [1, -1]) {
    parts.push({ geo: new THREE.SphereGeometry(0.1, 8, 6), m: M(s * 0.16, 0.36, 0.26), part: 0, col: [0, 0.95, 0] });
    parts.push({ geo: new THREE.SphereGeometry(0.06, 6, 5), m: M(s * 0.2, 0.39, 0.32), part: 0, col: [0, 0.05, 0] });
    parts.push({ geo: new THREE.SphereGeometry(1, 8, 6), m: M(s * 0.32, 0.08, -0.22, 0.12, 0.08, 0.28, 0, s * 0.4), part: 1, col: [0.6, 0.8, 0] });
    parts.push({ geo: new THREE.SphereGeometry(1, 6, 5), m: M(s * 0.22, 0.05, 0.3, 0.06, 0.1, 0.06), part: 0, col: [0.3, 0.85, 0] });
  }
  return build(parts);
}

// ---- fish (unlit decal on the water surface) -------------------------------------------------------------------------
// flat in XZ, unit long. iAnim: x swim phase, y tail amplitude, z —, w opacity. iColA = colour (HDR for light-fish)
function fishMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.name = 'life-fish';
  m.toneMapped = false;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <begin_vertex>', `vec3 transformed = position;
        float bend = sin(iAnim.x - position.z * 5.0) * iAnim.y * (0.25 + smoothstep(0.3, -0.5, position.z));
        transformed.x += bend * 0.22;
        vLifeUV = aUV; vLifeGlow = iAnim.w; vLifeK = vec4(iShape.x, 0.0, 0.0, 0.0);`)
      .replace('#include <color_vertex>', 'vColor = vec4(iColA, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FPARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float e = clamp(1.0 - vLifeUV.y, 0.0, 1.0);
        diffuseColor.a *= vLifeGlow * (0.35 + 0.65 * e);
        diffuseColor.rgb *= 1.0 + vLifeK.x * (1.0 - vLifeUV.y) * 0.8;`);
  };
  m.customProgramCacheKey = () => 'mvLife-fish1';
  return m;
}
function fishGeo() {
  // body: fan of triangles around the spine; uv.y = 0 on the spine, 1 at the rim (soft edge)
  const P = [], N = [], UV = [];
  const prof = (z) => 0.17 * Math.sqrt(Math.max(0, 1 - ((z - 0.08) / 0.42) ** 2)); // half-width along the body
  const zs = [];
  for (let i = 0; i <= 10; i++) zs.push(0.5 - i * 0.084);
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i], z1 = zs[i + 1], w0 = prof(z0), w1 = prof(z1);
    for (const s of [1, -1]) {
      const q = [[0, z0, 0], [s * w0, z0, 1], [0, z1, 0], [0, z1, 0], [s * w0, z0, 1], [s * w1, z1, 1]];
      for (const [x, z, v] of q) { P.push(x, 0, z); N.push(0, 1, 0); UV.push(0, v); }
    }
  }
  // tail fin
  for (const s of [1, -1]) for (const [x, z, v] of [[0, -0.32, 0], [s * 0.16, -0.55, 0.9], [0, -0.48, 0.5]]) { P.push(x, 0, z); N.push(0, 1, 0); UV.push(0, v); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  return build([{ geo: g, part: 0, col: [0, 1, 0] }]);
}

// ---- lantern-jelly (unlit, additive) ---------------------------------------------------------------------------------
// unit bell radius 0.5. parts: 0 bell, 1 tentacles. iAnim: x pulse phase, y —, z —, w brightness. iColA rim, iColB core
function jellyMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.name = 'life-jelly';
  m.toneMapped = false;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + PARS)
      .replace('#include <begin_vertex>', `vec3 transformed = position;
        float pulse = sin(iAnim.x);
        if (aPart < 0.5) { float k = 1.0 - clamp(position.y / 0.42, 0.0, 1.0); transformed.xz *= 1.0 + 0.16 * pulse * k; transformed.y *= 1.0 - 0.1 * pulse; }
        else { float d = -position.y; transformed.x += sin(iAnim.x * 0.5 + d * 3.0 + position.z * 4.0) * 0.09 * d; transformed.z += cos(iAnim.x * 0.4 + d * 2.6 + position.x * 4.0) * 0.07 * d; transformed.y *= 1.0 + 0.08 * pulse; }
        vLifeUV = aUV; vLifeGlow = iAnim.w; vLifeK = vec4(aPart, color.g, 0.0, 0.0);`)
      .replace('#include <color_vertex>', 'vColor = vec4(mix(iColB, iColA, color.r), 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FPARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= vLifeGlow * vLifeK.y;
        diffuseColor.a = 1.0;`);
  };
  m.customProgramCacheKey = () => 'mvLife-jelly1';
  return m;
}
function jellyGeo() {
  const parts = [];
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.sin(a) * 0.5 * (1 - 0.08 * Math.sin(a * 2)), Math.cos(a) * 0.42)); }
  const bell = new THREE.LatheGeometry(pts, 14);
  // rim bright, crown dimmer (r: toward the rim colour, g: brightness)
  parts.push({ geo: bell, part: 0, col: (x, y) => [smooth(0.3, 0.0, y), 0.35 + 0.65 * smooth(0.36, 0.02, y), 0] });
  parts.push({ geo: new THREE.SphereGeometry(0.16, 8, 6), m: M(0, 0.14, 0), part: 0, col: [0, 1.6, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, r = 0.3;
    const pl = new THREE.PlaneGeometry(0.07, 1.3, 1, 6);
    parts.push({ geo: pl, m: M(Math.cos(a) * r, -0.65, Math.sin(a) * r, 1, 1, 1, 0, a), part: 1, col: (x, y) => [1, 0.5 * smooth(-1.3, -0.1, y), 0] });
  }
  return build(parts);
}

// ---- leaper (map round): a lit fish that jumps out of lakes and rivers -----------------------------------------------
// unit length along +z. parts: 0 body, 1 tail. iAnim: x tail phase, y tail amplitude, z —, w glow. colA back, colB belly
const LEAP_V = `
void lifeBend(inout vec3 p, inout vec3 n) {
  float k = smoothstep(0.1, -0.5, p.z) * iAnim.y;
  p.x += sin(iAnim.x - p.z * 4.0) * k * 0.18;
}
`;
function leaperGeo() {
  const parts = [];
  parts.push({ geo: new THREE.SphereGeometry(1, 12, 8), m: M(0, 0, 0.05, 0.11, 0.16, 0.45), part: 0, col: (x, y) => [smooth(0.02, -0.08, y), 0.85 + 0.15 * smooth(-0.1, 0.12, y), 0] });
  const tail = new THREE.ConeGeometry(0.16, 0.3, 4, 1); tail.rotateX(-Math.PI / 2); tail.scale(0.25, 1, 1);
  parts.push({ geo: tail, m: M(0, 0, -0.48), part: 1, col: [0, 0.8, 0] });
  for (const s of [1, -1]) parts.push({ geo: new THREE.SphereGeometry(0.03, 5, 4), m: M(s * 0.075, 0.04, 0.38), part: 0, col: [0, 0.1, 0] });
  return build(parts);
}

/** Build the five meshes (caps = max instances each). Returns { bird, insect, frog, fish, jelly }. */
export function buildLifeMeshes(caps) {
  const bird = instanced(birdGeo(!!G.quality?.mobile || G.quality?.name === 'low'), litMaterial('bird', BIRD_V, 'mix(vec3(0.95, 0.62, 0.22), vec3(0.12, 0.1, 0.12), iShape.w)'), caps.bird, 'bird');
  const insect = instanced(insectGeo(), litMaterial('insect', INSECT_V, 'vec3(0.0)', { frag: INSECT_F, trans: 0.5 }), caps.insect, 'insect');
  const frog = instanced(frogGeo(), litMaterial('frog', FROG_V, 'vec3(0.93, 0.9, 0.7)'), caps.frog, 'frog');
  const fish = instanced(fishGeo(), fishMaterial(), caps.fish, 'fish');
  fish.renderOrder = -5; // after the water (-10)
  const jelly = instanced(jellyGeo(), jellyMaterial(), caps.jelly, 'jelly');
  jelly.renderOrder = 5;
  const leaper = instanced(leaperGeo(), litMaterial('leaper', LEAP_V, 'vec3(0.9, 0.85, 0.6)'), caps.leaper || 6, 'leaper');
  return { bird, insect, frog, fish, jelly, leaper };
}
