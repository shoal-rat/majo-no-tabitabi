// Dusk (the long evening over the moor and the woods). E minor, a slow 3/4 at 92 bpm: fingerpicked nylon guitar, low
// whistle, accordion, cello, harp. The journey theme's head turned to minor and to evening (G F# G | C B), a relative-
// major middle where the head comes back warm on accordion, then the evening tune on violins with the whistle above.
import { mel, prog, arp, pads, bassLine, shift, octave, vel, within } from '../score.mjs';
import { bars } from './themes.mjs';

export default function () {
  const bpm = 92, B = 3, intro = 0;
  const bar = (n) => intro + (n - 1) * B;
  const EVE = [
    'G5/1.5 F#5/.5 G5/1', 'C6/2 B5/1', 'A5/1.5 G5/.5 E5/1', 'F#5/3',
    'E5/1.5 D5/.5 E5/1', 'A5/2 F#5/1', 'G5/1 F#5/1 D5/1', 'E5/1.5 D#5/1.5',
    'G5/1.5 F#5/.5 G5/1', 'D6/2 C6/1', 'B5/1.5 A5/.5 G5/1', 'E5/1 A5/1 C6/1',
    'C6/1.5 B5/.5 A5/1', 'B5/1 A5/1 F#5/1', 'G5/2 E5/1', 'E5/3',
  ];
  const EVE_CH = 'Em | Em/D | Cmaj7 | B7 | Am7 | D | Gmaj7 | B7sus4 B7 | Em | Em/D | Cmaj7 | Am7 | F#m7b5 | B7 | Em | B7sus4';
  const WARM = [
    'B4/1.5 A4/.5 B4/1', 'E5/2 D5/1', 'D5/1.5 C5/.5 D5/1', 'G5/2 E5/1', 'C5/1.5 B4/.5 C5/1', 'F#5/2 A5/1', 'G5/1 F#5/1 D5/1', 'E5/1.5 D#5/1.5',
    'E5/1.5 D5/.5 E5/1', 'A5/2 F#5/1', 'F#5/1.5 E5/.5 D5/1', 'B5/2 G5/1', 'A5/1.5 G5/.5 E5/1', 'F#5/1 A5/1 C6/1', 'B5/1.5 A5/.5 G5/1', 'E5/1.5 D#5/1.5',
  ];
  const WARM_CH = 'Cmaj7 | D | Bm7 | Em7 | Am7 | D7 | Gmaj7 | B7sus4 B7 | Cmaj7 | D | Bm7 | Em7 | Am7 | D7 | Gmaj7 | B7sus4 B7';
  const chIn = prog('Em | Cmaj7 | Am7 | B7sus4 B7', bar(1), B);
  const chA = prog(EVE_CH, bar(5), B), chB = prog(WARM_CH, bar(21), B), chA2 = prog(EVE_CH, bar(37), B), chOut = prog('Em | Cmaj7 | Am7 | B7sus4 B7', bar(53), B);
  const all = [...chIn, ...chA, ...chB, ...chA2, ...chOut];
  return {
    id: 'bgm_dusk', notes: 'Dusk: a 3/4 evening tune on low whistle over fingerpicked guitar, accordion and cello, the theme head turned minor; E minor, 92 bpm.', bpm, intro, loop: 56 * B, settle: 9, reverb: 'hall', wet: 0.6,
    tracks: {
      guitar: { inst: 'guitar', events: arp(all, 'b 0 1 2 1 0', 0.5, 52, 69, 3, { vel: 0.44 }), db: -6, pan: -0.22, send: 0.32, human: 0.01 },
      lowWhistle: { inst: 'whistle', events: [...bars(EVE, bar(5), B, { vel: 0.64 }), ...mel('B5/3 | D6/3 | E6/3 | C6/3 | C6/3 | B5/1.5 A5/1.5 | G5/3 | F#5/3', bar(45), { vel: 0.4 })], db: -5, pan: 0.12, send: 0.42, o: { vib: 10 } },
      accordion: { inst: 'accordion', events: [...pads(chA, 52, 67, 3, { vel: 0.26 }), ...bars(WARM, bar(21), B, { vel: 0.6 })], db: -4, pan: -0.08, send: 0.35, o: { musette: 7 } },
      violins: { inst: 'violin', events: [...pads(chB, 64, 76, 2, { vel: 0.3 }), ...octave(bars(EVE, bar(37), B, { vel: 0.6 }), -1)], db: -7, pan: -0.2, send: 0.45 },
      cello: { inst: 'cello', events: [...pads(chA, 40, 52, 1, { vel: 0.36 }), ...mel('C3/3 | D3/3 | B2/3 | E3/3 | A2/3 | D3/3 | G2/3 | B2/3 | E3/3 | F#3/3 | D3/3 | G3/3 | C3/3 | D3/3 | G2/3 | B2/3', bar(21), { vel: 0.44 }), ...pads(chA2, 40, 52, 1, { vel: 0.34 })], db: -9, pan: 0.25, send: 0.4 },
      bass: { inst: 'bass', events: bassLine([...chB, ...chA2], [[0, 2.5, 'r']], { lo: 33, vel: 0.5 }), db: -10, send: 0.2, human: 0.008 },
      harp: { inst: 'harp', events: [...arp(chB, '0 1 2 3', 0.75, 60, 79, 4, { vel: 0.32 }), ...arp(chOut, '0 1 2 3 4 5', 0.5, 59, 83, 6, { vel: 0.3 })], db: -7, pan: -0.38, send: 0.5 },
      air: { inst: 'air', events: pads(all, 55, 71, 3, { vel: 0.4 }), db: -17, send: 0.6, o: { cut: 1200 } },
    },
  };
}
