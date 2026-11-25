import * as THREE from 'three';
import { G } from '../core/game.js';
import { createActor, makeActorShadowBlob } from '../actors/rig.js';
import { journeyWand } from '../actors/journey-props.js';
import { createBroom } from '../player/broom.js';
import { setJourneyAccessories } from '../actors/journey-accessories.js';
import { CAST_ASSETS as assets } from '../data/journey-cast.js';   // also read by core/assets.js (load order)
const vector = new THREE.Vector3();
export function createCast(story) {
  const list = Object.entries(assets).map(([id, asset]) => ({
    id,
    asset,
    pos: new THREE.Vector3(),
    anchor: null,
    actor: null,
    broom: null,
    shadow: null,
    loading: false,
  }));
  const byId = Object.fromEntries(list.map((n) => [n.id, n]));
  function homes(step) {
    const active = G.quests?.trackedId();
    const enrolled = ['invitation', 'storm', 'honest', 'practice', 'duel', 'invest'].includes(step);
    return {
      mother: step === 'promise' ? 'farewell' : 'home',
      father: step === 'promise' ? 'farewell' : 'home',
      exam: 'townWitch',
      fran: story.spar?.memory
        ? 'franTrial'
        : step === 'promise'
          ? 'franTrial'
          : active === 'apprentice' && enrolled
            ? step === 'invitation'
              ? 'franLesson'
              : 'franTrial'
            : 'franDoor',
      innkeeper: 'shop',
      saya:
        active === 'apprentice'
          ? null
          : {
              collision: 'roof',
              repair: 'roof',
              inquire: 'innDesk',
              lodge: 'innDesk',
              teach: 'practice',
              course: 'practice',
              praise: 'practice',
              clue: 'innRoom',
              return: 'innRoom',
              hat: 'innRoom',
              depart: 'gate',
            }[step] || (active ? null : 'gate'),
    };
  }
  function locate(n, anchor) {
    n.anchor = anchor;
    n.air = false;
    if (!anchor) return;
    standPoint(n.id, anchor, n.pos);
  }
  // Where an NPC stands at an anchor. A point moved aside from the anchor is set down on the surface under it (a step
  // of the roof, a slope of the land) instead of keeping the anchor's height.
  function standPoint(id, anchor, out = new THREE.Vector3()) {
    out.copy(story.anchor(anchor));
    const x = out.x,
      y = out.y,
      z = out.z;
    if (id === 'father') {
      out.x += anchor === 'home' ? 2.3 : 1.75;
      out.z -= 0.65;
    }
    if (id === 'mother' && anchor === 'home') {
      out.x -= 2.5;
      out.z += 0.9;
    }
    if (id === 'saya' && anchor === 'innDesk') out.x += 1;
    // on the flat ridge of the accident roof, north of the broken patch, looking down at it (anchor face 0 = south)
    if (id === 'saya' && anchor === 'roof') out.z -= 2.3;
    if (id === 'fran' && anchor === 'franTrial') {
      out.x += 3;
      out.z -= 1;
    }
    if (out.x !== x || out.z !== z) out.y = G.world.groundAt(out.x, out.z, y + 0.75);
    return out;
  }
  function spawn(n) {
    if (n.actor || n.loading || !G.assets.info(n.asset)) return;
    if (!G.assets.ready(n.asset)) {
      n.loading = true;
      G.assets.load(n.asset).finally(() => {
        n.loading = false;
      });
      return;
    }
    const rig = createActor(n.asset, { castShadow: true, animLod: true, fidgets: true });
    n.actor = rig;
    rig.group.name = 'journey:' + n.id;
    G.scene.add(rig.group);
    rig.group.position.copy(n.pos);
    rig.play('idle');
    if (n.id === 'fran') {
      n.wand = journeyWand();
      rig.attach(n.wand, 'handR', { pos: [-0.075, -0.025, 0], rot: [Math.PI / 2, 0, -0.25] });
    }
    n.shadow = makeActorShadowBlob(0.39, 0.3);
    G.scene.add(n.shadow);
    if (n.id === 'saya' || n.id === 'fran') n.broom = createBroom({}, { tilt: rig.group, rig }).holder;
    if (n.id === 'saya') setJourneyAccessories(rig, { hat: !!G.state.flags.majo_saya_hat });
  }
  function erase(n) {
    if (!n.actor) return;
    n.actor.group.removeFromParent();
    n.actor.dispose();
    n.actor = null;
    n.wand = null;
    n.broom = null;
    n.shadow.removeFromParent();
    n.shadow.geometry.dispose();
    n.shadow.material.dispose();
    n.shadow = null;
  }
  let lastTag = '';
  function stage(force = false) {
    const step = story.current()?.id || 'free';
    const tag = (G.quests?.trackedId() || 'free') + '/' + step;
    if (force || tag !== lastTag) {
      lastTag = tag;
      const spots = homes(step);
      for (const n of list) locate(n, spots[n.id]);
    }
  }
  function airPose(id, place, yaw, airborne) {
    const n = byId[id];
    if (!n?.anchor) return;
    n.pos.copy(place);
    n.yaw = yaw;
    n.air = airborne;
  }
  function update(dt) {
    stage();
    const p = G.player.pos;
    for (const n of list) {
      const distance = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      if (!n.anchor || distance > 165) {
        erase(n);
        continue;
      }
      if (distance < 140 && !n.actor) spawn(n);
      const rig = n.actor;
      if (!rig) continue;
      const airborne = !!n.air;
      if (n.broom && n.broom.visible !== airborne) {
        n.broom.visible = airborne;
        rig.travellerSeat = airborne ? n.broom : null;
        rig.play(airborne ? 'sit_broom' : 'idle');
      }
      rig.group.position.copy(n.pos);
      const dx = p.x - n.pos.x,
        dz = p.z - n.pos.z;
      const yaw = airborne
        ? n.yaw
        : distance < 7
          ? Math.atan2(dx, dz)
          : G.world.ANCHORS[n.anchor]?.face || 0;
      rig.group.rotation.y +=
        Math.atan2(Math.sin(yaw - rig.group.rotation.y), Math.cos(yaw - rig.group.rotation.y)) *
        Math.min(1, dt * 8);
      rig.lookAt?.(!airborne && distance < 7 ? vector.copy(p).addScaledVector(G.scene.up, 1.45) : null);
      n.shadow.visible = !airborne;
      n.shadow.position.copy(n.pos);
      n.shadow.position.y += 0.018;
      rig.update(dt);
    }
  }
  // roadside travellers (gameplay/errands.js) speak through the same dialogue: unknown ids are asked there
  const extra = (id) => (byId[id] ? null : G.errands?.npc?.(id) || null);
  return {
    list,
    stage,
    update,
    airPose,
    standPoint,
    get: (id) => byId[id],
    actor: (id) => byId[id]?.actor ?? extra(id)?.actor ?? null,
    isPresent: (id) => !!(byId[id]?.actor ?? extra(id)?.actor),
    posOf: (id, out) => (byId[id] ? (byId[id].anchor ? out.copy(byId[id].pos) : null) : extra(id)?.posOf(out) ?? null),
    nameOf: (id) => (byId[id] ? undefined : G.errands?.nameOf?.(id)),
    beginTalk() {},
    endTalk() {},
    gesture(id, name) {
      (byId[id]?.actor ?? extra(id)?.actor)?.play(name, { restart: true });
    },
    speaking(id, on, text) {
      const a = byId[id]?.actor ?? extra(id)?.actor;
      if (a) {
        if (on) a.say(text);
        else a.speaking = false;
      }
    },
    accessories() {
      const flags = G.state?.flags || {};
      if (G.player?.rig) setJourneyAccessories(G.player.rig, { brooch: !!flags.majo_brooch });
      if (byId.saya.actor) setJourneyAccessories(byId.saya.actor, { hat: !!flags.majo_saya_hat });
    },
  };
}
