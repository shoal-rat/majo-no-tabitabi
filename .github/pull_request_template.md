<!--
先读 CONTRIBUTING.md：先发议题，在议题下评论 /claim 认领，再开 PR。没有认领的 PR 过不了「Claim check」。
Read CONTRIBUTING.md first: open an issue, claim it with a /claim comment, then open the pull request.
-->

Closes #<!-- 你认领的议题号 · the issue number you claimed -->

认领 · Claimed: <!-- 机器人确认认领的那条评论的链接 · link to the bot's claim confirmation -->

依赖 · Depends on: <!-- 这个 PR 建立在哪些 PR 之上或与之冲突，写 #N；没有就删掉这一行 · #N of pull requests this builds on or conflicts with; delete the line if none -->

### 改了什么，为什么 · What and why

<!-- 改动内容，以及它解决了议题里的哪个问题。· What this changes and the problem from the issue it solves. -->

### 玩家能看到的变化 · Player-visible effect

<!-- 玩家在哪里、做什么时会注意到不同。· Where and when a player notices the difference. -->

### 游玩时长与难度 · Play time and difficulty

<!--
不变 / 变长 / 变短；更难 / 更容易。缩短旅途、加快赶路或降低难度的改动，要写清理由，并且议题里已经得到维护者同意。
Unchanged / longer / shorter; harder / easier. Shorter trips, faster travel or easier play need a reason here and the maintainer's OK in the issue.
-->

### 测试 · Tested

<!--
跑过的命令和看过的场景。画面相关的改动附实机截图或 GIF。
Commands you ran and scenes you checked. Visual changes need in-game screenshots or a GIF.
-->

- [ ] `node tools/check-i18n.mjs src`
- [ ] `node tools/dead-code.mjs`
- [ ] 相关验收 · acceptance: `node tools/acceptance/journey-<name>.mjs`

AI 协助 · AI-assisted: <!-- 是 / 否 · yes / no -->

### 自查 · Checklist

- [ ] 玩家能看到的文字都在 `src/locales/zh-CN/`，用 `t()` / `raw()` 读取。· Player-visible text lives in the locale files.
- [ ] 旧存档照常读取；新的存档字段在 `src/core/save.js` 里有默认值。· Old saves still load; new save fields have defaults.
- [ ] 没有番剧截图、官方美术或音乐；README 和文档里的图都是实机画面。· No anime stills, official art or music; images are in-game captures.
- [ ] 对白、敌人和地标是原创，没有用其他游戏的名字、角色、外观或关卡。· Dialogue, foes and landmarks are original.
- [ ] 没有新增运行时依赖，也没有升级 three 或 rapier。· No new runtime dependencies, no three/rapier bumps.
- [ ] 新内容的数量随画质档位缩放，手机档（mobile）也试过。· New content scales with the quality tier, mobile included.
- [ ] 第三方素材只用 CC0 或 CC-BY，并登记在 `assets/manifest.json` 和 `CREDITS.md`。· Third-party assets are CC0/CC-BY and credited.
