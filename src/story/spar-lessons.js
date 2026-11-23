// 对练课 — the combat lessons folded into Fran's first spar (episode 1, step 'duel'). Learn by doing, one system at a time,
// told by Fran in a short line and a task on the coach card (src/ui/coach.js); every task has a soft check, a timeout and
// is ticked off early when she already did it. Nothing stops the fight: the spar runs around the lessons.
//
//   phase 0  lock     锁定      lock onto Fran ({lock})                         Fran waits (≤ 10 s)
//            dodge    闪身      dodge one of her stardust bolts ({dodge})
//            guard    结界      raise the guard against a bolt ({guard}); at the last moment it flies back
//            counter  回击      hit her while she lowers her wand (the opening)
//   phase 1  answer   拆阵      break a spell she is drawing with the element that answers it ({cast}, {wheel})
//            weave    交织      a stardust wolf she conjures: alternate elements until its stance breaks (stagger)
//            read     看破      dodge right through its pounce: the read opens it                 Fran watches (phantom)
//            rally    背水一战  finish it; a beast near its end rallies                            Fran watches (phantom)
//   phase 2  air      风        knock her off the broom with wind
//            free     自由比试  the rest of the bout is yours
// Fran holds the next movement until the lessons of the current one are done or have timed out. {interact} skips them
// all (an interact hotspot that follows the heroine, so the key shows on a computer and the button on a phone). Once done or skipped:
// flags.spar_lessons (no new save field). The recollection never teaches. Events 'spar:lesson' { id, how: 'done'|'timeout'|'skip' }.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { fill } from './dialogue.js';

const BEATS = [
  { id: 'lock', phase: 0, max: 10, hold: true },
  { id: 'dodge', phase: 0, max: 18 },
  { id: 'guard', phase: 0, max: 18 },
  { id: 'counter', phase: 0, max: 18 },
  { id: 'answer', phase: 1, max: 30 },
  { id: 'weave', phase: 1, max: 40, hold: true, phantom: true },
  { id: 'read', phase: 1, max: 25, hold: true, phantom: true },
  { id: 'rally', phase: 1, max: 30, hold: true, phantom: true },
  { id: 'air', phase: 2, max: 40 },
  { id: 'free', phase: 2, max: 6, last: true },
];
const _v = new THREE.Vector3();

export function createSparLessons(S) {
  let L = null;   // the running lesson set, else null
  const seen = new Set();
  const on = (ev, f) => G.events.on(ev, (e) => { if (L) { try { f(e); } catch (err) { G.reportError('spar:lessons', err); } } });

  function wanted(story) {
    return !!story && !G.state?.flags?.spar_lessons && G.params?.lessons !== '0';
  }
  function begin(d) {
    seen.clear();
    L = { d, i: -1, t: 0, phantom: null, proxy: null, skip: null };
    // Fran as a lock-on target (combat.lockExtras), alive while the spar is
    L.proxy = { isLockPoint: true, pos: d.n.pos, height: 1.75, radius: 0.7, lockRange: 45, get dead() { return !L || L.d !== d || !S.spar.active; } };
    G.combat?.lockExtras?.push(L.proxy);
    L.skip = G.interact?.add?.({ getPos: (out) => out.copy(G.player.pos).setY(G.player.pos.y + 1), radius: 3, priority: -10, broom: true,   /* lowest: any real interactable in reach wins E */
      enabled: () => !!L && L.i >= 0 && L.i < BEATS.length, prompt: () => t('story.spar.lesson.skip'), onInteract: () => skipAll() }) || null;
    next();
  }
  function end() {
    if (!L) return;
    const P = L.proxy, i = G.combat?.lockExtras?.indexOf(P) ?? -1;
    if (i >= 0) G.combat.lockExtras.splice(i, 1);
    if (G.combat?.lockTarget === P) G.combat.lockTarget = null;
    L.skip?.remove?.();
    dispel();
    G.ui?.coach?.(null);
    L = null;
  }
  function finish(how) {
    if (G.state?.flags) G.state.flags.spar_lessons = true;
    S.save?.();
    G.events.emit('spar:lesson', { id: 'all', how });
    end();
  }
  function skipAll() {
    if (!L) return;
    G.audio?.sfx('ui_cancel_soft', { vol: 0.5 });
    finish('skip');
  }
  const beat = () => (L && L.i >= 0 ? BEATS[L.i] : null);
  function show(b) {
    G.ui?.coach?.({ who: t('story.spar.lesson.who'), line: t('story.spar.lesson.' + b.id + '.line'), task: fill(t('story.spar.lesson.' + b.id + '.task'), L.vars || {}),
      n: L.i + 1, of: BEATS.length, dur: b.last ? b.max : 0 });
  }
  /** Move on to the next beat whose movement has come (or wait for it). */
  function next() {
    L.i++;
    L.t = 0;
    L.shown = false;
    const b = beat();
    if (!b) { finish('done'); return; }
  }
  function complete(id, how = 'done') {
    const b = beat();
    if (!b || b.id !== id || !L.shown) return;
    G.events.emit('spar:lesson', { id, how });
    if (how === 'done') { G.ui?.coach?.({ done: true }); G.audio?.sfx('ui_confirm', { vol: 0.55 }); }
    if (b.phantom && (id === 'rally' || how !== 'done') && L.phantom) dispel();
    next();
  }
  // ---- the stardust wolf of the second movement ----
  function conjure() {
    const C = G.combat, P = G.player, d = L.d;
    if (!C || !P || L.phantom) return;
    _v.set(P.pos.x - d.n.pos.x, 0, P.pos.z - d.n.pos.z).normalize();
    const pos = { x: P.pos.x + _v.z * 6 - _v.x * 2, y: NaN, z: P.pos.z - _v.x * 6 - _v.z * 2 };
    const camp = { id: 'spar_lesson', x: pos.x, z: pos.z, r: 30, alive: new Set() };
    const e = C.spawn('wolf', pos, { camp, aggro: true, persistent: true, hpMul: 0.75, dmgMul: 0.35 });
    if (!e) return;
    e.encounter = camp; e.phantom = true; e.noDrop = true; e.ignoreCalm = true;
    e.poiseMax = e.poise = 55;   // a lesson: its stance breaks after a few woven hits, well before it falls
    L.phantom = e;
    G.fx?.burst('summon', e.centerOut(_v), { color: 0xffe9b0, scale: 1.2 });
    G.npcs?.gesture?.('fran', 'cast_raise');
  }
  function dispel() {
    const e = L?.phantom;
    if (!e) return;
    L.phantom = null;
    if (!e.dead) { G.fx?.burst('summon', e.centerOut(_v), { color: 0xffe9b0, scale: 0.9 }); G.combat?.despawn(e); }
  }

  // ---- the soft checks (anything she does counts, even before it is asked) ----
  const near = () => (G.spells?.projectiles || []).some((p) => p.alive && p.team === 'enemy' && p.data?.franSpar && p.pos.distanceTo(G.player.pos) < 7);
  on('player:dodge', () => { if (near()) { seen.add('dodge'); complete('dodge'); } });
  on('spell:clash', (e) => { if ((e.result === 'block' || e.result === 'reflect') && (!e.defender || e.defender === G.player)) { seen.add('guard'); complete('guard'); } });
  on('spar:broken', () => { seen.add('answer'); complete('answer'); });
  on('spar:tumble', () => { seen.add('air'); complete('air'); });
  on('enemy:stagger', (e) => { if (e.enemy === L.phantom) { seen.add('weave'); complete('weave'); } });
  on('enemy:read', (e) => { if (e.enemy === L.phantom) { seen.add('read'); complete('read'); } });
  on('enemy:killed', (e) => { if (e.enemy === L.phantom) { L.phantom = null; seen.add('rally'); seen.add('weave'); seen.add('read'); complete(beat()?.id); } });

  return {
    wanted,
    begin,
    /** the bout is over: done = it ended with a result (the lessons count as learned), else it was abandoned */
    close(done) { if (L) { if (done) finish('end'); else end(); } },
    get active() { return !!L; },
    /** tests: { beat, shown, t, seen } */
    get state() { return L ? { beat: beat()?.id || null, shown: !!L.shown, t: Math.round(L.t * 10) / 10, seen: [...seen] } : null; },
    /** fran-spar: a hit of hers on Fran; open = during an opening */
    onHit(open) { if (open && L) { seen.add('counter'); complete('counter'); } },
    /** fran-spar: may the next movement begin? (not while lessons of an earlier one are open) */
    allows(phase) { const b = beat(); return !L || !b || b.phase >= phase; },
    /** fran-spar: the lowest hp a hit may leave her at — the lessons of this movement come before the next one (and the
     *  last movement's before the end); 0 = no floor */
    minHp(d) {
      const b = beat();
      if (!L || !b || b.last || b.phase > d.phase) return 0;
      // the next movement's line; in the last movement half of what it began with, so a free bout is left after the lessons
      return d.phase < d.M.last ? d.M.phaseAt[d.phase + 1] : Math.max(1, Math.round(d.M.phaseAt[d.M.last] * 0.5));
    },
    /** fran-spar: should Fran stay in her rest (a lesson that wants the stage)? */
    get holds() { const b = beat(); return !!(L && b && b.hold && L.shown && b.phase <= L.d.phase); },
    tick(dt) {
      if (!L) return;
      const d = L.d, b = beat();
      if (!b) return;
      if (b.phase > d.phase) return;   // its movement has not come yet
      if (!L.shown) {
        // already done earlier in the bout: tick it off quietly
        if (seen.has(b.id) && !b.phantom) { L.shown = true; complete(b.id); return; }
        if (b.id === 'answer') L.vars = {};
        if (b.phantom && !L.phantom && b.id === 'weave') conjure();
        if (b.phantom && !L.phantom && b.id !== 'weave') { next(); return; }   // the wolf is gone already
        L.shown = true;
        show(b);
      }
      L.t += dt;
      if (b.id === 'lock' && G.combat?.lockTarget === L.proxy) { complete('lock'); return; }
      if (L.t >= b.max) {
        if (b.last) { G.ui?.coach?.(null); next(); return; }
        complete(b.id, 'timeout');
      }
    },
  };
}
