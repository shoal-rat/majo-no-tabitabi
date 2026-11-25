// The HUD: vitals, compass, markers, quest tracker, counters, the selected 灵诀 with the 「契」 ring, crosshair + charge ring,
// lock-on reticle, boss / duel bar, beam-struggle bar, interact prompt and key hints.
// It reads live state every frame through ./model.js (safe when the player / spells do not exist yet) and only touches
// the DOM when a value actually changed.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp, damp } from '../core/util.js';
import { UI, el, tel, clear, key, keycap, setText, setOn, replay } from './dom.js';
import { icon, setIcon, EL_COLOR, STATUS, STATUS_ICON, hasIcon } from './icons.js';
import { addCss } from './style.js';
import { vitals, spellSlots, selectedId, gauge, charge, inv, ability, cooldownLeft } from './model.js';

addCss(`
.mv-hud { opacity: 0; transition: opacity .35s; }
.mv-hud.show { opacity: 1; }
.mv-hud .cg { transition: opacity .3s; }
.mv-hud.calm .cg { opacity: 0; }
.mv-hud.wheel .hud-cross, .mv-hud.wheel .hud-pin, .mv-hud.wheel .hud-prompt { opacity: 0; }
.mv-hud .tsh { text-shadow: var(--halo); }

/* ---- vitals: a crest — the little sky in a brass-rimmed medallion, life and mana as arcs round it (the Moon slides over
   the Sun as the Veil deepens); the numbers beside it. It rests (dims, numbers fade) while she is whole and out of a fight ---- */
.hud-vit { position: absolute; left: 22u; top: 16u; display: flex; align-items: center; gap: 8u; transition: opacity .6s; }
.hud-vit.rest { opacity: .5; }
.hud-vit.rest .bars { opacity: 0; transform: translateX(-6u); }
.hud-crest { position: relative; width: 96u; height: 96u; flex: none; filter: drop-shadow(0 2u 6u rgba(0,0,0,.4)); }
.hud-crest .arcs { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.hud-crest .arcs path { fill: none; stroke-linecap: round; }
.hud-crest .arcs .trk { stroke: rgba(6,10,24,.62); stroke-dasharray: none; }
.hud-crest .arcs .life.trk { stroke-width: 7.5; } .hud-crest .arcs .mana.trk { stroke-width: 4.6; }
.hud-crest .arcs .ghost, .hud-crest .arcs .fill { stroke-dasharray: 100 200; stroke-dashoffset: 0; }
.hud-crest .arcs .life.ghost { stroke: rgba(255,240,214,.72); stroke-width: 5; }
.hud-crest .arcs .life.fill { stroke: var(--life); stroke-width: 5; filter: drop-shadow(0 0 2u rgba(232,104,92,.55)); }
.hud-crest .arcs .mana.ghost { stroke: rgba(220,236,255,.55); stroke-width: 2.8; }
.hud-crest .arcs .mana.fill { stroke: var(--mana); stroke-width: 2.8; filter: drop-shadow(0 0 2u rgba(120,178,255,.55)); }
.hud-crest::before { content: ''; position: absolute; inset: 15u; border-radius: 50%; background: var(--brass2); opacity: .95;
  -webkit-mask: var(--mk-astro) center / contain no-repeat; mask: var(--mk-astro) center / contain no-repeat; }
.hud-crest::after { content: ''; position: absolute; left: 50%; bottom: 1u; width: 15u; height: 15u; margin-left: -7.5u; background: var(--brass2);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; filter: drop-shadow(0 1u 2u rgba(0,0,0,.6)); }
.hud-orb { position: absolute; inset: 21u; border-radius: 50%; background: radial-gradient(circle at 50% 32%, #304472 0%, #151d38 60%, #0a0f20 100%);
  box-shadow: inset 0 0 0 1u rgba(236,217,164,.55), inset 0 0 10u rgba(0,0,0,.5); }
.hud-orb .in { position: absolute; inset: 6u; border-radius: 50%; overflow: hidden; }
.hud-orb .sun { position: absolute; left: 50%; top: 50%; width: 20u; height: 20u; margin: -10u; border-radius: 50%;
  background: radial-gradient(circle, #fffbea 0%, #ffe39a 55%, #ffbf62 100%); box-shadow: 0 0 8u 3u rgba(255,206,120,.7), 0 0 18u 7u rgba(255,180,90,.25); }
.hud-orb .moon { position: absolute; left: 50%; top: 50%; width: 21u; height: 21u; margin: -10.5u; border-radius: 50%; background: #0b1024;
  box-shadow: inset -2u -2u 5u rgba(140,160,240,.42); will-change: transform; }
.hud-vit .bars { display: flex; flex-direction: column; gap: 2u; transition: opacity .6s, transform .6s; }
.hud-vit .row { display: flex; align-items: baseline; gap: 5u; }
.hud-vit .life .num { font: 700 22u/1 var(--fd); color: #fff4ef; letter-spacing: .01em; }
.hud-vit .life .of { font: 600 9u/1 var(--fd); letter-spacing: .06em; color: rgba(236,217,164,.62); }
.hud-vit .mana .num { font: 600 13u/1 var(--fd); color: #cfe3ff; }
.hud-vit .mana::before { content: ''; width: 7u; height: 7u; margin-right: 2u; align-self: center; background: var(--mana); -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.hud-vit.low .arcs .life.fill { animation: mv-pulse .7s infinite; }
.hud-vit.low .life .num { color: #ffb0a6; }
.hud-vit .status { display: flex; gap: 6u; margin-top: 5u; min-height: 21u; }
.hud-vit .st { display: none; align-items: center; gap: 4u; height: 21u; padding: 0 9u 0 6u; border-radius: 11u; background: var(--glass2);
  box-shadow: inset 0 0 0 1u currentColor; font: 600 11.5u/21u var(--fd); letter-spacing: .08em; animation: hud-st-in .25s cubic-bezier(.2,.8,.2,1.4); }
.hud-vit .st.on { display: inline-flex; }
.hud-vit .st .ic { font-size: 13u; }
.hud-vit .st span { color: var(--star); }
@keyframes hud-st-in { from { transform: scale(.5); opacity: 0; } }

/* ---- compass: a ribbon banner with swallowtail ends (border-image), the bearing strip sliding behind a 400u window ---- */
.hud-compass { position: absolute; left: 50%; top: 12u; width: 476u; height: 40u; margin-left: -238u;
  border: solid transparent; border-width: 12u 46u; border-image: var(--fr-ribbon) 12 46 fill / 12u 46u stretch; filter: drop-shadow(0 2u 5u rgba(0,0,0,.35)); }
.hud-compass .win { position: absolute; left: -8u; right: -8u; top: -12u; bottom: -12u; overflow: hidden;
  -webkit-mask: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); mask: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent); }
.hud-compass .ctr { position: absolute; left: 50%; top: 0; bottom: 0; width: 400u; margin-left: -200u; }
.hud-compass .strip { position: absolute; left: 0; top: 0; height: 100%; will-change: transform; }
.hud-compass .tk { position: absolute; top: 24u; width: 1u; height: 5u; margin-left: -.5u; background: rgba(255,247,232,.55); }
.hud-compass .tk.m { top: 15u; width: 8u; height: 8u; margin-left: -4u; background: var(--brass2);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.hud-compass .card { position: absolute; top: 7u; width: 26u; margin-left: -13u; text-align: center; font: 700 15.5u/26u var(--fd); color: var(--star); text-shadow: var(--halo); }
.hud-compass .card.n { color: #ffa597; }
.hud-compass .needle { position: absolute; left: 50%; top: -20u; width: 12u; height: 12u; margin-left: -6u; background: var(--brass2); filter: drop-shadow(0 1u 1u rgba(0,0,0,.7));
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.hud-compass .needle::after { content: ''; position: absolute; left: 50%; top: 40u; margin-left: -4u; border: 4u solid transparent; border-top: 0; border-bottom: 6u solid var(--brass2); }
.hud-compass .mk { position: absolute; left: 0; top: 8u; width: 20u; height: 20u; margin-left: -10u; border-radius: 50%; background: radial-gradient(circle at 50% 35%, #26355c, #0d1328 75%);
  display: none; align-items: center; justify-content: center; font-size: 11.5u; box-shadow: 0 0 0 1.2u currentColor, 0 1u 3u rgba(0,0,0,.5); will-change: transform; }
.hud-compass .mk.on { display: flex; }
.hud-compass .mk.edge { opacity: .5; }

/* ---- boss / duel: serif name, a capsule bar between two stars ---- */
.hud-boss { position: absolute; left: 50%; top: 62u; width: 500u; margin-left: -250u; text-align: center; opacity: 0; transform: translateY(-8u); transition: opacity .4s, transform .4s; }
.hud-boss.on { opacity: 1; transform: none; }
.hud-boss .nm { display: inline-block; min-width: 220u; padding: 0 8u; font: 700 20u/1.3 var(--fd); letter-spacing: .2em; color: var(--star);
  border: solid transparent; border-width: 12u 46u; border-image: var(--fr-ribbon) 12 46 fill / 12u 46u stretch; margin: -8u 0 -4u; }
.hud-boss .sub { font: 600 11.5u/1.5 var(--fd); letter-spacing: .3em; margin-right: -.3em; color: var(--brass2); opacity: .92; }
.hud-boss .wrap { position: relative; margin-top: 8u; padding: 0 24u; }
/* combat type round: a slim rod between two diamond caps, ticks every tenth above and below, a gleam at the leading edge */
.hud-boss .wrap::before, .hud-boss .wrap::after { content: ''; position: absolute; top: 50%; width: 12u; height: 12u; margin-top: -6u; transform: rotate(45deg);
  background: linear-gradient(135deg, #fff3d0, var(--brass) 55%, var(--brass3)); box-shadow: 0 0 0 1u rgba(8,10,22,.75), 0 1u 4u rgba(0,0,0,.5); }
.hud-boss .wrap::before { left: 7u; } .hud-boss .wrap::after { right: 7u; }
.hud-boss .hud-bar { position: relative; height: 6u; background: rgba(6,10,24,.8); box-shadow: 0 0 0 1u rgba(236,217,164,.72), 0 2u 6u rgba(0,0,0,.45); }
.hud-boss .hud-bar i { position: absolute; inset: 0; transform-origin: 0 50%; will-change: transform; }
.hud-boss .hud-bar .ghost { background: rgba(255,240,214,.78); }
.hud-boss .hud-bar::after { content: ''; position: absolute; left: 0; right: 0; top: -5u; bottom: -5u; pointer-events: none;
  background: repeating-linear-gradient(90deg, rgba(236,217,164,.7) 0 1u, transparent 1u 10%) top / 100% 3u no-repeat,
    repeating-linear-gradient(90deg, rgba(236,217,164,.7) 0 1u, transparent 1u 10%) bottom / 100% 3u no-repeat; }
.hud-boss .gl { position: absolute; left: 24u; top: 50%; width: 0; height: 0; will-change: transform; pointer-events: none; }
.hud-boss .gl::before { content: ''; position: absolute; left: -1u; top: -11u; width: 2u; height: 22u; background: linear-gradient(180deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0));
  box-shadow: 0 0 7u 1u rgba(255,236,200,.75); }
.hud-boss .fill { background: linear-gradient(180deg, #ffc2b2, #e05848 50%, #9c2a26); box-shadow: inset 0 1u 0 rgba(255,255,255,.35); }
.hud-boss.duel .fill { background: linear-gradient(180deg, #fff2cc, var(--bc, #d8a646) 55%, #8c6a22); }
.hud-boss.shade .fill { background: linear-gradient(180deg, #ddc8ff, #8a5fd8 50%, #4b2c93); }
.hud-boss.low .hud-bar { animation: hud-shiver .12s steps(2) infinite; }

/* ---- top right: the purse coin, then the objective as an inked card (it folds to its title when nothing changes) ---- */
.hud-tr { position: absolute; right: 22u; top: 18u; display: flex; flex-direction: column; align-items: flex-end; }
.hud-count { display: flex; align-items: center; gap: 6u; height: 28u; padding: 0 13u 0 5u; border-radius: 14u; color: var(--star);
  background: linear-gradient(180deg, rgba(28,38,68,.84), rgba(12,18,36,.78)); box-shadow: inset 0 0 0 1u var(--hair), 0 2u 6u rgba(0,0,0,.3);
  font: 700 14.5u/28u var(--fd); letter-spacing: .02em; text-shadow: none; }
.hud-count .ic { width: 20u; height: 20u; padding: 3u; font-size: 14u; border-radius: 50%; color: #2a1f12; background: radial-gradient(circle at 40% 34%, #fff3cf, var(--brass) 70%); }
.hud-count.bump { animation: hud-bump .35s; }
@keyframes hud-bump { 30% { transform: scale(1.16); } }
.hud-tracker { position: relative; margin-top: 12u; width: 290u; padding: 11u 16u 11u 18u; text-align: left; color: var(--ink); border-radius: 4u 10u 10u 4u;
  background: linear-gradient(180deg, rgba(250,245,233,.94), rgba(236,224,198,.92)); box-shadow: inset 0 0 0 1u rgba(122,92,46,.45), inset 3u 0 0 var(--wine), 0 6u 16u rgba(4,6,16,.35);
  opacity: 0; transform: translateX(12u); transition: opacity .4s, transform .4s; text-shadow: none; }
.hud-tracker.on { opacity: 1; transform: none; }
.mv-hud .hud-tracker.lb { opacity: 0; }
.hud-tracker::before { content: ''; position: absolute; right: 12u; top: -7u; width: 14u; height: 26u; background: linear-gradient(90deg, #6a2231, var(--wine2) 48%, #74283a);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%); }
.hud-tracker::after { content: ''; position: absolute; inset: 4u; border: 1u solid rgba(148,113,47,.28); border-radius: 2u 7u 7u 2u; pointer-events: none; }
.hud-tracker .tt { padding-right: 18u; font: 700 15.5u/1.35 var(--fd); letter-spacing: .04em; color: var(--ink); }
.hud-tracker .ob, .hud-tracker .pg, .hud-tracker .pb { transition: opacity .5s, max-height .5s, margin .5s; max-height: 80u; }
.hud-tracker .ob { margin-top: 4u; font: 400 15u/1.5 var(--fb); letter-spacing: .03em; color: var(--ink2); }
.hud-tracker .pg { margin-top: 3u; font: 700 12.5u/1.3 var(--fd); color: var(--brass3); letter-spacing: .04em; }
.hud-tracker .pb { position: relative; display: none; margin: 7u 0 0; width: 100%; height: 4u; background: rgba(42,36,30,.12); border-radius: 2u; overflow: hidden; }
.hud-tracker .pb.on { display: block; }
.hud-tracker .pb i { position: absolute; inset: 0; background: linear-gradient(90deg, var(--brass3), var(--brass)); transform-origin: 0 50%; }
.hud-tracker.rest { opacity: .82; }
.hud-tracker.rest .ob, .hud-tracker.rest .pg, .hud-tracker.rest .pb { max-height: 0; opacity: 0; margin-top: 0; overflow: hidden; }
.hud-tracker.flash { animation: hud-flash 1s; }
@keyframes hud-flash { 0% { box-shadow: inset 0 0 0 1u rgba(122,92,46,.45), inset 3u 0 0 var(--wine), 0 0 0 3u rgba(236,217,164,.8), 0 6u 16u rgba(4,6,16,.35); } }

/* ---- crosshair ---- */
.hud-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; color: var(--star); }
.hud-cross .dot { position: absolute; left: -2u; top: -2u; width: 4u; height: 4u; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 1u rgba(8,10,22,.6); }
.hud-cross .tick { position: absolute; background: currentColor; box-shadow: 0 0 0 1u rgba(8,10,22,.45); border-radius: 1u; transition: transform .12s; }
.hud-cross .t1, .hud-cross .t2 { left: -.6u; width: 1.2u; height: 6u; } .hud-cross .t1 { top: -14u; } .hud-cross .t2 { top: 8u; }
.hud-cross .t3, .hud-cross .t4 { top: -.6u; height: 1.2u; width: 6u; } .hud-cross .t3 { left: -14u; } .hud-cross .t4 { left: 8u; }
.hud-cross.hot { color: #ffa597; }
.hud-cross.hot .t1 { transform: translateY(3u); } .hud-cross.hot .t2 { transform: translateY(-3u); } .hud-cross.hot .t3 { transform: translateX(3u); } .hud-cross.hot .t4 { transform: translateX(-3u); }
.hud-cross svg { position: absolute; left: -27u; top: -27u; width: 54u; height: 54u; transform: rotate(-90deg); opacity: 0; transition: opacity .15s; overflow: visible; }
.hud-cross.charging svg { opacity: 1; }
.hud-cross circle { fill: none; stroke-width: 3; }
.hud-cross .trk { stroke: rgba(8,10,22,.45); }
.hud-cross .arc { stroke: var(--cc, #ecd9a4); stroke-linecap: round; }
.hud-cross.full svg { animation: hud-full .5s infinite alternate; }
@keyframes hud-full { to { filter: drop-shadow(0 0 5u var(--cc, #ecd9a4)) brightness(1.3); } }

/* ---- lock-on: four fine rose brackets turning slowly, a star on top ---- */
.hud-lock { position: absolute; left: 0; top: 0; width: 0; height: 0; display: none; will-change: transform; }
.hud-lock.on { display: block; }
.hud-lock .sq { position: absolute; left: -28u; top: -28u; width: 56u; height: 56u; animation: mv-spin 7s linear infinite; }
.hud-lock .sq i { position: absolute; width: 12u; height: 12u; border: 2u solid #ff9a8e; filter: drop-shadow(0 0 2u rgba(0,0,0,.8)); }
.hud-lock .sq i:nth-child(1) { left: 0; top: 0; border-right: 0; border-bottom: 0; border-top-left-radius: 4u; }
.hud-lock .sq i:nth-child(2) { right: 0; top: 0; border-left: 0; border-bottom: 0; border-top-right-radius: 4u; }
.hud-lock .sq i:nth-child(3) { left: 0; bottom: 0; border-right: 0; border-top: 0; border-bottom-left-radius: 4u; }
.hud-lock .sq i:nth-child(4) { right: 0; bottom: 0; border-left: 0; border-top: 0; border-bottom-right-radius: 4u; }
.hud-lock::before { content: ''; position: absolute; left: -5u; top: -42u; width: 10u; height: 10u; background: #ffb4a8; filter: drop-shadow(0 0 2u rgba(0,0,0,.8));
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; }
.hud-lock .hp { position: absolute; left: -26u; top: 36u; width: 52u; height: 4u; background: rgba(6,10,24,.7); border-radius: 2u; overflow: hidden; box-shadow: inset 0 0 0 1u rgba(236,217,164,.22); }
.hud-lock .hp i { position: absolute; inset: 0; background: linear-gradient(90deg, var(--life2), var(--life)); transform-origin: 0 50%; }

/* ---- world markers: a glass coin with the kind's rim; the name in the serif, the steps below, all on the soft halo ---- */
.hud-pin { position: absolute; left: 0; top: 0; width: 0; height: 0; display: none; will-change: transform; }
.hud-pin.on { display: block; }
.hud-pin .disc { position: absolute; left: -15u; top: -15u; width: 30u; height: 30u; border-radius: 50%; background: radial-gradient(circle at 50% 34%, #2a3a64, #0d1328 75%);
  box-shadow: 0 0 0 1.5u currentColor, 0 0 10u -2u currentColor, 0 2u 6u rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; font-size: 16u; }
.hud-pin .ds { position: absolute; left: -40u; top: 18u; width: 80u; text-align: center; font: 600 12.5u/1.3 var(--fd); letter-spacing: .02em; color: #fff3da; white-space: nowrap; }
.hud-pin .lb { position: absolute; left: -130u; top: -42u; width: 260u; text-align: center; font: 600 16u/1.25 var(--fd); letter-spacing: .06em; color: var(--star);
  white-space: nowrap; opacity: var(--mv-yield, 1); }
.hud-pin .ar { position: absolute; left: -24u; top: -24u; width: 48u; height: 48u; display: none; }
.hud-pin .ar::before { content: ''; position: absolute; left: 50%; top: -3u; margin-left: -5u; border: 5u solid transparent; border-top: 0; border-bottom: 8u solid currentColor; filter: drop-shadow(0 0 1.5u rgba(0,0,0,.9)); }
.hud-pin.edge .ar { display: block; }
.hud-pin.edge .lb { display: none; }
.hud-pin.near { opacity: .4; }
.hud-pin.tuck .lb { display: none; }

/* ---- beam struggle (combat type round): a slim rod between two diamond caps, clock ticks above and below, her gold
   pushing from the left against the violet, a gleam where the two beams meet, a crack flickering there when either side is
   about to break; the title small and widely spaced in brass, the mash key a brass-rimmed night key ---- */
.hud-struggle { position: absolute; left: 50%; top: 61%; width: 500u; margin-left: -250u; text-align: center; opacity: 0; transform: scale(.94); transition: opacity .2s, transform .25s cubic-bezier(.2,.8,.2,1.5); }
.hud-struggle.on { opacity: 1; transform: none; }
.hud-struggle .ttl { display: flex; align-items: center; justify-content: center; gap: 12u; font: 700 15u/1.2 var(--fd); letter-spacing: .6em; margin-right: -.6em; color: var(--brass2); }
.hud-struggle .ttl::before, .hud-struggle .ttl::after { content: ''; width: 46u; height: 1u; background: linear-gradient(90deg, rgba(236,217,164,0), rgba(236,217,164,.8)); }
.hud-struggle .ttl::after { transform: scaleX(-1); margin-right: .6em; }
.hud-struggle .wrap { position: relative; margin: 11u 0 12u; padding: 0 18u; }
.hud-struggle .track { position: relative; height: 5u; background: linear-gradient(180deg, #c3adff, #7650e0 45%, #3b2089);
  box-shadow: 0 0 0 1u rgba(236,217,164,.75), 0 0 12u rgba(130,90,240,.45), 0 2u 6u rgba(0,0,0,.45); }
.hud-struggle .mine { position: absolute; inset: 0; background: linear-gradient(180deg, #fffdf0, #ffd98a 45%, #d8922e); box-shadow: 0 0 9u rgba(255,206,110,.6);
  transform-origin: 0 50%; will-change: transform; }
.hud-struggle .tk { position: absolute; left: 18u; right: 18u; top: -6u; bottom: -6u; pointer-events: none;
  background: linear-gradient(90deg, transparent calc(50% - .75u), rgba(255,247,232,.95) calc(50% - .75u) calc(50% + .75u), transparent calc(50% + .75u)) center / 100% 100% no-repeat,
    repeating-linear-gradient(90deg, rgba(236,217,164,.75) 0 1u, transparent 1u 12.5%) top / 100% 3u no-repeat,
    repeating-linear-gradient(90deg, rgba(236,217,164,.75) 0 1u, transparent 1u 12.5%) bottom / 100% 3u no-repeat; }
.hud-struggle .cap { position: absolute; top: 50%; width: 13u; height: 13u; margin-top: -6.5u; transform: rotate(45deg);
  background: linear-gradient(135deg, #fff3d0, var(--brass) 55%, var(--brass3)); box-shadow: 0 0 0 1u rgba(8,10,22,.75), 0 1u 4u rgba(0,0,0,.5); }
.hud-struggle .cap::after { content: ''; position: absolute; inset: 3.5u; background: #ffd98a; box-shadow: 0 0 5u #ffd98a; }
.hud-struggle .cap.l { left: 2u; } .hud-struggle .cap.r { right: 2u; }
.hud-struggle .cap.r::after { background: #9b73ff; box-shadow: 0 0 5u #9b73ff; }
.hud-struggle .spark { position: absolute; left: 18u; top: 50%; width: 0; height: 0; will-change: transform; }
.hud-struggle .spark::before { content: ''; position: absolute; left: -1u; top: -16u; width: 2u; height: 32u;
  background: linear-gradient(180deg, rgba(255,255,255,0), #fff 50%, rgba(255,255,255,0)); box-shadow: 0 0 8u 2u rgba(255,236,190,.8); animation: hud-gleam .14s infinite alternate; }
.hud-struggle .spark::after { content: ''; position: absolute; left: -9u; top: -9u; width: 18u; height: 18u; background: #fff; filter: drop-shadow(0 0 6u #ffe6a8) drop-shadow(0 0 3u #fff);
  -webkit-mask: var(--mk-star) center / contain no-repeat; mask: var(--mk-star) center / contain no-repeat; animation: hud-spark .9s linear infinite; }
@keyframes hud-gleam { to { transform: scaleY(1.25); opacity: .8; } }
@keyframes hud-spark { to { transform: rotate(90deg); } }
.hud-struggle .crk { position: absolute; left: -9u; top: -11u; width: 18u; height: 22u; opacity: 0; pointer-events: none;
  background: linear-gradient(180deg, #fff, #ffe3b0); clip-path: polygon(46% 0, 58% 0, 50% 30%, 70% 44%, 46% 70%, 56% 100%, 44% 100%, 34% 66%, 54% 46%, 34% 30%); }
.hud-struggle.edge .crk { animation: hud-crack .13s steps(2) infinite; }
.hud-struggle.edge.lose .crk { background: linear-gradient(180deg, #ffd2c4, #ff7a5a); }
.hud-struggle.edge.lose .track { animation: hud-shiver .1s steps(2) infinite; }
@keyframes hud-crack { 0% { opacity: .95; transform: scale(1, 1); } 100% { opacity: .2; transform: scale(-1, 1.15); } }
@keyframes hud-shiver { 50% { transform: translateX(1u); box-shadow: 0 0 0 1u rgba(255,170,140,.9), 0 0 12u rgba(255,90,70,.55), 0 2u 6u rgba(0,0,0,.45); } }
.hud-struggle .hint { display: inline-flex; align-items: center; gap: 9u; font: 600 13u/24u var(--fd); letter-spacing: .3em; color: var(--brass2); }
.hud-struggle .hint .keycap { min-width: 40u; height: 24u; padding: 0 10u; border-radius: 12u; font: 700 12u/24u var(--fd); letter-spacing: .08em; color: var(--brass2);
  background: radial-gradient(circle at 50% 30%, #34477c, #121a33 78%); box-shadow: 0 0 0 1.2u var(--brass), 0 0 10u rgba(236,217,164,.35), 0 2u 4u rgba(0,0,0,.4);
  animation: hud-mash .18s infinite alternate; }
@keyframes hud-mash { to { transform: translateY(1.5u) scale(.93); box-shadow: 0 0 0 1.2u var(--brass2), 0 0 16u rgba(255,226,160,.6), 0 1u 2u rgba(0,0,0,.4); } }

/* ---- interact prompt: a parchment pill with the key in a night medallion ---- */
.hud-prompt { position: absolute; left: 50%; bottom: 150u; transform: translate(-50%, 8u); display: flex; align-items: center; gap: 10u; padding: 5u 22u 5u 5u; opacity: 0;
  transition: opacity .18s, transform .18s; white-space: nowrap; border-radius: 22u; color: var(--ink);
  background: linear-gradient(180deg, rgba(250,245,233,.96), rgba(236,224,198,.94)); box-shadow: inset 0 0 0 1u rgba(122,92,46,.5), inset 0 0 0 4u rgba(250,245,233,.6), inset 0 0 0 5u rgba(148,113,47,.22), 0 6u 16u rgba(4,6,16,.35); }
.hud-prompt.on { opacity: 1; transform: translate(-50%, 0); }
.hud-prompt .keycap { min-width: 32u; height: 32u; border-radius: 16u; font-size: 13u; line-height: 32u; color: var(--brass2);
  background: radial-gradient(circle at 50% 34%, #34477c, #121a33 75%); box-shadow: 0 0 0 1.2u var(--brass), 0 2u 4u rgba(0,0,0,.3); }
.hud-prompt .tx { font: 700 15.5u/1.4 var(--fd); letter-spacing: .06em; color: var(--ink); }

/* ---- key hints (they rest after a while on the same set) ---- */
.hud-hints { position: absolute; left: 22u; bottom: 22u; display: flex; flex-direction: column; gap: 6u; transition: opacity .8s; }
.hud-hints.rest { opacity: .28; }
.hud-hints .h { display: flex; align-items: center; gap: 9u; font: 400 13.5u/22u var(--fb); letter-spacing: .06em; color: var(--star); }
.hud-hints .ride { display: none; align-items: center; gap: 7u; margin-bottom: 4u; height: 26u; padding: 0 12u 0 9u; border-radius: 13u; align-self: flex-start;
  background: linear-gradient(180deg, rgba(28,38,68,.84), rgba(12,18,36,.78)); box-shadow: inset 0 0 0 1u var(--hair2); font: 600 12.5u/26u var(--fd); letter-spacing: .14em; color: var(--brass2); }
.hud-hints .ride.on { display: inline-flex; }
.hud-hints .ride .ic { font-size: 15u; }

/* ---- the spell dial: the selected magic as a medallion with the brass gauge ring, every magic as a glyph pip on an arc ---- */
.hud-spell { position: absolute; right: 30u; bottom: 24u; display: flex; align-items: flex-end; gap: 62u; transition: opacity .8s; }
.hud-spell.rest { opacity: .62; }
.hud-dango { display: flex; align-items: center; gap: 6u; height: 30u; padding: 0 6u 0 7u; border-radius: 15u; margin-bottom: 30u; color: var(--star);
  background: linear-gradient(180deg, rgba(28,38,68,.84), rgba(12,18,36,.78)); box-shadow: inset 0 0 0 1u var(--hair), 0 2u 6u rgba(0,0,0,.3); font: 700 14u/30u var(--fd); }
.hud-dango .ic { font-size: 20u; }
.hud-dango.none { opacity: .5; }
.hud-trio { position: relative; width: 84u; height: 84u; margin-bottom: 26u; }
.hud-trio .pips { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.hud-trio .pip { position: absolute; left: -11u; top: -11u; width: 22u; height: 22u; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12u; color: var(--sc, #fff7e8);
  transform: rotate(var(--a)) translate(66u) rotate(calc(var(--a) * -1)) scale(.36); background: rgba(236,217,164,.55); transition: transform .25s var(--ease), background .2s, box-shadow .2s; }
.hud-trio .pip .ic { opacity: 0; transition: opacity .2s; }
.hud-trio .pip.on { transform: rotate(var(--a)) translate(66u) rotate(calc(var(--a) * -1)); background: radial-gradient(circle at 50% 34%, #2a3a64, #0d1328 75%);
  box-shadow: inset 0 0 0 1u rgba(236,217,164,.4), 0 1u 4u rgba(0,0,0,.45); }
.hud-trio .pip.on .ic { opacity: .9; filter: drop-shadow(0 0 3u var(--sc)); }
.hud-trio .pip.sel { transform: rotate(var(--a)) translate(66u) rotate(calc(var(--a) * -1)) scale(1.2); box-shadow: inset 0 0 0 1.5u var(--sc), 0 0 10u -1u var(--sc), 0 1u 4u rgba(0,0,0,.45); }
.hud-trio .pips.few { display: none; }
.hud-sp { position: relative; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: var(--sc, #fff7e8); }
.hud-sp.main { position: absolute; inset: 0; font-size: 40u; background: radial-gradient(circle at 50% 30%, #33477a 0%, #151d38 58%, #0a0f20 100%);
  box-shadow: inset 0 0 0 1.5u rgba(236,217,164,.6), inset 0 0 0 6u rgba(10,15,32,.55), inset 0 0 0 7u rgba(236,217,164,.25), 0 4u 14u rgba(0,0,0,.45); }
.hud-sp.main::before { content: ''; position: absolute; inset: 10u; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--sc, #fff) 30%, transparent), transparent 70%); pointer-events: none; }
.hud-sp.main::after { content: ''; position: absolute; inset: -14u; border-radius: 50%; background: var(--brass2); opacity: .4; pointer-events: none;
  -webkit-mask: var(--mk-astro) center / contain no-repeat; mask: var(--mk-astro) center / contain no-repeat; }
.hud-sp.main .ic { position: relative; filter: drop-shadow(0 0 7u var(--sc, transparent)); transition: opacity .2s; }
.hud-sp.main.dry .ic { opacity: .4; filter: none; }
.hud-sp.main .cdw { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; opacity: 0; transition: opacity .15s;
  background: conic-gradient(rgba(6,8,18,.72) calc(var(--cd, 0) * 360deg), transparent 0); }
.hud-sp.main.cooling .cdw { opacity: 1; }
.hud-sp.main.swap { animation: hud-swap .3s cubic-bezier(.2,.8,.2,1.5); }
@keyframes hud-swap { from { transform: scale(.75) rotate(-25deg); } }
.hud-sp.main svg.ring { position: absolute; left: -8u; top: -8u; width: 100u; height: 100u; transform: rotate(-90deg); overflow: visible; }
.hud-sp.main svg.ring circle { fill: none; stroke-width: 3.2; }
.hud-sp.main svg.ring .trk { stroke: rgba(236,217,164,.2); stroke-width: 1.6; }
.hud-sp.main svg.ring .arc { stroke: var(--brass2); stroke-linecap: round; filter: drop-shadow(0 0 2u rgba(236,217,164,.6)); }
.hud-sp.main.ready svg.ring { animation: hud-ready 1.1s infinite; }
@keyframes hud-ready { 50% { filter: drop-shadow(0 0 6u #ecd9a4) drop-shadow(0 0 12u #ffbf62); } }
.hud-sp .kei { position: absolute; right: -8u; top: -8u; width: 26u; height: 26u; border-radius: 50%; color: var(--brass2); text-align: center;
  background: radial-gradient(circle at 50% 34%, #2a3a64, #0d1328 75%); box-shadow: 0 0 0 1.2u var(--brass2), 0 1u 4u rgba(0,0,0,.5); font: 700 12u/26u var(--fd); }
.hud-sp.main.ready .kei { background: linear-gradient(180deg, #fff3cf, var(--brass)); color: var(--ink); }
.hud-sp .ult { position: absolute; left: 50%; top: -40u; transform: translateX(-50%); display: none; align-items: center; gap: 6u; white-space: nowrap; font: 600 12.5u/22u var(--fd); letter-spacing: .12em; color: var(--brass2); }
.hud-sp.main.ready .ult { display: flex; animation: mv-bob 1s infinite; }
.hud-spell .cap { position: absolute; left: 50%; bottom: -26u; transform: translateX(-50%); text-align: center; white-space: nowrap; font: 700 14u/20u var(--fd); letter-spacing: .1em; color: var(--star); }
.hud-spell .cap .cost { margin-left: 8u; font: 600 11.5u/20u var(--fd); letter-spacing: .02em; color: #a9cfff; }
.hud-spell .cap .cost .ic { font-size: 11.5u; margin-right: 2u; }
.hud-spell .cap.dim { opacity: .75; letter-spacing: .08em; font-size: 13u; }
`);

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const PPD = 2.4;                 // compass: design px per degree
const RAD2DEG = 180 / Math.PI;
const KIND_ICON = { quest: 'quest', lantern: 'lantern', npc: 'npc', shop: 'shop', boss: 'eye', save: 'brush', race: 'flag', chest: 'chest', great: 'greatlantern' };
const KIND_COLOR = { quest: '#ffe2a0', lantern: '#ffc27a', npc: '#f3e9d4', shop: '#ffe2a0', boss: '#ff8a6a', save: '#bcd9ff', race: '#8ee6ab', chest: '#ffe2a0', great: '#ffd77c' };
const SVGNS = 'http://www.w3.org/2000/svg';

function ringSvg(cls, r) {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '-50 -50 100 100');
  if (cls) s.setAttribute('class', cls);
  const mk = (c) => { const e = document.createElementNS(SVGNS, 'circle'); e.setAttribute('r', r); e.setAttribute('class', c); s.appendChild(e); return e; };
  mk('trk');
  const arc = mk('arc');
  const len = 2 * Math.PI * r;
  arc.setAttribute('stroke-dasharray', len.toFixed(2));
  arc.setAttribute('stroke-dashoffset', len.toFixed(2));
  s._arc = arc; s._len = len; s._v = -1;
  return s;
}
function setRing(s, v) {
  v = Math.round(clamp(v) * 200) / 200;
  if (s._v === v) return;
  s._v = v;
  s._arc.setAttribute('stroke-dashoffset', (s._len * (1 - v)).toFixed(2));
}

function makeBar(parent) {
  const bar = el('div', 'hud-bar', parent);
  const ghost = el('i', 'ghost', bar), fill = el('i', 'fill', bar);
  return { bar, ghost, fill, f: -1, g: 1, gw: -1, w: -1 };
}
/** Fill follows at once; the pale ghost trails behind when the value drops. */
function setBar(b, frac, rdt) {
  frac = clamp(frac);
  if (b.g < frac) b.g = frac; else if (b.g - frac > 0.001) b.g = Math.max(frac, b.g - Math.max(0.05, (b.g - frac) * 1.6) * rdt); else b.g = frac;
  const f = Math.round(frac * 500) / 500, g = Math.round(b.g * 500) / 500;
  if (f !== b.f) { b.f = f; b.fill.style.transform = `scaleX(${f})`; }
  if (g !== b.gw) { b.gw = g; b.ghost.style.transform = `scaleX(${g})`; }
}
function setWidth(b, wU) { wU = Math.round(wU); if (b.w !== wU) { b.w = wU; b.bar.style.width = `calc(var(--u)*${wU})`; } }

// the crest's gauges: 270-degree arcs over the top (from bottom-left round to bottom-right); pathLength 100 makes the dash
// offset the empty share in percent. Fill follows at once, the pale ghost trails behind a drop (as the bars did).
function arcPath(r) {
  const a = Math.PI * 0.75, x = (r * Math.sin(a)).toFixed(2), y = (r * Math.cos(a)).toFixed(2);
  return `M${-x} ${-y}A${r} ${r} 0 1 1 ${x} ${-y}`;
}
function makeArc(svg, r, cls) {
  const mk = (c) => { const e = document.createElementNS(SVGNS, 'path'); e.setAttribute('d', arcPath(r)); e.setAttribute('pathLength', '100'); e.setAttribute('class', cls + ' ' + c); svg.appendChild(e); return e; };
  mk('trk');
  const ghost = mk('ghost'), fill = mk('fill');
  return { ghost, fill, f: -1, g: 1, gw: -1 };
}
function setArc(b, frac, rdt) {
  frac = clamp(frac);
  if (b.g < frac) b.g = frac; else if (b.g - frac > 0.001) b.g = Math.max(frac, b.g - Math.max(0.05, (b.g - frac) * 1.6) * rdt); else b.g = frac;
  const f = Math.round(frac * 400) / 4, g = Math.round(b.g * 400) / 4;
  if (f !== b.f) { b.f = f; b.fill.style.strokeDashoffset = String(100 - f); }
  if (g !== b.gw) { b.gw = g; b.ghost.style.strokeDashoffset = String(100 - g); }
}

export function createHud(root) {
  const R = el('div', 'layer mv-hud', root);

  // ---------------- vitals ----------------
  // a crest: the little sky (sun / moon) in a brass-rimmed medallion, life and mana as two arcs round it
  const vit = el('div', 'hud-vit cg tsh', R);
  const crest = el('div', 'hud-crest', vit);
  const arcSvg = document.createElementNS(SVGNS, 'svg');
  arcSvg.setAttribute('viewBox', '-50 -50 100 100'); arcSvg.setAttribute('class', 'arcs');
  crest.appendChild(arcSvg);
  const life = makeArc(arcSvg, 45, 'life'), mana = makeArc(arcSvg, 37.5, 'mana');
  const orb = el('div', 'hud-orb', crest);
  const orbIn = el('div', 'in', orb);
  el('i', 'sun', orbIn);
  const moon = el('i', 'moon', orbIn);
  const bars = el('div', 'bars', vit);
  const lifeRow = el('div', 'row life', bars), lifeNum = el('span', 'num', lifeRow);
  const lifeOf = el('span', 'of', lifeRow);
  const restT = { vit: 0, hint: 0, tr: 0, dial: 0 };   // seconds each part has had nothing new to say
  const manaRow = el('div', 'row mana', bars), manaNum = el('span', 'num', manaRow);
  const statusRow = el('div', 'status', bars);
  const statusEl = {};
  for (const s of STATUS) {
    const b = el('span', 'st', statusRow);
    b.style.color = EL_COLOR[STATUS_ICON[s]];
    icon(STATUS_ICON[s], '', b);
    tel('span', '', b, 'core.status.' + s);
    statusEl[s] = b;
  }

  // ---------------- compass ----------------
  // a ribbon banner (border-image) holding a 400u window that the strip slides behind
  const compass = el('div', 'hud-compass cg', R);
  const cwin = el('div', 'win', compass);
  const cctr = el('div', 'ctr', cwin);   // a 400u frame centred in the window: the bearing maths stays in its units
  const strip = el('div', 'strip', cctr);
  for (let a = -90; a <= 450; a += 15) {
    const x = (a + 90) * PPD;
    const n = ((a % 360) + 360) % 360;
    let e;
    if (n % 90 === 0) { const k = ['n', 'e', 's', 'w'][n / 90]; e = tel('span', 'card ' + k, strip, 'ui.compass.' + k); }
    else e = el('i', n % 45 === 0 ? 'tk m' : 'tk', strip);
    e.style.left = `calc(var(--u)*${x.toFixed(1)})`;
  }
  const compassMarks = el('div', '', cctr);
  el('i', 'needle', compass);
  let lastStripX = 1e9;

  // ---------------- boss / duel ----------------
  const boss = el('div', 'hud-boss tsh', R);
  const bossName = el('div', 'nm', boss), bossSub = el('div', 'sub', boss);
  const bossWrap = el('div', 'wrap', boss);
  const bossBar = makeBar(bossWrap), bossGl = el('i', 'gl', bossWrap);
  let bossData = null, bossFrac = 1;

  // ---------------- top right ----------------
  const tr = el('div', 'hud-tr', R);
  const dust = el('div', 'hud-count cg tsh', tr);
  icon('stardust', '', dust);
  const dustNum = el('span', '', dust, '0');
  let dustShown = -1, dustReal = -1;
  const tracker = el('div', 'hud-tracker tsh', tr);
  const trTitle = el('div', 'tt', tracker), trObj = el('div', 'ob', tracker), trProg = el('div', 'pg', tracker);
  const trBar = el('div', 'pb', tracker), trBarFill = el('i', '', trBar);
  let trackerKey = '';

  // ---------------- markers (world pins) ----------------
  const pins = el('div', 'layer cg', R);
  let markers = [];
  const pool = new Map();   // id -> { m, cm, pin, disc, ds, lb, ar, seen, distShown, st }

  // ---------------- crosshair ----------------
  const cross = el('div', 'hud-cross cg', R);
  const chargeRing = ringSvg('', 44);
  cross.appendChild(chargeRing);
  el('i', 'dot', cross);
  for (let i = 1; i <= 4; i++) el('i', 'tick t' + i, cross);

  // ---------------- lock-on ----------------
  const lock = el('div', 'hud-lock cg', R);
  const lockSq = el('div', 'sq', lock);
  for (let i = 0; i < 4; i++) el('i', '', lockSq);
  const lockHp = el('i', '', el('div', 'hp', lock));
  let lockHpV = -1;

  // ---------------- struggle ----------------
  const strg = el('div', 'hud-struggle tsh', R);
  tel('div', 'ttl', strg, 'ui.hud.struggle');
  const strgWrap = el('div', 'wrap', strg);
  const strgMine = el('i', 'mine', el('div', 'track', strgWrap));
  el('i', 'tk', strgWrap); el('i', 'cap l', strgWrap); el('i', 'cap r', strgWrap);
  const strgSpark = el('i', 'spark', strgWrap);
  el('i', 'crk', strgSpark);
  const strgHint = el('div', 'hint', strg);
  let strgTarget = null, strgV = 0.5, strgHintKey = '';

  // ---------------- prompt ----------------
  const prompt = el('div', 'hud-prompt', R);
  const promptKey = keycap('', prompt), promptTx = el('span', 'tx', prompt);
  let promptText = null;

  // ---------------- hints ----------------
  const hints = el('div', 'hud-hints cg tsh', R);
  const ride = el('div', 'ride', hints);
  const rideIc = icon('broom', '', ride), rideTx = el('span', '', ride);
  const hintList = el('div', '', hints);
  hintList.style.cssText = 'display:flex;flex-direction:column;gap:inherit';
  let hintKey = '', rideKey = '';

  // ---------------- spell cluster ----------------
  const spell = el('div', 'hud-spell cg tsh', R);
  const dango = el('div', 'hud-dango', spell);
  icon('dango', '', dango);
  const dangoNum = el('span', '', dango, '0');
  const dangoKey = keycap('', dango, 'sm');
  // the dial: the selected magic as a medallion, every magic as a glyph pip on an arc above-left of it (unknown: a faint dot)
  const trio = el('div', 'hud-trio', spell);
  const pipsEl = el('div', 'pips', trio);
  const pips = [];
  for (let i = 0; i < 8; i++) { const p = el('i', 'pip', pipsEl); const ic = icon('lock', '', p); p.style.setProperty('--a', (162 + i * (124 / 7)).toFixed(1) + 'deg'); pips.push({ p, ic, id: '', on: null, sel: null }); }
  const spMain = el('div', 'hud-sp main', trio), spMainIc = icon('lock', '', spMain);
  const cdw = el('div', 'cdw', spMain);
  let cdLast = -1;
  const gaugeRing = ringSvg('ring', 47);
  spMain.appendChild(gaugeRing);
  tel('span', 'kei', spMain, 'ui.hud.gauge');
  const ult = el('div', 'ult', spMain);
  const ultKey = keycap('', ult, 'sm');
  tel('span', '', ult, 'ui.hud.gaugeReady');
  const cap = el('div', 'cap', trio);
  const capName = el('span', '', cap), capCost = el('span', 'cost', cap);
  icon('spirit', '', capCost);
  const capCostN = el('span', '', capCost);
  let spellKey = '', lastSel = null;

  function relabel() {
    setText(dangoKey, key('heal'));
    setText(ultKey, key('ultimate'));
    hintKey = ''; rideKey = ''; spellKey = ''; strgHintKey = ''; trackerKey = '';
    for (const p of pool.values()) p.distShown = -1;
    if (promptText) api.prompt(promptText, true);
    if (trackerData) api.setTracker(trackerData);
    if (bossData) { setText(bossName, bossData.name || ''); setText(bossSub, bossData.sub || ''); }
  }

  // ---------------- hints ----------------
  function buildHints(v, known) {
    const on = G.settings ? G.settings.hints !== false : true;
    const k = !on ? 'off' : v.onBroom ? 'broom' : v.gliding ? 'glide' : `g${known}${ability('guard') ? 'G' : ''}${ability('broom') ? 'B' : ''}`;
    if (k === hintKey) return;
    hintKey = k;
    restT.hint = 0;
    clear(hintList);
    if (!on) return;
    const add = (action, textKey) => { const h = el('div', 'h', hintList); keycap(key(action), h); tel('span', '', h, 'ui.hint.' + textKey); };
    if (v.onBroom) { add('jump', 'ascend'); add('descend', 'descend'); add('sprint', 'boost'); add('broom', 'dismount'); }
    else if (v.gliding) { add('jump', 'glide'); }
    else {
      add('attack', 'attack');
      if (known > 0) add('cast', 'cast');
      add('dodge', 'dodge');
      if (ability('guard')) add('guard', 'guard');
      if (ability('broom')) add('broom', 'broom');
      if (known > 1) add('wheel', 'wheel');
    }
  }

  // ---------------- spell cluster ----------------
  function updateSpell(v) {
    const slots = spellSlots();
    let sel = selectedId();
    let known = 0, selIdx = -1, mask = 0;
    for (let i = 0; i < slots.length; i++) { if (slots[i].level > 0) { known++; mask |= 1 << i; } if (slots[i].id === sel) selIdx = i; }
    if (selIdx >= 0 && slots[selIdx].level <= 0) selIdx = -1;
    const s = selIdx >= 0 ? slots[selIdx] : null;
    const k = `${selIdx}|${mask}|${s ? s.name + s.cost : ''}`;
    if (k !== spellKey) {
      spellKey = k;
      if (selIdx >= 0) { setIcon(spMainIc, slots[selIdx].id); spMain.style.setProperty('--sc', slots[selIdx].color); }
      else { setIcon(spMainIc, 'lock'); spMain.style.setProperty('--sc', '#8a7d70'); }
      for (let i = 0; i < pips.length; i++) {
        const pp = pips[i], sl = slots[i], on = !!sl && sl.level > 0, sel = i === selIdx;
        if (pp.on !== on) { pp.on = on; pp.p.classList.toggle('on', on); }
        if (pp.sel !== sel) { pp.sel = sel; pp.p.classList.toggle('sel', sel); }
        if (on && pp.id !== sl.id) { pp.id = sl.id; setIcon(pp.ic, sl.id); pp.p.style.setProperty('--sc', sl.color); }
      }
      pipsEl.classList.toggle('few', known < 2);
      if (s) {
        cap.classList.remove('dim');
        setText(capName, s.name);
        capCost.style.display = s.cost > 0 ? '' : 'none';
        setText(capCostN, String(s.cost));
      } else {
        cap.classList.add('dim');
        setText(capName, t(known > 0 ? 'ui.hud.locked' : 'ui.hud.noSpell'));
        capCost.style.display = 'none';
      }
      if (lastSel !== null && (s ? s.id : '') !== lastSel) { replay(spMain, 'swap'); restT.dial = 0; }
      lastSel = s ? s.id : '';
    }
    setOn2(spMain, 'dry', !!s && s.cost > 0 && v.mana < s.cost);
    // cooldown sweep (big forms and other long cooldowns)
    const cdf = s ? Math.round(cooldownLeft(s) * 60) / 60 : 0;
    if (cdf !== cdLast) { cdLast = cdf; cdw.style.setProperty('--cd', String(cdf)); setOn2(spMain, 'cooling', cdf > 0); }
    const g = gauge();
    setRing(gaugeRing, g);
    setOn2(spMain, 'ready', g >= 0.999 && !!G.state?.abilities?.kinkan); // play-test: no "G 金环已满" before she holds 金环
    // charge ring around the crosshair, tinted with the element
    const c = charge();
    setOn2(cross, 'charging', c > 0.02);
    setOn2(cross, 'full', c >= 0.999);
    if (c > 0.02) {
      setRing(chargeRing, c);
      const col = s ? s.color : '#ffe2a0';
      if (cross._cc !== col) { cross._cc = col; cross.style.setProperty('--cc', col); }
    }
    return known;
  }
  function setOn2(node, cls, on) {
    const k = '_' + cls;
    if (node[k] !== on) { node[k] = on; node.classList.toggle(cls, on); }
  }

  // ---------------- markers ----------------
  function colorOf(m) { return m.color || KIND_COLOR[m.kind] || '#f3e9d4'; }
  function iconOf(m) { return m.icon && (hasIcon(m.icon) || String(m.icon).length <= 2) ? m.icon : KIND_ICON[m.kind] || 'pin'; }
  // marker layers: setMarkers(list, layer='main') replaces only that layer (race rings use 'race', quests 'main')
  const layers = new Map();
  const defIds = [];
  function setMarkers(list, layer = 'main') {
    layers.set(String(layer || 'main'), Array.isArray(list) ? list : []);
    markers = []; defIds.length = 0;
    for (const [ln, l] of layers) for (let j = 0; j < l.length; j++) { markers.push(l[j]); defIds.push(ln === 'main' ? 'm' + j : ln + ':' + j); }
    for (const p of pool.values()) p.seen = false;
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (!m || !m.pos) continue;
      const id = m.id !== undefined && m.id !== null ? String(m.id) : defIds[i];
      let p = pool.get(id);
      if (!p) {
        const cm = el('i', 'mk', compassMarks);
        const cmIc = icon('pin', '', cm);
        const pin = el('div', 'hud-pin tsh', pins);
        const ar = el('i', 'ar', pin);
        const disc = el('div', 'disc', pin);
        const pinIc = icon('pin', '', disc);
        const lb = el('div', 'lb', pin), ds = el('div', 'ds', pin);
        p = { cm, cmIc, pin, ar, disc, pinIc, lb, ds, distShown: -1, st: '', cst: '' };
        pool.set(id, p);
      }
      p.m = m; p.seen = true;
      const col = colorOf(m), ic = iconOf(m);
      if (p.col !== col) { p.col = col; p.cm.style.color = col; p.pin.style.color = col; }
      setIcon(p.cmIc, ic); setIcon(p.pinIc, ic);
      setText(p.lb, m.label || '');
    }
    for (const [id, p] of pool) if (!p.seen) { p.cm.remove(); p.pin.remove(); pool.delete(id); }
  }

  function updateCompass(heading) {
    const u = UI.u;
    const x = Math.round((200 - (heading + 90) * PPD) * u * 2) / 2;
    if (x !== lastStripX) { lastStripX = x; strip.style.transform = `translate3d(${x}px,0,0)`; }
  }

  let trRect = null;
  function projectMarkers(heading) {
    const cam = G.camera;
    const w = UI.w, h = UI.h, u = UI.u;
    const fp = (G.player && G.player.pos) || cam.position;
    const frame = G.time.frame;
    // play-test: in a duel the rival is the only goal on screen, so the quest pin over her is noise; a pin's label that lands
    // under the tracker (top right) is tucked away so the two lines of text never print over each other
    const inDuel = !!G.combat?.duel;
    if ((frame & 15) === 0 || trRect === null) { const r = tracker.getBoundingClientRect(); trRect = r.width > 0 && tracker.classList.contains('on') ? r : false; }
    for (const p of pool.values()) {
      const m = p.m, mp = m.pos;
      const dx = mp.x - fp.x, dz = mp.z - fp.z;
      const dist = Math.hypot(dx, dz);
      // compass
      let diff = Math.atan2(dx, -dz) * RAD2DEG - heading;
      diff = ((diff + 540) % 360) - 180;
      const lim = 78;
      const edge = Math.abs(diff) > lim;
      const cx = Math.round((200 + clamp(diff, -lim, lim) * PPD) * u * 2) / 2;
      const cst = cx + (edge ? 'e' : '');
      if (p.cst !== cst) {
        p.cst = cst;
        p.cm.style.transform = `translate3d(${cx}px,0,0)`;
        if (p.cmOn !== true) { p.cmOn = true; p.cm.classList.add('on'); }
        if (p.cmEdge !== edge) { p.cmEdge = edge; p.cm.classList.toggle('edge', edge); }
      }
      // world pin
      const tracked = m.kind === 'quest' || m.kind === 'boss' || m.track === true;
      const range = m.range || (tracked ? Infinity : 70);
      if (dist > range || dist < 2.5 || (inDuel && m.kind === 'quest')) { if (p.st !== 'off') { p.st = 'off'; p.pin.classList.remove('on'); } continue; }
      const my = typeof mp.y === 'number' ? mp.y : G.world.groundAt(mp.x, mp.z);
      _v.set(mp.x, my + (m.lift ?? 2.4), mp.z).applyMatrix4(cam.matrixWorldInverse);
      let nx, ny, on = false;
      if (_v.z < -0.2) {
        _v.applyMatrix4(cam.projectionMatrix);
        nx = _v.x; ny = _v.y;
        on = Math.abs(nx) < 0.9 && ny < 0.82 && ny > -0.72;
      } else {
        const l = Math.hypot(_v.x, _v.y);
        if (l < 1e-4) { nx = 0; ny = -4; } else { nx = (_v.x / l) * 4; ny = (_v.y / l) * 4 - 0.6; }
      }
      if (!on) {
        if (!tracked) { if (p.st !== 'off') { p.st = 'off'; p.pin.classList.remove('on'); } continue; }
        const k = Math.max(Math.abs(nx) / 0.9, ny > 0 ? ny / 0.82 : -ny / 0.72, 1e-6);
        nx /= k; ny /= k;
        // touch controls (src/ui/touch.js): the thumbs' buttons fill the lower corners and the right edge; edge pins stay above them
        if (UI.touch) { nx = clamp(nx, -0.74, 0.74); if (ny < 0.2) ny = 0.2; }
      }
      const sx = Math.round((nx * 0.5 + 0.5) * w);
      let sy = Math.round((-ny * 0.5 + 0.5) * h);
      // a pin that would sit on the tracker text (top right) drops just below it, label tucked away
      const tuck = !!trRect && sx > trRect.left - 80 * u && sy - 44 * u < trRect.bottom && sy > trRect.top - 40 * u;
      if (tuck) sy = Math.round(trRect.bottom + 22 * u);
      const st = on ? 'on' : 'edge';
      if (p.st !== st) { p.st = st; p.pin.classList.add('on'); p.pin.classList.toggle('edge', !on); }
      const near = on && Math.abs(sx - w / 2) < 46 * u && Math.abs(sy - h / 2) < 46 * u;
      if (p.near !== near) { p.near = near; p.pin.classList.toggle('near', near); }
      if (p.sx !== sx || p.sy !== sy) { p.sx = sx; p.sy = sy; p.pin.style.transform = `translate3d(${sx}px,${sy}px,0)`; }
      if (p.tuck !== tuck) { p.tuck = tuck; p.pin.classList.toggle('tuck', tuck); }
      if (!on) {
        const a = Math.round(Math.atan2(sx - w / 2, -(sy - h / 2)) * RAD2DEG);
        if (p.ang !== a) { p.ang = a; p.ar.style.transform = `rotate(${a}deg)`; }
      }
      if ((frame & 7) === 0) {
        const dn = dist < 100 ? Math.round(dist) : Math.round(dist / 10) * 10;
        if (p.distShown !== dn) { p.distShown = dn; setText(p.ds, t('ui.hud.dist', { n: dn })); }
      }
    }
  }

  function updateLock() {
    const tg = G.combat && G.combat.lockTarget;
    if (!tg || tg.dead || !tg.pos) { setOn(lock, false); return; }
    const cam = G.camera;
    _v.set(tg.pos.x, tg.pos.y + (tg.height || 1.4) * 0.55, tg.pos.z).applyMatrix4(cam.matrixWorldInverse);
    if (_v.z > -0.2) { setOn(lock, false); return; }
    const depth = -_v.z;
    _v.applyMatrix4(cam.projectionMatrix);
    if (Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { setOn(lock, false); return; }
    setOn(lock, true);
    const sx = Math.round((_v.x * 0.5 + 0.5) * UI.w), sy = Math.round((-_v.y * 0.5 + 0.5) * UI.h);
    const sc = clamp(((tg.radius || 0.6) * 2.4 * UI.h) / (depth * 1.15 * 56 * UI.u), 0.7, 2.6);
    const scr = Math.round(sc * 20) / 20;
    if (lock._sx !== sx || lock._sy !== sy || lock._sc !== scr) {
      lock._sx = sx; lock._sy = sy; lock._sc = scr;
      lock.style.transform = `translate3d(${sx}px,${sy}px,0) scale(${scr})`;
    }
    const f = typeof tg.hp === 'number' && tg.maxHp > 0 ? Math.round(clamp(tg.hp / tg.maxHp) * 50) / 50 : 1;
    if (f !== lockHpV) { lockHpV = f; lockHp.style.transform = `scaleX(${f})`; }
  }

  // ---------------- tracker ----------------
  let trackerData = null;

  const api = {
    root: R,
    relabel,
    get bossOn() { return !!bossData; },
    setWheel(on) { if (R._wh !== on) { R._wh = on; R.classList.toggle('wheel', on); } },
    setMarkers,
    get markers() { return markers; },
    /** key cap + verb at the bottom of the screen; the core passes "E  调查". */
    prompt(text, force) {
      if (text === promptText && !force) return;
      promptText = text || null;
      if (!promptText) { prompt.classList.remove('on'); return; }
      const m = /^(\S{1,6})\s{2,}(.+)$/.exec(promptText);
      promptKey.style.display = m ? '' : 'none';
      if (m) setText(promptKey, m[1]);
      setText(promptTx, m ? m[2] : promptText);
      prompt.classList.add('on');
    },
    setTracker(d) {
      trackerData = d || null;
      if (!d) { tracker.classList.remove('on'); trackerKey = ''; return; }
      let pg = '', frac = -1;
      const p = d.progress;
      if (typeof p === 'string') pg = p;
      else if (typeof p === 'number') { frac = clamp(p); }
      else if (p && typeof p === 'object') {
        const n = p.n ?? p.cur ?? p.value ?? p.count ?? 0, max = p.max ?? p.total ?? p.of ?? 0;
        pg = max ? `${n} / ${max}` : String(n);
        if (max) frac = clamp(n / max);
      }
      const k = `${d.title}|${d.objective}|${pg}|${frac}`;
      if (k === trackerKey) return;
      restT.tr = 0;
      const first = !trackerKey;
      trackerKey = k;
      setText(trTitle, d.title || '');
      setText(trObj, d.objective || '');
      setText(trProg, pg);
      trProg.style.display = pg ? '' : 'none';
      trBar.classList.toggle('on', frac >= 0);
      if (frac >= 0) trBarFill.style.transform = `scaleX(${frac})`;
      tracker.classList.add('on');
      if (!first) replay(tracker, 'flash');
    },
    bossBar(d) {
      if (!d) { bossData = null; boss.classList.remove('on'); return; }
      const fresh = !bossData;
      bossData = d;
      setText(bossName, d.name || '');
      setText(bossSub, d.sub || '');
      bossSub.style.display = d.sub ? '' : 'none';
      const kind = d.kind || 'boss';
      if (boss._kind !== kind) { boss._kind = kind; boss.classList.toggle('duel', kind === 'duel'); boss.classList.toggle('shade', kind === 'shade'); }
      const col = d.color || (d.element && EL_COLOR[d.element]) || '';
      if (boss._col !== col) { boss._col = col; if (col) boss.style.setProperty('--bc', col); else boss.style.removeProperty('--bc'); }
      bossFrac = clamp((d.hp ?? 0) / (d.max || d.maxHp || 1));
      if (fresh) { bossBar.g = bossFrac; bossBar.f = -1; }
      boss.classList.add('on');
    },
    struggle(d) {
      if (!d) { strgTarget = null; strg.classList.remove('on'); return; }
      if (strgTarget === null) strgV = clamp(d.value ?? 0.5);
      strgTarget = clamp(d.value ?? 0.5);
      strg.classList.add('on');
    },

    update(rdt) {
      const mode = G.mode;
      const play = mode === 'play';
      const show = play || mode === 'talk' || mode === 'cutscene';
      if (R._show !== show) { R._show = show; R.classList.toggle('show', show); }
      if (R._calm !== !play) { R._calm = !play; R.classList.toggle('calm', !play); }
      // the quest tracker steps aside while the letterbox is up (cutscenes, cinematic talks)
      if (!R._lbox) R._lbox = R.parentElement?.querySelector('.mv-lbox') || null;
      const lb = !!R._lbox?.classList.contains('on');
      if (tracker._lb !== lb) { tracker._lb = lb; tracker.classList.toggle('lb', lb); }
      if (!show) return;
      const v = vitals();

      // vitals
      setArc(life, v.hp / v.maxHp, rdt);
      setArc(mana, v.mana / v.maxMana, rdt);
      setText(lifeNum, String(Math.ceil(v.hp)));
      setText(lifeOf, '/ ' + Math.round(v.maxHp));
      setText(manaNum, String(Math.floor(v.mana)));
      // a quiet screen: the crest rests (dims, numbers fade) while she is whole and out of a fight; key hints rest after a
      // while on the same set; the tracker folds to its title; the dial dims. Any change brings each back at once.
      const fight = !!G.combat?.inCombat || !!bossData;
      const whole = v.hp >= v.maxHp - 0.5 && v.mana >= v.maxMana - 0.5 && !v.dead;
      restT.vit = fight || !whole ? 0 : restT.vit + rdt;
      restT.hint += rdt; restT.tr += rdt; restT.dial = fight || !whole || charge() > 0.02 ? 0 : restT.dial + rdt;
      setOn2(vit, 'rest', restT.vit > 4);
      setOn2(hints, 'rest', restT.hint > 12 && !fight);
      setOn2(tracker, 'rest', restT.tr > 14 && !fight);
      setOn2(spell, 'rest', restT.dial > 9);
      const low = v.hp / v.maxHp < 0.3 && !v.dead;
      if (vit._low !== low) { vit._low = low; vit.classList.toggle('low', low); }
      for (let i = 0; i < STATUS.length; i++) setOn(statusEl[STATUS[i]], v[STATUS[i]]);
      // the little sky: the Moon slides over the Sun as the Veil deepens
      const veil = Math.round(clamp(G.env.veil) * 50) / 50;
      if (moon._v !== veil) {
        moon._v = veil;
        const k = 1 - veil;
        moon.style.transform = `translate(calc(var(--u)*${(k * 21).toFixed(1)}), calc(var(--u)*${(-k * 9).toFixed(1)}))`;
      }

      // counters
      const sd = inv('stardust');
      if (dustReal !== sd) { if (dustReal >= 0 && sd > dustReal) replay(dust, 'bump'); dustReal = sd; if (dustShown < 0) dustShown = sd; }
      if (dustShown !== sd) {
        const step = Math.max(1, Math.ceil(Math.abs(sd - dustShown) * Math.min(1, rdt * 6)));
        dustShown += Math.sign(sd - dustShown) * Math.min(step, Math.abs(sd - dustShown));
      }
      setText(dustNum, String(dustShown));
      const dg = inv('dango');
      setText(dangoNum, String(dg));
      if (dango._none !== (dg <= 0)) { dango._none = dg <= 0; dango.classList.toggle('none', dg <= 0); }

      const known = updateSpell(v);
      buildHints(v, known);
      const rk = v.onBroom ? 'broom' : v.gliding ? 'glide' : '';
      if (rk !== rideKey) {
        rideKey = rk;
        ride.classList.toggle('on', !!rk);
        if (rk) { setIcon(rideIc, rk === 'broom' ? 'broom' : 'wings'); setText(rideTx, t('ui.hud.' + rk)); }
      }

      // crosshair: warm when the aim rests on something that can be hit
      const hot = !!(G.player && G.player.aim && G.player.aim.target);
      if (cross._hot !== hot) { cross._hot = hot; cross.classList.toggle('hot', hot); }

      // boss: the gleam rides the leading edge; the rod shivers in the last tenth
      if (bossData) {
        setBar(bossBar, bossFrac, rdt);
        const gx = Math.round(bossBar.f * 452 * UI.u);
        if (bossGl._x !== gx) { bossGl._x = gx; bossGl.style.transform = `translate3d(${gx}px,0,0)`; }
        const low = bossFrac > 0 && bossFrac < 0.1;
        if (boss._low !== low) { boss._low = low; boss.classList.toggle('low', low); }
      }
      // struggle
      if (strgTarget !== null) {
        strgV = damp(strgV, strgTarget, 14, rdt);
        const f = Math.round(strgV * 400) / 400;
        if (strg._f !== f || strg._u !== UI.u) {
          strg._f = f; strg._u = UI.u;
          strgMine.style.transform = `scaleX(${f})`;
          strgSpark.style.transform = `translate3d(${(f * 464 * UI.u).toFixed(1)}px,0,0)`;
          // a crack flickers where the beams meet when either side is about to break (hers: reddened, and the rod shivers)
          const edge = f < 0.2 || f > 0.82, lose = f < 0.2;
          if (strg._e !== edge || strg._l !== lose) { strg._e = edge; strg._l = lose; strg.classList.toggle('edge', edge); strg.classList.toggle('lose', lose); }
        }
        const hk = key('attack');
        if (strgHintKey !== hk) {
          strgHintKey = hk;
          clear(strgHint);
          const parts = t('ui.hud.struggleHint', { key: '\u0001' }).split('\u0001');
          if (parts[0]) el('span', '', strgHint, parts[0].trim());
          keycap(hk, strgHint);
          if (parts[1]) el('span', '', strgHint, parts[1].trim());
        }
      }
    },

    /** after the camera moved: everything that is pinned to a point of the world */
    late() {
      if (!R._show) return;
      const cam = G.camera;
      cam.updateMatrixWorld();
      cam.getWorldDirection(_d);
      let heading = Math.atan2(_d.x, -_d.z) * RAD2DEG;
      if (heading < 0) heading += 360;
      updateCompass(heading);
      if (pool.size) projectMarkers(heading);
      updateLock();
    },
  };
  relabel();
  return api;
}
