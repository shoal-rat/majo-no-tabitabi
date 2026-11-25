// terrain — the land and the water (DESIGN §6.7). G.terrain, G.water.
//  * land: one BatchedMesh of quadtree chunks (terrain/lod.js), painted per fragment (terrain/shader.js);
//  * data textures shared with the water: height / footpath / river distance, tileable noise, and the scorch layer;
//  * 'terrain:deformed' rebuilds the touched chunks in the same frame and refreshes the height texture;
//  * 'terrain:scorch' paints burn / wet / frost marks that fade back over a few minutes;
//  * water.js: the sea and every pool below y = 0.
import * as THREE from 'three';
import { TerrainLOD } from './terrain/lod.js';
import { createTerrainMaterial } from './terrain/shader.js';
import { createDataTextureAsync, createNoiseTexture, refreshDataRect, ScorchLayer, bakeWallMask, dataHeightAt } from './terrain/textures.js';
import { createWater } from './water.js';
import { bakeDetail } from './terrain/detail.js';
import { createClutter } from './terrain/clutter.js';
import { createPaddies } from './terrain/paddies.js';

const _cam = new THREE.Vector3();

export const terrainSystem = {
  name: 'terrain',
  pausable: true,

  async init(G) {
    const data = await createDataTextureAsync(); // perf pass: bake cache + time slices (docs/api/perf.md)
    const noise = createNoiseTexture();
    const scorch = new ScorchLayer();
    // upload once up front, so later partial row updates land on an initialised texture
    for (const t of [data, noise, scorch.tex]) { try { G.renderer.initTexture(t); } catch (e) { G.reportError('terrain:initTexture', e); } }

    const q = G.quality?.name || 'high';
    // painterly material detail (grass strokes, earth, sand, gravel, rock, snow, paving, …) baked on the GPU
    let detail = null;
    try { const t0 = performance.now(); detail = bakeDetail(G.renderer, q === 'low' ? 256 : 512); detail.ms = performance.now() - t0; }
    catch (e) { G.reportError('terrain:detail', e); }
    const material = createTerrainMaterial({ data, noise, scorch: scorch.tex, detail, quality: q });
    const U = material.userData.uniforms;
    const K = q === 'low' ? 0.9 : q === 'med' ? 1.1 : 1.25;
    const lod = new TerrainLOD(material, { slots: q === 'low' ? 160 : 220, K });
    G.scene.add(lod.mesh);

    const water = createWater(G, { data, noise });
    G.water = water;

    let lastCam = null;
    const refineAround = (budget) => { lod.update(_cam.copy(G.camera.position), budget); U.trLodCam.value.copy(_cam); };

    const api = {
      mesh: lod.mesh, material, uniforms: U, lod, scorchLayer: scorch, dataTexture: data, noiseTexture: noise, detail,
      /** Ground height as the data texture holds it (2 m texels, half floats): what draped fx discs lie on. */
      dataHeightAt: (x, z) => dataHeightAt(data, x, z),
      /** ★ Re-sample the ground inside [x0,x1]×[z0,z1] (world metres): chunks in view are rebuilt now. */
      refresh(x0, x1, z0, z1) {
        if (x0 > x1) [x0, x1] = [x1, x0];
        if (z0 > z1) [z0, z1] = [z1, z0];
        refreshDataRect(data, x0, x1, z0, z1);
        lod.invalidate(x0, x1, z0, z1);
      },
      /** Paint a mark directly (same as emitting 'terrain:scorch'). kind: 'burn' | 'wet' | 'frost'. */
      scorch(x, z, r, kind = 'burn', strength = 1) {
        scorch.paint(x,z,r,kind,strength);
        if(kind==='burn') this.paddies.disturb(x,z,r,false);
      },
      /** Drain marks of `kind` inside r of (x, z) down to `level` (restoration). */
      unscorch(x, z, r, kind = 'burn', level = 0) { scorch.erase?.(x, z, r, kind, level); },
      /** Mark strength 0..1 currently at (x,z). */
      scorchAt(x, z, kind = 'burn') { return scorch.at(x, z, kind); },
      /** Build every chunk the current camera needs right now (after a teleport or a cut). */
      settle() { refineAround(Infinity); },
      /** { drawn, built, builds, buildMs, triangles, pending } of the land mesh. */
      stats() { return { ...lod.stats }; },
      /** Debug: show the baked detail layers as a 4×3 sheet in front of the camera (true / false). */
      previewDetail(on = true) {
        if (!detail) return false;
        if (!this._pv) {
          const g = new THREE.Group(); g.name = 'terrain:detailPreview';
          const mat = (l, n) => new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false, toneMapped: false,
            uniforms: { t: { value: n ? detail.normal : detail.albedo }, l: { value: l } },
            vertexShader: 'out vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: 'precision highp sampler2DArray; uniform sampler2DArray t; uniform float l; in vec2 vUv; out vec4 o; void main(){ vec4 c = texture(t, vec3(vUv * 2.0, l)); o = vec4(' + (n ? 'c.rgb' : 'c.rgb * 2.0 * vec3(0.45, 0.5, 0.35) + vec3(c.a * 0.0)') + ', 1.0); }',
          });
          for (let l = 0; l < detail.layers; l++) for (let n = 0; n < 2; n++) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), mat(l, n));
            m.position.set(-0.78 + (l % 6) * 0.26 + n * 0.0, 0.4 - Math.floor(l / 6) * 0.27 - n * 0.54, -1.2);
            m.renderOrder = 1e6; m.frustumCulled = false; g.add(m);
          }
          this._pv = g;
        }
        if (on) G.camera.add(this._pv); else G.camera.remove(this._pv);
        if (on && !G.camera.parent) G.scene.add(G.camera);
        return true;
      },
    };
    G.terrain = api;
    api.paddies = createPaddies(G,q);

    // a save being loaded replays every scar at once: collect those rectangles and refresh them together next update
    // (one sweep over the chunks instead of rebuilding the chunks in view once per scar — 240 scars went from ~1.3 s)
    const pending = [];
    const flushPending = () => {
      if (!pending.length) return;
      // merge overlapping rectangles first (a cluster of scars re-samples its texels once)
      for (let a = 0; a < pending.length; a++) {
        const A = pending[a];
        for (let b = pending.length - 1; b > a; b--) {
          const B = pending[b];
          if (B[0] > A[1] || B[1] < A[0] || B[2] > A[3] || B[3] < A[2]) continue;
          A[0] = Math.min(A[0], B[0]); A[1] = Math.max(A[1], B[1]); A[2] = Math.min(A[2], B[2]); A[3] = Math.max(A[3], B[3]);
          pending.splice(b, 1); b = pending.length;
        }
      }
      let ux0 = Infinity, ux1 = -Infinity, uz0 = Infinity, uz1 = -Infinity;
      for (const r of pending) { refreshDataRect(data, r[0], r[1], r[2], r[3]); ux0 = Math.min(ux0, r[0]); ux1 = Math.max(ux1, r[1]); uz0 = Math.min(uz0, r[2]); uz1 = Math.max(uz1, r[3]); }
      for (let s = 0; s < lod.slots; s++) {
        const n = lod.slotNode[s];
        if (!n || n.x0 > ux1 + 2 || n.x0 + n.size < ux0 - 2 || n.z0 > uz1 + 2 || n.z0 + n.size < uz0 - 2) continue;
        let hit = false;
        for (const r of pending) if (!(n.x0 > r[1] + 2 || n.x0 + n.size < r[0] - 2 || n.z0 > r[3] + 2 || n.z0 + n.size < r[2] - 2)) { hit = true; break; }
        if (!hit) continue;
        n.dirty = true;
        if (n.drawTag === lod.tag) lod._build(n);
      }
      pending.length = 0;
    };
    this._flushPending = flushPending;
    G.events.on('terrain:deformed', (e) => {
      try {
        if ((e.kind === 'restoreSpell' || e.kind === 'resetSpell') && pending.length < 4096) pending.push([e.x0 - 2, e.x1 + 2, e.z0 - 2, e.z1 + 2]);
        else { flushPending(); api.refresh(e.x0 - 2, e.x1 + 2, e.z0 - 2, e.z1 + 2); }
        if(e.kind==='trialLake') {water.onTrialLakeChange?.(e);return;}
        if(e.kind==='resetSpell')return;
        api.paddies.disturb(e.x,e.z,e.r,true);
        // a freshly dug crater leaves a scorched, broken rim (a crater replayed from a save is old: its rim has healed)
        if (e.amount < 0 && e.kind === 'spell') scorch.paint(e.x, e.z, e.r * 0.85, 'burn', Math.min(0.85, 0.6 + -e.amount * 0.06));
      } catch (err) { G.reportError('terrain:deformed', err); }
    });
    G.events.on('terrain:scorch', (e) => {
      try { if (e && Number.isFinite(e.x) && Number.isFinite(e.z)) api.scorch(e.x,e.z,e.r || 2,e.kind || 'burn',e.strength ?? 1); }
      catch (err) { G.reportError('terrain:scorch', err); }
    });

    this._G = G; this._lod = lod; this._U = U; this._scorch = scorch; this._water = water;
    this._refine = (b) => {
      refineAround(b);
      lastCam = lastCam || new THREE.Vector3();
      lastCam.copy(G.camera.position);
    };
    this._lastCam = () => lastCam;
    this._refine(Infinity);
  },

  start() {
    try { this._flushPending?.(); } catch (e) { this._G?.reportError('terrain:flush', e); }
    this._refine?.(Infinity);
    // wall shade (damp ground, leaf drifts along building walls): once, after every builder has registered its walls
    const G = this._G;
    if (G && !this._wallMask && G.terrain?.dataTexture) {
      try {
        const W = G.world;
        G.terrain.wallSources = bakeWallMask(G.terrain.dataTexture, W.colliders || [], W.platforms || [], W.baseHeightAt);
        this._wallMask = true;
      } catch (e) { G.reportError('terrain:wallmask', e); }
    }
  },

  update(dt) {
    const U = this._U; if (!U) return;
    try { this._flushPending?.(); } catch (e) { this._G?.reportError('terrain:flush', e); }
    U.trTime.value += dt;
    // marks heal on the same clock as G.state.playTime (only while she plays), so a reload picks the fade up exactly
    if (this._G?.mode === 'play') this._scorch.tick(dt);
    this._water.update(dt);
  },

  lateUpdate(dt) {
    if (!this._lod) return;
    const G = this._G, last = this._lastCam();
    // ground clutter: created once the grass field exists (flora initialises after the terrain)
    try {
      if (this._clutter === undefined && G.flora) {
        this._clutter = G.flora.grass ? createClutter(G, G.flora.grass, G.quality?.name || 'high') : null;
        G.terrain.clutter = this._clutter;
      }
      if (this._clutter) {
        const cam = G.camera, fc = G.debug?.fixedCam;
        if (fc) { cam.position.copy(fc.pos); cam.lookAt(fc.look); cam.updateMatrixWorld(); }
        this._clutter.update(dt || 0, cam);
      }
    } catch (e) { G.reportError('terrain:clutter', e); this._clutter = null; }
    G.terrain.paddies.update(dt||0,G.camera.position);
    // camera cut / teleport: refine fully this frame instead of showing coarse land for a while
    const jump = last ? last.distanceTo(G.camera.position) : Infinity;
    try { this._refine(jump > 60 ? 40 : 3); } catch (e) { G.reportError('terrain:lod', e); }
  },
};
