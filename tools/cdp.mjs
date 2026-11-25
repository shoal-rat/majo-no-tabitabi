// Minimal headless-Chrome driver over the DevTools protocol (no dependencies; Node 22+ for global WebSocket/fetch).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Scratch area for test runs (browser profiles, screenshots). Override with MV_TMP. */
export const TMP = process.env.MV_TMP ? path.resolve(process.env.MV_TMP) : path.join(ROOT, '.tmp');

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Launch a private headless Chrome and attach to its first page.
 * Returns { send(method, params), on(event, fn), close(), evaluate(expr, {timeout}), screenshot(file), goto(url) }.
 */
export async function launch({ width = 1280, height = 720, headless = true, profileDir = null, backgroundThrottling = false } = {}) {
  const exe = process.env.CHROME_BIN || CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('No Chrome/Chromium/Edge found. Set CHROME_BIN.');
  fs.mkdirSync(TMP, { recursive: true });
  const keepProfile = !!profileDir; // a named profile persists (localStorage = save data survives between runs)
  if (profileDir) fs.mkdirSync(profileDir, { recursive: true });
  const profile = profileDir || fs.mkdtempSync(path.join(TMP, 'chrome-'));
  const args = [
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--disable-component-update', '--mute-audio', '--hide-scrollbars',
    `--window-size=${width},${height}`, '--force-device-scale-factor=1',
    '--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ];
  // backgroundThrottling: a tab behind another one is throttled like a player's background tab (play.mjs --hidden)
  if (!backgroundThrottling) args.push('--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows');
  if (headless) args.push('--headless=new');
  args.push('about:blank');
  for (const stale of ['DevToolsActivePort', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']) { try { fs.rmSync(path.join(profile, stale), { force: true }); } catch (e) { /* ignore */ } }
  const proc = spawn(exe, args, { stdio: 'ignore' });
  let closed = false;
  const cleanup = () => {
    if (closed) return; closed = true;
    try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
    if (!keepProfile) setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ } }, 300);
  };
  process.on('exit', () => { try { proc.kill('SIGKILL'); } catch (e) { /* ignore */ } if (!keepProfile) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ } } });

  // wait for the debugging port
  const portFile = path.join(profile, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 200 && !port; i++) {
    await sleep(50);
    if (fs.existsSync(portFile)) { const t = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim(); if (t) port = Number(t); }
  }
  if (!port) { cleanup(); throw new Error('Chrome did not open a debugging port'); }
  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = list.find((t) => t.type === 'page'); } catch (e) { /* retry */ }
    if (!target) await sleep(50);
  }
  if (!target) { cleanup(); throw new Error('No page target'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('CDP socket failed')), { once: true }); });
  let nextId = 0;
  const waiting = new Map();
  const handlers = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
    if (m.id !== undefined) {
      const w = waiting.get(m.id);
      if (w) { waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); }
    } else if (m.method) {
      for (const fn of handlers.get(m.method) || []) { try { fn(m.params); } catch (e) { console.error(e); } }
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++nextId; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const on = (event, fn) => { if (!handlers.has(event)) handlers.set(event, []); handlers.get(event).push(fn); };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const api = {
    send, on, port,
    async goto(url) { await send('Page.navigate', { url }); },
    /** Evaluate an expression in the page (awaits promises). Returns the value; throws with the page's error text. */
    async evaluate(expression, { timeout = 60000 } = {}) {
      const p = send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      let alarm;
      const deadline = new Promise((_, reject) => {
        alarm = setTimeout(() => reject(new Error(`evaluate timed out after ${timeout} ms`)), timeout);
      });
      const r = await Promise.race([p, deadline]).finally(() => clearTimeout(alarm));
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || 'page exception');
      }
      return r.result ? r.result.value : undefined;
    },
    async screenshot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async close() {
      if (keepProfile) { // let the browser flush localStorage (the save) before it goes
        const gone = new Promise((r) => proc.once('exit', r));
        try { await Promise.race([send('Browser.close'), sleep(800)]); } catch (e) { try { proc.kill('SIGTERM'); } catch (e2) { /* ignore */ } }
        await Promise.race([gone, sleep(5000)]);
      }
      try { ws.close(); } catch (e) { /* ignore */ }
      cleanup(); await sleep(350);
    },
  };
  return api;
}
