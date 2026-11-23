// Page-lessons probe: the tier-2 lessons at the first page trial (src/gameplay/page-lessons.js), played as a learner.
//
//   node tools/play.mjs --name page-lessons --quality low --timeout 900 --script tools/journey/page-lessons.js [--params "plSite=pg_fire&plShots=1"]
//   (phone: --mobile --size 844x390 --dpr 2 … "plShots=1&plStop=2")
//
// Runs INSIDE the page. A named witch with Fran's six small forms walks to the site, answers its seal with the small form,
// (here: the seal is set open, journey-activities answers the mechanisms) and when the guardian's beam comes, raises the guard into it and mashes {attack} (对波); when its slow bolts come, raises
// the guard as one arrives (弹反); then the guardian is finished off (its fight is measured by fight-pacing.js), she
// takes the page (the learn ceremony), holds {cast} for the charged form, and makes one fusion (fire: wind through a
// flying fireball). plShots=1 saves each card; plStop=<n> ends after the n-th card. Output: { lessons: { id: { at, how } } }.
const Q = new URLSearchParams(location.search);
const SITE = Q.get('plSite') || 'pg_fire', SHOTS = Q.get('plShots') === '1', STOP = Number(Q.get('plStop') || 0);
const P = G.player, PG = G.wilds.pages, C = G.combat;
C.campsEnabled = false; C.wildlifeEnabled = false;
G.state.flags.majo_named = true; G.state.flags.tier2_lessons = false;
G.state.spells = { wind: 1, water: 1, fire: 1, ice: 1, earth: 1, thunder: 1 };
G.state.abilities = { ...G.state.abilities, guard: true };
const s = PG.get(SITE), el = s.def.el;
const lessons = {}, t0 = G.time.t;
G.events.on('page:lesson', (e) => { lessons[e.id] = { at: Math.round((G.time.t - t0) * 10) / 10, how: e.how }; });
const beamLog = [];
for (const ev of ['beam:guard', 'beam:struggle']) G.events.on(ev, (e) => { if (beamLog.length < 12) beamLog.push(ev + ' ' + (e.state || '') + ' ' + (e.winner || '') + ' ' + (e.why || '') + ' @' + Math.round((G.time.t - t0) * 10) / 10); });
let beamsSeen = 0;
const down = new Set();
const key = (k, on) => { if (on && !down.has(k)) { down.add(k); T.key(k, true); } else if (!on && down.has(k)) { down.delete(k); T.key(k, false); } };
const tap = async (k, n = 2) => { T.key(k, true); await T.frames(n); T.key(k, false); };
let cards = 0, last = '';
const card = async () => {
  const tx = document.querySelector('.mv-coach.on .tk')?.textContent || '';
  if (tx && tx !== last) { last = tx; cards++; if (SHOTS) { await T.frames(24); await T.shot('page-lesson-' + String(cards).padStart(2, '0')); } }
  return STOP && cards >= STOP;
};
const face = (p) => { G.cam.yaw = Math.atan2(P.pos.x - p.x, P.pos.z - p.z); G.cam.pitch = -0.08; };
const cast = (id, form, point) => { const q = P.pos.clone().setY(P.pos.y + 1.25); return G.spells.cast(id, form, { caster: P, point: point.clone(), dir: point.clone().sub(q).normalize() }); };
// walk up and answer the seal with the small form
const dx = Math.sin(s.def.face), dz = Math.cos(s.def.face);
T.teleport(s.center.x + dx * 8, s.center.z + dz * 8); P.yaw = s.def.face + Math.PI;
await T.frames(60);
// the seal as broken (journey-activities tests the mechanisms themselves): an open seal wakes its guardian when she is in the arena
G.state.wilds.pages[SITE] = 'open';
let g = null;
for (let i = 0; i < 400 && !(g = PG.guardian(SITE)); i++) await T.frames(2);
if (!g) return { error: 'guardian did not wake', st: PG.state(SITE), ph: PG.phase(SITE) };
// the fight's lessons: catch the beam, parry the bolts
while (!g.dead && G.time.t - t0 < 120 && !(lessons.clash && lessons.parry)) {
  await T.frames(1);
  if (await card()) return { stopped: cards, lessons, beamLog, beamsSeen };
  face(g.pos);
  const beam = (G.spells.beams || []).find((b) => b.team === 'enemy' && b.alive);
  if (beam && !beam._seen) { beam._seen = 1; beamsSeen++; }
  const bolts = (G.spells.projectiles || []).filter((o) => o.alive && o.team === 'enemy');
  const close = Math.min(99, ...bolts.map((o) => o.pos.distanceTo(P.pos)));
  const struggling = !!G.spells.struggle;
  key('KeyR', !!beam || struggling || close < 2.4);
  if (struggling && (G.time.frame % 4) === 0) await tap('Mouse0', 1);
  P.hp = Math.max(P.hp, P.maxHp * 0.5);
}
for (const k of [...down]) key(k, false);
// finish the guardian (its fight is fight-pacing's business), take the page
if (!g.dead) C.damage(g, 99999, { force: true, element: el, source: P });
for (let i = 0; i < 200 && PG.state(SITE) !== 'won'; i++) await T.frames(2);
await T.wait(1500);
const pp = s.page.position; T.teleport(pp.x + 0.4, pp.z + 0.4, pp.y - 0.9);
for (let k = 0; k < 40 && G.mode === 'play'; k++) await T.frames(2);
for (let k = 0; k < 40 && G.mode !== 'play'; k++) { await tap(k % 2 ? 'Enter' : 'KeyE'); await T.frames(8); }
await T.frames(20);
// the page's lessons: the charged form, then a fusion
G.spells.select(el);
const target = P.pos.clone().add({ x: -Math.sin(P.yaw) * 12, y: 1, z: -Math.cos(P.yaw) * 12 });
while (G.time.t - t0 < 240 && !(lessons.charge && lessons.fusion) && !lessons.all) {
  if (await card()) break;
  await T.frames(2);
  P.mana = P.maxMana;
  if (!lessons.charge) { G.spells.select(el); key('Mouse2', true); await T.wait(1300); key('Mouse2', false); await T.wait(900); continue; }
  if (el === 'fire') { G.spells.select('fire'); await tap('Mouse2'); await T.wait(120); G.spells.select('wind'); await tap('Mouse2'); await T.wait(900); }
  else { G.spells.select(el); key('Mouse2', true); await T.wait(1300); key('Mouse2', false); await T.wait(500); G.spells.select(el === 'earth' ? 'thunder' : el === 'ice' ? 'fire' : 'fire'); await tap('Mouse2'); await T.wait(900); }
}
for (const k of [...down]) key(k, false);
return { beamLog, beamsSeen, site: SITE, el, lessons, cards, flag: !!G.state.flags.tier2_lessons, seconds: Math.round((G.time.t - t0) * 10) / 10 };
