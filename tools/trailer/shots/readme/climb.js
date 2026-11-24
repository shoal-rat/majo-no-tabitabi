// README: Elaina climbs a tall boulder on the hills north of Fran's forest. She takes hold as she walks into it, climbs
// hand over hand, leaps up the rock twice (each leap costs stamina: the petal ring by her shoulder
// empties) and pulls herself over the top. 5.5 s, a three-quarter follow camera that rises with her; the HUD as the
// player sees it.
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/climb.js --ss 1 --codec h264
//   docs/images/climb.gif = 5 s from 0.25 s of the take: ffmpeg fps=10, scale=520 (lanczos), palettegen max_colors=112,
//   paletteuse bayer 3, then gifsicle -O3 --lossy=40 --colors 112 (under 3.5 MB)
const X = 1986, Z = -592.2, YAW = Math.PI; // south of the boulder (1986, -597; r 2.4 m, 8.5 m tall); she faces north
export default {
  name: 'readme-climb',
  frames: 330,
  preroll: 60,
  seed: 5,
  capture: 'screen',
  params: 'outfit=elaina&lessons=0',
  async setup(G, T, R) {
    G.quests.debugSkipTo('mages', 'gate');
    R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.3 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.0 - 0.85) * 1440) / (2 * Math.PI) - 10000;
    R.place(X, Z, YAW);
    await R.step(200);
  },
  start(G, T, R) {
    R.place(X, Z, YAW);
    R.gameCam({ yaw: YAW + Math.PI, pitch: -0.1 });
  },
  camera: {
    follow: 'behind', smooth: 0.25, ease: 'inOut',
    keys: [
      { f: 0, dist: 7.0, height: 0.2, lookHeight: 2.6, yaw: 0.45, fov: 54 },
      { f: 329, dist: 7.5, height: 1.8, lookHeight: 0.8, yaw: 0.6, fov: 56 },
    ],
    shake: { pos: 0.02, look: 0.03, speed: 0.6 },
  },
  actions: [
    { f: -20, key: 'KeyW', down: true },
    { f: 329, key: 'KeyW', down: false },
  ],
  onFrame(f, G, T, R) {
    const P = G.player;
    const S = (window.__cl ||= { y0: null, climbT: 0, jumps: 0, up: 0, done: false });
    if (S.y0 == null && f >= 0) S.y0 = P.pos.y;
    if (S.up) { if (++S.up > 3) { T.key('Space', false); S.up = 0; } }
    if (P.state === 'climb') {
      S.climbT++;
      // two leaps up the rock once she is on it (each costs stamina)
      if (!S.up && S.jumps < 2 && S.climbT > 40 + S.jumps * 70) { T.key('Space', true); S.up = 1; S.jumps++; }
    }
    if (!S.done && S.y0 != null && P.state !== 'climb' && P.grounded && P.pos.y > S.y0 + 4) { S.done = true; T.key('KeyW', false); } // on the top: stop there
    if (f >= -20 && f % 30 === 0) R.log('climb', f, P.state, P.pos.y.toFixed(1), (P.stamina?.value ?? P.stamina ?? '?'));
  },
};
