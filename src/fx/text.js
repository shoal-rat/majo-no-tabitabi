// Floating world-space words and numbers: damage numbers, status words, the heroine's callouts. One instanced draw call
// over a canvas atlas of 512×128 slots (32 on low / mobile, 64 above); a label already drawn is reused. Size is constant
// on screen so it stays readable near and far.
// The caller passes an already translated string (see DESIGN §5.5); this module never makes up text, except the ×N
// repeat suffix, which comes from loc (fx.repeat).
//
// The look ("combat type" round, docs/api/fx.md): every slot is drawn once in white with a thin dark INNER stroke, a soft
// dark shadow and a light outer glow; the shader colours it per label (a vertical gradient from near-white to the label's
// colour, a dark ink tinted to match), so "12" in gold and "12" in thunder violet share one slot. Words use the brush
// face (core.meta.fontTitle) with a forward slant; numbers use the display serif (core.meta.fontDisplay) at weight 800,
// condensed to 85 %; big hits carry their element's pictogram (or a four-point star) beside the number.
//
// Kinds (opts.kind) and how one target's labels stay readable:
//   'dmg'    a damage number. Big hits pop elastically (1.6× → 1×) and take two lanes. Other hits of the same element on
//            the same target (opts.target) roll into ONE number while they keep coming (gap ≤ MERGE_GAP): it bumps on
//            every tick and grows from a faint chip (60 % size, 70 % opacity, a small sideways arc, gone 0.5 s after the
//            last tick) to a full number. A fire tornado on a guardian is one climbing number per element.
//   'word'   a status word (失衡, 护盾碎了 …). The same word on the same target within WORD_GAP updates one label to
//            「失衡 ×3」 instead of stacking.
//   'call'   the heroine's own moment (弹开了, 星尘弹回去了): small, above her head and to the left, never mid-frame.
//   (none)   older callers: the old rise-and-fade motion, drawn in the new style.
// Labels with a target take lanes above its head (lane 0 just over the anchor), so they never sit on each other;
// top(target) tells the HUD how much room they use (the foe plate lifts over them).
import * as THREE from 'three';
import { t } from '../core/i18n.js';
import { fontsReady, whenFontsReady, fontStack } from '../core/fonts.js';
import { iconPaths } from '../ui/icons.js';

const SW = 512, SH = 128, SCOLS = 4;
const CAP = 64, STRIDE = 16;
export const TEXT_K = 0.075;          // view-space height of one size unit per metre of depth (constant on screen)
export const LANE = 0.5;              // lane pitch in size units
const LANE0 = 0.34;                   // lane 0's centre above the anchor, in size units
const MAXL = 6;                       // lanes per target
const MERGE_GAP = 0.55;               // a tick within this of the last one rolls into the same number (tornado ticks: 0.5 s)
const ROLL_MAX = 3;                   // a rolling number closes after this long; the next tick starts a new one
const WORD_GAP = 1.0;                 // the same word on the same target within this becomes ×N
const CHIP_MAX = 12;                  // a rolling sum below this is a chip
const HOLD = { chip: 0.62, num: 0.85, big: 1.25 };   // seconds a number stays after its last tick (a chip outlasts MERGE_GAP)
const ST = { chip: 0, num: 1, big: 2, word: 3, call: 4, legacy: 5 };
const SIZE = { chip: 0.5, num: 0.84, big: 1.48, word: 0.7, call: 0.6 };
const SLANT = Math.tan(-8 * Math.PI / 180);
/** pictogram beside a big hit; no element (or the charm stream's sun) gets the four-point star */
const GLYPH = { fire: 'fire', water: 'water', ice: 'ice', wind: 'wind', thunder: 'thunder', earth: 'earth', moon: 'moon' };

const VERT = /* glsl */`
attribute vec2 corner;    // -0.5..0.5
attribute vec4 t0;        // position, birth
attribute vec4 t1;        // end, size, slot, aspect (drawn width / slot height)
attribute vec4 t2;        // colour (linear), seed
attribute vec4 t3;        // style, lane (size units above the anchor), bump time, opacity
uniform float uTime;
varying vec2 vUv;
varying float vS;
varying vec3 vTop;
varying vec3 vBot;
varying vec3 vInk;
varying float vA;
void main() {
  float age = uTime - t0.w, left = t1.x - uTime;
  if (age < 0.0 || left <= 0.0) { gl_Position = vec4(0.0, 0.0, 3.0, 1.0); return; }
  int style = int(t3.x + 0.5);
  float seed = t2.w;
  vec4 mv = viewMatrix * vec4(t0.xyz, 1.0);
  float u = clamp(-mv.z * ${TEXT_K}, style == 4 ? 0.04 : 0.3, 9.0);   // one size unit in view space (her callout: no near floor)
  float pop = 1.0, fadeIn = 0.04, fadeOut = 0.22;
  vec2 off = vec2(0.0, ${LANE0} + t3.y);
  if (style == 0) {            // chip: a small sideways arc
    float s = seed * 2.0 - 1.0, a = min(age / 0.55, 1.0);
    off += vec2(s * 0.3 * a, 0.16 * sin(a * 2.4));
    pop = mix(0.75, 1.0, smoothstep(0.0, 0.08, age));
    fadeOut = 0.16;
  } else if (style == 1) {     // number: a quick pop, a short rise
    pop = age < 0.07 ? mix(0.6, 1.22, age / 0.07) : mix(1.22, 1.0, clamp((age - 0.07) / 0.12, 0.0, 1.0));
    off.y += 0.12 * (1.0 - exp(-age * 6.0));
  } else if (style == 2) {     // big hit: elastic 1.6 -> 1.0
    pop = 1.0 + 0.6 * exp(-age * 6.5) * cos(age * 21.0);
    fadeIn = 0.02;
    off.y += 0.14 * (1.0 - exp(-age * 5.0));
  } else if (style == 3) {     // status word: slides in from the left, settles
    float k = smoothstep(0.0, 0.18, age);
    off.x -= 0.22 * (1.0 - k);
    pop = mix(1.14, 1.0, k);
    off.y += 0.1 * (1.0 - exp(-age * 6.0));
  } else if (style == 4) {     // the heroine's callout: beside her shoulder, to the left, drifting up a little
    off = vec2(-(0.5 * t1.w * t1.y + 0.12), 0.3 + 0.2 * (1.0 - exp(-age * 5.0)));
    pop = mix(1.18, 1.0, smoothstep(0.0, 0.14, age));
  } else {                     // older callers: pop-in with overshoot, ease-out rise, a little drift
    float dur = t1.x - t0.w;
    float rise = 1.0 - pow(1.0 - min(age / (dur * 0.8), 1.0), 3.0);
    off = vec2((seed - 0.5) * 1.2 * rise * t1.y, 0.2 / max(u, 0.01) + 1.1 * rise / max(u, 0.01));
    pop = age < 0.12 ? mix(0.3, 1.3, age / 0.12) : mix(1.3, 1.0, clamp((age - 0.12) / 0.14, 0.0, 1.0));
    fadeOut = 0.3 * dur;
  }
  // a merged label bumps on every update
  float b = uTime - t3.z;
  if (b >= 0.0) pop *= 1.0 + 0.26 * exp(-b * 15.0);
  // the exit: a short lift as it fades
  float gone = 1.0 - smoothstep(0.0, fadeOut, left);
  off.y += 0.22 * gone;
  float h = t1.y * u * pop;
  vec4 mc = mv;
  mc.xy += off * u;
  if (style == 4) mc.x -= 0.6;   // clear of her body: 0.6 m beside her (world size), then the label's own half width
  mv.xy = mc.xy + vec2(corner.x * t1.w, corner.y) * h;
  gl_Position = projectionMatrix * mv;
  if (style == 4) {
    // her callout stays on screen (a close camera puts her shoulders at the frame's edge): past the left edge it moves to
    // her right side instead of onto her, and it never leaves the frame
    vec2 lim = vec2(0.8, 0.72);
    vec4 cc = projectionMatrix * mc;
    if (cc.x / cc.w < -lim.x) {
      float dx = -2.0 * off.x * u + 1.2;
      mc.x += dx; mv.x += dx;
      gl_Position = projectionMatrix * mv;
      cc = projectionMatrix * mc;
    }
    vec2 n = cc.xy / cc.w;
    gl_Position.xy += (clamp(n, -lim, lim) - n) * gl_Position.w;
  }
  float col = mod(t1.z, ${SCOLS}.0), row = floor(t1.z / ${SCOLS}.0);
  vUv = vec2(col * ${SW}.0 + ${SW / 2}.0 + corner.x * t1.w * ${SH}.0, row * ${SH}.0 + ${SH / 2}.0 - corner.y * ${SH}.0) / uAtlas;
  vS = 0.5 - corner.y;
  vec3 c = t2.rgb;
  vTop = mix(c, vec3(1.0), 0.62);
  vBot = c * vec3(0.92, 0.88, 0.86);
  vInk = c * 0.09 + vec3(0.022, 0.016, 0.045);
  vA = t3.w * smoothstep(0.0, fadeIn, age) * (1.0 - gone);
}
`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying float vS;
varying vec3 vTop;
varying vec3 vBot;
varying vec3 vInk;
varying float vA;
void main() {
  vec4 tx = texture2D(uMap, vUv);
  float a = tx.a * vA;
  if (a < 0.004) discard;
  // white = fill and glow (the gradient), black = the inner stroke and the shadow (the ink)
  vec3 grad = mix(vTop, vBot, smoothstep(0.24, 0.74, vS));
  gl_FragColor = vec4(mix(vInk, grad, tx.r), a);
  #include <colorspace_fragment>
}
`;

export class FloatText {
  /** opts.slots 32|64 (atlas rows ×4), opts.renderer () => WebGLRenderer (partial uploads; else whole re-uploads). */
  constructor(renderOrder, opts = {}) {
    this.nslot = opts.slots >= 64 ? 64 : 32;
    this.rows = this.nslot / SCOLS;
    this.getRenderer = opts.renderer || (() => null);
    // the atlas lives on the GPU; each new label is drawn on a one-slot stage and copied into its slot (texSubImage2D),
    // so a new number uploads 256 KB, not the whole atlas
    this.canvas = document.createElement('canvas');
    this.canvas.width = SW * SCOLS; this.canvas.height = SH * this.rows;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.flipY = false;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter; this.tex.magFilter = THREE.LinearFilter;
    this.stage = document.createElement('canvas'); this.stage.width = SW; this.stage.height = SH;
    this.sx = this.stage.getContext('2d');
    this.layer = document.createElement('canvas'); this.layer.width = SW; this.layer.height = SH;
    this.lx = this.layer.getContext('2d');
    this.stageTex = new THREE.Texture(this.stage);   // never bound: copyTextureToTexture reads its canvas directly
    this._dst = new THREE.Vector2();
    this.slotKey = new Array(this.nslot).fill(null);
    this.slotAspect = new Float32Array(this.nslot);
    this.slotUse = new Float32Array(this.nslot).fill(-1e9);    // last time a label using the slot was spawned
    this.cache = new Map();
    this.texDirty = false;
    this.glyphs = new Map();

    this.f = new Float32Array(CAP * STRIDE);
    this.dirty = false;
    // the JS side of each instance (merges and lanes)
    this.iEnd = new Float64Array(CAP);
    this.iOwner = new Array(CAP).fill(null);
    this.iLane = new Int8Array(CAP).fill(-1);
    this.iLanes = new Int8Array(CAP);
    this.iSum = new Float64Array(CAP);
    this.iCount = new Int32Array(CAP);
    this.iLast = new Float64Array(CAP);
    this.iText = new Array(CAP).fill('');
    this.iStyle = new Int8Array(CAP);
    this.targets = new WeakMap();   // target -> { lanes: Float64Array(MAXL) end times, roll: Map el -> i, words: Map text -> i }

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.buf = new THREE.InstancedInterleavedBuffer(this.f, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 4; i++) g.setAttribute('t' + i, new THREE.InterleavedBufferAttribute(this.buf, 4, i * 4));
    g.instanceCount = CAP;
    this.uTime = { value: 0 };
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uTime: this.uTime, uAtlas: { value: new THREE.Vector2(SW * SCOLS, SH * this.rows) } },
      vertexShader: 'uniform vec2 uAtlas;\n' + VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fxText';
  }

  // ---- the atlas -----------------------------------------------------------------------------------------------------

  /** Slot holding this label (drawn now if new). A slot is free when no live instance shows it. */
  _slot(key, spec, now) {
    let s = this.cache.get(key);
    if (s === undefined) {
      const used = this._used || (this._used = new Uint8Array(this.nslot));
      used.fill(0);
      for (let i = 0; i < CAP; i++) if (this.iEnd[i] > now) used[this.f[i * STRIDE + 6] | 0] = 1;
      let best = -1, bestT = Infinity;
      for (let i = 0; i < this.nslot; i++) if (!used[i] && this.slotUse[i] < bestT) { bestT = this.slotUse[i]; best = i; }
      if (best < 0) {
        // every slot is on screen: take the one whose label ends first, and end that label now
        let endT = Infinity;
        for (let i = 0; i < CAP; i++) if (this.iEnd[i] > now && this.iEnd[i] < endT) { endT = this.iEnd[i]; best = this.f[i * STRIDE + 6] | 0; }
        for (let i = 0; i < CAP; i++) if ((this.f[i * STRIDE + 6] | 0) === best) this._kill(i);
      }
      s = best;
      if (this.slotKey[s] !== null) this.cache.delete(this.slotKey[s]);
      this.slotKey[s] = key; this.cache.set(key, s);
      this._draw(s, spec);
    }
    this.slotUse[s] = now;
    return s;
  }

  _glyph(name) {
    let p = this.glyphs.get(name);
    if (p === undefined) {
      const list = iconPaths(name) || [];
      p = list.map((q) => (q.c ? { c: q.c } : { p: new Path2D(q.d), w: q.w }));
      this.glyphs.set(name, p);
    }
    return p;
  }

  /** spec: { text, num (serif numerals), suffix ('×3', serif), glyph (icon name), slant } */
  _draw(s, spec) {
    // a label drawn before the faces arrive is forgotten once they do
    if (!fontsReady() && !this._waitFonts) { this._waitFonts = true; whenFontsReady(() => { this._waitFonts = false; this.invalidate(); }); }
    const c = this.lx, num = !!spec.num;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, SW, SH);
    const fs = num ? 98 : 80;
    const face = num ? `800 ${fs}px ${fontStack('display')}` : `400 ${fs}px ${fontStack('title')}`;
    const cond = num ? 0.85 : 1;
    c.font = face;
    const m = c.measureText(spec.text);
    const tw = m.width * cond;
    const asc = m.actualBoundingBoxAscent || fs * 0.72, desc = m.actualBoundingBoxDescent || 0;
    let sw = 0, sfs = 0;
    const sface = () => `700 ${sfs}px ${fontStack('display')}`;
    if (spec.suffix) { sfs = Math.round(fs * 0.52); c.font = sface(); sw = fs * 0.14 + c.measureText(spec.suffix).width * 0.9; }
    const gs = spec.glyph ? fs * 0.6 : 0, gw = gs ? gs + fs * 0.1 : 0;
    const PAD = 24;
    const slant = spec.slant ? -SLANT * (asc + desc) * 0.5 : 0;
    const total = gw + tw + sw + slant;
    const k = Math.min(1, (SW - 2 * PAD) / total);
    c.translate(SW / 2, SH / 2 + (asc - desc) / 2 * k);
    c.scale(k, k);
    if (spec.slant) c.transform(1, 0, SLANT, 1, 0, 0);
    const x0 = -total / 2;
    const midY = -(asc - desc) / 2;
    const paint = (stroke) => {
      if (gs) {
        const list = this._glyph(spec.glyph);
        c.save();
        c.translate(x0 + gs / 2, midY); c.scale(gs / 24, gs / 24); c.translate(-12, -12);
        for (const q of list) {
          if (q.c) { c.beginPath(); c.arc(q.c[0], q.c[1], q.c[2], 0, Math.PI * 2); if (stroke) { const lw = c.lineWidth; c.lineWidth = lw * 24 / gs; c.stroke(); c.lineWidth = lw; } else c.fill(); continue; }
          if (q.w > 0) { if (stroke) continue; const lw = c.lineWidth; c.lineWidth = q.w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(q.p); c.lineWidth = lw; }
          else if (stroke) { const lw = c.lineWidth; c.lineWidth = lw * 24 / gs; c.stroke(q.p); c.lineWidth = lw; }
          else c.fill(q.p);
        }
        c.restore();
      }
      c.save();
      c.translate(x0 + gw, 0); c.scale(cond, 1);
      c.font = face; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      if (stroke) c.strokeText(spec.text, 0, 0); else c.fillText(spec.text, 0, 0);
      c.restore();
      if (spec.suffix) {
        c.save();
        c.translate(x0 + gw + tw + fs * 0.14, 0); c.scale(0.9, 1);
        c.font = sface(); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
        if (stroke) c.strokeText(spec.suffix, 0, 0); else c.fillText(spec.suffix, 0, 0);
        c.restore();
      }
    };
    c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineJoin = 'round';
    paint(false);
    // the thin dark stroke runs INSIDE the letter: stroked over the fill, kept only where the fill is
    c.globalCompositeOperation = 'source-atop';
    c.strokeStyle = '#000'; c.lineWidth = 6;
    paint(true);
    c.globalCompositeOperation = 'source-over';
    // on the stage: a light outer glow, a soft dark shadow, then the letters
    const x = this.sx;
    x.clearRect(0, 0, SW, SH);
    // (the glow is wide and faint: it lifts the label off dark ground; the shadow is close and dense: it carries the label
    // on a bright sky, where the glow cannot)
    x.shadowOffsetX = 0; x.shadowOffsetY = 0; x.shadowBlur = 20; x.shadowColor = 'rgba(255,255,255,0.42)';
    x.drawImage(this.layer, 0, 0);
    x.shadowOffsetY = 3; x.shadowBlur = 9; x.shadowColor = 'rgba(0,0,0,0.85)';
    x.drawImage(this.layer, 0, 0);
    x.shadowOffsetY = 0; x.shadowBlur = 4; x.shadowColor = 'rgba(0,0,0,0.95)';
    x.drawImage(this.layer, 0, 0);
    x.drawImage(this.layer, 0, 0);   // twice: a dense soft edge that holds the letters over fire and bright sky
    x.shadowColor = 'rgba(0,0,0,0)'; x.shadowBlur = 0; x.shadowOffsetY = 0;
    x.drawImage(this.layer, 0, 0);
    this.slotAspect[s] = Math.min(SW, total * k + 2 * PAD) / SH;
    this._upload(s);
  }

  _upload(s) {
    const x0 = (s % SCOLS) * SW, y0 = Math.floor(s / SCOLS) * SH;
    const r = this.getRenderer();
    if (r && !this._hooked && r.domElement) { this._hooked = true; r.domElement.addEventListener('webglcontextrestored', () => this.invalidate()); }
    if (r && r.copyTextureToTexture) {
      try { r.copyTextureToTexture(this.stageTex, this.tex, null, this._dst.set(x0, y0)); return; } catch (e) { /* fall back below */ }
    }
    // no renderer yet: keep a copy on the atlas canvas and upload it whole
    const ac = this._ac || (this._ac = this.canvas.getContext('2d'));
    ac.clearRect(x0, y0, SW, SH); ac.drawImage(this.stage, x0, y0);
    this.texDirty = true;
  }

  // ---- labels --------------------------------------------------------------------------------------------------------

  _free(now) {
    let best = 0, bestT = Infinity;
    for (let i = 0; i < CAP; i++) { const e = this.iEnd[i]; if (e <= now) { best = i; bestT = -1; break; } if (e < bestT) { bestT = e; best = i; } }
    this._kill(best);
    this.iText[best] = ''; this.iCount[best] = 0;
    return best;
  }
  _kill(i) {
    this.iEnd[i] = 0; this.f[i * STRIDE + 4] = 0; this.iOwner[i] = null; this.iLane[i] = -1; this.dirty = true;
  }
  _tstate(target) {
    let st = this.targets.get(target);
    if (!st) { st = { lanes: new Float64Array(MAXL), roll: new Map(), words: new Map() }; this.targets.set(target, st); }
    return st;
  }
  /** lowest run of n free lanes (else the run that frees first) */
  _lane(st, n, now) {
    let best = 0, bestT = Infinity;
    for (let l = 0; l + n <= MAXL; l++) {
      let e = 0;
      for (let j = 0; j < n; j++) e = Math.max(e, st.lanes[l + j]);
      if (e <= now) return l;
      if (e < bestT) { bestT = e; best = l; }
    }
    return best;
  }
  _hold(st, i) { const l = this.iLane[i]; if (l < 0) return; for (let j = 0; j < this.iLanes[i]; j++) st.lanes[l + j] = Math.max(st.lanes[l + j], this.iEnd[i]); }

  _write(i, x, y, z, now, end, size, slot, col, seed, style, lane, bump, alpha) {
    const o = i * STRIDE, f = this.f;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = now;
    f[o + 4] = end; f[o + 5] = size; f[o + 6] = slot; f[o + 7] = this.slotAspect[slot];
    f[o + 8] = col.r; f[o + 9] = col.g; f[o + 10] = col.b; f[o + 11] = seed;
    f[o + 12] = style; f[o + 13] = lane; f[o + 14] = bump; f[o + 15] = alpha;
    this.iEnd[i] = end; this.iStyle[i] = style;
    this.dirty = true;
  }
  /** re-point a live instance at new text (a rolling number, a ×N word) and bump it */
  _update(i, spec, key, now, end, size, style) {
    const o = i * STRIDE, f = this.f;
    const s = this._slot(key, spec, now);
    f[o + 4] = end; f[o + 5] = size; f[o + 6] = s; f[o + 7] = this.slotAspect[s];
    f[o + 12] = style; f[o + 14] = now; f[o + 15] = style === ST.chip ? 0.7 : 1;
    this.iEnd[i] = end; this.iStyle[i] = style;
    this.dirty = true;
  }

  /** The general entry (fx.text). col: THREE.Color (linear). seed: the caller's one Math.random() draw. */
  add(x, y, z, str, col, opts, now, seed) {
    const kind = opts.kind, target = opts.target || null;
    if (kind === 'dmg') return this._dmg(x, y, z, str, col, opts, now, seed, target);
    if (kind === 'word' || kind === 'call') return this._word(x, y, z, str, col, opts, now, seed, target, kind === 'call');
    // older callers: the old motion, the new look (numbers in the serif)
    const size = (opts.size ?? 1) * 0.9, dur = opts.dur ?? 1.1;
    const isNum = /^[+\-]?\d+$/.test(str);
    const key = (isNum ? 'n|' : 'w|') + str;
    const s = this._slot(key, { text: str, num: isNum }, now);
    this._write(this._free(now), x, y, z, now, now + dur, size, s, col, seed, ST.legacy, 0, -9, 1);
  }

  _dmg(x, y, z, str, col, opts, now, seed, target) {
    const n = Number(opts.n ?? str) || 0;
    const big = !!opts.big;
    const el = opts.el || '';
    if (big) {
      const glyph = GLYPH[el] || 'stardust';
      const key = 'b|' + str + '|' + glyph;
      const s = this._slot(key, { text: str, num: true, glyph }, now);
      const i = this._free(now), end = now + HOLD.big;
      let lane = 0;
      if (target) { const st = this._tstate(target); lane = this._lane(st, 2, now); this.iOwner[i] = target; this.iLane[i] = lane; this.iLanes[i] = 2; }
      this._write(i, x, y, z, now, end, SIZE.big, s, col, seed, ST.big, lane * LANE + LANE * 0.5, -9, 1);
      if (target) this._hold(this._tstate(target), i);
      return;
    }
    if (target) {
      const st = this._tstate(target);
      const i = st.roll.get(el);
      if (i !== undefined && this.iOwner[i] === target && this.iText[i] === 'r|' + el && this.iEnd[i] > now && now - this.iLast[i] <= MERGE_GAP && now - this.f[i * STRIDE + 3] < ROLL_MAX) {
        // roll into the live number
        const sum = this.iSum[i] + n;
        this.iSum[i] = sum; this.iLast[i] = now;
        const chip = sum < CHIP_MAX;
        const txt = String(Math.round(sum));
        const end = now + (chip ? HOLD.chip : HOLD.num);
        this._update(i, { text: txt, num: true }, 'n|' + txt, now, end, chip ? SIZE.chip : SIZE.num, chip ? ST.chip : ST.num);
        const o = i * STRIDE; this.f[o + 8] = col.r; this.f[o + 9] = col.g; this.f[o + 10] = col.b;
        this._hold(st, i);
        return;
      }
    }
    const chip = n < CHIP_MAX;
    const txt = String(Math.round(n));
    const s = this._slot('n|' + txt, { text: txt, num: true }, now);
    const i = this._free(now), end = now + (chip ? HOLD.chip : HOLD.num);
    let lane = 0;
    if (target) {
      const st = this._tstate(target);
      lane = this._lane(st, 1, now);
      this.iOwner[i] = target; this.iLane[i] = lane; this.iLanes[i] = 1;
      this.iSum[i] = n; this.iLast[i] = now; this.iText[i] = 'r|' + el;
      st.roll.set(el, i);
    }
    this._write(i, x, y, z, now, end, chip ? SIZE.chip : SIZE.num, s, col, seed, chip ? ST.chip : ST.num, lane * LANE, -9, chip ? 0.7 : 1);
    if (target) this._hold(this._tstate(target), i);
  }

  _word(x, y, z, str, col, opts, now, seed, target, call) {
    const dur = Math.max(0.9, opts.dur ?? (call ? 0.95 : 1.2));
    const size = (call ? SIZE.call : SIZE.word) * (opts.size ?? 1);
    const style = call ? ST.call : ST.word;
    if (target && !call) {
      const st = this._tstate(target);
      const i = st.words.get(str);
      if (i !== undefined && this.iOwner[i] === target && this.iStyle[i] === ST.word && this.iText[i] === str && this.iEnd[i] > now && now - this.iLast[i] <= WORD_GAP) {
        const cnt = ++this.iCount[i];
        this.iLast[i] = now;
        const suffix = t('fx.repeat', { n: cnt });
        this._update(i, { text: str, suffix, slant: true }, 'w|' + str + '|' + suffix, now, now + dur, size, style);
        this._hold(st, i);
        return;
      }
    }
    const s = this._slot('w|' + str, { text: str, slant: true }, now);
    const i = this._free(now);
    let lane = 0;
    if (target && !call) {
      const st = this._tstate(target);
      lane = this._lane(st, 1, now);
      this.iOwner[i] = target; this.iLane[i] = lane; this.iLanes[i] = 1;
      this.iText[i] = str; this.iCount[i] = 1; this.iLast[i] = now;
      st.words.set(str, i);
    }
    this._write(i, x, y, z, now, now + dur, size, s, col, seed, style, lane * LANE, -9, 1);
    if (target && !call) this._hold(this._tstate(target), i);
  }

  /** Room the target's labels take above their anchor right now, in size units (0 when none). */
  top(target, now) {
    const st = target && this.targets.get(target);
    if (!st) return 0;
    let top = -1;
    for (let l = 0; l < MAXL; l++) if (st.lanes[l] > now) top = l;
    return top < 0 ? 0 : LANE0 + (top + 1) * LANE;
  }

  flush() {
    if (this.dirty) { this.dirty = false; this.buf.needsUpdate = true; }
    if (this.texDirty) { this.texDirty = false; this.tex.needsUpdate = true; }
  }

  live(now) { let n = 0; for (let i = 0; i < CAP; i++) if (this.iEnd[i] > now) n++; return n; }
  rebase(delta) {
    const f = this.f;
    for (let i = 0; i < CAP; i++) {
      const o = i * STRIDE;
      f[o + 3] -= delta; f[o + 4] -= delta; f[o + 14] -= delta;
      this.iEnd[i] -= delta; this.iLast[i] -= delta;
    }
    for (let i = 0; i < this.nslot; i++) this.slotUse[i] -= delta;
    // lane end times live in per-target state: labels re-register as they come, so stale lanes just read as free
    this.targets = new WeakMap();
    for (let i = 0; i < CAP; i++) this.iOwner[i] = null;
    this.dirty = true;
  }
  clear() { this.f.fill(0); this.iEnd.fill(0); this.iOwner.fill(null); this.iLane.fill(-1); this.targets = new WeakMap(); this.dirty = true; }
  /** Locale changed or the faces arrived: drawn labels may now be wrong (font) — forget them. */
  invalidate() { this.cache.clear(); this.slotKey.fill(null); }
}
