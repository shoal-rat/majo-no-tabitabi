# Customization guide: where names, characters, story and music live

*Moonveil Miko* kept "content" separate from "code" from the start. Switching to another language, changing characters' names and looks, rewriting the story or swapping the music never requires touching the engine.
This document only explains **where things live and how to swap them**; it does not assume what you want to turn the game into.

Checks after you make changes (run both from the project root):

```bash
node tools/check-i18n.mjs
```

```bash
node tools/play.mjs --name accept --params story=1 --timeout 1500 --script tools/acceptance/playthrough.js
```

The first checks for text hard-coded in the code; the second plays the main story from the title screen to the ending (about 6 minutes; it should end with `ALL PASSED`).

---

## 1. Text: everything the player can read

All of it is in `src/locales/zh-CN/`, read in code via `t('file.key')`. To add a language, copy this directory (for example to `src/locales/en/`) and translate it file by file.

| File | Contents |
|---|---|
| `core.js` | Game title (`title`), fonts, loading hints, names of the eight aspects (fire, water, ice, wind, thunder, earth, sun, moon), short names of the three lands |
| `story.js` | **Character names** (`name.<id>`: the protagonist `akari`, the companion `dango`, 13 named characters, passers-by), talk prompts, quest-UI wording |
| `story.quests.js` | Titles, objectives and hints of the seven main-story chapters (`m0_shrine` … `m6_moon`) and the ten side quests |
| `story.dlg.main.js` | Main-story dialogue. Each line is `{ who, text, act?, expr?, do?, if?, choices? }`; **change only `text`**: `who` is the character id, `act`/`expr` are performance tags, `do`/`if`/`goto` are story logic |
| `story.dlg.side.js` | Side quests, sparring matches, passer-by chatter |
| `world.js` | **Place names** (`place.*`, `sub.*`), rivers, bridges, the names of the six great lanterns |
| `spells.js` | Names, descriptions and hints of the spirit charms (spells) and the four casting forms |
| `combat.js` | Names and lines of enemies, opponents, duels and boss fights |
| `structures.js` | Text on banners, door curtains, shop signs and notice boards |
| `gameplay.js` `props.js` `player.js` `ui.js` | Mechanisms and collectibles, objects, control hints, all interface text |

Text must **not contain scientific or astronomical terms** (this is a magic world); that is this project's own writing rule.

## 2. Characters: who is who and what they look like

A character is defined by four places together:

| What to change | Where |
|---|---|
| Name | `name.<id>` in `src/locales/zh-CN/story.js` |
| Where they stand, what they do, which model they use | The character table in `src/story/npcs.js`: `{ id, asset, anchor, idle, work, props … }`. `asset` is the model id in the manifest; `anchor` is an anchor in `src/data/world.js` |
| Model file | The `char_<id>` entry in `assets/manifest.json`; `file` points to `assets/models/chars/char_<id>_v2.glb` (Banou's is `char_banou.glb`) |
| Personality and lines | The dialogue files (see above); opponents' fighting styles are in `src/combat/duel.js` and `src/locales/zh-CN/combat.js` |

There are 19 humanoid models: the protagonist `char_akari`; the named characters `granny himawari ushio kokonoe kuzunoha rikka naru shoku kagami oboroyo banou`;
the passers-by `villager_a/b/c`, `fox_a/b`, `town_a/b`.

The protagonist also has **outfits** (the 「衣装」 (Outfits) page of the scroll menu; change any time, wear anywhere): witch's travelling outfit `char_akari`, Tide Festival swimsuit `char_akari_swim_a`,
Dusk Sea swimsuit `char_akari_swim_b`.

- **Rebuild (one command)**: `node tools/costume/wardrobe-build.mjs --install` re-dresses all three with the current body/face (`assets/models/sculpt/akari_base.glb`)
  and silver hair (`akari_hair2.glb`, or `--hair <file>`), checks them (skeleton, face and 13 expressions consistent with the body, swimsuit coverage check),
  and writes them into `assets/models/chars/` and the manifest. After changing the face or hair, just run this one command again. Wardrobe page pictures: `node tools/costume/wardrobe-pics.mjs`.
- **Adding a new outfit** touches five places: ① a dressing build script (modelled on `tools/costume/swim_a.mjs`; it must end with a coverage check that fails the build);
  ② a row in the `OUTFITS` table of `tools/costume/wardrobe-build.mjs`; ③ a row in the outfit table of `src/data/outfits.js` (model id, picture, how the waist lantern hangs);
  ④ `outfit.<id>.name` and a one-line `desc` in `src/locales/<lang>/ui.js` for every language; ⑤ run the build command above and `node tools/check-i18n.mjs`.
  The default travelling outfit is made by `tools/costume/witch-traveller.mjs`; the wide-brimmed hat is bound to the skull by `witch-hat.mjs`. Existing saves keep the `miko` outfit id.
  Details (the fields for each step, the checks, what carries over when changing outfits): the "Wardrobe" section of `docs/api/heroine.md`.

#### Editing Akari's silver hair

- **Fringe and crown:** `sectors` in `tools/sculpt/assets/akari_hair2_cap.mjs` controls the strand boundaries and tip positions; `fringeLeaves()` generates the outer strands that cover the forehead. First lay out the open space around the eyes from the front, then turn to a three-quarter view to check how the strands follow the curve of the forehead. [Ascalon's Blender demo of flat-modelled anime hair](https://blenderartists.org/t/flat-modeling-anime-toon-hair/1204349)
- **Long side hair:** `hairDesign()` in `tools/sculpt/assets/akari_hair2.mjs` defines the path, half-width and thickness of the left and right locks separately. `tools/sculpt/figure/build-hair2.mjs` sweeps a flat cross-section along each path. When changing the silhouette in front of the shoulders, adjust the path and width first, then the twist angle, and check the hair tips and the gold rings from the side. [VRoid's official tutorial on editing hair strands](https://vroid.pixiv.help/hc/en-us/articles/900005678786-How-do-I-customize-hairstyles)
- **In-game check:** run `node tools/costume/wardrobe-build.mjs --rebuild-hair --install`, then `node tools/costume/wardrobe-pics.mjs`. Check the hat brim, shawl and back collar in the default travelling outfit, then switch to the Tide Festival or Dusk Sea swimsuit to see the whole crown. While running, jumping and riding the broom, watch the swing of the long hair from behind and to the side.

### Changing a character's look

All humanoid characters share one skeleton (the VRoid humanoid skeleton) and one animation library, so there are two routes:

1. **Edit the costume recipe and regenerate** (recommended). Costumes are procedurally generated:
   - `tools/costume/recipes.mjs`: one recipe per character (garment type, sleeve type, skirt/hakama, sash, colours, patterns, headwear, tail, etc.).
   - `tools/costume/outfit.mjs`, `shells.mjs`, `extras.mjs`, `garment.mjs`: generators for garment panels, the skin-tight layer, accessories, skinning and textures.
   - Generate: `node tools/costume/build.mjs <id …>`, output in `.tmp/costume/out/`; check: `node tools/costume/check.mjs`.
   - Put the output in `assets/_incoming/costume/` (together with the manifest fragment generated by `node tools/costume/manifest.mjs`), then run
     `node tools/install-costumes.mjs` to install it into the game.
   - Body, face and hair come from five CC0 VRoid base models (`assets/models/chars/char_<id>.glb`, i.e. `fileV1` in the manifest). Changing the hairstyle, face shape or height means swapping this base model.
2. **Swap in your own GLB directly.** Requirements:
   - Bone names match the existing models (`J_Bip_C_Hips` etc.), or the animations won't line up;
   - Keep the material names `Body` `Face*` `Hair*` `Eye*` for body/face/hair/eyes (outlines and cel shading identify parts by these names);
   - Make swaying parts into bone chains named `J_Sec_<part>_<index>_<01..03>` and list them under `secondaryChains` in the manifest entry (format in `docs/api/cloth.md`);
   - Edit the manifest with `node tools/manifest-patch.mjs` instead of rewriting the whole file; **do not change `clipsFrom`** (it must be `['anim_ual', 'anim_miko']`).

### Animations

- The animation library is `assets/models/chars/anim_miko.glb` (56 original clips) plus the open-source `anim_ual.glb`.
- The logical-state → clip mapping is in `src/actors/clips.js`; game code only uses state names.
- The source that generates the original clips is in `tools/anim/` (`clips/*.mjs`, split by category: casting, dialogue, walking and flying, labour, ritual).

### Companions and creatures

- The companion Dango: `src/story/companion.js` (behaviour) and `ani_fox` in the manifest (model).
- Enemies: `src/combat/types.js` (which model or hand-built form each enemy uses, body size, behaviour); names are in `src/locales/zh-CN/combat.js`.
  Shadow blobs, paper wraiths and will-o'-wisps are hand-modelled, with their code in `src/actors/creature.js`.
- Animals and ambient creatures: `src/combat/wildlife.js`, `src/world/life/`.

## 3. World: how places and quests are laid out

| What to change | Where |
|---|---|
| Places, roads, rivers, bridges, anchor coordinates | `src/data/world.js` (`POI`, `ROADS`, `RIVERS`, `BRIDGES`, `ANCHORS`, great lanterns `GREAT_LANTERNS`, floating isles `SKY_ISLES`) |
| Position and extent of the Moonveil (where it is day, dusk, long night) | `VEIL` in `src/data/world.js` |
| Buildings at each place | `src/world/builders/*.js` (shrine `shrine.js`, village `village.js`, Dusk Wood `dusk.js`, Myriad-Lantern Town `town.js`, Tsukuyomi Palace `palace.js`, Darktide Shore `eastshore.js`, everything else `far.js`) |
| Main and side quest flow | `src/story/questdefs.js`: each quest is a sequence of steps (go somewhere, talk to someone, win a fight, light a lantern…); each step can carry dialogue and rewards |
| Cutscenes | `src/story/cutscenes.js` |
| Duels and boss fights | `src/combat/duel.js`, `bosses.js` |
| The spells themselves (numbers, forms) | `src/spells/`; element reaction rules in `src/elements/reactor.js` |

After changing place coordinates or quest flow, update the playthrough acceptance script `tools/acceptance/playthrough.js` as well (it walks through the current quest steps one by one).

## 4. Visuals and sound

| What to change | Where |
|---|---|
| Global palette | `PAL` in `src/core/mats.js` (the main colours of characters, buildings, the three lands, lamplight and water all come from here) |
| UI icons, eight-aspect emblems | `src/ui/icons.js`; UI styles in `src/ui/style.js` |
| Title screen | `src/ui/title.js` (the title text is `title` in `core.js`) |
| Music | `assets/audio/music/bgm_*.ogg`, 12 tracks (`title sun shrine dusk night town battle duel boss final ending flight`). Replacing a file with one of the same name is enough; which track plays when is in `src/audio/director.js` |
| Ambience and sound effects | `assets/audio/ambience/`, `assets/audio/sfx/`; the name mapping is in `src/audio/names.js` |
| Asset sources and licences | `license` / `author` / `source` in each entry of `assets/manifest.json`; `node tools/gen-credits.mjs` generates the credits list from them |

Make sure the licence of any asset you bring in allows your use, and write its source into the manifest so the credits list comes out right.

## 5. Things not to touch

- The save format (`src/core/save.js`): change it and old saves can no longer be read.
- Character ids, quest ids, anchor ids: dialogue, quests, saves and acceptance scripts all reference them. **To change a displayed name, edit only the language files, never the id.**
- Render layer 5 (simplified bodies used only for shadows), `cloth_*` material names, `J_Sec_*` bone chain names.

The standalone GLBs of Akari's three outfits can be rebuilt with `node tools/costume/export-character.mjs char_akari <output-dir>`. The model IDs of the other two are `char_akari_swim_a` and `char_akari_swim_b`. The exported files contain nine animations, with the ten pleats of the travelling skirt baked along with the motion; in game the pleats are driven in real time by leg collisions.
