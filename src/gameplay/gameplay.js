// G.gameplay — lanterns, checkpoints and respawn, pickups, collectibles, races, world mechanics, shops and upgrades.
// See docs/DESIGN.md §3.4 §3.6 §3.7 §6.11. Modules: lanterns.js pickups.js collect.js races.js mechanics.js common.js.
import { registerTravelNotes } from './travel-notes.js';
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { addItem, hasFlag } from '../core/save.js';
import { PAL } from '../core/mats.js';
import { ITEMS, SHOPS, UPGRADES, TEARS_PER_POINT } from '../data/items.js';
import { ALTARS, BARRIER } from '../data/placements.js';
import { ensureState, gp, isActive, sfx, toast } from './common.js';
import { createLanterns } from './lanterns.js';
import { createPickups } from './pickups.js';
import { createCollect } from './collect.js';
import { createRaces } from './races.js';
import { createMechanics } from './mechanics.js';
import { createWilds } from './wilds.js';   // the open country's discovery loop (stray stars, landmark puzzles, ring courses)
import { createErrands } from './errands.js';   // roadside errands given by travellers at the landmarks
import { createOnboarding } from './onboarding.js';   // the rest of the onboarding, taught in context (coach card)

const api = {};
let L = null, PK = null, CO = null, RA = null, ME = null;
let markersDirty = true, raceMarker = null, markerT = 0;
const pillars = [];

// ---- shops & upgrades ---------------------------------------------------------------------------------------------------
function upgradeLevel(k) { return (G.state?.upgrades?.[k]) | 0; }
/** Raise an upgrade by n (capped). Returns the new level, or 0 if nothing changed. */
function applyUpgrade(k, n = 1) {
  const def = UPGRADES[k]; if (!def || !G.state) return 0;
  const before = upgradeLevel(k);
  const lv = Math.min(def.max, before + n);
  if (lv === before) return 0;
  G.state.upgrades[k] = lv;
  G.player?.recalcStats?.();
  if (k === 'hp') G.player?.heal?.(9999);
  if (k === 'mana') G.player?.addMana?.(9999);
  G.fx?.burst?.('levelup', G.player ? G.player.pos.clone().setY(G.player.pos.y + 1) : new THREE.Vector3());
  sfx('levelup');
  G.events.emit('upgrade', { id: k, level: lv });
  return lv;
}
function shopItems(id) {
  const S = SHOPS[id];
  return S.stock.map((s) => {
    if (s.upgrade) {
      const k = s.upgrade, def = UPGRADES[k], lv = upgradeLevel(k);
      return { id: 'up:' + k, name: t('gameplay.upgrade.' + k + '.name'), desc: t('gameplay.upgrade.' + k + '.desc') + '\n' + t('gameplay.shop.level', { lv, max: def.max }),
        price: def.price[Math.min(lv, def.max - 1)], icon: def.icon, owned: lv, max: def.max };
    }
    return { id: s.item, name: t('gameplay.item.' + s.item + '.name'), desc: t('gameplay.item.' + s.item + '.desc'), price: s.price, icon: ITEMS[s.item]?.icon || s.item };
  });
}
/** ★ openShop(shopId) -> Promise (resolves when the stall is left). */
function openShop(id) {
  const S = SHOPS[id];
  if (!S) return Promise.resolve(false);
  if (S.requires && G.quests && !hasFlag(G, S.requires)) { toast(t('gameplay.toast.shopClosed', { name: t('gameplay.shop.' + id) }), { icon: 'shop' }); return Promise.resolve(false); }
  const items = shopItems(id);
  const purse = () => (G.state?.inventory?.stardust) || 0;
  const onBuy = (iid) => {
    const it = items.find((x) => x.id === iid); if (!it) return false;
    if (purse() < it.price) return false;
    if (iid.startsWith('up:')) {
      const k = iid.slice(3);
      if (!applyUpgrade(k, 1)) return false;
      addItem(G, 'stardust', -it.price);
      const def = UPGRADES[k], lv = upgradeLevel(k);
      it.owned = lv; it.price = def.price[Math.min(lv, def.max - 1)];
      it.desc = t('gameplay.upgrade.' + k + '.desc') + '\n' + t('gameplay.shop.level', { lv, max: def.max });
    } else {
      addItem(G, 'stardust', -it.price);
      addItem(G, iid, 1);
      gp().shopBought[iid] = (gp().shopBought[iid] || 0) + 1;
    }
    return true;
  };
  if (!G.ui?.openShop) return Promise.resolve(false);
  return G.ui.openShop({ title: t('gameplay.shop.' + id), items, currency: purse, onBuy });
}
/** The moon-tear altar: TEARS_PER_POINT tears -> +1 hp or mana level. */
function openAltar() {
  const tears = () => (G.state?.inventory?.moontear) || 0;
  const items = ['hp', 'mana'].map((k) => ({ id: k, name: t('gameplay.upgrade.' + k + '.name'), desc: t('gameplay.upgrade.' + k + '.desc') + '\n' + t('gameplay.shop.altarDesc'),
    price: TEARS_PER_POINT, icon: UPGRADES[k].icon, owned: upgradeLevel(k), max: UPGRADES[k].max }));
  const onBuy = (k) => {
    if (tears() < TEARS_PER_POINT) return false;
    const lv = applyUpgrade(k, 1); if (!lv) return false;
    addItem(G, 'moontear', -TEARS_PER_POINT);
    gp().tearPoints[k] = (gp().tearPoints[k] || 0) + 1;
    const it = items.find((x) => x.id === k); if (it) it.owned = lv;
    toast(t('gameplay.toast.upgraded', { name: t('gameplay.upgrade.' + k + '.name'), lv }), { icon: UPGRADES[k].icon });
    return true;
  };
  if (!G.ui?.openShop) return Promise.resolve(false);
  return G.ui.openShop({ title: t('gameplay.shop.altar'), items, currency: tears, currencyIcon: 'moontear', onBuy });
}
/** Eat / use an inventory item (food from the items menu). Returns true if used. */
function useItem(id) {
  const def = ITEMS[id], P = G.player;
  if (!def || def.kind !== 'food' || !P || !G.state) { toast(t('gameplay.toast.cantEat'), { dur: 1.6 }); return false; }
  if ((G.state.inventory[id] || 0) <= 0) return false;
  const needHp = def.heal && P.hp < P.maxHp, needMp = def.mana && P.mana < P.maxMana;
  if (!needHp && !needMp) { toast(t('gameplay.toast.full'), { dur: 1.6 }); return false; }
  addItem(G, id, -1);
  if (def.heal) P.heal?.(def.heal);
  if (def.mana) P.addMana?.(def.mana);
  P.playAction?.('consume', { once: true });
  toast(t('gameplay.toast.ate', { name: t('gameplay.item.' + id + '.name') }), { icon: def.icon, dur: 1.8 });
  return true;
}

// ---- shop stalls (interact) ------------------------------------------------------------------------------------------------
function initShops() {
  for (const id in SHOPS) {
    const S = SHOPS[id];
    const pos = G.world.anchor(S.anchor);
    G.interact?.add({ pos: pos.clone().setY(pos.y + 1), radius: S.radius || 3, priority: 0, enabled: () => !S.requires || hasFlag(G, S.requires), prompt: () => t('gameplay.prompt.shop', { name: t('gameplay.shop.' + id) }), onInteract: () => openShop(id) });
  }
}

// ---- light pillar (great lantern moment) ---------------------------------------------------------------------------------
function pillar(pos, dur = 3) {
  const b = G.fx?.beam?.({ from: pos, to: pos.clone().setY(pos.y + 120), color: PAL.lanternHot, width: 1.5, intensity: 0.8, sparks: false, light: false });
  if (b) pillars.push({ b, t: dur, w: 1.5 });
}

// ---- markers & providers ----------------------------------------------------------------------------------------------------
function mapMarkers() {
  const out = [];
  const seen = gp().seen;
  if (L) for (const id in L.rests) { const r = L.rests[id]; if (r.kind === 'rest') out.push({ x: r.pos.x, z: r.pos.z, icon: 'shrine', label: t('gameplay.marker.rest'), kind: 'checkpoint' }); }
  for (const id in SHOPS) { const a = G.world.ANCHORS[SHOPS[id].anchor]; if (a) out.push({ x: a.x, z: a.z, icon: 'shop', label: t('gameplay.shop.' + id), kind: 'shop' }); }
  for (const a of ALTARS) out.push({ x: a.x, z: a.z, icon: 'moontear', label: t('gameplay.marker.altar'), kind: 'altar' });
  if (RA) for (const id in RA.courses) { const c = RA.courses[id]; if (isActive(c.def.group)) out.push({ x: c.start.x, z: c.start.z, icon: 'race', label: t('gameplay.race.name.' + id), kind: 'race' }); }
  if (CO) for (const s of CO.spots) {
    if (!seen[s.id] || (G.state.collected && G.state.collected[s.id]) || !isActive(s.group)) continue;
    if (s.kind === 'moontear') out.push({ x: s.pos.x, z: s.pos.z, icon: 'moontear', label: t('gameplay.marker.tear'), kind: 'collectible' });
    else if (s.kind === 'chest') out.push({ x: s.pos.x, z: s.pos.z, icon: 'chest', label: t('gameplay.marker.chest'), kind: 'collectible' });
    else if (s.kind === 'ema') out.push({ x: s.pos.x, z: s.pos.z, icon: 'ema', label: t('gameplay.marker.ema'), kind: 'collectible' });
  }
  return out;
}
function itemsProvider() {
  const inv = G.state?.inventory || {};
  return Object.keys(ITEMS).filter((id) => !ITEMS[id].hidden && (inv[id] || 0) > 0).sort((a, b) => ITEMS[a].order - ITEMS[b].order)
    .map((id) => ({ id, name: t('gameplay.item.' + id + '.name'), desc: t('gameplay.item.' + id + '.desc'), count: inv[id], icon: ITEMS[id].icon || id, usable: ITEMS[id].kind === 'food' }));
}
function loreProvider() {
  const lore = G.state?.lore || {};
  const out = [];
  for (let i = 1; i <= 10; i++) { const id = 'ema_' + String(i).padStart(2, '0'); if (lore[id]) out.push({ id, title: t('gameplay.lore.' + id + '.title'), text: t('gameplay.lore.' + id + '.text') }); }
  return out;
}
function pushMarkers() {
  // compass markers: the next race ring while racing (story owns quest markers; we only add ours)
  markersDirty = false;
  if (!G.ui?.setMarkers) return;
  if (raceMarker) G.ui.setMarkers([raceMarker], 'race');
}

// ---- public API -------------------------------------------------------------------------------------------------------------
Object.defineProperties(api, Object.getOwnPropertyDescriptors({
  /** ★ */ spawnPickup: (kind, pos, n = 1) => PK?.spawn(kind, pos, n) || [],
  /** ★ */ igniteGreatLantern: (id, o) => L?.igniteGreat(id, o) || false,
  /** ★ */ setGreatLanternReady: (id, on = true) => L?.setGreatReady(id, on) || false,
  /** ★ */ respawnPlayer: () => L?.respawnPlayer() || false,
  /** ★ */ startRace: (id) => (RA ? RA.startRace(id) : Promise.resolve({ time: null, best: null, medal: null })),
  /** ★ */ openShop,
  /**
   * Lit stone lanterns and lotus lamps (great lanterns are never listed): [{ id, kind:'stone'|'lotus', pos, firePos, reactor, douse(info) }],
   * nearest first when `near` (Vector3) is given, only within `range` metres (default: all).
   */
  litLanterns(near, range = Infinity) {
    if (!L) return [];
    const out = [];
    for (const id in L.stones) {
      if (!L.isLit(id)) continue;
      const S = L.stones[id];
      const d = near ? Math.hypot(S.pos.x - near.x, S.pos.z - near.z) : 0;
      if (d > range) continue;
      out.push({ id, kind: 'stone', pos: S.pos, firePos: S.firePos, reactor: S.reactor, dist: d, douse: (info) => L.douse(id, info || {}) });
    }
    // lit lotus lamps on 镜心湖 (the moth's food); douse = the flame is eaten, relit by fire or by hand
    if (CO) for (const id in CO.lotus) {
      const S = CO.lotus[id];
      if (!G.state?.collected?.[id] || S.eaten || !S.obj?.visible) continue;
      const d = near ? Math.hypot(S.pos.x - near.x, S.pos.z - near.z) : 0;
      if (d > range) continue;
      out.push({ id, kind: 'lotus', pos: S.pos, firePos: S.pos.clone().setY(S.pos.y + 0.45), reactor: S.reactor, dist: d, douse: () => CO.eatLotus(S) });
    }
    if (near) out.sort((a, b) => a.dist - b.dist);
    return out;
  },
  get checkpoints() {
    if (!L) return [];
    return Object.values(L.rests).filter((r) => r.kind === 'rest' || L.isLit(r.id)).map((r) => ({ id: r.id, pos: r.pos.clone(), kind: r.kind }));
  },
  /** Hook set by the story: called with a great lantern id when the player offers it fire / sun while ready. */
  onGreatLanternTry: null,
  /** Optional hooks: onPuzzleSolved(id), onBarrierDown(). */
  onPuzzleSolved: null, onBarrierDown: null,
  lightLantern: (id, o) => L?.light(id, o) || false,
  douseLantern: (id) => L?.douse(id) || false,
  isLanternLit: (id) => !!L?.isLit(id),
  get lanternsLit() { return L ? L.litCount() : 0; },
  get greatLit() { return L ? L.greatCount() : 0; },
  isGreatLanternLit: (id) => !!L?.greatLit(id),
  rest: (id) => L?.rest(id) || false,
  setCheckpoint: (id) => L?.setCheckpoint(id) || false,
  useItem,
  openAltar,
  applyUpgrade,
  openChest: (id) => CO?.openChest(id) || false,
  cancelRace: () => RA?.cancel(),
  get raceRunning() { return RA ? RA.running : (G.wilds?.rings?.running || null); },
  /** Show / hide a group of quest things: 'race_shrine' 'race_dusk' 'race_sky' 'fireflies' 'lotus' 'kits' 'kite' 'crystal_puzzle'. */
  setActive(group, on = true) {
    if (!G.state) return;
    if (on) delete gp().active[group]; else gp().active[group] = false;
    CO?.refresh(); RA && !RA.running && RA.start();
    markersDirty = true;
  },
  isActive,
  /** Positions of uncollected things of a kind: moontear ema chest foxkit kite firefly lotus_lamp glowshroom sunseed altar
   *  plus 'lantern' (unlit stone lanterns), 'greatlantern' (ready, unlit), 'race' (race starts), 'rest'. */
  find(kind) {
    if (kind === 'lantern') return L ? Object.values(L.stones).filter((s) => !L.isLit(s.id)).map((s) => s.pos.clone()) : [];
    if (kind === 'greatlantern') return L ? Object.values(L.greats).filter((s) => !L.greatLit(s.id)).map((s) => s.pos.clone()) : [];
    if (kind === 'race') return RA ? Object.values(RA.courses).filter((c) => isActive(c.def.group)).map((c) => c.start.clone()) : [];
    if (kind === 'rest') return L ? Object.values(L.rests).filter((r) => r.kind === 'rest').map((r) => r.pos.clone()) : [];
    return CO ? CO.find(kind) : [];
  },
  /** Debug: collect everything of a kind (or everything with no kind). Returns how many. */
  debugCollectAll(kind) {
    if (kind === 'lantern') { let n = 0; for (const id in L?.stones || {}) if (L.light(id, { silent: true })) n++; return n; }
    return CO ? CO.collectAll(kind) : 0;
  },
  /** 月障 */
  get barrierUp() { return !!ME?.barrierUp(); },
  setBarrier: (on, o) => ME?.setBarrier(on, o),
  get puzzleSolved() { return !!ME?.puzzleSolved(); },
  rotatePedestal: (i, dir = 1) => ME?.rotate(i, dir) || false,
  markersDirty() { markersDirty = true; },
  setRaceMarker(m) { raceMarker = m; markersDirty = true; if (!m) G.ui?.setMarkers?.([], 'race'); },
  pillar,
  /** Re-apply everything from G.state (used by start(); tests call it after editing G.state). */
  restore() { ensureState(); L?.restore(); CO?.refresh(); ME?.start(); RA?.start(); markersDirty = true; },
  // internals for tests
  get _m() { return { L, PK, CO, RA, ME }; },
}));
/** Called when a great lantern is lit: three (besides the moon lantern) dissolve the barrier. */
api.onGreatLit = (id) => {
  if (ME?.barrierUp() && L.greatCount('gl_moon') >= BARRIER.need) setTimeout(() => ME.setBarrier(false), 2200);
};

export const gameplaySystem = {
  name: 'gameplay',
  pausable: true,
  async init(g) {
    G.gameplay = api;
    G.travelNotes=registerTravelNotes(G);
    G.wilds = createWilds();
    try { G.wilds.init(); } catch (e) { G.reportError('gameplay:wilds', e); }
    G.errands = createErrands();
    try { G.errands.init(); } catch (e) { G.reportError('gameplay:errands', e); }
    G.onboarding = createOnboarding();   // the journal's notes in the margin: the rest of the onboarding (onboarding.js)
    PK = createPickups(api);
    PK.init();
    initShops();
    if (G.ui?.providers) {
      G.ui.providers.mapMarkers = () => (G.wilds?.markers?.() || []).concat(G.errands?.markers?.() || []);   // the story replaces this and adds its own
      G.ui.providers.items = itemsProvider;
      G.ui.providers.lore = loreProvider;
    }
  },
  start() {
    ensureState();
    PK?.clear();
    try { api.restore(); } catch (e) { G.reportError('gameplay:start', e); }
    try { G.wilds?.start(); } catch (e) { G.reportError('gameplay:wilds', e); }
    try { G.errands?.start(); } catch (e) { G.reportError('gameplay:errands', e); }
    // the four great lanterns' state vs the barrier (e.g. an old save with three lit)
    if (ME?.barrierUp() && L.greatCount('gl_moon') >= BARRIER.need) ME.setBarrier(false, { instant: true });
  },
  update(dt) {
    if (!G.state) return;
    G.travelNotes.update();
    try { G.wilds?.update(dt); } catch (e) { G.reportError('gameplay:wilds', e); }
    try { G.errands?.update(dt); } catch (e) { G.reportError('gameplay:errands', e); }
    try { G.onboarding?.update(dt); } catch (e) { G.reportError('gameplay:onboarding', e); }
    for (const [n, m] of [['pickups', PK]]) {
      try { m.update(dt); } catch (e) { G.reportError('gameplay:' + n, e); }
    }
    for (let i = pillars.length - 1; i >= 0; i--) {
      const p = pillars[i]; p.t -= dt;
      p.b.setWidth?.(p.w * Math.max(0, Math.min(1, p.t / 1.2)));
      if (p.t <= 0) { p.b.remove?.(); pillars.splice(i, 1); }
    }
    markerT -= dt;
    if (markersDirty && markerT <= 0) { markerT = 0.5; pushMarkers(); }
  },
};
