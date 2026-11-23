// 气力 — her stamina: one pool for sprinting, climbing, fast swimming and gliding (docs/JOURNEY.md §5 "Movement and craft").
// Numbers live in STAMINA. The broom never uses it (it runs on mana). At zero she is winded: the pool must refill completely
// before anything that costs stamina works again (the petal ring in src/ui/stamina.js turns rose meanwhile).
import { G } from '../core/game.js';

export const STAMINA = {
  BASE: 100, PER_LEVEL: 20,            // pool: BASE + PER_LEVEL × G.state.upgrades.stamina
  REGEN: 32, REGEN_DELAY: 0.6,         // per second, after REGEN_DELAY s of rest on firm ground
  SPRINT: 7,                           // per second while sprinting on foot
  CLIMB: 9, CLIMB_HOLD: 1.5,           // per second moving on a wall / holding still
  CLIMB_JUMP: 20,                      // one leap up a wall
  RAIN: 1.5,                           // climbing rock in a shower costs this much more (slick stone)
  SWIM: 2, SWIM_FAST: 11, STROKE: 16,  // per second on the surface / per second fast ({sprint}) / one stroke burst ({dodge})
  GLIDE: 4,                            // per second with the light wings open
};

/** Attach the pool to the player object: P.stamina, P.maxStamina, P.winded and P.stam (this API). */
export function createStamina(P) {
  const st = {
    value: STAMINA.BASE, max: STAMINA.BASE, winded: false,
    rest: 0,          // seconds of rest so far (refill starts at REGEN_DELAY)
    used: false,      // anything drew on it this frame
    draining: 0,      // smoothed "is being used" for the ring (0..1)
    /** Recompute the pool from the growth levels (keeps the same fraction). */
    recalc() {
      const u = (G.state && G.state.upgrades) || {};
      const k = st.max > 0 ? st.value / st.max : 1;
      st.max = STAMINA.BASE + STAMINA.PER_LEVEL * (u.stamina | 0);
      st.value = Math.min(st.max, k * st.max);
      return st;
    },
    /** True when stamina may be used now (not winded, something left). */
    can() { return !st.winded && st.value > 0.01; },
    /** Use `rate` per second for dt. Returns false (and uses nothing) when winded. */
    drain(rate, dt) {
      if (st.winded || !(rate > 0) || !(dt > 0)) return !st.winded;
      st.used = true;
      if (G.params?.god) return true;
      st.value -= rate * dt;
      if (st.value <= 0) wind();
      return true;
    },
    /** Spend a lump (a climb jump, a stroke). Allowed with any stamina left; it may run the pool dry. */
    spend(n) {
      if (!st.can()) return false;
      st.used = true;
      if (!G.params?.god) { st.value -= n; if (st.value <= 0) wind(); }
      return true;
    },
    /** Fill to full (a respawn, a rest). */
    fill() { st.value = st.max; st.winded = false; st.rest = 0; },
    /** Per frame: refill while she rests on firm ground (resting = true), track whether it is in use. */
    tick(dt, resting) {
      st.draining += ((st.used ? 1 : 0) - st.draining) * Math.min(1, dt * 6);
      if (st.used || !resting) st.rest = 0;
      else {
        st.rest += dt;
        if (st.rest >= STAMINA.REGEN_DELAY && st.value < st.max) {
          st.value = Math.min(st.max, st.value + STAMINA.REGEN * dt);
          if (st.winded && st.value >= st.max - 1e-3) { st.winded = false; G.events?.emit?.('player:stamina', { winded: false }); }
        }
      }
      st.used = false;
    },
  };
  function wind() {
    st.value = 0;
    if (st.winded) return;
    st.winded = true;
    G.events?.emit?.('player:stamina', { winded: true });
    G.audio?.sfx?.('player_hurt', { pos: P.pos, vol: 0.35, pitch: 1.3 });
  }
  Object.defineProperty(P, 'stamina', { get: () => st.value, set: (v) => { if (Number.isFinite(v)) st.value = Math.max(0, Math.min(st.max, v)); }, enumerable: true });
  Object.defineProperty(P, 'maxStamina', { get: () => st.max, enumerable: true });
  Object.defineProperty(P, 'winded', { get: () => st.winded, enumerable: true });
  P.stam = st;
  return st;
}
