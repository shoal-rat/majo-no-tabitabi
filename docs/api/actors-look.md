# actors-look — character / creature cel shading, outlines, springs (as built 2026-11-13, visual overhaul 1)

Owner files: `src/actors/celmat.js`, `src/actors/spring.js`, `src/actors/rig.js`, `src/actors/creature.js`, `toonify` in
`src/core/assets.js`, `src/player/wings.js`, visuals in `src/player/broom.js` / `player.js`.

## What it is
- **CelMaterial** (`celmat.js`): `MeshToonMaterial` subclass (clone-safe; still passes `hookMaterial`, so Veil lighting and fog apply).
  Two-tone shading with a soft terminator; shade colour = texture colour pushed cooler / more saturated (uses the GLB's MToon
  `shadeColor`). Shadow-map shadows are folded into the shade tone by wrapping three.js `getShadow()` in a macro (cast shadows turn
  blue-violet, not grey). Rim light per light + sky rim, warm subsurface band on skin, face normals rounded toward the head centre,
  moving hair highlight band, eye self-light, cloth sheen, fox-tail wag in the vertex shader.
- **Ink outline**: inverted hull with smoothed normals, constant screen width up to 5.5 mm, colour = darkened local texture colour,
  thinner on the face, skinned + morph aware, none on transparent parts. Fades out at 38 m (high) / 22 m (med) / 10 m (low).
  One shared material, two outline draws per character (body+hair+ribbon+add-ons merged; face separate).
- **Springs** (`spring.js`): hair / skirt / sleeve bones found by name get verlet springs (fixed 60 Hz steps, gravity, wind, teleport
  snap > 1.5 m, collision spheres on head, neck, chest, arms, hips, thighs). Cut-offs: 24 m (med) / 14 m (low).
- **Life** (`rig.js`): eye darts, breathing, NPC mouth movement + light smile while a dialogue is open, a soft contact shadow under
  every actor (steps aside when the owner places its own).
- **Creatures**: shade / paper / stone tints are cached cel clones; shade bodies deep violet with a pulsing edge glow; low-poly
  creatures get welded smooth normals and a back / belly gradient.
- **Props**: wings of light feather shader; broom + gohei cel-shaded with outlines on wood / straw / brass; ribbed flickering lantern
  paper material.

## API
- `toonify(root, opts)`: auto-detects VRoid characters (`J_Bip_C_Head`) and creatures (any skinned model) → cel path. opts:
  `character`, `creature`, `outline = true`, `emissiveGlow`. `G.assets.celMs` = load time spent here. URL `?celoff=1` restores the
  old flat toon (springs, eye darts, contact shadows off too) — for before / after shots.
- `celmat.js`: `CelMaterial` (`.cel {kind}`, `.celU`, `setSpirit(color, k)`), `makeCelMaterial(src, kind, extra)`,
  `buildOutlines(root, {faceWeight, only})` (outline meshes carry `userData.outline = true`), `outlineMaterial()`,
  `celifyProp(root, {outline: RegExp})`, `lanternPaperMaterial(color, strength)` (`userData.setGlow(k)`), `mergeFaceLines(root)`,
  `smoothNormals(geo)`, `CEL_U`, `updateCelGlobals(G)`.
- `spring.js`: `createSprings(model, {scale})` → `{count, update(dt, {wind}), reset()}` or `null`.
- Actor additions: `actor.springs` (bool), `actor.resetSprings()`, `actor.speaking` (bool: mouth + smile; NPCs infer it from
  `G.ui.talking` when looking at the heroine within 9 m), `createActor(id, {blob: false})` to opt out of the contact shadow.
  `setTint({dark: true, rim: colour})` gives the spirit look.

## Rules for other systems
- Never rename the body / face / hair / eye materials of character GLBs (the cel path keys on `Face`, `Eye*`, `Hair*`, `FoxTail` …).
- If the shadow chunk changes (`getShadow` signature), the cel macro must follow.
- Call `actor.resetSprings()` after hard cuts if hair snaps.

## Measured cost (headless, shared machine — treat as rough)
Heroine alone: 45 → 47 draws, 82k → 131k triangles (outline hulls), rig update 0.10 → 0.23 ms. Ten outlined, sprung humanoids at
5–7 m: about +5 ms GPU and +5 ms CPU over the old look.

## Known shortfalls (to address in later rounds)
- The models are the ceiling: VRoid samples with 512 px cast textures; no painterly grain on cloth or skin.
- Hair highlight reads as a faint sheen, not a crisp ring (needs a per-hairstyle mask).
- Outline hulls double character triangles; crowds need a cheaper far path.
- The dialogue system does not say who speaks, so the heroine never lip-syncs (story should set `actor.speaking`).
- No ear twitch; tails only wag in the shader; no foot planting beyond the existing leg IK.

## Creatures (upgrade 3 — as built 2026-11-13)
Owner: the creature engineer — `src/actors/creature.js`, the creature sections of `celmat.js` (the humanoid sections
belong to the motion engineer), the skinned non-humanoid path of `toonify`, looks / motion / spawn / death presentation
in `src/combat/{types,wildlife,enemy,spawner}.js`, `tools/refine-creatures.mjs`, `assets/models/refined/{ani_*,mon_*}.glb`.
Ambient small life (birds, insects, fish, frogs, jellies) is a separate system: docs/api/life.md.

**Which bodies the game shows.** Enemies: 纸魅 (paper wraith) paper (hand-built `makeHitogata`), 影团 (shade blob) blob / blob_small (hand-built
`makeJelly`), wolf (`ani_wolf`, shade tint; also the boss), moth (`mon_bat`, shade), 鬼火 (will-o'-wisp) wisp (`makeWispFlame`), golem
(`mon_golem_big`, stone), plus the humanoid shade boss. Wildlife: fox deer stag chicken cow dog sheep koi frog raccoon
cat hedgehog. The other 17 `mon_*` files in the manifest are not used by any spawn table and were not refined.

**Hand-built bodies** (own shaders, one or two draws each, outline off):
- 影团 jelly — translucent deep-violet bell with an inner ember core, Fresnel edge glow, ember eyes; wobble and
  squash in the vertex shader (`motion: 'jelly'`); dies by splatting flat and soaking into the ground.
- 纸魅 hitogata — a folded paper doll (katashiro): washi canvas texture with brushed ink face, vermilion seal, ink edge;
  flutters in the vertex shader; dies by burning in from the edges (ember rim in the dissolve band).
- 鬼火 wisp — flame body + soft halo + white eyes (`noFx`: flashes swap the body only, never the halo).

**Refined rigs** (`node tools/refine-creatures.mjs [--manifest]`, offline): 15 skinned files get voxel AO +
back / belly gradient baked into COLOR_0 (overall value normalised to 0.93, so the cel ramp is not dimmed) and a
30 % palette pull toward PAL with saturation ≤ 0.72. Vertex count / order, JOINTS / WEIGHTS, skins, inverse binds,
node names and clips are verified byte-identical before the manifest is repointed (`file` → refined, `orig` kept,
`refined: 'creature'`). Runtime `smoothNormals` in celify still softens facets on top.

**Motion layer** (`createCreature`): group (gameplay place / yaw) → `body` (procedural) → model (clips). Breathing,
blinks (eye meshes squash), squash & stretch on landing / take-off, banking into turns, lean with speed, recoil on hit,
an exaggerated wind-up pose while `c.tell` > 0 (same timing — it reads the existing wind-up, it never delays it).
Quadruped rigs with Head / Ear* / Tail* bones get ear flicks, a sprung tail and a head that looks up at the heroine.
Every creature renders with per-creature "fx" clones of its materials (same programs): `uFx` = (dissolve, flash,
tell glow, —), `uFxB` = (min y, height, radius, style). Flash, spawn (rises out of a brushed ink blot) and the death
dissolves are uniform animations — no material swaps, no pops. `?crv=1` = the pre-upgrade look for A/B shots.

**Rules for other systems**
- Bounds: `c.height` / `c.length` are measured AFTER posing the skeleton (`skeleton.update()` + `computeBoundingBox()`).
  Before this, Quaternius rigs measured in centimetres (wolf 32 m, golem 150 m), which made a 80 m ink blot cover the
  screen at golem spawn and put the dissolve band in the wrong place. Do not measure skinned meshes with a bare
  `Box3.setFromObject` before their first update.
- Gameplay never reads the motion layer: hit boxes / capsules / attack timing come from types.js as before.
- Only game code may set `e.cr.tell` (0..1) during an existing wind-up; it is visual only.

**Measured cost** (1440×900 'high', 7 enemies at 6–10 m, game camera, best p25 A/B of renderFrame + gl.finish, machine
load ~140 — rough): 曦光 (dawnlight region) +1.6 ms / +~27 draws incl. shadow passes, 常夜 (evernight region) +1.2 ms / +51 draws. The motion layer is CPU-only
(a few vector ops per creature); fx clones share programs, so no new shader compiles per creature.

**Known shortfalls**
- The animals are still asset-pack silhouettes: the bake gives them soft belly shade and AO, not new shapes; no fur
  cards, no feather / scale painting beyond the cel grain. A hand re-model of the six most-seen animals (fox, deer,
  stag, chicken, cat, dog) is the next step.
- Wolf / moth / golem keep stock clips; only the procedural layer adds life (no new attack or hit clips).
- 影祟 (shade) wolves read as dark violet silhouettes with an edge glow; by day the edge glow is faint.
- The 17 unused `mon_*` models were not refined; refine them with the tool if a spawn table ever uses them.

## Performance pass (2026-11-14, see docs/api/perf.md)
- `assets.model()` now makes the SkinnedMeshes of one clone share a Skeleton when they have the same bones and bind
  inverses (`shareSkeletons` in core/assets.js). SkeletonUtils.clone had given each mesh its own, so every character
  recomputed and uploaded its bone palette ~25 times per render. Poses are unchanged (same bone objects).
- Transparent double-sided face layers (FaceLines, EyeHighlight…) get `forceSinglePass = true`: three no longer draws
  them twice (back then front). `?perf=0` restores both.

## Look round (2026-11-14, fault 6: plastic cloth / cone skirt)
**What the look is now.** Cloth reads as painted fabric under a clear key light: pleats and folds turn into shade shapes that
move with the sun, white cloth shades soft blue-grey (never grey), vermilion goes warm on the lit side and deep crimson in the
shade, a warm rim sits on the sun side, the inside of sleeves / hakama is darker, and the garment value runs in one long
gradient (lighter shoulders, deeper hem). Skin and face shade warm and rosy instead of the old cool cloth shade. The heroine's
hakama falls nearly straight with a gentle flare and visible pleats; her kosode (and every plain cast top) has painted form.
- `celmat.js` (garment path only, `uCelG.z = 1`, humanoids; creatures untouched):
  - **Painted folds -> light** (`FRAG_COLOR`): the texel is compared with a coarse mip (`textureLod(map, uv, 4.5)`) of the same
    texture; darker-than-around in the same hue = fold (`celFoldD`). 40 % of that painted dark is lifted, and the fold shifts
    the cel terminator (`h -= celFoldD * 1.1`) and deepens the shade (`× (1 - 0.7·celFoldD)`). Motifs, trims and stitches
    (different hue) are excluded. No new texture, no new UVs: every costume with painted folds benefits.
  - Shade colour for garments: `mix(lum, a, 1.15) · shadeTint · mix(0.9, 1.32, lightness)`, blue lifted in reds (crimson).
    Lit side × (1.035, 1.0, 0.94); a faint warm band at the terminator; rim colour toward warm light; very saturated colours
    lose 10 % chroma.
  - Grain: garments now get long soft brush strokes + a weave whose amplitude fades by its own `fwidth` (only visible close up,
    no shimmer); the old fine "tooth" speckle is gone on cloth (skin / hair keep theirs).
  - Back faces (inside of cloth) 0.45 -> 0.55. Skin / face shade tone: `WARM (1, 0.8, 0.82)` instead of `COOL`.
  - Program cache key `cel4:<kind>` (bumped from cel3).
- Costume generator (`tools/costume/recipes.mjs`): `kosodePaint` — torso form in gradients (side / armpit / under-bust shade,
  drape folds into the sash, blouse bunch above the sash, back + side seams); used by the heroine and by every `npc()` top
  without a pattern or open front. Heroine hakama `flare [0.205, 0.178], curve 1.5, depth 0.021` (was 0.30 / 0.25, 0.85, 0.017);
  himawari and oboroyo hakama narrowed the same way. Paint speckle in skirt / sleeve paint halved (the shader adds the weave).
  All 19 costumes rebuilt + installed; chain names / counts unchanged; `clipsFrom` untouched.

**Rules for other systems**
- Garment textures should paint folds as darker values of the SAME hue (the shader turns them into light-following shade);
  paint motifs / trims in a clearly different hue so they are left alone. Avoid fine per-pixel noise in garment textures.
- Keep garment UV islands dilated (>= 6 px): the fold test reads mip ~4; black gutters only switch the effect off near seams.
- Contact shadow under characters: the rig's blob stays (rig.js); it should match the lighting artist's shadow colour / softness
  (see request in the round report).

**Cost.** Draw calls, materials, triangles and texture memory unchanged (heroine garment 17 805 tris before and after; atlas
sizes unchanged). Per garment fragment: one extra coarse-mip texture fetch, two `fwidth`, ~30 ALU ops — garments cover a few
% of the screen. Same on every quality tier (low / med checked headless).

**Known shortfalls.** Hair highlight shapes and strand grouping, eye life and cheek warmth were not reworked this round
(only the warm skin shade). Spring rest / limits unchanged (`spring.js`); from behind on a slope the hakama still widens
between the legs. Costume checker (solver off) counts a few more inside-vertices in run / sit after the narrower hakama
(akari run 75 -> 99, sit 117 -> 150); the in-game solver keeps the cloth outside, re-check if a pose shows the legs through.

### Look round, revision 2 (2026-11-14, after the art-director review)
**What changed.** Golden shots: `.tmp/play/gold_figure_r2/`.
- **Kosode has form**: `kosodePaint` adds a long drag fold from each armpit to the sash (front and back), a short tension
  fold under the arm and gathers fanning up out of the sash; `sleevePaint` adds three drape folds wrapping over the arm
  from the shoulder. All are cool grey-blue values of the same white. In `celmat.js`, light cloth (coarse-mip luminance
  > 0.55) no longer has its painted dark lifted, and its fold depth pushes the terminator 2.6× harder. Without that, faint
  folds on white disappeared in full light. All 19 costumes rebuilt + installed (geometry, chains and tris unchanged; only
  the textures changed).
- **Rim on every shot**: humanoid kinds (cloth / skin / face / hair) get a thin rim in screen space on the side of each
  light (`N.xy · L.xy`, `1-ndv` 0.66..0.82). It works when she is back-lit or inside a cast shadow (×0.55), and its
  brightness is normalised to the light (`1.3 / max(lum(Lc), 0.6)`), so a weak dusk sun gives the same edge as noon.
- **No blow-out next to lamps**: humanoid kinds cap the irradiance of any single light at luminance 3.2 (sun = 2.9), so a
  street lamp a metre away can no longer push the white kosode past full sun.
- **Raised arms**: `spring.js` sleeves — when the animated rest points up, the angle limit opens from 95° up to 150° and
  the pull drops by up to 92 %. The sleeve bag then falls down the forearm instead of standing round the head like a hood
  (fidget_b, the stretch, used to read as headless from behind).
- **Gohei shide**: `celifyProp` swaps the GLB's Paper strips (92 verts, flat rectangles in 90° steps) for folded panels
  that tilt alternately in depth, joined by slanted folds (78 tris, same material, same draw). Paper uses the cloth kind
  with a light shade (`shadeK 1.7`) and a faint emissive (0.16) for light coming through the paper. Before, it used the
  fur kind's deep cool shade.

**Rules for other systems.** Lights near characters may be as bright as they like: the cap keeps the cloth readable.
Shots that need a neutral pose should reset the idle fidget timer (the stretch fidget is legitimate in play).

**Cost.** Draw calls, materials and texture sizes unchanged. Shide +32 triangles. Per humanoid fragment and light: ~15 ALU
(rim + cap), no fetches. Spring: one branch + trig per sleeve joint with raised arms only. Same on all tiers (low checked).

## Final round — 团子 (Dango) and the animals (2026-11-14, final-beasts)
Shots: `.tmp/play/fb_before/` (before) vs `.tmp/play/fb_c3/` (companion), `.tmp/play/fb_a4/` (animals, golem), `.tmp/play/fb_l1/`
(hero life). Script: `tools/devkit/final-beasts/shots.js` (`only=c,b,a,g`), `tools/devkit/final-beasts/life.js`.

**团子 (src/story/companion.js)** is no longer the asset-pack fox. It is a hand-built fox spirit: one SkinnedMesh on its own
17-bone skeleton (body, chest, head, two ears, two eyes, seven tail joints, front / hind paws), built at boot from ellipsoids and
swept tubes (~9 k triangles): a round egg body with a white chest ruff, a big head with a white muzzle, cheek puffs and a rosy
blush, tall leaf ears with a rose inner face, amber tips and a glowing tuft, tall glossy amber eyes with two glints, and a brush
tail that swells, twists into three flame tongues and burns gold at the tip. One cel `fur` material: vertex colours carry the
painted two-tone fur (sRGB-painted, converted to linear), `uv.x` indexes an emissive ramp (faint warm light in the body -> gold
flame -> white glints), `setSpirit` gives the warm living edge light. Ink hull by `buildOutlines` with warm-brown ink (thin and
amber on the glowing parts). A Points trail of motes leaves the tail flame (one draw), the halo sprite stays.
- Motion is procedural, no clips: a lagging spring follow (feed-forward of her velocity, small overshoot), banking into turns and
  pitch with speed, a tail whose joints follow each other with growing lag (ribbon), ear flicks, single / double blinks, the head
  (and a little the eyes) turns to where she looks (the camera's aim), now and then to the viewer, to what she is about to
  interact with (`G.interact.current`, it drifts out to peek), to her face in dialogue. In a fight it hides behind her back with
  ears flat and tail tucked; on the broom it curls on the broom's tail, eyes shut, slow breathing. Reactions: thunder within 30 m
  -> ears back, hop, wide eyes; fire / burning / steam close by -> a sneeze (wind-up, snap, burst of motes); she is hurt -> flinch.
  Emotes keep their names (`talk`, `joy` spin + wag + happy eyes, `surprised` hop + wide eyes, `sorrow` droop, `angry` ears back +
  puff, `fun` wag). Public API unchanged: `pos`, `yaw`, `group`, `headPos`, `say`, `hint`, `emote`, `init`, `start`, `update`.
  `C._m` exposes the motion state for shots (set `glance = 0, glanceT = 99` for repeatable cameras).
- Cost: 8 draws before (fox clone: 4 parts + outlines, tail-tip sphere, sprite) -> 4 (body, hull, sprite, motes); no shadow
  either way. ~9 k triangles + hull.

**Re-sculpted animals (src/actors/creature.js `SCULPT`, `applySculpt`)**: fox, deer, stag, chicken, cat, dog and the stone golem.
The asset-pack mesh is the cage: all parts are welded into one surface, block-built models get each block pulled toward the
ellipsoid in its box (`round`), Taubin smoothing (`smooth`), one Loop subdivision (`blocky` keeps part of the cage for carved
stone), the head grows (`head`), eyes grow and get two glints (`eye`), and the painted colour (material colour x atlas texel x the
refined AO bake) becomes a vertex colour with a darker back, a cream belly / throat (`belly`; cold grey patches turn cream) and
big soft value masses. Skin weights are interpolated, so the body stays bound to the model's own skeleton: every clip, the motion
layer and the fx dissolves keep working. One cel material (vertex colours + emissive ramp in `uv.x`) and one hull per animal;
built once per asset at first spawn / warm-up (30–150 ms each), clones share geometry and material. Golem: cool grey stone, each
block its own tone, moss on the upward faces of torso / head blocks, the largest (chest) block leaks cyan light from its front;
the stone tint keeps the vertex colours and the ramp for sculpted bodies. `?sculpt=0` = the old bodies (A/B).
- Cost per animal (main + hull + shadow): deer 7 materials -> 1, fox 4 -> 1, others 1 -> 1; triangles x4 (1.8–2.4 k -> 7.4–9.6 k,
  golem 3.8 k -> 15 k). Draw calls never go up.
- Known shortfalls: a re-sculpt, not a new design — the silhouettes are rounder and softer, but proportions are the asset
  pack's (long deer legs, blocky chicken / cat proportions); no far LOD for the 4x triangles (22 animals max); eye detection by
  material name (deer) or by dark colour on the head (others) — an animal with dark head markings may get an extra glint.
- **Kit bodies** (install-actors round, 2026-11-17): `KIT_BODY` in creature.js swaps an asset for a body made by the offline sculpt
  kit (tools/sculpt) when its `G.sculpt` type is on — today `ani_chicken` -> `sculpt_ani_chicken` (type `hen`, on by default):
  same skeleton and clips, its own smooth vertex-coloured body (4.2 k tris instead of the 8.3 k re-sculpt), and `applySculpt` is
  skipped for it (it would subdivide it again and read its colours as AO). `?sculpt=0` = the asset-pack hen.

**Sculpt-kit props and spells (install-actors round)** — `G.sculpt` types (core/assets.js; `?sculpt=0` = every old object):
- `gohei`, `hip_lantern` (player.js `sculptGohei` / `sculptHipLantern`, celmat.js `sculptProp`): one THREE.LOD per prop, each
  level = one mesh per material group (gohei Wood / Metal / Paper + 2 hulls = the old 5 draws; lantern paper + rest = 2, old 3),
  LOD0 colour atlas + object-space normal map, LOD1/2 vertex colours; same attach frames, placeGohei and night rule. The shide
  hang rigid at rest (anchors `shide_L/R_1..3` are merged into the paper mesh). The lantern's glow strength is lifted by the
  paint's mean so it glows as before. core/assets.js `unPivot` undoes three r187's GLTFLoader reading the kit's `extras.pivot`
  text as an array (it made the anchors NaN).
- `earth_column` (spells/visuals.js `sculptColumn` / `sculptRubble`, entities.js `spawnPillar`): a random variant A/B/C per cast in
  a holder with the old base pivot (rise, platform, collider, shatter, crumble unchanged); LOD0 atlas within 20 m, VC LOD1
  beyond; a rubble skirt (no collider, no shadow) heaves with the cast and sinks with the crumble, drawn only within 20 m.
- `dango` (story/companion.js `sculptedFox`, celmat `CEL_TIP`): installed but HELD (not in SCULPT_DEFAULT) — see the comment there.

## Draw-call pass (2026-11-14, see docs/api/perf.md "Draw-call pass — characters, creatures, contact shadows")
- **Merge at load** (`actors/celmerge.js` `mergeCelParts`, called by `core/assets.js` celify after outlines + shadow proxy):
  the cel parts of a character (same skeleton / bind / world transform / head centre) become
  `cel:body` (opaque, no morphs), `cel:face` (opaque morph parts, own morph dictionary: blink, joy, a/i/u/e/o…),
  `cel:decals` (transparent: FaceLines, EyeHighlight, HairBack; single pass), plus hidden far views `cel:body_far`
  (body + face at rest, one draw) and `cel:decals_far` (HairBack). One `CelMaterial` with `cel.multi` per set: vertex
  attribute `aCelS` = slot, per-slot uniform arrays (`uSlC` colour, `uSlT` shade tint + kind, `uSlP/Q/G/H/S/V`, `uSlE`
  emissive + map code, `uSlA` alphaTest / ear / one-sided), maps in up to `CEL_ARRS` (5) `sampler2DArray`s, one per map
  size (no resampling). The compile-time `CEL_KIND` branches become runtime branches on the slot's kind: same maths per
  fragment. Program key `cel4m` (one program for every merged character).
- **Documented material names live on as slots**: `material.cel.slots[i].name`, `mesh.userData.celParts`
  ([{ name, slot, start, count }]); `celSlotsOf(model)` lists them. Per-clone edits by name: `hideCelParts(mesh, re)`,
  `splitCelPart(mesh, re, material)` (own draw, e.g. glowing eyes), `restoreCelParts(mesh)`. `setTint` on a merged
  part edits the slots (dark: eyes split out and glow, the rest violet with a spirit rim); npcs.js tone edits and the
  hidden Kanzashi use the slot API.
- **Distance** (rig.js): far views beyond 25 m (1 m hysteresis), body outline off beyond 30 m, face outline beyond 22 m;
  `createActor(id, { animLod: true })` (folk and cast NPCs) poses every 2nd frame beyond 60 m, every 4th beyond 100 m.
- **Shadow proxy** includes the morph face (`buildShadowProxy(root, { morph: true })`): one shadow draw per cascade.
- **Creatures** (creature.js `mergeCreatureParts`): untinted, unsculpted asset-pack animals fold each part's colour
  (material colour × vertex colour) into one vertex-coloured cel material per compatible set (same kind and uniforms).
  Eye meshes (by mesh name), textured / morph / animated-node / parent meshes and tinted creatures stay as they were.
  Merged mesh `cel:creature`, material `CelMergedFur:<names>`, `userData.mergedParts` = the part names.
- **Contact-shadow blobs** (rig.js): `makeActorShadowBlob` objects keep their API but no longer draw (layers 0); one
  InstancedMesh named `actorBlob` draws every live blob with its own opacity.
- Off: `?castmerge=0` (characters + animals), `?blobbatch=0`, `?perf=0`; `?castab=1` keeps an unmerged clone per
  character for A/B shots (`G.assets.modelUnmerged(id)`).
- Known: FaceLines' morph dictionary is numeric after `mergeFaceLines` (names lost), so the eyelines take zero deltas
  (they never moved before either). A merged character's far / near switch runs in `rig.update`; an actor that is
  never updated keeps the view it was created with.

## Character fixes — heroine look (2026-11-18, .tmp/heroine-look/DONE.md has the full hand-over)
One switch: `?charfix=0` (read once at load into `G.charfix`, `celmat.CEL_FIX.on`) restores all five behaviours below as
they were, so before | after shots come from one build. Programs carry `:fix` in their cache key.
1. **Head centre** (`assets.js` celify): `uHeadC` = bounding-box centre of the Face mesh's BASE positions (three's
   `computeBoundingBox` includes morph extents and pulled it ~5 cm down). Heroine 1.360 → 1.410 m.
2. **Hair band** (`celmat.js` FRAG_POST, `hairBand()`): one soft band on the head's roundness, lit by the sun / moon key
   (directional light 0 — the Veil hook routes the sun only there; the old ring sat in RE_Direct, which only point lights
   reach: why it never showed by day and turned into a lantern-lit saw-tooth at night). Slides with the half vector, breaks
   where the normal leaves the head's roundness, quiet cool band at dusk / night. Parameters from the hair material's glTF
   `extras.hairBand = { y, half, strength, teeth }` (metres, bind space, `y` above uHeadC; `teeth > 0` = old zig-zag ring);
   else `extras.hairRing` (abs y); else the bounding-box guess. Stock cast hair uses the soft band too (`?stockband=0` keeps
   the zig-zag). Tuning: `?hairband=y,half,strength`. uHairB / uSlH = (y, half, teeth, strength).
3. **Dark hair at dusk / night**: the lift came from the warm night fill / lamp pools + warm key on the hair; BLACK hair
   (per material: mean albedo dark and not warm, `hairDarkK`; see fix round) now has its indirect and direct turned cool and lower by `mvV` (veil amount). Rim untouched; skin, cloth and
   light / coloured hair unchanged.
4. **Brows / lash line through the own fringe** (`buildSeeLines`, rig.js visibility): one extra SkinnedMesh `cel:seeLines`
   per character whose face lines are ONE primitive (heroine FaceEyelash, stock merged FaceLines), drawn 3.5 cm toward the
   camera along the view ray with depth test on, faded by facing (gone by ~70° / back of head) and distance (hidden past
   `SEE_LINES.far` = 10 m). Mask: opaque hair writes colour alpha 0, the lines blend with SRC_ALPHA_SATURATE so they land on
   hair only (never headbands, hats, hands, gohei, other characters). Dark hair: stroke lifted toward skin and added;
   light hair: darkened (reverse subtract). Strengths per texture row: `SEE_LINES = { off, brow 0.6, lash 0.4, lower 0.25,
   lift 0.6, far 10 }`, tune with `?seeline=off,brow,lash,lower,lift`. Separate (unmerged) stock line layers get none.
5. **Face lines follow the lids** (`mergeFaceLines`): the morph dictionary is captured before `updateMorphTargets`
   renumbers it, so stock eyelines / lashes / brows follow blink, joy, surprised (the "Known" note above is fixed).
Best hair band for akari=hair: `{ y: 0.072, half: 0.009, strength: 0.9, teeth: 0 }`. Cost: +1 draw near (265 → 266 at the
shrine), 0 past 10 m, frame time unchanged (~31 ms headless); no shader errors on low / med / high. Weak: through-fringe
brows read strong on light hair (consider brow ~0.45 there); darker night hair shows pre-existing model gaps more.

**Fix round (2026-11-18, after two independent checks).**
- Black vs coloured hair is decided once per hair MATERIAL (`hairDarkK(material)`: mean albedo lum 0.06–0.2 and warmth
  (r−b)/max 0.12–0.35 → 0..1), passed in `uHairB.z = −1 − k` (soft band or no band; `teeth > 0` keeps the old meaning and
  falls back to the per-texel test). Dark red / auburn / brown hair (shoku, fox kids, villagers, himawari) keeps its colour
  at dusk / night; no two-tone inside one texture. Black hair: cool and dark as before, plus a dim cool value on the lock
  faces turned to the moon key and the sky (`mvPalette(MV_ROW_MOONKEY)`), so locks read at night and from the side.
- Band: Gaussian falloff (σ = 1.2 × `half`), centre tilts with the light (horizontal half vector vs lock normal) and slides
  with it, value varies lock by lock (Kajiya-Kay term on the lock normal × long streak noise), quiet at the back
  (front factor 0.2–1). Colour: cool pale on black hair, a lighter tone of the hair's own colour on coloured / light hair
  (no grey stripe on warm stock hair). Night band = moon key, cool. Same `extras.hairBand` values still best for akari=hair.
- See-through lines: dusk / night strength × (1 − 0.45·night), lift turns from skin toward cool grey and the lit result is
  cooled (no warm brown strokes under the lantern); lash row only where the stroke is thin (mip-blurred alpha at
  `SEE_LINES.lod` = 2 → the lash wing's broad fill and its second tail are gone); light hair × `SEE_LINES.light` = 0.7.
- `setTint` leaves `cel:seeLines` alone (no map-less toon clone); a dark shade tint hides it.
- Face rounding: under the fix the spherise centre keeps a small upward bias (`cd.y += 0.02`, `CEL_FY`): the face keeps the
  cool shade and blush contrast it had with the old (too low) centre.
- Tuning without rebuild: `?hairtune=night,day,width,seeNight,faceTilt` (1,1,1,1,0.02 = shipped), `?seeline=…,lod`.
- Verified on the default heroine (char_akari, sculpted hair, extras.hairBand 0.072 / 0.009 / 0.9) and 8 stock cast;
  low / med / high compile clean; acceptance playthrough OK; no draw-call change in this round.
