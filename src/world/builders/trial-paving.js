// The trial ground's paving, laid stone by stone (round art-ground, 2026-11-24). Fran's spar clearing (JOURNEY_POI.trial)
// was flagstones painted on flat terrain (terrain/shader.js settlement 'trial': a stone plaza of 0.18 x 29 m, and the
// paved forest path through it); here they are real slabs. Irregular flagstones (a relaxed Voronoi of the plaza and the
// path) with a joint of 3-5 cm between them, each a bevelled prism (builders/facet-prism.js: chamfered, worn arrises
// that catch the light, a slightly cushioned face, now and then a chipped corner or a slab cracked in two), seated on
// the ground's own slope; the joints are dark earth and moss with grass tufts, more of them toward the rim where the
// meadow creeps in. The painted paving stays under them and beyond (past the slab field and past the draw distance).
//   * two draws (stone, joint moss + grass), no shadow casting, no colliders (2-4 cm proud: she walks the terrain);
//   * counts scale with q (path length, tufts, chips); drawn within ~90 m (phones ~35 m), the painted paving beyond;
//   * magic: burns, wet and frost show on the slabs (the terrain's scorch layer, so restoration's unscorch clears them);
//     a crater or heap re-seats the slabs it touches, restoration's uncarve seats them back ('terrain:deformed').
// Off with ?sculpt=0 (the old world: painted paving only).
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { toon, own } from '../../core/mats.js';
import { hash2 } from '../../core/util.js';
import { JOURNEY_POI } from '../../data/journey-map.js';
import { Tris, prism, linHex } from './facet-prism.js';
import { DATA_HALF } from '../terrain/textures.js';

const C = JOURNEY_POI.trial;
const S = 0.74;                 // seed spacing (m): slabs of ~0.5 m²
const H = (a, b) => hash2(a * 7.13 + 11.7, b * 3.91 - 5.3);

/** the scorch / wet layer of the terrain on a vertex-coloured material: char, damp darkening (restoration drains it) */
export function groundMarks(m, key) {
  const TU = G.terrain?.uniforms;
  if (!TU?.trScorch) return m;
  const half = DATA_HALF;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMkScorch = TU.trScorch;
    sh.vertexShader = 'varying vec3 vMkW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      { vec4 mkw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mkw = instanceMatrix * mkw;
        #endif
        vMkW = (modelMatrix * mkw).xyz; }`);
    sh.fragmentShader = 'uniform sampler2D uMkScorch;\nvarying vec3 vMkW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec4 mk = texture2D(uMkScorch, (vMkW.xz + ${half.toFixed(1)}) / ${(half * 2).toFixed(1)});
        float burn = smoothstep(0.3, 0.8, mk.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.034, 0.027, 0.022), burn * 0.93);   // the terrain's char (shader.js charA..B)
        diffuseColor.rgb *= 1.0 - 0.32 * smoothstep(0.15, 0.7, mk.g);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.86, 0.95), smoothstep(0.3, 0.8, mk.b) * 0.6); }`);
  };
  m.customProgramCacheKey = () => 'mvGroundMarks' + key;
  return m;
}

// ------------------------------------------------------------------------------------------------- the layout
/** clip a convex polygon (points carry the label of the edge that starts at them) by p·u <= c; the cut edge gets `lab` */
function clipLab(P, u, c, lab) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const da = a[0] * u[0] + a[1] * u[1] - c, db = b[0] * u[0] + b[1] * u[1] - c;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db), p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, da < 0 ? lab : a[2]];
      out.push(p);
    }
  }
  return out;
}
const areaOf = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s) / 2; };

function layout(q) {
  const W = G.world;
  const dMax = q.mobile ? 12 : q.name === 'low' ? 16 : 22;
  const plazaR = (a) => 5.35 + 0.35 * Math.sin(3 * a + 1.1) + 0.22 * Math.sin(5 * a + 2.3);
  const at = (x, z) => { const dx = x - C.x, dz = z - C.z; return { d: Math.hypot(dx, dz), a: Math.atan2(dz, dx) }; };
  const rdCache = new Map();
  const rd = (x, z) => { const k = Math.round(x * 4) * 4099 + Math.round(z * 4); let v = rdCache.get(k); if (v === undefined) { v = W.roadDist(x, z); rdCache.set(k, v); } return v; };
  const pathEnd = (a) => dMax + 1.4 * Math.sin(a * 7 + 0.5);
  const seedIn = (x, z) => { const { d, a } = at(x, z); return d < plazaR(a) - 0.15 || (d < pathEnd(a) && rd(x, z) < 1.8); };
  const vertOK = (x, z) => { const { d, a } = at(x, z); return d < plazaR(a) + 0.55 || (d < pathEnd(a) + 0.8 && rd(x, z) < 2.25); };
  // seeds: a jittered hex lattice over the field's box
  const R = dMax + 3, seeds = [], grid = new Map(), cell = S * 1.2;
  const gk = (x, z) => Math.floor(x / cell) * 65536 + Math.floor(z / cell);
  const rowH = S * 0.866;
  for (let r = -Math.ceil(R / rowH); r <= Math.ceil(R / rowH); r++) for (let c = -Math.ceil(R / S); c <= Math.ceil(R / S); c++) {
    const lx = (c + (r & 1 ? 0.5 : 0)) * S, lz = r * rowH;
    const x = C.x + lx + (H(c, r) - 0.5) * S * 0.8, z = C.z + lz + (H(r + 31, c - 17) - 0.5) * S * 0.8;
    const { d, a } = at(x, z);
    if (d > R) continue;
    if (d > 8.5 && rd(x, z) > 3.4) continue;
    // random flagstone: some seeds left out well inside the field (their neighbours grow into big stones); every seed
    // has a weight (power diagram) so sizes vary from small fillers to stones of ~1 m
    if (H(c * 3 + 7, r * 5 - 2) < 0.14 && (d < plazaR(a) - 1.2 || rd(x, z) < 1.1)) continue;
    const s = { x, z, in: seedIn(x, z), i: seeds.length, c, r, w: (0.3 * S * H(c - 9, r + 4)) ** 2 };
    seeds.push(s);
    const k = gk(x, z); (grid.get(k) || grid.set(k, []).get(k)).push(s);
  }
  // one relaxation step for the kept seeds (rounder stones, fewer slivers)
  const near = (s, rad) => {
    const out = [], ix = Math.floor(s.x / cell), iz = Math.floor(s.z / cell), k = Math.ceil(rad / cell);
    for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) for (const t of grid.get((ix + a) * 65536 + iz + b) || []) if (t !== s && Math.hypot(t.x - s.x, t.z - s.z) < rad) out.push(t);
    return out;
  };
  const slabs = [];
  for (const s of seeds) {
    if (!s.in) continue;
    let P = [[-S * 1.6, -S * 1.6, -1], [S * 1.6, -S * 1.6, -1], [S * 1.6, S * 1.6, -1], [-S * 1.6, S * 1.6, -1]];
    for (const t of near(s, S * 2.8)) {
      const dx = t.x - s.x, dz = t.z - s.z, l = Math.hypot(dx, dz) || 1, u = [dx / l, dz / l];
      const g = 0.016 + 0.011 * H(Math.min(s.i, t.i) * 1.3, Math.max(s.i, t.i) * 0.7);  // half joint, the same from both sides
      P = clipLab(P, u, (l * l + s.w - t.w) / (2 * l) - g, t.i);
      if (P.length < 3) break;
    }
    if (P.length < 3) continue;
    // merge vertices closer than 4 cm (no needle edges)
    for (let i = 0; i < P.length && P.length > 3;) { const a = P[i], b = P[(i + 1) % P.length]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.045) { a[0] = (a[0] + b[0]) / 2; a[1] = (a[1] + b[1]) / 2; P.splice((i + 1) % P.length, 1); } else i++; }
    if (P.length < 3 || areaOf(P) < 0.05) continue;
    if (!P.every((p) => vertOK(s.x + p[0], s.z + p[1]))) continue;
    // centroid frame
    const cx = P.reduce((a, p) => a + p[0], 0) / P.length, cz = P.reduce((a, p) => a + p[1], 0) / P.length;
    // rim: 1 at the meadow's edge (moss on the arrises, more grass in the joints), 0 well inside
    const { d, a } = at(s.x, s.z), pr = plazaR(a);
    const rim = d < pr ? Math.max(0, 1 - (pr - d) / 1.4) : Math.min(1, Math.max(0, (rd(s.x, s.z) - 0.7) / 1.0));
    slabs.push({ x: s.x + cx, z: s.z + cz, poly: P.map((p) => [p[0] - cx, p[1] - cz, p[2]]), id: s.i, rim });
  }
  const byId = new Map(slabs.map((s) => [s.id, s]));
  return { slabs, byId, seeds };
}

// ------------------------------------------------------------------------------------------------- the stones
const STONE_COOL = linHex(0xa39e97), STONE_WARM = linHex(0xc6bcab), EDGE_K = 1.1;
const JOINT = linHex(0x4d4839), JOINT_MOSS = linHex(0x52683a), MOSS = linHex(0x6f8f44);
const BLADE_A = linHex(0x4f7f33), BLADE_B = linHex(0x9cc95a);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulk = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

/** truncate the sharpest corner: a chip (short edge with a deep chamfer) */
function chip(poly, w, k) {
  let best = -1, bestA = 9;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const u = [a[0] - p[0], a[1] - p[1]], v = [b[0] - p[0], b[1] - p[1]];
    const ang = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1))));
    if (ang < bestA) { bestA = ang; best = i; }
  }
  if (bestA > 2.3) return { poly, w };
  const i = best, p = poly[i], a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
  const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]), c = Math.min(k, la * 0.35, lb * 0.35);
  const pa = [p[0] + (a[0] - p[0]) / la * c, p[1] + (a[1] - p[1]) / la * c], pb = [p[0] + (b[0] - p[0]) / lb * c, p[1] + (b[1] - p[1]) / lb * c];
  const out = [], ww = [];
  for (let j = 0; j < n; j++) {
    if (j === i) { out.push(pa, pb); ww.push(0.03, w[j]); } else { out.push(poly[j]); ww.push(w[j]); }
  }
  return { poly: out, w: ww };
}

/** build one slab's stone (and its joint skirt + tufts) in its own frame (centroid at the origin, plane y = 0) */
function buildSlab(s, q, ST, MO, tuftsOf) {
  const h1 = H(s.id, 1), h2 = H(s.id, 2), h3 = H(s.id, 3), h4 = H(s.id, 4), h5 = H(s.id, 5);
  const fine = !q.mobile && q.name !== 'low';
  let base = mix3(STONE_COOL, STONE_WARM, h1);
  base = mulk(base, 0.88 + 0.17 * h2);
  if (h3 > 0.9) base = [base[0] * 0.98, base[1] * 1.03, base[2] * 0.9];          // a lichen-stained stone
  const mossEdge = Math.min(1, s.rim * (0.4 + 0.6 * h4));
  const paint = (part, p) => {
    if (part === 'top') { const r = Math.min(1, Math.hypot(p[0], p[2]) / 0.42); return mulk(base, 1.035 - 0.05 * r); }
    if (part === 'edge') return mix3(mulk(base, EDGE_K), MOSS, mossEdge * 0.35);
    return mulk(base, 0.58 + 0.36 * p[1]);                                          // damp, darker below the grass line
  };
  const y1 = 0.032 + 0.016 * h5, y0 = -0.09;
  let poly = s.poly.map((p) => [p[0], p[1]]);
  let w = s.poly.map((_, i) => (H(s.id, 10 + i) > 0.82 ? 0.026 : 0.012 + 0.012 * H(s.id, 20 + i)));
  if (fine && h4 > 0.7) ({ poly, w } = chip(poly, w, 0.055 + 0.04 * h2));
  const dome = fine ? 0.006 + 0.006 * h3 : 0;
  if (h5 > 0.93 && poly.length >= 4) {
    // cracked in two: halves split by a hairline, the smaller one sunk a little
    const ang = h2 * Math.PI, u = [Math.cos(ang), Math.sin(ang)];
    for (const sg of [1, -1]) {
      const half = [];
      const U = [u[0] * sg, u[1] * sg];
      const P = clipLab(poly.map((p, i) => [p[0], p[1], i]), U, -0.004, -2);
      if (P.length < 3) continue;
      const ww = P.map((p) => (p[2] === -2 ? 0.008 : w[p[2]] ?? 0.015));
      for (const p of P) half.push([p[0], p[1]]);
      prism(ST, half, { y0, y1: y1 - (sg < 0 ? 0.007 : 0), top: ww, dome: dome * 0.5, skipBottom: true, paint });
    }
  } else {
    prism(ST, poly, { y0, y1, top: w, dome, skipBottom: true, paint });
  }
  // the joint around it: a flat ring of dark earth / moss just above the ground, out past the joint's middle
  const P = s.poly, n = P.length, jc = mix3(JOINT, JOINT_MOSS, Math.min(1, 0.25 + s.rim * 0.8)), up = [0, 1, 0];
  const cx = 0, cz = 0;
  const ring = P.map((p) => { const l = Math.hypot(p[0] - cx, p[1] - cz) || 1; return [p[0] + (p[0] - cx) / l * 0.045, p[1] + (p[1] - cz) / l * 0.045]; });
  const ins = P.map((p) => { const l = Math.hypot(p[0] - cx, p[1] - cz) || 1; return [p[0] - (p[0] - cx) / l * 0.02, p[1] - (p[1] - cz) / l * 0.02]; });
  const vi = ins.map((p) => MO.v([p[0], 0.003, p[1]], up, jc)), vo = ring.map((p) => MO.v([p[0], 0.003, p[1]], up, jc));
  let sa = 0; for (let i = 0; i < n; i++) { const p = P[i], q2 = P[(i + 1) % n]; sa += p[0] * q2[1] - q2[0] * p[1]; }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;   // facing up whichever way the polygon runs
    if (sa < 0) { MO.tri(vi[i], vo[j], vi[j]); MO.tri(vi[i], vo[i], vo[j]); } else { MO.tri(vi[i], vi[j], vo[j]); MO.tri(vi[i], vo[j], vo[i]); }
  }
  // grass tufts in its joints
  for (const t of tuftsOf(s)) tuft(MO, t.x, t.z, t.ax, t.az, t.seed);
}

/** a small tuft of grass blades at (x, z) along a joint running (ax, az) */
function tuft(MO, x, z, ax, az, seed) {
  const n = 4 + Math.floor(H(seed, 1) * 4);
  for (let b = 0; b < n; b++) {
    const r1 = H(seed, b * 3 + 2), r2 = H(seed, b * 3 + 3), r3 = H(seed, b * 3 + 4);
    const bx = x + ax * (r1 - 0.5) * 0.14, bz = z + az * (r1 - 0.5) * 0.14 + (r2 - 0.5) * 0.02;
    const h = 0.06 + 0.11 * r2 * r2 + 0.04 * r3, la = r3 * Math.PI * 2, lean = 0.25 + 0.35 * r1;
    const lx = Math.cos(la), lz = Math.sin(la), sx = -lz * 0.007, sz = lx * 0.007;
    const nrm = [lx * 0.25, 1, lz * 0.25].map((v, k, a) => v / Math.hypot(a[0], a[1], a[2]));
    const cb = mulk(BLADE_A, 0.9 + 0.2 * r1), ct = mix3(BLADE_A, BLADE_B, 0.55 + 0.45 * r2);
    const a = MO.v([bx - sx, 0, bz - sz], nrm, cb), c = MO.v([bx + sx, 0, bz + sz], nrm, cb), t = MO.v([bx + lx * h * lean, h, bz + lz * h * lean], nrm, ct);
    MO.tri2(a, c, t);
  }
}

// ------------------------------------------------------------------------------------------------- seating
function makeSeat(geo, local, ranges) {
  const pos = geo.attributes.position.array, nrm = geo.attributes.normal.array, L = local;
  return (s, yc, gx, gz) => {
    const r = ranges.get(s);
    if (!r) return;
    for (let v = r[0]; v < r[1]; v++) {
      const o = v * 3, lx = L.p[o], ly = L.p[o + 1], lz = L.p[o + 2];
      pos[o] = s.x + lx; pos[o + 1] = yc + ly + gx * lx + gz * lz; pos[o + 2] = s.z + lz;
      const nx = L.n[o], ny = L.n[o + 1], nz = L.n[o + 2];
      const mx = nx - gx * ny, mz = nz - gz * ny, l = Math.hypot(mx, ny, mz) || 1;
      nrm[o] = mx / l; nrm[o + 1] = ny / l; nrm[o + 2] = mz / l;
    }
  };
}

export async function buildTrialPaving(ctx) {
  if (G.sculpt && G.sculpt.enabled === false) return;
  const q = G.quality || { name: 'high' };
  const { slabs, byId } = layout(q);
  if (!slabs.length) return;
  await ctx.step('trialPaving:layout');
  const tuftK = q.mobile ? 0.35 : q.name === 'low' ? 0.45 : q.name === 'med' ? 0.7 : 1;
  const ST = new Tris(), MO = new Tris(), rS = new Map(), rM = new Map();
  // which joints get grass: along every edge shared with another slab (more toward the rim), and on the open rim edges
  const tuftsOf = (s) => {
    const out = [], P = s.poly, n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], lab = a[2], other = byId.get(lab);
      if (other && other.id < s.id) continue;                    // each shared joint once
      const p = other ? 0.13 + 0.45 * Math.max(s.rim, other.rim) : 0.6 * (0.4 + 0.6 * s.rim);
      if (H(s.id * 3 + i, 77) > p * tuftK) continue;
      const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
      const t = 0.3 + 0.4 * H(s.id, i + 40), out2 = other ? 0.02 : 0.05;
      // the joint's middle: just outside this slab's edge
      const nx = ez / l, nz = -ex / l, sg = (nx * (a[0] + ex * t) + nz * (a[1] + ez * t)) > 0 ? 1 : -1;
      out.push({ x: a[0] + ex * t + nx * sg * out2, z: a[1] + ez * t + nz * sg * out2, ax: ex / l, az: ez / l, seed: s.id * 13 + i });
    }
    return out;
  };
  for (let k = 0; k < slabs.length; k++) {
    const s = slabs[k];
    const s0 = ST.nv, m0 = MO.nv;
    buildSlab(s, q, ST, MO, tuftsOf);
    rS.set(s, [s0, ST.nv]); rM.set(s, [m0, MO.nv]);
    if (k % 80 === 79) await ctx.step('trialPaving:stones');
  }
  const gS = ST.geometry(), gM = MO.geometry();
  const local = (T) => ({ p: Float32Array.from(T.pos), n: Float32Array.from(T.nrm) });
  const seatS = makeSeat(gS, local(ST), rS), seatM = makeSeat(gM, local(MO), rM);
  const W = G.world;
  const seat = (s) => {
    const e = 0.35, h0 = W.heightAt(s.x, s.z);
    let gx = (W.heightAt(s.x + e, s.z) - W.heightAt(s.x - e, s.z)) / (2 * e), gz = (W.heightAt(s.x, s.z + e) - W.heightAt(s.x, s.z - e)) / (2 * e);
    if (Math.hypot(gx, gz) > 0.75) { seatS(s, h0 - 3, 0, 0); seatM(s, h0 - 3, 0, 0); return; }   // a crater wall: the stone is gone under
    gx += (H(s.id, 61) - 0.5) * 0.018; gz += (H(s.id, 62) - 0.5) * 0.018;                       // each slab settled its own way
    seatS(s, h0, gx, gz); seatM(s, h0, gx, gz);
  };
  for (const s of slabs) seat(s);
  const stoneMat = groundMarks(own(toon(0xa59c90, { surface: 'stone', look: { detail: 0.3, bump: 0.35, rim: 0.22, wrap: 0.3 } })), 'pave');
  stoneMat.vertexColors = true; stoneMat.color.setRGB(1, 1, 1); stoneMat.name = 'trialPaving_stone';
  const mossMat = groundMarks(own(toon(0x6c8a4a, { surface: 'none', look: { rim: 0.3, wrap: 0.5 } })), 'paveMoss');
  mossMat.vertexColors = true; mossMat.color.setRGB(1, 1, 1); mossMat.name = 'trialPaving_joints';
  const mS = new THREE.Mesh(gS, stoneMat), mM = new THREE.Mesh(gM, mossMat);
  for (const [m, nm] of [[mS, 'trial paving slabs'], [mM, 'trial paving joints']]) {
    m.name = nm; m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false;
    m.geometry.computeBoundingSphere();
    G.scene.add(m);
    ctx.cull(m, new THREE.Vector3(C.x, W.heightAt(C.x, C.z), C.z), q.mobile ? 50 : q.name === 'low' ? 65 : q.name === 'med' ? 80 : 95);
  }
  // magic reshaping the ground: re-seat the slabs it touched (and seat them back when restoration undoes it)
  G.events?.on?.('terrain:deformed', (e) => {
    if (!e || e.kind === 'trialLake') return;
    const x0 = (e.x0 ?? e.x - e.r) - 1, x1 = (e.x1 ?? e.x + e.r) + 1, z0 = (e.z0 ?? e.z - e.r) - 1, z1 = (e.z1 ?? e.z + e.r) + 1;
    if (x1 < C.x - 30 || x0 > C.x + 30 || z1 < C.z - 30 || z0 > C.z + 30) return;
    let n = 0;
    for (const s of slabs) if (s.x > x0 && s.x < x1 && s.z > z0 && s.z < z1) { seat(s); n++; }
    if (!n) return;
    for (const g of [gS, gM]) { g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.computeBoundingSphere(); }
  });
  ctx.S.trialPaving = { list: slabs, slabs: slabs.length, tris: gS.index.count / 3 + gM.index.count / 3, stoneTris: gS.index.count / 3, jointTris: gM.index.count / 3, meshes: [mS, mM] };
}
