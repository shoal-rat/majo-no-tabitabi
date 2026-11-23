// 星尘试炼 — after the journey (quest 'mages' done), a chalk ring in Fran's clearing: five rounds of phantoms Fran
// conjures out of stardust, each asking for a different answer (pages and mud, a flanking pack, two duelling mages,
// a warded stag under bats, and a finale of rider, ember serpent and stone guard). Timed; the best time and the number
// of clears live in G.state.combat.trials. She is never killed here: at 1 hp the trial ends and Fran calls it. Between
// waves she gets a fifth of her hp and a third of her mana back.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { fmtTime } from '../ui/dom.js';

const ROUNDS = [
  [['paper', 4], ['blob', 1]],
  [['wolf', 3]],
  [['caster', 2]],
  [['froststag', 1], ['moth', 3]],
  [['raider', 1], ['embersnake', 1], ['golem', 1]],
];
const RING_R = 26;

export function createTrials(C) {
  const T = { active: false, round: 0, t: 0, members: new Set() };
  let ring = null, run = 0, hudT = 0, center = new THREE.Vector3();

  function spot() {
    const a = G.world.anchor?.('franTrial');
    if (!a) return null;
    return center.set(a.x - 7, 0, a.z + 6);
  }
  function rec() {
    const s = G.state;
    if (!s) return { best: 0, clears: 0 };
    s.combat ||= {};
    s.combat.trials ||= { best: 0, clears: 0 };
    return s.combat.trials;
  }
  function showRing(on) {
    if (on && !ring) {
      ring = new THREE.Mesh(new THREE.RingGeometry(RING_R - 0.25, RING_R, 96), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.renderOrder = 2;
      G.scene.add(ring);
    }
    if (ring) {
      ring.visible = on;
      if (on) { const c = spot(); ring.position.set(c.x, G.world.groundAt(c.x, c.z) + 0.08, c.z); }
    }
  }
  function cleanup() {
    for (const e of T.members) if (!e.dead) C.despawn(e);
    T.members.clear();
    const P = G.player;
    if (P && T.floor) { P.damageFloor = T.floor.prev; P.onDamageFloor = T.floor.cb; }
    T.floor = null;
    G.ui?.bossBar?.(null);
    showRing(false);
  }
  function end(kind, quiet = false) {
    if (!T.active) return;
    T.active = false;
    C.trial = null;
    run++;
    const P = G.player;
    if (kind === 'clear') {
      const r = rec();
      const time = T.t;
      const first = !(r.clears > 0);
      const best = !r.best || time < r.best;
      r.clears = (r.clears || 0) + 1;
      if (best) r.best = Math.round(time * 10) / 10;
      const n = first ? 80 : best ? 40 : 20;
      G.ui?.banner?.(t('combat.trial.name'), t('combat.trial.clear', { time: fmtTime(time) }) + (best ? ' · ' + t('combat.trial.best') : ''));
      C.after(1.2, () => {
        G.gameplay?.spawnPickup?.('stardust', P.pos, n);
        G.ui?.toast?.(t('combat.trial.reward', { n }), { dur: 3, icon: 'stardust' });
        if (first) { G.gameplay?.spawnPickup?.('dango', P.pos, 1); G.ui?.toast?.(t('combat.trial.gift'), { dur: 3 }); }
      });
      G.events.emit('trial:end', { result: 'clear', time, best });
    } else if (!quiet) {
      G.ui?.toast?.(t(kind === 'left' ? 'combat.trial.left' : 'combat.trial.fail'), { dur: 3 });
      G.events.emit('trial:end', { result: kind, time: T.t });
    }
    if (P && !P.dead) { P.hp = Math.max(P.hp, P.maxHp * 0.6); P.mana = Math.max(P.mana, P.maxMana * 0.6); }
    cleanup();
    if (!quiet && G.started && !G.save?.disabled) G.save?.write?.(true);
  }
  async function begin() {
    if (T.active || !G.player) return;
    const my = ++run;
    T.active = true; T.round = 0; T.t = 0; T.members.clear();
    C.trial = T;
    const P = G.player;
    T.floor = { prev: P.damageFloor ?? null, cb: P.onDamageFloor ?? null };
    P.damageFloor = 1;
    P.onDamageFloor = () => { if (T.active && run === my) C.after(0.4, () => { if (T.active && run === my) end('fail'); }); };
    P.hp = P.maxHp; P.mana = P.maxMana;
    showRing(true);
    G.ui?.banner?.(t('combat.trial.name'), t('combat.trial.start'));
    G.audio?.sfx('taiko', { vol: 0.9 });
    G.events.emit('trial:start', {});
    for (let i = 0; i < ROUNDS.length; i++) {
      await wait(i ? 2.2 : 3);
      if (!T.active || run !== my) return;
      T.round = i + 1;
      G.ui?.toast?.(t('combat.trial.wave', { n: i + 1 }), { dur: 1.8 });
      const c = spot();
      await C.spawnWave(ROUNDS[i], { x: c.x, z: c.z }, { r: 10, stagger: 0.25, hpMul: 0.9 + i * 0.05, color: 0xffe9b0,
        onSpawn: (e) => { e.noDrop = true; e.phantom = true; e.camp = null; T.members.add(e); } });
      if (!T.active || run !== my) return;
      // a breather between waves: since the "longer fights" round the phantoms land their moves, and five waves on one
      // bar of hp with no drops became a wall; a fifth of her hp and a third of her mana come back
      if (i < ROUNDS.length - 1 && P && !P.dead) { P.heal?.(P.maxHp * 0.2); P.addMana?.(P.maxMana * 0.3); }
    }
    end('clear');
  }
  function wait(sec) { return new Promise((res) => C.after(sec, res)); }

  T.update = function (dt) {
    if (!T.active) return;
    T.t += dt;
    const P = G.player, c = spot();
    if (!P || !c || P.dead) { end('fail'); return; }
    if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) > RING_R + 8) { end('left'); return; }
    if (G.mode !== 'play') return;
    if ((hudT -= dt) <= 0) {
      hudT = 0.2;
      let alive = 0;
      for (const e of T.members) if (!e.dead) alive++;
      const total = ROUNDS[Math.max(0, T.round - 1)].reduce((s, k) => s + k[1], 0);
      G.ui?.bossBar?.({ name: t('combat.trial.name'), hp: T.round ? alive : total, max: total, kind: 'duel', element: 'sun',
        sub: t('combat.trial.sub', { n: Math.max(1, T.round) }) + ' · ' + fmtTime(T.t) + (rec().best ? ' · ' + t('combat.trial.record', { time: fmtTime(rec().best) }) : '') });
    }
  };
  T.start = begin;
  T.abort = () => { if (T.active) end('left', true); };
  T.record = rec;
  /** wire the chalk ring in Fran's clearing (called once story exists) */
  T.install = function () {
    G.interact?.add?.({
      getPos: (out) => { const c = spot(); return c ? out.set(c.x, G.world.groundAt(c.x, c.z) + 1, c.z) : null; },
      radius: 3.2,
      priority: 4,
      enabled: () => !!G.quests?.isDone?.('mages') && !T.active && !G.story?.spar?.active && !G.dialogue?.active,
      prompt: () => t('combat.trial.prompt'),
      onInteract: () => begin(),
    });
  };
  return T;
}
