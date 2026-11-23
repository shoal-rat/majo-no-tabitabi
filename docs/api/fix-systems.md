# fix-systems — as built

## Summary
I finished all six work items. Each one was checked with a headless play.mjs script. T.errors() stayed empty and fps stayed at 60 in every run.

1. **Sound coverage.** I wrote a scanner at tools/devkit/fix-systems/scan-sounds.mjs (node, not in-game). It collects every sfx/loop/music name in src/, including names in data fields such as `sfx:` / `sfxHit:`, HIT_SFX-style maps, alias targets, `also` layers, STEP, PROP_RULES and IMPACT. Before: 17 names were missing. After: 141 of 141 names resolve. I added 19 aliases or entries to names.js, all mapped to real assets: explosion_small/large, cast_fire_2, steam_sizzle, ice_shatter, rock_crumble, glass_shatter, crystal_chime, cloth_rustle, wind_chime, bell_small, koto_stinger, learn_fanfare, hit, slash, swing, ring_bell, a beam_hum loop, and a new 'bounce'.
   - Double playback, part 1: an alias now shares its cooldown key with its root name, so two systems that name the same moment differently play it once.
   - Double playback, part 2: the engine's event sounds (prop:broken, physics:impact, enemy:killed, item:collected) now wait one frame. They are dropped if another system already played a positional sound within 2.5 m and 0.15 s. Test: breaking a crate plays 1 voice (it was 2), and 2 duplicates were dropped (stats.deduped).
2. **Player and world feel.**
   - (a) Mushroom caps now bounce her. A lazily built 8 m grid over G.flora.bouncePads is checked on landing. Launch is 0.9×power, or 1.18×power when jump is held or pressed within 0.18 s. Bounces chain, she squashes, and there is a burst, a ring, the 'bounce' sound and a new 'player:bounce' event. A jump pressed while falling onto a cap is saved for the bounce instead of spending the air jump, and the wings do not open above a cap. Test: free bounce 17.8 m/s, about 7 m high, chained twice; held bounce 23.3 m/s, about 12 m high.
   - (b) Walking into props now depends on mass. Light props (under 12 kg) are kicked ahead at up to 4.5 m/s. Heavier props are pushed at up to 2.8×(1−resist) m/s, and she slows to that pace. At 85 kg and above they block her. She also detects a low, solid prop ahead of her feet and steps up onto it without shoving it. On the physics side, the mass-limited shove clamp now applies on every step of contact, not only the first bump. Tests on flat ground (-439,128):

     | Prop | Moved during 1.5 s of walking | Slide afterwards |
     |---|---|---|
     | crate | 2.6 m | 0.15 m |
     | boulder_l | 0 m | 0 m |
     | light items | up to 6.8 m | at most 0.5 m |

     Jumping onto a crate or the iron box: she stands on it and it moves 0 m.
   - (c) I confirmed the 'glow' trail style no longer turns the frame black. The broom trail is back to 'glow', and new 'glow' trails come from both wing tips while gliding.
   - (d) The gohei now eases to a wand-at-her-side angle when she stands idle; the walking angle is unchanged.
   - (e) Water against the real G.water, verified: swimming in deep water (y 0.03), ripples while swimming and wading, and mounting the broom from water all work.
3. **physics.** add() now accepts `rolling` (also settable later with body.setRolling). onImpact and 'physics:impact' now also carry relSpeed and impulse; the old fields are kept. In props, boulders, the iron ball, logs and all barrels set their own rolling value, and the boulder roll-assist workaround is gone. Test on a 0.23 slope: boulders roll about 19 m in 4 s and are still rolling; logs and barrels settle after about 1.8 m.
4. **elements.** The leak test (410 cycles of register → freeze, ignite or shock → unregister, 200 of them in a single frame) showed no leak, so no code change was needed. Objects stayed at 184, geometry count stayed flat, all frost shells were hidden and reused, and emitters and lights ended at 0.
5. **ui.**
   - The learn ceremony gave the arts (guard, shikigami, kinkan) the sun's glyph and the element kicker. They now get their own glyph, icon and the 'art' kicker.
   - The ceremony called G.fx.flash with the wrong arguments; it now uses G.sky.flash(color, dur).
   - Toasts now draw above modals (z-index 8).
   - The HUD has a new cooldown sweep on the selected spell, drawn for cooldowns of 1 s or more.
   - With real input, the HUD showed the charge ring, gauge, wet status and toast. The element icons were already there.
6. **props placement.** Goods in the village, town, fox village and shrine now go beside house walls and mostly avoid the street/door side. Market goods sit in front of the town stalls, and offerings sit on the street side of the shrine and fox-village halls. I raised the counts a little: more hay, carts, crates and barrels in the village, 12 market clusters in the town, 4 offerings at the shrine. Audit of all four places: 0 props inside walls, 0 on roads, 0 near anchors.

## Public API
All existing ★ APIs are unchanged. Additions:

**physics**
- G.physics.add({ ..., rolling?: number | { roll?, hold?, box? } })
  - A number is the deceleration in ×g while rolling (round shapes); boxes get 0.2× that as tumble calming.
  - The object form uses the same meaning as physics ROLL; hold is the steepest slope tangent a resting body stays on.
  - Leaving it out keeps the global defaults (roll 0.3, hold 0.45, box 0.06).
- PhysBody.setRolling(r) and PhysBody.rolling ({roll, hold, box} or null).
- onImpact(other, speed, info): info now also has relSpeed (m/s, closing speed of the two surfaces before the step; a sleeping or static partner counts as 0) and impulse (N·s = b.mass × speed).
- 'physics:impact' {body, other, speed, pos, surface, relSpeed, impulse}.
- Characters: a dynamic body touching a character capsule has its horizontal speed clamped on every step to min(5, 0.6·|vchar| + 0.8) × clamp(40/mass, 0.2, 1).

**audio**
- New names: explosion_small, explosion_large, cast_fire_2, steam_sizzle, ice_shatter, rock_crumble, glass_shatter, crystal_chime, cloth_rustle, wind_chime, bell_small, koto_stinger, learn_fanfare, hit, slash, swing, ring_bell, beam_hum (loop), bounce.
- Resolved entries have `key`; aliases share the cooldown key of their root name.
- Engine event sounds (prop:broken, physics:impact, enemy:killed, item:collected) are deferred one frame and skipped if another positional sound started within 2.5 m and 0.15 s. Count: debug().stats.deduped.
- The physics:impact volume uses relSpeed when present.

**player**
- New event 'player:bounce' {pad, speed}.
- Optionally calls G.flora?.squashPad?.(padId, k 0..1).
- Mushroom bounce: v = min(1.45p, p·(held ? 1.18 : 0.9) + 0.25·max(0, fall − p)), where p = pad.power.
- Props push: constants PUSH { LIGHT 12 kg, HEAVY 85 kg, MAXV 2.8, KICK 4.5 } inside player.js.
- Broom trail style 'glow'. Wings: createWings() returns stopTrails() too.

**ui**
- model.js: cooldownLeft(slot) -> 0..1; spellSlots() entries gain cd and cdBig.
- HUD: .hud-sp.main gains the class 'cooling' and the CSS var --cd.
- learnSpell: when id is not an element, it uses the art's own glyph, icon and kicker; o.element only tints it, gold for sun.
- Toast layer z-index 8.

**props**
- Catalog field `rolling` (passed to physics.add).
- place.js: NEAR table plus placeBeside(): placement modes 'wall', 'stall' and 'front'.

## Tests
Builds used `--systems fx,audio,ui,physics,elements,sky,terrain,flora,structures,props,player,spells` (or a subset), because the full build currently fails in src/combat (missing duel.js, bosses.js, wildlife.js). T.errors() was empty and fps was 60 in every run below.

- **Sound scanner** (node tools/devkit/fix-systems/scan-sounds.mjs): before 17 missing names, after 0 (141 of 141 resolve).
- **t-audio.js:** G.audio.has() is true for all 120 sfx names and all loops; breaking a crate plays 1 voice; 2 impact duplicates were dropped.
- **t-bounce.js** (night land): free bounce 17.8 m/s, rises 7.06 m, chains twice in 2.5 s; held bounce 23.3 m/s, rises 12.1 m. Looked at fix-bounce/bounce-rise.png: she is airborne over the caps.
- **t-push.js** (flat spot -439,128, walking 1.5 s), distance moved by the prop:

  | Prop | Mass | Moved while walking | Slide afterwards |
  |---|---|---|---|
  | crate | 23 kg | 2.58 m | 0.15 m |
  | barrel_large | 39 kg | 1.28 m | 0 m |
  | boulder_m | 44 kg | 0.13 m | — |
  | boulder_l | 142 kg | 0 m | — |
  | pot, bench, crate_small (light) | under 12 kg | about 6 m (she keeps walking) | at most 0.5 m |

  Before the fix, on a slope, the light items went 6.4 m and boulder_l went 13 m.
- **t-step.js:** jumping onto a crate or the iron box, she stands on top and the prop moves 0 m; she walks over planks without moving them.
- **t-water.js:** in deep water she swims at y 0.03 with ripples; mountBroom from the water gives state broom; wading makes ripples. Looked at fix-water/broom-trail.png and glide-trail.png: the 'glow' trails render with no black frame.
- **t-gohei2.js:** stick direction while idle went from (0.08, 0.66, 0.75) to (-0.2, 0.93, 0.3); the walking angle is unchanged.
- **t-roll.js** (slope 0.23): boulder_m and boulder_l roll about 19–20 m in 4 s (vmax 8.7 m/s, still rolling); the iron ball rolls 19.3 m; logs and barrels stop after about 1.8 m. Impact events carry relSpeed and impulse.
- **t-leak.js:** 410 cycles of register / status / unregister; objects 184 → 184, geometries 28 → 28, all shells hidden, emitters 0, lights 0.
- **t-ui.js:** cooling = true with --cd 0.75; charge 0.54; wet icon on; toast z-index 8; ghost glyph for guard is 「界」 (ward) with the art kicker. Looked at fix-ui/hud-sun.png (HUD with charge ring, cooldown sweep, gauge, status and toast) and learn-guard.png and hud-night-broom.png (the toasts sit above the learn modal; the guard name and description show).
- **t-place.js:** inWall 0, high 0 (fox village 2, which are deliberately stacked jars), onRoad 0, nearAnchor 0 for village, town, fox village and shrine. Looked at fix-place/place-village.png (goods now beside the houses) and place-town.png.
- check-i18n passes for src/audio, ui, props, player, physics and elements; `build --check` passes for every changed file.

## Known issues
- The full build (no --systems) currently fails because src/combat/combat.js imports duel.js, bosses.js and wildlife.js, which do not exist yet. All tests therefore ran without combat, gameplay and story.
- The night-land HUD-on-broom shot was not captured: the learn ceremony was still open when the shot was taken (E is only accepted 1.6 s in). Also, no combat lock-on reticle was tested, because G.combat is absent.
- Mushroom caps do not squash visually. flora has no API for it; the player calls G.flora?.squashPad?.(id, k) if it ever exists. Only the heroine squashes now.
- Pushing props: light props (under 12 kg) are kicked ahead of her at her walking pace while she keeps walking, so they travel about 6 m during a 1.5 s walk, but they slide at most 0.5 m after she stops. The log_short (15 kg, 0.66 m tall) is just above step height: she is blocked by it rather than stepping onto it.
- The gohei idle angle comes from the computed stick direction and was only checked as a number and in one distant screenshot. While she casts standing still (an upper-layer action), the gohei keeps the idle angle.
- The wing-tip glow trails are thin and faint in daylight (width 0.07). The broom trail is 0.2 m wide (0.32 m when boosting). Both may want art tuning.
- Event-sound dedupe is spatial: an unrelated sound from another system within 2.5 m and 0.15 s also suppresses the engine's event sound. The 'same frame' wait uses real time (12 ms), so very high frame rates defer by 2 frames.
- Props placement was judged in two aerial screenshots (village, town). The fox village and shrine were checked by numbers only. Wall goods avoid the street side 85% of the time; a door on a non-street side could still get a cluster in front of it.
- The audio, physics and props docs (docs/api/*.md) were not updated with the new fields; this report is the record.
- Nothing has been heard by ear: headless runs are muted.
