# audio — as built

## Summary
The audio system (G.audio) is in place: it replaces the stub in src/audio/audio.js and adds names.js, synth.js and director.js. Build check and i18n check both pass, and every headless play test finished with T.errors() empty and fps at 60.

What it does:
- **Sound graph.** Everything goes through a master gain into a gentle compressor and out. Under the master sit a music bus with ducking, a stinger bus, a world group (sfx and ambience buses feeding a low-pass filter and a world duck) and a UI bus that is never filtered. Volumes come from G.settings (master, music, sfx) and update live on 'settings:changed'. When muted the master gain is 0 but all the logic still runs.
- **Ducking.** Menus lower the music to 0.45 and the world to 0.45 with a 900 Hz low-pass. Dialogue ('talk') lowers the music to 0.72. Stingers lower the music to 0.3. With the camera under water the world goes through a 550 Hz low-pass.
- **Decoding.** Files are decoded on demand with G.assets.arrayBuffer then decodeAudioData. Sound effects are kept forever. Music and ambience are evicted least-recently-used first (at most 3 music and 8 ambience buffers decoded) because decoded music is about 45 MB per track. Common sound effects are preloaded in idle time after start. While muted, music and ambience files are not decoded at all.
- **Name table.** 197 logical names (16 are aliases of other entries). Each has volume, pitch jitter, a per-name voice cap, a cooldown, an audible range (60 m default, up to 75 m for big sounds) and a bus, and can trigger extra layered sounds. All asset ids exist in the manifest and all 189 audio assets are used. The cooldown also stops two systems that call the same name in the same frame from playing it twice.
- **Positional sound.** Distance falloff (full volume within 4 m, silent at the range) and stereo pan relative to the camera, no HRTF. The total number of one-shot voices is capped at 40; when full, the oldest voice of equal or lower priority is cut.
- **Synth fallbacks.** Procedural sounds rendered once into buffers: tick, snow, sand, hum, wind, rumble, sparkle, chime, thud. They cover names with no fitting file (snow and sand steps, dialogue typing, beam hum, quake) and stand in if a file fails to decode.
- **Director, music.** Every 0.25 s it picks a mood:
  - mode 'ending' gives ending; 'title' gives title
  - an active boss gives boss, or final when the id matches oboroyo / mumy / mumei / final / tsukuyomi
  - a duel gives duel (final for oboroyo)
  - G.combat?.inCombat, or a threat in the last 7 s, gives battle. Threats are 'enemy:hit', 'player:damaged' with an enemy as `from`, or 'enemy:spawned' within 35 m.
  - on the broom, more than 22 m up or faster than 19 m/s for 2 s, gives flight (it ends 4 s after that stops)
  - region shrine or training gives shrine; town gives town; otherwise sun, dusk or night by land. (Superseded: see "Original score round" at the end.)
  
  A new mood must stay wanted for 0.3 s if urgent, 2.5 s for exploring, and an exploring track plays at least 8 s, so short flickers never restart a track. Exploring tracks resume where they stopped if you return within 150 s.
- **Director, ambience.** Beds crossfade by land: meadow, dusk woods, night, mountain on 霜见岳 (Frostview Peak), town murmur near 万灯镇 (Myriad Lantern Town). Layers on top: river (riverDist), lake and sea (an isWater ring sample), rain (isRainingAt), fire (burning ground cells and burning objects near the listener), wind rising with altitude and broom speed, and a broom rush that follows speed. Birds and crickets fade as she climbs.
- **Stingers and event sounds.** Stingers play on 'greatlantern:lit', 'spell:learned', 'quest:completed', 'boss:defeated' and a won 'duel:end'. Sounds are also hooked to player:step by surface, player:healed, player:died, player:respawn, item:collected, enemy:killed, spell:clash, physics:impact by material, prop:broken by type keyword, race:start, race:finish and checkpoint. The player's own jump, land and dodge calls are not doubled.
- **Instrumentation.** G.audio.debug({meter}) reports the state used by the tests, including a real output level meter.

**Full name table** (logical name → asset ids or synth; see src/audio/names.js for volume, voice cap and cooldown):
- **UI:** ui_move→sfx_ui_move/_2; ui_select (=ui_confirm)→sfx_ui_confirm; ui_cancel (=ui_back)→sfx_ui_cancel; ui_open→sfx_ui_open/sfx_book_open; ui_close→sfx_ui_close/sfx_book_close; ui_error→sfx_ui_error; ui_page→sfx_paper_1..3; ui_text→synth tick; ui_toggle; ui_save; ui_scroll; ui_chime→sfx_ui_confirm_2; ui_cancel_soft→sfx_ui_cancel_2; buy→sfx_ui_buy; stamp→sfx_ui_stamp+taiko; paper→sfx_paper_1..3; book_open; book_close.
- **Fanfares and stingers:** learn→sfx_learn_fanfare; levelup→sfx_levelup_chime+levelup_rise(sfx_levelup); stinger_quest→sfx_koto_stinger_1; stinger_lantern→sfx_koto_stinger_2+shrine_bell; stinger_victory→sfx_jingle_festival; festival→sfx_jingle_festival.
- **Steps:** step_grass→sfx_step_grass_1..4; step_stone→sfx_step_stone_1..4; step_wood→sfx_step_wood_1..4; step_water→sfx_step_water_1..4; step_snow→synth snow; step_sand→synth sand; step_path→grass steps at rate 0.86 + step_sand; step_metal→stone steps at rate 1.35; step_ice→stone steps at rate 1.2 + crystal; step_soft→synth sand.
- **Heroine:** jump→sfx_jump(+voice_jump 30%); jump_air→sfx_swish_1..3+wing_flap; land→sfx_land; land_soft→sfx_land_soft; dodge (=dash)→sfx_dash(+voice_effort); wings_open→sfx_wing_flap_1/2+sparkle; wing_flap (=wings); player_hurt (=hurt)→sfx_voice_hurt_1..3+hit_body; player_burn→sfx_hit_fire_2(+voice_hurt); player_die→sfx_debuff+voice_hurt; voice_hurt; voice_jump→sfx_voice_jump_1/2; voice_effort→sfx_voice_effort_1..3; voice_healed; heal→sfx_heal_1/2(+voice_healed); revive; swim; climb; cloth→sfx_cloth_rustle; guard→sfx_buff_defense; parry→sfx_hit_heavy+crystal; mana_empty→sfx_ui_error at rate 0.8.
- **Broom:** broom_summon→sfx_teleport_1+sparkle; broom_dismiss→sfx_teleport_2; broom_boost→sfx_whoosh_1/3; broom_turn→sfx_whoosh_2; broom_loop→sfx_broom_whoosh_loop.
- **Spell casts:** cast_fire→sfx_cast_fire/_2; cast_water/ice/wind/thunder/earth/sun/moon/dark→the matching sfx_cast_*; cast_charm (=charm)→swishes+paper.
- **Spell hits:** hit_fire→sfx_hit_fire/_2; hit_water; hit_ice; hit_wind; hit_thunder→sfx_zap_1/2; hit_earth; hit_sun; hit_moon; hit_dark; hit_charm→sfx_hit_body_1..3 at rate 1.3.
- **Reactions and big effects:** explosion→sfx_explosion_small; explosion_big (=crater)→sfx_explosion_large; thunder→sfx_hit_thunder; thunder_chain, zap→sfx_zap_1/2; spark (=zap, quieter); steam→sfx_steam_sizzle; freeze→sfx_cast_ice at rate 1.25; ignite→sfx_lantern_ignite/sfx_cast_fire_2; extinguish→sizzle; purify→sfx_hit_sun+sparkle; melt, bubble→sfx_bubble_1/2; shatter_ice→sfx_ice_shatter_1/2(+glass); shatter_rock→sfx_rock_crumble_1/2; shatter_crystal→glass shatter+crystal; glass→sfx_glass_shatter_1/2; wood_break→sfx_wood_break_1/2; rock_fall; splash→sfx_splash_1..3; splash_big; whoosh (=throw)→sfx_whoosh_1..3; swish→sfx_swish_1..3; gust→sfx_hit_wind/sfx_whoosh_3; tornado; rain_start; meteor→sfx_whoosh_1 at rate 0.55; quake (=rumble)→synth rumble; pillar→sfx_cast_earth+quake; pillar_break.
- **Charge, beams and support magic:** charge→sfx_charge; charge_done→synth chime+crystal; clash→sfx_hit_heavy+zap; clash_big→sfx_explosion_large+crystal; beam_start→sfx_cast_sun; beam_loop→synth hum (loop); magic_circle→sfx_buff_defense; summon (=shikigami)→sfx_buff_attack+paper; ultimate (=kinkan)→sfx_cast_sun+shrine_bell+explosion_big; grab→sfx_hit_moon; slow_field→sfx_cast_moon; buff_attack; buff_defense; buff_speed; debuff; poison; teleport→sfx_teleport_1/2; sleep; sparkle→synth sparkle.
- **Impacts and creatures:** hit_body→sfx_hit_body_1..3; hit_heavy; hit_wood; hit_stone; hit_metal→sfx_hit_stone/sfx_bell_small_1 at rate 1.4; hit_soft→sfx_cloth_rustle; enemy_hit→hit_body(+creature_hurt); enemy_die→sfx_creature_hurt_2/sfx_slime_2+purify; creature_hurt→sfx_creature_hurt_1/2; growl→sfx_growl_1..3; howl→sfx_howl_1/2; roar→growls at rate 0.75; squeak→sfx_squeak_1..3; squeak_rat; slime→sfx_slime_1/2; boss_death→sfx_explosion_large+purify+shrine_bell; enemy_shot→sfx_cast_dark at rate 1.3.
- **World, props and pickups:** pickup→sfx_pickup_1/2; pickup_gem; coin→sfx_coin_1..3; tear→sfx_pickup_gem+chime; chest (=chest_open)→sfx_chest_open+sparkle; chest_close; door (=door_open)→sfx_door_open; door_close; door_creak; lock_open; switch→sfx_switch_1/2; bell→sfx_bell_small_1..3; shrine_bell→sfx_shrine_bell_1/2; chime→sfx_wind_chime_1/2; crystal→sfx_crystal_chime_1..3; taiko→sfx_taiko_1/2; taiko_roll; koto→sfx_koto_stinger_1/2; firework→sfx_firework_1..3; lantern_ignite→sfx_lantern_ignite(+bell); lantern_out→sizzle; greatlantern→sfx_lantern_ignite at rate 0.7+shrine_bell; checkpoint→small bells+ui_save; race_ring→crystal chimes+whoosh.
- **fx burst names also accepted as sounds:** dust→sfx_land_soft; leaves (=petals)→sfx_cloth_rustle; feathers→sfx_wing_flap_1/2.
- **Loops for loop():** fire_loop→amb_fire; wind_loop→amb_wind_high (synth wind fallback); rain_loop→amb_rain; water_loop→amb_river; lake_loop→amb_lake; steam_loop→sfx_steam_sizzle; charge_loop→synth hum; swirl_loop→sfx_broom_whoosh_loop.
- **Music moods:** title, home, sun, dusk, night, town, pages, flight, battle, duel, boss, final, ending → the matching bgm_* track (see "Original score round" below).
- **Ambience beds:** meadow, dusk, night, mountain, town, river, lake, rain, fire, wind → the matching amb_* loop; broom → sfx_broom_whoosh_loop.

## Public API
G.audio (system 'audio', pausable:false):
- ★ sfx(name, { pos?: {x,y,z}, vol=1, pitch=1 (multiplies the entry's rate; jitter is added), delay=0 (s) }) -> voice | null.
  - Unknown names are ignored, with one console.warn per name; they are listed in debug().missingNames.
  - Returns null when the call hits its cooldown, is culled (out of range or near silent) or is dropped by the voice cap.
  - With pos: full volume within 4 m, falling to 0 at the entry's range (60 m default, at most 75 m). Stereo pan comes from the camera's right vector.
- ★ loop(name, { vol=1, pos? }) -> { setVol(v), setPos(p | null), stop(fade=0.4), playing }.
  - name is a loop entry from the table, or a raw audio asset id (e.g. 'amb_fire'). Unknown names return a harmless dummy handle.
  - Level glides to vol × entry vol × distance falloff; positional loops are panned. The playback start point is randomised.
- ★ music(mood | null, { fade=2 }).
  - mood is one of title, home, sun, dusk, night, town, pages, flight, battle, duel, boss, final, ending, or a 'bgm_*' id.
  - Any manual call overrides the director; null fades to silence; music('auto') hands control back to the director.
  - Crossfades are equal-power. A track that is fading out comes back without restarting. Exploring tracks resume from where they stopped if you return within 150 s.
- unlock(): resumes the AudioContext. It is also wired to the first pointerdown, keydown, touchstart or mousedown and to 'input:lockGained'.
- setVolumes(): re-reads G.settings.master / .music / .sfx and the mute flag. Runs automatically on 'settings:changed'.
- Extras:
  - names: the resolved name table
  - has(name)
  - preload(namesOrIds) -> Promise
  - stopAll()
  - ctx and muted (getters)
- debug({ meter? }) -> { ctxState, muted, sampleRate, music:{ current, target, override, wanted, pending, decks:[{mood,id,level,target,playing,from}] }, ambience:[{name,id,target,level,playing}], loops:[{name,vol,playing}], playing (voice count), voices:[names], decoded, loading, decodedIds, decodeErrors:[{id,message}], missingIds, missingNames, stats:{calls,played,cooled,culled,stolen,dropped,unknown,late,maxVoices,maxPerName}, duck:{music,world,lp}, env:{x,z,alt,veil,region,wet,river,mount,town,rain,fire,onBroom,speed}, meter?:{rms,peak} }.
- Mute is read from G.params.mute (any value except '0' or 'false' mutes) and re-checked every frame.
- Tables exported from src/audio/names.js: SFX, resolveTable, STEP (surface → step name), MUSIC (mood → track id), MUSIC_TRIM, MUSIC_LOOP (track → loop start s), MUSIC_LAYERS (track → intensity layer), AMB (bed → loop id).

## Known issues
- Nothing has been heard by ear: headless Chrome runs with --mute-audio. Correctness is checked through debug() and an output-level meter, so the mix balance, the volumes and how the synth fallbacks sound still need a human listen.
- Passing --params "mute=0" to tools/play.mjs does not work, because play.mjs sets mute=1 after reading --params. The tests unmute at runtime with G.params.mute='0' instead; the audio system re-checks the flag every frame.
- Sounds that other systems call on events may play twice. The engine also plays sounds on some events (prop:broken, enemy:killed, item:collected, checkpoint, spell:clash, physics:impact). If gameplay, props or combat (being written now) call a different name for the same moment, both sounds play. The cooldown only stops repeats of the same name.
- The ids for the final boss and the boss music are guesses. The final-boss pattern is /oboroyo|mumy|mumei|final|tsukuyomi/; any other boss id gets bgm_boss. The combat and story ids do not exist yet.
- There is no music track of its own for 霜见岳 or the palace; they use sun or night music by land, and 霜见岳 gets the mountain wind bed.
- The battle heuristic counts any 'enemy:hit', so attacking a harmless 纸魅 (paper wraith) in the sunlit meadow also starts battle music for about 7 s.
- Memory: up to 3 decoded music tracks (about 45 MB each at 48 kHz stereo float) plus 8 ambience loops (about 10 MB each), roughly 220 MB at most. Lower LRU.music in audio.js if that is too much.
- The fire bed samples isBurningAt on a 5×5 grid with 4 m spacing (only when fireCount > 0) and asks G.elements.nearest for a burning object within 14 m. Fires further away are not heard.
- Positional one-shots get their pan and volume once, when they start; they do not follow a moving source. Use loop() with setPos for anything that moves.


## As-built updates (fix-systems, 2026-11)
- Engine event sounds (prop:broken, physics:impact, enemy:killed, item:collected) are deferred one frame and skipped if another positional sound started within 2.5 m and 0.15 s (count: `debug().stats.deduped`). The physics:impact volume uses relSpeed when present. Systems that play their own sound on these events should not also expect the director's.
- `src/audio/names.js` is the list of valid sfx / loop names; always check `G.audio.has(name)` before playing a name that might be missing.

## Original score round (2026-11)
The inherited music set is replaced by an original score written and rendered in `tools/music/` (see its README for
the cue list, the two themes and how to render). Engine changes in `src/audio/`:
- **Moods** (`director.js chooseMood`): ending / title by mode; Fran's spar → `duel` (the recollection bout →
  `final`); a fight with an elite or page guardian within 45 m → `boss`, any other fight → `battle`; City of Magic
  regions (bellcrown, gate, roof, inn, bellkeep, lookout) → `town`; flight; beside a page trial whose page is not yet
  read (within its arena + 40 m) → `pages`; hometown / farewell outskirts by day → `home`; else sun / dusk / night.
  `shrine` is gone (no region produced it). `debug().music` and the director state report `named`, `pageNear` and
  `intensity`.
- **Loop points** (`MUSIC_LOOP`): a file is `intro | body | the body's first bars again`; decks set
  `loopStart`/`loopEnd` so the game loops from the loop start to the end. The remembered playhead of an exploring
  track wraps into the loop region (`wrapHead`).
- **Intensity layers** (`MUSIC_LAYERS`): `bgm_battle`, `bgm_boss`, `bgm_duel` and `bgm_final` have a `_hot` file of
  the same length. A deck decodes both and starts them on the same clock tick and offset (if the layer is missing it
  plays alone). The layer's gain follows the director's intensity, rising over ~2 s and ebbing over ~6 s. Intensity
  is 1 while (and 8 s after) any of these holds, else 0: three or more foes on her, a foe that rallied or reached its
  second phase, her health under 35 %, a boss in phase 2+, Fran in her second movement (story bout) or third
  (recollection). Tests can hold it with `G.audio.setIntensity(x)` (`null` hands it back).
- **Loudness**: every track and layer sum is mastered to −18 LUFS (−1 dBTP ceiling), so `MUSIC_TRIM` is empty.
  `tools/music/probe-volume.js` measures every mood after the master bus in game.
- **Memory**: `LRU.music` is 4 (a fight's track and its layer are two entries). Decoded music is ~0.38 MB per second
  of track, so 100–200 s files are 38–75 MB each.

