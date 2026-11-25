// Section 3, cell (d) cut-in ON the accent: cell frames 252-306. Same play as s3d1 (offset S; earlier frames in the preroll with
// the game camera, see the terrain fault note in s3a2). A low camera on the beach just behind the pack as the bolt lands and the
// arcs run through the soaked shades, the lake and the lantern town behind them.
const X = 301, Z = 62, PX = 285.5, PZ = 46.5, FACE = Math.atan2(PX - X, PZ - Z);
const PACK = [[285.5, 46.5], [287.5, 48.5], [284.3, 47.6], [283.6, 44.8], [286.2, 44.9]];
const S = -252;
export default {
  name: 's3d2-thunder-cut', frames: 54, preroll: 90 - S, seed: 31,
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
  camera: (f, G, R) => {
    if (f < 0) return null;
    const h = G.world.groundAt(291, 55.5), t = Math.min(1, f / 54), e = t * (2 - t);
    return { pos: [291.2 - 0.9 * e, h + 1.5 - 0.1 * e, 55.8 - 1.0 * e], look: [285.4, h + 0.4, 46.4], fov: 44 - 3 * e };
  },
  actions: [
    { f: S + -89, do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f)); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f, e.count || '', e.chain || '')); } },
    { f: S + 20, hold: 'Mouse2', frames: 58 },
    { f: S + 170, tap: 'Digit5' },
    { f: S + 223, tap: 'Mouse2' },
  ],
  onFrame(f) { window.__f = f; },
};
