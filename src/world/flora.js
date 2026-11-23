// flora — everything that grows, and the rocks (DESIGN §6.7). G.flora.
//  * flora/scatter.js  deterministic placement by land and place (trees, shrubs, flowers, crops, water plants, rocks, crystals)
//  * flora/batches.js  one InstancedMesh per model part (parts share the instance buffers), source data sorted by 32 m
//                      chunk; each view change packs the visible chunks' ranges (near tier = real models, far tier =
//                      cheap blob / cone / cap stand-ins), nearest first so only the shadow-range prefix casts shadows
//  * flora/material.js wind sway, per-instance tint / land multiplier / glow / crown collapse (hookMaterial'd toon)
//  * flora/grass.js    GPU grass, crops and wild flowers around the camera
//  * flora/life.js     colliders, element reactors (lazy, near the heroine), burning, felling, shattering, removal
import { ATLAS_HALF } from '../data/atlas.js';
import * as THREE from 'three';
import { slice } from '../core/boottime.js';
import { G as GG } from '../core/game.js';
import { SPECIES } from './flora/species.js';
import { scatter, STRIDE } from './flora/scatter.js';
import { Batch, buildModelParts, buildFarParts } from './flora/batches.js';
import { FU } from './flora/material.js';
import { createGrass } from './flora/grass.js';
import { createLife } from './flora/life.js';
import { bakeImpostors, ImpostorBatch } from './flora/impostor.js';
import { createFields } from './flora/fields.js';
import { countryPlan } from './flora/countryside-plan.js';

const CH = 32, NC = ATLAS_HALF * 2 / CH, ORG = -ATLAS_HALF;
const chunkOf = (x, z) => {
  const cx = Math.min(NC - 1, Math.max(0, Math.floor((x - ORG) / CH)));
  const cz = Math.min(NC - 1, Math.max(0, Math.floor((z - ORG) / CH)));
  return cx + cz * NC;
};

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _box = new THREE.Box3();
const _wind = new THREE.Vector3(), _fwd = new THREE.Vector3();

export const floraSystem = {
  name: 'flora',
  pausable: true,

  async init(G) {
    const t0 = performance.now();
    const W = G.world;
    const Q = G.quality || { density: 1, viewDist: 2400, name: 'high' };
    const qn = Q.name || 'high';
    const mob = !!Q.mobile; // phones (core/boot.js QUALITY.mobile): trees swap to their impostors sooner, shorter scenery reach
    const qk = mob ? 0.62 : qn === 'low' ? 0.72 : qn === 'med' ? 0.86 : 1;

    // ---- models
    const species = []; // { key, def, model, batch, far }
    const byKey = new Map();
    const farModels = { shroom: buildFarParts('shroom') };

    // ---- placement
    const raw = scatter(W, Q.density ?? 1);
    let total = 0;
    for (const [key, arr] of raw) {
      const def = SPECIES[key];
      if (!def) continue;
      let model = null;
      try { model = buildModelParts(G, { ...def, key }); } catch (e) { G.reportError('flora:model:' + key, e); }
      if (!model) { raw.delete(key); continue; }
      const sp = { key, def, model, idx: species.length, n: arr.length / STRIDE, batch: null };
      species.push(sp); byKey.set(key, sp);
      total += sp.n;
      await slice(); // perf pass: boot time slices (docs/api/perf.md "Boot and loading")
    }

    // ---- instance store (struct of arrays)
    const S = {
      n: total, sp: new Uint16Array(total), slot: new Int32Array(total), far: new Int32Array(total).fill(-1),
      x: new Float32Array(total), y: new Float32Array(total), z: new Float32Array(total), rot: new Float32Array(total),
      s: new Float32Array(total), tx: new Float32Array(total), tz: new Float32Array(total), chunk: new Int32Array(total),
      state: new Uint8Array(total), // 0 standing, 1 removed (may regrow), 2 charred, 3 felled / shattered / gone
      c0: new Float32Array(total * 3), c1: new Float32Array(total * 3), fx: new Float32Array(total * 4),
    };
    const chunkMin = new Float32Array(NC * NC).fill(1e9), chunkMax = new Float32Array(NC * NC).fill(-1e9);
    const crownPad = new Float32Array(NC * NC).fill(4);
    const chunkNear = Array.from({ length: NC * NC }, () => null);
    const chunkFar = Array.from({ length: NC * NC }, () => null);
    // round 2: every tree far tier is ONE baked-impostor batch ('imp'); giant mushrooms keep their cap stand-ins.
    // Impostor ranges are keyed by chunk (c) for trees and by c + NC² for bamboo, which swaps much earlier.
    const farKeys = ['imp', 'shroom'];
    const farLists = { imp: [], shroom: [] };
    const farOf = (sp) => (sp.def.far === 'shroom' ? 'shroom' : sp.def.far ? 'imp' : null);
    const impKey = (i) => S.chunk[i] + (species[S.sp[i]].def.far === 'bcone' ? NC * NC : 0);

    let gi = 0;
    for (const sp of species) {
      const arr = raw.get(sp.key);
      const n = sp.n;
      const order = [];
      for (let k = 0; k < n; k++) {
        const o = k * STRIDE, i = gi + k;
        S.sp[i] = sp.idx;
        S.x[i] = arr[o]; S.y[i] = arr[o + 1]; S.z[i] = arr[o + 2]; S.rot[i] = arr[o + 3]; S.s[i] = arr[o + 4];
        S.tx[i] = arr[o + 5]; S.tz[i] = arr[o + 6];
        for (let j = 0; j < 3; j++) { S.c0[i * 3 + j] = arr[o + 7 + j]; S.c1[i * 3 + j] = arr[o + 10 + j]; }
        S.fx[i * 4] = arr[o + 13]; S.fx[i * 4 + 1] = arr[o + 14]; S.fx[i * 4 + 2] = arr[o + 15]; S.fx[i * 4 + 3] = 1;
        const c = (S.chunk[i] = chunkOf(S.x[i], S.z[i]));
        const top = S.y[i] + sp.model.height * S.s[i];
        if (S.y[i] - 1 < chunkMin[c]) chunkMin[c] = S.y[i] - 1;
        if (top > chunkMax[c]) chunkMax[c] = top;
        if (sp.def.kind === 'tree') {
          const crown = sp.model.crown;
          const reach = Math.hypot(Math.abs(crown.cx) + crown.rx, Math.abs(crown.cz) + crown.rz);
          crownPad[c] = Math.max(crownPad[c], (reach + sp.model.height * .08) * S.s[i]);
        }
        order.push(i);
        if (sp.def.far) farLists[farOf(sp)].push(i);
      }
      order.sort((a, b) => S.chunk[a] - S.chunk[b]);
      const isTreeFar = !!sp.def.far;
      const dist = (isTreeFar ? (sp.def.near || 106) : sp.def.dist * (sp.def.kind === 'plant' ? 1.48 : 1)) * qk;
      const cap = sp.def.kind === 'tree' || sp.def.kind === 'shroom' ? 2600 : 4000;
      const b = new Batch(G, sp.model, n, cap, { name: sp.key, flex: sp.def.flex, castShadow: sp.def.kind !== 'plant', dist });
      b.kind = sp.def.kind;
      const starts = new Map(), counts = new Map();
      order.forEach((i, slot) => {
        S.slot[i] = slot;
        const c = S.chunk[i];
        if (!counts.has(c)) { starts.set(c, slot); counts.set(c, 0); (chunkNear[c] || (chunkNear[c] = [])).push(species.indexOf(sp)); }
        counts.set(c, counts.get(c) + 1);
      });
      b.setRanges(starts, counts);
      sp.batch = b;
      if (sp.model.closeParts?.length) {
        const distance=qn==='low'?19:qn==='med'?27:35;
        const detailModel={...sp.model,parts:sp.model.closeParts};
        const detail=new Batch(G,detailModel,n,Math.min(cap,512),{name:sp.key+'-detail',flex:sp.def.flex,dist:distance,source:b});
        detail.setRanges(starts,counts);
        detail.setFade(distance-6,distance,1);
        sp.detail=detail;
      }
      gi += n;
      await slice();
    }
    // far tiers: baked impostors of the near models (trees), cap stand-ins (giant mushrooms)
    const treeNear = 106 * qk;
    const farNear = { blob: treeNear, cone: treeNear, shroom: treeNear, bcone: 52 * qk }; // perf: bamboo clumps are dense (round 3: 62 -> 52 m, the richer near model is paid for by an earlier swap)
    const impSpecies = species.filter((sp) => farOf(sp) === 'imp');
    let atlas = null;
    const tb = performance.now();
    try { atlas = bakeImpostors(G, impSpecies, qn === 'low' ? 96 : qn === 'med' ? 128 : 160); } catch (e) { G.reportError('flora:impostors', e); }
    const impMs = performance.now() - tb;
    impSpecies.forEach((sp, k) => {
      const I = atlas ? atlas.info[k] : { cx: 0, cy: 0, cz: 0, he: 1 };
      sp.imp = { cx: I.cx, cy: I.cy, cz: I.cz, he: I.he, slot: k + Math.min(0.999, farNear[sp.def.far] / 1024) };
    });
    const farBatches = {};
    farKeys.forEach((fk, fi) => {
      const list = farLists[fk];
      if (!list.length) return;
      if (fk === 'imp' && !atlas) { for (const i of list) S.far[i] = -1; return; }
      const key = fk === 'imp' ? impKey : (i) => S.chunk[i];
      list.sort((a, b) => key(a) - key(b));
      const b = fk === 'imp'
        ? new ImpostorBatch(G, atlas, list.length, 16000, { name: 'far-imp', castShadow: true })
        : new Batch(G, farModels[fk], list.length, 14000, { name: 'far-' + fk, flex: 0.04, castShadow: false, dist: 1e9 });
      const starts = new Map(), counts = new Map();
      list.forEach((i, slot) => {
        S.far[i] = slot;
        const c = key(i);
        if (!counts.has(c)) { starts.set(c, slot); counts.set(c, 0); const cc = S.chunk[i]; const l = chunkFar[cc] || (chunkFar[cc] = []); if (!l.includes(fk)) l.push(fk); }
        counts.set(c, counts.get(c) + 1);
      });
      b.setRanges(starts, counts);
      b.fi = fi;
      farBatches[fk] = b;
    });

    // ---- write every instance into its batch
    const c0 = [0, 0, 0], c1 = [0, 0, 0], fxv = [0, 0, 0, 0];
    function matrixOf(i, out) {
      _e.set(S.tx[i], S.rot[i], S.tz[i]);
      _q.setFromEuler(_e);
      return out.compose(_p.set(S.x[i], S.y[i], S.z[i]), _q, _s.setScalar(S.s[i]));
    }
    function writeInstance(i, matrix) {
      const sp = species[S.sp[i]];
      const M = matrix || matrixOf(i, _m);
      for (let j = 0; j < 3; j++) { c0[j] = S.c0[i * 3 + j]; c1[j] = S.c1[i * 3 + j]; }
      for (let j = 0; j < 4; j++) fxv[j] = S.fx[i * 4 + j];
      sp.batch.set(S.slot[i], M, c0, c1, fxv);
      if (S.far[i] >= 0 && sp.imp) {
        farBatches.imp.set(S.far[i], M, c0, c1, fxv, sp.imp);
      } else if (S.far[i] >= 0) {
        const fb = farBatches[farOf(sp)];
        const cr = sp.model.crown;
        _m2.makeScale(cr.rx * 0.92, cr.ry * 0.95, cr.rz * 0.92).setPosition(cr.cx, cr.cy, cr.cz);
        _m2.premultiply(M);
        fb.set(S.far[i], _m2, c0, c1, fxv);
      }
    }
    function hideInstance(i) {
      const sp = species[S.sp[i]];
      sp.batch.hide(S.slot[i]);
      if (S.far[i] >= 0) farBatches[farOf(sp)]?.hide(S.far[i]);
    }
    for (let i = 0; i < total; i++) writeInstance(i);

    G.terrain?.scorchLayer?.setWoodlandFloor(S,species);

    // ---- grass
    let grass = null;
    try { grass = createGrass(G); } catch (e) { G.reportError('flora:grass', e); }
    // ---- painted crop fields of the countryside plan (map round): one draw, readable from the broom
    let fields = null;
    try { fields = createFields(G, countryPlan(W)); } catch (e) { G.reportError('flora:fields', e); }

    // ---- culling / packing state
    const sceneryD = mob ? 340 : Math.min(950, Math.max(420, (Q.viewDist || 2400) * .4));
    const farD = Math.min(1050, sceneryD + (qn === 'low' ? 105 : 130));
    const shadowD = mob ? 26 : qn === 'low' ? 30 : qn === 'med' ? 42 : 52; // perf: fewer flora shadow casters on lower tiers
    // dithered cross-fades instead of chunk pops: near models fade out over the last FB metres while the far cards fade in
    const FB = 18;
    for (const sp of species) {
      const b = sp.batch;
      if (sp.def.far) b.setFade(farNear[sp.def.far] - FB, farNear[sp.def.far], 2); // look round: overlap cross-fade (coverage on MSAA tiers)
      else b.setFade(b.dist * 0.67, b.dist, 1);
    }
    // Mushroom proxies are centred on their caps, above the near model's pivot.
    // Start their fade early enough for a rider approaching from overhead.
    farBatches.shroom?.setFade(farNear.shroom - FB - 12, farNear.shroom - 12, -2);
    // impostors fade in per instance over [near - FB, near] (near is packed in the species slot's fraction)
    if (farBatches.imp) farBatches.imp.setFade(0, FB, -2, farD);
    // impostor shadows: the far tier casts into the far cascade, and a shadow-only block covers [shadowD, near tier end)
    const impShadowD = mob ? 60 : qn === 'low' ? 100 : qn === 'med' ? 150 : 170; // mobile: its one cascade ends ~60 m out
    const visIds = new Int32Array(NC * NC), visD = new Float32Array(NC * NC), visOrder = [];
    const treeMin = new Float32Array(NC * NC), treeMax = new Float32Array(NC * NC);
    const last = { x: 1e9, y: 1e9, z: 1e9, fx: 0, fz: 0, frames: 0 };
    const allBatches = species.flatMap((s) => s.detail ? [s.batch,s.detail] : [s.batch]).concat(Object.values(farBatches));
    let anyDirty = true;
    const stat = { packs: 0, overflow: 0, chunks: 0 };
    const dcOff = G.params?.perf === '0' || G.params?.dcull === '0';

    function repack() {
      const cam = G.camera;
      _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_pv);
      const px = cam.position.x, pz = cam.position.z;
      let nv = 0;
      const c0x = Math.max(0, Math.floor((px - farD - ORG) / CH)), c1x = Math.min(NC - 1, Math.floor((px + farD - ORG) / CH));
      const c0z = Math.max(0, Math.floor((pz - farD - ORG) / CH)), c1z = Math.min(NC - 1, Math.floor((pz + farD - ORG) / CH));
      for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
        const c = cx + cz * NC;
        if (!chunkNear[c]) continue;
        const x0 = ORG + cx * CH, z0 = ORG + cz * CH;
        const dx = Math.max(x0 - px, 0, px - x0 - CH), dz = Math.max(z0 - pz, 0, pz - z0 - CH);
        const d = Math.hypot(dx, dz);
        if (d > farD) continue;
        const pad = crownPad[c];
        _box.min.set(x0 - pad, chunkMin[c], z0 - pad); _box.max.set(x0 + CH + pad, chunkMax[c] + 2, z0 + CH + pad);
        if (!_frustum.intersectsBox(_box)) continue;
        // Per-instance LOD shaders use distance in 3D. A rider high above a chunk can already
        // see its far crowns even when her XZ position is directly over the trunks.
        const y = cam.position.y;
        treeMin[c] = Math.hypot(d, Math.max(chunkMin[c] - y, y - chunkMax[c], 0));
        treeMax[c] = Math.hypot(Math.max(Math.abs(px - x0), Math.abs(px - x0 - CH)),
          Math.max(Math.abs(pz - z0), Math.abs(pz - z0 - CH)), Math.max(Math.abs(y - chunkMin[c]), Math.abs(y - chunkMax[c])));
        visIds[nv] = c; visD[nv] = d; nv++;
      }
      visOrder.length = nv;
      for (let k = 0; k < nv; k++) visOrder[k] = k;
      visOrder.sort((a, b) => visD[a] - visD[b]);
      for (const b of allBatches) b.begin();
      for (let k = 0; k < nv; k++) {
        const c = visIds[visOrder[k]], d = visD[visOrder[k]];
        const near = chunkNear[c];
        for (let j = 0; j < near.length; j++) {
          const sp=species[near[j]], b=sp.batch;
          if(sp.detail && treeMin[c]<sp.detail.dist+2) sp.detail.addNearby(c,cam.position,sp.detail.dist+2);
          if ((b.kind === 'tree' || b.kind === 'shroom' ? treeMin[c] : d) < b.dist) b.add(c, d < shadowD);
        }
        const far = chunkFar[c];
        if (far && far.includes('shroom') && treeMax[c] >= farNear.shroom - FB - 12 && d <= sceneryD) farBatches.shroom.add(c, false);
      }
      const ib = farBatches.imp;
      if (ib) {
        const NN = NC * NC;
        // 1) shadow-only block (trees whose near model does not cast any more and whose impostor is not drawn yet)
        for (let k = 0; k < nv; k++) {
          const c = visIds[visOrder[k]], d = visD[visOrder[k]];
          if (!chunkFar[c] || d < shadowD || d >= impShadowD) continue;
          if (treeMax[c] + FB < farNear.blob) ib.add(c, false, true);
          if (treeMax[c] + FB < farNear.bcone) ib.add(c + NN, false, true);
        }
        // 2) the visible far tier, nearest first (its prefix inside impShadowD casts)
        for (let k = 0; k < nv; k++) {
          const c = visIds[visOrder[k]], d = visD[visOrder[k]];
          if (!chunkFar[c]) continue;
          if (treeMax[c] + FB >= farNear.blob) ib.add(c, d < impShadowD);
          if (treeMax[c] + FB >= farNear.bcone) ib.add(c + NN, d < impShadowD);
        }
      }
      for (const b of extra) b.add('dyn', true);
      stat.overflow = 0;
      for (const b of allBatches) {
        b.end(); b.dirty = false; if (b.count >= b.cap) stat.overflow++;
        // draw-call pass: a batch with no caster in range stays out of every shadow map (it used to submit an empty
        // instanced draw per cascade: count = shadowCount = 0 in onBeforeShadow)
        if (!dcOff) for (const m of b.meshes) { if (m.userData.mvCast === undefined) m.userData.mvCast = m.castShadow; m.castShadow = m.userData.mvCast && b.shadowCount > 0; }
      }
      stat.packs++; stat.chunks = nv;
      anyDirty = false;
    }

    // ---- life: colliders, reactors, felling, burning, shattering
    const extra = [];
    const ctx = {
      G, S, species, byKey, farBatches, writeInstance, hideInstance, matrixOf, chunkOf, CH, NC, ORG, chunkNear, grass,
      markDirty: () => { anyDirty = true; },
      addExtra: (b) => { extra.push(b); allBatches.push(b); anyDirty = true; },
    };
    const life = createLife(ctx);

    const api = {
      /** ★ Trees within r of pos (standing or charred, not felled): [{ id, key, pos, height, radius, burning, charred }] */
      treesNear: (pos, r) => life.treesNear(pos, r),
      /** ★ Fell a tree (handle from treesNear, or an instance id) toward dir (Vector3-like, optional). */
      fell: (tree, dir) => life.fell(tree, dir),
      /** ★ Remove every plant / tree / rock inside the circle (craters). opts.regrow seconds (plants only). */
      removeInRadius: (x, z, r, opts) => life.removeInRadius(x, z, r, opts),
      /** Plants removed within r of (x, z) come back within `secs` (restoration, craft 溯光). */
      regrowIn: (x, z, r, secs) => life.regrowIn(x, z, r, secs),
      /** ★ Springy giant mushroom caps: [{ pos: Vector3 (cap top centre), radius, power }] */
      bouncePads: life.bouncePads,
      /** Shatter a breakable rock / crystal (instance id). */
      shatter: (id, info) => life.shatter(id, info),
      /** ★ Numbers for tests and the debug overlay. */
      stats() {
        let calls = 0, tris = 0, inst = 0;
        for (const b of allBatches) if (b.count) { calls += b.meshes.length; tris += b.count * b.tris; inst += b.count; }
        const g = grass ? grass.triangles() : 0;
        const gc = grass ? grass.meshes.filter((m) => m.visible).length : 0;
        return {
          instances: S.n, species: species.length, visible: inst, drawCalls: calls + gc, triangles: tris + g, grassTriangles: g,
          chunks: stat.chunks, packs: stat.packs, overflow: stat.overflow, initMs: Math.round(initMs), ...life.stats(),
        };
      },
      /** Per-batch visible counts (debug). */
      batches: () => allBatches.filter((b) => b.count).map((b) => ({ name: b.name, count: b.count, shadow: b.shadowCount, cap: b.cap, parts: b.meshes.length, tris: b.tris })),
      grass,
      fields,
      /** map round: the countryside plan (fields, hedges, walls, copses...) and what was planted from it */
      plan: countryPlan(W),
      countryside: raw.countryside || null,
      store: S,
      species,
      refresh() { anyDirty = true; },
    };
    G.flora = api;

    this._tick = (dt) => {
      const cam = G.camera;
      FU.fTime.value += dt;
      _wind.set(2, 0, 0.6);
      try { (G.elements?.visualWindAt || G.elements?.windAt)?.(G.env.focus, _wind); } catch (e) { /* elements optional */ } // + visual-only gusts
      _wind.y = 0;
      if (_wind.lengthSq() > 64) _wind.setLength(8);
      FU.fWind.value.lerp(_wind, Math.min(1, dt * 1.5));
      const pp = G.player?.pos || G.env.focus;
      FU.fPush.value.set(pp.x, pp.y, pp.z, 1.4);
      life.update(dt);
    };
    this._late = (dt) => {
      const cam = G.camera;
      const fc = G.debug?.fixedCam; // test camera lock is applied after lateUpdate: cull for the view that will be drawn
      if (fc) { cam.position.copy(fc.pos); cam.lookAt(fc.look); }
      cam.updateMatrixWorld();
      const pp = G.player?.pos || G.env.focus;
      cam.getWorldDirection(_fwd);
      const moved = Math.abs(cam.position.x - last.x) + Math.abs(cam.position.y - last.y) + Math.abs(cam.position.z - last.z);
      const turned = Math.abs(_fwd.x - last.fx) + Math.abs(_fwd.z - last.fz);
      let dirty = anyDirty;
      if (!dirty) for (const b of allBatches) if (b.dirty) { dirty = true; break; }
      if (dirty || moved > 1.2 || turned > 0.02 || ++last.frames > 45) {
        repack();
        last.x = cam.position.x; last.y = cam.position.y; last.z = cam.position.z; last.fx = _fwd.x; last.fz = _fwd.z; last.frames = 0;
      }
      FU.fCam.value.set(cam.position.x, cam.position.y, cam.position.z, 0);
      if (grass) grass.update(dt, cam, pp, FU.fWind.value);
    };
    const initMs = performance.now() - t0;
    console.info(`[flora] ${S.n} instances, ${species.length} species, init ${initMs.toFixed(0)} ms (impostor bake ${impMs.toFixed(0)} ms)`);
    api.impostors = atlas;
  },

  update(dt) {
    try { this._tick?.(dt); } catch (e) { GG.reportError('flora:update', e); }
  },
  lateUpdate(dt) {
    try { this._late?.(dt); } catch (e) { GG.reportError('flora:late', e); }
  },
};
