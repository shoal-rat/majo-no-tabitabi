// Ordinary fights. B minor, 148 bpm. Two layers from one score, played in sync by the game:
//   base  spiccato cellos ostinato, basses, toms and timpani, violins carrying the journey theme's head in minor
//   hot   kit, horns, a second violin section in driving eighths, piano — faded in as the fight heats up
// The theme's head keeps its notes (F#5 E5 F#5 B5) but now stands on B minor; a rising tension section; the theme in
// its own major key for eight bars, as if the heroine finds her footing; the minor head once more; a breakdown.
import { mel, prog, arp, pads, comp, bassLine, grid, mergeLanes, shift, octave, vel, within, hits } from '../score.mjs';
import { bars, A_MEL } from './themes.mjs';

export default function () {
  const bpm = 148;
  const bar = (n) => (n - 1) * 4;
  const drums = (lanes, from, n, o) => mergeLanes(...Array.from({ length: n }, (_, i) => grid(lanes, bar(from + i), 0.25, o)));
  const ch1 = prog('Bm | Bm | G | F#7', bar(1));
  const ch2 = prog('Bm | G | Em | F#7 | Bm | G | A | F#7 | Bm | G | Em | C#m7b5 F#7 | G | A | Bm | F#7', bar(5));
  const ch3 = prog('G | F#/A# | Bm | D/A | G | Em | F#7sus4 | F#7 | G | A | F#/A# | Bm | Em | C | F#7sus4 | F#7', bar(21));
  const ch4 = prog('Gmaj7 | A | F#m7 | Bm7 | Em7 | A7 | Bm7 | Gmaj7 A7sus4', bar(37));
  const ch5 = prog('Bm | G | Em | F#7 | G | A | Bm | F#7', bar(45));
  const ch6 = prog('Bm | Bm | G | G | Em | Em | F#7sus4 | F#7', bar(53));
  const all = [...ch1, ...ch2, ...ch3, ...ch4, ...ch5, ...ch6];

  const headMinor = [
    'F#5/1.5 E5/.5 F#5/.5 B5/1.5', 'A5/1.5 G5/.5 F#5/.5 D5/1.5', 'E5/1.5 D5/.5 E5/.5 G5/1.5', 'F#5/2 E5/1 C#5/1',
    'F#5/1.5 E5/.5 F#5/.5 D6/1.5', 'B5/1.5 A5/.5 G5/.5 D5/1.5', 'C#6/1.5 B5/.5 A5/.5 E5/1.5', 'A#5/1.5 C#6/.5 F#6/2',
  ];
  const headMinor2 = [
    'F#5/1.5 E5/.5 F#5/.5 B5/1.5', 'A5/1.5 G5/.5 F#5/.5 D5/1.5', 'E5/1.5 D5/.5 E5/.5 G5/1.5', 'F#5/2 E5/1 C#5/1',
    'B5/1.5 A5/.5 G5/.5 D5/1.5', 'C#6/1.5 B5/.5 A5/.5 E5/1.5', 'D6/1.5 C#6/.5 B5/.5 F#5/1.5', 'F#5/1 G5/1 A5/1 A#5/1',
  ];
  const rise = ['B4/4', 'C#5/4', 'D5/4', 'E5/4', 'G5/2 F#5/2', 'E5/2 G5/2', 'F#5/4', 'F#5/2 A#5/2', 'D6/4', 'E6/4', 'C#6/4', 'D6/4', 'G5/2 B5/2', 'C6/2 E6/2', 'F#6/4', 'F#6/2 A#5/2'];

  const baseDrums = mergeLanes(
    drums({ tomL: 'x..x..x.x.......', tomH: '..........x.x.x.' }, 1, 52, { vel: 0.85 }),
    drums({ tomL: 'x..x..x.x.......', tomH: '................' }, 53, 4, { vel: 0.7 }),
    drums({ tomL: 'x..x..x.x.......', tomH: '..........x.x.xx' }, 57, 4, { vel: 0.95 }),
    { timp: hits([1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 59, 60].map((n) => [bar(n), 0.6])), bd: hits([5, 21, 37, 45].map((n) => [bar(n), 0.6])) },
  );
  const hotDrums = mergeLanes(
    drums({ kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, 1, 36),
    drums({ kick: 'x.....x.x.x.....', snare: '....x.......x...', ride: 'x.x.x.x.x.x.x.x.' }, 37, 8),
    drums({ kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, 45, 8),
    drums({ kick: 'x.......x.......', hat: 'x...x...x...x...' }, 53, 6),
    drums({ kick: 'x...x...x...x...', snare: 'o.o.o.o.x.x.x.x.' }, 59, 1),
    drums({ kick: 'x...x...x.x.x.x.', snare: 'xxxxxxxxXxXxXxXx' }, 60, 1),
    { crash: hits([1, 5, 21, 37, 45].map((n) => [bar(n), 0.7])) },
  );

  return {
    id: 'bgm_battle', notes: 'Ordinary fights: spiccato ostinato, toms and the journey theme head in B minor; hot layer bgm_battle_hot adds kit, horns, second violins and piano; 148 bpm.', bpm, intro: 0, loop: 240, settle: 8, reverb: 'hall', wet: 0.38,
    tracks: {
      // ---- base layer
      ostinato: { inst: 'spicc', events: arp(all, '0 0 2 0 1 0 2 1', 0.5, 47, 62, 3, { vel: 0.62 }), db: -5, pan: 0.2, send: 0.25, human: 0.004, o: { reg: 'cello', voices: 3 } },
      basses: { inst: 'contrabass', events: shift(bassLine(all, [[0, 1.8, 'r'], [2, 1.8, 'r']], { lo: 40, vel: 0.62 }), 0, -12), db: -12, send: 0.2, o: { attack: 0.03, release: 0.12 } },
      violins: { inst: 'violin', events: [...bars(headMinor, bar(5), 4, { vel: 0.74 }), ...bars(headMinor2, bar(13), 4, { vel: 0.78 }), ...bars(rise, bar(21), 4, { vel: 0.7 }), ...bars(A_MEL.slice(0, 8), bar(37), 4, { vel: 0.8 }), ...bars(headMinor2, bar(45), 4, { vel: 0.82 })], db: -5, pan: -0.15, send: 0.32, o: { voices: 6, attack: 0.06 } },
      violas: { inst: 'viola', events: pads([...ch2, ...ch3, ...ch4, ...ch5], 52, 66, 2, { vel: 0.4 }), db: -13, pan: 0.15, send: 0.35 },
      drums: {
        inst: 'kit', events: baseDrums, db: -8, hp: 45, send: 0.25, human: 0.003,
        o: { map: { tomL: { kind: 'tom', f: 104, gain: 0.6, pan: -0.15 }, tomH: { kind: 'tom', f: 150, gain: 0.55, pan: 0.2 }, timp: { kind: 'timp', f: 61.7, gain: 0.9 }, bd: { kind: 'bassdrum', gain: 0.45 } } },
      },
      // ---- hot layer
      kit: {
        inst: 'kit', layer: 'hot', events: hotDrums, db: -9, hp: 45, send: 0.15, human: 0.003,
        o: { map: { kick: { kind: 'kick', gain: 0.7, tune: 1.15 }, snare: { kind: 'snare', gain: 0.6 }, hat: { kind: 'hat', gain: 0.22, pan: 0.3 }, ride: { kind: 'ride', gain: 0.2, pan: 0.3 }, crash: { kind: 'crash', gain: 0.3, pan: -0.3 } } },
      },
      horns: {
        inst: 'horn', layer: 'hot', db: -8, pan: 0.1, send: 0.4,
        events: [
          ...octave(bars(headMinor2, bar(13), 4, { vel: 0.66 }), -1),
          ...comp(ch3, [[0, 0.4, 1], [1.5, 0.4, 0.85]], 50, 64, 3, { vel: 0.6 }),
          ...octave(bars(A_MEL.slice(0, 8), bar(37), 4, { vel: 0.7 }), -1),
          ...octave(bars(headMinor2, bar(45), 4, { vel: 0.72 }), -1),
        ],
      },
      violins2: { inst: 'spicc', layer: 'hot', events: [...arp(ch3, '0 1 2 1 0 1 2 1', 0.5, 66, 83, 3, { vel: 0.5 }), ...arp(ch5, '0 1 2 1 0 1 2 1', 0.5, 66, 83, 3, { vel: 0.52 })], db: -10, pan: -0.35, send: 0.3, human: 0.003, o: { reg: 'violin', voices: 4 } },
      piano: {
        inst: 'piano', layer: 'hot', db: -10, pan: 0.15, send: 0.25, human: 0.004,
        events: [
          ...comp(ch2, [[0, 0.4, 1], [0.75, 0.25, 0.7], [1.5, 0.4, 0.85], [2.5, 0.4, 0.8], [3, 0.4, 0.9]], 45, 62, 2, { vel: 0.55 }),
          ...comp(ch4, [[0, 0.5, 1], [0.5, 0.5, 0.7], [1, 0.5, 0.85], [1.5, 0.5, 0.7], [2, 0.5, 0.95], [2.5, 0.5, 0.7], [3, 0.5, 0.85], [3.5, 0.5, 0.7]], 57, 76, 4, { vel: 0.42 }),
          ...comp(ch5, [[0, 0.4, 1], [0.75, 0.25, 0.7], [1.5, 0.4, 0.85], [2.5, 0.4, 0.8], [3, 0.4, 0.9]], 45, 62, 2, { vel: 0.6 }),
        ],
      },
      swell: { inst: 'kit', layer: 'hot', events: { swell: hits([[bar(36) + 1, 0.6], [bar(44) + 1, 0.5], [bar(60), 0.6]]) }, db: -14, send: 0.4, o: { map: { swell: { kind: 'swell', dur: (3 * 60) / 148 } } } },
    },
  };
}
