# flora — as built

## Summary
The flora system (G.flora) replaces the stub and works in headless play.mjs runs. T.errors() was empty in every run, and the frame rate held at 60 fps at 960x540.

**What exists**
- **Placement.** Deterministic, seeded per grid cell. Scatter takes about 0.2–0.28 s at init and places 42,397 instances on high and 24,306 on low; on high that is about 9.9k trees, 29.8k plants and 2.7k rocks and crystals.
- **Where it places nothing.** Never inside G.world.isReserved (with extra padding), off roads and riverbanks, not on steep slopes, not near the palace moat or under water. Lily pads and lotus are the exception: they float on the lake, the rivers, the moat and the spring.

**By land**
- **曦光原 (Dawnlight Plain):** broadleaf groves and lone trees, with willows by the rivers. Cherry groves concentrate around the shrine. The village fields are kept open. Flower patches, bushes and berry bushes in the meadows; a dense sunflower field on 向日葵之丘 (Sunflower Hill); pumpkin patches at the edge of the village.
- **Village crops:** rice, wheat and vegetable rows are drawn on the GPU in the same 朝颜村 (Morning Glory Village) plots the terrain paints, using the terrain's own plot hash, so they line up.
- **霜见岳 (Frostview Peak):** pines, then snowy pines and snowy broadleaves, then snowy dead trees, then bare rock. Snow rocks and cliff chunks on the slopes.
- **薄暮林 (Dusk Woods):** dense red and orange maples with gold ginkgo, recoloured through the leaf materials. Thick bamboo groves around 狐火之里 (Foxfire Hamlet). Ferns, mossy rocks, logs, stumps, small mushrooms, and red flowers like spider lilies.
- **常夜原 (Evernight Plain):** dark teal trees with speckled glowing leaf tips. 萤茸林 (Glowcap Wood) has about 700 giant mushrooms whose caps glow in cyan, teal, violet, pink and gold. Glowing ferns, flowers and lotus. Short grass whose blade tips glow and pulse.
- **星晶野 (Starcrystal Moor) and 暗潮岸 (Darktide Shore):** glowing crystal clusters, plus dead trees and standing stones.
- **Across the Veil's edge:** the land and colour are dithered by the same Veil weights the terrain uses, so the lands blend smoothly.

**Rendering**
- One InstancedMesh per model part. A model's meshes are merged into at most 2–3 parts: a tinted crown, a trunk with a land multiplier, and snow. All parts of a model share one set of instance buffers.
- Source data is sorted into 32 m chunks. After the camera moves, the visible chunks are frustum- and distance-culled and copied into the GPU buffers, nearest first, with TypedArray.set. Only the instances inside 52 m cast shadows; this is done by swapping the count in onBeforeShadow / onAfterShadow.
- **Near tier:** the real models, up to 106 m on high (×0.86 on med, ×0.72 on low).
- **Far tier:** cheap stand-ins out to about 420–950 m: a lumpy blob, a cone or a mushroom cap, each with a trunk. They use the instance tint and glow, so forests still read from the shrine hill and from the air.
- **Materials:** the core toon ramp passed through hookMaterial. Wind sway grows with height², so trunks stay stiff and crowns bend; it follows G.elements.windAt plus flutter, and small plants bend away from the heroine. Tint, land multiplier and glow are per instance. A burnt-out crown collapses. A matching depth material makes shadows sway and lose the crown too.

**Grass**
- Three rings of GPU-instanced tufts plus one flower ring: 4 draw calls and no CPU work per frame.
- Each ring's cells are fixed in the world (no swimming) and sorted by angle, so only the view cone is drawn: one wrapped range, an offset plus an instance count.
- Root height and path/river distance come from G.terrain.dataTexture. Colour uses the same noise texture and palette as the terrain shader, so the grass melts into the ground.
- Fades out by about 72 m.
- Absent on paths, plazas, sand, river gravel, steep rock, snow, farm dikes, fresh burns (scorch texture) and craters. Frost whitens it.
- Shorter and tip-glowing at night.

**Interactivity**
- **Colliders:** about 12.1k registered through G.world.addCollider (trunks, mushroom stems, solid and breakable rocks).
- **Mushroom caps:** each giant cap has a walkable platform on top and an entry in G.flora.bouncePads.
- **Element reactors:** registered lazily within 52 m of the heroine, and also inside every element:applied blast (that event fires before apply looks for reactors) and around ground-fire scorch events. They are unregistered beyond 66 m unless burning. The cap is 320.
- **Trees:** ignite and burn with the elements flames. During the burn they char gradually with ember glow, the crown shrinks, and they end as a charred trunk.
- **Felling:** thunder (split), earth at power ≥ 0.9, info.heavy, fire at power ≥ 2.2 or wind at power ≥ 1.6 fells a tree. It tips over away from the blast, lands with dust, leaves and a light shake, and leaves a stump. Then it becomes 1–2 G.props.spawn('log') when props exist; otherwise it lies for 14 s and fades.
- **Rocks:** breakable boulders and mossy or snowy rocks shatter on thunder, on earth at power ≥ 1.1 or on heavy blasts. They play G.fx burst 'shatter_rock', spawn 3–7 debris bodies through G.physics.add (hull, debris group, 5–8 s lifetime) and emit prop:broken.
- **Crystals:** chime and glow when struck by sun; they can be shattered too.
- **Craters:** 'terrain:deformed' fells trees on the rim outward, removes everything inside the bowl, and clears the grass.
- **Burns:** a 'terrain:scorch' burn removes small plants, which grow back after about 150 s.
- Nothing is persisted.

## Public API
System object: export const floraSystem = { name: 'flora', pausable: true, init, update, lateUpdate }. update runs the wind uniforms and life (reactors, animations, regrowth). lateUpdate does the culling and packing after the camera update, then updates the grass.

G.flora = {
- ★ treesNear(pos, r) -> TreeHandle[]
  - Returns standing or charred trees, not felled ones, with base within r metres (xz) of pos.
  - TreeHandle = { id (instance index), key (species key, e.g. 'maple1'), pos: Vector3 (base of the trunk), height (m), radius (crown radius, m), burning (getter), charred (getter), felled (getter) }.
  - Handles are cached, so the same object comes back for the same tree.
- ★ fell(tree, dir?) -> boolean
  - tree is a TreeHandle or an instance id. dir is any {x, z} and is optional (random when omitted).
  - The tree tips over toward dir in about 1.1–1.8 s and its collider is removed. A stump appears; up to 48 stumps are kept in a ring.
  - On landing: G.fx 'dust' and 'leaves' bursts, a shake, and the 'rock_fall' sfx. Then G.props?.spawn('log', pos, { rot: yaw, yaw, burning }) is called 1–2 times. Without props, the tree lies for 14 s and shrinks away.
  - Returns false if it is not a tree, or is already felled or removed.
- ★ removeInRadius(x, z, r, opts?) -> number removed
  - Hides every plant, tree and rock whose base lies in the circle, and kills their colliders and reactors.
  - opts.plantsOnly: only plants.
  - opts.regrow: seconds before the plants come back. Trees and rocks never come back this session.
- ★ bouncePads: Array<{ pos: Vector3 (top centre of a giant mushroom cap, world y), radius (m), power (suggested launch speed in m/s, 15–23), id }>
  - About 704 entries on high. The list is static; nothing is removed from it, even when a mushroom is removed.
  - Each cap also has a G.world platform (r = 0.55 × cap radius, top = pad y).
- shatter(id, info?) -> boolean: shatter a breakable rock or crystal by instance id.
- ★ stats() -> { instances, species, visible, drawCalls, triangles, grassTriangles, chunks, packs, overflow, initMs, trees, plants, rocksEtc, colliders, reactors, burning, anims, pads }
  - drawCalls and triangles cover the main pass only: the visible flora meshes and grass, with no shadow pass.
  - It loops over every instance, so call it for tests and debug only.
- batches() -> [{ name, count, shadow, cap, parts, tris }]: debug.
- grass: { meshes, uniforms, clear(x, z, r, lifeSec = 90), update(), triangles() }
- store: read-only struct of arrays (x, y, z, rot, s, sp, state, …).
- species: read-only list.
- refresh(): force a repack.
}

Events:
- Listens to: 'element:applied' (registers reactors in the blast; its pos is used for the fall direction), 'terrain:deformed' (amount < 0 or > 0: rim trees fall outward; the bowl is cleared; grass is cleared for 900 s), 'terrain:scorch' with kind 'burn' (plants removed, regrow after 150 s; nearby trees registered so the fire can reach them).
- Emits: 'prop:broken' { type: 'rock' | 'crystal', pos, by } when a rock or crystal shatters.

Reactors registered with G.elements:
- Trees: kind 'tree', material 'wood', burnTime 14 + 1.2·height, team 'neutral'.
- Breakable rocks: kind 'structure', material 'stone'.
- Crystals: kind 'structure', material 'crystal'.
- The reactor owner is the TreeHandle.

Quality: draw distances × 1 / 0.86 / 0.72 (high / med / low). Placement density follows G.quality.density. Grass lattice spacing × 1/sqrt(density). Far range = clamp(viewDist × 0.4, 420, 950) m.

## Known issues
- Near and far trees switch per 32 m chunk at 106 m (high). Flying low you can see a chunk swap from a real model to its stand-in. The stand-ins are coarse: a 20-triangle lumpy blob, a cone or a cap. Fog hides most of this, but it is not a cross-fade.
- Grass root height comes from the 2 m data texture, sampled bilinearly. On bumpy ground the blade bases can float or sink about 0.1 m (they are sunk 0.12 m to hide this).
- Grass is only removed on plazas, paths and the other masks; it knows nothing about buildings. Grass and flowers may poke through ground-level floors that the structures system builds outside the plaza radii. This was not testable, because structures was absent.
- Crop rows exist only within the grass range (about 72 m). Beyond that, the terrain's painted plots carry the look. Soil plots are left bare, and pumpkins grow only in a ring at the edge of the village.
- From below, giant mushroom caps look pastel lavender rather than vivid. The glow reads strongly from above and from a distance. The far cap stand-ins glow white-hot through bloom at long range; I lowered them to 1.35.
- Ferns and vines are textured, so they are tinted by luminance; their colour control is coarser than the vertex-coloured models.
- The dense dusk forest is close to the budget: 627k flora triangles at the worst spot on high, plus about 2× for the shadow pass of the trees inside 52 m. The whole frame was 1.10 M, under the 1.5 M budget.
- Felled trees: the falling model can clip into an upslope. A tree burning while it falls keeps its reactor at the middle of the trunk with a 1.6 m flame height.
- Logs: when props are absent, a felled tree just lies and fades. The G.props.spawn('log', …) path is untested because props did not exist; I pass { rot: yaw (a number), yaw, burning }.
- Shattered rocks and crystals, and felled trees, never come back this session (nothing persists, so they return after a reload). Plants removed by burns grow back after about 150 s. Plants removed by craters stay gone this session.
- Bounce pads are only data. The player system does not use them yet. Mushroom caps also have flat walkable platforms, which give no bounce by themselves.
- stats() loops over all 42k instances (fine for tests, not for every frame). Reactor registration is capped at 320, or 480 with blast registrations.
- Most screenshot shots lock the camera with T.cam, and the core applies that lock after lateUpdate, so flora copies G.debug.fixedCam into the camera itself before culling. In normal play the camera system updates before lateUpdate, so nothing extra is needed there. Before I fixed this, culling used the player camera, and my first stats were measured for the wrong view; I re-measured them.
- Everything was measured headless on one machine (Apple M5) with fps capped at 60. med quality was not measured separately.


## As-built updates (fix2, 2026-11)
- `G.flora.squashPad(id, k = 1)` springy squash of a giant mushroom cap (pad id = instance id, k 0..1); returns false for unknown / removed ones. Installed from world/flora/life.js. Every hide / removal also drops the instance's bounce pad and cap platform, so `G.flora.bouncePads` stays in step with removed mushrooms.

## As-built updates (v-flora look pass, 2026-11)
- **Procedural models** (`world/flora/procgen.js`) replace the asset models for every tree, bush, fern, wild flower, reed,
  sunflower, giant mushroom, crystal cluster and rock family (lily pads, lotus, pumpkins, small mushrooms, logs and stumps
  still come from assets). Sizes follow the original asset's bounding box, so scatter scales, colliders, pads and reactors
  are unchanged. `buildModelParts(G, { ...def, key })` dispatches to them; a part may carry `mat` options (below).
- **Painted atlas** (`world/flora/atlas.js`, `foliageAtlas()`, `TILE`, `tileUV()`): 4×4 tiles painted on a canvas at boot.
  R = shade, G = tint mask (1 instance tint / 0 the part's second colour `col2` × land factor), B = glow mask, A = coverage
  (empty texels dilated, alpha kept through the mips in the shader, alpha-to-coverage on MSAA tiers, alphaTest on low).
- **Trees**: trunk + root flares + limbs to clump centres (bark tagged `surface: 'bark'`); crowns of camera-facing cards
  (`FLORA_BILL`) with spherical / clump-centre normals, vertex AO (dark core, bright top), per-clump hue drift; conifers are
  tiers of drooping needle / cedar cards; bamboo = segmented culms + leaf sprays; willows add hanging strand cards; snowy
  species blend toward snow on upward cards (`FLORA_MIX`). Night species glow only on the painted leaf tips (B mask) plus a
  faint under-glow floor (`glowFloor`).
- **Rocks**: plane-chiselled spheres (smooth-min → bevelled facets), strata bands, worn lighter tops, darker crevices;
  moss / snow caps blend per vertex (`aMix`) toward the instance tint (moss) or white (snow). `surface: 'rock'`.
- **Giant mushrooms**: lathe caps (curled rim, fresnel rim glow), ridged dark gills that glow brighter (vivid from below),
  stems, glowing spots. **Crystals**: hex prisms with pyramid tips, fresnel + inner glow, rocky socket.
- **Material knobs** (`makeFloraMaterial` opts): `leaf` (aLeaf clump lag + flutter), `bill` (aCard billboard), `tex`
  (atlas channels), `mix` [r,g,b,useTint], `col2`, `fres` [rim, inner], `surface`, `look` (userData.look for the shared
  lighting model: leaves trans 0.75 / rim 0.28 / wrap 0.55), `glowFloor`. Wind now has **gusts** travelling downwind
  (bands ~140 m apart) on top of the old sway; foliage shadow lookups are pushed 0.45 m out along the normal (no acne bands).
- **LOD**: far stand-ins are card crowns (12 camera-facing clump cards) and needle-card cones. Near models fade out and far
  cards fade in with a screen-space dither over the last 18 m (`Batch.setFade(a, b, mode)`, uniform `FU.fCam`); species
  without a far stand-in dither out over the last 18 % of their draw distance. Giant mushrooms do not fade (dots showed).
- Not done: baked impostor atlas (far forests are card crowns, not baked images of the near models); cliff / outcrop
  pieces on steep terrain still use the old scatter density.

## Round 2 (environment round 2, 2026-11-13)

### Baked impostors (`world/flora/impostor.js`)
- At boot `bakeImpostors(G, species, cell)` renders every tree species that has a far tier from its **own near model**
  into one atlas: 8 azimuths at a low elevation (0.16), two layers — albedo (crown = painted shade with a white tint
  so the instance colour can be re-applied; trunk = real bark) and model-space normal (A = instance-tint mask). Cell
  size 160 px on high, 128 med, 96 low. Bake time is part of the flora boot.
- `ImpostorBatch` draws **all far trees in one call**: cylindrical camera-facing quads, the two nearest frames blended,
  instance tint / land multiplier / clump hue drift / night glow rebuilt, lit by the shared look (`hookMaterial`, the
  baked normals), so a forest at 80–900 m is the same painted crowns as the near models, not blobs.
- Cross-fade: near models dither out while impostors dither in (`setFade`, uniform `FU.fCam`), same screen-space
  dither as round 1. Bamboo swaps much earlier than trees (its own range key `c + NC²`).
- Shadows: the far instances, packed nearest first, cast into the far cascade (prefix `shadowCount`, quads turned to
  face the light in the shadow pass). A block of **shadow-only** instances (`skip`, hidden in the colour pass) covers
  trees between the near-model shadow range (52 m) and the far tier. One extra draw in the far cascade.
- In `flora.js` the far tier key is `'imp'` for trees; giant mushrooms keep their cap stand-ins (`'shroom'`). If the
  bake fails (no renderer, error reported as `flora:impostors`) far trees are simply not drawn beyond the near range.

### Leaves up close
- Atlas leaf cells are now **painted masses** (`atlas.js cluster()`): a few big overlapping lobes shaded like painted
  balls (dark core and underside, lighter top), a scalloped rim of leaf shapes that catches the light, only a few quiet
  strokes inside. One soft alpha outline per card, no isolated dots — so alpha-to-coverage and mip-mapping no longer turn
  crown edges into speckle at 5–20 m.
- Every clump drifts in hue (±14° about the grey axis) and value (`material.js`, `FLORA_LEAF`), so a crown is a range of
  neighbouring colours. Dusk maples use a nine-step palette (crimson → scarlet → orange → gold, `scatter.js duskLeaf`)
  instead of one red.
- **Card shadows**: a billboard card looks its shadow up at its centre (world position not moved to the expanded
  corner) plus the 0.45 m normal push, so a card takes one soft shadow value — painted dapples, no diagonal bands across
  camera-facing cards.

### Leftovers
- Bamboo: bright jade culms (vertex colour ×1.08/1.22/0.7 along the culm), fresher spray tints (`bambooDusk`).
- Glow-wood cyan caps: richer palette and a darker, cooler albedo so they glow as strongly as the pink / violet ones.
- Boulders: the plane-chiselled rock used to come out as an exact sphere (the smooth-min `exp()` underflowed against the
  1e-9 guard) — now a log-sum-exp smooth-min; cut depths 0.4–1.0 (was 0.5–1), a broad flat-ish top face, two deep shoulder
  chips and a slight lean. The result is then fitted into round 1's bounding box (half-widths 0.443·sx / sz, top
  0.693·sy), so the visible mass and the flora collider (`life.js` derives it from the model box) are unchanged.

### Grass (`world/flora/grass.js`)
- Knee height (~0.4 m) is the norm: `patchH = 0.72 + 0.22·n4 + 0.42·(n2 peaks)`, per land ×0.92 sun / ×0.8 dusk /
  ×0.5 night, ×0.7 on hills. Taller tufts only in small n2 patches. The heroine parts the carpet: blades around her lie
  down and lean out (`flatK = push·0.62`). Farm crops lowered (0.72 / 0.82 of the old height) so she is not hidden in wheat.
- Back-lit translucency toward the Sun stays an emissive term (`gB³·0.22`), checked in a frame looking into the sun.
- Look round (2026-11-14): clumped fine blades, shrink-fade, far convergence to GRASS_TOP, footstep trail — see
  docs/api/terrain.md "Look round" (and its "Revision": rings beyond 4.5 m do not write depth).

### Known shortfalls (round 2)
- Impostors are baked at one elevation: from high above (the shrine-hill vista, the camera's top pitch) crowns look
  slightly side-on. A second elevation row would fix it (×2 atlas).
- Impostor colour is matched per species, not per instance shape: an unusually stretched near tree swaps to the
  average silhouette of its species.
- Shadows received by the grass carpet are only as dark as the shared look's shadow tint; on bright meadow the
  heroine's shadow reads, under a dense crown on dusk grass it is soft. Grass does not cast shadows (cost).
- Bamboo sprays are still cards; up close (< 4 m) the clump reads as a stack of cards rather than individual leaves.

## Round 3 (u3-atmos, 2026-11-13): plants up close
- **Bamboo** (`procgen.bamboo`, atlas tile `bamboo` repainted)
  - Culms (4 sides) have real nodes: a swollen dark ring with a pale band 3.5 cm above it.
  - Thin branches grow from the upper nodes on alternating sides.
  - Each branch carries 1–2 crossed small sprays (0.55–0.9 m cards), with a two-card tuft on top.
  - The tile now holds 7 sprigs in 2 layers of lance leaves, about 13 cm per leaf on a card.
  - Cost: 1.67k triangles per bamboo1 instance and 1.19k per bamboo2. The old ones were about 0.87k and 0.62k, and the first draft of this round with 5 sides was higher still.
  - To pay for this, the near→impostor swap moved from 62 m to 52 m (species `near`, flora.js `farNear.bcone`). The impostor is baked from the new model, so the swap reads well.
- **Crops** (grass.js): planting rows 0.7 m apart. Rice has thin drooping blades; wheat is a thin stalk with a plump gold ear; vegetables are low leaves. No blade is wider than about 3 cm, and crops stand at most about waist height.
- **Driftwood** (`procgen.driftwood`, species dead1–3, used in 星晶野 and 暗潮岸)
  - A wind-swept, twisting trunk with knots, 5 arching roots, and 3–5 crooked limbs that fork.
  - Moss strands hang from the joints, using the willow tile. The moss takes the instance tint, and its strand tips glow through the B mask.
  - scatter.js sets the tint, glow and hue without any extra rng calls, so all placement is unchanged.
  - The size still comes from the asset box, so colliders and reactors are unchanged.
- **Water plants**: `lily1` has 3 notched pads; `lily2` has 2 pads and a white bloom; `lotus` has 2 cupped floating pads, a raised pad on a stalk, and a three-ring cupped bloom with a gold seed head (petals take the instance tint and glow at night). They are built by `pad()` / `lilyPads()` / `lotusPlant()`, and the plant_lilypad_* and plant_lotus_1 models are no longer used for them.
- **Giant mushrooms**: gills are now 56 real radial blades under the cap, in their own part with glow 1.7, over a darker underside (glow 0.2). From below they read as glowing lines radiating from the stem.
- **Impostors**
  - A second pitch row is baked at 45° (`ELEV2`), so the atlas has twice the rows (two per pair of species).
  - The runtime blends the rows by the view elevation in instance space (`vIP`, smoothstep 0.2–0.62) and tilts the quad toward a camera above (spherical billboard). The shadow pass is unchanged (ortho → low row).
  - `?implow=1` turns this off, for A/B tests only.
  - Interleaved A/B (8 rounds × 4 frames): dusk high view, p25 22.9 ms on vs 24.1 ms off; day high view, 18.3 vs 18.3. No measurable cost.
  - Atlas memory doubles: about 2 × 2560 × 4160 RGBA8 plus mips on 'high', roughly +55 MB of GPU memory.

### Known shortfalls (round 3)
- Bamboo leaves are still cards. At 1–2 m the 2D sprays show their planes when you look along the branch.
- On low quality the bamboo is the same mesh (no branchless LOD).
- Driftwood moss strands look a little blocky at 40+ m. Their glow is subtle, a soft teal at the tips only.
- Mushroom undersides are still quite pastel. The cap's fresnel and the moonlight lift them, so the gill contrast is moderate.
- Reeds and cattails are still the round-1 crossed cards (the reed tile with cattail heads). They were not rebuilt this round.
- Dusk grass height was left as tuned in round 2 (about knee height) and not re-measured.
- The impostor high row holds 8 azimuths only. Very steep top-down views (>60°) still show a vertical quad tilted toward the camera, not a true top view.

## Look round (foliage, 2026-11-14)
**What the look is now.** Crowns read as a few soft painted masses with clean edges: a lit upper side, a darker and
cooler core, a soft rim, one clean terminator across the whole crown, and a handful of light leaves on the lit edge.
The polka-dot grid on cherries, the "painted ball" circles in maples and the per-card dark blotches are gone.
- **Atlas** (`atlas.js`): every leaf-mass tile (broad, maple, ginkgo, blossom, bush, clump) is one flat silhouette
  (lobes + a few large rim leaves), then shaded per pixel (`shadeMass`) from a soft-union height field of the lobes:
  broad tone steps, no circle edges, no isolated specks. The blossom tile has no dark flower centres anymore (they
  were the regular dot grid at 20–60 m). Accents (light leaves on top, a few shaded ones low) change R only.
- **Coverage-preserving mips** (`coverageMips`): the mips are built on the CPU at boot. Colour is averaged by
  coverage, and each tile's alpha is rescaled per level so that the share of texels above the 0.42 cut-off stays the
  level-0 share. The shader's old `alpha × (1 + 0.15·lod)` boost is gone.
- **Crown volume** (`material.js VERT_CROWN`, uniforms `fCrown`/`fCrownR`, set from `model.crown` in `batches.js`):
  billboard leaf cards (`bill` + `leaf`) take the crown ellipsoid's normal at each card corner (86 %, 14 % card normal),
  plus a shade from depth in the crown (0.62 core → 1.0 shell, slightly cooler in the core). The per-card vertex AO
  is replaced, but the per-clump hue drift is kept.
- **Impostors** are baked with the same normal and shade (`impostor.js` BAKE_VS `crownC`/`crownR`), so the far
  forest has the same lit top and shaded underside, and the hand-over matches.
- **Fades**: on MSAA tiers every flora material uses alpha-to-coverage. Distance fades scale coverage instead of
  discarding a screen-door pattern. Near tree → impostor is an **overlap** cross-fade (`setFade(..., ±2)`): each side
  is fully covered over half the band, so no gap opens between them. 'low' (no MSAA) keeps the ordered dither.
- Crowns use fewer, larger cards: 0.78× as many, 1.12× the size, so the screen area stays about the same.

**Rules for other systems**
- A procedural crown built with `bill()` cards and `leaf: true` gets the volume shading automatically. It needs a
  sensible `model.crown` box, because `model()` takes it from the card centres.
- Leaf tiles must stay flat in value with one clean silhouette. Do not paint per-leaf contrast or small dark dots
  into the atlas: they turn into speckle at a distance.
- `setFade` mode: ±1 is a plain fade, ±2 is the overlap cross-fade. Positive fades out and negative fades in.

**Cost**
- No new draw calls, passes or textures.
- Atlas: CPU mips at boot (about 1.4 M texels, plus a short per-tile coverage search). GPU memory is unchanged at
  about 5.6 MB with mips.
- Broadleaf crowns have about 22 % fewer cards (triangles), with about the same fill.
- Vertex shader: about 25 ALU per crown-card vertex. The fragment shader is unchanged, minus the lod term.
- Alpha-to-coverage on trunks and other opaque parts costs nothing extra on MSAA targets.

**Not done** (see the report): falling petals and leaves (`life`/`fx`), glow rework on crystals, and
non-billboard crowns (conifers, bamboo sprays, willow strands), which still use per-card normals.

### Look round — revision (after the art review)
**What changed**
- **Value steps per crown and per clump.** `VERT_CROWN` shade =
  `mix(0.6, 1, out) × (0.7 + 0.34·upCrown) × (0.6 + 0.55·upClump)` (upClump through smoothstep(0.3, 0.74): a clear two-tone step per mass). `upClump` is measured from the clump centre
  (`aLeaf.xyz`), so every leaf mass has a lit top and a shaded underside. This holds even when only the bottom tier
  of a crown is in view or a low sun lights it (g5 ginkgo). Impostor bake: same formula (`aLeaf` added to BAKE_VS).
- **Core tint per part:** uniform `fCore` (material option `core`). Leaves keep the cool `CORE_LEAF`; blossom uses a
  warm `BLOSSOM_CORE` because its core meets blue sky fill and has to end at mauve. The impostor bake reads `p.mat.core`.
- **Blossom shade** (procgen `BLOSSOM_LOOK`): `shadowTint 0.2`, plus `fill 0.3` (uniform `fFill`). Fill adds
  `albedo × fill × daylight` as emission, standing in for light through the petals. Shaded blossom is plum/mauve
  (≈ sRGB 91,57,93), not navy (was 59,47,86). Cherry limbs: `shadowTint 0.25`.
- **Blossom silhouette:** blossom crowns alternate lobes that push out (every third clump, 0.88–1.0 R) with lobes
  that sit back (0.5–0.72 R). Clumps are less flattened, and the umbrella cherry spans a rounder band. The atlas
  blossom rim is now 16 round puffs instead of 30 five-petal flowers, whose fine notches read as stair-steps. Flowers
  remain as lit accents (`cluster` option `accLeaf`).
- **Site trees** (decor.js `realizeTrees`, e.g. the shrine cherries) had no crown volume, because only `batches.js`
  passed `crownC`. `model()` now writes `crownC`/`crownR` into every bill+leaf part's `mat`, so every user of the
  model gets the crown shading.
- **Giant mushrooms:** the cap shade runs from the rim (0.42) to the crown (1.0). Options `glowShade` and `glowDesat`
  (`fLook2.zw`) make the glow follow that shade (cubic) and pull it toward grey, more strongly on the bright crown, so
  the top is paler and the rim deeper. The cap fresnel is down to 0.32. The round-3 fin blades are removed. Hiding
  parts showed they caused the blocky dashes under the caps (`.tmp/look-foliage/dbg7_cmp.png`). The gill underside
  now carries 11 broad cosine light bands in its own shade, with no per-segment stripes. Caps and gills do not
  receive shadow-map shadows (`mat.noRecv`). The far cap stand-ins use `glowDesat 0.45`.

**Rules for other systems**
- Whoever builds flora materials from a model (`makeFloraMaterial({... , ...p.mat})`) gets crown volume, core tint,
  fill and glow options automatically. Spread `p.mat` last and do not drop it.
- New material options: `core: [r,g,b]`, `fill`, `glowShade`, `glowDesat`, `noRecv` (Batch: mesh does not receive
  shadows).

**Cost**
- Draw calls: −1 per giant-mushroom species batch, and −1 more in its shadow pass (fins gone). That is up to −8
  calls in the glow wood. Each giant mushroom has 56 fewer triangles.
- No new textures or passes. Uniforms: `fCore` (vec3), `fFill` (float).
- About 8 more ALU per crown-card vertex (clump gradient) and about 6 per flora fragment (glow shade/desaturation,
  fill). The atlas size is unchanged.
- Known gap: impostors have no `fill`, so a far cherry's core is slightly darker than a near one. The imp batch is one
  material for all species, so adding fill means baking it in.

## Performance pass: boot (2026-11-14, see docs/api/perf.md "Boot and loading")
- `init` yields a boot time slice (`await slice()`, core/boottime.js) after each species' model build and each batch,
  so the world can build behind the title without long main-thread freezes. Order and results are unchanged.

## Draw-call pass (2026-11-14, see docs/api/perf.md "Draw-call pass")
- `flora.js` repack: every batch mesh (near models, far stand-ins, impostors, stumps) now has
  `castShadow = (its original castShadow) && batch.shadowCount > 0`; the original setting is kept in
  `mesh.userData.mvCast`. Before, a batch with visible instances but none in the shadow range submitted an empty
  instanced draw (count = shadowCount = 0 in onBeforeShadow) to every cascade: 24 / 11 / 6 empty draws per cascade
  render at the fox street. `render/warmup.js` draws `mvCast` meshes as casters during the boot warm-up so their depth
  programs are still built at boot. Nothing else changed (packing, look, shadow range). Off: `?dcull=0`.

## Map round: the composed countryside (2026-11-22)
- `flora/countryside-plan.js` — `countryPlan(W)` (memoised, deterministic, ~30 ms): zones (`ZONES`, `zoneWeights(x,z)` →
  [farm, moor, heath, wild]), field parcels (`fields`, `fieldAt(x,z,pad)`; kinds lavender / wheat / barley / hay / poppy /
  orchard, around the hometown, before the city and around every farmstead landmark), parcel edges (`edges.hedge|wall|
  fence`), dry-stone walls along the road through moor / heath / farmland (`roadWalls`) and across the moor and heath
  (`moorWalls`), meadow hedgerows running away from the road (`meadowHedges`), landmark trees on rises (`lone`),
  `copses`, one-colour flower `drifts` (`regionFlowers(x)`, `MEADOW_COLOURS`), `open(x,z,pad)` (the clearance test:
  roads, rivers, anchors, story places, waysides, landmarks, lake survey, city).
- `flora/countryside-species.js` — procedural species registered into `procgen.EXTRA_RECIPES` (hook in
  `buildProcModel`): `lavender`, `wheat` (also barley by tint), `heather`, `gorse`, `hedge`, `oak`, `ancient` (the 44 m
  giant tree), `apple`, `hawthorn`, `drywall` (2.4 m segment along local +x), `fence` (3 m), `haybale`. Entries in
  `species.js`. Walls / fences / bales are `rock` kind (no colliders except bales).
- `flora/countryside-scatter.js` — `plantCountryside(W, density, put)` called at the end of `scatter()`; plants crops in
  rows, edges, walls, hedgerows (hawthorn / small trees every 9–23 m, gates), landmark trees with flower rings, copses
  with fringes, drifts, heath cover (heather / gorse / bracken / stones in the moor and heath zones) and the plants of
  every landmark (giant tree, flower valley, fallen giant, snags, blastable rockfalls of breakable boulders, quarry
  rubble, tarn reeds and lily pads at the pool level). Dense layers scale with `G.quality.density`.
- `scatter.js` changes: open-land trees are now rare strays (plan does the composition); natural woods outside the
  stands gather into groves (`clump` noise); no random planting inside a field parcel or a landmark clearance
  (`landmarkAt`); the flower valley keeps its flowers. `put(id,x,z,rot,scale,rgb,{tx,tz,mineral,sink,y,force})` places an
  exact instance.
- `flora/fields.js` — `G.flora.fields`: ONE merged mesh draped over every non-orchard parcel (~19k tris), crop painted
  in the fragment (lavender rows, combed wheat / barley, mown hay stripes, poppies), depth-biased toward the camera,
  dithered edges. Visible at every distance (the crop tufts draw within ~80 m).
- `meadowPattern.js` — `meadowDayPetalAt(patch, forest, wet, p)`: regional meadow colours (yellow east, red/white middle,
  blue/white past the wilds, violet/pink west) used by the GPU flower sprays and (one line) by the terrain's painted
  distant flowers, so both agree.
- `G.flora.plan`, `G.flora.countryside` (planted counts) for tools.
