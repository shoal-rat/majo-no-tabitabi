# GPU pass — PROGRESS (resumable)
Started 2026-11-16 21:10. Backups of the original files: .tmp/gpu/*.orig.*
## Done
- veilhook.js: debug variants (HOOK_DEBUG_BITS, setHookDebug; key unchanged when 0); sky.js G.look.hookDebug(names)
- tools/perf/gpuprobe.js + perf.mjs --probe / --probe-n; inpage.js calls window.__gpuProbe per scene
## Next
- run probes at t01 meadow, t03 dusk forest, t14 village, w_town_above (high)

## Tables (high, 2160x1350, 4x MSAA, serial ms, medians of 14; quiet machine load ~2-4)
NOTE probe gotcha: ANGLE-Metal readPixels waits only for the resource it reads -> drain from the target written last
(fixed in gpuprobe.js: main pass drains via the resolved scene target).
### t01 meadow (label probe_test / probe_t01 / probe_t01b)
split: frame 23.8 | main pass alone (no shadow maps) 15.3 | +casc0/1/2 ~0.4/0.3/0.6 (464k/819k/1150k tris: depth-only is cheap)
 | post chain alone 7.4 | A/B on frame: ao 1.5-4.0, sharpen 0.7-1.0, smaa 0.6-0.8, bloom 0.2-0.7, shafts 0-0.7, mirror ~0.2
post passes alone: aoNormal 0.5, GTAO 3.5 (1080x675!), denoise 0.7, shafts 0.6, comp 0.8, bloom 0.9, grade 1.6 (0.8 w/o sharpen), smaa 0.1(?)
hook variants (main pass): normal 14.1-15.8, flat 5.4, noshadow -2.5, onetap -0.75, noblend -0.35, nofog -1.0, nocontact -1.0,
 noclouds -1.0, nodetail -0.75, nofine -0.65, nosun -0.55, noamb -0.25, all five cheap -4.2 (noise +-0.7)
res sweep main / frame: pr1.5 14.5/23.1, 1.0 11.5/15.8, 0.75 10.0/12.7, 0.5 8.7/10.5 (ms4); ms0: 13.3/20.5 .. 7.8/9.4; ms2 ~ -0.1..0.4 main
 -> main = ~8 ms non-pixel + 2.2 ms/MP. flat: 5.4 -> 3.8 (intercept 3.6, 0.6 ms/MP)
hooklow: native normal 15.3 flat 5.6 flatvary 7.4 noshadow 12.6 | pr0.5 normal 8.8 flat 4.1 flatvary 6.0 noshadow 8.8
 -> main(native) = raster+vertex base 5.6 + vertex outputs (varyings) 1.8 + shading 7.9 (2.8 per-triangle quads, 5.1 per-pixel);
    shadow taps 2.7 ms all per-pixel
layers (main pass, hide one): grass 2.4 (532k tris), characters 1.7 (396k), impostors 1.0 (1 draw), terrain 0.9, sky 0.6, props 0.5, gameplay 0.5, landforms 0.4, structures ~0
overdraw (submission order): mean 2.02 passing, 3.42 layers (TBDR HSR hides opaque overdraw anyway; only discard materials pay)

### More probes (21:20-21:37)
dusk forest t03: frame 27.2 | main 17.2 | post 6.9 (gtao 2.9) | hooklow native normal 18.4 flat 5.7 flatvary 7.5 noshadow 15.1; pr0.5 9.2/3.7/5.1/7.5
  layers: grass 3.1 (998k), impostors 2.8 (1 draw!), life 2.4 (479k), flora 1.8, sky 1.2
village t14: frame 21.7 | main 17.1 | post 5.2 (gtao 1.6) | layers terrain 2.3, grass 2.3, characters 1.9
town above: frame 25 | main 16.5 | post 7.1 (gtao 3.0) | layers grass 2.4, terrain 2.1, characters 1.5, structures 0.8 (NOT 30 ms: that was noise/night)
  shadow cascades +-1 ms each (depth-only is cheap on TBDR)
exp: empty main pass (clear + MSAA resolve) 1.5 ms; depth resolve 0.3; GTAO 12 samples 3.0 / 6 samples 1.6 (sample-bound,
  not bandwidth: half-res depth bought 0-0.6, a reordered loop 0) -> both dropped. R11G11B10 target: attempt invalid (2.5 ms = incomplete FB?)
in-page interleaved A/B (probe ab, 3 rounds, recompiles between), main / frame serial:
  old -> sc(per-fragment shadow coords + contact early-out): meadow 14.2/22.4 -> 13.5/21.6, dusk 17.0/24.2 -> 16.1/23.5, village 16.8/21.3 -> 15.8/20.5, town 16.2/23.0 -> 14.8/21.9
  shadow tap early-out (5 of 9 taps when uniform): no gain -> not used (gputap=1 keeps it for tests)
  + fog early-out (<15 m exact) + tone-once pass (grade):  old -> new frame: meadow 22.2->20.0, dusk 24.3->21.6, village 20.5->18.9, town 22.7->20.4
  tone pass alone ~0.8-1.1 ms of that
## Decided
- keep: sc (MV_SC_FRAG), contact early-out, fog early-out (exact), tone pass (gpuGrade). Drop: tap early-out (default off), AO half depth, GTAO reorder.
### 21:38 full high run with cuts (label gpu1, fixed res): frame p50 mean 20.84 (ship 23.0), ser 23.64, 11/42 <= 17.5, worst 27.6 (town above)
NOTE probe bug fixed 21:46: probes drew from the GAME camera for look()/viewCam scenes (t14, town...): useView() applies the view cam.
Correct views: town above main 22.2 (flat 6.5), layers terrain 4.1, structures 2.3, props 1.4, grass 1.4; village wide terrain 4.3;
 dango main 17.9, gtao 2.5. 'pace' (rAF by performance.now): UI hidden no change; render off -> 17; half res -> 16.5 => GPU/pixel bound.
### Decision: 'high' (pr 1.5) cannot reach 60 without changing the picture -> measure 'high' at pr 1.25 as a new step
### 22:00 highfast (= high at ?pr=1.25, label gpu1_pr125): mean 17.22, 31/42 <= 17.5, worst 20.3 -> holds 60 -> new tier 'highfast'
  (boot.js QUALITY.highfast name 'high' pr 1.25; gpubench: <=0.7 REF high, <=1.8 REF highfast; panels option; locale q.highfast 「浓彩·流畅」 (Rich Colour · Smooth))
### picture: golden old(gpu=0) vs new: bug found (bloom add used rgb*a; three's blend is premultiplied ONE,ONE) -> fixed;
  after fix old vs new3 within noise floor (new vs new2) in all 8; 300% crops .tmp/gpu/crops_gold identical
## Next: after2 six tour cams (old/new), med+low golden subset, then final measurements (gpu-final, dynres), acceptance, docs
### 22:10 pictures done: tour old/new pairs .tmp/gpu/pairs_tour (differences = sway, banners, camera inside a crown); med/low golden subset old vs new <= 2.1 mean (noise)
## Next: final chain .tmp/gpu/final.sh (log .tmp/gpu/final.log): gpu-final (high,highfast,med,low, runs all), gpu-base0day (high gpu=0), dynres high/highfast/med, acceptance
### 22:21 final chain run 1 INVALID: someone else ran `node tools/sculpt/build.mjs` (100% CPU), load 10, cpu/frame 9.4 vs 5 -> stopped.
  Chain now waits for quiet (1-min load < 5, no tools/sculpt process) before each stage; rerun.
### 22:45 final run 2 (quiet CPU, cpu/frame 5.4) still slower than gpu1 and drifting slower scene by scene (+0.5 early -> +5 ms late):
  same calls / tris -> THERMAL heat-soak of the laptop GPU after ~1.5 h of continuous runs. Absolute tables need a cooled machine;
  comparisons must be interleaved (same heat). Test: cool 6 min, re-run late scenes.
