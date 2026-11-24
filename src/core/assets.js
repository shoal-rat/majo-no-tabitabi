// Asset store: 3D models (GLB), textures and audio shipped next to the game in assets/.
// The catalogue is assets/manifest.json: { "<id>": { file, type: 'model'|'audio'|'texture', preload?, scale?, toon?, clipsFrom?, license, author, source } }.
//   G.assets.model('char_miko')   -> a fresh, independent clone (skinned meshes handled); .userData.clips = AnimationClip[]
//   G.assets.clips('char_miko')   -> AnimationClip[] (shared, read-only)
//   G.assets.has(id) / info(id) / ids('prefix_')
//   await G.assets.load(id)       -> load one asset on demand (resolves when usable)
//   await G.assets.arrayBuffer(id)-> raw file bytes (e.g. for AudioContext.decodeAudioData)
//   G.assets.texture(id)          -> THREE.Texture (loads lazily)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toonGradient, hookMaterial } from './mats.js';
import { assetStat, mark, slice } from './boottime.js';
import { makeCelMaterial, buildOutlines, smoothNormals, mergeFaceLines, mergeByMaterial, buildShadowProxy, hairBand, hairDarkTag, earPivots, setCelFix, CEL_FIX, buildSeeLines, SEE_LINES } from '../actors/celmat.js';
import { bindFlightCloth } from '../actors/flight-cloth.js';
import { HEROINE_ASSETS } from '../data/outfits.js';   // wardrobe: every outfit of hers gets the flight cloth
import { mergeCelParts } from '../actors/celmerge.js';

const BASE = 'assets/';

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
};
export const SCULPT_DEFAULT = ['stone_lantern', 'komainu', 'kitsune', 'great_lantern', 'rockfam', 'drywall', 'mill', 'landmarks', 'pot', 'barrel', 'bucket', 'pumpkin',
  'jar', 'cart', 'hen', 'gohei', 'broom', 'hip_lantern', 'earth_column'];
// sculpt GLBs whose COLOR_0 was rewritten by the asset's own post step (dango.mjs post, gohei.mjs / hip_lantern.mjs --split /
// --post: sRGB paint -> linear once) — measured single-encoded, so fixSculptColours must leave them alone
// facet-kit GLBs (tools/sculpt/assets/rock_facet.mjs) write linear COLOR_0 once as well, and so does the landmark driver
// (tools/sculpt/assets/landmarks_lib.mjs vcAll: the kit's bakeVertexColors, sRGB paint -> linear once)
const SCULPT_VC_OK = new Set(['sculpt_dango', 'sculpt_prop_gohei', 'sculpt_hip_lantern', ...SCULPT_TYPES.rockfam, ...SCULPT_TYPES.drywall, ...SCULPT_TYPES.mill,
  ...SCULPT_TYPES.landmarks]);
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

  async function loadModel(id) {
    const info = manifest[id];
    // ?costume=v1 loads the pre-costume character files (A/B shots); see tools/install-costumes.mjs
    const v1 = G.params?.costume === 'v1' && info.fileV1;
    // ?propsv=1 loads the unrefined originals of refined props (upgrade-2 A/B shots and timings)
    const orig = G.params?.propsv === '1' && info.orig;
    const url = BASE + (v1 ? info.fileV1 : orig ? info.orig : info.file);
    const grp = id.split('_')[0];
    // fetch and parse timed separately (boot timeline, docs/api/perf.md "Boot and loading")
    let t0 = performance.now();
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status + ' ' + url);
    const buf = await r.arrayBuffer();
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
    /** True once a model is parsed and model(id) will work. */
    ready: (id) => gltfs.has(id),
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
      const ids = Object.keys(manifest).filter((id) => manifest[id].type === 'model' && manifest[id].preload !== false
        && (!G.sculpt.typeOf(id) || G.sculpt.on(G.sculpt.typeOf(id))));
      let done = 0;
      await Promise.all(ids.map((id) => api.load(id).then(() => progress?.(++done / ids.length))));
      progress?.(1);
    },
    /** Load one asset now (idempotent). Models resolve to their gltf; other types resolve to an ArrayBuffer. */
    load(id) {
      if (!manifest[id]) { warn(id); return Promise.resolve(null); }
      if (pending.has(id)) return pending.get(id);
      const info = manifest[id];
      const p = (info.type === 'model' ? loadModel(id) : fetch(BASE + info.file).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + info.file); return r.arrayBuffer(); }))
        .catch((e) => { G.reportError('asset:' + id, e); return null; });
      pending.set(id, p);
      return p;
    },
    /** Raw bytes of any asset (a fresh copy each call, safe to hand to decodeAudioData). */
    async arrayBuffer(id) {
      const info = manifest[id];
      if (!info) { warn(id); return null; }
      if (info.type === 'model') { const r = await fetch(BASE + info.file); return r.ok ? r.arrayBuffer() : null; }
      const buf = await api.load(id);
      return buf ? buf.slice(0) : null;
    },
    /** AnimationClip[] of a loaded model (possibly empty). Clips of the models named in `clipsFrom` are merged in. */
    clips(id) {
      const g = gltfs.get(id);
      if (!g) return [];
      const info = manifest[id] || {};
      if (info.clipsFrom && !g._merged) {
        g._merged = true;
        for (const src of [].concat(info.clipsFrom)) { const s = gltfs.get(src); if (s) g.animations = g.animations.concat(s.animations); }
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
      const tex = new THREE.TextureLoader().load(BASE + info.file);
      tex.colorSpace = THREE.SRGBColorSpace;
      textures.set(id, tex);
      return tex;
    },
  };
  return api;
}
