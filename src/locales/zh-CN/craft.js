// 简体中文 — 手艺：牵星线、结星、溯光（src/craft/）
export default {
  learned: '学会了「{name}」。',
  banner: '习得本事',
  art: {
    thread: { name: '牵星线', desc: '从魔杖尖牵出一缕金线，牵住木头、木箱、木桶这类东西，搬到想放的地方，还能转动它的方向。' },
    rewind: { name: '溯光', desc: '让一样东西的来路倒着流回去：倒下的树站起来，碎石合拢，烧焦的地方返青。' },
  },
  toast: {
    unknown: '还不会这门手艺。',
    nothing: '星线够不着能牵的东西。',
    heavy: '太沉了，星线提不起来。',
    noMana: '魔力不够，星线松开了。',
    capParts: '一件东西最多系 {n} 块，星结系不上了。',
    capWorld: '四处的星结太多了，先解开几处吧。',
    snipped: '解开了 {n} 处星结。',
    noPast: '这里没有可以溯回的痕迹。',
  },
  // 旅途手记里的提示（G.onboarding 的教练卡片：一句话 + 一个任务）
  tips: {
    catch: { line: '芙兰说过，魔女搬柴可不用手：从杖尖牵一缕线出来。', task: '按 {thread} 取出星线，对准木头按 {attack} 牵住它' },
    tie: { line: '放下的时候贴着另一根，线会自己打个结。', task: '把它贴在别的木头上，按 {attack} 放开——系上星结；{cast} 解开' },
    sail: { line: '系在木筏上的小帆会吃风。', task: '朝帆吹一阵风' },
    rewind: { line: '把瓦片放回去的那一刻，像是摸到了时间的来路。', task: '按 {rewind} 点亮溯光，对准坏掉的东西按 {attack}' },
  },
  site: {
    mend: '路边倒着一盏碎掉的灯笼柱。',
    mended: '灯笼柱回到了原来的样子。气力变得更足了。',
  },
};
