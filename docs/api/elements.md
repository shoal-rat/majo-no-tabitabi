# elements — as built

## Summary
The elements system ("all things act on each other", G.elements) is written from scratch and replaces the stub. The previous attempt had left no code. It is split into seven modules under src/elements/. It covers: a reactor registry with a spatial hash and status timers; apply() with the full §3.2 reaction table; a 2 m ground-fire automaton over grassland; flames drawn as one instanced draw call (cel-banded, glowing, flickering, with ground firelight) plus 4 pooled flickering point lights; frost shells and sparks; rain zones with a cloud disc; wind (wandering breeze, updraft and gust fields, updraft above fires); ice floes; and lightAt/addLight. Every test in the assignment was run with --systems physics,elements and passes with no errors, at a steady 60 fps. The look was judged from screenshots by day (x≈-380), at night (290,60), at dusk on 镜湖 (Mirror Lake), and in rain. Three visual bugs were found and fixed along the way: the rain streaks were invisible because their quads faced away from the camera; the flame cores were clipping to white; and the night fire did not show on the dark grass, so a ground glow and stronger night point lights were added. No core or locale changes were needed: the module shows no player-visible text, and check-i18n passes.

## Public API
G.elements = {
  ELEMENTS, MATERIALS {flammable, burnTime, conductive, freezable, living?}, STATUSES, FIRE (tunables), Reactor (class)
  ★ register({ owner, kind, material, pos|getPos, radius, height?, team?, flammable?, burnTime?, conductive?, freezable?, immune?:[status|element...], on:{ignite, extinguish, burnTick(r,dt), burnout, wet, dry, freeze, thaw, shock(r,power,info), hit(r,element,power,hinfo), light(r,power,info), shatter(r,info)}, center?, living? }) -> Reactor
     POSITION RULE: pos is the BASE (feet / foot of the trunk) and the body spans pos.y..pos.y+height. With center:true, pos is the CENTRE; this is the default for kind 'prop' (physics bodies). getPos is read every frame. A pos Vector3 is kept as a live reference and re-read on a rolling scan (256 per frame); call r.moved() to force an immediate rehash.
     Additions: on.dry, on.shatter; `living` (flesh/spirit/shade/creature: burning is a status that ends with on.extinguish({natural:true}), not burnout).
  ★ unregister(r)
  Reactor { owner, kind, material, team, pos, radius, height, burning, wet, frozen, shocked, lit (seconds left), fuel, charred, y0, cy, ignite(power,info), extinguish(info), soak(sec), freeze(sec), thaw(), shock(power,info), is(status|'charred'), moved(pos?) }
  ★ apply(element, pos, radius, power=1, info={source, team, dir?, damage?, noGround?, halfAngle?, impulse?, heavy?}) -> Reactor[] (includes thunder-chained reactors)
     on.hit gets hinfo = info + { element, power, mult, reaction?, shatter?, purify?, split?, melt?, chain?, empower? }. mult is the damage multiplier for the owner to apply: fire vs shade ×1.5, sun vs shade ×2, earth (or info.heavy) on frozen ×3.
     Lanterns (kind 'lantern') never get a burning status. Fire calls on.ignite (or on.light if there is no on.ignite), sun calls on.light, water and wind (power ≥ 0.8) call on.extinguish. Returning false from the callback means "nothing happened". Rain does not put out lanterns.
     Wind also calls G.physics.pushCone(pos, info.dir, radius, halfAngle 0.6, impulse 7×power), or explode(pos, radius, 6×power, {up:0.5}) when there is no dir. Ice on water calls freezeWater; fire melts nearby floes.
     Thunder: hits conductors (metal, water, wet, standing in water), chains up to 8 m between conductors (24 at most), and strikes on open water run through everything standing in it. Dry wood: split + ignite. Stone/crystal: shatter. Chain drawn with G.fx?.lightning.
  Events: 'element:applied' {element,pos,radius,power,team,source}. 'element:reaction' is emitted once per type per apply: {type,pos,power,count,element,team,(links,chain for conduct)}. Types are steam melt shatter conduct ignite extinguish purify freeze thaw, plus these additions: fan, floe, split, resonate, light. 'element:ignite' {reactor}, 'element:burnout' {reactor}, 'terrain:scorch' {x,z,r,kind:'burn'|'wet'|'frost'} (burn events grouped per 8 m area each 0.2 s tick).
  ★ igniteGround(x,z,r=1,power=1)->cells lit · ★ extinguishGround(x,z,r)->cells put out · ★ isBurningAt(x,z) · ★ fireCount (burning ground cells)
     Additions: canBurnAt(x,z), wetGround(x,z,r,sec), burningCount (burning reactors)
  ★ rain(x,z,r=18,duration=20)->zone{remove()} · ★ isRainingAt(x,z)
  ★ addWind({kind:'updraft'|'gust', pos, dir?, radius, height, strength, duration, swirl?})->handle{remove()} · ★ windAt(pos,out) · breeze (Vector3, read-only)
  ★ freezeWater(x,z,r=4,duration=30)->floe{x,z,r,top,platform,mesh,t,melt(sec),remove()} | null if (x,z) is not water. Added addition: the floes getter.
  ★ lightAt(pos)->0..1 · ★ addLight({pos (a passed Vector3 is kept live), radius=10, intensity=1, duration?})->{pos,radius,intensity,remove()}
  query(pos,r,cb), nearest(pos,r,filter), lastChain {links:[[V3,V3]],reactors,t}, reactors, clear(), stats()
}
Ground fire tunables: 2 m cells, cap 420, each cell burns 4.2–6.4 s and spreads faster downwind. Strength drops by about 0.055 per generation, so an unaided blaze reaches roughly 30 m and dies out on its own. Burnt grass regrows after 150 s. Ground watered by apply('water') resists fire for 25 s. Fire never starts on water/beach, roads (<2.4 m), rivers (<4.5 m), warded ground (protection > 0.35), slopes > 0.8 rad, h > 62 or high 霜见岳 (Frostview Peak), craters, or the palace/moat/sea regions.

## Known issues
- Not tested with the real fx, sky/post-processing or terrain systems, because none of them are finished. I checked by code that smoke and ember emitters, burst names and lightning go through G.fx?.*, but have not seen them on screen. The bloom on flame cores (values above 1, toneMapped false) has not been checked against the real post chain.
- Ice floes do not have a separate physics body. The floe is a G.world platform, and physics mirrors platforms as fixed colliders on its own, so adding a body would duplicate it. Bobbing is visual only (±4 cm); the platform shrinks in steps while it melts. supportAt() returns null on a floe because it only sees dynamic bodies; use G.world.groundAt for the floe top.
- Ground glow quads are flat discs 0.35 m above the cell height, so they can be partly hidden on very uneven ground.
- The terrain system has to listen to 'terrain:scorch' to draw scorched ground; nothing in elements does it.
- Wind blowing out lanterns uses power >= 0.8. Rain never puts out lanterns (an assumed design choice: they are roofed).
- The 4 point lights always stay in the scene (intensity 0 when unused) so shaders do not recompile. The fx flash lights come on top of these against the §8 limit of 6 dynamic point lights.

## Look (u3, 2026-11-13) — visual side only
- Flame tongues: bright rim along the silhouette, orange body, darker red heart low in the middle; ×0.72 at night (no white cores).
- Grass-fire smoke: kit smoke puffs that rise (1.8 m/s) and fray, radius 1.0–2.2 m, two puffs per patch every 0.45 s.
- Reactions each have a shape in fx.magic (steam column, freeze crystals + frost feathers, conduct ground arcs, fire whirl, …).
- Known shortfall: burnt ground shows cream-orange patches at night (terrain scorch shading).

## Element weaving (元素交织, play-upgrade 2026-11-22)
Combining elements is now the point of the system. Everything follows a few general rules, the same for foes, the heroine,
props and the ground (a "chemistry" lens: elements change materials, elements change other elements, materials never change
materials directly):
- **water in any form** — a wet thing, a puddle, spell rain, a steam cloud — **+ thunder → charged** (conduct ×1.6, chains;
  a charged puddle shocks whoever stands in it; rain becomes a thunder cloud; steam becomes a charged fog),
  **+ ice → frozen** (wet foe freezes; puddle → ice sheet that freezes those standing in it; rain → hail; steam → rime/frost),
  **+ fire → steam** (×1.3 on a wet foe; puddle → steam cloud; rain → warm fog), **+ earth → mud** (wet foe → muddy/slowed;
  puddle or rain-soaked ground → mud).
- **fire melts ice** (frozen foe ×2; ice sheet / frost → puddle; her ice dais → steam explosion; ice on lava → steam explosion).
- **wind carries what it touches** (burning things spread, her own fireballs swell, steam drifts, rain clouds drift, a tornado
  takes on fire / thunder / ice / water). **thunder on fire bursts it** (overload ×1.5, the flames leap to things near).
- **earth + fire → molten rock** (a pillar raised through burning grass, a meteor crater) — water quenches it, ice blasts it.
- **friendly fire**: statuses of a field (wet, chilled, muddy, set alight) apply to everyone standing in it; damage spares the
  caster's side, exactly like apply().

### Statuses (Reactor)
`muddy` and `chilled` (seconds left) join burning / wet / frozen / shocked / lit; STATUSES lists all seven.
- **★ `reactor.speedMul`** — 0 frozen, 0.45 muddy, 0.7 chilled, else 1. **Owners should multiply their movement by it.**
  Until they do, elements scales the horizontal step of every creature mover (owner.pos) in its lateUpdate. An owner that
  applies speedMul itself sets `owner.handlesSlow = true` (or set `G.elements.ownerHandlesSlow = true` for everyone).
  The heroine is never touched by that fallback (player.js would have to read `P.reactor.speedMul`).
- chilled + ice → freezes even when dry. Fire removes chilled.

### Multipliers (hinfo.mult, consts.js MULT)
conduct 1.6 (wet / in water, chained hits too), steam 1.3 (fire on a wet living thing, water on a burning one), melt 2 (fire on
frozen), shatter 3 (earth / heavy / thunder on frozen), overload 1.5 (thunder on burning). Shade multipliers stack on top.
hinfo.reaction is one of: conduct steam melt freeze shatter overload fan mire ignite extinguish purify resonate split, plus
`lava`, `chargedfog`, `steamblast` for field / fusion damage. Field and fusion damage carries `hinfo.fusion = true`.

### Ground fields (src/elements/fields.js)
Kinds: `puddle` 水洼 (puddle: water landing on ground), `charged` 电光水洼 (charged puddle), `icesheet` 冰封水洼 (frozen puddle), `steam` 蒸汽云 (steam cloud), `mud` 泥沼 (mire),
`frost` 霜地 (frost ground: a big ice burst), `lava` 熔岩 (lava). Field = `{ id, kind, x, z, y, r, t, life, power, team, source }`. ≤ 18 at once;
the same kind overlapping grows / refreshes. Ice sheets and charged water fall back to puddles; spell rain quenches lava.
Steam swallows hostile fire projectiles flying into it. Looks are persistent G.fx.shape handles + timed kit accents.
- **★ `G.elements.fieldAt(pos, kind?)`** → the most recent field holding (pos.x, pos.z) (pos.y optional: feet within ~1.9 m of
  the surface; steam: inside the 4.6 m cloud) or null.
- `G.elements.fieldsNear(pos, r, cb)`, `G.elements.fields` (live array, read-only).
- `G.elements.addField(kind, x, z, r, { life, power, team, source })` → field | null (not on open water except steam).
  Map / landmark code may pre-place puddles, mud, frost.
- `G.elements.touchGround(element, pos, radius, power, info)` → the ground half of apply() without hitting reactors (used by
  the rising rock pillar: puddle → mud, burning grass → lava).
- **★ `G.elements.concealedAt(pos)`** → true inside a steam cloud. **Combat: foes should not acquire / keep the heroine as a
  target while `G.elements.concealedAt(G.player.pos)`** (and a foe inside one is easy to lose).

### Combos, discoveries
- Catalogue: `src/elements/catalog.js` COMBOS (also `G.elements.COMBOS`): id → { kind 'reaction'|'field'|'fusion', els, mult?, big? }.
  29 entries. Words: `elements.combo.<id>.{name, recipe, desc, hint}`.
- **Event `'element:combo'`** `{ id, kind, els, pos, team, mult, count, big, quiet }` — every reaction on a living thing,
  every field change and every fusion. `quiet` = a repeating tick (no callout).
- **Event `'element:discovered'`** `{ id, pos, total, of }` — first time the player's team causes a combo; persisted in
  `G.state.elementNotes[id]` (count). The UI toasts it and fills the journal page.
- `G.elements.combo(id, pos, { team, mult, count, big, quiet })` — emit one yourself (e.g. a boss with its own fusion).
- `G.elements.blast(pos, R, { element, team, source, damage, mult, reaction, impulse, up, soak })` → count — raw area hit on
  living reactors (friendly-fire rule) + physics push.
- `G.elements.addStatus(r, 'muddy'|'chilled'|'wet'|'shocked', sec)`, `G.elements.statusesOf(r, out?)` → [{ id, t }]
  (frozen, burning, shocked, wet, muddy, chilled), `G.elements.active` (Set of reactors that carry a status).
- `'element:applied'` now also carries `info` (the apply() info object; read only).

### Fusions (src/spells/fusions.js — her own lingering spells)
Tornado (wind big) + fire 炎旋 "fire whirl" / thunder 雷旋 "thunder whirl" / ice 冰旋 "ice whirl" / water 水龙卷 "waterspout" (cast into it, shoot through it, or rain on it);
rain cloud (water big) + thunder 雷雨云 "thunderstorm" (strikes foes under it ~1/s) / ice 冰雹 "hail" (hail + frost) / fire 暖雾 "warm fog" (fog bank) /
wind 骤雨 "squall" (the cloud drifts on the gust); rock pillar + thunder 引雷石柱 "lightning-rod pillar" (the pillar is conductive: it arcs to the nearest foe
every 0.45 s for 6.5 s, then crumbles; strikes on it chain to wet foes); ice dais + her fire 蒸爆 "steam blast"; meteor into a lake 巨浪 "great wave"
(soaks r 16, shore puddles); meteor on land leaves lava in the crater; a gust through her own flying fireballs 风火 "wind-fire".
Only the same team fuses; fusion effects carry `info.fusion` and never fuse again. Rain zones got `vx, vz` (drift) and
`mood` (null | 'storm' | 'hail').

### UI (src/ui/reactions.js, G.ui.reactions)
Callouts at the meeting point (brush stroke in the two elements' colours, ×mult, a kicker on fusions; on a creature they
sit at its top + 2 m, above combat's foe plate); status marks over foes and creatures within 40 m (≤ 10, up to 4 pips with
draining rings) hang just BELOW the point top + 1.05 m — the anchor of combat's plates (src/ui/foes.js), so a plate and
the marks stack without overlapping. `G.ui.reactions.pips = false` hides the marks if another module draws statuses.
Journal → 「元素笔记」 (Element Notes) page (third sub-tab): every combo, discovered ones with recipe / text / multiplier / count, unknown
ones with a hint. A toast on each first discovery; a toast when the story grants thunder / big forms.

### Story
Fran's last lesson (`invest`) now grants thunder 2 and the big forms of wind / water / fire / ice (earth 2 as before);
story.js start() back-fills saves past `majo_named`; such a save gets one toast on load (`flags.elementsKit`).

## Fire look (flame cards, 2026-11-23) — visual side only
Fire used to be lathed flame volumes (`fireSurface.js`, two extra draws) plus fx lobes and tongues that read as stiff
orange cones. It is now painted the way anime paints fire: soft, layered tongues with a deep-red rim, an orange-red body
and a small golden heart, licking upward, splitting at the tip, leaning downwind and swaying; embers rise and smoke rolls
off the top. Spread, damage, timings and every gameplay rule are unchanged (fire.js only gained the `heatCell` accessor).

**One instanced draw** (`elements-flames`, renderOrder 4, `fxMaterial` premultiplied blend, fog / canvas tone path via
`fxOut`). Each instance is a 10-vertex camera-facing strip (8 triangles) of one type: flame tongue, spark (shocked
reactors), ground firelight disc, ember, smoke puff. Paint order = instance order: smoke → back tongues + firelight →
tongues + sparks → embers. Layer caps 360 / 480 / 1600 / 640 (`MAX_FLAMES` 3080).
- **Tongue shader**: three taps of a 128² tileable fbm (R period 4, G period 8) scrolling upward on a per-instance phase;
  a teardrop mask with round foot and broad shoulders that the noise eats from the top into two or three tips; a smaller
  inner heart with its own flicker; height pulse and sway in the vertex shader. Palette is tuned through the soft look's
  AgX curve (bright orange would roll to cream): rim (0.25, 0.02, 0.002), body (0.5, 0.085, 0.002), heat (0.8, 0.2, 0.004),
  heart (0.95, 0.48, 0.02) linear — under the day bloom threshold, ×0.8 at night. Layers: 0 back (big, darker, softer),
  1 middle, 2 front (hotter). The card tilts 40 % toward camera-up so fire reads from the broom.
- **Wind**: the tip leans by visual wind (`visualWindAt`, else `breezeAt`) × 0.08 × height, capped at 0.8 × height, bent
  quadratically; ground cells read the wind stored on their 6 m heat cell once per frame.
- **Embers / smoke** are stateless loops: the vertex shader moves them (`fract(time × rate + seed)`, rise, drift with the
  wind, swirl); the CPU only writes the source. A negative rate means "timed": the CPU places it and passes the phase.
  Smoke is lit by fx's shared ambient colour, warm underneath near the flames.
- **Near fade**: cards the camera is about to pass through dissolve (no flat planes across the lens).

**Sources** (counts scale with `G.quality.particles`; `low` = < 0.6):
- ground cells: a middle tongue each, plus a hot front tongue within 75 m (low: one bigger tongue, front ones off, 45 m);
  per 6 m heat cell: firelight disc, a back tongue (heat ≥ 1.5, low ≥ 3), 1–3 smoke loops, 2–5 embers.
- burning trees: 4–12 tongues on the camera-facing skin of the crown and over its top, two up the trunk, smoke off the
  crown, embers. Uses the flora handle's new `crownY` / `crownRY` (crown centre above the foot, half height); without
  them the crown is guessed at 0.64 × height.
- other burning reactors: a back tongue plus 1–5 tongues hugging the body, smoke off non-living things, embers.
- whirls, patches and short-lived pieces (pool of 256) through the API below.

**API — `G.elements.flames`**
- `lick(pos, { n=3, r=0.5, h=1.2, dur=0.7, heat=1, spread=1, delay=0 })` — short licks; `G.fx.kit.tongues` routes every
  warm-coloured call here (other colours keep the painted lathe).
- `burst(pos, normal, radius=1, big=false)` — a fireball bloom: a fat rising puff (three layers), 3–8 tongues licking out
  and up, smoke (none for radius < 0.5). `combustion.bloom` (fx: hit_fire, ignite, fire explosions, the fire cast
  release) routes here; `combustion.soot` does nothing while the cards exist.
- `whirl({ pos, R=4, H=20, dur? })` → `{ pos, R, H, k, alive, kill(sec), remove() }` — a swirling flame sheet: three arms
  of tongues spiralling up the funnel (each trailing behind its motion), a turning ring at the foot, smoke off the top,
  swirling embers. `k` (0..1.2) scales it. `kit.whirl({ flame: true })` makes a timed one.
- `patch({ pos, r=2, I=1 })` → `{ pos, r, I, alive, dims(r0, r1), kill(sec), remove() }` — low flames breathing on a
  pool; it has the fx shape-handle interface, so fields.js keeps it in a lava field's `look` list.

**Wiring**: 炎旋 (fusions.js) = a whirl handle (`tw.flame`, `k` follows the tornado); its air funnel shapes erode to wisps
(0.6 / 0.9) in smoky colours while it carries fire and recover when it changes element. Lava fields carry a patch and the
lava disc is retuned (0xf2460a / 0xffb848 × 1.05; was cream). The grass-fire kit smoke columns and the per-cluster fx
'smoke' / 'embers' emitters are gone (the cards draw both). `src/elements/fireSurface.js` is deleted.

**Cost** (`.tmp` probe, 1280×720, 'high', same scene scripts before / after; fire draws = flames meshes only):
grass fire 3 → 1 draw, 19.5 k → 2.0 k tris · burning tree 3 → 1, 19.4 k → 1.7 k · meteor crater 3 → 1, 47.2 k → 9.6 k ·
fire tornado 3 → 1, 39.3 k → 9.2 k · fire explosion 3 → 1, 43.7 k → 9.7 k. Live fx shapes in those scenes drop (e.g. the
tornado 63 → 15). 'low': ≤ 600 instances, ≤ 4.8 k tris in the same scenes. The cost that matters is overdraw: big
fires stack 3–5 translucent cards per pixel.

**Known gaps**: no soft depth fade where a card meets steep ground (crater walls cut tongues in a straight line; only
the near fade helps); the fire bolt in flight is still the fx lobe mantle (`combustion.flight`); the tornado's air
funnel still shows faint smoky wisps; smoke / ember loops of a newly lit heat cell start mid-flight (faded by the cell's
heat, but visible on a fast spread); on the canvas path ('low', no post chain) the golden heart is a little paler.
