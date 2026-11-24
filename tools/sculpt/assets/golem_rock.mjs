// 晶傀 the crystal golem (combat type `golem`, the earth trial's guardian pg_earth): a rock golem built from facet-kit
// boulders on the mon_golem_big skeleton and clips. Replaces the asset-pack block golem.
// INTENT
//  silhouette: a hunched heap of boulders: a great chest stone carried forward, a heavy brow-rock head low in front of
//    it, short pillar legs on broad flat feet, arms of three stones ending in huge fist boulders; a crown of cyan crystals
//    growing out of the back and shoulders. Wider at the top than at the feet.
//  big forms: the chest stone / the two fists / the feet. Medium: the pelvis, the shoulder stones, the brow.
//  the eye rests on: the two glowing eye slits under the brow shelf, the crystal crown, the crystal veins in the chest.
//  story: the hill's own stone woken by the old witch's seal; moss on the tops (it slept a long time), a fist corner
//    knocked off, crystal grown through the cracks.
//  must NOT look like: the pack golem (bevelled cubes, equal blocks), a dark blob, a robot.
// Every limb of this skeleton is one rigid bone (Root, Leg.L/R, Body, Head, Arm.L/R): every stone is pinned to one
// bone with weight 1, so it moves as a closed stone. Bind pose: T pose, arms along x at y 2.80, metres, +Z front; the
// game scales it by 0.72 (combat/types.js golem). Joints, inverse binds, nodes and clips are kept byte for byte.
// Meshes: GolemBody (Stone_rock: vertex colours; Eye: the game's glow) and GolemShards (Crystal: the game's glow; hidden
// when the armour breaks). Vertex colour linear once (core/assets.js SCULPT_VC_OK); primitives carry extras.celSmooth
// so the creature loader keeps the bevel normals (no welded smoothing).
//   node tools/sculpt/assets/golem_rock.mjs        -> assets/models/sculpt/golem_rock.glb, .tmp/sculpt/golem_rock/sheet.png
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { loadRig, skinMesh, compareRigs, M4 } from '../rig.mjs';
import {
  ROOT, prng, plane, planeD, norm, add, mul, cross, Mesh, mossCap, piece, prismPlanes, hullPlanes, carvedStone, col, mixc, ss,
  setLod, sheet, xform,
} from './mech_lib.mjs';

const RIG = path.join(ROOT, 'assets/models/refined/mon_golem_big.glb');
const OUT = path.join(ROOT, 'assets/models/sculpt/golem_rock.glb');

// a crystal: hexagonal prism with a pointed tip along +Y from the origin, length L, radius r -> planes
function crystalPlanes(r, L, tip = 0.35) {
  const out = prismPlanes(6, r, r * 0.92, 0, L * (1 - tip), { rot: 0 }).filter((q) => !(q.n[1] > 0.99));
  for (let i = 0; i < 6; i++) { const a = (i * 60) * Math.PI / 180, n = norm([Math.sin(a), (r * 0.92) / (L * tip), Math.cos(a)]); out.push(plane(n, [0, L, 0])); }
  return out;
}
/** rigid transform: aim local +Y along dir, spin about it, then move to `at` */
function aimXf(at, dir, spin = 0) {
  const y = norm(dir), t = Math.abs(y[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let x = norm(cross(t, y)); const z0 = cross(x, y);
  const c = Math.cos(spin), s = Math.sin(spin);
  x = add(mul(x, c), mul(z0, s)); const z = cross(x, y);
  const R = (v) => [x[0] * v[0] + y[0] * v[1] + z[0] * v[2], x[1] * v[0] + y[1] * v[1] + z[1] * v[2], x[2] * v[0] + y[2] * v[1] + z[2] * v[2]];
  return { p: (v) => add(R(v), at), n: (v) => norm(R(v)) };
}

function build() {
  setLod(0);
  const rnd = prng(301);
  const parts = { body: new Mesh(), shards: new Mesh() };
  const bones = { body: [], shards: [] };          // bone name per vertex
  const push = (into, bone, m) => { const b = bones[into]; for (let i = b.length; i < parts[into].nv; i++) b.push(bone); void m; };
  const STONES = ['#bdb6b0', '#b4aea9', '#c2b9ae', '#aba7a6', '#b9b0a4'];
  const stone = (k) => {
    const p = carvedStone({ H: 3.6, seed: 310 + k, warm: 0.3, base: 0.66, lichen: 0.35, streak: 0.3, tint: [0.97, 0.97, 1.03] });
    const tone = col(STONES[k % STONES.length]);
    // crystal light leaking from the chest's cracks: a cool glow in the stone near the veins
    return (c) => { const v = p(c); return mixc([v[0] * tone[0] / 0.72, v[1] * tone[1] / 0.72, v[2] * tone[2] / 0.72], col('#8fd6e6'), ss(0.35, 0.0, Math.hypot(c.p[0], c.p[1] - 2.05, c.p[2] - 0.12)) * 0.35); };
  };
  const bev = 0.035;
  const W = (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bev * 0.8 : bev * (0.8 + 0.6 * Math.max(0, Math.min(e.na[1], e.nb[1]))));
  const MOSS = { rings: 3, segs: 12 };
  let k = 0;
  /** a boulder of `count` facets round an ellipsoid (centre c, half sizes s), optional extra planes (breaks, flat feet) */
  const boulder = (bone, c, s, { count = 12, cut = [0.84, 1], extra = [], moss = null, tilt = 0.4 } = {}) => {
    const pl = hullPlanes(prng(320 + k), { size: s, c, count, cut, tilt, noUnder: false }).concat(extra);
    const P = piece(parts.body, pl, { bevel: W, paint: stone(k++), minAngle: 0.15 });
    if (moss) mossCap(parts.body, [P.planes], { at: moss.at, R: moss.R, T: 0.035, seed: 330 + k, ...MOSS, part: 'moss' });
    push('body', bone);
    return P;
  };
  const sides = [['L', 1], ['R', -1]];
  // ---- legs: thigh, shin, a broad flat foot (toes forward)
  for (const [S, sx] of sides) {
    const x = 0.44 * sx, bone = 'Leg.' + S;
    boulder(bone, [x, 1.2, -0.38], [0.29, 0.28, 0.3], { count: 11 });
    boulder(bone, [x + 0.02 * sx, 0.66, -0.34], [0.27, 0.3, 0.28], { count: 11 });
    boulder(bone, [x + 0.03 * sx, 0.15, -0.22], [0.31, 0.17, 0.4], { count: 12, extra: [planeD([0, -1, 0], 0, 'floor'), plane([0, 1, 0.25], [x, 0.3, 0])] });
  }
  // ---- body: pelvis, the great chest stone carried forward, a back slab
  boulder('Body', [0, 1.5, -0.42], [0.3, 0.22, 0.36], { count: 11 });
  const chest = boulder('Body', [0, 2.22, -0.36], [0.74, 0.6, 0.56], { count: 15, cut: [0.86, 1], extra: [plane([0.1, 0.25, 1], [0, 2.2, 0.17])], moss: { at: [-0.25, -0.55], R: 0.3 } });
  boulder('Body', [0.05, 2.75, -0.72], [0.55, 0.38, 0.3], { count: 12, moss: { at: [0.1, -0.75], R: 0.26 } });
  void chest;
  // ---- head: a heavy brow rock low in front, a jaw stone under it; eye slits under the brow shelf
  const head = boulder('Head', [0, 3.03, 0.52], [0.42, 0.3, 0.36], { count: 13, extra: [plane([0, 0.1, 1], [0, 3.0, 0.86]), plane([0, -0.6, 1], [0, 2.92, 0.82])], moss: { at: [0.05, 0.45], R: 0.18 } });
  void head;
  boulder('Head', [0, 2.7, 0.56], [0.3, 0.14, 0.27], { count: 10 });
  for (const sx of [-1, 1]) {
    // a slit, slanted down toward the nose (a frown), turned a little outward
    const xf = xform({ at: [sx * 0.155, 2.93, 0.83], yaw: sx * 0.38, roll: -sx * 0.22 });
    piece(parts.body, [planeD([1, 0, 0], 0.075), planeD([-1, 0, 0], 0.075), planeD([0, 1, 0], 0.024), planeD([0, -1, 0], 0.024), planeD([0, 0, 1], 0.035), planeD([0, 0, -1], 0.035)], { bevel: 0.01, paint: () => [1, 1, 1], part: 'eye', xf, corners: false });
    push('body', 'Head');
  }
  // ---- arms: shoulder stone, upper arm, a huge fist boulder (one corner knocked off the left one)
  for (const [S, sx] of sides) {
    const bone = 'Arm.' + S;
    boulder(bone, [0.98 * sx, 2.88, -0.46], [0.3, 0.3, 0.32], { count: 12, moss: { at: [0.98 * sx, -0.55], R: 0.16 } });
    boulder(bone, [1.45 * sx, 2.8, -0.44], [0.24, 0.21, 0.22], { count: 10 });
    const extra = S === 'L' ? [plane([0.6, 0.5, 0.6], [2.35, 2.95, -0.25])] : [];
    boulder(bone, [2.13 * sx, 2.76, -0.42], [0.44, 0.38, 0.38], { count: 14, extra });
  }
  // ---- crystals: a crown out of the back and shoulders, a few on the fists, veins in the chest (all glow)
  const crystal = (bone, at, dir, r, L) => {
    const xf = aimXf(at, dir, rnd() * 3);
    piece(parts.shards, crystalPlanes(r, L), { bevel: 0.006, paint: () => [1, 1, 1], part: 'crystal', xf, corners: false });
    push('shards', bone);
  };
  for (const [x, y, z, dx, dy, dz, r, L] of [
    [0.0, 2.92, -0.75, 0.0, 1, -0.35, 0.13, 1.05], [0.24, 2.88, -0.7, 0.35, 1, -0.3, 0.1, 0.78], [-0.26, 2.9, -0.68, -0.4, 1, -0.25, 0.105, 0.84],
    [0.1, 2.78, -0.85, 0.15, 0.6, -1, 0.085, 0.62], [-0.12, 2.73, -0.86, -0.25, 0.5, -1, 0.075, 0.55], [0.38, 2.8, -0.62, 0.8, 0.9, -0.3, 0.07, 0.52],
    [-0.4, 2.78, -0.6, -0.8, 0.9, -0.35, 0.07, 0.5],
  ]) crystal('Body', [x, y, z], [dx, dy, dz], r, L);
  for (const [S, sx] of sides) {
    crystal('Arm.' + S, [2.05 * sx, 3.05, -0.5], [0.3 * sx, 1, -0.3], 0.07, 0.45);
    crystal('Arm.' + S, [2.3 * sx, 3.0, -0.38], [0.6 * sx, 1, 0.1], 0.04, 0.24);
    crystal('Arm.' + S, [1.0 * sx, 3.1, -0.55], [0.3 * sx, 1, -0.4], 0.045, 0.26);
  }
  // chest veins: thin crystal blades set into the front of the chest stone
  for (const [x, y, ang, L] of [[-0.12, 1.92, 0.5, 0.36], [0.16, 2.0, -0.4, 0.3], [0.02, 2.22, 0.1, 0.26]]) crystal('Body', [x, y, 0.13], [Math.sin(ang), Math.cos(ang), 0.25], 0.035, L);
  return { parts, bones };
}

/** write the skinned GLB: the rig file with its mesh replaced by GolemBody (Stone + Eye) and GolemShards (Crystal) */
async function write(rig, parts, bones) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(RIG), root = doc.getRoot(), buf = root.listBuffers()[0];
  const old = root.listNodes().find((n) => n.getSkin() && n.getMesh()), skin = old.getSkin();
  const parent = root.listNodes().find((n) => n.listChildren().includes(old)) || null;
  const scene = root.listScenes()[0];
  const om = old.getMesh(); old.setMesh(null); old.setSkin(null);
  for (const p of om.listPrimitives()) p.dispose(); om.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  const inv = M4.inv(rig.meshWorld);
  const jointIx = (name) => { const i = rig.jointNames.indexOf(name); if (i < 0) throw new Error('no joint ' + name); return i; };
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const MAT = {
    stone: doc.createMaterial('Stone_rock').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0).setExtras({ surface: 'rock', sculpt: { author: 'sculpted for this project', vertexColors: true } }),
    moss: null, eye: doc.createMaterial('Eye').setBaseColorFactor([0.8, 0.97, 1, 1]).setEmissiveFactor([0.6, 0.85, 1]).setRoughnessFactor(1).setMetallicFactor(0),
    crystal: doc.createMaterial('Crystal').setBaseColorFactor([0.7, 0.93, 1, 1]).setEmissiveFactor([0.5, 0.85, 1]).setRoughnessFactor(1).setMetallicFactor(0),
  };
  MAT.moss = MAT.stone;   // moss rides in the stone primitive (vertex colour)
  const stats = {};
  for (const [nodeName, key] of [['GolemBody', 'body'], ['GolemShards', 'shards']]) {
    const M = parts[key], B = bones[key];
    const gm = doc.createMesh(nodeName);
    const byMat = new Map();
    for (let t = 0; t < M.idx.length; t += 3) {
      const pt = M.part[M.idx[t]], mk = pt === 'moss' || pt === 'stone' ? 'stone' : pt;
      if (!byMat.has(mk)) byMat.set(mk, { map: new Map(), P: [], N: [], C: [], J: [], W: [], I: [] });
      const g = byMat.get(mk);
      for (let k = 0; k < 3; k++) {
        const v = M.idx[t + k];
        let r = g.map.get(v);
        if (r === undefined) {
          r = g.P.length / 3; g.map.set(v, r);
          const p = M4.pt(inv, M.pos[v * 3], M.pos[v * 3 + 1], M.pos[v * 3 + 2]), d = M4.dir(inv, M.nrm[v * 3], M.nrm[v * 3 + 1], M.nrm[v * 3 + 2]), l = Math.hypot(...d) || 1;
          g.P.push(...p); g.N.push(d[0] / l, d[1] / l, d[2] / l); g.C.push(M.col[v * 3], M.col[v * 3 + 1], M.col[v * 3 + 2]);
          g.J.push(jointIx(B[v]), 0, 0, 0); g.W.push(1, 0, 0, 0);
        }
        g.I.push(r);
      }
    }
    for (const [mk, g] of byMat) {
      const n = g.P.length / 3;
      const prim = doc.createPrimitive().setMaterial(MAT[mk])
        .setAttribute('POSITION', acc('VEC3', Float32Array.from(g.P))).setAttribute('NORMAL', acc('VEC3', Float32Array.from(g.N)))
        .setAttribute('JOINTS_0', acc('VEC4', Uint16Array.from(g.J))).setAttribute('WEIGHTS_0', acc('VEC4', Float32Array.from(g.W)))
        .setIndices(acc('SCALAR', n > 65535 ? Uint32Array.from(g.I) : Uint16Array.from(g.I)))
        .setExtras({ celSmooth: true });
      if (mk === 'stone') prim.setAttribute('COLOR_0', acc('VEC3', Float32Array.from(g.C)));
      gm.addPrimitive(prim);
      stats[nodeName + ':' + mk] = g.I.length / 3;
    }
    // the old mesh node's own transform (three binds a skinned mesh with its node's world matrix: same as the kit's
    // writeSkinnedGLB, which keeps that node)
    const node = doc.createNode(nodeName).setMesh(gm).setSkin(skin).setTranslation(old.getTranslation()).setRotation(old.getRotation()).setScale(old.getScale());
    if (parent) parent.addChild(node); else scene.addChild(node);
  }
  old.dispose();
  const bin = await io.writeBinary(doc);
  fs.writeFileSync(OUT, bin);
  return { kb: Math.round(bin.length / 1024), stats };
}

async function main() {
  const rig = await loadRig(RIG);
  const { parts, bones } = build();
  const res = await write(rig, parts, bones);
  const same = await compareRigs(RIG, OUT);
  const b = parts.body.bounds();
  console.log('golem_rock', JSON.stringify(res.stats), 'KB', res.kb, 'rig kept', JSON.stringify(same), 'bounds', b.map((v) => v.toFixed(2)).join(' '));
  fs.writeFileSync(path.join(ROOT, 'assets/models/sculpt/golem_rock.manifest.json'), JSON.stringify({ sculpt_golem_rock: {
    file: 'models/sculpt/golem_rock.glb', type: 'model', license: 'CC0 (original work)', author: 'sculpted for this project',
    source: 'tools/sculpt/assets/golem_rock.mjs (node, facet kit on the mon_golem_big skeleton and clips)', scale: 1,
    size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]].map((v) => +v.toFixed(3)), tris: Object.values(res.stats).reduce((a, c) => a + c, 0),
    materials: ['Stone_rock', 'Eye', 'Crystal'], clips: JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')).mon_golem_big?.clips,
    notes: 'Crystal golem (combat golem / earth guardian): facet-kit boulders rigid on the mon_golem_big bones (legs, hunched chest, brow-rock head with glowing eye slits, three-stone arms with fist boulders), moss on the tops, a crown of cyan crystals (GolemShards, hidden when the armour breaks). Same joints, inverse binds and clips as mon_golem_big.',
  } }, null, 1) + '\n');
  // preview: bind pose, and frames of Idle / Walk / Attack
  const all = [];
  const meshOf = (S) => {
    const m = new Mesh();
    for (const key of ['body', 'shards']) {
      const M = parts[key], B = bones[key];
      const J = new Uint16Array(M.nv * 4), Wt = new Float32Array(M.nv * 4);
      for (let v = 0; v < M.nv; v++) { J[v * 4] = rig.jointNames.indexOf(B[v]); Wt[v * 4] = 1; }
      const sk = S ? skinMesh(Float32Array.from(M.pos), Float32Array.from(M.nrm), J, Wt, S) : { pos: M.pos, nrm: M.nrm };
      const o = m.nv;
      for (let v = 0; v < M.nv; v++) m.v([sk.pos[v * 3], sk.pos[v * 3 + 1], sk.pos[v * 3 + 2]], [sk.nrm[v * 3], sk.nrm[v * 3 + 1], sk.nrm[v * 3 + 2]], M.part[v] === 'crystal' || M.part[v] === 'eye' ? [0.45, 0.85, 1] : [M.col[v * 3], M.col[v * 3 + 1], M.col[v * 3 + 2]], M.part[v]);
      for (const i of M.idx) m.idx.push(i + o);
    }
    return m;
  };
  const bind = meshOf(null);
  all.push({ mesh: bind, az: 20, el: 10, label: 'bind front' }, { mesh: bind, az: 160, el: 20, label: 'bind back' });
  for (const [clip, t] of [['Idle', 1.0], ['Walk', 0.5], ['Attack', 0.35], ['Attack', 0.55]]) all.push({ mesh: meshOf(rig.pose(clip, t)), az: 30, el: 12, label: clip + ' ' + t });
  await sheet('golem_rock', all, { cols: 3, ts: 400 });
}
main().catch((e) => { console.error(e); process.exit(1); });
