// DSP helpers for the game score: FFT, convolution, generated room impulse responses, small utilities.
// Filters, the loudness meter and the WAV writer come from the trailer score kit.
import { SR, makeRng, midiOf, hz, Biquad, filt } from '../trailer/score/synth.mjs';
import { loudness, writeWav, truePeakEnvelope } from '../trailer/score/mix.mjs';

export { SR, makeRng, midiOf, hz, Biquad, filt, loudness, writeWav, truePeakEnvelope };
export const TAU = Math.PI * 2;
export const dbToGain = (db) => Math.pow(10, db / 20);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------- FFT (radix-2, in place)
const twiddles = new Map();
function tw(n) {
  let t = twiddles.get(n);
  if (!t) {
    t = { c: new Float64Array(n / 2), s: new Float64Array(n / 2), rev: new Uint32Array(n) };
    for (let i = 0; i < n / 2; i++) { t.c[i] = Math.cos((TAU * i) / n); t.s[i] = -Math.sin((TAU * i) / n); }
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); t.rev[i] = r; }
    twiddles.set(n, t);
  }
  return t;
}
export function fft(re, im, inverse = false) {
  const n = re.length, t = tw(n);
  for (let i = 0; i < n; i++) { const j = t.rev[i]; if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
  const sg = inverse ? -1 : 1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = t.c[k], wi = sg * t.s[k];
        const a = i + j, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const nextPow2 = (n) => 1 << Math.ceil(Math.log2(Math.max(2, n)));

/** Linear convolution of two real signals with overlap-add. Two channels share one complex FFT (x in re, y in im). */
export function convolve2(xL, xR, hL, hR) {
  const M = Math.max(hL.length, hR.length), B = nextPow2(M), N = 2 * B;
  const HLr = new Float64Array(N), HLi = new Float64Array(N), HRr = new Float64Array(N), HRi = new Float64Array(N);
  HLr.set(hL); HRr.set(hR); fft(HLr, HLi); fft(HRr, HRi);
  const len = xL.length + M - 1;
  const oL = new Float32Array(len), oR = new Float32Array(len);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s < xL.length; s += B) {
    re.fill(0); im.fill(0);
    const e = Math.min(xL.length, s + B);
    for (let i = s; i < e; i++) { re[i - s] = xL[i]; im[i - s] = xR[i]; }
    fft(re, im);
    // split the packed spectrum: X = (Z[k] + conj Z[N-k]) / 2, Y = (Z[k] - conj Z[N-k]) / 2i; then multiply and repack
    const pr = new Float64Array(N), pi = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const k2 = (N - k) & (N - 1);
      const xr = 0.5 * (re[k] + re[k2]), xi = 0.5 * (im[k] - im[k2]);
      const yr = 0.5 * (im[k] + im[k2]), yi = -0.5 * (re[k] - re[k2]);
      const ar = xr * HLr[k] - xi * HLi[k], ai = xr * HLi[k] + xi * HLr[k];
      const br = yr * HRr[k] - yi * HRi[k], bi = yr * HRi[k] + yi * HRr[k];
      pr[k] = ar - bi; pi[k] = ai + br; // A + iB
    }
    fft(pr, pi, true);
    const lim = Math.min(N, len - s);
    for (let i = 0; i < lim; i++) { oL[s + i] += pr[i]; oR[s + i] += pi[i]; }
  }
  return [oL, oR];
}

// ---------------------------------------------------------------- generated impulse responses
// A stereo hall/room: sparse early reflections, then a decorrelated noise tail whose decay time falls with frequency
// (four bands), and a soft build-up so the onset is diffuse rather than a click.
export const ROOMS = {
  hall: { rt: [2.6, 2.3, 1.7, 0.9], pre: 0.022, er: 0.5, build: 0.05, width: 1 },
  chamber: { rt: [1.5, 1.3, 1.0, 0.55], pre: 0.012, er: 0.6, build: 0.03, width: 0.9 },
  room: { rt: [0.8, 0.7, 0.5, 0.3], pre: 0.006, er: 0.8, build: 0.015, width: 0.8 },
  cathedral: { rt: [4.2, 3.8, 2.6, 1.2], pre: 0.035, er: 0.35, build: 0.09, width: 1 },
  plate: { rt: [1.9, 2.0, 1.8, 1.3], pre: 0.004, er: 0.15, build: 0.01, width: 1 },
};
export function makeIR(kind = 'hall', seed = 11) {
  const R = ROOMS[kind] || ROOMS.hall, rng = makeRng(seed);
  const len = Math.round(SR * Math.min(7, R.rt[0] * 1.25 + R.pre));
  const out = [];
  for (let ch = 0; ch < 2; ch++) {
    const bands = [];
    const edges = [['lp', 250], ['bp', 700], ['bp', 2600], ['hp', 5000]];
    for (let b = 0; b < 4; b++) {
      const n = new Float32Array(len);
      for (let i = 0; i < len; i++) n[i] = (rng() + rng() + rng() - 1.5) * 1.6;
      const [type, f] = edges[b];
      const q = type === 'bp' ? 0.7 : 0.707;
      const f1 = new Biquad(type, f, q), f2 = new Biquad(type, f, q);
      for (let i = 0; i < len; i++) n[i] = f2.tick(f1.tick(n[i]));
      const k = -6.9078 / (R.rt[b] * SR); // e^-6.9 = -60 dB
      for (let i = 0; i < len; i++) n[i] *= Math.exp(k * i);
      bands.push(n);
    }
    const ir = new Float32Array(len), pre = Math.round(R.pre * SR), build = R.build * SR;
    for (let i = 0; i < len; i++) {
      const j = i - pre;
      if (j < 0) continue;
      const on = 1 - Math.exp(-j / build);
      ir[i] = on * (bands[0][j] * 1.0 + bands[1][j] * 0.9 + bands[2][j] * 0.7 + bands[3][j] * 0.35);
    }
    // early reflections
    for (let r = 0; r < 14; r++) {
      const t = R.pre * 0.35 + rng() * (0.075 + R.pre), i = Math.round(t * SR);
      if (i < len) ir[i] += R.er * (0.5 + rng() * 0.5) * (rng() < 0.5 ? -1 : 1) * Math.exp(-t * 18) * 0.6;
    }
    // normalise energy
    let e = 0; for (let i = 0; i < len; i++) e += ir[i] * ir[i];
    const g = 1 / Math.sqrt(e);
    for (let i = 0; i < len; i++) ir[i] *= g;
    out.push(ir);
  }
  if (R.width < 1) { // narrow the tail a little: mix some of each channel into the other
    const a = (1 - R.width) * 0.5, [L, Rr] = out;
    for (let i = 0; i < L.length; i++) { const l = L[i], r = Rr[i]; L[i] = l * (1 - a) + r * a; Rr[i] = r * (1 - a) + l * a; }
  }
  return out;
}

// ---------------------------------------------------------------- small helpers
/** Equal-power pan gains for p in [-1, 1]. */
export const panGains = (p) => { const a = ((clamp(p, -1, 1) + 1) * Math.PI) / 4; return [Math.cos(a), Math.sin(a)]; };

/** Add a mono buffer into a stereo pair at sample offset, with pan and gain. */
export function addMono(L, R, buf, at, gain = 1, pan = 0) {
  const [gl, gr] = panGains(pan);
  const s = Math.max(0, at), e = Math.min(L.length, at + buf.length);
  for (let i = s; i < e; i++) { const v = buf[i - at] * gain; L[i] += v * gl; R[i] += v * gr; }
}
export function addStereo(L, R, pair, at, gain = 1, pan = 0) {
  const [bl, br] = pair;
  const [gl, gr] = panGains(pan);
  const k = Math.SQRT2; // centre = unity
  const s = Math.max(0, at), e = Math.min(L.length, at + bl.length);
  for (let i = s; i < e; i++) { L[i] += bl[i - at] * gain * gl * k; R[i] += br[i - at] * gain * gr * k; }
}

/** One-pole smoothed random walk in [-1, 1] (slow drift), length n, rate in Hz. */
export function drift(n, rate, rng) {
  const out = new Float32Array(n);
  const step = Math.max(1, Math.round(SR / (rate * 4)));
  let a = rng() * 2 - 1, b = rng() * 2 - 1;
  for (let i = 0; i < n; i++) {
    if (i % step === 0) { a = b; b = rng() * 2 - 1; }
    const f = (i % step) / step, s = f * f * (3 - 2 * f);
    out[i] = a + (b - a) * s;
  }
  return out;
}

/** PolyBLEP correction for band-limited saw / pulse. */
export function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
