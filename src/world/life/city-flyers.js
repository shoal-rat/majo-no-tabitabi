// Witches of the Land of Mages (citylife round, 2026-11-22). G.life.city — the sky over the City of Magic full of
// brooms: apprentices in dark robes, travelling witches, a few grey-haired elders. Purely visual (no colliders, no save).
//   hop      the heart of it: take off from a balcony, a short arc across the street canyon, land on another balcony,
//            stand and chat / lean on the rail / step inside for a while, hop on again (delivery witches carry parcels)
//   lane     the busiest traffic: streams along the sky lanes between the towers, at several heights, both ways
//   circle   laps round the spires and tower tops      commute   in and out over the walls and through the gate arch
//   trio     three apprentices practising a formation over the practice field    loop   the odd loop-the-loop
// They bank into turns, pitch on climbs and dives, their hems and hair flutter (shader), faint broom trails behind.
// The heroine: they wave when she flies close (once in a while), give way (they never touch her), and now and then
// one falls in beside her for a few seconds before peeling off. Balconies she is landing on are left to her.
// Story: nobody is ever inside a staged zone (crash roof during the accident, the inn, the practice field during the
// lesson / ring course, the gate during the fly-through and the parting). A dialogue or a cutscene leaves everyone
// else as they are (scaling the ones near her away read as people shrinking during a talk).
import * as THREE from 'three';
import { CITY } from '../../data/journey-map.js';
import { buildCityPlan, activeKeepOut, inKeepOut } from './city-flyers-plan.js';
import { bakeHumanoid, createBodyPool } from './city-flyers-bake.js';
import { createCityCrowds } from './city-crowds.js';

const TAU = Math.PI * 2;
export const BODIES = ['char_saya', 'char_exam_witch', 'char_fran', 'char_innkeeper', 'char_elaina_father'];
const SEAT = 0.45;     // model origin below the broom seat while riding (rig space: seat 0.39 + clearance)
const MAXP = 160;      // path samples per flyer
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// ---- costumes (linear rgb) -------------------------------------------------------------------------------------
const HAIR = ['#2b2320', '#4a3326', '#7a5232', '#b88a52', '#d9c08a', '#8c3b2a', '#3a3f52', '#5b4a6e', '#e8e1d6'].map(lin);
const ELDER_HAIR = ['#cfcac2', '#e8e4dc', '#9c968f', '#b7b0a6'].map(lin);
const LOOKS = {
  apprentice: { body: 0, robe: ['#1c1d24', '#23212b', '#1f2533', '#2a2026'], hat: 'robe', trim: ['#c9a24f', '#a33a35', '#e7e0d0', '#5a7fb5'] },
  traveller: { body: 1, robe: ['#4b2e6b', '#2f3f73', '#6b2638', '#2f5a48', '#5c4f86', '#7a5a2e', '#e3ddd0'], hat: 'robe', trim: ['#d6b35f', '#eee6d2', '#b9473c', '#5d8fc2'] },
  elder: { body: 2, robe: ['#202a4a', '#3b2a4f', '#2b3a3a', '#4a2b2b'], hat: 'robe', trim: ['#d8b866', '#c8c2d8'], hair: ELDER_HAIR },
};
function costume(kind) {
  const L = LOOKS[kind];
  const robe = lin(pick(L.robe));
  const hat = Math.random() < 0.8 ? robe.map((v) => v * rnd(0.85, 1.1)) : lin(pick(L.robe));
  return [robe, hat, pick(L.hair || HAIR), lin(pick(L.trim))];
}

export function createCityLife(G, root, tier) {
  const dens = (G.quality?.density ?? 1) * (G.quality?.name === 'low' ? 0.7 : 1);
  const N = (k) => Math.max(1, Math.round(k * dens));
  const st = { F: { x: CITY.x, z: CITY.z, y: CITY.y + 40, yaw: 0, speed: 0, cyaw: 0 }, phase: 'wait', plan: null, bodies: null, pool: null, flyers: [], crowds: null, time: 0, keep: [], keepT: 0, escorts: 0, escortCd: 4, err: null, hv: new THREE.Vector3(), lastP: new THREE.Vector3(), hasLast: false, trails: null, ms: 0 };
  const group = new THREE.Group(); group.name = 'city-life'; root.add(group);
  const _cd = new THREE.Vector3(), cam = new THREE.Vector3(), _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sp = new THREE.Sphere(new THREE.Vector3(), 2.2);
  const scratch = []; // control points (flat xyz), reused

  // phones (docs/api/perf.md "Phone memory, round 2"): a minute beyond FAR_GO m from the city, the baked bodies, their
  // pools, the trails and the crowds go (~40 MB of geometry + its GPU buffers and the bone textures); back within
  // 1500 m they are baked again. st.gen counts it (builders/mage-folk.js drops its own pool of these bodies too).
  const FAR_GO = 2000, FAR_GO_S = 60;
  let farT = 0;
  st.gen = 0;
  function unload() {
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const b of st.bodies || []) b?.tex?.dispose?.();
    group.clear();
    Object.assign(st, { phase: 'wait', plan: null, bodies: null, pool: null, flyers: [], crowds: null, trails: null, keep: [], hasLast: false });
    st.gen++;
  }

  async function load() {
    st.phase = 'loading';
    try {
      const plan = buildCityPlan(G);
      if (!plan) { st.phase = 'wait'; return; }
      st.plan = plan;
      const bodies = [];
      for (const id of BODIES) {
        let b = null;
        try { b = await bakeHumanoid(G, id); } catch (e) { G.reportError?.('life:city:bake:' + id, e); }
        bodies.push(b);
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!bodies[0] && !bodies[1] && !bodies[2]) { st.phase = 'off'; return; }
      st.bodies = bodies;
      st.pool = createBodyPool(group, bodies, tier);
      const pp = G.player?.pos;
      if (pp && Math.hypot(pp.x - plan.cx, pp.z - plan.cz) < plan.R + 500) { st.F.x = pp.x; st.F.z = pp.z; }
      st.trails = makeTrails(group, 120);
      spawnFlyers();
      try { st.crowds = createCityCrowds(G, st, tier, dens); } catch (e) { G.reportError?.('life:city:crowds', e); }
      st.phase = 'live';
    } catch (e) { st.err = e; st.phase = 'off'; G.reportError?.('life:city', e); }
  }

  // ---- flyers ------------------------------------------------------------------------------------------------------
  function newFlyer(role, kind) {
    const bodyOk = (b) => !!st.bodies[b];
    const r = Math.random();
    let look = kind || (r < 0.36 ? 'apprentice' : r < 0.86 ? 'traveller' : 'elder');
    if (!bodyOk(LOOKS[look].body)) look = bodyOk(0) ? 'apprentice' : bodyOk(1) ? 'traveller' : 'elder';
    const a = {
      role, look, body: LOOKS[look].body, pal: costume(look), flags: Math.random() < 0.12 ? 1 : 0, flutter: 0, seed: Math.random(),
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0, scale: rnd(0.96, 1.04), s: 0, sT: 1,
      clip: 'ride', clipT: rnd(0, 3), prev: null, prevT: 0, fade: 1,
      mode: 'fly', leg: '', t: 0, v: 12, vT: 12, sp: 0,
      path: new Float32Array(MAXP * 3), cum: new Float32Array(MAXP), np: 0, len: 0, seg: 0, pathLoop: false,
      ox: 0, oy: 0, oz: 0, perch: null, target: null, waveCd: rnd(2, 10), yawRate: 0, loopYaw: null, loopT: 0,
      hidden: false, hideT: 0, lane: null, laneOff: [rnd(-4, 4), rnd(-3, 3), rnd(-4, 4)], spire: null, escortT: 0, side: 1, lead: null, slot: null,
      dist: 1e9, laps: 0, flySpeed: rnd(11, 16),
    };
    if (role === 'delivery') { a.flags |= 2; a.flySpeed = rnd(14, 17); }
    if (role === 'trio') { a.look = 'apprentice'; }
    st.flyers.push(a);
    return a;
  }
  function spawnFlyers() {
    const P = st.plan;
    const roles = [['local', N(40)], ['lane', N(28)], ['looper', N(2)], ['hop', N(22)], ['delivery', N(3)], ['circle', N(8)], ['commute', N(10)]];
    for (const [role, n] of roles) for (let i = 0; i < n; i++) {
      const a = newFlyer(role, role === 'circle' && Math.random() < 0.4 ? 'elder' : null);
      if ((role === 'hop' || role === 'delivery') && P.perches.length) { const p = freePerch(a, null); if (p) { placePerched(a, p); a.t = rnd(0, 14); continue; } }
      // start mid-air somewhere sensible
      let lane = pick(P.lanes), q = lane[Math.floor(Math.random() * lane.length)];
      for (let k = 0; k < 6 && dF(q.x, q.z) > 200; k++) { lane = pick(P.lanes); q = lane[Math.floor(Math.random() * lane.length)]; }
      a.x = q.x + a.laneOff[0]; a.y = q.y + a.laneOff[1]; a.z = q.z + a.laneOff[2]; a.yaw = rnd(0, TAU);
      if (role === 'commute' && Math.random() < 0.5) { a.hidden = true; a.hideT = rnd(0, 20); a.mode = 'gone'; continue; }
      nextLeg(a);
    }
    // the trio over the practice field
    if (st.bodies[0]) {
      const lead = newFlyer('trio', 'apprentice');
      lead.flySpeed = 11;
      for (let k = 0; k < 2; k++) { const f = newFlyer('trio', 'apprentice'); f.lead = lead; f.slot = k ? 1 : -1; f.flySpeed = 11; }
      lead.x = P.practice.x; lead.y = P.practice.y + 24; lead.z = P.practice.z;
      legTrio(lead);
      for (const f of st.flyers) if (f.lead === lead) { f.x = lead.x; f.y = lead.y; f.z = lead.z; }
    }
  }

  // ---- paths ------------------------------------------------------------------------------------------------------
  function ctrlStart(a, ahead) {
    scratch.length = 0;
    const hx = Math.sin(a.yaw) * Math.cos(a.pitch), hz = Math.cos(a.yaw) * Math.cos(a.pitch), hy = -Math.sin(a.pitch);
    scratch.push(a.x, a.y, a.z, a.x + hx * ahead, a.y + hy * ahead * 0.5, a.z + hz * ahead);
  }
  const add = (x, y, z) => scratch.push(x, y, z);
  /** Catmull-Rom through the scratch control points into the flyer's path buffer. */
  function commit(a, loop = false) {
    const c = scratch, n = c.length / 3;
    let k = 0;
    const P = a.path;
    const get = (i, o) => { if (loop) i = ((i % n) + n) % n; else i = Math.max(0, Math.min(n - 1, i)); return c[i * 3 + o]; };
    const segs = loop ? n : n - 1;
    let budget = MAXP - 2;
    for (let i = 0; i < segs && k < MAXP - 1; i++) {
      const dx = get(i + 1, 0) - get(i, 0), dy = get(i + 1, 1) - get(i, 1), dz = get(i + 1, 2) - get(i, 2);
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const left = segs - i;
      const m = Math.max(1, Math.min(10, Math.ceil(L / 5), Math.floor(budget / left)));
      for (let s = 0; s < m && k < MAXP - 1; s++) {
        const t = s / m, t2 = t * t, t3 = t2 * t;
        for (let o = 0; o < 3; o++) {
          const p0 = get(i - 1, o), p1 = get(i, o), p2 = get(i + 1, o), p3 = get(i + 2, o);
          P[k * 3 + o] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        }
        k++; budget--;
      }
    }
    const last = loop ? 0 : n - 1;
    P[k * 3] = get(last, 0); P[k * 3 + 1] = get(last, 1); P[k * 3 + 2] = get(last, 2); k++;
    a.np = k; a.cum[0] = 0;
    for (let i = 1; i < k; i++) a.cum[i] = a.cum[i - 1] + Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], P[i * 3 + 2] - P[i * 3 - 1]);
    a.len = a.cum[k - 1]; a.sp = 0; a.seg = 0; a.pathLoop = loop;
    liftPath(a);
  }
  /** raise path samples that would scrape a roof / tower (not the last metres into a balcony, not inside the gate arch) */
  function liftPath(a) {
    const P = st.plan, A = a.path, n = a.np, g = P.gate;
    const endKeep = a.leg === 'hop' ? 9 : 0, startKeep = a.mode === 'perch' || a.mode === 'takeoff' ? 4 : 0;
    let moved = false;
    for (let i = 0; i < n; i++) {
      if (a.cum[i] < startKeep || a.cum[i] > a.len - endKeep) continue;
      const x = A[i * 3], z = A[i * 3 + 2];
      if (a.gate && Math.hypot(x - g.x, z - g.z) < g.depth + 30) continue;
      const need = a.trusted && a.leg === 'lane' ? P.rawTop(x, z) + 2 : P.skyAt(x, z) + 4.5;
      if (A[i * 3 + 1] < need) { A[i * 3 + 1] = need; moved = true; }
    }
    if (!moved) return;
    // smooth the lifted bumps (two passes of a 3-tap max-preserving blur)
    for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n - 1; i++) {
      if (a.cum[i] < startKeep || a.cum[i] > a.len - endKeep) continue;
      const m = (A[i * 3 - 2] + A[i * 3 + 1] * 2 + A[i * 3 + 4]) / 4;
      if (m > A[i * 3 + 1]) A[i * 3 + 1] = m;
    }
    for (let i = 1; i < n; i++) a.cum[i] = a.cum[i - 1] + Math.hypot(A[i * 3] - A[i * 3 - 3], A[i * 3 + 1] - A[i * 3 - 2], A[i * 3 + 2] - A[i * 3 - 1]);
    a.len = a.cum[n - 1];
  }
  const _pp = { x: 0, y: 0, z: 0 };
  function at(a, s, out) {
    const n = a.np;
    if (n < 2) { out.x = a.x; out.y = a.y; out.z = a.z; return out; }
    if (a.pathLoop) s = ((s % a.len) + a.len) % a.len; else s = Math.max(0, Math.min(a.len, s));
    let i = a.seg;
    if (a.cum[i] > s) i = 0;
    while (i < n - 2 && a.cum[i + 1] < s) i++;
    const L = a.cum[i + 1] - a.cum[i] || 1, f = (s - a.cum[i]) / L, P = a.path;
    out.x = P[i * 3] + (P[i * 3 + 3] - P[i * 3]) * f; out.y = P[i * 3 + 1] + (P[i * 3 + 4] - P[i * 3 + 1]) * f; out.z = P[i * 3 + 2] + (P[i * 3 + 5] - P[i * 3 + 2]) * f;
    return out;
  }
  function segAdvance(a) { const n = a.np; let s = a.pathLoop ? ((a.sp % a.len) + a.len) % a.len : a.sp; if (a.cum[a.seg] > s) a.seg = 0; while (a.seg < n - 2 && a.cum[a.seg + 1] < s) a.seg++; }
  /** a point above the roofs (and out of the story zones) near (x, z) */
  function airY(x, z, want) { return Math.max(want, st.plan.skyAt(x, z) + 6); }
  function liftOver(ax, ay, az, bx, by, bz) {
    // raise the middle of a straight hop until it clears everything between (ends excluded: they are at balconies)
    const m = st.plan.clearance(ax, ay, az, bx, by, bz, 0.18, 0.82);
    return m > -3 ? m + 3 : 0;
  }

  // ---- legs ---------------------------------------------------------------------------------------------------------
  /** far from where the heroine is (the focus): the next leg heads back towards her part of the city */
  const farOff = (a) => Math.hypot(a.x - st.F.x, a.z - st.F.z) > 230;
  const dF = (x, z) => Math.hypot(x - st.F.x, z - st.F.z);
  function nextLeg(a) {
    const P = st.plan;
    a.loopYaw = null; a.gate = false;
    const r = Math.random();
    switch (a.role) {
      case 'hop': case 'delivery':
        if (P.perches.length && r < 0.88 && legHop(a)) return;
        return legLane(a);
      case 'circle':
        if (P.spires.length && r < 0.65) return legCircle(a);
        return legLane(a);
      case 'commute':
        if (a.leg === 'in') { if (P.perches.length && r < 0.5 && legHop(a)) return; return legLane(a); }
        return legOut(a);
      case 'looper':
        if (r < 0.45 && legLoop(a)) return;
        return legLane(a);
      case 'trio':
        if (!a.lead) return legTrio(a);
        return;
      case 'local':
        if (r < 0.12 && P.perches.length && legHop(a)) return;
        return legLocal(a);
      default:
        if (r < 0.08 && P.spires.length) return legCircle(a);
        if (r < 0.16 && legSwoop(a)) return;
        if (r < 0.24 && P.perches.length && legHop(a)) return;
        return legLane(a);
    }
  }
  function legLane(a) {
    const P = st.plan;
    if (!P.lanes.length) return legCircle(a);
    // the lane nearest ahead of her, joined at its closest point, flown for a stretch (closed lanes: up to a lap)
    let best = null, bi = 0, bd = 1e18;
    const far = farOff(a), gateShut = st.keep.some((k) => k.id === 'gate');
    for (const l of P.lanes) for (let i = 0; i < l.length; i++) {
      if (l.gate && gateShut) break;
      const p = l[i], dx = p.x - a.x, dz = p.z - a.z, d = dx * dx + dz * dz + (p.y - a.y) ** 2 * 4;
      const ahead = dx * Math.sin(a.yaw) + dz * Math.cos(a.yaw);
      const sc = (far ? dF(p.x, p.z) ** 2 * 3 + d * 0.3 : d * (ahead < 0 ? 2.5 : 1) + dF(p.x, p.z) ** 2 * 0.15) * rnd(0.6, 1.4) + ((p.y - st.F.y) * 4) ** 2;
      if (sc < bd && d > 100) { bd = sc; best = l; bi = i; }
    }
    if (!best) best = pick(P.lanes);
    const closed = best.length > 3 && Math.hypot(best[0].x - best[best.length - 1].x, best[0].z - best[best.length - 1].z) < 1;
    const n = closed ? best.length - 1 : best.length;
    let dir = Math.random() < 0.5 ? 1 : -1;
    if (!closed) dir = bi < n / 2 ? 1 : -1;
    ctrlStart(a, 10);
    // spread across the lane's width (both ways, a little above / below its height), a stretch of 200-450 m
    const w = Math.min(1, (best.width || 10) / 10), o = a.laneOff, cap = rnd(200, 450);
    let run = 0, px = a.x, pz = a.z;
    for (let k = 0, i = bi; k < n * 2 && run < cap; k++, i += dir) {
      if (!closed && (i < 0 || i >= n)) break;
      const p = best[((i % n) + n) % n];
      const x = p.x + o[0] * w * 0.8, z = p.z + o[2] * w * 0.8;
      add(x, best.trusted ? p.y + o[1] * w * 0.6 : Math.max(p.y + o[1], P.skyAt(x, z) + 5), z);
      run += Math.hypot(x - px, z - pz); px = x; pz = z;
    }
    a.leg = 'lane'; a.vT = best.trusted && best.width < 12 ? Math.min(a.flySpeed, 12) : a.flySpeed; a.mode = 'fly'; a.trusted = !!best.trusted;
    a.gate = !!best.gate;
    commit(a);
  }
  /** the sky round the heroine: a few waypoints within ~130 m of her at about her height (always clear of the roofs),
   *  and now and then a fly-by that crosses her path 12-20 m ahead of her */
  function legLocal(a) {
    const P = st.plan, F = st.F;
    // round where she will be (ahead of her when she flies), a little towards the town
    // (and mostly in front of the camera, so the sky she looks at is the busy one)
    const lead = F.speed > 4 ? Math.min(120, F.speed * 5) : 0, look = Math.random() < 0.75 ? 55 : 0;
    const fx0 = F.x + Math.sin(F.yaw) * lead + Math.sin(F.cyaw) * look, fz0 = F.z + Math.cos(F.yaw) * lead + Math.cos(F.cyaw) * look;
    const cx = fx0 + (P.cx - fx0) * 0.25, cz = fz0 + (P.cz - fz0) * 0.25, hy = Math.max(P.ground + 22, F.y);
    ctrlStart(a, 10);
    if (Math.random() < 0.3 && Math.hypot(a.x - F.x, a.z - F.z) > 50 && !inKeepOut(st.keep, F.x, F.y, F.z, 25)) {
      const fx = Math.sin(F.yaw), fz = Math.cos(F.yaw), ahead = F.speed > 3 ? rnd(25, 45) : rnd(12, 20);
      const px = F.x + fx * ahead, pz = F.z + fz * ahead, py = Math.max(P.skyAt(px, pz) + 5, F.y + rnd(-3, 5));
      // in from her side, across, out the other side
      const sx = a.x - px, sz = a.z - pz, sl = Math.hypot(sx, sz) || 1;
      add(px + (sx / sl) * 30, airY(px + (sx / sl) * 30, pz + (sz / sl) * 30, py + 3), pz + (sz / sl) * 30);
      add(px, py, pz);
      add(px - (sx / sl) * 70, airY(px - (sx / sl) * 70, pz - (sz / sl) * 70, py + rnd(-4, 8)), pz - (sz / sl) * 70);
      a.leg = 'flyby'; a.vT = a.flySpeed * 1.15;
    } else {
      const k = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < k; i++) {
        const ang = rnd(0, TAU), r = rnd(15, 95);
        let x = cx + Math.sin(ang) * r, z = cz + Math.cos(ang) * r;
        const dc = Math.hypot(x - P.cx, z - P.cz);
        if (dc > P.R * 0.92) { x = P.cx + ((x - P.cx) * P.R * 0.92) / dc; z = P.cz + ((z - P.cz) * P.R * 0.92) / dc; }
        // never through a story zone: push the waypoint out of it
        const y = airY(x, z, hy + rnd(-8, 26)), k = inKeepOut(st.keep, x, y, z, 10);
        if (k) { const dx = x - k.x, dz = z - k.z, dl = Math.hypot(dx, dz) || 1; x = k.x + (dx / dl) * (k.r + 14); z = k.z + (dz / dl) * (k.r + 14); }
        add(x, airY(x, z, y), z);
      }
      a.leg = 'local'; a.vT = a.flySpeed;
    }
    a.mode = 'fly';
    commit(a);
  }
  function legCircle(a) {
    const P = st.plan;
    let sp = pick(P.spires);
    for (let k = 0; k < 4 && sp && dF(sp.x, sp.z) > 200; k++) sp = pick(P.spires);
    sp ||= { x: P.cx, z: P.cz, top: P.ground + 50, r: 6 };
    const rad = sp.r + rnd(7, 16), y0 = sp.top + rnd(-8, 5), dir = Math.random() < 0.5 ? 1 : -1, laps = rnd(1, 2.4);
    const a0 = Math.atan2(a.x - sp.x, a.z - sp.z);
    ctrlStart(a, 8);
    const k = Math.ceil(laps * 10);
    for (let i = 1; i <= k; i++) {
      const ang = a0 + dir * (i / 10) * TAU, y = y0 + Math.sin(i * 0.7) * 2.5;
      const x = sp.x + Math.sin(ang) * rad, z = sp.z + Math.cos(ang) * rad;
      add(x, airY(x, z, y), z);
    }
    a.leg = 'circle'; a.spire = sp; a.vT = a.flySpeed * 0.8; a.mode = 'fly';
    commit(a);
  }
  function legSwoop(a) {
    const P = st.plan;
    const sq = P.squares.length ? pick(P.squares) : null;
    if (!sq) return false;
    const g = G.world.groundAt(sq.x, sq.z), dx = sq.x - a.x, dz = sq.z - a.z, d = Math.hypot(dx, dz) || 1;
    if (d < 30 || d > 220) return false;
    const ux = dx / d, uz = dz / d;
    ctrlStart(a, 10);
    add(sq.x - ux * 30, airY(sq.x - ux * 30, sq.z - uz * 30, g + 16), sq.z - uz * 30);
    add(sq.x, Math.max(g + 6, P.skyAt(sq.x, sq.z) + 3), sq.z);
    add(sq.x + ux * 30, airY(sq.x + ux * 30, sq.z + uz * 30, g + 18), sq.z + uz * 30);
    add(sq.x + ux * 60, airY(sq.x + ux * 60, sq.z + uz * 60, g + 34), sq.z + uz * 60);
    a.leg = 'swoop'; a.vT = a.flySpeed * 1.1; a.mode = 'fly';
    commit(a);
    return true;
  }
  function legLoop(a) {
    const P = st.plan;
    const hx = Math.sin(a.yaw), hz = Math.cos(a.yaw), R = 7;
    const cx = a.x + hx * 26, cz = a.z + hz * 26, cy = a.y + R;
    if (P.clearance(a.x, a.y - 2, a.z, a.x + hx * 50, a.y - 2, a.z + hz * 50) > -6) return false;
    scratch.length = 0;
    add(a.x, a.y, a.z); add(a.x + hx * 14, a.y, a.z + hz * 14);
    for (let i = 0; i <= 8; i++) { const t = (i / 8) * TAU; add(cx + hx * Math.sin(t) * R, cy - Math.cos(t) * R, cz + hz * Math.sin(t) * R); }
    add(a.x + hx * 40, a.y, a.z + hz * 40); add(a.x + hx * 56, a.y + 1, a.z + hz * 56);
    a.leg = 'loop'; a.loopYaw = a.yaw; a.vT = a.flySpeed; a.mode = 'fly';
    commit(a);
    return true;
  }
  function legOut(a) {
    const P = st.plan;
    const ang = Math.atan2(a.x - P.cx, a.z - P.cz) + rnd(-0.6, 0.6), far = P.R + rnd(260, 420);
    ctrlStart(a, 12);
    const wx = P.cx + Math.sin(ang) * (P.R + 10), wz = P.cz + Math.cos(ang) * (P.R + 10);
    add(wx, airY(wx, wz, a.y + 8), wz);
    add(P.cx + Math.sin(ang) * far, P.ground + rnd(45, 90), P.cz + Math.cos(ang) * far);
    a.leg = 'out'; a.vT = a.flySpeed * 1.15; a.mode = 'fly';
    commit(a);
  }
  function legIn(a) {
    const P = st.plan, g = P.gate;
    a.pal = costume(a.look); a.flags = (Math.random() < 0.12 ? 1 : 0);
    const viaGate = Math.random() < 0.45 && !inKeepOut(st.keep, g.x, g.y + 5, g.z, 30);
    scratch.length = 0;
    if (viaGate) {
      // in from the road side, low and steady through the middle of the arch, then up into the lanes
      const fx = Math.sin(g.face), fz = Math.cos(g.face), hy = g.y + Math.min(g.h * 0.5, Math.max(3, g.h - 4));
      add(g.x + fx * 330, g.y + 30, g.z + fz * 330);
      add(g.x + fx * 120, hy + 8, g.z + fz * 120);
      add(g.x + fx * (g.depth + 18), hy, g.z + fz * (g.depth + 18));
      add(g.x + fx * (g.depth * 0.5), hy, g.z + fz * (g.depth * 0.5));
      add(g.x - fx * (g.depth + 14), hy + 1, g.z - fz * (g.depth + 14));
      const ix = g.x - fx * (g.depth + 60), iz = g.z - fz * (g.depth + 60);
      add(ix, airY(ix, iz, hy + 18), iz);
      a.leg = 'in'; a.vT = 9; a.gate = true;
    } else {
      // when she is out on the approach, half the commuters come in past her (alongside, a little apart)
      const hd = Math.hypot(st.F.x - P.cx, st.F.z - P.cz), hAng = Math.atan2(st.F.x - P.cx, st.F.z - P.cz);
      const along = hd > P.R && Math.random() < 0.6;
      const ang = along ? hAng + rnd(-0.35, 0.35) : rnd(0, TAU), far = along ? Math.max(P.R + 200, hd + rnd(-60, 200)) : P.R + rnd(300, 420);
      add(P.cx + Math.sin(ang) * far, P.ground + rnd(50, 95), P.cz + Math.cos(ang) * far);
      const wx = P.cx + Math.sin(ang) * (P.R + 20), wz = P.cz + Math.cos(ang) * (P.R + 20);
      add(wx, airY(wx, wz, P.ground + rnd(35, 60)), wz);
      const ix = P.cx + Math.sin(ang) * P.R * 0.5, iz = P.cz + Math.cos(ang) * P.R * 0.5;
      add(ix, airY(ix, iz, P.ground + rnd(30, 50)), iz);
      a.leg = 'in'; a.vT = a.flySpeed * 1.1; a.gate = false;
    }
    a.x = scratch[0]; a.y = scratch[1]; a.z = scratch[2];
    a.yaw = Math.atan2(scratch[3] - scratch[0], scratch[5] - scratch[2]); a.pitch = 0; a.bank = 0;
    a.mode = 'fly'; a.hidden = false; a.s = 0;
    commit(a);
  }
  function legTrio(a) {
    const P = st.plan, c = P.practice, y = c.y + 24;
    scratch.length = 0;
    // a lazy figure-eight over the field
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * TAU;
      add(c.x + Math.sin(t) * 34, y + Math.sin(t * 2) * 3, c.z + Math.sin(t) * Math.cos(t) * 26);
    }
    a.leg = 'trio'; a.vT = 11; a.mode = 'fly';
    commit(a, true);
    a.sp = 0;
  }

  // ---- perches (balconies) ---------------------------------------------------------------------------------------
  function perchOk(p, a) {
    if (p.busy >= (p.kind === 'pad' ? 3 : 2) || p.claim > st.time) return false;
    if (inKeepOut(st.keep, p.x, p.y, p.z, 6)) return false;
    if (a && p === a.perch) return false;
    return true;
  }
  function freePerch(a, from) {
    const P = st.plan, far = from && farOff(a);
    for (let k = 0; k < 40; k++) {
      const p = pick(P.perches);
      if (!perchOk(p, a)) continue;
      if (far) { if (dF(p.x, p.z) > 170 && k < 32) continue; }
      else if (from) {
        const d = Math.hypot(p.x - from.x, p.z - from.z), lo = a.role === 'delivery' ? 40 : 14, hi = a.role === 'delivery' ? 200 : 110;
        if (d < lo || d > hi) continue;
        if (k < 24 && dF(p.x, p.z) > 160 && Math.random() < 0.7) continue; // hop towards her part of town
      }
      return p;
    }
    return null;
  }
  /** standing spot `slot` (0 middle, 1 / 2 to the sides) on a perch, 0.35 m in from the rail */
  function slotPos(p, slot, out) {
    const off = slot === 0 ? 0 : slot === 1 ? 0.95 : -0.95, k = Math.min(1, p.w / 2.4);
    out.x = p.x - Math.sin(p.face) * 0.35 + Math.cos(p.face) * off * k; out.z = p.z - Math.cos(p.face) * 0.35 - Math.sin(p.face) * off * k;
    return out;
  }
  function standAt(a, p) {
    slotPos(p, a.slotK || 0, _p);
    a.x = _p.x; a.z = _p.z; a.y = p.y;
    a.yaw = p.face + rnd(-0.5, 0.5); a.pitch = 0; a.bank = 0;
    a.mode = 'perch'; a.t = rnd(6, 20); a.leg = 'perch'; a.ox = a.oy = a.oz = 0;
    p.lastWitch = a;
    setClip(a, pick(['idle', 'talk', 'rail', 'rail', 'listen']));
  }
  function placePerched(a, p) { a.perch = p; a.slotK = Math.min(2, p.busy); p.busy++; standAt(a, p); }
  function legHop(a) {
    const from = a.mode === 'perch' && a.perch ? a.perch : { x: a.x, z: a.z };
    const p = freePerch(a, from);
    if (!p) return false;
    const P = st.plan, fx = Math.sin(p.face), fz = Math.cos(p.face);
    // approach: out over the canyon in front of the balcony, then glide in and hover above the floor
    const ex = p.x + fx * 7, ez = p.z + fz * 7, ey = p.y + SEAT + 2.4;
    const ax = p.x + fx * 1.6, az = p.z + fz * 1.6, ay = p.y + SEAT + 0.55;
    const fromPerch = a.mode === 'perch';
    if (fromPerch && a.perch) a.yaw = a.perch.face;
    const lift = fromPerch ? SEAT + 0.1 : 0;
    a.baseY = a.y; a.y += lift;
    ctrlStart(a, fromPerch ? 5 : 10);
    a.y -= lift;
    const slot = Math.min(2, p.busy);
    slotPos(p, slot, _q);
    const sx = scratch[3], sy = scratch[4], sz = scratch[5];
    const mx = (sx + ex) / 2, mz = (sz + ez) / 2, d = Math.hypot(ex - sx, ez - sz);
    let my = Math.max(sy, ey) + 2 + d * 0.1;
    my += liftOver(sx, my, sz, ex, my, ez);
    add(mx, my, mz); add(ex, ey, ez); add(ax, ay, az); add(_q.x, p.y + SEAT + 0.42, _q.z);
    if (a.perch) { a.perch.busy = Math.max(0, a.perch.busy - 1); a.perch = null; }
    a.target = p; a.slotK = slot; p.busy++;
    a.leg = 'hop'; a.vT = a.role === 'delivery' ? a.flySpeed : rnd(9, 12); a.mode = a.mode === 'perch' ? 'takeoff' : 'fly'; a.t = 0;
    commit(a);
    if (a.mode === 'takeoff') setClip(a, 'mount');
    return true;
  }
  function abortHop(a) {
    if (a.target) { a.target.busy = Math.max(0, a.target.busy - 1); a.target = null; }
    a.mode = 'fly';
    if (!legHop(a)) legLane(a);
  }

  function setClip(a, c) {
    if (a.clip === c) return;
    a.prev = a.clip; a.prevT = a.clipT; a.clip = c; a.clipT = 0; a.fade = 0;
  }

  // ---- per-frame ------------------------------------------------------------------------------------------------------
  const _p = { x: 0, y: 0, z: 0 }, _q = { x: 0, y: 0, z: 0 };
  function stepFlyer(a, dt, H) {
    const P = st.plan;
    if (a.mode === 'gone') {
      a.hideT -= dt;
      if (a.hideT <= 0) {
        if (a.role === 'commute' && !a.perch) legIn(a);
        else if (a.perch) {
          if (a.perch.claim > st.time || inKeepOut(st.keep, a.perch.x, a.perch.y, a.perch.z, 4)) { a.hideT = 5; return; }
          standAt(a, a.perch); a.hidden = false; a.s = 0;
        } else { a.hidden = false; nextLeg(a); }
      }
      return;
    }
    a.waveCd -= dt;
    const hd = Math.hypot(a.x - H.x, a.y - H.y, a.z - H.z);
    a.dist = hd;
    if (a.mode === 'perch') {
      a.t -= dt;
      // the heroine landing here: make room
      const p = a.perch;
      if (p && p.claim > st.time && hd < 9) { a.t = 0; }
      if (hd < 16 && a.waveCd <= 0 && H.mode === 'play') { setClip(a, 'wave'); a.waveCd = rnd(20, 35); a.t = Math.max(a.t, 2); }
      if (a.clip === 'wave' && a.clipT > 1.6) setClip(a, pick(['idle', 'talk', 'rail']));
      if (hd < 18) a.yaw += angDiff(a.yaw, Math.atan2(H.x - a.x, H.z - a.z)) * Math.min(1, dt * 1.5) * 0.6;
      if (a.t <= 0) {
        if (p && p.claim <= st.time && Math.random() < 0.3 && p.kind !== 'roof') {
          // step inside for a while
          a.mode = 'inside'; a.t = 1.6; setClip(a, 'walk'); a.yaw = p.face + Math.PI;
        } else if (!legHop(a)) a.t = rnd(4, 9);
      }
      return;
    }
    if (a.mode === 'inside') {
      a.t -= dt;
      a.x += Math.sin(a.yaw) * 0.8 * dt; a.z += Math.cos(a.yaw) * 0.8 * dt;
      a.sT = 0;
      if (a.t <= 0 && a.s < 0.02) { a.mode = 'gone'; a.hidden = true; a.hideT = rnd(10, 30); }
      return;
    }
    if (a.mode === 'takeoff') {
      a.t += dt;
      a.y = a.baseY + Math.min(SEAT + 0.1, a.t * 0.8);
      if (a.t > 0.7) { a.mode = 'fly'; setClip(a, 'ride'); a.v = 3; }
      at(a, 0, _p); a.yaw += angDiff(a.yaw, Math.atan2(a.path[6] - a.path[0], a.path[8] - a.path[2])) * Math.min(1, dt * 3);
      return;
    }
    if (a.mode === 'land') {
      a.t += dt;
      const p = a.target, k = Math.min(1, a.t / 0.7);
      a.y = p.y + (a.landY0 - p.y) * (1 - k * k * (3 - 2 * k));
      a.pitch *= 0.9; a.bank *= 0.9;
      if (a.t > 0.75) { a.target = null; a.perch = p; standAt(a, p); }
      return;
    }
    if (a.mode === 'escort') return stepEscort(a, dt, H);
    // ---- flying along the path
    const lead = a.lead;
    if (lead) {
      // formation slot: behind and to the side of the leader, in the leader's frame
      const fx = Math.sin(lead.yaw), fz = Math.cos(lead.yaw), rx = -fz, rz = fx;
      const tx = lead.x + rx * a.slot * 3.4 - fx * 3.2, tz = lead.z + rz * a.slot * 3.4 - fz * 3.2, ty = lead.y - 0.8 + Math.sin(st.time * 1.3 + a.slot) * 0.25;
      const k = Math.min(1, dt * 4);
      a.x += (tx - a.x) * k; a.y += (ty - a.y) * k; a.z += (tz - a.z) * k;
      const yr = angDiff(a.yaw, lead.yaw);
      a.yaw += yr * Math.min(1, dt * 5); a.pitch = lead.pitch; a.bank += (lead.bank - a.bank) * Math.min(1, dt * 4);
      a.v = lead.v; a.flutter = lead.flutter;
      if (a.clip !== 'rwave') setClip(a, 'ride');
      return;
    }
    a.v += (a.vT - a.v) * Math.min(1, dt * 1.2);
    // slow down into a balcony
    if (a.leg === 'hop' && a.len - a.sp < 14) a.v = Math.max(2.2, Math.min(a.v, (a.len - a.sp) * 0.8 + 1.5));
    if (a.leg === 'in' && a.gate) a.v = Math.min(a.v, 10);
    a.sp += a.v * dt;
    segAdvance(a);
    at(a, a.sp, _p);
    at(a, a.sp + Math.max(2.5, a.v * 0.4), _q);
    // give way: never through the heroine (or a blast), the offset springs back afterwards
    let tx = 0, ty = 0, tz = 0;
    const dx = _p.x - H.x, dy = _p.y - H.y, dz = _p.z - H.z, d = Math.hypot(dx, dy, dz);
    if (d < 10 && d > 0.01) { const k = (10 - d) * 0.9 / d; tx = dx * k; ty = dy * k * 1.6 + (dy >= 0 ? 1 : -1) * (10 - d) * 0.3; tz = dz * k; }
    for (const th of st.threats || []) {
      const ex = _p.x - th.x, ey = _p.y - th.y, ez = _p.z - th.z, e = Math.hypot(ex, ey, ez), R = th.r * 1.5 + 6;
      if (e < R && e > 0.01) { const k = (R - e) / e; tx += ex * k; ty += Math.abs(ey * k) + 2; tz += ez * k; }
    }
    const ks = Math.min(1, dt * 2.5);
    a.ox += (tx - a.ox) * ks; a.oy += (ty - a.oy) * ks; a.oz += (tz - a.oz) * ks;
    a.x = _p.x + a.ox; a.y = _p.y + a.oy; a.z = _p.z + a.oz;
    // attitude
    const vx = _q.x - _p.x, vy = _q.y - _p.y, vz = _q.z - _p.z, hz = Math.hypot(vx, vz);
    if (a.loopYaw !== null) {
      a.yaw = a.loopYaw;
      const fwd = vx * Math.sin(a.loopYaw) + vz * Math.cos(a.loopYaw);
      a.pitch = -Math.atan2(vy, fwd); a.bank *= 0.9;
    } else {
      const yawT = hz > 0.05 ? Math.atan2(vx, vz) : a.yaw;
      const dy0 = angDiff(a.yaw, yawT) * Math.min(1, dt * 4);
      a.yaw += dy0;
      const yr = dy0 / Math.max(dt, 1e-3);
      a.yawRate += (yr - a.yawRate) * Math.min(1, dt * 4);
      const bankT = Math.max(-0.85, Math.min(0.85, -a.yawRate * a.v * 0.075));
      a.bank += (bankT - a.bank) * Math.min(1, dt * 3);
      const pitchT = Math.max(-0.6, Math.min(0.6, -Math.atan2(vy, Math.max(0.3, hz)) * 0.8));
      a.pitch += (pitchT - a.pitch) * Math.min(1, dt * 3);
    }
    a.flutter = Math.min(1, a.v / 14);
    // clip
    if (a.clip === 'rwave' && a.clipT > 1.65) setClip(a, 'ride');
    if (a.clip !== 'rwave' && a.clip !== 'mount') setClip(a, a.v > 17 ? 'boost' : 'ride');
    if (a.clip === 'mount' && a.clipT > 0.75) setClip(a, 'ride');
    // greet the heroine when she flies close
    if (hd < 18 && a.waveCd <= 0 && H.broom && H.mode === 'play' && a.leg !== 'loop') { setClip(a, 'rwave'); a.waveCd = rnd(22, 40); }
    // fall in beside her for a few seconds
    if (H.broom && H.speed > 7 && hd < 26 && st.escorts < (tier >= 1 ? 2 : 1) && st.escortCd <= 0 && (a.leg === 'lane' || a.leg === 'in' || a.leg === 'circle' || a.leg === 'local') && H.mode === 'play') {
      if (Math.abs(angDiff(a.yaw, H.yaw)) < 0.9 && Math.random() < 0.35) {
        a.mode = 'escort'; a.escortT = rnd(5, 8); st.escorts++; st.escortCd = rnd(12, 22);
        const rx = -Math.cos(H.yaw), rz = Math.sin(H.yaw);
        a.side = ((a.x - H.x) * rx + (a.z - H.z) * rz) >= 0 ? 1 : -1;
        setClip(a, 'rwave'); a.waveCd = 30;
        return;
      } else st.escortCd = 1.5;
    }
    // hop: the balcony was taken (the heroine is landing there): go elsewhere
    if (a.leg === 'hop' && a.target && (a.target.claim > st.time || inKeepOut(st.keep, a.target.x, a.target.y, a.target.z, 4)) && a.len - a.sp > 3) return abortHop(a);
    // end of the path
    if (!a.pathLoop && a.sp >= a.len - 0.05) {
      if (a.leg === 'hop' && a.target) { a.mode = 'land'; a.t = 0; a.landY0 = a.y - a.oy; a.x -= a.ox; a.z -= a.oz; a.ox = a.oy = a.oz = 0; setClip(a, 'dismount'); return; }
      if (a.leg === 'out') { a.mode = 'gone'; a.hidden = true; a.hideT = rnd(4, 18); return; }
      nextLeg(a);
    }
    if (a.leg === 'trio' && a.sp > a.len * 1.0) { a.sp -= a.len; a.seg = 0; }
  }
  function stepEscort(a, dt, H) {
    a.escortT -= dt;
    const fx = Math.sin(H.yaw), fz = Math.cos(H.yaw), rx = -fz, rz = fx;
    const tx = H.x + rx * a.side * 4.3 - fx * 1.0, tz = H.z + rz * a.side * 4.3 - fz * 1.0, ty = H.y + 0.4 + Math.sin(st.time * 1.7) * 0.3;
    // ride along with her; close the gap at most ~10 m/s faster than she flies (a joiner swoops in, it does not teleport)
    const k = Math.min(1, dt * 2.2);
    let cx = (tx - a.x) * k, cy = (ty - a.y) * k, cz = (tz - a.z) * k;
    const cl = Math.hypot(cx, cy, cz), cm = 10 * dt;
    if (cl > cm) { cx *= cm / cl; cy *= cm / cl; cz *= cm / cl; }
    a.x += st.hv.x * dt + cx; a.y += st.hv.y * dt + cy; a.z += st.hv.z * dt + cz;
    const yd = angDiff(a.yaw, H.yaw) * Math.min(1, dt * 3);
    a.yaw += yd; a.yawRate += (yd / Math.max(dt, 1e-3) - a.yawRate) * Math.min(1, dt * 4);
    a.v = Math.hypot(st.hv.x, st.hv.z);
    a.bank += (Math.max(-0.8, Math.min(0.8, -a.yawRate * a.v * 0.075)) - a.bank) * Math.min(1, dt * 3);
    a.pitch += (Math.max(-0.5, Math.min(0.5, -Math.atan2(st.hv.y, Math.max(1, a.v)))) - a.pitch) * Math.min(1, dt * 3);
    a.flutter = Math.min(1, a.v / 14);
    if (a.clip === 'rwave' && a.clipT > 1.65) setClip(a, 'ride');
    if (a.clip !== 'rwave') setClip(a, a.v > 17 ? 'boost' : 'ride');
    const tooFar = Math.hypot(a.x - H.x, a.z - H.z) > 90;
    if (a.escortT <= 0 || !H.broom || tooFar || H.mode !== 'play' || st.plan.skyAt(a.x, a.z) > a.y - 1) {
      // peel off: bank away from her, then back to the lanes
      st.escorts = Math.max(0, st.escorts - 1);
      a.mode = 'fly'; a.yaw += a.side * 0.5; a.v = Math.max(8, a.v); a.ox = a.oy = a.oz = 0;
      legLane(a);
    }
  }

  // ---- update / draw ------------------------------------------------------------------------------------------------
  const H = { x: 0, y: 0, z: 0, yaw: 0, broom: false, speed: 0, mode: 'play' };
  function update(dt, PL, threats) {
    if (!PL) return;
    const t0 = performance.now();
    const dc = Math.hypot(PL.x - CITY.x, PL.z - CITY.z);
    if (st.phase === 'wait') { if (dc < 1500 && G.assets?.clips) load(); return; }
    if (st.phase !== 'live') return;
    st.time += dt;
    if (dc > 1500) {
      st.pool.hide(); st.trails.commit(0); st.crowds?.hide?.();
      if (G.quality?.mobile) { farT = dc > FAR_GO ? farT + dt : 0; if (farT > FAR_GO_S) { farT = 0; unload(); } }
      return;
    }
    farT = 0;
    // heroine
    const pl = G.player;
    H.x = PL.x; H.y = PL.y; H.z = PL.z; H.broom = !!PL.broom; H.mode = G.mode;
    if (st.hasLast && dt > 0) {
      const k = Math.min(1, dt * 6);
      st.hv.x += ((PL.x - st.lastP.x) / dt - st.hv.x) * k; st.hv.y += ((PL.y - st.lastP.y) / dt - st.hv.y) * k; st.hv.z += ((PL.z - st.lastP.z) / dt - st.hv.z) * k;
      if (st.hv.lengthSq() > 3600) st.hv.setLength(60); // teleports
    }
    st.lastP.set(PL.x, PL.y, PL.z); st.hasLast = true;
    H.speed = Math.hypot(st.hv.x, st.hv.z);
    // the focus of the traffic: where she is (while in or near the city), else the centre
    { const P = st.plan, d = Math.hypot(H.x - P.cx, H.z - P.cz); if (d < P.R + 500) { st.F.x = H.x; st.F.z = H.z; st.F.y = H.y; } else { st.F.x = P.cx; st.F.z = P.cz; st.F.y = P.ground + 40; } st.F.yaw = H.yaw; st.F.speed = H.speed; }
    if (G.camera) { G.camera.getWorldDirection(_cd); st.F.cyaw = Math.atan2(_cd.x, _cd.z); }
    H.yaw = H.speed > 2 ? Math.atan2(st.hv.x, st.hv.z) : (pl?.yaw ?? PL.yaw);
    st.threats = threats;
    st.escortCd -= dt;
    // when she flies fast and straight for a while, a witch nearby swoops in to fly beside her for a few seconds
    st.straightT = H.broom && H.speed > 8 && Math.abs(angDiff(st.lastYaw ?? H.yaw, H.yaw)) < 0.02 ? (st.straightT || 0) + dt : 0;
    st.lastYaw = H.yaw;
    if (st.straightT > 3 && st.escortCd <= 0 && st.escorts < (tier >= 1 ? 2 : 1) && G.mode === 'play') {
      let best = null, bd = 70;
      for (const a of st.flyers) {
        if (a.mode !== 'fly' || a.lead || a.role === 'trio' || a.loopYaw !== null || a.s < 0.9 || (a.leg !== 'local' && a.leg !== 'lane' && a.leg !== 'flyby')) continue;
        const d = Math.hypot(a.x - H.x, a.y - H.y, a.z - H.z);
        if (d < bd && d > 8) { bd = d; best = a; }
      }
      if (best) {
        best.mode = 'escort'; best.escortT = rnd(6, 9); st.escorts++; st.escortCd = rnd(14, 24); st.straightT = 0;
        const rx = -Math.cos(H.yaw), rz = Math.sin(H.yaw);
        best.side = ((best.x - H.x) * rx + (best.z - H.z) * rz) >= 0 ? 1 : -1;
        setClip(best, 'rwave'); best.waveCd = 30;
      } else st.escortCd = 2;
    }
    st.keepT -= dt;
    if (st.keepT <= 0) {
      st.keepT = 0.5; activeKeepOut(G, st.plan, st.keep);
      // balconies the heroine is coming down onto (or standing on) are hers
      for (const p of st.plan.perches) {
        const dx = p.x - H.x, dz = p.z - H.z, dh = Math.hypot(dx, dz);
        if (dh < 8 && H.y > p.y - 2 && H.y < p.y + (H.broom ? 14 : 3)) p.claim = st.time + 4;
      }
    }
    for (const a of st.flyers) {
      try { stepFlyer(a, dt, H); } catch (e) { G.reportError?.('life:city:flyer', e); a.mode = 'gone'; a.hidden = true; a.hideT = 30; }
      // visibility: story zones, hidden agents
      let sT = a.hidden || a.mode === 'gone' || a.mode === 'inside' ? 0 : 1;
      if (sT && inKeepOut(st.keep, a.x, a.y, a.z, 3)) sT = 0;
      if (a.leg === 'in' || a.leg === 'out') { const r = Math.hypot(a.x - st.plan.cx, a.z - st.plan.cz) - st.plan.R; if (r > 220) sT = Math.min(sT, Math.max(0, 1 - (r - 220) / 120)); }
      a.sT = sT;
      a.s += Math.sign(a.sT - a.s) * Math.min(Math.abs(a.sT - a.s), dt * 1.6);
      // animation clocks
      const C = st.bodies[a.body]?.clips;
      a.clipT += dt; a.prevT += dt;
      if (a.fade < 1) a.fade = Math.min(1, a.fade + dt * 4);
      if (C && C[a.clip] && !/ride|boost|idle|walk|talk|rail|listen|lookup|jog|carry|call/.test(a.clip)) { /* one-shots clamp */ a.clipT = Math.min(a.clipT, C[a.clip].dur - 0.01); }
    }
    try { st.crowds?.update?.(dt, H, cam); } catch (e) { G.reportError?.('life:city:crowds', e); st.crowds = null; }
    draw();
    st.ms = st.ms * 0.95 + (performance.now() - t0) * 0.05;
  }

  function draw() {
    const camera = G.camera;
    if (!camera) return;
    cam.setFromMatrixPosition(camera.matrixWorld);
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    // a view-only test camera (tools/play.mjs T.viewCam) draws from elsewhere: LOD from there, no frustum cull
    const vc = G.debug?.fixedCam;
    if (vc?.view && vc.pos) { cam.copy(vc.pos); _pm.identity(); _fr.setFromProjectionMatrix(_pm.makeScale(1e-9, 1e-9, 1e-9)); st.viewCam = true; } else st.viewCam = false;
    const pool = st.pool;
    pool.begin(st.time);
    let nt = 0;
    const T = st.trails;
    const lodOf = (d) => st.forceLod ?? pool.lodOf(d); // forceLod: tests
    const visible = (a, d) => {
      if (a.s <= 0.002 || d > 700) return false;
      if (d < 25 || st.viewCam) return true;
      _sp.center.set(a.x, a.y + 0.8, a.z);
      return _fr.intersectsSphere(_sp);
    };
    for (const a of st.flyers) {
      const d = Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z);
      if (!visible(a, d)) continue;
      // readability at distance: a witch in the air 100-300 m out is drawn up to 1.8x larger, so the sky over the city
      // reads as busy instead of a few dark specks (on balconies and while landing she keeps her true size)
      const air = a.mode === 'fly' || a.mode === 'escort';
      const far = air ? Math.min(1, Math.max(0, (d - 90) / 230)) : 0;
      a._boost = 1 + 0.8 * far * far * (3 - 2 * far);
      pool.put(a, lodOf(d));
      // trail from the brush end
      if ((a.mode === 'fly' || a.mode === 'escort') && a.v > 6 && nt < T.cap && d < 320) {
        const fx = Math.sin(a.yaw) * Math.cos(a.pitch), fy = -Math.sin(a.pitch), fz = Math.cos(a.yaw) * Math.cos(a.pitch);
        const bx = a.x - fx * 0.95, by = a.y + 0.4 - fy * 0.95, bz = a.z - fz * 0.95;
        T.set(nt++, bx, by, bz, -fx, -fy, -fz, Math.min(8, a.v * 0.36), 0.32 * a.s * Math.min(1, (a.v - 6) / 6), a.pal[3]);
      }
    }
    st.crowds?.draw?.(pool, cam, _fr, _sp);
    pool.end();
    T.commit(nt);
  }

  return {
    update,
    get phase() { return st.phase; },
    st,
    /** tests: the flyer list (read-only), the city layout */
    get flyers() { return st.flyers; },
    get plan() { return st.plan; },
    get crowds() { return st.crowds; },
    /** tests: start loading now, wherever she is */
    load() { if (st.phase === 'wait') return load(); return Promise.resolve(); },
    clear() { st.pool?.hide(); st.trails?.commit(0); st.crowds?.hide?.(); },
    stats() {
      if (st.phase !== 'live') return { phase: st.phase, err: st.err ? String(st.err) : null };
      const by = {}; let vis = 0;
      for (const a of st.flyers) { by[a.mode] = (by[a.mode] || 0) + 1; if (a.s > 0.01) vis++; }
      return { phase: st.phase, flyers: st.flyers.length, visible: vis, modes: by, escorts: st.escorts, perches: st.plan.perches.length, lanes: st.plan.lanes.length, spires: st.plan.spires.length, streets: st.plan.streets.length, crowd: st.crowds?.stats?.(), draws: st.pool.draws + (st.trails.mesh.count ? 1 : 0), tris: st.pool.tris, ms: +st.ms.toFixed(3), keepOut: st.keep.map((k) => k.id) };
    },
  };
}

// ---- broom trails: one additive streak per fast flyer, ONE draw --------------------------------------------------------
function makeTrails(root, cap) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 0, 1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 1, -1, 0]), 3));
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage); // tail xyz, length
  const iB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage); // dir xyz, alpha
  const iC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage); // colour
  g.setAttribute('iA', iA); g.setAttribute('iB', iB); g.setAttribute('iC', iC);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute vec4 iA; attribute vec4 iB; attribute vec3 iC;
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main() {
        vec3 dir = normalize(iB.xyz);
        vec3 p0 = iA.xyz;
        vec3 toCam = normalize(cameraPosition - p0);
        vec3 side = normalize(cross(dir, toCam));
        float u = position.x, v = position.y;
        // a minimum on-screen width so far-off brooms still draw a fine line across the sky
        float w = max(0.16 * (1.0 - u * 0.75), length(cameraPosition - p0) * 0.003 * (1.0 - u * 0.6));
        vec3 p = p0 + dir * (u * iA.w) + side * (v * w);
        vUv = vec2(u, v); vCol = iC; vA = iB.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vCol; varying float vA;
      void main() {
        float a = vA * (pow(1.0 - vUv.x, 1.6) + 1.6 * exp(-vUv.x * 18.0)) * (1.0 - vUv.y * vUv.y);
        gl_FragColor = vec4(mix(vec3(1.0), vCol, 0.35) * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = 'city-broom-trails';
  root.add(mesh);
  mesh.count = 0;
  return {
    mesh, cap,
    set(i, x, y, z, dx, dy, dz, len, alpha, col) { iA.setXYZW(i, x, y, z, len); iB.setXYZW(i, dx, dy, dz, alpha); iC.setXYZ(i, col[0], col[1], col[2]); },
    commit(n) {
      g.instanceCount = n; mesh.count = n; mesh.visible = n > 0;
      if (!n) return;
      for (const at of [iA, iB, iC]) { at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true; }
    },
  };
}
