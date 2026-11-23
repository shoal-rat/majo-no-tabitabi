// House types of the City of Magic (art round 2), laid over mage-city.js townhouse: half-timbered jettied upper
// storeys (posts on the bay lines, sill and head rails, braces between the windows), stone burgher houses (quoins on
// the corners; their crow-stepped gable is city-roofs.js), narrow tower-houses with a corbel table under the roof, and
// corner turrets corbelled out from the second storey with a coursed spire. All plain geometry merged by the bake.
import * as THREE from 'three';
import { mat } from './kit.js';
import { ByMat, GeoBuilder, hash01 } from './city-geo.js';
import { coursedSpire, corbel, lancet } from './city-stone.js';

const timberM = mat.wood(0x4a3326),
  stoneM = mat.stone(0xe3d8c2),
  quoinM = mat.stone(0xd2c4a6),
  darkM = mat.paint(0x2e3238);

/**
 * Half-timber over one section's faces (house frame): w x d block from y0, n storeys of FH, offset dz, bays per face
 * (bw front/back, bd sides). Posts stand between the bays, so the windows sit in the panels.
 */
export function halfTimber(g, w, d, y0, n, FH, dz, bw, bd, seed, lite) {
  const B = new ByMat(), T = B.get(timberM), t = 0.15, out = 0.11;
  const faces = [[0, 0, dz + d / 2 + 0.02, w, bw], [Math.PI, 0, dz - d / 2 - 0.02, w, bw], [Math.PI / 2, w / 2 + 0.02, dz, d, bd], [-Math.PI / 2, -w / 2 - 0.02, dz, d, bd]];
  const pattern = Math.floor(hash01(seed, 71) * 3); // 0 K-braces, 1 St Andrew's crosses, 2 plain posts and rails
  for (const [ry, ox, oz, W, nb] of lite ? faces.slice(0, 2) : faces) {
    const f = new GeoBuilder(), Wb = W / nb, H = n * FH;
    for (let j = 0; j <= nb; j++) {
      const x = -W / 2 + j * Wb;
      f.box(x - t / 2, 0, 0, x + t / 2, H, out, 'nz');
    }
    for (let m = 0; m <= n; m++) f.box(-W / 2, m * FH - t / 2, 0, W / 2, m * FH + t / 2, out + 0.01, 'nz');
    for (let m = 0; m < n; m++) {
      f.box(-W / 2, m * FH + 0.36, 0, W / 2, m * FH + 0.36 + t * 0.8, out, 'nz');
      if (pattern === 2 || lite) continue;
      for (let j = 0; j <= nb; j++) {
        const x = -W / 2 + j * Wb;
        // braces in the strip beside each post (the windows keep the panel middles)
        for (const s of [-1, 1]) {
          if ((j === 0 && s < 0) || (j === nb && s > 0)) continue;
          const xa = x + s * 0.09, xb = x + s * Math.min(0.32, Wb * 0.2), ya = m * FH + 0.45, yb = m * FH + FH - 0.1;
          const [p0, p1] = pattern === 0 ? [[xa, ya], [xb, (ya + yb) / 2]] : [[xa, ya], [xb, yb]];
          const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy), nx = (-dy / L) * t * 0.45, ny = (dx / L) * t * 0.45;
          f.prism([[p0[0] - nx, p0[1] - ny], [p1[0] - nx, p1[1] - ny], [p1[0] + nx, p1[1] + ny], [p0[0] + nx, p0[1] + ny]], 0, out - 0.01, 2);
        }
      }
    }
    T.append(f, new THREE.Matrix4().makeRotationY(ry).setPosition(ox, y0, oz));
  }
  B.flush(g);
}

/** Long-and-short quoins up the four corners of a w x d block from y0 to y1 (stone burgher houses). */
export function quoins(g, w, d, y0, y1, dz = 0) {
  const B = new ByMat(), Q = B.get(quoinM), c = 0.24;
  let k = 0;
  for (let y = y0; y < y1 - 0.2; y += 0.62, k++) {
    const h = Math.min(0.56, y1 - y - 0.06), long = k % 2 ? 0.6 : 0.36;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const cx = (sx * w) / 2, cz = dz + (sz * d) / 2;
        Q.box(sx > 0 ? cx - long : cx - 0.035, y, sz > 0 ? cz - 0.035 : cz - c, sx > 0 ? cx + 0.035 : cx + long, y + h, sz > 0 ? cz + c : cz + 0.035);
        Q.box(sx > 0 ? cx - c : cx - 0.035, y, sz > 0 ? cz - (k % 2 ? 0.36 : 0.6) : cz - 0.035, sx > 0 ? cx + 0.035 : cx + c, y + h, sz > 0 ? cz + 0.035 : cz + (k % 2 ? 0.36 : 0.6));
      }
  }
  B.flush(g);
}

/** A table of stone corbels round a w x d block just under y (tower-houses), each side facing out. */
export function corbelTable(g, w, d, y, dz = 0, lite = false) {
  const B = new ByMat();
  for (const [ry, ox, oz, W] of [[0, 0, dz + d / 2, w], [Math.PI, 0, dz - d / 2, w], [Math.PI / 2, w / 2, dz, d], [-Math.PI / 2, -w / 2, dz, d]]) {
    const f = new ByMat(), n = Math.max(2, Math.round(W / (lite ? 1.4 : 0.8)));
    for (let i = 0; i < n; i++) corbel(f.get(stoneM), -W / 2 + ((i + 0.5) * W) / n, 0, 0, 0.32, 0.36);
    f.get(stoneM).slab(-W / 2 - 0.36, 0, -0.05, W / 2 + 0.36, 0.18, 0.42, 0.03, false);
    for (const [m, gb] of f.map) B.get(m).append(gb, new THREE.Matrix4().makeRotationY(ry).setPosition(ox, y, oz));
  }
  B.flush(g);
}

/**
 * Corner turret at house-frame (cx, cz), from y0 (a corbelled cone beneath) to y1, radius r, with lancet lights, a
 * moulded ring and a coursed spire of `roofM` (city-roofs modelTile copy passed in), a brass finial.
 */
export function cornerTurret(g, cx, cz, y0, y1, r, bodyM, spireM, brassM, seed, lite) {
  const B = new ByMat(), seg = lite ? 10 : 16;
  B.get(stoneM).lathe([[0.18, y0 - 1.9], [r * 0.55, y0 - 1.2], [r * 0.92, y0 - 0.35], [r + 0.06, y0 - 0.12], [r + 0.06, y0 + 0.08], [r, y0 + 0.1]], seg, cx, 0, cz, 1, 0, true);
  B.get(bodyM).lathe([[r, y0 + 0.1], [r, y1]], seg, cx, 0, cz);
  B.get(stoneM).lathe([[r, y1], [r + 0.16, y1 + 0.08], [r + 0.2, y1 + 0.26], [r + 0.04, y1 + 0.34]], seg, cx, 0, cz, 0, 0, true);
  coursedSpire(B.get(spireM), r + 0.22, r * 2.9, 0.34, y1 + 0.32, seg, 0.18);
  const tip = y1 + 0.32 + r * 2.9;
  B.get(brassM).lathe([[0.04, tip - 0.1], [0.04, tip + 0.35], [0.11, tip + 0.42], [0.001, tip + 0.62]], 6, cx, 0, cz);
  // lancet lights round the drum, one per storey, facing out of the corner
  const a0 = Math.atan2(Math.sign(cx) || 1, Math.sign(cz) || 1);
  for (let y = y0 + 0.7; y < y1 - 2.2; y += 3.15)
    for (const da of lite ? [0] : [-0.75, 0, 0.75]) {
      const a = a0 + da, f = new ByMat();
      lancet(f.get(stoneM), f.get(darkM), 0, 0, 0.42, 1.5, 0.1, false);
      for (const [m, gb] of f.map) B.get(m).append(gb, new THREE.Matrix4().makeRotationY(a).setPosition(cx + Math.sin(a) * r, y, cz + Math.cos(a) * r));
    }
  B.flush(g);
  return tip;
}
