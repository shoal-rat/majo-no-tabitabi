// README: Elaina boosts low over the flower drifts on the northern shore of Starscar Lake. The broom presses a swath
// into the meadow that slowly stands back up, petals and grass blades lift behind her, and the gold light trails only
// while she boosts. 6 s, follow rig behind and above so both sides of the swath show; the HUD as the player sees it.
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/broom-wake.js --ss 1 --codec h264
//   docs/images/broom-wake.gif = 5 s from 0.5 s of the take: ffmpeg fps=10, scale=520 (lanczos), palettegen max_colors=112,
//   paletteuse bayer 3, then gifsicle -O3 --lossy=70 --colors 112 (under 3.5 MB)
export default {
  name: 'readme-broom-wake',
  frames: 360,
  preroll: 90,
  seed: 3081,
  capture: 'screen',
  params: 'outfit=elaina&lessons=0',
  async setup(G, T, R) {
    G.quests.debugSkipTo('mages', 'gate'); // episode two (nothing is saved in a rig run)
    G.world.setTrialLake(true);
    R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.22 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.2 - 0.85) * 1440) / (2 * Math.PI) - 10000; // afternoon sun behind her right shoulder
    R.place(1854, -312, -0.61);
    await R.step(200);
  },
  start(G, T, R) {
    R.place(1854, -312, -0.61, G.world.heightAt(1854, -312) + 4);
    if (!G.player.onBroom && !G.player.mountBroom()) throw new Error('could not mount');
    R.gameCam({ yaw: Math.PI - 0.61, pitch: -0.4 });
    R.keepFull(true);
  },
  camera: { follow: 'behind', dist: 6.4, height: 3.1, lookHeight: 0.5, yaw: 0.18, fov: 58, smooth: 0.1 },
  actions: [
    { f: -90, key: 'KeyW', down: true },
    { f: -40, key: 'KeyC', down: true },
    { f: -10, key: 'ShiftLeft', down: true },
    { f: 70, lookRate: [4, 0], frames: 35 },
    { f: 150, lookRate: [-4.5, 0], frames: 40 },
    { f: 250, lookRate: [3, 0], frames: 40 },
    { f: 359, key: 'ShiftLeft', down: false },
    { f: 359, key: 'KeyC', down: false },
    { f: 359, key: 'KeyW', down: false },
  ],
  onFrame(f, G, T, R) {
    if (f >= 0 && f % 60 === 0) {
      const p = G.player;
      R.log('wake', f, p.onBroom, ...p.pos.toArray().map((n) => n.toFixed(1)), p.speed?.toFixed?.(1), G.world.isWater(p.pos.x, p.pos.z) ? 'water' : 'land');
    }
  },
};
