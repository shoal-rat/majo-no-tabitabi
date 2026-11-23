// Night. D major, 66 bpm: the journey theme told quietly, as if remembered under the stars. Piano alone with celesta
// answering, the bridge on cello beneath high strings, the theme's second half on flute, a codetta with a far bell.
import { mel, prog, arp, pads, comp, bassLine, shift, octave, vel, within, hits } from '../score.mjs';
import { themeA, themeB, bars, A_MEL, A_CHORDS, B_CHORDS } from './themes.mjs';

export default function () {
  const bpm = 66, intro = 0;
  const bar = (n) => intro + (n - 1) * 4;
  const chA = prog(A_CHORDS, bar(1)), chB = prog(B_CHORDS, bar(17)), chA2 = prog('Gmaj7 | A | Bm7 | Bm7/A | Gmaj7 | A7sus4 A7 | D | D', bar(25)), chCo = prog('Gmaj7 | F#m7 | Em7 | A7sus4', bar(33));
  const all = [...chA, ...chB, ...chA2, ...chCo];
  const answer = (n, s) => mel(s, bar(n) + 2, { vel: 0.38 });
  return {
    id: 'bgm_night', notes: 'Night: the journey theme told quietly on piano and celesta, the bridge on solo cello, a codetta with a far bell; D major, 66 bpm.', bpm, intro, loop: 36 * 4, settle: 12, reverb: 'cathedral', wet: 0.62,
    tracks: {
      pianoRH: { inst: 'piano', events: [...vel(themeA(bar(1)), 0.62), ...comp(chCo, [[0, 4, 1]], 62, 79, 4, { vel: 0.22 })], db: 0, pan: 0.05, send: 0.42, human: 0.012, o: { pedal: true, ring: 2 } },
      pianoLH: { inst: 'piano', events: [...comp(chA, [[0, 2, 1], [2, 2, 0.8]], 38, 57, 2, { vel: 0.26 }), ...arp([...chB, ...chA2], 'b 0 1 2 1 0 1 2', 0.5, 50, 69, 3, { vel: 0.22, pedal: true })], db: -6, pan: -0.08, send: 0.42, human: 0.012 },
      celesta: { inst: 'celesta', events: [...answer(4, 'A6/.5 F#6/.5 D6/1'), ...answer(8, 'B6/.5 A6/.5 E6/1'), ...answer(12, 'E6/.5 F#6/.5 A6/1'), ...within(vel(octave(bars(A_MEL.slice(8), bar(25)), 1), 0.28), bar(25), bar(32))], db: -9, pan: 0.32, send: 0.55 },
      cello: { inst: 'cello', events: octave(themeB(bar(17), { vel: 0.55 }), -1), db: -5, pan: 0.18, send: 0.45, o: { voices: 1, vib: 18 } },
      violins: { inst: 'violin', events: pads([...chB, ...chA2], 69, 83, 2, { vel: 0.24 }), db: -15, pan: -0.25, send: 0.55 },
      flute: { inst: 'flute', events: bars(A_MEL.slice(8), bar(25), 4, { vel: 0.5 }), db: -6, pan: 0.12, send: 0.5 },
      harp: { inst: 'harp', events: [...arp(within(chA, bar(9), bar(17)), '0 1 2 3', 1, 62, 81, 4, { vel: 0.3 }), ...arp(chCo, '0 1 2 3 4 5 4 3', 0.5, 57, 86, 6, { vel: 0.28 })], db: -8, pan: -0.35, send: 0.5 },
      air: { inst: 'air', events: pads(all, 57, 72, 3, { vel: 0.45 }), db: -16, send: 0.65, o: { cut: 1100 } },
      bell: { inst: 'chime', events: hits([[bar(33), 0.3], [bar(35), 0.25]]).map((e, i) => ({ ...e, m: [i ? 81 : 86] })), db: -16, pan: 0.4, send: 0.7 },
    },
  };
}
