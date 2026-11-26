// Post-processing pipeline behind G.renderFrame.
//   ScenePass  : scene -> HDR target (MSAA + depth texture); GTAO (half res, normals from depth); light shafts from the
//                sunlit gaps in the cloud layer (depth-limited integration); optional depth of field; exposure.
//   Bloom      : three's UnrealBloomPass (thresholds follow the Veil: glow() materials >1 bloom, daylight does not).
//   GradePass  : ACES tone mapping -> sRGB -> per-state grading (lift / gain / saturation / contrast), vignette,
//                screen flash, dither.
//   SMAA       : round 2, on top of MSAA (high): cleans the alpha-tested foliage / thin-geometry edges MSAA leaves.
//   FXAA       : only when the scene target has no MSAA (low quality).
import * as THREE from 'three';
import { CLEAR_CLOUD_BASE, CLOUD_THICKNESS, CLOUD_SLICES_GLSL, CLOUD_RESOLVE_GLSL } from './cloud-layer.js';
import { createCloudShafts, BEAM_UPSAMPLE_GLSL } from './cloud-shafts.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

const FS_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMP_FRAG = /* glsl */`
#include <packing>
${CLOUD_SLICES_GLSL}
${CLOUD_RESOLVE_GLSL}
${BEAM_UPSAMPLE_GLSL}
uniform sampler2D tScene, tDepth, tAO, tShafts;
uniform sampler2D tCloudLight,tCloudDepth;
uniform mat4 uCloudInvProj,uCloudCamera;
uniform float uCloudBase;
uniform float uAO, uShaftK, uExposure, uNear, uFar, uFocus, uFocusRange, uMaxCoc;
uniform vec3 uShaftCol;
uniform vec2 uTexel;
varying vec2 vUv;
float viewDist(float d) { return -perspectiveDepthToViewZ(d, uNear, uFar); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  // a single NaN / negative / inf pixel (bad instance colour, degenerate normal) would smear black or white over the
  // whole frame through the bloom mips: sanitise it here
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = clamp(c, vec3(0.0), vec3(6.0e4));
#ifdef DOF
  float z = viewDist(texture2D(tDepth, vUv).x);
  float coc = clamp(abs(z - uFocus) / uFocusRange, 0.0, 1.0) * uMaxCoc;
  if (coc > 0.5) {
    vec3 acc = c; float wsum = 1.0;
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / 24.0) * coc;
      float a = fi * 2.39996;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uTexel;
      float zs = viewDist(texture2D(tDepth, uv).x);
      float cs = clamp(abs(zs - uFocus) / uFocusRange, 0.0, 1.0) * uMaxCoc;
      float w = smoothstep(r - 1.0, r + 1.0, cs + 0.5);
      acc += texture2D(tScene, uv).rgb * w; wsum += w;
    }
    c = acc / wsum;
  }
#endif
  float ao = texture2D(tAO, vUv).r;
  float zl = viewDist(texture2D(tDepth, vUv).x);
  // look round: AO is deepened (pow) and sinks toward a cool shade instead of grey, so crevices, eaves and the
  // feet of walls read as shade of the land, not as a dirty halo
  // light r3: foliage (blossom pink, leaf / grass green: saturated, the brightest channel red-over-blue or green)
  // keeps a third of the AO and none of the cool tint: the gaps between crown cards turned violet. Built things (stone,
  // plaster, wood, roofs: low saturation, or red-orange like the torii) keep all of it.
  float cmx = max(c.r, max(c.g, c.b)), cmn = min(c.r, min(c.g, c.b));
  float csat = (cmx - cmn) / max(cmx, 1e-4);
  float leaf = step(c.r, c.g) * step(c.b, c.g) * smoothstep(0.2, 0.45, csat);
  float bloss = step(c.g, c.r) * smoothstep(0.0, 0.08, (c.b - c.g) / max(cmx, 1e-4)) * smoothstep(0.08, 0.25, csat);
  float folK = max(leaf, bloss);
  ao = mix(1.0, pow(clamp(ao, 0.0, 1.0), 1.5), uAO * (1.0 - smoothstep(60.0, 160.0, zl)) * (1.0 - 0.65 * folK));
  c *= vec3(ao) * mix(vec3(1.0), vec3(0.9, 0.96, 1.1), (1.0 - ao) * (1.0 - folK));
  float sceneDepth=texture2D(tDepth,vUv).r;
  if(uShaftK>.001) {
    vec4 beamHit=uCloudInvProj*vec4(vUv*2.-1.,sceneDepth*2.-1.,1.);
    float metres=min(length(beamHit.xyz/beamHit.w),820.);
    c+=uShaftCol*(uShaftK*mvBeamGather(tShafts,vUv,metres));
  }
  if(sceneDepth<.9999995) {
    vec4 hit=uCloudInvProj*vec4(vUv*2.-1.,sceneDepth*2.-1.,1.);
    vec3 toHit=mat3(uCloudCamera)*(hit.xyz/hit.w);
    float st=length(toHit), dy=toHit.y/max(st,.0001);
    dy=abs(dy)<.0001 ? (dy<0.?-.0001:.0001) : dy;
    float a=(uCloudBase-uCloudCamera[3].y)/dy;
    float b=(uCloudBase+${CLOUD_THICKNESS.toFixed(1)}-uCloudCamera[3].y)/dy;
    float lo=max(0.,min(a,b)), hi=min(3200.,max(a,b));
    if(hi>lo && st>lo) {
      vec4 cloud=cloudResolve(tCloudLight,vUv);
      float u=clamp((st-lo)/(hi-lo),0.,1.);
      vec4 depths=cloudResolve(tCloudDepth,vUv);
      vec4 deltas=max(vec4(0.),depths-vec4(0.,depths.xyz));
      vec4 cuts=cloudSlices(hi-lo,lo), starts=vec4(0.,cuts.xyz);
      float od=dot(deltas,clamp((vec4(u)-starts)/max(cuts-starts,vec4(.00001)),0.,1.));
      float k=(1.-exp(-od));
      c=mix(c,cloud.rgb/max(.0001,cloud.a),min(k,cloud.a));
    }
  }
  gl_FragColor = vec4(c * uExposure, 1.0);
}`;

// AO normals (perf pass): view-space normals reconstructed from the full-res depth ONCE per frame into a half-res RGB8
// target, so GTAO and its Poisson denoise read one texel instead of reconstructing (9 depth taps) per sample — the
// denoise did that 12 times per pixel. Same reconstruction as three's GTAO / PoissonDenoise shaders.
const AONORMAL_FRAG = /* glsl */`
uniform highp sampler2D tDepth; uniform mat4 cameraProjectionMatrixInverse;
varying vec2 vUv;
vec3 vpos(vec2 uv, float d) { vec4 c = vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); vec4 v = cameraProjectionMatrixInverse * c; return v.xyz / v.w; }
float fd(ivec2 p) { return texelFetch(tDepth, p, 0).r; }
void main() {
  vec2 size = vec2(textureSize(tDepth, 0));
  ivec2 p = ivec2(vUv * size);
  float c0 = fd(p);
  if (c0 >= 1.0) { gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0); return; } // sky: unpacks to a zero normal (denoise skips it)
  float l2 = fd(p - ivec2(2, 0)), l1 = fd(p - ivec2(1, 0)), r1 = fd(p + ivec2(1, 0)), r2 = fd(p + ivec2(2, 0));
  float b2 = fd(p - ivec2(0, 2)), b1 = fd(p - ivec2(0, 1)), t1 = fd(p + ivec2(0, 1)), t2 = fd(p + ivec2(0, 2));
  float dl = abs((2.0 * l1 - l2) - c0), dr = abs((2.0 * r1 - r2) - c0), db = abs((2.0 * b1 - b2) - c0), dt = abs((2.0 * t1 - t2) - c0);
  vec2 uv = (vec2(p) + 0.5) / size;
  vec3 ce = vpos(uv, c0);
  vec3 dpdx = (dl < dr) ? ce - vpos(uv - vec2(1.0 / size.x, 0.0), l1) : -ce + vpos(uv + vec2(1.0 / size.x, 0.0), r1);
  vec3 dpdy = (db < dt) ? ce - vpos(uv - vec2(0.0, 1.0 / size.y), b1) : -ce + vpos(uv + vec2(0.0, 1.0 / size.y), t1);
  gl_FragColor = vec4(normalize(cross(dpdx, dpdy)) * 0.5 + 0.5, 1.0);
}`;

// tone curve (grade pass, and the GPU pass's tone pass)
const TONE_GLSL = /* glsl */`
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color) {
  const mat3 IM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = IM * (color / 0.6); color = RRTAndODTFit(color); return clamp(OM * color, 0.0, 1.0);
}
const mat3 MV_TO2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
const mat3 MV_FROM2020 = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const mat3 MV_AGX_IN = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
const mat3 MV_AGX_OUT = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
vec3 agxSig(vec3 x) { vec3 x2 = x * x; vec3 x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
uniform float uTone, uToneExp, uToneCt, uToneSat;
vec3 agx(vec3 c) {
  c = MV_AGX_IN * (MV_TO2020 * (c * uToneExp));
  c = (log2(max(c, vec3(1e-10))) + 12.47393) / 16.499999;
  c = clamp(0.606 + (c - 0.606) * uToneCt, 0.0, 1.0); // contrast around middle grey in the log domain
  c = agxSig(c);
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uToneSat); // AgX look: a little colour back after the sigmoid
  c = MV_AGX_OUT * c;
  c = MV_FROM2020 * pow(max(c, vec3(0.0)), vec3(2.2));
  return clamp(c, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toneMap(vec3 h) { h = max(h, vec3(0.0)); return toSRGB(uTone > 0.5 ? agx(h) : aces(h)); }
`;

// GPU pass: tone map ONCE per pixel (the grade's sharpen used to tone map the centre and four neighbours = 5x), with the
// bloom added here instead of in its own full-res additive pass (same sum: dst + rgb of the bloom composite).
// Output: display-referred sRGB in the half-float composer buffer; the grade then reads it as is (uPre).
const TONE_FRAG = /* glsl */`
uniform sampler2D tDiffuse, tBloom;
uniform float uBloomOn;
varying vec2 vUv;
${TONE_GLSL}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (uBloomOn > 0.5) c += texture2D(tBloom, vUv).rgb; // the bloom's blend: premultiplied additive (ONE, ONE)
  gl_FragColor = vec4(toneMap(c), 1.0);
}`;

const GRADE_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec3 uLift, uGain, uVigCol, uFlash;
uniform float uSat, uContrast, uMidLift, uVig, uGradeOn, uVib, uSharp, uSatKnee, uHiRoll;
uniform vec3 uShTint;
uniform vec2 uTexel;
varying vec2 vUv;
// look round: AgX-style filmic curve (log encoding + sigmoid, after Sobotka / Filament, as in three's chunk): a gentle
// toe and a long shoulder, highlights roll toward white instead of skewing hue, and pure primaries are pulled back.
// uTone = 0 keeps the old ACES fit (A/B).
${TONE_GLSL}
uniform float uPre;
vec3 tm(vec2 uv) { return uPre > 0.5 ? texture2D(tDiffuse, uv).rgb : toneMap(texture2D(tDiffuse, uv).rgb); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = tm(vUv);
  // gentle contrast-adaptive sharpening (restores crispness lost to MSAA resolve / bloom; limited so it never rings)
  if (uSharp > 0.0) {
    vec3 n = tm(vUv + vec2(0.0, uTexel.y)), s = tm(vUv - vec2(0.0, uTexel.y)), e = tm(vUv + vec2(uTexel.x, 0.0)), w = tm(vUv - vec2(uTexel.x, 0.0));
    vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-3)), 0.0, 1.0));
    vec3 k = -amp * uSharp * 0.2;
    // light r3: clamped to the neighbourhood, so a stronger setting steepens edges and lettering but never rings
    c = clamp((c + (n + s + e + w) * k) / (1.0 + 4.0 * k), mn, mx);
  }
  if (uGradeOn > 0.5) {
    c = uGain * (c + uLift * (1.0 - c));
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float hi = max(c.r, max(c.g, c.b)), lo = min(c.r, min(c.g, c.b));
    float chroma = hi - lo;
    // Pastel flowers, grass and sky gain the most colour. Taper the gain on
    // bright peach tones (skin), near-white silver hair and sunlit cloud tops.
    float peach = smoothstep(.018, .105, c.r - c.g) * smoothstep(.0, .06, c.g - c.b)
                * smoothstep(.40, .68, l) * (1.0 - smoothstep(.28, .51, chroma));
    float mids = smoothstep(.035, .15, l) * (1.0 - smoothstep(.85, .985, l));
    float quiet = 1.0 - smoothstep(.08, .65, chroma);
    float scale = 1.0 + (uSat - 1.0 + uVib * quiet) * mids * (1.0 - .9 * peach);
    scale *= 1.0 - uSatKnee * smoothstep(.36, .9, chroma);
    // Increase chroma along one hue ray, only as far as both bounds of sRGB allow.
    float room = min(l / max(l - lo, .0001), (1.0 - l) / max(hi - l, .0001));
    c = mix(vec3(l), c, min(scale, max(1.0, room)));
    // Shape luminance around middle grey, leaving black and white fixed.
    // The same brightness adjustment on all channels keeps blush and roof tiles in hue.
    float lum = clamp(dot(c,vec3(.2126,.7152,.0722)),0.,1.);
    float delta = lum*(1.-lum)*(4.*(uContrast-1.)*(lum-.5) + uMidLift*(2.-lum));
    if(delta<0.) c *= 1.+delta/max(.0001,lum);
    else c += (1.-c)*delta/max(.0001,1.-lum);
    // highlight roll-off (soft look): sunlit stone, white blossoms and cloud tops settle just under paper white
    c *= 1.0 - uHiRoll * 0.1 * smoothstep(0.58, 1.0, dot(c, vec3(.2126,.7152,.0722)));
    // split tone: the land's colour sinks into the shadows only; mid-tones (skin) and whites (the kosode) stay clean
    float sh = 1.0 - smoothstep(0.0, 0.45, l);
    c *= mix(vec3(1.0), uShTint, sh * sh);
    vec2 q = vUv - 0.5;
    float v = (1.0 - smoothstep(0.2, 0.85, length(q * vec2(1.25, 1.0))));
    c = mix(c * uVigCol, c, mix(1.0, v, uVig));
  }
  c += uFlash;
  // triangular dither (+-1 LSB) against banding in skies and fog
  c += (hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.31) - 1.0) / 255.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// Bloom input: hue-preserving clamp (max channel <= BLOOM_CLAMP), then a soft-knee threshold on luminance.
export const BLOOM_CLAMP = 4.0;
const HIGHPASS_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform float luminosityThreshold, uKnee, uClampMax;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float m = max(c.r, max(c.g, c.b));
  c *= min(1.0, uClampMax / max(m, 1e-4));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(uKnee, 1e-3);
  float s = clamp(l - luminosityThreshold + k, 0.0, 2.0 * k);
  s = s * s / (4.0 * k);
  float w = max(s, l - luminosityThreshold) / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}`;

// Final upscale (light r3), only while the dynamic resolution renders below the canvas size: a Catmull-Rom
// (5 bilinear taps) reconstruction clamped to the 2x2 source footprint (sharp, no ringing), then a contrast-adaptive
// sharpen against the source-texel neighbours, so a 0.85 render scale keeps its edges instead of a bilinear smear.
const UPSCALE_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uSrc; uniform float uSharp;
varying vec2 vUv;
vec3 tx(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }
void main() {
  vec2 inv = 1.0 / uSrc;
  vec2 p = vUv * uSrc - 0.5, f = fract(p), b = floor(p) + 0.5;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, o12 = w2 / max(w12, vec2(1e-4));
  vec2 t0 = (b - 1.0) * inv, t3 = (b + 2.0) * inv, t12 = (b + o12) * inv;
  vec3 c = tx(vec2(t12.x, t0.y)) * (w12.x * w0.y) + tx(vec2(t0.x, t12.y)) * (w0.x * w12.y) + tx(t12) * (w12.x * w12.y)
         + tx(vec2(t3.x, t12.y)) * (w3.x * w12.y) + tx(vec2(t12.x, t3.y)) * (w12.x * w3.y);
  c /= max(w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y, 1e-4);
  ivec2 ip = ivec2(floor(p)), mxp = ivec2(uSrc) - 1;
  vec3 a00 = texelFetch(tDiffuse, clamp(ip, ivec2(0), mxp), 0).rgb, a10 = texelFetch(tDiffuse, clamp(ip + ivec2(1, 0), ivec2(0), mxp), 0).rgb;
  vec3 a01 = texelFetch(tDiffuse, clamp(ip + ivec2(0, 1), ivec2(0), mxp), 0).rgb, a11 = texelFetch(tDiffuse, clamp(ip + ivec2(1, 1), ivec2(0), mxp), 0).rgb;
  vec3 mn = min(min(a00, a10), min(a01, a11)), mx = max(max(a00, a10), max(a01, a11));
  c = clamp(c, mn, mx);
  if (uSharp > 0.0) {
    vec3 n = tx(vUv + vec2(0.0, inv.y)), s = tx(vUv - vec2(0.0, inv.y)), e = tx(vUv + vec2(inv.x, 0.0)), w = tx(vUv - vec2(inv.x, 0.0));
    vec3 lo = min(c, min(min(n, s), min(e, w))), hi = max(c, max(max(n, s), max(e, w)));
    vec3 amp = sqrt(clamp(min(lo, 1.0 - hi) / max(hi, vec3(1e-3)), 0.0, 1.0));
    vec3 k = -amp * uSharp * 0.2;
    c = clamp((c + (n + s + e + w) * k) / (1.0 + 4.0 * k), lo, hi);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// grading presets (display space)
export const GRADES = {
  // vib = vibrance: extra saturation for the muted colours only (skin and already-vivid colours are left alone)
  // knee (look round) = how much the loudest colours are pulled back; gain warms the lights, sh cools the darks; lift is
  // kept tiny so the darks stay dark (a raised black was half of the old flat look); the vignette is the faintest touch
  neutral: { lift: [0, 0, 0], gain: [1, 1, 1], sh: [1, 1, 1], sat: 1, vib: 0, knee: 0, contrast: 1, midLift: 0, vig: 0, vigCol: [1, 1, 1] },
  sun: { lift: [0.0, 0.002, 0.008], gain: [1.005, 1.0, 0.995], sh: [0.98, 0.995, 1.03], sat: 1.49, vib: 0.65, knee: 0.14, contrast: 1.22, midLift: .07, vig: 0.12, vigCol: [0.86, 0.9, 0.98] },
  dusk: { lift: [0.012, 0.0, 0.024], gain: [1.025, 0.985, 0.96], sh: [0.99, 0.95, 1.06], sat: 1.31, vib: 0.37, knee: 0.15, contrast: 1.20, midLift: .04, vig: 0.18, vigCol: [0.8, 0.66, 0.86] },
  night: { lift: [0.0, 0.006, 0.02], gain: [1.01, 1.0, 0.99], sh: [0.95, 0.98, 1.08], sat: 1.09, vib: 0.13, knee: 0.16, contrast: 1.06, midLift: 0, vig: 0.22, vigCol: [0.62, 0.68, 0.9] },
  // 'soft' look (default since the play-upgrade round): an airy anime-game grade. Colour comes from hue, not from
  // pushed saturation: the loudest colours (lime grass tips, magenta crowns, white path stone) are pulled back hard,
  // muted ones (sky, pastel flowers) keep a little vibrance, contrast stays low, shadows are lifted and cool instead of
  // crushed, and the light keeps a faint warmth. Paired with a lower tone-curve contrast and a paler, denser haze.
  soft_sun: { lift: [0.006, 0.01, 0.018], gain: [1.012, 1.0, 0.978], sh: [0.965, 0.995, 1.06], sat: 1.24, vib: 0.55, knee: 0.3, contrast: 1.07, midLift: 0.06, vig: 0.06, vigCol: [0.9, 0.94, 1.0], hiRoll: 0.65 },
  soft_dusk: { lift: [0.012, 0.006, 0.024], gain: [1.02, 0.99, 0.965], sh: [0.98, 0.95, 1.06], sat: 1.18, vib: 0.3, knee: 0.28, contrast: 1.1, midLift: 0.04, vig: 0.12, vigCol: [0.84, 0.74, 0.9], hiRoll: 0.5 },
  soft_night: { lift: [0.004, 0.01, 0.026], gain: [1.0, 1.0, 1.0], sh: [0.95, 0.99, 1.08], sat: 1.04, vib: 0.12, knee: 0.18, contrast: 1.04, midLift: 0.02, vig: 0.18, vigCol: [0.66, 0.72, 0.92], hiRoll: 0.3 },
};

/**
 * Whole-picture looks the player picks in settings (G.settings.look). Each names its three grades, the filmic tone
 * curve (exposure into the curve, log-domain contrast, colour after the sigmoid), how much the distance haze thickens
 * (fog) and how far its colour moves toward a pale sky white (haze), a bloom multiplier, and the light ratio: key
 * (sun) and fill (sky ambient) multipliers and the strength of the sunbeams through cloud gaps (shafts).
 */
export const LOOKS = {
  soft: { sun: 'soft_sun', dusk: 'soft_dusk', night: 'soft_night', tone: { exp: 1.05, ct: 1.13, sat: 1.03 }, fog: 1.3, haze: 0.26, bloom: 0.9, key: 1.1, fill: 0.78, shafts: 1.15 },
  vivid: { sun: 'sun', dusk: 'dusk', night: 'night', tone: { exp: 1.08, ct: 1.22, sat: 1.08 }, fog: 1, haze: 0, bloom: 1, key: 1, fill: 1, shafts: 1 },
};
export const lookOf = (name) => LOOKS[name] || LOOKS.soft;

class ScenePass extends Pass {
  constructor(renderer, scene, camera, opt) {
    super();
    this.scene = scene; this.camera = camera; this.opt = opt;
    this.needsSwap = true;
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: opt.samples, depthTexture });
    this.sceneRT.texture.name = 'mvScene';
    this.cloudShafts = createCloudShafts(camera, depthTexture, opt.cloudUniforms, opt.quality, opt.sunShadow);
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
    this.quad = new FullScreenQuad(null);
    this.compMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: COMP_FRAG, depthTest: false, depthWrite: false, defines: {},
      uniforms: { uCloudInvProj: {value:camera.projectionMatrixInverse}, uCloudCamera:{value:camera.matrixWorld},
        tCloudLight:{value:this.black},tCloudDepth:{value:this.black},uCloudBase:{value:CLEAR_CLOUD_BASE},tScene: { value: this.sceneRT.texture }, tDepth: { value: depthTexture }, tAO: { value: this.white }, tShafts: { value: this.black },
        uAO: { value: 1 }, uShaftK: { value: 0 }, uShaftCol: { value: new THREE.Color(1, 0.85, 0.6) }, uExposure: { value: 1 },
        uNear: { value: camera.near }, uFar: { value: camera.far }, uFocus: { value: 10 }, uFocusRange: { value: 12 }, uMaxCoc: { value: 9 },
        uTexel: { value: new THREE.Vector2() } },
    });
    this.gtao = null;
    if (opt.ao) this.makeAO();
    this.ao = opt.ao; this.shafts = opt.shafts; this.dof = false;
    this.shaftK = 0;
    this.w = 1; this.h = 1;
    this.frame = 0; this.cap = null; this._capFrame = -1;
  }
  /**
   * Opaque-scene capture for refraction (round 2). Called by a refracting material from its onBeforeRender, i.e. in the
   * transparent list after every opaque object has drawn: blits the scene target's colour + depth (MSAA-resolved by
   * the blit, the multisampled buffer itself is left intact) into a separate target, once per frame. Returns
   * { color, depth, width, height } or null when the renderer is not drawing the main scene target.
   */
  captureOpaque(renderer) {
    if (renderer.getRenderTarget() !== this.sceneRT) return null;
    if (this._capFrame === this.frame) return this.capInfo;
    const w = this.sceneRT.width, h = this.sceneRT.height;
    if (!this.cap) {
      const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
      dt.minFilter = dt.magFilter = THREE.NearestFilter;
      this.cap = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: dt, samples: 0 });
      this.cap.texture.name = 'mvOpaque';
      this.capInfo = { color: this.cap.texture, depth: dt, width: w, height: h };
    } else if (this.cap.width !== w || this.cap.height !== h) { this.cap.setSize(w, h); this.capInfo.width = w; this.capInfo.height = h; }
    const P = renderer.properties;
    if (P.get(this.cap).__webglFramebuffer === undefined) {
      // first use: let three allocate it (this binds it), then put the scene target back
      renderer.initRenderTarget(this.cap);
      renderer.setRenderTarget(this.sceneRT);
    }
    const gl = renderer.getContext(), st = renderer.state;
    const sp = P.get(this.sceneRT), src = sp.__webglMultisampledFramebuffer || sp.__webglFramebuffer, dst = P.get(this.cap).__webglFramebuffer;
    if (!src || !dst) return null;
    st.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    st.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    st.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    st.bindFramebuffer(gl.DRAW_FRAMEBUFFER, src);
    this._capFrame = this.frame;
    return this.capInfo;
  }
  makeAO() {
    if (this.gtao) return;
    this.gtao = new GTAOPass(this.scene, this.camera, Math.max(1, this.w >> 1), Math.max(1, this.h >> 1), { depthTexture: this.sceneRT.depthTexture },
      { radius: 2.2, distanceExponent: 1.4, thickness: 3, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    this.gtao.updatePdMaterial({ samples: 12, rings: 2, radius: 6 });
    if (this.opt.aoNormals === false) return;
    this.aoNormalRT = new THREE.WebGLRenderTarget(Math.max(1, this.w >> 1), Math.max(1, this.h >> 1),
      { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.aoNormalMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: AONORMAL_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDepth: { value: this.sceneRT.depthTexture }, cameraProjectionMatrixInverse: { value: new THREE.Matrix4() } },
    });
    this.gtao.setGBuffer(this.sceneRT.depthTexture, this.aoNormalRT.texture);
  }
  setDOF(on) {
    this.dof = on;
    const has = 'DOF' in this.compMat.defines;
    if (on !== has) { if (on) this.compMat.defines.DOF = 1; else delete this.compMat.defines.DOF; this.compMat.needsUpdate = true; }
  }
  setSize(w, h) {
    this.w = w; this.h = h;
    this.sceneRT.setSize(w, h);
    this.cloudShafts.setSize(w, h);
    this.compMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.gtao?.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.aoNormalRT?.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }
  _draw(renderer, mat, target) {
    renderer.setRenderTarget(target);
    this.quad.material = mat;
    this.quad.render(renderer);
  }
  render(renderer, writeBuffer) {
    const cam = this.camera;
    this.frame++;
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, cam);
    this.sceneCalls = renderer.info.render.calls;

    const cu = this.compMat.uniforms;
    // ambient occlusion
    if (this.ao && this.gtao) {
      const g = this.gtao, gu = g.gtaoMaterial.uniforms;
      gu.cameraNear.value = cam.near; gu.cameraFar.value = cam.far;
      gu.cameraProjectionMatrix.value.copy(cam.projectionMatrix);
      gu.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
      gu.cameraWorldMatrix.value.copy(cam.matrixWorld);
      if (this.aoNormalMat) {
        this.aoNormalMat.uniforms.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
        this._draw(renderer, this.aoNormalMat, this.aoNormalRT);
      }
      g._renderPass(renderer, g.gtaoMaterial, g.gtaoRenderTarget, 0xffffff, 1.0);
      g.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
      g._renderPass(renderer, g.pdMaterial, g.pdRenderTarget, 0xffffff, 1.0);
      cu.tAO.value = g.pdRenderTarget.texture;
    } else cu.tAO.value = this.white;

    // light shafts
    if (this.shafts && this.shaftK > 0.002) {
      this.cloudShafts.draw(renderer);
      cu.tShafts.value = this.cloudShafts.target.texture;
      cu.uShaftK.value = this.shaftK;
    } else { cu.tShafts.value = this.black; cu.uShaftK.value = 0; }

    cu.uNear.value = cam.near; cu.uFar.value = cam.far;
    this._draw(renderer, this.compMat, this.renderToScreen ? null : writeBuffer);
  }
  dispose() { this.cap?.dispose(); this.sceneRT.dispose(); this.cloudShafts.dispose(); this.gtao?.dispose(); this.aoNormalRT?.dispose(); this.aoNormalMat?.dispose(); this.quad.dispose(); }
}

/**
 * Build the pipeline. opt: { samples, ao, bloom, shafts, fxaa, smaa, sharpen }.
 * Returns { composer, scenePass, bloom, grade, smaa, fxaa, setSize(w,h), render() }.
 */
export function createPipeline(renderer, scene, camera, opt) {
  // phones: the composer's ping-pong targets carry no depth buffer (every pass after the scene pass is a full-screen
  // quad; the scene pass has its own depth): one full-resolution depth renderbuffer less (~10 MB at 1080 lines)
  const composer = opt.mobile ? new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })) : new EffectComposer(renderer);
  const scenePass = new ScenePass(renderer, scene, camera, opt);
  composer.addPass(scenePass);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.55, 1.1);
  bloom.enabled = !!opt.bloom;
  // HDR budget: soft-knee threshold (only the part ABOVE the threshold blooms, not the whole pixel) + a hue-preserving
  // clamp of the bloom input, so a stack of additive particles or a flash light can never flood the frame with white.
  const hp = bloom.materialHighPassFilter;
  hp.uniforms.uKnee = { value: 0.5 };
  hp.uniforms.uClampMax = { value: BLOOM_CLAMP };
  hp.fragmentShader = HIGHPASS_FRAG;
  hp.needsUpdate = true;
  bloom.bloomTintColors.forEach((c, i) => c.setScalar([1.0, 0.85, 0.6, 0.36, 0.2][i])); // light r3: the wide mips were a milky sheet over signs and facades; the glow now hugs the source
  bloom.compositeMaterial.uniforms.bloomTintColors.value = bloom.bloomTintColors;
  composer.addPass(bloom);
  const gradeMat = new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader: GRADE_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tDiffuse: { value: null }, uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uVigCol: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: new THREE.Color(0, 0, 0) },
      uSat: { value: 1 }, uContrast: { value: 1 }, uMidLift: { value: 0 }, uVig: { value: 0 }, uGradeOn: { value: 1 },
      uVib: { value: 0 }, uSatKnee: { value: 0 }, uHiRoll: { value: 0 }, uTone: { value: opt.tone ?? 1 }, uToneExp: { value: 1.08 }, uToneCt: { value: 1.22 }, uToneSat: { value: 1.08 }, uShTint: { value: new THREE.Vector3(1, 1, 1) }, uSharp: { value: opt.sharpen ?? 0.6 }, uTexel: { value: new THREE.Vector2(1, 1) },
      uPre: { value: 0 } },
  });
  // GPU pass: tone map once (+ the bloom add) before the grade; on only where the grade would tone map more than once
  // (sharpen on) or the bloom adds a full-res pass. opt.gpuGrade (?gpuoff=grade / ?gpu=0 = the old order).
  const gu = gradeMat.uniforms;
  const toneMat = new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader: TONE_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, uBloomOn: { value: 0 },
      uTone: gu.uTone, uToneExp: gu.uToneExp, uToneCt: gu.uToneCt, uToneSat: gu.uToneSat },
  });
  const tone = new ShaderPass(toneMat);
  tone.enabled = false;
  composer.addPass(tone);
  // with the tone pass on, the bloom's own last step (additive full-res blend onto its input) is skipped: the tone pass adds it
  const bq = bloom._fsQuad, bqRender = bq.render.bind(bq);
  bq.render = (r) => { if (bloom.mvSkipBlend && bq.material === bloom.blendMaterial) return; bqRender(r); };
  const grade = new ShaderPass(gradeMat);
  composer.addPass(grade);
  // SMAA runs on the graded sRGB image (what its edge detection expects); not temporal, so nothing smears in motion
  const smaa = new SMAAPass();
  smaa.enabled = !!opt.smaa;
  composer.addPass(smaa);
  const fxaa = new FXAAPass();
  fxaa.enabled = !!opt.fxaa;
  composer.addPass(fxaa);
  // light r3: edge-aware upscale + sharpen, the last pass, enabled only while the render scale is below the canvas
  const upMat = new THREE.ShaderMaterial({
    vertexShader: FS_VERT, fragmentShader: UPSCALE_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tDiffuse: { value: null }, uSrc: { value: new THREE.Vector2(1, 1) }, uSharp: { value: 0 } },
  });
  const upscale = new ShaderPass(upMat);
  upscale.enabled = false;
  composer.addPass(upscale);
  const pipe = {
    composer, scenePass, bloom, tone, grade, smaa, fxaa, upscale,
    /** internal render pixel ratio (null = the renderer's); the last pass upscales to the canvas (dynamic resolution) */
    pr: null, cssW: 1, cssH: 1,
    /** internal render size in pixels (what the scene pass draws at) */
    size: new THREE.Vector2(1, 1),
    setSize(w, h) {
      pipe.cssW = w; pipe.cssH = h;
      const pr = pipe.pr ?? renderer.getPixelRatio();
      composer.setPixelRatio(pr); composer.setSize(w, h);
      pipe.size.set(Math.floor(w * pr), Math.floor(h * pr));
      gradeMat.uniforms.uTexel.value.set(1 / Math.max(1, w * pr), 1 / Math.max(1, h * pr));
      upMat.uniforms.uSrc.value.set(Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)));
    },
    /** Dynamic resolution (perf pass): render the pipeline at pixel ratio pr, keep the canvas; null = full. */
    setRenderScale(pr) {
      pipe.pr = pr == null || Math.abs(pr - renderer.getPixelRatio()) < 1e-3 ? null : pr;
      pipe.setSize(pipe.cssW, pipe.cssH);
      // light r3: below the canvas size the last pass is the edge-aware upscale (Catmull-Rom clamped + CAS) instead of
      // a bilinear stretch; its sharpen grows with the drop (0.92 -> 0.6, 0.77 -> 1.0), the grade keeps its own
      const k = pipe.pr ? Math.max(0, 1 - pipe.pr / renderer.getPixelRatio()) : 0;
      upscale.enabled = !!pipe.pr && pipe.pr < renderer.getPixelRatio();
      upMat.uniforms.uSharp.value = Math.min(1.1, 0.4 + k * 2.6);
    },
    render() {
      const pre = !!opt.gpuGrade && (bloom.enabled || gu.uSharp.value > 0);
      tone.enabled = pre; gu.uPre.value = pre ? 1 : 0;
      bloom.mvSkipBlend = pre && bloom.enabled;
      toneMat.uniforms.uBloomOn.value = pre && bloom.enabled ? 1 : 0;
      toneMat.uniforms.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
      composer.render();
    },
  };
  const cs = renderer.getSize(new THREE.Vector2());
  pipe.setSize(cs.x, cs.y);
  return pipe;
}
