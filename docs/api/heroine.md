# heroine — 灯里 (Akari) v3: a base figure dressed in separate layers (as built 2026-11-17, round 'finish')

> **Current player model.** 灯里 wears 魔女旅行装 (witch's travelling outfit) by default. Rebuild her sculpted face and body with `tools/sculpt/figure/build-akari.mjs`, the silver hairstyle with `tools/sculpt/figure/build-hair2.mjs`, then run `node tools/costume/wardrobe-build.mjs --install`. The travelling coat and hat are built by `witch-traveller.mjs` and `witch-hat.mjs`. All three outfits share the body, facial targets and hair. The following v3 construction notes describe the earlier shrine outfit.

Owner files: `tools/costume/v3.mjs`, `tools/costume/v3-layers.mjs`, `tools/costume/v3-install.mjs`, `tools/costume/cull.mjs`,
`tools/costume/keepskel.mjs`, the field designs
`tools/sculpt/assets/akari_outfit*.mjs`, `assets/models/chars/char_akari_v3.glb`, the manifest entry `char_akari_v3`, the
heroine id lines in `src/player/player.js`. Builds on docs/api/cloth.md (solver, garment shading) and the sculptor's base
figure (`assets/models/sculpt/akari_base.glb`, notes `.tmp/sculpt/akari_base/FITTING.md`). Work log: `.tmp/akari-v3/PROGRESS.md`.

## Switch
The default retains the wardrobe save id `miko` and manifest id `char_akari`.
- No parameter → the outfit she wears (save / `?outfit=miko|swim_a|swim_b`, see "Wardrobe"); the travelling witch outfit is
  `char_akari` → `models/chars/char_akari_miko.glb` (preload). `src/player/wardrobe.js` `assetOf()` picks the id;
  `src/player/player.js` `akariId()` uses it for createActor and the preload in `init`.
- `?akari=<name>` → the manifest entry `char_akari_<name>` (any one; wins over the outfit): `old` / `v2` = `char_akari_old`
  (the model shipped before the wardrobe, v2 costume on the VRoid body, comparison only, to be deleted), `base` = the bare
  base figure (test only, never shipped), the hair maker's `hair2` / `hair2f` test characters. `char_akari_v3` and
  `char_akari_hair` no longer exist (retired at the install: `.tmp/wardrobe/retired/`).
- Every wardrobe entry: same skeleton, inverse binds, clips (`anim_ual`, `anim_miko`), 13 morphs, `bones`, `hipsHeight` 0.887;
  `secondaryChains` and `springDefaults` as cloth.md describes (+ `springDefaults.hair` for the sculpted tails).
- `rig.js` treats every id that starts with `char_akari` as the heroine (her own mouth, no NPC auto mouth-flap).

## Build
```
SCULPT_THREADS=2 node tools/costume/v3.mjs --out file.glb   # ~6-12 min cold on a shared machine (contours the field layers), ~3 s when cached
```
Since the wardrobe install this is ONE STEP of `node tools/costume/wardrobe-build.mjs --install` (see "Wardrobe"), which runs
it with `--out .tmp/wardrobe/build/miko_dressed.new.glb` whenever the base figure or a source changed. `v3-install.mjs` (the
old `char_akari_v3` test entry) is retired: do not run it.
Switches: `--whole` keeps every skin and undergarment triangle (no cull); `--keeplegs` keeps the leg skin under the red lining;
`--out file.glb` writes elsewhere. Outputs: the GLB, `.tmp/akari-v3/out/build.json` (pieces, tris, cull stats, skeleton check,
chains), `char_akari_v3.layers.json` (sidecar for `tools/costume/check.mjs`), `tex_*.jpg`. The build fails if the skeleton differs
from the base figure's (`keepskel.mjs` puts the generator's re-placed J_Sec_ nodes back to the base's rest + inverse binds and runs
writer.mjs `compareSkeleton`: 175 joints, same names / parents / IBM / rest).

## Layer structure (the point: every garment is its own layer on a whole body)
Inside out. The BODY is never cut, hidden or deleted; every layer is a solid outside the one under it. Each garment is its
own node (mesh) and material group in the GLB:

| node | layer | material(s) | made by | tris (in the file) |
|---|---|---|---|---|
| akari_body / face / hair | 0 | Body, Face…, Hair | the base figure; the body's covered skin is dropped by THIS build (see Cull) | 8 629 (of 22 180) / 13 090 / 12 044 |
| akari_ribbon (hair bow) | – | Ribbon | the base (refitted by the sculptor, RibbonL/R chains) | 340 |
| akari_under | 0.5 | cloth_white, cloth_trim | the base's robe + shorts + cord, re-emitted (geometry, weights unchanged; ramp moved into the outfit atlas); covered parts dropped | 5 125 (of 10 012) + 594 |
| akari_insleeve | 0.9 | cloth_white | field `insleeveShape` (white inner sleeve, elbow to wrist, own node) | 1 950 |
| akari_kosode | 1 / 1.2 | cloth_white (body + collar band), cloth_trim (red line) | fields `kosodeShape`, `bandShape`, `redShape` | 12 018 + 3 326 + 1 100 |
| akari_tabi | 1 | cloth_white | field `tabiShape` (left foot contoured, mirrored) | 3 234 |
| akari_lining (hakama's red divided legs) | 1.5 | cloth_red_inner | field `liningShape` (left leg contoured, mirrored) | 3 074 |
| akari_hakama | 2 | cloth_red | generator `buildSkirt` (18 knife pleats + box pleats, 10 chains) | 3 672 |
| akari_obi | 5–6 | cloth_trim | `buildSash` (sash, back bow, 2 tails, koshiita back board) + `buildFrontBoard` (v3.mjs) | 1 600 |
| akari_sode | 5.8 | cloth_white_sode, cloth_trim | `buildSleeve` (wide bag, cord, tsuyu tails, 2 chains each) | 2 488 |
| akari_charm | – | cloth_trim | `buildCharm` (bell + shide on a chain) | 324 |
| akari_zori | – | cloth_trim | `buildSandals` (sole under the tabi's sole, red hanao laid on the tabi) | 992 |

File 73 600 triangles (`--whole`: 92 038), 4.85 MB.

**contourPieces keeps ONE connected part** (figure/pieces.mjs `largest`): a garment in two parts (two feet, two legs, two arms) is
contoured on her left (+x) side and mirrored (`withMirror` in v3-layers.mjs). Until round 'finish' the tabi and the lining existed
on her left leg only, and a field band that broke into pieces lost all but the largest (the red line at the nape).

**Two ways a garment is made, chosen by how it sits:**
- *Lying layers* (kosode, collar, tabi, lining) are fields grown from the body field (`tools/sculpt/assets/akari_body.mjs`
  `bodyShape`) + a clearance, contoured with the sculpt kit, cut exactly on their hem / cuff planes with a wall down to the layer
  beneath (`hem()` in v3-layers.mjs: thickness at every opening), normals from the cloth's own field (broad: 5.5 mm on the
  kosode, so it drapes over the body's small forms instead of repeating them), skin weights copied from the body
  (`copyWeights`). Fold shade is one number per vertex in `uv.x` into a ramp row of atlas A (no unwrap): the kosode's is the
  painted form of `recipes.kosodePaint` (side shade, under-bust and armpit shade, drag folds into the sash, gathers above it),
  plus walls and the soft shadow line the collar casts.
- *Hanging layers* (hakama, sode, sash + bow + tails, boards, charm, zori) are lofted by the garment generator
  (`tools/costume/outfit.mjs`) over the stack of what is already worn (`Wardrobe.stack` sees every field layer), painted into
  atlas B, pleats / bag folds as geometry.

**To add or swap a garment on the base figure:**
1. A lying garment: write its field in a new `tools/sculpt/assets/akari_outfit_<name>.mjs` (clearance OVER the layer under it —
   `kosodeClear` / `underClear` in akari_outfit.mjs show how: robe + 4.5 mm on the trunk), add one `contourPieces` call and
   a `hem()` in v3-layers.mjs, `emit()` it in v3.mjs with its own `group` (node) and `layer`.
2. A hanging garment: call the generator piece in v3.mjs inside `withGroup(wd, '<node>', …)`; it fits over the stack by itself.
3. Swap = replace the call; nothing else references a garment. Remove = drop the call (the body and undergarment stay whole).
4. Keep materials to the cloth names (`cloth_white`, `cloth_white_sode`, `cloth_red`, `cloth_red_inner`, `cloth_trim`, `Ribbon`)
   and texture sizes to the ones already in the file (see Draw cost) — the game merges by material and by map size.

## Fitting data (from FITTING.md, measured on the figure)
Waist y 1.03 (girth 495 mm), hips fullest y 0.852 (796 mm), crotch 0.798, bust 1.156, neck base 1.268, sole 0.035 (the skeleton
stands on 34 mm zori). Undergarment: robe skin + 6.2 mm (3 mm at its cord on y 1.032, 11.4 mm at its hem y 0.93), sleeves to
|x| 0.218, V apex (0, 1.192); shorts + 4 mm, y 0.962 → 0.668.

| v3 garment | where | clearance / size |
|---|---|---|
| kosode body + sleeves | hem y 0.955 (inside the hakama), cuffs |x| 0.345 (past the elbow, walled onto the inner sleeve) | robe + 4.5 mm on trunk and upper arm, 7.5 mm over the bare forearm; front padded straight from the bust apex to the sash (hosei, 110 → 81 mm front depth), back padded flat over the blades (102 → 69 mm) |
| inner sleeve | |x| 0.30 (under the kosode) → cuff 0.497 (wrist 0.508) | 4.5 mm under the kosode, 11 mm loose over the forearm, gathered to 6.2 mm at the cuff; folds + cuff gathers painted |
| neck opening | V and nape | 16 mm (horizontal) outside the robe's V / neck hole; behind the neck 8 mm (`cutBack`), so the cut edge hides under the red line |
| collar band (eri) | centred 25 mm outside the robe's V line, crossed left over right, runs under the sash at her right waist; behind the neck its height is ONE fitted smooth curve (c0 + c1 cos a + c2 cos 2a) | 27 mm wide, sunk 3.6 mm into the cloth (steep wall = clean edge on the shoulders; the part > 2.2 mm inside the kosode is clipped off), 7.2 mm high; over the opening it floats 2.5 mm above the robe's band |
| red line | 6.8 mm outside the robe's V line, from her right V edge round the nape to the crossing; path AND height on the envelope min(kosode cloth, robe incl. its raised band) | 10.4 mm wide (about 9.5 mm shows beside the band), 2.2–5.8 mm above the envelope; its own contoured piece (crisp outline) |
| sash | centre y 1.04, 34 mm high (the natural waist) | 5 mm over what is worn at each edge |
| hakama | top y 1.052 (under the sash), hem y 0.124 | ease 22 mm, flare 226 × 198 mm at the hem, curve 1.3, 18 pleats 21 mm deep (v2's 196 × 174 hung almost straight over her fuller hips) |
| front board / koshiita | under the sash in front / above it at the back | 100–132 × 52 mm, 3.5 mm thick, laid on the hakama by ray-cast / 60 mm koshiita |
| tabi | to y 0.2 | foot + 3.5 mm, the four small toes in one toe box, split at x ±0.0347 (2.6 mm) for the thong |
| lining | y 0.205 → 0.84, open at the top | legs + 11 mm over the shorts, 8 mm below, each leg on its own |
| zori | sole top 1.2 mm under the tabi's sole | — |

## Chains and colliders
Chains keep the v2 names (`J_Sec_<Part>_<n>_<nn>`, docs/api/cloth.md): Hakama_1..10 (skirt, parents L/R UpperLeg, legs
follow 0.6), SleeveL/R_1..2 (sleeve, UpperArm / LowerArm, arms-down rest rotation), SashTailL/R_1 + Charm_1 (Hips), and the
base's RibbonL/R_1 (Head). `Wardrobe.chain()` (garment.mjs) places a chain at its cloth while the garment is built and skinned;
`keepskel.mjs` then puts every J_Sec_ node back at the BASE's rest transform and inverse bind (same bind-pose mesh), so the file's
skeleton is the base's exactly. Cost: the chain pivots are the base's (= v2's), 0.5–2.6 cm off the hakama's / sleeves' own hang
points and 5.5 cm off for the sash tails and charm (the v2 sash sat higher). `springDefaults` = char_akari's.
Hakama in the air (measured, work/probe.js): v2 and v3 give the same solver tip statistics in idle / jump / sprint / stop / glide;
the narrower look came from the rest bell (now 226 × 198 mm), not from the springs.

Colliders: the solver's own capsules (spring.js COLLIDERS, scaled by hipsHeight) plus each kind's hit thickness already clear
the figure's capsules (FITTING §6) with the clothes on: thighs 0.075 + skirt hit 0.03 = 0.105 against thigh 0.072 (max 0.094)
+ lining 0.011; shins 0.055 + 0.03 against 0.056 + 0.008; hips 0.13 + 0.03 against the pelvis 0.138 under robe + kosode; chest
0.11 + sleeve hit 0.035 against 0.126 + 0.011. spring.js was not changed.

## Draw cost
- At load the parts merge as for v2 (celify → mergeByMaterial → celmerge): **3 colour draws** (`cel:body`, `cel:face`,
  `cel:decals`) + 2 outline hulls for her; with gohei and lantern 11 colour + 4 outline draws, the same as v2 (measured in game).
- celmerge packs maps in at most 5 size classes (CEL_ARRS): keep the outfit atlases at 512² (A) and 1024² (B).
- **Triangles drawn (in game, drawRange-aware): v3 74 694, v2 36 838** (her + gohei + lantern). Count with the draw range:
  `cel:body` holds body + face in one index buffer and draws only the body range, so `index.count` counts the face twice (the
  "112 k" of the first round was 99 k really).

## Cull (tools/costume/cull.mjs) — the layer architecture stays, this outfit's file just skips what nobody can see
`cullCovered(target, covers, opts)` drops the triangles of an inner layer that an opaque LYING layer covers in every pose
(lying layers copy the skin's weights, so covered at rest = covered in every pose; hanging layers — hakama, sode, sash — are
never covers). A vertex is covered when all 5 rays of a 32° cone round its normal hit a cover within 8 cm and the FIRST hit is
≥ 3.5 cm from that cover's open edges; each connected part of a cover is its own cover; an open edge that itself lies under
another cover (the shorts' waistband under the robe, the inner sleeve's top end under the kosode) is no opening; then 1.2 cm
erosion. `normalsFrom` aims an undergarment's rays along the skin's normals (its hem walls face along the limb).
In v3.mjs: body under robe + shorts + kosode + inner sleeves + tabi + red lining (`--keeplegs` keeps the leg skin);
robe / shorts under kosode + lining. Kept: head, neck, hands, a band at every opening. Side gains: the few-millimetre dips of
the kosode into the skin at deep bends (copied weights) can no longer show skin, since that skin is gone. Any outfit build can
call it (also `components`, `openEdgePoints`, `compactKept`, `meshNormals`). Whole-vs-culled pictures in game:
`.tmp/akari-v3/pairs2/q8_whole_vs_cull.jpg` (no difference found).

## Checks
- `node tools/costume/check.mjs <copy of the glb>` with the sidecar (+ `akari_body` added as layer 0 in `.tmp/akari-v3/check/`):
  rest pose: no garment inside the body; posed (solver off, static hang): 1–2 % of kosode vertices dip ≤ a few mm under the skin
  in deep bends (armpit / shoulder: copied weights), sleeves 15–37 vertices into the arms. Counted "inside" pairs that are by
  design: collar sunk 1.5 mm into the kosode, front board's back face inside the hakama, bow over the koshiita.
- `node build.mjs --check src/player/player.js`, `node tools/check-i18n.mjs` pass; no new strings.

## Pictures (round 'finish', same script for both models: .tmp/akari-v3/work/pairs2.js)
`.tmp/akari-v3/pairs2/`: q1_idle (2 m, four sides + close 3/4), q2_collar_feet, q3_cast, q4/q5/q6 motion (game camera / front /
back: run, sprint, stop, jump, roll, glide, broom, swim), q7_dusk_night, q8_whole_vs_cull. Motion pairs are not frame-exact
(wall-clock timing): judge the shape, not the exact moment.

## Known shortfalls
- Collar: the crossing below the V reads as a small white lump up close; the band at the back falls in a soft V instead of a
  crisp round line; the band's outer wall shows a thin ink line on the shoulders (clean, but a line).
- Chain pivots are the base's (see Chains): sash tails and charm swing about a point 5.5 cm off their own top.
- The inner sleeve is close to skin-tight near the elbow (4.5 mm under the kosode's cuff); it reads as cloth at the cuff only.
- Triangles still ×2 v2 (face 13 k + hair 12 k of the base are most of the rest); no character mesh LOD.
- Side-saddle on the broom and the hakama's back panels: as cloth.md (unchanged).
- The rig.js auto mouth-flap id test: `assetId !== 'char_akari'` puts char_akari_v3 on the NPC side (one line for the lead).
- Posed layer check (`tools/costume/check.mjs`) was not re-run this round; checked by in-game pictures only.

## Wardrobe (installed 2026-11-18)
> Original-engine wardrobe (灯里: miko / swim_a / swim_b, `tools/costume/wardrobe-build.mjs`). In 《魔女之旅》 (Wandering Witch) the table,
> unlock rules, files and page are those of **"Wardrobe (journey)"** at the end of this file; the API, the change mechanics
> (`rig.adopt`, `heroineOwned`) and the picture tool below still hold.

The shipped heroine is the base figure with long silver hair and a brass hair cuff, in one of three outfits the player changes at any time
(pause scroll → 「衣装」, Wardrobe), worn everywhere (combat, broom, swimming, dialogue included). All three are owned from the start.

### Files and ONE command
| outfit id | name key → zh-CN | manifest id | file | dressed by | picture (「衣装」 page) |
|---|---|---|---|---|---|
| `miko` (default) | `ui.outfit.miko` → 魔女旅行装 | `char_akari` (preload) | `models/chars/char_akari_miko.glb` | `tools/costume/witch-traveller.mjs` + `witch-hat.mjs` | `ui_outfit_miko` |
| `swim_a` | `ui.outfit.swim_a` → 潮祭水着 (tide-festival swimsuit) | `char_akari_swim_a` (preload false) | `models/chars/char_akari_swim_a.glb` | `tools/costume/swim_a.mjs` (docs/api/heroine-swim-a.md) | `ui_outfit_swim_a` |
| `swim_b` | `ui.outfit.swim_b` → 暮海水着 (dusk-sea swimsuit) | `char_akari_swim_b` (preload false) | `models/chars/char_akari_swim_b.glb` | `tools/costume/swim_b.mjs` (docs/api/heroine-swim-b.md) | `ui_outfit_swim_b` |

```
node tools/costume/wardrobe-build.mjs --install    # THE command: rebuild what is stale from the CURRENT base + hair, check, write files + manifest
node tools/costume/wardrobe-build.mjs              #   the same without the manifest entries
   --full                re-dress every outfit even when nothing changed
   --hair <file.glb>     another hair (default assets/models/sculpt/akari_hair2.glb); one that brings its own joints (hair 2) goes on
                         with the hair maker's composer tools/sculpt/figure/swap-hair2.mjs, --install then adds its chains + springs
   --rebuild-hair        first rebuild akari_hair2.glb (tools/sculpt/figure/build-hair2.mjs)
   --out-dir <dir>       a trial: the three files go there, nothing in assets/, no manifest
   --only miko,swim_a    --no-check (skip the swim coverage checks; refused together with --install)
node tools/costume/wardrobe-pics.mjs               # then, when an outfit's look changed: the three 「衣装」 pictures (game render, ~1 min)
```
**How it stays one command.** Each outfit is DRESSED by its own build (witch-traveller.mjs + witch-hat.mjs / swim_a.mjs / swim_b.mjs) on whatever
`assets/models/sculpt/akari_base.glb` is current (body, face + its 13 shapes, undergarment) into
`.tmp/wardrobe/build/<id>_dressed.glb`, with a stamp (`<id>_dressed.stamp.json`: sha1 of the base figure and of every source
file that dressing reads — the outfit's build, its field files, garment.mjs, outfit.mjs, cull.mjs, the base's regions.json).
A run re-dresses an outfit whenever its stamp differs (so a new face reaches all three by itself; the face is never copied
by hand), refuses a dressing during which the base changed, then puts the hair on (swap-hair.mjs: replaces the nodes
`akari_hair` + `akari_ribbon` by name, keeps everything else) and checks the FINAL file. Every output must pass, or nothing
is written for it:
- skeleton identical to the base figure (175 joints, names / parents / inverse binds / rest); with a hair that brings joints:
  `compareSkeletonPrefix` — the base's 175 first and untouched, the added ones `J_Sec_Hair*` only;
- the face node `akari_face` identical to the base's: same vertices, same index list, the same 13 shapes (hashes);
- every manifest chain joint, the 16 HairJoint nodes and the hair's own joints present; the Hair material carries
  `extras.hairBand` (the sculpted hair, no stock hair texture);
- the swimsuits: their own coverage checks over all their poses (A 24 + rest, B 39) on the final file; their builds end
  with the same check and fail first.
Report `.tmp/wardrobe/build/build.json` (trials: `build.trial.json`). Timing: nothing stale ~5 min (the coverage checks);
all three re-dressed ~8 min (field pieces cached). `--install` writes `char_akari` / `char_akari_swim_a` / `char_akari_swim_b`
through `tools/manifest-patch.mjs` (these ids only, read back); every entry carries `springDefaults.hair`
{stiffness 0.55, drag 0.32, gravity 0.3, hit 0.026}, or with hair 2 the composer's `entryFields` (its chains with their
kinds + `springDefaults.hair` / `.cape`).

**Before a run** (the face and hair makers write these files when their judges pass): check the age of
`akari_base.glb` / the hair file and the makers' logs (`.tmp/akari-face/PROGRESS.md`, `.tmp/akari-hair2/PROGRESS.md`);
never build while one is being written. Tested 2026-11-18: `--install` from nothing (all three dressed, checked, installed:
`.tmp/wardrobe-finish/build1.log`); `--hair assets/models/sculpt/akari_hair2.glb --out-dir …` (hair 2 trial, +26 joints,
all checks pass, not installed: `.tmp/wardrobe-finish/build_hair2.log`).

**White cloth is never skin-coloured.** By day the sun lights her through the Veil hook, whose shade side is filled by the
warm ground / bounce light: white cloth there turned the beige of skin (seen from below). The wardrobe's white materials
carry `extras.shadeAmbient: true` (swim A `cloth_white`; miko `cloth_white` = kosode + undergarment + tabi, and
`cloth_white_sode`): `src/actors/celmat.js` then gives the ambient light of their sun-shaded side the material's own shade
hue (cool grey-blue), brightness kept. Swim A's painted ramp shade is a cooler grey-blue (182,194,228) and its undersides
(gusset floor, under the seat) are painted into it. Swim B has no white cloth (its `cloth_white` is the indigo). A new white
garment: set the flag on its material (`wd.material(name, { …, extras: { shadeAmbient: true } })`).

Developer switches: `?outfit=<id>` starts in that outfit (wins over the save); `?akari=<name>` loads the manifest entry
`char_akari_<name>` (see "Switch") and wins over the outfit: the wardrobe then records choices but keeps the developer's model.

### Data table — `src/data/outfits.js`
`OUTFITS = [{ id, asset, name, desc, icon, pic, lantern }]`, `DEFAULT_OUTFIT = 'miko'`, `outfitById(id)`, `LEGACY_LANTERN`.
- `name` / `desc`: locale keys (`src/locales/<lang>/ui.js` → `outfit.<id>.name|desc`; desc is ONE line, it must fit the card).
- `icon`: a pictogram in `src/ui/icons.js` (`outfit_miko`, `outfit_swim_a`, `outfit_swim_b`; the tab uses `wardrobe`) — the
  card falls back to it when the picture is missing.
- `pic`: the manifest id of the outfit's picture (`ui_outfit_<id>`, type texture, preload false; `tools/costume/wardrobe-pics.mjs`).
- `lantern`: how her hip lantern hangs in this outfit, in the hips bone's frame (her left = +x): `pos` = the lantern's centre,
  `tilt` = its lean about the forward axis (bottom out, resting on the cloth), `cord` = the tie point of a short red cord at the
  waist (null = no cord). `src/player/player.js` `placeLantern(id)` applies it at start and on `player:outfit`; a developer
  model (`?akari=`) uses `LEGACY_LANTERN` (the old [0.17, -0.12, -0.04]). Measured on the dressed files in the bind pose
  (`.tmp/wardrobe-finish/lantern_fit2.mjs`: an ellipsoid of the lantern, r 66 mm / 95 mm, moved out until it just touches):
  miko [0.239, 0.004, -0.04] tilt 0.3 (hook under the obi, clear of the hakama — the old offset sat 8 cm inside it), swim A
  [0.226, 0.017, -0.04] (on the red waist cord, against the wrap skirt), swim B [0.247, -0.057, -0.04] (from the dusk wrap's
  top edge at the knot side). Checked at night standing and running (`.tmp/wardrobe-finish/lantern*.jpg`).

### API (`src/player/wardrobe.js`, wired in `src/player/player.js`)
- `G.player.outfit` — id worn now (what the save stores).
- `G.player.setOutfit(id, { quiet })` → Promise<boolean>: true once she wears it (false: unknown id, model failed to load,
  or replaced by a newer call). Same id = no-op; a newer call replaces a pending one; changing back before the other model
  arrived cancels it. Emits `player:outfit` { id }.
- `G.player._S.wardrobe` (tests): `pending`, `swaps`, `tick()`.
- Exports: `devAkariId()`, `initialOutfit()` (?outfit= → stored save → default; the title screen shows her in it),
  `assetOf(id)`, `heroineOwned()`.

### What a change does
1. The other outfit's model loads on demand (`G.assets.load`, preload false) while the old model stays on screen.
2. It waits while something owns her: `G.mode` 'cutscene' / 'ending', `G.story.cut.active`, an art's close-up
   (`G.cam.cinematicActive`), a learn ceremony (`G.ui.ceremonyActive`, counted in src/ui/ceremony.js).
3. Then, first thing in a player update (before any other system reads her and before the frame is drawn):
   `createActor(asset, same options)` (a placeholder / T-pose model is refused), `newRig.adopt(oldRig)`, same transform in the
   tilt group (and the foot-IK pelvis offset), `update(0)` poses it at the carried clip times, `resetSprings()` starts the
   chains from that pose (no snap from the rest pose), the player's `rig` / `S.rig` / `P.rig` point at it, `oldRig.dispose()`.
   There is never a frame with none, two, a T-pose or the bare base.
4. Petals (`fx 'petals'`) + soft light motes (`'heal'`) and a cloth rustle + sparkle cover the change; made from the pause
   scroll they play when play resumes. A change on load (`start()`, the save's outfit) is quiet.
5. Bad networks (docs/api/perf.md "Loading on a bad network"): a model that cannot be had after its tries is not cached as
   missing. The story's (quiet) choice is asked for again until it arrives; the player's choice resolves false,
   `wardrobe.failed` names it and the 衣装 card says `ui.wardrobe.unavailable` (a toast if the scroll was closed); picking
   it again tries again. If she was built from the primitive stand-in (`rig.placeholder`: her model was lost at boot),
   every player update asks `G.assets.want(asset)` and, the moment it is in, runs this same swap for the outfit she wears
   (`wardrobe.heals` counts them).

`rig.adopt(old)` (src/actors/rig.js) carries: both animation layers (state, clip, weight, fade, time, speed, one-shot / done,
onDone / next, locomotion phase and gait weights), `current` / `upperState`, every plain number / flag of the rig (exertion,
leg yaw, blink timers, look-at weights and angles, pause, time scale, speaking, foot plant / pelvis …), expressions,
look-at target, hand IK (`reach`: the broom grip), the lip-sync line, and every prop added with `rig.attach()` re-parented to
the same bone with its local transform (gohei in the right hand, hip lantern, wings), an active tint (`rig.setTint` keeps its
options in `_tint`; `adopt` re-applies them to the new model: shade version, a duel's tint) and a running hit flash (`flash`
for its remaining time). Not on the rig, so untouched: position,
facing, state (ground / air / glide / broom / swim), the broom and its seat pose (tilt group), the shadow blob, the lamp light,
HP / mana. The outline hulls, see-through brow lines and shadow proxy are part of each model and come with it.

Everything that shows her reads `G.player.rig` when it needs it (title kagura, dialogue shots and lip-sync, cutscenes, the
ceremony's pray, spells' hand bone, duel stage), so it follows the outfit.

Proven in the game (`.tmp/wardrobe-finish/tint.js`, pictures `tint.jpg`): a change while frozen by a real enemy ice hit on
wet skin (G.elements: she stays paused and frozen in her ice, pose jump 0), right after a real hit (hp down, the hurt face
carried), while tinted (duel tint, dark shade version: the new model wears it) and while flashing (the flash runs out on
the new model). Nothing in the game tints or flashes the heroine herself today (setTint / flash serve enemies and duel
rivals); her frozen look is the held pose + the ice effect in the world, both carried.

### The 「衣装」 page (`src/ui/wardrobe.js`)
Three cards: a painted picture of her in the outfit (the game's own render, standing, front three-quarter, cut out by
difference matting over two flat grounds: `tools/costume/wardrobe-pics.mjs` + `wardrobe-pics.shot.js` → 384×640 WebP with
alpha, ~27 KB each, `assets/textures/ui/ui_outfit_<id>.webp`; no text in them) on a washi plate with the outfit's own colour
wash, inside an ink frame torn with the scroll's own deckle masks (`--mk-deckle-rough` outside, `--mk-deckle` inside; the frame
turns vermilion on the worn card), then the name, one line of description, the worn seal on the picture's corner and the
"Enter 换上" (Enter: put on) line. Checked at 1920×1080 and 1280×720 (`.tmp/play/wf_menu1920`, `wf_menu1280`): the picture fills 68 % of the
card. Re-make the pictures after a wardrobe rebuild that changes a look (`node tools/costume/wardrobe-pics.mjs`).

### Save
`G.state.outfit` (default `'miko'` in `defaultState()`, so saves without the field load in the shrine-maiden outfit; an
unknown id falls back to it). Written by the player's `save:collect`, applied in `player.start()` (after load / new game).
The game has no New Game+; a new game starts in the default outfit.

### Adding a fourth outfit
1. **Files.** Dress the base figure (`assets/models/sculpt/akari_base.glb`) in a build of your own, as v3.mjs / swim_a.mjs do,
   taking `--out <file>` (and `--no-install` if it would install itself): same skeleton exactly (keepskel / compareSkeleton),
   garments as layers, an always-worn layer replaces `akari_under` only together with a COVERAGE CHECK that fails the build
   (exit 1) — every swimsuit-like outfit needs one, see swim_a.mjs `coverage()`. White cloth: `extras: { shadeAmbient: true }`.
2. **The build table.** One entry in `OUTFITS` of `tools/costume/wardrobe-build.mjs`: `id` (manifest id `char_akari_<x>`),
   `file`, `src` (the source files its dressing reads: they go into the stamp), `dress(out)` (runs your build), and `check(f)`
   (your coverage check on the final file). For a new manifest id give it an entry once with `tools/manifest-patch.mjs`
   (copy the `char_akari_swim_a` fields: bones, hipsHeight, clipsFrom, morphs, your chains, `preload: false`), then extend the
   `install()` loop over the swim ids to your key.
3. **The outfit table.** One row in `src/data/outfits.js` (`id`, `asset`, `name`, `desc`, `icon`, `pic: 'ui_outfit_<id>'`,
   `lantern` measured with `.tmp/wardrobe-finish/lantern_fit2.mjs <file> <y,z,tilt>`).
4. **Names.** `outfit.<id>.name` and a ONE-line `outfit.<id>.desc` in every locale (`src/locales/<lang>/ui.js`, same keys; no
   science / astronomy words); optionally a pictogram in icons.js.
5. **Build + checks.** `node tools/costume/wardrobe-build.mjs --install` (the coverage checks run on the final file and stop
   the install), then `node tools/costume/wardrobe-pics.mjs` (add the id to its default list), `node tools/check-i18n.mjs`.
The 「衣装」 page lays the cards out in a row of three; a fourth needs `.wd-grid` columns widened (src/ui/wardrobe.js).

## Hair 2 prototype and spring rig (historical measurements)

Long, loose hair with layered, tapered locks.
Replaces the twin tails: long layered fringe with a centre lock that points between the eyes, cheek locks to the jaw, locks
over the ears, two long side locks in front of the shoulders bound with her paper-and-cord ties (left 1.238, right 1.252),
a smooth crown dome with grooves radiating from a whorl, one antenna, three strays, and 7 outer + 6 under ribbons to the
waist (split tips of unequal length). Her red bow (`akari_hair_bow.mjs`, unchanged) sits on the back of the crown.

**Files**: design `tools/sculpt/assets/akari_hair2.mjs` (locks, `CHAINS`, colours, `SIDE_TIE`), cap `akari_hair2_cap.mjs`,
geometry `akari_hair2_lib.mjs` (copy of the hair lib + `meshProbe` onto the real face meshes), build
`tools/sculpt/figure/build-hair2.mjs`, composer `tools/sculpt/figure/swap-hair2.mjs`. Output `assets/models/sculpt/akari_hair2.glb`
(nodes `akari_hair` [Hair + Ribbon ties], `akari_ribbon` [bow]). Test characters: `char_akari_hair2` → `models/sculpt/akari_hair2.char.glb`
(the default miko heroine + hair 2, `?akari=hair2`), `char_akari_hair2f` → `models/sculpt/akari_hair2.face.glb` (the face
sculptor's `akari_base_face.glb` + hair 2, `?akari=hair2f`). Work log `.tmp/akari-hair2/PROGRESS.md`.
```
SCULPT_THREADS=2 node tools/sculpt/figure/build-hair2.mjs --test-char --face     # ~10 s; the cap contour is cached
```
The cheek locks and fringe tips are placed by ray probes onto the Face/Body meshes of every file in `HAIR2_FACES` (default: the
miko file + akari_base_face.glb), outermost wins — rebuild when a face changes. The build prints a hair-over-iris check.

**New joints** (26, APPENDED to the skin after the 175 old ones; rest rotation identity, IBM = inverse rest × the shared bind):
`J_Sec_HairBack_1..5_01..04` (+ `_end`), parent `J_Bip_C_Head`, from under the occiput (y 1.385) to the waist (end y 1.045),
x 0 / ±0.04..0.062 / ±0.07..0.114, 2.5–3.6 cm off the back; `J_Sec_HairSideL_1_01..03` / `J_Sec_HairSideR_1_01..03` (+ `_end`),
parent `J_Bip_C_Head`, from under the jaw (y 1.345) to the chest. Every old joint keeps index, name, parent, rest and inverse
bind: `compareSkeletonPrefix` (swap-hair2.mjs) checks joints, IBM, rest TRS and every non-mesh node; the build and the composer
refuse to write otherwise. Proof run (`.tmp/akari-hair2/tools/proof.mjs`): all 140 clips of anim_ual + anim_miko at 3 times —
max skin-matrix difference of the old joints 0, max body/outfit vertex difference 0 m; `.tmp/akari-hair2/pose_sheet.png`.
(A chest-parented variant was tried and dropped: the neck bends so much in idle / run that the chain root ends up inside the skull.)

**Composer** `swap-hair2.mjs <character.glb> [hair.glb] <out.glb>`: copies the hair file's missing `J_Sec_Hair*` joints (by
name, parent by name) into any of her character files, refreshes ones it already has, then swaps `akari_hair` + `akari_ribbon`
with swap-hair.mjs. Outfits are never rebuilt for the hair.

**Springs** (manifest; the back chains MUST be listed in `secondaryChains` with their kind — by name spring.js would make them
`tail`, which has no chest collider): back chains kind `cape` (colliders chest, arms, hips; limit 80°),
`springDefaults.cape = { stiffness 0.25, drag 0.6, gravity 1.0, hit 0.05 }` — the large hit stands the fall off the round
chest capsule so the broad flat back of the kosode does not poke through; side chains kind `hair`,
`springDefaults.hair = { stiffness 0.55, drag 0.45, gravity 0.45, hit 0.014 }` (also the old short chains: the cheek locks ride
the old side-lock chains at up to 30 %). `swap-hair2.mjs` `HAIR2_SPRINGS` / `entryFields()` hold them.

**Material**: one `Hair` (64² ramp: v = depth, u = inner side — lighter, cooler), `Ribbon` as before; no vertex colours, no
painted highlight. `extras.hairBand = { y: 0.074, half: 0.0105, strength: 0.9, teeth: 0 }` (the crown dome is ~3 mm higher
than the first hair's crown; env `HAIR2_BAND_Y/HALF/K` at build time).

**Numbers** (game camera, 1920×1080 high, shrine): hair node 23.3 k tris + ties 1.1 k (first hair 14.6 k + 1.1 k), bow 1.5 k
(same); same two materials and texture sizes → same draws (429 vs 430 scene calls, noise); spring joints 72 → 98, chains
26 → 33, solver median 0.3 → 0.4 ms per update (timer resolution 0.1 ms).

**Rebuilding the current hairstyle**
```
node tools/costume/wardrobe-build.mjs --rebuild-hair --install
node tools/costume/wardrobe-pics.mjs
```

## Wardrobe (journey) — Elaina's four outfits (2026-11-22)
Pause scroll → 「衣装」 (tab between 「行囊」 (Pack) and 「设置」 (Settings); touch: tap the tab, tap a card). Four cards, each with her painted picture,
name and a two-line description; the worn card is sealed 「着」 (Worn).

| id | zh-CN | manifest model | file | built by | picture | the player may pick it |
|---|---|---|---|---|---|---|
| `apprentice` | 日常服 (everyday clothes) | `char_elaina_apprentice` (preload) | `models/journey/elaina_apprentice.glb` | `tools/journey/build-cast.mjs --only apprentice` | `ui_outfit_apprentice` | from `majo_named` |
| `elaina` | 魔女服 (witch's robe) | `char_elaina` (preload) | `models/journey/elaina.glb` | `tools/journey/build-cast.mjs --only elaina` | `ui_outfit_elaina` | from `majo_named` |
| `swim_a` | 潮祭水着 | `char_elaina_swim_a` (preload false) | `models/journey/elaina_swim_a.glb` | `tools/journey/swimwear.mjs` | `ui_outfit_swim_a` | from `majo_finished` |
| `swim_b` | 暮海水着 | `char_elaina_swim_b` (preload false) | `models/journey/elaina_swim_b.glb` | `tools/journey/swimwear.mjs` | `ui_outfit_swim_b` | from `majo_finished` |

**Who chooses (owner's decisions, keep them).** Elaina is 14–15 in episode one and a grown travelling witch after the
three-year skip, so the swimsuits open only after both episodes (`majo_finished`, the free travel after the credits).
`src/data/outfits.js`:
- `storyOutfit(state)`: `'apprentice'` before her naming, `'elaina'` from `majo_named`, `null` once `majo_finished`.
- `journeyOutfit(state)` (load, title preview, `player.start`): the story's outfit while it chooses; afterwards the saved
  `G.state.outfit` if it is unlocked, else `'elaina'`.
- `outfitUnlocked(o, state)`: `o.unlock` flag set → the 衣装 page lets the player pick it. The API (`G.player.setOutfit`) does
  not check unlocks: the story may dress her in anything.
- `src/story/story.js syncOutfit()` applies `storyOutfit` on load (`applyWorld`), at her naming (`grant`), and **before every
  story beat** (`interact()` before the quest dialogue / scene, `S.crash` before the roof collision cutscene), awaiting the
  change so the first frame of the beat already shows the story's clothes (measured: the swap lands in the same frame the
  dialogue starts, `.tmp/play/wardrobe-6`). After `majo_finished` it does nothing; `?outfit=` (developer) also disables it.
  So in episode two the player may switch between 日常服 and 魔女服 while travelling, the story puts her back in the witch's
  clothes for its scenes, and a reload starts in the witch's clothes (the page says so in a note under the cards).
- Old saves: the field `outfit` exists since the first release (default `'apprentice'`), and the old code always stored
  `'elaina'` from her naming on, so every existing save loads exactly as before.

**The swimsuits** (`tools/journey/swimwear.mjs [--only a,b] [--no-install]`, ~1 s). Source: the original engine's swim files
`assets/models/chars/char_akari_swim_{a,b}.glb` (docs/api/heroine-swim-*.md describe their build; the A doc predates the
final cut). They are the same sculpted base figure as Elaina (skeleton 201 joints, face + 13 shapes, body, silver hair) with
the complete body under the suit, every garment layer, the lining and the skirts/wraps with their own chains and riding fold
(`sideSaddleFold`). The tool keeps all of that and:
1. replaces `akari_hair` / `akari_ribbon` by Elaina's uncovered hair from `elaina_apprentice.glb` (`akari_hair`,
   `akari_ribbon` = brass cuff, `apprentice_hair` + `apprentice_hairGlint` = the crown curl), copying meshes only and
   remapping JOINTS_0 by bone name; every used joint's inverse bind must match the suit's skeleton (1e-4) or the build stops;
2. tints the iris with build-cast's `eyes()` (now `tools/journey/eyes.mjs`, `ELAINA_IRIS` [133,144,218]) — the result is
   byte-identical to Elaina's own iris texture;
3. keeps the suits' colours (white / lavender / deep indigo already sit in her palette; `TINT` in the tool can re-tint);
4. refuses to write a file whose suit layers are missing (`akari_body` + top/bottom/lining/skirt per suit).
Manifest rows: journey-cast license/author, `source` names both inputs, bones / hipsHeight / clipsFrom / morphs from the source
row, `secondaryChains` + `springDefaults` from the source row (hair chains identical to `char_elaina`'s; skirt, sash, charm,
ruffle chains the suit's own), `preload: false` (loaded on demand when picked; the old model stays on screen meanwhile).
Size: A 75 871 tris / 4.3 MB, B 70 118 tris / 3.9 MB.

**Everywhere.** `HEROINE_ASSETS` (outfits.js) makes every outfit a heroine rig: `rig.js` (landing-knee fit, flight dynamics)
and `core/assets.js` (`bindFlightCloth`: skirt, beach shirt, cord, neckline / waist ruffles already have flight-cloth rules in
`actors/flight-cloth.js`). Brooch / hats: `setJourneyAccessories` scales the joint `Journey_Brooch`, which only `elaina.glb`
has; the swim files have no brooch joint and no hat mesh, so neither ever appears on a swimsuit. Checked in play
(`.tmp/agents/wardrobe/*.js`, pictures in `.tmp/play/wardrobe-*`): standing front/side/back and broom seat for all four
(`wardrobe-1`), walk, run, a small and a charged cast, the Fran rematch duel (`wardrobe-2`), swimming in the trial lake
(`wardrobe-3`: swim_a, swim_b, witch), face close-ups (`wardrobe-4`: same iris, curl and cuff on all four), a Fran two-shot
dialogue in swim_b (`wardrobe-8`), the page in its three states with click / keys (`wardrobe-5`) and by touch at 844×390
(`wardrobe-7`), save → reload in a throwaway profile (`wardrobe-save-*` / `wardrobe-load-*`: after `majo_finished` swim_b
comes back with no swap; in episode two a saved 日常服 loads as 魔女服).

**Pictures** (painted since 2026-11-25). The four cards `ui_outfit_<id>` (384×640 WebP with alpha) are full-figure 2D
paintings made with the Codex CLI image tool, keyed off a #00FF00 ground. The style matches the dialogue portraits: the
`elaina_elaina` portrait is the style anchor, and the recipe is in `docs/api/ui.md` "Dialogue portraits".
- **Reference**: `node tools/costume/wardrobe-pics.mjs` (default ids `apprentice,elaina,swim_a,swim_b`; ~1 min) renders her
  in the game over two flat grounds; the light shafts are off while shooting because they broke the matting. The render is
  the reference for each outfit's design. The tool also overwrites the card files, so restore the painted ones afterwards.
- **Swimsuit cards**: post-game content (they unlock with `majo_finished`). They copy the in-game swimsuit models unchanged,
  and those come from Elaina's official swimsuit prize figures. Swim A's sheer shirt keeps its partial alpha.
- **Framing**: the crown of her head at y 95 and the soles at y 634, the same pose on every card (three-quarter to the
  right, the wand in her right hand).
- `ui_outfit_miko.webp` (the old heroine's picture) is no longer referenced.

**The page** (`src/ui/wardrobe.js`, strings `src/locales/zh-CN/ui.wardrobe.js`): 4 columns; a card the player may not pick yet
(and is not wearing) shows no picture — the robe-stand pictogram, a lock and when it opens (`ui.wardrobe.lock.<flag>`);
tapping it shakes the card. On touch the line under the selected card reads 「轻触换上」 (Tap to put on) instead of the Enter key.

**A fifth outfit**: a model on the same skeleton (+ manifest row with chains), a row in `OUTFITS` (with `unlock`), the
strings in `ui.wardrobe.js`, a pictogram in `icons.js`, a `WASH` colour in `ui/wardrobe.js`, the id in wardrobe-pics' default
list (for its reference render) and a painted card (see "Pictures"); five cards need `.wd-grid` columns changed.
