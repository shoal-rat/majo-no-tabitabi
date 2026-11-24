// Broom races: courses of glowing rings, countdown, timer HUD, medals, best times in G.state.races.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { addItem } from '../core/save.js';
import { PAL } from '../core/mats.js';
import { RACES } from '../data/placements.js';
import { gp, isActive, sfx, toast } from './common.js';
import { makeWitchRing } from './wilds-rings.js';

const MEDALS = ['gold', 'silver', 'bronze'];

export function createRaces(api) {
  const courses = {};          // id -> { id, def, rings: [{ pos, normal, h }], startPos, interact }
  let run = null;              // the race in progress
  const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _prev = new THREE.Vector3();

  function ringPos(r) {
    const [x, z, y, mode] = r;
    return new THREE.Vector3(x, mode === 'g' ? G.world.groundAt(x, z, G.world.heightAt(x, z) + 2) + y : y, z);
  }
  function init() {
    const make = G.structures?.factories?.makeRaceRing || G.structures?.makeRaceRing;
    for (const id in RACES) {
      const def = RACES[id];
      const pts = def.rings.map(ringPos);
      const rings = pts.map((pos, i) => {
        const h = makeWitchRing(def.radius) || (make ? make(def.radius) : null);
        const normal = new THREE.Vector3();
        if (i < pts.length - 1) normal.subVectors(pts[i + 1], pos); else normal.subVectors(pos, pts[i - 1]);
        if (i > 0 && i < pts.length - 1) normal.normalize().add(_v.subVectors(pos, pts[i - 1]).normalize());
        normal.normalize();
        if (h) {
          h.group.position.copy(pos);
          _a.copy(pos).add(normal); h.group.lookAt(_a);
          h.group.visible = false;
          G.scene.add(h.group);
        }
        return { pos, normal, h };
      });
      const start = G.world.anchor(def.start);
      const c = { id, def, rings, start };
      // the first ring stays visible as an invitation; interact at the start anchor
      c.interact = G.interact?.add({
        pos: start.clone().setY(start.y + 1), radius: 3, priority: 1, broom: true,
        enabled: () => !run && isActive(def.group),
        prompt: () => t('gameplay.prompt.race', { name: t('gameplay.race.name.' + id) }),
        onInteract: () => { startRace(id); },
      });
      courses[id] = c;
    }
  }
  function showIdle() {
    for (const id in courses) {
      const c = courses[id];
      const vis = !run && isActive(c.def.group);
      c.rings.forEach((r, i) => { if (!r.h) return; r.h.group.visible = vis && i === 0; r.h.setActive?.(true); });
    }
  }

  /** ★ startRace(id) -> Promise<{ time, best, medal }> (time null if it was abandoned). */
  function startRace(id, o = {}) {
    const c = courses[id];
    if (!c) return Promise.resolve({ time: null, best: null, medal: null });
    if (run) finish(false);
    const P = G.player;
    if (P && !P.onBroom) P.mountBroom?.();
    if (P && !P.onBroom && !G.params?.autostart) { toast(t('gameplay.toast.racePick'), { icon: 'broom' }); return Promise.resolve({ time: null, best: bestOf(id), medal: null }); }
    return new Promise((resolve) => {
      run = { id, c, resolve, t: 0, count: o.flying ? 0 : 3.2, next: 0, prevPos: (P ? P.pos.clone() : new THREE.Vector3()), offT: 0, hudT: 0, lastShown: -1 };
      // show the course: the next ring bright, the rest dim
      c.rings.forEach((r, i) => { if (r.h) { r.h.group.visible = true; r.h.setActive?.(i === 0); } });
      for (const id2 in courses) if (id2 !== id) courses[id2].rings.forEach((r) => { if (r.h) r.h.group.visible = false; });
      if (!o.flying) G.player?.setControl?.(false);
      G.events.emit('race:start', { id });
      hud();
      markers();
    });
  }
  const bestOf = (id) => (G.state && G.state.races && Number.isFinite(G.state.races[id]) ? G.state.races[id] : null);
  function hud() {
    if (!run) return;
    const c = run.c, n = run.next, max = c.rings.length;
    const time = run.count > 0 ? 0 : run.t;
    const best = bestOf(run.id);
    G.ui?.setTracker?.({
      title: t('gameplay.race.name.' + run.id),
      objective: t('gameplay.race.objective', { n, max }) + ' · ' + t('gameplay.race.time', { t: time.toFixed(1) }) + (best ? ' · ' + t('gameplay.race.best', { t: best.toFixed(1) }) : ''),
      progress: n / max,
    });
  }
  function markers() {
    if (!run) { api.markersDirty(); return; }
    const r = run.c.rings[run.next];
    if (r) api.setRaceMarker({ id: 'race_next', pos: { x: r.pos.x, y: r.pos.y, z: r.pos.z }, icon: 'race', color: '#ffd27a', kind: 'quest', label: t('gameplay.marker.race') });
  }
  function pass(i) {
    const c = run.c, r = c.rings[i];
    r.h?.pass?.(); r.h?.setActive?.(false);
    G.fx?.burst?.('hit_sun', r.pos, { scale: 1.2 });
    G.fx?.ring?.(r.pos, { color: PAL.gold, radius: c.def.radius * 1.6, dur: 0.45, y: r.pos.y });
    sfx('race_ring', { pos: r.pos });
    G.cam?.fovKick?.(0.25);
    run.next++;
    const nx = c.rings[run.next];
    if (nx) { nx.h?.setActive?.(true); markers(); }
    else finish(true);
  }
  function crossed(r, from, to, radius) {
    const d0 = _v.subVectors(from, r.pos).dot(r.normal), d1 = _a.subVectors(to, r.pos).dot(r.normal);
    if (to.distanceTo(r.pos) < radius * 0.95) return true;
    if (d0 > 0 || d1 < 0) return false;
    const f = d0 === d1 ? 0 : d0 / (d0 - d1);
    _v.copy(from).lerp(to, f);
    return _v.distanceTo(r.pos) < radius * 1.15;
  }
  function finish(ok, reason) {
    if (!run) return;
    const R = run; run = null; _lastEnd = G.time.t;
    G.player?.setControl?.(true);
    G.ui?.setTracker?.(null);
    api.setRaceMarker(null);
    let result = { time: null, best: bestOf(R.id), medal: null };
    if (ok) {
      const time = Math.round(R.t * 100) / 100;
      const prev = bestOf(R.id);
      const best = prev === null ? time : Math.min(prev, time);
      G.state.races[R.id] = best;
      const md = R.c.def.medals;
      const tier = time <= md[0] ? 0 : time <= md[1] ? 1 : time <= md[2] ? 2 : 3;
      const medal = tier < 3 ? MEDALS[tier] : null;
      // first-time rewards per tier reached
      const got = gp().raceMedal || (gp().raceMedal = {});
      const had = Number.isFinite(got[R.id]) ? got[R.id] : 3;
      if (tier < had) {
        let dust = 0; for (let k = tier; k < had && k < 3; k++) dust += R.c.def.reward[k] || 0;
        got[R.id] = tier;
        if (dust > 0) setTimeout(() => { if (G.player) api.spawnPickup('stardust', _v.copy(G.player.pos).setY(G.player.pos.y + 1.2), dust); }, 600);
      }
      result = { time, best, medal };
      G.events.emit('race:finish', { id: R.id, time, best, medal });
      G.ui?.banner?.(t('gameplay.race.name.' + R.id), t('gameplay.race.result', { medal: t('gameplay.race.medal.' + (medal || 'none')), t: time.toFixed(2) }));
      if (prev !== null && time < prev) toast(t('gameplay.toast.raceNew'), { icon: 'race' });
      const last = R.c.rings[R.c.rings.length - 1].pos;
      G.fx?.burst?.('levelup', last, { scale: 2 });
      G.fx?.burst?.('petals', last, { scale: 2 });
    } else {
      if (reason) toast(t('gameplay.toast.raceFail'), { icon: 'race' });
      G.events.emit('race:finish', { id: R.id, time: null, best: result.best, aborted: true });
    }
    showIdle();
    try { R.resolve(result); } catch (e) { G.reportError('gameplay:race', e); }
  }
  function cancel() { finish(false); }

  const _idlePrev = new THREE.Vector3(); let _idleHas = false, _lastEnd = -1e9;
  function update(dt) {
    if (!run) {
      // flying through the glowing first ring of a course starts it on the spot (no countdown) — what a player expects
      const Pl = G.player;
      if (!Pl || !Pl.onBroom || Pl.dead || G.mode !== 'play') { _idleHas = false; return; }
      if (_idleHas && G.time.t - _lastEnd > 10) {
        for (const id in courses) {
          const c = courses[id], r0 = c.rings[0];
          if (!r0 || !isActive(c.def.group) || r0.pos.distanceTo(Pl.pos) > 30) continue;
          if (crossed(r0, _idlePrev, Pl.pos, c.def.radius)) { startRace(id, { flying: true }); if (run) { G.fx?.text?.(_v.copy(Pl.pos).setY(Pl.pos.y + 2.6), t('gameplay.race.go'), { color: '#ffd27a', size: 2.6, dur: 1 }); pass(0); } break; }
        }
      }
      _idlePrev.copy(Pl.pos); _idleHas = true;
      return;
    }
    const P = G.player;
    if (!P) { finish(false); return; }
    if (run.count > 0) {
      const before = Math.ceil(run.count);
      run.count -= dt;
      const now = Math.ceil(run.count);
      if (now !== before || run.lastShown < 0) {
        run.lastShown = now;
        _v.copy(P.pos); _v.y += 2.6;
        if (now > 0 && now <= 3) { G.fx?.text?.(_v, String(now), { color: '#ffe6a6', size: 2.4, dur: 0.9 }); sfx('taiko', { vol: 0.8 }); }
      }
      if (run.count <= 0) {
        G.fx?.text?.(_v.copy(P.pos).setY(P.pos.y + 2.6), t('gameplay.race.go'), { color: '#ffd27a', size: 2.6, dur: 1 });
        sfx('taiko', { vol: 1, pitch: 1.3 }); sfx('broom_boost', { vol: 0.7 });
        G.player?.setControl?.(true);
        run.prevPos.copy(P.pos);
      }
      return;
    }
    run.t += dt;
    const r = run.c.rings[run.next];
    if (r && crossed(r, run.prevPos, P.pos, run.c.def.radius)) pass(run.next);
    if (!run) return;
    run.prevPos.copy(P.pos);
    // abandon conditions: off the broom for a while, far off course, or way too slow
    run.offT = P.onBroom ? 0 : run.offT + dt;
    const nr = run.c.rings[run.next];
    if (run.offT > 3 || P.dead || (nr && nr.pos.distanceTo(P.pos) > 260) || run.t > run.c.def.medals[2] * 3) { finish(false, 'fail'); return; }
    run.pulseT = (run.pulseT || 0) - dt;
    if (nr && run.pulseT <= 0) { run.pulseT = 0.5; G.fx?.burst?.('hit_sun', nr.pos, { scale: 0.7, color: PAL.gold }); }
    run.hudT -= dt;
    if (run.hudT <= 0) { run.hudT = 0.1; hud(); }
  }
  function start() { if (run) finish(false); showIdle(); }

  return { init, start, update, startRace, cancel, courses, get running() { return run ? run.id : null; }, get run() { return run; } };
}
