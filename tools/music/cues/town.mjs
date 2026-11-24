// The City of Magic. A waltz in G with a Lydian sparkle (C#), 132 bpm in 3/4: accordion, mandolin, pizzicato strings,
// celesta and glockenspiel, tambourine and triangle. The magic motif on accordion, then on flute and celesta; a busy
// street tune in E minor; a lift into C where the motif climbs over the rooftops; the motif for the whole band.
import { mel, prog, arp, pads, pulse, bassLine, grid, mergeLanes, trem, octave, vel, within, hits } from '../score.mjs';
import { motifM, bars, M_MEL } from './themes.mjs';

export default function () {
  const bpm = 132, B = 3;
  const bar = (n) => (n - 1) * B;
  const chV = prog('Gmaj7 | A/G | Gmaj7 | A/G', bar(1), B);
  const chM = (n) => prog('Gmaj7 | A/G | Gmaj7 | A/G | Em7 | Cmaj7 | Am7 | D7sus4 D7 | Gmaj7 | A/G | Bm7 | Em7 | Cmaj7 | Bm7 | Am7 D7 | G', bar(n), B);
  const chA1 = chM(5), chA2 = chM(21), chA3 = chM(61);
  const chB = prog('Em | B7/D# | Em/D | A/C# | Cmaj7 | Am7 | B7sus4 | B7 | Em | B7/D# | Em/D | A/C# | Cmaj7 | D | Gmaj7 | D7sus4 D7', bar(37), B);
  const chC = prog('Cmaj7 | D/C | Cmaj7 | D/C | Bm7 | Em7 | Am7 | D7sus4 D7', bar(53), B);
  const all = [...chV, ...chA1, ...chA2, ...chB, ...chC, ...chA3];

  // oom-pah-pah: bass on 1 (root, then fifth on alternate bars), chords on 2 and 3
  const oom = (chs) => chs.filter((c) => (c.b - bar(1)) % B === 0).flatMap((c) => bassLine([c], [[0, 1, Math.round((c.b - bar(1)) / B) % 2 ? '5' : 'r']], { lo: 38, hi: 52, vel: 0.62 }));
  const pah = (chs, v = 0.45) => pulse(chs, [[1, 0.55, 1], [2, 0.55, 0.85]], B, 55, 71, 3, { vel: v });
  const street = [
    'B4/.5 E5/.5 G5/.5 F#5/.5 E5/.5 B4/.5', 'A5/1 F#5/.5 D#5/.5 B4/1', 'G5/.5 F#5/.5 E5/.5 D5/.5 E5/.5 G5/.5', 'A5/1.5 C#6/.5 E5/1',
    'G5/.5 E5/.5 C5/.5 E5/.5 G5/.5 B5/.5', 'C6/1 B5/.5 A5/.5 E5/1', 'E5/.5 F#5/.5 A5/1 B5/1', 'D#5/1.5 F#5/.5 A5/1',
    'E5/.5 G5/.5 B5/.5 A5/.5 G5/.5 E5/.5', 'F#5/1 D#5/1 B4/1', 'G5/.5 A5/.5 B5/.5 C6/.5 B5/.5 G5/.5', 'A5/2 E5/1',
    'E5/.5 G5/.5 C6/.5 B5/.5 G5/.5 E5/.5', 'F#5/1 A5/1 D6/1', 'B5/1.5 A5/.5 G5/1', 'G5/1.5 F#5/1.5',
  ];
  const lift = ['G5/.5 A5/.5 B5/.5 C6/.5 D6/1', 'F#6/1.5 E6/.5 D6/1', 'E6/1 C6/1 G5/1', 'A5/2.5 -/.5', 'D6/1 B5/1 F#5/1', 'G5/1 B5/1 E6/1', 'C6/1.5 B5/.5 A5/1', 'G5/1.5 F#5/1.5'];
  const sparkle = (n, v = 0.5) => mel('D6/.25 E6/.25 F#6/.25 G6/.25 A6/.25 C#7/.25 D7/1.5', bar(n), { vel: v });

  const perc = mergeLanes(
    ...[...Array(76).keys()].map((i) => {
      const n = i + 1;
      if (n >= 37 && n < 53) return grid({ frame: 'x..', tamb: '.xx' }, bar(n), 1, { vel: 0.8 });
      if (n >= 53 && n < 61) return grid({ tamb: 'x..' }, bar(n), 1, { vel: 0.6 });
      return grid({ tamb: n >= 61 ? 'x.o' : 'x..' }, bar(n), 1, { vel: 0.7 });
    }),
    { triangle: hits([5, 13, 21, 29, 61, 69].map((n) => [bar(n), 0.5])) },
  );

  return {
    id: 'bgm_town', notes: 'City of Magic: a waltz on the magic motif (accordion, mandolin, pizzicato, celesta), a street tune in E minor, a rooftop lift into C; G major with a Lydian C#, 132 bpm.', bpm, intro: 0, loop: 228, settle: 9, reverb: 'chamber', wet: 0.5,
    tracks: {
      accordion: { inst: 'accordion', events: [...motifM(bar(5), { vel: 0.72 }), ...vel(motifM(bar(61)), 0.7)], db: -1, pan: -0.12, send: 0.3, human: 0.004 },
      accChords: { inst: 'accordion', events: [...pah([...chV, ...chA2, ...chB]), ...pah(chA3, 0.4)], db: -9, pan: -0.25, send: 0.25, human: 0.004, o: { musette: 14 } },
      pizzBass: { inst: 'pizz', events: oom(all), db: -4, pan: 0.05, send: 0.25, human: 0.004 },
      pizzChords: { inst: 'pizz', events: pah([...chA1, ...chC], 0.5), db: -9, pan: 0.3, send: 0.3, human: 0.006 },
      flute: { inst: 'flute', events: [...motifM(bar(21), { vel: 0.7 }), ...within(octave(motifM(bar(61), { vel: 0.55 }), 1), bar(69), bar(77))], db: -8, pan: 0.15, send: 0.38 },
      celesta: { inst: 'celesta', events: [...vel(octave(motifM(bar(21)), 1), 0.5), ...[4, 12, 20, 36, 60, 76].flatMap((n) => sparkle(n))], db: -7, pan: 0.35, send: 0.45 },
      glock: { inst: 'glock', events: within(vel(octave(motifM(bar(61)), 1), 0.42), bar(61), bar(69)), db: -13, pan: 0.4, send: 0.4 },
      mandolin: { inst: 'mandolin', events: [...bars(street.slice(0, 8), bar(37), B, { vel: 0.62 }).flatMap((e) => (e.d >= 1 ? trem([e], 0.25, { inner: 0.75 }) : [e])), ...arp(within(chB, bar(45), bar(53)), '0 1 2 1 2 1', 0.5, 62, 79, 3, { vel: 0.35 })], db: -7, pan: 0.25, send: 0.28, human: 0.004 },
      violins: { inst: 'violin', events: [...pads(within(chA2, bar(21), bar(37)), 67, 81, 2, { vel: 0.32 }), ...bars(street.slice(8), bar(45), B, { vel: 0.66 }), ...bars(lift, bar(53), B, { vel: 0.74 }), ...vel(motifM(bar(61)), 0.7)], db: -7, pan: -0.2, send: 0.42, o: { voices: 6 } },
      violas: { inst: 'viola', events: pads([...chC, ...chA3], 52, 67, 2, { vel: 0.36 }), db: -12, pan: 0.15, send: 0.4 },
      harp: { inst: 'harp', events: arp(chC, '0 1 2 3 4 5', 0.5, 55, 86, 6, { vel: 0.42 }), db: -10, pan: -0.35, send: 0.45 },
      horns: { inst: 'horn', events: pads([...chC, ...within(chA3, bar(61), bar(77))], 52, 64, 2, { vel: 0.36 }), db: -16, send: 0.45 },
      perc: {
        inst: 'kit', events: perc, db: -11, send: 0.25, human: 0.004,
        o: { map: { tamb: { kind: 'tamb', gain: 0.5, pan: 0.35 }, frame: { kind: 'frame', gain: 0.9, pan: -0.15, f: 90 }, triangle: { kind: 'triangle', gain: 0.6, pan: 0.5 } } },
      },
    },
  };
}
