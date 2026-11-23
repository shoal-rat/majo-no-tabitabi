// Touch controls (phones / tablets held sideways). A floating stick on the left half (analog: the further it is pushed,
// the faster she walks; on the broom its sideways push turns the flight), dragging the right half turns the view, and
// thumb buttons on the right that follow what she is doing: on foot, on the broom, in a conversation (tap to read on),
// in a cutscene (hold to skip). The overlay sits above the HUD and below every full-screen layer.
// It only feeds the input layer: G.input.virtual (actions by NAME, so key rebinding never breaks a button, plus the
// analog stick) and G.input.lookX/lookY. Pointer lock is never asked for while it is in charge (G.input.touch).
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { setKeyLabelHook } from '../core/input.js';
import { UI, el, tel, clear, setText, sfx, noteSelfUnlock } from './dom.js';
import { icon, setIcon } from './icons.js';
import { addCss, applyScale } from './style.js';
import { spellSlots, selectedId, selectSpell, vitals, inv, ability, charge, cooldownLeft, gauge } from './model.js';
import { wantTouch, installTouchEnv, canTouch } from './touchenv.js';

addCss(`
.mv-touch { --ts: 1; --ta: .8; --sl: env(safe-area-inset-left, 0px); --sr: env(safe-area-inset-right, 0px);
  --st: env(safe-area-inset-top, 0px); --sb: env(safe-area-inset-bottom, 0px); --ax: calc(var(--sr) + 12px); --ay: calc(var(--sb) + 10px);
  display: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.mv-ui.touch .mv-touch.show { display: block; }
.tc-pad { position: absolute; inset: 0; pointer-events: none; touch-action: none; }
.mv-touch.pad .tc-pad { pointer-events: auto; }

/* ---- buttons: night-glass coins with a brass ring, placed from the bottom-right corner (x, y = centre in px at size 1) ---- */
.tc-b { position: absolute; width: calc(var(--d) * var(--ts) * 1px); height: calc(var(--d) * var(--ts) * 1px);
  right: calc(var(--ax) + (var(--x) - var(--d) / 2) * var(--ts) * 1px); bottom: calc(var(--ay) + (var(--y) - var(--d) / 2) * var(--ts) * 1px);
  display: none; align-items: center; justify-content: center; border-radius: 50%; pointer-events: auto; touch-action: none;
  font-size: calc(var(--d) * var(--ts) * .44px); color: #fff7e8; opacity: var(--ta);
  background: radial-gradient(circle at 50% 32%, rgba(54,72,120,.8), rgba(10,15,32,.82) 72%);
  box-shadow: inset 0 0 0 1.5px rgba(236,217,164,.62), inset 0 0 0 4px rgba(10,15,32,.35), inset 0 0 0 5px rgba(236,217,164,.2), 0 3px 10px rgba(0,0,0,.32);
  transition: transform .08s, box-shadow .12s, opacity .2s; }
.tc-b.vis { display: flex; }
.tc-b::after { content: ''; position: absolute; inset: -6px; background: var(--brass2); opacity: .42; pointer-events: none; transition: opacity .12s;
  -webkit-mask: var(--mk-astro) center / contain no-repeat; mask: var(--mk-astro) center / contain no-repeat; }
.tc-b.top::after { display: none; }
.tc-b .ic { position: relative; filter: drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
.tc-b.on { transform: scale(.9); background: radial-gradient(circle at 50% 34%, rgba(84,104,160,.88), rgba(20,28,54,.88) 72%);
  box-shadow: inset 0 0 0 2px var(--brass2), 0 0 16px rgba(236,217,164,.45); }
.tc-b.on::after { opacity: .9; }
.tc-b.dim .ic { opacity: .4; }
.tc-b.latch { background: radial-gradient(circle at 50% 34%, rgba(255,240,200,.92), rgba(201,164,94,.9) 75%); color: #2a1f12; }
.tc-b.latch .ic { filter: none; }
.tc-b svg.ring { position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px); transform: rotate(-90deg); overflow: visible; pointer-events: none; }
.tc-b svg.ring circle { fill: none; stroke-width: 5; }
.tc-b svg.ring .trk { stroke: rgba(10,8,18,.0); }
.tc-b svg.ring .arc { stroke: var(--sc, var(--brass2)); stroke-linecap: round; filter: drop-shadow(0 0 3px var(--sc, var(--brass2))); }
.tc-b .cdw { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; opacity: 0;
  background: conic-gradient(rgba(6,8,18,.7) calc(var(--cd, 0) * 360deg), transparent 0); }
.tc-b.cooling .cdw { opacity: 1; }
.tc-b .badge { position: absolute; right: -4px; bottom: -3px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: linear-gradient(180deg, #fffaf0, #eadcbe); color: var(--ink);
  font: 600 11.5px/18px var(--fd); text-align: center; font-variant-numeric: tabular-nums; box-shadow: 0 0 0 1px rgba(148,113,47,.6), 0 1px 3px rgba(0,0,0,.5); }
.tc-b .cap { position: absolute; left: 50%; top: 100%; transform: translateX(-50%); margin-top: 2px; white-space: nowrap; font: 600 11px/1.2 var(--fd); letter-spacing: .06em;
  color: #fff7e8; text-shadow: 0 0 1px rgba(6,8,18,.95), 0 1px 3px rgba(6,8,18,.9); opacity: 0; transition: opacity .6s; pointer-events: none; }
/* first steps (and whenever a new button arrives): every button says its name for a few seconds */
.mv-touch.coach .tc-b .cap { opacity: 1; }
.tc-b.act .cap, .tc-b.top .cap, .tc-b.skip .cap { display: none; }

/* the selected magic: its element colour on the cast disc */
.tc-b.cast { color: var(--sc, #fff7e8); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sc, #ecd9a4) 70%, transparent), 0 0 14px -2px var(--sc, transparent), 0 3px 10px rgba(0,0,0,.32); }
.tc-b.cast .ic { filter: drop-shadow(0 0 5px var(--sc, transparent)) drop-shadow(0 1px 2px rgba(0,0,0,.7)); }
.tc-b.cast.swap { animation: tc-swap .3s cubic-bezier(.2,.8,.2,1.5); }
@keyframes tc-swap { from { transform: scale(.7) rotate(-30deg); } }
.tc-b.swapb .dot { position: absolute; right: 2px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--nc, #888); box-shadow: 0 0 0 1.5px rgba(10,8,18,.85), 0 0 6px var(--nc, transparent); }

/* interact: appears near the thumb with the verb on a ribbon to its left */
.tc-b.act { background: radial-gradient(circle at 50% 34%, rgba(255,244,212,.95), rgba(201,164,94,.92) 75%); color: #2a1f12; animation: tc-pop .28s cubic-bezier(.2,.8,.2,1.5); }
.tc-b.act .ic { filter: none; }
.tc-b.act .verb { position: absolute; right: calc(100% + 4px); top: 50%; transform: translateY(-50%); padding: 4px 14px 4px 12px; white-space: nowrap;
  font: 600 15px/1.3 var(--fd); letter-spacing: .1em; color: #fff7e8; background: linear-gradient(90deg, rgba(28,38,70,.92), rgba(14,20,38,.86)); border-radius: 14px 4px 4px 14px;
  box-shadow: inset 0 0 0 1px rgba(236,217,164,.45); }
@keyframes tc-pop { from { transform: scale(.4); opacity: 0; } }

/* top-right corner: map + pause */
.tc-b.top { right: calc(var(--sr) + 12px + (var(--x) - var(--d) / 2) * 1px); bottom: auto; top: calc(var(--st) + 10px + var(--y) * 1px); width: 40px; height: 40px; font-size: 18px; }
/* cutscene: hold to skip */
.tc-b.skip { width: auto; height: 44px; padding: 0 18px 0 14px; gap: 8px; border-radius: 22px; font: 600 15px/44px var(--fd); letter-spacing: .12em;
  right: calc(var(--ax) + 8px); bottom: calc(var(--ay) + 8px); }
.tc-b.skip::after { display: none; }
.tc-b.skip .fill { position: absolute; inset: 0; border-radius: 22px; background: rgba(236,217,164,.32); transform-origin: 0 50%; transform: scaleX(var(--k, 0)); pointer-events: none; }
.tc-b.skip > :not(.fill) { position: relative; }

/* the floating stick */
.tc-stick { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; opacity: calc(var(--ta) * .5); transition: opacity .25s; will-change: transform; display: none; }
.mv-touch.play .tc-stick { display: block; }
.tc-stick.on { opacity: var(--ta); transition: opacity .05s; }
.tc-stick .base { position: absolute; left: calc(var(--ts) * -62px); top: calc(var(--ts) * -62px); width: calc(var(--ts) * 124px); height: calc(var(--ts) * 124px); border-radius: 50%;
  background: radial-gradient(circle, rgba(10,15,32,.06) 30%, rgba(10,15,32,.36) 72%, rgba(10,15,32,.12) 100%); box-shadow: inset 0 0 0 1.5px rgba(236,217,164,.4); }
.tc-stick .base::after { content: ''; position: absolute; inset: -6px; background: var(--brass2); opacity: .32; -webkit-mask: var(--mk-astro) center / contain no-repeat; mask: var(--mk-astro) center / contain no-repeat; }
.tc-stick .knob { position: absolute; left: calc(var(--ts) * -27px); top: calc(var(--ts) * -27px); width: calc(var(--ts) * 54px); height: calc(var(--ts) * 54px); border-radius: 50%;
  background: radial-gradient(circle at 50% 34%, rgba(255,250,238,.92), rgba(222,204,164,.8) 70%); box-shadow: 0 2px 8px rgba(0,0,0,.4), inset 0 0 0 1.5px rgba(255,255,255,.55), 0 0 0 1px rgba(148,113,47,.5); will-change: transform; }
.tc-stick.run .knob { background: radial-gradient(circle at 50% 34%, #fff6dc, #e8c47a 72%); box-shadow: 0 0 14px rgba(236,217,164,.7), inset 0 0 0 1.5px #fff; }

/* the HUD gives the thumbs room: key hints, the key prompt and the spell cluster are on the buttons now */
.mv-ui.touch .hud-hints, .mv-ui.touch .hud-prompt, .mv-ui.touch .hud-spell, .mv-ui.touch .mvs-skip { display: none !important; }
.mv-ui.touch .hud-tr { right: calc(26u + 52px + env(safe-area-inset-right, 0px)); }
.mv-ui.touch .hud-tracker .ob { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mv-ui.touch .hud-compass { width: 360u; margin-left: -180u; }
.mv-ui.touch .hud-struggle { top: 34%; }
/* key caps in hint lines read as "tap" on a touch screen */
.mv-ui.touch :is(.ln-go, .en-go, .sh-hint, .mn-hint, .mp-side .ft) .keycap { display: none; }
.mv-ui.touch :is(.mv-sheet .hint, .sh-hint) { visibility: hidden; }
`);

// ---- little pictures the shared icon set does not have (inline SVG, 24x24, currentColor) ----
const SV = (d, w = 2.2) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FL = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
const GLYPH = {
  up: SV('M5 15.5 12 8.5l7 7M5 20.5 12 13.5l7 7', 2.3),
  down: SV('M5 8.5 12 15.5l7-7M5 3.5 12 10.5l7-7', 2.3),
  run: SV('M4 6l6 6-6 6M11.5 6l6 6-6 6', 2.4),
  swap: SV('M18.5 9A7 7 0 0 0 6 7.2M5.5 15a7 7 0 0 0 12.5 1.8', 2) + '',
  // an open hand: reach for it (talk, read, pick up, light ...)
  tap: SV('M8.2 12.6V5.6a1.5 1.5 0 0 1 3 0v5.6M11.2 10.4V4a1.5 1.5 0 0 1 3 0v6.6M14.2 10.6V5.4a1.5 1.5 0 0 1 3 0v7.4M8.2 11.4V9.6a1.5 1.5 0 0 0-3 0v4.6a7 7 0 0 0 7 7h.8a6.2 6.2 0 0 0 6.2-6.2v-2.4a1.5 1.5 0 0 0-3 0', 1.8),
  aim: SV('M12 4.5v4M12 15.5v4M4.5 12h4M15.5 12h4M12 12m-5.6 0a5.6 5.6 0 1 0 11.2 0a5.6 5.6 0 1 0 -11.2 0', 2),
  pause: FL('M7 5h3.4v14H7zM13.6 5H17v14h-3.4z'),
  // craft: the star thread (a wand tip drawing a thread), the back-light (a circle running backwards), turning a held part
  thread: SV('M4.5 19.5 14 10M14 10l2.6-2.6M17.8 3.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7zM4.5 19.5c2.6-.4 3.6-3.4 6.4-3.4s3.8 2 6.6 1.4', 2),
  rewind: SV('M7.2 7.6A7 7 0 1 1 5 12.6M7.2 7.6V3.4M7.2 7.6H3M12 8.4V12l2.6 1.6', 2.1),
  turn: SV('M18.6 12A6.6 6.6 0 1 1 12 5.4M12 5.4 9.6 3M12 5.4 9.6 7.8', 2.1),
  tilt: SV('M12 18.6A6.6 6.6 0 1 1 18.6 12M18.6 12 21 9.6M18.6 12 16.2 9.6', 2.1),
  near: SV('M12 4v12.5M6.6 11.2 12 16.6l5.4-5.4M6 20.2h12', 2.2),
  far: SV('M12 20V7.5M6.6 12.8 12 7.4l5.4 5.4M6 3.8h12', 2.2),
  skip: FL('M4 5.5 12 12l-8 6.5zM12 5.5 20 12l-8 6.5z'),
};
// swap arrows: arcs plus heads
GLYPH.swap = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.6 9.2A7 7 0 0 0 5.8 8M5.4 14.8a7 7 0 0 0 12.8 1.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><path d="M19.6 4.6v5.2h-5.2zM4.4 19.4v-5.2h5.2z" fill="currentColor"/></svg>`;

function glyph(name, parent) {
  const i = el('i', 'ic', parent);
  i.innerHTML = GLYPH[name] || '';
  return i;
}

// contexts
const FOOT = 1, BROOM = 2, TALK = 4, CUT = 8;
const LOOK = 2.6;          // look px per finger px at sensitivity 1 (camera: 0.0024 rad per look px x settings.sens)
const STEER = 1.5;         // broom: radians per second of turn at full sideways stick
const DEAD = 0.12;         // stick dead zone (fraction of its radius)
const MIN_FRAMES = 2;      // a tap is held at least this long, so every system sees both its press and its release
const HOLD_WHEEL = 0.28;   // s: holding the swap orb this long opens the magic wheel
const SKIP_HOLD = 0.45;    // s: hold to skip a cutscene

/** The touch controls are in charge (set by createTouch; false until the UI is up). */
export function touchUI() { return !!G.input?.touch; }

/** Rows for the settings form (panels.js): shown on any device that can be touched. */
export function touchSettingRows() {
  if (!touchUI() && !canTouch()) return null;
  const pct = (v) => String(Math.round(v * 100));
  return { head: 'ui.touch.set.head', rows: [
    { k: 'touch', label: 'ui.touch.set.touch', type: 'choice', opts: () => ['auto', 'on', 'off'].map((v) => ({ v, l: t('ui.touch.set.' + v) })) },
    { k: 'touchSize', label: 'ui.touch.set.size', type: 'slider', min: 0.7, max: 1.25, step: 0.05, fmt: pct },
    { k: 'touchAlpha', label: 'ui.touch.set.alpha', type: 'slider', min: 0.25, max: 1, step: 0.05, fmt: pct },
    { k: 'touchSens', label: 'ui.touch.set.sens', type: 'slider', min: 0.3, max: 3, step: 0.1, fmt: (v) => v.toFixed(1) },
  ] };
}

/** The title screen's controls page on a touch screen: what each part of the screen does. */
export function createTouchGuide(parent) {
  const root = el('div', 'mv-ctl tc-guide', parent);
  const groups = [
    ['move', [['stick', null], ['look', null]]],
    ['buttons', [['attack', 'star'], ['cast', 'wind'], ['swap', '#swap'], ['jump', '#up'], ['descend', '#down'], ['dodge', 'dodge'], ['guard', 'guard'], ['broom', 'broom'], ['sprint', '#run'], ['heal', 'dango'], ['interact', '#tap']]],
    ['other', [['corner', '#pause'], ['skip', '#skip']]],
  ];
  function render() {
    clear(root);
    for (const [head, rows] of groups) {
      const s = el('div', 'sec', root);
      tel('div', 'sh', s, 'ui.touch.guide.' + head);
      for (const [k, ic] of rows) {
        const r = el('div', 'row', s);
        if (ic) { const b = el('span', 'tc-gi', r); if (ic[0] === '#') glyph(ic.slice(1), b); else icon(ic, '', b); }
        tel('div', 'ds', r, 'ui.touch.guide.' + k);
      }
    }
  }
  render();
  return { el: root, render };
}
addCss(`
.tc-guide .sec { break-inside: auto; }
.tc-guide .sh { break-after: avoid; }
.tc-guide .row { min-height: 36u; align-items: flex-start; padding: 3u 6u; break-inside: avoid; }
.tc-guide .tc-gi { width: 30u; height: 30u; flex: none; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16u;
  background: radial-gradient(circle at 50% 34%, #33467a, #121a33 72%); color: #fff7e8; box-shadow: 0 0 0 1.2u var(--brass); }
.tc-guide .ds { padding-top: 5u; line-height: 1.55; }
`);

export function createTouch(root, deps = {}) {
  const R = el('div', 'layer mv-touch', root);
  const pad = el('div', 'tc-pad', R);
  const stick = el('div', 'tc-stick', R);
  el('div', 'base', stick);
  const knob = el('div', 'knob', stick);

  // ---------------- buttons ----------------
  const B = {};
  const list = [];
  /** def(id, { d, x, y, ic|g, act, kind: 'hold'|'tap'|'toggle'|'fn', ctx, look, cls, cap }) */
  function def(id, o) {
    const n = el('div', 'tc-b ' + (o.cls || ''), R);
    n.style.setProperty('--d', o.d); n.style.setProperty('--x', o.x); n.style.setProperty('--y', o.y);
    n.setAttribute('role', 'button');
    const ic = o.g ? glyph(o.g, n) : icon(o.ic || 'dot', '', n);
    const b = { id, n, ic, act: o.act || null, kind: o.kind || 'tap', ctx: o.ctx || 0, look: !!o.look, cond: o.cond || null, fn: o.fn || null, vis: false, down: false, tid: null, f0: 0, t0: 0, minHold: o.minHold || 0 };
    n._tb = b;
    B[id] = b; list.push(b);
    return b;
  }
  const has1 = () => known >= 1, has2 = () => known >= 2;
  def('attack', { d: 76, x: 60, y: 58, ic: 'star', act: 'attack', kind: 'hold', ctx: FOOT | BROOM, look: true });
  const cast = def('cast', { d: 62, x: 156, y: 46, ic: 'lock', act: 'cast', kind: 'hold', ctx: FOOT | BROOM, look: true, cls: 'cast', cond: has1 });
  const swap = def('swap', { d: 44, x: 218, y: 112, g: 'swap', kind: 'swap', ctx: FOOT | BROOM, cls: 'swapb', cond: has2 });
  // a quick tap still gives a full-height jump (a thumb tap is shorter than a key press); holding longer works as before
  const jump = def('jump', { d: 56, x: 134, y: 130, g: 'up', act: 'jump', kind: 'hold', ctx: FOOT | BROOM, minHold: 0.2 });
  def('dodge', { d: 50, x: 50, y: 150, ic: 'dodge', act: 'dodge', kind: 'tap', ctx: FOOT });
  def('descend', { d: 50, x: 50, y: 150, g: 'down', act: 'descend', kind: 'hold', ctx: BROOM });
  def('guard', { d: 48, x: 236, y: 42, ic: 'guard', act: 'guard', kind: 'hold', ctx: FOOT | BROOM, cond: () => ability('guard') });
  const heal = def('heal', { d: 42, x: 304, y: 38, ic: 'dango', act: 'heal', kind: 'tap', ctx: FOOT });
  def('lock', { d: 40, x: 288, y: 100, g: 'aim', act: 'lock', kind: 'tap', ctx: FOOT | BROOM, cond: () => !!(G.combat?.inCombat || G.combat?.lockTarget) });
  def('summon', { d: 40, x: 366, y: 40, ic: 'shikigami', act: 'summon', kind: 'tap', ctx: FOOT | BROOM, cond: () => ability('shikigami') });
  const ult = def('ultimate', { d: 46, x: 362, y: 104, ic: 'kinkan', act: 'ultimate', kind: 'tap', ctx: FOOT | BROOM, cond: () => ability('kinkan') });
  // craft (src/craft/): the star thread in the 式神 slot; while a part is on the thread, turn / tilt / pull in / push out
  const holdingPart = () => !!G.craft?.holding;
  def('thread', { d: 44, x: 366, y: 40, g: 'thread', act: 'thread', kind: 'tap', ctx: FOOT, cond: () => !!G.craft?.knows?.('thread') && !ability('shikigami') });
  def('rewind', { d: 44, x: 362, y: 104, g: 'rewind', act: 'rewind', kind: 'tap', ctx: FOOT, cond: () => !!G.craft?.knows?.('rewind') && !ability('kinkan') && !holdingPart() });
  def('craftTurn', { d: 42, x: 362, y: 104, g: 'turn', act: 'craftTurn', kind: 'tap', ctx: FOOT, cond: holdingPart });
  def('craftTilt', { d: 42, x: 424, y: 92, g: 'tilt', act: 'craftTilt', kind: 'tap', ctx: FOOT, cond: holdingPart });
  def('craftNear', { d: 42, x: 428, y: 152, g: 'near', act: 'craftNear', kind: 'hold', ctx: FOOT, cond: holdingPart });
  def('craftFar', { d: 42, x: 366, y: 164, g: 'far', act: 'craftFar', kind: 'hold', ctx: FOOT, cond: holdingPart });
  const broom = def('broom', { d: 46, x: 50, y: 214, ic: 'broom', act: 'broom', kind: 'tap', ctx: FOOT | BROOM, cond: () => ability('broom') });
  const sprint = def('sprint', { d: 44, x: 126, y: 202, g: 'run', act: 'sprint', kind: 'toggle', ctx: FOOT | BROOM });
  const act = def('interact', { d: 54, x: 212, y: 188, g: 'tap', act: 'interact', kind: 'tap', ctx: FOOT | BROOM, cls: 'act', cond: () => !!promptVerb });
  def('menu', { d: 40, x: 20, y: 0, g: 'pause', kind: 'fn', ctx: FOOT | BROOM | TALK, cls: 'top', fn: () => G.ui?.openMenu?.() });
  def('map', { d: 40, x: 20, y: 48, ic: 'map', kind: 'fn', ctx: FOOT | BROOM, cls: 'top', fn: () => G.ui?.openMenu?.('map') });
  // only where the story offers a skip (its own "skip" corner hint is up); the short staged moments cannot be skipped
  const skip = def('skip', { d: 40, x: 0, y: 0, g: 'skip', kind: 'skip', ctx: CUT, cls: 'skip', cond: () => skippable });
  const skipFill = el('i', 'fill', skip.n);
  skip.n.insertBefore(skipFill, skip.n.firstChild);
  tel('span', '', skip.n, 'ui.touch.skipHold');
  const verb = el('span', 'verb', act.n);
  const healN = el('span', 'badge', heal.n, '0');
  const cdw = el('div', 'cdw', cast.n);
  const ring = ringSvg(); cast.n.appendChild(ring);
  const gRing = ringSvg(); ult.n.appendChild(gRing);
  const swapDot = el('i', 'dot', swap.n);
  for (const b of list) { b.cap = el('span', 'cap', b.n); b.n.setAttribute('aria-label', has('ui.touch.btn.' + b.id) ? t('ui.touch.btn.' + b.id) : b.id); }
  /** the name a button goes by right now (the broom changes a few) */
  const nameOf = (b, c) => t('ui.touch.btn.' + (c === BROOM && b.id === 'jump' ? 'climb' : c === BROOM && b.id === 'broom' ? 'dismount' : c === BROOM && b.id === 'sprint' ? 'boost' : b.id));

  // ---------------- state ----------------
  let on = false, ctx = 0, known = 0, promptVerb = '', padOn = false, skippable = false;
  let ts = 1, w = window.innerWidth, h = window.innerHeight;
  const ins = { l: 0, r: 0, t: 0, b: 0 };
  const recs = new Map();           // touch identifier -> { kind, b?, x0, y0, x, y, t0, moved }
  const releaseQ = [];              // { act | code, frame }
  let stickRec = null, sx = 0, sy = 0, idleX = 0, idleY = 0;  // stick centre (px)
  let runLatched = false, idleStill = 0, wasBroom = false, lastSel = '';
  let seenBits = 0, coachT = 0;       // buttons already introduced; seconds of captions left

  // ---------------- settings, size, insets ----------------
  const probe = el('div', '', R);
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  function measure() {
    w = window.innerWidth; h = window.innerHeight;
    try { const cs = getComputedStyle(probe); ins.t = parseFloat(cs.paddingTop) || 0; ins.r = parseFloat(cs.paddingRight) || 0; ins.b = parseFloat(cs.paddingBottom) || 0; ins.l = parseFloat(cs.paddingLeft) || 0; } catch (e) { /* keep */ }
    const s = G.settings || {};
    ts = Math.max(0.85, Math.min(1.15, h / 400)) * (Number(s.touchSize) > 0 ? Math.min(1.25, Math.max(0.7, Number(s.touchSize))) : 1);
    R.style.setProperty('--ts', ts.toFixed(3));
    R.style.setProperty('--ta', String(Number.isFinite(s.touchAlpha) ? Math.max(0.15, Math.min(1, s.touchAlpha)) : 0.8));
    idleX = ins.l + 12 + 104 * ts; idleY = h - ins.b - 10 - 96 * ts;
    if (!stickRec) placeStick(idleX, idleY);
  }
  function placeStick(x, y) { sx = x; sy = y; stick.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; }
  function setKnob(dx, dy) { knob.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`; }

  // ---------------- on / off ----------------
  function apply() {
    const want = wantTouch();
    if (want === on && G.input) { G.input.touch = on; return; }
    on = want;
    if (G.input) G.input.touch = on;
    UI.touch = on;
    root.classList.toggle('touch', on);
    if (on) { if (G.input?.locked) { noteSelfUnlock(); G.input.exitLock(); } setKeyLabelHook(labelFor); }
    else { setKeyLabelHook(null); releaseAll(); }
    applyScale(root);
    measure();
    G.events.emit('input:rebound');   // every key label redrawn (buttons instead of keys)
    env?.check();
  }
  function labelFor(action) { return on && has('ui.touch.key.' + action) ? t('ui.touch.key.' + action) : null; }

  // ---------------- virtual input helpers ----------------
  const V = () => G.input?.virtual;
  /** A quick tap's release may still be waiting (slow frames): let it go now, so the next tap is a fresh press. */
  function flush(act, code) {
    for (let i = releaseQ.length - 1; i >= 0; i--) {
      const q = releaseQ[i];
      if ((act && q.act === act) || (code && q.code === code)) { releaseQ.splice(i, 1); if (q.code) V()?.key(q.code, false); else V()?.up(q.act); }
    }
  }
  function vDown(a) { flush(a, null); V()?.down(a); }
  function vUp(a, f0, at = 0) {
    if (G.time.frame - f0 >= MIN_FRAMES && performance.now() >= at) V()?.up(a);
    else releaseQ.push({ act: a, code: null, frame: f0 + MIN_FRAMES, at });
  }
  function tapCode(code) { flush(null, code); V()?.key(code, true); releaseQ.push({ act: null, code, frame: G.time.frame + MIN_FRAMES, at: 0 }); }
  function look(dx, dy) {
    const inp = G.input; if (!inp) return;
    const s = G.settings || {};
    const k = (LOOK * (Number(s.touchSens) > 0 ? Number(s.touchSens) : 1)) / (Number(s.sens) > 0 ? Number(s.sens) : 1);
    inp.lookX += dx * k; inp.lookY += dy * k * 0.85;
  }

  function press(b, rec) {
    b.down = true; b.f0 = G.time.frame; b.t0 = performance.now(); b.tid = rec.id;
    b.n.classList.add('on');
    if (b.kind === 'hold' || b.kind === 'tap') vDown(b.act);
    else if (b.kind === 'toggle') {
      runLatched = !runLatched; idleStill = 0;
      if (runLatched) vDown(b.act); else V()?.up(b.act);
      sfx('ui_move', 0.35);
    } else if (b.kind === 'fn') { try { b.fn?.(); } catch (e) { G.reportError('touch:' + b.id, e); } }
    else if (b.kind === 'swap') { rec.wheelT = 0; rec.wheel = false; }
    else if (b.kind === 'skip') rec.holdT = 0;
  }
  function release(b, rec, cancelled) {
    if (!b.down) return;
    b.down = false; b.tid = null;
    b.n.classList.remove('on');
    if (b.kind === 'hold' || b.kind === 'tap') vUp(b.act, b.f0, cancelled ? 0 : b.t0 + b.minHold * 1000);
    else if (b.kind === 'swap') {
      const wh = deps.wheel;
      if (rec.wheel) wh?.touchRelease?.(rec.moved > 26);
      else if (!cancelled) cycleSpell();
    } else if (b.kind === 'skip') { skipFill.style.setProperty('--k', '0'); }
  }
  function cycleSpell() {
    const slots = spellSlots(true);
    const sel = selectedId();
    let i = slots.findIndex((s) => s.id === sel);
    for (let k = 1; k <= 8; k++) { const j = (i + k + 8) % 8; if (slots[j].level > 0) { if (slots[j].id !== sel) { selectSpell(slots[j].id); sfx('ui_select', 0.5); } return; } }
  }

  // ---------------- touches ----------------
  function onStart(e) {
    if (!on) return;
    e.preventDefault();
    const now = performance.now();
    for (const ct of e.changedTouches) {
      const id = ct.identifier, x = ct.clientX, y = ct.clientY;
      const tb = ct.target && ct.target.closest ? ct.target.closest('.tc-b') : null;
      const rec = { id, kind: '', b: null, x0: x, y0: y, x, y, t0: now, moved: 0 };
      if (tb && tb._tb && tb._tb.vis) {
        const b = tb._tb;
        if (b.down) continue;       // a second finger on a held button
        rec.kind = 'btn'; rec.b = b;
        recs.set(id, rec);
        press(b, rec);
        continue;
      }
      if (ctx & (TALK | CUT)) { rec.kind = 'tap'; recs.set(id, rec); continue; }
      if (!(ctx & (FOOT | BROOM))) continue;
      if (!stickRec && x < w * 0.42) {
        rec.kind = 'stick'; stickRec = rec; recs.set(id, rec);
        const r = 62 * ts;
        placeStick(Math.max(ins.l + r + 8, Math.min(w * 0.5, x)), Math.max(ins.t + r + 8, Math.min(h - ins.b - r - 6, y)));
        stick.classList.add('on');
        moveStick(x, y);
      } else { rec.kind = 'look'; recs.set(id, rec); }
    }
  }
  function onMove(e) {
    if (!on) return;
    e.preventDefault();
    for (const ct of e.changedTouches) {
      const rec = recs.get(ct.identifier);
      if (!rec) continue;
      const x = ct.clientX, y = ct.clientY, dx = x - rec.x, dy = y - rec.y;
      rec.x = x; rec.y = y; rec.moved += Math.abs(dx) + Math.abs(dy);
      if (rec.kind === 'stick') moveStick(x, y);
      else if (rec.kind === 'look') look(dx, dy);
      else if (rec.kind === 'btn') {
        const b = rec.b;
        if (b.look && rec.moved > 8) look(dx, dy);                     // aim while holding a magic button
        else if (b.kind === 'swap') {
          if (!rec.wheel && rec.moved > 18 && deps.wheel?.openTouch?.()) rec.wheel = true;   // a flick opens the wheel at once
          if (rec.wheel) deps.wheel?.touchVec?.(dx, dy);
        }
      }
    }
  }
  function onEnd(e) {
    if (!on) return;
    if (e.cancelable) e.preventDefault();
    const cancelled = e.type === 'touchcancel';
    for (const ct of e.changedTouches) {
      const rec = recs.get(ct.identifier);
      if (!rec) continue;
      recs.delete(ct.identifier);
      if (rec.kind === 'btn') release(rec.b, rec, cancelled);
      else if (rec.kind === 'stick') endStick();
      else if (rec.kind === 'tap' && !cancelled && performance.now() - rec.t0 < 650 && rec.moved < 24) readOn();
    }
  }
  /** A tap in a conversation / cutscene reads on (as Enter does). A choice must be tapped itself. */
  function readOn() {
    if (root.querySelector('.dlg-box.choosing')) return;
    tapCode('Enter');
  }
  function moveStick(x, y) {
    const r = 62 * ts;
    let dx = x - sx, dy = y - sy;
    const l = Math.hypot(dx, dy);
    if (l > r) { dx *= r / l; dy *= r / l; }
    setKnob(dx, dy);
    const m = Math.min(1, l / r);
    const k = m <= DEAD ? 0 : (m - DEAD) / (1 - DEAD);
    const nx = l > 1e-3 ? (dx / Math.min(l, r)) * k : 0, ny = l > 1e-3 ? (-dy / Math.min(l, r)) * k : 0;
    stickVal.x = nx; stickVal.y = ny;
    pushStick();
  }
  const stickVal = { x: 0, y: 0 };
  function pushStick() {
    // on the broom the sideways push turns her (update() feeds the turn); only a little of it strafes
    const onB = ctx === BROOM;
    V()?.move(onB ? stickVal.x * 0.3 : stickVal.x, stickVal.y);
  }
  function endStick() {
    stickRec = null; stickVal.x = stickVal.y = 0;
    V()?.move(0, 0);
    stick.classList.remove('on');
    setKnob(0, 0);
    placeStick(idleX, idleY);
  }
  function releaseAll() {
    for (const rec of recs.values()) if (rec.kind === 'btn') release(rec.b, rec, true);
    recs.clear();
    if (stickRec) endStick();
    V()?.releaseAll?.();
    runLatched = false;
    for (const q of releaseQ) { if (q.code) V()?.key(q.code, false); }
    releaseQ.length = 0;
    for (const b of list) { b.down = false; b.n.classList.remove('on'); }
  }
  R.addEventListener('touchstart', onStart, { passive: false });
  R.addEventListener('touchmove', onMove, { passive: false });
  R.addEventListener('touchend', onEnd, { passive: false });
  R.addEventListener('touchcancel', onEnd, { passive: false });
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  // the ending reads keys only (Space: next line, held: faster credits): a finger on it does the same
  let endHold = null;
  document.addEventListener('touchstart', (e) => {
    if (!on || endHold !== null || !e.target?.closest?.('.mv-end')) return;
    endHold = G.time.frame; flush(null, 'Space'); V()?.key('Space', true);
  }, { capture: true, passive: true });
  const endUp = (e) => {
    if (endHold === null || e.touches.length) return;
    const f0 = endHold; endHold = null;
    if (G.time.frame - f0 >= MIN_FRAMES) V()?.key('Space', false); else releaseQ.push({ act: null, code: 'Space', frame: f0 + MIN_FRAMES, at: 0 });
  };
  document.addEventListener('touchend', endUp, { capture: true, passive: true });
  document.addEventListener('touchcancel', endUp, { capture: true, passive: true });

  // ---------------- per frame ----------------
  function setCtx(c) {
    if (c === ctx) return;
    const prev = ctx;
    ctx = c;
    const play = !!(c & (FOOT | BROOM));
    if (!play || !(prev & (FOOT | BROOM))) {
      // leaving play (talk, menu, cutscene): every finger lets go of the world
      for (const rec of recs.values()) if (rec.kind === 'btn' && !(rec.b.ctx & c)) release(rec.b, rec, true);
      for (const [id, rec] of recs) if (rec.kind !== 'btn' || !(rec.b.ctx & c)) recs.delete(id);
      if (stickRec) endStick();
      if (!play) { for (const a of ['attack', 'cast', 'jump', 'descend', 'guard']) V()?.up(a); }
    }
    if ((c === BROOM) !== wasBroom) {   // mounting / dismounting: sprint and boost start fresh
      wasBroom = c === BROOM;
      if (runLatched) { runLatched = false; V()?.up('sprint'); }
      if (stickRec) pushStick();
    }
    padOn = c !== 0;
    R.classList.toggle('pad', padOn);
    R.classList.toggle('play', play);
  }

  function ringSvg() {
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '-50 -50 100 100'); s.setAttribute('class', 'ring');
    const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', '46'); c.setAttribute('class', 'arc');
    const len = 2 * Math.PI * 46;
    c.setAttribute('stroke-dasharray', len.toFixed(2)); c.setAttribute('stroke-dashoffset', len.toFixed(2));
    s.appendChild(c); s._c = c; s._len = len; s._v = -1;
    return s;
  }
  function setRing(s, v) {
    v = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
    if (s._v === v) return; s._v = v;
    s._c.setAttribute('stroke-dashoffset', (s._len * (1 - v)).toFixed(2));
  }

  let visKey = -1;
  function update(rdt) {
    if (!on) { if (R._show) { R._show = false; R.classList.remove('show'); } return; }
    const now = G.time.frame;
    // queued releases of quick taps
    for (let i = releaseQ.length - 1; i >= 0; i--) {
      const q = releaseQ[i];
      if (now < q.frame || (q.at && performance.now() < q.at)) continue;
      releaseQ.splice(i, 1);
      if (q.code) V()?.key(q.code, false);
      else { const b = B[q.act] || list.find((x) => x.act === q.act); if (!(b && b.down)) V()?.up(q.act); }
    }
    const mode = G.mode, P = G.player;
    // a full-screen layer, or the wheel held open from the keyboard, has the screen (the touch-opened wheel keeps it)
    const modal = UI.modals.length > 0 || (!!deps.wheel?.open && !deps.wheel?.touchOpen);
    let c = 0;
    if (!modal) {
      if (mode === 'play') c = P && P.onBroom ? BROOM : FOOT;
      else if (mode === 'talk') c = TALK;
      else if (mode === 'cutscene') c = CUT;
    }
    setCtx(c);
    const show = c !== 0;
    if (R._show !== show) { R._show = show; R.classList.toggle('show', show); }
    if (!show) return;

    // what is known / possible right now
    if (c === CUT && (now & 7) === 0) skippable = !!root.querySelector('.mvs-skip.on');
    const slots = spellSlots();
    known = 0; for (let i = 0; i < slots.length; i++) if (slots[i].level > 0) known++;
    let key = c;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const v = !!(b.ctx & c) && (!b.cond || b.cond());
      if (v) key += 1 << (i + 4);
      if (b.vis !== v) { b.vis = v; b.n.classList.toggle('vis', v); if (!v && b.down) { for (const [id, rec] of recs) if (rec.b === b) { recs.delete(id); release(b, rec, true); } } }
    }
    if (key !== visKey) {
      visKey = key;
      for (const b of [jump, broom, sprint]) { const nm = nameOf(b, c); b.n.setAttribute('aria-label', nm); setText(b.cap, nm); }
      // a button seen for the first time (the first steps, the broom once learned …) is introduced by name
      const fresh = (key >>> 4) & ~seenBits;
      if (fresh && (c & (FOOT | BROOM)) && G.settings?.hints !== false) {
        coachT = seenBits ? 6 : 9;
        for (let i = 0; i < list.length; i++) if (list[i] !== jump && list[i] !== broom && list[i] !== sprint) setText(list[i].cap, nameOf(list[i], c));
      }
      if (c & (FOOT | BROOM)) seenBits |= key >>> 4;
    }
    if (coachT > 0) { coachT -= rdt; if (R._coach !== true) { R._coach = true; R.classList.add('coach'); } }
    else if (R._coach) { R._coach = false; R.classList.remove('coach'); }

    // the cast disc wears the selected magic
    if (c & (FOOT | BROOM)) {
      const sel = selectedId();
      let s = null, next = null;
      for (let i = 0; i < slots.length; i++) if (slots[i].id === sel && slots[i].level > 0) s = slots[i];
      if (s) { for (let k = 1; k < 8; k++) { const j = (s.index + k) % 8; if (slots[j].level > 0) { next = slots[j]; break; } } }
      const sk = s ? s.id : '';
      if (sk !== lastSel) {
        if (lastSel && sk) { cast.n.classList.remove('swap'); void cast.n.offsetWidth; cast.n.classList.add('swap'); }
        lastSel = sk;
        setIcon(cast.ic, s ? s.id : 'lock');
        cast.n.style.setProperty('--sc', s ? s.color : '#8a7d70');
        cast.n.setAttribute('aria-label', s ? s.name : t('ui.touch.btn.cast'));
      }
      const nc = next && next !== s ? next.color : 'transparent';
      if (swapDot._c !== nc) { swapDot._c = nc; swap.n.style.setProperty('--nc', nc); }
      const v = vitals();
      const dry = !!s && s.cost > 0 && v.mana < s.cost;
      if (cast.n._dry !== dry) { cast.n._dry = dry; cast.n.classList.toggle('dim', dry); }
      const cd = s ? Math.round(cooldownLeft(s) * 40) / 40 : 0;
      if (cdw._v !== cd) { cdw._v = cd; cdw.style.setProperty('--cd', String(cd)); cast.n.classList.toggle('cooling', cd > 0); }
      setRing(ring, charge());
      if (B.ultimate.vis) setRing(gRing, gauge());
      const dg = inv('dango');
      if (healN._n !== dg) { healN._n = dg; healN.textContent = String(dg); }
      if (heal.n._none !== (dg <= 0)) { heal.n._none = dg <= 0; heal.n.classList.toggle('dim', dg <= 0); }
      if (sprint.n._l !== runLatched) { sprint.n._l = runLatched; sprint.n.classList.toggle('latch', runLatched); stick.classList.toggle('run', runLatched); }
      // walking: the toggle lets go once the stick has rested a moment (the broom keeps its boost until tapped)
      if (runLatched && c === FOOT) {
        idleStill = stickRec ? 0 : idleStill + rdt;
        if (idleStill > 0.8) { runLatched = false; V()?.up('sprint'); }
      }
      // broom: the stick's sideways push turns the flight (the camera turns, the broom follows it)
      if (c === BROOM && stickRec && Math.abs(stickVal.x) > 0.02 && G.input) {
        const s2 = G.settings || {};
        G.input.lookX += (stickVal.x * STEER * rdt) / (0.0024 * (Number(s2.sens) > 0 ? Number(s2.sens) : 1));
      }
    }
    // swap orb: held long enough opens the wheel; the skip button fills while held
    if (recs.size) for (const rec of recs.values()) {
      if (rec.kind !== 'btn') continue;
      if (rec.b.kind === 'swap' && !rec.wheel) { rec.wheelT += rdt; if (rec.wheelT >= HOLD_WHEEL && deps.wheel?.openTouch?.()) rec.wheel = true; }
      if (rec.b.kind === 'skip') {
        rec.holdT += rdt;
        skipFill.style.setProperty('--k', Math.min(1, rec.holdT / SKIP_HOLD).toFixed(3));
        if (rec.holdT >= SKIP_HOLD && !rec.fired) { rec.fired = true; vDown('cancel'); vUp('cancel', G.time.frame); sfx('ui_select', 0.5); }
      }
    }
  }

  const api = {
    root: R,
    get on() { return on; },
    get ctx() { return ctx; },
    update,
    apply,
    /** the interact prompt ("KEY  verb", from core/interact.js): the verb goes on the interact button */
    prompt(text) {
      const m = text ? /^(\S{1,6})\s{2,}(.+)$/.exec(text) : null;
      promptVerb = text ? (m ? m[2] : text) : '';
      setText(verb, promptVerb);
    },
    releaseAll,
    /** test hook: where a button is on screen (centre, client px) or null when hidden */
    where(id) { const b = B[id]; if (!b || !b.vis) return null; const r = b.n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; },
    get stick() { return { x: stickVal.x, y: stickVal.y, cx: sx, cy: sy, active: !!stickRec, idleX, idleY, r: 62 * ts }; },
  };

  // ---------------- device ----------------
  const env = installTouchEnv(root, () => apply());
  window.addEventListener('resize', () => { measure(); });
  G.events.on('settings:changed', () => { apply(); measure(); });
  apply();
  return api;
}
