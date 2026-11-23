// Named foes: the elites and the page guardians. D minor, 112 bpm, heavy and patient. The journey theme's head in
// minor (F E F Bb) on horns over a marcato string ostinato, timpani and a low choir; the hot layer adds the kit, high
// violins and brass stabs when the foe turns dangerous (its second phase, its rally, or her health running low).
import { mel, prog, arp, pads, comp, bassLine, grid, mergeLanes, shift, octave, vel, within, hits, remap } from '../score.mjs';
import { themeA, bars, A_MEL } from './themes.mjs';

export default function () {
  const bpm = 112, intro = 0;
  const bar = (n) => intro + (n - 1) * 4;
  const drums = (lanes, from, n, o) => mergeLanes(...Array.from({ length: n }, (_, i) => grid(lanes, bar(from + i), 0.25, o)));
  // the theme in D natural minor (F#→F, B→Bb, C#→C) with a raised leading tone at its cadence
  const DARK = A_MEL.map((s) => s.replace(/F#/g, 'F').replace(/C#/g, 'C').replace(/B(\d)/g, 'Bb$1'));
  DARK[13] = 'D6/2 C#6/1 A5/1';
  const DCH = 'Gm7 | A7 | Dm7 | Bbmaj7 | Gm7 | Am7 | Dm | Gm7 A7 | Gm7 | A7 | Dm | Dm/C | Bbmaj7 | Gm7 A7 | Dm | Bbmaj7 A7';
  const chIn = prog('Dm | Dm | Bb | A7', bar(1));
  const chA = prog(DCH, bar(5)), chB = prog('Bb | C | Am | Dm | Gm | A7 | Bb | A7', bar(21)), chA2 = prog(DCH, bar(29)), chOut = prog('Dm | Bb | Gm | A7', bar(45));
  const all = [...chIn, ...chA, ...chB, ...chA2, ...chOut];
  const tension = ['D5/4', 'E5/4', 'E5/2 C5/2', 'F5/4', 'G5/2 Bb5/2', 'A5/4', 'F5/2 D6/2', 'C#6/4'];
  const base = mergeLanes(
    drums({ tom: 'x.......x..x....', bd: 'x...............' }, 1, 48, { vel: 0.8 }),
    { timp: hits([1, 3, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 47].map((n) => [bar(n), 0.65])) },
  );
  const hot = mergeLanes(
    drums({ kick: 'x.......x.......', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.' }, 1, 20),
    drums({ kick: 'x.......x.......', snare: '........x.......', ride: 'x...x...x...x...' }, 21, 8),
    drums({ kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, 29, 16),
    drums({ kick: 'x.......x.......', snare: 'o.o.o.o.x.x.xxxx' }, 48, 1),
    { crash: hits([5, 21, 29].map((n) => [bar(n), 0.7])) },
  );
  return {
    id: 'bgm_boss', notes: 'Named foes (elites, page guardians): the theme head in D minor on horns over marcato strings, timpani and low choir; hot layer adds kit, high strings and brass; 112 bpm.', bpm, intro, loop: 48 * 4, settle: 8, reverb: 'hall', wet: 0.45,
    tracks: {
      ostinato: { inst: 'marc', events: arp(all, '0 0 1 0 0 2 0 1', 0.5, 38, 53, 3, { vel: 0.66 }), db: -6, pan: 0.15, send: 0.3, human: 0.004, o: { reg: 'cello', voices: 3 } },
      basses: { inst: 'contrabass', events: shift(bassLine(all, [[0, 3.8, 'r']], { lo: 38, vel: 0.6 }), 0, -12), db: -13, send: 0.25 },
      horns: { inst: 'horn', events: [...octave(bars(DARK, bar(5), 4, { vel: 0.74 }), -1), ...octave(bars(DARK, bar(29), 4, { vel: 0.8 }), -1)], db: -4, pan: -0.05, send: 0.42, o: { voices: 4 } },
      cellos: { inst: 'cello', events: [...octave(bars(DARK, bar(29), 4, { vel: 0.6 }), -2), ...bars(tension, bar(21), 4, { vel: 0.66 }).map((e) => ({ ...e, m: e.m.map((x) => x - 12) }))], db: -8, pan: 0.25, send: 0.38 },
      violins: { inst: 'violin', events: bars(tension, bar(21), 4, { vel: 0.66 }), db: -7, pan: -0.2, send: 0.42, o: { voices: 6 } },
      choir: { inst: 'choir', events: pads(all, 50, 64, 3, { vel: 0.42 }), db: -13, send: 0.55, o: { vowel: 'o' } },
      drums: { inst: 'kit', events: base, db: -8, hp: 45, send: 0.3, human: 0.003, o: { map: { tom: { kind: 'tom', f: 96, gain: 0.8 }, bd: { kind: 'bassdrum', gain: 0.25 }, timp: { kind: 'timp', f: 73.4, gain: 0.9 } } } },
      // ---- hot layer
      kit: { inst: 'kit', layer: 'hot', events: hot, db: -9, hp: 45, send: 0.18, human: 0.003, o: { map: { kick: { kind: 'kick', gain: 0.7, tune: 1.1 }, snare: { kind: 'snare', gain: 0.65 }, hat: { kind: 'hat', gain: 0.2, pan: 0.3 }, ride: { kind: 'ride', gain: 0.2, pan: 0.3 }, crash: { kind: 'crash', gain: 0.3, pan: -0.3 } } } },
      highStr: { inst: 'spicc', layer: 'hot', events: arp([...chA, ...chA2], '0 1 2 1 0 1 2 1', 0.25, 62, 81, 3, { vel: 0.42 }), db: -14, pan: -0.35, send: 0.3, human: 0.002, o: { reg: 'violin', voices: 4 } },
      violinsHot: { inst: 'violin', layer: 'hot', events: bars(DARK, bar(29), 4, { vel: 0.7 }), db: -8, pan: -0.15, send: 0.4, o: { voices: 6 } },
      stabs: { inst: 'horn', layer: 'hot', events: comp([...chB, ...chOut], [[0, 0.35, 1], [0.75, 0.35, 0.8], [2.5, 0.35, 0.9]], 50, 62, 3, { vel: 0.62 }), db: -10, pan: 0.15, send: 0.35 },
      piano: { inst: 'piano', layer: 'hot', events: comp([...chA, ...chA2], [[0, 0.5, 1], [1.5, 0.5, 0.8], [2.5, 0.5, 0.85]], 38, 50, 2, { vel: 0.5 }), db: -12, pan: 0.2, send: 0.25, human: 0.004 },
    },
  };
}
