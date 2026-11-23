// 唤帚 — the star broom: summon / dismiss, flight model (banking turns, climb / dive, boost with mana, graceful descent
// when out of mana), ceilings and the height limit, auto-dismount on ground / water at low speed, trail + sparkle.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { journeyBroom } from '../actors/journey-props.js';
import { broomSeat, shaftProfile } from '../actors/broom-contact.js';
import { clamp, damp, easeOutBack, smoothstep } from '../core/util.js';
import { advanceBroomMotion } from './broom-motion.js';
import { BroomAirTrail } from '../world/broom-air-trail.js';
import { wakeDrive } from '../world/broom-wake.js';

export const BROOM = {
  CRUISE: 15, BOOST: 26, CLIMB: 9, BOOST_MANA: 12, MAX_Y: 300,
  SEAT: broomSeat[1],           // shaft axis below the two seated ischial contact points
  CLEAR: 0.42,           // lowest origin height above ground / water while riding
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/**
 * @param P  the G.player object
 * @param S  the player's private state (shares tilt group, rig, lantern)
 */
export function createBroom(P, S) {
  const holder = new THREE.Group();
  holder.name = 'broom';
  holder.add(journeyBroom());
  const lanternLocal = [0,.085,-.98];
  holder.position.fromArray(broomSeat);
  holder.userData.rideShaft = shaftProfile;
  holder.visible = false;
  S.tilt.add(holder);
  const lantern = new THREE.Vector3().fromArray(lanternLocal);

  const B = {
    holder, lantern,
    airTrail: new BroomAirTrail(),
    active: false,
    heading: 0, speed: 0, strafe: 0, vy: 0, bank: 0, pitch: 0, yawRate: 0,
    course: 0, gust: 0, riseRate: 0, acceleration: 0, skim: 0,
    boosting: false, appear: 0, vanishing: false,
    trail: null, sparkle: null,

    /** World position of the tail lantern (for the light). */
    lanternWorld(out) { return holder.localToWorld(out.copy(lantern)); },

    // The fox curls up on the wider shoulder of the brush, above the bristles.
    perchWorld(out) { return holder.localToWorld(out.set(0,.165,-.81)); },

    mount() {
      if (B.active) return false;
      B.active = true;
      B.airTrail.clear();
      B.vanishing = false;
      B.appear = 0;
      holder.visible = true;
      holder.scale.setScalar(0.01);
      B.course = B.heading = P.yaw;
      B.gust = B.riseRate = B.acceleration = B.skim = B.yawRate = 0;
      B._wasBoost = false;
      B.speed = Math.hypot(P.vel.x, P.vel.z) * 0.8;
      B.vy = Math.max(P.vel.y, 0) + (P.grounded ? 3.5 : 1.5);
      B.strafe = 0; B.bank = 0; B.pitch = 0;
      if (P.grounded || P.state === 'swim') P.pos.y = Math.max(P.pos.y, P.pos.y + 0.35);
      _v.copy(P.pos); _v.y += 0.9;
      G.fx?.burst('summon', _v, { color: 0xffd27a, scale: 0.9 });
      G.fx?.ring?.(P.pos, { color: 0xffd27a, radius: 2.4, dur: 0.6 });
      G.audio?.sfx('broom_summon', { pos: _v });
      G.cam?.fovKick?.(0.3);
      B.sparkle = G.fx?.emitter?.('broom_sparkle', { pos: B.lanternWorld(new THREE.Vector3()), rate: 0.15, scale: 0.6 }) || null;
      B.glow = 0;
      S.rig.play('sit_broom', { fade: 0.18 });
      G.events.emit('player:mount', {});
      return true;
    },

    dismount(reason = 'manual') {
      if (!B.active) return false;
      B.active = false;
      B.vanishing = true;
      B.lanternWorld(_v);
      G.fx?.burst('summon', _v, { color: 0xffe2a8, scale: 0.55, count: 0.6 });
      G.audio?.sfx('broom_dismiss', { pos: _v });
      if (B.trail) { B.trail.stop?.(); B.trail = null; }
      if (B.sparkle) { B.sparkle.remove?.(); B.sparkle = null; }
      // carry some momentum into the jump off
      P.vel.set(P.vel.x * 0.55, reason === 'manual' ? Math.max(B.vy, 2.5) : 0, P.vel.z * 0.55);
      B.speed = 0; B.boosting = false;
      G.events.emit('player:dismount', { reason });
      return true;
    },

    /** Visual-only work each frame (appear / vanish animation). */
    visuals(dt) {
      if (B.active) {
        B.appear = Math.min(1, B.appear + dt / 0.38);
        holder.scale.setScalar(Math.max(0.01, easeOutBack(B.appear)));
      } else if (B.vanishing) {
        const s = holder.scale.x - dt / 0.22;
        if (s <= 0.02) { holder.visible = false; B.vanishing = false; holder.scale.setScalar(0.01); }
        else holder.scale.setScalar(s);
      }
    },

    /** Flight step. in = { mx, my, up, down, boost } (already gated by control). */
    fly(dt, inp) {
      const W = G.world;
      const st = G.state;
      const k = 1 + 0.08 * ((st && st.upgrades && st.upgrades.broom) | 0);
      const cruise = BROOM.CRUISE * k, boostV = BROOM.BOOST * k;
      // exhausted once the mana runs dry, until it has recovered a little (graceful descent meanwhile)
      if (P.mana <= 0.5) B.exhausted = true; else if (P.mana > 15) B.exhausted = false;
      const empty = !!B.exhausted;
      B.boosting = inp.boost && inp.my > 0 && !empty;
      if (B.boosting) {
        P.mana = Math.max(0, P.mana - BROOM.BOOST_MANA * dt);
        if (!B._wasBoost) {
          G.cam?.fovKick?.(0.6);
          G.fx?.burst('dash', B.lanternWorld(_v), { color: 0xffd27a, scale: 0.7 });
          // This cue plays once when a boost begins.
          G.audio?.sfx('player_broom_boost', { pos: P.pos });
        }
      }
      B._wasBoost = B.boosting;
      if (inp.boost && inp.my > 0 && empty && !B._toldEmpty) { B._toldEmpty = true; G.ui?.toast?.(G.t('player.noMana'), { dur: 2 }); }
      if (!empty) B._toldEmpty = false;

      const camYaw = G.cam ? G.cam.yaw + Math.PI : B.heading;
      advanceBroomMotion(B, inp, camYaw, cruise, boostV, dt);

      // vertical: keys, plus diving / climbing by looking down / up while moving forward
      let vyT = BROOM.CLIMB * k * ((inp.up ? 1 : 0) - (inp.down ? 1 : 0));
      if (inp.my > 0 && G.cam) vyT += Math.sin(clamp(G.cam.pitch + 0.2, -1, 0.8)) * B.speed * 0.6;
      // Round out a fast dive using the ground the broom is about to cross.
      // Leave a shallow sink at deck height so the brush can skim the surface.
      if (vyT < 0 && B.speed > 8) {
        const lead = .22;
        const x = P.pos.x + Math.sin(B.course)*B.speed*lead;
        const z = P.pos.z + Math.cos(B.course)*B.speed*lead;
        const ahead = Math.max(W.heightAt(x,z),W.isWater(x,z) ? W.seaLevel : -Infinity);
        const gap = P.pos.y - (ahead + BROOM.CLEAR);
        vyT = Math.max(vyT,clamp(-gap/lead - 1,-22,7));
      }
      if (empty) vyT = Math.min(vyT, -2.2);                               // graceful descent when out of mana
      if (P.pos.y > BROOM.MAX_Y - 4) vyT = Math.min(vyT, (BROOM.MAX_Y - P.pos.y) * 1.5);
      B.vy = damp(B.vy, vyT, 4.5, dt);
      if (Math.abs(B.speed) < 1 && !inp.up && !inp.down) B.vy += Math.sin(G.time.t * 2.2) * 0.25 * dt; // hover bob

      // integrate
      const fx = Math.sin(B.course), fz = Math.cos(B.course);
      const rx = -fz, rz = fx; // her right is -X when facing +Z  => right = (-cos, sin)
      P.vel.set(fx * B.speed + rx * B.strafe, B.vy, fz * B.speed + rz * B.strafe);
      _w.copy(P.pos);
      P.pos.addScaledVector(P.vel, dt);
      W.resolveCollisions(P.pos, 0.5, 1.4);
      // ceiling (sky isles) + limit
      const ceil = W.ceilingAt(P.pos.x, P.pos.z, _w.y + 1.0);
      if (P.pos.y + 1.55 > ceil) { P.pos.y = ceil - 1.55; B.vy = Math.min(B.vy, 0); }
      if (P.pos.y > BROOM.MAX_Y) { P.pos.y = BROOM.MAX_Y; B.vy = Math.min(B.vy, 0); }
      // floor: ground or water surface
      const g = W.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.6);
      const sup = G.physics?.supportAt?.(P.pos.x, P.pos.z, P.pos.y + 0.3, 1.2);
      const gy = Math.max(g, sup ? sup.y : -Infinity);
      const overWater = gy < W.seaLevel && W.isWater(P.pos.x, P.pos.z);
      const floor = (overWater ? W.seaLevel : gy) + BROOM.CLEAR;
      if (P.pos.y < floor) {
        // rising terrain lifts the broom smoothly instead of a hard snap
        P.pos.y = Math.min(floor, _w.y + Math.max(0, floor - _w.y) * Math.min(1, dt * 14) + 0.02);
        if (P.pos.y < floor - 0.6) P.pos.y = floor - 0.6;
        B.vy = Math.max(B.vy, 0);
      }
      const hgt = P.pos.y - floor;
      B.riseRate = damp(B.riseRate, clamp((P.pos.y-_w.y)/Math.max(dt,.001),-16,16),5,dt);
      B.skim = damp(B.skim, (1-smoothstep(.55,4.5,hgt))*smoothstep(6,16,Math.abs(B.speed)),6,dt);
      // dive: skimming deep water at speed with {descend} held for a moment takes her into the water
      if (overWater && inp.down && hgt < 0.5 && Math.abs(B.speed) >= 6 && B.appear >= 1 && W.isWater(P.pos.x, P.pos.z)) {
        B.diveT = (B.diveT || 0) + dt;
        if (B.diveT > 0.3) { B.diveT = 0; B.dismount('dive'); return 'dive'; }
      } else B.diveT = 0;
      // auto dismount: settled onto ground / water at low speed
      const descending = inp.down || (!inp.up && B.vy < 0.5);
      if (hgt < 0.12 && Math.abs(B.speed) < 5 && descending && B.appear >= 1) {
        B.dismount(overWater ? 'water' : 'ground');
        return 'landed';
      }

      // visuals: bank + pitch
      const drive = wakeDrive(Math.abs(B.speed));
      B.pitch = damp(B.pitch, clamp(-B.riseRate*.035 + .1*drive + B.acceleration*.009,-.42,.45),5,dt);
      B.airTrail.record(P.pos, P.vel, B, floor-BROOM.CLEAR, overWater, G.time.t, W);
      P.yaw = B.heading;
      P.speed = Math.hypot(P.vel.x, P.vel.z);
      // trail + sparkle
      B.lanternWorld(_v);
      const sp = Math.abs(B.speed);
      // The gold light belongs to the boost: it fades in over ~0.15 s when the boost starts and
      // out over ~0.4 s after it ends. Normal flight carries no light; the wake shows the speed.
      B.glow = clamp((B.glow || 0) + (B.boosting ? dt / .15 : -dt / .4), 0, 1);
      const glow = B.glow * B.glow * (3 - 2 * B.glow);
      if (glow > .01 && sp > 6 && !B.trail) B.trail = G.fx?.trail?.({ color: 0xffd9a2, color2: 0xffc78e, width: 0.08, life: 0.2, style: 'glow', intensity: .6 }) || null;
      if (B.trail) {
        if (sp < 6 || glow <= .01) { B.trail.stop?.(); B.trail = null; }
        else { B.trail.intensity = .6 * glow; B.trail.setWidth?.((.04 + .08*drive)*(1-.6*B.skim)*(.35+.65*glow)); B.trail.push(_v); }
      }
      if (B.sparkle) { B.sparkle.pos.copy(_v); B.sparkle.rate = .03 + (.12 + sp / 40) * glow; }
      // speed lines: fine streaks born ahead and to the sides rush past the lens while boosting
      B.lineT = (B.lineT || 0) - dt;
      if (B.boosting && sp > 18 && B.skim < .25 && B.lineT <= 0 && G.fx?.burst) {
        B.lineT = .22 - .09*drive;
        const hx = Math.sin(B.heading), hz = Math.cos(B.heading), a = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 2.2;
        _v.set(P.pos.x + hx * 6 + hz * Math.cos(a) * r, P.pos.y + 1.1 + Math.sin(a) * r * 0.8, P.pos.z + hz * 6 - hx * Math.cos(a) * r);
        G.fx.burst('dash', _v, { dir: _w.set(-hx, 0, -hz), count: 1, scale: .9+.55*drive, grounded: false });
      }
      return 'fly';
    },
  };
  return B;
}
