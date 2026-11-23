// Onboarding probe: a fresh journey played by someone who does what the journal's notes ask (src/gameplay/onboarding.js).
//
//   node tools/play.mjs --name onboarding --quality low --timeout 900 --script tools/journey/onboarding.js --params "tipGap=3&obShots=1"
//   node tools/play.mjs --name onboarding-phone --mobile --size 844x390 --dpr 2 --timeout 600 --script tools/journey/onboarding.js --params "tipGap=3&obShots=1&obStop=2"
//
// Runs INSIDE the page. From the new game at home: walk (sprint), the broom (call, climb, boost, dive, land), a hurt
// heroine with bread (heal), three elements (the wheel), then a witch who has left home (the map, the journal). Each card
// is answered by doing; obShots=1 saves each card (tip-01.png …); obStop=<n> ends after the n-th card. tipGap shortens the
// 20 s pause between cards. Output: { tips: { id: { at, how } }, seconds }.
const Q = new URLSearchParams(location.search);
const SHOTS = Q.get('obShots') === '1', STOP = Number(Q.get('obStop') || 0);
const P = G.player, t0 = G.time.t, tips = {};
G.events.on('onboarding:tip', (e) => { tips[e.id] = { at: Math.round((G.time.t - t0) * 10) / 10, how: e.how }; });
G.combat.campsEnabled = false;
const down = new Set();
const hold = (k, v) => { if (v && !down.has(k)) { down.add(k); T.key(k, true); } else if (!v && down.has(k)) { down.delete(k); T.key(k, false); } };   // only on change
const tap = async (k, n = 3) => { T.key(k, true); await T.frames(n); T.key(k, false); };
let cards = 0, last = '';
const card = async () => {
  const tx = document.querySelector('.mv-coach.on .tk')?.textContent || '';
  if (tx && tx !== last) { last = tx; cards++; if (SHOTS) { await T.frames(24); await T.shot('tip-' + String(cards).padStart(2, '0')); } }
  return !!(STOP && cards >= STOP);
};
const on = (id) => G.onboarding.state.cur === id;   // the card asking for it is up
const until = async (id, sec, act) => {
  const tEnd = G.time.t + sec;
  while (!tips[id] && G.time.t < tEnd) {
    if (G.time.t - trT > 8) { trT = G.time.t; const st = G.onboarding.state; trace.push(Math.round(G.time.t - t0) + ' want ' + id + ' cur ' + st.cur + ' gap ' + st.gap + ' broom ' + P.onBroom + ' alt ' + Math.round(P.pos.y - G.world.groundAt(P.pos.x, P.pos.z, P.pos.y + 1)) + ' mode ' + G.mode + ' busy ' + !!(G.story?.busy || G.dialogue?.active || G.ui?.talking || G.ui?.isOpen)); } if (await card()) return true; if (act) await act(); else await T.frames(2); }
  return false;
};
const trace = [];
let trT = 0;
const out = () => ({ tips, cards, seconds: Math.round((G.time.t - t0) * 10) / 10, trace });
// on foot: walk, then sprint when asked
hold('KeyW', true);
if (await until('sprint', 40, async () => { G.cam.yaw += 0.004; hold('ShiftLeft', on('sprint')); await T.frames(2); })) return out();
hold('ShiftLeft', false);
// the broom
G.state.abilities = { ...G.state.abilities, broom: true, guard: true };
if (await until('broom_call', 50, async () => { G.cam.yaw += 0.004; if (on('broom_call')) await tap('KeyF'); await T.frames(4); })) return out();
hold('KeyW', false);
if (await until('broom_climb', 40, async () => { hold('Space', on('broom_climb')); await T.frames(4); })) return out();
hold('Space', false); P.mana = P.maxMana;
hold('KeyW', true);
if (await until('boost', 50, async () => { hold('ShiftLeft', on('boost')); await T.frames(3); })) return out();
hold('ShiftLeft', false);
// the dive wants height: out over the open country
T.teleport(640, -170); await T.frames(20); P.mana = P.maxMana;
if (!P.onBroom) await tap('KeyF');
if (await until('dive', 60, async () => { const a = P.pos.y - G.world.groundAt(P.pos.x, P.pos.z, P.pos.y + 1); hold('Space', a < 30 && !on('dive')); hold('KeyC', on('dive')); G.cam.pitch = on('dive') ? -0.6 : -0.1; await T.frames(3); })) return out();
hold('KeyC', false); hold('Space', false); G.cam.pitch = -0.1;
if (await until('land', 70, async () => { if (on('land')) { hold('KeyW', false); await tap('KeyF'); } await T.frames(4); })) return out();
hold('KeyW', false);
// survival: hurt, with bread
G.state.inventory.dango = 2; P.hp = P.maxHp * 0.4;
if (await until('heal', 50, async () => { if (on('heal')) await tap('KeyX'); await T.frames(4); })) return out();
// three elements: the wheel (a number key selects too)
G.state.spells = { wind: 1, water: 1, fire: 1, ice: 1 };
let pick = 0;
if (await until('wheel', 50, async () => { if (on('wheel')) await tap(++pick % 2 ? 'Digit3' : 'Digit1'); await T.frames(6); })) return out();
// a witch on the road: the map, then the journal
G.state.flags.majo_named = true;
const menu = async (k, id) => { if (on(id)) { await tap(k); await T.frames(20); G.ui.closeMenu(); await T.frames(6); } else await T.frames(4); };
hold('KeyW', true);
if (await until('map', 90, async () => { G.cam.yaw += 0.003; await menu('KeyM', 'map'); })) return out();
hold('KeyW', false);
return out();
