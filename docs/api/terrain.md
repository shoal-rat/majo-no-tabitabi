# terrain — as built

## Summary
The terrain system replaces the stub, and it works in headless play.mjs runs. T.errors() was empty in every run, and the frame rate was 60 fps at 960x540.

**Land (src/world/terrain.js, terrain/lod.js, terrain/shader.js, terrain/textures.js)**
- **Mesh and level of detail.** The island is a quadtree of 40x40-quad chunks covering a 2048 m root square (±1024 m), with 6 levels. Leaf chunks are 64 m, which gives 1.6 m vertex spacing near the camera. Every chunk is drawn by one THREE.BatchedMesh: one draw call, plus one in the shadow pass, with per-chunk frustum culling and partial buffer uploads.
- **No popping or cracks.** Each vertex also stores the parent level's height. The vertex shader blends toward it as distance grows (morph window 0.7–1.0 × 2·K·size, measured from a dedicated uniform trLodCam). Skirts under every chunk edge hide any remaining gaps.
- **Building chunks.** A chunk takes about 0.5 ms to build. The budget is 3 ms per frame, raised to 40 ms when the camera jumps more than 60 m; settle() and start() refine fully. A node only splits once all 4 children are built, and the root is pinned, so the land never shows a hole. A pool of 220 slots (160 on low quality) is recycled least-recently-used first.
- **Accuracy.** Near the player, the leaf mesh differs from heightAt by at most 0.10 m.
- **Material.** MeshToonMaterial with the core toonGradient(), passed through hookMaterial(). The colour is painted per fragment:
  - land by Veil: spring-green meadow, olive-gold dusk with soft red patches, dark teal-indigo night with thin pulsing teal/violet glow veins that fade with distance;
  - large- and mid-scale noise so nothing is flat;
  - a warm tint on the sunflower hill;
  - farm plots around 朝颜村, Morning Glory Village (rice, tilled soil, grain, vegetables, with dikes), kept off the shrine hill;
  - gravel river banks with damp grass beside them;
  - shore sand, wet sand, and sea bed under the water;
  - steep-slope rock with tall Voronoi facet planes that tilt the normal, dark seams and strata bands;
  - snow line on 霜见岳 (Frostview Peak) that thins on steep faces;
  - worn earth footpaths with trampled edges, turning into stone slabs inside settlements;
  - plazas: raked gravel rings at the shrine, stone at the town, palace, lake isle, crystal field and wind shrine, dirt at the village and fox village;
  - bare earth in craters and rock on raised mounds;
  - a scorch layer: charcoal with ember flecks for fresh burns, darker ground for wet, white-blue for frost.
- **Textures.** RGBA half-float data texture, 1024² at 2 m (height, path distance, river distance). Tileable 256² noise texture. RGBA8 scorch texture, 1024².
- **Craters and scorch marks.** On 'terrain:deformed' the chunks currently in view are rebuilt in the same frame, the height texture rows are re-uploaded, and craters get a soft scorched rim. 'terrain:scorch' paints ragged marks that fade by themselves: wet in about 45 s, frost in about 75 s, burn in about 200 s. The fade does about one pass per second over the active 16×16 tiles, with row-range uploads.

**Water (src/world/water.js)**
- One flat 9000 m sheet at y=0 that follows the camera, so there is no visible edge of the world. It covers the sea, 镜湖 (Mirror Lake), the rivers, the spring pond, 月池 (Moon Pool) and any crater dug below sea level.
- Shader: MeshPhongMaterial customised and passed through hookMaterial, so the Veil lighting and height fog apply. It provides:
  - colour by depth from the baked height texture;
  - alpha that fades toward the shore;
  - a foam lip and foam lines that roll in;
  - scrolling noise wave normals that calm with distance;
  - fresnel reflection of an analytic sky palette (same keys as the sky's atmo palette);
  - sun glint and sparkles by day;
  - per-land tint: turquoise by day, rose-gold at dusk, dark glass at night;
  - at night: thin glowing cyan ripple lines and a golden reflection of the ring off a calmer copy of the surface;
  - 12 ripple rings driven by uniforms.
- What triggers ripples: player wading or swimming, 'element:applied' near y=0, and 'physics:impact' at the surface.

**Art review of the screenshots**
- From the shrine you see the mountain and the dark palace rock silhouette about 900 m away.
- The sea horizon with the sandy beach looks good.
- The lake at dusk is rose-gold.
- The view west from the palace top shows the sunlit and dusk lands, the pink lake and the islet.
- The night town ground is dark teal with faint veins, and the mountain behind it is lit by distant daylight.
- Craters show bare earth, mounds show rock, and burn, wet and frost marks are all visible.
- Fixed while tuning: veins far too strong, night ground too saturated blue, dusk too red, night water glitter too noisy.


## Ground detail upgrade (v-ground, 2026-11)
**Material detail (terrain/detail.js).** At boot `bakeDetail(renderer, size, aniso)` paints 12 tileable layers on the GPU into two RGBA8 texture arrays with mipmaps (512² on high and med, 256² on low; about 20 ms of GPU time plus shader compile):
- `albedo[l]`: rgb is a colour *ratio* around the palette colour, stored ×0.5 (so the Veil palettes stay in charge); a is height.
- `normal[l]`: rg is the tangent normal, b is cavity, a is an accent mask.
- The layers are `DETAIL` = GRASS, CLOVER, DRY, EARTH, SAND, GRAVEL, ROCK, SNOW, PAVE, SOIL, RAKED, LEAVES.
- The terrain shader (`mvTerrain4`) samples them per material:
  - Inside `TR_NEAR` it takes two virtual tilings picked by macro noise (anti-tiling) and reads normals too. Out to `TR_FAR` it takes one tiling with no normal fetch. Beyond `TR_FAR` it shows the old painted far look, faded over a long ramp.
  - Transitions are height-blended (`trHB`): grass creeps over path and plaza edges, scree collects at the foot of rock, gravel sits on banks.
  - Rock is triplanar.
  - Dirt paths have ruts along the footpath distance.
  - Flagstones have moss in the joints.
  - Clover patches grow in the meadow, combed dry grass at dusk, and leaf litter in patches in the dusk woods.
  - Painted flowers grow in the same drift noise as the 3D flowers.
  - Dirt yards get damp, dust and clay patches plus grass islands at the rim.
  - Snow has sparkle, and the night land has a moonlit sheen. The glow veins are a little weaker (0.26).
  - Defines are TR_Q (0 on low: single fetch, no normals), TR_NEAR (40 m on high, 26 m otherwise) and TR_FAR (190 / 140 / 90 m).
- New references: `G.terrain.detail` ({ albedo, normal, layers, size, ms }), `G.terrain.previewDetail(on)` (a debug sheet of the layers in front of the camera) and `G.terrain.clutter`.

**Grass (flora/grass.js, exports unchanged: createGrass, _POI; api: meshes, uniforms, clear, update, triangles, + blades()).**
- Each frame, a camera-centred FIELD clipmap (3 half-float MRT targets, 512² over 256 m; 256² on low) is rendered with the full ground logic: colour, where and how tall grass grows, crops, land weights, normal and frost. A blade vertex then reads it with 3 fetches.
- The blades are instanced *patches* (S×S cells of B curved blades) in 5 rings on high and med and 4 on low. The cells are world-fixed and the rings are cone-culled, except the innermost one around the camera.
  - Rings cross-fade by density.
  - The last ring shrinks and thins into the painted terrain grass.
  - On high there are about 200k blades in view (upper bound before masks).
- Colour runs from a dark root to a lighter, warmer tip, with clump mottling. Dusk grass is gold, rust and straw; night grass is short with glowing tips. Some blades carry seed heads.
- Shading normals follow the terrain.
- Back-lit translucency uses `G.lights.sun`.
- Gust bands travel along `gWind` (the flora wind) and lighten and bend the grass.
- The grass bends away from the heroine and from `element:applied` shock rings (up to 6 at once).
- It grows shorter toward path and plaza edges.

**Ground clutter (terrain/clutter.js).** Created lazily in terrain.lateUpdate once `G.flora.grass` exists.
- One draw call per kind: pebbles, stones and shells; twigs; dusk leaves; cherry petals (from `G.flora.treesNear`, keys matching cherry); night mushrooms with glowing caps.
- The clutter reads the grass field and the data texture.
- Radius is 20 m on high, 15 m on med and 10 m on low.
- `G.terrain.clutter.count()` returns { instances, triangles }.

## Public API
System object: export const terrainSystem = { name: 'terrain', pausable: true, init, start, update, lateUpdate }. G.terrain and G.water are set in init.

**G.terrain**
- ★ refresh(x0, x1, z0, z1): world metres; the arguments may come in either order. Re-samples the height texture rows in the rectangle. Chunks currently in view are rebuilt immediately; other built chunks are marked dirty and rebuilt the next time they are shown.
- scorch(x, z, r, kind = 'burn', strength = 1): paints a mark directly, the same as emitting 'terrain:scorch'. kind is 'burn' | 'wet' | 'frost'; r is in metres; strength is 0..1.
- scorchAt(x, z, kind = 'burn'): current mark strength at (x, z), 0..1.
- settle(): builds every chunk the current camera needs, with no time budget. Use it after a teleport or a camera cut.
- stats(): { drawn, built, builds, buildMs, triangles, pending } for the land mesh. triangles is the selected count before culling.
- Read-only references: mesh (THREE.BatchedMesh named 'terrain', castShadow and receiveShadow on), material, uniforms (trTime, trLodCam, trData, trScorch, trNoise, ...), lod (TerrainLOD), scorchLayer (ScorchLayer: paint, tick, at), dataTexture, noiseTexture.
- dataHeightAt(x, z): the ground height as dataTexture holds it (bilinear between texel centres, half floats). Draped fx
  discs (`G.fx.shape({ drape: true })`) are centred on it so they lie on the texture's ground exactly.
- `G.world.groundPlane(x, z, r, out, h?, lift?, maxGrade?)`: least-squares plane of the ground under a disc of radius r
  (tilt capped, lowered until no sample is more than `lift` under it) → out.y, out.up. Used by the fx kit's ground marks.
- `G.world.naturalHeightAt(x, z)`: the analytic land before the pool beds; `baseHeightAt` = it with the hollows cut into
  the hillside for the two rock-held pools, down to just under their water (`world/ground.js` poolBed, `landforms/pools.js`).

**Events the terrain listens to**
- 'terrain:deformed' {x, z, r, amount, x0, x1, z0, z1}: refreshes that rectangle plus a 2 m margin, rebuilding the chunks in view in the same frame. When amount < 0 it also paints a soft scorched rim (radius 0.85·r, strength up to 0.45).
- 'terrain:scorch' {x, z, r, kind, strength?}: paints a mark. Fade times for a full-strength mark: burn about 200 s, wet about 45 s, frost about 75 s. Water washes frost away; frost removes part of the wet mark.

**Data texture layout (for other shaders)**
- Covers [-1024, 1024]² at 2 m per texel; uv = (xz + 1024) / 2048.
- dataTexture is RGBA half-float: R = height including deformation, G = footpath distance (capped at 30 m), B = river distance (capped at 120 m), A = 0.
- The scorch texture is RGBA8 on the same grid: R = burn, G = wet, B = frost.

**G.water**
- ★ levelAt(x, z): returns 0 where heightAt(x, z) < 0, otherwise -Infinity.
- depthAt(x, z): water depth in metres, 0 on dry land.
- ripple(x, z, strength = 1): expanding ring on the surface. strength is clamped to 0.05..1.5. Returns false over dry land. 12 rings can exist at once; the oldest is reused.
- splash(pos, strength = 1): ripple plus G.fx?.burst('splash', pos). Returns false over dry land.
- level: 0.
- References: mesh (renderOrder -10, transparent, writes depth, receiveShadow on), material, uniforms (wTime, wRingK, wRipples, ...).
- Automatic ripples: when the player wades or swims (reads G.player.pos, .speed and .state === 'swim'), on 'element:applied' with pos.y within 3 m of the surface, and on 'physics:impact' at the surface with speed > 3.
- uniforms.wRingK follows G.sky?.info?.ringK.

**Quality settings (read at init)**
- K, the split-distance factor: low 0.9, med 1.1, high 1.25.
- Chunk slots: low 160, otherwise 220.

## Known issues
- The palace rock reads as a rounded dome or mesa. The cause is the baseHeightAt profile in ground.js, which blends from 84 m to 54 m with pow(w, 0.55). The facet and strata shading helps, but the silhouette stays convex (see the core request).
- The shadow depth pass uses three's default depth material, so shadows are cast from the un-morphed chunk heights. Skirts in the shadow pass are zero-height strips. The mismatch is tiny and only appears in the morph band.
- Craters and mounds far from the camera show at the resolution of the coarse chunk drawn there. They become fine once they are within the leaf range (about 160 m on high).
- LOD seams are prevented by geomorphing plus skirts, not by the strict CDLOD guarantee. The screenshots show no cracks, but extreme height differences at coarse levels could still show a skirt sliver.
- At night the ring's reflection in the water is a soft golden blob rather than a crisp ring. Daytime sparkles are suppressed beyond about 260 m.
- Farmland and settlement plazas are painted from hard-coded POI circles and rotated grid plots. They do not know about real buildings or paddy props, which could overlap them.
- Night ground stays fairly uniform dark teal where there is no path or vein. The sky's moonlit ambient decides how bright it is; flora should break it up.
- The water is a single plane at y=0. No river flow direction, no waterfalls, and nothing visible from underwater (single-sided).
- Everything was measured headless on this machine only (Apple M5), with fps capped at 60. The data-texture bake at boot takes about 0.3–0.5 s (1M heightAt/roadDist samples). This was not measured separately.
- The ripple and splash hooks for the player read G.player.pos, .speed and .state ('swim'). They were not checked with the real player system, which is absent.

## Round 2 (environment round 2, 2026-11-13)

### Ground (`world/terrain/shader.js`)
- **Wet band**: every shore gets a darker, slightly cooler band just above the water line (0.12–1.05 m above sea
  level, ragged with the n2 noise; colour ×(0.66, 0.69, 0.72)). It sits on top of the existing wet-sand → sea-bed
  ramp under water.

### Water (`world/water.js`, `world/water/glsl.js`)
- **Refraction** (med / high, `WQ > 0`): the water's `onBeforeRender` calls `G.post.captureOpaque(renderer)` (see
  look.md round 2), which blits the MSAA-resolved colour + depth of everything drawn before the water into a separate
  target once per frame. The shader reads the bed from it, offset by the wave normal in proportion to the water's
  thickness (zero at the waterline: no seam; smaller far away and on calm lakes), and rejects offsets that would
  sample something in front of the water. The blend uses the real optical path along the view ray (pier posts, the
  heroine's legs and the bed all count): `aR = 1 − exp(−path·k)`, tinted toward the shallow colour with depth.
  `water.refract = false` turns it off (falls back to round 1's painted bed). If the capture is unavailable (no post
  pipeline, low tier) the round-1 path is used automatically.
- **Calmer near reflections**: reflection distortion is scaled ×0.35 within 3 m of the camera, rising to full at 28 m,
  so the mirror at her feet stays readable.
- **Swell vs level**: `water.levelAt(x, z)` stays the flat gameplay level (SEA_LEVEL). New
  `water.surfaceAt(x, z)` returns the height of the VISIBLE surface including the open-sea swell (a JS twin of the
  shader's swell and its deep-water / near-camera mask). Use it for floating visuals (boats, foam, splashes); use
  `levelAt` for gameplay (swim state, buoyancy thresholds).

### Known shortfalls (round 2)
- Flow, wakes and rain rings were checked in still frames only, not in a rain frame sequence.
- The refraction capture costs one full-resolution colour + depth blit per frame when water is on screen (measured as
  part of the water layer, see look.md).
- Refraction through the water is screen-space: objects outside the screen (or behind the heroine) cannot appear
  in the bed; at grazing angles the bed fades to the round-1 painted tint.

## Round 3 (terrain surface round 2, 2026-11-13)
### Steep ground (`terrain/shader.js`, rock block)
- Slopes above ~35° (`trSlope` 0.16–0.27) become **stratified rock laid out in (along-contour, height) coordinates**,
  so nothing stretches: major beds 5.5 m (levels 5.75 + k·5.5 m, shared with landforms/bands.js) with a lit up-facing
  lip and a shadowed undercut, ledges broken into 10–30 m segments, vertical joints splitting beds into leaning blocks,
  minor strata (paint only, fade on moderate slopes), rain / moss streaks low on the mountain, snow only on lips and
  up-facing normals above the snow line. Painted rock detail is uniform-scale world triplanar (6 m). All lines are
  antialiased by their own `fwidth`.
- Paths give way to rock on slopes > ~0.27 (planar path detail would stretch).
### Ground variation
- `GROUND_TINT_GLSL` (exported, `trGroundTint(col, h, curv, n0..n3, w, mm)`): dry / lush patches, damp hollows and
  bare knolls from the curvature (mean height 8 m around minus height), night ash-blue soil, alpine sward on 霜见岳.
  **Rule for flora/grass.js**: call it on the blade base colour with the same inputs so blades match the soil (request
  filed; not wired yet).
- **Wall mask**: data texture channel **A** = wall shade 0..1, baked once in `terrain.start()` by
  `textures.bakeWallMask()` from the registered box colliders (walls > 1.2 m) and low floor / plinth platforms
  (reach 4 m). Shader: damp, darker, cooler ground along every wall; leaf drifts against walls in yards. Builders that
  register walls after `start()` are not in it.
- Settlements: dirt yards (the village / Foxfire Hamlet 狐火之里) get worn pale centres, damp packed patches, pale dust, clay, sole prints,
  two cart ruts, leaf litter (狐火之里: dense, thinner in the walked centre); flagstone plazas (Myriad Lantern Town 万灯镇, palace,
  isle / crystal sites, wind shrine with snow drifts) get worn lanes, stained slabs, moss toward the rim, wind-blown
  leaves; the raked-gravel shrine forecourt keeps its rings plus wall damp.
- 薄暮林 (Dusk Woods): puddles in damp hollows and path ruts (dark film + sky sheen in emission). 常夜原 (Evernight Plain): ash-blue soil patches,
  faintly glowing lichen rosettes (< 40 m). Beaches: wind ripples on dry sand, dune-grass fringe, wrack line, wet band.
- Rivers: voronoi bed cobbles through the shallows, pale gravel bars, undercut bank shadow with a lit grass edge.
### Cost
Shader-only (no new draw calls / triangles): the extra branches are gated by `trNear` / masks. A/B timing on the
shared machine was not trustworthy this round (load average > 100, six colleagues rendering); see the report.
### LOD at broom speed (checked, no code change)
`tools/devkit/u3-terrain2/broom.js` flies the camera 28 m above ground, shore → 薄暮林 → mountain foot, one step per 1/60 s,
counting drawn chunks that want to split but whose children are not built yet (these are the only ones that could pop).
32 m/s: 51 of 1449 frames had any; 48 m/s (boost): 36 of 462 frames, at most 2 chunks, nearest 156 m. A child's morph
range ends exactly at its parent's split distance (2K·size/2 = K·size), so a chunk that is late only at its split
boundary appears fully morphed: no visible pop. No cracks or skirt slivers were seen in the flight shots. Rule: keep
`morphEnd = 2K·size` and the 3 ms build budget together; shrinking either brings the popping back at boost speed.
### Known shortfalls (round 3)
- Stratified rock is regular (bed every 5.5 m) and reads a bit like contour lines on moderate 35–45° slopes.
- Sole prints are statistical (random cells), not trails; cart ruts are straight-ish bands, not following the roads.
- The town plaza is mostly covered by structures' own 3D paving, so the terrain plaza work shows only at its rim.
- `GROUND_TINT_GLSL` is not yet used by the grass blades (flora owns grass.js).
- Strata on the steep mountain foot seen from above (broom) read as busy fine ring lines; a stronger hierarchy (fewer,
  bolder beds; minor strata faded further from above) would calm it.

## Performance pass: boot (2026-11-14, see docs/api/perf.md "Boot and loading")
- `createDataTextureAsync()` (terrain/textures.js) replaces the synchronous bake in `init`: the 1024² height / road /
  river texture (~200 ms) comes from the bake cache (IndexedDB, keyed by the build hash) when this build baked it
  before, else it is computed in 16-row time slices and stored. Same bytes either way; `createDataTexture()` is unchanged
  for other callers. `?nocache=1` forces the compute path.

## Look round (grass + natural ground, 2026-11-14)
Before / after: `.tmp/play/gold_before/` vs `.tmp/play/gold_ground/` (golden shots, high); scratch `.tmp/look-ground/`.

### What the look is now
- **Grass blades** (`flora/grass.js`): fine tapered blades (2.6–4.6 cm at the base near the camera, three widths to a
  sharp tip) growing in soft **clumps** that open like a fountain (each blade leans and faces away from its clump
  centre). Per-clump height and a slight warm / cool hue shift, a 1.9 m soft height noise, and a few tall seeding stems
  that grow in patches of the meadow rather than evenly. Colour runs from a **dark cool root to a light warm tip**. A
  broad, soft **wind sheen** travels across the field with the wind (`gSheen`). Normals are the ground's plus a soft
  dome over each clump: no per-blade facing term, so no sparkle of facets.
- **Fade by shrinking**: rings cross-fade by density, but each blade grows in or shrinks out over its own window. No
  blade pops and nothing is dithered.
- **Hand-over to the ground**: with distance (5→42 m) the blade colour converges on `col * GRASS_TOP`. The terrain
  paints open grass dark and cool near the camera (the shade between the roots) and `col * GRASS_TOP` from about 3→32 m
  on. It carries the same wind sheen (uniform `trGust`, which grass.update sets every frame), so there is no line and
  no change of hue where the blades end.
- **Field = soil**: the grass field pass calls `trGroundTint` with the same curvature input as the terrain.
  `GROUND_TINT_GLSL` now also paints the meadow in broad soft swells: lush cool green against sun-dried warm green,
  sunlit warm crowns on knolls and deeper cool green in hollows. Clover patches have soft edges.
- **Heroine**: a smaller parting (radius 1.45 m). Blades lean out and only lie half down at her feet. A trail of her
  last 4 footsteps (`gPushT`, every 0.7 m) keeps the blades bent, and they spring back over about 1.5 s.
- **Natural ground**: the painted grain amplitude is lower (sand ×0.5; gravel, dirt and snow ×0.6; raked gravel
  ×0.4), and cavity darkening went from 0.75 to 0.5. Raked gravel shows bold ridges catching the light, darker toward
  the rim.
- **Rock**: the rock detail layer no longer paints its own 1 m strata. **Bug fixed**: the dense wavy "contour"
  stripes on every steep face came from the along-contour coordinate `dot(xz, tangent)`. With |xz| ≈ 300 m, every
  small swing of the normal moved it by metres. Joints and blocks now come from a voronoi in plain xz, whose cell walls
  are vertical, so on a cliff they read as vertical joints; they only show on real cliffs (`steepJ`). Every second
  5.5 m bed carries a full ledge and the others only a faint one, which gives fewer, bolder beds that are still aligned
  with landforms/bands.js.

### Rules for other systems
- Anything painted as open grass, or drawn over it, uses `GRASS_TOP` (exported from `terrain/shader.js`) for the
  far / top colour.
- The wind sheen is defined in grass.js `gBend` and terrain `trGust`; keep the two formulas identical.
- GTAO (render/post.js) puts blocky dark speckle into the grass carpet on high. See the A/B in
  `.tmp/look-ground/ao_cmp.png`. Grass is designed to read without AO.

### Cost (high, g2 camera; counted, not timed)
- Grass triangles: 552k before, 555k after. Blades submitted: 209k before, 184k after, but the near blades are 1.6×
  denser. This was paid for by cone-culling the innermost ring (+0.6 rad margin) and by thinner far rings (B 44 / 26).
- med: near rings +~0 % after rebalancing. low: near blades 48 / 40 × 0.5 density, segs 2.
- Draw calls: unchanged (5 rings + flowers).
- Field pass: +4 data fetches per texel (curvature) on a 512² target, once per frame.
- Terrain: +2 noise fetches per open-grass fragment. One 3×3 voronoi per rock fragment replaces the old joint maths.
  No new textures or targets.

### Revision (after the art-director review)
- **Far-field blob-dots were GTAO, not the blades.** A/B with AO off removed every dot
  (`.tmp/look-ground/r2/diag.jpg`). The grass rings from ~3.5 m out (all rings except the innermost) now draw with
  `renderOrder = 2` and `depthWrite = false`, after the opaque scene. Depth test still hides them behind hills, props
  and the heroine. They no longer enter the depth buffer, so GTAO, the shafts mask and anything else that reads scene
  depth sees the soil under them. The innermost ring (< 4.5 m) still writes depth, which gives contact shading at her
  feet.
- **Colour**: `GRASS_TOP` is now `vec3(1.07, 1.1, 0.98)` (fresher, less yellow). Blade tips are green-white instead of
  yellow, roots `col * (0.44, 0.57, 0.63)` (cool, less black), and far blades go slightly lighter toward the tip
  (never darker than the soil). A 10 % desaturation toward luminance sits on top. Sunlit warmth and shade coolness
  come from the key light and the sky, not from the albedo.
- **med**: the two near rings keep density ≥ 0.95. Ring 1 is now 2-segment, B 76, rOut 13. The last ring drops to
  B 16, rOut 100.

Rules: anything drawn over open grass after the opaque pass must not assume grass is in the depth buffer beyond
4.5 m. If AO is ever wanted on grass again, it needs a mask; never put the far rings back into depth.

Cost: draw calls unchanged. high triangles unchanged (555k on g2). med g2 grass is 285k triangles (≈ +30k, mostly
ring 0). No new passes, textures or samples.

## Destruction round (terrain agent, 2026-11-22)
Magic now reshapes the land and the land remembers. One new system, `destruction` (`src/world/destruction.js`, plus
`destruction-ponds.js`; manifest: after `props`), listens to what the spells already announce and decides what each blast
does to the ground. No spell code was changed.

### What the player sees
| Cast | On the land |
| --- | --- |
| fire bolt | a ragged burnt star, a few sods thrown (no pit) |
| fire, charged | a scorched pit (r 2.9, 0.85 m), clods and stones flying, dust; trees beside it are thrown down |
| thunder strike | a small blackened pit (r 1.6, 0.6 m) with forked burn streaks; the great strike a deeper one (r 2.4, 1.3 m) |
| rock pillar | the ground heaves into a low mound (r 3.6, 1.1 m) with broken rock lying on it |
| rock, charged (meteor) | its crater (spells/entities.js) + a rim of flying earth and stone, dust ring, rocks within 14 m cracked |
| sun beam / sun burst | a burnt line where the beam sweeps / a glassy scorched pit |
| tornado | strips the grass and flowers bare where it stands (they grow back in 1–2 min) and topples small trees |
| ice | frost (elements) + ice shards; freezes crater ponds into walkable ice (thaws after ~95 s or under fire) |
| water | mud in bare / burnt earth (shader), fills a crater it lands in (soaks away over minutes) |
Trees in reach fall away from the blast (stumps stay, charred if burnt or struck), burnt trees stay black, rocks crack
(darker) and then burst into rubble, dry-stone walls topple into stones, fences splinter into planks and char, hay bales
burst or burn away. A crater dug near the lake, a river or the low shore reaches the water table and holds a pond.

### Recovery (all on `G.state.playTime`: pauses with the game, carries on after a reload)
| What | Timeline |
| --- | --- |
| burnt ground (scorch) | the burn channel fades linearly over 6 min (`textures.js FADE.burn` = 360 s, was 200). The ground is fully black for ~1 min, the char thins out in patches and is gone by ~4 min (shader `burnK = smoothstep(0.3, 0.8, burn)`) |
| burnt grass blades | none until the burn has fallen to 0.58 (~2.5 min); then they grow back short → full, edges first, until it reaches 0 (~6 min) (grass `1 - smoothstep(0, 0.58, burn)`) |
| burnt flowers / bushes (flora plants) | come back from the edge of the burn at 2.5 min to its heart at 5.5 min, each growing in (scale-up) over 18–28 s; never up through her feet (waits while she stands within 1.1 m) |
| charred tree | black for 8 min; 8–12 min the crown fills out again (crown 0.08 → 1) in young, slightly yellower green that settles to its own colour, bark back by 12 min; then the record is dropped |
| charred fence | soot weathers off on the same 8 + 4 min |
| felled tree (magic, any element) | stump for 20 min; then a sapling (12 % size) grows to full size over 10 min (ease-out); its trunk turns solid at half size and never around her; the stump goes at 55 %; full at 30 min, record dropped. If she stands on the stump when it is due, the sapling waits (the clock is pushed back, not the size up). Trees whose ground was dug or heaped more than 0.5 m keep their stumps |
| rocks, walls, fences, bales broken; cracked rocks | stay (bounded by the 420-record cap) |
| craters, heaves | stay. Their floor is bare for 10 min, then the grass blades reclaim it to 65 % density by 40 min (the earth tint under them stays) |
A fresh crater's scorched rim is painted only when it is dug, not when a save replays it. Burnt cells are remembered per
4 m (≤ 300 saved, dropped once faded) and painted back on load at the strength they had, with the plants under them
taken away again on the same clock.

### Persistence (all bounded)
- **Ground**: every edit is a stamp in `G.state.spellScars`. v1 `[x, z, r, amount, rim]` (old saves) replays with the old
  maths, bit-identical. v2 `[x, z, r, amount, rim, flags]` (every new `deform()`): `STAMP_GUARD` story places resist,
  `STAMP_SLUMP` walls steeper than ~36° (~30° beside paths) slump into the bowl (mass-conserving, deterministic, diagonals
  included). `saveSpellScars()` merges repeats at one spot (same x, z, r, rim, flags, sign) and keeps at most
  `SCAR_SAVE_CAP` = 240 (the newest 48 always; lightest older ones drop out: small old scars heal over a reload).
  Destruction quantises its stamps (x, z to 0.25 m, r 0.05, amount 0.01) so repeats merge.
- **Flora**: `G.state.destruction = { v: 2, flora: [x·10, z·10, bits, playTime, …], burns: [x·10, z·10, r·10, s·100,
  playTime, …], scarT: [x·4, z·4, playTime, …] }` (≤ 420 flora records, charred-only / cracked-only ones drop first;
  healed ones are dropped; a v1 triple list loads with its clocks starting at load). Bits `G.flora.wreck.BITS`: CHARRED 1, FELLED 2 (stump), GONE 4 (shattered; rubble for stone ≥ 0.9 m),
  CRACKED 8. Records point at instances by position (10 cm), so a density change only skips (and keeps) what is missing.
  Written on `'save:collect'`; re-applied whenever `G.state` is replaced (load / new game), after resetting this run's wreck.
- **Derived, nothing saved**: crater ponds (water table; any dig or heap that reaches a pond resurveys it, so a crater
  dug through its lip lowers it to the new lip), broken rock on heaves (the heave stamp has r = 3.6, rim 0).
- A maxed save (240 stamps): ~0.2 s to replay + one coalesced terrain refresh on the next frame (was ~1.4 s before the
  terrain batched restore refreshes). Save size ≈ 7 KB scars + ≤ 7 KB flora.

### Protection
`G.world.carveGuard(x, z)` 0..1 = max(protectionAt, story zones): the city (r 172 around CITY), the hometown (POI r + 12),
Fran's cottage (26 m), her practice clearing and the farewell hill (POI r + 8), and 14 m around every JOURNEY_ANCHOR, each
fading over 10 m. Guarded ground is never carved by v2 stamps (meteor included), and nothing there is wrecked or recorded.
Enemy magic only scuffs (a few clods), never carves or wrecks. Blasts high above the ground, on decks / roofs / bridges
or on water leave the land alone. Repeated blasts drill one spot only so far (fire 2.6 m, thunder 2.2, sun 2.6; heaves 2.2 m
high). Debris is `group: 'debris'` (never blocks or carries the heroine).

### APIs
- `G.world`: `deform(x, z, r, amount, { rim, flags, source })` (API unchanged; flags default GUARD | SLUMP),
  `carveGuard(x, z)`, `spellScarList()` (live, read-only), `STAMP_GUARD`, `STAMP_SLUMP`, `SCAR_SAVE_CAP` (ground.js exports).
  The deform event also carries `source` ('destruction' for this system's own carves).
- `G.destruction`: `blast(element, pos, radius, power, { team, heavy })` (queue a blast as if a spell applied it),
  `carve(x, z, r, amount, rim, cap)`, `throwEarth(x, y, z, n, opts)`, `canCarve(x, z)`, `ponds`, `remnants`, `burns`,
  `scarTime(x, z)`, `TIMES`, `resync()`, `stats()`.
- `G.flora.wreck`: `records(cap)`, `apply(list, stride)`, `reset()`, `of(i)`, `since(i)`, `recover()`, `stats()`,
  `bruise(i, element, power, info)`, `rocksNear(x, z, r)`, `BITS`, `TIMES` (life.js `RECOVER`). A regrowing sapling has
  flora state 4 (not in treesNear, not registered with elements, cannot be felled until grown). `G.flora.fell(tree, dir)` unchanged (life's `fell` takes opts `{ splinter, char }`).
- `G.props.debris(kind, pos, vel, { color, scale, life, material })`: pooled loose debris shared with the props' shards
  (cap 140, oldest recycled), new kinds `clod`, `rock`, `splinter`; every piece now shrinks away over its last 0.6 s.
- `G.flora.grass.scarFeed` (set by destruction): persistent bare discs nearest the camera (12 of the 24 crater slots;
  transient `clear()` keeps 12). `refreshScars()`.

### Ground look (shader.js)
Pits show earth from ~0.1 m deep (was 0.25–1.3); crater lips and heaves (small positive offsets) are thrown soil in
frayed clumps; heaps above ~0.75 m turn to rock; burns only brown bare earth (a pit stays readable inside a grass fire);
water on bare / burnt earth is dark warm mud with a sky sheen. A fine 2.7 m noise frays every edge (one extra noise
fetch per terrain fragment).

### Events read
`'element:applied'` (with the apply's options as `e.info`: `noGround` skips the ground, except the rock pillar's heavy
earth blow, which is what heaves it; `dir` marks an aimed gust, which never strips like a lingering tornado),
`'spell:meteor'` (the meteor's own earth / fire applies at that spot are swallowed by it), `'physics:impact'` (heavy
bodies ≥ 120 kg landing ≥ 9 m/s kick up dust and sods), `'terrain:deformed'` (grass feed, ponds, rock remnants),
`'save:collect'` (flora wreck into the save). Everything is queued and handled in `update()` (one frame later), merged per
frame. Without `e.info` it infers the ground from the height above the land.

### Known gaps
- Marks follow the 2 m deform grid / 1.6 m vertex spacing: a 1.6 m lightning pit is a few vertices; edges are frayed by
  noise, but very small marks stay soft.
- Ground fire (elements) blackens large areas around fire / thunder casts; the pits read best after rain or where the
  grass did not catch.
- Props are not placed in the world in this branch (props.js start() keeps no records), so the breakable field
  furniture is the countryside flora (fences, dry-stone walls, hay bales). Felled trees still spawn rolling `log` props.
- Tornado strips grass but leaves no scour mark of its own (no spare scorch channel).
