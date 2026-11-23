// First-use hints for climbing, stamina, swimming, diving and sliding (BotW method: say it once, the moment it matters).
// Each shows once per save (G.state.flags.moveHint_<id>), never in a fight or a conversation; a hint that comes up at a bad
// moment waits a little and is dropped if the moment has passed.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';

const HINTS = {
  climb: { key: 'player.move.climb', dur: 7 },
  winded: { key: 'player.move.winded', dur: 5 },
  swim: { key: 'player.move.swim', dur: 7 },
  dive: { key: 'player.move.dive', dur: 5 },
  slide: { key: 'player.move.slide', dur: 5 },
  eave: { key: 'player.move.eave', dur: 4.5, repeat: 90 },
};

/** {action} placeholders → the key (or the touch button's name). */
export function keys(text) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => (G.input?.bindings?.[k] ? G.input.keyLabel(k) || k : m));
}

export function installMoveHints() {
  const lastT = {};
  let pending = null, pendingT = 0;
  const free = () => G.mode === 'play' && !G.dialogue?.active && !G.combat?.inCombat && !G.story?.busy;
  function hint(id) {
    const h = HINTS[id], f = G.state?.flags;
    if (!h || !f) return false;
    const now = G.time?.t ?? 0;
    if (h.repeat ? now - (lastT[id] ?? -1e9) < h.repeat : f['moveHint_' + id]) return false;
    if (!free()) { pending = id; pendingT = 6; return false; }
    if (h.repeat) lastT[id] = now; else f['moveHint_' + id] = true;
    G.ui?.toast?.(keys(t(h.key)), { dur: h.dur });
    return true;
  }
  G.events.on('player:climb', (e) => {
    if (e?.on) hint('climb');
    else if (e?.why === 'winded') hint('winded');
  });
  G.events.on('player:stamina', (e) => { if (e?.winded) hint('winded'); });
  G.events.on('player:dive', () => hint('swim'));
  G.events.on('player:drowned', () => G.ui?.toast?.(t('player.move.drowned'), { dur: 3 }));
  G.events.on('player:slide', (e) => { if (e?.on) hint('slide'); });
  G.events.on('player:eave', () => hint('eave'));
  return {
    hint,
    /** Per frame: water hints from where she is, and a hint that had to wait for a quiet moment. */
    update(dt, P) {
      if (pending && (pendingT -= dt) > 0 && free()) { const id = pending; pending = null; hint(id); }
      else if (pendingT <= 0) pending = null;
      if (!P || !G.state?.flags) return;
      if (P.state === 'swim' && !G.state.flags.moveHint_swim) hint('swim');
      if (P.onBroom && !G.state.flags.moveHint_dive && P.broom?.skim > 0.6 && G.world?.isWater?.(P.pos.x, P.pos.z)) hint('dive');
    },
  };
}
