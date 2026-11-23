// Modelled roofs of the City of Magic's town houses (art pass "modelled, not painted"): every pitched roof is built
// from its parts instead of a tiled texture on a slab — pan-tile courses that step down the slope, half-round cover
// tiles (or staggered slates) over them, a ridge of overlapping ridge tiles, a fascia and a soffit with rafter tails at
// the eave, barge boards on the gables, gutters and downpipes where the eave faces the street, and chimneys with a
// corbelled cap and clay pots. Detail scales with the quality tier (counts, spacing); the city's block far versions
// (structures.js, vertex clustering) collapse the courses into plain slopes, so nothing here is drawn far away.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { flat } from '../../core/mats.js';
import { mat, sculptVcMat } from './kit.js';
import { cyl, sphere } from '../../core/geo.js';
import { ByMat, hash01 } from './city-geo.js';

/** 2 = high, 1 = med, 0 = low tier and phones (the mobile tier is 'low' to the systems). */
export const roofTier = () => (G.quality?.name === 'high' ? 2 : G.quality?.name === 'med' ? 1 : 0);

const _tile = new Map(),
  _tileSet = new Set();
/**
 * Boot time: the roofs' tiles carry their shading in vertex colours (the tint of the house, the rain-darkened eave
 * course, a tone per tile — what the site bake's vertex shading would give them) on a vertex-coloured copy of the
 * tile material (kit.js sculptVcMat), so the bake does not shade them vertex by vertex against every house of the
 * city, and the draw-call pass still merges them into the tile family. Other materials are added as usual.
 */
function flushRoof(B, parent, h, seed) {
  const v = 0.93 + 0.1 * hash01(seed, 101),
    w = (hash01(seed, 103) - 0.5) * 0.06,
    tint = [v * (1 + w), v, v * (1 - w)],
    c = new THREE.Color();
  for (const [m, b] of B.map) {
    if (!_tileSet.has(m)) {
      b.mesh(m, parent);
      continue;
    }
    if (!b.p.length) continue;
    c.copy(m.color);
    const n = b.p.length / 3,
      col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = b.p[i * 3], y = b.p[i * 3 + 1], z = b.p[i * 3 + 2], d = y - h;
      let k = 0.94 + 0.1 * hash01(Math.floor(x / 0.42), Math.floor(z / 0.42));
      if (d < 1.0) k *= 0.84 + 0.16 * Math.max(0, d);
      col[i * 3] = c.r * tint[0] * k;
      col[i * 3 + 1] = c.g * tint[1] * k;
      col[i * 3 + 2] = c.b * tint[2] * k;
    }
    const g = b.geometry();
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const o = new THREE.Mesh(g, sculptVcMat(m));
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
  }
  B.map.clear();
}
/**
 * The modelled-roof copy of a tile material: same colour (times k), normals from the geometry (round cover tiles shade
 * softly), the painted tile layer kept only as faint clay grain — the courses are real geometry now.
 */
export function modelTile(m, k = 1) {
  const hex = new THREE.Color().copy(m.color).multiplyScalar(k).getHex();
  let t = _tile.get(hex);
  if (!t) {
    _tile.set(hex, (t = flat(hex, { surface: 'tile', look: { spec: 0.065, specPower: 50, detail: 0.22, bump: 0.3 }, flatShading: false })));
    _tileSet.add(t);
  }
  return t;
}
const fasciaM = mat.wood(0xa67954),
  soffitM = mat.wood(0x8d6a4f),
  rafterM = mat.wood(0x6e4c38),
  gutterM = mat.metal(0x8b9597),
  brassM = mat.metal(0xcf9f52),
  brickM = mat.stone(0xa65b40),
  capM = mat.stone(0xe3d8c2),
  potM = mat.stone(0xb7704c),
  glassM = mat.paint(0x3d5667),
  frameM = mat.wood(0x5a4232),
  ironM = mat.paint(0x35393f);
const SLATY = new Set([0x5a6a7b, 0x7f455a]);
/** Chimney crowns in the chimney's local frame (x, y, z, flues), read back by the caller (mage-city.js -> smoke). */
export const CHIMNEY_TOPS = [];
const isSlate = (m) => SLATY.has(m.color.getHex());

/**
 * Pitched roof over a w x d body whose walls end at h, in the house's frame (front +z). The ridge runs along z, or
 * along x with alongX (eaves to the street: gutters, and a downpipe at house x = pipeX on the front). Gable walls in
 * bodyM. ov = eave overhang (m).
 * Returns { top }: the height of the ridge tiles' crown above the house origin.
 */
export function modelGable(g, w, d, h, rise, roofM, bodyM, alongX, ov = 0.5, seed = 1, pipeX = null, opt = {}) {
  const tier = roofTier(),
    r = new THREE.Group(),
    B = new ByMat();
  const W = alongX ? d : w,
    D = alongX ? w : d,
    half = W / 2,
    xe = half + ov,
    a = Math.atan2(rise, half),
    ca = Math.cos(a),
    sa = Math.sin(a),
    ta = Math.tan(a),
    T = 0.2,
    gov = 0.42,
    stepped = !alongX && !!opt.stepped, // a crow-stepped street gable: the roof stops behind the steps
    zA = -D / 2 - gov,
    zB = stepped ? D / 2 - 0.12 : D / 2 + gov;
  const yU = (x) => h + (half - Math.abs(x)) * ta; // underside (rafters' top on the wall plate at x = half)
  const yE = yU(xe) + T; // top plane at the eave edge
  const Ls = xe / ca; // slant from the eave edge to the ridge line
  const P = (sg, s, z, lift) => [sg * (xe - s * ca) + lift * sg * sa, yE + s * sa + lift * ca, z];
  const N = (sg) => [sg * sa, ca, 0];
  const slate = isSlate(roofM),
    ridgeM = modelTile(roofM, 0.84);
  // pans a shade darker than the cover tiles over them (same family: one draw, the colour rides in the vertices)
  const tileM0 = modelTile(roofM),
    T1 = B.get(modelTile(roofM, slate ? 1 : 0.9)),
    TR = B.get(modelTile(roofM, 1.07));
  const cs = (tier === 2 ? 0.33 : tier === 1 ? 0.42 : 0.62) * (0.94 + 0.12 * hash01(seed, 3)),
    nc = Math.max(3, Math.round(Ls / cs)),
    lip = slate ? 0.032 : 0.048;
  // gable walls: the attic triangle in the body's plaster
  B.get(bodyM).prism([[-half + 0.01, h], [half - 0.01, h], [0, h + rise]], -D / 2 + 0.01, D / 2 - 0.01);
  // an attic light in the street gable (and the back one on high): stone surround, cross bars, a sill
  if (!alongX && rise > 2.2)
    for (const e of tier === 2 ? [1, -1] : [1]) {
      const ww = Math.min(0.82, W * 0.15),
        wh = ww * 1.3,
        yc = h + rise * 0.34,
        zf = (D / 2) * e,
        S = B.get(capM),
        Gl = B.get(glassM),
        Fr = B.get(frameM);
      const f = (x0, y0, x1, y1, dz) => {
        if (e > 0) S.bevel(x0, y0, zf, x1, y1, zf + dz, 0.02, '');
        else S.bevel(x0, y0, zf - dz, x1, y1, zf, 0.02, '');
      };
      // (the back gable's surround is mirrored by building it in a turned copy below)
      if (e > 0) {
        f(-ww / 2 - 0.12, yc - wh / 2 - 0.1, ww / 2 + 0.12, yc - wh / 2, 0.14);
        f(-ww / 2 - 0.12, yc + wh / 2, ww / 2 + 0.12, yc + wh / 2 + 0.14, 0.09);
        f(-ww / 2 - 0.12, yc - wh / 2, -ww / 2, yc + wh / 2, 0.08);
        f(ww / 2, yc - wh / 2, ww / 2 + 0.12, yc + wh / 2, 0.08);
        Gl.quad([-ww / 2, yc - wh / 2, zf + 0.015], [ww / 2, yc - wh / 2, zf + 0.015], [ww / 2, yc + wh / 2, zf + 0.015], [-ww / 2, yc + wh / 2, zf + 0.015], [0, 0, 1]);
        Fr.box(-0.025, yc - wh / 2, zf + 0.01, 0.025, yc + wh / 2, zf + 0.045, 'nz');
        Fr.box(-ww / 2, yc + wh * 0.1 - 0.025, zf + 0.01, ww / 2, yc + wh * 0.1 + 0.025, zf + 0.045, 'nz');
      } else {
        const t = new ByMat();
        t.get(capM).bevel(-ww / 2 - 0.12, yc - wh / 2 - 0.1, 0, ww / 2 + 0.12, yc - wh / 2, 0.12, 0.02, '');
        t.get(capM).bevel(-ww / 2 - 0.1, yc - wh / 2, 0, ww / 2 + 0.1, yc + wh / 2 + 0.1, 0.06, 0.02, '');
        t.get(glassM).quad([-ww / 2, yc - wh / 2, 0.065], [ww / 2, yc - wh / 2, 0.065], [ww / 2, yc + wh / 2, 0.065], [-ww / 2, yc + wh / 2, 0.065], [0, 0, 1]);
        const m = new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, 0, zf);
        for (const [mm, gb] of t.map) B.get(mm).append(gb, m);
      }
    }
  for (const sg of [-1, 1]) {
    const n = N(sg),
      dn = [-sg * ca, sa, 0].map((v) => -v); // down-slope direction (lip faces look this way)
    // courses: each one a plate whose lower edge stands `lip` proud, tucked under the next one up
    for (let i = 0; i < nc; i++) {
      const s0 = (i * Ls) / nc,
        s1 = ((i + 1) * Ls) / nc - (i === nc - 1 ? 0.05 : 0);
      if (slate && tier === 2) {
        // staggered slates, each a touch different in lift and width (hand-laid)
        const sw = 0.5,
          off = i % 2 ? sw / 2 : 0;
        for (let z = zA - off; z < zB; z += sw) {
          const z0 = Math.max(zA, z + 0.008),
            z1 = Math.min(zB, z + sw - 0.008);
          if (z1 - z0 < 0.05) continue;
          const l = lip * (0.7 + 0.6 * hash01(seed + i * 7.1, z * 3.3));
          T1.quad(P(sg, s0, z0, l), P(sg, s0, z1, l), P(sg, s1, z1, 0), P(sg, s1, z0, 0), n);
          T1.quad(P(sg, s0, z0, i ? 0 : -0.07), P(sg, s0, z1, i ? 0 : -0.07), P(sg, s0, z1, l), P(sg, s0, z0, l), dn);
        }
      } else {
        T1.quad(P(sg, s0, zA, lip), P(sg, s0, zB, lip), P(sg, s1, zB, 0), P(sg, s1, zA, 0), n);
        T1.quad(P(sg, s0, zA, i ? 0 : -0.07), P(sg, s0, zB, i ? 0 : -0.07), P(sg, s0, zB, lip), P(sg, s0, zA, lip), dn);
      }
    }
    // half-round cover tiles over the pans, eave to ridge (not on slate)
    if (!slate && tier > 0) {
      const pr = (tier === 2 ? 0.37 : 0.52) * (0.95 + 0.1 * hash01(seed, 5)),
        nr = Math.floor((zB - zA - 0.1) / pr),
        z0 = (zA + zB) / 2 - ((nr - 1) * pr) / 2,
        rr = tier === 2 ? 0.095 : 0.1,
        la = lip * 0.5;
      for (let j = 0; j < nr; j++) {
        const zc = z0 + j * pr + (hash01(seed + j, sg) - 0.5) * 0.03,
          e0 = -0.02,
          e1 = Ls - 0.14;
        const ring = (s) => {
          const out = [];
          for (let k = 0; k <= 3; k++) {
            const th = (k * Math.PI) / 3,
              cz = Math.cos(th),
              cn = Math.sin(th),
              c = P(sg, s, zc, la);
            out.push([[c[0] + n[0] * rr * cn, c[1] + n[1] * rr * cn, c[2] + rr * cz], [n[0] * cn, n[1] * cn, cz]]);
          }
          return out;
        };
        const R0 = ring(e0),
          R1 = ring(e1);
        for (let k = 0; k < 3; k++) TR.squad(R0[k][0], R0[k + 1][0], R1[k + 1][0], R1[k][0], R0[k][1], R0[k + 1][1], R1[k + 1][1], R1[k][1]);
        const c = P(sg, e0, zc, la);
        for (let k = 0; k < 3; k++) TR.tri(c, R0[k][0], R0[k + 1][0], dn);
      }
    }
    // the eave: fascia board, soffit, rafter tails, gutter
    const F = B.get(fasciaM),
      x0 = sg * xe,
      x1 = sg * (xe + 0.055);
    F.box(Math.min(x0, x1), yU(xe) - 0.1, zA, Math.max(x0, x1), yE + 0.012, zB);
    B.get(soffitM).quad([sg * xe, yU(xe), zA], [sg * xe, yU(xe), zB], [0, h + rise, zB], [0, h + rise, zA], [sg * sa, -ca, 0]);
    if (tier > 0) {
      const sp = tier === 2 ? 0.85 : 1.3,
        nt = Math.max(2, Math.floor((D - 0.3) / sp));
      for (let k = 0; k <= nt; k++) {
        const zc = -D / 2 + 0.15 + ((D - 0.3) * k) / nt,
          xa = half - 0.02,
          xb = xe - 0.06;
        B.get(rafterM).prism([[sg * xa, yU(xa)], [sg * xb, yU(xb)], [sg * xb, yU(xb) - 0.12], [sg * xa, yU(xa) - 0.12]], zc - 0.045, zc + 0.045);
      }
    }
    if (alongX && tier > 0) {
      const gx = sg * (xe + 0.15),
        gy = yU(xe) + 0.02,
        M = B.get(gutterM);
      M.tube([[gx, gy, zA + 0.05], [gx, gy, zB - 0.05]], 0.075, 6, true);
      if (sg < 0 && pipeX != null) {
        const zp = pipeX,
          wx = sg * (half + 0.12);
        M.tube([[gx, gy - 0.05, zp], [gx, gy - 0.4, zp], [wx, gy - 0.75, zp], [wx, 0.35, zp], [sg * (half + 0.28), 0.12, zp]], 0.055, 6);
      }
    }
  }
  // barge boards on both gables, mitred at the apex, plumb-cut at the eave
  const yTop = (x) => yE + 0.09 / ca + (xe - Math.abs(x)) * ta,
    hb = 0.3 / ca,
    xb = xe + 0.05;
  for (const e of stepped ? [-1] : [-1, 1])
    for (const sg of [-1, 1]) {
      const poly = [[sg * xb, yTop(xb)], [0, yTop(0)], [0, yTop(0) - hb], [sg * xb, yTop(xb) - hb]];
      const za = e > 0 ? zB + 0.004 : zA - 0.066,
        zb = za + 0.062;
      B.get(fasciaM).prism(sg > 0 ? poly : poly.slice().reverse(), za, zb);
    }
  // ridge: a half-round run of ridge tiles, each joint marked by the next tile's collar
  const yR = h + rise + T + 0.04,
    rr = 0.16,
    as = Math.min(1.35, a + 0.25),
    RG = B.get(ridgeM),
    ns = 6;
  const ridgeRing = (z, rad) => {
    const out = [];
    for (let k = 0; k <= ns; k++) {
      const th = -as + (k / ns) * (Math.PI + 2 * as),
        nx = Math.cos(th),
        ny = Math.sin(th);
      out.push([[nx * rad, yR + ny * rad, z], [nx, ny, 0]]);
    }
    return out;
  };
  {
    const R0 = ridgeRing(zA - 0.06, rr),
      R1 = ridgeRing(zB + 0.06, rr);
    for (let k = 0; k < ns; k++) RG.squad(R1[k][0], R1[k + 1][0], R0[k + 1][0], R0[k][0], R1[k][1], R1[k + 1][1], R0[k + 1][1], R0[k][1]);
    for (const [Rr, sgn] of [[R0, -1], [R1, 1]]) for (let k = 0; k < ns; k++) RG.tri([0, yR - 0.02, Rr[0][0][2]], Rr[k][0], Rr[k + 1][0], [0, 0, sgn]);
    if (tier === 2) {
      const step = 0.62,
        nk = Math.floor((zB - zA) / step);
      for (let j = 1; j < nk; j++) {
        const z = zA + j * step,
          A0 = ridgeRing(z - 0.035, rr + 0.022),
          A1 = ridgeRing(z + 0.035, rr + 0.022);
        for (let k = 0; k < ns; k++) RG.squad(A1[k][0], A1[k + 1][0], A0[k + 1][0], A0[k][0], A1[k][1], A1[k + 1][1], A0[k + 1][1], A0[k][1]);
      }
    }
  }
  // crow steps on the street gable: stone steps climbing to an apex pier, each with a coping cap
  if (stepped) {
    const S = B.get(capM),
      n = Math.max(3, Math.round(half / 0.72)),
      sw = half / n,
      z0 = D / 2 - 0.42,
      z1 = D / 2 + 0.07;
    for (const sg of [-1, 1])
      for (let i = 0; i < n; i++) {
        const xa = half - i * sw,
          xb2 = xa - sw,
          top = h + ((i + 1) / n) * rise + T + 0.38;
        const [lo, hi] = sg > 0 ? [xb2, xa] : [-xa, -xb2];
        S.box(lo, h - 0.05, z0, hi, top, z1, 'ny');
        S.slab(lo - 0.05, top, z0 - 0.05, hi + 0.05, top + 0.12, z1 + 0.05, 0.03, false);
      }
    S.box(-0.32, h + rise, z0, 0.32, h + rise + T + 0.95, z1, 'ny');
    S.slab(-0.38, h + rise + T + 0.95, z0 - 0.06, 0.38, h + rise + T + 1.08, z1 + 0.06, 0.03, false);
    B.get(brassM).lathe([[0.001, 0], [0.12, 0.08], [0.1, 0.22], [0.001, 0.36]], 8, 0, h + rise + T + 1.08, (z0 + z1) / 2);
  }
  // dormers on the street slope (eaves to the street): a gabled box with a window, its cheeks cut by the slope
  if (alongX && tier > 0 && rise > 2.4) {
    const nd = Math.max(1, Math.min(2, Math.floor(D / 2.8))),
      dw = 1.05,
      xf = xe - 1.0,
      yb = yE + (xe - xf) * ta,
      yw = yb + 1.25,
      yr = yw + dw * 0.45,
      xin = xe - (yw - yE) / ta,
      xr = xe - (yr - yE) / ta;
    for (let k = 0; k < nd; k++) {
      const zc = nd === 1 ? 0 : (k - 0.5) * D * 0.42,
        sg = -1,
        X = (v) => sg * v;
      const Bd = B.get(bodyM),
        R = B.get(tileM0),
        Fm = B.get(frameM),
        Gl = B.get(glassM);
      for (const e of [-1, 1]) Bd.tri([X(xf), yb - 0.1, zc + (e * dw) / 2], [X(xf), yw, zc + (e * dw) / 2], [X(xin), yw, zc + (e * dw) / 2], [0, 0, e]);
      Bd.quad([X(xf), yb - 0.1, zc - dw / 2], [X(xf), yb - 0.1, zc + dw / 2], [X(xf), yw, zc + dw / 2], [X(xf), yw, zc - dw / 2], [sg, 0, 0]);
      Bd.tri([X(xf), yw, zc - dw / 2], [X(xf), yw, zc + dw / 2], [X(xf), yr, zc], [sg, 0, 0]);
      for (const e of [-1, 1]) R.quad([X(xf + 0.16), yw - 0.06, zc + e * (dw / 2 + 0.14)], [X(xf + 0.16), yr + 0.04, zc], [X(xr), yr + 0.04, zc], [X(xin - 0.1), yw - 0.06, zc + e * (dw / 2 + 0.14)], [sg * 0.2, 1, e]);
      // the window: frame, glass, a cross bar, a little sill
      Fm.box(X(xf) - 0.06, yb + 0.12, zc - 0.36, X(xf) + 0.06, yw - 0.1, zc + 0.36);
      Gl.quad([X(xf + 0.065), yb + 0.2, zc - 0.29], [X(xf + 0.065), yb + 0.2, zc + 0.29], [X(xf + 0.065), yw - 0.18, zc + 0.29], [X(xf + 0.065), yw - 0.18, zc - 0.29], [sg, 0, 0]);
      Fm.box(X(xf + 0.08) - 0.015, yb + 0.2, zc - 0.02, X(xf + 0.08) + 0.015, yw - 0.18, zc + 0.02);
      Fm.box(X(xf + 0.08) - 0.015, yb + 0.72, zc - 0.29, X(xf + 0.08) + 0.015, yb + 0.76, zc + 0.29);
      B.get(capM).box(X(xf + 0.2) - 0.1, yb + 0.04, zc - 0.42, X(xf + 0.2) + 0.1, yb + 0.14, zc + 0.42);
    }
  }
  // iron cresting along some ridges, spear finials at its ends
  if (tier > 0 && hash01(seed, 17) > 0.72) {
    const Cr = B.get(ironM),
      yC = yR + rr + 0.02;
    Cr.tube([[0, yC + 0.22, zA + 0.2], [0, yC + 0.22, zB - 0.2]], 0.018, 4);
    for (let z = zA + 0.3; z < zB - 0.25; z += 0.42) Cr.lathe([[0.012, yC - 0.05], [0.012, yC + 0.22], [0.035, yC + 0.27], [0.001, yC + 0.36]], 4, 0, 0, z);
    for (const z of [zA + 0.2, zB - 0.2]) B.get(brassM).lathe([[0.03, yC - 0.05], [0.03, yC + 0.4], [0.07, yC + 0.47], [0.001, yC + 0.7]], 6, 0, 0, z);
  }
  flushRoof(B, r, h, seed);
  // a turned finial on some gables
  if (tier > 0 && hash01(seed, 13) > 0.55)
    for (const e of stepped ? [-1] : [-1, 1]) {
      const z = e * (zB + 0.035);
      r.add(cyl(0.05, 0.07, 0.75, fasciaM, 0, yTop(0) + 0.25, z, 6), sphere(0.11, brassM, 0, yTop(0) + 0.7, z, 8, 6));
    }
  if (alongX) r.rotation.y = Math.PI / 2;
  g.add(r);
  return { top: yR + rr };
}

/**
 * Pyramid roof (the 'cone' houses: a tall four-sided spire) over a w x d body whose walls end at h, rise to the
 * apex. Courses round all four faces, hip rolls on the hips, a fascia ring and a brass finial.
 */
export function modelHip(g, w, d, h, rise, roofM, ov = 0.55, seed = 1) {
  const tier = roofTier(),
    B = new ByMat(),
    r = new THREE.Group();
  const ex = w / 2 + ov,
    ez = d / 2 + ov,
    drop = ov * 0.5,
    yE = h + 0.2 - drop,
    yA = h + rise + 0.2;
  const tileM = modelTile(roofM),
    T1 = B.get(tileM);
  const slant = Math.hypot(Math.max(ex, ez), yA - yE),
    nc = Math.max(4, Math.round(slant / ((tier === 2 ? 0.36 : tier === 1 ? 0.46 : 0.66) * (0.94 + 0.12 * hash01(seed, 3))))),
    lip = 0.045;
  // faces: [edge start corner, edge end corner] (counter-clockwise seen from above), apex at (0, yA, 0)
  const C = [[-ex, ez], [ex, ez], [ex, -ez], [-ex, -ez]];
  const apex = [0, yA, 0];
  for (let f = 0; f < 4; f++) {
    const [ax, az] = C[f],
      [bx, bz] = C[(f + 1) % 4];
    const A = [ax, yE, az],
      Bp = [bx, yE, bz];
    // face normal (outward, up)
    const u = new THREE.Vector3(bx - ax, 0, bz - az),
      v = new THREE.Vector3(-ax, yA - yE, -az),
      nn = new THREE.Vector3().crossVectors(v, u).normalize();
    if (nn.y < 0) nn.negate();
    const n = [nn.x, nn.y, nn.z];
    const at = (p, q, t, l) => [p[0] + (apex[0] - p[0]) * t + n[0] * l, p[1] + (apex[1] - p[1]) * t + n[1] * l, p[2] + (apex[2] - p[2]) * t + n[2] * l];
    const dn = [n[0], -n[1] * 0.2 - 0.5, n[2]];
    for (let i = 0; i < nc; i++) {
      const t0 = i / nc,
        t1 = Math.min(0.985, (i + 1) / nc);
      T1.quad(at(A, 0, t0, lip), at(Bp, 0, t0, lip), at(Bp, 0, t1, 0), at(A, 0, t1, 0), n);
      T1.quad(at(A, 0, t0, i ? 0 : -0.07), at(Bp, 0, t0, i ? 0 : -0.07), at(Bp, 0, t0, lip), at(A, 0, t0, lip), dn);
    }
    // fascia along the eave edge and the underside
    const F = B.get(fasciaM),
      o = [n[0], 0, n[2]];
    const ol = Math.hypot(o[0], o[2]) || 1;
    o[0] /= ol;
    o[2] /= ol;
    const e0 = [ax + o[0] * 0.05, yE - 0.27, az + o[2] * 0.05],
      e1 = [bx + o[0] * 0.05, yE - 0.27, bz + o[2] * 0.05];
    F.quad(e0, e1, [e1[0], yE + 0.01, e1[2]], [e0[0], yE + 0.01, e0[2]], o);
    F.quad([e0[0], yE - 0.27, e0[2]], [e1[0], yE - 0.27, e1[2]], [bx, yE - 0.27, bz], [ax, yE - 0.27, az], [0, -1, 0]);
    const kx = w / 2 / ex,
      kz = d / 2 / ez;
    B.get(soffitM).quad([ax, yE - 0.26, az], [bx, yE - 0.26, bz], [bx * kx, h, bz * kz], [ax * kx, h, az * kz], [0, -1, 0]);
  }
  // hip rolls
  const HR = B.get(modelTile(roofM, 0.84));
  for (const [cx, cz] of C) HR.tube([[cx * 1.01, yE + 0.06, cz * 1.01], [0, yA + 0.05, 0]], 0.1, tier ? 6 : 4, true);
  flushRoof(B, r, h, seed);
  r.add(cyl(0.06, 0.1, 1.1, brassM, 0, yA + 0.5, 0, 6), sphere(tier ? 0.2 : 0.16, brassM, 0, yA + 1.15, 0, 9, 7));
  if (tier > 0) r.add(cyl(0.012, 0.012, 0.9, brassM, 0, yA + 1.7, 0, 4));
  g.add(r);
  return { top: yA + 1.2 };
}

/**
 * Chimney stack standing at (cx, cz) from the wall top `top` to its crown `tip`: brick shaft, a stone band where it
 * leaves the roof, a corbelled crown, a stone cap and one to three clay pots.
 */
export function chimney(g, cx, cz, top, tip, seed = 1, flues = 1) {
  const tier = roofTier(),
    B = new ByMat(),
    s = 0.36,
    sx = s + (flues - 1) * 0.34; // a stack of several flues side by side
  const bk = B.get(brickM);
  bk.box(cx - sx, top, cz - s, cx + sx, tip - 0.12, cz + s, 'ny');
  // corbel: two courses stepping out
  bk.box(cx - sx - 0.05, tip - 0.12, cz - s - 0.05, cx + sx + 0.05, tip + 0.02, cz + s + 0.05);
  if (tier > 0) bk.box(cx - sx - 0.1, tip + 0.02, cz - s - 0.1, cx + sx + 0.1, tip + 0.12, cz + s + 0.1, 'ny');
  const cp = B.get(capM),
    cs = s + (tier > 0 ? 0.16 : 0.1),
    csx = sx + (tier > 0 ? 0.16 : 0.1);
  cp.slab(cx - csx, tip + 0.12, cz - cs, cx + csx, tip + 0.24, cz + cs, 0.035, false);
  CHIMNEY_TOPS.push(cx, tip + 0.6, cz, flues);
  const band = tier > 0 ? B.get(capM) : null;
  if (band) band.box(cx - sx - 0.03, tip - 0.62, cz - s - 0.03, cx + sx + 0.03, tip - 0.52, cz + s + 0.03);
  const pots = Math.max(flues, 1 + Math.floor(hash01(seed, 21) * (tier === 2 ? 3 : 2))),
    P = B.get(potM);
  for (let i = 0; i < pots; i++) {
    const px = cx + (pots === 1 ? 0 : (i / (pots - 1) - 0.5) * (sx * 2 - s * 0.9)),
      hgt = 0.34 + 0.16 * hash01(seed + i, 23);
    P.lathe([[0.13, 0], [0.1, hgt * 0.85], [0.135, hgt], [0.105, hgt + 0.02]], 7, px, tip + 0.24, cz);
    B.get(rafterM).lathe([[0.1, hgt - 0.03], [0, hgt - 0.03]], 5, px, tip + 0.24, cz);
  }
  B.flush(g);
}
