# Animation and acting (as built, overhaul 2)

Owner: the animation system. Code: `src/actors/clips.js` (the state table), `src/actors/rig.js` (playback, layers, locomotion
blend, IK, face; the spring-bone / outline / contact-shadow sections belong to the cloth engineer), `src/player/player.js`
(`animate()`, `titleStage()`), `src/player/camera.js` (title shot), `src/spells/spells.js` (`castPlan`), `src/combat/duel.js`
(`castAt`), `src/story/dialogue.js`, `src/story/npcs.js`, `src/story/cutscenes.js`, `src/ui/ceremony.js`.

## 1. Libraries

Every humanoid loads two clip libraries on the shared VRoid skeleton (manifest `clipsFrom: ['anim_ual', 'anim_miko']`):

- `anim_ual` – 84 generic clips (locomotion base, hits, everyday idles).
- `anim_miko` (`assets/models/chars/anim_miko.glb`) – 56 bespoke clips: per-element casts, charge / guard / kinkan, glide with
  banks, broom ride / boost / mount / dismount, ritual (Pray, Bow, Offer, Kneel, Kagura), dialogue acting (Explain A/B, Listen,
  Nod, Shake_Head, Tilt_Head, Surprised, Laugh, Think, Wave, Point, Shy, Huff, Cheer), NPC work loops (Sweep, Drum, Hoe, Pole,
  Hammer, Craft, Fan) and Land_Hard. Timing marks come from `assets/_incoming/anim2/NOTES.md`.

**Rule for whoever edits the manifest:** every humanoid keeps `clipsFrom: ['anim_ual', 'anim_miko']`. A `--replace` patch that
writes `clipsFrom: 'anim_ual'` silently removed every bespoke clip once (15:31 today); `rig.js` now merges any missing shared
library itself and warns once per asset (`[rig] <id>: clipsFrom lacks anim_miko`), but keep the manifest right.

Clip names are unique across both. Root motion is stripped (in-place clips); hips height is rescaled per character
(`hipsHeight / 0.887`, the library's reference) so short and tall characters keep their feet on the ground.

## 2. The state table (`CLIPS` in clips.js)

Callers never name clips, only logical states. Entry fields: `clip`, `blend` (the locomotion blend), `multi` (time-locked
layered parts, e.g. glide bank), `loop`, `speed`, `fade`, `layer` ('full' | 'upper'), `from` / `to` (trim), `v` (natural ground
speed in m/s, measured from the planted toe), `sync` (phase where the left foot is forward), `release` / `impact` / `marks`
(seconds into the clip), `gohei` ('hold' | 'hide' | undefined), `next` (state after a one-shot).

Also exported: `CAST_OF` (element → cast state; quick form = `+ '_q'`), `ACT_TAGS` (valid dialogue `act` tags),
`UPPER_BONE` (the upper-body mask), `clipName(state)`.

**Rule for other systems:** to add a state, add a row here; do not call `mixer.clipAction` yourself. Unknown states make
`play()` return false (no throw), so subset builds stay safe.

## 3. Rig API (`createActor(assetId, opts)` → actor)

| call | what it does |
|---|---|
| `play(state, { fade, speed, layer, restart, from, once, next, onDone })` | cross-fades a state on its layer. Same looping state again is a no-op. |
| `stop(layer='upper', fade, state?)` | fades a layer out (only if `state` is the one playing, when given). |
| `move(v, { back, force })` | ★ locomotion: phase-locked idle/walk/run/sprint blend at ground speed `v`. Does not interrupt a full-body one-shot unless `force`. |
| `gaits` | the four states the blend uses (shades use `shade_walk`, formal walkers `walk_formal`). |
| `legYaw` | radians the legs turn away from the chest (strafing while locked on). |
| `blendW` | weights of the secondary parts of a `multi` state (`{ glide_l, glide_r }`). |
| `reach.R / reach.L` | hand IK: `{ w, target }` or `{ w, fn(handPos, out) }` (the broom handle uses `fn`, closest point on the handle). |
| `goheiMode()` | 'hold' / 'hide' / undefined, from what is playing: the player hides or grips the wand with it. |
| `timeOf(state)` | seconds into the newest entry playing `state` (marks, release sync). |
| `playCharm()` | the three charm throws round-robin. |
| `say(text, cps=34)` | lip-sync: the mouth walks the text at the dialogue box's typing pace, closes on punctuation. `speaking=false` stops it. |
| `setExpression(name, w)` / `clearExpressions()` | face morphs (joy fun angry sorrow surprised + blink, handled by the rig). |
| `lookAt(vec3 | null)` | head + eye look-at with yaw / pitch limits; fades in and out. |
| `exert` | 0..1 breathing depth (sprint, casting raise it). |
| `fidgets` | true: Idle_Fidget_A/B after 8–15 s standing still. |
| `groundFn` | (x,z) → ground y: foot IK + pelvis drop on slopes and stairs. |
| `gaitWeights` | debug: live `{ idle, walk, run, sprint, phase }`. |
| `footLock` | 0..1 (null = use `plant`): stance pinning of the feet during the `move` blend. The player sets 1 on solid ground, 0 in the air / dodging / sliding. |
| `blinkRate` | blink-interval multiplier (mood): > 1 tense / hurt, < 1 calm. The player drives it. |

### Locomotion

The `move` blend owns one phase. Gait weights come from speed anchors built from each clip's measured `v`
(walk 0.83, jog 4.97, sprint 7.55 m/s at hips 0.887): idle → walk (0.55–1.35 × v_walk) → run (from max(0.75 × v_run, 1.4 × v_walk))
→ sprint. The cycle rate is `v / (weighted stride per cycle)`, so blended feet move at ground speed; each clip's time is set
from the shared phase plus its `sync` offset, so walk/run/sprint never fight. Backwards (`back`) runs the phase backwards.
The player adds lean into acceleration / braking and turns, turn-in-place steps, start / stop easing and
`land` / `land_soft` / `land_hard` chosen by fall speed.

### Layers

`upper` states use the `UPPER_BONE` mask (spine and up) over whatever the legs do: casts, guard, charm throws, every dialogue
gesture, fans. Breathing is additive on the animated chest. Head / eye look-at runs last.

### Round 3 (motion): solve order and guards

Per frame after `mixer.update`: `forceRewrite(mixer)` → leg yaw → cast body overlay → fidgets → face → breathing → look-at →
feet (pelvis drop, lift IK, foot lock, sole tilt) → hand IK → eyes / springs.

- **`forceRewrite`**: three's PropertyMixer skips writing a binding whose blended value equals last frame's. Every procedural
  edit after it works in place on the bones, so on an unchanged frame (dt = 0 in hit-stop, time scale 0, a held end pose) the
  edits stacked on last frame's edited pose — that was the leg that flipped up after a sprint stop on a slope (and an arm that
  flew up in hit-stop). Every binding is now written fresh each frame. **Rule:** any new procedural bone edit goes after
  `mixer.update` in `update()` and may assume it starts from the clean clip pose.
- **Leg solve guards** (`legTwoBone`, used by foot IK and the foot lock): the target is never higher than 55 % of the leg below
  the hip, the leg is never folded tighter than 55 % or straighter than 99.9 % of its length, the knee is never above the hip,
  the pole is the animated knee when it is clearly bent forward, else body forward. Checked on the shrine stairs up / down, a
  slope landing and a sprint stop with five hit-stops (`tools/devkit/u3-motion/legs2.js`: knee-above-hip < 0 everywhere).
- **Foot lock** (`_feet`): in `move`, a foot whose ankle is within 4 cm of its own recent lowest point is pinned where it
  touched (world xz); at heel-off the toe becomes the pivot, so the clip's heel–toe roll stays; the foot keeps its animated
  world orientation; a pin that drifts past 0.32 m (turning on the spot, a shove) lets go and re-plants. It absorbs unequal
  half-strides and gait-blend errors at any speed. `?nofootlock=1` turns it off (A/B).
  Toe slide p10 (`tools/devkit/u2-anim/slide.js`, m/s, L/R): walk 0.05/0.09 → 0.05/0.04, brisk 0.21/0.42 → 0.11/0.13,
  run 0.55/0.43 → 0.47/0.46, sprint 2.40/2.76 → 0.35/0.74 (the round-2 figure was 3.67 on the right foot).
- **Cast body overlay** (`_castBody`, table `CAST_BODY` in clips.js, per cast clip: `tw` torso twist, `lean`, `roll`, `drop`
  pelvis dip, `arm` counter-swing of the free arm, `recoil`, `rear` wind-up lean back): additive on hips / spine / chest / left
  arm, driven by the clip's own `release` mark — wind-up eases in over the part of the clip before the release, the snap takes
  0.09 s through the release, the follow-through decays (0.36 s, 0.26 s for quick forms) with a recoil for the big ones, and the
  pelvis dips (`_castDrop`, through the foot solve, so the feet stay planted). It never moves the release, the spawn or any
  gameplay timing. `?nocastbody=1` turns it off (A/B).
- **Acting face** (player.js `actFace`): effort (angry 0.42 + mouth i 0.28) while a cast / charm / charge / summon upper state
  plays; a wince on a hit (sorrow + half blink, the existing 0.7 s hurt expression); a smile on `item:collected` within 8 m and
  on `spell:learned`; `blinkRate` 1.9 when hurt in the last 2 s, up with exertion and effort, 0.75 standing calm. Nothing
  here runs while `G.dialogue.active` — the dialogue system's expressions always win.
- **Broom ride**: `broom.js fitRide()` lays a Y-long broom model (the current `prop_broom`) along +Z with the seat 41 % up from
  the brush; both hands hold the handle (`reach.L` at 0.46–0.70, `reach.R` at 0.16–0.40 of the handle).

### Test cameras (tools/play.mjs)

`T.cam(...)` moves `G.camera` — aim and camera-relative movement read it, so a camera in front of her turns her away.
`T.viewCam(px,py,pz, tx,ty,tz)` / `T.orbitCam(side, dist, h, lookH)` are VIEW-ONLY: the frame is drawn from there, between
frames `G.camera` is the game camera again (boot.js `setCam(..., { view: true })`). Use them for side / front / back strips.

## 4. Magic timing (spells.js `castPlan`, duel.js `castAt`)

- Small forms (tap): `cast_<el>_q` starts 0.12 s before the clip's release mark at 1.25×; the spell spawns ~0.1 s after the
  press, in the hand's release. Instant to the thumb, and every element still has its own gesture.
- Big forms: the 0.9 s charge already played `Charge_Loop` (the anticipation); on release the element's full clip starts
  0.32 s before its release mark, so the follow-through is the element's own.
- Charms: three throw variants round-robin, the card leaves at once.
- Shikigami and kinkan: the full anticipation (rare, big moments).
- Channelled forms (sun beam, moon grab) and guard: no delay. Guard plays `guard`; a blocked / reflected hit plays `guard_hit`.
- Duel rivals use `CAST_OF` too; `castAt` starts the clip so its release mark lands on the projectile spawn.

The wand: `gohei: 'hold'` clips grip it, `'hide'` clips (dialogue, pray, bow, broom) hide it, everything else leaves it as is.

## 5. Dialogue acting (dialogue.js)

Per line: `act` tag → gesture on the speaker (upper layer; full-body tags like bow / cheer / kneel on the full layer);
otherwise the speaker alternates `talk` / `talk_b`. `expr` sets the face; tags without `expr` imply one (laugh → joy, huff →
angry…). The speaker lip-syncs with `say(text)` (heroine and NPCs). The listener plays `listen` and nods now and then.
Everyone looks at whoever is speaking. Camera: a side two-shot for the first line and for narrators / third parties, then an
over-the-shoulder of the listener looking at the speaker; it keeps the side it started on (no 180° jumps) and never goes below
the ground. The wand is hidden while talking.

Tag vocabulary (`ACT_TAGS`): nod shake_head tilt surprised laugh think wave point shy huff cheer bow pray offer kneel
fold_arms listen talk talk_b call_out interact cast_<element> cast_summon kagura dance consume fidget_a fidget_b.
All lines of `story.dlg.main.js` and `story.dlg.side.js` carry `act` / `expr` tags chosen line by line.
Translators edit only `text`.

## 6. NPC life (npcs.js)

`def.work` = the activity while nobody is near: granny sweeps (broom), 鸣 (Naru) drums on a taiko (two bachi, hits on the marks with
sound), 烛 (Shoku) crafts lanterns seated, 磐翁 (Banou) hammers stone (mallet + chisel), 镜 (Kagami) poles, the farmer hoes, the elder and cook fan,
townfolk2 sits and fans. Props are primitives merged per material, lit through `toon()` with surface tags; they scale in and out
(no pop). When the heroine comes within talking range the NPC stops, puts the tools away, turns to her and looks at her; in a
conversation they listen.

## 7. Staging

- Title: the heroine dances `kagura` at the spawn, three-quarters to the title camera (`player.titleStage`, `camera.heroineShot`).
- Learn-a-spell ceremony: `pray`, then the element's cast gesture (no spell leaves).
- Cutscenes: `offer` at the altar, `pray` + `bow` in the ending, other key beats use `bow` / `kneel`.

## 8. Cost

Animation is CPU only (no draw calls added except NPC props: one merged mesh per material per NPC, and one set per worker).
Measured A/B (`tools/devkit/u2-anim/perf.js`: heroine + 7 townsfolk at the town square, summed `actor.update()` ms per frame,
5 rounds x 90 frames, best round, 1440x900 high): before 0.6 ms p25 / 0.7 ms median, after 1.2 ms p25 / 1.6 ms median
(+0.6 / +0.9 ms). The cost is the four-clip phase-locked locomotion blend, the upper layer, look-at and foot IK; it is CPU on
the main thread and scales with visible humanoids.

Foot slide (`tools/devkit/u2-anim/slide.js`: world-space speed of the planted foot, 10th percentile per foot, m/s; same path before /
after): walk 0.44 / 0.39 -> 0.07 / 0.10, brisk 0.65 / 0.65 -> 0.38 / 0.32, run 1.33 / 1.33 -> 0.76 / 0.36,
sprint 1.35 / 2.77 -> 0.36 / 3.67 (the right foot at sprint did not improve).

`lib()` also drops clip tracks for bones a character does not have (anim_miko keys the heroine's J_Sec_ / HairJoint
chains), so other characters raise no PropertyBinding warnings.

## 9. Known shortfalls

- Foot IK is two-bone with sole tilt; it does not plant toes on stair nosings. The foot lock pins in `move` only (not in
  turn-in-place steps or one-shots), and a release at sprint speed can show a 1-frame catch-up of the foot.
- Turn-in-place is a procedural step over idle, not a dedicated clip; sharp 180° turns at a run still pivot without a skid
  plant / dust (not built this round).
- Lip-sync is text-paced vowel cycling, not phoneme-accurate.
- Swimming has one forward clip (no stroke variety, no treading idle) — not built this round.
- NPC work loops do not path: the NPC works at its anchor.
- Casts: the overlay gives every cast a twist / lean / dip / recoil readable from behind, but there is no stepping stance
  (feet stay where the clip puts them) and no gohei arc trail; in big forms the element VFX hide most of the body at the
  release, so the silhouette reads mainly in the wind-up and follow-through. Cast_Moon's circle is still hidden by the body.
- Broom: two-hand grip, but no lean-into-turn beyond the existing bank, no separate hover idle clip; mount / dismount use the
  existing clips (no pop seen in the strips, not measured).
- Idle breaks are the existing fidget pair (Idle_Fidget_A/B every 9–17 s); no look-around / sleeve-tidy variety yet.
- Actor update for the heroine measured ≈ 0.2 ms with and without the foot lock (performance.now is coarsened to 0.1 ms
  headless, so the difference is below what the test can resolve).
