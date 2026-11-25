// Panels shared by the title screen and the pause scroll: settings, controls, the confirm slip, and a generic paper "sheet" modal.
// Every panel is keyboard (arrows / WASD / Enter / Esc) and mouse operable.
import { G } from '../core/game.js';
import { t, raw, locales, getLocale, setLocale } from '../core/i18n.js';
import { UI, K, el, tel, clear, paper, keycap, keyLabels, hintLine, pushModal, popModal, sfx, codeLabel } from './dom.js';
import { icon } from './icons.js';
import { addCss } from './style.js';
import { BINDINGS } from '../core/input.js';
import { touchUI, touchSettingRows, createTouchGuide } from './touch.js';   // touch controls: their own rows + guide
import { mobileDevice } from '../render/gpubench.js';

addCss(`
/* ---- settings ---- */
.mv-set { columns: 2; column-gap: 52u; column-rule: 1u solid rgba(148,113,47,.22); padding: 4u 6u; }
.mv-set .sec { break-inside: avoid; margin-bottom: 18u; }
.mv-set .sh { display: flex; align-items: center; gap: 10u; font: 600 14u/1 var(--fd); letter-spacing: .24em; color: var(--brass3); margin: 6u 0 10u; }
.mv-set .sh::after { content: ''; flex: 1; height: 1u; background: linear-gradient(90deg, rgba(148,113,47,.5), transparent); }
.mv-set .row { position: relative; display: flex; align-items: center; min-height: 40u; padding: 4u 10u 4u 24u; gap: 12u; cursor: pointer; pointer-events: auto; border-radius: 4u; transition: background-color .15s; }
.mv-set .row::before { content: ''; position: absolute; left: 7u; top: 50%; width: 10u; height: 10u; margin-top: -5u; background: var(--brass3); transform: scale(0); transition: transform .18s var(--ease);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.mv-set .row:hover { background-color: rgba(148,113,47,.06); }
.mv-set .row.sel { background-color: rgba(148,113,47,.12); }
.mv-set .row.sel::before { transform: none; }
.mv-set .lb { flex: 1; font: 400 15u/1.3 var(--fb); letter-spacing: .06em; color: var(--ink); white-space: nowrap; }
.mv-set .ctl { display: flex; align-items: center; gap: 10u; }
.mv-set .trk { position: relative; width: 168u; height: 22u; cursor: pointer; touch-action: none; }
.mv-set .trk::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 4u; margin-top: -2u; background: rgba(42,36,30,.12); border-radius: 2u; box-shadow: inset 0 0 0 1u rgba(148,113,47,.25); }
.mv-set .trk .fil { position: absolute; left: 0; top: 50%; height: 4u; margin-top: -2u; border-radius: 2u; background: linear-gradient(90deg, var(--brass3), var(--brass)); }
.mv-set .trk .knob { position: absolute; top: 50%; width: 16u; height: 16u; margin: -8u 0 0 -8u; border-radius: 50%;
  background: radial-gradient(circle at 40% 34%, #fff6d8, var(--brass) 62%, var(--brass3)); box-shadow: 0 0 0 1u rgba(94,72,40,.5), 0 2u 4u rgba(0,0,0,.25); }
.mv-set .val { width: 36u; text-align: right; font: 600 13.5u/1 var(--fd); color: var(--ink2); }
.mv-set .opts { display: flex; gap: 4u; }
.mv-set .opt { position: relative; padding: 3u 11u; font: 600 13.5u/1.5 var(--fd); color: var(--ink3); letter-spacing: .06em; border-radius: 12u; cursor: pointer; pointer-events: auto; transition: color .15s, background-color .15s, box-shadow .15s; }
.mv-set .opt:hover { color: var(--ink); }
.mv-set .opt.on { color: var(--ink); background: rgba(148,113,47,.16); box-shadow: inset 0 0 0 1u rgba(148,113,47,.55); }
.mv-set .row.key .ctl { min-width: 92u; justify-content: flex-end; }
.mv-set .row.key.wait .ctl { color: var(--wine); font: 400 13.5u/1.4 var(--fb); letter-spacing: .06em; animation: mv-keywait .9s ease-in-out infinite alternate; }
@keyframes mv-keywait { from { opacity: .45; } to { opacity: 1; } }
.mv-set .note { margin: 2u 0 0 24u; font: 400 12.5u/1.5 var(--fb); color: var(--wine); letter-spacing: .04em; min-height: 18u; }

/* ---- controls ---- */
.mv-ctl { columns: 2; column-gap: 52u; column-rule: 1u solid rgba(148,113,47,.22); padding: 4u 6u; }
.mv-ctl .sec { break-inside: avoid; margin-bottom: 16u; }
.mv-ctl .sh { display: flex; align-items: center; gap: 10u; font: 600 14u/1 var(--fd); letter-spacing: .24em; color: var(--brass3); margin: 6u 0 8u; }
.mv-ctl .sh::after { content: ''; flex: 1; height: 1u; background: linear-gradient(90deg, rgba(148,113,47,.5), transparent); }
.mv-ctl .row { display: flex; align-items: center; gap: 14u; min-height: 31u; padding: 0 6u; }
.mv-ctl .ks { width: 132u; flex: none; display: flex; gap: 4u; flex-wrap: wrap; justify-content: flex-end; }
.mv-ctl .ks .or { color: var(--ink3); font-size: 12u; align-self: center; }
.mv-ctl .ds { flex: 1; font: 400 14.5u/1.4 var(--fb); color: var(--ink); letter-spacing: .04em; }

/* ---- sheet modal (title screen sub-pages) ---- */
.mv-sheet > .mv-paper { width: 1000u; max-height: 640u; padding: 40u 56u 30u; display: flex; flex-direction: column; }
.mv-sheet .hd { display: flex; align-items: center; gap: 16u; margin-bottom: 18u; }
.mv-sheet .hd .tt { font: 700 26u/1 var(--fd); letter-spacing: .16em; color: var(--ink); }
.mv-sheet .hd .rule { flex: 1; }
.mv-sheet .bd { flex: 1; min-height: 0; overflow-y: auto; }
.mv-sheet .ft { display: flex; justify-content: space-between; align-items: center; margin-top: 16u; padding-top: 12u; border-top: 1u solid rgba(148,113,47,.25); }
.mv-sheet .hint { font: 400 13u/1.5 var(--fb); color: var(--ink2); letter-spacing: .06em; }
.mv-sheet .hint .keycap { margin: 0 4u; }
.mv-x { position: absolute !important; right: 22u; top: 18u; width: 34u; height: 34u; cursor: pointer; pointer-events: auto; border-radius: 50%; transition: background-color .15s; }
.mv-x::before, .mv-x::after { content: ''; position: absolute; left: 10u; right: 10u; top: 50%; height: 1.6u; margin-top: -.8u; border-radius: 1u; background: var(--ink2); transform: rotate(45deg); transition: background-color .15s; }
.mv-x::after { transform: rotate(-45deg); }
.mv-x:hover { background-color: rgba(148,113,47,.12); }
.mv-x:hover::before, .mv-x:hover::after { background: var(--wine); }
.mv-sheet .hint > span { margin-left: 14u; }

/* ---- confirm slip: a small parchment card under a wax seal ---- */
.mv-confirm { z-index: 5; }
.mv-confirm > .mv-paper { width: 520u; padding: 42u 48u 30u; text-align: center; }
.mv-confirm .seal { position: absolute; left: 50%; top: -17u; width: 36u; height: 36u; margin-left: -18u; font-size: 15u; }
.mv-confirm .tt { font: 700 22u/1.3 var(--fd); letter-spacing: .14em; margin-right: -.14em; color: var(--ink); }
.mv-confirm .tx { margin: 14u 0 24u; font: 400 15.5u/1.8 var(--fb); color: var(--ink2); letter-spacing: .04em; }
.mv-confirm .bs { display: flex; justify-content: center; gap: 24u; }
`);

// ---- shared vertical-list navigation (up / down; mouse hover selects) ----------------------------------------
export function navList(rows, onPick, opts = {}) {
  const nav = {
    rows, i: opts.start || 0,
    set(i, quiet) {
      if (!nav.rows.length) return;
      i = (i + nav.rows.length) % nav.rows.length;
      if (i !== nav.i && !quiet) sfx('ui_move', 0.45);
      nav.i = i;
      nav.rows.forEach((r, j) => r.classList.toggle('sel', j === i));
      if (opts.scroll !== false) nav.rows[i]?.scrollIntoView?.({ block: 'nearest' });
      opts.onSel?.(i);
    },
    bind() {
      nav.rows.forEach((r, j) => {
        r.addEventListener('mouseenter', () => { if (nav.i !== j) nav.set(j); });
        if (onPick) r.addEventListener('click', (e) => { e.stopPropagation(); nav.set(j, true); onPick(j, true); });
      });
      nav.set(Math.min(nav.i, nav.rows.length - 1), true);
      return nav;
    },
    keys() {
      if (K.U) nav.set(nav.i - 1);
      if (K.D) nav.set(nav.i + 1);
      if (onPick && K.confirm(opts.allowE !== false)) { onPick(nav.i, false); return true; }
      return false;
    },
  };
  return nav;
}

// ---- settings -------------------------------------------------------------------------------------------
const SLIDER = (k, label, min, max, step, fmt) => ({ k, label, type: 'slider', min, max, step, fmt });
// phones / tablets list their own tier first ('mobile', core/boot.js QUALITY) and keep low / med / high selectable
// ('highfast' is a desktop-GPU step; five choices no longer fit the compact row)
const qualityTiers = () => (mobileDevice() || G.settings?.quality === 'mobile' ? ['mobile', 'low', 'med', 'high'] : ['low', 'med', 'highfast', 'high']);
function settingRows() {
  const pct = (v) => String(Math.round(v * 100));
  const secs = [
    { head: 'ui.settings.sound', rows: [SLIDER('master', 'ui.settings.master', 0, 1, 0.05, pct), SLIDER('music', 'ui.settings.music', 0, 1, 0.05, pct), SLIDER('sfx', 'ui.settings.sfx', 0, 1, 0.05, pct)] },
    { head: 'ui.settings.view', rows: [SLIDER('sens', 'ui.settings.sens', 0.2, 3, 0.1, (v) => v.toFixed(1)), { k: 'invertY', label: 'ui.settings.invertY', type: 'toggle' }] },
    { head: 'ui.settings.picture', rows: [
      { k: 'quality', label: 'ui.settings.quality', type: 'choice', opts: () => qualityTiers().map((v) => ({ v, l: t('ui.settings.q.' + v) })), note: true },
      { k: 'look', label: 'ui.settings.look', type: 'choice', opts: () => ['soft', 'vivid'].map((v) => ({ v, l: t('ui.settings.lookOpt.' + v) })) },
      ...(mobileDevice() ? [{ k: 'keep1080', label: 'ui.settings.keep1080', type: 'toggle' }] : []), // phones: never below 1080 lines
      { k: 'shake', label: 'ui.settings.shake', type: 'toggle' }, { k: 'cinematic', label: 'ui.settings.cinematic', type: 'toggle' }, { k: 'hints', label: 'ui.settings.hints', type: 'toggle' }] },
  ];
  // touch screens: their own section (button size / opacity / drag-to-look) instead of the mouse speed and the key list
  const touchRows = touchSettingRows();
  if (touchRows) secs.splice(2, 0, touchRows);
  if (touchUI()) { const v = secs.find((x) => x.head === 'ui.settings.view'); if (v) v.rows = v.rows.filter((r) => r.k !== 'sens'); }
  else secs.push({ head: 'ui.settings.keys', rows: [...REBIND.map((k) => ({ k, label: 'ui.settings.key.' + k, type: 'key' })), { k: '_reset', label: 'ui.settings.keyReset', type: 'action' }] });
  // Sprint: hold or toggle (its own small group, so the rows above are left alone)
  secs.push({ head: 'ui.settings.movement', rows: [{ k: 'sprintMode', label: 'ui.settings.sprintMode', type: 'choice',
    opts: () => [{ v: 'hold', l: t('ui.settings.sprintModeHold') }, { v: 'toggle', l: t('ui.settings.sprintModeToggle') }] }] });
  const locs = locales();
  if (locs.length > 1) secs.push({ head: 'ui.settings.lang', rows: [{ k: 'lang', label: 'ui.settings.lang', type: 'choice', opts: () => locales().map((l) => ({ v: l.code, l: l.name })) }] });
  return secs;
}

// ---- key rebinding --------------------------------------------------------------------------------------
// The first code of an action is its own key (shown in every hint); G.settings.keys = { action: code } holds the changes.
// A key already used by another rebindable action is swapped over to it, so no two actions ever share one.
const REBIND = ['forward', 'back', 'left', 'right', 'jump', 'descend', 'sprint', 'dodge', 'broom', 'interact', 'attack', 'cast', 'guard', 'heal', 'lock', 'summon', 'ultimate', 'wheel', 'map', 'journal', 'spellbook'];
// Auto-forward goes through the same form: it starts unbound (an empty list) and the player picks the key
REBIND.push('autoForward');
const DEFAULT_LISTS = Object.fromEntries(REBIND.map((k) => [k, (BINDINGS[k] || []).slice()]));
const DEFAULT_KEYS = Object.fromEntries(REBIND.map((k) => [k, DEFAULT_LISTS[k][0]]));
const CAPTURE_CODES = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => 'Key' + c), ...'0123456789'.split('').map((c) => 'Digit' + c),
  'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'CapsLock',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
  'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10',
  ...'0123456789'.split('').map((c) => 'Numpad' + c), 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal',
];
const NO_BIND = new Set(['Escape', 'Enter', 'NumpadEnter', 'Backspace', 'MetaLeft', 'MetaRight', 'Tab', 'F5', 'F11', 'F12']);
/** Apply G.settings.keys to the live bindings (boot + after every change). The default alternates (arrow keys, Mouse1)
 *  stay bound after the chosen key unless another action now uses them. */
export function applyKeyBindings() {
  const B = G.input?.bindings || BINDINGS;
  const saved = (G.settings && G.settings.keys) || {};
  const want = {};
  for (const k of REBIND) want[k] = typeof saved[k] === 'string' && saved[k] && !NO_BIND.has(saved[k]) ? saved[k] : DEFAULT_KEYS[k];
  for (const k of REBIND) {
    const b = B[k]; if (!b) continue;
    const used = (c) => REBIND.some((o) => o !== k && want[o] === c);
    const list = [want[k], ...DEFAULT_LISTS[k].filter((c) => c !== want[k] && !used(c))];
    if (typeof list[0] !== 'string' || !list[0]) list.length = 0;   // unbound action: [] rather than [undefined]
    b.length = 0; b.push(...list);
  }
  G.events?.emit?.('input:rebound');
}
function rebind(action, code) {
  const s = G.settings || (G.settings = {});
  const keys = { ...(s.keys || {}) };
  const cur = (k) => keys[k] || DEFAULT_KEYS[k];
  const mine = cur(action);
  if (mine === code) return false;
  const other = REBIND.find((k) => k !== action && cur(k) === code);
  if (other) keys[other] = mine;
  keys[action] = code;
  for (const k of REBIND) if (keys[k] === DEFAULT_KEYS[k]) delete keys[k];
  s.keys = keys;
  applyKeyBindings();
  return other || true;
}
/** The other rebindable action whose chosen key is `code`, or null. Only first keys are asked about: a secondary
 *  default (an arrow, ShiftRight, Mouse1) gives way on its own inside applyKeyBindings. */
function keyOwner(action, code) {
  const keys = (G.settings && G.settings.keys) || {};
  const cur = (k) => keys[k] || DEFAULT_KEYS[k];
  return REBIND.find((k) => k !== action && cur(k) === code) || null;
}
/** A key already belongs to another action: ask before taking it over. "Swap over" is the plain rebind (that action
 *  gets the key we had); anything else leaves every binding as it is. */
function askKeySwap(action, code, other, after) {
  const keys = (G.settings && G.settings.keys) || {};
  const mine = keys[action] || DEFAULT_KEYS[action];
  const done = (swap) => {
    if (swap && rebind(action, code)) {
      sfx('ui_select', 0.6);
      try { G.save?.writeSettings(); } catch (e) { G.reportError('ui:settings', e); }
    }
    try { after && after(); } catch (e) { G.reportError('ui:settings', e); }
  };
  try {
    confirmBox(UI.root, {
      title: t('ui.settings.keyTakenTitle'),
      text: t('ui.settings.keyTakenText', { key: codeLabel(code), action: t('ui.settings.key.' + other), mine: codeLabel(mine) }),
      yes: t('ui.settings.keySwapYes'),
      no: t('ui.settings.keySwapNo'),
    }).then(done).catch((e) => G.reportError('ui:settings', e));
  } catch (e) { G.reportError('ui:settings', e); done(false); }
}

/** The settings form. Parent calls .keys() each frame while it has focus. Writes through G.save.writeSettings(). */
export function createSettings(parent) {
  const root = el('div', 'mv-set', parent);
  const bootQuality = G.settings && G.settings.quality;
  let nav = null, rowsDef = [], noteEl = null;

  const S = () => G.settings || (G.settings = {});
  function write(k, v) {
    const s = S();
    if (s[k] === v) return;
    s[k] = v;
    if (k === 'quality') s.qualityAuto = null; // the player's own choice: boot never re-picks it (core/boot.js autoStale)
    if (k === 'lang') { try { setLocale(v); } catch (e) { G.reportError('ui:lang', e); } }
    try { G.save?.writeSettings(); } catch (e) { G.reportError('ui:settings', e); }
    paint();
  }

  function render() {
    clear(root);
    rowsDef = [];
    const rows = [];
    for (const sec of settingRows()) {
      const s = el('div', 'sec', root);
      tel('div', 'sh', s, sec.head);
      for (const d of sec.rows) {
        const r = el('div', 'row', s);
        tel('div', 'lb', r, d.label);
        const c = el('div', 'ctl', r);
        d.node = r;
        if (d.type === 'slider') {
          const trk = el('div', 'trk', c); d.fil = el('div', 'fil', trk); d.knob = el('div', 'knob', trk); d.val = el('div', 'val', c);
          const at = (e) => { const b = trk.getBoundingClientRect(); const f = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)); write(d.k, snap(d, d.min + f * (d.max - d.min))); };
          trk.addEventListener('pointerdown', (e) => { e.stopPropagation(); trk.setPointerCapture?.(e.pointerId); trk._drag = true; at(e); });
          trk.addEventListener('pointermove', (e) => { if (trk._drag) at(e); });
          trk.addEventListener('pointerup', () => { trk._drag = false; sfx('ui_move', 0.4); });
        } else if (d.type === 'key') {
          r.classList.add('key');
          d.cap = c;
          r.addEventListener('click', (e) => { e.stopPropagation(); startCapture(d); });
        } else if (d.type === 'action') {
          r.addEventListener('click', (e) => { e.stopPropagation(); resetKeys(); });
        } else {
          const o = el('div', 'opts', c);
          const opts = d.type === 'toggle' ? [{ v: true, key: 'ui.settings.on' }, { v: false, key: 'ui.settings.off' }] : d.opts();
          d.optNodes = opts.map((op) => {
            const n = op.key ? tel('span', 'opt', o, op.key) : el('span', 'opt', o, op.l);
            n._v = op.v;
            n.addEventListener('click', (e) => { e.stopPropagation(); sfx('ui_select', 0.6); write(d.k, op.v); });
            return n;
          });
          d.vals = opts.map((op) => op.v);
        }
        if (d.note) noteEl = el('div', 'note', s);
        rowsDef.push(d); rows.push(r);
      }
    }
    nav = navList(rows, null, { start: nav ? nav.i : 0 }).bind();
    paint();
  }

  function snap(d, v) { return +Math.min(d.max, Math.max(d.min, Math.round(v / d.step) * d.step)).toFixed(3); }

  function paint() {
    const s = S();
    for (const d of rowsDef) {
      const v = s[d.k];
      if (d.type === 'slider') {
        const f = ((typeof v === 'number' ? v : d.min) - d.min) / (d.max - d.min);
        d.fil.style.width = (f * 100).toFixed(1) + '%';
        d.knob.style.left = (f * 100).toFixed(1) + '%';
        d.val.textContent = d.fmt(typeof v === 'number' ? v : d.min);
      } else if (d.type === 'key') {
        if (d === capturing) { d.node.classList.add('wait'); d.cap.textContent = t('ui.settings.keyPress'); }
        else { d.node.classList.remove('wait'); clear(d.cap); keycap(codeLabel((G.input?.bindings?.[d.k] || [])[0] || ''), d.cap, 'sm'); }
      } else if (d.type === 'action') {
        // (no value)
      } else {
        const cur = d.k === 'lang' ? (v || getLocale()) : d.type === 'toggle' ? !!v : v;
        d.optNodes.forEach((n) => n.classList.toggle('on', n._v === cur));
      }
    }
    if (noteEl) noteEl.textContent = s.quality !== bootQuality ? t('ui.settings.qualityNote') : '';
  }

  function adjust(dir) {
    const d = rowsDef[nav.i];
    if (!d) return;
    const s = S();
    if (d.type === 'key' || d.type === 'action') return;
    if (d.type === 'slider') write(d.k, snap(d, (typeof s[d.k] === 'number' ? s[d.k] : d.min) + dir * d.step));
    else {
      const cur = d.k === 'lang' ? (s.lang || getLocale()) : d.type === 'toggle' ? !!s[d.k] : s[d.k];
      let i = d.vals.indexOf(cur);
      if (d.type === 'toggle') i = cur ? 1 : 0; // on / off
      i = Math.min(d.vals.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir));
      if (d.type === 'toggle') write(d.k, d.vals[i]); else write(d.k, d.vals[i]);
    }
    sfx('ui_move', 0.45);
  }

  // ---- key capture: the next key / mouse button pressed becomes the action's key; Esc cancels. Keys are read from G.input
  // (so the menu and the test driver see the same thing); mouse buttons from a window listener, since clicks on the
  // scroll never reach the canvas.
  let capturing = null, capT = 0, tookT = 0;
  function endCapture() {
    if (!capturing) return;
    capturing = null;
    window.removeEventListener('mousedown', onCapMouse, true);
    paint();
  }
  function take(code) {
    const d = capturing; if (!d) return;
    if (code.startsWith('Mouse')) tookT = performance.now();
    endCapture();
    const owner = keyOwner(d.k, code);                                  // a key another action already wears: ask first
    if (owner) { askKeySwap(d.k, code, owner, paint); return; }
    if (rebind(d.k, code)) { sfx('ui_select', 0.6); try { G.save?.writeSettings(); } catch (e) { G.reportError('ui:settings', e); } }
    paint();
  }
  function pollCapture() {
    const inp = G.input;
    if (!capturing || !inp || performance.now() - capT < 200) return;
    if (inp.codePressed('Escape')) { sfx('ui_move', 0.4); endCapture(); return; }
    if (!inp.anyPressed) return;
    for (const c of CAPTURE_CODES) if (inp.codePressed(c)) { take(c); return; }
  }
  function onCapMouse(e) {
    if (!capturing || performance.now() - capT < 250) return;
    if (e.button > 2) return;
    e.preventDefault(); e.stopImmediatePropagation();
    take('Mouse' + e.button);
  }
  function startCapture(d) {
    if (performance.now() - tookT < 400) return; // the click that ends a mouse-button capture must not start another
    if (capturing) endCapture();
    capturing = d; capT = performance.now();
    window.addEventListener('mousedown', onCapMouse, true);
    sfx('ui_select', 0.5);
    paint();
  }
  function resetKeys() {
    const s = S();
    if (s.keys && Object.keys(s.keys).length) { delete s.keys; applyKeyBindings(); try { G.save?.writeSettings(); } catch (e) { G.reportError('ui:settings', e); } }
    sfx('ui_select', 0.6);
    paint();
  }

  render();
  return {
    el: root, render, paint,
    get capturing() { return !!capturing; },
    get index() { return nav.i; },
    /** keyboard: up/down choose a row, left/right (or Enter) change it */
    keys() {
      if (capturing) { pollCapture(); K.eat(); return; }
      nav.keys();
      if (K.L) adjust(-1);
      if (K.R) adjust(+1);
      if (K.confirm(false)) {
        const d = rowsDef[nav.i];
        if (d && d.type === 'key') startCapture(d);
        else if (d && d.type === 'action') resetKeys();
        else if (d && d.type === 'toggle') write(d.k, !S()[d.k]);
        else if (d && d.type === 'choice') { const s = S(); const i = d.vals.indexOf(d.k === 'lang' ? (s.lang || getLocale()) : s[d.k]); write(d.k, d.vals[(i + 1) % d.vals.length]); }
      }
    },
  };
}

// ---- controls -------------------------------------------------------------------------------------------
function controlGroups() {
  return [
    { head: 'move', rows: [['move', ['W', 'A', 'S', 'D']], ['look', [t('ui.controls.mouse')]], ['jump', 'jump'], ['descend', 'descend'], ['sprint', 'sprint'], ['dodge', 'dodge'], ['broom', 'broom']] },
    { head: 'fight', rows: [['attack', 'attack'], ['guard', 'guard'], ['lock', 'lock'], ['heal', 'heal']] },
    { head: 'spell', rows: [['cast', 'cast'], ['select', ['1', '–', '8', t('ui.controls.wheelScroll')]], ['wheel', 'wheel'], ['summon', 'summon'], ['ultimate', 'ultimate']] },
    { head: 'misc', rows: [['interact', 'interact'], ['map', 'map'], ['journal', 'journal'], ['spellbook', 'spellbook'], ['pause', 'pause']] },
  ];
}
export function createControls(parent) {
  if (touchUI()) return createTouchGuide(parent);
  const root = el('div', 'mv-ctl', parent);
  function render() {
    clear(root);
    for (const g of controlGroups()) {
      const s = el('div', 'sec', root);
      tel('div', 'sh', s, 'ui.controls.groups.' + g.head);
      for (const [desc, keys] of g.rows) {
        const r = el('div', 'row', s);
        const ks = el('div', 'ks', r);
        // The two rows the table spells out by hand - the walk row (W A S D) and the spell digits (1 - 8) - are
        // rebuilt from the live bindings, so a rebound key shows up here too; null means keep the table's labels.
        const live = liveKeyLabels(desc);
        const labels = live || (Array.isArray(keys) ? keys : keyLabels(keys));
        const spaced = !live && !Array.isArray(keys);
        labels.forEach((l, i) => {
          if (l === '–') { el('span', 'or', ks, l); return; }
          if (i > 0 && spaced) el('span', 'or', ks, '/');
          keycap(l, ks, 'sm');
        });
        tel('div', 'ds', r, 'ui.controls.' + desc);
      }
    }
  }
  render();
  return { el: root, render };
}

/** The two rows whose caps the table above spells out by hand: the walk row (W A S D) and the spell digits (1 - 8).
 *  Rebuilt from keyLabels() so a rebound key shows up here too; null = keep the table's own labels. */
function liveKeyLabels(desc) {
  if (desc === 'move') return ['forward', 'left', 'back', 'right'].map((a) => keyLabels(a)[0] || '');
  if (desc === 'select') return [keyLabels('el1')[0] || '', '–', keyLabels('el8')[0] || '', t('ui.controls.wheelScroll')];
  return null;
}

// ---- modal plumbing for the sheets below ----------------------------------------------------------------------
function modalShell(root, cls) {
  const m = el('div', 'modal ' + cls, root);
  const sheet = paper('', m);
  requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('on')));
  return { m, sheet, close() { m.classList.remove('on'); setTimeout(() => m.remove(), 260); } };
}

/** A titled paper sheet holding settings / controls (used by the title screen). Resolves when closed. */
export function openSheet(root, kind) {
  return new Promise((resolve) => {
    const { m, sheet, close } = modalShell(root, 'mv-sheet');
    const hd = el('div', 'hd', sheet);
    el('span', 'seal', hd, raw('ui.seal.title') ? t('ui.seal.title') : '');
    tel('div', 'tt', hd, kind === 'settings' ? 'ui.title.settings' : 'ui.title.controls');
    el('div', 'rule ink', hd);
    const x = el('div', 'mv-x', sheet);
    const bd = el('div', 'bd scroll', sheet);
    const view = kind === 'settings' ? createSettings(bd) : createControls(bd);
    const ft = el('div', 'ft', sheet);
    const hint = el('div', 'hint', ft);
    const back = el('div', 'btn', ft); icon('resume', '', back); tel('span', '', back, 'ui.title.back');
    const paintHint = () => {
      if (kind === 'settings') hintLine(hint, 'ui.menu.hintAdjust', { left: '←', right: '→' });
      else clear(hint);
      const k = el('span', '', hint); hintLine(k, 'ui.menu.hintClose', { key: codeLabel('Escape') });
    };
    paintHint();
    const modal = {
      el: m,
      relabel() { view.render(); paintHint(); },
      update() {
        const cap = !!view.capturing;   // Esc while choosing a key only cancels the choice
        if (view.keys) view.keys();
        if (!cap && K.cancel()) { done(); }
        K.eat();
      },
    };
    function done() { popModal(modal); sfx('ui_close', 0.6); close(); resolve(); }
    back.addEventListener('click', done);
    x.addEventListener('click', done);
    pushModal(modal);
    sfx('ui_open', 0.6);
  });
}

/** A small confirm slip. Resolves true / false. */
export function confirmBox(root, { title, text, yes, no, seal } = {}) {
  return new Promise((resolve) => {
    const { m, sheet, close } = modalShell(root, 'mv-confirm');
    if (seal) el('span', 'seal', sheet, seal);
    el('div', 'tt', sheet, title || '');
    el('div', 'tx', sheet, text || '');
    const bs = el('div', 'bs', sheet);
    const bY = el('div', 'btn red', bs); el('span', '', bY, yes || t('ui.common.yes'));
    const bN = el('div', 'btn', bs); el('span', '', bN, no || t('ui.common.no'));
    const btns = [bY, bN];
    let i = 1; // the safe answer is preselected
    const mark = () => btns.forEach((b, j) => b.classList.toggle('sel', j === i));
    mark();
    btns.forEach((b, j) => { b.addEventListener('mouseenter', () => { if (i !== j) { i = j; mark(); sfx('ui_move', 0.4); } }); b.addEventListener('click', (e) => { e.stopPropagation(); finish(j === 0); }); });
    const modal = {
      el: m,
      update() {
        if (K.L || K.U) { i = 0; mark(); sfx('ui_move', 0.4); }
        if (K.R || K.D) { i = 1; mark(); sfx('ui_move', 0.4); }
        if (K.confirm()) finish(i === 0);
        else if (K.cancel()) finish(false);
        K.eat();
      },
    };
    function finish(v) { popModal(modal); sfx(v ? 'ui_select' : 'ui_close', 0.6); close(); K.eat(); resolve(v); }
    pushModal(modal);
    sfx('ui_open', 0.5);
  });
}

export { UI };
