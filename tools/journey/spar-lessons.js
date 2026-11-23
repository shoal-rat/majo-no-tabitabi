// Spar lessons probe: plays Fran's first (story) spar as a learner who does what each lesson card asks, and times it.
//
//   node tools/play.mjs --name lessons --quality low --timeout 900 --script tools/journey/spar-lessons.js [--params "slShots=1"]
//   node tools/play.mjs --name lessons-phone --mobile --size 844x390 --dpr 3 --timeout 900 --script tools/journey/spar-lessons.js --params "slShots=1&slStop=6"
//
// Runs INSIDE the page. It jumps the story to the 'duel' step with Fran's four small forms (wind, water, fire, ice), walks
// to the trial ground and fights: lock-on with {lock}, a dodge when one of her bolts is close, the guard just before a
// bolt lands, charms in her openings, the answering element while she draws a spell, elements in turn on the stardust
// wolf (and a dodge as it pounces), wind while she is on her broom. slShots=1 saves a screenshot when each card appears
// (lesson-01.png …); slStop=<n> ends the run once the n-th card is shown (for phone screenshots). Output: { result,
// seconds, lessons: { id: { at, how } }, casts, taken }.
const Q = new URLSearchParams(location.search);
const SHOTS = Q.get('slShots') === '1', STOP = Q.get('slStop') || null;
const S = G.story, P = G.player, C = G.combat;
const ANS = { fan: 'wind', rain: 'wind', dive: 'wind', volley: 'wind', bubbles: 'fire', frost: 'fire' };
C.campsEnabled = false;
G.quests.debugSkipTo('apprentice', 'duel');
G.state.spells = { wind: 1, water: 1, fire: 1, ice: 1 };
G.state.abilities = { ...G.state.abilities, guard: true };
G.state.flags.spar_lessons = false;
const a = S.anchor('franTrial');
T.teleport(a.x + 2, a.z + 7);
for (let i = 0; i < 300 && !S.spar.active; i++) await T.frames(2);
if (!S.spar.active) return { error: 'spar did not start' };
const down = new Set();
const key = (k, on) => { if (on && !down.has(k)) { down.add(k); T.key(k, true); } else if (!on && down.has(k)) { down.delete(k); T.key(k, false); } };
const tap = async (k, n = 2) => { T.key(k, true); await T.frames(n); T.key(k, false); };
const lessons = {}, t0 = G.time.t;
let current = null, shownAt = 0, cards = 0;
G.events.on('spar:lesson', (e) => { lessons[e.id] = { at: Math.round((G.time.t - t0) * 10) / 10, how: e.how }; });
let dodges = 0;
const dodgeLog = [];
G.events.on('player:dodge', () => { dodges++; if (dodgeLog.length < 4) dodgeLog.push({ st: S.spar.lessons?.state, near: (G.spells.projectiles || []).filter((o) => o.alive && o.team === 'enemy').map((o) => [o.data?.franSpar, Math.round(o.pos.distanceTo(P.pos) * 10) / 10]) }); });
const coachText = () => document.querySelector('.mv-coach.on .tk')?.textContent || '';
let castT = 0, lastEl = null, lockT = 0;
const ORDER = ['fire', 'water', 'ice', 'wind'];
while (S.spar.active && G.time.t - t0 < 400) {
  await T.frames(1);
  const st = S.spar.stats, n = S.npcs.get('fran');
  if (!st || !n) continue;
  const wolf = C.enemies.find((e) => e.phantom && !e.dead);
  const tgt = wolf ? wolf.pos : n.pos;
  G.cam.yaw = Math.atan2(P.pos.x - tgt.x, P.pos.z - tgt.z);
  G.cam.pitch = Math.max(-0.1, Math.min(0.7, Math.atan2(tgt.y + 1 - (P.pos.y + 1.4), Math.hypot(tgt.x - P.pos.x, tgt.z - P.pos.z))));   // look up at her on the broom
  // a new card: screenshot it
  const tx = coachText();
  if (tx && tx !== current) {
    current = tx; shownAt = G.time.t; cards++;
    if (SHOTS) { await T.frames(24); await T.shot('lesson-' + String(cards).padStart(2, '0')); }
    if (STOP && cards >= Number(STOP)) break;
  }
  // lock on (the lesson asks first; keep the lock)
  lockT -= G.time.dt;
  if (!C.lockTarget && lockT <= 0) { lockT = 1; await tap('KeyT'); }
  // her bolts: dodge when close, guard at the last moment
  const bolts = (G.spells.projectiles || []).filter((o) => o.alive && o.team === 'enemy' && o.data?.franSpar);
  const close = Math.min(99, ...bolts.map((o) => o.pos.distanceTo(P.pos)));
  // follow the card: dodge in the dodge lesson, guard in the guard lesson, hit back only from the counter lesson on
  const beat = S.spar.lessons?.state?.beat || 'free';
  const early = beat === 'lock' || beat === 'dodge' || beat === 'guard';
  if (beat === 'dodge' && close < 4) await tap('KeyQ');
  else key('KeyR', close < 2.6 && !wolf);
  castT -= G.time.dt;
  if (wolf) {
    // the stardust wolf: elements in turn, charms between, a dodge as it pounces
    key('Mouse0', true);
    // dodge into the pounce itself (the read needs the blow to arrive inside the dodge)
    if (wolf.data.bite > 0 && wolf.pos.distanceTo(P.pos) < 3.2) await tap('KeyQ');
    if (castT <= 0) { castT = 1.0; const el = ORDER.find((x) => x !== lastEl && G.spells.cooldown(x) <= 0); if (el) { lastEl = el; G.spells.select(el); await tap('Mouse2'); } }
    continue;
  }
  key('Mouse0', !early && st.stage === 'opening' && close > 2.6);
  if (st.stage === 'windup' && ANS[st.pattern] && castT <= 0) { castT = 0.8; G.spells.select(ANS[st.pattern]); await tap('Mouse2'); }
  // wind on her broom: when a dive brings her low and close
  const low = n.pos.y - G.world.groundAt(n.pos.x, n.pos.z, n.pos.y + 1) < 4.5 && n.pos.distanceTo(P.pos) < 12;
  if (st.phase >= 2 && st.stage !== 'opening' && low && castT <= 0) { castT = 1.0; G.spells.select('wind'); await tap('Mouse2'); }
}
for (const k of [...down]) key(k, false);
const L = S.spar.last || {};
return { dodges, dodgeLog, result: L.result || (S.spar.active ? 'running' : '?'), seconds: Math.round((G.time.t - t0) * 10) / 10, lessons, casts: L.fired, phase: L.phase, taken: Math.round(L.taken || 0), flag: !!G.state.flags.spar_lessons };
