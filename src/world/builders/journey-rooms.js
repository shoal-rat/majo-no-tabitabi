// Accessible rooms for the first two episodes. Individual walls can cut away only if
// the orbit camera is outside that face and the traveller is physically inside.
import * as THREE from 'three';
import { G } from '../../core/game.js';
import { box, cyl, cone, sphere, torus, bakeStatic } from '../../core/geo.js';
import { Site, mat, beam, texMat, textTexture, bevelBox, shadeBaked, collapseFamilies } from './kit.js';
import { cbox, homeWindow, tiledRoof, chimney, flowerBox, vine, homeDetail } from './home-parts.js';
import { t } from '../../core/i18n.js';
import { procTree } from './decor.js';
import { glow } from '../../core/mats.js';
import { paintedBlock } from './mage-city.js';
import { mulberry32 } from '../../core/util.js';

const wallMat = mat.plaster(0xe2d3ae),
  wood = mat.wood(0x76513a),
  oak = mat.wood(0x977047),
  dark = mat.wood(0x49392e);
const trimWood = mat.wood(0x966f4c);
const red = mat.cloth(0x99483e),
  teal = mat.cloth(0x465c57),
  linen = mat.cloth(0xe5d9c3),
  gold = mat.metal(0xc09445);
const slate = mat.tile(0x566c70),
  brick = mat.stone(0xb68871),
  stone = mat.stone(0xaba18e),
  glass = mat.paint(0x899fa5);
const paper = mat.paper(0xead6a6),
  ink = mat.paint(0x76553d);
function rect(g, x, y, z, w, h, d, m) {
  const o = box(w, h, d, m, x, y, z);
  g.add(o);
  return o;
}
function chair(g, x, z, angle, am = teal, big = false) {
  const a = new THREE.Group(),
    s = big ? 1.35 : 1;
  rect(a, 0, 0.38, 0, 0.72, 0.16, 0.66, oak);
  rect(a, 0, 0.51, 0, 0.66, 0.15, 0.58, am);
  rect(a, 0, 0.88, -0.33, 0.71, 0.74, 0.14, am);
  for (const side of [-1, 1]) {
    for (const dz of [-0.25, 0.25]) rect(a, side * 0.28, 0.19, dz, 0.11, 0.38, 0.11, dark);
    if (big) {
      rect(a, side * 0.36, 0.68, 0, 0.12, 0.16, 0.7, oak);
      rect(a, side * 0.33, 0.64, 0.27, 0.1, 0.25, 0.12, oak);
    }
  }
  a.scale.setScalar(s);
  a.rotation.y = angle;
  a.position.set(x, 0, z);
  g.add(a);
}
function table(g, x, z, w, d, h) {
  rect(g, x, h, z, w, 0.14, d, oak);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) rect(g, x + sx * (w / 2 - 0.15), h / 2, z + sz * (d / 2 - 0.14), 0.13, h, 0.13, wood);
}
function openBook(g, x, y, z) {
  for (const side of [-1, 1]) {
    const cover = rect(g, x + side * 0.24, y, z, 0.48, 0.065, 0.62, red);
    cover.rotation.z = -side * 0.11;
    const page = rect(g, x + side * 0.23, y + 0.042, z, 0.44, 0.05, 0.56, paper);
    page.rotation.z = -side * 0.11;
    for (let j = 0; j < 6; j++)
      rect(g, x + side * 0.24, y + 0.081, z - 0.19 + j * 0.068, 0.24 - 0.012 * (j % 3), 0.008, 0.012, ink);
  }
}
function framedWindow(g, x, y, z, w, h) {
  rect(g, x, y, z, w + 0.28, h + 0.29, 0.19, dark);
  rect(g, x, y, z + 0.11, w, h, 0.09, glass);
  for (const s of [-0.26, 0, 0.26]) rect(g, x + w * s, y, z + 0.18, 0.08, h, 0.08, oak);
  for (const s of [-0.32, 0, 0.32]) rect(g, x, y + h * s, z + 0.18, w, 0.09, 0.08, oak);
  rect(g, x, y - h / 2 - 0.15, z + 0.11, w + 0.58, 0.18, 0.52, stone);
}
function shelf(g, x, z, books = true) {
  rect(g, x, 1.38, z, 2.75, 2.76, 0.34, dark);
  for (let j = 0; j < 4; j++) {
    const y = 0.22 + j * 0.66;
    rect(g, x, y, z + 0.2, 2.86, 0.14, 0.7, oak);
    if (books)
      for (let i = 0; i < 8; i++) {
        const height = 0.37 + ((i * 3 + j) % 5) * 0.032;
        const b = rect(
          g,
          x - 1.1 + i * 0.29,
          y + 0.09 + height / 2,
          z + 0.19,
          0.15 + 0.024 * (i % 3),
          height,
          0.42,
          [teal, red, wood, gold][(j + i) % 4]
        );
        b.rotation.z = i === 6 ? 0.14 : 0;
      }
  }
}
const fireGold = new THREE.MeshBasicMaterial({ color: 0xffab38 }),
  fireCore = new THREE.MeshBasicMaterial({ color: 0xffe290 });
function curtains(g, x, z, w, h, angle) {
  const panel = new THREE.Group();
  const cloth = mat.cloth(0x48666b),
    shade = mat.cloth(0x374e52);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const xx = side * (w * 0.42 + i * 0.11),
        wide = 0.15 + 0.055 * (i % 2);
      const top = rect(panel, xx, h * 0.73, 0.09 + (i % 2) * 0.08, wide, h * 0.52, 0.15, i % 2 ? cloth : shade);
      top.rotation.z = side * 0.08;
      const skirt = rect(
        panel,
        xx + 0.14 * side,
        h * 0.31,
        0.1 + (i % 2) * 0.09,
        wide,
        h * 0.35,
        0.15,
        i % 2 ? cloth : shade
      );
      skirt.rotation.z = -side * 0.14;
    }
    rect(panel, side * (w * 0.41 + 0.32), h * 0.48, 0.29, 0.83, 0.13, 0.18, gold);
  }
  rect(panel, 0, h + 0.02, 0, w + 2.8, 0.15, 0.22, dark);
  panel.rotation.y = angle;
  panel.position.set(x, 0, z);
  g.add(panel);
}
function candlestick(g, x, y, z) {
  g.add(
    cyl(0.16, 0.24, 0.08, gold, x, y + 0.04, z, 8),
    cyl(0.041, 0.067, 0.38, gold, x, y + 0.23, z, 8),
    cyl(0.082, 0.08, 0.3, paper, x, y + 0.54, z, 8),
    sphere(0.048, fireCore, x, y + 0.75, z, 7, 5)
  );
}
function plant(g, x, z, height) {
  g.add(cyl(0.31, 0.22, 0.47, brick, x, 0.245, z, 9));
  for (let j = 0; j < 7; j++) {
    const a = j * 2.4,
      xy = 0.34 + 0.06 * (j % 3),
      hy = height * (0.55 + (j % 3) * 0.19);
    g.add(beam(x, 0.4, z, x + Math.sin(a) * xy, hy, z + Math.cos(a) * xy, 0.028, 0.029, oak));
    const l = sphere(
      0.27,
      mat.paint(j % 2 ? 0x587653 : 0x758956),
      x + Math.sin(a) * xy,
      hy,
      z + Math.cos(a) * xy,
      6,
      5
    );
    l.scale.set(0.58, 1, 0.38);
    g.add(l);
  }
}
function hearth(g, z, grand) {
  const w = grand ? 4.7 : 3.65;
  rect(g, 0, 2.05, z, w, 4.1, 0.7, stone);
  rect(g, 0, 1.12, z + 0.4, w * 0.69, 2.24, 0.18, dark);
  const masonry = mat.stone(0xbea589);
  for (let i = 0; i < 11; i++) {
    const a = (i * Math.PI) / 10,
      r = w * 0.32,
      blk = rect(g, r * Math.cos(a), 1.1 + r * Math.sin(a), z + 0.58, 0.41, 0.32, 0.3, i % 2 ? stone : masonry);
    blk.rotation.z = a;
  }
  for (const side of [-1, 1]) {
    rect(g, side * w * 0.32, 0.75, z + 0.55, 0.34, 1.5, 0.29, masonry);
    const log = cyl(0.11, 0.145, 0.93, dark, side * 0.42, 0.51, z + 0.69, 8);
    log.rotation.z = side * 0.98;
    g.add(log);
  }
  for (let i = 0; i < 11; i++) {
    const a = i * 1.4,
      f = sphere(
        0.19,
        i % 3 ? fireGold : fireCore,
        Math.cos(a) * 0.58,
        0.68 + 0.13 * Math.sin(a * 5),
        z + 0.65 + Math.sin(a) * 0.14,
        7,
        5
      );
    f.scale.set(0.66, 1.6 + 0.38 * (i % 3), 0.65);
    f.rotation.z = 0.3 * Math.sin(a);
    g.add(f);
  }

  for (let i = -2; i <= 2; i++) {
    const f = cone(0.3, 0.64 + 0.12 * (2 - Math.abs(i)), i % 2 ? fireGold : fireCore, i * 0.32, 0.66, z + 0.62, 6);
    f.rotation.z = 0.21 * i;
    g.add(f);
  }
  rect(g, 0, 0.17, z + 0.7, w + 0.45, 0.34, 1.5, brick);
  rect(g, 0, 2.35, z + 0.2, w + 0.65, 0.28, 1.1, stone);
  if (grand) {
    const hood = cone(2.25, 3.7, mat.stone(0xbaafa0), 0, 4.05, z + 0.15, 4);
    hood.rotation.y = Math.PI / 4;
    hood.scale.z = 0.46;
    g.add(hood);
    rect(g, 0, 6.57, z, 1.63, 2.85, 0.77, stone);
    for (const side of [-1, 1]) {
      rect(g, side * w * 0.42, 1.32, z + 0.55, 0.46, 2.65, 0.64, masonry);
      rect(g, side * w * 0.42, 2.64, z + 0.53, 0.69, 0.24, 0.86, stone);
    }
  } else {
    rect(g, 0, 3.29, z + 0.39, 2.17, 1.41, 0.12, wood);
    rect(g, 0, 3.29, z + 0.47, 1.91, 1.15, 0.07, mat.paint(0xe6b565));
    for (let i = -2; i <= 2; i++) {
      rect(g, 0.37 * i, 3.29, z + 0.53, 0.045, 1.15, 0.075, gold);
    }
    for (const off of [-0.29, 0.29]) rect(g, 0, 3.29 + off, z + 0.53, 1.91, 0.055, 0.075, gold);
  }
}
function bed(g, x, z, cover = teal) {
  rect(g, x, 0.4, z, 1.83, 0.48, 2.89, wood);
  rect(g, x, 0.69, z, 1.72, 0.23, 2.8, linen);
  rect(g, x, 0.83, z - 0.86, 1.21, 0.2, 0.58, paper);
  rect(g, x, 0.83, z + 0.46, 1.75, 0.14, 1.42, cover);
  rect(g, x, 0.91, z + 0.89, 1.76, 0.08, 0.16, gold);
  rect(g, x, 0.87, z - 1.4, 1.94, 1.19, 0.15, wood);
}

// ---- episode-one / two furnishings (after the stills: Fran's parlour, Elaina's hearth, the inn at night) ----
const innPlaster = mat.plaster(0xc6a46d),
  franStone = mat.plaster(0xa39f97),
  pilasterM = mat.stone(0x8f8c86),
  ironM = mat.paint(0x2b2b2e),
  nightGlass = mat.paint(0x1f2d45),
  velvet = mat.cloth(0x3e5d52),
  gilt = mat.metal(0xd2a54e),
  potM = mat.paint(0xd9c66e),
  leafA = mat.paint(0x587a4c),
  leafB = mat.paint(0x7a9a5a),
  sheer = mat.cloth(0xe3ebf0),
  blueCover = mat.cloth(0x4a6a9a);
const lampGlow = glow(0xffb45c, 2.4),
  leafGlow = glow(0xffd88a, 1.9);
// modelled shells (art round "home"): window parts, roofs and chimneys per room (builders/home-parts.js)
const archStone = mat.stone(0xbab3a6),
  flowerMats = [0xe8737c, 0xf6f1ec, 0xd889c8].map((c) => mat.paint(c));
const winParts = (surround, sash, shutter) => ({ surround, head: surround, sill: stone, sash, glass, shutter, iron: ironM, box: wood, soil: mat.stone(0x6d5546), leaf: leafA, bloom: flowerMats });
const WIN = {
  home: winParts(wood, mat.paint(0xeee4d0), mat.wood(0x6f8f74, { detail: 0.5 })),
  fran: winParts(dark, oak, dark),
  inn: winParts(dark, oak, dark),
};
const roofParts = (c, deck) => ({
  deck: mat.tile(deck, { detail: 0.22, bump: 0.3 }), tiles: [c, ...[1.08, 0.92].map((k) => new THREE.Color(c).multiplyScalar(k).getHex())].map((v) => mat.tile(v, { detail: 0.22, bump: 0.3 })),
  ridge: mat.tile(new THREE.Color(c).multiplyScalar(0.85).getHex(), { detail: 0.22, bump: 0.3 }), mortar: mat.stone(0xd9cfbd), fascia: wood, rafter: dark, barge: wood,
});
const ROOF = { home: roofParts(0x566c70, 0x3a4a4e), fran: roofParts(0x4f6466, 0x354446), inn: roofParts(0xb6735a, 0x7a4a3a) };
const CHIM = { stack: brick, joint: mat.stone(0xa47a66), cap: stone, pot: mat.stone(0xc57c56) };
function shellMat(kind) {
  return kind === 'inn' ? innPlaster : kind === 'fran' ? franStone : wallMat;
}
/** Tall round-headed window with a grid of night-dark panes (Fran's parlour). Faces +z at z. */
function archWindow(g, x, y0, z, ww, wh) {
  const r = ww / 2,
    rh = wh - r;
  rect(g, x, y0 + rh / 2, z, ww + 0.3, rh, 0.16, ironM);
  const fd = cyl(r + 0.15, r + 0.15, 0.16, ironM, x, y0 + rh, z, 18);
  fd.rotation.x = Math.PI / 2;
  rect(g, x, y0 + rh / 2, z + 0.06, ww, rh, 0.06, nightGlass);
  const gd = cyl(r, r, 0.06, nightGlass, x, y0 + rh, z + 0.06, 18);
  gd.rotation.x = Math.PI / 2;
  g.add(fd, gd);
  for (let i = 1; i < 4; i++) {
    const dx = -r + (ww * i) / 4,
      top = rh + Math.sqrt(Math.max(0, r * r - dx * dx));
    rect(g, x + dx, y0 + top / 2, z + 0.1, 0.05, top, 0.04, ironM);
  }
  for (let j = 1; j * 0.72 < rh + r * 0.6; j++) {
    const y = j * 0.72,
      half = y > rh ? Math.sqrt(Math.max(0, r * r - (y - rh) ** 2)) : r;
    rect(g, x, y0 + y, z + 0.1, half * 2, 0.05, 0.04, ironM);
  }
  rect(g, x, y0 - 0.08, z + 0.12, ww + 0.5, 0.16, 0.4, stone);
  // dressed stone surround: jambs, a ring of voussoirs and a keystone, so the opening reads as cut through the wall
  const lv = homeDetail(), k = lv ? 0.025 : 0, R = r + 0.3, n = lv ? 9 : 5;
  for (const s of [-1, 1]) g.add(cbox(0.26, rh + 0.02, 0.2, archStone, x + s * R, y0 + rh / 2, z + 0.04, k));
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * (i + 0.5)) / n, key = i === (n - 1) / 2;
    const v = cbox(key ? 0.3 : 0.27, (Math.PI * R) / n - 0.03, key ? 0.26 : 0.2, archStone, x + Math.cos(a) * R, y0 + rh + Math.sin(a) * R, z + (key ? 0.07 : 0.04), k);
    v.rotation.z = a;
    g.add(v);
  }
}
function pilaster(g, u, height) {
  rect(g, u, height / 2, 0.36, 0.7, height, 0.3, pilasterM);
  rect(g, u, 0.3, 0.42, 0.92, 0.6, 0.42, pilasterM);
  rect(g, u, height - 0.35, 0.42, 0.92, 0.3, 0.42, pilasterM);
}
function flames(g, z, w = 1) {
  for (let i = 0; i < 9; i++) {
    const a = i * 1.4,
      f = sphere(0.18 * w, i % 3 ? fireGold : fireCore, Math.cos(a) * 0.5 * w, 0.6 + 0.12 * Math.sin(a * 5), z + Math.sin(a) * 0.12, 7, 5);
    f.scale.set(0.66, 1.6 + 0.38 * (i % 3), 0.65);
    g.add(f);
  }
  for (let i = -2; i <= 2; i++) {
    const f = cone(0.28 * w, 0.6 + 0.12 * (2 - Math.abs(i)), i % 2 ? fireGold : fireCore, i * 0.3 * w, 0.62, z, 6);
    f.rotation.z = 0.2 * i;
    g.add(f);
  }
  for (const s of [-1, 1]) {
    const log = cyl(0.1, 0.13, 0.9 * w, dark, s * 0.35 * w, 0.42, z + 0.05, 8);
    log.rotation.z = s * 1.0;
    g.add(log);
  }
}
/** Fran's fireplace: a tall grey breast tapering to the ceiling, a round-headed opening, a carved band, an iron grille. */
function franHearth(g, z, height) {
  const gm = mat.stone(0x9a968e),
    dk = mat.stone(0x6f6b66);
  rect(g, 0, 1.7, z + 0.1, 4.0, 3.4, 1.2, gm);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    rect(g, 0, 3.4 + ((height - 3.4) * (i + 0.5)) / n, z - 0.05, 3.7 - 1.6 * t, (height - 3.4) / n + 0.02, 0.95 - 0.3 * t, gm);
  }
  rect(g, 0, 0.95, z + 0.69, 1.9, 1.9, 0.04, dark);
  const top = cyl(0.95, 0.95, 0.04, dark, 0, 1.9, z + 0.69, 16);
  top.rotation.x = Math.PI / 2;
  g.add(top);
  for (let i = 0; i <= 10; i++) {
    const a = (i * Math.PI) / 10,
      v = box(0.34, 0.26, 0.24, dk, Math.cos(a) * 1.12, 1.9 + Math.sin(a) * 1.12, z + 0.74);
    v.rotation.z = a - Math.PI / 2;
    g.add(v);
  }
  for (const sx of [-1, 1]) rect(g, sx * 1.12, 0.95, z + 0.74, 0.3, 1.9, 0.24, dk);
  rect(g, 0, 3.25, z + 0.74, 3.4, 0.5, 0.16, dk);
  for (let i = 0; i < 9; i++) rect(g, -1.45 + i * 0.36, 3.25, z + 0.84, 0.18, 0.28, 0.06, gm);
  flames(g, z + 0.35, 1);
  for (let i = -3; i <= 3; i++) {
    const ht = 1.9 + Math.sqrt(Math.max(0, 0.9 - (i * 0.26) ** 2)) * 0.95;
    rect(g, i * 0.26, ht / 2, z + 0.8, 0.035, ht, 0.035, ironM);
  }
  for (const y of [0.55, 1.1, 1.65]) rect(g, 0, y, z + 0.8, 1.86, 0.035, 0.035, ironM);
  rect(g, 0, 0.1, z + 1.05, 4.6, 0.2, 1.3, dk);
}
/** Elaina's hearth: a fieldstone surround, a wrought-iron screen, a mantel. */
function homeHearth(g, z) {
  const rand = mulberry32(31),
    stones = [0x3b3a3a, 0x8b8985, 0xc9c6bf, 0x5c5a57].map((c) => mat.stone(c));
  rect(g, 0, 1.5, z + 0.05, 3.7, 3.0, 0.7, stones[1]);
  for (let i = 0; i < 46; i++) {
    const x = -1.75 + rand() * 3.5,
      y = 0.15 + rand() * 2.8;
    if (Math.abs(x) < 1.05 && y < 1.75) continue;
    const st = box(0.22 + rand() * 0.28, 0.18 + rand() * 0.22, 0.12, stones[i % 4], x, y, z + 0.42);
    st.rotation.z = (rand() - 0.5) * 0.9;
    g.add(st);
  }
  rect(g, 0, 0.85, z + 0.38, 1.9, 1.7, 0.04, dark);
  flames(g, z + 0.15, 0.85);
  rect(g, 0, 3.05, z + 0.45, 4.0, 0.16, 0.62, wood);
  rect(g, 0, 0.1, z + 0.9, 4.3, 0.2, 1.1, brick);
  // the screen
  const sg = new THREE.Group();
  rect(sg, 0, 1.45, 0, 2.0, 0.06, 0.05, ironM);
  rect(sg, 0, 0.12, 0, 2.0, 0.06, 0.05, ironM);
  for (let i = 0; i <= 8; i++) rect(sg, -1 + i * 0.25, 0.78, 0, 0.035, 1.32, 0.035, ironM);
  for (let i = 0; i < 7; i++) for (const y of [1.18, 0.5]) sg.add(torus(0.1, 0.016, ironM, -0.75 + i * 0.25, y, 0.02, 4, 12));
  sg.position.z = z + 1.15;
  g.add(sg);
}
function chandelier(g, x, y, z, ceiling) {
  g.add(cyl(0.025, 0.025, ceiling - y, gilt, x, (ceiling + y) / 2, z, 5));
  const ring = torus(0.95, 0.04, gilt, x, y, z, 5, 28);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const rand = mulberry32(7);
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2,
      r = 0.2 + rand() * 1.05,
      l = box(0.17, 0.035, 0.09, leafGlow, x + Math.cos(a) * r, y - 0.25 + rand() * 0.5 - r * 0.15, z + Math.sin(a) * r);
    l.rotation.set(rand() * 0.6, a, rand() * 0.6);
    g.add(l);
  }
}
function wingChair(g, x, z, angle) {
  const a = new THREE.Group();
  rect(a, 0, 0.47, 0, 0.95, 0.22, 0.85, velvet);
  rect(a, 0, 1.18, -0.4, 0.95, 1.4, 0.18, velvet);
  for (const s of [-1, 1]) {
    rect(a, s * 0.47, 0.98, -0.12, 0.14, 0.95, 0.62, velvet);
    rect(a, s * 0.51, 1.22, -0.42, 0.07, 1.42, 0.1, gilt);
    rect(a, s * 0.51, 0.93, 0.08, 0.08, 0.08, 0.86, gilt);
    for (const sz of [-1, 1]) rect(a, s * 0.4, 0.18, sz * 0.33, 0.08, 0.36, 0.08, gilt);
  }
  rect(a, 0, 1.92, -0.42, 1.08, 0.08, 0.1, gilt);
  a.add(sphere(0.07, gilt, 0, 2.0, -0.42, 6, 4));
  a.scale.setScalar(1.15);
  a.rotation.y = angle;
  a.position.set(x, 0, z);
  g.add(a);
}
function standLamp(g, x, z) {
  g.add(cyl(0.26, 0.3, 0.06, gilt, x, 0.03, z, 12), cyl(0.028, 0.035, 1.85, gilt, x, 0.95, z, 6));
  g.add(sphere(0.17, lampGlow, x, 2.02, z, 10, 8), cone(0.2, 0.2, gilt, x, 2.3, z, 8));
  for (const y of [1.88, 2.02, 2.16]) {
    const r = torus(0.18, 0.012, gilt, x, y, z, 4, 16);
    r.rotation.x = Math.PI / 2;
    g.add(r);
  }
}
function pottedTree(g, x, z, h) {
  g.add(cyl(0.4, 0.3, 0.6, potM, x, 0.3, z, 12), cyl(0.42, 0.42, 0.06, potM, x, 0.6, z, 12));
  g.add(beam(x, 0.5, z, x + 0.12, h * 0.85, z - 0.05, 0.05, 0.05, wood));
  for (let j = 0; j < 12; j++) {
    const a = j * 2.3,
      y = 1.0 + (h - 1.0) * (j / 12),
      r = 0.25 + 0.2 * Math.sin(j);
    const l = sphere(0.2, j % 2 ? leafA : leafB, x + Math.sin(a) * r, y, z + Math.cos(a) * r, 6, 4);
    l.scale.set(1, 0.6, 0.5);
    g.add(l);
  }
}
function sheerCurtains(g, x, z, w, h) {
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const p = rect(g, x + s * (w * 0.32 + i * 0.12), h * 0.48, z + 0.12 + (i % 2) * 0.06, 0.16, h * 0.9, 0.04, sheer);
      p.rotation.z = -s * 0.05 * i;
    }
    rect(g, x + s * w * 0.42, h * 0.5, z + 0.2, 0.3, 0.08, 0.1, gold);
  }
  for (let i = 0; i < 5; i++) {
    const v = sphere(0.32, sheer, x - w * 0.4 + (i * w * 0.8) / 4, h - 0.35, z + 0.16, 8, 6);
    v.scale.set(1.0, 0.7, 0.35);
    g.add(v);
  }
  rect(g, x, h + 0.02, z + 0.1, w + 0.8, 0.12, 0.16, dark);
}
function bookStacks(g, x, z) {
  const cols = [red, teal, wood, gold, linen].map((m) => m);
  for (let k = 0; k < 3; k++)
    for (let i = 0; i < 5 + k; i++) {
      const bk = rect(g, x + k * 0.55, 0.06 + i * 0.1, z + (k % 2) * 0.25, 0.42 - 0.02 * (i % 3), 0.09, 0.3, cols[(i + k) % 5]);
      bk.rotation.y = 0.2 * Math.sin(i * 1.7 + k);
    }
}
function wallLamp(g, x, z, ry) {
  const l = new THREE.Group();
  rect(l, 0, 2.55, 0.06, 0.16, 0.3, 0.1, gold);
  l.add(beam(0, 2.55, 0.06, 0, 2.55, 0.38, 0.04, 0.04, ironM), sphere(0.13, lampGlow, 0, 2.62, 0.4, 8, 6), cyl(0.09, 0.11, 0.24, glass, 0, 2.66, 0.4, 8));
  l.rotation.y = ry;
  l.position.set(x, 0, z);
  g.add(l);
}
/**
 * Bake a room part in the site's frame (local x/z, absolute y) and give it the site's vertex shading and colour
 * families, like the baked places (kit.js): a face of a room is a few draws whatever its parts.
 */
function bakeShaded(part, site) {
  const holder = new THREE.Group();
  holder.position.set(site.x, 0, site.z);
  holder.add(part);
  const baked = bakeStatic(holder);
  try { shadeBaked(baked, site); collapseFamilies(baked); } catch (e) { G.reportError?.('structures:roomShade', e); }
  return baked;
}
function drawRoom(ctx, id, { x, z, w, d, y, height, kind, frontDoor = 4.5 }) {
  const lv = homeDetail(), bev = lv ? 1 : 0, rnd = mulberry32(id.length * 131 + Math.round(x)),
    site = new Site(id, x, z),
    inner = new THREE.Group(),
    shell = [],
    fascia = new THREE.Group(),
    half = w / 2,
    depth = d / 2;
  rect(inner, 0, 0.017, 0, w - 0.12, 0.035, d - 0.12, oak);
  for (let a = -half + 0.78; a < half; a += 1.0) rect(inner, a, 0.043, 0, 0.025, 0.012, d - 0.4, dark);
  const rugW = kind === 'inn' ? 6.1 : 7.6;
  rect(inner, 0, 0.056, 0, rugW, 0.018, d * 0.56, kind === 'inn' ? teal : red);
  for (const v of [-1, 1]) rect(inner, v * (rugW / 2 - 0.25), 0.067, 0, 0.1, 0.008, d * 0.55 - 0.14, gold);
  function shellFace(side) {
    const g = new THREE.Group(),
      horizontal = side === 'N' || side === 'S',
      len = horizontal ? w : d,
      door = side === 'S';
    const pieces = door
      ? [
          [-(len + frontDoor) / 4, (len - frontDoor) / 2],
          [(len + frontDoor) / 4, (len - frontDoor) / 2]
        ]
      : [[0, len]];
    for (const [u, l] of pieces) {
      rect(g, u, height / 2, 0, l, height, 0.48, shellMat(kind));
      for (const h of [0.55, height - 0.16]) g.add(cbox(l, 0.23, 0.61, wood, u, h, 0, 0.03 * bev));
      for (const s of [-1, 1]) g.add(cbox(0.21, height, 0.59, wood, u + s * (l / 2 - 0.11), height * 0.5, 0, 0.03 * bev));
      const lx = horizontal ? u : side === 'W' ? -half : half,
        lz = horizontal ? (side === 'N' ? -depth : depth) : u;
      site.colBox(lx, lz, horizontal ? l / 2 : 0.25, horizontal ? 0.25 : l / 2, 0, y, y + height);
    }
    if (door) {
      rect(g, 0, (height + 3.8) / 2, 0, frontDoor, height - 3.8, 0.51, shellMat(kind));
      g.add(cbox(frontDoor + 0.4, 0.35, 0.66, wood, 0, 3.8, 0, 0.035 * bev));
    }
    for (const v of [-1, 1]) {
      const u = v * (len * 0.32);
      if (kind === 'fran' && side !== 'S') archWindow(g, u, 0.9, 0.26, 2.0, height - 2.0);
      else homeWindow(g, WIN[kind], u, height * 0.6, 0.24, 1.4, 1.82, { lv, rnd, shutters: kind === 'home', louvre: true, box: kind !== 'fran', keystone: kind === 'inn' });
    }
    // Wainscot leaves a dark lower register like the inn in episode two.
    const inside = new THREE.Group();
    inside.rotation.y = Math.PI;
    const pan = kind === 'fran' ? mat.wood(0x5e5950) : kind === 'inn' ? mat.wood(0x765b41) : mat.wood(0x85613e);
    for (const [u, l] of pieces) {
      rect(inside, -u, 0.73, 0.254, l, 1.46, 0.12, pan);
      inside.add(cbox(l, 0.14, 0.15, oak, -u, 1.47, 0.32, 0.025 * bev));
      // cornice under the ceiling band: a stepped moulding
      inside.add(cbox(l, 0.1, 0.11, trimWood, -u, height - 0.33, 0.29, 0.02 * bev), cbox(l, 0.06, 0.06, oak, -u, height - 0.41, 0.265, 0.012 * bev));
      const count = Math.floor(l / 1.4);
      for (let j = 0; j < count; j++)
        rect(inside, -u - l / 2 + ((j + 0.5) * l) / count, 0.73, 0.333, 0.085, 1.35, 0.06, trimWood);
    }
    g.add(inside);
    // Both sides of a wall are seen on foot.
    const windows = new THREE.Group();
    windows.rotation.y = Math.PI;
    for (const v of [-1, 1]) {
      if (kind === 'fran' && side !== 'S') archWindow(windows, v * len * 0.32, 0.9, 0.26, 2.0, height - 2.0);
      else homeWindow(windows, WIN[kind], v * (len * 0.32), height * 0.6, 0.24, 1.4, 1.82, { lv, rnd, inner: true });
    }
    if (kind === 'fran') for (const u of [-len / 2 + 0.4, 0, len / 2 - 0.4]) if (!(door && Math.abs(u) < frontDoor)) pilaster(windows, u, height);
    if (kind === 'inn') for (let u = -len / 2 + 0.3; u <= len / 2; u += len / 4) if (!(door && Math.abs(u) < frontDoor / 2 + 0.4)) rect(windows, u, height / 2, 0.3, 0.32, height, 0.14, dark);
    g.add(windows);
    if (door && id === 'sayaInn') {
      const m = texMat(
        textTexture(t('world.sign.inn'), { w: 300, h: 85, style: 'inkwood', bg: '#735638', fg: '#edddb6' })
      );
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.78), m);
      sign.position.set(0, 4.3, 0.35);
      g.add(sign);
    }
    g.rotation.y = side === 'S' ? 0 : side === 'N' ? Math.PI : side === 'W' ? -Math.PI / 2 : Math.PI / 2;
    g.position.set(side === 'W' ? -half : side === 'E' ? half : 0, y, side === 'N' ? -depth : side === 'S' ? depth : 0);
    const baked = bakeShaded(g, site);
    G.scene.add(baked);
    shell.push([side, baked]);
  }
  for (const side of ['W', 'N', 'E', 'S']) shellFace(side);
  if (kind === 'home') {
    // stone planters either side of the open front
    const pl = new THREE.Group();
    for (const s of [-1, 1]) {
      pl.add(bevelBox(1.3, 0.42, 0.5, stone, s * 3.3, 0.21, depth + 0.52, 0.04));
      flowerBox(pl, { ...WIN.home, box: stone }, s * 3.3, 0.42, depth + 0.52, 1.2, lv, rnd);
    }
    site.add(pl, 0, y, 0);
  }
  // Warm timber and the lath ceiling are visible when the player looks up from inside.
  for (let u = -depth + 1.0; u < depth; u += 2.85) rect(fascia, 0, height - 0.16, u, w, 0.28, 0.24, wood);
  rect(
    fascia,
    0,
    height + 0.07,
    0,
    w,
    0.18,
    d,
    mat.wood(kind === 'inn' ? 0x886f52 : kind === 'home' ? 0x94683f : 0xa99f84)
  );
  const U = kind === 'inn' ? 3 * 3.15 : 0;
  if (U) {
    paintedBlock(fascia, w, d, height + 0.16, 3, 2);
    rect(fascia, 0, height + 0.2, 0, w + 0.4, 0.3, d + 0.4, wood);
    for (const v of [-1, 1]) {
      // balconies on the street front (platforms added below)
      rect(fascia, v * 3.6, height + 3.3, depth + 0.75, 3.2, 0.16, 1.5, wood);
      rect(fascia, v * 3.6, height + 4.3, depth + 1.45, 3.2, 0.09, 0.09, wood);
      for (let i = 0; i <= 4; i++) rect(fascia, v * 3.6 - 1.6 + i * 0.8, height + 3.8, depth + 1.45, 0.06, 0.9, 0.06, wood);
      rect(fascia, v * 3.6, height + 4.4, depth + 0.06, 1.0, 2.1, 0.06, dark);
    }
  }
  const rise = kind === 'fran' ? 4.1 : 3.1;
  // tiled roof: slates on the cottages, barrel tiles on the inn; deep eaves on rafter tails, ridge roll, barge boards
  tiledRoof(fascia, ROOF[kind], half + 0.55, depth + 0.76, height + U, rise, { kind: kind === 'inn' ? 'roll' : 'slate', wall: half + 0.24, wallD: depth + 0.24, lv, rnd });
  for (const side of [-1, 1]) {
    const g = new THREE.Shape();
    g.moveTo(-half, 0);
    g.lineTo(half, 0);
    g.lineTo(0, rise);
    g.closePath();
    const geo = new THREE.ExtrudeGeometry(g, { depth: 0.26, bevelEnabled: false });
    const o = new THREE.Mesh(geo, wallMat);
    o.position.set(0, height + U, side * depth);
    fascia.add(o);
  }
  chimney(fascia, CHIM, half * 0.51, -depth * 0.56, height + U + 0.5, height + U + rise * 0.85 + 1.9, { w: 1.1, d: 1.1, lv, pots: 2 });
  fascia.position.set(0, y, 0);
  const roof = bakeShaded(fascia, site);
  G.scene.add(roof);
  for (let i = -4; i <= 4; i++) {
    const u = (w * i) / 9;
    site.platBox(u, 0, w / 18, depth + 0.7, 0, y + height + U + rise * (1 - Math.abs(u) / (half + 0.55)) + 0.12, 0.2);
  }
  if (U) {
    for (const v of [-1, 1]) site.platBox(v * 3.6, depth + 0.75, 1.6, 0.75, 0, y + height + 3.4, 0.25);
    site.colBox(0, 0, half, depth, 0, y + height + 0.3, y + height + U);
  }
  if (kind === 'inn') {
    plant(inner, -6.7, 7.3, 1.6);
    candlestick(inner, 5.9, 1.39, 4.4);
    const reg = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 5; i++) {
        rect(reg, i * 0.26 - 0.54, 2.6 + j * 0.29, 0, 0.075, 0.16, 0.07, gold);
      }
    }
    rect(reg, 0, 3.14, -0.1, 1.7, 1.8, 0.13, wood);
    reg.position.set(6.7, 0, 0.6);
    reg.rotation.y = -1.57;
    inner.add(reg);

    // The inn's front desk faces the street. The path along the western side stays open to the bedrooms.
    rect(inner, 4.65, 0.63, 4.3, 4.2, 1.26, 1.32, wood);
    rect(inner, 4.65, 1.29, 4.3, 4.45, 0.13, 1.48, oak);
    openBook(inner, 4.5, 1.39, 4.25);
    site.colBox(4.65, 4.3, 2.1, 0.67, 0, y, y + 1.4);
    shelf(inner, -5, -depth + 0.67);
    bed(inner, 4.4, -7.0, blueCover);
    bed(inner, -4.6, -7.3, blueCover);
    // ochre walls lit by oil lamps (episode two, the inn at night)
    for (const [lx, lz, ry] of [[-half + 0.3, -5.5, Math.PI / 2], [half - 0.3, -5.0, -Math.PI / 2], [-half + 0.3, 3.5, Math.PI / 2], [half - 0.3, 1.5, -Math.PI / 2], [-2.6, -depth + 0.3, 0]]) wallLamp(inner, lx, lz, ry);
    for (const [px, pz] of [[-4.75, 2.55], [-4.2, 2.95]]) inner.add(cyl(0.2, 0.17, 0.03, linen, px, 0.95, pz, 12), sphere(0.08, mat.paint(0xd9a35a), px, 1.0, pz, 6, 4));
    inner.add(cyl(0.16, 0.1, 0.12, wood, -4.5, 0.99, 2.3, 10));
    candlestick(inner, -4.0, 0.93, 2.4);
    for (const sx of [-1, 1]) {
      rect(inner, sx * (w / 4 + 1), 2.05, -2.7, w / 2 - 2, 4.1, 0.31, innPlaster);
      site.colBox(sx * (w / 4 + 1), -2.7, w / 4 - 1, 0.16, 0, y, y + 4.1);
    }
    table(inner, -4.5, 2.7, 2.1, 1.4, 0.86);
    chair(inner, -5.1, 3.9, 0.2);
  } else {
    if (kind === 'fran') {
      // Fran's parlour (episode one): tall dark windows, grey pilasters, the tapering hearth, the leaf chandelier,
      // green velvet wing chairs with gilt frames, a standing lamp, potted trees in yellow pots
      franHearth(inner, -depth + 0.6, height);
      chandelier(inner, 0, height - 1.4, -1.0, height);
      wingChair(inner, -3.5, -2.8, 0.62);
      wingChair(inner, 3.3, -2.5, -0.72);
      standLamp(inner, 2.0, -3.4);
      pottedTree(inner, half - 1.4, -depth + 2.2, 3.6);
      pottedTree(inner, -half + 1.4, -3.4, 2.8);
      table(inner, 0, 0.6, 2.0, 1.25, 0.7);
      openBook(inner, 0, 0.8, 0.6);
      bed(inner, -half + 1.63, 1.5);
    } else {
      // Elaina's home (episode one): the fieldstone hearth with its iron screen, sheer curtains, stacked books
      homeHearth(inner, -depth + 0.6);
      for (const side of [-1, 1]) {
        sheerCurtains(inner, side * w * 0.32, -depth + 0.5, 2.3, 4.3);
        plant(inner, side * (half - 1.1), -depth + 2.1, 1.5);
      }
      candlestick(inner, -0.65, 0.95, -3.33);
      candlestick(inner, 1.45, 3.13, -depth + 1.0);
      bookStacks(inner, 2.4, -depth + 2.2);
      table(inner, 0.2, -3.4, 2.48, 1.17, 0.84);
      openBook(inner, 0.1, 0.96, -3.34);
      chair(inner, -1.45, -2.65, 0.63);
      chair(inner, 2.6, -4.2, -0.63, teal, true);
      shelf(inner, -4.75, -depth + 0.61);
      bed(inner, -half + 1.63, 1.5);
    }
  }
  site.add(inner, 0, y, 0);
  ctx.tick(() => {
    const p = G.player?.pos,
      eye = G.camera?.position;
    const active =
      p &&
      eye &&
      Math.abs(p.x - x) < half + 0.05 &&
      Math.abs(p.z - z) < depth + 0.05 &&
      p.y < y + height - 1 &&
      eye.distanceTo(p) < 18;
    roof.visible = !(active && eye.y > y + height - 0.8);
    for (const [s, o] of shell)
      o.visible = !(
        active &&
        (s === 'S'
          ? eye.z > z + depth - 0.22
          : s === 'N'
            ? eye.z < z - depth + 0.22
            : s === 'E'
              ? eye.x > x + half - 0.22
              : eye.x < x - half + 0.22)
      );
    const distance = p ? Math.hypot(p.x - x, p.z - z) : 0;
    if (distance > 480) {
      roof.visible = false;
      for (const pair of shell) pair[1].visible = false;
    }
  });
  return site;
}
// The woodland house is wrapped in a climbing vine. Its doorway, steps and the
// eastward path to the practice clearing stay open at human and broom height.
function woodlandGarden(site, y) {
  const lv = homeDetail(), rnd = mulberry32(611);
  const P = { stem: mat.wood(0x716d51), leaf: [mat.paint(0x536c51), mat.paint(0x798861), mat.paint(0x667a55)], bloom: [mat.paint(0x947ca8), mat.paint(0xa993bd)] };
  const border = new THREE.Group();
  for (const side of [-1, 1]) {
    // a woody stem climbing the front wall in a loose zig-zag, rooted in a stone-edged bed
    const root = side * 6.1, pts = [];
    for (let j = 0; j <= 13; j++) pts.push([root + 0.42 * Math.sin(j * 0.7 + side), 0.05 + j * 0.48, 8.49 + 0.06 * Math.sin(j * 0.6)]);
    vine(border, P, pts, { lv, rnd, r0: 0.085, r1: 0.025 });
    for (let k = 0; k < 4; k++) border.add(bevelBox(0.42, 0.18, 0.3, stone, root - 0.75 + k * 0.5, 0.09, 8.75 + (k % 2) * 0.04, 0.03));
  }
  for (const [x, z, h] of [
    [-12, 5, 9.8],
    [13, -7, 12.8],
    [-11, -11, 11.1],
    [9, -14, 13.1]
  ]) {
    const base=G.world.heightAt(site.x+x,site.z+z);
    const key=x<0?'broad2':'birch', tint=z>0?0x90a56e:x>0?0x98aa7c:0x71875d;
    site.add(procTree(key,h/7.8,tint),x,base-.03,z,x*.73);
    site.colCyl(x,z,.32,base,base+h*.65);
  }
  site.add(border, 0, y, 0);
}


// The rope swing in the green wood by Fran's house (episode one): a broad oak, a long low bough, two ropes, a plank.
function swingTree(ctx) {
  const site = new Site('franSwing', 2030, -8),
    g = new THREE.Group(),
    bark = mat.wood(0x5d4636),
    rope = mat.cloth(0xcdb98e),
    plank = mat.wood(0x8a6a48);
  const base = G.world.heightAt(2030, -8);
  g.add(cyl(0.55, 0.8, 7.5, bark, 0, 3.75, 0, 10));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26;
    g.add(beam(0, 0.2, 0, Math.sin(a) * 1.4, -0.1, Math.cos(a) * 1.4, 0.35, 0.3, bark));
  }
  g.add(beam(0, 5.8, 0, 5.4, 6.6, 0.4, 0.42, 0.36, bark), beam(5.4, 6.6, 0.4, 7.6, 7.4, 0.6, 0.26, 0.24, bark));
  g.add(beam(0, 6.5, 0, -3.5, 8.6, -1.5, 0.36, 0.32, bark), beam(0, 7.2, 0, 1.0, 10.2, -2.2, 0.32, 0.3, bark));
  const leaves = [0x4f7f43, 0x5f9150, 0x3f6d3c, 0x6fa05a].map((c) => mat.paint(c));
  const rand = mulberry32(99);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2,
      r = 1.5 + rand() * 4.2,
      cl = sphere(1.3 + rand() * 1.3, leaves[i % 4], Math.cos(a) * r + 1.2, 8.2 + rand() * 3.2, Math.sin(a) * r * 0.8, 8, 6);
    cl.scale.y = 0.72;
    g.add(cl);
  }
  // hanging moss on the bough
  for (let i = 0; i < 7; i++) g.add(beam(1.2 + i * 0.85, 6.3 + i * 0.1, 0.5, 1.25 + i * 0.85, 4.6 + (i % 3) * 0.5, 0.55, 0.06, 0.06, leaves[2]));
  const sx = 3.4,
    seatY = 0.75;
  for (const dz of [-0.42, 0.42]) {
    g.add(beam(sx, 6.4, 0.35 + dz, sx, seatY + 0.05, 0.35 + dz, 0.04, 0.04, rope));
    g.add(torus(0.08, 0.025, rope, sx, 6.38, 0.35 + dz, 4, 10));
  }
  rect(g, sx, seatY, 0.35, 0.42, 0.07, 1.05, plank);
  const books = [red, teal, wood, gold];
  for (let i = 0; i < 4; i++) {
    const bk = rect(g, sx, seatY + 0.08 + i * 0.08, 0.15, 0.3, 0.07, 0.4, books[i]);
    bk.rotation.y = 0.15 * i;
  }
  site.add(g, 0, base, 0);
  site.colCyl(0, 0, 0.75, base, base + 7);
  return site;
}
// The storm trial's clearing (episode one): angular slate-blue boulders standing in the wet grass.
function trialRocks() {
  const site = new Site('trialRocks', 2100, -84),
    rand = mulberry32(1501),
    mats = [0x4f5b6e, 0x5d6a7e, 0x465163].map((c) => mat.rock(c));
  let n = 0;
  for (let i = 0; i < 30 && n < 11; i++) {
    const a = rand() * Math.PI * 2,
      r = 14 + rand() * 11,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    if (G.world.roadDist(2100 + x, -84 + z) < 4.5) continue;
    const s = 1.2 + rand() * 1.6,
      gy = G.world.heightAt(2100 + x, -84 + z);
    const geo = new THREE.DodecahedronGeometry(1, 0),
      m = new THREE.Mesh(geo, mats[n % 3]);
    m.scale.set(s * (1.1 + rand() * 0.6), s * (0.9 + rand() * 0.5), s * (0.8 + rand() * 0.4));
    m.rotation.set(rand() * 0.5, rand() * 6, rand() * 0.4);
    site.add(m, x, gy + s * 0.35, z, m.rotation.y);
    site.colCyl(x, z, s * 0.9, gy - 1, gy + s * 1.2);
    n++;
  }
  return site;
}
export async function buildJourneyRooms(ctx) {
  // One shared local fire light. Keeping its slot alive avoids shader recompilation on crossing a door.
  const fire = new THREE.PointLight(0xffb373, 0, 12, 1.55);
  G.scene.add(fire);
  ctx.tick((_dt, time) => {
    const p = G.player?.pos;
    if (!p) {
      fire.intensity = 0;
      return;
    }
    const rooms = [
      [2220, 48, 19, 8.1, 8.1],
      [2055, -35, 24, 8.1, 8.1],
      [-2119, -515, 30, 8.0, 10.5]
    ];
    const r = rooms.find(([x, z, y, w, d]) => Math.abs(p.x - x) < w + 1 && Math.abs(p.z - z) < d + 1 && p.y < y + 4);
    fire.intensity = r ? 17.5 + 1.1 * Math.sin(time * 3.77) : 0;
    if (r) fire.position.set(r[0], r[2] + 1.65, r[1] - r[4] + 2.0);
  });

  for (const [id, x, z, w, d, y, height, kind] of [
    ['elainaHome', 2220, 48, 15.5, 16, 19, 5.45, 'home'],
    ['franHouse', 2055, -35, 15.4, 16, 24, 7.75, 'fran'],
    ['sayaInn', -2119, -515, 16, 21, 30, 5.8, 'inn']
  ]) {
    const site = drawRoom(ctx, id, { x, z, w, d, y, height, kind });
    if (kind === 'fran') woodlandGarden(site, y);
    await site.bakeSliced(ctx.step);
    ctx.place(id, { group: site.baked, site });
  }
  for (const [id, make] of [['franSwing', swingTree], ['trialRocks', trialRocks]]) {
    try {
      const site = make(ctx);
      await site.bakeSliced(ctx.step);
      ctx.place(id, { group: site.baked, site });
    } catch (e) {
      G.reportError('structures:' + id, e);
    }
  }
}
