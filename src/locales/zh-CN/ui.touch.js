// 简体中文 — 触屏操作（手机、平板横屏）：按钮名、句子里提到按键时的叫法、设置项、操作说明、横屏提示。
// 翻译成别的语言时：只改值，不改键。
export default {
  // 按钮旁的小字与读屏用的名字
  btn: {
    attack: '魔力弹', cast: '施法', swap: '换魔法', jump: '跳跃', climb: '上升', descend: '下降', dodge: '闪身',
    guard: '防护', broom: '唤帚', dismount: '下帚', interact: '互动', sprint: '疾跑', boost: '加速', heal: '面包',
    lock: '锁定', summon: '使魔', ultimate: '金环', map: '地图', menu: '暂停', skip: '跳过',
    thread: '星线', rewind: '溯光', craftTurn: '转向', craftTilt: '翻转', craftNear: '拉近', craftFar: '推远',
  },
  // 句子里的 {key}（教学提示、敌人蓄力的提醒）：触屏时说按钮的名字
  key: {
    attack: '「魔力弹」', cast: '「施法」', jump: '「跳跃」', descend: '「下降」', sprint: '「疾跑」', dodge: '「闪身」',
    broom: '「唤帚」', interact: '「互动」', guard: '「防护」', heal: '「面包」', lock: '「锁定」', summon: '「使魔」',
    ultimate: '「金环」', map: '「地图」', journal: '「暂停」', spellbook: '「暂停」', pause: '「暂停」', cancel: '「跳过」',
    wheel: '「换魔法」', el1: '「换魔法」', el2: '「换魔法」', el3: '「换魔法」', el4: '「换魔法」', el5: '「换魔法」',
    el6: '「换魔法」', el7: '「换魔法」', el8: '「换魔法」',
    forward: '摇杆', back: '摇杆', left: '摇杆', right: '摇杆', confirm: '轻触',
    thread: '「星线」', rewind: '「溯光」',
  },
  titleHint: '轻触想去的地方',
  wheelHint: '轻触想用的魔法　点空白处收起',
  skipHold: '按住跳过',
  mapHint: '一指拖动挪移　两指张合远近',
  // 竖着拿手机时
  turn: {
    title: '把手机横过来吧',
    text: '旅途的风景是横着展开的——竖着看，连扫帚都放不下。',
  },
  // iPhone 的 Safari 不能直接全屏
  ios: '想要全屏？在 Safari 里点「分享」，选「添加到主屏幕」，再从主屏幕打开。',
  // 设置
  set: {
    head: '触屏',
    touch: '触屏按钮',
    auto: '自动', on: '显示', off: '收起',
    size: '按钮大小',
    alpha: '按钮浓淡',
    sens: '拖动转视角',
  },
  // 标题画面的「操作」页（触屏时）
  guide: {
    move: '移动与视角',
    buttons: '右手边的按钮',
    other: '其他',
    stick: '左半边屏幕按住拖动，就是摇杆。推得越远，走得越快。',
    look: '右半边屏幕拖动，转动视角。按住「魔力弹」或「施法」再拖，可以一边瞄准一边施放。',
    attack: '魔力弹：轻点射一发，按住连发。',
    cast: '施法：轻点放出小式；按住蓄满再松开，放出大式。',
    swap: '换魔法：轻点换成下一种，按住打开魔法轮盘。',
    jump: '跳跃：骑在扫帚上时按住就是上升。',
    descend: '下降：骑在扫帚上时按住。',
    dodge: '闪身：带一瞬无敌的冲刺。',
    guard: '防护：按住撑起光盾，看准时机张开能把法术弹回去。',
    broom: '唤帚：唤出扫帚骑上去，再点一次就落地收起。',
    sprint: '疾跑：轻点切换；骑扫帚时是加速。',
    heal: '面包：吃一个，恢复体力。',
    interact: '互动：走近人或物件时才会出现，上面写着能做什么。',
    corner: '右上角是地图和暂停；对话时轻触屏幕往下读。',
    skip: '过场里按住「跳过」，可以直接看结果。',
  },
};
