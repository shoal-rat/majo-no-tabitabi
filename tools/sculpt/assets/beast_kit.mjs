// beast_kit — shared pieces of the creature sculpts (stag_frost, snake_ember, wolf_wild, bat_star): a fur-lock shape, small
// vector helpers, and the post step every skinned beast GLB needs before the game can use it:
//   node tools/sculpt/assets/beast_kit.mjs post <name>     (after every build of tools/sculpt/assets/<name>.mjs)
//     - welds skin weights of split vertices (cracks at hard edges open when posed, NOTES.md "On a skeleton")
//     - drops the pack's extra mesh nodes listed in the asset's `dropNodes` (the stag's horns)
//     - COLOR_0 kept as the kit writes it (the game lifts it once at load, src/core/assets.js fixSculptColours, as for the hen)
//     - TEXCOORD_0.x = glow (0..1) from the asset's own `glow(c, p)` export (paint colour + bind position), y = 0.5;
//       the game turns it into emissive through a ramp (src/actors/creature.js KIT_GLOW)
//   node tools/sculpt/assets/beast_kit.mjs sheets <name>   (turntable / poses / game read rendered from the written GLB)
import * as P from '../sdf.mjs';

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: (a) => Math.hypot(a[0], a[1], a[2]), norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const stroke = (h) => Math.max(0.05, Math.pow(Math.sin(Math.PI * (0.16 + 0.84 * h)), 0.8) * (1 - 0.25 * h));

/** A flattened, tapering lock (fur lock, ear leaf, feather) from a to b: `thin` is the flat axis, `prof(h)` the radius
 *  profile along it (0 root .. 1 tip), `curl` bends the tip toward `lift`. */
export function lock(a, b, R, { thin = [1, 0, 0], flat = 0.45, lift = [0, 1, 0], curl = 0.15, prof = stroke } = {}) {
  const ax = V.sub(b, a), L = V.len(ax), t = V.mul(ax, 1 / L);
  const nn = V.norm(V.sub(thin, V.mul(t, V.dot(thin, t))));
  const w = V.cross(t, nn);
  const lf = V.norm(V.sub(lift, V.mul(t, V.dot(lift, t))));
  const lv = V.dot(lf, nn) * curl * L, lw = V.dot(lf, w) * curl * L;
  const k = flat * 0.85;
  const f = (x, y, z) => {
    const dx = x - a[0], dy = y - a[1], dz = z - a[2];
    const u = dx * t[0] + dy * t[1] + dz * t[2];
    const h = u <= 0 ? 0 : u >= L ? 1 : u / L;
    const v = dx * nn[0] + dy * nn[1] + dz * nn[2] - lv * h * h;
    const ww = dx * w[0] + dy * w[1] + dz * w[2] - lw * h * h;
    return (Math.hypot(Math.hypot(v / flat, ww), u - h * L) - R * prof(h)) * k;
  };
  const m = R + Math.abs(curl * L) + 0.006;
  const bb = [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m];
  return new P.Shape(f, bb, null, 1.25);
}

// =========================================================================================================== CLI
const ROLE = process.argv[1] && process.argv[1].endsWith('beast_kit.mjs') ? process.argv[2] : null;
const NAME = process.argv[3];
if (ROLE === 'post') postProcess(NAME).catch((e) => { console.error(e); process.exit(1); });
if (ROLE === 'sheets') finalSheets(NAME, process.argv.slice(4)).catch((e) => { console.error(e); process.exit(1); });

const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

function weldWeights(Pp, J, W, n) {
  const groups = new Map();
  for (let v = 0; v < n; v++) { const k = `${Math.round(Pp[v * 3] * 1e5)},${Math.round(Pp[v * 3 + 1] * 1e5)},${Math.round(Pp[v * 3 + 2] * 1e5)}`; (groups.get(k) || groups.set(k, []).get(k)).push(v); }
  let welded = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const acc = new Map();
    for (const v of g) for (let k = 0; k < 4; k++) if (W[v * 4 + k] > 0) acc.set(J[v * 4 + k], (acc.get(J[v * 4 + k]) || 0) + W[v * 4 + k]);
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((a, b) => a + b[1], 0);
    for (const v of g) for (let k = 0; k < 4; k++) { J[v * 4 + k] = top[k] ? top[k][0] : 0; W[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
    welded += g.length;
  }
  return welded;
}

async function postProcess(name) {
  const fs = await import('node:fs');
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { loadRig, M4 } = await import('../rig.mjs');
  const def = (await import(`./${name}.mjs`)).default;
  const mod = await import(`./${name}.mjs`);
  const file = `assets/models/sculpt/${def.name}.glb`;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  // the pack's extra meshes the sculpt replaces (the stag's horns: the game grows crystal antlers instead)
  for (const n of doc.getRoot().listNodes()) if ((def.dropNodes || []).includes(n.getName())) { const m = n.getMesh(); n.setMesh(null); n.dispose(); if (m && !m.listParents().some((x) => x.propertyType === 'Node')) m.dispose(); console.log('post: dropped node', n.getName()); }
  for (const m of doc.getRoot().listMaterials()) if (!m.listParents().some((x) => x.propertyType === 'Primitive')) m.dispose();
  const prim = doc.getRoot().listNodes().find((n) => n.getSkin() && n.getMesh()).getMesh().listPrimitives()[0];
  if (prim.getAttribute('TEXCOORD_0')) { fs.writeFileSync(file, await io.writeBinary(doc)); console.log('already post-processed (nodes / materials pruned)'); return; }
  const rig = await loadRig(file);
  const Pp = prim.getAttribute('POSITION').getArray(), C = prim.getAttribute('COLOR_0').getArray();
  const J = prim.getAttribute('JOINTS_0').getArray(), W = prim.getAttribute('WEIGHTS_0').getArray();
  const n = Pp.length / 3;
  console.log('post: welded weights on', weldWeights(Pp, J, W, n), 'coincident vertices');
  const UV = new Float32Array(n * 2);
  let glowN = 0;
  for (let v = 0; v < n; v++) {
    const p = M4.pt(rig.meshWorld, Pp[v * 3], Pp[v * 3 + 1], Pp[v * 3 + 2]);
    // the paint as the sculptor wrote it (sRGB 0..1), for the glow rule
    const s = [enc(C[v * 3]), enc(C[v * 3 + 1]), enc(C[v * 3 + 2])];
    const g = mod.glow ? Math.max(0, Math.min(1, mod.glow(s, p))) : 0;
    UV[v * 2] = g; UV[v * 2 + 1] = 0.5; if (g > 0.05) glowN++;
  }
  const buf = doc.getRoot().listBuffers()[0];
  prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(UV).setBuffer(buf));
  const bin = await io.writeBinary(doc); fs.writeFileSync(file, bin);
  console.log(`post: wrote ${file} ${(bin.length / 1024).toFixed(0)} KB; ${n} verts, ${prim.getIndices().getCount() / 3} tris, glow on ${glowN} verts`);
}

// final sheets from the written GLB (colours as the game shows them after post, glow added on top)
async function finalSheets(name, extra) {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const R = await import('../preview.mjs');
  const { loadRig, skinMesh, M4 } = await import('../rig.mjs');
  const def = (await import(`./${name}.mjs`)).default;
  const out = `.tmp/sculpt/${def.name}`; fs.mkdirSync(out, { recursive: true });
  const rig = await loadRig(`assets/models/sculpt/${def.name}.glb`), oldRig = await loadRig(def.rig.file);
  const prim = rig.meshNode.getMesh().listPrimitives()[0];
  const uv = prim.getAttribute('TEXCOORD_0')?.getArray();
  const glowCol = def.glowColor || [1, 0.5, 0.2];
  const o = rig.old[0];
  // preview: game linear colour -> the renderer's sRGB paint input
  const col = Float32Array.from(o.col);
  for (let v = 0; v < col.length / 3; v++) for (let k = 0; k < 3; k++) { const g = uv ? uv[v * 2] : 0; col[v * 3 + k] = Math.min(1, col[v * 3 + k] + g * glowCol[k]); }
  const pose = (r, clip, t) => (clip === 'rest' ? r.joints.map(() => M4.id()) : r.pose(r.clip(clip), t));
  const newMesh = (S, clay) => { const sk = skinMesh(o.pos, o.nrm, o.J, o.W, S); return [{ pos: sk.pos, nrm: sk.nrm, idx: o.idx, col: clay ? null : col, base: [1, 1, 1] }]; };
  const oldMeshes = (S) => oldRig.old.map((q) => { const sk = skinMesh(q.pos, q.nrm, q.J, q.W, S); return { pos: sk.pos, nrm: sk.nrm, idx: q.idx, uv: q.uv, tex: q.tex, col: q.col, base: q.base || [1, 1, 1] }; });
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < o.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], o.pos[i + k]); b[k + 3] = Math.max(b[k + 3], o.pos[i + k]); }
  const c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2], fov = 35, d0 = R.fitDistance(b, fov, 0.62), ts = 340;
  const save = (n, img) => { R.savePNG(path.join(out, n), img); console.log('sheet ' + path.join(out, n)); };
  const which = extra.length ? extra : ['turntable', 'poses', 'head'];
  if (which.includes('turntable')) {
    const rest = pose(rig, 'rest', 0);
    save('final_turntable.png', R.sheet([0, 45, 90, 135, 180, 225, 270, 315].map((az) => ({ img: R.render(newMesh(rest), R.orbit(c, az, 10, d0, fov, 300, 300)), label: `${az}` })), 4, { title: `${def.name} FINAL GLB` }));
  }
  if (which.includes('poses')) {
    const tiles = [];
    for (const [clip, t] of def.poses) {
      tiles.push({ img: R.render(oldMeshes(pose(oldRig, clip, t)), R.orbit(c, 60, 12, d0, fov, ts, ts)), label: `OLD ${clip} ${t}` });
      tiles.push({ img: R.render(newMesh(pose(rig, clip, t)), R.orbit(c, 60, 12, d0, fov, ts, ts)), label: `NEW ${clip} ${t}` });
    }
    save('final_poses.png', R.sheet(tiles, 4, { title: `${def.name} POSES (FINAL GLB)` }));
  }
  if (which.includes('head') && def.headView) {
    const rest = pose(rig, 'rest', 0), [hc, hd] = def.headView;
    save('final_head.png', R.sheet([[30, 8], [90, 4], [330, 20], [0, 4], [150, 25], [270, 45]].map(([az, el]) => ({ img: R.render(newMesh(rest), R.orbit(hc, az, el, hd, 35, 400, 400)), label: `HEAD ${az}/${el}` })), 3, { title: `${def.name} HEAD (FINAL GLB)` }));
  }
}
