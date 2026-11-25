// Asset store: 3D models (GLB), textures and audio shipped next to the game in assets/.
// The catalogue is assets/manifest.json: { "<id>": { file, type: 'model'|'audio'|'texture', preload?, scale?, toon?, clipsFrom?, license, author, source } }.
//   G.assets.model('char_miko')   -> a fresh, independent clone (skinned meshes handled); .userData.clips = AnimationClip[]
//   G.assets.clips('char_miko')   -> AnimationClip[] (shared, read-only)
//   G.assets.has(id) / info(id) / ids('prefix_')
//   await G.assets.load(id)       -> load one asset on demand (resolves when usable)
//   await G.assets.arrayBuffer(id)-> raw file bytes (e.g. for AudioContext.decodeAudioData)
//   G.assets.texture(id)          -> THREE.Texture (loads lazily)
//   G.assets.want(id)             -> true once model(id) is the real model; until then keeps a load of it going (actors)
//   G.assets.progress()           -> { got, total, files, done, retrying } bytes of the boot set (the boot bar)
//   G.assets.stream()             -> after the world is ready: the preloaded files the boot did not wait for start coming
// Every file comes through one network queue (see "network" below): few requests at a time, most important first, a
// stalled or failed request is retried, a failure is never cached.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toonGradient, hookMaterial } from './mats.js';
import { assetStat, mark, slice } from './boottime.js';
import { makeCelMaterial, buildOutlines, smoothNormals, mergeFaceLines, mergeByMaterial, buildShadowProxy, hairBand, hairDarkTag, earPivots, setCelFix, CEL_FIX, buildSeeLines, SEE_LINES } from '../actors/celmat.js';
import { bindFlightCloth } from '../actors/flight-cloth.js';
import { HEROINE_ASSETS, outfitById, journeyOutfit } from '../data/outfits.js';   // wardrobe: every outfit of hers gets the flight cloth
import { mergeCelParts } from '../actors/celmerge.js';
import { castNear } from '../data/journey-cast.js';
import { ANCHORS } from '../data/world.js';

const BASE = 'assets/';

// ---- network (docs/api/perf.md "Loading on a bad network") -----------------------------------------------------------
// Players on slow, lossy links to the page host reported a boot bar that sat still for 20+ minutes and a heroine who was
// a capsule for a whole story. Before: ~400 bare fetches at once (over HTTP/2 they all share the line, so nothing
// finished until the end and the bar did not move), no timeout (one dead connection held Promise.all, so the boot,
// forever), and a failed load was cached as null (every later load(id) gave null: capsule, no change of clothes).
// Now: at most NET.slots requests at a time (+ NET.small for files under SMALL bytes, which are bound by the round trip,
// not the line; over HTTP/1.1 — the dev server, some proxies — 6 in all: the browser opens 6 connections per host, and a
// request waiting for one in the browser's own pool would get no byte and be taken for stalled), the most important first; the body is read as a stream, and NET.stallMs without a byte aborts the
// request; a stalled or failed request is tried again after a growing wait, NET.tries times (the heroine NET.mustTries);
// a load that still fails is not kept: the next load(id) starts over (after NET.coolMs).
const NET = { slots: 8, small: 4, stallMs: 18000, tries: 4, mustTries: 8, waitMs: 1500, waitMax: 20000, coolMs: 5000 };
const SMALL = 160 * 1024;
// queue order: on-demand loads, then her own clothes + animations, the people near her, the world, other people, re-tries
const PRIO = { now: 0, hero: 1, cast: 2, world: 3, people: 4, sweep: 5 };
// file sizes of this build (build.mjs assetBytes): the boot bar counts megabytes against the real total
const SIZES = typeof __ASSET_BYTES__ !== 'undefined' && __ASSET_BYTES__ ? __ASSET_BYTES__ : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Perf pass (docs/api/perf.md): SkeletonUtils.clone gives EVERY SkinnedMesh of a clone its own Skeleton, so a character
 * (≈ 19 material meshes + outlines + shadow proxy, all on the same bones) recomputed and uploaded the same bone
 * matrices ~25 times per render — ~4 ms of script per frame in the village. Meshes whose skeletons have the same bones
 * and the same bind inverses now share one Skeleton (three then updates it once per render). Poses are unchanged:
 * they were always the same bone objects.
 */
function shareSkeletons(root) {
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    const sk = o.skeleton;
    const key = sk.bones.length + ':' + sk.bones.map((b) => (b ? b.id : -1)).join(',');
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    const same = list.find((s) => s === sk || (s.boneInverses === sk.boneInverses
      || s.boneInverses.every((m, i) => { const a = m.elements, b = sk.boneInverses[i].elements; for (let k = 0; k < 16; k++) if (Math.abs(a[k] - b[k]) > 1e-6) return false; return true; })));
    if (!same) list.push(sk);
    else if (same !== sk) o.skeleton = same;
  });
}

/**
 * Sculpted hero objects (tools/sculpt, install round 2026-11-17; how they are drawn: src/world/builders/sculpt.js). G.sculpt
 * says which object types use the sculpted GLBs; read once by the builders at boot, so it is a URL switch:
 *   ?sculpt=0   every old object (the sculpt GLBs are not even loaded) — before / after shots from one build
 *   ?sculpt=1   (default) the types in SCULPT_DEFAULT        ?sculpt=all   every installed type, held ones included
 *   ?sculpt=stone_lantern,komainu   exactly these types
 * G.sculpt.enabled = false before the world builds has the same effect as ?sculpt=0.
 */
const FIGURE_SITES = ['wind', 'thunder', 'fire', 'earth', 'water', 'ice'].map((e) => 'sculpt_stele_' + e).concat(['harp', 'rod', 'candles', 'candle_a',
  'candle_b', 'lectern_ring', 'lectern', 'basin', 'bud_stem', 'bud_petal', 'spring'].map((m) => 'sculpt_mech_' + m));
export const SCULPT_TYPES = {
  stone_lantern: ['sculpt_stone_lantern'],
  komainu: ['sculpt_komainu_a', 'sculpt_komainu_un'],
  kitsune: ['sculpt_kitsune_key', 'sculpt_kitsune_jewel'],
  great_lantern: ['sculpt_great_lantern', 'sculpt_great_lantern_mid', 'sculpt_great_lantern_far', 'sculpt_great_lantern_hang'],
  // the countryside rock family (round art-stone, world/rock-family.js): exact planes, bevels, beds / joints, moss cushions;
  // used by the flora rock species, the wayside stones and the trial clearing
  rockfam: ['sculpt_rock_field', 'sculpt_rock_split', 'sculpt_rock_ledge', 'sculpt_rock_shelf', 'sculpt_rock_crag', 'sculpt_rock_cobble'],
  // dry-stone wall segment laid stone by stone (flora/countryside-species.js drywall, the waysides' sheepfolds)
  drywall: ['sculpt_wall_drystone'],
  // the lake windmill (builders/journey-waysides.js mill): coursed tower, slate cap, timber work; sails turn
  mill: ['sculpt_mill_lake', 'sculpt_mill_lake_sails'],
  // the countryside landmarks' sculpted pieces (builders/landmarks.js, tools/sculpt/assets/lm_*.mjs): way shrine,
  // trilithon stones, standing stones, dolmen, cairn, wells, bench, bee hives; vertex colours on every LOD
  landmarks: ['sculpt_lm_shrine', 'sculpt_lm_upright', 'sculpt_lm_lintel', 'sculpt_lm_standing_a', 'sculpt_lm_standing_b', 'sculpt_lm_dolmen',
    'sculpt_lm_cairn', 'sculpt_lm_well_a', 'sculpt_lm_well_b', 'sculpt_lm_bench', 'sculpt_lm_hive_skep', 'sculpt_lm_hive_box'],
  // ground set pieces (round art-ground, tools/sculpt/assets/ground_rocks.mjs, facet kit): granite tor blocks, the quarry's
  // cut blocks with drill marks and its spoil heaps, baked into the landmark rock set pieces (world/landforms/setpieces.js)
  ground: ['sculpt_ground_tor_a', 'sculpt_ground_tor_b', 'sculpt_ground_quarry', 'sculpt_ground_spoil', 'sculpt_ground_quarry_face_a',
    'sculpt_ground_quarry_face_b', 'sculpt_ground_quarry_half'],
  // retired by rockfam (no user left; kept for reference, never loaded by default): the distance-field rocks of 2026-11-17
  rocks: ['sculpt_rock_slab', 'sculpt_rock_outcrop', 'sculpt_rock_standing', 'sculpt_rock_rubble'],
  boulders: ['sculpt_rock_boulder_a', 'sculpt_rock_boulder_b'],
  pot: ['sculpt_pot_clay'], barrel: ['sculpt_barrel_large'], bucket: ['sculpt_bucket_wood'], pumpkin: ['sculpt_pumpkin_a', 'sculpt_pumpkin_b'],
  // jar / cart: on (lead's call; layout keeps the old footprint, props/models.js layoutSize); hen: on, swapped in by
  // actors/creature.js KIT_BODY (no re-sculpt). Held (only with ?sculpt=all or by name): jar_b, pot_large (no placement)
  jar: ['sculpt_jar_a'], jar_b: ['sculpt_jar_b'], pot_large: ['sculpt_pot_large'], cart: ['sculpt_cart'], hen: ['sculpt_ani_chicken'],
  // characters and spells (install-actors round): 团子's body (story/companion.js), the heroine's gohei and hip lantern
  // (player/player.js), the earth spell's columns + rubble skirt (spells/visuals.js, entities.js)
  // dango is HELD (?sculpt=all or ?sculpt=...,dango): side / back read better, but face-on the eyes sit wide and bulge on a
  // broad flat face, the paint reads grey next to the old warm cream — the face is the companion's charm (REVIEW.md)
  dango: ['sculpt_dango'], gohei: ['sculpt_prop_gohei'], broom: ['sculpt_prop_broom'], hip_lantern: ['sculpt_hip_lantern'],
  earth_column: ['sculpt_earth_column_a', 'sculpt_earth_column_b', 'sculpt_earth_column_c', 'sculpt_earth_rubble'],
  // foes and wildlife sculpted on the pack skeletons (round art-creatures, tools/sculpt/assets/{stag_frost,…}.mjs +
  // beast_kit.mjs post), swapped in by actors/creature.js KIT_OWN / KIT_BODY; off -> the pack bodies as before. Their
  // COLOR_0 is the kit's skinned output (like the hen's): lifted once at load by fixSculptColours
  creatures: ['sculpt_froststag', 'sculpt_embersnake', 'sculpt_wolf_wild', 'sculpt_bat_star',
    'sculpt_froststag_lo', 'sculpt_embersnake_lo', 'sculpt_wolf_wild_lo', 'sculpt_bat_star_lo'],
  // the activity props (round art-props, tools/sculpt/assets/props_activity_lib.mjs; gameplay/errands-props.js sculptedProp):
  // the landmark puzzles' briar thicket, rubble heap and pack chest (+ lid), the broom courses' witch's ring gate, the
  // roadside errands' felt hat, easel, stove, handcart and sitting stone; vertex colours on every LOD
  'props-activity': ['sculpt_briar_thicket', 'sculpt_rubble_heap', 'sculpt_chest_pack', 'sculpt_chest_pack_lid', 'sculpt_ring_willow',
    'sculpt_hat_felt', 'sculpt_easel_painter', 'sculpt_stove_iron', 'sculpt_cart_hand', 'sculpt_seat_stone'],
  // figures (round art-figures): the City of Magic residents' carried props (builders/mage-folk.js, tools/sculpt/assets/folk_*.mjs),
  // the page-trial steles and mechanisms (gameplay/wilds-pages.js, tools/sculpt/assets/stele_page.mjs, mech_*.mjs)
  // and the crystal golem's body (combat/golem-body.js, tools/sculpt/assets/golem_rock.mjs)
  figures: ['sculpt_folk_basket', 'sculpt_folk_hat_straw', 'sculpt_folk_cap', ...FIGURE_SITES, 'sculpt_golem_rock'],
};
// sculpts built twice (full body / *_lo at about a third of the triangles): each tier loads only its own; the creature
// code falls back to the other if the tier changes later (actors/creature.js kitPick)
const SCULPT_LO = new Set(['sculpt_froststag_lo', 'sculpt_embersnake_lo', 'sculpt_wolf_wild_lo', 'sculpt_bat_star_lo']);
const SCULPT_HI = new Set([...SCULPT_LO].map((id) => id.slice(0, -3)));
export const SCULPT_DEFAULT = ['stone_lantern', 'komainu', 'kitsune', 'great_lantern', 'rockfam', 'drywall', 'mill', 'landmarks', 'ground', 'pot', 'barrel', 'bucket', 'pumpkin',
  'jar', 'cart', 'hen', 'gohei', 'broom', 'hip_lantern', 'earth_column', 'creatures', 'props-activity', 'figures'];
// sculpt GLBs whose COLOR_0 was rewritten by the asset's own post step (dango.mjs post, gohei.mjs / hip_lantern.mjs --split /
// --post: sRGB paint -> linear once) — measured single-encoded, so fixSculptColours must leave them alone
// facet-kit GLBs (tools/sculpt/assets/rock_facet.mjs) write linear COLOR_0 once as well, and so does the landmark driver
// (tools/sculpt/assets/landmarks_lib.mjs vcAll: the kit's bakeVertexColors, sRGB paint -> linear once), and the activity
// props (tools/sculpt/assets/props_activity_lib.mjs: the facet kit's writer), the page-trial sites and the rock golem
// (tools/sculpt/assets/mech_lib.mjs on the facet kit)
const SCULPT_VC_OK = new Set(['sculpt_dango', 'sculpt_prop_gohei', 'sculpt_hip_lantern', ...SCULPT_TYPES.rockfam, ...SCULPT_TYPES.drywall, ...SCULPT_TYPES.mill,
  ...SCULPT_TYPES.landmarks, ...SCULPT_TYPES.ground, ...SCULPT_TYPES['props-activity'], ...FIGURE_SITES, 'sculpt_golem_rock']);
function sculptSwitch(G) {
  const p = G.params?.sculpt;
  const types = new Set(p === '0' ? [] : p === 'all' ? Object.keys(SCULPT_TYPES) : !p || p === '1' ? SCULPT_DEFAULT : String(p).split(',').map((s) => s.trim()).filter((s) => SCULPT_TYPES[s]));
  const idType = new Map();
  for (const [t, ids] of Object.entries(SCULPT_TYPES)) for (const id of ids) idType.set(id, t);
  return {
    enabled: types.size > 0, types,
    /** true when the sculpted version of `type` is in use */
    on(type) { return this.enabled && this.types.has(type); },
    /** the type a sculpt asset id belongs to ('' when the id is not a sculpt asset) */
    typeOf: (id) => idType.get(id) || '',
  };
}

// three r187's GLTFLoader reads node extras.pivot as GLTFExporter's pivot ARRAY (sets Object3D.pivot, shifts the node and
// zeroes its first child). The sculpt kit's anchor nodes (gohei / hip-lantern shide hinges) carry a text note there, so
// the anchors came out NaN and the streamers vanished. Undo it from the node JSON (parser still alive here).
function unPivot(gltf) {
  const json = gltf.parser?.json, assoc = gltf.parser?.associations;
  if (!json || !assoc) return;
  const tr = (o) => { const i = assoc.get(o)?.nodes; const t = i !== undefined && json.nodes[i]?.translation; if (t) o.position.fromArray(t); else if (i !== undefined) o.position.set(0, 0, 0); };
  gltf.scene.traverse((o) => {
    if (!o.pivot || (Number.isFinite(o.pivot.x) && Number.isFinite(o.pivot.y) && Number.isFinite(o.pivot.z))) return;
    o.pivot = null;
    const i = assoc.get(o)?.nodes;
    if (i !== undefined && typeof json.nodes[i]?.extras?.pivot === 'string') o.userData.pivot = json.nodes[i].extras.pivot;
    tr(o); for (const c of o.children) tr(c);
  });
  gltf.scene.updateMatrixWorld(true);
}

function fixSculptColours(root) {
  const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const done = new Set();
  root.traverse((o) => {
    const c = o.isMesh && o.geometry?.attributes?.color;
    if (!c || done.has(c)) return;
    done.add(c);
    for (let i = 0; i < c.count; i++) { c.setX(i, enc(c.getX(i))); c.setY(i, enc(c.getY(i))); c.setZ(i, enc(c.getZ(i))); }
    c.needsUpdate = true;
  });
}

export function createAssets(G) {
  if (!G.sculpt) G.sculpt = sculptSwitch(G);
  let manifest = {};
  const gltfs = new Map();     // id -> gltf
  const pending = new Map();   // id -> Promise
  const textures = new Map();
  const warned = new Set();
  const castPre = new Map();   // ?castab=1: unmerged originals of characters (same-run A/B of the draw-call merge)
  const loader = new GLTFLoader();
  let manifestP = null;
  const warn = (id, why = 'missing asset') => { if (!warned.has(id)) { warned.add(id); console.warn('[assets] ' + why, id); } };

  // ---- network queue (see NET above) ----
  const st = new Map();        // id -> { id, prio, seq, go, got, size, tries, retrying, fails, failedAt }
  const queue = [];            // states waiting for a slot
  let active = 0, activeSmall = 0, seqN = 0;
  const lim = { slots: NET.slots, small: NET.small };   // init() narrows it to 5 + 1 when the page did not come over HTTP/2 or 3
  const net = { requests: 0, retries: 0, stalls: 0, peak: 0, proto: '' };   // counters (tests, boot report)
  let bootSet = null, onProgress = null, progT = 0, later = null, planIds = null;
  function stat(id) {
    let s = st.get(id);
    if (!s) st.set(id, (s = { id, prio: PRIO.now, seq: 0, go: null, got: 0, size: SIZES[id] || 0, tries: NET.tries, retrying: false, fails: 0, failedAt: 0, small: false }));
    return s;
  }
  function pump() {
    while (queue.length) {
      let b = -1;
      for (let i = 0; i < queue.length; i++) {
        const q = queue[i];
        // a full line still lets a small file through (round-trip bound, it hardly takes bandwidth)
        if (active >= lim.slots && !(q.size && q.size < SMALL && activeSmall < lim.small)) continue;
        if (b < 0 || q.prio < queue[b].prio || (q.prio === queue[b].prio && q.seq < queue[b].seq)) b = i;
      }
      if (b < 0) return;
      const s = queue.splice(b, 1)[0];
      s.small = active >= lim.slots;
      if (s.small) activeSmall++; else active++;
      net.peak = Math.max(net.peak, active + activeSmall);
      const go = s.go; s.go = null; go();
    }
  }
  const acquire = (s) => new Promise((r) => { s.go = r; s.seq = seqN++; queue.push(s); pump(); });
  const release = (s) => { if (s.small) activeSmall--; else active--; s.small = false; pump(); };
  function report(force = false) {
    if (!onProgress) return;
    const t = performance.now();
    if (!force && t - progT < 150) return;
    progT = t;
    try { onProgress(api.progress()); } catch (e) { /* the bar is optional */ }
  }
  function seen(s, n) { if (n > s.got) { s.got = n; report(); } }
  const depsOf = (id) => { const cf = manifest[id]?.clipsFrom; return !cf ? [] : Array.isArray(cf) ? cf : [cf]; };
  /**
   * The order of the boot's loads: [{ id, prio, tries?, later? }]. Her model for this save (the save's outfit, ?outfit=
   * wins) and the animations it borrows come first, with the most tries — the game should never start with her missing;
   * then her other outfits, the story cast near the save's position, everything the world builds from, and last the
   * other people (`later`: the boot does not wait for them; they keep coming after play starts).
   */
  function bootOrder(ids) {
    let save = null;
    try { save = G.save?.peek?.() || null; } catch (e) { save = null; }
    const outfit = outfitById(G.params?.outfit) ? G.params.outfit : journeyOutfit(save);
    const own = outfitById(outfit)?.asset;
    const plan = new Map();
    const put = (id, prio, o = {}) => { if (manifest[id] && !plan.has(id)) plan.set(id, { id, prio, ...o }); };
    if (own) { put(own, PRIO.hero, { tries: NET.mustTries }); for (const c of depsOf(own)) put(c, PRIO.hero, { tries: NET.mustTries }); }
    for (const id of ids) if (HEROINE_ASSETS.has(id)) put(id, PRIO.hero);
    const at = save?.player && Number.isFinite(save.player.x) ? save.player : ANCHORS.spawn;
    for (const id of castNear(at.x, at.z)) put(id, PRIO.cast);
    for (const id of ids) if (!id.startsWith('char_')) put(id, PRIO.world);
    for (const id of ids) put(id, PRIO.people, { later: true });
    return [...plan.values()];
  }
  /**
   * One request, body read as a stream; aborted after NET.stallMs without a byte (connect, headers or body). Time the
   * visible page itself could not run (a long task: a cold shader cache once took 14.5 s for one frame) does not count:
   * the bytes may be sitting there unread.
   */
  async function fetchOnce(url, s) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    let stalled = false, n = 0, last = performance.now(), tick = last;
    const timer = setInterval(() => {
      const t = performance.now();
      if (t - tick > 2500 && typeof document !== 'undefined' && document.visibilityState === 'visible') last += t - tick - 1000;
      tick = t;
      if (t - last > NET.stallMs) { stalled = true; ac?.abort(); }
    }, 1000);
    const arm = () => { last = performance.now(); };
    net.requests++;
    try {
      const r = await fetch(url, ac ? { signal: ac.signal } : undefined);
      if (!r.ok) { const e = new Error(r.status + ' ' + url); e.final = r.status === 404 || r.status === 410; throw e; }
      if (!s.size) s.size = +r.headers.get('content-length') || 0;
      const rd = r.body?.getReader?.();
      if (!rd) { const b = await r.arrayBuffer(); seen(s, b.byteLength); return b; }
      const parts = [];
      for (;;) {
        arm();
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); n += value.byteLength; seen(s, n);
      }
      if (parts.length === 1 && parts[0].byteOffset === 0 && parts[0].byteLength === parts[0].buffer.byteLength) return parts[0].buffer;
      const out = new Uint8Array(n);
      let o = 0;
      for (const p of parts) { out.set(p, o); o += p.byteLength; }
      return out.buffer;
    } catch (e) {
      if (stalled) { net.stalls++; throw new Error('stalled: no data for ' + NET.stallMs / 1000 + ' s ' + url); }
      throw e;
    } finally { clearInterval(timer); }
  }
  /** The bytes of a file, tried up to s.tries times (growing waits between); throws the last error. */
  async function fetchBytes(url, s) {
    let err = null;
    for (let a = 1; a <= s.tries; a++) {
      if (a > 1) {
        s.retrying = true; net.retries++; report(true);
        await sleep(Math.min(NET.waitMax, NET.waitMs * 2 ** (a - 2)) * (0.8 + 0.4 * ((s.seq * 0.618) % 1)));
      }
      await acquire(s);
      try { const b = await fetchOnce(url, s); s.retrying = false; return b; } catch (e) {
        err = e;
        console.warn('[assets] ' + (a < s.tries && !e.final ? 'will retry' : 'giving up on') + ' ' + url + ' (' + a + '/' + s.tries + '): ' + (e?.message || e));
        if (e.final) break;
      } finally { release(s); }
    }
    s.retrying = false;
    throw err;
  }

  /**
   * Swap PBR materials for the game's shading, keeping colour maps. Applied automatically to loaded models.
   * Characters (VRoid rigs: a J_Bip_C_Head bone) and creatures (any skinned model) get the anime cel path of
   * src/actors/celmat.js (coloured shade, rim, face normals, hair ring, ink outline); everything else soft toon.
   * opts: { emissiveGlow, character?: bool, creature?: bool, outline = true, mats?: { materialName: { surface, look } } }
   * Static models keep vertex colours; refined props (tools/refine-models.mjs) carry their surface tags (docs/api/props.md).
   */
  function toonify(root, opts = {}) {
    const { emissiveGlow = false } = opts;
    let skinned = false;
    root.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
    const character = opts.character ?? !!root.getObjectByName('J_Bip_C_Head');
    const creature = !character && (opts.creature ?? skinned);
    // ?celoff=1 keeps the old flat toon (before / after comparisons)
    if ((character || creature) && !G.params?.celoff) {
      const t0 = performance.now();
      celify(root, character, opts);
      api.celMs = (api.celMs || 0) + performance.now() - t0;
      return root;
    }
    const seen = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const conv = (m) => {
        if (!m || m.isMeshToonMaterial || m.isMeshBasicMaterial) return m;
        if (seen.has(m)) return seen.get(m);
        const t = new THREE.MeshToonMaterial({
          color: m.color ? m.color.clone() : new THREE.Color(0xffffff), map: m.map || null, gradientMap: toonGradient(),
          transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors,
        });
        // sculpted GLBs (tools/sculpt): LOD0 carries an OBJECT-space normal map (material extras.normalSpace = 'object');
        // keep it (the lighting hook reads the mapped normal: it runs after normal_fragment_maps)
        if (m.normalMap) {
          t.normalMap = m.normalMap;
          t.normalMapType = m.userData?.normalSpace === 'object' ? THREE.ObjectSpaceNormalMap : (m.normalMapType ?? THREE.TangentSpaceNormalMap);
          if (m.normalScale) t.normalScale.copy(m.normalScale);
        }
        if (m.userData?.sculpt) t.userData.sculpt = { ...m.userData.sculpt };
        if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01) {
          t.emissive.copy(m.emissive); t.emissiveMap = m.emissiveMap || null; t.emissiveIntensity = emissiveGlow ? 2.5 : m.emissiveIntensity ?? 1;
        }
        t.name = m.name;
        // static props (upgrade 2): surface kind + look knobs from the manifest `mats` or the file's material extras
        const tag = opts.mats?.[m.name] || m.userData;
        if (tag?.surface) t.userData.surface = tag.surface;
        if (tag?.look) t.userData.look = { ...tag.look };
        hookMaterial(t);
        seen.set(m, t);
        return t;
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      o.castShadow = true; o.receiveShadow = true;
    });
    return root;
  }

  const _celV = new THREE.Vector3();
  function celify(root, character, opts) {
    const emissiveGlow = !!opts.emissiveGlow;
    // heroine-look switch (docs/api/actors-look.md "Character fixes"): ?charfix=0 = before; ?hairband=y,half,strength tunes
    if (G.charfix === undefined) {
      const hb = String(G.params?.hairband || '').split(',').map(Number);
      setCelFix(G.params?.charfix !== '0', hb.length >= 2 && hb.every((x) => x >= 0) ? { y: hb[0], half: hb[1], strength: hb[2] ?? 1 } : null);
      G.charfix = CEL_FIX.on;
      CEL_FIX.stock = G.params?.stockband !== '0';   // stock card hair moves to the soft band too (?stockband=0: zig-zag ring kept)
      String(G.params?.hairtune || '').split(',').forEach((x, i) => { if (i < 5 && x !== '' && Number.isFinite(+x)) CEL_FIX.tune[i] = +x; });   // ?hairtune=night,day,width,seeNight,faceTilt
      const sl = String(G.params?.seeline || '').split(',').map(Number);   // ?seeline=offset,brow,lash,lower,lift,lod
      ['off', 'brow', 'lash', 'lower', 'lift', 'lod'].forEach((k, i) => { if (Number.isFinite(sl[i]) && G.params?.seeline) SEE_LINES[k] = sl[i]; });
    }
    // per-asset geometry facts: head centre (face spherise) and procedural tail extent
    const headC = new THREE.Vector3();
    const tail = { z: 0, len: 0 };
    const box = new THREE.Box3();
    root.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const n = o.material?.name || '';
      // heroine-look: base positions only (computeBoundingBox adds the morph extents: open mouth pulled the centre ~5 cm down)
      if (character && /^Face$/.test(n)) { if (CEL_FIX.on) box.setFromBufferAttribute(o.geometry.attributes.position).getCenter(headC); else { o.geometry.computeBoundingBox(); o.geometry.boundingBox.getCenter(headC); } }
      if (/^FoxTail$/.test(n)) { o.geometry.computeBoundingBox(); box.copy(o.geometry.boundingBox); tail.z = box.max.z; tail.len = box.max.z - box.min.z; }
    });
    // character finish (docs/api/cloth.md): crown highlight per hair material, fox-ear twitch pivots
    const hairB = new Map();
    let ears = null;
    if (character) {
      const earGeos = [];
      root.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        const n = o.material?.name || '';
        if (/^Hair$/.test(n)) { let b = hairBand(o.geometry, headC, o.material.userData); if (CEL_FIX.on) b = hairDarkTag(b, o.material); const prev = hairB.get(o.material); if (b && (!prev || b.x > prev.x)) hairB.set(o.material, b); }
        if (/^FoxEar/.test(n)) earGeos.push(o.geometry);
      });
      if (earGeos.length) ears = earPivots(earGeos, headC);
    }
    const seen = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const conv = (m) => {
        if (!m || m.isMeshBasicMaterial || m.isCelMaterial) return m;
        if (seen.has(m)) return seen.get(m);
        const n = m.name || '';
        const extra = { headC, sph: character && !m.userData?.authoredFaceNormals ? 0.85 : 0 };
        let kind;
        if (!character) kind = /eye/i.test(n) ? 'eye' : 'fur';
        if (/^FoxTail/.test(n) && tail.len > 0) Object.assign(extra, { wag: 0.12, tailZ: tail.z, tailLen: tail.len });
        if (hairB.has(m)) extra.hairB = hairB.get(m);
        if (ears && /^FoxEar/.test(n) && ears.earL && ears.earR) Object.assign(extra, ears);
        const t = makeCelMaterial(m, kind, extra);
        if (m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.01) t.emissiveIntensity = emissiveGlow ? 2.5 : m.emissiveIntensity ?? 1;
        seen.set(m, t);
        return t;
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      const n = (Array.isArray(o.material) ? o.material[0] : o.material)?.name || '';
      // face details, eyes and see-through parts never cast shadow-map shadows (12 extra shadow draws per face before)
      const tiny = character && /Eye|FaceEyeline|FaceEyelash|FaceBrow|FaceMouth|FaceLines|HairBack|cloth_trim|cloth_foot/.test(n);   // trims + tabi: thin, the contact shadow covers the feet
      // low-poly creatures: welded smooth normals turn facets into soft cel volumes (eyes keep theirs)
      // creatures (upgrade 3): model units -> metres for the painted grain / shade-edge noise (asset-pack rigs are in cm/100)
      if (!character) {
        if (!root.userData._celWs) { root.updateMatrixWorld(true); root.userData._celWs = 1; }
        const ws = o.getWorldScale(_celV).x;
        for (const mm of [].concat(o.material)) if (mm?.isCelMaterial && ws > 0) mm.celU.uCelG.value.w = ws;
      }
      if (!character && o.geometry?.attributes.normal && !/eye/i.test(n) && !o.geometry.userData.celSmooth) {
        o.geometry.setAttribute('normal', smoothNormals(o.geometry));
        o.geometry.userData.celSmooth = true;
      }
      o.castShadow = !tiny; o.receiveShadow = true;
    });
    if (character) { try { mergeFaceLines(root); } catch (e) { console.warn('[assets] face merge skipped', e); } }
    if (character) { try { mergeByMaterial(root); } catch (e) { console.warn('[assets] material merge skipped', e); } }
    // perf pass: transparent double-sided face layers (FaceLines, EyeHighlight…) were drawn twice by three (back, then
    // front) with a program re-check each time; they are decals on the front of the face, one pass draws them the same
    if (character && G.params?.perf !== '0') root.traverse((o) => { if (!o.isMesh) return; for (const mm of [].concat(o.material)) if (mm && mm.transparent && mm.side === THREE.DoubleSide && /Face|Eye/.test(mm.name || '')) mm.forceSinglePass = true; });
    if (opts.outline !== false) buildOutlines(root, { faceWeight: 0.45 });
    // heroine-look: brows + lash line through the own fringe (one extra draw, near only; rig.js hides it beyond SEE_LINES.far)
    if (character && CEL_FIX.on) { try { buildSeeLines(root); } catch (e) { console.warn('[assets] see-through lines skipped', e); } }
    // draw-call pass (docs/api/actors-look.md): the proxy takes the face too (one shadow draw per cascade), then the ~19
    // cel parts merge into 4–5 draws; ?castmerge=0 = before
    const merge = character && G.params?.castmerge !== '0' && G.params?.perf !== '0';
    if (character && !G.params?.noproxy) { try { buildShadowProxy(root, { morph: merge }); } catch (e) { console.warn('[assets] shadow proxy skipped', e); } }   // after the outlines: the proxy gets none
    if (merge) {
      if (G.params?.castab && opts.id) castPre.set(opts.id, SkeletonUtils.clone(root));   // A/B shots: the unmerged parts
      try { const r = mergeCelParts(root, { renderer: G.params?.castgpu === '0' ? null : G.renderer }); api.castMerge = (api.castMerge || 0) + r.before - r.after; } catch (e) { console.warn('[assets] cel merge skipped', e); }
    }
    return root;
  }

  async function loadModel(id, s) {
    const info = manifest[id];
    // ?costume=v1 loads the pre-costume character files (A/B shots); see tools/install-costumes.mjs
    const v1 = G.params?.costume === 'v1' && info.fileV1;
    // ?propsv=1 loads the unrefined originals of refined props (upgrade-2 A/B shots and timings)
    const orig = G.params?.propsv === '1' && info.orig;
    const url = BASE + (v1 ? info.fileV1 : orig ? info.orig : info.file);
    if (v1 || orig) s.size = 0;   // another file than the build measured: its own Content-Length
    const grp = id.split('_')[0];
    // a character is usable only with the animation files it borrows (ready()): ask for them at the same place in line
    for (const c of depsOf(id)) if (manifest[c] && !gltfs.has(c)) api.load(c, { prio: s.prio, tries: s.tries });
    // fetch and parse timed separately (boot timeline, docs/api/perf.md "Boot and loading")
    let t0 = performance.now();
    const buf = await fetchBytes(url, s);
    assetStat(grp, 'fetchMs', performance.now() - t0); assetStat(grp, 'bytes', buf.byteLength); assetStat(grp, 'n', 1);
    t0 = performance.now();
    const gltf = await loader.parseAsync(buf, url.slice(0, url.lastIndexOf('/') + 1));
    assetStat(grp, 'parseMs', performance.now() - t0);
    if (v1) gltf.userData.costumeV1 = true;
    // sculpt GLBs (tools/sculpt): COLOR_0 comes out of the kit's writer converted to linear one time too many (measured
    // in game: the boulder's mean is lin(lin(#9b9b9b)) instead of lin(#9b9b9b), the LOD1 of every hero object read about
    // 2.5x darker than its own LOD0 atlas). Undo the extra step once, at load; alpha (the rocks' moss mask) is untouched.
    if (G.sculpt.typeOf(id) && !SCULPT_VC_OK.has(id)) fixSculptColours(gltf.scene);
    if (G.sculpt.typeOf(id)) unPivot(gltf);
    await slice(); // cooking (cel materials, outlines, merges) is synchronous: let a frame through between models
    t0 = performance.now();
    if (HEROINE_ASSETS.has(id)) bindFlightCloth(gltf);
    if (info.toon !== false) toonify(gltf.scene, { id, ...(info.mats && !orig ? { mats: info.mats } : {}) });
    assetStat(grp, 'cookMs', performance.now() - t0);
    // perf pass (boot / memory): the parser keeps the whole GLB binary chunk, every buffer-view copy and the compressed
    // images in its cache for the life of the model; nothing reads them after parsing (geometry and textures hold
    // their own data), so drop it — ~90 MB of JS heap for the 309 preloaded models
    if (G.params?.perf !== '0') { try { gltf.parser?.cache?.removeAll?.(); } catch (e) { /* ignore */ } gltf.parser = null; }
    if (info.scale && info.scale !== 1) gltf.scene.scale.setScalar(info.scale);
    gltfs.set(id, gltf);
    return gltf;
  }

  const api = {
    get manifest() { return manifest; },
    info: (id) => manifest[id] || null,
    has: (id) => id in manifest,
    /** True once a model is parsed and model(id) will work (with the animation files it borrows: clipsFrom). */
    ready(id) {
      const g = gltfs.get(id);
      if (!g) return false;
      if (g._deps) return true;
      for (const c of depsOf(id)) if (!gltfs.has(c)) return false;
      return (g._deps = true);
    },
    /**
     * Self-healing actors (rig.js placeholder): true once model(id) is the real model; until then makes sure a load of it
     * (and of the animation files it borrows) is under way — a failed one starts again after NET.coolMs. Cheap enough
     * to call every frame.
     */
    want(id) {
      if (api.ready(id)) return true;
      if (!manifest[id]) return false;
      if (!gltfs.has(id) && !pending.has(id)) api.load(id);
      for (const c of depsOf(id)) if (manifest[c] && !gltfs.has(c) && !pending.has(c)) api.load(c);
      return false;
    },
    /** Bytes of the set the boot waits for: { got, total, files, done, failed, retrying } (+ network counters). */
    progress() {
      let got = 0, total = 0, done = 0, failed = 0, retrying = false;
      for (const id of bootSet || []) {
        const s = st.get(id), size = s?.size || SIZES[id] || 0;
        total += size;
        got += size ? Math.min(size, s?.got || 0) : 0;
        if (gltfs.has(id)) done++; else if (s?.fails && !pending.has(id)) failed++;
        if (s?.retrying) retrying = true;
      }
      return { got, total, files: bootSet ? bootSet.length : 0, done, failed, retrying, ...net };
    },
    /** Network counters: requests, retries, stalls, peak (most requests at once). */
    get net() { return { ...net, active, activeSmall, queued: queue.length }; },
    ids: (prefix = '') => Object.keys(manifest).filter((k) => k.startsWith(prefix)),
    toonify,
    /** Fetch the manifest and every asset marked preload (models default to preload: true). Called once at boot. */
    async init(progress, opts = {}) {
      // boot calls this twice: { manifestOnly } first (the title needs only the catalogue), then for the models
      if (!manifestP) {
        manifestP = (async () => {
          try {
            const r = await fetch(BASE + 'manifest.json', { cache: 'no-store' });
            manifest = r.ok ? await r.json() : {};
          } catch (e) { manifest = {}; console.warn('[assets] no manifest — running without external assets'); }
          mark('manifest');
        })();
      }
      await manifestP;
      if (opts.manifestOnly) return;
      // sculpted objects whose type is switched off are not loaded at all (?sculpt=0 boots exactly as before)
      const loTier = !!G.quality?.mobile || G.quality?.name === 'low';
      const ids = Object.keys(manifest).filter((id) => manifest[id].type === 'model' && manifest[id].preload !== false
        && (!G.sculpt.typeOf(id) || G.sculpt.on(G.sculpt.typeOf(id)))
        && !(loTier ? SCULPT_HI.has(id) : SCULPT_LO.has(id)));
      // the boot waits for every file of the plan but the `later` ones (other people: actors heal, spawners wait; they come
      // with stream()), and it never waits on one that keeps failing: each has its tries, then the boot goes on (her own
      // model has the most)
      let proto = '';
      try { proto = performance.getEntriesByType('navigation')[0]?.nextHopProtocol || ''; } catch (e) { proto = ''; }
      if (!/^h[23]/.test(proto)) { lim.slots = 5; lim.small = 1; }
      net.proto = proto || '?';
      const plan = bootOrder(ids);
      bootSet = plan.filter((e) => !e.later).map((e) => e.id);
      onProgress = progress || null;
      report(true);
      const waits = [];
      for (const e of plan) if (!e.later) waits.push(api.load(e.id, { prio: e.prio, tries: e.tries }));
      await Promise.all(waits);
      report(true);
      onProgress = null;
      later = plan.filter((e) => e.later).map((e) => e.id);
      planIds = plan.map((e) => e.id);
    },
    /**
     * Once the world is ready (boot.js): the files the boot did not wait for (other people) start coming, behind anything
     * asked for on demand; they would only have slowed the world's own fetches and building down. A file of the plan that
     * still failed is asked for again now and then (late builders, creature spawns; actors also ask through want()).
     */
    stream() {
      if (!later) return;
      for (const id of later) if (!gltfs.has(id) && !pending.has(id)) api.load(id, { prio: PRIO.people });
      later = null;
      const sweep = (left, round) => {
        left = left.filter((id) => !gltfs.has(id));
        if (!left.length || round > 4) return;
        setTimeout(() => { for (const id of left) if (!pending.has(id)) api.load(id, { prio: PRIO.sweep }); sweep(left, round + 1); }, 30000 * round);
      };
      sweep(planIds || [], 1);
    },
    /**
     * Load one asset now (idempotent while it loads or once loaded). Models resolve to their gltf; other types resolve
     * to an ArrayBuffer; null when it could not be had (not cached: the next call tries again). o: { prio, tries } —
     * a call for a file still waiting in the line moves it up to `prio` (default: first); tries default NET.tries.
     */
    load(id, o = {}) {
      if (!manifest[id]) { warn(id); return Promise.resolve(null); }
      const s = stat(id), prio = o.prio ?? PRIO.now;
      if (pending.has(id)) { if (prio < s.prio) s.prio = prio; if (o.tries > s.tries) s.tries = o.tries; return pending.get(id); }
      s.prio = prio; s.tries = o.tries || NET.tries;   // each new attempt at a file has its own tries
      const info = manifest[id];
      const p = (async () => {
        const wait = s.failedAt ? s.failedAt + NET.coolMs - performance.now() : 0;
        if (wait > 0) await sleep(wait);
        return info.type === 'model' ? loadModel(id, s) : fetchBytes(BASE + info.file, s);
      })().catch((e) => {
        s.fails++; s.failedAt = performance.now(); s.retrying = false;
        if (pending.get(id) === p) pending.delete(id);   // never cache a failure
        if (s.fails === 1) G.reportError('asset:' + id, e); else console.warn('[assets] still failing', id, e?.message || e);
        report(true);
        return null;
      });
      pending.set(id, p);
      return p;
    },
    /** Raw bytes of any asset (a fresh copy each call, safe to hand to decodeAudioData). */
    async arrayBuffer(id) {
      const info = manifest[id];
      if (!info) { warn(id); return null; }
      if (info.type === 'model') { try { return await fetchBytes(BASE + info.file, { ...stat(id), prio: PRIO.now, go: null, small: false }); } catch (e) { return null; } }
      const buf = await api.load(id);
      return buf ? buf.slice(0) : null;
    },
    /** AnimationClip[] of a loaded model (possibly empty). Clips of the models named in `clipsFrom` are merged in. */
    clips(id) {
      const g = gltfs.get(id);
      if (!g) return [];
      const info = manifest[id] || {};
      // merged once every borrowed file is in (merging a partial set used to stick: a rig without walk / idle clips)
      if (info.clipsFrom && !g._merged && depsOf(id).every((c) => gltfs.has(c))) {
        g._merged = true;
        for (const src of depsOf(id)) { const s = gltfs.get(src); if (s) g.animations = g.animations.concat(s.animations); }
      }
      return g.animations || [];
    },
    /** A fresh clone of a loaded model, safe to add / animate / dispose independently. null if unknown or not loaded. */
    model(id) {
      const g = gltfs.get(id);
      if (!g) { warn(id, manifest[id] ? 'model not loaded yet' : 'missing asset'); return null; }
      const obj = SkeletonUtils.clone(g.scene);
      if (G.params?.perf !== '0') shareSkeletons(obj);
      obj.userData.clips = api.clips(id);
      obj.userData.assetId = id;
      return obj;
    },
    /** ?castab=1 only: a clone of the character as it was before the draw-call merge (A/B shots), else null. */
    modelUnmerged(id) {
      const src = castPre.get(id);
      if (!src) return null;
      const obj = SkeletonUtils.clone(src);
      shareSkeletons(obj);
      obj.userData.clips = api.clips(id);
      obj.userData.assetId = id;
      return obj;
    },
    /** The parsed, shared original (never add it to the scene — clone with model()). */
    raw(id) { return gltfs.get(id) || null; },
    texture(id) {
      if (textures.has(id)) return textures.get(id);
      const info = manifest[id];
      if (!info) { warn(id); return null; }
      // the image loads by itself; a failed one is tried again (NET.tries, growing waits) instead of staying blank
      const tex = new THREE.Texture();
      tex.colorSpace = THREE.SRGBColorSpace;
      const img = new THREE.ImageLoader();
      const get = (a) => img.load(BASE + info.file, (im) => { tex.image = im; tex.needsUpdate = true; }, undefined, () => {
        if (a < NET.tries) setTimeout(() => get(a + 1), Math.min(NET.waitMax, NET.waitMs * 2 ** (a - 1)));
        else warn(id, 'texture failed to load');
      });
      get(1);
      textures.set(id, tex);
      return tex;
    },
  };
  return api;
}
