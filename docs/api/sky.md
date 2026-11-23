# sky — as built

## Summary
The sky system is built and checked in headless runs; every run finished with T.errors() empty. The previous attempt had left only notes on disk, so all the code here is new.

What exists:
- **Sky dome, drawn in two passes for speed.** A half-resolution pass renders the colour gradient, clouds, the veil curtains (帷幕), corona, glare and the milky band. A full-resolution pass adds the parts that must stay sharp: stars, the Sun disc, the dark Moon disc, the golden ring (金环) with its slowly drifting beads, and the diamond glint when the Moon nearly covers the Sun.
  - The sky colour depends on which land each view direction looks over. From the night you see the bright lands glowing on the horizon; from the meadow the east lies dark.
  - Clouds are lit by the daylight on the ground below each cloud.
- **Veil shading on every lit material, through addMaterialHook.** Sunlight is scaled per fragment by local daylight (same formula as daylightAt). The ambient is replaced with the local palette: cool and moonlit under the Veil. A warm rim light and soft fill come from the ring. Fog thins with height and blends the camera's air colour with the far fragment's.
  - Works for Toon, Lambert, Standard and Phong, with instancing, batching, skinning and vertex colours.
  - The hook chains safely in either order: if another system sets onBeforeCompile after mine, theirs runs first and mine still applies.
- **Shadows:** one soft PCF shadow map that follows the focus point (±70 m; ±55 on low), snapped to texels so it doesn't shimmer. It stops updating where no sunlight reaches.
- **Post chain:**
  - The scene renders to a half-float target with MSAA and a depth texture.
  - Ambient occlusion (GTAO) runs at half resolution, rebuilding normals from depth so the scene is not drawn a second time. It fades out between 60 and 160 m.
  - Light shafts come from the Sun or ring (sky mask at quarter resolution plus two radial blurs).
  - Depth of field runs only when switched on. Exposure eases toward a target per place.
  - Bloom thresholds follow the Veil, so glow() materials bloom and plain daylight does not.
  - The final pass does ACES tone mapping, sRGB, a colour grade per state (bright day / warm-gold dusk with violet shadows / cool night), vignette, screen flash and dither. FXAA is used only on low quality.

Art-direction checks: the Moon sits beside the Sun at x=-540, touches it at -200, takes a clear bite at -60, and from x=100 and 205 only the golden ring is left, with corona, a crown of teal-violet curtains, stars, the milky band and lit cloud rims. From the palace top the ring hangs over a sea of clouds lit pink by the far dusk lands. The bird's-eye view from (0,900,300) shows the Veil's soft penumbra on the land. Night props are readable, glow spheres bloom in colour, and day shadows are soft.

Two things to know:
- **Performance is only measured on this machine's GPU (Apple M5).** At 1440×900 with pixel ratio 1.75 the full high pipeline takes about 4.0 ms by day and 5.4 ms at night; the sky alone is about 1.9 ms at night. Older Apple chips are untested. Pixel ratio 1.75 is set by the core; if older Macs struggle, lower it to 1.5 (request below).
- **There is no cascaded shadow map, which DESIGN §6.6 asks for.** I used the single map from §8 (one map, ±70 m) as the task allowed; three r187's SunLight cascade addon is built for its node/WebGPU renderer, not this WebGL setup.

## Public API
System: export const skySystem = { name:'sky', pausable:false, init, update, render }. G.renderFrame is replaced by skySystem.render(), which does every camera-dependent update after the camera has its final pose, then draws. Sky animation follows G.time.t (frozen while paused); flash timers and the ring-boost easing run on real time.

G.sky (DESIGN.md §6.6 entries kept exactly):
- G.sky.flash(color = 0xffffff, dur = 0.5): flashes the sky and the screen. color can be a hex number, a CSS string or a THREE.Color; dur is in seconds; the flash fades quadratically.
- G.sky.setRingBoost(k = 1): ring brightness multiplier, eased (rate about 1.6/s). Use about 3 for the ending. The ring line gets 1 + 0.6·(k−1) and the beads get the full k; corona, curtains, cloud rims and the material rim light get 1 + 0.35·(k−1); bloom strength gets ×(1 + 0.12·(k−1)) and shafts ×(1 + 0.3·(k−1)).
- G.sky.exposure (number, default 1): user multiplier on top of the automatic per-place exposure (sunlit 1.0 → night 1.5), eased over about 0.5 s.
- G.sky.setWeather({ rain: 0..1, cloud: 0..1 | null, rainAt: bool }): rain raises cloud cover, adds up to 140% fog density and lowers exposure 12%; cloud overrides cloud cover. The sky also reads G.elements?.isRainingAt(cameraX, cameraZ) every 16 frames.
- Added: G.sky.mesh (full-resolution dome), G.sky.uniforms (shared uniforms U), G.sky.hookMaterial(m) (same as core/mats.js hookMaterial), and read-only G.sky.info = { veil, sunVis, cover, ringK, exposure, shaftK } for tests.

G.lights = { sun: DirectionalLight (intensity 2.9, casts the shadow), hemi: HemisphereLight (intensity 1) }. Each frame the sky system writes sun.color (sun tint × daylight at the camera) and hemi.color / groundColor (camera palette). Other systems may change sun.intensity or hemi.intensity to dim a scene: hooked materials follow the ratio, because the hook's sun term divides by the camera colour and multiplies the hemisphere term by hemi.intensity. No AmbientLight is used.

scene.fog = FogExp2: colour and density are set each frame to match the camera's air, so FX shaders using standard fog uniforms blend correctly. Hooked materials use height fog instead.

G.post:
- composer: an EffectComposer with passes [ScenePass, UnrealBloomPass, grade ShaderPass, FXAAPass].
- enabled (bool): false means a plain renderer.render with ACES tone mapping.
- flags: { ao, bloom, shafts, grade, aa, dof }.
- setDOF(on, focusDist = 8): focus in metres; the blur range is max(2, 0.6 × focusDist).
- setGrade(name): 'sun' | 'dusk' | 'night' | 'neutral'; null or 'auto' follows the Veil.
- Added: set(flag, on) for 'ao' | 'bloom' | 'shafts' | 'grade' | 'aa' | 'dof'.
- Added: sceneCalls, the draw calls of the scene render including the shadow map.

Quality presets:
- low: no MSAA, FXAA, no AO, no bloom, no shafts, shadow ±55 m.
- med: MSAA 4, bloom and shafts, no AO.
- high: MSAA 4, AO, bloom, shafts.
- If the renderer pixel ratio is above 1.3, MSAA drops to 2.
- Optional boolean settings keys postAO, postBloom and postShafts are read at init and on 'settings:changed'. The 'resize' event is handled.

Material hook (installed with addMaterialHook(veilHook)) applies to MeshToon, MeshLambert, MeshStandard/Physical and MeshPhong. It adds varying vMvWorld and requires that a HemisphereLight exists in the scene (it replaces the hemisphere loop). It does not use userData; it guards with a WeakSet, so clones made by own() are hooked again correctly.

Render modules (internal): atmo.js exports pal(name, v), palScalars(v), daylightFromVeil, sunVisibleFraction, U, GLSL_ATMO (any custom shader can include the palette and mvVeilAt). Other exports: skydome.createSkyDome, veilhook.veilHook, shadows.setupSunShadow, post.createPipeline and GRADES.

## Known issues
- No cascaded shadow maps (DESIGN §6.6 asks for 3). I used one texel-snapped map per §8 (±70 m around the focus). three r187's SunLight cascade addon is built for its node/WebGPU renderer, not this WebGL setup.
- Performance is only measured on an Apple M5 (headless ANGLE Metal): about 5.4 ms per frame at night at 2520×1575 with everything on. Older Apple chips (M1/M2) are not measured and may be tight at pixel ratio 1.75; on low quality AO, bloom and shafts are off.
- Under the Veil, nearby night ground lit only by ambient can look flat and uniform (deep navy) when the terrain has little colour variation. The real terrain's colours and the player's lantern should break this up.
- On the fallback ground the dusk penumbra reads somewhat orange-brown from above (low orange sunlight on ochre and green vertex colours). It needs a re-check with the real terrain palette.
- The milky band is a narrow, bright, nearly vertical strip in some views and can look a little like a light beam. Stars and the band appear only where the sky hangs over night land, which is intended.
- The curtains (帷幕) are drawn as a soft crown of coloured rays around the ring rather than classic hanging aurora sheets; they fade in from about 1.1× to 1.8× the Moon's radius.
- Light shafts are screen-space only: they appear when the Sun or ring is roughly in view (they fade as the camera turns away). Nothing falls from the ring when looking away from it.
- Shadows depend on other systems setting castShadow / receiveShadow on their meshes; the material hook cannot set those flags.
- The ScenePass calls GTAOPass internals (_renderPass, gtaoMaterial, pdMaterial, pdRenderTarget) so the AO can reuse the scene's depth and skip the extra normal pass. Re-check after a three.js upgrade.
- Tone mapping: when G.post.enabled is true the sky system sets renderer.toneMapping = NoToneMapping (tone mapping happens in the grade pass). When post is disabled it sets ACES with renderer.toneMappingExposure. Other systems should not depend on these renderer fields.


## As-built updates (fix-render + fix2, 2026-11)
- Camera exposure: night 1.15 (was 1.5), deep dusk 1.0 (was 1.12). The night lift lives in the light and sky colour rows instead: `src/render/atmo.js` exports `nightLift(v)` (1 by day, 1.12 deep dusk, 1.304 night) for shaders that light with their own constants.
- Bloom (`src/render/post.js`): hue-preserving clamp of the bloom input (`BLOOM_CLAMP = 4.0`, max channel) then a soft-knee high-pass (uniforms uKnee 0.5, uClampMax), so only the part above the threshold blooms. The composite pass zeroes NaN / inf and clamps negatives.
- Material hook (`src/render/veilhook.js`, cache key `mvveil2`), fix2 near-light burn-out: every patched lit material (Toon / Lambert / Standard / Phong) gets a soft roll-off `mvRollK(c, knee, ceiling)` that scales the colour by one factor (hue kept):
  - summed direct light (sun + all point lights) after `lights_fragment_end`: knee 0.9, ceiling 1.6 (sunlight on a white wall stays under the knee);
  - final non-emissive colour before `opaque_fragment`: knee 1.0, ceiling 1.75; emissive radiance is added back untouched.
  Glow / MeshBasic / additive fx are never patched. Result: a wisp exploding at her feet at night leaves the red skirt, dark hair and a warm rim readable (was pure white).

## Round 3 (u3-atmos, 2026-11-13): sky, air, reflection, sea
**Sky (`src/render/skydome.js`, LOW pass)**
- Painted cumulus: a 7-step march through a cloud slab. The base coverage is the same function the cloud shadows on the ground use, so shadows and clouds line up. Bases are flat and lit from below by the land's daylight, tops are domed and sunlit, and rims turn silver toward the Sun wheel. A thin high cirrus layer is combed along the wind, and a horizon haze blends into the land's fog colour. Everything drifts with the wind, with the slab giving parallax.
- The Sun wheel (日轮) has a wide pale halo ring with a faint prism edge, plus slow turning spokes. The Moon wheel (月轮) has engraved rings and a thin halo just outside the disc (HIGH pass).
- The Veil's edge is a soft gauze band on the horizon over the land where the lasting dusk begins.
- At night: stars (unchanged), drifting warm motes, and an occasional falling light (a short streak every few seconds).
- The three moods come from the per-view-direction land weights that were already there, so moving between lands is a smooth blend. Light shafts are still the screen-space pass in post.js, on 'high' only.

**Air (`src/render/veilhook.js` fog block)**
- Aerial perspective per land: distant land sinks into blue depth by day, warm haze at dusk and a violet glow at night.
- Ground mist pools in low ground and valleys. It uses noise, drifts slowly, is thickest at dusk and is scaled by `U.mvQ.z`. The colour grade is still `GRADES` by Veil (post.js), unchanged.

**Planar reflection (`src/world/water/reflect.js`)**
- `water.beforeScene()` is now called from `sky.render` before the scene pass, so there is no MSAA target switch in the middle of the pass.
- The target is capped at half the CSS size.
- Reflection list: skinned actors are skipped beyond 22 m (`nearSkinned`). Koi, blobs and sunken objects are skipped, along with anything whose projected size is under `minSize` 0.03.
- Mirror shading is cheap: `U.mvQ = 0` and `U.mvCloud.w = 1` skip the cascade-shadow lookup inside the mirror.
- While the camera is still, the reflection refreshes every 6th frame.
- `PlanarReflection.legacy = true` restores the old list. Use it only for A/B tests.
- Measured with p25 wall time while the machine had a load average of 100+, so these are rough: lake 6.0 → 3.1 ms per pass and 205 → 111 draw calls; bridge 9.2 → 3.2 ms and 312 → 169 calls. No visible difference (.tmp/play/u3-refl0 vs u3-refl3).

**Open sea (`src/world/water/glsl.js`)**
- `wS4` adds a third, rotated large wave layer (/97 m). Two slow macro masks (`wNoise` /430 m) trade the layers so the repeat breaks up.
- `wFarK` (70–360 m) flattens the far water into painted bands toward the horizon.
- The shore foam bands animate (swash lines). Rain rings and swim wakes were checked in motion (.tmp/play/u3-mot3).

### Rules for other systems
- Shadow-only proxies go on render layer 5. The cascade shadow cameras already enable layer 5 when they are created (shadows.js), so structures no longer need to patch the lights.
- Anything drawn inside the mirror pass sees `U.mvQ.xyz = 0`. Do not rely on cascade shadows or mist in reflections.

### Known shortfalls (round 3)
- The tiling of the open sea is reduced, not gone. From high vantage points a faint large-scale repeat can still be seen.
- The clouds are a single slab: there are no towering cumulonimbus and no clouds below the camera when flying.
- The motes and falling light are screen-cheap and procedural. They do not light anything.
- The lake 镜湖 (Mirror Lake) at dusk can read as a flat pink sheet. Its reflection is dominated by the sky, and the lake level is not part of `water.depthAt` (that covers the sea only).
- The reflection timings above were taken on a heavily loaded shared machine. No GPU timer query was available, so treat them as rough.

## Performance pass: boot (2026-11-14, see docs/api/perf.md "Boot and loading")
- `water/reflect.js`: the mirror camera now copies the viewer camera's `layers.mask` each render. In play the viewer
  sees layer 0 only, as the mirror always did, so nothing drawn changes; the boot warm-up (`warmDraw`) restricts the
  viewer to one layer per batch and the mirror follows it.
