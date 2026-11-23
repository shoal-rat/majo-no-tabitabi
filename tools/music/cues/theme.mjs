// Preview only (not shipped): the two themes stated plainly. Theme A with its bridge, then the magic motif.
import { arp, pads, bassLine, shift, octave, vel, prog } from '../score.mjs';
import { themeA, themeB, motifM, chordsA, chordsB, chordsM, A_MEL, bars } from './themes.mjs';

export default function () {
  const bpm = 84;
  const A1 = 0, B1 = 64, A2 = 96, M1 = 128; // beats
  const chA = chordsA(A1), chB = chordsB(B1), chA2 = prog('Gmaj7 | A | Bm7 | Bm7/A | Gmaj7 | A7sus4 A7 | D | D', A2), chM = chordsM(M1);
  const all4 = [...chA, ...chB, ...chA2];
  return {
    id: 'theme_demo', bpm, intro: 0, loop: M1 + 48, settle: 2, reverb: 'hall', wet: 0.5,
    tracks: {
      pianoRH: { inst: 'piano', events: vel(themeA(A1), 0.95), db: 2, pan: 0.05, send: 0.3, human: 0.006 },
      pianoLH: { inst: 'piano', events: arp(all4, 'b 0 1 2 3 2 1 0', 0.5, 50, 67, 4, { vel: 0.38, pedal: true }), db: -5, pan: -0.1, send: 0.3, human: 0.006 },
      strings: { inst: 'violin', events: pads([...chA.filter((c) => c.b >= 32), ...chB, ...chA2], 55, 74, 3, { vel: 0.38 }), db: -14, send: 0.45 },
      cellos: { inst: 'cello', events: pads([...chB, ...chA2], 38, 55, 1, { vel: 0.45 }), db: -7, send: 0.4 },
      flute: { inst: 'flute', events: [...themeB(B1), ...octave(bars(A_MEL.slice(8), A2), 0)], db: -4, pan: 0.15, send: 0.4 },
      violins: { inst: 'violin', events: vel(octave(bars(A_MEL.slice(8), A2), -1), 0.8), db: -6, pan: -0.15, send: 0.45 },
      celesta: { inst: 'celesta', events: motifM(M1, { vel: 0.8 }), db: -3, pan: 0.1, send: 0.45 },
      harp: { inst: 'harp', events: arp(chM, '0 1 2 3 2 1', 0.5, 55, 74, 4, { vel: 0.5, restart: true }), db: -6, pan: -0.2, send: 0.4 },
      pizz: { inst: 'pizz', events: bassLine(chM, [[0, 1, 'r'], [1, 0.5, '5'], [2, 0.5, '8']], { lo: 40, vel: 0.6 }), db: -5, send: 0.3 },
      fluteM: { inst: 'flute', events: shift(motifM(M1 + 24 * 0), 0, 0).filter((e) => e.b >= M1 + 24), db: -6, pan: 0.2, send: 0.4 },
    },
  };
}
