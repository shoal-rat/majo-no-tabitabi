#!/usr/bin/env node
// Render one cue of the game score: node tools/music/render.mjs <cue> [--preview] [--install] [--fast]
//
// A cue (tools/music/cues/<cue>.mjs) is data: tempo, an optional intro, a loop body and tracks of note events.
// The file it makes is  intro | loop body | the first `settle` beats of the body again,  and the game loops it from
// intro + settle to the end. By then the intro's reverb and ringing notes have died away, so the loop region holds only
// the body's own steady state and the seam is exact (the renderer measures it).
// Layered cues (battle) render one file per layer from the same score; the game plays them in sync.
// Output: .tmp/music/out/<id>[_<layer>].wav (24-bit), .ogg (Opus) and, with --install, assets/audio/music/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SR, Biquad, convolve2, makeIR, loudness, writeWav, truePeakEnvelope, dbToGain } from './dsp.mjs';
import { Worker } from 'node:worker_threads';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, '.tmp/music/out'), PREV = path.join(ROOT, '.tmp/music/preview');
export const TARGET_LUFS = -18, CEILING_DBTP = -1;

function hashStr(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** Render tracks in parallel worker threads, largest first. Resolves to { name: [L, R] }. */
function renderAll(jobs, threads) {
  return new Promise((resolve, reject) => {
    const queue = jobs.slice().sort((a, b) => b.weight - a.weight), out = {};
    let live = 0, done = 0;
    const pool = Array.from({ length: Math.min(threads, queue.length) }, () => new Worker(new URL('./worker.mjs', import.meta.url)));
    const next = (w) => {
      const j = queue.shift();
      if (!j) { w.terminate(); return; }
      live++;
      w.once('message', (m) => {
        live--; done++;
        if (m.error) { pool.forEach((x) => x.terminate()); reject(new Error(j.name + ': ' + m.error)); return; }
        out[j.name] = [m.L, m.R];
        if (j.verbose) console.log('  ', j.name, (m.ms / 1000).toFixed(1) + 's');
        if (done === jobs.length) resolve(out);
        next(w);
      });
      w.postMessage({ id: j.name, name: j.name, tr: j.tr, cue: j.cue, len: j.len, seed: j.seed });
    };
    if (!queue.length) resolve(out);
    pool.forEach(next);
  });
}

/** Events of the loop body are played twice (the second copy only for the settle region). */
function expand(cue) {
  const t = {};
  const a = cue.intro, b = cue.intro + cue.loop;
  for (const [name, tr] of Object.entries(cue.tracks)) {
    let evs = tr.events;
    if (tr.inst === 'kit') evs = Object.entries(tr.events).flatMap(([lane, es]) => es.map((e) => ({ ...e, lane })));
    const copyTo = a + (cue.settle ?? 8) + (3 * cue.bpm) / 60; // the settle region plus the seam probe
    const copy = evs.filter((e) => e.b >= a - 1e-6 && e.b < copyTo).map((e) => ({ ...e, b0: e.b, seg: 2, b: e.b + cue.loop }));
    const once = evs.filter((e) => e.b < b - 1e-6).map((e) => ({ ...e, b0: e.b, seg: e.b < a - 1e-6 ? 0 : 1 }));
    t[name] = { ...tr, events: [...once, ...copy] };
  }
  return t;
}

/** Copy the files into the game, write their manifest rows and the loop start in src/audio/names.js. */
function install(cue, info, files) {
  const frag = {};
  for (const f of files) {
    execFileSync('cp', [f.ogg, path.join(ROOT, 'assets/audio/music', f.id + '.ogg')]);
    const layer = f.id !== cue.id;
    frag[f.id] = {
      file: 'audio/music/' + f.id + '.ogg', type: 'audio', license: 'Original project audio', author: 'This project (original score)',
      source: 'tools/music/render.mjs (score: tools/music/cues/' + path.basename(cue.file) + ')',
      duration: info.seconds, loop: true, loopStart: info.loopStart,
      notes: layer ? 'Intensity layer of ' + cue.id + ': played in sync with it and faded in as a fight heats up.' : cue.notes || '',
      preload: false,
    };
  }
  const tmp = path.join(OUT, cue.id + '.manifest.json');
  writeFileSync(tmp, JSON.stringify(frag, null, 1));
  execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), tmp, '--replace'], { stdio: 'inherit' });
  // MUSIC_LOOP: one "  bgm_id: seconds," line per track, kept sorted
  const np = path.join(ROOT, 'src/audio/names.js');
  const src = readFileSync(np, 'utf8');
  const m = /(export const MUSIC_LOOP = \{\n)([\s\S]*?)(\};)/.exec(src);
  if (!m) throw new Error('MUSIC_LOOP block not found in names.js');
  const rows = new Map(m[2].split('\n').filter((l) => l.trim()).map((l) => [l.trim().split(':')[0], l]));
  rows.set(cue.id, '  ' + cue.id + ': ' + info.loopStart + ',');
  const body = [...rows.keys()].sort().map((k) => rows.get(k)).join('\n') + '\n';
  writeFileSync(np, src.slice(0, m.index) + m[1] + body + m[3] + src.slice(m.index + m[0].length));
}

export async function render(cueName, opts = {}) {
  const mod = await import(pathToFileURL(path.join(ROOT, 'tools/music/cues', cueName + '.mjs')).href);
  const cue = typeof mod.default === 'function' ? mod.default() : mod.default;
  cue.file = cueName + '.mjs';
  cue.settle ??= 8;
  const spb = 60 / cue.bpm;
    const loopStartS = Math.round((cue.intro + cue.settle) * spb * SR);
  const endS = Math.round((cue.intro + cue.settle + cue.loop) * spb * SR);
  const probe = Math.round(2.5 * SR); // rendered past the end to measure the seam
  const len = endS + probe;
  const tracks = expand(cue);
  const layers = {};
  const t0 = Date.now();
  const cueInfo = { bpm: cue.bpm, swing: cue.swing ?? 0, loopSamples: endS - loopStartS };
  const jobs = Object.entries(tracks).filter(([, tr]) => !tr.mute).map(([name, tr]) => ({
    name, tr: { ...tr, events: tr.events }, cue: cueInfo, len, seed: hashStr(cue.id + name), verbose: opts.verbose,
    weight: tr.events.reduce((a, e) => a + e.d * (e.m?.length || 1), 0) * (['violin', 'viola', 'cello', 'contrabass', 'choir', 'air'].includes(tr.inst) ? 4 : 1),
  }));
  const stemLu = {};
  const rendered = await renderAll(jobs, opts.threads ?? Math.max(2, os.cpus().length - 2));
  if (opts.seam) for (const [name, [L, R]] of Object.entries(rendered)) {
    let eS = 0, eD = 0;
    for (let i = 0; i < probe; i++) for (const ch of [L, R]) { const x = ch[endS + i], y = ch[loopStartS + i]; eS += x * x; eD += (x - y) ** 2; }
    console.log('  seam', name.padEnd(12), eS > 0 ? (10 * Math.log10(eD / eS + 1e-12)).toFixed(1) + ' dB' : 'silent');
  }
  for (const [name, tr] of Object.entries(tracks)) {
    if (tr.mute) continue;
    const ly = tr.layer || 'base';
    layers[ly] ||= { L: new Float32Array(len), R: new Float32Array(len), sL: new Float32Array(len), sR: new Float32Array(len) };
    const [L, R] = rendered[name];
    const g = dbToGain(tr.db ?? 0) * (tr.gain ?? 1), pan = tr.pan ?? 0;
    const pl = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2, pr = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    const send = tr.send ?? 0.25, Y = layers[ly];
    const gl = g * Math.min(pl, 1.25), gr = g * Math.min(pr, 1.25); // balance: keeps a stereo image, shifts its weight
    if (opts.stems) { // loudness of this track alone (dry, before the master gain), over the loop region
      const tl = new Float32Array(endS - loopStartS), trr = new Float32Array(endS - loopStartS);
      for (let i = loopStartS; i < endS; i++) { tl[i - loopStartS] = L[i] * gl; trr[i - loopStartS] = R[i] * gr; }
      stemLu[name] = loudness(tl, trr).I;
    }
    for (let i = 0; i < len; i++) {
      const l = L[i] * gl, r = R[i] * gr;
      Y.L[i] += l; Y.R[i] += r; Y.sL[i] += l * send; Y.sR[i] += r * send;
    }
  }
  // reverb per layer (linear, so the layers still sum to the full mix)
  const ir = makeIR(cue.reverb || 'hall', 7);
  for (const Y of Object.values(layers)) {
    const [wL, wR] = convolve2(Y.sL, Y.sR, ir[0], ir[1]);
    const wet = cue.wet ?? 0.55;
    for (let i = 0; i < len; i++) { Y.L[i] += wL[i] * wet; Y.R[i] += wR[i] * wet; }
    Y.sL = Y.sR = null;
    // master tone: 35 Hz high-pass (game speakers waste sub-bass), lows below 110 Hz in mono
    for (const ch of [Y.L, Y.R]) { const a = new Biquad('hp', 35, 0.54), b = new Biquad('hp', 35, 1.31); for (let i = 0; i < len; i++) ch[i] = b.tick(a.tick(ch[i])); }
    if (cue.air !== 0) for (const ch of [Y.L, Y.R]) { const hs = new Biquad('hs', 5500, 0.7, cue.air ?? 3.5); for (let i = 0; i < len; i++) ch[i] = hs.tick(ch[i]); }
    const s1 = new Biquad('hp', 110, 0.54), s2 = new Biquad('hp', 110, 1.31);
    for (let i = 0; i < len; i++) { const m = 0.5 * (Y.L[i] + Y.R[i]), s = s2.tick(s1.tick(0.5 * (Y.L[i] - Y.R[i]))); Y.L[i] = m + s; Y.R[i] = m - s; }
  }
  // loudness of the full mix over the loop region
  const names = Object.keys(layers);
  const full = [new Float32Array(len), new Float32Array(len)];
  for (const n of names) for (let i = 0; i < len; i++) { full[0][i] += layers[n].L[i]; full[1][i] += layers[n].R[i]; }
  const loopL = full[0].subarray(loopStartS, endS), loopR = full[1].subarray(loopStartS, endS);
  const lu = loudness(loopL, loopR);
  const gain = dbToGain(TARGET_LUFS + (cue.lufsOffset ?? 0) - lu.I);
  for (const n of names) for (const ch of [layers[n].L, layers[n].R]) for (let i = 0; i < len; i++) ch[i] *= gain;
  for (const ch of full) for (let i = 0; i < len; i++) ch[i] *= gain;
  // true-peak safety: a smooth gain envelope from the full mix, applied to every layer
  const ceil = dbToGain(CEILING_DBTP);
  const pk = [truePeakEnvelope(full[0]), truePeakEnvelope(full[1])];
  let maxPk = 0; for (let i = 0; i < len; i++) maxPk = Math.max(maxPk, pk[0][i], pk[1][i]);
  let limited = 0;
  if (maxPk > ceil) {
    const la = Math.round(0.004 * SR), env = new Float32Array(len).fill(1);
    for (let i = 0; i < len; i++) { const p = Math.max(pk[0][i], pk[1][i]); if (p > ceil) { const gg = ceil / p; for (let j = Math.max(0, i - la); j <= i; j++) env[j] = Math.min(env[j], gg); } }
    const rc = 1 - Math.exp(-1 / (0.12 * SR)); let g = 1;
    for (let i = 0; i < len; i++) { g = env[i] < g ? env[i] : g + (env[i] - g) * rc; env[i] = g; if (1 - g > limited) limited = 1 - g; }
    for (const n of names) for (const ch of [layers[n].L, layers[n].R]) for (let i = 0; i < len; i++) ch[i] *= env[i];
    for (const ch of full) for (let i = 0; i < len; i++) ch[i] *= env[i];
  }
  // seam: what the loop plays after its end vs what the file holds at the loop start
  let eS = 0, eD = 0;
  for (let i = 0; i < probe; i++) for (const ch of full) { const a = ch[endS + i], b = ch[loopStartS + i]; eS += a * a; eD += (a - b) * (a - b); }
  const seamDb = 10 * Math.log10(eD / (eS + 1e-12) + 1e-12);
  const after = loudness(full[0].subarray(loopStartS, endS), full[1].subarray(loopStartS, endS));
  mkdirSync(OUT, { recursive: true });
  const files = [];
  for (const n of names) {
    const id = cue.id + (n === 'base' ? '' : '_' + n);
    const wav = path.join(OUT, id + '.wav');
    writeWav(wav, layers[n].L.subarray(0, endS), layers[n].R.subarray(0, endS));
    const ogg = path.join(OUT, id + '.ogg');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-c:a', 'libopus', '-b:a', String(cue.kbps ?? 112) + 'k', '-vbr', 'on', '-application', 'audio', ogg]);
    files.push({ id, wav, ogg });
  }
  const info = {
    id: cue.id, bpm: cue.bpm, seconds: +(endS / SR).toFixed(3), loopStart: +(loopStartS / SR).toFixed(6), loopStartSamples: loopStartS, samples: endS,
    lufs: +after.I.toFixed(2), lra: +after.LRA.toFixed(1), peakDbtp: +(20 * Math.log10(Math.min(maxPk, ceil) + 1e-9)).toFixed(2), limitedDb: +(-20 * Math.log10(1 - limited + 1e-9)).toFixed(2),
    seamDb: +seamDb.toFixed(1), layers: names, renderSec: +((Date.now() - t0) / 1000).toFixed(1),
  };
  if (opts.stems) {
    const pre = lu.I; // full mix before the master gain
    info.stems = Object.fromEntries(Object.entries(stemLu).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, +(v - pre).toFixed(1)]));
    // octave-band balance of the loop (dB relative to the loudest band)
    const { fft } = await import('./dsp.mjs');
    const N = 16384, edges = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], e = new Array(edges.length - 1).fill(0);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let s0 = loopStartS; s0 + N < endS; s0 += N * 4) {
      re.fill(0); im.fill(0);
      for (let i = 0; i < N; i++) re[i] = (full[0][s0 + i] + full[1][s0 + i]) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      fft(re, im);
      for (let k = 1; k < N / 2; k++) { const f = (k * SR) / N, p = re[k] ** 2 + im[k] ** 2; for (let j = 0; j < e.length; j++) if (f >= edges[j] && f < edges[j + 1]) e[j] += p; }
    }
    const mx = Math.max(...e);
    info.bands = Object.fromEntries(edges.slice(0, -1).map((f, j) => [f, +(10 * Math.log10(e[j] / mx + 1e-12)).toFixed(1)]));
  }
  writeFileSync(path.join(OUT, cue.id + '.json'), JSON.stringify(info, null, 1));
  if (opts.preview) {
    // preview: the whole file, then 20 s more across the loop seam, fading out; layered cues bring the hot layer in
    mkdirSync(PREV, { recursive: true });
    const extra = Math.round(20 * SR), pl = endS + extra;
    const P = [new Float32Array(pl), new Float32Array(pl)];
    const hotAt = Math.round(loopStartS + (endS - loopStartS) * 0.42), ramp = Math.round(3 * SR);
    for (const n of names) {
      const Y = layers[n];
      for (let i = 0; i < pl; i++) {
        const j = i < endS ? i : loopStartS + (i - endS);
        const lv = n === 'base' ? 1 : Math.min(1, Math.max(0, (i - hotAt) / ramp));
        P[0][i] += Y.L[j] * lv; P[1][i] += Y.R[j] * lv;
      }
    }
    for (let i = 0; i < Math.round(6 * SR); i++) { const k = 1 - i / (6 * SR); P[0][pl - 1 - i] *= 1 - k; P[1][pl - 1 - i] *= 1 - k; }
    const wav = path.join(PREV, cue.id + '.wav');
    writeWav(wav, P[0], P[1]);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-c:a', 'libmp3lame', '-q:a', '2', wav.replace(/\.wav$/, '.mp3')]);
    info.preview = wav.replace(/\.wav$/, '.mp3');
  }
  if (opts.install) install(cue, info, files);
  return info;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const cues = args.filter((a) => !a.startsWith('--'));
  for (const c of cues) {
    const info = await render(c, { preview: args.includes('--preview'), install: args.includes('--install'), verbose: args.includes('--verbose'), stems: args.includes('--stems'), seam: args.includes('--seam') });
    console.log(JSON.stringify(info));
  }
}
