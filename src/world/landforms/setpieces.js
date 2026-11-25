// Rock set pieces of the countryside landmarks (map round, 2026-11-22): granite tors on the mounds, the crag with its
// waterfall and plunge pool, the old quarry face, the rock-held tarn. Chiselled protoRock pieces baked per landmark into
// one vertex-coloured mesh (rock material of landforms), plus a falling-water ribbon and flat pool surfaces.
// Each piece is distance-culled (large: never; medium: 1100 m) and gets cylinder colliders for its big blocks.
// Round art-ground (2026-11-24): the pieces are facet-kit stone (exact planes, bevelled arrises, beds and joints as
// geometry, moss cushions) instead of smooth blobs with painted cracks: tors stack granite blocks that sit on one
// another (tools/sculpt/assets/ground_rocks.mjs tor_a / tor_b), the crag is bedded ledges under jointed columns, the
// quarry is a cut rock face of weathered bedded benches with a few fresh drill-marked blocks, half-won blocks, a collapsed
// column and spoil at its foot (quarryFace), pool and tarn rims are bedded shelves. Same placements (the same random draws), the same colliders (she climbs them).
// Two levels: near (LOD by tier) and far (sharp planes) swapped at ~170 m (phones ~90 m). ?sculpt=0: the old blobs.
import * as THREE from 'three';
import { mulberry32, noise2 } from '../../core/util.js';
import { toon, own } from '../../core/mats.js';
import { LANDMARKS } from '../../data/landmarks.js';
import { protoRock, Bake, rockShader, PALS, sstep } from './rockgeo.js';
import { lfMats, LU } from './lfmats.js';
import { poolOf, poolDiscRadius } from './pools.js';
import { familyParts, rockId, NEUTRAL } from '../rock-family.js';

const groundId = (n) => 'sculpt_ground_' + n;
const _facet = new Map();
/** stone + moss of a facet GLB LOD as one prototype for Bake.add: { geo, cav: null, col, moss (0/1 per vertex), box } */
function facetProto(id, lod) {
  const k = id + ':' + lod;
  if (_facet.has(k)) return _facet.get(k);
  const P = familyParts(id, lod);
  let out = null;
  if (P) {
    const parts = [P.stone, P.moss].filter(Boolean);
    let n = 0, t = 0;
    for (const g of parts) { n += g.attributes.position.count; t += g.index.count; }
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), moss = new Uint8Array(n), idx = new Uint32Array(t);
    let o = 0, oi = 0;
    parts.forEach((g, pi) => {
      const A = g.attributes, c = A.position.count;
      for (let i = 0; i < c; i++) {
        const j = (o + i) * 3;
        pos[j] = A.position.getX(i); pos[j + 1] = A.position.getY(i); pos[j + 2] = A.position.getZ(i);
        nrm[j] = A.normal.getX(i); nrm[j + 1] = A.normal.getY(i); nrm[j + 2] = A.normal.getZ(i);
        col[j] = A.color.getX(i); col[j + 1] = A.color.getY(i); col[j + 2] = A.color.getZ(i);
      }
      if (pi === 1) moss.fill(1, o, o + c);
      const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + o;
      o += c; oi += ix.length;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    out = { geo, cav: null, col, moss, box: P.box };
  }
  _facet.set(k, out);
  return out;
}
/** facet shading: the GLB's own paint (bevel highlights, dark joints, moss) times the land's stone tint, a slow world
 *  drift so neighbouring stones differ, contact shade at the foot */
function facetShader(tintHex) {
  const t = new THREE.Color(tintHex), k = [t.r / NEUTRAL, t.g / NEUTRAL, t.b / NEUTRAL];
  return (x, y, z, nx, ny, nz, cav, ly, P, i) => {
    const r = P.col[i * 3], g = P.col[i * 3 + 1], b = P.col[i * 3 + 2];
    if (P.moss[i]) return [r * 0.95, g * 0.95, b * 0.95];
    const d = 0.94 + 0.08 * noise2(x * 0.07 + 3.1, z * 0.07 - 1.7) + 0.04 * noise2(x * 0.31 - y * 0.2, z * 0.31);
    const foot = 0.82 + 0.18 * sstep(0, 0.16, ly);
    const f = d * foot;
    return [r * k[0] * f, g * k[1] * f, b * k[2] * f];
  };
}

const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const GRANITE = { base: [0.47, 0.45, 0.42], alt: [0.4, 0.39, 0.4], moss: [0.3, 0.45, 0.17], mossK: 0.55, lichen: [0.62, 0.6, 0.42] };
const LIME = { base: [0.6, 0.56, 0.47], alt: [0.52, 0.5, 0.44], moss: [0.32, 0.46, 0.18], mossK: 0.35 };

function poolMaterial() {
  return new THREE.ShaderMaterial({
    name: 'setpiece_pool', transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: LU.uTime }]),
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec3 vV;
      #include <fog_pars_vertex>
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vV = cameraPosition - w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vW; varying vec3 vV;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec3 v = normalize(vV);
        float rip = sin(vW.x * 1.7 + uTime * 1.3) * sin(vW.z * 1.9 - uTime * 1.1) + 0.5 * sin((vW.x + vW.z) * 3.1 + uTime * 2.0);
        float fres = pow(1.0 - clamp(v.y + rip * 0.03, 0.0, 1.0), 3.0);
        vec3 deep = vec3(0.10, 0.25, 0.27), sky = vec3(0.62, 0.78, 0.86);
        vec3 col = mix(deep, sky, 0.25 + 0.6 * fres) + vec3(0.9) * smoothstep(0.92, 1.0, 0.5 + 0.5 * rip) * 0.08;
        gl_FragColor = vec4(col, 0.82 + 0.15 * fres);
        #include <fog_fragment>
      }`,
  });
}

export function buildSetpieces(G, root) {
  const W = G.world, mats = lfMats();
  const pieces = [], colliders = [];
  const protos = new Map();
  const proto = (key, o) => { let p = protos.get(key); if (!p) protos.set(key, (p = protoRock(o))); return p; };
  let poolMat = null;
  // facet stone: both sculpt types on and every GLB loaded
  const q = G.quality || { name: 'high' }, lite = q.mobile || q.name === 'low';
  const lodN = lite ? 1 : 0, lodF = 2;
  const FACET = ['tor_a', 'tor_b', 'quarry', 'spoil', 'quarry_face_a', 'quarry_face_b', 'quarry_half'].map(groundId).concat(['field', 'split', 'shelf', 'crag', 'cobble'].map(rockId));
  const facet = !!(G.sculpt?.on?.('ground') && G.sculpt?.on?.('rockfam') && FACET.every((id) => G.assets?.raw?.(id)));
  const NEAR = q.mobile ? 90 : q.name === 'low' ? 110 : q.name === 'med' ? 140 : 170;
  let facetMat = null;
  const newBake = () => (facet ? { near: new Bake(), far: new Bake(), get empty() { return this.near.empty; } } : new Bake());
  /** which facet stone stands in for a piece, and how much of the old piece's box (centre y, half height sy) it fills */
  function facetPick(kind, role, seed) {
    const s = Math.abs(Math.round(seed)) >>> 0;
    switch (role) {
      case 'stack': return { id: groundId('tor_a'), lo: 0.65, hi: 0.7, add: 0.3, tilt: 0.3 };
      case 'stackTop': return { id: groundId('tor_b'), lo: 0.65, hi: 0.72, add: 0.15, tilt: 0.3 };
      case 'outlier': return { id: rockId(['field', 'split', 'cobble'][s % 3]), lo: 0.45, hi: 0.8 };
      case 'rim': return { id: rockId(s % 3 ? 'shelf' : 'field'), lo: 0.6, hi: 0.8 };
      // the crag: bedded ledges and jointed columns stacked in turn (strata steps on a cliff, not boards)
      case 'crag': return { id: rockId('ledge'), top: rockId('crag'), lo: 0.75, hi: 0.9, lifts: 0.9, wide: 1.15 };
      case 'notch': return { id: rockId('ledge'), top: rockId('crag'), lo: 0.75, hi: 0.95, lifts: 0.9, wide: 1.15 };
      // a bench of the quarry face: blocks wide enough to close up with their neighbours; some show the old split face
      case 'face': return { id: groundId('quarry'), lo: 0.75, hi: 0.8, lifts: 0.85, wide: 1.32, flip: true, rough: s % 3 === 1 };
      case 'rubble': return { id: s % 2 ? rockId('cobble') : groundId('spoil'), lo: 0.3, hi: 0.8, wide: s % 2 ? 1 : 1.5 };
      default: return { id: rockId(kind === 'crag' ? 'crag' : 'field'), lo: 0.5, hi: 0.8 };
    }
  }
  function facetRock(B, shade, x, y, z, sx, sy, sz, ry, kind, seed, tilt, role) {
    const f = facetPick(kind, role, seed), lodOf = (id) => (id === groundId('spoil') && !lite ? 1 : lodN);
    let pn = facetProto(f.id, lodOf(f.id)), pf = facetProto(f.id, lodF);
    if (!pn || !pf) return;
    const foot = y - f.lo * sy, top = y + f.hi * sy + (f.add || 0);
    const Wd = 1.6 * sx * (f.wide || 1), Dd = 1.6 * sz * (f.wide || 1);
    const bx = pn.box, bw = bx.max.x - bx.min.x, bd = bx.max.z - bx.min.z, bh = bx.max.y - Math.max(0, bx.min.y);
    // tall pieces are built in lifts near the stone's own proportions (a quarry column: blocks of uneven height, the
    // top one showing its sawn face and drill marks, the ones below turned to show the old split face; a crag: jointed
    // columns stacked and turned, narrowing upward), so nothing is stretched into boards
    const H = top - foot, n = f.lifts ? Math.max(1, Math.round(H / Math.max(2.4, Wd * f.lifts * (bh / bw)))) : 1;
    const cuts = [0];
    for (let i = 1; i < n; i++) cuts.push((i + (((seed * 7 + i * 13) % 11) / 11 - 0.5) * 0.45) / n);
    cuts.push(1);
    const tk = f.tilt ?? 1;
    for (let i = 0; i < n; i++) {
      const crown = f.top && i === n - 1 && n > 1;    // the crag's crown: jointed columns standing on the bedded ledges
      if (crown) { pn = facetProto(f.top, lodOf(f.top)) || pn; pf = facetProto(f.top, lodF) || pf; }
      const bx = pn.box, bw = bx.max.x - bx.min.x, bd = bx.max.z - bx.min.z, bh = bx.max.y - Math.max(0, bx.min.y);
      const y0 = foot + cuts[i] * H - (i ? 0.03 : 0), hl = (cuts[i + 1] - cuts[i]) * H + (i ? 0.03 : 0);
      // quarry benches step back a little per lift; crag beds step back more and keep one strike (parallel strata)
      const back = f.flip ? i * 0.14 : i * 0.45, taper = f.flip ? 1 : (crown ? 0.62 : 1 - 0.05 * i);
      const w = Wd * taper * (1 - 0.05 * ((seed + i) % 3)), d = Dd * (f.flip ? 1 : 1 - 0.05 * i);
      const turn = f.flip ? (i < n - 1 || f.rough ? Math.PI : 0) : (seed % 4) * 0.8 + (crown ? 0.5 : (i % 2) * 0.12);
      _e.set((seed % 7 - 3) * tilt * 0.3 * tk, ry + turn, (seed % 5 - 2) * tilt * 0.3 * tk); _q.setFromEuler(_e);
      const ox = -Math.sin(ry) * back, oz = -Math.cos(ry) * back;
      _m.compose(_p.set(x + ox, y0, z + oz), _q, _s.set(w / bw, hl / bh, d / bd));
      _m.multiply(_t.makeTranslation(-(bx.max.x + bx.min.x) / 2, 0, -(bx.max.z + bx.min.z) / 2));
      B.near.add(pn, _m, shade); B.far.add(pf, _m, shade);
    }
  }
  /** one facet stone fitted into w x h x d (foot at y0, centred on x, z), turned by euler (rx, ry, rz) */
  function putFacet(B, shade, id, x, y0, z, w, h, d, rx, ry, rz, lod = lodN) {
    const pn = facetProto(id, lod), pf = facetProto(id, lodF);
    if (!pn || !pf) return;
    const bx = pn.box, bw = bx.max.x - bx.min.x, bd = bx.max.z - bx.min.z, bh = bx.max.y - Math.max(0, bx.min.y);
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y0, z), _q, _s.set(w / bw, h / bh, d / bd));
    _m.multiply(_t.makeTranslation(-(bx.max.x + bx.min.x) / 2, 0, -(bx.max.z + bx.min.z) / 2));
    B.near.add(pn, _m, shade); B.far.add(pf, _m, shade);
  }
  /**
   * The old quarry as a cut rock face (round art-ground review). The bench columns keep their places, colliders and the
   * random draws of the old build, but each bench is drawn as one wall of weathered bedded rock in a few long segments of
   * uneven length, height and set-back (not a grid of blocks): a fresh sawn segment with drill marks low on the face,
   * half-won blocks on two bench tops, one segment collapsed into fallen blocks and spoil at the foot, soil and grass on
   * the bench tops, boulders softening the ends. Its own random stream (qr).
   */
  function quarryFace(l, B, shade) {
    const qr = mulberry32((Math.round(l.x * 7 + l.z * 3) >>> 0) + 991), a = l.angle, fx = Math.sin(a), fz = Math.cos(a), sx = -fz, sz = fx;
    const old = [groundId('quarry_face_a'), groundId('quarry_face_b')];
    const cols = [];
    return {
      column(k, tier, x, z, gg, hgt) { cols.push({ k, tier, gg, hgt }); },
      finish() {
        const at = (u, t) => [l.x + sx * u - fx * t * 2.4, l.z + sz * u - fz * t * 2.4];
        const hgtAt = (u, t) => {   // the old columns' heights, interpolated along the bench
          const c = cols.filter((o) => o.tier === t).sort((p, q) => p.k - q.k), f = Math.max(-3, Math.min(3, u / 4.3));
          const i = Math.min(c.length - 2, Math.floor(f + 3)), w = f + 3 - i;
          return c[i].hgt * (1 - w) + c[i + 1].hgt * w;
        };
        const collapse = { tier: 1 + Math.floor(qr() * 2), seg: -1, x: 0, z: 0 };
        const half = [Math.floor(qr() * 3), Math.floor(qr() * 3)];
        let freshDone = false;
        for (let t = 0; t < 3; t++) {
          // cut the bench into segments 6.5-10.5 m long
          const U0 = -3 * 4.3 - 2.3, U1 = 3 * 4.3 + 2.3, cuts = [U0];
          while (cuts[cuts.length - 1] < U1 - 0.1) { let u = cuts[cuts.length - 1] + 6.5 + 4 * qr(); if (U1 - u < 4) u = U1; cuts.push(Math.min(u, U1)); }
          if (collapse.tier === t) collapse.seg = Math.floor(qr() * (cuts.length - 1));
          for (let i = 0; i + 1 < cuts.length; i++) {
            const u0 = cuts[i], u1 = cuts[i + 1], uc = (u0 + u1) / 2, Wd = u1 - u0 + 0.6;
            const sb = (qr() - 0.5) * 0.7, [x0, z0] = at(uc, t), x = x0 - fx * sb, z = z0 - fz * sb;
            let g = Infinity; for (const du of [-0.45, 0, 0.45]) { const [px, pz] = at(uc + du * (u1 - u0), t); g = Math.min(g, W.heightAt(px, pz)); }
            const gg = W.heightAt(x0, z0), hg = hgtAt(uc, t), collapsed = t === collapse.tier && i === collapse.seg;
            const top = gg + hg * (collapsed ? 0.5 : 0.884) + (qr() - 0.5) * 1.4, foot = g - 0.7, H = top - foot;
            const fresh = !freshDone && t === 0 && i === 1 && (freshDone = true);
            const n = Math.max(1, Math.ceil(H / (1.25 * Wd))), yaw = a + (qr() - 0.5) * 0.06;
            for (let j = 0; j < n; j++) {
              const y0 = foot + (H * j) / n - (j ? 0.05 : 0), h = H / n + (j ? 0.05 : 0), id = fresh && j === n - 1 ? groundId('quarry') : old[(i + t + j) % 2];
              const fwd = (n - 1 - j) * 0.12;
              putFacet(B, shade, id, x + fx * fwd, y0, z + fz * fwd, Wd * (0.97 + 0.06 * qr()), h, 4.4 * (0.92 + 0.12 * qr()), (qr() - 0.5) * 0.02, yaw, (qr() - 0.5) * 0.02);
            }
            if (collapsed) { collapse.x = x; collapse.z = z; collapse.W = Wd; }
            // a block half won from the face on this bench top
            if (t < 2 && i === half[t] + (t ? 0 : 1)) {
              const back = 1.0 + 0.6 * qr(), along = (qr() - 0.5) * Wd * 0.5;
              putFacet(B, shade, groundId('quarry_half'), x - fx * back + sx * along, top - 0.35, z - fz * back + sz * along, 2.4 + 0.6 * qr(), 1.6 + 0.5 * qr(), 2.4, 0, yaw + (qr() - 0.5) * 0.1, 0);
            }
          }
        }
        // the collapse: fallen blocks and a spoil heap below the broken segment, out in front of the lowest bench
        if (collapse.W) {
          const n = lite ? 3 : 6;
          for (let i = 0; i < n; i++) {
            const along = (qr() - 0.5) * collapse.W * 0.8, out = 2.4 * collapse.tier + 2.5 + qr() * 5, x = collapse.x + sx * along + fx * out, z = collapse.z + sz * along + fz * out, g = W.heightAt(x, z);
            const s = 1.4 + qr() * 1.6, id = i === 0 ? groundId('quarry') : old[i % 2];
            putFacet(B, shade, id, x, g - 0.45 * s, z, s * (1 + 0.3 * qr()), s * (0.7 + 0.3 * qr()), s, (qr() - 0.5) * 0.9, qr() * 6.28, (qr() - 0.5) * 0.9);
          }
          const x = collapse.x + fx * (2.4 * collapse.tier + 3.4), z = collapse.z + fz * (2.4 * collapse.tier + 3.4);
          putFacet(B, shade, groundId('spoil'), x, W.heightAt(x, z) - 0.1, z, 5.2, 1.6, 4.4, 0, qr() * 6.28, 0, lite ? lodN : 1);
        }
        // boulders and cobbles where the face runs out into the hill
        for (const e of [-1, 1]) for (let i = 0; i < 2; i++) {
          const [x0, z0] = at(e * (3 * 4.3 + 3.2 + i * 2.4), i);
          const x = x0 + fx * (1.2 - i), z = z0 + fz * (1.2 - i), g = W.heightAt(x, z);
          putFacet(B, shade, rockId(i ? 'shelf' : 'field'), x, g - 0.35, z, 3.4 - i * 0.6, 2.4 + qr() - i * 0.6, 3, 0, qr() * 6.28, 0);
        }
      },
    };
  }
  function rock(B, shade, x, y, z, sx, sy, sz, ry, kind, seed, tilt = 0.08, role = '') {
    if (facet) return facetRock(B, shade.facet, x, y, z, sx, sy, sz, ry, kind, seed, tilt, role);
    const pr = proto(kind + (seed % 5), kind === 'block' ? { seed: 11 + seed % 5, w: 12, h: 9, planes: 8, flat: 0.85, box: 1, fracture: 0.03 }
      : kind === 'tor' ? { seed: 31 + seed % 5, w: 14, h: 10, planes: 9, flat: 0.95, bands: 2, lip: 0.08, fracture: 0.05, sharp: 16 }
        : { seed: 51 + seed % 5, w: 18, h: 14, planes: 12, flat: 0.6, bands: 4, lip: 0.14, fracture: 0.07 });
    _e.set((seed % 7 - 3) * tilt * 0.3, ry, (seed % 5 - 2) * tilt * 0.3); _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    B.add(pr, _m, shade);
  }
  function col(x, z, r, y0, y1) { colliders.push(W.addCollider({ x, z, r, y0, y1, tag: 'landmark_rock' })); }
  function finish(l, B, extra = []) {
    if (B.empty) return;
    const g = new THREE.Group(); g.name = 'setpiece_' + l.id;
    const piece = { id: l.id, group: g, x: l.x, z: l.z, cut: l.scale === 'large' ? 0 : 1100, tris: 0 };
    if (facet) {
      if (!facetMat) {
        facetMat = own(toon(0xa59c90, { surface: 'rock', look: { detail: 0.3, bump: 0.35, rim: 0.22, wrap: 0.3 } }));
        facetMat.vertexColors = true; facetMat.color.setRGB(1, 1, 1); facetMat.name = 'setpiece_facet_stone';
      }
      const mn = new THREE.Mesh(B.near.build(), facetMat), mf = new THREE.Mesh(B.far.build(), facetMat);
      mn.name = 'setpiece_near'; mf.name = 'setpiece_far'; mf.visible = false;
      for (const m of [mn, mf]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
      Object.assign(piece, { near: mn, far: mf, isNear: true, tris: B.near.idx.length / 3, farTris: B.far.idx.length / 3 });
    } else {
      const m = new THREE.Mesh(B.build(), mats.rock); m.castShadow = true; m.receiveShadow = true; g.add(m);
      piece.tris = B.idx.length / 3;
    }
    for (const e of extra) g.add(e);
    root.add(g);
    pieces.push(piece);
  }

  for (const l of LANDMARKS) {
    const r = mulberry32(Math.round(l.x * 13 - l.z * 7) >>> 0);
    const shade = rockShader(l.kind === 'quarry' ? LIME : GRANITE);
    shade.facet = facetShader(l.kind === 'quarry' ? 0xd3c8b0 : 0xaaa59d);
    if (l.kind === 'tor') {
      const B = newBake();
      const g = W.heightAt(l.x, l.z);
      // a stack of rounded slabs, leaning a little, with outliers
      let y = g - 0.8;
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const s = 4.2 - k * 0.55 + r() * 0.8, h = 1.5 + r() * 0.6, ox = (r() - 0.5) * 1.6, oz = (r() - 0.5) * 1.6;
        rock(B, shade, l.x + ox, y + h * 0.75, l.z + oz, s, h * 1.15, s * (0.7 + r() * 0.3), r() * 6, 'tor', k + 3 * l.x, 0.08, k === n - 1 ? 'stackTop' : 'stack');
        y += h * 1.55;
      }
      col(l.x, l.z, 3.6, g - 1, y);
      for (let k = 0; k < 2; k++) { // a second, lower stack beside it
        const a = r() * 6.28, d = 6 + r() * 3, x = l.x + Math.sin(a) * d, z = l.z + Math.cos(a) * d, gg = W.heightAt(x, z);
        rock(B, shade, x, gg + 0.9, z, 2.6, 1.7, 2.1, r() * 6, 'tor', k + 7, 0.08, 'stack');
        rock(B, shade, x + 0.3, gg + 2.8, z - 0.2, 1.8, 1.2, 1.5, r() * 6, 'tor', k + 9, 0.08, 'stackTop');
        col(x, z, 2.3, gg - 1, gg + 3.8);
      }
      for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = 5 + r() * 9, x = l.x + Math.sin(a) * d, z = l.z + Math.cos(a) * d; rock(B, shade, x, W.heightAt(x, z) + 0.2, z, 0.9 + r(), 0.6 + r() * 0.5, 0.8 + r() * 0.8, r() * 6, 'tor', k, 0.08, 'outlier'); }
      finish(l, B);
    } else if (l.kind === 'cragFalls') {
      const B = newBake();
      const pool = poolOf(W, l);
      const dx = pool.x - l.x, dz = pool.z - l.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl, vx = -uz, vz = ux;
      const g = W.heightAt(l.x, l.z);
      const top = Math.max(g, pool.level) + 24;
      // the crag: an arc of tall stratified masses behind the pool, a notch where the water comes over
      for (let k = -3; k <= 3; k++) {
        if (k === 0) continue;
        const along = k * 6.2, back = Math.abs(k) * 1.6 - 2, x = l.x + vx * along - ux * back, z = l.z + vz * along - uz * back;
        const gg = W.heightAt(x, z), hgt = top - gg - Math.abs(k) * 1.8 + r() * 2;
        rock(B, shade, x, gg + hgt * 0.45, z, 5.4 + r() * 1.5, hgt * 0.62, 5 + r() * 1.5, Math.atan2(ux, uz) + (r() - 0.5) * 0.4, 'crag', k + 4, 0.03, 'crag');
        col(x, z, 4.2, gg - 1, gg + hgt);
      }
      // behind the notch, a lower mass the water spills over
      const bx = l.x - ux * 4, bz = l.z - uz * 4, bg = W.heightAt(bx, bz), lip = top - 3;
      rock(B, shade, bx, bg + (lip - bg) * 0.45, bz, 5.2, (lip - bg) * 0.58, 5.2, 0.4, 'crag', 2, 0.02, 'notch');
      col(bx, bz, 4, bg - 1, lip);
      // pool rim: low rocks all round, tall enough to hold the water (gaps only where the ground is above the water line)
      for (const q of pool.rim) if (q.a % 0.5 < 0.27 || q.ground < pool.level - 0.25) {
        const need = pool.level - q.ground + 0.5;
        rock(B, shade, q.x, q.ground + need * 0.4, q.z, 1.6 + r() * 0.8, Math.max(0.6, need * 0.7), 1.4 + r() * 0.6, q.a, 'tor', Math.round(q.a * 10), 0.08, 'rim');
      }
      // the fall: a ribbon from the lip down to the pool
      const fall = fallRibbon(bx + ux * 4.2, bz + uz * 4.2, lip + 0.2, pool.level, ux, uz, 3.4, 17 + l.x);
      const extra = [new THREE.Mesh(fall, mats.fall)];
      extra[0].renderOrder = 2;
      poolMat = poolMat || poolMaterial();
      extra.push(poolDisc(pool, poolMat));
      // the runnel above the lip, fed from the hill
      finish(l, B, extra);
    } else if (l.kind === 'quarry') {
      const B = newBake();
      const a = l.angle, fx = Math.sin(a), fz = Math.cos(a), sx = -fz, sz = fx; // face looks along (fx,fz)
      const QF = facet ? quarryFace(l, B, shade.facet) : null;
      for (let k = -3; k <= 3; k++) for (let tier = 0; tier < 3; tier++) {
        const x = l.x + sx * k * 4.3 - fx * tier * 2.4, z = l.z + sz * k * 4.3 - fz * tier * 2.4, gg = W.heightAt(x, z);
        const hgt = 5 + tier * 4.5 - Math.abs(k) * 0.6 + r() * 1.5;
        const w0 = 2.4 + r() * 0.4, yaw = a + (r() - 0.5) * 0.15;   // (drawn in this order by the old build too)
        if (QF) QF.column(k, tier, x, z, gg, hgt);
        else rock(B, shade, x, gg + hgt * 0.42, z, w0, hgt * 0.58, 2.6, yaw, 'block', k * 3 + tier + 20, 0.02, 'face');
        if (tier === 0) col(x, z, 2.3, gg - 1, gg + hgt);
      }
      QF?.finish();
      for (let k = 0; k < 10; k++) { const x = l.x + fx * (4 + r() * 6) + sx * (r() - 0.5) * 20, z = l.z + fz * (4 + r() * 6) + sz * (r() - 0.5) * 20; rock(B, shade, x, W.heightAt(x, z) + 0.2, z, 0.6 + r() * 0.6, 0.4 + r() * 0.3, 0.6 + r() * 0.5, r() * 6, 'block', k, 0.08, 'rubble'); }
      finish(l, B);
    } else if (l.kind === 'tarn') {
      const B = newBake();
      const pool = poolOf(W, l);
      for (const q of pool.rim) {
        const need = pool.level - q.ground + 0.45;
        rock(B, shade, q.x, q.ground + need * 0.35, q.z, 1.5 + r() * 1.0, Math.max(0.5, need * 0.65), 1.3 + r() * 0.7, q.a, 'tor', Math.round(q.a * 10), 0.08, 'rim');
      }
      poolMat = poolMat || poolMaterial();
      finish(l, B, [poolDisc(pool, poolMat)]);
    }
  }
  return {
    pieces, colliders,
    update(cam) {
      for (const p of pieces) {
        const d = Math.hypot(cam.x - p.x, cam.z - p.z);
        if (p.cut) p.group.visible = d < p.cut;
        if (p.near) { const n = d < (p.isNear ? NEAR + 20 : NEAR); if (n !== p.isNear) { p.isNear = n; p.near.visible = n; p.far.visible = !n; } }
      }
    },
    stats() { return { pieces: pieces.length, tris: pieces.reduce((a, p) => a + p.tris, 0), visible: pieces.filter((p) => p.group.visible).length }; },
  };
}

function poolDisc(pool, mat) {
  const g = new THREE.CircleGeometry(poolDiscRadius(pool.r), 28); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.set(pool.x, pool.level, pool.z); m.renderOrder = 3; m.name = 'setpiece_pool';
  return m;
}
/** falling sheet: from (x,z,y0) down to y1, bowing out along (ux,uz), w wide; aFall attributes as landforms' fall material */
function fallRibbon(x, z, y0, y1, ux, uz, w, seed) {
  const rows = 18, cols = 4, L = y0 - y1;
  const P = [], A = [], C = [], idx = [];
  const px = -uz, pz = ux;
  for (let i = 0; i <= rows; i++) {
    const v = i / rows, out = 0.6 + Math.sqrt(v) * 2.2, ww = w * (1 + v * 0.7);
    for (let j = 0; j <= cols; j++) {
      const u = j / cols, s = (u - 0.5) * ww;
      P.push(x + ux * out + px * s, y0 - v * L, z + uz * out + pz * s);
      A.push(u, v, L, (seed % 97) * 0.13);
      C.push(0.9, 0.95, 1);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aFall', new THREE.Float32BufferAttribute(A, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
