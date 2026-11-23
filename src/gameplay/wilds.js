// G.wilds — the discovery loop of the open country (activities round, 2026-11-22). Data: src/data/wilds.js, words:
// src/locales/zh-CN/gameplay.wilds.js. Built on Nintendo-style open-world methods, with our own content:
//   * 迷星 (stray stars): small, frequent rewards where the eye already goes (landmark tops, hilltops, under a bridge,
//     in a dolmen's hollow). A far glint (one point sprite each, depth-tested) pulls from hundreds of metres away; every
//     STAR_STEP found pays out and reveals a line of the careless witch's note.
//   * landmark discovery: first visit → a toast (a banner for the large ones), a map pin, a line in the journal page.
//   * lookouts: cairns (add a stone) and high perches mark the stars in sight on the map.
//   * puzzles (wilds-puzzles.js) and ring courses (wilds-rings.js) at the landmarks.
//   * 残页试炼 (wilds-pages.js): six sealed sites where the charged (tier-2) form of each element is won from a guardian.
// State: G.state.wilds (defaults in core/save.js defaultState; ensure() fills old saves). Called from gameplay.js.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { glow, toon } from '../core/mats.js';
import { gemStar } from '../props/shapes.js';
import { LANDMARKS, LANDMARK_BY_ID, landmarkDist } from '../data/landmarks.js';
import { STARS, PEAK_STARS, STAR_STEP, STAR_REWARDS, STAR_DUST, FIND_DUST, CAIRN_DUST, CAIRNS, CAIRN_REACH, PERCHES, WILD_REGIONS, regionOf, PUZZLES, RINGS } from '../data/wilds.js';
import { poolOf } from '../world/landforms/pools.js';
import { makeInstanced, sfx, toast } from './common.js';
import { createWildPuzzles } from './wilds-puzzles.js';
import { createWildRings } from './wilds-rings.js';
import { createWildPages } from './wilds-pages.js';

const tt = (k, p) => t('gameplay.wilds.' + k, p);
const lmName = (id) => (has('gameplay.wilds.lm.' + id) ? tt('lm.' + id) : id);
const STATE_KEYS = ['lm', 'stars', 'sighted', 'puzzles', 'rings', 'cairns', 'perches', 'seen', 'pages'];

/** G.state.wilds, filled with defaults (old saves). */
export function wstate() {
  const st = G.state;
  if (!st) return null;
  if (!st.wilds || typeof st.wilds !== 'object') st.wilds = {};
  const w = st.wilds;
  for (const k of STATE_KEYS) if (!w[k] || typeof w[k] !== 'object' || Array.isArray(w[k])) w[k] = {};
  if (typeof w.steps !== 'number') w.steps = 0;
  return w;
}

// ---- placement -------------------------------------------------------------------------------------------------------
const siteOf = (id) => G.structures?.places?.['lm_' + id]?.site || null;
function localXZ(l, x, z) {
  const s = siteOf(l.id);
  if (s) return [s.wx(x, z), s.wz(x, z)];
  const c = Math.cos(l.angle || 0), sn = Math.sin(l.angle || 0);
  return [l.x + x * c + z * sn, l.z - x * sn + z * c];
}
/** Resolve a placement record of landmark `lmId` (see data/wilds.js) to a world position. */
export function resolveAt(lmId, rec, out = new THREE.Vector3()) {
  const W = G.world, l = LANDMARK_BY_ID[lmId];
  if (!l || !W) return out.set(0, -999, 0);
  let [x, z] = localXZ(l, rec.x || 0, rec.z || 0);
  const [mode, dy = 0] = rec.y || ['h', 0];
  let y;
  if (mode === 'h0') y = W.heightAt(l.x, l.z) + dy;
  else if (mode === 'top') y = W.groundAt(x, z) + dy;
  else if (mode === 'abs') y = dy;
  else if (mode === 'pool' || mode === 'lip') {
    const p = poolOf(W, l);
    if (!p) y = W.heightAt(x, z) + dy;
    else if (mode === 'pool') { x = p.x; z = p.z; y = p.level + dy; }
    else {
      // world/landforms/setpieces.js: the crag lip sits 4 m behind the landmark point, 3 m under the crag top
      const dx = p.x - l.x, dz = p.z - l.z, dl = Math.hypot(dx, dz) || 1;
      x = l.x - dx / dl * 4; z = l.z - dz / dl * 4;
      y = Math.max(W.heightAt(l.x, l.z), p.level) + 21 + dy;
    }
  } else if (mode === 'clear') {
    // climb out of whatever stands here (tor blocks, a fallen trunk, a cart): first free height, then dy above it
    y = W.heightAt(x, z);
    const q = out.set(x, y, z);
    for (let i = 0; i < 90; i++) { q.set(x, y, z); if (!W.resolveCollisions?.(q, 0.25, 0.4)) break; y += 0.5; }
    y += dy;
  } else y = W.heightAt(x, z) + dy;
  return out.set(x, y, z);
}

// ---- the far glint: one point sprite per uncollected star (one draw) ---------------------------------------------------
function glintMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `
      attribute float aPhase; attribute float aOn;
      uniform float uTime; uniform float uPx;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = -mv.z;
        // invisible up close (the star itself shows), strongest 40..420 m, gone by 900 m
        float near = smoothstep(14.0, 40.0, d), far = 1.0 - smoothstep(420.0, 900.0, d);
        float tw = 0.62 + 0.38 * sin(uTime * 2.3 + aPhase) * sin(uTime * 0.71 + aPhase * 1.7);
        vA = aOn * near * far * tw;
        gl_PointSize = (12.0 + 9.0 * tw) * uPx * step(0.001, vA);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        float cross = max(1.0 - abs(p.x) * 7.0, 0.0) * (1.0 - abs(p.y)) + max(1.0 - abs(p.y) * 7.0, 0.0) * (1.0 - abs(p.x));
        float core = exp(-r * r * 9.0);
        float a = (core * 0.9 + cross * 0.75) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * a * 1.25, a);
      }`,
  });
}

export function createWilds() {
  const api = {};
  const stars = [];            // { id, lm|null, pos, region, slot, phase, got }
  const lms = [];              // { l, region, scale }
  let inst = null, points = null, pAttr = null, onAttr = null;
  let PZ = null, RC = null, PG = null;
  let scanT = 0, perchT = 0, ready = false, time = 0;
  const _p = new THREE.Vector3();

  // ---- build -------------------------------------------------------------------------------------------------------
  function buildStars() {
    for (const s of STARS) {
      const l = LANDMARK_BY_ID[s.lm]; if (!l) continue;
      const pos = resolveAt(s.lm, s, new THREE.Vector3());
      stars.push({ id: s.id, lm: s.lm, pos, region: regionOf(l.x, l.z), slot: stars.length, phase: Math.random() * 6.28, got: false });
    }
    for (const s of PEAK_STARS) {
      const pos = new THREE.Vector3(s.x, G.world.heightAt(s.x, s.z) + (s.dy ?? 1.6), s.z);
      stars.push({ id: s.id, lm: null, pos, region: regionOf(s.x, s.z), slot: stars.length, phase: Math.random() * 6.28, got: false });
    }
    // near look: a pale silver-blue gem star in a lilac halo (星屑 is gold, so the two never read alike)
    const proto = new THREE.Group();
    const gem = gemStar(0.42, 0.18, 0.15, toon(0xd8e6ff, { emissive: 0x30406a, surface: 'none', look: { spec: 0.9, specPower: 64, rim: 1.0, wrap: 0.6 } }));
    const halo = gemStar(0.54, 0.26, 0.2, glow(0xb8c8ff, 1.4, { side: THREE.BackSide }));
    const core = gemStar(0.2, 0.1, 0.17, glow(0xf4f8ff, 2.2));
    for (const m of [gem, halo, core]) m.castShadow = false;
    proto.add(gem, halo, core);
    inst = makeInstanced(proto, stars.length, { castShadow: false, name: 'wilds_stars' });
    G.scene.add(inst.group);
    // far glints
    const n = stars.length, pos = new Float32Array(n * 3), ph = new Float32Array(n), on = new Float32Array(n);
    stars.forEach((s, i) => { pos[i * 3] = s.pos.x; pos[i * 3 + 1] = s.pos.y + 0.3; pos[i * 3 + 2] = s.pos.z; ph[i] = s.phase; on[i] = 1; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    onAttr = new THREE.BufferAttribute(on, 1); onAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOn', onAttr);
    pAttr = g.attributes.position;
    points = new THREE.Points(g, glintMaterial());
    points.name = 'wilds_glints'; points.frustumCulled = false; points.renderOrder = 4;
    G.scene.add(points);
  }
  function showStar(s, on) {
    s.got = !on;
    if (!on) inst.hide(s.slot); else inst.set(s.slot, s.pos, 0, 1);
    onAttr.array[s.slot] = on ? 1 : 0; onAttr.needsUpdate = true;
  }

  // ---- stars -------------------------------------------------------------------------------------------------------
  const starTotal = () => stars.length;
  const starCount = () => { const w = wstate(); return w ? stars.reduce((n, s) => n + (w.stars[s.id] ? 1 : 0), 0) : 0; };
  function collectStar(s, o = {}) {
    const w = wstate(); if (!w || w.stars[s.id]) return false;
    w.stars[s.id] = 1;
    showStar(s, false);
    const n = starCount(), of = starTotal();
    if (!o.silent) {
      G.fx?.burst?.('pickup', s.pos);
      G.fx?.burst?.('moon_motes', s.pos);
      sfx('sparkle'); sfx('ui_chime', { vol: 0.5 });
      toast(tt('toast.star', { n, of }), { icon: 'star', dur: 2.4 });
    }
    if (STAR_DUST) G.gameplay?.spawnPickup?.('stardust', s.pos, STAR_DUST);
    G.events.emit('wilds:star', { id: s.id, n, of });
    // every STAR_STEP: the stars recognise each other
    while (w.steps < Math.floor(n / STAR_STEP) && w.steps < STAR_REWARDS.length) {
      const k = w.steps++;
      const r = STAR_REWARDS[k];
      if (!o.silent) setTimeout(() => toast(tt('toast.starStep', { line: tt('note.' + (k + 1)) }), { icon: 'journal', dur: 6 }), 900);
      grant({ dust: r.dust, upgrade: r.upgrade }, G.player ? G.player.pos : s.pos, o);
    }
    api.markersDirty = true;
    return true;
  }

  /** Pay a loot record { dust, items: { id: n }, upgrade } at pos (pickups hop out and fly to her). */
  function grant(loot, pos, o = {}) {
    if (!loot) return;
    const at = (pos && pos.clone ? pos.clone() : new THREE.Vector3()).setY((pos?.y || 0) + 0.6);
    if (loot.dust) G.gameplay?.spawnPickup?.('stardust', at, loot.dust);
    if (loot.items) for (const id in loot.items) G.gameplay?.spawnPickup?.(id, at, loot.items[id]);
    if (loot.upgrade) {
      const lv = G.gameplay?.applyUpgrade?.(loot.upgrade, 1) || 0;
      if (lv) { if (!o.silent) setTimeout(() => toast(tt('toast.upgrade.' + loot.upgrade, { lv }), { icon: loot.upgrade === 'hp' ? 'heart' : loot.upgrade === 'mana' ? 'spirit' : loot.upgrade, dur: 4.5 }), 1600); }
      else G.gameplay?.spawnPickup?.('stardust', at, 60);   // already at the top: its worth in stardust
    }
  }

  // ---- landmarks ---------------------------------------------------------------------------------------------------
  function discover(e, o = {}) {
    const w = wstate(); if (!w || w.lm[e.l.id]) return false;
    w.lm[e.l.id] = 1;
    if (!o.silent) {
      const name = lmName(e.l.id);
      if (e.scale === 'large' && G.ui?.banner && !G.ui?.debug?.bossOn) G.ui.banner(name, has('gameplay.wilds.sub.' + e.l.id) ? tt('sub.' + e.l.id) : tt('region.' + e.region));
      else toast(tt('toast.found', { name }), { icon: 'pin', dur: 3 });
      sfx('ui_page', { vol: 0.5 });
      if (FIND_DUST) G.gameplay?.spawnPickup?.('stardust', G.player.pos.clone().setY(G.player.pos.y + 1.4), FIND_DUST);
    }
    G.events.emit('wilds:found', { id: e.l.id, region: e.region });
    api.markersDirty = true;
    return true;
  }

  // ---- lookouts ----------------------------------------------------------------------------------------------------
  function sightFrom(pos, reach, o = {}) {
    const w = wstate(); if (!w) return 0;
    let n = 0;
    for (const s of stars) {
      if (w.stars[s.id] || w.sighted[s.id]) continue;
      if (Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z) > reach) continue;
      w.sighted[s.id] = 1; n++;
    }
    if (!o.silent) toast(n ? tt('toast.sighted', { n }) : tt('toast.sightedNone'), { icon: 'eye', dur: 3.6 });
    api.markersDirty = true;
    return n;
  }
  function addCairns() {
    for (const id of CAIRNS) {
      const l = LANDMARK_BY_ID[id]; if (!l) continue;
      const top = resolveAt(id, { x: 0, z: 0, y: ['h0', 0] });
      G.interact?.add({
        pos: top, radius: 2.8, priority: 1,
        enabled: () => { const w = wstate(); return !!w && !w.cairns[id]; },
        prompt: () => tt('prompt.cairn'),
        onInteract: () => cairnStone(id),
      });
    }
  }
  function cairnStone(id, o = {}) {
    const w = wstate(); if (!w || w.cairns[id]) return false;
    const l = LANDMARK_BY_ID[id];
    w.cairns[id] = 1;
    G.player?.playAction?.('interact', { once: true });
    sfx('rock_fall', { vol: 0.35 });
    if (CAIRN_DUST) G.gameplay?.spawnPickup?.('stardust', new THREE.Vector3(l.x, G.world.heightAt(l.x, l.z) + 2.6, l.z), CAIRN_DUST);
    if (!o.silent) toast(tt('toast.cairn'), { icon: 'eye', dur: 2.6 });
    setTimeout(() => sightFrom(new THREE.Vector3(l.x, 0, l.z), CAIRN_REACH, o), o.silent ? 0 : 1400);
    return true;
  }
  function checkPerches() {
    const P = G.player, w = wstate(); if (!P || !w) return;
    for (const pv of PERCHES) {
      if (w.perches[pv.id]) continue;
      const l = LANDMARK_BY_ID[pv.lm]; if (!l) continue;
      const d = landmarkDist(l, P.pos.x, P.pos.z);
      if (d > (pv.r || 7)) continue;
      if (P.pos.y - G.world.heightAt(P.pos.x, P.pos.z) < pv.above && P.pos.y - G.world.heightAt(l.x, l.z) < pv.above) continue;
      w.perches[pv.id] = 1;
      sightFrom(P.pos, pv.reach);
    }
  }

  // ---- providers ---------------------------------------------------------------------------------------------------
  function markers() {
    const w = wstate(); if (!w) return [];
    const out = [];
    for (const e of lms) if (w.lm[e.l.id]) out.push({ x: e.l.x, z: e.l.z, icon: 'pin', label: e.scale === 'small' ? '' : lmName(e.l.id), kind: 'place', color: '#9b8a6a' });
    for (const s of stars) if (w.sighted[s.id] && !w.stars[s.id]) out.push({ x: s.pos.x, z: s.pos.z, icon: 'star', label: '', kind: 'collectible', color: '#b9c8ff' });
    try { PZ?.markers(out); RC?.markers(out); PG?.markers(out); } catch (e) { G.reportError('wilds:markers', e); }
    return out;
  }
  /** The journal page (ui/wilds-page.js): stars + revealed note lines, one entry per region, the ring courses. */
  function journal() {
    const w = wstate(); if (!w) return null;
    const regions = WILD_REGIONS.map((id) => ({ id, name: tt('region.' + id), desc: tt('regionDesc.' + id), found: 0, of: 0, stars: 0, starsOf: 0, chests: 0, chestsOf: 0, places: [] }));
    const byId = Object.fromEntries(regions.map((r) => [r.id, r]));
    for (const e of lms) { const r = byId[e.region]; r.of++; if (w.lm[e.l.id]) { r.found++; r.places.push({ id: e.l.id, name: lmName(e.l.id), scale: e.scale }); } }
    if (PG) for (const r of regions) r.places.push(...PG.places(r.id));
    for (const s of stars) { const r = byId[s.region]; r.starsOf++; if (w.stars[s.id]) r.stars++; }
    for (const p of PUZZLES) { const l = LANDMARK_BY_ID[p.lm]; if (!l) continue; const r = byId[regionOf(l.x, l.z)]; r.chestsOf++; if (w.puzzles[p.id] === 'open') r.chests++; }
    const lines = [];
    for (let i = 1; i <= Math.min(w.steps, STAR_REWARDS.length); i++) lines.push(tt('note.' + i));
    return {
      stars: { n: starCount(), of: starTotal(), lines, step: STAR_STEP, next: Math.min(STAR_REWARDS.length, w.steps + 1) * STAR_STEP },
      regions,
      rings: RC ? RC.journal() : [],
      found: Object.keys(w.lm).length, foundOf: lms.length,
    };
  }

  // ---- system ------------------------------------------------------------------------------------------------------
  Object.defineProperties(api, Object.getOwnPropertyDescriptors({
    markersDirty: true,
    get ready() { return ready; },
    init() {
      for (const l of LANDMARKS) lms.push({ l, region: regionOf(l.x, l.z), scale: l.scale });
      buildStars();
      addCairns();
      PZ = createWildPuzzles({ resolveAt, grant, wstate, lmName, tt });
      RC = createWildRings({ resolveAt, wstate, lmName, tt });
      PG = createWildPages({ wstate, tt });
      try { PZ.init(); } catch (e) { G.reportError('wilds:puzzles', e); }
      try { RC.init(); } catch (e) { G.reportError('wilds:rings', e); }
      try { PG.init(); } catch (e) { G.reportError('wilds:pages', e); }
      ready = true;
    },
    start() {
      const w = wstate(); if (!w) return;
      for (const s of stars) showStar(s, !w.stars[s.id]);
      try { PZ?.start(); } catch (e) { G.reportError('wilds:puzzles', e); }
      try { RC?.start(); } catch (e) { G.reportError('wilds:rings', e); }
      try { PG?.start(); } catch (e) { G.reportError('wilds:pages', e); }
      api.markersDirty = true;
    },
    update(dt) {
      if (!ready || !G.state) return;
      time += dt;
      if (points) { points.material.uniforms.uTime.value = time; points.material.uniforms.uPx.value = Math.min(2, G.renderer?.getPixelRatio?.() || 1); }
      const P = G.player, cam = G.camera;
      // stars near the camera spin and bob (only those within 220 m are touched each frame)
      const cx = cam ? cam.position.x : 0, cz = cam ? cam.position.z : 0;
      for (const s of stars) {
        if (s.got) continue;
        const dx = s.pos.x - cx, dz = s.pos.z - cz;
        if (dx * dx + dz * dz > 48400) continue;
        _p.copy(s.pos); _p.y += Math.sin(time * 1.6 + s.phase) * 0.12;
        inst.set(s.slot, _p, time * 1.2 + s.phase, 1 + 0.06 * Math.sin(time * 3.1 + s.phase));
      }
      const playing = G.started && G.mode === 'play' && P && !P.dead;
      if (playing) {
        const px = P.pos.x, py = P.pos.y + 0.9, pz = P.pos.z;
        for (const s of stars) {
          if (s.got) continue;
          const dx = s.pos.x - px, dz = s.pos.z - pz;
          if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue;
          const dy = s.pos.y - py;
          if (dx * dx + dz * dz + dy * dy < 2.6 * 2.6) collectStar(s);
        }
        scanT -= dt;
        if (scanT <= 0) {
          scanT = 0.3;
          const w = wstate();
          for (const e of lms) if (!w.lm[e.l.id] && landmarkDist(e.l, px, pz) < e.l.r + 18 && Math.abs(P.pos.y - G.world.heightAt(px, pz)) < 140) discover(e);
        }
        perchT -= dt;
        if (perchT <= 0) { perchT = 0.5; checkPerches(); }
      }
      try { PZ?.update(dt, playing); } catch (e) { G.reportError('wilds:puzzles', e); }
      try { RC?.update(dt, playing); } catch (e) { G.reportError('wilds:rings', e); }
      try { PG?.update(dt, playing); } catch (e) { G.reportError('wilds:pages', e); }
    },
    markers,
    journal,
    grant,
    // ---- public helpers (tests, other systems) ----
    /** Stray stars: [{ id, pos, got, region, lm }]. */
    get stars() { return stars.map((s) => ({ id: s.id, pos: s.pos.clone(), got: !!wstate()?.stars[s.id], region: s.region, lm: s.lm })); },
    starCount, starTotal,
    collectStar(id, o) { const s = stars.find((x) => x.id === id); return s ? collectStar(s, o) : false; },
    discover(id, o) { const e = lms.find((x) => x.l.id === id); return e ? discover(e, o) : false; },
    isFound: (id) => !!wstate()?.lm[id],
    cairnStone,
    sightFrom: (pos, reach, o) => sightFrom(pos, reach, o),
    get puzzles() { return PZ; },
    get rings() { return RC; },
    /** 残页试炼: the six tier-2 page trials (wilds-pages.js). */
    get pages() { return PG; },
    resolveAt,
  }));
  return api;
}
