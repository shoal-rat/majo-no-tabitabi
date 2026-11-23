import * as THREE from 'three';

// Fixed world-space nodes, in metres. Recentering copies the overlapping rectangle
// at integer cell offsets. Both time levels must move together for the wave to keep
// its velocity. The grid stays behind with the water when the broom flies away.
const STEP = 1 / 40;
const WAVE_SPEED = 6.7;
const DECAY = Math.exp(-1.05 * STEP);
const FOAM_DECAY = Math.exp(-2.8 * STEP);
const HEIGHT_RANGE = 1.5;
const SLOPE_RANGE = 1.5;

export class PressureField {
  constructor(tier, depthAt) {
    this.n = [88, 112, 136][tier];
    this.cell = [.78, .64, .54][tier];
    this.depthAt = depthAt;
    const len = this.n * this.n;
    this.h = new Float32Array(len);
    this.prev = new Float32Array(len);
    this.froth = new Float32Array(len);
    this.wet = new Uint8Array(len);
    // Layer 0: height, slopes and breaking froth of the pressure waves. Layer 1: the foam the
    // broom left along its track, copied from the shared wake map over a wider, coarser window
    // (one array texture: the water shader has no texture unit to spare for a second map).
    this.pixels = new Uint8Array(len * 8);
    this.layers = [this.h, this.prev, this.froth, this.wet]; // h/prev swap each step; the set stays the same
    this.texture = new THREE.DataArrayTexture(this.pixels, this.n, this.n, 2);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.texture.name = 'water:pressure height, slope and breaking foam; trail foam';
    this.mapping = new THREE.Vector4(); // first node x,z; inverse world span; half a texel
    this.foamCell = [2.2, 1.9, 1.6][tier];
    this.foamMapping = new THREE.Vector4(); // same layout for the trail-foam layer; z = 0 when empty
    this.foamInk = false;
    this.x0 = this.z0 = NaN;
    this.carry = this.remaining = this.ticks = 0;
    this.aftReach = 10;
    this.lastX = this.lastZ = NaN;
  }

  moveTo(x, z, refreshDepth = false) {
    const n = this.n, cell = this.cell;
    const x0 = Math.round(x / cell) - (n >> 1), z0 = Math.round(z / cell) - (n >> 1);
    let sx = x0 - this.x0, sz = z0 - this.z0;
    if (Math.abs(sx) < 5 && Math.abs(sz) < 5) {
      if (refreshDepth) this.survey();
      return false;
    }
    if (!Number.isFinite(sx) || Math.abs(sx) >= n || Math.abs(sz) >= n) {
      this.h.fill(0); this.prev.fill(0); this.froth.fill(0); this.wet.fill(0);
      sx = sz = n;
    } else {
      const start = Math.max(0, -sx), end = Math.min(n, n - sx);
      // Copy rows toward the vacated side so a still-needed row is never overwritten.
      for (const a of this.layers) {
        for (let row = 0; row < n; row++) {
          const j = sz >= 0 ? row : n - 1 - row;
          const i = j * n, old = (j + sz) * n;
          if (j + sz < 0 || j + sz >= n) { a.fill(0, i, i + n); continue; }
          a.copyWithin(i + start, old + start + sx, old + end + sx);
          a.fill(0, i, i + start);
          a.fill(0, i + end, i + n);
        }
      }
    }
    this.x0 = x0; this.z0 = z0;
    this.mapping.set(x0 * cell, z0 * cell, 1 / (n * cell), .5 / n);
    this.survey(refreshDepth ? n : sx, sz);
    return true;
  }

  survey(sx = this.n, sz = this.n) {
    const n = this.n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (j + sz >= 0 && j + sz < n && i + sx >= 0 && i + sx < n) continue;
      const k = j * n + i;
      const depth = this.depthAt((this.x0 + i) * this.cell, (this.z0 + j) * this.cell);
      this.wet[k] = Math.round(255 * THREE.MathUtils.smoothstep(depth, .04, .8));
      if (!this.wet[k]) this.h[k] = this.prev[k] = this.froth[k] = 0;
    }
  }

  press(s, x, z, time) {
    if (this.depthAt(x, z) < .06) return;
    const n = this.n, cell = this.cell;
    const cx = x / cell - this.x0, cz = z / cell - this.z0;
    const width = .87 + .73 * s.drive, length = 1.24 + 1.15 * s.drive;
    const fast = THREE.MathUtils.smoothstep(s.speed,28,34);
    const turning = THREE.MathUtils.smoothstep(s.speed,18,28)*Math.abs(s.turn);
    const reach = Math.ceil((width * 2.8 + length + 2.2*fast + .65*turning) / cell);
    const i0 = Math.max(1, Math.floor(cx)-reach), i1 = Math.min(n-2, Math.ceil(cx)+reach);
    const j0 = Math.max(1, Math.floor(cz)-reach), j1 = Math.min(n-2, Math.ceil(cz)+reach);
    let atShore = false;
    for (let j = j0; j <= j1 && !atShore; j++) {
      for (let i = i0; i <= i1; i++) if (!this.wet[j*n+i]) { atShore = true; break; }
    }
    // Integral over travelled distance, so a texel receives the same displacement
    // at different frame rates. Shed strength flickers independently on each bank.
    const push = s.speed * STEP * s.drive / (1.77245 * length);
    const pulse = Math.sin(11 * time) * .13 + Math.sin(17.7 * time) * .09;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * n + i;
        if (!this.wet[k]) continue;
        if (atShore && !this.wetSegment(cx,cz,i,j)) continue;
        const ox = (i-cx) * cell, oz = (j-cz) * cell;
        const across = oz*s.dx - ox*s.dz, along = ox*s.dx + oz*s.dz;
        const side = across < 0 ? -1 : 1, bank = side*s.turn;
        const outer = Math.max(0,bank);
        // At planing speed, water expelled outboard rebounds in a second
        // shoulder. Split the original load between both crests and the drawdown
        // between them. A turn feeds the wider, outside arc first.
        const split = .57*fast + .32*turning*outer*(1-.55*fast);
        const ridgeX = width * (1.44 + .31*bank + side*.07*pulse) + outer*.27*turning;
        const u = across / width, v = (Math.abs(across) - ridgeX) / (.50 + .29*s.drive + .12*bank);
        const tip = along / length, aft = (along + .62*Math.abs(across)) / length;
        const trough = -1.04 * Math.exp(-u*u - tip*tip);
        const load = .88 + .46*bank + side*pulse;
        const ridge = load*(1-.44*split) * Math.exp(-v*v - aft*aft);
        let returnWave = 0;
        if (split > .002) {
          const gap = 2.0 + .88*fast + .62*outer;
          const distance = Math.abs(across) - ridgeX;
          const crest = (distance-gap)/(.65+.14*outer);
          const hollow = (distance-.54*gap)/(.66+.10*outer);
          const delayed = (along + .46*Math.abs(across) + 1.55 + 1.45*fast)/(length*1.16);
          returnWave = load*split*Math.exp(-delayed*delayed)*
            (.98*Math.exp(-crest*crest) - .83*Math.exp(-hollow*hollow));
        }
        const h = push * (trough + ridge + returnWave) * this.wet[k] / 255;
        this.h[k] += h;
        this.prev[k] += h;
        this.froth[k] = Math.min(1, this.froth[k] + Math.max(0, ridge*push-.021)*.62);
      }
    }
  }

  // A tongue of dry ground can separate two wet cells a metre apart.
  wetSegment(cx,cz,i,j) {
    const di = i-cx, dj = j-cz;
    const steps = Math.ceil(Math.max(Math.abs(di),Math.abs(dj))*1.5);
    for (let a = 0; a < steps; a++) {
      if (!this.wet[Math.round(cz+dj*a/steps)*this.n + Math.round(cx+di*a/steps)]) return false;
    }
    return true;
  }

  step() {
    const n = this.n, h = this.h, next = this.prev;
    const kWave = (WAVE_SPEED * STEP / this.cell) ** 2;
    for (let j = 1; j < n-1; j++) for (let i = 1; i < n-1; i++) {
      const k = j*n+i, a = h[k];
      if (!this.wet[k]) continue;
      const lap = h[k-1] + h[k+1] + h[k-n] + h[k+n] - 4*a;
      // The shoreline dissipates energy. The outer band absorbs waves leaving
      // the moving tile so they do not reflect from its square boundary.
      const border = Math.min(i,j,n-1-i,n-1-j,5) * .2;
      const loss = (.70+.30*border)*(.62+.38*this.wet[k]/255);
      const d = (a - next[k])*DECAY + kWave*lap;
      next[k] = (a + d*loss) * (.985+.015*loss);
      this.froth[k] = Math.max(this.froth[k] * FOAM_DECAY, Math.min(1, Math.max(0, -lap-.020) * 1.65));
    }
    // These cells may have moved from the interior during a window shift.
    for (let i = 0; i < n; i++) {
      next[i] = next[(n-1)*n+i] = next[i*n] = next[i*n+n-1] = 0;
    }
    this.prev = h; this.h = next;
    this.ticks++;
  }

  upload() {
    const n = this.n, p = this.pixels, h = this.h;
    const scale = 127 / HEIGHT_RANGE, grad = 127 / (2*this.cell*SLOPE_RANGE);
    for (let j = 0, k = 0; j < n; j++) for (let i = 0; i < n; i++, k++) {
      const o = k * 4;
      if (!i || !j || i === n-1 || j === n-1 || !this.wet[k]) {
        p[o] = p[o+1] = p[o+2] = 128; p[o+3] = 0; continue;
      }
      p[o] = Math.round(128 + Math.max(-127, Math.min(127, h[k]*scale)));
      p[o+1] = Math.round(128 + Math.max(-127, Math.min(127, (h[k+1]-h[k-1])*grad)));
      p[o+2] = Math.round(128 + Math.max(-127, Math.min(127, (h[k+n]-h[k-n])*grad)));
      p[o+3] = Math.round(this.froth[k]*255);
    }
    this.texture.addLayerUpdate(0);
    this.texture.needsUpdate = true;
  }

  // Copy the trail foam (alpha of the shared wake map: a toroidal window, `bounds` = origin x, z,
  // span, texel) into layer 1 around (x, z). Called a few times a second while foam is out.
  paintFoam(image, bounds, x, z) {
    const n = this.n, fc = this.foamCell, base = n * n * 4, p = this.pixels;
    if (!image || !(bounds.z > 0)) {
      if (this.foamInk) {
        for (let o = base + 3; o < p.length; o += 4) p[o] = 0;
        this.foamInk = false; this.texture.addLayerUpdate(1); this.texture.needsUpdate = true;
      }
      this.foamMapping.z = 0;
      return;
    }
    const cell = bounds.w, N = Math.round(bounds.z / cell), data = image;
    const fx0 = Math.round(x / fc) - (n >> 1), fz0 = Math.round(z / fc) - (n >> 1);
    const lo = cell, hiX = bounds.z - cell;
    let ink = false;
    for (let j = 0, o = base + 3; j < n; j++) {
      const wz = (fz0 + j + .5) * fc, lz = wz - bounds.y;
      const v = wz / cell - .5, iv = Math.floor(v), fv = v - iv;
      const r0 = (((iv % N) + N) % N) * N, r1 = ((((iv + 1) % N) + N) % N) * N;
      for (let i = 0; i < n; i++, o += 4) {
        const wx = (fx0 + i + .5) * fc, lx = wx - bounds.x;
        if (lx < lo || lz < lo || lx > hiX || lz > hiX) { p[o] = 0; continue; }
        const u = wx / cell - .5, iu = Math.floor(u), fu = u - iu;
        const c0 = ((iu % N) + N) % N, c1 = (((iu + 1) % N) + N) % N;
        const a = data[(r0 + c0) * 4 + 3], b = data[(r0 + c1) * 4 + 3];
        const c = data[(r1 + c0) * 4 + 3], d = data[(r1 + c1) * 4 + 3];
        const f = (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
        p[o] = f; if (f > 2) ink = true;
      }
    }
    this.foamInk = ink;
    this.foamMapping.set(fx0 * fc, fz0 * fc, ink ? 1 / (n * fc) : 0, .5 / n);
    this.texture.addLayerUpdate(1);
    this.texture.needsUpdate = true;
  }

  advance(dt, time, source, refreshDepth = false) {
    let changed = false;
    if (source) {
      this.remaining = 5;
      const reach = 10 + 12*THREE.MathUtils.smoothstep(source.speed,28,34);
      // Decelerating leaves the older waves in view while their energy decays.
      this.aftReach = Math.max(reach,this.aftReach+(reach-this.aftReach)*(1-Math.exp(-dt*.70)));
      changed = this.moveTo(source.x-source.dx*this.aftReach, source.z-source.dz*this.aftReach, refreshDepth);
    } else {
      this.lastX = this.lastZ = NaN;
      if (!this.remaining) return;
      this.remaining = Math.max(0, this.remaining-dt);
      if (!this.remaining) {
        this.x0 = this.z0 = NaN;
        this.carry = 0; this.mapping.z = 0; this.aftReach = 10;
        return;
      }
      if (refreshDepth) this.survey();
    }
    const elapsed = Math.min(dt,.15);
    this.carry += elapsed;
    const linked = source && Math.hypot(source.x-this.lastX,source.z-this.lastZ) < 8;
    while (this.carry >= STEP-1e-9) {
      this.carry -= STEP;
      if (source) {
        const blend = Math.max(0, this.carry) / elapsed;
        this.press(source, source.x + (linked ? (this.lastX-source.x)*blend : 0),
          source.z + (linked ? (this.lastZ-source.z)*blend : 0), time-this.carry);
      }
      this.step(); changed = true;
    }
    if (source) { this.lastX = source.x; this.lastZ = source.z; }
    if (changed || refreshDepth) this.upload();
  }

  heightAt(x, z) {
    if (!this.remaining) return 0;
    const u = x/this.cell-this.x0, v = z/this.cell-this.z0;
    if (u < 0 || v < 0 || u >= this.n-1 || v >= this.n-1) return 0;
    const i = Math.floor(u), j = Math.floor(v), k = (j*this.n+i)*4, row = this.n*4;
    const a = u-i, b = v-j, p = this.pixels;
    const lo = p[k] + a*(p[k+4]-p[k]), hi = p[k+row] + a*(p[k+row+4]-p[k+row]);
    return (lo + b*(hi-lo)-128) * HEIGHT_RANGE/127;
  }
}
