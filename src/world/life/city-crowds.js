// Townsfolk of the Land of Mages (citylife round, 2026-11-22), drawn through the same instanced bodies as the flyers.
// Life is up high here: most people stand on the balconies and terraces — leaning on the rail, chatting in pairs,
// calling to a neighbour, waving at a witch going past or turning to talk to one who lands beside them. Down in the
// dim street canyons there are fewer: people browsing at lamp-lit shop fronts and a few walkers (merchants, mages with
// hats, couples, children running). They keep to the street lines (never into a wall cell of the walk grid), step
// aside for the heroine, stop and look up when a broom passes low, and stay out of the story zones; during cutscenes /
// dialogue everyone close to the heroine or the camera fades out.
import * as THREE from 'three';
import { inKeepOut } from './city-flyers-plan.js';
import { CITY_LIFE } from '../../data/city-life.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const HAIR = ['#2b2320', '#4a3326', '#7a5232', '#b88a52', '#d9c08a', '#8c3b2a', '#55463c', '#cfcac2'].map(lin);
const DRESS = ['#c9b48a', '#a8553f', '#6f7f5a', '#5b6f8f', '#8a5a6e', '#d6c7a6', '#7d6450', '#3e5568'].map(lin);
const COAT = ['#5a4636', '#3f4a3c', '#2f3a52', '#6b5a43', '#4a3d48', '#7a6a56'].map(lin);
const TRIM = ['#e8dfcc', '#c9a24f', '#9e3b35', '#3d5f8c', '#f0ebe0'].map(lin);
const ROBE = ['#1f2130', '#3b2a55', '#2a3d63', '#5a2534', '#2e4a3e', '#e2dccf'].map(lin);
const LOOPED = /idle|walk|jog|talk|listen|rail|call|lookup|carry/;

export function createCityCrowds(G, st, tier, dens) {
  const P = st.plan, W = G.world, B = st.bodies;
  const N = (k) => Math.max(1, Math.round(k * dens));
  const folk = [];
  const ok = (b) => !!B[b];
  function look(kind) {
    // returns { body, pal, flags, scale }
    let body, pal, flags = 0, scale = rnd(0.95, 1.04);
    const r = Math.random();
    if (kind === 'kid') {
      body = ok(3) && r < 0.5 ? 3 : 0; scale = rnd(0.68, 0.76); flags = 1;
      pal = [pick(DRESS), pick(DRESS), pick(HAIR), pick(TRIM)];
    } else if (r < 0.34 && ok(3)) { body = 3; pal = [pick(DRESS), pick(DRESS), pick(HAIR), pick(TRIM)]; }
    else if (r < 0.62 && ok(4)) { body = 4; pal = [pick(COAT), pick(COAT), pick(HAIR), pick(TRIM)]; scale = rnd(1.0, 1.06); }
    else { body = ok(1) && r < 0.8 ? 1 : ok(0) ? 0 : 2; const robe = pick(ROBE); pal = [robe, robe.map((v) => v * 0.9), pick(HAIR), pick(TRIM)]; flags = Math.random() < 0.45 ? 1 : 0; }
    if (!ok(body)) body = [0, 1, 2, 3, 4].find(ok);
    return { body, pal, flags, scale };
  }
  function agent(kind, x, y, z, yaw) {
    const L = look(kind);
    const a = { kind, body: L.body, pal: L.pal, flags: L.flags, scale: L.scale, seed: Math.random(), flutter: 0, x, y, z, yaw, pitch: 0, bank: 0, s: 0, sT: 1, clip: 'idle', clipT: rnd(0, 3), prev: null, prevT: 0, fade: 1, t: rnd(2, 10), mode: 'idle', v: 0, lat: 0, latT: 0, street: null, si: 0, dir: 1, ui: 0, chk: rnd(0, 1.5), partner: null, perch: null, home: null, cd: rnd(0, 6), dist: 1e9 };
    folk.push(a);
    return a;
  }
  const setClip = (a, c) => { if (a.clip === c) return; a.prev = a.clip; a.prevT = a.clipT; a.clip = c; a.clipT = 0; a.fade = 0; };
  const groundY = (x, z, y) => W.groundAt(x, z, (y ?? W.heightAt(x, z)) + 0.6);

  // ---- balconies, terraces, bridges and the rampart walk (the busiest place for people)
  const balc = P.perches.filter((p) => p.kind !== 'pad');
  const F = st.F;
  /** a free perch near the focus (where the heroine is), or anywhere when nothing is free near her */
  function nearPerch(lo, hi) {
    let best = null, bd = 1e9;
    for (let k = 0; k < 40; k++) {
      const p = pick(balc);
      if (!p || p.busy > 0 || p.claim > st.time || inKeepOut(st.keep, p.x, p.y, p.z, 5)) continue;
      const d = Math.hypot(p.x - F.x, p.z - F.z);
      if (d < lo) continue;
      // in front of where she is looking first (the balconies she will see)
      // a balcony 20-70 m ahead (high balconies right beside her are above the frame)
      const fw = (p.x - F.x) * Math.sin(F.cyaw) + (p.z - F.z) * Math.cos(F.cyaw);
      const sc = d < hi ? Math.abs(fw - 42) + Math.random() * 40 + (fw < 0 ? 150 : 0) : d + 1e4;
      if (sc < bd) { bd = sc; best = p; }
    }
    return best;
  }
  function seat(a, p, k, pair) {
    const off = k === 0 ? (pair ? 0.55 : 0) : -0.55, kk = Math.min(1, p.w / 2.4);
    const x = p.x - Math.sin(p.face) * 0.4 + Math.cos(p.face) * off * kk, z = p.z - Math.cos(p.face) * 0.4 - Math.sin(p.face) * off * kk;
    a.x = x; a.y = p.y; a.z = z; a.yaw = p.face; a.perch = p; p.busy++; p.folk++;
    a.home = { x, z, y: p.y };
    a.t = rnd(4, 14);
    setClip(a, a.partner ? 'talk' : pick(['rail', 'rail', 'idle', 'call']));
  }
  const nBal = Math.min(N(50), balc.length * 2);
  for (let i = 0; i < nBal;) {
    const p = nearPerch(0, 160);
    if (!p) break;
    const pair = Math.random() < 0.45 && i < nBal - 1;
    const a = agent(Math.random() < 0.12 ? 'kid' : 'adult', 0, 0, 0, 0); a.mode = 'balcony'; i++;
    let b = null;
    if (pair) { b = agent('adult', 0, 0, 0, 0); b.mode = 'balcony'; a.partner = b; b.partner = a; i++; }
    seat(a, p, 0, pair); if (b) seat(b, p, 1, true);
  }
  /** move balcony folk that are far behind her (and out of sight) to free balconies near her */
  function relocate(cam) {
    for (const a of folk) {
      if (a.mode !== 'balcony' || (a.partner && a.partner.relocT === st.time)) continue;
      const dFa = Math.hypot(a.x - F.x, a.z - F.z), behind = (a.x - cam.x) * Math.sin(F.cyaw) + (a.z - cam.z) * Math.cos(F.cyaw) < -15;
      if (dFa < 190 && !(behind && dFa > 45)) continue;
      const b = a.partner;
      // never pop someone the camera can see: only those behind it, or far off
      if (!behind && (Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z) < 110 || (b && Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z) < 110))) continue;
      const p = nearPerch(18, 110);
      if (!p) return;
      for (const q of b ? [a, b] : [a]) { q.perch.busy = Math.max(0, q.perch.busy - 1); q.perch.folk = Math.max(0, q.perch.folk - 1); q.s = 0; q.relocT = st.time; }
      seat(a, p, 0, !!b); if (b) seat(b, p, 1, true);
      return; // one move per tick
    }
  }
  // ---- street walkers and shop-front browsers (few: the canyons are dim)
  const streets = P.streets;
  function streetSpot(near = 0) {
    let best = null;
    for (let k = 0; k < (near ? 40 : 20); k++) {
      const s = pick(streets); if (!s) return null;
      const i = Math.floor(Math.random() * (s.length - 1)), f = Math.random();
      const x = s[i].x + (s[i + 1].x - s[i].x) * f, z = s[i].z + (s[i + 1].z - s[i].z) * f;
      if (P.blocked(x, z) || inKeepOut(st.keep, x, 0, z, 3) || !P.inCity(x, z)) continue;
      if (near) { const d = Math.hypot(x - F.x, z - F.z); if (d < 25 || d > near) continue; }
      best = { s, i, f, x, z };
      break;
    }
    return best;
  }
  function relocateWalker(cam) {
    for (const a of folk) {
      const sBehind = (a.x - cam.x) * Math.sin(F.cyaw) + (a.z - cam.z) * Math.cos(F.cyaw) < -15;
      if (a.mode === 'shop' && !a.vendor && P.shops.length && (Math.hypot(a.x - F.x, a.z - F.z) > 200 || sBehind) && Math.hypot(a.x - cam.x, a.z - cam.z) > 30) {
        for (let k = 0; k < 40; k++) {
          const sh = pick(P.shops), d = Math.hypot(sh.x - F.x, sh.z - F.z);
          const fw = (sh.x - F.x) * Math.sin(F.cyaw) + (sh.z - F.z) * Math.cos(F.cyaw);
          if (d < 15 || d > 110 || fw < 8) continue;
          const x = sh.x + Math.sin(sh.face) * rnd(1.4, 2.4), z = sh.z + Math.cos(sh.face) * rnd(1.4, 2.4);
          if (P.blocked(x, z) || inKeepOut(st.keep, x, 0, z, 3)) continue;
          a.x = x; a.z = z; a.y = groundY(x, z); a.yaw = sh.face + Math.PI; a.home = { x, z, y: a.y }; a.s = 0;
          return;
        }
      }
      if (a.mode !== 'walk' && a.mode !== 'pause') continue;
      if (Math.hypot(a.x - F.x, a.z - F.z) < 200 || Math.hypot(a.x - cam.x, a.z - cam.z) < 90) continue;
      const sp = streetSpot(160);
      if (!sp) return;
      a.street = sp.s; a.si = sp.i; a.ui = sp.f; a.x = sp.x; a.z = sp.z; a.y = groundY(sp.x, sp.z); a.s = 0; a.dir = Math.random() < 0.5 ? 1 : -1;
      return;
    }
  }
  for (let i = 0; i < N(16) && streets.length; i++) {
    const sp = streetSpot(260) || streetSpot(); if (!sp) break;
    const a = agent(Math.random() < 0.18 ? 'kid' : 'adult', sp.x, groundY(sp.x, sp.z), sp.z, 0);
    a.mode = 'walk'; a.street = sp.s; a.si = sp.i; a.dir = Math.random() < 0.5 ? 1 : -1; a.ui = sp.f;
    a.v = a.kind === 'kid' ? rnd(1.9, 2.4) : rnd(0.85, 1.25); a.lat = a.latT = rnd(-1.3, 1.3);
    a.carry = a.kind !== 'kid' && Math.random() < 0.2;
    setClip(a, a.kind === 'kid' ? 'jog' : a.carry ? 'carry' : 'walk');
  }
  const shops = P.shops.length ? P.shops : [];
  for (let i = 0; i < N(14); i++) {
    let x, z, face;
    if (shops.length) { const s = pick(shops); face = s.face; x = s.x + Math.sin(face) * rnd(1.4, 2.4) + Math.cos(face) * rnd(-1.5, 1.5); z = s.z + Math.cos(face) * rnd(1.4, 2.4) - Math.sin(face) * rnd(-1.5, 1.5); }
    else { const sp = streetSpot(); if (!sp) break; x = sp.x; z = sp.z; face = rnd(0, TAU); }
    if (P.blocked(x, z) || inKeepOut(st.keep, x, 0, z, 3)) continue;
    const a = agent('adult', x, groundY(x, z), z, face + Math.PI);
    a.mode = 'shop'; a.home = { x, z, y: a.y };
    setClip(a, pick(['idle', 'talk', 'listen']));
  }
  // stall keepers behind the market counters (builders/mage-city.js stall() -> CITY_LIFE.vendors); they stay put
  for (const v of CITY_LIFE.vendors || []) {
    if (inKeepOut(st.keep, v.x, 0, v.z, 3)) continue;
    const a = agent('adult', v.x, groundY(v.x, v.z), v.z, v.face);
    a.mode = 'shop'; a.vendor = true; a.home = { x: v.x, z: v.z, y: a.y };
    setClip(a, pick(['idle', 'talk']));
  }

  // ---- per frame
  function nearestFlyerAbove(a) {
    for (const f of st.flyers) {
      if (f.s < 0.5 || f.mode !== 'fly') continue;
      const dy = f.y - a.y;
      if (dy > 5 && dy < 45 && Math.hypot(f.x - a.x, f.z - a.z) < 28) return f;
    }
    return null;
  }
  function stepWalker(a, dt, H) {
    const s = a.street;
    if (!s) return;
    const dh = Math.hypot(a.x - H.x, a.z - H.z);
    // pauses: look up at a broom, browse, chat
    if (a.mode === 'pause') {
      a.t -= dt;
      if (dh < 3 && !H.broom) a.yaw += angDiff(a.yaw, Math.atan2(H.x - a.x, H.z - a.z)) * Math.min(1, dt * 3);
      if (a.t <= 0) { a.mode = 'walk'; setClip(a, a.kind === 'kid' ? 'jog' : a.carry ? 'carry' : 'walk'); }
      return;
    }
    a.chk -= dt;
    if (a.chk <= 0) {
      a.chk = rnd(1.2, 2);
      a.cd -= 2;
      if (a.cd <= 0 && nearestFlyerAbove(a)) { a.mode = 'pause'; a.t = rnd(2.2, 4); setClip(a, 'lookup'); a.cd = rnd(14, 28); return; }
      if (a.cd <= 0 && Math.random() < 0.06) { a.mode = 'pause'; a.t = rnd(3, 7); setClip(a, 'idle'); a.cd = rnd(10, 20); return; }
    }
    // along the polyline
    const i0 = a.si, i1 = a.si + 1, p0 = s[i0], p1 = s[i1];
    const L = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1;
    const ux = (p1.x - p0.x) / L, uz = (p1.z - p0.z) / L, nx = -uz, nz = ux;
    // the heroine: sidestep (and slow) when she is ahead within a few metres, stop if she is right there
    let v = a.v;
    const fx = ux * a.dir, fz = uz * a.dir, rx = H.x - a.x, rz = H.z - a.z;
    const ahead = rx * fx + rz * fz, side = rx * nx + rz * nz;
    if (!H.broom || H.y - a.y < 3) {
      if (dh < 3.2 && ahead > -0.5) { a.latT = Math.max(-1.6, Math.min(1.6, a.lat - Math.sign(side || 1) * 1.6)); v *= dh < 1.4 ? 0 : 0.5; }
    }
    a.lat += (a.latT - a.lat) * Math.min(1, dt * 1.5);
    a.ui += (v * dt * a.dir) / L;
    if (a.ui > 1 || a.ui < 0) {
      // next segment, or turn back at the end of the street
      const nextI = a.si + (a.ui > 1 ? 1 : -1);
      if (nextI >= 0 && nextI < s.length - 1) { a.si = nextI; a.ui = a.ui > 1 ? 0 : 1; }
      else { a.dir *= -1; a.ui = Math.max(0, Math.min(1, a.ui)); a.latT = rnd(-1.3, 1.3); if (Math.random() < 0.4) { a.mode = 'pause'; a.t = rnd(2, 5); setClip(a, 'idle'); } }
    }
    const bx = p0.x + (p1.x - p0.x) * a.ui + nx * a.lat, bz = p0.z + (p1.z - p0.z) * a.ui + nz * a.lat;
    if (P.blocked(bx, bz)) {
      // never into a wall: pull to the centre line, turn round if even that is blocked
      a.latT = 0; a.lat *= 0.5;
      const cx = p0.x + (p1.x - p0.x) * a.ui, cz = p0.z + (p1.z - p0.z) * a.ui;
      if (P.blocked(cx, cz)) { a.dir *= -1; a.ui = Math.max(0, Math.min(1, a.ui - (v * dt * a.dir * 2) / L)); return; }
    } else { a.x = bx; a.z = bz; }
    const yawT = Math.atan2(fx, fz);
    a.yaw += angDiff(a.yaw, yawT) * Math.min(1, dt * 4);
    const gy = groundY(a.x, a.z, a.y);
    a.y += (gy - a.y) * Math.min(1, dt * 10);
    const want = v < 0.05 ? 'idle' : a.kind === 'kid' ? 'jog' : a.carry ? 'carry' : 'walk';
    setClip(a, want);
    a.rate = want === 'walk' ? v / 0.83 : want === 'jog' ? v / 3.2 : want === 'carry' ? v / 0.8 : 1;
  }
  function stepStill(a, dt, H) {
    a.t -= dt; a.chk -= dt; a.cd -= dt;
    const dh = Math.hypot(a.x - H.x, a.z - H.z), dy = Math.abs(a.y - H.y);
    const p = a.perch;
    // make room on a balcony the heroine is landing on / standing on: step along the rail away from her
    if (p && a.home) {
      let hx = a.home.x, hz = a.home.z;
      if (dh < 2.2 && dy < 3) {
        const tx = Math.cos(p.face), tz = -Math.sin(p.face), sd = (a.home.x - H.x) * tx + (a.home.z - H.z) * tz;
        const push = Math.min(p.w / 2, 2.2 - dh) * (sd >= 0 ? 1 : -1);
        hx += tx * push; hz += tz * push;
      }
      a.x += (hx - a.x) * Math.min(1, dt * 2); a.z += (hz - a.z) * Math.min(1, dt * 2);
    }
    let face = p ? p.face : a.yaw;
    const w = p?.lastWitch;
    if (a.partner && a.partner.s > 0.5) face = Math.atan2(a.partner.x - a.x, a.partner.z - a.z);
    else if (w && w.perch === p && w.mode === 'perch') face = Math.atan2(w.x - a.x, w.z - a.z);
    if (dh < 6 && dy < 4) face = Math.atan2(H.x - a.x, H.z - a.z);
    a.yaw += angDiff(a.yaw, face) * Math.min(1, dt * 2);
    if (a.clip === 'wave' && a.clipT < 1.65) return;
    if (a.chk <= 0) {
      a.chk = rnd(1, 1.8);
      // wave at the heroine going past, or a witch on a broom close by
      const near = dh < 16 && dy < 10 && G.mode === 'play';
      if (a.cd <= 0 && near) { setClip(a, 'wave'); a.cd = rnd(18, 30); return; }
      if (a.cd <= 0) {
        const f = nearestFlyerAbove(a);
        if (f) { setClip(a, a.mode === 'balcony' && Math.random() < 0.5 ? 'wave' : 'lookup'); a.cd = rnd(10, 22); a.t = rnd(2.5, 4); return; }
      }
    }
    if (a.t <= 0 || a.clip === 'wave' || a.clip === 'lookup' && a.clipT > 3.5) {
      a.t = rnd(5, 14);
      if (a.partner) setClip(a, a.clip === 'talk' ? 'listen' : 'talk');
      else if (w && w.perch === p && w.mode === 'perch') setClip(a, pick(['talk', 'listen']));
      else if (a.mode === 'balcony') setClip(a, pick(['rail', 'rail', 'idle', 'call', 'talk']));
      else setClip(a, pick(['idle', 'talk', 'listen', 'idle']));
    }
  }

  let relocT = 0;
  return {
    folk,
    update(dt, H, cam) {
      relocT -= dt;
      if (relocT <= 0 && cam) { relocT = 0.5; relocate(cam); relocateWalker(cam); }
      for (const a of folk) {
        a.rate = 1;
        if (a.mode === 'walk' || a.mode === 'pause') stepWalker(a, dt, H); else stepStill(a, dt, H);
        const dh = Math.hypot(a.x - H.x, a.y - H.y, a.z - H.z);
        a.dist = dh;
        let sT = 1;
        if (inKeepOut(st.keep, a.x, a.y, a.z, 1)) sT = 0;
        if (G.mode !== 'play' && dh < 16) sT = 0;
        a.sT = sT;
        a.s += Math.sign(a.sT - a.s) * Math.min(Math.abs(a.sT - a.s), dt * 1.5);
        a.clipT += dt * a.rate; a.prevT += dt;
        if (a.fade < 1) a.fade = Math.min(1, a.fade + dt * 4);
        if (!LOOPED.test(a.clip)) { const c = B[a.body]?.clips?.[a.clip]; if (c) a.clipT = Math.min(a.clipT, c.dur - 0.01); }
      }
    },
    draw(pool, cam, fr, sp) {
      for (const a of folk) {
        if (a.s <= 0.002) continue;
        const d = Math.hypot(a.x - cam.x, a.y - cam.y, a.z - cam.z);
        if (d > (a.mode === 'balcony' ? 280 : 150)) continue;
        if (d > 20 && !st.viewCam) { sp.center.set(a.x, a.y + 0.9, a.z); if (!fr.intersectsSphere(sp)) continue; }
        pool.put(a, st.forceLod ?? pool.lodOf(d));
      }
    },
    hide() {},
    stats() {
      const by = {};
      for (const a of folk) by[a.mode] = (by[a.mode] || 0) + 1;
      return { n: folk.length, by };
    },
  };
}
