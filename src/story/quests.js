// Quest engine (G.quests). Data-driven: quest definitions (questdefs.js) are ordered steps; each step can complete on
// §5.4 events (`on`), on a polled state test (`check`), or from a talk / scripted handler that calls advance().
// State lives in G.state.quests[id] = { state:'active'|'done', step, vars }. Every step's enter(ctx) runs again on load
// (ctx.restore = true), so a save made at any step rebuilds its world state.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { fill } from './dialogue.js';

export function createQuests(story, DEFS) {
  const ORDER = Object.keys(DEFS);
  const entered = new Map();     // questId -> step index whose enter() has run (this session)
  const subs = new Map();        // event name -> off()
  let pollT = 0, markersDirty = true, lastMarkerKey = '', trackerKey = '';

  const st = (id) => G.state?.quests?.[id] || null;
  const def = (id) => DEFS[id];
  function ctxOf(id, restore = false) {
    const s = st(id); const d = def(id);
    return { id, q: d, s, step: d?.steps?.[s?.step ?? 0], index: s?.step ?? 0, vars: s ? (s.vars ||= {}) : {}, restore, S: story };
  }
  function title(id) { return t('story.quests.' + id + '.title'); }
  // {guard} / {cast} … name the player's own key, or the touch button on a phone (fill → G.input.keyLabel)
  function objective(id, stepDef) { return stepDef ? fill(t('story.quests.' + id + '.steps.' + stepDef.id)) : ''; }

  function enter(id, restore) {
    const c = ctxOf(id, restore);
    if (!c.step || entered.get(id) === c.index) return;
    entered.set(id, c.index);
    try { c.step.enter?.(c); } catch (e) { G.reportError('quest:enter:' + id + '.' + c.step.id, e); }
    markersDirty = true;
  }
  function exit(id) {
    const c = ctxOf(id);
    if (entered.get(id) !== c.index) return;
    entered.delete(id);
    try { c.step?.exit?.(c); } catch (e) { G.reportError('quest:exit:' + id, e); }
  }
  function autosave() { if (G.started && !G.save?.disabled) { try { G.save.write(true); } catch (e) { /* ignore */ } } }

  const api = {
    defs: DEFS,
    /** ★ Start a quest (no-op if already started or done). track: show this side quest on the HUD (accepted from an offer);
     *  side quests that open on their own stay in the journal and the main quest keeps the tracker. */
    start(id, { silent = false, track = false } = {}) {
      const d = def(id); if (!d || !G.state) return false;
      if (st(id)) return false;
      G.state.quests[id] = { state: 'active', step: 0, vars: {} };
      if (!d.main && track && !G.state.story?.tracked) story.track?.(id);
      G.events.emit('quest:started', { id });
      if (!silent) G.ui?.toast?.(t(d.main ? 'story.ui.questNew' : 'story.ui.questNew', { title: title(id) }), { icon: d.main ? 'main' : 'side', dur: 3.2 });
      enter(id, false);
      api.refresh();
      autosave();
      return true;
    },
    /** ★ Advance a quest one step (or to step index / id `to`). Completes it after the last step. */
    advance(id, to) {
      const s = st(id); const d = def(id);
      if (!s || s.state !== 'active' || !d) return false;
      const from = s.step;
      exit(id);
      try { d.steps[from]?.done?.(ctxOf(id)); } catch (e) { G.reportError('quest:done:' + id, e); }
      let next = from + 1;
      if (typeof to === 'number') next = to;
      else if (typeof to === 'string') { const k = d.steps.findIndex((x) => x.id === to); if (k >= 0) next = k; }
      if (next >= d.steps.length) return api.complete(id);
      s.step = next;
      G.events.emit('quest:updated', { id, step: next });
      enter(id, false);
      api.refresh();
      autosave();
      return true;
    },
    /** Mark done (runs onComplete, starts `next`). */
    complete(id, { silent = false } = {}) {
      const d = def(id); if (!d || !G.state) return false;
      let s = st(id);
      if (s && s.state === 'done') return false;
      if (!s) s = G.state.quests[id] = { state: 'active', step: 0, vars: {} };
      exit(id);
      s.state = 'done'; s.step = d.steps.length;
      if (G.state.story?.tracked === id) G.state.story.tracked = null;
      try { d.onComplete?.(ctxOf(id)); } catch (e) { G.reportError('quest:complete:' + id, e); }
      G.events.emit('quest:completed', { id });
      if (!silent) G.ui?.toast?.(t('story.ui.questDone', { title: title(id) }), { icon: d.main ? 'main' : 'side', dur: 3.5 });
      if (d.next) api.start(d.next, { silent });
      api.refresh();
      autosave();
      return true;
    },
    /** ★ */
    isDone(id) { return st(id)?.state === 'done'; },
    isActive(id) { return st(id)?.state === 'active'; },
    /** ★ Active quest ids (main first). */
    active() { return ORDER.filter((id) => st(id)?.state === 'active').sort((a, b) => (def(b).main ? 1 : 0) - (def(a).main ? 1 : 0)); },
    /** Current step id of a quest (or null). */
    stepId(id) { const s = st(id); return s && s.state === 'active' ? def(id)?.steps?.[s.step]?.id ?? null : null; },
    stepIndex(id) { return st(id)?.step ?? -1; },
    /** Has quest `id` gone past its step `stepId` (or finished)? (craft learning rules, src/data/craft.js LEARN) */
    passed(id, stepId) { const s = st(id); if (!s) return false; if (s.state === 'done') return true; const k = def(id)?.steps?.findIndex((x) => x.id === stepId) ?? -1; return k >= 0 && s.step > k; },
    /** Is quest `id` active and at step `stepId`? */
    at(id, stepId) { return api.stepId(id) === stepId; },
    /** The quest whose objective is shown (tracked side quest, else the main quest). */
    trackedId() {
      const tr = G.state?.story?.tracked;
      if (tr && api.isActive(tr)) return tr;
      const act = api.active();
      return act[0] || null;
    },
    /** ★ { title, objective, progress? } of the tracked quest, or null. */
    tracker() {
      const id = api.trackedId(); if (!id) return null;
      const c = ctxOf(id);
      let progress;
      try { const p = c.step?.progress?.(c); if (p) progress = Array.isArray(p) ? t('story.ui.progress', { n: p[0], max: p[1] }) : p; } catch (e) { /* ignore */ }
      return { title: title(id), objective: objective(id, c.step), progress };
    },
    /** Marker targets of a quest's current step: [{x,y,z}] */
    targets(id) {
      const c = ctxOf(id); if (!c.step || !c.step.target) return [];
      try { return story.resolveTargets(c.step.target, c) || []; } catch (e) { G.reportError('quest:target', e); return []; }
    },
    /** Journal entries for G.ui.providers.journal. */
    journal() {
      const out = [];
      for (const id of ORDER) {
        const s = st(id); const d = def(id);
        if (!s) continue;
        const objectives = [];
        const n = s.state === 'done' ? d.steps.length : s.step;
        for (let i = 0; i <= Math.min(n, d.steps.length - 1); i++) objectives.push({ text: objective(id, d.steps[i]), done: i < n || s.state === 'done' });
        out.push({ id, title: title(id), desc: t('story.quests.' + id + '.desc'), state: s.state, main: !!d.main, objectives });
      }
      return out.sort((a, b) => (a.state === 'done') - (b.state === 'done') || (b.main - a.main));
    },
    /** Push tracker + markers to the UI now. */
    refresh() { markersDirty = true; trackerKey = null; lastMarkerKey = null; },
    /** Re-enter every active step (load). */
    restoreAll() {
      entered.clear();
      for (const id of api.active()) enter(id, true);
      api.refresh();
    },
    /** Test hook: jump to quest `id` (step index or id), granting everything earlier quests (and steps) would have given. */
    debugSkipTo(id, step = 0) {
      if (!def(id) || !G.state) return false;
      const target = typeof step === 'string' ? Math.max(0, def(id).steps.findIndex((x) => x.id === step)) : step;
      const chain = [];
      for (let q = def(id).prev; q; q = def(q)?.prev) chain.unshift(q);
      for (const q of chain) {
        for (const sd of def(q).steps) story.grant(sd.grant);
        if (!api.isDone(q)) { exit(q); G.state.quests[q] = { state: 'done', step: def(q).steps.length, vars: {} }; try { def(q).onComplete?.(ctxOf(q), true); } catch (e) { G.reportError('quest:skip', e); } }
      }
      exit(id);
      for (let i = 0; i < target; i++) story.grant(def(id).steps[i]?.grant);
      G.state.quests[id] = { state: 'active', step: target, vars: {} };
      entered.delete(id);
      story.applyWorld?.();
      enter(id, true);
      G.events.emit('quest:updated', { id, step: target });
      api.refresh();
      return true;
    },
    /** Engine tick: events are pushed; checks are polled 4×/s; markers/tracker kept in sync. */
    update(dt) {
      if (!G.state) return;
      pollT -= dt;
      if (pollT <= 0 && G.mode === 'play') {
        pollT = 0.25;
        for (const id of api.active()) {
          enter(id, false);
          const c = ctxOf(id);
          if (!c.step?.check) continue;
          let ok = false;
          try { ok = !!c.step.check(c); } catch (e) { G.reportError('quest:check:' + id, e); }
          if (ok) { api.advance(id); break; }
        }
      }
      syncUi();
    },
    /** Subscribe once to every event used by any step's `on`. */
    bind() {
      const names = new Set();
      for (const id of ORDER) for (const sd of def(id).steps) if (sd.on) for (const k in sd.on) names.add(k);
      for (const n of names) {
        if (subs.has(n)) continue;
        subs.set(n, G.events.on(n, (p) => {
          for (const id of api.active()) {
            const c = ctxOf(id);
            const fn = c.step?.on?.[n];
            if (!fn) continue;
            let ok = false;
            try { ok = !!fn(p || {}, c); } catch (e) { G.reportError('quest:on:' + id, e); }
            if (ok) api.advance(id);
          }
        }));
      }
      for (const n of ['race:finish', 'inventory:changed', 'item:collected', 'lantern:lit', 'quest:updated']) {
        if (!subs.has('_' + n)) subs.set('_' + n, G.events.on(n, () => { markersDirty = true; trackerKey = ''; if (n === 'race:finish') lastMarkerKey = ''; }));
      }
    },
    get markersDirty() { return markersDirty; }, set markersDirty(v) { markersDirty = v; },
  };

  // ---- UI sync -----------------------------------------------------------------------------------------------------------------------
  let uiT = 0;
  function syncUi() {
    if (!G.ui) return;
    uiT -= G.time.rdt;
    if (uiT > 0 && !markersDirty) return;
    uiT = 0.5;
    if (G.gameplay?.raceRunning) return; // the race owns the tracker while it runs
    // an accepted roadside errand near its next target (gameplay/errands.js) shows instead of the main objective
    let tr = null;
    try { tr = G.errands?.tracker?.() || null; } catch (e) { tr = null; }
    tr ||= api.tracker();
    const key = tr ? tr.title + '|' + tr.objective + '|' + (tr.progress || '') : '';
    if (key !== trackerKey) { trackerKey = key; G.ui.setTracker?.(tr); }
    const list = [];
    const tracked = api.trackedId();
    for (const id of api.active()) {
      if (!def(id).main && id !== tracked) continue;
      const tg = api.targets(id);
      tg.slice(0, 4).forEach((p, i) => list.push({ id: 'q_' + id + '_' + i, pos: { x: p.x, y: p.y ?? (G.world?.groundAt?.(p.x, p.z) ?? 0) + 2, z: p.z },
        icon: def(id).main ? 'main' : 'side', kind: 'quest', label: title(id), color: def(id).main ? '#ffd77c' : '#ffe2a0' }));
    }
    const mk = list.map((m) => m.id + ':' + Math.round(m.pos.x) + ',' + Math.round(m.pos.z)).join(';');
    markersDirty = false;
    if (mk !== lastMarkerKey) { lastMarkerKey = mk; G.ui.setMarkers?.(list, 'story'); }
  }

  return api;
}
