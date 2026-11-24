// README: the lived-in City of Magic. Elaina walks up the gate street into the market square: stalls with awnings and
// their keepers, shop signs, pigeons and cats, laundry strung between the houses, warm windows and chimney smoke. Near
// the end the player's camera tilts up the street canyon to the balconies. 6 s, the player's own camera and HUD.
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/city-life.js --ss 1 --codec h264
//   docs/images/city-life.gif = 5 s from 1 s of the take: ffmpeg fps=10, scale=520 (lanczos), palettegen max_colors=112,
//   paletteuse bayer 3, then gifsicle -O3 --lossy=40 --colors 112 (under 3.5 MB)
const X = -2160, Z = -484;
export default {
  name: 'readme-city-life',
  frames: 360,
  preroll: 90,
  seed: 27,
  capture: 'screen',
  params: 'outfit=elaina&lessons=0',
  async setup(G, T, R) {
    G.quests.debugSkipTo('mages', 'inquire'); // inside the city: ask the innkeeper
    R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.3 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.35 - 0.85) * 1440) / (2 * Math.PI) - 10000; // late afternoon, sun in the south-west
    R.place(X, Z, Math.PI, 30);
    await R.step(300);
  },
  start(G, T, R) {
    R.place(X, Z, Math.PI, 30);
    R.gameCam({ yaw: 0, pitch: -0.04, dist: 3.4 });
    R.keepFull(true);
  },
  camera: 'game',
  actions: [
    { f: -60, key: 'KeyW', down: true },
    { f: 60, lookRate: [-1.6, 0], frames: 70 },
    { f: 170, lookRate: [2.2, 0], frames: 60 },
    { f: 250, lookRate: [0, -2.2], frames: 80 },
    { f: 300, key: 'KeyW', down: false },
  ],
  onFrame(f, G, T, R) {
    if (f >= 0 && f % 60 === 0) R.log('city', f, G.player.pos.toArray().map((v) => v.toFixed(1)), G.cam.yaw.toFixed(2), G.cam.pitch.toFixed(2));
  },
};
