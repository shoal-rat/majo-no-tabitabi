// Foe plates and the combo meter (combat's UI; ui.js creates it and calls update / late).
//   plates: up to 6 engaged foes near her (and the lock target): name (elites in gold with their title), a brush-stroke
//           hp bar with a trailing ghost, a thin gold posture line that fills as its stance is worn down (full and
//           pulsing while it staggers), the elemental ward as a coloured bar with the element that breaks it,
//           affix chips and a 破绽 tag while a foe is open (status marks are drawn by ui/reactions.js just below).
//   combo:  the chain count, 连击, and the rank word of the fight so far; it pops on rank-ups and fades after the window.
// G.ui.foePlates = true tells enemy.js to hide its old floating 3D bars.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp, damp } from '../core/util.js';
import { UI, el, setText, setOn, replay } from './dom.js';
import { icon, EL_COLOR, hasIcon } from './icons.js';
import { addCss } from './style.js';

addCss(`
.foe-layer { position: absolute; inset: 0; pointer-events: none; }
.foe-plate { position: absolute; left: 0; top: 0; width: 120u; margin-left: -60u; display: none; will-change: transform; text-align: center; }
.foe-plate.on { display: block; }
.foe-plate .nm { font: 600 11u/1.25 var(--fb); letter-spacing: .12em; color: var(--paper); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-shadow: 0 1u 2u rgba(8,6,14,.95), 0 0 5u rgba(8,6,14,.7); }
.foe-plate.elite .nm { color: #ffe08a; font-weight: 700; }
.foe-plate.lock .nm { color: #fff3d0; }
.foe-plate .hp { position: relative; height: 7u; margin: 2u 6u 0; background: rgba(14,12,22,.72); overflow: hidden;
  -webkit-mask: var(--mk-brush1) center / 100% 100% no-repeat; mask: var(--mk-brush1) center / 100% 100% no-repeat; }
.foe-plate .hp i { position: absolute; inset: 0; transform-origin: 0 50%; will-change: transform; }
.foe-plate .hp .ghost { background: rgba(255,238,205,.8); }
.foe-plate .hp .fill { background: linear-gradient(180deg, #ff9a78 0%, #e0503a 50%, #b2301f 100%); }
.foe-plate.elite .hp .fill { background: linear-gradient(180deg, #ffd58a 0%, #e8962e 50%, #b8661a 100%); }
.foe-plate.rally .hp .fill, .foe-plate.elite.rally .hp .fill { background: linear-gradient(180deg, #ffb08a 0%, #f0602e 50%, #c03a14 100%); animation: mv-pulse .8s infinite; }
.foe-plate .ps { position: relative; height: 3u; margin: 1u 14u 0; border-radius: 2u; background: rgba(14,12,22,.55); overflow: hidden; opacity: 0; transition: opacity .25s; }
.foe-plate .ps.on { opacity: 1; }
.foe-plate .ps i { position: absolute; inset: 0; transform-origin: 50% 50%; background: linear-gradient(90deg, #ffe9a8, #ffc65a, #ffe9a8); box-shadow: 0 0 4u rgba(255,206,110,.8); will-change: transform; }
.foe-plate .ps.broke i { animation: mv-pulse .35s infinite; }
.foe-plate .wd { display: none; align-items: center; gap: 3u; margin: 2u 6u 0; }
.foe-plate .wd.on { display: flex; }
.foe-plate .wd .bar { flex: 1; height: 4u; border-radius: 2u; background: rgba(14,12,22,.7); overflow: hidden; position: relative; }
.foe-plate .wd .bar i { position: absolute; inset: 0; transform-origin: 0 50%; background: var(--wc); box-shadow: 0 0 4u var(--wc); }
.foe-plate .wd .ic { font-size: 10u; color: var(--wc); filter: drop-shadow(0 0 2u rgba(0,0,0,.9)); }
.foe-plate .wd .ans { font: 600 9u/1 var(--fb); color: var(--ac); text-shadow: 0 1u 2u rgba(0,0,0,.9); white-space: nowrap; }
.foe-plate .wd.down .bar i { opacity: .25; }
.foe-plate .ch { display: flex; justify-content: center; gap: 3u; margin-top: 2u; height: 13u; }
.foe-plate .ch span { display: none; font: 600 9u/13u var(--fb); padding: 0 4u; border-radius: 6u; background: rgba(14,12,22,.72); color: var(--paper);
  box-shadow: inset 0 0 0 1u currentColor; }
.foe-plate .ch span.on { display: inline-block; }
.foe-plate .ch .st { color: var(--sc); padding: 0 3u; }
.foe-plate .ch .st .ic { font-size: 10u; vertical-align: -1u; }
.foe-plate .ch .ex { color: #ffe7a4; animation: mv-pulse .5s infinite; }
.foe-plate .ch .af { color: #ffd27a; }

.foe-combo { position: absolute; right: 34u; top: 46%; text-align: right; opacity: 0; transition: opacity .35s; }
.foe-combo.on { opacity: 1; }
.foe-combo .n { font: 700 38u/1 var(--ft); color: var(--paper); letter-spacing: .02em;
  text-shadow: 0 2u 3u rgba(8,6,14,.95), 0 0 10u rgba(255,200,120,.35); }
.foe-combo .lb { font: 600 12u/1.2 var(--fb); letter-spacing: .4em; color: var(--gold2); text-shadow: 0 1u 2u rgba(8,6,14,.95); }
.foe-combo .rk { font: 700 17u/1.3 var(--ft); letter-spacing: .3em; color: #ffe08a; text-shadow: 0 1u 3u rgba(8,6,14,.95), 0 0 8u rgba(255,190,90,.5); min-height: 22u; }
.foe-combo .rk.pop { animation: foe-pop .5s cubic-bezier(.2,.8,.2,1.4); }
@keyframes foe-pop { from { transform: scale(1.7); opacity: .2; } }
`);
addCss(`
/* the grimoire look (docs/api/ui.md "Grimoire round"): serif names, capsule bars with a brass hairline, glass chips, a brass combo */
.foe-plate { position: absolute; left: 0; top: 0; width: 124u; margin-left: -62u; display: none; will-change: transform; text-align: center; }
.foe-plate.on { display: block; }
.foe-plate .nm { display: inline-block; max-width: 100%; padding: 2u 12u 3u; font: 600 11u/1.25 var(--fd); letter-spacing: .05em; color: var(--star); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: linear-gradient(180deg, rgba(30,40,74,.92), rgba(14,20,38,.88)); clip-path: polygon(0 0, 100% 0, calc(100% - 6u) 50%, 100% 100%, 0 100%, 6u 50%); text-shadow: none; }
.foe-plate.elite::before { content: ''; position: absolute; left: 50%; top: -13u; width: 13u; height: 13u; margin-left: -6.5u; background: var(--brass2); filter: drop-shadow(0 1u 2u rgba(0,0,0,.7));
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.foe-plate.elite .nm { color: var(--brass2); font-weight: 700; background: linear-gradient(180deg, rgba(74,52,24,.94), rgba(38,26,12,.9)); }
.foe-plate.lock .nm { color: #fff3d6; }
.foe-plate .hp { height: 7u; margin: 3u 6u 0; border-radius: 4u; background: rgba(6,10,24,.8); -webkit-mask: none; mask: none; box-shadow: 0 0 0 1u rgba(236,217,164,.55), 0 1u 4u rgba(0,0,0,.45); }
.foe-plate .hp i { position: absolute; inset: 1u; border-radius: 2u; transform-origin: 0 50%; will-change: transform; }
.foe-plate .hp .ghost { background: rgba(255,240,214,.75); }
.foe-plate .hp .fill { background: linear-gradient(180deg, #ffb7a6 0%, var(--life) 50%, var(--life2) 100%); }
.foe-plate.elite .hp .fill { background: linear-gradient(180deg, #ffe0a0 0%, #e8a23a 50%, #b8701e 100%); }
.foe-plate.elite .hp { box-shadow: inset 0 0 0 1u rgba(236,217,164,.6), 0 0 6u rgba(236,217,164,.25); }
.foe-plate .wd { display: none; align-items: center; gap: 4u; margin: 4u 8u 0; }
.foe-plate .wd.on { display: flex; }
/* the ward (shield) bar, combat type round: a slim rod in the ward's colour between two small diamond caps, quarter ticks,
   and a crack flicker once it is nearly broken */
.foe-plate .wd .bar { flex: 1; height: 3u; margin: 0 4u; border-radius: 0; background: rgba(6,10,24,.78); position: relative; overflow: visible;
  box-shadow: 0 0 0 1u rgba(236,217,164,.42); }
.foe-plate .wd .bar i { position: absolute; inset: 0; transform-origin: 0 50%; box-shadow: 0 0 5u var(--wc);
  background: linear-gradient(180deg, #fff, var(--wc) 55%, color-mix(in srgb, var(--wc) 55%, #10142a)); }
.foe-plate .wd .bar::before, .foe-plate .wd .bar::after { content: ''; position: absolute; top: 50%; width: 5u; height: 5u; margin-top: -2.5u; pointer-events: none;
  background: var(--brass2); transform: rotate(45deg); box-shadow: 0 0 0 1u rgba(8,10,22,.7); }
.foe-plate .wd .bar::before { left: -4u; } .foe-plate .wd .bar::after { right: -4u; }
.foe-plate .wd .bar .tk { position: absolute; left: 0; right: 0; top: -2u; bottom: -2u; pointer-events: none;
  background: linear-gradient(90deg, transparent calc(25% - .5u), rgba(236,217,164,.75) calc(25% - .5u) calc(25% + .5u), transparent calc(25% + .5u) calc(50% - .5u),
    rgba(236,217,164,.75) calc(50% - .5u) calc(50% + .5u), transparent calc(50% + .5u) calc(75% - .5u), rgba(236,217,164,.75) calc(75% - .5u) calc(75% + .5u), transparent calc(75% + .5u)); }
.foe-plate .wd.low .bar i { animation: foe-crack .13s steps(2) infinite; }
@keyframes foe-crack { 50% { opacity: .45; filter: brightness(1.8); } }
.foe-plate .ps.hot i { animation: mv-pulse .3s infinite; }
.foe-plate .wd .ic { font-size: 10u; color: var(--wc); filter: drop-shadow(0 0 2u rgba(0,0,0,.9)); }
.foe-plate .wd .ans { font: 600 9.5u/1 var(--fd); color: var(--ac); text-shadow: 0 1u 2u rgba(0,0,0,.9); white-space: nowrap; }
.foe-plate .wd.down .bar i { opacity: .25; }
.foe-plate .ch { display: flex; justify-content: center; gap: 3u; margin-top: 3u; height: 14u; }
.foe-plate .ch span { display: none; font: 600 9.5u/14u var(--fd); padding: 0 5u; border-radius: 7u; background: rgba(14,20,40,.82); color: var(--star); box-shadow: inset 0 0 0 1u currentColor; }
.foe-plate .ch span.on { display: inline-block; }
.foe-plate .ch .st { color: var(--sc); padding: 0 3u; }
.foe-plate .ch .st .ic { font-size: 10u; vertical-align: -1u; }
.foe-plate .ch .ex { color: #ffe7a4; animation: mv-pulse .5s infinite; }
.foe-plate .ch .af { color: var(--brass2); }

/* the combo meter: a serif count with a brass glow, the label and the rank word */
.foe-combo { position: absolute; right: 34u; top: 46%; text-align: right; opacity: 0; transition: opacity .35s; }
.foe-combo.on { opacity: 1; }
.foe-combo .n { font: 700 40u/1 var(--fd); color: #fffaf0; letter-spacing: .02em; text-shadow: 0 2u 3u rgba(6,8,18,.9), 0 0 14u rgba(236,217,164,.45); }
.foe-combo .lb { margin-top: 2u; font: 600 11.5u/1.2 var(--fd); letter-spacing: .32em; color: var(--brass2); text-shadow: var(--halo); }
.foe-combo .rk { font: 600 17u/1.3 var(--fd); letter-spacing: .2em; color: #ffe3a0; text-shadow: var(--halo), 0 0 10u rgba(255,196,96,.45); min-height: 22u; }
.foe-combo .rk.pop { animation: foe-pop .5s cubic-bezier(.2,.8,.2,1.4); }
@keyframes foe-pop { from { transform: scale(1.7); opacity: .2; } }
`);

const _v = new THREE.Vector3();
const MAX = 6;
const AFFIX_SHOW = 2;
const PLATE_UP = 1.05, TEXT_UP = 0.2;   // the plate's anchor and the floating labels' anchor above the head (m)

/** px the foe plate must rise so the target's floating labels clear it (0 when it has none). */
function liftOver(e, depth, sc, cam) {
  const top = G.fx?.textTop?.(e) || 0;
  if (!(top > 0) || !(depth > 0) || !cam) return 0;
  const focal = UI.h * 0.5 / Math.tan(((cam.fov || 60) * Math.PI) / 360);
  const gap = ((PLATE_UP - TEXT_UP) * focal) / depth;
  return Math.max(0, (G.fx.textPx(top, depth, focal) || 0) - gap + 26 * UI.u * sc);   // + the status marks' row under the plate
}

export function createFoes(root) {
  const layer = el('div', 'foe-layer', root);
  const plates = [];
  for (let i = 0; i < MAX; i++) {
    const p = el('div', 'foe-plate', layer);
    const nm = el('div', 'nm', p);
    const hp = el('div', 'hp', p);
    const ghost = el('i', 'ghost', hp), fill = el('i', 'fill', hp);
    const ps = el('div', 'ps', p), pfill = el('i', '', ps);
    const wd = el('div', 'wd', p);
    const wic = icon('fire', 'ic', wd);
    const wbox = el('div', 'bar', wd), wbar = el('i', '', wbox);
    el('b', 'tk', wbox);
    const ans = el('span', 'ans', wd);
    const ch = el('div', 'ch', p);
    const ex = el('span', 'ex', ch);
    const af = [];
    for (let k = 0; k < AFFIX_SHOW; k++) af.push(el('span', 'af', ch));
    plates.push({ p, nm, ghost, fill, ps, pfill, wd, wic, wbar, ans, ex, af, e: null, f: -1, g: 1, gw: -1, wf: -1, pf: -1, rl: null, br: null, key: '', x: -1, y: -1, s: -1, wel: '', lift: 0 });
  }
  const combo = el('div', 'foe-combo', root);
  const cN = el('div', 'n', combo), cL = el('div', 'lb', combo), cR = el('div', 'rk', combo);
  let comboShown = -1, rankShown = -1;
  const list = [];

  function nameOf(e) {
    let n = t('combat.enemy.' + e.type);
    if ((e.type === 'caster' || e.type === 'raider') && e.data?.el) n = t('combat.plate.mage', { name: n, el: t('core.element.' + e.data.el) });
    if (e.named) n = t('combat.plate.named', { title: t('combat.elite.' + e.named), name: n });
    else if (e.elite && e.affixes?.length) n = t('combat.plate.elite', { affix: t('combat.affix.' + e.affixes[0]), name: n });
    return n;
  }
  function pick() {
    list.length = 0;
    const C = G.combat, P = G.player;
    if (!C || !P || G.mode !== 'play') return list;
    const lt = C.lockTarget;
    for (const e of C.enemies) {
      if (e.dead || e.dormant || e.def.noBar || e.boss) continue;
      const d = e.pos.distanceTo(P.pos);
      const hot = e.aggro || G.time.t - e.lastHitT < 4 || e === lt;
      if (!hot || d > 48) continue;
      list.push({ e, d: e === lt ? -1 : d });
    }
    list.sort((a, b) => a.d - b.d);
    if (list.length > MAX) list.length = MAX;
    return list;
  }
  function bar(pl, frac, rdt) {
    frac = clamp(frac);
    if (pl.g < frac) pl.g = frac; else if (pl.g - frac > 0.001) pl.g = Math.max(frac, pl.g - Math.max(0.05, (pl.g - frac) * 1.6) * rdt); else pl.g = frac;
    const f = Math.round(frac * 200) / 200, g = Math.round(pl.g * 200) / 200;
    if (f !== pl.f) { pl.f = f; pl.fill.style.transform = `scaleX(${f})`; }
    if (g !== pl.gw) { pl.gw = g; pl.ghost.style.transform = `scaleX(${g})`; }
  }
  const api = {
    update(rdt) {
      // combo
      const K = G.combat?.combo;
      const on = !!K && G.mode === 'play' && K.count >= 3 && K.t < 3;
      setOn(combo, on);
      if (on) {
        if (K.count !== comboShown) { comboShown = K.count; setText(cN, String(K.count)); setText(cL, t('combat.combo.label')); }
        if (K.rank !== rankShown) { rankShown = K.rank; setText(cR, K.rankName(K.rank)); if (K.rank > 0) replay(cR, 'pop'); }
      } else if (K && K.rank !== rankShown && K.rank === 0) { rankShown = 0; setText(cR, ''); }
    },
    late(rdt = 0.016) {
      const cam = G.camera;
      const L = pick();
      for (let i = 0; i < MAX; i++) {
        const pl = plates[i], it = L[i];
        if (!it || !cam) { if (pl.e) { pl.e = null; setOn(pl.p, false); } continue; }
        const e = it.e;
        _v.set(e.pos.x, e.pos.y + e.height + 1.05, e.pos.z).applyMatrix4(cam.matrixWorldInverse);
        if (_v.z > -0.3) { setOn(pl.p, false); continue; }
        const depth = -_v.z;
        _v.applyMatrix4(cam.projectionMatrix);
        if (Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { setOn(pl.p, false); continue; }
        setOn(pl.p, true);
        if (pl.e !== e) { pl.e = e; pl.key = ''; pl.f = -1; pl.g = clamp(e.hp / e.maxHp); pl.gw = -1; pl.wf = -1; pl.pf = -1; pl.rl = null; pl.br = null; pl.wel = ''; pl.lift = e._uiLift || 0; }
        const sc = Math.round(clamp(1.25 - depth / 60, 0.72, 1.1) * 20) / 20;
        // the floating labels over this foe take lanes above its head (src/fx/text.js): the plate (and the status marks
        // under it, ui/reactions.js) rise over them instead of covering them, and settle once they are gone
        pl.lift = damp(pl.lift, liftOver(e, depth, sc, cam), 12, rdt);
        e._uiLift = pl.lift; e._uiLiftT = G.time.real;
        const sx = Math.round((_v.x * 0.5 + 0.5) * UI.w), sy = Math.round((-_v.y * 0.5 + 0.5) * UI.h - pl.lift);
        if (sx !== pl.x || sy !== pl.y || sc !== pl.s) { pl.x = sx; pl.y = sy; pl.s = sc; pl.p.style.transform = `translate3d(${sx}px,${sy}px,0) translateY(-100%) scale(${sc})`; }
        const key = e.id + '|' + (e.data?.el || '') + '|' + (G.combat?.lockTarget === e ? 1 : 0);
        if (key !== pl.key) {
          pl.key = key;
          setText(pl.nm, nameOf(e));
          pl.p.classList.toggle('elite', !!e.elite);
          pl.p.classList.toggle('lock', G.combat?.lockTarget === e);
          for (let k = 0; k < AFFIX_SHOW; k++) {
            const a = e.affixes?.[k + (e.named ? 0 : 1)];
            setOn(pl.af[k], !!a);
            if (a) setText(pl.af[k], t('combat.affix.' + a));
          }
          setText(pl.ex, t('combat.exposed'));
        }
        bar(pl, e.hp / e.maxHp, rdt);
        if (pl.rl !== !!e.rallied) { pl.rl = !!e.rallied; pl.p.classList.toggle('rally', pl.rl); }
        // posture: grows from the middle as the stance is worn down; full and pulsing while staggered
        const broke = e._poiseLockT > 0 && e.stunT > 0;
        const pf = broke ? 1 : e.poiseMax > 0 ? Math.round(clamp(1 - e.poise / e.poiseMax) * 50) / 50 : 0;
        if (pf !== pl.pf) { pl.pf = pf; pl.pfill.style.transform = `scaleX(${Math.max(0.001, pf)})`; setOn(pl.ps, pf > 0.02); pl.ps.classList.toggle('hot', pf > 0.8 && pf < 1); }
        if (pl.br !== broke) { pl.br = broke; pl.ps.classList.toggle('broke', broke); }
        // ward
        const w = e.ward;
        setOn(pl.wd, !!w);
        if (w) {
          if (pl.wel !== w.el) {
            pl.wel = w.el;
            pl.wd.style.setProperty('--wc', EL_COLOR[w.el] || '#fff');
            const c = G.combat?.counterOf?.(w.el)?.[0] || '';
            pl.wd.style.setProperty('--ac', EL_COLOR[c] || '#fff');
            if (hasIcon(w.el)) { pl.wic.remove(); pl.wic = icon(w.el, 'ic', pl.wd); pl.wd.insertBefore(pl.wic, pl.wd.firstChild); }
            setText(pl.ans, c ? t('combat.ward.resist', { el: t('core.element.' + c) }) : '');
          }
          const wf = Math.round(clamp(w.hp / w.max) * 100) / 100;
          if (wf !== pl.wf) { pl.wf = wf; pl.wbar.style.transform = `scaleX(${Math.max(0.001, w.hp > 0 ? wf : clamp(1 - w.downT / w.regen))})`; }
          pl.wd.classList.toggle('down', w.hp <= 0);
          pl.wd.classList.toggle('low', w.hp > 0 && wf < 0.25);
          if (w.hp <= 0) pl.wbar.style.transform = `scaleX(${Math.max(0.001, clamp(1 - w.downT / w.regen)).toFixed(2)})`;
        }
        setOn(pl.ex, e.exposedT > 0);
      }
    },
  };
  return api;
}
