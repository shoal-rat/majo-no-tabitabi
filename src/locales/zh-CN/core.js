// 简体中文 — 核心词条（语言信息、按键名、启动提示、八象、通用词）。
export default {
  meta: {
    name: '简体中文',
    // Faces shipped with this locale (assets/fonts/zh-CN, SIL OFL 1.1), loaded by src/core/fonts.js under these names.
    // Each is a WOFF2 subset of the characters the locale uses (tools/font-subset.mjs; `--check` after adding text); the
    // full TTFs beside them are only the rebuild sources. Every face declares the whole weight range so the browser never
    // fakes a bold over a brush stroke (a faked bold fills the kai modulation in and reads as plain print type at label sizes).
    fonts: [
      { family: 'MV WenKai', file: 'fonts/zh-CN/LXGWWenKaiLite-UI.woff2', weight: '100 900' },
      { family: 'MV Brush', file: 'fonts/zh-CN/MaShanZheng-UI.woff2', weight: '100 900' },
      { family: 'MV Running', file: 'fonts/zh-CN/ZhiMangXing-UI.woff2', weight: '100 900' },
      // the interface's display serif: a variable subset of Noto Serif SC, real weights 200-900
      { family: 'MV Serif', file: 'fonts/zh-CN/NotoSerifSC-UI.woff2', weight: '200 900' },
    ],
    // Hero inscriptions painted as images for this locale (assets/lettering/zh-CN, generated, see the manifest). A sign
    // whose whole text matches a key is drawn from the image instead of the font; other locales fall back to the font.
    lettering: {},
    // title: place names, chapter and window titles, banners; body: interface, dialogue; sign: signboards, inscriptions
    fontTitle: '"MV Brush", "Kaiti SC", "STKaiti", "KaiTi", "Songti SC", serif',
    fontBody: '"MV WenKai", "Kaiti SC", "STKaiti", "KaiTi", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSign: '"MV Running", "MV Brush", "Kaiti SC", "STKaiti", "KaiTi", serif',
    // display: the interface's headings, names, labels and numerals (docs/api/ui.md "Grimoire round")
    fontDisplay: '"MV Serif", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif',
  },
  title: '魔女之旅',
  boot: {
    waking: '正在唤醒大地……',
    assets: '正在取出行囊……',
    // 载入模型时：按已经到手的大小走进度；连接卡住、正在重新取某个文件时换成 retry（{got} / {total} 是 MB 数）
    bytes: '正在取出行囊…… {got} / {total} MB',
    retry: '连接不稳，正在重新取…… {got} / {total} MB',
    failed: '启动失败：',
    sky: '点亮天空……', terrain: '铺开山川……', flora: '种下草木……', landforms: '勾勒群山……', life: '唤来鸟雀与游鱼……', structures: '搭起街巷与屋顶……',
    physics: '唤醒万物之理……', elements: '调和水火风雷……', props: '摆放器物……', destruction: '记下大地的伤痕……', fx: '点起萤火……', audio: '调试弦音……',
    ui: '展开卷轴……', gameplay: '装好旅行行囊……', player: '唤醒伊蕾娜……', spells: '整理魔法笔记……', combat: '布置练习场……', story: '写下故事……',
  },
  key: {
    Space: '空格', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', Escape: 'Esc', Tab: 'Tab', Enter: '回车', Backspace: '退格',
    Mouse0: '左键', Mouse1: '中键', Mouse2: '右键', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  },
  interact: { default: '调查' },
  element: { fire: '火', water: '水', ice: '冰', wind: '风', thunder: '雷', earth: '岩', sun: '日', moon: '月' },
  status: { burning: '燃烧', wet: '湿润', frozen: '冻结', shocked: '感电', lit: '明亮' },
  major: { sun: '曦光', dusk: '薄暮', night: '常夜' },
};
