# props — as built

## Summary
I replaced the props stub with a working G.props system in five files under src/props/, plus a locale file. Everything builds, check-i18n passes, and every headless test run reported no errors at 60 fps.

What exists:
- **Catalogue (catalog.js):** 55 types, all data-driven. Each type sets its model (a staged prop_*/rock_* asset or a procedural build), collider shape, physics and elements material, hp, impact threshold, debris kind and colours, break effects and sound, drops and behaviour. It covers crates (5 kinds), barrels (4), the firework barrel (爆竹桶), the water jar (水瓮), iron box and iron ball, pots/vases/jars/bottles, sack, baskets, bucket, hay bale and sheaf, cart and wheelbarrow, logs, planks, ladder, bench, stool, low table, boulders in three sizes, snowball and ice block, apple/pumpkin/fish/mushroom (apples and fish turn into roasted versions when they catch fire), brazier, campfire, torch post, lantern post, andon, shrine bell and wind chime. The procedural ones are the firework barrel, water jar, iron ball, sack, hay bale, small crate, snowball, ice block, brazier, torch post, lantern post, shrine bell and wind chime.
- **Rendering (models.js):** each type's model is merged into one mesh per material and drawn with one InstancedMesh per material for all live props of that type. Lit/unlit parts are shown or hidden per instance, bell and chime parts swing about a pivot, and charring, wetness, frost, shock flashes and highlighting are done with per-instance colour. No point lights are added: glow comes from glow materials plus G.elements.addLight. prop.mesh is an invisible proxy that physics moves; there is no per-prop scene mesh.
- **Behaviour (prop.js):**
  - Every prop gets a physics body (owner = the prop) and an elements reactor. Fire sources and lanterns register as kind 'lantern', everything else as 'prop'.
  - Impacts above the type's threshold cause damage. Frozen props are brittle (threshold ×0.55, damage ×2). Hits from a body more than 2.5× heavier and faster than 5.5 m/s crush the prop.
  - Burning props darken, lose hp and break when they burn out. Hay burns fiercely: an extra flame emitter and it re-spreads fire every 0.9 s. Wet props steam instead of igniting.
  - Thunder: wooden props split, stone props shatter, iron conducts and flashes.
  - Firework barrel: fire, thunder, a hard hit or a nearby blast lights the fuse. The fuse hisses, the barrel hops and throws sparks, then it detonates: G.physics.explode, G.elements fire, explosion, flash, shake and hitstop. Neighbouring barrels catch on short fuses and nearby props take damage. 5–8 coloured rockets rise with trails and burst into coloured sparks.
  - Water jar breaks into a splash that soaks, puts out fires within 3.8 m and wets the ground.
  - Boulders roll with a downhill assist, because physics' rolling resistance stops them on slopes under about 25°. They split large → 3 medium → 3 small.
  - Brazier, torch post and campfire: lit and unlit states, flame emitter and light, ignite anything put into the flame, roast food within 1.4 m, are doused by water, and a tipped brazier spills fire. Lanterns are lit by fire or sun and put out by water or wind.
  - Bells and chimes ring when struck, shocked, hit by impacts or by any element except sun and moon; bells also ring on E, chimes in strong wind. They swing as damped pendulums and emit 'prop:ring'.
  - Snowball and ice block melt beside fire and slowly in full sun, shrinking, then splash.
  - Food can be picked up with E (G.gameplay?.spawnPickup).
  - Heavy, fast props hurt creatures they hit: owner.reactor.on.hit(r, 'earth', power, info) with damage based on momentum. A prop the heroine threw with 月引 (Moon Pull) within the last 3 s counts as team 'player' and never hurts her.
  - Breaking, debris and creature hits are always deferred to update(), never run inside physics or elements callbacks. Debris are short-lived instanced bodies (at most 140).
- **Placement (place.js):** deterministic and seeded; the full layout of 772 records is built in start() in 6 ms (measured before the structures and flora colliders exist). A free-spot finder rejects water, steep ground, roads, rivers, anchors (4.2 m), stone lanterns, bridges, raised platforms (roofs), anything that overlaps a G.world collider (tested with resolveCollisions), and already-placed clusters. There are 19 cluster templates (crates, barrels, market, hay, pottery, farm, pumpkins, logs, woodpile, camp, festival, iron, library, seat, snow, offering, apples, cart stop, water) plus single items. Per-settlement plans cover the village, town, fox village, shrine, training ground, crystal field, wind shrine, lake isle and the great maple. On top of that: 9 wild camp/festival spots with firework barrels and braziers, boulders on slopes above roads, logs along the river banks and the lake pier, and 70 sparse wild clusters chosen by region.
- **Streaming (props.js):** records within 78 m of the focus become live props, spawned asleep (at most 36 per frame). Beyond 98 m, quiet props go dormant and keep their last pose. The cap is 220 live props; when it is reached the farthest non-persistent prop is sent dormant. Loose non-persistent props spawned through the API despawn when far away and still. Broken records stay gone until reload; nothing is saved.

## Public API
G.props (propsSystem in src/props/props.js; the ★ entries keep the §6 names):
- ★ spawn(type, pos, { rot, vel, angvel, burning, persistent, lit, sleep }) -> Prop
  - pos is the body CENTRE, a Vector3.
  - rot is a yaw number, a Quaternion, an Euler, an [x,y,z] Euler array, or {x,y,z,w}.
  - lit is true, false or 'auto' (fire sources and lanterns; 'auto' = lit where veil > 0.22).
  - sleep: spawn the body asleep.
  - An unknown type reports through G.reportError and returns null.
- ★ types: array of type ids (55). catalog: the CATALOG object (id -> definition).
- ★ near(pos, r = 5, out?) -> Prop[] of live props within r.
- ★ count (getter): number of live props.
- Extras: live (getter, Prop[]), records (getter, the placement records), cap = 220, fromBody(physBody) -> Prop | null, reset() (rebuild the layout; all props reset), stats() -> { live, records, dormant, gone, awake, burning, ticking, debris, rockets, kits, meshes, visible, tris }.

Prop:
- Fields: type, def, body (PhysBody, owner = the prop), mesh, reactor (elements Reactor, owner = the prop), hp, maxHp, persistent, alive, broken, lit, char (0..1), pos (getter = body.pos).
- mesh is an invisible proxy Object3D that physics moves (a Mesh holding hull geometry for logs). It is NOT in the scene; the prop is drawn by per-type InstancedMeshes named 'props:<type>'.
- ★ damage(n, { by, element, source }): bells and chimes ring instead; a firework barrel takes n >= 6 as lighting its fuse.
- ★ break(by = 'hit') and ★ remove(): break is deferred to the next update.
- Extras: highlight(on) (a bluish tint, e.g. while held by 月引), setLit(on) -> changed, ring(power), lightFuse(sec).

Behaviour notes for other systems:
- Breaking emits 'prop:broken' { type, pos, by }. by is 'impact' | 'crush' | 'fire' | 'firework' | 'melt' | an element | a caller string.
- Drops go through G.gameplay?.spawnPickup?.(kind, pos, n). Kinds used: stardust, heart, apple, roasted_apple, carrot, fish, grilled_fish, berry, mushroom, rice, pumpkin. Food picked up with E uses the def.food kind.
- New event: 'prop:ring' { type, pos, prop } (shrine bell, wind chime).
- Creature hits: when a prop's body hits a character capsule, after the frame the prop calls owner.reactor.on.hit(reactor, 'earth', power, { source: prop, team, damage, element: 'earth', power, mult: 1, heavy, dir, pos, prop }), falling back to G.combat?.damage for enemies without a reactor. Damage is clamp((mass × speed − 160) / 24 × def.heavy, 0, 90). team is 'player' if the prop was held by 月引 in the last 3 s (then it never hurts the player); otherwise 'neutral', and the player takes half damage, only when it is at least 6.
- Interact: 'props.prompt.ring' on shrine bells, 'props.prompt.pick' on food.
- Fire sources and lanterns are registered as elements kind 'lantern': fire or sun lights them, water or strong wind puts them out, and lit ones add G.elements.addLight (radius 7–14).
- Sounds used (prefix and variant number dropped): wood_break glass_shatter rock_crumble ice_shatter splash cloth_rustle paper hit_wood hit_stone hit_heavy hit_ice hit_body explosion_small firework whoosh steam_sizzle charge ignite lantern_ignite shrine_bell wind_chime pickup.
- Burst names used: wood_break shatter_rock shatter_ice splash dust feathers hit_water hit_earth hit_sun hit_thunder explosion spark petals ignite extinguish steam pickup lantern_ignite. Emitters: flame, embers. Trails use style 'band'.

## Known issues
- The structures and flora systems were still stubs, so placement has only been tested against an empty world. Their colliders will change the layout (it stays deterministic for a given set of colliders), and settlements look sparse until buildings exist. Re-run tools/devkit/props/t11-place.run.js once they land.
- No real camp data exists (no src/data/camps.js yet). The 9 camp/festival spots are hard-coded in place.js CAMPS; combat may want to move them or supply its own.
- Drops and food pickups call G.gameplay?.spawnPickup with kind names I chose (stardust, heart, apple, roasted_apple, carrot, fish, grilled_fish, berry, mushroom, rice, pumpkin). Gameplay is not built, so drops are untested and silently do nothing.
- Sound names (shrine_bell, wind_chime, wood_break, firework, …) assume the audio system drops the sfx_ prefix and the _1/_2 variant suffix. Audio was not in the build, so no sound was heard.
- prop.mesh is an invisible proxy, not the drawn object, because all props are instanced. Anything that wants to outline or attach to a prop must use prop.highlight(on) or read prop.mesh.position/quaternion.
- A crate pushed by walking into it slides about 8 m and tips over: the player capsule keeps shoving it (the physics doc lists this as a known issue).
- Burning crates sit next to a very bright white elements flame and firelight. The crate itself darkens as intended, but the hotspot looks over-exposed (that is elements and fx tuning).
- The boulder roll assist (0.24 g along the direction of travel, only while moving downhill) works around physics' fixed ROLL.roll = 0.3 g. Boulders on steep slopes can reach over 20 m/s.
- Rocket trails use style 'band' because 'glow' and 'streaks' turn the whole frame black (see coreRequests). Band trails are fainter than intended.
- andon (model prop_andon) gets a procedural glowing core when lit; the effect is subtle and was not inspected up close.
- Interact prompts (bell ring, food pick) were not tested by pressing E in a run.

## As built, upgrade 2 (prop look)

### What changed
- **Offline refinement, `tools/refine-models.mjs`** (node + @gltf-transform + sharp). Turns faceted, textured low-poly pack models into soft cel props. Per model: flatten nodes to a triangle soup; bake material colour × COLOR_0 × base texture into vertex colours (textures dropped); classify triangles by surface kind; weld; crease-aware Loop subdivision for `round` / `organic` recipes (pots, barrels, pumpkins, gourds, stones, mushrooms, logs) under a triangle budget; linear tessellation + soft-edge normals for `box` recipes (crates, benches, signs, carts), so the cel band draws a thin highlight or shade line along every hard edge; normals by crease angle; bake voxel AO (ground counted as solid), a ground-contact gradient and curvature (light worn edges, dark cavities) into COLOR_0; pull colours toward `PAL` in src/core/mats.js. Output goes to `assets/models/refined/<id>.glb` with one primitive per (material, surface) and `material.extras = { surface, look }`.
  - `node tools/refine-models.mjs [ids…] [--manifest] [--list]`. `--manifest` repoints the entries through `tools/manifest-patch.mjs` only.
- **Manifest**: 57 ids refined (all prop_* the catalogue places, plus flora-path nat_/plant_ ids — lily pads, lotus, pumpkins, small mushrooms, logs, stump, fallen trunk — and bld_pagoda_red, bld_fox_statue, bld_boat_rowing). Each entry has `file` (refined), `orig` (original file, kept on disk), `refined: 2` and `mats: { materialName: { surface, look } }`.
- **Static toonify path (src/core/assets.js, static part only)**: keeps vertex colours and copies `surface` / `look` from the manifest `mats` (or the file's material extras) onto the toon material, so the look layer shades wood, metal, clay, stone and paper differently. `?propsv=1` loads the originals instead (A/B only).
- **Flora-path models** keep their source material names (`leaves/petal/fruit/stem/cap/trunk/moss/cut`), because flora code looks them up by name. Only shading is baked into COLOR_0.
- **Hand-built props, `src/props/shapes.js`** (new): shared soft-edged builders and tagged materials: `M.*` (wood, woodLight, iron, stone, stoneDark, paper, rope, clay…), `rbox` (rounded box), `rcyl` (bevelled cylinder), `lathe`, `ring`, `ropeRing`, `tube`, `lumpy`, `gemStar`, `emaBoard`, `paperLantern` (paper with ribs), `plankCrate` (planks + frame + iron bands and rivets). The catalogue's procedural builders in src/props/models.js use them: firework barrel, water jar, iron ball, sack, hay bale, small crate, brazier, torch post, lantern post, bell, chime, snowball and ice block, plus debris.
- **Gameplay visuals (visual builders only, no logic changed)**: pickups.js (星屑, the stardust, is a bevelled gem star, hearts are extruded and glazed, food is lathed); collect.js (月之泪, the moon tear, is a lathed glass tear with a glow core, built non-indexed for flat facets; ema boards have a roof, cord and ink strokes); lanterns.js (save lanterns are ribbed paper on a lathed post); mechanics.js (carved stone with moss for the mechanism pieces).
- Fixed along the way: `mergeGeometries` failing on mixed index/attribute sets in models.js (the merge now normalises attributes); a `flatShading` warning in collect.js.

### Rules for other systems
- New static models: add a recipe in `RECIPES` of tools/refine-models.mjs, run it with the id and `--manifest`. Never hand-edit refined files. Re-running is deterministic.
- Code that reads a prop's materials by name still works: material names are kept. Code that expects textures (`map`) on prop_* models gets none now. Colour lives in COLOR_0.
- Element tints (char, wet, frost) stay per-instance colour in models.js and multiply over the baked vertex colours.
- Colliders, physics bodies, ids, catalogue API and positions are unchanged. Refined models keep the original bounds within a few mm, because subdivision is applied with crease pinning on the base.

### Cost (1440×900 'high', headless, shared machine)
- Village: draw calls 773 → 800 (+27), frame triangles 2.68 M → 3.09 M, prop triangles about 235 k → 416 k. Town: +78 k triangles, about +103 calls (the originals already cost +80 there). Prop layer time A/B, best of N renderFrame + gl.finish: about +0.8 ms (village), +0.1 ms (town). This is inside the 1 ms budget but close to it in the village.

### Known shortfalls
- Chests (and their opening), stone lanterns that can be lit, and the great lanterns are built in structures code (factories.js / decor.js), which this upgrade does not own. They are not upgraded (see the report's requests).
- Asset-pack shapes still show at close range: pumpkins are the pack's lobed blob, now smooth. Hay bales and straw sheaves look busy. Box props have shading bevels, not geometric ones. The silhouettes stay straight-edged.
- The props have no LOD tier. Refined meshes are drawn at full density at every distance. A simplified far LOD (or the original as LOD1) would recover most of the +180 k village triangles.
- Lily pads and lotus are smoothed and pulled to the palette, but they are still the pack's flat shapes. They are not rebuilt to the painterly flora's level.
- The hero close-up cameras for the ema board and the 向日葵之丘 (Sunflower Hill) seed were badly placed (inside grass or a wall). These two were judged only from game-distance shots.

## Draw-call pass (2026-11-14, see docs/api/perf.md)
- `models.js`: all live props of all types draw through shared `THREE.BatchedMesh`es, one per (material family, attribute
  set). Lit vertex-coloured parts take the white family material of `kit.js colourFamily` (their colour multiplied into
  the vertex colours). Instances are culled one by one (camera and shadow cameras); hidden `cond` parts are invisible
  instances. alloc / release / writeItem / writeColor are unchanged; burning, breaking and pick-up work as before.
- Props draws at the village / town scenes: 54–73 → 21–27.
