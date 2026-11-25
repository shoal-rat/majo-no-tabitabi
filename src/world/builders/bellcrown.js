// A gate for travellers on foot, and an upper front door for the wing-post couriers.
import * as THREE from 'three';
import { BELL, BELL_ROADS, BELL_WALL } from '../../data/bellcrown.js';
import { G } from '../../core/game.js';
import { procTree } from './decor.js';
import { finishFrontage } from './mage-frontage.js';
import { mageResidents } from './mage-folk.js';
import { box, cone, cyl, sphere, torus } from '../../core/geo.js';
import { Site, mat, M, beam } from './kit.js';
import { homeHouse } from './home-house.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow } from '../../core/mats.js';
import { cityWalls, coreWorks, cathedral, clockTower, whiteTower, layoutHouses, streetProps, wallRocks, reservedBoxes, obb, isFree, ROOF } from './mage-city.js';
import { CITY_LIFE } from '../../data/city-life.js';
import { CORE } from '../../data/bellcrown.js';

const H = BELL.y;
const stone = mat.stone(0xd5c5ae),
  light = mat.plaster(0xeee1c5),
  foot = mat.stone(0xad9685);
const tile = [0xd39e43, 0xbe532f, 0x5a6a7b, 0xd0723a, 0xa8472d, 0x9a5938, 0xc99456].map((c) => mat.tile(c));
const plaster = [light, mat.plaster(0xe7c5a4), mat.plaster(0xd6b398), mat.plaster(0xe2c7a5)];
const wood = mat.wood(0x724e40),
  trim = mat.wood(0xac7955),
  dark = mat.paint(0x343940);
const glass = mat.paint(0x71919a),
  brass = mat.metal(0xcd9a51),
  blue = mat.cloth(0x385d86),
  red = mat.cloth(0xb24c42);
const pave = mat.stone(0xb29d8c),
  street = mat.stone(0xc7b39b),
  border = mat.stone(0xe1caa4);
const gableGeo = new THREE.BufferGeometry();
const corners = [
  [-0.5, 0, 0.5],
  [0.5, 0, 0.5],
  [0, 1, 0.5],
  [-0.5, 0, -0.5],
  [0.5, 0, -0.5],
  [0, 1, -0.5]
];
const faces = [0, 1, 2, 4, 3, 5, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 3, 4, 1, 3, 1, 0];
gableGeo.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(
    faces.flatMap((i) => corners[i]),
    3
  )
);
gableGeo.computeVertexNormals();
function gable(g, w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(gableGeo, m);
  o.scale.set(w, h, d);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}
function band(g, x, y, z, w, h, d, m) {
  const o = box(w, h, d, m, x, y, z);
  g.add(o);
  return o;
}
function flag(g, x, y, z, size, m) {
  g.add(cyl(0.048, 0.068, size * 1.8, brass, x, y + size * 0.8, z, 6));
  const v = [
    0,
    0,
    0,
    size * 0.94,
    -size * 0.12,
    0,
    size * 1.52,
    -size * 0.28,
    0.07,
    size * 0.93,
    -size * 0.42,
    0.1,
    0,
    -size * 0.49,
    0
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geom.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 2, 1, 0, 3, 2, 0, 4, 3, 0]);
  geom.computeVertexNormals();
  const b = new THREE.Mesh(geom, m);
  b.position.set(x, y + size * 1.6, z);
  g.add(b);
}
function casement(g, x, y, z, w, h) {
  band(g, x, y, z, w + 0.2, h + 0.22, 0.16, wood);
  band(g, x, y + 0.02, z + 0.09, w, h, 0.07, glass);
  band(g, x, y - 0.04, z + 0.14, 0.085, h, 0.065, trim);
  band(g, x, y + 0.06 * h, z + 0.14, w, 0.09, 0.065, trim);
  band(g, x, y - h / 2 - 0.11, z + 0.08, w + 0.46, 0.16, 0.36, stone);
}
// The original concept artist describes entrances and shop signs at broom height.
function upstairsDoor(g, w, d, h) {
  const z = d / 2,
    doorX = w * 0.14,
    y = h * 0.53,
    deck = 2.05;
  band(g, doorX, y + 1.0, z + 0.11, 1.26, 2.0, 0.18, wood);
  band(g, doorX, y + 1.39, z + 0.245, 0.71, 0.77, 0.1, glass);
  band(g, doorX, y - 0.12, z + deck * 0.49, 2.75, 0.25, deck, trim);
  for (const side of [-1, 1]) {
    band(g, doorX + side * 1.29, y + 0.4, z + deck * 0.91, 0.12, 0.81, 0.12, wood);
    g.add(
      beam(doorX + side * 1.05, y - 1.33, z + 0.04, doorX + side * 1.05, y - 0.19, z + deck * 0.83, 0.13, 0.13, wood)
    );
    band(g, doorX + side * 1.29, y + 0.79, z + deck * 0.49, 0.12, 0.12, deck * 0.86, wood);
  }
  for (const u of [-1, 0, 1]) band(g, doorX + u * 0.44, y + 0.4, z + deck * 0.92, 0.08, 0.81, 0.08, wood);
  band(g, doorX, y + 0.8, z + deck * 0.92, 2.71, 0.12, 0.13, wood);
  const sx = -w * 0.33;
  g.add(beam(sx, y + 2.39, z + 0.02, sx, y + 2.39, z + 1.54, 0.095, 0.095, brass));
  for (const zz of [0.85, 1.38]) band(g, sx, y + 2.12, z + zz, 0.055, 0.52, 0.055, brass);
  band(g, sx, y + 1.65, z + 1.13, 0.14, 0.65, 0.94, wood);
  // Two-sided brass pictograms read from either direction down the lane.
  for (const side of [-1, 1]) {
    const sign = torus(0.21, 0.046, brass, sx + side * 0.091, y + 1.68, z + 1.13, 5, 12);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  }
}
function house(site, x, z, w, d, h, rot, seed, baseY = H) {
  // the hometown's street (buildEastTown) is modelled part by part: builders/home-house.js
  if (baseY !== H) return homeHouse(site, x, z, w, d, h, rot, seed, baseY);
  const g = new THREE.Group(),
    roof = tile[seed % tile.length],
    body = plaster[seed % plaster.length],
    f = d / 2;
  band(g, 0, 0.35, 0, w + 0.2, 0.7, d + 0.2, foot);
  band(g, 0, h / 2 + 0.26, 0, w, h - 0.45, d, body);
  for (const xx of [-w / 2 + 0.11, w / 2 - 0.11]) {
    band(g, xx, h * 0.52, 0, 0.2, h - 0.55, d + 0.08, trim);
  }
  for (const yy of [h * 0.49, h - 0.14]) band(g, 0, yy, 0, w + 0.24, 0.22, d + 0.25, wood);
  const rise = w * (0.31 + 0.045 * (seed % 4));
  gable(g, w + 0.85, rise, d + 1, roof, 0, h, 0);
  const front = f + 0.5;
  gable(g, w - 0.34, rise * 0.88, 0.12, body, 0, h + 0.03, front);
  for (const side of [-1, 1])
    g.add(beam(0, h + rise + 0.02, front + 0.1, side * (w / 2 + 0.42), h, front + 0.1, 0.14, 0.15, wood));
  band(g, 0, h + rise, 0, 0.24, 0.22, d + 1.02, roof);
  const bay = w * 0.275;
  for (const xx of [-bay, bay]) {
    casement(g, xx, h * 0.73, f + 0.03, 1.11, 1.55);
    casement(g, xx, h * 0.26, f + 0.03, 1.05, 1.26);
  }
  band(g, 0, 1.15, f + 0.08, 1.53, 2.3, 0.24, wood);
  band(g, 0, 1.06, f + 0.216, 1.04, 2.1, 0.05, dark);
  casement(g, 0, h + rise * 0.35, front + 0.065, 0.71, 0.83);
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.rotation.y = (side * Math.PI) / 2;
    wing.position.x = (side * w) / 2;
    for (const xx of [-d * 0.25, d * 0.25]) casement(wing, xx, h * 0.7, 0.015, 1, 1.47);
    g.add(wing);
  }
  const cx = (seed % 2 ? 1 : -1) * w * 0.24,
    cz = -d * 0.22;
  band(g, cx, h + rise * 0.63, cz, 0.71, rise * 0.85 + 1, 0.83, foot);
  band(g, cx, h + rise * 1.05 + 0.44, cz, 0.88, 0.23, 1.0, wood);
  if (seed % 3 === 0) {
    const canopy = band(g, 0, h * 0.41, f + 0.78, w * 0.79, 0.16, 1.63, seed % 2 ? red : blue);
    canopy.rotation.x = 0.15;
    for (let i = 0; i < 7; i++)
      band(
        g,
        (i - 3) * w * 0.11,
        h * 0.41 - 0.19,
        f + 1.56,
        w * 0.11 - 0.025,
        0.26,
        0.11,
        i % 2 ? light : seed % 2 ? red : blue
      );
  }
  if (baseY === H && seed % 3 !== 0) {
    upstairsDoor(g, w, d, h);
    const a = w * 0.14,
      b = d / 2 + 1.02;
    site.platBox(
      x + a * Math.cos(rot) + b * Math.sin(rot),
      z - a * Math.sin(rot) + b * Math.cos(rot),
      1.37,
      1.0,
      rot,
      baseY + h * 0.53 + 0.01,
      0.22
    );
  }
  if(baseY===H)finishFrontage(g,{w,d,h,rise,seed,shop:seed%3!==0,shutters:true});
  site.add(g, x, baseY, z, rot);
  site.footprint(x, z, rot, w / 2, d / 2, baseY + h, seed);
  site.colBox(x, z, w / 2, d / 2, rot, baseY, baseY + h);
  // Stepped support follows the pitched roof rather than a platform suspended over the eaves.
  for (let i = -3; i <= 3; i++) {
    const lx = (w * i) / 7,
      top = baseY + h + rise * (1 - Math.abs(lx) / (w * 0.5 + 0.425));
    site.platBox(x + lx * Math.cos(rot), z - lx * Math.sin(rot), w / 14, d / 2, rot, top, 0.22);
  }
}
function paving(site) {
  const g = new THREE.Group();
  const apron = new THREE.Shape();
  for (const [i, [x, z]] of BELL_WALL.entries()) {
    if (i) apron.lineTo(x, -z);
    else apron.moveTo(x, -z);
  }
  apron.closePath();
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(apron), pave);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.043;
  g.add(floor);
  for (const segments of BELL_ROADS)
    for (let i = 1; i < segments.length; i++) {
      const [a, b] = segments[i - 1],
        [c, d] = segments[i];
      const len = Math.hypot(c - a, d - b),
        ang = Math.atan2(c - a, d - b);
      const run = band(g, (a + c) / 2, 0.058, (b + d) / 2, 5.6, 0.04, len + 1, street);
      run.rotation.y = ang;
      for (const side of [-1, 1]) {
        const curb = band(
          g,
          (a + c) / 2 + Math.cos(ang) * side * 2.78,
          0.09,
          (b + d) / 2 - Math.sin(ang) * side * 2.78,
          0.17,
          0.035,
          len,
          border
        );
        curb.rotation.y = ang;
      }
      for (let n = 3; n < len; n += 3.6) {
        const joint = band(g, a + ((c - a) * n) / len, 0.085, b + ((d - b) * n) / len, 5.3, 0.012, 0.048, pave);
        joint.rotation.y = ang;
      }
    }
  const disc = cyl(10.4, 10.4, 0.1, street, -5, 0.08, 4, 24);
  g.add(disc);
  for (const r of [2.55, 9.68]) {
    const ring = torus(r, 0.1, border, -5, 0.14, 4, 4, 32);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  for (let j = 0; j < 8; j++) {
    const a = (j * Math.PI) / 4,
      ray = band(g, -5 + Math.sin(a) * 4.25, 0.14, 4 + Math.cos(a) * 4.25, 0.2, 0.08, 3.7, border);
    ray.rotation.y = a;
  }
  site.add(g, 0, H, 0);
}
// Each background rider is one coloured mesh, shared by the three flight paths.
function riders(ctx) {
  const g = new THREE.Group(),
    skin = mat.plaster(0xe3bb9c);
  g.add(cyl(0.035, 0.04, 2.53, wood, 0, 0.04, 0.3, 7), cone(0.23, 0.73, trim, 0, 0.05, -0.84, 7));
  g.children[0].rotation.x = Math.PI / 2;
  g.children[1].rotation.x = Math.PI / 2;
  g.add(
    cone(0.34, 0.69, blue, 0, 0.46, 0, 8),
    sphere(0.145, skin, 0, 0.93, 0.07, 8, 6),
    cyl(0.34, 0.32, 0.045, dark, 0, 1.07, 0.06, 10),
    cone(0.19, 0.44, blue, 0, 1.28, 0.05, 8)
  );
  for (const [x, z] of [
    [0.16, 0.09],
    [0.23, -0.12]
  ]) {
    g.add(
      beam(x, 0.2, z, x + 0.08, -0.25, z + 0.1, 0.11, 0.15, dark),
      beam(x + 0.08, -0.25, z + 0.1, x + 0.1, -0.28, z + 0.28, 0.12, 0.11, wood)
    );
  }
  g.add(beam(0.13, 0.64, 0.03, 0.08, 0.25, 0.51, 0.12, 0.1, blue));
  const bits = [];
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!o.isMesh) return;
    const b = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    b.applyMatrix4(o.matrixWorld);
    b.deleteAttribute('uv');
    const c = o.material.color,
      a = new Float32Array(b.attributes.position.count * 3);
    for (let j = 0; j < a.length; j += 3) {
      a[j] = c.r;
      a[j + 1] = c.g;
      a[j + 2] = c.b;
    }
    b.setAttribute('color', new THREE.BufferAttribute(a, 3));
    bits.push(b);
  });
  const geo = mergeGeometries(bits),
    m = M.plaster().clone();
  m.color.set(0xffffff);
  m.vertexColors = true;
  const flock = new THREE.Group(),
    all = [];
  for (let j = 0; j < 3; j++) {
    const o = new THREE.Mesh(geo, m);
    o.scale.setScalar(1.12);
    flock.add(o);
    all.push(o);
  }
  flock.name = 'BellcrownWindCouriers';
  G.scene.add(flock);
  ctx.tick((_dt, time) => {
    const p = G.player?.pos || G.camera.position;
    flock.visible = Math.hypot(p.x - BELL.x, p.z - BELL.z) < 210;
    if (!flock.visible) return;
    all.forEach((o, j) => {
      const a = time * (0.082 + j * 0.015) + j * 2.094,
        rx = 32 + j * 4,
        rz = 15 + j * 2;
      o.position.set(
        BELL.x + Math.cos(a) * rx,
        H + 18.8 + j * 3 + Math.sin(a * 2 + j) * 1.1,
        BELL.z + 12 + Math.sin(a) * rz
      );
      o.rotation.set(0, Math.atan2(-rx * Math.sin(a), rz * Math.cos(a)), -0.15);
    });
  });
}

function insideWall(x, z, margin) {
  let inside = false,
    edge = 1e6;
  for (let i = 0, j = BELL_WALL.length - 1; i < BELL_WALL.length; j = i++) {
    const [ax, az] = BELL_WALL[j],
      [bx, bz] = BELL_WALL[i],
      dx = bx - ax,
      dz = bz - az;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    edge = Math.min(edge, Math.hypot(x - ax - dx * f, z - az - dz * f));
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside && edge > margin;
}
// The roof Elaina crashes through (episode two): plum tiles over grey-blue plaster, and on the south gable the wooden
// balcony with its heavy round handrail and the blue magic orbs on the rail posts (the still after the crash).
function accident(ctx, site) {
  const x = -14,
    z = 37,
    w = 8.4,
    d = 9.5,
    h = 7.4,
    slope = 0.65,
    g = new THREE.Group();
  const wallM = mat.plaster(0xc7cdcd),
    orbM = glow(0x8ccfff, 1.75);
  band(g, 0, h / 2, 0, w, h, d, wallM);
  band(g, 0, 0.3, 0, w + 0.2, 0.6, d + 0.2, foot);
  band(g, 0, 3.95, 0, w + 0.14, 0.16, d + 0.14, trim);
  gable(g, w, h * 0.03, d + 0.45, foot, 0, h - 0.08, 0);
  gable(g, w - 0.06, w * 0.5 * slope, d - 0.06, wallM, 0, h, 0);
  for (const u of [-2.45, 2.45]) {
    casement(g, u, 2.0, d * 0.5 + 0.03, 1.12, 1.5);
    casement(g, u, 5.55, d * 0.5 + 0.03, 1.0, 1.55);
  }
  const rear = new THREE.Group();
  rear.rotation.y = Math.PI;
  for (const u of [-2.45, 2.45]) casement(rear, u, 4.9, d * 0.5 + 0.03, 1.12, 1.6);
  g.add(rear);
  band(g, 0, 1.15, d / 2 + 0.05, 1.2, 2.3, 0.1, wood);
  band(g, 0, 5.3, d / 2 + 0.05, 1.25, 2.25, 0.1, wood);
  band(g, 0, 5.55, d / 2 + 0.11, 0.8, 1.3, 0.04, glass);
  // the roof sits at the canyon floor in the tall houses' shadow: a darker plum (0x7d4658) read as a black shape there
  const plain = mat.tile(0xb57a90),
    lightClay = mat.tile(0xc48c9f);
  const patched = new THREE.Group(),
    shards = new THREE.Group();
  for (let i = -5; i <= 5; i++)
    for (let j = -5; j <= 5; j++) {
      const xx = i * 0.807,
        zz = j * 0.898,
        y = h + (w * 0.5 - Math.abs(xx)) * slope;
      const fixed = i >= -1 && i <= 1 && j >= 1 && j <= 3;
      const b = band(fixed ? patched : g, xx, y, zz, 0.99, 0.17, 0.97, (i + j) % 4 ? plain : lightClay);
      b.rotation.z = i > 0 ? -Math.atan(slope) : i < 0 ? Math.atan(slope) : 0;
      if (fixed) {
        const fragment = band(shards, xx + 0.13, y - 0.26, j * 0.898 + 0.1, 0.57, 0.13, 0.49, (i + j) % 2 ? lightClay : plain);
        fragment.rotation.set(0.14 + i * 0.12, 0.28 * j, 0.18 * i);
      }
    }
  // the balcony on the upper floor of the south gable
  const by = 4.15,
    bz = d / 2,
    bd = 2.1,
    bw = 6.4;
  band(g, 0, by, bz + bd / 2, bw, 0.18, bd, wood);
  for (const s of [-1, 0, 1]) g.add(beam(s * 2.6, by - 1.25, bz + 0.05, s * 2.6, by - 0.1, bz + bd * 0.85, 0.16, 0.16, wood));
  const fz = bz + bd - 0.12;
  for (const [px, pz] of [[-bw / 2 + 0.12, fz], [bw / 2 - 0.12, fz], [-bw / 2 + 0.12, bz + 0.2], [bw / 2 - 0.12, bz + 0.2], [-1.05, fz], [1.05, fz]]) {
    band(g, px, by + 0.82, pz, 0.22, 1.64, 0.22, wood);
    g.add(cyl(0.17, 0.12, 0.15, brass, px, by + 1.7, pz, 8), sphere(0.3, orbM, px, by + 2.02, pz, 10, 8));
  }
  const front = cyl(0.1, 0.1, bw, wood, 0, by + 1.02, fz, 8);
  front.rotation.z = Math.PI / 2;
  g.add(front);
  for (const s of [-1, 1]) {
    const side = cyl(0.1, 0.1, bd, wood, s * (bw / 2 - 0.12), by + 1.02, bz + bd / 2, 8);
    side.rotation.x = Math.PI / 2;
    g.add(side);
    for (let k = 1; k < 4; k++) band(g, s * (bw / 2 - 0.12), by + 0.5, bz + (bd * k) / 4, 0.07, 0.86, 0.07, wood);
    g.add(beam(s * (bw / 2 - 0.5), by + 0.1, fz - 0.05, s * (bw / 2 - 0.5), h - 0.55, fz + 0.18, 0.2, 0.2, wood));
  }
  for (let k = 1; k < 13; k++) band(g, -bw / 2 + (bw * k) / 13, by + 0.5, fz, 0.07, 0.86, 0.07, wood);
  const pent = band(g, 0, h - 0.35, bz + bd / 2 + 0.25, bw + 0.7, 0.16, bd + 0.9, plain);
  pent.rotation.x = 0.3;
  site.add(g, x, H, z);
  site.colBox(x, z, w / 2, d / 2, 0, H, H + h);
  site.platBox(x, z + bz + bd / 2, bw / 2, bd / 2, 0, H + by + 0.09, 0.25);
  for (let i = -5; i <= 5; i++)
    site.platBox(x + i * 0.807, z, 0.416, 5.0, 0, H + h + (w * 0.5 - Math.abs(i * 0.807)) * slope + 0.09, 0.19);
  for (const b of [patched, shards]) {
    b.position.set(BELL.x + x, H, BELL.z + z);
    G.scene.add(b);
  }
  const entry = {
    setRepaired(on) {
      patched.visible = !!on;
      shards.visible = !on;
    },
    x: BELL.x + x,
    z: BELL.z + z,
    top: H + h + w * 0.5 * slope + 0.09,
    // the open patch shows the plaster gable; the loose tiles of the repair step (story/episode-scenes.js) lie on it
    tiles: [plain, lightClay],
    pitch: (w * 0.5 * slope) / ((w - 0.06) / 2),
    patchY: (wx) => H + h + w * 0.5 * slope - entry.pitch * Math.abs(wx - entry.x)
  };
  entry.setRepaired(false);
  ctx.place('accidentRoof', entry);
}
function jeweller(site) {
  const x = -15,
    z = -7,
    g = new THREE.Group(),
    half = 3.65,
    depth = 3,
    height = 5.4,
    doorX = 1.46,
    doorWidth = 1.63;
  const wall = (cx, cz, w, d, h = height, base = 0) => {
    band(g, cx, base + h / 2, cz, w, h, d, plaster[2]);
    site.colBox(x + cx, z + cz, w / 2, d / 2, 0, H + base, H + base + h);
  };
  wall(-half, 0, 0.3, 6);
  wall(half, 0, 0.3, 6);
  wall(0, -depth, 7.3, 0.32);
  const l = doorX - doorWidth / 2,
    r = doorX + doorWidth / 2;
  wall((-half + l) / 2, depth, l + half, 0.31);
  wall((half + r) / 2, depth, half - r, 0.31);
  wall(doorX, depth, doorWidth, 0.31, height - 2.56, 2.56);
  band(g, 0, 0.055, 0, 7.25, 0.11, 6, wood);
  gable(g, 8.1, 3.2, 6.8, tile[2], 0, height, 0);
  for (const u of [l - 0.04, r + 0.04]) band(g, u, 1.32, depth + 0.12, 0.16, 2.64, 0.2, wood);
  band(g, doorX, 2.65, depth + 0.13, doorWidth + 0.31, 0.23, 0.23, wood);
  casement(g, -1.75, 2.05, 3.07, 2.46, 2.1);
  band(g, -1.65, 0.89, 3.44, 3.62, 0.14, 0.82, trim);
  // A small open counter displays clasps and pins; the gold ring sign
  // hangs perpendicular to the lane so approaching riders can see it.
  for (const side of [-1, 1]) {
    const bust = cone(0.22, 0.37, mat.cloth(0x585864), -1.72 + side * 0.7, 1.15, 3.46, 9);
    g.add(bust);
    g.add(torus(0.1, 0.024, brass, -1.72 + side * 0.7, 1.18, 3.6, 5, 14));
  }
  band(g, -0.3, 0.59, -1.32, 4.05, 1.18, 1.03, wood);
  band(g, -0.3, 1.23, -1.32, 4.17, 0.12, 1.13, trim);
  site.colBox(x - 0.3, z - 1.32, 2.02, 0.52, 0, H, H + 1.28);
  for (let i = 0; i < 3; i++) {
    const u = -1.46 + i * 0.98;
    band(g, u, 1.32, -1.32, 0.72, 0.08, 0.68, blue);
    g.add(sphere(0.1, brass, u, 1.39, -1.32, 7, 5));
  }
  band(g, 2.9, 3.96, 3.74, 0.12, 0.12, 1.51, brass);
  for (let i = 0; i < 2; i++) {
    const sign = torus(0.42, 0.08, brass, 2.9, 3.48, 4.23, 6, 18);
    sign.rotation.y = (i * Math.PI) / 2;
    g.add(sign);
  }
  // The emporium is visited on foot; the counter, pin sign and gable also read from above.
  for(const side of [-1,1]){
    band(g,side*half,2.7,depth+.09,.21,5.4,.25,wood);
    for(const zz of [-1.95,.70]) {
      const wing=new THREE.Group();wing.rotation.y=side*Math.PI/2;wing.position.set(side*half,0,zz);
      casement(wing,0,2.2,.22,1.42,1.9);g.add(wing);
    }
    g.add(beam(side*(half-.10),4.0,depth+.18,side*1.5,5.4,depth+.18,.17,.19,wood));
    g.add(beam(side*(half+.18),height+.02,depth+.4,0,height+3.1,depth+.4,.16,.18,wood));
  }
  band(g,0,height-.10,0,7.53,.27,6.29,wood);
  band(g,0,height+1.16,depth+.37,.16,2.46,.21,wood);casement(g,0,height+.83,depth+.49,.76,.99);
  const awning=band(g,-1.79,3.43,depth+.91,3.87,.15,1.68,blue);awning.rotation.x=.17;
  for(let i=0;i<9;i++)band(g,-3.44+i*.414,3.11,depth+1.72,.39,.30,.115,i%2===0?blue:light);
  site.add(g, x, H, z);
  site.platBox(x, z, half, depth, 0, H + height + 1.45, 0.34);
}
// A second route through this block begins at the market crossing. The masonry
// stair rises onto a public roof terrace and connects to the curved south wall.
function lookoutWalk(site) {
  const g = new THREE.Group(),
    x = 15.8,
    start = 19.4,
    top = 13.0,
    steps = 41,
    stride = 0.64,
    width = 2.55;
  for (let i = 0; i < steps; i++) {
    const h = (top * (i + 1)) / steps,
      z = start + (i + 0.5) * stride;
    band(g, x, h / 2, z, width, h, stride + 0.025, i % 5 === 0 ? light : stone);
    site.platBox(x, z, width / 2, stride / 2 + 0.015, 0, H + h, 0.23);
    if (i % 6 === 0)
      for (const side of [-1, 1]) band(g, x + side * (width / 2 - 0.08), h + 0.43, z, 0.14, 0.86, 0.16, trim);
  }
  for (const side of [-1, 1])
    g.add(
      beam(
        x + side * (width / 2 - 0.08),
        1.13,
        start + 0.3,
        x + side * (width / 2 - 0.08),
        top + 0.85,
        start + stride * steps,
        0.12,
        0.15,
        trim
      )
    );
  function deck(cx, cz, w, d) {
    band(g, cx, top - 0.24, cz, w, 0.48, d, stone);
    site.platBox(cx, cz, w / 2, d / 2, 0, H + top, 0.45);
    for (const dx of [-w * 0.42, w * 0.42])
      for (const dz of [-d * 0.36, d * 0.36]) {
        band(g, cx + dx, top * 0.5 - 0.23, cz + dz, 0.58, top - 0.47, 0.58, foot);
        site.colBox(cx + dx, cz + dz, 0.29, 0.29, 0, H, H + top - 0.48);
      }
  }
  deck(21.1, 47.7, 13.45, 4.24);
  deck(27.68, 50.6, 4.1, 5.2);
  for (const [a, b, c, d] of [
    [14.42, 45.8, 14.42, 49.7],
    [14.42, 49.7, 26.3, 49.7],
    [17.18, 45.73, 27.47, 45.73],
    [29.65, 46.0, 29.65, 53.1],
    [25.72, 50.04, 25.72, 53.1]
  ]) {
    const dx = c - a,
      dz = d - b,
      n = Math.ceil(Math.hypot(dx, dz) / 2.3);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      band(g, a + dx * u, top + 0.44, b + dz * u, 0.22, 0.88, 0.22, light);
    }
    g.add(beam(a, top + 0.84, b, c, top + 0.84, d, 0.16, 0.16, stone));
  }
  // A stone bench marks the oriel overlooking the central high window.
  band(g, 21.35, top + 0.52, 49.02, 2.01, 0.24, 0.64, foot);
  for (const off of [-0.63, 0.63]) band(g, 21.35 + off, top + 0.24, 49.02, 0.29, 0.48, 0.5, foot);
  site.add(g, 0, H, 0);
}

function courtyardTrees(site) {
  const point = new THREE.Vector3(),
    lite = G.quality?.name === 'low';
  let planted = 0;
  for (let i = 0; i < 2600 && planted < (lite ? 60 : 150); i++) {
    const x = -226 + (((i + 11) * 89) % 460),
      z = -242 + (((i + 8) * 59) % 306);
    const core = Math.hypot(x - CORE.x, z - CORE.z) < CORE.r - 2;
    if (!insideWall(x, z, 3.5) || G.world.roadDist(BELL.x + x, BELL.z + z) < 3.8) continue;
    if (!core && Math.hypot(x - CORE.x, z - CORE.z) < CORE.r + 9) continue;
    if (
      (Math.abs(x - 41) < 12.5 && Math.abs(z - 5) < 15) ||
      Math.hypot(x + 14, z - 37) < 8.0 ||
      (Math.abs(x - 15.8) < 2.4 && z > 18 && z < 46) ||
      (x > 13 && x < 30 && z > 44 && z < 57) ||
      (Math.abs(x) < 6 && z < -30 && z > -76)
    )
      continue;
    const y = core ? CORE.h : H;
    point.set(BELL.x + x, y + 0.12, BELL.z + z);
    if (G.world.resolveCollisions(point, 2.05, 2)) continue;
    const west = x < -60,
      upper = z < -120,
      inn = x > 28 && z > -7;
    const key = west ? (i % 3 ? 'ginkgo1' : 'broad2') : upper ? (i % 3 ? 'maple1' : 'broad2') : inn ? 'birch' : 'broad2';
    const palette = west ? [0xcba45b, 0xd1ad63, 0xb3a063] : upper ? [0x995f69, 0x956f77, 0xab8075] : inn ? [0xa1b193, 0xa2ac81, 0x95ab83] : [0x81975e, 0x8d9c67, 0x738b5d];
    site.add(procTree(key, 0.68 + 0.065 * (i % 4), palette[i % 3]), x, y - 0.035, z, i * 1.73);
    site.colCyl(x, z, 0.21, y, y + 3.6);
    planted++;
  }
}
export async function buildBellcrown(ctx) {
  const site = new Site('landOfMages', BELL.x, BELL.z);
  for (const k of ['balconies', 'roofPads', 'bridges', 'shopFronts']) CITY_LIFE[k].length = 0;
  CITY_LIFE.ready = false;
  paving(site);
  cityWalls(site);
  coreWorks(site);
  cathedral(site);
  clockTower(site, 22, -52);
  await ctx.step('mages:walls');
  const taken = reservedBoxes();
  // slim pale towers rise out of the far districts
  for (const [x, z, r, h, i] of [[-77, -25, 2.3, 44, 0], [-170, -110, 2.4, 48, 1], [-100, -170, 2.2, 46, 2], [110, -120, 2.3, 50, 3], [180, -60, 2.2, 44, 4], [-60, 30, 2.0, 40, 5], [150, 0, 2.1, 42, 6], [-195, -25, 2.2, 40, 7], [70, -34, 2.1, 42, 8]]) {
    const o = obb(x, z, 0, r + 1.2, r + 1.2);
    if (!isFree(taken, o) || G.world.roadDist(BELL.x + x, BELL.z + z) < r + 3.2) continue;
    whiteTower(site, x, z, r, h, [ROOF.slate, ROOF.gold, ROOF.red][i % 3]);
    taken.push(o);
  }
  const count = await layoutHouses(ctx, site, taken);
  accident(ctx, site);
  jeweller(site);
  lookoutWalk(site);
  const props = streetProps(site, taken);
  await ctx.step('mages:props');
  courtyardTrees(site);
  const rocks = wallRocks(site);
  await site.bakeBlocksSliced(64, ctx.step);
  CITY_LIFE.ready = true;
  const lite = G.quality?.name === 'low', mob = !!G.quality?.mobile; // phones (QUALITY.mobile): coarser block stand-ins, sooner
  ctx.place('landOfMages', { group: site.baked, blocks: site.blocks, site, houses: count, props, rocks, why: layoutHouses.why, life: CITY_LIFE, blockNear: mob ? 40 : lite ? 48 : 80, farCell: mob ? 1.3 : lite ? 1.0 : 0.7 });
  riders(ctx);
  mageResidents(ctx);
}
export async function buildEastTown(ctx) {
  const site = new Site('peacefulCountry', 2220, 48),
    floor = 19;
  // The house with the book and fireplace stands just inside the hometown's eastern street.
  for (const [i, [x, z, w, d, yaw]] of [
    [-20, -20, 8.4, 9.3, 0],
    [-30, -6, 7.7, 8.8, Math.PI / 2],
    [-29, 14, 9, 7.8, 0],
    [-9, 25, 8.6, 8.9, Math.PI],
    [8, 26, 7.6, 8.2, Math.PI],
    [23, 15, 8.1, 7.9, -1.57],
    [24, -2, 8.3, 9.1, -1.57],
    [15, -20, 7.5, 8.1, 0],
    [-2, -26, 9.0, 7.4, 0]
  ].entries()) {
    house(site, x, z, w, d, 6.8 + (i % 3) * 0.8, yaw, i + 20, floor);
  }
  await site.bakeBlocksSliced(34, ctx.step);
  ctx.place('peacefulCountry', { group: site.baked, site, blocks: site.blocks });
}
