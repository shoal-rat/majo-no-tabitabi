// The white plume torn off the water behind a skimming broom: sheets of beads thrown up and out
// to either side, soft clots that fill the gaps between them, fine spindrift wound up into the
// vortex pair, and a faint mist left hanging behind. Soft camera-facing sprites, one draw.
//
// The recipe (which kinds, how they are thrown, how long they hang) is adapted from Petalwake
// (src/fx/windfx.js, src/fx/particles.js), MIT License, Copyright (c) 2026 Jacob Miller; the full
// notice is reproduced at the top of src/world/flora/wake-field.js.
import * as THREE from 'three';

const smooth = THREE.MathUtils.smoothstep;
const rand = (a, b) => a + Math.random() * (b - a);
const DAY_TOP = new THREE.Color(.95, .97, .98), DAY_LOW = new THREE.Color(.68, .79, .85);
const NIGHT_TOP = new THREE.Color(.34, .44, .52), NIGHT_LOW = new THREE.Color(.15, .21, .28);

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec4 iPos, iVel, iMisc;   // xyz size · velocity, stretch (s) · alpha, seed
varying vec2 vUv;
varying float vAlpha, vSeed;
void main() {
  vUv = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(iPos.xyz, 1.0);
  // beads in a thrown sheet are drawn out along their flight
  vec2 sv = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xy;
  float sl = length(sv);
  vec2 dir = sl > 1e-3 ? sv / sl : vec2(0.0, 1.0);
  vec2 off = (vec2(dir.y, -dir.x) * position.x + dir * position.y * (1.0 + iVel.w * sl)) * iPos.w;
  mvPosition.xy += off;
  // the plume streams right past the lens: thin it out there instead of filling the frame
  vAlpha = iMisc.x * smoothstep(1.2, 3.6, -mvPosition.z);
  vSeed = iMisc.y;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform vec3 uTop, uLow;
varying vec2 vUv;
varying float vAlpha, vSeed;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  // a few soft lobes per sprite, so the plume reads as torn water rather than discs
  float a = atan(vUv.y, vUv.x);
  float lobes = 0.80 + 0.11 * sin(a * 3.0 + vSeed * 40.0) + 0.09 * sin(a * 5.0 - vSeed * 70.0);
  float alpha = (1.0 - smoothstep(lobes * 0.42, lobes, r)) * vAlpha;
  if (alpha < 0.008) discard;
  gl_FragColor = vec4(mix(uLow, uTop, 0.5 + 0.5 * vUv.y), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class WakeSpray {
  constructor(G, tier) {
    const q = G.quality || {};
    this.G = G;
    // a dense plume so speed reads at a glance; phones keep a smaller one that is still plain to see
    const n = this.capacity = q.mobile ? 240 : [280, 420, 560][tier];
    this.rate = q.mobile ? .6 : [.6, .8, 1][tier];
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.size = new Float32Array(n); this.grow = new Float32Array(n); this.alpha = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.wake = new Float32Array(n);
    this.stretch = new Float32Array(n); this.seed = new Float32Array(n); this.floor = new Float32Array(n);
    this.hint = new Int16Array(n).fill(-1);
    this.credit = new Float32Array(4);
    this.next = 0; this.live = 0; this.emitted = 0;
    this.air = new THREE.Vector3(); this.probe = new THREE.Vector3();
    this.range = { start: 0, count: 0 };
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    const attr = () => new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aPos = attr(); this.aVel = attr(); this.aMisc = attr();
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iVel', this.aVel); geo.setAttribute('iMisc', this.aMisc);
    this.attrs = [this.aPos, this.aVel, this.aMisc];
    geo.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTop: { value: DAY_TOP.clone() }, uLow: { value: DAY_LOW.clone() } }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    this.material.name = 'water:wake spray';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'water:wake spray plume';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -5;
    this.mesh.visible = false;
    G.scene.add(this.mesh);
  }

  // a point `lat` metres to the outside of the bristles and `back` metres behind them (reused vector)
  at(lat, back) {
    const t = this.tip, dx = this.dx, dz = this.dz;
    return this.probe.set(t.x - dz * lat - dx * back, 0, t.z + dx * lat - dz * back);
  }
  count(kind, perSecond, dt) {
    const c = this.credit[kind] + perSecond * dt;
    const n = Math.floor(c);
    this.credit[kind] = c - n;
    return Math.min(n, this.capacity >> 2);
  }
  emit(x, y, z, vx, vy, vz, surface, size, grow, alpha, life, grav, drag, stretch, wake) {
    const i = this.next, i3 = i * 3;
    this.next = (i + 1) % this.capacity;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.grow[i] = grow; this.alpha[i] = alpha;
    this.grav[i] = grav; this.drag[i] = drag; this.stretch[i] = stretch; this.wake[i] = wake;
    this.seed[i] = Math.random(); this.floor[i] = surface - .05; this.hint[i] = -1;
    this.emitted++;
  }

  /**
   * Throw spray off the water at the bristles. k = how hard the brush is skimming (0..1+),
   * turn > 0 loads the outside (-dz, dx) of the turn.
   */
  spray(dt, tip, surface, dx, dz, vx, vz, k, turn) {
    if (k <= .01) return;
    const r = this.rate * k, rx = -dz, rz = dx;
    this.tip = tip; this.dx = dx; this.dz = dz;
        // rooster tails: two sheets of beads thrown up and out to either side
    let n = this.count(0, 280 * r, dt);
    for (let j = 0; j < n; j++) {
      const side = Math.random() < .5 + .3 * turn ? 1 : -1, outer = Math.max(0, side * turn);
      const p = this.at(side * rand(.05, .7), rand(-.3, 2.4)), along = rand(.45, .85), out = side * rand(1.5, 8) * (1 + .5 * outer);
      this.emit(p.x, surface + rand(0, .2), p.z, vx * along + rx * out, rand(2, 9) * (.6 + .4 * Math.min(1, k)) * (1 + .35 * outer),
        vz * along + rz * out, surface, rand(.035, .075), .2, rand(.6, .95), rand(.6, 1.4), 9.8, .8, .025, .6);
    }
    // the body of the plume: soft clots that hide the gaps between the beads
    n = this.count(1, 180 * r, dt);
    for (let j = 0; j < n; j++) {
      const side = Math.random() < .5 + .3 * turn ? 1 : -1, outer = Math.max(0, side * turn);
      const p = this.at(side * rand(0, .6), rand(0, 2)), along = rand(.5, .75), out = side * rand(1, 6) * (1 + .4 * outer);
      this.emit(p.x, surface + rand(0, .2), p.z, vx * along + rx * out, rand(1.5, 6.5) * (1 + .3 * outer), vz * along + rz * out,
        surface, rand(.2, .42), rand(.6, 1.2), rand(.30, .52), rand(.45, .95), 7.5, .8, .012, 0);
    }
    // spindrift: fine spray light enough to be wound up into the two vortices
    n = this.count(2, 220 * r, dt);
    for (let j = 0; j < n; j++) {
      const lat = rand(-2.4, 2.4), p = this.at(lat, rand(-2, 3)), along = rand(.3, .6);
      this.emit(p.x, surface + rand(.05, .45), p.z, vx * along + rx * lat * .8, rand(.4, 3), vz * along + rz * lat * .8,
        surface, rand(.05, .11), .3, rand(.4, .75), rand(1, 2.2), 4.5, rand(14, 22), .006, 1);
    }
    // mist hanging behind, too heavy with water to be carried far
    n = this.count(3, 25 * r, dt);
    for (let j = 0; j < n; j++) {
      const lat = rand(-1.6, 1.6), p = this.at(lat, rand(0, 3)), along = rand(.15, .4);
      this.emit(p.x, surface + rand(.2, .9), p.z, vx * along + rx * lat * 1.2, rand(.8, 2.6), vz * along + rz * lat * 1.2,
        surface, rand(.5, .9), rand(1.5, 2.5), rand(.04, .08), rand(1.2, 2.2), .3, 1.4, 0, .3);
    }
  }

  update(dt, trail, time) {
    const P = this.pos, V = this.vel, aP = this.aPos.array, aV = this.aVel.array, aM = this.aMisc.array, air = this.air;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] >= this.life[i]) continue;
      const age = this.age[i] += dt, life = this.life[i];
      const i3 = i * 3;
      if (age >= life) continue;
      const e = 1 - Math.exp(-this.drag[i] * dt), wk = this.wake[i];
      if (wk > 0 && trail && age < 2) {
        this.probe.set(P[i3], P[i3 + 1], P[i3 + 2]);
        trail.sample(this.probe, time, air, this.hint[i]);
        this.hint[i] = trail.hit ?? -1;
        V[i3] += (air.x * wk - V[i3]) * e; V[i3 + 2] += (air.z * wk - V[i3 + 2]) * e;
        V[i3 + 1] += (air.y * wk - V[i3 + 1]) * e * .5;
      } else {
        V[i3] -= V[i3] * e; V[i3 + 2] -= V[i3 + 2] * e;
      }
      V[i3 + 1] -= this.grav[i] * dt;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      if (V[i3 + 1] < 0 && P[i3 + 1] < this.floor[i]) { this.age[i] = life; continue; }
      const o = live * 4;
      aP[o] = P[i3]; aP[o + 1] = P[i3 + 1]; aP[o + 2] = P[i3 + 2];
      aP[o + 3] = this.size[i] * (1 + this.grow[i] * age / life);
      aV[o] = V[i3]; aV[o + 1] = V[i3 + 1]; aV[o + 2] = V[i3 + 2]; aV[o + 3] = this.stretch[i];
      aM[o] = this.alpha[i] * Math.min(1, age * 12) * (1 - smooth(age, life * .55, life));
      aM[o + 1] = this.seed[i]; aM[o + 2] = aM[o + 3] = 0;
      live++;
    }
    this.live = live;
    this.mesh.geometry.instanceCount = live;
    this.mesh.visible = live > 0;
    if (!live) return;
    this.range.count = live * 4;
    for (let k = 0; k < 3; k++) { const a = this.attrs[k]; a.updateRanges.length = 0; a.updateRanges.push(this.range); a.needsUpdate = true; }
    const night = smooth(this.G.env?.veil ?? 0, .5, .8), u = this.material.uniforms;
    u.uTop.value.copy(DAY_TOP).lerp(NIGHT_TOP, night);
    u.uLow.value.copy(DAY_LOW).lerp(NIGHT_LOW, night);
  }
}
