// Items, pickups, shops and upgrades — pure data (no text: names / descriptions live in src/locales/zh-CN/gameplay*.js
// under gameplay.item.<id>.name / .desc). Read by src/gameplay/*.

/**
 * Inventory items. kind: 'currency' | 'food' | 'key' | 'ingredient' | 'material'.
 *   heal: HP restored when eaten · mana: mana restored · icon: G.ui icon name (ui/icons.js) or another item id
 *   model: asset id used for the pickup / display · order: sort order in the items menu
 * The player system eats 团子 (dango) itself with the heal key; every other food is eaten through G.gameplay.useItem(id).
 */
export const ITEMS = {
  stardust:     { kind: 'currency', icon: 'stardust', order: 0 },
  moontear:     { kind: 'material', icon: 'moontear', order: 1 },
  dango:        { kind: 'food', heal: 40, icon: 'dango', model: 'prop_dango', order: 2 },
  apple:        { kind: 'food', heal: 12, icon: 'heart', model: 'prop_apple_red', order: 10 },
  roasted_apple:{ kind: 'food', heal: 24, icon: 'heart', model: 'prop_apple_red', tint: 0x8a3c1a, order: 11 },
  carrot:       { kind: 'food', heal: 10, icon: 'heart', order: 12 },
  berry:        { kind: 'food', heal: 8, mana: 10, icon: 'heart', order: 13 },
  mushroom:     { kind: 'food', heal: 10, icon: 'heart', model: 'prop_mushroom', order: 14 },
  fish:         { kind: 'food', heal: 14, icon: 'heart', model: 'prop_fish', order: 15 },
  grilled_fish: { kind: 'food', heal: 30, icon: 'heart', model: 'prop_fish', tint: 0x8a5a2c, order: 16 },
  rice:         { kind: 'food', heal: 18, icon: 'heart', model: 'prop_onigiri', order: 17 },
  pumpkin:      { kind: 'food', heal: 20, icon: 'heart', model: 'prop_pumpkin', order: 18 },
  sun_tea:      { kind: 'food', heal: 10, mana: 50, icon: 'sun', order: 19 },
  moon_mochi:   { kind: 'food', heal: 60, mana: 20, icon: 'moon', order: 20 },
  glowshroom:   { kind: 'ingredient', icon: 'spirit', order: 30 },
  sunseed:      { kind: 'ingredient', icon: 'sun', order: 31 },
  firefly:      { kind: 'key', icon: 'spirit', order: 40 },
  kite:         { kind: 'key', icon: 'flag', order: 41 },
  foxkit:       { kind: 'key', icon: 'fox', order: 42, hidden: true },     // counted in G.state.collected; not shown as an item
};

/** Pickup kinds spawnPickup() understands. look: 'star' | 'heart' | 'orb' | 'food'. Food kinds go into the inventory. */
export const PICKUPS = {
  stardust: { look: 'star', item: 'stardust', color: 0xffd76a },
  heart:    { look: 'heart', heal: 20, color: 0xff5a7a },
  mana:     { look: 'orb', mana: 25, color: 0x7ac8ff },
  // every food / ingredient item can also be dropped as a pickup (look 'food', the item goes to the inventory)
};
for (const id in ITEMS) if (ITEMS[id].kind === 'food' || ITEMS[id].kind === 'ingredient') PICKUPS[id] = { look: 'food', item: id };
PICKUPS.mana_orb = PICKUPS.mana;

/** Upgrades (levels 0..max live in G.state.upgrades). Prices for shops: price[level]. */
// activities round (2026-11-22): prices retuned against the open country's income — about 2400 星屑 from stray stars,
// landmark finds, cairns, the 17 landmark chests and the ring courses, plus ~500 from foes — and the 6 free levels the
// wilds give (2 beacon chests, 4 star milestones): a thorough explorer ends near 15 of 20 levels, a straight run near 8.
export const UPGRADES = {
  hp:    { max: 5, icon: 'heart', price: [120, 200, 300, 430, 600] },
  mana:  { max: 5, icon: 'spirit', price: [120, 200, 300, 430, 600] },
  broom: { max: 5, icon: 'broom', price: [100, 170, 260, 380, 520] },
  charm: { max: 5, icon: 'charm', price: [80, 140, 220, 320, 450] },
  // 气力 (player/stamina.js): +20 per level; earned at the craft sites (src/data/craft.js SITES), never sold
  stamina: { max: 5, icon: 'wings', price: [] },
};
/** 月之泪: this many tears buy one hp / mana point at an altar. */
export const TEARS_PER_POINT = 4;

/**
 * Shops. anchor: ANCHORS id the stall stands at. stock: items for sale ({ item, price }) or upgrades ({ upgrade }).
 * requires: story flag needed before it opens (ignored when no story system is running).
 */
export const SHOPS = {
  // the inn counter in the City of Magic (journey anchor 'shop'), open once the broken roof is mended; the engine's
  // old village / lantern-town stalls had anchors on the first game's map and sat invisible in the wilds here
  city_shop: {
    anchor: 'shop', radius: 3.0, requires: 'majo_repaired',
    stock: [{ item: 'dango', price: 12 }, { upgrade: 'broom' }, { upgrade: 'charm' }, { upgrade: 'hp' }, { upgrade: 'mana' }],
  },
};

/** Chest loot tables, referenced by placements (chest.loot). */
export const LOOT = {
  small:   [{ item: 'stardust', n: 30 }, { item: 'dango', n: 1 }],
  medium:  [{ item: 'stardust', n: 60 }, { item: 'dango', n: 2 }],
  large:   [{ item: 'stardust', n: 120 }, { item: 'dango', n: 2 }, { item: 'moon_mochi', n: 1 }],
  charm:   [{ item: 'stardust', n: 40 }, { upgrade: 'charm', n: 1 }],
  broom:   [{ item: 'stardust', n: 40 }, { upgrade: 'broom', n: 1 }],
};

/** Stardust lost on death (fraction of the purse, capped). */
export const DEATH_TOLL = { frac: 0.1, max: 60 };
