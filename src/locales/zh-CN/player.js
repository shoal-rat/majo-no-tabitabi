// 玩家（伊蕾娜）与镜头的提示词条
export default {
  noMana: '魔力见底了，扫帚只好慢慢落下……',
  noBroom: '读完家中的旅行记后，就可以骑扫帚了。',
  noDango: '面包吃完了。',
  ownFire: '自己点的野火也会烫脚——快离开火圈！',
  fullHp: '肚子还饱着呢。',
  // 攀爬、游泳与气力（player/climb.js、player/move-hints.js）
  move: {
    // 旅途手记里的提示（G.onboarding 的教练卡片：一句话 + 一个任务）
    climb: { line: '岩壁、石头和墙都能攀，贴上去就会抓住。肩旁的花环是气力。', task: '往上推着攀上去；{jump} 向上一跃，{dodge} 松手' },
    winded: { line: '气力用完了，花环变成了浅红。', task: '在平地上歇一歇，等花环满了再跑、再攀' },
    swim: { line: '深水里游也费气力。气力耗尽会沉下去——随时 {broom} 唤帚就能出水。', task: '按住 {sprint} 快游一段' },
    water_dive: { line: '贴着水面飞的时候，可以直接扎进水里。', task: '贴水面飞行时按住 {descend}' },
    slide: { line: '这坡够陡，可以滑下去。', task: '顺着坡跑时按住 {descend}，左右拐弯' },
    eave: { line: '屋檐上没有落脚的地方。', task: '屋顶还是骑扫帚上去吧：{broom}' },
    drowned: '没力气了……被水推回了岸边。',
  },
};
