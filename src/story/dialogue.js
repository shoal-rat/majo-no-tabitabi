// Dialogue runtime (G.dialogue). Scripts are DATA in the locale files: arrays of
//   { who, text, expr?, act?, choices?:[{ text, do?, goto? }], do?: string|string[], if?: string, goto?: label|'end', label? }
// executed line by line through G.ui.say, with a two-shot / over-the-shoulder camera (G.cam.cinematic), speaker
// expressions and gestures, and hooks by id ('learn:fire', 'give:stardust:50', 'result:duel', …) registered in code.
//   G.dialogue.play(id | lines, { npc?, vars?, keepCam?, cam?:false, skippable? }) -> Promise<{ result, choice, skipped, id }>
import * as THREE from 'three';
import { G } from '../core/game.js';
import { t, raw } from '../core/i18n.js';

const KEY_ACTIONS = ['interact', 'attack', 'cast', 'guard', 'broom', 'jump', 'descend', 'sprint', 'dodge', 'heal', 'summon', 'ultimate',
  'map', 'journal', 'spellbook', 'forward', 'back', 'left', 'right', 'el1', 'el2', 'el3', 'el4', 'el5', 'el6', 'el7', 'el8', 'wheel', 'lock', 'pause', 'thread', 'rewind'];
const EXPRS = ['joy', 'fun', 'angry', 'sorrow', 'surprised'];
const DLG_NS = ['story.dlg.main.', 'story.dlg.side.', ''];
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Vector3(), _l = new THREE.Vector3();

/** {key} placeholders → key labels; {name} etc → vars. */
export function fill(text, vars) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k) => {
    if (vars && vars[k] !== undefined) return vars[k];
    if (KEY_ACTIONS.includes(k)) { try { return G.input?.keyLabel?.(k) || k; } catch (e) { return k; } }
    return m;
  });
}

export function createDialogue(story) {
  const hooks = new Map();
  const conds = new Map();
  let chain = Promise.resolve();
  let cur = null;   // running ctx

  /** Resolve a script id to its lines. */
  function lines(id) {
    if (Array.isArray(id)) return id;
    for (const ns of DLG_NS) { const v = raw(ns + id); if (Array.isArray(v)) return v; }
    return null;
  }
  function evalIf(expr, ctx) {
    if (!expr) return true;
    return String(expr).split('&').every((part) => {
      let p = part.trim(); let neg = false;
      if (p[0] === '!') { neg = true; p = p.slice(1); }
      const i = p.indexOf(':'); const k = i < 0 ? p : p.slice(0, i), arg = i < 0 ? '' : p.slice(i + 1);
      const fn = conds.get(k);
      let v = false;
      try { v = fn ? !!fn(arg, ctx) : !!G.state?.flags?.[p]; } catch (e) { G.reportError('dialogue:if', e); }
      return neg ? !v : v;
    });
  }
  function runDo(d, ctx) {
    if (!d) return;
    for (const one of Array.isArray(d) ? d : [d]) {
      const s = String(one); const i = s.indexOf(':');
      const k = i < 0 ? s : s.slice(0, i), arg = i < 0 ? '' : s.slice(i + 1);
      const fn = hooks.get(k);
      if (!fn) { G.reportError('dialogue:do', new Error('unknown hook ' + k)); continue; }
      try { fn(arg, ctx); } catch (e) { G.reportError('dialogue:do:' + k, e); }
    }
  }

  // ---- who → actor / position ------------------------------------------------------------------------------------------------
  function actorOf(who) {
    if (who === 'elaina') return G.player?.rig || null;
    return G.npcs?.actor?.(who) || null;
  }
  function posOf(who, out) {
    if (who === 'elaina') return G.player ? out.copy(G.player.pos) : null;
    if (who === 'dango') return G.story?.companion?.pos ? out.copy(G.story.companion.pos) : null;
    const p = G.npcs?.posOf?.(who, out);
    return p || null;
  }
  // an acting tag implies a face when the line gives none
  const ACT_EXPR = { laugh: 'joy', cheer: 'joy', wave: 'joy', huff: 'angry', surprised: 'surprised', shy: 'fun', shake_head: 'sorrow' };
  function setExpr(who, expr, act) {
    if (who === 'dango') { G.story?.companion?.emote?.(expr || 'talk'); return; }
    const a = actorOf(who); if (!a) return;
    const x = expr || ACT_EXPR[act] || null;
    for (const e of EXPRS) a.setExpression?.(e, e === x ? (expr ? 1 : 0.7) : 0, 6);
  }
  /** Speaker acting: the line's `act` tag, else (most lines long enough to carry one) an explaining hand, A / B alternating. */
  function gesture(who, act, ctx, text) {
    if (who === 'narrator' || who === 'dango') return;
    const a = actorOf(who);
    if (!act) {
      if (!a || Array.from(text).length < 9 || (a.upperState && a.upperState !== 'listen') || a.busy) return;
      if (Math.random() < 0.22) return;
      act = (ctx.talkN++ & 1) ? 'talk_b' : 'talk';
    }
    if (who === 'elaina') { G.player?.playAction?.(act, { once: true, faceAim: false }); return; }
    G.npcs?.gesture?.(who, act);
  }
  /** The heroine listens while someone else speaks (upper-body Listen_Loop; her own gestures replace it). */
  function heroListens(on) {
    const P = G.player; if (!P?.rig) return;
    if (on) { if (!P.rig.upperState) P.playAction?.('listen', { layer: 'upper', faceAim: false }); }
    else if (P.rig.upperState === 'listen') P.playAction?.('stop');
  }
  /** Lip-sync: the speaker's mouth walks the line at the box's typing pace (heroine and NPCs alike). */
  function mouth(who, text, on) {
    if (who === 'elaina') { const r = G.player?.rig; if (r) { if (on) r.say(text); else r.speaking = false; } return; }
    G.npcs?.speaking?.(who, on, text);
  }

  // ---- camera ---------------------------------------------------------------------------------------------------------------------
  let side = 1;
  function frame(ctx, who) {
    if (ctx.opts.cam === false || !G.cam?.cinematic || !G.player) return;
    const other = ctx.partner;
    if (!other || !posOf(other, _b)) { // solo: a gentle close shot of the heroine
      _a.copy(G.player.pos);
      const yaw = G.player.yaw || 0;
      _c.set(_a.x + Math.sin(yaw) * 3.4 + Math.cos(yaw) * 1.2, _a.y + 1.7, _a.z + Math.cos(yaw) * 3.4 - Math.sin(yaw) * 1.2);
      _l.set(_a.x, _a.y + 1.3, _a.z);
      G.cam.cinematic({ pos: _c.clone(), look: _l.clone(), dur: ctx.shots ? 0.7 : 1.0 }); ctx.shots++;
      return;
    }
    _a.copy(G.player.pos);
    const d = _s.copy(_b).sub(_a); d.y = 0;
    const dist = Math.max(0.8, d.length()); d.divideScalar(dist);
    const perp = _m.set(-d.z, 0, d.x);
    if (!ctx.shots) { // keep the side the camera is already on
      const cdx = G.camera.position.x - _a.x, cdz = G.camera.position.z - _a.z;
      side = cdx * perp.x + cdz * perp.z >= 0 ? 1 : -1;
    }
    let pos, look;
    const ySp = (who === 'elaina' ? _a.y : _b.y);
    if (!ctx.shots || !who || who === 'narrator' || who === 'dango' || (who !== 'elaina' && who !== other)) {
      // two-shot from the side
      const back = Math.max(3.4, dist * 1.25 + 1.6);
      // slightly toward the NPC's side so the heroine reads three-quarter front; aim low so faces sit above the box
      _c.set((_a.x + _b.x) / 2 + perp.x * side * back + d.x * back * 0.32, Math.max(_a.y, _b.y) + 1.6, (_a.z + _b.z) / 2 + perp.z * side * back + d.z * back * 0.32);
      _l.set((_a.x + _b.x) / 2, (_a.y + _b.y) / 2 + 0.95, (_a.z + _b.z) / 2);
    } else {
      // over the shoulder of the listener, looking at the speaker
      const fromAkari = who !== 'elaina';
      const L = fromAkari ? _a : _b, Sp = fromAkari ? _b : _a;
      const sx = fromAkari ? d.x : -d.x, sz = fromAkari ? d.z : -d.z;
      // play-test: at 0.75 m aside the listener's head hid a shorter speaker (烛); 1.1 m keeps the speaker's face clear
      _c.set(L.x - sx * 1.7 + perp.x * side * 1.1, L.y + 1.55, L.z - sz * 1.7 + perp.z * side * 1.1);
      _l.set(Sp.x, ySp + 1.05, Sp.z);
    }
    // never below the ground
    const gy = G.world?.heightAt?.(_c.x, _c.z) ?? -1e9;
    if (_c.y < gy + 0.6) _c.y = gy + 0.6;
    pos = _c.clone(); look = _l.clone();
    G.cam.cinematic({ pos, look, dur: ctx.shots ? 0.55 : 0.9 });
    ctx.shots++;
  }
  function facePartner(ctx) {
    const P = G.player; if (!P || !ctx.partner || !posOf(ctx.partner, _b)) return;
    const dx = _b.x - P.pos.x, dz = _b.z - P.pos.z;
    if (dx * dx + dz * dz > 0.01) P.yaw = Math.atan2(dx, dz);
    P.rig?.lookAt?.(_b.setY(_b.y + 1.4));
    G.npcs?.beginTalk?.(ctx.partner);
  }

  async function run(id, opts) {
    const L = lines(id);
    const sid = typeof id === 'string' ? id : opts.id || 'inline';
    const ctx = { id: sid, opts, result: undefined, choice: undefined, skipped: !!opts.skipAll, vars: { ...(opts.vars || {}) }, shots: 0, partner: opts.npc || null, talkN: 0 };
    if (!L) { G.reportError('dialogue', new Error('no script ' + sid)); return ctx; }
    if (!ctx.partner) { // first speaker that is a present NPC
      for (const ln of L) { const w = fill(ln.who, ctx.vars); if (w && w !== 'elaina' && w !== 'dango' && w !== 'narrator' && G.npcs?.isPresent?.(w)) { ctx.partner = w; break; } }
    }
    cur = ctx;
    G.events.emit('dialogue:start', { id: sid });
    const prevMode = G.mode;
    const ownMode = prevMode === 'play';
    if (ownMode) G.setMode('talk');
    G.player?.setControl?.(false);
    facePartner(ctx);
    const labels = {};
    L.forEach((ln, i) => { if (ln && ln.label) labels[ln.label] = i; });
    let i = 0, guard = 0;
    try {
      while (i < L.length && guard++ < 400) {
        const ln = L[i];
        if (!ln || !evalIf(ln.if, ctx)) { i++; continue; }
        if (ctx.skipped || !G.ui?.say) { runDo(ln.do, ctx); if (ln.choices) runDo(ln.choices[0]?.do, ctx); if (ln.goto === 'end') break; i = ln.goto && labels[ln.goto] !== undefined ? labels[ln.goto] : i + 1; continue; }
        const who = fill(ln.who || 'narrator', ctx.vars);
        const text = fill(ln.text, ctx.vars);
        setExpr(who, ln.expr, ln.act);
        if (who !== 'elaina') heroListens(true); else if (G.player?.rig?.upperState === 'listen') heroListens(false);
        gesture(who, ln.act, ctx, text);
        mouth(who, text, true);
        if (who !== 'dango' && who !== 'narrator') frame(ctx, who);
        const name = who === 'narrator' ? '' : fill(G.npcs?.nameOf?.(who) ?? t('story.name.' + who), ctx.vars);   // roadside travellers name themselves
        const choices = Array.isArray(ln.choices) ? ln.choices.map((c) => fill(c.text, ctx.vars)) : undefined;
        let r;
        try { r = await G.ui.say({ name, text, portrait: who === 'narrator' ? null : (G.ui.portraitOf?.(who) || true), choices, side: who === 'elaina' || who === 'dango' ? 'left' : 'right' }); }
        catch (e) { G.reportError('dialogue:say', e); }
        mouth(who, text, false);
        // the listener acknowledges now and then
        if (!choices && Math.random() < 0.33) {
          if (who === 'elaina') { if (ctx.partner && !G.npcs?.actor?.(ctx.partner)?.upperState) G.npcs?.gesture?.(ctx.partner, 'nod'); }
          else if (who !== 'narrator' && G.player?.rig && (!G.player.rig.upperState || G.player.rig.upperState === 'listen')) G.player.playAction?.('nod', { faceAim: false });
        }
        if (opts.skippable && ctx.skipRequested) ctx.skipped = true;
        runDo(ln.do, ctx);
        let next = ln.goto;
        if (choices) {
          const c = ln.choices[r ?? 0] || ln.choices[0];
          ctx.choice = r ?? 0;
          runDo(c.do, ctx);
          if (c.goto) next = c.goto;
        }
        if (next === 'end') break;
        i = next && labels[next] !== undefined ? labels[next] : i + 1;
      }
    } finally {
      for (const w of [ctx.partner, 'elaina']) if (w) setExpr(w, null);
      if (G.player?.rig) { G.player.rig.speaking = false; if (G.player.rig.upperState) G.player.playAction?.('stop'); }
      G.npcs?.endTalk?.(ctx.partner);
      G.player?.rig?.lookAt?.(null);
      if (!opts.keepCam && G.mode !== 'cutscene') G.cam?.release?.();
      if (ownMode && (G.mode === 'talk' || G.mode === 'play')) { G.setMode('play'); G.player?.setControl?.(true); }
      else if (ownMode) G.player?.setControl?.(true);
      cur = null;
      G.events.emit('dialogue:end', { id: sid, result: ctx.result });
    }
    return ctx;
  }

  const api = {
    /** ★ Play a script (locale id or inline lines). Calls queue one after another. */
    play(id, opts = {}) {
      const p = chain.then(() => run(id, opts)).catch((e) => { G.reportError('dialogue', e); return { result: undefined }; });
      chain = p;
      return p;
    },
    /** True while a script is running. */
    get active() { return !!cur; },
    get current() { return cur; },
    /** Register a hook: fn(arg, ctx) for `do: 'id:arg'`. */
    hook(id, fn) { hooks.set(id, fn); },
    /** Register a condition: fn(arg, ctx) -> bool for `if: 'id:arg'` (prefix ! negates, & joins). */
    cond(id, fn) { conds.set(id, fn); },
    /** Skip the rest of a skippable script (hooks still run). */
    skip() { if (cur && cur.opts.skippable) { cur.skipRequested = true; cur.skipped = true; } },
    lines, fill, hooks, conds,
  };
  // built-in hooks / conditions
  api.hook('result', (arg, ctx) => { ctx.result = arg; });
  api.hook('flag', (arg) => { if (G.state) { G.state.flags[arg] = true; G.events.emit('flag:set', { name: arg, value: true }); } });
  api.cond('flag', (arg) => !!G.state?.flags?.[arg]);
  api.cond('spell', (arg) => (G.state?.spells?.[arg] || 0) > 0 || !!G.state?.abilities?.[arg]);
  return api;
}
