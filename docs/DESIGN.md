# 《月帷巫女》 (Moonveil Miko): Design and Technical Contract

> **Wandering Witch fork note**: this document describes the original 《月帷巫女》 engine game. This game's design, story, map and maintenance rules are in [JOURNEY.md](JOURNEY.md); where the two conflict, JOURNEY.md wins.


> Everyone working on development (agents included) follows this document. For facts in code, `src/core/`, `src/world/ground.js`, `src/world/veil.js` and `src/data/world.js` are authoritative. These files are already written: **do not modify them** (if they need a change, raise it in your report).

## 0. One-line pitch and iron rules

A third-person 3D magical open-world adventure. The heroine is the shrine maiden 「灯里」 (Akari), who rides a summoned broom and has mastered spells of eight elements. Everything in the world (plants, rocks, water surfaces, objects, living creatures) follows one shared set of elemental and physical rules and can be changed by magic.

**Iron rules**

1. **This is a world of magic: no technological or astronomical terms appear.** Player-visible text (dialogue, UI, hints, the codex) must not use: solar eclipse (either spelling), lunar eclipse, totality, celestial body, planet, satellite, orbit, gravitation, gravity, tides, revolution, rotation, astronomy, universe, physics, chemistry, technology, energy, system, data, pixel, BUG, and so on. The moon blocking the sun is described only in in-world words: **月轮 (moon-disc), 日轮 (sun-disc), 月帷 (the Moonveil), 帷下 (under the veil), 常夜 (Evernight), 薄暮 (Dusk), 曦光 (Dawnlight), 金环 (golden ring)**.
2. **Original.** Do not copy characters, names, UI, icons, music or levels from any existing game. You may borrow the feel of the "toon-shaded open world + elemental interaction" genre.
3. **No hard-coded text.** Code must not contain any player-visible string literal: put it all in `src/locales/zh-CN/<system-name>*.js` and fetch it with `t('namespace.key', {params})` (see §5.5). For now there is only Simplified Chinese; the tone is a gentle, Japanese-style fairy tale with a touch of haikai wit. Other languages will be added later.
4. Runtime: Chrome / Electron (macOS). Only three.js(0.187) + @dimforge/rapier3d-compat(0.21). No other runtime dependencies, no network access.
5. Assets: models/audio come from `assets/` (openly licensed; see `assets/manifest.json` and `CREDITS.md`); everything else is generated in code.

## 1. Setting

### 1.1 Dawnmoon Isle
In the primordial age, the sun-disc and the moon-disc were a pair of sisters who took turns crossing the sky. Later, deep beneath the earth, a light-devouring great demon arose: **「无明」** (Mumyo, "Ignorance"). It feeds on sunlight and grows bigger the more it eats. To starve it, the moon goddess **Oboro** nailed the moon-disc to one spot in the sky, right between the sun-disc and Mumyo. From then on the moon-disc no longer moved, the land under the moon's shadow never again saw the full sun, and people call this shadow the **Moonveil**.

- **Dawnlight Plains** (outside the veil, west): the sun-disc is whole; it is always a bright morning. The Sunward Shrine and Morning-glory Village are here.
- **Dusk Wood** (veil edge, centre): the moon-disc has bitten off half of the sun-disc; it is always dusk. Red maples and ginkgoes never shed their leaves; fox spirits live here.
- **Evernight Plains** (under the veil, east): the moon-disc covers the sun-disc completely, leaving only a **golden ring** of light leaking around its edge. People here live by ten thousand lamps, and the plants glow on their own.
- **Tsukuyomi Palace**: atop the stone peak at the heart of the veil, the moon goddess's old palace; Mumyo is sealed beneath the peak.

Mumyo is held down by four **great lanterns**: the Dusk Lantern (under the Thousand-Year Maple), the Mirror Lantern (Mirror-heart Islet in Mirror Lake), the Crystal Lantern (Starcrystal Field) and the Moon Lantern (Tsukuyomi Palace). What burns inside them is 「日火」 (Sunfire): sunlight carried in from outside the veil.

### 1.2 Story
Lately the great lanterns have been going dark one after another, and the street lamps of the Evernight Plains are going out with them. Mumyo has turned over; its breath condenses into **shades**, which seep outward along the edge of the Moonveil, and the dusk in Dusk Wood deepens year by year.

The Sunward Shrine has served the sun-disc for generations, and its shrine maidens can "invite" sunlight into talismans. The young shrine maiden **Akari** is entrusted by Granny Hiyori with the shrine's star-broom, and must carry Sunfire back into the four great lanterns. Along the way she learns the eight schools of spells from masters across the land, and at last, in Tsukuyomi Palace, faces the moon maiden **Oboroyo**, who is possessed by Mumyo, and then Mumyo itself.

The ending is not "driving away the night": the people of the Evernight Plains love their night. Akari lights the Moon Lantern, Mumyo falls back asleep, the Moonveil stops spreading, and the golden ring shines brighter than ever.

### 1.3 Characters
| id | Name | Role | Location | Teaches |
|---|---|---|---|---|
| akari | Akari | Heroine, apprentice shrine maiden of the Sunward Shrine | — | — |
| dango | Dango | Pipe fox (a small talking fox spirit; companion/hints) | Follows the heroine | — |
| granny | Granny Hiyori | Chief priest of the Sunward Shrine | anchor `granny` | Broom Call; Sun · Sun Radiance |
| himawari | Himawari | Senior sister, fire shrine maiden, cheerful and competitive | Kagura practice ground | Fire · Foxfire; Barrier (duel tutorial) |
| ushio | Ushio | Kappa girl living in the well of Morning-glory Village | The well beside anchor `village_elder` | Water · Ripple Pearl |
| kokonoe | Kokonoe | Mischievous sorcerer of Foxfire Village (a male fox) | anchor `fox_racer` | Wind · Whirlwind; Light Wings |
| kuzunoha | Kuzunoha | Elder of Foxfire Village | anchor `fox_elder` | Shikigami |
| rikka | Rikka | Yuki-onna of Frostview Peak | Wind Shrine | Ice · Frost Bloom |
| naru | Naru | Thunder child who plays taiko in Myriad-Lantern Town | anchor `town_racer` | Thunder · Thunderbolt |
| shoku | Shoku | Lantern-maker girl of Myriad-Lantern Town | anchor `town_lampmaker` | — (main-quest guide, shop) |
| banou | Banou | Stonemason hermit of Starcrystal Field | anchor `crystal_hermit` | Rock · Rock Rise |
| kagami | Kagami-hime | Ferry keeper of Mirror Lake (a moon retainer) | anchor `lake_ferryman` | Moon · Moon Pull |
| oboroyo | Oboroyo | Moon maiden of Tsukuyomi Palace, possessed by Mumyo | Tsukuyomi Palace | Final battle |

Other villagers, fox spirits, townsfolk and vendors are up to the story module.

## 2. Map

All coordinates and locations are in `src/data/world.js` (ids and coordinates only; names are in `src/locales/zh-CN/world.js`): `POI`, `ANCHORS` (exact positions of NPCs/mechanisms; nothing may be placed within 3.5 m of them), `ROADS`, `RIVERS`, `BRIDGES`, `STONE_LANTERNS`(12), `GREAT_LANTERNS`(4), `SKY_ISLES`(14 floating islands), `FLATTEN`. +x is east, +z south, +y up; units are metres; sea level is y=0. The land is an irregular disc of radius about 770.

Moonveil centre `VEIL=(380,-40)`: full night within radius 300, full day beyond 620, dusk in between. `veilAt(x,z)`: 0 = Dawnlight, 1 = Evernight.

| Location | Coordinates | Notes |
|---|---|---|
| Sunward Shrine | (-540, 40) hilltop platform h=30 | Spawn point; the worship hall stands on the north side facing south, the torii and stone steps are to the south |
| Kagura practice ground | (-600, -22) | Combat/duel tutorial |
| Morning-glory Village | (-455, 150) | Farming village: water wheel, rice paddies, sunflowers |
| Sunflower Hill | (-620, -140) | Sea of flowers; painter side quest |
| Whitewave Cape | (-380, 560) | Headland on the south coast |
| Frostview Peak / Wind Shrine | summit (-20, -540) h=176 | Snowy mountain; the ice master |
| Mistview Spring | (-150, -250) | Source of the Dusk River |
| Foxfire Village | (-70, 90) | Fox-spirit village, thousand torii gates |
| Thousand-Year Maple (Dusk Lantern) | (-30, -170) | First great lantern |
| Mirror Lake / Mirror-heart Islet (Mirror Lantern) | (120, 400) | Second great lantern |
| Myriad-Lantern Town | (205, -125) | Town of the Evernight, night market, hub |
| Glowcap Wood | (400, 210) | Forest of giant glowing mushrooms |
| Starcrystal Field (Crystal Lantern) | (545, -275) | Third great lantern |
| Moon Pool / Tsukuyomi Palace (Moon Lantern) | (380, -40) summit h=140 | A ring-shaped pool around the stone peak; the finale |
| Darktide Shore | (690, 60) | East coast |

## 3. Gameplay

### 3.1 Controls (action names from `src/core/input.js`)
| Action | Key | action |
|---|---|---|
| Move | WASD | forward/back/left/right (`input.moveX/moveY`) |
| Look | Mouse (pointer lock; drag while held when not locked) | `input.lookX/lookY` |
| Jump / broom ascend / hold in mid-air to spread Light Wings | Space | jump |
| Descend (broom) | C / Ctrl | descend |
| Sprint / broom boost | Shift | sprint |
| Dodge (dash with invincibility frames) | Q | dodge |
| Talisman (basic attack; hold for auto-fire) | Left click | attack |
| Cast the selected spell (tap = small form; hold to charge and release = big form) | Right click | cast |
| Select spell | 1–8 / scroll wheel; hold Tab for the spell wheel | el1…el8 / wheel |
| Barrier (block; parry at the instant it opens) | R | guard |
| Broom Call (summon/dismiss the broom) | F | broom |
| Interact | E | interact |
| Eat dango to heal | X | heal |
| Summon shikigami | Z | summon |
| Golden Ring (ultimate, when 「契」 (Pact) is full) | G | ultimate |
| Lock on | Middle mouse button / T | lock |
| Map / journal / spellbook / pause | M / J / B / Esc | map / journal / spellbook / pause |

### 3.2 The eight aspects (elements) and how all things interact
Element ids: `fire`, `water`, `ice`, `wind`, `thunder`, `earth` (Rock), `sun`, `moon`.

**Materials** (everything that can react has one): `grass` (grass/leaves), `wood`, `paper`, `cloth`, `stone`, `metal`, `ice`, `crystal`, `water`, `flesh` (living creatures), `spirit` (spirit bodies), `shade` (shadow).

**States**: `burning`, `wet`, `frozen`, `shocked`, `lit` (bright: being illuminated).

**Reaction table** (the behaviour of `G.elements.apply`, shared by all spells and the environment):

| Applied | Target state/material | Result |
|---|---|---|
| Fire | Grass/wood/paper/cloth (dry) | Ignites; burning spreads to adjacent flammables and grass, faster downwind |
| Fire | Wet | Dries it out (steam), does not ignite |
| Fire | Frozen / ice | Melts → becomes wet; ice blocks melt into a splash of water |
| Fire | Shade | Extra damage (shades fear light and fire) |
| Water | Burning | Extinguishes + steam |
| Water | Anything | Wet for 12 seconds (wet things won't ignite, conduct electricity, freeze more easily) |
| Water | Lamp/brazier | Extinguishes |
| Ice | Wet living creature | Frozen (6 seconds; a heavy hit shatters it for 3× damage) |
| Ice | Water surface | Forms floating ice you can stand on (melts after about 30 seconds, faster near fire) |
| Ice | Burning | Extinguishes |
| Wind | Rigid body / light object / living creature | Pushes away, blows away; paper and cloth fly farthest |
| Wind | Burning | Fire spreads downwind; small fires may be blown out |
| Wind | Shade miasma (fog) | Disperses |
| Thunder | Wet / water surface / metal | Shocked, chaining to other conductors within 8 m |
| Thunder | Dry tree/wood | Splits and ignites |
| Thunder | Stone / crystal | Shatters |
| Rock | Frozen | Shatters (3× damage) |
| Rock | Ground | Raises a rock pillar / Meteor blasts a crater (`G.world.deform`)|
| Sun | Shade / shade miasma | Purifies (2× damage, disperses) |
| Sun | Lamp / great lantern | Lights |
| Sun | Crystal | Refracts, resonates and glows (puzzles) |
| Sun | Frozen | Slowly thaws |
| Moon | Rigid body | Can be grabbed by 「月引」 (Moon Pull) |
| Moon | Shade | Shades grow stronger in moonlight (don't use Moon on them) |

**Knock-on rules**: there is an updraft above anything burning (Light Wings gliding can ride it); inside rain (Rain Prayer) fires are continuously put out and everything gets wet; craters below sea level fill with water on their own; towns and the shrine have a **barrier** (`G.world.protectionAt`): the ground there can't be burned or cratered, but objects inside can still be interacted with.

**「契」**: every elemental reaction you trigger (steam, shattered ice, chain shock, purification, downwind fire...) builds up 「契」; when it is full you can unleash the ultimate spell 「金环」 (Golden Ring). This encourages players to combine elements.

### 3.3 Spells
State lives in `G.state.spells[id]`: 0 not learned, 1 small form known, 2 big form known. `G.state.abilities` records non-elemental abilities.

| id | Name | Small form (tap) | Big form (charged) |
|---|---|---|---|
| charm | Talisman | Left click: homing paper talisman, slightly Sun-aligned, no cost | — |
| fire | Fire | **Foxfire**: fireball, blast radius 3, ignites. Mana 12 | **Flame Dance**: big fireball, radius 7, leaves a ring of fire. 30 |
| water | Water | **Ripple Pearl**: water orb, splash radius 4; extinguishes, wets, pushes lightly. 10 | **Rain Prayer**: calls a rain cloud of radius 18 to the target for 20 seconds. 28 |
| ice | Ice | **Frost Bloom**: ice lance, piercing; freezes wet targets; forms floating ice when it hits water. 12 | **Ice Mirror**: radius-8 ice burst at the target; raises an ice platform on land. 30 |
| wind | Wind | **Whirlwind**: 12 m cone gust ahead; knocks things flying, fans fire, deflects projectiles. 8 | **Tornado**: creates an updraft of radius 5 and height 40 at the target for 14 seconds. 26 |
| thunder | Thunder | **Thunderbolt**: strikes the crosshair point (within 40 m) after a 0.35-second warning. 16 | **Narukami**: five bolts within radius 10 plus one main bolt. 36 |
| earth | Rock | **Rock Rise**: raises a rock pillar of radius 2.4 and height 6 from the ground at the crosshair (can lift yourself or enemies; collapses after 25 seconds; at most 4). 14 | **Meteor**: a meteorite lands after 1.2 seconds, radius-9 blast, leaves a crater 4 deep. 45 |
| sun | Sun | **Sun Radiance**: a light burst of radius 9 around yourself; purifies shades, lights lamps, leaves a ball of light for 10 seconds. 20 | **Amaterasu**: hold to fire a continuous beam (22/second); colliding with an enemy beam starts a **beam struggle** |
| moon | Moon | **Moon Pull**: grabs the object (or small enemy) at the crosshair and holds it in front of you; right click again to throw, left click to drop. 6 + 4/second | **Moon Halo**: radius-10 slow-time field at the target for 8 seconds; enemies, projectiles and objects inside move at 25% speed. 34 |
| broom | Broom Call | F: summon the star-broom and fly on it. Cruising costs no mana; boosting and rapid climbs do | |
| wings | Light Wings | Hold Space in mid-air: wings of light unfold on your back for gliding; updrafts lift you | |
| guard | Barrier | R: light shield in front of you, 80% damage reduction; catching a projectile within 0.25 seconds of opening it parries it | |
| dodge | Dodge | Q: dash 6 m, 0.35 seconds of invincibility | |
| shikigami | Shikigami | Z: summon two paper cranes to fight alongside you for 30 seconds. 35 | |
| kinkan | Golden Ring | G: when 「契」 is full, call down a pillar of light from the golden ring in the sky, radius 14 | |

**Projectile clashes**: when friendly and enemy projectiles collide in the air they cancel out or explode according to the reaction table (fire × water = steam explosion, fire × ice = mutual cancel, thunder passing through a water orb chains...), and the stronger one keeps going with its remaining power. **Beam struggle**: when two continuous beams collide, a tug-of-war bar appears; mash left click to push, and the loser takes the explosion.

### 3.4 Numeric baseline
- Heroine: HP 100 (+20×5), mana 100 (+20×5). Walk 5.5 m/s, sprint 8.5, jump initial speed 7.5 (gravity 22), one double jump in mid-air.
- Mana regen: 6/second × sunlight (`G.env.light`); very slow in the Evernight, but +10/second within 14 m of a lit lamp. **Carrying light into the night** is the rhythm of the whole game.
- Broom: cruise 15 m/s, boost 26 (mana 12/second), dives trade height for speed (up to 1.18 × boost), climb 9 m/s, ceiling 300 m. With mana empty it slowly sinks.
- Talisman: 12 damage, 3 shots per second. For other spells, damage ≈ mana cost × 2.2.
- Shades are stronger in darkness (attack ×(1+0.5·veil)) and weaker and slower in light (`G.elements.lightAt`).

### 3.5 Enemies
Shades (material shade): **Shadow Blob** (slow, melee), **Shadow Wolf** (fast, pounces and bites), **Lamp Moth** (flies, spits dark bolts, drawn to light), **Will-o'-wisp** (floats, self-destructs and sets fires), **Crystal Golem** (heavy, stone material, slams the ground; Thunder/Rock can shatter its armour), **Shadow Witch** (caster; uses dark bolts plus one element and trades blasts with the player). The Dawnlight Plains only have mischievous **Paper Imps** (paper material; they catch fire at a touch).

Duelists (humanoid casters with the same spells as the player, who can trade blasts): Himawari (fire), Kokonoe (wind), Rikka (ice), Naru (thunder), Oboroyo (moon + everything).

Bosses: **Oboro Fang** (shadow-wolf king, Thousand-Year Maple), **Lamp-eater Moth** (giant moth, Mirror-heart Islet), **Oboroyo → Mumyo** (Tsukuyomi Palace, two phases).

### 3.6 Main quest
| Quest id | Content |
|---|---|
| m0_shrine | Prologue. Wake up at the shrine → Granny teaches Talisman and Sun Radiance → purify paper imps at the practice ground → tutorial duel with Himawari (learn Fire, Barrier) → open the chest to get the star-broom and fly through 6 trial rings |
| m1_village | A haystack catches fire in Morning-glory Village → learn Water from Ushio → put out the fire (element tutorial)|
| m2_dusk | Cross the Dusk Bridge into Dusk Wood → meet Kuzunoha in Foxfire Village; Kokonoe teaches Wind and Light Wings → clear three shadow nests around the Thousand-Year Maple (burn away the shadow thorns) → defeat Oboro Fang → light the **Dusk Lantern** with fire |
| m3_town | Enter the Evernight → meet Shoku in Myriad-Lantern Town; the town's lantern tower has gone out: fetch three clusters of fireflies from Glowcap Wood → the town lights up again and the shops open; learn Thunder from Naru |
| m4_mirror | Mirror Lake: Kagami-hime teaches Moon Pull → light three lotus lamps on the lake (floating ice or broom) → defeat the Lamp-eater Moth → light the **Mirror Lantern** |
| m5_crystal | Starcrystal Field: turn three crystal pillars with Moon Pull/sunlight so the light converges on the lantern (crystal golems attack meanwhile) → light the **Crystal Lantern**; Banou teaches Rock |
| m6_moon | With all three lanterns lit, the moon barrier around Tsukuyomi Palace dissolves → fly up the stone peak → duel Oboroyo → Mumyo → light the **Moon Lantern** → ending |

Side quests: find five lost fox cubs, three broom races, relight twelve stone lanterns, the village children's kite (floating islands), night-market ingredients, the painter on Sunflower Hill, learning Ice on the snowy mountain (Rikka), ten ema votive plaques (lore fragments), twenty-four Moon Tears (hidden collectible; every 4 buy one upgrade).

### 3.7 Saving
All progress lives in `G.state` (see `defaultState()` in `src/core/save.js`; new persistent fields must be added there). Checkpoints: the shrine's purification fountain, each village's save lamp, lit stone lanterns. On death you respawn at the nearest checkpoint. Terrain craters are not saved (the land heals itself).

## 4. Art

- **Look**: a toon-shaded open world: soft colour blocks, three or four shading steps, big swathes of grass swaying in the wind, light haze in the distance, bloom. No realistic PBR.
- **Materials**: always use `src/core/mats.js`: `toon(color)` (default), `flat(color)` (hard surfaces for rock/roofs/crystals), `glow(color, strength)` (emissive and triggers bloom: lamp paper, glowing mushroom caps, eyes, magic). Palette `PAL`.
- **Lit materials you `new` yourself** (terrain shaders, instanced vegetation, water surfaces and so on that don't come from `toon/flat`) must call `hookMaterial(mat)` (`core/mats.js`): the sky system uses this hook to inject "veil shading" into every material (so even standing in sunlight you can see that the distant land under the veil is dark) plus the shadow settings. Emissive/unlit materials don't need it.
- **Geometry**: `box/cyl/cone/sphere/ico/torus/grp` from `src/core/geo.js`; static objects assembled from several primitives **must** be merged with `bakeStatic(group)` before being added to the scene.
- **Palettes of the three regions**: Dawnlight Plains = bright grass green + warm white sunlight; Dusk Wood = orange-red maple leaves + golden slanting light + purple shadows; Evernight Plains = deep blue and dark green base, lit by cyan/purple/pink emissives and warm orange lamplight, with the golden ring hanging in the sky. Brightness transitions continuously with `G.env.veil`.
- **The night must stay readable**: ambient light on the Evernight Plains must not drop to pitch black; the heroine carries a lamp.
- Light units are physical units (three r155+): sunlight DirectionalLight intensity about 2–3; point lights `PointLight(color, intensity 20–200, distance, 2)`. At most 6 dynamic point lights on screen (convey "brightness" with `glow` materials + bloom; don't give every lamp a real light).
- External models are fetched via `G.assets.model(id)` and are already converted to toon materials automatically. For the list see §4.1 (to be completed once asset scouting is done).

### 4.1 Asset list
The full list, with notes for every item, is in `assets/manifest.json` (read with `G.assets.info(id)`); source and licence are in each item's `license/author/source`.
- **Characters (in the repo)**: all are anime-style humanoids of one family (recoloured CC0 VRoid samples), sharing one bone-naming scheme and one animation library.
  - Heroine `char_akari` (1.55 m). Supporting cast: `char_granny`, `char_himawari`, `char_ushio`, `char_kokonoe`, `char_kuzunoha`, `char_rikka`, `char_naru`, `char_shoku`, `char_kagami`, `char_oboroyo`, `char_villager_a`, `char_villager_b`, `char_villager_c`, `char_fox_a`, `char_fox_b`, `char_town_a`, `char_town_b`.
  - Animation library `anim_ual` (84 animations, played in place with no root motion; `G.assets.clips('char_xxx')` merges it in automatically). Which animation each state should use, the height conventions for sitting/swimming,
    and that non-heroine characters need their hips translation track scaled by `hipsHeight/0.887`: all of this is in `anim_ual.notes` / `clips` in `assets/manifest.json`. **Read it before use**.
  - Each character's `bones` (bone names for head/chest/hips/handR/handL/spine), `morphs` (expressions: blink, joy/anger/sorrow and so on) and `hipsHeight` are in the manifest.
  - Props `prop_gohei` (gohei wand), `prop_broom` (star-broom, with a small lantern hanging from its tail).
  - Humanoid shades (Shadow Witches) reuse these characters with an all-black material + glowing eyes.
- **Vegetation / buildings and objects / creatures / audio**: being organised; once in the repo they also go into `assets/manifest.json` (prefixes tree_ plant_ rock_ nat_ bld_ prop_ mon_ ani_ tex_ bgm_ amb_ sfx_).

## 5. Technical architecture

### 5.1 Directories and ownership
```
build.mjs                 build (index.html + game.js + assets/)
systems.manifest.json     system list: init order = per-frame update order
tools/play.mjs            headless Chrome run/script/screenshot (§7)
tools/glbview.mjs         model inspection and preview
assets/                   manifest.json + models/ audio/ textures/
src/core/                 [core, finished, do not modify] game boot input events save interact assets mats geo util fallback i18n
src/locales/zh-CN/        strings: core.js world.js [core] + each system's own <system-name>*.js
src/world/ground.js       [core] terrain height, platforms, colliders, terrain deformation, regions
src/world/veil.js         [core] Moonveil rules, sun/moon directions
src/data/world.js         [core] map data
src/<system>/…            the systems (one directory per system; ownership per the manifest)
```
System order: `fx, audio, ui, physics, elements, sky, terrain, flora, structures, props, gameplay, player, spells, combat, story`.

### 5.2 System object
```js
// src/<dir>/<name>.js
import { G } from '../core/game.js';
export const fooSystem = {
  name: 'foo',
  pausable: true,                 // false = still receives real dt while the pause menu is open (ui/audio)
  async init(G) {},               // build static content and attach the public API to G.foo. G.state holds only defaults at this point; don't read save contents
  start(G) {},                    // called once after the title screen, when G.state is the final save/new game: restore your own state from the save
  update(dt, rdt) {},             // every frame. dt = game time step (0 while paused), rdt = real step
  lateUpdate(dt, rdt) {},         // after the camera update. World→screen projection goes here
};
```
Per-frame order: `env refresh → each system's update → G.interact.update → G.cam.update(dt, rdt) → each system's lateUpdate → G.renderFrame() → input.endFrame`.

**Rules**
- Always access other systems through optional chaining: `G.fx?.burst(...)`, `G.audio?.sfx(...)`, `G.ui?.toast(...)`. No system may crash when any other system is absent (subset builds rely on this).
- In `update`: don't throw, don't `new` lots of objects per frame (reuse temporary vectors), don't walk the whole scene every frame.
- Don't cache references to `G.state` or its sub-objects (the whole object is replaced when a game starts).
- Mode `G.mode`: `title | play | talk | menu | cutscene | ending`. Only in `play` can the player act and enemies move; in `menu` dt=0. Switch with `G.setMode()`.
- To make the frame freeze for a beat: `G.hitstop(0.06)`.
- Report errors with `G.reportError('where', err)` (tests read `G.errors`).
- URL parameters (for testing): `autostart=1` skips the title and writes no save; `pos=x,z`; `cam=px,py,pz,tx,ty,tz`; `quality=low|med|high`; `mute=1`.
- Quality `G.quality = { pixelRatio, shadowSize, bloom, density, particles, viewDist }`; multiply count-type parameters by it.

### 5.3 Core API quick reference (implemented)
```js
G.world.heightAt(x,z)            // terrain height (with deformation)      baseHeightAt excludes deformation
G.world.groundAt(x,z,y=∞)        // standable surface underfoot: terrain, or a platform top no higher than y+0.7
G.world.normalAt / slopeAt / isWater(x,z) / sample(x,z)->{h,veil,slope,road,river,region,water}
G.world.veilAt(x,z) / daylightAt / regionAt / majorAt / roadDist / riverDist / mountainMask
G.world.isReserved(x,z,pad)      // settlement/anchor/road/bridge/lamp spot: no vegetation or clutter may be scattered here
G.world.protectionAt(x,z)        // 0..1 barrier strength; isProtected(x,z)
G.world.deform(x,z,r,amount,{rim}) // reshape terrain (negative = dig a crater, positive = raise), emits 'terrain:deformed'
G.world.addPlatform({x,z,r,top}|{box:true,x,z,hw,hd,rot,top})   // standable surface (floating islands, bridge decks, plinths, roofs)
G.world.addCollider({x,z,r,y0,y1}|{box:true,x,z,hw,hd,rot,y0,y1}) // lateral blocker (walls, pillars, tree trunks, boulders)
G.world.resolveCollisions(pos, radius, height)  // pushes a vertical capsule out of all colliders
G.world.raycastGround(origin, dir, maxDist)     // stepped intersection against terrain + platforms
G.world.anchor(id) -> Vector3    G.world.at(x,z) -> Vector3   G.world.POI / ANCHORS / SKY_ISLES / ...
G.env = { veil, light, region, regionName, major, focus, sunDir, moonDir }
G.input.held/pressed/released(action)   moveX moveY lookX lookY wheel locked   consume(action)   keyLabel(action)
G.events.on(name, fn) -> off     emit(name, payload)     once
G.save.write() / load() / exists()      addItem(G,id,n) itemCount setFlag hasFlag   (imported from core/save.js)
G.interact.add({ pos|getPos, radius, prompt, onInteract, enabled, priority, broom }) -> { remove() }
G.assets.model(id) / clips(id) / has(id) / info(id) / load(id) / arrayBuffer(id) / texture(id) / toonify(obj)
G.hitstop(sec)   G.setMode(mode)   G.reportError(where, err)   G.debug.teleport(x,z,y) / setCam(...) / stats()
```

### 5.5 Text and localisation (i18n)
```js
import { t, raw, has, onLocaleChange } from '../core/i18n.js';     // also available as G.t
t('ui.hud.mana')                          // -> '灵力' (Mana)
t('gameplay.got', { item: name, n: 3 })   // the string entry reads '获得 {item} ×{n}' (Got {item} ×{n})
raw('story.dlg.granny_intro')             // fetch structured data (arrays/objects); use this for dialogue scripts and lists
```
- String files: `src/locales/zh-CN/<namespace>.js`, `export default { key: 'text', group: { key: '…' }, list: [ … ] }`. **The file name is the namespace and must start with the name of the owning system**: `ui.js`, `story.js`, `story.quests.js`, `spells.js`… (`core.js` and `world.js` belong to core). They are discovered automatically at build time with no manual registration; subset builds only bring along the strings of the selected systems.
- Place names: `t('world.place.' + id)` (shared by region ids and POI ids), subtitles `t('world.sub.' + id)`; element names `t('core.element.fire')`; status names `t('core.status.wet')`; for key names use `G.input.keyLabel(action)`.
- Call `t()` **at the moment the text is displayed**; don't evaluate it at module top level and store it as a constant (the language can be switched at runtime; the UI listens to `onLocaleChange` and redraws).
- Long text such as dialogue/quests/codex entries: structure and text both live in the string file (each line `{ who, text }`, choices, and logic hooks referenced by id such as `{ do: 'give_broom' }`); code only runs hooks by id. Translators change only `text`.
- Fonts: the title/body font stacks come from `t('core.meta.fontTitle')` / `t('core.meta.fontBody')` (set as CSS variables); don't hard-code font names in styles.
- Check: `node tools/check-i18n.mjs src/your-dir`: any Chinese/Japanese characters in code (comments excepted) are an error; the §0 banned words in strings are also an error. Must pass before delivery.

### 5.4 Event table
The emitter is responsible for emitting in this format; listeners rely only on these fields.
```
game:start {loaded}            mode:changed {mode,prev}        region:enter {id,name,prev,major}
resize {w,h}                   settings:changed settings        save:collect state / save:done
input:lockLost / input:lockGained
terrain:deformed {x,z,r,amount,x0,x1,z0,z1}                    terrain:scorch {x,z,r,kind:'burn'|'wet'|'frost'}
inventory:changed {id,count,delta}    flag:set {name,value}
player:jump / player:land {speed} / player:step {surface} / player:dodge / player:mount / player:dismount / player:glide {on}
player:damaged {amount,element,from} / player:died / player:respawn / player:healed {amount}
player:outfit {id}             // outfit has finished changing (src/player/wardrobe.js; docs/api/heroine.md "Wardrobe")
spell:cast {caster,spell,form,pos,dir,team} / spell:learned {id,level} / spell:select {id}
spell:clash {pos,a,b,result}   beam:struggle {state:'start'|'end', winner}
element:applied {element,pos,radius,power,team} / element:reaction {type,pos,power}   // type: steam melt shatter conduct ignite extinguish purify freeze thaw
element:ignite {reactor} / element:burnout {reactor}
physics:impact {body,other,speed,pos}       prop:broken {type,pos,by}
enemy:spawned {enemy} / enemy:hit {enemy,amount,element,pos} / enemy:killed {enemy,type,pos,by}
boss:start {id,name} / boss:phase {id,phase} / boss:defeated {id}        duel:start {id} / duel:end {id,won}
item:collected {id,kind,pos}   lantern:lit {id} / lantern:out {id}   greatlantern:lit {id}   checkpoint {id}
quest:started {id} / quest:updated {id,step} / quest:completed {id}
dialogue:start {id} / dialogue:end {id}      race:start {id} / race:finish {id,time,best}
```

## 6. Module contracts

> Signatures are the contract; how things work inside is up to the owner. Entries marked ★ are entry points other modules will certainly call; their names and parameters must not change.

### 6.1 physics (`src/physics/`) → `G.physics`
Rapier world; fixed step 1/60 (accumulator, at most 4 steps per frame, no stepping when dt=0); interpolated mesh sync.
```js
G.physics.RAPIER, .world
★ add({ mesh, shape:'box'|'sphere'|'cylinder'|'capsule'|'hull', size, pos, quat?, type:'dynamic'|'fixed'|'kinematic',
        material:'wood'|'stone'|'metal'|'ice'|'paper'|'cloth'|'flesh', density?|mass?, friction?, restitution?,
        ccd?, lifetime?, group:'prop'|'debris'|'character'|'projectile', owner?, onImpact?(other, speed) }) -> PhysBody
   // size: box=[hx,hy,hz] sphere=r cylinder/capsule={r,h} (h is the total height) hull=convex hull computed from the mesh geometry
★ remove(body)
   PhysBody { rb, mesh, mass, material, owner, pos:Vector3(read-only mirror), vel:Vector3(read-only mirror), sleeping, submerged(0..1),
              applyImpulse(v3), applyImpulseAt(v3, point), setVelocity(v3), setPosition(v3), setKinematicTarget(pos, quat?),
              wake(), held(true while grabbed by Moon Pull) }
★ explode(pos, radius, impulse, {up=0.35, exclude}) -> PhysBody[]      // radial impulse, linear falloff
★ pushCone(origin, dir, range, halfAngle, impulse) -> PhysBody[]       // gust
★ raycast(origin, dir, maxDist, {dynamicOnly=false, exclude}) -> {dist, point, normal, body|null} | null   // includes terrain and static bodies
★ overlapSphere(pos, r, cb(body))
★ supportAt(x, z, y, maxDrop=1.6) -> {y, body} | null    // nearest rigid-body top surface underfoot (standing on crates/floating ice/logs/rock pillars)
★ addCharacter({ getPos, radius, height, owner }) -> handle{remove()}   // kinematic capsule that follows a character, so objects bump into it / are pushed away by it
   count, maxDynamic(≈260; beyond that the oldest debris is removed first)
```
- Terrain: height fields are built lazily in chunks around "active points" (the player + awake rigid bodies); listens for `terrain:deformed` and rebuilds the affected chunks.
- Static bodies: automatically mirrors everything registered with `G.world.addCollider/addPlatform` (what exists at init plus anything added later; entries with `dead=true` are removed).
- Buoyancy: the part below sea level gets buoyancy and drag proportional to the submerged volume (densities: wood 0.55, paper 0.2, ice 0.9, stone 2.6, metal 7); `submerged` is there for others to read.
- Wind: each step applies the force of `G.elements?.windAt(pos)` to awake rigid bodies (light objects move noticeably, heavy ones barely).
- Moon Halo slow-time: rigid bodies inside `G.physics.timeBubbles` (filled by spells) have their speed clamped to 25%.
- Strong collisions emit `physics:impact` (speed > 4 m/s, throttled).

### 6.2 elements (`src/elements/`) → `G.elements`
```js
ELEMENTS, MATERIALS   // constants, and each material's default properties { flammable 0..1, burnTime, conductive, freezable }
★ register({ owner, kind:'prop'|'tree'|'plant'|'creature'|'lantern'|'structure'|'hazard', material, pos|getPos, radius, height?,
             team?:'player'|'enemy'|'neutral', flammable?, burnTime?, conductive?, freezable?, immune?:[status...],
             on:{ ignite, extinguish, burnTick(r,dt), burnout, wet, dry, freeze, thaw, shock(r,power), hit(r,element,power,info), light(r,power) } }) -> Reactor
★ unregister(reactor)
   Reactor { owner, material, burning, wet, frozen, shocked, lit,   // seconds remaining, or 0/false
             ignite(), extinguish(), soak(sec), freeze(sec), thaw(), shock(power), is(status) }
★ apply(element, pos, radius, power=1, info={ source, team, dir, damage?, noGround? }) -> Reactor[]   // the single entry point: processes everything in range per the §3.2 reaction table
★ igniteGround(x,z,r) / extinguishGround(x,z,r) / isBurningAt(x,z) / fireCount
★ rain(x,z,r,duration) / isRainingAt(x,z)
★ addWind({ kind:'updraft'|'gust', pos, dir?, radius, height, strength, duration }) -> handle{remove()}
★ windAt(pos, out) -> Vector3        // global breeze + wind fields + updrafts above fires
★ freezeWater(x,z,r,duration=30) -> spawns floating ice (rigid body + standable)
★ lightAt(pos) -> 0..1               // sunlight + burning things + lit lamps + light orbs; shades use it to judge their strength
★ addLight({ pos, radius, duration? }) -> handle   // register a light source (a lit lamp, the ball of light left by Sun Radiance)
   query(pos, r, cb(reactor)) / nearest(pos, r, filter)
   gauge accumulation is done by spells itself, by listening to 'element:reaction'
```
- Grass fire: 2 m cells; only burning cells are tracked (a Map); spread is affected by wind direction, wetness, rain and barriers; cap of ≈ 420 cells burning at once; burned cells emit `terrain:scorch`. Flames are drawn with its own instanced billboards and carry a few (≤4) dynamic point lights of their own.
- Damage is not resolved here: it is handed to the owner through the `on.hit / on.burnTick / on.shock` callbacks (the player, enemies and objects each subtract HP / break on their own). `info.damage` is the base damage supplied by the applier.
- Every reaction emits `element:reaction` and calls `G.fx?.burst('steam'|…)` and `G.audio?.sfx(...)`.

### 6.3 fx (`src/fx/`) → `G.fx`
GPU particle pools (additive and soft kinds, ≤ 8000 particles), trails, shock rings, beams, flashes, screen shake.
```js
★ burst(name, pos, opts?)          // one-shot effect; unknown names are silently ignored (warns only once)
★ emitter(name, opts?) -> { pos:Vector3, dir?:Vector3, rate, active, stop(), remove() }   // continuous emitter; change pos to move it
★ trail(opts) -> { push(pos), stop() }          // ribbon trail (broom, talismans, Light Wings)
★ ring(pos, { color, radius, dur, y? })         // ground-hugging expanding ring
★ beam(opts) -> { set(from, to), setWidth(w), remove() }   // continuous beam (Amaterasu / beam struggle)
★ lightning(from, to, { color, branches, dur })
★ flash(pos, color, intensity, dur, distance?)  // temporary point light (pooled, ≤4)
★ shake(amount, dur?)                           // screen shake (respects G.settings.shake); the camera reads G.fx.shakeOffset
★ text(pos, string, { color, size, dur })       // world-space floating text (damage numbers and so on)
```
Required burst names: `hit_sun hit_dark hit_fire hit_water hit_ice hit_wind hit_thunder hit_earth hit_moon purify steam splash shatter_ice shatter_rock wood_break dust land jump dash pickup heal levelup ignite extinguish explosion explosion_big spark leaves petals feathers magic_circle summon charge_done lantern_ignite greatlantern meteor_trail crater boss_death clash clash_big`.
Required emitter names: `flame smoke embers rain snow fireflies spores pollen maple_leaves broom_sparkle wing_dust aura_<element> updraft waterfall_mist miasma`.
Ambient particles: maintained automatically around the heroine according to `G.env.major` (Dawnlight: pollen and petals; Dusk: falling leaves; Evernight: fireflies and spores).

### 6.4 audio (`src/audio/`) → `G.audio`
WebAudio; `resume` after the first user input; muted when `G.params.mute`; volumes are read from `G.settings`.
```js
★ sfx(name, { pos?, vol=1, pitch=1, delay? })     // unknown names are silently ignored; with pos, distance attenuation/panning apply
★ loop(name, { vol, pos? }) -> { setVol(v), setPos(p), stop(fade?) }
★ music(mood | null, { fade=2 })                  // usually no need to call it by hand: the system switches automatically by G.env.major, G.env.region and combat/boss events
   unlock(), setVolumes()
```
Tracks and sound effects come from `assets/` (id prefixes `bgm_ amb_ sfx_`); missing ones fall back to procedural synthesis. Automatic ambience: wind, birds, insects, water (near rivers and lakes), fire (near burning things), broom wind (scales with speed).

### 6.5 ui (`src/ui/`) → `G.ui`
DOM overlay (`G.uiRoot`). Japanese picture-scroll style in washi paper, ink, vermilion and gold; the title font uses the system Song/Mincho typefaces (`"Songti SC","Hiragino Mincho ProN","Noto Serif CJK SC",serif`).
```js
★ showTitle({ hasSave, saveInfo }) -> Promise<'new'|'continue'>      // title screen (with settings and controls help)
★ toast(text, { icon?, dur=3 })           ★ banner(title, subtitle?)        // region entry banner
★ prompt(text | null)                      // interaction prompt at the bottom of the screen (called by core interact)
★ say({ name, text, portrait?, choices?:[string], side? }) -> Promise<number|undefined>   // dialogue box, typewriter effect, advance with E/Space/click
★ setTracker({ title, objective, progress? } | null)                // current quest tracker
★ setMarkers([{ id, pos:{x,y,z}, icon, color, label?, kind:'quest'|'lantern'|'npc'|... }])   // compass bar + screen-edge indicators
★ bossBar({ name, hp, max, sub? } | null)  ★ duelBars(...) may be merged into bossBar
★ struggle({ value:0..1 } | null)          // beam-struggle tug-of-war bar
★ fade(alpha, dur) -> Promise              ★ letterbox(on)                  // cutscene letterbox bars
★ openShop({ title, items:[{id,name,desc,price,icon,owned?,max?}], currency:()=>number, onBuy:(id)=>boolean }) -> Promise
★ openMenu(tab?:'map'|'journal'|'spells'|'items'|'wardrobe'|'settings') / closeMenu() / isOpen     // wardrobe = outfit page (src/ui/wardrobe.js)
★ learnSpell({ id, name, desc, element })  -> Promise                // big-lettering presentation for learning a spell
★ showEnding(data) -> Promise
   providers: { journal:()=>[{id,title,desc,state,main,objectives:[{text,done}]}], mapMarkers:()=>[{x,z,icon,label,kind}],
                items:()=>[{id,name,desc,count,icon}], lore:()=>[{id,title,text}], spells:()=>[{id,name,desc,level,element}] }
```
The HUD reads on its own every frame: `G.player` (hp/maxHp/mana/maxMana/onBroom/gliding/status), `G.state.inventory`, `G.spells?.selected/list/gauge/charge`, `G.combat?.lockTarget`, `G.env`. The crosshair is always shown. Esc / losing pointer lock → pause menu. When a menu opens: `G.setMode('menu')` and `G.input.exitLock()`.

### 6.6 sky (`src/world/sky.js`, `src/render/`) → `G.sky`, `G.lights`
Sky-dome shader: the sun-disc is fixed (`SUN_DIR`); the moon-disc's position changes with the viewpoint (`G.env.moonDir`); when the moon-disc covers the sun-disc only the golden ring and the corona remain. With `G.env.veil` it goes from clear sky → dusk → starry night (stars, the Milky Way, curtain-like aurora around the golden ring); there is a cloud layer with a volumetric feel. Lights: sunlight, hemisphere/ambient light, height-attenuated fog, all transitioning with veil.

Render pipeline (tiered by `G.quality`, everything can be turned off in settings): **cascaded soft shadows** (3 cascades: sharp up close, distant mountains cast shadows too), **screen-space ambient occlusion** (GTAO), **bloom**, **volumetric light shafts** (radial shafts in the direction of the sun-disc/golden ring; in the Evernight they pour down from the golden ring), **depth of field** (cutscenes/dialogue only), **tone mapping + a grade per region** (Dawnlight bright and crisp, Dusk warm gold with a touch of purple, Evernight cool cyan), anti-aliasing (SMAA/FXAA). Water reflections are the job of terrain/water (planar reflection or screen-space reflection + Fresnel). Replaces `G.renderFrame`; the post chain is exposed as `G.post = { composer, setDOF(on, focusDist), setGrade(name), enabled }`.
```js
G.lights = { sun, hemi, ambient? }      G.sky.flash(color, dur)      G.sky.setRingBoost(k)   // the golden ring blazes for the ending
G.sky.setWeather({ rainAt? })  optional   G.sky.exposure
```

### 6.7 terrain / flora / structures / props
- **terrain** (`src/world/terrain.js`, `water.js`): generates the terrain mesh from `heightAt` (fine near, coarse far, or chunked); vertex colours by biome/veil/slope/road/snowline; listens for `terrain:deformed` for local updates (bare earth colour exposed inside craters) and for `terrain:scorch` to recolour; water shader (sea, lakes, rivers, Moon Pool; faint shimmer under the Evernight). `G.terrain.refresh(x0,x1,z0,z1)`.
- **flora** (`src/world/flora.js`): instanced vegetation (each region's trees, shrubs, flowers, giant mushrooms, crystal clusters, rocks) + dynamic grass around the heroine; tree trunks/boulders register colliders; **every tree and every breakable rock is an elemental reactor**: it can be ignited (burns to charred wood), felled by lightning/Meteor/strong wind (spawning a `log` rigid body, see props), and rocks can shatter; vegetation inside craters disappears. Avoids `G.world.isReserved`.
  `G.flora.treesNear(pos, r)`, `G.flora.fell(tree, dir)`, `G.flora.removeInRadius(x,z,r)`.
- **structures** (`src/world/structures.js`, `builders/`): the shrine, villages, Foxfire Village, Myriad-Lantern Town, Tsukuyomi Palace, the Wind Shrine, bridges, floating islands (top surfaces registered as platforms), piers, the giant Thousand-Year Maple and so on; registers colliders and platforms; window paper/lanterns use `glow`. Model factories exported for others: `makeStoneLantern()`, `makeGreatLantern()`, `makePaperLantern()`, `makeTorii()`, `makeChest()`, `makeSignpost(text)`, `makeRaceRing()`, `makeBrazier()`: all return small objects along the lines of `{ group, setLit?(on) }`.
- **props** (`src/props/`) → `G.props`: catalogue of interactive objects (wooden crates, barrels, firecracker barrels, water jars, clay pots, haystacks, logs (log), rolling boulders, iron balls, iron crates, carts, braziers, wind chimes, shrine bells, lanterns, pumpkins, apples…); each = model + rigid body + reactor + durability/breaking (fragments are short-lived debris rigid bodies) + drops.
  `★ G.props.spawn(type, pos, { rot?, vel?, burning?, persistent? }) -> Prop`, `G.props.types`, `G.props.near(pos, r)`, `prop.damage(n, info)`, `prop.break()`. Placed from data in settlements and in the wild.

### 6.8 player (`src/player/`) → `G.player`, `G.cam`
```js
G.player = { group, pos(=group.position), vel, yaw, hp, maxHp, mana, maxMana, dead,
  state:'ground'|'air'|'glide'|'broom'|'swim'|'frozen'|'cutscene', grounded, onBroom, gliding, speed,
  radius:0.4, height:1.6, team:'player', reactor,           // reactor registered with elements (can burn/get wet/freeze/be shocked)
  aim: { origin, dir, point, dist, target },                 // world point/target hit by the crosshair ray, updated every frame
  ★ takeDamage(amount, { element?, from?, knock?, source? }), ★ heal(n), ★ spendMana(n)->bool, ★ addMana(n),
  ★ teleport(x,y,z), ★ setControl(on), ★ playAction(name, opts), ★ recalcStats(), invulnerable(seconds),
  outfit, ★ setOutfit(id, { quiet }) -> Promise<bool>,      // outfit: an id from src/data/outfits.js; saved in G.state.outfit (docs/api/heroine.md "Wardrobe")
  rig }                                                       // her current model (an outfit change gives a new rig: don't cache it, read G.player.rig when you need it)
G.cam = { yaw, pitch, dist, update(dt,rdt), ★ cinematic({ pos, look, dur, ease }) -> Promise, ★ release(), fovKick(k) }
```
A hand-written kinematic controller: on the ground it uses `G.world.groundAt` + `G.physics?.supportAt`, sideways `resolveCollisions`; swimming, double jump, dodge, Light Wings gliding (reads `G.elements?.windAt`), broom flight (`G.world.ceilingAt`, height cap). Registers the character capsule in physics. Camera: third-person follow, no clipping into the ground, pulls back and widens FOV when boosting on the broom, lock-on framing, reads `G.fx?.shakeOffset`. In title mode it orbits the shrine for framing.

### 6.9 spells (`src/spells/`) → `G.spells`
```js
G.spells = { list:[{id,name,element,level,cost,…}], selected, gauge(0..1), charge(0..1), holding(the body held by Moon Pull),
  ★ cast(spellId, form:'small'|'big', { caster, origin, dir, target?, point?, team, power=1 }) -> handle   // shared by the player and AI
  ★ learn(id, level=1), ★ select(id), knows(id), projectiles:[…], beams:[…], timeBubbles:[…] }
```
Reads player input (attack/cast/el*/wheel/guard/summon/ultimate); mana, cooldowns, charging; projectiles (including projectile clashes, deflection by wind, parries by Barrier), whose impacts take effect through `G.elements.apply` + `G.physics.explode` + `G.world.deform`; beams and beam struggles; Moon Pull grabbing; shikigami; Golden Ring. Damage reaches the reactor's owner through `info.damage`.

### 6.10 combat (`src/combat/`) → `G.combat`
HP/damage resolution, enemy AI and spawning (camp data `src/data/camps.js`), duelist AI (calls `G.spells.cast`), bosses, drops, lock-on.
```js
G.combat = { enemies:[…], lockTarget, inCombat, ★ spawn(type, pos, opts)->Enemy, ★ startBoss(id), ★ startDuel(id)->Promise<won>,
  ★ nearest(pos, r, filter), ★ damage(enemy, amount, info) }
Enemy { type, pos, vel, hp, maxHp, radius, height, team:'enemy', reactor, dead, stun(sec), … }
```

### 6.11 gameplay (`src/gameplay/`) → `G.gameplay`
Stone lanterns and great lanterns (lit by fire/sun, put out by water/wind; lit ones are checkpoints and light sources), checkpoints and respawning, pickups and drops (stardust, hearts, mana orbs), treasure chests, Moon Tears, ema plaques, races, moon barriers, updraft spots, bouncy giant mushrooms, crystal-pillar puzzles, shop goods and upgrades.
`★ spawnPickup(kind, pos, n)`, `★ igniteGreatLantern(id)`, `★ setGreatLanternReady(id, on)`, `★ respawnPlayer()`, `checkpoints`.

### 6.12 story (`src/story/`) → `G.quests`, `G.dialogue`, `G.npcs`
NPCs (model, idle, turning to face the player, interaction), the companion Dango, the dialogue-script runner, the quest engine (data-driven, advanced by listening to events), the entire Chinese script, tutorial hints, cutscenes (opening, learning spells, lighting lanterns, ending).
`G.quests.start/advance/isDone/active/tracker()`, `G.dialogue.play(id|lines) -> Promise`.

## 7. Tools and verification (everyone must use these)

```bash
node build.mjs --check src/your-file.js [...]     # only checks that your module compiles (other people's broken files don't affect it)
node tools/play.mjs --name label --systems a,b,c --params "pos=-455,150" --script .tmp/your-script.js
node tools/glbview.mjs assets/models/x.glb --anim Idle
node tools/check-i18n.mjs src/your-dir            # no hard-coded text allowed
```
- `play.mjs` really runs the game in a private headless Chrome (muted, never touches the player's save), runs the script, saves screenshots to `.tmp/play/<label>/`, and prints console errors and `G.errors`. **Look at the screenshots yourself with the Read tool**: "no errors" does not mean "looks good / is correct".
- `--systems` builds only the listed systems; absent systems are covered by core fallbacks (simple sky, coarse terrain, free camera), so you can bring just your own systems plus dependencies that are already finished. Don't include systems someone else is still writing.
- The script runs inside the page as the body of an async function, with `T` (`frames wait key press look teleport cam shot errors stats`) and `G` available.
- Temporary files go only in `.tmp/`. Don't start long-running servers, don't open a browser with a UI, don't touch other projects under `~/`.
- Only change files you own. If you need something added to core, spell it out in your report; don't change core yourself.

## 8. Performance budget (Apple Silicon, 1440×900)

Target 60 fps. Draw calls ≤ 500, triangles ≤ 1.5M, dynamic point lights ≤ 6, 1 shadow map (following the heroine, ±70 m). Particles ≤ 8000. Dynamic rigid bodies ≤ 260. Burning cells ≤ 420. Simultaneously active enemies ≤ 24 (those beyond 40 m sleep). Instance every repeated object; static assemblies must use `bakeStatic`.

## 9. Finished systems and implementation notes (code and docs/api/*.md are authoritative)

Finished: **physics, elements, sky (including the post pipeline), fx, ui**, plus the character assets. For each system, "what it actually turned out like, the exact API, known issues" is in `docs/api/<system>.md`;
read the ones you will use before you start (easier than reading the source). A few easy pitfalls:
- The `rot` of `G.world` box platforms/colliders now turns the same way as `Object3D.rotation.y` (fixed); skip `.dead` entries when iterating `platforms/colliders`.
- `G.world.deform()` has no effect inside barriers (settlements, near anchors); pick a spot in the wild to test craters.
- physics: the impulse of `explode/pushCone` is "the speed (m/s) a reference wooden crate of mass 25 would get"; `supportAt()` returns a shared object (read the values right away, don't keep the reference);
  physics-driven meshes must be attached directly under `G.scene`; characters registered with `addCharacter` push objects away.
- elements: floating ice is a `G.world` platform (physics mirrors it automatically as a fixed collider); ground fire emits `terrain:scorch` where it has burned (the terrain system draws the scorch marks).
- sky: a single follow shadow map (±70 m), no cascades; with post enabled, tone mapping is done in the grading pass, so don't rely on `renderer.toneMapping`;
  shadows depend on each mesh setting `castShadow/receiveShadow`; `G.lights = { sun, hemi, ... }`.
- fx: after the camera is positioned each frame, add `G.fx.shakeOffset` (a world-space Vector3), otherwise screen shake does nothing; particles have no soft depth, so large ground-hugging light spots get cut off by the ground: spawn them a little higher.
- ui: after `showEnding` finishes, `G.mode` stays at `'ending'` and the story system decides what comes next; the title screen doesn't control the camera (the camera system frames its own shot when `G.mode==='title'`).
- The pixel-ratio cap for the high tier is now 1.5; new settings `postAO/postBloom/postShafts`.

### 9.1 Notes after the second batch
Finished: **terrain (including water), player (including the camera, broom and Light Wings), actors (the shared character rig `src/actors/rig.js` + the state→animation table `clips.js`)**; see `docs/api/terrain.md`, `docs/api/player.md`.
All assets are now in the repo: `docs/assets-catalogue.md` is an id lookup table with dimensions/face counts/material names/animation names (526 items: characters, vegetation 98, buildings 27, objects 122, creatures 38, effect textures 33, music 12, ambience 10, sound effects 167).
- Characters (NPCs, duelists, humanoid enemies) always use `createActor(assetId, opts)` (`src/actors/rig.js`); don't write your own AnimationMixer.
- Element `apply()` now **doesn't hurt the same team** by default (fire/ice/thunder/rock/moon/wind skip reactors with the same `team`; water and sun still apply; `info.friendlyFire = true` forces it).
- Eating dango to heal (X key) is handled by the player system; other systems must not bind that key again.
- The on-screen dynamic point-light budget is relaxed to 10 (fx 4 + elements 4 + the heroine's lamp 1 already take 9): new systems **must not add any more persistent point lights**; convey brightness with `glow` materials + bloom, and use `G.fx.flash` for flashes.
- The terrain data texture (height/road distance/river distance) and the scorch texture can be sampled by other shaders: `G.terrain.dataTexture` and so on; layout in terrain.md.
- The stone peak of Tsukuyomi Palace is now a near-vertical cliff (with a scree slope at its foot); it can only be reached by flying.
- In GLSL never write `smoothstep(a, b, x)` with a > b (the result is undefined, and under bloom the whole screen turns black); to reverse it, write `1.0 - smoothstep(b, a, x)`.

### 9.2 Notes after the third batch
Finished: **flora, structures, props, audio, spells** (`docs/api/*.md`). The world, heroine and spells are now all in place; combat, gameplay and story remain.
- **Ownership**: the 12 stone lanterns, the 4 great lanterns (with their pedestals), the chest holding the broom and the three crystal pillars of Starcrystal Field are all placed by structures, with handles in `G.structures.stoneLanterns / greatLanterns / chests / crystalPedestals`
  (`.pos` is the real position; a few stone lanterns were shifted 2 m to make way for roads). gameplay only drives these handles (`setLit` / `open` / `setAngle`); don't place a second copy.
- **Sound**: check `src/audio/names.js` (`G.audio.has(name)`) before playing a sound. The audio system already voices these events automatically: player:step, prop:broken, enemy:killed, item:collected, checkpoint, spell:clash, physics:impact and others; other systems must not play their own sound for these events again.
- **Object drops** use these pickup kinds: stardust, heart, apple, roasted_apple, carrot, fish, grilled_fish, berry, mushroom, rice, pumpkin (gameplay's `spawnPickup(kind, pos, n)` must recognise them).
- New event: `prop:ring {type,pos,prop}` (a shrine bell or wind chime is struck/blown).
- Contract from spells to combat: when `enemy.held === true` (grabbed by Moon Pull), skip the enemy's own movement and AI; enemies of the opposing side inside `G.spells.timeBubbles` (`{pos,radius,scale,team}`) must be slowed by scale;
  duelists cast with `G.spells.cast(id, form, { caster, origin, dir|target|point, team:'enemy', power })`; continuous beams pass `{ duration, strength }`.
- Giant mushroom caps are standable platforms; `G.flora.bouncePads` gives the bounce points (the heroine should be bounced up when she lands on one).
- The heights of the flattened plots on the west coast (shrine, practice ground) are now corrected to the exact values in the data. Setting the camera with `T.cam()` in test scripts now takes effect for culling in every system.

### 9.3 Notes after Visual Upgrade One (2026-11-13)
The goal changed from "low-poly flat colours" to "a cel-shaded open world with a hand-painted feel". This batch redid lighting/shadows/surface detail, ground and grass carpet, vegetation, character shading and water; the implementation and API of each are in
`docs/api/look.md`, `terrain.md`, `flora.md`, `actors-look.md` (water is in the addendum to terrain.md). Read look.md before you start. Easy pitfalls:
- **All lit materials go through one lighting model** (`src/render/veilhook.js`): cel light/dark bands + region-tinted shadows + sky light/ground bounce + rim light. Materials you build yourself must call `hookMaterial()`
  and declare a surface category: `toon(color, { surface, look })` / `material.userData.surface` (paint wood plaster stone rock thatch tile cloth paper metal earth bark none).
  Without it, the category is guessed from the palette colour; custom hex colours can't be guessed and must be set explicitly. Textured, transparent and skinned materials get no surface detail layered on.
- Shadows are 3-level cascades (2 levels on low), with the outer levels refreshed every other frame; only `directionalLights[0]` takes part in lighting, and the two other zero-intensity lights exist only to hold shadow maps: don't touch them.
- Characters and creatures automatically take the cel path in `assets.toonify` (`src/actors/celmat.js`: outlines, two-tone shading, hair highlights, spring bones). The Body/Face/Hair/Eye material names in character GLBs must not change.
  `?celoff=1` goes back to the old shading for comparison.
- Vegetation no longer uses low-poly assets: trees, shrubs, flowers and grasses, rocks, giant mushrooms and crystals are all generated at boot by `src/world/flora/procgen.js` (`buildProcModel(G, key, sp)`), with leaf textures drawn on a canvas.
  Other systems that want to place trees call it; don't use `assets.model('tree_*')` any more.
- Grass is an instanced grass carpet in 5 rings around the camera, reading a camera-following ground map; `clear()`, scorch marks and blast flattening of `G.flora`/`createGrass` are all kept.
- Water: the high tier has planar reflection (refreshed every other frame, rendered only near water); `G.water.wake()`, `?water=legacy`. No refraction yet (it needs the post pipeline to provide the opaque scene colour and depth).
- Shader compile errors don't appear in `T.errors()`; after changing a shader, check the console for program errors.
- Performance: after this batch the high tier is about 2–3.6 M triangles and 500–1100 draw calls per frame, over the original 1.5 M/500 budget; every system's new content must come with LOD/instancing and a self-measured cost, and there will be one final unified optimisation pass.

### 9.4 Notes after Upgrade Two (2026-11-13)

Six parallel tracks (animation, costumes and cloth, buildings, objects, landforms, environment round two); details in `docs/api/{animation,cloth,structures,props,landforms,flora,terrain,look}.md`. Cross-system rules everyone must know:

- **Animation library**: the manifest entry of every humanoid character must have `clipsFrom` set to `['anim_ual', 'anim_miko']`. Callers only write the logical state names from `src/actors/clips.js`, never clip names.
  Clips never keyframe `J_Sec_*` bones (that is the cloth solver's territory). Dialogue lines carry `act` / `expr` tags; translators change only the text.
- **Costumes**: character ids are unchanged; `file` points to the `_v2` file and the old file is in `fileV1` (`?costume=v1` is for comparison only). Install only with `node tools/install-costumes.mjs`,
  which doesn't touch `clipsFrom`. Costume material names `cloth_*` and bone-chain names `J_Sec_<Part>_<n>_<nn>` must not change. Banou is a separate `char_banou`.
- **Concurrent manifest edits**: only use `tools/manifest-patch.mjs` (locks and merges); don't rewrite the whole file, and don't `--replace` character entries from an old copy.
- **Layer 5 is the "shadow-only" layer** (`PROXY_LAYER`): simplified shadow proxies of distant buildings and the merged shadow proxies of characters live on this layer, which only the shadow camera can see. Nothing else may go on this layer;
  when rebuilding the cascaded shadow lights, enable layer 5 on their `shadow.camera`.
- **Buildings**: roofs, beams and pillars, wall panels, torii and stone lanterns all come from `builders/kit.js` (`makeRoof`, `stoneCourse`, `mat.<surface>()`); building code never writes a bare `toon(0x…)`.
  Trees on a site use `procTree()` from `decor.js` (instanced centrally by `structures.js`). Collider, platform and anchor positions never move.
- **Objects**: asset-pack models go through `tools/refine-models.mjs` first (subdivision, soft edges, baked occlusion, pulled into the palette); the results are in `assets/models/refined/`, and the manifest has `orig` and
  `refined: 2`; `?propsv=1` loads the originals for comparison. Handmade objects use `src/props/shapes.js` (rounded boxes, bevelled cylinders, lathe solids, rope loops, plank crates, paper lanterns).
- **Landforms** is a new system, `landforms` (ordered after flora): floating-island rock masses, cliffs/outcrops/scree slopes, sea stacks and arches, river stones, the Mistview Spring rapids, distant mountain silhouettes and a sea of clouds.
  The walkable tops, platforms and collisions of floating islands are still owned by `builders/far.js` (keep the `own` branch and the order of random-number calls). `?nolandforms=1` turns the whole layer off.
- **Environment**: distant trees are eight-direction billboards baked at boot from the near models, drawn in one call; water has screen-space refraction (`G.post.captureOpaque()`) and a wet band along the shore;
  things floating on the open sea use `water.surfaceAt()`, while gameplay checks still use `levelAt()`; the high tier adds SMAA on top of 4× multisampling.
- **Performance (not on target; left for Upgrade Three to handle all together)**: the high tier is about 2.1–3.6 M triangles and 500–930 draw calls per frame; each track's millisecond figures were measured with the machine under full load and are unreliable.
  Known big items: planar water reflection (about 114 draw calls every two frames), Myriad-Lantern Town has no chunked LOD at all (440k triangles seen from above), each character costs about 19 draw calls (no merged atlas).

### 9.5 Notes after Upgrade Three (night of 2026-11-13)

Six parallel tracks (heroine animation fixes, creatures and ambient wildlife, landmark buildings round two, magic effects, mountains and ground round two, sky lighting and close-up plants). Details are in each track's
`docs/api/*.md` (animation, cloth, life, actors-look, structures, fx, spells, elements, terrain, landforms, sky, look, flora). Cross-system rules:

- **Procedural bone edits** always go in `rig.update()` after `mixer.update`, and may assume they start from a clean clip pose (`forceRewrite` guarantees a full rewrite every frame).
  Leg IK goes only through `legTwoBone` (it has built-in "knee never above the hip, no hyperextension" protection). The full-body casting overlay table is `CAST_BODY` in `clips.js`; it only reads the clips' release markers and doesn't change release timing.
- **Test cameras**: `T.viewCam(...)` / `T.orbitCam(...)` only handle the view and don't drive aiming; `T.cam(...)` keeps the old behaviour (aiming goes along with it).
- **Creatures**: only 5 monster models and 12 animals actually appear in the game; Shadow Blobs, Paper Imps and Will-o'-wisps are hand-modelled. For skinned creatures, pose the skeleton before measuring bounding boxes (otherwise the units are centimetres).
  Ambient wildlife is a new, purely visual system `life` (ordered after landforms); `G.life.stats().by` gives counts per kind, which audio can use; `?nolife=1` turns it off.
- **Buildings**: great lanterns, stone lanterns and chests are in `builders/keyobjects.js`; Tsukuyomi Palace is in `builders/palace.js`; Darktide Shore is in `builders/eastshore.js`.
  Asset models placed on a site must go through `prepVertexColours` before baking (otherwise they render solid black). Cloth items (banners, door curtains, prayer flags) sway in the vertex shader via `clothify(material, amp)`.
  New decorations always use their own random-number stream and must not move existing houses or stalls. Myriad-Lantern Town and Foxfire Village have distant LOD chunked by block.
- **Effects**: shaped effects all go through `src/fx/shapes.js` (one instanced draw, cap 160); textures are noise and glyphs drawn on canvas at boot; the glyphs are invented strokes and must not resemble any real-world script.
  Clash shockwaves emit `fx:blast { pos, radius }` (purely visual), which grass already listens to and gets flattened by; the two burst ids `embers` and `shatter_rock` must stay registered.
- **Ground**: steep slopes (>35°) use layered rock shading, with strata heights aligned to the contour cliff bands of the landforms (5.75 + k·5.5 m); `GROUND_TINT_GLSL` is the ground's large-scale tint function; grass blades are not wired to it yet.
  Comments in the terrain shader must not be written in Chinese (the text check treats Chinese inside template strings as hard-coded text).
- **Sky and water**: the sky is in `src/render/skydome.js` (layered cumulus, cirrus, sun-disc, moon-disc, the light band at the Moonveil's edge); cascaded shadow cameras enable layer 5 when created;
  planar water reflection is now at half resolution with a trimmed set of reflected objects; Mirror Lake is outside the coverage of `water.depthAt` (only the sea has a water level).
- **Acceptance**: `tools/acceptance/playthrough.js` is the master copy of the full-playthrough acceptance script (`node tools/play.mjs --name accept --params story=1 --timeout 1500 --script tools/acceptance/playthrough.js`).
  `node build.mjs --check` with no file names checks nothing; you must pass the changed files.

### 9.6 Performance and loading, visual-quality push, final content round (2026-11-14)

Details are in `docs/api/perf.md`, `look.md` ("Look round" / "Light r3"), `structures.md`, `fx.md`, `life.md`, `story.md` ("Play-test, final round"). Cross-system rules:

- **Light**: the key-light to cool-shadow ratio is about 4:1; don't add your own ambient or fill light inside shadows to brighten them; for brightness use emissive or `look.band`. At night it is dark between light sources,
  so anything that must be found at night needs its own glow or a lantern. Tone mapping is done only in the post grading pass (`?tone=0` goes back to the old curve for comparison).
  The sun-disc sits at 32° elevation, azimuth 14° south of east (`veil.js`), so long shadows fall toward the west-north-west; to give an open patch some shadow, put an occluder on its south-east side.
- **Lamp light pools**: all lamp positions are baked into one texture read by the lighting hook (`U.mvLampMap` / `U.mvLampBox`); they are not real lights. `G.sky.lampList()` gives the lamps' world coordinates.
- **Image sharpness**: the dynamic-resolution steps are 1 → 0.92 → 0.85 → 0.77 of the tier's pixel ratio, and when scaling, the last step uses an edge-preserving upscale. Always add `?dynres=0` to comparison screenshots.
- **Grass and trees**: grass beyond 4.5 m doesn't write depth (ambient occlusion, light shafts and depth fog see the soil under the grass); distant grass transitions by getting shorter and converging in colour, not by dithering.
  Tree crowns are shaded with smooth "crown normals", and leaf textures are clean, large colour blocks; ambient occlusion inside cherry-blossom crowns is toned down.
- **Surfaces**: built things first get large light/dark and hue gradients, then a few deliberate marks; no uniform grain. `M.stoneWarm` and `M.carved` are the same smooth stone material.
  New set dressing uses only materials already present on that site (check `G.structures.stats().per`; mesh count = draw calls); never add colliders on roads or inside anchor circles.
- **Building is asynchronous**: all site-building functions are async and yield the main thread through `ctx.step(label)` (running in slices during the title screen); output and random-number order are unchanged.
- **Lettering**: fonts are declared per language in `core.meta` and loaded by `src/core/fonts.js` (`assets/fonts/<locale>/`); anything that writes text onto a canvas must wait until the fonts are ready,
  otherwise it silently falls back to a print typeface. Lettering on banners, signboards and plaques is rendered as "handwriting" (per-character size, slant, flying-white brush gaps), and the crests beside it are hand-drawn on canvas.
- **Clashes**: beams are coloured by the caster's element (`beams.js` sets `lookEl` / `lookColor`), with brightness kept below the bloom threshold; shockwaves emit `fx:blast`,
  and there is a "visual gust" that affects only cloth and vegetation (`G.elements.visualWindAt`; character cloth and vegetation sway now read it, while rigid bodies and the player still read `windAt`).
- **Companion and creatures**: Dango is a hand-built little fox spirit (`story/companion.js`); the sparrows on the steps, the crows on the torii, the koi under the pier and the herons in the shallows are fixed-position "hero creatures",
  with coordinates copied from `builders/shrine.js` and `dusk.js`; if the steps or the torii tunnel there move, update `life/kinds.js` to match.
- **Flow fixes (play-test)**: main-quest duels don't use beams before level-2 Sun Radiance is learned; HP and mana are refilled when a duel starts; lotus lamps can be lit from the broom too;
  damage from Oboroyo and Mumyo to the heroine is scaled by a multiplier (spell entities don't read the caster's power; this is a known gap); leaving Mumyo's arena for 4 seconds aborts the fight, which can then be retried.
- **Startup**: the title shows first and the world loads in slices in the background; shader warm-up works by "actually drawing representative objects once" (`warmDraw` in `render/warmup.js`, on layer 31 only), not `compileAsync`.
  A freshly packaged app has to rebuild the GPU driver cache on first launch (playable after about 25 seconds), and takes about 6 seconds after that.
- **Current performance**: the high tier averages about 23 ms per frame; the bottleneck is draw calls (about 900 main draws + 400 shadow draws). Measure with `node tools/perf.mjs`; `?perf=0` turns off the performance changes for comparison.
