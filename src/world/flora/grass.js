// Grass carpet, crops and wild flowers around the camera, generated entirely on the GPU (no per-frame CPU work besides
// a handful of uniforms):
//  * four rings of instanced PATCHES (each instance = a cell of S×S metres filled with B individual curved blades) on
//    world-fixed grids, so nothing swims as the camera moves; one draw call per ring, with a near and a far flower spray. Near blades
//    have 3 segments, far ones one triangle; density and blade count fall with distance, and the last ring dissolves
//    (fewer, shorter blades) into the terrain's own painted grass, whose colour the blades share at the root;
//  * blade colour from the SAME noise texture and palette as the terrain shader: darker root -> lighter, warmer tip;
//    shading normals are mostly the terrain normal, so the field shades as one soft carpet; back-lit translucency toward
//    the Sun; shadows received;
//  * absent on paths, plazas, sand, river gravel, steep rock, snow, fresh burns, craters (clear()), wards; frost-whitened;
//    short and tip-glowing in the night; tall dry gold / rust grass at dusk; clover-low patches; seed heads; crops
//    (rice, wheat, vegetables) grow in the 朝颜村 plots using the terrain's own plot hash;
//  * WIND: the global breeze plus visible gusts (bands of lighter, bent grass travelling across the field along the
//    wind); blades bend away from the heroine and from blasts ('element:applied' shock rings).
import { ATLAS_HALF } from '../../data/atlas.js';
import * as THREE from 'three';
import { toonGradient, hookMaterial } from '../../core/mats.js';
import { POI } from '../../data/world.js';
import { GROUND_TINT_GLSL, GRASS_TOP, MEADOW } from '../terrain/shader.js';
import { plotGLSL } from '../terrain/paddyLayout.js';
import { flowerPatch, flowerVertex } from './meadowFlowers.js';
import { BELL } from '../../data/bellcrown.js';
import { createSlipstream } from './slipstream.js';
import { plantWake, plantWakeGLSL } from './wake-field.js';
import { meadowPattern } from './meadowPattern.js';

const lin = (hex, k = 1) => { const c = new THREE.Color().setHex(hex); return `vec3(${(c.r * k).toFixed(4)}, ${(c.g * k).toFixed(4)}, ${(c.b * k).toFixed(4)})`; };
const MAXC = 24;      // grass-free discs: transient clears (≤ MAXT) + the persistent scars nearest the camera
const MAXT = 12;
const MAXB = 6;

// patch geometry: B blades, each `segs` segments (verts: 2 per level + tip). position.x = side (-1..1), position.y = t;
// aBlade = (u, v, yaw hash, width hash) — (u,v) stratified in the unit cell; aBlade2 = (height hash, lean hash, hash, kind hash)
// look round: blades grow in soft CLUMPS (n×n jittered clump centres per cell, ~1/5 of the blades loose between them);
// aBlade3 = (outward direction from the clump centre (0 for loose blades), clump hash, loose flag). The cell is placed
// in the world with one of 8 rotations / mirrors of the unit square (clumps stay whole, no wrap across the cell edge).
function patchGeometry(B, segs, rng) {
  const pos = [], b1 = [], b2 = [], b3 = [], idx = [];
  // tapered blade: wide base, narrowing waist, sharp tip
  const levels = segs === 3 ? [[1, 0], [0.72, 0.42], [0.4, 0.76]] : segs === 2 ? [[1, 0], [0.52, 0.55]] : [[1, 0]];
  const n = Math.max(2, Math.round(Math.sqrt(B / 12)));
  const cl = [];
  for (let k = 0; k < n * n; k++) cl.push([((k % n) + 0.2 + 0.6 * rng()) / n, (Math.floor(k / n) + 0.2 + 0.6 * rng()) / n, rng()]);
  const spread = 0.34 / n;
  for (let b = 0; b < B; b++) {
    let u, v, d3;
    if (rng() < 0.2) { u = rng(); v = rng(); d3 = [0, 0, rng(), 1]; }
    else {
      const c = cl[Math.floor(rng() * cl.length)];
      const r = Math.sqrt(rng()), a = rng() * Math.PI * 2;
      u = Math.min(0.999, Math.max(0.001, c[0] + Math.cos(a) * r * spread));
      v = Math.min(0.999, Math.max(0.001, c[1] + Math.sin(a) * r * spread));
      d3 = [Math.cos(a) * r, Math.sin(a) * r, c[2], 0];
    }
    const a = [u, v, rng(), rng()], c = [rng(), rng(), rng(), rng()];
    const v0 = pos.length / 3;
    for (const [w, t] of levels) for (const s of [-1, 1]) { pos.push(s * w, t, 0); b1.push(...a); b2.push(...c); b3.push(...d3); }
    pos.push(0, 1, 0); b1.push(...a); b2.push(...c); b3.push(...d3);
    for (let l = 0; l < levels.length - 1; l++) {
      const i0 = v0 + l * 2;
      idx.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2);
    }
    const last = v0 + (levels.length - 1) * 2;
    idx.push(last, last + 1, last + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(b1, 4));
  g.setAttribute('aBlade2', new THREE.Float32BufferAttribute(b2, 4));
  g.setAttribute('aBlade3', new THREE.Float32BufferAttribute(b3, 4));
  g.setIndex(idx);
  g.userData.blades = B;
  return g;
}
const GROUND_U = /* glsl */`
uniform sampler2D gData;
uniform sampler2D gNoise;
uniform sampler2D gScorch;
uniform vec4 gVeil;
uniform vec4 gMount;
uniform vec4 gSettle[8];
uniform vec4 gFarm;
uniform vec4 gHill;
uniform vec4 gCraters[${MAXC}];
`;
const GROUND_F = GROUND_TINT_GLSL + plotGLSL + meadowPattern + /* glsl */`
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float trHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec4 gTex(sampler2D t, vec2 p) { return textureLod(t, (p + ${ATLAS_HALF.toFixed(1)}) / ${(ATLAS_HALF*2).toFixed(1)}, 0.0); }
vec4 gN(vec2 uv) { return textureLod(gNoise, uv, 0.0); }

// everything the ground decides at a root: colour, where grass grows, land weights, crops
struct GG { vec3 col; float amt; float h; float hgt; vec3 land; float hill; float crop; float cropK; vec3 tn; vec4 sc; vec4 n; float litter; };
GG gGround(vec2 root, bool flower) {
  GG o;
  vec4 D = gTex(gData, root);
  float h = D.r, road = D.g, river = D.b;
  float hx = gTex(gData, root + vec2(2.0, 0.0)).r - h;
  float hz = gTex(gData, root + vec2(0.0, 2.0)).r - h;
  vec3 tn = normalize(vec3(-hx, 2.0, -hz));
  float slope = 1.0 - tn.y;
  float n0 = gN(root / 1300.0).r;
  float n1 = gN(root / 270.0 + 0.31).g;
  float n2 = gN(root / 57.0 + 0.77).b;
  float n3 = gN(root / 9.1).r;
  float n4 = gN(root / 23.0 + 0.45).g;
  float tv = 1.0 - smoothstep(gVeil.z, gVeil.w, distance(root, gVeil.xy));
  tv = clamp(tv + (n1 - 0.5) * 0.09, 0.0, 1.0);
  float wSun = 1.0 - smoothstep(0.05, 0.34, tv);
  float wNight = smoothstep(0.56, 0.86, tv);
  float wDusk = max(0.0, 1.0 - wSun - wNight);
  // ground colour, exactly as the terrain paints it
  vec3 gSun = mix(${MEADOW.sunDark}, ${MEADOW.sun}, smoothstep(0.36, 0.64, n1));
  gSun = mix(gSun, ${MEADOW.sunLight}, smoothstep(0.58, 0.8, n2) * 0.55);
  gSun = mix(gSun, ${MEADOW.sunDeep}, smoothstep(0.55, 0.78, n0) * 0.45);
  gSun = mix(gSun, ${MEADOW.sunTeal}, smoothstep(0.55, 0.72, n4) * 0.35);
  gSun = mix(gSun, ${MEADOW.sunLight}, smoothstep(0.62, 0.75, n4 * 0.5 + n2 * 0.5) * 0.25);
  vec3 gDusk = mix(${lin(0xa29a5c)}, ${lin(0xc8bb6a)}, smoothstep(0.36, 0.64, n1));
  gDusk = mix(gDusk, ${lin(0xa86a46)}, smoothstep(0.64, 0.8, n2) * 0.45);
  gDusk = mix(gDusk, ${lin(0x7c6a72)}, smoothstep(0.58, 0.8, n0) * 0.35);
  vec3 gNight = mix(${lin(0x222b38)}, ${lin(0x2e3d4a)}, smoothstep(0.36, 0.64, n1));
  gNight = mix(gNight, ${lin(0x274a4a)}, smoothstep(0.56, 0.78, n2) * 0.7);
  vec3 col = gSun * wSun + gDusk * wDusk + gNight * wNight;
  float hillW = exp(-dot(root - gHill.xy, root - gHill.xy) / (gHill.z * gHill.z));
  col = mix(col, ${MEADOW.hill}, hillW * 0.5 * smoothstep(0.35, 0.6, n2 + 0.2));
  col *= 0.9 + 0.12 * n3 + 0.08 * n4;
  // the terrain's large-scale tint (dry / lush, hollows, knolls, alpine): same inputs, so blades match the soil
  float curv = (gTex(gData, root + vec2(8.0, 0.0)).r + gTex(gData, root - vec2(8.0, 0.0)).r
    + gTex(gData, root + vec2(0.0, 8.0)).r + gTex(gData, root - vec2(0.0, 8.0)).r) * 0.25 - h;
  {
    vec2 md0 = (root - gMount.xy) / gMount.zw;
    col = trGroundTint(col, h, curv, n0, n1, n2, n3, vec3(wSun, wDusk, wNight), exp(-dot(md0, md0)));
  }
  // where grass grows (mirrors the terrain masks)
  float amt = 1.0;
  float inSet = 0.0, plaza = 0.0, setKind = 0.0, setD = 1e5, setR = 1.0;
  for (int i = 0; i < 8; i++) {
    vec4 s = gSettle[i];
    float d = distance(root, s.xy);
    inSet = max(inSet, 1.0 - smoothstep(s.z * 0.8, s.z, d));
    float pr = fract(s.w) * s.z;
    float pw = 1.0 - smoothstep(pr - 1.0, pr + 2.5, d + (n3 - 0.5) * 2.0);
    if (pw > plaza) { plaza = pw; setKind = floor(s.w); setD = d; setR = pr; }
  }
  float plazaRim = 1.0 - smoothstep(setR, setR + 7.0, setD);
  float grassIsl = (setKind == 3.0 || setKind == 4.0) ? smoothstep(0.62, 0.8, n4 + (n3 - 0.5) * 0.4) * smoothstep(0.45, 1.0, setD / setR) : 0.0;
  amt *= (1.0 - plaza * (1.0 - grassIsl * 0.8)) * (1.0 - inSet * 0.08);
  float bank = 1.0 - smoothstep(8.0, 11.5 + n2 * 3.0, river);
  float damp = (1.0 - smoothstep(10.0, 24.0, river)) * (1.0 - bank);
  col = mix(col, col * vec3(0.8, 0.9, 0.84), damp * 0.7);
  amt *= 1.0 - smoothstep(0.35, 1.0, bank);
  float awayRiver = smoothstep(30.0, 60.0, river);
  float sandL = 0.9 + n2 * 1.8;
  amt *= 1.0 - (1.0 - smoothstep(sandL + 0.3, sandL + 1.5, h)) * awayRiver;
  amt *= smoothstep(0.25, 0.5, h);
  amt *= 1.0 - smoothstep(0.17, 0.27, slope + (n2 - 0.5) * 0.12);
  vec2 md = (root - gMount.xy) / gMount.zw;
  float mm = exp(-dot(md, md));
  float snowL = 104.0 + (n1 - 0.5) * 36.0;
  amt *= 1.0 - smoothstep(snowL - 14.0, snowL, h) * smoothstep(0.12, 0.3, mm);
  float pathW = 1.3 + 0.7 * inSet;
  float path = 1.0 - smoothstep(pathW - 0.1, pathW + 1.1, road + (n3 - 0.5) * 0.9);
  float worn = 1.0 - smoothstep(pathW + 0.6, pathW + 3.2, road + (n2 - 0.5) * 1.4);
  amt *= (1.0 - path) * (1.0 - worn * 0.5);
  float edgeH = smoothstep(pathW + 0.3, pathW + 4.5, road) * (1.0 - plazaRim * 0.5);
  // dusk woods: leaf litter patches stay mostly bare
  float litter = smoothstep(0.56, 0.7, n2 + (n4 - 0.5) * 0.5) * wDusk;
  amt *= 1.0 - litter * .40;
  // craters / blasts (CPU keeps the list) and the scorch layer
  for (int i = 0; i < ${MAXC}; i++) {
    vec4 c = gCraters[i];
    if (c.z <= 0.0) continue;
    float d = distance(root, c.xy);
    amt *= 1.0 - c.w * (1.0 - smoothstep(c.z * 0.75, c.z * 1.08, d));
  }
  vec4 sc = gTex(gScorch, root);
  float woodFloor=smoothstep(.24,.85,sc.a);
  amt *= 1.-woodFloor*(flower ? .80 : .65);
  col *= mix(vec3(1.),vec3(.75,.81,.72),woodFloor);
  // burnt ground: no blades until the burn has faded to 0.58 (~2.5 min), then they grow back (shortest at the heart of
  // the burn, from its edges inward) until it is gone (~6 min; textures.js FADE.burn = 360 s)
  amt *= 1.0 - smoothstep(0.0, 0.58, sc.r);
  col *= mix(vec3(1.0), vec3(0.62, 0.68, 0.78), sc.g);
  // farm plots (same plot hash as the terrain)
  float crop = 0.0, cropK = 0.0;
  float farm = paddyFarm(root,h,slope,road,river,gFarm,gSettle[0].xy);
  float hgt = 0.5;
  if (!flower) {
    if (farm > 0.5) {
      vec2 q = paddyGrid(root);
      vec2 cs = vec2(26.0, 17.0);
      vec2 cell2 = floor(q / cs); vec2 f = fract(q / cs);
      float r = paddySeed(cell2);
      vec2 e = min(f, 1.0 - f) * cs;
      float dike = 1.0 - smoothstep(0.45, 0.85, min(e.x, e.y));
      // round 3: tight planting rows (0.7 m) of thin crops: rice (droop), wheat (stalk + ear), vegetables (low leaves)
      float rows = 0.5 + 0.5 * sin(q.x * 9.0 + r * 6.0);
      if (r < 0.32) { crop = 1.0; col = mix(${lin(0x78c450)}, ${lin(0x9fdc5e)}, rows * 0.6 + n2 * 0.4); hgt = 0.62; amt = 0.0; }
      else if (r < 0.55) { amt = 0.0; }
      else if (r < 0.8) { crop = 2.0; col = mix(${lin(0xc9a440)}, ${lin(0xe2c35e)}, n3 * 0.6 + n2 * 0.4); hgt = 0.74; amt = 0.0; }
      else { crop = 3.0; col = mix(${lin(0x447e32)}, ${lin(0x5c9e3e)}, n2); hgt = 0.34; amt = step(0.45, rows); }
      amt *= 1.0 - dike * 0.7;
      cropK = 1.0;
    } else amt *= 1.0 - farm * 2.0;
  } else amt *= 1.0 - farm;
  // Keep a short footpath shoulder; in the meadow the longer leaves grow in
  // ribbons separated by low turf. Banks have taller sedges and the dry woods
  // have loose, widely spaced tussocks.
  float ribbon = meadowRibbon(root, gN(root/128.0+.31).g, gN(root/20.0+.42).b);
  float tall = smoothstep(.12, .85, (1.0-ribbon)*.80 + n2*.27);
  float wet = 1.0-smoothstep(18.0,33.0,river);
  if (cropK < .5) {
    float reach = mix(.48,1.23,tall) + .18*wet + .09*wDusk;
    float lane = mix(.20,1.0,edgeH) * (1.0 - .12 * inSet);
    hgt = reach * lane * (1.0 - .30*wNight) * (1.0-.22*hillW);
    amt *= 1.0-smoothstep(.12,.40,farm);
  }
  vec2 cityEdge=abs(root-vec2(${(BELL.boxX ?? BELL.x).toFixed(2)},${(BELL.boxZ ?? BELL.z).toFixed(2)}))-vec2(${BELL.halfW.toFixed(2)},${BELL.halfD.toFixed(2)});
  amt*=smoothstep(-.2,1.2,max(cityEdge.x,cityEdge.y));
  vec2 homeEdge=abs(root-vec2(2220.,48.))-vec2(9.,9.);
  vec2 cabinEdge=abs(root-vec2(2055.,-35.))-vec2(9.,9.);
  amt*=smoothstep(0.,1.,max(homeEdge.x,homeEdge.y))*smoothstep(0.,1.,max(cabinEdge.x,cabinEdge.y));
  o.col = col; o.amt = amt; o.h = h; o.hgt = hgt; o.land = vec3(wSun, wDusk, wNight); o.hill = hillW;
  o.crop = crop; o.cropK = cropK; o.tn = tn; o.sc = sc; o.n = vec4(n1, n2, n3, n4); o.litter = litter;
  return o;
}
`;
const BLADE_U = /* glsl */`

uniform float gTime;
uniform vec3 gWind;
uniform vec4 gPush;
uniform vec2 gCenter;
uniform vec3 gCam;
uniform vec4 gRing;     // spacing, total cells, rIn, rOut
uniform vec4 gRing2;    // width k, fade-in metres, fade-out metres, last ring (1)
uniform float gOffset;
uniform sampler2D gCells;
uniform float gHeightK;
uniform vec4 gBlast[${MAXB}];
${plantWakeGLSL}
uniform float gAerial;
uniform vec4 gPushT[4];   // her recent footsteps (x, z, strength): the carpet springs back behind her
attribute vec4 aBlade;
attribute vec4 aBlade2;
attribute vec4 aBlade3;
varying vec3 vGCol;
varying vec3 vGGlow;
varying vec3 vGTrans;
uniform sampler2D gF0;
uniform sampler2D gF1;
uniform sampler2D gF2;
uniform vec3 gField;    // field origin xz, size metres
`;
const BEND = /* glsl */`
// bend vector at a root: breeze + travelling gusts + heroine + blast rings. w.x = gust strength (for colour)
float gSheen;   // broad soft wind wave (0..1), shared with the terrain's grass paint (terrain trGust)
vec2 gBend(vec2 root, float hA, out float gustK, out float flatK, vec3 wake) {
  vec2 wd = gWind.xz; float ws = length(wd);
  vec2 wdir = ws > 1e-3 ? wd / ws : vec2(1.0, 0.0);
  float wsK = clamp(ws / 6.0, 0.15, 1.6);
  // gust bands: a large noise field scrolled along the wind, sharpened into travelling bands
  vec2 gp = root * 0.014 - wdir * gTime * (0.05 + 0.03 * wsK);
  float g = gN(gp).g * 0.7 + gN(gp * 2.3 + 0.37).b * 0.3;
  gustK = smoothstep(0.5, 0.72, g) * wsK;
  gSheen = smoothstep(0.38, 0.74, g) * min(1.0, wsK * 1.4);
  float ph = gTime * (1.4 + 0.8 * wsK) + dot(root, wdir) * 0.35 + hA * 6.28;
  vec2 bend = wdir * (0.12 + 0.1 * sin(ph)) * wsK + wdir * gustK * 0.75 + vec2(sin(ph * 1.3), cos(ph * 0.9)) * 0.05;
  // heroine
  vec2 dp = root - gPush.xy;
  float dl = length(dp);
  float push = gPush.w*(1.0 - smoothstep(gPush.z * 0.25, gPush.z, dl));
  bend += dp / max(dl, 0.01) * push * 1.3;
  flatK = push * push * 0.45;   // a visible parting: blades around her lie down and lean out
  // her trail: blades she just walked through are still bent and rise again over ~1.5 s
  for (int i = 0; i < 4; i++) {
    vec4 tp = gPushT[i];
    if (tp.z <= 0.0) continue;
    vec2 tq = root - tp.xy; float td = length(tq);
    float tk = (1.0 - smoothstep(0.3, 1.5, td)) * tp.z;
    bend += tq / max(td, 0.01) * tk * 1.1;
    flatK = max(flatK, tk * 0.5);
  }
  // the broom's wake: a channel combed outward and laid over, rising again over 20-40 s
  bend+=wake.xy*1.55;
  flatK=max(flatK,wake.z*.94);
  // blasts: an outward shock ring, then a lingering flattened disc
  for (int i = 0; i < ${MAXB}; i++) {
    vec4 b = gBlast[i];
    if (b.w <= 0.0) continue;
    float age = gTime - b.z;
    if (age < 0.0 || age > 3.0) continue;
    vec2 bp = root - b.xy; float bd = length(bp);
    float front = age * 16.0;
    float ring = exp(-pow((bd - front) / 2.5, 2.0)) * b.w * (1.0 - age / 3.0);
    float disc = (1.0 - smoothstep(b.w * 3.0, b.w * 6.0, bd)) * exp(-age * 1.2) * 0.8;
    bend += bp / max(bd, 0.01) * (ring * 1.6 + disc);
    flatK = max(flatK, disc * 0.6);
  }
  return bend;
}
`;
const COMMON = GROUND_U + BLADE_U + GROUND_F + BEND;

// the grass FIELD: everything the ground decides (colour, where / how tall grass grows, crops, land, normal, frost),
// rendered once per frame into a camera-centred clipmap so a blade vertex reads it with three fetches
const FIELD_VERT = /* glsl */`
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const FIELD_FRAG = /* glsl */`
precision highp float;
precision highp int;
` + GROUND_U + `
uniform vec3 gField;
uniform float gFieldN;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
` + GROUND_F + `
void main() {
  vec2 root = gField.xy + gl_FragCoord.xy / gFieldN * gField.z;
  GG g = gGround(root, false);
  float wN = g.land.z, wD = g.land.y;
  o0 = vec4(g.col, clamp(g.amt, 0.0, 1.0));
  o1 = vec4(g.hgt, g.crop, wD, wN);
  o2 = vec4(g.tn.x, g.tn.z, g.sc.b, g.n.x);
}
`;

const GRASS_VERTEX = /* glsl */`
vec3 gPos; vec3 gNrm; float gKill = 0.0;
{
  float S = gRing.x;
  float fi = mod(float(gl_InstanceID) + gOffset, gRing.y);
  vec2 gi = texelFetch(gCells, ivec2(int(mod(fi, 256.0)), int(fi / 256.0)), 0).rg;
  vec2 cell = floor(gCenter / S) * S + gi * S;
  vec2 hc = vec2(gHash(cell * 0.731 + 3.1), gHash(cell * 1.37 - 8.2));
  float hC = gHash(cell * 0.53 + 41.7);
  
  // one of 8 rotations / mirrors of the unit cell (clumps stay whole)
  vec2 uv0 = aBlade.xy, dir0 = aBlade3.xy;
  if (hc.y > 0.5) { uv0.x = 1.0 - uv0.x; dir0.x = -dir0.x; }
  if (hc.x > 0.5) { uv0 = 1.0 - uv0; dir0 = -dir0; }
  if (fract(hc.x * 2.0) > 0.5) { uv0 = vec2(uv0.y, 1.0 - uv0.x); dir0 = vec2(dir0.y, -dir0.x); }
  vec2 root = cell + uv0 * S;
  float hA = fract(aBlade2.z + hC * 7.31);
  float hD = fract(aBlade2.w + hc.x * 3.17 + hc.y * 5.3);
  float dist = distance(root, gCam.xz);
  // ring cross-fade by DENSITY, each blade GROWING in / SHRINKING out over its own short window (no popping, no
  // dither); the last ring also shortens as a whole
  float fin = gRing.z > 0.5 ? smoothstep(gRing.z, gRing.z + gRing2.y, dist) : 1.0;
  float fout = 1.0 - smoothstep(gRing.w - gRing2.z, gRing.w, dist);
  float keep = smoothstep(hD, hD + 0.25, fin * 1.25) * smoothstep(hD, hD + 0.25, (fout + gRing2.w * 0.35 * fout) * 1.25);
  float far = smoothstep(5.0, 42.0, dist);
  
  GG g;
  g.amt = 0.0; g.col = vec3(0.0); g.hgt = 0.0; g.crop = 0.0; g.cropK = 0.0; g.land = vec3(1.0, 0.0, 0.0); g.tn = vec3(0.0, 1.0, 0.0);
  g.sc = vec4(0.0); g.n = vec4(0.5); g.hill = 0.0; g.litter = 0.0; g.h = 0.0;
  vec2 fuv = (root - gField.xy) / gField.z;
  if (keep > 0.01 && all(greaterThan(fuv, vec2(0.002))) && all(lessThan(fuv, vec2(0.998)))) {
    vec4 F0 = textureLod(gF0, fuv, 0.0), F1 = textureLod(gF1, fuv, 0.0), F2 = textureLod(gF2, fuv, 0.0);
    g.col = F0.rgb; g.amt = F0.a; g.hgt = F1.r; g.crop = F1.g; g.cropK = step(0.5, F1.g);
    g.land = vec3(max(0.0, 1.0 - F1.b - F1.a), F1.b, F1.a);
    g.tn = vec3(F2.x, sqrt(max(0.0, 1.0 - F2.x * F2.x - F2.y * F2.y)), F2.y);
    g.sc.b = F2.z; g.n.x = F2.w;
    g.h = gTex(gData, root).r;
  }
  vec3 col = g.col;
  float wSun = g.land.x, wDusk = g.land.y, wNight = g.land.z;
  float shrink = gRing2.w > 0.5 ? mix(0.35, 1.0, fout) : 1.0;
  float amt = g.amt * keep * gAerial;
  float hgt = g.hgt;
  
  // per blade: height variety, seed heads (taller, pale tips), low clover-like blades in some patches
  // look round: per-clump height (centre blades taller), soft field-scale height noise, rare tall seeding stems
  float cH = fract(aBlade3.z + hC * 3.7);
  float cR = length(dir0);
  float clumpN = gN(root / 1.9 + 0.13).r;
  // seeding stems grow in a few clumps, in broad patches of the meadow (not sprinkled evenly)
  float seed = step(0.82, aBlade2.x) * step(0.66, cH) * smoothstep(0.38, 0.62, g.n.x) * (1.0 - g.cropK) * (1.0 - wNight);
  float bh = g.cropK > 0.5 ? 0.9 + 0.16 * aBlade2.x
    : (0.6 + 0.42 * aBlade2.x * aBlade2.x) * (0.78 + 0.44 * cH) * (1.12 - 0.3 * cR) * (0.82 + 0.36 * clumpN) + seed * 0.55;
  // Loose basal leaves grow below the seed grasses. Their blades widen in the
  // middle and travel out from the root, giving the understory a second layer.
  float basal = step(.72, aBlade2.z) * aBlade3.w * (1.0-g.cropK);
  hgt *= bh * mix(1.0,.55,basal);
  
  float len = hgt * gHeightK * amt * shrink * smoothstep(0.2, 0.8, dist);
  // Keep the third-person lens clear even on an uphill riverbank; the tall
  // tussocks farther along the sightline keep their world-space height.
  float eyeLevel = smoothstep(-.05, .76, gCam.y-g.h-len);
  len *= mix(mix(.10,1.0,smoothstep(.55,2.8,dist)),1.0,eyeLevel);
  if (len < 0.025) gKill = 1.0;
  float gustK, flatK;
  vec4 memory=plantWakeAt(root);
  vec2 bend = gBend(root, hA, gustK, flatK, memory.xyz);
  float t = position.y;
  float yaw = aBlade.z * 6.2832 + hC * 6.2832;
  vec2 sideV = vec2(cos(yaw), sin(yaw));
  vec2 fwdV = vec2(-sideV.y, sideV.x);
  
  // clumps open like a fountain: each blade leans (and faces) away from its clump centre
  fwdV = normalize(dir0 * 1.6 + fwdV * (0.45 + 0.55 * aBlade3.w) + vec2(1e-4, 0.0));
  sideV = vec2(fwdV.y, -fwdV.x);
  
  // curved blade: natural lean along its facing + wind, quadratic in t; the tip drops as the blade bends
  float lean = (g.cropK > 0.5 ? (0.15 + 0.45 * aBlade2.y) * (g.crop < 1.5 ? 1.1 : g.crop < 2.5 ? 0.22 : 0.9) : (0.12 + 0.38 * aBlade2.y + 0.42 * cR) * (1.0 - seed * 0.6)) * (1.0 + wDusk * 0.3);
  // fine blades: 2-4 cm at the base near the camera (far rings widen to stay about a pixel wide)
  float w = (0.016 + 0.015 * aBlade.w) * gRing2.x * (1.0 - wDusk * 0.1) * (seed > 0.5 ? (t > 0.6 ? 1.3 : 0.5) : 1.0);
  w *= mix(1.0,.56 + 3.0 * smoothstep(.02,.40,t),basal);
  lean += .73*basal;
  vec3 pp = vec3(root.x, g.h - 0.06, root.y);
  if (g.cropK > 0.5) {
    // crops: half-widths in metres along the blade (no blade wider than a hand); wheat: thin stalk + a plump ear on top
    float sx = sign(position.x), wk = gRing2.x;
    float hw = g.crop < 1.5 ? 0.011 * (1.0 - t * 0.7)
             : g.crop < 2.5 ? mix(0.006, 0.019, smoothstep(0.45, 0.75, t)) * (t > 0.99 ? 0.0 : 1.0)
             : 0.03 * (1.0 - t * 0.6);
    pp.xz += sideV * sx * hw * wk * min(1.0, abs(position.x) * 8.0);
  } else pp.xz += sideV * position.x * w;
  vec2 dsp = (fwdV * lean + bend) * len * t * t;
  float dl = length(dsp) / max(len, 0.01);
  pp.xz += dsp;
  pp.y += t * len * (1.0 - min(0.6, dl * dl * 0.45)) * (1.0 - flatK);
  
  gPos = gKill > 0.5 ? vec3(0.0, -1.0e4, 0.0) : pp;
  // shading normal: the ground's, rounded over each clump (a soft dome rising toward the tips), tilted with the bend;
  // no per-blade facing term (that was the sparkle of facets)
  
  vec2 dome = (dir0 + fwdV * 0.2 * aBlade3.w) * 0.6 * t * (1.0 - far);
  gNrm = normalize(g.tn + vec3(dome.x, 0.0, dome.y) + vec3(bend.x, 0.0, bend.y) * 0.12 * t);
  
  // colours: dark roots (the carpet's depth), lighter warmer tips, dusk golds / rusts, frost, night glow
  // look round: dark COOL roots -> light WARM tips; each clump a little warmer or cooler; far away the gradient
  // converges on the colour the terrain paints under and beyond the blades (GRASS_TOP), so the hand-over has no line
  float clump = clumpN * 0.55 + cH * 0.45;
  // revision: fresher tips (green-white, not yellow), lighter cool roots: the olive came from yellow tips over near-black roots
  vec3 tip = col * mix(vec3(1.04, 1.11, 1.03), vec3(1.31, 1.34, 1.18), clump);
  tip *= mix(vec3(1.0),vec3(.74,1.05,.89),basal);
  tip *= mix(vec3(1.04, 1.0, 0.92), vec3(0.95, 1.0, 1.06), fract(cH * 5.3));
  // Up close the sunlit tips borrow the local turf's tone. Fade in 3D so a
  // meadow seen from a high broom keeps the same colour as its distant terrain.
  float cameraDy = gCam.y - g.h;
  float nearGrass = (1.0 - smoothstep(25.0, 484.0, dist * dist + cameraDy * cameraDy)) * wSun * (1.0 - g.cropK);
  vec3 turfTone = mix(col, vec3(dot(col, vec3(.2126, .7152, .0722))), .28);
  tip = mix(tip, turfTone, .64 * nearGrass);
  float dryPick = fract(hA * 13.7);
  vec3 duskTip = dryPick < 0.45 ? ${lin(0xe0b450)} : dryPick < 0.75 ? ${lin(0xd0784a)} : ${lin(0xe8d08a)};
  tip = mix(tip, duskTip, wDusk * 0.85 * (1.0 - g.cropK));
  if (g.crop > 1.5 && g.crop < 2.5) tip = ${lin(0xf0d070)};
  vec3 root0 = mix(col * mix(vec3(0.44, 0.57, 0.63), vec3(0.64, 0.72, 0.84), wSun), col * vec3(0.66, 0.54, 0.44), wDusk);
  if (g.crop > 1.5 && g.crop < 2.5) root0 = ${lin(0x8a9a48)}; // wheat: green-gold stalk under a gold ear
  float tt = t * t;
  vGCol = mix(root0, tip, (g.crop > 1.5 && g.crop < 2.5) ? smoothstep(0.5, 0.72, t) : smoothstep(0.0, 1.0, t)) * (0.94 + 0.12 * aBlade.w);
  vGCol = mix(vGCol, mix(${lin(0xcdbb84)}, ${lin(0xb98a5a)}, wDusk), seed * smoothstep(0.55, 0.8, t) * 0.85);   // seed heads
  // the wind's sheen: broad soft waves of lighter, silvered tips travelling across the field
  vGCol = mix(vGCol, vGCol * 1.2 + vec3(0.022, 0.026, 0.016), gSheen * t * 0.7 * (1.0 - .65 * nearGrass));
  // far: the blade becomes a soft stroke of the ground colour, a little lighter toward its tip (never darker than the soil)
  vGCol = mix(vGCol, col * ${GRASS_TOP} * mix(0.98, 1.12, t) * (1.0 + 0.12 * gSheen), far * 0.9 * (1.0 - g.cropK));
  // A laid-over swath shows the deeper green under the tips (darker and greener the
  // harder the pass), and like a mown stripe it reads lighter where the blades lie away
  // from the viewer and darker where they lie toward it.
  vec2 laidDir = memory.xy / max(length(memory.xy), .05);
  float awayK = dot(laidDir, normalize(root - gCam.xz + vec2(1e-3)));
  vec3 laidCol = vGCol * vec3(.66,.84,.62) * (1.0 + .13 * awayK) * (.92 + .16 * t);
  vGCol = mix(vGCol, laidCol, smoothstep(.04, .7, memory.z));
  vGCol = mix(vGCol, ${lin(0xe8f4ff)}, smoothstep(0.0, 0.6, g.sc.b) * 0.8);
  float pulse = 0.65 + 0.35 * sin(gTime * 0.9 + root.x * 0.05 + root.y * 0.04);
  vec3 veinC = mix(${lin(0x3de0c0)}, ${lin(0x9c7cff)}, smoothstep(0.3, 0.7, g.n.x));
  vGGlow = veinC * wNight * tt * (0.06 + 1.1 * step(0.93, aBlade2.z * 0.5 + hA * 0.5)) * pulse * (1.0 - g.cropK);
  vGTrans = tip * (0.35 + 0.65 * t) * t * (wSun + wDusk * 0.8) * (1.0 - g.cropK * 0.5) * (1.0 - far * 0.7) * (1.0 - .32 * nearGrass);
  
}
`;

function makeMaterial(U, flower) {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient(), side: THREE.DoubleSide });
  m.name = flower ? 'flora-flowers' : 'flora-grass';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace('#include <beginnormal_vertex>', (flower ? flowerVertex : GRASS_VERTEX) + '\nvec3 objectNormal = gNrm;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGCol;\nvarying vec3 vGGlow;\nvarying vec3 vGTrans;\nuniform vec3 gSunView;\nuniform vec3 gSunCol;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vGCol;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vGGlow;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{ // back-lit translucency (only where the Sun reaches: mvLitK holds cast + cloud + contact shadow from the hook),
  // and a deeper shade in cast shadow so her shadow reads clearly on the carpet
  vec3 gV = normalize(vViewPosition);
  float gB = clamp(dot(-gV, gSunView), 0.0, 1.0);
  reflectedLight.directDiffuse += vGTrans * gSunCol * (gB * gB * gB * 0.22 + 0.01) * mvLitK;
  reflectedLight.indirectDiffuse *= mix(1.0, mix(0.85, 1.0, mvLitK), clamp(mvDay * 3.0, 0.0, 1.0)); // light r3: 0.62 -> 0.85 (the hook already darkens the shade)
}`);
  };
  m.customProgramCacheKey = () => (flower ? 'mvFlowers4' : 'mvGrass5');
  return hookMaterial(m);
}

/** Create the grass field. Returns null when the terrain (its textures) is absent. */
export function createGrass(G) {
  const TR = G.terrain;
  if (!TR?.dataTexture || !TR.uniforms) return null;
  const TU = TR.uniforms;
  const q = G.quality || { density: 1, name: 'high' };
  const qn = q.name || 'high';
  const dens = Math.max(0.3, q.density ?? 1);
  const wake = createSlipstream(G);
  plantWake.gMeadowMemory.value = wake.field.texture;
  plantWake.gMeadowBounds.value = wake.field.bounds;
  const shared = {
    ...plantWake, gAerial: { value: 1 },
    gData: { value: TR.dataTexture }, gNoise: { value: TR.noiseTexture }, gScorch: TU.trScorch || { value: TR.scorchLayer?.tex },
    gTime: { value: 0 }, gWind: { value: new THREE.Vector3(2, 0, 0) }, gPush: { value: new THREE.Vector4(0, 0, 1.6, 0) },
    gCenter: { value: new THREE.Vector2() }, gCam: { value: new THREE.Vector3() }, gHeightK: { value: 1 },
    gVeil: TU.trVeil, gMount: TU.trMount, gSettle: TU.trSettle, gFarm: TU.trFarm, gHill: TU.trHill,
    gCraters: { value: Array.from({ length: MAXC }, () => new THREE.Vector4(0, 0, 0, 0)) },
    gBlast: { value: Array.from({ length: MAXB }, () => new THREE.Vector4(0, 0, 0, 0)) },
    gPushT: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    gSunView: { value: new THREE.Vector3(0, 1, 0) }, gSunCol: { value: new THREE.Color(1, 1, 1) },
  };
  // ---- the grass field clipmap (see FIELD_FRAG)
  const FN = qn === 'low' ? 256 : 512, FS = 448;     // texels, metres
  const fieldRT = new THREE.WebGLRenderTarget(FN, FN, { count: 3, type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false });
  for (const t of fieldRT.textures) { t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace; }
  const fieldU = {
    gData: shared.gData, gNoise: shared.gNoise, gScorch: shared.gScorch, gVeil: shared.gVeil, gMount: shared.gMount,
    gSettle: shared.gSettle, gFarm: shared.gFarm, gHill: shared.gHill, gCraters: shared.gCraters,
    gField: { value: new THREE.Vector3(0, 0, FS) }, gFieldN: { value: FN },
  };
  const fieldMat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: FIELD_VERT, fragmentShader: FIELD_FRAG, uniforms: fieldU, depthTest: false, depthWrite: false });
  const fieldGeo = new THREE.BufferGeometry();
  fieldGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const fieldMesh = new THREE.Mesh(fieldGeo, fieldMat); fieldMesh.frustumCulled = false;
  const fieldScene = new THREE.Scene(); fieldScene.add(fieldMesh);
  const fieldCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  shared.gF0 = { value: fieldRT.textures[0] }; shared.gF1 = { value: fieldRT.textures[1] }; shared.gF2 = { value: fieldRT.textures[2] };
  shared.gField = fieldU.gField;
  let fieldX=Infinity, fieldZ=Infinity, fieldAge=Infinity;
  const renderField = (cx, cz, dt) => {
    fieldAge+=dt;
    // World-aligned samples stay valid under a moving camera. The guard band
    // extends beyond the last flowers; a periodic refresh picks up scorched ground.
    if(Math.abs(cx-fieldX)<4 && Math.abs(cz-fieldZ)<4 && fieldAge<.16)return;
    fieldX=cx;fieldZ=cz;fieldAge=0;
    const texel = FS / FN;
    fieldU.gField.value.set(Math.floor((cx - FS / 2) / texel) * texel, Math.floor((cz - FS / 2) / texel) * texel, FS);
    const r = G.renderer, prev = r.getRenderTarget(), ac = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(fieldRT); r.render(fieldScene, fieldCam);
    r.setRenderTarget(prev); r.autoClear = ac;
  };
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // S = cell metres, B = blades per cell, segs = segments per blade, wk = blade width factor
  const RINGS = {
    // look round: many fine blades near (paid for by thinner far rings: the ground paints the far field)
    high: [
      { S: 0.8, rIn: 0, rOut: 4.5, B: 104, segs: 3, wk: 1.0, fi: 0, fo: 1 },
      { S: 0.8, rIn: 3.5, rOut: 13, B: 80, segs: 3, wk: 1.0, fi: 1, fo: 3 },
      { S: 1.25, rIn: 10, rOut: 30, B: 56, segs: 2, wk: 1.9, fi: 3, fo: 6 },
      { S: 2.2, rIn: 24, rOut: 62, B: 44, segs: 1, wk: 2.6, fi: 6, fo: 12 },
      { S: 3.6, rIn: 50, rOut: 125, B: 26, segs: 1, wk: 4.2, fi: 12, fo: 45, last: 1 },
    ],
    med: [
      // revision: denser near carpet on med (the g2 slope read bald); ring 1 pays with 2-segment blades
      { S: 0.9, rIn: 0, rOut: 4.5, B: 96, segs: 3, wk: 1.1, fi: 0, fo: 1 },
      { S: 0.9, rIn: 3.5, rOut: 13, B: 76, segs: 2, wk: 1.1, fi: 1, fo: 3 },
      { S: 1.5, rIn: 9, rOut: 30, B: 46, segs: 2, wk: 2.1, fi: 3, fo: 6 },
      { S: 2.8, rIn: 24, rOut: 60, B: 36, segs: 1, wk: 3.0, fi: 6, fo: 12 },
      { S: 4.2, rIn: 48, rOut: 100, B: 16, segs: 1, wk: 4.6, fi: 12, fo: 40, last: 1 },
    ],
    low: [
      { S: 1.0, rIn: 0, rOut: 4.5, B: 48, segs: 2, wk: 1.4, fi: 0, fo: 1 },
      { S: 1.0, rIn: 3.5, rOut: 12, B: 40, segs: 2, wk: 1.4, fi: 1, fo: 3 },
      { S: 2.0, rIn: 9, rOut: 34, B: 36, segs: 1, wk: 2.3, fi: 3, fo: 8 },
      { S: 4.0, rIn: 28, rOut: 80, B: 22, segs: 1, wk: 4.2, fi: 8, fo: 34, last: 1 },
    ],
  }[qn] || [];
  const mob = !!q.mobile; // phones (core/boot.js QUALITY.mobile): the painted ground carries the far field sooner
  const outer = mob ? 104 : qn === 'low' ? 136 : qn === 'med' ? 169 : 207;
  const end = RINGS[RINGS.length-1];
  if(end) {
    end.last=0;
    RINGS.push({S:qn==='low'?7.8:7.1,rIn:end.rOut-end.fo,rOut:outer,B:13,segs:1,wk:5.4,fi:end.fo,fo:52,last:1});
  }
  const meshes = [];
  const mk = (geo, flower, ring) => {
    // every lattice cell of the annulus (relative to the snapped centre), sorted by angle: a view cone is one wrapped range
    const M = Math.ceil(ring.rOut / ring.S) + 2, cells = [];
    for (let iz = -M; iz <= M; iz++) for (let ix = -M; ix <= M; ix++) {
      const d = Math.hypot(ix + 0.5, iz + 0.5) * ring.S;
      if (d < ring.rIn - 1.5 * ring.S || d > ring.rOut + 1.5 * ring.S + 3) continue;
      cells.push([ix, iz, Math.atan2(iz + 0.5, ix + 0.5)]);
    }
    cells.sort((a, b) => a[2] - b[2]);
    const n = cells.length, rows = Math.ceil(n / 256);
    const data = new Float32Array(256 * rows * 4);
    const angles = new Float32Array(n);
    cells.forEach((c, k) => { data[k * 4] = c[0]; data[k * 4 + 1] = c[1]; angles[k] = c[2]; });
    const tex = new THREE.DataTexture(data, 256, rows, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    geo.instanceCount = n;
    const U = {
      ...shared, gRing: { value: new THREE.Vector4(ring.S, n, ring.rIn, ring.rOut) },
      gRing2: { value: new THREE.Vector4(ring.wk || 1, ring.fi || 4, ring.fo || 9, ring.last || 0) },
      gOffset: { value: 0 }, gCells: { value: tex },
    };
    const mesh = new THREE.Mesh(geo, makeMaterial(U, flower));
    mesh.userData.ring = { full: !flower && ring.rIn < 0.5, n, angles, U, geo, triPer: geo.index.count / 3, blades: geo.userData.blades || 1, rOut: ring.rOut };
    mesh.frustumCulled = false;
    // revision: every ring but the innermost (from 3.5 m out) draws after the opaque scene WITHOUT writing depth. Thin blades
    // in the depth buffer made GTAO stamp a dark smeared dot on each (far-field blob-dots, muddy mid carpet). Depth
    // test still hides them behind hills, props and the heroine; blade-over-blade order at that size does not show.
    if (!flower && ring.rIn >= 3) { mesh.material.depthWrite = false; mesh.renderOrder = 2; }
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = flower ? 'flora:flowers' : 'flora:grass';
    G.scene.add(mesh);
    meshes.push(mesh);
  };
  // revision: on med the two near rings keep (almost) full density: the vegetation density scale thinned the slope in
  // front of her to a bald look; the far rings, painted by the ground anyway, carry the saving
  const dK = (r) => r.rIn < 5 ? Math.max(dens, qn === 'low' ? .72 : .95) : dens;
  for (const r of RINGS) mk(patchGeometry(Math.max(8, Math.round(r.B * dK(r) * .95)), r.segs, rng), false, r);
  // The outer spray has wider petals and fewer triangles per floret, so its
  // colour patches remain readable from above the grass.
  const flowerRings = mob ? [[3.1,19,0,8],[5.0,60,10,20],[8.5,104,44,40]] : qn === 'low' ? [[2.9,21,0,9],[4.6,75,12,24],[7.9,136,51,46]] :
    qn === 'med' ? [[2.5,25,0,9],[4.0,94,16,28],[7.0,169,66,52]] :
    [[2.2,29,0,10],[3.8,112,19,32],[6.8,207,80,58]];
  for (let i=0;i<flowerRings.length;i++) {
    const [spacing,radius,inner,fade]=flowerRings[i];
    mk(flowerPatch(i>0),true,{S:spacing,rIn:inner,rOut:radius,fi:i?flowerRings[i-1][3]:0,fo:fade,wk:i===2?1.72:1});
  }

  // blasts bend the field outward ('element:applied')
  let blastI = 0;
  G.events?.on?.('element:applied', (e) => {
    try {
      const p = e?.pos; if (!p || !Number.isFinite(p.x)) return;
      const k = Math.min(3, (e.radius || 2) * (e.element === 'wind' ? 1.6 : 1) * 0.6);
      shared.gBlast.value[blastI].set(p.x, p.z, shared.gTime.value, k);
      blastI = (blastI + 1) % MAXB;
    } catch (err) { G.reportError?.('grass:blast', err); }
  });
  // purely visual blasts (the beam struggle's pressure waves: fx/magic.js emits 'fx:blast' { pos, radius })
  G.events?.on?.('fx:blast', (e) => {
    try {
      const p = e?.pos; if (!p || !Number.isFinite(p.x)) return;
      shared.gBlast.value[blastI].set(p.x, p.z, shared.gTime.value, Math.min(3, (e.radius || 5) * 0.5));
      blastI = (blastI + 1) % MAXB;
    } catch (err) { G.reportError?.('grass:blast', err); }
  });

  // phones shedding cost (core/boot.js 'perf:lite' level >= 1): the outermost grass and flower rings go; the painted
  // ground carries that band
  let liteHide = false;
  if (mob) G.events?.on?.('perf:lite', (e) => { liteHide = e?.level >= 1; });
  const craters = []; // { x, z, r, t, life }
  const scars = [];   // persistent bare discs from api.scarFeed
  let scarAge = Infinity, scarX = 0, scarZ = 0;
  let trailI = 0;
  const _f = new THREE.Vector3(), _f2 = new THREE.Vector3(), _sd = new THREE.Vector3();
  const lowerBound = (a, v) => { let l = 0, h = a.length; while (l < h) { const m = (l + h) >> 1; if (a[m] < v) l = m + 1; else h = m; } return l % a.length; };
  const api = {
    meshes, uniforms: shared, _fieldRT: fieldRT, meadowWake:wake,
    refreshField() {fieldAge=Infinity;},
    /** Remove grass inside a radius for `life` seconds (it grows back from the edge over the last third). */
    clear(x, z, r, life = 90) {
      if (craters.length >= MAXT) craters.shift();
      craters.push({ x, z, r, t: 0, life });
    },
    /** Persistent bare ground (craters, mounds) the destruction system feeds in: fn(camX, camZ, out) fills out with
     *  { x, z, r, k } nearest first and returns the count. Set by world/destruction.js; null = none. */
    scarFeed: null,
    /** Ask for the persistent scars to be fetched again (after a deform). */
    refreshScars() { scarAge = Infinity; },
    update(dt, cam, push, wind) {
      shared.gTime.value += dt;
      if (wind) shared.gWind.value.lerp(wind, Math.min(1, dt * 2));
      wake.update(dt,shared.gWind.value);
      const tv=shared.gPushT.value;
      for(const v of tv)v.z=Math.max(0,v.z-dt/1.3);
      const contact=push && (G.player?.state==='ground' || !G.player);
      shared.gPush.value.w=contact?1:0;
      if (contact) {
        shared.gPush.value.set(push.x,push.z,1.45,1);
        const last=tv[trailI];
        if(last.z<=0 || Math.hypot(push.x-last.x,push.z-last.y)>.7) {
          trailI=(trailI+1)%4;tv[trailI].set(push.x,push.z,1,0);
        }
      }
      shared.gCam.value.copy(cam.position);
      cam.getWorldDirection(_f);
      _f.y = 0; if (_f.lengthSq() > 1e-6) _f.normalize();
      shared.gCenter.value.set(cam.position.x, cam.position.z);
      // the terrain paints the same wind sheen on the ground under / beyond the blades
      if (TU.trGust) { const w = shared.gWind.value, ws = Math.hypot(w.x, w.z); TU.trGust.value.set(ws > 1e-3 ? w.x / ws : 1, ws > 1e-3 ? w.z / ws : 0, Math.min(1.6, Math.max(0.15, ws / 6)), shared.gTime.value); }
      try { renderField(cam.position.x, cam.position.z, dt); } catch (e) { G.reportError?.('grass:field', e); }
      // sun direction (view space) and colour for the translucency
      const sun = G.lights?.sun;
      if (sun) {
        _sd.copy(sun.position).sub(sun.target.position).normalize().transformDirection(cam.matrixWorldInverse);
        shared.gSunView.value.copy(_sd);
        shared.gSunCol.value.copy(sun.color).multiplyScalar(Math.min(4, sun.intensity) * 0.35);
      }
      cam.getWorldDirection(_f2);
      const a0 = Math.atan2(_f.z, _f.x);
      const hf = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect);
      const half = hf + 0.35 + 1.3 * Math.max(0, -_f2.y - 0.2);
      for (const m of meshes) {
        const R = m.userData.ring;
        // the innermost ring (around the camera itself) gets a wider cone: its cells are big in angle near the camera
        const hh = Math.min(Math.PI, half + (R.full ? 0.6 : 0));
        if (hh >= Math.PI - 0.05 || _f.lengthSq() < 0.5) { R.U.gOffset.value = 0; R.geo.instanceCount = R.n; continue; }
        let lo = a0 - hh; if (lo < -Math.PI) lo += Math.PI * 2;
        const start = lowerBound(R.angles, lo);
        let hi=a0+hh;
        if(hi>Math.PI)hi-=Math.PI*2;
        const end=lowerBound(R.angles,hi);
        const span=(end-start+R.n)%R.n+2;
        R.U.gOffset.value = start;
        R.geo.instanceCount = Math.min(R.n, span);
      }
      const gh = G.world.heightAt(cam.position.x, cam.position.z);
      const agl=cam.position.y-gh;
      shared.gAerial.value=1-THREE.MathUtils.smoothstep(agl,130,220);
      const show=shared.gAerial.value>.001;
      for (const m of meshes) m.visible = show && !(liteHide && m.userData.ring.rOut >= outer);
      for (let i = craters.length - 1; i >= 0; i--) { craters[i].t += dt; if (craters[i].t > craters[i].life) craters.splice(i, 1); }
      const cv = shared.gCraters.value;
      let ci = 0;
      for (; ci < craters.length && ci < MAXT; ci++) {
        const c = craters[ci];
        const k = c.t / c.life;
        cv[ci].set(c.x, c.z, c.r * (k < 0.66 ? 1 : 1 - (k - 0.66) / 0.34 * 0.9), 1);
      }
      if (api.scarFeed) {
        scarAge += dt;
        if (scarAge > 0.6 || Math.abs(cam.position.x - scarX) + Math.abs(cam.position.z - scarZ) > 24) {
          scarAge = 0; scarX = cam.position.x; scarZ = cam.position.z;
          let n = 0;
          try { n = api.scarFeed(scarX, scarZ, scars) | 0; } catch (e) { G.reportError?.('grass:scars', e); }
          scars.length = Math.min(n, scars.length);
        }
        for (let j = 0; j < scars.length && ci < MAXC; j++, ci++) { const c = scars[j]; cv[ci].set(c.x, c.z, c.r, c.k ?? 1); }
      }
      for (; ci < MAXC; ci++) cv[ci].set(0, 0, 0, 0);
      const bv = shared.gBlast.value;
      for (let i = 0; i < MAXB; i++) if (bv[i].w > 0 && shared.gTime.value - bv[i].z > 3.5) bv[i].w = 0;
    },
    triangles() { let n = 0; for (const m of meshes) if (m.visible) n += m.userData.ring.triPer * m.userData.ring.geo.instanceCount; return n; },
    /** Blades submitted this frame (upper bound before masks: instances × blades per patch). */
    blades() { let n = 0; for (const m of meshes) if (m.visible && m.name === 'flora:grass') n += m.userData.ring.blades * m.userData.ring.geo.instanceCount; return n; },
  };
  return api;
}
export { POI as _POI };
