// Logical animation states -> clips of the two shared libraries on the VRoid skeleton: anim_ual (84 generic clips) and
// anim_miko (56 bespoke clips: per-element casts, traversal, ritual, dialogue acting, NPC work). Every character loads
// both (manifest clipsFrom: ['anim_ual','anim_miko']); clip names are unique across them. ONE table for the heroine,
// NPCs, duelists and humanoid shades. As-built notes: docs/api/animation.md.
//
// Entry fields
//   clip    library clip name                       blend  true = the locomotion blend (no clip; rig.move())
//           'Name@tag' = the same clip as a separate action (a state that cross-fades from another one playing Name)
//   multi   [state, ...] time-locked layered blend; the first part fills what rig.blendW[state] leaves
//   loop    true = repeat, false = play once and hold / return (the rig decides with `once`)
//   speed   default playback rate                   fade   default cross-fade in seconds
//   layer   'full' (default) | 'upper' (spine-and-up only, legs keep the locomotion underneath)
//   from/to optional start / end time in seconds (trim a one-shot)
//   v       natural ground speed in m/s for hipsHeight 0.887, MEASURED from the planted toe of the in-place clip
//           (.tmp/u2-anim/measure.js); the rig scales it by hipsHeight/0.887 per character
//   sync    phase (0..1) where the left foot is furthest forward: the locomotion blend aligns its clips on it
//   release / impact / marks   seconds into the clip (spells spawn at `release`)
//   gohei   'hold' (grip the wand: GOHEI_MOVE attach) | 'hide' (both hands open: hide the wand) | undefined (free)
export const CLIPS = {
  // locomotion (gaits of the 'move' blend)
  idle:         { clip: 'Idle_Loop', loop: true, fade: 0.25 },
  move:         { blend: true, loop: true, fade: 0.22 },
  walk:         { clip: 'Walk_Loop', loop: true, fade: 0.22, v: 0.83, sync: 0 },
  walk_formal:  { clip: 'Walk_Formal_Loop', loop: true, fade: 0.25, v: 0.84, sync: 0 },
  run:          { clip: 'Jog_Fwd_Loop', loop: true, fade: 0.2, v: 4.97, sync: 0 },
  sprint:       { clip: 'Sprint_Loop', loop: true, fade: 0.2, v: 7.55, sync: 0.85 },
  crouch:       { clip: 'Crouch_Idle_Loop', loop: true, fade: 0.25 },
  crouch_walk:  { clip: 'Crouch_Fwd_Loop', loop: true, fade: 0.25, v: 0.65, sync: 0.133 },
  push:         { clip: 'Push_Loop', loop: true, fade: 0.25 },
  carry:        { clip: 'Walk_Carry_Loop', loop: true, fade: 0.25, v: 0.56, sync: 0 },
  slide:        { clip: 'Slide_Loop', loop: true, fade: 0.2 },
  fidget_a:     { clip: 'Idle_Fidget_A', loop: false, fade: 0.4, layer: 'upper', gohei: 'hide' },
  fidget_b:     { clip: 'Idle_Fidget_B', loop: false, fade: 0.45, gohei: 'hide' },
  // air
  jump:         { clip: 'Jump_Start', loop: false, fade: 0.08, speed: 1.6, from: 0.22 },
  // the second leap pushes off the air like the first one (NinjaJump_Start sat her in a wide frog squat, hem up)
  air_jump:     { clip: 'Jump_Start@air', loop: false, fade: 0.1, speed: 1.5, from: 0.2 },
  fall:         { clip: 'Jump_Loop', loop: true, fade: 0.3 },
  glide:        { multi: ['glide_c', 'glide_l', 'glide_r'], loop: true, fade: 0.35 },   // bank weights: rig.blendW
  glide_c:      { clip: 'Glide_Loop', loop: true, fade: 0.35 },
  glide_l:      { clip: 'Glide_Bank_L', loop: true, fade: 0.35 },
  glide_r:      { clip: 'Glide_Bank_R', loop: true, fade: 0.35 },
  tuck:         { clip: 'NinjaJump_Idle_Loop', loop: true, fade: 0.3 },
  // a longer drop: she meets the ground already bent and rises (the clip's first 0.3 s is a full squat)
  land:         { clip: 'Jump_Land', loop: false, fade: 0.08, speed: 1.5, from: 0.3, to: 0.75 },
  // an ordinary hop: only the last knee dip of the landing (its start is a full squat, sized for a long drop)
  land_soft:    { clip: 'NinjaJump_Land', loop: false, fade: 0.1, speed: 1.25, from: 0.5, to: 0.85 },
  land_hard:    { clip: 'Land_Hard', loop: false, fade: 0.05, impact: 0.05, recover: 0.6, gohei: 'hold' },
  climb:        { clip: 'ClimbUp_1m', loop: false, fade: 0.1 },
  // on a wall: a held airborne pose; hands and feet are put on the face by IK (player/climb.js poseClimb)
  climb_hold:   { clip: 'Jump_Loop', loop: true, fade: 0.18, speed: 0.15 },
  // water / broom / sitting
  swim:         { clip: 'Swim_Fwd_Loop', loop: true, fade: 0.3, v: 2.4 },
  swim_idle:    { clip: 'Swim_Idle_Loop', loop: true, fade: 0.35 },
  sit_broom:    { clip: 'Broom_Ride_Loop', loop: true, fade: 0.25, gohei: 'hide' },
  broom_boost:  { clip: 'Broom_Boost_Loop', loop: true, fade: 0.25, gohei: 'hide' },
  broom_mount:  { clip: 'Broom_Mount', loop: false, fade: 0.08, speed: 1.15, seated: 0.6, next: 'sit_broom', gohei: 'hide' },
  broom_dismount: { clip: 'Broom_Dismount', loop: false, fade: 0.08, speed: 1.2, feetDown: 0.42 },
  broom_summon: { clip: 'Summon_Broom', loop: false, fade: 0.08, layer: 'upper', speed: 1.5, from: 0.3, release: 0.72, catch: 0.92, gohei: 'hold' },
  sit:          { clip: 'Sitting_Idle_Loop', loop: true, fade: 0.3 },
  sit_enter:    { clip: 'Sitting_Enter', loop: false, fade: 0.2 },
  sit_exit:     { clip: 'Sitting_Exit', loop: false, fade: 0.2 },
  sit_talk:     { clip: 'Sitting_Talking_Loop', loop: true, fade: 0.3 },
  sit_ground:   { clip: 'Sit_Ground_Loop', loop: true, fade: 0.4 },
  // combat / magic. Per-element casts: `cast_<el>` is the full gesture (big forms: the spell leaves at `release`),
  // `cast_<el>_q` starts 0.12 s before the release at 1.25x (small forms: the spell leaves ~0.1 s after the input).
  dodge:        { clip: 'Roll', loop: false, fade: 0.05, speed: 1.75, to: 1.2 },
  cast_fire:    { clip: 'Cast_Fire', loop: false, fade: 0.06, layer: 'upper', speed: 1.1, release: 0.33, gohei: 'hold' },
  cast_water:   { clip: 'Cast_Water', loop: false, fade: 0.06, layer: 'upper', speed: 1.1, release: 0.5, gohei: 'hold' },
  cast_ice:     { clip: 'Cast_Ice', loop: false, fade: 0.06, layer: 'upper', speed: 1.1, release: 0.27, gohei: 'hold' },
  cast_wind:    { clip: 'Cast_Wind', loop: false, fade: 0.06, layer: 'upper', speed: 1.1, release: 0.45, gohei: 'hold' },
  cast_thunder: { clip: 'Cast_Thunder', loop: false, fade: 0.06, layer: 'upper', speed: 1.15, release: 0.66, gohei: 'hold' },
  cast_earth:   { clip: 'Cast_Earth', loop: false, fade: 0.06, layer: 'upper', speed: 1.15, release: 0.74, gohei: 'hold' },
  cast_sun:     { clip: 'Cast_Sun', loop: false, fade: 0.06, layer: 'upper', speed: 1.15, release: 0.72, gohei: 'hold' },
  cast_moon:    { clip: 'Cast_Moon', loop: false, fade: 0.06, layer: 'upper', speed: 1.2, release: 0.86, gohei: 'hold' },
  cast_fire_q:    { clip: 'Cast_Fire', loop: false, fade: 0.05, layer: 'upper', speed: 1.25, from: 0.21, release: 0.33, gohei: 'hold' },
  cast_water_q:   { clip: 'Cast_Water', loop: false, fade: 0.05, layer: 'upper', speed: 1.25, from: 0.38, release: 0.5, gohei: 'hold' },
  cast_ice_q:     { clip: 'Cast_Ice', loop: false, fade: 0.05, layer: 'upper', speed: 1.25, from: 0.15, release: 0.27, gohei: 'hold' },
  cast_wind_q:    { clip: 'Cast_Wind', loop: false, fade: 0.05, layer: 'upper', speed: 1.25, from: 0.33, release: 0.45, gohei: 'hold' },
  cast_thunder_q: { clip: 'Cast_Thunder', loop: false, fade: 0.05, layer: 'upper', speed: 1.25, from: 0.54, release: 0.66, gohei: 'hold' },
  cast_earth_q:   { clip: 'Cast_Earth', loop: false, fade: 0.05, layer: 'upper', speed: 1.25, from: 0.62, release: 0.74, gohei: 'hold' },
  cast_sun_q:     { clip: 'Cast_Sun', loop: false, fade: 0.05, layer: 'upper', speed: 1.25, from: 0.6, release: 0.72, gohei: 'hold' },
  cast_moon_q:    { clip: 'Cast_Moon', loop: false, fade: 0.05, layer: 'upper', speed: 1.25, from: 0.74, release: 0.86, gohei: 'hold' },
  // charm cards: three variants round-robin (rig.playCharm), the card leaves at 0.15 s
  charm_a:      { clip: 'Charm_Throw', loop: false, fade: 0.05, layer: 'upper', from: 0.1, release: 0.15 },
  charm_b:      { clip: 'Charm_Throw_B', loop: false, fade: 0.05, layer: 'upper', from: 0.1, release: 0.15 },
  charm_c:      { clip: 'Charm_Throw_C', loop: false, fade: 0.05, layer: 'upper', from: 0.1, release: 0.15 },
  cast_throw:   { clip: 'Charm_Throw', loop: false, fade: 0.05, layer: 'upper', from: 0.1, release: 0.15 },
  cast_lob:     { clip: 'Cast_Fire', loop: false, fade: 0.06, layer: 'upper', speed: 1.1, release: 0.33, gohei: 'hold' },
  cast_raise:   { clip: 'Cast_Thunder', loop: false, fade: 0.08, layer: 'upper', to: 0.6, gohei: 'hold' },
  cast_channel: { clip: 'Charge_Loop', loop: true, fade: 0.12, layer: 'upper', gohei: 'hold' },
  cast_end:     { clip: 'Charge_Release', loop: false, fade: 0.06, layer: 'upper', release: 0.24, gohei: 'hold' },
  cast_summon:  { clip: 'Summon_Shikigami', loop: false, fade: 0.1, layer: 'upper', speed: 1.1, release: 0.56 },
  kinkan:       { clip: 'Kinkan_Loop', loop: true, fade: 0.2, gohei: 'hold' },
  kinkan_release: { clip: 'Kinkan_Release', loop: false, fade: 0.1, layer: 'upper', speed: 1.2, release: 0.62, gohei: 'hold' },
  guard:        { clip: 'Guard_Loop', loop: true, fade: 0.08, layer: 'upper', gohei: 'hold' },
  guard_enter:  { clip: 'Shield_OneShot', loop: false, fade: 0.05, layer: 'upper', speed: 1.4 },
  guard_hit:    { clip: 'Guard_Hit', loop: false, fade: 0.04, layer: 'upper', impact: 0.06, next: 'guard', gohei: 'hold' },
  guard_break:  { clip: 'Guard_Hit', loop: false, fade: 0.04, layer: 'upper', speed: 0.8, gohei: 'hold' },
  hit:          { clip: 'Hit_Chest', loop: false, fade: 0.05, layer: 'upper' },
  hit_head:     { clip: 'Hit_Head', loop: false, fade: 0.05, layer: 'upper' },
  hit_heavy:    { clip: 'Hit_Knockback', loop: false, fade: 0.05 },
  death:        { clip: 'Death01', loop: false, fade: 0.12 },
  revive:       { clip: 'LayToIdle', loop: false, fade: 0.1 },
  punch:        { clip: 'Punch_Jab', loop: false, fade: 0.08, layer: 'upper' },
  punch_cross:  { clip: 'Punch_Cross', loop: false, fade: 0.08, layer: 'upper' },
  melee:        { clip: 'Melee_Hook', loop: false, fade: 0.06 },
  sword:        { clip: 'Sword_Attack', loop: false, fade: 0.08 },
  sword_idle:   { clip: 'Sword_Idle', loop: true, fade: 0.2 },
  // ritual / story (full body)
  bow:          { clip: 'Bow', loop: false, fade: 0.3, gohei: 'hide' },
  pray:         { clip: 'Pray', loop: false, fade: 0.3, gohei: 'hide' },
  kagura:       { clip: 'Kagura_Loop', loop: true, fade: 0.5, gohei: 'hold' },
  offer:        { clip: 'Offer', loop: false, fade: 0.25, layer: 'upper', gohei: 'hide' },
  kneel:        { clip: 'Kneel_Loop', loop: true, fade: 0.4, gohei: 'hold' },
  // everyday / dialogue acting (upper layer over whatever the legs do)
  interact:     { clip: 'Interact', loop: false, fade: 0.15, layer: 'upper', speed: 1.3 },
  pickup:       { clip: 'PickUp_Table', loop: false, fade: 0.1, layer: 'upper' },
  open:         { clip: 'Chest_Open', loop: false, fade: 0.15 },
  consume:      { clip: 'Consume', loop: false, fade: 0.12, layer: 'upper', speed: 1.3 },
  talk:         { clip: 'Explain_A', loop: false, fade: 0.25, layer: 'upper', gohei: 'hide' },
  talk_b:       { clip: 'Explain_B', loop: false, fade: 0.25, layer: 'upper', gohei: 'hide' },
  listen:       { clip: 'Listen_Loop', loop: true, fade: 0.4, gohei: 'hide' },
  nod:          { clip: 'Nod', loop: false, fade: 0.15, layer: 'upper', gohei: 'hide' },
  shake_head:   { clip: 'Shake_Head', loop: false, fade: 0.18, layer: 'upper', gohei: 'hide' },
  tilt:         { clip: 'Tilt_Head', loop: false, fade: 0.2, layer: 'upper', gohei: 'hide' },
  surprised:    { clip: 'Surprised', loop: false, fade: 0.08, layer: 'upper', gohei: 'hide' },
  laugh:        { clip: 'Laugh', loop: false, fade: 0.2, layer: 'upper', gohei: 'hide' },
  think:        { clip: 'Think', loop: false, fade: 0.25, layer: 'upper', gohei: 'hide' },
  wave:         { clip: 'Wave', loop: false, fade: 0.2, layer: 'upper', gohei: 'hide' },
  point:        { clip: 'Point', loop: false, fade: 0.15, layer: 'upper', gohei: 'hide' },
  shy:          { clip: 'Shy', loop: false, fade: 0.25, layer: 'upper', gohei: 'hide' },
  huff:         { clip: 'Huff', loop: false, fade: 0.2, layer: 'upper', gohei: 'hide' },
  cheer:        { clip: 'Cheer', loop: false, fade: 0.15, gohei: 'hide' },
  dance:        { clip: 'Dance_Loop', loop: true, fade: 0.25 },
  phone:        { clip: 'Idle_TalkingPhone_Loop', loop: true, fade: 0.3 },
  fold_arms:    { clip: 'Idle_FoldArms_Loop', loop: true, fade: 0.3 },
  lantern:      { clip: 'Idle_Lantern_Loop', loop: true, fade: 0.3 },
  torch:        { clip: 'Idle_Torch_Loop', loop: true, fade: 0.3 },
  call_out:     { clip: 'Idle_Rail_Call', loop: false, fade: 0.25 },
  lean:         { clip: 'Idle_Rail_Loop', loop: true, fade: 0.3 },
  kneel_work:   { clip: 'Fixing_Kneeling', loop: true, fade: 0.3 },
  harvest:      { clip: 'Farm_Harvest', loop: true, fade: 0.3 },
  water_plants: { clip: 'Farm_Watering', loop: true, fade: 0.3 },
  chop:         { clip: 'TreeChopping_Loop', loop: true, fade: 0.25 },
  // NPC work loops (full body; props in src/story/npcs.js)
  sweep:        { clip: 'Sweep_Loop', loop: true, fade: 0.4, marks: [0.75, 1.95] },
  drum:         { clip: 'Drum_Loop', loop: true, fade: 0.3, marks: [0, 0.4, 0.8, 1.4] },
  hoe:          { clip: 'Hoe_Loop', loop: true, fade: 0.4, marks: [0.85] },
  pole:         { clip: 'Pole_Loop', loop: true, fade: 0.4, marks: [0.3] },
  hammer:       { clip: 'Hammer_Loop', loop: true, fade: 0.3, marks: [0.55, 1.15] },
  craft:        { clip: 'Craft_Loop', loop: true, fade: 0.5 },
  fan:          { clip: 'Fan_Loop', loop: true, fade: 0.3, layer: 'upper' },
  // shades (humanoid 影巫 and friends)
  shade_idle:   { clip: 'Zombie_Idle_Loop', loop: true, fade: 0.3 },
  shade_walk:   { clip: 'Zombie_Walk_Fwd_Loop', loop: true, fade: 0.3, v: 0.84, sync: 0 },
  shade_claw:   { clip: 'Zombie_Scratch', loop: false, fade: 0.1 },
};

/**
 * Full-body cast overlay (rig._castBody, additive on top of the upper-layer cast clip, keyed by library clip): so a cast reads
 * from behind. Timing comes from the entry's `release` (nothing about the spell's timing changes): wind-up before it, a
 * snap through it, follow-through after. tw = chest twist (rad, + = right shoulder forward on the strike), lean = forward
 * pitch on the strike (− = rears back), roll = side bend, drop = stance dip (m, knees bend through the foot IK), arm = the
 * free (left) arm swinging out for balance (rad), recoil = backward lean after a big cast. Quick forms (_q) use 75 %.
 */
export const CAST_BODY = {
  Cast_Fire:        { tw: 0.5, lean: 0.16, roll: 0.06, drop: 0.06, arm: 0.55, recoil: 0.08 },
  Cast_Water:       { tw: 0.34, lean: 0.1, roll: -0.1, drop: 0.07, arm: 0.6, recoil: 0.05 },
  Cast_Ice:         { tw: 0.55, lean: 0.14, roll: 0.05, drop: 0.05, arm: 0.5, recoil: 0.06 },
  Cast_Wind:        { tw: 0.7, lean: 0.08, roll: -0.06, drop: 0.05, arm: 0.75, recoil: 0.05 },
  Cast_Thunder:     { tw: 0.3, lean: 0.2, roll: 0.04, drop: 0.09, arm: 0.45, recoil: 0.1, rear: 0.14 },
  Cast_Earth:       { tw: 0.22, lean: 0.28, roll: 0, drop: 0.12, arm: 0.5, recoil: 0.1, rear: 0.1 },
  Cast_Sun:         { tw: 0.32, lean: 0.12, roll: 0.05, drop: 0.06, arm: 0.65, recoil: 0.08, rear: 0.12 },
  Cast_Moon:        { tw: 0.4, lean: 0.12, roll: -0.05, drop: 0.06, arm: 0.6, recoil: 0.06 },
  Charm_Throw:      { tw: 0.42, lean: 0.12, roll: 0.05, drop: 0.03, arm: 0.45, recoil: 0 },
  Charm_Throw_B:    { tw: -0.36, lean: 0.1, roll: -0.05, drop: 0.03, arm: 0.4, recoil: 0 },
  Charm_Throw_C:    { tw: 0.3, lean: 0.14, roll: 0.07, drop: 0.03, arm: 0.4, recoil: 0 },
  Charge_Release:   { tw: 0.28, lean: 0.18, roll: 0, drop: 0.08, arm: 0.6, recoil: 0.1 },
  Kinkan_Release:   { tw: 0.3, lean: 0.2, roll: 0, drop: 0.1, arm: 0.7, recoil: 0.12, rear: 0.1 },
  Summon_Shikigami: { tw: 0.3, lean: 0.12, roll: 0.05, drop: 0.05, arm: 0.6, recoil: 0.05 },
};

/** Element -> its cast state (full gesture). Small / quick form: + '_q'. */
export const CAST_OF = { fire: 'cast_fire', water: 'cast_water', ice: 'cast_ice', wind: 'cast_wind', thunder: 'cast_thunder', earth: 'cast_earth', sun: 'cast_sun', moon: 'cast_moon' };

/** Dialogue / cutscene acting tags (story.dlg `act`) -> states. Unknown tags are ignored. */
export const ACT_TAGS = ['nod', 'shake_head', 'tilt', 'surprised', 'laugh', 'think', 'wave', 'point', 'shy', 'huff', 'cheer', 'bow', 'pray', 'offer', 'kneel', 'fold_arms', 'listen', 'talk', 'talk_b',
  'cast_fire', 'cast_water', 'cast_ice', 'cast_wind', 'cast_thunder', 'cast_earth', 'cast_sun', 'cast_moon', 'cast_summon', 'kagura', 'dance', 'consume', 'call_out', 'fidget_a', 'fidget_b'];

/** Bone-name test for the upper-body layer (spine and everything above it, arms, fingers, hair). */
export const UPPER_BONE = /Spine|Chest|Neck|Head|Shoulder|Arm|Hand|Thumb|Index|Middle|Ring|Little|Hair|Bust|Eye/;

/** Library clip name for a state ('' if unknown). */
export const clipName = (state) => (CLIPS[state] ? CLIPS[state].clip || '' : '');
