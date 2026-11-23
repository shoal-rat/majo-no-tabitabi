// 魔女之旅 — the whole user interface: a DOM overlay inside G.uiRoot, drawn as a traveller's grimoire (docs/api/ui.md "Grimoire round").
// This file wires the views together and exposes G.ui; each view lives in its own module next to it.
import { G } from '../core/game.js';
import { t, has, onLocaleChange } from '../core/i18n.js';
import { UI, K, el, retranslate, topModal } from './dom.js';
import { installStyle, applyFonts, applyScale } from './style.js';
import { loadFontsWithin } from '../core/fonts.js';
import { touchSpells } from './model.js';
import { createHud } from './hud.js';
import { createStage } from './stage.js';
import { createDialogue, portraitOf } from './dialogue.js';
import { createWheel } from './wheel.js';
import { createTitle } from './title.js';
import { createMenu } from './menu.js';
import { createShop } from './shop.js';
import { createCeremony } from './ceremony.js';
import { idlePaint, mapReady, stampVisit } from './map.js';
import { selfUnlocked } from './dom.js';
import { applyKeyBindings } from './panels.js';
import { createReactions } from './reactions.js';   // 元素交织: reaction callouts, foe status marks, discoveries
import { createTouch } from './touch.js';   // touch controls (phones / tablets): above the HUD, below every full-screen layer
import { createFoes } from './foes.js';   // combat: foe plates (hp, ward, affixes, 破绽) and the combo meter
import { createCoach } from './coach.js';   // the spar lessons' coach card (src/story/spar-lessons.js)
import { createStaminaRing } from './stamina.js';   // 气力: the stamina petal ring by her shoulder
import { episodes, countries, countryOfRegion, episodeById, episodeOfQuest, registerEpisodes } from '../data/episodes.js';   // the episode / country registry
import { stampArt } from './stamps.js';   // a country's passport stamp (procedural SVG)

let hud = null, stage = null, dialogue = null, wheel = null, title = null, menu = null, shop = null, cer = null, touch = null;
const offs = [];
let rx = null;
let foes = null, coach = null, stam = null;

export const uiSystem = {
  name: 'ui',
  pausable: false,     // menus keep running on real time while the world is paused

  async init() {
    const root = (UI.root = G.uiRoot);
    installStyle(root);
    await loadFontsWithin(6000);   // the locale's faces: every canvas baked after this (world lettering) uses them
    hud = createHud(root);
    rx = createReactions(root);
    foes = createFoes(hud.root);
    coach = createCoach(hud.root);
    stam = createStaminaRing(hud.root);
    stage = createStage(root, hud.root);
    const touchDeps = {};
    touch = createTouch(root, touchDeps);
    dialogue = createDialogue(root);
    wheel = createWheel(root);
    touchDeps.wheel = wheel;
    // full-screen layers (title, menus, sheets) live in one host that sits under the fade veil
    const host = (UI.host = el('div', 'layer mv-host', root));
    title = createTitle(host, stage);

    const providers = { journal: null, mapMarkers: null, items: null, lore: null, spells: null };
    menu = createMenu(host, stage, providers);
    shop = createShop(host);
    cer = createCeremony(host, stage);
    const ui = (G.ui = {
      providers,
      showTitle: (o) => title.show(o || {}),
      debug: { UI },
      // ---- HUD ----
      toast: (text, opts) => stage.toast(text, opts),
      banner: (title, subtitle, opts) => stage.banner(title, subtitle, opts),
      prompt: (text) => { hud.prompt(text); touch.prompt(text); },
      /** coach({ who, line, task, n, of } | { done } | null): one lesson card under the boss bar (src/ui/coach.js) */
      coach: (o) => coach?.set(o),
      setTracker: (d) => hud.setTracker(d),
      /** setMarkers(list, layer = 'main'): each layer is replaced on its own; all layers are shown together. */
      setMarkers: (list, layer) => hud.setMarkers(list, layer),
      bossBar: (d) => hud.bossBar(d),
      duelBars: (d) => hud.bossBar(d ? { kind: 'duel', ...(d.enemy || d.foe || d) } : null),
      struggle: (d) => hud.struggle(d),
      // ---- stage ----
      fade: (alpha, dur, color) => stage.fade(alpha, dur, color),
      letterbox: (on) => stage.letterbox(on),
      hurt: (k) => stage.hurt(k),
      say: (o) => dialogue.say(o),
      /** portraitOf(who) -> url | null: the in-game portrait of a story speaker (say({ portrait })) */
      portraitOf,
      /** the episode / country registry (src/data/episodes.js): read by the journal, map, title cards; register() for data packs and probes */
      episodes: { list: episodes, countries, countryOfRegion, episodeOfQuest, register: registerEpisodes, stampArt },
      // ---- full-screen layers ----
      openMenu: (tab) => menu.open(tab),
      closeMenu: () => menu.close(false),
      get menuOpen() { return menu.isOpen; },
      get menuTab() { return menu.tab; },
      openShop: (o) => shop.openShop(o),
      learnSpell: (o) => cer.learnSpell(o),
      showEnding: (d) => cer.showEnding(d),
      get talking() { return dialogue.active; },
      get wheelOpen() { return wheel.open; },
      get isOpen() { return UI.modals.length > 0; },
      /** touch controls: { on, root, where(id), stick, releaseAll() } (src/ui/touch.js) */
      touch,
    });

    window.addEventListener('mousemove', (e) => { UI.mouse.x = e.clientX; UI.mouse.y = e.clientY; UI.mouse.moved = true; });
    offs.push(G.events.on('resize', () => applyScale(root)));
    offs.push(G.events.on('region:enter', (e) => {
      stampVisit(e && e.id);   // the journal's travel stamps (map page), before any early return
      if (G.mode !== 'play' || !e || !e.id || e.id === 'sea' || hud.bossOn) return;
      const sub = has('world.sub.' + e.id) ? t('world.sub.' + e.id) : '';
      // a country of the registry (src/data/episodes.js): the episode over the name, its passport stamp beside it
      const country = countryOfRegion(e.id), ep = country ? episodeById(country.episode) : null;
      stage.banner(t('world.place.' + e.id), sub, { country, episode: ep && ep.title ? t(ep.title) : '',
        seal: e.major && has('core.major.' + e.major) ? t('core.major.' + e.major) : '' });
    }));
    // pointer lock lost while playing (the player pressed Esc, or switched windows): open the scroll
    offs.push(G.events.on('input:lockLost', () => {
      if (G.mode === 'play' && !selfUnlocked() && UI.modals.length === 0 && !wheel.open) menu.open();
    }));
    // key rebinding (settings): saved keys onto the live bindings, and every key label redrawn when they change
    applyKeyBindings();
    offs.push(G.events.on('input:rebound', () => { hud.relabel(); wheel.refresh?.(); }));
    offs.push(G.events.on('save:done', () => { if (G.mode === 'play') stage.saved(); }));
    for (const ev of ['spell:learned', 'spell:select', 'game:start']) offs.push(G.events.on(ev, touchSpells));
    offs.push(G.events.on('game:start', () => { if (stage.fadeAlpha > 0) stage.fade(0, 1.2); }));
    onLocaleChange(() => {
      applyFonts(root); retranslate(root); touchSpells(); hud.relabel(); wheel.refresh?.();
      for (const m of UI.modals) { try { m.relabel?.(); } catch (e) { G.reportError('ui:relabel', e); } }
    });
    // the fade veil covers everything, menus included
    const fadeEl = root.querySelector('.mv-fade');
    if (fadeEl) root.appendChild(fadeEl);
    ui.reactions = rx;
    ui.foePlates = !!foes;
    return ui;
  },

  start() { touchSpells(); },

  update(dt, rdt) {
    if (rdt === undefined) rdt = dt;
    K.tick(rdt);
    const top = topModal();
    if (top && top.update) { try { top.update(rdt); } catch (e) { G.reportError('ui:modal', e); } }
    else hotkeys();
    // paint the map a little at a time while the player walks about, so it is ready when opened
    if (!top && G.mode === 'play' && !mapReady() && (G.time.frame & 1) === 0) idlePaint(1.5);
    wheel.update(rdt);
    touch.update(rdt);
    hud.setWheel(wheel.open);
    dialogue.update(rdt);
    hud.update(rdt);
    rx?.update(rdt);
    foes?.update(rdt);
    coach?.update(rdt);
    stage.update(rdt);
    UI.mouse.moved = false;
  },

  lateUpdate(dt, rdt) { hud.late(); rx?.late(); foes?.late(rdt); stam?.late(rdt); },
};

/** Menu hotkeys while nothing else holds the keyboard. */
function hotkeys() {
  const inp = G.input, mode = G.mode;
  if (mode !== 'play' && mode !== 'talk') return;
  if (wheel.open) return;
  let tab = null;
  if (inp.pressed('pause')) tab = '';
  else if (inp.pressed('map')) tab = 'map';
  else if (inp.pressed('journal')) tab = 'journal';
  else if (inp.pressed('spellbook')) tab = 'spells';
  if (tab === null) return;
  // in a conversation only Esc opens the scroll; the letter keys belong to the conversation
  if (mode === 'talk' && tab !== '') return;
  menu.open(tab || undefined);
  K.eat(); inp.consume('map'); inp.consume('journal'); inp.consume('spellbook');
}
