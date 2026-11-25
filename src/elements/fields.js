// 元素交织 · ground fields: lingering surfaces that spells leave behind and that later spells react with.
//   puddle 水洼 · charged 电光水洼 · icesheet 冰封水洼 · steam 蒸汽云 · mud 泥沼 · frost 霜地 · lava 熔岩
// A field is a disc { kind, x, z, y, r, t, life, power, team }. One rule for everything standing in it — foes, the heroine,
// creatures, props: its STATUS each tick (soaked, chilled, muddy, set alight like burning grass). DAMAGE follows the same
// friendly-fire rule as apply(): the caster's own side is spared. The look is a few persistent fx shapes per field
// (shared instanced batch, no draw calls of their own) plus timed accents.
// y is the surface the rules test feet against (the highest ground under the disc). The look is draped on the terrain
// (fx shapes `drape`), centred on the ground under the field's centre (f.base): it follows the slope instead of standing
// out flat over the downhill side. Accents sit on the ground under them.
// The rules are the general ones of 元素交织 (docs/api/elements.md): water in any form (wet thing, puddle, rain, steam)
// + thunder → charged, + ice → frozen, + fire → steam, + earth → mud; fire melts ice; wind carries what it touches.
//
// How fields meet elements (onApply, called by apply()'s ground pass and by G.elements.touchGround):
//   water: puddle (new / refreshed) · frost → ice sheet · lava → quench (steam + stone crust)
//   fire:  puddle / charged → steam cloud · ice sheet / frost → thaw to a puddle
//   ice:   puddle / charged / mud → ice sheet (things standing in it freeze) · steam → rime (frost) · lava → steam blast
//          a big ice burst on open ground → frost
//   thunder: puddle → charged water · steam → charged fog (one shock through everything inside)
//   earth: puddle / charged → mud · burning grass → lava
//   wind:  steam drifts along the gust
import * as THREE from 'three';
import { G } from '../core/game.js';
import { clamp } from '../core/util.js';
import { T, MULT } from './consts.js';

const MAX = 18;
const LIFE = { puddle: 15, charged: 5, icesheet: 16, steam: 7.5, mud: 15, frost: 12, lava: 11 };
const TICK = { puddle: 0.4, charged: 0.35, icesheet: 0.4, steam: 0.3, mud: 0.3, frost: 0.4, lava: 0.45 };
const RMAX = { puddle: 6, charged: 6, icesheet: 7, steam: 8, mud: 7, frost: 9, lava: 6 };
const FOOT = 1.3;          // a reactor whose feet are this far above the surface is not "in" it
const STEAM_H = 4.6;       // height of a steam cloud
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

export function createFields(E) {
  const list = [];
  let nextId = 1;
  const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _u = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  const fx = () => G.fx || null;
  const kit = () => G.fx?.kit || null;
  const sfx = (name, pos, vol = 1) => { try { G.audio?.sfx?.(name, { pos, vol }); } catch (e) { /* optional */ } };
  const surfY = (kind, x, z, r) => (kind === 'steam' ? Math.max(groundY(x, z, r), G.world.seaLevel ?? -Infinity) : groundY(x, z, r));
  const groundY = (x, z, r = 0) => {
    let y = G.world.heightAt(x, z);
    if (r > 0.5) for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.4; y = Math.max(y, G.world.heightAt(x + Math.cos(a) * r * 0.6, z + Math.sin(a) * r * 0.6)); }
    return y;
  };
  /** height the look is centred on: the ground under the centre as the draped disc's terrain texture holds it */
  const lay = (f) => { f.base = f.kind === 'steam' ? f.y : G.terrain?.dataHeightAt?.(f.x, f.z) ?? G.world.heightAt(f.x, f.z); };
  const camD = (x, y, z) => { const c = G.camera?.position; return c ? Math.hypot(c.x - x, c.y - y, c.z - z) : 0; };
  const quality = () => clamp(G.quality?.particles ?? 1, 0.3, 1);

  // ---- visuals ------------------------------------------------------------------------------------------------------
  function shape(o) {
    const F = fx(); if (!F?.shape) return null;
    const h = F.shape({ ...o, handle: true, drape: o.kind === 'disc' });   // ground discs lie on the terrain
    return h && h !== true ? h : null;
  }
  const LOOK = {
    puddle: (f, P) => [
      shape({ kind: 'disc', pos: P, r0: 0, r1: f.r, dur: 2, grow: [1, 1], erode: [0.16, 0.16], tex: 'billow', tile: [2, 1], scroll: [0.02, 0.01],
        color: 0x1b4560, color2: 0xa8e6ff, mode: 'sheet', body: 0.62, soft: 0.05, I: 0.95 }),
    ],
    charged: (f, P) => [
      ...LOOK.puddle(f, P),
      shape({ kind: 'disc', pos: P.setY(P.y + 0.03), r0: 0, r1: f.r * 0.96, dur: 2, grow: [1, 1], erode: [0.18, 0.18], tex: 'seams', tile: [3, 1.4],
        scroll: [0.35, 0.8], color: 0x9a6cff, color2: 0xf4eeff, mode: 'glow', add: 0.9, I: 1.7, soft: 0.06 }),
    ],
    icesheet: (f, P) => [
      shape({ kind: 'disc', pos: P, r0: 0, r1: f.r, dur: 2, grow: [1, 1], erode: [0.06, 0.06], tex: 'cells', tile: [3, 1.2], color: 0x8cc4e6, color2: 0xffffff,
        mode: 'sheet', body: 0.78, soft: 0.04, I: 1.15 }),
      shape({ kind: 'disc', pos: P.setY(P.y + 0.03), r0: 0, r1: f.r * 1.08, dur: 2, grow: [1, 1], erode: [0.34, 0.34], tex: 'streak', tile: [Math.max(8, Math.round(f.r * 4)), 0.7],
        color: 0xa8d8f4, color2: 0xffffff, mode: 'sheet', body: 0.45, soft: 0.05, I: 1.1 }),
    ],
    frost: (f, P) => [
      shape({ kind: 'disc', pos: P, r0: 0, r1: f.r, dur: 2, grow: [1, 1], erode: [0.28, 0.28], tex: 'streak', tile: [Math.max(8, Math.round(f.r * 4)), 0.7],
        color: 0xa8d8f4, color2: 0xffffff, mode: 'sheet', body: 0.5, soft: 0.05, I: 1.1 }),
    ],
    mud: (f, P) => [
      shape({ kind: 'disc', pos: P, r0: 0, r1: f.r, dur: 2, grow: [1, 1], erode: [0.1, 0.1], tex: 'billow', tile: [3, 1], scroll: [0.01, 0.015],
        color: 0x2b1e14, color2: 0x6e5238, mode: 'smoke', body: 0.95, core: 0.7, soft: 0.06 }),
      shape({ kind: 'disc', pos: P.setY(P.y + 0.03), r0: 0, r1: f.r * 0.85, dur: 2, grow: [1, 1], erode: [0.42, 0.42], tex: 'cells', tile: [3, 1],
        color: 0x3d2c1e, color2: 0x9a8064, mode: 'sheet', body: 0.5, soft: 0.04, I: 0.8 }),
    ],
    lava: (f, P) => [
      shape({ kind: 'disc', pos: P, r0: 0, r1: f.r, dur: 2, grow: [1, 1], erode: [0.0, 0.0], tex: 'billow', tile: [2, 1], scroll: [0.04, 0.06],
        color: 0xf2460a, color2: 0xffb848, core: 0.6, mode: 'flame', add: 0.3, I: 1.05, soft: 0.05 }),   // molten orange through the soft look (was 0xff5a10 ×1.7: cream)
      shape({ kind: 'disc', pos: P.setY(P.y + 0.06), r0: 0, r1: f.r * 1.04, dur: 2, grow: [1, 1], erode: [0.6, 0.6], tex: 'cells', tile: [2.2, 0.8], scroll: [0.008, 0.012],
        color: 0x1a1210, color2: 0x4a3226, mode: 'smoke', body: 0.95, core: 1, soft: 0.05 }),
      G.elements?.flames?.patch?.({ pos: P, r: f.r }),   // low flames dancing on the pool (flame cards; same handle interface)
    ],
    steam: (f, P) => [
      shape({ kind: 'ring', pos: P.setY(P.y + 0.12), r0: f.r * 0.15, r1: f.r * 1.1, dur: 2, grow: [1, 1], erode: [0.22, 0.22], tex: 'billow', tile: [4, 1], scroll: [0.06, 0.18],
        color: 0xc9d5dd, color2: 0xffffff, mode: 'smoke', body: 0.7, soft: 0.12 }),
    ],
  };
  function dress(f) {
    undress(f, 0.01);
    const make = LOOK[f.kind];
    if (!make) return;
    lay(f);
    f.look = make(f, _p.set(f.x, f.base + 0.04, f.z)).filter(Boolean);
    for (const h of f.look) h.dims(0.01, 0.01);
    if (f.kind === 'lava') {
      try { f.em = G.fx?.emitter?.('embers', { radius: f.r * 0.7, scale: 0.9 }) || null; if (f.em) f.em.pos.set(f.x, f.y + 0.2, f.z); } catch (e) { f.em = null; }
      f.light = E.addLight ? E.addLight({ pos: new THREE.Vector3(f.x, f.y + 0.8, f.z), radius: f.r * 2.6, intensity: 0.85, duration: f.life + 1 }) : null;
    }
  }
  function undress(f, sec = 0.8) {
    if (f.look) for (const h of f.look) h?.kill?.(sec);
    f.look = null;
    if (f.em) { try { f.em.remove?.(); } catch (e) { /* */ } f.em = null; }
    if (f.light) { f.light.remove?.(); f.light = null; }
  }
  function lost(L) { for (let i = 0; i < L.length; i++) if (L[i] && !L[i].alive) return true; return false; }
  /** grow in, follow, fade at the end */
  function styleLook(f) {
    if (!f.look) return;
    const k = Math.min(1, f.t / 0.45), endK = clamp((f.life - f.t) / 1.2), s = (0.35 + 0.65 * k) * (0.6 + 0.4 * endK);
    const L = f.look;
    for (let i = 0; i < L.length; i++) {
      const h = L[i];
      if (!h || !h.alive) continue;
      if (f.kind === 'steam' && i === 0) { h.dims(f.r * 0.15 * s, f.r * 1.1 * s); h.pos.set(f.x, f.y + 0.16, f.z); }
      else { const rr = f.r * (i === 0 ? 1 : f.kind === 'icesheet' || f.kind === 'lava' ? 1.06 : f.kind === 'mud' ? 0.85 : 0.96); h.dims(0, rr * s); h.pos.set(f.x, f.base + 0.04 + i * (f.kind === 'lava' ? 0.06 : 0.03), f.z); }
      h.I = (h._I0 ??= h.I) * (0.4 + 0.6 * endK);
    }
  }

  // ---- registry -----------------------------------------------------------------------------------------------------
  function add(kind, x, z, r = 3, o = {}) {
    if (!LIFE[kind]) return null;
    const W = G.world;
    if (kind !== 'steam' && W.isWater?.(x, z)) return null;
    // the same kind overlapping: grow / refresh that one instead
    for (const f of list) {
      if (f.dead || f.kind !== kind) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < Math.max(f.r, r) * 0.7) {
        f.r = Math.min(RMAX[kind], Math.max(f.r, r, d + r * 0.6));
        f.t = Math.min(f.t, 0.45); f.life = Math.max(f.life - f.t, o.life ?? LIFE[kind]) + f.t;
        f.power = Math.max(f.power, o.power ?? 1);
        if (o.team && o.team !== 'neutral') f.team = o.team;
        return f;
      }
    }
    while (list.length >= MAX) remove(list[0], 0.4);
    const f = {
      id: nextId++, kind, x, z, y: surfY(kind, x, z, r), r: Math.min(RMAX[kind], r), t: 0, life: o.life ?? LIFE[kind], power: o.power ?? 1,
      team: o.team || 'neutral', source: o.source || null, dead: false, tick: Math.random() * 0.2, fxT: 0, vx: 0, vz: 0, look: null, em: null, light: null,
      base: 0,
    };
    list.push(f);
    dress(f);
    return f;
  }
  function remove(f, sec = 0.8) {
    if (!f || f.dead) return;
    f.dead = true;
    undress(f, sec);
    const i = list.indexOf(f);
    if (i >= 0) list.splice(i, 1);
  }
  /** Change a field into another kind in place (keeps position, new life and look). */
  function become(f, kind, o = {}) {
    if (f.dead) return null;
    if (kind === null) { remove(f); return null; }
    f.kind = kind; f.t = 0; f.life = o.life ?? LIFE[kind]; f.tick = 0.05;
    if (o.r) f.r = Math.min(RMAX[kind], o.r); else f.r = Math.min(RMAX[kind], f.r);
    if (o.team && o.team !== 'neutral') f.team = o.team;
    dress(f);
    return f;
  }
  const inside = (f, x, z, pad = 0) => (x - f.x) * (x - f.x) + (z - f.z) * (z - f.z) < (f.r + pad) * (f.r + pad);

  /** cb(r) for every reactor standing in field f (feet near its surface). Living things and props only. */
  function standing(f, cb, height = FOOT) {
    E.hash.each(f.x, f.z, f.r, (r) => {
      if (r.dead || !(r.living || r.kind === 'creature' || r.kind === 'prop')) return;
      if (Math.hypot(r.pos.x - f.x, r.pos.z - f.z) - r.radius * 0.5 > f.r) return;
      const y0 = r.y0;
      if (y0 - f.y > height || y0 < f.y - 2.5) return;
      cb(r);
    });
  }
  const mate = (f, r) => f.team !== 'neutral' && r.team === f.team;
  const hostile = (f, r) => !mate(f, r) && (r.living || r.kind === 'creature') && r.kind !== 'lantern';
  const info = (f, damage, extra) => ({ source: f.source, team: f.team, damage, fusion: true, field: f.kind, ...extra });

  // ---- what a field does to things in it -------------------------------------------------------------------------------
  function tick(f) {
    switch (f.kind) {
      case 'puddle':
        standing(f, (r) => { if (r.kind !== 'lantern') E.soak(r, 3); });
        break;
      case 'charged': {
        let n = 0;
        standing(f, (r) => {
          E.soak(r, 2);
          if (mate(f, r)) return;   // friendly fire: the caster's side is wet, not shocked
          E.shock(r, 0.6 * f.power, info(f, 0));
          if (hostile(f, r)) { n++; E.hitReactor(r, 'thunder', 0.6 * f.power, info(f, Math.round(6 * f.power)), { mult: MULT.conduct, reaction: 'conduct' }); }
        });
        if (n) E.combo('conduct', _q.set(f.x, f.y + 1, f.z), { team: f.team, count: n, quiet: true });
        break;
      }
      case 'icesheet':
        standing(f, (r) => { if ((r.living || r.kind === 'creature') && !r.burning) { r.chilled = Math.max(r.chilled, 1.4); E.activate(r); } });
        break;
      case 'frost':
        standing(f, (r) => {
          if (!(r.living || r.kind === 'creature') || r.burning) return;
          r.chilled = Math.max(r.chilled, 1.4); E.activate(r);
          if (!mate(f, r) && r.wet > 0 && !r.frozen && E.freeze(r, T.FREEZE * 0.7)) E.combo('freeze', _q.set(r.pos.x, r.cy, r.pos.z), { team: f.team });
        });
        break;
      case 'mud':
        standing(f, (r) => { if (r.living || r.kind === 'creature') { r.muddy = Math.max(r.muddy, 1.2); E.activate(r); E.soak(r, 2); } }, 1.0);
        break;
      case 'steam':
        standing(f, (r) => { if (r.living) E.soak(r, 1.5); }, STEAM_H);
        E.fire.extinguish(f.x, f.z, f.r * 0.8);
        douseShots(f);
        break;
      case 'lava': {
        standing(f, (r) => {
          // molten rock sets alight whatever stands in it, like burning grass does (her own side included)
          if (r.flammable > 0 && !r.burning && !r.wet) E.ignite(r, 1, info(f, 0));
          if (hostile(f, r)) E.hitReactor(r, 'fire', 1, info(f, Math.round(7 * f.power)), { reaction: 'lava' });
        }, 0.8);
        // the rim catches
        if (Math.random() < 0.14) { const a = Math.random() * TAU; E.fire.ignite(f.x + Math.cos(a) * (f.r + 0.6), f.z + Math.sin(a) * (f.r + 0.6), 0.8, 0.45); }
        break;
      }
    }
  }
  /** Steam swallows hostile fire projectiles that fly into it. */
  function douseShots(f) {
    const P = G.spells?.projectiles;
    if (!P || !P.length) return;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (!p || !p.alive || p.el !== 'fire' || (f.team !== 'neutral' && p.team === f.team)) continue;
      if (!inside(f, p.pos.x, p.pos.z) || p.pos.y > f.y + STEAM_H || p.pos.y < f.y - 1) continue;
      p.life = p.age; p.damage = 0;
      fx()?.burst?.('steam', p.pos, { scale: 0.8 });
    }
  }

  /** Timed accents: crawling arcs on charged water, steam puffs, mud bubbles, lava tongues. */
  function accents(f, dt) {
    if ((f.fxT -= dt) > 0) return;
    const K = kit(), F = fx();
    const far = camD(f.x, f.y, f.z);
    if (far > 120 || !F) { f.fxT = 0.5; return; }
    const q = quality();
    const pt = (rr) => { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * f.r * rr, x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d; return _p.set(x, G.world.heightAt(x, z) + 0.12, z); };
    switch (f.kind) {
      case 'charged': {
        f.fxT = 0.22 / Math.max(0.5, q);
        const a = pt(0.85).clone(), b = pt(0.85);
        if (a.distanceTo(b) > 0.8) F.lightning?.(a, b, { color: 0xc9b0ff, impact: false, branches: 1, dur: 0.22, width: 0.09, intensity: 2.2 });
        if (Math.random() < 0.3) sfx('zap', a, 0.25);
        break;
      }
      case 'steam':
        f.fxT = 0.2 / q;
        if (K) { const P = pt(0.8); P.y = f.y + rnd(0.2, 2.2); K.smoke(P, rnd(1.8, 2.8), { n: 1, dur: rnd(2.4, 3.4), rise: rnd(0.25, 0.7), dark: 0xd2dbe2, light: 0xffffff, delay: 0 }); }
        break;
      case 'mud':
        f.fxT = rnd(0.35, 0.7) / q;
        if (K) { const P = pt(0.8); F.shape?.({ kind: 'sphere', pos: P, r0: rnd(0.12, 0.26), h: 0.18, dur: 0.7, grow: [0.2, 1.2], erode: [-0.2, 1], tex: 'cells', tile: [1, 1],
          color: 0x4a3626, color2: 0xa58a6a, mode: 'sheet', body: 0.85, I: 0.9, soft: 0.03 }); }
        break;
      case 'lava':
        f.fxT = rnd(0.3, 0.55) / q;
        if (K) { K.tongues(pt(0.7), 1, 0.3, rnd(0.6, 1.1), { dur: 0.8, I: 1.3 }); if (Math.random() < 0.35) { const S = pt(0.6); S.y += 0.48; K.smoke(S, 1.1, { n: 1, dur: 2.4, rise: 1.6 }); } }
        break;
      case 'icesheet':
      case 'frost':
        f.fxT = rnd(0.9, 1.6);
        if (K && Math.random() < 0.6) K.coldMist(pt(0.5), Math.min(3, f.r * 0.6), { dur: 1.6 });
        break;
      case 'puddle':
        f.fxT = rnd(0.6, 1.2);
        if (K && Math.random() < 0.5) { const S = pt(0.8); S.y -= 0.06; K.shock(S, rnd(0.4, 0.8), 0xbfe8ff, { dur: 0.6, width: 0.12, add: 0.4, I: 0.9 }); }
        break;
      default: f.fxT = 1;
    }
  }

  // ---- reactions with elements (the ground half of apply) -----------------------------------------------------------
  function touched(pos, radius) {
    const out = [];
    for (const f of list) if (!f.dead && inside(f, pos.x, pos.z, radius * 0.8)) out.push(f);
    return out;
  }
  function centre(f) { return new THREE.Vector3(f.x, f.y + 1.1, f.z); }

  /** An element lands near the ground at pos: transform / create fields. Returns the fields it changed. */
  function onApply(el, pos, radius, power, inf = {}) {
    if (!pos || inf.field) return null;   // a field's own ticks never re-trigger fields
    const W = G.world;
    const gy = groundY(pos.x, pos.z);
    if (pos.y - gy > radius + 2) return null;
    const team = inf.team || 'neutral', src = inf.source || null;
    const hits = touched(pos, radius);
    const o = { team, source: src, power };
    let changed = 0;
    switch (el) {
      case 'water': {
        let wet = false;
        for (const f of hits) {
          if (f.kind === 'lava') { quench(f, team); changed++; wet = true; }
          else if (f.kind === 'frost') { become(f, 'icesheet', o); freezeIn(f); E.combo('icesheet', centre(f), { team }); sfx('freeze', centre(f)); changed++; wet = true; }
          else if (f.kind === 'puddle' || f.kind === 'mud' || f.kind === 'charged') { f.life = Math.max(f.life, f.t + LIFE[f.kind]); f.r = Math.min(RMAX[f.kind], f.r + 0.4); wet = true; }
          else if (f.kind === 'icesheet') wet = true;
        }
        if (!wet && !W.isWater?.(pos.x, pos.z) && radius >= 1.5) { add('puddle', pos.x, pos.z, clamp(radius * 0.65, 2, 5.5), o); changed++; }
        break;
      }
      case 'fire':
        for (const f of hits) {
          if (f.kind === 'puddle' || f.kind === 'charged') {
            become(f, 'steam', { ...o, r: f.r + 1 });
            E.combo('steamcloud', centre(f), { team }); fx()?.burst?.('steam', centre(f), { scale: 1.6 }); sfx('steam_sizzle', centre(f)); changed++;
          } else if (f.kind === 'icesheet' || f.kind === 'frost') {
            become(f, 'puddle', o);
            E.combo('thawground', centre(f), { team }); fx()?.burst?.('steam', centre(f), { scale: 1.1 }); sfx('steam', centre(f), 0.7); changed++;
          } else if (f.kind === 'lava') { f.life = Math.max(f.life, f.t + 4); }
        }
        break;
      case 'ice': {
        let made = false;
        for (const f of hits) {
          if (f.kind === 'puddle' || f.kind === 'charged' || f.kind === 'mud') {
            const wasMud = f.kind === 'mud';
            become(f, 'icesheet', { ...o, r: f.r + 0.3 });
            const n = freezeIn(f);
            E.combo('icesheet', centre(f), { team, count: Math.max(1, n) });
            kit()?.crystals?.(_p.set(f.x, f.y, f.z), Math.round(5 + f.r), f.r * 0.8, 0.8, { dur: 1.8, outward: 0.3 });
            sfx('freeze', centre(f)); if (wasMud) sfx('ice_shatter', centre(f), 0.5); made = true; changed++;
          } else if (f.kind === 'steam') { rime(f, team); made = true; changed++; }
          else if (f.kind === 'lava') { steamblast(f, team, src, power); made = true; changed++; }
          else if (f.kind === 'frost' || f.kind === 'icesheet') { f.life = Math.max(f.life, f.t + LIFE[f.kind]); made = true; }
        }
        if (!made && radius >= 5 && !W.isWater?.(pos.x, pos.z)) { add('frost', pos.x, pos.z, radius * 0.85, o); changed++; }
        break;
      }
      case 'thunder':
        for (const f of hits) {
          if (f.kind === 'puddle') {
            become(f, 'charged', o);
            E.combo('charged', centre(f), { team }); sfx('thunder_chain', centre(f), 0.8); changed++;
            tick(f);
          } else if (f.kind === 'charged') { f.life = Math.max(f.life, f.t + LIFE.charged); }
          else if (f.kind === 'steam') { chargedFog(f, team, src, power); changed++; }
        }
        break;
      case 'earth': {
        for (const f of hits) {
          if (f.kind === 'puddle' || f.kind === 'charged') {
            become(f, 'mud', { ...o, r: f.r + 0.6 });
            E.combo('mud', centre(f), { team }); fx()?.burst?.('dust', centre(f), { scale: 1.2 }); sfx('splash', centre(f), 0.6); changed++;
          }
        }
        // ground soaked by spell rain is water too: it turns to mud
        if (!hits.length && E.weather.isSpellRainAt?.(pos.x, pos.z) && !W.isWater?.(pos.x, pos.z)) {
          const f = add('mud', pos.x, pos.z, clamp(radius + 0.6, 2.5, 5), o);
          if (f) { E.combo('mud', centre(f), { team }); fx()?.burst?.('dust', centre(f), { scale: 1.2 }); changed++; }
        }
        // risen through burning grass: the rock melts at its foot
        else if (!hits.some((f) => f.kind === 'lava')) {
          let burning = 0;
          const rr = Math.max(1.5, radius * 0.8);
          if (E.fire.isBurningAt(pos.x, pos.z)) burning++;
          for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; if (E.fire.isBurningAt(pos.x + Math.cos(a) * rr, pos.z + Math.sin(a) * rr)) burning++; }
          if (burning >= 2) {
            const f = add('lava', pos.x, pos.z, clamp(radius + 0.6, 2.5, 5), { ...o, life: LIFE.lava });
            if (f) { E.combo('lava', centre(f), { team }); fx()?.burst?.('explosion', centre(f), { color: 'fire', scale: 0.7 }); sfx('explosion_small', centre(f), 0.7); changed++; }
          }
        }
        break;
      }
      case 'wind':
        for (const f of hits) {
          if (f.kind !== 'steam') continue;
          let dx = inf.dir?.x ?? f.x - pos.x, dz = inf.dir?.z ?? f.z - pos.z;
          const l = Math.hypot(dx, dz) || 1;
          f.vx += (dx / l) * 7 * power; f.vz += (dz / l) * 7 * power;
          f.life = Math.max(f.life, f.t + 2.5);
        }
        break;
    }
    return changed;
  }

  /** Things standing in a freshly frozen sheet freeze with it. */
  function freezeIn(f) {
    let n = 0;
    standing(f, (r) => {
      if (mate(f, r) || !(r.living || r.kind === 'creature')) return;
      r.wet = Math.max(r.wet, 1);
      if (E.freeze(r, T.FREEZE * 0.8)) n++;
    });
    return n;
  }
  function quench(f, team) {
    const c = centre(f);
    const r = f.r;
    become(f, 'steam', { team, r: r + 1.5 });
    E.combo('quench', c, { team });
    fx()?.burst?.('steam', c, { scale: 2.6, power: 1.5 });
    kit()?.mark?.(_p.set(f.x, f.y, f.z), r * 1.05, 'crack', 14);
    kit()?.mark?.(_p.set(f.x, f.y, f.z), r * 0.9, 'scorch', 14);
    sfx('steam_sizzle', c, 1.2); sfx('rock_crumble', c, 0.5);
    E.fire.extinguish(f.x, f.z, r + 1);
  }
  function rime(f, team) {
    const c = centre(f);
    let n = 0;
    standing(f, (r) => { if (!mate(f, r) && r.living) { r.wet = Math.max(r.wet, 1); if (E.freeze(r, T.FREEZE)) n++; } }, STEAM_H);
    become(f, 'frost', { team, r: f.r });
    E.combo('rime', c, { team, count: Math.max(1, n) });
    kit()?.crystals?.(_p.set(f.x, f.y, f.z), 8, f.r * 0.8, 1.1, { dur: 2, outward: 0.3 });
    kit()?.coldMist?.(_p.set(f.x, f.y, f.z), f.r);
    sfx('freeze', c); sfx('crystal_chime', c, 0.5);
  }
  function chargedFog(f, team, src, power) {
    const c = centre(f);
    let n = 0;
    const pts = [];
    standing(f, (r) => {
      if (mate(f, r) || !r.living) return;
      r.wet = Math.max(r.wet, 1);
      E.shock(r, power, { team, source: src });
      if (hostile(f, r)) { n++; E.hitReactor(r, 'thunder', power, { source: src, team, damage: Math.round(18 * power), fusion: true, field: 'steam' }, { mult: MULT.conduct, reaction: 'chargedfog' }); }
      if (pts.length < 6) pts.push(new THREE.Vector3(r.pos.x, r.cy, r.pos.z));
    }, STEAM_H);
    const F = fx();
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU, b = a + rnd(1.2, 2.6);
      _p.set(f.x + Math.cos(a) * f.r * 0.8, f.y + rnd(0.5, 3), f.z + Math.sin(a) * f.r * 0.8);
      _u.copy(pts[i % Math.max(1, pts.length)] || _q.set(f.x + Math.cos(b) * f.r * 0.7, f.y + rnd(0.5, 3), f.z + Math.sin(b) * f.r * 0.7));
      F?.lightning?.(_p, _u, { color: 0xc9b0ff, impact: i < pts.length, branches: 2, dur: 0.4, width: 0.14, intensity: 2.4 });
    }
    F?.flash?.(c, 0xb98cff, 90, 0.3, 20);
    sfx('thunder_chain', c, 1); sfx('hit_thunder', c, 0.6);
    f.life = Math.min(f.life, f.t + 2.5);
    E.combo('chargedfog', c, { team, count: Math.max(1, n) });
  }
  function steamblast(f, team, src, power) {
    const c = centre(f);
    const R = f.r + 2.5;
    const n = E.blast(c, R, { element: 'fire', team, source: src, damage: Math.round(30 * power), mult: MULT.overload, reaction: 'steamblast', impulse: 16, soak: true });
    become(f, 'steam', { team, r: f.r + 2 });
    E.combo('steamblast', c, { team, count: Math.max(1, n) });
    const F = fx();
    F?.burst?.('steam', c, { scale: 3.2, power: 2 });
    F?.burst?.('explosion', c, { color: 0xffffff, scale: 1.2, power: 1.5 });
    kit()?.dome?.(c, R, 0xf2f8ff, { dur: 0.6, I: 1.4 });
    kit()?.shock?.(_p.set(f.x, f.y + 0.1, f.z), R * 1.2, 0xffffff, { dur: 0.5, width: 0.15 });
    F?.flash?.(c, 0xffe2c0, 160, 0.35, 26);
    sfx('explosion_large', c, 0.9); sfx('steam_sizzle', c, 1.2);
    G.hitstop?.(0.06);
  }

  // ---- per frame ------------------------------------------------------------------------------------------------------
  function update(dt) {
    if (!(dt > 0)) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.t += dt;
      if (f.t >= f.life) {
        // ice sheets and frost melt back into a puddle, charged water calms down
        if (f.kind === 'icesheet') { become(f, 'puddle', { life: 8 }); continue; }
        if (f.kind === 'charged') { become(f, 'puddle', { life: 6 }); continue; }
        remove(f, 1);
        continue;
      }
      if (f.kind === 'steam' && (f.vx || f.vz)) {
        f.x += f.vx * dt; f.z += f.vz * dt;
        const k = Math.exp(-1.2 * dt); f.vx *= k; f.vz *= k;
        if (Math.abs(f.vx) + Math.abs(f.vz) < 0.05) f.vx = f.vz = 0;
        f.y = surfY('steam', f.x, f.z, 0);
        f.r = Math.min(RMAX.steam, f.r + dt * 0.15);
      }
      else if ((f.yT = (f.yT || 0) - dt) <= 0) { f.yT = 1; f.y = surfY(f.kind, f.x, f.z, f.r); lay(f); }   // the ground may have moved (craters)
      if (f.kind === 'steam' && E.weather.isRainingAt(f.x, f.z) && f.life - f.t > 2) f.life -= dt;   // rain beats steam down
      if (f.kind === 'lava' && E.weather.isSpellRainAt?.(f.x, f.z)) { quench(f, f.team); continue; }
      if ((f.tick -= dt) <= 0) { f.tick = TICK[f.kind] || 0.4; try { tick(f); } catch (e) { G.reportError('elements:field:' + f.kind, e); } }
      styleLook(f);
      if (f.look && f.t > 0.5 && lost(f.look)) dress(f);   // fx was cleared under us
      accents(f, dt);
    }
  }

  return {
    list,
    add, remove, become, onApply, update,
    /** The most recent field whose disc holds (x, z) and whose surface is near y (steam: inside the cloud). kind filters. */
    at(pos, kind) {
      for (let i = list.length - 1; i >= 0; i--) {
        const f = list[i];
        if (f.dead || (kind && f.kind !== kind) || !inside(f, pos.x, pos.z)) continue;
        if (pos.y !== undefined) { const top = f.kind === 'steam' ? STEAM_H : FOOT + 0.6; if (pos.y > f.y + top || pos.y < f.y - 2.5) continue; }
        return f;
      }
      return null;
    },
    each(pos, r, cb) { for (const f of list) if (!f.dead && inside(f, pos.x, pos.z, r)) cb(f); },
    concealedAt(pos) {
      for (const f of list) if (!f.dead && f.kind === 'steam' && f.t > 0.3 && inside(f, pos.x, pos.z, -0.3) && pos.y < f.y + STEAM_H && pos.y > f.y - 2) return true;
      return false;
    },
    clear() { for (let i = list.length - 1; i >= 0; i--) remove(list[i], 0.01); list.length = 0; },
  };
}
