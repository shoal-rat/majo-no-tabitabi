// 「溯光」 back-light (craft restoration round, docs/api/craft.md): aim at one damaged thing and its history runs
// backwards in a pale silver-blue light under a ring of tick marks that turns the wrong way: logs fly back into the
// trunk and the tree stands up, shards close into the rock, scorch drains out of the ground and the grass stands again,
// a crater's earth flows back in, a broken prop gathers itself on the spot it broke.
// History is what other systems already keep: flora wreck records, destruction burns and scar stamps, and the props
// broken this session ('prop:broken'). A restored record leaves the save. Natural regrowth is untouched.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { REWIND } from '../data/craft.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const BLUE = 0xbfe6ff;
const WOOD = [0x8b5a3c, 0xa77b52, 0x6b4a33], STONE = [0x9a99a2, 0x86848e, 0xa9a7ae], EARTH = [0x6e5038, 0x7d5d40, 0x5d8a3a];

function tickRing() {
  // 36 ticks (every third one long) around a thin circle, flat, unit radius
  const pos = [], idx = [];
  const quad = (a, r0, r1, w) => {
    const c = Math.cos(a), s = Math.sin(a), px = -s * w, pz = c * w, n = pos.length / 3;
    pos.push(c * r0 + px, 0, s * r0 + pz, c * r1 + px, 0, s * r1 + pz, c * r1 - px, 0, s * r1 - pz, c * r0 - px, 0, s * r0 - pz);
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  for (let i = 0; i < 36; i++) quad((i / 36) * Math.PI * 2, i % 3 ? 0.9 : 0.8, 1, i % 3 ? 0.012 : 0.02);
  for (let i = 0; i < 96; i++) { const a0 = (i / 96) * Math.PI * 2; quad(a0, 1.03, 1.05, 0.034); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const m = new THREE.Mesh(g, mat); m.name = 'craft:rewindRing'; m.renderOrder = 5; m.frustumCulled = false; m.visible = false;
  return m;
}

export function createRewind(G, H) {
  const R = { mode: 'off', target: null, run: null, cd: 0, scanT: 0, broken: [], sites: [], ring: null, shards: null, spin: 0, glow: 0, stats: { runs: 0, kinds: {} } };
  const T = { kind: '', id: -1, x: 0, y: 0, z: 0, r: 1, h: 1, rec: null };   // the aimed target (reused)
  const keep = () => REWIND.KEEP[G.quality?.name] || REWIND.KEEP.med;

  G.events.on('prop:broken', (e) => {
    if (!e?.pos || !e.type || e.by === 'craft') return;
    while (R.broken.length >= keep()) R.broken.shift();
    R.broken.push({ type: e.type, x: e.pos.x, y: e.pos.y, z: e.pos.z, quat: e.quat || null, t: G.time?.t ?? 0 });
  });

  // ---- shards that fly back together (one instanced draw, no physics) -----------------------------------------------
  const SH = { n: 0, a: [] };
  function shardMesh() {
    if (R.shards || !G.scene) return R.shards;
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x23384a });
    R.shards = new THREE.InstancedMesh(geo, mat, REWIND.SHARDS);
    R.shards.name = 'craft:rewindShards'; R.shards.count = 0; R.shards.frustumCulled = false;
    R.shards.setColorAt(0, new THREE.Color(1, 1, 1));
    G.scene.add(R.shards);
    for (let i = 0; i < REWIND.SHARDS; i++) SH.a.push({ x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, s: 1, r: 0, c: 0 });
    return R.shards;
  }
  const _c = new THREE.Color();
  function shardsFrom(x, y, z, r, cols, n) {
    if (!shardMesh()) return;
    n = Math.min(REWIND.SHARDS, Math.round(n * clamp(G.quality?.particles ?? 1, 0.4, 1)));
    SH.n = n;
    for (let i = 0; i < n; i++) {
      const s = SH.a[i], a = Math.random() * Math.PI * 2, d = r * (0.8 + Math.random() * 1.2);
      s.x = x + Math.cos(a) * d; s.z = z + Math.sin(a) * d; s.y = G.world.heightAt(s.x, s.z) + 0.15;
      s.tx = x + (Math.random() - 0.5) * r * 0.4; s.tz = z + (Math.random() - 0.5) * r * 0.4; s.ty = y + Math.random() * r * 0.8;
      s.s = 0.12 + Math.random() * 0.22 * Math.min(2, r); s.r = Math.random() * 6;
      R.shards.setColorAt(i, _c.setHex(cols[i % cols.length]).lerp(_c.clone().setHex(BLUE), 0.25));
    }
    R.shards.instanceColor.needsUpdate = true;
  }
  function drawShards(k) {
    const M = R.shards;
    if (!M) return;
    if (k >= 1 || !SH.n) { M.count = 0; SH.n = 0; return; }
    const e = k * k * (3 - 2 * k), lift = Math.sin(k * Math.PI) * 0.8;
    for (let i = 0; i < SH.n; i++) {
      const s = SH.a[i];
      _v.set(s.x + (s.tx - s.x) * e, s.y + (s.ty - s.y) * e + lift, s.z + (s.tz - s.z) * e);
      _q.setFromEuler(_e.set(s.r * (1 - e), s.r * 0.7 * (1 - e), 0));
      _m.compose(_v, _q, _s.setScalar(s.s * (k > 0.85 ? (1 - k) / 0.15 : 1)));
      M.setMatrixAt(i, _m);
    }
    M.count = SH.n;
    M.instanceMatrix.needsUpdate = true;
  }

  // ---- what is under her aim ----------------------------------------------------------------------------------------
  function scan() {
    const P = G.player, A = P.aim?.point;
    T.kind = '';
    if (!A || A.distanceTo(P.pos) > REWIND.RANGE) return null;
    let best = REWIND.PICK;
    const W = G.flora?.wreck;
    if (W?.near) for (const id of W.near(A.x, A.z, REWIND.PICK + 3)) {
      const f = W.info(id);
      // a felled tree is found along the line it lies on, a stump at its foot
      const d = Math.hypot(f.x - A.x, f.z - A.z) - (f.bits & 2 ? 2 : 0.5);
      if (d < best) { best = d; T.kind = 'flora'; T.id = id; T.x = f.x; T.y = f.y; T.z = f.z; T.r = Math.max(1.2, f.r * 3 + 0.8); T.h = f.h; T.rec = null; }
    }
    for (let k = 0; k < R.broken.length + R.sites.length; k++) {
      const b = k < R.broken.length ? R.broken[k] : R.sites[k - R.broken.length];
      const d = Math.hypot(b.x - A.x, b.z - A.z) - 0.4;
      if (d < best) { best = d; T.kind = 'prop'; T.rec = b; T.x = b.x; T.y = b.y; T.z = b.z; T.r = 1.1; T.h = 1; }
    }
    const scars = G.world.spellScarList?.();
    if (scars) for (let i = scars.length - 1; i >= 0; i--) {
      const s = scars[i];
      if (Math.abs(s[3]) < 0.3) continue;
      const d = Math.hypot(s[0] - A.x, s[1] - A.z) - s[2] * 0.6 - 1;   // a crater wins over the scorch around it (one blast)
      if (d < best) { best = d; T.kind = 'crater'; T.x = s[0]; T.z = s[1]; T.y = G.world.heightAt(s[0], s[1]); T.r = s[2] * 1.3; T.h = Math.abs(s[3]); T.rec = null; }
    }
    // a crater under the aim takes its own scorch with it: burns only count where there is no crater
    const burns = T.kind === 'crater' ? null : G.destruction?.burns;
    if (burns) for (const b of burns) {
      if (b.s < 0.08) continue;
      const d = Math.hypot(b.x - A.x, b.z - A.z) - b.r * 0.7;
      if (d < best) { best = d; T.kind = 'burn'; T.x = b.x; T.z = b.z; T.y = G.world.heightAt(b.x, b.z); T.r = b.r + 1.2; T.h = b.s; T.rec = b; }
    }
    return T.kind ? T : null;
  }

  // ---- running one rewind -------------------------------------------------------------------------------------------
  function start(t) {
    const P = G.player;
    const cost = Math.round(REWIND.MANA + REWIND.PER_M * Math.min(10, t.r + t.h));
    if (!P.spendMana(cost)) { H.toast('noMana'); return false; }
    const run = { kind: t.kind, x: t.x, y: t.y, z: t.z, r: t.r, h: t.h, t: 0, dur: REWIND.DUR, step: 0, logs: null, rec: t.rec, id: t.id, done: false };
    if (t.kind === 'flora') {
      const res = G.flora.wreck.restore(t.id, run.dur * 0.75);
      if (!res) return false;
      run.sub = res.kind;
      // its logs (this session) fly back into the trunk; otherwise wood and stone gather from around it
      run.logs = (res.kind === 'rise' ? G.flora.wreck.logsOf(t.id) : []).filter((p) => p.alive && p.body);
      for (const p of run.logs) { p.body.held = true; p.body.wake?.(); p.persistent = true; }
      if (!run.logs.length && res.kind !== 'unchar' && res.kind !== 'uncrack') shardsFrom(t.x, t.y + 0.4, t.z, res.tree ? 2 : t.r * 0.6, res.tree ? WOOD : STONE, res.tree ? 10 : 16);
    } else if (t.kind === 'prop') {
      const i = R.broken.indexOf(t.rec); if (i >= 0) R.broken.splice(i, 1);
      const j = R.sites.indexOf(t.rec); if (j >= 0) R.sites.splice(j, 1);
      shardsFrom(t.x, t.y, t.z, 1.2, G.props?.catalog?.[t.rec.type]?.debrisColor || WOOD, 12);
    } else if (t.kind === 'crater') {
      shardsFrom(t.x, t.y, t.z, t.r * 0.7, EARTH, 18);
      G.destruction?.uncarve?.(t.x, t.z, 0.8, 1);   // remember it as dug
    } else if (t.kind === 'burn') {
      run.s0 = t.h;
    }
    R.run = run; R.cd = REWIND.CD;
    R.stats.runs++; R.stats.kinds[t.kind] = (R.stats.kinds[t.kind] || 0) + 1;
    P.playAction?.('cast_raise', { faceAim: true });
    G.audio?.sfx?.('bell_small', { pos: _v.set(t.x, t.y + 1, t.z), vol: 0.7, pitch: 0.62 });
    G.audio?.sfx?.('whoosh', { pos: _v, vol: 0.5, pitch: 0.7 });
    G.cam?.fovKick?.(-0.25);
    G.events.emit('craft:rewind', { kind: t.kind, sub: run.sub || null, pos: _w.set(t.x, t.y, t.z).clone() });
    return true;
  }
  function step(run, dt) {
    run.t += dt;
    const k = clamp(run.t / run.dur);
    // motes rising backwards out of the ground into the target
    if ((run.mt = (run.mt || 0) - dt) <= 0) {
      run.mt = 0.09;
      const a = Math.random() * Math.PI * 2, d = run.r * (0.6 + Math.random() * 0.6);
      G.fx?.burst?.('pickup', _v.set(run.x + Math.cos(a) * d, run.y + 0.2 + Math.random() * run.h, run.z + Math.sin(a) * d), { color: BLUE, scale: 0.35, count: 0.5 });
    }
    if (run.kind === 'flora' && run.logs) {
      // logs fly to where the trunk stands up
      const e = clamp(k / 0.7);
      for (const p of run.logs) {
        if (!p.alive || !p.body) continue;
        _v.set(run.x, run.y + 1 + e * 1.5, run.z);
        if (e < 1) p.body.setKinematicTarget(_v.lerp(p.body.pos, 1 - e * 0.35));
        else if (!p._rw) { p._rw = true; p.remove?.(); }
      }
    } else if (run.kind === 'crater') {
      // the earth flows back in three steps
      const want = k < 0.35 ? 0 : k < 0.65 ? 1 : k < 0.95 ? 2 : 3;
      while (run.step < want) { run.step++; G.destruction?.uncarve?.(run.x, run.z, 0.8, [1, 0.6, 0.25, 0][run.step]); G.terrain?.unscorch?.(run.x, run.z, run.r, 'burn', [1, 0.6, 0.25, 0][run.step]); }
    } else if (run.kind === 'burn') {
      const want = Math.floor(k * 6);
      while (run.step < want) { run.step++; G.destruction?.unburn?.(run.x, run.z, run.r, run.s0 * (1 - run.step / 6)); }
    }
    drawShards(run.kind === 'burn' ? 1 : k / 0.9);
    if (k >= 1 && !run.done) {
      run.done = true;
      if (run.kind === 'prop' && run.rec && G.props?.spawn) {
        const q = run.rec.quat;
        const p = G.props.spawn(run.rec.type, _v.set(run.rec.x, run.rec.y + 0.05, run.rec.z), { rot: q ? _q.copy(q) : 0, sleep: true });
        if (p) G.fx?.burst?.('pickup', p.pos, { color: BLUE, scale: 0.9 });
      }
      if (run.kind === 'burn') G.destruction?.unburn?.(run.x, run.z, run.r, 0);
      if (run.kind === 'crater') { G.destruction?.uncarve?.(run.x, run.z, 0.8, 0); G.destruction?.unburn?.(run.x, run.z, run.r, 0); }
      G.fx?.ring?.(_v.set(run.x, run.y + 0.1, run.z), { color: BLUE, radius: run.r * 1.2, dur: 0.6, y: run.y + 0.1 });
      G.audio?.sfx?.('bell_small', { pos: _v, vol: 0.6, pitch: 1.25 });
      G.events.emit('craft:restored', { kind: run.kind, sub: run.sub || null, rec: run.rec || null });
      R.run = null;
      drawShards(1);
    }
  }

  // ---- per frame ------------------------------------------------------------------------------------------------------
  function ringAt(x, y, z, r, k, dt) {
    const M = R.ring || (R.ring = tickRing());
    if (!M.parent && G.scene) G.scene.add(M);
    R.spin -= dt * (R.run ? 2.6 : 0.6);   // it turns the wrong way
    M.position.set(x, y + 0.08, z); M.rotation.set(0, R.spin, 0); M.scale.setScalar(Math.max(0.6, r));
    R.glow += ((k > 0 ? k : 0) - R.glow) * Math.min(1, dt * 8);
    M.material.opacity = 0.8 * R.glow; M.visible = R.glow > 0.02;
  }
  return {
    R,
    get busy() { return R.mode !== 'off' || !!R.run; },
    get running() { return !!R.run; },
    get target() { return R.mode === 'aim' ? scan() : null; },
    toggle(on) {
      if (on && !H.knows('rewind')) { H.toast('unknown'); return; }
      R.mode = on ? 'aim' : 'off';
      G.events.emit('craft:mode', { mode: on ? 'rewind' : 'off' });
    },
    /** Rewind the nearest restorable thing within REWIND.PICK of p (tests and scripted scenes; costs mana). */
    restoreAt(p) {
      const A = G.player.aim; const keepP = A.point.clone(); A.point.copy(p);
      const t = scan(); A.point.copy(keepP);
      return t ? start(t) : false;
    },
    update(dt, inp) {
      R.cd = Math.max(0, R.cd - dt);
      if (R.run) step(R.run, dt);
      let t = null;
      if (R.mode === 'aim' && !R.run) {
        if ((R.scanT -= dt) <= 0) { R.scanT = REWIND.SCAN; R.last = scan() ? Object.assign(R.lastT || (R.lastT = {}), T) : null; }
        t = R.last;
        if (inp.pressed('attack')) {
          if (!t) H.toast('noPast', null, 1.6);
          else if (R.cd <= 0) { R.scanT = 0; start(t); }
        }
      }
      if (R.run) ringAt(R.run.x, R.run.y, R.run.z, R.run.r, 1, dt);
      else if (t) ringAt(t.x, t.y, t.z, t.r, 0.45 + 0.15 * Math.sin((G.time?.t ?? 0) * 5), dt);
      else ringAt(R.ring?.position.x ?? 0, (R.ring?.position.y ?? 0) - 0.08, R.ring?.position.z ?? 0, R.ring?.scale.x ?? 1, 0, dt);
    },
    /** A break the world remembers without anyone having broken it this session (a craft site's ruined post). */
    remember(rec) {
      if (!rec || R.sites.some((s) => s.site && s.site === rec.site)) return null;
      R.sites.push(rec);
      return rec;
    },
    stats: () => ({ mode: R.mode, running: !!R.run, broken: R.broken.length, ...R.stats }),
  };
}
