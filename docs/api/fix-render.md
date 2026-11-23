# fix-render — as built

## Summary
The white-outs are fixed at their sources and the perf budget is met everywhere I measured. Draw calls are under 500 at all seven spots and triangles under 1.5 M; fox village went from 1.59 M to 1.17 M. All files I touched pass build --check, check-i18n passes, and T.errors() was empty in every run.

1. WHITE-OUTS. There were four causes:
(a) A camera exposure of 1.5 at night multiplied every emissive and additive source (glow plants, spell fx, the ring).
(b) UnrealBloom's hard high-pass made a pixel above the threshold bloom with its full value, so stacked additives became a white sheet.
(c) Fire point lights reached about 770 cd at night and flash lights 300–500 cd. These made the white hotspot beside burning crates.
(d) Giant mushroom caps had glow 1.9 over a pale tint, which put about 10% of the glowwood frame above luminance 2 even with no spell cast.

Fixes:
- atmo.js: the night lift now lives in the light and sky colour rows (LIFT = old/new exposure per palette key). Lit surfaces and the sky look as before; camera exposure is 1.15 at night (was 1.5) and 1.0 at deep dusk (was 1.12). The ring rim light in veilhook.js is compensated.
- post.js: new bloom high-pass. Hue-preserving clamp (max channel ≤ BLOOM_CLAMP = 4), then a soft-knee threshold, so only the part above the threshold blooms. Mip tints are tighter to cut the wide haze. Bloom threshold/strength per key: 1.9/0.42, 1.6/0.48, 1.1/0.55, 1.0/0.6.
- post.js: the composite pass now replaces NaN and inf with 0 and clamps negatives. A NaN from props (see core requests) had turned the whole frame black through bloom: at dusk after 祈雨 (Rain Prayer), 陨星 (Meteor) rendered a black frame.
- fx/lights.js: budgetCandela() compresses every G.fx.flash and fx light (linear to 30 cd, then 50→43, 120→65, 500→100 cd). Reach is capped at 6 + 3.2·√I.
- fx/particles.js: additive intensity is soft-compressed above 2 (5 → 3.4), and quads covering a large part of the screen are dimmed. The alpha-blended smoke part is unchanged.
- elements/flames.js: fire lights go from 25 + 455·night to 8 + 20·night (about 45 cd peak). The core boost is lower and the flame colours more saturated. Ground glow pools go from 0.03 + 0.64 to 0.02 + 0.24, size 7 + 4k (they stack about 10 deep in big fires).
- elements/weather.js: rain streaks are dimmer at night and fade out within 5 m of the camera.
- spells/entities.js: the 日辉 (Sun Gleam) light orb is golden 0xffc04a ×1.5 (was 0xffd27a ×2.2).
- terrain/shader.js: frost on the terrain is ×(1 − 0.5·night) so it doesn't glare under the strong night ambient.
- Flora: mushroom caps are now mostly emissive (glow 1.2, tint 80% toward near-black) and the glow palette is more saturated in linear space. Far cap stand-ins go from glow 1.35 to 0.85.
- Reversed GLSL smoothsteps fixed in skydome.js (3), post.js (vignette), bolts.js, terrain/shader.js (2) and flames.js.

Fire repro at 400,210: mean screenshot luminance went from 0.66–0.75 (a white sheet) to 0.36–0.41. The flames now read as orange-gold shapes; see before-fire.png and after-fire.png.

Matrix of every element's small and big form at day (-500,40), dusk (-60,90) and night (205,-125, then 400,210). Measured on the HDR target after exposure:
- Blown-white pixels (min channel > 3) are ≤ 0.4% in every case.
- Pixels with luminance > 2 are ≤ 4% in every case except 日辉 by day (4.3%) and at dusk (3.1% now, 5.0% in the first run), which is its gold burst and ring.
- Night 炎舞 (Flame Dance) went from 16.4% hot pixels with a screen-wide orange sheet to 1.2–1.9%.
- Burning crates, a firework barrel, a grass fire and an explosion plus a 400 cd flash at night stay at 0% blown.

2. PERF. Numbers below are high quality, 1440×900, built without the combat/gameplay/story systems. "Calls" includes the shadow pass and post passes.

| Spot | Calls before | Calls after | Triangles before | Triangles after | Shadow calls before→after |
|---|---|---|---|---|---|
| Shrine (-540,58) | 373 | 327 | 0.78 M | 0.76 M | 167→134 |
| Village (-455,150) | 353 | 353 | 0.93 M | 0.92 M | 135→128 |
| Fox village (-70,96) | 331 | 337 | 1.59 M | 1.17 M | — |
| Town (196,-118), night | 180 | 180 | 0.96 M | 1.02 M | none at night |
| Glowwood (400,210) | 140 | 141 | 1.13 M | 0.87 M | none at night |
| Palace (380,-40) | 154 | 156 | 0.75 M | 0.75 M | none at night |
| 150 m over dusk forest (approx.) | 309 | 313 | 1.31 M | 0.98 M | — |

The fly row is approximate: T.cam 150 m over (-60,90) with the heroine left on the ground.

Lower tiers now really are cheaper:
- med: shrine 302 calls / 0.60 M, fox 323 / 0.96 M, glowwood 0.70 M, palace 0.43 M, fly 0.73 M.
- low: shrine 271 / 0.52 M, fox 283 / 0.71 M, glowwood 0.54 M, palace 0.32 M, fly 0.66 M.

The full build (with colleagues' systems) at fox village showed 476 calls and 1.28 M triangles; other systems add about 140 calls.

CPU cost of renderFrame (median, measured with performance.now()) was 3.4–7.4 ms before and 3.8–7.1 ms after on high. It was noisy because other agents were loading the machine, so these numbers only give a rough idea. The real CPU cost is physics.update at 3–6 ms per frame (see core requests).

What did it:
- Far LOD simplification in builders/kit.js. farLOD had merged the full-detail places: the town's far version alone was 277 k triangles drawn from the fox village. It now uses vertex clustering on a 0.55 m grid with flat normals and per-face colours. Far versions went: town 277k→54k, foxvillage 82k→18k, shrine 61k→18k, village 59k→18k, palace 39k→13k. A telephoto view of the far town showed no visible artefacts.
- Bamboo (644-triangle clumps, about 300 k triangles at the fox village) now swaps to its own cone stand-in batch 'bcone' at 62 m instead of 106 m. Species get an optional `near` field.
- Structures: shadow casters are culled by distance from the focus, re-checked every 8 frames (80 / 70 / 58 m for high / med / low). The near/far swap is at 170 / 145 / 120 m.
- Flora shadow radius: 52 / 42 / 30 m.

3. LOOK CHECKS.
- Trees rendering black (tree_cherry_1, tree_maple_1, tree_maple_3, tree_ginkgo_1): I could not reproduce it. Raw G.assets.model() instances render coloured (red maple, orange maple3, gold ginkgo, pink cherry). Their vertex colours are grey AO ramps, and flora handles them correctly. The note in docs/api/structures.progress.md looks stale.
- Mushrooms seen from below now read as vivid violet, magenta and cyan.
- Night ground in town and glowwood has life from lanterns, glowing flowers and veins.
- The ring shows on the 月池 (Moon Pool) water as a warm gold glimmer that is not blown out.
- Light shafts measured shaftK 0.35 by day, 0.14 at dusk and 0.5 toward the night ring, and looked right in every land.

## Public API
No ★ API changed. Additions:
- src/render/atmo.js: `export const nightLift(v)` returns the night lift folded into the light and sky colour rows (1 by day, 1.12 at deep dusk, 1.304 at night). Shaders that light things with their own constants can multiply by it. palScalars(v).exposure is now 1.0/1.0/1.0/1.15 per key (sunlit / early dusk / deep dusk / night).
- src/render/post.js: `export const BLOOM_CLAMP = 4.0` (hue-preserving max-channel clamp of the bloom input). pipe.bloom.materialHighPassFilter now uses a soft-knee shader with uniforms uKnee (0.5) and uClampMax. The composite pass sanitises NaN/inf/negative pixels.
- src/fx/lights.js: `export const budgetCandela(I)` returns I up to 30 cd, else 30 + 25·ln(1 + (I−30)/30). FlashLights.flash applies it and caps distance at min(distance, 6 + 3.2·√I_budgeted). G.fx.flash(pos, color, intensity cd, dur, distance) keeps its signature.
- src/world/flora/species.js: tree species accept an optional `near` (metres at high quality) for the near→stand-in swap. New far stand-in type 'bcone' (bamboo cone); G.flora batches now include a 'far-bcone' batch.
- src/world/builders/kit.js: farLOD() output is simplified internally by clusterSimplify (FAR_CELL = 0.55 m). The return shape is unchanged.
- src/world/structures.js: shadow casters are culled by distance from G.player.pos (80/70/58 m for high/med/low). The near/far swap distance is 170/145/120 m by quality. G.structures.lods and culls are unchanged.

## Tests
All runs headless with tools/play.mjs. Scripts are in `.tmp/fix-render/`; probe.js reads HDR luminance stats of the post-exposure scene target.
- Original fire repro, full build, 400,210: mean screenshot grey 0.66–0.75 before, 0.36–0.41 after. No errors.
- Element matrix (t-matrix-*.js): every element, small and big form, at day -500,40, dusk -60,90 and night 205,-125 / 400,210. I recorded blown-white fraction, luminance>2 fraction and mean, and looked at montages of the worst frames. The final night run is all ≤ 0.35% blown and ≤ 3.8% luminance>2. Day frames look unchanged.
- Night scenarios at 400,210: burning crate + crate_large, firework barrel (fuse lit), igniteGround, fx 'explosion' + 400 cd flash. 0% blown; flames read orange-gold.
- NaN hunt (t-nan.js): traced to the props:pot, jar and jar_small instance colours after rain (badColor counts 3/3/9). The black frame is gone after the sanitiser.
- Perf (t-perf.js) at 7 spots × 3 quality tiers. Per-object triangle and draw-call breakdown via a renderBufferDirect hook (t-break.js).
- Far LOD check: triangle counts per place before/after (t-far.js) and a telephoto look at the far town.
- Look checks: raw tree models (not black), mushrooms from below, night ground, ring reflection on 月池, shafts by day/dusk/night.
- node build.mjs --check passes for all 18 touched files. node tools/check-i18n.mjs passes for src/render, src/fx, src/elements, src/world/flora, src/world/builders and src/spells.
- Final full build at fox village, 1440×900 high: T.errors() empty, 476 calls (whole frame incl. post), 1.28 M triangles, 60 fps (vsync-capped).

Most runs used --systems fx,audio,ui,physics,elements,sky,terrain,flora,structures,props,player,spells. For a while the full build failed: src/combat/combat.js imported ./bosses.js and ./wildlife.js, which didn't exist yet. It was fixed later by its owner.

## Known issues
- Rain streaks (dimmer at night, fading near the camera) and the frost change were re-checked only by build --check, not by screenshot.
- Lowering night camera exposure (moving the lift into the light rows) means night land seen from the sunlit meadow is now lit by the lifted night palette without the old eye-adaptation drop, so it can look up to about 1.3× brighter from far away than before. It looked fine in the views I took, but there was no dedicated side-by-side.
- Bloom is gentler overall (soft knee): glow plants get a subtle halo at night rather than a big one. Strength can be raised in atmo.js SCALARS (column 4) if art wants more glow.
- 日辉 (sun small) still lifts the whole frame about 3–4× for ~0.15 s: two flash lights plus the gold ring and rays. It reads as a golden burst, not white. The 天照 (Heaven's Light) beam core by day is a near-white column.
- The cluster-simplified far LODs use flat normals and per-face colours; tiny trims melt into walls beyond about 170 m (120 m on low). I saw no holes, but I checked only the town and the fox-village views.
- Bamboo swaps to cones at 62 m (53 m med, 45 m low). Flying low over a grove, the swap is more visible than for other trees.
- CPU numbers are noisy (shared, loaded machine; headless fps capped at 60). The renderFrame CPU median ranged 1–7 ms run to run, and physics.update dominates CPU at 3–6 ms per frame.
- Full-build draw calls at the fox village are 476 including colleagues' NPC/combat content and post passes, close to the 500 budget; the subset build measured 337.
- I did not reproduce 'trees render black' (tree_cherry_1, maple_1, maple_3, ginkgo_1); raw models render coloured. The old gotcha in docs/api/structures.progress.md looks stale.
- docs/api/sky.md and fx.md describe the old values (night exposure 1.5, hard bloom threshold, flash intensities). I did not edit docs; the owner should update them from this report.
