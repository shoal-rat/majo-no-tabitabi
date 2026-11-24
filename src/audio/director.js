// Automatic music + ambience director.
// Music: picks a mood from context every 0.25 s; a new mood has to stay wanted for a while (short for battle, longer for
// exploring) before it crossfades in, so flickers at borders never restart a track. Exploring tracks resume where they
// stopped (audio.js remembers the playhead).
//   fights   Fran's spar → duel (the recollection bout → final); a named foe (elite, page guardian) close by → boss;
//            any other fight → battle. Intensity (0..1) fades in the track's hot layer: more foes on her, a foe that
//            rallied or reached its second phase, low health, Fran's later movements.
//   places   City of Magic → town; flying → flight; beside an unfinished page trial → pages; home and its outskirts by
//            day → home; else sun / dusk / night from the Veil.
// Ambience: base beds by land (meadow / dusk woods / night / mountain / town) + local layers (wind with altitude, broom
// rush with speed, river, lake & sea, rain, fire), each a looping handle whose level glides to its target.
import { clamp, smoothstep } from '../core/util.js';
import { AMB } from './names.js';

const URGENT = new Set(['battle', 'boss', 'duel', 'final', 'ending', 'title']);
const FIGHT = new Set(['battle', 'boss', 'duel', 'final']);
const CITY = new Set(['bellcrown', 'gate', 'roof', 'inn', 'bellkeep', 'lookout']);
const HOME = new Set(['hometown', 'farewell']);
const FINAL_RE = /oboroyo|mumy|mumei|final|tsukuyomi/i;
const TOWN = { x: 205, z: -125 };
const RING8 = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)]);

export function createDirector({ G, A, sfx, setMusic, makeLoop }) {
  const S = {
    acc: 0, envAcc: 0, want: null, pending: null, pendingSince: 0, lastSwitch: -99, current: undefined,
    lastThreat: -99, bossId: null, duelId: null, flightOn: false, flightT: 0, hotUntil: -99, named: false, pageNear: false,
    beds: {}, levels: {}, env: {},
  };
  const now = () => G.time.real;
  const threat = () => { S.lastThreat = now(); };

  const on = (n, f) => G.events.on(n, (p) => { try { f(p || {}); } catch (e) { G.reportError('audio:' + n, e); } });
  on('boss:start', (p) => { S.bossId = p.id || 'boss'; threat(); kick(); });
  on('boss:defeated', () => { S.bossId = null; S.bossPhase = 0; S.lastThreat = -99; sfx('stinger_victory'); kick(); });
  on('boss:phase', (p) => { S.bossPhase = p.phase || 0; });
  on('duel:start', (p) => { S.duelId = p.id || 'duel'; threat(); kick(); });
  on('duel:end', (p) => { S.duelId = null; S.lastThreat = -99; if (p.won) sfx('stinger_quest'); kick(); });
  on('player:damaged', (p) => { if (p.from && typeof p.from === 'object') threat(); });
  on('enemy:hit', () => threat());
  on('enemy:spawned', (p) => {
    const e = p.enemy, P = G.player;
    if (e?.pos && P?.pos && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < 35) threat();
  });
  on('greatlantern:lit', () => sfx('stinger_lantern'));
  on('spell:learned', () => sfx('learn'));
  on('quest:completed', () => sfx('stinger_quest'));
  on('mode:changed', () => kick());

  function kick() { S.acc = 1; S.kicked = true; }

  function chooseMood() {
    if (A.override !== undefined) return A.override;
    const m = G.mode;
    if (m === 'ending') return 'ending';
    if (m === 'title' || m === 'boot') return 'title';
    const spar = G.story?.spar;
    if (spar?.active) return spar.memory ? 'final' : 'duel';
    if (S.bossId) return FINAL_RE.test(S.bossId) ? 'final' : 'boss';
    if (S.duelId) return FINAL_RE.test(S.duelId) ? 'final' : 'duel';
    if (G.combat?.inCombat || now() - S.lastThreat < 7) return S.named ? 'boss' : 'battle';
    const r = G.env.region, major = G.env.major || 'sun';
    if (CITY.has(r)) return 'town';
    if (S.flightOn) return 'flight';
    if (S.pageNear) return 'pages';
    if (HOME.has(r) && major !== 'night') return 'home';
    return major;
  }

  /** Foes on her (within 45 m and awake): count, a named one among them, any rallied / in a second phase. */
  function readFight() {
    const P = G.player, list = G.combat?.enemies;
    let n = 0, named = false, hot = false;
    if (P?.pos && list) {
      for (const e of list) {
        if (!e || e.dead || e.dormant || !e.aggro || !e.pos) continue;
        if (Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) > 45) continue;
        n++;
        if (e.named || e.elite) named = true;
        if (e.rallied || e.phase2) hot = true;
      }
    }
    return { n, named, hot };
  }

  /** Beside a page trial that is not finished (its page not yet read): the quiet before its seal. */
  function nearPage() {
    const P = G.player, sites = G.wilds?.pages?.sites, st = G.state?.wilds?.pages;
    if (!P?.pos || !sites) return false;
    for (const s of sites) {
      const d = s.def;
      if (!d || st?.[d.id] === 'read') continue;
      if (Math.hypot(d.x - P.pos.x, d.z - P.pos.z) < (d.arena ?? 30) + 40) return true;
    }
    return false;
  }

  function updateIntensity(mood) {
    let raw = 0;
    if (mood === 'duel' || mood === 'final') {
      const ph = G.story?.spar?.stats?.phase ?? 0;
      raw = ph >= (mood === 'final' ? 2 : 1) ? 1 : 0;
    } else if (FIGHT.has(mood)) {
      const f = readFight(), P = G.player;
      const low = P && P.maxHp > 0 && P.hp / P.maxHp < 0.35;
      raw = (f.n >= 3 ? 1 : 0) + (f.hot ? 1 : 0) + (low ? 1 : 0) + (S.bossPhase >= 2 ? 1 : 0);
    }
    const t = now();
    if (raw >= 1) S.hotUntil = t + 8;            // once hot, stay hot a while
    A.intensity = FIGHT.has(mood) && t < S.hotUntil ? 1 : 0;
  }

  function updateFlight(dt) {
    const P = G.player, W = G.world;
    let fly = false;
    if (P?.onBroom && P.pos && W?.heightAt) {
      const alt = P.pos.y - Math.max(W.heightAt(P.pos.x, P.pos.z), W.seaLevel ?? 0);
      fly = alt > 22 || (P.speed || 0) > 19;
    }
    S.flightT = fly ? Math.max(0, S.flightT) + dt : Math.min(0, S.flightT) - dt;
    if (!S.flightOn && S.flightT > 2) S.flightOn = true;
    if (S.flightOn && (S.flightT < -4 || !P?.onBroom)) S.flightOn = false;
  }

  function updateMusic(dt) {
    updateFlight(dt);
    const f = G.combat?.inCombat || now() - S.lastThreat < 7 ? readFight() : null;
    S.named = !!f?.named;
    S.pageNear = !f && nearPage();
    const want = chooseMood();
    updateIntensity(S.current && FIGHT.has(S.current) ? S.current : want);
    S.want = want;
    if (want === S.current) { S.pending = null; S.kicked = false; return; }
    const t = now();
    if (want !== S.pending) { S.pending = want; S.pendingSince = t; }
    const urgent = URGENT.has(want) || A.override !== undefined || S.kicked || S.current == null;
    const hold = urgent ? 0.3 : URGENT.has(S.current) ? 1.5 : 2.5;
    if (t - S.pendingSince < hold) return;
    // exploring ↔ exploring: keep a track at least 8 s so walking along a border does not ping-pong
    if (!urgent && !URGENT.has(S.current) && t - S.lastSwitch < 8) return;
    S.kicked = false;
    const fade = want === 'battle' || want === 'boss' || want === 'duel' || want === 'final' ? 1.2
      : S.current === 'title' ? 2.5 : URGENT.has(S.current) ? 3 : 4;
    S.current = want; S.lastSwitch = t; S.pending = null;
    setMusic(want, fade);
  }

  // ---------------------------------------------------------------- ambience
  function bed(name, level) {
    S.levels[name] = level;
    let h = S.beds[name];
    if (level > 0.01 && !h) {
      const def = AMB[name];
      h = S.beds[name] = makeLoop({ name: 'amb:' + name, ids: [def.id], synth: def.synth, vol: def.vol, bus: 'amb' }, { vol: 0, bus: 'amb', smooth: 0.9 });
      h.isBed = true; h.idleT = 0;
    }
    if (!h) return;
    h.setVol(level);
    h.idleT = level > 0.01 ? 0 : h.idleT;
  }

  function sampleEnv() {
    const W = G.world, E = G.elements, P = G.player;
    const f = G.env.focus, x = f.x, z = f.z;
    const ground = W?.heightAt ? Math.max(W.heightAt(x, z), W.seaLevel ?? 0) : 0;
    const y = Number.isFinite(f.y) && f.y !== 0 ? f.y : ground;
    const alt = Math.max(0, y - ground);
    const v = G.env.veil ?? 0;
    const region = G.env.region || '';
    // water nearby: fraction of a two-ring sample that is open water
    let wet = 0;
    if (W?.isWater) {
      for (const [cx, cz] of RING8) { if (W.isWater(x + cx * 16, z + cz * 16)) wet += 1.4; if (W.isWater(x + cx * 38, z + cz * 38)) wet += 0.6; }
      if (W.isWater(x, z)) wet += 2;
      wet = clamp(wet / 12);
    }
    const river = W?.riverDist ? 1 - smoothstep(6, 42, W.riverDist(x, z)) : 0;
    const mount = Math.max(region === 'frostpeak' || region === 'windshrine' ? 1 : 0, W?.mountainMask ? smoothstep(0.3, 0.6, W.mountainMask(x, z)) : 0, smoothstep(110, 170, y));
    const town = 1 - smoothstep(55, 95, Math.hypot(x - TOWN.x, z - TOWN.z));
    let rain = 0;
    try { rain = E?.isRainingAt?.(x, z) ? 1 : 0; } catch (e) { rain = 0; }
    let fire = 0;
    if (E) {
      if ((E.fireCount || 0) > 0 && E.isBurningAt) { let c = 0; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (E.isBurningAt(x + i * 4, z + j * 4)) c++; fire += c / 6; }
      try { const r = E.nearest?.(f, 14, (q) => q.burning); if (r) fire += 0.6; } catch (e) { /* optional */ }
      fire = clamp(fire);
    }
    const onBroom = !!P?.onBroom, speed = P ? Math.hypot(P.vel?.x || 0, P.vel?.y || 0, P.vel?.z || 0) || P.speed || 0 : 0;
    S.env = { x: Math.round(x), z: Math.round(z), alt: +alt.toFixed(1), veil: +v.toFixed(2), region, wet: +wet.toFixed(2), river: +river.toFixed(2), mount: +mount.toFixed(2), town: +town.toFixed(2), rain, fire: +fire.toFixed(2), onBroom, speed: +speed.toFixed(1) };
    return S.env;
  }

  function updateAmbience() {
    const e = sampleEnv();
    const low = 1 - smoothstep(18, 90, e.alt);                // birds / crickets fade as she climbs
    const sunW = 1 - smoothstep(0.08, 0.4, e.veil);
    const nightW = smoothstep(0.55, 0.85, e.veil);
    const duskW = Math.max(0, 1 - sunW - nightW);
    const keep = (1 - e.mount * 0.85) * (1 - e.town * 0.7) * low;
    const quiet = G.mode === 'title' ? 0.8 : 1;
    bed('meadow', sunW * keep * quiet);
    bed('dusk', duskW * keep * quiet);
    bed('night', nightW * keep * quiet);
    bed('mountain', e.mount * (0.6 + 0.4 * low));
    bed('town', e.town * low);
    bed('river', e.river * (1 - e.wet * 0.5) * low);
    bed('lake', Math.sqrt(e.wet) * (1 - e.river * 0.75) * low);
    bed('rain', e.rain);
    bed('fire', e.fire);
    const windAlt = smoothstep(20, 150, e.alt);
    bed('wind', clamp(windAlt * 0.85 + (e.onBroom ? smoothstep(8, 30, e.speed) * 0.35 : 0)));
    bed('broom', e.onBroom ? 0.12 + smoothstep(4, 30, e.speed) * 0.88 : 0);
    // drop silent beds after a while (keeps the cache warm, frees the voice)
    for (const k in S.beds) {
      const h = S.beds[k];
      if (S.levels[k] <= 0.01) { h.idleT += 0.25; if (h.idleT > 12 && h.cur < 0.002) { h.stop(0.2); delete S.beds[k]; } }
    }
  }

  return {
    kick,
    reset() { S.lastThreat = -99; S.bossId = null; S.bossPhase = 0; S.duelId = null; S.flightOn = false; S.flightT = 0; S.hotUntil = -99; A.intensity = 0; kick(); },
    update(dt) {
      S.acc += dt; S.envAcc += dt;
      if (S.acc >= 0.25) { S.acc = 0; updateMusic(0.25); }
      if (S.envAcc >= 0.25) { S.envAcc = 0; updateAmbience(); }
    },
    state() {
      const beds = [];
      for (const k in S.levels) { const h = S.beds[k]; if (S.levels[k] > 0.01 || (h && h.cur > 0.002)) beds.push({ name: k, id: AMB[k].id, target: +S.levels[k].toFixed(3), level: h ? +h.cur.toFixed(3) : 0, playing: !!h?.src }); }
      beds.sort((a, b) => b.target - a.target);
      return { want: S.want, pending: S.pending, current: S.current, beds, env: S.env, flight: S.flightOn, boss: S.bossId, duel: S.duelId, named: S.named, pageNear: S.pageNear, intensity: A.intensity };
    },
  };
}
