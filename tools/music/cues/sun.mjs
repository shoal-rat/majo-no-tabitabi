// Day field (meadows, moor and wilds under the sun). D major, 116 bpm, light pop-folk drive: strummed steel guitar,
// bass, soft kit, piano and strings. The journey theme on flute, its bridge on violins, the theme again on the whole
// band, a tin-whistle travelling tune of its own, and a quiet half-theme before the groove comes round again.
import { mel, prog, arp, pads, comp, strums, bassLine, grid, mergeLanes, shift, octave, vel, within, hits } from '../score.mjs';
import { themeA, themeB, bars, A_MEL } from './themes.mjs';

const STRUM = [[0, 'd', 1], [1, 'd', 0.75], [1.5, 'u', 0.65], [2.5, 'u', 0.65], [3, 'd', 0.8], [3.5, 'u', 0.65]];
const BASS = [[0, 1.5, 'r'], [1.5, 0.5, 'r'], [2, 1, '5'], [3, 0.5, '8'], [3.5, 0.5, 'a']];
const EIGHTS = [[0, 0.5, 1], [0.5, 0.5, 0.7], [1, 0.5, 0.85], [1.5, 0.5, 0.7], [2, 0.5, 0.95], [2.5, 0.5, 0.7], [3, 0.5, 0.85], [3.5, 0.5, 0.7]];

export default function () {
  const bpm = 116;
  const bar = (n) => (n - 1) * 4;
  const drums = (lanes, from, n) => mergeLanes(...Array.from({ length: n }, (_, i) => grid(lanes, bar(from + i), 0.25)));
  const chIn = prog('Gmaj7 | A | F#m7 | Bm7', bar(1));
  const chA1 = prog('Gmaj7 | A | F#m7 | Bm7 | Em7 | A7 | Bm7 | Gmaj7 A7sus4 | Gmaj7 | A | Bm7 | Bm7/A | Gmaj7 | A7sus4 A7 | D | Gm6 A7sus4', bar(5));
  const chB = prog('Bm7 | F#m7 | Gmaj7 | D/F# | Em7 | F#m7 | Gmaj7 | A7sus4 A7', bar(21));
  const chA2 = prog('Gmaj7 | A | F#m7 | Bm7 | Em7 | A7 | Bm7 | Gmaj7 A7sus4 | Gmaj7 | A | Bm7 | Bm7/A | Gmaj7 | A7sus4 A7 | D | D', bar(29));
  const chI = prog('Em7 | A7 | Dmaj7 | Bm7 | Gmaj7 | F#m7 | Em7 | A7sus4 A7', bar(45));
  const chA3 = prog('Gmaj7 | A | Bm7 | Bm7/A | Gmaj7 | A7sus4 A7 | D | Gm6 A7sus4', bar(53));
  const loud = [...chIn, ...chA1, ...chB, ...chA2, ...chI];

  const whistleTune = [
    'E5/.5 G5/.5 B5/.5 A5/.5 G5/.5 E5/.5 D5/1', 'E5/.5 A5/.5 C#6/.5 B5/.5 A5/1 G5/1', 'F#5/.5 A5/.5 D6/.5 C#6/.5 A5/.5 F#5/.5 E5/1', 'D5/.5 F#5/.5 B5/1 A5/.5 F#5/.5 D5/1',
    'B5/.5 D6/.5 B5/.5 A5/.5 G5/.5 F#5/.5 G5/.5 A5/.5', 'A5/1 F#5/1 C#5/1 E5/1', 'G5/.5 F#5/.5 E5/.5 D5/.5 E5/.5 G5/.5 B5/1', 'A5/2 G5/1 E5/1',
  ];

  const kitLanes = mergeLanes(
    drums({ kick: 'x.......x.x.....', hat: 'x.o.x.o.x.o.x.o.', shaker: 'oxoxoxoxoxoxoxox' }, 1, 4),
    drums({ kick: 'x.......x.x.....', rim: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.', shaker: 'oxoxoxoxoxoxoxox' }, 5, 15),
    drums({ kick: 'x.......x.x.....', rim: '....x.......x...', hat: 'x.o.x.o.x.o.o.o.', tamb: '............x.x.' }, 20, 1),
    drums({ kick: 'x.......x.......', rim: '............x...', hat: 'o.o.o.o.o.o.o.o.', tamb: '....x.......x...' }, 21, 8),
    drums({ kick: 'x.....x.x.....x.', snare: '....x..o....x...', hat: 'x.o.x.o.x.o.x.o.', tamb: '....x.......x...', shaker: 'oxoxoxoxoxoxoxox' }, 29, 15),
    drums({ kick: 'x.....x.x.....x.', snare: '....x..o....x.oo', hat: 'x.o.x.o.x.o.X...', tamb: '....x.......x...' }, 44, 1),
    drums({ kick: 'x.......x.......', brush: '....x.......x...', shaker: 'oxoxoxoxoxoxoxox' }, 45, 8),
    drums({ shaker: 'o.o.o.o.o.o.o.o.' }, 53, 4),
    drums({ kick: 'x.......x.......', shaker: 'oxoxoxoxoxoxoxox' }, 57, 3),
    drums({ kick: 'x.......x...x.x.', snare: '........o.o.xoXx', shaker: 'oxoxoxoxoxoxoxox' }, 60, 1),
    { crash: hits([[bar(29), 0.7], [bar(45), 0.45]]) },
  );

  return {
    id: 'bgm_sun', notes: 'Day field: the journey theme as a travelling song (strummed guitar, soft kit, flute, violins) with a tin-whistle interlude; D major, 116 bpm.', bpm, intro: 0, loop: 240, settle: 8, reverb: 'chamber', wet: 0.5,
    tracks: {
      guitar: { inst: 'steel', events: [...strums(loud, STRUM, { vel: 0.5, lo: 47, hi: 71 }), ...arp(chA3, 'b 0 1 2 3 2 1 0', 0.5, 50, 69, 4, { vel: 0.42 })], db: -9, pan: -0.35, send: 0.22, human: 0.006 },
      bass: { inst: 'ebass', events: [...bassLine(loud, BASS, { lo: 33, hi: 50, vel: 0.62 }), ...bassLine(chA3, [[0, 3.5, 'r']], { lo: 33, vel: 0.5 })], db: -6, hp: 40, send: 0.08, human: 0.004 },
      kit: {
        inst: 'kit', events: kitLanes, db: -9, hp: 40, send: 0.18, human: 0.004,
        o: { map: { kick: { kind: 'kick', gain: 0.6, tune: 1.2 }, snare: { kind: 'snare', gain: 0.55 }, rim: { kind: 'rim', gain: 0.3, pan: 0.1 }, brush: { kind: 'brush', gain: 0.5 }, hat: { kind: 'hat', gain: 0.22, pan: 0.3 }, shaker: { kind: 'shaker', gain: 0.2, pan: -0.4 }, tamb: { kind: 'tamb', gain: 0.18, pan: 0.45 }, crash: { kind: 'crash', gain: 0.28, pan: -0.3 } } },
      },
      piano: {
        inst: 'piano', db: -7, pan: 0.12, send: 0.28, human: 0.006,
        events: [...comp(chA1, [[0, 2, 0.9], [2, 2, 0.75]], 55, 72, 4, { vel: 0.34 }), ...comp(chA2, EIGHTS, 57, 76, 4, { vel: 0.3 }), ...arp(chA3, 'b 0 1 2 3 2 1 0', 0.5, 52, 72, 4, { vel: 0.3, pedal: true })],
      },
      flute: { inst: 'flute', events: [...themeA(bar(5), { vel: 0.74 }), ...within(octave(themeA(bar(29), { vel: 0.6 }), 1), bar(37), bar(45)), ...within(bars(A_MEL.slice(8), bar(53), 4, { vel: 0.6 }), bar(53), bar(60))], db: -5.5, pan: 0.1, send: 0.35 },
      glock: { inst: 'glock', events: [...within(octave(themeA(bar(5), { vel: 0.4 }), 1), bar(13), bar(20)), ...hits([[bar(29), 0.4], [bar(37), 0.4]]).map((e) => ({ ...e, m: [86] }))], db: -14, pan: 0.35, send: 0.4 },
      whistle: { inst: 'whistle', events: bars(whistleTune, bar(45), 4, { vel: 0.72 }), db: -6, pan: -0.1, send: 0.32 },
      mandolin: { inst: 'mandolin', events: arp(chI, '0 1 2 3 2 1 2 1', 0.5, 62, 79, 4, { vel: 0.4 }), db: -10, pan: 0.4, send: 0.25, human: 0.005 },
      violins: { inst: 'violin', events: [...themeB(bar(21), { vel: 0.72 }), ...vel(themeA(bar(29)), 0.78)], db: -6, pan: -0.15, send: 0.38, o: { voices: 6 } },
      strings: { inst: 'viola', events: pads([...within(chA1, bar(13), bar(21)), ...chB, ...chA2, ...chA3], 55, 69, 3, { vel: 0.36 }), db: -13, pan: 0.15, send: 0.4 },
      cellos: { inst: 'cello', events: pads([...chB, ...chA2], 40, 52, 1, { vel: 0.42 }), db: -12, pan: 0.25, send: 0.35 },
      horns: { inst: 'horn', events: pads(within(chA2, bar(29), bar(45)), 53, 67, 2, { vel: 0.38 }), db: -15, pan: 0.05, send: 0.45 },
    },
  };
}
