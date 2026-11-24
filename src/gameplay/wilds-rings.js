// Ring courses between landmarks (activities round, 2026-11-22). Data: RINGS in src/data/wilds.js.
// No menu, no countdown: the first ring of each course always hangs in the air as an invitation; flying through it on
// the broom starts the clock. The next ring glows (the others are dim), a compass marker points to it, the HUD tracker
// shows the time. Best time + best medal in G.state.wilds.rings[id] = { best, medal } (medal 0 gold .. 3 none); a
// better medal pays the difference in RING_PAY. Given up when she is off the broom > 4 s or > 320 m from the next ring.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { PAL } from '../core/mats.js';
import { RINGS, RING_PAY } from '../data/wilds.js';
import { LANDMARK_BY_ID } from '../data/landmarks.js';
import { sfx, toast } from './common.js';
import { sculptedProp, propMat } from './errands-props.js';

const MEDALS = ['gold', 'silver', 'bronze'];

// ---- the witch's ring gate (round art-props: tools/sculpt/assets/ring_willow.mjs) ------------------------------------
// Twisted willow withies, brass bands, a star charm and ribbon streamers (one vertex-coloured, double-sided material,
// three LODs), and a soft gold glow inside the hoop: a thin bright core with a halo fading inward, one additive mesh.
// Same handle as the factory ring (world/builders/factories.js makeRaceRing): { group, radius, active, setActive(on),
// pass() } — the next ring bright, the rest dim (0.15), a pass pulses the glow (x3) and swells it (x1.25) for ~0.7 s.
// Used by the ring courses here and the broom races (races.js); null when the sculpt is off (?sculpt=0) or missing.
const RING_R = 3.6;   // the sculpt's hoop radius (scaled to each course's radius)
let _ringGlowGeo = null;
function ringGlowGeo() {
  if (_ringGlowGeo) return _ringGlowGeo;
  const pos = [], col = [], idx = [], S = 72, gold = [1, 0.8, 0.46];
  // the core: a thin torus just inside the willow bundle
  const Rc = RING_R - 0.1, rc = 0.045, T = 6;
  for (let i = 0; i <= S; i++) for (let j = 0; j <= T; j++) {
    const a = (i / S) * Math.PI * 2, b = (j / T) * Math.PI * 2, rr = Rc + rc * Math.cos(b);
    pos.push(Math.cos(a) * rr, Math.sin(a) * rr, rc * Math.sin(b)); col.push(...gold);
  }
  for (let i = 0; i < S; i++) for (let j = 0; j < T; j++) { const a = i * (T + 1) + j, c = a + T + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  // the halo: a band fading from the core to nothing toward the middle of the hoop
  const o = pos.length / 3, r0 = RING_R - 0.62, r1 = RING_R - 0.12;
  for (let i = 0; i <= S; i++) {
    const a = (i / S) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    pos.push(c * r0, sn * r0, 0, c * r1, sn * r1, 0);
    col.push(0, 0, 0, gold[0] * 0.32, gold[1] * 0.32, gold[2] * 0.32);
  }
  for (let i = 0; i < S; i++) { const a = o + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeBoundingSphere();
  return (_ringGlowGeo = g);
}
let _ringMats = null;
const ringMats = () => (_ringMats ||= { WitchRing_none: propMat(0xa4824f, { side: THREE.DoubleSide, surface: 'none', look: { rim: 0.35, spec: 0.25, specPower: 30, wrap: 0.35 } }) });
export function makeWitchRing(radius = 3) {
  const body = sculptedProp('sculpt_ring_willow', ringMats(), { k: 2.5, name: 'witchRing', cast: false, recv: false });
  if (!body) return null;
  const s = radius / RING_R, STR = 2.2;
  const g = new THREE.Group(); g.name = 'raceRing';
  body.scale.setScalar(s); g.add(body);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const glow = new THREE.Mesh(ringGlowGeo(), mat);
  glow.name = 'raceRingGlow'; glow.castShadow = false; glow.receiveShadow = false; glow.renderOrder = 3; glow.scale.setScalar(s);
  g.add(glow);
  let pulse = 0, active = true, last = 0;
  const apply = () => { const k = STR * ((active ? 1 : 0.15) + pulse * 2); mat.color.setRGB(k, k, k); glow.scale.setScalar(s * (1 + pulse * 0.25)); };
  // the pass pulse decays while the glow is drawn (no ticker; nothing runs for a ring off screen)
  glow.onBeforeRender = () => { if (pulse <= 0) return; const t = performance.now() / 1000; pulse = Math.max(0, pulse - (t - last) * 1.5); last = t; apply(); };
  const h = {
    group: g, radius, active: true,
    setActive(on) { active = h.active = !!on; apply(); },
    pass() { pulse = 1; last = performance.now() / 1000; apply(); },
  };
  apply();
  return h;
}

export function createWildRings({ wstate, lmName, tt }) {
  const courses = [];
  let run = null, hudT = 0, lastEnd = -99;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _prev = new THREE.Vector3();

  const rec = (id) => { const w = wstate(); const r = w?.rings[id]; return r && typeof r === 'object' ? r : null; };
  function ringY(x, z, dy) { const W = G.world; return Math.max(W.heightAt(x, z), W.seaLevel ?? 0) + dy; }

  function init() {
    const make = G.structures?.factories?.makeRaceRing || G.structures?.makeRaceRing;
    for (const def of RINGS) {
      const pts = def.rings.map(([x, z, dy]) => new THREE.Vector3(x, ringY(x, z, dy), z));
      const rings = pts.map((pos, i) => {
        const normal = new THREE.Vector3();
        if (i < pts.length - 1) normal.subVectors(pts[i + 1], pos).normalize(); else normal.subVectors(pos, pts[i - 1]).normalize();
        if (i > 0 && i < pts.length - 1) normal.add(_a.subVectors(pos, pts[i - 1]).normalize()).normalize();
        const h = makeWitchRing(def.radius) || (make ? make(def.radius) : null);
        if (h) { h.group.position.copy(pos); h.group.lookAt(_a.copy(pos).add(normal)); h.group.visible = i === 0; G.scene.add(h.group); }
        return { pos, normal, h };
      });
      let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
      courses.push({ def, rings, len });
    }
  }
  function idle() {
    for (const c of courses) c.rings.forEach((r, i) => { if (!r.h) return; r.h.group.visible = !run && i === 0; r.h.setActive?.(true); });
  }
  function crossed(r, from, to, radius) {
    if (to.distanceTo(r.pos) < radius * 0.9) return true;
    const d0 = _a.subVectors(from, r.pos).dot(r.normal), d1 = _b.subVectors(to, r.pos).dot(r.normal);
    if (d0 > 0 || d1 < 0) return false;
    const f = d0 === d1 ? 0 : d0 / (d0 - d1);
    _a.copy(from).lerp(to, f);
    return _a.distanceTo(r.pos) < radius * 1.2;
  }
  function begin(c) {
    run = { c, t: 0, next: 1, offT: 0 };
    c.rings.forEach((r, i) => { if (r.h) { r.h.group.visible = true; r.h.setActive?.(i === 1); } });
    for (const o of courses) if (o !== c) o.rings.forEach((r) => { if (r.h) r.h.group.visible = false; });
    const r0 = c.rings[0];
    r0.h?.pass?.();
    sfx('race_ring', { pos: r0.pos }); sfx('whoosh', { vol: 0.6 });
    toast(tt('toast.ringStart', { name: tt('ring.' + c.def.id) }), { icon: 'flag', dur: 2.6 });
    G.events.emit('race:start', { id: c.def.id });
    marker(); hud();
  }
  function marker() {
    if (!run) { G.ui?.setMarkers?.([], 'race'); return; }
    const r = run.c.rings[run.next];
    if (r) G.ui?.setMarkers?.([{ id: 'ring_next', pos: { x: r.pos.x, y: r.pos.y, z: r.pos.z }, icon: 'race', color: '#ffd27a', kind: 'quest', label: tt('marker.ring') }], 'race');
  }
  function hud() {
    if (!run) return;
    const c = run.c, n = run.next, max = c.rings.length - 1, best = rec(c.def.id)?.best;
    G.ui?.setTracker?.({
      title: tt('ring.' + c.def.id),
      objective: tt('ringHud', { n: n - 1, max, t: run.t.toFixed(1) }) + (best ? tt('ringBest', { t: best.toFixed(1) }) : ''),
      progress: (n - 1) / max,
    });
  }
  function pass() {
    const c = run.c, r = c.rings[run.next];
    r.h?.pass?.(); r.h?.setActive?.(false);
    try { G.fx?.ring?.(r.pos, { color: PAL.gold, radius: c.def.radius * 1.6, dur: 0.45, y: r.pos.y }); } catch (e) { /* optional */ }
    sfx('race_ring', { pos: r.pos });
    G.cam?.fovKick?.(0.2);
    run.next++;
    const nx = c.rings[run.next];
    if (nx) { nx.h?.setActive?.(true); marker(); hud(); }
    else finish(true);
  }
  function finish(ok, reason) {
    if (!run) return null;
    const R = run; run = null; lastEnd = G.time?.t || 0;
    G.ui?.setTracker?.(null);
    G.ui?.setMarkers?.([], 'race');
    idle();
    if (!ok) { toast(tt('toast.ringLost.' + (reason || 'far')), { icon: 'flag', dur: 3 }); G.events.emit('race:finish', { id: R.c.def.id, time: null, aborted: true }); return null; }
    const id = R.c.def.id, time = Math.round(R.t * 100) / 100, md = R.c.def.medals;
    const tier = time <= md[0] ? 0 : time <= md[1] ? 1 : time <= md[2] ? 2 : 3;
    const w = wstate(), prev = rec(id);
    const had = prev && Number.isFinite(prev.medal) ? prev.medal : 3;
    const best = prev && Number.isFinite(prev.best) ? Math.min(prev.best, time) : time;
    if (w) w.rings[id] = { best, medal: Math.min(had, tier) };
    let dust = 0;
    if (tier < had) { const pay = [RING_PAY.gold, RING_PAY.silver, RING_PAY.bronze, 0]; dust = pay[tier] - pay[had]; }
    if (dust > 0 && G.player) G.gameplay?.spawnPickup?.('stardust', G.player.pos.clone().setY(G.player.pos.y + 1.2), dust);
    const medal = tier < 3 ? MEDALS[tier] : null;
    toast(tt('toast.ringDone', { t: time.toFixed(1), medal: tt('medal.' + (medal || 'none')) }) + (prev && time < prev.best ? tt('toast.ringRecord') : ''), { icon: 'flag', dur: 5 });
    sfx(medal ? 'levelup' : 'ui_chime');
    G.events.emit('race:finish', { id, time, best, medal });
    G.wilds && (G.wilds.markersDirty = true);
    return { time, best, medal };
  }

  return {
    courses,
    init,
    start() { if (run) finish(false, 'far'); idle(); },
    update(dt, playing) {
      const P = G.player;
      if (!P || !playing) { if (P) _prev.copy(P.pos); return; }
      if (!run) {
        // the first ring starts the course (on the broom, not right after a finish)
        if (P.onBroom && (G.time?.t || 0) - lastEnd > 3) {
          for (const c of courses) {
            const r = c.rings[0];
            if (Math.abs(P.pos.x - r.pos.x) > 30 || Math.abs(P.pos.z - r.pos.z) > 30) continue;
            if (crossed(r, _prev, P.pos, c.def.radius)) { begin(c); break; }
          }
        }
        _prev.copy(P.pos);
        return;
      }
      run.t += dt;
      const r = run.c.rings[run.next];
      if (r && crossed(r, _prev, P.pos, run.c.def.radius)) pass();
      _prev.copy(P.pos);
      if (!run) return;
      run.offT = P.onBroom ? 0 : run.offT + dt;
      const nx = run.c.rings[run.next];
      if (run.offT > 4) finish(false, 'broom');
      else if (nx && P.pos.distanceTo(nx.pos) > 320) finish(false, 'far');
      else if (run.t > 300) finish(false, 'slow');
      if (run && (hudT -= dt) <= 0) { hudT = 0.1; hud(); }
    },
    markers(out) {
      for (const c of courses) {
        const l = LANDMARK_BY_ID[c.def.start];
        if (!l || !G.wilds?.isFound(c.def.start)) continue;
        const r = c.rings[0];
        out.push({ x: r.pos.x, z: r.pos.z, icon: 'flag', label: tt('ring.' + c.def.id), kind: 'race', color: '#ffd27a' });
      }
    },
    journal() {
      return courses.map((c) => { const r = rec(c.def.id); return { id: c.def.id, name: tt('ring.' + c.def.id), from: lmName(c.def.start), best: r ? r.best : null, medal: r && r.medal < 3 ? MEDALS[r.medal] : null, len: Math.round(c.len), medals: c.def.medals }; });
    },
    get running() { return run ? run.c.def.id : null; },
    get next() { return run ? run.c.rings[run.next] : null; },
    cancel: () => finish(false, 'far'),
    ring: (id, i) => courses.find((c) => c.def.id === id)?.rings[i] || null,
  };
}
