# craft — as built

The witch's craft: the star thread 「牵星线」 (traction), star knots 「结星」 (ties) and, in the restoration round, the
back-light 「溯光」. Design and the reasons behind it: docs/JOURNEY.md §5 "Movement and craft". System `craft`
(`src/craft/craft.js`, after `spells` in `systems.manifest.json`), data `src/data/craft.js`, text
`src/locales/zh-CN/craft.js`.

## Creation round (move-craft PR 2, 2026-11-24)

**Felling.** Strong blows still fell a tree at once (`flora/life.js onTreeHit`: thunder, big fire / wind, heavy earth).
New: her ordinary attacks chop (`chop()`): each player-team hit adds `CHOP[element]` (magic bullet 0.36, ice 0.42,
earth 0.75, wind 0.2, fire 0.12) scaled by power, and the tree falls away from her when the sum reaches
`1 + 2.5 × trunk radius` (about 5 magic bullets for a common tree). Twenty quiet seconds reset it; story places
(`carveGuard`) are never chopped. A magic bullet that hits a trunk (a static collider, not a reactor) now applies its
small sun hit there (`spells/forms.js charmDef`). A felled tree lies down and becomes 1–2 `log` props (as before), which
are craft parts. Event `'flora:chop' { id, k }` (k = 0..1 of the way through).

**The star thread** (`{thread}`, KeyZ; touch: the 「星线」 button in the 式神 slot):
- Press {thread}: thread mode (over-the-shoulder aim, she faces her aim). A catchable part under the aim (physics ray, or
  the nearest one within 1.6 m of the aim point) glows; {attack} catches it.
- Catchable: a live dynamic prop body of a type in `PARTS`, mass ≤ `THREAD.MAX_MASS` (600), within `THREAD.RANGE`
  (20 m) of her hand, not debris. Its whole tied assembly comes with it (≤ `MAX_LIFT` 1800 total mass); every part is
  `held` (no gravity, damped), the caught part is driven with `PhysBody.setKinematicTarget(pos, quat)`, so it still
  collides with the world.
- Carrying: the part rides along her aim at its distance (wheel ±0.7 m, touch 「拉近」/「推远」 held, 2.4–13 m), never
  below the ground or the water surface. Turning: hold {guard} and move the mouse (the camera holds still:
  `G.craft.turning`), or tap 「转向」 (45° about up) / 「翻转」 (45° about her right). The part keeps its pose relative
  to the camera's yaw. She walks at 0.6× while carrying; 1.5 mana/s; out of mana it lets go.
- {attack} again lets go; {thread} puts the thread away (drops the part). Mounting the broom, climbing, swimming, a
  conversation or losing control also drops it.
- While the thread is out, spells ignore attack / cast / guard / the wheel (`spells.js playerInput` returns early on
  `G.craft.busy`).

**Star knots.** While she holds a part, every other loose tieable part within `KNOT.REACH` (0.35 m) of a held part
(`G.physics.overlapSphere`, then Rapier's closest points `Collider.contactCollider`) shows a pulsing gold four-pointed
glint at its nearest point (`src/craft/knots.js`, one `THREE.Points`). Letting go with {attack} while they show is the
magnet: the held parts jump the gap (≤ 0.35 m) to sit flush against the first of them, then each neighbouring part gets
one knot (3 mana each; knots seen in the last 0.25 s count). A tie is a Rapier impulse fixed joint whose frames keep the current pose, with
contacts between the two parts switched off. (Multibody joints were tried first: they are exact, but a multibody link
takes its velocity from the chain, and this physics wrapper applies buoyancy, wind and the thread's drive by setting
each body's velocity, so a tied raft sank and its sail never moved it.) {cast} while holding snips
every knot on the held part. Tied knots glow softly while within 90 m. Tied props are kept live (`prop.persistent`)
and go back to normal when untied. A part that breaks, burns or despawns drops its knots. Ties are not saved (no
physics state is).

**Caps** (`CAPS` by `G.quality.name`): parts in one assembly mobile 8 / low 10 / med 16 / high 24; tied bodies in the
world 24 / 32 / 48 / 64. Past either the knot refuses with a toast.

**Sails.** The `sail` prop (procedural: a cross foot, mast, yard and five bellied cloth panels; `props/models.js sail()`)
is a part with `sail` area 2.6 m². Every sail within 120 m feels `G.elements.windAt` at its yard (breeze, gusts, fire
updrafts) as an impulse of `wind × area × SAIL.K`, scaled by how square the cloth faces it. Her own wind cast
(`'spell:cast'` wind) within 16 m (big: 26 m) and a 0.6 cone shoves the sail's whole assembly by `SAIL.GUST` m/s
(×1.8 big): a raft with a sail sails when she blows into it. Standing on a moving body (a raft, a floating log) now
carries her with it (`player.js integrate`).

**Input / touch.** New actions `thread` (KeyZ), `rewind` (KeyG), and touch-only `craftTurn`, `craftTilt`, `craftNear`,
`craftFar` (shown while a part is on the thread). Z and G were the unused 式神 / 金环 keys; with those arts unknown they
no longer toast 「未习得」.

**API** `G.craft`: `knows(art)`, `learn(art, { silent })` (sets `G.state.abilities[art]`, `'craft:learned'`), `mode`
('off' | 'aim' | 'hold'), `busy`, `holding` (PhysBody | null), `turning`, `aimed`, `grab(body)` / `release(tie = true)` /
`drop()` (tests), `tie(a, b, point?)` (tests; no caps, no mana), `snip(body)`, `assemblyOf(body)`, `caps()`, `ties`,
`stats()`. Events: `'craft:mode' { mode }`, `'craft:grab' { body, parts }`, `'craft:release' { tied }`,
`'craft:tie' { body, n, parts }`, `'craft:snip' { body, n }`, `'craft:sail' { body, push }`. `G.physics.bodyOf(collider)`
is new (the PhysBody that owns a Rapier collider).
