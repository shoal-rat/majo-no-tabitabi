// Fight pacing probe: times journey fights with a scripted "average player" and reports how long each one lasted.
//
//   node tools/play.mjs --name pacing --quality low --timeout 1500 --script tools/journey/fight-pacing.js \
//        [--params "fp=early|mid|all&fpOnly=wolf,greymane&fpSeed=7"]
//
// Runs INSIDE the page (play.mjs gives it T and G). For every scenario it clears the field, sets the growth profile,
// puts the heroine at noon on flat ground and spawns the foes exactly as encounters.js would (camp context, elite
// affixes, escorts, hp multipliers). The bot then fights: it locks the nearest foe, holds the charm stream, weaves
// element spells every ~1.2 s (the counter of a ward or the foe's weakness first, then whatever differs from the last
// element), keeps 6–9 m away while strafing, and dodges about 60 % of the telegraphed attacks and incoming bolts that
// would reach her. She never dies: at 1 hp she is "downed", refilled, and the down is counted.
// The last scenario runs the five-wave stardust trial (combat/trials.js) start to finish with the same bot (mid only);
// its row adds result: clear | fail.
// Profiles: early = no growth levels and Fran's six small forms (just left home: foes only appear once quest
//                   'apprentice' is done);
//           mid   = hp / mana / charm / broom at level 2 (a straight run's growth by the high pass) and all six charged
//                   forms (the page trials won).
// The six page-trial guardians (G.wilds.pages, data PAGE_SITES) are spawned the way wilds-pages.js wakes them.
// Output: one row per scenario { id, profile, ttk (game s), hits, hpLost, downs, charms, spells, staggers, wards,
//         foeAttacks (attacks started by the foes), foeAttacksPerFoe, style (combo fight style), timeout }.
const Q = new URLSearchParams(location.search);
// foes appear only once quest 'apprentice' is done: by then Fran has taught the six small (tier-1) forms; the charged
// (tier-2) forms are won one by one at the page trials (src/gameplay/wilds-pages.js)
const PROFILES = { early: { up: { hp: 0, mana: 0, charm: 0, broom: 0 }, spells: { wind: 1, water: 1, fire: 1, ice: 1, earth: 1, thunder: 1 } },
  mid: { up: { hp: 2, mana: 2, charm: 2, broom: 2 }, spells: { wind: 2, water: 2, fire: 2, ice: 2, earth: 2, thunder: 2 } } };
const which = Q.get('fp') || 'all';
const only = Q.get('fpOnly') ? Q.get('fpOnly').split(',') : null;
const seed0 = Number(Q.get('fpSeed') || 7);
const TRACE = Q.get('fpTrace') === '1';   // a per-second line of every foe's state in each row (debugging the brains)
const ORDER = ['fire', 'water', 'ice', 'wind', 'thunder', 'earth', 'sun', 'moon'];
// the answer a player learns for each foe (beasts.js / rogues.js); wards are read live
const WEAK = { paper: ['fire', 'wind'], blob: ['fire', 'earth', 'thunder'], blob_small: ['fire', 'earth'], wolf: ['fire', 'wind'], moth: ['wind', 'thunder'],
  wisp: ['water', 'wind'], golem: ['thunder', 'earth'], froststag: ['fire'], embersnake: ['water', 'ice'], caster: [], raider: ['wind', 'thunder'] };
const COUNTER = { fire: ['water', 'ice'], ice: ['fire', 'earth'], wind: ['ice', 'earth'], thunder: ['earth', 'water'], water: ['thunder', 'ice'], earth: ['thunder', 'wind'] };

const C = G.combat, P = G.player, S = G.spells;
const enc = C.encounters;
const campOf = (id) => enc.camps.find((c) => c.id === id);
const eliteOf = (id) => enc.elites.find((c) => c.id === id);
const SC = [];
for (const [type, n] of [['paper', 1], ['blob', 1], ['wolf', 2], ['moth', 1], ['wisp', 1], ['golem', 1], ['froststag', 1], ['embersnake', 1], ['caster', 1], ['raider', 1]]) SC.push({ id: type + (n > 1 ? '×' + n : ''), kinds: [[type, n]] });
for (const id of ['moor_pages', 'moor_wolves', 'wilds_pack', 'wilds_bandits', 'pass_post']) SC.push({ id, camp: id });
for (const id of ['greymane', 'crowfeather', 'redthroat', 'mossback', 'whitecrown']) SC.push({ id, elite: id });
for (const s of G.wilds?.pages?.sites || []) SC.push({ id: s.def.id, page: s.def });
SC.push({ id: 'trial', trial: true, profiles: ['mid'] });   // the stardust trial in Fran's clearing (post-game: mid kit only)
SC.forEach((sc, i) => { sc.n = i; });

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const realRandom = Math.random;
const keysDown = new Set();
const key = (k, on) => { if (on && !keysDown.has(k)) { keysDown.add(k); T.key(k, true); } else if (!on && keysDown.has(k)) { keysDown.delete(k); T.key(k, false); } };
const allUp = () => { for (const k of [...keysDown]) key(k, false); };
const tap = (k, frames = 2) => { T.key(k, true); return T.frames(frames).then(() => T.key(k, false)); };

// Flat open ground, one spot per scenario: craters, uplifts and fallen trees are saved and stay, so a fight on ground
// an earlier fight tore up would measure the terrain, not the foe. Spots are the flattest on a 50 m grid over the
// moor and the wilds, away from water, the camps and the elites, at least 80 m apart; the same list every run (it
// depends only on the terrain).
function arenas(n) {
  const W = G.world, out = [];
  const avoid = [...enc.camps, ...enc.elites];
  const cands = [];
  for (let x = -1000; x <= 1300; x += 50) for (let z = -450; z <= 150; z += 50) {
    if (W.isWater(x, z) || avoid.some((c) => Math.hypot(c.x - x, c.z - z) < 70)) continue;
    let lo = 1e9, hi = -1e9, wet = false;
    for (let a = 0; a < 12; a++) for (const r of [6, 14]) {
      const px = x + Math.cos(a / 12 * 6.283) * r, pz = z + Math.sin(a / 12 * 6.283) * r;
      if (W.isWater(px, pz)) wet = true;
      const y = W.groundAt(px, pz, 500); lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    if (!wet && (W.protectionAt?.(x, z) ?? 0) < 0.01) cands.push({ x, z, s: hi - lo });
  }
  cands.sort((a, b) => a.s - b.s);
  for (const c of cands) { if (out.length >= n) break; if (out.every((o) => Math.hypot(o.x - c.x, o.z - c.z) >= 80)) out.push(c); }
  return out;
}
function profile(name) {
  const pr = PROFILES[name];
  G.state.upgrades = { ...G.state.upgrades, ...pr.up };
  G.state.spells = { ...pr.spells };
  G.state.abilities = { ...G.state.abilities, guard: true, broom: true };
  G.state.selectedSpell = 'fire';
  P.recalcStats(); P.hp = P.maxHp; P.mana = P.maxMana;
}
function noon() { G.state.flags.journey_sun_offset = (Math.PI / 2 - 0.85) * 1440 / (2 * Math.PI) - G.state.playTime; }

function spawnScenario(sc, at) {
  const made = [];
  const camp = { id: 'probe', x: at.x, z: at.z, r: 30, alive: new Set() };
  const place = (i, n, r = 9) => { const a = (i / Math.max(1, n)) * 1.6 - 0.8; return { x: at.x + Math.sin(P.yaw + a) * (r + 3), y: NaN, z: at.z + Math.cos(P.yaw + a) * (r + 3) }; };
  const put = (type, i, n, o = {}) => { const e = C.spawn(type, place(i, n), { camp: o.camp || camp, aggro: true, hpMul: o.hpMul, element: o.element, wardEl: o.wardEl }); if (e) { e.encounter = o.camp || camp; made.push(e); } return e; };
  let kinds = sc.kinds;
  let lead = null;
  if (sc.camp) { const c = campOf(sc.camp); kinds = c.kinds; lead = c.leader?.affixes || null; }
  if (sc.page) {
    const g = sc.page.guardian;
    const e = C.spawn(sc.page.id, place(0, 1), { def: C.TYPES[g.base], aggro: true, persistent: true, hpMul: g.hpMul, element: g.element, wardEl: g.ward, camp });
    if (e) { e.encounter = camp; e.named = sc.page.id; e.data.base = g.base; C.makeElite(e, g.affixes || []); if (e.cr) e.cr.group.scale.multiplyScalar(1.15); made.push(e); }
    kinds = [];
  }
  if (sc.elite) {
    const el = eliteOf(sc.elite);
    const e = put(el.type, 0, 1, { hpMul: el.hp ?? 1.5, element: el.element, wardEl: el.wardEl });
    if (e) { e.named = el.id; C.makeElite(e, el.affixes); if (e.type === 'wolf') e.data.leader = true; }
    kinds = el.escorts || [];
  }
  let total = 0; for (const [, n] of kinds) total += n;
  let i = 0;
  for (const [type, n] of kinds) for (let k = 0; k < n; k++) put(type, i++, total);
  if (lead && made[0]) { C.makeElite(made[0], lead); if (made[0].type === 'wolf') made[0].data.leader = true; }
  return made;
}

async function fight(sc, prof, seed) {
  Math.random = mulberry(seed);
  allUp();
  C.clear(); S.clear?.();
  C.campsEnabled = false; C.wildlifeEnabled = false;
  profile(prof);
  noon();
  const tr = sc.trial ? G.world.anchor?.('franTrial') : null;
  const at = tr ? { x: tr.x - 7, z: tr.z + 6 } : SPOTS[((prof === 'mid' ? SC.length : 0) + sc.n) % SPOTS.length];
  T.teleport(at.x, at.z);
  P.yaw = 0; G.cam.yaw = Math.PI; G.cam.pitch = -0.12;
  await T.frames(60);
  P.hp = P.maxHp; P.mana = P.maxMana;
  P.damageFloor = 1;
  const R = { id: sc.id, profile: prof, ttk: 0, hits: 0, hpLost: 0, downs: 0, charms: 0, spells: 0, staggers: 0, wards: 0, foeAttacks: 0, killsBy: {}, timeout: false };
  const offs = [];
  const on = (ev, f) => { G.events.on(ev, f); offs.push(() => G.events.off?.(ev, f)); };
  on('player:damaged', (e) => { R.hits++; R.hpLost += e.amount; });
  on('spell:cast', (e) => { if (e.caster !== P) return; if (e.spell === 'charm') R.charms++; else if (e.spell !== 'guard') R.spells++; });
  on('enemy:stagger', () => R.staggers++);
  on('enemy:ward', (e) => { if (e.state === 'break') R.wards++; });
  P.onDamageFloor = () => { R.downs++; C.after(0.05, () => { P.hp = P.maxHp; }); };
  const foes = sc.trial ? [] : spawnScenario(sc, at);
  if (sc.trial) { C.trials.start(); on('trial:end', (e) => { R.result = e.result; }); }
  const watched = new Set();
  const watch = (e) => { if (watched.has(e)) return; watched.add(e); const a = e.attack.bind(e); e.attack = (...args) => { R.foeAttacks++; return a(...args); }; };
  foes.forEach(watch);
  const nFoes = foes.length;
  const t0 = G.time.t;
  let castT = 0.6, strafeT = 0, strafe = 1, dodgeCd = 0, lastEl = null;
  const decided = new WeakMap();
  const rnd = mulberry(seed * 31 + 5);
  let traceT = 0;
  if (TRACE) R.trace = [];
  while (true) {
    await T.frames(1);
    const now = G.time.t - t0;
    const live = C.enemies.filter((e) => !e.dead && !e.data?.leaving && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < 70);
    for (const e of live) watch(e);
    if (!live.length && !(sc.trial && C.trials.active)) break;
    if (!live.length) { allUp(); continue; }
    if (TRACE && (traceT -= G.time.dt) <= 0) {
      traceT = 0.5;
      R.trace.push(now.toFixed(1) + (G.elements?.concealedAt?.(P.pos) ? ' HID' : '') + ' ' + live.map((e) => `${e.type}#${e.id} hp${e.hp} cd${(e.cd ?? 0).toFixed(1)} st${e.stunT.toFixed(1)} fear${(e.fearT || 0).toFixed(1)} ag${e.aggro ? 1 : 0} ${e.atk ? e.atk.name : '-'} d${e.pos.distanceTo(P.pos).toFixed(1)}`).join(' | '));
    }
    if (now > (sc.trial ? 600 : sc.elite || sc.page ? 420 : 150)) { R.timeout = true; R.left = live.map((e) => e.type + ':' + Math.round(e.hp)).join(' '); break; }
    // target: the lock (or the nearest), the camera from behind her toward it
    let tg = C.lockTarget && !C.lockTarget.dead ? C.lockTarget : null;
    if (!tg || !live.includes(tg)) { tg = live.reduce((b, e) => (!b || e.pos.distanceTo(P.pos) < b.pos.distanceTo(P.pos) ? e : b), null); C.lockTarget = tg; }
    const dx = tg.pos.x - P.pos.x, dz = tg.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    G.cam.yaw = Math.atan2(-dx, -dz);
    G.cam.pitch = -0.1;
    key('Mouse0', true);
    // keep 6–9 m, strafe
    strafeT -= G.time.dt;
    if (strafeT <= 0) { strafeT = 1.6 + rnd() * 1.6; strafe = rnd() < 0.5 ? 1 : -1; }
    key('KeyW', d > 9.5); key('KeyS', d < 5.5);
    key('KeyA', strafe < 0); key('KeyD', strafe > 0);
    // the trial ends if she leaves its ring (34 m): past 20 m from the centre, walk back in instead
    if (sc.trial) {
      const cx = at.x - P.pos.x, cz = at.z - P.pos.z;
      if (Math.hypot(cx, cz) > 20) { G.cam.yaw = Math.atan2(-cx, -cz); key('KeyW', true); key('KeyS', false); key('KeyA', false); key('KeyD', false); }
    }
    // dodge telegraphed attacks that would reach her (decided once per attack / bolt: ~60 % success)
    dodgeCd -= G.time.dt;
    let threat = false;
    for (const e of live) {
      const a = e.atk;
      if (!a || a.fired) continue;
      const rem = a.windup - a.t;
      if (rem > 0.32 || rem < 0) continue;
      if (!decided.has(a)) decided.set(a, rnd() < 0.6);
      if (decided.get(a) && e.pos.distanceTo(P.pos) < 16) threat = true;
    }
    for (const p of S.projectiles || []) {
      if (!p.alive || p.team !== 'enemy') continue;
      const q = p.pos.distanceTo(P.pos);
      if (q > 4.5) continue;
      const closing = -((p.pos.x - P.pos.x) * p.vel.x + (p.pos.y - P.pos.y - 1) * p.vel.y + (p.pos.z - P.pos.z) * p.vel.z) / Math.max(0.1, q);
      if (closing < 3) continue;
      if (!decided.has(p)) decided.set(p, rnd() < 0.55);
      if (decided.get(p)) threat = true;
    }
    if (threat && dodgeCd <= 0) { dodgeCd = 0.9; tap('KeyQ', 2); }
    // weave an element spell every ~1.2 s when the mana is there
    castT -= G.time.dt;
    if (castT <= 0) {
      castT = 1.1 + rnd() * 0.3;
      const known = ORDER.filter((x) => (G.state.spells[x] | 0) > 0);
      let want = null;
      const w = tg.ward && tg.ward.hp > 0 ? COUNTER[tg.ward.el] : null;
      const prefs = w ? w : (WEAK[tg.data?.base || tg.type] || []);
      want = prefs.find((x) => known.includes(x) && (x !== lastEl || w)) || null;
      if (!want) want = known.find((x) => x !== lastEl && !(tg.def.immune || []).includes(x)) || known[0];
      const big = (G.state.spells[want] | 0) >= 2 && P.mana > P.maxMana * 0.7 && S.cooldown(want, 'big') <= 0 && rnd() < 0.35;
      const f = big ? 'big' : 'small';
      if (S.cooldown(want, f) <= 0) {
        S.select(want);
        lastEl = want;
        T.key('Mouse2', true);
        await T.frames(big ? Math.ceil(0.95 / Math.max(1 / 120, G.time.dt || 1 / 60)) : 2);
        T.key('Mouse2', false);
      }
    }
  }
  allUp();
  R.style = C.combo?.fightStyle ?? 0;   // what the fight rating would be judged on
  R.ttk = Math.round((G.time.t - t0) * 10) / 10;
  R.hpLost = Math.round(R.hpLost);
  R.foeAttacksPerFoe = Math.round(R.foeAttacks / Math.max(1, nFoes) * 10) / 10;
  R.maxHp = P.maxHp;
  for (const f of offs) f();
  P.damageFloor = null; P.onDamageFloor = null;
  C.lockTarget = null;
  Math.random = realRandom;
  return R;
}

const SPOTS = arenas(SC.length * 2);   // early and mid get their own spots too
const rows = [];
const profs = which === 'all' ? ['early', 'mid'] : [which];
G.combat.forceArmed = true;
for (const prof of profs) for (let i = 0; i < SC.length; i++) {
  const sc = SC[i];
  if (only && !only.includes(sc.id) && !only.includes(sc.camp) && !only.includes(sc.elite) && !(only.includes('pages') && sc.page)) continue;
  if (sc.profiles && !sc.profiles.includes(prof)) continue;
  try { const r = await fight(sc, prof, seed0 + i); rows.push(r); console.warn('[pacing] ' + JSON.stringify(r)); }
  catch (e) { rows.push({ id: sc.id, profile: prof, error: String(e && e.stack || e).slice(0, 300) }); }
}
C.clear();
await T.shot('end');
return rows;
