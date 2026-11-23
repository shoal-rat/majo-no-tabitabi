# AGENTS.md
<!-- agent codebook + rules. read §key first. humans: README.md, docs/JOURNEY.md -->

## key
grammar: 1 rule/line = `TAG scope: rule`. scopes compose with `/` (text/ui). `|` = or. `→` = then/implies. `∈` = only in.
TAG: M=must · N=never · F=fixed decision, do not change · V=verify (run) · R=read
lexicon:
- `x` (backticks) = repo path x · $x = shell cmd x
- G = runtime global (G.world, G.fx, G.spells, G.quality …)
- loc = src/locales/zh-CN/<ns>.js; read via t()/raw(); ns filename starts with owning system name
- J = docs/JOURNEY.md (source of truth; wins all conflicts)
- api = docs/api/<system>.md; trailing "round/as built" sections = this game
- moon = inherited Moonveil engine docs (docs/DESIGN.md + early api sections: shrine/灵诀/影祟/月帷)
- play = $node tools/play.mjs (headless, throwaway profile, autostart=1 writes no save)
- acc = `tools/acceptance/journey-{story,activities,errands,flight,city-clouds,eclipse}.mjs`
- q = G.quality tier mobile|low|med|high (phones default mobile, ≥1080 lines)
- anchors = JOURNEY_ANCHORS `src/data/journey-map.js`
- ep1/ep2 = episode 1/2 · named = flag majo_named · finished = flag majo_finished
- claim = comment `/claim` on an issue → bot assigns commenter (fallback: label claimed + bot comment); 1 holder/issue; released after 7 days w/o linked open PR|progress comment; `/unclaim` releases. bot = `.github/scripts/claims.cjs`
rule: new abbreviation → add to §key first, then use.

## read
R start: J → api of touched system.
R moon: engine reference only; N apply its setting/story to this game.
R stack: JS + three 0.187 + `@dimforge/rapier3d-compat` 0.21; build `build.mjs` (esbuild); systems `systems.manifest.json` (init order = update order); no framework, no server.
R deploy: main → CI build → GitHub Pages (public). PR only; N push main.

## rules
M text: player-visible strings ∈ loc; keys in text as {action} placeholders (guard, cast, broom …). V $node tools/check-i18n.mjs src
M save: key majo_no_tabitabi_episodes_save_v1 immutable; new persistent field → default in `src/core/save.js` defaultState()|defaultSettings(); old saves load unchanged.
M test: play|acc only. N maintainer browser|desktop app|port 47327.
M code: cross-system access via optional chaining (G.fx?.x()); update(): N throw, N per-frame alloc, N full-scene walk.
M perf: new content count scales with q.
M asset: third-party ∈ CC0|CC-BY; row in `assets/manifest.json` via $node tools/manifest-patch.mjs + `CREDITS.md`.
M story: anchors moved → update quests/guards/tests together → V acc story.
N media: official anime stills|screenshots|art|music in repo or docs. README/docs images = in-game captures only.
N content: other games' names|characters|looks|levels. dialogue/foes/landmarks = original.
N deps: new runtime deps; three|rapier version bumps.
N diff: mass reformat|bulk rename|wholesale rewrite|unrelated changes in one PR.
N delete: code before $node tools/dead-code.mjs reports it unbundled.
N tests: loosen a check unless the game legitimately changed → state why in PR.
N commit: .tmp/|dist/|release/|secrets|absolute personal paths|personal data.
N refs: bare @path in agent-read docs (Claude Code imports the file into context) → paths in backticks.

## fixed
F look: default soft; vivid = setting; grass material saturation 100%.
F credits `src/locales/zh-CN/ui.js` credits: "Director: Shoal_Rat" · "github.com/shoal-rat" · "Claude Opus 5.5" · "Claude Fable 5.2" · "ChatGPT 5.2 Astra" verbatim.
F wardrobe: swimsuits unlock only after finished (heroine 14–15 in ep1); designs modest; during an active quest the story picks the outfit.
F city: City of Magic = vertical city (tall houses, tall gate, dim street canyons, life on balconies/broom). N shrink|lower|brighten canyons.
F readme: README.md = Chinese (default) · README.en.md = English · keep in sync.

## verify
V always: $node tools/check-i18n.mjs src · $node tools/dead-code.mjs
V story/map/city change: all acc.
V other change: acc touching the changed system.
V probe: play --name X --script f.js [--mobile] (helpers: header of `tools/play.mjs`).
V dev: $npm ci → $npm run serve (127.0.0.1:8751) · release: $npm run release

## contrib
R contrib: `CONTRIBUTING.md` (human-facing copy of these rules).
M flow: issue (template) → claim → branch from main → small focused change → V → PR via `.github/pull_request_template.md` → CI + Claim check green → maintainer merges.
M issue: 1 change/issue; template `.github/ISSUE_TEMPLATE/proposal.yml` (change) | `.github/ISSUE_TEMPLATE/bug.yml` (bug); every required field filled.
M pr body: `Closes #N` · what/why · player-visible effect · play-time/difficulty effect · how verified (cmds + scenes; screenshots|GIF if visual) · AI-assisted yes|no.
N pr: PR without own claim on the issue it closes (exempt: maintainer, bots, PRs #≤10).
N claim: issue held by someone else → ask in the issue instead.
F play time: change that shortens trips|speeds travel|eases difficulty → maintainer OK in the issue first.
V contrib bots: $node .github/scripts/claims.test.mjs after touching `.github/scripts/` or claim workflows.

## feedback
R reports: issue #7 (pinned, label feedback) · template `.github/ISSUE_TEMPLATE/bug.yml` · proposals: `.github/ISSUE_TEMPLATE/proposal.yml` (label proposal)
