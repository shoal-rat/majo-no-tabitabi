// The old mill crossing stands on the two parts of a rock shoulder. A dry gorge
// is visible under its arch before the trial. Afterwards it is open navigable water.
// Round art-ground (2026-11-24): the arch is masonry laid stone by stone — a ring of wedge voussoirs with a proud
// keystone, coursed spandrels cut to the extrados, coursed piers with a plinth and an impost string course, bevelled
// coping, parapet stones with rounded copes (builders/facet-prism.js) — and the shore ledges are stones of the rock
// family (bedded ledges and shelves with moss). Same colliders, deck and step platforms; ?sculpt=0 builds the old boxes.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { box } from '../../core/geo.js';
import { toon } from '../../core/mats.js';
import { Site, mat, sculptVcMat } from './kit.js';
import { TRIAL_LAKE, trialShoreDistance } from '../trial-lake.js';
import { mulberry32, hash2 } from '../../core/util.js';
import { Tris, prism, block, clipPoly, linHex } from './facet-prism.js';
import { rockParts, rockFamilyOn, rockLod, siteRockMats, NEUTRAL } from '../rock-family.js';

const DECK = 19.28, RING_C = 8.45, RING_R = 10.4;
const deckY = (i) => DECK + 0.2 * Math.cos((i * Math.PI) / 27);
/** walls, deck and step platforms of the crossing (the same for the old and the modelled arch) */
function archColliders(site) {
  for (const s of [-1, 1]) site.colBox(s * 12.6, 0, 2.15, 2.55, 0, 2, DECK - 0.68);
  for (let i = -13; i <= 13; i++) site.platBox(i * 1.06, 0, 0.555, 2.68, 0, deckY(i) + 0.011, 0.29);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) site.platBox(s * (14.4 + i * 0.7), 0, 0.385, 2.57, 0, DECK - 0.07 - i * 0.085, 0.28);
}

/** the arch as masonry: one vertex-coloured mesh (merged into the site's stone family by the bake) */
function millArchModelled(site) {
  const q = G.quality || { name: 'high' }, fine = !q.mobile && q.name !== 'low';
  const T = new Tris(), H = (a, b) => hash2(a * 5.31 + 3.7, b * 2.17 - 9.1);
  const LIME = linHex(0xd4c7ab), PALE = linHex(0xe9dcbd), WARM = linHex(0xdac8a6), DARK = linHex(0x9a9080);
  const tone = (base, k, w = 0) => [base[0] * k * (1 + 0.04 * w), base[1] * k, base[2] * k * (1 - 0.05 * w)];
  // stone paint: calm faces, pale worn arrises, shaded soffits, a damp foot and a faint water line low on the piers
  const painter = (base) => (part, p, n, P, N) => {
    let k = 1;
    if (part === 'edge') k *= 1.09;
    if (N[1] < -0.5) k *= 0.74;                       // soffits: the intrados and the undersides of copes
    else if (N[1] > 0.6) k *= 1.05;                   // weathered tops
    if (P[1] < 3.2) k *= 0.8 + 0.2 * Math.min(1, Math.max(0, (P[1] + 1) / 4.2));
    const c = tone(base, k);
    if (P[1] < 1.4 && P[1] > -0.4) { c[0] *= 0.9; c[2] *= 0.94; }   // old water line: a greener, darker band
    return c;
  };
  const stoneOf = (a, b, kind = 0) => {
    const h = H(a, b), base = kind === 1 ? PALE : kind === 2 ? DARK : h > 0.7 ? WARM : LIME;
    return painter(tone(base, 0.92 + 0.13 * H(b, a + 3), H(a + 1, b) - 0.5));
  };
  const cb = fine ? 0.035 : 0.03, corner = fine ? 0.03 : 0;
  const rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2);   // polygon in the arch's (x, y) plane, extruded across z
  // --- the ring: 23 wedge voussoirs, radial joints, every third one pale; the keystone proud of both faces
  const ri = RING_R - 0.65, re = RING_R + 0.65, gap = 0.006;
  for (let j = 0; j < 23; j++) {
    const a0 = (Math.PI * j) / 23 + gap / ri, a1 = (Math.PI * (j + 1)) / 23 - gap / ri, key = j === 11;
    const ext = (a) => Math.min(re, (deckY(Math.round((re * Math.cos(a)) / 1.06)) - 0.29 - RING_C) / Math.max(0.05, Math.sin(a)));
    const poly = [[ri * Math.cos(a0), RING_C + ri * Math.sin(a0)], [ext(a0) * Math.cos(a0), RING_C + ext(a0) * Math.sin(a0)],
      [ext(a1) * Math.cos(a1), RING_C + ext(a1) * Math.sin(a1)], [ri * Math.cos(a1), RING_C + ri * Math.sin(a1)]];
    const half = key ? 2.565 + 0.09 : 2.565;
    prism(T, poly, { y0: -half, y1: half, top: cb, bottom: cb, corner, dome: key ? 0.02 : 0.008, dropK: 1, m: rx, paint: stoneOf(j, 1, key || j % 3 === 0 ? 1 : 0) });
  }
  // --- spandrels: courses of face stones (a little inside the ring's faces) cut to the extrados, up to the deck
  const sp = 2.44, rCut = re + 0.012;
  for (const side of [-1, 1]) {
    let y = RING_C, c = 0;
    while (y < DECK - 0.35) {
      const hC = 0.56 + 0.12 * H(c, side), yt = Math.min(y + hC, DECK - 0.29 - 0.012);
      let x = side < 0 ? -10.44 : 10.44, k = 0;
      const xEnd = 0;
      while (side < 0 ? x < xEnd - 0.05 : x > xEnd + 0.05) {
        const L = (c + k) % 2 ? 1.05 + 0.5 * H(c, k + 9) : 1.45 + 0.45 * H(k, c + 5);
        let x0 = x, x1 = side < 0 ? Math.min(xEnd, x + L) : Math.max(xEnd, x - L);
        if (k === 0 && c % 2) x1 = side < 0 ? x0 + L * 0.55 : x0 - L * 0.55;      // bond: every other course starts with a half
        const lo = Math.min(x0, x1) + 0.006, hi = Math.max(x0, x1) - 0.006;
        const topY = Math.min(yt, deckY(Math.round(lo / 1.06)) - 0.3, deckY(Math.round(hi / 1.06)) - 0.3);
        let P = [[lo, y + 0.006], [hi, y + 0.006], [hi, topY - 0.006], [lo, topY - 0.006]];
        // cut by the extrados: keep the side away from the ring's centre (tangent at the stone's middle)
        const mx = (lo + hi) / 2, my = (y + topY) / 2 - RING_C, ml = Math.hypot(mx, my) || 1, u = [-mx / ml, -my / ml];
        // (p - centre)·w >= rCut with w = -u: the whole disc stays on the far side of that tangent
        if (ml < rCut + 1.2) P = clipPoly(P, u, -(rCut + RING_C * (my / ml)));
        if (P.length >= 3) {
          let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; }
          if (Math.abs(A) / 2 > 0.05) prism(T, P, { y0: -sp, y1: sp, top: cb * 0.8, bottom: cb * 0.8, corner: corner * 0.8, dome: 0.006, dropK: 1, m: rx, paint: stoneOf(c * 31 + side, k) });
        }
        x = x1; k++;
      }
      y = yt + 0.012; c++;
    }
  }
  // dark hearting behind the face stones (seen only through the joints)
  for (let j = 0; j < 23; j++) {
    const a = (Math.PI * (j + 0.5)) / 23, x = RING_R * Math.cos(a), y = RING_C + RING_R * Math.sin(a);
    const dz = Math.max(0, DECK - 0.32 - y - 0.2);
    if (dz > 0.08) block(T, 1.5, dz, 4.6, 0, painter(DARK), new THREE.Matrix4().makeTranslation(x, y + dz * 0.5 + 0.2, 0));
  }
  // --- piers: a plinth, coursed ashlar, an impost string course at the springing
  for (const s of [-1, 1]) {
    const xi = s * 10.45, xo = s * 14.75, cx = s * 12.6;
    block(T, 4.5, 1.2, 5.32, 0.04, stoneOf(s, 99, 2), new THREE.Matrix4().makeTranslation(cx, -0.4, 0));
    let y = 0.2, c = 0;
    const ch = fine ? 0.62 : 0.8;
    while (y < DECK - 0.3) {
      const top = Math.min(y + ch + 0.06 * H(c, s * 3), DECK - 0.29), h = top - y;
      if (Math.abs(y - RING_C) < ch * 0.6 && c > 0) {       // the impost: one long string course, proud of every face
        block(T, 4.46, 0.34, 5.28, 0.035, stoneOf(s, 77, 1), new THREE.Matrix4().makeTranslation(cx - s * 0.03, y + 0.17, 0));
        y += 0.352; c++; continue;
      }
      const n = c % 2 ? 3 : 2, cuts = [0];
      for (let k = 1; k < n; k++) cuts.push((k / n) + (H(c, k) - 0.5) * 0.18);
      cuts.push(1);
      for (let k = 0; k < n; k++) {
        const x0 = xi + (xo - xi) * cuts[k], x1 = xi + (xo - xi) * cuts[k + 1], w = Math.abs(x1 - x0) - 0.012;
        block(T, w, h - 0.012, 5.1, cb, stoneOf(c * 7 + s, k), new THREE.Matrix4().makeTranslation((x0 + x1) / 2, y + h / 2, 0), { dome: fine ? 0.012 : 0 });
      }
      y = top; c++;
    }
  }
  // --- deck coping, parapet stones with rounded copes, the approach steps
  for (let i = -13; i <= 13; i++) {
    const x = i * 1.06, y = deckY(i);
    block(T, 1.083, 0.28, 5.39, cb, stoneOf(i, 50, 1), new THREE.Matrix4().makeTranslation(x, y - 0.13, 0), { dome: 0.006 });
    for (const sd of [-1, 1]) {
      block(T, 1.073, 0.64, 0.32, cb * 0.8, stoneOf(i * 3 + sd, 60), new THREE.Matrix4().makeTranslation(x, y + 0.34, sd * 2.53));
      block(T, 1.076, 0.12, 0.44, 0.03, stoneOf(i * 5 + sd, 70, 1), new THREE.Matrix4().makeTranslation(x, y + 0.7, sd * 2.53), { dome: 0.035 });
    }
  }
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const u = s * (14.4 + i * 0.7), top = DECK - 0.07 - i * 0.085;
    block(T, 0.73, 0.4, 5.15, cb, stoneOf(s * 9 + i, 80, 1), new THREE.Matrix4().makeTranslation(u, top - 0.2, 0), { dome: 0.006 });
  }
  const m = new THREE.Mesh(T.geometry(), sculptVcMat(toon(0xcab99a, { surface: 'stone', look: { detail: 0.4, bump: 0.45, rim: 0.2, wrap: 0.3 } })));
  m.name = 'mill arch masonry'; m.castShadow = true; m.receiveShadow = true;
  site.add(m, 0, 0, 0);
  return T.tris;
}

function millArch(site) {
  const stone = mat.stone(0xbeaf94),
    coping = mat.stone(0xe1cdac),
    dark = mat.stone(0x8f877b);
  const group = new THREE.Group(),
    radius = 10.4,
    deck = 19.28,
    centre = 8.45;
  function block(x, y, z, w, h, d, material) {
    const b = box(w, h, d, material, x, y, z);
    group.add(b);
    return b;
  }
  for (let j = 0; j < 23; j++) {
    const a = (Math.PI * (j + 0.5)) / 23,
      x = radius * Math.cos(a),
      y = centre + radius * Math.sin(a);
    const key = block(x, y, 0, 1.69, 1.3, 5.13, j % 3 ? stone : coping);
    key.rotation.z = a - Math.PI * 0.5;
    const dz = Math.max(0, deck - 0.32 - y - 0.2);
    if (dz > 0.08) block(x, y + dz * 0.5 + 0.2, 0, 1.45, dz, 4.85, dark);
  }
  for (const s of [-1, 1]) {
    block(s * 12.6, (deck + 2.0) / 2, 0, 4.3, deck - 2.0, 5.1, stone);
  }
  for (let i = -13; i <= 13; i++) {
    const x = i * 1.06,
      y = deck + 0.2 * Math.cos((i * Math.PI) / 27);
    block(x, y - 0.13, 0, 1.095, 0.28, 5.39, coping);
    for (const s of [-1, 1]) {
      block(x, y + 0.34, s * 2.53, 1.085, 0.65, 0.32, stone);
      block(x, y + 0.7, s * 2.53, 1.085, 0.12, 0.44, coping);
    }
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const u = s * (14.4 + i * 0.7),
        top = deck - 0.07 - i * 0.085;
      block(u, top - 0.2, 0, 0.74, 0.4, 5.15, coping);
    }
  }
  site.add(group, 0, 0, 0);
}
function fracturedRock() {
  // Adjacent layers break along the same set of joints, giving a torn-up ledge a
  // long flat top and a few sharp ends instead of a row of round stones.
  const p = [],
    c = [];
  const ring = [
    [-1, -0.4],
    [-0.62, -0.95],
    [0.42, -0.85],
    [1, -0.33],
    [0.73, 0.69],
    [-0.22, 1],
    [-1, 0.42]
  ];
  const palette = [0x8d8876, 0xb7ae94, 0x9c9986, 0xa39c84, 0xc9ba9b, 0x989b81, 0xaeaf94];
  const color = new THREE.Color();
  function tri(a, b, d, tone) {
    p.push(...a, ...b, ...d);
    color.setHex(tone);
    for (let i = 0; i < 3; i++) c.push(color.r, color.g, color.b);
  }
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length,
      [x, z] = ring[i],
      [u, v] = ring[j];
    const a = [x, 0.7 + 0.11 * x - 0.115 * z, z],
      b = [u, 0.7 + 0.11 * u - 0.115 * v, v];
    const d = [x * 0.82, -0.46, z * 0.79],
      e = [u * 0.82, -0.46, v * 0.79];
    tri([0, 0.74, 0], b, a, 0xb3b79a);
    tri(a, b, d, palette[i]);
    tri(b, e, d, palette[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  geo.computeVertexNormals();
  return geo;
}
function shoreBeds() {
  const rand = mulberry32(88472),
    stones = [];
  for (const [t0, t1, count] of [
    [0.23, 1.39, 24],
    [2.16, 2.99, 20],
    [3.44, 4.5, 28],
    [4.8, 5.71, 24]
  ]) {
    for (let i = 0; i < count; i++) {
      const a = t0 + ((t1 - t0) * (i + rand() * 0.62)) / count,
        r = 0.8 + 0.24 * rand();
      const ux = Math.cos(a) * TRIAL_LAKE.rx,
        uz = Math.sin(a) * TRIAL_LAKE.rz;
      const d = trialShoreDistance(TRIAL_LAKE.x + ux, TRIAL_LAKE.z + uz);
      const x = TRIAL_LAKE.x + (ux * r) / d,
        z = TRIAL_LAKE.z + (uz * r) / d;
      if (G.world.roadDist(x, z) < 7.5) continue;
      stones.push({ x, z, a: -a - 0.7, sx: 3.1 + rand() * 4.0, sz: 1.7 + rand() * 3.4, h: 1.2 + rand() * 2.1 });
    }
  }
  if (G.sculpt?.enabled !== false && rockFamilyOn('shelf') && rockFamilyOn('ledge')) { familyBeds(stones); return; }
  const m = mat.stone(0xffffff).clone();
  m.vertexColors = true;
  const mesh = new THREE.InstancedMesh(fracturedRock(), m, stones.length);
  mesh.name = 'trial basin jointed shore ledges';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const o = new THREE.Object3D();
  function settle() {
    for (const [i, b] of stones.entries()) {
      o.position.set(b.x, G.world.heightAt(b.x, b.z) - 0.26, b.z);
      o.rotation.set(0, b.a, 0);
      o.scale.set(b.sx, b.h, b.sz);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  settle();
  G.scene.add(mesh);
  G.events.on('terrain:deformed', (e) => {
    if (e.kind === 'trialLake') settle();
  });
}
/**
 * The shore ledges as rock-family stones (world/rock-family.js): each old ledge becomes a broad bedded shelf (its
 * footprint and height) with a lower ledge stone stepping off one end toward the water; moss on both. Instanced: one
 * stone and one moss mesh per shape. They settle on the ground again when the lake fills or drains.
 */
function familyBeds(stones) {
  const q = G.quality || { name: 'high' }, lod = q.mobile || q.name === 'low' ? 2 : rockLod(false) + 1;
  const tint = linHex(0xaea58f), rnd = mulberry32(5521);
  const put = { shelf: [], ledge: [] };
  const steps = !q.mobile && q.name !== 'low';
  for (const b of stones) {
    const W = 2 * b.sx * 0.86, D = 2 * b.sz * 0.84, Hv = 0.74 * b.h - 0.26, k = 0.9 + 0.18 * rnd();
    const ca = Math.cos(b.a), sa = Math.sin(b.a), n = W > 6.5 ? 2 : 1;
    // a long ledge breaks into two beds along its length, the second a step lower
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * (W / n) * 1.02, Wi = (W / n) * 1.05;
      put.shelf.push({ x: b.x + ca * off, z: b.z - sa * off, a: b.a + (rnd() - 0.5) * 0.25, W: Wi, D: D * (0.85 + 0.25 * rnd()), Hv: Math.max(Hv, 0.17 * Wi) * (1 - 0.16 * i), k: k * (0.96 + 0.08 * rnd()) });
    }
    if (!steps) continue;
    // the step: off one end, lower, turned a little
    const sg = rnd() < 0.5 ? -1 : 1, off = W * (0.47 + 0.08 * rnd());
    put.ledge.push({ x: b.x + ca * off * sg, z: b.z - sa * off * sg, a: b.a + (rnd() - 0.5) * 0.9, W: Math.min(W * 0.36, 2.8), D: Math.min(D * 0.5, 2.4), Hv: Math.max(0.5, Hv * (0.5 + 0.2 * rnd())), k: k * (0.94 + 0.1 * rnd()) });
  }
  const mats = siteRockMats();
  const o = new THREE.Object3D(), col = new THREE.Color();
  const sets = [];
  for (const shape of ['shelf', 'ledge']) {
    const P = rockParts(shape, lod), list = put[shape];
    if (!P || !list.length) continue;
    const bw = P.box.max.x - P.box.min.x, bd = P.box.max.z - P.box.min.z, bh = P.box.max.y - Math.max(0, P.box.min.y);
    const meshes = [];
    for (const [g, m, isStone] of [[P.stone, mats.stone, true], [P.moss, mats.moss, false]]) {
      if (!g) continue;
      const mesh = new THREE.InstancedMesh(g, m, list.length);
      mesh.name = 'trial basin shore ' + shape + (isStone ? '' : ' moss');
      mesh.castShadow = isStone && !q.mobile; mesh.receiveShadow = true;
      if (isStone) list.forEach((b, i) => mesh.setColorAt(i, col.setRGB(tint[0] / NEUTRAL * b.k, tint[1] / NEUTRAL * b.k, tint[2] / NEUTRAL * b.k)));
      G.scene.add(mesh); meshes.push(mesh);
    }
    sets.push({ list, meshes, bw, bd, bh });
  }
  function settle() {
    for (const { list, meshes, bw, bd, bh } of sets) {
      list.forEach((b, i) => {
        const sink = 0.45;
        o.position.set(b.x, G.world.heightAt(b.x, b.z) - sink, b.z);
        o.rotation.set(0, b.a, 0);
        o.scale.set(b.W / bw, (b.Hv + sink) / bh, b.D / bd);
        o.updateMatrix();
        for (const m of meshes) m.setMatrixAt(i, o.matrix);
      });
      for (const m of meshes) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
    }
  }
  settle();
  G.events.on('terrain:deformed', (e) => {
    if (e.kind === 'trialLake') settle();
  });
}
export async function buildTrialBasin(ctx) {
  const site = new Site('millArch', 1876, -77);
  if (G.sculpt?.enabled !== false) millArchModelled(site); else millArch(site);
  archColliders(site);
  shoreBeds();
  await site.bakeSliced(ctx.step);
  ctx.place('millArch', { site, group: site.baked });
}
