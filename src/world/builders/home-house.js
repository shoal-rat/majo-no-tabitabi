// The hometown's houses (episode one, the eastern street around Elaina's home): two plastered storeys on a plinth of
// dressed stones, an attic under a deep gable roof. Built from modelled parts (builders/home-parts.js): windows behind
// stone or timber surrounds with sills, sashes, shutters and window boxes; a plank door on a doorstep; quoins, string
// courses or half-timbering; a roof laid in barrel tiles or slates with a ridge roll, rafter tails under the eaves,
// barge boards and a corbelled chimney. Each house is varied by its seed (wall finish, shutters, door, roof, boxes).
// Footprint, colliders, roof landing pads and the eave record are exactly those of bellcrown.js house() (the story's
// door anchors stand where they stood).
import * as THREE from 'three';
import { mat, bevelBox } from './kit.js';
import { mulberry32 } from '../../core/util.js';
import { cbox, cbeam, slab, homeWindow, homeDoor, tiledRoof, chimney, homeDetail, icoGeo } from './home-parts.js';

const ROOF = [0xd39e43, 0xbe532f, 0x5a6a7b, 0xd0723a, 0xa8472d, 0x9a5938, 0xc99456];
const WALL = [0xeee1c5, 0xe7c5a4, 0xd6b398, 0xe2c7a5];
const SHUTTER = [0x7f9c78, 0x6e8fb2, 0xa9675d, 0x5f8f8a, 0xc49c5e, 0x8c7a9e];
const DOOR = [0x7a5238, 0x5f7f6a, 0x5a7594, 0x8f4f45, 0x6d4c3b];
// wall finish per seed (seeds 20-28 are the street): stucco with quoins, half-timbered upper storey, timber bands
const STYLE = ['timber', 'plain', 'banded', 'timber', 'banded', 'plain', 'plain', 'timber', 'banded'];
const tone = (hex, k, warm = 0) => { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k * (1 + warm)); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k * (1 - warm)); return c.getHex(); };
const tileMat = (c) => mat.tile(c, { detail: 0.22, bump: 0.3 });

function palette(seed, rnd, style) {
  const roof = ROOF[seed % ROOF.length], body = WALL[seed % WALL.length];
  const timber = mat.wood(style === 'timber' ? 0x6a4838 : 0x724e40), trim = mat.wood(0xac7955);
  const stoneL = mat.stone(0xd8ccb6), stoneD = mat.stone(0xad9685);
  const shutter = mat.wood(SHUTTER[Math.floor(rnd() * SHUTTER.length)], { detail: 0.5 });
  return {
    roof, body: mat.plaster(body), timber, trim, stoneL, stoneD,
    win: {
      surround: style === 'plain' ? stoneL : trim, head: style === 'plain' ? stoneL : timber, sill: stoneL,
      sash: mat.paint(rnd() < 0.5 ? 0xf1e8d6 : 0xe6d6b8), glass: mat.paint(0x7c9cab, { spec: 0.35, specPower: 60, detail: 0.2 }),
      shutter, iron: mat.paint(0x3b3836), box: mat.wood(0x8a6446), soil: mat.stone(0x6d5546),
      leaf: mat.paint(0x6f9a58), bloom: [[0xe8737c, 0xf6f1ec], [0xf2c54f, 0xe87a5a], [0xd889c8, 0xf6f1ec], [0xef8f6a, 0xf2d36b]][Math.floor(rnd() * 4)].map((c) => mat.paint(c)),
    },
    door: { frame: style === 'plain' ? stoneL : timber, leaf: mat.wood(DOOR[Math.floor(rnd() * DOOR.length)], { detail: 0.6 }), iron: mat.paint(0x3b3836), step: stoneD, glass: mat.paint(0x7c9cab), hood: tileMat(tone(roof, 0.9)) },
    roofP: {
      deck: tileMat(tone(roof, 0.6, 0.04)), tiles: [tileMat(roof), tileMat(tone(roof, 1.07, 0.02)), tileMat(tone(roof, 0.92, -0.02))],
      ridge: tileMat(tone(roof, 0.86)), mortar: mat.stone(0xd9cfbd), fascia: mat.wood(0x7a5642), rafter: mat.wood(0x6a4a3a), barge: mat.wood(0x8a6248),
    },
    chim: { stack: mat.stone(0xb98468), joint: mat.stone(0xa87660), cap: stoneL, pot: mat.stone(0xc57c56) },
  };
}

/** Stone plinth (0..0.7 m) around the walls, broken for the door on the front. */
function plinth(g, P, w, d, gap, lv, rnd) {
  const H = 0.7, p = 0.12, cH = lv ? 0.35 : 0.7;
  const runs = [
    // [axis, fixed coord, from, to, outward sign]
    ['x', d / 2 + p / 2, -w / 2 - p, -gap, 1], ['x', d / 2 + p / 2, gap, w / 2 + p, 1],
    ['x', -d / 2 - p / 2, -w / 2 - p, w / 2 + p, -1],
    ['z', w / 2 + p / 2, -d / 2, d / 2, 1], ['z', -w / 2 - p / 2, -d / 2, d / 2, -1],
  ];
  g.add(slab(w + 0.06, H, d + 0.06, P.stoneD, 0, H / 2, 0));
  for (const [ax, c, a0, a1] of runs) {
    for (let yy = 0, row = 0; yy < H - 0.01; yy += cH, row++) {
      let a = a0 + (row % 2 ? 0.27 : 0);
      if (row % 2) { const l = a - a0; if (l > 0.08) place(ax, c, a0 + l / 2, l - 0.025, yy, cH); }
      while (a < a1 - 0.05) {
        const l = Math.min(a1 - a, (lv ? 0.5 : 0.9) + rnd() * (lv ? 0.35 : 0.5));
        place(ax, c, a + l / 2, l - 0.025, yy, cH);
        a += l;
      }
    }
  }
  function place(ax, c, m, l, yy, hh) {
    const hgt = hh - 0.025, dep = p + 0.02 + rnd() * 0.025;
    const st = ax === 'x' ? bevelBox(l, hgt, dep, P.stoneD, m, yy + hh / 2, c, 0.035) : bevelBox(dep, hgt, l, P.stoneD, c, yy + hh / 2, m, 0.035);
    g.add(st);
  }
  // water table: a weathered cap stone over the plinth
  const cap = (cw, cd, x, z) => g.add(cbox(cw, 0.09, cd, P.stoneL, x, H + 0.045, z, 0.03));
  cap((w / 2 + 0.17) - gap, 0.24, -(w / 2 + 0.17 + gap) / 2, d / 2 + 0.06);
  cap((w / 2 + 0.17) - gap, 0.24, (w / 2 + 0.17 + gap) / 2, d / 2 + 0.06);
  cap(w + 0.34, 0.24, 0, -d / 2 - 0.06);
  for (const s of [-1, 1]) cap(0.24, d, s * (w / 2 + 0.06), 0);
}

/** Half-timbering on one face (local frame: face plane z = 0, outside +z, length len along x) between y0 and y1. */
function timberFace(g, m, len, y0, y1, wins, lv) {
  const dep = 0.075, wd = 0.17, z = dep / 2, k = lv ? 0.016 : 0;
  const posts = [-len / 2 + wd / 2, len / 2 - wd / 2];
  for (const [x, ww] of wins) posts.push(x - ww / 2 - 0.25, x + ww / 2 + 0.25);
  posts.sort((a, b) => a - b);
  for (const x of posts) g.add(cbox(wd, y1 - y0, dep, m, x, (y0 + y1) / 2, z, k));
  // sill rail just under the window sills
  const ys = Math.max(y0 + 0.4, Math.min(...wins.map((w) => w[2]), y1) - 0.32);
  g.add(cbox(len, 0.15, dep * 0.9, m, 0, ys, z * 0.9, k));
  // braces in the end bays (a K on each side), struts under the windows
  const up = new THREE.Vector3(0, 0, 1);
  for (const s of [-1, 1]) {
    const xo = s * (len / 2 - wd), xi = s > 0 ? posts[posts.length - 2] + wd / 2 : posts[1] - wd / 2;
    if (Math.abs(xo - xi) < 0.5) continue;
    g.add(cbeam(xo, ys + 0.06, z, xi, y1 - 0.05, z, 0.15, dep, m, k, up));
    g.add(cbeam(xo, y0 + 0.05, z, xi, ys - 0.06, z, 0.15, dep, m, k, up));
  }
  if (lv >= 1) for (const [x, ww] of wins) for (const s of [-1, 1]) g.add(cbeam(x + s * (ww / 2 + 0.16), y0 + 0.06, z, x + s * 0.06, ys - 0.07, z, 0.12, dep, m, k, up));
}

/** Corner stones in alternating long and short faces, from y0 to y1. */
function quoins(g, m, w, d, y0, y1, lv) {
  const course = lv ? 0.31 : 0.62, p = 0.035;
  for (let y = y0, i = 0; y + course <= y1 + 0.01; y += course, i++) {
    const hh = course - 0.03, long = 0.56, short = 0.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const a = (i + (sx * sz > 0 ? 0 : 1)) % 2;
      if (a) g.add(cbox(long, hh, short, m, sx * (w / 2 - long / 2 + p), y + course / 2, sz * (d / 2 - short / 2 + p), lv ? 0.03 : 0));
      else g.add(cbox(short, hh, long, m, sx * (w / 2 - short / 2 + p), y + course / 2, sz * (d / 2 - long / 2 + p), lv ? 0.03 : 0));
    }
  }
}

/** A clay pot with a mounded shrub, beside a door. */
function doorPot(g, P, x, z, rnd) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.38, 9), P.chim.pot);
  pot.position.set(x, 0.19, z); pot.castShadow = pot.receiveShadow = true;
  g.add(pot, cbox(0.48, 0.05, 0.48, P.chim.pot, x, 0.39, z, 0.012));
  for (let i = 0; i < 5; i++) {
    const o = new THREE.Mesh(icoGeo(0.2), P.win.leaf);
    o.position.set(x + (rnd() - 0.5) * 0.24, 0.55 + i * 0.07, z + (rnd() - 0.5) * 0.24);
    o.scale.set(1, 0.85, 1); o.castShadow = o.receiveShadow = true;
    g.add(o);
  }
}

/** A striped shop awning on iron brackets over the ground floor, scalloped valance at the front. */
function awning(g, P, w, f, y, seed) {
  const red = mat.cloth(seed % 2 ? 0xc0584c : 0x4f73a0), white = mat.cloth(0xf2ebdc), iron = P.win.iron;
  const width = w * 0.8, depth = 1.55, drop = 0.42, n = 9, sw = width / n;
  const ang = Math.atan2(drop, depth), len = Math.hypot(depth, drop);
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + (i + 0.5) * sw, m = i % 2 ? white : red;
    g.add(slab(sw + 0.004, 0.035, len, m, x, y - drop / 2, f + depth / 2, ang));
    g.add(slab(sw + 0.004, 0.2, 0.025, m, x, y - drop - 0.1, f + depth + 0.005));
    g.add(slab(sw * 0.62, sw * 0.62, 0.022, m, x, y - drop - 0.2, f + depth + 0.005, 0, 0, Math.PI / 4));
  }
  g.add(cbox(width + 0.06, 0.07, 0.07, iron, 0, y - drop + 0.01, f + depth, 0.01));
  g.add(cbox(width + 0.1, 0.1, 0.1, P.timber, 0, y + 0.03, f + 0.05, 0.015));
  for (const s of [-1, 0, 1]) {
    const x = s * (width / 2 - 0.05);
    g.add(cbeam(x, y - 1.05, f + 0.03, x, y - drop + 0.02, f + depth - 0.04, 0.045, 0.045, iron, 0.008));
  }
}

/** Build one hometown house and register it on the site (same records as bellcrown.js house()). */
export function homeHouse(site, x, z, w, d, h, rot, seed, baseY) {
  const g = new THREE.Group(), rnd = mulberry32(seed * 7919 + 13), lv = homeDetail();
  const style = STYLE[seed % STYLE.length], P = palette(seed, rnd, style);
  const f = d / 2, rise = w * (0.31 + 0.045 * (seed % 4)), hw = w / 2 + 0.425, hd = d / 2 + 0.5;
  const dw = 1.1, dh = 2.15, bay = w * 0.275, k = lv ? 1 : 0;
  // walls, plinth, storey band and cornice
  plinth(g, P, w, d, dw / 2 + 0.27, lv, rnd);
  g.add(slab(w, h - 0.45, d, P.body, 0, 0.45 + (h - 0.45) / 2, 0));
  const band = style === 'plain' ? P.stoneL : P.timber;
  g.add(cbox(w + 0.12, style === 'plain' ? 0.14 : 0.2, d + 0.12, band, 0, h * 0.49, 0, 0.025 * k));
  g.add(cbox(w + 0.16, 0.2, d + 0.16, band, 0, h - 0.1, 0, 0.03 * k));
  g.add(cbox(w + 0.3, 0.08, d + 0.3, band, 0, h + 0.04, 0, 0.02 * k));
  // attic: the gable walls under the roof
  const ang = Math.atan2(rise, hw), deckT = 0.13, under = deckT / Math.cos(ang) + 0.01;
  const ry = (xx) => h + rise * (1 - Math.abs(xx) / hw) - under;
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, h); sh.lineTo(w / 2, h); sh.lineTo(w / 2, Math.max(h + 0.02, ry(w / 2))); sh.lineTo(0, ry(0)); sh.lineTo(-w / 2, Math.max(h + 0.02, ry(w / 2))); sh.closePath();
  const attic = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }), P.body);
  attic.position.z = -d / 2; attic.castShadow = attic.receiveShadow = true;
  g.add(attic);
  // corners
  if (style === 'plain') quoins(g, P.stoneL, w, d, 0.79, h - 0.2, lv);
  else for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cbox(0.24, h - 0.75, 0.24, P.timber, sx * (w / 2 - 0.08), 0.75 + (h - 0.75) / 2, sz * (d / 2 - 0.08), 0.03 * k));
  // the four faces: windows (and half-timbering) in a face frame each
  const yG = h * 0.26, yU = h * 0.73, faces = [
    { rot: 0, len: w, at: [0, f], front: true },
    { rot: Math.PI, len: w, at: [0, -f] },
    { rot: Math.PI / 2, len: d, at: [w / 2, 0] },
    { rot: -Math.PI / 2, len: d, at: [-w / 2, 0] },
  ];
  const shutters = rnd() < 0.85, louvre = rnd() < 0.55, boxes = rnd() < 0.7, sideLow = rnd() < 0.5;
  const canopy = seed % 3 === 0;
  for (const F of faces) {
    const fg = new THREE.Group();
    fg.rotation.y = F.rot; fg.position.set(F.at[0], 0, F.at[1]);
    const wins = [];
    const win = (xx, yy, ww, hh, o) => { homeWindow(fg, P.win, xx, yy, 0, ww, hh, { lv, rnd, keystone: style === 'plain', ...o }); if (yy > h * 0.49) wins.push([xx, ww, yy - hh / 2 - 0.1]); };
    if (F.front) {
      for (const xx of [-bay, bay]) {
        win(xx, yU, 1.11, 1.55, { shutters: shutters && style !== 'timber', louvre, box: boxes || style === 'timber' });
        win(xx, yG, 1.05, 1.26, { shutters: shutters && !canopy, louvre, box: false });
      }
    } else if (F.rot === Math.PI) {
      for (const xx of [-bay, bay]) win(xx, yU, 1.0, 1.4, { panes: 4 });
      if (sideLow || lv >= 1) win((seed % 2 ? 1 : -1) * bay, yG, 0.95, 1.15, { panes: 4 });
    } else {
      for (const xx of [-F.len * 0.25, F.len * 0.25]) win(xx, h * 0.7, 1.0, 1.47, { shutters: shutters && lv >= 1 && style !== 'timber', louvre, box: boxes && lv >= 2 && rnd() < 0.5 });
      if (sideLow) win(F.len * 0.25 * (F.rot > 0 ? 1 : -1), yG, 0.95, 1.2, { panes: 4 });
    }
    if (style === 'timber') timberFace(fg, P.timber, F.len - 0.16, h * 0.49 + 0.1, h - 0.2, wins, lv);
    if (F.front) {
      homeDoor(fg, P.door, 0, 0, dw, dh, { lv, rnd, keystone: style === 'plain', light: rnd() < 0.5, hood: !canopy && rnd() < 0.45 });
      if (lv >= 1 && !canopy && rnd() < 0.6) doorPot(fg, P, (rnd() < 0.5 ? -1 : 1) * (dw / 2 + 0.62), 0.45, rnd);
    }
    // gable window (front) / vent (back), and the gable timbers on the half-timbered houses
    if (F.rot === 0 || F.rot === Math.PI) {
      const front = F.rot === 0, gy = h + rise * 0.36;
      if (front) homeWindow(fg, P.win, 0, gy, 0, 0.78, 0.92, { lv, rnd, panes: 4, surround: 0.13, keystone: style === 'plain', box: boxes && lv >= 1 });
      else fg.add(cbox(0.5, 0.36, 0.1, P.timber, 0, gy, 0.05, 0.015 * k));
      if (style === 'timber') {
        const up = new THREE.Vector3(0, 0, 1), top = ry(0) - 0.05, z = 0.04;
        fg.add(cbox(w - 0.3, 0.16, 0.08, P.timber, 0, h + 0.2, z, 0.016 * k));
        if (!front) fg.add(cbox(0.17, top - h - 0.28, 0.08, P.timber, 0, (top + h + 0.28) / 2, z, 0.016 * k));
        for (const s of [-1, 1]) fg.add(cbeam(s * w * 0.36, h + 0.28, z, s * (front ? 0.62 : 0.1), top - (front ? 0.55 : 0.15), z, 0.15, 0.08, P.timber, 0.016 * k, up));
      }
    }
    g.add(fg);
  }
  if (canopy) awning(g, P, w, f, h * 0.41 + 0.2, seed);
  // roof
  tiledRoof(g, P.roofP, hw, hd, h, rise, { kind: P.roof === 0x5a6a7b || P.roof === 0x9a5938 ? 'slate' : 'roll', wall: w / 2, wallD: d / 2, lv, rnd, deckT });
  // chimney through the back half of one slope
  const cx = (seed % 2 ? 1 : -1) * w * 0.24, cz = -d * 0.22;
  chimney(g, P.chim, cx, cz, h, Math.max(h + rise * 1.05 + 0.55, h + rise * (1 - Math.abs(cx) / hw) + 1.2), { lv, pots: rnd() < 0.5 ? 2 : 1 });

  site.add(g, x, baseY, z, rot);
  site.footprint(x, z, rot, w / 2, d / 2, baseY + h, seed);
  site.colBox(x, z, w / 2, d / 2, rot, baseY, baseY + h);
  // Stepped support follows the pitched roof rather than a platform suspended over the eaves.
  for (let i = -3; i <= 3; i++) {
    const lx = (w * i) / 7,
      top = baseY + h + rise * (1 - Math.abs(lx) / (w * 0.5 + 0.425));
    site.platBox(x + lx * Math.cos(rot), z - lx * Math.sin(rot), w / 14, d / 2, rot, top, 0.22);
  }
  return g;
}
