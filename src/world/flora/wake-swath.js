// The laid swath drawn on the ground itself: a soft ribbon along the broom's track, multiplied in the
// same mown-stripe tones as the laid blades (lighter where it lies away from the eye, darker toward it).
// It tints the ground between laid blades and carries the channel on past the blade rings, where
// the terrain's own paint takes over. The terrain program has no texture unit left for the wake
// map, so the swath is its own mesh: one draw, segments in a ring, no allocation after start.
import * as THREE from 'three';

const ACROSS = 7;   // vertices across the ribbon

const VERT = /* glsl */`
attribute vec4 aInfo;   // laid time, recovery duration (s), strength, lateral (-1..1)
attribute vec2 aDir;    // direction of travel
uniform float uTime;
varying float vAlpha, vAway;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float age = uTime - aInfo.x, dur = aInfo.y;
  float left = age < 0.0 || age >= dur ? 0.0 : 1.0 - smoothstep(0.12 * dur, dur, age);
  float l = aInfo.w, bell = 0.74 * exp(-2.6 * l * l) + 0.26 * exp(-0.5 * l * l);
  vec2 fromEye = world.xz - cameraPosition.xz;
  float dist = length(fromEye);
  // under the dense near blades the laid blades carry most of the tone; far off it fades with the haze
  vAlpha = aInfo.z * left * bell * (0.6 + 0.4 * smoothstep(10.0, 40.0, dist)) * (1.0 - smoothstep(150.0, 260.0, dist));
  vAway = dot(aDir, fromEye / max(dist, 0.001));
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
// Multiplied onto what is already drawn (ground and blades), so the stripe keeps its contrast on
// any green: darker where the lay faces the eye, a little lighter where it runs away from it.
const FRAG = /* glsl */`
uniform vec3 uShade, uAcross, uSheen;
varying float vAlpha, vAway;
void main() {
  float away = clamp(vAway, -1.0, 1.0);
  vec3 tone = away < 0.0 ? mix(uAcross, uShade, -away) : mix(uAcross, uSheen, away);
  float a = clamp(vAlpha, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0), tone, a), 1.0);
}`;
const SHADE_DAY = new THREE.Color(.56, .72, .52), ACROSS_DAY = new THREE.Color(.74, .86, .70), SHEEN_DAY = new THREE.Color(1.2, 1.24, 1.12);
const SHADE_NIGHT = new THREE.Color(.7, .78, .76), ACROSS_NIGHT = new THREE.Color(.84, .9, .88), SHEEN_NIGHT = new THREE.Color(1.06, 1.08, 1.08);

export class WakeSwath {
  constructor(G, q = G.quality || {}) {
    this.G = G;
    const K = this.K = q.mobile || q.name === 'low' ? 160 : 256;
    const rows = K * 2, verts = rows * ACROSS;
    this.pos = new Float32Array(verts * 3);
    this.info = new Float32Array(verts * 4);
    this.dir = new Float32Array(verts * 2);
    const index = new Uint16Array(K * (ACROSS - 1) * 6);
    for (let k = 0, o = 0; k < K; k++) {
      const r0 = k * 2 * ACROSS, r1 = r0 + ACROSS;
      for (let a = 0; a < ACROSS - 1; a++) {
        index[o++] = r0 + a; index[o++] = r1 + a; index[o++] = r0 + a + 1;
        index[o++] = r0 + a + 1; index[o++] = r1 + a; index[o++] = r1 + a + 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aInfo = new THREE.BufferAttribute(this.info, 4).setUsage(THREE.DynamicDrawUsage);
    this.aDir = new THREE.BufferAttribute(this.dir, 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aInfo', this.aInfo); geo.setAttribute('aDir', this.aDir);
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uShade: { value: SHADE_DAY.clone() }, uAcross: { value: ACROSS_DAY.clone() }, uSheen: { value: SHEEN_DAY.clone() },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      // result = destination × fragment colour
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      toneMapped: false,
    });
    this.material.name = 'flora:wake swath';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'flora:wake swath';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -9;
    this.mesh.visible = false;
    G.scene?.add(this.mesh);
    this.next = 0; this.count = 0; this.last = -Infinity; this.dirty = false;
  }

  /** Lay one segment of swath from (x0, z0) to (x1, z1). W = half-width of the core (m). */
  add(x0, z0, x1, z1, W, shift, strength, dur, time) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < .05 || strength < .02) return;
    const dx = (x1 - x0) / len, dz = (z1 - z0) / len, k = this.next, world = this.G.world;
    this.next = (k + 1) % this.K; this.count = Math.min(this.count + 1, this.K);
    for (let end = 0; end < 2; end++) {
      const cx = (end ? x1 : x0) - dz * shift, cz = (end ? z1 : z0) + dx * shift;
      for (let a = 0; a < ACROSS; a++) {
        const l = a / (ACROSS - 1) * 2 - 1, off = l * 2.2 * W;
        const v = (k * 2 + end) * ACROSS + a, x = cx - dz * off, z = cz + dx * off;
        this.pos[v * 3] = x; this.pos[v * 3 + 1] = (world?.heightAt?.(x, z) ?? 0) + .1; this.pos[v * 3 + 2] = z;
        this.info[v * 4] = time; this.info[v * 4 + 1] = dur; this.info[v * 4 + 2] = strength; this.info[v * 4 + 3] = l * 2.2;
        this.dir[v * 2] = dx; this.dir[v * 2 + 1] = dz;
      }
    }
    this.last = Math.max(this.last, time + dur);
    this.dirty = true;
  }

  update(time) {
    if (time < this.last - 60) { this.count = 0; this.last = -Infinity; this.info.fill(0); this.dirty = true; } // clock reset
    this.mesh.visible = this.count > 0 && time < this.last;
    if (this.dirty) {
      this.aPos.needsUpdate = this.aInfo.needsUpdate = this.aDir.needsUpdate = true;
      this.dirty = false;
    }
    const u = this.material.uniforms;
    u.uTime.value = time;
    const night = THREE.MathUtils.smoothstep(this.G.env?.veil ?? 0, .45, .85);
    u.uShade.value.copy(SHADE_DAY).lerp(SHADE_NIGHT, night);
    u.uAcross.value.copy(ACROSS_DAY).lerp(ACROSS_NIGHT, night);
    u.uSheen.value.copy(SHEEN_DAY).lerp(SHEEN_NIGHT, night);
  }
}
