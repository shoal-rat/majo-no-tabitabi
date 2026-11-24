// 玩家（伊蕾娜）与镜头的提示词条
export default {
  noMana: '魔力见底了，扫帚只好慢慢落下……',
  noBroom: '读完家中的旅行记后，就可以骑扫帚了。',
  noDango: '面包吃完了。',
  ownFire: '自己点的野火也会烫脚——快离开火圈！',
  fullHp: '肚子还饱着呢。',
  // 攀爬、游泳与气力（player/climb.js、player/move-hints.js）
  move: {
    climb: '岩壁和墙都能攀：贴上去就会抓住。{jump} 向上一跃，往下拉再按 {jump} 蹬开，{dodge} 松手。肩旁的花环是气力。',
    winded: '气力用完了。站在平地上歇一歇，花环满了才能再跑、再攀、再快游。',
    swim: '深水里游也费气力，按住 {sprint} 快游，{dodge} 划一大把。气力耗尽会沉下去，随时 {broom} 唤帚就能出水。',
    dive: '贴着水面飞时按住 {descend}，就能从扫帚上一头扎进水里。',
    slide: '顺着坡跑时按住 {descend} 可以一路滑下去，左右可以拐弯。',
    drowned: '没力气了……被水推回了岸边。',
    eave: '屋檐上没有落脚的地方，屋顶还是骑扫帚上去吧。',
  },
};
