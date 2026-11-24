// Craft in the journey (docs/JOURNEY.md §5 "Movement and craft", docs/api/craft.md "Integration round"):
//   learning — LEARN rules (data/craft.js) teach the star thread after Fran's chores and the back-light after the roof
//              tiles are mended; old saves past the beat learn on load. The reveal is the story's banner (non-blocking).
//   lessons  — first-use beats on the journal's notes (G.onboarding, src/gameplay/onboarding.js): catch a part, tie it,
//              sail, restore; each card waits for a quiet moment and is ticked off by the craft event that proves it.
//   sites    — SITES: a woodpile beside Fran's cottage for the first lesson, broken lantern posts along the road to mend
//              with the back-light (each one gives a stamina level). State: G.state.craft { sites }.
import * as THREE from 'three';
import { t } from '../core/i18n.js';
import { LEARN, BEATS, SITES } from '../data/craft.js';
import { addItem } from '../core/save.js';

const _v = new THREE.Vector3();

export function createLessons(G, craft) {
  const L = { learnT: 0, siteT: 0, spawned: new Set(), broken: new Map(), told: new Set(), near: { part: false, sail: false, damage: false }, nearT: 0 };
  const C = () => G.state?.craft || (G.state ? (G.state.craft = { sites: {} }) : null);

  // ---- learning -------------------------------------------------------------------------------------------------------
  const stepDone = (q, step) => !!G.quests?.passed?.(q, step);
  function checkLearn(quiet) {
    for (const r of LEARN) {
      if (G.state?.abilities?.[r.art] || !stepDone(r.after.quest, r.after.step)) continue;
      craft.learn(r.art, { silent: true });
      // a save already past the beat (loaded): no ceremony, a line saying so; the beats teach it when she is free
      if (quiet) { G.ui?.toast?.(t('craft.learned', { name: t('craft.art.' + r.art + '.name') }), { dur: 3 }); continue; }
      // the story's own banner (not the modal spell ceremony: the story goes straight on to the next beat with Fran /
      // on the roofs, and a modal there would stop it); the journal's card then teaches it by doing
      G.ui?.banner?.(t('craft.banner'), t('craft.art.' + r.art + '.name'));
      G.ui?.toast?.(t('craft.art.' + r.art + '.desc'), { dur: 6 });
    }
  }

  // ---- first-use beats (the journal's notes) ---------------------------------------------------------------------------
  // their moments: something to catch / a sail / something damaged near her (scanned twice a second)
  const ctxOf = {
    catch: () => craft.knows('thread') && L.near.part && !craft.busy,
    tie: () => !!craft.holding,
    sail: () => craft.knows('thread') && L.near.sail,
    rewind: () => craft.knows('rewind') && L.near.damage && !craft.busy,
  };
  for (const b of BEATS) {
    try { G.onboarding?.add?.({ id: 'craft_' + b.id, ctx: ctxOf[b.id] || (() => false), ev: b.ev, max: b.max, after: b.after?.map((x) => 'craft_' + x), calm: true, key: 'craft.tips.' + b.id }); } catch (e) { G.reportError('craft:beats', e); }
  }
  function scanNear() {
    const P = G.player;
    if (!P) return;
    const props = G.props?.near?.(P.pos, 14) || [];
    L.near.part = props.some((p) => p.alive && craft.PARTS[p.type] && p.type !== 'sail');
    L.near.sail = props.some((p) => p.alive && p.type === 'sail');
    L.near.damage = (G.flora?.wreck?.near?.(P.pos.x, P.pos.z, 25)?.length || 0) > 0 || (craft.rewind?.R.sites || []).some((r) => Math.hypot(r.x - P.pos.x, r.z - P.pos.z) < 25);
  }

  // ---- sites ---------------------------------------------------------------------------------------------------------------
  function siteSpot(s, out) {
    const W = G.world;
    let x = s.x, z = s.z;
    // never on the road, in water or against something solid (a stone, a wall, a trunk): step off toward open ground.
    // The art branches keep re-sculpting the countryside, so this asks the colliders instead of trusting the row.
    const solid = (c) => c.box || c.r >= 0.7;
    const blocked = (x, z) => W.roadDist(x, z) < 3.5 || W.isWater(x, z) || W.collidersNear(x, z, 2.6, (c) => solid(c) && (c.box ? true : Math.hypot(c.x - x, c.z - z) < c.r + 2.4));
    for (let k = 0; k < 12 && blocked(x, z); k++) { const a = k * 2.4; x = s.x + Math.cos(a) * (2 + k); z = s.z + Math.sin(a) * (2 + k); }
    return out.set(x, W.groundAt(x, z), z);
  }
  function updateSites(dt) {
    const P = G.player, c = C();
    if (!P || !c || (L.siteT -= dt) > 0) return;
    L.siteT = 1;
    for (const s of SITES) {
      const d = Math.hypot(P.pos.x - s.x, P.pos.z - s.z);
      if (s.kind === 'woodpile') {
        // the parts appear while she is near and the thread is hers (nothing is saved: logs are physics)
        if (d < 70 && craft.knows('thread') && !L.spawned.has(s.id) && G.props?.spawn) {
          L.spawned.add(s.id);
          siteSpot(s, _v);
          for (const [type, dx, dz, yaw] of s.parts) {
            const x = _v.x + dx, z = _v.z + dz;
            G.props.spawn(type, new THREE.Vector3(x, G.world.groundAt(x, z) + 0.45, z), { rot: yaw, sleep: true });
          }
        } else if (d > 160) L.spawned.delete(s.id);
      } else if (s.kind === 'mend') {
        if (c.sites[s.id]) continue;
        // a broken post the back-light can find: a remembered break at its foot, with a few stones lying about
        if (d < 120 && !L.broken.has(s.id)) {
          siteSpot(s, _v);
          const rec = craft.rewind?.remember?.({ type: s.type, x: _v.x, y: _v.y + 1.1, z: _v.z, quat: null, site: s.id });
          if (rec) L.broken.set(s.id, rec);
          G.props?.debris?.('rock', _v.setY(_v.y + 0.3), new THREE.Vector3(0, 0.5, 0), { scale: 0.9, life: 999 });
        }
        if (d < 22 && !L.told.has(s.id)) { L.told.add(s.id); G.ui?.toast?.(t('craft.site.mend'), { dur: 3 }); }
      }
    }
  }
  G.events.on('craft:restored', (e) => {
    const id = e?.rec?.site, c = C();
    if (!id || !c || c.sites[id]) return;
    const s = SITES.find((x) => x.id === id);
    c.sites[id] = 1;
    L.broken.delete(id);
    if (s?.reward?.stamina) G.gameplay?.applyUpgrade?.('stamina', s.reward.stamina);
    if (s?.reward?.stardust) addItem(G, 'stardust', s.reward.stardust);
    G.ui?.toast?.(t('craft.site.mended'), { dur: 3.5 });
    G.events.emit('craft:site', { id });
  });

  return {
    L,
    /** Called once a save is in place (load / new game): old saves past a beat learn quietly. */
    resync() { L.broken.clear(); L.told.clear(); checkLearn(true); },
    update(dt) {
      if ((L.learnT -= dt) <= 0) { L.learnT = 1; checkLearn(false); }
      if ((L.nearT -= dt) <= 0) { L.nearT = 0.5; scanNear(); }
      updateSites(dt);
    },
  };
}
