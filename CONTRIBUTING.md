# 参与开发

欢迎一起把这段旅行做得更好。这是一个非营利的同人项目，维护者是 [shoal-rat](https://github.com/shoal-rat)。为了不让几个人同时改同一处、也让每个改动在动手前就有个说法，所有改动都走同一个流程：**先发议题，认领，再开 PR**。

只是想报告一个小问题？直接到置顶的[问题反馈专帖 #7](https://github.com/shoal-rat/majo-no-tabitabi/issues/7) 留言就行，不需要认领。

## 流程

1. **发议题。** 用「改进提案」模板写想做的改动，或用「问题反馈」模板写遇到的问题。空白议题已经关闭，请选一个模板。
2. **认领。** 想自己动手，就在议题下评论 `/claim`。机器人会把议题指派给你，贴上 `claimed` 标签，并回复认领的有效期。
3. **开 PR。** 从 `main` 拉一个分支，做一件事，跑完检查后开 PR。PR 描述按模板填写，第一行写 `Closes #议题号`。
4. **合并。** 构建检查和认领检查（Claim check）都通过后，由维护者审阅、合并。

## 议题怎么写

一个议题只写一件事。「改进提案」模板里的每一项都要填：

- **涉及的系统**：从下拉框里选，名字和 `systems.manifest.json` 里的系统一致；文档、工具之类选「其他」。
- **问题或目标**：现在哪里不好，或者想达到什么效果。
- **打算怎么改**：大致做法，会动到哪些文件。
- **玩家能看到的变化**：玩家在哪里、做什么时会注意到。
- **对游玩时长和难度的影响**，以及理由（见下文「游玩时长」）。
- **怎么验证**：要跑哪个验收脚本，要看哪个场景或截图。
- **是否用 AI 协助**。

画面上的问题请附实机截图。不要贴番剧截图或官方美术。

## 认领规则

- 评论 `/claim` 认领，评论 `/unclaim` 放弃。一个议题同一时间只有一个认领人。
- 已经有人认领时，机器人会告诉你是谁。可以在议题里和对方商量分工。
- 认领后 7 天内既没有开 PR，也没有在议题里留进度评论，认领会自动释放。开着的 PR 会让认领一直有效；留一条进度评论，7 天重新计算。
- 认领人和维护者都可以 `/unclaim`。维护者也可以直接调整指派。
- 有时 GitHub 不允许把议题指派给你。这时机器人只贴 `claimed` 标签，并在评论里写下认领人，效果一样。

## PR 规则

- PR 描述里写 `Closes #议题号`（`Fixes`、`Resolves` 也可以），而且这个议题要由你认领。认领检查会核对这一点，没通过时会说明原因和补救办法。认领之后编辑一下 PR 描述或再推送一次，检查就会重跑。
- 一个 PR 只做一件事。不要顺手大面积改格式、批量改名或重写不相关的代码。
- 按模板写清楚：改了什么、为什么，玩家能看到的变化，对游玩时长和难度的影响，跑过哪些命令、看过哪些场景。画面相关的改动附截图或 GIF，必须是实机画面。
- 至少跑过 `node tools/check-i18n.mjs src` 和 `node tools/dead-code.mjs`，再加上和改动相关的验收脚本（`tools/acceptance/`）。
- 玩家能看到的文字放进 `src/locales/zh-CN/`；旧存档要能照常读取；不加新的运行时依赖；新内容的数量随画质档位缩放，手机档也要试。完整的约定在 [AGENTS.md](AGENTS.md)。
- 用了 AI 协助就在 PR 里写明。让 AI 代理参与时，先让它读 [AGENTS.md](AGENTS.md)。
- 维护者和机器人的 PR 不需要认领。#9 和 #10 在这条规则之前提交，也不受影响。

## 游玩时长

这个游戏是一段慢慢走的旅行：骑扫帚飞过原野，在路上停下来，看风景，帮人做点小事。任何让旅途变短、赶路变快或者让游戏变容易的改动，都要在议题里说明理由，并先得到维护者同意，否则不会合并。让路上多一些可做、可看的事情，永远欢迎。

## 从哪里开始读

- [docs/JOURNEY.md](docs/JOURNEY.md)：这款游戏的设定和设计，和其他文档冲突时以它为准。
- [AGENTS.md](AGENTS.md)：不能改动的约定和必须运行的检查。
- `docs/api/<系统名>.md`：各个系统的实现说明。

---

## Contributing (English)

Every change follows one path: **open an issue, claim it, then open a pull request.** Small bug reports can go straight into the pinned [feedback thread #7](https://github.com/shoal-rat/majo-no-tabitabi/issues/7) and need no claim.

1. **Issue.** Use the Proposal template for a change or the Bug report template for a problem. Blank issues are off. Fill in every field: area (system names from `systems.manifest.json`), problem or goal, proposed change, player-visible effect, effect on play time and difficulty with a reason, how to verify, and whether AI helped.
2. **Claim.** Comment `/claim` on the issue. The bot assigns it to you, adds the `claimed` label and replies with the expiry date. One claimer per issue. A claim with no pull request and no progress comment for 7 days is released automatically; an open pull request keeps it alive. Comment `/unclaim` to let it go (the maintainer can too). If GitHub can't assign you, the label and the bot's comment record the claim instead.
3. **Pull request.** Branch from `main`, make one focused change, and fill in the template. The description must contain `Closes #<issue>` for an issue you claimed; the Claim check enforces this and explains how to fix a failure. Run `node tools/check-i18n.mjs src`, `node tools/dead-code.mjs` and the acceptance scripts for the systems you touched. Visual changes need in-game screenshots or a GIF. Say whether AI helped. Project rules are in [AGENTS.md](AGENTS.md).
4. **Merge.** Once the build and the Claim check pass, the maintainer reviews and merges.

The maintainer, bots, and the pull requests opened before this rule (#9, #10) are exempt from the claim check.

**Play time.** The game is a slow journey. A change that shortens trips, speeds up travel or makes the game easier needs a reason and the maintainer's agreement in the issue first. More things to do and see along the way are always welcome.

Start with [docs/JOURNEY.md](docs/JOURNEY.md), the source of truth for the game's design, then [AGENTS.md](AGENTS.md) and the `docs/api/` page of the system you are changing.
