# Contributing

Welcome. This is a non-profit fan project maintained by [shoal-rat](https://github.com/shoal-rat). So that nobody edits the same spot as someone else, and every change has a stated purpose before work starts, all changes follow one path: **open an issue, claim it, then open a pull request**.

Just want to report a small problem? Leave a comment in the pinned [feedback thread #7](https://github.com/shoal-rat/majo-no-tabitabi/issues/7). No claim needed.

## Flow

1. **Open an issue.** Use the Proposal template for a change you want to make, or the Bug report template for a problem. Blank issues are disabled; pick a template.
2. **Claim it.** To work on it yourself, comment `/claim` on the issue. The bot assigns the issue to you, adds the `claimed` label and replies with the claim's expiry.
3. **Open a PR.** Branch from `main`, make one focused change, run the checks, then open the PR. Fill in the PR template and put `Closes #<issue>` on the first line.
4. **Merge.** Once the build and the Claim check both pass, the maintainer reviews and merges.

## Writing an issue

One issue, one subject. Fill in every field of the Proposal template:

- **Area**: pick from the dropdown; names match the systems in `systems.manifest.json`. Use "other" for docs, tools and the like.
- **Problem or goal**: what is wrong now, or what you want to achieve.
- **Proposed change**: the approach, and which files it touches.
- **Player-visible effect**: where and when a player would notice.
- **Effect on play time and difficulty**, with a reason (see "Play time" below).
- **How to verify**: which acceptance script to run, which scene or screenshot to check.
- **Whether AI helped.**

For visual problems attach an in-game screenshot. Do not post anime stills or official art.

## Claim rules

- Comment `/claim` to claim, `/unclaim` to release. Only one claimer per issue at a time.
- If someone already holds the claim, the bot tells you who. Talk to them in the issue about splitting the work.
- A claim with no pull request and no progress comment for 7 days is released automatically. An open PR keeps the claim alive; a progress comment restarts the 7 days.
- The claimer and the maintainer can both `/unclaim`. The maintainer can also change the assignment directly.
- Sometimes GitHub refuses to assign the issue to you. Then the bot only adds the `claimed` label and names the claimer in a comment; the effect is the same.

## Pull request rules

- Put `Closes #<issue>` (`Fixes` or `Resolves` also work) in the PR description, and the issue must be claimed by you. The Claim check verifies this and, on failure, explains why and how to fix it. Editing the PR description or pushing again after claiming reruns the check.
- One PR, one change. No drive-by formatting sweeps, bulk renames or rewrites of unrelated code.
- Follow the template: what changed and why, the player-visible effect, the effect on play time and difficulty, which commands you ran and which scenes you checked. For visual changes attach a screenshot or GIF, and it must be in-game footage.
- At minimum run `node tools/check-i18n.mjs src` and `node tools/dead-code.mjs`, plus the acceptance scripts (`tools/acceptance/`) relevant to your change.
- Player-visible text goes in `src/locales/zh-CN/`; old saves must still load; no new runtime dependencies; the amount of new content scales with the quality tier, and test the mobile tier too. The full conventions are in [AGENTS.md](AGENTS.md).
- If AI helped, say so in the PR. When you let an AI agent work on it, have it read [AGENTS.md](AGENTS.md) first.
- PRs from the maintainer and bots need no claim. #9 and #10 were opened before this rule and are exempt too.

## Play time

The game is a slow journey: fly a broom over open country, stop along the way, look at the scenery, help people with small things. Any change that shortens trips, speeds up travel or makes the game easier needs a reason in the issue and the maintainer's agreement first, or it will not be merged. Adding more things to do and see along the way is always welcome.

## Where to start reading

- [docs/JOURNEY.md](docs/JOURNEY.md): the game's setting and design; it wins over every other document.
- [AGENTS.md](AGENTS.md): the fixed conventions and the checks you must run.
- `docs/api/<system>.md`: implementation notes for each system.
