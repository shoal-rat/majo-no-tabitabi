// Tests for `.github/scripts/claims.cjs` against a mocked GitHub API. Run: node .github/scripts/claims.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const claims = require('./claims.cjs');
const { BOT, LABEL } = claims;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-23T12:00:00Z');
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const REPO = { owner: 'shoal-rat', repo: 'majo-no-tabitabi' };
const user = (login) => ({ login, type: /\[bot\]$/.test(login) ? 'Bot' : 'User' });
const comment = (login, body, at = ago(0)) => ({ user: user(login), body, created_at: at });
const record = (rec, at) => comment(BOT, `ok\n\n<!-- majo-claim ${JSON.stringify(rec)} -->`, at);

function issue(number, { state = 'open', assignees = [], labels = [], pr = false } = {}) {
  return {
    number, state,
    assignees: assignees.map(user),
    labels: labels.map((name) => ({ name })),
    ...(pr ? { pull_request: {} } : {}),
  };
}

// In-memory GitHub: issues, comments, timelines; records every write.
function mockGithub({ issues = [], comments = {}, timeline = {}, assignable = () => true, labelExists = true } = {}) {
  const db = Object.fromEntries(issues.map((i) => [i.number, structuredClone(i)]));
  const notes = Object.fromEntries(Object.entries(comments).map(([n, list]) => [n, [...list]]));
  const writes = [];
  const find = (n) => {
    if (!db[n]) throw Object.assign(new Error('Not Found'), { status: 404 });
    return db[n];
  };
  const rest = {
    issues: {
      get: async ({ issue_number }) => ({ data: structuredClone(find(issue_number)) }),
      listComments: async ({ issue_number }) => ({ data: notes[issue_number] || [] }),
      listEventsForTimeline: async ({ issue_number }) => ({ data: timeline[issue_number] || [] }),
      listForRepo: async ({ labels, state }) => ({
        data: Object.values(db).filter((i) => i.state === state && i.labels.some((l) => l.name === labels)).map((i) => structuredClone(i)),
      }),
      addAssignees: async ({ issue_number, assignees }) => {
        writes.push(['assign', issue_number, assignees]);
        const i = find(issue_number);
        for (const a of assignees) if (assignable(a)) i.assignees.push(user(a));
        return { data: structuredClone(i) };
      },
      removeAssignees: async ({ issue_number, assignees }) => {
        writes.push(['unassign', issue_number, assignees]);
        const i = find(issue_number);
        i.assignees = i.assignees.filter((a) => !assignees.includes(a.login));
        return { data: structuredClone(i) };
      },
      getLabel: async () => {
        if (!labelExists) throw Object.assign(new Error('Not Found'), { status: 404 });
        return { data: LABEL };
      },
      createLabel: async ({ name }) => { writes.push(['create-label', name]); labelExists = true; return { data: LABEL }; },
      addLabels: async ({ issue_number, labels }) => {
        writes.push(['label', issue_number, labels]);
        const i = find(issue_number);
        for (const name of labels) if (!i.labels.some((l) => l.name === name)) i.labels.push({ name });
        return { data: i.labels };
      },
      removeLabel: async ({ issue_number, name }) => {
        writes.push(['unlabel', issue_number, name]);
        const i = find(issue_number);
        i.labels = i.labels.filter((l) => l.name !== name);
        return { data: i.labels };
      },
      createComment: async ({ issue_number, body }) => {
        writes.push(['comment', issue_number, body]);
        (notes[issue_number] ||= []).push(comment(BOT, body, new Date(NOW).toISOString()));
        return { data: {} };
      },
    },
  };
  const paginate = async (fn, params) => (await fn(params)).data;
  return { rest, paginate, writes, db, notes };
}

function mockCore() {
  const core = { infos: [], warnings: [], failed: null, summaries: [] };
  core.info = (m) => core.infos.push(m);
  core.warning = (m) => core.warnings.push(m);
  core.setFailed = (m) => { core.failed = m; };
  core.summary = { addRaw: (t) => { core.summaries.push(t); return core.summary; }, write: async () => core.summary };
  return core;
}

const onComment = (github, n, login, body, extra = {}) =>
  claims.onComment({
    github, core: mockCore(), now: NOW,
    context: { repo: REPO, payload: { issue: { number: n, ...extra }, comment: { user: user(login), body } } },
  });

const checkPull = async (github, { number = 20, author = 'ayu', body = '' } = {}) => {
  const core = mockCore();
  const out = await claims.checkPull({ github, core, context: { repo: REPO, payload: { pull_request: { number, user: user(author), body } } } });
  return { ...out, core };
};

const kinds = (writes) => writes.map((w) => w[0]);
const lastComment = (github, n) => github.notes[n].at(-1).body;

// --- parsing -----------------------------------------------------------------

test('commands: start of a line only, not in code, quotes or longer words', () => {
  assert.equal(claims.parseCommand('/claim'), 'claim');
  assert.equal(claims.parseCommand('Hi!\n  /claim I will take it'), 'claim');
  assert.equal(claims.parseCommand('/UNCLAIM'), 'unclaim');
  assert.equal(claims.parseCommand('/claimed it already'), null);
  assert.equal(claims.parseCommand('please use `/claim`'), null);
  assert.equal(claims.parseCommand('> /claim\nquoted'), null);
  assert.equal(claims.parseCommand('```\n/claim\n```'), null);
  assert.equal(claims.parseCommand('I could /claim it'), null);
});

test('closing refs: keywords, colon, same-repo links; comments and other repos ignored', () => {
  assert.deepEqual(claims.closingRefs('Closes #12', REPO), [12]);
  assert.deepEqual(claims.closingRefs('fixes: #3 and Resolved #4', REPO), [3, 4]);
  assert.deepEqual(claims.closingRefs('Closes https://github.com/shoal-rat/majo-no-tabitabi/issues/8', REPO), [8]);
  assert.deepEqual(claims.closingRefs('Closes shoal-rat/majo-no-tabitabi#9', REPO), [9]);
  assert.deepEqual(claims.closingRefs('Closes other/repo#9', REPO), []);
  assert.deepEqual(claims.closingRefs('<!-- Closes #5 -->\nCloses #<!-- number -->', REPO), []);
  assert.deepEqual(claims.closingRefs('see #12', REPO), []);
  assert.deepEqual(claims.closingRefs('', REPO), []);
});

test('the PR template alone does not pass the link check', () => {
  const tpl = fs.readFileSync(new URL('../pull_request_template.md', import.meta.url), 'utf8');
  assert.deepEqual(claims.closingRefs(tpl, REPO), []);
});

test('every workflow script calls an exported function', () => {
  for (const f of ['claims.yml', 'claim-expiry.yml', 'pr-claim-check.yml']) {
    const yml = fs.readFileSync(new URL(`../workflows/${f}`, import.meta.url), 'utf8');
    assert.match(yml, /require\('\.\/\.github\/scripts\/claims\.cjs'\)/, f);
    const calls = [...yml.matchAll(/claims\.(\w+)\(/g)].map((m) => m[1]);
    assert.ok(calls.length, f);
    for (const name of calls) assert.equal(typeof claims[name], 'function', `${f}: claims.${name}`);
    assert.doesNotMatch(yml, /\$\{\{\s*github\.event\.(comment|issue|pull_request)\.(body|title)/, `${f}: event text interpolated`);
    for (const m of yml.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /@[0-9a-f]{40}$/, `${f}: ${m[1]} not pinned`);
  }
});

// --- /claim and /unclaim -------------------------------------------------------

test('claim free issue → assigned, labelled, ack with expiry and record', async () => {
  const gh = mockGithub({ issues: [issue(12)], labelExists: false });
  assert.equal(await onComment(gh, 12, 'ayu', '/claim'), 'claimed');
  assert.deepEqual(gh.db[12].assignees.map((a) => a.login), ['ayu']);
  assert.ok(gh.db[12].labels.some((l) => l.name === 'claimed'));
  assert.deepEqual(kinds(gh.writes), ['assign', 'create-label', 'label', 'comment']);
  const ack = lastComment(gh, 12);
  assert.match(ack, /@ayu 认领成功/);
  assert.match(ack, /2026-11-30/);
  assert.match(ack, /Closes #12/);
  assert.match(ack, /majo-claim \{"action":"claim","user":"ayu"\}/);
});

test('claim when GitHub ignores the assignment → label + comment name the claimer', async () => {
  const gh = mockGithub({ issues: [issue(12)], assignable: () => false });
  assert.equal(await onComment(gh, 12, 'ayu', '/claim'), 'claimed-label');
  assert.equal(gh.db[12].assignees.length, 0);
  assert.ok(gh.db[12].labels.some((l) => l.name === 'claimed'));
  assert.match(lastComment(gh, 12), /认领人是 ayu/);
  // the label-only claim still blocks others and still counts for its holder
  assert.equal(await onComment(gh, 12, 'ren', '/claim'), 'taken');
  assert.match(lastComment(gh, 12), /已由 ayu 认领（2026-11-23 起）/);
  assert.equal(await onComment(gh, 12, 'ayu', '/claim'), 'already');
});

test('claim when the assign call throws → label fallback', async () => {
  const gh = mockGithub({ issues: [issue(12)] });
  gh.rest.issues.addAssignees = async () => { throw Object.assign(new Error('Validation Failed'), { status: 422 }); };
  assert.equal(await onComment(gh, 12, 'ayu', '/claim'), 'claimed-label');
});

test('claim taken issue → reply names holder, no writes besides the reply', async () => {
  const gh = mockGithub({ issues: [issue(12, { assignees: ['ayu'], labels: ['claimed'] })], comments: { 12: [record({ action: 'claim', user: 'ayu' }, ago(2))] } });
  assert.equal(await onComment(gh, 12, 'ren', '/claim'), 'taken');
  assert.deepEqual(kinds(gh.writes), ['comment']);
  assert.match(lastComment(gh, 12), /ayu/);
});

test('claim manually assigned issue → taken', async () => {
  const gh = mockGithub({ issues: [issue(12, { assignees: ['shoal-rat'] })] });
  assert.equal(await onComment(gh, 12, 'ren', '/claim'), 'taken');
});

test('claim closed issue → refused', async () => {
  const gh = mockGithub({ issues: [issue(12, { state: 'closed' })] });
  assert.equal(await onComment(gh, 12, 'ayu', '/claim'), 'closed');
  assert.deepEqual(kinds(gh.writes), ['comment']);
});

test('ignored: PR comments, bot comments, no command', async () => {
  const gh = mockGithub({ issues: [issue(12)] });
  assert.equal(await onComment(gh, 12, 'ayu', '/claim', { pull_request: {} }), 'ignored');
  assert.equal(await onComment(gh, 12, BOT, '/claim'), 'ignored');
  assert.equal(await onComment(gh, 12, 'ayu', 'nice idea, `/claim` it'), 'ignored');
  assert.equal(gh.writes.length, 0);
});

test('unclaim by claimer → unassigned, label off, release record', async () => {
  const gh = mockGithub({ issues: [issue(12)] });
  await onComment(gh, 12, 'ayu', '/claim');
  gh.writes.length = 0;
  assert.equal(await onComment(gh, 12, 'ayu', '/unclaim'), 'released');
  assert.equal(gh.db[12].assignees.length, 0);
  assert.equal(gh.db[12].labels.length, 0);
  assert.deepEqual(kinds(gh.writes), ['unassign', 'unlabel', 'comment']);
  assert.match(lastComment(gh, 12), /"action":"release","users":\["ayu"\]/);
  assert.equal(await onComment(gh, 12, 'ren', '/claim'), 'claimed');
});

test('unclaim by someone else → denied; by owner → released', async () => {
  const gh = mockGithub({ issues: [issue(12)] });
  await onComment(gh, 12, 'ayu', '/claim');
  assert.equal(await onComment(gh, 12, 'ren', '/unclaim'), 'denied');
  assert.deepEqual(gh.db[12].assignees.map((a) => a.login), ['ayu']);
  assert.equal(await onComment(gh, 12, 'shoal-rat', '/unclaim'), 'released');
  assert.equal(gh.db[12].assignees.length, 0);
});

test('unclaim of a label-only claim → label removed', async () => {
  const gh = mockGithub({ issues: [issue(12)], assignable: () => false });
  await onComment(gh, 12, 'ayu', '/claim');
  assert.equal(await onComment(gh, 12, 'ayu', '/unclaim'), 'released');
  assert.equal(gh.db[12].labels.length, 0);
});

test('unclaim with nothing claimed → none', async () => {
  const gh = mockGithub({ issues: [issue(12)] });
  assert.equal(await onComment(gh, 12, 'ayu', '/unclaim'), 'none');
});

// --- expiry ------------------------------------------------------------------

test('expiry: idle, active, progress, open PR, closed PR, manual, label-only', async () => {
  const claimed = (n, who, days, opts = {}) => [issue(n, { assignees: opts.labelOnly ? [] : [who], labels: ['claimed'] }), record({ action: 'claim', user: who }, ago(days))];
  const pr = (who, state, days, repo = 'shoal-rat/majo-no-tabitabi') => ({
    event: 'cross-referenced',
    source: { type: 'issue', issue: { pull_request: {}, state, user: user(who), updated_at: ago(days), closed_at: state === 'closed' ? ago(days) : null, html_url: `https://github.com/${repo}/pull/30` } },
  });
  const [i1, r1] = claimed(31, 'ayu', 8);                 // idle 8 days → expire
  const [i2, r2] = claimed(32, 'ren', 3);                 // 3 days → keep
  const [i3, r3] = claimed(33, 'kai', 12);                // progress comment 2 days ago → keep
  const [i4, r4] = claimed(34, 'mio', 20);                // open PR → keep
  const [i5, r5] = claimed(35, 'sen', 15);                // PR closed 9 days ago → expire
  const [i6, r6] = claimed(36, 'tao', 10);                // open PR by someone else, other repo → expire
  const [i8, r8] = claimed(38, 'yui', 9, { labelOnly: true }); // label-only, idle → expire
  const gh = mockGithub({
    issues: [i1, i2, i3, i4, i5, i6, issue(37, { assignees: ['shoal-rat'], labels: ['claimed'] }), i8, issue(39)],
    comments: {
      31: [comment('ayu', '/claim', ago(8)), r1],
      32: [r2],
      33: [r3, comment('kai', 'half done, screenshots soon', ago(2))],
      34: [r4], 35: [r5], 36: [r6], 38: [r8],
    },
    timeline: { 34: [pr('mio', 'open', 1)], 35: [pr('sen', 'closed', 9)], 36: [pr('ayu', 'open', 1), pr('tao', 'open', 1, 'tao/fork')] },
  });
  const dry = await claims.expireClaims({ github: gh, context: { repo: REPO, payload: {} }, core: mockCore(), now: NOW, dryRun: true });
  assert.equal(gh.writes.length, 0);
  assert.deepEqual(dry.filter((r) => r.status === 'would-expire').map((r) => r.n), [31, 35, 36, 38]);

  const res = await claims.expireClaims({ github: gh, context: { repo: REPO, payload: {} }, core: mockCore(), now: NOW });
  const status = Object.fromEntries(res.map((r) => [r.n, r.status]));
  assert.deepEqual(status, { 31: 'expired', 32: 'active', 33: 'active', 34: 'pr-open', 35: 'expired', 36: 'expired', 37: 'manual', 38: 'expired' });
  for (const n of [31, 35, 36, 38]) {
    assert.equal(gh.db[n].assignees.length, 0, `#${n} unassigned`);
    assert.equal(gh.db[n].labels.length, 0, `#${n} unlabelled`);
    assert.match(lastComment(gh, n), /认领已过期/);
  }
  assert.deepEqual(gh.db[37].assignees.map((a) => a.login), ['shoal-rat']);
  assert.equal(gh.db[32].assignees.length, 1);
});

// --- pull request check ------------------------------------------------------

test('PR ok: author holds the issue', async () => {
  const gh = mockGithub({ issues: [issue(12, { assignees: ['ayu'], labels: ['claimed'] })], comments: { 12: [record({ action: 'claim', user: 'ayu' }, ago(1))] } });
  const r = await checkPull(gh, { body: 'Closes #12\n\nwhat and why…' });
  assert.equal(r.ok, true);
  assert.equal(r.core.failed, null);
});

test('PR ok: label-only claim, and a /claim the bot has not answered yet', async () => {
  const gh = mockGithub({
    issues: [issue(12, { labels: ['claimed'] }), issue(13)],
    comments: { 12: [record({ action: 'claim', user: 'ayu' }, ago(1))], 13: [comment('ayu', '/claim', ago(0))] },
  });
  assert.equal((await checkPull(gh, { body: 'Fixes #12' })).ok, true);
  assert.equal((await checkPull(gh, { body: 'Resolves #13' })).ok, true);
});

test('PR fails: no closing link', async () => {
  const gh = mockGithub({ issues: [issue(12, { assignees: ['ayu'] })] });
  const r = await checkPull(gh, { body: 'Improves #12 a bit' });
  assert.equal(r.ok, false);
  assert.match(r.core.failed, /Closes #/);
  assert.match(r.core.failed, /CONTRIBUTING\.md/);
  assert.ok(r.core.summaries.length);
});

test('PR fails: issue claimed by someone else', async () => {
  const gh = mockGithub({ issues: [issue(12, { assignees: ['ren'], labels: ['claimed'] })], comments: { 12: [comment('ayu', '/claim', ago(3)), record({ action: 'claim', user: 'ren' }, ago(4))] } });
  const r = await checkPull(gh, { body: 'Closes #12' });
  assert.equal(r.ok, false);
  assert.match(r.core.failed, /claimed by ren, not ayu/);
});

test('PR fails: unclaimed, closed, missing, a PR number, or one of two refs unclaimed', async () => {
  const gh = mockGithub({ issues: [issue(12), issue(14, { state: 'closed', assignees: ['ayu'] }), issue(15, { pr: true }), issue(16, { assignees: ['ayu'] })] });
  assert.match((await checkPull(gh, { body: 'Closes #12' })).core.failed, /Nobody has claimed #12/);
  assert.match((await checkPull(gh, { body: 'Closes #14' })).core.failed, /#14 is closed/);
  assert.match((await checkPull(gh, { body: 'Closes #99' })).core.failed, /#99/);
  assert.match((await checkPull(gh, { body: 'Closes #15' })).core.failed, /not an issue/);
  const both = await checkPull(gh, { body: 'Closes #16\nCloses #12' });
  assert.equal(both.ok, false);
  assert.doesNotMatch(both.core.failed, /#16/);
});

test('PR fails: /claim posted while someone else held it, or released since', async () => {
  const gh = mockGithub({
    issues: [issue(12), issue(13)],
    comments: {
      12: [record({ action: 'claim', user: 'ren' }, ago(5)), comment('ayu', '/claim', ago(4)), record({ action: 'release', users: ['ren'] }, ago(3))],
      13: [comment('ayu', '/claim', ago(10)), record({ action: 'claim', user: 'ayu' }, ago(10)), record({ action: 'release', users: ['ayu'] }, ago(2))],
    },
  });
  assert.equal((await checkPull(gh, { body: 'Closes #12' })).ok, false);
  assert.equal((await checkPull(gh, { body: 'Closes #13' })).ok, false);
});

test('PR exempt: owner, bots, pre-rule PRs (#9, #10)', async () => {
  const gh = mockGithub();
  assert.equal((await checkPull(gh, { author: 'shoal-rat', body: '' })).ok, true);
  assert.equal((await checkPull(gh, { author: 'dependabot[bot]', body: '' })).ok, true);
  assert.equal((await checkPull(gh, { number: 9, author: 'mika', body: '' })).ok, true);
  assert.equal((await checkPull(gh, { number: 10, author: 'mika', body: '' })).ok, true);
  assert.equal((await checkPull(gh, { number: 11, author: 'mika', body: '' })).ok, false);
});
