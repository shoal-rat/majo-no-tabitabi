// Procedural flora models, built at boot (no model files): soft painted-card trees, bushes, ferns, flowers, sunflowers,
// reeds, sculpted rocks, giant mushrooms and crystal clusters. Each builder returns the same model shape as
// batches.buildModelParts: { parts: [{ geo, rule, map, side, mat }], height, box, crown } so placement, culling,
// colliders, burning and felling keep working. Sizes follow the original asset's bounding box when it exists, so the
// scatter scales and the collider radii stay as designed.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/util.js';
import { specimenTree } from './specimenTrees.js';
import { foliageAtlas, tileUV, TILE } from './atlas.js';
import { rockParts, rockLod, fitRock, NEUTRAL } from '../rock-family.js';

const DS = THREE.DoubleSide;
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const sat = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ geometry accumulator
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.card = []; this.leaf = []; this.mix = []; this.idx = []; this.nv = 0; }
  v(x, y, z, nx, ny, nz, col, u = 0, vv = 0, card = null, leaf = null, mix = 0) {
    this.p.push(x, y, z);
    const l = Math.hypot(nx, ny, nz) || 1;
    this.n.push(nx / l, ny / l, nz / l);
    if (typeof col === 'number') this.c.push(col, col, col); else this.c.push(col[0], col[1], col[2]);
    this.uv.push(u, vv);
    if (card) this.card.push(card[0], card[1], card[2], card[3]); else this.card.push(0, 0, 0, 0);
    if (leaf) this.leaf.push(leaf[0], leaf[1], leaf[2], leaf[3]); else this.leaf.push(0, 0, 0, 0);
    this.mix.push(mix);
    return this.nv++;
  }
  t(a, b, c) { this.idx.push(a, b, c); }
  q(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  build(o = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (o.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (o.card) g.setAttribute('aCard', new THREE.Float32BufferAttribute(this.card, 4));
    if (o.leaf) g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.leaf, 4));
    if (o.mix) g.setAttribute('aMix', new THREE.Float32BufferAttribute(this.mix, 1));
    g.setIndex(this.idx);
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ primitives
/** Tapered tube through points [{x,y,z,r}], `sides` around. shade(t, side) -> grey. */
function tube(gb, pts, sides, shade, mixFn) {
  const rings = [];
  let px = 1, py = 0, pz = 0; // reference perpendicular (parallel-transported)
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // perpendicular: remove tangent component from previous reference
    const d = px * tx + py * ty + pz * tz;
    px -= d * tx; py -= d * ty; pz -= d * tz;
    let pl = Math.hypot(px, py, pz);
    if (pl < 1e-3) { px = Math.abs(ty) < 0.9 ? 0 : 1; py = Math.abs(ty) < 0.9 ? 1 : 0; pz = 0; const d2 = px * tx + py * ty + pz * tz; px -= d2 * tx; py -= d2 * ty; pz -= d2 * tz; pl = Math.hypot(px, py, pz); }
    px /= pl; py /= pl; pz /= pl;
    const bx = ty * pz - tz * py, by = tz * px - tx * pz, bz = tx * py - ty * px;
    const ring = [];
    const t = i / (pts.length - 1);
    for (let s = 0; s <= sides; s++) {
      const an = (s / sides) * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
      const nx = px * ca + bx * sa, ny = py * ca + by * sa, nz = pz * ca + bz * sa;
      const r = pts[i].r;
      ring.push(gb.v(pts[i].x + nx * r, pts[i].y + ny * r, pts[i].z + nz * r, nx, ny * 0.8 + 0.1, nz, shade(t, s, ny), 0, 0, null, null, mixFn ? mixFn(t, ny) : 0));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let s = 0; s < sides; s++) gb.q(rings[i][s], rings[i + 1][s], rings[i + 1][s + 1], rings[i][s + 1]);
}
/** Curved limb from a to b (bend: upward bow), as point list with tapering radius. */
function limb(a, b, r0, r1, n, bow, rnd) {
  const pts = [];
  const wob = (rnd() - 0.5) * 0.5;
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(Math.PI * t);
    pts.push({ x: a.x + (b.x - a.x) * t + s * wob * bow, y: a.y + (b.y - a.y) * t + s * bow, z: a.z + (b.z - a.z) * t - s * wob * bow * 0.6, r: r0 + (r1 - r0) * t });
  }
  return pts;
}
/** Camera-facing card at c (size m). shade: grey or [r,g,b]. n: normal. leaf: [cx,cy,cz,phase]. */
function bill(gb, c, size, tile, n, shade, leaf, rnd, mix = 0) {
  const [u0, v0, u1, v1] = tileUV(tile);
  const broad = tile === TILE.broad;
  const halfHeight = broad ? 0.43 : 0.5;
  const flip = rnd() < 0.5, spin = (rnd() - 0.5) * (broad ? 0.94 : 1.4);
  const U0 = flip ? u1 : u0, U1 = flip ? u0 : u1;
  const a = gb.v(c[0], c[1], c[2], n[0], n[1], n[2], shade, U0, v0, [-0.5, -halfHeight, size, spin], leaf, mix);
  const b = gb.v(c[0], c[1], c[2], n[0], n[1], n[2], shade, U1, v0, [0.5, -halfHeight, size, spin], leaf, mix);
  const d = gb.v(c[0], c[1], c[2], n[0], n[1], n[2], shade, U1, v1, [0.5, halfHeight, size, spin], leaf, mix);
  const e = gb.v(c[0], c[1], c[2], n[0], n[1], n[2], shade, U0, v1, [-0.5, halfHeight, size, spin], leaf, mix);
  gb.q(a, b, d, e);
}
/** Fixed card: origin o, edge vectors eu (u0->u1), ev (v0->v1). nFn(u,v) -> normal, shFn(u,v) -> shade. */
function card(gb, o, eu, ev, tile, nFn, shFn, leaf, mixFn, segs = 1, droop = 0) {
  const [u0, v0, u1, v1] = tileUV(tile);
  const ids = [];
  for (let j = 0; j <= segs; j++) {
    const s = j / segs, dy = -droop * s * s;
    for (let i = 0; i <= 1; i++) {
      const x = o[0] + eu[0] * s + ev[0] * i, y = o[1] + eu[1] * s + ev[1] * i + dy, z = o[2] + eu[2] * s + ev[2] * i;
      const n = nFn(s, i);
      ids.push(gb.v(x, y, z, n[0], n[1], n[2], shFn(s, i), u0 + (u1 - u0) * s, v0 + (v1 - v0) * i, null, leaf, mixFn ? mixFn(s, i, n) : 0));
    }
  }
  for (let j = 0; j < segs; j++) gb.q(ids[j * 2], ids[j * 2 + 2], ids[j * 2 + 3], ids[j * 2 + 1]);
}

// ------------------------------------------------------------------ helpers
function assetBox(G, asset) {
  try {
    const o = G.assets?.model?.(asset);
    if (!o) return null;
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o);
    return b.isEmpty() ? null : b;
  } catch (e) { return null; }
}
function model(parts, crownBox) {
  const box = new THREE.Box3();
  for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  const cb = crownBox && !crownBox.isEmpty() ? crownBox : box;
  const cc = cb.getCenter(new THREE.Vector3()), cs = cb.getSize(new THREE.Vector3());
  const crown = { cx: cc.x, cy: cc.y, cz: cc.z, rx: cs.x / 2, ry: cs.y / 2, rz: cs.z / 2 };
  // revision: crown-card parts carry their crown volume in their own material options, so every user of the model
  // (the forest batches and the site trees of decor.js realizeTrees, which spreads p.mat) gets the crown shading;
  // without it the shrine cherries kept flat per-card shade and their deep cards went navy.
  for (const p of parts) if (p.mat && p.mat.bill && p.mat.leaf) { p.mat.crownC = [crown.cx, crown.cy, crown.cz]; p.mat.crownR = [crown.rx, crown.ry, crown.rz]; }
  return { parts, height: Math.max(0.3, box.max.y), box, crown };
}
const barkShade = (base) => (t, s) => { const k = (0.78 + 0.22 * t) * (s % 2 ? 0.93 : 1.0); return [base[0] * k, base[1] * k, base[2] * k]; };
const LEAF_LOOK = { trans: 0.75, rim: 0.28, wrap: 0.55 };
// revision: blossom shade stays a deeper dusty rose / mauve. With the full land shadow colour (clear blue in the meadow)
// a pink crown's shaded clumps went navy; blossom takes less of it and its core is a warm mauve, not the leaves' cool green-blue.
const BLOSSOM_LOOK = { trans: 0.75, rim: 0.28, wrap: 0.6, shadowTint: 0.2 };
const BLOSSOM_CORE = [1.08, 0.62, 0.56]; // warm on purpose: the sky fill in the core is blue, the two meet at mauve

// ------------------------------------------------------------------ trees
/**
 * Broad-crowned tree: trunk + limbs to clump centres + camera-facing leaf cards around each clump.
 * P: { H, R (crown radius), crownY (fraction), shape: 'dome'|'oval'|'umbrella'|'cone', clumps, cards, tile, trunkR, bark,
 *      split, lean, willow, snow, dead }
 */
function broadTree(P, seed) {
  if(P.species) return specimenTree(P,seed,{GB,tube,bill,barkShade,model});
  const rnd = mulberry32(seed);
  const H = P.H, R = P.R;
  const cy = H * (P.crownY ?? 0.62), ry = (H - cy) * (P.ryK ?? 0.95);
  const trunk = new GB(), crown = new GB();
  const bark = P.bark || lin(0x6a4a38);
  const tr = P.trunkR;
  // trunk with root flare and a gentle S curve
  const lx = (rnd() - 0.5) * H * 0.08 + (P.lean || 0) * H, lz = (rnd() - 0.5) * H * 0.08;
  const tTop = cy - ry * 0.25;
  const tp = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const flare = 1 + 0.55 * Math.pow(1 - t, 4);
    tp.push({ x: lx * t * t + Math.sin(t * 3.1) * tr * 0.4, y: tTop * t - 0.1, z: lz * t * t, r: tr * (1 - 0.5 * t) * flare });
  }
  tube(trunk, tp, 7, barkShade(bark));
  // roots
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * 6.283 + rnd() * 0.8;
    tube(trunk, limb({ x: 0, y: tr * 0.9, z: 0 }, { x: Math.cos(a) * tr * 2.6, y: -0.15, z: Math.sin(a) * tr * 2.6 }, tr * 0.45, tr * 0.12, 1, -tr * 0.2, rnd), 3, barkShade(bark));
  }
  // clump centres on the crown shell
  const nc = P.clumps || 12;
  const bloom = P.tile === TILE.blossom;
  const clumps = [];
  for (let i = 0; i < nc; i++) {
    const t = (i + 0.5) / nc;
    let yN = P.shape === 'umbrella' ? (bloom ? -0.05 + 0.85 * t : 0.15 + 0.5 * t) : P.shape === 'cone' ? -0.75 + 1.6 * t : -0.55 + 1.35 * t; // -1..1 within crown
    yN = Math.min(0.95, yN);
    const rr = Math.sqrt(Math.max(0.05, 1 - yN * yN)) * (P.shape === 'cone' ? (1 - (yN + 1) * 0.42) : 1);
    const a = i * 2.39996 + rnd() * 0.5;
    // revision: blossom crowns alternate lobes that stand out and lobes that sit back, so the outline is a few round
    // bulges instead of one box-shaped pink cloud
    const rk = bloom ? (i % 3 === 0 ? 0.88 + 0.12 * rnd() : 0.5 + 0.22 * rnd()) : 0.62 + 0.3 * rnd();
    const branchReach = P.tile === TILE.broad ? 1 + 0.21*Math.sin(a*2.0+1.4) + 0.15*Math.cos(a*3.0) : 1;
    const branchRise = P.tile === TILE.broad ? 0.22 * ry * Math.sin(a*2.0-0.8) * (1-t) : 0;
    clumps.push({ x: lx + Math.cos(a) * R * rr * rk * branchReach, y: cy + yN * ry * 0.85 + branchRise, z: lz + Math.sin(a) * R * rr * rk * branchReach, r: R * (P.clumpK || 0.42) * (0.8 + rnd() * 0.4), hv: (rnd() - 0.5) * 0.3, ph: rnd() });
  }
  if (!P.dead) clumps.push({ x: lx, y: cy + ry * 0.25, z: lz, r: R * 0.55, hv: 0, ph: rnd() }); // fill the core
  // limbs to the clumps
  for (const c of clumps) {
    const st = 0.55 + 0.4 * rnd();
    const a = { x: lx * st * st, y: tTop * st, z: lz * st * st };
    const b = { x: a.x + (c.x - a.x) * 0.8, y: a.y + (c.y - a.y) * 0.8, z: a.z + (c.z - a.z) * 0.8 };
    if (Math.hypot(b.x - a.x, b.z - a.z) < tr * 1.2 && !P.dead) continue;
    tube(trunk, limb(a, b, tr * 0.42, tr * 0.1, 2, R * 0.12, rnd), 4, barkShade(bark));
    if (bloom) {
      // One slender flowering twig continues beyond the fork under each canopy tier.
      const tip = { x: c.x + (c.x - a.x)*0.14, y:c.y - R*.08, z:c.z+(c.z-a.z)*.14 };
      tube(trunk,limb(b,tip,tr*.12,tr*.023,3,R*.11,rnd),4,barkShade(bark));
    }
    if (P.dead) { // twigs
      for (let k = 0; k < 2; k++) {
        const d = { x: b.x + (rnd() - 0.5) * R * 0.6, y: b.y + rnd() * R * 0.4, z: b.z + (rnd() - 0.5) * R * 0.6 };
        tube(trunk, limb(b, d, tr * 0.1, tr * 0.03, 2, R * 0.05, rnd), 3, barkShade(bark));
      }
    }
  }
  const parts = [];
  const crownBox = new THREE.Box3();
  if (!P.dead) {
    const C = [lx, cy, lz];
    for (const c of clumps) {
      const n = Math.max(3, Math.round((P.cards || 9) * 0.78 * (c.r / (R * 0.42)))); // look round: fewer, larger cards
      for (let k = 0; k < n; k++) {
        // point in the clump, flattened at the bottom
        let ox, oy, oz;
        do { ox = rnd() * 2 - 1; oy = rnd() * 2 - 1; oz = rnd() * 2 - 1; } while (ox * ox + oy * oy + oz * oz > 1);
        const p = [c.x + ox * c.r * 0.8, c.y + oy * c.r * (bloom ? 0.72 : P.tile === TILE.broad ? 0.47 : 0.55), c.z + oz * c.r * 0.8];
        const dx = (p[0] - C[0]) / R, dy = (p[1] - C[1]) / Math.max(0.5, ry), dz = (p[2] - C[2]) / R;
        const dl = Math.hypot(dx, dy, dz) || 1;
        const cn = [ox, oy, oz];
        const nn = [dx / dl * 0.8 + cn[0] * 0.3, dy / dl * 0.8 + cn[1] * 0.3 + 0.18, dz / dl * 0.8 + cn[2] * 0.3];
        const out = sat(dl), up = dy / dl * 0.5 + 0.5;
        const ao = 0.45 + 0.55 * sstep(0.1, 0.95, out) * (0.62 + 0.38 * up);
        const shade = [ao * (1 + c.hv), ao, ao * (1 - c.hv * 0.8)];
        const snow = P.snow ? sstep(0.55, 0.85, nn[1] / Math.hypot(...nn) + (rnd() - 0.5) * 0.3) : 0;
        bill(crown, p, c.r * (P.cardK || 1.32) * 1.12 * (0.8 + rnd() * 0.45), P.tile, nn, shade, [c.x, c.y, c.z, c.ph], rnd, snow);
        crownBox.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
      }
    }
    if (P.willow) { // hanging strands round the rim
      const ns = P.willow;
      for (let k = 0; k < ns; k++) {
        const a = (k / ns) * 6.283 + rnd() * 0.3, rr = R * (0.65 + rnd() * 0.3);
        const x = lx + Math.cos(a) * rr, z = lz + Math.sin(a) * rr, y = cy + ry * (0.1 + rnd() * 0.3);
        const L = H * (0.45 + rnd() * 0.2), w = 1.0 + rnd() * 0.5;
        const tx = -Math.sin(a) * w, tz = Math.cos(a) * w;
        const nrm = [Math.cos(a), 0.15, Math.sin(a)];
        card(crown, [x - tx / 2, y - L, z - tz / 2], [tx, 0, tz], [0, L, 0], TILE.willow, () => nrm, (s, i) => 0.6 + 0.35 * i, [x, y, z, rnd()]);
      }
      // the willow card u runs along the strand: swap so the strand hangs (tile drawn top-down)
    }
  }
  // revision: limbs seen through a blossom crown stay warm plum, not navy (less of the blue land shadow colour)
  parts.push({ geo: trunk.build(), rule: { mode: 'mul' }, side: THREE.FrontSide, mat: { surface: 'bark', look: bloom ? { shadowTint: 0.25 } : undefined } });
  if (!P.dead) {
    parts.push({
      geo: crown.build({ uv: true, card: true, leaf: true, mix: !!P.snow }), rule: { mode: 'tint', crown: true, glow: 1.3, tip: [0.45, 0.98] },
      map: foliageAtlas(), side: DS,
      mat: { leaf: true, bill: true, tex: true, paintedCrown: P.tile === TILE.broad, look: bloom ? BLOSSOM_LOOK : LEAF_LOOK, glowFloor: 0.12, mix: P.snow ? [0.95, 0.97, 1.0, 0] : null, core: bloom ? BLOSSOM_CORE : null, fill: bloom ? 0.3 : 0 },
    });
  }
  return model(parts, P.dead ? null : crownBox);
}

/** A tapered leader with branching, drooping sprays, seen edge-on from the trail and from above on a broom. */
function conifer(P, seed) {
  const rnd = mulberry32(seed), H = P.H, R = Math.max(P.R, H * .19);
  const trunk = new GB(), crown = new GB(), closeNeedles=new GB(), crownBox = new THREE.Box3();
  const bark = barkShade(P.bark || lin(0x665344)), bend = (rnd() - .5) * .48 * R;
  const centre = t => [bend * t + .06 * R * Math.sin(t * 6), H * t, .065 * R * Math.sin(t * 3.8)];
  const points = [0,.23,.48,.73,.997].map((t,i) => {
    const [x,y,z] = centre(t);
    return {x,y:i===0 ? -.48 : y,z,r:P.trunkR * [1.17,.77,.51,.26,.025][i]};
  });
  tube(trunk, points, 7, bark);
  const count = P.tiers || 7, phase = rnd() * Math.PI * 2;
  const pine=P.tile===TILE.needle;
  if(pine) {
    // The lower whorl loses needles first. Weathered forks below the live crown give the trunk scale.
    for(let j=0;j<3;j++){
      const a=phase+j*2.52, dx=Math.cos(a), dz=Math.sin(a), base=centre(.15+j*.047);
      const len=R*(.49+j*.08);
      const elbow={x:base[0]+dx*len*.65,y:base[1]+len*.14,z:base[2]+dz*len*.65,r:P.trunkR*.16};
      const end={x:base[0]+dx*len,y:base[1]+len*.37,z:base[2]+dz*len,r:P.trunkR*.045};
      tube(trunk,[{x:base[0],y:base[1],z:base[2],r:P.trunkR*.31},elbow,end],4,bark);
      tube(trunk,[elbow,{x:elbow.x+(dx-dz)*len*.24,y:elbow.y+len*.22,z:elbow.z+(dz+dx)*len*.24,r:.008}],3,bark);
    }
  }
  for (let i = 0; i < count; i++) {
    const v = i / (count - 1), progress = (i + .5) / count;
    const height = .22 + .74 * progress, branchCount = Math.round(7 - 3 * v);
    const crownWidth = R * (.15 + .96 * Math.pow(1 - v, .68));
    for (let j = 0; j < branchCount; j++) {
      const a = phase + i * 2.4 + (j + (rnd() - .5) * .32) * 2 * Math.PI / branchCount;
      const dx = Math.cos(a), dz = Math.sin(a), tx = -dz, tz = dx;
      const t = height + (rnd() - .5) * .105, c = centre(t);
      const aspect=pine ? 1.13+.22*Math.cos(a-phase-.55)+.16*Math.sin(2*a+i*.7) : 1;
      const length = crownWidth * aspect*(.83 + rnd() * .32), crooked = (rnd() - .5) * length * .28;
      const b = [c[0] + dx * length * .65 + tx * crooked, c[1] + length * (.02 + rnd() * .12), c[2] + dz * length * .65 + tz * crooked];
      if (i % 2 === 0 && i < count - 1) tube(trunk, limb({x:c[0], y:c[1], z:c[2]},{x:b[0], y:b[1], z:b[2]},P.trunkR*.22*(1-.55*v),.012,2,-.065*length,rnd),4,bark);
      const leaf = [b[0],b[1],b[2],rnd()];
      const upright = H * (.132 - .048*v);
      const woodY = c[1];
      const droop = length * (.17 + .1*rnd());
      const brRise = H * (.015 + .032*v) + length*.10;
      const hue = .77 + .09*rnd() + .10*v;
      function frond(start, vector, cross, thickness, outer, sections, target=crown) {
        const edge=[start[0]-cross[0]/2,start[1]-cross[1]/2,start[2]-cross[2]/2];
        card(target,edge,vector,cross,P.tile,
          u=>[dx*(.26+.45*u)+tx*outer*.12,.63+v*.22,dz*(.26+.45*u)+tz*outer*.12],
          u=>[hue*(.88+.17*u+.06*outer),hue*(1.0+.13*u),hue*(1.08-.10*u-.07*outer)],leaf,
          P.snow ? u=>.35+.54*u : null,sections,thickness);
      }
      // A shaded mass stays behind the sprays when their fine ends turn edge-on. Its
      // top and side share a folded ridge; the patch samples the opaque basal needles.
      if (i + 1 < count) {
        const uv=tileUV(P.tile), u=uv[0]+(uv[2]-uv[0])*.36, vv=uv[1]+(uv[3]-uv[1])*.49;
        // Open the inward face against the trunk: three connected faces support
        // both the profile and the view from above at the same branch tip.
        const fold=[[.13,-.05,.012],[.70,-.22,-.14],[.80,.14,-.13],[.29,.22,-.057],[.45,.015,.15]];
        const verts=fold.map(([along,offset,level],idx)=>{
          const stretch=length*(.89+.12*rnd()), top=idx===4;
          const shade=top ? [.78,.99,.93] : [.62,.83,.91];
          return crown.v(c[0]+dx*along*stretch+tx*offset*length,woodY+level*length+brRise*along,
            c[2]+dz*along*stretch+tz*offset*length,dx*(top ? .18 : .65)+tx*offset,
            top ? .96 : .43,dz*(top ? .18 : .65)+tz*offset,shade,u,vv,null,leaf,P.snow ? (top ? .72 : .24) : 0);
        });
        for(let k=0;k<3;k++) crown.t(verts[k+1],verts[k],verts[4]);
      }
      // One long drooping leader and two shorter lateral sprays. All three attach on the
      // same branch axis, at different heights and inclinations, as seen from the trail or above.
      frond([c[0],woodY,c[2]],[dx*length+tx*crooked,brRise+droop*.24,dz*length+tz*crooked],
        [tx*length*1.22,upright*.58,tz*length*1.22],droop,.3,2);
      for(const side of [-1,1]) {
        const t0=.18+.25*rnd(), spread=.33+.20*rnd(), reach=.48+.22*rnd();
        const root=[c[0]+dx*length*t0,woodY+brRise*t0+.065*H*(1-.72*v),c[2]+dz*length*t0];
        const outX=dx*reach+tx*spread*side, outZ=dz*reach+tz*spread*side;
        const crossScale=length*(.68+.16*rnd());
        frond(root,[outX*length,-upright*(.53+.45*rnd()),outZ*length],
          [-outZ*crossScale,side*upright*.45,outX*crossScale],droop*.47,side*.4,1);
      }
      if(pine && j%2===i%2) {
        const end=[b[0]+dx*length*.035,b[1]-.03*length,b[2]+dz*length*.035];
        // Last year's flattened pad turns up into two shorter terminal sprays with light between them.
        for(const side of [-1,1]){
          const sideX=dx*.34+tx*.20*side,sideZ=dz*.34+tz*.20*side;
          frond(end,[sideX*length,length*(.16+.10*v),sideZ*length],[-sideZ*length*.65,length*.08,sideX*length*.65],length*.04,side*.36,1,closeNeedles);
        }
      }
      crownBox.expandByPoint(new THREE.Vector3(b[0]+dx*length*.50,c[1]-upright*.6,b[2]+dz*length*.50));
    }
  }
  const tip=centre(.98);
  for (let k=0;k<3;k++) {
    const a=k*Math.PI/3,w=R*.38,dx=Math.cos(a)*w,dz=Math.sin(a)*w;
    card(crown,[tip[0]-dx/2,H*.88,tip[2]-dz/2],[0,H*.125,0],[dx,0,dz],P.tile,()=>[0,1,0],()=>.83,[...tip,rnd()]);
  }
  crownBox.expandByPoint(new THREE.Vector3(tip[0],H*1.01,tip[2]));
  const tree=model([
    {geo:trunk.build(),rule:{mode:'mul'},side:THREE.FrontSide,mat:{surface:'bark'}},
    {geo:crown.build({uv:true,leaf:true,mix:!!P.snow}),rule:{mode:'tint',crown:true,glow:.48,tip:[.6,1]},
      map:foliageAtlas(),side:DS,mat:{leaf:true,tex:true,paintedCrown:true,look:{trans:.24,rim:.04,wrap:.57},glowFloor:.035,mix:P.snow?[.95,.97,1,0]:null}}
  ], crownBox);
  if(closeNeedles.nv)tree.closeParts=[{...tree.parts[1],geo:closeNeedles.build({uv:true,leaf:true,mix:!!P.snow})}];
  return tree;
}

/** Bamboo clump: segmented culms leaning outwards, leaf sprays near the tops. */
function bamboo(P, seed) {
  const rnd = mulberry32(seed);
  const H = P.H, culm = new GB(), leaves = new GB();
  const n = P.culms || 7;
  const crownBox = new THREE.Box3();
  // round 3: culms with real nodes (a swollen dark ring + a pale band just above), thin branches from the upper nodes,
  // and many SMALL layered leaf sprays (0.5-0.9 m cards painted with ~13 cm lance leaves) instead of 2 m cards.
  for (let k = 0; k < n; k++) {
    const a = rnd() * 6.283, r0 = rnd() * P.R * 0.35;
    const h = H * (0.75 + rnd() * 0.25), lean = 0.08 + rnd() * 0.14;
    const bx = Math.cos(a) * r0, bz = Math.sin(a) * r0;
    const tx = bx + Math.cos(a) * h * lean, tz = bz + Math.sin(a) * h * lean;
    const r = 0.06 + rnd() * 0.05;
    const at = (t) => [bx + (tx - bx) * t * t, h * t, bz + (tz - bz) * t * t];
    const segs = 8, pts = [], ksh = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, rr = r * (1 - 0.45 * t);
      const p = at(t);
      // node ring (swollen, dark), then a pale band 3 cm above it, then the internode
      pts.push({ x: p[0], y: p[1], z: p[2], r: rr * (i === 0 ? 1.15 : 1.13) }); ksh.push(0.55);
      if (i < segs) { const q = at(t + 0.035 / h); pts.push({ x: q[0], y: q[1], z: q[2], r: rr * 1.02 }); ksh.push(1.12); }
    }
    const nP = pts.length - 1;
    tube(culm, pts, 4, (t, s) => { const i = Math.round(t * nP); const k2 = (0.78 + 0.25 * t) * ksh[i] * (s % 2 ? 0.95 : 1); return [k2 * 1.08, k2 * 1.22, k2 * 0.7]; });
    // branches from the upper nodes, alternating sides, each ending in 2 crossed sprays (+1 midway on long ones)
    const ph = rnd();
    for (let i = 3; i < segs; i++) {
      const t = i / segs;
      const p = at(t);
      for (let side = 0; side < (i > 5 ? 2 : 1); side++) {
        const b = a + (i % 2 ? 1 : -1) * (0.9 + side * 2.2) + (rnd() - 0.5) * 0.8;
        const cb = Math.cos(b), sb = Math.sin(b);
        const bl = (0.5 + rnd() * 0.5) * (1.1 - t * 0.4);
        const e = [p[0] + cb * bl, p[1] + bl * 0.45, p[2] + sb * bl];
        tube(culm, [{ x: p[0], y: p[1], z: p[2], r: r * 0.22 }, { x: e[0], y: e[1], z: e[2], r: r * 0.08 }], 3, () => [0.62, 0.7, 0.42]);
        const sprays = bl > 0.75 ? [0.55, 1] : [1];
        for (const f of sprays) {
          const sx = p[0] + (e[0] - p[0]) * f, sy = p[1] + (e[1] - p[1]) * f, sz = p[2] + (e[2] - p[2]) * f;
          const L = 0.55 + rnd() * 0.35;
          const sh = [0.62 + 0.3 * t, 0.76 + 0.28 * t, 0.62 + 0.2 * t];
          for (let c2 = 0; c2 < 2; c2++) {
            const bb = b + (c2 ? 1.1 : -0.35) + (rnd() - 0.5) * 0.4, cc = Math.cos(bb), ss = Math.sin(bb);
            card(leaves, [sx - cc * L * 0.25, sy + 0.06 - L * 0.62, sz - ss * L * 0.25], [cc * L, -0.08, ss * L], [0, L * 0.62, 0], TILE.bamboo,
              () => [cb * 0.8 + cc * 0.3, 0.55, sb * 0.8 + ss * 0.3], () => sh, [sx, sy, sz, (ph + rnd() * 0.3) % 1], null, 1, 0.12);
          }
          crownBox.expandByPoint(new THREE.Vector3(sx + cb * L, sy, sz + sb * L));
        }
      }
    }
    // a top tuft
    const tp = at(1);
    for (let c2 = 0; c2 < 2; c2++) {
      const bb = a + c2 * 1.6, cc = Math.cos(bb), ss = Math.sin(bb), L = 0.7;
      card(leaves, [tp[0] - cc * L * 0.5, tp[1] - L * 0.5, tp[2] - ss * L * 0.5], [cc * L, 0, ss * L], [0, L * 0.62, 0], TILE.bamboo, () => [cc * 0.3, 0.9, ss * 0.3], () => [0.95, 1.05, 0.85], [tp[0], tp[1], tp[2], ph], null, 1, 0.1);
    }
    crownBox.expandByPoint(new THREE.Vector3(tp[0], tp[1], tp[2]));
  }
  return model([
    { geo: culm.build(), rule: { mode: 'tint', crown: false }, side: THREE.FrontSide, mat: { surface: 'none', look: { rim: 0.3, spec: 0.25, specPower: 30 } } },
    { geo: leaves.build({ uv: true, leaf: true }), rule: { mode: 'tint', crown: false }, map: foliageAtlas(), side: DS, mat: { leaf: true, tex: true, look: LEAF_LOOK } },
  ], crownBox);
}

/**
 * Round 3: gnarled driftwood tree for 暗潮岸 / 星晶野 (replaces the stick-like dead trees there): a wind-swept, twisting
 * trunk with knots, arching exposed roots, crooked forked limbs, and hanging moss strands whose tips glow (instance glow).
 */
function driftwood(P, seed) {
  const rnd = mulberry32(seed);
  const H = P.H, R = P.R, tr = P.trunkR;
  const wood = new GB(), moss = new GB();
  const bark = P.bark || lin(0x8c8780);
  const sh = (t, s) => { const k = (0.66 + 0.34 * t) * (s % 3 === 0 ? 0.72 : s % 2 ? 0.92 : 1.04); return [bark[0] * k, bark[1] * k, bark[2] * k]; };
  const la = rnd() * 6.283, lean = H * (0.18 + rnd() * 0.12);
  const lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
  const tp = [];
  const top = H * 0.62;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, w = Math.sin(t * 5.5 + rnd()) * tr * 0.7;
    const knot = 1 + (rnd() < 0.3 ? 0.22 : 0) + 0.7 * Math.pow(1 - t, 5);
    tp.push({ x: lx * t * t + w * Math.sin(la + 1.6), y: top * t - 0.15, z: lz * t * t + w * Math.cos(la + 1.6), r: tr * (1 - 0.55 * t) * knot });
  }
  tube(wood, tp, 7, sh);
  // arching roots
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * 6.283 + rnd() * 0.7, L = tr * (3 + rnd() * 2.5);
    tube(wood, limb({ x: 0, y: tr * 1.4, z: 0 }, { x: Math.cos(a) * L, y: -0.2, z: Math.sin(a) * L }, tr * 0.5, tr * 0.1, 3, tr * 0.6, rnd), 4, sh);
  }
  // crooked limbs: 2-3 joints each, a fork at the second joint; moss hangs from the joints
  const hang = [];
  const nl = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < nl; k++) {
    const st = 0.45 + 0.5 * (k / nl) + rnd() * 0.05;
    const i0 = Math.min(8, Math.round(st * 8));
    let p = { x: tp[i0].x, y: tp[i0].y, z: tp[i0].z };
    let a = la + (k / nl) * 6.283 * 0.8 + (rnd() - 0.5) * 1.2, rr = tr * (0.5 - 0.15 * st);
    const pts = [{ ...p, r: rr }];
    for (let j = 0; j < 3; j++) {
      a += (rnd() - 0.5) * 1.4;
      const L = R * (0.32 + rnd() * 0.18) * (1 - j * 0.2);
      p = { x: p.x + Math.cos(a) * L, y: p.y + L * (0.15 + rnd() * 0.5) - j * 0.1, z: p.z + Math.sin(a) * L };
      rr *= 0.62;
      pts.push({ ...p, r: rr });
      hang.push({ ...p, a });
      if (j === 1) { // fork
        const b = a + (rnd() < 0.5 ? 1 : -1) * (0.7 + rnd() * 0.5), L2 = L * 0.8;
        const q = { x: p.x + Math.cos(b) * L2, y: p.y + L2 * 0.5, z: p.z + Math.sin(b) * L2 };
        tube(wood, limb(p, q, rr * 0.7, rr * 0.2, 2, L2 * 0.1, rnd), 3, sh);
        hang.push({ ...q, a: b });
      }
    }
    tube(wood, pts, 4, sh);
  }
  // hanging moss strands (willow strand tile): 1-2 per joint, length 0.6-1.8 m, tips glow
  const crownBox = new THREE.Box3();
  for (const h of hang) {
    for (let m = 0; m < 1 + (rnd() < 0.6 ? 1 : 0); m++) {
      const L = Math.min(h.y - 0.3, 0.5 + rnd() * 1.0), w = 0.16 + rnd() * 0.2;
      if (L < 0.3) continue;
      const b = h.a + 1.57 + (rnd() - 0.5) * 1.2, tx = Math.cos(b) * w, tz = Math.sin(b) * w;
      const nrm = [Math.cos(h.a), 0.2, Math.sin(h.a)];
      card(moss, [h.x - tx / 2, h.y - L + 0.05, h.z - tz / 2], [tx, 0, tz], [0, L, 0], TILE.willow, () => nrm, (s, i) => 0.5 + 0.4 * i, [h.x, h.y, h.z, rnd()]);
      crownBox.expandByPoint(new THREE.Vector3(h.x, h.y, h.z)); crownBox.expandByPoint(new THREE.Vector3(h.x, h.y - L, h.z));
    }
  }
  return model([
    { geo: wood.build(), rule: { mode: 'mul' }, side: THREE.FrontSide, mat: { surface: 'bark' } },
    { geo: moss.build({ uv: true, leaf: true }), rule: { mode: 'tint', crown: true, glow: 1.0 }, map: foliageAtlas(), side: DS,
      mat: { leaf: true, tex: true, look: { trans: 0.4, rim: 0.15, wrap: 0.5 } } },
  ], crownBox);
}

// ------------------------------------------------------------------ plants
function bush(P, seed) {
  const rnd = mulberry32(seed);
  const gb = new GB();
  const R = P.R, H = P.H;
  const nc = P.clumps || 6;
  const C = [0, H * 0.45, 0];
  for (let i = 0; i < nc; i++) {
    const a = i * 2.39996 + rnd(), rr = R * 0.5 * Math.sqrt((i + 0.5) / nc);
    const c = [Math.cos(a) * rr, H * (0.35 + 0.3 * rnd()), Math.sin(a) * rr];
    const cr = R * 0.5, ph = rnd(), hv = (rnd() - 0.5) * 0.12;
    for (let k = 0; k < (P.cards || 5); k++) {
      const p = [c[0] + (rnd() - 0.5) * cr, Math.max(H * 0.25, c[1] + (rnd() - 0.4) * cr * 0.6), c[2] + (rnd() - 0.5) * cr];
      const d = [p[0] - C[0], (p[1] - C[1]) * 1.6 + 0.2, p[2] - C[2]];
      const up = sat(p[1] / H);
      const ao = 0.6 + 0.4 * up;
      bill(gb, p, cr * 1.3 * (0.8 + rnd() * 0.4), P.tile ?? TILE.bush, d, [ao * (1 + hv), ao, ao * (1 - hv)], [c[0], c[1], c[2], ph], rnd, P.snow ? sstep(0.5, 0.9, up) : 0);
    }
  }
  const parts = [{ geo: gb.build({ uv: true, card: true, leaf: true, mix: !!P.snow }), rule: { mode: 'tint', glow: 0.8, tip: [0.45, 1.0] }, map: foliageAtlas(), side: DS,
    mat: { leaf: true, bill: true, tex: true, look: LEAF_LOOK, mix: P.snow ? [0.95, 0.97, 1, 0] : null } }];
  if (P.berries) {
    const bg = new GB();
    for (let k = 0; k < P.berries; k++) {
      const a = rnd() * 6.283, rr = R * (0.3 + rnd() * 0.45), y = H * (0.3 + rnd() * 0.5);
      bill(bg, [Math.cos(a) * rr, y, Math.sin(a) * rr], 0.22, TILE.blossom, [Math.cos(a), 0.5, Math.sin(a)], 1, null, rnd);
    }
    parts.push({ geo: bg.build({ uv: true, card: true }), rule: { mode: 'mul', base: 0xc8303a }, map: foliageAtlas(), side: DS, mat: { bill: true, tex: true, col2: lin(0x8a1a22) } });
  }
  return model(parts);
}
function fern(P, seed) {
  const rnd = mulberry32(seed);
  const gb = new GB();
  const n = P.fronds || 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 6.283 + rnd() * 0.4, ca = Math.cos(a), sa = Math.sin(a);
    const L = P.L * (0.75 + rnd() * 0.35), w = L * 0.45, rise = L * (0.35 + rnd() * 0.3);
    card(gb, [-sa * w / 2, 0.05, ca * w / 2], [ca * L, rise, sa * L], [sa * w, 0, -ca * w], TILE.fern, (s) => [ca * s * 0.6, 1, sa * s * 0.6], (s) => 0.6 + 0.4 * s, [ca * L * 0.5, rise, sa * L * 0.5, rnd()], null, 3, L * 0.55);
  }
  return model([{ geo: gb.build({ uv: true, leaf: true }), rule: { mode: 'tint', glow: 0.8, tip: [0.3, 1.0] }, map: foliageAtlas(), side: DS, mat: { leaf: true, tex: true, look: LEAF_LOOK, col2: lin(0x4f7a32) } }]);
}
/** Crossed vertical cards (wild flowers, reeds). */
function crossed(P, seed) {
  const rnd = mulberry32(seed);
  const gb = new GB();
  const n = P.n || 3;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI + rnd() * 0.3, ca = Math.cos(a), sa = Math.sin(a);
    const w = P.W * (0.85 + rnd() * 0.3), h = P.H * (0.85 + rnd() * 0.25);
    const ox = (rnd() - 0.5) * P.W * 0.3, oz = (rnd() - 0.5) * P.W * 0.3;
    card(gb, [ox - ca * w / 2, 0, oz - sa * w / 2], [0, h, 0], [ca * w, 0, sa * w], P.tile, (s) => [sa * 0.3, 1, -ca * 0.3], (s) => 0.65 + 0.35 * s, [ox, h, oz, rnd()]);
  }
  // the tile is drawn bottom (v0 -> u... ) : card() maps u along eu (height) and v along ev (width) -> rotate uv
  const g = gb.build({ uv: true, leaf: true });
  rotUV(g, P.tile);
  return model([{ geo: g, rule: { mode: 'tint', glow: P.glow ?? 1, tip: null }, map: foliageAtlas(), side: DS, mat: { leaf: true, tex: true, look: LEAF_LOOK, col2: P.col2 || lin(0x5f9a3a) } }]);
}
/**
 * Round 3: floating pad (lily / lotus leaf). A disc with a V notch (lily) or whole and cupped (lotus), radial veins,
 * a slightly raised rim with a lighter edge, sun-bleached centre. Vertex colour only (no texture), baked green ('mul').
 */
function pad(gb, cx, cz, R, rot, o, rnd) {
  const seg = 28, rings = 3, notch = o.notch ? 0.32 : 0;
  const base = o.col || lin(0x4f9a52), y0 = o.y || 0.02;
  const ids = [];
  const c = gb.v(cx, y0 + (o.cup || 0) * -0.3 * R, cz, 0, 1, 0, [base[0] * 1.15, base[1] * 1.12, base[2] * 0.95]);
  for (let r = 1; r <= rings; r++) {
    const rr = r / rings, row = [];
    for (let s = 0; s <= seg; s++) {
      const a = rot + notch / 2 + (s / seg) * (6.2832 - notch);
      const wob = 1 + 0.04 * Math.sin(a * 5 + rnd() * 0.3);
      const x = cx + Math.cos(a) * R * rr * wob, z = cz + Math.sin(a) * R * rr * wob;
      const y = y0 + (o.cup || 0) * (rr * rr - 0.3) * R + (r === rings ? 0.012 : 0);
      const vein = (s % 2 === 0) ? 0.88 : 1.0, edge = r === rings ? 1.18 : 1.0, k = vein * edge * (1.05 - 0.15 * rr);
      row.push(gb.v(x, y, z, -Math.cos(a) * (o.cup || 0) * rr, 1, -Math.sin(a) * (o.cup || 0) * rr, [base[0] * k, base[1] * k, base[2] * k * (r === rings ? 1.1 : 1)]));
    }
    ids.push(row);
  }
  for (let s = 0; s < seg; s++) gb.t(c, ids[0][s + 1], ids[0][s]);
  for (let r = 0; r < rings - 1; r++) for (let s = 0; s < seg; s++) gb.q(ids[r][s], ids[r][s + 1], ids[r + 1][s + 1], ids[r + 1][s]);
}
function lilyPads(P, seed) {
  const rnd = mulberry32(seed);
  const gb = new GB(), fl = new GB();
  const n = P.n || 3, R = Math.max(0.35, P.R);
  for (let k = 0; k < n; k++) {
    const a = k * 2.4 + rnd(), d = k === 0 ? 0 : R * (0.55 + rnd() * 0.4);
    const r = R * (k === 0 ? 0.55 : 0.25 + rnd() * 0.17);
    pad(gb, Math.cos(a) * d, Math.sin(a) * d, r, rnd() * 6.283, { notch: true, y: 0.02 + k * 0.004, col: k % 2 ? lin(0x4a9450) : lin(0x5aa458) }, rnd);
  }
  const parts = [{ geo: gb.build(), rule: { mode: 'mul' }, side: DS, mat: { surface: 'none', look: { rim: 0.2, spec: 0.5, specPower: 40 } } }];
  if (P.bloom) { // a small white water-lily bloom on the big pad
    const pr = R * 0.16;
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.283 + ring * 0.39, ca = Math.cos(a), sa = Math.sin(a), up = ring ? 0.75 : 0.4;
      const L = pr * (ring ? 0.8 : 1.1), w = pr * 0.45;
      const b = [ca * pr * 0.2, 0.05, sa * pr * 0.2];
      const t = [b[0] + ca * L * (1 - up * 0.6), b[1] + L * up, b[2] + sa * L * (1 - up * 0.6)];
      const i0 = fl.v(b[0] - sa * w * 0.3, b[1], b[2] + ca * w * 0.3, ca, 0.6, sa, 0.85);
      const i1 = fl.v(b[0] + sa * w * 0.3, b[1], b[2] - ca * w * 0.3, ca, 0.6, sa, 0.85);
      const i2 = fl.v((b[0] + t[0]) / 2 + sa * w, (b[1] + t[1]) / 2, (b[2] + t[2]) / 2 - ca * w, ca, 0.7, sa, 1.0);
      const i3 = fl.v(t[0], t[1], t[2], ca, 0.8, sa, 1.1);
      const i4 = fl.v((b[0] + t[0]) / 2 - sa * w, (b[1] + t[1]) / 2, (b[2] + t[2]) / 2 + ca * w, ca, 0.7, sa, 1.0);
      fl.t(i0, i1, i2); fl.t(i0, i2, i3); fl.t(i0, i3, i4);
    }
    parts.push({ geo: fl.build(), rule: { mode: 'mul', base: 0xf4f0e6 }, side: DS, mat: { surface: 'none', look: { trans: 0.6, rim: 0.3, wrap: 0.6 } } });
  }
  return model(parts);
}
/** Lotus: two cupped pads, a raised pad on a stalk, and a bloom of three cupped petal rings with a gold seed head. */
function lotusPlant(P, seed) {
  const rnd = mulberry32(seed);
  const pads = new GB(), petals = new GB(), stem = new GB();
  const R = Math.max(0.4, P.R), Hf = Math.max(0.35, Math.min(0.7, P.H));
  pad(pads, R * 0.55, 0, R * 0.5, rnd() * 6.283, { cup: 0.12, y: 0.06, col: lin(0x4a9a5a) }, rnd);
  pad(pads, -R * 0.5, R * 0.35, R * 0.38, rnd() * 6.283, { cup: 0.1, y: 0.06, col: lin(0x56a45c) }, rnd);
  const sx = -R * 0.3, sz = -R * 0.45;
  tube(stem, [{ x: sx, y: 0, z: sz, r: 0.018 }, { x: sx, y: Hf * 0.6, z: sz - 0.03, r: 0.014 }], 4, () => [0.3, 0.5, 0.28]);
  pad(pads, sx, sz - 0.03, R * 0.32, rnd() * 6.283, { cup: 0.35, y: Hf * 0.6, col: lin(0x5aa860) }, rnd);
  tube(stem, [{ x: 0, y: 0, z: 0, r: 0.02 }, { x: 0.02, y: Hf * 0.8, z: 0, r: 0.016 }], 4, () => [0.3, 0.5, 0.28]);
  const fy = Hf * 0.8, pr = R * 0.32;
  const rings = [[6, 0.35, 1.0], [8, 0.6, 0.9], [8, 0.95, 0.75]];
  rings.forEach(([n, up, ln], ri) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + ri * 0.4, ca = Math.cos(a), sa = Math.sin(a);
      const L = pr * ln, w = pr * 0.32 * (1.1 - ri * 0.15);
      const b = [0.02 + ca * pr * 0.08, fy, sa * pr * 0.08];
      const m = [b[0] + ca * L * 0.55 * (1 - up * 0.5), fy + L * 0.5 * up + 0.02, b[2] + sa * L * 0.55 * (1 - up * 0.5)];
      const t = [b[0] + ca * L * (1 - up * 0.55), fy + L * up, b[2] + sa * L * (1 - up * 0.55)];
      // shade: pale base -> full tint at the tip (instance colour = petal pink / night hue)
      const i0 = petals.v(b[0], b[1], b[2], ca, 0.5, sa, [0.95, 0.95, 0.95]);
      const i1 = petals.v(m[0] + sa * w, m[1], m[2] - ca * w, ca, 0.6, sa, 1.0);
      const i2 = petals.v(t[0], t[1], t[2], ca, 0.9, sa, 1.12);
      const i3 = petals.v(m[0] - sa * w, m[1], m[2] + ca * w, ca, 0.6, sa, 1.0);
      petals.t(i0, i1, i2); petals.t(i0, i2, i3);
    }
  });
  const head = new GB();
  tube(head, [{ x: 0.02, y: fy + 0.01, z: 0, r: pr * 0.18 }, { x: 0.02, y: fy + pr * 0.22, z: 0, r: pr * 0.2 }, { x: 0.02, y: fy + pr * 0.24, z: 0, r: 0.001 }], 7, () => [1.0, 0.82, 0.32]);
  return model([
    { geo: pads.build(), rule: { mode: 'mul' }, side: DS, mat: { surface: 'none', look: { rim: 0.2, spec: 0.5, specPower: 40 } } },
    { geo: stem.build(), rule: { mode: 'mul' }, side: THREE.FrontSide, mat: { surface: 'none' } },
    { geo: petals.build(), rule: { mode: 'tint', glow: 1.0, tip: null }, side: DS, mat: { surface: 'none', look: { trans: 0.7, rim: 0.35, wrap: 0.6 } } },
    { geo: head.build(), rule: { mode: 'mul', glow: 0.4 }, side: THREE.FrontSide, mat: { surface: 'none' } },
  ]);
}
/** card() runs u along the first edge; upright tiles (flowers, reeds, petals) need u across and v up. */
function rotUV(g, tile) {
  const [u0, v0, u1, v1] = tileUV(tile);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const s = (uv.getX(i) - u0) / (u1 - u0), t = (uv.getY(i) - v0) / (v1 - v0);
    uv.setXY(i, u0 + (u1 - u0) * t, v0 + (v1 - v0) * s);
  }
}
function sunflower(P, seed) {
  const rnd = mulberry32(seed);
  const stem = new GB(), head = new GB(), lv = new GB();
  const H = P.H;
  const bend = 0.12;
  tube(stem, [{ x: 0, y: 0, z: 0, r: 0.035 }, { x: 0, y: H * 0.5, z: 0.02, r: 0.03 }, { x: 0, y: H * 0.92, z: bend, r: 0.025 }], 5, (t) => [0.32, 0.5 + 0.1 * t, 0.2]);
  for (let k = 0; k < 4; k++) { // leaves (broad tile, single big leaf look)
    const a = k * 2.2 + rnd(), y = H * (0.25 + 0.15 * k), ca = Math.cos(a), sa = Math.sin(a), L = 0.42 - k * 0.04;
    card(lv, [-sa * L * 0.3, y, ca * L * 0.3], [ca * L, 0.08, sa * L], [sa * L * 0.6, 0, -ca * L * 0.6], TILE.broad, () => [ca * 0.3, 1, sa * 0.3], (s) => [0.36 + 0.2 * s, 0.58 + 0.2 * s, 0.22], null, null, 2, L * 0.25);
  }
  // head facing +z, tilted slightly up
  const r = P.R, cy = H * 0.94, cz = bend + 0.06;
  const tl = -0.18;
  card(head, [-r, cy - r * Math.cos(tl), cz - r * Math.sin(tl)], [2 * r, 0, 0], [0, 2 * r * Math.cos(tl), 2 * r * Math.sin(tl)], TILE.sunflower, () => [0, 0.25, 1], () => 1);
  // back of the head (green calyx), as a slightly smaller card behind
  card(head, [r * 0.8, cy - r * 0.8, cz - 0.03], [-1.6 * r, 0, 0], [0, 1.6 * r, 0], TILE.bush, () => [0, 0.2, -1], () => 0.5);
  const hg = head.build({ uv: true });
  return model([
    { geo: stem.build(), rule: { mode: 'mul' }, side: THREE.FrontSide, mat: {} },
    { geo: lv.build({ uv: true }), rule: { mode: 'mul' }, map: foliageAtlas(), side: DS, mat: { tex: true, look: LEAF_LOOK, col2: lin(0x4f7a32) } },
    { geo: hg, rule: { mode: 'tint', glow: 0.4 }, map: foliageAtlas(), side: DS, mat: { tex: true, look: { trans: 0.5, rim: 0.3 }, col2: lin(0x5a3412), glowFloor: 0 } },
  ]);
}

// ------------------------------------------------------------------ rocks
/**
 * Chiselled rock: a sphere cut by random planes (smooth-min -> bevelled facets), strata bands, worn lighter top,
 * darker crevices; optional cap mask (moss / snow / lichen) in aMix.
 */
function rock(P, seed) {
  const rnd = mulberry32(seed);
  let g = new THREE.IcosahedronGeometry(1, P.detail ?? 5);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const planes = [];
  const np = (P.planes || 9) + 3;
  for (let k = 0; k < np; k++) {
    // fibonacci directions (every direction is cut) with jitter; flatter top / bottom on slabs
    const yy = 1 - 2 * (k + 0.5) / np, rr = Math.sqrt(1 - yy * yy), a = k * 2.39996 + rnd() * 0.6;
    let nx = Math.cos(a) * rr + (rnd() - 0.5) * 0.3, ny = yy * (k === 0 ? 1 : (P.flatK ?? 0.7) + 0.3), nz = Math.sin(a) * rr + (rnd() - 0.5) * 0.3;
    const l = Math.hypot(nx, ny, nz) || 1;
    // round 2: a wider spread of cut depths (was 0.5..1) -> real planes and facets instead of an egg
    planes.push([nx / l, ny / l, nz / l, 0.4 + rnd() * 0.6]);
  }
  planes[0][3] = 0.5 + rnd() * 0.2; // a broad flat-ish top face
  for (let k = 0; k < 2; k++) { // two deep chips on the shoulders give each boulder a character
    const a = rnd() * 6.283, yy = 0.15 + rnd() * 0.5, rr = Math.sqrt(1 - yy * yy);
    planes.push([Math.cos(a) * rr, yy, Math.sin(a) * rr, 0.42 + rnd() * 0.12]);
  }
  const strataF = P.strata ?? 7, strataPh = rnd() * 6;
  const rv = new Float32Array(pos.count);
  let rSum = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // smooth min over plane distances along the ray, as a stable log-sum-exp. Round 1 summed exp(-55 t) directly:
    // every term underflowed below its 1e-9 guard, so r was the constant -ln(1e-9)/55 and every boulder a sphere.
    const kk = 30;
    let tmin = 3;
    for (const p of planes) { const d = x * p[0] + y * p[1] + z * p[2]; const t = d > 0.05 ? p[3] / d : 3; if (t < tmin) tmin = t; }
    let acc = 0;
    for (const p of planes) { const d = x * p[0] + y * p[1] + z * p[2]; const t = d > 0.05 ? Math.min(3, p[3] / d) : 3; acc += Math.exp(-kk * (t - tmin)); }
    const r = Math.min(0.88, tmin - Math.log(Math.max(1, acc)) / kk); // clip the sharpest corners
    rv[i] = r; rSum += r;
  }
  // keep round 1's visual size (a sphere of radius 0.443 x the half box) on average, lean the mass a little
  const rNorm = 0.443 / Math.max(0.1, rSum / pos.count), leanX = (rnd() - 0.5) * 0.3, leanZ = (rnd() - 0.5) * 0.3;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let r = rv[i] * rNorm;
    r *= 1 + 0.035 * Math.sin(x * 9 + y * 7 + strataPh) * Math.cos(z * 8 - y * 5);
    rv[i] = r;
    let X = x * r * P.sx, Y = y * r * P.sy, Z = z * r * P.sz;
    const up = Math.max(0, y * r); X += up * leanX * P.sx; Z += up * leanZ * P.sz;
    if (Y < -P.sy * 0.25) Y = -P.sy * 0.25 + (Y + P.sy * 0.25) * 0.25; // settle on the ground
    pos.setXYZ(i, X, Y + P.sy * 0.25, Z);
  }
  // fit the faceted rock into round 1's bounding box (sphere r 0.443: half-widths 0.443·sx / sz, top 0.693·sy), so the
  // visible mass and the flora collider (life.js reads the model box) stay what players know
  {
    g.computeBoundingBox(); const b = g.boundingBox;
    const kx = (0.886 * P.sx) / Math.max(1e-3, b.max.x - b.min.x), kz = (0.886 * P.sz) / Math.max(1e-3, b.max.z - b.min.z);
    const mx = (b.max.x + b.min.x) * 0.5, mz = (b.max.z + b.min.z) * 0.5, y0 = b.min.y;
    const ky = (0.693 * P.sy - y0) / Math.max(1e-3, b.max.y - y0);
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, (pos.getX(i) - mx) * kx, y0 + (pos.getY(i) - y0) * ky, (pos.getZ(i) - mz) * kz);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  const col = new Float32Array(pos.count * 3), mix = new Float32Array(pos.count);
  const base0 = P.color || [1, 1, 1], tw = (rnd() - 0.5) * 0.12;
  const base = [base0[0] * (1 + tw), base0[1], base0[2] * (1 - tw)];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ny = nrm.getY(i);
    const yN = y / Math.max(0.2, P.sy * 1.25);
    const band = 0.9 + 0.1 * Math.sin(yN * strataF * 6.283 + Math.sin(pos.getX(i) * 1.7) * 0.8 + strataPh);
    const cav = 0.78 + 0.22 * sstep(0.34, 0.47, rv[i]); // rv is ~0.443 on average (see rNorm)
    const top = 1 + 0.16 * sstep(0.35, 0.9, ny);
    const low = 0.84 + 0.16 * sat(yN * 1.5 + 0.2);
    const k = band * cav * top * low;
    col[i * 3] = base[0] * k; col[i * 3 + 1] = base[1] * k; col[i * 3 + 2] = base[2] * k * 1.02;
    if (P.cap) mix[i] = sstep(P.cap[0], P.cap[1], ny + 0.25 * Math.sin(pos.getX(i) * 2.1 + pos.getZ(i) * 1.7) + 0.15 * (yN - 0.5));
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (P.cap) g.setAttribute('aMix', new THREE.BufferAttribute(mix, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return model([{ geo: g, rule: { mode: 'mul' }, side: THREE.FrontSide,
    mat: { surface: 'rock', look: { rim: 0.22, wrap: 0.3 }, mix: P.cap ? (P.capCol || [0, 0, 0, 1]) : null } }]);
}

// ------------------------------------------------------------------ giant mushrooms & crystals
function lathe(gb, prof, segs, shade, ridges = 0, ridgeK = 0) {
  // prof: [{r, y}] bottom->top; normals from the profile
  const rows = [];
  for (let i = 0; i < prof.length; i++) {
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)];
    const dr = b.r - a.r, dy = b.y - a.y;
    const row = [];
    for (let s = 0; s <= segs; s++) {
      const an = (s / segs) * 6.283, ca = Math.cos(an), sa = Math.sin(an);
      const rk = ridges ? 1 + ridgeK * Math.abs(Math.sin(an * ridges * 0.5)) : 1;
      const r = prof[i].r * rk;
      row.push(gb.v(ca * r, prof[i].y, sa * r, ca * dy, -dr, sa * dy, shade(i / (prof.length - 1), s)));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) for (let s = 0; s < segs; s++) gb.q(rows[i][s], rows[i][s + 1], rows[i + 1][s + 1], rows[i + 1][s]);
}
function giantShroom(P, seed) {
  const rnd = mulberry32(seed);
  const H = P.H, R = P.R;
  const capG = new GB(), gillG = new GB(), stemG = new GB(), spotG = new GB();
  const ch = R * P.dome; // cap height
  const capY = H - ch;
  // stem
  const sp = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; sp.push({ r: P.stemR * (1.35 - 0.45 * t + 0.25 * Math.pow(1 - t, 6)), y: capY * t + 0.05 * t }); }
  sp[0].y = -0.2;
  lathe(stemG, sp, 12, (t, s) => 0.75 + 0.25 * t + (s % 2 ? -0.04 : 0));
  // cap top: dome profile from rim to apex (profile drawn bottom->top)
  const cp = [];
  for (let i = 0; i <= 9; i++) { const t = i / 9; const a = t * Math.PI / 2; cp.push({ r: R * Math.cos(a) * (1 + 0.06 * Math.sin(t * 3)) + 0.001, y: capY + ch * Math.sin(a) * (P.flat ? 0.7 + 0.3 * t : 1) }); }
  cp.unshift({ r: R * 0.97, y: capY - ch * 0.08 }); // curled rim
  // revision: shade runs from a deeper rim to a pale crown; the cap glow follows it (material glowShade), so a cap is a
  // soft gradient of light falling off toward the rim instead of one flat neon disc
  lathe(capG, cp, 22, (t) => 0.42 + 0.58 * Math.pow(t, 0.7));
  // gills: ridged underside from the stem out to the rim (faces down)
  const gp = [{ r: R * 0.96, y: capY - ch * 0.07 }, { r: R * 0.6, y: capY + ch * 0.05 }, { r: P.stemR * 0.9, y: capY + ch * 0.12 }];
  // revision: no alternating stripes per segment (44 thin stripes aliased into moire); light gathers toward the stem
  lathe(gillG, gp, 44, (t, sg) => (0.5 + 0.5 * t) * (0.8 + 0.2 * Math.cos((sg / 44) * 6.2832 * 11)), 0, 0);
  // revision: the round-3 fin blades are gone. Thin hanging triangles seen from below were sub-pixel lines and printed
  // blocky dashes (aliasing + AO); the gill rays are now broad soft light bands in the underside's own shade (11 per
  // turn, 4 lathe segments each), so the underside still radiates from the stem with clean edges and one draw call less.
  // spots
  const ns = P.spots || 9;
  for (let k = 0; k < ns; k++) {
    const a = rnd() * 6.283, t = 0.25 + rnd() * 0.6, an = t * Math.PI / 2;
    const x = Math.cos(a) * R * Math.cos(an) * 1.01, z = Math.sin(a) * R * Math.cos(an) * 1.01, y = capY + ch * Math.sin(an) * 1.01;
    const nx = Math.cos(a) * Math.cos(an) * ch, ny = Math.sin(an) * R, nz = Math.sin(a) * Math.cos(an) * ch;
    const s = R * (0.08 + rnd() * 0.08);
    // flat disc as a small fan
    const c = spotG.v(x, y, z, nx, ny, nz, 1);
    const l = Math.hypot(nx, ny, nz); const N = [nx / l, ny / l, nz / l];
    const T = Math.abs(N[1]) < 0.9 ? [N[2], 0, -N[0]] : [1, 0, 0]; const tl = Math.hypot(...T); T[0] /= tl; T[2] /= tl;
    const B = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
    const ring = [];
    for (let j = 0; j <= 7; j++) { const q = (j / 7) * 6.283; const cq = Math.cos(q) * s, sq = Math.sin(q) * s; ring.push(spotG.v(x + T[0] * cq + B[0] * sq, y + T[1] * cq + B[1] * sq, z + T[2] * cq + B[2] * sq, nx, ny, nz, 0.9)); }
    for (let j = 0; j < 7; j++) spotG.t(c, ring[j], ring[j + 1]);
  }
  // gills face down: flip their winding by rendering double sided
  return model([
    { geo: capG.build(), rule: { mode: 'tint', glow: 0.75 }, side: DS, mat: { noRecv: true, fres: [0.32, 0.1], glowShade: 1, glowDesat: 0.5, look: { rim: 0.35, wrap: 0.6 } } },
    { geo: gillG.build(), rule: { mode: 'tint', glow: 0.6 }, side: DS, mat: { noRecv: true, glowShade: 1, glowDesat: 0.45, look: { rim: 0.1 } } },
    { geo: stemG.build(), rule: { mode: 'mul', base: 0x8a86b8, glow: 0.22 }, side: THREE.FrontSide, mat: { glowDesat: 0.5, look: { rim: 0.3, wrap: 0.6 } } },
    { geo: spotG.build(), rule: { mode: 'mul', base: 0xf4eefe, glow: 0.7 }, side: DS, mat: {} },
  ]);
}
function crystalCluster(P, seed) {
  const rnd = mulberry32(seed);
  const gb = new GB(), base = new GB();
  const n = P.n || 6;
  for (let k = 0; k < n; k++) {
    const main = k === 0;
    const L = P.H * (main ? 1 : 0.35 + rnd() * 0.5), r = P.R * (main ? 0.32 : 0.12 + rnd() * 0.14);
    const a = rnd() * 6.283, tilt = main ? rnd() * 0.15 : 0.25 + rnd() * 0.55;
    const ax = [Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)];
    const o = main ? [0, -0.2, 0] : [Math.cos(a) * P.R * 0.25 * rnd(), -0.15, Math.sin(a) * P.R * 0.25 * rnd()];
    const T = [ax[1], -ax[0], 0]; let tl = Math.hypot(...T) || 1; T[0] /= tl; T[1] /= tl;
    if (Math.abs(ax[1]) > 0.99) { T[0] = 1; T[1] = 0; T[2] = 0; }
    const B = [ax[1] * T[2] - ax[2] * T[1], ax[2] * T[0] - ax[0] * T[2], ax[0] * T[1] - ax[1] * T[0]];
    const sides = 6, body = L * 0.78;
    const ring = (h, rr, q) => [o[0] + ax[0] * h + (T[0] * Math.cos(q) + B[0] * Math.sin(q)) * rr, o[1] + ax[1] * h + (T[1] * Math.cos(q) + B[1] * Math.sin(q)) * rr, o[2] + ax[2] * h + (T[2] * Math.cos(q) + B[2] * Math.sin(q)) * rr];
    const tip = [o[0] + ax[0] * L, o[1] + ax[1] * L, o[2] + ax[2] * L];
    for (let s = 0; s < sides; s++) {
      const q0 = (s / sides) * 6.283, q1 = ((s + 1) / sides) * 6.283, qm = (q0 + q1) / 2;
      const nm = [T[0] * Math.cos(qm) + B[0] * Math.sin(qm), T[1] * Math.cos(qm) + B[1] * Math.sin(qm), T[2] * Math.cos(qm) + B[2] * Math.sin(qm)];
      const a0 = ring(0, r, q0), a1 = ring(0, r, q1), b0 = ring(body, r * 0.92, q0), b1 = ring(body, r * 0.92, q1);
      const sh = 0.7 + 0.3 * (s % 2);
      const i0 = gb.v(...a0, ...nm, sh * 0.6), i1 = gb.v(...a1, ...nm, sh * 0.6), i2 = gb.v(...b1, ...nm, sh), i3 = gb.v(...b0, ...nm, sh);
      gb.q(i0, i1, i2, i3);
      const nt = [nm[0] + ax[0] * 0.6, nm[1] + ax[1] * 0.6, nm[2] + ax[2] * 0.6];
      const j0 = gb.v(...b0, ...nt, sh), j1 = gb.v(...b1, ...nt, sh), j2 = gb.v(...tip, ...nt, 1.1);
      gb.t(j0, j1, j2);
    }
  }
  // rocky socket
  lathe(base, [{ r: P.R * 0.55, y: -0.3 }, { r: P.R * 0.45, y: 0.12 }, { r: P.R * 0.12, y: 0.25 }], 7, (t) => 0.7 + 0.3 * t);
  return model([
    { geo: gb.build(), rule: { mode: 'tint', glow: 1 }, side: DS, mat: { fres: [0.8, 0.2], look: { rim: 0.5, spec: 0.8, specPower: 40, wrap: 0.2 } } },
    { geo: base.build(), rule: { mode: 'mul', base: 0x55525f }, side: THREE.FrontSide, mat: { surface: 'rock' } },
  ]);
}

// ------------------------------------------------------------------ species table
const SAK = lin(0x5a3a36), MAPLE = lin(0x4d3530), BIRCH = lin(0xd8d2c6), DEAD = lin(0x7a6a5e), GINK = lin(0x5e4636);
const B = (o) => (G, box, seed) => {
  const H = box ? box.max.y : (o.H || 7);
  const R = box ? Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5 : (o.R || 3);
  return o.make({ H, R }, seed);
};
const tree = (o) => ({ H, R }, seed) => broadTree({ H, R: R * (o.Rk || 0.95), trunkR: o.trunkR || 0.28, ...o }, seed);
const RECIPES = {
  broad1: tree({ shape: 'dome', clumps: 13, cards: 9, tile: TILE.broad }),
  broad2: tree({ shape: 'oval', clumps: 12, cards: 9, tile: TILE.broad, crownY: 0.58, Rk: 0.85 }),
  broad3: tree({ shape: 'umbrella', clumps: 16, cards: 9, tile: TILE.broad, trunkR: 0.5, crownY: 0.6, Rk: 1.0, clumpK: 0.38 }),
  broad4: tree({ shape: 'dome', clumps: 12, cards: 9, tile: TILE.broad, crownY: 0.6 }),
  broad5: tree({ shape: 'oval', clumps: 11, cards: 9, tile: TILE.bush, crownY: 0.55, Rk: 0.9 }),
  birch: tree({ species: 'birch', shape: 'oval', clumps: 10, cards: 8, tile: TILE.broad, trunkR: 0.2, bark: BIRCH, crownY: 0.6, Rk: 0.75 }),
  cherry1: tree({ shape: 'umbrella', clumps: 18, cards: 13, tile: TILE.blossom, trunkR: 0.34, bark: SAK, crownY: 0.62, Rk: 1.07, lean:-.10, cardK: 1.24 }),
  cherry2: tree({ shape: 'dome', clumps: 16, cards: 13, tile: TILE.blossom, bark: SAK, lean:.075, cardK: 1.24 }),
  willow1: tree({ species: 'willow', shape: 'dome', clumps: 9, cards: 7, tile: TILE.broad, crownY: 0.72, willow: 22, Rk: 0.85 }),
  willow2: tree({ species: 'willow', shape: 'umbrella', clumps: 9, cards: 7, tile: TILE.broad, crownY: 0.72, willow: 26, Rk: 0.85 }),
  maple1: tree({ species: 'maple', shape: 'dome', clumps: 14, cards: 9, tile: TILE.maple, trunkR: 0.34, bark: MAPLE }),
  maple2: tree({ species: 'maple', shape: 'umbrella', clumps: 13, cards: 9, tile: TILE.maple, bark: MAPLE, crownY: 0.6 }),
  maple3: tree({ species: 'maple', shape: 'oval', clumps: 13, cards: 9, tile: TILE.maple, bark: MAPLE, crownY: 0.55, Rk: 0.88 }),
  ginkgo1: tree({ species: 'ginkgo', shape: 'cone', clumps: 13, cards: 8, tile: TILE.ginkgo, trunkR: 0.25, bark: GINK, crownY: 0.55, Rk: 0.8, ryK: 1.3 }),
  ginkgo2: tree({ species: 'ginkgo', shape: 'oval', clumps: 12, cards: 8, tile: TILE.ginkgo, trunkR: 0.25, bark: GINK, crownY: 0.58, Rk: 0.82 }),
  broadSnow: tree({ shape: 'dome', clumps: 11, cards: 8, tile: TILE.bush, snow: 1 }),
  dead1: ({ H, R }, s) => driftwood({ H, R, trunkR: 0.26 }, s),
  dead2: ({ H, R }, s) => driftwood({ H, R, trunkR: 0.22, bark: lin(0x7e7a78) }, s),
  dead3: ({ H, R }, s) => driftwood({ H, R, trunkR: 0.3, bark: lin(0x6e6460) }, s),
  deadSnow: tree({ dead: true, clumps: 8, trunkR: 0.22, bark: lin(0x9a8e86) }),
  pine1: ({ H, R }, s) => conifer({ H, R: R * 0.9, trunkR: 0.26, tile: TILE.needle, tiers: 7 }, s),
  pine2: ({ H, R }, s) => conifer({ H, R: R * 0.85, trunkR: 0.26, tile: TILE.needle, tiers: 8, base: 0.18 }, s),
  pine3: ({ H, R }, s) => conifer({ H, R: R * 0.9, trunkR: 0.3, tile: TILE.cedar, tiers: 6, base: 0.3 }, s),
  pineSnow: ({ H, R }, s) => conifer({ H, R: R * 0.9, trunkR: 0.26, tile: TILE.needle, tiers: 7, snow: 1 }, s),
  lily1: ({ H, R }, s) => lilyPads({ H, R, n: 3 }, s),
  lily2: ({ H, R }, s) => lilyPads({ H, R, n: 2, bloom: true }, s),
  lotus: ({ H, R }, s) => lotusPlant({ H, R }, s),
  bamboo1: ({ H, R }, s) => bamboo({ H, R, culms: 7 }, s),
  bamboo2: ({ H, R }, s) => bamboo({ H, R, culms: 5 }, s),
  bush1: ({ H, R }, s) => bush({ H, R, clumps: 6 }, s),
  bush2: ({ H, R }, s) => bush({ H, R, clumps: 5 }, s),
  bush3: ({ H, R }, s) => bush({ H, R, clumps: 7, tile: TILE.broad }, s),
  bush4: ({ H, R }, s) => bush({ H, R, clumps: 5, tile: TILE.maple }, s),
  bushBerry: ({ H, R }, s) => bush({ H, R, clumps: 6, berries: 14 }, s),
  bushSnow: ({ H, R }, s) => bush({ H, R, clumps: 5, snow: 1 }, s),
  fern1: ({ H, R }, s) => fern({ L: Math.max(0.5, R * 1.05), fronds: 10 }, s),
  fern2: ({ H, R }, s) => fern({ L: Math.max(0.4, R * 1.0), fronds: 8 }, s),
  flower1: ({ H, R }, s) => crossed({ H: Math.max(0.35, H * 1.1), W: Math.max(0.45, R * 2.2), tile: TILE.flowers, n: 2 }, s),
  flower2: ({ H, R }, s) => crossed({ H: Math.max(0.35, H * 1.1), W: Math.max(0.45, R * 2.2), tile: TILE.flowers, n: 2 }, s),
  flower4: ({ H, R }, s) => crossed({ H: Math.max(0.4, H * 1.1), W: Math.max(0.5, R * 2.2), tile: TILE.flowers, n: 3 }, s),
  reed1: ({ H, R }, s) => crossed({ H: Math.max(1, H), W: Math.max(0.8, R * 2), tile: TILE.reed, n: 3, glow: 0.8, col2: lin(0x6a4522) }, s),
  reed2: ({ H, R }, s) => crossed({ H: Math.max(1, H), W: Math.max(0.8, R * 2), tile: TILE.reed, n: 3, glow: 0.8, col2: lin(0x6a4522) }, s),
  sunflower: ({ H, R }, s) => sunflower({ H: Math.max(1.4, H), R: 0.3 }, s),
  shroom1: ({ H, R }, s) => giantShroom({ H, R, dome: 0.55, stemR: R * 0.16, spots: 10 }, s),
  shroom2: ({ H, R }, s) => giantShroom({ H, R, dome: 0.32, stemR: R * 0.13, spots: 8, flat: true }, s),
  shroom3: ({ H, R }, s) => giantShroom({ H, R, dome: 0.5, stemR: R * 0.22, spots: 12 }, s),
  shroom4: ({ H, R }, s) => giantShroom({ H, R, dome: 0.85, stemR: R * 0.12, spots: 6 }, s),
  crys1: ({ H, R }, s) => crystalCluster({ H, R, n: 6 }, s),
  crys2: ({ H, R }, s) => crystalCluster({ H, R, n: 7 }, s),
  crys3: ({ H, R }, s) => crystalCluster({ H, R, n: 5 }, s),
  crys4: ({ H, R }, s) => crystalCluster({ H, R, n: 8 }, s),
  crys6: ({ H, R }, s) => crystalCluster({ H, R, n: 9 }, s),
  crysSpike: ({ H, R }, s) => crystalCluster({ H, R, n: 3 }, s),
};
const ROCK_C = lin(0x9b97a0), WARM = lin(0xa89c92);
const rk = (o) => ({ box, G }, s) => {
  const sx = box ? (box.max.x - box.min.x) * 0.5 : 1, sz = box ? (box.max.z - box.min.z) * 0.5 : 1;
  let sy = box ? Math.max(0.2, box.max.y) * 0.8 : 1;
  if (!o.tall) sy = Math.min(sy, Math.max(sx, sz) * 0.95);
  const P = { sx, sy, sz, color: o.color || ROCK_C, ...o };
  if (o.facet && G?.sculpt?.on?.('rockfam')) { try { const m = facetRock(o.facet, P); if (m) return m; } catch (e) { G.reportError?.('flora:facetRock', e); } }
  return rock(P, s);
};
/**
 * Family rock (round art-stone 2026-11-24, world/rock-family.js): exact planes, bevelled edges, beds / joints as geometry,
 * a moss cushion of its own. Fitted into the procedural rock's box (width 0.886·sx / sz, top 0.693·sy over the foot, foot
 * sunk 6 %) so colliders, scale and placement stay. LOD by tier (rockLod: the clutter species lighter). Stone colour =
 * neutral paint × species colour / NEUTRAL (then the instance's land tint); the moss vertices take aMix = 0.6 toward the
 * mineral's neutral aCol0, so a dark land tint only half-muddies the green. One part: no added draw.
 */
function facetRock(shape, P) {
  const parts = rockParts(shape, rockLod(!!P.clutter));
  if (!parts) return null;
  const fit = { W: 0.886 * P.sx, D: 0.886 * P.sz, H: 0.693 * P.sy };
  const stone = fitRock(parts.stone, parts.box, fit), moss = parts.moss ? fitRock(parts.moss, parts.box, fit) : null;
  const k = [P.color[0] / NEUTRAL, P.color[1] / NEUTRAL, P.color[2] / NEUTRAL];
  const c = stone.attributes.color;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k[0], c.getY(i) * k[1], c.getZ(i) * k[2]);
  const geos = moss ? [stone, moss] : [stone];
  geos.forEach((g, j) => g.setAttribute('aMix', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(j * 0.6), 1)));
  const g = geos.length > 1 ? mergeGeometries(geos, false) : stone;
  g.computeBoundingBox(); g.computeBoundingSphere();
  return model([{ geo: g, rule: { mode: 'mul' }, side: THREE.FrontSide,
    mat: { surface: 'rock', look: { rim: 0.22, wrap: 0.3 }, mix: [1, 1, 1, 1] } }]);
}
// species -> family shape (the clutter species: small and numerous, a lighter LOD)
const ROCKS = {
  boulder2: rk({ planes: 8, color: WARM, facet: 'field', clutter: true }),
  boulder3: rk({ planes: 9, facet: 'split' }),
  boulder4: rk({ planes: 10, strata: 5, facet: 'ledge' }),
  boulder5: rk({ planes: 11, strata: 6, facet: 'field' }),
  boulder6: rk({ detail: 7, planes: 12, strata: 8, flatK: 0.4, facet: 'shelf' }),
  cliff1: rk({ tall: true, detail: 7, planes: 12, strata: 11, flatK: 0.25, color: lin(0x958c8e), facet: 'crag' }),
  cliff2: rk({ tall: true, detail: 7, planes: 13, strata: 13, flatK: 0.25, color: lin(0x8e8a96), facet: 'crag' }),
  moss1: rk({ planes: 9, cap: [0.25, 0.65], facet: 'split' }),
  moss2: rk({ planes: 8, cap: [0.2, 0.6], color: WARM, facet: 'cobble', clutter: true }),
  snowRock1: rk({ planes: 10, cap: [0.3, 0.6], capCol: [0.95, 0.97, 1.0, 0], color: lin(0x8f8c98), facet: 'shelf' }),
  snowRock2: rk({ planes: 9, cap: [0.25, 0.55], capCol: [0.95, 0.97, 1.0, 0], color: lin(0x8f8c98), facet: 'split' }),
  standing1: rk({ tall: true, planes: 10, strata: 4, flatK: 0.2, facet: 'crag' }),
  standing3: rk({ tall: true, planes: 9, strata: 4, flatK: 0.2, facet: 'crag' }),
};

/** Procedural model for a species key, or null (fall back to the asset). */
/** Extra procedural species registered by other flora modules (countryside-species.js): key -> (G, seed) => model. */
export const EXTRA_RECIPES = {};
/** Builders shared with countryside-species.js. */
export const PROC = { GB, tube, bill, card, model, bush, crossed, broadTree, rotUV, LEAF_LOOK, BLOSSOM_LOOK, DS, lin, sat, sstep };
export function buildProcModel(G, key, sp) {
  const seed = [...key].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  if (EXTRA_RECIPES[key]) return EXTRA_RECIPES[key](G, seed);
  const box = sp.asset ? assetBox(G, sp.asset) : null;
  if (ROCKS[key]) return ROCKS[key]({ box, G }, seed);
  const f = RECIPES[key];
  if (!f) return null;
  const H = box ? box.max.y : 6;
  const R = box ? Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5 : 2.5;
  return f({ H, R }, seed);
}

/** Far / mid-distance stand-ins in the same card language. Unit crown (radius 1) centred at the origin. */
export function buildProcFar(type) {
  const rnd = mulberry32(type.length * 977);
  const crown = new GB(), trunk = new GB();
  if (type === 'cone') {
    // three stacked jagged cones of needle cards (fixed) around the axis
    for (let i = 0; i < 4; i++) {
      const t = i / 3, y = -1 + t * 1.5, rr = 1 - t * 0.75;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * 6.283 + i * 0.5, ca = Math.cos(a), sa = Math.sin(a), w = rr * 1.1;
        card(crown, [-sa * w / 2, y, ca * w / 2], [ca * rr, 0.2 * rr + 0.25, sa * rr], [sa * w, 0, -ca * w], TILE.needle, (s) => [ca * s, 0.8, sa * s], (s) => 0.55 + 0.35 * s + 0.1 * t, [0, y, 0, rnd()], null, 1, rr * 0.4);
      }
    }
    card(crown, [-0.15, 0.5, 0], [0, 0.55, 0], [0.3, 0, 0], TILE.needle, () => [0, 1, 0], () => 0.9, [0, 1, 0, 0.2]);
    tube(trunk, [{ x: 0, y: -3.2, z: 0, r: 0.09 }, { x: 0, y: -0.9, z: 0, r: 0.06 }], 4, () => [0.42, 0.3, 0.24]);
    return {
      parts: [
        { geo: crown.build({ uv: true, leaf: true }), rule: { mode: 'tint', crown: true, glow: 1.2, tip: [0.2, 1.0] }, map: foliageAtlas(), side: DS, mat: { leaf: true, tex: true, look: LEAF_LOOK, glowFloor: 0.1 } },
        { geo: trunk.build(), rule: { mode: 'mul' }, side: THREE.FrontSide, mat: {} },
      ],
      height: 2, crown: { cx: 0, cy: 0, cz: 0, rx: 1, ry: 1, rz: 1 },
    };
  }
  if (type === 'shroom') return null;
  // blob / bcone: a handful of big soft camera-facing clump cards with spherical normals
  const n = type === 'bcone' ? 9 : 12;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, yN = -0.7 + 1.5 * t, rr = Math.sqrt(Math.max(0.05, 1 - yN * yN)) * 0.55, a = i * 2.39996;
    const p = [Math.cos(a) * rr, yN * 0.6, Math.sin(a) * rr];
    const ao = 0.62 + 0.38 * sat(0.5 + yN * 0.5);
    bill(crown, p, 1.05, type === 'bcone' ? TILE.bush : TILE.clump, [p[0], p[1] + 0.25, p[2]], ao, [0, 0, 0, rnd()], rnd);
  }
  bill(crown, [0, 0.05, 0], 1.3, TILE.clump, [0, 1, 0], 0.8, [0, 0, 0, 0.5], rnd);
  tube(trunk, [{ x: 0, y: -3.2, z: 0, r: 0.15 }, { x: 0, y: -0.6, z: 0, r: 0.1 }], 4, () => [0.42, 0.3, 0.24]);
  return {
    parts: [
      { geo: crown.build({ uv: true, card: true, leaf: true }), rule: { mode: 'tint', crown: true, glow: 1.2, tip: [0.2, 1.0] }, map: foliageAtlas(), side: DS, mat: { leaf: true, bill: true, tex: true, look: LEAF_LOOK, glowFloor: 0.1 } },
      { geo: trunk.build(), rule: { mode: 'mul' }, side: THREE.FrontSide, mat: {} },
    ],
    height: 2, crown: { cx: 0, cy: 0, cz: 0, rx: 1, ry: 1, rz: 1 },
  };
}
