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

/** Wind on a sail: impulse per second = wind (m/s) × area × SAIL.K, capped; her own gust gives one shove. */
export const SAIL = { K: 4, MAX: 160, GUST: 2.5, GUST_RANGE: 16 };
