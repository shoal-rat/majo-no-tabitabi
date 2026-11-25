#!/usr/bin/env node
// Rebuild the public credits from the same manifest loaded by the game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
const buckets = { by: [], fonts: [], cc0: [], projectCC0: [], project: [], other: [] };
for (const [id, record] of Object.entries(manifest)) {
  const entry = { ...record, id };
  if (/^CC[- ]BY[- ](?:3|4)\.0$/.test(entry.license)) buckets.by.push(entry);
  else if (entry.license === 'OFL-1.1') buckets.fonts.push(entry);
  else if (/^CC0\b/.test(entry.license)) {
    const original = /^(?:sculpted|Moonveil Miko)/.test(entry.author);
    buckets[original ? 'projectCC0' : 'cc0'].push(entry);
  } else if (/^(?:Original|Project-made|In-game render)/i.test(entry.license)) buckets.project.push(entry);
  else buckets.other.push(entry);
}

function sourceUrls(text) {
  return [...new Set(text.match(/https?:\/\/[^\s,;)]+/g) || [])];
}
function groupBy(entries, key) {
  const result = new Map();
  for (const entry of entries) {
    const name = key(entry);
    if (!result.has(name)) result.set(name, []);
    result.get(name).push(entry);
  }
  return result;
}
function assetIds(entries) {
  return entries.map(({id}) => '`' + id + '`').join('、');
}
function link(title, url) {
  return '[' + title + '](' + url + ')';
}
function titleFromUrl(url) {
  const u = new URL(url);
  if (u.hostname === 'vroid.pixiv.help') return 'pixiv 样例许可';
  if (u.hostname.endsWith('freesound.org')) return 'Freesound ' + u.pathname.split('/sounds/')[1].split('/')[0];
  const slug = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
  return slug.replace(/\.html$/, '').replace(/[-_]/g, ' ');
}
function cc0Author({author}) {
  if (author.startsWith('pixiv Inc.')) return 'pixiv Inc.（VRoid Project）';
  if (author.startsWith('Quaternius')) return 'Quaternius';
  if (author === 'Kenney (kenney.nl)') return 'Kenney';
  return author;
}
function cc0Sources(entries) {
  // Each Poly Pizza model has its own source URL in the manifest. Keep representative
  // links for artists with large collections so the index remains readable.
  const urls = [...new Set(entries.flatMap(e => sourceUrls(e.source)))];
  const pizza = urls.filter(u => u.startsWith('https://poly.pizza/m/'));
  const links = urls.filter(u => !pizza.includes(u)).map(u => link(titleFromUrl(u), u));
  for (const url of pizza.slice(0, 3)) {
    const model = entries.find(e => sourceUrls(e.source).includes(url));
    links.push(link(model.id, url));
  }
  if (pizza.length > 3) links.push(link('全部 ' + pizza.length + ' 个 Poly Pizza 模型来源', 'assets/manifest.json'));
  return links.join(' · ');
}

const out = [
  '# 素材署名与授权',
  '',
  '《魔女之旅》（魔女の旅々）原作由白石定規创作、あずーる绘制插画，动画版权标识为 © 白石定規・SBクリエイティブ／魔女の旅々製作委員会。本项目是玩家制作的非官方、非营利同人游戏。作品名称、角色设计与故事设定的权利属于相应权利人。[动画官方网站](https://majotabi.jp/)',
  '',
  '本仓库的 MIT 软件许可适用于项目原创程序。模型、插画、贴图、字体和音频请按各自条目使用。清单记录了素材文件、作者、来源和授权，部分条目还列出制作方法或原文件名。[软件许可](LICENSE) · [逐项素材清单](assets/manifest.json)',
  '',
  '## 音乐与音效',
  '',
  '### 原创配乐',
  '',
];
// the background music is the project's own score (tools/music/): written as data, rendered by its synthesiser
const score = buckets.project.filter(e => /^bgm_/.test(e.id) && !/_hot$/.test(e.id));
const layers = buckets.project.filter(e => /^bgm_.*_hot$/.test(e.id));
out.push('游戏的背景音乐是本项目的原创配乐，共 ' + score.length + ' 首：' + assetIds(score) + '。全部旋律、和声与编配都以乐谱数据写在仓库里，由仓库内的合成器逐音渲染，不含采样。战斗类曲目另有与主曲同步播放的强度层（' + assetIds(layers) + '）。[配乐工具与乐谱](tools/music/)',
  '', '### PeriTune（Sei Mutsuki）', '',
  '下列提示音取自 PeriTune 发布的作品。作者明确保留 2026 年 2 月及以前已发布作品的 CC BY 4.0 许可。游戏版本做了响度调整与 Ogg/Opus 转码，短提示音使用原曲提供的相应版本。[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [PeriTune 许可变更公告](https://peritune.com/blog/2026/03/01/terms-update/)',
  '', '| 游戏内素材 | 原曲与作者发布页 |', '| --- | --- |');
const music = buckets.by.filter(e => e.author.startsWith('PeriTune'));
for (const e of music) out.push('| `' + e.id + '` | ' + link(e.sourceTitle, e.source) + ' |');
out.push('', '### 其他署名音效', '',
  '这些音效经过响度调整与 Ogg/Opus 转码。游戏中的每组音效对应下列原包，各片段原名见素材清单的 `notes` 字段。[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)', '');
const sounds = buckets.by.filter(e => e.type === 'audio' && !music.includes(e));
for (const [url, rows] of groupBy(sounds, e => sourceUrls(e.source)[0])) {
  out.push('- **' + rows[0].author + '** · ' + assetIds(rows) + '。' + link(titleFromUrl(url), url));
}
out.push('', '## 需要署名的场景模型', '',
  '以下模型仍按 CC BY 3.0 提供。项目以 GLB 收录，部分模型调整了比例、原点、顶点色或材质，具体制作记录见素材清单。[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)',
  '', '| 游戏素材 | 作者 | 原作链接 |', '| --- | --- | --- |');
const byModels = buckets.by.filter(e => e.type === 'model');
for (const e of byModels) out.push('| `' + e.id + '` | ' + e.author + ' | ' + link(e.sourceTitle, sourceUrls(e.source)[0]) + ' |');

out.push('', '## 中文字体', '',
  '游戏随附' + (['零', '一', '两', '三', '四', '五', '六', '七', '八', '九'][buckets.fonts.length] || buckets.fonts.length) + '份字体及各自的版权声明、SIL Open Font License 1.1 全文。重新分发字体时请一同保留这些文件。', '',
  '| 字体 | 作者 | 来源与随附许可 |', '| --- | --- | --- |');
for (const e of buckets.fonts) {
  const base = path.basename(e.file).replace(/\.(ttf|otf|woff2?)$/, '').replace(/-Regular$/, '');
  const family = base.replace(/-UI$/, '');   // a shipped subset (-UI) is credited under its font's name
  const dir = path.posix.dirname(e.file);
  const licName = [base, family].map((n) => 'OFL-' + n + '.txt').find((n) => fs.existsSync(path.join(root, 'assets', dir, n))) || 'OFL-' + family + '.txt';
  const license = 'assets/' + dir + '/' + licName;
  out.push('| ' + family + ' | ' + e.author + ' | ' + link('字体项目', sourceUrls(e.source)[0]) + ' · ' + link('OFL 与版权声明', license) + ' |');
}

out.push('', '## CC0 素材来源', '',
  '感谢下列创作者公开模型、纹理、动作和声音。这里自愿记录作者与来源，使用 CC0 素材无需署名。同一作者的素材包以发布页面索引，各文件与作者的对应关系见清单。[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) · [逐项素材清单](assets/manifest.json)', '',
  fs.readFileSync(path.join(root, 'tools/costume/textures/CREDITS.md'), 'utf8').trimEnd(), '');
for (const [name, rows] of [...groupBy(buckets.cc0, cc0Author)].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  out.push('- **' + name + '** · ' + rows.length + ' 项。' + cc0Sources(rows));
}
out.push('', '## 同人角色与项目美术', '',
  '- 伊蕾娜的学徒装与旅行装、芙兰、沙耶等八个演员模型由项目的角色工具制作。几何、服装和配色依原作设计进行同人改编。人形骨架源于 pixiv 的 CC0 样例 HairSample_Female。原作角色设计归相应权利人。[角色生成工具](tools/journey/build-cast.mjs) · [pixiv 样例授权](https://vroid.pixiv.help/hc/en-us/articles/4402614652569)',
  '- 基础项目的旅行装与两套水着分别记录了网格、纹样或骨架来源。水着设计参考伊蕾娜相关角色商品。中文字标经图像生成、抠图和逐字校对。早期天空绘景使用了图像生成辅助。[服装制作工具](tools/costume/) · [字标与天空的素材记录](assets/manifest.json)',
  '- 对话立绘与衣装卡是以图像模型绘制的同人插画。服装与配色以游戏内角色模型的渲染为参考，画风统一参照伊蕾娜的第一张立绘，再经抠图与逐张挑选。未使用任何官方图像作为输入。原作角色设计归相应权利人。[立绘与衣装卡的素材记录](assets/manifest.json)',
  '- 清单明确标为 CC0 的项目自制基础模型、道具和动作共 ' + buckets.projectCC0.length + ' 项。这些条目保留各自的许可和制作说明。[自制模型生成器](tools/sculpt/) · [动作工具](tools/anim/)',
);
const projectGroups = groupBy(buckets.project.filter(e => !/^bgm_/.test(e.id)), e => e.license);
out.push('', '项目制作记录也可按清单标识查找。', '');
for (const entries of projectGroups.values()) {
  const sample = entries[0];
  const source = sample.source.split(/[: ]/)[0];
  const reference = source.startsWith('tools/') && fs.existsSync(path.join(root, source))
    ? ' ' + link('制作工具', source) : '';
  out.push('- ' + assetIds(entries) + reference);
}
const remaining = [...buckets.other, ...buckets.by.filter(e => !byModels.includes(e) && !music.includes(e) && !sounds.includes(e))];
if (remaining.length) {
  out.push('', '## 其他逐项授权', '');
  for (const e of remaining) out.push('- `' + e.id + '` · ' + e.author + ' · ' + e.license + '。' + e.source);
}
out.push('', '## 程序库', '',
  '- three.js（MIT）与 Rapier（Apache-2.0）提供渲染和物理功能。[three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE) · [Rapier](https://github.com/dimforge/rapier/blob/master/LICENSE)',
  '- esbuild（MIT）用于打包，Electron（MIT）提供桌面外壳。[esbuild](https://github.com/evanw/esbuild/blob/main/LICENSE.md) · [Electron](https://github.com/electron/electron/blob/main/LICENSE)',
  '- 第三方代码（Third-party code）：扫帚尾流在草地与水面留下的印迹、扬起的花瓣与水花的做法改编自 Petalwake（MIT，Copyright (c) 2026 Jacob Miller），许可声明见 `src/world/flora/wake-field.js` 与 `src/world/water/wake-spray.js` 文件头。 [Petalwake](https://github.com/jjcm/petalwake)',
  '', '维护素材清单后，运行 `node tools/gen-credits.mjs` 即可重新生成此页。', '');
fs.writeFileSync(path.join(root, 'CREDITS.md'), out.join('\n'));
