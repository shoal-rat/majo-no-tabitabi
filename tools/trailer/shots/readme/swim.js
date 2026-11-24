// README: Elaina skims Starscar Lake on her broom, holds {descend} at the surface and dives straight in from the broom,
// comes up and swims fast toward the windmill island (fast swimming costs stamina: the petal ring by her shoulder).
// 6 s, follow rig behind and to the side; the HUD as the player sees it.
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/swim.js --ss 1 --codec h264
//   docs/images/swim.gif = 5.5 s from 0.3 s of the take: ffmpeg fps=10, scale=520 (lanczos), palettegen max_colors=112,
//   paletteuse bayer 3, then gifsicle -O3 --lossy=60 --colors 112 (under 3.5 MB)
const X = 1690, Z = -205, YAW = 0.69; // over the lake's north shore, heading for the windmill island (1818, -77)
export default {
  name: 'readme-swim',
  frames: 360,
  preroll: 90,
  seed: 14,
  capture: 'screen',
  params: 'outfit=elaina&lessons=0',
  async setup(G, T, R) {
    G.quests.debugSkipTo('mages', 'gate');
    G.world.setTrialLake(true);
    R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.25 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.05 - 0.85) * 1440) / (2 * Math.PI) - 10000;
    R.place(X, Z, YAW);
    await R.step(200);
  },
  start(G, T, R) {
    R.place(X, Z, YAW, G.world.heightAt(X, Z) + 3.5);
    if (!G.player.onBroom && !G.player.mountBroom()) throw new Error('could not mount');
    R.gameCam({ yaw: YAW + Math.PI, pitch: -0.25 });
    R.keepFull(true);
  },
  camera: {
    follow: 'behind', smooth: 0.18, ease: 'inOut',
    keys: [
      { f: 0, dist: 6.0, height: 1.6, lookHeight: 0.6, yaw: 0.35, fov: 55 },
      { f: 140, dist: 5.2, height: 1.4, lookHeight: 0.2, yaw: 0.5, fov: 52 },
      { f: 359, dist: 4.6, height: 1.5, lookHeight: 0.1, yaw: 0.75, fov: 50 },
    ],
    shake: { pos: 0.02, look: 0.03, speed: 0.6 },
  },
  actions: [
    { f: -90, key: 'KeyW', down: true },
    { f: -60, key: 'ShiftLeft', down: true },
    { f: 20, key: 'KeyC', down: true },
    { f: 110, key: 'KeyC', down: false },
    { f: 359, key: 'ShiftLeft', down: false },
    { f: 359, key: 'KeyW', down: false },
  ],
  onFrame(f, G, T, R) {
    const P = G.player;
    if (P.onBroom) G.cam.pitch = -0.25;
    if (f >= -30 && f % 20 === 0) R.log('swim', f, P.state, P.onBroom, P.pos.y.toFixed(2), G.world.isWater(P.pos.x, P.pos.z));
  },
};
