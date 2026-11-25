import * as THREE from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';
import { volley, starRain, seal, counterCast, incomingAt, bolt, EL_COL, ANSWER } from '../combat/patterns.js';
import { createSparLessons } from './spar-lessons.js';

// Fran uses the same elemental collision registry, projectile simulation and shield checks as the player.
// The persistent evaluation and the optional recollection share the fight, but record their outcomes separately.
//
// Three movements, each a cycle of rest -> windup (a chalk circle at her wand: read it) -> the spell -> opening:
//   0 读杖尖    single stardust bolts. Shield as one arrives and it flies back at her.
//   1 星尘乱舞  (hp <= 84 or 6 casts) on her broom, low: a fan of bullets, a star-fall bombardment, slow water
//               bubbles, a frost seal under your feet. Hitting her mid-windup with the answer to that spell scatters it.
//               She also meets your spells mid-air with the countering element.
//   2 流星掠空  (hp <= 36 or 12 casts) up in the air, circling the clearing: diving passes that rake the ground with
//               stardust, volleys from above. A gust of wind knocks her off the broom (a long opening); her landing
//               after a pass is always an opening.
// Outcomes are unchanged: 'break' (her hp to 0), 'yield' (the heroine is worn down to the floor), 'hold' (she weathered
// the whole performance).
//   3 星河终章  (the recollection only, hp <= 110 or 30 casts) still in the air: two or three spells chained back to back
//               (shorter wind-ups, no opening between them), then one short opening; she answers more of your spells.
// Two modes (MODES). story: the first bout of episode 1, gentle, and the lessons (spar-lessons.js) teach the combat
// systems inside it. recall: the recollection from the trial ground once the journey is done — the re-challenge: a
// fourth movement of combos, tighter openings that give less, more counter-casts and shields, her bolts at 0.8; it
// lasts a few minutes for a good duellist (spar-pacing probe). It also tests the tier-2 lessons (page-lessons.js): from
// the third movement every fourth spell is a beam (catch it with the guard and win the 对波: a long opening), her bolts
// reflect off a timed guard (弹反), and a fusion of two of the heroine's spells (合咏) throws her off her rhythm.
const MODES = {
  story: { max: 105, phaseAt: [Infinity, 70, 30], castAt: [Infinity, 6, 12], hold: 20, budget: [13, 14, 16], bonus: 5, dmg: 0.6,
    counter: 0.45, ccd: 3.2, gcd: 4, rest: 6, open: 1, windup: 1, last: 2 },
  recall: { max: 480, phaseAt: [Infinity, 380, 240, 110], castAt: [Infinity, 5, 16, 30], hold: 90, budget: [10, 11, 12, 10], bonus: 3, dmg: 0.8,
    counter: 0.65, ccd: 2.2, gcd: 2.6, rest: 3, open: 0.75, windup: 0.85, last: 3, beam: true, fusion: true },
};
const CYCLE = [['bolt'], ['fan', 'rain', 'bubbles', 'frost'], ['dive', 'volley', 'dive', 'rain'], [['fan', 'dive'], ['rain', 'volley', 'frost'], ['bubbles', 'dive', 'fan'], ['volley', 'rain']]];
const ANSWERS = { fan: ['wind'], rain: ['wind', 'earth'], bubbles: ['fire', 'thunder'], frost: ['fire'], dive: ['wind'], volley: ['wind', 'ice'] };

export function createFranSpar(S) {
  const circle = new THREE.Group(),
    aim = new THREE.Vector3(),
    base = new THREE.Vector3(),
    tmp = new THREE.Vector3(),
    tmp2 = new THREE.Vector3();
  circle.name = 'journey:fran-aim';
  const chalk = new THREE.MeshBasicMaterial({ color: 0xdfbc79 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.035, 6, 42), chalk);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.022, 6, 36), chalk);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.23),
    new THREE.MeshBasicMaterial({ color: 0xffecd0 }),
  );
  diamond.scale.y = 1.7;
  const ticks = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.02), chalk);
    const a = (i / 8) * Math.PI * 2;
    k.position.set(Math.cos(a) * 0.98, Math.sin(a) * 0.98, 0);
    k.rotation.z = a + Math.PI / 2;
    ticks.add(k);
  }
  circle.add(halo, inner, diamond, ticks);
  G.scene.add(circle);
  circle.visible = false;
  const colors = [0xe2b974, 0xb89de3, 0x9ed0dd];
  let duel = null,
    last = null,
    serial = 0;
  const lessons = createSparLessons(S);
  function safeSave() {
    if (duel?.story) S.save();
  }
  function standing(x, z) {
    return G.world.groundAt(x, z, G.world.heightAt(x, z) + 1.2);
  }
  /** Where she wants to be this frame (eased toward in tick). */
  function place(d, p, out) {
    const t = d.t;
    if (d.phase < 2 || d.tumble) {
      const side = Math.sin(t * 0.44) * 4.7,
        back = -4.4 - Math.cos(t * 0.37) * 2.2;
      out.copy(base).add(tmp2.set(side, 0, back));
      out.y = standing(out.x, out.z) + (d.phase === 1 && !d.tumble ? 2.1 + 0.36 * Math.sin(t * 1.7) : 0);
      if (d.tumble) out.copy(d.cur).setY(standing(d.cur.x, d.cur.z));
      return out;
    }
    if (d.dive) {
      const k = Math.min(1, d.dive.t / d.dive.dur);
      out.lerpVectors(d.dive.from, d.dive.to, k);
      out.y = standing(out.x, out.z) + 3.2 + Math.sin(k * Math.PI) * -1.4 + (1 - k) * 2.5 * (1 - k);
      return out;
    }
    if (d.stage === 'opening' && d.landed) {
      out.copy(d.landed);
      out.y = standing(out.x, out.z) + 1.3 + 0.2 * Math.sin(t * 2);
      return out;
    }
    // circling the clearing on her broom (the angle advances in tick); she sinks lower while she is open
    out.set(base.x + Math.cos(d.orbit) * 10, 0, base.z + Math.sin(d.orbit) * 10);
    out.y = standing(out.x, out.z) + (d.stage === 'opening' ? 3 : 6.2) + 1.2 * Math.sin(t * 1.3);
    return out;
  }
  function pose(d, dt) {
    const n = d.n, p = G.player;
    const want = place(d, p, tmp);
    const k = d.phase >= 2 && !d.dive ? 3.2 : d.dive ? 40 : 6;
    d.cur.lerp(want, Math.min(1, dt * k));
    const flying = d.phase >= 2 && !d.tumble;
    let yaw;
    if (flying && (d.dive || d.stage === 'rest')) {
      tmp2.subVectors(want, d.cur);
      yaw = tmp2.lengthSq() > 1e-4 ? Math.atan2(tmp2.x, tmp2.z) : d.yaw;
      if (d.dive) yaw = Math.atan2(d.dive.to.x - d.dive.from.x, d.dive.to.z - d.dive.from.z);
    } else yaw = Math.atan2(p.pos.x - d.cur.x, p.pos.z - d.cur.z);
    d.yaw = yaw;
    n.yaw = yaw;
    S.npcs.airPose('fran', d.cur, yaw, d.phase >= 1 && !d.tumble);
  }
  function caster(d) {
    if (!d.ctx)
      d.ctx = {
        owner: d.n,
        team: 'enemy',
        alive: () => duel === d,
        hand: (out) => wandTip(d, out),
        data: { franSpar: d.id },
        power: 0.7,
        dmgK: d.M.dmg,
        onShot: (p) => d.shots.add(p),
      };
    return d.ctx;
  }
  function wandTip(d, out) {
    const n = d.n;
    if (n.wand) {
      n.wand.updateWorldMatrix(true, false);
      out.set(0.009, 0.275, -0.003);
      n.wand.localToWorld(out);
      if (out.distanceToSquared(n.pos) < 9) return out;
    }
    return out.copy(n.pos).add(tmp2.set(Math.sin(d.yaw) * 0.6, 1.35, Math.cos(d.yaw) * 0.6));
  }
  function start(story) {
    if (duel || (story && !S.near(S.anchor('franTrial'), 19)) || G.mode !== 'play') return;
    const P = G.player,
      n = S.npcs.get('fran');
    if (!n) return;
    base.copy(S.anchor('franTrial'));
    const vars = story ? S.vars() : {};
    const log = (vars.franDuel ||= {
      hits: 0,
      fired: 0,
      blocked: 0,
      reflected: 0,
      dodged: 0,
      taken: 0,
      attempts: 0,
    });
    const M = story ? MODES.story : MODES.recall;
    const max = M.max;
    const hp = Math.max(0, max - (log.hits || 0));
    duel = {
      story,
      M,
      log,
      hp,
      max,
      n,
      t: 0,
      stage: 'rest',
      wait: 1.1,
      opening: 0,
      missile: 0,
      shots: new Set(),
      id: ++serial,
      phase: 0,
      step: 0,
      pattern: null,
      cur: n.pos.clone(),
      yaw: 0,
      orbit: 0,
      ccd: 2,
      gcd: 0,
      reflectT: -9,
      budget: 6,
      hpBefore: P.hp,
      manaBefore: P.mana,
      floor: P.damageFloor,
      onFloor: P.onDamageFloor,
      teamBefore: n.team,
    };
    const d = duel;
    // a resumed save starts in the movement it had reached
    while (d.phase < M.last && (d.hp <= M.phaseAt[d.phase + 1] || d.log.fired >= M.castAt[d.phase + 1])) d.phase++;
    n.team = 'enemy';
    n.height = 1.7;
    P.damageFloor = Math.max(1, Math.min(10, P.hp));
    P.onDamageFloor = () => {
      if (duel === d) d.exhausted = true;
    };
    d.reactor = G.elements?.register({
      owner: n,
      kind: 'creature',
      team: 'enemy',
      material: 'cloth',
      radius: 0.63,
      height: 1.85,
      living: true,
      getPos: () => n.pos,
      on: {
        hit(r, el, power, h) {
          if (duel !== d || h?.team !== 'player' || !h.source || d.hitLock > 0) return;
          hitFran(d, el, power, h);
        },
      },
    });
    if (!story) G.ui?.banner?.(t('story.spar.memory'), t('story.spar.memorySub'), { foe: true });
    if (lessons.wanted(story)) lessons.begin(d);
  }
  function hitFran(d, el, power, h) {
    const reflected = G.time.t - d.reflectT < 1.6;
    if (h.fusion && d.M.fusion && d.stage !== 'opening' && !d.tumble) fused(d);
    const open = d.stage === 'opening' || reflected;
    lessons.onHit(open);
    // the answer to the spell she is gathering scatters it: a long opening
    if (d.stage === 'windup' && d.pattern && (ANSWERS[d.pattern]?.includes(el) || reflected)) {
      breakCast(d, reflected ? 'reflected' : 'broken');
    }
    // a gust while she is up on the broom throws her off it
    else if (d.phase >= 2 && el === 'wind' && !d.tumble && d.stage !== 'opening') {
      tumble(d);
    }
    const raw = Math.max(1, Math.min(h.damage ?? power * 7, 22));
    // an opening is worth so much and no more: a master witch recovers her footing — the fight goes through its movements
    // outside an opening she bats spells aside: a graze (a little more for real elements than for magic bullets)
    const graze = el === 'sun' || !el ? 0.1 : 0.2;
    let amount = Math.round(raw * (open || d.stage === 'opening' ? 1 : graze));
    if (open || d.stage === 'opening') {
      if (reflected && !d.reflectPaid) { d.reflectPaid = true; d.budget += 6; }
      if (d.budget <= 0) amount = Math.round(raw * graze);
      else { amount = Math.min(amount, d.budget); d.budget -= amount; }
    }
    amount = Math.min(d.hp, Math.max(1, amount));
    const floor = lessons.minHp(d);   // a lesson still open in this movement: she does not fall past it yet
    d.hp = floor > 0 ? Math.max(Math.min(d.hp, floor), d.hp - amount) : Math.max(0, d.hp - amount);
    d.log.hits += amount;
    d.hitLock = 0.22;
    G.fx?.burst?.(
      open ? 'hit_wind' : 'summon',
      d.n.pos.clone().add(new THREE.Vector3(0, 1.15, 0)),
      { scale: 0.6, color: 0xebd2ab },
    );
    G.npcs.gesture('fran', open ? 'hit' : 'guard');
    safeSave();
  }
  // her own moments (the reflect, the won 对波) are callouts over her shoulder; the rest are words over Fran
  const SAY_CALL = { reflected: true, clashed: true };
  function say(key, color = '#ffe7a4') {
    const at = duel?.n.pos.clone().add(tmp2.set(0, 2.4, 0));
    if (at) G.fx?.text?.(at, t('combat.spar.' + key), SAY_CALL[key] ? { kind: 'call', color, dur: 1.2 } : { kind: 'word', target: duel.n, color, size: 1.0, dur: 1.4 });
  }
  function breakCast(d, key) {
    circle.visible = false;
    d.handle?.cancel?.();
    d.handle = null;
    d.stage = 'opening';
    d.wait = 2.6;
    d.budget = d.M.budget[d.phase] + d.M.bonus;
    d.chain = null;   // a scattered spell or a fall ends the combo too
    d.log.fired++;   // a scattered spell still counts as one she cast
    say(key);
    G.fx?.burst?.('clash_big', d.n.pos.clone().add(tmp2.set(0, 1.3, 0)), { color: 0xffe7a4, color2: 0xb89de3, scale: 0.7 });
    G.audio?.sfx?.('shatter_crystal', { pos: d.n.pos, vol: 0.7 });
    if (G.fx?.duel?.beat) G.fx.duel.beat('break', d.n.pos.clone().add(tmp2.set(0, 1.3, 0)), {});
    else G.hitstop?.(0.08);
    G.events.emit('spar:broken', { pattern: d.pattern });
    d.pattern = null;
  }
  /** she won the 对波 against Fran's beam: a long opening (the struggle's blast lands in it) */
  function clashed(d) {
    d.stage = 'opening';
    d.wait = 3.2;
    d.budget = d.M.budget[d.phase] + d.M.bonus + 4;
    d.chain = null;
    say('clashed');
  }
  /** a fusion of hers caught Fran: off her rhythm for a moment (the recollection) */
  function fused(d) {
    d.handle?.cancel?.();
    d.handle = null;
    circle.visible = false;
    d.stage = 'opening';
    d.wait = 2.2;
    d.budget = d.M.budget[d.phase] + d.M.bonus;
    d.chain = null;
    say('fused');
  }
  function tumble(d) {
    d.tumble = true;
    d.dive = null;
    d.handle?.cancel?.();
    circle.visible = false;
    d.stage = 'opening';
    d.wait = 2.8;
    d.budget = d.M.budget[d.phase] + d.M.bonus;
    d.chain = null;   // a scattered spell or a fall ends the combo too
    say('tumble');
    G.fx?.burst?.('hit_wind', d.n.pos.clone().add(tmp2.set(0, 1.2, 0)), { scale: 1.3 });
    G.fx?.starburst?.(d.n.pos.clone().add(tmp2.set(0, 1.2, 0)), { color: 0xe6fff2, radius: 2 });
    G.audio?.sfx?.('broom_dismiss', { pos: d.n.pos });
    G.events.emit('spar:tumble', {});
  }
  function stop(result, report = true) {
    const d = duel;
    if (!d) return;
    duel = null;
    lessons.close(report);
    circle.visible = false;
    d.handle?.cancel?.();
    if (d.guard) { try { d.guard.stop(); } catch (e) { /* */ } }
    if (d.reactor) G.elements?.unregister(d.reactor);
    for (const orb of d.shots) {
      if (orb.data?.franSpar !== d.id) continue;
      orb.damage = 0;
      orb.def = null;
      orb.life = orb.age;
    }
    d.shots.clear();
    d.n.team = d.teamBefore;
    const P = G.player;
    P.damageFloor = d.floor;
    P.onDamageFloor = d.onFloor;
    const a = S.anchor('franTrial');
    a.x += 3;
    a.z -= 1;
    S.npcs.airPose('fran', a, 0, false);
    G.ui?.bossBar?.(null);
    if (!report) return;
    last = { result, campaign: d.story, phase: d.phase, remaining: d.hp, ...d.log };
    P.hp = Math.min(P.maxHp, Math.max(P.hp, d.hpBefore));
    P.mana = Math.min(P.maxMana, Math.max(P.mana, d.manaBefore));
    G.events.emit('spar:end', { result, story: d.story, phase: d.phase });
    if (d.story) {
      const v = S.vars();
      if (v) {
        v.franResult = result;
        S.save();
      }
    } else {
      G.state.story.practiceBouts = (G.state.story.practiceBouts || 0) + 1;
      S.save();
      G.ui?.toast?.(t('story.spar.' + result), { icon: 'wind', dur: 3 });
      S.npcs.stage(true);
    }
  }
  function aimAtPlayer(d, color) {
    aim.copy(G.player.pos);
    aim.y += 0.95;
    circle.position.copy(wandTip(d, tmp));
    circle.lookAt(aim);
    circle.visible = true;
    chalk.color.setHex(color ?? colors[d.log.fired % 3]);
    G.npcs.gesture('fran', d.phase ? 'cast_raise' : 'cast_throw');
  }
  /** Phase 0: the single stardust bolt of the first lesson. */
  function launch(d, offset) {
    const start = wandTip(d, new THREE.Vector3());
    const dir = aim.clone().sub(start).normalize().applyAxisAngle(G.scene.up, offset);
    start.addScaledVector(dir, 0.3);
    const k = d.log.fired % 3,
      el = ['wind', 'ice', 'water'][k],
      color = colors[k];
    bolt(caster(d), start, dir, { el, shape: k === 1 ? 'lance' : 'orb', speed: d.phase ? 11 : 9, size: 0.36, radius: 0.28, damage: d.phase ? 9 : 11, power: 0.7, life: 2.5, turn: 0, splash: 0.55, color, trail: { color, width: 0.15, life: 0.3 }, spell: 'fran_stardust' });
    G.audio?.sfx?.('cast_' + el, { pos: start, vol: 0.45 });
  }
  // ---- the patterns: tell(d) at the start of the windup, fire(d) when it completes; windup / open in seconds ----
  const PAT = {
    bolt: { windup: (d) => (d.phase ? 0.83 : 1.24), open: (d) => (d.phase ? 1.8 : 1.55),
      tell: (d) => aimAtPlayer(d), fire: (d) => { launch(d, 0); if (d.phase) { launch(d, -0.23); launch(d, 0.23); } } },
    fan: { windup: () => 0.95, open: () => 1.8,
      tell: (d) => { aimAtPlayer(d, 0xe2b974); sigil(d, 0xe2b974, 0.95); },
      fire: (d) => { d.handle = volley(caster(d), G.player, { n: 5, fan: 0.62, gap: 0.07, el: 'sun', color: colors[d.step % 3], speed: 11.5, size: 0.34, damage: 9, power: 0.7, turn: 0.25, life: 3, spell: 'fran_stardust' }); } },
    rain: { windup: () => 1.0, open: () => 1.7,
      tell: (d) => { G.npcs.gesture('fran', 'cast_raise'); sigil(d, 0xffe9b0, 1.0); G.fx?.burst?.('charge_done', wandTip(d, tmp), { color: 0xffe9b0, scale: 1.1 }); },
      fire: (d) => { d.handle = starRain(caster(d), G.player.pos.clone(), { n: 7, radius: 4.2, delay: 1.0, gap: 0.12, damage: 10, el: 'sun', color: 0xffe9b0 }); } },
    bubbles: { windup: () => 0.9, open: () => 2.0,
      tell: (d) => { aimAtPlayer(d, 0x9ed0dd); sigil(d, EL_COL.water, 0.9); },
      fire: (d) => { d.handle = volley(caster(d), G.player, { n: 3, fan: 1.0, gap: 0.16, el: 'water', speed: 7, size: 0.55, damage: 9, power: 0.7, turn: 1.3, life: 5, splash: 1, spell: 'fran_stardust' }); } },
    frost: { windup: () => 0.8, open: () => 1.9,
      tell: (d) => { aimAtPlayer(d, 0xbfefff); },
      fire: (d) => {
        const c = caster(d);
        d.handle = seal(c, G.player.pos.clone(), { el: 'ice', radius: 1.9, delay: 1.25, damage: 11, answer: ['fire'] });
        volley(c, G.player, { n: 2, fan: 0.5, gap: 0.2, el: 'ice', shape: 'lance', speed: 16, size: 0.42, damage: 8, power: 0.7, turn: 0.1, delay: 0.35, spell: 'fran_stardust' });
      } },
    dive: { windup: () => 0.75, open: () => 2.2,
      tell: (d) => {
        // the line she will rake, marked on the ground
        const P = G.player.pos;
        const from = d.cur.clone(), dir = tmp.set(P.x - from.x, 0, P.z - from.z);
        const len = Math.max(4, dir.length());
        dir.divideScalar(len);
        const to = new THREE.Vector3(P.x + dir.x * 9, 0, P.z + dir.z * 9);
        if (to.distanceTo(base) > 20) to.sub(base).setLength(20).add(base);
        d.next = { from, to, dur: (len + 9) / 17, t: 0, drop: 0 };
        for (let k = 0; k <= 4; k++) {
          tmp2.lerpVectors(from, to, 0.3 + k * 0.15);
          tmp2.y = standing(tmp2.x, tmp2.z);
          G.fx?.ring?.(tmp2, { color: 0xffe9b0, radius: 1.5, dur: 0.75 + k * 0.1, intensity: 1.3 });
        }
        G.npcs.gesture('fran', 'cast_raise');
        G.audio?.sfx?.('broom_boost', { pos: d.n.pos, vol: 0.7 });
      },
      fire: (d) => { d.dive = d.next; d.next = null; } },
    beam: { windup: () => 1.3, open: () => 3,
      tell: (d) => { aimAtPlayer(d, 0xffe9b0); G.fx?.burst?.('charge_done', wandTip(d, tmp), { color: 0xffe9b0, scale: 1.5 }); G.audio?.sfx?.('charge', { pos: d.n.pos, vol: 0.9 }); },
      fire: (d) => {
        const from = wandTip(d, new THREE.Vector3());
        const dir = G.player.pos.clone().setY(G.player.pos.y + 1).sub(from).normalize();
        let b = null;
        try { b = G.spells?.cast('sun', 'big', { caster: d.n, team: 'enemy', origin: from, dir, target: G.player, power: 0.35, duration: 3.2, strength: 1.1 }) || null; } catch (e) { b = null; }
        d.handle = { cancel: () => { try { b?.stop?.(); } catch (e) { /* */ } } };
      } },
    volley: { windup: () => 0.8, open: () => 1.5,
      tell: (d) => { aimAtPlayer(d, 0xb89de3); },
      fire: (d) => { d.handle = volley(caster(d), G.player, { n: 6, fan: 0.85, gap: 0.06, el: 'sun', color: 0xb89de3, speed: 13, size: 0.32, damage: 9, power: 0.7, turn: 0.3, spell: 'fran_stardust' }); } },
  };
  function sigil(d, color, dur) {
    if (d.phase >= 2) return;
    const at = d.n.pos.clone();
    at.y = standing(at.x, at.z);
    G.fx?.sigil?.(at, { color, radius: 1.6, dur, intensity: 1.4 });
  }
  function nextPattern(d) {
    if (d.chain && d.chain.length) return d.chain.shift();
    if (d.M.beam && d.phase >= 2 && (d.beamN = (d.beamN || 0) + 1) % 4 === 0) return 'beam';
    const list = CYCLE[d.phase];
    const id = list[d.step % list.length];
    d.step++;
    // the last movement chains two or three spells back to back
    if (Array.isArray(id)) { d.chain = id.slice(1); return id[0]; }
    return id;
  }
  function tick(dt) {
    const id = S.current()?.id;
    if (!duel && id === 'duel' && !S.vars()?.franResult) start(true);
    const d = duel;
    if (!d) return;
    if (d.story && id !== 'duel') {
      stop('', false);
      return;
    }
    if (G.mode !== 'play') return;
    if (!S.near(base, 36)) {
      stop('left', false);
      S.npcs.stage(true);
      return;
    }
    d.t += dt;
    d.wait -= dt;
    d.hitLock = Math.max(0, (d.hitLock || 0) - dt);
    lessons.tick(dt);
    // a new movement begins at a rest, never in the middle of an opening or a chain (nor before its lessons are done)
    const M = d.M;
    if (d.stage === 'rest' && !(d.chain && d.chain.length) && d.phase < M.last && (d.hp <= M.phaseAt[d.phase + 1] || d.log.fired >= M.castAt[d.phase + 1]) && lessons.allows(d.phase + 1)) {
      d.phase++;
      d.step = 0;
      d.tumble = false;
      if (d.phase === 2) d.orbit = Math.atan2(d.cur.z - base.z, d.cur.x - base.x);
      G.ui?.toast?.(t(d.phase === 1 ? 'story.spar.phase' : d.phase === 2 ? 'combat.spar.air' : 'combat.spar.finale'), { icon: 'wind', dur: 3 });
      G.audio?.sfx?.(d.phase === 2 ? 'broom_summon' : 'charge', { pos: d.n.pos, vol: 0.8 });
      if (d.phase === 3) G.fx?.duel?.beat?.('break', d.n.pos.clone().add(tmp2.set(0, 1.3, 0)), {});
      G.events.emit('spar:phase', { phase: d.phase });
    }
    if (d.phase >= 2 && !d.dive && !d.tumble && d.stage !== 'opening') d.orbit += dt * (d.phase === 3 ? 0.95 : 0.75);
    // the dive: rake the ground under her with stardust, then land at the far end (an opening)
    if (d.dive) {
      const v = d.dive;
      v.t += dt;
      v.drop -= dt;
      if (v.drop <= 0 && v.t > v.dur * 0.15 && v.t < v.dur * 0.9) {
        v.drop = 0.13;
        const from = d.n.pos.clone(); from.y += 0.9;
        const down = tmp.set((v.to.x - v.from.x) * 0.02, -1, (v.to.z - v.from.z) * 0.02).normalize();
        bolt(caster(d), from, down.clone(), { el: 'sun', color: colors[(v.t * 10 | 0) % 3], speed: 18, size: 0.3, damage: 8, power: 0.7, turn: 0, life: 1.2, splash: 1.3, spell: 'fran_stardust' });
      }
      if (v.t >= v.dur) { d.landed = v.to.clone(); d.dive = null; d.wait = PAT.dive.open(d); }
    }
    pose(d, dt);
    // mid-air answers and a raised shield against a barrage (from the second movement, never while open)
    if (d.phase >= 1 && d.stage !== 'opening' && !d.tumble) {
      d.ccd -= dt;
      d.gcd -= dt;
      if (d.guard && (d.guardT -= dt) <= 0) { d.guard.stop?.(); d.guard = null; }
      if ((d.scanT = (d.scanT || 0) - dt) <= 0) {
        d.scanT = 0.15;
        const c = d.n.pos.clone(); c.y += 1.2;
        const inc = incomingAt(c, 12, 0.8);
        let barrage = 0;
        for (const p of G.spells?.projectiles || []) if (p.alive && p.team === 'player' && p.pos.distanceToSquared(c) < 144) barrage++;
        if (barrage >= 3 && d.gcd <= 0 && !d.guard) {
          d.gcd = d.M.gcd;
          d.n.dir = tmp2.set(Math.sin(d.yaw), 0, Math.cos(d.yaw)).clone();
          try { d.guard = G.spells?.cast('guard', 'small', { caster: d.n, team: 'enemy', dir: d.n.dir }) || null; } catch (e) { d.guard = null; }
          d.guardT = 1.2;
          G.npcs.gesture('fran', 'guard');
        } else if (inc && d.ccd <= 0 && ANSWER[inc.el] && Math.random() < d.M.counter) {
          d.ccd = d.M.ccd;
          const p = counterCast(caster(d), inc, { el: ANSWER[inc.el], power: 1.1, damage: 7 });
          if (p) d.shots.add(p);
          G.npcs.gesture('fran', 'cast_throw');
        }
      }
    } else if (d.guard) { d.guard.stop?.(); d.guard = null; }
    if (
      d.hp <= 0 ||
      d.exhausted ||
      (d.log.fired >= d.M.hold && d.log.attempts + d.log.dodged + d.log.blocked > 0)
    ) {
      stop(d.hp <= 0 ? 'break' : d.exhausted ? 'yield' : 'hold');
      return;
    }
    if (d.stage === 'windup') {
      circle.position.copy(wandTip(d, tmp));
      circle.lookAt(aim);
      const size = 1 + Math.max(0, d.wait) * 0.45;
      halo.scale.setScalar(size);
      inner.rotation.z -= dt * 3;
      ticks.rotation.z += dt * 2;
      diamond.rotation.y += dt * 5;
    }
    if (lessons.holds && d.stage === 'rest') d.wait = Math.max(d.wait, 0.2);   // a lesson has the stage: she waits
    if (d.wait <= 0 && !d.dive) {
      if (d.stage === 'rest') {
        d.pattern = nextPattern(d);
        const P = PAT[d.pattern];
        d.stage = 'windup';
        d.wait = P.windup(d) * d.M.windup * (d.phase === 3 ? 0.8 : 1);
        d.tumble = false;
        P.tell(d);
        if (d.pattern !== 'bolt') say(d.pattern, '#fff0c8');
      } else if (d.stage === 'windup') {
        circle.visible = false;
        PAT[d.pattern].fire(d);
        d.log.fired++;
        G.npcs.gesture('fran', 'cast_throw');
        if (d.pattern === 'beam') {
          // the beam runs ~3 s: no opening while it does (winning the struggle gives one, see clashed())
          d.stage = 'rest';
          d.budget = d.M.rest;
          d.wait = 3.4;
        } else if (d.chain && d.chain.length) {
          // a combo: straight on to the next spell, no opening in between
          d.stage = 'rest';
          d.budget = d.M.rest;
          d.wait = 0.35;
        } else {
          d.stage = 'opening';
          d.budget = d.M.budget[d.phase];
          d.wait = PAT[d.pattern].open(d) * d.M.open;
        }
        safeSave();
      } else {
        d.stage = 'rest';
        d.reflectPaid = false;
        d.budget = d.M.rest;   // a stray hit in a rest (a reflected bolt) still lands a little
        d.landed = null;
        d.tumble = false;
        d.wait = d.phase ? 0.7 : 1.0;
      }
    }
    d.hud = (d.hud || 0) - dt;
    if (d.hud <= 0) {
      d.hud = 0.14;
      G.ui?.bossBar?.({
        name: t('story.spar.name'),
        hp: d.hp,
        max: d.max,
        kind: 'duel',
        element: 'wind',
        sub: t('story.spar.' + (d.stage === 'opening' ? 'open' : d.stage === 'windup' ? 'read' : 'ready')),
      });
    }
  }
  G.events.on('spell:cast', (e) => {
    if (duel && e.caster === G.player && e.spell !== 'guard') duel.log.attempts++;
  });
  G.events.on('player:dodge', () => {
    if (duel && duel.stage !== 'rest') duel.log.dodged++;
  });
  G.events.on('beam:struggle', (e) => {
    if (duel && e.state === 'end' && e.winner === 'player' && duel.pattern === 'beam') clashed(duel);
  });
  G.events.on('player:damaged', (e) => {
    if (duel && e.from === duel.n) duel.log.taken += e.amount;
  });
  G.events.on('spell:clash', (e) => {
    if (!duel || !['block', 'reflect'].includes(e.result)) return;
    if (e.pos?.distanceTo(G.player.pos) > 4) return;
    if (e.defender && e.defender !== G.player) return;
    if (e.pos && e.pos.distanceTo(duel.n.pos) < e.pos.distanceTo(G.player.pos)) return;   // her own shield took it
    duel.log.blocked++;
    if (e.result === 'reflect') { duel.log.reflected++; duel.reflectT = G.time.t; }
    safeSave();
  });
  return {
    tick,
    start,
    reset() {
      stop('', false);
      last = null;
    },
    get last() {
      return last;
    },
    get active() {
      return !!duel;
    },
    get memory() {
      return !!duel && !duel.story;
    },
    /** the lessons of the first bout (spar-lessons.js) */
    get lessons() { return lessons; },
    get stats() {
      return duel ? { ...duel.log, phase: duel.phase, remaining: duel.hp, stage: duel.stage, pattern: duel.pattern } : null;
    },
  };
}
