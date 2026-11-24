# structures — as built

## Summary
I replaced the structures stub with a full system covering every built place in the world, each recognisable from a distance. Every place is built in code from primitives: curved hip, gable and thatch roofs with corrugated tiles and upturned eave corners, vermilion posts, plaster and shoji walls, engawa verandas, stone plinths and foundations on sloped ground. A few staged assets are used where they look good: the red pagoda, fox statues, the rowing boat, and recoloured trees (including tree_giant_ancient as the 千年枫, Thousand-Year Maple).

Places built:
- 向日神社, Sunward Shrine (sunlit hilltop):
  - Haiden facing south, with shimenawa, two ringable suzu bells and an offering box.
  - Raised honden behind it, with chigi, katsuogi and a tamagaki fence.
  - Kagura stage, temizuya beside the shrine_save anchor, ema rack beside ema_shrine.
  - Storehouse plus the broom chest at the broom_chest anchor.
  - Bell house with a big bell, red pagoda on a podium, sacred tree with shimenawa.
  - Stone approach path with lanterns and nobori banners, cherry trees and pines, a rim wall.
  - Stone stairway of about 50 steps (y 14 → 30), centred on the road, under a torii avenue: a grand torii with plaque at the foot, one at the top, six small ones on the steps.
- 神乐练习场 (Kagura Training Ground): fence ring, 6 straw targets, rest shed, banners.
- 朝颜村 (Morning Glory Village):
  - 9 thatched farmhouses and drying racks.
  - Ushio's roofed well beside village_elder.
  - Dango stall with noren, red benches and parasols, set behind village_dango.
  - Notice board, jizo, a hokora.
  - Mill with a spinning waterwheel fed by a glowing flume.
  - Morning-glory fences, yard trees, 7 scarecrows out in the farm ring.
- 暮桥 (Dusk Bridge): arched vermilion bridge whose deck is walkable (one platform per segment), with railing colliders, giboshi caps, piers and lanterns.
- 狐火之里, Foxfire Hamlet (dusk):
  - Torii tunnel of 34 torii along the road to the maple, guarded by fox statues.
  - Elder's hall with fox statues.
  - 6 shrine houses on stilts with fox-fire lanterns (3 of the 9 planned spots were skipped as not clear).
  - Lantern strings on poles, maples and ginkgo, 16 bobbing fox-fire wisps (one InstancedMesh).
- 千年枫:
  - Giant maple, about 47 m, with a stone ring and shimenawa.
  - 暮灯 (Dusk Lamp) dais with steps, lantern ring and a plaque torii on the road.
- 雾见泉 (Mistview Spring): spring hokora, a torii standing in the pond, stepping stones.
- 镜湖 (Mirror Lake):
  - Pier from lake_ferryman: about 24 m of deck plus a ramp, with a lantern post and a moored boat.
  - 镜心屿 (Mirror-Heart Isle): dais, hokora, plaque torii facing the pier, 4 lanterns, lotus pads and flowers on the water.
- 万灯镇, Myriad Lantern Town (night hub):
  - Lamp tower exactly at town_lamp: three tiers with lantern rings, a glowing lamp chamber and a gold finial; its roof is landable.
  - 22 two-storey machiya with glowing windows, lattice fronts, noren and eave lanterns.
  - Market street of stalls under zig-zag lantern strings.
  - 3 street gates with big lanterns.
  - Three-storey inn with a glowing sign.
  - Taiko stage beside town_racer, lamp-maker's shop with lanterns on display beside town_lampmaker.
  - Two "bridges of light" over the market street: walkable, with glowing rails, landings and stairs.
  - Andon lamps around the plaza, glowing banners.
- 星晶野 (Starcrystal Moor):
  - Ruined moonstone circle with glowing runes, fallen stones and lintels; glowing crystal clusters.
  - 晶灯 (Crystal Lamp) dais, hermit's hut beside crystal_hermit.
  - 3 turnable crystal-pillar pedestals at 9.5 m from the dais (live factory objects).
- 月读宫, Moon-Reading Palace (rock top, y 140):
  - Arena of radius 30 around palace_arena with glowing inlaid rings and spokes.
  - 14 slender silver and blue pillars with glowing orbs (2 of the 16 ring slots are left out near the landing and the lantern).
  - Moon-gate ring, landing terrace with balustrade at palace_landing.
  - 月灯 (Moon Lamp) dais with a crescent screen, two side halls (deep-blue roofs, cold windows).
- 风祠 (Wind Shrine): altar stone, hokora, wooden torii on the road, prayer-flag ring, wind chimes.
- 14 floating islands:
  - Noisy rock undersides (glowing crystal roots on night isles).
  - Grass top registered as a disc platform with a deep underside, so the broom stops below it.
  - Bushes, rim rocks and flowers; a tree, shrine, lantern or stones on each.
- Roadside:
  - The 12 relightable stone lanterns (live, unlit).
  - 11 signposts at the junctions; the arrow on each destination line is worked out from the traveller's walking direction.
  - Wayside jizo, hokora with small torii, benches with banners.

Lighting: lit things use glow() or glowDynamic materials only; no point lights were added. Shoji are plain paper in the sun, softly glowing at dusk and warmly glowing at night.

Performance:
- Each place is baked into few meshes.
- Each place also gets a far version: everything merged into two meshes (lit toon and self-lit) with the material colours baked into vertex colours. It swaps in beyond about 170 m from the place's bounds (with hysteresis).
- Small live objects are hidden by distance (stone lanterns 300 m, signs and wayside items 170 m, pillars 420 m, great lanterns 900 m).
- Measured structure meshes in view: about 95 at the worst spot (shrine and village both near) and about 100 looking across the whole world from the fox village. With these, the whole scene's T.stats().calls was 93–290 at the six test spots; that count includes the other systems and the shadow pass (68 without structures at the fox village).
- 58–60 fps headless at 960x540. The scene's triangle count is 0.19–0.79 M depending on the view; the system's own geometry is about 0.6 M across the whole world.

## Public API
System: `export const structuresSystem = { name: 'structures', pausable: true, init, start(){}, update(dt) }`. `update` runs the factory fades and swings, the place tickers (waterwheel, fox wisps, lit great lanterns, town dimming) and the near/far swap every 8th frame.

Exported factories (from `src/world/structures.js`, defined in `builders/factories.js`; also on `G.structures` and `G.structures.factories`). All text must already be translated (t()):
- `makeStoneLantern() -> { group, lit, height: 2.65, firePos: Vector3 (local), setLit(on, instant=false) }`. Starts unlit; the paper fades over about 0.4 s.
- `makeGreatLantern() -> { group, lit, height: 5.6, firePos (local y 3.33), setLit(on, instant=false), tick(dt, time) }`. Lit: hex paper house, blooming sun core, rotating gold halo.
- `makePaperLantern(color=0xff7a3a) -> { group (hook at y=0, hangs down), lit, setLit(on, instant) }`
- `makeTorii(size=1, { color: 'verm'|'stone'|'wood'|'silver', plaque?: string }) -> { group, width, height: 4.6*size, posts: [[x,z],[x,z]], postR }`. The factory registers no colliders; callers use posts and postR.
- `makeChest() -> { group, opened, open(instant=false), close(instant=false) }`. The lid swings 1.9 rad and the inside glows.
- `makeSignpost(text) -> { group }`. text may contain '\n'.
- `makeRaceRing(radius=3) -> { group, radius, active, setActive(on), pass() }`. pass() pulses the ring.
- `makeBrazier() -> { group, lit, firePos, setLit(on) }`. Flickering glow flame.
- `makeCrystalPillar() -> { group, turn, angle, lit, setAngle(rad), setLit(on, instant=false) }`. The mirror face points along the turn's local +z.
- `makeEmaRack() -> { group, colliders: [{x, z, hw, hd}] }`
- `makeShrineBell() -> { group, ring(strength=1) }`

G.structures:
- `places`: `{ <id>: { group (baked near version), far (two-mesh far version), site, ... } }`. Ids: shrine, training, village, village_fields, b_kure, foxvillage, dusktree, spring, town, lake, lakeisle, crystal, palace, windshrine, isle_<SKY_ISLES id> ×14, skyisles, roadside.
  - shrine: `{ haidenY, bells: [shrineBell ×2], chest, stairs: { from, to, top, bottom } }`
  - town: `{ tower: { height, lampY, flame }, houses: 22, inn: {x, z}, taiko: {x, z}, lightBridges: [{from, to}], setLit(on, instant=false), lit }`. setLit dims or relights every street lantern and the tower top (fades; lit by default).
  - dusktree, lakeisle, crystal and palace each have `{ daisTop, lantern }`. crystal also has `pedestals`; palace also has `arena: { x, z, r: 30, y }`.
  - b_kure: `{ deckY(f), apexY }`. lake: `{ pierEnd: [x, z], deckY }`. windshrine: `{ altarTop }`. skyisles: `{ isles: [{ id, x, z, top, r, kind }] }`. roadside: `{ signs: 11, wayside: 15 }`.
- `stoneLanterns`: `{ sl_01..sl_12: stoneLantern handle + { id, pos: Vector3 (world) } }`. Placed and unlit; gameplay lights them.
- `greatLanterns`: `{ gl_dusk, gl_mirror, gl_crystal, gl_moon: greatLantern handle + { id, pos, top } }`. Each stands on its dais at its anchor; unlit.
- `crystalPedestals`: `[3 × crystalPillar handle + { pos: Vector3 }]`. World positions (545, -265.5), (536.8, -279.8), (553.2, -279.8); they start turned 0.9 rad away from the lantern.
- `chests`: `{ broom_chest }`. At the anchor, facing anchor.face, closed.
- `audit() -> [{ kind: 'anchor'|'road', ... }]`. Returns colliders that reach walking height inside an anchor's 3.5 m circle or within 1.4 m of a road centreline; currently returns [].
- `stats() -> { meshes, tris, per: { id: [meshes, tris] } }`
- `lods`, `culls`

World registrations:
- Platforms: building floors, steps, roof landing pads (three stepped boxes per roof), shrine stairway steps, bridge deck segments, light-bridge decks and stairs, pier, daises, arena disc, landing terrace, isle tops (thick = 0.8 × rock depth), pedestals.
- Colliders: walls, posts, torii posts, fences, lanterns, statues, railings, tower (tag 'town_tower'), great lanterns (tag 'greatlantern'), stone lanterns (tag 'stonelantern'), crystal pillars (tag 'crystal'). All other colliders use the site name as tag.

## Known issues
- The training yard keeps the natural ground, which slopes by about 0.3 m per m. The terrain there sits around 8 m, not POI h=19 (see core request), so the fence and targets follow the slope. The west edge of the shrine plateau (x < -560) also falls away, so the storehouse, bell house and the rim wall sit on stone foundations.
- Bridge railings and great lanterns are left out of the road audit by design: the road bends slightly at the ends of 暮桥, so a railing sits about 0.7 m from the road centre, and a great lantern stands at the end of its road. In-world, the deck is the path.
- The far version of each place is a flat-colour merge: signs and noren become plain beige patches, and dynamic glows such as the town lanterns appear in the far version at their brightness when it was built (lit). So when the town is dimmed with setLit(false), it still looks lit beyond about 170 m.
- The fox village is airier than the town: 6 stilt houses (3 of the 9 planned spots were rejected as not clear), the elder's hall and 5 small hokora. The 镜湖 islet is sparse from a distance.
- Static paper lanterns are not physics or element objects. Burning or wetting buildings is not implemented (no element reactors registered for structures).
- Roof landing pads are flat stepped boxes. On steep roofs the heroine can float up to about 0.4 m above the surface or sink into it near the ridge.
- Signposts: 11 one-sided-per-face canvas textures (11 draw calls when all are near). Arrows use ↑ ← → only.
- The bld_fox_statue, bld_pagoda_red and bld_boat_rowing models were used without art review at close range (only seen at medium distance). The tree_giant_ancient trunk reads as a dark silhouette against the dusk sky.
- start() does not restore any state. Lantern lit state, opened chest and pedestal angles should be restored by gameplay from G.state through the exposed handles.
- In the final timing table (shrine 279 / village 290 calls) T.stats().calls includes the shadow pass and all other systems. The structure meshes alone are about 95 in the worst view.

## As built, upgrade 2 (re-detailing)

Owner files: `src/world/structures.js`, `src/world/builders/*.js` (in `far.js` only the palace and the wind shrine;
the floating-island builder belongs to landforms).

### Kit additions (`builders/kit.js`)
- `makeRoof(o)` / `roofGeometry(o)` / `roofParams(o)` / `roofY(P,x,z)` — real roof geometry instead of slabs:
  curved slopes with sori and up-turned hip corners (`lift`), `style` 'hip' | 'gable' | 'thatch' | 'pyramid'.
  Kawara (`corr` > 0): tile ridges as geometry, eave-end discs and lip tiles, stacked ridge tiles + roll, hip rolls,
  onigawara ridge-end ornaments. `shingle: true`: three laminated eave layers (shrines). Thatch: thick cut fringe in
  two courses with jittered teeth, sag, ridge saddle with crossed poles and rope bindings. `rafters` (default on for
  non-thatch roofs wider than 1.8 m): exposed rafter ends under every eave. Geometry is cached by parameters (a roof
  shape used twice costs memory once). Returns `{ group, P, pads }` (pads = walkable landing boxes, unchanged rule).
- `stoneCourse(g, w, d, cz, h, mat, seed)` — foundations of individual dressed stones around a recessed core.
- `building(o)` keeps its signature; it now uses stoneCourse plinths, posts on base stones, beams, brackets, plank /
  plaster panels with timber framing, lattice / shoji (`windowMat(veil)` glows at dusk / night), verandas with boards.
- `mat.<surface>(hex, look)` — tagged material helpers for custom colours (wood, plaster, paint, cloth, paper, metal,
  stone, tile, thatch, rock, lacquer, none). `M.*` presets all carry explicit surface tags. RULE: never use bare
  `toon(0x…)` / `flat(0x…)` in a builder; use `mat.*` or `M.*`.
- Baked vertex shading: `Site.bake()` calls `shadeBaked(baked, site)` — every lit merged mesh gets a vertex colour
  (ground-contact darkening, eave / soffit shade, rain streaks on walls, per-tile variation, moss at the foot and on
  top of stone, moss patches on thatch, small per-building tint from `Site.footprint`). Materials are swapped for a
  shared `vertexColors` clone (`vcMat(m)`). Transparent, MeshBasic and `surface: 'none'` meshes are skipped.
- `farLOD(src)` now simplifies the merged far mesh by vertex clustering (0.55 m cells).

### Factories (`builders/factories.js`)
- `makeTorii(size, { color, plaque, rope })` — myōjin silhouette: leaning pillars on base stones with foot bands,
  nuki with wedges, shimaki, curved kasagi with dark cap, gakuzuka plaque, optional shimenawa with paper shide.
  Return shape `{ group, width, height, posts, postR }` unchanged.
- `makeStoneLantern()` — five-part Kasuga lantern (base, pole, platform, fire box with paper, roof with curled tips,
  jewel). `setLit` API unchanged. Shrine furniture (ema rack, bell, basin pavilion, offering box) re-detailed.

### Site trees (`builders/decor.js`)
- `procTree(key, scale, tint, { glow, hue, land })` places a marker; `realizeTrees(placeGroup)` (called by
  structures.js after all builders) turns the markers into one InstancedMesh per species part with the flora
  material (wind, leaf cards, shadows). The shrine's sacred cherry, yard trees, dusk maples use it. `assetTree` is
  still exported and only used by the floating-island builder (not ours).

### Far shadow casters (`structures.js`)
- Each place with a far LOD also gets a caster-only proxy (`<id>_shadowProxy`, same simplified geometry) on layer
  `PROXY_LAYER` = 5. structures.js enables layer 5 (plus 0) on every shadow-casting DirectionalLight's
  `shadow.camera` (three's shadow pass then tests the shadow camera's layers), so the proxy is never drawn by the main
  camera. A proxy is visible when the place is past the detailed-caster radius (80/70/58 m) and within 260 m of the
  heroine (off on 'low'). `S.shadowProxies` lists them; `place.noShadowProxy = true` opts a place out.
  RULE for other systems: do not put anything on layer 5; if the lighting owner rebuilds the cascade lights, keep
  layer 5 enabled on their shadow cameras (structures re-applies it every 256 frames until three lights have it).

### Unchanged (gameplay)
All colliders, platforms, roof pads, verandas, doors, interact points and anchors are where they were.
Checked by walking: the shrine torii avenue and stairs, onto the haiden veranda, past a village house, over the
dusk bridge. `S.audit()` reports 3 hits, all `gameplay`-tagged save-point colliders owned by the gameplay system.

### Measured (1440×900 'high', GPU timer query, median of 30 interleaved frames, whole structures layer on vs off)
| view | calls | tris | layer GPU cost |
|---|---|---|---|
| shrine, game camera | 840 | 2.97 M | 0.3 ms |
| shrine, high overview | 845 | 2.64 M | 1.3 ms |
| village | 798 | 3.02 M | 1.8 ms |
| fox village | 971 | 3.00 M | 2.8 ms |
| town street | 543 | 2.58 M | 0.3 ms |
| town, high overview | 530 | 2.51 M | 4.1 ms |
Shadow proxies: within noise (< 0.3 ms). Mesh / triangle totals: 385 meshes, 0.88 M triangles for all places;
town 44 meshes / 444 k triangles (tile roofs 178 k, wood 105 k), fox village 27 / 123 k, village 43 / 85 k,
shrine 62 / 77 k. There is no measurement of the pre-upgrade layer (it was not recorded before the change).

### Known shortfalls
- The town is one place and one LOD: from the high overview all 444 k triangles are drawn (≈ 4 ms). Per-block LOD
  or chunked baking of the town (and coarser kawara on 'med') is the next performance step.
- Onigawara / chigi ornaments are blocky; ridge ends read as forks at eye level.
- 月读宫 (palace) and the wind shrine got materials / tags but no new architecture; they still read as simple shapes.
- Banners are still rigid planes (no cloth hang); lantern strings in the town are unchanged.
- Far shadow casters are subtle at noon (short shadows); best seen in the evening light.

## As built, architecture round 2 (upgrade 3)
Positions, colliders, platforms, roof pads, anchors, interact points and the public APIs (`setLit`, `open`,
`greatLanterns[id]`, `stoneLanterns`, `chests`, `crystalPedestals`) are unchanged. New colliders were added only off
paths: the two komainu at the shrine approach (`colBox` 0.55 × 0.65) and the east-shore boat sheds / torii posts;
the east-shore pier's standing half is a platform (walkable). Placement random streams are untouched: every new
dressing draws from its own `mulberry32` stream (`drng` in town, `vrng` in village).

### Bugs fixed
- Staged refined GLBs with baked vertex colours rendered black after the site bake (the core `bakeStatic` drops the
  colour attribute but kept the `vertexColors` material). `prepVertexColours(root)` (kit) runs before every bake and
  `farLOD`: meshes that want and have colours are merged per material keeping them; meshes that want but lack them get
  a no-vertex-colour clone. RULE: a staged model may carry vertex colours; never strip them before a Site bake.
- Jade paving: `shadeBaked` puts moss only on stone sides near the ground and in joints; tops get warm-grey wear.

### Key objects (`builders/keyobjects.js`, re-exported by `factories.js`)
`makeStoneLantern()` (lathe Kasuga tōrō, real fire box), `makeGreatLantern({ land })` (carved base, timber frame
with brackets, ribbed paper with the land's painted crest, tiled cap, tassels; lit = inner fire + crest silhouette +
ground wash; `placeGreatLantern` adds the warm spill and embers through the existing fx), `makeChest()` (planks,
iron bands, rivets, stave lid hinged at the back; same pivot, open animation and collider).

### Landmarks
- 月读宫 `builders/palace.js`: terraces, colonnade with bases / capitals / entablature, carved moon gate with inner
  veil, pavilions with night-tile roofs and gilt `shachi`, moat bridges, lantern rows, long banners (cloth), floating
  fragments, crescent motifs. Arena floor and every walkable surface are where they were.
- 星晶野 (`far.js buildCrystal`): weathered monoliths and lintels with glowing glyph bands, rune ring, fallen stones
  (crystals = flora, pillars = gameplay: untouched).
- 风祠 (`far.js buildWindShrine`): carved altar, flagstones, prayer-flag lines (cloth), glass wind chimes with tanzaku,
  cairns, ice lanterns, `snowShell()` snow caps on roofs and the torii.
- 暗潮岸 (Darktide Shore) `builders/eastshore.js` (new, place id `eastshore`, built from `buildFar`): ruined pier (standing half
  walkable), two funaya boat sheds with skiffs, a torii standing in the sea, weathered markers, mooring posts, a wreck.
- 向日神社: `komainu(open, s)` (decor) pair at the approach, `basin()` rebuilt (granite trough, brimming water plane,
  bamboo spout with a trickle), sacred tree with `ropeRing` shimenawa + shide, honden `chigiBlade()` / `katsuogi()`.
- 万灯镇 (`town.js`): `streetLantern(mats, rng, i, kind)` — four lantern shapes (round, tall ribbed, square andon, wide)
  with caps and tassels, on cables that sag (1.05 m) between poles with cross-arms; `dressFront()` gives shops a roof
  signboard (one atlas texture for all shop names, `structures.noren.*`), a lit standing sign and stacked goods
  (barrels, crates, sacks), and homes a railed upper balcony with laundry and a potted pine; every street house now
  has a noren (plain for homes); market stalls show modelled wares (fruit baskets, bowls, bottles).
- 朝颜村 (`village.js farmDress`): three variants — lean-to annex with a woodpile and chopping block, a laundry line
  behind the house, a woodpile and tubs at the back.

### Kit additions
- `clothify(material, amp, mode)` — vertex sway from the flora wind uniforms (`FU.fTime/fWind`), weight from `uv.y`
  (top fixed); `mode 1` billows the middle (nobori). One cached clone per (material, amp), so merged meshes still
  batch. Used by nobori, noren, prayer flags, palace banners, laundry.
- Roofs: `hipTiled()` builds hip / pyramid tiled tops as four panels fine across the slope and coarse down it (about a
  third of the old uniform grid); the eave row is flat (no saw-tooth fascia) with round eave-end discs (18 tris, outer
  cap only); `makeRoof({ ridge: false })` = bare pent slab (hisashi: no ridge, verges or oni; front eave only);
  verge boards are square tubes; `oniTile` small (s < 0.8) is a coarse profile without rim and knobs. On 'med' / 'low'
  tiled roofs have no geometric corrugation and a coarse grid (the `tile` surface texture carries the rows).
- `Site.bakeBlocks(cell)` + `blockLODs` (structures.js): the town (36 m cells, 13 blocks) and fox village (32 m) bake
  per block; each block swaps to its own far LOD (`farLOD` cell 0.3) beyond 95 / 75 / 55 m (high / med / low) and has
  its own shadow proxy. `place.blocks` / `place.fars` list them.

### Measured (1440×900 'high', town overview camera of `tools/devkit/u3-arch2/perf.js`)
| | before round 2 | after |
|---|---|---|
| town triangles in view (place) | 485 k | 360 k (with all new dressing) |
| town triangles total (13 blocks) | 513 k | ≈ 385 k; tile roofs 302 k → ≈ 150 k |
| draw calls in view (whole frame) | 642 | 694 |
| CPU renderFrame + finish, layer on − off, p25 | 1.3 ms | 1.5 ms |
GPU timer numbers from these runs are NOT trustworthy: six people shared the GPU and the whole-frame GPU time swung
20–66 ms between runs (layer deltas came out negative). The triangle cut is real; the ms target (< 1.5 ms GPU for the
town layer in the overview) is not demonstrated.

### Known shortfalls
- Town GPU cost under contention could not be measured cleanly; draw calls rose by ~50 (new dressing materials per
  block). A per-block material atlas (wood / cloth / goods in one vertex-coloured material) would bring them back.
- From the overview camera 10 of 13 town blocks are still inside the 95 m near radius; the far LOD only helps from
  farther away.
- Komainu are lumpy-sphere sculpts: they read as guardian statues from the game camera, crude at 2 m.
- 星晶野 monoliths still read as blue boxes at night from some angles (the night palette tints the stone).
- Shop signboards reuse the noren names (`structures.noren.*`); proper shop names need new locale keys.
- Village dressing is subtle from the default cameras; no storehouses were added (footprints would add colliders).
- The temizuya water is a lit plane (no refraction / ripples beyond the spout ring).

## Performance pass: boot (2026-11-14, see docs/api/perf.md "Boot and loading")
- `init` yields a boot time slice (`await slice()`, core/boottime.js) between the place builders, after each place's
  site trees and before each place's far LOD. It was one 1.0 s main-thread task; now the longest piece is one builder
  (town / far, ~150–250 ms). Order and results are unchanged.

## Look round — surfaces (2026-11-14)
- `bakeKeep` hands per-piece vertex ranges to `shadeBaked` (`mesh.userData.pieces`): each primitive gets its own tone, a
  gradient up the piece, lit top arris + dark lower joint on stone, a warm damp band at the ground. Keep pieces as
  separate primitives when you want them to read as separate stones / planks.
- `bevelBox(w, h, d, mat, x, y, z, b = 0.035)`: chamfered-top box (20 tris) for stones whose edge shows — the shrine
  approach slabs and `stoneCourse` stones use it. Same footprint as `box()`; visual only.
- Painted layers are quiet now (see look.md "Look round — surfaces"); do not compensate with darker or noisier colours.
- r2: grid roofs (thatch hip, gable) get `uv` for the straw map (u around the eave, v down the slope, 1 unit = 1.5 m) and
  their top geometry is non-indexed; thatch eave bands are one smooth thick edge (no stepped teeth). `M.thatch()` /
  `mat.thatch(c)` are mapped, smooth-shaded materials: use them only on geometry with roof UVs or none at all. Stone
  meshes get a baked crevice / top-light term in `shadeBaked` (see look.md "Surfaces revision r2").

## Look round — lettering (2026-11-14)
**What the look is now.** Every written surface is lettered by hand in `builders/lettering.js` (called by
`textTexture()` in kit.js, the town kanban atlas, and through them by factories / village / palace unchanged):
characters vary a little in size, tilt and baseline; ink is full where the brush lands and thins across each
character (soft gradient + a few soft dry-brush blobs — no fine noise, nothing that sparkles when mip-mapped); the
surface sets the manner: `cloth` (nobori: dye with soft bleed), `resist` (noren: ground colour reserved white),
`paper` (notices), `inkwood` (signposts: ink on wood, faded), `board` (shop kanban: painted brush script since r2, lightly worn,
grain), `gilded` (plaques, the inn sign: carved recess + lit edge + gold leaf). Grounds have gentle light gradients and
broad dye clouds / long soft grain instead of flat fills. Crests (mon) are drawn in a few brush shapes: sun wheel on
the shrine banners, fox mask on the 狐火之里 banners, lantern on the town banners and shop noren, wave on the lake isle
plaque (crestFor), crescent available for the palace. Painted inscriptions (core.meta.lettering) replace the font for
向日神社 (plaques), 「日轮常在」 (The Sun Wheel Abides), 「狐火稻荷」 (Foxfire Inari).

**Revision (r2).** Shop boards (`board`, the town kanban atlas) are read across a street at night: brush regular
script (not the running hand) with a firm stroke (+3 % of the glyph size), little dry-out (.16) and wear (.12), pale
paint #fff0d2 on dark lacquer #140c07; atlas rows are 384x104 so the name fills the board's height (texture memory
down from 384x1152 to 384x832). Running script stays on paper notices.

**Rules.** `textTexture(lines, { w, h, bg, fg, vertical, border, style, crest, res })`: name `style` when you know the
surface (otherwise it is inferred from bg/fg), `crest` only where the place has one. Canvases smaller than 128 px on a
side are baked at 2x. If the faces are not in yet, the sign is baked now and re-baked into the same texture later — so
do not copy `tex.image` into another canvas once (the kanban atlas paints rows itself and registers its own redraw).
Shared files (kit / decor / town / shrine / dusk / far / roadside): the lettering and crests are lettering's, the cloth
and wood materials are surfaces'.

**Cost.** No new draw calls, materials, programs or per-frame work (same `sharedMat` / `cachedMat` keys, one canvas per
sign as before). Texture memory grows by about 5 MB (nobori 64x320 -> 128x640, plaques 96x160 -> 192x320, kanban atlas
256x768 -> 384x1152, inn sign 128 -> 192, dango noren 2x). Bake time at structures init: a few canvas passes per sign
(about 50 signs), not measured separately. Golden shots: `.tmp/play/gold_type/` (draw calls in the 'high' run: 1031).
**Request:** `palace.js` (line ~264 textured cloth) can take `crest: 'crescent'` via textTexture / drawCrest.

## Final sets — hero objects and set dressing (2026-11-14)
**What changed.**
- Guardian statues are now sculpted: `komainu(open, s)` and `kitsune(side, key, s)` in `builders/decor.js` are built from
  smooth parts (`ell` ellipsoids, `sweep` limbs and tails, snail-shell curls, a red cloth bib from `skirt`) on a carved
  plinth: foot slab, die with corner pilasters, chamfered cap, cushion. The komainu sits with folded hind legs and toed
  paws. Its head is square with brows and bulging eyes, a mane of curls covers the back of the head, and a flame-brush tail
  rises up the back. The 'a' twin has an open mouth with fangs and a paw on a ball. The fox has a long neck, tall ears, a
  pointed muzzle and a great brush tail; one holds a scroll, the other a jewel. The staged `bld_fox_statue` GLB is no
  longer used at 狐火之里 (tunnel entrance and the elder's hall).
- Stone lantern (`keyobjects.js`): carved smooth granite for the turned pole and petals, flat facets kept on the hex
  parts, a chipped corner on the base and on the platform (`chip()` in shapes.js), and a moss cap over the back half of
  the roof (`makeStoneLantern({ moss })`; `stoneLanternDecor(lit, moss = false)`, so only the shrine shows it).
- Torii: chamfered base stones, a daiwa ring under the beams, tapered wedges.
- `M.stoneWarm` is now SMOOTH shaded (toon) and `M.carved` is the same material. Boxes, bevelBoxes and facet() parts
  have their own flat normals, so the older users look the same.
- 向日神社 forecourt (`forecourtDress`): three pines and a cherry on the east side of the approach throw long shadows
  across it and the sand. Stone kerbs line both sides of the paving. To the west there is a raked-sand garden: kerb
  frame, three rock islands on moss, ridges that part into rings. Stepping stones lead to the bench, and a tall
  memorial stone stands on a lotus base.
- 朝颜村: thatch eaves are 0.35 m deeper. `eaveDress` adds strings of drying persimmons, a straw cape and hats, a hoe
  and a rake, an unlit lantern by the door, and drip stones under the eave line all round the house. `plazaDress` adds a
  broadleaf shade tree east of the plaza (its shadow crosses g4), a loaded hand-cart, flower tubs by the notice board
  and the dango benches, and firewood with a chopping block near the well.
- 万灯镇 square (`plazaDress`): a kerb of set stones rings the tower foot, with gaps for the streets and the save
  lantern. A roofed well has a lantern under its roof, which makes a warm pool on the paving. Barrel stacks and planters
  with clipped pines and a bench stand in the sector between the streets.
- Boot: every place builder is `async` and calls `await ctx.step(label)` between pieces (sections, houses, lanterns).
  Bakes go through `Site.bakeSliced(step)` and `bakeBlocksSliced(cell, step)`: the merge is a sliced copy of core
  `bakeStatic`, and the shading runs one mesh at a time with the stone crevice term computed in chunks of 512 vertices.
  `farLOD(src, cell, step)` and its clustering are async and sliced too. Same output, same rng order.
  `G.structures.boot` = `{ tasks, max, maxAt, top }` records the longest main-thread piece between two yields.

**Rules.** New dressing uses only materials the place (or the town block) already has; check `G.structures.stats().per`
before and after. Moss on stone lanterns only where the site has `M.moss`. Dressing draws from its own `mulberry32`
streams. Colliders only on rocks, the stele, tree trunks, the cart, tubs, the well, barrels and planters, and never on
a road or inside an anchor circle (`audit()` lists only the three gameplay save colliders, as before).

**Cost** (T.stats at the golden cameras, 1920x1080 'high', `.tmp/final-sets/before_stats.log` / `after.log`):
| shot | calls before → after | tris before → after |
|---|---|---|
| g1 shrine | 555 → 549 | 2.25 M → 2.40 M |
| g4 village | 1228 → 769–977 (two runs) | 4.77 M → 3.36–4.26 M |
| g6 town | 650 → 647 | 2.69 M → 2.73 M |
Meshes per place: shrine 68 → 66, village 51 → 50, fox village 114 → 112, dusktree 14 → 14, town 286 → 286. These are
the draw-call counts that matter. The fall at g4 is larger than the village's own change, so part of it is variation
between runs. Triangles per place: shrine 110 k → 157 k, village 97 k → 149 k, fox village 118 k → 138 k (the far LODs
simplify them). The material offsets that keep the counts flat: the kagura painted pine is now `M.moss`, the bell
fittings `M.bronze`, the farm tub and lid `M.wood` / `M.woodDark`, the fox bib `M.verm` and its eyes `M.black`.

**Known shortfalls.** The boot pieces are not yet all under 16 ms. Measured under heavy machine load (load average
150–245), the longest piece went from 680 ms (one shrine shading pass) to 79 ms in the final run (798 slices; top:
a shrine section 79, a palace section 73, farLOD per-16-mesh batches 54–69, single material merges 55–65 ms). Next steps:
smaller farLOD batches, steps inside the palace sections, and an async `mergeGeometries` for big buckets. The core merge of one material bucket (`mergeGeometries`) and
`computeVertexNormals` of a far mesh are still single pieces. The fox's forelegs are slim. In g6 the foreground paving is still open: the well, barrels and planters land in the
sector right of the view. Raked-garden rings read best
from above.

## Draw-call pass (2026-11-14, see docs/api/perf.md "Draw-call pass — world structures and props")
- Blocks: town 72 m (was 36), fox village 64 m (was 32). After shading, `collapseFamilies` merges each block's
  vertex-coloured meshes per surface family (colour into vertex colours, shared white material with the same name and
  `userData.family`); glow / mapped / transparent / cloth / farColor / dynamic meshes are untouched.
- One merged far mesh per block-baked place while all its blocks are far (`p.placeFar`).
- New API: `S.cull(obj, pos, dist)` (hide a small static object beyond dist) and `S.standIn(obj, dist, cut, {statics})`
  (two-draw stand-in beyond dist, nothing beyond cut; statics keeps the live userData.dynamic parts). Nothing else may
  toggle the visibility of an object handed to either. Used for stone / great lanterns, chests (cut 220 m), altars and
  rest posts (gameplay/collect.js, lanterns.js). setLit / open / greatLanterns behave as before.
- Town scenes: structure draws 286 → 106 (from above), fox village blocks 87 → 51; triangles flat.

## Map round: landmarks of the open country (2026-11-22)
`builders/landmarks.js` builds the made pieces of `src/data/landmarks.js` (ids, kind, scale, coordinates, clearance,
height, element affordances — the list other systems attach discoveries to): peak watchtower, windmill hill (three mills,
sails turn with the wind), hill-fort beacon keep, trilithon crown, cape lighthouse, ruined aqueduct, ruined brook bridge,
hermit cottage, four farmsteads (house, barn, shed, pens, hay, cart, well; fields come from the flora plan), stone
circle, chapel ruin, charcoal camp, shepherd hut, dolmen, quarry derrick, sea pier with boat, cove boathouse, bee
garden, swing (on the flora oak), cairns, way shrines, benches, well, a stone ring round the giant tree. Each is one Site
(`lm_<id>` in `G.structures.places`, `.landmark` = its data). Far LODs now honour `place.cut`: small landmarks vanish
past 320 m, medium past 1100 m, large never. `G.structures.landmarks` = { built, ms }.

## Places round: the Land of Mages and the episode-one rooms (2026-11-22)
- Plan (`src/data/bellcrown.js`): ring `BELL_WALL` (~460 x 310 m, the south rampart and gate where the story anchors
  expect them), raised core `CORE` {x 0, z -150, r 78, h 46} (site-local), 15 `BELL_ROADS`, `BELL_SQUARES`.
  `bellEdge(X, Z)` = signed distance to the ring (2 m cached grid); `bellLevel(x, z, h)` levels the plateau (CITY.y out to
  9 m beyond the wall line, 24 m blend) and lifts the core; world/ground.js `baseHeightAt` calls it.
- City life (`CITY_LIFE` in the same file, re-exported by `src/data/city-life.js`; also `places.landOfMages.life`): world
  coordinates of the gate (13 m wide, 22.5 m high, 16 m deep arch; towers 92 m), practice field, tower tops / spires,
  squares, street centre lines, wall walk, sky lanes, keep-out zones (crash roof and its flight path, the jeweller,
  the inn), and — filled during the build, `ready` = true after — balconies / roof pads / footbridges (`kind`) and shop fronts.
- Builders: `builders/mage-city.js` (walls, gem / cone towers, the great gate, core ring + grand stair + core gate,
  cathedral x1.45 with the glowing rose window, brick clock tower, white towers, tall houses with painted-window facades
  (one tinted texture, 4 materials), jettied upper floors, balconies / roof gardens / footbridges as platforms, street
  lamps with blue orbs, fountains, wells, stalls, planters, rocks at the wall foot). `bellcrown.js` keeps the crash roof
  (`places.accidentRoof.setRepaired`), the jeweller, the lookout and the east (home) town.
- Per-place LOD knobs read by structures.js `blockLODs`: `place.blockNear` (near / far swap per block, m) and
  `place.farCell` (far clustering cell). The town uses 80 / 0.7 (low: 48 / 1.0), 64 m blocks.
- `journey-rooms.js`: the inn gets three painted upper storeys with street balconies (in the roof group, hidden with
  it from inside); Fran's parlour, Elaina's hearth, the inn's oil lamps; `places.franSwing` (rope swing tree) and
  `places.trialRocks` (slate-blue boulders round the storm clearing).

## Art round: the City of Magic modelled, and lived in (2026-11-24)

Painted texture detail on the Land of Mages replaced by modelled form, then dressed as a working town. All builders
write plain geometry through `builders/city-geo.js` (`GeoBuilder`: explicit normals, boxes / chamfered slabs /
bevelled prisms / lathes / tubes, `append(builder, matrix)`; `ByMat`: one builder per material, `flush(parent)` adds
one mesh each), so the site bake merges them like primitives.
- `builders/city-roofs.js` — `modelGable` (pan-tile courses, cover-tile rolls or staggered slates, ridge, fascia,
  soffit, rafter tails and gutters where the eave faces the street, barge boards, attic light, dormers, cresting, a
  crow-stepped street gable with `opt.stepped`), `modelHip` (the 'cone' houses), `chimney(…, flues)`. Tile meshes go
  out pre-shaded in vertex colours on `kit.js sculptVcMat` copies (`flushRoof`): the bake skips their vertex shading
  and the draw-call pass still merges them into the tile family. `CHIMNEY_TOPS` for the smoke.
- `builders/city-bays.js` — modelled window bays laid over the painted ones within `bayRange()` m (40 high, 28 med, 0
  low / phones): eight-plus instanced meshes refilled from a 24 m grid when the camera moves 2.5 m; facades facing
  away are skipped; the bays rise out of the wall over the last 9 m. Registry `addBay()` filled by
  `mage-city.js registerBays()` (the painted cell under each bay decides arch / shutters; per-house style seeds
  shutter colour, flower boxes, curtains, balconettes, open windows) and by balconies (balustrade panels).
- `builders/city-stone.js` — voussoirs, mouldings (`mouldX`, `mouldRing`, profiles `STRING` / `IMPOST`), corbels,
  capped merlons, arrow slits, lancets / pointed outlines, coursed spires, pleated banners (`hangBanner`, clothify),
  cathedral tracery (`archFrame`, `archivolt`, `roseTracery`).
- `builders/city-market.js` — street lamps, wall lanterns, the octagonal fountain, market stalls, planters.
- `builders/city-trades.js` — front doors (`frontDoor`), shop fronts by trade (`TRADES`, `shopFront`: window,
  awning, hanging sign with an emblem, goods), arcades.
- `builders/city-styles.js` — half-timber, quoins, the tower-house dentil band, corner turrets.
- `builders/city-dressing.js` — laundry lines, potted plants, broom racks, notice boards; `CITY_DRESS` spots
  (smoke, cats, glints, book carts, floating lanterns, pigeons, warm windows) for the ambient layer.
- `life/city-ambient.js` — `startAmbient(ctx)` (from `layoutHouses`): builds on the first tick after
  `CITY_LIFE.ready`; one InstancedMesh per kind, motion in the shaders (one time uniform), hidden beyond 420 m of the
  city; warm windows fade in as `G.env.light` drops. Stall keepers: `CITY_LIFE.vendors` → `life/city-crowds.js`.
- `mage-city.js` townhouse picks a seeded mix of house types with `hash01` (never `rand()`, so the layout and every
  anchor stay as they were): arcaded shop rows (shop floor 1.9 m back, colliders split), stepped stone burgher
  houses, half-timbered upper storeys, corner turrets, tower-houses ('cone').
- Boot slices: the carved stonework of the walls, gate, towers and cathedral is queued (`later()`) and built between
  the house layout's `ctx.step()` yields (`carveAll`); each structure uses its own copy of the stone materials
  (`stoneSet(k)`, a colour 1/255 off) so the bake shades it in shorter steps; the family pass merges them back.
