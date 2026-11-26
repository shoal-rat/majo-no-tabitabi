// Audio — WebAudio engine for 《月帷巫女》 (DESIGN §6.4).  G.audio
//
//   master(settings.master; 0 when muted) → compressor → destination
//     ├ music bus (settings.music) → music duck (menus / dialogue / stingers)
//     ├ stinger bus (settings.music)            short jingles over the ducked music
//     ├ world: sfx bus (settings.sfx) + ambience bus → low-pass (menus, under water) → world duck
//     └ ui bus (settings.sfx)                  never filtered
//
// One-shots come from the NAME TABLE (names.js); loops are handles; music is two-or-more crossfading decks that remember
// where each exploring track stopped. The automatic music + ambience director lives in director.js.
import * as THREE from 'three';
import { G } from '../core/game.js';
import { clamp } from '../core/util.js';
import { SFX, resolveTable, STEP, MUSIC, MUSIC_TRIM, MUSIC_LOOP, MUSIC_LAYERS } from './names.js';
import { renderSynth, SYNTH_KINDS } from './synth.js';
import { createDirector } from './director.js';

const MAX_VOICES = 40;        // global one-shot cap
const LRU = { music: 4, amb: 8 };   // music: a fight's track and its intensity layer count as two
// phones (docs/api/perf.md "Phone memory"): a decoded track is 35–75 MB of PCM (float, stereo, 48 kHz); four of them
// plus eight ambience beds were ~230 MB of an iPhone tab's memory. Only what plays stays decoded (a fight: its track and
// its layer; a crossfade: both tracks until the old one is silent, then it goes at once — updateMusic); a track that
// comes back later is decoded again (its place in the track is remembered: A.resume)
const LRU_MOBILE = { music: 1, amb: 2 };
const lru = (kind) => (G.quality?.mobile ? LRU_MOBILE : LRU)[kind];
const PEND_MAX = 0.25;        // a one-shot whose file is still decoding starts late only within this window (s)
const REF_DIST = 4;           // full volume within this distance (m)
const EXPLORE = new Set(['sun', 'dusk', 'night', 'home', 'pages', 'town', 'flight']);

const T = resolveTable(SFX);
const _right = new THREE.Vector3();
const _d = new THREE.Vector3();

const A = {
  ctx: null, muted: false, muteKey: null,
  nodes: {},
  cache: new Map(),           // id -> { buf, state:'loading'|'ok'|'error'|'skipped', p, used, kind, inUse }
  synth: new Map(),           // kind -> AudioBuffer
  voices: [],                 // one-shot voices
  polyCount: new Map(),       // name -> live voices
  last: new Map(),            // name -> last start (real s)
  lastPick: new Map(),        // name -> last id index
  loops: [],                  // loop handles (incl. ambience beds)
  decks: [],                  // music decks
  resume: new Map(),          // track id -> { offset, at }
  override: undefined,        // manual music() mood (undefined = director)
  intensity: 0,               // fight intensity 0..1 from the director: fades in a track's layer (MUSIC_LAYERS)
  intensityOverride: null,    // tests: a fixed intensity instead of the director's
  musicTarget: null,          // mood last asked for (director or manual)
  stingerUntil: 0,
  unknown: new Set(), missing: new Set(), decodeErrors: [],
  stats: { calls: 0, played: 0, cooled: 0, culled: 0, stolen: 0, dropped: 0, unknown: 0, late: 0, maxVoices: 0, maxPerName: {} },
  duck: { music: 1, world: 1, lp: 20000 },
  director: null,
  preloadQ: null,
};

const now = () => G.time.real;
const kindOf = (id) => (id.startsWith('bgm_') ? 'music' : id.startsWith('amb_') ? 'amb' : 'sfx');
const isMuted = () => { const m = G.params.mute; return !!m && m !== '0' && m !== 'false'; };

// ------------------------------------------------------------------ buffers
function synthBuf(kind) {
  if (!A.ctx) return null;
  let b = A.synth.get(kind);
  if (!b) { try { b = renderSynth(A.ctx, kind); } catch (e) { G.reportError('audio:synth', e); b = null; } A.synth.set(kind, b); }
  return b;
}

/** Buffer for an asset id if decoded (touches LRU), else null. */
function ready(id) {
  const c = A.cache.get(id);
  if (c && c.state === 'ok') { c.used = now(); return c.buf; }
  return null;
}

/** Decode on demand. Long files (music / ambience) are not decoded while muted. Resolves to AudioBuffer | null. */
function ensure(id) {
  if (!A.ctx) return Promise.resolve(null);
  let c = A.cache.get(id);
  if (c && (c.state === 'ok' || c.state === 'loading' || c.state === 'error')) return c.p;
  const kind = kindOf(id);
  if (A.muted && kind !== 'sfx') {
    if (!c) A.cache.set(id, (c = { buf: null, state: 'skipped', p: Promise.resolve(null), used: now(), kind, inUse: 0 }));
    return c.p;
  }
  if (!G.assets?.has?.(id)) { A.missing.add(id); A.cache.set(id, (c = { buf: null, state: 'error', p: Promise.resolve(null), used: now(), kind, inUse: 0 })); return c.p; }
  c = { buf: null, state: 'loading', p: null, used: now(), kind, inUse: c?.inUse || 0 };
  A.cache.set(id, c);
  c.p = (async () => {
    try {
      const ab = await G.assets.arrayBuffer(id);
      if (!ab) throw new Error('no data');
      const buf = await A.ctx.decodeAudioData(ab);
      c.buf = buf; c.state = 'ok'; c.used = now();
      if (kind !== 'sfx') evict(kind);
      return buf;
    } catch (e) {
      c.state = 'error';
      A.decodeErrors.push({ id, message: String(e?.message || e) });
      console.warn('[audio] cannot decode', id, e?.message || e);
      return null;
    }
  })();
  return c.p;
}

function evict(kind) {
  const list = [];
  for (const [id, c] of A.cache) if (c.kind === kind && c.state === 'ok') list.push([id, c]);
  if (list.length <= lru(kind)) return;
  list.sort((a, b) => a[1].used - b[1].used);
  for (const [id, c] of list.slice()) {   // a copy: removing from `list` while walking it skipped the next entry
    if (list.length <= lru(kind)) break;
    if (c.inUse > 0) continue;
    if (G.quality?.mobile && !c.played && now() - c.used < 10) continue;   // phones: just decoded, its deck may still wait for its layer
    A.cache.delete(id);
    list.splice(list.findIndex((x) => x[0] === id), 1);
  }
}

// ------------------------------------------------------------------ graph
function buildGraph() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = (A.ctx = new Ctx({ latencyHint: 'interactive' }));
  const gain = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const N = A.nodes;
  N.master = gain(0);
  N.comp = ctx.createDynamicsCompressor();
  N.comp.threshold.value = -14; N.comp.knee.value = 10; N.comp.ratio.value = 3; N.comp.attack.value = 0.006; N.comp.release.value = 0.25;
  N.master.connect(N.comp); N.comp.connect(ctx.destination);
  N.music = gain(); N.musicDuck = gain(); N.music.connect(N.musicDuck); N.musicDuck.connect(N.master);
  N.stinger = gain(); N.stinger.connect(N.master);
  N.lp = ctx.createBiquadFilter(); N.lp.type = 'lowpass'; N.lp.frequency.value = 20000; N.lp.Q.value = 0.5;
  N.worldDuck = gain(); N.lp.connect(N.worldDuck); N.worldDuck.connect(N.master);
  N.sfx = gain(); N.sfx.connect(N.lp);
  N.amb = gain(); N.amb.connect(N.lp);
  N.ui = gain(); N.ui.connect(N.master);
}

function setVolumes() {
  const s = G.settings || {};
  A.muted = isMuted(); A.muteKey = G.params.mute;
  if (!A.ctx) return;
  const N = A.nodes, t = A.ctx.currentTime;
  const v = (x, d) => clamp(Number.isFinite(+x) ? +x : d, 0, 1);
  N.master.gain.setTargetAtTime(A.muted ? 0 : v(s.master, 0.8), t, 0.05);
  N.music.gain.setTargetAtTime(v(s.music, 0.6), t, 0.05);
  N.stinger.gain.setTargetAtTime(v(s.music, 0.6) * 0.6 + v(s.sfx, 0.85) * 0.4, t, 0.05);
  N.sfx.gain.setTargetAtTime(v(s.sfx, 0.85), t, 0.05);
  N.amb.gain.setTargetAtTime(v(s.sfx, 0.85) * 0.85, t, 0.05);
  N.ui.gain.setTargetAtTime(v(s.sfx, 0.85) * 0.9, t, 0.05);
}

function unlock() {
  const c = A.ctx;
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

// ------------------------------------------------------------------ listener / positional
function spatial(pos, range, out) {
  // out[0] = attenuation 0..1, out[1] = pan -1..1
  const cam = G.camera;
  if (!pos || !cam) { out[0] = 1; out[1] = 0; return out; }
  _d.set(pos.x - cam.position.x, pos.y - cam.position.y, pos.z - cam.position.z);
  const d = _d.length();
  if (d >= range) { out[0] = 0; out[1] = 0; return out; }
  const k = d <= REF_DIST ? 1 : 1 - (d - REF_DIST) / (range - REF_DIST);
  out[0] = k * k * (0.35 + 0.65 * k); // gentle near, steep tail
  const e = cam.matrixWorld.elements; _right.set(e[0], e[1], e[2]);
  out[1] = d > 0.5 ? clamp(_d.dot(_right) / d, -1, 1) * 0.8 * clamp(d / 6, 0, 1) : 0;
  return out;
}
const _sp = [0, 0];

// ------------------------------------------------------------------ one-shots
function warnUnknown(name) {
  A.stats.unknown++;
  if (A.unknown.has(name)) return;
  A.unknown.add(name);
  console.warn('[audio] unknown sound name', name);
}

function pickId(e) {
  const ids = e.ids;
  if (!ids || !ids.length) return null;
  if (ids.length === 1) return ids[0];
  const last = A.lastPick.get(e.name);
  let i = Math.floor(Math.random() * ids.length);
  if (i === last) i = (i + 1) % ids.length;
  A.lastPick.set(e.name, i);
  return ids[i];
}

function busFor(e) { const N = A.nodes; return e.bus === 'ui' ? N.ui : e.bus === 'stinger' ? N.stinger : e.bus === 'amb' ? N.amb : N.sfx; }

function removeVoice(v) {
  if (v.dead) return;
  v.dead = true;
  const i = A.voices.indexOf(v);
  if (i >= 0) A.voices.splice(i, 1);
  A.polyCount.set(v.name, Math.max(0, (A.polyCount.get(v.name) || 1) - 1));
  if (v.cache) v.cache.inUse = Math.max(0, v.cache.inUse - 1);
  try { v.src?.disconnect(); v.g?.disconnect(); v.pan?.disconnect(); } catch (e) { /* already gone */ }
}

function stopVoice(v, fade = 0.03) {
  if (v.dead) return;
  if (v.src && A.ctx) {
    const t = A.ctx.currentTime;
    try { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + fade); v.src.stop(t + fade + 0.01); } catch (e) { /* not started */ }
  }
  removeVoice(v);
}

function startVoice(v, buf) {
  if (v.dead || !A.ctx) return;
  const ctx = A.ctx;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = v.rate;
  const g = ctx.createGain();
  g.gain.value = v.vol;
  src.connect(g);
  let out = g;
  if (v.panV) { const p = ctx.createStereoPanner(); p.pan.value = v.panV; g.connect(p); out = p; v.pan = p; }
  out.connect(v.bus);
  v.src = src; v.g = g;
  src.onended = () => removeVoice(v);
  const when = ctx.currentTime + Math.max(0, v.delay - (now() - v.t0));
  src.start(when);
  v.end = now() + (when - ctx.currentTime) + buf.duration / Math.max(0.05, v.rate);
  if (v.e.bus === 'stinger') A.stingerUntil = Math.max(A.stingerUntil, v.end - 0.4);
}

// ---- event dedupe: sounds the engine adds on events (prop:broken, physics:impact, enemy:killed, item:collected) wait one
// frame and are dropped when the emitting system already played its own sound at that spot (within DEDUPE_R m, ±DEDUPE_T s).
const DEDUPE_R2 = 2.5 * 2.5, DEDUPE_T = 0.15, NO_DEDUPE = /^(step_|ui_|voice_|land|jump)/;
const RECENT_N = 32;
const recent = Array.from({ length: RECENT_N }, () => ({ x: 0, y: 0, z: 0, t: -1e9 }));
let recentI = 0;
function noteRecent(p, t) { const r = recent[recentI]; recentI = (recentI + 1) % RECENT_N; r.x = p.x; r.y = p.y; r.z = p.z; r.t = t; }
function heardNear(p, since) {
  for (const r of recent) if (r.t >= since) { const dx = r.x - p.x, dy = r.y - p.y, dz = r.z - p.z; if (dx * dx + dy * dy + dz * dz < DEDUPE_R2) return true; }
  return false;
}
const evq = [];
/** Event-driven sound: played next frame unless another system already voiced this moment here. */
function evSfx(name, o) {
  if (!o?.pos || !Number.isFinite(o.pos.x)) { sfx(name, o); return; }
  if (evq.length > 64) evq.shift();
  evq.push({ name, o: { ...o, pos: { x: o.pos.x, y: o.pos.y, z: o.pos.z }, _ev: true }, t: now() });
}
function flushEv() {
  if (!evq.length) return;
  const t = now();
  let w = 0;
  for (let i = 0; i < evq.length; i++) {
    const q = evq[i];
    if (t - q.t < 0.012) { evq[w++] = q; continue; }               // same frame: wait for the emitter's own sound
    if (heardNear(q.o.pos, q.t - DEDUPE_T)) A.stats.deduped = (A.stats.deduped || 0) + 1;
    else sfx(q.name, q.o);
  }
  evq.length = w;
}

function sfx(name, opts) {
  try { return play(name, opts || {}, 0); } catch (e) { G.reportError('audio:sfx', e); return null; }
}

function play(name, o, depth) {
  A.stats.calls++;
  const e = T[name];
  if (!e) { warnUnknown(name); return null; }
  const t = now();
  const key = e.key || name;
  const lastT = A.last.get(key);
  if (lastT !== undefined && t - lastT < e.cd) { A.stats.cooled++; return null; }
  const pos = o.pos && Number.isFinite(o.pos.x) ? o.pos : null;
  spatial(pos, e.range, _sp);
  const base = e.vol * (o.vol === undefined ? 1 : o.vol);
  const vol = base * _sp[0];
  if (vol <= 0.004) { A.stats.culled++; return null; }
  A.last.set(key, t);
  if (pos && depth === 0 && !o._ev && !NO_DEDUPE.test(name)) noteRecent(pos, t);
  // layers first (they have their own caps)
  if (e.also && depth < 2) for (const a of e.also) if (Math.random() < a.chance) play(a.name, { pos, vol: (o.vol === undefined ? 1 : o.vol) * a.vol, pitch: o.pitch, delay: (o.delay || 0) + (a.delay || 0) }, depth + 1);
  // per-name polyphony: steal the oldest voice of this name
  let count = A.polyCount.get(name) || 0;
  if (count >= e.poly) {
    let oldest = null;
    for (const v of A.voices) if (v.name === name && (!oldest || v.t0 < oldest.t0)) oldest = v;
    if (oldest) { stopVoice(oldest); A.stats.stolen++; count--; }
  }
  // global cap: steal the oldest voice of equal or lower priority
  if (A.voices.length >= MAX_VOICES) {
    let victim = null;
    for (const v of A.voices) if (v.e.pri <= e.pri && (!victim || v.e.pri < victim.e.pri || (v.e.pri === victim.e.pri && v.t0 < victim.t0))) victim = v;
    if (!victim) { A.stats.dropped++; return null; }
    stopVoice(victim); A.stats.stolen++;
  }
  const id = pickId(e);
  const rate = e.rate * (o.pitch || 1) * (1 + (Math.random() * 2 - 1) * e.pitch);
  const v = { name, e, id, vol, rate, panV: _sp[1], bus: busFor(e), t0: t, delay: Math.max(0, o.delay || 0), src: null, g: null, pan: null, dead: false, end: t + 2, cache: null };
  A.voices.push(v);
  A.polyCount.set(name, count + 1);
  if (A.voices.length > A.stats.maxVoices) A.stats.maxVoices = A.voices.length;
  if (count + 1 > (A.stats.maxPerName[name] || 0)) A.stats.maxPerName[name] = count + 1;
  A.stats.played++;
  if (!A.ctx) return v;
  let buf = id ? ready(id) : null;
  if (buf) { v.cache = A.cache.get(id); v.cache.inUse++; startVoice(v, buf); return v; }
  if (!id) { buf = synthBuf(e.synth || 'thud'); if (buf) startVoice(v, buf); else removeVoice(v); return v; }
  ensure(id).then((b) => {
    if (v.dead) return;
    if (!b) b = synthBuf(e.synth || 'thud');
    if (!b) { removeVoice(v); return; }
    if (now() - v.t0 > PEND_MAX + v.delay) { A.stats.late++; removeVoice(v); return; }
    const c = A.cache.get(id); if (c && c.state === 'ok') { v.cache = c; c.inUse++; }
    startVoice(v, b);
  });
  return v;
}

// ------------------------------------------------------------------ loops
function makeLoop(def, o = {}) {
  // def: table entry (loop) or { ids:[id], synth?, vol } ; o: { vol, pos, bus, smooth }
  const h = {
    name: def.name || def.ids?.[0] || def.synth, def, id: def.ids ? def.ids[0] : null,
    vol: o.vol === undefined ? 1 : o.vol, pos: null, cur: 0, target: 0, smooth: o.smooth || 6,
    bus: o.bus || (def.bus === 'ui' ? 'ui' : def.bus === 'amb' ? 'amb' : 'sfx'),
    g: null, pan: null, src: null, stopping: false, fade: 0.4, waiting: false, retryAt: 0, cache: null, dead: false,
    setVol(x) { h.vol = Number.isFinite(x) ? Math.max(0, x) : h.vol; return h; },
    setPos(p) { if (p && Number.isFinite(p.x)) (h.pos || (h.pos = new THREE.Vector3())).copy(p); else h.pos = null; return h; },
    stop(fade = 0.4) { h.stopping = true; h.fade = Math.max(0.01, fade); return h; },
    get playing() { return !!h.src; },
  };
  if (o.pos) h.setPos(o.pos);
  A.loops.push(h);
  attachLoop(h);
  return h;
}

function attachLoop(h) {
  if (!A.ctx || h.src || h.waiting || h.dead) return;
  const begin = (buf) => {
    h.waiting = false;
    if (h.dead || h.src || !buf) return;
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true; src.playbackRate.value = h.def.rate || 1;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g);
    let out = g;
    if (h.bus === 'sfx') { const p = ctx.createStereoPanner(); g.connect(p); out = p; h.pan = p; }
    out.connect(h.bus === 'amb' ? A.nodes.amb : h.bus === 'ui' ? A.nodes.ui : A.nodes.sfx);
    src.start(ctx.currentTime, Math.random() * buf.duration * 0.9);
    h.src = src; h.g = g;
    const c = h.id && A.cache.get(h.id); if (c && c.state === 'ok') { h.cache = c; c.inUse++; }
  };
  if (!h.id) { begin(synthBuf(h.def.synth || 'hum')); return; }
  const buf = ready(h.id);
  if (buf) { begin(buf); return; }
  h.waiting = true;
  ensure(h.id).then((b) => {
    if (!b) {
      const st = A.cache.get(h.id)?.state;
      if (st === 'skipped') { h.waiting = false; h.retryAt = now() + 1; return; }      // muted: try again later
      if (h.def.synth) b = synthBuf(h.def.synth);
    }
    begin(b);
    h.waiting = false;
  });
}

function killLoop(h) {
  h.dead = true;
  try { h.src?.stop(); } catch (e) { /* not started */ }
  try { h.src?.disconnect(); h.g?.disconnect(); h.pan?.disconnect(); } catch (e) { /* gone */ }
  if (h.cache) h.cache.inUse = Math.max(0, h.cache.inUse - 1);
  h.src = null;
  const i = A.loops.indexOf(h); if (i >= 0) A.loops.splice(i, 1);
}

function updateLoops(rdt) {
  const t = now(), ct = A.ctx?.currentTime || 0;
  for (let i = A.loops.length - 1; i >= 0; i--) {
    const h = A.loops[i];
    let att = 1, pan = 0;
    if (h.pos) { spatial(h.pos, h.def.range || 60, _sp); att = _sp[0]; pan = _sp[1]; }
    h.target = h.stopping ? 0 : h.vol * (h.def.vol || 1) * att;
    if (h.stopping) h.cur = Math.max(0, h.cur - rdt / h.fade);
    else h.cur += (h.target - h.cur) * (1 - Math.exp(-h.smooth * rdt));
    if (h.stopping && h.cur <= 0) { killLoop(h); continue; }
    if (!h.src && !h.waiting && t >= h.retryAt && !A.muted) attachLoop(h);
    if (h.g && Math.abs(h.cur - (h.sentG ?? -1)) > 0.002) { h.sentG = h.cur; h.g.gain.setTargetAtTime(h.cur, ct, 0.03); }
    if (h.pan && Math.abs(pan - (h.sentP ?? 9)) > 0.01) { h.sentP = pan; h.pan.pan.setTargetAtTime(pan, ct, 0.05); }
  }
}

function loop(name, o = {}) {
  try {
    let e = T[name];
    if (!e && G.assets?.info?.(name)?.type === 'audio') e = { name, ids: [name], vol: 1, range: 60 };
    if (!e) { warnUnknown(name); return makeDummy(); }
    return makeLoop(e, o);
  } catch (err) { G.reportError('audio:loop', err); return makeDummy(); }
}
function makeDummy() { const d = { setVol: () => d, setPos: () => d, stop: () => d, playing: false }; return d; }

// ------------------------------------------------------------------ music decks
function setMusic(mood, fade = 2) {
  const id = mood == null ? null : MUSIC[mood] || (String(mood).startsWith('bgm_') && G.assets?.has?.(mood) ? mood : null);
  if (mood != null && !id) { warnUnknown('music:' + mood); return; }
  A.musicTarget = mood == null ? null : mood;
  const rate = 1 / Math.max(0.05, fade);
  let found = null;
  for (const d of A.decks) {
    if (d.id === id && !found) { found = d; d.target = 1; d.rate = rate; d.mood = mood; }
    else { d.target = 0; d.rate = rate; }
  }
  if (!id || found) return;
  const d = { mood, id, level: 0, target: 1, rate, src: null, g: null, startAt: 0, offset: 0, waiting: false, trim: MUSIC_TRIM[id] || 1, cache: null, born: now(),
    layerId: MUSIC_LAYERS[id] || null, lsrc: null, lg: null, lcache: null, lLevel: 0 };
  A.decks.push(d);
  attachDeck(d);
}

/** Where a looping track is after playing `pos` seconds from its start: past the end it wraps into the loop region. */
function wrapHead(id, pos, dur) {
  if (pos < dur) return pos;
  const ls = MUSIC_LOOP[id] || 0, len = dur - ls;
  return len > 1 ? ls + ((pos - ls) % len) : pos % dur;
}

function attachDeck(d) {
  if (!A.ctx || d.src || d.waiting) return;
  d.waiting = true;
  // the track and its layer start together, on the same clock tick and offset, or the layer is left out
  // phones: no intensity layer (a second 35–40 MB track decoded for every fight; docs/api/perf.md "Phone memory, round 2")
  const layer = d.layerId && !G.quality?.mobile && G.assets?.has?.(d.layerId);
  Promise.all([ensure(d.id), layer ? ensure(d.layerId) : null]).then(([buf, lbuf]) => {
    d.waiting = false;
    if (!buf || d.src || d.dead || d.target === 0) return;
    const ctx = A.ctx;
    const source = (b) => {
      const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
      const ls = MUSIC_LOOP[d.id];
      if (ls > 0 && ls < b.duration - 1) { src.loopStart = ls; src.loopEnd = b.duration; }
      return src;
    };
    const src = source(buf);
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(A.nodes.music);
    const r = A.resume.get(d.id);
    d.offset = EXPLORE.has(d.mood) && r && now() - r.at < 150 ? wrapHead(d.id, r.offset, buf.duration) : 0;
    const at = ctx.currentTime + 0.03;
    src.start(at, d.offset);
    if (lbuf && Math.abs(lbuf.duration - buf.duration) < 0.02) {
      const ls = source(lbuf), lg = ctx.createGain();
      lg.gain.value = 0; d.lLevel = 0; d.lSent = 0;
      ls.connect(lg); lg.connect(g); ls.start(at, d.offset);
      d.lsrc = ls; d.lg = lg;
      const lc = A.cache.get(d.layerId); if (lc) { d.lcache = lc; lc.inUse++; lc.played = true; }
    }
    d.startAt = at; d.src = src; d.g = g;
    const c = A.cache.get(d.id); if (c) { d.cache = c; c.inUse++; c.played = true; }
  });
}

function updateMusic(rdt) {
  const ct = A.ctx?.currentTime || 0;
  const want = A.intensityOverride ?? A.intensity;
  for (let i = A.decks.length - 1; i >= 0; i--) {
    const d = A.decks[i];
    if (d.level < d.target) d.level = Math.min(d.target, d.level + d.rate * rdt);
    else if (d.level > d.target) d.level = Math.max(d.target, d.level - d.rate * rdt);
    if (d.target === 0 && d.level <= 0) {
      if (d.src) {
        A.resume.set(d.id, { offset: wrapHead(d.id, d.offset + Math.max(0, ct - d.startAt), d.src.buffer.duration), at: now() });
        try { d.src.stop(); d.src.disconnect(); d.g.disconnect(); } catch (e) { /* gone */ }
        if (d.lsrc) try { d.lsrc.stop(); d.lsrc.disconnect(); d.lg.disconnect(); } catch (e) { /* gone */ }
      }
      if (d.cache) d.cache.inUse = Math.max(0, d.cache.inUse - 1);
      if (d.lcache) d.lcache.inUse = Math.max(0, d.lcache.inUse - 1);
      d.dead = true;
      A.decks.splice(i, 1);
      if (G.quality?.mobile) evict('music');   // phones: a silent track's PCM goes now, not at the next decode
      continue;
    }
    if (!d.src && !d.waiting && d.target > 0 && !A.muted) attachDeck(d);
    const gv = Math.sin(d.level * Math.PI / 2) * d.trim;
    if (d.g && Math.abs(gv - (d.sent ?? -1)) > 0.002) { d.sent = gv; d.g.gain.setTargetAtTime(gv, ct, 0.05); }
    if (d.lg) {
      // the layer swells in over ~2 s and ebbs over ~6 s, so a short lull does not drain a fight
      const k = want > d.lLevel ? rdt / 2 : rdt / 6;
      d.lLevel = want > d.lLevel ? Math.min(want, d.lLevel + k) : Math.max(want, d.lLevel - k);
      const lv = Math.sin(d.lLevel * Math.PI / 2);
      if (Math.abs(lv - d.lSent) > 0.002) { d.lSent = lv; d.lg.gain.setTargetAtTime(lv, ct, 0.05); }
    }
  }
}

/** ★ music(mood | null, { fade }) — manual override; music('auto') hands control back to the director. */
function music(mood, o = {}) {
  try {
    const fade = o.fade === undefined ? 2 : o.fade;
    if (mood === 'auto') { A.override = undefined; A.director?.kick(); return; }
    A.override = mood === undefined ? null : mood;
    setMusic(A.override, fade);
  } catch (e) { G.reportError('audio:music', e); }
}

// ------------------------------------------------------------------ ducking
function updateDuck(rdt) {
  const m = G.mode;
  let mus = m === 'menu' ? 0.45 : m === 'talk' ? 0.72 : 1;
  if (now() < A.stingerUntil) mus *= 0.3;
  let world = m === 'menu' ? 0.45 : m === 'talk' ? 0.85 : 1;
  let lp = m === 'menu' ? 900 : 20000;
  const cam = G.camera, W = G.world;
  if (cam && W?.isWater && cam.position.y < (W.seaLevel ?? 0) - 0.05 && W.isWater(cam.position.x, cam.position.z)) { lp = Math.min(lp, 550); world *= 0.8; }
  const k = 1 - Math.exp(-5 * rdt);
  A.duck.music += (mus - A.duck.music) * k;
  A.duck.world += (world - A.duck.world) * k;
  A.duck.lp = Math.exp(Math.log(A.duck.lp) + (Math.log(lp) - Math.log(A.duck.lp)) * k);
  if (!A.ctx) return;
  const ct = A.ctx.currentTime, N = A.nodes, sent = A.sent || (A.sent = { m: -1, w: -1, lp: -1 });
  if (Math.abs(A.duck.music - sent.m) > 0.002) { sent.m = A.duck.music; N.musicDuck.gain.setTargetAtTime(sent.m, ct, 0.05); }
  if (Math.abs(A.duck.world - sent.w) > 0.002) { sent.w = A.duck.world; N.worldDuck.gain.setTargetAtTime(sent.w, ct, 0.05); }
  if (Math.abs(A.duck.lp - sent.lp) > sent.lp * 0.01) { sent.lp = A.duck.lp; N.lp.frequency.setTargetAtTime(sent.lp, ct, 0.05); }
}

// ------------------------------------------------------------------ preloading (idle time)
const COMMON = ['step_grass', 'step_stone', 'step_wood', 'step_water', 'step_path', 'jump', 'jump_air', 'land', 'dodge', 'wings_open',
  'ui_move', 'ui_select', 'ui_open', 'ui_close', 'ui_page', 'ui_error', 'splash', 'steam', 'ignite', 'freeze', 'shatter_ice', 'player_hurt',
  'broom_summon', 'broom_dismiss', 'player_broom_boost', 'broom_boost', 'cast_charm', 'hit_charm', 'pickup', 'coin', 'hit_body', 'enemy_hit', 'enemy_die', 'explosion',
  'cast_fire', 'cast_water', 'cast_ice', 'cast_wind', 'cast_thunder', 'cast_earth', 'cast_sun', 'cast_moon',
  'hit_fire', 'hit_water', 'hit_ice', 'hit_wind', 'hit_thunder', 'hit_earth', 'hit_sun', 'hit_moon', 'thunder', 'wood_break', 'hit_wood', 'hit_stone'];

function startPreload() {
  if (A.preloadQ || !A.ctx || A.muted) return;
  const ids = [];
  for (const n of COMMON) { const e = T[n]; if (e?.ids) for (const id of e.ids) if (!ids.includes(id)) ids.push(id); if (e?.also) for (const a of e.also) for (const id of T[a.name]?.ids || []) if (!ids.includes(id)) ids.push(id); }
  A.preloadQ = ids;
  const idle = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 400 }) : (f) => setTimeout(f, 30);
  const step = () => {
    if (!A.preloadQ.length || A.muted) return;
    const id = A.preloadQ.shift();
    const c = A.cache.get(id);
    (c && c.state !== 'skipped' ? Promise.resolve() : ensure(id)).then(() => idle(step));
  };
  idle(step);
}

// ------------------------------------------------------------------ world event hooks
const PROP_RULES = [[/ice/, 'shatter_ice'], [/rock|stone|boulder|statue/, 'shatter_rock'], [/crystal|glass/, 'shatter_crystal'],
  [/jar|pot|vase|urn|ceramic|pottery|bottle/, 'glass'], [/firework|powder|blast|explosive/, 'explosion'], [/pumpkin|apple|melon|fruit/, 'slime'],
  [/hay|straw|cloth|banner|paper/, 'hit_soft']];
const IMPACT = { wood: 'hit_wood', paper: 'hit_soft', cloth: 'hit_soft', flesh: 'hit_soft', stone: 'hit_stone', ice: 'hit_stone', crystal: 'hit_stone', metal: 'hit_metal' };

function hookEvents() {
  const on = (n, f) => G.events.on(n, (p) => { try { f(p || {}); } catch (e) { G.reportError('audio:' + n, e); } });
  on('settings:changed', setVolumes);
  on('input:lockGained', unlock);
  on('player:step', (p) => {
    const P = G.player; if (!P?.pos) return;
    const name = STEP[p.surface] || 'step_grass';
    sfx(name, { pos: P.pos, vol: clamp(0.55 + (p.speed || 4) / 16, 0.5, 1.1) });
  });
  on('player:healed', (p) => { if ((p.amount || 0) > 0) sfx('heal', { pos: G.player?.pos }); });
  on('player:died', () => sfx('player_die', { pos: G.player?.pos }));
  on('player:respawn', () => sfx('revive', { pos: G.player?.pos, vol: 0.7 }));
  on('item:collected', (p) => {
    const k = String(p.kind || p.id || '');
    const name = /coin|star|dust|money|sen/.test(k) ? 'coin' : /tear/.test(k) ? 'tear' : /gem|crystal/.test(k) ? 'pickup_gem' : 'pickup';
    evSfx(name, { pos: p.pos || G.player?.pos });
  });
  on('enemy:killed', (p) => evSfx('enemy_die', { pos: p.pos || p.enemy?.pos }));
  on('spell:clash', (p) => sfx(p.result === 'big' || p.big ? 'clash_big' : 'clash', { pos: p.pos }));
  on('physics:impact', (p) => {
    const m = p.body?.material; const name = IMPACT[m]; if (!name || !p.pos) return;
    const sp = p.relSpeed ?? p.speed;
    evSfx(name, { pos: p.pos, vol: clamp(((sp || 4) - 3) / 10, 0.15, 1), pitch: clamp(1.3 - (p.body?.mass || 25) / 120, 0.75, 1.25) });
  });
  on('prop:broken', (p) => {
    const ty = String(p.type || '').toLowerCase();
    let name = 'wood_break';
    for (const [re, n] of PROP_RULES) if (re.test(ty)) { name = n; break; }
    evSfx(name, { pos: p.pos });
  });
  on('race:start', () => sfx('taiko_roll', { vol: 0.8 }));
  on('race:finish', (e) => { if (!e?.aborted) sfx('festival', { vol: 0.8 }); });   // an abandoned ring course is no fanfare
  on('checkpoint', () => sfx('checkpoint', { vol: 0.8 }));
}

// ------------------------------------------------------------------ debug / instrumentation
/** RMS / peak of what leaves the compressor (before the speakers), from a lazily created analyser. */
function meter() {
  if (!A.ctx) return { rms: 0, peak: 0 };
  const N = A.nodes;
  if (!N.meter) { N.meter = A.ctx.createAnalyser(); N.meter.fftSize = 2048; N.comp.connect(N.meter); N.meterBuf = new Float32Array(2048); }
  N.meter.getFloatTimeDomainData(N.meterBuf);
  let s = 0, pk = 0;
  for (const x of N.meterBuf) { s += x * x; const a = Math.abs(x); if (a > pk) pk = a; }
  return { rms: +Math.sqrt(s / N.meterBuf.length).toFixed(4), peak: +pk.toFixed(4) };
}

function debug(o = {}) {
  let decoded = 0, loading = 0;
  const decodedIds = [];
  for (const [id, c] of A.cache) { if (c.state === 'ok') { decoded++; decodedIds.push(id); } else if (c.state === 'loading') loading++; }
  let loud = null;
  for (const d of A.decks) if (!loud || d.level > loud.level) loud = d;
  const dir = A.director?.state() || {};
  return {
    ctxState: A.ctx ? A.ctx.state : 'none', muted: A.muted, sampleRate: A.ctx?.sampleRate || 0,
    music: { current: loud && loud.level > 0.001 ? loud.mood : loud?.target ? loud.mood : null, target: A.musicTarget, override: A.override, wanted: dir.want, pending: dir.pending,
      intensity: +(A.intensityOverride ?? A.intensity).toFixed(2),
      decks: A.decks.map((d) => ({ mood: d.mood, id: d.id, level: +d.level.toFixed(3), target: d.target, playing: !!d.src, from: +d.offset.toFixed(1), loopStart: d.src ? +d.src.loopStart.toFixed(3) : null, layer: d.lg ? +d.lLevel.toFixed(2) : null,
        at: d.src ? +wrapHead(d.id, d.offset + Math.max(0, A.ctx.currentTime - d.startAt), d.src.buffer.duration).toFixed(2) : null })) },
    ambience: (dir.beds || []),
    loops: A.loops.filter((h) => !h.isBed).map((h) => ({ name: h.name, vol: +h.cur.toFixed(3), playing: !!h.src })),
    playing: A.voices.length, voices: A.voices.map((v) => v.name),
    decoded, loading, decodedIds, decodeErrors: A.decodeErrors.slice(), missingIds: [...A.missing],
    missingNames: [...A.unknown], stats: JSON.parse(JSON.stringify(A.stats)),
    duck: { music: +A.duck.music.toFixed(3), world: +A.duck.world.toFixed(3), lp: Math.round(A.duck.lp) },
    env: dir.env,
    meter: o.meter ? meter() : undefined,
  };
}

// ------------------------------------------------------------------ system
export const audioSystem = {
  name: 'audio',
  pausable: false,
  async init(G) {
    A.muted = isMuted(); A.muteKey = G.params.mute;
    try { buildGraph(); } catch (e) { G.reportError('audio:init', e); A.ctx = null; }
    if (A.ctx) for (const k of SYNTH_KINDS) synthBuf(k);
    setVolumes();
    const first = () => { unlock(); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) window.addEventListener(ev, first, { capture: true, passive: true });
    unlock();
    hookEvents();
    A.director = createDirector({ G, A, sfx, setMusic, makeLoop, T });
    G.audio = {
      sfx, loop, music, unlock, setVolumes, debug,
      /** Bytes of decoded audio held (PCM float32; the phones' memory budget, core/membudget.js). */
      decodedBytes() { let n = 0; for (const c of A.cache.values()) if (c.state === 'ok' && c.buf) n += c.buf.length * c.buf.numberOfChannels * 4; return n; },
      /** Let every decoded buffer that is not playing go (memory pressure); the next use decodes it again. */
      trim() {
        for (const [id, c] of A.cache) {
          if (c.state !== 'ok' || c.inUse > 0) continue;
          if (c.kind === 'sfx' && now() - c.used < 30) continue;   // a sound heard in the last 30 s stays
          A.cache.delete(id);
        }
      },
      /** Tests: hold the fight intensity (0..1) that fades in a track's layer; null hands it back to the director. */
      setIntensity: (x) => { A.intensityOverride = x == null ? null : clamp(+x || 0, 0, 1); },
      /** Resolved name table (read-only use). */
      names: T,
      /** Does a logical name exist? */
      has: (name) => !!T[name],
      /** Decode some names / ids now (e.g. before a boss). */
      preload: (list) => Promise.all([].concat(list).flatMap((n) => (T[n]?.ids || (G.assets?.has?.(n) ? [n] : [])).map(ensure))),
      /** Stop every one-shot (e.g. on a hard cut). */
      stopAll: () => { for (const v of A.voices.slice()) stopVoice(v, 0.05); },
      get ctx() { return A.ctx; },
      get muted() { return A.muted; },
    };
  },
  start() { A.director?.reset(); setTimeout(startPreload, 1500); },
  update(dt, rdt) {
    if (G.params.mute !== A.muteKey) { setVolumes(); if (!A.muted) startPreload(); }
    const r = Math.min(0.1, rdt || 0);
    try {
      flushEv();
      A.director?.update(r);
      updateMusic(r);
      updateLoops(r);
      updateDuck(r);
      // voices whose buffer never arrived or whose end time passed without onended (ctx suspended / no ctx)
      const t = now();
      for (let i = A.voices.length - 1; i >= 0; i--) { const v = A.voices[i]; if ((!v.src && t - v.t0 > PEND_MAX + v.delay + 0.5) || t > v.end + 1.5) removeVoice(v); }
    } catch (e) { G.reportError('audio:update', e); }
  },
};
