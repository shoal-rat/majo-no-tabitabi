// Instrument models for the game score. Every sound is synthesised here; there are no samples.
// Single notes return a mono Float32Array that starts at the note onset. Phrase instruments (bowed strings, flute,
// whistle, brass, choir) take a whole legato phrase so slurs and vibrato flow across notes; they return [L, R].
import { SR, TAU, hz, Biquad, clamp, drift, blep, makeRng } from './dsp.mjs';

const ramp = (buf, inS, outS) => {
  const a = Math.min(buf.length, inS), b = Math.min(buf.length, outS);
  for (let i = 0; i < a; i++) buf[i] *= i / a;
  for (let i = 0; i < b; i++) buf[buf.length - 1 - i] *= i / b;
  return buf;
};

/** Damped sinusoid added into out (resonator recursion, 3 multiplies a sample). Stops below -90 dB. */
function partial(out, start, f, amp, t60, phase = 0, relIdx = Infinity, relT60 = 0.08) {
  if (f >= SR * 0.45 || amp <= 0) return;
  const w = (TAU * f) / SR;
  let r = Math.exp(-6.9078 / (t60 * SR));
  let c = 2 * r * Math.cos(w), r2 = r * r;
  let y1 = amp * Math.sin(phase), y2 = (amp * Math.sin(phase - w)) / r;
  let env = amp;
  const n = out.length;
  for (let i = start; i < n; i++) {
    if (i === relIdx) { r = Math.exp(-6.9078 / (relT60 * SR)); c = 2 * r * Math.cos(w); r2 = r * r; }
    out[i] += y1;
    const y = c * y1 - r2 * y2; y2 = y1; y1 = y;
    if ((i & 511) === 0) { env = Math.abs(y1) + Math.abs(y2); if (env < amp * 1e-3 && i > start + 2048) break; }
  }
}

// ---------------------------------------------------------------- piano (modal, two coupled strings per partial)
export function piano(midi, dur, vel, o = {}, rng = Math.random) {
  const f0 = hz(midi) * Math.pow(2, (o.cents ?? 0) / 1200);
  const B = 0.00011 * Math.pow(2, (midi - 48) / 14);
  const T60 = clamp(24 * Math.pow(2, -(midi - 21) / 15), 0.7, 26);
  const damped = midi < 89 && !o.pedal;
  const hold = o.pedal ? Math.min(dur + (o.ring ?? 3.5), dur + T60) : dur;
  const tail = damped ? 0.3 : Math.min(T60, o.maxTail ?? 6);
  const len = Math.round((hold + tail) * SR);
  const out = new Float32Array(len);
  const v = clamp(vel, 0.05, 1);
  const fc = 700 + 6500 * Math.pow(v, 1.6) + f0 * 1.5;
  const x0 = 0.118, tilt = 1.05 - 0.35 * v;
  const relIdx = damped ? Math.round(hold * SR) : o.pedal ? Math.round(hold * SR) : Infinity;
  const relT = o.pedal && !damped ? 0.6 : 0.09 + 0.25 * clamp((60 - midi) / 40);
  let norm = 0;
  const parts = [];
  for (let n = 1; n <= 90; n++) {
    const fn = n * f0 * Math.sqrt(1 + B * n * n);
    if (fn > 15000) break;
    const a = (1 / Math.pow(n, tilt)) / (1 + Math.pow(fn / fc, 2)) * (0.12 + Math.abs(Math.sin(Math.PI * n * x0)));
    parts.push([fn, a]); norm += a;
  }
  const g = (Math.pow(v, 1.5) * 0.9) / Math.max(0.6, norm * 0.55);
  const amax = parts.reduce((m, p) => Math.max(m, p[1]), 0);
  parts.forEach(([fn, a], k) => {
    if (a < amax * 0.003) return;
    const t = T60 / Math.pow(1 + fn / 650, 0.85);
    if (k >= 12) { partial(out, 0, fn, a * g, t * 0.6, rng() * 0.3, relIdx, relT); return; }
    const d = 1 + ((rng() - 0.5) * 1.6 + 0.4) / 1731; // ~ +-0.8 cents: two strings beat and decay in two stages
    partial(out, 0, fn, a * g * 0.72, t * 0.38, rng() * 0.3, relIdx, relT);
    partial(out, 0, fn * d, a * g * 0.28, t * 1.6, rng() * 0.3, relIdx, relT);
  });
  // hammer knock + soundboard thump
  const kn = Math.round(0.012 * SR), lp = new Biquad('lp', 1800 + 2500 * v, 0.7);
  for (let i = 0; i < kn && i < len; i++) out[i] += lp.tick((rng() * 2 - 1) * Math.exp(-i / (0.002 * SR))) * 0.06 * v * v;
  partial(out, 0, 105, 0.012 * v, 0.09, 0); partial(out, 0, 228, 0.008 * v, 0.06, 0);
  return ramp(out, 24, Math.round(0.02 * SR));
}

// ---------------------------------------------------------------- tuned percussion (modal)
const MODAL = {
  celesta: { ratios: [1, 2.0, 2.76, 5.4, 8.9], amps: [1, 0.12, 0.22, 0.07, 0.025], t60: [2.2, 0.9, 0.6, 0.25, 0.12], click: 0.03, cut: 6000 },
  glock: { ratios: [1, 2.756, 5.404, 8.933], amps: [1, 0.42, 0.2, 0.08], t60: [3.6, 1.5, 0.7, 0.3], click: 0.05, cut: 12000 },
  musicbox: { ratios: [1, 4.1, 6.27, 11.2, 17.5], amps: [1, 0.08, 0.25, 0.04, 0.06], t60: [2.0, 0.5, 0.6, 0.2, 0.15], click: 0.06, cut: 14000 },
  vibes: { ratios: [1, 3.95, 9.9], amps: [1, 0.2, 0.04], t60: [3.0, 1.2, 0.4], click: 0.02, cut: 8000, trem: 5.2 },
  chime: { ratios: [1, 2.76, 5.4, 6.0, 8.9], amps: [1, 0.5, 0.25, 0.18, 0.1], t60: [6, 3, 1.4, 1.2, 0.5], click: 0.03, cut: 10000 },
};
export function mallet(kind, midi, dur, vel, o = {}, rng = Math.random) {
  const M = MODAL[kind];
  const f0 = hz(midi), v = clamp(vel, 0.05, 1);
  const scale = Math.pow(2, -(midi - 72) / 24);
  const longest = M.t60[0] * scale * (o.ring ?? 1);
  const damp = o.damp ? Math.min(longest, dur + 0.15) : longest;
  const len = Math.round(Math.min(damp, longest) * SR * 1.05) + 256;
  const out = new Float32Array(len);
  const relIdx = o.damp ? Math.round(dur * SR) : Infinity;
  for (let k = 0; k < M.ratios.length; k++) {
    const f = f0 * M.ratios[k];
    if (f > M.cut * (0.6 + 0.4 * v)) continue;
    const bright = k === 0 ? 1 : Math.pow(v, 0.7);
    partial(out, 0, f, M.amps[k] * bright * v * 0.5, M.t60[k] * scale * (o.ring ?? 1), rng() * 0.2, relIdx, 0.12);
  }
  const cl = Math.round(0.004 * SR), bp = new Biquad('bp', Math.min(9000, f0 * 4), 1.2);
  for (let i = 0; i < cl; i++) out[i] += bp.tick(rng() * 2 - 1) * M.click * v * (1 - i / cl);
  if (M.trem) for (let i = 0; i < len; i++) out[i] *= 1 - 0.25 * (0.5 + 0.5 * Math.sin((TAU * M.trem * i) / SR));
  return ramp(out, 12, Math.round(0.03 * SR));
}

// ---------------------------------------------------------------- plucked strings (extended Karplus–Strong)
const PLUCK = {
  guitar: { t60: (m) => clamp(5.5 * Math.pow(2, -(m - 40) / 22), 1.2, 6), bright: 0.18, pick: 0.13, soft: 0.8, body: [[98, 5, 2.2], [200, 4, 2.2], [400, 2, 1.5], [2600, 1, 1]], hp: 70, lp: 5200, damp: 0.12 },
  steel: { t60: (m) => clamp(7 * Math.pow(2, -(m - 40) / 24), 1.5, 7), bright: 0.65, pick: 0.11, soft: 0.4, body: [[105, 5, 2], [210, 3, 2], [3200, 3, 1]], hp: 80, lp: 11000, damp: 0.12 },
  mandolin: { t60: (m) => clamp(2.2 * Math.pow(2, -(m - 55) / 24), 0.5, 2.5), bright: 0.7, pick: 0.09, soft: 0.3, body: [[330, 4, 2], [900, 3, 1.5], [2500, 4, 1]], hp: 180, lp: 10000, damp: 0.08, course: 3.5 },
  harp: { t60: (m) => clamp(9 * Math.pow(2, -(m - 36) / 20), 1.6, 9), bright: 0.08, pick: 0.5, soft: 0.9, body: [[160, 2, 1.2], [600, 1.5, 1]], hp: 50, lp: 4200, damp: 0.3 },
  pizz: { t60: (m) => clamp(1.4 * Math.pow(2, -(m - 43) / 26), 0.35, 1.4), bright: 0.25, pick: 0.25, soft: 0.8, body: [[280, 5, 2], [480, 3, 2], [2800, 2, 1]], hp: 60, lp: 5000, damp: 0.06 },
  bass: { t60: (m) => clamp(3.5 * Math.pow(2, -(m - 28) / 24), 1.2, 3.5), bright: 0.1, pick: 0.2, soft: 0.85, body: [[70, 4, 1.5], [700, -3, 1]], hp: 32, lp: 2200, damp: 0.07 },
  ebass: { t60: (m) => 3.5, bright: 0.35, pick: 0.18, soft: 0.7, body: [[90, 3, 1.2], [800, 2, 1.2]], hp: 35, lp: 3200, damp: 0.06 },
};
export function pluck(kind, midi, dur, vel, o = {}, rng = Math.random) {
  const P = PLUCK[kind];
  const v = clamp(vel, 0.05, 1);
  const T60 = (o.t60 ?? P.t60(midi)) * (o.sustain ?? 1);
  const ring = o.ring ? Math.min(T60, o.ring) : T60;
  const len = Math.round(Math.min(dur + (o.letRing ? ring : P.damp * 3), ring + 0.05) * SR) + 64;
  const out = new Float32Array(len);
  const courses = P.course ? [-P.course / 2, P.course / 2] : [0];
  for (const ct of courses) {
    const f0 = hz(midi) * Math.pow(2, ((o.cents ?? 0) + ct) / 1200);
    const s = 0.5 - 0.42 * clamp(P.bright * (0.6 + 0.6 * v) * (o.bright ?? 1)); // loop-filter tap weight
    const D = SR / f0 - s;
    let Ni = Math.floor(D), frac = D - Ni;
    if (frac < 0.15) { Ni -= 1; frac += 1; }
    const C = (1 - frac) / (1 + frac);
    const g = Math.pow(10, -3 / (T60 * f0));
    const gRel = Math.pow(10, -3 / (P.damp * f0));
    const buf = new Float32Array(Ni + 2);
    // excitation: one period of filtered noise, comb-shaped by the pick position
    const exc = new Float32Array(Ni);
    const lpc = clamp((P.soft + (0.75 - v) * 0.25) * (o.soft ?? 1), 0, 0.97);
    let y = 0;
    for (let i = 0; i < Ni; i++) { y = (1 - lpc) * (rng() * 2 - 1) + lpc * y; exc[i] = y; }
    const pp = Math.max(1, Math.round(Ni * (o.pick ?? P.pick)));
    for (let i = Ni - 1; i >= pp; i--) exc[i] -= exc[i - pp];
    let mean = 0; for (let i = 0; i < Ni; i++) mean += exc[i]; mean /= Ni;
    let en = 0; for (let i = 0; i < Ni; i++) en += (exc[i] - mean) ** 2;
    const norm = 0.5 / Math.sqrt(en / Ni + 1e-12); // same energy however soft the excitation filter
    for (let i = 0; i < Ni; i++) buf[i] = (exc[i] - mean) * norm;
    let p = 0, prev = 0, apX = 0, apY = 0;
    const relIdx = o.letRing ? Infinity : Math.round(dur * SR);
    const amp = (0.55 * v) / courses.length;
    for (let i = 0; i < len; i++) {
      const x = buf[p];
      const lp = (1 - s) * x + s * prev; prev = x;
      const ap = C * lp + apX - C * apY; apX = lp; apY = ap;
      buf[p] = ap * (i < relIdx ? g : gRel);
      out[i] += x * amp;
      p++; if (p >= Ni) p = 0;
    }
  }
  const hp = new Biquad('hp', P.hp, 0.7), lp = new Biquad('lp', P.lp * (0.6 + 0.4 * v), 0.6);
  const body = P.body.map(([f, db, q]) => new Biquad('peak', f, q, db));
  for (let i = 0; i < len; i++) { let x = lp.tick(hp.tick(out[i])); for (const b of body) x = b.tick(x); out[i] = x; }
  return ramp(out, 8, Math.round(0.03 * SR));
}

// ---------------------------------------------------------------- phrase helpers
// A phrase is [{ t, d, m, v, slur? }] in seconds relative to its start. slur: no re-articulation from the previous note.
function phraseLen(ph, tail) { let e = 0; for (const n of ph) e = Math.max(e, n.t + n.d); return Math.round((e + tail) * SR); }

/** Per-sample frequency and gate curves for a legato phrase. */
function phraseCurves(ph, len, o, rng) {
  const freq = new Float32Array(len), gate = new Float32Array(len), dyn = new Float32Array(len), age = new Float32Array(len);
  const glide = Math.round((o.glide ?? 0.05) * SR);
  let lastF = null, lastEnd = -1;
  for (let k = 0; k < ph.length; k++) {
    const n = ph[k], f = hz(n.m), s = Math.round(n.t * SR), e = Math.min(len, Math.round((n.t + n.d) * SR));
    const legato = lastF !== null && s - lastEnd < 0.03 * SR && n.slur !== false;
    const nextLegato = k + 1 < ph.length && Math.round(ph[k + 1].t * SR) - e < 0.03 * SR && ph[k + 1].slur !== false;
    const eEff = nextLegato ? Math.round(ph[k + 1].t * SR) : e;
    for (let i = s; i < eEff && i < len; i++) {
      const j = i - s;
      freq[i] = legato && j < glide ? lastF + (f - lastF) * (0.5 - 0.5 * Math.cos((Math.PI * j) / glide)) : f;
      gate[i] = 1; dyn[i] = n.v; age[i] = legato ? 0.6 + j / SR : j / SR;
    }
    lastF = f; lastEnd = eEff;
  }
  // hold the frequency through gaps (release tails keep their pitch)
  let hold = freq[0] || hz(ph[0].m);
  for (let i = 0; i < len; i++) { if (freq[i] > 0) hold = freq[i]; else freq[i] = hold; }
  return { freq, gate, dyn, age };
}

/** Smooth a 0/1 gate into an amplitude envelope with separate attack / release (one-pole). */
function envFollow(gate, dyn, atk, rel, o = {}) {
  const n = gate.length, env = new Float32Array(n);
  const ka = 1 - Math.exp(-1 / (atk * SR)), kr = 1 - Math.exp(-1 / (rel * SR));
  let e = 0, d = dyn[0] || 0.7;
  const kd = 1 - Math.exp(-1 / (0.06 * SR));
  for (let i = 0; i < n; i++) {
    if (gate[i] > 0) d += (dyn[i] - d) * kd;
    const target = gate[i] * d;
    e += (target - e) * (target > e ? ka : kr);
    env[i] = e;
  }
  return env;
}

// ---------------------------------------------------------------- bowed strings (section or solo)
const BOWED = {
  violin: { body: [[290, 3, 1.4], [500, 2.5, 1.6], [1100, -2, 1], [2900, 4.5, 1], [5200, -3, 0.8]], lp: [2600, 7500], hp: 180, noise: 3200 },
  viola: { body: [[230, 3, 1.4], [420, 2.5, 1.5], [1000, -2, 1], [2400, 3.5, 1], [4500, -5, 0.8]], lp: [1800, 4800], hp: 120, noise: 2600 },
  cello: { body: [[120, 2.5, 1.3], [240, 3, 1.5], [600, -2, 1], [1700, 3.5, 1], [3600, -5, 0.8]], lp: [1300, 3600], hp: 55, noise: 2000 },
  bass: { body: [[70, 3, 1.3], [160, 2, 1.4], [900, 2, 1], [2200, -6, 0.8]], lp: [700, 1900], hp: 32, noise: 1200 },
};
export function bowed(ph, o = {}, rng = Math.random) {
  const R = BOWED[o.reg || 'violin'];
  const voices = o.voices ?? 5, solo = voices === 1;
  const atk = o.attack ?? (solo ? 0.09 : 0.16), rel = o.release ?? (solo ? 0.22 : 0.35);
  const len = phraseLen(ph, rel * 4 + 0.1);
  const { freq, age, gate, dyn } = phraseCurves(ph, len, { glide: o.glide ?? (solo ? 0.07 : 0.045) }, rng);
  const env = envFollow(gate, dyn, atk, rel);
  const L = new Float32Array(len), Rr = new Float32Array(len);
  const vibDepth = (o.vib ?? (solo ? 22 : 11)) / 1200;
  const CR = 16; // control rate: pitch and level are computed every 16 samples and interpolated
  // each voice draws from its own generator, so a phrase cut shorter renders identically up to the cut (loop seams)
  const vrs = Array.from({ length: voices }, () => makeRng((rng() * 4294967296) >>> 0));
  for (let k = 0; k < voices; k++) {
    const vr = vrs[k];
    const det = solo ? 0 : ((k / Math.max(1, voices - 1)) * 2 - 1) * (o.spread ?? 9) / 1200 + (vr() - 0.5) * 0.002;
    const rate = 5.0 + vr() * 1.0, vph = vr() * TAU;
    const lag = solo ? 0 : Math.round(vr() * 0.025 * SR);
    let ph0 = vr();
    const dr = drift(Math.ceil(len / CR) + 1, 0.7 * CR, vr); // last: it draws as many values as the phrase is long
    const pan = solo ? 0 : ((k / Math.max(1, voices - 1)) * 2 - 1) * (o.width ?? 0.6);
    const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
    const vg = 1 / Math.sqrt(voices);
    let a0 = 0;
    for (let i = 0, c = 0; i < len; i += CR, c++) {
      const j = Math.max(0, i - lag);
      const vibOn = clamp((age[j] - 0.18) / 0.35);
      const cents = det + dr[c] * 0.0018 + vibDepth * vibOn * Math.sin((TAU * rate * i) / SR + vph);
      const dt = (freq[j] * (1 + cents * 0.6931472)) / SR;
      const a1 = env[Math.min(len - 1, j + CR)] * vg, da = (a1 - a0) / CR;
      const e = Math.min(len, i + CR);
      let a = a0;
      for (let n = i; n < e; n++) {
        ph0 += dt; if (ph0 >= 1) ph0 -= 1;
        const saw = (2 * ph0 - 1 - blep(ph0, dt)) * a;
        L[n] += saw * gl; Rr[n] += saw * gr;
        a += da;
      }
      a0 = a1;
    }
  }
  // bow noise, then a low-pass that opens with the bow pressure (the body EQ is applied per track: bodyChain)
  const nb = new Biquad('bp', R.noise, 0.8), nz = (o.noise ?? 1) * 0.05;
  if (nz > 0) for (let i = 0; i < len; i++) { const ns = nb.tick(rng() * 2 - 1) * env[i] * nz; L[i] += ns; Rr[i] += ns * 0.9; }
  const bright = o.bright ?? 1;
  for (const ch of [L, Rr]) {
    const lp1 = new Biquad(), lp2 = new Biquad();
    for (let i = 0; i < len; i++) {
      if ((i & 63) === 0) { const c = (R.lp[0] + (R.lp[1] - R.lp[0]) * clamp(Math.sqrt(env[i]) * 1.05)) * bright; lp1.set('lp', c, 0.6); lp2.set('lp', c * 1.3, 0.6); }
      ch[i] = lp2.tick(lp1.tick(ch[i])) * 0.42;
    }
  }
  return [L, Rr];
}

/** Static tone of a bowed section (high-pass + body resonances), applied once per track. */
export function bodyChain(reg) {
  const R = BOWED[reg] || BOWED.violin;
  return [new Biquad('hp', R.hp, 0.7), ...R.body.map(([f, db, q]) => new Biquad('peak', f, q, db))];
}

/** Short bowed notes (spiccato / staccato / marcato) — one call per note, section of voices. Returns [L, R]. */
export function bowShort(midi, dur, vel, o = {}, rng = Math.random) {
  const art = o.art || 'spicc';
  const d = art === 'spicc' ? Math.min(dur, 0.16) : art === 'stacc' ? Math.min(dur, 0.32) : dur;
  const ph = [{ t: 0, d, m: midi, v: vel }];
  return bowed(ph, { ...o, attack: art === 'spicc' ? 0.006 : art === 'stacc' ? 0.012 : 0.025, release: art === 'spicc' ? 0.05 : 0.09, vib: 4, glide: 0 }, rng);
}

// ---------------------------------------------------------------- flute and tin whistle
export function flute(ph, o = {}, rng = Math.random) {
  const whistle = o.kind === 'whistle';
  const len = phraseLen(ph, 0.6);
  const { freq, gate, dyn, age } = phraseCurves(ph, len, { glide: o.glide ?? (whistle ? 0.018 : 0.035) }, rng);
  // re-articulation dips: tongued notes restart the envelope
  const env = envFollow(gate, dyn, o.attack ?? (whistle ? 0.018 : 0.045), o.release ?? 0.09);
  const out = new Float32Array(len);
  const vibRate = whistle ? 5.6 : 5.0, vibDepth = (o.vib ?? (whistle ? 7 : 16)) / 1200;
  const H = whistle ? [1, 0.42, 0.22, 0.09, 0.05] : [1, 0.28, 0.11, 0.045, 0.02];
  const bpN = new Biquad(), hissHp = new Biquad('hp', 4000, 0.7);
  const dr = drift(len, 0.9, makeRng((rng() * 4294967296) >>> 0));
  let ph0 = 0;
  for (let i = 0; i < len; i++) {
    if ((i & 31) === 0) bpN.set('bp', freq[i], whistle ? 5 : 7);
    const vibOn = clamp((age[i] - 0.25) / 0.4);
    const f = freq[i] * (1 + 0.6931472 * (vibDepth * vibOn * Math.sin((TAU * vibRate * i) / SR) + dr[i] * 0.0012));
    ph0 += f / SR; if (ph0 >= 1) ph0 -= 1;
    const e = env[i], b = clamp(e * 1.3);
    let s = 0;
    for (let h = 0; h < H.length; h++) { if ((h + 1) * f > 16000) break; s += H[h] * (h === 0 ? 1 : b) * Math.sin(TAU * (h + 1) * ph0); }
    const n = rng() * 2 - 1;
    const breath = bpN.tick(n) * (whistle ? 0.16 : 0.22) + hissHp.tick(n) * 0.025;
    // chiff at articulations
    const chiff = age[i] < 0.03 && gate[i] > 0 ? n * 0.25 * (1 - age[i] / 0.03) : 0;
    out[i] = (s * 0.42 + breath + chiff * (whistle ? 1.2 : 0.6)) * e * 0.55;
  }
  const hp = new Biquad('hp', 200, 0.7), pk = new Biquad('peak', whistle ? 3000 : 2200, 1, whistle ? 3 : 1.5);
  for (let i = 0; i < len; i++) out[i] = pk.tick(hp.tick(out[i]));
  return [out, out];
}

// ---------------------------------------------------------------- accordion (two reeds, musette beat)
export function accordion(midi, dur, vel, o = {}, rng = Math.random) {
  const rel = o.release ?? 0.07;
  const len = Math.round((dur + rel * 5) * SR);
  const out = new Float32Array(len);
  const v = clamp(vel, 0.05, 1);
  const reeds = o.reeds ?? [[0, 1], [o.musette ?? 11, 0.8]];
  if (o.low) reeds.push([-1200, 0.5]);
  const atk = 1 - Math.exp(-1 / ((o.attack ?? 0.035) * SR)), kr = 1 - Math.exp(-1 / (rel * SR));
  const relIdx = Math.round(dur * SR);
  for (const [c, a] of reeds) {
    const f = hz(midi) * Math.pow(2, c / 1200), dt = f / SR;
    let p = rng(), e = 0;
    const duty = 0.32;
    for (let i = 0; i < len; i++) {
      e += ((i < relIdx ? 1 : 0) - e) * (i < relIdx ? atk : kr);
      p += dt; if (p >= 1) p -= 1;
      let q = p + 1 - duty; if (q >= 1) q -= 1;
      const saw = 2 * p - 1 - blep(p, dt), saw2 = 2 * q - 1 - blep(q, dt);
      out[i] += (saw - saw2) * 0.5 * e * a;
    }
  }
  const lp = new Biquad('lp', 2600 + 2400 * v, 0.6), pk = new Biquad('peak', 1300, 1.2, 4), hp = new Biquad('hp', 140, 0.7), lp2 = new Biquad('lp', 6000, 0.7);
  const g = 0.16 * v;
  for (let i = 0; i < len; i++) out[i] = lp2.tick(pk.tick(lp.tick(hp.tick(out[i])))) * g;
  return out;
}

// ---------------------------------------------------------------- brass (soft horn section) and choir
export function brass(ph, o = {}, rng = Math.random) {
  const voices = o.voices ?? 3;
  const len = phraseLen(ph, 0.6);
  const { freq, gate, dyn, age } = phraseCurves(ph, len, { glide: 0.04 }, rng);
  const env = envFollow(gate, dyn, o.attack ?? 0.06, o.release ?? 0.16);
  const L = new Float32Array(len), R = new Float32Array(len);
  for (let k = 0; k < voices; k++) {
    const det = ((k / Math.max(1, voices - 1)) * 2 - 1) * 6 / 1200;
    const pan = ((k / Math.max(1, voices - 1)) * 2 - 1) * 0.35;
    const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
    const lp1 = new Biquad(), lp2 = new Biquad();
    const rate = 4.8 + rng() * 0.6;
    let p = rng();
    for (let i = 0; i < len; i++) {
      const scoop = age[i] < 0.06 ? -0.025 * (1 - age[i] / 0.06) : 0;
      const f = freq[i] * (1 + 0.6931472 * (det + scoop / 12 + 0.0025 * clamp((age[i] - 0.3) / 0.4) * Math.sin((TAU * rate * i) / SR)));
      const dt = f / SR;
      p += dt; if (p >= 1) p -= 1;
      const saw = 2 * p - 1 - blep(p, dt);
      if ((i & 31) === 0) { const c = Math.min(9000, f * (1.6 + 7 * Math.pow(env[i], 1.4))); lp1.set('lp', c, 0.9); lp2.set('lp', c * 1.2, 0.6); }
      const x = lp2.tick(lp1.tick(saw)) * env[i] / Math.sqrt(voices);
      L[i] += x * gl; R[i] += x * gr;
    }
  }
  for (const ch of [L, R]) { const pk = new Biquad('peak', o.formant ?? 520, 1.1, 4), hp = new Biquad('hp', 60, 0.7), lp = new Biquad('lp', 4500, 0.6); for (let i = 0; i < len; i++) ch[i] = lp.tick(pk.tick(hp.tick(ch[i]))) * 0.5; }
  return [L, R];
}

const VOWELS = { a: [[730, 1, 0], [1090, 0.5, -4], [2440, 0.25, -12]], o: [[500, 1, 0], [850, 0.6, -4], [2400, 0.2, -16]], u: [[330, 1, 0], [800, 0.4, -8], [2300, 0.15, -20]], e: [[530, 1, 0], [1850, 0.5, -8], [2500, 0.3, -10]] };
/** Choir pad: chords as a phrase per voice line ({ t, d, m, v }); a saw ensemble, formants applied per track (vowelFilter). */
export function choir(ph, o = {}, rng = Math.random) {
  return bowed(ph, { voices: o.voices ?? 4, attack: o.attack ?? 0.4, release: o.release ?? 0.6, vib: 14, spread: 8, glide: 0.08, noise: 0.4, reg: 'viola', bright: 1.6, width: 0.7 }, rng);
}
/** Parallel formant bank for a vowel: returns x => y (stateful, one per channel). */
export function vowelFilter(vowel = 'a') {
  const V = VOWELS[vowel];
  const bp = V.map(([f, q]) => new Biquad('bp', f, 3 + q * 4)), gs = V.map(([, , db]) => Math.pow(10, db / 20));
  const breath = new Biquad('bp', 3500, 0.8), hp = new Biquad('hp', 90, 0.7);
  return (x) => { x = hp.tick(x); let y = 0; for (let k = 0; k < bp.length; k++) y += bp[k].tick(x) * gs[k]; return y * 2.6 + breath.tick(x) * 0.15; };
}

/** Soft synth pad ("air"): saw ensemble through a gentle low-pass. Same phrase format. */
export function airPad(ph, o = {}, rng = Math.random) {
  return bowed(ph, { voices: o.voices ?? 3, attack: o.attack ?? 0.9, release: o.release ?? 1.2, vib: 4, spread: 12, glide: 0.2, noise: 0, reg: 'viola', bright: 0.55, width: 0.9 }, rng);
}

// ---------------------------------------------------------------- drums and hand percussion
function noiseBurst(len, rng) { const b = new Float32Array(len); for (let i = 0; i < len; i++) b[i] = rng() * 2 - 1; return b; }
const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
function metal(len, base, rng) {
  const out = new Float32Array(len), ph = METAL.map(() => rng());
  for (let i = 0; i < len; i++) { let s = 0; for (let k = 0; k < 6; k++) { ph[k] += (METAL[k] * base) / SR; ph[k] -= Math.floor(ph[k]); s += ph[k] < 0.5 ? 1 : -1; } out[i] = s / 6; }
  return out;
}
export function drum(kind, vel, o = {}, rng = Math.random) {
  const v = clamp(vel, 0.05, 1);
  const tune = o.tune ?? 1;
  let len, out;
  switch (kind) {
    case 'kick': {
      len = Math.round(0.5 * SR); out = new Float32Array(len);
      let p = 0;
      for (let i = 0; i < len; i++) {
        const t = i / SR, f = (46 + 70 * Math.exp(-t / 0.035)) * tune;
        p += f / SR;
        out[i] = Math.sin(TAU * p) * Math.exp(-t / (0.22 * (o.decay ?? 1))) * 0.9;
      }
      const cl = new Biquad('hp', 1500, 0.7); for (let i = 0; i < 0.006 * SR; i++) out[i] += cl.tick(rng() * 2 - 1) * 0.25 * (1 - i / (0.006 * SR));
      break;
    }
    case 'snare': case 'brush': {
      const brush = kind === 'brush';
      len = Math.round((brush ? 0.32 : 0.35) * SR); out = new Float32Array(len);
      const n = noiseBurst(len, rng), bp = new Biquad('bp', brush ? 4500 : 3200, 0.6), hp = new Biquad('hp', brush ? 1500 : 900, 0.7);
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const nz = hp.tick(bp.tick(n[i])) * (brush ? Math.exp(-t / 0.09) * (1 - Math.exp(-t / 0.012)) : Math.exp(-t / 0.11));
        const tone = brush ? 0 : (Math.sin(TAU * 185 * tune * t) * 0.5 + Math.sin(TAU * 330 * tune * t) * 0.3) * Math.exp(-t / 0.05);
        out[i] = nz * (brush ? 1.2 : 0.9) + tone;
      }
      break;
    }
    case 'rim': {
      len = Math.round(0.08 * SR); out = new Float32Array(len);
      for (let i = 0; i < len; i++) { const t = i / SR; out[i] = (Math.sin(TAU * 1700 * t) * 0.6 + Math.sin(TAU * 520 * t) * 0.5) * Math.exp(-t / 0.012); }
      break;
    }
    case 'hat': case 'ohat': case 'ride': case 'crash': case 'sizzle': {
      const dec = { hat: 0.045, ohat: 0.32, ride: 0.9, crash: 2.4, sizzle: 1.4 }[kind] * (o.decay ?? 1);
      len = Math.round(Math.min(4, dec * 4) * SR); out = new Float32Array(len);
      const m = metal(len, kind === 'ride' ? 1.6 : 2.4, rng), n = noiseBurst(len, rng);
      const hp1 = new Biquad('hp', kind === 'crash' ? 3500 : 6500, 0.7), hp2 = new Biquad('hp', kind === 'crash' ? 3500 : 6500, 0.7);
      const bp = new Biquad('bp', 9000, 0.5);
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const x = m[i] * (kind === 'ride' ? 0.8 : 0.5) + n[i] * (kind === 'crash' ? 0.8 : 0.5);
        out[i] = hp2.tick(hp1.tick(x + bp.tick(n[i]) * 0.3)) * Math.exp(-t / dec) * (1 - Math.exp(-t / 0.0008));
      }
      if (kind === 'ride') for (let i = 0; i < len; i++) out[i] += Math.sin((TAU * 3150 * i) / SR) * 0.05 * Math.exp(-i / (0.5 * SR));
      break;
    }
    case 'tom': {
      len = Math.round(0.7 * SR); out = new Float32Array(len);
      const f0 = (o.f ?? 110) * tune; let p = 0;
      const n = noiseBurst(len, rng), bp = new Biquad('bp', f0 * 3, 1);
      for (let i = 0; i < len; i++) { const t = i / SR; p += (f0 * (1 + 0.35 * Math.exp(-t / 0.05))) / SR; out[i] = Math.sin(TAU * p) * Math.exp(-t / 0.28) * 0.85 + bp.tick(n[i]) * Math.exp(-t / 0.03) * 0.4; }
      break;
    }
    case 'frame': case 'frameSlap': {
      // frame drum: a few membrane modes plus a slap at the rim
      len = Math.round(0.9 * SR); out = new Float32Array(len);
      const f0 = (o.f ?? 82) * tune, slap = kind === 'frameSlap';
      const modes = [[1, 1, 0.5], [1.59, 0.5, 0.28], [2.14, 0.35, 0.2], [2.3, 0.3, 0.16], [2.65, 0.2, 0.12], [2.92, 0.15, 0.1]];
      for (const [r, a, d] of modes) partial(out, 0, f0 * r, a * (slap ? 0.4 : 1) * 0.5, d * (slap ? 0.6 : 1) * 1.3, 0);
      const n = noiseBurst(len, rng), bp = new Biquad('bp', slap ? 1800 : 700, 0.8);
      for (let i = 0; i < 0.05 * SR; i++) out[i] += bp.tick(n[i]) * Math.exp(-i / ((slap ? 0.012 : 0.006) * SR)) * (slap ? 0.9 : 0.35);
      break;
    }
    case 'tamb': case 'shaker': {
      const tamb = kind === 'tamb';
      len = Math.round((tamb ? 0.3 : 0.12) * SR); out = new Float32Array(len);
      const n = noiseBurst(len, rng);
      const bands = tamb ? [6200, 8300, 10400, 12100].map((f) => new Biquad('bp', f, 9)) : [new Biquad('bp', 5500, 0.9)];
      const hp = new Biquad('hp', 3000, 0.7);
      const att = (o.soft ? 0.02 : 0.002) * SR;
      for (let i = 0; i < len; i++) {
        const t = i / SR, x = n[i];
        let y = 0; for (const b of bands) y += b.tick(x);
        const e = (1 - Math.exp(-i / att)) * Math.exp(-t / (tamb ? 0.09 : 0.035));
        out[i] = hp.tick(y * (tamb ? 1.6 : 0.9)) * e;
      }
      break;
    }
    case 'timp': {
      len = Math.round(2.6 * SR); out = new Float32Array(len);
      const f0 = o.f ?? 73.4;
      const modes = [[1, 1, 1.9], [1.5, 0.55, 1.4], [1.98, 0.35, 1.1], [2.44, 0.22, 0.8], [2.94, 0.12, 0.6], [3.42, 0.06, 0.4]];
      for (const [r, a, d] of modes) partial(out, 0, f0 * r, a * 0.45, d * (o.decay ?? 1), 0);
      partial(out, 0, f0 * 0.62, 0.15, 0.2, 0);
      const n = noiseBurst(Math.round(0.03 * SR), rng), lp = new Biquad('lp', 900, 0.7);
      for (let i = 0; i < n.length; i++) out[i] += lp.tick(n[i]) * 0.2 * (1 - i / n.length);
      break;
    }
    case 'bassdrum': {
      len = Math.round(2.2 * SR); out = new Float32Array(len);
      partial(out, 0, 48, 0.7, 1.4, 0); partial(out, 0, 71, 0.35, 0.8, 0); partial(out, 0, 98, 0.2, 0.5, 0);
      const n = noiseBurst(Math.round(0.05 * SR), rng), lp = new Biquad('lp', 400, 0.7);
      for (let i = 0; i < n.length; i++) out[i] += lp.tick(n[i]) * 0.3 * (1 - i / n.length);
      break;
    }
    case 'snap': case 'clap': {
      len = Math.round(0.2 * SR); out = new Float32Array(len);
      const n = noiseBurst(len, rng), bp = new Biquad('bp', kind === 'snap' ? 2800 : 1300, kind === 'snap' ? 2 : 1);
      const bursts = kind === 'clap' ? [0, 0.008, 0.017] : [0];
      for (let i = 0; i < len; i++) { const t = i / SR; let e = 0; for (const b of bursts) if (t >= b) e = Math.max(e, Math.exp(-(t - b) / (kind === 'snap' ? 0.015 : 0.03))); out[i] = bp.tick(n[i]) * e * 1.3; }
      break;
    }
    case 'triangle': {
      len = Math.round(2.5 * SR); out = new Float32Array(len);
      for (const [f, a, d] of [[1250, 0.4, 1.8], [3720, 0.25, 1.2], [6150, 0.15, 0.8], [8650, 0.1, 0.5]]) partial(out, 0, f, a * 0.4, d, 0);
      break;
    }
    case 'swell': {
      // suspended-cymbal roll swelling into the next downbeat; o.dur seconds
      const d = o.dur ?? 2;
      len = Math.round((d + 1.5) * SR); out = new Float32Array(len);
      const m = metal(len, 2.2, rng), n = noiseBurst(len, rng), hp = new Biquad('hp', 3000, 0.7), hp2 = new Biquad('hp', 3000, 0.7);
      for (let i = 0; i < len; i++) { const t = i / SR; const e = t < d ? Math.pow(t / d, 2.2) : Math.exp(-(t - d) / 0.5); out[i] = hp2.tick(hp.tick(m[i] * 0.4 + n[i] * 0.6)) * e * 0.5; }
      break;
    }
    default: throw new Error('drum ' + kind);
  }
  for (let i = 0; i < len; i++) out[i] *= v;
  return out;
}

export { makeRng };
