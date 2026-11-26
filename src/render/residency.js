// Phones (docs/api/perf.md "Phone memory, round 2"): geometry that has not been drawn for a while gives its GPU buffers
// back. The world is built for the whole map at boot and three keeps every buffer it ever uploaded, so a phone that
// flew to the City of Magic and on to the open country carried every place it had seen on the GPU (uploaded geometries
// 517 → 964, GPU buffers 83 → 207 MB in ten minutes, never down again).
//
// Every draw (main pass, shadow maps, water mirror: all go through renderer.renderBufferDirect) stamps its geometry with
// the frame time; a sweep every SWEEP_MS disposes the geometries not drawn for `idle` seconds. Disposing frees only the
// GPU side (buffers, vertex array objects, morph textures): every geometry keeps its CPU arrays (colliders and ground
// queries read them, docs/api/perf.md "Memory"), and three uploads it again the next time it is drawn.
//   const R = installResidency(G, renderer)   R.bytes() resident geometry bytes (estimate)   R.idle = seconds
//   R.sweep(idle?) sweep now (the memory budget calls it with a shorter idle under pressure)   R.stats()
const SWEEP_MS = 5000;
const IDLE_S = 60;

const bytesOf = (geo) => {
  let n = 0;
  for (const k in geo.attributes) { const a = geo.attributes[k]; const arr = a.array || a.data?.array; if (arr) n += arr.byteLength; }
  if (geo.index?.array) n += geo.index.array.byteLength;
  for (const k in geo.morphAttributes || {}) for (const a of geo.morphAttributes[k]) if (a?.array) n += a.array.byteLength;
  return n;
};

export function installResidency(G, renderer) {
  const seen = new Map();     // geometry -> { t: last drawn (G.time.real), b: bytes }
  let resident = 0, freed = 0, freedN = 0;
  const base = renderer.renderBufferDirect;
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (geometry) {
      const e = seen.get(geometry);
      if (e) e.t = G.time.real;
      else { const b = bytesOf(geometry); seen.set(geometry, { t: G.time.real, b }); resident += b; }
    }
    return base.call(this, camera, scene, geometry, material, object, group);
  };
  const R = {
    idle: IDLE_S,
    /** Dispose (GPU side only) every geometry not drawn for `idle` seconds. Returns the bytes given back. */
    sweep(idle = R.idle) {
      const now = G.time.real;
      let n = 0;
      for (const [geo, e] of seen) {
        if (now - e.t < idle) continue;
        seen.delete(geo); resident -= e.b; n += e.b; freedN++;
        try { geo.dispose(); } catch (err) { G.reportError?.('residency', err); }
      }
      freed += n;
      return n;
    },
    bytes: () => resident,
    stats: () => ({ resident: Math.round(resident / 1e6), geometries: seen.size, freedMB: Math.round(freed / 1e6), freedN, idle: R.idle }),
  };
  setInterval(() => { if (!G.contextLost) R.sweep(); }, SWEEP_MS);
  return R;
}
