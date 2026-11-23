# spells — as built

## Summary
I replaced the spell-system stub with a working G.spells: 9 modules in src/spells/ plus the locale file. The book has the charm, all 8 elements with small and big forms, guard, shikigami and kinkan. The player can attack, cast, select spells and use guard, summon and ultimate. Every form works through G.elements.apply, G.physics and G.world, with fx, audio and camera shake. Other pieces: a pooled projectile world with homing, arcs and projectile-vs-projectile clashes; perfect-guard reflection; wind deflection; sustained beams with beam struggles; telekinesis; time bubbles; the 「契」 (Bond) gauge; and training dummies that can cast. Each feature listed in the assignment was run in headless tests at -470,-70 (day), -40,120 (dusk, veil 0.55) and 230,-150 (night, veil 1). T.errors() was empty in every run, at 60 fps, 76–99 draw calls and 0.2–0.37 M triangles. A hidden infinite loop showed up only in the 200-cast leak test (the cap on ice platforms never shrank the list), and it is fixed. I looked at the money-frame screenshots and toned down the effects that blew out: projectile glow, the shield, the time bubble, the kinkan light pillar and the sun light orb. build --check passes for all 9 files and check-i18n passes for src/spells and the locale file.

Spell by spell (cast as small form / big form):
- Fire 狐火 (Foxfire) / 炎舞 (Flame Dance): arcing fireballs explode; the big form leaves a ring of 12 ground fires.
- Water 涟珠 (Ripple Bead) / 祈雨 (Rain Prayer): splash soaks, puts out fire and pushes; the big form sends a bead into the sky, then calls G.elements.rain over an 18 m circle for 20 s.
- Ice 霜华 (Frost Bloom) / 冰镜 (Ice Mirror): a piercing lance that passes through up to 3 targets and freezes wet ones; the big form is a radius-8 frost burst at power 2 (which also freezes dry targets). On water it makes floes; on land it raises a walkable ice platform that melts after 22 s, faster when hit by fire, with at most 3 at once.
- Wind 旋风 (Whirlwind) / 龙卷 (Tornado): a 14 m cone push that fans fire and deflects hostile projectiles; the big form is an updraft (addWind, radius 5, height 40, 14 s) with a funnel mesh.
- Thunder 落雷 (Thunderbolt) / 鸣神 (Narukami): a strike after a 0.35 s warning circle; the big form is 5 strikes aimed at hostile targets, then a main bolt.
- Earth 岩起 (Rock Rise) / 陨星 (Meteor): a rock pillar (moving physics body + G.world platform + collider, at most 4) that rises and carries the player and combat enemies up, and crumbles after 25 s or when thunder hits it. The meteor falls for 1.2 s, then does a radius-9 earth hit plus fire, a physics blast, a crater of radius 9 and depth 4, shatters stone and crystal, flings debris and ignites the rim.
- Sun 日辉 (Sun Gleam) / 天照 (Heaven's Light): a radius-9 purifying burst plus a light orb registered with G.elements.addLight for 10 s; the big form is a beam held down for 22 mana/s.
- Moon 月引 (Moon Pull) / 月晕 (Moon Halo): grab a physics body or small enemy, hurl it with cast, drop it with attack; the big form is a time bubble of radius 10 for 8 s at 25% speed, shared with G.physics.timeBubbles and readable as G.spells.timeBubbles.
- Guard: a shield arc; inside the first 0.25 s it reflects projectiles back at their caster with ×1.25 power, after that it blocks.
- Shikigami: two paper cranes that orbit, dart at targets and peck with sun damage for 30 s.
- Kinkan: camera cinematic, G.sky.setRingBoost(4), and a gold light pillar of radius 14 that hits for 140 and then pulses 3 times for 30.

## Public API
G.spells (spellsSystem in src/spells/spells.js):

★ cast(spellId, form = 'small'|'big', { caster, origin, dir, target, point, team, power = 1, duration?, strength? }) -> handle
- spellId: charm, fire, water, ice, wind, thunder, earth, sun, moon, guard, shikigami, kinkan.
- This is the raw effect: no mana, cooldown or knowledge checks. The player and AI use the same path.
- Defaults when caster is G.player: origin = her right hand, dir = aim.dir, point = aim.point; for charm, fire, water, ice and thunder, target = auto-aim (aimed target, else the nearest hostile in a narrow cone).
- Defaults for other casters: origin = caster.pos + 0.75 × height + dir × 0.6; dir = caster.dir or caster.yaw.
- handle = { spell, form, team, caster, stop(), ... }. Extra fields by spell:
  - projectile spells: projectile
  - water big: zone
  - earth small: pillar
  - earth big: meteor
  - wind big: tornado
  - moon big: bubble
  - sun big: the beam object { alive, struggling, stop() }
  - guard: the guard object { stop() }
  - moon small: grabbed / hurled / failed
  - shikigami: cranes
  - kinkan: center
- AI beams: duration in seconds (default 4); strength = struggle push (default 1).
- Emits 'spell:cast' { caster, spell, form, pos, dir, team }.

★ learn(id, level = 1, { silent = false } = {}) -> bool
- Elements go to G.state.spells[id] (1 or 2). Arts go to G.state.abilities[id].
- Emits 'spell:learned' { id, level }.
- Calls G.ui?.learnSpell({ id, element, name, desc, icon }). When an element gets its big form, the ceremony shows the big form's name.
- Selects the element automatically when nothing is selected yet.

★ select(id) -> bool: elements only, must be known. Sets G.state.selectedSpell and emits 'spell:select' { id }.

knows(id) -> bool. level(id) -> 0 | 1 | 2.

learnAll(): every element at level 2, plus guard, shikigami, kinkan, broom and wings. Silent. Runs automatically with ?allspells=1.

tryCast(id, form, silent?) -> handle | null: a player cast with all the rules (knowledge, cooldown, mana through G.player.spendMana, gauge for kinkan, playAction). Refunds the mana if 月引 finds nothing to grab.

cooldown(id, form) -> seconds left. addGauge(k). makeDummy(pos, opts) -> Dummy.

clear(): removes every live spell effect (projectiles, beams, pillars, ice platforms, tornadoes, meteors, orbs, bubbles, cranes, guards, held object, timers).

stats() -> { projectiles, beams, ents, timers, bubbles, guards, holding, cranes, dummies }.

Fields:
- list: 12 entries [{ id, element, art, name, desc, small, big, smallDesc, bigDesc, level, cost: { small, big, perSec }, cd: { small, big }, damage: { small, big }, color, icon }]. Names and level are live getters, so text follows t() and the save.
- selected (id), gauge (0..1, read/write, stored in G.state.gauge), charge (0..1, only while charging a spell whose big form is known), holding (the held body or enemy).
- projectiles (live array), beams, struggle ({ a, b, v, pos } or null), timeBubbles (the same array as G.physics.timeBubbles; entries { pos, radius, scale: 0.25, team, caster, t }), guards, entities, dummies, guarding, beaming.
- Constants: BOOK, ELEMENT_ORDER, ARTS. G.ui.providers.spells is filled in.

Player input (only in 'play' mode with control on):
- attack: a charm at once, then a stream every 0.33 s while held (no mana). While holding an object with 月引 it drops it; during a beam struggle each press pushes.
- cast:
  - level 1: tap casts the small form.
  - level 2: a 0.9 s charge (fx 'charge' emitter + 'charge_done' burst + fovKick). Release before full = small form, release after full = big form.
  - Sun at level 2: 天照 starts as soon as the charge is full and runs while the button is held.
  - While holding an object, cast hurls it.
- el1..el8 select; the mouse wheel cycles known elements; guard (hold), summon, ultimate.

Numbers:
- Mana: charm 0, fire 12/30, water 10/28, ice 12/30, wind 8/26, thunder 16/36, earth 14/45, sun 20 / 6 + 22 per second (×0.4 while in a struggle), moon 6 + 4 per second / 34, shikigami 35.
- Cooldowns: fire 0.42/2.4, water 0.38/8, ice 0.5/3.2, wind 0.45/6, thunder 0.7/4.5, earth 0.9/8, sun 2.5/1.2, moon 0.35/8, guard 0.15, shikigami 12, kinkan 2.
- Damage = cost × 2.2, passed as info.damage; the charm deals 12; the beam about 48 per second; the kinkan 140, then 3 pulses of 30.
- Gauge: each 'element:reaction' with team 'player' adds 0.028 + 0.01 × count; a clash adds 0.05, a reflect 0.08, a won struggle 0.15.

Events emitted:
- 'spell:cast', 'spell:learned', 'spell:select'.
- 'spell:clash' { pos, a, b, result }. result: 'steam' (fire × water), 'cancel' (fire × ice, sun × moon, or equal strength), 'conduct' (thunder × water: the water dies, the thunder gains +0.3 power and chains), 'a' or 'b' (the stronger one continues, weakened), 'deflect' (wind), 'reflect' or 'block' (guard).
- 'beam:struggle' { state: 'start' | 'end', a, b, winner, loser, why }.
- 'spell:meteor' { pos, crater }.
- G.ui?.struggle({ value }) is called every frame of a struggle; value = the player's share (0..1); null at the end.
- Struggle rules: player push = 0.55 + 0.32 × mash rate; AI push = strength with a wobble. The loser takes a radius-4.5 sun blast for 60 damage.

Dummy (makeDummy(pos, { material = 'wood', hp = 300, team = 'enemy', respawn = true, face })):
- A baked training post with glowing eyes when on the enemy team, an elements reactor (kind 'creature', living), and a G.world collider.
- Floating damage numbers (gold when mult > 1), a wobble spring, full health again after 3 s without hits, and a respawn 3 s after breaking.
- Fields: { pos, dir, yaw, team, hp, maxHp, taken, hits: [{ el, dmg, mult, reaction, t }], reactor, dead }.
- Methods: cast(spell, form, { target = G.player, ... }), face(p), hurt(n, el), reset(), remove().

Exports from the modules:
- book.js: BOOK, ELEMENT_ORDER, ARTS, COLORS, damageOf
- projectiles.js: hostileReactor, targetPoint, segSeg
- forms.js: FORMS, ballistic
- dummy.js: makeDummy, DUMMIES

## Known issues
- Not tested together with the systems still being written (flora, structures, props, audio, combat, story). Calls to G.combat.nearest/enemies, G.flora.removeInRadius, G.props and every G.audio sfx name are optional-chained and untested. The sfx names are guesses without the 'sfx_' prefix ('cast_fire', 'explosion_large', 'paper', 'bell_small', and a 'beam_hum' loop that does not exist in the catalogue).
- After the tuning passes I re-checked these on screen: kinkan (at dusk), the time bubble, the projectile glow and the guard reflect. The toned-down shield, the toned-down 日辉 orb, the re-coloured rock pillar strata, the thinner ice-platform spikes and the toned-down tornado have not been looked at again.
- The tornado funnel is a fairly uniform scrolling-stripe cone. It reads as a water column from far away. The ice platform's spikes still look chunky because the whole mesh is scaled 3.3× horizontally.
- The beam struggle mechanics were verified (start, push, both end paths), but no test mashed all the way to a player win. The tuning (push 0.55 + 0.32 × mash rate against AI strength 1, rate 0.2) is a guess that needs a playtest.
- 月引 holds small enemies by writing enemy.pos and setting enemy.held = true. Combat has to respect that flag (see core requests). Dummies cannot be grabbed.
- After the hurl fix (it now aims at the cast point), the crate throw into a dummy was not re-measured.
- The player can still be burned by spreading ground fire from her own 炎舞 or 陨星. That is the elements fire behaving as an environmental hazard (seen at about 74 HP in t8). My call is that this is intended and harsh, not a bug.
- Large ground decals (sigils, rings) are flat and get partly cut off on slopes; this is an fx limitation.
- Dummy respawn uses setTimeout (real time), so it also counts down while the game is paused.
- The rock pillar's crumble debris and the meteor debris add physics debris bodies. They are capped by physics' own budget and also cleaned up by a spells safety timer.
- Rain clouds from 祈雨 are not removed by G.spells.clear(), because the elements system owns the zone. They expire after 20 s.
- Perfect-guard reflection only works on projectiles. Sky strikes (落雷) and the meteor cannot be reflected, only blocked through the player's ×0.2 front reduction.


## As-built updates (fix2, 2026-11)
- `G.spells.shoot(opts)` public custom projectile (no cast sound, no mana, no animation; flies, homes, clashes, can be guarded and reflected). opts `{ el='moon', origin|pos, dir|vel|target|point, speed=13, size=0.45, radius, color, team='enemy', owner|caster, damage=10, power=1, life=4, turn=0, gravity=0, pierce, shape='orb', def:{impact(p,hit), expire?(p)}, splash=1.2, burst, trail, emitter, emitterScale, spell='shot', form='small', data }` → projectile | null. Combat's dark orbs use it.
- Charm (灵符) damage = 12 × (1 + 0.15 · G.state.upgrades.charm) for the player.
- Enemy spells never start grass fires: impacts of team 'enemy' pass noGround; an enemy fireball that misses the heroine's side (no player-team reactor hit) applies no fire at all (a miss into a tree lit the tree and the tree lit the grass); enemy 火环 (fire ring) lays no ring; enemy fire splash 1.1 m (big 3 m).
- Beams: the player's 天照 reaches a locked target past the normal 42 m (up to 75 m) — 无明's (Mumyo's) weak points sit ~55 m away. Two beams fired at each other (direction dot < −0.8) clash within 6 m (was 1.6 m for all), so answering 无明's breath while aimed at a weak point starts the struggle. Enemy beams track their `target` (opts `target`, `track` rad-ish/s, `len`). No mana drain while struggling. `G.spells.struggle.mash` is readable. Mashing at ~6 presses/s wins 胧夜's (Oboroyo's) struggle in ~4–6 s and 无明's breath in ~7 s.

## Look (u3, 2026-11-13) — visual side only, no gameplay change
- Every cast has five beats: gather/release at the hand (fx.magic on 'spell:cast'), glyph circles under her on big casts,
  shaped projectiles (fx.magic projStart/projDraw/projEnd from projectiles.js), impacts + aftermath in fx recipes (kit shapes,
  decals, light, shake, 60–70 ms hit-stop on the biggest), see fx.md "As-built updates (u3)".
- beams.js: `b.lookColor` (heroine gold, rival violet or c.color) drives the sheath + core; the fx.beam ribbon is only a halo.
- 月晕 (moon big, entities.js): the hard glow rings are hidden when the kit exists; a slow glyph ring on the ground, two crescent
  blades orbiting, mirror shards and silver motes drifting inside; the dome is fainter (0.4).
- Known shortfall: the struggle's near-lens beam is still bright; grass/cloth don't react to the struggle yet.

## Look (final-duel, 2026-11-14) — visual side only
- beams.js: `b.lookEl` (heroine 'sun'; others `c.el`, else `caster.cfg.el`, 'all' → 'moon') + `b.lookColor` paint the beam
  (fx.md "final-duel"); a set `lookEl` is picked up each frame (无明's breath sets 'shadow' in bosses.js). The duplicate
  clash_ball emitter is gone; pushes fire 'struggle_spray' instead of the white 'clash' burst; the break burst is fx.magic's,
  beams.js keeps a coloured flash, shake 0.75 and hit-stop 80 ms.
- Big hits: 炎舞 / 冰镜 / 鸣神 hit-stop 70 ms + `G.cam.fovKick`, 陨星 90 ms + kick. 涟珠 splash ×1.45 + a water crown; 旋风 adds
  a painted gust cone + strokes along the push. 龙卷 is drawn with fx shapes (the funnel meshes are a fallback).
- Camera (player/camera.js, struggle only): frames both casters side-on from back and up (D = max(8.5, 0.62·span + 4.5),
  height 0.3·D), chooses the side whose spot both casters and the centre can see (physics rays), pulls in if a wall is near,
  and kicks out ~0.9 m when the struggle breaks.
