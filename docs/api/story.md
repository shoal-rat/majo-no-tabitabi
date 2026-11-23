# story — as built

## Summary
The story system is finished: the stub is replaced with the NPCs, the companion 团子 (Dango), the dialogue runtime, the quest engine, main quests m0–m6 with the ending and free roam after it, eleven side quests, skippable cutscenes and the test hooks. The acceptance test (tools/devkit/story/playthrough.js) passed twice in a row. Each run starts from a new game, reaches the ending and continues into free roam, with ALL PASSED and T.errors() empty both times. The full build and node tools/check-i18n.mjs are both green.

What exists:
- **NPCs**: all 11 named characters from §1.3 stand at their anchors. 磐翁 (Banou) has no model in the catalogue, so he uses char_villager_c. 胧夜 (Oboroyo) only appears after the ending. There are 14 unnamed folk: villagers, fox folk and town folk. Every NPC is built with createActor and has idle behaviours, turns to face the heroine, has a talk prompt from the locale, changes expression while speaking, and has barks that change with story stage. NPCs stream in and out by distance, at most about 10 alive. 阿汐 (Ushio) stands at the village well. The 团子屋 (dango shop) keeper and the town shopkeeper open G.gameplay.openShop. The four rivals can be challenged to a spar after their story duel.
- **团子**: an ani_fox creature with a soft glow sprite. It floats at the heroine's shoulder and sits on the broom tail in flight. It shows first-time key hints, and after idle time it gives direction or spell hints through its own speech bubbles (src/story/bubbles.js). Hints respect G.settings.hints.
- **Dialogue** (src/story/dialogue.js): scripts are data in the locale files. Each one runs through G.ui.say with a two-shot G.cam.cinematic camera and speaker expressions. Hooks are called by id: learn, big, give, flag, start, result and others.
- **Quests** (src/story/quests.js + questdefs.js): steps have on/check/talk conditions, objective text and marker targets. State lives in G.state.quests. The quest events are emitted, the tracker and markers stay in sync (re-pushed after race:finish), the journal provider is fed, and the game autosaves on progress.
- **Big (charged) forms**: each element's big form comes from its teacher after a side favour, or from a spar win against the rival who taught it.
  - 日辉 (Sun Gleam) from 婆婆 (Granny) after 10 ema.
  - Fire, wind, ice and thunder after beating the rival who taught it in a spar.
  - Water from the kite quest (阿汐).
  - Earth after the twelve stone lanterns (磐翁).
  - 月引 (Moon Pull) after 8 moon tears (镜姬, Kagami).
  - 金环 (Golden Ring) is granted before the final battle.

Fixes made this session:
- **Broom chest**: the interaction radius was 2.4 m, but the heroine stops 2.5 m from the chest, so the open prompt never appeared. It is now 3.2 m.
- **Learning 唤帚 (Broom Call) / 光翼 (Light Wings)**: the 'learn' hook did nothing for 唤帚 and 光翼, because G.spells.learn returns false for ids missing from the spell book. The hook now stores the ability itself, emits 'spell:learned' and shows the learning ceremony with the ui.spells.art names.
- **Tracker**: side quests that open on their own (葛叶的谢礼 "Kuzunoha's Thanks", 六花 "Rikka") took over the HUD tracker from the main quest. Now only side quests accepted from an offer are tracked automatically; the others go to the journal.
- **Busy flag**: the cutscene runner now restores the previous S.busy instead of clearing it. runEnding stays busy until the epilogue ends, so nothing can slip in between the ending and the epilogue.
- **Debug**: S.lastDuel is now recorded and shown in G.story.debug().

What the test drives and asserts: the opening plays and is skipped with Esc; dialogues advance with real E presses. It then goes through every story event from 婆婆's lessons to the 月灯 (Moon Lamp), each against the real system:
- The training wave, the duels (with { testWin }), the real broom chest, the six-ring race flown ring by ring, and the village fire put out with water.
- The glide lesson, the three 影巢 (shade nests) burned, and every boss (胧牙 Oboroga, 灯喰蛾 Tomoshigui, 胧夜, 无明 Mumyo).
- Great lanterns lit through E at each lantern, fireflies and lotus lamps through gameplay debug helpers, and the crystal puzzle solved with rotatePedestal.
- The barrier falling, 金环 granted, then the ending wave, showEnding and free roam with the postgame flag.

Quest state is checked after every step, and all spells and abilities are checked at the end. The save / reload is done twice (after m1 and after m4): G.save.write, then the live state is wiped and G.story.debugReload(json) re-runs every system's start(). Quests, spells, abilities and lanterns came back identical both times. A second play.mjs run with continue=1 was not tried, because play.mjs always starts with saving disabled.

In one run the 鸣 (Naru) duel was lost even with testWin. The in-game retry path (talk to her again → 'retry' dialogue → new duel) recovered it, and the test now allows up to 3 tries per duel.

Screenshots I looked at: the opening (婆婆 telling the legend over the shrine), the day two-shot with 婆婆, the night two-shot with 鸣 in the town, the tracker plus compass marker, the 暮灯 (Dusk Lamp) lighting, the first sight of the ring, the ending wave and the ending card. They look right. Run with --params "story=1&from=N" the test starts at chapter N through debugSkipTo, for faster iteration.

## Public API
**G.dialogue**
- ★ play(id | lines, { vars, skippable }) -> Promise<{ result, skipped }>
- hook(name, fn(arg, ctx)) registers a hook; lines call it as 'name:arg'.
- Current hooks: learn, big, give, flag, start (starts and tracks a side quest), result (sets the result field returned by play, e.g. 'duel'), and others.
- cond, skip(), facePartner, current, active.
- Line format: { who, text, expr?, choices?: [{ text, do?, goto? }], do?, if?, goto? }, plus labels.
- Runs through G.ui.say in mode 'talk' with a G.cam.cinematic two-shot.

**G.quests**
- ★ start(id, { silent, track }), advance(id), isDone(id), isActive(id), active(), tracker() -> { title, objective, progress } | null.
- at(id, stepId), stepId(id), stepIndex(id), targets(id), trackedId(), journal() (feeds G.ui.providers.journal), refresh(), restoreAll(), complete(id), defs.
- ★ debugSkipTo(questId[, step index | step id]) grants everything earlier quests would have given.
- Events: 'quest:started' / 'quest:updated' / 'quest:completed' { id }.
- State: G.state.quests[id] = { state, step, vars }.

**G.npcs**
- get(id), actor(id), posOf(id), list(), roster, alive(), isPresent(id), bark(id, text, dur), gesture(id, name), speaking(id, on), beginTalk / endTalk, place, rehome().

**G.story**
- talk(id), dlg(id | lines, opts), duel(rivalId) -> Promise<won>, boss(id, introDlg), grant({ spells, abilities, flags, items, lit, collected }).
- flag(k), setFlag(k), track(questId), chapter(), stage(), hint(id, opts), runEnding().
- busy, fights, lastDuel, testWin (test-only: runs story duels and bosses with { testWin: true }).
- cut: opening, lantern(id), bossIntro, ring, townLit, barrier, ending, skip(); all skippable with the cancel action.
- companion: say(text), hint(id, { repeat, delay, force }), emote(kind), pos.
- fire: the m1 hay-stack fire (slots(), onWater).
- debug() -> a state snapshot; debugReload(json) re-runs every system's start() from a saved state.

**Persistent state**: G.state.story = { hints, spars, fireDoused, tracked }. The rest uses G.state.flags, spells, abilities, defeated, greatLanterns and collected. Flags include opening_seen, duel_<rival>, town_lit, town_shop_open, ring_seen, ending_done and postgame.

**Quest ids**: main m0_shrine, m1_village, m2_dusk, m3_town, m4_mirror, m5_crystal, m6_moon. Side quests s_kits, s_races, s_lanterns, s_kite, s_cook, s_painter, s_ema, s_tears, s_rikka, s_kuzunoha (式神, shikigami), plus a lamp quest.

## Tests
node build.mjs --check src/story/*.js src/locales/zh-CN/story*.js: OK. node build.mjs: green. node tools/check-i18n.mjs: i18n OK.

play.mjs story-smoke: opening plays and is skipped, 婆婆 talk two-shot, 日辉 learned, errors [].

play.mjs story-pt with --params story=1 --timeout 1500, script tools/devkit/story/playthrough.js: the full new game → m0…m6 → ending → free roam passed twice in a row with ALL PASSED and errors []. Both save/reload checks (after m1 and after m4) restored quests, spells, abilities and lit lanterns identically.

The test asserts:
- every main-quest step,
- spells sun, fire, water, wind, thunder, moon and earth, and abilities guard, broom, wings and kinkan,
- the barrier is down after the three lanterns,
- 金环 is held before 胧夜,
- G.mode is 'play' after showEnding with the postgame flag set.

Running with from=N starts at chapter N (one run from=3 passed through m3–m6). The test stops after 3 failures and prints G.story.debug() with each failure.

## Known issues
- Story duels with { testWin: true } can still lose. The 鸣 duel lost once in testing. The in-game retry dialogue recovers it, but combat should check why testWin can fail.
- Reload was only tested in the same run through G.story.debugReload(json), which wipes G.state and re-runs every system's start(). A second play.mjs run with continue=1 was not tried, because play.mjs always starts with saving disabled.
- Every boss and great-lantern fight was finished through testWin or by applying damage directly; none was won with real player input.
- 磐翁 has no character model in the catalogue, so he uses char_villager_c.
- The HUD tracker stays visible during letterboxed cutscenes (seen in the ending). This is UI-side: should it hide while the letterbox is up?
- The test burns the brambles with very large fire hits, which leaves big grass fires in the 暮灯 screenshot. Normal play does not do this.
- The opening only plays on its own in autostart runs when ?story=1 is set, so other engineers' tests are not interrupted. A real new game from the title screen does play it.
- After the ending, the tracker falls back to the first active side quest. The UI has no way to choose which quest is tracked; G.story.track(id) exists for that.

## Play-test, final round (first half: title → m0 … m3)
**How.** One new game from the real title screen in a persistent profile (`.tmp/profiles/fp1`), driven only by keys, mouse look and mouse buttons through tools/play.mjs scripts (helpers in `tools/devkit/final-play1/lib.js`: walk / fly the broom by steering the camera, talk with E, fight with talismans + spells, guard on a rival's release, dodge big forms, eat 团子 (dango, the food) when low). Eighteen short runs, each one "继续" (Continue) from the title, so every run was also a save / load check. No debug kills, no teleports in the real save. Two recoveries were needed because the bot walks in straight lines: it wedged against a house in the town and flew over it (a player walks round). The menus were opened on the way: map, journal, spell wheel, spell book, the town shop, pause → 「记下并回到标题」 (Save and Return to Title) → 「继续」.

**What happened, in order.** The opening plays and skips with Esc. 婆婆 teaches 日辉, the training wave is easy (no damage taken), and 阳葵 (Himawari) was lost 5 of 5 times (see below). After the fix she was won on the second try with 45 hp left. Then the broom chest and the six-ring flight (17 s). In m1 the bot flew to the village, beat the paper sprites, met 阿汐 and doused 2 of the 3 stacks; the third was a soft block (below), and after the fix it was doused. In m2 the bot flew over the 暮桥 (Dusk Bridge) to 葛叶 (Kuzunoha), beat 九重 (Kokonoe) on the first try (32 hp left), glided by stepping off the broom high up, and burned the three 影巢 with 狐火, Foxfire (about 17 s each, hp 100 → 43). 胧牙 killed her once: she walked in at 43 hp while a screenshot froze the bot. On the second go she won in 43 s with two 团子. 暮灯 lit with E. In m3 the 轮 (ring) scene played in flight, then 烛 (Shoku), three 萤火 (firefly lights), the tower lit, and 鸣 lost twice: unwinnable, then no way to retry (below). After the fixes 鸣 was won on the second try with 14 hp left, and m4 was tracked. Save to title → continue restored the place, the quests and the spells exactly.

**Fixed (my files).**
- *Duel beam trap* (story.js `duel()`). At 55 % hp every rival casts the beam set piece, and its toast says to answer with 天照 (Heaven's Light). 天照 is the big 日辉 form, which comes only from the 绘马 (ema) side quest, so on the main path the beam was an unanswerable 60-hp hit, and 阳葵 (the first duel) could not be won. Story duels now pass `beamAt: -1` while `spells.sun < 2`. Once she holds 天照, the set piece comes back.
- *Spar starts hurt* (story.js). A duel now refills hp and mana; she had walked into a duel at 75 hp after a load.
- *鸣 deals ~10× the others* (story.js `SPAR_HURT = { naru: 0.35 }`, which scales the damage that reaches her during that spar only). Measured: 8 thunder strikes = 99 hp in 6 s while guarding, against ~2 hp/s from 阳葵 / 九重. A combat-side retune is requested; the wrapper should go once it lands.
- *No talk prompt at 鸣* (npcs.js). Her taiko set stopped the heroine about 3 m out, past the 2.9 m talk radius, so after a loss she could not re-challenge from the ring side (a soft-lock). NPCs with a work set now take 3.8 m.
- *m1 fire under the eaves* (story.js `computeSlots`). Village hay stands 2–3 m from the house walls. One stack burned under a thatched roof on the far side of a house: the flame was hidden, the marker sat on the roof, and her water broke on the wall. Each slot now steps out until it is 4.4 m clear of the nearest wall collider, and the burning hay is matched within 1.6 m.
- *Opening* (cutscenes.js). The first line typed under the fade-in; it now waits 1.4 s.
- *HUD* (hud.js). Quest pins hide during a duel, since the rival is the goal. A pin that would sit on the tracker text drops just below it with its label tucked (the race ring pin printed over the race tracker). "G 金环已满" (G: Golden Ring full) no longer shows before she owns 金环 (it showed in m2).
- *Spell book* (menu.js). The 日 (sun) cell was labelled 「灵符」 (Charm), because the lookup matched 灵符 (element 'sun') before 日辉. The exact id now wins.
- *Map* (map.js). Names around the shrine and the village were printed on top of each other. Overlapping text is now hidden in priority order: quest labels, then place names, then the rest.
- *Lantern hint mid-fight* (lanterns.js). 「镇灯沉睡着」 (The warding lantern sleeps) toasted during the 胧牙 fight when spells hit the lantern; it is now silent while a boss or duel runs.
- *Dialogue framing* (dialogue.js, companion.js). In over-the-shoulder shots the heroine's head hid a shorter speaker (烛), so the shoulder offset went from 0.75 to 1.1 m. 团子 floated on the camera's side and filled a third of the frame; in talks it now floats on her far side.

**Checked and left alone.** Both characters' yaws are correct during dialogue (probe). Shots where they seemed to face away were taken mid camera blend. The pause confirm defaults to 「再走走」 (Walk on a while), the safe choice, and "leave" reloads to the title.

**Reported to others** (see the round report): the duel retune for 鸣 (duel.js); oversized star / flame effects in front of the camera at the race finish and around the nests (fx / elements); a transient shader compile error in src/fx/bolts.js (`'add' : redefinition`) seen once while that file was being edited.

**Tests.** `node build.mjs --check` on every changed file: OK. `node tools/check-i18n.mjs`: OK. Story acceptance (`accept1`): ALL PASSED, errors []. Screenshots: `.tmp/play/fp1_r1` … `fp1_r18`, notes in `.tmp/final-play1/PROGRESS.md`.

**Known gaps.** The bot cannot path round buildings; a human may still find the town alleys awkward. The 胧牙 arena can be entered at low hp straight from the nests, but death respawns her at full hp nearby. Several fights were lost while screenshots froze the bot, so the win rates above are pessimistic.

## Play-test, final round (second half: m4 … m6, ending, side content, settings)
Played from a mid-game state (`debugSkipTo` m4 / m5 / m6 steps) with real input through tools/play.mjs: walking, the broom, E at every prompt, charms with lock-on, 天照 against beams, Q dodges, 团子 with X, 金环 with G. Teleports were used only as a stand-in for flying between regions and to step round a megalith the bot cannot path round. Scripts and notes: `.tmp/final-play2/` (bot.js + s1…s6, PROGRESS.md). Screenshots: `.tmp/play/fp2_*`.

**What a player meets, and what changed**
- **m4 lotus lamps could not be lit.** The broom cruises about 4 m above the lake, and the prompt needs |dy| ≤ 3.2. It also glides on after W is let go, past the 2.8 m radius. The bot got 0/3 lamps while hovering right over them. Fix (collect.js): the lamp prompt follows her height, up to 6 m above the lamp, and the radius is 3.6 m. A fly-over at cruise height now works: 3/3 lamps in about 5 s.
- **灯喰蛾 fell in 16 s** (1200 hp) to held charms, before it ever tried to eat a lamp, so neither the eating nor the grounding showed. Fix (bosses.js): 2200 hp, and the first eating at 8 s instead of 14.
- **Great-lantern prompt out of reach.** At 晶灯 (Crystal Lamp) and 月灯 the stepped plinth stops her about 4.6 m out, but the prompt radius was 3.2. Fix (lanterns.js): 4.8.
- **m5** plays cleanly. The crystal wave takes 30–40 s. The puzzle reads well, because each correct pedestal lights the next beam (16 presses with E). The barrier scene and the two learning ceremonies take about 12 s.
- **胧夜 one-shot.** Her earth big form hit for 99 at full hp, and small casts hit for 31. Spell entities take damage from the spell book and ignore the caster's `power`, so her `power 0.65` / big-form 0.45 never applied. Fix (duel.js): while the boss duel runs, her hits on the heroine are scaled by `cfg.power`, and anything above 35 is softened further (meteor 99 → ~44, lost struggle 60 → ~36). This uses the same `d.restore.orig` hook that cleanup() already restores. After the fix the bot won on its 2nd try, about 60 s for the fight itself.
- **Beam struggle.** It reads well: the 对波 (beam clash) bar shows "连点 左键" (Mash Left Click), and the beamTell toast names the key. The win needs about 3.5 presses a second. The bot, mashing at about 3 a second at 20 fps, won about half of its struggles. A person at 6–8 a second wins easily. A lost struggle costs about 36 hp, after which she can retry when the next beam comes.
- **无明 knocked her off the palace.** The hand slam (knock 12, impulse 16) threw her over the edge. She landed 200 m below, alive, with the boss bar still up and no way for the fight to end. Fixes (bosses.js): the knock is now 7 and the impulse 9. Being more than r+45 m from the arena (or 25 m below 无明's floor) for 4 s calls the fight off, with the toast combat.boss.left, and the normal retry follows.
- **无明 began as she landed.** The fight started with the great ring gate between her and the hearts, about 78 m away, so every charm hit the gate. Fix (questdefs.js): the trigger pad is now 2 instead of 40, so the fight starts once she is through the gate. Its shade bonus in the dark made the hand hit for 39–54, two hits from full hp. Fix: dmgMul 0.7. After these fixes the bot won on its first try in 64 s, with 金环 three times and the breath struggle won. Every phase showed.
- **The ending lands.** Each line stays on screen 4.8–5.9 s, which is readable. After that come the 终 seal and the roll, then the epilogue, and free roam with `postgame`. **The credits printed raw manifest provenance**, including build paths (`.tmp/costume generator`, `tools/devkit/protagonist/props.mjs`), long processing notes, and the game's own generated work listed as "borrowed". Fix (ceremony.js `creditName`): the roll shows only the maker. Notes after `;` or ` — ` are cut, and processing parentheses are dropped (the font names in brackets are kept). Own work is left out, and duplicate sources are merged. Fonts now have their own group, 「字迹」 (Lettering; the three OFL faces), instead of 「其他」 (Other). CREDITS.md already lists the fonts.
- **Settings: key rebinding did not exist** (the controls page only showed the keys). Added: a 「按键」 (Keys) section in the settings form, used on both the title sheet and the pause scroll. It covers 21 actions and 「按键还原如初」 (Restore Default Keys). Choose a row and press Enter or click it, then press the new key or mouse button; Esc cancels and does not close the menu. A key that already belongs to another action is swapped over to it. The default alternates (the arrow keys, middle mouse) stay bound unless they are taken. Changes are saved as `G.settings.keys` and applied at UI start (ui.js). Every hint updates through 'input:rebound'. Tested: jump → V jumps with V, interact → F swaps 唤帚 to E, the HUD hint shows the new key, Esc cancels, keyboard-only rebinding works, and reset restores the defaults. The quality tiers switch and show the "next time" note. The other rows work.
- **Side content** checked with real input: the town shop (buy with Enter: 团子 +1, stardust −12, Esc leaves), a spar with 鸣 (won in 14 s; the thunder big form was granted afterwards), and reading an ema by E. Not checked this round: the broom races beyond ring 1 (the first play-tester covered starting a race), the ten side quests end to end, and collecting moon tears by walking.

**Requests to other owners**
- **camera / fx:** during the 胧夜 struggle, the clash ball hides the heroine completely in the side-on framing (`.tmp/play/fp2_m6/oboroyo_struggle_1.png`).
- **spells:** spell entities (meteor, small earth, and others) take `damageOf()` and ignore the caster's `power`. Enemy casters using the player's book therefore always hit at full player strength. If this is fixed in spells, remove the boss-duel wrap in duel.js (search "final-play2"), or the scaling applies twice.
- **ceremony / UI style:** the roll's "按住 空格 快些" (Hold Space to hurry) hint sits over the scrolling credits at the bottom centre.

**Tests.** `node build.mjs --check` on every changed file: OK. `node tools/check-i18n.mjs`: OK. Real-input runs: fp2_m4, fp2_m5, fp2_m6 / fp2_ob, fp2_mu, fp2_end, fp2_side, fp2_set. T.errors() was [] in all of them. Story acceptance `accept2` (after all changes): ALL PASSED, errors [].

## Draw-call pass (2026-11-14, see docs/api/actors-look.md "Draw-call pass")
- npcs.js creates cast / folk actors with `animLod: true` (pose every 2nd frame beyond 60 m, every 4th beyond 100 m).
- The folk tone edits (`toneOf`: Onepice / Shoes / Hair / Body / Face) and the hidden Kanzashi work on the slots of the
  merged character parts (`celSlotsOf`, `hideCelParts`); separate materials (`?castmerge=0`) keep the old path.
