// The effect kit: element signatures built from mesh shapes (shapes.js). Recipes (recipes.js) and fx.js call these
// with the burst's centre / scale / colour; every function is fire-and-forget and cheap (a handful of instances).
//
// Per element (the five beats live in fx.js 'spell:cast' + recipes):
//   fire — flame tongues with dark cores and bright rims, a rolling fireball, scorch.   water — thick-edged sheets,
//   foam crown, puddle.   ice — faceted crystals, cold mist ring, frost creep.   wind — stroke arcs + a streaked cone.
//   thunder — glow ring + scorch star (bolts.js does the branching bolt).   earth — shards + dust skirt.
//   sun — radiant petals + talisman (glyph) circle.   moon — crescent arcs + mirror shards.
import {airFrostKit} from './air-frost.js';
import * as THREE from 'three';
import { G } from '../core/game.js';

const TAU = Math.PI * 2;
const _p = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

/** env: { add(opts) -> handle|true|null, ground(x, z, y) -> y, quality() -> 0..1 } */
export function makeKit(env) {
  const add = env.add;
  const q = () => env.quality();
  const at = (x, y, z) => _p.set(x, y, z);
  const gy = (p) => env.ground(p.x, p.z, p.y);
  /** the plane of the ground under a disc of radius r at pos (world/ground.js groundPlane); flat at the ground without it */
  const _bed = { y: 0, up: new THREE.Vector3(0, 1, 0) };
  let bedRef = 0;
  const bedGround = (x, z) => env.ground(x, z, bedRef);
  const bed = (p, r) => {
    bedRef = p.y;
    if (G.world?.groundPlane) return G.world.groundPlane(p.x, p.z, r, _bed, bedGround);
    _bed.y = gy(p); _bed.up.set(0, 1, 0);
    return _bed;
  };
  /** a horizontal unit vector perpendicular-ish to dir (for arc reference axes) */
  const side = (dir, out) => { out.set(-dir.z, 0, dir.x); if (out.lengthSq() < 1e-6) out.set(1, 0, 0); return out.normalize(); };

  const K = {
    ...airFrostKit(env),
    // ---- generic pieces --------------------------------------------------------------------------------------------
    /** expanding shock ring. up = ring normal (default ground) */
    shock(pos, r, col, { up = UP, dur = 0.45, add: a = 0.7, I = 1.6, width = 0.28, delay = 0, col2 = 0xffffff } = {}) {
      add({ kind: 'ring', pos, up, r0: r * (1 - width), r1: r, dur, delay, grow: [0.25, 1], erode: [-0.1, 0.85], tex: 'streak', tile: [3, 1], scroll: [0.4, 0],
        color: col, color2: col2, mode: 'glow', add: a, I, soft: 0.05 });
    },
    /** soft-edged translucent shock dome (air pushed out) */
    dome(pos, r, col, { dur = 0.5, I = 1.2, add: a = 0.75, h = r * 0.8, delay = 0 } = {}) {
      add({ kind: 'dome', pos, r0: r, h, dur, delay, grow: [0.2, 1], erode: [-0.05, 0.75], tex: 'billow', tile: [3, 1.5], scroll: [0.3, -0.6],
        color: col, color2: 0xffffff, mode: 'shell', add: a, I, soft: 0.08, body: 0.6 });
    },
    /** dark scorch / wet / frost mark on the ground that slowly dissolves */
    mark(pos, r, kind = 'scorch', dur = 7) {
      const B = bed(pos, r);   // lies on the ground under the disc, not flat out over a slope
      const P = at(pos.x, B.y + 0.03, pos.z);
      if (kind === 'scorch') add({ kind: 'disc', pos: P, up: B.up, r0: 0, r1: r, dur, grow: [0.6, 1], erode: [0.12, 0.95], tex: 'billow', tile: [3, 1], color: 0x161210, color2: 0x3a2d24,
        mode: 'smoke', body: 0.85, soft: 0.05, core: 0.6 });
      else if (kind === 'frost') add({ kind: 'disc', pos: P, up: B.up, r0: 0, r1: r, dur, grow: [0.25, 1], erode: [0.18, 0.95], tex: 'streak', tile: [Math.max(6, Math.round(r * 4)), 0.7], color: 0xa8d8f4, color2: 0xffffff,
        mode: 'sheet', body: 0.45, soft: 0.05, I: 1.1 });     // feathery frost: streaks run outward from the centre
      else if (kind === 'wet') add({ kind: 'disc', pos: P, up: B.up, r0: 0, r1: r, dur, grow: [0.4, 1], erode: [0.18, 0.95], tex: 'billow', tile: [2, 1], color: 0x1d3b52, color2: 0x9fe0ff,
        mode: 'sheet', body: 0.45, soft: 0.04, I: 0.9 });
      else if (kind === 'crack') add({ kind: 'disc', pos: P, up: B.up, r0: 0, r1: r, dur, grow: [0.5, 1], erode: [0.55, 0.98], tex: 'seams', tile: [3, 1], color: 0x140f0c, color2: 0x2a2019,
        mode: 'smoke', body: 1.0, soft: 0.03, core: 1 });
      else if (kind === 'glow') add({ kind: 'disc', pos: P, up: B.up, r0: 0, r1: r, dur, grow: [0.6, 1], erode: [0.05, 0.95], tex: 'billow', tile: [3, 1], color: 0xffd27a, color2: 0xffffff,
        mode: 'glow', add: 1, I: 0.9, soft: 0.2 });
    },
    /** glyph (talisman) circle: rotating band of invented glyphs */
    glyphs(pos, r, col, { dur = 1.2, up = UP, spin = 0.8, I = 2, delay = 0, handle = false, width = 0.22 } = {}) {
      return add({ kind: 'ring', pos, up, r0: r * (1 - width), r1: r, dur, delay, grow: [0.7, 1], erode: [-0.2, 0.7], tex: 'glyph', tile: [Math.max(3, Math.round(r * 2.2)), 1],
        scroll: [spin * 0.05, 0], color: col, color2: 0xffffff, mode: 'glyph', add: 0.85, I, soft: 0.1, handle });
    },
    // ---- fire ------------------------------------------------------------------------------------------------------
    tongues(pos, n, r, h, { dur = 0.7, I = 1.5, spread = 1, col = 0xff6a14, rim = 0xffe7a0, delay = 0 } = {}) {
      // fire-coloured tongues are flame cards (elements/flames.js); other colours keep the painted lathe
      const F = G.elements?.flames;
      if (F && ((col >> 16) & 255) > 200 && (col & 255) < 120) { F.lick(pos, { n, r, h, dur: dur * 1.15, heat: Math.min(1.1, I / 1.4), spread, delay }); return; }
      n = Math.max(1, Math.round(n * q()));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r * spread;
        const P = at(pos.x + Math.cos(a) * d, pos.y, pos.z + Math.sin(a) * d);
        _u.set(rnd(-0.25, 0.25), 1, rnd(-0.25, 0.25)).normalize();
        add({ kind: 'tongue', pos: P, up: _u, r0: rnd(0.22, 0.38) * h, h: h * rnd(0.7, 1.25), dur: dur * rnd(0.75, 1.2), delay: delay + Math.random() * 0.08,
          grow: [0.35, 1.1], erode: [0.12, 1.0], tex: 'billow', tile: [1, 1.2], scroll: [0, -1.6], color: col, color2: rim, core: 0.42, mode: 'flame', add: 0.35, I, soft: 0.03, wobble: 9 });
      }
    },
    fireball(pos, r, { dur = 0.55, I = 1.5, delay = 0 } = {}) {
      add({ kind: 'sphere', pos, r0: r, h: r * 0.9, dur, delay, grow: [0.35, 1.25], erode: [0.04, 1.0], tex: 'billow', tile: [3, 2], scroll: [0.2, -0.7],
        color: 0xff5a10, color2: 0xfff0b0, core: 0.38, mode: 'flame', add: 0.4, I, soft: 0.03 });
    },
    /** smoke: puffs born low that rise (rise = m/s), swell and fray — a column when called repeatedly */
    smoke(pos, r, { n = 3, dur = 2.2, rise = 1.6, dark = 0x8a8088, delay = 0.12, light = 0xf2ecec } = {}) {
      n = Math.max(1, Math.round(n * q()));
      for (let i = 0; i < n; i++) {
        const P = at(pos.x + rnd(-0.35, 0.35) * r, pos.y + i * 0.25 * r, pos.z + rnd(-0.35, 0.35) * r);
        const rr = r * rnd(0.38, 0.55);
        add({ kind: 'sphere', pos: P, r0: rr, h: rr * rnd(0.8, 1.0), dur: dur * rnd(0.85, 1.15), delay: delay + i * 0.18, grow: [0.55, 1.9], erode: [-0.1, 0.95],
          tex: 'billow', tile: [1, 1], scroll: [0.05, -0.2], color: dark, color2: light, core: 0.9, mode: 'smoke', body: 0.8, soft: 0.16, rise: rise * rnd(0.8, 1.2) });
      }
    },
    // ---- water -----------------------------------------------------------------------------------------------------
    crown(pos, r, { dur = 0.6, I = 1.1, col = 0x3aa8f0, delay = 0 } = {}) {
      add({ kind: 'cone', pos, r0: r * 0.35, r1: r, h: r * 0.9, dur, delay, grow: [0.3, 1.15], erode: [0.05, 1.0], tex: 'billow', tile: [4, 1], scroll: [0, -0.8],
        color: col, color2: 0xf2fbff, core: 0.75, mode: 'sheet', body: 0.55, I, soft: 0.03 });
      add({ kind: 'ring', pos: at(pos.x, gy(pos) + 0.05, pos.z), r0: r * 0.7, r1: r * 1.3, dur: dur * 1.4, delay, grow: [0.4, 1.4], erode: [0.1, 0.95], tex: 'billow', tile: [5, 1],
        color: 0x4cb6ff, color2: 0xffffff, mode: 'sheet', body: 0.35, I, soft: 0.03 });
    },
    sheet(pos, dir, r, { dur = 0.5, I = 1.15 } = {}) {   // a curling water sheet thrown along dir
      add({ kind: 'arc', pos, up: side(dir, _t).cross(dir).normalize(), fwd: dir, r0: r * 0.55, r1: r, span: 2.2, start: -1.1, dur, grow: [0.4, 1.2], erode: [0.05, 1],
        tex: 'billow', tile: [2, 1], scroll: [-1.2, 0], color: 0x2d9be8, color2: 0xf5fdff, core: 0.7, mode: 'sheet', body: 0.6, I, soft: 0.03 });
    },
    // ---- ice -------------------------------------------------------------------------------------------------------
    crystals(pos, n, r, h, { dur = 1.6, I = 1.25, col = 0x8fd2ff, outward = 0.45, delay = 0 } = {}) {
      n = Math.max(1, Math.round(n * q()));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(-0.3, 0.3), d = r * rnd(0.25, 1);
        const P = at(pos.x + Math.cos(a) * d, pos.y - 0.1, pos.z + Math.sin(a) * d);
        _u.set(Math.cos(a) * outward, 1, Math.sin(a) * outward).normalize();
        add({ kind: 'crystal', pos: P, up: _u, r0: h * rnd(0.14, 0.22), h: h * rnd(0.6, 1.2), dur: dur * rnd(0.8, 1.2), delay: delay + Math.random() * 0.1, grow: [0.1, 1], erode: [-0.3, 0.75],
          tex: 'cells', tile: [1, 1], color: col, color2: 0xffffff, core: 1, mode: 'flame', add: 0.2, I, soft: 0.02 });
      }
    },
    coldMist(pos, r, { dur = 1.4 } = {}) {
      add({ kind: 'ring', pos: at(pos.x, gy(pos) + 0.1, pos.z), r0: r * 0.2, r1: r, dur, grow: [0.3, 1.3], erode: [0.15, 1], tex: 'billow', tile: [4, 1], scroll: [0.1, 0.3],
        color: 0xb4d6ec, color2: 0xe6f6ff, mode: 'smoke', body: 0.55, soft: 0.08 });   // final-duel: cold blue, not a white wash
    },
    // ---- wind ------------------------------------------------------------------------------------------------------
    strokes(pos, dir, r, n = 3, { dur = 0.45, col = 0xd6ffe6, I = 1.6 } = {}) {
      n = Math.max(1, Math.round(n * q()));
      side(dir, _f);
      for (let i = 0; i < n; i++) {
        _u.copy(dir).multiplyScalar(rnd(-0.3, 0.3)).add(_t.set(0, 1, 0)).normalize();
        const P = at(pos.x + _f.x * rnd(-0.4, 0.4) * r, pos.y + rnd(-0.4, 0.6) * r * 0.5, pos.z + _f.z * rnd(-0.4, 0.4) * r);
        add({ kind: 'arc', pos: P, up: _u, fwd: dir, r0: r * rnd(0.82, 0.9), r1: r * rnd(0.95, 1.1), span: rnd(1.6, 2.6), start: rnd(0, TAU), dur: dur * rnd(0.8, 1.2),
          delay: i * 0.04, grow: [0.5, 1.1], erode: [-0.15, 0.9], tex: 'streak', tile: [1.5, 1], scroll: [-2.5, 0], color: col, color2: 0xffffff, mode: 'glow', add: 0.6, I, soft: 0.05 });
      }
    },
    gustCone(pos, dir, len, r, { dur = 0.4, col = 0xcaf8dc } = {}) {
      add({ kind: 'cone', pos, up: dir, r0: r * 0.15, r1: r, h: len, dur, grow: [0.6, 1.05], erode: [0.05, 0.95], tex: 'streak', tile: [3, 1], scroll: [0, -3],
        color: col, color2: 0xffffff, mode: 'glow', add: 0.55, I: 1.1, soft: 0.06, body: 0.5 });
    },
    whirl(pos, r, h, { dur = 1.2, col = 0xd6ffe6, twist = 4, I = 1.3, flame = false } = {}) {
      if (flame && G.elements?.flames) { G.elements.flames.whirl({ pos, R: r, H: h * 1.6, dur }); return; }   // a fire whirl of flame cards
      if (flame) {   // a fire whirl: a twisting funnel of painted flame (dark-red heart, bright rim) inside a streaked air cone
        add({ kind: 'cone', pos, r0: r * 0.2, r1: r * 0.7, h, dur, grow: [0.5, 1.05], erode: [0.12, 0.95], tex: 'billow', tile: [2, 1.2], scroll: [2.2, -1.8], twist: twist * 1.4,
          color: 0xd8340a, color2: 0xffd27a, core: 0.55, mode: 'flame', add: 0.35, I: I * 1.1, soft: 0.04, body: 0.95 });
      }
      if (flame) { K.tongues(pos, 3, r * 0.5, h * 0.35, { dur: dur * 0.8 }); return; }   // (a streaked shell over a fire funnel reads as a net)
      add({ kind: 'cone', pos, r0: r * 0.25, r1: r, h, dur, grow: [0.6, 1.1], erode: [0.1, 0.95], tex: 'streak', tile: [2, 1.5], scroll: [1.6, -1.2], twist,
        color: col, color2: 0xffffff, mode: 'glow', add: 0.5, I, soft: 0.06, body: 0.6 });
    },
    // ---- earth -----------------------------------------------------------------------------------------------------
    shards(pos, n, r, h, { dur = 1.4, delay = 0 } = {}) {
      K.crystals(pos, n, r, h, { dur, delay, col: 0x8d7a64, outward: 0.6, I: 1 });
    },
    dustSkirt(pos, r, { dur = 1.6, h = 1.2 } = {}) {
      const y = gy(pos);
      add({ kind: 'cone', pos: at(pos.x, y, pos.z), r0: r * 0.5, r1: r * 1.05, h, dur, grow: [0.35, 1.6], erode: [0.12, 1], tex: 'billow', tile: [5, 1], scroll: [0.05, -0.3],
        color: 0x8a7a66, color2: 0xcfc0a6, core: 0.8, mode: 'smoke', body: 1, soft: 0.06 });
    },
    // ---- sun -------------------------------------------------------------------------------------------------------
    petals(pos, r, { n = 8, dur = 0.55, up = UP, col = 0xffc24a, I = 1.8, delay = 0 } = {}) {
      n = Math.max(4, Math.round(n * Math.max(0.6, q())));
      const st = Math.random() * TAU;
      for (let i = 0; i < n; i++) {
        add({ kind: 'arc', pos, up, r0: r * 0.35, r1: r, span: TAU / n * 0.8, start: st + (i / n) * TAU, dur, delay, grow: [0.2, 1.15], erode: [-0.1, 0.95],
          tex: 'streak', tile: [1, 1], scroll: [0, -1], color: col, color2: 0xfffbe6, core: 1.15, mode: 'glow', add: 0.75, I, soft: 0.04 });
      }
    },
    // ---- moon ------------------------------------------------------------------------------------------------------
    crescents(pos, r, { n = 2, dur = 0.6, up = UP, col = 0xa9c4ff, I = 1.8, dir = null } = {}) {
      for (let i = 0; i < n; i++) {
        if (dir) _u.copy(dir).multiplyScalar(rnd(-0.2, 0.2)).add(side(dir, _t)).normalize(); else _u.copy(up);
        add({ kind: 'arc', pos, up: _u, fwd: dir || undefined, r0: r * 0.62, r1: r * (1 + i * 0.25), span: 3.4, start: rnd(0, TAU), dur: dur * (1 + i * 0.2), delay: i * 0.06,
          grow: [0.4, 1.1], erode: [-0.15, 0.9], tex: 'streak', tile: [1, 1], scroll: [-1.4, 0], color: col, color2: 0xffffff, mode: 'glow', add: 0.7, I, soft: 0.04 });
      }
    },
    mirrors(pos, n, r, { dur = 1.1 } = {}) {
      n = Math.max(1, Math.round(n * q()));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, b = rnd(-0.4, 0.9);
        _u.set(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b));
        const P = at(pos.x + _u.x * r * 0.4, pos.y + _u.y * r * 0.4, pos.z + _u.z * r * 0.4);
        add({ kind: 'crystal', pos: P, up: _u, r0: r * rnd(0.08, 0.14), h: r * rnd(0.35, 0.6), dur: dur * rnd(0.8, 1.2), grow: [0.2, 1.4], erode: [-0.3, 0.9],
          tex: 'cells', tile: [1, 1], color: 0xc8d8ff, color2: 0xffffff, mode: 'flame', core: 1, add: 0.5, I: 1.5, soft: 0.02 });
      }
    },
  };
  return K;
}
