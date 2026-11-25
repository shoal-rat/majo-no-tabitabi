// Non-elemental arts and the moon's hand: 结界 guard (block + perfect reflect), 月引 telekinesis (grab / hurl / drop),
// 式神 paper cranes, 金环 ultimate.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { clamp, easeOutCubic, TAU } from '../core/util.js';
import { glowDynamic } from '../core/mats.js';
import { t } from '../core/i18n.js';
import { BOOK, COLORS } from './book.js';
import { makeCrane } from './visuals.js';
import { segSeg, hostileReactor, targetPoint } from './projectiles.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion();
const PERFECT = 0.25;

export function createArts(S, V) {
  const guards = [];
  const thrown = [];
  let hold = null;       // { body|enemy, caster, team, tether, em, t }
  let cranes = null;

  /** Forward (flat) of a caster. */
  function fwd(c, out) {
    if (c === G.player) {
      if (G.player.aim?.dir) { out.copy(G.player.aim.dir); out.y = 0; }
      if (out.lengthSq() < 1e-4) out.set(Math.sin(G.player.yaw), 0, Math.cos(G.player.yaw));
      return out.normalize();
    }
    if (c && c.dir) return out.copy(c.dir).setY(0).normalize();
    if (c && typeof c.yaw === 'number') return out.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    return out.set(0, 0, 1);
  }
  function cpos(c, out) {
    const p = c && (c.pos || c.group?.position);
    return p ? out.copy(p) : out.set(0, 0, 0);
  }

  // ---- 结界 guard ------------------------------------------------------------------------------------------------
  function startGuard(c) {
    const caster = c.caster;
    for (const g of guards) if (g.caster === caster) return g;
    const mat = V.fresnel(COLORS.guard, { hex: 1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(V.shieldGeo, mat);
    mesh.renderOrder = 5;
    G.scene.add(mesh);
    const g = { caster, team: c.team, t: 0, mesh, mat, center: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), alive: true, out: 0,
      stop() { stopGuard(g); } };
    guards.push(g);
    place(g);
    G.fx?.burst('hit_sun', g.center, { scale: 1.1 });
    G.audio?.sfx('buff_defense', { pos: g.center, vol: 0.7 });
    if (caster === G.player) G.player.playAction?.('guard');
    return g;
  }
  function stopGuard(g) {
    if (!g.alive) return;
    g.alive = false;
    g.out = 0.0001;
    if (g.caster === G.player) G.player.playAction?.('guard_end');
  }
  function place(g) {
    cpos(g.caster, g.center);
    fwd(g.caster, g.fwd);
    g.center.y += (g.caster?.height || 1.6) * 0.6;
    g.center.addScaledVector(g.fwd, 0.35);
    g.mesh.position.copy(g.center);
    g.mesh.rotation.set(0, Math.atan2(g.fwd.x, g.fwd.z), 0);
  }
  function updateGuards(dt) {
    for (let i = guards.length - 1; i >= 0; i--) {
      const g = guards[i];
      g.t += dt;
      if (g.caster?.dead) stopGuard(g);
      place(g);
      const perfect = g.alive && g.t < PERFECT;
      let a;
      if (g.alive) a = clamp(g.t / 0.08) * (perfect ? 1.5 : 0.75 + 0.08 * Math.sin(g.t * 9));
      else { g.out += dt; a = 0.85 * (1 - g.out / 0.18); }
      g.mat.uniforms.uAlpha.value = Math.max(0, a);
      g.mat.uniforms.uTime.value = g.t;
      const s = g.alive ? 0.7 + 0.3 * easeOutCubic(g.t / 0.12) : 1 + g.out;
      g.mesh.scale.setScalar(s);
      if (!g.alive && g.out > 0.18) { g.mesh.removeFromParent(); g.mat.dispose(); guards.splice(i, 1); }
    }
  }
  /** Projectile p moving from a to b: does a hostile shield stop it? Returns true when handled. */
  S.guardCheck = (p, a, b) => {
    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];
      if (!g.alive || g.team === p.team) continue;
      const R = 1.45 + p.radius;
      if (segSeg(a, b, g.center, g.center) > R * R) continue;
      _v.subVectors(a, g.center);
      if (_v.dot(g.fwd) < -0.2) continue;          // came from behind
      if (g.t < PERFECT) reflect(p, g);
      else block(p, g);
      return true;
    }
    return false;
  };
  // the shield arm takes the blow (Guard_Hit), then back into the guard loop while the guard is still held
  function guardHitAnim(g, heavy) {
    const c = g.caster; if (!c) return;
    const back = (a) => { if (g.alive) a.play('guard', { layer: 'upper', fade: 0.1 }); else a.stop('upper', 0.15); return true; };
    if (c === G.player) G.player.playAction?.(heavy ? 'guard_break' : 'guard_hit', { faceAim: false, onDone: back });
    else c.actor?.play(heavy ? 'guard_break' : 'guard_hit', { layer: 'upper', restart: true, onDone: back });
  }
  function reflect(p, g) {
    guardHitAnim(g, false);
    const owner = p.owner;
    p.team = g.team; p.owner = g.caster; p.reflected = true; p.power *= 1.25; p.age = 0; p.life = Math.max(p.life, 2.5);
    p.pos.copy(g.center).addScaledVector(g.fwd, 1.6);
    const sp = Math.max(p.vel.length(), 24) * 1.2;
    if (owner && targetPoint(owner, _w)) { p.vel.subVectors(_w, p.pos).normalize().multiplyScalar(sp); p.target = owner; p.turn = Math.max(p.turn, 2.5); p.gravity = 0; }
    else p.vel.copy(g.fwd).multiplyScalar(sp);
    p.speed = sp;
    if (p.data) p.data.excludeBody = g.caster?.physChar || null;
    G.fx?.burst('clash', p.pos, { color: COLORS.guard, color2: p.color, scale: 1.2 });
    G.fx?.ring(p.pos, { color: COLORS.guard, radius: 2.4, dur: 0.35, y: p.pos.y });
    G.fx?.flash(p.pos, COLORS.guard, 120, 0.2, 14);
    // her perfect guard is her moment: a small callout over her shoulder (the guard ring and the star carry it); a rival's
    // reflect is a word over the rival
    if (g.caster === G.player) G.fx?.text?.(p.pos, t('spells.msg.perfect'), { kind: 'call', color: '#ffe6a6', dur: 0.9 });
    else G.fx?.text?.(_w.copy(p.pos).setY(p.pos.y + 0.8), t('spells.msg.perfect'), { kind: 'word', target: g.caster || null, color: '#ffe6a6', dur: 0.9 });
    G.audio?.sfx('bell_small', { pos: p.pos, pitch: 1.4 });
    G.audio?.sfx('hit_sun', { pos: p.pos });
    G.hitstop(0.09);
    S.shake(0.25, p.pos);
    S.addGauge(0.08, g.team);
    G.events.emit('spell:clash', { pos: p.pos.clone(), a: 'guard', b: p.el, result: 'reflect', defender: g.caster, attacker: owner });
  }
  function block(p, g) {
    guardHitAnim(g, p.damage * p.power >= 22);
    _v.copy(g.center).addScaledVector(g.fwd, 1.2);
    G.fx?.burst('hit_' + (p.el || 'sun'), _v, { dir: g.fwd, scale: 1 });
    G.fx?.burst('hit_sun', _v, { dir: g.fwd, scale: 0.8 });
    G.audio?.sfx('hit_heavy', { pos: _v, vol: 0.6 });
    // the blow lands on the shield: the guarder takes the reduced hit (player: ×0.2 in takeDamage)
    if (g.caster === G.player) G.player.takeDamage?.(p.damage * p.power, { element: p.el, from: p.owner || null, source: p.owner });
    else g.caster?.onBlocked?.(p);
    S.shake(0.1, _v);
    G.events.emit('spell:clash', { pos: _v.clone(), a: 'guard', b: p.el, result: 'block' });
    S.proj.release(p, 'blocked');
  }

  // ---- 月引 telekinesis -------------------------------------------------------------------------------------------
  function grab(c) {
    if (hold && hold.caster === c.caster) { hurl(c); return { hurled: true }; }
    let body = null, enemy = null;
    const aimB = c.caster === G.player ? G.player.aim?.body : null;
    const ok = (b) => b && b.alive !== false && b.type === 'dynamic' && !b.held && b.group !== 'debris' && b.group !== 'character' && b.mass < 450;
    if (ok(aimB)) body = aimB;
    if (!body && c.target && c.target.rb && ok(c.target)) body = c.target;
    if (!body && c.target && !c.target.rb && c.target.pos && !c.target.boss && (c.target.radius || 1) < 0.75 && c.target.team !== c.team) enemy = c.target;
    if (!body && !enemy && G.physics?.nearest && c.point) body = G.physics.nearest(c.point, 2.6, ok);
    if (!body && !enemy) {
      G.fx?.burst('hit_moon', c.point || c.origin, { scale: 0.6 });
      return { failed: true };
    }
    const thing = body || enemy;
    hold = { body, enemy, caster: c.caster, team: c.team, t: 0, tether: null, em: null, target: new THREE.Vector3() };
    if (body) body.held = true;
    if (enemy) { enemy.held = true; enemy.stun?.(1); }
    hold.tether = G.fx?.beam?.({ from: c.origin, to: thing.pos, color: COLORS.moon, width: 0.16, sparks: false, light: false, intensity: 0.8 }) || null;
    hold.em = G.fx?.emitter?.('aura_moon', { color: 'moon', scale: 0.8 }) || null;
    G.fx?.burst('hit_moon', thing.pos, { scale: 1.2 });
    G.audio?.sfx('cast_moon', { pos: thing.pos });
    S.holding = thing;
    return { grabbed: thing, stop: () => drop() };
  }
  function holdPoint(out) {
    const c = hold.caster;
    cpos(c, out);
    fwd(c, _f);
    const big = hold.body ? Math.min(1.5, (hold.body.radius || 0.5)) : 0.5;
    out.y += 1.7 + big * 0.5 + Math.sin(hold.t * 2.4) * 0.12;
    out.addScaledVector(_f, 2.3 + big);
    return out;
  }
  function updateHold(dt) {
    if (!hold) return;
    hold.t += dt;
    const thing = hold.body || hold.enemy;
    if (!thing || (hold.body && hold.body.alive === false) || (hold.enemy && hold.enemy.dead) || hold.caster?.dead) { drop(); return; }
    if (hold.caster === G.player && !G.player.spendMana(BOOK.moon.small.perSec * dt)) { S.toast('noMana'); drop(); return; }
    holdPoint(hold.target);
    if (hold.body) hold.body.setKinematicTarget(hold.target);
    else { hold.enemy.pos.lerp(hold.target, clamp(dt * 8)); hold.enemy.stun?.(0.3); }
    if (hold.caster === G.player) S.handPos(_v); else cpos(hold.caster, _v).setY(_v.y + 1.3);
    hold.tether?.set(_v, thing.pos);
    if (hold.em) hold.em.pos.copy(thing.pos);
  }
  function release() {
    const thing = hold.body || hold.enemy;
    if (hold.body) hold.body.held = false;
    if (hold.enemy) hold.enemy.held = false;
    hold.tether?.remove?.(); hold.em?.remove?.();
    const h = hold; hold = null; S.holding = null;
    return { thing, h };
  }
  function drop() {
    if (!hold) return;
    const { thing } = release();
    if (thing?.setVelocity) thing.setVelocity(_v.set(0, -1, 0));
    G.fx?.burst('hit_moon', thing.pos, { scale: 0.6 });
  }
  function hurl(c) {
    if (!hold) return;
    const { thing, h } = release();
    const d = c.point ? _w.subVectors(c.point, thing.pos) : _w.copy(c.dir);
    if (d.lengthSq() < 1) d.copy(c.dir);
    d.normalize();
    const speed = 34;
    if (thing.setVelocity) { thing.setVelocity(_v.copy(d).multiplyScalar(speed).add(_f.set(0, 2, 0))); thing.wake?.(); }
    else if (thing.vel) thing.vel.copy(d).multiplyScalar(speed * 0.6);
    thrown.push({ thing, team: h.team, caster: h.caster, t: 0, hit: new Set(), trail: G.fx?.trail?.({ color: COLORS.moon, color2: 0x6a5acd, width: 0.6, life: 0.35, style: 'band', pos: thing.pos }) || null });
    G.fx?.burst('hit_moon', thing.pos, { dir: d, scale: 1.4 });
    G.audio?.sfx('whoosh', { pos: thing.pos, vol: 0.9 });
    S.shake(0.12, thing.pos);
  }
  function updateThrown(dt) {
    for (let i = thrown.length - 1; i >= 0; i--) {
      const th = thrown[i];
      th.t += dt;
      const b = th.thing;
      if (!b || b.alive === false || th.t > 2.5) { th.trail?.stop?.(); thrown.splice(i, 1); continue; }
      th.trail?.push(b.pos);
      const sp = b.vel ? b.vel.length() : 0;
      if (sp < 4) continue;
      const rad = (b.radius || 0.5) + 0.7;
      G.elements?.query?.(b.pos, rad + 1.5, (r) => {
        if (!hostileReactor(r, th.team) || th.hit.has(r)) return;
        _v.set(r.pos.x, r.cy, r.pos.z);
        if (_v.distanceTo(b.pos) > rad + r.radius) return;
        th.hit.add(r);
        const dmg = Math.round(clamp(10 + (b.mass || 20) * 0.7, 14, 70) * clamp(sp / 25, 0.6, 1.4));
        G.elements.apply('moon', b.pos, rad + 0.4, 1, { source: th.caster, team: th.team, damage: dmg, heavy: true, noGround: true });
        G.fx?.burst('hit_moon', b.pos, { scale: 1.3 });
        G.audio?.sfx('hit_heavy', { pos: b.pos });
        S.shake(0.2, b.pos);
        G.hitstop(0.05);
      });
    }
  }

  // ---- 式神 paper cranes ------------------------------------------------------------------------------------------------
  function summon(c) {
    if (cranes) dismiss();
    const list = [];
    for (let i = 0; i < 2; i++) {
      const k = makeCrane(V.craneMat, V.craneAccent);
      k.group.scale.setScalar(1.6);
      cpos(c.caster, k.group.position).y += 1.8;
      G.scene.add(k.group);
      list.push({ ...k, i, state: 'orbit', t: 0, cd: 0.6 + i * 0.6, target: null, from: new THREE.Vector3(), to: new THREE.Vector3(), vel: new THREE.Vector3(),
        trail: G.fx?.trail?.({ color: 0xfff6dd, color2: 0xffc860, width: 0.12, life: 0.3, style: 'band', pos: k.group.position }) || null });
      G.fx?.burst('summon', k.group.position, { color: 0xfff3d6, scale: 0.7 });
    }
    cranes = { list, caster: c.caster, team: c.team, t: 0, life: 30, power: c.power };
    G.fx?.burst('feathers', cpos(c.caster, _v).setY(_v.y + 1.6), { color: 0xffffff, scale: 1 });
    G.audio?.sfx('paper', { pos: _v });
    G.audio?.sfx('wing_flap', { pos: _v });
    return { cranes, stop: dismiss };
  }
  function dismiss() {
    if (!cranes) return;
    for (const k of cranes.list) { G.fx?.burst('summon', k.group.position, { color: 0xfff3d6, scale: 0.6 }); k.trail?.stop?.(); k.group.removeFromParent(); }
    cranes = null;
  }
  function seek(k) {
    const cp = cpos(cranes.caster, _w);
    const team = cranes.team;
    let tgt = G.combat?.nearest?.(cp, 18, (e) => e && !e.dead && e.team !== team) || null;
    if (!tgt && G.elements?.nearest) tgt = G.elements.nearest(cp, 18, (r) => hostileReactor(r, team) && (r.living || r.kind === 'creature'));
    return tgt;
  }
  function updateCranes(dt) {
    if (!cranes) return;
    cranes.t += dt;
    if (cranes.t > cranes.life || cranes.caster?.dead) { dismiss(); return; }
    const cp = cpos(cranes.caster, _w).clone();
    for (const k of cranes.list) {
      k.t += dt;
      const flap = Math.sin(k.t * (k.state === 'dart' ? 26 : 12) + k.i) * 0.7;
      k.wingL.rotation.z = flap; k.wingR.rotation.z = -flap;
      const g = k.group;
      if (k.state === 'orbit') {
        const a = cranes.t * 1.9 + k.i * Math.PI;
        _v.set(cp.x + Math.cos(a) * 1.5, cp.y + 1.9 + Math.sin(cranes.t * 2.6 + k.i) * 0.25, cp.z + Math.sin(a) * 1.5);
        k.vel.subVectors(_v, g.position);
        g.position.lerp(_v, clamp(dt * 6));
        k.cd -= dt;
        if (k.cd <= 0) {
          k.cd = 1.4;
          const tgt = seek(k);
          if (tgt && targetPoint(tgt, k.to)) { k.target = tgt; k.state = 'dart'; k.t = 0; k.from.copy(g.position); G.audio?.sfx('wing_flap', { pos: g.position, vol: 0.5 }); }
        }
      } else if (k.state === 'dart') {
        if (k.target && targetPoint(k.target, _v)) k.to.copy(_v);
        const e = clamp(k.t / 0.32);
        _v.lerpVectors(k.from, k.to, easeOutCubic(e));
        _v.y += Math.sin(e * Math.PI) * 1.2;
        k.vel.subVectors(_v, g.position);
        g.position.copy(_v);
        if (e >= 1) {
          G.elements?.apply('sun', k.to, 1.3, 0.6 * cranes.power, { source: cranes.caster, team: cranes.team, damage: 10, noGround: true });
          G.fx?.burst('hit_sun', k.to, { scale: 0.8 });
          G.fx?.burst('feathers', k.to, { color: 0xffffff, scale: 0.5 });
          G.audio?.sfx('paper', { pos: k.to, vol: 0.6, pitch: 1.3 });
          k.state = 'back'; k.t = 0; k.from.copy(g.position);
        }
      } else {
        const e = clamp(k.t / 0.45);
        const a = cranes.t * 1.9 + k.i * Math.PI;
        _v.set(cp.x + Math.cos(a) * 1.5, cp.y + 1.9, cp.z + Math.sin(a) * 1.5);
        k.vel.subVectors(_v, g.position);
        g.position.lerpVectors(k.from, _v, easeOutCubic(e));
        if (e >= 1) k.state = 'orbit';
      }
      if (k.vel.lengthSq() > 1e-6) {
        g.rotation.y = Math.atan2(k.vel.x, k.vel.z);
        g.rotation.x = -clamp(k.vel.y * 2, -0.6, 0.6);
      }
      k.trail?.push(g.position);
    }
  }

  // ---- 金环 ultimate ---------------------------------------------------------------------------------------------------
  function kinkan(c) {
    const center = new THREE.Vector3();
    const cp = cpos(c.caster, new THREE.Vector3());
    if (c.point && c.point.distanceTo(cp) < 26) center.copy(c.point); else center.copy(cp).addScaledVector(fwd(c.caster, _f), 8);
    center.y = G.world.groundAt(center.x, center.z, center.y + 2);
    const R = 14;
    const isP = c.caster === G.player;
    G.sky?.setRingBoost?.(4);
    G.fx?.sigil?.(center, { color: COLORS.kinkan, radius: R, dur: 3.6, spin: 0.8 });
    G.fx?.ring(center, { color: COLORS.kinkan, radius: R, dur: 1, intensity: 2 });
    G.audio?.sfx('shrine_bell', { pos: center });
    G.audio?.sfx('koto_stinger', { vol: 0.8 });
    if (isP) {
      G.player.setControl?.(false);
      G.player.invulnerable?.(3.2);
      fwd(c.caster, _f);
      G.cam?.cinematic?.({ pos: _v.copy(cp).addScaledVector(_f, -7.5).setY(cp.y + 1.4), look: _w.copy(center).setY(center.y + 16), dur: 0.8, ease: 'out' });
    }
    // the pillar of gold light
    const outerMat = V.scroll(V.stripes, COLORS.kinkan, 0.75);
    outerMat.map = V.stripes.clone(); outerMat.map.needsUpdate = true; outerMat.map.repeat.set(6, 3);
    const innerMat = glowDynamic(0xfff1c0, 1.6, { transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const outer = new THREE.Mesh(V.tubeGeo, outerMat), inner = new THREE.Mesh(V.tubeGeo, innerMat);
    const grp = new THREE.Group(); grp.add(outer, inner); grp.position.copy(center); grp.visible = false;
    G.scene.add(grp);
    let beam = null;
    const team = c.team, caster = c.caster, power = c.power;
    let tt = 0, hitN = 0;
    S.ents.push({
      kind: 'kinkan',
      update(dt) {
        tt += dt;
        if (tt > 0.9 && !grp.visible) {
          grp.visible = true;
          _v.copy(center).setY(center.y + 1);
          G.elements?.apply('sun', _v, R, 3 * power, { source: caster, team, damage: 140 });
          G.physics?.explode(center, R, 12, { up: 0.9 });
          G.fx?.burst('greatlantern', _v, { color: COLORS.kinkan, scale: 1.4 });
          G.fx?.burst('purify', _v, { scale: 4, power: 3 });
          G.fx?.burst('explosion_big', _v, { color: 'sun', scale: 1.4, power: 3 });
          G.fx?.flash(_v, COLORS.kinkan, 500, 0.8, 70);
          G.sky?.flash?.(0xffe2a0, 0.4);
          G.audio?.sfx('explosion_large', { pos: center });
          G.audio?.sfx('learn_fanfare', { vol: 0.6 });
          S.shake(1, center);
          G.hitstop(0.12);
          beam = G.fx?.beam?.({ from: _w.copy(center).setY(center.y + 220), to: center, color: COLORS.kinkan, width: 5, intensity: 1.1 }) || null;
          hitN = 1;
        }
        if (grp.visible) {
          const life = tt - 0.9;
          const k = easeOutCubic(clamp(life / 0.35)) * clamp((2.6 - life) / 0.7);
          outer.scale.set(R * (0.4 + 0.6 * k), 240, R * (0.4 + 0.6 * k));
          inner.scale.set(R * 0.22 * k + 0.1, 240, R * 0.22 * k + 0.1);
          outerMat.opacity = k; innerMat.opacity = 0.4 * k;
          outerMat.map.offset.y -= dt * 1.4; outerMat.map.offset.x += dt * 0.1;
          if (hitN < 4 && life > hitN * 0.5) {
            hitN++;
            G.elements?.apply('sun', _v.copy(center).setY(center.y + 1), R, 1.5 * power, { source: caster, team, damage: 30 });
            G.fx?.ring(center, { color: COLORS.kinkan, radius: R, dur: 0.6, intensity: 2 });
            S.shake(0.3, center);
          }
          if (life > 1.1 && isP && G.cam?.cinematicActive) { G.cam.release?.(); G.player.setControl?.(true); }
          if (life > 2.6) return false;
        }
        return true;
      },
      dispose() {
        grp.removeFromParent(); outerMat.map.dispose(); outerMat.dispose(); innerMat.dispose();
        beam?.remove?.();
        G.sky?.setRingBoost?.(1);
        if (isP) { if (G.cam?.cinematicActive) G.cam.release?.(); G.player.setControl?.(true); }
      },
    });
    return { center };
  }

  S.guards = guards;
  return {
    guards, thrown,
    startGuard, stopGuard, grab, drop, hurl, summon, dismiss, kinkan,
    get holding() { return hold ? (hold.body || hold.enemy) : null; },
    get cranes() { return cranes; },
    holdsFor(c) { return !!hold && hold.caster === c; },
    update(dt) { updateGuards(dt); updateHold(dt); updateThrown(dt); updateCranes(dt); },
    clear() {
      if (hold) drop();
      dismiss();
      for (const g of guards) { g.mesh.removeFromParent(); g.mat.dispose(); }
      guards.length = 0;
      for (const th of thrown) th.trail?.stop?.();
      thrown.length = 0;
    },
  };
}

export { TAU };
