import { parentPort } from 'node:worker_threads';
import { renderTrack } from './track.mjs';
parentPort.on('message', ({ id, name, tr, cue, len, seed }) => {
  try {
    const t0 = Date.now();
    const [L, R] = renderTrack(name, tr, cue, len, seed);
    parentPort.postMessage({ id, L, R, ms: Date.now() - t0 }, [L.buffer, R.buffer]);
  } catch (e) { parentPort.postMessage({ id, error: String(e.stack || e) }); }
});
