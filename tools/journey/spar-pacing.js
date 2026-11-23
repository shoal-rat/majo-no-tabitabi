// Spar pacing probe: times Fran's forest bout (the recollection form, src/story/fran-spar.js) with a scripted duellist.
//
//   node tools/play.mjs --name spar --quality low --timeout 900 --script tools/journey/spar-pacing.js [--params "spRuns=3"]
//
// Runs INSIDE the page. Each run puts the heroine (episode-2 kit: six elements, guard) on Fran's trial ground and starts
// the bout. The bot faces her, raises the guard when one of her bolts is about to arrive, answers a wind-up with the
// element that scatters it (wind against fans, star-fall, dives and volleys; fire against bubbles and frost), and streams
// charms while she is open. Output per run: { result, seconds, casts, phase, remaining, taken, hits, blocked }.
const Q = new URLSearchParams(location.search);
const runs = Number(Q.get('spRuns') || 3);
const S = G.story, P = G.player;
const ANS = { fan: 'wind', rain: 'wind', dive: 'wind', volley: 'wind', bubbles: 'fire', frost: 'fire' };
G.combat.campsEnabled = false;
G.state.spells = { wind: 2, water: 2, fire: 2, ice: 2, earth: 2, thunder: 2 };
G.state.abilities = { ...G.state.abilities, guard: true };
const down = new Set();
const key = (k, on) => { if (on && !down.has(k)) { down.add(k); T.key(k, true); } else if (!on && down.has(k)) { down.delete(k); T.key(k, false); } };
const out = [];
for (let r = 0; r < runs; r++) {
  const a = S.anchor('franTrial');
  T.teleport(a.x + 2, a.z + 7);
  await T.frames(40);
  P.hp = P.maxHp; P.mana = P.maxMana;
  S.spar.start(false);
  await T.frames(5);
  if (!S.spar.active) { out.push({ error: 'spar did not start' }); break; }
  const t0 = G.time.t;
  let castT = 0, lastPat = null;
  while (S.spar.active && G.time.t - t0 < 240) {
    await T.frames(1);
    const st = S.spar.stats, n = S.npcs.get('fran');
    if (!st || !n) continue;
    G.cam.yaw = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z); G.cam.pitch = -0.08;
    const bolts = (G.spells.projectiles || []).filter((o) => o.alive && o.team === 'enemy' && o.data?.franSpar);
    const closest = Math.min(99, ...bolts.map((o) => o.pos.distanceTo(P.pos)));
    key('KeyR', closest < 3.2);
    key('Mouse0', st.stage === 'opening' && closest > 3.2);
    castT -= G.time.dt;
    if (st.stage === 'windup' && st.pattern !== lastPat && ANS[st.pattern] && castT <= 0) {
      lastPat = st.pattern; castT = 0.8;
      G.spells.select(ANS[st.pattern]);
      T.key('Mouse2', true); await T.frames(2); T.key('Mouse2', false);
    }
    if (st.stage !== 'windup') lastPat = null;
  }
  for (const k of [...down]) key(k, false);
  const L = S.spar.last || {};
  out.push({ result: L.result || (S.spar.active ? 'timeout' : '?'), seconds: Math.round((G.time.t - t0) * 10) / 10, casts: L.fired, phase: L.phase, remaining: L.remaining, taken: Math.round(L.taken || 0), hits: L.hits, blocked: L.blocked });
  console.warn('[spar] ' + JSON.stringify(out[out.length - 1]));
  if (S.spar.active) S.spar.reset();
  await T.frames(30);
}
return out;
