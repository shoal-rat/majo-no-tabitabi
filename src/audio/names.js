// Sound name table: logical name -> asset ids (one picked at random, never the same twice in a row) + playback rules.
// Fields (all optional except one of ids / synth / alias):
//   ids     asset ids in assets/manifest.json (type 'audio')
//   synth   procedural fallback kind (synth.js) used when there are no ids, or when every id fails to load
//   alias   another name in this table (shares its rules unless overridden here)
//   vol     base volume (0..1.5)         pitch  ±random jitter (0.06 = ±6 %)      rate  base playback rate
//   poly    max simultaneous voices      cd     cooldown seconds between starts (also dedupes same-frame duplicates)
//   range   metres until silent (positional only, ≤ ~75)   bus 'sfx' | 'ui' | 'stinger'   loop  true for loops
//   also    [{ name, chance, vol, delay }] extra layers
//   pri     priority for voice stealing (0..3, default 1)
// Music moods and ambience beds are at the bottom.

const D = { vol: 1, pitch: 0.05, rate: 1, poly: 4, cd: 0.04, range: 60, bus: 'sfx', pri: 1 };
const n = (pre, k, from = 1) => Array.from({ length: k }, (_, i) => `${pre}_${i + from}`);

export const SFX = {
  // ---------- UI (non-positional, ui bus) ----------
  ui_move:    { ids: ['sfx_ui_move', 'sfx_ui_move_2'], vol: 0.55, poly: 2, cd: 0.03, bus: 'ui' },
  ui_select:  { ids: ['sfx_ui_confirm'], vol: 0.7, poly: 2, bus: 'ui' },
  ui_confirm: { alias: 'ui_select' },
  ui_cancel:  { ids: ['sfx_ui_cancel'], vol: 0.7, poly: 2, bus: 'ui' },
  ui_back:    { alias: 'ui_cancel' },
  ui_open:    { ids: ['sfx_ui_open', 'sfx_book_open'], vol: 0.65, poly: 2, cd: 0.08, bus: 'ui' },
  ui_close:   { ids: ['sfx_ui_close', 'sfx_book_close'], vol: 0.65, poly: 2, cd: 0.08, bus: 'ui' },
  ui_error:   { ids: ['sfx_ui_error'], vol: 0.6, poly: 1, cd: 0.1, bus: 'ui' },
  ui_page:    { ids: n('sfx_paper', 3), vol: 0.6, poly: 2, cd: 0.06, bus: 'ui' },
  ui_text:    { synth: 'tick', vol: 0.32, pitch: 0.12, poly: 2, cd: 0.035, bus: 'ui' },
  ui_toggle:  { ids: ['sfx_ui_toggle'], vol: 0.6, poly: 2, bus: 'ui' },
  ui_save:    { ids: ['sfx_ui_save'], vol: 0.6, poly: 1, cd: 0.5, bus: 'ui' },
  ui_scroll:  { ids: ['sfx_ui_scroll'], vol: 0.5, poly: 1, cd: 0.1, bus: 'ui' },
  ui_chime:   { ids: ['sfx_ui_confirm_2'], vol: 0.6, poly: 1, cd: 0.3, bus: 'ui' },
  ui_cancel_soft: { ids: ['sfx_ui_cancel_2'], vol: 0.6, poly: 1, cd: 0.3, bus: 'ui' },
  buy:        { ids: ['sfx_ui_buy'], vol: 0.8, poly: 1, cd: 0.1, bus: 'ui' },
  stamp:      { ids: ['sfx_ui_stamp'], vol: 0.9, pitch: 0.03, poly: 1, cd: 0.1, bus: 'ui', also: [{ name: 'taiko', chance: 1, vol: 0.35 }] },
  paper:      { ids: n('sfx_paper', 3), vol: 0.6, poly: 3, cd: 0.05 },
  book_open:  { ids: ['sfx_book_open'], vol: 0.7, poly: 1, bus: 'ui' },
  book_close: { ids: ['sfx_book_close'], vol: 0.7, poly: 1, bus: 'ui' },
  learn:      { ids: ['sfx_learn_fanfare'], vol: 0.8, pitch: 0, poly: 1, cd: 4, bus: 'stinger', pri: 3 },
  levelup:    { ids: ['sfx_levelup_chime'], vol: 0.8, pitch: 0, poly: 1, cd: 1, bus: 'stinger', pri: 3, also: [{ name: 'levelup_rise', chance: 1, vol: 0.6 }] },
  levelup_rise: { ids: ['sfx_levelup'], vol: 0.6, pitch: 0, poly: 1, cd: 1, bus: 'stinger' },
  stinger_quest:   { ids: ['sfx_koto_stinger_1'], vol: 0.85, pitch: 0, poly: 1, cd: 3, bus: 'stinger', pri: 3 },
  stinger_lantern: { ids: ['sfx_koto_stinger_2'], vol: 0.9, pitch: 0, poly: 1, cd: 3, bus: 'stinger', pri: 3, also: [{ name: 'shrine_bell', chance: 1, vol: 0.7, delay: 0.15 }] },
  stinger_victory: { ids: ['sfx_jingle_festival'], vol: 0.75, pitch: 0, poly: 1, cd: 5, bus: 'stinger', pri: 3 },
  festival:   { ids: ['sfx_jingle_festival'], vol: 0.7, pitch: 0, poly: 1, cd: 5 },

  // ---------- heroine ----------
  step_grass: { ids: n('sfx_step_grass', 4), vol: 0.42, pitch: 0.08, poly: 3, cd: 0.06, range: 30 },
  step_stone: { ids: n('sfx_step_stone', 4), vol: 0.45, pitch: 0.08, poly: 3, cd: 0.06, range: 30 },
  step_wood:  { ids: n('sfx_step_wood', 4), vol: 0.45, pitch: 0.07, poly: 3, cd: 0.06, range: 30 },
  step_water: { ids: n('sfx_step_water', 4), vol: 0.5, pitch: 0.08, poly: 3, cd: 0.06, range: 30 },
  step_snow:  { synth: 'snow', vol: 0.55, pitch: 0.1, poly: 3, cd: 0.06, range: 30 },
  step_sand:  { synth: 'sand', vol: 0.5, pitch: 0.1, poly: 3, cd: 0.06, range: 30 },
  step_path:  { ids: n('sfx_step_grass', 4), rate: 0.86, vol: 0.4, pitch: 0.07, poly: 3, cd: 0.06, range: 30, also: [{ name: 'step_sand', chance: 1, vol: 0.35 }] },
  step_metal: { ids: n('sfx_step_stone', 4), rate: 1.35, vol: 0.5, pitch: 0.06, poly: 3, cd: 0.06, range: 30 },
  step_ice:   { ids: n('sfx_step_stone', 4), rate: 1.2, vol: 0.4, pitch: 0.06, poly: 3, cd: 0.06, range: 30, also: [{ name: 'crystal', chance: 0.25, vol: 0.15 }] },
  step_soft:  { synth: 'sand', rate: 0.8, vol: 0.35, pitch: 0.1, poly: 3, cd: 0.06, range: 30 },
  jump:       { ids: ['sfx_jump'], vol: 0.45, pitch: 0.06, poly: 2, cd: 0.08, range: 30, also: [{ name: 'voice_jump', chance: 0.3, vol: 0.5 }] },
  jump_air:   { ids: n('sfx_swish', 3), vol: 0.6, rate: 0.85, pitch: 0.06, poly: 2, cd: 0.08, range: 30, also: [{ name: 'wing_flap', chance: 1, vol: 0.45 }] },
  land:       { ids: ['sfx_land'], vol: 0.6, pitch: 0.06, poly: 2, cd: 0.12, range: 35 },
  land_soft:  { ids: ['sfx_land_soft'], vol: 0.5, pitch: 0.08, poly: 2, cd: 0.1, range: 30 },
  dodge:      { ids: ['sfx_dash'], vol: 0.65, pitch: 0.06, poly: 2, cd: 0.1, range: 35, also: [{ name: 'voice_effort', chance: 0.35, vol: 0.45 }] },
  dash:       { alias: 'dodge' },
  wings_open: { ids: n('sfx_wing_flap', 2), vol: 0.7, pitch: 0.06, poly: 1, cd: 0.25, range: 35, also: [{ name: 'sparkle', chance: 1, vol: 0.35 }] },
  wing_flap:  { ids: n('sfx_wing_flap', 2), vol: 0.55, pitch: 0.08, poly: 3, cd: 0.06, range: 40 },
  player_hurt:{ ids: n('sfx_voice_hurt', 3), vol: 0.75, pitch: 0.04, poly: 1, cd: 0.35, range: 40, pri: 2, also: [{ name: 'hit_body', chance: 1, vol: 0.6 }] },
  hurt:       { alias: 'player_hurt' },
  player_burn:{ ids: ['sfx_hit_fire_2'], vol: 0.45, pitch: 0.1, poly: 1, cd: 0.6, range: 35, also: [{ name: 'voice_hurt', chance: 0.4, vol: 0.5 }] },
  player_die: { ids: ['sfx_debuff'], vol: 0.8, pitch: 0, poly: 1, cd: 2, range: 60, pri: 3, also: [{ name: 'voice_hurt', chance: 1, vol: 0.8 }] },
  voice_hurt: { ids: n('sfx_voice_hurt', 3), vol: 0.7, pitch: 0.04, poly: 1, cd: 0.3, range: 40 },
  voice_jump: { ids: n('sfx_voice_jump', 2), vol: 0.55, pitch: 0.04, poly: 1, cd: 0.4, range: 30 },
  voice_effort: { ids: n('sfx_voice_effort', 3), vol: 0.6, pitch: 0.04, poly: 1, cd: 0.3, range: 35 },
  voice_healed: { ids: ['sfx_voice_healed'], vol: 0.6, pitch: 0.03, poly: 1, cd: 1, range: 30 },
  heal:       { ids: n('sfx_heal', 2), vol: 0.7, pitch: 0.03, poly: 1, cd: 0.4, range: 40, also: [{ name: 'voice_healed', chance: 0.5, vol: 0.6, delay: 0.25 }] },
  revive:     { ids: ['sfx_revive'], vol: 0.8, pitch: 0, poly: 1, cd: 2, range: 60, pri: 3 },
  swim:       { ids: ['sfx_swim'], vol: 0.45, pitch: 0.08, poly: 2, cd: 0.4, range: 30 },
  climb:      { ids: ['sfx_climb'], vol: 0.5, pitch: 0.1, poly: 2, cd: 0.1, range: 30 },
  cloth:      { ids: ['sfx_cloth_rustle'], vol: 0.5, pitch: 0.1, poly: 2, cd: 0.1, range: 30 },
  guard:      { ids: ['sfx_buff_defense'], vol: 0.6, pitch: 0.04, poly: 1, cd: 0.25, range: 40 },
  parry:      { ids: ['sfx_hit_heavy'], vol: 0.8, pitch: 0.05, poly: 2, cd: 0.08, range: 50, pri: 2, also: [{ name: 'crystal', chance: 1, vol: 0.8 }] },
  mana_empty: { ids: ['sfx_ui_error'], vol: 0.4, rate: 0.8, poly: 1, cd: 0.6, range: 20 },

  // ---------- broom ----------
  broom_summon:  { ids: ['sfx_teleport_1'], vol: 0.6, pitch: 0.03, poly: 1, cd: 0.4, range: 40, also: [{ name: 'sparkle', chance: 1, vol: 0.5, delay: 0.1 }] },
  broom_dismiss: { ids: ['sfx_teleport_2'], vol: 0.45, rate: 1.25, pitch: 0.03, poly: 1, cd: 0.4, range: 40 },
  broom_boost:   { ids: ['sfx_whoosh_1', 'sfx_whoosh_3'], vol: 0.75, pitch: 0.05, poly: 1, cd: 0.3, range: 40 },
  player_broom_boost: { ids: ['sfx_broom_tailwind'], vol: 0.95, pitch: 0, poly: 1, cd: 0.3, range: 40 },
  broom_turn:    { ids: ['sfx_whoosh_2'], vol: 0.5, pitch: 0.08, poly: 1, cd: 0.3, range: 40 },
  broom_loop:    { ids: ['sfx_broom_whoosh_loop'], loop: true, vol: 0.7 },

  // ---------- spells: cast / hit per element ----------
  cast_fire:    { ids: ['sfx_cast_fire', 'sfx_cast_fire_2'], vol: 0.75, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  cast_water:   { ids: ['sfx_cast_water'], vol: 0.7, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  cast_ice:     { ids: ['sfx_cast_ice'], vol: 0.7, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  cast_wind:    { ids: ['sfx_cast_wind'], vol: 0.75, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  cast_thunder: { ids: ['sfx_cast_thunder'], vol: 0.7, pitch: 0.05, poly: 3, cd: 0.05, pri: 2 },
  cast_earth:   { ids: ['sfx_cast_earth'], vol: 0.8, pitch: 0.05, poly: 3, cd: 0.05, pri: 2 },
  cast_sun:     { ids: ['sfx_cast_sun'], vol: 0.7, pitch: 0.04, poly: 3, cd: 0.05, pri: 2 },
  cast_moon:    { ids: ['sfx_cast_moon'], vol: 0.7, pitch: 0.04, poly: 3, cd: 0.05, pri: 2 },
  cast_dark:    { ids: ['sfx_cast_dark'], vol: 0.7, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  cast_charm:   { ids: n('sfx_swish', 3), vol: 0.5, rate: 1.15, pitch: 0.1, poly: 4, cd: 0.04, also: [{ name: 'paper', chance: 0.5, vol: 0.4 }] },
  charm:        { alias: 'cast_charm' },
  hit_fire:     { ids: ['sfx_hit_fire', 'sfx_hit_fire_2'], vol: 0.8, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  hit_water:    { ids: ['sfx_hit_water'], vol: 0.75, pitch: 0.08, poly: 3, cd: 0.05, pri: 2 },
  hit_ice:      { ids: ['sfx_hit_ice'], vol: 0.75, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  hit_wind:     { ids: ['sfx_hit_wind'], vol: 0.7, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  hit_thunder:  { ids: ['sfx_zap_1', 'sfx_zap_2'], vol: 0.8, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  hit_earth:    { ids: ['sfx_hit_earth'], vol: 0.85, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  hit_sun:      { ids: ['sfx_hit_sun'], vol: 0.75, pitch: 0.04, poly: 3, cd: 0.05, pri: 2 },
  hit_moon:     { ids: ['sfx_hit_moon'], vol: 0.75, pitch: 0.04, poly: 3, cd: 0.05, pri: 2 },
  hit_dark:     { ids: ['sfx_hit_dark'], vol: 0.75, pitch: 0.06, poly: 3, cd: 0.05, pri: 2 },
  hit_charm:    { ids: n('sfx_hit_body', 3), rate: 1.3, vol: 0.45, pitch: 0.1, poly: 3, cd: 0.04 },
  explosion:     { ids: ['sfx_explosion_small'], vol: 0.9, pitch: 0.08, poly: 3, cd: 0.05, range: 65, pri: 2 },
  explosion_big: { ids: ['sfx_explosion_large'], vol: 1.0, pitch: 0.05, poly: 2, cd: 0.1, range: 75, pri: 3 },
  thunder:       { ids: ['sfx_hit_thunder'], vol: 1.0, pitch: 0.06, poly: 3, cd: 0.06, range: 75, pri: 3 },
  thunder_chain: { ids: ['sfx_zap_1', 'sfx_zap_2'], vol: 0.6, pitch: 0.1, poly: 3, cd: 0.08 },
  zap:          { ids: ['sfx_zap_1', 'sfx_zap_2'], vol: 0.55, pitch: 0.1, poly: 3, cd: 0.06 },
  spark:        { alias: 'zap', vol: 0.3 },
  steam:        { ids: ['sfx_steam_sizzle'], vol: 0.55, pitch: 0.1, poly: 2, cd: 0.15 },
  freeze:       { ids: ['sfx_cast_ice'], rate: 1.25, vol: 0.55, pitch: 0.06, poly: 2, cd: 0.1 },
  ignite:       { ids: ['sfx_lantern_ignite', 'sfx_cast_fire_2'], vol: 0.55, pitch: 0.1, poly: 3, cd: 0.08 },
  extinguish:   { ids: ['sfx_steam_sizzle'], rate: 1.2, vol: 0.45, pitch: 0.1, poly: 2, cd: 0.15 },
  purify:       { ids: ['sfx_hit_sun'], rate: 1.1, vol: 0.7, pitch: 0.04, poly: 2, cd: 0.1, also: [{ name: 'sparkle', chance: 1, vol: 0.4 }] },
  melt:         { ids: ['sfx_bubble_1', 'sfx_bubble_2'], vol: 0.5, pitch: 0.1, poly: 2, cd: 0.1 },
  shatter_ice:  { ids: n('sfx_ice_shatter', 2), vol: 0.85, pitch: 0.07, poly: 3, cd: 0.05, pri: 2, also: [{ name: 'glass', chance: 0.5, vol: 0.4 }] },
  shatter_rock: { ids: n('sfx_rock_crumble', 2), vol: 0.9, pitch: 0.07, poly: 3, cd: 0.05, pri: 2 },
  shatter_crystal: { ids: n('sfx_glass_shatter', 2), vol: 0.85, pitch: 0.06, poly: 3, cd: 0.05, pri: 2, also: [{ name: 'crystal', chance: 1, vol: 0.5 }] },
  glass:        { ids: n('sfx_glass_shatter', 2), vol: 0.7, pitch: 0.06, poly: 2, cd: 0.05 },
  wood_break:   { ids: n('sfx_wood_break', 2), vol: 0.85, pitch: 0.08, poly: 3, cd: 0.05 },
  rock_fall:    { ids: ['sfx_rock_fall'], vol: 0.85, pitch: 0.08, poly: 2, cd: 0.1, range: 65 },
  splash:       { ids: n('sfx_splash', 3), vol: 0.7, pitch: 0.08, poly: 4, cd: 0.05 },
  splash_big:   { ids: ['sfx_splash_1', 'sfx_splash_2'], rate: 0.8, vol: 1.0, pitch: 0.05, poly: 2, cd: 0.1, range: 65 },
  bubble:       { ids: ['sfx_bubble_1', 'sfx_bubble_2'], vol: 0.5, pitch: 0.12, poly: 3, cd: 0.05 },
  whoosh:       { ids: n('sfx_whoosh', 3), vol: 0.65, pitch: 0.08, poly: 3, cd: 0.05 },
  swish:        { ids: n('sfx_swish', 3), vol: 0.55, pitch: 0.1, poly: 4, cd: 0.03 },
  gust:         { ids: ['sfx_hit_wind', 'sfx_whoosh_3'], vol: 0.6, pitch: 0.08, poly: 2, cd: 0.1 },
  tornado:      { ids: ['sfx_hit_wind'], rate: 0.7, vol: 0.85, pitch: 0.04, poly: 1, cd: 0.5, range: 70 },
  rain_start:   { ids: ['sfx_cast_water'], rate: 0.8, vol: 0.6, pitch: 0.04, poly: 1, cd: 0.5, range: 70 },
  meteor:       { ids: ['sfx_whoosh_1'], rate: 0.55, vol: 0.9, pitch: 0.04, poly: 2, cd: 0.2, range: 75, pri: 2 },
  crater:       { alias: 'explosion_big' },
  quake:        { synth: 'rumble', vol: 0.9, pitch: 0.05, poly: 2, cd: 0.2, range: 70, pri: 2 },
  rumble:       { alias: 'quake' },
  pillar:       { ids: ['sfx_cast_earth'], rate: 1.1, vol: 0.8, pitch: 0.06, poly: 3, cd: 0.05, also: [{ name: 'quake', chance: 1, vol: 0.5 }] },
  pillar_break: { ids: n('sfx_rock_crumble', 2), rate: 0.85, vol: 0.85, pitch: 0.06, poly: 3, cd: 0.05 },
  charge:       { ids: ['sfx_charge'], vol: 0.55, pitch: 0.03, poly: 2, cd: 0.2 },
  charge_done:  { synth: 'chime', vol: 0.55, pitch: 0.03, poly: 2, cd: 0.2, also: [{ name: 'crystal', chance: 1, vol: 0.4 }] },
  clash:        { ids: ['sfx_hit_heavy'], vol: 0.85, pitch: 0.06, poly: 3, cd: 0.05, range: 65, pri: 2, also: [{ name: 'zap', chance: 1, vol: 0.6 }] },
  clash_big:    { ids: ['sfx_explosion_large'], rate: 1.1, vol: 1.0, pitch: 0.04, poly: 2, cd: 0.1, range: 75, pri: 3, also: [{ name: 'crystal', chance: 1, vol: 0.6 }] },
  beam_start:   { ids: ['sfx_cast_sun'], rate: 0.85, vol: 0.7, pitch: 0.03, poly: 2, cd: 0.1, range: 65 },
  beam_loop:    { synth: 'hum', loop: true, vol: 0.55 },
  magic_circle: { ids: ['sfx_buff_defense'], vol: 0.55, pitch: 0.04, poly: 2, cd: 0.1 },
  summon:       { ids: ['sfx_buff_attack'], vol: 0.65, pitch: 0.04, poly: 2, cd: 0.2, also: [{ name: 'paper', chance: 1, vol: 0.6 }] },
  shikigami:    { alias: 'summon' },
  ultimate:     { ids: ['sfx_cast_sun'], rate: 0.7, vol: 1.0, pitch: 0, poly: 1, cd: 1, range: 75, pri: 3, also: [{ name: 'shrine_bell', chance: 1, vol: 0.9, delay: 0.2 }, { name: 'explosion_big', chance: 1, vol: 0.7, delay: 0.6 }] },
  kinkan:       { alias: 'ultimate' },
  grab:         { ids: ['sfx_hit_moon'], rate: 1.3, vol: 0.5, pitch: 0.06, poly: 2, cd: 0.1 },
  throw:        { alias: 'whoosh' },
  slow_field:   { ids: ['sfx_cast_moon'], rate: 0.7, vol: 0.7, pitch: 0.02, poly: 1, cd: 0.3 },
  buff_attack:  { ids: ['sfx_buff_attack'], vol: 0.6, pitch: 0.03, poly: 1, cd: 0.3 },
  buff_defense: { ids: ['sfx_buff_defense'], vol: 0.6, pitch: 0.03, poly: 1, cd: 0.3 },
  buff_speed:   { ids: ['sfx_buff_speed'], vol: 0.6, pitch: 0.03, poly: 1, cd: 0.3 },
  debuff:       { ids: ['sfx_debuff'], vol: 0.6, pitch: 0.03, poly: 1, cd: 0.3 },
  poison:       { ids: ['sfx_poison'], vol: 0.55, pitch: 0.05, poly: 2, cd: 0.3 },
  teleport:     { ids: n('sfx_teleport', 2), vol: 0.65, pitch: 0.04, poly: 2, cd: 0.2 },
  sleep:        { ids: ['sfx_sleep'], vol: 0.6, pitch: 0.02, poly: 1, cd: 0.5 },
  sparkle:      { synth: 'sparkle', vol: 0.45, pitch: 0.08, poly: 3, cd: 0.06 },

  // ---------- impacts / creatures ----------
  hit_body:   { ids: n('sfx_hit_body', 3), vol: 0.7, pitch: 0.08, poly: 4, cd: 0.03 },
  hit_heavy:  { ids: ['sfx_hit_heavy'], vol: 0.85, pitch: 0.06, poly: 2, cd: 0.05, pri: 2 },
  hit_wood:   { ids: ['sfx_hit_wood'], vol: 0.6, pitch: 0.1, poly: 4, cd: 0.04 },
  hit_stone:  { ids: ['sfx_hit_stone'], vol: 0.6, pitch: 0.1, poly: 4, cd: 0.04 },
  hit_metal:  { ids: ['sfx_hit_stone', 'sfx_bell_small_1'], rate: 1.4, vol: 0.5, pitch: 0.08, poly: 3, cd: 0.05 },
  hit_soft:   { ids: ['sfx_cloth_rustle'], vol: 0.45, pitch: 0.1, poly: 3, cd: 0.05 },
  enemy_hit:  { ids: n('sfx_hit_body', 3), vol: 0.75, pitch: 0.1, poly: 4, cd: 0.03, also: [{ name: 'creature_hurt', chance: 0.35, vol: 0.5 }] },
  enemy_die:  { ids: ['sfx_creature_hurt_2', 'sfx_slime_2'], vol: 0.8, pitch: 0.1, poly: 3, cd: 0.06, pri: 2, also: [{ name: 'purify', chance: 1, vol: 0.45, delay: 0.1 }] },
  creature_hurt: { ids: n('sfx_creature_hurt', 2), vol: 0.6, pitch: 0.12, poly: 3, cd: 0.06 },
  growl:      { ids: n('sfx_growl', 3), vol: 0.8, pitch: 0.08, poly: 2, cd: 0.3, range: 60 },
  howl:       { ids: n('sfx_howl', 2), vol: 0.85, pitch: 0.06, poly: 1, cd: 1, range: 75, pri: 2 },
  roar:       { ids: n('sfx_growl', 3), rate: 0.75, vol: 1.0, pitch: 0.04, poly: 1, cd: 1, range: 75, pri: 3 },
  squeak:     { ids: n('sfx_squeak', 3), vol: 0.6, pitch: 0.1, poly: 2, cd: 0.15, range: 40 },
  squeak_rat: { ids: ['sfx_squeak_rat'], vol: 0.5, pitch: 0.1, poly: 2, cd: 0.15, range: 35 },
  slime:      { ids: n('sfx_slime', 2), vol: 0.6, pitch: 0.12, poly: 3, cd: 0.08, range: 45 },
  wings:      { alias: 'wing_flap' },
  boss_death: { ids: ['sfx_explosion_large'], rate: 0.8, vol: 1.0, pitch: 0, poly: 1, cd: 2, range: 75, pri: 3, also: [{ name: 'purify', chance: 1, vol: 1, delay: 0.35 }, { name: 'shrine_bell', chance: 1, vol: 0.8, delay: 0.9 }] },
  enemy_shot: { ids: ['sfx_cast_dark'], rate: 1.3, vol: 0.5, pitch: 0.08, poly: 3, cd: 0.06 },

  // ---------- world / props / pickups ----------
  pickup:     { ids: ['sfx_pickup_1', 'sfx_pickup_2'], vol: 0.6, pitch: 0.05, poly: 3, cd: 0.04, range: 40 },
  pickup_gem: { ids: ['sfx_pickup_gem'], vol: 0.6, pitch: 0.05, poly: 3, cd: 0.04, range: 40 },
  coin:       { ids: n('sfx_coin', 3), vol: 0.6, pitch: 0.06, poly: 3, cd: 0.04, range: 40 },
  tear:       { ids: ['sfx_pickup_gem'], rate: 0.85, vol: 0.7, pitch: 0, poly: 1, cd: 0.3, range: 40, also: [{ name: 'chime', chance: 1, vol: 0.5, delay: 0.1 }] },
  chest:      { ids: ['sfx_chest_open'], vol: 0.8, pitch: 0.03, poly: 1, cd: 0.3, range: 40, also: [{ name: 'sparkle', chance: 1, vol: 0.5, delay: 0.35 }] },
  chest_open: { alias: 'chest' },
  chest_close:{ ids: ['sfx_chest_close'], vol: 0.7, pitch: 0.03, poly: 1, cd: 0.3, range: 40 },
  door:       { ids: ['sfx_door_open'], vol: 0.7, pitch: 0.04, poly: 2, cd: 0.2, range: 40 },
  door_open:  { alias: 'door' },
  door_close: { ids: ['sfx_door_close'], vol: 0.7, pitch: 0.04, poly: 2, cd: 0.2, range: 40 },
  door_creak: { ids: ['sfx_door_creak'], vol: 0.6, pitch: 0.06, poly: 2, cd: 0.2, range: 40 },
  lock_open:  { ids: ['sfx_lock_open'], vol: 0.7, pitch: 0.03, poly: 1, cd: 0.2, range: 40 },
  switch:     { ids: n('sfx_switch', 2), vol: 0.6, pitch: 0.05, poly: 2, cd: 0.1, range: 40 },
  bell:       { ids: n('sfx_bell_small', 3), vol: 0.6, pitch: 0.03, poly: 3, cd: 0.1 },
  shrine_bell:{ ids: n('sfx_shrine_bell', 2), vol: 0.8, pitch: 0.02, poly: 2, cd: 0.3, range: 70 },
  chime:      { ids: n('sfx_wind_chime', 2), vol: 0.5, pitch: 0.04, poly: 2, cd: 0.4, range: 40 },
  crystal:    { ids: n('sfx_crystal_chime', 3), vol: 0.55, pitch: 0.08, poly: 4, cd: 0.04 },
  taiko:      { ids: n('sfx_taiko', 2), vol: 0.85, pitch: 0.03, poly: 3, cd: 0.06, range: 70 },
  taiko_roll: { ids: ['sfx_taiko_roll'], vol: 0.85, pitch: 0, poly: 1, cd: 1, range: 70 },
  koto:       { ids: n('sfx_koto_stinger', 2), vol: 0.75, pitch: 0, poly: 1, cd: 0.5 },
  firework:   { ids: n('sfx_firework', 3), vol: 0.8, pitch: 0.06, poly: 4, cd: 0.08, range: 75 },
  lantern_ignite: { ids: ['sfx_lantern_ignite'], vol: 0.7, pitch: 0.05, poly: 2, cd: 0.1, also: [{ name: 'bell', chance: 0.6, vol: 0.35, delay: 0.12 }] },
  lantern_out:    { ids: ['sfx_steam_sizzle'], rate: 1.3, vol: 0.4, pitch: 0.05, poly: 2, cd: 0.1 },
  greatlantern:   { ids: ['sfx_lantern_ignite'], rate: 0.7, vol: 1.0, pitch: 0, poly: 1, cd: 2, range: 75, pri: 3, also: [{ name: 'shrine_bell', chance: 1, vol: 0.9, delay: 0.3 }] },
  checkpoint: { ids: n('sfx_bell_small', 3), vol: 0.6, pitch: 0, poly: 1, cd: 1, also: [{ name: 'ui_save', chance: 1, vol: 0.5, delay: 0.25 }] },
  race_ring:  { ids: n('sfx_crystal_chime', 3), rate: 0.9, vol: 0.75, pitch: 0, poly: 2, cd: 0.1, also: [{ name: 'whoosh', chance: 1, vol: 0.35 }] },
  // fx burst names that other systems might also hand to audio
  dust:       { ids: ['sfx_land_soft'], vol: 0.3, pitch: 0.12, poly: 2, cd: 0.08 },
  leaves:     { ids: ['sfx_cloth_rustle'], vol: 0.35, pitch: 0.15, poly: 2, cd: 0.1 },
  petals:     { alias: 'leaves', vol: 0.25 },
  feathers:   { ids: n('sfx_wing_flap', 2), vol: 0.4, pitch: 0.12, poly: 2, cd: 0.1 },

  // ---------- names other systems call by their asset-ish spelling (aliases share the target's cooldown, so two
  //            systems naming the same moment differently still play it once) ----------
  explosion_small: { alias: 'explosion' },
  explosion_large: { alias: 'explosion_big' },
  cast_fire_2:     { ids: ['sfx_cast_fire_2'], vol: 0.85, pitch: 0.06, poly: 3, cd: 0.05 },
  steam_sizzle:    { alias: 'steam' },
  ice_shatter:     { alias: 'shatter_ice' },
  rock_crumble:    { alias: 'shatter_rock' },
  glass_shatter:   { alias: 'glass' },
  crystal_chime:   { alias: 'crystal' },
  cloth_rustle:    { alias: 'cloth' },
  wind_chime:      { alias: 'chime' },
  bell_small:      { alias: 'bell' },
  koto_stinger:    { alias: 'koto' },
  learn_fanfare:   { alias: 'learn' },
  hit:             { alias: 'hit_body' },
  slash:           { alias: 'swish' },
  swing:           { alias: 'swish' },
  ring_bell:       { alias: 'shrine_bell' },
  beam_hum:        { alias: 'beam_loop' },
  // giant mushroom cap bounce: soft squelch + a low bubble 'boing' + the jump whoosh
  bounce:          { ids: n('sfx_slime', 2), rate: 0.8, vol: 0.75, pitch: 0.08, poly: 2, cd: 0.12,
                     also: [{ name: 'bubble', chance: 1, vol: 0.6 }, { name: 'jump', chance: 1, vol: 0.5, delay: 0.03 }] },

  // ---------- loops (loop() only) ----------
  fire_loop:  { ids: ['amb_fire'], loop: true, vol: 0.8 },
  wind_loop:  { ids: ['amb_wind_high'], loop: true, vol: 0.8, synth: 'wind' },
  rain_loop:  { ids: ['amb_rain'], loop: true, vol: 0.8 },
  water_loop: { ids: ['amb_river'], loop: true, vol: 0.8 },
  lake_loop:  { ids: ['amb_lake'], loop: true, vol: 0.8 },
  steam_loop: { ids: ['sfx_steam_sizzle'], loop: true, vol: 0.5 },
  charge_loop:{ synth: 'hum', loop: true, vol: 0.35, rate: 1.5 },
  swirl_loop: { ids: ['sfx_broom_whoosh_loop'], loop: true, vol: 0.7, rate: 0.8 },
};

/** Fill defaults + resolve aliases (rules of the alias target, overridden by the alias's own fields). */
export function resolveTable(table = SFX) {
  const out = {};
  const get = (name, depth = 0) => {
    if (out[name]) return out[name];
    const e = table[name];
    if (!e) return null;
    const base = e.alias && depth < 4 ? get(e.alias, depth + 1) : null;
    // key: cooldown identity — an alias shares its root's key, so the same moment is never played twice under two names
    const merged = Object.assign({}, D, base || {}, e, { name, key: base ? base.key : name });
    delete merged.alias;
    merged.loop = !!merged.loop;
    out[name] = merged;
    return merged;
  };
  for (const k of Object.keys(table)) get(k);
  return out;
}

// Surface from 'player:step' -> step sound.
export const STEP = {
  grass: 'step_grass', path: 'step_path', sand: 'step_sand', stone: 'step_stone', snow: 'step_snow', wood: 'step_wood',
  water: 'step_water', metal: 'step_metal', ice: 'step_ice', crystal: 'step_ice', paper: 'step_soft', cloth: 'step_soft',
  flesh: 'step_soft', spirit: 'step_soft', shade: 'step_soft', terrain: 'step_grass', static: 'step_stone', body: 'step_wood',
};

// Music moods -> track ids. The score is original (tools/music/, see its README): every track is rendered from a score
// file there and mastered to -18 LUFS, so MUSIC_TRIM only holds deliberate exceptions.
export const MUSIC = {
  title: 'bgm_title', home: 'bgm_home', sun: 'bgm_sun', dusk: 'bgm_dusk', night: 'bgm_night', town: 'bgm_town', pages: 'bgm_pages',
  flight: 'bgm_flight', battle: 'bgm_battle', duel: 'bgm_duel', boss: 'bgm_boss', final: 'bgm_final', ending: 'bgm_ending',
};
export const MUSIC_TRIM = {};
// Loop start (seconds) per track. A file is  intro | loop body | the body's first bars again ; it plays from 0 and then
// loops from here to its end, so the seam lands inside settled music. Written by `node tools/music/render.mjs --install`.
export const MUSIC_LOOP = {
  bgm_battle: 3.24325,
  bgm_boss: 4.285708,
  bgm_duel: 3.157896,
  bgm_dusk: 5.869562,
  bgm_ending: 18.260875,
  bgm_final: 3,
  bgm_flight: 3.478271,
  bgm_home: 4,
  bgm_night: 10.909083,
  bgm_pages: 10.909083,
  bgm_sun: 4.137937,
  bgm_title: 22.325583,
  bgm_town: 4.090917,
};
// Intensity layers: a second file of the same length, started in sync with its track and faded in with the director's
// fight intensity (0..1). Track + layer = the full mix.
export const MUSIC_LAYERS = { bgm_battle: 'bgm_battle_hot', bgm_boss: 'bgm_boss_hot', bgm_duel: 'bgm_duel_hot', bgm_final: 'bgm_final_hot' };

// Ambience beds: base beds (by land) + local layers. vol = full-weight level on the ambience bus.
export const AMB = {
  meadow:   { id: 'amb_meadow', vol: 0.55 },
  dusk:     { id: 'amb_forest_dusk', vol: 0.6 },
  night:    { id: 'amb_night', vol: 0.55 },
  mountain: { id: 'amb_mountain', vol: 0.65 },
  town:     { id: 'amb_town', vol: 0.6 },
  river:    { id: 'amb_river', vol: 0.6 },
  lake:     { id: 'amb_lake', vol: 0.65 },
  rain:     { id: 'amb_rain', vol: 0.7 },
  fire:     { id: 'amb_fire', vol: 0.7 },
  wind:     { id: 'amb_wind_high', vol: 0.6, synth: 'wind' },
  broom:    { id: 'sfx_broom_whoosh_loop', vol: 0.55 },
};
