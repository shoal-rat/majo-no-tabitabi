import * as T from 'three';
import { G } from '../core/game.js';
import { t } from '../core/i18n.js';

const starOffsets = [
  [-6, 1.9, -5],
  [2.5, 2.7, -7],
  [7, 2.15, -2],
];
const flightOffsets = [
  [0, 3, -13],
  [-12, 4.7, -32],
  [-34, 3.6, -41],
];
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const effect = (p, color, scale = 0.7) => G.fx?.burst?.('summon', p, { color, scale });
function material(color, lit = false) {
  return lit ? new T.MeshStandardMaterial({ color, roughness: 0.94 }) : new T.MeshBasicMaterial({ color });
}
function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
  const o = new T.Mesh(geometry, mat);
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function ring(parent, r, thick, color) {
  return mesh(parent, new T.TorusGeometry(r, thick, 7, 44), material(color));
}
const ground = (x, z) => G.world.groundAt(x, z, G.world.heightAt(x, z) + 1.4);

export function createScenes(S) {
  const group = new T.Group();
  group.name = 'journey:story-scenes';
  G.scene.add(group);
  const stars = new T.Group();
  group.add(stars);
  const star = mesh(stars, new T.OctahedronGeometry(0.43), material(0xffdf8a));
  const orbit = ring(stars, 0.75, 0.027, 0xf4c678);
  orbit.rotation.x = 0.84;
  const ring2 = ring(stars, 0.62, 0.016, 0xfff2c0);
  ring2.rotation.y = 0.8;
  const signal = new T.Group();
  group.add(signal);
  const warning = ring(signal, 1.75, 0.065, 0xf1957e);
  warning.rotation.x = -Math.PI / 2;
  const point = mesh(signal, new T.OctahedronGeometry(0.29), material(0xffd9bc));
  point.scale.set(0.6, 2.5, 0.6);
  const course = new T.Group();
  group.add(course);
  const hoops = [];
  for (let i = 0; i < 3; i++) {
    const frame = new T.Group();
    course.add(frame);
    const torus = ring(frame, 2.65, 0.065, 0x99dbc6);
    const tip = mesh(frame, new T.OctahedronGeometry(0.19), material(0xffecad), 0, 2.83, 0);
    tip.scale.y = 1.7;
    for (let k = 0; k < 3; k++) {
      const tail = mesh(
        frame,
        new T.PlaneGeometry(0.1, 0.43 - k * 0.04),
        material(0x71aaae),
        -0.21 + k * 0.21,
        -2.85,
        0,
      );
      tail.material.side = T.DoubleSide;
    }
    hoops.push({ frame, torus });
  }
  const basket = new T.Group();
  group.add(basket);
  const wicker = material(0xa77951, true),
    soft = material(0xc9c4b9, true);
  mesh(basket, new T.CylinderGeometry(0.47, 0.33, 0.43, 18), wicker, 0, 0.215, 0);
  const lip = ring(basket, 0.464, 0.037, 0xb58a65);
  lip.position.y = 0.423;
  lip.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 3; i++)
    mesh(
      basket,
      new T.BoxGeometry(0.63 - i * 0.07, 0.075, 0.46),
      soft,
      -0.035,
      i * 0.065 + 0.4,
      0,
    ).rotation.y = i * 0.2;
  // the loose tiles on the open patch of the accident roof: the roof's own tile materials, lying on the plaster gable
  // under the patch (world/builders/bellcrown.js accident()). Each stays on its side of the ridge: scattered [x, z, yaw]
  // (metres / rad from the 'repair' anchor) -> gathered in two neat rows, so the path between lies in one roof plane.
  // East of the ridge they avoid the spots where the broken fragments (bellcrown.js shards) break the surface:
  // x 0.3-0.5 and 0.95-1.25 in three bands of z.
  const accidentRoof = G.structures?.places?.accidentRoof;
  const broken = new T.Group();
  group.add(broken);
  const tiles = [];
  const scattered = [
      [-0.92, -0.35, 0.6],
      [-0.58, 0.3, -0.4],
      [-0.34, -0.75, 1.1],
      [0.66, 0.28, -0.25],
      [0.5, -0.6, 0.3],
      [0.74, 0.8, 0.25],
      [0.9, -0.62, -0.35],
    ],
    gathered = [
      [-0.6, -0.35],
      [-0.6, -0.05],
      [-0.6, -0.65],
      [0.72, -0.15],
      [0.72, -0.45],
      [0.72, 0.15],
      [0.72, -0.75],
    ];
  for (let i = 0; i < 7; i++) {
    const piece = mesh(
      broken,
      new T.BoxGeometry(0.36, 0.075, 0.25),
      accidentRoof?.tiles?.[i % 2] || material(i % 2 ? 0x9a554f : 0xb47566, true),
    );
    piece.castShadow = piece.receiveShadow = true;
    // poses are set when the repair step begins (reset)
    tiles.push({ piece, origin: V(), dest: V(), yaw: scattered[i][2], from: new T.Quaternion(), to: new T.Quaternion() });
  }
  const up = V(0, 1, 0),
    roll = V(0, 0, 1),
    tilt = new T.Quaternion();
  // lay a tile flat on the patch: `at` comes in as the (x, z) it rests on and leaves as its centre; `q` = tilt to the
  // roof plane x turn `yaw` within it
  function lay(at, q, yaw) {
    const half = 0.0375,
      side = Math.sign(at.x) || 1,
      a = Math.atan(accidentRoof.pitch);
    tilt.setFromAxisAngle(roll, -side * a);
    q.setFromAxisAngle(up, yaw).premultiply(tilt);
    at.y = accidentRoof.patchY(broken.position.x + at.x) - broken.position.y + half * Math.cos(a);
    at.x += side * half * Math.sin(a);
  }
  const demonstration = [];
  let key = '',
    clock = 0,
    interval = 0,
    phase = 0,
    targetPoint = V(),
    partial = null,
    repairT = 0,
    collision = null,
    lastP = null;
  function at(base, offset) {
    const p = S.anchor(base);
    p.x += offset[0];
    p.z += offset[2];
    p.y = ground(p.x, p.z) + offset[1];
    return p;
  }
  function starPos(i) {
    return at('franTrial', starOffsets[Math.min(i, 2)]);
  }
  function hoopPos(i) {
    return at('practice', flightOffsets[Math.min(i, 2)]);
  }
  function reset(id) {
    key = id;
    clock = 0;
    phase = 0;
    interval = 0.45;
    lastP = null;
    repairT = 0;
    demonstration.length = 0;
    basket.visible = id === 'chores';
    broken.visible = id === 'repair';
    stars.visible = id === 'practice';
    signal.visible = false;
    course.visible = id === 'course';
    if (basket.visible) basket.position.copy(S.anchor('franLesson'));
    if (broken.visible) {
      broken.position.copy(S.anchor('repair'));
      tiles.forEach((tile, i) => {
        tile.origin.set(scattered[i][0], 0.04, scattered[i][1]);
        tile.dest.set(gathered[i][0], 0.04, gathered[i][1]);
        tile.from.setFromAxisAngle(up, tile.yaw);
        tile.to.identity();
        if (accidentRoof?.patchY) {
          lay(tile.origin, tile.from, tile.yaw);
          lay(tile.dest, tile.to, 0);
        }
        tile.piece.position.copy(tile.origin);
        tile.piece.quaternion.copy(tile.from);
      });
    }
    if (course.visible)
      hoops.forEach(({ frame }, i) => {
        frame.position.copy(hoopPos(i));
        const next = hoopPos(i === 2 ? 1 : i + 1);
        frame.lookAt(next.x, frame.position.y, next.z);
      });
  }
  function progress(name, value) {
    const v = S.vars();
    if (!v || v[name] === value) return;
    v[name] = value;
    G.quests.refresh();
    S.save();
  }
  function practice(dt, v) {
    stars.position.copy(starPos(v.stars || 0));
    stars.position.y += 0.11 * Math.sin(clock * 2);
    stars.rotation.y = clock * 0.9;
    star.rotation.z = clock * 0.5;
  }
  function spell(p) {
    if (key !== 'practice' || G.mode !== 'play' || p.caster !== G.player || p.spell !== 'wind') return;
    const v = S.vars();
    if (!v || v.stars >= 3) return;
    const dest = starPos(v.stars || 0),
      diff = dest.clone().sub(p.pos),
      along = diff.dot(p.dir);
    if (along < 0 || along > 35 || diff.addScaledVector(p.dir, -along).length() > 1.65) return;
    effect(dest, 0xffd082);
    G.audio?.sfx?.('ui_ok');
    progress('stars', (v.stars || 0) + 1);
  }
  function storm(dt, v) {
    const P = G.player;
    if (!S.near(S.anchor('franTrial'), 16) || P.onBroom) {
      phase = 0;
      interval = 0.35;
      signal.visible = false;
      return;
    }
    interval -= dt;
    if (!phase && interval <= 0) {
      phase = 1;
      interval = 1.42;
      targetPoint.copy(P.pos);
      targetPoint.y = ground(P.pos.x, P.pos.z) + 0.08;
      signal.position.copy(targetPoint);
      signal.visible = true;
      S.npcs.gesture('fran', 'cast_raise');
    }
    if (!phase) return;
    const amount = T.MathUtils.clamp(interval / 1.42, 0, 1);
    warning.scale.setScalar(1 + 0.15 * Math.sin(clock * 11));
    point.position.y = 0.1 + amount * amount * 6.5;
    if (interval > 0) return;
    effect(targetPoint, 0xf3bc8f);
    const avoided = Math.hypot(P.pos.x - targetPoint.x, P.pos.z - targetPoint.z) > 1.72;
    const guarded = P.guarding;
    if (avoided || guarded) {
      if (guarded) effect(P.pos.clone().add(V(0, 1, 0)), 0xbce4ee, 0.52);
      progress('evaded', (v.evaded || 0) + 1);
    } else {
      const hurt = Math.max(0, Math.min(8, P.hp - 1));
      P.takeDamage(hurt, { element: 'wind', source: S.npcs.get('fran'), from: S.npcs.get('fran') });
      progress('stormHits', (v.stormHits || 0) + 1);
      G.ui?.toast?.(t('story.ui.hit'), { dur: 1.6 });
    }
    phase = 0;
    signal.visible = false;
    interval = 0.72;
  }
  function training(dt, v) {
    const count = v.rings || 0,
      P = G.player;
    hoops.forEach(({ frame, torus }, i) => {
      frame.visible = i >= count;
      torus.material.color.setHex(i === count ? 0xe4cd78 : 0x7da8a0);
    });
    if (!P.onBroom) {
      lastP = null;
      return;
    }
    if (count < 3) {
      const goal = hoopPos(count),
        previous = lastP || P.pos,
        delta = P.pos.clone().sub(previous);
      const reach =
        delta.lengthSq() > 0
          ? T.MathUtils.clamp(goal.clone().sub(previous).dot(delta) / delta.lengthSq(), 0, 1)
          : 0;
      if (
        P.speed > 1 &&
        delta.lengthSq() < 100 &&
        previous.clone().addScaledVector(delta, reach).distanceTo(goal) < 2.88
      ) {
        effect(goal, 0xaff1da);
        progress('rings', count + 1);
      }
    }
    lastP = P.pos.clone();
    const center = S.anchor('practice');
    if (!S.near(center, 95)) {
      demonstration.length = 0;
      return;
    }
    const prev = demonstration.at(-1);
    if (!prev || clock - prev.time >= 0.1)
      demonstration.push({ position: P.pos.clone(), time: clock, yaw: P.yaw });
    const after = clock - 1.15;
    while (demonstration.length > 2 && demonstration[1].time <= after) demonstration.shift();
    if (demonstration.length < 2 || after < demonstration[0].time) return;
    const [a, b] = demonstration,
      k = T.MathUtils.clamp((after - a.time) / (b.time - a.time), 0, 1);
    const yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * k;
    const following = a.position.clone().lerp(b.position, k);
    following.x += 1.4 * Math.cos(yaw);
    following.z -= 1.4 * Math.sin(yaw);
    following.y += 0.24;
    S.npcs.airPose('saya', following, yaw, true);
  }
  function repair() {
    return new Promise((resolve) => {
      partial = resolve;
      repairT = 0.001;
      G.player.playAction('cast_raise', { face: S.anchor('repair') });
    });
  }
  function animateRepair(dt) {
    if (!partial) return;
    repairT += dt;
    const k = Math.min(1, repairT / 1.1);
    tiles.forEach(({ piece, origin, dest, from, to }, i) => {
      piece.position.lerpVectors(origin, dest, k);
      piece.position.y += Math.sin(k * Math.PI) * (0.36 + i * 0.09);
      piece.quaternion.slerpQuaternions(from, to, k);
    });
    if (k >= 1) {
      effect(broken.position, 0xb4e6ec, 0.6);
      const done = partial;
      partial = null;
      done();
    }
  }
  function crash() {
    const P = G.player,
      end = P.pos.clone(),
      roof = S.anchor('roof');
    end.y = Math.min(end.y, roof.y + 7);
    end.y = Math.max(end.y, roof.y + 2.4);
    const facing = V(Math.sin(P.yaw), 0, Math.cos(P.yaw));
    const side = V(facing.z, 0, -facing.x);
    const start = end.clone().addScaledVector(facing, 16).addScaledVector(side, 4);
    start.y += 1;
    G.setMode('cutscene');
    P.setControl(false);
    G.cam?.cinematic?.({
      pos: end
        .clone()
        .addScaledVector(side, 6)
        .add(V(0, 2.1, 0)),
      look: end.clone().add(V(0, 0.9, 0)),
      dur: 0.35,
    });
    return new Promise((done) => {
      collision = { time: 0, start, end, roof, facing, side, done, land: S.npcs.standPoint('saya', 'roof') };
    });
  }
  function animateCrash(dt) {
    if (!collision) return;
    const c = collision,
      p = G.player;
    c.time += dt;
    const t = Math.min(1, c.time / 1.1);
    const pos = c.start.clone().lerp(c.end, t);
    if (t >= 1 && !c.hit) {
      c.hit = true;
      effect(c.end, 0xf2dab3, 0.65);
      G.fx?.shake?.(0.22, 0.25);
      p.dismountBroom();
      p.teleport(c.roof.x - 0.65, c.roof.y + 0.12, c.roof.z);
      p.playAction('hit', { faceAim: false });
    }
    if (c.hit) {
      const k = Math.min(1, (c.time - 1.1) / 0.48);
      // she lands where she then stands for the repair step (episode-cast standPoint), on the ridge
      pos.lerp(c.land, k);
    }
    S.npcs.airPose('saya', pos, Math.atan2(-c.facing.x, -c.facing.z), !c.hit);
    if (c.time >= 1.65) {
      collision = null;
      G.cam?.release?.();
      G.setMode('play');
      p.setControl(true);
      c.done();
    }
  }
  function update(dt) {
    const id = S.current()?.id || '';
    if (key !== id) reset(id);
    clock += dt;
    if (collision) animateCrash(dt);
    const v = S.vars() || {};
    if (id === 'practice') practice(dt, v);
    if (id === 'storm' && G.mode === 'play') storm(dt, v);
    if (id === 'course' && G.mode === 'play') training(dt, v);
    if (id === 'repair') animateRepair(dt);
  }
  reset('');
  G.events.on('spell:cast', spell);
  return { update, repair, crash, starPos, hoopPos, reset };
}
