// The sixteen element forms (§3.3). Each acts on the world ONLY through G.elements.apply / G.physics / G.world, and
// dresses itself in G.fx / G.audio / camera shake. Signature: FORMS[element][form](c) where c is the cast context
// { S, caster, team, origin, dir, point, target, power, handle }.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { clamp, easeOutBack, easeOutCubic, TAU } from '../core/util.js';
import { COLORS, damageOf } from './book.js';
import { targetPoint, hostileReactor } from './projectiles.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();

/** Launch velocity that lobs from `from` onto `to` at `speed` under gravity g (low arc; 45° if out of reach). */
export function ballistic(from, to, speed, g, out) {
  const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y;
  const d = Math.hypot(dx, dz);
  if (d < 0.5 || g <= 0) return out.subVectors(to, from).normalize().multiplyScalar(speed);
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * d * d + 2 * dy * v2);
  const ang = disc < 0 ? Math.PI / 4 : Math.atan((v2 - Math.sqrt(disc)) / (g * d));
  const c = Math.cos(ang) * speed;
  return out.set((dx / d) * c, Math.sin(ang) * speed, (dz / d) * c);
}

const SMALL_ORB_TRAIL = (color, w = 0.35) => ({ color, color2: color, width: w, life: 0.13, intensity: 1.6 });

// ---- impacts ------------------------------------------------------------------------------------------------------
// fix2: enemy spells never set the grass alight (a caster's fireball used to start a night fire that swallowed the screen)
function info(p, extra) { return { source: p.owner, team: p.team, damage: Math.round(p.damage * p.power), dir: p.vel, ...(p.team === 'enemy' ? { noGround: true } : null), ...extra }; }

function enemyMiss(p, h) { return p.team === 'enemy' && !(h && h.reactor && h.reactor.team === 'player'); }

const fireSmall = {
  impact(p, h) {
    const S = p.data.S, at = h.point;
    if (h.water) { G.fx?.burst('steam', at, { scale: 1.2 }); G.audio?.sfx('steam_sizzle', { pos: at }); G.elements?.apply('fire', at, 2, p.power, info(p)); return; }
    // fix2: an enemy fireball only scorches the heroine's side — a miss into a tree lit the tree, the tree lit the
    // grass, and a night camp turned into a screen-swallowing fire
    if (!enemyMiss(p, h)) G.elements?.apply('fire', at, p.team === 'enemy' ? 1.1 : 3, p.power, info(p));
    G.physics?.explode(at, 3.4, 7 * p.power, { up: 0.45 });
    _v.copy(at).addScaledVector(h.normal, 0.4);
    G.fx?.burst('explosion', _v, { color: 'fire', normal: h.normal, scale: 0.75 * Math.sqrt(p.power), power: p.power });
    G.fx?.burst('embers', _v, { dir: p.vel, normal: h.normal, scale: 0.7 });
    G.fx?.flash(_v, COLORS.fire, 70 * p.power, 0.22, 16);
    G.audio?.sfx('explosion_small', { pos: at, vol: 0.8 });
    S.shake(0.22 * p.power, at);
  },
  expire(p) { G.fx?.burst('hit_fire', p.pos, { scale: 0.6 }); },
};
const fireBig = {
  impact(p, h) {
    const S = p.data.S, at = h.point;
    if (h.water) { G.fx?.burst('steam', at, { scale: 3 }); G.fx?.burst('splash', at, { scale: 2.5 }); G.audio?.sfx('steam_sizzle', { pos: at, vol: 1.2 }); return; }
    if (!enemyMiss(p, h)) G.elements?.apply('fire', at, p.team === 'enemy' ? 3 : 7, 1.4 * p.power, info(p));
    G.physics?.explode(at, 7.5, 16 * p.power, { up: 0.55 });
    _v.copy(at).addScaledVector(h.normal, 0.6);
    G.fx?.burst('explosion_big', _v, { color: 'fire', normal: h.normal, scale: Math.sqrt(p.power), power: 1.5 * p.power });
    G.fx?.ring(at, { color: COLORS.fire, radius: 8, dur: 0.8, intensity: 2.2 });
    G.fx?.flash(_v, COLORS.fire, 220 * p.power, 0.45, 40);
    G.audio?.sfx('explosion_large', { pos: at });
    G.audio?.sfx('cast_fire_2', { pos: at, vol: 0.6 });
    S.shake(0.62 * p.power, at);
    G.hitstop(0.07); G.cam?.fovKick?.(0.3);   // look: hit-stop + a small camera kick on every big hit
    // 火环: a ring of ground fire just inside the blast
    const gx = at.x, gz = at.z;
    if (p.team !== 'enemy') S.after(0.12, () => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const x = gx + Math.cos(a) * 5.6, z = gz + Math.sin(a) * 5.6;
        G.elements?.igniteGround?.(x, z, 1.1, 1);
        if (i % 3 === 0) { _w.set(x, G.world.heightAt(x, z) + 0.4, z); G.fx?.burst('ignite', _w, { scale: 0.8 }); }
      }
    });
  },
};
const waterSmall = {
  impact(p, h) {
    const S = p.data.S, at = h.point;
    G.elements?.apply('water', at, 4, p.power, info(p));
    G.physics?.explode(at, 4, 6 * p.power, { up: 0.2 });
    _v.copy(at).addScaledVector(h.normal, 0.3);
    G.fx?.burst('splash', _v, { scale: 1.9, power: p.power });   // look: big enough to read at 10-15 m
    G.fx?.burst('hit_water', _v, { dir: p.vel, scale: 1.4 });
    G.fx?.kit?.crown?.(_v, 1.3, { dur: 0.55 });
    G.fx?.ring(at, { color: COLORS.water, radius: 4, dur: 0.5 });
    G.audio?.sfx('splash', { pos: at, vol: 0.9 });
    G.audio?.sfx('hit_water', { pos: at, vol: 0.6 });
    S.shake(0.08, at);
  },
  expire(p) { G.fx?.burst('splash', p.pos, { scale: 0.6 }); },
};
const iceSmall = {
  impact(p, h) {
    const S = p.data.S, at = h.point;
    if (h.reactor) {
      _v.set(h.reactor.pos.x, h.reactor.cy, h.reactor.pos.z);
      G.elements?.apply('ice', _v, Math.max(1.2, h.reactor.radius + 0.4), p.power, info(p, { noGround: true }));
      G.fx?.burst('hit_ice', at, { dir: p.vel, scale: 1.1 });
      G.audio?.sfx('hit_ice', { pos: at, vol: 0.8 });
      S.shake(0.06, at);
      return 'pierce';
    }
    if (h.water) {
      G.elements?.apply('ice', at, 3.6, p.power, info(p));
      G.fx?.burst('shatter_ice', at, { scale: 0.8 });
      G.audio?.sfx('ice_shatter', { pos: at, vol: 0.7 });
      return;
    }
    G.elements?.apply('ice', at, 2.4, p.power, info(p));
    _v.copy(at).addScaledVector(h.normal, 0.3);
    G.fx?.burst('shatter_ice', _v, { scale: 0.7 });
    G.fx?.ring(at, { color: 0x8fd0eb, radius: 2.45, dur: 0.38, intensity: .75, thickness: .07 });
    G.audio?.sfx('ice_shatter', { pos: at, vol: 0.6 });
    S.shake(0.1, at);
  },
  expire(p) { G.fx?.burst('hit_ice', p.pos, { scale: 0.6 }); },
};
// pt-b: a charm at a locked target flies far enough to reach it (无明's weak points sit ~78 m from the landing; 2.2 s × 30 m/s fell short)
function charmLife(c) {
  const tp = c.target && (c.target.pos || c.target.position);
  const o = c.origin || G.player?.pos;
  if (!tp || !o || c.team !== 'player') return 2.2;
  return Math.min(3.4, Math.max(2.2, Math.hypot(tp.x - o.x, tp.y - o.y, tp.z - o.z) / 30 + 0.35));
}
const charmDef = {
  impact(p, h) {
    const at = h.point;
    // a tree trunk is a static collider, not a reactor in the way: a hit on one still reaches the tree (chopping, flora/life.js)
    const trunk = !h.reactor && !h.body && h.ground && p.team === 'player' && G.flora?.treesNear?.(at, 1.6)?.some?.((tr) => Math.hypot(tr.pos.x - at.x, tr.pos.z - at.z) < 1.4);
    if (h.reactor || h.body || trunk) G.elements?.apply('sun', at, 1.1, 0.35 * p.power, info(p, { noGround: true }));
    G.fx?.burst('hit_sun', at, { dir: p.vel, scale: 0.7 });
    G.audio?.sfx('paper', { pos: at, vol: 0.5, pitch: 1.2 });
    if (h.body && G.physics) { _v.copy(p.vel).normalize().multiplyScalar(1.2); h.body.applyImpulse?.(_v.multiplyScalar(Math.min(6, h.body.mass * 0.06))); }
  },
  expire(p) { G.fx?.burst('hit_sun', p.pos, { scale: 0.4 }); },
};
const moteDef = { impact() {}, expire() {} };

// ---- casting helpers ----------------------------------------------------------------------------------------------
function shoot(c, o) {
  const S = c.S;
  const speed = o.speed;
  if (o.gravity && c.point) ballistic(c.origin, c.point, speed, o.gravity, _v);
  else _v.copy(c.dir).multiplyScalar(speed);
  return S.proj.spawn({
    el: o.el, shape: o.shape || 'orb', pos: c.origin, vel: _v, color: o.color ?? COLORS[o.el], size: o.size, radius: o.radius,
    power: c.power, team: c.team, owner: c.caster, life: o.life ?? 3, gravity: o.gravity || 0, target: o.homing ? c.target : null,
    turn: o.homing || 0, pierce: o.pierce || 0, def: o.def, damage: o.damage ?? damageOf(c.id, c.form), spell: c.id, form: c.form,
    trail: o.trail, emitter: o.emitter, emitterScale: o.emitterScale, data: { S, excludeBody: c.caster?.physChar || null },
  });
}

/** Ground point near p (or p itself if it is on a platform). */
function ground(p, out) { return out.set(p.x, G.world.groundAt(p.x, p.z, p.y + 1), p.z); }

/** Clamp a target point to `max` metres from the caster, on the ground. */
function reach(c, max, out) {
  _f.copy(c.point || _u.copy(c.origin).addScaledVector(c.dir, max * 0.6));
  const o = c.casterPos;
  const dx = _f.x - o.x, dz = _f.z - o.z, d = Math.hypot(dx, dz);
  if (d > max) { _f.x = o.x + dx / d * max; _f.z = o.z + dz / d * max; _f.y = G.world.groundAt(_f.x, _f.z); }
  return out.copy(_f);
}

// ---- the forms ----------------------------------------------------------------------------------------------------
export const FORMS = {
  charm: {
    small(c) {
      const p = shoot(c, { el: 'sun', shape: 'orb', speed: 30, size: 0.21, radius: 0.25, homing: c.target ? 3.2 : 0, life: charmLife(c), def: charmDef,
        color: COLORS.charm, damage: c.team === 'player' ? Math.round(12 * (1 + 0.15 * (G.state?.upgrades?.charm || 0))) : 12, trail: { color: 0xfff1c4, color2: 0xffb050, width: 0.16, life: 0.22, intensity: 1.6 } });
      G.audio?.sfx('cast_wind', { pos: c.origin, vol: 0.24, pitch: 1.25 });
      return { projectile: p };
    },
  },
  fire: {
    small(c) {
      const p = shoot(c, { el: 'fire', speed: 38, gravity: 5, size: 0.38, radius: 0.4, homing: c.target ? 1.2 : 0, def: fireSmall,
        trail: { style: 'streaks', color: 0xffa025, color2: 0xe84314, width: 0.11, life: 0.095, intensity: 0.75 }, emitter: 'embers', emitterScale: 0.42 });
      G.audio?.sfx('cast_fire', { pos: c.origin, vol: 0.8 });
      return { projectile: p };
    },
    big(c) {
      const p = shoot(c, { el: 'fire', speed: 30, gravity: 15, size: 0.95, radius: 0.9, def: fireBig, life: 5,
        trail: { style: 'streaks', color: 0xff9c29, color2: 0xe44316, width: 0.26, life: 0.165, intensity: 0.85 }, emitter: 'embers', emitterScale: 0.72 });
      G.audio?.sfx('cast_fire_2', { pos: c.origin });
      G.fx?.burst('embers', c.origin, { normal: c.dir, scale: 0.65 });
      return { projectile: p };
    },
  },
  water: {
    small(c) {
      const p = shoot(c, { el: 'water', speed: 34, gravity: 6, size: 0.36, radius: 0.4, homing: c.target ? 1 : 0, def: waterSmall,
        trail: SMALL_ORB_TRAIL(COLORS.water, 0.32) });
      G.audio?.sfx('cast_water', { pos: c.origin, vol: 0.7 });
      return { projectile: p };
    },
    big(c) {
      const S = c.S;
      const at = reach(c, 60, new THREE.Vector3());
      ground(at, at);
      // a bead of water rises from her hand into the sky, then the cloud gathers over the target
      _w.set(0, 1, 0);
      S.proj.spawn({ el: 'water', pos: c.origin, vel: _v.set(c.dir.x * 4, 26, c.dir.z * 4), color: COLORS.water, size: 0.3, team: c.team,
        owner: c.caster, life: 0.7, def: moteDef, trail: SMALL_ORB_TRAIL(COLORS.water, 0.25), data: { S } });
      G.fx?.burst('magic_circle', ground(c.casterPos, _u), { color: 'water', scale: 0.8 });
      G.fx?.sigil?.(at, { color: COLORS.water, radius: 5, dur: 2.2 });
      G.audio?.sfx('cast_water', { pos: c.origin });
      const h = { zone: null };
      S.after(0.7, () => {
        h.zone = G.elements?.rain?.(at.x, at.z, 18, 20) || null;
        S.fusions?.addRain(h.zone, c.team, c.caster);   // 合咏: thunder / ice / fire / wind cast into the cloud
        G.fx?.ring(at, { color: COLORS.water, radius: 18, dur: 1.4, intensity: 1.4 });
        G.audio?.sfx('splash', { pos: at, vol: 0.6, pitch: 0.7 });
      });
      h.stop = () => { h.zone?.remove?.(); };
      return h;
    },
  },
  ice: {
    small(c) {
      const p = shoot(c, { el: 'ice', shape: 'lance', speed: 62, size: 0.55, radius: 0.35, pierce: 3, life: 1.3, def: iceSmall,
        homing: c.target ? 0.8 : 0, trail: { color: 0xe6fbff, color2: 0x7fd4ff, width: 0.24, life: 0.25, intensity: 2.2 } });
      G.audio?.sfx('cast_ice', { pos: c.origin, vol: 0.8 });
      return { projectile: p };
    },
    big(c) {
      const S = c.S;
      const at = reach(c, 40, new THREE.Vector3());
      ground(at, at);
      G.fx?.sigil?.(at, { color: COLORS.ice, radius: 7.5, dur: 0.7, spin: 2 });
      G.audio?.sfx('cast_ice', { pos: at });
      const caster = c.caster, team = c.team, power = c.power, dmg = damageOf('ice', 'big');
      S.after(0.35, () => {
        _v.copy(at); _v.y += 0.8;
        G.elements?.apply('ice', _v, 8, 2 * power, { source: caster, team, damage: dmg });
        G.fx?.burst('shatter_ice', _v, { scale: 2.4, power: 2 });
        G.fx?.ring(at, { color: COLORS.ice, radius: 8.5, dur: 0.7, intensity: 2.5 });
        G.fx?.flash(_v, COLORS.ice, 120, 0.3, 24);
        G.audio?.sfx('ice_shatter', { pos: at, vol: 1.2 });
        G.physics?.explode(at, 8, 8 * power, { up: 0.5 });
        S.shake(0.45, at);
        G.hitstop(0.07); G.cam?.fovKick?.(0.3);   // look: hit-stop + camera kick
        if (G.world.isWater(at.x, at.z)) G.elements?.freezeWater?.(at.x, at.z, 8, 30);
        else S.spawnDais(at, caster);
      });
      return {};
    },
  },
  wind: {
    small(c) {
      const S = c.S;
      _f.copy(c.dir); _f.y = clamp(_f.y, -0.35, 0.5); _f.normalize();
      const o = c.origin, power = c.power;
      G.physics?.pushCone(o, _f, 14, 0.62, 19 * power);
      _v.copy(o).addScaledVector(_f, 6);
      G.elements?.apply('wind', _v, 6.5, power, { source: c.caster, team: c.team, dir: _f.clone(), damage: damageOf('wind', 'small'), impulse: 0.01, halfAngle: 0.6 });
      // deflect hostile projectiles inside the cone
      S.proj.each((p) => {
        if (p.team === c.team || !p.alive) return;
        _w.subVectors(p.pos, o);
        const d = _w.length();
        if (d > 13 || d < 0.01 || _w.dot(_f) / d < Math.cos(0.7)) return;
        const sp = p.vel.length();
        p.vel.normalize().addScaledVector(_f, 1.8).normalize().multiplyScalar(sp * 1.05);
        p.target = null; p.deflected++;
        G.fx?.burst('hit_wind', p.pos, { dir: _f, scale: 0.8 });
        G.events.emit('spell:clash', { pos: p.pos.clone(), a: 'wind', b: p.el, result: 'deflect' });
        S.addGauge(0.03, c.team);
      });
      // 合咏 风火: her own fireballs inside the gust swell and speed up
      S.fusions?.fanShots(o, _f, c.team);
      // Three tapering air sheets travel down the physical cone, leaving the
      // centre open so the caster and the objects being pushed remain legible.
      G.fx?.kit?.windWake?.(o,_f,12.2,2.36);
      _v.copy(o).addScaledVector(_f,5.5);
      G.fx?.burst('leaves',_v,{dir:_f,scale:1.1});
      G.audio?.sfx('cast_wind', { pos: o, vol: 0.9 });
      G.audio?.sfx('whoosh', { pos: o, vol: 0.6 });
      S.shake(0.08, o);
      return {};
    },
    big(c) {
      const S = c.S;
      const at = reach(c, 45, new THREE.Vector3());
      ground(at, at);
      return S.spawnTornado(at, c);
    },
  },
  thunder: {
    small(c) {
      const S = c.S;
      const at = new THREE.Vector3();
      if (c.target && targetPoint(c.target, at) && at.distanceTo(c.casterPos) < 42) { /* locked on */ }
      else { reach(c, 40, at); if (!c.point) ground(at, at); }
      const team = c.team, caster = c.caster, power = c.power, dmg = damageOf('thunder', 'small');
      ground(at, _u);
      G.fx?.sigil?.(_u, { color: COLORS.thunder, radius: 1.8, dur: 0.45, spin: 4 });
      G.fx?.ring(_u, { color: COLORS.thunder, radius: 2.4, dur: 0.35 });
      G.audio?.sfx('zap', { pos: at, vol: 0.5 });
      S.after(0.35, () => S.strike(at, 2.6, power, { source: caster, team, damage: dmg }, 1));
      return {};
    },
    big(c) {
      const S = c.S;
      const at = reach(c, 40, new THREE.Vector3());
      ground(at, at);
      const team = c.team, caster = c.caster, power = c.power, dmg = damageOf('thunder', 'big');
      G.fx?.sigil?.(at, { color: COLORS.thunder, radius: 10, dur: 2.1, spin: 1.5 });
      G.fx?.ring(at, { color: COLORS.thunder, radius: 10, dur: 1.2, intensity: 1.6 });
      G.sky?.flash?.(0x8f6cff, 0.25);
      G.audio?.sfx('taiko_roll', { pos: at });
      // five strikes on whatever hostile stands inside, else scattered, then the great one
      const spots = [];
      G.elements?.query?.(at, 10, (r) => { if (hostileReactor(r, team) && spots.length < 5) spots.push(new THREE.Vector3(r.pos.x, r.cy, r.pos.z)); });
      while (spots.length < 5) {
        const a = Math.random() * TAU, d = 2.5 + Math.random() * 7;
        const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
        spots.push(new THREE.Vector3(x, G.world.groundAt(x, z), z));
      }
      spots.forEach((s, i) => S.after(0.55 + i * 0.2, () => S.strike(s, 2.6, power, { source: caster, team, damage: Math.round(dmg * 0.35) }, 0.8)));
      S.after(0.55 + 5 * 0.2 + 0.25, () => {
        S.strike(at, 4.5, 2 * power, { source: caster, team, damage: dmg }, 2.2);
        G.physics?.explode(at, 6, 12 * power, { up: 0.6 });
        _v.copy(at); _v.y += 0.8;
        G.fx?.burst('explosion', _v, { color: 'thunder', scale: 1.3, power: 2 });
        G.hitstop(0.07); G.cam?.fovKick?.(0.25);   // look: camera kick
      });
      return {};
    },
  },
  earth: {
    small(c) {
      const S = c.S;
      const at = reach(c, 30, new THREE.Vector3());
      ground(at, at);
      if (G.world.isWater(at.x, at.z)) {
        _v.set(at.x, 0, at.z);
        G.fx?.burst('splash', _v, { scale: 2 }); G.audio?.sfx('splash', { pos: _v });
        return {};
      }
      return S.spawnPillar(at, c);
    },
    big(c) {
      const S = c.S;
      const at = reach(c, 60, new THREE.Vector3());
      ground(at, at);
      return S.spawnMeteor(at, c);
    },
  },
  sun: {
    small(c) {
      const S = c.S;
      const at = new THREE.Vector3().copy(c.casterPos); at.y += 1.0;
      G.elements?.apply('sun', at, 9, c.power, { source: c.caster, team: c.team, damage: damageOf('sun', 'small') });
      G.fx?.burst('purify', at, { scale: 2.2, power: 1.5 });
      G.fx?.ring(ground(at, _u), { color: COLORS.sun, radius: 9.5, dur: 0.8, intensity: 2.4 });
      G.fx?.flash(at, COLORS.sun, 160, 0.4, 26);
      G.audio?.sfx('cast_sun', { pos: at });
      G.audio?.sfx('shrine_bell', { pos: at, vol: 0.5 });
      S.shake(0.18, at);
      S.spawnLightOrb(at, c);
      return {};
    },
    big(c) { return c.S.beams.start(c); },
  },
  moon: {
    small(c) { return c.S.arts.grab(c); },
    big(c) {
      const S = c.S;
      const at = reach(c, 40, new THREE.Vector3());
      ground(at, at);
      return S.spawnBubble(at, c);
    },
  },
};

export { easeOutBack, easeOutCubic };
