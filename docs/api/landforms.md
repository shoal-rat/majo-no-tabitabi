# landforms — the shape of the land (as built, overhaul 2)

System `landforms` (`src/world/landforms.js` + `src/world/landforms/*`), in `systems.manifest.json` right after
`flora`, before `structures`. It adds rock shapes on top of the analytic height field; it never changes the height
field, the water level, POIs, anchors, paths, quest logic or the save. URL param `nolandforms=1` skips the system
(A/B; builders/far.js then builds its old cone islands).

| file | what |
|---|---|
| `landforms.js` | system facade `G.landforms`, per-frame update (drift rocks, cliff LOD, foam ripples), deform hook |
| `landforms/isles.js` | floating islands (浮空岛): grass cap with the exact walkable top, layered broken rock underside narrowing into stalactites, roots + vines, falling streams into mist, night crystal veins, base cloud wisp, drifting rocks |
| `landforms/cliffs.js` | steep ground: stratified faces (ledges with overhang lips), outcrops, talus at cliff feet, crag spires on 霜见岳 (Frostview Peak) ridges, fluted dark columns around the palace crag; world-space snow / moss baked per vertex |
| `landforms/coast.js` | west-coast sea stacks + 2 arches (swept section), river boulders, stepping stones at unbridged fords, the 雾见泉 (Mistview Spring) → 暮川 (Dusk River) rapids (stepped chute, white-water ribbons, spray, pond mist), foam rings |
| `landforms/horizon.js` | far silhouettes coloured from `scene.fog` (aerial haze) in three depth layers — near stacks ~1.3–1.6 km (darkest), the isle ring ~1.75–2.75 km, broad pale ranges ~3 km — with spurs, gully streaks and crest light, + a low cloud sea far out — 2 draw calls |
| `landforms/bands.js` | round 3: contour cliff bands (`buildBands`: marching squares on the height field at levels 5.75 + k·5.5 m on ground > 44°, ledge lips, overhangs, talus at the foot), `protoCrag` (sharp crag for the 霜见岳 summit), `buildArete` (knife ridge + snow cornice between two crags ≤ 40 m apart) |
| `landforms/cells.js` | `CellStore`: pieces baked into 128 m cells, two LODs per cell, `shift` / `kill` per piece |
| `landforms/rockgeo.js` | `protoRock` (plane-clipped sphere + strata bands + fracture lines + cavity), `protoPrisms`, `Bake` (merge with baked vertex colour), `rockShader(pal)` / `palAt(W,x,z)` / `PALS` |
| `landforms/lfmats.js` | materials: `rock` + `cap` via `toon()` (surface `'rock'` / `'paint'`, hookMaterial), unlit `fall`, `foam`, `puff`, `glow` with three fog; `LU.uTime` |

## API — `G.landforms`
- `enabled`, `initMs`
- `isles.has(id)` → true when this system builds that SKY_ISLE's land. `isles.info[]` `{ id, x, z, top, r, … }`.
- `cliffs` `{ store: CellStore, colliders[], counts, tris }`, `coast` `{ stacks, arches, fords, steps, spots, cascade, boulders }`, `horizon`.
- `show(layer, on)` — `'isles' | 'cliffs' | 'coast' | 'horizon' | 'all'` (A/B and profiling).
- `stats()` → draw count, triangles, piece counts, current LOD.

## Rules for other systems
- **builders/far.js (structures)**: `buildSkyIsles` calls `G.landforms.isles.has(I.id)`; when true it skips its own
  rock cone, dirt / grass discs, rim stones and hanging cones, but still makes the platform (`site.platDisc`), the
  colliders and the decor on top, and keeps its `rng()` call order so decor positions do not move. The walkable top is
  `I.top` exactly; the cap mesh sits flush with it.
- **Placement exclusions** (cliffs / coast): `W.isReserved(x,z,pad)`, `W.roadDist < 8 + pad`, `W.riverDist < 12`,
  `W.protectionAt > 0.01`, the palace moat ring (< 125 m from the palace, which gets its own columns), the wind shrine
  (48 m). Colliders (`W.addCollider`, tag `'landforms'`) are only added away from roads / reserved ground; they never
  cross a route.
- **Spells** (`terrain:deformed`): pieces whose anchor lies in the rect follow the ground offset (`store.shift`); a
  piece undercut by more than 1.6 m shatters (`store.kill` + `fx.burst('shatter_rock')`) and drops its collider.
  Columns are never killed (they stand on the crag, which is not deformable).
- **Water**: foam rings are meshes on the water surface; ripples near the camera use `G.water.ripple(x,z,s)` if it
  exists. The water level is never touched.
- **Quality tiers**: cliff hi-LOD radius 130 / 110 / 80 m (high / med / low); far cells never cast shadows; talus
  density follows `G.quality.density`.

## Cost
Measured A/B in one session (`show('all')` toggled in 4-frame blocks, p25 of `renderFrame + gl.finish`, 1440×900
'high'); see the report of overhaul 2 for the numbers. Geometry: cliffs ~0.82 M tris hi / 0.18 M lo in total (only
the cells within 130 m draw hi), ~45–80 draw calls added in a busy view. Init ≈ 0.8–1.5 s.

## Round 3 (terrain surface round 2 / landforms round 2, 2026-11-13)
- **Steep ground** is now one system in two parts: the terrain shader paints stratified rock on every slope > ~35°
  (see terrain.md, round 3) and `bands.js` builds 3D ledge bands along the SAME levels (5.75 + k·5.5 m), so a painted
  ledge continues a built one where the band breaks off. The old per-sample FACE slabs (> 41°) are gone; ground > 44°
  gets bands only. Bands have **no colliders** (visual ledges ≤ ~1.5 m proud of the field; the terrain collider is
  unchanged), so the heroine may clip a lip when gliding along a face.
- **Summit**: spires are `protoCrag` crags (sharp facets, sunk 1.2 m), linked by arêtes with cornices (≤ 2 links per
  crag, ≤ 40 m, never within 40 m of the wind shrine). Spire colliders end at the crag top (`oh + sy`).
- **Isle falls** fray into strands and thin out over their lower half; the mist under them is four faint, spreading
  veils (was six stacked puffs that read as a white blob).
- **Horizon**: three depth layers (see the table). Rule for other systems: nothing should be placed beyond 1.25 km
  from the origin at sea level without checking it against these silhouettes (they start at y = −25 and rise out of
  the cloud sea at y = 14).

## Known shortfalls
- Contour bands follow the smooth field, so their spacing is regular (every 5.5 m): from the summit the mountain reads
  terraced, a little too orderly; band ends are sometimes abrupt.
- Some large smooth triangles of the base field still show on the 霜见岳 faces between bands at mid distance.
- The far silhouettes are still cones with noise; the cloud sea is barely visible in daylight haze.
- No stepping stones: 暮川 has no unbridged road crossing, and adding one would create a new route.
- Isle falls are ribbons with a scrolling shader; they do not collide or splash on the ground below.
- Coast rock is one merged mesh spanning the west coast and the rivers (always submitted; no shadows).

## Performance pass: boot (2026-11-14, see docs/api/perf.md "Boot and loading")
- `init` yields a boot time slice between the layers (isles, cliffs, coast, horizon). `api.initMs` now includes the
  time spent yielding.

## Draw-call pass (2026-11-14, see docs/api/perf.md)
- `cells.js`: the far (lo) versions of all cliff cells are one `THREE.BatchedMesh` (`store.lo`, name `cliffs_lo`, one
  instance per cell, per-instance frustum culling); near cells stay one mesh each. `c.meshLo` is a handle with the same
  `visible` behaviour. shift / kill write into the cell's range of the batch and drop its cached bounds. Cliff draws
  20–38 → 2–3 at the town and village scenes. Tested: `tools/devkit/draws-world/cliftest.js` (shift both LODs, kill, LOD swap).

## Map round: rock set pieces (2026-11-22)
The journey's landforms system builds only the countryside set pieces (`landforms/setpieces.js`, `G.landforms.setpieces`):
granite tors (stacked rounded slabs + outliers), the crag falls (an arc of stratified masses, a falling-water ribbon with
the landforms fall material, a rock-held plunge pool), the quarry face (blocky lime tiers) and the tarn rim. Pools
(`landforms/pools.js`, `poolOf(W, landmark)`) are flat discs at a level just above the highest ground under them; their
rock rims are built tall enough all round, so water never hangs over a slope (shared with the flora reeds / lily pads).
One mesh per piece (vertex colours, `lfMats().rock`), medium pieces hidden past 1100 m, cylinder colliders on the big
blocks (tag `landmark_rock`). `?nolandforms=1` skips them.
