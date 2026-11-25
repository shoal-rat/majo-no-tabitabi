// Crater ponds (terrain agent, part of world/destruction.js): water that gathers in bowls magic dug.
//  * seep ponds: a crater dug near the lake, a river or the low shore (or any bowl deep enough) reaches the water table;
//    water stands in it up to just below its lowest lip. Derived from the terrain, so they come back with the craters
//    after a reload (nothing extra in the save).
//  * rain of water magic into a bowl fills it (transient: the water soaks away over a few minutes, down to the seep level).
//  * ice magic freezes a pond into a walkable sheet (a platform) that thaws after a while or at once under fire.
// One instanced draw call for every pond. Ponds below sea level are left to the world's water plane.
import * as THREE from 'three';
import { hookMaterial } from '../core/mats.js';
import { clamp } from '../core/util.js';

const MAX = 24;
const RAYS = 16;
const THAW = 95;            // seconds a frozen pond stays frozen
const SOAK = 1 / 240;       // metres per second a filled pond loses down to its seep level
const WATER = { sun: new THREE.Color(0x3d7a86), dusk: new THREE.Color(0x6b6a52), night: new THREE.Color(0x203046) };
const ICE = new THREE.Color(0xd2e9f4);

export function createPonds(G) {
  const W = G.world;
  const ponds = [];          // { x, z, R, level, seep, r, frozen, plat, dirty }
  const pendingCheck = [];   // crater centres to (re)survey next update
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

  const geo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const mat = hookMaterial(new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.84, shininess: 90, specular: 0x9fb4c0, depthWrite: true }));
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.name = 'destruction:ponds';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, _c.set(1, 1, 1));
  G.scene?.add(mesh);
  let layoutDirty = true;

  const lake = W.POI?.trialLake;
  function nearWater(x, z) {
    if (W.riverDist?.(x, z) < 50) return true;
    if (lake && Math.hypot(x - lake.x, z - lake.z) < lake.r + 110) return true;
    return W.baseHeightAt(x, z) < 4.5;
  }
  function landOf(x, z) { const v = W.veilAt?.(x, z) ?? 0; return v > 0.82 ? 'night' : v > 0.1 ? 'dusk' : 'sun'; }

  /** Lowest lip around (x, z) within reach R (the highest ground along each ray, then the lowest of those). */
  function lip(x, z, R) {
    let low = Infinity;
    for (let k = 0; k < RAYS; k++) {
      const a = (k / RAYS) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      let hi = -Infinity;
      for (let d = 1; d <= R; d += 1) hi = Math.max(hi, W.heightAt(x + cx * d, z + cz * d));
      low = Math.min(low, hi);
    }
    return low;
  }
  /** Radius of the disc that covers everything below `level` around (x, z). */
  function extent(x, z, level, R) {
    let far = 0.5;
    for (let k = 0; k < RAYS; k++) {
      const a = (k / RAYS) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      let d = 0.5;
      while (d < R && W.heightAt(x + cx * d, z + cz * d) < level) d += 0.5;
      far = Math.max(far, d);
    }
    return far + 0.4;
  }
  function find(x, z, r = 2.5) {
    for (const p of ponds) if (Math.hypot(p.x - x, p.z - z) < Math.max(r, p.r * 0.6)) return p;
    return null;
  }
  function remove(p) {
    const i = ponds.indexOf(p);
    if (i >= 0) ponds.splice(i, 1);
    if (p.plat) p.plat.dead = true;
    layoutDirty = true;
  }
  /** Survey the bowl at (x, z): seep level, lip, extent. Creates / updates / removes the pond there. */
  function survey(x, z, R, extra = 0) {
    const bottom = W.heightAt(x, z);
    let p = find(x, z);
    if (bottom < (W.seaLevel ?? 0) + 0.25) { if (p) remove(p); return null; }   // the sea / lake plane covers it
    const base = W.baseHeightAt(x, z);
    const table = base - (nearWater(x, z) ? 2.1 : 6.5);
    const top = lip(x, z, R) - 0.22;
    const seep = Math.min(table, top);
    const want = Math.min(top, Math.max(seep, (p ? p.level : -Infinity), bottom + extra));
    if (!(want > bottom + 0.15)) { if (p) remove(p); return null; }
    if (!p) {
      if (ponds.length >= MAX) return null;
      p = { x, z, R, level: want, seep, r: 1, frozen: 0, plat: null };
      ponds.push(p);
    }
    p.R = Math.max(p.R, R); p.seep = seep > bottom + 0.15 ? seep : -Infinity; p.level = want; p.top = top;
    p.r = extent(p.x, p.z, p.level, p.R + 2);
    if (p.plat) { p.plat.top = p.level + 0.04; p.plat.r = p.r * 0.85; }
    layoutDirty = true;
    return p;
  }

  function write() {
    let n = 0;
    for (const p of ponds) {
      _q.identity();
      _m.compose(_p.set(p.x, p.level + (p.frozen > 0 ? 0.03 : 0), p.z), _q, _s.set(p.r, 1, p.r));
      mesh.setMatrixAt(n, _m);
      _c.copy(WATER[landOf(p.x, p.z)]).lerp(ICE, clamp(p.frozen > 0 ? 1 : 0, 0, 1));
      mesh.setColorAt(n, _c);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    layoutDirty = false;
  }

  return {
    mesh, list: ponds,
    /** 'terrain:deformed' hook: craters get surveyed next update, and so does every pond the change reaches (a crater
     *  dug through a pond's lip lowers it to the new lip instead of leaving it hanging over the hole); a reset clears the
     *  ponds in that patch. */
    onDeform(e) {
      if (e.kind === 'resetSpell') {
        for (let i = ponds.length - 1; i >= 0; i--) if (Math.hypot(ponds[i].x - e.x, ponds[i].z - e.z) < e.r + 2) remove(ponds[i]);
        return;
      }
      if (e.amount < -0.4 && pendingCheck.length < 32) pendingCheck.push([e.x, e.z, e.r]);
      for (const p of ponds) if (Math.abs(p.x - e.x) < e.r + p.r && Math.abs(p.z - e.z) < e.r + p.r) pendingCheck.push([p.x, p.z, p.R]);
    },
    /** Water magic: fills the bowl it lands in (if it is one). */
    fill(x, z, r, power = 1) {
      const p = find(x, z, r + 2);
      if (p) {
        if (p.frozen > 0) return false;
        p.level = Math.min(p.top ?? p.level, p.level + 0.32 * clamp(power, 0.5, 2));
        p.r = extent(p.x, p.z, p.level, p.R + 2);
        layoutDirty = true;
        return true;
      }
      // a bowl without water yet: the deepest scar under the splash
      const list = W.spellScarList?.();
      if (!list) return false;
      let best = null;
      for (let i = list.length - 1; i >= 0 && i > list.length - 400; i--) {
        const s = list[i];
        if (s[3] > -0.6) continue;
        const d = Math.hypot(s[0] - x, s[1] - z);
        if (d < s[2] + r * 0.5 && (!best || s[3] < best[3])) best = s;
      }
      if (!best) return false;
      return !!survey(best[0], best[1], best[2] * 1.45, 0.3 * clamp(power, 0.5, 2));
    },
    /** Ice magic: freezes ponds it touches (a walkable sheet). */
    freeze(x, z, r) {
      let n = 0;
      for (const p of ponds) {
        if (Math.hypot(p.x - x, p.z - z) > r + p.r) continue;
        if (!p.frozen) {
          p.plat = W.addPlatform?.({ x: p.x, z: p.z, r: p.r * 0.85, top: p.level + 0.04, thick: 0.6, tag: 'pond-ice' }) || null;
          // anyone wading in it is lifted onto the sheet (never frozen into it)
          const P = G.player;
          if (P?.pos && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < p.r * 0.9 && P.pos.y < p.level + 0.05 && P.pos.y > p.level - 2.5) {
            P.pos.y = p.level + 0.05;
            if (P.vel && P.vel.y < 0) P.vel.y = 0;
          }
          G.fx?.burst?.('shatter_ice', _p.set(p.x, p.level + 0.2, p.z), { scale: 0.8 });
          layoutDirty = true;
        }
        p.frozen = THAW; n++;
      }
      return n;
    },
    /** Fire / sun: melt frozen ponds in reach. */
    thaw(x, z, r) {
      for (const p of ponds) if (p.frozen > 0 && Math.hypot(p.x - x, p.z - z) < r + p.r) p.frozen = 0.01;
    },
    update(dt) {
      for (let k = 0; k < 2 && pendingCheck.length; k++) { const [x, z, R] = pendingCheck.shift(); try { survey(x, z, R); } catch (e) { G.reportError('ponds:survey', e); } }
      if (dt > 0) for (let i = ponds.length - 1; i >= 0; i--) {
        const p = ponds[i];
        if (p.frozen > 0) {
          p.frozen -= dt;
          if (p.frozen <= 0) { p.frozen = 0; if (p.plat) { p.plat.dead = true; p.plat = null; } G.fx?.burst?.('splash', _p.set(p.x, p.level + 0.1, p.z), { scale: 0.8 }); layoutDirty = true; }
          continue;
        }
        if (p.level > p.seep + 0.01) {
          p.level -= SOAK * dt;
          if (p.level <= W.heightAt(p.x, p.z) + 0.15) { remove(p); continue; }
          p.soakT = (p.soakT || 0) + dt;
          if (p.soakT > 2) { p.soakT = 0; p.r = extent(p.x, p.z, p.level, p.R + 2); layoutDirty = true; }
        }
      }
      if (layoutDirty) write();
    },
    stats() { return { ponds: ponds.length, frozen: ponds.filter((p) => p.frozen > 0).length, levels: ponds.map((p) => +p.level.toFixed(2)) }; },
    clear() { for (let i = ponds.length - 1; i >= 0; i--) remove(ponds[i]); write(); },
  };
}
