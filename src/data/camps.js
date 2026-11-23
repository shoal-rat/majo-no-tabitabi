// Where foes live along the journey. Ids + coordinates only (names are in src/locales/zh-CN/combat.js).
// Nothing at home, in Fran's forest or inside the walled city; light company on the east moor; real camps in the wilds
// and up the high pass. combat/encounters.js streams them in (~85 m), respawns camps after `respawn` seconds of play
// (remembered in the save) and keeps them off the road and the story's anchors.

/** kinds: [[type, count], ...]   r: wander radius   respawn: play-seconds after the camp is cleared
 *  leader: { affixes } — the first member becomes an elite */
export const CAMPS = [
  // 东边的原野 east moor — stray pages, bog mud, a wolf pair
  { id: 'moor_pages', x: 1390, z: -200, r: 9, kinds: [['paper', 3]], respawn: 200 },
  { id: 'moor_bog', x: 1310, z: -10, r: 9, kinds: [['blob', 2]], respawn: 220 },
  { id: 'moor_wolves', x: 1170, z: -235, r: 11, kinds: [['wolf', 2]], respawn: 260 },
  { id: 'moor_west', x: 1080, z: -60, r: 9, kinds: [['paper', 2], ['blob', 1]], respawn: 220 },
  // between the moor and the wilds
  { id: 'brook_bats', x: 860, z: -235, r: 10, kinds: [['moth', 3]], respawn: 240 },
  { id: 'brook_mage', x: 700, z: -40, r: 10, kinds: [['caster', 1], ['paper', 2]], respawn: 300 },
  // 西行荒野 the wilds — real camps
  { id: 'wilds_pack', x: 330, z: -320, r: 13, kinds: [['wolf', 4]], respawn: 300, leader: { affixes: ['pack'] } },
  { id: 'wilds_bandits', x: 90, z: -330, r: 12, kinds: [['caster', 2], ['raider', 1]], respawn: 360 },
  { id: 'wilds_den', x: 40, z: -40, r: 11, kinds: [['embersnake', 1], ['wisp', 2]], respawn: 320 },
  { id: 'wilds_bog', x: 380, z: -90, r: 11, kinds: [['blob', 3], ['paper', 2]], respawn: 260 },
  { id: 'wilds_roost', x: -40, z: -300, r: 12, kinds: [['moth', 4]], respawn: 260 },
  // the long road west
  { id: 'road_mages', x: -420, z: -380, r: 12, kinds: [['caster', 2]], respawn: 320 },
  { id: 'road_snakes', x: -520, z: -130, r: 11, kinds: [['embersnake', 1], ['blob', 2]], respawn: 320 },
  { id: 'road_pack', x: -760, z: -350, r: 12, kinds: [['wolf', 3]], respawn: 300 },
  // 群峰隘口 the high pass — the old stone guards, frost stags and a bandit post
  { id: 'pass_ruin_n', x: -1180, z: -410, r: 12, kinds: [['golem', 1], ['paper', 2]], respawn: 400 },
  { id: 'pass_ruin_s', x: -1300, z: -170, r: 12, kinds: [['golem', 1]], respawn: 400 },
  { id: 'pass_stags', x: -1400, z: -220, r: 14, kinds: [['froststag', 2]], respawn: 380 },
  { id: 'pass_post', x: -1110, z: -150, r: 12, kinds: [['caster', 2], ['raider', 1]], respawn: 380 },
  { id: 'pass_roost', x: -1440, z: -430, r: 12, kinds: [['moth', 4]], respawn: 300 },
];

/** Named roaming elites: beaten once, remembered (G.state.combat.elites). hp = hp multiplier. */
export const ELITES = [
  { id: 'greymane', type: 'wolf', affixes: ['pack', 'frenzy'], x: 260, z: -430, r: 50, escorts: [['wolf', 3]], hp: 12 },
  { id: 'crowfeather', type: 'raider', affixes: ['blink', 'warded'], x: 20, z: -400, r: 60, escorts: [['raider', 1]], hp: 3.2, element: 'thunder', wardEl: 'thunder' },
  { id: 'redthroat', type: 'embersnake', affixes: ['volatile', 'bulwark'], x: -640, z: -60, r: 40, hp: 4.2 },
  { id: 'mossback', type: 'golem', affixes: ['bulwark', 'leech'], x: -1240, z: -450, r: 40, hp: 4.5 },
  { id: 'whitecrown', type: 'froststag', affixes: ['frenzy'], x: -1360, z: -110, r: 50, hp: 9.6 },
];

/** A light sprinkle of weak roamers along the road (x ranges of ROAD_ACROSS, west-bound). every: metres between spots. */
export const SPRINKLE = [
  { from: 1560, to: 1000, kinds: ['paper', 'blob', 'paper'], night: ['wisp', 'paper'], every: 70 },
  { from: 1000, to: 500, kinds: ['paper', 'moth'], night: ['wisp', 'moth'], every: 85 },
  { from: 500, to: -100, kinds: ['blob', 'paper', 'wisp'], night: ['wisp', 'moth'], every: 70 },
  { from: -100, to: -1000, kinds: ['paper', 'blob', 'wolf'], night: ['wisp', 'moth'], every: 85 },
  { from: -1000, to: -1560, kinds: ['moth', 'paper'], night: ['wisp', 'moth'], every: 75 },
];
/** The lake shore after the eclipse crossing: a few small roamers in a ring. */
export const SHORE = { x: 1725, z: -48, r: 190, n: 7, kinds: ['blob', 'paper', 'wisp'] };

/** No foe ever spawns, wanders or ambushes inside these circles. */
export const NO_FOES = [
  { x: 2220, z: 50, r: 230 },     // home
  { x: 2080, z: -60, r: 210 },    // Fran's forest, the trial clearing, the farewell spot
  { x: -2160, z: -520, r: 340 },  // the walled city of mages
];

/** Old engine data (kept empty: the journey has no nests). */
export const NESTS = [];

/** Waves for G.combat.spawnWave(id, pos?). The clearing trial builds its own lists. */
export const WAVES = {};

/** Default duel rings: story may pass its own position to startDuel(id, { pos }). */
export const DUEL_RINGS = {
  himawari: { x: -600, z: -22, r: 15 },
  kokonoe: { x: -52, z: 120, r: 15 },
  rikka: { x: -20, z: -528, r: 14 },
  naru: { x: 238, z: -90, r: 14 },
};

/** Boss arenas (centre + radius). */
export const ARENAS = {
  oboroga: { x: -30, z: -170, r: 30 },
  tomoshigui: { x: 120, z: 400, r: 34 },
  oboroyo: { x: 380, z: -34, r: 22 },
  mumyo: { x: 380, z: -34, r: 24 },
};

/** Ambient wildlife: { kind, x, z, r, n, time? } — time 'night' only shows under the Veil. */
export const WILDLIFE = [
  {kind:'dog',x:2193,z:54,r:12,n:1},{kind:'chicken',x:2247,z:78,r:8,n:4},
  {kind:'deer',x:2023,z:-61,r:17,n:3},{kind:'hedgehog',x:2005,z:-23,r:12,n:2},
  {kind:'sheep',x:1260,z:-103,r:5,n:4},{kind:'cow',x:1244,z:-95,r:8,n:2},
  {kind:'frog',x:944,z:392,r:11,n:3},{kind:'deer',x:660,z:-154,r:14,n:2},
  {kind:'raccoon',x:152,z:-217,r:9,n:2},{kind:'sheep',x:-333,z:-215,r:6,n:4},
  {kind:'deer',x:-1310,z:-480,r:22,n:3},{kind:'dog',x:-1982,z:-355,r:15,n:1},
  {kind:'cat',x:-2175,z:-509,r:8,n:2}

];
