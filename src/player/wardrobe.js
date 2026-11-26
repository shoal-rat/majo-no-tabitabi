// Elaina's wardrobe at runtime (docs/api/heroine.md "Wardrobe (journey)"): G.player.outfit / G.player.setOutfit(id).
// Which outfit the story or the player chooses, and when, is src/data/outfits.js (storyOutfit / journeyOutfit).
// A change loads the other outfit's model on demand while the old one stays on screen, waits while a cutscene, a ceremony
// or an art's close-up owns her, then — inside one player update, before anything draws — builds the new rig, hands it
// everything the old rig held (rig.adopt: clips + times, face, look-at, hand IK, the props attached to her bones: her
// wand, wings), poses it, resets the spring chains to that pose, puts it where the old one was and frees the old one.
// Petals and light motes and a soft cloth / sparkle sound cover the frame of the change. There is never a frame without
// her, never a T-pose (a placeholder model is refused) and never the base figure alone (no such asset is in the table).
// Bad networks (players reported a capsule heroine and clothes that would not change): a rig built from the stand-in
// while her model was missing is swapped for the real one the moment it is in, through this same swap; the story's
// choice of clothes is asked for again until it arrives; the player's choice that cannot be had resolves false and
// W.failed names it (the 衣装 page says so); choosing it again tries again (the asset store never caches a failure).
import { setJourneyAccessories } from '../actors/journey-accessories.js';
import { G } from '../core/game.js';
import { OUTFITS, DEFAULT_OUTFIT, outfitById, journeyOutfit } from '../data/outfits.js';

const valid = (id) => !!outfitById(id);
/** The outfit she wears when the game opens: ?outfit=, else what the stored save loads in (journeyOutfit). */
export function initialOutfit() {
  const p = String(G.params?.outfit || '');
  if (valid(p)) return p;
  let s = null;
  try { s = G.save?.peek?.(); } catch (e) { s = null; }
  return journeyOutfit(s);
}
/** Manifest id of an outfit's model (the developer switch wins). */
export function assetOf(id) { return (outfitById(id) || outfitById(DEFAULT_OUTFIT)).asset; }

/** Is she owned by something that must not see a change of clothes (cutscene, ending, a learn ceremony, an art close-up)? */
export function heroineOwned() {
  if (G.mode === 'cutscene' || G.mode === 'ending') return true;
  if (G.story?.cut?.active) return true;
  if (G.cam?.cinematicActive && !G.dialogue?.active && G.mode !== 'talk') return true;   // an art's close-up (dialogue shots use the camera too)
  if (G.ui?.ceremonyActive > 0) return true;
  return false;
}

/**
 * @param P the player; S its private state (S.rig, S.tilt)
 * @param o { opts: createActor options, create: createActor, setRig(rig): store the new rig everywhere the player keeps it, outfit }
 */
export function createWardrobe(P, S, o) {
  let worn = o.outfit;            // what she wears (and the save stores)
  let want = null;                // { id, quiet, resolve[] } — a change waiting for its model / for the owner to let go
  let flourishDue = false;        // a change made behind the pause scroll shows its petals when play resumes
  const W = {
    get outfit() { return worn; },
    get pending() { return want ? want.id : null; },
    /** swaps done (tests) */
    swaps: 0,
    /** heals done: stand-in rigs replaced by her real model (tests) */
    heals: 0,
    /** id of the outfit the player last chose whose model could not be had (null once one arrives) */
    failed: null,
    list: OUTFITS,
    /** Change her clothes. Resolves true once she wears it (false for an unknown id / a model that failed to load). */
    set(id, { quiet = false } = {}) {
      if (!valid(id)) return Promise.resolve(false);
      if (id === worn && !want) return Promise.resolve(true);
      if (want && want.id === id) { if (!quiet) want.quiet = false; return new Promise((r) => want.resolve.push(r)); }
      if (want) for (const r of want.resolve) r(false);
      if (id === worn) { want = null; return Promise.resolve(true); }      // changed back before the other one arrived
      want = { id, quiet, resolve: [], asset: assetOf(id), loading: null, failed: false };
      const w = want;
      const p = new Promise((r) => w.resolve.push(r));
      w.loading = Promise.resolve(G.assets?.load?.(w.asset)).then((g) => { if (!g) w.failed = true; }, () => { w.failed = true; });
      return p;
    },
    /** Called first thing in every player update. */
    tick() {
      if (flourishDue && G.mode === 'play') { flourishDue = false; flourish(); }
      const w = want;
      if (!w) {
        // self-healing: still the stand-in (her model was lost at boot) → the real one as soon as it is in
        if (S.rig?.placeholder) { const a = assetOf(worn); if (G.assets?.want?.(a) && !heroineOwned()) swap({ id: worn, quiet: false, resolve: [], asset: a, heal: true }); }
        return;
      }
      if (w.failed) {
        if (w.quiet) { w.failed = false; w.loading = Promise.resolve(G.assets?.load?.(w.asset)).then((g) => { if (!g) w.failed = true; }, () => { w.failed = true; }); return; }   // the story's outfit: keep asking
        console.warn('[wardrobe] outfit model could not be loaded:', w.asset);
        W.failed = w.id; want = null; for (const r of w.resolve) r(false); return;
      }
      if (heroineOwned()) return;
      // want(): keeps a load going (phones let an outfit she took off go after a while: core/assets.js MOB)
      if (!G.assets?.want?.(w.asset)) {
        // still the stand-in while the wanted outfit keeps her waiting: the one she wears first, if that is in
        if (S.rig?.placeholder && G.assets?.want?.(assetOf(worn))) swap({ id: worn, quiet: true, resolve: [], asset: assetOf(worn), heal: true });
        return;
      }
      swap(w);
    },
  };

  function finish(w, ok) {
    if (ok) { worn = w.id; W.failed = null; }
    if (want === w) want = null;
    if (ok && G.state) G.state.outfit = worn;
    for (const r of w.resolve) r(ok);
    if (ok) G.events?.emit?.('player:outfit', { id: worn });
  }

  function swap(w) {
    const old = S.rig;
    const rig = o.create(w.asset, o.opts);
    if (!rig || rig.model.userData.placeholder) { rig?.dispose?.(); finish(w, false); return; }
    rig.adopt(old);
    setJourneyAccessories(rig,{brooch:!!G.state?.flags?.majo_brooch});
    // same place: the rig's group sits in the tilt group; the model carries the pelvis offset of the foot IK
    rig.group.position.copy(old.group.position); rig.group.quaternion.copy(old.group.quaternion); rig.group.scale.copy(old.group.scale);
    rig.model.position.copy(old.model.position);
    rig.group.visible = old.group.visible;
    old.group.parent.add(rig.group);
    rig.update(0);                 // pose it at the carried clip times (dt 0: nothing advances)
    rig.resetSprings();            // the chains start from that pose on the next step, no snap from the rest pose
    o.setRig(rig);
    old.dispose();                 // removes its group; per-instance skeletons freed (geometry / materials are the asset cache's)
    W.swaps++;
    if (w.heal) W.heals++;
    finish(w, true);
    if (!w.quiet) { if (G.mode === 'play') flourish(); else flourishDue = true; }
  }

  function flourish() {
    try {
      const v = P.pos.clone(); v.y += 1.0;
      G.fx?.burst?.('petals', v, { scale: 0.7, count: 0.8 });
      G.fx?.burst?.('heal', v, { scale: 0.8, count: 0.7 });
    } catch (e) { /* optional */ }
    try { G.audio?.sfx?.('cloth', { pos: P.pos, vol: 0.8 }); G.audio?.sfx?.('sparkle', { pos: P.pos, vol: 0.45 }); } catch (e) { /* optional */ }
  }

  return W;
}
