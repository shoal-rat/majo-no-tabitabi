// G.craft — the witch's craft (docs/JOURNEY.md §5 "Movement and craft", docs/api/craft.md):
//   「牵星线」 star thread: catch a loose part with a fine gold thread, carry it along her aim, push it out / pull it in,
//              turn it ({guard} + mouse, or the turn buttons), and let it go.
//   「结星」   star knots: let a held part go while it touches other loose parts and small gold knots tie them with fixed
//              joints (Rapier impulse fixed joints). {cast} on a held part snips them.
//   sails:     a tied sail part catches the element system's wind and her own gusts, so a raft with a sail sails.
// Parts are props (G.props) of the types in src/data/craft.js PARTS. Nothing here is saved (like all physics state).
import * as THREE from 'three';
import { G as GG } from '../core/game.js';
import { t } from '../core/i18n.js';
import { clamp } from '../core/util.js';
import { THREAD, KNOT, CAPS, PARTS, SAIL, REWIND } from '../data/craft.js';
import { createKnots } from './knots.js';
import { createRewind } from './rewind.js';
import { createLessons } from './lessons.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _h = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _wind = new THREE.Vector3(), _tp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
const RA = { x: 0, y: 0, z: 0 }, RB = { x: 0, y: 0, z: 0 }, FA = { x: 0, y: 0, z: 0, w: 1 }, FB = { x: 0, y: 0, z: 0, w: 1 };

export const craftSystem = {
  name: 'craft',
  pausable: true,

  init(G) {
    const S = {
      mode: 'off',            // 'off' | 'aim' | 'hold'
      aimed: null,            // PhysBody under her aim that the thread could catch
      hold: null,             // { body, set: Set<PhysBody>, dist, rel: Quaternion, beam, t }
      ties: new Map(),        // PhysBody -> Set<tie>; tie = { a, b, j, la: Vector3, lb: Vector3 }
      list: [],               // every tie (for drawing / cleanup)
      preview: [],            // [{ a, b, p: Vector3 }] while holding
      turning: false,
      sails: new Set(),
      knots: null, gustT: 0, time: 0,
      stats: { grabs: 0, ties: 0, snips: 0, refused: 0 },
    };
    S.kept = []; S.keepN = 0; S.keepT = 0;
    for (let i = 0; i < KNOT.MAX_PREVIEW; i++) { S.preview.push({ a: null, b: null, p: new THREE.Vector3(), gap: new THREE.Vector3() }); S.kept.push({ a: null, b: null, p: new THREE.Vector3(), gap: new THREE.Vector3() }); }
    S.previewN = 0;
    this._S = S;

    const caps = () => CAPS[G.quality?.name] || CAPS.med;
    const knows = (art) => !!(G.state?.abilities?.[art] || G.params?.craft);
    const toast = (k, vars, dur = 2.2) => G.ui?.toast?.(t('craft.toast.' + k, vars), { dur });
    const propOf = (b) => G.props?.fromBody?.(b) || null;
    const partOf = (b) => { const p = propOf(b); return p && PARTS[p.type] ? PARTS[p.type] : null; };
    const catchable = (b) => !!b && b.alive !== false && b.isDynamic && b.group !== 'debris' && b.group !== 'projectile' &&
      !(b.held && !S.hold?.set.has(b)) && !!partOf(b) && b.mass <= THREAD.MAX_MASS;
    const tieable = (b) => catchable(b) && partOf(b).tie !== false;

    function hand(out) {
      const h = G.player?.rig?.bones?.handR;
      if (h) return h.getWorldPosition(out);
      const p = G.player.pos; return out.set(p.x, p.y + 1.3, p.z);
    }
    /** Every body tied to b (b included), breadth first; reuses one Set per call site. */
    const _asm = new Set(), _queue = [];
    function assembly(b, out = _asm) {
      out.clear(); _queue.length = 0;
      if (!b) return out;
      out.add(b); _queue.push(b);
      while (_queue.length) {
        const x = _queue.pop();
        const ts = S.ties.get(x);
        if (ts) for (const ti of ts) { const o = ti.a === x ? ti.b : ti.a; if (!out.has(o)) { out.add(o); _queue.push(o); } }
      }
      return out;
    }
    const tiedBodies = () => S.ties.size;

    // ---- ties -------------------------------------------------------------------------------------------------------------
    function tie(a, b, p) {
      const R = G.physics?.RAPIER, W = G.physics?.world;
      if (!R || !W || !a?.rb || !b?.rb || a === b) return null;
      p = _tp.copy(p);   // the caller may pass one of the scratch vectors used below
      // anchors in each body's frame; joint frames chosen so both read the same world orientation (fixed pose)
      _v.copy(p).sub(a.pos).applyQuaternion(_qi.copy(a.quat).invert()); RA.x = _v.x; RA.y = _v.y; RA.z = _v.z;
      FA.x = _qi.x; FA.y = _qi.y; FA.z = _qi.z; FA.w = _qi.w;
      _w.copy(p).sub(b.pos).applyQuaternion(_qi.copy(b.quat).invert()); RB.x = _w.x; RB.y = _w.y; RB.z = _w.z;
      FB.x = _qi.x; FB.y = _qi.y; FB.z = _qi.z; FB.w = _qi.w;
      const data = R.JointData.fixed(RA, FA, RB, FB);
      // an impulse fixed joint: every part stays its own rigid body, so the physics wrapper's per-body forces (buoyancy,
      // wind, the thread's velocity drive) keep working. (Multibody links take their velocity from the chain and ignore
      // those: a tied raft sank and its sail never pushed it.)
      let j = null;
      try { j = W.createImpulseJoint(data, a.rb, b.rb, true); } catch (e) { G.reportError('craft:tie', e); return null; }
      try { j.setContactsEnabled?.(false); } catch (e) { /* older builds: tied parts may still touch */ }
      const ti = { a, b, j, la: new THREE.Vector3(RA.x, RA.y, RA.z), lb: new THREE.Vector3(RB.x, RB.y, RB.z), t: S.time };
      for (const x of [a, b]) {
        let s = S.ties.get(x); if (!s) S.ties.set(x, (s = new Set())); s.add(ti);
        const pr = propOf(x); if (pr) { if (pr._craftPersist === undefined) pr._craftPersist = !!pr.persistent; pr.persistent = true; }
      }
      S.list.push(ti);
      S.stats.ties++;
      return ti;
    }
    function untie(ti, quiet) {
      const W = G.physics?.world;
      if (W && ti.j && ti.a.alive !== false && ti.b.alive !== false) {
        try { W.removeImpulseJoint(ti.j, true); } catch (e) { /* gone with its body */ }
      }
      ti.j = null;
      for (const x of [ti.a, ti.b]) {
        const s = S.ties.get(x);
        if (s) { s.delete(ti); if (!s.size) { S.ties.delete(x); const pr = propOf(x); if (pr && pr._craftPersist !== undefined) { pr.persistent = pr._craftPersist; pr._craftPersist = undefined; } } }
      }
      const k = S.list.indexOf(ti); if (k >= 0) S.list.splice(k, 1);
      if (!quiet) { knotPoint(ti, _v); G.fx?.burst?.('pickup', _v, { color: 0xffe2a0, scale: 0.4 }); }
    }
    function snip(b) {
      const ts = S.ties.get(b);
      if (!ts || !ts.size) return 0;
      let n = 0;
      for (const ti of [...ts]) { untie(ti); n++; }
      S.stats.snips++;
      G.audio?.sfx?.('paper', { pos: b.pos, vol: 0.8, pitch: 1.3 });
      G.events.emit('craft:snip', { body: b, n });
      return n;
    }
    function knotPoint(ti, out) { return out.copy(ti.la).applyQuaternion(ti.a.quat).add(ti.a.pos); }

    // ---- the thread ---------------------------------------------------------------------------------------------------------
    function pick() {
      const P = G.player, A = P.aim;
      let b = A?.body && catchable(A.body) ? A.body : null;
      if (!b && A?.point && G.physics?.nearest) b = G.physics.nearest(A.point, 1.6, catchable);
      if (b && hand(_h).distanceTo(b.pos) > THREAD.RANGE) b = null;
      return b;
    }
    function setAimed(b) {
      if (S.aimed === b) return;
      if (S.aimed && S.aimed !== S.hold?.body) propOf(S.aimed)?.highlight?.(false);
      S.aimed = b;
      if (b) propOf(b)?.highlight?.(true);
    }
    function camYaw(out) { return out.setFromAxisAngle(UP, G.cam ? G.cam.yaw : 0); }
    function grab(b) {
      const set = new Set(assembly(b));
      let mass = 0; for (const x of set) mass += x.mass || 0;
      if (mass > THREAD.MAX_LIFT) { toast('heavy'); return false; }
      for (const x of set) { x.held = true; x.wake?.(); }
      const d = hand(_h).distanceTo(b.pos);
      const rel = camYaw(new THREE.Quaternion()).invert().multiply(b.quat);
      const beam = G.fx?.beam?.({ from: _h, to: b.pos, color: 0xffe2a0, width: 0.045, sparks: false, light: false, intensity: 0.9 }) || null;
      S.hold = { body: b, set, dist: clamp(d, THREAD.DIST_MIN, THREAD.DIST_MAX), rel, beam, t: 0 };
      propOf(b)?.highlight?.(true);
      S.mode = 'hold'; S.stats.grabs++;
      G.fx?.burst?.('pickup', b.pos, { color: 0xffe2a0, scale: 0.6 });
      G.audio?.sfx?.('bell_small', { pos: b.pos, vol: 0.45, pitch: 1.8 });
      G.player?.playAction?.('cast_channel', { faceAim: true });
      G.events.emit('craft:grab', { body: b, parts: set.size });
      return true;
    }
    function release(doTie) {
      const H = S.hold;
      if (!H) return;
      let made = 0;
      if (doTie && !S.previewN && S.keepT > 0) { S.previewN = S.keepN; for (let i = 0; i < S.keepN; i++) { const a = S.kept[i], k = S.preview[i]; k.a = a.a; k.b = a.b; k.p.copy(a.p); k.gap.copy(a.gap); } }
      if (doTie && S.previewN) made = tieAll(H);
      for (const x of H.set) { if (x.alive !== false) { x.held = false; x.wake?.(); } }
      if (H.body.alive !== false) H.body.setVelocity?.(_v.set(0, -0.5, 0));
      propOf(H.body)?.highlight?.(false);
      H.beam?.remove?.();
      S.hold = null; S.previewN = 0;
      S.mode = 'aim';
      G.player?.stopAction?.('cast_channel');
      G.events.emit('craft:release', { tied: made });
    }
    function tieAll(H) {
      const C = caps();
      let made = 0;
      // the magnet: the held parts close the gap to the first part they would tie to (≤ KNOT.REACH), then knot
      if (S.previewN) {
        const g = S.preview[0].gap, gl = g.length();
        if (gl > 0.03) g.multiplyScalar((gl - 0.03) / gl); else g.set(0, 0, 0);   // stop just short of touching
        if (g.lengthSq() > 1e-6) {
          for (const x of H.set) { if (x.alive !== false) x.setPosition?.(_v.copy(x.pos).add(g)); }
          for (let i = 1; i < S.previewN; i++) S.preview[i].p.add(g).sub(S.preview[i].gap);   // others: on their faces
        }
      }
      for (let i = 0; i < S.previewN; i++) {
        const pv = S.preview[i];
        if (assembly(H.body).has(pv.b)) continue;                     // already tied through another knot this release
        const after = assembly(H.body).size + assembly(pv.b, new Set()).size;
        if (after > C.parts) { toast('capParts', { n: C.parts }); S.stats.refused++; break; }
        const fresh = (S.ties.has(pv.a) ? 0 : 1) + (S.ties.has(pv.b) ? 0 : 1);
        if (tiedBodies() + fresh > C.bodies) { toast('capWorld'); S.stats.refused++; break; }
        if (!G.player.spendMana(KNOT.MANA)) { toast('noMana'); break; }
        if (tie(pv.a, pv.b, pv.p)) {
          made++;
          G.fx?.burst?.('pickup', pv.p, { color: 0xffd98a, scale: 0.75 });
        }
      }
      if (made) {
        G.audio?.sfx?.('bell_small', { pos: H.body.pos, vol: 0.6, pitch: 1.5 });
        G.fx?.ring?.(H.body.pos, { color: 0xffe2a0, radius: 1.6, dur: 0.45, y: H.body.pos.y });
        G.events.emit('craft:tie', { body: H.body, n: made, parts: assembly(H.body).size });
      }
      return made;
    }
    /** Contacts between the held parts and other tieable loose parts → S.preview (at most KNOT.MAX_PREVIEW, one per part). */
    // The magnet: other loose tieable parts within KNOT.REACH of any held part (Rapier closest points,
    // Collider.contactCollider). Callbacks are hoisted: the scan runs every frame while she holds a part.
    let scanH = null, scanA = null, sc = null;
    function onNear(o) {
      if (S.previewN >= KNOT.MAX_PREVIEW || !o?.col || scanH.set.has(o) || !tieable(o)) return;
      for (let i = 0; i < S.previewN; i++) if (S.preview[i].b === o) return;
      let c = null;
      try { c = scanA.col.contactCollider(o.col, KNOT.REACH, sc || undefined); } catch (e) { c = null; }
      if (!c || c.distance > KNOT.REACH) return;
      sc = c;
      const pv = S.preview[S.previewN++];
      pv.a = scanA; pv.b = o;
      pv.p.set(c.point2.x, c.point2.y, c.point2.z);                                   // on the part it would tie to
      pv.gap.set(c.point2.x - c.point1.x, c.point2.y - c.point1.y, c.point2.z - c.point1.z);   // what the magnet closes
    }
    function scanContacts(H) {
      // keep the last knots for a moment: a part moving past another shows them only briefly
      if (S.previewN) { S.keepT = 0.25; S.keepN = S.previewN; for (let i = 0; i < S.previewN; i++) { const a = S.preview[i], k = S.kept[i]; k.a = a.a; k.b = a.b; k.p.copy(a.p); k.gap.copy(a.gap); } }
      S.previewN = 0;
      if (!G.physics?.overlapSphere || partOf(H.body)?.tie === false) return;
      let checked = 0;
      scanH = H;
      for (const a of H.set) {
        if (checked++ > 8 || S.previewN >= KNOT.MAX_PREVIEW || !a.col || partOf(a)?.tie === false) continue;
        scanA = a;
        G.physics.overlapSphere(a.pos, (a.radius || 0.6) + KNOT.REACH + 0.2, onNear);
      }
    }
    function updateHold(dt) {
      const H = S.hold, P = G.player, inp = G.input, b = H.body;
      if (b.alive === false || !P.spendMana(THREAD.MANA * dt)) { if (b.alive !== false) toast('noMana'); release(false); return; }
      H.t += dt;
      // push out / pull in
      if (inp.wheel) H.dist = clamp(H.dist - Math.sign(inp.wheel) * THREAD.DIST_STEP, THREAD.DIST_MIN, THREAD.DIST_MAX);
      if (inp.held('craftNear')) H.dist = clamp(H.dist - THREAD.DIST_RATE * dt, THREAD.DIST_MIN, THREAD.DIST_MAX);
      if (inp.held('craftFar')) H.dist = clamp(H.dist + THREAD.DIST_RATE * dt, THREAD.DIST_MIN, THREAD.DIST_MAX);
      // turn: {guard} + mouse (the camera holds still), or 45° taps
      S.turning = inp.held('guard') && !G.input.touch;
      if (S.turning) {
        if (inp.lookX) H.rel.premultiply(_q.setFromAxisAngle(UP, inp.lookX * THREAD.TURN));
        if (inp.lookY) H.rel.premultiply(_q.setFromAxisAngle(RIGHT, inp.lookY * THREAD.TURN));
      }
      if (inp.pressed('craftTurn')) H.rel.premultiply(_q.setFromAxisAngle(UP, THREAD.STEP));
      if (inp.pressed('craftTilt')) H.rel.premultiply(_q.setFromAxisAngle(RIGHT, THREAD.STEP));
      H.rel.normalize();
      // where it goes: along her aim from the hand, never into the ground
      hand(_h);
      _v.copy(_h).addScaledVector(P.aim.dir, H.dist);
      const gy = G.world.groundAt(_v.x, _v.z, _v.y + 1) + Math.min(1.2, (b.radius || 0.5) * 0.6);
      if (_v.y < gy) _v.y = gy;
      if (G.world.isWater?.(_v.x, _v.z) && _v.y < G.world.seaLevel + 0.2) _v.y = G.world.seaLevel + 0.2;
      camYaw(_q2).multiply(H.rel);
      b.setKinematicTarget(_v, _q2);
      H.beam?.set?.(_h, b.pos);
      scanContacts(H);
      // too far behind (stuck on something): the thread lets go
      if (b.pos.distanceTo(_h) > THREAD.RANGE + 6) release(false);
    }

    // ---- sails ----------------------------------------------------------------------------------------------------------------
    function updateSails(dt) {
      const P = G.player;
      for (const b of S.sails) {
        if (b.alive === false) { S.sails.delete(b); continue; }
        if (b.held || !P || b.pos.distanceToSquared(P.pos) > 120 * 120) continue;
        const area = partOf(b)?.sail || 0;
        if (!area) continue;
        _v.copy(b.pos); _v.y += 1.6;
        const w = G.elements?.windAt?.(_v, _wind);
        if (!w) continue;
        const hx = w.x, hz = w.z, sp = Math.hypot(hx, hz);
        if (sp < 0.3) continue;
        // only the part of the wind square to the cloth pushes (the sail faces its local +z)
        _c.set(0, 0, 1).applyQuaternion(b.quat); _c.y = 0;
        const face = Math.abs((_c.x * hx + _c.z * hz) / (Math.hypot(_c.x, _c.z) * sp || 1));
        const imp = Math.min(SAIL.MAX, sp * area * SAIL.K * (0.25 + 0.75 * face)) * dt;
        b.applyImpulse?.(_w.set(hx / sp * imp, 0, hz / sp * imp));
      }
    }
    function onGust(e) {
      const P = G.player;
      if (!P || e?.caster !== P || e.spell !== 'wind') return;
      const o = e.pos || P.pos, d = e.dir || P.aim?.dir;
      if (!d) return;
      const dl = Math.hypot(d.x, d.z) || 1;
      for (const b of S.sails) {
        if (b.alive === false || b.held) continue;
        _v.subVectors(b.pos, o); _v.y = 0;
        const dist = _v.length();
        if (dist > SAIL.GUST_RANGE * (e.form === 'big' ? 1.6 : 1) || dist < 0.1) continue;
        if ((_v.x * d.x + _v.z * d.z) / (dist * dl) < 0.6) continue;
        // the whole raft takes the shove (each part by its own mass: the cloth alone would tear the knots)
        const k = SAIL.GUST * (e.form === 'big' ? 1.8 : 1) * (1 - 0.5 * dist / SAIL.GUST_RANGE);
        for (const x of assembly(b)) if (x.alive !== false) x.applyImpulse?.(_w.set(d.x / dl * (x.mass || 0) * k, 0, d.z / dl * (x.mass || 0) * k));
        G.fx?.burst?.('feathers', _v.copy(b.pos).setY(b.pos.y + 1.6), { color: 0xf3ead2, scale: 0.6 });
        G.events.emit('craft:sail', { body: b, push: +(k).toFixed(2) });
      }
    }
    G.events.on('spell:cast', (e) => { try { onGust(e); } catch (err) { G.reportError('craft:gust', err); } });

    // ---- per frame ------------------------------------------------------------------------------------------------------------
    function canUse() {
      const P = G.player;
      return G.mode === 'play' && !!P && !P.dead && P.control !== false && !P.onBroom && P.state !== 'climb' && P.state !== 'swim' && !G.dialogue?.active;
    }
    function drop() { if (S.hold) release(false); setAimed(null); S.mode = 'off'; S.turning = false; if (S.rw?.R.mode !== 'off') S.rw?.toggle(false); if (G.player) G.player.craftAim = false; }
    function step(dt) {
      S.time += dt;
      if (S.keepT > 0) S.keepT -= dt;
      const inp = G.input, P = G.player;
      // sails the props system spawned / streamed in (cheap: only parts of type sail are tracked)
      if ((S.sailScan = (S.sailScan || 0) - dt) <= 0) {
        S.sailScan = 1;
        const live = G.props?.live;
        if (live) for (const p of live) if (p.alive && p.type === 'sail' && p.body) S.sails.add(p.body);
      }
      const rw = S.rw || (S.rw = createRewind(G, { knows, toast }));
      if ((S.mode !== 'off' || rw.R.mode !== 'off') && !canUse()) drop();
      // 溯光: {rewind} toggles its aim (it puts the thread away)
      if (inp?.pressed('rewind') && G.mode === 'play') {
        if (rw.R.mode === 'off') { if (canUse() || !knows('rewind')) { if (S.mode !== 'off' && knows('rewind')) drop(); rw.toggle(true); } }
        else rw.toggle(false);
      }
      rw.update(dt, inp);
      // learning beats, first-use lessons and craft sites (a load or a new game swaps G.state: catch up quietly)
      const ls = S.lessons || (S.lessons = createLessons(G, G.craft));
      if (S.seenState !== G.state && G.state && G.quests) { S.seenState = G.state; rw.R.sites.length = 0; ls.resync(); }
      ls.update(dt);
      if (inp?.pressed('thread') && G.mode === 'play') {
        if (!knows('thread')) toast('unknown');
        else if (S.mode === 'off') { if (rw.R.mode !== 'off') rw.toggle(false); if (canUse()) { S.mode = 'aim'; G.events.emit('craft:mode', { mode: 'aim' }); } }
        else { drop(); G.events.emit('craft:mode', { mode: 'off' }); }
      }
      if (P) P.craftAim = S.mode !== 'off' || rw.R.mode !== 'off';
      if (S.mode === 'aim') {
        setAimed(pick());
        if (inp.pressed('attack')) { if (S.aimed) grab(S.aimed); else { toast('nothing', null, 1.6); G.fx?.burst?.('pickup', P.aim.point, { color: 0xffe2a0, scale: 0.3 }); } }
      } else if (S.mode === 'hold') {
        setAimed(null);
        updateHold(dt);
        if (S.hold) {
          if (inp.pressed('cast')) { const n = snip(S.hold.body); if (n) { toast('snipped', { n }); for (const x of [...S.hold.set]) if (!assembly(S.hold.body).has(x)) { x.held = false; S.hold.set.delete(x); } } }
          else if (inp.pressed('attack')) release(true);
        }
      }
      if (!S.hold) S.turning = false;
      // ties whose part broke, burnt or went away
      for (let i = S.list.length - 1; i >= 0; i--) { const ti = S.list[i]; if (ti.a.alive === false || ti.b.alive === false) untie(ti, true); }
      updateSails(dt);
      // knots: the tied ones near her glow softly, the would-be ones pulse
      const K = S.knots || (S.knots = createKnots(KNOT.MAX_SHOWN + KNOT.MAX_PREVIEW));
      K.begin();
      const pp = P?.pos;
      for (let i = 0; i < S.list.length && K.count < KNOT.MAX_SHOWN; i++) {
        const ti = S.list[i];
        knotPoint(ti, _v);
        if (pp && _v.distanceToSquared(pp) > 90 * 90) continue;
        K.add(_v.x, _v.y, _v.z, 0.55 + 0.18 * Math.sin(S.time * 2.1 + i * 1.7));
      }
      for (let i = 0; i < S.previewN; i++) { const p = S.preview[i].p; K.add(p.x, p.y, p.z, 1.15 + 0.4 * Math.sin(S.time * 9)); }
      K.end();
    }
    this._step = step;

    G.craft = {
      PARTS, THREAD, KNOT, CAPS, REWIND,
      knows,
      /** Teach an art ('thread' | 'rewind'); opts.silent: no toast. Returns true when it was new. */
      learn(art, o = {}) {
        if (!G.state) return false;
        G.state.abilities = G.state.abilities || {};
        if (G.state.abilities[art]) return false;
        G.state.abilities[art] = true;
        if (!o.silent) G.ui?.toast?.(t('craft.learned', { name: t('craft.art.' + art + '.name') }), { dur: 3 });
        G.events.emit('craft:learned', { id: art });
        return true;
      },
      get mode() { return S.mode; },
      /** True while the thread or the back-light is out (craft owns attack / cast / guard / wheel). */
      get busy() { return S.mode !== 'off' || !!S.rw?.busy; },
      /** Learning, lessons and sites (src/craft/lessons.js; tests read .L). */
      get lessons() { return S.lessons || null; },
      /** The back-light: { busy, running, target, toggle(on), restoreAt(pos), stats() }. */
      get rewind() { return S.rw || null; },
      get holding() { return S.hold?.body || null; },
      get turning() { return S.turning; },
      get aimed() { return S.aimed; },
      /** Tie a to b at world point p (tests and scripted scenes; no caps, no mana). */
      tie: (a, b, p) => tie(a, b, p || _v.copy(a.pos).add(b.pos).multiplyScalar(0.5)),
      snip,
      /** Bodies tied to b (b included). */
      assemblyOf: (b) => [...assembly(b, new Set())],
      /** Catch b with the thread now (tests). */
      grab: (b) => { if (!catchable(b)) return false; if (S.mode === 'off') S.mode = 'aim'; return grab(b); },
      release: (doTie = true) => release(doTie),
      drop,
      caps,
      get ties() { return S.list.length; },
      /** The live hold { body, set, dist, rel } (tests steer it). */
      get _hold() { return S.hold; },
      stats: () => ({ mode: S.mode, ties: S.list.length, tied: S.ties.size, sails: S.sails.size, preview: S.previewN, ...S.stats }),
    };
  },

  update(dt) {
    try { this._step?.(dt); } catch (e) { GG.reportError('craft:update', e); }
  },
};
