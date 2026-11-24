// Fran's spar in the forest clearing: the teacher at play, and very good at it. E Dorian, 152 bpm. The magic motif
// becomes a duel figure: a sixteenth-note run up to the C# (the motif's raised note) and a fall. Pizzicato and
// spiccato strings, celesta sparks, frame drum and snare; in the middle the motif itself, in its home key, on flute and
// celesta; a shower of stardust; the figure for everyone. The hot layer (kit, horns, a second violin section) comes in
// when Fran takes to the air.
import { mel, prog, arp, pads, comp, bassLine, grid, mergeLanes, shift, octave, vel, within, hits } from '../score.mjs';
import { bars } from './themes.mjs';

export default function () {
  const bpm = 152, intro = 0;
  const bar = (n) => intro + (n - 1) * 4;
  const drums = (lanes, from, n, o) => mergeLanes(...Array.from({ length: n }, (_, i) => grid(lanes, bar(from + i), 0.25, o)));
  const FIG = [
    'B4/.25 C#5/.25 D5/.25 E5/.25 F#5/.5 A5/.5 C#6/1 B5/.5 A5/.5', 'G5/1.5 E5/.5 C#5/1 E5/1',
    'B4/.25 C#5/.25 D5/.25 E5/.25 F#5/.5 A5/.5 E6/1 D6/.5 B5/.5', 'C#6/2 A5/1 E5/1',
    'G5/.5 A5/.5 B5/1 G5/1 E5/1', 'F#5/.5 G5/.5 A5/1 F#5/1 D5/1', 'B4/.5 D5/.5 G5/1 F#5/1 G5/1', 'E5/2 D#5/2',
    'B4/.25 C#5/.25 D5/.25 E5/.25 F#5/.5 A5/.5 C#6/1 B5/.5 A5/.5', 'G5/1.5 E5/.5 C#5/1 E5/1',
    'B4/.25 C#5/.25 D5/.25 E5/.25 F#5/.5 A5/.5 E6/1 D6/.5 B5/.5', 'C#6/2 A5/1 E5/1',
    'E6/1.5 D6/.5 C6/1 G5/1', 'F#6/1.5 E6/.5 D6/1 A5/1', 'B5/.25 C#6/.25 D6/.25 E6/.25 F#6/1 E6/2', 'D#6/2 B5/1 F#5/1',
  ];
  const FCH = 'Em | A | Em | A | Cmaj7 | D | G | B7sus4 B7 | Em | A | Em | A | C | D | Em | B7';
  // the magic motif's head in 4/4, in its own key (G, Lydian C#)
  const MAGIC = ['D5/.5 E5/.5 F#5/.5 G5/.5 A5/2', 'C#6/1.5 B5/.5 A5/2', 'B5/1 G5/1 D5/2', 'E5/3 -/1', 'D5/.5 E5/.5 F#5/.5 G5/.5 B5/2', 'E6/1.5 D6/.5 B5/2', 'C6/1 A5/1 E5/2', 'F#5/2 D#5/2'];
  const MCH = 'G | A/G | G | A/G | Em | C | Am | B7';
  const chIn = prog('Em | A/E | Em | A/E', bar(1));
  const chA = prog(FCH, bar(5)), chM = prog(MCH, bar(21)), chS = prog('Cmaj7 | D | Bm7 | Em | Cmaj7 | D | B7sus4 | B7', bar(29)), chA2 = prog(FCH, bar(37)), chOut = prog('Em | A/E | Em | A/E', bar(53));
  const all = [...chIn, ...chA, ...chM, ...chS, ...chA2, ...chOut];
  const spark = (n) => mel('E6/.25 F#6/.25 G6/.25 A6/.25 B6/.25 C#7/.25 E7/.5', bar(n) + 2, { vel: 0.45 });
  const base = mergeLanes(
    drums({ frame: 'x..x..x.x.......', snare: '....o.......x...' }, 1, 20, { vel: 0.85 }),
    drums({ frame: 'x.....x.........', snare: '........o.......' }, 21, 8, { vel: 0.7 }),
    drums({ frame: 'x..x..x.x.......', snare: '....o.......x..o' }, 29, 28, { vel: 0.9 }),
  );
  const hot = mergeLanes(
    drums({ kick: 'x..x..x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, 1, 20),
    drums({ kick: 'x.......x.......', hat: 'x...x...x...x...' }, 21, 8),
    drums({ kick: 'x..x..x...x.....', snare: '....x.......x...', ride: 'x.x.x.x.x.x.x.x.' }, 29, 8),
    drums({ kick: 'x..x..x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }, 37, 19),
    drums({ kick: 'x...x...x.x.x.x.', snare: 'o.o.x.x.xxxxXXXX' }, 56, 1),
    { crash: hits([5, 29, 37].map((n) => [bar(n), 0.7])) },
  );
  return {
    id: 'bgm_duel', notes: "Fran's spar: the magic motif as a duel figure in E Dorian (pizzicato, spiccato, celesta, frame drum); hot layer adds kit, horns and second violins when she flies; 152 bpm.", bpm, intro, loop: 56 * 4, settle: 8, reverb: 'hall', wet: 0.42,
    tracks: {
      pizz: { inst: 'pizz', events: [...arp(all, '0 2 1 2 0 2 1 2', 0.5, 47, 64, 3, { vel: 0.52 })], db: -7, pan: 0.25, send: 0.3, human: 0.004 },
      spicc: { inst: 'spicc', events: arp([...chA, ...chS, ...chA2], 'b 0 b 1 b 2 b 1', 0.5, 50, 64, 3, { vel: 0.5 }), db: -11, pan: -0.25, send: 0.3, human: 0.003, o: { reg: 'cello', voices: 3 } },
      violins: { inst: 'violin', events: [...bars(FIG, bar(5), 4, { vel: 0.74 }), ...mel('G5/4 | A5/4 | F#5/4 | G5/2 B5/2 | E6/4 | F#6/4 | E6/4 | D#6/4', bar(29), { vel: 0.66 }), ...bars(FIG, bar(37), 4, { vel: 0.8 })], db: -5, pan: -0.15, send: 0.35, o: { voices: 6, attack: 0.04 } },
      flute: { inst: 'flute', events: [...bars(MAGIC, bar(21), 4, { vel: 0.68 }), ...within(octave(bars(FIG, bar(37), 4, { vel: 0.5 }), 1), bar(49), bar(53))], db: -6, pan: 0.15, send: 0.4 },
      celesta: { inst: 'celesta', events: [...[4, 8, 12, 16, 36, 40, 44, 48].flatMap(spark), ...octave(bars(MAGIC, bar(21), 4, { vel: 0.45 }), 1), ...arp(chS, '0 1 2 3 4 3 2 1', 0.25, 76, 96, 5, { vel: 0.3 })], db: -8, pan: 0.35, send: 0.5 },
      harp: { inst: 'harp', events: arp(chM, '0 1 2 3 2 1', 0.5, 59, 79, 4, { vel: 0.4 }), db: -8, pan: -0.35, send: 0.45 },
      bass: { inst: 'contrabass', events: shift(bassLine(all, [[0, 1.8, 'r'], [2, 1.8, '5']], { lo: 40, hi: 52, vel: 0.55 }), 0, -12), db: -13, send: 0.2, o: { attack: 0.03, release: 0.12 } },
      drums: { inst: 'kit', events: base, db: -9, hp: 50, send: 0.25, human: 0.003, o: { map: { frame: { kind: 'frame', f: 95, gain: 1, pan: -0.1 }, snare: { kind: 'snare', gain: 0.4, pan: 0.1 } } } },
      // ---- hot layer
      kit: { inst: 'kit', layer: 'hot', events: hot, db: -10, hp: 45, send: 0.15, human: 0.003, o: { map: { kick: { kind: 'kick', gain: 0.5, tune: 1.2 }, snare: { kind: 'snare', gain: 0.55 }, hat: { kind: 'hat', gain: 0.2, pan: 0.3 }, ride: { kind: 'ride', gain: 0.18, pan: 0.3 }, crash: { kind: 'crash', gain: 0.28, pan: -0.3 } } } },
      horns: { inst: 'horn', layer: 'hot', events: [...comp([...chA, ...chA2], [[0, 0.4, 1], [1.5, 0.4, 0.8], [3, 0.9, 0.9]], 52, 64, 3, { vel: 0.55 }), ...pads(chS, 52, 66, 2, { vel: 0.5 })], db: -11, pan: 0.1, send: 0.38 },
      violins2: { inst: 'spicc', layer: 'hot', events: arp([...chA, ...chA2], '0 1 2 1 0 1 2 1', 0.25, 66, 83, 3, { vel: 0.4 }), db: -14, pan: -0.38, send: 0.3, human: 0.002, o: { reg: 'violin', voices: 4 } },
    },
  };
}
