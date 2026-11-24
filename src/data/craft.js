// Craft data (docs/JOURNEY.md §5 "Movement and craft", docs/api/craft.md): the star thread 「牵星线」, the star knots
// 「结星」 that tie parts together, and (restoration round) the back-light 「溯光」. Numbers only; words in
// src/locales/zh-CN/craft.js.

/** The star thread: catching, carrying and turning one loose part (and whatever is tied to it). */
export const THREAD = {
  RANGE: 20,            // m from her hand to a part she can catch
  MAX_MASS: 600,        // heaviest single part
  MAX_LIFT: 1800,       // heaviest tied assembly she can carry
  DIST_MIN: 2.4, DIST_MAX: 13, DIST_STEP: 0.7, DIST_RATE: 4,   // hold distance along her aim: wheel step / buttons m/s
  MANA: 1.5,            // mana per second while something is on the thread
  TURN: 0.006,          // rad per mouse pixel while {guard} is held
  STEP: Math.PI / 4,    // one tap of the turn / tilt buttons
  WALK: 0.6,            // her walk speed while carrying (× walk)
};

/** Star knots: ties between touching parts. */
export const KNOT = {
  MANA: 3,              // per tie
  REACH: 0.35,          // the magnet: a loose part this close to a held one shows knots, and is pulled flush on release
  MAX_PREVIEW: 4,       // knots shown while she holds a part against others
  MAX_SHOWN: 96,        // knot glints drawn (ties beyond still hold)
};

/** Caps by quality tier: parts in one assembly, tied bodies in the world. */
export const CAPS = {
  mobile: { parts: 8, bodies: 24 },
  low: { parts: 10, bodies: 32 },
  med: { parts: 16, bodies: 48 },
  high: { parts: 24, bodies: 64 },
};

/**
 * Parts: prop types the thread may catch. tie: false = it can be carried but not tied (it would shatter or melt);
 * sail: area in m² that catches the wind (the sail part).
 */
export const PARTS = {
  log: {}, log_short: {}, plank: {}, planks: {}, ladder: {}, sail: { sail: 2.6 },
  crate: {}, crate_small: {}, crate_large: {}, crate_apples: {}, crate_carrots: {},
  barrel: {}, barrel_large: {}, barrel_fish: {}, barrel_apples: {}, iron_box: {}, iron_ball: {},
  cart: {}, wheelbarrow: {}, bench: {}, stool: {}, table_low: {}, hay: {},
  boulder_s: {}, boulder_m: {}, boulder_l: {},
  ice_block: { tie: false }, snowball: { tie: false }, firework: { tie: false }, water_jar: { tie: false },
  pot: { tie: false }, vase: { tie: false }, jar: { tie: false }, jar_small: { tie: false }, pumpkin: { tie: false },
};

/** The back-light 「溯光」: one damaged thing's history run backwards. */
export const REWIND = {
  RANGE: 34,            // m from her to the aimed point
  PICK: 2.5,            // how near the aim must come to a damaged thing (beyond its own size)
  MANA: 16, PER_M: 2,   // mana: MANA + PER_M × (size + height), capped at 10 m
  DUR: 1.8,             // seconds a rewind runs
  CD: 1.2,
  SCAN: 0.1,            // aim scan interval (s)
  SHARDS: 24,           // pieces flying back (one instanced draw)
  KEEP: { mobile: 8, low: 10, med: 16, high: 24 },   // broken props remembered this session
};

/**
 * Where the arts are learned (checked on every load and every second, so an old save past the beat learns at once):
 * after: { quest, step } = that quest's step is done (or the quest is). The star thread is Fran's: after her chores
 * she shows that a witch carries firewood on a thread. The back-light comes with the roof-tile mending in the City
 * of Magic: putting the tiles back taught her the shape of it.
 */
export const LEARN = [
  { art: 'thread', after: { quest: 'apprentice', step: 'chores' } },
  { art: 'rewind', after: { quest: 'mages', step: 'repair' } },
];

/**
 * First-use beats on the journal's notes (G.onboarding): id, the event that ticks it off, seconds shown, beats first.
 * Their moments are in src/craft/lessons.js (a part near her, a part on the thread, a sail, damage near her).
 */
export const BEATS = [
  { id: 'catch', ev: 'craft:grab', max: 40 },
  { id: 'tie', ev: 'craft:tie', max: 40, after: ['catch'] },
  { id: 'sail', ev: 'craft:sail', max: 24, after: ['tie'] },
  { id: 'rewind', ev: 'craft:restored', max: 40 },
];

/**
 * Craft sites in the open country (one list for every episode: a future country adds rows with its episode).
 *   woodpile: loose parts for the first thread lesson, near Fran's cottage.
 *   mend:     a broken roadside lantern post; the back-light makes it whole; reward: a stamina level (and stardust).
 * x, z world; parts: [[prop type, dx, dz, yaw]]; episode: the episode it belongs to (1-based, for the 12-episode plan).
 */
export const SITES = [
  { id: 'fran_woodpile', kind: 'woodpile', episode: 1, x: 2088, z: -58, parts: [['log', 0, 0, 0.3], ['log', 1.2, 0.4, 0.2], ['log_short', -1.3, 0.8, 1.4], ['plank', 0.4, -1.4, 1.1], ['plank', -0.8, -1.6, 1.2]] },
  { id: 'mend_lake_road', kind: 'mend', episode: 2, x: 1690, z: -228, type: 'lantern_post', reward: { stamina: 1, stardust: 40 } },
  { id: 'mend_moor_road', kind: 'mend', episode: 2, x: 1336, z: -126, type: 'lantern_post', reward: { stamina: 1, stardust: 40 } },
  { id: 'mend_wilds_road', kind: 'mend', episode: 2, x: 196, z: -222, type: 'lantern_post', reward: { stamina: 1, stardust: 40 } },
];

/** Wind on a sail: impulse per second = wind (m/s) × area × SAIL.K, capped; her own gust gives one shove. */
export const SAIL = { K: 4, MAX: 160, GUST: 2.5, GUST_RANGE: 16 };
