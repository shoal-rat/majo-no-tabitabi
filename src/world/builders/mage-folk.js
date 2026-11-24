// Residents of the City of Magic at the gate and the market (art-figures round, 2026-11-24).
// They are drawn with the townsfolk and witch bodies of the city crowd (life/city-flyers-bake.js: the journey cast's
// VRoid bodies baked to instanced skinned meshes) instead of the first round's cylinder mannequins. The city's baked
// bodies are reused as they are (G.life.city.st.bodies: no second bake); the residents draw through their own small
// body pool. Each has a part to play: strollers walk their stretch of street and stop at its ends to look about, a
// market pair talks, an old witch watches the brooms; costumes are recoloured per resident (skirts, coats, robes, sashes,
// hair, witch hats on or off), and what they carry — a market basket, a straw hat, a flat cap — are sculpted props
// (tools/sculpt/assets/folk_*.mjs, G.sculpt type 'figures') that follow the hand or head of the baked clip on the CPU.
// Fallback (the first round's mannequins, built only when needed): ?sculpt=0 / a list without 'figures', or no city
// life (?nocity=1, a failed bake).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../../core/game.js';
import { box, cyl, cone, sphere } from '../../core/geo.js';
import { toon } from '../../core/mats.js';
import { mat, beam, M, sculptVcMat } from './kit.js';
import { sculptAsset } from './sculpt.js';
import { CITY } from '../../data/journey-map.js';
import { createBodyPool } from '../life/city-flyers-bake.js';
import { inKeepOut } from '../life/city-flyers-plan.js';

// ---------------------------------------------------------------------------------------------- the first round's mannequins
function painted(group) {
  const bits = [];
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (!o.isMesh) return;
    const b = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    b.applyMatrix4(o.matrixWorld);
    b.deleteAttribute('uv');
    const c = o.material.color,
      a = new Float32Array(b.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) {
      a[i] = c.r;
      a[i + 1] = c.g;
      a[i + 2] = c.b;
    }
    b.setAttribute('color', new THREE.BufferAttribute(a, 3));
    bits.push(b);
  });
  const g = mergeGeometries(bits);
  for (const b of bits) b.dispose();
  const m = M.plaster().clone();
  m.color.set(0xffffff);
  m.vertexColors = true;
  return new THREE.Mesh(g, m);
}
function person(seed) {
  const coat = mat.cloth([0x525d77, 0x827663, 0x646668, 0x7d5764, 0x52746b][seed % 5]),
    darker = mat.cloth([0x414758, 0x6a5053, 0x56616b][seed % 3]),
    leather = mat.wood(0x694b3d),
    hair = mat.paint([0x67472f, 0x4e403c, 0xa78058, 0x635560][seed % 4]),
    face = mat.plaster(0xe6bea0),
    brass = mat.metal(0xc09b59);
  const g = new THREE.Group();
  g.add(
    cyl(0.14, 0.225, 0.62, coat, 0, 0.915, 0, 9),
    cyl(0.17, 0.251, 0.32, darker, 0, 1.22, -0.025, 9),
    cyl(0.125, 0.13, 0.07, leather, 0, 1.03, 0.006, 8)
  );
  g.add(sphere(0.153, face, 0, 1.545, 0.034, 10, 8), sphere(0.162, hair, 0, 1.6, -0.014, 10, 7));
  for (const s of [-1, 1]) {
    const h = sphere(0.083, hair, s * 0.121, 1.46, -0.018, 8, 6);
    h.scale.set(0.67, 1.64, 0.7);
    g.add(h);
    g.add(
      beam(0.14 * s, 1.27, 0, 0.18 * s, 1.0, 0.045, 0.1, 0.115, coat),
      beam(0.18 * s, 1.0, 0.045, 0.2 * s, 0.9, 0.155, 0.085, 0.085, darker),
      sphere(0.046, face, 0.2 * s, 0.9, 0.155, 7, 5)
    );
  }
  const brim = cyl(0.28 + (seed % 3) * 0.035, 0.31, 0.046, coat, 0, 1.68, 0, 12);
  brim.rotation.z = (seed % 2 ? 1 : -1) * 0.1;
  g.add(brim, cyl(0.065, 0.165, 0.24, coat, 0, 1.806, 0, 10), cyl(0.151, 0.158, 0.056, leather, 0, 1.72, 0.004, 10));
  const tip = cone(0.074, 0.17, coat, -0.035, 1.98, -0.013, 8);
  tip.rotation.z = 0.43;
  g.add(tip);
  g.add(
    box(0.12, 0.17, 0.12, leather, 0.212, 0.91, -0.034),
    beam(-0.13, 1.32, 0.11, 0.17, 0.97, 0.12, 0.045, 0.037, leather),
    sphere(0.035, brass, 0.03, 1.3, 0.16, 6, 5)
  );
  if (seed % 3 === 0) {
    g.add(cyl(0.027, 0.035, 1.37, leather, 0.23, 0.81, 0.17, 7), sphere(0.08, brass, 0.23, 1.48, 0.17, 7, 5));
  }
  const whole = new THREE.Group(),
    body = painted(g);
  whole.add(body);
  const legs = [];
  for (const side of [-1, 1]) {
    const l = new THREE.Group();
    l.add(
      cyl(0.069, 0.06, 0.35, darker, 0, -0.18, 0, 8),
      cyl(0.071, 0.075, 0.29, leather, 0, -0.465, 0, 8),
      box(0.14, 0.1, 0.21, leather, 0, -0.592, 0.042)
    );
    const leg = painted(l);
    leg.position.set(side * 0.096, 0.64, 0);
    whole.add(leg);
    legs.push(leg);
  }
  return { whole, body, legs };
}
const OLD_ENTRIES = [
  [-8, 53, 0.1, 5.1],
  [4, 32, -0.6, 3.7],
  [10, 16, 2.0, 0],
  [-7, 12, 2.4, 0],
  [29, 19, -0.3, 3.7],
  [-24, -16, -2.5, 3.0],
  [12, -12, 0.2, 3.0],
  [-53, -15, -0.8, 3.2]
];
function oldResidents() {
  const center = new THREE.Vector3();
  const list = OLD_ENTRIES.map(([x, z, heading, range], i) => {
    const a = person(i);
    a.whole.name = 'MageResident_' + i;
    G.scene.add(a.whole);
    return { ...a, x: CITY.x + x, z: CITY.z + z, heading, range, i };
  });
  return {
    list,
    tick(time) {
      const p = G.player?.pos || G.camera.position;
      for (const a of list) {
        const { x, z, heading, range, i } = a,
          d = Math.hypot(x - p.x, z - p.z);
        a.whole.visible = d < 88;
        if (!a.whole.visible) continue;
        const f = Math.sin(time * 0.18 + i),
          walk = Math.cos(time * 0.18 + i),
          px = x + Math.sin(heading) * f * range,
          pz = z + Math.cos(heading) * f * range;
        center.set(px, CITY.y, pz);
        G.world.resolveCollisions(center, 0.3, 1.72);
        a.whole.position.copy(center);
        a.whole.rotation.y = range ? heading + (walk < 0 ? Math.PI : 0) : heading + 0.08 * Math.sin(time * 0.66 + i);
        const stride = range ? Math.sin(time * 3.8 + i) * 0.37 * Math.abs(walk) : 0;
        a.legs[0].rotation.x = stride;
        a.legs[1].rotation.x = -stride;
        a.body.position.y = 0.011 * Math.sin(time * 2.0 + i);
      }
    },
    hide() { for (const a of list) a.whole.visible = false; },
  };
}

// ---------------------------------------------------------------------------------------------- residents on the city bodies
// bodies (life/city-flyers.js BODIES): 0 apprentice witch, 1 travelling witch, 2 older witch, 3 townswoman, 4 townsman
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
// palette slots: [robe (skirt / coat / robe), hat, hair, trim (sash / ribbon)]
const LOOKS = {
  traveller: { body: 1, pal: ['#2f3f73', '#2a385f', '#7a5232', '#d6b35f'] },
  apprentice: { body: 0, pal: ['#23212b', '#23212b', '#4a3326', '#a33a35'] },
  elder: { body: 2, pal: ['#3b2a4f', '#33264a', '#e8e4dc', '#d8b866'] },
  marketA: { body: 3, pal: ['#a8553f', '#a8553f', '#7a5232', '#e8dfcc'] },
  marketB: { body: 3, pal: ['#5b6f8f', '#5b6f8f', '#2b2320', '#c9a24f'] },
  marketC: { body: 3, pal: ['#6f7f5a', '#6f7f5a', '#b88a52', '#f0ebe0'] },
  merchant: { body: 4, pal: ['#6b5a43', '#6b5a43', '#4a3326', '#9e3b35'] },
  townsman: { body: 4, pal: ['#2f3a52', '#2f3a52', '#55463c', '#e8dfcc'] },
  carter: { body: 4, pal: ['#3f4a3c', '#3f4a3c', '#8c3b2a', '#c9a24f'] },
};
// [x, z (from the city centre), heading, stretch (m, 0 = stands), look, role, props, hatless]
//   role: stroll (walks its stretch of street, pauses and looks about at the ends) | talk | listen | watch (looks up at
//   the brooms) | idle. On the street lines of the city plan, clear of the story zones (life/city-flyers-plan.js keepOut:
//   the crash roof, the shop and the inn); listed by importance: phones draw six, low seven, medium eight, high all ten.
const PAIR = [16, 17.3, 0];   // the merchant in front of his shop front (16, 16), a customer facing him
const FOLK = [
  [3, 19.5, Math.PI / 2, 4.5, 'marketA', 'stroll', 'basket,straw', 1],
  [PAIR[0], PAIR[1], PAIR[2], 0, 'merchant', 'talk', 'cap', 1],
  [PAIR[0] + Math.sin(PAIR[2]) * 1.25, PAIR[1] + Math.cos(PAIR[2]) * 1.25, PAIR[2] + Math.PI, 0, 'marketB', 'listen', 'basket', 1],
  [2, 62.5, 0, 2.2, 'traveller', 'stroll', '', 0],
  [4.5, 1.5, -Math.PI / 2, 0, 'elder', 'watch', '', 0],
  [20, -11.3, Math.PI / 2, 3.5, 'marketC', 'stroll', 'basket', 1],
  [-26, -6, 0.105, 3.5, 'townsman', 'stroll', 'cap', 1],
  [-40, -13, -1.62, 4, 'apprentice', 'stroll', '', 0],
  [-50, 18.2, 1.45, 4, 'carter', 'stroll', 'straw', 1],
  [11, -9.3, 0, 0, 'marketA', 'idle', 'straw', 1],
];
const FOLK_N = () => { const q = G.quality || {}; return q.mobile ? 6 : q.name === 'low' ? 7 : q.name === 'med' ? 8 : FOLK.length; };
const STAND_CLIP = { talk: 'talk', listen: 'listen', watch: 'lookup', idle: 'idle' };
const PROP_IDS = { basket: 'sculpt_folk_basket', straw: 'sculpt_folk_hat_straw', cap: 'sculpt_folk_cap' };
// hats: size against the head's half width (1 = the sculpt's 0.098 m crown), how far the crown sinks into the hair
const HAT_FIT = { straw: 1.0, cap: 1.0 }, HAT_SINK = { straw: 0.03, cap: 0.025 };

// where the head and the hands are in a baked body's bind pose: the bone that carries most of the vertices above the
// shoulders (head) and the outermost bone with real weight on each side (hand); the head's top over the hair (hats sit there)
const _loc = new WeakMap();
function locators(baked) {
  if (_loc.has(baked)) return _loc.get(baked);
  const g = baked.geos[0], P = g.attributes.position.array, BI = g.attributes.aBoneIdx.array, BW = g.attributes.aBoneW.array;
  const nB = baked.nBones, sx = new Float64Array(nB), sy = new Float64Array(nB), sz = new Float64Array(nB), n = new Uint32Array(nB);
  let ymax = 0;
  for (let v = 0; v < P.length / 3; v++) {
    let b = 0, w = 0;
    for (let k = 0; k < 4; k++) if (BW[v * 4 + k] > w) { w = BW[v * 4 + k]; b = BI[v * 4 + k]; }
    if (w < 0.6 || b >= nB - 1) continue;   // the last bone is the broom's
    sx[b] += P[v * 3]; sy[b] += P[v * 3 + 1]; sz[b] += P[v * 3 + 2]; n[b]++;
    ymax = Math.max(ymax, P[v * 3 + 1]);
  }
  let head = -1, hn = 0, hL = -1, hR = -1, xL = 0, xR = 0;
  for (let b = 0; b < nB; b++) {
    if (n[b] < 12) continue;
    const x = sx[b] / n[b], y = sy[b] / n[b];
    if (y > ymax * 0.82 && n[b] > hn) { hn = n[b]; head = b; }
    if (y > ymax * 0.45 && y < ymax * 0.95) { if (x > xL) { xL = x; hL = b; } if (x < xR) { xR = x; hR = b; } }
  }
  const c = (b) => (b < 0 ? [0, ymax * 0.6, 0] : [sx[b] / n[b], sy[b] / n[b], sz[b] / n[b]]);
  // top of the head (hair included) over the head bone's centre
  const hc = c(head);
  let top = hc[1];
  for (let v = 0; v < P.length / 3; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (y > top && Math.hypot(x - hc[0], z - hc[2]) < 0.1) top = y;
  }
  // half width of the head with its hair a little under the top (hats are scaled to it)
  let hw = 0.08;
  for (let v = 0; v < P.length / 3; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (y > top - 0.11 && y < top - 0.03 && Math.abs(z - hc[2]) < 0.16) hw = Math.max(hw, Math.abs(x - hc[0]));
  }
  // the bind pose may face -Z (the bake turns VRoid bodies round in the rows): the head's forward in bind space, from the
  // first idle frame's skin matrix (posed forward is +Z, so bind forward = the matrix's third row)
  let yaw = 0;
  const ci = baked.clips.idle, D = baked.tex.image?.data;
  if (head >= 0 && ci && D) { const o = (ci.row0 * nB * 3 + head * 3) * 4; yaw = Math.atan2(D[o + 8], D[o + 10]); }
  const L = { head, headAt: [hc[0], top, hc[2]], headW: hw, headYaw: yaw, hands: [hL, hR], handAt: [c(hL), c(hR)] };
  _loc.set(baked, L);
  return L;
}
/** the 3x4 skin matrix of `bone` for an agent's current (blended) frame, from the baked rows (CPU copy) -> out[12] */
function frameRow(info, t) {
  const f = ((t * info.fps) % info.frames + info.frames) % info.frames, i = Math.floor(f);
  return [info.row0 + i, info.row0 + ((i + 1) % info.frames), f - i];
}
function boneMat(baked, a, bone, out) {
  const C = baked.clips, cur = C[a.clip] || C.idle, D = baked.tex.image.data, w = baked.nBones * 3;
  let r0, r1, k;
  if (a.fade < 1 && a.prev && C[a.prev]) { r0 = frameRow(C[a.prev], a.prevT)[0]; r1 = frameRow(cur, a.clipT)[0]; k = a.fade; }
  else { const q = frameRow(cur, a.clipT); r0 = q[0]; r1 = q[1]; k = q[2]; }
  const o0 = (r0 * w + bone * 3) * 4, o1 = (r1 * w + bone * 3) * 4;
  for (let j = 0; j < 12; j++) out[j] = D[o0 + j] + (D[o1 + j] - D[o0 + j]) * k;
  return out;
}
const rowApply = (m, p, out) => {
  out[0] = m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3];
  out[1] = m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7];
  out[2] = m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11];
  return out;
};

/** One InstancedMesh per carried prop (the sculpt's middle LOD, vertex colours, its parts folded into one material lit
 *  like the crowd bodies: city-flyers-bake.js makeBodyMesh look). */
function propMesh(id, cap) {
  const A = sculptAsset(id);
  const pieces = A?.lods[1] || A?.lods[0];
  if (!pieces?.length) return null;
  const geos = pieces.map((p) => {
    const s = p.geo.index ? p.geo.toNonIndexed() : p.geo, g = new THREE.BufferGeometry();
    g.setAttribute('position', s.attributes.position); g.setAttribute('normal', s.attributes.normal);
    const c = s.attributes.color, col = new Float32Array(c.count * 3);
    for (let i = 0; i < c.count; i++) { col[i * 3] = c.getX(i); col[i * 3 + 1] = c.getY(i); col[i * 3 + 2] = c.getZ(i); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const geo = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
  geo.computeBoundingSphere();
  const m = new THREE.InstancedMesh(geo, sculptVcMat(toon(0xffffff, { surface: 'none', look: { rim: 0.5, wrap: 0.5, shadowTint: 0.8 } })), cap);
  m.name = 'folk-prop:' + id; m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.userData.anchors = A.anchors; m.userData.cap = cap;
  return m;
}

export function mageResidents(ctx) {
  const on = !!G.sculpt?.on?.('figures');
  let old = null, live = null, failed = false;
  const tier = G.quality?.mobile ? 0.3 : G.quality?.name === 'low' ? 0.3 : G.quality?.name === 'med' ? 0.65 : 1;
  const root = new THREE.Group(); root.name = 'MageResidents'; G.scene.add(root);
  const pos = new THREE.Vector3(), cam = new THREE.Vector3(), _m = new Array(12).fill(0), _p = [0, 0, 0], _q = [0, 0, 0];
  const _o = new THREE.Object3D(), _mw = new THREE.Matrix4(), _mr = new THREE.Matrix4();
  const groundY = (x, z, y) => G.world.groundAt(x, z, (y ?? G.world.heightAt(x, z)) + 0.6);
  // the agents (body pool fields: body, x y z, yaw, scale, s, clip / clipT, prev / prevT / fade, pal, flags, seed)
  const folk = FOLK.slice(0, FOLK_N()).map(([dx, dz, heading, range, look, role, props, hatless], i) => {
    const L = LOOKS[look];
    const x = CITY.x + dx, z = CITY.z + dz;
    return {
      i, role, range, heading, hx: Math.sin(heading), hz: Math.cos(heading), cx: x, cz: z, body: L.body, look,
      pal: L.pal.map(lin), flags: hatless ? 1 : 0, scale: 0.97 + ((i * 37) % 7) * 0.012, seed: (i * 0.618) % 1, flutter: 0,
      props: props ? props.split(',') : [], x, y: CITY.y, z, yaw: heading, pitch: 0, bank: 0, s: 0, sT: 1,
      clip: STAND_CLIP[role] || 'idle', clipT: i * 1.7, prev: null, prevT: 0, fade: 1,
      u: ((i * 0.37) % 1) * 2 - 1, dir: i % 2 ? 1 : -1, mode: role === 'stroll' ? 'walk' : 'stand', t: 0, turn: 0, yawT: heading,
      speed: look === 'elder' ? 0.62 : look === 'carter' ? 0.9 : 0.82, dist: 1e9,
    };
  });
  const setClip = (a, c) => { if (a.clip === c) return; a.prev = a.clip; a.prevT = a.clipT; a.clip = c; a.clipT = 0; a.fade = 0; };

  function start() {
    const st = G.life?.city?.st;
    const bodies = st?.bodies;
    if (!bodies) return false;
    const pool = createBodyPool(root, bodies, tier);
    const props = {};
    for (const a of folk) for (const k of a.props) if (!props[k] && PROP_IDS[k]) props[k] = propMesh(PROP_IDS[k], 4);
    for (const k in props) if (props[k]) root.add(props[k]); else delete props[k];
    // drop the props whose sculpt is missing; hats only on bodies without a witch hat
    for (const a of folk) a.props = a.props.filter((k) => props[k]);
    for (const a of folk) { a.y = groundY(a.x, a.z, CITY.y); a.yaw = a.heading; }
    live = { st, bodies, pool, props };
    return true;
  }

  function step(a, dt) {
    const C = live.bodies[a.body]?.clips;
    if (a.role === 'stroll') {
      if (a.mode === 'walk') {
        a.u += (a.dir * a.speed * dt) / Math.max(0.5, a.range);
        if (a.u > 1 || a.u < -1) { a.u = Math.max(-1, Math.min(1, a.u)); a.mode = 'pause'; a.t = 2.5 + ((a.i * 1.3 + a.clipT) % 3.5); setClip(a, a.i % 3 === 1 ? 'lookup' : 'idle'); }
        else setClip(a, a.props.includes('basket') && a.look !== 'traveller' ? 'carry' : 'walk');
        a.yawT = a.heading + (a.dir < 0 ? Math.PI : 0);
      } else {
        a.t -= dt;
        if (a.t <= 0) { a.dir = -a.dir; a.mode = 'walk'; }
      }
      a.x = a.cx + a.hx * a.u * a.range; a.z = a.cz + a.hz * a.u * a.range;
      pos.set(a.x, a.y, a.z);
      G.world.resolveCollisions(pos, 0.3, 1.72);
      a.x = pos.x; a.z = pos.z;
      a.y += (groundY(a.x, a.z, a.y) - a.y) * Math.min(1, dt * 8);
    } else {
      // standing: small weight shifts of the heading
      a.yawT = a.heading + 0.08 * Math.sin(a.clipT * 0.4 + a.i);
    }
    let d = a.yawT - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    a.yaw += d * Math.min(1, dt * (a.mode === 'walk' ? 4 : 2.5));
    const rate = a.clip === 'walk' ? a.speed / 0.83 : a.clip === 'carry' ? a.speed / 0.8 : 1;
    a.clipT += dt * rate; a.prevT += dt;
    if (a.fade < 1) a.fade = Math.min(1, a.fade + dt * 3);
    if (!C?.[a.clip]) a.clip = 'idle';
  }

  function placeProps(a, b, near) {
    const L = locators(b);
    _o.position.set(a.x, a.y, a.z); _o.rotation.set(0, a.yaw, 0); _o.scale.setScalar(a.scale * a.s); _o.updateMatrix();
    _mw.copy(_o.matrix);
    for (const k of a.props) {
      const m = live.props[k];
      if (!m || m.count >= m.userData.cap) continue;
      if (k === 'basket') {
        // hangs upright from the hand (the right one; both hands' middle while carrying in front)
        const hr = L.hands[1], hl = L.hands[0];
        if (hr < 0) continue;
        rowApply(boneMat(b, a, hr, _m), L.handAt[1], _p);
        if (a.clip === 'carry' && hl >= 0) { rowApply(boneMat(b, a, hl, _m), L.handAt[0], _q); _p[0] = (_p[0] + _q[0]) / 2; _p[1] = (_p[1] + _q[1]) / 2; _p[2] = (_p[2] + _q[2]) / 2 + 0.07; }   // held in front, clear of the apron
        const grip = m.userData.anchors?.grip;
        _mr.makeTranslation(_p[0] - (grip?.x || 0), _p[1] - (grip?.y || 0.3), _p[2] - (grip?.z || 0));
      } else {
        // a hat: rigid on the head (the head bone's skin matrix applied to the hat placed on the bind-pose head)
        if (L.head < 0) continue;
        // hat matrix = skin(head) x [turn to the bind forward, scale to the head, at the top of the head]
        const r = boneMat(b, a, L.head, _m), h = L.headAt, ks = HAT_FIT[k] * Math.min(1.7, Math.max(0.9, L.headW / 0.098));
        const c = Math.cos(L.headYaw) * ks, sn = Math.sin(L.headYaw) * ks, hy = h[1] - HAT_SINK[k];
        _mr.set(r[0] * c - r[2] * sn, r[1] * ks, r[0] * sn + r[2] * c, r[0] * h[0] + r[1] * hy + r[2] * h[2] + r[3],
          r[4] * c - r[6] * sn, r[5] * ks, r[4] * sn + r[6] * c, r[4] * h[0] + r[5] * hy + r[6] * h[2] + r[7],
          r[8] * c - r[10] * sn, r[9] * ks, r[8] * sn + r[10] * c, r[8] * h[0] + r[9] * hy + r[10] * h[2] + r[11],
          0, 0, 0, 1);
      }
      _mr.premultiply(_mw);
      m.setMatrixAt(m.count++, _mr);
    }
    void near;
  }

  ctx.tick((dt, time) => {
    const p = G.player?.pos || G.camera.position;
    const near = Math.hypot(p.x - CITY.x, p.z - CITY.z) < 160;
    if (!on || failed) {
      if (!near) { old?.hide(); return; }
      old ??= oldResidents();
      old.tick(time);
      return;
    }
    if (!live) {
      const ph = G.life?.city?.phase;
      if (!G.life?.city || ph === 'off') { failed = true; return; }
      if (!near || !start()) return;
    }
    const { pool, props } = live;
    for (const k in props) props[k].count = 0;
    if (!near) { pool.hide(); for (const k in props) props[k].visible = false; return; }
    cam.setFromMatrixPosition(G.camera.matrixWorld);
    const vc = G.debug?.fixedCam;
    if (vc?.view && vc.pos) cam.copy(vc.pos);
    const keep = live.st.keep || [];
    pool.begin(time);
    for (const a of folk) {
      try { step(a, dt); } catch (e) { G.reportError?.('city:residents', e); a.role = 'idle'; }
      a.dist = Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z);
      let sT = a.dist < 88 ? 1 : 0;
      if (sT && inKeepOut(keep, a.x, a.y, a.z, 2)) sT = 0;
      if (sT && G.mode !== 'play' && a.dist < 30) sT = 0;
      a.s += Math.sign(sT - a.s) * Math.min(Math.abs(sT - a.s), dt * 1.6);
      if (a.s <= 0.002) continue;
      const lod = pool.lodOf(a.dist);
      if (pool.put(a, lod) && a.props.length && a.dist < 45) placeProps(a, live.bodies[a.body], lod === 0);
    }
    pool.end();
    for (const k in props) { const m = props[k]; m.visible = m.count > 0; if (m.count) m.instanceMatrix.needsUpdate = true; }
  });
  G.figures = Object.assign(G.figures || {}, {
    /** tests / probes: where the residents stand now, and what draws them */
    folk: () => (live ? folk.filter((a) => a.s > 0.01).map((a) => ({ x: a.x, y: a.y, z: a.z, yaw: a.yaw, i: a.i, look: a.look, role: a.role, clip: a.clip }))
      : old ? old.list.filter((a) => a.whole.visible).map((a) => ({ x: a.whole.position.x, y: a.whole.position.y, z: a.whole.position.z, yaw: a.whole.rotation.y, i: a.i })) : []),
    /** tests: the props drawn this frame and the body locators (head / hands in the bind pose) */
    folkDebug: () => (live ? { props: Object.fromEntries(Object.entries(live.props).map(([k, m]) => [k, m.count])), loc: live.bodies.map((b) => (b ? locators(b) : null)) } : null),
    folkStats: () => (live ? { mode: 'bodies', n: folk.length, draws: live.pool.draws + Object.values(live.props).filter((m) => m.count).length, tris: live.pool.tris } : { mode: old ? 'mannequins' : 'none' }),
  });
}
