// 元素交织 on screen: a callout where two elements meet (name in the serif on a two-colour glass pill, ×multiplier),
// status marks over foes (wet / burning / frozen / shocked / muddy / chilled, each with a draining ring), a toast on
// every first discovery, the announcement of newly granted magic, and the 元素笔记 page of the journal (menu.js calls
// notesEntries / noteRow / noteDetail).
// Listens only: 'element:combo', 'element:discovered', 'game:start'. Reads G.elements (active reactors, statusesOf).
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { clamp } from '../core/util.js';
import { UI, el, tel, clear } from './dom.js';
import { icon, setIcon, EL_COLOR } from './icons.js';
import { addCss } from './style.js';
import { COMBOS, COMBO_IDS, COMBO_KINDS } from '../elements/catalog.js';

addCss(`
.rx-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.rx-call { position: absolute; left: 0; top: 0; will-change: transform; display: none; }
.rx-call.on { display: block; }
.rx-call .in { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 6u; white-space: nowrap; padding: 5u 16u 6u 10u;
  font: 600 21u/1.1 var(--fd); letter-spacing: .1em; color: #fffaf0; --tx: calc(-100% - 30u); transform: translate(var(--tx), -50%); transform-origin: 100% 50%; text-shadow: var(--halo); }
.rx-call.r .in { --tx: 30u; transform-origin: 0 50%; }
.rx-call .in::before { content: ''; position: absolute; inset: 0 -4u; z-index: -1; border-radius: 18u; opacity: .92;
  background: linear-gradient(90deg, color-mix(in srgb, var(--a) 46%, rgba(14,20,40,.9)), color-mix(in srgb, var(--b) 46%, rgba(14,20,40,.9)));
  box-shadow: inset 0 0 0 1u rgba(255,247,232,.4), 0 4u 12u rgba(0,0,0,.3); }
.rx-call .els { display: flex; gap: 1u; }
.rx-call .els .ic { font-size: 17u; filter: drop-shadow(0 0 3u rgba(8,6,14,.9)); }
.rx-call .els .ic:nth-child(1) { color: var(--a); } .rx-call .els .ic:nth-child(2) { color: var(--b); } .rx-call .els .ic:nth-child(3) { color: var(--c); }
.rx-call .mu { font: 700 16u/1 var(--fd); letter-spacing: .02em; color: var(--brass2); margin-left: 2u; }
.rx-call .kk { position: absolute; left: 50%; top: -15u; transform: translateX(-50%); font: 600 11u/1 var(--fd); letter-spacing: .32em; color: var(--brass2); opacity: .95; }
.rx-call.big .in { font-size: 30u; padding: 7u 24u 8u 14u; letter-spacing: .16em; }
.rx-call.big .els .ic { font-size: 22u; }
.rx-call.big .mu { font-size: 20u; }
.rx-call.pop .in { animation: rx-pop 1.6s cubic-bezier(.2,.8,.2,1) both; }
.rx-call.big.pop .in { animation-duration: 2.3s; }
@keyframes rx-pop {
  0% { opacity: 0; transform: translate(var(--tx), -50%) scale(.55); }
  10% { opacity: 1; transform: translate(var(--tx), -50%) scale(1.14); }
  20% { transform: translate(var(--tx), -50%) scale(1); }
  72% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--tx), -90%) scale(.96); } }

.rx-pips { position: absolute; left: 0; top: 0; display: none; gap: 3u; transform-origin: 50% 0; will-change: transform; }
.rx-pips.on { display: flex; }
.rx-pip { position: relative; width: 22u; height: 22u; border-radius: 50%; display: none; align-items: center; justify-content: center;
  background: radial-gradient(circle, rgba(14,20,40,.88) 0 58%, transparent 60%); color: var(--sc); font-size: 13u; }
.rx-pip.on { display: flex; }
.rx-pip::before { content: ''; position: absolute; inset: 0; border-radius: 50%;
  background: conic-gradient(var(--sc) calc(var(--k, 1) * 360deg), rgba(255,255,255,.14) 0);
  -webkit-mask: radial-gradient(circle, transparent 0 58%, #000 60%); mask: radial-gradient(circle, transparent 0 58%, #000 60%); }
.rx-pip .ic { position: relative; filter: drop-shadow(0 0 2u var(--sc)); }
.rx-pip.chilled .ic { opacity: .7; }
.rx-pip.frozen { box-shadow: 0 0 8u 1u rgba(185,238,255,.55); border-radius: 50%; }

/* the element notes page (journal) */
.rx-note .els { display: flex; gap: 2u; flex: none; }
.rx-note .els .ic { font-size: 15u; }
.rx-note.unk .tt { color: var(--ink3); letter-spacing: .24em; }
.rx-note.unk .els .ic { opacity: .55; }
.rx-note .chip.kind { min-width: 34u; text-align: right; }
.rx-det .rcp { display: flex; align-items: center; gap: 8u; margin-top: 10u; font: 600 16u/1.4 var(--fd); color: var(--ink); letter-spacing: .06em; }
.rx-det .rcp .ic { font-size: 22u; }
.rx-det .rcp .lb { font: 600 11.5u/1 var(--fd); color: var(--brass3); letter-spacing: .24em; margin-right: 4u; }
.rx-det .mul { margin-top: 10u; font: 600 14u/1.4 var(--fd); color: var(--wine); letter-spacing: .06em; }
.rx-det .cnt { margin-top: 6u; font: 400 12.5u/1.5 var(--fb); color: var(--ink3); letter-spacing: .08em; }
.rx-det .hint { margin-top: 14u; padding: 11u 16u; max-width: 560u; border-radius: 0 6u 6u 0; background: rgba(148,113,47,.08); box-shadow: inset 2u 0 0 var(--brass); font: 400 15u/1.8 var(--fb); color: var(--ink2); }
.rx-det .hint b { display: block; font: 600 11.5u/1.6 var(--fd); color: var(--brass3); letter-spacing: .24em; }
.rx-det .prog { margin-top: 18u; font: 600 12u/1.5 var(--fd); color: var(--ink3); letter-spacing: .16em; }
`);

const STATUS_COLOR = { burning: '#ff7b47', wet: '#5cb9ff', frozen: '#b9eeff', shocked: '#cba6ff', muddy: '#c08a54', chilled: '#dff6ff' };
const STATUS_ICON = { burning: 'fire', wet: 'water', frozen: 'ice', shocked: 'thunder', muddy: 'earth', chilled: 'ice' };
const STATUS_FULL = { burning: 6, wet: 12, frozen: 6, shocked: 1.4, muddy: 5, chilled: 4 };
const MAX_CALLS = 7, MAX_PIPS = 10, PIP_SLOTS = 4;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _p = { x: 0, y: 0, d: 0 };
const CALL_DROP = 2.5;   // combo point (2 m over the head) → the upper body

const name = (id) => (has('elements.combo.' + id + '.name') ? t('elements.combo.' + id + '.name') : id);
const elCol = (e) => EL_COLOR[e] || '#ffffff';

/** world → screen px (false when behind the camera or well off screen) */
function project(p, out) {
  const cam = G.camera;
  if (!cam) return false;
  _v.set(p.x, p.y, p.z).applyMatrix4(cam.matrixWorldInverse);
  if (_v.z > -0.4) return false;
  out.d = -_v.z;
  _v.applyMatrix4(cam.projectionMatrix);
  if (Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) return false;
  out.x = (_v.x * 0.5 + 0.5) * UI.w; out.y = (-_v.y * 0.5 + 0.5) * UI.h;
  return true;
}

export function createReactions(root) {
  const layer = el('div', 'layer rx-layer', root);
  // ---- callouts ----------------------------------------------------------------------------------------------------
  const calls = [];
  for (let i = 0; i < MAX_CALLS; i++) {
    const node = el('div', 'rx-call', layer);
    const inn = el('div', 'in', node);
    const kk = el('span', 'kk', inn);
    const els = el('span', 'els', inn);
    const nm = el('span', 'nm', inn);
    const mu = el('span', 'mu', inn);
    calls.push({ node, inn, kk, els, nm, mu, id: null, pos: new THREE.Vector3(), t: 0, life: 0, rise: 0, sx: -1, sy: -1, live: false });
  }
  function showCombo(e) {
    if (!e || !e.pos || e.quiet || G.mode !== 'play' && G.mode !== 'cutscene') return;
    if (e.team !== 'player') return;
    const c = COMBOS[e.id];
    if (!c) return;
    const cam = G.camera?.position;
    if (cam && cam.distanceTo(e.pos) > 70) return;
    const now = G.time.real;
    // the same reaction again close by: bump the live callout instead of stacking a new one
    let k = calls.find((q) => q.live && q.id === e.id && q.pos.distanceTo(e.pos) < 6 && now - q.t0 < 0.9);
    const fresh = !k;
    if (!k) k = calls.find((q) => !q.live) || calls.reduce((a, b) => (a.t0 < b.t0 ? a : b));
    k.id = e.id; k.live = true; k.t0 = now; k.life = c.big || e.big ? 2.3 : 1.6;
    k.pos.copy(e.pos);
    const els = c.els;
    k.node.style.setProperty('--a', elCol(els[0]));
    k.node.style.setProperty('--b', elCol(els[1] || els[0]));
    k.node.style.setProperty('--c', elCol(els[2] || els[1] || els[0]));
    clear(k.els);
    for (const x of els) icon(x, '', k.els);
    k.nm.textContent = name(e.id);
    const m = e.mult || 1;
    k.mu.textContent = m > 1.01 ? t('elements.ui.mult', { m: +m.toFixed(1) }) : '';
    k.kk.textContent = c.big || e.big ? t('elements.kind.' + c.kind) : '';
    k.node.classList.toggle('big', !!(c.big || e.big));
    k.node.classList.remove('pop'); void k.node.offsetWidth; k.node.classList.add('pop');
    k.sx = k.sy = -1;
  }
  function updateCalls() {
    const now = G.time.real;
    for (const k of calls) {
      if (!k.live) continue;
      if (now - k.t0 > k.life) { k.live = false; k.node.classList.remove('on', 'pop'); continue; }
      // beside the foe's upper body (combo points sit 2 m over its head): the lanes of numbers and words above its head
      // and the foe plate over them stay clear; near the left edge of the screen the pill goes to the right side
      if (!project(_v2.set(k.pos.x, k.pos.y - CALL_DROP, k.pos.z), _p)) { if (k.node.classList.contains('on')) k.node.classList.remove('on'); continue; }
      k.node.classList.add('on');
      const right = _p.x < UI.w * 0.32;
      if (k.right !== right) { k.right = right; k.node.classList.toggle('r', right); }
      const sx = Math.round(_p.x), sy = Math.round(_p.y);
      if (sx !== k.sx || sy !== k.sy) { k.sx = sx; k.sy = sy; k.node.style.transform = `translate3d(${sx}px,${sy}px,0)`; }
    }
  }

  // ---- status marks over foes ----------------------------------------------------------------------------------------
  const pips = [];
  for (let i = 0; i < MAX_PIPS; i++) {
    const node = el('div', 'rx-pips', layer);
    const slots = [];
    for (let j = 0; j < PIP_SLOTS; j++) { const s = el('span', 'rx-pip', node); slots.push({ s, ic: icon('water', '', s), id: null, k: -1 }); }
    pips.push({ node, slots, on: false, sx: -1, sy: -1, sc: -1 });
  }
  const cand = [], stTmp = [];
  let pipFrame = 0;
  const api = { pips: true };
  function updatePips() {
    const E = G.elements;
    if (!api.pips || !E?.active || !E.statusesOf || G.mode === 'title') { for (const p of pips) if (p.on) { p.on = false; p.node.classList.remove('on'); } return; }
    const cam = G.camera?.position;
    if ((pipFrame++ & 1) === 0 || !cand.length) {
      cand.length = 0;
      for (const r of E.active) {
        if (r.dead || r.owner === G.player || r.team === 'player' || !(r.living || r.kind === 'creature')) continue;
        if (!(r.burning || r.wet || r.frozen || r.shocked || r.muddy || r.chilled)) continue;
        const d = cam ? Math.hypot(r.pos.x - cam.x, r.pos.y - cam.y, r.pos.z - cam.z) : 0;
        if (d > 40) continue;
        r._rxD = d;
        cand.push(r);
      }
      cand.sort((a, b) => a._rxD - b._rxD);
      if (cand.length > MAX_PIPS) cand.length = MAX_PIPS;
    }
    for (let i = 0; i < MAX_PIPS; i++) {
      const p = pips[i], r = cand[i];
      let ok = !!r && !r.dead && project(_v.set(r.pos.x, r.y0 + r.height + 1.05, r.pos.z), _p);
      if (ok) {
        const list = E.statusesOf(r, stTmp);
        if (!list.length) ok = false;
        else {
          for (let j = 0; j < PIP_SLOTS; j++) {
            const q = p.slots[j], st = list[j];
            if (!st) { if (q.id) { q.id = null; q.s.classList.remove('on'); } continue; }
            if (q.id !== st.id) {
              if (q.id) q.s.classList.remove(q.id);
              q.id = st.id; q.s.classList.add('on', st.id);
              q.s.style.setProperty('--sc', STATUS_COLOR[st.id]);
              setIcon(q.ic, STATUS_ICON[st.id]);
            }
            const k = Math.round(clamp(st.t / STATUS_FULL[st.id]) * 24) / 24;
            if (k !== q.k) { q.k = k; q.s.style.setProperty('--k', k); }
          }
          const o = r.owner || r, lift = G.time.real - (o._uiLiftT ?? -9) < 0.25 ? o._uiLift || 0 : 0;   // the plate rose over floating labels (ui/foes.js)
          const sx = Math.round(_p.x), sy = Math.round(_p.y - lift), sc = Math.round(clamp(18 / Math.max(6, _p.d), 0.62, 1.15) * 20) / 20;
          if (sx !== p.sx || sy !== p.sy || sc !== p.sc) { p.sx = sx; p.sy = sy; p.sc = sc; p.node.style.transform = `translate3d(${sx}px,${sy}px,0) translate(-50%,3px) scale(${sc})`; }
        }
      }
      if (ok !== p.on) { p.on = ok; p.node.classList.toggle('on', ok); }
    }
  }

  // ---- discoveries and newly granted magic --------------------------------------------------------------------------
  function onDiscovered(e) {
    const c = COMBOS[e?.id];
    if (!c) return;
    G.ui?.toast?.(t('elements.ui.discovered', { name: name(e.id) }), { icon: c.els[c.els.length - 1], dur: 3.6, color: elCol(c.els[c.els.length - 1]) });
    if (e.total === 1) G.ui?.toast?.(t('elements.ui.first', { key: G.input?.keyLabel?.('journal') || 'J' }), { icon: 'journal', dur: 6 });
    try { G.audio?.sfx?.('ui_chime', { vol: 0.5 }); } catch (err) { /* optional */ }
    // a first discovery gets a held breath: a short slow beat (vfx's duel pacing; off with cinematics off)
    if (G.mode === 'play') { try { G.fx?.duel?.slowmo?.(0.45, 0.12, 0.3); } catch (err) { /* optional */ } }
  }
  const KIT = ['wind', 'water', 'fire', 'ice', 'thunder', 'earth'];
  let snap = null, watchT = 0, pending = [];
  function watchGrants(rdt) {
    if (!G.started || G.mode !== 'play' || !G.state?.spells) return;
    for (let i = pending.length - 1; i >= 0; i--) {
      if ((pending[i].t -= rdt) > 0) continue;
      const q = pending.splice(i, 1)[0];
      G.ui?.toast?.(q.text, { icon: q.icon, dur: q.dur || 5 });
    }
    if ((watchT -= rdt) > 0) return;
    watchT = 0.5;
    const lv = (id) => G.state.spells[id] | 0;
    const castKey = G.input?.keyLabel?.('cast') || '';
    const flags = G.state.flags || (G.state.flags = {});
    if (!snap) {
      snap = {}; for (const id of KIT) snap[id] = lv(id);
      // an older save already past Fran's last lesson: say once what the book gained
      if (flags.majo_named && !flags.elementsKit && !G.params?.allspells) {
        flags.elementsKit = true;
        pending.push({ t: 2.5, text: t('elements.grant.oldSave', { key: castKey }), icon: 'thunder', dur: 7 });
      }
      return;
    }
    let thunder = false, big = false;
    for (const id of KIT) {
      const a = snap[id], b = lv(id);
      if (b <= a) continue;
      snap[id] = b;
      if (id === 'thunder' && a === 0) thunder = true;
      if (b >= 2 && a < 2 && id !== 'earth') big = true;
      G.events.emit('spell:learned', { id, level: b });
    }
    if (thunder || big) {
      flags.elementsKit = true;
      // after the story's own banner has had its moment
      if (thunder) pending.push({ t: 3.5, text: t('elements.grant.thunder'), icon: 'thunder', dur: 6 });
      if (big) pending.push({ t: thunder ? 5 : 3.5, text: t('elements.grant.big', { key: castKey }), icon: 'spells', dur: 7 });
    }
  }

  G.events.on('element:combo', (e) => { try { showCombo(e); } catch (err) { G.reportError('ui:reactions', err); } });
  G.events.on('element:discovered', (e) => { try { onDiscovered(e); } catch (err) { G.reportError('ui:discovered', err); } });
  G.events.on('game:start', () => { snap = null; pending = []; cand.length = 0; for (const k of calls) { k.live = false; k.node.classList.remove('on', 'pop'); } });
  G.events.on('mode:changed', (e) => { if (e?.mode === 'title') { for (const k of calls) { k.live = false; k.node.classList.remove('on', 'pop'); } } });

  return Object.assign(api, {
    root: layer,
    update(rdt) { try { watchGrants(rdt); } catch (e) { G.reportError('ui:grants', e); } },
    late() {
      const show = G.mode === 'play' || G.mode === 'cutscene';
      if (layer._show !== show) { layer._show = show; layer.style.visibility = show ? '' : 'hidden'; }
      if (!show) return;
      try { updateCalls(); updatePips(); } catch (e) { G.reportError('ui:reactions', e); }
    },
    /** what is on screen (tests) */
    debug: () => ({ calls: calls.filter((k) => k.live).map((k) => ({ id: k.id, text: k.nm.textContent + k.mu.textContent, shown: k.node.classList.contains('on') })),
      pips: pips.filter((p) => p.on).map((p) => p.slots.filter((s) => s.id).map((s) => s.id)) }),
  });
}

// ---- the 元素笔记 page (journal tab, see menu.js) ------------------------------------------------------------------------
/** Every combo in book order: discovered ones first within their kind. */
export function notesEntries() {
  const notes = (G.state && G.state.elementNotes) || {};
  const out = [];
  for (const kind of COMBO_KINDS) {
    for (const id of COMBO_IDS) {
      const c = COMBOS[id];
      if (c.kind !== kind) continue;
      out.push({ id, kind, els: c.els, mult: c.mult || 1, known: (notes[id] | 0) > 0, count: notes[id] | 0 });
    }
  }
  return out;
}
export function notesCount() {
  const notes = (G.state && G.state.elementNotes) || {};
  return { n: COMBO_IDS.filter((id) => notes[id]).length, of: COMBO_IDS.length };
}
/** Fill a journal list row for entry q. */
export function noteRow(row, q) {
  const e = el('span', 'els', row);
  for (const x of q.els) { const i = icon(x, '', e); i.style.color = elCol(x); }
  el('span', 'tt', row, q.known ? name(q.id) : t('elements.ui.unknown'));
  tel('span', 'chip kind', row, 'elements.kind.' + q.kind);
}
/** Fill the journal detail pane for entry q. */
export function noteDetail(D, q) {
  D.classList.add('rx-det');
  const g = icon(q.els[q.els.length - 1], 'ghost', D); g.style.color = elCol(q.els[0]);
  const k = el('div', 'kick', D);
  tel('span', '', k, 'elements.kind.' + q.kind);
  if (!q.known) tel('span', '', k, 'elements.ui.unknownKick');
  el('div', 'big', D, q.known ? name(q.id) : t('elements.ui.unknown'));
  const r = el('div', 'rcp', D);
  tel('span', 'lb', r, 'elements.ui.recipe');
  for (const x of q.els) { const i = icon(x, '', r); i.style.color = elCol(x); }
  if (q.known) el('span', '', r, t('elements.combo.' + q.id + '.recipe'));
  if (q.known) {
    el('div', 'txt', D, t('elements.combo.' + q.id + '.desc'));
    if (q.mult > 1.01) tel('div', 'mul', D, 'elements.ui.damage', { m: q.mult });
    tel('div', 'cnt', D, 'elements.ui.times', { n: q.count });
  } else {
    tel('div', 'txt', D, 'elements.kindSub.' + q.kind);
    const h = el('div', 'hint', D);
    tel('b', '', h, 'elements.ui.hint');
    el('span', '', h, t('elements.combo.' + q.id + '.hint'));
  }
  const c = notesCount();
  tel('div', 'prog', D, 'elements.ui.found', { n: c.n, of: c.of });
}
