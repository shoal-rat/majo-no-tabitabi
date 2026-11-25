// The sky dome: an inside-out sphere that follows the camera. It is drawn in TWO passes for speed:
//   LOW  (half resolution, own render target, every frame): gradient sky whose colour depends on the land each view
//        direction is looking over, violet anti-sun shading, milky band (天河), the veil curtains around the ring,
//        corona, glare, and a world-space cloud volume with sunward extinction.
//        Alpha = cloud coverage.
//   HIGH (full resolution, in the main scene): upsamples LOW and adds what must stay sharp — stars, the Sun disc, the
//        dark Moon disc with faint surface detail that truly occludes it, the golden ring, its beads and the diamond glint.
import * as THREE from 'three';
import { U, GLSL_ATMO, RS, RM } from './atmo.js';
import { CLEAR_CLOUD_BASE, CLOUD_THICKNESS, CLOUD_RESOLVE_GLSL } from './cloud-layer.js';
import { cloudFieldUniforms } from './cloud-field.js';
import { cloudNoise, CLOUD_GLSL } from './cloudVolume.js';
import { noiseTexture } from './noise.js';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999; // never clipped by the far plane
}`;

const COMMON = /* glsl */`
${GLSL_ATMO}
uniform vec3 uCam;
uniform vec3 uMoonDir, uSunU, uSunV, uMoonU, uMoonV;
uniform float uCover;      // 0 .. 1 how much of the Sun the Moon hides (seen from the camera)
uniform float uSunVis;     // 1 - uCover
uniform sampler2D uNoise;
uniform float uCloudH, uCloudCover;
uniform float uSkyNight;
uniform vec2 uWeather; // overcast, warm sunlight
uniform vec3 uFlash;
varying vec3 vDir;
#define RS ${RS.toFixed(4)}
#define RM ${RM.toFixed(4)}
#define TAU 6.2831853
float fbm4(vec2 uv) { return dot(texture2D(uNoise, uv), vec4(0.5, 0.25, 0.125, 0.0625)) * 1.0667; }
float angTo(vec3 a, vec3 b) { return 2.0 * asin(min(length(a - b) * 0.5, 1.0)); }
// veil value of the sky in direction d (the land it hangs over)
float skyVeil(vec3 d, out float wH) {
  vec2 hd = normalize(d.xz + vec2(1e-5));
  float vNear = mvVeilAt(uCam.xz + hd * 240.0);
  float vFar = mvVeilAt(uCam.xz + hd * 700.0);
  wH = exp(-max(d.y, 0.0) * 9.0);
  return mix(mvCamVeil, mix(vNear, vFar, 0.55 + 0.45 * wH), wH * 0.82);
}
`;

const FRAG_LOW = /* glsl */`
${COMMON}
${CLOUD_GLSL}
#ifdef SKY_PROBE
varying vec2 probeUv;
#else
layout(location=1) out highp vec4 cloudLight;
layout(location=2) out highp vec4 cloudDepthBands;
#endif
void main() {
#ifdef SKY_PROBE
  float az=(probeUv.x-.5)*TAU, elevation=probeUv.y*TAU*.25;
  vec3 d=vec3(cos(az)*cos(elevation),sin(elevation),sin(az)*cos(elevation));
#else
  vec3 d = normalize(vDir);
#endif
  float el = d.y, elp = max(el, 0.0);
  float wH;
  float vS = skyVeil(d, wH);
  vec2 hd = normalize(d.xz + vec2(1e-5));
  float vZ = mix(mvCamVeil, mvVeilAt(uCam.xz + hd * 240.0), 0.35);

  vec3 zen = mvPalette(MV_ROW_SKYZEN, vZ);
  vec3 hor = mvPalette(MV_ROW_SKYHOR, vS);
  float highAir=smoothstep(uCloudH+${CLOUD_THICKNESS.toFixed(1)}-5.,uCloudH+${CLOUD_THICKNESS.toFixed(1)}+20.,uCam.y);
  zen=mix(zen,vec3(.035,.26,.65),highAir*.63);
  zen = mix(zen, vec3(.24,.37,.50), uWeather.x*.78*(1.-highAir));
  hor = mix(hor, vec3(.42,.54,.63), uWeather.x*.79*(1.-highAir*.92));
  hor += vec3(.13,.055,.006)*uWeather.y*(1.-uWeather.x);
  float darkSky=max(uSkyNight,uCover*.96);
  zen=mix(zen,vec3(.018,.036,.068),darkSky*.97);
  hor=mix(hor,mix(vec3(.095,.125,.179),vec3(.31,.21,.15),uCover),darkSky*.88);
  vec3 col = mix(zen, hor, pow(1.0 - elp, 3.2));
  if (el < 0.0) col = mix(hor, mvPalette(MV_ROW_FOG, vS) * 0.85, (1.0 - smoothstep(-0.2, 0.0, el)));

  float cs = dot(d, mvSunDir);
  float dusk = clamp(4.0 * vS * (1.0 - vS), 0.0, 1.0);
  col = mix(col, col * vec3(0.78, 0.62, 1.08), dusk * 0.55 * (1.0 - smoothstep(-0.6, 0.3, cs)));
  col += vec3(1.0, 0.62, 0.3) * dusk * 0.35 * pow(max(cs, 0.0), 4.0) * (0.4 + 0.6 * wH);
  col += vec3(1.0, 0.85, 0.65) * (pow(max(cs, 0.0), 24.0) * 0.3 + pow(max(cs, 0.0), 4.0) * 0.07) * uSunVis * (1.0 - 0.6 * vS);

  float aS = angTo(d, mvSunDir);
  float aM = angTo(d, uMoonDir);
  float ringK = smoothstep(0.86, 0.995, uCover);
  float nightK = smoothstep(0.55, 0.95, max(vS,max(uSkyNight,uCover*.85))) * smoothstep(-0.05, 0.12, el);
  if (nightK > 0.001) {
    float hide = smoothstep(RM * 1.1, RM * 1.8, aM);
    // milky band
    vec3 nb = normalize(vec3(0.42, 0.38, -0.82));
    float b = dot(d, nb);
    float lon = atan(d.z, d.x) / TAU;
    float m1 = fbm4(vec2(lon * 3.0, b * 1.6 + 0.3));
    float m2 = fbm4(vec2(lon * 6.0 + 0.37, b * 3.5));
    float band = exp(-b * b / 0.03) * (0.3 + 1.1 * m1 * m1);
    float lane = smoothstep(0.5, 0.72, m2) * exp(-b * b / 0.005);
    band *= 1.0 - 0.7 * lane;
    vec3 milk = mix(vec3(0.3, 0.36, 0.9), vec3(1.0, 0.75, 0.95), smoothstep(0.35, 0.75, m2)) * band * 0.2;
    col += milk * nightK * hide;

    // veil curtains: two ribbons hanging round the ring, rays falling outward from a bright inner hem
    float phi = atan(dot(d, uSunV), dot(d, uSunU));
    vec3 ccol = vec3(0.0);
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float sway = mvTime * (0.011 + 0.006 * fk);
      float rc = (0.2 + 0.12 * fk) + 0.07 * (fbm4(vec2(phi / TAU * (2.0 + fk) + sway, 0.31 + 0.2 * fk)) - 0.5) * 2.0;
      float u = aS - rc;
      float prof = u < 0.0 ? exp(u / 0.035) * (0.35 + 0.65 * smoothstep(-0.012, 0.0, u)) : exp(-u / (0.07 + 0.04 * fk));
      float fold = phi + 0.1 * sin(phi * 3.0 + mvTime * 0.04 + fk * 2.0) + u * (0.5 + 0.4 * fk);
      float streak = texture2D(uNoise, vec2(fold / TAU * (4.0 + 2.0 * fk), 0.15 * fk + mvTime * 0.003)).a;
      streak = smoothstep(0.35, 0.8, streak);
      float shimmer = 0.45 + 0.55 * smoothstep(0.3, 0.7, fbm4(vec2(phi / TAU * 2.0 - mvTime * 0.006, 0.7 + fk * 0.3)));
      float c = prof * (0.3 + 1.2 * streak) * shimmer;
      vec3 tint = mix(vec3(0.2, 1.0, 0.72), vec3(0.62, 0.38, 1.0), clamp(u / 0.12 + fk * 0.7, 0.0, 1.0));
      tint = mix(tint, vec3(1.0, 0.45, 0.78), clamp(u / 0.2 - 0.3, 0.0, 1.0) * 0.55);
      ccol += tint * c;
    }
    float curtainK = smoothstep(0.7, 1.0, vS) * smoothstep(-0.02, 0.1, el) * smoothstep(RM * 1.1, RM * 1.8, aS);
    col += ccol * 0.085 * curtainK * mvBoostSoft();
  }

  // corona (outside the Moon) + inner halo
  float inMoon = 1.0 - smoothstep(RM - 0.0015, RM + 0.0015, aM);
  float outside = max(aM - RM, 0.0);
  vec2 m2 = vec2(dot(d, uMoonU), dot(d, uMoonV)) / RM;
  float mphi = atan(m2.y, m2.x);
  float strm = fbm4(vec2(mphi / TAU * 3.0, 0.27 + mvTime * 0.0015));
  float strm2 = texture2D(uNoise, vec2(mphi / TAU * 8.0, 0.61)).a;
  float streamers = 0.45 + 1.1 * strm * strm + 0.5 * strm2;
  float cor = exp(-outside / (RM * (0.32 + 0.4 * strm))) * streamers + exp(-outside / (RM * 1.6)) * 0.35;
  vec3 coronaCol = mix(mvRingCol * 1.1, vec3(0.8, 0.86, 1.0), smoothstep(0.0, RM * 1.5, outside));
  col += coronaCol * cor * (1.0 - inMoon) * ringK * 0.7 * mvBoostSoft();
  col += mvRingCol * exp(-outside / 0.01) * 0.6 * ringK * mvBoostSoft() * (1.0 - inMoon);

  // the Sun wheel's halo: a wide pale ring with a faint prism edge, and soft spokes turning slowly round the disc
  float sunK = uSunVis * (1.0 - 0.75 * vS);
  float hr = (aS - 0.36) / 0.016;
  col += (vec3(1.0, 0.72, 0.55) * exp(-hr * hr) + vec3(0.55, 0.7, 1.0) * exp(-(hr - 1.4) * (hr - 1.4))) * 0.05 * sunK * smoothstep(-0.05, 0.1, el);
  {
    float sphi = atan(dot(d, uSunV), dot(d, uSunU));
    float spoke = pow(0.5 + 0.5 * cos(sphi * 12.0 + mvTime * 0.015), 6.0) + 0.5 * pow(0.5 + 0.5 * cos(sphi * 24.0 - mvTime * 0.01), 10.0);
    col += vec3(1.0, 0.88, 0.62) * spoke * exp(-max(aS - RS, 0.0) / 0.07) * 0.22 * sunK;
  }
  // the Veil's edge: a soft gauze band on the horizon over the land where the lasting dusk begins
  {
    float eV = mvVeilAt(uCam.xz + hd * 520.0);
    float eb = (eV - 0.42) / 0.2;
    float band = exp(-eb * eb) * exp(-elp * 6.0) * smoothstep(-0.03, 0.02, el);
    float lonV = atan(d.z, d.x) / TAU;
    float gauze = 0.55 + 0.45 * fbm4(vec2(lonV * 22.0 + mvTime * 0.002, elp * 2.0 + 0.4));
    col = mix(col, mix(vec3(1.0, 0.72, 0.62), vec3(0.78, 0.6, 1.0), smoothstep(0.0, 0.25, elp)) * length(hor) * 0.75, band * gauze * 0.3);
  }

  vec4 bands;
  vec4 volume = traceCloud(d,vS,hor,bands);
#ifndef SKY_PROBE
  cloudDepthBands=bands;
  cloudLight=volume;
#endif
  float alpha = volume.a;
  col = col*(1.0-alpha)+volume.rgb;
  // horizon haze: the far air thickens into the land's own fog colour
  col = mix(col, mvPalette(MV_ROW_FOG, vS) * 1.04, exp(-elp * 16.0) * 0.45 * smoothstep(-0.05, 0.01, el));
  float glare = (exp(-max(aS - RS, 0.0) * 70.0) * 0.7 + exp(-aS * 14.0) * 0.1) * uSunVis * uSunVis;
  col += glare * vec3(1.0, 0.86, 0.66) * 1.4;
  gl_FragColor = vec4(col, alpha);
}`;

const FRAG_HIGH = /* glsl */`
${COMMON}
uniform sampler2D uLow;
uniform vec2 uRes;
${CLOUD_RESOLVE_GLSL}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float stars(vec3 d, float scale, float density) {
  vec3 p = d * scale;
  vec3 ci = floor(p);
  vec3 h = hash33(ci);
  if (h.z > density) return 0.0;
  vec3 c = normalize(ci + 0.2 + 0.6 * h) * scale;
  float r = length(p - c);
  float size = 0.035 + 0.06 * h.x;
  float tw = 0.75 + 0.25 * sin(mvTime * (1.0 + 3.0 * h.y) + h.x * 40.0);
  return smoothstep(size, 0.0, r) * (0.25 + 1.6 * h.y * h.y) * tw;
}
void main() {
  vec3 d = normalize(vDir);
  vec4 low = cloudResolve(uLow, gl_FragCoord.xy / uRes);
  vec3 col = low.rgb;
  float cloud = low.a;
  float el = d.y;
  float wH;
  float vS = skyVeil(d, wH);
  float aS = angTo(d, mvSunDir);
  float aM = angTo(d, uMoonDir);

  // stars (behind clouds)
  float nightK = smoothstep(0.55, 0.95, max(vS,max(uSkyNight,uCover*.85))) * smoothstep(-0.05, 0.12, el);
  if (nightK > 0.001) {
    float hide = smoothstep(RM * 1.1, RM * 1.8, aM);
    vec3 nb = normalize(vec3(0.42, 0.38, -0.82));
    float b = dot(d, nb);
    float bandK = exp(-b * b / 0.03);
    float st = stars(d, 150.0, 0.25) + stars(d, 420.0, 0.12 + 0.4 * bandK) * (0.5 + bandK);
    col += vec3(0.9, 0.95, 1.1) * st * 1.4 * nightK * hide * (1.0 - cloud);
    // drifting motes: warm soft lights wandering slowly across the night sky
    vec3 dm = normalize(d + vec3(sin(mvTime * 0.013), 0.0, cos(mvTime * 0.011)) * 0.06);
    float mo = stars(dm, 46.0, 0.05);
    col += vec3(1.0, 0.78, 0.5) * mo * 0.55 * (0.6 + 0.4 * sin(mvTime * 0.7 + dm.x * 30.0)) * nightK * hide * (1.0 - cloud);
    // the odd falling light: a short bright streak every few seconds, somewhere high in the sky
    float per = 7.0, fid = floor(mvTime / per), ph = fract(mvTime / per) * per;
    if (ph < 0.8) {
      vec3 fh = hash33(vec3(fid, fid * 1.7 + 3.1, 5.3));
      float az = fh.x * TAU, e0 = 0.45 + 0.5 * fh.y;
      vec3 fa = vec3(cos(az) * cos(e0), sin(e0), sin(az) * cos(e0));
      vec3 ft = normalize(cross(fa, vec3(0.0, 1.0, 0.0)) * (fh.z > 0.5 ? 1.0 : -1.0) - vec3(0.0, 0.55, 0.0));
      ft = normalize(ft - fa * dot(ft, fa));
      float k = ph / 0.8;
      vec3 pr = d - fa;
      float sAl = dot(pr, ft);
      float perp = length(pr - ft * sAl - fa * dot(pr, fa));
      float s1 = 0.32 * k, s0 = max(s1 - 0.12, 0.0);
      float onSeg = step(s0, sAl) * step(sAl, s1) * (sAl - s0) / max(s1 - s0, 1e-3);
      float fl = exp(-perp * perp / 0.0000016) * onSeg * sin(3.14159 * k) * step(0.0, dot(d, fa));
      col += vec3(1.0, 0.92, 0.8) * fl * 3.0 * nightK * hide * (1.0 - cloud);
    }
  }

  float pw = max(fwidth(aS), 1e-4) * 1.2;
  float inSun = 1.0 - smoothstep(RS - pw, RS + pw, aS);
  float inMoon = 1.0 - smoothstep(RM - pw, RM + pw, aM);
  float clear = 1.0 - cloud * 0.85;
  vec2 m2 = vec2(dot(d, uMoonU), dot(d, uMoonV)) / RM;
  float mr = length(m2);

  // Sun disc
  float limb = sqrt(max(0.0, 1.0 - (aS / RS) * (aS / RS)));
  vec3 sunCol = vec3(1.0, 0.93, 0.8) * (5.0 + 4.0 * limb);
  col = mix(col, sunCol, inSun * (1.0 - inMoon) * clear);

  // Moon disc: unlit face, faint seas and craters, a breath of sky light by day
  float mN = fbm4(m2 * 0.32 + 0.21);
  float mN2 = texture2D(uNoise, m2 * 0.9 + 0.5).b;
  float seas = smoothstep(0.45, 0.62, mN);
  vec3 moonC = mix(vec3(0.055, 0.06, 0.085), vec3(0.03, 0.032, 0.05), seas) * (0.85 + 0.3 * mN2);
  moonC += vec3(0.06, 0.07, 0.12) * pow(clamp(mr, 0.0, 1.0), 6.0) * 0.6;
  float dayK = 1.0 - smoothstep(0.35, 0.85, mvCamVeil);
  moonC = mix(moonC, col * vec3(0.3, 0.33, 0.42) + moonC * 1.2, dayK);
  // the Moon wheel as a made thing: an engraved inner circle and a faint lit hem
  float eng = exp(-pow((mr - 0.8) / 0.018, 2.0)) + 0.5 * exp(-pow((mr - 0.62) / 0.012, 2.0));
  moonC += vec3(0.16, 0.18, 0.28) * eng * (0.25 + 0.5 * dayK);
  moonC += vec3(0.5, 0.56, 0.8) * smoothstep(0.9, 1.0, mr) * 0.12 * (0.4 + dayK);
  col = mix(col, moonC*.48, inMoon * clear * max(inSun,smoothstep(.77,.97,uCover)));
  // its halo: a thin pale ring hanging just outside the disc
  float mh = (aM - RM * 1.32) / (RM * 0.05);
  col += vec3(0.75, 0.82, 1.0) * exp(-mh * mh) * 0.18 * (1.0 - inMoon) * clear * (0.35 + 0.65 * dayK) * (1.0 - smoothstep(0.86, 0.995, uCover) * 0.7) * smoothstep(-0.05, 0.1, el);

  // golden ring, beads and diamond glint
  float ringK = smoothstep(0.86, 0.995, uCover);
  if ((ringK > 0.0 || uCover > 0.8) && aM < RM * 1.5) {
    float mphi = atan(m2.y, m2.x);
    float strm2 = texture2D(uNoise, vec2(mphi / TAU * 8.0, 0.61)).a;
    vec2 sunOff = vec2(dot(mvSunDir, uMoonU), dot(mvSunDir, uMoonV)) / RM;
    float offLen = length(sunOff);
    vec2 offDir = offLen > 1e-4 ? sunOff / offLen : vec2(1.0, 0.0);
    float side = mr > 1e-4 ? dot(m2 / mr, offDir) : 0.0;
    float rw = 0.0034 + 0.0022 * max(side, 0.0) * offLen * 6.0;
    float ring = exp(-pow((aM - RM + 0.0008) / rw, 2.0));
    float beads = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float bp = fi * 1.7 + 0.6 + mvTime * (0.006 + 0.003 * fi) + sin(mvTime * 0.05 + fi) * 0.2;
      float bd = length(m2 - vec2(cos(bp), sin(bp))) * RM;
      beads += exp(-bd * bd / 0.000004) * (0.6 + 0.4 * sin(mvTime * 1.3 + fi * 2.0));
    }
    col += mvRingCol * (ring * (2.2 + 1.4 * strm2) * (1.0 + (mvRingBoost - 1.0) * 0.6) + beads * 10.0 * mvRingBoost) * ringK * (1.0 - cloud * 0.6);
    float diaK = smoothstep(0.82, 0.93, uCover) * (1.0 - smoothstep(0.975, 0.997, uCover));
    if (diaK > 0.0) {
      vec2 q = (m2 - offDir) * RM;
      float gd = length(q);
      float spikes = exp(-abs(q.x) * 900.0) * exp(-abs(q.y) * 45.0) + exp(-abs(q.y) * 900.0) * exp(-abs(q.x) * 45.0);
      vec2 qr = mat2(0.7071, 0.7071, -0.7071, 0.7071) * q;
      spikes += 0.4 * (exp(-abs(qr.x) * 1100.0) * exp(-abs(qr.y) * 80.0) + exp(-abs(qr.y) * 1100.0) * exp(-abs(qr.x) * 80.0));
      col += vec3(1.0, 0.95, 0.85) * (exp(-gd * gd / 0.00003) * 60.0 + spikes * 8.0 + exp(-gd / 0.02) * 2.0) * diaK;
    }
  }
  col += uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// quality: 'low' | 'med' | 'high' | 'mobile' (phones, core/boot.js QUALITY.mobile: fewer cloud steps on a smaller layer)
export function createSkyDome(quality = 'high') {
  const lowRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, count: 3, depthBuffer: false });
  lowRT.texture.name = 'mvSkyLow';
  const uniforms = {
    ...U,
    uCam: { value: new THREE.Vector3() },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunU: { value: new THREE.Vector3() }, uSunV: { value: new THREE.Vector3() },
    uMoonU: { value: new THREE.Vector3() }, uMoonV: { value: new THREE.Vector3() },
    uCover: { value: 0 }, uSunVis: { value: 1 },
    uNoise: { value: noiseTexture() },
    ...cloudFieldUniforms,
    uVolume: { value: cloudNoise() },
    uSkyNight: {value:0}, uWeather: {value:new THREE.Vector2(0,.32)}, uCloudH: { value: CLEAR_CLOUD_BASE }, uCloudCover: { value: 0.52 },
    uFlash: U.mvFlash,
    uLow: { value: lowRT.texture },
    uRes: { value: new THREE.Vector2(1, 1) },
  };
  const opts = { uniforms, vertexShader: VERT, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false };
  const highMat = new THREE.ShaderMaterial({ name: 'mvSky', fragmentShader: FRAG_HIGH, ...opts });
  const lowMat = new THREE.ShaderMaterial({ name: 'mvSkyLow', defines: { CLOUD_STEPS: quality === 'mobile' ? 8 : quality === 'low' ? 10 : quality === 'med' ? 15 : 21 }, fragmentShader: FRAG_LOW, ...opts, toneMapped: false });
  const geo = new THREE.SphereGeometry(3000, 48, 24);
  const mk = (mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.frustumCulled = false; m.renderOrder = -1e6; m.matrixAutoUpdate = false;
    return m;
  };
  const mesh = mk(highMat, 'mvSkyDome');
  const lowMesh = mk(lowMat, 'mvSkyDomeLow');
  const lowScene = new THREE.Scene();
  lowScene.add(lowMesh);
  // Water can reflect directions behind the viewer. Integrate the same volume
  // around the water plane and retain it while the main camera turns.
  const probeWidth = quality === 'mobile' ? 96 : quality === 'low' ? 128 : quality === 'med' ? 192 : 256;
  const probe = new THREE.WebGLRenderTarget(probeWidth, probeWidth/4, { type: THREE.HalfFloatType, depthBuffer: false });
  probe.texture.wrapS=THREE.RepeatWrapping;
  const probeEye = new THREE.Vector3(), probeScene = new THREE.Scene();
  const probeMat = new THREE.ShaderMaterial({
    uniforms: {...uniforms, uCam:{value:probeEye}}, defines:{SKY_PROBE:1,CLOUD_STEPS:14},
    vertexShader:'varying vec2 probeUv; void main(){probeUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:FRAG_LOW,depthTest:false,depthWrite:false,toneMapped:false
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2),probeMat);
  quad.frustumCulled=false;probeScene.add(quad);
  let lastTime=-Infinity,lastCover=-1,lastWind=-Infinity;
  const size = new THREE.Vector2();
  return {
    mesh, uniforms, lowRT, waterEnvironment:probe.texture,
    /** Place both domes on the camera and render the half-resolution layer. */
    renderLow(renderer, camera, renderSize) {
      if (renderSize) size.copy(renderSize); else renderer.getDrawingBufferSize(size);   // internal size under dynamic resolution
      const cap = quality === 'mobile' ? 320 : quality === 'low' ? 400 : quality === 'med' ? 576 : 800;
      const scale = Math.min(.5, cap / Math.max(size.x, 1));
      const w = Math.max(1, Math.ceil(size.x * scale)), h = Math.max(1, Math.ceil(size.y * scale));
      if (lowRT.width !== w || lowRT.height !== h) lowRT.setSize(w, h);
      uniforms.uRes.value.copy(size);
      mesh.position.copy(camera.position); mesh.updateMatrix(); mesh.updateMatrixWorld();
      lowMesh.position.copy(camera.position); lowMesh.updateMatrix(); lowMesh.updateMatrixWorld();
      const prevTM = renderer.toneMapping;
      renderer.toneMapping = THREE.NoToneMapping;
      const now=uniforms.mvTime.value,cover=uniforms.uCloudCover.value,wind=uniforms.mvCloudFlow.value.x;
      if(Math.abs(now-lastTime)>.30 || Math.abs(cover-lastCover)>.025 || Math.abs(wind-lastWind)>4 ||
         Math.hypot(camera.position.x-probeEye.x,camera.position.z-probeEye.z)>6) {
        probeEye.set(camera.position.x,0,camera.position.z);
        renderer.setRenderTarget(probe);renderer.render(probeScene,camera);
        lastTime=now;lastCover=cover;lastWind=wind;
      }
      renderer.setRenderTarget(lowRT);
      renderer.render(lowScene, camera);
      renderer.setRenderTarget(null);
      renderer.toneMapping = prevTM;
    },
  };
}
