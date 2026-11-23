// The score's two themes, as data. Every cue quotes, varies or re-harmonises these.
//
// Theme A, "the journey" (the heroine's theme): 16 bars of 4/4 in D major. Its head cell is scale degrees 3-2-3-6
// in a long-short-short-long rhythm that lands off the beat (F#5 E5 F#5 B5); the second half climbs to D6.
// Bridge B: 8 bars that start in the relative minor, speech-like eighths, and lead back into the head.
// Motif M, "magic" (Fran, the City of Magic, page trials): 3/4, a quick four-note run up to the fifth and a leap to
// the raised fourth (Lydian C# over G), like stardust thrown upward.
import { mel, prog } from '../score.mjs';

export const A_CHORDS = 'Gmaj7 | A | F#m7 | Bm7 | Em7 | A7 | Bm7 | Gmaj7 A7sus4 | Gmaj7 | A | Bm7 | Bm7/A | Gmaj7 | A7sus4 A7 | D | Gm6 A7sus4';
export const A_MEL = [
  'F#5/1.5 E5/.5 F#5/.5 B5/1.5', 'A5/1.5 G5/.5 F#5/.5 E5/1.5', 'F#5/1.5 E5/.5 F#5/.5 C#6/1.5', 'B5/1.5 A5/.5 F#5/2',
  'G5/1.5 F#5/.5 G5/.5 B5/1.5', 'A5/1 E5/1 C#5/1 E5/1', 'D5/1.5 C#5/.5 D5/.5 F#5/1.5', 'E5/4',
  'F#5/1.5 E5/.5 F#5/.5 B5/1.5', 'A5/1.5 G5/.5 F#5/.5 E5/1.5', 'F#5/1.5 E5/.5 F#5/.5 D6/1.5', 'C#6/1 B5/1 A5/1 F#5/1',
  'B5/1.5 A5/.5 B5/.5 D6/1.5', 'D6/2 C#6/1 A5/1', 'D6/3 -/1', '-/4',
];
export const B_CHORDS = 'Bm7 | F#m7 | Gmaj7 | D/F# | Em7 | F#m7 | Gmaj7 | A7sus4 A7';
export const B_MEL = [
  'D5/.5 D5/.5 C#5/.5 D5/.5 F#5/1 E5/1', 'C#5/.5 C#5/.5 B4/.5 C#5/.5 E5/1 C#5/1', 'B4/.5 C#5/.5 D5/.5 E5/.5 F#5/1 G5/1', 'A5/2 F#5/1 D5/1',
  'G5/.5 G5/.5 F#5/.5 G5/.5 B5/1 A5/1', "E5/.5 F#5/.5 A5/1 C#6/1 B5/1", 'B5/1.5 A5/.5 G5/1 F#5/1', 'E5/2 D5/1 C#5/1',
];

export const M_CHORDS = 'Gmaj7 | A/G | Gmaj7 | A/G | Em7 | Cmaj7 | Am7 | D7sus4 D7 | Gmaj7 | A/G | Bm7 | Em7 | Cmaj7 | Bm7 | Am7 D7 | G';
export const M_MEL = [
  'D5/.5 E5/.5 F#5/.5 G5/.5 A5/1', 'C#6/1.5 B5/.5 A5/1', 'B5/1 G5/1 D5/1', 'E5/2.5 -/.5',
  'D5/.5 E5/.5 F#5/.5 G5/.5 B5/1', 'E6/1.5 D6/.5 B5/1', 'C6/1 A5/1 E5/1', 'G5/1.5 F#5/1.5',
  'D5/.5 E5/.5 F#5/.5 G5/.5 A5/1', 'C#6/1.5 B5/.5 A5/1', 'D6/1 B5/1 F#5/1', 'G5/2.5 -/.5',
  'E5/.5 F#5/.5 G5/.5 A5/.5 B5/1', 'D6/1.5 B5/.5 F#5/1', 'A5/1 C6/1 F#5/1', 'G5/3',
];

/** Bars of a melody (array of bar strings) as events from beat `at`, bar length `bpb`. */
export function bars(list, at, bpb = 4, o = {}) {
  const out = [];
  list.forEach((s, i) => out.push(...mel(s, at + i * bpb, o)));
  return out;
}
export const themeA = (at, o) => bars(A_MEL, at, 4, o);
export const themeB = (at, o) => bars(B_MEL, at, 4, o);
export const motifM = (at, o) => bars(M_MEL, at, 3, o);
export const chordsA = (at) => prog(A_CHORDS, at, 4);
export const chordsB = (at) => prog(B_CHORDS, at, 4);
export const chordsM = (at) => prog(M_CHORDS, at, 3);
