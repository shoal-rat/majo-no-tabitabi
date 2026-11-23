# combat — as built

## Summary
Combat is built and replaces the stub. It has a generic Enemy core and the seven foe types. Camps stream in and out by distance and respawn. Three bramble-caged nests surround 千年枫 (Thousand-Year Maple). spawnWave serves the training camp. Duels against four rival mages run on a shared engine that 胧夜 (Oboroyo) also uses, with a ring, guard, dodge, big-form set pieces, a beam struggle, kneel-instead-of-death and restore afterwards. All four bosses are in. Wildlife wanders, grazes and flees. src/actors/creature.js is a pooled rig for the mon_/ani_ models.

All 8 headless tests ended with T.errors() empty at 60 fps. Every boss was finished only through the testWin drain; none has been played through its real mechanics.

How it works:
- Each Enemy has an elements reactor and a physics capsule. Damage resolution handles:
  - multipliers: sun ×2 and fire ×1.5 on shades (from elements), paper fire ×3, wisp water ×4, ×3 shatter
  - moon heals and empowers shades (but not 月引 (Moon Pull) throws, which are flagged heavy)
  - light and darkness change shade attack and speed; bright sun magic makes shades flee
- Statuses: burning DoT, frozen = no movement or animation, shocked = stun.
- Hits give knockback, hit flash, coloured damage numbers (gold when a multiplier applies) and hitstop + shake on big hits.
- Deaths dissolve into purify motes, drop stardust/heart through G.gameplay.spawnPickup, increment G.state.stats.kills and emit enemy:killed.
- Thrown props hit enemies through physics:impact. Deep water washes shades away. enemy.held and G.spells.timeBubbles are respected. Enemies beyond 40 m go dormant (nest/wave members, bosses and rivals stay awake).
- Every attack is telegraphed (ground sigil and ring, crouch, glow or growl) and is dodgeable; shockwaves can be jumped.
- Dark orbs are G.spells charm projectiles re-skinned as violet moon orbs. They therefore clash, get guarded or reflected, and are deflected by wind like any spell.
- The lock action (T / middle mouse) cycles targets in front of the camera, and pressing past the last one clears the lock. It drives the existing HUD reticle and camera.

Models chosen:
- 纸魅 (paper wraith) = mon_ghost in washi white; 影团 (shade blob) = mon_slime (shade); 影狼 (shade wolf) = ani_wolf (shade); 灯蛾 (lantern moth) = mon_bat (shade); 晶傀 (crystal golem) = mon_golem_big in stone tint with crystal shards; 影巫 (shade witch) = createActor char_villager_c, dark.
- 鬼火 (will-o'-wisp) = a procedural violet flame core with eyes.
- 胧牙 (Oboroga) = ani_wolf ×7; 灯喰蛾 (Tomoshigui) = mon_bat ×5.5; 无明 (Mumyo) = mon_ghost ×24 rising behind the palace.

Art review notes:
- By day the lineup reads well (white paper sprites, blue-grey golem after a tint fix).
- At night the shades were nearly invisible, so I raised their violet emissive. I have not looked at that change on screen again.
- The bramble cage and nest core read clearly.
- The giant moth against the sky reads big. 胧牙 looked small at 5×, so it is now 7×; I have not looked at it again either.

## Public API
G.combat (combatSystem in src/combat/combat.js):

Fields:
- enemies[] (live Enemy objects)
- lockTarget (Enemy or null)
- inCombat (bool): true while a duel or boss is active, or an aggro, awake enemy was within 30 m in the last 4 s
- TYPES
- MAX_ACTIVE = 24
- campsEnabled, nestsEnabled, wildlifeEnabled (bools, for tests and cutscenes)
- duel (getter: the active duel record or null)
- boss (getter: the active boss record or null)
- spawner, wildlife (internal modules)

★ spawn(type, pos, opts) -> Enemy | null
- type: paper, blob, blob_small, wolf, moth, wisp, golem, caster ('nest' is used internally).
- opts: { aggro, persistent, camp, wave, hp, hpMul, dmgMul, speedMul, yaw, element (caster's element), def (custom def), snap=true (snap to ground, or hover height for flyers) }.
- Emits 'enemy:spawned' { enemy }.

★ damage(enemy, amount, info) -> damage dealt
- info: { element, source, mult, heavy, shatter, purify, dot, dir, by, force (skip type scaling and boss gates), silentText, silentHit }.
- Applies type/armour scaling and ×(1 + 0.3·light) on shades, then the onDamage hook.
- Effects: damage text, knockback, stun, sfx, hitstop + shake on big hits.
- Emits 'enemy:hit' { enemy, amount, element, pos }. At 0 hp it calls kill(), or enemy.onZero for rivals and bosses.

kill(enemy, by, { silent, noDrop })
- Emits 'enemy:killed' { enemy, type, pos, by } unless silent; also counts the kill in G.state.stats.kills and drops pickups.

despawn(enemy): removes it without counting a kill.

★ nearest(pos, r = 20, filter?) -> Enemy | null

within(pos, r) -> Enemy[]

★ spawnWave(id | list, pos?, opts?) -> Promise, resolved when every member is dead
- ids are in data/camps.js WAVES: training, training_2, crystal, village_fire.
- A list is ['paper', ...] or [['paper', 3], ...].
- opts: { r, stagger, aggro=true, hpMul, onSpawn }.

★ startDuel(id, opts?) -> Promise<boolean won>
- id: himawari | kokonoe | rikka | naru.
- opts: { pos: {x,z}, r, testWin, place=true (move the heroine into the ring) }.
- Emits 'duel:start' { id } and 'duel:end' { id, won }.
- Calls G.ui.bossBar with kind 'duel'.
- The duel ends at 0 hp without death. The loser kneels (kneel_work). Afterwards the heroine's hp and mana are restored and G.spells.clear() runs.

★ startBoss(id, opts?) -> Promise<boolean won>
- id: oboroga | tomoshigui | oboroyo | mumyo.
- opts: { testWin }.
- Emits 'boss:start' { id, name }, 'boss:phase' { id, phase: 2 | 3 }, 'boss:defeated' { id }, and sets G.state.defeated[id] = true.
- Resolves false if the heroine dies.
- 胧夜 phase 2 (below 66 %) is invulnerable until the player wins a beam struggle. 无明 can only be damaged through 3 weak points, which open when hit by sun or when the player casts kinkan; below 25 % comes a mandatory breath struggle.

cycleLock() -> Enemy | null (also bound to the 'lock' action)

clear(): removes all enemies, waves, nests, duels and bosses.

stats() -> { enemies, dying, timers, awake, pools, pooled, wildlife, camps, nests, duel, boss, inCombat }

after(sec, fn): a game-time timer.

Enemy (src/combat/enemy.js)
- Fields: { id, type, def, pos, vel, move, yaw, hp, maxHp, radius, height, team:'enemy', material, reactor, physChar, dead, held, stunT, frozen (getter), burning (getter), aggro, dormant, atkMul, light, veil, camp, wave, persistent, boss, data }
- Methods: stun(sec), attack(name, windup, recover, fire, { tell, during, cancel }), centerOut(v), face(x, z, dt), dispose()
- Ids: G.state.defeated keys are nest_west / nest_east / nest_south and the boss ids.

src/actors/creature.js
- createCreature(assetId, { scale, tint: 'shade' | 'paper' | 'stone' | {color, emissive, eyes} | null, eyeColor, clips: {state: clipName}, castShadow, blob, blobRadius, primitive: fn | Object3D })
- acquireCreature(assetId, opts + { key }): the pooled version.
- Creature object: { group, model, mixer, height, length, has(s), play(s, { fade, speed, once, onDone, next, restart }), setTint, flash(sec), dissolve(dur, color), place(x, y, z, yaw), update(dt), addTo(), release(), dispose() }
- Clip states are parsed from the manifest "Clip use" notes; opts.clips adds or overrides states (run, eat, leap, fly, …).
- creaturePoolStats()

src/data/camps.js exports CAMPS, NESTS, WAVES, DUEL_RINGS, ARENAS, WILDLIFE.

## Tests
All runs used node tools/play.mjs at 960x540. Unless noted, the build was fx, audio, ui, physics, elements, sky, terrain, player, spells, combat. build --check passes for all 11 files, check-i18n passes for src/combat and the locale file, and T.errors() was empty in every run.

- t1, enemy lineup at (-470,-60), day: all 7 types spawned around the heroine. In 5 s they took her from 100 to 61 hp.
  - Sun hits for 20: wolf and caster took 52 (×2 purify ×1.3 daylight), golem took 6 (armour), paper took 20.
  - Fire killed the paper sprite. The wisp exploded on its own. The caster burned down to 13 hp.
  - Screenshots: lineup.png and fight.png. Sigils and telegraphs are visible.
- t2, nest_west: 6 brambles were built. The core took 0 damage while they stood. Fire burned all brambles away, the cage opened with a toast, the core was killed, and G.state.defeated.nest_west = true with enemy:killed type 'nest'. Children are spawned and purified when the nest dies.
- t3, night camp at (462,136), veil 1:
  - Camp night_field streamed in with 5 enemies; the heroine went 100 → 44 in 4 s.
  - With 24 mixed enemies awake: 60 fps, 246 draw calls, 0.35 M triangles.
  - 100 spawn-kill cycles: geometries 96 → 96, reactors and physics characters back to baseline, scene children 34 → 34, textures 193 → 211. This was after a fix: the first run leaked about 3 textures per cycle from humanoid bone textures; casters now come from a pool and skeletons are disposed.
  - All camp spots were checked for wards and water; dusk_ridge was moved out of the fox-village ward.
- t5, duel 阳葵 (Himawari) against a scripted heroine (casting fire, ice, thunder and charm, answering the rival's beam with 天照 (Heaven's Light), mashing Mouse0): 'beam:struggle' started and ended with the player winning. The scripted heroine then lost the duel. She reached exactly 0 → kneel with no death event, then was restored to 100 hp with control back. 'duel:start' and 'duel:end' (won: false) were emitted, and stats were clean afterwards.
- t6, startDuel('kokonoe', { testWin }) → true. Then each boss with testWin: oboroga, tomoshigui, oboroyo and mumyo each ran start → phase 2 → phase 3 → defeated in about 10 s, with G.state.defeated set for all four and nothing left over afterwards. Screenshots of 胧牙, 灯喰蛾 and 无明 were checked.
- t7, full build at the village: 7 animals streamed in (5 chickens, cow, dog). A fire 2 m away made a chicken flee 5.1 m. Pressing T locked the paper sprite in front. 60 fps, 558 draw calls, 1.28 M triangles for the whole village scene.
- t8, full build at night camp night_pass: 4 enemies (3 wolves + caster), no errors, 203 draw calls.

Screenshots: .tmp/play/combat-t1 … combat-t8.

## Known issues
- (fixed by fix2) Bosses are now played through with real mechanics, see "As-built updates (fix2)". The struggle camera is still washed out by the heroine's own beam bloom close to the lens (render / fx side).
- (fixed by fix2) Moth lantern eating uses `G.gameplay.litLanterns()`; 无明's weak points are lockable through lock proxies (`e.data.lockPoints`).
- Duels clamp the heroine through `G.player.damageFloor`; bosses do not, so she can die there.
- The texture count still rose by 18 over the 100-cycle test. It is most likely pools and fx atlases filling up once, but a second 100 cycles was not run to prove it stays flat.
- (fixed by fix2) Enemy fire no longer lights the grass and night camps cost ~25 hp per 5 s standing still. A tree can still occasionally catch fire in a night camp from a source not identified (seen once in ~8 camp runs).
- (fixed by fix2) Humanoids flash through `actor.flash()` (shared material).
- Wildlife has no reactors: animals cannot be burned, they only flee. Night-only spawning was not implemented. Koi swim at y = -0.55 and were not looked at on screen.
- The training wave is data in WAVES.training (4 paper sprites at 神乐练习场, the Kagura Training Ground). Story must call G.combat.spawnWave('training').


## As-built updates (fix2, 2026-11)
- Bosses played through with scripted input (scripts in .tmp/fix2/boss-*.js): 胧牙 (stalk → bite, leap landing burst with dust + earth hit, howl; 7× scale fits at 千年枫), 灯喰蛾 (flies to a lit lamp from `G.gameplay.litLanterns()`, drains and douses it; grounded by ice / wind in ~7 shots), 胧夜 (struggle winnable at 6 presses/s), 无明 (rises behind the real palace; weak points lock-on proxies, opened by any sun-element hit including charms, and by 金环 (Golden Ring); final breath struggle mandatory: hp cannot fall below 4 % until it is won, testWin excepted).
- Shade eyes on creatures are coloured embers (emissive 1.5 / 2.4, was 3.4) so bosses at night read as silhouette + eyes, not light bulbs.
- Balance: `attacks.js` exports `CAMP_K = 0.6` and `campK(e)` (0.6 for camp foes, 1 otherwise) applied in hurtPlayer and darkOrb damage; shade night multiplier atkMul = (1 + 0.3·veil)… (was 0.5); casters' element spells use power 0.42·atkMul·campK (was 0.8·atkMul); every foe's first strike after aggro waits 1.2–2.8 s; wisp burst fire radius 2.2 m and noGround. Measured standing still 5 s in night camps at base stats: 15–31 hp (was 56–102).
- Drops: under 40 % hp every foe drops a heart with ≥ 55 % chance, under 25 % always; under 25 % mana at night a mana orb half the time.
- Rig: `actor.flash(sec = 0.08)` swaps every mesh to one shared material (no clones); `actor.dispose()` also disposes skeletons. Enemies use it for the hit flash.
- 'physics:impact' carries `owner` (what was hit) and `bodyOwner`; combat uses `owner`.
- Duels use `G.player.damageFloor` / `onDamageFloor` instead of wrapping takeDamage.

## Performance pass (2026-11-14, see docs/api/perf.md)
- `combat.start` schedules a one-time warm-up (two frames after start): `warmScene` compiles every program in the scene,
  hidden objects included, then `warmCreatures` acquires one pooled creature per enemy type (same options as `Enemy`)
  and per animal kind (`wildlife.warmList()`), compiles it and releases it to the pool, one per frame. First spawns then
  reuse a compiled, already-built creature instead of a 25–60 ms compile hitch. `?nowarm=1` / `?perf=0` turn it off.
  If you change the options `Enemy` passes to `acquireCreature`, change them in the warm list too (pool key).

## Journey bestiary & duels (play-upgrade, 2026-11-22)
The old shrine-maiden encounters are gone from the journey; the engine (Enemy, damage, duels, bosses) is reused for the
Wandering-Witch borderlands. Nothing spawns before the heroine has left home (quest `apprentice` done), nothing ever in
NO_FOES (home, Fran's forest + clearing, the walled city), on warded ground, or within 35 m of a story anchor.

### Bestiary (type id → name, answer)
| id | name | what it asks for |
|---|---|---|
| paper | 流浪书页 (Wandering Pages) | stray grimoire pages (procedural booklet), darts + paper-cut volleys; fire ×3, wind ×2 |
| blob / blob_small | 泥沼团 (Bog Blob) | bog mud: splits on hits; fire bakes a crust (8 s, slow), then earth / thunder / heavy ×2.6; water heals it |
| wolf | 荒原狼 (Moor Wolf) | packs: the lowest-id wolf baits in front, the rest flank behind her facing and lunge faster from behind; fire (hit or a blaze at their paws) scares them; wind shoves; an elite leader howls (haste) and calls two more at 50 % |
| moth | 啄星蝠 (Star-Pecking Bat) | harries broom riders at her height (13 m/s, a cruising broom outruns them), dives and nibbles mana (never below 30); wind / thunder tumbles it out of the air; conductive |
| wisp | 迷路的灯火 (Lost Lamplight) | warm lantern flame; drifts in and bursts; water ×4, wind ×2 |
| golem | 隘口石卫 (Pass Stone Guard) | stone shell (thunder / earth / heavy), slams, rock barrages |
| froststag | 霜角鹿 (Frost-Horn Stag) | ice ward (fire breaks it, earth secondary), charge down a marked lane, frost stomp, ice-lance volleys |
| embersnake | 余烬蛇 (Ember Snake) | fire ward (water breaks it, ice secondary), lobbed fire, coiled bite, ring of flame |
| caster | 拦路魔法使 (Roadblock Mage) | bandit mage (one element each): volleys, element signature (fire seal, ice lance stream, lightning call, water bubbles, gust, rock barrage), counter-casts that meet her spells mid-air, shield against a barrage, sidesteps; 「破绽」 (Opening) after big casts |
| raider | 黑帚强盗 (Black-Broom Bandit) | the same kit on a broom: orbits, strafes, swoops; wind / thunder / heavy / a stagger knocks him off the broom (exposed 3.5 s), he fights on foot and remounts after ~9 s |
| thief | 扒手魔女 (Pickpocket Witch) | sneaks up on a walker, lifts ~22 % of the stardust (or a dango), flees on a broom at 17.5 m/s; every hit returns 30 % of the loot, wind / thunder / <45 % hp knocks her down; caught = loot + 15; escapes after 45 s / 150 m |

### Shared mechanics (src/combat/wards.js)
- **Ward** `e.ward = { el, hp, max, regen, downT }` — counter (COUNTER[el][0]) ×3, secondary ×1.6, a matching reaction ×2, else
  ×0.25 to the shell; HP takes 15 % chip while it holds. Break: stun 2.4 s, `exposedT` 4 s, starburst + duel beat; reforms after
  `regen` s. Events `'enemy:ward' { enemy, state: 'break'|'reform', el }`. `addWard(e, el, max, { regen })`, `counterOf(el)`.
- **Poise** `e.poise / poiseMax` (def.poise, default 40 % hp, 70 % heavy) — heavy ×1.8, countered ×1.5, shatter ×2; at 0 →
  stagger (stun def.staggerT, exposed), `'enemy:stagger' { enemy }`.
- **Exposed** `e.exposedT > 0` → every hit ×1.5 (the gold number); the plate shows 「破绽」.
- **Affixes** (elites) `frenzy warded bulwark blink leech volatile pack` — `makeElite(e, list)`; camps roll an elite 18 %.
- Movement honours `reactor.speedMul` (muddy / chilled / frozen) — `e.handlesSlow = true` (enemy.js step). Inside a steam
  cloud (`G.elements.concealedAt(G.player.pos)`) foes drop her, walk to where she was last seen (±2.5 m) and search for 4 s;
  nobody new picks her up until she steps out. `hurtPlayer` respects `e.mercyFloor` (ambushers never take her below 25).
- Volleys lead a moving target (`intercept(from, p, v, speed)` in patterns.js); against a target faster than 6 m/s the shot
  does not home (homing would drag it back behind a broom) — a rider dodges by turning.

### Duel moves (src/combat/patterns.js) — used by Fran, bandits, raiders, stags, golems
`volley(c, target, o)` luminous bullets (fan / stream), `lightning(c, points, o)` marked strikes, `rockBarrage(c, target, o)`
rocks torn from the ground that hang then fly (real projectiles + rock meshes; she can shoot them down), `starRain(c, center, o)`
bombardment from above, `seal(c, at, o)` rune that a counter element dispels, `counterCast(c, proj, o)` the answering element
sent to meet her spell mid-air (clash), `incomingAt(pos, r)`, `bolt(c, from, dir, o)`. c = `{ owner, team, alive(), hand(out),
data, power, dmgK, onShot }`; each returns `{ cancel() }`. `updatePatterns(dt)` (combat calls it).

### Encounters (src/combat/encounters.js, data in src/data/camps.js)
CAMPS (19: moor light, wilds / high pass real), ELITES (灰鬃 greymane, 鸦羽 crowfeather, 赤喉 redthroat, 苔背 mossback, 白冠
whitecrown — beaten once, remembered), SPRINKLE (42 roadside spots of 1–2 weak roamers, density × G.quality.density, ≤ 8 alive,
respawn 150–210 s), SHORE (lake ring after the eclipse), air ambushes (bats / raiders on a low broom between x 1000 and −1600,
cooldown 110–170 s, they leave when outrun 4 s, after 70 s or at hp ≤ 28), the pickpocket (on foot, x 600 … −1100, 7–10 min).
Spawn 88 m (120 m on the broom), despawn 150 m, SLEEP_R 62 m. Calm (`G.combat.calm`): any non-play mode, story busy / dialogue /
spar / meteor, the lake step near the lake, an eclipse → foes stand down, nothing new spawns, ambushers leave.
`G.combat.encounters`: `{ camps, elites, sprinkles, ambush, thief, update, clear, armed(), calm(), stats(), forceAmbush(kind),
forceThief() }`. Test switches: `G.combat.forceArmed = true` or `?foes=1`.
Save `G.state.combat = { cleared: {campId: playTime}, elites: {id: playTime}, seen: {type: true}, trials: { best, clears } }`.

### Combo & rating (src/combat/combo.js) — `G.combat.combo`
`{ count, style, rank 0..5, best, t, fightStyle, kills, rankName(r) }`. Hits within 3 s chain; style from new elements (+2),
reactions (+3), counters, exposed hits, ward breaks (+5), staggers (+3), riders knocked off (+4), perfect reflects (+4), clashes;
a hit on her resets the chain. The fight is rated 3 s after it ends (「利落」 Neat, 「漂亮」 Fine, 「华丽」 Splendid, 「惊艳」 Dazzling, 「星尘般」 Like Stardust); 「漂亮」 and up pays
stardust (22 % of the style). Events `'combat:rank' { rank }`, `'combat:rated' { rank, style, kills, bonus }`.

### Fran's spar (src/story/fran-spar.js)
Three movements: 0 读杖尖 "reading the wand tip" (single stardust bolts — shield to reflect), 1 星尘乱舞 "stardust frenzy" at hp ≤ 28 or 3 casts (fan of bullets 星尘连射,
bombardment 星落, homing water bubbles 水泡, frost seal 冰阵), 2 流星掠空 "meteor sweep" at hp ≤ 12 or 6 casts (circles at 6 m; diving passes
that rake the ground then land = opening; volleys from the air; a wind hit throws her off the broom). From movement 1 she
counter-casts her spells mid-air and raises a shield against a barrage. The answer element mid-windup (or a reflected bolt)
scatters the spell (long opening, duel beat). Openings have a damage budget (12 / 13 / 15, +8 on a break / tumble), outside
them hits graze (×0.1 bullets, ×0.2 elements). Outcomes unchanged ('break' / 'yield' / 'hold' at 10 casts); the replay has 60 hp.
Events `'spar:phase' { phase }`, `'spar:broken' { pattern }`, `'spar:tumble'`, `'spar:end' { result, story, phase }`.

### Clearing trial (src/combat/trials.js) — `G.combat.trials`
After quest `mages`, a chalk ring 9 m from Fran's spot (E: 「踏入试炼圈」, Step into the trial ring): five rounds of stardust phantoms (pages + mud, a pack,
two mages, a warded stag under bats, rider + ember serpent + stone guard). Timed, best time + clears in the save; first clear 80
stardust + dango, a record 40, else 20. HP floor 1 (fails instead of dying), leaving the ring (34 m) aborts. Events
`'trial:start'`, `'trial:end' { result: 'clear'|'fail'|'left', time, best }`.

### UI (src/ui/foes.js, created by ui.js)
Plates over up to 6 engaged foes (+ the lock target): name (elites gold with title), brush hp bar with ghost, ward bar in the
element colour with 「要用X才破得开」 (Needs X to break), affix chips, 「破绽」. Anchored at top + 1.05 m (elements' status pips sit just below).
`G.ui.foePlates = true` hides enemy.js's old 3D bars. Combo meter right of centre (count, 「连击」 = Combo, rank word that pops).

### Broom combat
Player projectiles cast from a flying broom inherit 80 % of the broom's velocity (src/spells/spells.js cast(); lobbed shots only
when homing), so bullets leave her hand at speed. Lock-on (T / middle mouse) works on the broom; auto-aim homes charms.
