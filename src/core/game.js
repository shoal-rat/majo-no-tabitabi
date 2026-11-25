// G — the single shared game context. Import it anywhere:  import { G } from '../core/game.js';
// Systems hang their public API on it (G.player, G.ui, G.fx, …). See docs/DESIGN.md §5 for the full contract.
import * as THREE from 'three';
import { createEvents } from './events.js';

export const G = {
  THREE,
  /** The game's version: package.json "version", put in by build.mjs (shown on the title screen). */
  version: typeof __MV_VERSION__ !== 'undefined' ? __MV_VERSION__ : '0.0.0',
  /** URL parameters (?autostart=1&pos=-540,58 …) as strings. */
  params: {},
  canvas: null,
  /** <div id="ui"> — DOM overlay root (pointer-events: none; children opt in). */
  uiRoot: null,
  renderer: null,
  scene: null,
  /** PerspectiveCamera (fov 60, near 0.3, far 4000). */
  camera: null,
  /** t = scaled game seconds; dt = scaled step (0 while paused); rdt = real step; frame = counter. */
  time: { t: 0, dt: 0, rdt: 0, real: 0, frame: 0, scale: 1, hitstop: 0 },
  /** 'boot' | 'title' | 'play' | 'talk' | 'menu' | 'cutscene' | 'ending' */
  mode: 'boot',
  /** Environment at the player's feet, refreshed every frame by the core. */
  env: {
    veil: 0,            // 0 sunlit .. 1 deep night
    light: 1,           // daylight reaching the ground, 1 .. 0.02
    region: 'sunmeadow',
    regionName: '',
    major: 'sun',       // 'sun' | 'dusk' | 'night'
    focus: new THREE.Vector3(),      // world position the environment is sampled at (player, else camera)
    moonDir: new THREE.Vector3(0, 1, 0),
    sunDir: new THREE.Vector3(0, 1, 0),
  },
  systems: [],
  sys: {},
  errors: [],
  events: createEvents(),

  // filled by core/boot.js
  input: null, save: null, state: null, settings: null, world: null, interact: null, debug: null,
  // filled by systems
  sky: null, lights: null, fx: null, audio: null, ui: null, gameplay: null, player: null, cam: null, combat: null,
  quests: null, dialogue: null, npcs: null, story: null,

  /** Draws the frame. The sky/post-processing system replaces this with its composer. */
  renderFrame() { this.renderer.render(this.scene, this.camera); this.fx?.drawOverlay?.(this.renderer, this.camera); },

  /** Switch mode; emits 'mode:changed' { mode, prev }. */
  setMode(mode) {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    this.events.emit('mode:changed', { mode, prev });
  },
  /** True while the simulation should not advance (pause menu / map / title menus). */
  get paused() { return this.mode === 'menu' || this.mode === 'boot'; },
  /** Freeze-frame for impact: time runs at `scale` for `sec` real seconds. */
  hitstop(sec = 0.06, scale = 0.05) { this.time.hitstop = Math.max(this.time.hitstop, sec); this.time.hitstopScale = scale; },
  /** Record a non-fatal error (shown in the console; tests read G.errors). */
  reportError(where, err) {
    const rec = { where, message: String(err && err.message ? err.message : err), stack: err && err.stack ? String(err.stack) : '', t: this.time.real };
    const same = this.errors.find((e) => e.where === where && e.message === rec.message);
    if (same) { same.count = (same.count || 1) + 1; return; }
    this.errors.push(rec);
    console.error(`[${where}]`, err);
  },
};
