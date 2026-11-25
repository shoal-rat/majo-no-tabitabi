// The title background: Elaina banks through a sunlit street of the City of Magic (tools/trailer/shots/readme/title-still.js).
import { G } from '../core/game.js';
import { t, has } from '../core/i18n.js';
import { K, el, tel, fmtTime, hintLine, pushModal, popModal, sfx, codeLabel, noteSelfUnlock } from './dom.js';
import { icon } from './icons.js';
import { addCss } from './style.js';
import { navList, openSheet, confirmBox } from './panels.js';
import { isIOS, standalone } from './touchenv.js';

addCss(`
.mv-title {pointer-events:auto;opacity:0;transition:opacity .55s;color:var(--star);background:#514c45 url("assets/textures/journey/magic-country-title.webp") 60% 45% / cover no-repeat;}
.mv-title.on {opacity:1;}
.mv-title.out {opacity:0;pointer-events:none;}
.tt-wash {position:absolute;inset:0;background:radial-gradient(ellipse 46% 56% at 20% 50%,rgba(8,12,28,.42),rgba(8,12,28,0) 72%),linear-gradient(90deg,rgba(10,16,32,.72),rgba(14,22,40,.42) 32%,rgba(14,22,40,0) 62%),linear-gradient(0deg,rgba(8,12,26,.7),rgba(8,12,26,0) 34%);}
.tt-name,.tt-menu,.tt-load {position:absolute;left:7.4%;}
.tt-name {bottom:49%;padding-bottom:26u;}
.tt-name .nm {font:700 92u/1.12 var(--fd);letter-spacing:.1em;color:transparent;-webkit-background-clip:text;background-clip:text;
  background-image:linear-gradient(100deg,rgba(255,255,255,0) 42%,rgba(255,255,255,.65) 50%,rgba(255,255,255,0) 58%),linear-gradient(180deg,#fffbf2 28%,#f2dfac 74%,#cfa961);
  background-size:260% 100%,100% 100%;background-repeat:no-repeat;animation:mv-sheen 9s ease-in-out 1.2s infinite;filter:drop-shadow(0 3u 10u rgba(8,12,28,.6)) drop-shadow(0 1u 1u rgba(8,12,28,.5));}
.tt-name .orn {width:430u;height:22u;margin:8u 0 0 -4u;background:linear-gradient(90deg,var(--brass2),#fff3d0 50%,var(--brass2));filter:drop-shadow(0 1u 2u rgba(0,0,0,.5));}
.tt-name .tag {margin-top:12u;display:flex;align-items:center;gap:14u;font:400 19u/1.4 var(--fb);letter-spacing:.16em;color:#f6e9cc;text-shadow:var(--halo);}
.tt-name .tag::before {content:'';width:44u;height:1u;background:linear-gradient(90deg,rgba(236,217,164,0),var(--brass2));}
.tt-menu {top:53%;width:330u;}
.tt-menu .btn {width:100%;box-sizing:border-box;min-height:48u;display:flex;align-items:center;gap:14u;border-radius:4u;background:transparent;color:rgba(255,247,232,.86);font:600 21u/1.2 var(--fd);letter-spacing:.14em;text-align:left;padding:9u 18u 9u 36u;cursor:pointer;text-shadow:var(--halo);}
.tt-menu .btn::after {left:12u;width:12u;height:12u;margin-top:-6u;background:var(--brass2);}
.tt-menu .btn::before {left:34u;right:30%;bottom:4u;background:linear-gradient(90deg,var(--brass2),rgba(236,217,164,0));transform-origin:0 50%;}
.tt-menu .btn .ic {font-size:15u;color:var(--brass2);opacity:.9;}
.tt-menu .btn:hover,.tt-menu .btn.sel {color:#fffaf0;background:linear-gradient(90deg,rgba(236,217,164,.2),rgba(236,217,164,0) 82%);}
.tt-menu .info {font:400 13.5u/1.4 var(--fb);color:rgba(246,233,204,.82);margin:0 0 8u 66u;text-shadow:var(--halo);}
.tt-load {bottom:7.8%;width:300u;font:400 13u/1.6 var(--fb);color:rgba(255,247,232,.8);text-shadow:var(--halo);}
.tt-load .lb {height:2u;margin-top:4u;border-radius:1u;background:rgba(255,247,232,.18);}
.tt-load i {display:block;height:2u;border-radius:1u;background:linear-gradient(90deg,var(--brass),var(--brass2));box-shadow:0 0 6u rgba(236,217,164,.6);transition:width .25s;}
.mv-title.ready .tt-load {display:none;}
.mv-title .btn.wait {opacity:.6;}
.tt-foot,.tt-ver {position:absolute;bottom:3.8%;font:400 13u/1.4 var(--fb);color:rgba(246,236,214,.85);text-shadow:var(--halo);}
.tt-foot {left:7.4%;display:flex;align-items:center;gap:4u;}
.tt-foot .keycap {margin:0 2u;}
.tt-ver {right:4%;font-family:var(--fd);letter-spacing:.08em;}
.tt-ios {display:none;position:absolute;left:7.4%;bottom:calc(3.8% + 22u);max-width:520u;font:400 13u/1.5 var(--fb);color:#f6e7c9;opacity:.85;text-shadow:var(--halo);}
.mv-ui.touch .mv-title.ready .tt-ios.on {display:block;}
/* phones and tablets: a smaller name higher up, the menu under it, notches kept clear */
.mv-ui.compact .tt-name,.mv-ui.compact .tt-menu,.mv-ui.compact .tt-load,.mv-ui.compact .tt-foot,.mv-ui.compact .tt-ios {left:calc(6% + env(safe-area-inset-left,0px));}
.mv-ui.compact .tt-ver {right:calc(4% + env(safe-area-inset-right,0px));}
.mv-ui.compact .tt-name {bottom:56%;padding-bottom:14u;}
.mv-ui.compact .tt-name .nm {font-size:66u;}
.mv-ui.compact .tt-name .orn {width:320u;height:18u;margin-top:4u;}
.mv-ui.compact .tt-name .tag {margin-top:8u;font-size:16u;}
.mv-ui.compact .tt-menu {top:46%;}
.mv-ui.compact .tt-menu .btn {min-height:44px;font-size:20u;padding:6u 18u 6u 36u;}
.mv-ui.compact .tt-menu .info {margin:0 0 4u 66u;}
.mv-ui.compact .tt-load {bottom:calc(9% + env(safe-area-inset-bottom,0px));}
.mv-ui.compact .tt-foot,.mv-ui.compact .tt-ver {bottom:calc(3% + env(safe-area-inset-bottom,0px));}
.mv-ui.compact .tt-ios {bottom:calc(3% + 20u + env(safe-area-inset-bottom,0px));}
`);

export function createTitle(root, stage) {
  let open = null; // { resolve, info }

  function placeOf(info) {
    try {
      const p = info && info.player;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.z) && G.world?.regionAt) {
        const id = G.world.regionAt(p.x, p.z);
        if (has('world.place.' + id)) return t('world.place.' + id);
      }
    } catch (e) { /* the world may be absent */ }
    return t('world.name');
  }

  function show({ hasSave, saveInfo, ready: readyP } = {}) {
    if (open) return open.promise;
    const R = el('div', 'layer mv-title', root);
    el('div', 'tt-wash', R);
    const nameBox = el('div', 'tt-name', R);
    const nm = el('div', 'nm', nameBox);
    const paintName = () => { nm.textContent = t('core.title'); };
    paintName();
    el('div', 'orn', nameBox);
    tel('div', 'tag', nameBox, 'ui.title.tagline');
    const menu = el('div', 'tt-menu', R);
    const items = [];
    const add = (id, ic, key, info) => {
      const it = el('div', 'it', menu);
      const b = el('div', 'btn', it); icon(ic, '', b); tel('span', '', b, key);
      if (info) tel('div', 'info', it, 'ui.title.saveInfo', info);
      b._id = id;
      items.push(b);
    };
    if (hasSave) add('continue', 'resume', 'ui.title.continue', () => ({ place: placeOf(saveInfo), time: fmtTime(saveInfo && saveInfo.playTime) }));
    add('new', 'brush', 'ui.title.new');
    add('settings', 'settings', 'ui.title.settings');
    add('controls', 'journal', 'ui.title.controls');

    const foot = el('div', 'tt-foot', R);
    // keys on a desktop; on a touch screen just "tap where you want to go"
    const paintFoot = () => { if (G.input?.touch) foot.textContent = t('ui.touch.titleHint'); else hintLine(foot, 'ui.title.hint', { up: '↑', down: '↓', ok: codeLabel('Enter') }); };
    paintFoot();
    // iPhone Safari cannot go fullscreen from a page: say how (home-screen launch) once, quietly
    const ios = tel('div', 'tt-ios', R, 'ui.touch.ios');
    ios.classList.toggle('on', isIOS() && !standalone() && !document.fullscreenElement && !document.webkitFullscreenElement && !(G.params && G.params.autostart));
    const offRebound = G.events.on('input:rebound', paintFoot);
    tel('div', 'tt-ver', R, 'ui.title.version', { v: G.version });

    // boot (docs/api/perf.md "Boot and loading"): the title can open while the world still loads behind it; then
    // "continue" / "new" are dimmed under a progress line, and a choice made early is kept and carried out when ready
    let ready = !readyP, queued = null;
    const loadBox = el('div', 'tt-load', R);
    const loadTx = el('div', '', loadBox), loadBar = el('i', '', el('div', 'lb', loadBox));
    const paintLoad = (p) => { if (!p) return; if (p.text) loadTx.textContent = p.text; loadBar.style.width = Math.round((p.frac || 0) * 100) + '%'; };
    const offProg = G.events.on('boot:progress', paintLoad);
    paintLoad(G.bootProgress?.());
    const gameBtns = items.filter((b) => b._id === 'new' || b._id === 'continue');
    if (ready) R.classList.add('ready'); else for (const b of gameBtns) b.classList.add('wait');
    if (readyP) readyP.then(() => {
      ready = true; offProg?.();
      R.classList.add('ready');
      for (const b of gameBtns) b.classList.remove('wait', 'queued');
      if (queued && open) { const q = queued; queued = null; pick(q, true); }
    });

    let busy = false;
    const nav = navList(items, (i) => pick(items[i]._id)).bind();

    async function pick(id, fromQueue = false) {
      if (busy) return;
      if (!fromQueue) sfx('ui_select');
      if (id === 'settings' || id === 'controls') { busy = true; await openSheet(root, id); busy = false; return; }
      if (id === 'new' && hasSave && !fromQueue) {
        busy = true;
        const ok = await confirmBox(root, { title: t('ui.title.overwriteTitle'), text: t('ui.title.overwriteText'), yes: t('ui.title.overwriteYes'), no: t('ui.title.overwriteNo'), seal: t('ui.seal.done') });
        busy = false;
        if (!ok) return;
      }
      if (!ready && (id === 'new' || id === 'continue')) {
        queued = id;
        for (const b of gameBtns) b.classList.toggle('queued', b._id === id);
        return;
      }
      busy = true;
      // the click / key press that chose is a user gesture: capture the pointer for play now
      try { G.input?.requestLock(); } catch (e) { /* ignore */ }
      R.classList.add('out');
      popModal(modal);
      await stage.fade(1, 0.55, '#07060e');
      R.remove();
      offRebound?.();
      const o = open; open = null;
      o.resolve(id);
    }

    const modal = {
      el: R,
      relabel() { paintName(); paintFoot(); },
      update() { if (!busy) nav.keys(); K.eat(); },
    };
    pushModal(modal);
    requestAnimationFrame(() => requestAnimationFrame(() => R.classList.add('on')));
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    open = { resolve, promise };
    noteSelfUnlock();
    return promise;
  }

  return { show, get open() { return !!open; } };
}
