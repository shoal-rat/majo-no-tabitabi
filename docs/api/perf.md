# Frame budget (perf pass, 2026-11-14)

Owner: perf. Harness: `tools/perf.mjs` (+ `tools/perf/inpage.js`, `tools/perf/compare.mjs`, `tools/perf/picdiff.mjs`).
Scratch, logs and every measured table: `.tmp/perf-frame/PROGRESS.md`, `.tmp/perf/<label>/<tier>.{json,txt}`.

## Read this first: the machine was not quiet
The brief said the machine was ours alone. It was not:
- an orphaned headless Chrome from 03:59 (`.tmp/chrome-4TBoax`, parent pid 1) rendered the game non-stop the whole
  time (100 % of one core, ~30 % GPU device utilisation with nothing else running). Killing it was refused by the
  permission system; **someone with rights should stop it** (`pkill -f chrome-4TBoax`).
- from ~00:20 `fileproviderd` / storage indexing kept the load average at 15.
So absolute numbers drift by ±5 ms between runs. Every claim below about a change is an **interleaved A/B in the same
tree** (`?perf=0` restores every pre-pass path), not "base table vs final table".

## Harness
```
node tools/perf.mjs --label <name> [--tiers high,med,low] [--groups tour,worst] [--scenes id,id] [--runs all|sprint_village,broom_shrine_town,fall_sky_isle]
                    [--layers id,id] [--params "k=v&..."] [--shots]
node tools/perf/compare.mjs <labelA> <labelB> [tier...]      # side-by-side table
node tools/perf/picdiff.mjs <dirA> <dirB> [pairsOut]         # same-camera picture diff + side-by-side pairs
```
- Renders at the desktop app's real size: 1440×900 window, device pixel ratio 2, the tier caps the ratio
  (high 1.5 → 2160×1350, med 1.25 → 1800×1125, low 1 → 1440×900).
- Columns: `frame` = real rAF interval (vsync-capped 16.7); `cpu` = script ms; `ser` = serial CPU+GPU of one frame
  (GPU drained by a 1-pixel readPixels before and after; EXT_disjoint_timer_query is useless on ANGLE-Metal and
  gl.finish does not wait). Also calls, triangles, programs, textures, heap, script ms per system.
- Scenes: the 31 tour cameras of `tools/devkit/after2.js` + worst cases (town above / street, fox street, village with 10
  NPCs, dusk clearing, mirror lake, beam struggle, grass fire, boss, rain). Runs: village sprint, broom shrine→town,
  fall from a sky isle; every frame over 25 ms is listed with new programs (names), textures, geometries, heap change.
- Layer A/B hides one layer at a time (terrain, grass, flora, impostors, structures, props, landforms, life,
  characters, gameplay, water, reflection, sky, fx), skips each shadow cascade, turns off each post step.
- Fixed resolution by default (`dynres=0`); `--params dynres=1` to measure the safety net.
- URL switches added for it: `?perf=0` (all pre-pass paths), `?pr=<n>` (pixel-ratio cap), `?msaa=<n>`, `?dynres=0|1`,
  `?nowarm=1` (no shader warm-up), `?qbench=1` (run the auto-pick probe and log it).

## What was found (measured, biggest first)
1. **Resolution is the largest single cost on 'high'**: pixel ratio 1.5 → 1.0 → 0.5 took the mean serial frame of nine
   heavy scenes 47 → 34 → ~28 ms. Below that there is a ~25 ms serial floor (script + ANGLE draw submission of
   ~900 main + ~400 shadow draws), so 'high' cannot reach 60 by pixels alone.
2. **Bone matrices computed ~25× per character**: `SkeletonUtils.clone` gives every SkinnedMesh its own Skeleton, so
   each character (≈19 material meshes + outlines + shadow proxy on the same bones) updated and uploaded the same bone
   palette 25 times per render. CPU profile in the village: renderer JS 28 → 11–13 ms per frame.
3. **First-use shader compiles** were every big hitch in the moving runs (381 ms, 118 ms, 25–60 ms): enemies, animals,
   ground-clutter rings, hidden LOD variants.
4. Canvas MSAA: the canvas had `antialias: true` although every frame reaches it as one full-screen quad.
5. GTAO + its Poisson denoise rebuilt view normals from depth per tap (9 depth reads × 13 taps per pixel).
6. Face decals (FaceLines, EyeHighlight: transparent + DoubleSide) were drawn twice by three with a program re-check.
7. Not changed, measured: MSAA 4→2 on high saves only ~1.5 ms (rejected: grass edges); shadow cascades cost 0.5–2 ms
   each; water reflection 0–3 ms; ~4 MB of garbage per frame comes mostly from three's `getParameters` program checks
   and Rapier's collider-handle sync (library code).

## What changed (every item off with `?perf=0`)
| change | where | effect (interleaved A/B, high) |
|---|---|---|
| shared Skeleton per character clone | `core/assets.js` `shareSkeletons` | renderer JS −15 ms/frame (profile, village) |
| face decals single pass | `core/assets.js` (toonify) | −2 draws per face material |
| canvas `antialias: false` | `core/boot.js` | no per-frame 4× resolve of the default framebuffer |
| half-res AO normal pass shared by GTAO + denoise | `render/post.js` | AO no longer reads 117 depth taps per pixel |
| shader warm-up + pre-pooled creatures | `render/warmup.js`, `combat/combat.js`, `combat/wildlife.js` | removes the ground-clutter / flora / most enemy first-use compiles from play (they move into one ~80 ms frame at the start of play); the slime (jelly) and one animal model (`Material.001`) still compile on first spawn (80–200 ms) — not covered, see shortfalls |
| dynamic resolution | `render/dynres.js`, `core/boot.js`, `render/post.js` `setRenderScale`, `render/skydome.js` | see below |
| first-start tier auto-pick | `render/gpubench.js`, `core/boot.js`, `core/save.js` | see below |
Six heavy scenes, two interleaved rounds: mean serial frame 53.4 → 49.3 and 54.2 → 47.0 ms.
Whole set on the quiet machine (all 42 scenes, `?perf=0` vs now): mean serial frame high 32.3 → 27.5 ms, med 24.5 → 20.1 ms, low 15.6 → 15.4 ms.

### Dynamic resolution (safety net)
`G.dynRes` (`render/dynres.js`). Evaluates 1 s windows of the real frame interval; two windows over 19 ms → one step
down; a step up only after `upWait` seconds of windows under 17.4 ms. A drop within 6 s of a raise doubles `upWait`
(8 → 16 → 32 → 64 s), a minute of stable full resolution halves it again: it does not pump. Frames over 90 ms
(loading, streaming) never count. Steps: high 1.5 → 1.3 → 1.15 → 1.0, med 1.25 → 1.1 → 1.0, low 1.0 → 0.85 → 0.75.
It scales only the post pipeline (`G.post.setRenderScale(pr)`); the canvas keeps its size and the last pass upscales,
so a step costs one render-target reallocation (≤ 60 ms once) instead of a canvas resize. Off: `?dynres=0` or
`settings.dynRes = false`. Measured (high, dynres on): it settles at 1.0 in all three runs; broom flight p50 17.7 ms.

### Tier auto-pick
On a first start (no stored `quality`) `pickQuality()` draws a game-like noise shader over 1024² eight times on a
throw-away WebGL2 canvas (~0.1 s) and scores ms per megapixel. Reference (this M5 laptop, under the contention above):
0.41–0.43 → `REF = 0.42`. ≤ 1.8×REF → high, ≤ 4×REF → med, else low; SwiftShader / llvmpipe → low. The result is
stored with `settings.qualityAuto = { tier, score, renderer }`; the settings menu still overrides it.

## Tiers
| | low | med | high |
|---|---|---|---|
| pixel ratio cap (dynres floor) | 1.0 (0.75) | 1.25 (1.0) | 1.5 (1.0) |
| scene MSAA | none, FXAA | 2× on retina | 4× + SMAA |
| AO | off | off | GTAO half res |
| bloom / light shafts | off / off | on / on | on / on |
| sun shadow cascades | 2 (1024, 1024) | 3 (1536, 1024, 1024) | 3 (2048, 1536, 1024) |
| outer cascade refresh | every 4th frame | 3rd / 6th | 2nd / 4th |
| vegetation / grass density | 0.5 | 0.75 | 1 |
| particles | 0.5 | 0.8 | 1 |
| view distance | 1100 m | 1600 m | 2400 m |
| water mirror | — | — | half-res planar reflection |
| terrain detail | no detail normals, 90 m | detail < 26 m, 140 m | detail < 40 m, 190 m |
(The perf pass did not change the tier contents; it added the dynres floor and the auto-pick.)

## Results
Quiet machine (load 2–4, orphan gone), fixed resolution (`dynres=0`), 1440×900 @ dpr 2. "before" = this tree with
`?perf=0` (label `base0`), "after" = label `final2` (high) / `final` (med, low). Cells: frame p50 (vsync-capped rAF
interval) and serial CPU+GPU p50, ms. The original contended baseline (label `base`) is in `.tmp/perf/base/` and the
PROGRESS file; do not compare it with these. Same-camera picture pairs for 'high' (31 tour cameras, 1600×900,
`?perf=0` vs now): `.tmp/perf-frame/pairs/*.jpg`; the only differences are animation phase (grass / bamboo sway,
clouds). Story acceptance on the final tree: ALL PASSED.

| scene | high frame | high serial | med frame | med serial | low frame | low serial |
|---|---|---|---|---|---|---|
| t01_meadow_game | 21.9 → 19.8 | 30.3 → 27.4 | 18.8 → 16.7 | 30.8 → 21.2 | 16.7 → 16.7 | 14.2 → 15.6 |
| t02_heroine_close | 22.7 → 20.4 | 32.0 → 26.6 | 19.5 → 16.7 | 27.9 → 17.2 | 16.7 → 16.7 | 13.9 → 14.1 |
| t03_dusk_forest_game | 24.4 → 21.6 | 31.0 → 27.3 | 18.8 → 17.2 | 25.9 → 23.3 | 16.7 → 16.7 | 15.5 → 15.4 |
| t04_village_house | 25.8 → 23.0 | 35.6 → 29.1 | 21.5 → 17.3 | 31.3 → 22.1 | 16.7 → 16.7 | 20.3 → 17.8 |
| t05_open_meadow_game | 22.6 → 19.8 | 30.4 → 25.8 | 19.6 → 16.7 | 27.3 → 20.4 | 16.7 → 16.7 | 14.7 → 14.9 |
| t06_heroine_front_open | 22.9 → 20.5 | 31.0 → 26.6 | 19.5 → 16.7 | 27.7 → 20.7 | 16.7 → 16.7 | 14.6 → 15.0 |
| t06b_heroine_back_open | 26.5 → 23.4 | 32.8 → 29.2 | 20.5 → 16.7 | 28.1 → 21.7 | 16.7 → 16.7 | 15.2 → 14.5 |
| t07_shrine_game | 17.3 → 16.7 | 23.3 → 22.0 | 16.6 → 16.7 | 23.2 → 17.6 | 16.7 → 16.7 | 16.2 → 17.2 |
| t08_pier_lake_game | 24.5 → 21.9 | 30.0 → 27.9 | 17.4 → 16.7 | 28.3 → 20.2 | 16.7 → 16.7 | 14.5 → 15.7 |
| t09_lantern_town_game | 25.6 → 23.5 | 36.3 → 31.1 | 21.1 → 17.3 | 30.4 → 21.8 | 16.7 → 16.7 | 15.7 → 14.1 |
| t10_glowwood_game | 21.9 → 19.6 | 25.2 → 22.9 | 16.6 → 16.6 | 18.1 → 17.4 | 16.7 → 16.7 | 16.5 → 16.0 |
| t11_west_coast_game | 17.5 → 16.7 | 20.3 → 19.5 | 16.6 → 16.6 | 15.9 → 17.0 | 16.7 → 16.7 | 16.3 → 16.4 |
| t12_shrine_approach | 20.6 → 18.8 | 26.6 → 24.7 | 16.7 → 16.7 | 21.2 → 18.7 | 16.7 → 16.7 | 13.6 → 15.9 |
| t13_shrine_hall | 18.3 → 16.6 | 27.9 → 22.4 | 16.7 → 16.6 | 19.4 → 16.0 | 16.7 → 16.7 | 15.2 → 16.0 |
| t14_village_wide | 29.7 → 27.6 | 40.2 → 35.2 | 21.3 → 16.6 | 33.4 → 22.0 | 16.7 → 16.7 | 15.0 → 16.7 |
| t15_fox_village | 31.0 → 27.5 | 43.6 → 38.5 | 28.7 → 20.9 | 32.1 → 30.3 | 16.7 → 16.7 | 15.4 → 20.4 |
| t16_dusk_bridge | 31.2 → 27.1 | 42.3 → 36.2 | 22.6 → 18.7 | 31.7 → 24.4 | 16.7 → 16.7 | 15.7 → 14.7 |
| t17_spring_cascade | 27.6 → 22.3 | 30.2 → 25.0 | 17.4 → 16.6 | 21.0 → 17.7 | 16.7 → 16.7 | 17.5 → 15.7 |
| t18_dusk_tree | 28.1 → 22.6 | 36.9 → 27.0 | 18.2 → 16.7 | 27.2 → 21.1 | 16.7 → 16.7 | 13.7 → 14.0 |
| t19_isle_from_ground | 16.6 → 16.7 | 17.7 → 15.2 | 16.7 → 16.7 | 21.6 → 18.1 | 16.6 → 16.7 | 16.5 → 15.2 |
| t20_isle_side | 27.7 → 20.0 | 31.2 → 25.8 | 17.6 → 16.7 | 29.1 → 16.6 | 16.7 → 16.7 | 14.0 → 13.8 |
| t21_isle_dusk_side | 27.1 → 20.6 | 33.6 → 25.6 | 16.6 → 16.7 | 24.7 → 18.4 | 16.7 → 16.7 | 15.0 → 13.9 |
| t22_mountain_cliffs | 21.1 → 17.4 | 21.9 → 18.9 | 16.7 → 16.7 | 19.3 → 16.2 | 16.6 → 16.7 | 15.0 → 13.3 |
| t23_wind_shrine | 19.3 → 16.7 | 21.3 → 18.7 | 16.7 → 16.7 | 20.0 → 19.3 | 16.7 → 16.7 | 14.8 → 15.1 |
| t24_south_cape | 28.6 → 25.9 | 30.6 → 29.1 | 18.5 → 16.7 | 21.6 → 22.7 | 16.7 → 16.7 | 16.2 → 16.7 |
| t25_east_shore | 24.9 → 20.8 | 30.6 → 23.5 | 16.7 → 16.7 | 22.5 → 15.9 | 16.7 → 16.7 | 17.0 → 17.8 |
| t26_crystal_hollow | 21.8 → 20.0 | 27.3 → 20.7 | 16.7 → 16.7 | 15.1 → 21.1 | 16.7 → 16.7 | 13.6 → 15.8 |
| t27_palace_front | 21.9 → 19.0 | 25.7 → 22.3 | 16.7 → 16.7 | 14.4 → 15.2 | 16.7 → 16.7 | 16.0 → 15.8 |
| t28_overlook_east | 29.3 → 26.7 | 34.3 → 27.1 | 18.6 → 16.7 | 20.5 → 20.3 | 16.7 → 16.7 | 18.0 → 15.0 |
| t29_overlook_palace | 29.6 → 25.2 | 32.0 → 28.1 | 19.1 → 17.1 | 19.0 → 18.1 | 16.7 → 16.7 | 16.2 → 13.7 |
| t30_dango_stall | 32.6 → 29.8 | 50.1 → 37.9 | 20.6 → 17.6 | 26.7 → 23.3 | 16.7 → 16.7 | 15.3 → 14.1 |
| t31_lampmaker_shop | 32.8 → 30.1 | 41.8 → 35.1 | 20.4 → 18.7 | 29.4 → 23.1 | 16.7 → 16.7 | 16.1 → 16.9 |
| w_town_above | 34.4 → 32.3 | 48.2 → 38.8 | 23.0 → 20.7 | 30.5 → 25.8 | 16.6 → 16.7 | 16.1 → 14.5 |
| w_town_street | 31.2 → 28.7 | 34.3 → 33.4 | 19.4 → 16.7 | 27.2 → 24.0 | 16.7 → 16.7 | 15.0 → 14.4 |
| w_fox_street | 27.7 → 26.2 | 33.6 → 32.6 | 18.2 → 16.7 | 28.1 → 23.9 | 16.7 → 16.7 | 15.4 → 14.6 |
| w_village_10npc | 24.9 → 22.7 | 33.3 → 28.3 | 16.7 → 16.7 | 25.1 → 18.6 | 16.7 → 16.7 | 15.5 → 13.9 |
| w_dusk_clearing | 29.8 → 28.9 | 32.9 → 33.9 | 18.9 → 16.9 | 22.2 → 19.8 | 16.7 → 16.7 | 14.1 → 14.0 |
| w_mirror_lake | 25.4 → 23.6 | 31.9 → 26.4 | 16.8 → 16.6 | 24.1 → 21.0 | 16.7 → 16.7 | 17.6 → 14.6 |
| w_beam_struggle | 29.9 → 27.0 | 33.9 → 29.3 | 16.7 → 16.7 | 22.1 → 15.8 | 16.7 → 16.7 | 16.4 → 15.9 |
| w_grass_fire | 33.2 → 28.1 | 32.2 → 27.4 | 20.0 → 16.7 | 21.1 → 18.2 | 16.7 → 16.6 | 14.9 → 15.8 |
| w_boss_fight | 21.1 → 18.7 | 29.9 → 21.7 | 16.7 → 16.7 | 18.9 → 14.8 | 16.7 → 16.7 | 13.7 → 19.1 |
| w_rain | 28.0 → 25.8 | 41.9 → 32.0 | 16.7 → 16.7 | 24.7 → 21.6 | 16.7 → 16.6 | 17.1 → 14.8 |
| **mean** | 25.7 → 22.9 | 32.3 → 27.5 | 18.6 → 17.1 | 24.5 → 20.1 | 16.7 → 16.7 | 15.6 → 15.4 |
| **worst scene frame p50** | 34.4 → 32.3 |  28.7 → 20.9 |  16.7 → 16.7 |  |

Moving runs (frame p50 / p95 / max ms, frames over 25 ms):

| run | tier | before (perf=0) | after |
|---|---|---|---|
| sprint_village | high | 29.7 / 33.7 / 48 (400/407) | 26.9 / 28.7 / 33.8 (339/355) |
| broom_shrine_town | high | 21.6 / 28.2 / 42.7 (267/2019) | 20 / 26.8 / 41.6 (198/2174) |
| fall_sky_isle | high | 31.4 / 38.4 / 40.5 (181/181) | 29.1 / 36.1 / 38.5 (189/192) |
| sprint_village | med | 16.9 / 24.8 / 37.7 (33/561) | 16.7 / 17.2 / 23.5 (0/554) |
| broom_shrine_town | med | 16.7 / 17.5 / 35.4 (6/2697) | 17.6 / 22.7 / 119 (37/1527) |
| fall_sky_isle | med | 16.7 / 17.4 / 17.7 (0/357) | 17.6 / 20.1 / 21.6 (0/329) |
| sprint_village | low | 16.7 / 17.4 / 17.8 (0/548) | 16.7 / 17.3 / 17.6 (0/548) |
| broom_shrine_town | low | 16.7 / 17.7 / 18.7 (0/2701) | 16.7 / 17.4 / 201.4 (2/2701) |
| fall_sky_isle | low | 16.7 / 17.6 / 18.4 (0/351) | 16.7 / 17.2 / 17.7 (0/357) |

Dynamic resolution on (high, label `dyn2`, contended run): sprint p50 25.8, broom p50 17.7, fall p50 22.8 ms; it settles
at pixel ratio 1.0 in all three, one reallocation spike ≤ 57 ms per step.

## Still over budget (honest list)
- **'high' does not hold 60 fps on this machine.** Fixed-resolution frame p50 averages 22.9 ms over the 42 scenes (worst: town from
  above 32.3, dango stall 29.8, village wide 27.6, fox village 27.5 ms). Even with dynamic resolution at its 1.0 floor the heavy places
  run ~22–27 ms (40–45 fps), i.e. around the 45 fps floor, not 60. The floor below the pixels is ~25 ms serial: script
  (renderer JS ~11–13 ms after the skeleton fix, physics 2–3 ms near colliders) plus ANGLE submission of ~900 main draws,
  ~400 shadow draws and the water reflection. What would move it: per-block material atlases for the town / fox village
  (structures: ~300 draws), merged prop kits (props: ~300 draws, InstancedMeshes not frustum-culled, no far LOD),
  character LOD (each ~200 draws / 30–40 k tris for the cast in view), shadow caster culling by size per cascade.
  None of that was done: each is a system-owner rewrite, not a surgical change.
- **'med' does not hold 60 everywhere.** Mean frame p50 is 17.1 ms, worst 20.9 (fox village) / 20.7 (town from above) at
  pixel ratio 1.25; dynamic resolution (floor 1.0) brings most of them to ~17–20.
- **'low' is about 75 % of 'med' (serial 15.4 vs 20.1 ms), not half.** Low already drops AO, bloom, shafts, MSAA, one shadow cascade and half
  the vegetation; the rest is the same draw-call floor. Halving it needs the same draw-call work as above.
- **Hitches left**: first spawn of the slime (primitive jelly: JellyCore / JellyBody + two unnamed programs) and of one
  animal model (`Material.001`) compile 80–200 ms even after the warm-up (the warmed instance's programs are not the
  ones the spawned one ends up using; cause not found). Story NPC batches arriving in town upload ~19 textures in one
  frame (~25–40 ms). The warm-up itself is one ~80 ms frame right after play starts.
- ~4 MB of garbage per frame (three's `getParameters` for materials shared between Mesh / InstancedMesh / receiveShadow
  variants — CelOutline, some MeshToon — and Rapier's collider-handle sync) → a minor GC every few frames.
- The broom-flight run is flaky (she is sometimes knocked off by wildlife and the run ends on foot at (-180, -22)); its
  numbers then cover a shorter flight.

## Rules for other systems
- Never clone a skinned model with your own `SkeletonUtils.clone`; use `G.assets.model()` (it shares skeletons). If you
  build extra SkinnedMeshes on a character's bones, give them the character's existing Skeleton.
- A material that appears only later in play (new enemy, effect, LOD) compiles in the frame that first draws it
  (25–60 ms). Put it in the scene hidden at start (warmScene compiles hidden objects) or pool it like the creatures.
- Screen-space shaders must not size themselves from `renderer.getDrawingBufferSize()`; under dynamic resolution the
  pipeline renders smaller than the canvas. Use `G.post.renderSize` (the water capture size is already right).
- Measure with `tools/perf.mjs`, and compare with an interleaved A/B, not against an old table.

## Boot and loading (start-up pass, 2026-11-14)

Owner: perf (boot). Scratch, logs and every table: `.tmp/perf-boot/PROGRESS.md`. Measured alone on the machine
(load average 2–4, which is WindowServer + the Claude app); Apple M5, 1600×900, quality high.

### Harness
- `src/core/boottime.js` — `window.__mvBoot`: `marks` (bundle, settings, renderer, manifest, early, titleShown, assets,
  systems, compiled, firstFrame, choice, started, playable), `spans` (`init:<system>`, `warm`, bakes), `long` (long
  tasks), `assets` (per asset group: n, bytes, fetchMs, parseMs, cookMs). `slice()` = yield when the 8 ms budget is
  spent (scheduler.yield / MessageChannel — never rAF: a hidden Electron window gets few frames).
- Browser: `node tools/play.mjs --name bp --title --params quality=high --script tools/devkit/perf-boot/bootprobe.js` (the real
  title flow; prints the marks, the title / play frame gaps, heap). `&boot=legacy` = the old order (everything before
  the title), `&nowarm=1` = no shader warm-up, `&warm=compile` = the earlier compileAsync warm-up, `&nocache=1` = no
  bake cache.
- Electron: `desktop/main.js` self-test. `cd desktop && MV_SMOKE=1 MV_USERDATA=<throw-away dir> MV_SMOKE_PLAY=1 npx electron .`
  prints `MV_SMOKE {titleMs, menuMs (continue / new usable), ms (first playable frame), marks, warm, heapMB}`, times from
  process start. `MV_SMOKE_QUERY=boot=legacy` passes URL parameters. `tools/devkit/perf-boot/smoke.sh <cold|warm> <new|legacy|nowarm>`
  wraps it; "cold" deletes the OS Metal cache of the dev Electron (`$(getconf DARWIN_USER_CACHE_DIR)/com.github.Electron.helper`).
  **Kill every Electron between runs** (`pkill -9 -f desktop/node_modules/electron`): two instances on the same
  userData wait on each other's storage lock (the settings phase went from 0 to 4 s).

### Why the packaged app once took 52 s
Not the app:// scheme and not the asset count: all 309 preloaded GLBs (89 MB) arrive in 0.6–0.9 s through net.fetch, from
a folder or an asar. macOS keeps compiled Metal pipelines per app bundle identifier. A new identifier or an Electron or macOS update starts with an empty **GPU driver cache**.
The old boot drew its first world frame — about 190 programs and their pipelines — in ONE frame on the main thread:
| dev Electron, release build, old order | warm cache | cold cache |
|---|---|---|
| launch → title (= menu) | 5.2 s | 21.0 s (first frame alone 14.5 s) |
| launch → playable | 7.5 s | 25.2 s |
The 52 s day had five other GPU users on top of a cold cache. A fresh userData (Chromium GPUCache) is not the factor.
compileAsync does **not** help on a cold cache: ANGLE/Metal builds the pipeline at the first draw, so programs linked
early were built again (measured: compileAsync 13.5 s, then the first frame still 12.4 s).

### What changed
1. **Title first** (`core/boot.js`): the leading systems that own no world (fx, audio, ui — fonts load inside ui.init)
   start, the title comes up over the boot backdrop (`#boot.under`), and the world loads behind it: models, systems in
   manifest order (time-sliced), shader warm-up. `G.worldReady` (Promise), `G.bootReady`, events `boot:progress`
   `{frac, text}` / `boot:ready`, `G.bootProgress()`. The loop runs only the early systems and draws nothing until ready.
   The title (`ui.md`) shows the progress line with the `core.boot.*` texts, dims 「继续」 (Continue) / 「新的旅程」 (New Journey) until ready, and keeps
   a choice made early. `?autostart` / `?continue` (tests) wait for the world as before.
2. **Warm-up by drawing** (`render/warmup.js` `warmDraw`): one representative per (materials, object kind, geometry
   attribute set) — 586 of them — is drawn through the real frame path (`G.renderFrame`: shadow pass, water mirror,
   MSAA scene target, post) behind the backdrop, a batch per frame: viewer, shadow cameras and (now) the water mirror
   camera see only layer 31, which holds the lights and the batch; hidden objects are shown and frustum culling is off
   for the batch; everything is restored. The post chain is enabled one pass per frame (AO separately). Batch size
   adapts to the frame gap (target 50 ms; cap 12 as soon as a frame takes > 150 ms = cold cache). `G.bootWarm` =
   `{groups, frames, maxGap, top}` (the five slowest batches). Programs made by the first frame after start fell from
   49 to 24 (the rest are objects created by `start()`: player, clutter rings — warmScene at start handles those).
3. **Time slices** in the long boot loops (assets cook, flora, structures builders / LOD, landforms layers) — see the
   "Performance pass" notes in flora.md, structures.md, landforms.md, terrain.md.
4. **Bake cache** (`core/bakecache.js`): IndexedDB, keys prefixed with the build hash (`build.mjs` injects
   `__MV_BUILD_HASH__`; entries of other builds are deleted on open; any failure or an open slower than 800 ms = not
   cached). Holds the terrain data texture. `?nocache=1` off.
5. **Memory** (`core/assets.js`): the glTF parser of each loaded model is dropped after load (it held the whole GLB
   binary chunk, every buffer-view copy and the image blobs): JS heap after boot 767 → 622 MB (same run, `?perf=0` vs
   now). `G.assets.raw()` / `model()` unchanged.
6. `render/warmup.js` `warmScene` (game start) compiles for an off-screen target with compileAsync (it compiled ~95
   tone-mapped canvas variants that are never drawn: 281 → 186 programs).

### Results
Electron (`desktop/dist` release, dev Electron, MV_SMOKE, same build, launch = process start):
| | old order, warm | new, warm | old order, cold cache | new, cold cache |
|---|---|---|---|---|
| launch → title | 5.2 s | **0.44–0.52 s** | 21.0 s | **1.7–2.3 s** |
| launch → continue / new usable | 5.2 s | 5.6–5.9 s | 21.0 s | 25.2 s |
| launch → first playable frame | 7.5 s | 7.8–8.1 s | 25.2 s | 28.0 s |
| longest frame while the title is up | (no title yet) | 0.22 s | (no title yet) | 0.67 s (was one 14.5 s freeze) |
Browser headless (`bootprobe.js`, same tree, one run each):
| mark (ms) | old order | new |
|---|---|---|
| bundle evaluated / manifest | 76 / 152 | 76 / 152 |
| title shown | 4535 | **395** |
| models loaded (309, 89 MB) | 738 | 941 |
| systems initialised | 3709 | 3659 |
| warm-up done / world ready | — / 4535 | 5108 / 5219 |
| "new game" → first playable frame | 776 | 714 |
| longest main-thread task | 776 | 402 |
| JS heap after start | 687 MB | 634 MB |
Per system (init, ms, warm): structures 1476, terrain 525, flora 370, landforms 225, audio 87, gameplay 71, ui 51;
shader warm-up 1.1–1.5 s warm, ~15 s cold. Pictures: same-camera pairs old vs new, 5 places
(`.tmp/perf-boot/pairs/*.jpg`) — identical by eye (mean abs difference 0.6–3.9 / 255: grass-flower scatter).

### Memory (headless, high, 1600×900; `tools/devkit/perf-boot/mem.js`)
| | after boot | sun meadow | dusk + fox town | night glowwood |
|---|---|---|---|---|
| JS heap used | 644 MB | 655 MB | 701 MB | 709 MB |
| geometry in the scene (unique, attributes + index) | 287 MB | 309 MB | 321 MB | 281 MB |
| textures referenced by scene materials (est., mips incl.) | 120 MB | 132 MB | 148 MB | 92 MB |
| renderer.info: geometries / textures / programs | 773 / 186 / 147 | 967 / 254 / 149 | 1510 / 426 / 151 | 1813 / 422 / 151 |
GPU estimate after the tour: geometry ~0.3 GB + textures ~0.15–0.25 GB (renderer.info counts 422 uploaded, many
not in the scene: pooled creatures, baked atlases) + render targets at 1600×900 ~0.1 GB (MSAA half-float scene target,
AO, bloom chain, water mirror) ≈ 0.6–0.7 GB. Every geometry keeps its CPU copy (~0.3 GB of the JS heap is attribute
arrays; the 309 raw models alone 238 MB) — colliders, ground queries, LOD merges and context-loss restore read them,
so none was dropped in this pass. The v1 character files never load (only with `?costume=v1`).

### Packaging (for the lead; electron-packager from `desktop/`)
- Include: `main.js`, `package.json`, `dist/` (game.js, index.html, assets/). Build it with
  `node build.mjs --release --out desktop/dist` (it already skips `assets/_incoming` 1.4 GB, `_preview`, dot files, and
  emits no source maps).
- Exclude: `node_modules` (`--prune` / electron is the runtime), `.tmp`, and — optional, saves 41.5 MB — the 19 `fileV1`
  character files `dist/assets/models/chars/*` named in the manifest's `fileV1` fields (debug `?costume=v1` only) and the
  69 `orig` props (13.7 MB, `?propsv=1` only). The fonts (`dist/assets/fonts`, 24 MB, used) stay.
- Size: `dist` is 229 MB (models 163, audio 34, fonts 24); the app ≈ 229 MB + the Electron framework ≈ 480 MB
  unpacked (the last package was 364 MB with a 107 MB asar, before the fonts and the latest models).
- First launch of every new package pays the cold driver cache once (title in ~2 s, world ~25 s, the title stays
  live); later launches: title 0.5 s, world 5.6 s. Running the self-test (`MV_SMOKE=1`) once after packaging, from the
  packaged app, warms the cache for that machine only.

### Still slow (honest list)
- **World ready 5.6 s warm** (target: title in 3 s is met; the world is not). The systems phase is 2.7–3.2 s of
  main-thread work; structures (1.5 s: each place builder is one 200–400 ms block), terrain 0.5 s, flora 0.4 s. Steps
  over 8 ms remain (longest 0.4 s while the title is up) — the builders would need internal yields or a worker.
- **Cold cache: world ready 25 s** — 3–4 s more than the old one-frame build in total (more frames, batches redraw the
  mirror and shadows), traded for a live title. Pipeline builds of a few big shaders (water, terrain, character faces)
  cost 0.5–0.7 s each and cannot be split.
- Not done: loading only the spawn area first and streaming the rest nearest-first; lazy far characters / props / music.
  Measured why it was left: all models load in 0.6–0.9 s behind the title, so streaming would save at most that; the
  time is in system init and pipeline builds.
- No cache of baked atlases besides the terrain data (flora / impostor atlases are GPU render-target bakes; reading
  them back costs about what baking does).

## Draw-call pass — shadows and culling (2026-11-14)
Owner files: `render/shadows.js`, `world/flora.js`, `render/warmup.js` (post.js, water/reflect.js, flora/batches.js,
scatter.js, terrain/lod.js, clutter.js unchanged). Counts, not times (a film crew shared the GPU). Harness:
`tools/devkit/draws-shadow/probe.js` (per-pass draw list: main, each cascade, mirror, post; 8 frames, 1920×1080 high,
`dynres=0`). Off switch for everything below except the refresh change: `?dcull=0` (or `?perf=0`).

What changed (details in docs/api/look.md §3 "Draw-call pass" and docs/api/flora.md):
- Caster culling per cascade (wrap of `Mesh.prototype.intersectsFrustum`, pass told apart by `shadow._frustum`):
  view capsule (caster swept down the light vs the camera frustum cut at the cascade's reach), inner-cascade exclusive
  box (map *i* is never read there), projected size under one texel of cascade *i* > 0. Reused maps are culled with a
  wider frustum / margin and re-render at once when the camera or the inner box moves past it.
- Instanced groups: count 0 never submitted; `props:*` kits (frustumCulled false before) are now tested per instance in
  every pass (main included) — a kit spread over the island is no longer drawn everywhere.
- Flora batches drop `castShadow` while no instance is in shadow range (empty instanced draws were submitted to every
  cascade); warm-up still builds their depth programs (`userData.mvCast`).
- 'high' outer cascades refresh every 3rd / 6th frame (was 2nd / 4th), staggered (also 'med'). Not under `dcull`.
- Main pass: flora (per chunk vs camera frustum), terrain (per chunk) and clutter were already culled by cell; nothing
  further in these files was worth a change (they are 11–41 of 180–430 main draws). The remaining main draws are
  structures / props / landforms (other owners).

Counts (draws per frame; "base" = original code at the start of the pass, "off" = same build with `?dcull=0`, run back
to back with "on"; base → off also contains the other two engineers' merges, so only off → on is this pass alone):

| scene | main base / off → on | shadow base / off → on | k tris base / off → on |
|---|---|---|---|
| w_fox_street | 540 / 364 → 362 | 400 / 228 → 182 | 5107 / 4749 → 4892 |
| w_village_10npc | – / 419 → 417 | – / 200 → 156 | – / 5771 → 5569 |
| w_dusk_clearing | 248 / 216 → 215 | 209 / 155 → 136 | 3819 / 3714 → 3810 |
| w_mirror_lake | 284 / 248 → 248 | 199 / 160 → 107 | 3810 / 3780 → 3530 |
| w_beam_struggle | 174 / 154 → 153 | 88 / 70 → 54 | 3545 / 3324 → 3300 |
| w_grass_fire | 179 / 152 → 151 | 135 / 88 → 71 | 3537 / 3360 → 3428 |
| w_rain | 439 / 273 → 271 | 375 / 210 → 160 | 5656 / 4806 → 4614 |
| w_town_above (night) | 719 / 375 → 375 | 0 | 3375 / 3097 → 3096 |
| w_town_street (night) | 653 / 355 → 354 | 0 | 3180 / 2940 → 2936 |
| w_boss_fight (night, live combat) | 278 / 200 → 213 | 0 | 2230 / 2376 → 2334 |
| t16_dusk_bridge | 649 / 428 → 430 | 324 / 204 → 167 | 5164 / 4863 → 4842 |
| t24_south_cape | 124 / 123 → 123 | 72 / 58 → 47 | 3459 / 3250 → 3231 |
| t28_overlook_east | 457 / 296 → 300 | 84 / 65 → 25 | 3979 / 3862 → 3854 |

Shadow draws over the ten lit scenes: base 1884 (nine, village errored) → 947 (−50 %); this pass alone (off → on)
1438 → 1104 (−23 %), plus the 1/3/6 refresh which is in both "off" and "on". Shadow k-tris move ±5 % with the refresh
phase of the 8 sampled frames. Main ±2 draws = far-LOD swaps / live NPCs; boss = live combat.

Pictures: `.tmp/play/ds_fb` (off), `ds_fb2` (off again), `ds_fa` (on). The scenes are live (sway, particles, NPCs,
HUD timers): off vs off-again PSNR is 15–26 dB, off vs on lies in the same band at every scene (e.g. t16 17.46 vs
17.44, fox 23.90 vs 23.86, t28 25.6 vs 27.9) and side-by-side the shadows are identical. A frozen-time golden run is
the lead's check.

Still open: cascade 0 (every frame, ~100 draws at the fox street) is only culled by the view capsule; a cached static
far cascade (re-render on light / camera-cell change only) and merged shadow proxies for small casters (layer 5) were
not built — the first needs static / dynamic caster lists (structures' files), the second an offline bake.

## Draw-call pass — world structures and props (2026-11-14)

Counts, not times (the GPU was shared with a trailer recording while this was done; the lead times it afterwards).
Probe: `tools/perf/drawlist.js` (in-page; prepend it to a play script) wraps `renderer.render` for one frame and groups
every draw call by pass (main / shadow / reflection / post), by owner (the nearest named ancestor: place, block, system
prefix), by material and by camera distance. `DL.capture()` → counts, `DL.table(r, n)` → text. Scenes and shots:
`tools/devkit/draws-world/scenes.js` (5 perf scenes + golden g1 / g4 / g6), run by `tools/devkit/draws-world/runall.sh <name>`.

What changed (all at load time in code; nothing under assets/):
- **Structures, one material per surface family** (`world/builders/kit.js` `collapseFamilies`): after the baked vertex
  shading, the merged meshes of a block whose materials differ only by colour are merged again: the colour goes into the
  vertex colours and the mesh takes a shared white family material (`userData.family`, same name as the colour's
  material, so the cel path keys the same). Glow / mapped / transparent / cloth / farColor / dynamic meshes are left as they
  were. Town blocks 36 → 72 m, fox village 32 → 64 m (`bakeBlocksSliced`), so a town block is a handful of draws.
- **One far mesh per place** (`structures.js` placeFars): while every block of a block-baked place is far, one merged far
  version (2 draws) replaces the per-block fars.
- **Stand-ins and cuts** (`G.structures.standIn(obj, dist, cut, {statics})`, `G.structures.cull(obj, pos, dist)`): stone
  / great lanterns, chests, altars and rest posts swap their baked parts for a two-draw merge (lit + glow) beyond 100 m
  (outside the 64 m night lamp-pool map); their live parts (paper, flame, lid) stay, so lighting / opening far away still
  shows. Chests are not drawn beyond 220 m, the kite holder has a distance cut. `farLOD` takes `skipDynamic`.
- **Props in shared BatchedMeshes** (`props/models.js`): every live prop part goes into one `THREE.BatchedMesh` per
  material family (lit vertex-coloured parts folded into a white family material by `kit.js colourFamily`) instead of
  one InstancedMesh per prop type and material; instances are frustum-culled one by one for the camera and the shadow
  cameras. alloc / release / writeItem / writeColor unchanged; props still burn, break and are picked up.
- **Far cliffs in one batch** (`world/landforms/cells.js`): the far (lo) version of every 128 m cliff cell lives in one
  BatchedMesh (one instance per cell, per-instance culling); near cells stay one mesh each. Spell craters still shift /
  shatter pieces (the edit goes to the cell's range in the batch and drops its cached bounds).
- Warm-up: nothing to add; it walks the scene, and the family materials / batches are scene objects (`'b'` key for
  BatchedMesh in `render/warmup.js`). Programs: 150–154 before, 143–147 after (with the other two passes' changes).

Main draws (1920×1080 'high', `dynres=0`, same camera; "mine" = the owner rows of structures, props, landforms and the
lantern / chest / altar sets among the top-40 owners; the totals include the two other passes running in parallel):

| scene | main before → after | mine before → after | shadow before → after | tris main before → after |
|---|---|---|---|---|
| w_town_above | 747 → 348 | 403 → 179 | 0 → 0 (not refreshed that frame) | 3.43 M → 3.12 M |
| w_town_street | 655 → 324 | 315 → 147 | 0 → 0 | 3.21 M → 2.94 M |
| t15_fox_village | 656 → 371 | 297 → 146 | 476 → 108 | 3.12 M → 3.10 M |
| t14_village_wide | 698 → 339 | 300 → 119 | 412 → 103 | 3.29 M → 2.96 M |
| t30_dango_stall | 660 → 311 | 283 → 109 | 426 → 217 | 3.30 M → 2.92 M |
| g1 shrine forecourt | 283 → 191 | 114 → 77 | 154 → 192 | 2.19 M → 2.30 M |
| g4 village house | 563 → 294 | 246 → 111 | 470 → 222 | 3.14 M → 2.90 M |
| g6 town night | 630 → 313 | 269 → 125 | 0 → 0 | 3.36 M → 3.06 M |

Shadow counts depend on which cascades refresh in the captured frame (two runs of one build gave 204 / 226 and 104 /
213 at the same camera), so read them as a range. Picture: static-pixel PSNR before / after 32–42 dB at 6 of the 8
cameras (`tools/devkit/draws-world/mpsnr.mjs`; mask = pixels that differ between two runs of the same build: grass, fireflies,
NPCs; the same-build floor itself is 21–33 dB unmasked); g6 and town street read ~25 dB because of things that move
between runs and were absent from the noise pair (a dragonfly, butterflies, the region title fading in), not the
buildings (checked by eye on the pairs, `.tmp/draws-world/p8_*.jpg`, `p9_g4.jpg`).

Left (small, or not this pass's files): `gameplay/mechanics.js` objects (≈25–30 draws at the village, 6 meshes each,
`baked/Mesh` at 300 m+); floating isles' rocks (≈18 at the fox village, could use the same far batch); pickups (2–3 draws
each, not instanced); an offline per-block palette bake of the town would let far blocks drop their vertex-colour merge
at boot.

## Draw-call pass — characters, creatures, contact shadows (2026-11-14)
Owner files: `actors/celmerge.js` (new), `actors/celmat.js` (merged cel material), `actors/rig.js`, `actors/creature.js`,
`core/assets.js` (character cook only), `story/npcs.js` (spawn / tone edits). Counts, not times (film crew on the GPU).
Harness: `tools/devkit/draws-cast/counts.js` (renderBufferDirect hook, 4-frame average per pass, actor rows by root name,
1920×1080 high, `dynres=0`, frozen time); before = `?castmerge=0&blobbatch=0` in the same tree, so the other two passes'
changes are in both columns. Details: docs/api/actors-look.md "Draw-call pass".

What changed:
- **One character = 5 draws near, 2 far** (was ~19 colour + 2 outline). At load (`celify`, after outlines and the shadow
  proxy) the cel parts merge into `cel:body` (every opaque part without morphs: skin, garments, hair, add-ons; two-sided
  with one-sided parts' back faces discarded per slot), `cel:face` (Face, FaceMouth, EyeWhite, EyeIris + morphs) and
  `cel:decals` (FaceLines, EyeHighlight, HairBack; transparent, single pass). Per-vertex slot id, per-slot uniform arrays,
  maps in up to five texture arrays (one per map size, no resampling). Outlines stay two (body hull, morph face hull).
- **Distance**: beyond 25 m (1 m hysteresis) `cel:body_far` (body + face at rest in one draw) + `cel:decals_far` (HairBack);
  body outline off beyond 30 m, face outline beyond 22 m. Folk / cast NPCs created with `animLod` pose every 2nd frame
  beyond 60 m, every 4th beyond 100 m (summed step, the heroine never).
- **Shadow**: the merged shadow proxy now includes the morph face: one shadow draw per cascade per character.
- **Animals**: untinted asset-pack animals fold each part's colour (× its vertex colour) into one vertex-coloured cel
  material per compatible set: cow 8 → 3 draws, frog 5 → 2, koi 6 → 3. Sculpted animals were already 2.
- **Contact-shadow blobs**: every `makeActorShadowBlob` was its own transparent draw (one per actor, creature, enemy,
  NPC); now one InstancedMesh draws all live blobs (`?blobbatch=0` = old).
- Off: `?castmerge=0` (characters + animals), `?blobbatch=0`, or `?perf=0` (everything).

| scene | main before → after | actor main | shadow before → after | actor shadow | tris main (M) | programs |
|---|---|---|---|---|---|---|
| w_village_10npc | 535 → 343 | 249 → 71 | 152 → 160 | 51 → 36 | 3.34 → 3.34 | 157 → 148 |
| t14_village_wide | 433 → 321 | 144 → 44 | 167 → 172 | 43 → 28 | 2.96 → 2.92 | 155 → 148 |
| w_town_street | 433 → 314 | 151 → 39 | 0 → 0 | 0 → 0 | 2.92 → 2.92 | 157 → 148 |
| w_boss_fight | 216 → 185 | 43 → 14 | 0 → 0 | 0 → 0 | 2.36 → 2.36 | 159 → 149 |

Shadow totals depend on which cascades refresh and on the flora caster switch (non-actor shadow draws moved ±40 between
runs of one build); the actor share is the number to read. Triangles are unchanged by design (same meshes, fewer draws).

Picture: same-run A/B (`tools/devkit/draws-cast/abchars3.js`, `?castab=1` keeps an unmerged clone, frozen time, same pose):
face close-ups 44–45 dB (character crop) with the `joy` morph on, bodies 44 dB (kokonoe, villager_a), 38–45 dB for the
heroine below the region banner. Golden shots before / after: raw PSNR equals the same-build noise floor (g1 24.1 vs
24.6, g3 21.6 vs 21.2, g4 25.7 vs 24.9, g8 37.8 vs 27.1); static-pixel PSNR 31–45 dB (`tools/devkit/draws-cast/mpsnr.mjs`).
Cast line-up day / night: 19–27 dB raw, all of it NPC idle poses and fireflies (checked by eye; same costumes, shading,
outlines).

Left: carried props on NPCs (2–3 draws each: baskets, dishes, the heroine's lantern) are props, not merged here;
enemies keep their parts (tints key on part names: a multi-slot tint path in creature.js would cut bats / serpents /
squids 5–8 → 2); the boss shade and duelists merge like the cast. An offline bake (one atlas + slot id per character
in the GLB) would remove the ~2 s of load-time merging (`G.assets.celMs`).

## Final measurement after the draw-call pass (2026-11-14, quiet machine)

Method as above (`node tools/perf.mjs --label ship --tiers high,med,low --runs all`, fixed resolution, 42 scenes; the raw
tables lived in the scratch area and were deleted with it). base0 = before any pass; "prev" = after the first frame pass.

| tier | frame p50 mean (ms) base0 → prev → now | serial | script | main draws | worst scene now |
|---|---|---|---|---|---|
| high (2160×1350, 4× MSAA) | 25.7 → 22.9 → **23.0** | 32.3 → 27.5 → 25.9 | 9.1 → 6.4 → 5.1 | 649 → 643 → 346 | town from above 34.9 |
| med | 18.6 → 17.1 → **18.3** | 24.5 → 20.1 → 20.1 | 10.9 → 5.8 → 5.0 | 512 → 504 → 329 | town from above 23.7 |
| low | 16.7 → 16.7 → **16.7** | 15.6 → 15.4 → 14.7 | 4.9 → 4.3 → 3.9 | 488 → 480 → 250 | all at vsync |

- **The draw-call pass halved the draws and the script time and the frame on 'high' did not move: 'high' is GPU-bound now.**
  36 of the 42 scenes are over 17.5 ms on 'high' (about 43 fps on average), 22 on 'med' (about 55 fps), none on 'low'.
- It is not simply pixels. With dynamic resolution on (`--params "dynres=1" --settle 6000 --frames 120`) 'high' settles at its
  floor (pixel ratio 1.16, 60 % of the pixels) and still averages 23.5 ms (sprint through the village 23.5 ms p50, the fall
  from a sky isle 29 ms); 'med' with dynamic resolution: 17.8 ms mean, worst 22.9.
- Per-layer A/B on 'high' at the meadow (serial ms): 4× MSAA 3.3, AO 2.1, characters 1.9, grass 1.6, terrain 1.2, landforms 1.0,
  structures 1.0, water 0.9, cascade 1 0.9, bloom 0.7 — no single layer explains the 23 ms; the floor is wide. At the town from
  above one (noisy) run showed the structures layer at about 30 ms for 406 k triangles and the terrain at 8.5 ms: suspected
  causes, not confirmed: overdraw inside the merged blocks (merged meshes are no longer sorted front to back) under an expensive
  lighting hook with 4× MSAA.
- **Not done:** a GPU-side pass (price the lighting hook per term, a depth pre-pass or front-to-back order inside merged batches,
  cheaper far-cascade filtering, sub-pixel triangle cuts). The first-start auto-pick still chooses 'high' on this machine
  (score 0.42 ms / MP): expect 40–50 fps in ordinary play on 'high', 55–60 on 'med'.

## GPU pass (2026-11-16) — what the GPU time is, what was cut, the new tier

One engineer alone on the machine; the pass was stopped before its final three-tier table because the laptop's GPU had
heat-soaked after ~1.5 h of continuous runs (the same build measured up to +5 ms slower late in a run than early: absolute
tables need a cooled machine, comparisons must be interleaved). The working notes with every table are kept verbatim in
`docs/api/perf.gpu-pass-notes.md`; the story acceptance passes on the resulting tree (ALL PASSED, 2026-11-16).

**Where the time goes on 'high'** (2160×1350, 4× MSAA; serial ms; meadow unless said):
- Frame 23.8 = main pass 15.3 + post chain 7.4 + shadow maps ~1.3 (depth-only passes are cheap on this GPU:
  464 k / 819 k / 1150 k triangles for +0.4 / 0.3 / 0.6 ms).
- Main pass = about 8 ms that does not scale with pixels (raster + vertex 5.6, vertex outputs 1.8) + 2.2 ms per megapixel
  of shading. The lighting hook is the shading: 7.9 ms (2.8 per-triangle quad overhead on small triangles, 5.1 per pixel);
  the shadow taps alone 2.7 ms. A flat-colour hook would render the same frame in 5.4 ms.
- Post chain: GTAO 3.5 (sample-bound: 12 → 6 samples halves it), grade 1.6 (0.8 without the sharpen taps), bloom 0.9,
  denoise 0.7, shafts 0.6, composite 0.8, AO normals 0.5.
- By layer (main pass, hide one): grass 2.4 (532 k tris), characters 1.7, far-tree impostors 1.0 (one draw), terrain 0.9,
  sky 0.6, props 0.5, landforms 0.4, structures ~0 at the meadow; at the town from above terrain 4.1, structures 2.3,
  props 1.4 (the "30 ms for structures" of the earlier noisy run was wrong). Overdraw is not the problem: the tile-based
  GPU hides opaque overdraw; only alpha-tested materials pay.
- Resolution: main / frame at pixel ratio 1.5 → 1.0 → 0.75 → 0.5 = 14.5 / 23.1 → 11.5 / 15.8 → 10.0 / 12.7 → 8.7 / 10.5.
  MSAA 4 → 2 buys almost nothing; 4 → 0 about 1–2.5 ms.

**Cut, without changing the picture** (all behind `?gpu=0`; golden shots and six tour cameras old vs new are within the
run-to-run noise, 300 % crops identical; one bug found and fixed on the way: the bloom add used rgb × a under a
premultiplied blend):
- shadow coordinates computed per fragment where it saves varyings, and the contact term early-outs (`MV_SC_FRAG`);
- the distance haze early-outs exactly for the first 15 m;
- tone mapping done once in the grade pass (`gpuGrade`) instead of per sharpen tap.
Interleaved A/B, frame serial: meadow 22.2 → 20.0, dusk forest 24.3 → 21.6, village 20.5 → 18.9, town from above 22.7 → 20.4.
Full fixed-resolution run right after the cuts (label gpu1): 'high' mean frame p50 **20.8 ms** (was 23.0), 11 of 42 scenes
at 60 fps, worst 27.6 (town from above).
Tried and dropped: a 5-of-9 shadow-tap early-out (no gain), half-resolution AO depth and a reordered GTAO loop (no gain).

**Decision: 'high' at pixel ratio 1.5 cannot hold 60 fps on this class of machine without changing the picture.** A new
step between 'med' and 'high': **'highfast'** — everything 'high' has, at pixel ratio 1.25 (settings name 「浓彩·流畅」, Rich Colour · Smooth;
`QUALITY.highfast` in `src/core/boot.js`). Measured (label gpu1_pr125): mean frame p50 **17.2 ms**, 31 of 42 scenes at
60 fps, worst 20.3. The first-start auto-pick (`src/render/gpubench.js`) now gives 'high' only to a GPU clearly faster than
this one (score ≤ 0.7 × REF), 'highfast' up to 1.8 × REF, then 'med', then 'low'; the settings menu lists all four.

**Still open:** the final table of all four tiers on a cooled, quiet machine, with dynamic resolution on and off
(`node tools/perf.mjs --label <name> --tiers high,highfast,med,low --runs all`); GTAO at 6 samples on 'highfast' (−1.5 ms) if
a later picture round needs the room; grass and the lighting hook's per-pixel cost remain the two largest items — any new
full-screen pass (ink line, distortion) must be paid for there or stay at the AO pass's resolution.
New tools: `tools/perf/gpuprobe.js` and `node tools/perf.mjs --probe …` (per-pass, per-term, resolution-sweep and overdraw probes).

## Phones (mobile round 2, 2026-11-23)

Players reported phones "very blurry" and "stuttering". Cause: a phone got 'low' at pixel ratio 1 (390 rendered lines on a
3× screen of 1170, 0.33 MP stretched 3× by the browser; dynamic resolution took it down to ~0.19 MP), and it ran
uncapped, so a handset that could not hold 60 fps alternated 16 / 33 ms frames.

**The 'mobile' tier** (`QUALITY.mobile` in `src/core/boot.js`, settings key `mobile`, label 「掌上」, Handheld). Picked automatically on a
phone / tablet (`gpubench.js mobileDevice()`) when the player never chose a tier; an older automatic pick (the old phone
'low', a desktop probe result) is re-picked; a tier chosen in settings is kept (the settings panel clears
`settings.qualityAuto`). On a handheld the settings row lists 「掌上」 「素描」 (Sketch) 「淡彩」 (Light Colour) 「浓彩」 (Rich Colour) ('highfast' is a desktop-GPU step).
Systems see `name: 'low'` and inherit every low cut; `G.quality.mobile` adds:

| knob | where | mobile | low |
|---|---|---|---|
| rendered lines (short side) | `core/boot.js` `minLines` | 1080 by default (pixel ratio 2.77 at 844×390 @3×, 2.52 at 932×430; the device ratio when the screen has fewer lines), 900 / 720 only as the last dynamic-resolution steps. Every tier on a handheld gets this default. Since phone memory round 2 the mobile tier renders at most 2.0 MP (`maxMP`; ~960 lines on a 19.5:9 phone) unless 「保持 1080」 is on. | 390 |
| AA / sharpen / shafts | `world/sky.js` `PRESETS.mobile` | none / 0 / off (two full-screen passes fewer; judged on 1:1 crops) | FXAA / 0 / on |
| sun shadow | `render/shadows.js` `TIERS.mobile` | 1 cascade, ±40 m, 1024 | 2 cascades (±24, ±110 m) |
| shadow taps | `world/sky.js` `setGpuHook({ tap })` | early-out on (`?gputap=0` off) | off |
| clouds | `render/skydome.js` | 8 steps, layer ≤ 320 px wide, probe 96 | 10, 400, 128 |
| grass / flowers | `world/flora/grass.js` | outer ring 104 m, sparser flower rings, density 0.35 | 136 m, 0.5 |
| trees | `world/flora.js` | impostor swap 0.62×, scenery 340 m, flora shadows 26 m, impostor shadows 60 m | 0.72×, 440, 30, 100 |
| places / city blocks / small objects | `world/structures.js`, `builders/bellcrown.js` | NEAR 100 m, city blocks 40 m with coarser stand-ins (cell 1.3), `cull` / `standIn` distances × 0.7, building casters 44 m | 120, 48 (1.0), × 1, 58 |
| water mirror | `world/water.js` | ≤ 400 px, every 4th / 12th frame | 530, 3rd / 9th |
| crowds, fx, life | `QUALITY.mobile` density 0.35, particles 0.4 | | 0.5, 0.5 |

**Frame pacing** (`render/dynres.js` `createPacer`, `G.pace`). On a handheld, after 3 s of play the next 5 s run capped at
60; a device that clearly holds it (mean ≤ 17.4 ms, ≤ 10 % of frames over 20 ms) keeps 60, any other is capped at 30
for the session (two over-budget seconds at 60 later also drop it). The limiter skips display refreshes in the main loop
(`gate(now)`); 60 / 90 / 120 Hz screens all land on 33.3 ms. `?fps=30|60|0` forces a cap on any tier.

**Dynamic resolution on a handheld: scene cost first, lines last.** Its budget follows the pacer (33.3 ms at the cap).
Steps (`MOB_LINES` / `MOB_LITE` in `core/boot.js`, any tier on a handheld): 1 = `'perf:lite'` level 1 (water mirror off,
outermost grass and flower rings hidden); 2 = level 2 (also the painterly surface detail and the drifting cloud shadows,
`mvQ.x` / `mvQ.z`); 3 = 900 lines; 4 = 720 lines (pipeline render scale, the canvas keeps its size, the edge-aware
upscale + CAS draws the last pass). Steps 1–2 follow the usual rule (two 1 s windows over 1.14 × budget); a lines step only
when lite 2 is on AND frames stay over 40 ms (< 25 fps at the cap) for 4 s (`stepRule` in `render/dynres.js`). Recovery
is one step per quiet spell (8 s, doubling if it pumps), deepest first: lines back to 1080 before the lite levels lift.
Settings 「保持 1080」 (Keep 1080; `settings.keep1080`, default off, row shown on handhelds only): `G.dynRes.limit = 2`, the lines
never drop, lite levels still do. Checked with a simulated slow phone (a `.tmp` script spinning 45 ms inside `renderFrame`
after a 24 ms trial → cap 30): lite 1 after 2 s, lite 2 after 4 s, 900 lines after 10 s, 720 after 14 s, held; quiet → 900
after 8 s, 1080 after 16 s, lite 0 after 32 s; with keep1080 on the same load stops at lite 2, 1080 lines.

**Bug fixed on the way** (`world/sky.js`): any settings write (a volume slider, the touch button size) switched AO and
sun shafts on for 'low' (and AO for 'med') until the next reload; the settings now only switch off what the tier has.

**Measured** (`node tools/play.mjs --mobile --size 844x390 --dpr 3`, scenes hometown 2220,50 · moor 1340,-110 · wilds
180,-208 · city gate -2160,-430 · street -2160,-540 · a grass fire in the wilds; draws / tris = median frame; GPU shared
with other jobs, so time is indicative). Before = 'low' (what phones got), after = 'mobile':

| scene | MP before → after | draws | k tris |
|---|---|---|---|
| hometown | 0.33 → 2.52 | 464 → 450 | 1206 → 1172 |
| moor | 0.33 → 2.52 | 296 → 288 | 987 → 959 |
| wilds | 0.33 → 2.52 | 219 → 217 | 1039 → 1003 |
| city gate | 0.33 → 2.52 | 321 → 322 | 1108 → 1052 |
| city street | 0.33 → 2.52 | 280 → 267 | 1139 → 1012 |
| fire | 0.33 → 2.52 | 218 → 218 | 1043 → 991 (fx 151 → 126) |

At 932×430 @3×: 0.40 → 2.54 MP (2348×1083), same draws / tris. Desktop 'high' A/B against a copy of the tree without
these changes (wilds, city gate; 1440×900 @2×): 251 / 456–461 draws and 1.89 / 2.37 M triangles in both. Per-layer A/B (meadow, `tools/perf.mjs --layers`): grass
130 → 97 k tris, flora 48 → 25–33 draws, structures 108 → 87 k tris. Script time per frame did not change (~1–2 ms
updates + 3–4 ms render submit on the M5).

**Honest cost.** 1080 lines is 7.7× the pixels phones rendered before. On the M5 the mobile tier's serial frame at
2.5 MP is ~10–13 ms (GPU split: main pass ~10–12 ms of which the lighting hook ~6–8 ms, post ~1.5 ms); the per-pixel
switches it has (shadow taps, cloud shadows, detail, fog…) together are ~15 % of the main pass, the rest is the base
shading of the hook. A phone GPU is ~2.5× (recent iPhone / flagship Android) to ~8× (mid-range Android) slower: the
first hold 30 fps at 1080 lines; the last fall back to 720 lines (0.45× the pixels of 1080: ~20–25 fps estimated) and
would need a cheaper path through the lighting hook to reach 30.
**Left (other owners):** `src/gameplay/pickups.js` draws every pooled pickup always (zero-scale instances: ~100 k
triangles a frame, the heart alone 76 k) → set `InstancedMesh.count` to the live high-water mark; `src/gameplay/wilds-puzzles.js`
puzzle chests are never culled (9 draws each, drawn 3–4 km away: ~80–100 draws at the hometown) → wrap in a holder and
`G.structures.cull(holder, pos, 220)` like `collect.js`.

## Font subsets (2026-11-25)

The boot downloaded three full TTFs through `src/core/fonts.js` (LXGW WenKai Lite 13.9 MB, Ma Shan Zheng 5.9 MB, Zhi Mang
Xing 4.1 MB; GitHub Pages gzips them to about 14.8 MB on the wire). All four zh-CN faces now ship as WOFF2 subsets of the
characters the game shows in them (`tools/font-subset.mjs`: every string in `src/locales`, the credit rows of
`assets/manifest.json`, printable ASCII and the typographic marks in its EXTRA list; the HTML shell uses system faces).

| | before | after |
| --- | --- | --- |
| fonts fetched at boot (`play`, `performance` resource entries) | 24,398,776 B (3 TTF + the serif subset) | 1,956,568 B (4 WOFF2) |
| whole boot on the dev server (unminified `game.js`, 251 requests) | 100,127,495 B | 77,685,430 B |
| fonts on the wire from Pages (TTFs gzipped) | ≈ 15.3 MB | ≈ 1.96 MB (WOFF2 is already compressed) |

Per face: MV WenKai 331 KB, MV Brush 616 KB, MV Running 448 KB, MV Serif 516 KB (unchanged).
- `node tools/font-subset.mjs --check` reads each shipped WOFF2's own character map (pure JS: the table directory, the
  brotli stream, cmap format 12 / 4), so it needs no Python and also catches a character the source never had. It exits 1
  when a locale character is missing from a face. Characters a face's SOURCE lacks are recorded by the rebuild in
  `tools/font-subset.gaps.json` and fall back to the next face in the stack (the brush and running hands have no arrows,
  stars or 「糬」「納」; the kai and the serif have no ✦✧): the check lists them and does not fail on them.
- Rebuild: `node tools/font-subset.mjs [serif|wenkai|brush|running …]` with fontTools + brotli (`FONTTOOLS_PY`). The three
  hand-lettered faces rebuild from the full TTFs kept in `assets/fonts/zh-CN` (not loaded by the game; the trailer editor
  renders captions from them); the serif needs `--src serif=NotoSerifSC[wght].ttf` (not in the repo).
- The release copy still ships the full TTFs with the rest of `assets/` (hosted, never fetched by the game).

## Loading on a bad network (2026-11-25)

Players (mostly mainland China, Windows laptops, the game over GitHub Pages) reported a boot bar that "always gets stuck"
(one waited 20+ minutes), a heroine who was a white capsule with a dark ball head for the whole game, clothes that would
not change, and asked whether the game can load in the background. Reproduced with `tools/play.mjs` (new switches:
`--throttle kbps,latency`, `--fault sub:stall|fail[:n]`, `--hidden`, `window.__mvFaults('off')` from a script).

### Causes (confirmed)
1. `core/assets.js` `loadModel()` used a bare `fetch()`: no timeout, no stall check, no retry. `init()` awaited
   `Promise.all` over every preload model, so ONE connection that stopped sending held the boot forever (bar frozen at
   34.9 %, `--fault elaina_apprentice.glb:stall`).
2. All ~400 requests went out at once. Over HTTP/2 they share the line, so almost nothing finished until the end: on an
   8 Mbit/s link the bar sat at 2–6 % for 45 s and crawled 26 → 34 % over the next 70 s (a player on 1 Mbit/s sees eight
   times that). The bar counted finished files, not bytes.
3. `load()` kept a failed promise (`null`) in its cache: every later `load(id)` returned `null` at once. One failed
   request for her model = `createActor()` built the primitive stand-in (`placeholderModel()`, the capsule) and nothing
   ever swapped the real one in; `setOutfit()` failed in 19 ms every time (cause of the "outfit does nothing" reports).
4. `world/terrain/textures.js` fetched the 6 MB terrain cache (`assets/_terrain_cache/*.gz`) the same bare way during the
   terrain system's init: an error fell back to computing the field, a stall held 「铺开山川……」 for good.
5. A background tab gets no animation frames: the shader warm-up (`render/warmup.js` waited for `requestAnimationFrame`)
   stopped until the player came back to the tab, and `boot.js` yielded between systems with a 0 ms timer (one second
   each in a background tab).

### What changed
- **One network queue** (`core/assets.js`, "network"): at most 8 requests at a time + 4 for files under 160 KB over
  HTTP/2 or 3 (`navigation.nextHopProtocol`); 5 + 1 over HTTP/1.1 (the browser's 6 connections per host: more would wait
  in the browser's pool with no byte and be taken for stalled). The body is read as a stream; 18 s without a byte
  (connect, headers or body) aborts it. Stalled or failed requests are tried again after 1.5 / 3 / 6 / 12 / 20 s, 4 tries
  (her model 8); 404 / 410 are final. A load that still fails is **not cached**: the next `load(id)` starts over (5 s
  cool-down). Textures retry on error too. `G.assets.fetchUrl(url, { tries })` gives files outside the manifest the same
  path: the terrain cache uses it with one try, so a stall falls back to computing the field like an error does.
- **Order** (`bootOrder`): her model for this save (the save's outfit, `?outfit=` wins) + `anim_ual` / `anim_miko` (8
  tries) → her other outfit → the story cast near the save's position (`data/journey-cast.js castNear`) → every
  non-character preload model (the world builds from them) → the other people's models. The boot waits for all but the
  last group, and a file that keeps failing only costs its tries. The other people (≈ 38 MB, used by foes and duels)
  come with `G.assets.stream()` once the world is ready (boot.js), behind on-demand loads.
- **Honest bar**: `G.assets.progress()` = bytes of the boot set against the real file sizes (`build.mjs assetBytes()` →
  `__ASSET_BYTES__`); the line reads `core.boot.bytes` (「正在取出行囊…… 12.3 / 108.4 MB」) and `core.boot.retry` while a
  file is being fetched again.
- **Self-healing actors** (`actors/rig.js`): an actor built from the stand-in asks for its model (`G.assets.want(id)`,
  cheap per frame); `actor.placeholder`; `healActor(old, opts)` builds the real one, `adopt()`s the stand-in's state and
  the fields its owner keeps on it, takes its place and frees it. Foes heal in `combat/enemy.js render()` (a stand-in is
  never pooled); the heroine through the wardrobe's own swap (heroine.md "Wardrobe", step 5). `ready(id)` is true only
  with the animation files the model borrows (`clipsFrom`), and `clips(id)` merges them only when all are in.
- **Background tab**: `warmup.js nextFrame` goes on at once (message task) while the page is hidden; `boot.js breathe()`
  uses `slice(0)`.

### Results (`play`, throwaway profiles)
Measured on a busy machine (load average 150–260: another session's browsers ran too), so times are one run each; the
before / after pairs that are compared ran side by side.

| case | before | after |
| --- | --- | --- |
| her model's connection hangs (`--fault elaina_apprentice.glb:stall`) | bar frozen at 34.9 % (「正在取出行囊……」) for good | stall noticed at 18 s, 「连接不稳，正在重新取……」, world ready at 50 s |
| her model's request is reset once (+ the witch outfit's) | capsule for the whole game; `setOutfit('elaina')` false in 19 ms; still a capsule 30 s later | retried once: her real model; `setOutfit` true in 98 ms |
| her model fails for minutes (`fail:999`, then `__mvFaults('off')`) | (capsule for good) | the game starts with the stand-in after its tries; real model 2.7 s after the connection is back (`wardrobe.heals` 1) |
| a foe's model stalls three times (`char_villager_c:stall:3`) | (capsule foe) | the boot did not wait for it; the foe heals in place, its rogue dress and tint kept |
| 8 Mbit/s, 150 ms (`--throttle 8000,150`), first 45 s on the title | bar 5.5 → 5.9 % | bar 12 → 24 %, 「… 26.2 → 66.2 / 107.0 MB」 |
| same link: models in / world ready (ms from navigation) | 176,585 / 217,414 | 138,573 / 182,265 |
| the terrain cache's connection hangs (`--fault _terrain_cache:stall`) | held at 「铺开山川……」 (still there 210 s after the stall when the run gave up) | dropped after 18 s, the field computed (terrain init 27.0 s; 2.2 s from the cache), game started |
| boot in a background tab (`--hidden`) | not ready after 300 s (held at 「正在唤醒大地……」, the warm-up) | ready after 29 s while hidden |
| boot set (normal boot, high tier) | ≈ 146 MB, ≈ 400 files | 108.4 MB, 378 files; the other people's 46 MB after |

On the dev server (HTTP/1.1) `G.assets.net.peak` = 6; a normal boot makes no retries.

## Phone memory (2026-11-26)

The director opened the live site in iPhone Safari (4G): boot screen, at ~13 s the 「把手机横过来吧」 card, at ~30 s Safari
replaced the page with "A problem repeatedly occurred". That is iOS killing the tab's web content process twice, for
memory. Nobody had tried a real iPhone before; dad7567 (before that day's merges) and ae1a808 (before #51) measure the
same as main (table below), so it is not a regression of #46 / #47 / #51 / #52 / #58.

### Cause
The mobile tier loaded what a desktop loads: every preloaded model (396 GLBs, 153 MB), including the 18 other people's
character models the boot streams in after the world is ready (`G.assets.stream()`) although almost none of them stand
anywhere near. Each character is ~12 MB of cel texture arrays on the GPU (`actors/celmerge.js`) + ~7 MB of geometry
(outlines, merged parts, shadow proxy) + its decoded images. On top: four decoded music tracks and eight ambience beds
(PCM, 35–75 MB a track: ~230 MB), every audio file's compressed bytes kept, and the same palette images decoded again
for every prop that embeds them (407 embedded images, 275 different).

### What changed (phones only: `G.quality.mobile`; desktop tiers unchanged)
- **People on demand** (`core/assets.js` `bootOrder` / `stream`): no other people's models at boot or after it; an actor
  asks for its model when it is created (`rig.js createActor` → `want()`, `healActor` swaps it in; foes in
  `combat/enemy.js render()`, the cast / errand folk wait for `load()`). The story cast standing near the save still
  loads at boot. Only the outfit she wears is loaded; the wardrobe loads another when she changes (its wait now keeps a
  load going: `want()`).
- **Let go when nobody shows it** (`hold` / `drop` / `letGo`): `createActor` holds a person's model, `dispose()` drops it;
  a model dropped by every actor for 60 s (`MOB.releaseMs`, swept every 10 s) is let go: its geometry, cel texture
  arrays and decoded images are freed and the parsed copy forgotten; the next actor of theirs loads it again (the cast
  erases its actors beyond 165 m; `combat/enemy.js` frees a pooled foe actor nobody reused for 60 s, checked on any
  foe's build / dispose). Materials are not disposed (some, like the outline material, are shared by every character).
  `G.assets.held()` / `releaseIdle()` for tests.
- **Images**: model images over 512 px (hers: 1024) are scaled down once at load, before the cel merge packs them
  (`capImages`); a picture the world's models embed several times is decoded once and shared (`shareImages`, SHA-1 of
  the embedded bytes → one three.js `Source`). People keep their own images, so letting one go never closes a shared one.
- **One parse at a time** (`MOB.parse`): parse + cel cooking of several models no longer stack their peaks.
- **Audio** (`audio/audio.js` `LRU_MOBILE`): one decoded track (a fight: its track and its layer), two ambience beds; a
  deck that has faded out lets its track go at once (a track decoded but not yet started — a fight's track waiting for
  its layer — is kept 10 s); the asset store does not keep the compressed bytes. Also fixed for every tier: `evict()`
  removed entries from the list it was walking, so it skipped one and could drop the newest track.

### Measured
Headless Chrome (`tools/cdp.mjs`) with the phone emulation of `play.mjs --mobile` (touch, `mobile: true`, dpr 3, the
mobile tier picked by itself), held upright at boot (390×844: the turn card), turned sideways once the world is ready
(844×390), 20 s walking + 40 s flying, sound on, local server. JS heap = CDP `Runtime.getHeapUsage` used size;
ArrayBuffers = its `backingStorageSize` (geometry arrays, decoded audio, Rapier's wasm memory); GPU estimate = every
texture / buffer / renderbuffer allocation hooked at the WebGL call (per mip level, freed on delete) + the canvas × 3;
decoded audio = the audio cache's decoded ids × their PCM size; footprints = macOS `footprint` of Chrome's renderer and
GPU processes (Chrome's own overhead included; not what iOS counts, but the same direction).

Boot on the local server (one run each; the dad7567 run predates the audio-cache column):

| MB | dad7567 | ae1a808 | main 29c845d | this branch |
|---|---|---|---|---|
| world ready (s) | 6.8 | 6.5 | 6.3 | 7.4 |
| models parsed (GLB MB) | 395 (150) | 395 (150) | 396 (153) | 377 (102) |
| JS heap peak | 226 | 200 | 189 | 214 |
| ArrayBuffers peak (geometry, PCM, wasm) | 619 | 613 | 752 | 512 |
| GPU estimate peak (of it textures) | 639 (495) | 639 (495) | 646 (502) | 389 (245) |
| decoded audio peak / at the end | – | 230 / 230 | 230 / 230 | 117 / 84 |
| **JS heap + GPU, peak** | **864** | **825** | **827** | **604** |
| **JS heap + ArrayBuffers + GPU, peak** | **1483** | **1438** | **1579** | **1116** |
| same, after the minute of play | 1460 | 1398 | 1418 | 1037 |
| Chrome renderer footprint peak | 2015 | 1964 | 2131 | 1489 |
| Chrome GPU process footprint peak | 1180 | 1209 | 1177 | 886 |

The same over a 4G-like link (`Network.emulateNetworkConditions` 20 Mbit/s, 80 ms; 30 s of play; footprints not sampled
often enough on this run to quote). On main the GPU estimate climbs from 333 to 646 MB in the 25 s after the world is
ready, while the other people's models stream in. One parse at a time costs nothing on this link (on the local server
~1 s: world ready 6.3 → 6.6–7.4 s):

| MB | main, 20 Mbit/s 80 ms | this branch, same link |
|---|---|---|
| world ready (s) | 58.2 | 56.7 |
| models parsed (GLB MB) | 396 (153) | 377 (102) |
| JS heap peak | 194 | 160 |
| ArrayBuffers peak (geometry, PCM, wasm) | 623 | 481 |
| GPU estimate peak (of it textures) | 646 (500) | 389 (245) |
| decoded audio peak / at the end | 230 / 230 | 117 / 84 |
| **JS heap + GPU, peak** | **824** | **549** |
| **JS heap + ArrayBuffers + GPU, peak** | **1447** | **1029** |
| same, after the minute of play | 1401 | 1020 |

Where the rest goes now (after the minute, phones): City of Magic geometry ~81 MB (CPU copies, built for the whole map at
boot), the terrain data texture 2560² RGBA16F 52 MB CPU + 52 MB GPU (craters rewrite it, ground queries read it),
Rapier's wasm ~66 MB, the raw sculpt models' geometry ~28 MB, the post targets at 1080 lines ~50 MB GPU, the flora
impostor bake targets ~55 MB GPU (their depth buffers stay after the bake), four people (her + the cast at home) ~40 MB
of geometry + ~25 MB of cel arrays. iOS itself was not measured here; the director's iPhone is the real test.

## Phone memory, round 2: long play (2026-11-26)

After round 1 the director's iPhone (17 Pro Max) booted fine, but "after playing for a few minutes it goes back to the
loading page": iOS threw the tab away once during play and Safari reloaded it.

### What grew (main beb7a3c, 9 minutes)
Same harness as round 1, landscape at the iPhone's size (956×440 CSS px, DPR 3: canvas 2351×1082, pixel ratio 2.46), a
scripted journey: hometown walk → broom flight towards the City of Magic → market walk → a fight with several foes → the
fire page trial → flight over the open country → idle. JS heap + ArrayBuffers + GPU estimate went from ~1050 MB at home
to ~1390 MB after the city and the fight and never came down:
- **GPU geometry**: three keeps every buffer it ever uploaded. Uploaded geometries 517 → 964, GPU buffers 83 → 207 MB.
- **The City of Magic's life**: the flyers' / crowds' baked bodies (+41 MB of geometry) and the residents' pool of them
  (+39 MB), built when she nears the city, hidden but kept after she leaves; their GPU buffers on top.
- **Foes**: pooled foe actors keep their people's models (round 1's pool drain only ran when a foe was built or
  disposed): +27 MB of cel arrays after the fight.
- **Audio**: a fight decodes its track and its intensity layer (~77 MB).
- Flat, but big: render targets ~167 MB at 1080 lines (two full-size half-float targets, depth texture + a depth
  renderbuffer nobody reads, the impostor atlases with their bake-only depth buffers 2 × 11.8 MB, shadow map, detail
  layers), the terrain data texture (52 MB CPU + 52 MB GPU), the scorch layer (26 MB GPU), the City's static geometry
  (81 MB CPU), Rapier's wasm memory (~74 MB).

### What changed (phones; desktop tiers unchanged)
- **GPU residency** (`render/residency.js`): every draw stamps its geometry (`renderBufferDirect` wrapped: main pass,
  shadow maps, mirror); geometry not drawn for 60 s is disposed — GPU side only, three uploads it again from the CPU
  arrays (every geometry keeps them) the next time it is drawn. `G.residency.stats()`; `?residency=0` off.
- **Memory budget** (`core/membudget.js`, `G.mem`): every 5 s, resident geometry + decoded audio + people's models
  against 320 MB; over it, the least recently used goes sooner: idle people's models at once, every decoded buffer that is
  not playing (`G.audio.trim()`), geometry not drawn for 15 s. `G.mem.stats()`; `?membudget=0` off.
- **The City's life**: let go a minute after she is beyond 2 km, baked again within 1500 m (life.md "Phones");
  the residents' pool follows.
- **Foes**: `combat.js` drains the foe actor pool every frame (at most every 5 s): pooled foes nobody reused for 60 s go.
- **Render targets**: the mobile tier renders at most 2.0 MP (`QUALITY.mobile.maxMP`; 「保持 1080」 lifts it), the
  composer's targets have no depth buffer, the impostor bake's depth buffers are deleted after the bake.
- **Audio**: no intensity layer on phones.
- **Robustness**: a lost WebGL context (`webglcontextlost`: prevented, the journey written down; `webglcontextrestored`
  or 4 s without it) reloads into the game where she was (the cel arrays, impostor atlases and detail layers live only on
  the GPU); at most twice in three minutes. Autosave every 20 s on phones and when the page is hidden; a tab reloaded
  mid-play (sessionStorage flag, `G.save.resume`) skips the title, shows 「接着刚才的旅程……」 on the boot screen and
  continues the save. The menu's quit clears the flag. Old saves load unchanged (nothing new in the save).

### Measured
Same journey on main beb7a3c and on this round, run side by side (one run each; a forced GC before every phase
checkpoint; journey time from the first frame of play). JS heap + ArrayBuffers + GPU estimate, MB:

| phase | before: peak / at the end (GPU buffers) | after: peak / at the end (GPU buffers) |
|---|---|---|
| home | 1064 / 1062 (100) | 1026 / 1026 (105) |
| flyToCity | 1192 / 1190 (140) | 1177 / 1109 (104) |
| market | 1217 / 1202 (159) | 1131 / 1112 (121) |
| fight | 1426 / 1401 (172) | 1263 / 1163 (59) |
| page | 1374 / 1363 (173) | 1107 / 1101 (59) |
| country | 1350 / 1342 (174) | 1082 / 1049 (52) |
| idle | 1341 / 1341 (174) | 1050 / 1025 (50) |
| done | 1336 / 1336 (174) | 1019 / 1019 (50) |

| | main | round 2 |
|---|---|---|
| peak | 1426 | 1263 |
| mean over the last 2 minutes | 1342 | 1058 |
| GPU buffers at the end | 174 MB | 50 MB |
| geometries on the GPU at the end | 900 | 169 |
| render targets | 167 MB | 116 MB |
| canvas | 2351×1082 | 2084×959 |
| Chrome renderer / GPU process footprint, peak | 1296 / 844 MB | 1167 / 776 MB |

No upward trend any more: after the city and the fight the total comes back to where it started (~1.0 GB). What is left
is mostly the world built for the whole map at boot (JS heap ~150 MB; ArrayBuffers ~480 MB at home: the City's static
geometry 81 MB, the terrain data field 52 MB, Rapier ~74 MB, the raw world models ~57 MB, decoded audio 60–110 MB;
GPU ~300 MB: render targets 116, terrain data 52, scorch 26). Getting the steady state well under 800 MB needs the world
builders to stream regions instead of building the whole map at boot — not done here. Left levers, smaller: the
impostor atlases at a 64 px cell (−17 MB GPU), the scorch layer at 4 m texels (−39 MB; burn marks would blur), music
decoded at 32 kHz (−15 MB a track).
