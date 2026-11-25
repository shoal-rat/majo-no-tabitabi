// Shader warm-up (docs/api/perf.md, "Hitches"). A program that is first needed mid-play costs 25–60 ms in the frame
// that draws it (ANGLE compile + link). Two cures, both time-sliced so no single frame pays much:
//   warmScene(G)              — at game start: compile the programs of EVERY object in the scene, hidden ones too
//                               (far LODs, ground clutter rings, lit / unlit variants that are hidden right now).
//   warmCreatures(G, list)    — create one pooled instance per creature kind (same options its spawner will use),
//                               compile it and return it to the pool: the first spawn then reuses it (no clone, no
//                               texture upload, no compile). list = [[assetId, opts], ...]
// Nothing here changes what is drawn or simulated; it only moves work to the first quiet frames after start.
import { acquireCreature } from '../actors/creature.js';
import { slice } from '../core/boottime.js';

// one painted frame while the page is visible. A background tab gets no animation frames at all, so the boot used to
// stop here until the player came back to the tab (players asked whether the game can load in the background): hidden,
// it goes on at once (a message task), and a page hidden while it waits is let go by the visibility change.
const nextFrame = () => (typeof document !== 'undefined' && document.visibilityState !== 'visible'
  ? slice(0) || Promise.resolve()
  : new Promise((r) => {
    let done = false;
    const go = () => { if (done) return; done = true; document.removeEventListener?.('visibilitychange', go); r(); };
    requestAnimationFrame(go);
    document.addEventListener?.('visibilitychange', go);
  }));

/**
 * Compile every material of the scene, visible or not. Boot pass (docs/api/perf.md "Boot and loading"): compiled for
 * an off-screen target, which is what the scene pass draws into — compiling against the canvas (as before) made the
 * tone-mapped sRGB canvas variant of ~100 programs that are never drawn — and with compileAsync, so the main thread
 * does not wait for the links. Programs compiled at boot (compileWorld) are found in the cache and cost nothing.
 */
export function warmScene(G) {
  const r = G.renderer, scene = G.scene;
  if (!r?.compile || !scene) return 0;
  const hidden = [];
  scene.traverse((o) => { if (o.visible === false) { hidden.push(o); o.visible = true; } });
  let n = 0;
  const boot = G.params?.perf !== '0';
  const rt = boot ? warmTarget(G) : null, prev = r.getRenderTarget();
  try {
    if (rt) r.setRenderTarget(rt);
    if (boot && r.compileAsync) r.compileAsync(scene, G.camera).catch?.(() => {});
    else n = r.compile(scene, G.camera)?.size ?? 0;
  } catch (e) { G.reportError?.('warmup:scene', e); }
  finally { for (const o of hidden) o.visible = false; if (rt) r.setRenderTarget(prev); }
  return n;
}

let _warmRT = null;
function warmTarget(G) {
  if (!_warmRT) _warmRT = new G.THREE.WebGLRenderTarget(4, 4, { type: G.THREE.HalfFloatType });
  return _warmRT;
}

/** Pre-build pooled creatures one per frame; each is compiled against the live scene's lights, then pooled. */
export async function warmCreatures(G, list) {
  const r = G.renderer;
  for (const [asset, opts] of list) {
    await nextFrame();
    if (G.mode !== 'play') continue;
    try {
      const c = acquireCreature(asset, opts);
      const root = c.group || c.root || null;
      if (root && r?.compile) {
        const was = root.visible; root.visible = true;
        const rt = G.params?.perf !== '0' ? warmTarget(G) : null, prev = r.getRenderTarget();
        try { if (rt) r.setRenderTarget(rt); r.compile(root, G.camera, G.scene); } finally { root.visible = was; if (rt) r.setRenderTarget(prev); }
      }
      c.release();
    } catch (e) { G.reportError?.('warmup:creature', e); }
  }
}

/**
 * Boot (docs/api/perf.md "Boot and loading"): compile every program the first frames need WITHOUT blocking the main
 * thread (renderer.compileAsync, KHR_parallel_shader_compile), while the title is on screen. Scene materials are
 * compiled for an off-screen target (the scene pass and the water reflection draw into targets, which is a different
 * program variant from the canvas), post-processing materials for both a target and the canvas. On a cold driver
 * cache (first launch of a new build) this is ~10 s of GPU-process work that used to freeze the first frame.
 * What it cannot reach (shadow-map depth variants made inside three) still compiles in the first world frame.
 */
export async function compileWorld(G) {
  const r = G.renderer, scene = G.scene, cam = G.camera;
  if (!r?.compileAsync || !scene || !cam) return 0;
  const THREE = G.THREE;
  const rt = warmTarget(G);
  const prev = r.getRenderTarget();
  const waits = [];
  let n = 0;
  try {
    r.setRenderTarget(rt);
    try { waits.push(r.compileAsync(scene, cam)); } catch (e) { G.reportError?.('warmup:compile', e); }
    // post-processing passes: their materials, one quad each, for a target and for the canvas
    const mats = new Set();
    const take = (v) => { if (v?.isMaterial) mats.add(v); else if (Array.isArray(v)) for (const x of v) if (x?.isMaterial) mats.add(x); };
    const comp = G.post?.composer;
    for (const p of comp ? [...comp.passes, comp.copyPass] : []) {
      if (!p) continue;
      for (const k of Object.keys(p)) {
        const v = p[k]; take(v);
        if (v && typeof v === 'object' && !v.isMaterial && !v.isTexture && !Array.isArray(v)) for (const k2 of Object.keys(v)) take(v[k2]);
      }
    }
    if (mats.size) {
      const ps = new THREE.Scene(), geo = new THREE.PlaneGeometry(2, 2);
      for (const m of mats) { const q = new THREE.Mesh(geo, m); q.frustumCulled = false; ps.add(q); }
      const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      try { waits.push(r.compileAsync(ps, oc)); } catch (e) { G.reportError?.('warmup:post', e); }
      r.setRenderTarget(null);
      try { waits.push(r.compileAsync(ps, oc)); } catch (e) { G.reportError?.('warmup:post', e); }
      n += mats.size;
    }
  } finally { r.setRenderTarget(prev); }
  await Promise.all(waits);
  return n;
}

/**
 * Boot (docs/api/perf.md "Boot and loading"): DRAW every material of the scene once, a few per frame, behind the boot
 * backdrop, through the real frame path (G.renderFrame: shadow pass, water mirror, MSAA scene target, post).
 * Why drawing and not compileAsync: on a cold driver cache (first launch of a new build, measured in the Electron
 * shell) ANGLE / Metal builds the GPU pipeline at the first DRAW — programs linked by compileAsync were built again
 * at the first frame (cold: compileAsync 13.5 s + first frame 12.4 s, vs 12.9 s for the first frame alone). Drawing
 * in small batches builds exactly what the game frame needs, and the GPU process gets a frame in between, so the
 * title stays live. Batches adapt to the measured frame gap (target `gapMs`).
 * Mechanism: the camera sees only layer 31 for the duration; lights and each batch's representatives are put on it
 * (hidden objects shown, frustum culling off), then everything is put back exactly. Nothing is simulated.
 * One representative per (materials, object kind, geometry attribute set) — what decides the program variant.
 * onProgress(frac) is called after each batch.
 */
export async function warmDraw(G, onProgress, { gapMs = 50 } = {}) {
  const r = G.renderer, scene = G.scene, cam = G.camera;
  if (!r || !scene || !cam || typeof G.renderFrame !== 'function') return { groups: 0, frames: 0 };
  const L = 31;
  const hidden = [], lights = [], reps = new Map();
  scene.traverse((o) => {
    if (o.visible === false) hidden.push(o);
    if (o.isLight) { lights.push(o); return; }
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g = o.geometry;
    const key = mats.map((m) => m && m.uuid).join('+') + '|' + (o.isSkinnedMesh ? 's' : '') + (o.isInstancedMesh ? 'i' : '')
      + (o.isBatchedMesh ? 'b' : '') + (o.instanceColor ? 'c' : '') + (o.morphTargetInfluences ? 'm' : '')
      + '|' + (g ? Object.keys(g.attributes).sort().join(',') + ';' + Object.keys(g.morphAttributes || {}).join(',') : '');
    if (!reps.has(key)) reps.set(key, o);
  });
  const list = [...reps.values()];
  const prevMask = cam.layers.mask;
  const lightHad = lights.map((l) => l.layers.isEnabled(L));
  const shadowCams = lights.map((l) => l.shadow?.camera).filter(Boolean), shadowMasks = shadowCams.map((c) => c.layers.mask);
  const viewOnly = () => { cam.layers.set(L); for (const c of shadowCams) c.layers.set(L); };
  const viewBack = () => { cam.layers.mask = prevMask; shadowCams.forEach((c, j) => { c.layers.mask = shadowMasks[j]; }); };
  const shown = [];
  // draw-call pass: flora batches drop castShadow while no caster is in range (userData.mvCast = the real setting); the
  // warm-up draws them as casters anyway so their depth programs are built here, not in play
  // sculpted objects' near LOD0 (world/builders/sculpt.js) is an InstancedMesh with no instance until the camera comes
  // close: drawn here with one (count restored after), so its program and depth variants are built at boot too
  const restoreBatch = () => { for (const [o, fc, had, cs, cnt] of shown) { o.frustumCulled = fc; o.castShadow = cs; if (cnt != null) o.count = cnt; if (!had) o.layers.disable(L); } shown.length = 0; };
  let frames = 0, k = 2, i = -1, maxGap = 0, cap = 64;
  const top = []; // the slowest batches (frame gap, first object names) — boot report
  for (const o of hidden) o.visible = true;
  for (const l of lights) l.layers.enable(L);
  try {
    let last = performance.now();
    { await nextFrame(); const now = performance.now(); top.push([Math.round(now - last), 'drain']); last = now; } // GPU work queued by the bakes
    // empty frames first (lights only): sky, shadow and the post chain — one more post pass per frame, so a cold
    // driver cache builds the heavy post pipelines (AO, bloom, SMAA) over several frames, not in one
    const passes = G.post?.composer?.passes || [], was = passes.map((p) => p.enabled);
    try {
      const sp = passes[0], ao = sp?.ao;
      const steps = []; // [passes on, AO off for this frame]
      if (ao) steps.push([1, true]);
      for (let n = 1; n <= Math.max(1, passes.length); n++) if (!passes.length || was[n - 1]) steps.push([n, false]);
      for (const [n, noAO] of steps) {
        passes.forEach((p, j) => { p.enabled = was[j] && j < n; });
        if (noAO) sp.ao = false;
        viewOnly();
        const t0 = performance.now(), p0 = r.info.programs?.length || 0;
        try { r.shadowMap.needsUpdate = true; G.renderFrame(); } catch (e) { G.reportError?.('warmup:draw', e); }
        const js = Math.round(performance.now() - t0), np = (r.info.programs?.length || 0) - p0;
        viewBack();
        if (noAO) sp.ao = ao;
        frames++;
        await nextFrame();
        const now = performance.now(), gap = now - last; last = now;
        if (gap > gapMs * 3) cap = 12;
        top.push([Math.round(gap), 'post:' + n + (noAO ? '-ao' : '') + ' js' + js + ' new' + np + ' ' + (r.info.programs || []).slice(p0).map((q) => q.name).join(',').slice(0, 160)]); top.sort((a, b) => b[0] - a[0]); top.length = Math.min(top.length, 5);
      }
    } finally { passes.forEach((p, j) => { p.enabled = was[j]; }); }
    i = 0;
    while (i < list.length) {
      // i = -1: an empty frame first (lights only) — the sky, shadow and post programs / pipelines
      viewOnly();
      const end = i < 0 ? 0 : Math.min(list.length, i + k);
      for (let j = Math.max(0, i); j < end; j++) {
        const o = list[j];
        shown.push([o, o.frustumCulled, o.layers.isEnabled(L), o.castShadow, o.isInstancedMesh && o.count === 0 ? 0 : null]);
        o.frustumCulled = false; o.layers.enable(L);
        if (o.isInstancedMesh && o.count === 0 && /^sculpt:/.test(o.name || '')) o.count = 1;
        if (o.userData.mvCast) o.castShadow = true;
      }
      const label = i < 0 ? 'empty' : (end - i) + ': ' + list.slice(i, Math.min(end, i + 3)).map((o) => (o.material?.name || o.material?.type || '?') + '/' + (o.name || o.type)).join(' ');
      try { r.shadowMap.needsUpdate = true; G.renderFrame(); } catch (e) { G.reportError?.('warmup:draw', e); }
      restoreBatch();
      viewBack();
      i = i < 0 ? 0 : end;
      frames++;
      onProgress?.(Math.min(1, i / Math.max(1, list.length)));
      await nextFrame();
      const now = performance.now(), gap = now - last; last = now;
      if (frames > 1) maxGap = Math.max(maxGap, gap);
      top.push([Math.round(gap), label]); top.sort((a, b) => b[0] - a[0]); top.length = Math.min(top.length, 5);
      if (gap > gapMs * 3) cap = 12; // a cold driver cache: small batches from here on
      k = Math.max(1, Math.min(cap, Math.round(k * Math.min(2, gapMs / Math.max(1, gap)))));
    }
  } finally {
    restoreBatch();
    viewBack();
    lights.forEach((l, j) => { if (!lightHad[j]) l.layers.disable(L); });
    for (const o of hidden) o.visible = false;
  }
  return { groups: list.length, frames, maxGap: Math.round(maxGap), top };
}
