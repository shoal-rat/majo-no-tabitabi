// Hometown and its outskirts by day: a morning at home before the journey. G major in a lilting 6/8 (a beat here is
// an eighth note; dotted quarter = 60). Music box and nylon guitar, the journey theme on flute as a lullaby-like
// morning song, a chore-day tune on accordion, the theme again on violins with piano.
import { mel, prog, arp, pads, pulse, bassLine, grid, mergeLanes, shift, octave, vel, within, hits } from '../score.mjs';
import { bars } from './themes.mjs';

export default function () {
  const bpm = 180, B = 6, intro = 0;
  const bar = (n) => intro + (n - 1) * B;
  const THEME = [
    'B4/2 A4/1 B4/1 E5/2', 'D5/2 C5/1 B4/1 A4/2', 'B4/2 A4/1 B4/1 F#5/2', 'E5/2 D5/1 B4/3',
    'C5/2 B4/1 C5/1 E5/2', 'D5/2 A4/1 F#4/1 A4/2', 'G4/2 F#4/1 G4/1 B4/2', 'A4/6',
    'B4/2 A4/1 B4/1 E5/2', 'D5/2 C5/1 B4/1 A4/2', 'B4/2 A4/1 B4/1 G5/2', 'F#5/2 E5/2 D5/1 B4/1',
    'E5/2 D5/1 E5/1 G5/2', 'G5/3 F#5/2 D5/1', 'G5/6', '-/6',
  ];
  const TCH = 'Cmaj7 | D | Bm7 | Em7 | Am7 | D7 | Em7 | Cmaj7 D7sus4 | Cmaj7 | D | Em7 | Em7/D | Cmaj7 | D7sus4 D7 | G | Cm6 D7sus4';
  const CHORE = [
    'B4/1 E5/1 G5/1 F#5/2 E5/1', 'E5/2 D5/1 C5/3', 'D5/1 G5/1 B5/1 A5/2 G5/1', 'F#5/2 E5/1 D5/3',
    'B4/1 E5/1 G5/1 B5/2 A5/1', 'G5/2 F#5/1 E5/3', 'C5/1 E5/1 A5/1 G5/2 E5/1', 'F#5/6',
    'E5/2 G5/1 C6/2 B5/1', 'B5/2 A5/1 G5/3', 'A5/2 G5/1 E5/2 C5/1', 'D5/3 B4/3',
    'C5/1 E5/1 G5/1 E5/2 G5/1', 'A5/2 F#5/1 D5/3', 'G5/2 F#5/1 E5/2 B4/1', 'A4/3 D5/1 C5/1 A4/1',
  ];
  const chIn = prog('Cmaj7 | D | G | G', bar(1), B);
  const chA1 = prog(TCH, bar(5), B), chC = prog('Em | C | G | D | Em | C | Am7 | D7 | C | G/B | Am7 | G | C | D | Em7 | Am7 D7', bar(21), B), chA2 = prog(TCH, bar(37), B);
  const all = [...chIn, ...chA1, ...chC, ...chA2];
  const PICK = 'b 0 1 2 1 0';
  return {
    id: 'bgm_home', notes: 'Hometown and outskirts by day: the journey theme as a 6/8 morning song (flute, nylon guitar, music box), an accordion chore tune, violins with piano; G major.', bpm, intro, loop: 52 * B, settle: 12, reverb: 'chamber', wet: 0.55,
    tracks: {
      musicbox: { inst: 'musicbox', events: [...mel('B5/2 A5/1 B5/1 E6/2 | D6/2 C6/1 B5/1 A5/2 | G5/6 | -/6', bar(1), { vel: 0.5 }), ...within(octave(bars(THEME, bar(37), B, { vel: 0.35 }), 1), bar(45), bar(52))], db: -8, pan: 0.3, send: 0.45 },
      guitar: { inst: 'guitar', events: arp(all, PICK, 1, 50, 67, 3, { vel: 0.46 }), db: -7, pan: -0.25, send: 0.3, human: 0.008 },
      flute: { inst: 'flute', events: [...bars(THEME, bar(5), B, { vel: 0.66 }), ...mel('E5/6 | F#5/6 | G5/6 | G5/3 F#5/3 | E5/6 | D5/3 C5/3 | B4/6 | C5/3 D5/3', bar(45), { vel: 0.42 })], db: -5, pan: 0.12, send: 0.38 },
      accordion: { inst: 'accordion', events: [...bars(CHORE, bar(21), B, { vel: 0.6 })], db: -6, pan: -0.08, send: 0.3, o: { musette: 8 } },
      pizz: { inst: 'pizz', events: bassLine(all, [[0, 2, 'r'], [3, 2, '5']], { lo: 40, hi: 55, vel: 0.5 }), db: -8, send: 0.25, human: 0.006 },
      glock: { inst: 'glock', events: [...hits([[bar(21), 0.3], [bar(29), 0.3]]).map((e) => ({ ...e, m: [83] })), ...within(octave(bars(CHORE, bar(21), B, { vel: 0.28 }), 1), bar(29), bar(37))], db: -12, pan: 0.4, send: 0.4 },
      violins: { inst: 'violin', events: [...pads(chC, 64, 76, 2, { vel: 0.3 }), ...bars(THEME, bar(37), B, { vel: 0.62 })], db: -8, pan: -0.2, send: 0.42 },
      violas: { inst: 'viola', events: pads([...within(chA1, bar(13), bar(21)), ...chA2], 52, 66, 2, { vel: 0.32 }), db: -14, pan: 0.2, send: 0.4 },
      cello: { inst: 'cello', events: pads(chA2, 40, 52, 1, { vel: 0.38 }), db: -13, pan: 0.25, send: 0.35 },
      piano: { inst: 'piano', events: [...arp(chA2, '0 1 2 3 2 1', 1, 60, 79, 4, { vel: 0.26, pedal: true })], db: -5, pan: 0.15, send: 0.35, human: 0.008 },
      perc: { inst: 'kit', events: mergeLanes(...[...Array(16).keys()].map((i) => grid({ shaker: 'x.ox.o' }, bar(21 + i), 1, { vel: 0.5 }))), db: -4, send: 0.25, o: { map: { shaker: { kind: 'shaker', soft: true, gain: 0.5, pan: 0.35 } } } },
    },
  };
}
