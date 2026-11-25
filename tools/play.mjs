#!/usr/bin/env node
// Run the game in a private headless Chrome, drive it with a script, take screenshots, report errors.
//
//   node tools/play.mjs --name mytest [--systems sky,terrain] [--params "pos=-455,150"] [--script path.js | --eval "code"]
//                       [--size 1280x720] [--timeout 180] [--quality high] [--dpr 3]
//
// --systems   build only these systems (others absent; the core supplies a fallback sky / ground / free camera)
// --params    extra URL parameters. autostart=1 (skip title, never touches the real save) and mute=1 are always set.
//             Useful: pos=x,z   cam=px,py,pz,tx,ty,tz (free camera start when the player system is absent)   quality=low|med|high
// --script    a JS file whose body runs INSIDE the page as an async function with `T` (helpers) and `G` (the game) in scope.
//             Whatever it returns is printed as JSON. Helpers:
//               await T.frames(n)            wait n rendered frames          await T.wait(ms)
//               T.key('KeyW', true|false)    hold / release a key            await T.press('Space', 90)
//               T.look(dx, dy)               mouse-look by pixels            T.teleport(x, z, y?)
//               T.cam(px,py,pz, tx,ty,tz)    lock the camera (T.cam() frees it). NOTE: this MOVES G.camera, and aim /
//                                            camera-relative movement read G.camera — a camera in front of her turns her away.
//               T.viewCam(px,py,pz, tx,ty,tz) VIEW-ONLY test camera: the frame is drawn from here, but between frames
//                                            G.camera is the game camera again (aim, movement, orbit camera unaffected).
//                                            Free it with T.cam(). Use this for side / front / back verification strips.
//               T.orbitCam(side, dist=4, h=1.1, lookH=0.95)  view-only camera around the heroine at her current pos/yaw:
//                                            side 'front'|'back'|'left'|'right' or a yaw offset (rad). Call it every frame
//                                            (or before each T.shot) to follow her while she moves.
//               await T.shot('name')         save <out>/<name>.png           T.errors()  T.stats()
// --title    do NOT autostart: boot to the real title screen with saving enabled; the script drives the menu.
// --mobile   a phone held sideways: mobile viewport (use --size 844x390), touch emulation (pointer: coarse -> the touch
//            controls come up by themselves), and real touch events for the script (CDP Input.dispatchTouchEvent):
//               await T.touchDown(id, x, y)   await T.touchMove(id, x, y)   await T.touchUp(id)
//               await T.tap(x, y, ms=60)       await T.swipe(id, x0, y0, x1, y1, steps=8, ms=200)
//            Buttons: G.ui.touch.where('cast') -> {x, y, w};  stick: G.ui.touch.stick -> {cx, cy, r}.
// --dpr      device pixel ratio of the emulated screen (default 1; a phone is ~3: --mobile --size 844x390 --dpr 3).
//            Screenshots are then saved at device pixels (2532x1170 for that phone).
// --profile  name of a persistent browser profile under .tmp/profiles/ (keeps the save between runs; default: throwaway).
// Bad networks (docs/api/perf.md "Loading on a bad network"):
// --throttle kbps[,latencyMs]  a slow link for every request (CDP Network.emulateNetworkConditions), e.g. 4000,150
// --fault    sub:stall|fail[:n][,…]  the first n (default 1) requests whose URL contains `sub` hang with no answer
//            (stall: a dead connection) or are reset (fail). E.g. --fault elaina_apprentice.glb:stall,prop_:fail:3
//            The script can end every fault at once: window.__mvFaults('off') (e.g. "the connection came back").
// --hidden   boot in a background tab (another tab in front, real background throttling) until the game is ready
// --boot-timeout s  how long to wait for the game to become ready (default: --timeout, 90..240)
// Without a script: waits 2.5 s and saves final.png.
// Output folder: .tmp/play/<name>/ (printed at the end). Exit code 0 = no errors, 2 = errors were reported.
import fs from 'node:fs';
import path from 'node:path';
import { launch, TMP } from './cdp.mjs';
import { build, serveGame } from '../build.mjs';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const name = (opt('name', 'run') || 'run').replace(/[^\w.-]/g, '_');
const systems = opt('systems') ? opt('systems').split(',').map((s) => s.trim()).filter(Boolean) : null;
const [W, H] = (opt('size', '1280x720') || '1280x720').split('x').map(Number);
const timeout = Number(opt('timeout', 180)) * 1000;
const outDir = path.join(TMP, 'play', name);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let script = opt('eval');
if (opt('script')) script = fs.readFileSync(path.resolve(opt('script')), 'utf8');
if (!script) script = `await T.wait(2500); await T.shot('final'); return { stats: T.stats(), region: G.env.regionName, veil: +G.env.veil.toFixed(2) };`;

const b = await build({ systems });
if (!b.ok) { console.error('BUILD FAILED\n' + b.errors); process.exit(1); }
if (b.warnings) console.log('build warnings:\n' + b.warnings);

// a named profile needs a stable origin (localStorage is per host:port), so it gets a fixed port derived from its name
const profPort = opt('profile') ? 47400 + [...opt('profile')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 500, 7) : 0;
const { server, url } = await serveGame({ getBuild: async () => b, port: profPort });
const usp = new URLSearchParams(opt('params') || '');
const TITLE = args.includes('--title'); // real flow: boot -> title screen -> the script picks new / continue (saving enabled)
if (!TITLE) usp.set('autostart', '1');
if (!usp.has('mute')) usp.set('mute', '1');
if (opt('quality')) usp.set('quality', opt('quality'));

const HIDDEN = args.includes('--hidden');
const page = await launch({ width: W, height: H, backgroundThrottling: HIDDEN, profileDir: opt('profile') ? path.join(TMP, 'profiles', opt('profile').replace(/[^\w.-]/g, '_')) : null });
if (opt('throttle')) {
  const [kbps, lat = 100] = opt('throttle').split(',').map(Number);
  await page.send('Network.enable');
  await page.send('Network.emulateNetworkConditions', { offline: false, latency: lat, downloadThroughput: (kbps * 1000) / 8, uploadThroughput: (kbps * 1000) / 8 });
}
const faults = (opt('fault') || '').split(',').filter(Boolean).map((f) => { const [sub, kind = 'fail', n = 1] = f.split(':'); return { sub, kind, n: Number(n) || 1 }; });
const faultLog = [];
if (faults.length) {
  await page.send('Fetch.enable', { patterns: faults.map((f) => ({ urlPattern: '*' + f.sub + '*', requestStage: 'Request' })) });
  page.on('Fetch.requestPaused', (p) => {
    const f = faults.find((x) => x.n > 0 && p.request.url.includes(x.sub));
    if (!f) { page.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {}); return; }
    f.n--;
    faultLog.push([+((Date.now() - t0) / 1000).toFixed(1), f.kind, p.request.url.slice(p.request.url.lastIndexOf('/') + 1)]);
    if (f.kind === 'fail') page.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionReset' }).catch(() => {});
    // stall: left paused, no answer ever comes (the page's own timeout has to notice)
  });
  await page.send('Runtime.addBinding', { name: '__mvFaults' });
  page.on('Runtime.bindingCalled', (p) => { if (p.name === '__mvFaults') { for (const f of faults) f.n = 0; faultLog.push([+((Date.now() - t0) / 1000).toFixed(1), 'off', '(script)']); } });
}
const MOBILE = args.includes('--mobile');
const DPR = Number(opt('dpr', 1)) > 0 ? Number(opt('dpr', 1)) : 1;
if (!MOBILE && DPR !== 1) await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
if (MOBILE) {
  await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true, screenOrientation: { type: W > H ? 'landscapePrimary' : 'portraitPrimary', angle: W > H ? 90 : 0 } });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Runtime.addBinding', { name: '__mvTouch' });
  // the page asks for a touch event; it is sent for real and the page is told when it has been dispatched
  page.on('Runtime.bindingCalled', async (p) => {
    if (p.name !== '__mvTouch') return;
    let m = null;
    try { m = JSON.parse(p.payload); await page.send('Input.dispatchTouchEvent', { type: m.type, touchPoints: m.points }); } catch (e) { note('error', 'touch failed: ' + e.message); }
    page.send('Runtime.evaluate', { expression: `window.__mvTouchDone(${m ? m.seq : -1})` }).catch(() => {});
  });
}
const logs = [];
const seen = new Map();
const note = (kind, text) => {
  const k = kind + text;
  if (seen.has(k)) { seen.get(k).n++; return; }
  const rec = { kind, text, n: 1 }; seen.set(k, rec); logs.push(rec);
};
page.on('Runtime.consoleAPICalled', (p) => {
  if (p.type !== 'error' && p.type !== 'warning' && !args.includes('--verbose')) return;
  const text = p.args.map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
  note(p.type, text.slice(0, 600));
});
page.on('Runtime.exceptionThrown', (p) => {
  const d = p.exceptionDetails;
  note('exception', ((d.exception && d.exception.description) || d.text || '').slice(0, 900));
});
await page.send('Runtime.addBinding', { name: '__mvShot' });
const shots = [];
page.on('Runtime.bindingCalled', async (p) => {
  if (p.name !== '__mvShot') return;
  const n = String(p.payload || 'shot').replace(/[^\w.-]/g, '_');
  const file = path.join(outDir, n + '.png');
  try { await page.screenshot(file); shots.push(file); } catch (e) { note('error', 'screenshot failed: ' + e.message); }
  page.send('Runtime.evaluate', { expression: `window.__mvShotDone(${JSON.stringify(String(p.payload || 'shot'))})` }).catch(() => {});
});

let code = 0;
let result;
const t0 = Date.now();
try {
  await page.goto(url + '?' + usp.toString());
  let front = null;
  if (HIDDEN) { // a blank tab in front: the game tab is now a background tab (document hidden, no animation frames)
    await new Promise((r) => setTimeout(r, 300));
    front = await (await fetch(`http://127.0.0.1:${page.port}/json/new?about:blank`, { method: 'PUT' })).json();
    console.log('booting in a background tab: ' + await page.evaluate('document.visibilityState').catch(() => '?'));
  }
  let ready = false;
  const bootWait = opt('boot-timeout') ? Number(opt('boot-timeout')) * 1000 : Math.max(90000, Math.min(timeout, 240000));
  while (Date.now() - t0 < bootWait) { // boot can take minutes when several runs share the GPU
    const r = await page.evaluate(TITLE ? "(window.__mvReady === 'failed') ? 'failed' : (window.__game && window.__game.mode === 'title' && window.__T ? true : null)" : 'window.__mvReady === undefined ? null : window.__mvReady').catch(() => null);
    if (r === true) { ready = true; break; }
    if (r === 'failed') break;
    await new Promise((r2) => setTimeout(r2, 150));
  }
  if (front) {
    console.log(`background tab: ${ready ? 'ready' : 'not ready'} after ${((Date.now() - t0) / 1000).toFixed(1)} s, still ${await page.evaluate('document.visibilityState').catch(() => '?')}`);
    await fetch(`http://127.0.0.1:${page.port}/json/close/${front.id}`).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) {
    code = 2;
    console.log('GAME DID NOT BECOME READY (boot failed or timed out).');
    await page.screenshot(path.join(outDir, 'boot-failure.png')).then((f) => shots.push(f)).catch(() => {});
  } else {
    console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    try {
      if (MOBILE) await page.evaluate(`(() => { const T = window.__T, act = new Map(), wait = {}; let seq = 0;
        window.__mvTouchDone = (n) => { const r = wait[n]; delete wait[n]; if (r) r(); };
        const send = (type) => new Promise((res) => { const n = ++seq; wait[n] = res; window.__mvTouch(JSON.stringify({ seq: n, type, points: [...act].map(([id, p]) => ({ id, x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 1 })) })); });
        T.touchDown = (id, x, y) => { act.set(id, { x, y }); return send('touchStart'); };
        T.touchMove = (id, x, y) => { const p = act.get(id); if (!p) return Promise.resolve(); p.x = x; p.y = y; return send('touchMove'); };
        T.touchUp = (id) => { act.delete(id); return send('touchEnd'); };
        T.tap = async (x, y, ms = 60) => { await T.touchDown(99, x, y); await T.wait(ms); await T.touchUp(99); };
        T.swipe = async (id, x0, y0, x1, y1, steps = 8, ms = 200) => { await T.touchDown(id, x0, y0); for (let i = 1; i <= steps; i++) { await T.wait(ms / steps); await T.touchMove(id, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); } await T.touchUp(id); };
      })()`);
      result = await page.evaluate(`(async () => { const T = window.__T, G = window.__game; ${script}\n})()`, { timeout });
    } catch (e) {
      code = 2;
      console.log('SCRIPT ERROR: ' + e.message);
      await page.screenshot(path.join(outDir, 'script-error.png')).then((f) => shots.push(f)).catch(() => {});
    }
  }
  const gerr = await page.evaluate('window.__game && window.__game.debug ? window.__game.debug.errors() : []').catch(() => []);
  if (gerr.length) { code = 2; console.log('G.errors:\n  ' + gerr.join('\n  ')); }
} finally {
  await page.close();
  server.close();
}
const bad = logs.filter((l) => l.kind !== 'warning' && l.kind !== 'log' && l.kind !== 'info' && l.kind !== 'debug');
if (logs.length) {
  console.log('console:');
  for (const l of logs.slice(0, 40)) console.log(`  [${l.kind}${l.n > 1 ? ' ×' + l.n : ''}] ${l.text}`);
  if (logs.length > 40) console.log(`  … ${logs.length - 40} more`);
}
if (bad.length) code = 2;
if (faultLog.length) console.log('faults injected:\n  ' + faultLog.map((f) => f.join(' ')).join('\n  '));
if (result !== undefined) console.log('result: ' + JSON.stringify(result, null, 1));
if (shots.length) console.log('screenshots:\n  ' + shots.join('\n  '));
console.log(code === 0 ? 'OK (no errors)' : 'FINISHED WITH ERRORS');
process.exit(code);
