// The Land of Mages after the episode-two aerial still (a vertical city of mages: tall narrow houses, balconies and
// landing terraces at every height, footbridges, a monumental gate): tall ashlar ring walls on a battered plinth, round towers
// crowned either by teal gems or by golden cones, the great gate with its gem medallion, a cathedral with twin spires,
// a dome and a glowing rose window, a brick clock tower, slim white towers, and terraced streets of three- and
// four-storey plastered houses under red-orange roofs (chimneys, dormers, shutters, window boxes, blue magic lamps).
// Everything is merged into the site's blocks (bakeBlocksSliced) and far-LODed by structures.js.
import * as THREE from 'three';
import { BELL, BELL_ROADS, BELL_WALL, BELL_SQUARES, CORE, bellEdge } from '../../data/bellcrown.js';
import { CITY_LIFE, ringTowerSpecs } from '../../data/city-life.js';
import { JOURNEY_ANCHORS } from '../../data/journey-map.js';
import { G } from '../../core/game.js';
import { glow } from '../../core/mats.js';
import { box, cone, cyl, sphere, torus } from '../../core/geo.js';
import { mat, beam, clothify, texGlow, texMat } from './kit.js';
import { mulberry32 } from '../../core/util.js';
import { modelGable, modelHip, chimney } from './city-roofs.js';
import { addBay, bayRange, startBays, BAY } from './city-bays.js';
import { hash01 } from './city-geo.js';

export const H = BELL.y;
export const WH = 24; // rampart walk height above the street
const lowQ = () => G.quality?.name === 'low';

// ---- palette (sampled from the stills: sand ashlar, cream / blue-grey plaster, red-orange and golden roofs) ----
const stone = mat.stone(0xd8c9a8),
  course = mat.stone(0xc3b08e),
  coping = mat.stone(0xebe1c9),
  foot = mat.stone(0xa39583),
  sill = mat.stone(0xe3d8c2);
const frame = mat.wood(0x5a4232),
  wood = mat.wood(0x6e4c38),
  trim = mat.wood(0xa67954),
  doorM = mat.wood(0x5c3a2c),
  dark = mat.paint(0x2e3238),
  glass = mat.paint(0x3d5667),
  glassLit = mat.paint(0x6f8f9c);
const brass = mat.metal(0xcf9f52),
  iron = mat.paint(0x35393f);
const brick = mat.stone(0xa65b40);
const leaf = mat.paint(0x587c46);
const bloom = [0xd65a4f, 0xe794a8, 0xf3eee2, 0xebc85a, 0xb77ad0].map((c) => mat.paint(c));
const shutterM = [0x56745e, 0x4c6787, 0x8e4c3e, 0x7b5c3d, 0x5f7f86].map((c) => mat.paint(c));
const cloth = [0x3d5f8c, 0xab4a40, 0x4f7259, 0xc59a45].map((c) => mat.paint(c));
const bannerCloth = mat.cloth(0x3d5f8c);
const R = (c) => mat.tile(c);
export const ROOF = {
  red: R(0xbe532f),
  terra: R(0xa8472d),
  orange: R(0xd0723a),
  gold: R(0xd39e43),
  plum: R(0x7f455a),
  slate: R(0x5a6a7b),
  umber: R(0x9a5938)
};
const ROOFMIX = [ROOF.red, ROOF.orange, ROOF.terra, ROOF.red, ROOF.gold, ROOF.umber, ROOF.orange, ROOF.slate, ROOF.terra, ROOF.red, ROOF.plum, ROOF.orange, ROOF.red];
const RIDGE = mat.tile(0x8a3d27);
export const WALLS = [0xf1e6cf, 0xf4efe4, 0xd3d9dc, 0xead5b4, 0xe0cba7, 0xc8d1d8, 0xefe0c2, 0xe6dccb].map((c) => mat.plaster(c));
// one self-lit material for the teal gems and the blue street orbs (one draw per block)
const gem = glow(0x74d6ec, 1.6),
  orb = gem,
  warm = glow(0xffb45c, 2.4);

// ---- small helpers ----
const gableGeo = new THREE.BufferGeometry();
{
  const c = [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5], [-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5]];
  const f = [0, 1, 2, 4, 3, 5, 0, 2, 5, 0, 5, 3, 1, 4, 5, 1, 5, 2, 3, 4, 1, 3, 1, 0];
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute(f.flatMap((i) => c[i]), 3));
  gableGeo.computeVertexNormals();
}
function prism(g, w, h, d, m, x, y, z) {
  const o = new THREE.Mesh(gableGeo, m);
  o.scale.set(w, h, d);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}
function b(g, x, y, z, w, h, d, m, ry = 0) {
  const o = box(w, h, d, m, x, y, z);
  if (ry) o.rotation.y = ry;
  g.add(o);
  return o;
}
/** Pitched roof shell over a w x d body whose eave is at h: triangular gable walls in the body colour and two
 *  tiled slabs; the ridge runs along z, or along x with alongX. */
function gableRoof(g, w, d, h, rise, roofM, bodyM, alongX, ov = 0.5) {
  const r = new THREE.Group();
  const W = alongX ? d : w,
    D = alongX ? w : d,
    half = W / 2,
    run = half + ov,
    slope = Math.atan2(rise, half),
    slant = run / Math.cos(slope);
  prism(r, W - 0.02, rise, D - 0.02, bodyM, 0, h, 0);
  for (const s of [-1, 1]) {
    const o = box(slant + 0.05, 0.24, D + 0.8, roofM, s * (run / 2 + 0.12 * Math.sin(slope)), h + rise - (rise * run) / (2 * half) + 0.12 * Math.cos(slope), 0);
    o.rotation.z = -s * slope;
    r.add(o);
    for (const e of [-1, 1]) {
      const bb = box(slant, 0.18, 0.12, trim, s * (run / 2), h + rise - (rise * run) / (2 * half) + 0.02, e * (D / 2 + 0.42));
      bb.rotation.z = -s * slope;
      r.add(bb);
    }
  }
  r.add(box(0.34, 0.22, D + 0.95, RIDGE, 0, h + rise + 0.2, 0));
  if (alongX) r.rotation.y = Math.PI / 2;
  g.add(r);
  return r;
}
/** Casement window on a face whose outer plane is z = zf (facing +z). opt: 1 shutters, 2 window box, 4 simple. */
function win(g, x, y, zf, ww, wh, seed, opt) {
  b(g, x, y, zf + 0.04, ww + 0.22, wh + 0.22, 0.08, frame);
  b(g, x, y, zf + 0.085, ww, wh, 0.03, glass);
  if (opt & 4) return;
  b(g, x, y, zf + 0.11, 0.06, wh, 0.03, frame);
  b(g, x, y + wh * 0.14, zf + 0.11, ww, 0.06, 0.03, frame);
  b(g, x, y - wh / 2 - 0.1, zf + 0.1, ww + 0.34, 0.1, 0.22, sill);
  if (opt & 1) for (const s of [-1, 1]) b(g, x + s * (ww / 2 + 0.25), y, zf + 0.06, 0.42, wh + 0.04, 0.05, shutterM[seed % 5]);
  if (opt & 2) {
    b(g, x, y - wh / 2 - 0.32, zf + 0.22, ww + 0.12, 0.22, 0.3, wood);
    for (let i = 0; i < 3; i++) b(g, x + (i - 1) * ww * 0.33, y - wh / 2 - 0.15, zf + 0.24, ww * 0.3, 0.2, 0.26, i === 1 ? leaf : bloom[(seed + i) % 5]);
  }
}
/** A face group: children built facing +z at z = 0, turned to the side `ry` of a w x d footprint. */
function face(g, ry, off) {
  const f = new THREE.Group();
  f.rotation.y = ry;
  f.position.set(Math.sin(ry) * off, 0, Math.cos(ry) * off);
  g.add(f);
  return f;
}

// ---- layout bookkeeping: oriented boxes in site-local metres ----
export function obb(x, z, yaw, hw, hd) {
  return { x, z, c: Math.cos(yaw), s: Math.sin(yaw), hw, hd };
}
function hits(a, q) {
  const dx = q.x - a.x,
    dz = q.z - a.z;
  for (const [ux, uz] of [[a.c, -a.s], [a.s, a.c], [q.c, -q.s], [q.s, q.c]]) {
    const ra = a.hw * Math.abs(a.c * ux - a.s * uz) + a.hd * Math.abs(a.s * ux + a.c * uz);
    const rb = q.hw * Math.abs(q.c * ux - q.s * uz) + q.hd * Math.abs(q.s * ux + q.c * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}
export function isFree(taken, o) {
  for (const t of taken) if (Math.abs(t.x - o.x) < 30 && Math.abs(t.z - o.z) < 30 && hits(t, o)) return false;
  return true;
}
const roadAt = (x, z) => G.world.roadDist(BELL.x + x, BELL.z + z);
function roadClear(o, m) {
  for (const [i, j] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const lx = i * o.hw,
      lz = j * o.hd;
    if (roadAt(o.x + lx * o.c + lz * o.s, o.z - lx * o.s + lz * o.c) < m) return false;
  }
  return true;
}
export function insideWall(x, z, margin) {
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
/** Story anchors in site-local metres (props keep 3.5 m clear of them). */
const ANCH = Object.values(JOURNEY_ANCHORS)
  .map((a) => [a.x - BELL.x, a.z - BELL.z])
  .filter(([x, z]) => Math.abs(x) < 200 && Math.abs(z) < 200)
  .concat([[6, 5], [-37, -21.8], [14, 3.25], [28.2, 15], [6.2, -36]]);
const nearAnchor = (x, z, r = 3.6) => ANCH.some(([a, c]) => Math.hypot(a - x, c - z) < r);
// The broom route of the story (crash roof -> jeweller at 48 m) stays above the houses between them.
const lowZone = (x, z) => x > -32 && x < 4 && z > -12 && z < 47;

// ---- painted upper facades: one repeating texture (2 bays x 2 storeys) tinted per material ----
let _facade = null;
function facadeTex() {
  if (_facade) return _facade;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f3efe6';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(${150 + (i % 5) * 10},${140 + (i % 3) * 8},120,0.05)`;
    x.beginPath();
    x.arc((i * 73) % 256, (i * 151) % 256, 6 + (i % 7) * 3, 0, Math.PI * 2);
    x.fill();
  }
  for (let r = 0; r < 2; r++) {
    x.fillStyle = '#d6cdbd';
    x.fillRect(0, r * 128 + 124, 256, 4);
    for (let q = 0; q < 2; q++) {
      const ox = q * 128,
        oy = r * 128,
        wx = ox + 38,
        wy = oy + 20,
        ww = 52,
        wh = 80,
        arched = (q + r) % 2 === 1;
      if ((q + r) % 2 === 0) {
        x.fillStyle = q ? '#4c6787' : '#4f6f5a';
        x.fillRect(wx - 20, wy, 16, wh);
        x.fillRect(wx + ww + 4, wy, 16, wh);
      }
      x.fillStyle = '#e8e1d3';
      x.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
      if (arched) {
        x.beginPath();
        x.arc(wx + ww / 2, wy + 4, ww / 2 + 5, Math.PI, 0);
        x.fill();
      }
      const gr = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
      gr.addColorStop(0, '#5a7488');
      gr.addColorStop(0.5, '#2c3d4c');
      gr.addColorStop(1, '#22303c');
      x.fillStyle = gr;
      x.fillRect(wx, wy, ww, wh);
      if (arched) {
        x.beginPath();
        x.arc(wx + ww / 2, wy + 4, ww / 2, Math.PI, 0);
        x.fill();
      }
      x.fillStyle = '#d4cab8';
      x.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      x.fillRect(wx, wy + 28, ww, 4);
      x.fillStyle = '#cfc4b0';
      x.fillRect(wx - 9, wy + wh + 4, ww + 18, 7);
      if (q === 0 && r === 1) {
        x.fillStyle = '#6d4a35';
        x.fillRect(wx - 4, wy + wh - 6, ww + 8, 12);
        for (let k = 0; k < 7; k++) {
          x.fillStyle = k % 2 ? '#4f7a3e' : ['#d65a4f', '#e794a8', '#f3e9a0'][k % 3];
          x.beginPath();
          x.arc(wx + 2 + k * 8, wy + wh - 8, 5, 0, Math.PI * 2);
          x.fill();
        }
      }
    }
  }
  _facade = new THREE.CanvasTexture(c);
  _facade.wrapS = _facade.wrapT = THREE.RepeatWrapping;
  _facade.colorSpace = THREE.SRGBColorSpace;
  _facade.anisotropy = 4;
  return _facade;
}
const TINTS = [0xf6e9cf, 0xd7dfe4, 0xedd2aa, 0xf2dccf];
const _fm = [];
const facadeMat = (i) => _fm[i] || (_fm[i] = (() => {
  const m = texMat(facadeTex(), { color: TINTS[i] });
  m.userData.farColor = TINTS[i];
  return m;
})());
const bodyMat = TINTS.map((c) => mat.plaster(c));
function facadeQuad(g, m, w, hgt, x, y, z, ry, bays, storeys) {
  const geo = new THREE.PlaneGeometry(w, hgt),
    uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * bays) / 2, (uv.getY(i) * storeys) / 2);
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  g.add(o);
}
/** A plastered block of `n` storeys from y0, its four faces painted with windows. */
function section(g, w, d, y0, n, FH, ti, dz = 0) {
  const hgt = n * FH,
    y = y0 + hgt / 2,
    fm = facadeMat(ti),
    bw = Math.max(1, Math.round(w / 1.6)),
    bd = Math.max(1, Math.round(d / 1.6));
  b(g, 0, y, dz, w, hgt, d, bodyMat[ti]);
  _faces?.push({ w, d, y0, n, ti, dz, bw, bd });
  facadeQuad(g, fm, w, hgt, 0, y, dz + d / 2 + 0.02, 0, bw, n);
  facadeQuad(g, fm, w, hgt, 0, y, dz - d / 2 - 0.02, Math.PI, bw, n);
  facadeQuad(g, fm, d, hgt, w / 2 + 0.02, y, dz, Math.PI / 2, bd, n);
  facadeQuad(g, fm, d, hgt, -w / 2 - 0.02, y, dz, -Math.PI / 2, bd, n);
}

// ---- modelled window bays (builders/city-bays.js) over the painted ones, near the camera ----
let _faces = null; // the sections of the town house being built (their faces get bays)
/**
 * Register a town house's bays: every painted window of its sections, in world space, with this house's style (shutter
 * colour, how many flower boxes / curtains / balconettes). `skip` lists front rectangles that something else covers
 * (balcony doors, the oriel): [y0, y1, x0, x1] in the house frame.
 */
function registerBays(faces, skip, x, z, base, yaw, seed) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const allShut = hash01(seed, 31) < 0.35,
    boxP = [0.06, 0.25, 0.5][Math.floor(hash01(seed, 37) * 3)],
    railP = hash01(seed, 41) < 0.3 ? 0.3 : 0,
    curP = 0.2 + 0.45 * hash01(seed, 43),
    shut = seed % 7,
    cur = Math.floor(hash01(seed, 47) * 5),
    bloom = Math.floor(hash01(seed, 53) * 6);
  let k = 0;
  for (const f of faces)
    for (const [ry, ox, oz, W, nb] of [[0, 0, f.dz + f.d / 2 + 0.02, f.w, f.bw], [Math.PI, 0, f.dz - f.d / 2 - 0.02, f.w, f.bw], [Math.PI / 2, f.w / 2 + 0.02, f.dz, f.d, f.bd], [-Math.PI / 2, -f.w / 2 - 0.02, f.dz, f.d, f.bd]]) {
      const xc = Math.cos(ry),
        xs = -Math.sin(ry),
        Wb = W / nb;
      for (let m = 0; m < f.n; m++)
        for (let j = 0; j < nb; j++, k++) {
          const xb = -W / 2 + (j + 0.5) * Wb,
            hy = f.y0 + m * 3.15;
          if (!ry && skip.some(([y0, y1, x0, x1]) => hy + 1.6 > y0 && hy + 1.6 < y1 && xb + Wb * 0.36 > x0 && xb - Wb * 0.36 < x1)) continue;
          // the painted cell under this bay (facadeTex: 2 bays x 2 storeys): shutters, arch, flower box
          const q = j % 2,
            r = m % 2 ? 0 : 1;
          let fl = (q + r) % 2 ? BAY.ARCH : BAY.SHUT;
          if (allShut) fl |= BAY.SHUT;
          if (fl & BAY.SHUT && hash01(seed + k, 7) < 0.07) fl |= BAY.CLOSED;
          if (hash01(k, seed) < boxP) fl |= BAY.BOX;
          else if (!(fl & BAY.ARCH) && hash01(seed, k * 1.3) < railP) fl |= BAY.RAIL;
          if (!(fl & BAY.CLOSED) && hash01(k * 0.7, seed + 3) < curP) fl |= BAY.CURTAIN;
          const hx = ox + xc * xb,
            hz = oz + xs * xb;
          addBay(BELL.x + x + hx * c + hz * s, base + hy, BELL.z + z - hx * s + hz * c, yaw + ry, Wb / 1.6, fl, f.ti, shut, cur, bloom + (k % 3), hash01(seed, k + 0.5));
        }
    }
}
/** Plastered block with painted windows for other builders (the inn's upper floors): w x d, n storeys of 3.15 m from y0. */
export function paintedBlock(g, w, d, y0, n, tint = 0) {
  section(g, w, d, y0, n, 3.15, tint % 4);
}
// ---- the tall town house ----
/**
 * A tall, narrow mage's house in the site's frame. o: { x, z, yaw, w, d, st (storeys above the shop floor), seed,
 * kind ('gable' | 'side' | 'flat' | 'cone'), shop, base, cap (max height of the roof tip above the base), life }.
 * Front faces local +z. Upper storeys jetty out; balconies, roof gardens and landing pads are real platforms.
 */
export function townhouse(site, o) {
  const { x, z, yaw, w, d, seed } = o,
    base = o.base ?? H,
    lite = lowQ(),
    g = new THREE.Group();
  const FH = 3.15,
    GF = 3.9;
  let st = o.st;
  const kind = o.kind || ['gable', 'gable', 'side', 'flat', 'cone', 'gable', 'side', 'flat'][seed % 8];
  let rise = kind === 'side' ? d * 0.62 : kind === 'cone' ? Math.min(w, d) * 1.25 : kind === 'flat' ? 1.1 : w * (0.85 + 0.08 * (seed % 3));
  let h = GF + st * FH;
  if (o.cap) {
    while (st > 1 && h + rise > o.cap) {
      st--;
      h = GF + st * FH;
    }
    if (h + rise > o.cap) rise = Math.max(1.4, o.cap - h);
  }
  const ti = (seed * 3 + 1) % 4,
    roofM = o.roof || ROOFMIX[(seed * 5 + 3) % ROOFMIX.length];
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const life = o.life;
  _faces = bayRange() ? [] : null;
  const covered = [];
  // shop floor in dressed stone
  b(g, 0, 0.25, 0, w + 0.3, 0.5, d + 0.3, foot);
  b(g, 0, GF / 2, 0, w + 0.1, GF, d + 0.1, sill);
  b(g, 0, GF + 0.05, 0, w + 0.34, 0.24, d + 0.34, trim);
  // upper storeys: a lower block, then the jettied upper block (it leans out over the street)
  const k1 = st <= 3 ? st : Math.ceil(st * 0.55),
    jet = lite || st <= 3 ? 0 : 0.42;
  section(g, w, d, GF, k1, FH, ti);
  if (st > k1) {
    const y1 = GF + k1 * FH;
    section(g, w + jet, d + jet, y1, st - k1, FH, (ti + (seed % 2)) % 4, jet / 2);
    b(g, 0, y1, jet / 2, w + jet + 0.2, 0.26, d + jet + 0.2, wood);
    if (!lite) for (let k = 0; k < 4; k++) g.add(beam(-w / 2 + (w * (k + 0.5)) / 4, y1 - 0.75, d / 2 - 0.05, -w / 2 + (w * (k + 0.5)) / 4, y1 - 0.12, d / 2 + jet, 0.14, 0.14, wood));
  }
  const fz = d / 2 + (st > k1 ? jet : 0);
  // cornice band at the wall top (shallow under a pitched roof: the eave's soffit and fascia take over)
  const cor = kind === 'flat' ? 0.36 : 0.12;
  b(g, 0, h - 0.06, fz / 2 - d / 4 + 0.0, w + jet + cor, 0.24, d + jet + cor, trim);
  // street front: door, shop window or windows, door lantern
  const zf = d / 2 + 0.05,
    doorX = (seed % 2 ? 1 : -1) * (w / 2 - 1.0);
  b(g, doorX, 1.3, zf, 1.45, 2.6, 0.08, sill);
  b(g, doorX, 1.2, zf + 0.04, 1.1, 2.3, 0.08, doorM);
  b(g, doorX, 0.09, zf + 0.33, 1.6, 0.18, 0.6, foot);
  const wx = -doorX * 0.45,
    ww = Math.max(1.2, w - 3.2);
  if (o.shop) {
    if (life) {
      const [px, pz] = W(wx, zf + 1.2);
      life.shopFronts.push({ x: BELL.x + px, z: BELL.z + pz, face: yaw });
    }
    b(g, wx, 1.75, zf, ww + 0.2, 2.1, 0.1, frame);
    b(g, wx, 1.78, zf + 0.05, ww, 1.85, 0.03, glassLit);
    b(g, wx, 0.6, zf + 0.1, ww + 0.2, 0.12, 0.3, sill);
    const awn = cloth[seed % 4],
      a = b(g, wx, 3.2, zf + 0.62, ww + 0.6, 0.08, 1.3, awn);
    a.rotation.x = 0.3;
    g.add(beam(doorX + Math.sign(doorX) * 0.75, 3.5, zf, doorX + Math.sign(doorX) * 0.75, 3.5, zf + 0.95, 0.07, 0.07, iron));
    const sign = cyl(0.42, 0.42, 0.07, seed % 2 ? brass : wood, doorX + Math.sign(doorX) * 0.75, 3.0, zf + 0.72, 12);
    sign.rotation.z = Math.PI / 2;
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
  } else win(g, wx, 1.95, zf - 0.05, Math.min(1.3, ww), 1.4, seed, lite ? 4 : 1);
  if (seed % 3 !== 2) {
    g.add(beam(doorX - Math.sign(doorX) * 0.95, 2.75, zf, doorX - Math.sign(doorX) * 0.95, 2.75, zf + 0.4, 0.05, 0.05, iron));
    g.add(sphere(0.14, warm, doorX - Math.sign(doorX) * 0.95, 2.55, zf + 0.4, 7, 5), cone(0.18, 0.2, iron, doorX - Math.sign(doorX) * 0.95, 2.76, zf + 0.4, 6));
  }
  // balconies: real platforms at several heights (never in the story's low quarter)
  if (!o.cap && st >= 3) {
    let made = 0;
    for (let k = 2; k <= st && made < (lite ? 1 : 3); k++) {
      if ((k + seed) % 3 !== 0) continue;
      const y = GF + (k - 1) * FH,
        jz = k > k1 ? jet : 0,
        bw = Math.min(w - 0.7, 3.8),
        bd = 1.55,
        bx = made % 2 ? -0.15 * w : 0.15 * w;
      const front = d / 2 + jz;
      b(g, bx, y, front + bd / 2, bw, 0.16, bd, wood);
      b(g, bx, y + 1.0, front + bd - 0.05, bw, 0.09, 0.09, wood);
      for (const sx of [-1, 1]) b(g, bx + sx * (bw / 2 - 0.05), y + 1.0, front + bd / 2, 0.09, 0.09, bd, wood);
      if (!lite) {
        for (let i = 0; i <= 5; i++) b(g, bx - bw / 2 + (bw * i) / 5, y + 0.5, front + bd - 0.05, 0.06, 0.9, 0.06, wood);
        for (const sx of [-1, 1]) g.add(beam(bx + sx * bw * 0.38, y - 1.0, front + 0.02, bx + sx * bw * 0.38, y - 0.1, front + bd * 0.85, 0.12, 0.12, wood));
      }
      b(g, bx, y + 1.15, front + 0.04, 1.0, 2.1, 0.06, doorM);
      covered.push([y, y + 3.15, bx - 0.55, bx + 0.55]);
      if ((seed + k) % 2 === 0) {
        b(g, bx + bw / 2 - 0.05, y + 0.75, front + bd - 0.05, 0.12, 1.5, 0.12, wood);
        g.add(sphere(0.24, orb, bx + bw / 2 - 0.05, y + 1.7, front + bd - 0.05, 9, 7));
      }
      if (_faces && !lite) {
        // turned balustrades along the rails (city-bays.js, near the camera only): front run and both sides
        for (const [lx, lz, ry, len] of [[bx, front + bd - 0.05, 0, bw - 0.1], [bx - bw / 2 + 0.05, front + bd / 2, -Math.PI / 2, bd - 0.1], [bx + bw / 2 - 0.05, front + bd / 2, Math.PI / 2, bd - 0.1]]) {
          const np = Math.max(1, Math.round(len)),
            ux = Math.cos(ry),
            uz = -Math.sin(ry);
          for (let i = 0; i < np; i++) {
            const t = ((i + 0.5) / np - 0.5) * len,
              [px, pz] = W(lx + ux * t, lz + uz * t);
            addBay(BELL.x + px, base + y + 0.08, BELL.z + pz, yaw + ry, len / np, BAY.PANEL, seed % 3, 0, 0, 0, 0);
          }
        }
      }
      const [px, pz] = W(bx, front + bd / 2);
      site.platBox(px, pz, bw / 2, bd / 2, yaw, base + y + 0.08, 0.3);
      life?.balconies.push({ x: BELL.x + px, y: base + y + 0.08, z: BELL.z + pz, face: yaw, r: Math.min(bw, bd) / 2, w: bw, d: bd, kind: 'balcony' });
      made++;
    }
  }
  // an oriel bay on some fronts
  if (!lite && st >= 4 && seed % 4 === 1) {
    const y0 = GF + FH,
      ow = Math.min(2.4, w * 0.45),
      ox = doorX * 0.2;
    b(g, ox, y0 + FH, d / 2 + 0.45, ow, FH * 2, 0.9, bodyMat[ti]);
    covered.push([y0 - 0.2, y0 + FH * 2 + 0.2, ox - ow / 2 - 0.2, ox + ow / 2 + 0.2]);
    facadeQuad(g, facadeMat(ti), ow, FH * 2, ox, y0 + FH, d / 2 + 0.92, 0, 1, 2);
    prism(g, ow + 0.3, 0.9, 1.2, roofM, ox, y0 + FH * 2, d / 2 + 0.45);
    b(g, ox, y0 - 0.08, d / 2 + 0.45, ow + 0.2, 0.2, 1.1, trim);
  }
  // roof
  const top = h;
  if (kind === 'flat') {
    b(g, 0, top + 0.12, jet / 2, w + jet, 0.24, d + jet, sill);
    for (const sx of [-1, 1]) b(g, sx * ((w + jet) / 2 - 0.12), top + 0.75, jet / 2, 0.24, 1.0, d + jet, sill);
    b(g, 0, top + 0.75, jet / 2 - (d + jet) / 2 + 0.12, w + jet, 1.0, 0.24, sill);
    if (!lite) {
      for (let i = 0; i < 4; i++) {
        const px = -w / 2 + 0.6 + ((w - 1.2) * i) / 3;
        b(g, px, top + 0.45, jet / 2 - d / 2 + 0.7, 0.8, 0.45, 0.6, wood);
        g.add(sphere(0.42, i % 2 ? leaf : bloom[(seed + i) % 5], px, top + 0.85, jet / 2 - d / 2 + 0.7, 7, 5));
      }
      const ring = torus(Math.min(w, d) * 0.28, 0.06, brass, 0, top + 0.26, jet / 2 + 0.4, 4, 20);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      // a pergola corner
      for (const [px, pz] of [[w / 2 - 0.4, jet / 2 + d / 2 - 0.4], [w / 2 - 0.4, jet / 2 + d / 2 - 2.2]]) b(g, px, top + 1.2, pz, 0.12, 2.2, 0.12, wood);
      b(g, w / 2 - 0.4, top + 2.3, jet / 2 + d / 2 - 1.3, 0.14, 0.14, 2.1, wood);
    }
    const [px, pz] = W(0, jet / 2);
    site.platBox(px, pz, (w + jet) / 2 - 0.3, (d + jet) / 2 - 0.3, yaw, base + top + 0.24, 0.4);
    life?.roofPads.push({ x: BELL.x + px, y: base + top + 0.24, z: BELL.z + pz, r: Math.min(w, d) / 2 - 0.4 });
    life?.balconies.push({ x: BELL.x + px, y: base + top + 0.24, z: BELL.z + pz, face: yaw, r: Math.min(w, d) / 2 - 0.4, w: w - 0.6, d: d - 0.6, kind: 'roof' });
  } else {
    // modelled roofs (builders/city-roofs.js): courses, cover tiles, ridge, eaves, barge boards
    const rg = new THREE.Group();
    rg.position.z = jet / 2;
    if (kind === 'cone') modelHip(rg, w + jet, d + jet, top, rise, roofM, 0.55, seed);
    else modelGable(rg, w + jet, d + jet, top, rise, roofM, bodyMat[ti], kind === 'side', 0.5, seed, -Math.sign(doorX) * (w / 2 - 0.12));
    g.add(rg);
  }
  if (kind !== 'flat' && (seed % 2 === 0 || st >= 6)) {
    const along = kind === 'side',
      cx = (seed % 4 < 2 ? -1 : 1) * w * (along ? 0.3 : 0.24),
      cz = along ? -d * 0.22 : -d * 0.2;
    const tip = top + rise * (1 - (along ? Math.abs(cz) / (d / 2) : Math.abs(cx) / (w / 2))) + 1.5;
    chimney(g, cx, cz, top, tip, seed);
  }
  site.add(g, x, base, z, yaw);
  if (_faces) registerBays(_faces, covered, x, z, base, yaw, seed);
  _faces = null;
  site.footprint(x, z, yaw, w / 2 + 0.3, d / 2 + 0.3, base + h, seed);
  site.colBox(x, z, w / 2, d / 2, yaw, base, base + h);
  if (st > k1) {
    const [px, pz] = W(0, jet / 2);
    site.colBox(px, pz, (w + jet) / 2, (d + jet) / 2, yaw, base + GF + k1 * FH, base + h);
  }
  if (kind !== 'flat') {
    const along = kind === 'side',
      Wd = (along ? d : w) + jet,
      Dd = (along ? w : d) + jet;
    for (let i = -2; i <= 2; i++) {
      const u = (Wd * i) / 5,
        tp = base + top + Math.max(0, rise * (1 - Math.abs(u) / (Wd / 2))) + 0.22;
      const [px, pz] = W(along ? 0 : u, (along ? u : 0) + jet / 2);
      site.platBox(px, pz, along ? Dd / 2 : Wd / 10, along ? Wd / 10 : Dd / 2, yaw, tp, 0.35);
    }
  }
  return h + rise;
}
/** Open footbridge between two facing house fronts (a hop for walkers up high, a perch for brooms). */
function footbridge(site, x, z, yaw, len, y, life) {
  const g = new THREE.Group();
  b(g, 0, 0, 0, 2.2, 0.3, len, stone);
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9 - 0.5,
      dy = -0.25 - 0.9 * (1 - (2 * t) ** 2);
    b(g, 0, dy, t * len, 2.0, 0.5, len / 9 + 0.05, course);
  }
  for (const sx of [-1, 1]) {
    b(g, sx * 1.02, 0.55, 0, 0.16, 0.8, len, coping);
    b(g, sx * 1.02, 1.0, 0, 0.22, 0.12, len + 0.1, sill);
  }
  g.add(cyl(0.07, 0.07, 1.6, iron, 0.95, 1.6, 0, 6), sphere(0.24, orb, 0.95, 2.5, 0, 9, 7));
  site.add(g, x, y, z, yaw);
  site.platBox(x, z, 1.05, len / 2, yaw, y + 0.16, 0.35);
  life?.bridges.push({ x: BELL.x + x, y: y + 0.16, z: BELL.z + z, yaw, len });
  life?.balconies.push({ x: BELL.x + x, y: y + 0.16, z: BELL.z + z, face: yaw + Math.PI / 2, r: 1, w: 2, d: len, kind: 'bridge' });
}

// ---- walls, towers, gates ----
function gemTower(site, x, z, r, h, base = H) {
  const g = new THREE.Group();
  g.add(cyl(r * 1.2, r * 1.32, 10, foot, 0, -3, 0, 16), cyl(r, r, h, stone, 0, h / 2, 0, 16));
  for (const y of [h * 0.3, h * 0.6, h * 0.86]) g.add(cyl(r * 1.04, r * 1.04, 0.4, coping, 0, y, 0, 16));
  for (let j = 0; j < 6; j++) {
    const a = j * (Math.PI / 3) + 0.3;
    for (const y of [h * 0.45, h * 0.74]) {
      const sl = box(0.32, 2.0, 0.2, dark, Math.sin(a) * r * 0.99, y, Math.cos(a) * r * 0.99);
      sl.rotation.y = a;
      g.add(sl);
    }
  }
  g.add(cyl(r * 1.16, r * 0.98, 1.3, course, 0, h + 0.15, 0, 16), cyl(r * 1.16, r * 1.16, 1.0, stone, 0, h + 1.3, 0, 16));
  for (let j = 0; j < 12; j++) {
    const a = (j * Math.PI) / 6,
      m = box(1.0, 1.1, 0.66, stone, Math.sin(a) * r * 1.08, h + 2.35, Math.cos(a) * r * 1.08);
    m.rotation.y = a;
    g.add(m);
  }
  const ring = torus(1.32, 0.11, brass, 0, h + 4.6, 0, 6, 20);
  ring.rotation.x = Math.PI / 2;
  g.add(cyl(0.7, 1.05, 1.9, coping, 0, h + 2.6, 0, 8), sphere(1.25, gem, 0, h + 4.6, 0, 12, 8), ring);
  site.add(g, x, base, z);
  site.colCyl(x, z, r, base - 8, base + h + 1.8);
  site.platDisc(x, z, r * 1.05, base + h + 1.82, 0.4);
}
function coneTower(site, x, z, r, h, cap, roofM, base = H) {
  const g = new THREE.Group();
  g.add(cyl(r * 1.2, r * 1.32, 10, foot, 0, -3, 0, 16), cyl(r, r, h, stone, 0, h / 2, 0, 16));
  for (const y of [h * 0.28, h * 0.56, h * 0.82]) g.add(cyl(r * 1.04, r * 1.04, 0.36, coping, 0, y, 0, 16));
  for (let j = 0; j < 4; j++) {
    const a = j * (Math.PI / 2) + 0.4;
    for (const y of [h * 0.42, h * 0.68, h * 0.9]) {
      const wi = box(0.7, 1.5, 0.2, dark, Math.sin(a) * r * 0.99, y, Math.cos(a) * r * 0.99);
      wi.rotation.y = a;
      g.add(wi);
    }
  }
  g.add(cyl(r * 1.12, r * 0.98, 1.0, course, 0, h + 0.1, 0, 16), cyl(r * 1.22, r * 1.22, 0.34, roofM, 0, h + 0.7, 0, 16));
  g.add(cone(r * 1.24, cap, roofM, 0, h + 0.85 + cap / 2, 0, 16), cyl(0.07, 0.07, 2.0, brass, 0, h + 0.85 + cap + 0.8, 0, 5), sphere(0.3, brass, 0, h + cap + 1.05, 0, 7, 5));
  site.add(g, x, base, z);
  site.colCyl(x, z, r, base - 8, base + h + cap * 0.5);
}
function rampart(site, x0, z0, x1, z1, cx, cz) {
  const len = Math.hypot(x1 - x0, z1 - z0),
    x = (x0 + x1) / 2,
    z = (z0 + z1) / 2,
    yaw = Math.atan2(x1 - x0, z1 - z0),
    g = new THREE.Group(),
    lite = lowQ();
  const o = Math.cos(yaw) * (x - cx) - Math.sin(yaw) * (z - cz) > 0 ? 1 : -1;
  b(g, 0, (WH - 8) / 2, 0, 3.8, WH + 8, len + 0.3, stone);
  b(g, o * 0.8, -3, 0, 5.4, 10, len + 0.5, foot);
  b(g, o * 0.4, 2.3, 0, 4.6, 0.9, len + 0.4, course);
  for (const y of [WH * 0.34, WH * 0.66]) b(g, o * 0.05, y, 0, 4.02, 0.4, len + 0.2, coping);
  const bays = Math.max(1, Math.round(len / 9));
  for (let j = 0; j <= bays; j++) b(g, o * 2.06, WH * 0.46, (j * len) / bays - len / 2, 0.55, WH * 0.92, 1.6, course);
  if (!lite) {
    for (let y = 4.2; y < WH - 1.5; y += 1.8) b(g, o * 1.91, y, 0, 0.04, 0.07, len, course);
    const n = Math.floor(len / 1.5);
    for (let j = 0; j < n; j++) b(g, o * 2.06, WH - 0.8, ((j + 0.5) * len) / n - len / 2, 0.45, 0.6, 0.55, coping);
  }
  b(g, o * 1.65, WH + 0.55, 0, 0.62, 1.2, len + 0.2, stone);
  const teeth = Math.max(2, Math.floor(len / 2.6));
  for (let j = 0; j < teeth; j++) b(g, o * 1.65, WH + 1.65, ((j + 0.5) * len) / teeth - len / 2, 0.66, 1.0, 1.25, stone);
  b(g, 0, WH + 0.04, 0, 3.8, 0.1, len + 0.2, coping);
  b(g, -o * 1.72, WH + 0.42, 0, 0.36, 0.85, len, stone);
  site.add(g, x, H, z, yaw);
  site.colBox(x, z, 1.92, len / 2, yaw, H - 8, H + WH);
  site.platBox(x, z, 1.75, len / 2, yaw, H + WH + 0.1, 0.35);
}
/** Arched gate block in its own frame: x along the wall, z through it (passage), y up from the street. */
function archBlock(g, AW, AS, GD, GW, GH, m, keyM) {
  const pw = GW / 2 - AW;
  for (const s of [-1, 1]) b(g, s * (AW + pw / 2), (GH - 8) / 2, 0, pw, GH + 8, GD, m);
  const top = AS + AW + 0.6;
  b(g, 0, (top + GH) / 2, 0, AW * 2 + 0.02, GH - top, GD, m);
  const sh = new THREE.Shape();
  sh.moveTo(-AW, AS);
  sh.lineTo(-AW, top);
  sh.lineTo(AW, top);
  sh.lineTo(AW, AS);
  sh.absarc(0, AS, AW, 0, Math.PI, false);
  const vault = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: GD, bevelEnabled: false, curveSegments: 16 }), m);
  vault.position.z = -GD / 2;
  g.add(vault);
  const vs = AW * 0.2;
  for (const e of [-1, 1]) {
    for (let i = 0; i < 17; i++) {
      const a = ((i + 0.5) * Math.PI) / 17,
        vb = box(vs * 1.05, i === 8 ? vs * 1.3 : vs, 0.45, i === 8 ? keyM : i % 2 ? coping : course, Math.cos(a) * (AW + vs / 2), AS + Math.sin(a) * (AW + vs / 2), e * (GD / 2 + 0.14));
      vb.rotation.z = a - Math.PI / 2;
      g.add(vb);
    }
    for (const s of [-1, 1]) b(g, s * (AW + 0.45), AS - 0.3, e * (GD / 2 + 0.12), 1.1, 0.6, 0.4, coping);
  }
}
function gemMedallion(parent, x, y, z, r, back = false) {
  const g = new THREE.Group();
  if (back) g.rotation.y = Math.PI;
  parent.add(g);
  if (back) z = -z;
  const outer = torus(r, r * 0.15, brass, x, y, z, 8, 32),
    inner = torus(r * 0.55, r * 0.07, coping, x, y, z + 0.05, 6, 24);
  g.add(outer, inner, sphere(r * 0.38, gem, x, y, z + 0.12, 14, 10));
  b(g, x, y, z - 0.18, r * 2.1, r * 2.1, 0.3, coping);
  for (let i = 0; i < 8; i++) {
    const sp = box(r * 0.48, r * 0.07, 0.1, brass, x + Math.cos((i * Math.PI) / 4) * r * 0.78, y + Math.sin((i * Math.PI) / 4) * r * 0.78, z + 0.03);
    sp.rotation.z = (i * Math.PI) / 4;
    g.add(sp);
  }
}
function banner(g, x, yTop, z, w, h, m) {
  b(g, x, yTop + 0.1, z - 0.02, w + 0.5, 0.16, 0.16, iron);
  const geo = new THREE.PlaneGeometry(w, h, 1, 8);
  const cm = clothify(m, 0.22);
  if (cm.side !== THREE.DoubleSide) cm.side = THREE.DoubleSide;
  const p = new THREE.Mesh(geo, cm);
  p.position.set(x, yTop - h / 2, z + 0.06);
  g.add(p);
  g.add(sphere(w * 0.2, gem, x, yTop - h * 0.4, z + 0.14, 10, 7));
}
/** The great gate's twin towers: a crenellated crown ringed with gems, a drum and a golden spire tipped by a gem. */
function gateTower(site, x, z, r, h, capM) {
  const g = new THREE.Group();
  g.add(cyl(r * 1.18, r * 1.3, 12, foot, 0, -2, 0, 20), cyl(r, r * 1.03, h, stone, 0, h / 2, 0, 20));
  for (let y = 10; y < h - 2; y += 11) g.add(cyl(r * 1.04, r * 1.04, 0.45, coping, 0, y, 0, 20));
  for (let j = 0; j < 5; j++) {
    const a = j * ((Math.PI * 2) / 5) + 0.3;
    for (let y = 14; y < h - 4; y += 11) {
      const wi = box(0.9, 2.4, 0.24, dark, Math.sin(a) * r * 0.995, y, Math.cos(a) * r * 0.995);
      wi.rotation.y = a;
      g.add(wi);
    }
  }
  g.add(cyl(r * 1.18, r * 0.99, 1.8, course, 0, h + 0.3, 0, 20), cyl(r * 1.18, r * 1.18, 1.2, stone, 0, h + 1.8, 0, 20));
  for (let j = 0; j < 16; j++) {
    const a = (j * Math.PI) / 8,
      m = box(1.4, 1.4, 0.8, stone, Math.sin(a) * r * 1.1, h + 3.1, Math.cos(a) * r * 1.1);
    m.rotation.y = a;
    g.add(m);
    if (j % 2 === 0) g.add(sphere(0.55, gem, Math.sin(a) * r * 1.1, h + 4.4, Math.cos(a) * r * 1.1, 8, 6));
  }
  const dr = r * 0.62;
  g.add(cyl(dr, dr, 9, stone, 0, h + 6.5, 0, 16), cyl(dr * 1.12, dr * 1.12, 0.5, coping, 0, h + 11.1, 0, 16));
  for (let j = 0; j < 6; j++) {
    const a = (j * Math.PI) / 3,
      wi = box(0.7, 2.6, 0.2, dark, Math.sin(a) * dr * 0.995, h + 7, Math.cos(a) * dr * 0.995);
    wi.rotation.y = a;
    g.add(wi);
  }
  g.add(cone(dr * 1.18, 17, capM, 0, h + 11.35 + 8.5, 0, 16), sphere(1.5, gem, 0, h + 29.6, 0, 14, 10));
  const ring = torus(1.7, 0.14, brass, 0, h + 29.6, 0, 6, 24);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  site.add(g, x, H, z);
  site.colCyl(x, z, r, H - 8, H + h + 2.4);
  site.platDisc(x, z, r * 1.1, H + h + 2.42, 0.5);
}
export const GATE_TOWER_X = 22;
/** The great gate: a 13 m wide, 22.5 m high, 16 m deep arch in a 46 m gatehouse between two 92 m towers. */
function mainGate(site) {
  const g = new THREE.Group(),
    AW = 6.5,
    AS = 16,
    GD = 16,
    GW = 34,
    GH = 46,
    pw = GW / 2 - AW;
  archBlock(g, AW, AS, GD, GW, GH, stone, coping);
  b(g, 0, -0.02, 0, AW * 2, 0.12, GD, mat.stone(0xb5a38d));
  for (const e of [-1, 1]) {
    for (const y of [7, 14]) for (const s of [-1, 1]) b(g, s * (AW + pw / 2), y, e * (GD / 2 + 0.08), pw + 0.1, 0.45, 0.3, course);
    for (const y of [26, 36]) b(g, 0, y, e * (GD / 2 + 0.08), GW + 0.1, 0.45, 0.3, course);
    for (let i = 0; i < 22; i++) b(g, -GW / 2 + (i + 0.5) * (GW / 22), GH - 0.8, e * (GD / 2 + 0.3), 0.7, 0.9, 0.6, coping);
    b(g, 0, GH + 0.7, e * (GD / 2 + 0.25), GW + 0.8, 1.4, 0.7, stone);
    for (let i = 0; i < 13; i++) b(g, -GW / 2 + 0.7 + (i * (GW - 1.4)) / 12, GH + 2.0, e * (GD / 2 + 0.25), 1.3, 1.2, 0.72, stone);
    // tall lancets in the gatehouse face above the arch
    for (const s of [-1, 0, 1]) {
      if (!s) continue;
      const wi = box(1.4, 6, 0.2, dark, s * 9.5, 36, e * (GD / 2 + 0.05));
      g.add(wi);
    }
  }
  gemMedallion(g, 0, AS + AW + 9, GD / 2 + 0.4, 4.6);
  gemMedallion(g, 0, AS + AW + 8, -GD / 2 - 0.4, 3.0, true);
  for (const s of [-1, 1])
    for (const e of [-1, 1]) {
      const px = s * (GW / 2 - 1.2),
        pz = e * (GD / 2 - 1.2);
      g.add(cyl(1.2, 1.35, 4.5, stone, px, GH + 2.25, pz, 10), cyl(1.45, 1.45, 0.35, coping, px, GH + 4.6, pz, 10));
      g.add(cone(1.5, 3.6, ROOF.gold, px, GH + 6.6, pz, 10), sphere(0.6, gem, px, GH + 8.8, pz, 10, 7));
    }
  for (const s of [-1, 1]) {
    banner(g, s * 11.8, GH - 3, GD / 2 + 0.05, 2.6, 13, bannerCloth);
    for (const k of [-1, 0, 1]) {
      const lx = s * (AW - 0.1),
        lz = k * 5;
      g.add(beam(lx, 5.2, lz, lx - s * 0.55, 5.2, lz, 0.08, 0.08, iron));
      g.add(sphere(0.2, warm, lx - s * 0.55, 4.95, lz, 7, 5), cone(0.25, 0.25, iron, lx - s * 0.55, 5.25, lz, 6));
    }
  }
  site.add(g, 0, H, 61);
  for (const s of [-1, 1]) site.colBox(s * (AW + pw / 2), 61, pw / 2, GD / 2, 0, H - 8, H + GH);
  site.colBox(0, 61, AW, GD / 2, 0, H + AS + AW - 0.4, H + GH);
  for (const s of [-1, 1]) site.colBox(s * (AW - 1.2), 61, 1.2, GD / 2, 0, H + AS + 3.6, H + GH);
  site.platBox(0, 61, GW / 2, GD / 2, 0, H + GH + 0.1, 0.4);
  for (const s of [-1, 1]) gateTower(site, s * GATE_TOWER_X, 61.6, 7.4, 62, s < 0 ? ROOF.gold : ROOF.orange);
}
export function cityWalls(site) {
  let cx = 0,
    cz = 0;
  for (const [x, z] of BELL_WALL) {
    cx += x / BELL_WALL.length;
    cz += z / BELL_WALL.length;
  }
  const pts = [[GATE_TOWER_X, 61.6], ...BELL_WALL.slice(2), [-GATE_TOWER_X, 61.6]];
  for (let i = 1; i < pts.length; i++) rampart(site, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], cx, cz);
  for (const t of ringTowerSpecs()) {
    if (t.kind === 'gem') gemTower(site, t.x, t.z, t.r, t.h);
    else coneTower(site, t.x, t.z, t.r, t.h, t.cap, [ROOF.gold, ROOF.orange, ROOF.red, ROOF.gold][Math.abs(Math.round(t.x + t.z)) % 4]);
  }
  mainGate(site);
}
/** The raised core: a retaining ring with towers, the grand stair from the gate street, and the core gate. */
export function coreWorks(site) {
  const R = CORE.r + 2.6,
    top = CORE.h + 1.3,
    N = 44,
    lite = lowQ();
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2,
      mx = CORE.x + Math.sin(a) * R,
      mz = CORE.z + Math.cos(a) * R;
    if (Math.abs(mx - CORE.x) < 7 && mz > CORE.z) continue;
    const L = 2 * R * Math.sin(Math.PI / N) + 0.5,
      g = new THREE.Group(),
      hgt = top - (H - 4);
    b(g, 0, hgt / 2 - 4, 0, L, hgt, 3.2, stone);
    b(g, 0, -1.5, 0.6, L + 0.3, 5, 4.4, foot);
    for (const y of [5, 11]) b(g, 0, y, 0.05, L + 0.05, 0.4, 3.32, coping);
    b(g, 0, hgt - 4 + 0.45, 1.3, L, 0.9, 0.6, stone);
    if (!lite) b(g, 0, hgt - 4 + 1.4, 1.3, L * 0.55, 1.0, 0.62, stone);
    site.add(g, mx, H, mz, a);
    site.colBox(mx, mz, L / 2, 1.6, a, H - 4, top - 0.05);
    site.platBox(mx, mz, L / 2, 1.55, a, top, 0.3);
  }
  for (const deg of [40, 90, 140, 180, 220, 270, 320]) {
    const a = (deg * Math.PI) / 180;
    coneTower(site, CORE.x + Math.sin(a) * (R + 1), CORE.z + Math.cos(a) * (R + 1), 5.2, CORE.h - H + 20, 13, ROOF.gold);
  }
  // grand stair: from the market street (z -36) up to the core gate (z -72), 16 m
  const g = new THREE.Group(),
    z0 = -36,
    z1 = CORE.z + R - 1.2,
    n = 52,
    run = (z0 - z1) / n,
    rise = (CORE.h - H) / n,
    sw = 8;
  for (let i = 0; i < n; i++) {
    const y = (i + 1) * rise,
      z = z0 - (i + 0.5) * run;
    b(g, 0, y / 2, z, sw, y, run + 0.03, i % 6 === 0 ? coping : sill);
    site.platBox(0, z, sw / 2, run / 2 + 0.01, 0, H + y, 0.3);
    if (i % 4 === 0) for (const s of [-1, 1]) b(g, s * (sw / 2 + 0.25), y + 0.55, z, 0.5, 1.1 + 0.5, run * 4, coping);
  }
  for (const s of [-1, 1]) {
    site.colBox(s * (sw / 2 + 0.25), (z0 + z1) / 2, 0.3, (z0 - z1) / 2, 0, H, H + 1.2);
    // pedestals with gems at the foot
    g.add(cyl(0.9, 1.1, 3.2, coping, s * (sw / 2 + 1.4), 1.6, z0 + 1.0, 10), sphere(0.7, gem, s * (sw / 2 + 1.4), 4.0, z0 + 1.0, 10, 7));
    site.colCyl(s * (sw / 2 + 1.4), z0 + 1.0, 1.0, H, H + 3.3);
  }
  b(g, 0, (CORE.h - H) / 2, z1 - 1.3, sw, CORE.h - H, 2.6, sill);
  site.platBox(0, z1 - 1.3, sw / 2, 1.3, 0, CORE.h, 0.4);
  site.add(g, 0, H, 0);
  // the core gate over the stair head
  const cg = new THREE.Group();
  archBlock(cg, 4.2, 5.2, 5, 16, 14, stone, coping);
  for (const e of [-1, 1]) for (let i = 0; i < 7; i++) b(cg, -7 + i * (14 / 6), 14.6, e * 2.6, 1.0, 1.1, 0.6, stone);
  gemMedallion(cg, 0, 11.6, 2.75, 1.6);
  site.add(cg, CORE.x, CORE.h, CORE.z + R);
  for (const s of [-1, 1]) site.colBox(CORE.x + s * 6.1, CORE.z + R, 1.9, 2.5, 0, CORE.h - 8, CORE.h + 14);
  site.colBox(CORE.x, CORE.z + R, 4.2, 2.5, 0, CORE.h + 9.2, CORE.h + 14);
}

/** Big pale rocks heaped at the foot of the walls, outside (the still shows the walls rising out of rubble). */
export function wallRocks(site) {
  const rand = mulberry32(5150),
    geos = [];
  for (let v = 0; v < 5; v++) {
    const geo = new THREE.IcosahedronGeometry(1, 0),
      p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.75 + 0.45 * Math.abs(Math.sin(i * 12.9898 + v * 78.233) * 43758.5453 % 1);
      p.setXYZ(i, p.getX(i) * k * 1.15, p.getY(i) * k * 0.78, p.getZ(i) * k);
    }
    geo.computeVertexNormals();
    geos.push(geo);
  }
  const mats = [0xb9b1a0, 0xa69e8d, 0xc8c1b1, 0x9c9a8c].map((c) => mat.rock(c));
  let n = 0;
  const lite = lowQ();
  for (let i = 0; i < BELL_WALL.length; i++) {
    const [ax, az] = BELL_WALL[i],
      [bx, bz] = BELL_WALL[(i + 1) % BELL_WALL.length];
    const L = Math.hypot(bx - ax, bz - az),
      dx = (bx - ax) / L,
      dz = (bz - az) / L;
    let nx = dz,
      nz = -dx;
    const mx = (ax + bx) / 2,
      mz = (az + bz) / 2;
    if (nx * mx + nz * (mz + 15) < 0) {
      nx = -nx;
      nz = -nz;
    }
    for (let t = 1.5; t < L; t += lite ? 6.5 : 3.4) {
      const off = 3.2 + rand() * 7.5,
        x = ax + dx * t + nx * off,
        z = az + dz * t + nz * off;
      if (Math.abs(x) < 34 && z > 40) continue;
      if (Math.hypot(x + 42, z - 115) < 38) continue;
      if (roadAt(x, z) < 4) continue;
      const r = 0.9 + rand() * rand() * 3.2,
        gy = G.world.heightAt(BELL.x + x, BELL.z + z);
      const m = new THREE.Mesh(geos[n % 5], mats[n % 4]);
      m.scale.set(r * (0.8 + rand() * 0.5), r * (0.7 + rand() * 0.4), r * (0.8 + rand() * 0.5));
      m.rotation.set(rand() * 0.4, rand() * 6.28, rand() * 0.4);
      site.add(m, x, gy - r * 0.25, z, m.rotation.y);
      if (r > 1.6) site.colCyl(x, z, r * 0.8, gy - 1, gy + r * 0.7);
      n++;
    }
  }
  return n;
}

// ---- landmarks ----
let _rose = null,
  _clock = null;
function roseTex() {
  if (_rose) return _rose;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#26324a';
  x.fillRect(0, 0, 256, 256);
  const cols = ['#4a7fe0', '#d8504e', '#f0c04e', '#46c2b2', '#9a62d6', '#ea8a44', '#6fa8ff'];
  for (let ring = 0; ring < 4; ring++) {
    const r0 = 22 + ring * 26,
      r1 = r0 + 24,
      n = 8 * (ring + 1);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2,
        a1 = ((i + 1) / n) * Math.PI * 2;
      x.beginPath();
      x.arc(128, 128, r1, a0, a1);
      x.arc(128, 128, r0, a1, a0, true);
      x.closePath();
      x.fillStyle = cols[(i * 3 + ring * 2) % cols.length];
      x.fill();
      x.strokeStyle = '#1d2026';
      x.lineWidth = 3;
      x.stroke();
    }
  }
  x.beginPath();
  x.arc(128, 128, 20, 0, Math.PI * 2);
  x.fillStyle = '#f6d36a';
  x.fill();
  _rose = new THREE.CanvasTexture(c);
  _rose.colorSpace = THREE.SRGBColorSpace;
  return _rose;
}
function clockTex() {
  if (_clock) return _clock;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#5d6b78';
  x.fillRect(0, 0, 128, 128);
  x.beginPath();
  x.arc(64, 64, 60, 0, Math.PI * 2);
  x.fillStyle = '#f1e8d2';
  x.fill();
  x.lineWidth = 4;
  x.strokeStyle = '#3b2f28';
  x.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    x.lineWidth = i % 3 ? 3 : 6;
    x.beginPath();
    x.moveTo(64 + Math.sin(a) * 44, 64 - Math.cos(a) * 44);
    x.lineTo(64 + Math.sin(a) * 54, 64 - Math.cos(a) * 54);
    x.stroke();
  }
  x.lineCap = 'round';
  for (const [a, l, w] of [[-1.05, 30, 6], [0.95, 44, 4]]) {
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(64, 64);
    x.lineTo(64 + Math.sin(a) * l, 64 - Math.cos(a) * l);
    x.stroke();
  }
  _clock = new THREE.CanvasTexture(c);
  _clock.colorSpace = THREE.SRGBColorSpace;
  return _clock;
}
function pointedArch(g, x, y, z, w, h, m, depth = 0.18) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h * 0.62);
  s.quadraticCurveTo(w * 0.46, h * 0.88, 0, h);
  s.quadraticCurveTo(-w * 0.46, h * 0.88, -w / 2, h * 0.62);
  s.closePath();
  const o = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 5 }), m);
  o.position.set(x, y, z);
  g.add(o);
  return o;
}
/** The cathedral north of the market square; its portal closes the gate street. */
export function cathedral(site, X = CORE.x, Z = CORE.z - 10, base = CORE.h) {
  const H = base;
  const g = new THREE.Group(),
    wallM = mat.plaster(0xefe8da),
    stoneM = mat.stone(0xdad0bd),
    roofM = ROOF.gold,
    lancet = mat.paint(0x35507a);
  const NW = 14,
    NL = 26,
    NH = 21;
  b(g, 0, 0.25, 0, 30, 0.5, 31, foot);
  b(g, 0, 0.6, 0, 28.6, 0.2, 29.6, coping);
  b(g, 0, NH / 2, 0, NW, NH, NL, wallM);
  gableRoof(g, NW, NL, NH, 10, roofM, wallM, false, 0.6);
  for (const s of [-1, 1]) {
    b(g, s * 10, 6.3, 0, 6, 12.6, NL - 1, wallM);
    const lean = b(g, s * 10.2, 14.05, 0, 7.2, 0.28, NL - 0.4, roofM);
    lean.rotation.z = -s * 0.42;
    for (let k = -2; k <= 2; k++) {
      const kz = k * 5.4;
      b(g, s * 13.4, 7, kz, 1.0, 14, 1.4, stoneM);
      g.add(cone(0.55, 2.8, roofM, s * 13.4, 15.4, kz, 4));
      g.add(beam(s * 13.3, 12.6, kz, s * 7.1, 18.4, kz, 0.45, 0.6, stoneM));
      if (k > 1) continue;
      // aisle and clerestory lancets between the buttresses
      const side = face(g, (s * Math.PI) / 2, 13.02);
      pointedArch(side, -s * (kz + 2.7), 3.2, 0, 1.6, 6.2, lancet, 0.06);
      const clere = face(g, (s * Math.PI) / 2, NW / 2 + 0.02);
      pointedArch(clere, -s * (kz + 2.7), 15.6, 0, 1.4, 4.4, lancet, 0.06);
    }
  }
  // twin west-work towers with octagonal spires
  for (const s of [-1, 1]) {
    const tx = s * 10.6,
      tz = 11.6;
    b(g, tx, 17, tz, 7.2, 34, 7.2, stoneM);
    for (const cxs of [-1, 1]) for (const czs of [-1, 1]) b(g, tx + cxs * 3.5, 17, tz + czs * 3.5, 0.9, 34, 0.9, wallM);
    for (const y of [12, 23.5]) b(g, tx, y, tz, 7.6, 0.4, 7.6, coping);
    const front = face(g, 0, 0);
    pointedArch(front, tx, 25.2, tz + 3.62, 2.2, 6.4, dark, 0.06);
    pointedArch(front, tx, 14.2, tz + 3.62, 1.6, 6.0, lancet, 0.06);
    const outer = face(g, (s * Math.PI) / 2, 0);
    pointedArch(outer, -s * tz, 25.2, s * tx + 3.62, 2.2, 6.4, dark, 0.06);
    b(g, tx, 34.4, tz, 7.8, 0.6, 7.8, coping);
    g.add(cyl(3.1, 3.5, 2.2, stoneM, tx, 35.8, tz, 8), cone(3.35, 22, roofM, tx, 36.9 + 11, tz, 8));
    g.add(cyl(0.07, 0.07, 2.2, brass, tx, 59.2, tz, 5), sphere(0.32, brass, tx, 58.4, tz, 8, 6));
    for (const cxs of [-1, 1]) for (const czs of [-1, 1]) g.add(cone(0.6, 4.2, roofM, tx + cxs * 3.2, 36.8, tz + czs * 3.2, 4));
  }
  // facade: frontispiece, rose window, portal
  b(g, 0, 11, 13.6, NW, 22, 0.9, stoneM);
  prism(g, NW, 9.6, 0.9, stoneM, 0, 22, 13.6);
  const rose = new THREE.Mesh(new THREE.CircleGeometry(4.0, 40), (() => {
    const m = texGlow(roseTex(), 1.15);
    m.userData.farColor = 0x8aa4e6;
    return m;
  })());
  rose.position.set(0, 16.2, 14.16);
  g.add(rose, torus(4.25, 0.45, coping, 0, 16.2, 14.2, 8, 40), torus(1.6, 0.16, coping, 0, 16.2, 14.3, 6, 24));
  for (let i = 0; i < 12; i++) {
    const sp = box(2.4, 0.16, 0.14, coping, Math.cos((i * Math.PI) / 6) * 2.85, 16.2 + Math.sin((i * Math.PI) / 6) * 2.85, 14.3);
    sp.rotation.z = (i * Math.PI) / 6;
    g.add(sp);
  }
  pointedArch(g, 0, 0.7, 14.05, 6.2, 9.6, coping, 0.35);
  pointedArch(g, 0, 0.7, 14.42, 4.6, 8.2, stoneM, 0.12);
  pointedArch(g, 0, 0.7, 14.56, 3.4, 6.6, mat.wood(0x4b2f24), 0.08);
  for (const s of [-1, 1]) b(g, s * 0.85, 3.4, 14.68, 0.12, 5, 0.05, brass);
  // crossing drum and golden dome with a lantern spire
  const cz = -3.5;
  g.add(cyl(6.2, 6.4, 12, wallM, 0, NH + 6, cz, 16), cyl(6.6, 6.6, 0.5, coping, 0, NH + 12.2, cz, 16));
  for (let j = 0; j < 8; j++) {
    const wf = new THREE.Group();
    wf.rotation.y = (j * Math.PI) / 4;
    wf.position.z = cz;
    g.add(wf);
    pointedArch(wf, 0, NH + 2.5, 6.22, 1.6, 5.2, lancet, 0.06);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), roofM);
  dome.position.set(0, NH + 12.4, cz);
  g.add(dome);
  g.add(cyl(1.6, 1.7, 3.8, wallM, 0, NH + 20.6, cz, 10), cyl(1.95, 1.95, 0.3, coping, 0, NH + 22.6, cz, 10));
  g.add(cone(1.9, 10, roofM, 0, NH + 27.7, cz, 10), sphere(0.36, brass, 0, NH + 32.9, cz, 8, 6));
  // apse
  g.add(cyl(6.6, 6.6, NH - 2, wallM, 0, (NH - 2) / 2, -NL / 2, 16), cone(7.1, 6.5, roofM, 0, NH - 2 + 3.25, -NL / 2, 16));
  // the great church is the tallest mass of the town (ep. 2 aerial): everything above at 1.45 x
  const K = 1.45;
  g.scale.setScalar(K);
  site.add(g, X, H, Z);
  g.scale.setScalar(K);
  site.colBox(X, Z, 13.9 * K, 14.3 * K, 0, H, H + NH * K);
  site.colCyl(X, Z - (NL / 2) * K, 6.6 * K, H, H + (NH - 2) * K);
  for (const s of [-1, 1]) site.colBox(X + s * 10.6 * K, Z + 11.6 * K, 3.7 * K, 3.7 * K, 0, H, H + 36 * K);
  for (let i = -2; i <= 2; i++) site.platBox(X + ((NW * i) / 5) * K, Z, (NW / 10) * K, (NL / 2) * K, 0, H + (NH + 10 * (1 - Math.abs(i) / 2.5) + 0.2) * K, 0.4);
}
/** Brick clock tower with an open belfry and a slim red spire (the tall spires of the episode title card). */
export function clockTower(site, x, z) {
  const g = new THREE.Group(),
    s = 7.4,
    h = 38;
  b(g, 0, h / 2, 0, s, h, s, brick);
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) b(g, cx * (s / 2 - 0.1), h / 2, cz * (s / 2 - 0.1), 0.55, h, 0.55, coping);
  for (const y of [0.4, 9, 19, 27.6]) b(g, 0, y, 0, s + 0.35, 0.4, s + 0.35, coping);
  const cm = texMat(clockTex());
  cm.userData.farColor = 0xe8dfc8;
  for (let k = 0; k < 4; k++) {
    const f = face(g, (k * Math.PI) / 2, s / 2);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.25, 28), cm);
    disc.position.set(0, 31.4, 0.06);
    f.add(disc, torus(2.35, 0.17, brass, 0, 31.4, 0.1, 6, 28));
    pointedArch(f, 0, 13, 0.02, 1.2, 4.2, dark, 0.06);
    pointedArch(f, 0, 21, 0.02, 1.2, 4.2, dark, 0.06);
  }
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) b(g, cx * (s / 2 - 0.7), h + 3, cz * (s / 2 - 0.7), 1.4, 6, 1.4, brick);
  b(g, 0, h + 6.2, 0, s + 0.6, 0.5, s + 0.6, coping);
  g.add(cyl(0.9, 1.45, 1.9, brass, 0, h + 2.9, 0, 12), sphere(0.5, brass, 0, h + 3.9, 0, 8, 6));
  b(g, 0, h + 4.1, 0, 0.12, 0.12, s - 1.2, wood);
  const spire = new THREE.Group(),
    c = cone(1, 17, ROOF.red, 0, 0, 0, 4);
  c.rotation.y = Math.PI / 4;
  spire.add(c);
  spire.scale.set(s * 0.52, 1, s * 0.52);
  spire.position.y = h + 6.45 + 8.5;
  g.add(spire);
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) g.add(cone(0.55, 3.4, ROOF.red, cx * (s / 2 - 0.3), h + 8.1, cz * (s / 2 - 0.3), 4));
  g.add(cyl(0.06, 0.06, 2.4, brass, 0, h + 24.6, 0, 5), sphere(0.3, brass, 0, h + 23.9, 0, 8, 6));
  site.add(g, x, H, z);
  site.colBox(x, z, s / 2, s / 2, 0, H, H + h + 6.5);
}
/** Slim white tower with a balcony ring and a small cap (the pale towers on the far side of the town). */
export function whiteTower(site, x, z, r, h, roofM) {
  const g = new THREE.Group(),
    white = WALLS[1];
  g.add(cyl(r * 1.15, r * 1.2, 1.2, foot, 0, 0.6, 0, 12), cyl(r, r * 1.04, h, white, 0, h / 2, 0, 12));
  for (const y of [h * 0.33, h * 0.66]) g.add(cyl(r * 1.05, r * 1.05, 0.3, sill, 0, y, 0, 12));
  for (let j = 0; j < 4; j++) {
    const a = (j * Math.PI) / 2 + 0.5;
    for (const y of [h * 0.5, h * 0.82]) {
      const wi = box(0.45, 1.2, 0.15, glass, Math.sin(a) * r * 0.99, y, Math.cos(a) * r * 0.99);
      wi.rotation.y = a;
      g.add(wi);
    }
  }
  g.add(cyl(r * 1.45, r * 1.2, 0.5, sill, 0, h - 1.6, 0, 12), cyl(r * 1.45, r * 1.45, 0.7, white, 0, h - 1.0, 0, 12));
  g.add(cyl(r * 0.85, r * 0.9, 2.6, white, 0, h + 1.2, 0, 12), cone(r * 1.15, r * 2.4, roofM, 0, h + 2.5 + r * 1.2, 0, 12));
  g.add(sphere(0.2, brass, 0, h + 2.6 + r * 2.4, 0, 6, 4));
  site.add(g, x, H, z);
  site.colCyl(x, z, r * 1.05, H, H + h + 2);
}

// ---- house layout ----
const RESERVED = [
  [0, -54, 6.2, 20], // grand stair
  [0, -71.8, 8.5, 3.0], // stair head
  [22, -52, 5.2, 5.2], // clock tower
  [0, 55, 31, 12], // gate block, its towers and forecourt
  [-14, 39.5, 6.2, 7.6], // the crash roof and its balcony
  [41, 5, 9.2, 11.6], // the inn
  [-15, -6.8, 5.0, 4.7], // the jeweller and the lane to its door
  [15.8, 32, 2.0, 14.6], // lookout stair
  [21.7, 50.8, 8.5, 6.8], // lookout decks
  [CORE.x, CORE.z - 12, 24, 31] // the cathedral on the core (x 1.45)
];
export function reservedBoxes() {
  const out = RESERVED.map(([x, z, hw, hd]) => obb(x, z, 0, hw, hd));
  for (const sq of BELL_SQUARES) {
    const o = obb(sq.x, sq.z, 0, sq.r, sq.r);
    o.plaza = true;
    out.push(o);
  }
  out.push(obb(6, 5, 0, 3.2, 3.2));
  for (const t of ringTowerSpecs()) out.push(obb(t.x, t.z, 0, t.r * 1.35 + 0.8, t.r * 1.35 + 0.8));
  for (const s of [-1, 1]) out.push(obb(s * GATE_TOWER_X, 61.6, 0, 10, 10));
  return out;
}
const coreKeep = (x, z, r) => Math.hypot(x - CORE.x, z - CORE.z) < CORE.r + 8 + r;
/** Terraces of tall houses along every street (footbridges between some), darts in the blocks behind, and the
 *  grand houses on the core. Returns the house count. */
export async function layoutHouses(ctx, site, taken) {
  const rand = mulberry32(20201002),
    lite = lowQ(),
    life = CITY_LIFE;
  let n = 0,
    seed = 1;
  const why = (layoutHouses.why = { wall: 0, free: 0, road: 0, core: 0, ok: 0 });
  const inside = (o) => {
    for (const [i, j] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = i * o.hw,
        lz = j * o.hd;
      if (!insideWall(o.x + lx * o.c + lz * o.s, o.z - lx * o.s + lz * o.c, 2.6)) return false;
    }
    return true;
  };
  const place = (x, z, yaw, w, d, extra) => {
    const o = obb(x, z, yaw, w / 2, d / 2);
    if (!inside(o)) return !!why.wall++ && false;
    if (coreKeep(x, z, Math.max(w, d) / 2)) return !!why.core++ && false;
    if (!isFree(taken, o)) return !!why.free++ && false;
    if (!roadClear(o, extra.road)) return !!why.road++ && false;
    why.ok++;
    const nearWall = -bellEdge(x, z) < 18;
    let st = 4 + Math.floor(rand() * 4) + (Math.hypot(x, z + 80) < 120 ? 1 : 0) + (rand() < 0.14 ? 2 : 0);
    if (nearWall) st = Math.min(st, 5);
    if (lite) st = Math.min(st, 6);
    const cap = lowZone(x, z) ? 13.2 : 0;
    const top = townhouse(site, { x, z, yaw, w, d, st, seed: seed++, shop: extra.shop && rand() < 0.6, cap, life });
    taken.push(o);
    n++;
    return top;
  };
  for (const [ri, road] of BELL_ROADS.entries()) {
    for (let i = 1; i < road.length; i++) {
      const [ax, az] = road[i - 1],
        [bx, bz] = road[i];
      const L = Math.hypot(bx - ax, bz - az),
        dx = (bx - ax) / L,
        dz = (bz - az) / L;
      const rows = { '-1': [], 1: [] };
      for (const side of [-1, 1]) {
        const nx = dz * side,
          nz = -dx * side;
        let t = 2 + rand() * 2;
        while (t < L - 2) {
          const w = 4.6 + rand() * 2.3,
            u = t + w / 2;
          if (u > L - 1) break;
          let built = 0;
          for (const d of [10.5, 9, 7.4, 6]) {
            const off = 2.8 + 1.25 + d / 2;
            built = place(ax + dx * u + nx * off, az + dz * u + nz * off, Math.atan2(-nx, -nz), w, d, { road: 3.45, shop: ri < 3 || rand() < 0.3 });
            if (built) {
              rows[side].push({ u, top: built, w });
              break;
            }
          }
          t += built ? w + 0.2 : 1.6;
        }
      }
      // footbridges high over the side streets (never over the avenues or in the story's quarter)
      if (ri > 2 && !lite)
        for (const a of rows[1]) {
          const q = rows['-1'].find((bq) => Math.abs(bq.u - a.u) < 1.2);
          if (!q || rand() > 0.32) continue;
          const y = 12 + Math.floor(rand() * 3) * 3.15,
            mx = ax + dx * a.u,
            mz = az + dz * a.u;
          if (Math.min(a.top, q.top) < y + 4 || lowZone(mx, mz) || nearAnchor(mx, mz, 14)) continue;
          footbridge(site, mx, mz, Math.atan2(dz, -dx), 8.3, H + y, life);
        }
      await ctx.step('mages:terrace');
    }
  }
  // infill: darts thrown into the blocks behind the street fronts (an alley's width apart; courtyards stay for trees)
  const cand = [];
  for (let gz = -246; gz < 64; gz += 3) for (let gx = -230; gx < 236; gx += 3) cand.push([gx + rand() * 2.4, gz + rand() * 2.4]);
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  const limit = lite ? 340 : 720;
  for (let i = 0; i < cand.length && n < limit; i++) {
    const [x, z] = cand[i];
    if (bellEdge(x, z) > -4 || coreKeep(x, z, 2)) continue;
    for (let k = 0; k < 3; k++) {
      const w = 5 + rand() * 2.4,
        d = 6 + rand() * 3.2,
        yaw = Math.floor(rand() * 4) * (Math.PI / 2) + (rand() - 0.5) * 0.16;
      if (!isFree(taken, obb(x, z, yaw, w / 2 + 1.2, d / 2 + 1.2))) continue;
      if (place(x, z, yaw, w, d, { road: 3.9, shop: false })) break;
    }
    if ((i & 511) === 511) await ctx.step('mages:infill');
  }
  // grand houses on the core, round its rim (the cathedral and the parvis stay open)
  for (let k = 0; k < 64 && !lite; k++) {
    const a = rand() * Math.PI * 2,
      r = 44 + rand() * 24,
      x = CORE.x + Math.sin(a) * r,
      z = CORE.z + Math.cos(a) * r;
    if (Math.abs(x - CORE.x) < 28 && z > CORE.z - 48) continue;
    const w = 6.5 + rand() * 2.5,
      d = 8 + rand() * 3,
      yaw = Math.round((a + Math.PI) / (Math.PI / 2)) * (Math.PI / 2);
    const o = obb(x, z, yaw, w / 2, d / 2);
    if (!isFree(taken, obb(x, z, yaw, w / 2 + 1.5, d / 2 + 1.5))) continue;
    townhouse(site, { x, z, yaw, w, d, st: 3 + Math.floor(rand() * 4), seed: seed++, base: CORE.h, kind: ['side', 'cone', 'flat', 'gable'][k % 4], life });
    taken.push(o);
    n++;
  }
  await ctx.step('mages:core');
  startBays(ctx);
  return n;
}

// ---- street furniture ----
function lampPost(site, x, z) {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.26, 0.45, iron, 0, 0.22, 0, 8), cyl(0.07, 0.1, 3.4, iron, 0, 2.1, 0, 6), cyl(0.13, 0.13, 0.12, brass, 0, 1.2, 0, 8));
  g.add(cyl(0.17, 0.12, 0.2, brass, 0, 3.82, 0, 8), sphere(0.29, orb, 0, 4.16, 0, 10, 8), cone(0.2, 0.26, iron, 0, 4.55, 0, 8));
  const ring = torus(0.3, 0.025, brass, 0, 4.16, 0, 4, 14);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  site.add(g, x, H, z);
  site.colCyl(x, z, 0.18, H, H + 3.8);
}
function fountain(site, x, z) {
  const g = new THREE.Group(),
    water = mat.paint(0x77b4c4);
  g.add(cyl(3.6, 3.8, 0.85, stone, 0, 0.42, 0, 24), cyl(3.75, 3.75, 0.16, coping, 0, 0.9, 0, 24), cyl(3.25, 3.25, 0.1, water, 0, 0.74, 0, 24));
  g.add(cyl(0.55, 0.75, 2.6, coping, 0, 1.3, 0, 10), cyl(1.45, 0.55, 0.55, stone, 0, 2.7, 0, 14), cyl(1.3, 1.3, 0.08, water, 0, 2.95, 0, 14));
  g.add(cyl(0.22, 0.3, 1.0, coping, 0, 3.4, 0, 8), sphere(0.42, gem, 0, 4.2, 0, 12, 8));
  for (let j = 0; j < 4; j++) {
    const a = (j * Math.PI) / 2 + Math.PI / 4;
    g.add(sphere(0.3, coping, Math.sin(a) * 3.5, 1.15, Math.cos(a) * 3.5, 8, 6));
  }
  site.add(g, x, H, z);
  site.colCyl(x, z, 3.75, H, H + 0.95);
}
function well(site, x, z) {
  const g = new THREE.Group();
  g.add(cyl(1.05, 1.1, 0.95, stone, 0, 0.47, 0, 14), cyl(1.12, 1.12, 0.12, coping, 0, 1.0, 0, 14), cyl(0.85, 0.85, 0.05, dark, 0, 0.9, 0, 12));
  for (const s of [-1, 1]) b(g, s * 0.95, 1.6, 0, 0.14, 2.1, 0.14, wood);
  b(g, 0, 2.6, 0, 2.2, 0.12, 0.12, wood);
  const r1 = b(g, 0, 2.95, 0.42, 2.5, 0.08, 1.05, ROOF.terra);
  r1.rotation.x = -0.6;
  const r2 = b(g, 0, 2.95, -0.42, 2.5, 0.08, 1.05, ROOF.terra);
  r2.rotation.x = 0.6;
  g.add(cyl(0.22, 0.18, 0.3, wood, 0.25, 1.9, 0, 8));
  site.add(g, x, H, z);
  site.colCyl(x, z, 1.12, H, H + 1.1);
}
function stall(site, x, z, yaw, i) {
  const g = new THREE.Group(),
    awn = cloth[i % 4];
  b(g, 0, 0.9, 0, 2.8, 0.12, 1.3, wood);
  b(g, 0, 0.45, 0.6, 2.8, 0.9, 0.08, wood);
  for (const sx of [-1.3, 1.3]) for (const sz of [-0.6, 0.6]) b(g, sx, 1.2, sz, 0.1, 2.4, 0.1, trim);
  const a = b(g, 0, 2.5, 0.05, 3.1, 0.07, 1.8, awn);
  a.rotation.x = 0.22;
  for (let j = 0; j < 6; j++) {
    const fruit = [bloom[0], bloom[3], leaf, bloom[4]][(i + j) % 4];
    g.add(sphere(0.17, fruit, -1.0 + j * 0.4, 1.08, 0.1, 6, 4), sphere(0.15, fruit, -0.85 + j * 0.4, 1.06, -0.25, 6, 4));
  }
  g.add(cyl(0.3, 0.3, 0.7, wood, 1.75, 0.35, -0.3, 10), cyl(0.31, 0.31, 0.05, iron, 1.75, 0.5, -0.3, 10));
  b(g, -1.8, 0.3, 0.2, 0.6, 0.6, 0.6, trim);
  site.add(g, x, H, z, yaw);
  site.colBox(x, z, 1.5, 0.75, yaw, H, H + 1.2);
}
function planter(site, x, z, yaw, seed) {
  const g = new THREE.Group();
  b(g, 0, 0.35, 0, 2.2, 0.7, 0.8, coping);
  b(g, 0, 0.72, 0, 2.0, 0.08, 0.6, mat.paint(0x5a4836));
  for (let i = 0; i < 6; i++) g.add(sphere(0.24, i % 2 ? leaf : bloom[(seed + i) % 5], -0.8 + i * 0.32, 0.9, (i % 2) * 0.18 - 0.09, 6, 4));
  site.add(g, x, H, z, yaw);
  site.colBox(x, z, 1.1, 0.4, yaw, H, H + 0.75);
}
/** Lamps with blue magic orbs along the streets, the fountain square, wells, stalls and planters. */
export function streetProps(site, taken) {
  const lite = lowQ(),
    rand = mulberry32(777);
  let lamps = 0;
  taken = taken.filter((t) => !t.plaza);
  const ok = (x, z, r) => !nearAnchor(x, z) && isFree(taken, obb(x, z, 0, r, r)) && insideWall(x, z, 3);
  for (const road of BELL_ROADS) {
    let flip = 1;
    for (let i = 1; i < road.length; i++) {
      const [ax, az] = road[i - 1],
        [bx, bz] = road[i];
      const L = Math.hypot(bx - ax, bz - az),
        dx = (bx - ax) / L,
        dz = (bz - az) / L;
      for (let t = 6; t < L - 3; t += lite ? 26 : 13) {
        flip = -flip;
        const x = ax + dx * t + dz * flip * 3.35,
          z = az + dz * t - dx * flip * 3.35;
        if (!ok(x, z, 0.5) || roadAt(x, z) < 3.1) continue;
        lampPost(site, x, z);
        taken.push(obb(x, z, 0, 0.4, 0.4));
        lamps++;
      }
    }
  }
  for (const sq of BELL_SQUARES) if (sq.id === 'market' || sq.id === 'west' || sq.id === 'east') fountain(site, sq.x, sq.z);
  const pv = BELL_SQUARES.find((s) => s.id === 'parvis');
  if (pv) {
    const mg = new THREE.Group();
    mg.add(cyl(2.6, 3.0, 1.2, coping, 0, 0.6, 0, 16), cyl(1.1, 1.4, 6, stone, 0, 4.2, 0, 10), cyl(1.6, 1.6, 0.4, brass, 0, 7.3, 0, 12), sphere(1.2, gem, 0, 8.6, 0, 12, 9));
    site.add(mg, pv.x, CORE.h, pv.z);
    site.colCyl(pv.x, pv.z, 2.8, CORE.h, CORE.h + 7.5);
  }
  for (const [x, z] of [[-9.5, 0.5], [5.5, -2.5], [-14.5, 12.5], [6.5, 13.8]]) if (!nearAnchor(x, z, 3)) lampPost(site, x, z);
  let wells = 0;
  for (const [x, z] of [[-52, -30], [62, -28], [-82, -6], [72, 27], [-44, 40], [52, -55], [-70, -52], [86, -40], [-180, -80], [190, -60], [-120, -150], [120, -150], [170, -110], [-200, -20], [100, -10], [-110, -100]]) {
    if (!ok(x, z, 1.4) || roadAt(x, z) < 3.4) continue;
    well(site, x, z);
    taken.push(obb(x, z, 0, 1.3, 1.3));
    if (++wells >= 8) break;
  }
  let stalls = 0;
  for (const [x, z, yaw] of [[-12.5, 14, 0.4], [3.5, 15, -0.5], [-15.5, 3.5, 1.2], [5, -6.5, -1.9], [-30, 18, 0], [50, 19.5, Math.PI]]) {
    if (!ok(x, z, 1.6) || roadAt(x, z) < 3.0) continue;
    stall(site, x, z, yaw, stalls++);
    taken.push(obb(x, z, yaw, 1.6, 0.9));
  }
  if (!lite)
    for (let k = 0; k < 40; k++) {
      const road = BELL_ROADS[k % 3],
        i = 1 + Math.floor(rand() * (road.length - 1)),
        [ax, az] = road[i - 1],
        [bx, bz] = road[i];
      const L = Math.hypot(bx - ax, bz - az),
        t = 2 + rand() * Math.max(0, L - 4),
        dx = (bx - ax) / L,
        dz = (bz - az) / L,
        s = rand() < 0.5 ? -1 : 1;
      const x = ax + dx * t + dz * s * 3.6,
        z = az + dz * t - dx * s * 3.6;
      if (!ok(x, z, 1.2) || roadAt(x, z) < 3.2) continue;
      const yaw = Math.atan2(dx, dz) + Math.PI / 2;
      planter(site, x, z, yaw, k);
      taken.push(obb(x, z, yaw, 1.2, 0.5));
    }
  return { lamps, wells, stalls };
}
