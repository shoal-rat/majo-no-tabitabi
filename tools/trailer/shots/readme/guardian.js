// README: the page trial in the candle glade 「烛林空地」. The seal is open and the fire guardian wakes; its first move is a
// beam. Elaina raises her guard into it and mashes {attack}: the beams lock (对波) and she drives it back into the
// guardian. Recorded long (10 s from the wake); the README GIF is the clash cut from it. The player's camera and HUD.
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/guardian.js --ss 1 --codec h264
//   docs/images/guardian-clash.gif = 4.6 s from 4.8 s of the take: ffmpeg fps=10, scale=520 (lanczos), palettegen max_colors=112,
//   paletteuse bayer 3, then gifsicle -O3 --lossy=30 --colors 112 (under 3.5 MB)
const SITE = 'pg_fire';
export default {
  name: 'readme-guardian',
  frames: 600,
  preroll: 30,
  seed: 31,
  capture: 'screen',
  params: 'outfit=elaina&lessons=0',
  async setup(G, T, R) {
    G.quests.debugSkipTo('mages', 'gate');
    R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.3 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.3 - 0.85) * 1440) / (2 * Math.PI) - 10000;
    G.state.flags.majo_named = true;
    G.state.spells = { wind: 1, water: 1, fire: 1, ice: 1, earth: 1, thunder: 1 };
    G.state.abilities = { ...G.state.abilities, guard: true };
    R.select('water');
    const s = G.wilds.pages.get(SITE);
    const dx = Math.sin(s.def.face), dz = Math.cos(s.def.face);
    window.__pg = { x: s.center.x + dx * 9, z: s.center.z + dz * 9, yaw: s.def.face + Math.PI, c: s.center };
    R.place(window.__pg.x, window.__pg.z, window.__pg.yaw);
    await R.step(240);
  },
  start(G, T, R) {
    const A = window.__pg;
    R.place(A.x, A.z, A.yaw);
    R.gameCam({ yaw: A.yaw + Math.PI, pitch: -0.08 });
    R.keepFull(true);
    G.state.wilds.pages[SITE] = 'open'; // the seal answered: the guardian wakes while she stands in its arena
    window.__pgLog = [];
    for (const ev of ['beam:guard', 'beam:struggle']) G.events.on(ev, (e) => window.__pgLog.push(window.__pgF + ' ' + ev + ' ' + (e?.state || '') + ' ' + (e?.winner || '')));
  },
  camera: 'game',
  onFrame(f, G, T, R) {
    window.__pgF = f;
    const P = G.player, A = window.__pg, g = G.wilds.pages.guardian(SITE);
    const S = (window.__pgK ||= { down: new Set() });
    const key = (k, on) => { if (on && !S.down.has(k)) { S.down.add(k); T.key(k, true); } else if (!on && S.down.has(k)) { S.down.delete(k); T.key(k, false); } };
    if (g && !g.dead) { G.cam.yaw = Math.atan2(P.pos.x - g.pos.x, P.pos.z - g.pos.z); G.cam.pitch = -0.1; }
    const beam = (G.spells.beams || []).find((b) => b.team === 'enemy' && b.alive);
    const bolts = (G.spells.projectiles || []).filter((o) => o.alive && o.team === 'enemy');
    const close = Math.min(99, ...bolts.map((o) => o.pos.distanceTo(P.pos)));
    const struggling = !!G.spells.struggle;
    key('KeyR', !!beam || struggling || close < 2.4);
    key('Mouse0', struggling && f % 6 < 3);
    if (f >= 0 && f % 30 === 0) R.log('pg', f, g ? (g.dead ? 'dead' : 'hp ' + Math.round(g.hp)) : 'none', 'beam', !!beam, 'str', struggling, JSON.stringify(window.__pgLog));
  },
};
