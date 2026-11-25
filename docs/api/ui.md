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

## Grimoire round: the interface redesign (2026-11, as built)
**Why.** The inherited look was a Japanese shrine scroll (washi with deckle edges, vermilion seals, brush script, a
noren curtain over the shop). This game is a travelling witch's journey through a sunlit European storybook land, so
the interface became her *traveller's grimoire*: night-blue glass and leather with thin brass filigree, ivory
parchment pages, ink, and a little starlight. Everything stays readable over a bright meadow sky; nothing glares.

### Palette (CSS custom properties on `.mv-ui`, `style.js` BASE)
| token | value | use |
| --- | --- | --- |
| `--night0` / `--night` / `--night2` / `--night3` | `#0a0f1e` / `#121a2f` / `#1c2744` / `#2c3a5e` | glass panels, covers, discs, hover |
| `--glass` / `--glass2` | `rgba(15,21,40,.62)` / `rgba(20,28,52,.8)` | HUD plates, chips, toasts |
| `--parch` / `--parch2` / `--parch3` | `#f6efe0` / `#ebdfc6` / `#d8c6a1` | parchment pages, cards |
| `--ink` / `--ink2` / `--ink3` | `#2a241e` / `#5d5144` / `#8e806f` | text on parchment |
| `--brass` / `--brass2` / `--brass3` | `#c9a45e` / `#ecd9a4` / `#94712f` | frames, rules, selection; `2` on night, `3` on parchment |
| `--star` / `--moon` | `#fff7e8` / `#cfdcff` | light text on night, starlight accents |
| `--wine` / `--wine2` | `#8b3343` / `#b6495b` | wax seals, "main" marks, destructive buttons |
| `--life` / `--mana` | `#e8685c` / `#78b2ff` | the two vitals (gradients use `--life2` `#b23a39`, `--mana2` `#4f74d8`) |

The inherited names stay as aliases so older rules and other systems keep working: `--paper`=`--parch`,
`--red`=`--wine`, `--red2`=`--wine2`, `--gold`=`--brass`, `--gold2`=`--brass2`, `--indigo`=`--night`.
Element colours are unchanged (`icons.js EL_COLOR`).

### Type
Three roles, all from the locale (`core.meta`), never hard-coded:
- `--fd` display: **MV Serif** (Noto Serif SC, variable 200–900, a 0.5 MB subset of the locale characters, see
  `tools/font-subset.mjs`) — headings, tabs, names, place names, labels, buttons, every numeral (`tabular-nums`).
- `--fb` body: MV WenKai (hand-written kai) — dialogue, descriptions, objectives, hints: the diary voice.
- All four faces (MV Brush and MV Running too) ship as WOFF2 subsets of the locale characters (docs/api/perf.md
  "Font subsets"); run `node tools/font-subset.mjs --check` after adding text.
- `--ft` brush and `--fs` running script stay for the world's signs and canvas lettering only; the interface no longer
  uses them.

Scale in design units (`u`, px at 1280×720): title 92 · card 54 · page title 28 · section/name plate 19–21 · label 15 ·
small label 13 · kicker 12 (letter-spacing .24em, brass) · body 15 (line-height 1.85) · dialogue 20 (1.75) · hint 13.
Weights: display 600–700, labels 600, kickers 600, body 400. CJK headings are tracked .06–.16em (the old .3–.5em read
as gaps, not elegance).

### Surfaces, frames and ornaments
- **Night glass** (`.mv-night`, HUD plates): `--night`/`--glass` gradient, 1u brass hairline at ~35 % alpha, a faint top
  highlight, soft drop shadow. HUD plates never use `backdrop-filter` (it would re-blur the 3D picture every frame on a
  phone).
- **Parchment** (`.mv-paper`, unchanged hook): ivory gradient lighter at the centre, a faint fibre texture
  (`paperTexture`), a soft inner edge, and a framed border drawn by `.bg::after` with `border-image` from a generated
  SVG (`icons.js filigree()`: hairline double rule, a curl-and-diamond flourish in each corner). Two colourways:
  `--fr-paper` (dark brass on parchment) and `--fr-night` (light brass on night).
- **Rules** (`.rule`): a hairline fading at both ends with a four-point star in the middle (`--mk-star`).
- **Wax seal** (`.seal`): round, wine, embossed rim; replaces the vermilion square seal everywhere (journal marks,
  shop stamp, confirm slip, the 「终」 of the ending).
- **Key caps** (`.keycap`): small night-glass keys with a brass hairline; on parchment (`.mv-paper`, the menu page
  `.mn-body`) they turn ivory with an ink rim.
- **Buttons** (`.btn`): serif label, a brass underline that grows from the centre and a star marker on hover/selection;
  `.btn.red` turns wine.
- **Medallions**: spells, wheel slots and touch buttons are night discs with a thin brass ring and the element's glow.
- The washi deckle, brush-stroke masks, ensō rings and the wave pattern are gone from the interface (the generators
  that only they used were removed after `tools/dead-code.mjs` reported them).

### Motion
`--ease: cubic-bezier(.2,.8,.2,1)`. Hover 120–160 ms; panels fade + rise 8u + scale .985→1 in 240 ms; the place-name
card keeps its 4.4 s arc with an ornament that draws out from the centre; selection underlines grow from the centre;
gauge-ready and the selected wheel slot get a slow brass sheen. `prefers-reduced-motion: reduce` stops sheens, bobs
and spins.

### Screens
- HUD: brass astrolabe emblem (sun/moon disc) beside capsule vitals; compass as a fading night ribbon with serif
  cardinals; serif tracker with a star bullet; glass counter, prompt and key hints; the spell medallion with a brass
  gauge ring; thin ivory crosshair; rose lock-on brackets; boss/duel bar with filigree end caps.
- Place-name card: hairline with a star, serif title, kai subtitle, the major name as an ink entry stamp (Journal round).
- Toasts: night-glass slips with a brass edge and a coin icon.
- Dialogue: parchment card with the filigree frame, a night name plate with a brass rim, an arched cameo holding the
  speaker's portrait (below), a brass star "next" mark; choices are glass pills with numbered coins.
- Pause menu: a night-blue leather cover (frame `--fr-night`) holding the tab bar and footer, with the page itself
  in parchment (`.mn-body`); lists, details, spells, items, wardrobe, settings and the map are ink on parchment.
- Shop: the curtain became a hanging sign (night plaque with brass frame); stamp = wax seal.
- Title: serif name with a brass sheen and an ornament, a star-marked menu; sheets and confirm slips in parchment.
- Spell wheel: a night-glass ring with brass hairlines and medallion slots; ceremony and ending in starlight and brass.
- Phones: everything above, plus the existing touch rules — targets ≥ 44 px, `env(safe-area-inset-*)`, nothing
  over the stick (left-lower quarter) or the button cluster (lower right).

### Journal round (the owner's note: the mood of 魔女之旅 / 奇诺之旅)
The owner pointed the look at the two shows' traveller's-journal feel: a diary, a title card for each new country,
quiet narration, the countries visited kept as stamps, a storybook tone a little wistful. Taken as mood only; every
piece is drawn in code here and none reproduces either show's cards, logos or lettering.
- **Country title card** (`stage.js` banner): a hairline with a star draws out from the centre, the serif name settles
  in, the kai line follows, and the region's major name (`opts.seal`) is pressed beside the name as a round ink entry
  stamp (double ring, a star, a short thump at ~25 % of the 4.6 s arc).
- **Narration** (`dialogue.js`, a `say()` with no name and no portrait → `.dlg-box.narr`): centred, a touch lighter,
  on faint ruled lines under a small flourish, like a line written in the travel diary.
- **Travel stamps** (`map.js`, the map page's 旅路): the itinerary's four stops (`world.itinerary`) are passport
  stamps — inked, tilted and multiplied into the parchment once she has been there, a faint dashed outline before.
  `stampVisit(id)` runs on every `region:enter` (`ui.js`) and writes the new save field `G.state.stamps`
  (`{ hometown|forest|wilds|bellcrown: 1 }`, default `{}` in `defaultState()`); each region id belongs to one stop
  (`STOP_OF`), and a stop also stamps the ones before it (the road west is one road), so an old save already in the
  city gets all its earlier stamps on the first region it enters.
- **Ribbon bookmark**: a wine ribbon hangs over the grimoire page's top edge (`.mn-body::after`).

### Dialogue portraits
The cameo shows a head-and-shoulders picture of the speaker, rendered by the game itself from the character's own 3D
model — never official art. `tools/costume/portraits.mjs` (+ `portraits.shot.js`) uses the wardrobe pictures' method:
the figure and the lights on a layer of their own, the world hidden, drawn over a dark and a light flat ground, cut out by
difference matting. Every speaker gets the same lens (28°), distance (2.6 m) and framing round the head bone, so all
share one scale; Elaina looks to the right of her picture (she speaks from the left of the box), the others to the left.
Out: `assets/textures/ui/ui_portrait_<id>.webp` (320×400, 9–21 KB, manifest `ui_portrait_<id>`, licence "In-game
render"): `elaina_apprentice`, `elaina_elaina`, `fran`, `saya`, `mother`, `father`, `exam`, `innkeeper`.
- `G.ui.portraitOf(who) -> url | null` (`dialogue.js portraitOf`): the manifest picture for a story speaker id; Elaina's
  follows `G.player.outfit` (the witch's robe when that outfit has none). `story/dialogue.js` passes it as
  `say({ portrait })`; speakers without a picture (roadside travellers, the narrator has no cameo) keep the glyph.
- Loading (`dialogue.js` `pic()`): each picture is one kept `<img>`, fetched ahead: `G.ui.preloadPortraits([who, …])` (G.dialogue
  calls it with a script's speakers when it starts; high fetch priority) and every `ui_portrait_*` one at a time from 4 s
  after play begins (low priority; a line that wants one of those adds a high-priority ask). A
  failed request is asked again after 2.5 s, one silent for 12 s gets a second request beside it (8 tries). If the
  picture is not there 0.3 s into the line the cameo shows the speaker's initial; the picture then fades in (`.dlg-port.late`). Up to 2.0.1 the
  picture was asked for only when its line appeared and the arch stayed empty while it loaded (slow links: all story).
- Re-run `node tools/costume/portraits.mjs [--only id,…]` after a character's look changes; `--no-shoot` re-cuts the
  last shots (to change the crop: `ABOVE` / `BELOW` in the tool).

### Hooks kept
Class names the acceptance scripts and other systems read are unchanged (`.mn-subtabs .st`, `.mn-list .scroll .mn-row`,
`.mv-ui`, `.mv-paper`, `.modal`, every `hud-*` / `dlg-*` / `tc-*` / `wh-*` / `foe-*` hook); the only DOM additions are
ornaments (`.mv-banner .hd` and `.stamp` — the stamp holds the region's major name — `.tt-name .orn`, `.mp-stamps`), the
menu sheet's `.mv-night` class and `.dlg-box.narr`.
No exported function or data shape changed; the only new save field is `stamps` (defaulted, old saves load unchanged).

### Adding an episode
The owner plans 12+ episodes, so every out-of-play surface reads one registry, `src/data/episodes.js`; adding an episode
is data there, its words in the locale and its quest in `src/story/questdefs.js`. No UI file changes. (This replaces the
fixed four-stop itinerary described under "Journal round": `STOPS` / `STOP_OF` and `world.itinerary` are no longer read.)

**1. Registry entries** (shapes in the file's header; `n` sets story order, countries follow their episode's order):
- episode `{ id: 'ep3', n: 3, title: <loc key>, quests: ['<quest id>', …], countries: ['<country id>', …] }`.
- country `{ id, episode: 'ep3', name: <loc key>, sub: <loc key> | null, regions: ['<region id>', …], anchor: <id> | null,
  stamp: { seed, ink?, shape?, motif? } }`.
  - `regions`: every region id (`G.env.region`, `'region:enter'`) inside the country; a region belongs to one country.
  - `anchor`: where the map flies when the stamp is clicked. Looked up in `JOURNEY_POI` (has `r`), then `G.world.POI`,
    then `JOURNEY_ANCHORS` (no `r`: 90 m); `null` = not on the map yet (the stamp is then not clickable).
  - `stamp`: `src/ui/stamps.js` draws the art from `seed` (8 shapes, 6 borders, 10 motifs, 4 layouts, 8 muted inks, a
    tilt). Shape, motif and ink follow low-discrepancy sequences, so **give a journey's countries consecutive seeds** and no
    neighbours share shape + motif (checked over 11 neighbours, 3000 seeds). `ink` (`#hex`), `shape` (circle oval octagon
    scalloped shield rect hexagon notched) and `motif` (star crescent sun tower key leaf wave bell quill flower) override
    the seed's pick. The art carries no text: the name is DOM text over it (`nameY` / `nameW` in the result).

**2. Locale keys** (`src/locales/zh-CN/`): the episode `title` (today the quest title, `story.quests.<id>.title`, e.g.
「第三话　…」); the country `name` / `sub` (`world.place.<id>` / `world.sub.<id>`); `world.place.<region>` (+ optional
`world.sub.<region>`) for every region, which the place-name card shows on entry. Nothing in `ui.*` needs a new key.

**3. Quest link**: list the episode's quest ids in `quests`. The journal groups quests by `episodeOfQuest(id)`; a quest no
episode lists (errand-like side quests) goes to the last chapter, `ui.journal.looseChapter`.

**What shows up where**
| surface | reads | behaviour |
| --- | --- | --- |
| journal 托付 (`menu.js createJournal`) | `providers.journal()` + `episodeOfQuest` | one chapter line per episode in story order (`.mn-ch`: title, 已了 n/m; not a `.mn-row`, so `navList` and the acceptance hooks skip it), active-first inside; chips 全部 / 进行中 / 已了 (`.mn-filt .fc`, key F); opens on the first quest still under way; the list scrolls |
| map 旅路 (`map.js`) | `episodes()`, `countries()`, `G.state.stamps` | stamps grouped under each episode's title; inked, tilted and multiplied once visited, a dashed outline before; an episode appears once it is under way (a stamp of it, or one of its quests in the journal), the ones after collapse into one line (`ui.map.roadAhead`), so no country is named early; click / tap a stamp with an anchor → the map glides there (anchor circle ≈ 40 % of the view) and rings it; scrolls on its own on a desktop, with the side panel on a phone |
| stamps (`map.js stampVisit`) | `countryOfRegion` | every `'region:enter'` stamps that country and every earlier one in registry order; save `G.state.stamps[countryId] = 1` (unchanged shape, old saves load as before) |
| country title card (`stage.js` banner via `ui.js`) | `countryOfRegion`, `episodeById`, `stampArt` | the episode over the name, the country's stamp beside it |
| run time | `G.ui.episodes = { list, countries, countryOfRegion, episodeOfQuest, register, stampArt }` | `register({ episodes, countries })` adds or replaces entries (data packs, probes); `registryVersion()` bumps on each call |

**Pages that grow without an episode**: the bag (`.it-grid`, 4 a row) and the spell lists (elements 4 a row, arts 7 a row,
more arts wrap) scroll inside `.mn-list .scroll`, keys scroll the selection into view; the wardrobe keeps four tall cards
across the page for up to four outfits and turns into one sideways-scrolling row of fixed-width cards (`.wd-wrap.many`;
wheel, ← →, a finger) past four.

**Probe**: `node tools/play.mjs --name ep12-desk --script tools/journey/episodes-probe.js` (and `--mobile --dpr 3 --size
844x390`) registers 12 made-up episodes (a `probe` locale namespace, 1–2 countries each, fake region ids, some anchors
reused or null, consecutive seeds), enters a region of episode 6 (stamps 10 countries), adds fake quests through
`providers.journal` and 22 things through `providers.items`, and saves `journal-top`, `journal-scrolled`, `journal-active`,
`map-stamps`, `map-stamps-end`, `map-fly`, `stamp-sheet` (every registered stamp), `items-many` and `wardrobe-many` (the four
cards cloned to seven) in `.tmp/play/<name>/`. Its result lists checks (chapter lines are not rows, the active filter shows
only active quests, the map flew to 魔法使之国, the bag and the wardrobe row scroll, every stamp distinct) and `T.errors()`.
Run it after any change to the registry, the journal, the map page or the stamp art.


### Bold round: the in-play HUD (owner: 「再大胆一轮」)
The always-on screens got their own identity in the journal language, and the play view keeps quiet when nothing is
happening.
- **Crest** (`hud.js` vitals): the little sky (sun / moon) in a brass-rimmed medallion with the astrolabe ring; life and
  mana are two 270° arcs round it (SVG paths with `pathLength=100`, fill + trailing ghost as the bars had), a star in the
  gap at the bottom; the numbers beside it (`62 / 100`, mana under it). Low life pulses the life arc.
- **Compass ribbon**: a banner with swallowtail ends (`icons.js ribbon()` as `border-image`, `--fr-ribbon`); the bearing
  strip slides behind a window (`.win` > `.ctr`, a 400u frame centred so the bearing maths keeps its units on any width).
- **Objective card**: the tracker is an inked parchment card with a wine edge and a ribbon bookmark.
- **Spell dial**: the selected magic as a medallion with the brass gauge ring and the astrolabe round it; every magic is
  a glyph pip on an arc above-left (unknown: a faint dot; the selected pip glows in its element colour); 「蓄能」 moved to
  the top-right of the medallion.
- **Prompt**: a parchment pill with the key in a night medallion. **Toasts**: parchment slips; the icon is an ink stamp
  pressed onto the slip as it arrives (`opts.color` tints the stamp ink, mixed toward ink so it reads on parchment).
- **Foe plates**: names on small night ribbons with swallowtail ends; elites get a brass star crest and a bronze ribbon;
  the bar has a brass hairline. The boss / duel name sits on the compass ribbon.
- **Touch**: every button is a brooch medallion (brass rim, inner hairline, the astrolabe tick ring); 44 px floors and
  safe areas as before.
- **Country title card**: from the registry (below): the episode's title as a kicker over the hairline, the country
  name, the kai line, and the country's own procedural passport stamp printed on a parchment ticket at its own tilt
  (`stamps.js stampArt`). Regions outside the registry fall back to the plain ring with `opts.seal`.
- **Quiet when idle** (`hud.js update`, `restT`): the crest rests (dims, numbers fade) while she is whole and out of a
  fight for 4 s; key hints rest after 12 s on the same set; the objective card folds to its title after 14 s without a
  change; the dial dims after 9 s without a swap, a cast charge or a fight. Any change brings each back at once.

### Coach card (src/ui/coach.js, 2026-11-24)
`G.ui.coach({ who, line, task, n, of, dur })` shows one lesson: the speaker's line, the task and `n / of`, as a parchment
pill bottom centre (a phone: between the stick and the buttons). The caller fills key placeholders with
`src/story/dialogue.js` `fill()`, so a computer shows keys and a phone its button names. `G.ui.coach({ done: true })` ticks
the task off (a green check, then it fades); `G.ui.coach(null)` hides it. Hidden under menus and dialogue, back when play
resumes; never takes pointer events. Used by Fran's spar lessons (`src/story/spar-lessons.js`).

### Combat type round (2026-11-25)
The director found the in-fight HUD prototype-like in the gameplay trailer. What changed (the floating labels themselves
are in `docs/api/fx.md` "Combat type round"):
- **Foe banner** (`stage.js`, `G.ui.banner(title, sub, { foe: true, epithet })`): a guardian, a boss, a duel rival, the
  stardust trial and Fran's recollection open with their own banner instead of the place-name card: a dark band fading out
  at both sides, pale-gold hairlines above (four-point star) and below (diamond), the name large in the display serif with
  its epithet (「烛林」) smaller in brass before it, the line under it in brass with wide letter-spacing. Entrance: the band
  opens from the middle, the rules draw outward, the ornaments spin in, the name un-blurs as its letter-spacing settles.
  It sits at 17 % (12 % on touch), below the boss bar. A foe banner takes down a place card and the other way round.
- **对波 bar** (`hud.js` struggle): a slim rod between two diamond caps (gold gem on her side, violet on theirs), clock ticks
  above and below every eighth with a long one at the middle, gradient fills, a vertical gleam and a turning star where
  the beams meet; a crack flickers there when either side is under 20 % (hers reddened, and the rod shivers). The title
  is small brass with hairlines; the mash key is a brass-rimmed night key that pulses as it is pressed.
- **Boss / duel bar**: the same rod (it had lost its base styles: the fill had no size), diamond caps instead of stars,
  ticks every tenth, a gleam on the leading edge, a shiver in the last tenth. No numbers.
- **Foe plates**: the ward (shield) bar is a slim rod in the ward's colour between small diamond caps with quarter ticks,
  flickering once under a quarter; the posture line flickers once it is past 80 %. The plate and the status marks rise
  over the lanes of floating labels (`liftOver`) and settle after. Reaction pills (`reactions.js`) sit beside the foe's
  upper body instead of over its head.
- **Vitals**: the `/ 100` after her life is a small brass tag.
