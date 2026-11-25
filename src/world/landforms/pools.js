// Still pools held in rock (map round, 2026-11-22): the tarn and the plunge pool under the crag falls.
// Shared by landforms/setpieces.js (rim, water) and the flora planting (reeds, lily pads), so both agree on the level.
// The water surface is flat at `level`, just above the lowest ground on the rim of the disc (the lip it would spill
// over). world/ground.js cuts the hillside above that down to just under the water (poolBed: a hollow with a steep bank
// on the uphill side), and the rock rim stands on the cut floor, so no water ever hangs in the air on a slope.
import { LANDMARKS } from '../../data/landmarks.js';

/** How far the ground under a pool's disc lies below its water (ground.js cuts the hillside down to this). */
export const POOL_DEPTH = 0.3;
/** Radius of the water disc drawn for a pool of radius r (setpieces.js poolDisc); the rim stones stand on it. */
export const poolDiscRadius = (r) => r + 0.9;

/**
 * Where a pool lies and how high its water stands, from the natural ground h(x, z) (before the pool's own bed).
 * { x, z, r, level, bank } for a landmark with a pool (tarn, cragFalls), else null. Pure: ground.js calls it while it builds.
 */
export function poolSite(l, h) {
  if (l.kind !== 'tarn' && l.kind !== 'cragFalls') return null;
  let x = l.x, z = l.z;
  const r = l.kind === 'tarn' ? 7.5 : 5.5;
  if (l.kind === 'cragFalls') {
    // downhill from the crag foot, under the fall: its ribbon (setpieces.js) comes down 0.2..3 m out from the crag point,
    // so the disc (r + 0.9 = 6.4 m) reaches back to ~2 m from it and the fall lands in the water
    const e = 6, gx = h(l.x + e, l.z) - h(l.x - e, l.z), gz = h(l.x, l.z + e) - h(l.x, l.z - e);
    const gl = Math.hypot(gx, gz) || 1;
    x = l.x - gx / gl * 8.5; z = l.z - gz / gl * 8.5;
  }
  let lip = 1e9;
  for (let k = 0; k < 48; k++) {
    const a = k / 48 * Math.PI * 2;
    lip = Math.min(lip, h(x + Math.sin(a) * poolDiscRadius(r), z + Math.cos(a) * poolDiscRadius(r)));
  }
  // bank: how far the cut rises back to the hillside (steep rock under the crag, a soft grassy hollow for the tarn)
  return { x, z, r, level: lip + 0.22, bank: l.kind === 'tarn' ? 11 : 4 };
}

const cache = new Map();
/** { x, z, r, level, rim: [{ x, z, a, ground }] } for a landmark with a pool (tarn, cragFalls), else null. */
export function poolOf(W, l) {
  if (cache.has(l.id)) return cache.get(l.id);
  const s = poolSite(l, W.naturalHeightAt || W.heightAt);
  let p = null;
  if (s) {
    // the rim stands on the ground as it is (the bed included)
    const rim = [];
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      const rx = s.x + Math.sin(a) * poolDiscRadius(s.r), rz = s.z + Math.cos(a) * poolDiscRadius(s.r);
      rim.push({ x: rx, z: rz, a, ground: W.heightAt(rx, rz) });
    }
    p = { ...s, rim };
  }
  cache.set(l.id, p);
  return p;
}
export const POOL_LANDMARKS = () => LANDMARKS.filter((l) => l.kind === 'tarn' || l.kind === 'cragFalls');
