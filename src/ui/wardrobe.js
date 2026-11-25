// 衣装 — the wardrobe page of the pause grimoire (src/ui/menu.js). Elaina's four outfits (src/data/outfits.js) as cards: a
// painted picture of her in the outfit (rendered once from the game, cut out: tools/costume/wardrobe-pics.mjs, manifest ids
// ui_outfit_<id>) on a softly lit plate in an arched brass frame (wine for the worn one), the name, a line or two of
// description, the worn one sealed. Without its picture a card shows the outfit's pictogram instead.
// An outfit the player may not pick yet (outfits.js `unlock`: her everyday and witch clothes from her naming, the two
// swimsuits after both episodes) shows no picture: a folded-away card with its name and when it opens. While episode two is
// running a note says the story dresses her for its own scenes (story.js syncOutfit).
// Choosing one changes her at once behind the scroll (G.player.setOutfit; the world is paused, so the change is already
// done when the scroll closes). Input like the other pages: ← → (stick / d-pad) move, confirm wears, the mouse hovers and
// clicks, a finger taps a card to wear it.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { K, el, tel, clear, sfx, hintLine, codeLabel } from './dom.js';
import { icon } from './icons.js';
import { addCss } from './style.js';
import { OUTFITS, outfitUnlocked, storyOutfit } from '../data/outfits.js';

addCss(`
.wd-wrap { position: absolute; inset: 0; }
.wd-grid { position: absolute; inset: 0 0 6u; display: grid; grid-template-columns: repeat(4, 1fr); gap: 18u; padding: 6u 10u 0; }
.wd-wrap.note .wd-grid { bottom: 34u; }
.wd-card { position: relative; display: flex; flex-direction: column; align-items: center; min-height: 0; min-width: 0; padding: 12u 12u 10u; cursor: pointer; pointer-events: auto; border-radius: 8u;
  background: radial-gradient(ellipse at 50% 30%, rgba(255,253,246,.7), rgba(148,113,47,.06)); box-shadow: inset 0 0 0 1u rgba(148,113,47,.28);
  transition: background .15s, box-shadow .15s, transform .22s var(--ease); touch-action: manipulation; }
.wd-card:hover { background-color: rgba(148,113,47,.05); }
.wd-card.sel { box-shadow: inset 0 0 0 1.5u var(--brass3), 0 6u 18u rgba(80,60,30,.18); transform: translateY(-3u); }
/* the picture: an arched brass frame round a softly lit plate in the outfit's own colour wash */
.wd-pic { position: relative; align-self: stretch; flex: 1 1 auto; min-height: 110u; filter: drop-shadow(0 3u 6u rgba(60,40,20,.2)); transition: filter .2s, transform .25s var(--ease); }
.wd-pic .fr { position: absolute; inset: 0; border-radius: 50% 50% 6u 6u / 16% 16% 6u 6u; background: linear-gradient(180deg, #f3e2b4, var(--brass) 45%, var(--brass3));
  box-shadow: inset 0 0 0 1u rgba(255,248,226,.6); }
.wd-pic .wash { position: absolute; inset: 5u; border-radius: 50% 50% 4u 4u / 15% 15% 4u 4u; overflow: hidden;
  background-color: var(--parch); background-image: radial-gradient(ellipse 70% 60% at 50% 40%, rgba(255,252,242,.95), var(--wd-tint) 78%, var(--wd-tint2)), var(--tex-parch);
  background-size: 100% 100%, 256u 256u; background-blend-mode: normal, multiply; box-shadow: inset 0 0 0 1u rgba(122,92,46,.35), inset 0 0 22u rgba(122,92,46,.18); }
.wd-pic .wash::after { content: ''; position: absolute; left: 22%; right: 22%; bottom: 5%; height: 7%; border-radius: 50%; background: radial-gradient(closest-side, rgba(42,36,30,.3), transparent); }
.wd-pic img { position: absolute; left: 0; right: 0; top: 5%; bottom: 3.5%; width: 100%; height: 91.5%; object-fit: contain; z-index: 1; pointer-events: none; user-select: none; }
.wd-pic .ic { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); font-size: 116u; color: var(--ink); z-index: 1; }
.wd-card.sel .wd-pic { filter: drop-shadow(0 6u 12u rgba(60,40,20,.28)); }
.wd-card.worn .wd-pic .fr { background: linear-gradient(180deg, #f0cbd0, var(--wine2) 45%, var(--wine)); }
/* not yet: a pale frame, the robe-stand pictogram faint, a small lock */
.wd-card.lock { cursor: default; }
.wd-card.lock .wd-pic .fr { background: linear-gradient(180deg, #e2d8c4, #b9ab92); opacity: .7; }
.wd-card.lock .wd-pic .wash { background-image: radial-gradient(ellipse 70% 60% at 50% 42%, rgba(246,240,228,.9), rgba(200,194,184,.5) 78%, rgba(160,154,146,.55)), var(--tex-parch); }
.wd-card.lock .wd-pic .wash::after { display: none; }
.wd-card.lock .wd-pic .ic { color: var(--ink3); opacity: .4; font-size: 92u; }
.wd-card.lock .wd-pic .ic.lk { top: auto; bottom: 12%; transform: translateX(-50%); z-index: 2; font-size: 24u; color: var(--ink2); opacity: .7; }
.wd-card.lock .wd-nm { color: var(--ink3); }
.wd-card.lock .wd-desc { color: var(--ink3); }
.wd-card.no { animation: wd-no .32s; }
@keyframes wd-no { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4u); } 60% { transform: translateX(3u); } }
.wd-nm { margin-top: 12u; font: 600 21u/1.3 var(--fd); color: var(--ink); letter-spacing: .16em; margin-right: -.16em; white-space: nowrap; }
.wd-rule { width: 70%; height: 1u; margin: 7u 0; background: linear-gradient(90deg, transparent, rgba(148,113,47,.6), transparent); flex: none; }
.wd-desc { font: 400 13.5u/1.6 var(--fb); color: var(--ink2); letter-spacing: .03em; text-align: center; min-height: 3.2em; max-width: 100%;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.wd-worn { position: absolute; top: 20u; right: 20u; z-index: 2; display: flex; align-items: center; gap: 6u; font: 600 12u/1 var(--fd); color: var(--brass2); letter-spacing: .16em;
  padding: 4u 10u 4u 4u; background: rgba(18,26,47,.9); border-radius: 14u; box-shadow: inset 0 0 0 1u var(--hair), 0 2u 6u rgba(0,0,0,.25); }
.wd-worn .seal { width: 22u; height: 22u; font-size: 11u; }
.wd-worn .seal::before { inset: 2u; }
.wd-go { padding-top: 6u; min-height: 21u; font: 600 12.5u/1 var(--fd); color: var(--brass3); letter-spacing: .14em; opacity: 0; transition: opacity .15s; white-space: nowrap; }
.wd-card.sel .wd-go { opacity: 1; }
.wd-card.worn .wd-go { opacity: 0; }
.wd-card.busy .wd-go { opacity: 1; color: var(--wine); }
.wd-note { position: absolute; left: 0; right: 0; bottom: 4u; text-align: center; font: 400 13u/1.4 var(--fb); color: var(--ink3); letter-spacing: .08em; }
/* more than four outfits: the same tall cards at a fixed width in one row that scrolls sideways (wheel, keys, a finger);
   the fifth card peeks in at the edge so the row reads as one that goes on */
.wd-wrap.many .wd-grid { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: calc((100% - 20u - 54u) / 4.35); overflow-x: auto; overflow-y: hidden;
  padding-bottom: 10u; pointer-events: auto; touch-action: pan-x; overscroll-behavior: contain; scroll-snap-type: x proximity; scroll-padding: 0 10u;
  scrollbar-width: thin; scrollbar-color: rgba(122,92,46,.4) transparent; }
.wd-wrap.many .wd-grid::-webkit-scrollbar { height: 5u; }
.wd-wrap.many .wd-grid::-webkit-scrollbar-thumb { background: rgba(122,92,46,.38); border-radius: 3u; }
.wd-wrap.many .wd-card { scroll-snap-align: start; }
.mv-ui.compact .wd-wrap.many .wd-grid { grid-auto-columns: calc((100% - 8u - 30u) / 3.4); }
.mv-ui.compact .wd-grid { gap: 10u; padding: 2u 4u 0; }
.mv-ui.compact .wd-pic { min-height: 80u; }
.mv-ui.compact .wd-nm { font-size: 18u; margin-top: 8u; }
.mv-ui.compact .wd-desc { -webkit-line-clamp: 2; }
`);
// the colour wash behind each picture (a hint of the outfit's own colours)
const WASH = {
  apprentice: ['rgba(236,224,196,.55)', 'rgba(184,166,140,.6)'],
  elaina: ['rgba(208,192,224,.55)', 'rgba(140,120,168,.6)'],
  swim_a: ['rgba(182,214,228,.55)', 'rgba(128,176,204,.6)'],
  swim_b: ['rgba(190,176,222,.55)', 'rgba(108,94,158,.6)'],
};
const picUrl = (o) => { const f = o.pic && G.assets?.info?.(o.pic)?.file; return f ? 'assets/' + f : null; };

export function createWardrobe(parent) {
  const R = el('div', 'wd-wrap', parent);
  const grid = el('div', 'wd-grid', R);
  const note = el('div', 'wd-note', R);
  let cards = [], sel = 0;
  // a long row (.many): the mouse wheel scrolls it sideways
  grid.addEventListener('wheel', (e) => {
    if (!R.classList.contains('many') || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault(); grid.scrollLeft += e.deltaY;
  }, { passive: false });

  const worn = () => G.player?.outfit || OUTFITS[0].id;
  const pending = () => G.player?._S?.wardrobe?.pending || null;
  // an outfit whose model could not be had (a bad connection): its card says so; choosing it again tries again
  const failed = () => G.player?._S?.wardrobe?.failed || null;
  const open = (o) => outfitUnlocked(o, G.state);
  const touch = () => !!G.input?.touch;

  function paint() {
    const w = worn(), p = pending();
    cards.forEach((c, i) => {
      const o = OUTFITS[i];
      c.classList.toggle('sel', i === sel);
      c.classList.toggle('worn', o.id === w && !p);
      c.classList.toggle('busy', o.id === p);
      c._worn.style.display = o.id === w && !p ? '' : 'none';
      clear(c._go);
      if (o.id === p) tel('span', '', c._go, 'ui.wardrobe.changing');
      else if (o.id === failed()) tel('span', '', c._go, 'ui.wardrobe.unavailable');
      else if (c._lock) tel('span', '', c._go, 'ui.wardrobe.locked');
      else if (touch()) tel('span', '', c._go, 'ui.wardrobe.tapWear');
      else hintLine(c._go, 'ui.wardrobe.wear', { key: codeLabel('Enter') });
    });
  }

  function render() {
    clear(grid);
    const w = worn();
    cards = OUTFITS.map((o, i) => {
      // folded away: not pickable yet and not what she wears now (in episode one she wears her everyday clothes, unpicked)
      const lock = !open(o) && o.id !== w;
      const c = el('div', 'wd-card' + (lock ? ' lock' : ''), grid);
      c._lock = lock;
      const pic = el('div', 'wd-pic', c);
      const [w1, w2] = WASH[o.id] || WASH.elaina; pic.style.setProperty('--wd-tint', w1); pic.style.setProperty('--wd-tint2', w2);
      el('div', 'fr', pic); el('div', 'wash', pic);
      const url = !lock && picUrl(o);
      if (lock) { icon('wardrobe', '', pic); icon('lock', 'lk', pic); }
      else if (url) { const im = el('img', '', pic); im.alt = ''; im.draggable = false; im.decoding = 'async'; im.src = url; im.onerror = () => { im.remove(); icon(o.icon, '', pic); }; }
      else icon(o.icon, '', pic);
      el('div', 'wd-nm', c, t(o.name));
      el('div', 'wd-rule', c);
      el('div', 'wd-desc', c, lock ? t('ui.wardrobe.lock.' + o.unlock) : t(o.desc));
      const wb = el('div', 'wd-worn', c); tel('span', 'seal', wb, 'ui.seal.worn'); tel('span', '', wb, 'ui.wardrobe.worn');
      c._worn = wb;
      c._go = el('div', 'wd-go', c);
      c.addEventListener('mouseenter', () => { if (!touch()) setSel(i, true); });
      c.addEventListener('click', () => { setSel(i, true); wear(i); });
      return c;
    });
    R.classList.toggle('many', cards.length > 4);   // up to four: four tall cards across the page, as always
    // episode two: she may change, but the story dresses her for its own scenes
    const story = storyOutfit(G.state), free = OUTFITS.some((o) => open(o));
    note.textContent = story && free ? t('ui.wardrobe.storyNote') : '';
    R.classList.toggle('note', !!note.textContent);
    const at = OUTFITS.findIndex((o) => o.id === w);
    setSel(at >= 0 ? at : 0, false, true);
  }

  function setSel(i, mouse, quiet) {
    i = Math.max(0, Math.min(cards.length - 1, i));
    if (i !== sel && !quiet) sfx('ui_move', 0.45);
    sel = i;
    paint();
    if (!mouse && R.classList.contains('many')) cards[i]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  function refuse(c) {
    sfx('ui_error', 0.45);
    c.classList.remove('no'); void c.offsetWidth; c.classList.add('no');
  }

  function wear(i) {
    const o = OUTFITS[i], c = cards[i];
    if (!o || !G.player?.setOutfit) return;
    if (o.id === worn() && !pending()) { sfx('ui_cancel_soft', 0.4); return; }
    if (!open(o)) { refuse(c); return; }
    sfx('ui_select', 0.6);
    const p = G.player.setOutfit(o.id);
    paint();
    Promise.resolve(p).then((ok) => {
      if (!ok) sfx('ui_error', 0.5);
      if (R.isConnected) paint();
      else if (!ok && failed() === o.id) G.ui?.toast?.(t('ui.wardrobe.unavailable'));   // the scroll was closed meanwhile
    });
  }

  return {
    el: R, render, show: render,
    keys() {
      if (K.L) setSel(sel - 1);
      if (K.R) setSel(sel + 1);
      if (K.confirm(false)) wear(sel);
    },
    hints: (h) => { const s = el('span', '', h); hintLine(s, 'ui.menu.hintMove', { up: '←', down: '→' }); const s2 = el('span', '', h); hintLine(s2, 'ui.wardrobe.hintWear', { key: codeLabel('Enter') }); },
  };
}
