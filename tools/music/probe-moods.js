// play.mjs script: the music director picks the score's moods in the right places, loop points are set on the
// playing source, and a fight's hot layer follows the intensity.
//   node tools/play.mjs --name musicmoods --quality low --timeout 600 --params "mute=0" --script tools/music/probe-moods.js
const out = {};
const mus = () => G.audio.debug().music;
const deck = (mood) => mus().decks.find((d) => d.mood === mood && d.target > 0);
async function until(fn, ms = 20000) { const end = performance.now() + ms; while (performance.now() < end) { if (fn()) return true; await T.wait(250); } return false; }
async function place(name, x, z, want) {
  T.teleport(x, z);
  const ok = await until(() => mus().current === want && deck(want)?.playing, 25000);
  const m = mus(), d = deck(want);
  out[name] = { region: G.env.region, major: G.env.major, wanted: m.wanted, current: m.current, ok, loopStart: d?.loopStart ?? null };
}
G.settings.sfx = 0; G.audio.setVolumes();
await T.wait(2000);
// keep daylight where the field moods are checked: the sun mood follows the Veil, so only check what it says
await place('home', 2215, 45, 'home');
await place('city', -2160, -520, 'town');
const site = G.wilds?.pages?.sites?.[0];
if (site) await place('pageSite', site.def.x + 8, site.def.z + 8, 'pages');
await place('field', 1340, -110, G.env.major || 'sun');
out.field.wantedHere = mus().wanted;

// a fight: one foe → battle at intensity 0; three foes → intensity 1, the layer swells; an elite → boss
const P = G.player, C = G.combat;
const types = ['wolf', 'blob', 'paper'].filter((t) => C?.TYPES?.[t]);
const spawn = (k, opts = {}) => C.spawn(types[k % types.length], { x: P.pos.x + 9 + k * 2, y: NaN, z: P.pos.z + 6 }, { aggro: true, persistent: true, ...opts });
const foes = [spawn(0)];
await until(() => mus().current === 'battle' && deck('battle')?.playing, 15000);
await T.wait(2500);
out.battle1 = { current: mus().current, intensity: mus().intensity, layer: deck('battle')?.layer, loopStart: deck('battle')?.loopStart };
foes.push(spawn(1), spawn(2));
await until(() => (deck('battle')?.layer ?? 0) > 0.9, 15000);
out.battle3 = { current: mus().current, intensity: mus().intensity, layer: deck('battle')?.layer };
for (const e of foes) { e.persistent = false; C.damage?.(e, 99999, { force: true }); }
await T.wait(1500);
const el = spawn(3);
try { C.makeElite?.(el, []); } catch (e) { out.eliteError = String(e); }
await until(() => mus().current === 'boss' && deck('boss')?.playing, 20000);
out.boss = { current: mus().current, named: G.audio.debug().music.wanted, intensity: mus().intensity, layer: deck('boss')?.layer, loopStart: deck('boss')?.loopStart };
C.damage?.(el, 99999, { force: true });
await until(() => mus().current !== 'boss', 20000);
out.after = { current: mus().current, wanted: mus().wanted };
out.errors = T.errors();
return out;
