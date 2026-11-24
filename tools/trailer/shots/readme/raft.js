// README: the star thread 「牵星线」 and star knots 「结星」. On the north shore of Starscar Lake a three-log raft with a
// small sail floats by the bank, and a loose log drifts to its left. Elaina catches the log with the gold thread, swings
// it up and across and lays it against the raft: star knots glint where the logs touch and tie it on. Then she puts the
// thread away and blows two gusts into the sail, and the raft sails off. 6.5 s, a camera behind and above her; the HUD
// as the player sees it.
//   node tools/trailer/capture.mjs --shot tools/trailer/shots/readme/raft.js --ss 1 --codec h264
//   docs/images/raft.gif = 6 s from 0.3 s of the take: ffmpeg fps=10, scale=520 (lanczos), palettegen max_colors=112,
//   paletteuse bayer 3, then gifsicle -O3 --lossy=60 --colors 112 (under 3.5 MB)
const SWING = 0.4;   // the raft sits this far (rad) right of straight out from the bank; the loose log as far left
const RAD = 6.2;     // her distance to the slot beside the raft and to the shore log
const GRAB = 24, LET_GO = 168;                // catch at GRAB; let go once the knots show (from ~LET_GO)
const PUT_AWAY = 18, GUST1 = 44, GUST2 = 92;  // frames after letting go: the thread away, then two gusts into the sail
export default {
  name: 'readme-raft',
  frames: 420,
  preroll: 60,
  seed: 17,
  capture: 'screen',
  params: 'outfit=elaina&lessons=0',
  async setup(G, T, R) {
    G.quests.debugSkipTo('mages', 'gate');
    G.world.setTrialLake(true);
    R.wildlife(false); R.clearCombat(); R.weather({ rain: 0, cloud: 0.25 });
    G.state.playTime = 10000;
    G.state.flags.journey_sun_offset = ((2.05 - 0.85) * 1440) / (2 * Math.PI) - 10000;
    G.craft.learn('thread', { silent: true });
    R.spells(['wind'], 1); R.select('wind');
    const W = G.world, V = G.THREE.Vector3;
    // her spot: the waterline north-north-west of the lake centre
    const out = new V(1690 - 1725, 0, -205 + 48).normalize();
    let S = null;
    for (let r = 0; r < 300; r += 0.5) { const x = 1725 + out.x * r, z = -48 + out.z * r; if (!W.isWater(x, z)) { S = new V(x + out.x * 2.6, 0, z + out.z * 2.6); break; } }
    R.place(S.x, S.z, Math.atan2(-out.x, -out.z));
    await R.settle({ min: 10, max: 600 });
    S.y = W.groundAt(S.x, S.z, 50);
    const rot = (v, a) => new V(v.x * Math.cos(a) + v.z * Math.sin(a), 0, -v.x * Math.sin(a) + v.z * Math.cos(a));
    const u = out.clone().negate();                 // toward the lake
    const t = rot(u, -SWING).normalize();          // toward the raft (to her right)
    const n = new V(-t.z, 0, t.x);                 // along the logs (tangential)
    const yawN = Math.atan2(n.x, n.z);
    const sp = 0.56;                               // log spacing (diameter ~0.5 m)
    const C = S.clone().addScaledVector(t, RAD + sp * 1.5); // raft centre: the slot is one log nearer than the first log
    const logs = [0, 1, 2].map((k) => G.props.spawn('log', new V(C.x + t.x * (k - 1) * sp, W.seaLevel + 0.05, C.z + t.z * (k - 1) * sp), { rot: yawN, persistent: true }));
    const sail = G.props.spawn('sail', new V(C.x, W.seaLevel + 0.42, C.z), { rot: Math.atan2(t.x, t.z), persistent: true });
    G.craft.tie(logs[0].body, logs[1].body); G.craft.tie(logs[1].body, logs[2].body); G.craft.tie(logs[1].body, sail.body);
    G.craft.tie(logs[0].body, sail.body); G.craft.tie(logs[2].body, sail.body);
    // the loose log: floating as far out to her left as the slot is to her right, lying tangentially
    const dL = rot(u, SWING + 0.15), L0 = new V(S.x + dL.x * (RAD - 0.25), W.seaLevel + 0.05, S.z + dL.z * (RAD - 0.25)), yawL = Math.atan2(-dL.z, dL.x);
    if (!W.isWater(L0.x, L0.z)) throw new Error('the loose log would be on land');
    const shoreLog = G.props.spawn('log', L0, { rot: yawL, persistent: true });
    G.props.spawn('log_short', new V(S.x + dL.x * 3.2 - u.x * 1.2, W.groundAt(S.x + dL.x * 3.2 - u.x * 1.2, S.z + dL.z * 3.2 - u.z * 1.2, 50) + 0.3, S.z + dL.z * 3.2 - u.z * 1.2), { rot: yawL + 0.4 });
    window.__raft = { S, t, u, C, logs: logs.map((p) => p.body), sail: sail.body, shore: shoreLog.body, slot: null };
    R.log('raft', 'S', S.toArray().map((v) => v.toFixed(1)), 'L0', L0.toArray().map((v) => v.toFixed(1)));
    await R.step(240);
    R.log('after settle', window.__raft.logs.map((b) => b.pos.toArray().map((v) => v.toFixed(2)).join(',')).join(' | '), 'sail', window.__raft.sail.pos.toArray().map((v) => v.toFixed(2)));
  },
  start(G, T, R) {
    const A = window.__raft;
    R.place(A.S.x, A.S.z, Math.atan2(A.u.x, A.u.z));
    R.gameCam({ yaw: Math.atan2(A.u.x, A.u.z) + Math.PI, pitch: -0.12 });
    R.keepFull(true);
  },
  camera(f, G) {
    const A = window.__raft, P = G.player, V = G.THREE.Vector3;
    const raft = A.logs[1].pos, k = Math.min(1, Math.max(0, (f - 190) / 200)), e = k * k * (3 - 2 * k);
    const l = new V(A.u.z, 0, -A.u.x); // her left
    const ahead = new V().copy(A.S).addScaledVector(A.u, 5.6).setY(0.6);
    return {
      pos: new V().copy(A.S).addScaledVector(A.u, -3.6 + 1.0 * e).addScaledVector(l, 0.8 - 1.2 * e).setY(A.S.y + 2.8 - 0.3 * e),
      look: ahead.lerp(raft, 0.7 * e),
      fov: 48,
    };
  },
  actions: [
    { f: -30, tap: 'KeyZ' },              // the thread out
    { f: GRAB, tap: 'Mouse0' },           // catch the shore log
  ],
  onFrame(f, G, T, R) {
    const A = window.__raft, P = G.player, V = G.THREE.Vector3;
    if (!A) return;
    const hand = P.rig?.bones?.handR ? P.rig.bones.handR.getWorldPosition(new V()) : new V(P.pos.x, P.pos.y + 1.3, P.pos.z);
    // the raft rides at anchor until the new log is tied on (the sail would otherwise sail it off before she gets there)
    if (!A.let) for (const b of [...A.logs, A.sail]) if (b.alive !== false && b.vel) b.setVelocity?.(new V(0, b.vel.y, 0));
    // after the swing, if the knots do not show yet, she steps toward the raft with the log until they do
    const swung = f >= GRAB + 4 + 120;
    if (!A.let && G.craft.mode === 'hold' && swung && !((G.craft.stats?.().preview || 0) > 0)) { if (!A.walk) { T.key('KeyW', true); A.walk = 1; } }
    else if (A.walk) { T.key('KeyW', false); A.walk = 0; }
    // let go against the raft once the knots show (the magnet closes the last gap and ties them): {attack}, by hand
    if (A.press && ++A.press > 3) { T.key('Mouse0', false); A.press = 0; }
    const tap = (k) => { T.key(k, true); (A.up ||= []).push([k, f + 2]); };
    for (const u of A.up || []) if (u[1] === f) T.key(u[0], false);
    if (A.let) { const t = f - A.let; if (t === PUT_AWAY) tap('KeyZ'); if (t === GUST1 || t === GUST2) tap('Mouse2'); }
    if (!A.let && G.craft.mode === 'hold' && f >= GRAB + 4 + 110 && ((G.craft.stats?.().preview || 0) > 0 || f >= LET_GO + 30)) { T.key('Mouse0', true); A.press = 1; A.let = f; R.log('let go at', f, 'preview', G.craft.stats?.().preview); }
    let target;
    if (f < GRAB + 4) {
      target = A.shore.pos.clone();
    }
    else if (!A.let || f < A.let + 2) {
      // the slot: beside the near raft log, on the side toward her; an arc out over the water, lifted in the middle
      const near = A.logs[0].pos, dir = new V(near.x - A.logs[1].pos.x, 0, near.z - A.logs[1].pos.z).normalize();
      const slot = near.clone().addScaledVector(dir, 0.53); slot.y = Math.max(near.y, G.world.seaLevel + 0.2);
      A.slot = slot;
      const k = Math.min(1, (f - GRAB - 4) / 120), e = k * k * (3 - 2 * k);
      const a0 = Math.atan2(A.shore.pos.x - P.pos.x, A.shore.pos.z - P.pos.z), a1 = Math.atan2(slot.x - P.pos.x, slot.z - P.pos.z);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const r0 = Math.hypot(A.shore.pos.x - P.pos.x, A.shore.pos.z - P.pos.z), r1 = Math.hypot(slot.x - P.pos.x, slot.z - P.pos.z);
      const a = a0 + da * e, r = r0 + (r1 - r0) * e;
      target = new V(P.pos.x + Math.sin(a) * r, (1 - e) * A.shore.pos.y + e * slot.y + Math.sin(Math.PI * e) * 1.8, P.pos.z + Math.cos(a) * r);
    } else {
      target = A.sail.pos.clone().setY(A.sail.pos.y + 1.0);
    }
    const d = target.clone().sub(hand);
    const h = Math.hypot(d.x, d.z);
    G.cam.yaw = Math.atan2(d.x, d.z) - Math.PI;
    G.cam.pitch = Math.atan2(d.y, h);
    // her aim, as a player pointing at it would have it. The game works the aim out from whichever camera draws the frame
    // (here the rig's view camera behind her), so the shot sets it before the frame, as fire-tornado.js does.
    const AM = P.aim;
    if (AM) {
      AM.origin.copy(hand); AM.point.copy(target);
      AM.dir.subVectors(target, hand); AM.dist = AM.dir.length(); AM.dir.normalize();
      AM.target = null; AM.surface = 'static';
      AM.body = f < GRAB + 4 ? A.shore : (A.let && f > A.let + PUT_AWAY ? A.sail : null);
    }
    if (f >= -12 && f <= GRAB + 2 && f % 12 === 0) R.log('aim', f, G.craft.mode, 'aimed', !!G.craft.aimed);
    if (f % 10 === 0 && f > GRAB && f < LET_GO + 20 && G.craft.holding) R.log('held', f, G.craft.holding.pos.toArray().map((v) => v.toFixed(2)).join(','), 'slot', A.slot?.toArray().map((v) => v.toFixed(2)).join(','));
    if (f >= 0 && f % 30 === 0) R.log('raft', f, G.craft.mode, 'ties', G.craft.ties?.size ?? G.craft.ties?.length, 'raft', A.logs[1].pos.toArray().map((v) => v.toFixed(1)).join(','), JSON.stringify(G.craft.stats?.() || {}).slice(0, 140));
  },
};
