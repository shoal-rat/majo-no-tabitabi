// The pause grimoire: tabs (map, journal, spells, items, wardrobe, settings) on a night-blue cover around a parchment page,
// plus "back to the journey" and "save & quit".
// Opening it pauses the world (G.setMode('menu')) and frees the pointer; closing gives both back.
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { UI, K, el, tel, clear, fmtTime, hintLine, keycap, pushModal, popModal, enterMenuMode, leaveMenuMode, sfx, codeLabel, key } from './dom.js';
import { icon, EL_COLOR, ELEMENTS } from './icons.js';
import { addCss } from './style.js';
import { navList, createSettings, confirmBox } from './panels.js';
import { createMapTab } from './map.js';
import { spellSlots, selectedId } from './model.js';
import { createWardrobe } from './wardrobe.js';   // wardrobe: 衣装 page
import { notesEntries, notesCount, noteRow, noteDetail } from './reactions.js';   // 元素笔记: the third journal page
import { wildsEntries, wildsCount, wildsRow, wildsDetail } from './wilds-page.js';   // 旅途见闻: the fourth journal page
import { episodes, episodeOfQuest } from '../data/episodes.js';   // journal chapters: one per episode of the registry

addCss(`
/* the grimoire: a night-blue cover (tabs + footer) holding a parchment page (.mn-body) */
.mv-menu > .mv-paper { width: 1180u; height: 660u; padding: 22u 34u 20u; display: flex; flex-direction: column; }
.mv-menu > .mv-paper > .bg::after { inset: 4u; border-width: 16u; border-image-width: 16u; }
.mn-top { display: flex; align-items: center; gap: 8u; padding: 4u 6u 0; }
.mn-side { width: 210u; flex: none; display: flex; align-items: center; gap: 12u; }
.mn-side .seal { width: 32u; height: 32u; font-size: 14.5u; }
.mn-tabs { display: flex; gap: 2u; flex: 1; justify-content: center; align-items: center; }
.mn-tabs > .keycap { margin: 0 8u; }
.mn-tab { position: relative; display: flex; align-items: center; gap: 8u; padding: 10u 15u 13u; white-space: nowrap; flex: none; font: 600 16u/1 var(--fd); letter-spacing: .14em;
  color: rgba(255,247,232,.55); cursor: pointer; pointer-events: auto; transition: color .15s; }
.mn-tab .ic { font-size: 16u; opacity: .85; }
.mn-tab:hover { color: rgba(255,247,232,.85); }
.mn-tab.on { color: var(--brass2); }
.mn-tab::after { content: ''; position: absolute; left: 12u; right: 12u; bottom: 2u; height: 1.5u; opacity: 0; transform: scaleX(.2); transition: opacity .18s, transform .26s var(--ease);
  background: linear-gradient(90deg, transparent, var(--brass2) 25%, var(--brass2) 75%, transparent); box-shadow: 0 0 8u rgba(236,217,164,.5); }
.mn-tab::before { content: ''; position: absolute; left: 50%; bottom: -3u; width: 10u; height: 10u; margin-left: -5u; background: var(--brass2); opacity: 0; transform: scale(.4); transition: opacity .18s, transform .26s var(--ease);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.mn-tab.on::after { opacity: 1; transform: none; }
.mn-tab.on::before { opacity: 1; transform: none; }
.mn-info { font: 400 12u/1.5 var(--fb); color: rgba(255,247,232,.6); letter-spacing: .06em; white-space: nowrap; }
.mn-info b { display: block; font: 600 15u/1.4 var(--fd); color: var(--star); letter-spacing: .1em; }
.mn-sub { margin: 8u 0 10u; text-align: center; font: 600 12u/1 var(--fd); color: var(--brass2); opacity: .8; letter-spacing: .36em; }
.mn-body { position: relative; flex: 1; min-height: 0; border-radius: 6u; background-color: var(--parch); color: var(--ink);
  background-image: radial-gradient(ellipse 85% 75% at 50% 42%, rgba(255,253,246,.75), rgba(255,253,246,0) 70%), var(--tex-parch), linear-gradient(180deg, #f8f2e4, #ecdfc5);
  background-size: 100% 100%, 256u 256u, 100% 100%; background-blend-mode: normal, multiply, normal;
  box-shadow: inset 0 0 0 1u rgba(122,92,46,.45), inset 0 0 34u rgba(160,118,62,.22), 0 0 0 1u rgba(236,217,164,.3), 0 6u 18u rgba(0,0,0,.35); }
.mn-body::before { content: ''; position: absolute; inset: 5u; border: 22u solid transparent; pointer-events: none; border-image: var(--fr-paper) 36 / 22u stretch; }
/* a wine ribbon bookmark hanging over the page's top edge */
.mn-body::after { content: ''; position: absolute; right: 64u; top: -14u; width: 18u; height: 36u; pointer-events: none; z-index: 2;
  background: linear-gradient(90deg, #6a2231, var(--wine2) 48%, #74283a); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%); }
.mn-pane { position: absolute; inset: 22u 28u 16u; display: none; }
.mn-pane.on { display: block; animation: mn-in .25s ease-out; }
@keyframes mn-in { from { opacity: 0; transform: translateY(6u); } to { opacity: 1; transform: none; } }
.mn-foot { display: flex; align-items: center; gap: 10u; margin-top: 12u; padding: 0 4u; }
.mn-hint { flex: 1; font: 400 12.5u/1.5 var(--fb); color: rgba(255,247,232,.62); letter-spacing: .06em; display: flex; flex-wrap: wrap; gap: 4u 16u; align-items: center; }
.mn-hint .keycap { margin: 0 3u; }
.mn-foot .btn { font-size: 14.5u; }
.mn-foot .btn .ic { color: var(--brass2); }
.mn-foot .btn.red .ic { color: #e9a0a8; }
.mv-night .mv-x::before, .mv-night .mv-x::after { background: var(--brass2); }
.mv-night .mv-x:hover { background: rgba(236,217,164,.12); }

/* two-column list + detail layout shared by journal / spells / items */
.mn-split { position: absolute; inset: 0; display: flex; gap: 28u; }
.mn-list { width: 400u; flex: none; display: flex; flex-direction: column; min-height: 0; }
.mn-list .scroll { flex: 1; min-height: 0; padding-right: 6u; }
.mn-det { flex: 1; min-width: 0; position: relative; padding: 6u 10u 0 30u; overflow: hidden;
  background: linear-gradient(180deg, transparent, rgba(148,113,47,.35) 12%, rgba(148,113,47,.35) 88%, transparent) left / 1u 100% no-repeat; }
.mn-subtabs { display: flex; flex-wrap: nowrap; gap: 2u; margin-bottom: 10u; padding-bottom: 6u; border-bottom: 1u solid rgba(148,113,47,.25); } /* four journal pages share one row */
.mn-subtabs .st { position: relative; padding: 5u 9u; white-space: nowrap; font: 600 14u/1.4 var(--fd); letter-spacing: .06em; color: var(--ink3); cursor: pointer; pointer-events: auto; border-radius: 4u; transition: color .15s, background-color .15s; }
.mn-subtabs .st:hover { color: var(--ink2); }
.mn-subtabs .st.on { color: var(--ink); background: rgba(148,113,47,.12); box-shadow: inset 0 -1.5u 0 var(--brass3); }
.mn-subtabs .st .n { font: 500 11u/1 var(--fd); color: var(--ink3); margin-left: 4u; letter-spacing: 0; }
.mn-row { position: relative; display: flex; align-items: center; gap: 10u; padding: 9u 12u 9u 16u; cursor: pointer; pointer-events: auto; border-radius: 4u;
  background: linear-gradient(90deg, rgba(148,113,47,.18), rgba(148,113,47,.18)) 14u 100% / calc(100% - 28u) 1u no-repeat; transition: background-color .15s; }
.mn-row:hover { background-color: rgba(148,113,47,.06); }
.mn-row.sel { background-color: rgba(148,113,47,.13); box-shadow: inset 0 0 0 1u rgba(148,113,47,.35); }
.mn-row.sel::before { content: ''; position: absolute; left: 3u; top: 50%; width: 9u; height: 9u; margin-top: -4.5u; background: var(--brass3);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.mn-row .seal { width: 24u; height: 24u; font-size: 12u; }
.mn-row .seal::before { inset: 2.5u; }
.mn-row .seal.side { background: radial-gradient(circle at 36% 30%, #7c8fb6 0%, #3d4f78 52%, #1f2a48 100%); }
.mn-row .tt { flex: 1; font: 600 15u/1.35 var(--fd); color: var(--ink); letter-spacing: .04em; }
.mn-row.done .tt { color: var(--ink3); text-decoration: line-through; text-decoration-color: rgba(139,51,67,.5); }
.mn-row .chip { font: 400 12u/1 var(--fb); color: var(--ink3); letter-spacing: .06em; white-space: nowrap; }
.mn-row .chip.act { color: var(--wine); }
.mn-list.wide { width: 440u; }
/* journal quests: filter chips over the list, a chapter line per episode (not a row: the keys and the hooks skip it) */
.mn-filt { display: flex; gap: 6u; margin: -2u 0 6u; }
.mn-filt .fc { padding: 4u 12u; border-radius: 12u; font: 600 12.5u/1.3 var(--fd); letter-spacing: .08em; color: var(--ink3); cursor: pointer; pointer-events: auto;
  box-shadow: inset 0 0 0 1u rgba(148,113,47,.3); transition: color .15s, background-color .15s, box-shadow .15s; display: flex; align-items: center; gap: 5u; }
.mn-filt .fc:hover { color: var(--ink2); }
.mn-filt .fc.on { color: var(--ink); background: rgba(148,113,47,.13); box-shadow: inset 0 0 0 1u var(--brass3); }
.mn-filt .fc .n { font: 500 11u/1 var(--fd); color: var(--ink3); letter-spacing: 0; }
.mn-ch { display: flex; align-items: center; gap: 8u; margin: 12u 4u 3u 6u; font: 600 12.5u/1.4 var(--fd); color: var(--brass3); letter-spacing: .1em; white-space: nowrap; }
.mn-ch:first-child { margin-top: 2u; }
.mn-ch::before { content: ''; width: 9u; height: 9u; flex: none; background: var(--brass3); -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.mn-ch .tt { overflow: hidden; text-overflow: ellipsis; }
.mn-ch::after { content: ''; flex: 1; min-width: 12u; height: 1u; background: linear-gradient(90deg, rgba(148,113,47,.45), transparent); order: 2; }
.mn-ch .n { order: 3; font: 500 11u/1 var(--fd); color: var(--ink3); letter-spacing: .04em; }
.mn-ch.done .tt { color: var(--ink3); }
.mn-det .kick .seal { width: 24u; height: 24u; font-size: 12u; }
.mn-det .kick .seal::before { inset: 2.5u; }
.kick.gap { margin-top: 14u; }
.mn-det .big { font: 700 28u/1.3 var(--fd); color: var(--ink); letter-spacing: .06em; margin: 8u 0 4u; }
.mn-det .kick { display: flex; align-items: center; gap: 10u; font: 600 12u/1.4 var(--fd); color: var(--brass3); letter-spacing: .24em; }
.mn-det .txt { margin-top: 14u; font: 400 15.5u/1.9 var(--fb); color: var(--ink2); letter-spacing: .04em; white-space: pre-wrap; max-width: 620u; }
.mn-det .rule { margin: 16u 0 12u; max-width: 560u; }
.mn-det .obh { font: 600 13u/1 var(--fd); color: var(--brass3); letter-spacing: .24em; margin-bottom: 8u; }
.mn-det .ob { display: flex; align-items: flex-start; gap: 10u; font: 400 15u/1.6 var(--fb); color: var(--ink); margin: 6u 0; }
.mn-det .ob .bx { width: 16u; height: 16u; margin-top: 4u; flex: none; border: 1.2u solid var(--brass3); border-radius: 50%; position: relative; }
.mn-det .ob.done { color: var(--ink3); }
.mn-det .ob.done .bx { border-color: var(--wine); background: rgba(139,51,67,.08); }
.mn-det .ob.done .bx::after { content: ''; position: absolute; left: 3.5u; top: -2u; width: 6u; height: 11u; border: solid var(--wine); border-width: 0 2u 2u 0; transform: rotate(40deg); }
.mn-det .ghost { position: absolute; right: -6u; bottom: -36u; font: 700 280u/1 var(--fd); color: var(--brass3); opacity: .07; pointer-events: none; user-select: none; }
.mn-det .ghost.ic { width: 280u; height: 280u; }

/* spells: night medallions with a brass ring for the elements, ivory coins for the arts */
.sp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4u 10u; }
.sp-grid.arts { grid-template-columns: repeat(7, 1fr); gap: 4u; }
.sp-grid.arts .orb { width: 44u; height: 44u; font-size: 21u; }
.sp-grid.arts .nm { font-size: 12.5u; letter-spacing: .04em; margin-right: -.04em; }
.sp-cell { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6u; padding: 9u 2u 8u; cursor: pointer; pointer-events: auto; border-radius: 6u; transition: background-color .15s; }
.sp-cell:hover { background: rgba(148,113,47,.06); }
.sp-cell.sel { background: rgba(148,113,47,.12); box-shadow: inset 0 0 0 1u rgba(148,113,47,.45); }
.sp-cell .orb { width: 54u; height: 54u; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28u; color: var(--sc);
  background: radial-gradient(circle at 50% 32%, #33467a, #121a33 72%); box-shadow: 0 0 0 1.5u var(--brass), 0 0 0 3.5u rgba(246,239,224,.9), 0 0 0 4.5u rgba(122,92,46,.35), 0 3u 8u rgba(0,0,0,.3); }
.sp-cell .orb .ic { filter: drop-shadow(0 0 5u var(--sc)); }
.sp-cell.art .orb { background: radial-gradient(circle at 50% 32%, #fffaf0, #e8dabb); color: var(--ink); box-shadow: 0 0 0 1.2u var(--brass3), 0 2u 6u rgba(0,0,0,.18); }
.sp-cell.art .orb .ic { filter: none; }
.sp-cell.locked .orb { color: #77728a; filter: grayscale(.7); opacity: .55; }
.sp-cell.locked .orb .ic { filter: none; }
.sp-cell .nm { font: 600 13.5u/1.2 var(--fd); color: var(--ink); letter-spacing: .08em; margin-right: -.08em; }
.sp-cell.locked .nm { color: var(--ink3); }
.sp-cell .pips { display: flex; gap: 3u; }
.sp-cell .pips i { width: 8u; height: 8u; background: rgba(42,36,30,.18); -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.sp-cell .pips i.on { background: var(--brass3); }
.sp-cell .cur { position: absolute; top: 4u; right: 10u; width: 20u; height: 20u; font-size: 11u; }
.sp-h { font: 600 13u/1 var(--fd); color: var(--brass3); letter-spacing: .24em; margin: 4u 0 10u; display: flex; align-items: center; gap: 8u; }
.sp-h::after { content: ''; flex: 1; height: 1u; background: linear-gradient(90deg, rgba(148,113,47,.5), transparent); }
.sp-forms { display: flex; gap: 18u; margin-top: 16u; }
.sp-form { position: relative; flex: 1; max-width: 280u; padding: 12u 16u; border-radius: 6u; background: rgba(148,113,47,.07); box-shadow: inset 0 0 0 1u rgba(148,113,47,.3); }
.sp-form.off { opacity: .4; }
.sp-form .k { font: 600 11.5u/1.4 var(--fd); color: var(--brass3); letter-spacing: .24em; }
.sp-form .v { font: 600 17u/1.5 var(--fd); color: var(--ink); letter-spacing: .06em; }
.sp-form .c { font: 600 12u/1.4 var(--fd); color: #3d6fa8; }

/* items: framed parchment tiles */
.it-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12u; }
.it-cell { position: relative; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7u; cursor: pointer; pointer-events: auto; border-radius: 6u;
  background: radial-gradient(circle at 50% 40%, rgba(255,253,246,.8), rgba(148,113,47,.08)); box-shadow: inset 0 0 0 1u rgba(148,113,47,.32), inset 0 0 0 4u rgba(246,239,224,.6), inset 0 0 0 5u rgba(148,113,47,.14);
  transition: box-shadow .15s, transform .2s var(--ease); }
.it-cell:hover { transform: translateY(-1u); }
.it-cell.sel { box-shadow: inset 0 0 0 1.5u var(--brass3), inset 0 0 0 4u rgba(246,239,224,.6), inset 0 0 0 5u rgba(148,113,47,.3), 0 4u 12u rgba(80,60,30,.15); }
.it-cell .ic { font-size: 36u; color: var(--ink); }
.it-cell .n { position: absolute; right: 9u; top: 8u; font: 600 12.5u/1 var(--fd); color: var(--ink2); }
.it-cell .nm { font: 600 12.5u/1 var(--fd); color: var(--ink2); letter-spacing: .06em; }
.it-big { width: 96u; height: 96u; display: flex; align-items: center; justify-content: center; font-size: 56u; color: var(--ink); border-radius: 50%; margin-bottom: 10u;
  background: radial-gradient(circle at 50% 38%, #fffaf0, #eadcbe); box-shadow: 0 0 0 1u var(--brass3), 0 0 0 5u rgba(246,239,224,.8), 0 0 0 6u rgba(148,113,47,.3), 0 4u 10u rgba(80,60,30,.15); }

/* phones and tablets: the grimoire fills the screen, the side blocks shrink, long details scroll */
.mv-ui.compact .mv-menu > .mv-paper { width: min(1180u, calc(100vw - 12px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)));
  height: min(660u, calc(100dvh - 8px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); padding: 6u 18u 6u; }
.mv-ui.compact .mv-menu > .mv-paper > .bg::after { inset: 4u; border-width: 18u; border-image-width: 18u; }
.mv-ui.compact .mn-side { width: 150u; }
.mv-ui.compact .mn-top > .mn-side:last-child { width: 40u; }
.mv-ui.compact .mn-info { font-size: 11u; }
.mv-ui.compact .mn-info b { font-size: 14u; }
.mv-ui.compact .mn-tab { padding: 6u 11u 9u; letter-spacing: .08em; }
.mv-ui.compact .mn-sub { display: none; }
.mv-ui.compact .mn-body { margin-top: 4u; }
.mv-ui.compact .mn-body::before { inset: 4u; border-width: 16u; border-image-width: 16u; }
.mv-ui.compact .mn-body::after { right: 44u; top: -8u; width: 14u; height: 24u; }
.mv-ui.compact .mn-pane { inset: 11u 15u 7u; }
.mv-ui.compact .mn-foot { margin-top: 2u; }
.mv-ui.compact .mn-split { gap: 18u; }
.mv-ui.compact .mn-list { width: 36%; }
.mv-ui.compact .mn-list.wide { width: 40%; }
.mv-ui.compact .mn-det { padding: 4u 6u 0 18u; overflow-y: auto; touch-action: pan-y; }
.mv-ui.compact .mn-det .big { font-size: 24u; }
.mv-ui.compact .mn-det .txt { margin-top: 8u; line-height: 1.8; }
.mv-ui.compact .mn-det .ghost { position: fixed; display: none; }
.mv-ui.compact .sp-forms { gap: 12u; margin-top: 10u; }
.mv-ui.compact .sp-cell { padding: 5u 2u 4u; gap: 4u; }
.mv-ui.compact .sp-cell .orb { width: 46u; height: 46u; font-size: 24u; }
.mv-ui.compact .sp-grid.arts .orb { width: 38u; height: 38u; font-size: 18u; }
.mv-ui.compact .sp-h { margin: 2u 0 6u; }
/* touch: no key caps or key hints, a close mark in the corner, fingertip rows */
.mv-ui.touch .mn-tabs > .keycap, .mv-ui.touch .mn-hint { visibility: hidden; }
.mv-ui.touch .mn-close { display: block; }
.mn-close { display: none; z-index: 3; }
.mv-ui.touch .mn-tab { min-height: 44px; }
.mv-ui.touch .mn-subtabs .st { padding: 9u 9u; min-height: 40px; }
.mv-ui.touch .mn-filt .fc { min-height: 44px; padding: 0 14u; }
.mv-ui.compact .mn-ch { margin-top: 8u; }
`);

const TABS = ['map', 'journal', 'spells', 'items', 'wardrobe', 'settings'];   // wardrobe: 衣装 between items and settings
const TAB_ICON = { map: 'map', journal: 'journal', spells: 'spells', items: 'items', wardrobe: 'wardrobe', settings: 'settings' };
const ARTS = ['charm', 'dodge', 'broom', 'wings', 'guard', 'shikigami', 'kinkan'];
const EL_COLS = 4, ART_COLS = 7;   // the spell page's two grids (.sp-grid / .sp-grid.arts); more arts wrap into more rows and the list scrolls
const INNATE = new Set(['charm', 'dodge']);

function callProvider(providers, k) {
  try { const v = providers[k] && providers[k](); return Array.isArray(v) ? v : []; } catch (e) { G.reportError('ui:provider:' + k, e); return []; }
}
function emptyState(parent, k1, k2) {
  const e = el('div', 'empty', parent);
  el('div', 'enso', e); tel('div', 'e1', e, k1); if (k2) tel('div', 'e2', e, k2);
  return e;
}
const glyph = (id) => (has('ui.glyph.' + id) ? t('ui.glyph.' + id) : '');

// ---- journal ---------------------------------------------------------------------------------------------
function createJournal(parent, providers) {
  const R = el('div', 'mn-split', parent);
  const L = el('div', 'mn-list', R);
  const sub = el('div', 'mn-subtabs', L);
  const filt = el('div', 'mn-filt', L);   // quests: all / active / done
  const listEl = el('div', 'scroll', L);
  const D = el('div', 'mn-det', R);
  let mode = 'quests', nav = null, data = [], filter = 'all';
  const st = {
    quests: el('div', 'st', sub), lore: el('div', 'st', sub), notes: el('div', 'st', sub), wilds: el('div', 'st', sub),
  };
  const FILTERS = ['all', 'active', 'done'];
  const chips = FILTERS.map((k) => {
    const c = el('div', 'fc', filt);
    c.addEventListener('click', () => { if (filter !== k) { filter = k; render(); sfx('ui_move', 0.5); } });
    return c;
  });
  st.quests.addEventListener('click', () => { mode = 'quests'; render(); sfx('ui_page', 0.6); });
  st.lore.addEventListener('click', () => { mode = 'lore'; render(); sfx('ui_page', 0.6); });
  st.notes.addEventListener('click', () => { mode = 'notes'; render(); sfx('ui_page', 0.6); });
  st.wilds.addEventListener('click', () => { mode = 'wilds'; render(); sfx('ui_page', 0.6); });

  function detail(i) {
    clear(D);
    const q = data[i];
    if (!q) return;
    if (mode === 'notes') { noteDetail(D, q); return; }
    if (mode === 'wilds') { wildsDetail(D, q); return; }
    if (mode === 'quests') {
      el('div', 'ghost', D, t(q.main ? 'ui.seal.main' : 'ui.seal.side'));
      const k = el('div', 'kick', D);
      el('span', 'seal' + (q.main ? '' : ' side'), k, t(q.main ? 'ui.seal.main' : 'ui.seal.side'));
      tel('span', '', k, q.main ? 'ui.journal.main' : 'ui.journal.side');
      tel('span', '', k, q.state === 'done' ? 'ui.journal.done' : 'ui.journal.active');
      el('div', 'big', D, q.title || '');
      if (q.desc) el('div', 'txt', D, q.desc);
      const obs = Array.isArray(q.objectives) ? q.objectives : [];
      if (obs.length) {
        el('div', 'rule ink', D);
        tel('div', 'obh', D, 'ui.journal.objectives');
        for (const o of obs) { const r = el('div', 'ob' + (o.done ? ' done' : ''), D); el('span', 'bx', r); el('span', '', r, o.text || ''); }
      }
    } else {
      icon('ema', 'ghost', D);
      const k = el('div', 'kick', D); tel('span', '', k, 'ui.journal.lore');
      el('div', 'big', D, q.title || '');
      el('div', 'txt', D, q.text || '');
    }
  }

  function render() {
    const quests = callProvider(providers, 'journal');
    const lore = callProvider(providers, 'lore');
    clear(st.quests); tel('span', '', st.quests, 'ui.journal.quests'); el('span', 'n', st.quests, String(quests.length));
    clear(st.lore); tel('span', '', st.lore, 'ui.journal.lore'); el('span', 'n', st.lore, String(lore.length));
    const nc = notesCount();
    clear(st.notes); tel('span', '', st.notes, 'elements.ui.tab'); el('span', 'n', st.notes, nc.n + '/' + nc.of);
    const wc = wildsCount();
    clear(st.wilds); tel('span', '', st.wilds, 'gameplay.wilds.page.tab'); el('span', 'n', st.wilds, wc.n + '/' + wc.of);
    st.quests.classList.toggle('on', mode === 'quests'); st.lore.classList.toggle('on', mode === 'lore'); st.notes.classList.toggle('on', mode === 'notes'); st.wilds.classList.toggle('on', mode === 'wilds');
    filt.style.display = mode === 'quests' ? '' : 'none';
    const chapters = mode === 'quests' ? questChapters(quests) : null;
    data = chapters ? chapters.flatMap((c) => c.list) : mode === 'notes' ? notesEntries() : mode === 'wilds' ? wildsEntries() : lore;
    clear(listEl); clear(D);
    if (!data.length) {
      nav = null;
      if (mode === 'quests' && quests.length) emptyState(D, 'ui.journal.emptyFilter');
      else if (mode === 'quests') emptyState(D, 'ui.journal.emptyQuests', 'ui.journal.emptyQuestsSub');
      else emptyState(D, 'ui.journal.emptyLore', 'ui.journal.emptyLoreSub');
      return;
    }
    // quests: a chapter line before each episode's first quest (outside the rows navList walks)
    const heads = new Map();
    if (chapters) for (const c of chapters) heads.set(c.list[0], c);
    const rows = data.map((q) => {
      const ch = heads.get(q);
      if (ch) {
        const h = el('div', 'mn-ch' + (ch.done === ch.of ? ' done' : ''), listEl);
        el('span', 'tt', h, ch.title); el('span', 'n', h, t('ui.journal.chapterCount', { n: ch.done, of: ch.of }));
      }
      if (mode === 'notes') { const r = el('div', 'mn-row rx-note' + (q.known ? '' : ' unk'), listEl); noteRow(r, q); return r; }
      if (mode === 'wilds') { const r = el('div', 'mn-row', listEl); wildsRow(r, q); return r; }
      const r = el('div', 'mn-row' + (mode === 'quests' && q.state === 'done' ? ' done' : ''), listEl);
      if (mode === 'quests') el('span', 'seal' + (q.main ? '' : ' side'), r, t(q.main ? 'ui.seal.main' : 'ui.seal.side'));
      else icon('ema', '', r);
      el('span', 'tt', r, q.title || '');
      if (mode === 'quests') tel('span', 'chip' + (q.state === 'done' ? '' : ' act'), r, q.state === 'done' ? 'ui.journal.done' : 'ui.journal.active');
      return r;
    });
    // open on the first quest still under way (with many chapters it may sit far down the page)
    const start = chapters ? Math.max(0, data.findIndex((q) => q.state !== 'done')) : 0;
    nav = navList(rows, null, { onSel: detail, start }).bind();
  }
  /** Quests (after the filter) grouped by episode in story order: [{ title, list, done, of }]; quests of no episode last. */
  function questChapters(quests) {
    const counts = { all: quests.length, active: 0, done: 0 };
    for (const q of quests) counts[q.state === 'done' ? 'done' : 'active']++;
    chips.forEach((c, i) => {
      const k = FILTERS[i];
      clear(c); tel('span', '', c, 'ui.journal.filter.' + k); el('span', 'n', c, String(counts[k]));
      c.classList.toggle('on', k === filter);
    });
    const keep = (q) => filter === 'all' || (filter === 'done') === (q.state === 'done');
    const order = (a, b) => ((a.state === 'done') - (b.state === 'done')) || ((b.main ? 1 : 0) - (a.main ? 1 : 0));   // active first, main first
    const byEp = new Map();
    for (const q of quests) { const e = q && episodeOfQuest(q.id); const k = e ? e.id : ''; if (!byEp.has(k)) byEp.set(k, []); byEp.get(k).push(q); }
    const out = [];
    const add = (title, all) => {
      const list = all.filter(keep).sort(order);
      if (list.length) out.push({ title, list, done: all.filter((q) => q.state === 'done').length, of: all.length });
    };
    for (const e of episodes()) if (byEp.has(e.id)) add(e.title ? t(e.title) : e.id, byEp.get(e.id));
    if (byEp.has('')) add(t('ui.journal.looseChapter'), byEp.get(''));
    return out;
  }
  function cycleFilter() { filter = FILTERS[(FILTERS.indexOf(filter) + 1) % FILTERS.length]; render(); sfx('ui_move', 0.5); }
  return {
    el: R, render, show: render,
    keys() {
      if (K.L || K.R) { const ms = ['quests', 'lore', 'notes', 'wilds']; mode = ms[(ms.indexOf(mode) + (K.L ? ms.length - 1 : 1)) % ms.length]; render(); sfx('ui_page', 0.6); return; }
      if (mode === 'quests' && K.code('KeyF')) { cycleFilter(); return; }
      nav?.keys();
    },
    hints: (h) => { hint(h, 'ui.menu.hintMove', { up: '↑', down: '↓' }); hint(h, 'ui.menu.hintSub', { key: '← →' }); hint(h, 'ui.journal.hintFilter', { key: 'F' }); },
  };
}

// ---- spells ----------------------------------------------------------------------------------------------
function createSpells(parent, providers) {
  const R = el('div', 'mn-split', parent);
  const L = el('div', 'mn-list', R);
  L.classList.add('wide');
  const box = el('div', 'scroll', L);
  const D = el('div', 'mn-det', R);
  let cells = [], data = [], sel = 0;

  function gather() {
    const prov = callProvider(providers, 'spells');
    const slots = spellSlots(true);
    const els = ELEMENTS.map((id, i) => {
      const p = prov.find((s) => s && s.id === id) || prov.find((s) => s && s.element === id); // the exact id first: 灵符 (charm) also carries element 'sun'
      const s = slots[i];
      return { kind: 'el', id, element: id, level: (p && typeof p.level === 'number') ? p.level : s.level, name: (p && p.name) || s.name, desc: (p && p.desc) || s.desc,
        small: (p && (p.small?.name || p.small)) || s.small, big: (p && (p.big?.name || p.big)) || s.big, cost: s.cost, costBig: s.costBig };
    });
    const ab = (G.state && G.state.abilities) || {};
    const arts = ARTS.map((id) => {
      const p = prov.find((s) => s && s.id === id);
      return { kind: 'art', id, level: INNATE.has(id) || ab[id] || (p && p.level > 0) ? 1 : 0, name: (p && p.name) || t('ui.spells.art.' + id + '.name'), desc: (p && p.desc) || t('ui.spells.art.' + id + '.desc') };
    });
    return els.concat(arts);
  }

  function detail(i) {
    clear(D);
    const s = data[i];
    if (!s) return;
    const g = glyph(s.id);
    if (g) el('div', 'ghost', D, g); else icon(s.id, 'ghost', D);
    const k = el('div', 'kick', D);
    tel('span', '', k, s.kind === 'el' ? 'ui.spells.elements' : 'ui.spells.arts');
    if (s.kind === 'el') el('span', '', k, t('core.element.' + s.id));
    if (s.kind === 'el' && s.id === selectedId()) tel('span', 'seal', k, 'ui.seal.learned');
    const locked = s.level <= 0;
    el('div', 'big', D, locked && s.kind === 'el' ? t('ui.spells.lockedName') : s.name);
    if (s.kind === 'el') tel('div', 'kick', D, 'ui.spells.level' + Math.min(2, Math.max(0, s.level | 0)));
    el('div', 'txt', D, locked && s.kind === 'el' ? t('ui.spells.lockedDesc') : (s.desc || t('ui.spells.el.' + s.id)));
    if (s.kind === 'el') {
      const f = el('div', 'sp-forms', D);
      const form = (lv, kk, nm, cost) => {
        const b = el('div', 'sp-form' + (s.level >= lv ? '' : ' off'), f);
        tel('div', 'k', b, kk);
        el('div', 'v', b, s.level >= lv && nm ? nm : (s.level >= lv ? t(kk) : t('ui.spells.lockedName')));
        if (s.level >= lv && cost) tel('div', 'c', b, 'ui.spells.cost', { n: cost });
      };
      form(1, 'ui.spells.small', s.small, s.cost);
      form(2, 'ui.spells.big', s.big, s.costBig);
      if (s.id === selectedId()) { const e = el('div', 'kick gap', D); tel('span', '', e, 'ui.spells.equipped'); }
    }
  }

  function render() {
    data = gather();
    clear(box);
    const anyKnown = data.some((s) => s.kind === 'el' && s.level > 0);
    tel('div', 'sp-h', box, 'ui.spells.elements');
    const g1 = el('div', 'sp-grid', box);
    const mk = (s, parentGrid) => {
      const c = el('div', 'sp-cell' + (s.kind === 'art' ? ' art' : '') + (s.level <= 0 ? ' locked' : ''), parentGrid);
      if (s.kind === 'el') c.style.setProperty('--sc', EL_COLOR[s.id]);
      const o = el('div', 'orb', c); icon(s.level <= 0 && s.kind === 'el' ? s.id : s.id, '', o);
      el('div', 'nm', c, s.kind === 'el' ? (s.level > 0 ? s.name : t('core.element.' + s.id)) : s.name);
      if (s.kind === 'el') { const p = el('div', 'pips', c); el('i', s.level >= 1 ? 'on' : '', p); el('i', s.level >= 2 ? 'on' : '', p); }
      else if (s.level <= 0) { const p = el('div', 'pips', c); el('i', '', p); }
      if (s.kind === 'el' && s.id === selectedId()) tel('span', 'seal cur', c, 'ui.seal.learned');
      return c;
    };
    cells = data.filter((s) => s.kind === 'el').map((s) => mk(s, g1));
    tel('div', 'sp-h', box, 'ui.spells.arts');
    const g2 = el('div', 'sp-grid arts', box);
    cells = cells.concat(data.filter((s) => s.kind === 'art').map((s) => mk(s, g2)));
    cells.forEach((c, i) => c.addEventListener('mouseenter', () => setSel(i, true)));
    setSel(Math.min(sel, cells.length - 1), false, true);
    if (!anyKnown && !callProvider(providers, 'spells').length && !(G.state && G.state.spells && Object.keys(G.state.spells).length)) {
      // nothing learned yet: a gentle note under the grid
      const e = el('div', 'kick gap', box); tel('span', '', e, 'ui.spells.emptySub');
    }
  }
  function setSel(i, mouse, quiet) {
    i = Math.max(0, Math.min(cells.length - 1, i));
    if (i !== sel && !quiet) sfx('ui_move', 0.45);
    sel = i;
    cells.forEach((c, j) => c.classList.toggle('sel', j === i));
    if (!mouse) cells[i]?.scrollIntoView?.({ block: 'nearest' });
    detail(i);
  }
  return {
    el: R, render, show: render,
    keys() {
      // two grids: the elements (EL_COLS a row) then the arts (ART_COLS a row, as many rows as there are arts)
      const nEl = data.filter((s) => s.kind === 'el').length, n = cells.length;
      const elLast = Math.floor((nEl - 1) / EL_COLS) * EL_COLS;   // first cell of the elements' last row
      if (K.L) setSel(sel - 1);
      if (K.R) setSel(sel + 1);
      if (K.U) {
        if (sel >= nEl + ART_COLS) setSel(sel - ART_COLS);
        else if (sel >= nEl) setSel(Math.min(nEl - 1, elLast + Math.floor(((sel - nEl) * EL_COLS) / ART_COLS)));
        else if (sel >= EL_COLS) setSel(sel - EL_COLS);
      }
      if (K.D) {
        if (sel < nEl && sel + EL_COLS < nEl) setSel(sel + EL_COLS);
        else if (sel < nEl) setSel(Math.min(n - 1, nEl + Math.round(((sel - elLast) * ART_COLS) / EL_COLS)));
        else if (sel + ART_COLS < n) setSel(sel + ART_COLS);
      }
    },
    hints: (h) => hint(h, 'ui.menu.hintMove', { up: '↑ ↓', down: '← →' }),
  };
}

// ---- items -----------------------------------------------------------------------------------------------
const KNOWN_ITEMS = ['stardust', 'dango', 'moontear'];
const IT_COLS = 4;   // .it-grid columns; any number of items: rows grow and the list scrolls
function createItems(parent, providers) {
  const R = el('div', 'mn-split', parent);
  const L = el('div', 'mn-list', R);
  const box = el('div', 'scroll', L);
  const D = el('div', 'mn-det', R);
  let cells = [], data = [], sel = 0;
  function gather() {
    const prov = callProvider(providers, 'items');
    if (prov.length) return prov.filter((x) => x && (x.count === undefined || x.count > 0));
    const inv = (G.state && G.state.inventory) || {};
    return KNOWN_ITEMS.filter((id) => (inv[id] || 0) > 0).map((id) => ({ id, name: t('ui.item.' + id + '.name'), desc: t('ui.item.' + id + '.desc'), count: inv[id], icon: id }));
  }
  function detail(i) {
    clear(D);
    const it = data[i];
    if (!it) return;
    const b = el('div', 'it-big', D); icon(it.icon || it.id, '', b);
    el('div', 'big', D, it.name || '');
    if (it.count !== undefined) tel('div', 'kick', D, 'ui.items.held', { n: it.count });
    el('div', 'txt', D, it.desc || '');
    // use / eat (gameplay.useItem); food reads 'eat'
    if (it.usable && G.gameplay?.useItem) {
      const b2 = el('div', 'btn it-use', D); icon(it.icon || it.id, '', b2);
      tel('span', '', b2, it.kind === 'tool' ? 'ui.items.use' : 'ui.items.eat');
      b2.style.marginTop = '14px'; b2.style.display = 'inline-flex';
      b2.addEventListener('click', () => use(i));
    }
  }
  function use(i) {
    const it = data[i];
    if (!it || !it.usable || !G.gameplay?.useItem) return;
    let ok = false;
    try { ok = !!G.gameplay.useItem(it.id); } catch (e) { G.reportError('ui:useItem', e); }
    sfx(ok ? 'ui_confirm' : 'ui_cancel_soft', 0.5);
    render();
  }
  function render() {
    data = gather();
    clear(box); clear(D);
    if (!data.length) { cells = []; emptyState(D, 'ui.items.empty', 'ui.items.emptySub'); return; }
    const g = el('div', 'it-grid', box);
    cells = data.map((it, i) => {
      const c = el('div', 'it-cell', g);
      icon(it.icon || it.id, '', c);
      el('div', 'nm', c, it.name || '');
      if (it.count !== undefined) el('span', 'n', c, t('ui.items.count', { n: it.count }));
      c.addEventListener('mouseenter', () => setSel(i, true));
      return c;
    });
    setSel(Math.min(sel, cells.length - 1), false, true);
  }
  function setSel(i, mouse, quiet) {
    if (!cells.length) return;
    i = Math.max(0, Math.min(cells.length - 1, i));
    if (i !== sel && !quiet) sfx('ui_move', 0.45);
    sel = i;
    cells.forEach((c, j) => c.classList.toggle('sel', j === i));
    if (!mouse) cells[i]?.scrollIntoView?.({ block: 'nearest' });   // a full bag scrolls (.mn-list .scroll)
    detail(i);
  }
  return {
    el: R, render, show: render,
    keys() { if (K.L) setSel(sel - 1); if (K.R) setSel(sel + 1); if (K.U && sel >= IT_COLS) setSel(sel - IT_COLS); if (K.D && sel + IT_COLS < cells.length) setSel(sel + IT_COLS); if (K.confirm(false)) use(sel); },
    hints: (h) => hint(h, 'ui.menu.hintMove', { up: '↑ ↓', down: '← →' }),
  };
}

function hint(parent, k, caps) { const s = el('span', '', parent); hintLine(s, k, caps); return s; }

// ---- the scroll ------------------------------------------------------------------------------------------
export function createMenu(host, stage, providers) {
  let M = null;   // built lazily on first open
  let openedAt = 0;
  let cur = 'map', open = false, focusFoot = false, footSel = 0, quitting = false;
  const panes = {};
  let tabsEl = {}, sheet, info, sub, hintEl, footBtns = [];

  function build() {
    M = el('div', 'modal mv-menu', host);
    sheet = el('div', 'mv-paper mv-night', M); el('div', 'bg', sheet);
    const top = el('div', 'mn-top', sheet);
    const left = el('div', 'mn-side', top);
    tel('span', 'seal', left, 'ui.seal.paused');
    info = el('div', 'mn-info', left);
    const tabs = el('div', 'mn-tabs', top);
    const kq = keycap('Q', tabs, 'sm');
    el('div', 'mn-side', top);
    for (const id of TABS) {
      const b = el('div', 'mn-tab', tabs);
      icon(TAB_ICON[id], '', b); tel('span', '', b, 'ui.menu.tabs.' + id);
      b.addEventListener('click', () => select(id));
      tabsEl[id] = b;
    }
    const ke = keycap('E', tabs, 'sm');
    kq.style.pointerEvents = ke.style.pointerEvents = 'auto'; kq.style.cursor = ke.style.cursor = 'pointer';
    kq.addEventListener('click', () => step(-1)); ke.addEventListener('click', () => step(1));
    // touch: a close mark in the corner (the footer's "back to the journey" does the same)
    const xb = el('div', 'mv-x mn-close', sheet);
    xb.addEventListener('click', () => close(true));
    sub = el('div', 'mn-sub', sheet);
    const body = el('div', 'mn-body', sheet);
    const pane = (id) => el('div', 'mn-pane', body);
    panes.map = { el: pane('map') }; panes.map.view = createMapTab(panes.map.el, providers);
    panes.journal = { el: pane('journal') }; panes.journal.view = createJournal(panes.journal.el, providers);
    panes.spells = { el: pane('spells') }; panes.spells.view = createSpells(panes.spells.el, providers);
    panes.items = { el: pane('items') }; panes.items.view = createItems(panes.items.el, providers);
    panes.wardrobe = { el: pane('wardrobe') }; panes.wardrobe.view = createWardrobe(panes.wardrobe.el);   // 衣装 (src/ui/wardrobe.js)
    panes.settings = { el: pane('settings') };
    const sw = el('div', 'scroll', panes.settings.el); sw.style.cssText = 'position:absolute;inset:0;';
    panes.settings.view = createSettings(sw);
    const foot = el('div', 'mn-foot', sheet);
    hintEl = el('div', 'mn-hint', foot);
    const bR = el('div', 'btn', foot); icon('resume', '', bR); tel('span', '', bR, 'ui.menu.resume');
    const bQ = el('div', 'btn red', foot); icon('quit', '', bQ); tel('span', '', bQ, 'ui.menu.quit');
    bR.addEventListener('click', () => close(true));
    bQ.addEventListener('click', () => quit());
    footBtns = [bR, bQ];
    footBtns.forEach((b, i) => b.addEventListener('mouseenter', () => { if (focusFoot) { footSel = i; markFoot(); } }));
    M.addEventListener('mousedown', (e) => { if (e.target === M) close(true); });
  }

  function markFoot() { footBtns.forEach((b, i) => b.classList.toggle('sel', focusFoot && i === footSel)); }

  function paintInfo() {
    clear(info);
    const env = G.env || {};
    el('b', '', info, env.region && has('world.place.' + env.region) ? t('world.place.' + env.region) : t('world.name'));
    tel('span', '', info, 'ui.menu.played', { time: fmtTime(G.state && G.state.playTime) });
  }
  function paintHints() {
    clear(hintEl);
    hint(hintEl, 'ui.menu.hintTabs', { prev: 'Q', next: 'E' });
    panes[cur]?.view?.hints?.(hintEl);
    if (cur === 'settings') hint(hintEl, 'ui.menu.hintAdjust', { left: '←', right: '→' });
    hint(hintEl, 'ui.menu.hintFoot', { key: codeLabel('Tab') });
    hint(hintEl, 'ui.menu.hintClose', { key: codeLabel('Escape') });
  }

  function select(id, quiet) {
    if (!panes[id]) return;
    if (id !== cur && !quiet) sfx('ui_page', 0.7);
    cur = id;
    for (const k of TABS) { tabsEl[k].classList.toggle('on', k === id); panes[k].el.classList.toggle('on', k === id); }
    sub.textContent = t('ui.menu.sub.' + id);
    focusFoot = false; markFoot();
    try { panes[id].view.show ? panes[id].view.show() : panes[id].view.render?.(); } catch (e) { G.reportError('ui:menu:' + id, e); }
    paintHints();
  }
  function step(d) { select(TABS[(TABS.indexOf(cur) + d + TABS.length) % TABS.length]); }

  function openMenu(tab) {
    if (quitting) return;
    if (!M) build();
    if (tab && !TABS.includes(tab)) tab = null;
    if (open) { select(tab || cur); return; }
    open = true;
    openedAt = performance.now();
    enterMenuMode();
    G.ui?.prompt?.(null);
    pushModal(modal);
    paintInfo();
    select(tab || cur, true);
    M.classList.add('on');
    sfx('ui_open', 0.7);
  }
  function close(gesture) {
    if (!open) return;
    open = false;
    popModal(modal);
    M.classList.remove('on');
    sfx('ui_close', 0.6);
    leaveMenuMode(gesture);
  }
  async function quit() {
    if (quitting) return;
    const ok = await confirmBox(host, { title: t('ui.menu.quitTitle'), text: t('ui.menu.quitText'), yes: t('ui.menu.quitYes'), no: t('ui.menu.quitNo'), seal: t('ui.seal.paused') });
    if (!ok) return;
    quitting = true;
    try { G.save?.write(); } catch (e) { G.reportError('ui:quit', e); }
    G.save?.resume?.clear?.();   // back to the title on purpose: the reload must not resume (phones, core/save.js)
    await stage.fade(1, 0.7, '#07060e');
    UI.reload();
  }

  const modal = {
    el: null,
    relabel() { if (open) { paintInfo(); select(cur, true); } else for (const k of TABS) panes[k]?.view?.render?.(); },
    update(rdt) {
      if (cur === 'map') panes.map.view.update(rdt);
      const inp = G.input;
      // the Esc that released the pointer (and opened us) must not close us again
      if (performance.now() - openedAt < 180) { K.eat(); return; }
      // a key being chosen in the settings takes every key (M / J / B / Q / E / Tab / Esc included)
      if (cur === 'settings' && panes.settings?.view?.capturing) { panes.settings.view.keys(); K.eat(); return; }
      // hotkeys: the key of the open tab closes, another opens its tab
      const hk = inp.pressed('map') ? 'map' : inp.pressed('journal') ? 'journal' : inp.pressed('spellbook') ? 'spells' : null;
      if (hk) { if (hk === cur) close(true); else select(hk); K.eat(); return; }
      if (K.cancel() || (inp.pressed('pause') && !K.code('Escape'))) { close(true); K.eat(); return; }
      if (K.code('KeyQ')) step(-1);
      else if (K.code('KeyE')) step(1);
      else if (K.code('Tab')) { focusFoot = !focusFoot; footSel = 0; markFoot(); sfx('ui_move', 0.45); }
      else if (focusFoot) {
        if (K.L || K.U) { footSel = 0; markFoot(); }
        if (K.R || K.D) { footSel = 1; markFoot(); }
        if (K.confirm(false)) { if (footSel === 0) close(true); else quit(); }
      } else panes[cur].view.keys?.();
      K.eat();
    },
  };

  return {
    open: openMenu, close,
    get isOpen() { return open; },
    get tab() { return cur; },
    /** repaint the map (background progressive painting is driven from ui.js) */
    refresh() { if (open) select(cur, true); },
  };
}
