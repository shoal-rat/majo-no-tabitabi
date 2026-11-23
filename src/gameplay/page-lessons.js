// 残页之课 — the tier-2 lessons, taught at whichever page trial she reaches first (src/gameplay/wilds-pages.js). Same
// style as the spar's lessons (src/story/spar-lessons.js): learn by doing, one short line (the old witch's writing on
// the marker) and one task on the coach card, a soft check, a timeout, {interact} to skip them all.
//
//   at the guardian   clash  对波   it opens with a beam: raise {guard} into it and mash {attack} to push it back
//                     parry  弹反   its slow bolts: raise {guard} the moment one arrives and it flies back
//   after the page    charge 二阶   hold {cast} until the circle fills, release: the charged form just learned
//                     fusion 合咏   let a charged spell meet another element (a tornado, a rain cloud, a pillar, an ice
//                                   dais take what is cast into them): a fusion; wards crack hardest to fusions
// Every page guardian also gets two moves of its own, lessons or not: the beam (2.5 s after it wakes, and again at its
// second phase) and a slow volley of three bolts in its element every 10–13 s, both meant to be met with the guard.
// Done or skipped: flags.tier2_lessons (no new save field). Events 'page:lesson' { id, how }.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { fill } from '../story/dialogue.js';
import { beamAttack } from '../combat/attacks.js';
import { volley, EL_COL } from '../combat/patterns.js';

const FIGHT = [
  { id: 'clash', max: 35 },
  { id: 'parry', max: 30 },
];
const PAGE = [
  { id: 'charge', max: 45 },
  { id: 'fusion', max: 60 },
];
// thunder fuses only into another charged form (a tornado, a rain cloud, a pillar): at a thunder page the fusion lesson
// is a pointer for later, shown briefly
const POINTER_ONLY = { thunder: 10 };
const _v = new THREE.Vector3();

export function createPageLessons() {
  let L = null;            // { list, i, t, shown, skip, el, e }
  const moves = new Map(); // guardian -> { t, volleyT, beamed }
  const key = (k) => 'gameplay.wilds.pages.lesson.' + k;
  const wanted = () => !G.state?.flags?.tier2_lessons && G.params?.lessons !== '0';

  function begin(list, el, e) {
    end();
    L = { list, i: 0, t: 0, shown: false, el, e };
    L.skip = G.interact?.add?.({ getPos: (out) => out.copy(G.player.pos).setY(G.player.pos.y + 1), radius: 3, priority: -10, broom: true,   /* lowest: any real interactable in reach wins E */
      enabled: () => !!L, prompt: () => t(key('skip')), onInteract: () => finish('skip') }) || null;
  }
  function end() {
    if (!L) return;
    L.skip?.remove?.();
    G.ui?.coach?.(null);
    L = null;
  }
  function finish(how) {
    if (how === 'skip' || (L && L.list === PAGE)) { if (G.state?.flags) G.state.flags.tier2_lessons = true; G.story?.save?.(); }
    G.events.emit('page:lesson', { id: 'all', how });
    end();
  }
  const beat = () => (L ? L.list[L.i] : null);
  function complete(id, how = 'done') {
    const b = beat();
    if (!b || b.id !== id || !L.shown) return;
    G.events.emit('page:lesson', { id, how });
    if (how === 'done') { G.ui?.coach?.({ done: true }); G.audio?.sfx('ui_confirm', { vol: 0.55 }); }
    L.i++; L.t = 0; L.shown = false;
    if (L.i >= L.list.length) { if (L.list === PAGE) finish('done'); else end(); }
  }

  // ---- the guardian's own moves (every page trial) ----
  function guardianMoves(dt) {
    const P = G.player;
    for (const [e, m] of moves) {
      if (e.dead || !G.combat?.enemies?.includes(e)) { moves.delete(e); continue; }
      if (!P || P.dead || e.stunT > 0 || e.frozen) continue;
      m.t += dt;
      if (!m.beamed && m.t > 2.5 && beamAttack(e, { color: EL_COL[m.el] })) { m.beamed = true; m.beamT = m.t; }
      // while the clash lesson is open, the beam comes again every 12 s (a lost struggle is a chance to try again)
      if (L && L.e === e && beat()?.id === 'clash' && m.beamed && m.t - m.beamT > 12 && beamAttack(e, { color: EL_COL[m.el] })) m.beamT = m.t;
      if (e.phase2 && !m.beamed2 && beamAttack(e, { color: EL_COL[m.el] })) m.beamed2 = true;
      if ((m.volleyT -= dt) <= 0 && !e.atk) {
        m.volleyT = 10 + Math.random() * 3;
        e.attack('pageVolley', 0.8, 0.5, (en) => {
          volley({ owner: en, team: 'enemy', alive: () => !en.dead, dmgK: 1, hand: (o) => o.set(en.pos.x, en.pos.y + en.height * 0.8, en.pos.z) }, P,
            { n: 3, fan: 0.5, gap: 0.3, el: m.el, color: EL_COL[m.el], speed: 10, size: 0.42, damage: 8, turn: 0.35, life: 4 });
        }, { tell: (en) => { G.fx?.burst('charge_done', _v.set(en.pos.x, en.pos.y + en.height * 0.8, en.pos.z), { color: EL_COL[m.el], scale: 0.9 }); G.audio?.sfx('charge', { pos: en.pos, vol: 0.6 }); },
          during: (en) => en.face(P.pos.x, P.pos.z, 0.016, 8) });
      }
    }
  }

  // ---- soft checks ----
  const on = (ev, f) => G.events.on(ev, (e) => { try { f(e); } catch (err) { G.reportError('page:lessons', err); } });
  on('wilds:guardian', ({ enemy, el }) => {
    if (!enemy) return;
    moves.set(enemy, { el, t: 0, volleyT: 6, beamed: false, beamed2: false });
    if (wanted() && !L) begin(FIGHT, el, enemy);
  });
  on('wilds:page', ({ el, knew }) => { if (!knew && wanted()) begin(PAGE, el, null); });
  on('beam:struggle', (e) => { if (e.state === 'end' && e.winner === 'player') complete('clash'); });
  on('spell:clash', (e) => { if (e.result === 'reflect' && (!e.defender || e.defender === G.player)) complete('parry'); });
  on('enemy:read', (e) => { if (e.parry) complete('parry'); });
  on('spell:cast', (e) => { if (L && e.caster === G.player && e.form === 'big' && e.spell === L.el) complete('charge'); });
  on('element:combo', (e) => { if (e.kind === 'fusion' && e.team !== 'enemy') complete('fusion'); });   // catalog.js kind 'fusion'

  return {
    update(dt) {
      guardianMoves(dt);
      if (!L || G.mode !== 'play') return;
      const b = beat();
      if (!b) return;
      // the fight's lessons end with the fight (she left, it fell)
      if (L.list === FIGHT && (!L.e || L.e.dead || !G.combat?.enemies?.includes(L.e))) { end(); return; }
      if (!L.shown) {
        L.shown = true;
        const name = t('spells.book.' + L.el + '.big');
        const task = b.id === 'fusion' ? key('fusion.' + L.el) : key(b.id + '.task');
        G.ui?.coach?.({ who: t(key('who')), line: t(key(b.id + '.line')), task: fill(t(task, { name })), n: L.i + 1, of: L.list.length });
      }
      L.t += dt;
      const max = (b.id === 'fusion' && POINTER_ONLY[L.el]) || b.max;
      if (L.t >= max) complete(b.id, 'timeout');
    },
    /** tests: { list, beat, shown, t } */
    get state() { return L ? { list: L.list === FIGHT ? 'fight' : 'page', beat: beat()?.id || null, shown: L.shown, t: Math.round(L.t * 10) / 10 } : null; },
  };
}
