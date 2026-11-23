// The first two episodes of 魔女之旅. Quest steps and their counters live in the ordinary save.
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { createDialogue } from './dialogue.js';
import { createQuests } from './quests.js';
import { makeQuests } from './questdefs.js';
import { createCast } from './episode-cast.js';
import { createScenes } from './episode-scenes.js';
import { createFranMeteor } from './fran-meteor.js';
import { createFranSpar } from './fran-spar.js';
import { storyOutfit, outfitById } from '../data/outfits.js';

const S = {
  busy: false,
  session: 0,
  anchor(id) {
    return G.world.anchor(id).clone();
  },
  near(p, r) {
    const q = G.player?.pos;
    return !!q && Math.hypot(q.x - p.x, q.z - p.z) < r;
  },
  save() {
    if (G.started && !G.save?.disabled) G.save.write(true);
  },
  vars() {
    return G.state?.quests?.[G.quests?.trackedId()]?.vars;
  },
  current() {
    const id = G.quests?.trackedId();
    return id ? G.quests.defs[id].steps[G.quests.stepIndex(id)] : null;
  },
  target(step) {
    if (step.id === 'practice') return S.scenes.starPos(S.vars()?.stars || 0);
    if (step.id === 'course') return S.scenes.hoopPos(S.vars()?.rings || 0);
    if (step.npc) {
      const n = S.npcs?.get(step.npc);
      if (n?.anchor === step.anchor) return n.pos.clone();
    }
    return S.anchor(step.anchor);
  },
  resolveTargets(target, c) {
    return target(c);
  },
  grant(g) {
    if (!g) return;
    const state = G.state;
    for (const [id, n] of Object.entries(g.spells || {}))
      state.spells[id] = Math.max(n, state.spells[id] || 0);
    Object.assign(state.abilities, g.abilities);
    for (const f of g.flags || []) state.flags[f] = true;
    if (g.flags?.includes('majo_named')) syncOutfit();
    if (state.spells.wind && !state.selectedSpell) state.selectedSpell = 'wind';
    S.npcs?.accessories();
  },
  chapter() {
    return G.quests?.isDone('apprentice') ? (G.quests?.isDone('mages') ? 2 : 1) : 0;
  },
  async crash(c) {
    if (S.busy) return;
    S.busy = true;
    const session = S.session;
    try {
      await syncOutfit();   // wardrobe: the cutscene shows her in the story's clothes
      if (session !== S.session) return;
      await S.scenes.crash();
      if (session !== S.session) return;
      await G.dialogue.play('collision', { npc: 'saya' });
      if (session === S.session && G.quests.at(c.id, 'collision')) {
        G.state.flags.majo_brooch = false;
        S.npcs.accessories();
        G.quests.advance(c.id);
      }
    } catch (e) {
      G.reportError('story:collision', e);
    } finally {
      if (S.session === session) S.busy = false;
    }
  },
};
async function interact() {
  const step = S.current(),
    quest = G.quests.trackedId(),
    session = S.session;
  if (S.busy || !step || G.mode !== 'play') return;
  S.busy = true;
  try {
    const checkpoint = () => session === S.session && S.current() === step;
    await syncOutfit();   // wardrobe: a story beat is played in the story's clothes
    if (!checkpoint()) return;
    if (step.id === 'repair') {
      await S.scenes.repair();
      if (!checkpoint()) return;
      G.state.flags.majo_repaired = true;
      G.structures?.places?.accidentRoof?.setRepaired?.(true);
    } else {
      if (step.action === 'object') G.player.playAction?.('interact', { face: S.target(step) });
      if (step.id === 'hat') G.player.playAction?.('give', { face: S.target(step) });
      await G.dialogue.play(
        step.id === 'invest' && S.vars()?.franResult !== 'break' ? 'investHeld' : step.id,
        { npc: step.npc },
      );
      if (!checkpoint()) return;
      if (step.id === 'honest') await G.dialogue.play('year', { cam: false });
      if (!checkpoint()) return;
      S.grant(step.grant);
      if (step.id === 'honest') G.state.selectedSpell = 'wind';
      if (step.id === 'invest') G.ui?.banner?.(t('story.ui.title'), t('story.ui.badge'));
      if (step.id === 'hat') G.ui?.toast?.(t('story.ui.gift'), { icon: 'item' });
    }
    step.after?.();
    G.quests.advance(quest);
  } catch (e) {
    G.reportError('story:' + step.id, e);
  } finally {
    if (session === S.session) S.busy = false;
  }
}
// Until both episodes are done the story chooses her clothes (src/data/outfits.js storyOutfit): on load, at her naming
// and before every story beat (a quest dialogue, the roof collision). Afterwards the player's choice is never overridden.
// The developer switch ?outfit= wins. Resolves once she wears it (at once when she already does).
function syncOutfit() {
  const outfit = storyOutfit(G.state);
  if (!outfit || outfitById(G.params?.outfit)) return Promise.resolve(true);
  return Promise.resolve(G.player?.setOutfit?.(outfit, { quiet: true }));
}
function applyWorld() {
  syncOutfit();
  G.structures?.places?.accidentRoof?.setRepaired?.(!!G.state.flags.majo_repaired);
  S.npcs.stage(true);
  S.npcs.accessories();
}
function mapMarkers() {
  return G.quests.active().flatMap((id) =>
    G.quests.targets(id).map((p) => ({
      x: p.x,
      z: p.z,
      icon: 'main',
      kind: 'quest',
      label: t('story.quests.' + id + '.title'),
    })),
  );
}
const journalNotes = [
  'majo_trial_lake',
  'majo_named',
  'journey_eclipse_peak',
  'majo_repaired',
  'majo_saya_hat',
  'majo_finished',
];
export const storySystem = {
  name: 'story',
  pausable: true,
  init() {
    G.story = S;
    G.dialogue = createDialogue(S);
    G.quests = createQuests(S, makeQuests(S));
    G.npcs = S.npcs = createCast(S);
    S.spar = createFranSpar(S);
    S.finale = createFranMeteor(S);
    S.scenes = createScenes(S);
    G.quests.bind();
    G.events.on('player:outfit', () => S.npcs.accessories());
    G.interact.add({
      getPos: (out) => out.copy(S.anchor('franTrial')),
      radius: 4.0,
      priority: 5,
      enabled: () => G.quests.isDone('mages') && !S.spar.active && !G.dialogue.active,
      prompt: () => t('story.spar.replay'),
      onInteract: () => {
        S.spar.start(false);
        S.npcs.stage(true);
      },
    });
    G.interact.add({
      getPos(out) {
        const s = S.current();
        return s?.action ? out.copy(S.target(s)) : null;
      },
      radius: 3.5,
      priority: 8,
      broom: true,
      enabled() {
        return !S.busy && !G.dialogue.active && !!S.current()?.action;
      },
      prompt() {
        const s = S.current();
        return s?.prompt
          ? t('story.prompt.' + s.prompt)
          : t('story.prompt.talkTo', { name: t('story.name.' + s.npc) });
      },
      onInteract: interact,
    });
    for (const [id, script] of [
      ['mother', 'idleMother'],
      ['fran', 'idleFran'],
      ['saya', 'idleSaya'],
    ]) {
      G.interact.add({
        getPos: (out) => G.npcs.posOf(id, out),
        radius: 2.5,
        priority: 1,
        enabled: () =>
          G.quests.isDone('mages') &&
          !S.busy &&
          !G.dialogue.active &&
          G.npcs.isPresent(id) &&
          !S.spar.active,
        prompt: () => t('story.prompt.talkTo', { name: t('story.name.' + id) }),
        onInteract: () => G.dialogue.play(script, { npc: id }),
      });
    }
    S.debug = () => ({
      active: G.quests.trackedId(),
      step: S.current()?.id || 'free',
      chapter: S.chapter(),
      progress: { ...S.vars() },
      busy: S.busy,
    });
  },
  start() {
    S.session++;
    S.busy = false;
    S.spar.reset();
    S.finale.reset();
    G.state.story ||= {};
    G.state.quests ||= {};
    // The lake objective is new at the start of episode two. Old saves further
    // along in the city keep their exact objective; the past landscape is restored.
    if (!G.state.story.trialLakeEdition) {
      const prior = G.state.quests.mages;
      if (prior && (prior.step > 0 || prior.state === 'done')) prior.step++;
      if (G.state.flags.majo_named && !G.state.flags.majo_trial_lake) {
        G.state.flags.majo_trial_lake = true;
        G.world.setTrialLake(true);
      }
      G.state.story.trialLakeEdition = 1;
    }
    // the invest grant (thunder and earth, small forms) for saves named before Fran taught them. Levels are never
    // lowered: a save that already holds charged forms keeps them; new ones come from the page trials.
    if (G.state.flags.majo_named) for (const id of ['earth', 'thunder']) G.state.spells[id] = Math.max(1, G.state.spells[id] || 0);
    if (!G.state.quests.apprentice) G.quests.start('apprentice', { silent: true });
    if (G.quests.isDone('apprentice') && !G.state.quests.mages) G.quests.start('mages', { silent: true });
    if (G.ui?.providers) {
      G.ui.providers.journal = () => G.quests.journal();
      G.ui.providers.mapMarkers = () => mapMarkers().concat(G.travelNotes?.markers() || [], G.wilds?.markers?.() || [], G.errands?.markers?.() || []);
      G.ui.providers.lore = () =>
        journalNotes
          .filter((id) => G.state.flags[id])
          .map((id) => ({
            id,
            title: t('story.notes.' + id + '.title'),
            text: t('story.notes.' + id + '.text'),
          }))
          .concat(G.travelNotes?.journal() || [], G.wilds?.pages?.notes?.() || []);
    }
    G.quests.restoreAll();
    applyWorld();
    S.scenes.reset(S.current()?.id || '');
  },
  update(dt) {
    if (!G.started) return;
    S.npcs.update(dt);
    S.scenes.update(dt);
    S.spar.tick(dt);
    S.finale.tick(dt);
    G.quests.update(dt);
  },
};
