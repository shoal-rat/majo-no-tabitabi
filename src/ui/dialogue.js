// say(): the dialogue box. Name plate, optional portrait, typewriter text, choices. E / Space / Enter / click advance.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { UI, K, el, clear, paper, setText, layoutFlag, sfx, noteSelfUnlock } from './dom.js';
import { icon, hasIcon } from './icons.js';
import { addCss } from './style.js';

addCss(`
.mv-dlg { opacity: 0; visibility: hidden; transition: opacity .2s, visibility 0s .2s; }
.mv-dlg.on { opacity: 1; visibility: visible; transition: opacity .2s; }
/* a parchment card with the filigree frame (from .mv-paper), a night name plate, an arched cameo for the portrait */
.dlg-box { position: absolute !important; left: 50%; bottom: 38u; width: 820u; margin-left: -410u; min-height: 142u; padding: 34u 52u 28u 52u; pointer-events: auto; cursor: pointer;
  transform: translateY(14u); transition: transform .28s var(--ease); }
.mv-dlg.on .dlg-box { transform: none; }
.dlg-box.has-port { padding-left: 180u; }
.dlg-box.has-port.right { padding-left: 52u; padding-right: 180u; }
.dlg-name { position: absolute !important; left: 44u; top: -16u; height: 32u; padding: 0 22u 0 26u; border-radius: 3u; color: var(--star); white-space: nowrap; z-index: 2;
  background: linear-gradient(180deg, #26355e, #121a31); font: 600 16.5u/32u var(--fd); letter-spacing: .16em;
  box-shadow: inset 0 0 0 1u var(--hair2), inset 0 1u 0 rgba(255,255,255,.1), 0 4u 10u rgba(0,0,0,.3); }
.dlg-name::before { content: ''; position: absolute; left: 8u; top: 50%; width: 10u; height: 10u; margin-top: -5u; background: var(--brass2);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.dlg-name:empty { display: none; }
.dlg-box.right .dlg-name { left: auto; right: 44u; }
.dlg-box.has-port .dlg-name { left: 168u; }
.dlg-box.has-port.right .dlg-name { left: auto; right: 168u; }
.dlg-port { position: absolute !important; left: 32u; bottom: 22u; width: 122u; height: 148u; display: none; align-items: center; justify-content: center; overflow: hidden;
  border-radius: 61u 61u 6u 6u; color: var(--brass2); z-index: 1;
  background: radial-gradient(ellipse 80% 70% at 50% 34%, #3a4f88, #141c37 72%, #0c1224);
  box-shadow: 0 0 0 1.5u var(--brass), 0 0 0 5u #f7f0e2, 0 0 0 6u rgba(122,92,46,.45), 0 6u 14u rgba(0,0,0,.35); }
.dlg-box.right .dlg-port { left: auto; right: 32u; }
.dlg-box.has-port .dlg-port { display: flex; }
.dlg-port::before { content: ''; position: absolute; inset: 0; background-image: var(--tex-stars); background-size: 256u 256u; opacity: .9; }
.dlg-port img, .dlg-port canvas { position: relative; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0; display: block; }
.dlg-port:has(img)::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: radial-gradient(ellipse 90% 60% at 50% 115%, rgba(10,15,32,.55), rgba(10,15,32,0) 70%); box-shadow: inset 0 0 18u rgba(6,10,24,.45); }
.dlg-port .ic { position: relative; font-size: 70u; filter: drop-shadow(0 0 10u rgba(236,217,164,.35)); }
.dlg-port .ic.glyph { font-size: 66u; font-weight: 600; line-height: 1; }
/* a picture that arrived after its line appeared fades in where the speaker's initial stood */
.dlg-port.late img { animation: dlg-port-in .35s ease-out both; }
@keyframes dlg-port-in { from { opacity: 0; } }
.dlg-text { font: 400 20u/1.75 var(--fb); letter-spacing: .04em; color: var(--ink); white-space: pre-wrap; min-height: 70u; }
.dlg-text .rest { opacity: 0; }
/* narration (no speaker, no portrait): a quiet diary line, centred on faint ruled lines under a small flourish */
.dlg-box.narr { padding: 38u 76u 30u; }
.dlg-box.narr::before { content: ''; position: absolute; left: 50%; top: 16u; width: 132u; height: 12u; margin-left: -66u; background: var(--brass3); opacity: .55;
  -webkit-mask: var(--mk-flourish) center / 100% 100% no-repeat; mask: var(--mk-flourish) center / 100% 100% no-repeat; }
.dlg-box.narr .dlg-text { text-align: center; color: var(--ink2); font-size: 19u; line-height: 1.9; letter-spacing: .06em;
  background: repeating-linear-gradient(180deg, transparent 0, transparent calc(1.9em - 1u), rgba(148,113,47,.2) calc(1.9em - 1u), rgba(148,113,47,.2) 1.9em); }
.mv-ui.compact .dlg-box.narr { padding: 32u 48u 22u; }
.dlg-next { position: absolute !important; right: 34u; bottom: 20u; width: 14u; height: 14u; background: var(--brass3); opacity: 0;
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.dlg-box.has-port.right .dlg-next { right: 174u; }
.dlg-box.done .dlg-next { opacity: 1; animation: mv-bob .9s ease-in-out infinite; }
.dlg-box.choosing .dlg-next { opacity: 0; animation: none; }

/* choices: night-glass pills with numbered coins; the chosen one lights its brass rim */
.dlg-choices { position: absolute; right: calc(50% - 410u); bottom: 200u; display: flex; flex-direction: column; align-items: flex-end; gap: 9u; }
.dlg-choices.left { right: auto; left: calc(50% - 410u); align-items: flex-start; }
.dlg-ch { position: relative; display: flex; align-items: center; gap: 12u; min-width: 300u; max-width: 540u; padding: 8u 26u 8u 9u; color: var(--star); font: 400 17u/1.5 var(--fb); letter-spacing: .04em;
  pointer-events: auto; cursor: pointer; border-radius: 22u 6u 6u 22u; background: linear-gradient(90deg, rgba(30,40,74,.95), rgba(14,20,38,.9));
  box-shadow: inset 0 0 0 1u var(--hair), 0 6u 16u rgba(0,0,0,.35); transition: transform .16s var(--ease), box-shadow .16s, background .16s; animation: dlg-ch-in .3s var(--ease) both; }
.dlg-ch > * { position: relative; }
.dlg-ch .n { width: 26u; height: 26u; border-radius: 50%; box-shadow: inset 0 0 0 1u var(--hair2); font: 600 12.5u/26u var(--fd); text-align: center; color: var(--brass2); flex: none; transition: all .16s; }
.dlg-ch.sel { transform: translateX(-10u); background: linear-gradient(90deg, rgba(52,68,114,.97), rgba(22,30,56,.92));
  box-shadow: inset 0 0 0 1.2u var(--brass2), 0 0 18u -4u rgba(236,217,164,.55), 0 6u 16u rgba(0,0,0,.35); }
.dlg-choices.left .dlg-ch.sel { transform: translateX(10u); }
.dlg-ch.sel .n { background: linear-gradient(180deg, #fff2cc, var(--brass)); color: var(--ink); box-shadow: none; }
@keyframes dlg-ch-in { from { opacity: 0; transform: translateX(26u); } }
/* clear of the home bar; on small screens the box fits the width and sits lower, choices are fingertip-sized */
.mv-ui .dlg-box { bottom: calc(38u + env(safe-area-inset-bottom, 0px)); }
.mv-ui.compact .dlg-box { --dw: min(820u, calc(100vw - 28px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  width: var(--dw); margin-left: calc(var(--dw) / -2); bottom: calc(12u + env(safe-area-inset-bottom, 0px)); min-height: 114u; padding: 28u 40u 20u; }
.mv-ui.compact .dlg-box.has-port { padding-left: 138u; }
.mv-ui.compact .dlg-box.has-port.right { padding-left: 40u; padding-right: 138u; }
.mv-ui.compact .dlg-port { left: 24u; bottom: 16u; width: 94u; height: 112u; border-radius: 47u 47u 5u 5u; }
.mv-ui.compact .dlg-port .ic.glyph { font-size: 52u; }
.mv-ui.compact .dlg-box.right .dlg-port { left: auto; right: 24u; }
.mv-ui.compact .dlg-box.has-port .dlg-name { left: 126u; }
.mv-ui.compact .dlg-box.has-port.right .dlg-name { left: auto; right: 126u; }
.mv-ui.compact .dlg-text { min-height: 56u; }
.mv-ui.compact .dlg-choices { right: calc(50% - var(--dw2, 410u)); bottom: calc(150u + env(safe-area-inset-bottom, 0px));
  --dw2: min(410u, calc(50vw - 14px - env(safe-area-inset-right, 0px))); }
.mv-ui.compact .dlg-choices.left { right: auto; left: calc(50% - var(--dw2, 410u)); }
.mv-ui.touch .dlg-ch { min-height: 44px; padding: 10u 26u 10u 10u; }
.mv-ui.touch .dlg-ch .n { width: 28u; height: 28u; line-height: 28u; }
`);

/** The in-game portrait of a story speaker (tools/costume/portraits.mjs: manifest ui_portrait_<id>), or null.
 *  Elaina's follows the outfit she wears (the witch's robe when there is no picture for it). */
export function portraitOf(who) {
  if (!who || typeof who !== 'string') return null;
  const ids = who === 'elaina' ? ['elaina_' + (G.player?.outfit || ''), 'elaina_elaina'] : [who];
  for (const id of ids) { const f = G.assets?.info?.('ui_portrait_' + id)?.file; if (f) return 'assets/' + f; }
  return null;
}

// ---- portrait pictures ----------------------------------------------------------------------------------------------
// Players on slow links saw an empty cameo all story long: the picture was asked for only when its line appeared, a
// request that stalled was never asked again, and the arch showed nothing while it waited. Now each file is one kept
// <img>, fetched ahead (the speakers of a script when it starts, every portrait one at a time once play begins); a failed
// request is tried again after PIC_RETRY ms, and a second one goes out beside a request that has given nothing for
// PIC_STALL ms. Until the picture is there the cameo shows the speaker's initial; the picture fades in in its place.
const PICS = new Map();   // url -> { url, img, tries, at, pend: Set<img> }
const PIC_RETRY = 2500, PIC_STALL = 12000, PIC_TRIES = 8;
const isPicUrl = (p) => /^(data:|blob:|https?:|\.{0,2}\/|assets\/)/.test(p) || /\.(png|jpe?g|webp|svg)$/i.test(p);

/** The picture record of a url; asks the network when there is nothing usable in flight (cheap: call it every frame). */
function pic(url) {
  let p = PICS.get(url);
  if (!p) PICS.set(url, (p = { url, img: null, tries: 0, at: -1e9, pend: new Set() }));
  if (p.img || p.tries >= PIC_TRIES || (p.tries && /^(data:|blob:)/.test(url))) return p;
  const age = performance.now() - p.at;
  if (p.pend.size ? p.pend.size < 2 && age >= PIC_STALL : age >= (p.tries ? PIC_RETRY : 0)) askPic(p);
  return p;
}
function askPic(p) {
  const im = new Image();
  im.decoding = 'async';
  im.alt = '';
  p.pend.add(im); p.tries++; p.at = performance.now();
  im.onload = () => {
    if (p.img) return;
    p.img = im;
    for (const o of p.pend) o.onload = o.onerror = null;
    p.pend.clear();
  };
  im.onerror = () => { p.pend.delete(im); p.at = performance.now(); };
  // a retry asks under another query so no cache or half-dead connection hands back the failed answer
  im.src = p.tries > 1 && !/^(data:|blob:)/.test(p.url) ? p.url + (p.url.includes('?') ? '&' : '?') + 'try=' + p.tries : p.url;
}
/** Fetch the portraits of these speakers ahead of their lines (ids as in a script's `who`). */
export function preloadPortraits(whos) {
  for (const w of whos || []) { const u = portraitOf(w); if (u && isPicUrl(u)) pic(u); }
}

export function createDialogue(root) {
  const R = el('div', 'layer mv-dlg', root);
  const choicesEl = el('div', 'dlg-choices', R);
  const box = paper('dlg-box', R);
  const port = el('div', 'dlg-port', box);
  const plate = el('div', 'dlg-name', box);
  const text = el('div', 'dlg-text', box);
  const shown = el('span', '', text), rest = el('span', 'rest', text);
  el('i', 'dlg-next', box);

  let cur = null;           // { chars, n, acc, done, choices, sel, resolve, t }
  let ownMode = false, releaseAt = -1, hideAt = -1;
  let visible = false;

  let waitPic = null;       // the picture record the line on screen still waits for (its initial stands in meanwhile)
  let warm = null, warmAt = 0;   // every portrait, fetched one at a time once play begins

  function setPortrait(p, name) {
    clear(port);
    port.classList.remove('late');
    waitPic = null;
    let on = false;
    const initial = () => { if (name) icon(Array.from(String(name))[0], '', port); };
    if (p && typeof p === 'object' && p.nodeType === 1) { port.appendChild(p); on = true; }
    else if (typeof p === 'string' && p) {
      if (isPicUrl(p)) { const P = pic(p); if (P.img) port.appendChild(P.img); else { waitPic = P; initial(); } on = true; }
      else if (hasIcon(p) || Array.from(p).length <= 2) { icon(p, '', port); on = true; }
    } else if (p === true && name) { initial(); on = true; }
    box.classList.toggle('has-port', on);
  }
  /** per frame: the waiting picture takes the initial's place the moment it arrives (and is asked for again if lost) */
  function pollPic() {
    if (waitPic) {
      if (waitPic.img) { clear(port); port.appendChild(waitPic.img); port.classList.add('late'); waitPic = null; }
      else pic(waitPic.url);
    }
    if (warm === null && G.mode === 'play' && G.assets?.ids) {
      warm = G.assets.ids('ui_portrait_').map((id) => G.assets.info(id)?.file).filter(Boolean).map((f) => 'assets/' + f);
      warmAt = G.time.real + 4;   // the people and places near her ask first
    }
    if (warm && warm.length && G.time.real >= warmAt) {
      const P = pic(warm[0]);
      if (P.img || !P.pend.size) warm.shift();   // arrived, or failed for now (asked again when a line needs it)
    }
  }

  function finish(result) {
    if (!cur) return;
    const c = cur;
    cur = null;
    clear(choicesEl);
    box.classList.remove('choosing');
    hideAt = G.time.frame + 2;        // a chained say() in the same breath keeps the box up
    releaseAt = G.time.frame + 2;
    K.eat();
    c.resolve(result);
  }

  function complete() {
    if (!cur || cur.done) return;
    cur.n = cur.chars.length; cur.done = true;
    setText(shown, cur.text); setText(rest, '');
    box.classList.add('done');
    if (cur.choices) showChoices();
  }

  function showChoices() {
    const c = cur;
    clear(choicesEl);
    box.classList.add('choosing');
    c.nodes = c.choices.map((label, i) => {
      const n = el('div', 'dlg-ch', choicesEl);
      n.style.animationDelay = (i * 0.06).toFixed(2) + 's';
      el('span', 'n', n, String(i + 1));
      el('span', '', n, String(label));
      n.addEventListener('mouseenter', () => { if (cur === c && c.sel !== i) { c.sel = i; markSel(); sfx('ui_move', 0.5); } });
      n.addEventListener('click', (e) => { e.stopPropagation(); if (cur === c) { sfx('ui_select'); finish(i); } });
      return n;
    });
    c.sel = 0;
    markSel();
    // the pointer is needed to click a choice
    if (G.input.locked) { noteSelfUnlock(); G.input.exitLock(); }
  }
  function markSel() { const c = cur; if (c && c.nodes) c.nodes.forEach((n, i) => n.classList.toggle('sel', i === c.sel)); }

  function advance() {
    if (!cur) return;
    if (!cur.done) { complete(); return; }
    if (cur.choices) { sfx('ui_select'); finish(cur.sel); return; }
    sfx('ui_page', 0.6);
    finish(undefined);
  }
  box.addEventListener('click', () => { if (cur && G.time.real - cur.t > 0.12) advance(); });

  const api = {
    root: R,
    get active() { return !!cur; },
    /** choices are up (a tap elsewhere must not pick one) */
    get choosing() { return !!(cur && cur.done && cur.choices); },
    /** Show one line. Resolves with the index of the chosen choice, or undefined for a plain line. */
    say(o) {
      if (typeof o === 'string') o = { text: o };
      o = o || {};
      if (cur) { const c = cur; cur = null; clear(choicesEl); c.resolve(undefined); }
      const str = String(o.text ?? '');
      const right = o.side === 'right';
      box.classList.toggle('right', right);
      choicesEl.classList.toggle('left', right);
      box.classList.remove('done', 'choosing');
      plate.style.display = o.name ? '' : 'none';
      box.classList.toggle('narr', !o.name && !o.portrait);
      setText(plate, o.name ? String(o.name) : '');
      setPortrait(o.portrait, o.name);
      setText(shown, ''); setText(rest, str);
      hideAt = -1; releaseAt = -1;
      if (!visible) { visible = true; R.classList.add('on'); sfx('ui_open', 0.5); }
      if (G.mode === 'play') { ownMode = true; G.setMode('talk'); }
      return new Promise((resolve) => {
        cur = { text: str, chars: Array.from(str), n: 0, acc: 0, wait: 0, done: false, resolve, t: G.time.real, sel: 0, nodes: null,
          choices: Array.isArray(o.choices) && o.choices.length ? o.choices : null };
        if (!cur.chars.length) complete();
      });
    },
    /** Drop the box at once (scene change, game over). Pending promises resolve with undefined. */
    cancel() { if (cur) finish(undefined); hideAt = 0; },

    update(rdt) {
      const frame = G.time.frame;
      pollPic();
      if (!cur) {
        if (visible && hideAt >= 0 && frame >= hideAt) { visible = false; hideAt = -1; R.classList.remove('on'); }
        if (ownMode && releaseAt >= 0 && frame >= releaseAt) {
          ownMode = false; releaseAt = -1;
          if (G.mode === 'talk') { G.setMode('play'); if (!G.input.locked) G.input.requestLock(); }
        }
        return;
      }
      const c = cur;
      // typewriter
      if (!c.done) {
        if (c.wait > 0) c.wait -= rdt;
        else {
          c.acc += rdt * (layoutFlag('typeSpeed', 34) || 34);
          let moved = false;
          const pauses = layoutFlag('pauseChars', '');
          while (c.acc >= 1 && c.n < c.chars.length) {
            c.acc -= 1; c.n++; moved = true;
            if (pauses.includes(c.chars[c.n - 1]) && c.n < c.chars.length) { c.wait = 0.13; c.acc = 0; break; }
          }
          if (moved) {
            if (c.n >= c.chars.length) complete();
            else {
              setText(shown, c.chars.slice(0, c.n).join(''));
              setText(rest, c.chars.slice(c.n).join(''));
              if ((c.n & 3) === 1) sfx('ui_text', 0.35);
            }
          }
        }
      }
      // input (ignored for a blink after the line appears, so the key that opened it does not skip it)
      if (G.time.real - c.t < 0.12 || UI.modals.length) return;
      if (c.done && c.choices && c.nodes) {
        const n = c.choices.length;
        if (K.U) { c.sel = (c.sel + n - 1) % n; markSel(); sfx('ui_move', 0.5); }
        if (K.D) { c.sel = (c.sel + 1) % n; markSel(); sfx('ui_move', 0.5); }
        for (let i = 0; i < Math.min(n, 9); i++) if (K.code('Digit' + (i + 1)) || K.code('Numpad' + (i + 1))) { c.sel = i; markSel(); sfx('ui_select'); finish(i); return; }
        if (K.confirm()) { advance(); return; }
        K.eat();
        return;
      }
      if (G.input.pressed('confirm')) advance();
      K.eat();
    },
  };
  return api;
}
