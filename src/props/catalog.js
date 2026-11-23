// 器物目录 — data for every interactive prop type. No logic here; prop.js reads these fields.
//
// Field reference (all optional unless noted):
//   model      asset id (prop_*, rock_*) — or build: name of a procedural builder in models.js
//   scale      extra uniform scale on the model geometry          rotY  yaw baked into the geometry (radians)
//   shape      collider: 'box' | 'sphere' | 'cylinder' | 'hull' (hull = convex hull of the visual)   shrink  collider / visual (0.94)
//   r / h / half   override collider size (sphere r, cylinder {r,h}, box half extents [x,y,z])
//   phys       physics material (wood stone metal ice paper cloth flesh crystal)   mass / density / friction / restitution
//   el         elements material (wood paper cloth grass stone metal ice crystal flesh)   flammable  burnTime  conductive
//   hp         durability      fragile  impact speed (m/s) above which knocks start to hurt it (Infinity = never)
//   debris     kind of shards: 'plank' | 'shard' | 'chunk' | 'sliver' | 'ball'   debrisN  count   debrisColor  hex list
//   fx / sfx   burst + sound on breaking       drops   [[pickupKind, chance, min, max], …]
//   fixed      static (anchored) prop          behave  special behaviour (see prop.js)
//   split      { into, n } — breaks into smaller props of another type
//   lit        initial lit state for fire sources / lanterns ('auto' = lit under the Veil / at dusk)
//   flameY     height of the flame above the body centre       light  radius registered with G.elements.addLight
//   heavy      hits creatures hard (momentum damage multiplier)
const WOOD_DEBRIS = [0xc49a6c, 0x8b5a3c, 0xa77b52];
const CLAY = [0xc0703f, 0xa65a33, 0xd88a55];
const STONE = [0x9b9aa2, 0x7d7b85, 0xb3b1b9];
const GLASS = [0x8fd0b0, 0x6aa78c, 0xbfe8d6];
const STRAW = [0xd9b46a, 0xc8a86a, 0xe8cf8a];
const PAPER = [0xfff8e6, 0xe8dcc0, 0xd8362c];
const IRON = [0x4a4d57, 0x2f323a, 0x6a6e78];

const POT_DROPS = [['stardust', 0.75, 1, 3], ['heart', 0.12, 1, 1]];
const CRATE_DROPS = [['stardust', 0.35, 1, 2]];

export const CATALOG = {
  // ---- crates & barrels ---------------------------------------------------------------------------------------
  crate:        { model: 'prop_crate_metal', shape: 'box', phys: 'wood', el: 'wood', hp: 40, fragile: 9, debris: 'plank', debrisN: 6, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', drops: CRATE_DROPS, stack: true },
  crate_small:  { build: 'crate_small', shape: 'box', phys: 'wood', el: 'wood', hp: 20, fragile: 8, debris: 'plank', debrisN: 4, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', drops: CRATE_DROPS, stack: true },
  crate_large:  { model: 'prop_crate_big', shape: 'box', phys: 'wood', el: 'wood', hp: 50, fragile: 9, debris: 'plank', debrisN: 7, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', drops: CRATE_DROPS, stack: true },
  crate_apples: { model: 'prop_crate_apples', shape: 'box', phys: 'wood', el: 'wood', hp: 30, fragile: 8, debris: 'plank', debrisN: 5, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', drops: [['apple', 0.9, 2, 4]], spill: 'apple' },
  crate_carrots:{ model: 'prop_crate_carrots', shape: 'box', phys: 'wood', el: 'wood', hp: 24, fragile: 8, debris: 'plank', debrisN: 4, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', drops: [['carrot', 0.9, 2, 3]] },
  barrel:       { rolling: { roll: 0.2 }, model: 'prop_barrel_small', shape: 'cylinder', phys: 'wood', el: 'wood', hp: 40, fragile: 10, debris: 'plank', debrisN: 6, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', drops: CRATE_DROPS },
  barrel_large: { rolling: { roll: 0.2 }, model: 'prop_barrel_large', shape: 'cylinder', phys: 'wood', el: 'wood', hp: 60, fragile: 10, debris: 'plank', debrisN: 7, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', drops: CRATE_DROPS },
  barrel_fish:  { rolling: { roll: 0.2 }, model: 'prop_barrel_fish', shape: 'cylinder', phys: 'wood', el: 'wood', hp: 36, fragile: 9, debris: 'plank', debrisN: 6, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', drops: [['fish', 0.8, 1, 2]], spill: 'fish' },
  barrel_apples:{ rolling: { roll: 0.2 }, model: 'prop_barrel_apples', shape: 'cylinder', phys: 'wood', el: 'wood', hp: 36, fragile: 9, debris: 'plank', debrisN: 6, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', drops: [['apple', 0.9, 2, 4]], spill: 'apple' },
  firework:     { build: 'firework', shape: 'cylinder', phys: 'wood', el: 'wood', flammable: 1, burnTime: 6, hp: 30, fragile: 9, debris: 'plank', debrisN: 5, debrisColor: [0xd8362c, 0x8b5a3c, 0xffd27a], behave: 'firework' },
  water_jar:    { build: 'water_jar', shape: 'cylinder', phys: 'stone', density: 1.5, el: 'stone', hp: 18, fragile: 7.2, debris: 'shard', debrisN: 7, debrisColor: CLAY, fx: 'splash', sfx: 'glass_shatter', behave: 'waterjar' },
  iron_box:     { model: 'prop_crate_large', shape: 'box', phys: 'metal', density: 1.6, el: 'metal', hp: 400, fragile: Infinity, heavy: 1.2, sfxHit: 'hit_heavy' },
  iron_ball:    { rolling: { roll: 0.08 }, build: 'iron_ball', shape: 'sphere', phys: 'metal', el: 'metal', hp: 999, fragile: Infinity, heavy: 1.5, sfxHit: 'hit_heavy' },
  // ---- pottery & glass ----------------------------------------------------------------------------------------
  pot:          { model: 'prop_pot_clay', shape: 'cylinder', phys: 'stone', density: 1.4, el: 'stone', hp: 8, fragile: 7, debris: 'shard', debrisN: 6, debrisColor: CLAY, fx: 'shatter_rock', sfx: 'glass_shatter', drops: POT_DROPS },
  vase:         { model: 'prop_vase_a', shape: 'cylinder', phys: 'stone', density: 1.2, el: 'stone', hp: 10, fragile: 7, debris: 'shard', debrisN: 7, debrisColor: [0x5f86b8, 0xe9e4d6, 0x3d5f8f], fx: 'shatter_rock', sfx: 'glass_shatter', drops: POT_DROPS },
  jar:          { model: 'prop_jar_a', scale: 1.4, shape: 'cylinder', phys: 'stone', density: 1.3, el: 'stone', hp: 8, fragile: 7, debris: 'shard', debrisN: 5, debrisColor: CLAY, fx: 'shatter_rock', sfx: 'glass_shatter', drops: POT_DROPS },
  jar_small:    { model: 'prop_jar_c', scale: 1.3, shape: 'cylinder', phys: 'stone', density: 1.3, el: 'stone', hp: 6, fragile: 6.8, debris: 'shard', debrisN: 4, debrisColor: CLAY, fx: 'shatter_rock', sfx: 'glass_shatter', drops: POT_DROPS },
  bottle:       { model: 'prop_bottle_green', shape: 'cylinder', phys: 'stone', density: 0.6, el: 'stone', hp: 3, fragile: 6.8, debris: 'shard', debrisN: 4, debrisColor: GLASS, fx: 'shatter_ice', sfx: 'glass_shatter' },
  bottle_sake:  { model: 'prop_bottle_sake', scale: 1.15, shape: 'cylinder', phys: 'stone', density: 0.6, el: 'stone', hp: 3, fragile: 6.8, debris: 'shard', debrisN: 4, debrisColor: [0xf4efe2, 0x3d5f8f, 0xd8d0c0], fx: 'shatter_ice', sfx: 'glass_shatter' },
  // ---- cloth, straw, paper ------------------------------------------------------------------------------------
  sack:         { build: 'sack', shape: 'box', phys: 'cloth', density: 0.9, el: 'cloth', hp: 24, fragile: 14, debris: 'sliver', debrisN: 5, debrisColor: [0xcdb58a, 0xf3ead2], fx: 'dust', sfx: 'cloth_rustle', drops: [['rice', 0.6, 1, 2]] },
  basket:       { model: 'prop_basket_berries', shape: 'box', phys: 'wood', density: 0.35, el: 'grass', burnTime: 5, hp: 12, fragile: 8, debris: 'sliver', debrisN: 5, debrisColor: STRAW, fx: 'wood_break', sfx: 'wood_break', drops: [['berry', 0.8, 1, 3]] },
  basket_mushrooms: { model: 'prop_basket_mushrooms', shape: 'box', phys: 'wood', density: 0.35, el: 'grass', burnTime: 5, hp: 12, fragile: 8, debris: 'sliver', debrisN: 5, debrisColor: STRAW, fx: 'wood_break', sfx: 'wood_break', drops: [['mushroom', 0.8, 1, 2]] },
  bucket:       { model: 'prop_bucket_wood', shape: 'cylinder', phys: 'wood', el: 'wood', hp: 14, fragile: 9, debris: 'plank', debrisN: 4, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break' },
  hay:          { build: 'hay', shape: 'box', phys: 'cloth', density: 0.45, el: 'grass', flammable: 1, burnTime: 15, hp: 30, fragile: 16, debris: 'sliver', debrisN: 8, debrisColor: STRAW, fx: 'dust', sfx: 'cloth_rustle', fierce: true },
  hay_sheaf:    { model: 'prop_hay_sheaf', shape: 'cylinder', phys: 'cloth', density: 0.35, el: 'grass', flammable: 1, burnTime: 10, hp: 16, fragile: 14, debris: 'sliver', debrisN: 6, debrisColor: STRAW, fx: 'dust', sfx: 'cloth_rustle', fierce: true },
  book:         { model: 'prop_book_stack', shape: 'box', phys: 'paper', el: 'paper', burnTime: 3, hp: 6, fragile: 12, debris: 'sliver', debrisN: 5, debrisColor: PAPER, fx: 'feathers', sfx: 'paper', drops: [['stardust', 0.25, 1, 1]] },
  book_big:     { model: 'prop_book_big', shape: 'box', phys: 'paper', el: 'paper', burnTime: 3, hp: 6, fragile: 12, debris: 'sliver', debrisN: 4, debrisColor: PAPER, fx: 'feathers', sfx: 'paper' },
  scroll:       { model: 'prop_scroll', shape: 'box', phys: 'paper', el: 'paper', burnTime: 2.5, hp: 4, fragile: 12, debris: 'sliver', debrisN: 4, debrisColor: PAPER, fx: 'feathers', sfx: 'paper' },
  // ---- wood -----------------------------------------------------------------------------------------------------
  cart:         { model: 'prop_cart', shape: 'box', phys: 'wood', density: 0.32, friction: 0.08, el: 'wood', burnTime: 30, hp: 120, fragile: 14, debris: 'plank', debrisN: 10, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', heavy: 1, rolls: true },
  wheelbarrow:  { model: 'prop_wheelbarrow', shape: 'box', phys: 'wood', density: 0.4, friction: 0.12, el: 'wood', hp: 50, fragile: 12, debris: 'plank', debrisN: 6, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break', rolls: true },
  log:          { rolling: { roll: 0.22 }, model: 'prop_tree_log', tint: 0xb89a88, shape: 'hull', phys: 'wood', el: 'wood', burnTime: 45, hp: 90, fragile: 18, debris: 'plank', debrisN: 7, debrisColor: [0x6b4a33, 0x8b5a3c, 0xc49a6c], fx: 'wood_break', sfx: 'wood_break', heavy: 1 },
  log_short:    { rolling: { roll: 0.22 }, model: 'prop_log_a', shape: 'hull', phys: 'wood', el: 'wood', burnTime: 35, hp: 60, fragile: 16, debris: 'plank', debrisN: 5, debrisColor: [0x6b4a33, 0x8b5a3c, 0xc49a6c], fx: 'wood_break', sfx: 'wood_break' },
  planks:       { model: 'prop_planks_stack', shape: 'box', phys: 'wood', el: 'wood', hp: 40, fragile: 12, debris: 'plank', debrisN: 7, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break' },
  plank:        { model: 'prop_plank_a', shape: 'box', phys: 'wood', el: 'wood', hp: 14, fragile: 12, debris: 'plank', debrisN: 3, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break' },
  // a little mast with a sailcloth on a cross foot: a craft part (src/craft/) that catches the wind when tied to a raft
  sail:         { build: 'sail', shape: 'box', phys: 'wood', density: 0.07, el: 'wood', hp: 90, fragile: 45, debris: 'plank', debrisN: 4, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'cloth_rustle' },
  ladder:       { model: 'prop_ladder', shape: 'box', phys: 'wood', density: 0.3, el: 'wood', hp: 20, fragile: 12, debris: 'plank', debrisN: 5, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break' },
  bench:        { model: 'prop_bench', shape: 'box', phys: 'wood', el: 'wood', hp: 30, fragile: 12, debris: 'plank', debrisN: 5, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break' },
  stool:        { model: 'prop_stool', shape: 'box', phys: 'wood', density: 0.3, el: 'wood', hp: 14, fragile: 10, debris: 'plank', debrisN: 4, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break' },
  table_low:    { model: 'prop_table_low', shape: 'box', phys: 'wood', el: 'wood', hp: 24, fragile: 11, debris: 'plank', debrisN: 5, debrisColor: WOOD_DEBRIS, fx: 'wood_break', sfx: 'wood_break' },
  // ---- stone ----------------------------------------------------------------------------------------------------
  boulder_l:    { rolling: { roll: 0.06 }, model: 'prop_boulder_3', scale: 0.9, shape: 'sphere', shrink: 0.82, phys: 'stone', el: 'stone', hp: 140, fragile: 22, debris: 'chunk', debrisN: 6, debrisColor: STONE, fx: 'shatter_rock', sfx: 'rock_crumble', split: { into: 'boulder_m', n: 3 }, heavy: 1, boulder: true },
  boulder_m:    { rolling: { roll: 0.06 }, model: 'prop_boulder_2', shape: 'sphere', shrink: 0.82, phys: 'stone', el: 'stone', hp: 70, fragile: 20, debris: 'chunk', debrisN: 5, debrisColor: STONE, fx: 'shatter_rock', sfx: 'rock_crumble', split: { into: 'boulder_s', n: 3 }, heavy: 1, boulder: true },
  boulder_s:    { rolling: { roll: 0.07 }, model: 'prop_boulder_1', shape: 'sphere', shrink: 0.85, phys: 'stone', el: 'stone', hp: 30, fragile: 18, debris: 'chunk', debrisN: 5, debrisColor: STONE, fx: 'shatter_rock', sfx: 'rock_crumble', drops: [['stardust', 0.3, 1, 1]], boulder: true },
  // ---- ice ------------------------------------------------------------------------------------------------------
  snowball:     { build: 'snowball', shape: 'sphere', phys: 'ice', density: 0.5, friction: 0.5, el: 'ice', hp: 10, fragile: 9, debris: 'ball', debrisN: 6, debrisColor: [0xf4f8ff, 0xdfeaff], fx: 'shatter_ice', sfx: 'ice_shatter', behave: 'melt' },
  ice_block:    { build: 'ice_block', shape: 'box', phys: 'ice', el: 'ice', hp: 30, fragile: 10, debris: 'chunk', debrisN: 6, debrisColor: [0xbfe8ff, 0x9fd8ff, 0xe8f8ff], fx: 'shatter_ice', sfx: 'ice_shatter', behave: 'melt' },
  // ---- food -----------------------------------------------------------------------------------------------------
  apple:        { model: 'prop_apple_red', scale: 1.6, shape: 'sphere', phys: 'flesh', el: 'flesh', flammable: 0.8, hp: 4, fragile: 13, debris: 'ball', debrisN: 3, debrisColor: [0xd8362c, 0xfff1c9], fx: 'hit_water', behave: 'food', food: 'apple', roast: 'apple_roasted' },
  apple_roasted:{ model: 'prop_apple_red', scale: 1.6, tint: 0x7a3a1c, shape: 'sphere', phys: 'flesh', el: 'flesh', flammable: 0, hp: 4, fragile: 13, debris: 'ball', debrisN: 3, debrisColor: [0x7a3a1c, 0xd8a05a], behave: 'food', food: 'roasted_apple' },
  pumpkin:      { model: 'prop_pumpkin', shape: 'sphere', shrink: 0.8, phys: 'flesh', density: 0.7, el: 'flesh', flammable: 0.3, hp: 14, fragile: 10, debris: 'ball', debrisN: 6, debrisColor: [0xf08a24, 0xffc46b], fx: 'hit_earth', sfx: 'hit_body', drops: [['pumpkin', 0.7, 1, 1]], behave: 'food', food: 'pumpkin' },
  fish:         { model: 'prop_fish', shape: 'box', phys: 'flesh', el: 'flesh', flammable: 0.6, hp: 4, fragile: 15, debris: 'ball', debrisN: 2, debrisColor: [0x8fb3c9], behave: 'food', food: 'fish', roast: 'fish_grilled' },
  fish_grilled: { model: 'prop_fish', tint: 0x8a5a2c, shape: 'box', phys: 'flesh', el: 'flesh', flammable: 0, hp: 4, fragile: 15, debris: 'ball', debrisN: 2, debrisColor: [0x8a5a2c], behave: 'food', food: 'grilled_fish' },
  mushroom:     { model: 'prop_mushroom', shape: 'cylinder', phys: 'flesh', density: 0.5, el: 'flesh', flammable: 0.5, hp: 4, fragile: 12, debris: 'ball', debrisN: 2, debrisColor: [0xd8362c, 0xfff1e0], behave: 'food', food: 'mushroom' },
  // ---- fire sources, lights, sound ------------------------------------------------------------------------------
  brazier:      { build: 'brazier', shape: 'cylinder', phys: 'metal', density: 1.2, el: 'metal', hp: 400, fragile: Infinity, behave: 'fire', lit: 'auto', flameY: 0.42, flameScale: 1.1, light: 12, heavy: 0.6 },
  campfire:     { model: 'prop_bonfire', shape: 'cylinder', shrink: 0.7, fixed: true, phys: 'wood', el: 'stone', hp: 999, fragile: Infinity, behave: 'fire', lit: true, flameY: 0.1, flameScale: 1.3, light: 14, hideFire: true },
  torch_post:   { build: 'torch_post', shape: 'cylinder', fixed: true, r: 0.12, phys: 'wood', el: 'metal', conductive: false, hp: 999, fragile: Infinity, behave: 'fire', lit: 'auto', flameY: 1.05, flameScale: 0.55, light: 9 },
  lantern_post: { build: 'lantern_post', shape: 'cylinder', fixed: true, r: 0.12, phys: 'wood', el: 'paper', hp: 999, fragile: Infinity, behave: 'lantern', lit: 'auto', light: 10 },
  andon:        { model: 'prop_andon', shape: 'box', phys: 'wood', density: 0.3, el: 'paper', hp: 10, fragile: 9, debris: 'sliver', debrisN: 5, debrisColor: PAPER, fx: 'wood_break', sfx: 'paper', behave: 'lantern', lit: 'auto', light: 7, glowPart: true },
  shrine_bell:  { build: 'shrine_bell', shape: 'box', fixed: true, phys: 'wood', el: 'metal', hp: 999, fragile: Infinity, behave: 'bell', sound: 'shrine_bell' },
  wind_chime:   { build: 'wind_chime', shape: 'cylinder', fixed: true, r: 0.06, phys: 'wood', el: 'stone', hp: 999, fragile: Infinity, behave: 'chime', sound: 'wind_chime' },
};

/** Types whose live instances should be counted as "fire sources" by fire-adjacent logic (roasting, ignition). */
export const FIRE_BEHAVES = new Set(['fire']);
