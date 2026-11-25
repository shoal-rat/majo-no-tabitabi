// Ceremonies: learnSpell() — the big reveal of a new 灵诀 / ability — and showEnding() — story slots, the 终 seal, the record of the
// journey and the credits generated from assets/manifest.json.
import { G } from '../core/game.js';
import { t, raw, has } from '../core/i18n.js';
import { UI, K, el, tel, clear, fmtTime, hintLine, pushModal, popModal, enterMenuMode, leaveMenuMode, sfx, codeLabel, layoutFlag } from './dom.js';
import { icon, EL_COLOR, ELEMENTS } from './icons.js';
import { addCss } from './style.js';

addCss(`
/* ---- learnSpell: starlight rays, a brass astrolabe round the element's ring, the serif name over an ornament ---- */
.mv-learn { pointer-events: auto; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; transition: opacity .45s;
  background: radial-gradient(circle at 50% 38%, rgba(30,42,80,.55) 0, rgba(8,11,24,.9) 60%, rgba(4,6,14,.96) 100%); }
.mv-learn.on { opacity: 1; }
.mv-learn.out { opacity: 0; transition: opacity .5s; }
.mv-learn::before { content: ''; position: absolute; inset: 0; background-image: var(--tex-stars); background-size: 256u 256u; opacity: .55; pointer-events: none; }
.ln-rays { position: absolute; left: 50%; top: 38%; width: 900u; height: 900u; margin: -450u; border-radius: 50%; opacity: .0;
  background: repeating-conic-gradient(from 0deg, rgba(236,217,164,.15) 0deg 3deg, rgba(236,217,164,0) 3deg 15deg);
  -webkit-mask: radial-gradient(circle, #000 18%, transparent 68%); mask: radial-gradient(circle, #000 18%, transparent 68%); animation: mv-spin 60s linear infinite; transition: opacity 1.5s .3s; }
.mv-learn.on .ln-rays { opacity: 1; }
.ln-emb { position: absolute; left: 50%; top: 38%; width: 0; height: 0; }
.ln-ring { position: absolute; left: -120u; top: -120u; width: 240u; height: 240u; border-radius: 50%;
  background: radial-gradient(circle, #0c1124 0, #172142 60%, var(--lc) 63.5%, #fff6dc 66%, var(--lc) 68.5%, rgba(236,217,164,0) 79%);
  box-shadow: 0 0 90u 20u color-mix(in srgb, var(--lc) 40%, transparent); transform: scale(.2); opacity: 0; transition: transform 1s cubic-bezier(.2,1.3,.3,1) .15s, opacity .5s .15s; }
.mv-learn.on .ln-ring { transform: none; opacity: 1; }
.ln-enso { position: absolute; left: -175u; top: -175u; width: 350u; height: 350u; background: var(--brass2); opacity: 0; -webkit-mask: var(--mk-astro) center / contain no-repeat; mask: var(--mk-astro) center / contain no-repeat;
  transform: rotate(-90deg) scale(.8); transition: transform 1.6s cubic-bezier(.2,.8,.2,1) .3s, opacity 1s .3s; }
.mv-learn.on .ln-enso { opacity: .75; transform: none; }
.ln-ico { position: absolute; left: -60u; top: -60u; width: 120u; height: 120u; display: flex; align-items: center; justify-content: center; font-size: 84u; color: var(--lc);
  filter: drop-shadow(0 0 16u var(--lc)); opacity: 0; transform: scale(1.6); transition: transform .7s cubic-bezier(.2,1.4,.3,1) .7s, opacity .4s .7s; }
.mv-learn.on .ln-ico { opacity: 1; transform: none; }
.ln-ghost { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -54%); font: 700 500u/1 var(--fd); color: var(--lc); opacity: 0; transition: opacity 2s .4s; pointer-events: none; }
.mv-learn.on .ln-ghost { opacity: .06; }
.ln-txt { position: absolute; left: 0; right: 0; top: calc(38% + 188u); display: flex; flex-direction: column; align-items: center; text-align: center; }
.ln-kick { display: flex; align-items: center; gap: 14u; font: 600 14u/1 var(--fd); letter-spacing: .5em; margin-right: -.5em; color: var(--brass2); opacity: 0; transition: opacity .8s 1s; }
.ln-kick::before, .ln-kick::after { content: ''; width: 60u; height: 1u; background: linear-gradient(90deg, transparent, var(--brass2)); }
.ln-kick::after { transform: scaleX(-1); }
.ln-name { position: relative; margin-top: 14u; padding-bottom: 18u; font: 700 56u/1.2 var(--fd); color: #fffaf0; letter-spacing: .16em; margin-right: -.16em;
  text-shadow: 0 0 30u color-mix(in srgb, var(--lc) 70%, transparent), 0 3u 10u #000; opacity: 0; filter: blur(10u); transition: opacity 1s 1.15s, filter 1.2s 1.15s; }
.ln-name::after { content: ''; position: absolute; left: 50%; bottom: -6u; width: 340u; height: 22u; margin-left: -170u; background: linear-gradient(90deg, var(--brass), #fff3d0 50%, var(--brass));
  -webkit-mask: var(--mk-flourish) center / 100% 100% no-repeat; mask: var(--mk-flourish) center / 100% 100% no-repeat; clip-path: inset(0 50% 0 50%); transition: clip-path .7s cubic-bezier(.3,.8,.3,1) 1.7s; }
.mv-learn.on .ln-kick { opacity: 1; }
.mv-learn.on .ln-name { opacity: 1; filter: none; }
.mv-learn.on .ln-name::after { clip-path: inset(0 0 0 0); }
.ln-desc { margin-top: 22u; max-width: 620u; font: 400 16.5u/1.9 var(--fb); color: var(--star); letter-spacing: .05em; opacity: 0; transition: opacity 1s 2s; text-shadow: 0 1u 3u #000; }
.mv-learn.on .ln-desc { opacity: .94; }
.ln-go { position: absolute; left: 0; right: 0; bottom: 48u; text-align: center; font: 400 14u/22u var(--fb); color: rgba(255,247,232,.7); letter-spacing: .14em; opacity: 0; transition: opacity .6s; }
.ln-go.on { opacity: 1; animation: mv-pulse 2s ease-in-out infinite; }
.ln-go .keycap { margin: 0 6u; }

/* ---- ending: a night sky, serif lines, a wax seal, a credits roll with brass rules ---- */
.mv-end { pointer-events: auto; background: radial-gradient(ellipse at 50% 30%, #121a33, #07090f 70%); opacity: 0; transition: opacity 1.4s; overflow: hidden; }
.mv-end.on { opacity: 1; }
.mv-end::before { content: ''; position: absolute; inset: 0; background-image: var(--tex-stars); background-size: 256u 256u; opacity: .8; }
.en-line { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 900u; text-align: center; font: 500 24u/2.1 var(--fd); color: #f6efe0; letter-spacing: .1em;
  opacity: 0; filter: blur(6u); transition: opacity 1.1s, filter 1.3s; white-space: pre-wrap; text-shadow: 0 0 20u rgba(236,217,164,.25); }
.en-line.v { writing-mode: vertical-rl; width: auto; height: max-content; max-height: 640u; text-align: left; font-size: 27u; line-height: 2.4; letter-spacing: .1em; }
.en-line.on { opacity: 1; filter: none; }
.en-fin { position: absolute; left: 50%; top: 46%; width: 132u; height: 132u; margin: -66u; font-size: 60u; opacity: 0; transform: rotate(-8deg) scale(2.4); transition: opacity .25s, transform .45s cubic-bezier(.3,1.5,.5,1); }
.en-fin::before { inset: 9u; border-width: 2u; }
.en-fin.on { opacity: 1; transform: rotate(-8deg); }
.en-roll { position: absolute; left: 0; right: 0; top: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; color: var(--star); will-change: transform; }
.en-roll .gt { font: 700 62u/1.2 var(--fd); letter-spacing: .2em; margin-right: -.2em; color: transparent; -webkit-background-clip: text; background-clip: text;
  background-image: linear-gradient(180deg, #fffbf2 28%, #f2dfac 74%, #cfa961); filter: drop-shadow(0 0 22u rgba(236,217,164,.3)); }
.en-roll .ring { width: 120u; height: 120u; margin: 26u 0 10u; background: var(--brass2); opacity: .8; -webkit-mask: var(--mk-astro) center / contain no-repeat; mask: var(--mk-astro) center / contain no-repeat; }
.en-roll .sec { margin-top: 70u; width: 640u; }
.en-roll .sh { display: flex; align-items: center; gap: 14u; justify-content: center; font: 600 15u/1 var(--fd); letter-spacing: .5em; color: var(--brass2); margin-bottom: 22u; }
.en-roll .sh::before, .en-roll .sh::after { content: ''; width: 90u; height: 1u; background: linear-gradient(90deg, transparent, var(--brass2)); }
.en-roll .sh::after { transform: scaleX(-1); }
.en-roll .ln { font: 400 16u/2 var(--fb); letter-spacing: .06em; color: var(--star); }
.en-roll .ln.nm { font: 600 21u/1.8 var(--fd); letter-spacing: .08em; color: #fffaf0; }
.en-roll .sub { font: 600 12.5u/1 var(--fd); letter-spacing: .32em; color: rgba(236,217,164,.75); margin: 18u 0 8u; }
.en-roll .cr { display: flex; justify-content: center; gap: 18u; font: 400 15u/1.9 var(--fb); }
.en-roll .cr .a { flex: 1; text-align: right; color: #fffaf0; font-family: var(--fd); }
.en-roll .cr .l { flex: 1; text-align: left; color: rgba(236,217,164,.7); font-size: 13u; }
.en-roll .st { display: flex; gap: 10u 26u; flex-wrap: wrap; justify-content: center; font: 400 16u/2 var(--fb); }
.en-roll .st span::before { content: '✦'; color: var(--brass2); margin-right: 8u; font-size: 11u; vertical-align: 2u; }
.en-roll .thx { margin-top: 120u; font: 600 22u/1.8 var(--fd); letter-spacing: .2em; color: #fffaf0; }
.en-roll .seal { margin-top: 26u; width: 56u; height: 56u; font-size: 24u; }
.en-go { position: absolute; left: 0; right: 0; bottom: 26u; text-align: center; font: 400 13u/22u var(--fb); color: rgba(255,247,232,.7); letter-spacing: .14em; opacity: .8; }
.en-go .keycap { margin: 0 5u; }
`);

/** After a reveal: the heroine prays, then tries the new element's gesture (no spell leaves; art reveals only pray). */
function stageHeroine(elId) {
  const P = G.player;
  if (!P || !P.playAction || P.state !== 'ground' || P.onBroom || G.dialogue?.active) return;
  const cast = elId ? 'cast_' + elId : null;
  P.playAction('pray', { lock: 0.9, faceAim: false, onDone: cast ? () => { if (P.state === 'ground' && (P.speed || 0) < 1) P.playAction(cast, { faceAim: false }); } : null });
}

export function createCeremony(host, stage) {
  // ---- learnSpell -----------------------------------------------------------------------------------------
  let chain = Promise.resolve();
  /** Reveals queue up: a second call waits for the first to be dismissed. */
  function learnSpell(o = {}) {
    const p = chain.then(() => revealOne(o));
    chain = p.catch(() => {});
    return p;
  }
  function revealOne(o) {
      return new Promise((resolve) => {
        // an art (guard / shikigami / kinkan / charm / broom / wings) carries an element for its tint only: it gets its own
        // glyph, icon and the 'art' kicker, never the element's
        const isArt = !!o.id && !ELEMENTS.includes(o.id);
        const elId = isArt ? null : ELEMENTS.includes(o.element) ? o.element : ELEMENTS.includes(o.id) ? o.id : null;
        const col = (elId && EL_COLOR[elId]) || (isArt && ELEMENTS.includes(o.element) && o.element !== 'sun' && EL_COLOR[o.element]) || '#ffd890';
        enterMenuMode();
        if (G.ui) G.ui.ceremonyActive = (G.ui.ceremonyActive || 0) + 1;   // wardrobe: no change of clothes while this owns her
        G.ui?.prompt?.(null);
        const R = el('div', 'layer mv-learn', host);
        R.style.setProperty('--lc', col);
        el('div', 'ln-rays', R);
        const gid = elId || o.id;
        if (has('ui.glyph.' + gid)) el('div', 'ln-ghost', R, t('ui.glyph.' + gid));
        const emb = el('div', 'ln-emb', R);
        el('div', 'ln-enso', emb); el('div', 'ln-ring', emb);
        const ic = el('div', 'ln-ico', emb); icon(o.icon || gid || 'spells', '', ic);
        const tx = el('div', 'ln-txt', R);
        tel('div', 'ln-kick', tx, elId ? 'ui.learn.kicker' : 'ui.learn.kickerArt');
        el('div', 'ln-name', tx, o.name || (elId ? t('core.element.' + elId) : ''));
        if (o.desc) el('div', 'ln-desc', tx, o.desc);
        const go = el('div', 'ln-go', R);
        hintLine(go, 'ui.learn.continue', { key: G.input.keyLabel('interact') });
        sfx('learn'); sfx('ui_open', 0.8);
        try { G.sky?.flash?.(col, 0.4); } catch (e) { /* optional */ }
        const t0 = performance.now();
        let done = false;
        const modal = {
          el: R,
          update() {
            const ready = performance.now() - t0 > 1600;
            if (ready) go.classList.add('on');
            if (ready && (K.confirm() || K.cancel())) finish(true);
            K.eat();
          },
        };
        R.addEventListener('click', () => { if (performance.now() - t0 > 1000) finish(true); });
        function finish(gesture) {
          if (done) return;
          done = true;
          popModal(modal);
          R.classList.add('out');
          sfx('ui_select', 0.7);
          setTimeout(() => R.remove(), 520);
          leaveMenuMode(gesture);
          if (G.ui) G.ui.ceremonyActive = Math.max(0, (G.ui.ceremonyActive || 1) - 1);   // wardrobe
          stageHeroine(elId);
          resolve();
        }
        pushModal(modal);
        requestAnimationFrame(() => requestAnimationFrame(() => R.classList.add('on')));
      });
  }

  // ---- ending ---------------------------------------------------------------------------------------------
  /** The name to show for a manifest author. The manifest keeps full provenance notes ("…; procedural garments (…, .tmp/…
   *  generator), conversion by …"); the roll shows only who made it. The game's own work returns null: it is thanked under
   *  绘卷, not listed among the borrowed. (final-play2: the roll used to print build paths and processing notes.) */
  function creditName(author) {
    let a = String(author || '').trim();
    if (!a) return '';
    if (/^Moonveil Miko\b/i.test(a)) return null;
    let depth = 0, cut = a.length;
    for (let i = 0; i < a.length; i++) {
      const ch = a[i];
      if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (ch === ';' || (ch === '—' && a[i - 1] === ' '))) { cut = i; break; }
    }
    a = a.slice(0, cut).trim();
    a = a.replace(/\s*\(([^()]*)\)\s*$/, (m, inner) => (/\.tmp|\/|original|generat|retarget|procedural|conversion/i.test(inner) ? '' : m));
    return a.trim();
  }
  function credits(roll) {
    const man = (G.assets && G.assets.manifest) || {};
    const groups = {};
    for (const id of Object.keys(man)) {
      const a = man[id] || {};
      const type = ['model', 'audio', 'texture', 'font'].includes(a.type) ? a.type : 'other';
      const name = creditName(a.author);
      if (name === null) continue;
      const g = groups[type] || (groups[type] = new Map());
      const author = name || t('ui.credits.unknown');
      const k = author + '\u0001' + (a.license || '');
      const e = g.get(k) || { author, license: a.license || '', source: a.source || '', n: 0 };
      e.n++;
      g.set(k, e);
    }
    const types = Object.keys(groups);
    if (!types.length) return;
    const sec = el('div', 'sec', roll);
    tel('div', 'sh', sec, 'ui.credits.assets');
    for (const type of ['model', 'audio', 'texture', 'font', 'other']) {
      if (!groups[type]) continue;
      tel('div', 'sub', sec, 'ui.credits.type.' + type);
      for (const e of groups[type].values()) {
        const r = el('div', 'cr', sec);
        el('span', 'a', r, t('ui.credits.line', { author: e.author }) + (e.n > 1 ? '  ' + t('ui.credits.count', { n: e.n }) : ''));
        el('span', 'l', r, t('ui.credits.license', { license: e.license || '—' }));
      }
    }
  }

  function showEnding(data = {}) {
    return new Promise((resolve) => {
      G.ui?.prompt?.(null); G.ui?.bossBar?.(null); G.ui?.struggle?.(null);
      try { G.input?.exitLock(); } catch (e) { /* ignore */ }
      G.setMode('ending');
      const R = el('div', 'layer mv-end', host);
      const lineEl = el('div', 'en-line', R);
      const fin = el('span', 'seal en-fin', R, t('ui.ending.fin'));
      const go = el('div', 'en-go', R);
      const lines = Array.isArray(data.lines) ? data.lines : data.text ? [data.text] : [];
      const vertical = data.vertical ?? !!layoutFlag('vertical', true);
      let phase = 'lines', i = -1, timer = 0, roll = null, y = 0, rollH = 0, done = false, held = 0;

      function nextLine() {
        i++;
        lineEl.classList.remove('on');
        if (i >= lines.length) { phase = 'fin'; timer = 0; lineEl.style.display = 'none'; return; }
        setTimeout(() => {
          // vertical writing: every clause becomes its own column (when the clauses are short enough to stand)
          const str = String(lines[i]);
          const brk = String(layoutFlag('clauseBreak', '') || '');
          let cols = [str];
          if (brk) { let buf = ''; cols = []; for (const ch of str) { buf += ch; if (brk.includes(ch) || ch === '\n') { cols.push(buf.replace('\n', '')); buf = ''; } } if (buf) cols.push(buf); }
          const v = vertical && cols.every((c) => Array.from(c).length <= 16) && cols.length <= 6;
          lineEl.textContent = v ? cols.join('\n') : str;
          lineEl.classList.toggle('v', v);
          lineEl.classList.add('on');
        }, i === 0 ? 900 : 700);
        timer = 0;
      }
      function buildRoll() {
        roll = el('div', 'en-roll', R);
        el('div', 'ring', roll);
        el('div', 'gt', roll, data.title || t('core.title'));
        // who made it
        const staff = el('div', 'sec', roll);
        tel('div', 'sh', staff, 'ui.credits.staff');
        tel('div', 'sub', staff, 'ui.credits.director');
        el('div', 'ln nm', staff, t('ui.credits.directorName'));
        el('div', 'ln', staff, t('ui.credits.home'));
        tel('div', 'sub', staff, 'ui.credits.ai');
        for (const l of raw('ui.credits.aiLines') || []) el('div', 'ln', staff, l);
        const helpers = raw('ui.credits.contributorLines') || [];
        if (helpers.length) { tel('div', 'sub', staff, 'ui.credits.contributors'); for (const l of helpers) el('div', 'ln', staff, l); }
        // record of the journey
        if (data.stats !== false && G.state) {
          const s = G.state;
          const cnt = (o) => Object.keys(o || {}).filter((k) => o[k]).length;
          const sec = el('div', 'sec', roll);
          tel('div', 'sh', sec, 'ui.ending.stats.title');
          const st = el('div', 'st', sec);
          tel('span', '', st, 'ui.ending.stats.time', { time: fmtTime(s.playTime) });
          // only the records this journey can have (the lantern / tear counts belong to the engine's first game)
          const opt = (k, n) => { if (n > 0) tel('span', '', st, 'ui.ending.stats.' + k, { n }); };
          opt('lanterns', cnt(s.lanterns));
          opt('great', cnt(s.greatLanterns));
          opt('tears', (s.inventory && s.inventory.moontear) || 0);
          tel('span', '', st, 'ui.ending.stats.kills', { n: (s.stats && s.stats.kills) || 0 });
          opt('notes', cnt(s.elementNotes));
          opt('dust', (s.inventory && s.inventory.stardust) || 0);
        }
        const made = el('div', 'sec', roll);
        tel('div', 'sh', made, 'ui.credits.made');
        for (const l of raw('ui.credits.madeLines') || []) el('div', 'ln', made, l);
        for (const l of Array.isArray(data.credits) ? data.credits : []) el('div', 'ln', made, String(l));
        credits(roll);
        const tools = el('div', 'sec', roll);
        tel('div', 'sh', tools, 'ui.credits.tools');
        for (const l of raw('ui.credits.toolsLines') || []) el('div', 'ln', tools, l);
        tel('div', 'thx', roll, 'ui.ending.thanks');
        el('span', 'seal', roll, t('ui.seal.end'));
        rollH = roll.offsetHeight;
        y = 0;
      }
      function hintFor(k) { hintLine(go, k, { key: codeLabel('Space') }); }
      hintFor('ui.ending.continue');

      const modal = {
        el: R,
        update(rdt) {
          timer += rdt;
          if (phase === 'lines') {
            const cur = i >= 0 ? String(lines[i] || '') : '';
            const auto = i < 0 ? 0.6 : 4 + cur.length * 0.09;
            if (timer > auto || (i >= 0 && timer > 1.2 && (K.confirm() || K.code('Mouse0')))) nextLine();
          } else if (phase === 'fin') {
            if (timer > 0.9 && !fin.classList.contains('on')) { fin.classList.add('on'); sfx('stamp'); sfx('ui_select', 0.8); }
            if (timer > 3.6) { fin.style.transition = 'opacity 1.2s'; fin.style.opacity = '0'; }
            if (timer > 4.6) { phase = 'roll'; buildRoll(); hintFor('ui.ending.skip'); }
          } else if (phase === 'roll') {
            const fast = K.confirmHeld() || G.input.codeHeld('Mouse0');
            held = fast ? held + rdt : 0;
            y += rdt * UI.u * (fast ? 260 : 42);
            const end = rollH + UI.h * 0.36;          // the thanks + seal come to rest a little below the centre
            if (K.cancel() || K.code('Enter') || K.code('NumpadEnter')) y = end;   // skip the roll
            if (y >= end) { y = end; phase = 'end'; timer = 0; hintFor('ui.ending.continue'); }
            roll.style.transform = `translateY(${(-y).toFixed(1)}px)`;
          } else if (phase === 'end') {
            if (timer > 1 && (K.confirm() || K.cancel())) finish();
          }
          K.eat();
        },
      };
      R.addEventListener('click', () => { if (phase === 'end' && timer > 1) finish(); });
      function finish() {
        if (done) return;
        done = true;
        popModal(modal);
        R.style.transition = 'opacity 1s'; R.classList.remove('on');
        setTimeout(() => { R.remove(); resolve(); }, 1000);
      }
      pushModal(modal);
      requestAnimationFrame(() => requestAnimationFrame(() => R.classList.add('on')));
      // test / debug access
      showEnding._skip = (p) => { if (p === 'roll') { lines.length = 0; i = 0; phase = 'fin'; timer = 4.6; lineEl.style.display = 'none'; } };
    });
  }

  return { learnSpell, showEnding };
}
