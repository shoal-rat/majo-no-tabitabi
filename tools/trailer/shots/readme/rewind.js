// README: the back-light 「溯光」. A tree on the eastern meadows lies felled, its trunk cut into logs. Elaina lights
// the back-light (a silver-blue ring of tick marks turns the wrong way round the stump), and the tree's history runs
// backwards: the logs fly back into the trunk and the tree swings up until it stands again. 5 s, a three-quarter camera
// behind her; the HUD as the player sees it.
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/rewind.js --ss 1 --codec h264
//   docs/images/rewind.gif = 4.8 s from 0.2 s of the take: ffmpeg fps=10, scale=520 (lanczos), palettegen max_colors=112,
//   paletteuse bayer 3, then gifsicle -O3 --lossy=40 --colors 112 (under 3.5 MB)
const AREAS = [[2030, -95], [1400, -60], [1180, -220], [900, -150]]; // where to look for a tree, in order
const STAND = 9.5;          // her distance from the stump
const FALL = [0.8, 0.6];    // the tree lies across her view (she looks along (0.6, -0.8))
export default {
  name: 'readme-rewind',
  frames: 300,
  preroll: 60,
  seed: 9,
  capture: 'screen',
  params: 'outfit=elaina&lessons=0',
  async setup(G, T, R) {
    G.quests.debugSkipTo('mages', 'inquire'); // past the roof tiles: the back-light is hers
    R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.28 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.1 - 0.85) * 1440) / (2 * Math.PI) - 10000;
    G.craft.learn('thread', { silent: true }); G.craft.learn('rewind', { silent: true });
    const V = G.THREE.Vector3;
    for (const [ax, az] of AREAS) {
      R.place(ax, az, 0);
      await R.settle({ min: 10, max: 600 });
      const trees = (G.flora.treesNear(new V(ax, 0, az), 70) || []).filter((t) => t.height > 7 && t.height < 13);
      for (const t of trees) {
        // open ground on its south-west side (where she stands) and nothing in the line of its fall
        const sx = t.pos.x - 0.6 * STAND, sz = t.pos.z + 0.8 * STAND;
        const crowd = G.flora.treesNear(new V(sx, 0, sz), 5).length + G.flora.treesNear(t.pos, 7).length - 1
          + G.flora.treesNear(new V(t.pos.x + FALL[0] * 6, 0, t.pos.z + FALL[1] * 6), 4).length
          + G.flora.treesNear(new V((t.pos.x + sx) / 2, 0, (t.pos.z + sz) / 2), 4).length;
        if (crowd || G.world.isWater(sx, sz) || Math.abs(G.world.heightAt(sx, sz) - t.pos.y) > 1.5) continue;
        G.flora.fell(t, new V(FALL[0], 0, FALL[1]));
        if (!G.flora.wreck.near(t.pos.x, t.pos.z, 1.5).length) continue; // a guarded story place: it would not stay felled
        window.__rw = { x: t.pos.x, y: t.pos.y, z: t.pos.z, h: t.height };
        R.log('tree', t.key, t.pos.toArray().map((v) => v.toFixed(1)), t.height.toFixed(1), 'area', ax, az);
        break;
      }
      if (window.__rw) break;
    }
    if (!window.__rw) throw new Error('no tree found');
    const w = window.__rw;
    R.place(w.x - 0.6 * STAND, w.z + 0.8 * STAND, Math.atan2(0.6, -0.8));
    await R.step(300);
    R.log('logs', JSON.stringify(G.flora.wreck.near(w.x, w.z, 2).map((i) => G.flora.wreck.logsOf?.(i)?.length)));
  },
  start(G, T, R) {
    const w = window.__rw;
    R.place(w.x - 0.6 * STAND, w.z + 0.8 * STAND, Math.atan2(0.6, -0.8));
    R.gameCam({ yaw: Math.atan2(0.6, -0.8) + Math.PI, pitch: -0.12 });
    R.keepFull(true);
  },
  camera(f, G) {
    const P = G.player, w = window.__rw, V = G.THREE.Vector3;
    const d = new V(w.x - P.pos.x, 0, w.z - P.pos.z).normalize(), r = new V(-d.z, 0, d.x);
    const k = f / 299;
    return {
      pos: new V().copy(P.pos).addScaledVector(d, -(6.4 + 0.5 * k)).addScaledVector(r, 1.5 - 0.2 * k).setY(P.pos.y + 1.9 + 0.2 * k),
      look: new V(w.x + FALL[0] * 1.2, w.y + 2.6, w.z + FALL[1] * 1.2).lerp(new V(P.pos.x, P.pos.y + 1.0, P.pos.z), 0.3),
      fov: 50 - 2 * k,
    };
  },
  actions: [
    { f: 25, tap: 'KeyG' },
    { f: 80, tap: 'Mouse0' },
  ],
  onFrame(f, G, T, R) {
    const P = G.player, w = window.__rw, A = P.aim;
    if (!w) return;
    // aim at the stump, as a player looking at it would
    G.cam.yaw = Math.atan2(w.x - P.pos.x, w.z - P.pos.z) - Math.PI;
    G.cam.pitch = -0.14;
    if (A) {
      A.origin.set(P.pos.x, P.pos.y + 1.3, P.pos.z);
      A.point.set(w.x, w.y + 0.6, w.z);
      A.dir.subVectors(A.point, A.origin); A.dist = A.dir.length(); A.dir.normalize();
    }
    if (f >= 0 && f % 30 === 0) R.log('rw', f, JSON.stringify(G.craft.rewind?.stats?.() || {}).slice(0, 160));
  },
};
