// On the broom, high or fast. The journey theme lifted a step, to E major, at 138 bpm: driving piano eighths, spiccato
// strings, kit and bass under violins and flute. The bridge on horns, the theme again with the whole band, a breakdown
// above the clouds, and a soaring string line that hands back to the groove.
import { mel, prog, arp, pads, comp, bassLine, grid, mergeLanes, shift, octave, vel, within, hits } from '../score.mjs';
import { themeA, themeB, bars, A_MEL } from './themes.mjs';

const EIGHTS = [[0, 0.5, 1], [0.5, 0.5, 0.7], [1, 0.5, 0.85], [1.5, 0.5, 0.7], [2, 0.5, 0.95], [2.5, 0.5, 0.7], [3, 0.5, 0.85], [3.5, 0.5, 0.7]];

export default function () {
  const bpm = 138, intro = 0, up = 2; // the theme a whole step higher than home
  const bar = (n) => intro + (n - 1) * 4;
  const drums = (lanes, from, n, o) => mergeLanes(...Array.from({ length: n }, (_, i) => grid(lanes, bar(from + i), 0.25, o)));
  const A_E = 'Amaj7 | B | G#m7 | C#m7 | F#m7 | B7 | C#m7 | Amaj7 B7sus4 | Amaj7 | B | C#m7 | C#m7/B | Amaj7 | B7sus4 B7 | E | Am6 B7sus4';
  const chIn = prog('Amaj7 | B | G#m7 | C#m7', bar(1));
  const chA1 = prog(A_E, bar(5)), chB = prog('C#m7 | G#m7 | Amaj7 | E/G# | F#m7 | G#m7 | Amaj7 | B7sus4 B7', bar(21)), chA2 = prog(A_E.replace('Am6 B7sus4', 'E'), bar(29));
  const chD = prog('Amaj7 | B | G#m7 | C#m7 | Amaj7 | B | Csus2 | B7sus4', bar(45));
  const chS = prog('C#m7 | Amaj7 | E/G# | B | C#m7 | Amaj7 | F#m7 | B7sus4 B7', bar(53));
  const drive = [...chIn, ...chA1, ...chB, ...chA2, ...chS];
  const soar = ['G#5/4', 'A5/2 B5/2', 'B5/4', 'D#6/2 C#6/2', 'E6/4', 'C#6/2 E6/2', 'F#6/4', 'F#6/2 D#6/2'];
  const kit = mergeLanes(
    drums({ kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.' }, 1, 4),
    drums({ kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, 5, 15),
    drums({ kick: 'x.....x.x.......', snare: '....x.......x.oo', hat: 'x.x.x.x.x.x.X...' }, 20, 1),
    drums({ kick: 'x.......x.......', snare: '........x.......', ride: 'x..x..x.x..x..x.' }, 21, 8),
    drums({ kick: 'x.....x.x.....x.', snare: '....x..o....x...', hat: 'x.x.x.x.x.x.x.x.', tamb: '....x.......x...' }, 29, 16),
    drums({ hat: '........x.......' }, 45, 6),
    drums({ kick: 'x...x...x...x...', snare: 'o.o.o.o.x.x.xxXX' }, 52, 1),
    drums({ kick: 'x.....x.x.....x.', snare: '....x.......x...', ride: 'x.x.x.x.x.x.x.x.' }, 53, 8),
    { crash: hits([5, 29, 53].map((n) => [bar(n), 0.7])) },
  );
  return {
    id: 'bgm_flight', notes: 'Broom flight: the journey theme lifted to E major over driving piano, strings and kit, a breakdown and a soaring string line; 138 bpm.', bpm, intro, loop: 60 * 4, settle: 8, reverb: 'hall', wet: 0.45,
    tracks: {
      piano: { inst: 'piano', events: [...comp(drive, EIGHTS, 59, 78, 4, { vel: 0.34 }), ...arp(chD, '0 1 2 3 4 3 2 1', 0.25, 64, 88, 5, { vel: 0.26 })], db: -9, pan: 0.15, send: 0.3, human: 0.004 },
      spicc: { inst: 'spicc', events: arp([...chA1, ...chA2], '0 0 1 0 2 0 1 0', 0.5, 52, 67, 3, { vel: 0.5 }), db: -12, pan: -0.3, send: 0.3, human: 0.003, o: { reg: 'viola', voices: 3 } },
      bass: { inst: 'ebass', events: bassLine(drive, [[0, 0.5, 'r'], [0.5, 0.5, 'r'], [1, 0.5, 'r'], [1.5, 0.5, 'r'], [2, 0.5, 'r'], [2.5, 0.5, 'r'], [3, 0.5, '5'], [3.5, 0.5, 'r']], { lo: 28, hi: 47, vel: 0.55 }), db: -7, hp: 38, send: 0.06, human: 0.003 },
      kit: { inst: 'kit', events: kit, db: -9, hp: 40, send: 0.15, human: 0.003, o: { map: { kick: { kind: 'kick', gain: 0.65, tune: 1.15 }, snare: { kind: 'snare', gain: 0.55 }, hat: { kind: 'hat', gain: 0.2, pan: 0.3 }, ride: { kind: 'ride', gain: 0.18, pan: 0.3 }, tamb: { kind: 'tamb', gain: 0.18, pan: -0.4 }, crash: { kind: 'crash', gain: 0.28, pan: -0.3 } } } },
      violins: { inst: 'violin', events: [...shift(themeA(bar(5), { vel: 0.74 }), 0, up), ...shift(themeA(bar(29), { vel: 0.8 }), 0, up), ...bars(soar, bar(53), 4, { vel: 0.78 })], db: -5, pan: -0.15, send: 0.38, o: { voices: 6 } },
      flute: { inst: 'flute', events: [...within(shift(octave(themeA(bar(5), { vel: 0.55 }), 1), 0, up), bar(13), bar(21)), ...within(shift(octave(themeA(bar(29), { vel: 0.58 }), 1), 0, up), bar(29), bar(45)), ...shift(bars(A_MEL.slice(0, 4), bar(45), 4, { vel: 0.5 }), 0, up)], db: -8, pan: 0.15, send: 0.4 },
      horns: { inst: 'horn', events: [...shift(octave(themeB(bar(21), { vel: 0.66 }), -1), 0, up), ...pads(chA2, 52, 66, 2, { vel: 0.4 }), ...pads(chS, 52, 66, 2, { vel: 0.45 })], db: -9, pan: 0.05, send: 0.42 },
      strings: { inst: 'viola', events: pads([...chA1, ...chB, ...chA2, ...chS], 55, 71, 3, { vel: 0.36 }), db: -13, pan: 0.2, send: 0.4 },
      cellos: { inst: 'cello', events: bassLine([...chB, ...chA2, ...chS], [[0, 2, 'r'], [2, 2, '5']], { lo: 40, hi: 55, vel: 0.5 }), db: -11, pan: 0.25, send: 0.32 },
      glock: { inst: 'glock', events: [...hits([[bar(5), 0.4], [bar(29), 0.45], [bar(53), 0.45]]).map((e) => ({ ...e, m: [88] })), ...within(shift(octave(themeA(bar(29), { vel: 0.3 }), 1), 0, up), bar(37), bar(45))], db: -15, pan: 0.4, send: 0.45 },
      air: { inst: 'air', events: pads(chD, 59, 76, 3, { vel: 0.5 }), db: -12, send: 0.6, o: { cut: 1800 } },
    },
  };
}
