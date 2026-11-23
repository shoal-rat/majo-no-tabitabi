// Claim bot: `/claim` and `/unclaim` on issues, daily expiry, and the pull-request claim check.
// Runs inside actions/github-script, which passes { github, context, core }. Rules: CONTRIBUTING.md.
// Tests: node .github/scripts/claims.test.mjs
'use strict';

const CLAIM_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_PRE_RULE_PR = 10; // #9 and #10 were opened before the claim rule
const LABEL = { name: 'claimed', color: 'fbca04', description: '已有人认领 · someone is working on this' };
const BOT = 'github-actions[bot]';
const RULES = 'CONTRIBUTING.md';
const rulesLink = (context) => `https://github.com/${context.repo.owner}/${context.repo.repo}/blob/main/${RULES}`;

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const isBot = (user) => !!user && (user.type === 'Bot' || /\[bot\]$/i.test(user.login || ''));
const isOwner = (login, context) => same(login, context.repo.owner);
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const labelName = (l) => (typeof l === 'string' ? l : l && l.name);

// Text a human typed, without code, quotes and HTML comments, so examples never count as commands or links.
function plain(body) {
  return String(body || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join('\n');
}

// '/claim' | '/unclaim' at the start of any line → 'claim' | 'unclaim'; otherwise null.
function parseCommand(body) {
  const m = /^[ \t]*\/(claim|unclaim)(?![\w-])/im.exec(plain(body));
  return m ? m[1].toLowerCase() : null;
}

// Issue numbers a pull request closes: `Closes|Fixes|Resolves #N` or a link to an issue in this repository.
function closingRefs(body, repo) {
  const text = plain(body);
  const kw = '\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\b:?\\s+';
  const refs = new Set();
  for (const m of text.matchAll(new RegExp(kw + '#(\\d+)\\b', 'gi'))) refs.add(Number(m[1]));
  const other = new RegExp(kw + '(?:https?://github\\.com/)?([\\w.-]+)/([\\w.-]+)(?:#|/issues/)(\\d+)\\b', 'gi');
  for (const m of text.matchAll(other)) if (same(m[1], repo.owner) && same(m[2], repo.repo)) refs.add(Number(m[3]));
  return [...refs];
}

// Hidden record the bot leaves in its own comments: claim and release history of an issue.
const marker = (record) => `\n\n<!-- majo-claim ${JSON.stringify(record)} -->`;
function records(comments) {
  const out = [];
  for (const c of comments) {
    if (!c.user || c.user.login !== BOT) continue;
    const m = /<!-- majo-claim (\{[^\n]*?\}) -->/.exec(c.body || '');
    if (!m) continue;
    try { out.push({ ...JSON.parse(m[1]), at: c.created_at }); } catch { /* not ours */ }
  }
  return out;
}

// Who holds an issue: its assignees; with none, the user in the bot's latest claim record while the label is on.
function describe(issue, comments) {
  const assignees = (issue.assignees || []).map((a) => a.login);
  const labelled = (issue.labels || []).some((l) => labelName(l) === LABEL.name);
  const last = records(comments).pop();
  const record = labelled && last && last.action === 'claim' ? last : null;
  const holders = assignees.length ? assignees : record ? [record.user] : [];
  return { issue, comments, assignees, labelled, record, holders };
}

// True when `login` posted /claim while nobody held the issue and nothing since took it back
// (their /unclaim, a release, a bot claim for someone else). Covers a claim the bot has not answered yet.
function pendingClaim(comments, login) {
  let open = false;
  let holder = null;
  for (const c of comments) {
    const who = c.user && c.user.login;
    if (who === BOT) {
      for (const r of records([c])) {
        const users = r.users || [];
        if (r.action === 'claim') { holder = r.user; if (!same(r.user, login)) open = false; }
        if (r.action === 'release' && users.some((u) => same(u, holder))) holder = null;
        if (r.action === 'release' && users.some((u) => same(u, login))) open = false;
      }
    } else if (same(who, login)) {
      const cmd = parseCommand(c.body);
      if (cmd === 'claim') open = !holder || same(holder, login);
      if (cmd === 'unclaim') open = false;
    }
  }
  return open;
}

async function load(github, context, number) {
  const { owner, repo } = context.repo;
  const { data: issue } = await github.rest.issues.get({ owner, repo, issue_number: number });
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: number, per_page: 100 });
  return describe(issue, comments);
}

async function say(github, context, number, body) {
  const { owner, repo } = context.repo;
  await github.rest.issues.createComment({ owner, repo, issue_number: number, body });
}

async function ensureLabel(github, context, core) {
  const { owner, repo } = context.repo;
  try {
    await github.rest.issues.getLabel({ owner, repo, name: LABEL.name });
  } catch (e) {
    if (e.status !== 404) throw e;
    try { await github.rest.issues.createLabel({ owner, repo, ...LABEL }); } catch (err) { core.warning(`label ${LABEL.name}: ${err.message}`); }
  }
}

async function release(github, context, st, users, text) {
  const { owner, repo } = context.repo;
  const n = st.issue.number;
  const assigned = st.assignees.filter((a) => users.some((u) => same(u, a)));
  if (assigned.length) await github.rest.issues.removeAssignees({ owner, repo, issue_number: n, assignees: assigned });
  if (st.labelled) {
    try { await github.rest.issues.removeLabel({ owner, repo, issue_number: n, name: LABEL.name }); } catch (e) { if (e.status !== 404) throw e; }
  }
  await say(github, context, n, text + marker({ action: 'release', users }));
}

async function claim(github, context, core, st, who, now) {
  const { owner, repo } = context.repo;
  const n = st.issue.number;
  if (st.issue.state !== 'open') {
    await say(github, context, n, `@${who} 这个议题已经关闭，不能再认领。\nThis issue is closed, so it can't be claimed.`);
    return 'closed';
  }
  if (st.holders.some((h) => same(h, who))) {
    await say(github, context, n, `@${who} 这个议题已经在你名下了。\nYou already hold this issue.`);
    return 'already';
  }
  if (st.holders.length) {
    const since = st.record ? day(Date.parse(st.record.at)) : '';
    await say(github, context, n,
      `@${who} 这个议题已由 ${st.holders.join('、')} 认领${since ? `（${since} 起）` : ''}。可以留言商量分工；认领人 ${CLAIM_DAYS} 天内没有 PR 也没有进度更新时，认领会自动释放。\n` +
      `Already claimed by ${st.holders.join(', ')}${since ? ` since ${since}` : ''}. Talk it over here; a claim with no pull request and no progress update for ${CLAIM_DAYS} days is released automatically.`);
    return 'taken';
  }

  let assigned = false;
  try {
    const { data } = await github.rest.issues.addAssignees({ owner, repo, issue_number: n, assignees: [who] });
    assigned = (data.assignees || []).some((a) => same(a.login, who));
  } catch (e) {
    core.warning(`assign ${who} to #${n}: ${e.message}`);
  }
  await ensureLabel(github, context, core);
  await github.rest.issues.addLabels({ owner, repo, issue_number: n, labels: [LABEL.name] });

  const until = day(now + CLAIM_DAYS * DAY_MS);
  const how = assigned
    ? `已把这个议题指派给你。\nThe issue is now assigned to you.`
    : `GitHub 没能把议题指派给你，所以用 \`${LABEL.name}\` 标签和这条评论记录：认领人是 ${who}。\n` +
      `GitHub could not assign the issue to you, so the \`${LABEL.name}\` label and this comment record ${who} as the claimer.`;
  await say(github, context, n,
    `@${who} 认领成功。${how}\n\n` +
    `- 有效期到 ${until}（UTC）。开 PR（描述里写 \`Closes #${n}\`）或在这里留进度评论，都会让认领继续有效。\n` +
    `- 不做了请评论 \`/unclaim\`。流程见 [${RULES}](${rulesLink(context)})。\n\n` +
    `Claimed until ${until} (UTC). Opening a pull request with \`Closes #${n}\` or posting a progress comment here keeps the claim alive. Comment \`/unclaim\` to let it go.` +
    marker({ action: 'claim', user: who }));
  return assigned ? 'claimed' : 'claimed-label';
}

async function unclaim(github, context, st, who) {
  const n = st.issue.number;
  if (!st.holders.length) {
    await say(github, context, n, `@${who} 这个议题目前没有人认领。\nNobody holds this issue right now.`);
    return 'none';
  }
  const mine = st.holders.some((h) => same(h, who));
  if (!mine && !isOwner(who, context)) {
    await say(github, context, n, `@${who} 只有认领人或维护者可以释放认领。\nOnly the claimer or the maintainer can release this claim.`);
    return 'denied';
  }
  const users = mine ? [who] : st.holders;
  await release(github, context, st, users,
    `已释放 ${users.join('、')} 的认领，其他人可以评论 \`/claim\` 接手。\nReleased the claim held by ${users.join(', ')}. Anyone can now comment \`/claim\` to take it.`);
  return 'released';
}

// issue_comment (created) → /claim or /unclaim.
async function onComment({ github, context, core, now = Date.now() }) {
  const { comment, issue } = context.payload;
  if (!comment || !issue || issue.pull_request || isBot(comment.user)) return 'ignored';
  const cmd = parseCommand(comment.body);
  if (!cmd) return 'ignored';
  const st = await load(github, context, issue.number);
  const who = comment.user.login;
  const result = cmd === 'claim' ? await claim(github, context, core, st, who, now) : await unclaim(github, context, st, who);
  core.info(`#${issue.number} /${cmd} by ${who}: ${result}`);
  return result;
}

// Open pull requests in this repository by `login` that mention issue `n`.
async function linkedPulls(github, context, n, login) {
  const { owner, repo } = context.repo;
  const events = await github.paginate(github.rest.issues.listEventsForTimeline, { owner, repo, issue_number: n, per_page: 100 });
  const prefix = `https://github.com/${owner}/${repo}/pull/`.toLowerCase();
  return events
    .filter((e) => e.event === 'cross-referenced' && e.source && e.source.issue && e.source.issue.pull_request)
    .map((e) => e.source.issue)
    .filter((p) => same(p.user && p.user.login, login) && String(p.html_url || '').toLowerCase().startsWith(prefix));
}

// schedule (daily) → release bot claims with no linked open PR and no claimer activity for CLAIM_DAYS.
async function expireClaims({ github, context, core, now = Date.now(), dryRun = false }) {
  const { owner, repo } = context.repo;
  const issues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'open', labels: LABEL.name, per_page: 100 });
  const results = [];
  for (const issue of issues) {
    if (issue.pull_request) continue;
    const n = issue.number;
    const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: n, per_page: 100 });
    const st = describe(issue, comments);
    const user = st.record && st.record.user;
    if (!user || !st.holders.some((h) => same(h, user))) { results.push({ n, status: 'manual' }); continue; }

    let last = Date.parse(st.record.at);
    for (const c of comments) if (same(c.user && c.user.login, user)) last = Math.max(last, Date.parse(c.created_at));
    const pulls = await linkedPulls(github, context, n, user);
    if (pulls.some((p) => p.state === 'open')) { results.push({ n, user, status: 'pr-open' }); continue; }
    for (const p of pulls) last = Math.max(last, Date.parse(p.closed_at || p.updated_at));
    if (now - last <= CLAIM_DAYS * DAY_MS) { results.push({ n, user, status: 'active' }); continue; }

    if (!dryRun) {
      await release(github, context, st, [user],
        `@${user} 认领已过期：${day(last)} 之后 ${CLAIM_DAYS} 天里没有 PR，也没有进度评论，这个议题重新开放认领。还想继续的话，再评论一次 \`/claim\` 就好。\n` +
        `This claim expired: no pull request and no progress comment for ${CLAIM_DAYS} days after ${day(last)}, so the issue is open to claim again. Comment \`/claim\` to pick it back up.`);
    }
    results.push({ n, user, status: dryRun ? 'would-expire' : 'expired' });
  }
  for (const r of results) core.info(`#${r.n} ${r.user || '-'}: ${r.status}`);
  return results;
}

async function report(core, ok, lines) {
  const text = lines.join('\n');
  if (core.summary) await core.summary.addRaw(text + '\n').write();
  if (ok) core.info(text); else core.setFailed(text);
  return { ok, text };
}

// pull_request → the description must close issues the author has claimed.
async function checkPull({ github, context, core }) {
  const pr = context.payload.pull_request;
  const author = pr.user.login;
  if (pr.number <= LAST_PRE_RULE_PR) return report(core, true, [`#${pr.number} 早于认领规则，免检。· Opened before the claim rule; exempt.`]);
  if (isOwner(author, context) || isBot(pr.user)) return report(core, true, [`${author}：维护者或机器人，免检。· Maintainer or bot; exempt.`]);

  const refs = closingRefs(pr.body, context.repo);
  const problems = [];
  if (!refs.length) problems.push('PR 描述里没有 `Closes #议题号`。· The description has no `Closes #<issue>` line.');
  const { owner, repo } = context.repo;
  for (const n of refs) {
    let issue;
    try { ({ data: issue } = await github.rest.issues.get({ owner, repo, issue_number: n })); } catch (e) {
      problems.push(`#${n}：找不到这个议题。· Issue not found.`); continue;
    }
    if (issue.pull_request) { problems.push(`#${n} 是 PR，不是议题。· #${n} is a pull request, not an issue.`); continue; }
    if (issue.state !== 'open') { problems.push(`#${n} 已经关闭。· #${n} is closed.`); continue; }
    const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: n, per_page: 100 });
    const st = describe(issue, comments);
    if (st.holders.some((h) => same(h, author))) continue;
    if (!st.holders.length && pendingClaim(comments, author)) continue;
    problems.push(st.holders.length
      ? `#${n} 由 ${st.holders.join('、')} 认领，不是 ${author}。· #${n} is claimed by ${st.holders.join(', ')}, not ${author}.`
      : `#${n} 还没有人认领。· Nobody has claimed #${n} yet.`);
  }
  if (!problems.length) return report(core, true, [`认领检查通过：${refs.map((n) => '#' + n).join(' ')} 由 ${author} 认领。· Claim check passed.`]);
  return report(core, false, [
    '认领检查没有通过 · Claim check failed',
    ...problems.map((p) => `- ${p}`),
    '',
    '怎么办 · How to fix:',
    '1. 先为这次修改发一个议题（改进提案或问题反馈模板）。· Open an issue for the change first (proposal or bug template).',
    '2. 在议题下评论 `/claim`，等机器人回复确认。· Comment `/claim` on it and wait for the bot to confirm.',
    '3. PR 描述里写 `Closes #议题号`，然后编辑一下描述或推送一次，检查会重跑。· Put `Closes #<issue>` in the description, then edit it or push to re-run this check.',
    `规则 · Rules: ${rulesLink(context)}`,
  ]);
}

module.exports = { onComment, expireClaims, checkPull, parseCommand, closingRefs, describe, pendingClaim, records, CLAIM_DAYS, LABEL, BOT };
