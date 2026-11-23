// The recollection bout: Fran's spar remembered once the journey is done, the hardest fight in the game. E minor to
// G major, 160 bpm. Both themes meet: Fran's duel figure, the journey theme's head in E minor, then the journey theme
// whole in G major over driving strings while the magic motif's runs flash around it, a stardust tension, the duel
// figure's climax. The hot layer (kit, horns, high strings) arrives with her later movements.
import { mel, prog, arp, pads, comp, bassLine, grid, mergeLanes, shift, octave, vel, within, hits } from '../score.mjs';
import { bars, A_MEL } from './themes.mjs';

export default function () {
  const bpm = 160, intro = 0;
  const bar = (n) => intro + (n - 1) * 4;
  const drums = (lanes, from, n, o) => mergeLanes(...Array.from({ length: n }, (_, i) => grid(lanes, bar(from + i), 0.25, o)));
  const FIG = [
    'B4/.25 C#5/.25 D5/.25 E5/.25 F#5/.5 A5/.5 C#6/1 B5/.5 A5/.5', 'G5/1.5 E5/.5 C#5/1 E5/1',
    'B4/.25 C#5/.25 D5/.25 E5/.25 F#5/.5 A5/.5 E6/1 D6/.5 B5/.5', 'C#6/2 A5/1 E5/1',
    'G5/.5 A5/.5 B5/1 G5/1 E5/1', 'F#5/.5 G5/.5 A5/1 F#5/1 D5/1', 'B4/.5 D5/.5 G5/1 F#5/1 G5/1', 'E5/2 D#5/2',
  ];
  const FIG2 = ['E6/1.5 D6/.5 C6/1 G5/1', 'F#6/1.5 E6/.5 D6/1 A5/1', 'B5/.25 C#6/.25 D6/.25 E6/.25 F#6/1 E6/2', 'D#6/2 B5/1 F#5/1'];
  const HEADE = ['B5/1.5 A5/.5 B5/.5 E6/1.5', 'D6/1.5 C6/.5 B5/.5 G5/1.5', 'A5/1.5 G5/.5 A5/.5 C6/1.5', 'B5/2 A5/1 F#5/1', 'B5/1.5 A5/.5 B5/.5 G6/1.5', 'E6/1.5 D6/.5 C6/.5 G5/1.5', 'F#6/1.5 E6/.5 D6/.5 A5/1.5', 'D#6/1.5 F#6/.5 B6/2'];
  const G_CH = 'Cmaj7 | D | Bm7 | Em7 | Am7 | D7 | Em7 | Cmaj7 D7sus4 | Cmaj7 | D | Em7 | Em7/D | Cmaj7 | D7sus4 D7 | G | Cm6 D7sus4';
  const chIn = prog('Em | A/E | Em | A/E', bar(1));
  const chA = prog('Em | A | Em | A | Cmaj7 | D | G | B7sus4 B7', bar(5));
  const chH = prog('Em | C | Am | B7 | Em | C | D | B7', bar(13));
  const chG = prog(G_CH, bar(21));
  const chS = prog('Cmaj7 | D | Bm7 | Em | Cmaj7 | D | B7sus4 | B7', bar(37));
  const chA2 = prog('Em | A | Em | A | C | D | Em | B7', bar(45));
  const chOut = prog('Em | A/E | Em | A/E | Cmaj7 | D | B7sus4 | B7', bar(53));
  const all = [...chIn, ...chA, ...chH, ...chG, ...chS, ...chA2, ...chOut];
  const run = (n, beat, s) => mel(s, bar(n) + beat, { vel: 0.5 });
  const base = mergeLanes(
    drums({ tomL: 'x..x..x.x.......', tomH: '..........x.x.x.' }, 1, 60, { vel: 0.85 }),
    { timp: hits([1, 5, 13, 21, 29, 37, 45, 53, 57].map((n) => [bar(n), 0.65])) },
  );
  const hot = mergeLanes(
    drums({ kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, 1, 20),
    drums({ kick: 'x.....x.x.x.....', snare: '....x.......x...', ride: 'x.x.x.x.x.x.x.x.' }, 21, 16),
    drums({ kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, 37, 23),
    drums({ kick: 'x...x...x.x.x.x.', snare: 'o.o.x.x.xxxxXXXX' }, 60, 1),
    { crash: hits([5, 13, 21, 37, 45].map((n) => [bar(n), 0.7])) },
  );
  return {
    id: 'bgm_final', notes: "Fran's recollection bout: her duel figure, the journey theme head in E minor, the whole theme in G major with the magic motif's runs; hot layer for her later movements; 160 bpm.", bpm, intro, loop: 60 * 4, settle: 8, reverb: 'hall', wet: 0.42,
    tracks: {
      ostinato: { inst: 'spicc', events: arp(all, '0 0 2 0 1 0 2 1', 0.5, 47, 62, 3, { vel: 0.6 }), db: -7, pan: 0.2, send: 0.25, human: 0.003, o: { reg: 'cello', voices: 3 } },
      basses: { inst: 'contrabass', events: shift(bassLine(all, [[0, 1.8, 'r'], [2, 1.8, 'r']], { lo: 40, hi: 52, vel: 0.6 }), 0, -12), db: -13, send: 0.2, o: { attack: 0.03, release: 0.12 } },
      violins: {
        inst: 'violin', db: -5, pan: -0.15, send: 0.35, o: { voices: 6, attack: 0.04 },
        events: [...bars(FIG, bar(5), 4, { vel: 0.76 }), ...bars(HEADE, bar(13), 4, { vel: 0.78 }), ...shift(bars(A_MEL, bar(21), 4, { vel: 0.8 }), 0, 5),
          ...mel('G5/4 | A5/4 | F#5/4 | G5/2 B5/2 | E6/4 | F#6/4 | E6/4 | D#6/4', bar(37), { vel: 0.68 }), ...bars(FIG, bar(45), 4, { vel: 0.82 }).filter((e) => e.b < bar(49)), ...bars(FIG2, bar(49), 4, { vel: 0.84 })],
      },
      flute: { inst: 'flute', events: [...run(28, 2, 'G5/.25 A5/.25 B5/.25 C6/.25 D6/1'), ...run(36, 0, 'D6/.25 Eb6/.25 F6/.25 G6/.25 A6/1 -/1 C7/.5 D7/1'), ...run(24, 2, 'A5/.25 B5/.25 C#6/.25 D6/.25 E6/1'), ...run(32, 2, 'D6/.25 E6/.25 F#6/.25 G6/.25 A6/1')], db: -7, pan: 0.18, send: 0.4 },
      celesta: { inst: 'celesta', events: [...[8, 12, 16, 20, 28, 36, 48, 52].flatMap((n) => run(n, 3, 'E6/.25 F#6/.25 G6/.25 A6/.25')), ...arp(chS, '0 1 2 3 4 3 2 1', 0.25, 76, 96, 5, { vel: 0.3 })], db: -9, pan: 0.35, send: 0.5 },
      horns: { inst: 'horn', events: [...shift(bars(A_MEL.slice(0, 8), bar(21), 4, { vel: 0.66 }), 0, -7), ...pads(within(chG, bar(29), bar(37)), 52, 64, 2, { vel: 0.5 })], db: -7, pan: 0.05, send: 0.4 },
      choir: { inst: 'choir', events: pads([...chS, ...chOut], 52, 67, 3, { vel: 0.45 }), db: -13, send: 0.55, o: { vowel: 'a' } },
      drums: { inst: 'kit', events: base, db: -8, hp: 45, send: 0.25, human: 0.003, o: { map: { tomL: { kind: 'tom', f: 104, gain: 0.7 }, tomH: { kind: 'tom', f: 150, gain: 0.55, pan: 0.2 }, timp: { kind: 'timp', f: 82.4, gain: 0.9 } } } },
      // ---- hot layer
      kit: { inst: 'kit', layer: 'hot', events: hot, db: -9, hp: 45, send: 0.15, human: 0.003, o: { map: { kick: { kind: 'kick', gain: 0.7, tune: 1.15 }, snare: { kind: 'snare', gain: 0.6 }, hat: { kind: 'hat', gain: 0.22, pan: 0.3 }, ride: { kind: 'ride', gain: 0.2, pan: 0.3 }, crash: { kind: 'crash', gain: 0.3, pan: -0.3 } } } },
      hornsHot: { inst: 'horn', layer: 'hot', events: [...octave(bars(FIG.slice(0, 4), bar(5), 4, { vel: 0.6 }), -1), ...octave(bars(HEADE, bar(13), 4, { vel: 0.66 }), -1), ...octave(bars(FIG2, bar(49), 4, { vel: 0.7 }), -1)], db: -9, pan: 0.1, send: 0.38 },
      highStr: { inst: 'spicc', layer: 'hot', events: arp([...chG, ...chA2], '0 1 2 1 0 1 2 1', 0.5, 66, 83, 3, { vel: 0.46 }), db: -12, pan: -0.38, send: 0.3, human: 0.002, o: { reg: 'violin', voices: 4 } },
      piano: { inst: 'piano', layer: 'hot', events: comp([...chA, ...chH, ...chA2], [[0, 0.4, 1], [0.75, 0.25, 0.7], [1.5, 0.4, 0.85], [2.5, 0.4, 0.8], [3, 0.4, 0.9]], 45, 62, 2, { vel: 0.55 }), db: -12, pan: 0.15, send: 0.25, human: 0.004 },
    },
  };
}
