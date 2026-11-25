// Training posts (案山子) for tests and the practice field: a straw-wrapped post with a paper target face, an elements
// reactor that floats damage numbers, wobbles when struck, regains its strength after a pause and can cast spells
// itself (dummy.cast) so it can stand in for an enemy-team caster.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { toon, glow, PAL } from '../core/mats.js';
import { cyl, box, sphere, grp, bakeStatic } from '../core/geo.js';
import { clamp } from '../core/util.js';
import { COLORS } from './book.js';

const EL_TEXT = { fire: '#ffb070', water: '#9fdcff', ice: '#dff6ff', wind: '#c8ffe0', thunder: '#d6b8ff', earth: '#f0d2a8', sun: '#ffe9a8', moon: '#d8ccff' };

let baked = null;
function postModel(team) {
  if (!baked) {
    const wood = toon(PAL.woodDark), straw = toon(PAL.straw), strawD = toon(PAL.strawDark), paper = toon(PAL.paper), red = toon(PAL.mikoRed);
    const g = grp(
      cyl(0.07, 0.09, 2.0, wood, 0, 1.0, 0),
      box(1.3, 0.09, 0.09, wood, 0, 1.38, 0),
      cyl(0.3, 0.26, 0.75, straw, 0, 1.05, 0),
      cyl(0.32, 0.32, 0.08, strawD, 0, 0.72, 0),
      cyl(0.32, 0.32, 0.08, strawD, 0, 1.38, 0),
      sphere(0.24, paper, 0, 1.72, 0),
      cyl(0.13, 0.13, 0.02, red, 0, 1.72, 0.23),
      cyl(0.06, 0.06, 0.03, paper, 0, 1.72, 0.24),
      cyl(0.08, 0.13, 0.3, straw, -0.65, 1.38, 0),
      cyl(0.08, 0.13, 0.3, straw, 0.65, 1.38, 0),
    );
    g.children[6].rotation.x = Math.PI / 2; g.children[7].rotation.x = Math.PI / 2;
    g.children[8].rotation.z = Math.PI / 2; g.children[9].rotation.z = -Math.PI / 2;
    baked = bakeStatic(g);
  }
  const m = baked.clone();
  if (team === 'enemy') {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow(PAL.shadeEye, 3));
    eye.position.set(-0.08, 1.78, 0.21); m.add(eye);
    const eye2 = eye.clone(); eye2.position.x = 0.08; m.add(eye2);
  }
  return m;
}

/**
 * makeDummy(pos, { material='wood', hp=300, team='enemy', respawn=true, face }) -> Dummy
 * Dummy { group, pos, yaw, dir, team, hp, maxHp, radius, height, reactor, dead, taken, hits:[{el,dmg,mult,reaction}],
 *         cast(spell, form, opts), remove(), reset(), stun() }
 */
export function makeDummy(pos, o = {}) {
  const team = o.team || 'enemy';
  const group = new THREE.Group();
  const model = postModel(team);
  group.add(model);
  const gy = G.world.groundAt(pos.x, pos.z, (pos.y ?? 999) + 1);
  group.position.set(pos.x, gy, pos.z);
  G.scene.add(group);
  const d = {
    group, pos: group.position, yaw: 0, dir: new THREE.Vector3(0, 0, 1), team, hp: o.hp ?? 300, maxHp: o.hp ?? 300, radius: 0.45, height: 1.9,
    reactor: null, dead: false, taken: 0, hits: [], isDummy: true, wob: 0, wobV: 0, wobAxis: new THREE.Vector3(1, 0, 0), lastHit: -99, burnAcc: 0,
    cast(spell, form = 'small', opts = {}) {
      const target = opts.target || G.player;
      if (target) {
        const tp = target.pos || target;
        d.dir.set(tp.x - d.pos.x, (tp.y + 1.1) - (d.pos.y + 1.4), tp.z - d.pos.z).normalize();
        d.yaw = Math.atan2(d.dir.x, d.dir.z);
        group.rotation.y = d.yaw;
      }
      const origin = new THREE.Vector3(d.pos.x, d.pos.y + 1.45, d.pos.z).addScaledVector(d.dir, 0.7);
      const point = opts.point || (target && target.pos ? new THREE.Vector3(target.pos.x, target.pos.y + 1, target.pos.z) : null);
      return G.spells?.cast(spell, form, { caster: d, team, origin, dir: d.dir.clone(), target, point, ...opts });
    },
    face(target) { const tp = target.pos || target; d.yaw = Math.atan2(tp.x - d.pos.x, tp.z - d.pos.z); group.rotation.y = d.yaw; d.dir.set(Math.sin(d.yaw), 0, Math.cos(d.yaw)); },
    stun() {},
    reset() { d.hp = d.maxHp; d.dead = false; group.visible = true; },
    remove() {
      if (d.reactor) G.elements?.unregister(d.reactor);
      col.dead = true;
      group.removeFromParent();
      const i = DUMMIES.indexOf(d); if (i >= 0) DUMMIES.splice(i, 1);
      d.dead = true; d.removed = true;
    },
  };
  if (o.face) d.face(o.face);
  const col = G.world.addCollider({ x: pos.x, z: pos.z, r: 0.32, y0: gy - 0.5, y1: gy + 2.0, tag: 'dummy' });

  function hurt(amount, el, mult, reaction) {
    if (d.dead || !(amount > 0)) return;
    amount = Math.round(amount);
    d.hp -= amount; d.taken += amount; d.lastHit = G.time.t;
    d.hits.push({ el, dmg: amount, mult: mult || 1, reaction: reaction || null, t: G.time.t });
    if (d.hits.length > 64) d.hits.shift();
    const big = (mult || 1) > 1;
    G.fx?.text?.(new THREE.Vector3(d.pos.x + (Math.random() - 0.5) * 0.6, d.pos.y + 2.2 + Math.random() * 0.3, d.pos.z), String(amount),
      { kind: 'dmg', target: d, n: amount, el: el && el !== 'sun' ? el : '', big: big && amount >= 18 || amount >= 30, color: big ? '#ffcf6a' : EL_TEXT[el] || '#ffc24e' });
    d.wobV += Math.min(4, 0.6 + amount * 0.04);
    if (d.hp <= 0) {
      d.dead = true;
      G.fx?.burst('wood_break', new THREE.Vector3(d.pos.x, d.pos.y + 1.2, d.pos.z), { scale: 1.2 });
      G.audio?.sfx('wood_break', { pos: d.pos });
      group.visible = false;
      if (o.respawn !== false) setTimeout(() => { if (!d.removed) { d.reset(); G.fx?.burst('summon', new THREE.Vector3(d.pos.x, d.pos.y + 1, d.pos.z), { color: COLORS.sun, scale: 0.6 }); } }, 3000);
    }
  }
  d.hurt = hurt;

  d.reactor = G.elements?.register?.({
    owner: d, kind: 'creature', material: o.material || 'wood', getPos: () => d.pos, radius: d.radius, height: d.height, team, living: true,
    on: {
      hit(r, el, power, h) {
        if (!h) return;
        const base = h.damage ?? 8 * power;
        hurt(base * (h.mult || 1), el, h.mult, h.reaction);
        if (h.dir || h.source) {
          const s = h.source && (h.source.pos || (h.source.isVector3 && h.source));
          if (s) d.wobAxis.set(d.pos.z - s.z, 0, s.x - d.pos.x).normalize();
        }
      },
      burnTick(r, dt) { d.burnAcc += 6 * dt; if (d.burnAcc >= 9) { hurt(d.burnAcc, 'fire'); d.burnAcc = 0; } },
      shock() { d.wobV += 1.5; },
    },
  }) || null;

  // wobble on a spring + strength regained after a pause
  d.update = (dt) => {
    d.wobV -= d.wob * 60 * dt; d.wobV *= Math.exp(-5 * dt); d.wob += d.wobV * dt;
    model.rotation.set(0, 0, 0);
    if (Math.abs(d.wob) > 1e-4) model.rotateOnAxis(d.wobAxis, clamp(d.wob * 0.25, -0.5, 0.5));
    if (!d.dead && d.hp < d.maxHp && G.time.t - d.lastHit > 3) d.hp = d.maxHp;
  };
  DUMMIES.push(d);
  return d;
}

export const DUMMIES = [];
