<!--
Read CONTRIBUTING.md first: open an issue, claim it with a /claim comment, then open the pull request. A pull request without a claim fails the "Claim check".
-->

Closes #<!-- the issue number you claimed -->

Claimed: <!-- link to the bot's claim confirmation comment -->

Depends on: <!-- #N of pull requests this builds on or conflicts with; delete the line if none -->

### What and why

<!-- What this changes and the problem from the issue it solves. -->

### Player-visible effect

<!-- Where and when a player notices the difference. -->

### Play time and difficulty

<!--
Unchanged / longer / shorter; harder / easier. Shorter trips, faster travel or easier play need a reason here and the maintainer's OK in the issue.
-->

### Tested

<!--
Commands you ran and scenes you checked. Visual changes need in-game screenshots or a GIF.
-->

- [ ] `node tools/check-i18n.mjs src`
- [ ] `node tools/dead-code.mjs`
- [ ] relevant acceptance: `node tools/acceptance/journey-<name>.mjs`

AI-assisted: <!-- yes / no -->

### Checklist

- [ ] Player-visible text lives in `src/locales/zh-CN/` and is read with `t()` / `raw()`.
- [ ] Old saves still load; new save fields have defaults in `src/core/save.js`.
- [ ] No anime stills, official art or music; images in the README and docs are in-game captures.
- [ ] Dialogue, foes and landmarks are original; no names, characters, looks or levels from other games.
- [ ] No new runtime dependencies, no three/rapier bumps.
- [ ] New content scales with the quality tier; the mobile tier was tried too.
- [ ] Third-party assets are CC0 or CC-BY only, and listed in `assets/manifest.json` and `CREDITS.md`.
