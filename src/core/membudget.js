// Phones (docs/api/perf.md "Phone memory, round 2"): a running estimate of what can be given back, and a budget for it.
// Every CHECK_MS: resident geometry (render/residency.js: drawn in the last minute), decoded audio (audio/audio.js) and
// the people's models the asset store holds (core/assets.js). Over BUDGET_MB, the least recently used goes first:
//   1. people's models no actor shows now (assets.releaseIdle(), instead of after a minute),
//   2. decoded music / ambience / sounds that are not playing (audio.trim()),
//   3. geometry not drawn for PRESSURE_IDLE_S seconds (instead of a minute).
// The world's own fixed data (terrain fields, the city's colliders and CPU geometry, render targets) is not in the
// estimate: it cannot be given back without rebuilding the world.
//   G.mem.estimate() -> { geometry, audio, people, total } (bytes)   G.mem.stats() -> MB + how often the budget acted
const CHECK_MS = 5000;
const BUDGET_MB = 320;
const PRESSURE_IDLE_S = 15;

export function installMemBudget(G) {
  let acted = 0, lastActed = 0, gave = 0;
  const estimate = () => {
    const geometry = G.residency?.bytes?.() || 0;
    const audio = G.audio?.decodedBytes?.() || 0;
    const people = G.assets?.peopleBytes?.() || 0;
    return { geometry, audio, people, total: geometry + audio + people };
  };
  function check() {
    if (G.contextLost || !G.bootReady) return;
    const e = estimate();
    if (e.total <= BUDGET_MB * 1e6) return;
    const before = e.total;
    G.assets?.releaseIdle?.();
    G.audio?.trim?.();
    G.residency?.sweep?.(PRESSURE_IDLE_S);
    gave += Math.max(0, before - estimate().total);
    acted++; lastActed = G.time.real;
  }
  setInterval(check, CHECK_MS);
  return {
    budget: BUDGET_MB,
    estimate,
    check,
    stats() {
      const e = estimate();
      return { geometryMB: Math.round(e.geometry / 1e6), audioMB: Math.round(e.audio / 1e6), peopleMB: Math.round(e.people / 1e6), totalMB: Math.round(e.total / 1e6),
        budgetMB: BUDGET_MB, acted, lastActed: +lastActed.toFixed(1), gaveMB: Math.round(gave / 1e6) };
    },
  };
}
