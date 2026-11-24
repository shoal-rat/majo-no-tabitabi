// End credits: a traveller's song. B minor, 92 bpm. A verse of its own on low whistle over fingerpicked nylon guitar;
// the chorus turns to D major and becomes the journey theme on accordion; the verse again on violins; the theme for
// everyone. The guitar's four-bar walk opens the song and closes each pass, so the loop comes round like a new day.
import { mel, prog, arp, pads, comp, strums, bassLine, grid, mergeLanes, shift, octave, vel, within, hits, diatonic, SCALE } from '../score.mjs';
import { themeA, bars } from './themes.mjs';

export default function () {
  const bpm = 92, intro = 16;
  const bar = (n) => intro + (n - 1) * 4;
  const drums = (lanes, from, n, o) => mergeLanes(...Array.from({ length: n }, (_, i) => grid(lanes, bar(from + i), 0.25, o)));
  const VERSE = 'Bm | G | D | A | Bm | G | Em7 | F#7sus4 F#7 | Bm | G | D | A/C# | G | Em7 | F#sus4 | F#';
  const CHORUS = 'Gmaj7 | A | F#m7 | Bm7 | Em7 | A7 | Bm7 | Gmaj7 A7sus4 | Gmaj7 | A | Bm7 | Bm7/A | Gmaj7 | A7sus4 A7 | D | Gmaj7 F#7';
  const chIn = prog('Bm | G | D | A', 0), chV1 = prog(VERSE, bar(1)), chC1 = prog(CHORUS, bar(17)), chV2 = prog(VERSE, bar(33)), chC2 = prog(CHORUS, bar(49)), chOut = prog('Bm | G | D | A', bar(65));
  const verse = [
    'F#4/.5 B4/.5 B4/1 C#5/.5 D5/1.5', 'E5/1 D5/.5 B4/.5 B4/2', 'A4/.5 D5/.5 D5/1 E5/.5 F#5/1.5', 'E5/2 C#5/1 A4/1',
    'F#5/1 F#5/.5 E5/.5 D5/1 B4/1', 'D5/1.5 C#5/.5 B4/1 G4/1', 'A4/.5 B4/.5 A4/1 G4/1 E4/1', 'F#4/3 -/1',
    'F#4/.5 B4/.5 B4/1 C#5/.5 D5/1.5', 'G5/1 F#5/.5 D5/.5 D5/2', 'A5/1 G5/.5 F#5/.5 F#5/1 D5/1', 'E5/3 -/1',
    'D5/.5 E5/.5 F#5/1 G5/1 A5/1', 'B5/1.5 A5/.5 G5/1 E5/1', 'F#5/2 E5/1 C#5/1', 'D5/1 C#5/1 A#4/2',
  ];
  const PICK = 'b 0 1 2 b 1 2 0';
  const STRUM = [[0, 'd', 1], [1.5, 'u', 0.6], [2, 'd', 0.85], [3, 'd', 0.7], [3.5, 'u', 0.6]];
  const perc = mergeLanes(
    drums({ frame: 'x.......x.......', frameSlap: '....x.......x...' }, 17, 16, { vel: 0.7 }),
    drums({ frame: 'x.......x.......', frameSlap: '....x.......x..o' }, 33, 16, { vel: 0.75 }),
    drums({ frame: 'x.....x.x.......', frameSlap: '....x.......x...', shaker: 'oxoxoxoxoxoxoxox' }, 49, 16, { vel: 0.85 }),
  );
  return {
    id: 'bgm_ending', notes: "End credits: a traveller's song in B minor (low whistle, nylon guitar, accordion, cello) whose chorus becomes the journey theme in D major; 92 bpm.", bpm, intro, loop: 272, settle: 12, reverb: 'hall', wet: 0.55,
    tracks: {
      guitar: { inst: 'guitar', events: [...arp([...chIn, ...chV1], PICK, 0.5, 50, 67, 3, { vel: 0.5 }), ...strums([...chC1], STRUM, { vel: 0.42, lo: 45, hi: 67 }), ...arp(chV2, PICK, 0.5, 50, 67, 3, { vel: 0.5 }), ...strums(chC2, STRUM, { vel: 0.46, lo: 45, hi: 67 }), ...arp(chOut, PICK, 0.5, 50, 67, 3, { vel: 0.5 })], db: -6, pan: -0.2, send: 0.3, human: 0.008 },
      lowWhistle: { inst: 'whistle', events: [...bars(verse, bar(1), 4, { vel: 0.7 }), ...mel('D5/4 | B4/4 | A4/4 | A4/2 C#5/2 | B4/4 | B4/2 G4/2 | B4/4 | A#4/4', bar(41), { vel: 0.5 }), ...themeA(bar(49), { vel: 0.68 })], db: -5, pan: 0.12, send: 0.4, o: { vib: 9 } },
      accordion: { inst: 'accordion', events: [...pads(within(chV1, bar(5), bar(17)), 54, 69, 3, { vel: 0.3 }), ...themeA(bar(17), { vel: 0.66 }), ...pads(chV2, 54, 69, 3, { vel: 0.3 }), ...diatonic(themeA(bar(49), { vel: 0.5 }), -2, SCALE.D)], db: 0, pan: -0.1, send: 0.32, o: { musette: 9 } },
      violins: { inst: 'violin', events: [...pads(chC1, 62, 76, 2, { vel: 0.34 }), ...octave(bars(verse, bar(33), 4, { vel: 0.66 }), 1), ...octave(themeA(bar(49), { vel: 0.6 }), -1)], db: -7, pan: -0.25, send: 0.42, o: { voices: 6 } },
      violas: { inst: 'viola', events: pads([...chC1, ...chV2, ...chC2], 52, 66, 2, { vel: 0.32 }), db: -14, pan: 0.2, send: 0.4 },
      cello: {
        inst: 'cello', db: -9, pan: 0.28, send: 0.38,
        events: [
          ...mel('B2/4 | G2/4 | F#2/4 | E2/2 C#3/2 | D3/4 | B2/4 | G2/2 A2/2 | F#2/4', bar(9), { vel: 0.5 }),
          ...mel('D3/2 F#3/2 | G3/2 B2/2 | A2/2 F#3/2 | E3/2 C#3/2 | D3/4 | B2/2 D3/2 | E3/2 G3/2 | F#3/2 C#3/2 | D3/2 F#3/2 | G3/2 B2/2 | A2/2 D3/2 | C#3/4 | B2/2 D3/2 | E3/2 G3/2 | F#3/4 | A#2/4', bar(33), { vel: 0.5 }),
        ],
      },
      bass: { inst: 'bass', events: [...bassLine([...chC1, ...chV2, ...chC2], [[0, 2, 'r'], [2, 1.5, '5'], [3.5, 0.5, 'a']], { lo: 33, hi: 50, vel: 0.6 })], db: -5, send: 0.15, human: 0.006 },
      piano: { inst: 'piano', events: [...arp(chV2, '0 1 2 3 2 1', 1, 64, 81, 4, { vel: 0.28 }), ...comp(chC2, [[0, 2, 1], [2, 2, 0.8]], 55, 72, 4, { vel: 0.3 })], db: -6, pan: 0.15, send: 0.38, human: 0.008 },
      harp: { inst: 'harp', events: [...arp([...chIn, ...chOut], '0 1 2 3 4 5 4 3', 0.25, 59, 88, 6, { vel: 0.34 }).filter((e) => Math.round((e.b % 4) * 4) >= 8), ...arp(within(chC2, bar(49), bar(65)), '0 1 2 3', 1, 62, 81, 4, { vel: 0.34 })], db: -6, pan: -0.38, send: 0.48 },
      perc: { inst: 'kit', events: perc, db: -9, send: 0.3, human: 0.006, o: { map: { frame: { kind: 'frame', f: 78, gain: 1, pan: -0.1 }, frameSlap: { kind: 'frameSlap', f: 78, gain: 0.8, pan: -0.1 }, shaker: { kind: 'shaker', gain: 0.25, pan: 0.4 } } } },
    },
  };
}
