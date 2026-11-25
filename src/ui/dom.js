// Shared plumbing of the UI: element helpers, translated-text binding, keyboard navigation, the modal stack,
// and the "menu mode" bookkeeping (G.setMode('menu') + pointer lock) that every full-screen layer goes through.
import { G } from '../core/game.js';
import { t, raw, has } from '../core/i18n.js';

export const UI = {
  root: null,
  /** px per design unit (1 at 1280×720, 1.5 at 1920×1080). CSS reads it as var(--u). */
  u: 1, w: 1280, h: 720,
  /** last real mouse position (client px) and whether it moved this frame */
  mouse: { x: 0, y: 0, moved: false },
  modals: [],
  /** overridable for tests: what "back to title" does */
  reload: () => location.reload(),
};

// ---- elements -------------------------------------------------------------------------------
export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

/** Bind a locale key to a node: text is set now and again whenever the language changes. params may be a function. */
export function tx(node, key, params) {
  node._tk = key; node._tp = params;
  node.setAttribute('data-t', '');
  node.textContent = t(key, typeof params === 'function' ? params() : params);
  return node;
}
export const tel = (tag, cls, parent, key, params) => tx(el(tag, cls, parent), key, params);
/** Re-apply every bound text below `root` (called on locale change). */
export function retranslate(root) {
  for (const n of root.querySelectorAll('[data-t]')) if (n._tk) n.textContent = t(n._tk, typeof n._tp === 'function' ? n._tp() : n._tp);
}
/** Layout habit of the current language (ui.layout.*): not text, so read raw. */
export function layoutFlag(name, dflt) { const v = raw('ui.layout.' + name); return v === undefined ? dflt : v; }

/** Key label for an action, e.g. key('interact') -> 'E'. */
export const key = (action) => G.input.keyLabel(action);
/** Label of one key / button code ('KeyW' -> 'W', 'Mouse0' -> the locale's word for it). */
export function codeLabel(c) {
  if (!c) return t('ui.settings.keyUnbound');   // an action with no key yet (auto-forward until the player picks one)
  if (has('core.key.' + c)) return t('core.key.' + c);
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  return c;
}
/** Distinct labels of every binding of an action. */
export function keyLabels(action) {
  const out = [];
  for (const c of (G.input.bindings && G.input.bindings[action]) || []) { const l = codeLabel(c); if (!out.includes(l)) out.push(l); }
  return out;
}
/** Fill `node` with a hint sentence: text from the locale where each {name} is replaced by key caps. caps = { name: label | [labels] }. */
export function hintLine(node, tkey, caps, capCls = 'sm') {
  clear(node);
  const marks = {}; let i = 0; const order = [];
  for (const k of Object.keys(caps)) { marks[k] = String.fromCharCode(0xe000 + i++); order.push(k); }
  const str = t(tkey, marks);
  let buf = '';
  const flush = () => { if (buf) { el('span', '', node, buf); buf = ''; } };
  for (const ch of str) {
    const idx = ch.charCodeAt(0) - 0xe000;
    if (idx >= 0 && idx < order.length) { flush(); for (const l of [].concat(caps[order[idx]])) keycap(l, node, capCls); }
    else buf += ch;
  }
  flush();
  return node;
}
/** A paper key cap element. */
export function keycap(label, parent, cls) { return el('span', 'keycap' + (cls ? ' ' + cls : ''), parent, label); }

/** A parchment sheet: returns the content element; the grained, filigree-framed background sits behind it. */
export function paper(cls, parent) {
  const p = el('div', 'mv-paper ' + (cls || ''), parent);
  el('div', 'bg', p);
  return p;
}

/** "1 时 20 分" from seconds. */
export function fmtTime(sec) {
  const m = Math.floor((Number(sec) || 0) / 60);
  if (!(m >= 1)) return t('ui.time.zero');
  const h = Math.floor(m / 60);
  return h > 0 ? t('ui.time.hm', { h, m: m % 60 }) : t('ui.time.m', { m });
}

/** Restart a CSS animation class on a node. */
export function replay(node, cls) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }

export const sfx = (name, vol) => { try { G.audio?.sfx?.(name, vol === undefined ? undefined : { vol }); } catch (e) { /* audio is optional */ } };

// ---- keyboard navigation (reads G.input; arrows / WASD repeat while held) ---------------------------
const rep = { u: 0, d: 0, l: 0, r: 0 };
function step(k, action, rdt) {
  const inp = G.input;
  if (inp.pressed(action)) { rep[k] = 0.36; return true; }
  if (inp.held(action)) { rep[k] -= rdt; if (rep[k] <= 0) { rep[k] = 0.085; return true; } }
  return false;
}
export const K = {
  U: false, D: false, L: false, R: false,
  /** call once per frame before any modal reads it */
  tick(rdt) { K.U = step('u', 'uiUp', rdt); K.D = step('d', 'uiDown', rdt); K.L = step('l', 'uiLeft', rdt); K.R = step('r', 'uiRight', rdt); },
  /** Enter / Space / (E). The mouse is deliberately excluded: clicks are handled by the DOM. */
  confirm(allowE = true) {
    const i = G.input;
    return i.codePressed('Enter') || i.codePressed('NumpadEnter') || i.codePressed('Space') || (allowE && i.codePressed('KeyE'));
  },
  confirmHeld() { const i = G.input; return i.codeHeld('Enter') || i.codeHeld('Space') || i.codeHeld('KeyE'); },
  cancel() { return G.input.pressed('cancel'); },
  code(c) { return G.input.codePressed(c); },
  /** forget presses the UI has used so gameplay systems later in the frame do not react to them */
  eat() { const i = G.input; i.consume('confirm'); i.consume('interact'); i.consume('jump'); i.consume('attack'); i.consume('cancel'); i.consume('pause'); },
};

// ---- modal stack: only the top layer receives keyboard input -------------------------------------------
export function pushModal(m) { if (!UI.modals.includes(m)) UI.modals.push(m); }
export function popModal(m) { const i = UI.modals.indexOf(m); if (i >= 0) UI.modals.splice(i, 1); }
export const topModal = () => UI.modals[UI.modals.length - 1] || null;

// ---- pointer lock we gave up ourselves: the 'input:lockLost' that follows must not be read as "the player pressed Esc" ----
let selfUnlockT = -1e9;
export function noteSelfUnlock() { selfUnlockT = performance.now(); }
export const selfUnlocked = () => performance.now() - selfUnlockT < 500;

// ---- menu mode: pause the world + free the pointer while any full-screen layer is open ---------------------
let depth = 0, prevMode = null;
export function enterMenuMode() {
  if (depth++ > 0) return;
  prevMode = G.mode;
  if (G.mode !== 'title' && G.mode !== 'ending' && G.mode !== 'boot') G.setMode('menu');
  noteSelfUnlock();
  G.input?.exitLock();
}
/** `gesture`: true when called from a click / key press, so the pointer may be re-captured. */
export function leaveMenuMode(gesture = true) {
  if (depth === 0 || --depth > 0) return;
  if (G.mode === 'menu') G.setMode(prevMode && prevMode !== 'menu' ? prevMode : 'play');
  if (G.mode === 'play' && gesture) G.input?.requestLock();
}
export const menuDepth = () => depth;

// ---- per-frame DOM writes that skip unchanged values ----------------------------------------------------
export function setText(node, v) { if (node._txt !== v) { node._txt = v; node.textContent = v; } }
export function setOn(node, on) { on = !!on; if (node._on !== on) { node._on = on; node.classList.toggle('on', on); } }

/** Turn `12u` lengths in our style sheets into calc(var(--u) * 12) so the whole UI scales with the window. */
export function compileCss(src) { return src.replace(/(?<![\w#.])(-?\d*\.?\d+)u\b/g, 'calc(var(--u)*$1)'); }
