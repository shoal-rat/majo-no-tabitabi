// Beside a page trial: a sealed place where an old witch left one page of her grimoire. A Dorian, a slow 3/4 at 66 bpm.
// A held drone, harp, celesta, a soft choir; the magic motif in Dorian (its raised note now the F#), first on celesta,
// then on a low whistle over the choir, then on hushed violins. Quiet enough to hear the seal.
import { mel, prog, arp, pads, shift, octave, vel, within, hits } from '../score.mjs';
import { bars } from './themes.mjs';

export default function () {
  const bpm = 66, B = 3, intro = 0;
  const bar = (n) => intro + (n - 1) * B;
  const RUNE = [
    'E5/.5 F#5/.5 G5/.5 A5/.5 B5/1', 'F#5/1.5 E5/.5 D5/1', 'E5/1 C5/1 A4/1', 'B4/2.5 -/.5',
    'E5/.5 F#5/.5 G5/.5 A5/.5 C6/1', 'A5/1.5 G5/.5 E5/1', 'G5/1 E5/1 B4/1', 'A4/3',
    'A5/.5 B5/.5 C6/.5 D6/.5 E6/1', 'F#6/1.5 E6/.5 D6/1', 'E6/1 C6/1 G5/1', 'B5/2.5 -/.5',
    'A5/.5 G5/.5 F5/.5 E5/.5 C5/1', 'D5/1.5 E5/.5 G5/1', 'F#5/3', 'E5/3',
  ];
  const RCH = 'Am | D/A | Am | G/A | Am | Fmaj7 | Em7 | Am | Am | D/A | Cmaj7 | G | Fmaj7 | Em7 | D/A | Am';
  const chIn = prog('Am | D/A | Am | D/A', bar(1), B);
  const chA = prog(RCH, bar(5), B), chB = prog(RCH, bar(21), B), chC = prog(RCH, bar(37), B), chOut = prog('Am | D/A | Am | D/A', bar(53), B);
  const all = [...chIn, ...chA, ...chB, ...chC, ...chOut];
  const drone = (n0, n1) => mel(Array.from({ length: (n1 - n0) / 4 }, () => 'A2+E3/12').join(' '), bar(n0), { vel: 0.4 });
  return {
    id: 'bgm_pages', notes: 'Page trials: the magic motif in A Dorian over a held drone, harp, celesta and a soft choir; 3/4, 66 bpm.', bpm, intro, loop: 56 * B, settle: 12, reverb: 'cathedral', wet: 0.7, air: 3,
    tracks: {
      drone: { inst: 'cello', events: drone(1, 57), db: -12, send: 0.5, o: { voices: 3, attack: 1.2, release: 1.5, vib: 4 } },
      basses: { inst: 'contrabass', events: shift(drone(1, 57).map((e) => ({ ...e, m: [e.m[0]] })), 0, -12), db: -18, send: 0.4, o: { voices: 2, attack: 1.5, release: 1.5, vib: 2 } },
      harp: { inst: 'harp', events: arp(all, '0 2 1 3 2 1', 0.5, 57, 76, 4, { vel: 0.34 }), db: -7, pan: -0.3, send: 0.5, human: 0.01 },
      celesta: { inst: 'celesta', events: [...bars(RUNE, bar(5), B, { vel: 0.62 }), ...within(octave(bars(RUNE, bar(37), B, { vel: 0.3 }), 1), bar(45), bar(53))], db: -4, pan: 0.25, send: 0.6 },
      choir: { inst: 'choir', events: pads([...chB, ...chC], 55, 69, 3, { vel: 0.4 }), db: -12, send: 0.6, o: { vowel: 'u' } },
      lowWhistle: { inst: 'whistle', events: octave(bars(RUNE, bar(21), B, { vel: 0.6 }), -1), db: -5, pan: 0.1, send: 0.55, o: { vib: 8 } },
      violins: { inst: 'violin', events: bars(RUNE, bar(37), B, { vel: 0.5 }), db: -9, pan: -0.2, send: 0.55, o: { voices: 6, attack: 0.25 } },
      chime: { inst: 'chime', events: hits([1, 5, 13, 21, 29, 37, 45, 53].map((n) => [bar(n), 0.28])).map((e, i) => ({ ...e, m: [[81, 76, 88, 81, 83, 81, 88, 76][i]] })), db: -15, pan: 0.45, send: 0.7 },
    },
  };
}
