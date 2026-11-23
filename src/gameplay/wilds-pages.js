// 残页试炼 — the page trials of the open country (spell-tiers round, 2026-11-23). Data: PAGE_SITES in src/data/wilds.js,
// words: gameplay.wilds.pages.* and combat.enemy / combat.elite (guardian plates).
// Fran teaches the small (tier-1) forms only. The charged (tier-2) form of each element is a page that an old travelling
// witch left where that element is strongest. Each site is one loop, built on the element system's general rules:
//   1. sighted   a weathered marker stone with the element's sigil (a coloured glint pulls from ~1 km) → map pin + journal hint
//   2. seal      the mechanism beside it answers that element's small form (any player cast of it):
//                  harp     wind sings through the strings          rod      lightning goes to the iron rod
//                  candles  fire lights all five candles            lectern  a rock pillar lifts the sunken lectern
//                  bud      water fills the dry basin, the bud opens spring   ice stops the falling spring
//                → the guardian wakes (a circle blooms, motes gather, a burst, a banner, a slow beat)
//   3. guardian  an elite built on a combat type, with a ward of the site's element that only the countering element
//                breaks (and its own type's weak points); she leaves the arena or falls → it sinks back, wakes on return
//   4. page      it drops the page; touching it → G.spells.learn(el, 2) (the learn ceremony) or stardust if known
// Seals answer only a named witch (majo_named), so a guardian always meets the full tier-1 kit. State:
// G.state.wilds.pages[id] = 'seen' | 'open' (seal broken) | 'won' (page waiting) | 'read'. The fight itself is not saved.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { mulberry32 } from '../core/util.js';
import { box, cyl, cone, sphere, bakeStatic } from '../core/geo.js';
import { toon, glowDynamic, own } from '../core/mats.js';
import { PAGE_SITES, PAGE_SIGHT, PAGE_LEAVE, PAGE_DUST, regionOf } from '../data/wilds.js';
import { makeElite } from '../combat/wards.js';
import { sfx, toast } from './common.js';

/** The spell book's element colours (fx recipes COLORS), for sigils, glints, rings and pins. */
export const PAGE_COLOR = { fire: 0xff8a2a, water: 0x58c6ff, ice: 0xaee9ff, wind: 0xb6f5d0, thunder: 0xb98cff, earth: 0xd6a96a };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const RANK = { seen: 1, open: 2, won: 3, read: 4 };

function glintMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `
      attribute float aOn; attribute vec3 aCol;
      uniform float uTime; uniform float uPx;
      varying float vA; varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = -mv.z;
        // gone up close (the stone itself shows), strongest 80..700 m, faded by 1300 m
        float near = smoothstep(30.0, 80.0, d), far = 1.0 - smoothstep(700.0, 1300.0, d);
        float tw = 0.72 + 0.28 * sin(uTime * 1.7 + position.x * 0.01);
        vA = aOn * near * far * tw; vC = aCol;
        gl_PointSize = (18.0 + 8.0 * tw) * uPx * step(0.001, vA);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA; varying vec3 vC;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        float ring = smoothstep(0.62, 0.7, r) * (1.0 - smoothstep(0.78, 0.9, r));
        float core = exp(-r * r * 10.0);
        float ray = max(1.0 - abs(p.x) * 9.0, 0.0) * (1.0 - abs(p.y)) * step(abs(p.y), 1.0);
        float a = (core * 0.9 + ring * 0.55 + ray * 0.6) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.5) * a * 1.3, a);
      }`,
  });
}

export function createWildPages({ wstate, tt }) {
  const sites = [];
  const byId = {};
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  let time = 0, scanT = 0, glints = null, onAttr = null;
  const named = () => !!G.state?.flags?.majo_named;
  const stateOf = (s) => wstate()?.pages[s.def.id] || null;
  const rank = (s) => RANK[stateOf(s)] || 0;
  const setState = (s, v) => { const w = wstate(); if (w) w.pages[s.def.id] = v; G.wilds && (G.wilds.markersDirty = true); };
  const fxB = (name, pos, o) => { try { G.fx?.burst?.(name, pos, o); } catch (e) { /* optional */ } };
  const name = (s) => tt('pages.' + s.def.id + '.name');
  const guardianName = (s) => t('combat.elite.' + s.def.id) + t('combat.enemy.' + s.def.id);
  const groundY = (x, z) => G.world.heightAt(x, z);
  /** world point at local (x, z) of a site (rotated by its face), y = terrain + dy */
  const local = (s, x, z, dy = 0, out = new THREE.Vector3()) => {
    const c = Math.cos(s.def.face), sn = Math.sin(s.def.face);
    const wx = s.def.x + x * c + z * sn, wz = s.def.z - x * sn + z * c;
    return out.set(wx, groundY(wx, wz) + dy, wz);
  };
  const register = (o) => G.elements?.register?.(o) || null;
  const byPlayer = (info) => !info || info.team === 'player' || info.source === G.player;

  // ---- the marker stone (every site) -----------------------------------------------------------------------------------
  function buildMarker(s, root) {
    const r = mulberry32(s.def.x * 13 + s.def.z * 7 >>> 0);
    const col = PAGE_COLOR[s.def.el];
    const stone = toon(0x8c877c), dark = toon(0x6f6a61), moss = toon(0x6f8a4a);
    const g = new THREE.Group();
    const slab = box(1.05, 2.3, 0.34, stone, 0, 1.05, 0); slab.rotation.z = (r() - 0.5) * 0.08; g.add(slab);
    g.add(box(1.25, 0.32, 0.56, dark, 0, 0.12, 0));
    const cap = box(1.12, 0.18, 0.42, dark, 0, 2.24, 0); cap.rotation.z = slab.rotation.z; g.add(cap);
    for (let k = 0; k < 5; k++) g.add(sphere(0.12 + r() * 0.1, moss, (r() - 0.5) * 1.1, 0.18 + r() * 0.1, 0.2 + r() * 0.12, 5, 4));
    // the sigil: a carved ring with the element's mark, lit from within
    s.sigilMat = glowDynamic(col, 1.6);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 28), s.sigilMat); ring.position.set(0, 1.45, 0.18);
    const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), s.sigilMat); mark.scale.set(1, 1.5, 0.3); mark.position.set(0, 1.45, 0.18);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 4, 36), s.sigilMat); band.position.set(0, 1.45, 0.175);
    for (const m of [ring, mark, band]) { m.userData.dynamic = true; m.castShadow = false; g.add(m); }
    // beside the mechanism, not in front of it (it would stop a cast aimed past it), its carved face turned to it
    local(s, 2.9, 3.1, -0.05, _v);
    g.position.copy(_v); g.rotation.y = Math.atan2(s.def.x - _v.x, s.def.z - _v.z);
    root.add(g);
    s.markerPos = _v.clone();
    G.world.addCollider?.({ x: _v.x, z: _v.z, r: 0.6, y0: _v.y - 0.5, y1: _v.y + 2.4, tag: 'wilds_page_stone' });
  }

  // ---- mechanisms --------------------------------------------------------------------------------------------------
  const MECH = {
    harp(s, root) {
      const wood = toon(0x6e5844), stone = toon(0x8f8a80), gut = glowDynamic(0xf2e8cc, 0.55);
      const g = new THREE.Group();
      g.add(box(0.55, 4.2, 0.55, stone, -1.5, 1.3, 0), box(0.55, 4.2, 0.55, stone, 1.5, 1.3, 0));
      g.add(box(3.6, 0.32, 0.42, wood, 0, 3.3, 0), box(3.3, 0.22, 0.36, wood, 0, 0.55, 0));
      g.add(cone(0.3, 0.5, stone, -1.5, 3.65, 0, 4), cone(0.3, 0.5, stone, 1.5, 3.65, 0, 4));
      s.strings = [];
      for (let k = 0; k < 7; k++) {
        const x = -1.05 + k * 0.35;
        const st = cyl(0.014, 0.014, 2.55, gut, x, 1.93, 0, 4); st.userData.dynamic = true; st.castShadow = false;
        g.add(st); s.strings.push(st);
      }
      s.gut = gut;
      local(s, 0, 0, 0, _v); g.position.copy(_v); g.rotation.y = s.def.face;
      root.add(g);
      G.world.addCollider?.({ x: _v.x, z: _v.z, r: 0.35, y0: _v.y - 0.5, y1: _v.y + 3.6, tag: 'wilds_page_harp' });
      s.mechPos = _v.clone().setY(_v.y + 1.9);
      s.reactor = register({ owner: s, kind: 'prop', material: 'wood', pos: _v.clone(), center: false, radius: 2.0, height: 3.6, flammable: 0,
        on: { hit: (rr, el, power, info) => { if (el === 'wind' && byPlayer(info)) answer(s); } } });
      s.pose = (open) => { gut.userData.setGlow(open ? 1.4 : 0.55); };
      s.tickMech = (dt) => {
        if (!(s.ring > 0)) return;
        s.ring = Math.max(0, s.ring - dt);
        for (let k = 0; k < s.strings.length; k++) s.strings[k].position.z = Math.sin(time * (38 + k * 5)) * 0.03 * s.ring;
      };
      s.react = () => { s.ring = 3.5; sfx('crystal_chime', { vol: 0.8 }); sfx('gust', { vol: 0.6 }); fxB('hit_wind', s.mechPos); G.fx?.duel?.gust?.(s.mechPos, _w.set(0, 1, 0), 6, 1.2, 4); };
    },
    rod(s, root) {
      const stone = toon(0x8a857a), dark = toon(0x6a655c), iron = toon(0x3e3a38), copper = toon(0x9a6a42);
      const g = new THREE.Group();
      g.add(cyl(1.5, 1.75, 4.4, stone, 0, 1.2, 0, 10));
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; if (k === 2) continue; g.add(box(0.7, 0.7 + (k % 2) * 0.5, 0.5, dark, Math.sin(a) * 1.35, 3.6, Math.cos(a) * 1.35)); }
      g.add(cyl(0.06, 0.08, 6.2, iron, 0, 6.5, 0, 6));
      { const bar = box(1.1, 0.06, 0.06, iron, 0, 8.6, 0); g.add(bar); g.add(cone(0.12, 0.5, iron, 0, 9.85, 0, 6)); }
      // the copper strap down the stump into the seal stone at its foot
      g.add(box(0.12, 3.5, 0.05, copper, 0, 1.75, 1.66));
      g.add(cyl(0.95, 1.05, 0.26, dark, 0, 0.13, 2.6, 12));
      s.sealMat = glowDynamic(PAGE_COLOR.thunder, 0.4);
      const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 5, 30), s.sealMat);
      glyph.rotation.x = -Math.PI / 2; glyph.position.set(0, 0.28, 2.6); glyph.userData.dynamic = true; g.add(glyph);
      local(s, 0, 0, 0, _v); g.position.copy(_v); g.rotation.y = s.def.face;
      root.add(g);
      G.world.addCollider?.({ x: _v.x, z: _v.z, r: 1.75, y0: _v.y - 0.5, y1: _v.y + 3.9, tag: 'wilds_page_rod' });
      s.rodTop = _v.clone().setY(_v.y + 9.9);
      s.sealPos = local(s, 0, 2.6, 0.3, new THREE.Vector3());
      s.mechPos = _v.clone().setY(_v.y + 4);
      s.reactor = register({ owner: s, kind: 'prop', material: 'metal', pos: _v.clone(), center: false, radius: 2.6, height: 10.5, flammable: 0,
        on: { hit: (rr, el, power, info) => { if (el === 'thunder' && byPlayer(info)) answer(s); } } });
      s.pose = (open) => { s.sealMat.userData.setGlow(open ? 1.5 : 0.4); };
      s.react = () => {
        G.fx?.lightning?.(_w.copy(s.rodTop).setY(s.rodTop.y + 24), s.rodTop, { color: PAGE_COLOR.thunder, branches: 4, dur: 0.4 });
        setTimeout(() => G.fx?.lightning?.(s.rodTop, s.sealPos, { color: PAGE_COLOR.thunder, branches: 2, dur: 0.35, impact: true }), 120);
        fxB('hit_thunder', s.sealPos, { scale: 1.4 }); sfx('thunder', { vol: 0.8 }); sfx('zap', { vol: 0.6 });
        G.fx?.flash?.(s.rodTop, PAGE_COLOR.thunder, 60, 0.3);
      };
    },
    candles(s, root) {
      const stone = toon(0x8f8a80), wax = toon(0xf0e6cc), iron = toon(0x3e3a38);
      const g = new THREE.Group();
      g.add(box(0.8, 1.8, 0.6, stone, 0, 0.4, 0), box(1.1, 0.12, 0.8, stone, 0, 1.32, 0));
      const book = box(0.7, 0.1, 0.5, toon(0x7a4a3a), 0, 1.43, 0); book.rotation.x = -0.18; g.add(book);
      s.candles = [];
      local(s, 0, 0, 0, _v); g.position.copy(_v); g.rotation.y = s.def.face;
      root.add(g);
      const flameOuter = glowDynamic(0xff8a2a, 1.7, { transparent: true, opacity: 0.9, depthWrite: false });
      const flameInner = glowDynamic(0xffe0a0, 2.2, { transparent: true, opacity: 0.95, depthWrite: false });
      for (let k = 0; k < 5; k++) {
        // each stand on its own ground (the glade is not flat), its iron foot sunk a little
        const a = k / 5 * Math.PI * 2 + 0.3, R = 3.3, h = 1.0 + (k % 2) * 0.35;
        const at = local(s, Math.sin(a) * R, Math.cos(a) * R, 0, new THREE.Vector3());
        const cg = new THREE.Group(); cg.position.copy(at);
        cg.add(cyl(0.16, 0.22, h + 0.4, iron, 0, h / 2 - 0.2, 0, 6), cyl(0.24, 0.24, 0.05, iron, 0, h + 0.02, 0, 8));
        cg.add(cyl(0.15, 0.16, 0.7, wax, 0, h + 0.4, 0, 8));
        const fl = new THREE.Group();
        const outer = cone(0.13, 0.42, flameOuter, 0, 0.21, 0, 8);
        const inner = cone(0.07, 0.26, flameInner, 0, 0.13, 0, 6);
        for (const m of [outer, inner]) { m.castShadow = false; fl.add(m); }
        fl.position.set(0, h + 0.76, 0); fl.visible = false; fl.userData.dynamic = true; cg.add(fl);
        root.add(cg);
        s.candles.push({ fl, outer, lit: false, lx: k * 1.7, pos: at.clone().setY(at.y + h + 0.76) });
      }
      for (const c of s.candles) {
        const p = c.pos;
        c.reactor = register({ owner: s, kind: 'lantern', material: 'wood', pos: p.clone().setY(p.y - 0.4), radius: 0.7, height: 0.8,
          on: { ignite: () => light(c), light: () => light(c), extinguish: () => false } });
        G.world.addCollider?.({ x: p.x, z: p.z, r: 0.22, y0: p.y - 2, y1: p.y + 0.1, tag: 'wilds_page_candle' });
      }
      const light = (c) => {
        if (c.lit) return true;
        c.lit = true; c.fl.visible = true;
        fxB('ignite', c.pos, { scale: 0.6 }); sfx('ignite', { vol: 0.5 });
        if (s.candles.every((x) => x.lit)) answer(s);
        return true;
      };
      s.mechPos = _v.clone().setY(_v.y + 1.4);
      G.world.addCollider?.({ x: _v.x, z: _v.z, r: 0.55, y0: _v.y - 0.5, y1: _v.y + 1.5, tag: 'wilds_page_lectern' });
      s.pose = (open, anim) => { for (const c of s.candles) { c.lit = anim ? c.lit || open : open; c.fl.visible = c.lit; } };
      s.tickMech = () => { for (const c of s.candles) if (c.lit) { c.outer.scale.set(1, 1 + 0.18 * Math.sin(time * 11 + c.lx), 1); c.fl.rotation.y = time * 1.3; } };
      s.react = () => { fxB('embers', s.mechPos, { scale: 1.2 }); sfx('lantern_ignite', { vol: 0.8 }); for (const c of s.candles) fxB('ignite', c.pos, { scale: 0.9 }); };
    },
    lectern(s, root) {
      const stone = toon(0x8f8a80), dark = toon(0x6d685f);
      const g = new THREE.Group();
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; const st = box(0.9, 0.7, 0.55, dark, Math.sin(a) * 2.3, -0.2, Math.cos(a) * 2.3); st.rotation.y = a; g.add(st); }
      // the lectern itself sinks into the ground; only its slanted top shows until earth lifts it
      const lec = new THREE.Group();
      lec.add(box(0.7, 1.3, 0.6, stone, 0, 0.65, 0));
      const top = box(1.1, 0.16, 0.8, stone, 0, 1.35, 0.05); top.rotation.x = -0.32; lec.add(top);
      s.leaf = glowDynamic(PAGE_COLOR.earth, 0.35);
      const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 4, 20), s.leaf); glyph.position.set(0, 1.45, 0.06); glyph.rotation.x = -0.32 - Math.PI / 2; lec.add(glyph);
      lec.userData.dynamic = true; lec.position.y = -1.0;
      g.add(lec); s.lec = lec;
      local(s, 0, 0, 0, _v); g.position.copy(_v); g.rotation.y = s.def.face;
      root.add(g);
      s.mechPos = _v.clone().setY(_v.y + 0.6);
      s.base = _v.clone();
      s.reactor = register({ owner: s, kind: 'prop', material: 'stone', pos: _v.clone(), center: false, radius: 2.0, height: 1.6, flammable: 0, immune: ['thunder'],
        on: { hit: (rr, el, power, info) => { if (el === 'earth' && byPlayer(info)) answer(s); } } });
      s.pose = (open, anim) => {
        s.leaf.userData.setGlow(open ? 1.3 : 0.35);
        if (open && !anim) { s.rise = 1; s.lec.position.y = 0; }
        if (!open) { s.rise = undefined; s.lec.position.y = -1.0; if (s.col) { s.col.dead = true; s.col = null; } }
        if (open && !s.col) s.col = G.world.addCollider?.({ x: s.base.x, z: s.base.z, r: 0.55, y0: s.base.y - 0.5, y1: s.base.y + 1.45, tag: 'wilds_page_lectern' });
      };
      s.tickMech = (dt) => {
        if (s.rise === undefined || s.rise >= 1) return;
        s.rise = Math.min(1, s.rise + dt * 0.7);
        s.lec.position.y = -1.0 * (1 - s.rise) ** 2;
        s.lec.rotation.z = Math.sin(time * 30) * 0.01 * (1 - s.rise);
        if (Math.random() < 0.3) fxB('dust', s.mechPos);
      };
      s.react = () => { s.rise = 0; sfx('rumble', { vol: 0.8 }); sfx('rock_fall', { vol: 0.5 }); fxB('dust_ring', s.base, { scale: 1.3 }); G.fx?.shake?.(0.25, 0.5); };
    },
    bud(s, root) {
      const stone = toon(0x8f8a80), mud = toon(0x6e5a44), stem = toon(0x5d7a3e);
      const g = new THREE.Group();
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; const st = box(0.95, 1.0, 0.5, stone, Math.sin(a) * 2.7, -0.1, Math.cos(a) * 2.7); st.rotation.y = a; g.add(st); }
      g.add(cyl(2.6, 2.6, 0.06, mud, 0, 0.02, 0, 24));
      g.add(cyl(0.12, 0.16, 1.0, stem, 0, 0.5, 0, 6));
      s.padMat = own(toon(0x8a7a52));   // recoloured when it blooms: never the shared cached material
      for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.4; const pad = cyl(0.5, 0.5, 0.03, s.padMat, Math.sin(a) * 1.5, 0.08, Math.cos(a) * 1.5, 12); g.add(pad); }
      // five petals hinged at the base of the bud; closed they make a tall pale bud, open they fan out
      s.petals = [];
      const petalMat = toon(0xf4dce6, { emissive: 0x3a2030 });
      const bud = new THREE.Group(); bud.position.y = 1.0; bud.userData.dynamic = true;
      for (let k = 0; k < 5; k++) {
        const hinge = new THREE.Group(); hinge.rotation.y = k / 5 * Math.PI * 2;
        const petal = sphere(0.36, petalMat, 0, 0.62, 0.12, 8, 6); petal.scale.set(0.7, 1.7, 0.3);
        const tilt = new THREE.Group(); tilt.add(petal); hinge.add(tilt); bud.add(hinge); s.petals.push(tilt);
      }
      s.heart = glowDynamic(PAGE_COLOR.water, 0.2);
      bud.add(sphere(0.2, s.heart, 0, 0.35, 0, 8, 6));
      g.add(bud);
      s.waterMat = toon(0x6fb8d8, { transparent: true, opacity: 0.78, surface: 'none', look: { spec: 1, specPower: 70, rim: 0.5 } });
      const water = cyl(2.55, 2.55, 0.05, s.waterMat, 0, 0.0, 0, 28); water.userData.dynamic = true; water.visible = false; g.add(water); s.water = water;
      local(s, 0, 0, 0, _v); g.position.copy(_v); g.rotation.y = s.def.face;
      root.add(g);
      s.mechPos = _v.clone().setY(_v.y + 1.2);
      // the bud is solid, so a water bead aimed at it bursts on it instead of flying on past
      G.world.addCollider?.({ x: _v.x, z: _v.z, r: 0.55, y0: _v.y - 0.5, y1: _v.y + 2.3, tag: 'wilds_page_bud' });
      s.reactor = register({ owner: s, kind: 'prop', material: 'wood', pos: _v.clone(), center: false, radius: 2.8, height: 2.2, flammable: 0,
        on: { hit: (rr, el, power, info) => { if (el === 'water' && byPlayer(info)) answer(s); } } });
      const openTo = (k) => { for (const p of s.petals) p.rotation.x = 0.12 + k * 1.05; s.water.visible = k > 0; s.water.position.y = -0.1 + 0.32 * k; s.heart.userData.setGlow(0.2 + 1.4 * k); };
      openTo(0);
      s.pose = (open, anim) => { if (anim) return; s.blooming = false; s.bloom = open ? 1 : 0; openTo(s.bloom); s.padMat.color.setHex(open ? 0x6a9a48 : 0x8a7a52); };
      s.tickMech = (dt) => { if (s.bloom === undefined || s.bloom >= 1 || !s.blooming) return; s.bloom = Math.min(1, s.bloom + dt * 0.45); openTo(1 - (1 - s.bloom) ** 2); };
      s.react = () => { s.blooming = true; s.bloom = 0; s.padMat.color.setHex(0x6a9a48); sfx('splash', { vol: 0.7 }); sfx('bubble', { vol: 0.6 }); fxB('splash', s.mechPos, { scale: 1.4 }); fxB('sparkle_hang', s.mechPos, { color: 0xffd8e8 }); };
    },
    spring(s, root) {
      const rock = toon(0x7f7a72), dark = toon(0x66615a), stone = toon(0x8f8a80);
      const g = new THREE.Group();
      const geo = new THREE.DodecahedronGeometry(1, 0);
      for (const [x, y, z, sx, sy, sz] of [[0, 1.6, -1.6, 2.4, 2.0, 1.4], [-1.9, 1.0, -1.4, 1.5, 1.4, 1.3], [1.8, 1.2, -1.5, 1.4, 1.6, 1.2], [0.2, 3.6, -1.8, 1.8, 1.0, 1.1], [-1.2, 2.9, -1.9, 1.0, 0.9, 0.9]]) {
        const m = new THREE.Mesh(geo, y > 2.5 ? dark : rock); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(x, y * 0.7, z * 0.3); g.add(m);
      }
      g.add(box(0.5, 0.22, 1.0, stone, 0, 3.0, -0.3));
      g.add(cyl(1.25, 1.35, 0.42, stone, 0, 0.21, 1.0, 14));
      // the falling sheet: a narrow ribbon with scrolling streaks; frozen it holds still and turns to rime
      s.sheetMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uIce: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; uniform float uIce; varying vec2 vUv;
          float h(float x){ return fract(sin(x * 91.7) * 4375.5); }
          void main(){
            float col = floor(vUv.x * 14.0);
            float flow = fract(vUv.y * 3.0 + uTime * (1.6 + h(col) * 0.8) * (1.0 - uIce));
            float streak = smoothstep(0.0, 0.25, flow) * (1.0 - smoothstep(0.55, 1.0, flow));
            vec3 water = mix(vec3(0.55, 0.78, 0.92), vec3(0.95, 0.99, 1.0), streak * 0.7);
            vec3 ice = mix(vec3(0.78, 0.92, 1.0), vec3(1.0), h(col + floor(vUv.y * 9.0)) * 0.35);
            float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
            float a = mix(0.45 + streak * 0.4, 0.88, uIce) * edge;
            gl_FragColor = vec4(mix(water, ice, uIce), a);
          }`,
      });
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 2.85), s.sheetMat);
      sheet.position.set(0, 1.55, 0.2); sheet.userData.dynamic = true; sheet.renderOrder = 4; g.add(sheet);
      s.basinMat = own(toon(0x6fb8d8, { transparent: true, opacity: 0.8, surface: 'none', look: { spec: 1, specPower: 70, rim: 0.5 } }));
      const pool = cyl(1.12, 1.12, 0.04, s.basinMat, 0, 0.36, 1.0, 20); pool.userData.dynamic = true; g.add(pool);
      s.icicles = new THREE.Group(); s.icicles.userData.dynamic = true; s.icicles.visible = false;
      const iceMat = toon(0xdff4ff, { emissive: 0x204050 });
      for (let k = 0; k < 5; k++) { const ic = cone(0.07, 0.5 + (k % 3) * 0.2, iceMat, -0.2 + k * 0.1, 2.75, -0.05, 5); ic.rotation.x = Math.PI; s.icicles.add(ic); }
      g.add(s.icicles);
      local(s, 0, 0, 0, _v); g.position.copy(_v); g.rotation.y = s.def.face;
      root.add(g);
      local(s, 0, -1.6, 0, _w);
      G.world.addCollider?.({ x: _w.x, z: _w.z, r: 2.4, y0: _w.y - 0.5, y1: _w.y + 4.2, tag: 'wilds_page_spring' });
      s.mechPos = local(s, 0, 0.2, 1.4, new THREE.Vector3());
      s.reactor = register({ owner: s, kind: 'prop', material: 'water', pos: local(s, 0, 0.4, 0, new THREE.Vector3()), center: false, radius: 1.5, height: 3.2, flammable: 0,
        on: { hit: (rr, el, power, info) => { if (el === 'ice' && byPlayer(info)) answer(s); } } });
      s.pose = (open, anim) => { if (anim) return; s.freezing = false; s.ice = open ? 1 : 0; s.sheetMat.uniforms.uIce.value = s.ice; s.icicles.visible = open; s.basinMat.color.setHex(open ? 0xd6eefa : 0x6fb8d8); };
      s.tickMech = (dt) => {
        s.sheetMat.uniforms.uTime.value = time;
        if (s.freezing && s.ice < 1) { s.ice = Math.min(1, s.ice + dt * 1.4); s.sheetMat.uniforms.uIce.value = s.ice; if (s.ice >= 1) s.icicles.visible = true; }
      };
      s.react = () => { s.freezing = true; s.ice = 0; s.basinMat.color.setHex(0xd6eefa); sfx('freeze', { vol: 0.8 }); fxB('shatter_ice', s.mechPos, { scale: 1.2 }); fxB('steam', s.mechPos); };
    },
  };

  // ---- the far glint (one point per unread site, one draw) -------------------------------------------------------------
  function buildGlints() {
    const n = sites.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), on = new Float32Array(n);
    const c = new THREE.Color();
    sites.forEach((s, i) => { pos[i * 3] = s.markerPos.x; pos[i * 3 + 1] = s.markerPos.y + 3.2; pos[i * 3 + 2] = s.markerPos.z; c.setHex(PAGE_COLOR[s.def.el]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; on[i] = 1; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    onAttr = new THREE.BufferAttribute(on, 1); onAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOn', onAttr);
    glints = new THREE.Points(g, glintMaterial());
    glints.name = 'wilds_page_glints'; glints.frustumCulled = false; glints.renderOrder = 4;
    G.scene.add(glints);
  }

  // ---- the arena ring: glyph posts round the fight, lit while the guardian is awake ----------------------------------------
  function buildRing(s) {
    const n = 18, R = s.def.arena;
    const mat = glowDynamic(PAGE_COLOR[s.def.el], 1.3, { transparent: true, opacity: 0.85, depthWrite: false });
    const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.22, 0), mat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 2.2, 1);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, x = s.center.x + Math.sin(a) * R, z = s.center.z + Math.cos(a) * R;
      m4.compose(_v.set(x, groundY(x, z) + 0.9, z), q, sc); mesh.setMatrixAt(k, m4);
    }
    mesh.frustumCulled = false; mesh.visible = false; mesh.castShadow = false; mesh.name = 'wilds_page_ring';
    G.scene.add(mesh);
    s.ringMesh = mesh; s.ringMat = mat;
  }

  // ---- the page ------------------------------------------------------------------------------------------------------
  function buildPage(s) {
    const g = new THREE.Group();
    const paper = toon(0xf3e8cc, { emissive: 0x3a3020, side: THREE.DoubleSide });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.56, 2, 2), paper);
    const pos = sheet.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 6) * 0.03);
    sheet.geometry.computeVertexNormals();
    g.add(sheet);
    s.pageGlow = glowDynamic(PAGE_COLOR[s.def.el], 1.2, { transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.5, 28), s.pageGlow); halo.position.z = -0.01; g.add(halo);
    g.visible = false; g.name = 'wilds_page';
    G.scene.add(g);
    s.page = g;
  }
  function showPage(s, from) {
    s.page.visible = true;
    s.pageFrom = (from || s.center).clone(); s.pageFrom.y = Math.max(s.pageFrom.y, groundY(s.pageFrom.x, s.pageFrom.z) + 1.4);
    s.pageTo = _v.copy(s.center).setY(groundY(s.center.x, s.center.z) + 1.5).clone();
    s.pageT = from ? 0 : 1;
  }

  // ---- the loop ------------------------------------------------------------------------------------------------------
  /** The mechanism heard its element. A sleeping seal (not yet a witch) only stirs; else the guardian wakes. */
  function answer(s) {
    const st = stateOf(s);
    if (RANK[st] >= RANK.open || s.phase !== 'idle') return;
    if (!named()) {
      if (time - (s.stirT || -99) > 6) { s.stirT = time; toast(tt('pages.toast.asleep'), { icon: s.def.el, dur: 4.5 }); fxB('glint_burst', s.mechPos, { color: PAGE_COLOR[s.def.el] }); }
      return;
    }
    setState(s, 'open');
    try { s.react?.(); } catch (e) { G.reportError('wilds:page:react', e); }
    s.pose?.(true, true);   // anim: a mechanism with its own animation (lectern, bud, spring) is left to react()
    s.sigilMat.userData.setGlow(2.2);
    toast(tt('pages.toast.seal'), { icon: s.def.el, dur: 3.5 });
    wake(s, 1.7);
  }
  function wake(s, delay) {
    s.phase = 'waking'; s.t = -delay;
    s.wakeAt = local(s, -6.5, -3.5, 0, new THREE.Vector3());   // beside the mechanism, in view of whoever woke it
    G.fx?.circle?.(s.wakeAt, { ground: true, radius: 3.4, color: PAGE_COLOR[s.def.el], dur: delay + 0.6, draw: Math.min(1.2, delay * 0.7), out: 'flare' });
    s.motes = G.fx?.emitter?.('aura_sun', { color: PAGE_COLOR[s.def.el], scale: 1.6 }) || null;
    if (s.motes) s.motes.pos.copy(s.wakeAt).setY(s.wakeAt.y + 1.2);
    sfx('charge', { vol: 0.7 });
    s.ringMesh.visible = true; s.ringMat.userData.setGlow(0.6);
  }
  function spawnGuardian(s) {
    const g = s.def.guardian, C = G.combat, def = C?.TYPES?.[g.base];
    s.motes?.remove?.(); s.motes = null;
    if (!def) { G.reportError('wilds:page', new Error('no combat type ' + g.base)); s.phase = 'idle'; return null; }
    const yaw = Math.atan2(s.center.x - s.wakeAt.x, s.center.z - s.wakeAt.z);
    // its own 'camp' (like the named elites'): beasts keep near home, and whatever it spawns (a mud spirit's splits)
    // carries the same camp, so the seal can take it all back
    s.camp = { id: s.def.id, x: s.wakeAt.x, z: s.wakeAt.z, r: s.def.arena * 0.7, alive: new Set(), pageSite: s.def.id };
    const e = C.spawn(s.def.id, s.wakeAt, { def, aggro: true, persistent: true, hpMul: g.hpMul, element: g.element, wardEl: g.ward, yaw, camp: s.camp });
    if (!e) { s.phase = 'idle'; return null; }
    e.named = s.def.id;
    e.data.pageSite = s.def.id;
    try { makeElite(e, g.affixes || []); } catch (err) { G.reportError('wilds:page:elite', err); }
    if (e.cr) e.cr.group.scale.multiplyScalar(1.15);
    s.guardian = e;
    // the entrance: a burst of the element, a flash, a slow beat, a camera angle and the guardian's name
    const at = e.centerOut ? e.centerOut(_v) : _v.copy(e.pos);
    fxB('summon', at, { color: PAGE_COLOR[s.def.el], scale: 1.8 });
    G.fx?.starburst?.(at, { radius: 3.2, color: PAGE_COLOR[s.def.el] });
    G.fx?.flash?.(at, PAGE_COLOR[s.def.el], 80, 0.35);
    G.fx?.duel?.shake?.('heavy', at);
    G.fx?.duel?.impact?.(PAGE_COLOR[s.def.el], 0.8);
    G.fx?.duel?.slowmo?.(0.35, 0.25, 0.4);
    G.fx?.duel?.angle?.(at, { dur: 1.1 });
    sfx('roar', { vol: 0.6 }); sfx('taiko', { vol: 0.7 });
    G.ui?.banner?.(guardianName(s), tt('pages.' + s.def.id + '.guardian'));
    setTimeout(() => { if (s.guardian === e && !e.dead) toast(tt('pages.' + s.def.id + '.trick'), { icon: s.def.el, dur: 7 }); }, 2600);
    s.ringMat.userData.setGlow(1.3);
    s.phase = 'fight';
    return e;
  }
  /** She left the arena, fell or the game reset: the guardian sinks back into its seal (state stays 'open'). */
  function recede(s, quiet = false) {
    const e = s.guardian;
    s.guardian = null;
    s.motes?.remove?.(); s.motes = null;
    if (e && !e.dead && G.combat?.enemies?.includes(e)) {
      if (!quiet) fxB('summon', e.centerOut ? e.centerOut(_v) : e.pos, { color: PAGE_COLOR[s.def.el], scale: 1.2 });
      G.combat.despawn(e);
    }
    clearCamp(s, quiet);
    s.phase = 'idle';
    s.ringMesh.visible = false;
    if (!quiet && G.mode === 'play' && !G.player?.dead) toast(tt('pages.toast.recede'), { icon: s.def.el, dur: 4 });
  }
  /** Whatever the guardian left behind (splits, summons) goes back into the seal with it. */
  function clearCamp(s, quiet) {
    const C = G.combat, camp = s.camp;
    s.camp = null;
    if (!C || !camp) return;
    for (const o of C.enemies.slice()) {
      if (o.camp !== camp || o.dead) continue;
      if (!quiet) fxB('summon', o.centerOut ? o.centerOut(_v) : o.pos, { color: PAGE_COLOR[s.def.el], scale: 0.7 });
      C.despawn(o);
    }
  }
  function won(s, pos) {
    s.guardian = null; s.deadT = 0;
    clearCamp(s, false);
    s.phase = 'page';
    s.ringMesh.visible = false;
    setState(s, 'won');
    showPage(s, pos);
    sfx('stinger_victory', { vol: 0.7 });
    setTimeout(() => toast(tt('pages.toast.page'), { icon: 'journal', dur: 4 }), 1400);
    G.events.emit('wilds:pageWon', { id: s.def.id, el: s.def.el });
  }
  function read(s, o = {}) {
    if (rank(s) >= RANK.read) return false;
    const el = s.def.el;
    setState(s, 'read');
    s.page.visible = false; s.phase = 'idle';
    s.sigilMat.userData.setGlow(1.0);
    onAttr.array[s.slot] = 0; onAttr.needsUpdate = true;
    const knew = (G.spells?.level?.(el) || 0) >= 2;
    if (!o.silent) { fxB('levelup', s.pageTo || s.center); sfx('ui_page', { vol: 0.7 }); }
    if (!o.silent) toast(tt('pages.' + s.def.id + '.page'), { icon: 'journal', dur: 8 });
    if (knew) {
      G.gameplay?.spawnPickup?.('stardust', (s.pageTo || s.center).clone(), PAGE_DUST);
      if (!o.silent) setTimeout(() => toast(tt('pages.toast.known', { name: t('spells.book.' + el + '.big') }), { icon: el, dur: 4.5 }), 1200);
    } else G.spells?.learn?.(el, 2, { silent: !!o.silent });
    G.events.emit('wilds:page', { id: s.def.id, el, knew });
    G.story?.save?.();
    return true;
  }
  function sight(s, o = {}) {
    if (rank(s) >= RANK.seen) return false;
    setState(s, 'seen');
    if (!o.silent) {
      toast(tt('pages.toast.seen', { name: name(s) }), { icon: s.def.el, dur: 4.5 });
      sfx('ui_page', { vol: 0.5 });
    }
    return true;
  }
  function look(s) {
    const st = stateOf(s);
    if (st === 'read') return toast(tt('pages.' + s.def.id + '.after'), { icon: s.def.el, dur: 5 });
    if (st === 'won') return read(s);
    if (!named()) return toast(tt('pages.toast.asleep'), { icon: s.def.el, dur: 5 });
    if (st === 'open' && s.phase === 'idle') return wake(s, 1.0);
    if ((G.spells?.level?.(s.def.el) || 0) < 1) return toast(tt('pages.toast.unknown', { el: t('core.element.' + s.def.el) }), { icon: s.def.el, dur: 5 });
    toast(tt('pages.' + s.def.id + '.hint'), { icon: s.def.el, dur: 6 });
  }

  // ---- build -------------------------------------------------------------------------------------------------------
  function build(def) {
    const s = { def, phase: 'idle', guardian: null, slot: sites.length, region: regionOf(def.x, def.z) };
    s.center = new THREE.Vector3(def.x, groundY(def.x, def.z), def.z);
    const root = new THREE.Group();
    buildMarker(s, root);
    MECH[def.mech](s, root);
    const baked = bakeStatic(root);
    baked.name = 'wilds_page_' + def.id;
    G.scene.add(baked);
    G.structures?.cull?.(baked, s.center, 320);
    s.root = baked;
    buildRing(s);
    buildPage(s);
    s.interact = G.interact?.add({
      getPos: (o) => o.copy(s.markerPos).setY(s.markerPos.y + 1.2), radius: 2.8, priority: 2,
      enabled: () => s.phase !== 'waking' && s.phase !== 'fight',
      prompt: () => (stateOf(s) === 'won' ? tt('prompt.pageTake') : tt('prompt.pageStone')),
      onInteract: () => look(s),
    });
    sites.push(s); byId[def.id] = s;
  }

  // ---- system ------------------------------------------------------------------------------------------------------
  return {
    sites,
    init() {
      for (const def of PAGE_SITES) { if (!MECH[def.mech]) continue; try { build(def); } catch (e) { G.reportError('wilds:page:' + def.id, e); } }
      if (sites.length) buildGlints();
      G.events.on('enemy:killed', (ev) => {
        const id = ev?.enemy?.data?.pageSite, s = id && byId[id];
        if (s && s.guardian === ev.enemy) { try { won(s, ev.pos || ev.enemy.pos); } catch (e) { G.reportError('wilds:page:won', e); } }
      });
      G.events.on('player:died', () => { for (const s of sites) if (s.phase === 'fight' || s.phase === 'waking') recede(s, true); });
      G.events.on('mode:changed', (ev) => { if (ev?.mode === 'title') for (const s of sites) if (s.phase === 'fight' || s.phase === 'waking') recede(s, true); });
    },
    start() {
      for (const s of sites) {
        if (s.phase === 'fight' || s.phase === 'waking') recede(s, true);
        const r = rank(s);
        s.pose?.(r >= RANK.open);
        s.sigilMat.userData.setGlow(r >= RANK.read ? 1.0 : r >= RANK.open ? 2.2 : 0.8);
        onAttr.array[s.slot] = r >= RANK.read ? 0 : 1;
        s.page.visible = false; s.phase = 'idle';
        if (r === RANK.won) { showPage(s, null); s.phase = 'page'; }
      }
      if (onAttr) onAttr.needsUpdate = true;
    },
    update(dt, playing) {
      time += dt;
      if (glints) { glints.material.uniforms.uTime.value = time; glints.material.uniforms.uPx.value = Math.min(2, G.renderer?.getPixelRatio?.() || 1); }
      const cam = G.camera?.position, P = G.player;
      for (const s of sites) {
        const near = !!cam && Math.abs(cam.x - s.center.x) < 300 && Math.abs(cam.z - s.center.z) < 300;
        if (near) {
          try { s.tickMech?.(dt); } catch (e) { G.reportError('wilds:page:tick', e); }
          if (rank(s) < RANK.open) s.sigilMat.userData.setGlow(0.6 + 0.35 * Math.sin(time * 2.2 + s.slot));
        }
        if (s.phase === 'waking') {
          s.t += dt;
          if (s.motes) s.motes.scale = 1.6 + 1.2 * Math.max(0, 1 + s.t);
          if (s.t >= 0) { try { spawnGuardian(s); } catch (e) { G.reportError('wilds:page:spawn', e); s.phase = 'idle'; } }
        } else if (s.phase === 'fight') {
          const e = s.guardian;
          if (e && e.dead) { s.deadT = (s.deadT || 0) + dt; if (s.deadT > 1.5) won(s, e.pos); }   // killed without the event (a silent kill)
          else if (!e || !G.combat?.enemies?.includes(e)) recede(s, true);
          else if (P && Math.hypot(P.pos.x - s.center.x, P.pos.z - s.center.z) > PAGE_LEAVE) recede(s);
          else if (e && Math.hypot(e.pos.x - s.center.x, e.pos.z - s.center.z) > s.def.arena + 14) {
            // a guardian never strays from its seal: it blinks back to the middle
            fxB('summon', e.centerOut ? e.centerOut(_v) : e.pos, { color: PAGE_COLOR[s.def.el], scale: 0.9 });
            e.pos.set(s.wakeAt.x, G.world.groundAt(s.wakeAt.x, s.wakeAt.z, s.wakeAt.y + 3) + (e.fly ? e.hover : 0), s.wakeAt.z); e.vel?.set?.(0, 0, 0);
          }
        } else if (s.phase === 'page' && s.page.visible) {
          s.pageT = Math.min(1, s.pageT + dt * 0.5);
          const k = 1 - (1 - s.pageT) ** 2;
          s.page.position.lerpVectors(s.pageFrom, s.pageTo, k);
          s.page.position.y += Math.sin(time * 1.8) * 0.08 + (1 - k) * Math.sin(time * 5) * 0.2;
          s.page.rotation.set(Math.sin(time * 1.3) * 0.15, time * 0.9, Math.sin(time * 0.8) * 0.1);
          s.pageGlow.userData.setGlow(0.9 + 0.4 * Math.sin(time * 3));
          if (playing && P && s.page.position.distanceTo(_w.copy(P.pos).setY(P.pos.y + 0.9)) < 2.3) read(s);
        } else if (s.phase === 'idle' && playing && P && stateOf(s) === 'open' && named()
          && Math.hypot(P.pos.x - s.center.x, P.pos.z - s.center.z) < s.def.arena - 6 && Math.abs(P.pos.y - s.center.y) < 20) wake(s, 1.0);
      }
      if (playing && P) {
        scanT -= dt;
        if (scanT <= 0) {
          scanT = 0.4;
          for (const s of sites) if (rank(s) < RANK.seen && Math.hypot(P.pos.x - s.center.x, P.pos.z - s.center.z) < PAGE_SIGHT && Math.abs(P.pos.y - s.center.y) < 140) sight(s);
        }
      }
    },
    markers(out) {
      for (const s of sites) {
        const r = rank(s);
        if (!r) continue;
        out.push({ x: s.center.x, z: s.center.z, icon: s.def.el, label: name(s), kind: r >= RANK.read ? 'place' : 'collectible', color: r >= RANK.read ? '#9b8a6a' : hex(PAGE_COLOR[s.def.el]) });
      }
    },
    /** Journal (lore provider): one note per site sighted — where it is, what the seal wants, what the page said. */
    notes() {
      const out = [];
      for (const s of sites) {
        const st = stateOf(s);
        if (!st) continue;
        const text = st === 'read' ? tt('pages.' + s.def.id + '.page')
          : st === 'won' ? tt('pages.journal.won')
            : st === 'open' ? tt('pages.journal.open', { name: guardianName(s), trick: tt('pages.' + s.def.id + '.trick') })
              : tt('pages.' + s.def.id + '.hint') + (named() ? '' : tt('pages.journal.asleep'));
        out.push({ id: s.def.id, title: tt('pages.journal.title', { name: name(s), region: tt('region.' + s.region) }), text });
      }
      return out;
    },
    /** Journal page places (src/ui/wilds-page.js lists them per region). */
    places(region) { return sites.filter((s) => s.region === region && rank(s) >= RANK.seen).map((s) => ({ id: s.def.id, name: name(s), scale: 'large' })); },
    counts() { return { read: sites.filter((s) => rank(s) >= RANK.read).length, of: sites.length }; },
    get: (id) => byId[id] || null,
    state: (id) => wstate()?.pages[id] || null,
    // ---- tests / debug ----
    sight: (id, o) => (byId[id] ? sight(byId[id], o) : false),
    answer: (id) => (byId[id] ? answer(byId[id]) : undefined),
    read: (id, o) => (byId[id] ? read(byId[id], o) : false),
    guardian: (id) => byId[id]?.guardian || null,
    phase: (id) => byId[id]?.phase || null,
  };
}
