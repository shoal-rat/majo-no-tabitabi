# fx — as built

## Summary
The visual-effects system (G.fx) is finished and tested. src/fx/fx.js is no longer the 2-line stub. I picked up from the previous engineers' PROGRESS.md. Kept and reviewed: glsl.js, particles.js, atlas.js, recipes.js, ribbons.js, bolts.js, decals.js and lights.js. Newly written: text.js, ambient.js and fx.js, which ties them together.

What it provides:
- **Particles:** two GPU particle pools (4600 additive glow + 3400 soft alpha = 8000). Motion is computed in the vertex shader from spawn data, so the CPU only writes when a particle is born; the pools are ring buffers with partial uploads.
- **Sprites:** a procedurally drawn sprite atlas with 40 sprites, plus a magic-circle texture.
- **Names:** every burst and emitter name in §6.3, each a small per-element composition.
- **Other effects:** ribbon trails (one draw call, 48 slots), ground rings / discs / magic circles (one draw call), persistent beams with a clash ball added automatically where two beam heads meet, lightning with branches and a second fainter strike, and 4 pooled flash lights. The flash lights stay in the scene at intensity 0, so shaders are never recompiled.
- **Text:** floating text from a 32-slot canvas atlas that reuses strings already drawn.
- **Shake:** screen shake on a trauma model, written to G.fx.shakeOffset.
- **Ambient motes:** each spawn reads the veil at its own spot, so the mix blends across borders. Pollen and petals in the sun lands, maple and ginkgo leaves at dusk, fireflies and spores at night.

Everything runs on game time, so effects freeze in the menu and slow during hitstop.

Problem found and fixed: three r187 uploads geometry before an object's onBeforeRender runs, so updates made there show up one frame late. fx therefore uploads all its buffers in its lateUpdate and again in a chained scene.onBeforeRender.

Changes to the inherited files:
- **Glow colour (glsl.js):** when the game draws straight to the canvas (no post chain), glows now use a soft clip `1-exp(-add*0.5)^0.8` instead of ACES. ACES washed every hot colour to white.
- **Look tuning (recipes.js):** fire is orange and rolls into dark smoke; thunder is violet; dark smoke is inky violet; water is bluer; rain is visible; the explosion flash is lifted so the ground does not cut it off; auras emit 1.5× more.
- **Beams (bolts.js):** stronger halo.
- **Distance LOD:** very large bursts are no longer thinned out as early by distance.

## Public API
G.fx (fxSystem in src/fx/fx.js). Everything marked ★ in §6.3 is kept with the same names and parameters.

Common opts for burst() and emitter(): { color, color2, scale, count, dir, normal, power, grounded, radius, height }
- color: hex number, THREE.Color, CSS string, or an element name such as 'fire' (mapped to ELEMENT_COLOR). It tints only the magic parts; smoke and debris keep their own colour.
- color2: the second side's colour for clash, clash_big, clash_ball.
- scale: size multiplier (1 = the recipe's nominal size).
- count: particle-count MULTIPLIER (1 = recipe default). It is also multiplied by G.quality.particles and by distance LOD.
- dir: direction. normal: surface normal, default +y. For hit_* bursts that get a dir but no normal, the normal defaults to -dir, so sparks spray back toward the attacker.
- power: clamped to 0.25..3. Scales particle count, flash-light intensity and shake.
- grounded: forces ground rings on or off. By default it is detected automatically (within about 0.8 m of the ground).
- radius / height: let area emitters (rain, snow, updraft, …) cover a bigger or smaller area.

★ burst(name, pos, opts?)
- Unknown names are ignored with a single console.warn.
- All 39 required names are implemented. Extra: 'boss_death_end' (fired automatically by boss_death after 1.8 s).
- Nominal radii: hits 1, explosion 3, explosion_big 7, crater 9, greatlantern 8, clash 1.5, clash_big 4.

★ emitter(name, opts?) -> { pos: Vector3, dir: Vector3|null, normal, rate, active, color, color2, scale, count, radius, height, range, stop(), remove() }
- rate is a multiplier of the recipe's base rate (default 1). Setting active=false pauses it; stop() does the same; remove() deletes it.
- Births are spread along the path the emitter moved during the frame, and particles inherit the emitter's velocity.
- Emitters farther than range (default 150 m + radius) from the camera do not emit.
- Unknown names return an inert handle and warn once.
- All required names are implemented, including aura_<element> for all 9 elements. Extras: 'clash_ball' and 'charge' (motes streaming into a point while a spell charges).

★ trail(opts) -> Trail { push(pos), stop(), reset(), setColor(c0, c1?), setWidth(w), remove() }
- opts: { color, color2 (tail), width = 0.35, life = 0.45 s, style: 'glow' | 'band' | 'streaks', add = 1, intensity = 2.2, taper = 1, pos }.
- If all 48 slots are busy, it returns an inert handle.

★ ring(pos, { color, radius = 4, dur = 0.6, y?, delay?, intensity?, thickness? })
- y is an explicit height; by default the ring sits on the ground + 0.06 m.

★ beam(opts) -> { set(from, to), setWidth(w), setColor(c), setIntensity(i), remove() }
- opts: { from, to, color = 0xffd27a, width = 1.4 (full width in m), intensity = 1, sparks = true, light = true }.
- Fades in over 0.12 s and out over 0.18 s. Up to 8 beams at once.
- When two beams' `to` points are within 1.5 m, a clash ball is spawned between them automatically, coloured by both beams.

★ lightning(from, to, { color = 0xc9a0ff, branches = 3, dur = 0.28, width = 0.36, intensity = 1.6, impact = true })
- Draws a jagged bolt plus a second, fainter strike along a new path. impact adds sparks, a glow and a flash light at `to`.

★ flash(pos, color, intensity = 50 (candela), dur = 0.25, distance?)
- 4 pooled PointLights; when all are busy, the dimmest is reused.

★ shake(amount, dur = 0.3)
- Trauma model: trauma = min(1, trauma + amount); the offset is trauma² × 0.55 m × smooth noise.
- G.fx.shakeOffset is a WORLD-space Vector3, already rotated into the camera's right/up. The camera system should add it to camera.position.
- Respects G.settings.shake (false = off; a number = multiplier).
- Bursts call shake themselves, attenuated by distance from the camera.

★ text(pos, string, { color = white, size = 1, dur = 1.1, kind, target, n, el, big })
- The caller passes an already translated string.
- Roughly constant on-screen size, drawn over the finished picture (see "Combat type round" at the end).
- kind 'dmg' | 'word' | 'call' (or none for the older motion); target = the foe (or her) the label belongs to. See below.

Extras:
- sigil(pos, { color, radius = 2, dur = 1.5, intensity, spin, y }): a spinning magic circle on the ground.
- clear(): removes everything.
- stats(): { glow, soft, live, cap, trails, beams, bolts, decals, lights, emitters, texts, time, spawned }. It is O(capacity), for tests only.
- names: { bursts: [...], emitters: [...] }.
- ELEMENT_COLOR, elementColor(el, fallback).
- ambient: { enabled, density, weights: [sun, dusk, night] at the focus }.

Behaviour notes:
- Wind comes from G.elements?.windAt(pos, out); without it a gentle default breeze is used.
- Smoke, dust and leaves are lit by a colour derived from G.lights.hemi and .sun (plus .moon and .ambient if present), or from G.env.veil when those are missing.
- fx clears itself on start() and when the mode changes to 'title'.

## Known issues
- Only the direct-to-canvas path was tested; the HDR path through the sky system's post chain and bloom could not be checked, because the sky system is not built yet. Additive intensities (3–7 for sparks and flashes) are meant to sit above the bloom threshold. Once the sky system exists, overall glow brightness may need one more pass: the tuning knobs are shared.uAddGain / uAddGamma, which only affect the canvas path, and the per-recipe I values in recipes.js.
- Particles have no soft fade where they meet geometry, so large camera-facing sprites (flashes, the clash_big shock dome, the ice-shatter flash) are cut by the ground plane when spawned at ground level. The explosion flashes are lifted to avoid this; a few others are not.
- Ring, disc and magic-circle decals are flat discs. On strongly sloped terrain, large rings partly sink into hills.
- Aura emitters are subtle at camera distances of 8 m or more (by design, but worth reviewing once they are on real characters). At dusk the ambient leaves blend into the olive fallback ground; they are only clearly visible against the sky.
- The fps figures come from headless Chrome capped at 60 fps by vsync, not from a real GPU timing at 1440×900.
- Flash lights: four PointLights sit in the scene permanently at intensity 0, which adds 4 point lights to every lit material. That fits the §8 budget of ≤ 6 dynamic lights only if other systems add at most 2.
- If another system later replaces scene.onBeforeRender without chaining it, buffers written after fx.lateUpdate show up one frame late. fx also uploads in its own lateUpdate, so in practice only effects spawned in other systems' lateUpdate are affected.


## As-built updates (fix-render, 2026-11)
- Light budget (`src/fx/lights.js`): `export budgetCandela(I)` = I up to 30 cd, else 30 + 25·ln(1 + (I−30)/30) (50→43, 120→65, 500→100). `G.fx.flash(pos, color, intensity, dur, distance)` and every fx light pass through it; reach is capped at min(distance, 6 + 3.2·√I_budgeted). Old flash intensities in this doc are pre-budget values.
- Burst id 'embers' is an alias owned by fx; gameplay / combat code uses 'ignite'.

## As-built updates (u3 — the look of magic, 2026-11-13)
What changed: magic is now drawn mainly with MESH shapes (painted, eroding, 2–3 flat tones) instead of glow sprites; every spell
has the five beats; the 对波 (beam clash) struggle is a set piece; reactions have a readable shape each; the 月障 (moon barrier) is a moonlight veil.

**Shapes (`src/fx/shapes.js`, one instanced draw call, cap 160, renderOrder 22).** `G.fx.shape(opts)` → `true` | handle | null.
- kinds `disc ring cyl cone dome sphere tongue arc crystal`; tex `billow streak cells glyph seams`; mode `flame sheet smoke glow glyph shell`.
- opts: pos, up, fwd, r0, r1, h, span, start, dur, delay, grow [a,b], erode [a,b] (threshold over life: <0 = solid at birth,
  ~1 = gone), soft, tile [u,v], scroll [u,v], color, color2 (rim), core (heart tone ×), add (0 = premultiplied alpha … 1 =
  additive), I, body (alpha of the body under the rim), twist, wobble (tongue), **rise** (sphere only, m/s, slowing — smoke),
  handle (true → { pos, up, fwd, I, dims(r0,r1,h,span), color(a,b), erode(a,b), kill(sec) }; handles live until killed),
  **drape** (disc only: every vertex stands as high above the terrain as the centre does, sampled from
  `G.terrain.dataTexture`, a little lower on cliffs and in fresh crater bowls where the 2 m texture rides above the land
  mesh; centre it on `G.terrain.dataHeightAt(x, z)`. Ground fields use it so puddles follow slopes).
- 'smoke' mode is lit by the shared ambient colour and its sphere silhouette frays (no hard disc edge). 'seams' = the
  cells' seams as lines (ground cracks; thins outward). Painted texture: R billow, G streak, B cells, A invented glyph band
  (no ring-with-bar shapes — nothing that reads as a real letter).
- Pool full → the oldest fire-and-forget shape is stolen; handles are never stolen (null is returned).

**Kit (`G.fx.kit`, `src/fx/kit.js`)** — element signatures built from shapes, fire-and-forget, scaled by quality:
shock, dome, mark(pos, r, 'scorch'|'frost'|'wet'|'crack'|'glow', dur) (tilted onto `G.world.groundPlane` under it, so a
mark on a slope lies along it; platforms count as ground), glyphs (talisman ring, `handle` option), tongues,
fireball, smoke (rising puffs; repeated calls make a column), crown, sheet, crystals, coldMist, strokes, gustCone,
whirl (`flame: true` = fire whirl), shards, dustSkirt, petals, crescents, mirrors.
- Frost marks are radial feather streaks; scorch is warm charcoal (no red); cracks are seam lines.

**Magic layer (`src/fx/magic.js`, `G.fx.magic`)** — listens only, never changes gameplay:
- 'spell:cast' → release beat at the hand (shock ring facing the cast, flash light, element signature) and, on big casts /
  shikigami / kinkan / every earth cast, glyph circles under her + a rising light column. Guard and charm are skipped (too frequent).
- projStart / projDraw / projEnd(p) — called by spells/projectiles.js: fire orb = rolling fireball + flame tail; water orb =
  thick drop + streak tail; ice lance = faceted crystal.
- Every live beam gets a scrolling outer sheath + white core (handles); the old fx.beam is now only a halo (I 0.75, ×0.55 at night).
- 'beam:struggle' start → churning two-colour clash ball (two eroding spheres + a small white heart), shock rings on every push
  (mash or clash point moving) with pressure shake, sideways arcs in both colours, ground cracks + dust skirts under a low
  clash, a sky veil (back-face sphere around the camera, tinted to the mix of both sides, ~0.42 → 0.30 opacity at night).
  End → the loser's beam breaks backwards: a chain of six bursts + rings + mirror shards to the loser's hands, then a dome,
  a ground ring, scorch + crack marks.
- 'element:reaction' → steam (white rising column + swirl), melt, freeze (crystals, cold mist, frost), ignite, extinguish,
  fan (fire whirl), shatter, purify, resonate (rings + light column), conduct (ground arcs + glow), split, thaw, floe, light.
- Emits **'fx:blast' { pos, radius }** (visual only) at struggle cracks and the struggle break — for grass / cloth owners.
- Night: `shared.uAddGain` = 0.5 − 0.15 × veil (softer clip of every additive glow in the night grade); beam sheath ×(1 − 0.4 veil).

**Other:** burst 'moon_motes' (slow silver motes + a crescent), 'embers' (alias kept), 'shatter_rock' (kept, landforms uses it).
`X.hitstop(sec)` in recipes → `G.hitstop(sec, 0.06)` unless shake is off; used on explosion_big and clash_big (60–70 ms, < 45 m).
Grass-fire smoke columns (elements/flames.js) are kit smoke: 2 puffs per patch every 0.45 s, ≤ 2 patches, < 140 m.
Flame tongues (elements/flames.js) are repainted: bright rim along the silhouette, orange body, darker red heart; ×0.72 at night.

**Rules for other systems.** Use `G.fx.kit` / `G.fx.shape` for new magic looks rather than glow sprites; additive (`add` ≥ 0.6) only
for accents. Keep a handle only while you update it and always `kill()` it. Do not put shapes on render layer 5.

**Cost.** Struggle frozen mid-push, 1440×900 'high', p25 of 60 × renderFrame + gl.finish, best of 4 A/B alternations (day / night):
all 2.6 / 2.6 ms, kit layer hidden 2.7 / 2.5, all fx hidden 2.6 / 2.5 — the difference is below what this method resolves on
the shared machine (it is not trustworthy as an absolute: gl.finish in headless Chrome does not appear to wait for the full GPU
frame). Struggle: ~62–74 live shapes (one draw call) + ~220 particles. Ambient effects unchanged.

**Known shortfalls (u3).**
- Close to the lens the heroine's own beam is still a wide bright bar (the halo + bloom); the rival side reads better.
- The clash ball is still mostly a soft white-violet glow at night; the churning two-tone body shows best by day.
- Shapes don't move except by handle or `rise`: debris arcs / flying shards are still particles.
- The grass-fire ground leaves cream-orange patches on burnt terrain (terrain scorch shading, not fx) that read oddly at night.
- Grass does not flatten and cloth does not whip during a struggle yet: 'fx:blast' is emitted but nobody listens (requests filed).
- Reaction looks were audited from emitted events side by side, not each from its real gameplay trigger.
- Timing in headless shots is loose (screenshots take real seconds), so the A/B pairs are not frame-exact.

## As-built updates (final-duel — the beam struggle and big-spell impact, 2026-11-14)
**Beams are painted, in the caster's element.** `fx.beam` (bolts.js style 1..10, still the one bolts draw call) draws the
whole beam: an alpha-blended body in the element's colour with cel shade bands, foam / bright strokes and bulges rolling
outward from the caster, a thin wavering heart (the only additive part besides the flare), a dark outline, short rays
at the hands, a faint outer glow, and a far end that dissolves into whatever it meets. Body values sit under the bloom
threshold, so day and night keep the hue. Near the lens the beam narrows to 32 % and its glow fades (`vNear`, 0.8–7 m).
- `fx.beam({ ..., el })`, `handle.setElement(el)`; palettes `BEAM_EL` = sun, fire, water, ice, wind, thunder, earth, moon,
  shadow (body / heart / edge / dark outline, bolts.js `BEAM_PAL`); no / unknown el = the beam's own colour (style 10).
- The kit sheath + white core shapes on beams are gone; the white start-glow sprite is skipped for painted beams.
**Struggle (magic.js).** Two-colour mass (four eroding spheres, each colour rolling on its own half, leaning with the
side that is winning, plus a small warm heart); every push: two shock rings, a shake, `'fx:blast'` (radius 7, grass
flattens) and stronger gusts; arcs + 'struggle_spray' sparks thrown sideways in both colours; cracks + dust underfoot;
two **visual-only gusts** (`G.elements.addWind({ kind: 'gust', visual: true })`) from the clash toward each caster.
- **Sky tint through the sky's grade hook**: magic.js writes `GRADES.fxStruggle` (the land's own grade with vignette,
  shadow tone and a touch of gain pulled toward the two colours) and calls `G.sky.setGrade('fxStruggle')`; the previous
  grade (or 'auto') is restored when it fades out. The back-face veil sphere is removed.
- **The break**: the loser's beam shatters back along its length (rings + sparks of its colour, the winner's colour
  racing behind), a painted burst of both colours on the loser, dome, ground ring, scorch + cracks, dust, smoke, a
  visual gust, then 0.85 s of quiet and the remains fall by element ('remains' motes; 'remains_drops' for water / ice;
  crystals for ice, shards for earth, petals for sun / moon). Hit-stop 80 ms + flash in beams.js; camera kick in camera.js.
- New bursts: `struggle_spray` (dir = beam axis, color / color2), `remains`, `remains_drops`. clash_ball sprites are
  tinted and ~⅓ as bright (no white blow-out).
**Big impacts.** Ground rings / discs from recipes no longer scale past ×1.2 with `power` (big impacts flooded the ground
with cream-orange); explosion_big / crater discs dimmer; big ice shatters have less white mist; cold mist is blue.
**Wind.** `weather.addWind({ visual: true })` fields are skipped by `windAt` / `breezeAt` (bodies, the player, fire) and
included by `visualWindAt(pos, out)`, which weather.js publishes onto `G.elements` (fx particles already use it).

Cost: no new meshes or draw calls. Removed: the struggle veil sphere (−1 call while it showed) and the tornado's two
funnel meshes (−2 calls while one stands; it is now 3 shape instances in the shared batch). Live shapes in a struggle
went down (5 clash spheres vs 3 + 2×2 beam sheath / core). Struggle frame (day, game camera, 'high'): 568 calls,
2.49 M triangles, 287 particles, 17 shapes (T.stats / G.fx.stats in fdSeq_day).
Known shortfalls: cloth does not whip yet (rig.js reads `windAt`, request filed to read `visualWindAt`); the loser dome
reads a little like glass; the winner's beam keeps burning after the break (gameplay, unchanged), which shortens the quiet.

## As-built updates (vfx — anime duel magic, 2026-11-22)
Goal: every cast and duel moment reads like the Wandering Witch fights — circles blooming at the wand, comet bullets,
crisp lightning with afterglow, glitter, shield lattices, starbursts, slow beats, impact frames, a camera that keeps both
duelists in view. Most of it lands through the names spells / combat already call; new calls are listed below.

**Magic circles (`src/fx/circles.js`, one instanced draw call, cap 40 / 24 on 'low', renderOrder 24).** Four layers painted
into the RGBA channels of one 512² procedural texture: R outer rune band (invented glyphs, ticks), G star polygon {8/3} with
knots, B inner glyph ring + hexagram, A star-sparkle core. Layers turn in alternating directions, draw themselves on
around the ring like a pen (outer first, a hot pen tip at the front), the circle blooms in with a small overshoot and
leaves with a flare (bright spike + widening), a collapse or a fade. Additive only; lines peak ~2.5 (under BLOOM_CLAMP 4).
- `G.fx.circle(pos, { normal|dir, ref, radius=1, color (hex|element), core, intensity=1.4, spin=0.9, layers=15 (1 band,
  2 star, 4 inner, 8 core), dur=0.8, outDur, out:'flare'|'collapse'|'fade', draw (s to draw on), fill, delay, ground,
  handle, charge, tracked })` → handle `{ pos, normal, ref, radius, charge (0..1: layers appear at 0 / .22 / .45 / .72),
  release(style, dur), kill(), setColor(), setIntensity(), setLayers(), alive }` (opts.handle) | kill fn (tracked) | true.
  Handles are never stolen; copy into `pos` / `normal` every frame while you hold one and always release() it.
- `G.fx.ward(pos, normal, { radius=1.4, color, intensity=1.6, dur=0.32 })` — hexagonal lattice flash, a ripple through the cells.
- `G.fx.starburst(pos, { radius=2, color, intensity=1.6, dur=0.34 })` — camera-facing uneven rays, hot core, running ring.
- `G.fx.sigil(...)` (same signature, `tracked` still returns a kill function) and the recipes' ground sigils
  (`magic_circle`, `summon`, `levelup`, `greatlantern`) now draw the layered circle instead of the flat sigil decal —
  every telegraph / ground circle in the game upgraded at once.

**Casts (`magic.js`, listens to 'spell:cast').** Small forms: a quick small circle (band + core) at the wand.
Charged forms: the `charge` emitter (spells.js, unchanged) now grows a circle 0.6–0.8 m in front of the wand whose layers
draw on as the charge builds, a ground circle under her from a third of the way, and a visual-only updraft that lifts
hair and robe (`G.elements.addWind({ visual: true })`, read by rig.js through visualWindAt). When the charge ends the
circles linger 0.45 s; the cast flares them out (else they fold away). A big cast with no charge (rivals, scripts) gets
a "barrel" of three circles down the cast line. Big casts also: ground circle (replaces the glyph rings), a release gust,
hanging sparkles, a light shake for the heroine's own casts.

**Bullets.** Every projectile's trail is restyled to `style: 3` / `'comet'` (ribbons.js: hot thin core, wide soft halo,
beads of light running down it; ~2.6× the caller's life, up to 0.75 s) in an element palette, and sheds `bullet_glints`
every 45 ms within 45 m. Fire orbs keep their own streaks under the flame tail. `Trail.restyle({ style, width, life, add,
intensity, taper, c0, c1 })` changes a live trail. `G.fx.trail({ style: 'comet' })` for new ones.

**Lightning.** `G.fx.lightning(..., { afterglow })` (0..1, default 0.6 for dur ≥ 0.2 s, else 0.2): the strike keeps its
clock, then the channel glows on (light only) and cools away; a crisp white-hot thread runs through the strike.

**New bursts.** `sparkle_hang` (glints + dots that hang 1.5–3 s; color), `glint_burst` (star + short rays + glitter; dir),
`bullet_glints`, `dust_ring` (dust rolling out over the ground: big releases, finishers). Hits throw element glitter; `shatter_rock` / `hit_earth` add rock glitter; `clash` adds two-colour
starbursts, a camera-facing shock ring per side and hanging glitter (its old white flash sprite is dimmer); `clash` at
scale > 1.55 and every `clash_big` call `G.fx.duel.beat('clash', { big })`; `charge_done` adds a starburst + glitter.

**Duel cinematics — `G.fx.duel` (`src/fx/duel.js`).** Pacing / look only; never changes damage or outcomes.
`G.settings.cinematic === false` turns off slow motion, camera liberties and impact frames (no default needed: undefined =
on; a settings row is not added yet). Shake always goes through `G.fx.shake` → `G.settings.shake`.
- `slowmo(scale=0.3, hold=0.2, out=0.35)` — eases G.time.slow down in 50 ms, holds `hold` real seconds, eases back over
  `out`; overlapping calls keep the deepest. The frame loop multiplies it in (`src/core/boot.js`: `T.scale * T.slow`).
  Only in mode 'play'; reset on clear / mode change.
- `impact(color, k=1)` — impact frame: `G.sky.flash(color×0.5k, 0.12)` (1–2 frames of tint), at most every 0.3 s.
- `shake(weight, pos?)` — 'tap' | 'light' | 'medium' | 'heavy' | 'massive' | 0..1; distance-attenuated; heavy ones kick FOV.
- `gust(pos, dir, strength=9, dur=0.9, radius=3.5)` — visual-only wind: cloth / hair / grass / motes, never bodies.
- `angle(target, { dur=0.8, dist, mix, low, fov=-7, weight=0.85, cooldown=2.5, range=40 })` — a brief dramatic camera
  angle side-on to the line heroine → target (line-of-sight checked, other side tried), tighter FOV, eased in and out.
- `engage(foe)` / `disengage()` — explicit duel framing target; otherwise auto: Fran's spar (`G.story.spar.active`),
  the `G.combat.duel` enemy. `focus` = current target, `slow` = current factor, `enabled`.
- `beat(kind, pos, opts)` — `'parry'` (gold starburst + ward + flaring circle + rings + hanging sparkle, slow 0.22×,
  gold impact frame, medium shake), `'block'` (ward lattice + small ring), `'dodge'` (wind ring, slow 0.35×),
  `'clash'` ({ big, color, color2 }: slow, two-colour impact, angle), `'finisher'` (slow 0.2× ~0.45 s, impact,
  starburst, sparkle, gust, heavy shake, angle), `'break'` (struggle end).
- Auto-wired (listeners only): 'spell:clash' reflect → parry, block → block (the guard's centre / facing from
  G.spells.guards); 'player:dodge' with a hostile bullet closing within 0.5 s → dodge; 'enemy:killed' of a boss / elite →
  finisher; a G.combat duel turning `over` with `won` → finisher on the rival; Fran's spar ending in 'break' → finisher on
  Fran; 'beam:struggle' end → break; 'boss:defeated' → a short beat; the beat right BEFORE a decisive hit: a charged
  (form 'big') bullet of hers about to land on the duel foe (< 3.6 m, < 0.35 s out) → slow 0.28× + angle on the foe, and a
  charged / power ≥ 1.6 hostile bullet about to reach her → slow 0.35× (a chance to dodge); once per bullet, 2.2 s apart. Fran's wind-up (her 'journey:fran-aim' group is
  visible) grows a circle at her hand in the coming bullet's element (+ a ground circle in her volley phases) that flares
  when she throws.
- Camera hooks in `src/player/camera.js`: `camAssist(C, P, rdt, idle)` (adds distance; swings the yaw toward the foe only
  when the foe is > ~35° off and the mouse has been idle 0.45 s; never with a lock target or on the broom) and
  `camShot(pos, look, rdt, cine)` (dramatic angle blend, a 12 % pull of the look point toward the duel's middle; returns a
  FOV offset).

**Where other systems should call (not wired by vfx).**
- combat (duel patterns / wilds bosses): `G.fx.duel.engage(foe)` when a fight that is not a G.combat duel should be
  framed (e.g. a wilds boss); `G.fx.duel.beat('finisher', pos, { color })` on the hit that ends any named fight that does
  not go through 'enemy:killed' with `boss`/`elite`; `G.fx.circle(hand, { dir, radius: 0.9, color: el, handle: true,
  charge })` for a foe's charged tell (release('flare') when it fires); `G.fx.duel.angle(pos)` for a boss's big move.
- elements (fusions): `G.fx.circle(...)` with two layers in each element's colour (e.g. two circles, `layers: 3` and
  `layers: 12`, counter-spinning) for a fusion cast; `sparkle_hang` after it.
- spells.js: nothing required. Optional: pass `form` in 'spell:clash' so a charged clash is known exactly (today it is
  inferred from the clash burst's scale).

**Cost.** One new draw call (circles; a quad per circle, 4 texture taps per fragment; typically 0–6 live, ≤ 40). Trails,
glints and sparkles ride the existing pools (scaled by G.quality.particles and distance LOD). No per-frame allocations:
handles and option objects are created per event; Fran's wind-up reads `spar.stats` once per wind-up. Boot: the circle
texture is painted once (4 × 512² canvases).

**Known shortfalls.** The bullet orb itself is the spell system's sphere (spells/visuals.js): it reads as a glassy ball
next to the comet trail. Circles are flat: on steep slopes a big ground circle sinks into the hill. Slow motion also
slows the heroine's input-driven motion (by design: a beat, not a pause). No settings row for `cinematic` yet.

## As-built updates (fire look, 2026-11-23)
Fire is drawn by elements' flame cards (docs/api/elements.md "Fire look"): `kit.tongues` with a warm colour →
`G.elements.flames.lick`, `kit.whirl({ flame: true })` → `G.elements.flames.whirl`, `combustion.bloom` →
`G.elements.flames.burst`, `combustion.soot` → no-op while the cards exist. Without the elements system the old painted
shapes remain as the fallback. `combustion.flight` (the fire bolt's flame mantle) and `impactTrails` are unchanged.

## As built (broom wake rework, 2026-11-23)
The broom's wake effects outside G.fx (owned by world/flora and world/water), rebuilt after Petalwake (MIT, Jacob
Miller 2026; notice in `world/flora/wake-field.js`). Ground/meadow side: docs/api/flora.md "broom wake rework".

- `world/broom-air-trail.js` — sections now carry `wet` (over water) separately from `bare`, and `gust` (unsteady
  shedding, ±14%, scales the circulation). `sample(pos, t, out, hint = -1)`: with a hint (the ring slot returned last
  time in `trail.hit`) only the newest 4 and the 11 sections around the hint are searched.
- `world/water/wake-spray.js` — `WakeSpray`: the white spray torn off the water, soft camera-facing sprites in one draw
  (`ShaderMaterial`, fog, normal blending, never additive), stretched along their motion relative to the camera
  (`uCamVel`). Kinds: a rooster tail of fine beads fanned up and out to both sides (a V) that falls straight back,
  small clumps where it leaves the water, spindrift wound into the vortices (air-trail sampling), a thin low veil of
  mist. No large puffs. Capacity 360 mobile, 400 / 600 / 720 low / med / high; rate ×0.6 / 0.6 / 0.8 / 1; the outside of
  a turn throws the taller sheet; sprites thin out within ~3.6 m of the lens. Emitted from `FlightWake.update` while
  skimming (k = spray × (.55 + .65 drive)). `flightWakeStats()` adds `plume` (live) and `plumeEmitted`.
- Whitewater right behind the brush: `PressureField.press` writes froth under the bristles (up to 2.5 m aft), and the
  water shader reads it as fresh trail foam (`max(vTrailFoam, froth × .85)`), so the patch shows before the trail foam
  arrives. The trail-foam layer is copied every 0.12 s while skimming (0.25 s otherwise).
- Trail foam on water: `PressureField.texture` is now a 2-layer `DataArrayTexture` — layer 0 the pressure waves as
  before, layer 1 the trail foam copied (`paintFoam`) from the wake map's alpha into a wider, coarser window
  (n cells × 2.2 / 1.9 / 1.6 m by water tier) every 0.25 s while `wakeFoam.until` lasts. One sampler: the water program
  was at WebGL 2's 16 texture units. `wFoamRegion` (vec4 like `wPressureRegion`). The vertex stage reads it into
  `vTrailFoam`; the fragment turns freshness into churn → lace → flecks (settling into its mean cover beyond ~20–70 m)
  and adds self-light (×.62) so the foam holds against a bright sky reflection at grazing angles. The fine water grid stays on while
  foam is out.
- `player/broom.js` — the gold lantern trail and the day glow of the broom light (`player.js`, `L.intensity`) exist
  only while boosting: `B.glow` rises over 0.15 s when the boost starts and falls over 0.4 s after it ends; the lantern
  sparkle drops to a faint twinkle outside a boost. The night lantern light is unchanged.

## Combat type round: floating labels (2026-11-25, as built)

The director found the in-fight lettering prototype-like (piles of 「12」「失衡」 on one foe, low-res brush text with a thick
black outline, the heroine's callouts mid-frame). `src/fx/text.js` keeps its design (one instanced draw over a canvas atlas,
strings reused) and changes the rest:

- **Atlas.** 512×128 slots (twice the old resolution), 32 slots on low / mobile, 64 above. Each new label is drawn on a
  one-slot stage canvas and copied into its slot with `renderer.copyTextureToTexture` (texSubImage2D, 256 KB), with
  mipmaps, instead of re-uploading the whole atlas. A slot is free when no live label shows it (no more overwritten
  strings). The stage is drawn in WHITE: fill, a thin dark stroke INSIDE the letters (stroked with `source-atop`), a close
  dense shadow and a wide faint glow. The shader colours it per label: a vertical gradient from near-white to the label
  colour, a dark ink tinted to match — "12" in gold and "12" in thunder violet share one slot.
- **Faces.** Words: the brush face (`core.meta.fontTitle`) with an 8° forward slant. Numbers: the display serif
  (`core.meta.fontDisplay`, MV Serif) at 800, condensed to 85 %. Big hits carry their element's pictogram
  (`iconPaths()` from `ui/icons.js`) or the four-point star. The ×N of a repeated word is the serif, smaller (loc `fx.repeat`).
- **Overlay.** The labels are no longer in the scene: `G.fx.drawOverlay(renderer, camera)` draws them after the post chain
  (sky.js render, and the default `G.renderFrame`), so no tone curve, grade, haze, bloom or depth of field touches them and
  they stay crisp at full canvas resolution when the scene renders scaled. `G.fx.textMesh` is the mesh (shots hide it).
- **Kinds.**
  - `dmg` (`combat.js` damage, `player.js`, the dummy): `n` the amount, `el` the element ('' = plain: white → gold),
    `big` (combat: ≥ 30, a shatter, a ward broken by the blow, or a reaction / crit of ≥ 18; never a DoT). Big hits pop
    elastically (1.6× → 1×), carry the glyph and take two lanes. Every other hit of the same element on the same target
    rolls into ONE number while ticks keep coming within 0.55 s (a fire tornado ticks every 0.5 s, so a strict 0.4 s window
    would split every tick again), for at most 3 s; it bumps on each tick and grows from a chip (sum < 12: 60 % size,
    70 % opacity, a small sideways arc, gone 0.62 s after the last tick) to a full number.
  - `word` (staggers, ward texts, rally, phase 2, 看破, knock-offs …): the same word on the same target within 1 s updates
    one label to 「失衡 ×3」.
  - `call` (her perfect guard, a reflect, the won 对波): small, beside her shoulder to the LEFT (kept on screen); the guard ring and the
    starburst carry the moment.
  - none: the older rise-and-fade motion in the new look (races, pickups, heals, tips).
- **Lanes.** A target's labels stack in lanes over its head (anchor `pos.y + height + 0.2`, pitch 0.5 size units, six
  lanes); `G.fx.textTop(target)` is the room they take and `G.fx.textPx(units, depth)` converts it to px. The foe plate
  (`ui/foes.js liftOver`) and the status marks under it (`ui/reactions.js`) rise over the lanes in use and settle after.
  Reaction pills now sit beside the foe's upper body (left; right near the left screen edge), clear of the lanes.
- **Determinism.** `fx.text` still draws exactly one `Math.random()` per call, so seeded takes replay as before.

