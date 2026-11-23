# fix2 — as built

## Summary
All six work items are done and checked with play.mjs scripts. The full build passes, check-i18n passes and T.errors() was empty on every run. This session continued from .tmp/fix2/PROGRESS.md: items 1 and 4, plus the 胧牙 (Oboroga), 灯喰蛾 (Tomoshigui) and 胧夜 (Oboroyo) boss runs, were finished in an earlier session; this one did the 无明 (Mumyo) boss and items 3, 5 and 6.

1. NEAR-LIGHT BURN-OUT (src/render/veilhook.js, cache key mvveil2). The material hook now softly limits two things for every patched lit material, keeping the hue: the summed direct light (starts easing at 0.9, ceiling 1.6) and the final colour without emissive (1.0 / 1.75). Emissive is added back untouched. Before: the heroine was pure white at night (fix2-burn0). After: red skirt, dark hair and a warm rim are visible (fix2-burn1). A daylight check (fix2-burnday) shows no blow-out either.

2. BOSSES, played with scripted input. 胧牙: added stalk→bite; the leap landing makes a burst with dust and an earth hit; 7× scale checked at 千年枫 (Thousand-Year Maple). 灯喰蛾: uses gameplay.litLanterns(), flies to a lamp, drains and puts it out; ice or wind grounds it in about 7 shots. 胧夜: enemy beams now track their target, mana no longer drains during a struggle, the start value was tuned, and a null-guard fixes a TypeError; mashing at 6 presses/s wins in about 5.7 s. 无明: it rises behind the real palace and the weak points can be locked on. The player's sun beam now reaches a locked target up to 75 m away (the weak points sit about 55 m out, beyond the old 42 m). The breath never started a struggle because the two beams missed each other by about 4.6 m; beams fired at each other now clash within 6 m. The final breath struggle is now mandatory: hp cannot go below 4% until it is won (testWin excepted). Mashing at 6/s won the full fight in about 7 s of struggle. Charms open weak points because they are sun-element. Shade eyes were dimmed from emissive 3.4 to 1.5 / 2.4 so they read as embers, not light bulbs.

3. BALANCE. Standing still for 5 s in a night camp at base stats now costs 15–31 hp, down from 56–102. Changes: camp foes deal ×0.6 (CAMP_K / campK in attacks.js, used by hurtPlayer and darkOrb); casters' element spells use power 0.42·atkMul·campK instead of 0.8·atkMul; the night damage bonus from the veil is 0.3 instead of 0.5; each foe's first strike after noticing her waits 1.2–2.8 s.
Grass fires: enemy spells pass noGround; an enemy fireball that misses her side lights nothing (a miss into a tree had lit the tree, and the tree lit the grass); the enemy big fireball lays no fire ring; the wisp burst is 2.2 m with noGround; a burning heroine no longer spreads fire to the grass. Enemy burning on her is 4 hp/s instead of 5. Her own fire burns her at 2 hp/s, with a light hurt vignette and a one-time toast.
Mana regen measured 6/s by day and 1.6/s at night (new floor), plus up to 10/s from nearby lantern light (that bonus was not re-measured, since no lanterns are lit in a fresh test state). Hearts dropped 4/4 when killing foes at 20% hp: under 40% hp the chance is at least 55%, under 25% it is certain. At night with mana under 25%, a mana orb drops half the time. Charm damage scales ×(1 + 0.15·level).

4. API REQUESTS: all present and smoke-tested (G.spells.shoot, damageFloor, useItem, litLanterns, squashPad, setMarkers layers, openShop, actor.flash, lock-on, impact payload keys). Details are under "api".

5. PHYSICS CPU (src/physics/physics.js, body.js, characters.js). Profiling showed almost all the cost in Rapier's step: 1.4 ms per frame with only 3 bodies awake. Those were apples creeping on wind and slight slopes that never went to sleep. Fixes: bodies that stay slow and grounded for 1.2 s are put to sleep; a fixed step is skipped when nothing is awake, nothing kinematic moved, nothing was added or removed, and no moving capsule is near a dynamic body. After a skipped step, capsules are placed exactly instead of swept. At the fox village (185 bodies): idle 1.40 → 0.035 ms, walking 1.41 → 0.04 ms. A falling crate, its impact, a blast, a raycast and the heroine pushing a sleeping box all still work.

6. DOCS: added "As-built updates" sections to sky, fx, physics, audio, player, ui, spells, gameplay, flora and combat .md, and rewrote the combat known-issues list.

## Public API
G.spells.shoot(opts) -> projectile|null (opts {el='moon', origin|pos, dir|vel|target|point, speed=13, size, radius, color, team='enemy', owner|caster, damage=10, power=1, life=4, turn=0, gravity=0, pierce, shape='orb', def:{impact,expire}, splash=1.2, trail, ...}); no paper sfx; enemy shots never light the ground.
G.spells.struggle.mash (readable). Player beam: b.len extends to a locked target, clamped to 42..75 m. Opposed beams (dot < -0.8) clash within 6 m.
G.player.damageFloor (number|null) + G.player.onDamageFloor(amount, opts).
G.gameplay.litLanterns(near?, range=Infinity) -> [{id, kind:'stone'|'lotus', pos, firePos, reactor, dist, douse(info)}].
G.flora.squashPad(id, k=1) -> bool.
G.ui.setMarkers(list, layer='main'); G.ui.openShop({..., currencyIcon}); items menu 'use'/'eat' -> G.gameplay.useItem(id); model.cooldownLeft(slot).
actor.flash(sec=0.08) (one shared material, no clones); actor.dispose() also disposes skeletons.
'physics:impact' {body, other, speed, pos, surface, relSpeed, impulse, owner, bodyOwner}.
G.physics.stats() adds skips and prof {sync, house, steps, interp} (ms).
combat/attacks.js: export CAMP_K = 0.6, campK(e).
无明: e.onDamage keeps hp >= 4% until e.data.breathWon; e.data.lockPoints are lock-on proxies.
Event 'player:bounce' {pad, speed}.

## Tests
All runs use node tools/play.mjs --size 960x540; T.errors() was empty on every run.
- fix2-mumyo (tools/devkit/fix2/boss-mumyo.js): locking cycles to a weak point; charms open it and deal 116–145 damage; phase 3 starts the breath; holding the beam and mashing at about 6/s gives "struggle end player push" after about 7 s; won=true. Before the fixes: no struggle ever started (the beams missed each other by about 4.6 m), the beam fell 13 m short of the weak points, and the boss could be killed without the breath.
- fix2-camp (tools/devkit/fix2/camp.js), 5 s standing still in four night camps: before 64 / 102 / 0 / 28 hp, then 56 / 36 / 51 / 40 after the first tune, final 15–31 hp. Fire-cell counts dropped to 0 in the first two camps once enemy fireball misses stopped lighting trees.
- fix2-oboroyo regression: struggle won at 6/s (v 0.62 → 0.98 in 3.8 s), won=true.
- fix2-phys (tools/devkit/fix2/phys.js): step cost idle 1.40 → 0.035 ms and walking 1.41 → 0.04 ms (181 of 180 idle steps skipped); a crate falls from 16 to 12.6 m and sleeps, 1 impact, a blast moves it 2.26 m, a raycast still finds it.
- fix2-push: a sleeping box moves 2.67 m when the heroine walks through it.
- fix2-regen: mana 6/s by day, 1.6/s at night; hearts dropped 4/4 at 20% hp.
- fix2-api: every requested API is present; damageFloor holds hp at 50; the impact payload has owner and bodyOwner.
- fix2-burnday: the heroine stays readable in daylight next to fire.
- check-i18n OK; full build green (8133 KB).

## Known issues
- The beam-struggle screen (胧夜 and 无明) is washed out: the heroine's own beam passes right by the camera and its bloom whites out the lower half of the frame. This needs work in fx / camera, outside my files.
- The camp_shore.png screenshot is from before the enemy-fire fixes and still shows a big grass fire. After the fixes, trees in a night camp still caught fire in 2 of about 8 camp runs (the first camp, night_pass); the logging run that caught it showed no fire being applied first, so the source was not found. Thunder and spreading heat inside elements (not my system) are the suspects.
- In a fresh test save, casting 日辉 (Sun Gleam) completes the m0 tutorial quest step and opens dialogue (talk mode), which stops the player's beam mid-struggle. The boss tests stub G.ui.say for this. A real player at 无明 is past m0, but story has no guard against quest dialogue during a boss fight.
- Charms are sun-element, so they open 无明's weak points by themselves; the sun beam and 金环 (Golden Ring) are not required. Design may want only 日 (sun) / 金环 to open them.
- When physics skips a step, character capsules in the query structures keep their old positions. Raycasts ignore capsules unless asked with characters:true, so this only matters for a caller that asks for capsules while the world is at rest.
- The 25 hp per 5 s camp target is met on average but varies from run to run (9–31 hp).
