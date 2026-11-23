// The journal's notes (旅途手记) — the rest of the onboarding, taught the way the open country teaches everything: in context, the first
// time it is needed, by doing. One beat at a time on the coach card (src/ui/coach.js): a short line in the voice of her
// travel journal and a task with {action} placeholders (keys on a computer, button names on a phone). Each beat
//   · shows only when its moment comes (ctx), never during dialogue, menus, story beats or another lesson set, and at
//     least GAP seconds after the last one, so no stretch of the road becomes a lecture;
//   · is ticked off by doing it (check / ev), before it is asked too (then it never shows), or times out (max);
//   · can be dismissed with {interact} (「知道了」); the setting 「按键提示」 (settings.hints) turns them all off.
// Done beats live in flags.tip_<id> (no new save field). The combat systems are taught elsewhere: the storm and the stars
// of episode 1 (dodge, guard, casting), Fran's spar lessons (src/story/spar-lessons.js), the page-trial lessons
// (src/gameplay/page-lessons.js), first meetings with foes (combat.hint.*), the element notes (elements.ui.first) and
// the puzzles' own clues (gameplay.wilds.hint.*). The light wings, the familiar and 金环 are not in the journey's kit.
// G.onboarding = { state, beats, add(beat) }; events 'onboarding:tip' { id, how: 'done'|'timeout'|'skip'|'known' }.
// Other systems queue their own first-use beats through add(beat) and get the same one-at-a-time spacing, busy gating,
// {interact} skip and coach card: beat = { id, ctx(s), check?(s), ev?: name | [name, filter], max, after?, shownOnly?,
// calm? (not while G.combat.inCombat), key? (loc prefix with .line / .task, default 'gameplay.tips.<id>'),
// flag? (the done flag in G.state.flags, default 'tip_<id>') }. s = { playT, walkT, broomT, broomTotal, roadT, cur, at }.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { fill } from '../story/dialogue.js';

const GAP = 20;   // seconds between two cards (tests: ?tipGap=n)
const P = () => G.player;
const knows = (el) => (G.state?.spells?.[el] | 0) > 0;
const alt = () => { const p = P(); return p ? p.pos.y - G.world.groundAt(p.pos.x, p.pos.z, p.pos.y + 1) : 0; };
const left = () => !!G.quests?.isDone?.('apprentice') || !!G.state?.flags?.majo_named;
const _o = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
/** a roof over her head (a house at home): no broom lesson indoors */
const roofed = () => { const p = P(); _o.set(p.pos.x, p.pos.y + 1.7, p.pos.z); return !!G.physics?.raycast?.(_o, UP, 9, { exclude: p.physChar }); };
const flagOf = (b) => b.flag || 'tip_' + b.id;
const done = (b) => !!G.state?.flags?.[flagOf(b)];
const waterNear = (r) => { const p = P(); for (let a = 0; a < 8; a++) if (G.world.isWater(p.pos.x + Math.cos(a * 0.785) * r, p.pos.z + Math.sin(a * 0.785) * r)) return true; return false; };
const burningNear = (r) => { const p = P(), E = G.elements; if (!E?.isBurningAt) return false; for (let a = 0; a < 8; a++) if (E.isBurningAt(p.pos.x + Math.cos(a * 0.785) * r, p.pos.z + Math.sin(a * 0.785) * r)) return true; return E.isBurningAt(p.pos.x, p.pos.z); };
const wetFoe = () => (G.combat?.enemies || []).some((e) => !e.dead && e.reactor?.wet > 0 && e.pos.distanceTo(P().pos) < 22);
const tab = (id) => !!(G.ui?.menuOpen && G.ui?.menuTab === id);
const ringNear = () => (G.wilds?.rings?.courses || []).some((c) => { const r = c.rings[0]?.h?.group; return r && r.visible && r.position.distanceTo(P().pos) < 70; });

/**
 * id, ctx() — may it show now · check() — done by state · ev — done by an event (name, filter) · max — seconds shown
 * (an observation with no check simply stays that long) · after — ids that must be done first · shownOnly — the check
 * is a resting state (not riding), so it only counts once the card is up.
 */
const BEATS = [
  // on foot, around home
  { id: 'sprint', ctx: (s) => s.walkT > 4 && P().state === 'ground', check: () => P().sprinting, max: 14 },
  // the broom (granted with the book)
  { id: 'broom_call', ctx: (s) => G.state.abilities?.broom && s.walkT > 12 && !P().onBroom && !roofed(), check: () => P().onBroom, max: 16 },
  // (around home the broom only rises a few metres: count a climb from where the card appeared)
  { id: 'broom_climb', ctx: (s) => P().onBroom && s.broomT > 2, check: (s) => P().onBroom && s.cur?.id === 'broom_climb' && alt() > s.at + 2.5, max: 14, after: ['broom_call'] },
  { id: 'boost', ctx: (s) => P().onBroom && s.broomT > 8 && P().mana > P().maxMana * 0.4, check: () => P().broom?.boosting, max: 14, after: ['broom_climb'] },
  { id: 'empty', ctx: () => P().onBroom && P().mana < P().maxMana * 0.12, max: 10 },
  { id: 'dive', ctx: () => P().onBroom && alt() > 24, check: () => P().onBroom && P().vel.y < -6 && P().speed > 14, max: 16, after: ['boost'] },
  { id: 'land', ctx: (s) => P().onBroom && s.broomTotal > 45, check: () => !P().onBroom, shownOnly: true, max: 14, after: ['broom_climb'] },
  // survival
  { id: 'heal', ctx: () => !P().onBroom && P().hp < P().maxHp * 0.55 && (G.state.inventory?.dango | 0) > 0, ev: 'player:healed', max: 14 },
  { id: 'respawn', ctx: (s) => s.respawned, max: 10 },
  // the spell kit outside fights
  { id: 'wheel', ctx: () => ['wind', 'water', 'fire', 'ice', 'earth', 'thunder'].filter(knows).length >= 3, ev: 'spell:select', max: 16 },
  // element chemistry in the world
  { id: 'grassfire', ctx: () => left() && burningNear(6), max: 10 },
  { id: 'fanfire', ctx: () => knows('wind') && burningNear(14), ev: ['element:combo', (e) => e.id === 'fan' || e.id === 'fanfire'], max: 16, after: ['grassfire'] },
  { id: 'freeze', ctx: () => knows('ice') && left() && !P().onBroom && waterNear(7), ev: ['element:combo', (e) => e.id === 'freeze' || e.id === 'icesheet'], max: 16 },
  { id: 'conduct', ctx: () => knows('thunder') && wetFoe(), ev: ['element:combo', (e) => e.id === 'conduct' || e.id === 'charged' || e.id === 'chargedfog'], max: 16 },
  { id: 'earthwall', ctx: () => knows('earth') && G.combat?.inCombat, ev: ['spell:cast', (e) => e.caster === P() && e.spell === 'earth'], max: 14 },
  // the exploration loop
  { id: 'map', ctx: (s) => left() && s.roadT > 25, check: () => tab('map'), max: 14 },
  { id: 'journal', ctx: (s) => left() && s.roadT > 120, check: () => tab('journal'), max: 14, after: ['map'] },
  { id: 'pages', ctx: (s) => G.state.flags?.majo_named && s.roadT > 200 && !Object.keys(G.state.wilds?.pages || {}).length, check: () => Object.keys(G.state.wilds?.pages || {}).length > 0, max: 11, after: ['journal'] },
  { id: 'rings', ctx: () => P().onBroom && ringNear(), check: () => !!G.wilds?.rings?.running, max: 12 },
  { id: 'shop', ctx: () => G.state.flags?.majo_repaired && (G.state.inventory?.stardust | 0) >= 120, max: 11 },
  { id: 'wardrobe', ctx: (s) => G.state.flags?.majo_named && s.roadT > 420, check: () => tab('wardrobe'), max: 14, after: ['journal'] },
  // phones
  { id: 'touch_look', ctx: (s) => G.input?.touch && s.playT > 3, check: (s) => s.lookAcc > 180, max: 14 },
];

export function createOnboarding() {
  const s = { playT: 0, walkT: 0, broomT: 0, broomTotal: 0, roadT: 0, respawned: false, lookAcc: 0, gapT: 8, cur: null, curT: 0, skip: null, scanT: 0, at: 0 };
  const evs = new Set();
  const want = () => G.settings?.hints !== false && G.params?.lessons !== '0';
  const busy = () => G.mode !== 'play' || G.story?.busy || G.dialogue?.active || G.ui?.talking || G.ui?.isOpen
    || G.story?.spar?.lessons?.active || G.wilds?.pageLessons?.state || G.combat?.duel || G.combat?.boss;
  function mark(b, how) {
    if (G.state?.flags) G.state.flags[flagOf(b)] = true;
    G.events.emit('onboarding:tip', { id: b.id, how });
  }
  function close(how) {
    const b = s.cur;
    if (!b) return;
    mark(b, how);
    if (how === 'done') { G.ui?.coach?.({ done: true, hold: 1.6 }); G.audio?.sfx('ui_confirm', { vol: 0.45 }); }
    else G.ui?.coach?.(null);
    s.cur = null; s.gapT = Number(G.params?.tipGap) || GAP;
  }
  function listen(b) {
    if (!b.ev) return;
    const [name, filter] = Array.isArray(b.ev) ? b.ev : [b.ev, null];
    G.events.on(name, (e) => { if (!filter || filter(e || {})) evs.add(b.id); });
  }
  for (const b of BEATS) listen(b);
  G.events.on('player:respawn', () => { s.respawned = true; });

  return {
    beats: BEATS,
    /** queue another system's first-use beat (see the header); returns false for a duplicate id */
    add(b) {
      if (!b || !b.id || !b.ctx || BEATS.some((x) => x.id === b.id)) return false;
      BEATS.push(b); listen(b);
      return true;
    },
    get state() { return { cur: s.cur?.id || null, t: Math.round(s.curT * 10) / 10, gap: Math.round(s.gapT * 10) / 10, done: BEATS.filter((b) => done(b)).map((b) => b.id) }; },
    update(dt) {
      const p = P();
      if (!p || !G.state || !(dt > 0)) return;
      if (G.mode === 'play') {
        s.playT += dt;
        s.walkT = p.state === 'ground' && p.speed > 1.2 ? s.walkT + dt : Math.max(0, s.walkT - dt * 0.2);
        s.broomT = p.onBroom ? s.broomT + dt : 0;
        if (p.onBroom) s.broomTotal += dt;
        if (left()) s.roadT += dt;
        s.lookAcc += Math.abs(G.input?.lookX || 0) + Math.abs(G.input?.lookY || 0);
      }
      // things she already did tick themselves off, shown or not (twice a second)
      if ((s.scanT -= dt) <= 0) for (const b of BEATS) {
        s.scanT = 0.5;
        if (done(b) || b === s.cur) continue;
        if (evs.has(b.id) || (b.check && !b.shownOnly && G.mode === 'play' && b.check(s))) mark(b, 'known');
      }
      const b = s.cur;
      if (b) {
        if (busy()) { G.ui?.coach?.(null); s.cur = null; s.gapT = 4; return; }   // a story beat took over: ask again later
        s.curT += dt;
        if (evs.has(b.id) || (b.check && b.check(s))) { close('done'); return; }
        if (s.curT >= b.max) close(b.check || b.ev ? 'timeout' : 'done');
        return;
      }
      if (!want() || busy()) return;
      if ((s.gapT -= dt) > 0) return;
      s.gapT = 1;   // look again in a second
      for (const n of BEATS) {
        if (done(n) || (n.after && n.after.some((a) => { const d = BEATS.find((x) => x.id === a); return d && !done(d); }))) continue;
        if (n.calm && G.combat?.inCombat) continue;
        let ok = false;
        try { ok = !!n.ctx(s); } catch (e) { ok = false; }
        if (!ok) continue;
        s.cur = n; s.curT = 0; s.at = alt();
        const k = n.key || 'gameplay.tips.' + n.id;
        G.ui?.coach?.({ who: t('gameplay.tips.who'), line: t(k + '.line'), task: fill(t(k + '.task')) });
        if (!s.skip) s.skip = G.interact?.add?.({ getPos: (out) => out.copy(P().pos).setY(P().pos.y + 1), radius: 3, priority: -10, broom: true,   /* lowest: any real interactable in reach wins E */
          enabled: () => !!s.cur, prompt: () => t('gameplay.tips.skip'), onInteract: () => close('skip') }) || null;
        return;
      }
    },
  };
}
