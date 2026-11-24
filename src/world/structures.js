// structures — every built place in 曦月洲: the shrine, the villages, the lantern town, the Moon palace, bridges,
// floating islands, roadside things. Places are assembled from primitives (builders/kit.js), baked into a few meshes
// each, and register their walls / floors / roofs on G.world. Model factories for other systems are re-exported here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { slice } from '../core/boottime.js';
import { G } from '../core/game.js';
import { farLOD } from './builders/kit.js';
import { realizeTrees } from './builders/decor.js';
import { buildHeroes, tickHeroes, heroStats, siteList, sculptDebug } from './builders/sculpt.js';
import { ANCHORS, ROADS, STONE_LANTERNS, GREAT_LANTERNS, SKY_ISLES } from '../data/world.js';
import { roadDist } from './ground.js';
import { tickFactories, makeStoneLantern, makeGreatLantern, makePaperLantern, makeTorii, makeChest, makeSignpost, makeRaceRing,
  makeBrazier, makeCrystalPillar, makeEmaRack, makeShrineBell } from './builders/factories.js';
import { buildWaysides } from './builders/journey-waysides.js';
import { buildPracticeField } from './builders/practice-field.js';
import { buildLandmarks } from './builders/landmarks.js';
import { buildTrialBasin } from './builders/trial-basin.js';
import { buildTrialPaving } from './builders/trial-paving.js';
import { buildJourneyRooms } from './builders/journey-rooms.js';
import { buildBellcrown,buildEastTown } from './builders/bellcrown.js';
import { createCityMist } from './city-mist.js';

export { makeStoneLantern, makeGreatLantern, makePaperLantern, makeTorii, makeChest, makeSignpost, makeRaceRing, makeBrazier,
  makeCrystalPillar, makeEmaRack, makeShrineBell };

const tickers = [];
const lods = [], culls = [], placeFars = [];
let NEAR = 170; // near/far swap distance (m); lower on low / med quality (set in init)
const _cam = new THREE.Vector3();
let lodFrame = 0;
/** Far shadow casters: one simplified caster-only mesh per place, on PROXY_LAYER (seen only by the shadow cameras). */
export const PROXY_LAYER = 5;
const proxies = [];
let proxyLights = 0;
function enableProxyLayer() {
  // three's shadow pass uses the shadow camera's layers when they hold anything beyond layer 0
  let n = 0;
  G.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow && o.shadow?.camera) { o.shadow.camera.layers.enable(0); o.shadow.camera.layers.enable(PROXY_LAYER); n++; } });
  proxyLights = n;
}
/** Swap near / far versions of the places and hide far small objects (every 8th frame). */
function lodTick(force) {
  if (!force && (++lodFrame & 7)) return;
  if (!G.camera) return;
  G.camera.getWorldPosition(_cam);
  for (const l of lods) {
    const d = _cam.distanceTo(l.c) - l.r;
    const nd = l.near2 || NEAR;
    const near = d < (l.isNear ? nd + 15 : nd);          // hysteresis
    if (near !== l.isNear || force) { l.isNear = near; l.near.visible = near; l.far.visible = !near; }
    if (l.cut && !near) l.far.visible = d < l.cut;   // stand-ins: nothing at all beyond the cut
  }
  // draw-call pass: a place baked in blocks shows ONE merged far version while every block is far (2 draws, not 2 per block)
  for (const pf of placeFars) {
    let all = true;
    for (const e of pf.entries) if (e.isNear) { all = false; break; }
    pf.far.visible = all;
    for (const e of pf.entries) e.far.visible = !all && !e.isNear;
  }
  for (const c of culls) c.obj.visible = _cam.distanceToSquared(c.pos) < c.d2;
  // perf: only casters near the shadow map (one ±70 m map around the focus) go into the shadow pass
  const f = G.player?.pos || _cam;
  const R = G.quality?.mobile ? 44 : G.quality?.name === 'low' ? 58 : G.quality?.name === 'med' ? 70 : SHADOW_R; // mobile: its one cascade (±40 m)
  for (const c of casters) c.obj.castShadow = Math.hypot(c.c.x - f.x, c.c.z - f.z) - c.r < R;
  // the cheap far casters take over where the detailed ones stop, out to the far shadow cascade
  const FR = G.quality?.name === 'low' ? 0 : 260;
  for (const p of proxies) { const d = Math.hypot(p.c.x - f.x, p.c.z - f.z); p.mesh.visible = d - p.r * 0.5 > R && d - p.r < FR; }
  if (proxies.length && (force || (lodFrame & 255) === 0) && proxyLights < 3) enableProxyLayer();
}
/**
 * A place baked in blocks (Site.bakeBlocks): every block swaps to its own clustered far version beyond BLOCK_NEAR m
 * (finer clustering than a whole place's far LOD, since the swap is closer), with one shadow proxy per block. The
 * place group's loose children (instanced site trees) are hidden beyond NEAR like a whole place would be.
 */
let BLOCK_NEAR = 95;
async function blockLODs(id, p, step) {
  const bb = new THREE.Box3(), v = new THREE.Vector3();
  p.fars = [];
  for (const b of p.blocks) {
    if (step) await step('lod:' + b.name);
    bb.setFromObject(b);
    if (bb.isEmpty()) continue;
    const c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(v).length() / 2;
    const far = await farLOD(b, p.farCell || 0.3, step);
    far.visible = false; far.matrixAutoUpdate = false; far.updateMatrix();
    G.scene.add(far); p.fars.push(far);
    lods.push({ id: b.name, near: b, far, c, r, isNear: true, near2: p.blockNear || BLOCK_NEAR });
    const lit = far.children.find((m) => m.isMesh && !m.material.isMeshBasicMaterial);
    if (lit && !p.noShadowProxy) {
      const px = new THREE.Mesh(lit.geometry, lit.material);
      px.name = b.name + '_shadowProxy';
      px.layers.set(PROXY_LAYER); px.castShadow = true; px.receiveShadow = false; px.visible = false;
      px.position.copy(far.position); px.quaternion.copy(far.quaternion); px.scale.copy(far.scale);
      px.matrixAutoUpdate = false; px.updateMatrix();
      G.scene.add(px);
      proxies.push({ mesh: px, c, r });
    }
  }
  bb.setFromObject(p.group);
  const c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(v).length() / 2;
  for (const ch of p.group.children) if (!ch.userData.block) culls.push({ obj: ch, pos: c, d2: (NEAR + r) * (NEAR + r) });
  // the whole place far: the block fars merged per material (same geometry, same frame: every block shares the site root's)
  const entries = lods.filter((l) => p.fars.includes(l.far));
  if (entries.length > 1) {
    const byMat = new Map();
    for (const f of p.fars) for (const m of f.children) if (m.isMesh) { let l = byMat.get(m.material); if (!l) byMat.set(m.material, (l = [])); l.push(m.geometry); }
    const pf = new THREE.Group(); pf.name = id + '_far';
    pf.position.copy(p.fars[0].position); pf.quaternion.copy(p.fars[0].quaternion); pf.scale.copy(p.fars[0].scale);
    for (const [mt, geos] of byMat) {
      const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (step) await step('lod:placefar');
      if (!g) continue;
      const m = new THREE.Mesh(g, mt); m.castShadow = false; m.receiveShadow = false; pf.add(m);
    }
    pf.visible = false; pf.matrixAutoUpdate = false; pf.updateMatrix();
    G.scene.add(pf); p.placeFar = pf;
    placeFars.push({ far: pf, entries });
  }
}
/**
 * Stand-in (draw-call pass): obj's meshes merged into two draws (lit + glow, colours in vertex colours, no
 * simplification) shown instead of obj beyond `dist` m, nothing beyond `cut` m (0 = no cut). statics = true: only
 * the baked parts are replaced (obj's direct non-dynamic meshes); the live children (userData.dynamic: lit paper,
 * flame, lid) stay drawn as before, so lighting a lantern far away still shows.
 */
async function standIn(obj, dist, cut, statics) {
  obj.updateMatrixWorld(true);
  const far = await farLOD(obj, 0.004, null, { skipDynamic: statics });
  if (!far.children.length) return null;
  far.visible = false; far.matrixAutoUpdate = false; far.updateMatrix();
  G.scene.add(far);
  const bb = new THREE.Box3().setFromObject(obj), c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(new THREE.Vector3()).length() / 2;
  let near = obj;
  if (statics) {
    const parts = obj.children.filter((m) => m.isMesh && !m.userData.dynamic);
    let on = true;
    near = { get visible() { return on; }, set visible(v) { on = v; for (const m of parts) m.visible = v; } };
  }
  const k = cullK(); // phones: stand-ins and cuts come sooner
  lods.push({ id: (obj.name || 'obj') + '_standIn', near, far, c, r, isNear: true, near2: dist * k, cut: cut * k });
  return far;
}
// phones (core/boot.js QUALITY.mobile): small objects (chests, posts, props) hide / swap to stand-ins at 0.7x the distance
const cullK = () => (G.quality?.mobile ? 0.7 : 1);
const casters = [];
const SHADOW_R = 80;
function collectCasters(root) {
  const sph = new THREE.Sphere();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow || !o.geometry) return;
    if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); sph.copy(o.boundingSphere).applyMatrix4(o.matrixWorld); }
    else { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); }
    casters.push({ obj: o, c: sph.center.clone(), r: sph.radius });
  });
}

export const structuresSystem = {
  name: 'structures',
  pausable: true,
  async init(G) {
    const S = {
      places: {},
      /** id -> { group, setLit(on, instant), lit, firePos } for the 12 roadside stone lanterns (unlit at start). */
      stoneLanterns: {},
      /** gl_* -> { group, setLit, lit, height, firePos, top } — the four Great Lanterns, standing on their daises. */
      greatLanterns: {},
      /** Three turnable crystal pillars around the 晶灯: [{ group, setAngle, setLit, angle, pos:Vector3 }] */
      crystalPedestals: [],
      chests: {},
      factories: { makeStoneLantern, makeGreatLantern, makePaperLantern, makeTorii, makeChest, makeSignpost, makeRaceRing, makeBrazier, makeCrystalPillar, makeEmaRack, makeShrineBell },
      makeStoneLantern, makeGreatLantern, makePaperLantern, makeTorii, makeChest, makeSignpost, makeRaceRing, makeBrazier, makeCrystalPillar, makeEmaRack, makeShrineBell,
      audit,
      /** Draw calls / triangles of everything the system added (for tests). */
      stats,
      /**
       * Draw-call pass (docs/api/perf.md): hide a small static object beyond `dist` m from the camera (checked every
       * 8th frame). Only for objects nothing else shows / hides (or wrap them in a holder group first).
       */
      cull(obj, pos, dist = 260) { dist *= cullK(); culls.push({ obj, pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y || 0, pos.z), d2: dist * dist }); },
      /**
       * Draw-call pass: a small static object (already in the scene, final transform) swaps to a merged stand-in of
       * two draws (lit + glow, material colours in vertex colours, no simplification) beyond `dist` m, and is hidden
       * altogether beyond `cut` m (0 = never). Keep `dist` beyond the 64 m night lamp-pool map (sky.js) when the
       * object holds a lamp. Nothing else may toggle obj.visible. Returns a promise of the stand-in.
       */
      async standIn(obj, dist = 100, cut = 0, { statics = false } = {}) {
        return standIn(obj, dist, cut, statics);
      },
    };
    G.structures = S;
    // phones (core/boot.js QUALITY.mobile): places and city blocks swap to their far versions sooner
    NEAR = G.quality?.mobile ? 100 : G.quality?.name === 'low' ? 120 : G.quality?.name === 'med' ? 145 : 170;
    BLOCK_NEAR = G.quality?.mobile ? 44 : G.quality?.name === 'low' ? 55 : G.quality?.name === 'med' ? 75 : 95;
    const ctx = {
      S,
      place(id, data) { S.places[id] = Object.assign(S.places[id] || {}, data); return S.places[id]; },
      tick(fn) { tickers.push(fn); },
      /** Hide a small object beyond `dist` m from the camera. */
      cull(obj, pos, dist = 260) { dist *= cullK(); culls.push({ obj, pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y || 0, pos.z), d2: dist * dist }); },
    };
    // Boot time slices (docs/api/perf.md "Boot and loading"): every builder is async and calls `await ctx.step(label)`
    // between its pieces (sections, houses, the bake's merge and each merged mesh's shading); step yields once the slice
    // budget is spent. S.boot records the longest main-thread piece between two yields (label, ms) for the perf checks.
    const boot = { tasks: 0, max: 0, maxAt: '', top: [] };
    S.boot = boot;
    let tRes = performance.now();
    ctx.step = async (label) => {
      const p = slice();
      if (!p) return;
      const ms = performance.now() - tRes;
      boot.tasks++;
      if (ms > boot.max) { boot.max = +ms.toFixed(1); boot.maxAt = label; }
      if (ms > 16) { boot.top.push([label, +ms.toFixed(1)]); boot.top.sort((a, b) => b[1] - a[1]); boot.top.length = Math.min(boot.top.length, 12); }
      await p;
      tRes = performance.now();
    };
    for (const [name, fn] of [['waysides',buildWaysides],['trialBasin',buildTrialBasin],['trialPaving',buildTrialPaving],['homes',buildJourneyRooms],['peacefulCountry',buildEastTown],['landOfMages',buildBellcrown],['practiceField',buildPracticeField],['landmarks',async(c)=>{S.landmarks=await buildLandmarks(c);}]]) {
      try { await fn(ctx); } catch (e) { G.reportError('structures:' + name, e); }
      await ctx.step(name + ':done');
    }
    // the skirt of mist below the City of Magic's plateau (episode two's aerial view)
    try { const mist = createCityMist(G); if (mist) { S.cityMist = mist; tickers.push((dt) => mist.update(dt)); } } catch (e) { G.reportError('structures:mist', e); }
    // site trees: procedural flora models, instanced per place
    for (const id in S.places) { const p = S.places[id]; if (p.group) { try { realizeTrees(p.group); } catch (e) { G.reportError('structures:trees:' + id, e); } await ctx.step('trees:' + id); } }
    // far level of detail: each place swaps to a two-mesh version beyond NEAR m from its bounds
    const bb = new THREE.Box3(), v = new THREE.Vector3();
    for (const id in S.places) {
      await ctx.step('lod:' + id);
      const p = S.places[id];
      if (!p.group || p.noLOD) continue;
      if (p.blocks) { try { await blockLODs(id, p, ctx.step); } catch (e) { G.reportError('structures:lod:' + id, e); } continue; }
      try {
        bb.setFromObject(p.group);
        if (bb.isEmpty()) continue;
        const c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(v).length() / 2;
        const far = await farLOD(p.group, undefined, ctx.step);
        far.visible = false; far.matrixAutoUpdate = false; far.updateMatrix();
        G.scene.add(far);
        p.far = far;
        lods.push({ id, near: p.group, far, c, r, isNear: true, cut: p.cut || 0 });
        const lit = far.children.find((m) => m.isMesh && !m.material.isMeshBasicMaterial);
        if (lit && !p.noShadowProxy) {
          const px = new THREE.Mesh(lit.geometry, lit.material);
          px.name = id + '_shadowProxy';
          px.layers.set(PROXY_LAYER); px.castShadow = true; px.receiveShadow = false; px.visible = false;
          px.position.copy(far.position); px.quaternion.copy(far.quaternion); px.scale.copy(far.scale);
          px.matrixAutoUpdate = false; px.updateMatrix();
          G.scene.add(px);
          proxies.push({ mesh: px, c, r });
        }
      } catch (e) { G.reportError('structures:lod:' + id, e); }
    }
    // draw-call pass: the lanterns' and chests' baked parts swap to one or two draws beyond 100 m (outside the 64 m night
    // lamp-pool map); the live parts (paper, flame, lid) stay. Same cut as their existing distance cull, if any.
    for (const [set, cut] of [[S.stoneLanterns, 300], [S.greatLanterns, 0], [S.chests, 0]]) {
      for (const k in set) {
        const g = set[k]?.group;
        if (!g) continue;
        await ctx.step('standin:' + k);
        try { await standIn(g, 100, cut, true); } catch (e) { G.reportError('structures:standin:' + k, e); }
      }
    }
    // sculpted objects (builders/sculpt.js): one instanced LOD0 per type for the near instances

    if (G.sculpt) { G.sculpt.stats = heroStats; G.sculpt.sites = siteList; G.sculpt.debug = sculptDebug; }
    S.lods = lods; S.culls = culls; S.shadowProxies = proxies;
    try {
      for (const id in S.places) if (S.places[id].group) collectCasters(S.places[id].group);
      for (const set of [S.stoneLanterns, S.greatLanterns, S.chests]) for (const k in set) if (set[k]?.group) collectCasters(set[k].group);
      for (const c of S.crystalPedestals) if (c?.group) collectCasters(c.group);
    } catch (e) { G.reportError('structures:casters', e); }
    lodTick(true);

  },
  start() {},
  update(dt) {
    const time = G.time.t;
    tickFactories(dt, time);
    lodTick(false);

    for (let i = 0; i < tickers.length; i++) tickers[i](dt, time);
  },
};

/** Problems with the layout: colliders inside an anchor's 3.5 m circle or on a road centreline (±1.4 m). */
function audit() {
  const bad = [];
  const hosts = new Set(['town_lamp', 'dusk_lantern', 'lake_lantern', 'crystal_lantern', 'palace_lantern']);
  // only colliders that reach down to walking height count (raised bridge rails do not block the street below)
  const mine = G.world.colliders.filter((c) => !c.dead && c.tag && c.tag !== 'flora' && c.tag !== 'prop' && c.y0 < G.world.heightAt(c.x, c.z) + 2.0);
  for (const c of mine) {
    const ext = c.box ? Math.hypot(c.hw, c.hd) : c.r;
    for (const k in ANCHORS) {
      if (hosts.has(k)) continue;
      const a = ANCHORS[k];
      const d = c.box ? boxDist(c, a.x, a.z) : Math.hypot(a.x - c.x, a.z - c.z) - c.r;
      if (d < 3.5 - 0.05) bad.push({ kind: 'anchor', anchor: k, tag: c.tag, x: +c.x.toFixed(1), z: +c.z.toFixed(1), d: +d.toFixed(2) });
    }
    if (c.tag !== 'town_tower' && c.tag !== 'greatlantern' && !String(c.tag).startsWith('bridge_') && roadDist(c.x, c.z) < ext + 1.4) {
      // precise: sample the collider's footprint
      const d = c.box ? minRoadDistBox(c) : roadDist(c.x, c.z) - c.r;
      if (d < 1.4) bad.push({ kind: 'road', tag: c.tag, x: +c.x.toFixed(1), z: +c.z.toFixed(1), d: +d.toFixed(2) });
    }
  }
  return bad;
}
function boxDist(c, x, z) {
  const dx = x - c.x, dz = z - c.z, cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const qx = Math.max(Math.abs(lx) - c.hw, 0), qz = Math.max(Math.abs(lz) - c.hd, 0);
  return Math.hypot(qx, qz);
}
function minRoadDistBox(c) {
  let m = Infinity;
  const cs = Math.cos(c.rot || 0), sn = Math.sin(c.rot || 0);
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const lx = (c.hw * i) / 2, lz = (c.hd * j) / 2;
    const x = c.x + lx * cs + lz * sn, z = c.z - lx * sn + lz * cs;
    m = Math.min(m, roadDist(x, z));
  }
  return m;
}
function stats() {
  let meshes = 0, tris = 0;
  const per = {};
  for (const id in G.structures.places) {
    const g = G.structures.places[id].group;
    if (!g) continue;
    let m = 0, tr = 0;
    g.traverse((o) => { if (o.isMesh) { m++; const gg = o.geometry; tr += ((gg.index ? gg.index.count : gg.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1); } });
    per[id] = [m, Math.round(tr)]; meshes += m; tris += tr;
  }
  return { meshes, tris: Math.round(tris), per };
}
void ROADS; void STONE_LANTERNS; void GREAT_LANTERNS; void SKY_ISLES;
