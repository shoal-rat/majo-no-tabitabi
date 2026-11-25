// Mesh effects: hand-animated looking shapes — rings, discs, cones, pillars, domes, spheres, flame tongues and slash
// arcs — drawn from ONE instanced grid (one draw call for every live shape). The vertex shader bends the grid into the
// instance's kind; the fragment shader scrolls a painted noise texture (made on a canvas at boot) over it and erodes
// it with a threshold that rises over the shape's life, giving crisp two / three-tone edges (bright rim, body, dark
// core) instead of soft blobs. Additive glow is a per-instance mix, used as an accent only.
//
//   const h = shapes.add(opts)   opts: see DEF below. Returns a handle { pos, up, fwd, alive, set*, kill(fade) } or null.
//   kinds: 'disc' | 'ring' (flat, radii r0..r1) · 'cyl' | 'cone' (along up, radii r0 → r1 over h) · 'dome' (r0, h) ·
//          'sphere' (r0, h = vertical radius) · 'tongue' (flame lick: base radius r0, height h) · 'arc' (slash crescent:
//          outer r1, thickest inner r0, span radians)
//   drape: true (disc): lies on the terrain (setGround), each vertex as high above the ground as the centre is.
//   tex: 'billow' | 'streak' | 'cells' | 'glyph' | 'seams' (the cells' dark seams as bright lines: ground cracks)    mode: 'flame' | 'sheet' | 'smoke' (lit) | 'glow' | 'glyph' | 'shell'
import * as THREE from 'three';
import { fireVertex, fireFragment } from './fireVolumes.js';
import {airFrostVertex,airFrostFragment} from './air-frost.js';
import { FX_OUT, FOG_PARS_VERT, FOG_VERT, fxMaterial } from './glsl.js';

const SU = 32, SV = 10;
const F = 40;                      // floats per instance (10 vec4)
const KIND = { disc: 0, ring: 0, cyl: 1, cone: 1, pillar: 1, dome: 2, sphere: 3, tongue: 4, arc: 5, fireVolume: 9, impactTrail: 10, fireSoot: 11, crystal: 6, windRibbon: 7, frostPrism: 8 };
const TEX = { billow: 0, streak: 1, cells: 2, glyph: 3, seams: 4 };
const MODE = { flame: 0, sheet: 1, smoke: 2, glow: 3, glyph: 4, shell: 5 };

const VERT = /* glsl */`
attribute vec2 g;                 // grid u (around), v (along)
attribute vec4 i0;                // pos, birth
attribute vec4 i1;                // up axis, dur
attribute vec4 i2;                // ref axis, kind
attribute vec4 i3;                // r0, r1, h, span
attribute vec4 i4;                // colour A (linear), mode
attribute vec4 i5;                // colour B (linear), add mix
attribute vec4 i6;                // grow0, grow1, erode0, erode1
attribute vec4 i7;                // scrollU, scrollV, channel, start angle
attribute vec4 i8;                // tileU, tileV, intensity, core
attribute vec4 i9;                // twist, soft, wobble, body alpha
uniform float uTime;
uniform sampler2D uGround;        // terrain data texture: r = ground height (setGround)
uniform vec3 uGroundBox;          // half extent, 1 / (2 half extent), 1 when bound
float groundH(vec2 xz) { return texture2D(uGround, (xz + uGroundBox.x) * uGroundBox.y).r; }
varying vec2 vG;
varying vec2 vTex;
varying vec4 vA;
varying vec4 vB;
varying vec4 vE;                  // threshold, soft, intensity, core
varying vec4 vK;                  // kind, channel, edge flag, fresnel
varying float vBody;
${FOG_PARS_VERT}
void main() {
  float age = uTime - i0.w;
  float dur = i1.w;
  if (age < 0.0 || age >= dur) { gl_Position = vec4(0.0, 0.0, 3.0, 1.0); return; }
  float t = age / max(dur, 1e-4);
  float gT = 1.0 - (1.0 - t) * (1.0 - t) * (1.0 - t);
  float s = mix(i6.x, i6.y, gT);
  float u = g.x, v = g.y;
  vec3 Y = normalize(i1.xyz + vec3(0.0, 1e-6, 0.0));
  vec3 X0 = i2.xyz - Y * dot(i2.xyz, Y);
  vec3 X = dot(X0, X0) > 1e-6 ? normalize(X0) : normalize(abs(Y.y) < 0.95 ? cross(Y, vec3(0.0, 1.0, 0.0)) : cross(Y, vec3(1.0, 0.0, 0.0)));
  vec3 Z = cross(X, Y);
  int kind = int(i2.w + 0.5);
  float a = i7.w + u * i3.w + i9.x * v;
  vec3 rad = X * cos(a) + Z * sin(a);
  float seed = fract(sin(dot(i0.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vec3 p; vec3 n;
  float edge = 1.0;
  if (kind == 0) {
    float r = mix(i3.x, i3.y, v) * s;
    p = rad * r + Y * 0.04; n = Y; edge = i3.x > 0.001 ? 1.0 : 0.0;
  } else if (kind == 1) {
    float r = mix(i3.x, i3.y, v) * s;
    p = rad * r + Y * (v * i3.z); n = rad;
  } else if (kind == 2) {
    float ph = v * 1.5707963;
    p = rad * (i3.x * s * cos(ph)) + Y * (i3.z * s * sin(ph)); n = normalize(rad * cos(ph) + Y * sin(ph));
  } else if (kind == 3) {
    float ph = -1.5707963 + v * 3.1415927;
    p = rad * (i3.x * s * cos(ph)) + Y * (i3.z * s * sin(ph)); n = normalize(rad * cos(ph) + Y * sin(ph));
  } else if (kind == 4) {
    float prof = sin(3.1415927 * (0.1 + 0.9 * v));
    float wob = sin(uTime * i9.z + v * 4.0 + seed * 6.28) * v * v * i3.x * 0.7;
    p = rad * (i3.x * s * prof) + X * wob + Y * (v * i3.z * s); n = rad;
  }
  ${fireVertex}
  else if (kind == 6) {          // faceted crystal spike: 5 flat sides, tip at h
    float fa = i7.w + (floor(u * 5.0 + 0.5) / 5.0) * 6.2831853;
    vec3 fr = X * cos(fa) + Z * sin(fa);
    p = fr * (i3.x * s * (1.0 - v)) + Y * (v * i3.z * s); n = normalize(fr + Y * 0.3);
    edge = fract(floor(u * 5.0 + 0.5) * 0.618);
  ${airFrostVertex}
  } else {
    float inner = mix(i3.y, i3.x, sin(3.1415927 * u));
    p = rad * mix(i3.y, inner, v) * s + Y * 0.03; n = Y;
  }
  vec3 wp = i0.xyz + p;
  // draped disc (h < 0): each vertex as high above the ground under it as the centre is above the ground under the
  // centre, so a puddle or an ice sheet lies along the slope instead of standing out flat over it. The 2 m texture
  // rounds a cliff or a fresh crater bowl differently from the land mesh (up to ~0.8 m), so there it hugs a little lower.
  if (kind == 0 && i3.z < 0.0 && uGroundBox.z > 0.5) {
    // one texel either way: slope, and how much the texels bend upward (bilinear rides that much above a bowl)
    float h0 = groundH(wp.xz), hxp = groundH(wp.xz + vec2(2.0, 0.0)), hxm = groundH(wp.xz - vec2(2.0, 0.0));
    float hzp = groundH(wp.xz + vec2(0.0, 2.0)), hzm = groundH(wp.xz - vec2(0.0, 2.0));
    float grade = 0.25 * length(vec2(hxp - hxm, hzp - hzm)), bowl = 0.125 * (hxp + hxm + hzp + hzm - 4.0 * h0);
    wp.y += h0 - groundH(i0.xz) - 0.45 * max(0.0, grade - 0.55) - max(0.0, bowl);
  }
  if (kind == 3) wp.y += i9.z * age * (1.0 - 0.4 * t);      // spheres: 'rise' (m/s, slowing) — smoke puffs drift up
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vec3 vd = normalize(cameraPosition - wp);
  vK = vec4(float(kind), i7.z, edge, 1.0 - abs(dot(n, vd)));
  vG = g;
  vTex = vec2(u * i8.x + i7.x * age, v * i8.y + i7.y * age) + seed * 7.13;
  if (kind == 9) vTex = vec2(u * i8.x + i7.w, v * i8.y + i7.y * uTime + i7.w);
  vA = i4; vB = i5;
  vE = vec4(mix(i6.z, i6.w, t), i9.y, i8.z, i8.w);
  vBody = i9.w;
  ${FOG_VERT}
}
`;

const FRAG = /* glsl */`
uniform sampler2D uNoise;
uniform vec3 uAmbient;
varying vec2 vG;
varying vec2 vTex;
varying vec4 vA;
varying vec4 vB;
varying vec4 vE;
varying vec4 vK;
varying float vBody;
${FX_OUT}
float pick(vec4 c, float ch) { return ch < 0.5 ? c.r : ch < 1.5 ? c.g : ch < 2.5 ? c.b : c.a; }
void main() {
  float kind = vK.x, ch = vK.y, mode = vA.w;
  vec4 t1 = texture2D(uNoise, vTex);
  ${fireFragment}
  vec4 t2 = texture2D(uNoise, vTex * vec2(2.03, 1.97) + vec2(0.37, 0.61));
  float n = ch > 3.5 ? (1.0 - t1.b) * (1.0 - 0.45 * vG.y) : ch > 2.5 ? t1.a : pick(t1, ch) * 0.68 + pick(t2, ch) * 0.32;
  // shape mask: edges erode first
  float u = vG.x, v = vG.y, m;
  if (kind < 0.5) m = smoothstep(0.0, 0.2, 1.0 - v) * mix(1.0, smoothstep(0.0, 0.2, v), vK.z);
  else if (kind < 1.5) m = smoothstep(0.0, 0.12, v) * smoothstep(0.0, 0.2, 1.0 - v);
  else if (kind < 2.5) m = smoothstep(0.0, 0.15, v) * mix(0.55, 1.0, smoothstep(0.1, 0.6, vK.w));
  else if (kind < 3.5) m = (vA.w > 1.5 && vA.w < 2.5) ? 1.0 - smoothstep(0.2, 0.8, vK.w) :   // smoke: the silhouette frays
    vA.w > 4.5 ? mix(0.5, 1.0, smoothstep(0.05, 0.55, vK.w)) : 1.0 - 0.6 * smoothstep(0.35, 1.0, vK.w);   // solid body, edges erode first (shell: rim)
  else if (kind < 4.5) m = smoothstep(0.0, 0.18, v) * (1.0 - 0.55 * v * v);
  else if (kind > 5.5) m = 1.0;
  else m = smoothstep(0.0, 0.1, u) * smoothstep(0.0, 0.25, 1.0 - u) * smoothstep(0.0, 0.25, v) * smoothstep(0.0, 0.2, 1.0 - v);
  float e = vE.x, soft = max(vE.y, 0.005);
  float val, alpha;
  vec3 col;
  ${airFrostFragment}if (mode > 3.5 && mode < 4.5) {          // glyph band: the glyph is the shape, billow noise dissolves it
    float gl = n * m;
    alpha = gl * smoothstep(e, e + soft, t1.r * 0.6 + 0.4 * m);
    col = mix(vA.rgb, vB.rgb, smoothstep(0.55, 0.85, gl));
  } else {
    val = n * m - (1.0 - m) * 0.5;
    alpha = smoothstep(e, e + soft, val);
    float d = val - e;
    float rim = 1.0 - smoothstep(0.07, 0.07 + soft, d);
    float core = smoothstep(0.3, 0.3 + soft, d);
    col = mix(vA.rgb, vB.rgb, rim);
    col = mix(col, vA.rgb * vE.w, core * (1.0 - rim));
    alpha *= mix(vBody, 1.0, rim);
    if (mode > 4.5) alpha *= mix(0.2, 1.0, vK.w * vK.w);
    if (kind > 5.5) col *= 0.62 + 0.75 * vK.z + 0.5 * vK.w;     // crystal: each facet its own flat tone + bright silhouette
  }
  if (mode > 1.5 && mode < 2.5) col *= uAmbient;
  if (alpha < 0.004) discard;
  float add = vB.w, I = vE.z;
  gl_FragColor = fxOut(col * I * alpha * add, col * I, alpha * (1.0 - add));
}
`;

// ---- painted noise texture ------------------------------------------------------------------------------------------
function makeNoiseTexture(N = 256) {
  const data = new Uint8Array(N * N * 4);
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return (h >>> 0) / 4294967295; };
  // periodic value noise with period (px, py) cells
  const vnoise = (x, y, px, py, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
    const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (u, v, fu, fv, s, oct = 4) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) { sum += amp * vnoise(u * fu, v * fv, fu, fv, s + o * 17); norm += amp; amp *= 0.5; fu *= 2; fv *= 2; }
    return sum / norm;
  };
  // worley cells (periodic 7x7) for cracks / facets
  const C = 7, pts = [];
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) pts.push([(i + 0.15 + 0.7 * hash(i, j, 91)) / C, (j + 0.15 + 0.7 * hash(i, j, 92)) / C]);
  const worley = (u, v) => {
    let f1 = 9, f2 = 9;
    const ci = Math.floor(u * C), cj = Math.floor(v * C);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj, wi = ((i % C) + C) % C, wj = ((j % C) + C) % C;
      const p = pts[wj * C + wi];
      const px = p[0] + (i - wi) / C, py = p[1] + (j - wj) / C;
      const d = Math.hypot(u - px, v - py);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return [f1 * C, f2 * C];
  };
  const st = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N, k = (y * N + x) * 4;
    // R: billows (puffy, contrasty, painted)
    let r = fbm(u, v, 4, 4, 1, 4);
    r = st(0.28, 0.78, r + 0.18 * (fbm(u, v, 8, 8, 5, 2) - 0.5));
    // G: streaks running along v (strokes for wind / water / beams / curtains)
    let gch = fbm(u, v, 18, 2, 9, 3);
    gch = st(0.3, 0.8, gch);
    // B: cells — bright cell bodies, dark seams (facets / cracks)
    const [f1, f2] = worley(u, v);
    const bch = st(0.0, 0.28, f2 - f1) * (0.75 + 0.25 * fbm(u, v, 8, 8, 13, 2));
    data[k] = Math.round(r * 255); data[k + 1] = Math.round(gch * 255); data[k + 2] = Math.round(bch * 255); data[k + 3] = 0;
  }
  // A: a band of invented glyphs (no real script): rows of strokes, circles and hooks between two rule lines
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = N / 128;
  for (const yy of [0.2, 0.8]) { g.beginPath(); g.moveTo(0, yy * N); g.lineTo(N, yy * N); g.stroke(); }
  g.lineWidth = N / 96;
  const G2 = 12;
  for (let i = 0; i < G2; i++) {
    const cx = (i + 0.5) * N / G2, cy = 0.5 * N, w = N / G2 * 0.34, h = N * 0.2;
    g.beginPath();
    const r0 = hash(i, 3, 7), r1 = hash(i, 4, 7), r2 = hash(i, 5, 7);
    if (r0 < 0.33) { g.moveTo(cx - w * 0.2, cy - h); g.lineTo(cx + w * 0.1, cy + h * 0.6); g.quadraticCurveTo(cx + w * 0.3, cy + h, cx + w, cy + h * 0.7); g.moveTo(cx - w, cy - h * 0.1); g.lineTo(cx + w * 0.7, cy - h * 0.35); }
    else if (r0 < 0.66) { g.moveTo(cx - w, cy - h); g.lineTo(cx + w, cy - h * 0.2); g.lineTo(cx - w, cy + h * 0.4); g.lineTo(cx + w * 0.6, cy + h); }
    else { g.moveTo(cx, cy - h); g.quadraticCurveTo(cx + w * 1.6, cy, cx, cy + h); g.moveTo(cx - w, cy); g.lineTo(cx + w * 0.4, cy); }
    if (r1 < 0.5) { g.moveTo(cx - w * 0.8, cy + h * 0.75); g.lineTo(cx + w * 0.8, cy + h * 0.75); }
    g.stroke();
    if (r2 < 0.5) { g.beginPath(); g.arc(cx + w * 0.7, cy - h * 0.7, N / 110, 0, Math.PI * 2); g.fill(); }
  }
  const img = g.getImageData(0, 0, N, N).data;
  for (let i = 0; i < N * N; i++) data[i * 4 + 3] = img[i * 4 + 3];
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---- the pool -------------------------------------------------------------------------------------------------------
const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0), XV = new THREE.Vector3(1, 0, 0);

class Handle {
  constructor(pool, slot) { this.pool = pool; this.slot = slot; this.alive = true; this.pos = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0); this.fwd = new THREE.Vector3(1, 0, 0); this.I = 1; this.fadeT = 0; this.fadeDur = 0; this.follow = null; }
  /** radii / height / span (undefined keeps) */
  dims(r0, r1, h, span) { const d = this.pool.data, o = this.slot * F; if (r0 !== undefined) d[o + 12] = r0; if (r1 !== undefined) d[o + 13] = r1; if (h !== undefined) d[o + 14] = h; if (span !== undefined) d[o + 15] = span; return this; }
  color(a, b) { const d = this.pool.data, o = this.slot * F; if (a) { _c.set(a); d[o + 16] = _c.r; d[o + 17] = _c.g; d[o + 18] = _c.b; } if (b) { _c.set(b); d[o + 20] = _c.r; d[o + 21] = _c.g; d[o + 22] = _c.b; } return this; }
  erode(e0, e1) { const d = this.pool.data, o = this.slot * F; d[o + 26] = e0; d[o + 27] = e1 ?? e0; return this; }
  /** fade out over sec, then free */
  kill(sec = 0.25) { if (!this.alive) return; this.fadeDur = Math.max(1e-3, sec); this.fadeT = sec; }
}

export class Shapes {
  constructor(capacity = 160, renderOrder = 22) {
    this.cap = capacity;
    this.data = new Float32Array(capacity * F);
    this.meta = new Array(capacity).fill(null);   // handle or null (fire-and-forget: { end })
    this.endAt = new Float32Array(capacity);
    this.free = [];
    for (let i = capacity - 1; i >= 0; i--) this.free.push(i);
    this.liveList = [];
    const geo = new THREE.InstancedBufferGeometry();
    const gv = new Float32Array((SU + 1) * (SV + 1) * 2);
    let k = 0;
    for (let j = 0; j <= SV; j++) for (let i = 0; i <= SU; i++) { gv[k++] = i / SU; gv[k++] = j / SV; }
    const idx = [];
    for (let j = 0; j < SV; j++) for (let i = 0; i < SU; i++) {
      const a = j * (SU + 1) + i, b = a + 1, c = a + SU + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    geo.setAttribute('g', new THREE.BufferAttribute(gv, 2));
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SU + 1) * (SV + 1) * 3), 3));
    this.buf = new Float32Array(capacity * F);
    const ib = new THREE.InstancedInterleavedBuffer(this.buf, F, 1);
    ib.setUsage(THREE.DynamicDrawUsage);
    this.ib = ib;
    for (let a = 0; a < 10; a++) geo.setAttribute('i' + a, new THREE.InterleavedBufferAttribute(ib, 4, a * 4));
    geo.instanceCount = 0;
    this.geo = geo;
    this.texture = makeNoiseTexture(256);
    const mat = fxMaterial({ uniforms: { uNoise: { value: this.texture }, uGround: { value: null }, uGroundBox: { value: new THREE.Vector3(1, 0.5, 0) } }, vertexShader: VERT, fragmentShader: FRAG });
    this.groundTex = null;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fxShapes';
    this.order = [];
    this.dist = new Float32Array(capacity);
    this.count = 0;
  }

  /**
   * opts: { kind, pos, up, fwd, r0, r1, h, span, start, dur, delay, grow:[a,b], erode:[a,b], soft, tex, tile:[u,v], drape,
   *         scroll:[u,v], color, color2, core, add, mode, I, twist, wobble, body, handle (bool) }
   * colours are linear THREE.Color-compatible (hex is taken as sRGB).
   */
  add(o, now) {
    if (!this.free.length) {
      // steal the oldest fire-and-forget shape
      let best = -1, bt = Infinity;
      for (const s of this.liveList) { const m = this.meta[s]; if (m && m.isHandle) continue; if (this.endAt[s] < bt) { bt = this.endAt[s]; best = s; } }
      if (best < 0) return null;
      this.release(best);
    }
    const s = this.free.pop();
    const d = this.data, b = s * F;
    const p = o.pos, up = o.up || UPV, fw = o.fwd || XV;
    const dur = o.dur ?? 0.6, birth = now + (o.delay || 0);
    d[b] = p.x; d[b + 1] = p.y; d[b + 2] = p.z; d[b + 3] = birth;
    d[b + 4] = up.x; d[b + 5] = up.y; d[b + 6] = up.z; d[b + 7] = dur;
    d[b + 8] = fw.x; d[b + 9] = fw.y; d[b + 10] = fw.z; d[b + 11] = KIND[o.kind] ?? 0;
    d[b + 12] = o.r0 ?? 0; d[b + 13] = o.r1 ?? (o.r0 ?? 1); d[b + 14] = o.drape ? -1 : o.h ?? 1; d[b + 15] = o.span ?? Math.PI * 2;
    if (o.color && o.color.isColor) _c.copy(o.color); else _c.set(o.color ?? 0xffffff);
    if (o.color2 && o.color2.isColor) _c2.copy(o.color2); else _c2.set(o.color2 ?? 0xffffff);
    d[b + 16] = _c.r; d[b + 17] = _c.g; d[b + 18] = _c.b; d[b + 19] = MODE[o.mode] ?? 0;
    d[b + 20] = _c2.r; d[b + 21] = _c2.g; d[b + 22] = _c2.b; d[b + 23] = o.add ?? 0;
    const gr = o.grow || [1, 1], er = o.erode || [0.05, 0.9];
    d[b + 24] = gr[0]; d[b + 25] = gr[1]; d[b + 26] = er[0]; d[b + 27] = er[1];
    const sc = o.scroll || [0, 0];
    d[b + 28] = sc[0]; d[b + 29] = sc[1]; d[b + 30] = TEX[o.tex] ?? 0; d[b + 31] = o.start ?? Math.random() * 6.283;
    const tl = o.tile || [2, 1];
    d[b + 32] = tl[0]; d[b + 33] = tl[1]; d[b + 34] = o.I ?? 1; d[b + 35] = o.core ?? 1;
    d[b + 36] = o.twist ?? 0; d[b + 37] = o.soft ?? 0.03; d[b + 38] = o.kind === 'sphere' ? (o.rise ?? 0) : (o.wobble ?? 7); d[b + 39] = o.body ?? 1;
    this.endAt[s] = birth + dur;
    let h = null;
    if (o.handle) {
      h = new Handle(this, s); h.isHandle = true;
      h.pos.copy(p); h.up.copy(up); h.fwd.copy(fw); h.I = o.I ?? 1;
      this.meta[s] = h;
    } else this.meta[s] = null;
    this.liveList.push(s);
    return h || true;
  }

  /** Terrain the draped discs lie on: the ground data texture (r = height) covering ±half m, or null (flat discs). */
  setGround(tex, half) {
    const u = this.mesh.material.uniforms;
    this.groundTex = tex || null;
    u.uGround.value = this.groundTex;
    u.uGroundBox.value.set(half, 0.5 / half, this.groundTex ? 1 : 0);
  }

  release(s) {
    const m = this.meta[s];
    if (m && m.isHandle) m.alive = false;
    this.meta[s] = null;
    this.endAt[s] = -1;
    const i = this.liveList.indexOf(s);
    if (i >= 0) { this.liveList[i] = this.liveList[this.liveList.length - 1]; this.liveList.pop(); }
    this.free.push(s);
  }

  /** per frame: handles follow, expired slots free, live instances packed back-to-front */
  update(now, dt, camPos) {
    const d = this.data, L = this.liveList;
    for (let i = L.length - 1; i >= 0; i--) {
      const s = L[i], b = s * F, h = this.meta[s];
      if (h && h.isHandle) {
        if (h.fadeDur > 0) { h.fadeT -= dt; if (h.fadeT <= 0) { this.release(s); continue; } }
        if (h.follow) h.pos.copy(h.follow);
        d[b] = h.pos.x; d[b + 1] = h.pos.y; d[b + 2] = h.pos.z;
        d[b + 4] = h.up.x; d[b + 5] = h.up.y; d[b + 6] = h.up.z;
        d[b + 8] = h.fwd.x; d[b + 9] = h.fwd.y; d[b + 10] = h.fwd.z;
        d[b + 34] = h.I * (h.fadeDur > 0 ? Math.max(0, h.fadeT / h.fadeDur) : 1);
        if (now > d[b + 3] + d[b + 7] * 0.8) d[b + 3] = now - d[b + 7] * 0.5;     // persistent: hold mid-life
        continue;
      }
      if (now > this.endAt[s]) this.release(s);
    }
    const n = L.length, ord = this.order;
    ord.length = n;
    for (let i = 0; i < n; i++) {
      const s = L[i], b = s * F;
      ord[i] = s;
      this.dist[s] = (d[b] - camPos.x) ** 2 + (d[b + 1] - camPos.y) ** 2 + (d[b + 2] - camPos.z) ** 2;
    }
    const dist = this.dist;
    ord.sort((a, c) => dist[c] - dist[a]);
    for (let i = 0; i < n; i++) this.buf.set(d.subarray(ord[i] * F, ord[i] * F + F), i * F);
    this.count = n;
    this.geo.instanceCount = n;
    if (n) { this.ib.addUpdateRange(0, n * F); this.ib.needsUpdate = true; }
  }

  rebase(delta) {
    for (const s of this.liveList) { this.data[s * F + 3] -= delta; this.endAt[s] -= delta; }
  }
  clear() { for (let i = this.liveList.length - 1; i >= 0; i--) this.release(this.liveList[i]); this.geo.instanceCount = 0; this.count = 0; }
  get live() { return this.liveList.length; }
}
