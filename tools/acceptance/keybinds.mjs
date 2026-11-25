// 自定义键位（docs/keybind-handoff.md §7）：改键、冲突询问、存档往返、恢复默认、触屏路径、操作说明页跟随。
// 全部走真实 UI：打开设置页、点键位行、真的按键，不看 flag，只比 G.settings / G.input / DOM。
//   1. 改键 attack -> KeyK：G.settings.keys 记下来、bindings[0] 跟着变、keyLabels 显示 K
//   2. held / pressed 跟着新键走（sim.down('KeyK') 触发 attack）
//   3. 新键已被别的 action 占用：弹窗；选「算了」两边都不动；选「换过来」两边换位
//   4. 触屏路径不受影响：virtual.down('cast') 仍然触发 cast
//   5. 写入 settings 后重开页面：键还是新的，bindings 启动就应用
//   6. 操作说明页的行走键帽跟实际键位走（不再写死 WASD）
//   7. 「按键还原如初」回退，说明页跟着回 W
// 输出：MV_KEYBIND_QA 或 .tmp/journey-keybinds
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, serveGame } from '../../build.mjs';
import { launch, TMP } from '../cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.resolve(process.env.MV_KEYBIND_QA || path.join(TMP, 'journey-keybinds'));
await fs.mkdir(output, { recursive: true });
const bundle = await build({});
if (!bundle.ok) throw new Error(bundle.errors);
const { url, server } = await serveGame({ getBuild: async () => bundle });
const page = await launch({ width: 1280, height: 720 });
let failed = false;
const consoleErrors = [];
page.on('Runtime.consoleAPICalled', (m) => {
  if (m.type !== 'error') return;
  const line = m.args.map((a) => a.value ?? a.description).join(' ').slice(0, 600);
  consoleErrors.push(line);
  console.error(line);
});

const ready = async (mode) => {
  const deadline = Date.now() + 180000;
  const expr = mode === 'play'
    ? 'window.__mvReady===true&&!!window.__game&&!!window.__game.player&&!!window.__game.ui'
    : '!!window.__game&&!!window.__game.ui&&!!document.querySelector(".tt-menu .btn")';   // the title never sets __mvReady
  while (!(await page.evaluate(expr))) {
    if (Date.now() > deadline) throw new Error('boot timed out (' + mode + ')');
    await new Promise((r) => setTimeout(r, 150));
  }
};

try {
  // ===== 阶段 A：进游戏，改键与冲突询问 ==============================================================
  await page.goto(url + '?autostart=1&mute=1&quality=low&pr=1&dynres=0');
  await ready("play");
  const a = await page.evaluate(`(async()=>{
    const G=__game, T=__T;
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const out={};
    const rows=()=>[...document.querySelectorAll('.mv-set .row.key')];
    const clickEl=(n)=>{ if(n) n.click(); return !!n; };
    // REBIND 顺序：forward back left right jump descend sprint dodge broom interact attack …  attack 是第 11 个
    const IDX={forward:0, attack:10, autoForward:21};
    const setKey=async(name,code)=>{
      const r=rows()[IDX[name]]; if(!r) return false;
      r.click(); await sleep(340);            // 捕获态有 200 ms 去抖
      await T.press(code, 90); await sleep(260);
      return true;
    };
    const cap=()=>[...document.querySelectorAll('.mv-set .row.key .keycap')].map((n)=>n.textContent);

    G.ui.openMenu('settings');
    await sleep(300);
    out.rows = rows().length;
    out.rowsOk = out.rows === 22;

    // ---- 1. attack -> KeyK
    await setKey('attack','KeyK');
    out.rebind = {
      stored: G.settings.keys && G.settings.keys.attack,
      first: (G.input.bindings.attack || [])[0],
      label: G.input.keyLabel('attack'),
      caps: cap(),
    };
    out.rebind.ok = out.rebind.stored==='KeyK' && out.rebind.first==='KeyK' && out.rebind.label==='K' && out.rebind.caps.includes('K');

    // ---- 2. held / pressed 跟着新键走（要先关菜单：G.mode 回到 play，gameplay action 才认）
    G.ui.closeMenu(); await sleep(400);
    G.input.sim.down('KeyK');                       // 刚改成的新键
    out.follow = { held:G.input.held('attack'), pressed:G.input.pressed('attack') };
    G.input.sim.up('KeyK');
    G.input.sim.down('KeyW');                       // 默认键已经让给 forward，不该再触发攻击
    out.follow.oldCode = G.input.held('attack');
    G.input.sim.up('KeyW');
    out.follow.ok = out.follow.held === true && out.follow.pressed === true && out.follow.oldCode === false;
    G.ui.openMenu('settings'); await sleep(300);

    // ---- 3. 冲突：forward 想抢 KeyK
    await setKey('forward','KeyK');
    const box = document.querySelector('.mv-confirm');
    out.ask = { box:!!box, text: box ? box.textContent.replace(/\\s+/g,' ').trim().slice(0,90) : null };
    // 选「算了」：Escape = 取消
    await T.press('Escape', 60); await sleep(220);
    out.ask.cancelKept = {
      forward: G.settings.keys && G.settings.keys.forward,
      attack: G.settings.keys && G.settings.keys.attack,
      boxGone: !document.querySelector('.mv-confirm'),
    };
    out.ask.ok = out.ask.box && !out.ask.cancelKept.forward && out.ask.cancelKept.attack==='KeyK' && out.ask.cancelKept.boxGone;

    // ---- 3b. 再来一次，这次选「换过来」
    await setKey('forward','KeyK');
    const yes = document.querySelector('.mv-confirm .btn.red');
    out.swap = { box:!!yes, yes: clickEl(yes) };
    await sleep(300);
    out.swap.after = {
      forward: G.settings.keys && G.settings.keys.forward,
      attack: G.settings.keys && G.settings.keys.attack,
      forwardFirst: (G.input.bindings.forward || [])[0],
      attackFirst: (G.input.bindings.attack || [])[0],
      boxGone: !document.querySelector('.mv-confirm'),
    };
    out.swap.ok = out.swap.box && out.swap.after.forward==='KeyK' && out.swap.after.attack==='KeyW'
      && out.swap.after.forwardFirst==='KeyK' && out.swap.after.attackFirst==='KeyW' && out.swap.after.boxGone;

    // ---- 4. 留一个干净的改动给下一阶段：forward -> KeyI，然后关掉菜单（虚拟输入只在 play 模式生效）
    await setKey('forward','KeyI');

    // ---- 4b. 一键向前：默认空着 → 绑 KeyL；疾跑改成「切换」
    out.autoDefault = { len:(G.input.bindings.autoForward||[]).length, label:G.input.keyLabel('autoForward'), unbound:cap().includes('未设') };
    out.autoDefault.ok = out.autoDefault.len===0 && out.autoDefault.label==='' && out.autoDefault.unbound;
    await setKey('autoForward','KeyL');              // REBIND 末尾就是 autoForward
    out.autoBound = { stored:(G.settings.keys||{}).autoForward, first:(G.input.bindings.autoForward||[])[0], caps:cap() };
    out.autoBound.ok = out.autoBound.stored==='KeyL' && out.autoBound.first==='KeyL' && out.autoBound.caps.includes('L');

    const sprintRow = [...document.querySelectorAll('.mv-set .row')].find((r)=>{
      const lb=r.querySelector('.lb'); return !!lb && lb.textContent.trim()==='疾跑';
    });
    const toggleOpt = sprintRow ? [...sprintRow.querySelectorAll('.opt')].find((o)=>o.textContent.trim()==='切换') : null;
    out.sprintUi = { row:!!sprintRow, opt:!!toggleOpt, clicked: clickEl(toggleOpt) };
    await sleep(260);
    out.sprintUi.mode = G.settings.sprintMode;
    out.sprintUi.ok = out.sprintUi.row && out.sprintUi.clicked && out.sprintUi.mode==='toggle';

    try { G.save.writeSettings(); } catch(e) { G.reportError('qa:save', e); }
    const stored = JSON.parse(localStorage.getItem('majo_no_tabitabi_settings_v1')||'{}');
    out.saved = { forward: (stored.keys||{}).forward, attack: (stored.keys||{}).attack, auto: (stored.keys||{}).autoForward, sprint: stored.sprintMode };
    out.saved.ok = out.saved.forward==='KeyI' && out.saved.attack==='KeyW' && out.saved.auto==='KeyL' && out.saved.sprint==='toggle';

    // ---- 4c. 一键向前的行为：按一下走、再按停、后退解除
    G.ui.closeMenu(); await sleep(420);
    const moved=async(ms)=>{ const a={x:G.player.pos.x,z:G.player.pos.z}; await sleep(ms); return Math.hypot(G.player.pos.x-a.x, G.player.pos.z-a.z); };
    const base=await moved(420);                                    // 什么都不按
    await T.press('KeyL', 60); await sleep(140);
    const on0=G.player._S.autoFwd; const dAuto=await moved(520);
    await T.press('KeyL', 60); await sleep(140);
    const off0=G.player._S.autoFwd; const dStop=await moved(520);
    await T.press('KeyL', 60); await sleep(140);
    const on1=G.player._S.autoFwd;
    G.input.sim.down('KeyS'); await sleep(200); G.input.sim.up('KeyS');
    const afterBack=G.player._S.autoFwd;
    out.auto = { base:+base.toFixed(2), dAuto:+dAuto.toFixed(2), dStop:+dStop.toFixed(2), on0, off0, on1, afterBack };
    out.auto.ok = on0===true && off0===false && dAuto>0.35 && dStop<0.12 && on1===true && afterBack===false;

    // ---- 4d. 疾跑「切换」：按一下开、松手还在、再按关（forward 这一轮已经改成 KeyI）
    // 先挪到空地：前面一路走过去会撞上建筑进入 climb，而 climb 不走 stepGround，P.sprinting 就不更新了
    T.teleport(1390, -200); await sleep(450);
    G.input.sim.down('KeyI'); await sleep(220);
    await T.press('ShiftLeft', 60); await sleep(180);
    const sp1=G.player.sprinting;
    G.input.sim.up('KeyI'); await sleep(200); G.input.sim.down('KeyI'); await sleep(220);
    const sp2=G.player.sprinting;                                   // 松开再走，切换式还锁着
    await T.press('ShiftLeft', 60); await sleep(180);
    const sp3=G.player.sprinting;
    G.input.sim.up('KeyI');
    out.sprint = { on:sp1, stays:sp2, off:sp3 };
    out.sprint.ok = sp1===true && sp2===true && sp3===false;

    // ---- 3c. 触屏路径：按 action 名驱动，不受改键影响（菜单要让开，G.mode 才是 play）
    out.mode = G.mode;
    G.input.virtual.down('cast');
    out.touch = { held:G.input.held('cast'), pressed:G.input.pressed('cast') };
    G.input.virtual.up('cast');
    out.touch.ok = out.touch.held === true && out.touch.pressed === true;
    return out;
  })()`);

  // ===== 阶段 B：重开页面，键位还在 ==================================================================
  await page.goto(url + '?autostart=1&mute=1&quality=low&pr=1&dynres=0');
  await ready("play");
  const b = await page.evaluate(`(async()=>{
    const G=__game;
    const out={};
    out.keys = { forward:(G.settings.keys||{}).forward, attack:(G.settings.keys||{}).attack };
    out.live = { forward:(G.input.bindings.forward||[])[0], attack:(G.input.bindings.attack||[])[0], label:G.input.keyLabel('forward') };
    // 副键按 §6-2 的决定保留（方向键仍能前进）；被 attack 拿走的首选键 KeyW 才必须让路
    const staleKeyW = (G.input.bindings.forward||[]).includes('KeyW');
    out.ok = out.keys.forward==='KeyI' && out.keys.attack==='KeyW'
      && out.live.forward==='KeyI' && out.live.attack==='KeyW' && out.live.label==='I' && !staleKeyW;
    out.auto = { stored:(G.settings.keys||{}).autoForward, first:(G.input.bindings.autoForward||[])[0] };
    out.sprintMode = G.settings.sprintMode;
    out.sprintOk = out.sprintMode==='toggle';
    out.autoOk = out.auto.stored==='KeyL' && out.auto.first==='KeyL';
    return out;
  })()`);

  // ===== 阶段 C：标题界面 —— 操作说明页跟随键位、还原如初 ============================================
  await page.goto(url + '?mute=1&quality=low&pr=1&dynres=0');
  await ready("title");
  const c = await page.evaluate(`(async()=>{
    const G=__game, T=__T;
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const out={};
    const byText=(sel,txt)=>[...document.querySelectorAll(sel)].find((n)=>n.textContent.includes(txt));
    const moveCaps=()=>{
      const row=[...document.querySelectorAll('.mv-ctl .row')].find((r)=>{
        const d=r.querySelector('.ds .tx')||r.querySelector('.ds');
        return !!d && d.textContent.trim()==='移动';
      });
      return row ? [...row.querySelectorAll('.keycap')].map((n)=>n.textContent) : null;
    };
    await sleep(900);
    const openControls=async()=>{ const b=byText('.tt-menu .btn','操作'); if(!b) return false; b.click(); await sleep(420); return !!document.querySelector('.mv-ctl'); };
    const closeSheet=async()=>{ await T.press('Escape',60); await sleep(300); };

    out.opened = await openControls();
    out.moved = moveCaps();
    out.movedOk = !!out.moved && out.moved[0]==='I';
    await closeSheet();

    // 还原如初
    const setBtn = byText('.tt-menu .btn','设置');
    out.settingsOpened = !!setBtn;
    if (setBtn) { setBtn.click(); await sleep(480); }
    const resetRow = [...document.querySelectorAll('.mv-set .row')].find((r)=>r.textContent.includes('按键还原如初'));
    out.resetClicked = !!resetRow; if (resetRow) resetRow.click();
    await sleep(320);
    out.afterReset = { keys: G.settings.keys ? Object.keys(G.settings.keys) : null, forward:(G.input.bindings.forward||[])[0] };
    await closeSheet();

    out.reopened = await openControls();
    out.defaults = moveCaps();
    out.defaultsOk = !!out.defaults && out.defaults[0]==='W';
    await closeSheet();
    out.ok = out.opened && out.movedOk && out.settingsOpened && out.resetClicked
      && (out.afterReset.keys||[]).length===0 && out.afterReset.forward==='KeyW'
      && out.reopened && out.defaultsOk;
    return out;
  })()`);

  const ok = (label, cond, extra) => { if (!cond) failed = true; console.log((cond ? '  ok   ' : '  FAIL ') + label + (cond ? '' : ' ' + JSON.stringify(extra ?? ''))); };
  ok('设置页列出 22 个可改键', a.rowsOk, { rows: a.rows });
  ok('attack 改成 K：存档 / bindings / 键帽都变', a.rebind.ok, a.rebind);
  ok('held / pressed 跟着新键走', a.follow.ok, a.follow);
  ok('冲突弹窗出现，选「算了」两边不动', a.ask.ok, a.ask);
  ok('选「换过来」两边换位', a.swap.ok, a.swap);
  ok('一键向前默认未绑定（显示「未设」）', a.autoDefault.ok, a.autoDefault);
  ok('一键向前改成 L', a.autoBound.ok, a.autoBound);
  ok('设置里疾跑改成「切换」', a.sprintUi.ok, a.sprintUi);
  ok('触屏按 action 名驱动仍有效', a.touch.ok, a.touch);
  ok('写入 settings', a.saved.ok, a.saved);
  ok('一键向前：按一下走 / 再按停 / 后退解除', a.auto.ok, a.auto);
  ok('疾跑切换：按一下开、松手还在、再按关', a.sprint.ok, a.sprint);
  ok('重开页面后键位还在且已应用', b.ok, b);
  ok('重开页面后疾跑方式仍是切换', b.sprintOk, { mode: b.sprintMode });
  ok('操作说明页行走键帽跟随改键', c.movedOk, c.moved);
  ok('「按键还原如初」回退', c.ok, { after: c.afterReset, defaults: c.defaults });
  console.log(JSON.stringify({ a, b, c }, null, 1));
  if (consoleErrors.length) { failed = true; console.error('console errors:', consoleErrors); }
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ a, b, c }, null, 1));
  console.log((failed ? 'FAIL' : 'PASS') + ' — ' + output);
} finally {
  await page.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
