// Landmark puzzles of the open country (activities round, 2026-11-22). Data: PUZZLES in src/data/wilds.js.
// Every puzzle is answered by the element system's general rules (G.elements reactors), never by a scripted key:
//   beacon  fire / sun lights the basket or lamp (kind 'lantern' reactor)        → the sealed chest beside it opens
//   bramble fire burns the dry thicket away (wood reactor, burnout)              → the chest it hid
//   rubble  thunder on stone, earth ≥ 1.1 or a heavy blow shatters it           → the chest under it
//   drift   ice on the pool (water reactor) freezes the drifting chest in place → open it before the ice melts
//   ember   water or ice (or rain) quenches the embers                          → the chest cools
//   circle  wet stones conduct: one thunder strike charging all 13 stones        → the chest rises
//   wheel   gusts spin the wind wheel (three in quick succession)               → the lid lifts
//   lantern fire warms the sky lantern: it rises and drifts on the wind          → catch it (never lost)
// State G.state.wilds.puzzles[id]: 'solved' (mechanism done, chest unopened) | 'open' (looted). Mid-states (a frozen
// pool, a flying lantern) are not saved: they are physical and simply happen again.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { mulberry32 } from '../core/util.js';
import { box, cyl, cone, sphere, bakeStatic } from '../core/geo.js';
import { toon, glow, glowDynamic } from '../core/mats.js';
import { LANDMARK_BY_ID } from '../data/landmarks.js';
import { PUZZLES } from '../data/wilds.js';
import { poolOf } from '../world/landforms/pools.js';
import { sfx, toast } from './common.js';

const rockGeo = new THREE.DodecahedronGeometry(1, 0);

export function createWildPuzzles({ resolveAt, grant, wstate, tt }) {
  const list = [];            // runtime puzzle records
  const byId = {};
  const _v = new THREE.Vector3();
  let time = 0;

  const state = (p) => wstate()?.puzzles[p.def.id];
  const setState = (p, s) => { const w = wstate(); if (w) w.puzzles[p.def.id] = s; };
  const solved = (p) => { const s = state(p); return s === 'solved' || s === 'open'; };
  const fxAt = (name, pos) => { try { G.fx?.burst?.(name, pos); } catch (e) { /* optional */ } };

  // ---- shared pieces -----------------------------------------------------------------------------------------------
  function makeChestAt(pos, yaw, solid = true) {
    let h = G.structures?.factories?.makeChest?.() || null;
    if (!h) {
      const g = new THREE.Group();
      g.add(box(0.9, 0.55, 0.6, toon(0x7a5232), 0, 0.28, 0));
      const lid = box(0.92, 0.18, 0.62, toon(0x8a6040), 0, 0.64, 0); g.add(lid);
      h = { group: g, opened: false, open() { h.opened = true; lid.rotation.x = -1.1; lid.position.set(0, 0.85, -0.25); }, close() { h.opened = false; lid.rotation.x = 0; lid.position.set(0, 0.64, 0); } };
    }
    h.group.position.copy(pos); h.group.rotation.y = yaw;
    // draw-call pass: the holder (at the origin) takes the distance cut; the chest's own visible flag stays free
    const holder = new THREE.Group(); holder.name = 'wildsChestHolder'; holder.add(h.group);
    G.scene.add(holder);
    G.structures?.cull?.(holder, pos, 220);
    // solid, so a spell aimed at it bursts on it (projectiles stop on world colliders, not on neutral reactors)
    if (solid) h.col = G.world.addCollider({ x: pos.x, z: pos.z, r: 0.5, y0: pos.y - 0.5, y1: pos.y + 0.75, tag: 'wilds_chest' });
    return h;
  }
  /** a chest interact: unsolved → a hint (the puzzle's own words), solved → open it */
  function chestInteract(p, getPos) {
    p.interact = G.interact?.add({
      getPos: (o) => o.copy(getPos()).setY(getPos().y + 0.5), radius: 2.7, priority: 2, broom: true,
      enabled: () => state(p) !== 'open' && p.chest && p.chest.group.visible && (!p.canTouch || p.canTouch()),
      prompt: () => (solved(p) || p.openable?.() ? tt('prompt.open') : tt('prompt.look')),
      onInteract: () => {
        if (solved(p) || p.openable?.()) openChest(p);
        else { toast(tt('hint.' + p.def.kind), { icon: 'eye', dur: 4.5 }); p.seen = true; }
      },
    });
  }
  function openChest(p, o = {}) {
    if (state(p) === 'open') return false;
    setState(p, 'open');
    p.chest?.open?.(!!o.silent);
    const at = p.chest ? p.chest.group.position : p.pos;
    if (!o.silent) { fxAt('levelup', at); sfx('chest_open'); sfx('ui_chime', { vol: 0.6 }); toast(tt('toast.chest'), { icon: 'chest', dur: 3 }); }
    grant(p.def.loot, at, o);
    G.events.emit('wilds:chest', { id: p.def.id, lm: p.def.lm });
    p.onOpened?.();
    G.wilds && (G.wilds.markersDirty = true);
    return true;
  }
  function solve(p, o = {}) {
    if (solved(p)) return false;
    setState(p, 'solved');
    if (!o.silent) { toast(tt('toast.solved.' + p.def.kind), { icon: 'quest', dur: 4 }); sfx('crystal_chime'); }
    p.onSolved?.(o);
    G.events.emit('wilds:solved', { id: p.def.id, kind: p.def.kind, lm: p.def.lm });
    G.wilds && (G.wilds.markersDirty = true);
    return true;
  }
  const yawTo = (from, lm) => { const l = LANDMARK_BY_ID[lm]; return l ? Math.atan2(l.x - from.x, l.z - from.z) : 0; };
  const register = (o) => G.elements?.register?.(o) || null;

  // ---- flames (beacon, lighthouse, embers): flickering glow cones, only animated near ----------------------------------
  function flame(scale = 1) {
    const g = new THREE.Group();
    const outer = cone(0.55 * scale, 1.5 * scale, glowDynamic(0xff7a2a, 1.6, { transparent: true, opacity: 0.85, depthWrite: false }), 0, 0.75 * scale, 0, 9);
    const inner = cone(0.3 * scale, 1.0 * scale, glowDynamic(0xffd27a, 2.0, { transparent: true, opacity: 0.9, depthWrite: false }), 0, 0.5 * scale, 0, 8);
    for (const m of [outer, inner]) { m.castShadow = false; g.add(m); }
    g.userData.tick = (t) => {
      outer.scale.set(1 + 0.1 * Math.sin(t * 13), 1 + 0.18 * Math.sin(t * 9.3) + 0.08 * Math.sin(t * 21), 1 + 0.1 * Math.cos(t * 11));
      inner.scale.set(1, 1 + 0.2 * Math.sin(t * 15.7), 1);
      g.rotation.y = t * 1.4;
    };
    return g;
  }

  // ---- kinds -------------------------------------------------------------------------------------------------------
  const KINDS = {
    beacon(p) {
      const d = p.def;
      p.pos = resolveAt(d.lm, d.target, new THREE.Vector3());
      const cpos = resolveAt(d.lm, d.chest, new THREE.Vector3());
      p.chest = makeChestAt(cpos, yawTo(cpos, d.lm) + Math.PI);
      // a faded seal over the lid until the fire is lit (a ring of pale glyph light)
      p.seal = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 28), glowDynamic(0xffc07a, 1.1, { transparent: true, opacity: 0.7, depthWrite: false }));
      p.seal.rotation.x = Math.PI / 2; p.seal.position.copy(cpos).setY(cpos.y + 0.95); G.scene.add(p.seal);
      p.flame = flame(d.lm === 'cape_lighthouse' ? 0.7 : 1.9); p.flame.position.copy(p.pos).setY(p.pos.y - (d.lm === 'cape_lighthouse' ? 0.4 : 0.5)); p.flame.visible = false; G.scene.add(p.flame);
      if (d.lm === 'cape_lighthouse') {
        // the lamp's sweep: two long soft beams that turn slowly once it is lit
        const bm = glow(0xfff0c8, 0.32, { transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        const g = new THREE.Group();
        for (const s of [1, -1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(4.5, 70, 14, 1, true), bm); c.rotation.z = s * Math.PI / 2; c.position.x = s * 35.5; g.add(c); }
        g.position.copy(p.pos); g.visible = false; G.scene.add(g); p.sweep = g;
      }
      const lit = () => { if (p.lit) return true; light(p); return true; };
      p.col = G.world.addCollider({ x: p.pos.x, z: p.pos.z, r: d.lm === 'cape_lighthouse' ? 1.4 : 1.0, y0: p.pos.y - 1.0, y1: p.pos.y + 0.6, tag: 'wilds_beacon' });
      p.reactor = register({ owner: p, kind: 'lantern', material: 'metal', pos: p.pos.clone().setY(p.pos.y - 0.8), radius: 1.6, height: 1.8,
        on: { ignite: lit, light: lit, extinguish: () => false } });
      chestInteract(p, () => cpos);
      p.canTouch = null;
      p.onSolved = () => { if (p.seal) p.seal.visible = false; };
      p.restore = () => { if (solved(p)) { light(p, true); } if (state(p) === 'open') p.chest.open(true); };
    },
    bramble(p) {
      const d = p.def;
      p.pos = resolveAt(d.lm, d.at, new THREE.Vector3());
      p.chest = makeChestAt(p.pos, yawTo(p.pos, d.lm) + Math.PI);
      // the thicket: a dome of dry, crooked canes round the chest
      const r = mulberry32(Math.round(p.pos.x * 7 + p.pos.z * 13) >>> 0);
      const g = new THREE.Group();
      const cane = toon(0x5a4634), dry = toon(0x7a6a48), leaf = toon(0x56603a);
      for (let k = 0; k < 26; k++) {
        const a = r() * 6.283, d0 = 0.6 + r() * 1.1, h = 1.2 + r() * 1.1;
        const c = cyl(0.025, 0.05, h, k % 3 ? cane : dry, Math.sin(a) * d0, h * 0.42, Math.cos(a) * d0, 4);
        c.rotation.set((r() - 0.5) * 1.6, r() * 3, (r() - 0.5) * 1.6); g.add(c);
      }
      for (let k = 0; k < 9; k++) { const a = r() * 6.283, d0 = 0.5 + r() * 1.2; const s = sphere(0.3 + r() * 0.25, k % 2 ? leaf : dry, Math.sin(a) * d0, 0.4 + r() * 1.1, Math.cos(a) * d0, 5, 4); s.scale.y = 0.6; g.add(s); }
      p.thicket = bakeStatic(g); p.thicket.position.copy(p.pos); G.scene.add(p.thicket);
      p.col = G.world.addCollider({ x: p.pos.x, z: p.pos.z, r: 1.55, y0: p.pos.y - 1, y1: p.pos.y + 2.2, tag: 'wilds_bramble' });
      p.reactor = register({ owner: p, kind: 'prop', material: 'wood', pos: p.pos.clone(), center: false, radius: 1.7, height: 2.0, flammable: 1, burnTime: 6,
        on: { burnout: () => solve(p) } });
      chestInteract(p, () => p.pos);
      p.canTouch = () => solved(p);
      p.onSolved = (o) => clearThicket(p, o);
      p.restore = () => { if (solved(p)) clearThicket(p, { silent: true }); if (state(p) === 'open') p.chest.open(true); };
    },
    rubble(p) {
      const d = p.def;
      p.pos = resolveAt(d.lm, d.at, new THREE.Vector3());
      p.chest = makeChestAt(p.pos, yawTo(p.pos, d.lm) + Math.PI);
      const r = mulberry32(Math.round(p.pos.x * 11 + p.pos.z * 5) >>> 0);
      const g = new THREE.Group(), m1 = toon(0x8f8a80), m2 = toon(0x7d776c);
      for (let k = 0; k < 11; k++) {
        const a = k / 11 * 6.283 + r() * 0.4, d0 = k < 8 ? 0.95 + r() * 0.5 : 0.25 * r();
        const o = new THREE.Mesh(rockGeo, k % 2 ? m1 : m2);
        const s = k < 8 ? 0.55 + r() * 0.35 : 0.75 + r() * 0.2;
        o.scale.set(s, s * (0.7 + r() * 0.3), s); o.position.set(Math.sin(a) * d0, k < 8 ? s * 0.5 : 1.0 + r() * 0.3, Math.cos(a) * d0); o.rotation.set(r() * 3, r() * 3, r() * 3);
        g.add(o);
      }
      p.pile = bakeStatic(g); p.pile.position.copy(p.pos); G.scene.add(p.pile);
      p.col = G.world.addCollider({ x: p.pos.x, z: p.pos.z, r: 1.6, y0: p.pos.y - 1, y1: p.pos.y + 1.9, tag: 'wilds_rubble' });
      const smash = () => { solve(p); return true; };
      p.reactor = register({ owner: p, kind: 'prop', material: 'stone', pos: p.pos.clone(), center: false, radius: 1.8, height: 1.8,
        on: { shatter: smash, hit: (rr, el, power, info) => { if ((el === 'earth' && power >= 1.1) || (info && info.heavy && el !== 'water' && el !== 'wind')) smash(); } } });
      chestInteract(p, () => p.pos);
      p.canTouch = () => solved(p);
      p.onSolved = (o) => breakPile(p, o);
      p.restore = () => { if (solved(p)) breakPile(p, { silent: true }); if (state(p) === 'open') p.chest.open(true); };
    },
    drift(p) {
      const d = p.def, l = LANDMARK_BY_ID[d.lm];
      const pool = poolOf(G.world, l);
      p.pool = pool;
      p.center = resolveAt(d.lm, d.at, new THREE.Vector3());
      p.pos = p.center.clone();
      p.ang = 0; p.orbit = Math.max(1.2, (pool?.r || 5) * 0.5); p.vel = 0.25;
      p.chest = makeChestAt(p.pos, 0, false);
      p.chest.group.scale.setScalar(0.85);
      const bottom = Math.min(G.world.heightAt(p.center.x, p.center.z), p.center.y - 0.5);
      // ice sheet over the pool once frozen
      const R = (pool?.r || 5) + 0.7;
      const ice = new THREE.Mesh(new THREE.CircleGeometry(R, 32), toon(0xd8f0ff, { transparent: true, opacity: 0.82, surface: 'none', look: { spec: 1, specPower: 80, rim: 0.6 } }));
      ice.rotation.x = -Math.PI / 2; ice.position.copy(p.center).setY(p.center.y + 0.05); ice.visible = false; ice.renderOrder = 4; G.scene.add(ice);
      p.ice = ice;
      p.reactor = register({ owner: p, kind: 'prop', material: 'water', pos: p.center.clone().setY(bottom - 0.2), center: false, radius: R, height: p.center.y - bottom + 0.9, flammable: 0,
        on: {
          freeze: (rr) => { rr.frozen = Math.max(rr.frozen, 40); setFrozen(p, true); },
          thaw: () => setFrozen(p, false),
        } });
      p.frozen = false;
      p.openable = () => p.frozen;
      chestInteract(p, () => p.chest.group.position);
      p.canTouch = null;
      p.onOpened = () => { setFrozen(p, p.frozen); };
      p.restore = () => { if (state(p) === 'open') { p.chest.open(true); p.chest.group.visible = false; } };
      p.tick = (dt, near) => {
        if (state(p) === 'open' || p.frozen || !near) return;
        // drift round the pool; when she reaches for it, it slips to the far side
        const P = G.player;
        let target = p.ang + p.vel * dt;
        if (P) {
          const dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z;
          if (dx * dx + dz * dz < 25 && Math.abs(P.pos.y - p.pos.y) < 4) {
            const away = Math.atan2(p.center.x - P.pos.x, p.center.z - P.pos.z);
            let da = away - p.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
            target = p.ang + Math.sign(da) * Math.min(Math.abs(da), 1.6 * dt);
            if (!p.slipT || time - p.slipT > 3) { p.slipT = time; sfx('splash', { vol: 0.3 }); fxAt('splash', p.pos); }
          }
        }
        p.ang = target;
        p.pos.set(p.center.x + Math.sin(p.ang) * p.orbit, p.center.y - 0.18 + Math.sin(time * 1.7) * 0.06, p.center.z + Math.cos(p.ang) * p.orbit);
        p.chest.group.position.copy(p.pos);
        p.chest.group.rotation.set(Math.sin(time * 1.3) * 0.06, p.ang * 1.5, Math.cos(time * 1.1) * 0.05);
      };
    },
    ember(p) {
      const d = p.def;
      p.pos = resolveAt(d.lm, d.at, new THREE.Vector3());
      p.chest = makeChestAt(p.pos, yawTo(p.pos, d.lm) + Math.PI);
      // the ember bed: dark ash with glowing coals, small flames licking the chest's flanks
      const g = new THREE.Group();
      g.add(cyl(1.25, 1.35, 0.12, toon(0x2e2622), 0, 0.03, 0, 14));
      p.coalMat = glowDynamic(0xff6a20, 1.4);
      const r = mulberry32(77);
      for (let k = 0; k < 14; k++) { const a = r() * 6.283, d0 = 0.55 + r() * 0.65; g.add(sphere(0.1 + r() * 0.08, p.coalMat, Math.sin(a) * d0, 0.1, Math.cos(a) * d0, 5, 4)); }
      p.bed = g; g.position.copy(p.pos); G.scene.add(g);
      p.flames = [flame(0.45), flame(0.35)];
      p.flames[0].position.set(p.pos.x + 0.7, p.pos.y + 0.1, p.pos.z + 0.3); p.flames[1].position.set(p.pos.x - 0.6, p.pos.y + 0.1, p.pos.z - 0.4);
      for (const f of p.flames) G.scene.add(f);
      const quench = () => { solve(p); return true; };
      p.reactor = register({ owner: p, kind: 'prop', material: 'stone', pos: p.pos.clone(), center: false, radius: 1.5, height: 1.2,
        on: { wet: quench, hit: (rr, el) => { if (el === 'water' || el === 'ice') quench(); } } });
      chestInteract(p, () => p.pos);
      p.canTouch = null;
      p.onSolved = (o) => { coolEmbers(p, o); };
      p.restore = () => { if (solved(p)) coolEmbers(p, { silent: true }); if (state(p) === 'open') p.chest.open(true); };
    },
    circle(p) {
      const d = p.def, l = LANDMARK_BY_ID[d.lm];
      const site = G.structures?.places?.['lm_' + d.lm]?.site;
      // the thirteen stones exactly as world/builders/landmarks.js stoneCircle() placed them (same seeded draws)
      const r = mulberry32(Math.round(l.x * 31 + l.z * 17) >>> 0);
      p.stones = [];
      for (let k = 0; k < 13; k++) {
        const a = k / 13 * Math.PI * 2 + (r() - 0.5) * 0.1, R = 11 + (r() - 0.5);
        const lx = Math.sin(a) * R, lz = Math.cos(a) * R;
        let h = 0.8;
        if (k !== 7) { h = 1.8 + r() * 1.5; r(); r(); }
        const x = site ? site.wx(lx, lz) : l.x + lx, z = site ? site.wz(lx, lz) : l.z + lz, g = G.world.heightAt(x, z) - 0.4;
        p.stones.push({ k, x, z, g, h, a, charged: -99 });
      }
      // a rune band on each stone's inner face: dark until charged
      p.runeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      p.runes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 1.0), p.runeMat, 13);
      p.runes.frustumCulled = false; p.runes.name = 'wilds_runes';
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
      p.stones.forEach((s, i) => {
        const inward = s.a + Math.PI, off = s.k === 7 ? 0.45 : 0.48;
        const y = s.k === 7 ? s.g + 0.9 : s.g + Math.min(s.h * 0.55, 1.6);
        q.setFromAxisAngle(up, inward);
        if (s.k === 7) { const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); q.multiply(tilt); }
        m4.compose(new THREE.Vector3(s.x - Math.sin(s.a) * off, y, s.z - Math.cos(s.a) * off), q, s1);
        p.runes.setMatrixAt(i, m4);
        p.runes.setColorAt(i, new THREE.Color(0x202a33));
        s.reactor = register({ owner: p, kind: 'prop', material: 'stone', pos: new THREE.Vector3(s.x, s.g, s.z), center: false, radius: s.k === 7 ? 0.9 : 0.55, height: s.h, immune: ['thunder'], flammable: 0,
          on: {
            wet: (rr) => { rr.immune.delete('thunder'); },
            dry: (rr) => { rr.immune.add('thunder'); },
            hit: (rr, el) => { if (el === 'thunder') { s.charged = time; runeColor(p, i); } },
          } });
      });
      p.runes.instanceColor.setUsage(THREE.DynamicDrawUsage);
      G.scene.add(p.runes);
      p.pos = resolveAt(d.lm, { x: 0, z: 0, y: ['h0', 0.4] }, new THREE.Vector3());
      // the centre stone: a look tells what the runes want
      p.look = G.interact?.add({ pos: p.pos.clone(), radius: 2.8, priority: 1, enabled: () => !solved(p), prompt: () => tt('prompt.look'),
        onInteract: () => { toast(tt('hint.circle'), { icon: 'eye', dur: 5 }); p.seen = true; } });
      const cpos = resolveAt(d.lm, d.chest, new THREE.Vector3());
      p.chestY = cpos.y;
      p.chest = makeChestAt(cpos, yawTo(cpos, d.lm) + Math.PI);
      p.chest.group.position.y = cpos.y - 1.4; p.chest.group.visible = false;
      chestInteract(p, () => p.chest.group.position);
      p.canTouch = () => solved(p);
      p.onSolved = (o) => { p.rise = o.silent ? 1 : 0; p.chest.group.visible = true; for (let i = 0; i < 13; i++) runeColor(p, i); };
      p.restore = () => { if (solved(p)) { p.rise = 1; p.chest.group.visible = true; p.chest.group.position.y = p.chestY; for (let i = 0; i < 13; i++) runeColor(p, i); } if (state(p) === 'open') p.chest.open(true); };
      p.tick = (dt, near) => {
        if (!near) return;
        if (p.rise !== undefined && p.rise < 1) { p.rise = Math.min(1, p.rise + dt * 0.6); p.chest.group.position.y = p.chestY - 1.4 * (1 - p.rise) ** 2; if (p.rise < 1 && Math.random() < 0.2) fxAt('dust', p.chest.group.position); }
        // fading charge on the runes
        let need = false;
        for (let i = 0; i < 13; i++) if (time - p.stones[i].charged < 3.2) { runeColor(p, i); need = true; }
        if (need && !solved(p)) {
          const t0 = Math.min(...p.stones.map((s) => s.charged));
          if (time - t0 < 1.5) solve(p);
        }
      };
    },
    wheel(p) {
      const d = p.def;
      p.pos = resolveAt(d.lm, d.at, new THREE.Vector3());
      // a weathered post with a six-vaned wind wheel; the box at its foot is geared to the shaft
      const g = new THREE.Group(), wood = toon(0x6e5844), vane = toon(0xd9cdb0), iron = toon(0x4a4440);
      g.add(cyl(0.12, 0.16, 3.4, wood, 0, 1.7, 0, 7));
      { const ax = cyl(0.08, 0.08, 0.5, iron, 0, 3.45, 0.18, 6); ax.rotation.x = Math.PI / 2; g.add(ax); }
      p.post = bakeStatic(g); p.post.position.copy(p.pos); G.scene.add(p.post);
      const rotor = new THREE.Group();
      for (let k = 0; k < 6; k++) { const arm = new THREE.Group(); arm.rotation.z = k / 6 * Math.PI * 2; arm.add(box(0.06, 1.1, 0.04, wood, 0, 0.6, 0)); const v = box(0.34, 0.7, 0.03, vane, 0.16, 0.8, 0); v.rotation.y = 0.5; arm.add(v); rotor.add(arm); }
      { const hub = cyl(0.12, 0.12, 0.14, iron, 0, 0, 0, 8); hub.rotation.x = Math.PI / 2; rotor.add(hub); }
      const yaw = yawTo(p.pos, d.lm);
      rotor.position.set(p.pos.x + Math.sin(yaw) * 0.45, p.pos.y + 3.45, p.pos.z + Math.cos(yaw) * 0.45); rotor.rotation.y = yaw;
      G.scene.add(rotor); p.rotor = rotor;
      const cpos = p.pos.clone().add(new THREE.Vector3(Math.sin(yaw + 1.6) * 1.1, 0, Math.cos(yaw + 1.6) * 1.1));
      cpos.y = G.world.heightAt(cpos.x, cpos.z);
      p.chest = makeChestAt(cpos, yaw);
      p.spin = 0; p.angle = 0;
      p.col = G.world.addCollider({ x: p.pos.x, z: p.pos.z, r: 0.25, y0: p.pos.y - 1, y1: p.pos.y + 3.6, tag: 'wilds_wheel' });
      p.reactor = register({ owner: p, kind: 'prop', material: 'wood', pos: p.pos.clone(), center: false, radius: 1.3, height: 4.2, flammable: 0,
        on: { hit: (rr, el, power) => { if (el === 'wind') { p.spin = Math.min(5, p.spin + 1.15 * Math.max(0.7, power)); if (p.spin >= 2.8) solve(p); } } } });
      chestInteract(p, () => cpos);
      p.canTouch = null;
      p.onSolved = (o) => { if (!o.silent) { fxAt('hit_wind', p.chest.group.position); sfx('gust', { vol: 0.6 }); } };
      p.restore = () => { if (state(p) === 'open') p.chest.open(true); };
      p.tick = (dt, near) => {
        if (!near) return;
        p.spin = Math.max(0, p.spin - dt * 0.2);
        const breeze = 0.25 * (G.journeyWeather?.state?.wind || 1);
        p.angle += dt * (breeze + p.spin * 4.2 + (solved(p) ? 0.6 : 0));
        p.rotor.children.forEach((a, k) => { if (k < 6) a.rotation.z = k / 6 * Math.PI * 2 + p.angle; });
      };
    },
    lantern(p) {
      const d = p.def;
      p.home = resolveAt(d.lm, d.at, new THREE.Vector3());
      p.pos = p.home.clone();
      // a paper sky lantern on a peg: tapered warm paper over a bamboo hoop, a dry wick inside
      const g = new THREE.Group();
      p.paper = glowDynamic(0xf6e4c2, 1.0, { transparent: true, opacity: 0.94 }); p.paper.userData.setGlow(0.9);
      const body = cyl(0.42, 0.3, 0.9, p.paper, 0, 0.75, 0, 12); g.add(body);
      g.add(cyl(0.42, 0.42, 0.05, toon(0x8c7350), 0, 1.2, 0, 12));
      g.add(cyl(0.425, 0.4, 0.12, toon(0xb5473d), 0, 1.1, 0, 12));   // a red paper band under the rim
      g.add(cyl(0.3, 0.3, 0.04, toon(0x8c7350), 0, 0.3, 0, 12));
      p.wick = sphere(0.08, glowDynamic(0xffb050, 0.2), 0, 0.35, 0, 6, 4); g.add(p.wick);
      p.lant = g; g.position.copy(p.pos); G.scene.add(g);
      p.peg = cyl(0.03, 0.04, 0.5, toon(0x6e5844), p.home.x + 0.5, p.home.y + 0.22, p.home.z, 5); G.scene.add(p.peg);
      p.phase = 'idle';
      p.col = G.world.addCollider({ x: p.home.x, z: p.home.z, r: 0.45, y0: p.home.y - 0.3, y1: p.home.y + 1.3, tag: 'wilds_lantern' });
      const warm = () => { if (p.phase !== 'idle' || state(p) === 'open') return false; launch(p); return true; };
      p.reactor = register({ owner: p, kind: 'lantern', material: 'paper', getPos: () => p.pos, radius: 0.8, height: 1.3,
        on: { ignite: warm, light: warm, extinguish: () => false } });
      p.interact = G.interact?.add({ getPos: (o) => o.copy(p.pos).setY(p.pos.y + 0.6), radius: 2.4, priority: 2,
        enabled: () => p.phase === 'idle' && state(p) !== 'open', prompt: () => tt('prompt.look'),
        onInteract: () => { toast(tt('hint.lantern'), { icon: 'eye', dur: 4.5 }); p.seen = true; } });
      p.restore = () => {
        p.phase = state(p) === 'open' ? 'done' : 'idle'; p.lant.visible = p.phase !== 'done'; p.pos.copy(p.home); p.lant.position.copy(p.home);
        p.wick.material.userData.setGlow(0.2); p.paper.userData.setGlow(0.9);
        if (p.phase === 'done' && p.col) { p.col.dead = true; p.col = null; }
        if (p.phase === 'idle' && !p.col) p.col = G.world.addCollider({ x: p.home.x, z: p.home.z, r: 0.45, y0: p.home.y - 0.3, y1: p.home.y + 1.3, tag: 'wilds_lantern' });
      };
      p.tick = (dt, near) => {
        if (p.phase !== 'rise' && p.phase !== 'settle' && p.phase !== 'rest') return;
        const P = G.player;
        p.t += dt;
        if (p.phase === 'rise') {
          // hot air lifts it; the wind carries it (G.elements.windAt), with a slow wander of its own
          const w = G.elements?.windAt?.(p.pos, _v) || _v.set(0, 0, 0);
          p.vy = Math.min(2.4, p.vy + dt * 0.9);
          p.pos.x += (w.x * 0.55 + Math.sin(p.t * 0.31 + p.seed) * 0.9) * dt;
          p.pos.z += (w.z * 0.55 + Math.cos(p.t * 0.27 + p.seed) * 0.9) * dt;
          p.pos.y += p.vy * dt;
          if (p.t > 55 || p.pos.y - G.world.heightAt(p.pos.x, p.pos.z) > 95) p.phase = 'settle';
        } else if (p.phase === 'settle') {
          // the flame gutters and it sinks gently to wherever it is, still glowing: never lost
          const g = G.world.groundAt(p.pos.x, p.pos.z);
          p.pos.y = Math.max(g, p.pos.y - dt * 1.6);
          if (p.pos.y <= g + 0.01) p.phase = 'rest';
        }
        p.lant.position.copy(p.pos);
        p.lant.rotation.set(Math.sin(p.t * 1.1) * 0.08, p.t * 0.4, Math.cos(p.t * 0.9) * 0.08);
        p.paper.userData.setGlow(1.35 + 0.12 * Math.sin(p.t * 9));
        if (P && P.pos.distanceTo(p.pos) < 2.6 + (P.onBroom ? 0.6 : 0)) catchLantern(p);
      };
    },
  };

  // ---- kind helpers ------------------------------------------------------------------------------------------------
  function light(p, quiet = false) {
    p.lit = true;
    p.flame.visible = true;
    if (p.sweep) p.sweep.visible = true;
    if (!p.light && G.elements?.addLight) p.light = G.elements.addLight({ pos: p.pos.clone(), radius: p.def.lm === 'cape_lighthouse' ? 34 : 26, intensity: 1.4 });
    if (!quiet) { fxAt('lantern_ignite', p.pos); sfx('ignite'); solve(p); }
  }
  function clearThicket(p, o = {}) {
    if (p.col) p.col.dead = true;
    if (p.reactor) { G.elements?.unregister?.(p.reactor); p.reactor = null; }
    if (!p.thicket) return;
    if (o.silent) { p.thicket.visible = false; return; }
    fxAt('embers', p.pos); fxAt('dust', p.pos);
    p.shrink = 1;
  }
  function breakPile(p, o = {}) {
    if (p.col) p.col.dead = true;
    if (p.reactor) { G.elements?.unregister?.(p.reactor); p.reactor = null; }
    if (!p.pile) return;
    p.pile.visible = false;
    if (o.silent) return;
    fxAt('dust', p.pos); sfx('shatter_rock');
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * 6.283;
      try { G.props?.debris?.('rock', p.pos.clone().setY(p.pos.y + 0.8 + Math.random()), new THREE.Vector3(Math.sin(a) * 4, 4 + Math.random() * 3, Math.cos(a) * 4), { scale: 0.5 + Math.random() * 0.5 }); } catch (e) { /* optional */ }
    }
  }
  function coolEmbers(p, o = {}) {
    p.hot = false;
    for (const f of p.flames) f.visible = false;
    p.coalMat.userData.setGlow(0.06);
    if (!o.silent) { fxAt('steam', p.pos.clone().setY(p.pos.y + 0.6)); sfx('steam_sizzle'); }
  }
  function setFrozen(p, on) {
    if (state(p) === 'open') { p.ice.visible = on; if (!on && p.plat) { p.plat.dead = true; p.plat = null; } p.frozen = on; return; }
    p.frozen = on;
    p.ice.visible = on;
    if (on && !p.plat) p.plat = G.world.addPlatform?.({ x: p.center.x, z: p.center.z, r: (p.pool?.r || 5) + 0.4, top: p.center.y + 0.06, thick: 0.4 }) || null;
    if (!on && p.plat) { p.plat.dead = true; p.plat = null; }
    if (on) { p.chest.group.position.y = p.center.y - 0.12; p.chest.group.rotation.set(0, p.ang * 1.5, 0); }
  }
  function launch(p) {
    p.phase = 'rise'; p.t = 0; p.vy = 0.2; p.seed = Math.random() * 6;
    if (p.col) { p.col.dead = true; p.col = null; }
    p.wick.material.userData.setGlow(2.4);
    fxAt('ignite', p.pos); sfx('ignite');
    toast(tt('toast.lanternUp'), { icon: 'fire', dur: 3.5 });
  }
  function catchLantern(p) {
    p.phase = 'done';
    p.lant.visible = false;
    setState(p, 'open');
    fxAt('levelup', p.pos); fxAt('moon_motes', p.pos); sfx('sparkle'); sfx('ui_chime', { vol: 0.6 });
    toast(tt('toast.lanternCaught'), { icon: 'star', dur: 3.5 });
    grant(p.def.loot, p.pos);
    G.events.emit('wilds:solved', { id: p.def.id, kind: 'lantern', lm: p.def.lm });
    G.events.emit('wilds:chest', { id: p.def.id, lm: p.def.lm });
    G.wilds && (G.wilds.markersDirty = true);
  }
  function runeColor(p, i) {
    const s = p.stones[i], k = Math.max(0, 1 - (time - s.charged) / 3.2);
    const base = solved(p) ? 0.45 : 0;
    const c = new THREE.Color().setRGB(0.12 + 0.6 * Math.max(k, base) , 0.16 + 0.75 * Math.max(k, base), 0.2 + 0.85 * Math.max(k, base));
    p.runes.setColorAt(i, c); p.runes.instanceColor.needsUpdate = true;
  }

  // ---- system ------------------------------------------------------------------------------------------------------
  return {
    list,
    init() {
      for (const def of PUZZLES) {
        if (!LANDMARK_BY_ID[def.lm] || !KINDS[def.kind]) continue;
        const p = { def, seen: false };
        try { KINDS[def.kind](p); } catch (e) { G.reportError('wilds:puzzle:' + def.id, e); continue; }
        list.push(p); byId[def.id] = p;
      }
    },
    start() { for (const p of list) { try { p.restore?.(); } catch (e) { G.reportError('wilds:restore:' + p.def.id, e); } } },
    update(dt, playing) {
      time += dt;
      const cam = G.camera?.position, P = G.player;
      for (const p of list) {
        const ref = p.pos || p.center || p.home;
        const near = !!cam && ref && Math.abs(cam.x - ref.x) < 260 && Math.abs(cam.z - ref.z) < 260;
        if (near && p.flame?.visible) p.flame.userData.tick(time);
        if (near && p.flames) for (const f of p.flames) if (f.visible) f.userData.tick(time);
        if (p.sweep?.visible) p.sweep.rotation.y = time * 0.5;
        if (p.shrink !== undefined && p.thicket?.visible) { p.shrink -= dt * 0.8; p.thicket.scale.set(1, Math.max(0.01, p.shrink), 1); if (p.shrink <= 0) p.thicket.visible = false; }
        p.tick?.(dt, near);
        if (playing && P && !p.seen && ref && Math.abs(P.pos.x - ref.x) < 40 && Math.abs(P.pos.z - ref.z) < 40) { p.seen = true; const w = wstate(); if (w && !w.seen[p.def.id]) { w.seen[p.def.id] = 1; G.wilds && (G.wilds.markersDirty = true); } }
      }
    },
    markers(out) {
      const w = wstate(); if (!w) return;
      for (const p of list) {
        if (!w.seen[p.def.id] || w.puzzles[p.def.id] === 'open') continue;
        const ref = p.center || p.home || p.pos;
        out.push({ x: ref.x, z: ref.z, icon: p.def.kind === 'lantern' ? 'fire' : 'chest', label: '', kind: 'collectible', color: '#e0b25a' });
      }
    },
    get(id) { return byId[id] || null; },
    state: (id) => wstate()?.puzzles[id] || null,
    /** Debug / tests: open (solve + loot) a puzzle without the mechanism. */
    debugOpen(id) { const p = byId[id]; if (!p) return false; solve(p, { silent: true }); if (p.def.kind === 'lantern') { catchLantern(p); return true; } return openChest(p, { silent: true }); },
    openChest: (id, o) => (byId[id] ? openChest(byId[id], o) : false),
    counts() { const w = wstate(); return { open: list.filter((p) => w?.puzzles[p.def.id] === 'open').length, of: list.length }; },
  };
}
