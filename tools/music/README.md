# Game score

The background music is original and lives here as data. Every track is written as a score file in `cues/`,
rendered note by note by the synthesiser in this folder (no samples, no soundfont), mastered to −18 LUFS and encoded
as Ogg Opus into `assets/audio/music/`.

```
node tools/music/render.mjs sun                    # render .tmp/music/out/bgm_sun.{wav,ogg,json}
node tools/music/render.mjs sun --preview --stems  # + .tmp/music/preview/bgm_sun.mp3, per-track loudness, octave bands
node tools/music/render.mjs sun --seam             # per-track loop-seam error (should read -120 dB)
node tools/music/render.mjs sun --install          # copy into assets/, write its manifest row and MUSIC_LOOP entry
node tools/play.mjs --name musicvol --quality low --timeout 600 --params "mute=0" --script tools/music/probe-volume.js
```

After `--install`, run `node tools/gen-credits.mjs`.

## Themes

`cues/themes.mjs` holds the two themes every cue quotes:

- **Theme A, the journey** (the heroine): 16 bars of 4/4 in D major plus an 8-bar bridge (B). Its head cell is scale
  degrees 3-2-3-6 in a long-short-short-long rhythm that lands off the beat (F#5 E5 F#5 B5).
- **Motif M, magic** (Fran, the City of Magic, the page trials): 3/4 in G, a quick run up to the fifth and a leap to
  the raised fourth (C#).

## Cues

| mood | file | plays when | key, tempo | material |
| --- | --- | --- | --- | --- |
| title | `bgm_title` | title screen | D, 86 | A on piano → B on flute → A tutti; turnaround glints with M |
| home | `bgm_home` | hometown and its outskirts, not at night | G, 6/8 | A as a morning song; an accordion chore tune |
| sun | `bgm_sun` | day field | D, 116 | A as a travelling song; tin-whistle interlude |
| dusk | `bgm_dusk` | dusk | E minor, 3/4 92 | an evening tune on A's head in minor |
| night | `bgm_night` | night | D, 66 | A quietly on piano, B on cello |
| town | `bgm_town` | City of Magic regions | G Lydian, 3/4 132 | M as a waltz; street tune; rooftop lift |
| pages | `bgm_pages` | within reach of an unfinished page trial | A Dorian, 3/4 66 | M in Dorian over a drone |
| flight | `bgm_flight` | broom, high or fast | E, 138 | A lifted a step; soaring string line |
| battle (+hot) | `bgm_battle` | ordinary fights | B minor, 148 | A's head over B minor |
| boss (+hot) | `bgm_boss` | an elite or page guardian on her | D minor, 112 | A in D minor on horns |
| duel (+hot) | `bgm_duel` | Fran's spar | E Dorian, 152 | M as a duel figure |
| final (+hot) | `bgm_final` | the recollection bout | E minor → G, 160 | M's duel figure, A's head in minor, A whole in G |
| ending | `bgm_ending` | end credits | B minor → D, 92 | a traveller's song whose chorus is A |

`cues/theme.mjs` renders only a preview of the two themes; it is not shipped.

## How a cue is built

A cue module exports a function returning data:

```js
{ id: 'bgm_sun', notes, bpm, intro, loop, settle, reverb, wet, air, tracks: { name: { inst, events, db, pan, send, layer, human, hp, lp, eq, o } } }
```

- `intro`, `loop`, `settle` are in beats. The file is `intro | loop body | settle` where the settle region is the
  first `settle` beats of the body again. The game plays from 0 and loops from `intro + settle` to the end, so the
  seam lands inside music whose reverb and ringing notes have settled. The renderer measures the seam (`seamDb`).
- Events are `{ b, d, m: [midi…], v }` in beats from the start of the file. `score.mjs` writes them: `mel()` reads
  melody strings (`"F#5/1.5 E5/.5 -/1 D5+F#5/2"`), `prog()` chord symbols, and `pads`, `arp`, `comp`, `pulse`,
  `strums`, `bassLine`, `grid` (drums), `trem`, `diatonic` build accompaniment from chords.
- `layer: 'hot'` puts a track on the intensity layer (`<id>_hot.ogg`, same length). The game starts it in sync with
  the main file and fades it in with the director's fight intensity (`MUSIC_LAYERS` in `src/audio/names.js`).
- Randomness (humanised timing, vibrato phases, drum variants) is seeded by what an event is, never by render order,
  so the loop copy of a note renders to the same samples as the note itself.

## Instruments (`inst.mjs`)

piano (modal, two coupled strings per partial, hammer knock), celesta / glock / musicbox / vibes / chime (modal bars),
guitar / steel / mandolin / harp / pizz / bass / ebass (extended Karplus–Strong with body resonances), violin / viola /
cello / contrabass (bowed section: band-limited saw ensemble with vibrato, drift, bow noise and body EQ; `voices: 1`
for a solo), spicc / stacc / marc (short bowed notes), flute / whistle, accordion (two reeds, musette beat), horn
(soft brass section), choir (formant-filtered ensemble), air (soft pad), and a kit: kick, snare, brush, rim, hat,
ohat, ride, crash, tom, frame, frameSlap, tamb, shaker, timp, bassdrum, snap, clap, triangle, swell.

Reverb is a convolution with a generated stereo impulse response (`dsp.mjs` `ROOMS`: hall, chamber, room,
cathedral, plate). Tracks render in parallel worker threads (`track.mjs`, `worker.mjs`).

## Mixing by numbers

`--stems` prints each track's loudness relative to the full mix and the mix's octave-band balance. Rough targets: the
lead line −2 to −6 LU, counter-lines and chords −8 to −14, pads −12 to −18; the 31–62 Hz bands well below the
125–500 Hz ones. All tracks are mastered to −18 LUFS integrated over the loop region with a −1 dBTP ceiling.
