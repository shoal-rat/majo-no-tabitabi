// Title screen. D major, 86 bpm. The journey theme is told three times, growing: solo piano, then the bridge on flute
// with strings, then the whole theme on violins and flute over the full ensemble. The turnaround glints with the magic
// motif on celesta and is also the intro, so every loop begins the way the music first began.
import { mel, prog, arp, pads, comp, bassLine, shift, octave, vel, within, hits } from '../score.mjs';
import { themeA, themeB, bars, A_MEL } from './themes.mjs';

export default function () {
  const bpm = 86, intro = 16;
  const bar = (n) => intro + (n - 1) * 4; // body bar n (1-based) → beat
  const vamp = (at) => prog('Gmaj7 | A/G | F#m7 Bm7 | Gm6 A7sus4', at);
  const chA1 = prog('Gmaj7 | A | F#m7 | Bm7 | Em7 | A7 | Bm7 | Gmaj7 A7sus4 | Gmaj7 | A | Bm7 | Bm7/A | Gmaj7 | A7sus4 A7 | D | Gm6 A7sus4', bar(1));
  const chB = prog('Bm7 | F#m7 | Gmaj7 | D/F# | Em7 | F#m7 | Gmaj7 | A7sus4 A7', bar(17));
  const chA2 = prog('Gmaj7 | A | F#m7 | Bm7 | Em7 | A7 | Bm7 | Gmaj7 A7sus4 | Gmaj7 | A | Bm7 | Bm7/A | Gmaj7 | A7sus4 A7 | D | D', bar(25));
  const chOut = vamp(bar(41));
  const chIntro = vamp(0);
  const allCh = [...chIntro, ...chA1, ...chB, ...chA2, ...chOut];

  // the magic motif's head, as a 4/4 glint in the vamp
  const glint = (at) => mel('D6/.5 E6/.5 F#6/.5 G6/.5 A6/2 | C#7/1.5 B6/.5 A6/2', at, { vel: 0.55 });

  return {
    id: 'bgm_title', notes: 'Title screen: the journey theme on solo piano, the bridge on flute with strings, then the whole theme on violins and flute; D major, 86 bpm.', bpm, intro, loop: 176, settle: 16, reverb: 'hall', wet: 0.6,
    tracks: {
      // piano: the theme in the right hand, broken chords in the left
      pianoRH: { inst: 'piano', events: [...vel(themeA(bar(1)), 1.05), ...within(vel(octave(themeA(bar(1)), -1), 0.5), bar(9), bar(16))], db: 0, pan: 0.05, send: 0.32, human: 0.008 },
      pianoLH: {
        inst: 'piano', db: -2, pan: -0.08, send: 0.32, human: 0.008,
        events: [
          ...arp([...chIntro, ...chA1], 'b 0 1 2 3 2 1 0', 0.5, 50, 67, 4, { vel: 0.34, pedal: true }),
          ...comp(chB, [[0, 2, 1], [2, 2, 0.85]], 50, 69, 4, { vel: 0.3 }),
          ...arp([...chA2, ...chOut], 'b 1 2 3 4 3 2 1', 0.5, 50, 74, 5, { vel: 0.3, pedal: true }),
        ],
      },
      air: { inst: 'air', events: pads(allCh, 57, 74, 3, { vel: 0.5 }), db: -15, send: 0.5, o: { cut: 1400 } },
      harp: { inst: 'harp', events: [...arp(within(chA1, bar(9), bar(17)), '0 1 2 3', 1, 62, 81, 4, { vel: 0.45 }), ...arp(chOut, '0 1 2 3 4 3 2 1', 0.5, 62, 86, 5, { vel: 0.4 })], db: -6, pan: -0.3, send: 0.45 },
      celesta: { inst: 'celesta', events: [...glint(bar(41)), ...glint(intro - 16), ...within(vel(octave(themeA(bar(25)), 1), 0.42), bar(33), bar(39)), ...mel('A6/.5 F#6/.5 E6/.5 D6/.5 E6/2', bar(8) + 2, { vel: 0.4 })], db: -6, pan: 0.32, send: 0.5 },
      // bridge: flute, strings enter, cellos answer
      flute: { inst: 'flute', events: [...themeB(bar(17), { vel: 0.72 }), ...within(themeA(bar(25), { vel: 0.62 }), bar(25), bar(33)), ...within(octave(themeA(bar(25), { vel: 0.58 }), 1), bar(33), bar(41))], db: -5, pan: 0.18, send: 0.42 },
      violins: { inst: 'violin', events: [...pads(chB, 64, 79, 2, { vel: 0.4 }), ...vel(themeA(bar(25)), 0.82)], db: -6, pan: -0.18, send: 0.45, o: { voices: 6 } },
      violas: { inst: 'viola', events: pads([...chB, ...chA2], 52, 67, 2, { vel: 0.38 }), db: -10, pan: 0.2, send: 0.42 },
      cellos: {
        inst: 'cello', db: -8, pan: 0.25, send: 0.38,
        events: [
          ...mel('D3/2 B2/2 | C#3/2 A2/2 | B2/2 D3/2 | A2/2 F#2/2 | G2/2 B2/2 | A2/2 C#3/2 | D3/1 E3/1 F#3/1 G3/1 | A3/2 G3/1 E3/1', bar(17), { vel: 0.5 }),
          ...bassLine(chA2, [[0, 2, 'r'], [2, 2, '5']], { lo: 38, hi: 55, vel: 0.5 }),
        ],
      },
      basses: { inst: 'contrabass', events: shift(bassLine(chA2, [[0, 4, 'r']], { lo: 38, vel: 0.5 }), 0, -12), db: -12, send: 0.3 },
      horns: {
        inst: 'horn', db: -12, pan: 0.1, send: 0.5,
        events: [
          ...pads(within(chA2, bar(25), bar(33)), 53, 67, 2, { vel: 0.42 }),
          ...mel('B3/2 D4/2 | C#4/2 E4/2 | D4/4 | C#4/4 | B3/2 D4/2 | D4/2 C#4/2 | A3/4 | -/4', bar(33), { vel: 0.45 }),
        ],
      },
      perc: {
        inst: 'kit', db: -10, send: 0.5,
        o: { map: { timp: { kind: 'timp', f: 73.4 }, swell: { kind: 'swell', dur: (6 * 60) / bpm }, bd: { kind: 'bassdrum' } } },
        events: { timp: hits([[bar(25), 0.55], [bar(33), 0.45], [bar(39), 0.4]]), swell: hits([[bar(23) + 2, 0.5]]), bd: hits([[bar(25), 0.4]]) },
      },
    },
  };
}
