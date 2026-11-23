// 天照 sustained beams and 对波 (beam struggle). A beam follows its caster (origin + dir, or the player's aim), burns
// what it touches through apply('sun'), and drains mana per second for the player. When two hostile beams meet, both
// lock onto a clash point that travels along the line between the casters according to each side's push.
// The guard holds a beam too (2026-11): a hostile beam that lands on her raised guard, from in front, is met by a beam
// of light the guard throws back (no mana, `free`) — the two clash and the struggle is hers to win by mashing {attack}.
// That beam ends with the struggle or when she lowers the guard.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { clamp } from '../core/util.js';
import { t } from '../core/i18n.js';
import { BOOK, COLORS } from './book.js';
import { segSeg, hostileReactor } from './projectiles.js';

const LEN = 42, TICK = 0.12;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const _hit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), body: null, surface: '', owner: null };

/** look only: which element palette a beam is painted in */
function lookElement(c) {
  if (c.el) return c.el;
  if (c.caster === G.player) return 'sun';
  const e = c.caster?.cfg?.el;
  return e === 'all' ? 'moon' : e || 'moon';
}

export function createBeams(S) {
  const list = [];
  let struggle = null;
  let mash = 0;        // player's recent attack presses (decaying rate)

  function casterOrigin(b, out) {
    const c = b.caster;
    if (c === G.player) return S.handPos(out);
    if (b.fixedOrigin) return out.copy(b.fixedOrigin);
    const p = c && (c.pos || c.group?.position);
    if (!p) return out.copy(b.origin);
    out.set(p.x, p.y + (c.height || 1.6) * 0.72, p.z);
    if (b.dir) out.addScaledVector(b.dir, 0.6);
    return out;
  }

  const api = {
    list,
    get struggle() { return struggle; },
    /** cast context -> beam handle. opts honoured: c.duration (AI, default 4 s), c.strength (AI push, default 1). */
    start(c) {
      const b = {
        caster: c.caster, team: c.team, power: c.power, origin: c.origin.clone(), dir: c.dir.clone().normalize(), to: new THREE.Vector3(),
        fixedOrigin: c.fixedOrigin ? c.origin.clone() : null, aimed: c.caster === G.player && !c.dir_locked,
        t: 0, tick: 0, alive: true, duration: c.caster === G.player ? Infinity : (c.duration ?? 4), strength: c.strength ?? 1,
        fx: null, em: null, struggling: false, id: Math.random(), free: !!c.free,
        // non-player beams sweep toward their target at `track` rad-ish/s (fix2: a fixed flat beam missed on slopes)
        len: c.len ?? LEN, // reach (m); 无明's breath uses a longer one
        target: c.caster === G.player ? null : c.target || null, track: c.track ?? (c.caster === G.player ? 0 : 1.1),
        stop() { api.stop(b); },
      };
      b.to.copy(b.origin).addScaledVector(b.dir, b.len);
      // look only: every beam is painted in its caster's element — the heroine's 天照 is sun gold, a rival's takes her
      // own element (c.el, else the caster's cfg.el; 'all' = moon), so a struggle reads as two colours
      b.lookEl = lookElement(c);
      b.lookColor = c.caster === G.player ? COLORS.sun : (c.color ?? COLORS[b.lookEl] ?? 0xc87bff);
      b.fx = G.fx?.beam?.({ from: b.origin, to: b.to, color: b.lookColor, el: b.lookEl, width: 0.8 * Math.sqrt(c.power), intensity: 1 - 0.3 * Math.min(1, G.env?.veil ?? 0) }) || null;
      b.em = G.fx?.emitter?.('aura_sun', { color: 'sun', scale: 0.7 }) || null;
      G.fx?.burst('hit_sun', b.origin, { scale: 1.4 });
      G.audio?.sfx('cast_sun', { pos: b.origin, vol: 1.1 });
      b.hum = G.audio?.loop?.('beam_hum', { vol: 0.5, pos: b.origin }) || null;
      list.push(b);
      return b;
    },
    stop(b) {
      if (!b || !b.alive) return;
      b.alive = false;
      const i = list.indexOf(b); if (i >= 0) list.splice(i, 1);
      try { b.fx?.remove(); } catch (e) { /* ignore */ }
      try { b.em?.remove(); } catch (e) { /* ignore */ }
      try { b.hum?.stop?.(0.2); } catch (e) { /* ignore */ }
      b.fx = null; b.em = null;
      if (struggle && (struggle.a === b || struggle.b === b)) endStruggle(struggle.a === b ? struggle.b : struggle.a, 'stopped');
    },
    clear() { while (list.length) api.stop(list[list.length - 1]); struggle = null; G.ui?.struggle?.(null); },
    /** player mash input (attack presses during a struggle) */
    mash() { mash += 1; },
    update(dt) {
      if (!(dt > 0)) return;
      mash = Math.max(0, mash - mash * 1.6 * dt);
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (!b) continue; // a stop() inside this loop can end a struggle and remove two beams
        b.t += dt;
        if (b.t > b.duration || (b.caster && b.caster.dead)) { api.stop(b); continue; }
        // player: mana per second
        if (b.caster === G.player && G.player && !b.free) {
          // fix2: a struggle is a contest of will, not of mana — no drain while struggling
          if (!b.struggling && !G.player.spendMana(BOOK.sun.big.perSec * dt)) { S.toast('noMana'); api.stop(b); continue; }
        }
        casterOrigin(b, b.origin);
        if (!b.aimed && !b.struggling && b.target && b.track > 0) {
          const tp = b.target.isVector3 ? b.target : b.target.pos;
          if (tp) {
            _d.set(tp.x, tp.y + (b.target.isVector3 ? 0 : (b.target.height || 1.6) * 0.55), tp.z).sub(b.origin);
            if (_d.lengthSq() > 4) b.dir.lerp(_d.normalize(), clamp(dt * b.track)).normalize();
          }
        }
        if (b.aimed && !b.struggling && G.player?.aim) {
          // aim from the hand toward the crosshair point
          _d.subVectors(G.player.aim.point, b.origin);
          if (_d.lengthSq() > 4) b.dir.lerp(_d.normalize(), clamp(dt * 14)).normalize();
          // fix2: a locked target past the normal reach (无明's weak points, ~55 m) still gets the beam
          const lt = G.combat?.lockTarget;
          b.len = lt && !lt.dead && lt.pos ? clamp(lt.pos.distanceTo(b.origin) + 4, LEN, 75) : LEN;
        }
        if (!b.struggling) {
          let len = b.len;
          const rc = G.physics?.raycast ? G.physics.raycast(b.origin, b.dir, b.len, { out: _hit, exclude: b.caster?.physChar }) : null;
          if (rc) len = rc.dist;
          else { const gd = G.world.raycastGround(b.origin, b.dir, b.len); if (gd < b.len) len = gd; }
          // stop at the first hostile reactor along the beam
          len = firstReactor(b, len);
          b.to.copy(b.origin).addScaledVector(b.dir, len);
          b.hitLen = len;
        }
        b.fx?.set(b.origin, b.to);
        if (b.em) b.em.pos.copy(b.origin);
        b.hum?.setPos?.(b.origin);
        b.tick -= dt;
        if (b.tick <= 0 && !b.struggling) {
          b.tick = TICK;
          const dmg = Math.round(BOOK.sun.big.perSec * 2.2 * TICK * b.power * 10) / 10;
          G.elements?.apply('sun', b.to, 2.2, 0.7 * b.power, { source: b.caster, team: b.team, damage: Math.max(2, dmg), dir: b.dir });
          G.fx?.burst('hit_sun', b.to, { dir: b.dir, scale: 0.9 });
          G.physics?.explode(b.to, 2, 2.5, { up: 0.2 });
        }
        // the beam also burns hostile projectiles it touches
        S.proj.each((p) => {
          if (p.team === b.team || !p.alive) return;
          if (segSeg(b.origin, b.to, p.pos, p.pos) < (p.radius + 0.6) ** 2) {
            G.fx?.burst('clash', p.pos, { color: COLORS.sun, color2: p.color });
            S.proj.release(p, 'beam');
          }
        });
      }
      guardCatch();
      findStruggles();
      if (struggle) updateStruggle(dt);
    },
  };

  function firstReactor(b, len) {
    let best = len;
    if (!G.elements?.query) return best;
    for (let s = 2; s < len; s += 3) {
      _v.copy(b.origin).addScaledVector(b.dir, s);
      G.elements.query(_v, 2, (r) => {
        if (!hostileReactor(r, b.team)) return;
        _w.set(r.pos.x, r.cy, r.pos.z).sub(b.origin);
        const along = _w.dot(b.dir);
        if (along > 0 && along < best) {
          const perp2 = _w.lengthSq() - along * along;
          if (perp2 < (r.radius + 0.6) ** 2) best = Math.max(0.5, along - r.radius * 0.5);
        }
      });
      if (best < s) break;
    }
    return best;
  }

  // ---- the guard meets a beam ----
  let held = null;   // the guard's answering beam, while it lives
  function guardCatch() {
    const P = G.player;
    if (held && (!held.alive || (!held.struggling && !(S.guards || []).some((g) => g.caster === P && g.alive)))) { if (held.alive) api.stop(held); held = null; }
    if (held || struggle || !P || P.dead) return;
    const g = (S.guards || []).find((x) => x.caster === P && x.alive);
    if (!g) return;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.team === 'player' || !b.alive || b.struggling) continue;
      _v.set(P.pos.x, P.pos.y + 1.1, P.pos.z);
      if (b.to.distanceTo(_v) > 2.6) continue;
      _d.subVectors(b.origin, _v); _d.y = 0;
      if (_d.lengthSq() > 1e-4 && _d.normalize().dot(_w.set(g.fwd.x, 0, g.fwd.z)) < -0.1) continue;   // from behind
      _d.subVectors(b.origin, g.center).normalize();
      held = api.start({ caster: P, team: 'player', power: 1, origin: g.center, dir: _d, dir_locked: true, free: true });
      G.events.emit('beam:guard', { beam: b });
      return;
    }
  }

  function findStruggles() {
    if (struggle || list.length < 2) return;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.team === b.team) continue;
      // fix2: two beams fired at each other (directions opposed) clash even when one aims a little off the other's
      // line — the player aims at a weak point while the breath aims at her, and a 1.6 m tolerance never met
      const opposed = a.dir.dot(b.dir) < -0.8;
      const tol = opposed ? 6 : 1.6;
      if (segSeg(a.origin, a.to, b.origin, b.to) < tol * tol) { startStruggle(a, b); return; }
    }
  }

  function startStruggle(a, b) {
    // v: where the clash point sits on the line a.origin → b.origin (0 = at a, 1 = at b)
    const dAB = a.origin.distanceTo(b.origin);
    const pa = a.origin.distanceTo(a.to);
    struggle = { a, b, v: clamp(pa / Math.max(1, dAB), 0.38, 0.62), mash: 0, t: 0, pos: new THREE.Vector3(), ball: null, tick: 0 };
    a.struggling = b.struggling = true;
    a.duration = Math.max(a.duration, a.t + 30); b.duration = Math.max(b.duration, b.t + 30);
    // (look: the clash body is fx.magic's; fx adds the sparkle emitter where the two beam heads meet)
    G.events.emit('beam:struggle', { state: 'start', a: a.team, b: b.team });
    G.audio?.sfx('hit_heavy', { pos: a.to });
    G.hitstop(0.08);
  }

  function push(b) {
    if (b.caster === G.player) return 0.55 + 0.32 * Math.min(mash, 9);
    return b.strength * (0.9 + 0.25 * Math.sin(G.time.t * 2.3 + b.id * 10));
  }

  function updateStruggle(dt) {
    const s = struggle;
    s.t += dt;
    const { a, b } = s;
    s.v = clamp(s.v + (push(a) - push(b)) * 0.2 * dt, 0, 1);
    s.mash = mash; // (read-only, for tests / ui)
    s.pos.lerpVectors(a.origin, b.origin, s.v);
    a.to.copy(s.pos); b.to.copy(s.pos);
    a.dir.subVectors(s.pos, a.origin).normalize(); b.dir.subVectors(s.pos, b.origin).normalize();
    a.fx?.set(a.origin, a.to); b.fx?.set(b.origin, b.to);
    if (s.ball) s.ball.pos.copy(s.pos);
    s.tick -= dt;
    if (s.tick <= 0) {
      s.tick = 0.16;
      G.fx?.burst('struggle_spray', s.pos, { color: a.lookColor ?? COLORS.sun, color2: b.lookColor ?? 0xc87bff, dir: _w.subVectors(b.origin, a.origin).normalize(), scale: 1 + Math.random() * 0.4 });
    }
    const playerSide = a.caster === G.player ? 'a' : b.caster === G.player ? 'b' : null;
    G.ui?.struggle?.({ value: playerSide === 'a' ? s.v : playerSide === 'b' ? 1 - s.v : s.v });
    if (s.v >= 0.985) endStruggle(a, 'push');
    else if (s.v <= 0.015) endStruggle(b, 'push');
  }

  function endStruggle(winner, why) {
    const s = struggle;
    if (!s) return;
    struggle = null;
    const loser = s.a === winner ? s.b : s.a;
    s.ball?.remove?.();
    s.a.struggling = s.b.struggling = false;
    G.ui?.struggle?.(null);
    // the loser takes the blast
    const lp = loser.origin.clone();
    G.elements?.apply('sun', lp, 4.5, 2.5 * winner.power, { source: winner.caster, team: winner.team, damage: 60, friendlyFire: false });
    G.physics?.explode(lp, 6, 14, { up: 0.5 });
    // look: the break itself (loser's beam shattering back, the burst, the quiet beat, the falling remains) is fx.magic's
    G.fx?.flash(lp, winner.lookColor ?? COLORS.sun, 160, 0.45, 30);
    G.audio?.sfx('explosion_large', { pos: lp });
    S.shake(0.75, lp);
    G.hitstop(0.08);
    if (winner.caster === G.player) G.ui?.toast?.(t('spells.msg.struggleWin'));
    else if (loser.caster === G.player) G.ui?.toast?.(t('spells.msg.struggleLose'));
    if (winner.team === 'player') S.addGauge(0.15, 'player');
    G.events.emit('beam:struggle', { state: 'end', winner: winner.team, loser: loser.team, why });
    if (why !== 'stopped') { api.stop(loser); }
  }

  return api;
}
