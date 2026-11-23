# Sculpt studio — lessons from the first batch (2026-11-17)

Compiled by the lead from seven sculptors' reports and the art director's review (`.tmp/sculpt/REVIEW.md`). Read after
`README.md`. The kit itself was not changed for these; each item names the workaround that worked and the file to copy it from.

## What the art director sent back (do not repeat)

- **Too dark, too green, too grey in round one.** Compare your values with the object you replace before anything else; a
  sculpt that is three stops darker than its neighbours reads as a hole in the picture.
- **Identity cues lost to "realism".** The colour accent that made the old object read at 300 px (the guardians' red bibs,
  the companion's big amber eyes) must survive: keep the accent, improve the form under it.
- **Detail everywhere.** One speckle size and density on every face is noise. Speckle and grain belong on sun-facing tops
  and fresh breaks, at two scales at most; leave big faces calm.
- **Faults hide in the low LODs.** Look at every LOD tile at game-camera size before saying done: border colours bleeding,
  thin parts gone, white unnamed surfaces, twisted silhouettes.
- **Stripe / moire banding on flat faces.** Partly the preview renderer (below), partly the 8-bit object-space normal map
  on big, gently curved faces. Know which one you are looking at before you repaint.
- **Scene sense.** A replacement that is half the height of the old object, or a different colour family, changes the
  scene; say so in INSTALL.md instead of leaving it for the installer to discover.

## Paint and parts

- `Shape.part()` replaces the paint of the whole subtree below it. Call `part()` first, then `chip({paint})` /
  `cut({paintCut})`; otherwise their paint is lost.
- Two parts with the same name share the first one's paint, silently. Unique names.
- A shape built without `.part()` (easy to do on a far-LOD-only path) bakes as an unnamed white surface.
- Crisp colour zones need separate parts; a border between parts still blurs in vertex colours because both copies of a
  split vertex are sampled at the same point — sample each copy slightly inside its own faces (`_smallprops.mjs`).
- LOD1 / LOD2 vertex colours are sampled by position: border vertices and long simplified triangles take the neighbour's
  colour. Repaint border vertices with their own part's paint in a post step (`gohei.mjs`, `hip_lantern.mjs`).
- `aoStrength` and `cavityDark` are global. Overlapping locks, thin paper next to a staff and shallow wide recesses go
  near black: lift the paint of those parts (values above 1 survive until the final clamp), or lower `aoRange`
  (0.2 → 0.09 fixed a barrel head).
- Recessed panels bake darker in vertex colours than in the LOD0 atlas — a value jump at the LOD switch. Check `lods.png`.
- `Math.atan2` as a phase in a warp leaves a seam at ±π. Use a horizontal phase or a periodic term.

## Form and meshing

- `chip()` is an unbounded cone: tilted on a tall face it carves a strip up the whole face. Use a bounded break (three
  planes intersected with a ball: `brk()` in `earth_column_common.mjs`).
- `chisel()` facets on soft rounded tops and across thin ridges read as black gashes once cavity darkening is applied;
  restrict them with `where`.
- `crack()` started in the open leaves a dot at its first point; start it inside an existing crack or edge.
- `lathe()` always closes the profile to the axis: no rings or washers. Cut a cylinder through the lathed shape. Lathe
  smoothing also inflates height by about a centimetre.
- A shape's `bounds` box clips it silently and shows up only as open edges. Leave slack, more after any turn or offset.
- Non-manifold edges come from walls or contacts closer than about two voxels (V cracks narrowing to a knife bottom, cords
  touching, a face a few millimetres proud of a wall). Rule that fixed them: a contact either sinks at least one voxel in
  or stays at least two voxels clear. `checks.json` gives the count, not the place — read the GLB to find them.
- `--quick` multiplies the voxel size by 1.6 and can open seams a full build closes (and the reverse). Judge
  watertightness and LOD counts only on full builds. A full build at a 5 mm voxel takes 12–18 minutes on two threads
  under shared load; a quick one 4–5.

## LODs

- The simplifier keeps topology and weights error by area. It cannot bring high-genus or many-part objects (spoked
  wheels, cages of beams, tile rolls) down to small targets, and it deletes thin proud bands (hoops, cords) first.
  What worked: build the far LODs from a **simpler field** (per-LOD fields — `farFrom` / `farVoxel` in `_smallprops.mjs`,
  `GL_LOD=mid|far` in `great_lantern.mjs`), with parts created in the same order so part ids match; make bands that must
  survive taller and prouder in the far field.
- Raising the LOD error until the count fits breaks thin sheets into shards and melts ledges. Change the field, not the
  error.
- A full build can drop a whole small part at LOD2 (the build only warns about bounding-box drift). Compare the per-part
  primitive list of every LOD.
- A single-LOD asset (`lods: [n]`) crashes in the kit's sheet step after the GLB is written and before `checks.json`.
  Give it a dummy second LOD.

## Instanced and batched objects (vertex colours on every LOD)

- The kit always bakes LOD0 to an atlas plus an object-space normal map. Instanced or batched objects need vertex colours
  on every LOD and no textures. Two working drivers: `rock_common.mjs post <asset>` (rewrites each GLB: COLOR_0 RGBA on
  every LOD, alpha as a custom mask, textures dropped; must be run after every build) and `_smallprops.mjs` (same kit
  stages with COLOR_0 on every LOD and the game's material names). Copy one; do not bake an atlas you will throw away.

## On a skeleton

- The kit's weight smoothing gives the split vertices at hard edges different weights, so cracks open when posed. Weld
  weights by position after the build (`weldWeights` in `dango.mjs`).
- There is no hook to append geometry (eye shells), a VEC4 colour or a custom TEXCOORD on the skinned path: do it in a
  post step, and re-render the sheets from the final GLB — the kit's own sheets are made before any post step, which is
  why the first review saw a companion "with closed eyes" (`dango.mjs` role `sheets`).
- No rig-from-code path: `dango.mjs` writes its own rig GLB (joints, the old body as the weight donor, test clips).
- The character figure studio (`figure/`) has what the kit lacks for people: multi-resolution pieces, exact seams, morph
  targets, ramp textures instead of vertex colours (the character merge in the game refuses vertex colours).

## The preview sheets lie in known ways

- **Shadow acne**: the renderer offsets its shadow lookup by a fixed 4 mm, less than a shadow texel on anything larger
  than a few metres, so tall flat faces at grazing light get fine stripes — on the old model too. Prove it with a
  shadow-off render (`.tmp/sculpt/earth_column_*/acne.png` shows how) or render at 1/10 scale before you chase it in paint.
- **Sheets are made before post steps**: `game.png`, `lods.png`, `before_after.png` show meshes that do not ship if you have
  a post step. Render them from the written GLB (`gohei_look.mjs` `glbSheets()`).
- **Framing**: `game.png` fits by height, so low wide objects are cropped or the camera ends up inside them; `hero.png`
  sits 2 m away, where a hand prop is a few pixels. Make your own sheet framed by width or at arm's length.
- **Ground disc** is drawn even with `ground: null`, so hanging and hand-held props sink into it.
- **No back-light translucency**: paper and leaves look flat grey from behind; the game adds that term
  (`gohei_look.mjs` `trans()` approximates it).
- The manifest fragment records triangle counts from before post steps. Write the real ones into INSTALL.md.

## From the first installation in the game (read this before you paint)

- **Value.** The first sculpts came out at about HALF the value of the game's surfaces; the installer had to lift them
  (clamped at 1.35×). Paint stone near the game's carved stone `#a59c90`, wood and clay near the colours in `PAL`
  (`src/core/mats.js`) and near the old object's own colours. When in doubt, paint lighter: the game's cel light and
  ambient occlusion only ever darken.
- **Vertex colours are written one sRGB→linear step too dark by the kit.** The game corrects this once at load
  (`fixSculptColours` in `src/core/assets.js`). Do not "fix" it in your asset files or in the kit — both ends would then
  be wrong. Just know that a vertex-coloured LOD in the kit's sheets and in the game will not have the same value.
- **The kit's preview is kinder than the game.** It hid both the darkness and how coarse big faces read: boulders that
  passed on the sheets read in game as soft pillows with stripe banding, and stayed switched off. Big plain faces need
  real planes with crisp edges (6 mm or more of bevel that catches light), not noise on a blob.
- **Texture memory.** A 1024 atlas plus a 1024 normal map costs about 11 MB on the GPU per object. Use 512 normal maps
  unless the object is a hero seen from one metre, share one atlas across a family, and no textures at all on anything
  instanced or batched.
- **Shadow cost.** LOD0 casts its full triangle count into two shadow cascades. Give the installer a low LOD that is good
  enough to cast (say so in INSTALL.md).
- **Layout.** A new footprint that differs by a centimetre moves placement records that saves index. Keep the old
  footprint exactly (the height may change), or say in INSTALL.md that the layout must keep using the old one.
- **How pieces are wired in** (for INSTALL.md writers and installers): `src/world/builders/sculpt.js` — beyond about
  17 m the vertex-coloured LOD merges into the same surface-family mesh as before (no added draw calls); within 17 m one
  instanced mesh per sculpt type draws LOD0. One switch: `G.sculpt`, `?sculpt=0` (old world), `?sculpt=all` (held types
  too), `?sculpt=a,b` (by name). Props keep their material names and surface tags and join the existing batches.
- **Decisions the installer will not make for you.** A different colour family (white-and-blue jars turned terracotta)
  or a different object (a market stall turned into a low handcart) is held back for the lead. If you change what the
  object IS, say so at the top of INSTALL.md and give the reason; better, keep what it is and make it well.

## Working alongside others

- Keep logs and scratch files in `.tmp/sculpt/<name>/`, not in a shared scratch folder: someone else's clean-up deleted
  build logs mid-run.
- One build at a time, `SCULPT_THREADS=2`.

## Facet kit: stone from exact planes (round art-stone, 2026-11-24)

- Big plain stone (boulders, wall stones, ashlar) is built as a mesh, not a field: `assets/rock_facet.mjs` clips a box by
  half-spaces (exact convex pieces), chamfers every edge by the bisector plane and gives the chamfer's vertices the
  normals of the faces they touch. Flat faces stay flat, the bevel strip shades like a rounded edge: crisp planes at a few
  hundred triangles, no pillow look, no banding. Beds and joints are separate pieces (stepped back / split with a V gap).
- Moss is its own cushion mesh (`mossCap`: polar heightfield over the pieces' top, rim tucked 6 mm into the stone, smooth
  normals). In the flora batches it rides in the same part with aMix (`flora/procgen.js` facetRock): no added draw.
- Vertex colour is written linear ONCE; such GLBs belong in `SCULPT_VC_OK` (`src/core/assets.js`).
- Users: `assets/rock_family.mjs` (six rocks, `src/world/rock-family.js` loads / fits them for flora and kit sites).
