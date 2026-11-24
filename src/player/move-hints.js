// First-use beats for climbing, stamina, swimming, diving and sliding, queued on the journal's notes (G.onboarding,
// src/gameplay/onboarding.js): one card at a time on the coach card, never during dialogue, story beats or fights, ticked
// off by doing it. Text: player.move.<id>.line / .task. Done flags keep their first names (moveHint_<id>), so a save that
// saw the earlier toast hints does not see them again.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';

const P = () => G.player;
let eaveT = -99, slideOk = false;

const BEATS = [
  { id: 'climb', ctx: () => P().state === 'climb', ev: 'player:mantle', max: 20, calm: true },
  { id: 'winded', ctx: () => P().winded, check: () => !P().winded, shownOnly: true, max: 12 },
  { id: 'swim', ctx: () => P().state === 'swim' && !P().winded, check: () => P().state === 'swim' && P().speed > 4.4, max: 16, calm: true },
  { id: 'water_dive', ctx: () => P().onBroom && (P().broom?.skim ?? 0) > 0.6 && G.world.isWater(P().pos.x, P().pos.z), ev: ['player:dive', (e) => e.from === 'broom'], max: 14 },
  { id: 'slide', ctx: () => slideOk, ev: ['player:slide', (e) => e.on], max: 12, calm: true },
  { id: 'eave', ctx: () => P().state === 'climb' && (G.time?.t ?? 0) - eaveT < 3, max: 8, shownOnly: true, check: () => P().onBroom },
];

/** Queue the beats (G.onboarding exists from gameplay init on); returns a per-frame updater for the slide context. */
export function installMoveHints() {
  for (const b of BEATS) {
    try { G.onboarding?.add?.({ ...b, key: 'player.move.' + b.id, flag: 'moveHint_' + b.id }); } catch (e) { G.reportError('player:hints', e); }
  }
  G.events.on('player:eave', () => { eaveT = G.time?.t ?? 0; });
  G.events.on('player:drowned', () => G.ui?.toast?.(t('player.move.drowned'), { dur: 3 }));
  let scanT = 0;
  return {
    /** The slide beat's moment: running downhill on a slope she could slide down (checked twice a second). */
    update(dt, p) {
      if ((scanT -= dt) > 0 || !p) return;
      scanT = 0.5;
      const W = G.world;
      slideOk = p.state === 'ground' && p.speed > 3.5 && W.slopeAt(p.pos.x, p.pos.z) > 0.35 && !W.isWater(p.pos.x, p.pos.z);
    },
  };
}
