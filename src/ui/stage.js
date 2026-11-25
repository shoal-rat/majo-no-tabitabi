// Screen-wide dressing that is not part of the HUD proper: damage vignette + low-life pulse, cinematic bars, fades,
// the region banner, toasts and the little "saved" mark.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp } from '../core/util.js';
import { el, tel, setText, replay } from './dom.js';
import { icon, hasIcon } from './icons.js';
import { addCss } from './style.js';
import { stampArt } from './stamps.js';
import { vitals } from './model.js';

addCss(`
/* ---- vignette ---- */
.mv-vig { opacity: 0; will-change: opacity; }
.mv-vig.hit { background: radial-gradient(ellipse at 50% 50%, rgba(160,20,10,0) 46%, rgba(170,24,12,.42) 78%, rgba(120,8,4,.82) 100%); }
.mv-vig.heal { background: radial-gradient(ellipse at 50% 50%, rgba(255,226,160,0) 55%, rgba(255,226,160,.28) 85%, rgba(255,210,120,.5) 100%); }
.mv-vig.low { background: radial-gradient(ellipse at 50% 50%, rgba(120,8,4,0) 52%, rgba(140,14,8,.3) 82%, rgba(110,6,2,.62) 100%); }
.mv-vig.low.on { animation: vig-low 1.15s ease-in-out infinite; }
@keyframes vig-low { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }

/* ---- letterbox ---- */
.mv-lbox i { position: absolute; left: 0; right: 0; height: 11.5%; background: #05070f; transition: transform .7s cubic-bezier(.3,.7,.2,1); }
.mv-lbox i:first-child { top: 0; transform: translateY(-101%); }
.mv-lbox i:last-child { bottom: 0; transform: translateY(101%); }
.mv-lbox.on i { transform: none; }
.mv-lbox i::after { content: ''; position: absolute; left: 0; right: 0; height: 1u; background: linear-gradient(90deg, transparent, var(--brass) 30%, var(--brass) 70%, transparent); opacity: .4; }
.mv-lbox i:first-child::after { bottom: 0; } .mv-lbox i:last-child::after { top: 0; }

/* ---- fade ---- */
.mv-fade { background: #05060d; opacity: 0; will-change: opacity; }

/* ---- place-name card: a journal entry's heading for each new country: a hairline with a star, the serif name, the kai line
   under it, and the region's major name as a round ink entry stamp pressed beside the name ---- */
.mv-banner { display: flex; flex-direction: column; align-items: center; top: 13%; bottom: auto; opacity: 0; visibility: hidden; }
.mv-banner.on { visibility: visible; animation: ban-in 4.6s both; }
@keyframes ban-in { 0% { opacity: 0; } 9% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
.mv-banner::before { content: ''; position: absolute; left: 50%; top: -34u; width: 760u; height: 230u; margin-left: -380u; z-index: -1; pointer-events: none;
  background: radial-gradient(closest-side, rgba(8,12,28,.4), rgba(8,12,28,.2) 55%, rgba(8,12,28,0)); }
.mv-banner .ep { margin-bottom: 6u; font: 600 13u/1.3 var(--fd); letter-spacing: .3em; margin-right: -.3em; color: var(--brass2); text-shadow: var(--halo); }
.mv-banner.on .ep { animation: ban-sub 4.6s both; }
.mv-banner .hd { position: relative; width: 380u; height: 14u; margin-bottom: 6u;
  background: linear-gradient(90deg, rgba(236,217,164,0), rgba(236,217,164,.85) 30%, rgba(236,217,164,.85) 70%, rgba(236,217,164,0)) center / 100% 1u no-repeat; }
.mv-banner .hd::after { content: ''; position: absolute; left: 50%; top: 0; width: 14u; height: 14u; margin-left: -7u; background: var(--brass2); filter: drop-shadow(0 1u 2u rgba(0,0,0,.6));
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.mv-banner.on .hd { animation: ban-rule 4.6s both cubic-bezier(.3,.7,.2,1); }
@keyframes ban-rule { 0%, 4% { clip-path: inset(0 50% 0 50%); } 24%, 100% { clip-path: inset(0 0 0 0); } }
.mv-banner .line { position: relative; display: flex; align-items: center; }
.mv-banner .tt { font: 600 54u/1.2 var(--fd); letter-spacing: .14em; margin-right: -.14em; color: #fffaf0;
  text-shadow: 0 2u 3u rgba(6,8,18,.72), 0 0 20u rgba(6,8,18,.55), 0 0 44u rgba(6,8,18,.32); }
.mv-banner.on .tt { animation: ban-tt 4.6s both cubic-bezier(.2,.7,.2,1); }
@keyframes ban-tt { 0% { letter-spacing: .42em; margin-right: -.42em; } 22% { letter-spacing: .14em; margin-right: -.14em; } }
.mv-banner .stamp { position: absolute; left: 100%; top: 50%; width: 62u; height: 62u; margin: -34u 0 0 14u; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  color: #f27c77; font: 700 15u/1.1 var(--fd); letter-spacing: .1em; text-indent: .1em; box-shadow: inset 0 0 0 2.6u currentColor; opacity: 0;
  filter: drop-shadow(0 0 1u rgba(6,8,18,.85)) drop-shadow(0 1u 4u rgba(6,8,18,.6)); }
.mv-banner .stamp::before { content: ''; position: absolute; inset: 5.5u; border-radius: 50%; border: 1.3u solid currentColor; opacity: .9; }
.mv-banner .stamp::after { content: ''; position: absolute; left: 50%; top: 8u; width: 8u; height: 8u; margin-left: -4u; background: currentColor;
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.mv-banner.on .stamp { animation: ban-stamp 4.6s both; }
.mv-banner .stamp .nm { position: relative; }
/* a registry country: its passport stamp printed on a little parchment ticket, at the stamp's own tilt */
.mv-banner .stamp.art { width: 104u; height: 76u; margin: -42u 0 0 20u; border-radius: 3u; color: var(--ink-c); filter: none;
  background: var(--art) center / 88% auto no-repeat, linear-gradient(180deg, #faf4e6, #ebdec2);
  box-shadow: inset 0 0 0 1u rgba(122,92,46,.4), 0 6u 16u rgba(0,0,0,.38); }
.mv-banner .stamp.art::before, .mv-banner .stamp.art::after { display: none; }
.mv-banner .stamp.art .nm { position: absolute; left: 50%; top: var(--ny, 50%); transform: translate(-50%, -50%); max-width: var(--nw, 70%); white-space: nowrap; overflow: hidden;
  font: 700 11u/1.1 var(--fd); letter-spacing: .04em; text-indent: 0; color: var(--ink-c); opacity: .9; }
.mv-banner.on .stamp.art { animation: ban-ticket 4.6s both; }
@keyframes ban-ticket { 0%, 20% { opacity: 0; transform: rotate(var(--tilt, -6deg)) translateY(-10u) scale(1.3); } 26% { opacity: 1; transform: rotate(var(--tilt, -6deg)) scale(.96); } 30%, 100% { opacity: 1; transform: rotate(var(--tilt, -6deg)) scale(1); } }
@keyframes ban-stamp { 0%, 20% { opacity: 0; transform: rotate(-4deg) scale(1.9); } 25% { opacity: .95; transform: rotate(-14deg) scale(.93); } 29%, 100% { opacity: .96; transform: rotate(-12deg) scale(1); } }
.mv-banner .sub { position: relative; margin-top: 8u; padding: 3u 30u; font: 400 20u/1.4 var(--fb); letter-spacing: .18em; margin-right: -.18em; color: #fff4e0; text-shadow: var(--halo); }
.mv-banner.on .sub { animation: ban-sub 4.6s both; }
@keyframes ban-sub { 0%, 14% { opacity: 0; transform: translateY(6u); } 28%, 100% { opacity: 1; transform: none; } }

/* ---- foe banner (a guardian, a boss, a duel rival; banner(…, { foe: true })): a dark band that fades out at both sides,
   pale-gold hairlines above and below with a four-point star and a diamond, the name large in the display serif (its
   epithet, opts.epithet, smaller in brass before it), the line under it in brass, widely spaced. The rules draw outward,
   the name un-blurs ---- */
.mv-foe { display: flex; flex-direction: column; align-items: center; top: 17%; bottom: auto; opacity: 0; visibility: hidden; }
.mv-foe.on { visibility: visible; animation: foe-in 4.4s both; }
@keyframes foe-in { 0% { opacity: 0; } 5% { opacity: 1; } 84% { opacity: 1; } 100% { opacity: 0; } }
.mv-foe .band { position: relative; display: flex; flex-direction: column; align-items: center; width: min(780u, 100vw); padding: 12u 0 11u;
  background: linear-gradient(90deg, rgba(7,9,22,0), rgba(7,9,22,.64) 23%, rgba(7,9,22,.64) 77%, rgba(7,9,22,0)); }
.mv-foe.on .band { animation: foe-band 4.4s both cubic-bezier(.3,.7,.2,1); }
@keyframes foe-band { 0% { clip-path: inset(0 30% 0 30%); } 18%, 100% { clip-path: inset(0 0 0 0); } }
.mv-foe .rule { position: relative; width: min(460u, 74vw); height: 13u; }
.mv-foe .rule::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 1u; margin-top: -.5u;
  background: linear-gradient(90deg, rgba(236,217,164,0), rgba(236,217,164,.92) 24%, rgba(236,217,164,.92) 76%, rgba(236,217,164,0)); }
.mv-foe .rule::after { content: ''; position: absolute; left: 50%; top: 50%; width: 13u; height: 13u; margin: -6.5u 0 0 -6.5u; background: var(--brass2);
  filter: drop-shadow(0 0 4u rgba(255,226,160,.7)) drop-shadow(0 1u 2u rgba(0,0,0,.7)); -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.mv-foe .rule.bot::after { width: 7u; height: 7u; margin: -3.5u 0 0 -3.5u; -webkit-mask: none; mask: none; transform: rotate(45deg); box-shadow: 0 0 0 2u rgba(7,9,22,.9), 0 0 0 3u rgba(236,217,164,.55); filter: none; }
.mv-foe.on .rule::before { animation: foe-rule 4.4s both cubic-bezier(.3,.7,.2,1); }
@keyframes foe-rule { 0%, 4% { clip-path: inset(0 50% 0 50%); } 26%, 100% { clip-path: inset(0 0 0 0); } }
.mv-foe.on .rule::after { animation: foe-orn 4.4s both; }
.mv-foe.on .rule.bot::after { animation-name: foe-orn2; }
@keyframes foe-orn { 0%, 6% { opacity: 0; transform: scale(.2) rotate(-90deg); } 16% { opacity: 1; transform: scale(1.3) rotate(0); } 22%, 100% { opacity: 1; transform: none; } }
@keyframes foe-orn2 { 0%, 8% { opacity: 0; transform: rotate(45deg) scale(.2); } 18% { opacity: 1; transform: rotate(45deg) scale(1.4); } 24%, 100% { opacity: 1; transform: rotate(45deg); } }
.mv-foe .tt { margin: 4u 0 0; padding: 0 24u; max-width: 100vw; font: 700 44u/1.2 var(--fd); letter-spacing: .12em; margin-right: -.12em; color: #fff8ea; white-space: nowrap;
  text-shadow: 0 2u 4u rgba(4,6,14,.85), 0 0 22u rgba(4,6,14,.55); }
.mv-foe .tt .ep { font-size: .56em; font-weight: 600; letter-spacing: .06em; margin-right: .3em; color: var(--brass2); vertical-align: .2em; }
.mv-foe.on .tt { animation: foe-tt 4.4s both cubic-bezier(.2,.7,.2,1); }
@keyframes foe-tt { 0%, 6% { opacity: 0; filter: blur(14u); letter-spacing: .34em; margin-right: -.34em; } 32%, 100% { opacity: 1; filter: blur(0); letter-spacing: .12em; margin-right: -.12em; } }
.mv-foe .sub { margin: 2u 0 3u; padding: 0 24u; font: 600 13u/1.5 var(--fd); letter-spacing: .42em; margin-right: -.42em; color: var(--brass2); text-shadow: var(--halo); }
.mv-foe.on .sub { animation: foe-sub 4.4s both; }
@keyframes foe-sub { 0%, 24% { opacity: 0; transform: translateY(5u); } 40%, 100% { opacity: .96; transform: none; } }
.mv-ui.touch .mv-foe { top: 12%; }
.mv-ui.touch .mv-foe .band { width: min(600u, 68vw); }

/* ---- toasts: parchment slips; the icon is an ink stamp pressed onto the slip as it arrives ---- */
.mv-toasts { z-index: 8; pointer-events: none; left: 22u; top: 132u; right: auto; bottom: auto; display: flex; flex-direction: column; align-items: flex-start; gap: 8u; }
.mv-toast { position: relative; display: flex; align-items: center; gap: 10u; min-height: 38u; padding: 6u 20u 6u 8u; color: var(--ink); font: 400 14.5u/1.45 var(--fb); letter-spacing: .03em;
  max-width: 400u; border-radius: 4u 18u 18u 4u; background: linear-gradient(90deg, rgba(250,245,233,.97), rgba(238,227,203,.93));
  box-shadow: inset 0 0 0 1u rgba(122,92,46,.45), inset 3u 0 0 var(--wine), 0 6u 16u rgba(4,6,16,.32); animation: toast-in .38s var(--ease) both; }
.mv-toast > * { position: relative; }
.mv-toast .dot { position: relative; width: 28u; height: 28u; border-radius: 50%; flex: none; margin-left: 3u; display: flex; align-items: center; justify-content: center; font-size: 14u;
  color: color-mix(in srgb, var(--tc, #8b3343) 62%, #3a2a20); box-shadow: inset 0 0 0 1.6u currentColor; mix-blend-mode: multiply; animation: toast-stamp .5s .14s both; }
.mv-toast .dot::before { content: ''; position: absolute; inset: 3.5u; border-radius: 50%; border: .8u dashed currentColor; opacity: .8; }
.mv-toast.out { animation: toast-out .32s ease-in both; }
@keyframes toast-in { from { opacity: 0; transform: translateX(-24u); } }
@keyframes toast-out { to { opacity: 0; transform: translateX(-16u); } }
@keyframes toast-stamp { 0% { opacity: 0; transform: scale(1.8) rotate(-4deg); } 60% { opacity: 1; transform: scale(.92) rotate(-13deg); } 100% { opacity: .92; transform: rotate(-10deg); } }

/* ---- saved mark ---- */
.mv-saved { position: absolute; right: 30u; top: 50%; display: flex; align-items: center; gap: 7u; font: 600 13u/1.4 var(--fd); letter-spacing: .14em; color: var(--star); opacity: 0;
  text-shadow: var(--halo); }
.mv-saved .ic { font-size: 15u; color: var(--brass2); }
.mv-saved.on { animation: saved 2.6s both; }
@keyframes saved { 0% { opacity: 0; transform: translateX(10u); } 14%, 78% { opacity: 1; transform: none; } 100% { opacity: 0; } }
`);

const MAX_TOASTS = 4;

export function createStage(root, hudRoot) {
  // order of creation = paint order
  const vigLow = el('div', 'layer mv-vig low', root);
  const vigHit = el('div', 'layer mv-vig hit', root);
  const vigHeal = el('div', 'layer mv-vig heal', root);
  root.appendChild(hudRoot);
  const lbox = el('div', 'layer mv-lbox', root);
  el('i', '', lbox); el('i', '', lbox);
  const fadeEl = el('div', 'layer mv-fade', root);
  const banner = el('div', 'layer mv-banner', root);
  const bEp = el('div', 'ep', banner);       // the episode the country belongs to (opts.episode), over the rule
  el('div', 'hd', banner);
  const bLine = el('div', 'line', banner);
  const bTitle = el('div', 'tt', bLine);
  const bSeal = el('div', 'stamp', bLine);   // the country's passport stamp (opts.country) or the major name (opts.seal)
  const bSealNm = el('span', 'nm', bSeal);
  const bSub = el('div', 'sub', banner);
  const foe = el('div', 'layer mv-foe', root);
  const foeBand = el('div', 'band', foe);
  el('div', 'rule top', foeBand);
  const fTitle = el('div', 'tt', foeBand), fEp = el('span', 'ep', fTitle), fName = el('span', 'nm', fTitle);
  const fSub = el('div', 'sub', foeBand);
  el('div', 'rule bot', foeBand);
  const toasts = el('div', 'layer mv-toasts', root);
  const saved = el('div', 'mv-saved', root);
  icon('brush', '', saved);
  tel('span', '', saved, 'ui.hud.saved');

  let hit = 0, heal = 0, lastHp = null, lowOn = false;
  let fade = { a: 0, from: 0, to: 0, t: 0, dur: 0, res: null };
  const live = [];   // { node, left }
  const queue = [];

  function pushToast(text, opts) {
    const node = el('div', 'mv-toast', toasts);
    const ic = opts.icon;
    if (ic) { const d = el('span', 'dot', node); icon(hasIcon(ic) || String(ic).length <= 2 ? ic : 'star', '', d); if (opts.color) d.style.setProperty('--tc', opts.color); }
    el('span', '', node, text);
    live.push({ node, left: Math.max(0.8, opts.dur ?? 3), out: false });
  }

  const api = {
    /** A slip of paper on the left edge. Extra toasts wait their turn. */
    toast(text, opts = {}) {
      if (text === undefined || text === null || text === '') return;
      const o = typeof opts === 'object' && opts ? opts : {};
      if (live.length >= MAX_TOASTS) { if (queue.length < 12) queue.push([String(text), o]); return; }
      pushToast(String(text), o);
    },
    /** Big place-name card. banner(null) takes it down at once. opts.seal: the region's major name, pressed as an entry stamp.
     *  opts.foe: the foe banner instead (a guardian, a boss, a duel rival waking up); opts.epithet: its title, set smaller. */
    banner(title, subtitle, opts = {}) {
      if (!title) { banner.classList.remove('on'); foe.classList.remove('on'); return; }
      if (opts && opts.foe) {
        const ep = opts.epithet ? String(opts.epithet) : '';
        setText(fEp, ep); fEp.style.display = ep ? '' : 'none';
        setText(fName, String(title));
        setText(fSub, subtitle ? String(subtitle) : ''); fSub.style.display = subtitle ? '' : 'none';
        banner.classList.remove('on');
        replay(foe, 'on');
        return;
      }
      foe.classList.remove('on');
      setText(bTitle, String(title));
      setText(bSub, subtitle ? String(subtitle) : '');
      bSub.style.display = subtitle ? '' : 'none';
      // a country of the registry gets its own stamp (src/ui/stamps.js) on a parchment ticket; else the plain ring
      const country = opts && opts.country, seal = opts && opts.seal;
      const art = country ? stampArt(country) : null;
      bSeal.classList.toggle('art', !!art);
      bSeal.style.display = art || seal ? '' : 'none';
      if (art) {
        bSeal.style.setProperty('--art', art.url); bSeal.style.setProperty('--ink-c', art.ink); bSeal.style.setProperty('--tilt', art.tilt + 'deg');
        bSeal.style.setProperty('--ny', art.nameY + '%'); bSeal.style.setProperty('--nw', art.nameW + '%');
        setText(bSealNm, country.name ? t(country.name) : '');
      } else if (seal) setText(bSealNm, String(seal));
      const ep = opts && opts.episode;
      bEp.style.display = ep ? '' : 'none';
      if (ep) setText(bEp, String(ep));
      replay(banner, 'on');
    },
    /** Fade the whole picture to `alpha` (1 = covered) over `dur` seconds. Optional colour (default near-black). */
    fade(alpha, dur = 0.5, color) {
      if (fade.res) { const r = fade.res; fade.res = null; r(); }
      if (color) fadeEl.style.background = color; else if (alpha > 0 && fade.a <= 0.001) fadeEl.style.background = '';
      fade.from = fade.a; fade.to = clamp(alpha); fade.t = 0; fade.dur = Math.max(0, dur || 0);
      if (fade.dur === 0) { fade.a = fade.to; fadeEl.style.opacity = String(fade.a); return Promise.resolve(); }
      return new Promise((res) => { fade.res = res; });
    },
    get fadeAlpha() { return fade.a; },
    letterbox(on) { lbox.classList.toggle('on', !!on); },
    get letterboxed() { return lbox.classList.contains('on'); },
    /** red flash at the edges (0..1) */
    hurt(k = 0.6) { hit = Math.max(hit, clamp(k)); },
    saved() { replay(saved, 'on'); },

    update(rdt) {
      // fade tween (runs on real time so it also works while the world is paused)
      if (fade.dur > 0 && fade.a !== fade.to) {
        fade.t += rdt;
        const k = clamp(fade.t / fade.dur);
        fade.a = fade.from + (fade.to - fade.from) * (k * k * (3 - 2 * k));
        if (k >= 1) fade.a = fade.to;
        fadeEl.style.opacity = fade.a.toFixed(3);
        if (k >= 1 && fade.res) { const r = fade.res; fade.res = null; r(); }
      } else if (fade.res) { const r = fade.res; fade.res = null; r(); }

      // vignettes follow the life total: no events needed, so they work whoever deals the damage
      const mode = G.mode;
      const active = mode === 'play' || mode === 'talk' || mode === 'cutscene';
      const v = vitals();
      if (lastHp !== null && active) {
        const d = v.hp - lastHp;
        if (d < -0.5) hit = Math.max(hit, clamp(0.35 + (-d / v.maxHp) * 2.2));
        else if (d > 4) heal = Math.max(heal, 0.8);
      }
      lastHp = v.hp;
      if (hit > 0) { hit = Math.max(0, hit - rdt * 1.5); vigHit.style.opacity = hit.toFixed(3); }
      else if (vigHit._z !== 0) { vigHit._z = 0; vigHit.style.opacity = '0'; }
      if (hit > 0) vigHit._z = 1;
      if (heal > 0) { heal = Math.max(0, heal - rdt * 1.3); vigHeal.style.opacity = heal.toFixed(3); vigHeal._z = 1; }
      else if (vigHeal._z !== 0) { vigHeal._z = 0; vigHeal.style.opacity = '0'; }
      const low = active && v.has && !v.dead && v.hp / v.maxHp < 0.3;
      if (low !== lowOn) { lowOn = low; vigLow.classList.toggle('on', low); if (!low) vigLow.style.opacity = ''; }

      // toasts
      for (let i = live.length - 1; i >= 0; i--) {
        const tt = live[i];
        tt.left -= rdt;
        if (!tt.out && tt.left <= 0) { tt.out = true; tt.left = 0.34; tt.node.classList.add('out'); }
        else if (tt.out && tt.left <= 0) { tt.node.remove(); live.splice(i, 1); }
      }
      if (queue.length && live.length < MAX_TOASTS) { const q = queue.shift(); pushToast(q[0], q[1]); }
      const showT = mode !== 'title' && mode !== 'boot';
      if (toasts._s !== showT) { toasts._s = showT; toasts.style.visibility = showT ? '' : 'hidden'; }
    },
  };
  return api;
}

