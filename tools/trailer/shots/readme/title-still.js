// Title-screen background (assets/textures/journey/magic-country-title.webp, 1920x1080): Elaina banks hard right out of
// the market square of the City of Magic into the west street, flying straight at a south-western afternoon sun, so the
// light falls on her face and on the house fronts. Behind her: the tall houses, the cathedral stair, the spires and the
// sky. The title darkens the left ~40% for its name and menu, so she sits right of centre, upper-middle.
// She flies the line as a player would (W held, steered with the game camera). At frame 0 the shot freezes the world
// (G.time.scale = 0, the same zero-dt path as the pause menu) at the peak of the bank (~0.84 rad) and holds it for
// 4 frames so the shadows settle. The still is last.png of the take. Nothing in the game is changed: only the moment,
// the sun angle and the camera are chosen here.
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/title-still.js --ss 2 --ssfilter lanczos --codec h264
//   cwebp -size 175000 -pass 8 -m 6 -sharp_yuv -metadata none last.png -o assets/textures/journey/magic-country-title.webp
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** sun angle a (0.85 = dawn, ~1.57 = noon, 2.4 afternoon, 2.9 golden); playTime is 10000 in the take */
function sun(G, a) { G.state.playTime = 10000; G.state.flags.journey_sun_offset = ((a - 0.85) * 1440) / (2 * Math.PI) - 10000; }
/** aim the game camera at the next waypoint [x, y, z] (yaw = heading, pitch + C/Space = climb), as a player steers */
function steer(G, T, S, wp, gain) {
  const P = G.player, p = P.pos;
  while (S.i < wp.length - 1) {
    const a = wp[S.i], b = wp[S.i + 1];
    const passed = (b[0] - a[0]) * (p.x - a[0]) + (b[2] - a[2]) * (p.z - a[2]) > 0;
    if (Math.hypot(a[0] - p.x, a[2] - p.z) < 5 || passed) S.i++; else break;
  }
  const t = wp[S.i], dx = t[0] - p.x, dz = t[2] - p.z;
  G.cam.yaw = Math.atan2(dx, dz) - Math.PI;
  const sp = Math.max(6, Math.abs(P.broom?.speed || 15)), hd = Math.max(6, Math.hypot(dx, dz));
  let need = clamp(((t[1] - p.y) / hd) * sp * gain, -24, 12), down = false, up = false;
  if (need < -Math.sin(1) * sp * 0.6) { down = true; need += 9; } else if (need > Math.sin(0.8) * sp * 0.6) { up = true; need -= 9; }
  G.cam.pitch = Math.asin(clamp(need / (sp * 0.6), -0.84, 0.71)) - 0.2;
  T.key('KeyC', down); T.key('Space', up);
}
// the line: south from the cathedral stair foot, past the fountain, then hard right into the west street (BELL_ROADS[1])
const WP = [[-2162, 40, -540], [-2158, 39, -522], [-2157, 38, -510], [-2163, 38, -502], [-2180, 39, -503], [-2205, 40, -504], [-2237, 41, -505], [-2290, 42, -490]];
const PRE = 324; // frames flown before the freeze: she is mid-turn, heading south-west, straight at the sun
const SUN = 2.1; // sun angle: south-west, ~33 degrees up, so it reaches her face and the upper house fronts
// camera around her, measured from her flight direction: az (deg, minus = her left), el (deg), d (m) from her chest;
// sx, sy = where she sits in the frame (NDC offsets of the aim point)
const POSE = { az: -40, el: -10, d: 3.9, fov: 40, sx: 0.54, sy: 0.1 };
export default {
  name: 'readme-title-still',
  frames: 4,
  preroll: PRE,
  seed: 42,
  params: 'outfit=elaina',
  async setup(G, T, R) {
    R.hud(false); R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.25 });
    G.quests.debugSkipTo('mages', 'inquire'); // inside the city: episode two's day
    sun(G, SUN);
    R.place(-2163, -575, 0, 41);
    T.key('KeyF', true); await R.step(2); T.key('KeyF', false); await R.step(20); // mount the broom as a player does
    await R.step(220);
  },
  start(G, T, R) {
    R.place(-2163, -572, 0, 41);
    if (!G.player.onBroom && !G.player.mountBroom()) throw new Error('could not mount');
    R.gameCam({ yaw: Math.PI, pitch: -0.2 });
    R.keepFull(true);
    window.__title = { i: 0 };
  },
  camera(f, G) {
    const V = G.THREE.Vector3, P = G.player, p = POSE;
    const v = P.vel, hd = Math.hypot(v.x, v.z) > 3 ? new V(v.x, 0, v.z).normalize() : new V(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    const right = new V(-hd.z, 0, hd.x), az = (p.az * Math.PI) / 180, el = (p.el * Math.PI) / 180;
    const chest = P.pos.clone(); chest.y += 0.9;
    const pos = chest.clone().addScaledVector(hd, Math.cos(el) * Math.cos(az) * p.d).addScaledVector(right, Math.cos(el) * Math.sin(az) * p.d);
    pos.y += Math.sin(el) * p.d;
    G.world.resolveCollisions?.(pos, 0.7, 0.8); // never inside a house front
    const ty = Math.tan((p.fov * Math.PI) / 360), tx = (ty * 16) / 9;
    const fw = chest.clone().sub(pos).normalize(), rc = fw.clone().cross(new V(0, 1, 0)).normalize(), uc = rc.clone().cross(fw).normalize();
    const look = pos.clone().add(fw.addScaledVector(rc, -p.sx * tx).addScaledVector(uc, -p.sy * ty).normalize().multiplyScalar(10));
    return { pos, look, fov: p.fov, roll: -(P.broom?.bank || 0) * 0.12 };
  },
  actions: [{ f: -PRE, key: 'KeyW', down: true }],
  onFrame(f, G, T, R) {
    const P = G.player, p = P.pos;
    if (f < 0) { steer(G, T, window.__title, WP, 1.5); return; }
    if (f === 0) {
      G.time.scale = 0; // freeze the world at the peak of the bank
      sun(G, SUN); G.journeyWeather?.update?.(30); // and snap the sun to its exact angle
      R.log('frozen', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2), 'bank', (P.broom?.bank || 0).toFixed(3));
    }
  },
};
