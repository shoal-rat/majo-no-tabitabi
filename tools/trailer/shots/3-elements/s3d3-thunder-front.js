// s3d3: cut-in for cell (d), used cell 180-252 (+18 handle): close front three-quarter as she taps 落雷 (cast 231).
// Section 3, cell (d) 雷, bars 23-24. Game camera on the north shore of the night lake (the lantern town across the water).
// A pack of five shade blobs waits on the beach 22 m ahead. She charges 祈雨 (hold f 20, cast 98) and the rain soaks the pack;
// she picks 落雷 (f 170) and taps it (cast 231): the warning circle, then the bolt at f 252 (the accent) — it conducts through
// the wet pack. Frame 0 = bar 23 downbeat. Used 0-252 (cut-in s3d2 ON the bolt).
const X = 301, Z = 62, PX = 285.5, PZ = 46.5, FACE = Math.atan2(PX - X, PZ - Z);
const PACK = [[285.5, 46.5], [287.5, 48.5], [284.3, 47.6], [283.6, 44.8], [286.2, 44.9]];
const START = 180;
export default {
  name: 's3d3-thunder-front', frames: 90, preroll: 90 + START, seed: 31,
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.life(false); R.weather('clear'); R.freezeFidgets();
    R.spells('all'); R.keepFull(true); R.select('water');
    R.place(X, Z, FACE);
    { const ps = G.systems.find(s => s.name === 'player'), lu = ps.lateUpdate; ps.lateUpdate = function (...a) { const fc = G.debug.fixedCam, c = G.camera; if (!fc || !fc.view) return lu.apply(this, a); const p = c.position.clone(), q = c.quaternion.clone(); c.position.copy(fc.gp); c.quaternion.copy(fc.gq); c.updateMatrixWorld(); try { return lu.apply(this, a); } finally { c.position.copy(p); c.quaternion.copy(q); c.updateMatrixWorld(); } }; }   // aim with the player's camera, not the shot camera (game fault, see PROGRESS)
    const w = R.spawn('blob', 320, 80, { aggro: false }); await R.step(30); if (w) G.combat.despawn(w);
  },
  start(G, T, R) {
    R.place(X, Z, FACE); R.select('water'); R.gameCam({ yaw: FACE + Math.PI + 0.25, pitch: -0.12, dist: 5.6 });
    const ft = G.fx?.textMesh; if (ft) ft.visible = false;   // floating damage numbers off (a HUD-like layer)
    PACK.forEach(([x, z], i) => R.spawn('blob', x, z, { aggro: false, hp: 900, yaw: FACE + Math.PI + i }));
  },
  camera: (f, G, R) => {   // close front three-quarter on her casting
    const cf = f + START; if (cf < 180) return null;
    const P = G.player.pos, h = G.world.heightAt(P.x, P.z), F = FACE, fx = Math.sin(F), fz = Math.cos(F), rx = -fz, rz = fx;
    const t = Math.min(1, (cf - 180) / 100), e = t * (2 - t), d = 2.8 - 0.3 * e;
    return { pos: [P.x + fx * d + rx * 1.6, h + 1.0 + 0.08 * e, P.z + fz * d + rz * 1.6], look: [P.x + fx * 0.2, h + 1.3, P.z + fz * 0.2], fov: 40 };
  },
  actions: [
    { f: -269, do: (G, T, R) => { G.events.on('spell:cast', e => R.log('CAST', e.spell, e.form, window.__f)); G.events.on('element:reaction', e => R.log('REACT', e.type, window.__f, e.count || '', e.chain || '')); } },
    { f: -160, hold: 'Mouse2', frames: 58 },
    { f: -10, tap: 'Digit5' },
    { f: 43, tap: 'Mouse2' },
  ],
  onFrame(f) { window.__f = f + START; },
};
