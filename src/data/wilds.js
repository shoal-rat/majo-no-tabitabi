// The discovery loop of the open country (activities round, 2026-11-22): stray stars, landmark puzzles, ring courses,
// lookouts. Ids and coordinates only — every word the player reads lives in src/locales/zh-CN/gameplay.wilds.js.
// Read by src/gameplay/wilds*.js. Everything attaches to src/data/landmarks.js ids; nothing sits inside the city,
// the hometown or a story anchor's clearance (G.world.carveGuard is checked again at runtime).
//
// Placement records: { lm, x, z, y }  — x / z are LOCAL to the landmark's built site (G.structures.places['lm_'+lm].site:
// rotation included), y is a mode:
//   ['h', dy]    terrain under the point + dy          ['h0', dy]  terrain under the landmark centre + dy
//   ['top', dy]  topmost surface (platform / roof pad) + dy     ['abs', y]  absolute height
//   ['pool', dy] the landmark's still pool (tarn, plunge pool): its centre at the water level + dy (x / z ignored)
//   ['lip', dy]  crag falls: the lip the water spills over
//   ['clear', dy] the first height above every collider standing at the point (rock tops, a log, a cart) + dy
// Peaks: world x / z, y = terrain + dy (found offline: prominent hilltops away from roads, see tools in PROGRESS).

/** 迷星 (stray stars). Touch to collect; also from the broom. */
export const STARS = [
  { id: 'st_tree_crown', lm: 'ancient_tree', x: 0, z: 0, y: ['h0', 49] },
  { id: 'st_tree_roots', lm: 'ancient_tree', x: 6.5, z: -1.5, y: ['h', 0.7] },
  { id: 'st_tower_top', lm: 'north_watchtower', x: 0.6, z: 0.4, y: ['top', 0.9] },
  { id: 'st_mill_cap', lm: 'windmill_hill', x: 0, z: 0, y: ['h0', 14.2] },
  { id: 'st_mill_small', lm: 'windmill_hill', x: 14, z: 13, y: ['h', 10.6] },
  { id: 'st_keep_breach', lm: 'beacon_keep', x: 19.7, z: 3.5, y: ['h', 0.9] },
  { id: 'st_crown_lintel', lm: 'stone_crown', x: 0, z: 9.5, y: ['h', 8.9] },
  { id: 'st_falls_lip', lm: 'crag_falls', x: 0, z: 0, y: ['lip', 1.0] },
  { id: 'st_light_finial', lm: 'cape_lighthouse', x: 0, z: 0, y: ['h0', 24.4] },
  { id: 'st_aqueduct_top', lm: 'south_aqueduct', x: 0, z: 115, y: ['top', 0.9] },
  { id: 'st_aqueduct_arch', lm: 'south_aqueduct', x: 0, z: -93.6, y: ['h', 1.3] },
  { id: 'st_bridge_under', lm: 'brook_bridge', x: -6, z: 0, y: ['abs', 1.3] },
  { id: 'st_hermit_logs', lm: 'hermit_cottage', x: -4.2, z: -3.2, y: ['clear', 0.8] },
  { id: 'st_farmN_cart', lm: 'farm_north', x: 8, z: 4, y: ['clear', 1.4] },
  { id: 'st_farmS_hay', lm: 'farm_south', x: 23.8, z: 7.5, y: ['h', 3.4] },
  { id: 'st_farmW_roof', lm: 'farm_west', x: 0, z: 0, y: ['h0', 9.2] },
  { id: 'st_farmFN_well', lm: 'farm_far_north', x: -4, z: 7, y: ['h', 1.6] },
  { id: 'st_circle_heart', lm: 'moor_circle', x: 0, z: 0, y: ['h0', 1.7] },
  { id: 'st_chapel_cote', lm: 'chapel_ruin', x: 0, z: -6.5, y: ['h0', 11.4] },
  { id: 'st_tor_west', lm: 'tor_west', x: 0, z: 0, y: ['clear', 1.0] },
  { id: 'st_tor_south', lm: 'tor_south', x: 0, z: 0, y: ['clear', 1.0] },
  { id: 'st_hut_cone', lm: 'shepherd_hut', x: 0, z: 0, y: ['h0', 5.3] },
  { id: 'st_dolmen_hollow', lm: 'west_dolmen', x: 0, z: 0, y: ['h0', 0.9] },
  { id: 'st_quarry_derrick', lm: 'old_quarry', x: 4, z: 9, y: ['h', 7.9] },
  { id: 'st_tarn_mid', lm: 'reed_tarn', x: 0, z: 0, y: ['pool', 0.6] },
  { id: 'st_valley_east', lm: 'flower_valley', x: 35, z: -20, y: ['h', 1.0] },
  { id: 'st_valley_west', lm: 'flower_valley', x: -50, z: 30, y: ['h', 1.0] },
  { id: 'st_pier_end', lm: 'sea_pier', x: 0, z: 19, y: ['abs', 2.5] },
  { id: 'st_cove_boat', lm: 'south_cove', x: 4.5, z: 6, y: ['h', 1.4] },
  { id: 'st_bee_skep', lm: 'bee_garden', x: -4.2, z: 0.7, y: ['h', 1.8] },
  { id: 'st_oak_crown', lm: 'swing_oak', x: 0, z: 0, y: ['h0', 15] },
  { id: 'st_giant_log', lm: 'fallen_giant', x: 0, z: 0, y: ['clear', 0.9] },
  { id: 'st_snag_top', lm: 'moor_snags', x: 0, z: 0, y: ['h0', 9.2] },
  { id: 'st_well_mouth', lm: 'farm_well', x: 0, z: 0, y: ['h0', 1.15] },
  { id: 'st_shrine_pass', lm: 'shrine_passroad', x: 0, z: 0, y: ['h0', 3.3] },
  { id: 'st_shrine_city', lm: 'shrine_cityroad', x: 0, z: -1.3, y: ['h', 0.6] },
  { id: 'st_bench_north', lm: 'bench_northwood', x: 0, z: 0, y: ['h0', 0.95] },
  { id: 'st_cairn_west', lm: 'cairn_westcoast', x: 0, z: 0, y: ['h0', 3.1] },
  { id: 'st_rockfall_top', lm: 'pass_rockfall', x: 0, z: 0, y: ['h0', 5.2] },
];
/** Hilltop stars (world x, z, terrain + dy): the most prominent crests of each region (survey: local maxima over
 *  180 m with 90–240 m of prominence, outside every guarded zone) — the summits the eye goes to first. */
export const PEAK_STARS = [
  { id: 'pk_northwest', x: -1780, z: -1180, dy: 1.6 },
  { id: 'pk_cragridge', x: -730, z: -760, dy: 1.6 },
  { id: 'pk_fallshead', x: -310, z: -880, dy: 1.6 },
  { id: 'pk_southmoor', x: 1490, z: 530, dy: 1.6 },
  { id: 'pk_northmoor', x: 1310, z: -580, dy: 1.6 },
  { id: 'pk_farnorth', x: 1010, z: -1030, dy: 1.6 },
  { id: 'pk_southdown', x: 20, z: 560, dy: 1.6 },
  { id: 'pk_westcape', x: -2290, z: -40, dy: 1.6 },
  { id: 'pk_southcape', x: 2150, z: 680, dy: 1.6 },
];

/** Every N stars the stars "recognise each other": a reward and one line of the careless witch's note. */
export const STAR_STEP = 6;
/** Reward per step (index = step number - 1). dust: stardust; upgrade: a free level. */
export const STAR_REWARDS = [
  { dust: 30 }, { dust: 30, upgrade: 'broom' }, { dust: 40 }, { dust: 40, upgrade: 'charm' },
  { dust: 50 }, { dust: 50, upgrade: 'mana' }, { dust: 60 }, { dust: 80, upgrade: 'hp' },
];
/** Stardust per star picked up, per landmark found, per cairn stone. */
export const STAR_DUST = 3;
export const FIND_DUST = 5;
export const CAIRN_DUST = 10;

/** Discovery regions (journal page): ids in east-to-west order; regionOf() assigns a landmark. */
export const WILD_REGIONS = ['coast', 'moor', 'heart', 'crags', 'vale', 'west'];
export function regionOf(x, z) {
  if (x >= 1850) return 'coast';
  if (x >= 850) return 'moor';
  if (x >= -150) return 'heart';
  if (x >= -1450) return z < -150 ? 'crags' : 'vale';
  return 'west';
}

/**
 * Landmark puzzles. kind:
 *   beacon  — an iron basket / lamp (target) to light with fire or sun; the chest beside it is sealed until then
 *   bramble — a dry thorn thicket (at) over the chest: fire burns it away (water puts it out mid-burn)
 *   rubble  — loose stones (at) over the chest: thunder, earth ≥ 1.1 or a heavy blow shatters them
 *   drift   — a chest drifting in the pool, slipping away from her hand: ice freezes the pool and holds it
 *   ember   — a chest in smouldering embers, too hot to touch: water or ice quenches it
 *   circle  — the moor's thirteen rune stones: wet stones conduct; one thunder strike that charges them all opens it
 *   wheel   — a weathered wind-wheel post (at): three gusts in quick succession spin it up and the lid opens
 *   lantern — a paper sky lantern (at): fire warms it, it rises and drifts on the wind; catch it for what it carries
 * at / target / chest: placement records as above. loot: { dust, items: {id: n}, upgrade }.
 */
export const PUZZLES = [
  { id: 'pz_beacon_keep', lm: 'beacon_keep', kind: 'beacon', target: { x: 0, z: 0, y: ['h0', 17.1] }, chest: { x: -3, z: 2.6, y: ['top', 0] }, loot: { dust: 120, items: { moon_mochi: 1 }, upgrade: 'broom' } },
  { id: 'pz_lighthouse', lm: 'cape_lighthouse', kind: 'beacon', target: { x: 0, z: 0, y: ['h0', 20.35] }, chest: { x: 4.8, z: 2.2, y: ['h', 0] }, loot: { dust: 120, items: { sun_tea: 1 }, upgrade: 'charm' } },
  { id: 'pz_hermit_briar', lm: 'hermit_cottage', kind: 'bramble', at: { x: 2.6, z: -3.6, y: ['h', 0] }, loot: { dust: 60, items: { roasted_apple: 2 } } },
  { id: 'pz_chapel_briar', lm: 'chapel_ruin', kind: 'bramble', at: { x: 0, z: -3.9, y: ['h', 0] }, loot: { dust: 70, items: { dango: 1 } } },
  { id: 'pz_farm_briar', lm: 'farm_far_north', kind: 'bramble', at: { x: -12, z: 3, y: ['h', 0] }, loot: { dust: 50, items: { pumpkin: 1 } } },
  { id: 'pz_pass_rubble', lm: 'pass_rockfall', kind: 'rubble', at: { x: 0, z: 9, y: ['h', 0] }, loot: { dust: 70, items: { dango: 1 } } },
  { id: 'pz_quarry_rubble', lm: 'old_quarry', kind: 'rubble', at: { x: -1, z: 5, y: ['h', 0] }, loot: { dust: 80, items: { rice: 2 } } },
  { id: 'pz_aqueduct_rubble', lm: 'south_aqueduct', kind: 'rubble', at: { x: 3.2, z: -38.4, y: ['h', 0] }, loot: { dust: 80, items: { grilled_fish: 1 } } },
  { id: 'pz_tarn_drift', lm: 'reed_tarn', kind: 'drift', at: { x: 0, z: 0, y: ['pool', 0] }, loot: { dust: 70, items: { fish: 2 } } },
  { id: 'pz_falls_drift', lm: 'crag_falls', kind: 'drift', at: { x: 0, z: 0, y: ['pool', 0] }, loot: { dust: 100, items: { moon_mochi: 1 } } },
  { id: 'pz_charcoal_ember', lm: 'charcoal_camp', kind: 'ember', at: { x: 0.4, z: -3.9, y: ['h', 0] }, loot: { dust: 60, items: { roasted_apple: 2 } } },
  { id: 'pz_moor_circle', lm: 'moor_circle', kind: 'circle', chest: { x: 2.4, z: 1.6, y: ['h', 0] }, loot: { dust: 140, items: { sun_tea: 1 } } },
  { id: 'pz_mill_wheel', lm: 'windmill_hill', kind: 'wheel', at: { x: 7, z: -9, y: ['h', 0] }, loot: { dust: 70, items: { berry: 3 } } },
  { id: 'pz_crown_wheel', lm: 'stone_crown', kind: 'wheel', at: { x: 0, z: -4.2, y: ['h', 0] }, loot: { dust: 90, items: { dango: 2 } } },
  { id: 'pz_tor_north_lantern', lm: 'tor_north', kind: 'lantern', at: { x: 9, z: 0, y: ['h', 0] }, loot: { dust: 70, items: { apple: 3 } } },
  { id: 'pz_tor_west_lantern', lm: 'tor_west', kind: 'lantern', at: { x: 9, z: 3, y: ['h', 0] }, loot: { dust: 70, items: { carrot: 3 } } },
  { id: 'pz_tor_south_lantern', lm: 'tor_south', kind: 'lantern', at: { x: -9, z: 2, y: ['h', 0] }, loot: { dust: 70, items: { mushroom: 3 } } },
];

/** Cairns: interact (add a stone) → stars within `reach` are marked on the map; a little stardust. */
export const CAIRNS = ['cairn_southeast', 'cairn_westcoast', 'cairn_brookhill', 'cairn_southhill', 'cairn_farwest'];
export const CAIRN_REACH = 700;
/** High perches: standing up there marks the stars within `reach`. at: placement; above: metres over the terrain. */
export const PERCHES = [
  { id: 'pv_tower', lm: 'north_watchtower', x: 0, z: 0, above: 18, reach: 950 },
  { id: 'pv_light', lm: 'cape_lighthouse', x: 0, z: 0, above: 16, reach: 950 },
  { id: 'pv_keep', lm: 'beacon_keep', x: 0, z: 0, above: 13, reach: 950 },
  { id: 'pv_aqueduct', lm: 'south_aqueduct', x: 0, z: 0, above: 6, reach: 700, r: 140 },
];

/**
 * Ring courses (broom). rings: [x, z, dy] (world, height above the terrain or the sea). Medal times in seconds,
 * calibrated by the steering bot of tools/acceptance/journey-activities.mjs (ACT_RINGS=all) at plain cruise, broom level 0:
 * heart 54.9 s, coast 106.3 s, vale 71.5 s (cruise 15 m/s, bank-to-turn handling). Gold ≈ 0.88 × that (needs boosts and tight lines), silver ≈ 1.04 ×, bronze ≈ 1.35 ×. pay: first-time stardust per medal (better medals pay the difference).
 */
export const RINGS = [
  {
    id: 'rc_coast', start: 'cairn_southeast', radius: 3.6, medals: [94, 111, 144],
    rings: [[2050, 380, 6], [2105, 300, 9], [2230, 330, 12], [2350, 330, 7], [2370, 190, 14], [2362, 40, 12], [2320, -150, 18], [2260, -330, 14], [2205, -432, 20], [2060, -470, 12], [1915, -455, 10]],
  },
  {
    id: 'rc_heart', start: 'tor_south', radius: 3.6, medals: [48, 57, 74],
    rings: [[640, 290, 7], [585, 360, 6], [520, 300, 12], [482, 262, 26], [420, 205, 16], [350, 250, 8], [330, 340, 8], [400, 420, 12], [500, 440, 9], [590, 400, 7]],
  },
  {
    id: 'rc_vale', start: 'flower_valley', radius: 3.6, medals: [63, 74, 96],
    rings: [[-470, 320, 5], [-600, 370, 9], [-760, 430, 12], [-905, 470, 5], [-985, 440, 10], [-1095, 335, 4], [-1160, 285, 16], [-1190, 210, 16], [-1240, 120, 12], [-1320, 60, 9]],
  },
];
export const RING_PAY = { gold: 100, silver: 60, bronze: 35 };

/**
 * 残页试炼 (page trials, spell-tiers round 2026-11-23): where the charged (tier-2) form of each element is learned.
 * Fran teaches only the small forms; a witch who wrote the charged chapter long ago tore it out page by page and left one
 * page where each element is strongest, sealed and guarded. One site per discovery region, east to west along the road.
 * A site is a weathered marker stone (the element's sigil) beside a mechanism that answers only that element's small form
 * (BotW-style chemistry: wind sings through the harp, lightning goes to the rod, fire lights the candles, a rock pillar
 * lifts the sunken lectern, water wakes the bud, ice stops the spring). That breaks the seal and wakes the guardian, an
 * elite whose ward only the countering element breaks; beating it drops the page → G.spells.learn(el, 2) and the ceremony.
 * Seals answer only a named witch (flag majo_named), so every guardian meets the full tier-1 kit.
 * Fields: x / z world metres (survey: flat within 14 m, few trees, outside every guard / landmark / camp), face = yaw of
 * the marker (radians, 0 = +z), mech = mechanism kind (src/gameplay/wilds-pages.js), arena = fight radius (m).
 * guardian: base = combat TYPES id the guardian is built on (its own kit), hpMul, affixes (src/combat/wards.js AFFIXES),
 * ward = element of the 'warded' shell (types with a ward of their own ignore it), element = caster element.
 * Words: gameplay.wilds.pages.* (site names, hints, page lines), combat.enemy.<id> / combat.elite.<id> (plates).
 */
export const PAGE_SITES = [
  { id: 'pg_wind', el: 'wind', x: 2310, z: 358, face: 1.9, mech: 'harp', arena: 22,
    guardian: { base: 'paper', hpMul: 10, affixes: ['warded'], ward: 'wind' } },   // ×10 of 110 (was ×16 of 26 before the longer fights)
  { id: 'pg_thunder', el: 'thunder', x: 1300, z: 350, face: 3.0, mech: 'rod', arena: 20,
    guardian: { base: 'caster', element: 'thunder', hpMul: 2.6, affixes: ['warded', 'blink'], ward: 'thunder' } },
  { id: 'pg_fire', el: 'fire', x: 175, z: -555, face: 3.4, mech: 'candles', arena: 22,
    guardian: { base: 'embersnake', hpMul: 2.2, affixes: ['volatile'] } },
  { id: 'pg_earth', el: 'earth', x: -1225, z: -700, face: 0.6, mech: 'lectern', arena: 20,
    guardian: { base: 'golem', hpMul: 1.6, affixes: ['warded'], ward: 'earth' } },
  { id: 'pg_water', el: 'water', x: -565, z: 120, face: 5.2, mech: 'bud', arena: 22,
    guardian: { base: 'blob', hpMul: 5, affixes: ['warded', 'leech'], ward: 'water' } },
  { id: 'pg_ice', el: 'ice', x: -1700, z: -820, face: 4.1, mech: 'spring', arena: 22,
    guardian: { base: 'froststag', hpMul: 2, affixes: ['frenzy'] } },
];
/** First sighting (map pin, journal hint) within this many metres of the marker. */
export const PAGE_SIGHT = 85;
/** The guardian sinks back into its seal when she is this far from the arena centre (or falls); it wakes again on return. */
export const PAGE_LEAVE = 60;
/** A page whose form she already knows (an older save, ?allspells) pays this much stardust instead. */
export const PAGE_DUST = 160;
