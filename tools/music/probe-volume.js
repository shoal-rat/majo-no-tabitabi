// play.mjs script: how loud each music mood plays in the game (after the master bus), effects and ambience muted.
//   node tools/play.mjs --name musicvol --quality low --timeout 600 --params "mute=0" --script tools/music/probe-volume.js
// Prints per mood: RMS and peak in dBFS over a few seconds of steady playback (layered moods also with the hot layer).
G.settings.sfx = 0;
G.audio.setVolumes();
await T.wait(2500);
const moods = ['title', 'home', 'sun', 'dusk', 'night', 'town', 'pages', 'flight', 'battle', 'boss', 'duel', 'final', 'ending'];
const db = (x) => +(20 * Math.log10(x + 1e-9)).toFixed(1);
async function measure(seconds) {
  let ss = 0, n = 0, pk = 0;
  const end = performance.now() + seconds * 1000;
  while (performance.now() < end) {
    const m = G.audio.debug({ meter: true }).meter;
    ss += m.rms * m.rms; n++; pk = Math.max(pk, m.peak);
    await T.wait(60);
  }
  return { rms: db(Math.sqrt(ss / Math.max(1, n))), peak: db(pk) };
}
const out = {};
for (const mood of moods) {
  G.audio.setIntensity(0);
  G.audio.music(mood, { fade: 0.3 });
  let playing = false;
  for (let i = 0; i < 150 && !playing; i++) {
    await T.wait(100);
    const d = G.audio.debug().music.decks.find((x) => x.mood === mood);
    playing = !!d?.playing;
  }
  if (!playing) { out[mood] = null; continue; }
  await T.wait(1500);
  const r = await measure(6);
  const deck = G.audio.debug().music.decks.find((x) => x.mood === mood);
  if (deck?.layer != null) {
    G.audio.setIntensity(1);
    await T.wait(3500);
    r.hot = await measure(5);
  }
  out[mood] = r;
}
G.audio.setIntensity(null);
G.audio.music('auto');
return out;
