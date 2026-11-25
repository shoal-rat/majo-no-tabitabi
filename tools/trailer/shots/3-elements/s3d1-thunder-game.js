// Section 3, cell (d) 雷, bars 23-24. Game camera on the north shore of the night lake (the lantern town across the water).
// A pack of five shade blobs waits on the beach 22 m ahead. She charges 祈雨 (hold f 20, cast 98) and the rain soaks the pack;
// she picks 落雷 (f 170) and taps it (cast 231): the warning circle, then the bolt at f 252 (the accent) — it conducts through
// the wet pack. Frame 0 = bar 23 downbeat. Used 0-252 (cut-in s3d2 ON the bolt).
const X = 301, Z = 62, PX = 285.5, PZ = 46.5, FACE = Math.atan2(PX - X, PZ - Z);
const PACK = [[285.5, 46.5], [287.5, 48.5], [284.3, 47.6], [283.6, 44.8], [286.2, 44.9]];
export default {
  name: 's3d1-thunder-game', frames: 306, preroll: 90, seed: 31,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('water');
    R.place(X, Z, FACE);
    const w = R.spawn('blob', 320, 80, { aggro: false }); await R.step(30); if (w) G.combat.despawn(w);
  },
  start(G, T, R) {
    R.place(X, Z, FACE); R.select('water'); R.gameCam({ yaw: FACE + Math.PI + 0.25, pitch: -0.12, dist: 5.6 });
    const ft = G.fx?.textMesh; if (ft) ft.visible = false;   // floating damage numbers off (a HUD-like layer)
    PACK.forEach(([x, z], i) => R.spawn('blob', x, z, { aggro: false, hp: 900, yaw: FACE + Math.PI + i }));
  },
  camera: 'game',
  actions: [
    { f: -89, do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f)); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f, e.count || '', e.chain || '')); } },
    { f: 20, hold: 'Mouse2', frames: 58 },
    { f: 170, tap: 'Digit5' },
    { f: 223, tap: 'Mouse2' },
  ],
  onFrame(f) { window.__f = f; },
};
