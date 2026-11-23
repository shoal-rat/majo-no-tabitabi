# life — ambient small life (as built, upgrade 3)

Owner files: `src/world/life.js` (system, `G.life`), `src/world/life/meshes.js` (the five instanced bodies and their
shaders), `src/world/life/kinds.js` (species, group behaviours, where they live). System order: right after
`landforms`. Boot text key `core.boot.life`. URL `?nolife=1` skips the whole system (A/B).

Purely visual: no colliders, no physics bodies, no interactables, no save state, no gameplay events emitted. It does
not duplicate `src/fx/ambient.js` (pollen, petals, maple / ginkgo leaves, fireflies, spores stay there).

## What lives where

Groups spawn in a ring around the heroine (biased ahead of the camera) where the land suits them; the Veil value AT
THE SPOT (`G.world.veilAt`, same weights as fx/ambient.js) chooses the land, so borders blend. Far groups fade out
(scale, no pop) and are recycled.

| land | group id | what |
|---|---|---|
| 曦光原 (Dawnlight Plain) | `songbirds` | sparrow flocks pecking and hopping on open ground; burst up when she comes near, circle, settle again (elsewhere if she stays) |
| | `swallows` | swallows swooping low round her (follow her lazily, leave when she changes land) |
| | `butterflies` | butterflies over meadows away from roads; settle on flowers with wings closed upright |
| | `bees` | bees darting between flowers on 向日丘 (Sunflower Hill, POI `sunhill`) |
| | `dragonflies` | dragonflies hovering and darting at water edges (also 薄暮, the dusk region) |
| | `fish` | fish shadows under the surface; now and then one breaks it (`G.water.ripple`) |
| coast / peaks | `gulls`, `gullsky` | gulls standing on beaches; gulls wheeling over the sea near the shore |
| | `eagles` | eagles circling high over 霜见岳 (Frostview Peak; MOUNTAIN ellipse) |
| 薄暮林 (Dusk Woods) | `crows`, `crowsky` | crow flocks on the ground; crows wheeling against the sunset |
| | `geese` | a V skein crossing the sky, 40–55 m up |
| | `moths` | moths orbiting stone lanterns and the great lanterns (data/world.js) |
| | `frogs` | frogs on river banks: throat pumping, small hops, a leap + ripple into the water when she comes near |
| | `cranes` | cranes standing in lake shallows (ground −0.15…−0.65), long feeding dips, slow heavy take-off |
| 常夜原 (Evernight Plain) | `glowmoths` | glowing moths (bloom) drifting low over the dark meadows |
| | `lightfish` | light-fish (HDR, bloom) in any deep water — the palace moat included |
| | `bats` | bats flitting round her |
| | `jellies` | lantern-jellies (additive, pulsing) drifting 2–7 m up over the dark shore |

## Reactions
- **The heroine** is a moving threat: per species radius (sparrow 6.5 m, crow 9, gull 8, crane 12, frog 3.6, fish
  3.5, insects ~2), × 1.6 when she sprints, glides or rides the broom.
- **Blasts**: listens to `element:applied` (radius 6 + 2.5·radius), `element:reaction` (14), `spell:cast` (7),
  `physics:impact` (speed > 4, 9), `enemy:killed` (10), `prop:broken` (8), `player:land` (speed > 8, 10). Threats live
  0.5 s. Other systems may call `G.life.scare(pos, radius)`.
- **Wind**: insects and jellies drift with `G.elements.windAt` (one call per group per frame); circling birds' thermals
  drift with it; flocks circling after a scare lean into it.

## API (`G.life`)
- `enabled`, `root` (Group), `meshes` { bird, insect, frog, fish, jelly }, `groups` (live list, read-only)
- `setEnabled(on)` — show / hide all (clears groups when off)
- `scare(pos, r = 10, k = 1)` — make everything near flee
- `spawn(id, x, z)` — tests: spawn a group of that id at / near (x, z), ignoring the land check
- `clear()`, `stats()` → { groups, counts per body, by group id, ms (EMA of update cost), drawCalls, threats }

## How it is drawn (rules for other systems)
- FIVE draw calls at most, one `InstancedMesh` per body, `frustumCulled = false`, no shadow casting / receiving, never
  on layer 5. Instance caps on 'high': bird 96, insect 110, frog 10, fish 24, jelly 12.
- All motion of wings / legs / neck / head / tails / bells is in the vertex shader from per-instance attributes:
  `iColA`, `iColB` (vec3), `iAnim` (phase, amplitude, fold, glow), `iShape` (vec4, per body — see meshes.js header).
  The CPU writes only matrices + those four attributes for the live count (update ranges, not the whole buffer).
- bird / insect / frog are `MeshToonMaterial` + `hookMaterial()` (surface `none`, rim 0.55, wrap 0.55; insects
  trans 0.5) so the three lands light them like everything else; painted shading (back / belly gradient, AO, darker
  primaries) is baked into a vertex attribute (`color.g`), a cream belly / beak / leg accent into `color.b`. Glow-moths
  add `diffuse × glow` to the emissive (blooms at night).
- Insect wing shapes and patterns (butterfly border + spots, moth mottling + eye spot, dragonfly veins, bee ovals) are
  cut and painted in the fragment shader from wing UVs — one quad pair per wing.
- fish (unlit, alpha, `renderOrder −5`, after the water) and jelly (unlit, additive, HDR, `renderOrder 5`) are
  MeshBasic patches — they are a shadow / a light, not lit surfaces.
- Quality: instance caps and group counts × 1 / 0.65 / 0.3 (high / med / low) — 'low' keeps about one group of each.

## Spawn manager
Every 0.35 s the three neediest group types (want − have, want = max × tier × land match at her spot) try a spawn;
a type whose spot finder fails (no shallows / lanterns / flowers in reach) rests 3–6 s so it cannot starve the others
(before this fix one unplaceable type — cranes away from the lake — kept 薄暮 / 常夜 empty). After ~9 s at a spot on
'high': 曦光 sunflower hill 8 groups (22 butterflies, 16 bees, 5 swallows, gulls), 薄暮 bamboo 7 (crows on the ground
and wheeling, a geese skein, fish), 常夜 mushroom meadow 6 (18 glow-moths, lantern moths, bats).
Companion groups (`follows`: swallows, bats, geese) leave when she walks into a land that does not suit them.

## Measured cost
1440×900 'high', game camera, A/B ×4 toggling `G.life.root.visible`, best p25 of `renderFrame + gl.finish`, machine
load 95–145 (five colleagues) — the GPU numbers are NOT trustworthy beyond "inside the noise":
- 曦光 (31 agents live): on 14.9 ms / off 14.6 ms; 3 draw calls (bird, insect, fish); +~2 k triangles
- 薄暮 / 常夜: differences ±0.3 ms either sign
- CPU update (`stats().ms`, EMA): 0.20–0.31 ms per frame with 6–8 groups / 30–45 agents
- Draws: 2–3 typical, 5 max (budget 12). No shadow-map draws.

## Known shortfalls
- At the game camera (6 m behind her) most of the life reads as small specks: butterflies / moths were sized up
  (0.13 / 0.11 m half-span) but a player notices them mainly when they move or burst. Birds on the ground are seen
  best when she walks into a flock. A bolder pass would add a few "hero" groups placed on the paths ahead of her.
- The CPU cost (0.2–0.3 ms) is on the main thread and grows with agents; the 0.5 ms budget holds on 'high' with the
  default caps but would not with all caps full.
- Birds are one generic body (spindle + wings + fanned tail); species read through size, colour, neck / legs and
  motion, not silhouette details (no crest, no forked swallow tail, bats have bird wings with a fast flutter).
- No feet IK: perched birds / cranes stand on `heightAt`, so on a roof or a platform they would float or sink — group
  spots avoid reserved ground (settlements), so they never perch on buildings.
- Fish are surface decals (no refraction / depth fade); they read as shadows by day, they are not visible fish.
- No sound (no birdsong, no wing flutter, no frog chorus) — audio owner.
- Flocks do not avoid trees / cliffs while circling (they fly high enough in open spots, but a circle can clip a
  tree crown in the forest).

## Hero moments (final-beasts round, 2026-11-14)
A few fixed groups placed where a player walks, larger on screen than the ambient specks, same five instanced bodies (no new
draw call, no new mesh), every tier (`lowFloor`). Defined in `life/kinds.js` (`HERO`, `heroFind`, `heroPerchInit`, `koiInit`,
`heroMothFind`), spawned by the normal manager when she is within reach of the spot:
| group id | where | what |
|---|---|---|
| `hero_sparrows` | 向日神社 (Sunward Shrine) stone stairs (`STEPS`, builders/shrine.js) | 8 sparrows (0.44 m, was 0.3) pecking on the treads (`env.groundAt`, so they stand on the steps); burst up as she climbs, circle, come back to the stairs once she has passed |
| `hero_crows` | two torii of the 千本鳥居 (Thousand Torii) tunnel (`TUNNEL`, builders/dusk.js) | 4 crows (0.68 m) in a row on the top beam, no hopping; lift off when she walks under, return to the beam |
| `hero_heron` | lake shallows nearest the 镜湖 (Mirror Lake) ferry pier | a grey heron (1.2 m, new kind `heron`) wading; slow heavy take-off |
| `hero_koi` | deep water nearest the pier end | 5 koi decals in orange / white / gold (0.75–1 m) turning slowly inside 4.5 m |
| `hero_moths` | lamps of 万灯镇 (Myriad Lantern Town) within 30 m of her (`env.lamps` = `G.sky.lampList()`, **not yet provided by sky.js — requested**; until then this group never spawns) | moths (0.16 m) orbiting the lamp heads, up to 3 lamps |
| `moths` (ambient, changed) | stone lanterns and great lanterns, as before | now the larger `mothH` (0.16 m half-span, was 0.09) |
Mechanics: perching groups may carry `g.groundFn(x, z)` (perch height), `g.noHop`, `g.fixed` + `g.landAt(agent)` (return to
the same perch instead of settling elsewhere); fish groups `g.R` (home radius). life.js passes `groundAt` and `lamps` (`G.sky.lampList?.()`, an array of {x, y, z}) in the
find / init env. Spot positions are copied from the builders' constants: if the shrine stairs or the torii tunnel move, update
`STEPS` / `TUNNEL` in kinds.js.
Cost: + up to ~30 agents near those spots (bird cap 96 unchanged), the same ≤ 5 draws; CPU per agent as the ambient ones.

## Map round: herds, tree birds, starlings (2026-11-22)
- `life/skinned.js` — instanced skinning: `bakeAsset(G, id, { state: [clip, fps] })` plays a rig's clips on the CPU and
  writes every bone matrix (root space, bind pose folded in) into an RGBA32F texture (row = frame, 3 texels per bone);
  `bakeProcedural(parts, nBones, pose, clips)` does the same for hand-built bodies; `makeHerdMesh(baked, cap)` = one
  InstancedMesh (toon + matching depth material) with per-instance `iAnim` (rowA, rowB, mix) and `iTint`. Material /
  texture colours are baked into vertex colours; the cel rig's outline hulls are skipped.
- `life/rabbit.js` — procedural wild rabbit (idle sniffing, grazing, alert, hop).
- `life/herds.js` — `G.life.herds` (also in `G.life.stats().herds`): roe deer (+ a stag), foxes, rabbits, sheep. Fixed
  sites from the countryside plan (copse / wood edges, meadows, moor and heath, hay fields), streamed 55–260 m around her,
  recycled past 330 m with a scale fade; graze / look up / wander; the whole herd bolts from her on foot (sooner when she
  runs), from a low broom pass, from her landing and from every blast / spell / fire / meteor near them (the life
  threats; `spell:meteor` added). One draw per species; shadows only while one is within 75 m. Caps follow the tier
  (low ~45 %). `spawnAt(kind, x, z)`, `clear()`, `stats()`.
- `kinds.js` groups: `treebirds` (finches perched on a real tree crown from `G.flora.treesNear`, bursting out as she
  passes), `starlings` (one breathing murmuration over open country, scattering from the broom), `bees` now find lavender
  / poppy fields, the bee garden and the flower valley. Bird cap 96 → 150.

## Citylife round: witches and townsfolk of the City of Magic (2026-11-22)
Files: `life/city-flyers.js` (system part, `G.life.city`, flyer behaviour, broom trails), `life/city-crowds.js`
(townsfolk), `life/city-flyers-bake.js` (instanced skinned humanoids), `life/city-flyers-plan.js` (layout adapter + grids).
Registered in `life.js` (marked "citylife round"); `?nocity=1` turns it off (A/B). Purely visual: no colliders, no save
state, no gameplay events, no player-visible text.

**What a player sees.** From ~1.5 km out the bodies bake (once, ~0.5 s, async). The sky over the town fills with witches
on brooms: apprentices in dark robes, travelling witches in purple / blue / wine / green / white, a few grey-haired
elders; hats on or off, gold / red / white trims, many hair colours. Roles (high tier, about 115 flyers):
| role | what |
|---|---|
| `local` (40) | the sky round the heroine: waypoints within ~15–95 m of her (mostly in front of the camera, ahead of her when she flies), about her height and up; 30 % are fly-bys that cross her path 12–45 m ahead |
| `lane` (28) + `looper` (2) | the exported sky lanes (street-canyon lanes between the house fronts, the high ring, the gate lane) plus derived rings and chords over the roofs; spread across each lane's width, both ways, 200–450 m stretches; loopers throw a loop-the-loop |
| `hop` (22) + `delivery` (3) | the heart: stand on a balcony / terrace / footbridge / rampart walk (idle, chat, lean on the rail, wave), mount the broom, a short arc across the canyon (lifted over anything in between), slow approach, dismount and stand; sometimes step inside for 10–30 s; delivery witches carry a parcel and hop further |
| `circle` (8) | laps round spire and tower tips |
| `commute` (10) | in and out over the walls (and through the gate arch, low and slow); while she is out on the approach most come in past her |
| `trio` (3) | three apprentices in a V flying a figure-eight over the practice field |
Flight: arc-length paths (Catmull-Rom, ≤ 160 samples per flyer, rebuilt only when a leg starts), every sample lifted over
the roofs (`sky` grid; exported canyon lanes use the exact `top` grid), bank from yaw rate, pitch from climb / dive,
`boost` clip above 17 m/s, robe-hem and hair flutter in the vertex shader, a faint additive trail from the brush (one draw,
a minimum on-screen width so far brooms still draw a line). Traffic is focused on her: legs started more than 230 m
from her head back towards her part of town.
The heroine: flyers wave (`rwave`, ride + Wave on the right arm) when she flies within 18 m (cool-down 22–40 s); they give
way inside 10 m (a sprung offset, never through her) and scatter from blasts (the life threats); after 3 s of fast
straight flight a nearby witch swoops in beside her for 6–9 s (catch-up capped at +10 m/s), then peels off. A balcony she
is landing on / standing on is hers for 4 s: perched witches hop away, landing witches pick another, folk step aside.
Townsfolk (`city-crowds.js`, high tier ~80: 50 on balconies, 16 walkers, 14 at shop fronts): mostly up on the balconies / terraces / bridges / ramparts (rail lean, chats in
pairs facing each other, calling out, waving at a passing broom or at her, looking up, turning to talk to a witch who
lands beside them); few in the dim streets: walkers on the exported street lines (merchants carrying, mages, children
jogging; never into a wall cell of the 2 m walk grid, sidestep / stop for her, pause to look up at a low broom) and
browsers at the lamp-lit shop fronts. Folk far from her, or behind the camera, are moved to balconies 20–70 m ahead of
where she looks / streets / shop fronts near her (one move per 0.5 s, never someone the camera can see).
**Story safety.** Active keep-out zones (refreshed twice a second): the exported `CITY_LIFE.keepOut` (accident roof, crash
flight path, jeweller flight, inn) always; the crash roof r 34 during quest steps `collision` / `repair`; the inn; the
practice field (r + 45 m, up to field + 70 m) during `teach` / `course` / `praise`; the gate (r 42 m) during `gate` /
`depart` (the gate lanes and gate commuters are not used then). Nobody inside an active zone is drawn (scale fade), local
waypoints are pushed out of them, perches inside them are not used. While `G.mode !== 'play'` every flyer within 40 m of
her or the camera, and every townsperson within 16 m of her, fades out.
**Data.** `src/data/bellcrown.js` `CITY_LIFE` (places agent): `bounds`, `ground`, `gate` (archW / archH / depth / face),
`practice`, `spires`, `towers`, `squares`, `streets`, `skyLanes` ({ y, width, loop, pts }), `wallWalk`, `keepOut`,
`balconies` (filled by the builder; kinds balcony / roof / bridge), `shopFronts`, `ready`. The plan waits for `ready`.
Anything missing is derived (rooftop perches from platforms, slim tall colliders as spires, straight street runs through
open walk cells, rings / chords as lanes). Grids (built once): `sky` (4 m, highest collider / platform top, padded 2.5 m),
`top` (exact), `walk` (2 m, street-level obstacles). Inside test: `bellEdge` (exported) or the level terraces.
**Drawing.** Five bodies baked from the journey cast GLBs (read raw with GLTFLoader for clean material names):
char_saya, char_exam_witch, char_fran (witches), char_innkeeper, char_elaina_father (townsfolk). Materials → parts
(robe / hat / hair / trim / hat trim recoloured per instance from four palette colours with the texture's own shading kept;
skin, eyes, leather kept); flags per instance: hatless, parcel. States (same rows for every body): ride, boost, rwave,
mount, dismount, idle, walk, jog, talk, listen (fold arms), rail, call, lookup (neck + head pitched back), wave, carry. A
broom (and parcel) on an extra bone: on in the ride states, collapsed on foot. LODs by meshopt: ~16k (with face
details) / ~3.6k / ~1k triangles. One InstancedMesh per (body, LOD): ≤ 15 draws + 1 trail draw; shadows only from the
two near LODs. Near-LOD budgets for the whole town (high: 4 at LOD0, 24 at LOD1; low: 2 / 12) with adaptive distances
(LOD0 ≤ 14 m, LOD1 ≤ 55 m); agents beyond 700 m (flyers) / 280 m (balcony folk) / 150 m (street folk) or outside the
frustum (beyond 20–25 m) are not drawn. No per-frame allocations in the update / draw loops. Counts scale with
`G.quality.density` (× 0.7 more on low).
**API** (`G.life.city`): `phase` ('wait' | 'loading' | 'live' | 'off'), `flyers`, `crowds.folk`, `plan`, `load()` (tests:
start baking now), `clear()`, `stats()` → { flyers, visible, modes, escorts, perches, lanes, spires, streets, crowd,
draws, tris, ms, keepOut }. Also in `G.life.stats().city`. Tests only: `G.life.city.st.forceLod`; a view-only camera
(`T.viewCam`) is honoured for LOD / culling through `G.debug.fixedCam`.
**Measured** (high, play.mjs with the game camera, shared GPU so no fps): flying in over the gate and across the town on
the broom 6–9 draws, 30–160k triangles (the high end while a witch flies beside her at LOD0); on foot in a street 6–8
draws, 32–35k triangles; update + draw ≈ 0.12–0.25 ms per frame. (Test view cameras disable frustum culling, so
`.tmp/agents/citylife/shots.js` reports up to ~300k.)
**Known gaps.** Instanced bodies have no ink outline and no faces beyond vertex colour (fine from ~5 m; the closest
fly-bys are LOD0). Flyers do not avoid each other (lanes are spread across their width). Paths are lifted over roofs, so
apart from the exported canyon lanes and balcony hops nobody flies low through the streets. No sound.
