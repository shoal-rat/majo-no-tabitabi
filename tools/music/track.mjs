// Render one track of a cue into a stereo pair (runs inside the worker pool, see render.mjs).
import { SR, Biquad, makeRng, addMono, addStereo } from './dsp.mjs';
import * as I from './inst.mjs';

const MALLETS = new Set(['celesta', 'glock', 'musicbox', 'vibes', 'chime']);
const PLUCKS = new Set(['guitar', 'steel', 'mandolin', 'harp', 'pizz', 'bass', 'ebass']);
const BOWS = { violin: 'violin', viola: 'viola', cello: 'cello', contrabass: 'bass' };
const PHRASED = new Set(['violin', 'viola', 'cello', 'contrabass', 'flute', 'whistle', 'horn', 'choir', 'air']);

export const secFn = (bpm, swing = 0) => (b) => { const f = b - Math.floor(b); const sw = swing && Math.abs(f - 0.5) < 1e-6 ? swing * 0.5 : 0; return ((b + sw) * 60) / bpm; };

/** Group one voice line of events into legato phrases ({ t, d, m, v, slur } in seconds from phrase start). */
function phrases(line, sec) {
  const out = [];
  let cur = null, end = -1, seg = -1;
  for (const e of line) {
    const t = sec(e.bb), d = sec(e.bb + e.d) - t;
    // phrases never run across the intro/body/loop-copy borders, so both copies of a loop phrase render the same
    const contiguous = cur && t - end < 0.03 && e.seg === seg;
    seg = e.seg;
    if (!contiguous) { cur = { t0: t, seg: e.seg, notes: [], key: e.b0 + '|' + e.m }; out.push(cur); }
    const last = cur.notes[cur.notes.length - 1];
    const slur = !!last && last.m !== e.m && e.art !== 'det' && e.art !== 'stacc';
    // a re-articulated note inside a phrase gets a short breath so the envelope can dip
    const gap = last && !slur ? Math.min(0.06, d * 0.2) : 0;
    if (gap && last) last.d = Math.max(0.03, last.d - gap);
    cur.notes.push({ t: t - cur.t0, d, m: e.m, v: e.v, slur });
    end = t + d;
  }
  return out;
}

/** Split chord events into voice lines by index (low → high). */
function lines(events) {
  const n = Math.max(1, ...events.map((e) => e.m.length));
  const out = Array.from({ length: n }, () => []);
  for (const e of events) { const ms = e.m.slice().sort((a, b) => a - b); ms.forEach((m, k) => out[k].push({ ...e, m })); }
  return out.map((l) => l.sort((a, b) => a.b - b.b));
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export function renderTrack(name, tr, cue, len, seed) {
  const sec = secFn(cue.bpm, cue.swing);
  const L = new Float32Array(len), R = new Float32Array(len);
  const human = tr.human ?? 0;
  // all randomness is seeded by what an event is (track, beat within the cue, pitch), never by render order
  // placement: an event's own time (bb = its beat in the first copy, humanised) + a whole number of samples for the
  // loop copy, so both copies of a loop note sit on exactly the same sample
  const ev = tr.events.map((e) => {
    const b0 = e.b0 ?? e.b, er = makeRng(hash(name + '|' + b0.toFixed(4) + '|' + (e.lane || e.m)));
    return { ...e, b0, seg: e.seg ?? 1, bb: b0 + (human ? ((er() + er() - 1) * human * cue.bpm) / 60 : 0), v: e.v * (human ? 1 + (er() - 0.5) * 0.1 : 1), vr: er() };
  });
  const shiftOf = (seg) => (seg === 2 ? cue.loopSamples || 0 : 0);
  const inst = tr.inst, o = tr.o || {};
  const place = (buf, t, pan = 0, gain = 1, seg = 1) => { const at = Math.round(t * SR) + shiftOf(seg); if (Array.isArray(buf)) addStereo(L, R, buf, at, gain, pan); else addMono(L, R, buf, at, gain, pan); };
  const cache = new Map();
  if (PHRASED.has(inst)) {
    lines(ev).forEach((line, li) => {
      for (const p of phrases(line, sec)) {
        if (p.t0 * SR + shiftOf(p.seg) >= len) continue;
        const rng = makeRng(hash(name + '|' + li + '|' + p.key));
        const notes = p.notes.map((n) => ({ ...n, m: Array.isArray(n.m) ? n.m[0] : n.m }));
        let buf;
        if (BOWS[inst]) buf = I.bowed(notes, { reg: BOWS[inst], ...o }, rng);
        else if (inst === 'flute' || inst === 'whistle') buf = I.flute(notes, { kind: inst, ...o }, rng);
        else if (inst === 'horn') buf = I.brass(notes, o, rng);
        else if (inst === 'choir') buf = I.choir(notes, o, rng);
        else if (inst === 'air') buf = I.airPad(notes, o, rng);
        place(buf, p.t0, 0, 1, p.seg);
      }
    });
  } else if (inst === 'kit') {
    for (const e of ev) {
      const map = o.map?.[e.lane] || { kind: e.lane };
      const t = sec(e.bb);
      if (t * SR + shiftOf(e.seg) >= len) continue;
      // cached by lane and a coarse velocity; a few variants per hit so repeated hits are not identical
      const vq = Math.max(1, Math.round(e.v * 12)), key = e.lane + '|' + vq + '|' + Math.floor(e.vr * 3);
      let buf = cache.get(key);
      if (!buf) { buf = I.drum(map.kind, vq / 12, map, makeRng(hash(name + key))); cache.set(key, buf); }
      place(buf, t, map.pan ?? 0, (map.gain ?? 1) * (e.v / Math.max(0.05, vq / 12)), e.seg);
    }
  } else {
    for (const e of ev) {
      const t = sec(e.bb), d = sec(e.bb + e.d) - t;
      if (t * SR + shiftOf(e.seg) >= len) continue;
      for (const m of e.m) {
        const vq = Math.max(1, Math.round(e.v * 24)), dq = Math.max(1, Math.round(d * 20));
        const key = m + '|' + vq + '|' + dq;
        let buf = cache.get(key);
        if (!buf) {
          const v = vq / 24, dd = dq / 20, rng = makeRng(hash(name + '|' + key));
          if (inst === 'piano') buf = I.piano(m, dd, v, o, rng);
          else if (MALLETS.has(inst)) buf = I.mallet(inst, m, dd, v, o, rng);
          else if (PLUCKS.has(inst)) buf = I.pluck(inst, m, dd, v, o, rng);
          else if (inst === 'accordion') buf = I.accordion(m, dd, v, o, rng);
          else if (inst === 'spicc' || inst === 'stacc' || inst === 'marc') buf = I.bowShort(m, dd, v, { art: inst, reg: o.reg || 'violin', voices: o.voices ?? 3, ...o }, rng);
          else throw new Error(name + ': unknown instrument ' + inst);
          cache.set(key, buf);
        }
        const pan = o.pitchPan ? (o.pan0 ?? 0) + ((m - 64) / 60) * o.pitchPan : 0;
        place(buf, t, pan, e.v / (vq / 24), e.seg);
      }
    }
  }
  // per-track tone: the instrument family's static colour, then the track's own EQ
  for (const ch of [L, R]) {
    const fs = [];
    if (BOWS[inst]) fs.push(...I.bodyChain(BOWS[inst]));
    if (inst === 'spicc' || inst === 'stacc' || inst === 'marc') fs.push(...I.bodyChain(o.reg || 'violin'));
    if (inst === 'air') fs.push(new Biquad('lp', o.cut ?? 1500, 0.7));
    if (tr.hp) fs.push(new Biquad('hp', tr.hp, 0.7));
    if (tr.lp) fs.push(new Biquad('lp', tr.lp, 0.7));
    for (const [f, db, q] of tr.eq || []) fs.push(new Biquad('peak', f, q ?? 1, db));
    const vf = inst === 'choir' ? I.vowelFilter(o.vowel || 'a') : null;
    if (!fs.length && !vf) continue;
    for (let i = 0; i < len; i++) { let x = ch[i]; if (vf) x = vf(x); for (const f of fs) x = f.tick(x); ch[i] = x; }
  }
  return [L, R];
}
