# cloth — costumes, cloth / hair solver, garment shading (as built 2026-11-13, visual overhaul 2)

Owner files: `src/actors/spring.js`, `src/actors/celmat.js`, the character path of `src/core/assets.js` (toonify / celify,
?costume=v1), the spring / outline / contact-shadow sections of `src/actors/rig.js`, 磐翁's (Banou's) model line in `src/story/npcs.js`,
`tools/install-costumes.mjs`, the `char_*` files in `assets/models/chars/` and their manifest entries.
Builds on docs/api/actors-look.md (cel shading, outlines, life) — read that first.

## Costumes (install)
- `node tools/install-costumes.mjs [--dry]` copies every GLB in `assets/_incoming/costume/` to `assets/models/chars/` and patches
  `assets/manifest.json` through `tools/manifest-patch.mjs` (lock + merge). Safe to re-run whenever the costume artist delivers a new
  round; it only copies changed files.
- Ids stay: `char_akari`, `char_granny`, … keep their id; `file` now points at `char_<id>_v2.glb` and the entry gains
  `secondaryChains`, `springDefaults`, `materials`, `meshes`, `bytes`, `costume: 2` and `fileV1` (the old file, still on disk).
  New id `char_banou` (磐翁; `fileV1` = char_granny.glb). No game code needed to change except 磐翁's asset line.
- `?costume=v1` (URL) loads every character from `fileV1` — for A/B shots only. 磐翁 then gets the old runtime dress-up again.

## Solver (`spring.js`)
`createSprings(model, { scale, chains, defaults })` → `{ count, chains, costume, hasFox, kinds(), update(dt, o), reset() }` or `null`.
`o = { wind: Vector3|null (m/s), water: 0..1, lod: 0|1|2, airK?, vel? }`. Called by the rig after animation + IK every frame.

- Chains: costume `J_Sec_<Part>_<n>_<01..03>` (+ `_end` leaf node) from the manifest's `secondaryChains` (kind given there) or found
  by name; kind by part: Sleeve → sleeve; Hakama / Robe / Kimono / Tunic / Happi / Haori / Apron / Trousers / WorkCoat / Skirt →
  skirt; Shawl / Cape → cape; Charm / Bell → charm; Beard → beard; Tail → fox (a living sway on top); anything else (sash tails,
  ribbons, headbands) → tail. Hair: `HairJoint*` chains (VRoid). Rigs without costume chains (`?costume=v1`) drive the old
  `J_Sec_*Skirt* / *Sleeve*` VRoid chains as before. With costume chains present, the old VRoid outfit chains and the limb helpers
  `J_Sec_{L,R}_{UpperArm,LowerArm,UpperLeg,LowerLeg}` are never touched (the body is weighted to them at rest).
- Model: verlet tails in world space at a fixed 1/60 s step (1/30 at lod 1; at most 3 steps per frame), so it looks the same at any
  frame rate. The actor's root translation is carried into the tails (walking never drags cloth through the body); the motion comes
  back as explicit forces: air flow = wind × flutter − body velocity (broom / glide stream the cloth back), inertia = −acceleration
  (stops and jumps overshoot), gravity, a pull toward the rest direction under the simulated parent, damping.
- Angle limit is CUMULATIVE against the fully animated chain (not per joint against the simulated parent), so a three-joint skirt
  can never fold up into a cape in a roll: skirt 34°, sleeve 95°, hair 45°, tail 105°.
- Colliders (capsules, metres at hipsHeight 0.887, scaled by hipsHeight): hips r 0.13 (sleeves see it as r 0.20 so the bags slide
  outside the skirt), thighs r 0.075, shins r 0.055, chest r 0.11, upper arms r 0.045, head, neck. Each kind tests only what it
  needs (skirt: hips + thighs + shins; sleeve: hips + chest + thighs; cape: chest + arms + hips; hair: head + neck + chest + arms).
- Manifest `springDefaults {stiffness, drag, gravity, hit}` map to pull = 0.11·stiffness, damp = 0.2·drag, gravity, hit thickness.
- Water (`o.water`): heavy drag, weight × 0.08, stronger air response (cloth floats and trails). Teleports > 1.5 m snap to the pose;
  `actor.resetSprings()` snaps on demand.
- Round 3 (motion) — skirt kind only unless noted, `?springv1=1` restores the round-2 behaviour for A/B:
  - **Anti-bell**: `airV 0.25` / `inertV 0.3` scale the VERTICAL part of the relative wind and of the inertia (a fall or a jump
    streams the hakama, it does not balloon); `radMax 13°` caps the outward swing away from the hips' vertical axis.
  - **Leg follow** `legF 0.55`: each skirt chain turns with its nearest thigh (55 % of the thigh's swing from rest), so the
    hakama stays on the legs in jumps, runs and sitting. Robe / Kimono chains of the cast are skirt kind and get it too (not re-checked visually this round).
  - **Body spin**: the hips' yaw rate (smoothed) carries part of a fast turn into the tails; above 3 rad/s the pull to rest
    rises (+0.1 at 10 rad/s) and the limits tighten — a 180° pivot or the cast face-turn no longer throws the skirt over the
    back. `speedPull 0.06`: extra pull to rest with body speed (3 → 11 m/s).
  - **Sleeves** `upSoft`: while a sleeve hangs above its rest direction (arms raised in casts) the pull back up is weakened by
    up to 75 %, so the bag slides down the forearm instead of standing out stiffly.
  - Measured (`tools/devkit/u3-motion/cloth.js`, fraction of skirt tips over the back / above the hips): jump back 0.78 → 0.00, up
    0.69 → 0.36; glide up 0.71 → 0.35; 180° pivot back 0.79 → 0.00; cast turn up 0.17 → −0.11; broom back 0.77 → 0.19.
- LOD (set by the rig): heroine always lod 0. Others: lod 0 < 14 m, lod 1 (30 Hz, hair held) to 34 m (high) / 24 m (med), lod 2
  beyond and always on 'low' = STATIC HANG: every chain set to its rest direction leaned 60 % toward straight down (hair 25 %),
  kept out of the hips — nothing sticks out rigidly with the arms. Past 60 m the hang refreshes every third frame.

## Garment shading (`celmat.js`)
- Materials with `extras.garment` (→ `material.userData.garment`) use the GARMENT preset: softer, wider terminator, lighter
  coloured shade (from `extras.shadeColor`) so the painted folds in the texture read, almost no sheen, painterly grain.
- Double-sided cloth: back faces (inside of sleeves / hakama) are shaded as the inside of the cloth — darker, tinted toward the
  shade colour, not lit as if they faced the light (`uCelG.y`).
- Grain (`uCelG.x`): soft vertical brush strokes + fine tooth, fixed in bind space (does not swim), fades with distance; on skin
  very light, on cloth stronger. The shared surface-detail layer (look.md §2) stays off characters.
- Ink outline on single-layer double-sided cloth: hull weight −0.85 (`aOutW < 0`): no depth pull toward the camera, so no ink seen
  through the cloth from inside and no z-fighting at hems; width is constant in pixels to 4 m, eases to 65 % by 20 m, fades out
  between 55 % and 100 % of the outline cut-off (38 / 22 / 10 m by quality).
- Character finish: crown hair highlight band per hairstyle (`hairBand(geo, headC)` from the hair mesh's height; a crisp band of
  strands that stays on the crown), eye glint that keeps the eyes alive, fox-ear twitch in the vertex shader (pivots from the ear
  meshes, `earPivots`), fox tails driven by the solver (v2 tails are cloth chains; the old shader wag only remains for v1 files).
- `mergeByMaterial(root)`: costume files split garments into many primitives (heroine outfit: 25); same material + same skeleton
  are merged into one skinned mesh at load (attribute layouts harmonised), which with the merged outline hull keeps a character to a
  handful of draws.

## Rules for other systems
- Never rename garment materials (`cloth_*`), the `J_Sec_<Part>_<n>_<nn>` chains or `_end` leaves; the solver and shading key on them.
- Animation clips must never key `J_Sec_*` bones.
- After a hard cut (cutscene camera teleports the actor < 1.5 m), call `actor.resetSprings()`.
- Wind for cloth comes from `G.elements.windAt(pos, out)`; spell gusts that write into the wind field move cloth automatically.
- New costume rounds: `node tools/install-costumes.mjs`, nothing else.

## Crowd cost (draws, LOD)
- Solver budget (rig.js): the heroine always full rate; of the others only the 4 nearest (`SPR_FULL`, ranked from the previous
  frame) run at 60 Hz within 14 m, the rest at 30 Hz to the cut-off; the static hang refreshes every 2nd frame (every 4th past
  60 m). `actor._forceLod = 0|1|2` overrides it for perf tests only.
- Wind weight per kind (`wk`): heavy cloth feels the breeze less than its own motion (skirt 0.45, sleeve 0.6, cape 0.7, hair /
  tails 1) — without it the hakama stood 30° out in idle in a normal breeze.
- Shadow proxy (`buildShadowProxy(root)` in celmat.js, called by celify after the outlines): every shadow-casting skinned mesh
  of a character with the same skeleton / bind matrix / world transform is merged into one position + skin-only mesh on layer 5
  (= `PROXY_LAYER` of structures.js, seen only by shadow cameras that enable it). The rig switches each frame: proxy casts when
  `G.lights.sun.shadow.camera` has layer 5, otherwise the real casters do — nothing loses its shadow if that layer goes away.
  Face (morph) meshes stay real casters. Trims (`cloth_trim`), tabi (`cloth_foot`), FaceLines, eyes never cast. `?noproxy=1`
  disables it for A/B.
- Outline: one merged hull per character, constant pixel width to 4 m, 65 % by 20 m, gone past the cut-off (38/22/10 m).

## Measured cost (2026-11-13, 1440×900 'high', headless, tools/devkit/u2-cloth/perf.js; machine shared, load 4–7)
- Solver CPU (`_secondary` timed directly, best-of-3 medians): heroine 0.1–0.2 ms; 9 NPCs at 12–14 m 0.5 ms (was 0.8 before the
  crowd budget); forced full rate for all 9: 0.9–1.3 ms; 30 Hz: 0.4 ms; static hang: 0.6 ms (fixed overhead: matrix update).
- Render, 9 NPCs at 12 m in front of the game camera (p25 of renderFrame + gl.finish, best of 4 A/B rounds, crowd removed from
  the scene for B): v1 7.1 ms / 449 draws; v2 before the proxy 8.2 ms / 50 draws per NPC; v2 now 7.5 ms / 31 draws per NPC.
  The crowd is dominated by draw submission (~20–27 µs per draw here), not by the cloth.

## Known shortfalls
- A character is still ~19 colour draws (one per material) + 2 outline + 2–4 shadow; a texture-atlas merge to 2–3 draws per
  character would be the next real crowd win (needs the costume artist to bake one atlas per character).
- No mesh LOD for characters (~30–40 k triangles each at any distance).
- The static hang (lod 2) still costs ~65 µs per character because the whole skeleton's matrices are refreshed.
- Collision is capsules only: in deep crouches / rolls the hakama can still graze the thighs for a frame; sleeves vs. torso use
  an enlarged hip capsule, not the real torso shape.
- Round-2 costume files: install with `node tools/install-costumes.mjs` when NOTES.md says done, then re-check sleeves (round 2
  bakes an arms-down rest, the sleeve rest direction comes from the bind pose so it should just work).
- The sprint-stop leg flip is fixed (animation.md, forceRewrite).
- Side-saddle on the broom: the back / outer skirt chains hang straight down by gravity, so from the front the hakama reads
  as one flat red panel off her side rather than a drape over the knees (leg follow helps the front chains only).
