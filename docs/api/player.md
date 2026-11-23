# player — as built

## Summary
The player system and the shared actor rig are built, run in headless play.mjs tests, and checked from screenshots in the sunlit west, the dusk and the night. Every run ended with T.errors() empty and 60 fps. One test build (fx, ui, physics, elements, sky, player) drew about 57–67 calls and 0.13–0.16 M triangles.

Files:
- src/actors/clips.js: one table that maps about 70 logical states to library clips. It started from the manifest proposal and I checked it on three 8-actor contact sheets. I changed two picks: glide now uses Jump_Loop at 0.45× (NinjaJump_Idle was a tuck and looked wrong), and a few one-shots are trimmed with from/to.
- src/actors/rig.js: createActor (details in the API section) plus makeActorShadowBlob.
- src/player/player.js: the movement controller, swimming, dodge, light wings, the elements reactor, stats, mana, damage, death and respawn, aim, footsteps, saving, and the hip lantern plus the one warm light that follows her.
- src/player/camera.js: G.cam.
- src/player/broom.js: the broom.
- src/player/wings.js: procedural light wings (a fan of seven feather blades per side, additive, they unfold and flap).
- src/locales/zh-CN/player.js: 4 toast strings.

Measured results:
- Walk 5.5 and sprint 8.5 m/s. Full jump 1.22 m, a tapped hop 0.73–0.78 m, jump plus air jump 2.24 m.
- Dodge is 6 m in 0.36 s with 0.35 s of i-frames. It goes in the input direction, or backwards when there is no input, and works once in the air.
- Coyote time 0.12 s and a 0.15 s jump buffer are implemented but not measured in a test.
- Step-up: walking onto a 0.45 m platform needs no jump. A 0.5 m wooden crate (a physics body) and a 1.0 m platform are both reached.
- Swimming across the river at z=88 works. She enters the water, swims along the y=0 water line, gets wet and climbs the bank. The bank there is 0.88 rad steep, so I raised the slide threshold to 0.93 rad.
- Broom:
  - Speed: cruise 15, boost 26 m/s; diving trades height for speed (up to 1.18 × boost). Boost uses 12 mana/s and widens the view from 60° to about 72°.
  - Vertical: climbs at about 8–9 m/s and stops at 300 m. A platform ceiling stops the climb exactly at the head.
  - Steering and diving: the broom steers toward the camera and banks into turns. Looking down while moving dives at about -6 m/s.
  - Out of mana: it switches to a slow descent until mana recovers to 15. Because mana regenerates in daylight, I could not watch the descent in the sunlit test, so that path is checked in code only.
  - Landing: it dismounts on its own when settling onto ground, or onto water (she drops into swimming). Fast flight over water skims it with spray.
- Light wings: holding jump in the air opens them. Gliding off the shrine hill covered 96 m, and an elements updraft lifted her at +7.4 m/s.
- Elements:
  - The player's own fire did no damage.
  - Water makes her wet and puts out burning.
  - Ice froze her (no movement); she broke free after 9 key presses.
  - Thunder stunned her for 0.45 s.
  - A 25-damage hit knocked her back with the heavy-hit animation.
- Eating a dumpling (X) heals 40.
- After death she falls, and 2.8 s later respawns at the checkpoint (uses G.gameplay.respawnPlayer if that exists), with player:died and player:respawn emitted.
- Camera:
  - The title mode shows the Sun and Moon in frame over the shrine hill. The shrine itself was not in the build, so only the fallback ground shows there.
  - cinematic() resolves when the camera arrives, and release() eases back.
  - Lock-on turns the camera toward the target.
  - Aim reports terrain hits correctly.

Art notes:
- My first personal light was 26 cd and only 0.5 m from her, which blew her out under the night exposure. It is now 6 cd on foot, placed 2.9 m up behind her, and 1.5–8 cd on the broom. At night she and the broom read clearly.
- The wings and the broom trail are dimmed at night.
- I found an fx bug: fx.trail with style 'glow' turned the WHOLE SCREEN BLACK under the post chain. The likely cause is a NaN from pow(1-x) or a reversed smoothstep in the ribbons.js fragment shader, spread by bloom. The broom therefore uses style 'band'.

## Public API
== src/actors/rig.js ==
createActor(assetId, opts?) -> Actor
  opts: { castShadow=true, receiveShadow=true, state='idle', footGround?(x,z)->y, lookLimits?{yaw=1.15, pitch=0.55} }
  If the model is missing, a primitive placeholder is used and nothing crashes.
  Library clips are cached per asset id. When hipsHeight differs from 0.887, the clips are cloned and the hips position track is scaled by hipsHeight/0.887. The upper-body and legs-only parts of each clip are also cached.

Actor fields:
  group, model, mixer, info, current (full-layer state), upperState
  bones { head, neck, chest, upperChest, spine, hips, handR, handL, footR, footL, thighR, thighL, kneeR, kneeL }
  busy (a full-body one-shot is playing), progress (0..1), paused, timeScale, plant (0..1, foot-plant weight), footGround, blinkEnabled, expressions

Actor methods:
  has(state)
  play(state, { fade, loop, speed, once, onDone(actor,state) (return true = handled), next, layer:'full'|'upper', restart }) -> bool
    - Playing the same looping state again does nothing.
    - When a one-shot ends: next, or onDone, or the full layer goes back to the last looping state; the upper layer fades out.
  stop(layer='upper', fade=0.2, state?)
  setSpeed(k): playback-rate multiplier.
  setGroundSpeed(mps): speed multiplier from clips.js v.
  setExpression(name, weight=1, speed=8), clearExpressions()
    - Morph names: blink, blink_l, blink_r, joy, fun, angry, sorrow, surprised, a, i, u, e, o.
    - Blinking is automatic every 1.8–5.4 s, with occasional double blinks.
  lookAt(worldPos | null): head 60 %, neck 40 %, clamped, eased.
  attach(obj, boneKey, { pos:[x,y,z], rot:[x,y,z], scale }), detach(obj)
  setTint({ color, emissive, emissiveIntensity, dark } | null)
    - With dark: true the body goes near-black (default 0x140c26) and the eyes glow (glow(emissive ?? 0xff3b6b, 3.2)).
    - null restores the original look.
  update(dt): the owner calls it every frame. It applies weights, steps the mixer, ends one-shots, then face, head look, and foot planting (pelvis drop down to 0.32 m plus two-bone leg IK, up to 0.36 m of lift).
  dispose()

Layering: the upper layer (spine and up) overlays the full layer. While the upper layer has weight U, each full-layer clip runs as itself at weight w·(1−U) plus a legs-only twin at w·U.

makeActorShadowBlob(radius=0.45, opacity=0.42) -> Mesh. Add it to the scene and call mesh.userData.place(x, groundY, z, heightAboveGround) each frame.

== src/actors/clips.js ==
CLIPS { state: { clip, loop, speed?, fade?, layer?, from?, to?, v? } }
States:
  - movement: idle walk walk_formal run sprint crouch crouch_walk push carry slide
  - air: jump air_jump fall glide tuck land land_soft climb
  - water / sitting: swim swim_idle sit_broom sit sit_enter sit_exit sit_talk
  - combat: dodge cast_throw cast_lob cast_raise cast_channel cast_end cast_summon guard guard_enter guard_break hit hit_head hit_heavy death revive punch punch_cross melee sword sword_idle
  - everyday: interact pickup open consume cheer dance talk phone fold_arms shake_head lantern torch call_out lean kneel_work harvest water_plants chop
  - shades: shade_idle shade_walk shade_claw
UPPER_BONE (RegExp), clipName(state)

G.actors = { createActor, makeActorShadowBlob, CLIPS } is set in player init, for tests and for other systems. Importing the modules directly is preferred.

== G.player (§6.8, all ★ entries kept) ==
Fields:
  group, pos (= group.position, the feet), vel, yaw (facing = (sin yaw, cos yaw)), hp, maxHp, mana, maxMana, dead
  state: 'ground' | 'air' | 'glide' | 'broom' | 'swim'. 'cutscene' is not used: when control is off she stays in her physical state and the input is zero.
  grounded, onBroom, gliding, speed (horizontal m/s), sprinting, boosting, aiming, guarding (front damage ×0.2)
  radius 0.4, height 1.6, team 'player', reactor (elements: flesh, living), physChar (physics capsule), rig (Actor), gohei, broom, control
  aim { origin, dir, point, dist, target (enemy or body owner), body, surface: 'terrain'|'static'|'body'|'actor'|'' }
    - Updated in lateUpdate.
    - The ray starts level with the player.
    - Enemy hit spheres get 0.35 m of aim assist.

★ takeDamage(amount, { element?, from? (Vector3 or object with pos), knock? (m/s number or Vector3), source?, dot? }) -> damage taken
  - Respects i-frames and invulnerability, except for dot.
  - 22 or more damage, or knock of 6 or more, plays the heavy knockback (Hit_Knockback) and locks control for 0.55 s.
  - Shows floating damage text, shakes the screen and emits player:damaged.
★ heal(n) -> amount healed (emits player:healed)
★ spendMana(n) -> bool
★ addMana(n)
★ teleport(x, y?, z): y defaults to the ground. Picks the state (swim / ground / air) and snaps the camera.
★ setControl(on)
★ playAction(name, { lock, face (Vector3), faceAim, speed, loop, once, onDone, layer, fade, restart }) -> bool
  - name is any CLIPS state; casts default to the upper layer and turn her toward the aim for 0.55 s.
  - 'guard' sets guarding = true; 'guard_end' clears it; 'death' kills her.
  - On the broom, in water or in the air, full-body actions run on the upper layer.
★ recalcStats(): maxHp = 100+20·upgrades.hp, maxMana = 100+20·upgrades.mana.
★ invulnerable(sec)

Extras: stopAction(name), toggleBroom(), mountBroom(), dismountBroom(), revive(x?, y?, z?) (emits player:respawn), respawn() (G.gameplay?.respawnPlayer, else the stored checkpoint).

Rules:
  - Mana regenerates at 6/s × G.env.light, plus 10/s × lamp, where lamp = clamp((elements.lightAt(chest) − env.light) × 1.8). No regen while boosting the broom.
  - Broom and wings need G.state.abilities.broom / .wings. They are also allowed with ?autostart, ?broom=1 or ?wings=1.
  - X (heal) eats a dumpling: −1 dango, +40 HP, toast messages for 'none left' and 'already full'.
  - Fall damage is (speed−24)×3, not applied when landing from a glide.
  - Leaving the world (y < −60, |x| or |z| > 2600, or a NaN position) returns her to the last safe spot with 8 damage.

Events emitted:
  player:jump {air, water?}, player:land {speed}, player:step {surface: grass|path|sand|stone|snow|wood|water|<body material>, speed}
  player:dodge {dir, air}, player:mount, player:dismount {reason}, player:glide {on}
  player:damaged {amount, element, from}, player:died {element, from}, player:respawn, player:healed {amount}
'save:collect' writes state.player {x, y, z, yaw, hp, mana} (on the broom, y is the ground below). start() restores from it.

Exports: MOVE (tuning constants) from player.js; BROOM { CRUISE 15, BOOST 26, CLIMB 9, BOOST_MANA 12, MAX_Y 300, SEAT 0.46, CLEAR 0.42 } from broom.js.

== G.cam ==
Fields: yaw, pitch, dist, targetDist, forward (Vector3), shoulder (0..1), cinematicActive
★ cinematic({ pos, look, dur=1.2, ease: 'inOut'|'linear'|'out'|'in'|fn }) -> Promise (resolves on arrival; the shot holds until release)
★ release(): eases back to the orbit over 0.7 s.
fovKick(k): adds about k·10°, decaying.
snap(), setBehind(playerYaw), update(dt, rdt) (called by the core).

Behaviour:
  - Orbit pivot: 1.42 m above the feet on foot, 1.25 m on the broom, 0.55 m when swimming.
  - Distance: 5.2 m on foot, 3.4 m with the shoulder offset while aiming (cast/attack held), 6.6 m gliding, 5.9 m + speed on the broom, +1.4 m when locked on. It comes in closer when looking up from low.
  - Collision: G.world.raycastGround plus G.physics.raycast. Light bodies (mass < 6) are ignored. Moves in fast, out slowly. Never below the ground or water surface + 0.35.
  - On the broom or gliding, when the mouse is idle, the camera eases back behind her.
  - Lock-on framing comes from G.combat.lockTarget.pos.
  - G.fx.shakeOffset is added each frame.
  - Mouse: sensitivity 0.0024 × G.settings.sens; invertY is respected; works with pointer lock and with drag-look.
  - Title mode (G.mode === 'title' or not started): a slow orbit 74 m from the shrine, on the side away from the Sun, aimed between the hill and the Sun.

## Known issues
- The angle of the gohei in her hand is only roughly fitted (rot [PI/2, 0, -0.25] on handR). It reads well while walking and at night, but in the idle pose the stick crosses in front of the skirt a little.
- The library has no glide clip. Gliding uses Jump_Loop at 0.45× with a forward pitch, so the legs still kick slightly.
- The broom trail uses fx style 'band', because style 'glow' turns the whole screen black under the post chain (fx bug, see core requests).
- The broom's out-of-mana slow descent could not be watched in daylight: mana regenerates at 6/s there, so it recovers within moments. The logic was checked in code only.
- No HP regeneration is implemented (§3.4 does not ask for any). The heal key (X) eats a dumpling inside the player system. If gameplay or ui also handles X, they need to agree on one owner.
- Self-immunity to the player's own spells is a workaround. On 'element:applied' with team 'player', that element is added to reactor.immune until her next update, so an enemy attack of the same element landing in the same frame would also be ignored.
- Dynamic point lights: fx keeps 4 and elements keeps 4, and the player adds 1 (always present; intensity 0 in daylight). That is over the §8 limit of 6 lights. It is not caused by this system alone, but it adds one.
- Foot IK only lifts the higher foot (two-bone IK) and lowers the pelvis. Feet keep the animated foot angle, with no tilt to match the slope. There are no cloth or hair bones.
- Footsteps are timed by distance travelled, not by the animation's foot contacts.
- Not tested with the real terrain, structures, props, spells or combat systems (they are not in the subset build). Lock-on and aim targets were tested with a fake G.combat object. The title shot was judged on the fallback ground without the shrine.
- Slope sliding starts at 0.93 rad. Terrain steeper than that cannot be walked up, and cliffs (a rise of more than 2.2 × the horizontal step) block movement.


## As-built updates (fix-systems + fix2, 2026-11)
- Event `'player:bounce' { pad, speed }` when a giant mushroom cap launches her (0.9×power, 1.18× with jump held / pressed within 0.18 s); she calls `G.flora.squashPad(pad.id, k)`.
- `G.player.damageFloor` (number | null): while set, hp never drops below it; `G.player.onDamageFloor(amount, opts)` is called when a hit reaches it. Duels use this instead of wrapping takeDamage.
- fix2 burning: her own ground fire (she cast fire within 16 m in the last 14 s) burns at 2 hp/s instead of 4 (enemy fire was 5), shows a light hurt vignette, and toasts `player.ownFire` once per save (flag `fix2OwnFireTip`). A burning heroine no longer spreads fire to the grass under her.
- fix2 mana regen: max(1.6, 6·daylight) + 10·lantern-light per second (day 6/s, night 1.6/s, more near lit lanterns).
