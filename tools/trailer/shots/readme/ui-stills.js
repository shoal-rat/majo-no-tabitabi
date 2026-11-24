// README stills of the journal (a tools/play.mjs script, not a rig shot): docs/images/map.webp and journal.webp.
//   node tools/play.mjs --name readme-ui --size 1600x900 --quality high --params "outfit=elaina&lessons=0" --timeout 400 --script tools/trailer/shots/readme/ui-stills.js
//   then cwebp -q 88 (map) / -q 80 (journal) on .tmp/play/readme-ui/{map,journal}.png
// An episode-two player inside the City of Magic with four travel stamps and a good part of the open country found.
G.quests.debugSkipTo('mages', 'inquire');
G.state.stamps = { hometown: 1, forest: 1, wilds: 1, bellcrown: 1 };
const stars = G.wilds.stars;
let n = 0;
for (const s of stars) { if (s.lm) G.wilds.discover(s.lm, { silent: true }); if (n++ % 3 !== 2) G.wilds.collectStar(s.id, { silent: true }); }
for (const id of ['pg_wind', 'pg_thunder', 'pg_fire']) G.wilds.pages.sight?.(id, { silent: true });
G.state.wilds.pages.pg_wind = 'read'; G.state.wilds.pages.pg_fire = 'read';
T.teleport(-2163, -505, 30);
await T.frames(200);
G.ui.openMenu('map');
await T.frames(90);
await T.shot('map');
G.ui.openMenu('journal');
await T.frames(90);
await T.shot('journal');
return { stamps: G.state.stamps, found: Object.keys(G.state.wilds.lm).length, stars: Object.keys(G.state.wilds.stars).length };
