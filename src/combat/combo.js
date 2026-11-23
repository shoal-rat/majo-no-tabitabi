// Combo + fight rating. Every hit of hers within 3 s extends the chain; style comes from mixing elements, reactions,
// broken wards, staggers, interrupted wind-ups, blows dodged or parried through (pacing.js), riders knocked off brooms,
// perfect reflects and mid-air clashes. Getting hit breaks the chain.
// When the fight ends (no foe engaged for 3 s after a kill) the fight is rated and a good rating pays out in stardust.
// C.combo = { count, style, rank (0..5), best, t (seconds since the last hit), fightStyle, kills }
import { G } from '../core/game.js';
import { t, raw } from '../core/i18n.js';

// "longer fights" round: a fight now lasts ~2.5× as long and yields ~2.5× the style, so the ranks and the payout scale
// with it (was [0, 10, 25, 45, 70, 100] and 22 %): the same fight earns the same rank and about the same stardust
const RANKS = [0, 25, 60, 110, 175, 250];
const PAYOUT = 0.09;
const WINDOW = 3;

export function createCombo(C) {
  const K = { count: 0, style: 0, rank: 0, best: 0, t: 99, fightStyle: 0, kills: 0, lastEls: [], idleT: 0, rankUpT: 0 };
  function rankOf(s) { let r = 0; for (let i = 0; i < RANKS.length; i++) if (s >= RANKS[i]) r = i; return r; }
  function add(points) {
    K.style += points;
    K.fightStyle += points;
    const r = rankOf(K.fightStyle);
    if (r > K.rank) { K.rank = r; K.rankUpT = 1.2; G.events.emit('combat:rank', { rank: r }); }
  }
  const mine = (src) => src === G.player || src?.caster === G.player || src?.owner === G.player;
  G.events.on('enemy:hit', (ev) => {
    if (!ev || ev.dot || !mine(ev.by)) return;
    if (K.t > WINDOW) { K.count = 0; K.style = 0; K.lastEls.length = 0; }
    K.count++;
    K.t = 0;
    K.best = Math.max(K.best, K.count);
    let p = 1;
    const el = ev.element || 'charm';
    if (!K.lastEls.includes(el)) p += 2;
    K.lastEls.push(el); if (K.lastEls.length > 5) K.lastEls.shift();
    if (ev.reaction) p += 3;
    if (ev.countered) p += 1;
    if (ev.exposed) p += 1;
    if (K.count % 10 === 0) p += 3;
    add(p);
  });
  G.events.on('enemy:ward', (ev) => { if (ev?.state === 'break') add(5); });
  G.events.on('enemy:stagger', () => add(3));
  G.events.on('enemy:knocked', () => add(4));
  G.events.on('enemy:interrupt', () => add(4));
  G.events.on('enemy:read', () => add(3));
  G.events.on('enemy:killed', (ev) => { if (ev?.by !== 'self' && ev?.by !== 'split') { K.kills++; add(2); } });
  G.events.on('spell:clash', (ev) => {
    if (!ev) return;
    if (ev.result === 'reflect' && ev.defender === G.player) add(4);
    else if (ev.result !== 'block' && ev.result !== 'reflect' && C.inCombat) add(2);
  });
  G.events.on('player:damaged', (ev) => { if (ev && ev.amount > 0 && !ev.dot) { K.count = 0; K.style = 0; K.lastEls.length = 0; K.t = 99; } });

  K.update = function (dt) {
    K.t += dt;
    if (K.rankUpT > 0) K.rankUpT -= dt;
    if (C.inCombat) { K.idleT = 0; return; }
    if (K.fightStyle <= 0) return;
    K.idleT += dt;
    if (K.idleT < 3) return;
    // the fight is over: rate it
    const r = rankOf(K.fightStyle);
    if (K.kills > 0 && r >= 1 && !C.trial?.active) {
      const name = (raw('combat.combo.ranks') || [])[r] || '';
      const n = r >= 2 ? Math.round(K.fightStyle * PAYOUT) : 0;
      if (n > 0) { G.gameplay?.spawnPickup?.('stardust', G.player.pos, n); G.ui?.toast?.(t('combat.combo.bonus', { rank: name, n }), { dur: 3, icon: 'stardust' }); }
      else G.ui?.toast?.(t('combat.combo.rating', { rank: name }), { dur: 2.5 });
      G.events.emit('combat:rated', { rank: r, style: K.fightStyle, kills: K.kills, bonus: n });
    }
    K.fightStyle = 0; K.kills = 0; K.rank = 0; K.idleT = 0;
  };
  K.reset = function () { K.count = 0; K.style = 0; K.rank = 0; K.fightStyle = 0; K.kills = 0; K.t = 99; K.lastEls.length = 0; };
  K.rankName = (r) => (raw('combat.combo.ranks') || [])[r] || '';
  return K;
}
