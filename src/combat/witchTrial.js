// The practice duel is about reading the other mage: break a gathering spell or
// give up ground. Seals belong to the current duel and can never hit after it ends.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { COLORS } from '../spells/book.js';
import { hurtPlayer } from './attacks.js';

const answers = { fire: 'water', ice: 'fire', wind: 'ice', thunder: 'earth' };
export function createWitchTrial(d) {
  const e = d.enemy,
    answer = answers[d.cfg.el];
  const seals = [],
    spot = new THREE.Vector3();
  let lastGuard = -10,
    exposedUntil = -10,
    nextSeal = 10.5,
    hinted = false;
  const active = () => !d.over && !e.dead;
  const say = (key) => G.ui?.toast?.(t('combat.duel.' + key), { dur: 2.9 });
  const offGuard = G.events.on('spell:clash', (ev) => {
    if (active() && ev.result === 'reflect' && ev.defender === G.player && ev.attacker === e) lastGuard = d.t;
  });
  const dispose = (s) => {
    s.clearSigil?.();
    s.mesh.removeFromParent();
    s.mesh.geometry.dispose();
    s.mesh.material.dispose();
  };
  const offElement = G.events.on('element:applied', (ev) => {
    if (!active() || ev.source !== G.player || ev.element !== answer) return;
    for (let i = seals.length - 1; i >= 0; i--) {
      const s = seals[i];
      if (ev.pos.distanceTo(s.mesh.position) > s.radius + ev.radius) continue;
      G.fx?.burst?.('clash', s.mesh.position, { color: COLORS[answer], scale: 0.8 });
      dispose(s);
      seals.splice(i, 1);
      G.events.emit('duel:seal', { id: d.id, result: 'dispel' });
    }
  });
  function placeSeals() {
    const P = G.player,
      ax = P.pos.x - e.pos.x,
      az = P.pos.z - e.pos.z,
      len = Math.hypot(ax, az) || 1;
    const cx = P.pos.x + Math.max(-2, Math.min(2, P.vel.x * 0.32));
    const cz = P.pos.z + Math.max(-2, Math.min(2, P.vel.z * 0.32));
    for (const [offset, delay] of [
      [0, 1.65],
      [3.45, 2.35]
    ]) {
      const x = cx + (az / len) * offset,
        z = cz - (ax / len) * offset;
      if (Math.hypot(x - d.cx, z - d.cz) > d.r - 1.6) continue;
      const y = G.world.groundAt(x, z, P.pos.y + 1);
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(1.44, 1.59, 40),
        new THREE.MeshBasicMaterial({
          color: COLORS[d.cfg.el],
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.76,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2
        })
      );
      mesh.name = 'duel:ground-seal';
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y + 0.085, z);
      G.scene.add(mesh);
      const clearSigil = G.fx?.sigil?.(mesh.position, { color: COLORS[d.cfg.el], radius: 0.93, dur: delay, tracked: true });
      seals.push({ mesh, clearSigil, radius: 1.6, until: d.t + delay });
    }
    if (!hinted) {
      say('sealHint');
      hinted = true;
    }
    G.events.emit('duel:seal', { id: d.id, result: 'placed' });
  }
  function tick(dt) {
    if (!active() || !G.player) return;
    nextSeal -= dt;
    if (nextSeal <= 0 && !e.atk && e.stunT <= 0 && !e.data.beam) {
      placeSeals();
      nextSeal = 13;
    }
    for (let i = seals.length - 1; i >= 0; i--) {
      const s = seals[i],
        remain = s.until - d.t;
      s.mesh.material.opacity = 0.62 + 0.31 * Math.cos(14 * remain);
      if (remain > 0) continue;
      const p = G.player.pos,
        at = s.mesh.position;
      const hit =
        Math.hypot(p.x - at.x, p.z - at.z) < s.radius + 0.12 && p.y - at.y < 1.45 && p.y - at.y > -0.52;
      if (hit) hurtPlayer(e, 14, { element: d.cfg.el, from: at, knock: 1 });
      G.fx?.burst?.('hit_' + d.cfg.el, at, { color: COLORS[d.cfg.el], scale: 1.1 });
      dispose(s);
      seals.splice(i, 1);
      G.events.emit('duel:seal', { id: d.id, result: hit ? 'contact' : 'evaded' });
    }
  }
  return {
    tick,
    telegraph() {
      say('answer_' + d.cfg.el);
    },
    hit(amount, info) {
      if (!active() || info.source !== G.player || info.dot) return amount;
      if (e.atk?.name === 'big' && !e.atk.fired && (info.element === answer || d.t - lastGuard < 2.4)) {
        e.stopAttack();
        e.stun(1.45);
        e.data.cd = Math.max(1.0, e.data.cd);
        e.data.guard?.stop?.();
        e.actor?.stop('upper', 0.12);
        exposedUntil = d.t + 1.65;
        lastGuard = -10;
        G.fx?.burst?.('clash_big', e.centerOut(spot), {
          color: COLORS[answer],
          color2: COLORS[d.cfg.el],
          scale: 0.8
        });
        G.fx?.text?.(spot, t('combat.duel.broken'), { kind: 'word', target: e, color: '#ffe7a4', dur: 1.2 });
        G.events.emit('duel:disrupt', { id: d.id, element: info.element });
        return amount;
      }
      return d.t < exposedUntil ? amount * 1.3 : amount;
    },
    close() {
      offGuard();
      offElement();
      for (const s of seals) dispose(s);
      seals.length = 0;
    }
  };
}
