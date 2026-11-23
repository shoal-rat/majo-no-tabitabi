# ui — as built

## Summary
The whole UI (DESIGN.md §6.5) is built and verified. This third attempt kept the earlier work as it was on disk: dom/icons/style/model/hud/stage/dialogue/wheel plus the locale file. It then added the missing views: panels.js (settings, controls, confirm slip, paper-sheet modal, shared navList), title.js (vertical calligraphic name on a golden ring emblem over the live scene, plus a washi menu slip), map.js (an ink-wash island map painted progressively from heightAt/veilAt/roadDist/riverDist; Veil side in indigo with the ring emblem; DOM overlays for places, lanterns, great lanterns, markers and the player arrow; drag, wheel and keyboard pan/zoom), menu.js (the pause scroll with map/journal/spells/items/settings tabs, hotkeys, footer buttons, save-and-quit), shop.js (noren-curtained stall with purse, vermilion buy stamp and a shake when you can't afford it), ceremony.js (learnSpell ceremonial reveal, queued; showEnding: story lines in vertical clause columns, the 「终」 (The End) seal, a stats card and a credits roll generated from G.assets.manifest). ui.js now wires everything: G.ui API, menu hotkeys, pointer-lock-lost opens the pause menu, fade-in on game:start, relabel on locale change, background map painting while playing. One bug from earlier attempts is fixed: system update() was treating dt as rdt, so every sub-module received 0 while the game was paused. All runs have T.errors() empty. check-i18n passes for src/ui and the locale file.

## Public API
G.ui (all ★ entries from §6.5 have the same names and parameters):
- showTitle({hasSave, saveInfo}) -> Promise<'new'|'continue'>. The 「继续」 (Continue) button shows place (from saveInfo.player x,z via G.world.regionAt) and play time. Starting a new journey over an existing save asks for confirmation. When a choice is made: requestLock (user gesture), fade to black, resolve. On 'game:start' the UI fades back in over 1.2 s.
- toast(text,{icon,dur=3}), banner(title, subtitle?, {seal?}), prompt(text|null), setTracker({title,objective,progress?}|null), setMarkers([...]), bossBar({name,hp,max,sub?,kind?}|null), duelBars(d) (passed to bossBar with kind 'duel'), struggle({value}|null), fade(alpha,dur,color?) -> Promise, letterbox(on), hurt(k) (extra), say({name,text,portrait?,choices?,side?}) -> Promise<number|undefined>.
- openMenu(tab?: 'map'|'journal'|'spells'|'items'|'settings'), closeMenu(), isOpen (true while ANY modal layer is open, title included). Extras: menuOpen, menuTab, talking, wheelOpen.
- openShop({title?, items:[{id,name,desc,price,icon,owned?,max?}], currency:()=>number, onBuy:(id)=>boolean}) -> Promise (resolves on leave). If onBuy returns true and the caller did not change item.owned itself, the UI increments it. owned:true with no max means sold out.
- learnSpell({id,name,desc,element,icon?}) -> Promise. Calls queue one after another. The world is paused during the reveal. Dismiss with E/Enter/Space/Esc/click after 1.6 s (click works after 1 s).
- showEnding({lines?:string[] | text?:string, title?, stats?:boolean=true, credits?:string[], vertical?:boolean}) -> Promise. Sets G.mode='ending' and leaves it there (the caller decides what follows). Phases: story lines (auto-advance, or Space/E/Enter) -> 「终」 seal -> credits roll (hold Space/E/click to speed up, Esc/Enter to skip) -> wait for confirm. Credits are grouped by manifest type: author + licence, with an item count.
- providers: {journal, mapMarkers, items, lore, spells}. Each is a function the other systems assign, read in the formats from §6.5. Spells gather fallback: G.spells.list / G.state.spells, abilities from G.state.abilities (charm and dodge are innate). Items fallback: stardust/dango/moontear from G.state.inventory.
- debug: {UI} (UI.reload can be overridden in tests; save & quit calls G.save.write(), fades out, then UI.reload()).
Input: Esc/P opens the pause menu (also from 'talk'). M/J/B open map/journal/spellbook and the same key closes that tab again. 'input:lockLost' while playing opens the pause menu, unless the UI released the lock itself or the wheel is open. Inside the menu: Q/E (or clicking the keycaps or tabs) switch tabs; arrows/WASD navigate; Tab moves focus to the footer buttons; Enter/Space confirm; Esc/Backspace close. Map tab: drag/wheel/±/arrows pan and zoom, Enter recentres on the player. A 180 ms guard after opening keeps the Esc that released the pointer from closing the menu straight away. Settings write G.settings and call G.save.writeSettings(). The language row appears only when locales().length > 1 and calls setLocale. Changing quality shows a 'takes effect next time' note.
New locale keys: ui.layout.clauseBreak, ui.menu.hintSub, ui.menu.hintFoot, ui.spells.el.<element>, ui.spells.art.<charm|dodge|broom|wings|guard|shikigami|kinkan>.{name,desc}.

## Known issues
- Language switching is untested: only zh-CN is registered, so the language row is hidden. The relabel/retranslate paths exist but have never run.
- Toasts are drawn below full-screen modals, so the 'bought X' toast from the shop is partly hidden behind the shop backdrop. The vermilion stamp in the shop already shows the purchase.
- The map base image is 512 px over 1720 m. At high zoom the coastline looks a little blocky. The base is painted once and does not repaint after terrain deformation.
- Region labels for the broad regions (sunmeadow, duskwood, evernight) use hand-picked spots in map.js. If the world layout changes, these spots must be updated.
- showEnding leaves G.mode = 'ending' when it resolves. The story system must decide what comes next (for example, reload to the title).
- The title screen does not move the camera. During the real title, whatever camera the player/cam system sets is shown behind it.
- Pointer-lock behaviour (requestLock on choose/close, lockLost -> pause) could not be tested in headless Chrome. The logic is in place with a self-unlock guard.
- learnSpell calls G.fx?.flash?.(color, 0.4) and plays sfx 'learn'/'buy'/'stamp'. These fx/audio names are guesses and are optional: nothing breaks if they are missing.


## As-built updates (fix-systems + fix2, 2026-11)
- `model.js cooldownLeft(slot) -> 0..1`; spellSlots() entries carry `cd` and `cdBig`.
- `G.ui.setMarkers(list, layer = 'main')` replaces only that layer; layers are drawn together (races use 'race', quests 'main'). `setMarkers([], 'race')` clears the race rings only.
- `G.ui.openShop({ ..., currencyIcon })`: icon of the price currency (default 'stardust'; the moon-tear altar passes 'moontear').
- Items menu: usable items show a 'use' / 'eat' (food) action that calls `G.gameplay.useItem(id)`.
- Lock-on reticle follows `G.combat.lockTarget` on real enemies and on 无明's (Mumyo's) weak-point lock proxies.

## Performance pass: boot (2026-11-14, see docs/api/perf.md "Boot and loading")
- `showTitle({ hasSave, saveInfo, ready })`: `ready` (optional Promise) = the world is still loading. Until it resolves
  the title shows a progress line (the `core.boot.*` texts, from the `boot:progress` event) and dims 「继续」 / 「新的旅程」 (New Journey);
  a choice made early (after the overwrite confirmation) is kept and carried out when the world is ready. Settings and
  controls work at once. Without `ready` the title behaves as before.

## Look round: lettering (2026-11-14)
**What the look is now.** No print type is left in the interface or on the world's signs. Each locale ships its own
faces (zh-CN: `assets/fonts/zh-CN`, SIL OFL 1.1, unmodified) and declares them in `core.meta`:
- `fonts: [{ family, file, weight? }]` loaded by `src/core/fonts.js` through FontFace under the game's own names
  (`MV WenKai` hand-written regular script, `MV Brush` brush regular script, `MV Running` running script);
- `fontTitle` (brush: place-name cards, window / chapter titles, name plates, seals, compass, banners),
  `fontBody` (hand-written: dialogue, menus, HUD, every small label and numeral), `fontSign` (running script:
  signboards) — each ending in system fall-backs (Kaiti / Songti / PingFang);
- `lettering: { '<exact text>': 'lettering/<locale>/x.png' }`: hero inscriptions painted as images (white ink on
  transparent). zh-CN: the title 「月帷巫女」 (Moonveil Miko), the shrine plaque, two banners (generated, every character checked; see the
  manifest). Other locales simply do not list them and get the font-drawn version.

`ui.js` init awaits `loadFontsWithin(6000)` right after `installStyle`, so every system initialised after the UI
(the whole world) bakes with the faces. `style.js` appends a TYPE block after every view's CSS: brush faces only from
~18u up (smaller `var(--ft)` labels are moved to `var(--fb)`), brush titles set tighter (.08–.14em instead of
.24–.42em) and at weight 400 (brush faces declare the whole weight range, so the browser never fakes a bold over a
brush stroke; since r2 the hand-written face is never synthesised bold either), the
place-name card 62u, dialogue 20u / 1.75, tabular numerals in counters.

**Rules for other systems.**
- Never hard-code a family. CSS: `var(--ft)` / `var(--fb)` / `var(--fs)`. Canvas: `fontStack('title'|'body'|'sign')`
  from `core/fonts.js`.
- A canvas that draws text must draw after the faces: call `whenFontsReady(fn)` (runs now if ready) and set
  `texture.needsUpdate` in fn, or check `fontsReady()` and register a redraw — a canvas drawn too early silently
  falls back to print type. `fx/text.js` forgets its cached words when the faces arrive.
- Brush faces have no arrows: world signs get painted arrows (lettering.js); DOM arrows fall back to the system face.
- `handLettering(text)` / `handLetteringUrl(text)` give the painted inscription for a text in the active locale (or
  null / ''), e.g. as a CSS mask for the title (`title.js` belongs to the start-up owner: see the request below).
- Adding a locale: add its faces to `assets/fonts/<locale>/` + manifest (`type: 'font'`, `preload: false`), list them in
  its `core.meta.fonts`, run `node tools/gen-credits.mjs`.

**Revision (r2, after the art review).** No face is synthesised bold any more: `MV WenKai` also declares `100 900`
(a faked bold fills the kai stroke modulation in and read as print type at label sizes). World-marker names are in the
brush face (19u) and step counts / the tracker objective in the hand-written face (15–16u), all on one soft dark halo
(1u core + 3u drop + 9u glow, no hard outline): readable on sky, blossom and dark foliage at 1440×900. The place-name
card's second line is in the brush face (21u) on a soft radial ink wash. While the card is up, marker names fade out
and back (an inherited `@property --mv-yield` animated on `.mv-ui:has(.mv-banner.on)`; the root never toggles
display, so a pin shown later is not affected) — the card and a marker both live in the upper middle. Rule for new
HUD text over the 3D picture: kai or brush face at weight 400, ≥14u, with the same halo; never a backing box.
Cost: CSS only, no nodes added.

**Cost.** Three faces, 23.9 MB on disk, fetched in parallel at UI init (local: ~0.12 s fetch, measured in a headless
run; parse not separately measured) and capped at 6 s; nothing per frame, no draw calls, no shader. DOM text cost is
unchanged (the same number of nodes).

**Requests (not done here).** `title.js`: draw `.tt-name .nm` from `handLetteringUrl(t('core.title'))` when present
(mask the painted inscription, keep the text node), else `var(--ft)`; `stage.js` could likewise use `handLettering`
for a place-name card whose name has a painted version (only 向日神社, Sunward Shrine, today).

## Touch and small screens (mobile round, 2026-11-22)
**How it plays.** On a phone or tablet held sideways the game shows thumb controls over the HUD (`src/ui/touch.js`).
Left half: a floating stick appears where the thumb lands; walking speed follows how far it is pushed (analog: half
push = half speed), on the broom its sideways push turns the flight. Right half: drag to turn the view. Right-thumb
buttons (ink discs with a gold ring, placed from the bottom-right corner, size/opacity in settings): 「魔力弹」 (Magic Shot; hold =
stream), 「施法」 (Cast; wears the selected element; tap = small form, hold-and-release = charged big form, charge ring and
cooldown sweep on the disc), 「换魔法」 (Switch Magic; tap = next known magic, hold = the magic wheel, flick from it = choose at once;
an opened wheel waits for a tapped slot), 「跳跃」 (Jump; on the broom: hold to climb), 「闪身」 (Dodge) / 「下降」 (Descend; broom), 「防护」 (Guard; hold), 「唤帚」 (Call Broom),
「疾跑」 (Sprint) / 「加速」 (Boost) toggle, 「面包」 (Bread; count badge), 「锁定」 (Lock On; only in a fight), and a contextual 「互动」 (Interact) button that appears with the verb
of the current prompt. Dragging on 「魔力弹」 / 「施法」 also aims. Top-right: pause and map. In a conversation a tap anywhere
reads on (a choice must be tapped itself); in a skippable cutscene a hold on 「跳过」 (Skip) skips; on the ending a finger reads on
and, held, hurries the credits. Held upright, a card asks to turn the phone and the pause scroll opens beneath it.

**Detection** (`src/ui/touchenv.js`): `?touch=1|0`, else `settings.touch` 'on'|'off', else 'auto' = coarse primary
pointer (or a touchscreen laptop from its first touch until a real mouse press). In touch mode `G.input.touch = true`
(pointer lock is never requested), `.mv-ui.touch` is on the UI root, `UI.touch = true`. First tap: fullscreen +
`screen.orientation.lock('landscape')` where supported; iPhone Safari gets a one-line home-screen hint on the title.
Browser gestures: Safari gesture events and multi-finger moves (except on the map) are prevented; the page shell has
`touch-action: manipulation`, `overscroll-behavior: none`, no callouts / tap highlight; the canvas `touch-action: none`.

**Scale** (`style.js applyScale`): with touch, `--u = max(desktop rule, min(0.9, h/470, w/820))` (0.83 at 844×390,
0.80 at 667×375, 0.9 on tablets). `.mv-ui.compact` when the screen holds less than ~1180×660 units: menu, shop, title
sheets, confirm slip, dialogue, learn and ending are clamped to the screen (`min(…u, 100vw/100dvh − insets)`), the
wheel scales to the height. SAFE rules add `env(safe-area-inset-*)` to the HUD corners, toasts, dialogue and skip hint
(0 on a desktop: nothing moves there). In touch mode the HUD drops the key hints, the key prompt and the spell
cluster (all on the buttons), the tracker sits left of the pause/map column (objective clamped to two lines) and edge
pins stay above the thumbs.

**API.**
- `G.input.virtual`: `down(action)` / `up(action)` (by ACTION name: rebinding never breaks a button), `move(x, y)`
  analog stick −1..1 (keys win; mode-gated like held()), `key(code, on)` raw code (UI confirm = 'Enter'), `isDown`,
  `releaseAll()`. `G.input.touch`. `setKeyLabelHook(fn)` (core/input.js): touch mode names buttons in `{key}` texts
  (`ui.touch.key.*`, e.g. 「施法」).
- `player.js readInput`: `I.wish = min(1, |move|)` (keys: always 1).
- `G.ui.touch`: `{ on, ctx, root, where(id) -> {x,y,w}|null, stick -> {x,y,cx,cy,r,active}, releaseAll(), apply() }`.
  `G.ui.prompt(text)` also feeds the interact button's verb. Wheel: `openTouch()`, `touchVec(dx,dy)`,
  `touchRelease(commit)`, `touchOpen`. Dialogue: `choosing`, `root`. `UI.mapView` (map pan/zoom, tests).
- Settings (`defaultSettings`): `touch: 'auto'|'on'|'off'`, `touchSize` 0.7–1.25, `touchAlpha` 0.25–1, `touchSens` 0.3–3
  (look px per finger px = 2.6 × touchSens; mouse `sens` does not apply to touch). Settings panel: a 「触屏」 (Touch) section on
  any touch-capable device; in touch mode the key list and mouse speed are hidden, 「操作」 (Controls) shows the touch guide.
- Quality (`gpubench.js mobileDevice()`): a phone / tablet gets the 'mobile' tier (「掌上」, Handheld) without the probe: at least
  1080 rendered lines, handheld cuts, 30 fps unless the device clearly holds 60 (docs/api/perf.md "Phones"); an earlier
  automatic pick (old 'low', a probe result) is picked again; a tier the player chose is kept. The settings row on a
  handheld lists 「掌上」 「素描」 (Sketch) 「淡彩」 (Light Colour) 「浓彩」 (Rich Colour); every tier there keeps the 1080-line floor.

**Rules for other UI.** New HUD layers that sit over the 3D picture: `pointer-events: none`, created before the touch
layer or at least below `.mv-dlg` (the touch layer is inserted right after the stage layers); keep clear of the lower
right (buttons) and the left-lower quarter (stick); a new modal goes in `UI.host` and the touch layer hides itself
while any modal is open. Never read `Mouse0` / key codes for something a player must do — read actions
(`G.input.pressed('attack')`), so the touch buttons drive it too.

**Testing.** `.tmp/agents/mobile/run.mjs` (CDP: `Emulation.setDeviceMetricsOverride` mobile + `setTouchEmulationEnabled`,
real `Input.dispatchTouchEvent`), scenarios `sc-*.mjs` there.
