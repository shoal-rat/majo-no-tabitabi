# 素材署名与授权

《魔女之旅》（魔女の旅々）原作由白石定規创作、あずーる绘制插画，动画版权标识为 © 白石定規・SBクリエイティブ／魔女の旅々製作委員会。本项目是玩家制作的非官方、非营利同人游戏。作品名称、角色设计与故事设定的权利属于相应权利人。[动画官方网站](https://majotabi.jp/)

本仓库的 MIT 软件许可适用于项目原创程序。模型、插画、贴图、字体和音频请按各自条目使用。清单记录了素材文件、作者、来源和授权，部分条目还列出制作方法或原文件名。[软件许可](LICENSE) · [逐项素材清单](assets/manifest.json)

## 音乐与音效

### 原创配乐

游戏的背景音乐是本项目的原创配乐，共 13 首：`bgm_title`、`bgm_sun`、`bgm_dusk`、`bgm_night`、`bgm_town`、`bgm_battle`、`bgm_duel`、`bgm_boss`、`bgm_final`、`bgm_ending`、`bgm_flight`、`bgm_home`、`bgm_pages`。全部旋律、和声与编配都以乐谱数据写在仓库里，由仓库内的合成器逐音渲染，不含采样。战斗类曲目另有与主曲同步播放的强度层（`bgm_battle_hot`、`bgm_boss_hot`、`bgm_duel_hot`、`bgm_final_hot`）。[配乐工具与乐谱](tools/music/)

### PeriTune（Sei Mutsuki）

下列提示音取自 PeriTune 发布的作品。作者明确保留 2026 年 2 月及以前已发布作品的 CC BY 4.0 许可。游戏版本做了响度调整与 Ogg/Opus 转码，短提示音使用原曲提供的相应版本。[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [PeriTune 许可变更公告](https://peritune.com/blog/2026/03/01/terms-update/)

| 游戏内素材 | 原曲与作者发布页 |
| --- | --- |
| `sfx_learn_fanfare` | [Zephyr_Fields (Jingle)](https://peritune.com/blog/2024/01/20/zephyr_fields/) |
| `sfx_jingle_festival` | [Ohayashi (Jingle)](https://peritune.com/blog/2019/01/12/ohayashi/) |

### 其他署名音效

这些音效经过响度调整与 Ogg/Opus 转码。游戏中的每组音效对应下列原包，各片段原名见素材清单的 `notes` 字段。[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

- **leohpaz** · `sfx_step_stone_4`、`sfx_step_water_4`、`sfx_jump`、`sfx_land_soft`、`sfx_dash`、`sfx_climb`、`sfx_swim`。[12 player movement sfx](https://opengameart.org/content/12-player-movement-sfx)
- **leohpaz** · `sfx_hit_fire`、`sfx_cast_water`、`sfx_hit_ice`、`sfx_cast_wind`、`sfx_cast_thunder`、`sfx_cast_earth`、`sfx_cast_dark`、`sfx_charge`、`sfx_poison`。[8 magic attacks](https://opengameart.org/content/8-magic-attacks)
- **leohpaz** · `sfx_hit_dark`、`sfx_heal_1`、`sfx_buff_attack`、`sfx_buff_defense`、`sfx_buff_speed`、`sfx_debuff`、`sfx_revive`。[8 heals and buffs sfx](https://opengameart.org/content/8-heals-and-buffs-sfx)

## 需要署名的场景模型

以下模型仍按 CC BY 3.0 提供。项目以 GLB 收录，部分模型调整了比例、原点、顶点色或材质，具体制作记录见素材清单。[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)

| 游戏素材 | 作者 | 原作链接 |
| --- | --- | --- |
| `plant_flower_1` | Poly by Google | [Daisy](https://poly.pizza/m/ckAqqaCskMy) |
| `plant_sunflower_1` | Poly by Google | [Sunflower](https://poly.pizza/m/ce4GXw3VYE5) |
| `tree_cherry_1` | Poly by Google | [Cherry tree](https://poly.pizza/m/1FSDzk-LRdA) |
| `tree_maple_1` | Poly by Google | [Maple tree](https://poly.pizza/m/8OfF21t6NMa) |
| `bld_torii_red` | sugamo | [Torii](https://poly.pizza/m/8ZgGY1XCfuR) |
| `bld_torii_grand` | Jacques Fourie | [Japanese Torii](https://poly.pizza/m/cXyQGUwmlA5) |
| `bld_stone_toro` | Matt Newell | [Toro](https://poly.pizza/m/0SguM8o_PMc) |
| `bld_stone_lantern_white` | Flopsi | [Japanese Stone Lamp](https://poly.pizza/m/5gZfOZIW92k) |
| `bld_pagoda_red` | Poly by Google | [Pagoda](https://poly.pizza/m/1zS7ucaAd4J) |
| `bld_pagoda_grey` | Poly by Google | [Pagoda](https://poly.pizza/m/d1M5ncMBUDi) |
| `prop_lantern_red` | Sophie Kim | [Red lantern](https://poly.pizza/m/7PZhxLFiGc2) |
| `prop_witch_hat` | J-Toastie | [Witch Hat](https://poly.pizza/m/fy1Elzr3nl) |

## 中文字体

游戏随附四份字体及各自的版权声明、SIL Open Font License 1.1 全文。重新分发字体时请一同保留这些文件。

| 字体 | 作者 | 来源与随附许可 |
| --- | --- | --- |
| LXGWWenKaiLite | LXGW (LXGW WenKai Lite; based on Klee by Fontworks) | [字体项目](https://github.com/lxgw/LxgwWenKai-Lite) · [OFL 与版权声明](assets/fonts/zh-CN/OFL-LXGWWenKaiLite.txt) |
| MaShanZheng | The Ma Shan Zheng Project Authors | [字体项目](https://github.com/googlefonts/mashanzheng) · [OFL 与版权声明](assets/fonts/zh-CN/OFL-MaShanZheng.txt) |
| ZhiMangXing | The Zhi Mang Xing Project Authors | [字体项目](https://github.com/googlefonts/zhimangxing) · [OFL 与版权声明](assets/fonts/zh-CN/OFL-ZhiMangXing.txt) |
| NotoSerifSC-UI | Google (Noto Serif SC; based on Source Han Serif by Adobe) | [字体项目](https://github.com/google/fonts/tree/main/ofl/notoserifsc) · [OFL 与版权声明](assets/fonts/zh-CN/OFL-NotoSerifSC-UI.txt) |

## CC0 素材来源

感谢下列创作者公开模型、纹理、动作和声音。这里自愿记录作者与来源，使用 CC0 素材无需署名。同一作者的素材包以发布页面索引，各文件与作者的对应关系见清单。[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [逐项素材清单](assets/manifest.json)

- **Poly Haven / colormass、Rico Cilliers** 提供了旅行装羊毛和亚麻的表面纹样。摄影由 colormass 完成，后期由 Rico Cilliers 完成。[Poly Wool Herringbone](https://polyhaven.com/a/poly_wool_herringbone) · [Rough Linen](https://polyhaven.com/a/rough_linen) · [CC0](https://polyhaven.com/license)
- **Poly Haven / Rob Tuytel** 提供了旅行装挎包和靴面的皮纹。[Brown Leather](https://polyhaven.com/a/brown_leather) · [CC0](https://polyhaven.com/license)

- **android_lime** · 1 项。[Freesound 570890](https://freesound.org/people/android_lime/sounds/570890/)
- **artisticdude** · 6 项。[swishes sound pack](https://opengameart.org/content/swishes-sound-pack) · [freeze spell 0](https://opengameart.org/content/freeze-spell-0) · [rpg sound pack](https://opengameart.org/content/rpg-sound-pack)
- **Augmentality (Brandon Morris)** · 4 项。[spell sounds](https://opengameart.org/content/spell-sounds)
- **baryy** · 1 项。[Freesound 409146](https://freesound.org/people/baryy/sounds/409146/)
- **cicifyre** · 9 项。[female rpg voice starter pack](https://opengameart.org/content/female-rpg-voice-starter-pack)
- **ERR0** · 1 项。[Freesound 210220](https://freesound.org/people/ERR0/sounds/210220/)
- **IgnasD** · 3 项。[wind](https://opengameart.org/content/wind) · [ice breakingshattering](https://opengameart.org/content/ice-breakingshattering)
- **iPoly3D** · 2 项。[nat_crystal_cluster_4](https://poly.pizza/m/WzWPKHFMkL) · [nat_crystal_cluster_5](https://poly.pizza/m/dxCmHfpqc5)
- **Isa Lousberg** · 2 项。[plant_vine_1](https://poly.pizza/m/HG1d091bLo) · [plant_vine_2](https://poly.pizza/m/BLebrBKjcH)
- **JaggedStone** · 4 项。[magic spell sfx](https://opengameart.org/content/magic-spell-sfx)
- **Kay Lousberg (KayKit)** · 114 项。[kaylousberg.itch.io](https://kaylousberg.itch.io/) · [kaykit forest](https://kaylousberg.itch.io/kaykit-forest) · [KayKit Medieval Hexagon Pack 1.0](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) · [KayKit Halloween Bits 1.0](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0) · [kaykit medieval hexagon](https://kaylousberg.itch.io/kaykit-medieval-hexagon) · [resource bits](https://kaylousberg.itch.io/resource-bits) · [kaykit dungeon remastered](https://kaylousberg.itch.io/kaykit-dungeon-remastered) · [rpg tools bits](https://kaylousberg.itch.io/rpg-tools-bits) · [halloween bits](https://kaylousberg.itch.io/halloween-bits) · [furniture bits](https://kaylousberg.itch.io/furniture-bits) · [restaurant bits](https://kaylousberg.itch.io/restaurant-bits)
- **Kenney** · 88 项。[survival kit](https://kenney.nl/assets/survival-kit) · [graveyard kit](https://kenney.nl/assets/graveyard-kit) · [fantasy town kit](https://kenney.nl/assets/fantasy-town-kit) · [mini dungeon](https://kenney.nl/assets/mini-dungeon) · [particle pack](https://kenney.nl/assets/particle-pack) · [smoke particles](https://kenney.nl/assets/smoke-particles) · [impact sounds](https://kenney.nl/assets/impact-sounds) · [rpg audio](https://kenney.nl/assets/rpg-audio) · [interface sounds](https://kenney.nl/assets/interface-sounds) · [music jingles](https://kenney.nl/assets/music-jingles)
- **laughatlantic** · 1 项。[Freesound 528067](https://freesound.org/people/laughatlantic/sounds/528067/)
- **MentalSanityOff** · 1 项。[jump landing sound](https://opengameart.org/content/jump-landing-sound)
- **MouseBYTE** · 5 项。[chimey ui sounds](https://opengameart.org/content/chimey-ui-sounds)
- **nmscher** · 1 项。[Freesound 85576](https://freesound.org/people/nmscher/sounds/85576/)
- **Nox_Sound** · 2 项。[Freesound 637083](https://freesound.org/people/Nox_Sound/sounds/637083/) · [Freesound 548373](https://freesound.org/people/Nox_Sound/sounds/548373/)
- **Ogrebane** · 1 项。[teleport spell](https://opengameart.org/content/teleport-spell)
- **PagDev** · 1 项。[fireplace sound loop](https://opengameart.org/content/fireplace-sound-loop)
- **pixiv Inc.（VRoid Project）** · 19 项。[vroid studio cc0 models](https://opengameart.org/content/vroid-studio-cc0-models) · [pixiv 样例许可](https://vroid.pixiv.help/hc/en-us/articles/4402614652569)
- **PWL** · 5 项。[bell dingschimes](https://opengameart.org/content/bell-dingschimes)
- **Quaternius** · 149 项。[universalanimationlibrary](https://quaternius.com/packs/universalanimationlibrary.html) · [universalanimationlibrary2](https://quaternius.com/packs/universalanimationlibrary2.html) · [ultimaterpg](https://quaternius.com/packs/ultimaterpg.html) · [ultimatenature](https://quaternius.com/packs/ultimatenature.html) · [stylized nature megakit](https://quaternius.itch.io/stylized-nature-megakit) · [ultimatecrops](https://quaternius.com/packs/ultimatecrops.html) · [platformergamekit](https://quaternius.com/packs/platformergamekit.html) · [sushirestaurantkit](https://quaternius.com/packs/sushirestaurantkit.html) · [fantasypropsmegakit](https://quaternius.com/packs/fantasypropsmegakit.html) · [ultimateanimatedanimals](https://quaternius.com/packs/ultimateanimatedanimals.html) · [cutemonsters](https://quaternius.com/packs/cutemonsters.html) · [nat_crystal_cluster_6](https://poly.pizza/m/pf5lzmgr2J) · [plant_fern_2](https://poly.pizza/m/jqcanvH7D6) · [rock_arch_1](https://poly.pizza/m/QwWdOcNIMh) · [全部 63 个 Poly Pizza 模型来源](assets/manifest.json)
- **qubodup** · 1 项。[squeaky rat](https://opengameart.org/content/squeaky-rat)
- **Rob Tuytel (Poly Haven)** · 2 项。[rock 01](https://polyhaven.com/a/rock_01) · [fine grained wood](https://polyhaven.com/a/fine_grained_wood)
- **rubberduck** · 53 项。[100 cc0 sfx 2](https://opengameart.org/content/100-cc0-sfx-2) · [80 cc0 rpg sfx](https://opengameart.org/content/80-cc0-rpg-sfx) · [40 cc0 water splash slime sfx](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) · [75 cc0 breaking falling hit sfx](https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx) · [25 cc0 bang firework sfx](https://opengameart.org/content/25-cc0-bang-firework-sfx) · [80 cc0 creature sfx](https://opengameart.org/content/80-cc0-creature-sfx) · [80 cc0 creture sfx 2](https://opengameart.org/content/80-cc0-creture-sfx-2)
- **rubberduck, Kenney** · 1 项。[80 cc0 rpg sfx](https://opengameart.org/content/80-cc0-rpg-sfx) · [interface sounds](https://kenney.nl/assets/interface-sounds)
- **SketchMan3** · 1 项。[wind whoosh loop](https://opengameart.org/content/wind-whoosh-loop)
- **Vrymaa + PagDev + VKProduktion** · 1 项。[Freesound 734642](https://freesound.org/people/Vrymaa/sounds/734642/) · [fireplace sound loop](https://opengameart.org/content/fireplace-sound-loop) · [Freesound 231536](https://freesound.org/people/VKProduktion/sounds/231536/)
- **wobbleboxx** · 1 项。[level up power up coin get 13 sounds](https://opengameart.org/content/level-up-power-up-coin-get-13-sounds)
- **Ylmir** · 1 项。[rain loopable](https://opengameart.org/content/rain-loopable)

## 同人角色与项目美术

- 伊蕾娜的学徒装与旅行装、芙兰、沙耶等八个演员模型由项目的角色工具制作。几何、服装和配色依原作设计进行同人改编。人形骨架源于 pixiv 的 CC0 样例 HairSample_Female。原作角色设计归相应权利人。[角色生成工具](tools/journey/build-cast.mjs) · [pixiv 样例授权](https://vroid.pixiv.help/hc/en-us/articles/4402614652569)
- 基础项目的旅行装、两套水着与衣装预览分别记录了网格、纹样、骨架或渲染来源。水着设计参考伊蕾娜相关角色商品。中文字标经图像生成、抠图和逐字校对。早期天空绘景使用了图像生成辅助。[服装制作工具](tools/costume/) · [字标与天空的素材记录](assets/manifest.json)
- 清单明确标为 CC0 的项目自制基础模型、道具和动作共 69 项。这些条目保留各自的许可和制作说明。[自制模型生成器](tools/sculpt/) · [动作工具](tools/anim/)

项目制作记录也可按清单标识查找。

- `char_akari` [制作工具](tools/costume/wardrobe-build.mjs)
- `sfx_broom_tailwind`
- `lettering_zh_title`、`lettering_zh_plaque_shrine`、`lettering_zh_banner_sun`、`lettering_zh_banner_fox`
- `char_akari_swim_b`、`char_akari_swim_a` [制作工具](tools/costume/wardrobe-build.mjs)
- `ui_outfit_swim_a`、`ui_outfit_swim_b`、`ui_outfit_apprentice`、`ui_outfit_elaina` [制作工具](tools/costume/wardrobe-pics.mjs)
- `sky_traveller_cloudbank`
- `char_fran`、`char_saya`、`char_elaina_mother`、`char_innkeeper`、`char_exam_witch`、`char_elaina`、`char_elaina_father`、`char_elaina_apprentice`、`char_elaina_swim_a`、`char_elaina_swim_b` [制作工具](tools/journey/build-cast.mjs)
- `ui_portrait_elaina_apprentice`、`ui_portrait_elaina_elaina`、`ui_portrait_fran`、`ui_portrait_saya`、`ui_portrait_mother`、`ui_portrait_father`、`ui_portrait_exam`、`ui_portrait_innkeeper` [制作工具](tools/costume/portraits.mjs)

## 程序库

- three.js（MIT）与 Rapier（Apache-2.0）提供渲染和物理功能。[three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE) · [Rapier](https://github.com/dimforge/rapier/blob/master/LICENSE)
- esbuild（MIT）用于打包，Electron（MIT）提供桌面外壳。[esbuild](https://github.com/evanw/esbuild/blob/main/LICENSE.md) · [Electron](https://github.com/electron/electron/blob/main/LICENSE)
- 第三方代码（Third-party code）：扫帚尾流在草地与水面留下的印迹、扬起的花瓣与水花的做法改编自 Petalwake（MIT，Copyright (c) 2026 Jacob Miller），许可声明见 `src/world/flora/wake-field.js` 与 `src/world/water/wake-spray.js` 文件头。 [Petalwake](https://github.com/jjcm/petalwake)

维护素材清单后，运行 `node tools/gen-credits.mjs` 即可重新生成此页。
