// Notation for the game score: melodies as strings, chord symbols, voicings and accompaniment patterns.
// Every time is in beats from the start of the cue (beat 0 = first downbeat of the intro).
//
// Melody strings: "F#5/1.5 E5/.5 -/1 D5+F#5/2"  pitch/beats ("-" rest, "+" chord), then optional marks:
//   "@0.8"  set velocity for the following notes      "!" accent (x1.18)      "'" detached (re-articulated, 85 % length)
//   "."     staccato (45 % length)                      "~" tie: merge with the next note (same pitch)
import { midiOf } from './dsp.mjs';

export function mel(str, at = 0, o = {}) {
  const out = [];
  let b = at, vel = o.vel ?? 0.75, tie = null;
  for (const tok of str.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok[0] === '@') { vel = parseFloat(tok.slice(1)); continue; }
    if (tok === '|') continue;
    const m = /^([^/]+)\/([\d.]+)([!'.~]*)$/.exec(tok);
    if (!m) throw new Error('bad token ' + tok);
    const d = parseFloat(m[2]), marks = m[3];
    if (m[1] !== '-') {
      const ms = m[1].split('+').map((p) => midiOf(p) + (o.tr ?? 0));
      if (tie && tie.m.length === ms.length && tie.m.every((x, i) => x === ms[i])) { tie.d += d; if (!marks.includes('~')) tie = null; b += d; continue; }
      const ev = { b, d, m: ms, v: vel * (marks.includes('!') ? 1.18 : 1) };
      if (marks.includes("'")) { ev.d = d * 0.85; ev.art = 'det'; }
      if (marks.includes('.')) { ev.d = d * 0.45; ev.art = 'stacc'; }
      out.push(ev);
      tie = marks.includes('~') ? ev : null;
    } else tie = null;
    b += d;
  }
  return out;
}

/** Shift events by beats and/or semitones. */
export const shift = (evs, beats = 0, semis = 0) => evs.map((e) => ({ ...e, b: e.b + beats, m: e.m.map((x) => x + semis) }));
export const vel = (evs, k) => evs.map((e) => ({ ...e, v: e.v * k }));
export const octave = (evs, n) => shift(evs, 0, 12 * n);
/** Map pitch classes (e.g. major → minor colour): map = { fromPc: toPc } relative to C. */
export function remap(evs, map) {
  return evs.map((e) => ({ ...e, m: e.m.map((x) => { const pc = ((x % 12) + 12) % 12; return pc in map ? x - pc + map[pc] : x; }) }));
}
/** Stretch durations and onsets (augmentation) around beat `from`. */
export const stretch = (evs, k, from = 0) => evs.map((e) => ({ ...e, b: from + (e.b - from) * k, d: e.d * k }));
/** Concatenate several event lists that each start at 0, placing them one after another every `len` beats. */
export function repeat(evs, times, len) { const o = []; for (let i = 0; i < times; i++) o.push(...shift(evs, i * len)); return o; }

// ---------------------------------------------------------------- chords
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11], '△7': [0, 4, 7, 11], m7: [0, 3, 7, 10],
  sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], '△9': [0, 4, 7, 11, 14],
  m7b5: [0, 3, 6, 10], '7b9': [0, 4, 7, 10, 13], mM7: [0, 3, 7, 11], '△7#11': [0, 4, 7, 11, 18], '5': [0, 7],
};
export function chord(sym) {
  const [main, bassSym] = sym.split('/');
  const m = /^([A-G])(#|b)?(.*)$/.exec(main);
  if (!m) throw new Error('chord ' + sym);
  const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = QUAL[m[3]];
  if (!q) throw new Error('chord quality ' + sym);
  let bass = root;
  if (bassSym) { const bm = /^([A-G])(#|b)?$/.exec(bassSym); bass = (PC[bm[1]] + (bm[2] === '#' ? 1 : bm[2] === 'b' ? -1 : 0) + 12) % 12; }
  return { sym, root, tones: q, pcs: q.map((x) => (root + x) % 12), bass };
}

/** "G△7 | A | F#m7 Bm7 |" → [{ b, d, c }] with bars of `bpb` beats; several chords in a bar share it evenly. */
export function prog(str, at = 0, bpb = 4) {
  const out = [];
  str.split('|').map((s) => s.trim()).filter((s) => s.length).forEach((bar, i) => {
    const cs = bar.split(/\s+/);
    // "A:3 E:1" gives explicit beat lengths
    let b = at + i * bpb;
    for (const c of cs) {
      const [sym, len] = c.split(':');
      const d = len ? parseFloat(len) : bpb / cs.length;
      out.push({ b, d, c: chord(sym) });
      b += d;
    }
  });
  return out;
}

/** Choose `n` chord tones between lo and hi, close to the previous voicing (smooth voice leading). */
export function voice(c, lo, hi, n, prev) {
  const cands = [];
  for (let m = lo; m <= hi; m++) if (c.pcs.includes(m % 12)) cands.push(m);
  // greedy: always include root/3rd colours, then fill; score by distance to previous
  let best = null, bestS = Infinity;
  const combos = (arr, k, start = 0, cur = [], res = []) => { if (cur.length === k) { res.push(cur.slice()); return res; } for (let i = start; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, res); cur.pop(); } return res; };
  const all = cands.length > 14 ? combos(cands.slice(0, 14), n) : combos(cands, n);
  for (const v of all) {
    const pcs = new Set(v.map((x) => x % 12));
    let s = 0;
    // must contain the 3rd (or sus tone) and the 7th/6th when present
    const third = c.pcs[1];
    if (!pcs.has(third)) s += 30;
    if (c.pcs.length > 3 && !pcs.has(c.pcs[3])) s += 8;
    if (pcs.size < Math.min(n, c.pcs.length)) s += 12 * (Math.min(n, c.pcs.length) - pcs.size);
    // avoid tight low clusters
    for (let i = 1; i < v.length; i++) if (v[i] - v[i - 1] < 3 && v[i] < 55) s += 10;
    if (prev) { const p = prev.slice().sort((a, b) => a - b); for (let i = 0; i < Math.min(p.length, v.length); i++) s += Math.abs(p[i] - v[i]) * 0.6; }
    else s += Math.abs((v[0] + v[v.length - 1]) / 2 - (lo + hi) / 2) * 0.3;
    if (s < bestS) { bestS = s; best = v; }
  }
  return best;
}

/** Sustained chord pads: one event per chord with a voicing. */
export function pads(chords, lo, hi, n, o = {}) {
  let prev = null;
  return chords.map(({ b, d, c }) => { const v = voice(c, lo, hi, n, prev); prev = v; return { b, d: d * (o.len ?? 1), m: v, v: o.vel ?? 0.6 }; });
}

/** Arpeggio: pattern = list of voicing indices per step ("0 1 2 3 2 1"), step in beats; "b" = bass note, "-" = rest. */
export function arp(chords, pattern, step, lo, hi, n, o = {}) {
  const pat = pattern.trim().split(/\s+/);
  const out = [];
  let prev = null, k = 0;
  for (const { b, d, c } of chords) {
    const v = voice(c, lo, hi, n, prev); prev = v;
    const steps = Math.round(d / step);
    for (let s = 0; s < steps; s++) {
      const p = pat[(o.restart ? s : k) % pat.length]; k++;
      if (p === '-') continue;
      const m = p === 'b' ? lowestBass(c, lo - 12) : v[Math.min(v.length - 1, parseInt(p, 10))] + (p.endsWith("'") ? 12 : 0);
      const accent = s === 0 ? 1.1 : (s * step) % 1 === 0 ? 1 : 0.86;
      const len = o.pedal ? Math.max(step, d - s * step) : step * (o.hold ?? 1.6);
      out.push({ b: b + s * step, d: len, m: [m], v: (o.vel ?? 0.6) * accent });
    }
  }
  return out;
}
const lowestBass = (c, lo) => { let m = lo; while (m % 12 !== c.bass) m++; return m; };

/** Bass line from chords. rhythm: [[beat, beats, deg]] per chord span, deg 'r' root(bass) | '5' | '8' | 'a' approach to next. */
export function bassLine(chords, rhythm, o = {}) {
  const lo = o.lo ?? 33, out = [];
  chords.forEach(({ b, d, c }, i) => {
    const r = lowestBass(c, lo);
    const next = chords[i + 1] ? lowestBass(chords[i + 1].c, lo) : r;
    for (const [at, len, deg] of rhythm) {
      if (at >= d) continue;
      let m = r;
      if (deg === '5') m = r + 7 > (o.hi ?? 52) ? r - 5 : r + 7;
      else if (deg === '8') m = r + 12;
      else if (deg === '3') m = r + (c.tones[1]);
      else if (deg === 'a') m = next + (next > r ? -1 : 1) * (c.pcs.includes((next + 10) % 12) ? 2 : 1);
      out.push({ b: b + at, d: Math.min(len, d - at), m: [m], v: (o.vel ?? 0.7) * (at === 0 ? 1.08 : 1) });
    }
  });
  return out;
}

/** Guitar strums: rhythm [[beat, 'd'|'u', vel]] repeated per chord span; voicing of 5 strings within [lo, hi]. */
export function strums(chords, rhythm, o = {}) {
  const out = [];
  let prev = null;
  for (const { b, d, c } of chords) {
    const v = voice(c, o.lo ?? 45, o.hi ?? 69, o.n ?? 5, prev); prev = v;
    const bassN = lowestBass(c, 40);
    const strings = [bassN < v[0] ? bassN : v[0] - 12, ...v];
    for (const [at, dir, vv] of rhythm) {
      if (at >= d) continue;
      const nxt = rhythm.find(([a]) => a > at);
      const len = Math.min((nxt ? nxt[0] : d) - at, d - at);
      const order = dir === 'd' ? strings : strings.slice(1).reverse();
      order.forEach((m, k) => out.push({ b: b + at + k * (o.spread ?? 0.022) * (dir === 'd' ? 1 : 0.7), d: len, m: [m], v: (o.vel ?? 0.55) * (vv ?? 1) * (dir === 'u' ? 0.75 : 1) * (1 - k * 0.03) }));
    }
  }
  return out;
}

/** Drum grid: lanes { kick: 'x...x...', ... } at `step` beats per char; 'x' hit, 'X' accent, 'o' ghost, '.' rest. */
export function grid(lanes, at, step, o = {}) {
  const out = {};
  for (const [lane, pat] of Object.entries(lanes)) {
    const p = pat.replace(/\s+/g, '');
    out[lane] = [];
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch === '.') continue;
      const v = ch === 'X' ? 1 : ch === 'x' ? 0.78 : 0.42;
      out[lane].push({ b: at + i * step, d: step, m: [60], v: v * (o.vel ?? 1) });
    }
  }
  return out;
}
/** Merge a list of grid() results / event arrays per lane. */
export function mergeLanes(...gs) {
  const out = {};
  for (const g of gs) for (const [k, v] of Object.entries(g)) (out[k] ||= []).push(...v);
  return out;
}

/** Block-chord comping: rhythm [[beat, beats, vel]] repeated in each chord span. */
export function comp(chords, rhythm, lo, hi, n, o = {}) {
  const out = [];
  let prev = null;
  for (const { b, d, c } of chords) {
    const v = voice(c, lo, hi, n, prev); prev = v;
    for (const [at, len, vv] of rhythm) if (at < d) out.push({ b: b + at, d: Math.min(len, d - at), m: v.slice(), v: (o.vel ?? 0.5) * (vv ?? 1) });
  }
  return out;
}
/** Tremolo / repeated notes: each event becomes repeated notes every `step` beats (mandolin, strings). */
export function trem(evs, step, o = {}) {
  const out = [];
  for (const e of evs) for (let t = 0; t < e.d - 1e-6; t += step) out.push({ ...e, b: e.b + t, d: Math.min(step * 1.5, e.d - t), v: e.v * (t === 0 ? 1 : (o.inner ?? 0.8)) });
  return out;
}
/** Keep events whose onset is in [from, to) beats. */
export const within = (evs, from, to) => evs.filter((e) => e.b >= from - 1e-6 && e.b < to - 1e-6);
/** One-off percussion hits for a kit lane: [[beat, vel]]. */
export const hits = (list) => list.map(([b, v]) => ({ b, d: 0.5, m: [60], v }));
/** Chord stabs on fixed beats of every bar (the chord sounding at that moment): rhythm [[beatInBar, beats, vel]]. */
export function pulse(chords, rhythm, bpb, lo, hi, n, o = {}) {
  const out = [];
  if (!chords.length) return out;
  const start = chords[0].b, end = chords[chords.length - 1].b + chords[chords.length - 1].d;
  let prev = null, prevSym = null;
  for (let b = start; b < end - 1e-6; b += bpb) {
    for (const [at, len, vv] of rhythm) {
      const t = b + at;
      const c = chords.find((x) => t >= x.b - 1e-6 && t < x.b + x.d - 1e-6);
      if (!c) continue;
      if (c.c.sym !== prevSym || !prev) { prev = voice(c.c, lo, hi, n, prev); prevSym = c.c.sym; }
      out.push({ b: t, d: len, m: prev.slice(), v: (o.vel ?? 0.5) * (vv ?? 1) });
    }
  }
  return out;
}
/** Move each note `steps` scale steps within a scale (pitch classes), e.g. a diatonic third below = -2. */
export function diatonic(evs, steps, scale) {
  const pcs = scale.slice().sort((a, b) => a - b);
  const move = (m) => {
    let o = Math.floor(m / 12), pc = m % 12, i = pcs.indexOf(pc);
    if (i < 0) { i = pcs.findIndex((p) => p > pc); if (i < 0) { i = 0; o++; } }
    let k = i + steps; o += Math.floor(k / pcs.length); k = ((k % pcs.length) + pcs.length) % pcs.length;
    return o * 12 + pcs[k];
  };
  return evs.map((e) => ({ ...e, m: e.m.map(move) }));
}
export const SCALE = { D: [2, 4, 6, 7, 9, 11, 1], G: [7, 9, 11, 0, 2, 4, 6], Bm: [11, 1, 2, 4, 6, 7, 9] };
