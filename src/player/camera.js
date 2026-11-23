// G.cam — third-person orbit camera: collision with terrain / platforms / bodies, smart distance, shoulder offset when
// aiming, wider + faster on the broom, lock-on framing, cinematics, screen shake, and the title beauty shot.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { wakeDrive } from '../world/broom-wake.js';
import { clamp, damp, dampAngle, angleDiff, easeInOutCubic, lerp } from '../core/util.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _dir = new THREE.Vector3();
const _look = new THREE.Vector3(), _pos = new THREE.Vector3();
const EASES = { linear: (t) => t, inOut: easeInOutCubic, out: (t) => 1 - (1 - t) * (1 - t), in: (t) => t * t };

export function createCamera() {
  const cam = G.camera;
  const pivot = new THREE.Vector3();
  const pivotTarget = new THREE.Vector3();
  let cine = null;          // { from:{pos,look}, to:{pos,look}, t, dur, ease, resolve, hold }
  let releaseT = 0;         // blend back from a cinematic
  const relFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let fovKick = 0, fovBase = 60, fov = 60;
  let idleLook = 0;         // seconds without mouse look
  let chaseYaw = 0, chaseRoll = 0;
  let titleT = 0;
  let snapNext = true;
  let lockW = 0;
  let strW = 0, strSide = 0;   // beam-struggle framing weight / which side of the beam line
  let strWas = false, strKick = 0;   // a struggle was framed last frame / the camera kick when it breaks (1 → 0)
  const strPos = new THREE.Vector3(), strLook = new THREE.Vector3(), strKickDir = new THREE.Vector3(0, 0, 1);
  const forward = new THREE.Vector3(0, 0, -1);

  /** struggle framing: free distance from p along unit dir d (scenery only; characters and light bodies ignored) */
  const _sfD = new THREE.Vector3(), _sfP = new THREE.Vector3();
  const _sfHit = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), body: null, surface: '', owner: null };
  function strFree(p, d, max) {
    const h = G.physics?.raycast ? G.physics.raycast(p, d, max, { out: _sfHit }) : null;
    if (h && h.surface !== 'character' && !(h.body && h.body.mass < 6)) return h.dist;
    return max;
  }

  const C = {
    yaw: 0, pitch: -0.18, dist: 5.2, targetDist: 5.2,
    /** Unit view direction (read-only mirror, updated each frame). */
    forward,
    /** Shoulder offset 0..1 (eased toward 1 while aiming). */
    shoulder: 0,
    /** true while a cinematic owns the camera. */
    get cinematicActive() { return !!cine || releaseT > 0; },
    /** Add a quick FOV punch (degrees ≈ k·10; decays). */
    fovKick(k = 1) { fovKick = Math.max(fovKick, k * 10); },
    /** Snap behind the player next frame (after teleport / respawn). */
    snap() { snapNext = true; },
    /** Point the camera behind a facing yaw (player yaw convention: facing (sin y, cos y)). */
    setBehind(yaw) { C.yaw = yaw + Math.PI; C.pitch = -0.18; },
    /**
     * Fly to a fixed shot and hold it until release(). { pos, look, dur=1.2, ease:'inOut'|'linear'|'out'|'in'|fn }.
     * Resolves when the camera arrives.
     */
    cinematic(o = {}) {
      return new Promise((resolve) => {
        const from = { pos: cam.position.clone(), look: _look.clone() };
        if (cine) { from.pos.copy(cine.cur.pos); from.look.copy(cine.cur.look); cine.resolve?.(); }
        const to = { pos: new THREE.Vector3().copy(o.pos || cam.position), look: new THREE.Vector3().copy(o.look || _look) };
        const ease = typeof o.ease === 'function' ? o.ease : EASES[o.ease] || EASES.inOut;
        cine = { from, to, t: 0, dur: Math.max(0, o.dur ?? 1.2), ease, resolve, cur: { pos: from.pos.clone(), look: from.look.clone() } };
        releaseT = 0;
        if (cine.dur === 0) { cine.t = 1; }
      });
    },
    /** Hand the camera back to the player (eased over ~0.7 s). */
    release() {
      if (!cine) return;
      relFrom.pos.copy(cine.cur.pos); relFrom.look.copy(cine.cur.look);
      cine.resolve?.();
      cine = null;
      releaseT = 0.7;
    },

    update(dt, rdt) {
      const P = G.player;
      const inp = G.input;
      const s = G.settings || {};
      const sens = (s.sens ?? 1) * 0.0024;
      const yMul = s.invertY ? -1 : 1;
      if (G.mode === 'title' || !P || !G.started) { titleShot(rdt); return; }

      // ---- look input ----
      // while the star thread turns a held part (craft: {guard} + mouse) the mouse turns the part, not the view
      const lx = G.craft?.turning ? 0 : inp.lookX, ly = G.craft?.turning ? 0 : inp.lookY;
      if (G.mode === 'play' && !cine) {
        C.yaw -= lx * sens;
        C.pitch = clamp(C.pitch - ly * sens * yMul, -1.25, 1.05);
      }
      idleLook = Math.abs(lx) + Math.abs(ly) > 0.5 ? 0 : idleLook + rdt;

      // ---- pivot ----
      const onBroom = P.onBroom, gliding = P.gliding, swim = P.state === 'swim';
      pivotTarget.copy(P.pos);
      pivotTarget.y += onBroom ? 1.25 : swim ? 0.55 : 1.42;
      if (snapNext) { pivot.copy(pivotTarget); }
      else {
        const k = onBroom ? 18 : 22;
        pivot.x = damp(pivot.x, pivotTarget.x, k, rdt);
        pivot.z = damp(pivot.z, pivotTarget.z, k, rdt);
        // vertical: lazy when stepping / landing, firm when far off
        const dy = pivotTarget.y - pivot.y;
        pivot.y = Math.abs(dy) > 3 ? pivotTarget.y - Math.sign(dy) * 3 : damp(pivot.y, pivotTarget.y, onBroom || gliding ? 10 : 7, rdt);
      }

      // ---- auto-follow on the broom / while gliding when the mouse is idle ----
      if ((onBroom || gliding) && idleLook > 0.8 && P.speed > 4 && !cine) {
        const behind = P.yaw + Math.PI;
        C.yaw = dampAngle(C.yaw, behind, onBroom ? 1.6 : 1.1, rdt);
      }

      // ---- lock-on framing ----
      const lt = G.combat?.lockTarget;
      const tpos = lt && !lt.dead ? (lt.pos || lt.position) : null;
      lockW = damp(lockW, tpos ? 1 : 0, 5, rdt);
      if (tpos && !cine) {
        _v1.set(tpos.x - P.pos.x, 0, tpos.z - P.pos.z);
        if (_v1.lengthSq() > 0.25) {
          const want = Math.atan2(_v1.x, _v1.z) + Math.PI;  // camera behind the player, looking at the target
          C.yaw = dampAngle(C.yaw, want + 0.18, 6, rdt);
          const hd = Math.hypot(_v1.x, _v1.z), dy = (tpos.y + (lt.height || 1.4) * 0.6) - pivot.y;
          C.pitch = damp(C.pitch, clamp(Math.atan2(dy, hd) * 0.6 - 0.2, -0.7, 0.4), 4, rdt);
        }
      }

      // ---- distance ----
      const aiming = !onBroom && (P.aiming || inp.held('cast') || inp.held('attack'));
      C.shoulder = damp(C.shoulder, aiming ? 1 : 0, 8, rdt);
      let want = 5.2;
      const flightDrive = onBroom ? wakeDrive(P.speed) : 0;
      const skim = onBroom ? P.broom.skim : 0;
      if (onBroom) want = 4.55 + 2.8 * flightDrive - .55 * skim;
      else if (gliding) want = 6.6;
      else if (swim) want = 5.6;
      else if (P.state === 'air') want = 5.6;
      want = lerp(want, 3.4, C.shoulder * 0.8);
      want += lockW * 1.4;
      // duel framing (G.fx.duel): both duelists in view — a gentle swing toward the foe when the mouse is idle, a little farther back
      if (!cine) want += G.fx?.duel?.camAssist?.(C, P, rdt, idleLook) || 0;
      // looking up from below: come in so the ground does not fill the screen
      if (C.pitch > 0.1) want *= lerp(1, 0.55, clamp((C.pitch - 0.1) / 0.8));
      C.targetDist = want;

      // ---- desired position ----
      // Preserve aim yaw for steering, but let the chase boom swing out while
      // the rider banks. At speed the horizon and the ground remain in frame.
      chaseYaw = !onBroom || snapNext || cine || tpos ? C.yaw : dampAngle(chaseYaw,C.yaw,10-5*flightDrive,rdt);
      const pitch = C.pitch*(1-.22*skim);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      _dir.set(Math.sin(chaseYaw) * cp, -sp, Math.cos(chaseYaw) * cp); // pivot -> camera
      const rightX = Math.cos(chaseYaw), rightZ = -Math.sin(chaseYaw);
      const sh = 0.28 + 0.42 * C.shoulder;                         // over the right shoulder
      _v2.set(pivot.x + rightX * sh, pivot.y + 0.12 * C.shoulder, pivot.z + rightZ * sh);
      // collision: march terrain + platforms, then physics bodies / static colliders
      let free = want;
      const W = G.world;
      free = Math.min(free, W.raycastGround(_v2, _dir, want + 0.4, 0.3) - 0.35);
      const hit = G.physics?.raycast?.(_v2, _dir, want + 0.3, { exclude: P.physChar });
      if (hit && hit.surface !== 'character' && !(hit.body && hit.body.mass < 6)) free = Math.min(free, hit.dist - 0.3);
      free = Math.max(0.9, free);
      // in quickly, out slowly
      if (snapNext) C.dist = free;
      else C.dist = free < C.dist ? damp(C.dist, free, 30, rdt) : damp(C.dist, free, onBroom ? 4 : 2.6, rdt);
      _pos.copy(_v2).addScaledVector(_dir, C.dist);
      // never inside the ground (or the water surface when swimming)
      const gy = W.groundAt(_pos.x, _pos.z, _pos.y + 0.3);
      const floor = Math.max(gy, swim || (onBroom && W.isWater(_pos.x,_pos.z)) ? W.seaLevel : -Infinity) + 0.35;
      if (_pos.y < floor) _pos.y = floor;
      _look.copy(_v2).addScaledVector(_dir, -6);
      _look.y += 0.15;
      if (onBroom && !cine && !tpos) {
        const lead = .105 * flightDrive;
        _look.x += P.vel.x * lead;
        _look.z += P.vel.z * lead;
        _look.y -= .45*skim;
      }
      if (tpos) { _v3.set(tpos.x, tpos.y + 1, tpos.z); _look.lerp(_v3, 0.25 * lockW); }

      // ---- FOV ----
      fovBase = 60 + 13 * flightDrive + (!onBroom && P.sprinting ? 2 : 0);
      fovKick = damp(fovKick, 0, 4, rdt);
      fov = damp(fov, fovBase + fovKick, 6, rdt);

      // ---- beam struggle: side-on framing — back and up, both casters, both beams and the clash in frame; the beam
      // line sits above the struggle bar. When it breaks: a short kick of the camera away from the blast.
      const stg = G.spells?.struggle;
      const mine = stg && (stg.a.caster === P ? stg.a : stg.b.caster === P ? stg.b : null);
      if (mine && !cine) {
        const foe = mine === stg.a ? stg.b : stg.a;
        _v1.subVectors(foe.origin, mine.origin); _v1.y = 0;
        if (_v1.lengthSq() < 0.01) _v1.set(0, 0, 1);
        const span = Math.min(40, _v1.length());
        _v1.normalize();
        _v3.set(-_v1.z, 0, _v1.x); // side normal; keep the side the camera was already on
        let D = Math.max(8.5, span * 0.62 + 4.5);
        // frame centre: between the two casters, nudged toward the clash
        _v2.lerpVectors(mine.origin, foe.origin, 0.5).lerp(stg.pos, 0.25);
        if (!strSide) {
          // the side the camera is already on, unless a wall / roof stands there and the other side is open
          strSide = (_pos.x - pivot.x) * _v3.x + (_pos.z - pivot.z) * _v3.z >= 0 ? 1 : -1;
          // score: how far the camera spot can be seen from the frame centre and from both casters
          const open = (sd) => {
            let sum = 0;
            for (const o of [_v2, mine.origin, foe.origin]) {
              _sfP.copy(_v2).addScaledVector(_v3, sd * D); _sfP.y += D * 0.3;
              _sfD.subVectors(_sfP, o); const L = _sfD.length(); _sfD.divideScalar(L);
              sum += Math.min(1, strFree(o, _sfD, L) / L);
            }
            return sum;
          };
          const f0 = open(strSide);
          if (f0 < 2.9 && open(-strSide) > f0 + 0.2) strSide = -strSide;
        }
        _v3.multiplyScalar(strSide);
        D = Math.max(4.5, Math.min(D, strFree(_v2, _sfD.copy(_v3).setY(0.3).normalize(), D * 1.05) - 0.6));
        strPos.copy(_v2).addScaledVector(_v3, D).addScaledVector(_v1, -span * 0.06);
        strPos.y = Math.max(_v2.y + D * 0.3, W.groundAt(strPos.x, strPos.z, strPos.y + 2) + 1.4);
        strLook.copy(_v2); strLook.y -= D * 0.1;
        strKickDir.subVectors(strPos, strLook).normalize();
        strWas = true;
      } else {
        strSide = 0;
        if (strWas) { strWas = false; strKick = 1; C.fovKick(0.45); }
      }
      strW = damp(strW, mine && !cine ? 1 : 0, mine ? 5 : 2.2, rdt);
      if (strW > 0.002) { _pos.lerp(strPos, strW); _look.lerp(strLook, strW); }
      if (strKick > 0) {
        strKick = Math.max(0, strKick - rdt * 3.2);
        const k = strKick * strKick * Math.min(1, (1 - strKick) * 12);   // snaps out in ~25 ms, eases back
        _pos.addScaledVector(strKickDir, 0.9 * k); _pos.y += 0.25 * k;
      }

      // duel cinematics (G.fx.duel): a brief dramatic angle on a decisive moment, the look pulled toward the duel's middle
      const duelFov = G.fx?.duel?.camShot?.(_pos, _look, rdt, !!cine) || 0;

      // ---- cinematic blend ----
      if (cine) {
        cine.t = Math.min(1, cine.t + (cine.dur > 0 ? rdt / cine.dur : 1));
        const e = cine.ease(cine.t);
        cine.cur.pos.lerpVectors(cine.from.pos, cine.to.pos, e);
        cine.cur.look.lerpVectors(cine.from.look, cine.to.look, e);
        _pos.copy(cine.cur.pos); _look.copy(cine.cur.look);
        if (cine.t >= 1 && cine.resolve) { const r = cine.resolve; cine.resolve = null; r(); }
      } else if (releaseT > 0) {
        releaseT = Math.max(0, releaseT - rdt);
        const e = easeInOutCubic(1 - releaseT / 0.7);
        _pos.lerpVectors(relFrom.pos, _pos, e);
        _look.lerpVectors(relFrom.look, _look, e);
      }

      cam.position.copy(_pos);
      cam.lookAt(_look);
      const freeFlight = onBroom && !cine && !tpos && !releaseT && strW<.002;
      chaseRoll = damp(chaseRoll,freeFlight ? clamp(-P.broom.bank*.19,-.12,.12) : 0,6,rdt);
      if (freeFlight) cam.rotateZ(chaseRoll);
      const so = G.fx?.shakeOffset;
      if (so) cam.position.add(so);
      const fovOut = fov + duelFov;
      if (Math.abs(cam.fov - fovOut) > 0.01) { cam.fov = fovOut; cam.updateProjectionMatrix(); }
      cam.getWorldDirection(forward);
      snapNext = false;
    },
  };

  /** Title: a slow orbit around the shrine hill with the Sun and Moon in frame. */
  function titleShot(rdt) {
    titleT += rdt;
    const W = G.world;
    const sh = W.POI?.shrine || { x: -540, z: 40 };
    const H = G.player;
    if (H && H.pos && G.mode === 'title') { heroineShot(H.pos, sh, W); return; }
    const sun = G.env.sunDir;
    // stand on the side away from the Sun, swing ±25° around that line
    const base = Math.atan2(-sun.x, -sun.z);
    const a = base + Math.sin(titleT * 0.035) * 0.42;
    const R = 74;
    const cx = sh.x + Math.sin(a) * R, cz = sh.z + Math.cos(a) * R;
    const gy = W.groundAt(cx, cz);
    const hy = W.groundAt(sh.x, sh.z);
    _pos.set(cx, Math.max(gy + 6, hy + 4) + 2 * Math.sin(titleT * 0.05), cz);
    // aim between the shrine and the Sun (low enough that the hill sits in the lower third)
    _v1.set(sh.x, hy + 10, sh.z).sub(_pos).normalize();
    _look.copy(_pos).addScaledVector(_v1.lerp(sun, 0.36).normalize(), 50);
    cam.position.copy(_pos);
    cam.lookAt(_look);
    if (cam.fov !== 62) { cam.fov = 62; cam.updateProjectionMatrix(); }
    cam.getWorldDirection(forward);
    snapNext = true;
  }

  /** Title beauty shot on the dancing heroine: the shrine behind her, she sits left of centre between the menu and the
   *  title name, a slow ±14° sway around her and a gentle breathing dolly. */
  function heroineShot(hp, sh, W) {
    const away = Math.atan2(hp.x - sh.x, hp.z - sh.z);
    const a = away + 0.35 + Math.sin(titleT * 0.06) * 0.24;
    const R = 4.6 + 0.35 * Math.sin(titleT * 0.045);
    const cx = hp.x + Math.sin(a) * R, cz = hp.z + Math.cos(a) * R;
    const gy = W.groundAt(cx, cz);
    _pos.set(cx, Math.max(gy + 0.7, hp.y + 1.05), cz);
    // aim 13° to the right of her so she stands at ~40 % of the frame width, looking slightly up into the sky
    let fx = hp.x - cx, fz = hp.z - cz;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const ca = Math.cos(0.23), sa = Math.sin(0.23);
    _look.set(_pos.x + (fx * ca - fz * sa) * fl, hp.y + 1.25, _pos.z + (fz * ca + fx * sa) * fl);
    cam.position.copy(_pos);
    cam.lookAt(_look);
    if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
    cam.getWorldDirection(forward);
    snapNext = true;
  }

  return C;
}
