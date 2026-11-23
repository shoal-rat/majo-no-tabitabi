// Persistent state (G.state) + settings (G.settings), stored in localStorage.
// All progress lives in G.state as plain JSON. Systems read it in start() and keep it up to date as things happen.
import { ANCHORS } from '../data/world.js';

const SAVE_KEY = 'majo_no_tabitabi_episodes_save_v1';
const SETTINGS_KEY = 'majo_no_tabitabi_settings_v1';

/** A brand-new game. Add new persistent fields HERE (with defaults) so old saves keep loading. */
export function defaultState() {
  return {
    version: 1,
    playTime: 0,                 // seconds
    player: { x: ANCHORS.spawn.x, z: ANCHORS.spawn.z, y: null, yaw: ANCHORS.spawn.face, hp: 100, mana: 100 },
    checkpoint: { id: 'home', x: ANCHORS.spawn.x, z: ANCHORS.spawn.z },
    /** upgrade levels bought / earned (0..5 each) */
    upgrades: { hp: 0, mana: 0, broom: 0, charm: 0 },
    /** counters: stardust(星屑) dango(团子) moontear(月之泪) + any ingredient / key item ids */
    inventory: { stardust: 0, dango: 2, moontear: 0 },
    /** 灵诀 levels: element id -> 0 (unknown) | 1 (small form) | 2 (big form). ids: fire water ice wind thunder earth sun moon.
     *  The story teaches level 1 (Fran); level 2 of each element is won at its page trial (src/gameplay/wilds-pages.js). */
    spells: {},
    selectedSpell: null,
    /** non-elemental abilities learned: broom, wings, guard, shikigami, kinkan -> true (dodge and charm are innate) */
    abilities: {},
    /** 「契」 gauge 0..1 */
    gauge: 0,
    /** story + tutorial booleans/values */
    flags: {},
    spellScars: [],              // ordered terrain edits from free-cast magic
    destruction: {},             // world/destruction.js: { v, flora: [x·10, z·10, wreck bits, …] } felled / charred / shattered
    /** quest id -> { state: 'active'|'done', step: number, vars: {} } */
    quests: {},
    lanterns: {},        // stone lantern id -> true once lit
    greatLanterns: {},   // great lantern id -> true once lit
    collected: {},       // collectible / chest id -> true
    discovered: {},      // POI id -> true once visited (shown on the map)
    stamps: {},          // travel-journal stamps (src/ui/map.js): itinerary stop id -> 1 once she has been there
    defeated: {},        // boss / nest id -> true
    races: {},           // race id -> best time (seconds)
    lore: {},            // 绘马 id -> true once read
    elementNotes: {},    // 元素笔记: combo id (src/elements/catalog.js) -> times she has caused it
    stats: { kills: 0, deaths: 0, distance: 0 },
    /** combat (journey foes): camp id -> playTime it was cleared (respawn timers), named elite id -> playTime beaten,
     *  foe types met (first-meeting hints), the clearing trial's record */
    combat: { cleared: {}, elites: {}, seen: {}, trials: { best: 0, clears: 0 } },
    /** wardrobe: the outfit she wears (src/data/outfits.js id); a new journey begins in her apprentice clothes */
    outfit: 'apprentice',
    /** open-country discoveries (src/gameplay/wilds.js): landmark id -> 1 found; star id -> 1 picked up / sighted on the
     *  map; puzzle id -> 'solved' | 'open'; ring course id -> { best, medal }; cairns / perches used; puzzles seen;
     *  steps = star rewards paid (every STAR_STEP stars); pages = 残页试炼 (tier-2 page trials, wilds-pages.js):
     *  site id -> 'seen' | 'open' (seal broken) | 'won' (guardian beaten, page waiting) | 'read' (charged form learned) */
    wilds: { lm: {}, stars: {}, sighted: {}, puzzles: {}, rings: {}, cairns: {}, perches: {}, seen: {}, steps: 0, pages: {} },
    /** roadside errands (src/gameplay/errands.js): errand id -> { s: 'active' | 'done', step, v }; keepsake id -> 1;
     *  traveller id -> 1 once she has met them (map pins, journal) */
    errands: { list: {}, keep: {}, seen: {} },
  };
}

export const defaultSettings = () => ({ master: 0.8, music: 0.6, sfx: 0.85, sens: 1, invertY: false, quality: 'high', shake: true, hints: true, lang: 'zh-CN', postAO: true, postBloom: true, postShafts: true, look: 'soft', cinematic: true,
  // touch controls (src/ui/touch.js): 'auto' = on phones / tablets; button size and opacity; drag-to-look speed
  touch: 'auto', touchSize: 1, touchAlpha: 0.8, touchSens: 1,
  // phones / tablets: true = never render fewer than 1080 lines (dynamic resolution only sheds scene cost; core/boot.js)
  keep1080: false });

function deepMerge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** Like deepMerge, but a stored value only replaces a default of the same kind (a hand-edited / damaged / old save
 *  must never put null or a string where the game expects a table or a number). Open tables (quests, lanterns …,
 *  empty by default) keep only well-formed entries. */
function sanitizeMerge(base, extra) {
  for (const k of Object.keys(extra)) {
    const v = extra[k], d = base[k];
    if (isObj(d)) {
      if (!isObj(v)) continue;
      if (Object.keys(d).length) sanitizeMerge(d, v);
      else if (k === 'quests') { for (const q of Object.keys(v)) if (isObj(v[q])) d[q] = v[q]; }
      else for (const q of Object.keys(v)) { const e = v[q]; if (e !== null && e !== undefined && typeof e !== 'function') d[q] = e; }
    } else if (typeof d === 'number') { if (typeof v === 'number' && Number.isFinite(v)) base[k] = v; }
    else if (typeof d === 'boolean') { if (typeof v === 'boolean') base[k] = v; }
    else if (typeof d === 'string') { if (typeof v === 'string') base[k] = v; }
    else if (d === null) { if (v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) base[k] = v; } // nullable fields (player.y, selectedSpell)
    else base[k] = v; // fields a system added itself (G.state.story …) are kept as stored
  }
  return base;
}

export function createSave(G) {
  let store = null;
  try { store = window.localStorage; store.getItem('x'); } catch (e) { store = null; }
  let lastWrite = 0;

  const save = {
    /** when true nothing is written (test runs, ?autostart=1) */
    disabled: false,
    exists() { try { return !!store && !!store.getItem(SAVE_KEY); } catch (e) { return false; } },
    /** Peek at the stored save without loading it (for the title screen). null if none. */
    peek() { try { return store ? JSON.parse(store.getItem(SAVE_KEY)) : null; } catch (e) { return null; } },
    /** Replace G.state with a fresh game. */
    reset() { G.state = defaultState(); G.world?.restoreSpellScars?.([]); G.world?.setTrialLake?.(false); return G.state; },
    /** Load the stored save into G.state. Returns false if there is none / it is corrupt. */
    load() {
      const raw = this.peek();
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
      G.state = sanitizeMerge(defaultState(), raw);
      G.world?.setTrialLake?.(!!G.state.flags.majo_trial_lake);
      G.world?.restoreSpellScars?.(G.state.spellScars);
      return true;
    },
    /** Write G.state now. Emits 'save:collect' first so systems can stash live values (player position etc). */
    write(silent = false) {
      if (!G.state) return false;
      if(G.world?.saveSpellScars) G.state.spellScars=G.world.saveSpellScars();
      G.events.emit('save:collect', G.state);
      if (this.disabled || !store) return false;
      try {
        store.setItem(SAVE_KEY, JSON.stringify(G.state));
        lastWrite = performance.now();
        if (!silent) G.events.emit('save:done');
        return true;
      } catch (e) { console.warn('[save] failed', e); return false; }
    },
    /** Delete the stored save. */
    erase() { try { store?.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } },
    /** Called by the core loop: quiet autosave every 45 s of play. */
    tick() {
      if (G.mode !== 'play' || this.disabled) return;
      if (performance.now() - lastWrite > 45000) this.write(true);
    },
    loadSettings() {
      let s = defaultSettings();
      let stored = {};
      try { if (store) stored = JSON.parse(store.getItem(SETTINGS_KEY) || '{}') || {}; s = deepMerge(s, stored); } catch (e) { /* ignore */ }
      this.qualityStored = !!(stored && typeof stored === 'object' && 'quality' in stored); // false on a first start (auto-pick)
      G.settings = s;
      return s;
    },
    /** Persist G.settings and tell everyone ('settings:changed'). */
    writeSettings() {
      try { store?.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch (e) { /* ignore */ }
      G.events.emit('settings:changed', G.settings);
    },
  };
  return save;
}

// ---- small helpers on state used everywhere ------------------------------------------------
/** Add (or with negative n, remove) inventory items. Returns the new count. Emits 'inventory:changed'. */
export function addItem(G, id, n = 1) {
  const inv = G.state.inventory;
  inv[id] = Math.max(0, (inv[id] || 0) + n);
  G.events.emit('inventory:changed', { id, count: inv[id], delta: n });
  return inv[id];
}
export const itemCount = (G, id) => G.state.inventory[id] || 0;
/** Set a story flag. Emits 'flag:set'. */
export function setFlag(G, name, value = true) {
  if (G.state.flags[name] === value) return;
  G.state.flags[name] = value;
  G.events.emit('flag:set', { name, value });
}
export const hasFlag = (G, name) => !!G.state.flags[name];
