// This script is injected into the test page. The main route only sends player inputs.
// Separate postgame regression cases may place the player back at Fran's clearing.
window.playTwo = async function (part) {
  const G = __game,
    R = __rigClock,
    T = __T,
    P = G.player,
    S = G.story,
    Q = G.quests;
  const log = [],
    pictures = {},
    notes = [],
    keys = new Set();
  let impacts = 0;
  G.events.on('journey:trial-impact', () => {
    impacts++;
  });
  const errors = () => T.errors();
  const frame = G.renderFrame.bind(G);
  G.renderFrame = function () {};
  const tick = async (n = 1) => {
    for (let i = 0; i < n; i++) await R.step(50);
  };
  const key = (k, b) => {
    if (b === keys.has(k)) return;
    T.key(k, b);
    if (b) keys.add(k);
    else keys.delete(k);
  };
  const tap = async (k) => {
    key(k, true);
    await tick(2);
    key(k, false);
    await tick(2);
  };
  const off = () => {
    for (const k of [...keys]) key(k, false);
  };
  const snap = (tag) => {
    frame();
    pictures[tag] = G.renderer.domElement.toDataURL('image/jpeg', 0.9);
  };
  function fightPhoto(tag) {
    const camera = G.camera,
      cp = camera.position.clone(),
      cq = camera.quaternion.clone(),
      fov = camera.fov;
    const a = P.pos,
      b = S.npcs.get('fran').pos,
      center = a.clone().lerp(b, 0.53);
    center.y += 1.05;
    const side = b.clone().sub(a);
    side.y = 0;
    side.normalize();
    const right = new G.THREE.Vector3(-side.z, 0, side.x);
    // Offset towards the heroine and frame both casters. The simulation retains its normal aim and input camera.
    camera.position.copy(a).addScaledVector(side, -2.35).addScaledVector(right, 3.6);
    camera.position.y += 1.85;
    camera.fov = 51;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    snap(tag);
    camera.position.copy(cp);
    camera.quaternion.copy(cq);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }
  const setCam = (a, pitch = -0.1) => {
    G.cam.yaw = a;
    G.cam.pitch = pitch;
  };
  const get = (id) => S.anchor(id);
  async function walk(to, r = 1.8) {
    off();
    if (P.onBroom) {
      await tap('KeyF');
      await tick(18);
    }
    let walked = 0;
    const W = G.world;
    function navigate() {
      const stride = 1.1,
        sx = P.pos.x,
        sz = P.pos.z,
        endX = to.x,
        endZ = to.z;
      const key = (i, j) => i + ',' + j;
      const cost = new Map(),
        queue = [],
        state = new Map(),
        visited = new Set();
      const h = (i, j) => Math.hypot(sx + i * stride - endX, sz + j * stride - endZ);
      function offer(i, j, g, parent) {
        const id = key(i, j);
        if ((cost.get(id) ?? Infinity) <= g) return;
        const x = sx + i * stride,
          z = sz + j * stride;
        if (
          x < Math.min(sx, endX) - 30 ||
          x > Math.max(sx, endX) + 30 ||
          z < Math.min(sz, endZ) - 30 ||
          z > Math.max(sz, endZ) + 30
        )
          return;
        const v = new G.THREE.Vector3(x, W.heightAt(x, z) + 0.14, z);
        if (parent && W.resolveCollisions(v, 0.59, 1.6)) return;
        const f = g + h(i, j) / stride;
        const node = { i, j, x, z, parent, f };
        cost.set(id, g);
        state.set(id, node);
        let lo = 0,
          hi = queue.length;
        while (lo < hi) {
          const m = (lo + hi) >> 1;
          if (queue[m].f > f) lo = m + 1;
          else hi = m;
        }
        queue.splice(lo, 0, node);
      }
      offer(0, 0, 0, null);
      for (let n = 0; n < 30000 && queue.length; n++) {
        const curr = queue.pop(),
          id = key(curr.i, curr.j);
        if (visited.has(id)) continue;
        visited.add(id);
        if (Math.hypot(curr.x - endX, curr.z - endZ) < r) {
          const route = [];
          for (let next = curr; next.parent; next = next.parent) route.unshift(next);
          return route;
        }
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ])
          offer(curr.i + di, curr.j + dj, cost.get(id) + Math.hypot(di, dj), curr);
      }
      throw Error('no walk path: ' + [sx, sz, endX, endZ]);
    }
    for (const point of navigate()) {
      let prev = Infinity,
        stuck = 0;
      for (let i = 0; i < 45; i++) {
        const dx = point.x - P.pos.x,
          dz = point.z - P.pos.z,
          dist = Math.hypot(dx, dz);
        if (dist < 0.58) break;
        setCam(Math.atan2(-dx, -dz));
        key('KeyW', true);
        if (i > 4 && Math.abs(dist - prev) < 0.025) stuck++;
        else stuck = 0;
        if (stuck === 7) {
          key('Space', true);
        } else if (stuck > 7) {
          key('Space', false);
        }
        const b = P.pos.clone();
        await tick();
        walked += b.distanceTo(P.pos);
        prev = dist;
        if (i === 44 && dist > 1.5) {
          off();
          throw Error(
            'walk stuck ' + P.pos.toArray() + ' waypoint ' + [point.x, point.z] + ' dest ' + to.toArray(),
          );
        }
      }
    }
    off();
    await tick(3);
    notes.push({ walk: Math.round(walked * 10) / 10, to: to.toArray() });
  }
  async function talk(id) {
    const step = S.current(),
      p = S.target(step);
    if (P.onBroom) {
      await tap('KeyF');
      await tick(10);
    }
    if (id === 'clue') {
      await walk(get('gate').add(new G.THREE.Vector3(0, 0, -6)), 1.6);
      await walk(get('gate').add(new G.THREE.Vector3(0, 0, -28)), 2);
    }
    if (id === 'lodge' || id === 'return') {
      const door = get('innDoor');
      await walk(door.clone().add(new G.THREE.Vector3(0, 0, 2.5)), 1.2);
      await walk(door.clone().add(new G.THREE.Vector3(0, 0, -2)), 1.3);
    }
    if (id === 'inquire' && P.pos.y > 38) {
      await tap('KeyF');
      const street = get('shop').add(new G.THREE.Vector3(0, 0, 1.4));
      await fly(street, 18);
      off();
      await tap('KeyF');
      await tick(90);
    }
    if (id === 'repair') {
      await tick(3);
    } else {
      await walk(p, 2.85);
    }
    await tick(8);
    if (!G.interact.current)
      throw Error(id + ' no interact at ' + P.pos.toArray() + ' target ' + p.toArray());
    await tap('KeyE');
    for (let k = 0; k < 160 && S.current()?.id === id; k++) {
      await tap('Enter');
    }
  }
  async function fly(p, clearance = 5, observe = null) {
    if (!P.onBroom) {
      await tap('KeyF');
      await tick(15);
    }
    key('KeyW', true);
    let traveled = 0,
      limit = 13000,
      prev = P.pos.clone();
    for (let i = 0; i < limit; i++) {
      observe?.();
      const dx = p.x - P.pos.x,
        dz = p.z - P.pos.z,
        dist = Math.hypot(dx, dz);
      setCam(Math.atan2(-dx, -dz), -0.2);
      const dir = Math.atan2(dx, dz),
        ang = Math.abs(Math.atan2(Math.sin(dir - P.broom.heading), Math.cos(dir - P.broom.heading)));
      const goalV = Math.max(2, Math.min(16, dist * 0.7)) * (ang > 1.0 ? 0.45 : 1);
      key('KeyW', P.broom.speed < goalV + 0.05);
      key('KeyS', P.broom.speed > goalV + 1.4);
      const h = G.world.groundAt(P.pos.x, P.pos.z) + clearance,
        goal = dist < 38 ? p.y + clearance : h;
      key('Space', P.pos.y < goal - 0.9);
      key('KeyC', P.pos.y > goal + 1.1);
      if ((S.busy && S.current()?.id === 'collision') || dist < 2.3) {
        off();
        break;
      }
      await tick();
      traveled += P.pos.distanceTo(prev);
      prev.copy(P.pos);
      if (!P.onBroom) throw Error('dismounted at ' + P.pos.toArray() + ' d=' + dist);
      if (i === limit - 1) throw Error('flight timeout ' + dist);
    }
    return traveled;
  }
  async function castAt(p) {
    const side = new G.THREE.Vector3(0, 0, 6);
    const q = p.clone().add(side);
    q.y = G.world.heightAt(q.x, q.z) + 0.03;
    await walk(q, 0.96);
    await tick(4);
    const from = P.pos.clone();
    from.y += 1.43;
    setCam(0, 0);
    T.cam(from.x, from.y, from.z, p.x, p.y, p.z);
    await tick(7);
    await tap('Mouse2');
    await tick(16);
    T.cam();
  }
  async function altitude(y) {
    off();
    for (let i = 0; i < 240; i++) {
      key('Space', P.pos.y < y - 0.35);
      key('KeyC', P.pos.y > y + 0.35);
      if (Math.abs(P.pos.y - y) < 0.48) break;
      await tick();
    }
    off();
    await tick(3);
  }
  async function bout() {
    let parried = false,
      evaded = false,
      hadHit = false,
      samples = [];
    const lake = G.world.trialLake,
      originalFloor = G.world.heightAt(lake.x, lake.z);
    let leaveAim = false;
    await tick(8);
    // 120 s of game time (ticks of 50 ms): the spar plus the lake finale; the spar runs about three times as long since
    // the "longer fights" round (126 hp, hold at 20 casts), so the old 48 s budget no longer covers it
    let lessonsSkipped = false;
    for (let i = 0; i < 2400 && S.current()?.id === 'duel'; i++) {
      // the first bout teaches (src/story/spar-lessons.js); this scripted duellist skips the lessons with {interact}
      if (!lessonsSkipped && S.spar.lessons?.state?.shown) {
        lessonsSkipped = true;
        off();
        await tap('KeyE');
        if (S.spar.lessons.active || !G.state.flags.spar_lessons) throw Error('lesson skip ' + JSON.stringify(S.spar.lessons.state));
        notes.push({ sparLessons: 'skipped with interact' });
      }
      const st = S.spar.stats,
        n = S.npcs.get('fran');
      if (!st) {
        if (S.finale.active) {
          if (!leaveAim) {
            off();
            T.cam();
            leaveAim = true;
          }
          const time = S.finale.time;
          if (time > 3.37 && !pictures.fallingStone) snap('fallingStone');
          if (time > 5.26 && !pictures.firstWave) snap('firstWave');
          if (time > 8 && !pictures.settledLake) snap('settledLake');
        }
        await tick();
        continue;
      }
      const from = P.pos.clone();
      from.y += 1.32;
      const target = n.pos.clone();
      target.y += 1.05;
      T.cam(from.x, from.y, from.z, target.x, target.y, target.z);
      setCam(Math.atan2(from.x - target.x, from.z - target.z));
      const bolts = G.spells.projectiles.filter((o) => o.data?.franSpar && o.team === 'enemy');
      const closest = Math.min(99, ...bolts.map((o) => o.pos.distanceTo(P.pos)));
      if (st.fired >= 1 && i % 4 === 0) samples.push({ ...st, hp: P.hp, dist: closest });

      if (st.blocked > 0) parried = true;
      if (st.dodged > 0) evaded = true;
      if (st.taken > 0) hadHit = true;
      if (st.fired >= 1 && hadHit && !parried) {
        key('KeyR', closest < 3.4);
        if (P.guarding && closest < 3.4 && !pictures.duelShield) fightPhoto('duelShield');
      } else if (st.fired >= 2 && !evaded && closest < 3.7) {
        key('KeyR', false);
        key('KeyA', true);
        key('KeyQ', true);
      } else {
        key('KeyQ', false);
        key('KeyA', false);
        key('KeyR', false);
      }
      if (st.phase && st.stage === 'opening' && (parried || st.fired >= 4)) {
        key('Mouse0', true);
      } else key('Mouse0', false);
      await tick();
    }
    off();
    T.cam();
    const lakeFloor = G.world.heightAt(lake.x, lake.z);
    if (impacts !== 1 || !G.state.flags.majo_trial_lake || originalFloor < 1 || lakeFloor >= -5)
      throw Error('lake formation ' + JSON.stringify({ impacts, originalFloor, lakeFloor }));
    notes.push({ lakeFormation: { impacts, originalFloor, lakeFloor } });
    notes.push({
      duel: S.vars()?.franDuel,
      hadHit,
      parried,
      evaded,
      sample: samples.filter((q, i) => i % 25 === 0),
    });
  }
  let failed = null;
  try {
    await tick(10);
    if (part === 'first' && S.current()?.id !== 'book') throw Error('new game step ' + S.current()?.id);
    if (part === 'last' && S.current()?.id !== 'lodge') throw Error('continue step ' + S.current()?.id);
    // a named save loads with the small forms it had: nothing is raised to the charged forms on load any more
    if (part === 'last' && Object.values(G.state.spells).some((n) => n > 1)) throw Error('load raised spells ' + JSON.stringify(G.state.spells));
    let count = 0;
    while (S.current() && ++count < 42) {
      const step = S.current(),
        id = step.id;
      if (part === 'first' && id === 'lodge') {
        if (!pictures.duelShield) throw Error('did not capture defensive spell');
        S.save();
        break;
      }
      console.log('[episode] ' + part + ' ' + id + ' ' + P.pos.toArray().map(Math.round));
      log.push({
        id,
        chapter: S.chapter(),
        vars: { ...S.vars() },
        position: P.pos.toArray(),
        elaina: G.player.rig?.assetId || G.player.rig?.model?.userData?.assetId,
        brooch: G.player.rig?.model?.getObjectByName('Journey_Brooch')?.scale.x,
        sayaHat: S.npcs.get('saya')?.actor?.model?.getObjectByName('Journey_ApprenticeHat')?.scale.x,
      });
      if (['book', 'duel', 'promise', 'lodge'].includes(id)) {
        const expected = G.state.flags.majo_named ? 'elaina' : 'apprentice';
        for (let i = 0; i < 140 && P.outfit !== expected; i++) {
          await tick();
          await new Promise((resolve) => R.realST(resolve, 10));
        }
        if (P.outfit !== expected) throw Error(id + ' outfit ' + P.outfit + ', expected ' + expected);
        notes.push({ id, outfit: P.outfit });
      }
      if (step.action) {
        await talk(id);
        if (id === 'invest') {
          // spell-tiers: Fran teaches small forms only. Thunder and earth at level 1; nothing charged
          // (tier 2 comes from the page trials, src/gameplay/wilds-pages.js)
          const sp = { ...G.state.spells };
          if (['wind', 'water', 'fire', 'ice', 'thunder', 'earth'].some((e) => sp[e] !== 1)) throw Error('invest grant ' + JSON.stringify(sp));
          notes.push({ investSpells: sp });
        }
      } else if (id === 'storm') {
        const p = get('franTrial');
        await walk(p, 1.9);
        await tick(6);
        setCam(0);
        key('KeyD', true);
        for (let i = 0; i < 250 && S.current()?.id === id; i++) {
          if (i % 20 === 0) {
            key('KeyD', !keys.has('KeyD'));
            key('KeyA', !keys.has('KeyD'));
          }
          await tick();
        }
        off();
      } else if (id === 'practice') {
        for (let k = 0; k < 9 && S.current()?.id === id; k++) await castAt(S.target(step));
      } else if (id === 'duel') {
        await bout();
      } else if (id === 'lake') {
        const p = get('lakeCrossing');
        let maxEclipse = 0;
        function observe() {
          maxEclipse = Math.max(maxEclipse, G.journeyWeather.state.eclipse || 0);
          if (maxEclipse < 0.92 || pictures.lakeEclipse) return;
          const camera = G.camera,
            heading = G.env.sunDir.clone(),
            flat = heading.clone();
          flat.y = 0;
          flat.normalize();
          const side = new G.THREE.Vector3(flat.z, 0, -flat.x);
          const pos = camera.position.clone(),
            orientation = camera.quaternion.clone();
          camera.position.copy(P.pos).addScaledVector(flat, -6).addScaledVector(side, 2.6);
          camera.position.y += 2.4;
          const look = camera.position.clone().addScaledVector(flat, 68);
          look.y += Math.max(0, heading.y * 45 - 8);
          camera.lookAt(look);
          camera.updateMatrixWorld(true);
          snap('lakeEclipse');
          camera.position.copy(pos);
          camera.quaternion.copy(orientation);
          camera.updateMatrixWorld(true);
        }
        const meters = await fly(p, 21, observe);
        off();
        for (let i = 0; i < 1100 && S.current()?.id === 'lake'; i++) {
          await tick();
          observe();
        }
        if (!G.state.flags.journey_eclipse_peak || !G.state.flags.majo_trial_lake || maxEclipse < 0.92)
          throw Error('lake eclipse failed: ' + maxEclipse);
        notes.push({
          lakeCrossing: { meters, maxEclipse, position: P.pos.toArray(), inputEnabled: G.mode === 'play' },
        });
      } else if (id === 'wilds' || id === 'gate') {
        const p = get(step.anchor);
        p.y = G.world.heightAt(p.x, p.z);
        let approach = 0;
        if (id === 'gate') {
          const out = p.clone();
          out.z += 22;
          approach = await fly(out, 18);
          await altitude(p.y + 3.8);
        }
        notes.push({ id, meters: approach + (await fly(p, id === 'wilds' ? 27 : 3.3)) });
        await tick(10);
      } else if (id === 'collision') {
        const p = get('roof'),
          g = get('gate');
        if (!P.onBroom) await tap('KeyF');
        const lane = g.clone();
        lane.z -= 13;
        await fly(lane, 3);
        const center = g.clone();
        center.z = p.z;
        await fly(center, 3);
        await altitude(p.y + 7);
        await fly(p, 5);
        await tick(40);
        for (let k = 0; k < 45 && S.current()?.id === id; k++) await tap('Enter');
      } else if (id === 'course') {
        const p = get('practice');
        await walk(p, 1.8);
        await tick(6);
        for (let j = 0; j < 3; j++) {
          const g = S.scenes.hoopPos(j);
          notes.push({ hoop: j, meters: await fly(g, 0) });
          await tick(6);
        }
      }
      if (id === S.current()?.id)
        throw Error('step stuck ' + id + ' ' + JSON.stringify(S.debug()) + ' mode ' + G.mode);
    }
    if (part === 'last') {
      // the parting at the gate ends episode two with an epilogue and the credits roll; read through it
      let endSeen = false;
      for (let k = 0; k < 1500 && !(endSeen && G.mode === 'play'); k++) {
        if (G.mode === 'ending') { endSeen = true; await tap('Enter'); } else await tick();
      }
      if (!endSeen || G.mode !== 'play') throw Error('credits roll ' + JSON.stringify({ endSeen, mode: G.mode }));
      notes.push({ creditsRoll: true });
      if (
        !Q.isDone('mages') ||
        !Q.isDone('apprentice') ||
        !G.state.flags.majo_saya_hat ||
        !G.state.flags.majo_brooch
      )
        throw Error('ending state ' + JSON.stringify(S.debug()));
      const canonical = JSON.stringify(G.state.quests),
        location = get('franTrial');
      T.teleport(location.x, location.z, location.y + 0.01);
      await tick(8);
      await tap('KeyE');
      await tick(8);
      if (!S.spar.memory) throw Error('forest rematch interaction unavailable');
      P.hp = 18;
      let seenHp = 18;
      for (let i = 0; i < 1150 && S.spar.active; i++) {
        await tick();
        seenHp = Math.min(seenHp, P.hp);
      }
      if (
        S.spar.active ||
        !G.state.story.practiceBouts ||
        S.spar.last?.result !== 'yield' ||
        !S.spar.last?.taken ||
        canonical !== JSON.stringify(G.state.quests)
      )
        throw Error('rematch did not restore campaign');
      notes.push({
        isolatedRecollection: {
          scenarios: 'low health against live projectiles',
          initialHp: 18,
          lowestHp: seenHp,
          last: S.spar.last,
          cleared: G.state.story.practiceBouts,
          canonicalQuestsIdentical: true,
        },
      });
      if (impacts || !G.world.trialLakeActive()) throw Error('recollection altered the lake');
      const finale = structuredClone(G.state);
      delete G.state.flags.majo_trial_lake;
      G.world.setTrialLake(false);
      Q.debugSkipTo('apprentice', 'duel');
      delete G.state.flags.majo_brooch;
      delete G.state.flags.majo_named;
      P.hp = 16;
      await tick(10);
      if (!S.spar.active) throw Error('isolated alternate evaluation failed to start');
      for (let i = 0; i < 750 && S.current()?.id === 'duel'; i++) {
        if (S.finale.time > 0.85) {
          await tap('Enter');
        } else await tick();
      }
      if (impacts !== 1 || !G.world.trialLakeActive()) throw Error('skipping finale missed impact');
      if (S.current()?.id !== 'invest' || S.vars().franResult !== 'yield' || !S.spar.last.taken)
        throw Error('yield result ' + JSON.stringify(S.spar.last));
      await talk('invest');
      if (!G.state.flags.majo_brooch || !G.state.flags.majo_named || S.current()?.id !== 'promise')
        throw Error('alternate diploma missing');
      notes.push({
        isolatedCampaignYield: {
          setup: 're-enter saved first-episode duel; initial HP 16',
          last: S.spar.last,
          badge: true,
          next: S.current().id,
        },
      });
      G.state = finale;
      S.save();
    }
    if (errors().length) throw Error('Runtime errors: ' + errors().join('|'));
  } catch (e) {
    failed = String(e.stack);
    snap('failure-' + part);
  }
  off();
  return {
    failure: failed,
    log,
    pictures,
    notes,
    errors: errors(),
    state: G.mode,
    flags: G.state.flags,
    quests: G.state.quests,
  };
};
