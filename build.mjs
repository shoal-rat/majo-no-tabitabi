// 月帷巫女 build script. Output is a small web app: index.html + game.js + assets/ (models, audio, textures).
//   node build.mjs                      -> dist/ (unminified, all systems; assets are NOT copied, dev server maps them)
//   node build.mjs --release            -> dist/ minified + assets/ copied (ready to ship / wrap as a desktop app)
//   node build.mjs --systems sky,terrain --out /tmp/x   -> subset build (other systems simply absent)
//   node build.mjs --check src/a.js src/b.js           -> syntax/import check of those modules only (no output)
//   node build.mjs --serve 8751         -> dev server; rebuilds on every page load; /assets/* served from ./assets
import { bakeJourneyField } from './tools/journey/bake-field.mjs';
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
export const ASSETS = path.join(ROOT, 'assets');
// the version the title screen shows (G.version): package.json is its only home
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/** Bytes of every model file in assets/manifest.json ({ id: bytes }): the boot bar counts megabytes against this total
 *  (src/core/assets.js). Read at build time, so it always matches the files shipped with this build. */
export function assetBytes() {
  const out = {};
  let m = {};
  try { m = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8')); } catch (e) { return out; }
  for (const [id, info] of Object.entries(m)) {
    if (info.type !== 'model' || !info.file) continue;
    try { out[id] = fs.statSync(path.join(ASSETS, info.file)).size; } catch (e) { /* missing file: counted as it arrives */ }
  }
  return out;
}

export function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'systems.manifest.json'), 'utf8'));
}

export function makeEntry(systemNames) {
  const man = loadManifest();
  if (systemNames) {
    const unknown = systemNames.filter((n) => !man.some((s) => s.name === n));
    if (unknown.length) throw new Error('unknown system(s): ' + unknown.join(', ') + ' — valid: ' + man.map((s) => s.name).join(', '));
  }
  const chosen = systemNames ? man.filter((s) => systemNames.includes(s.name)) : man;
  const lines = [`import 'virtual:locales';`, `import { boot } from './core/boot.js';`];
  chosen.forEach((s, i) => lines.push(`import { ${s.export} as s${i} } from './${s.path}';`));
  lines.push(`boot([${chosen.map((_, i) => 's' + i).join(', ')}]);`);
  return lines.join('\n');
}

/** Namespaces that always ship (owned by the core). Every other locale file belongs to the system its name starts with. */
const CORE_NAMESPACES = new Set(['core', 'world']);

/** Source of the virtual module that registers every locale file: src/locales/<locale>/<namespace>.js */
export function genLocales(systemNames = null) {
  const dir = path.join(SRC, 'locales');
  const lines = [`import { registerLocale } from './core/i18n.js';`];
  let n = 0;
  if (fs.existsSync(dir)) {
    for (const loc of fs.readdirSync(dir).sort()) {
      const ld = path.join(dir, loc);
      if (loc.startsWith('.') || loc.startsWith('_') || !fs.statSync(ld).isDirectory()) continue;
      for (const f of fs.readdirSync(ld).sort()) {
        if (!f.endsWith('.js') || f.startsWith('_')) continue;
        const ns = f.slice(0, -3);
        const owner = ns.split('.')[0];
        if (systemNames && !CORE_NAMESPACES.has(owner) && !systemNames.includes(owner)) continue;
        lines.push(`import L${n} from './locales/${loc}/${f}'; registerLocale(${JSON.stringify(loc)}, ${JSON.stringify(ns)}, L${n});`);
        n++;
      }
    }
  }
  return lines.join('\n');
}

function localesPlugin(systemNames) {
  return {
    name: 'mv-locales',
    setup(b) {
      b.onResolve({ filter: /^virtual:locales$/ }, () => ({ path: 'locales', namespace: 'mv-virtual' }));
      b.onLoad({ filter: /.*/, namespace: 'mv-virtual' }, () => ({ contents: genLocales(systemNames), resolveDir: SRC, loader: 'js' }));
    },
  };
}

const COMMON = {
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  legalComments: 'eof',
  loader: { '.glsl': 'text', '.css': 'text', '.txt': 'text' },
  logLevel: 'silent',
};

async function fmt(messages, kind) {
  const out = await esbuild.formatMessages(messages, { kind, color: false, terminalWidth: 120 });
  return out.join('\n');
}

/** Compile. Returns { ok, html, js, errors, warnings }. Never throws on compile errors. */
export async function build({ systems = null, minify = false } = {}) {
  let result, field;
  try {
    field = (!systems || systems.includes('terrain')) ? await bakeJourneyField(ROOT) : null;
    result = await esbuild.build({
      define: { __JOURNEY_FIELD__: JSON.stringify(field), __MV_VERSION__: JSON.stringify(VERSION), __ASSET_BYTES__: JSON.stringify(assetBytes()) },
      ...COMMON,
      stdin: { contents: makeEntry(systems), resolveDir: SRC, sourcefile: 'entry.js', loader: 'js' },
      plugins: [localesPlugin(systems)],
      minify,
    });
  } catch (e) {
    const errors = e.errors ? await fmt(e.errors, 'error') : String(e.stack || e);
    return { ok: false, errors, html: null, js: null };
  }
  let js = result.outputFiles[0].text;
  // build hash: keys the boot bake cache (src/core/bakecache.js), so a cached bake never outlives its code
  const hash = crypto.createHash('sha1').update(js).digest('hex').slice(0, 12);
  js = js.split('__MV_BUILD_HASH__').join(hash);
  const html = fs.readFileSync(path.join(SRC, 'index.template.html'), 'utf8');
  const warnings = result.warnings.length ? await fmt(result.warnings, 'warning') : '';
  return { ok: true, field, html, js, warnings };
}

/** Write a build result to a folder. */
export function writeBuild(r, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), r.html);
  fs.writeFileSync(path.join(outDir, 'game.js'), r.js);
  return outDir;
}

/** Check individual modules (and whatever they import) for syntax / unresolved-import errors. */
export async function check(files) {
  let ok = true;
  for (const f of files) {
    try {
      await esbuild.build({ ...COMMON, entryPoints: [path.resolve(f)] });
      console.log('OK   ' + f);
    } catch (e) {
      ok = false;
      console.log('FAIL ' + f + '\n' + (e.errors ? await fmt(e.errors, 'error') : String(e)));
    }
  }
  return ok;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.wasm': 'application/wasm',
};

/**
 * Tiny static server for the game. `getBuild()` returns a build result ({ok, html, js, errors}); it is called for every
 * request of the page so edits show up on reload. `/assets/*` is served straight from ./assets. port 0 = any free port.
 * Resolves to { server, port, url }.
 */
export function serveGame({ getBuild, port = 0, quiet = true, extraRoots = {} }) {
  let last = null;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      if (p === '/' || p === '/index.html') {
        last = await getBuild(url);
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
        if (last.ok) res.end(last.html);
        else res.end(`<!doctype html><meta charset="utf-8"><body style="background:#111;color:#f88;font:13px/1.5 monospace;white-space:pre-wrap;padding:20px">BUILD FAILED\n\n${String(last.errors).replace(/</g, '&lt;')}</body>`);
        if (!quiet) console.log(new Date().toISOString().slice(11, 19), last.ok ? 'built ' + ((last.js.length / 1024) | 0) + ' KB' : 'BUILD FAILED');
        return;
      }
      if (p === '/game.js') {
        if (!last) last = await getBuild(url);
        res.writeHead(last.ok ? 200 : 500, { 'content-type': MIME['.js'], 'cache-control': 'no-store' });
        res.end(last.ok ? last.js : 'console.error("build failed")');
        return;
      }
      let base = null, rel = null;
      if (p.startsWith('/assets/')) { base = ASSETS; rel = p.slice('/assets/'.length); }
      for (const k of Object.keys(extraRoots)) if (p.startsWith(k)) { base = extraRoots[k]; rel = p.slice(k.length); }
      if (base) {
        const file = path.normalize(path.join(base, rel));
        if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store', 'content-length': fs.statSync(file).size });
        fs.createReadStream(file).pipe(res);
        return;
      }
      res.writeHead(404); res.end('not found');
    } catch (e) {
      res.writeHead(500); res.end(String(e));
    }
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const pt = server.address().port;
      resolve({ server, port: pt, url: `http://127.0.0.1:${pt}/` });
    });
  });
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return 0;
  let n = 0;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === '_incoming' || e.name === '_preview' || e.name === '_terrain_cache') continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) n += copyDir(a, b);
    else { fs.copyFileSync(a, b); n++; }
  }
  return n;
}

// ---- CLI ---------------------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const has = (n) => args.includes('--' + n);
  const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  if (has('check')) {
    const files = args.slice(args.indexOf('--check') + 1).filter((a) => !a.startsWith('--'));
    process.exit((await check(files)) ? 0 : 1);
  } else if (has('serve')) {
    const { url } = await serveGame({
      port: Number(opt('serve', 8751)) || 8751, quiet: false,
      getBuild: (u) => build({ systems: u.searchParams.get('systems') ? u.searchParams.get('systems').split(',') : null }),
    });
    console.log(`魔女之旅 dev server → ${url}`);
  } else {
    const systems = opt('systems') ? opt('systems').split(',') : null;
    const outDir = opt('out') ? path.resolve(opt('out')) : path.join(ROOT, 'dist');
    const release = has('release');
    const r = await build({ systems, minify: release });
    if (!r.ok) { console.error('BUILD FAILED\n' + r.errors); process.exit(1); }
    if (r.warnings) console.log(r.warnings);
    writeBuild(r, outDir);
    console.log(`built ${outDir}/game.js (${(r.js.length / 1024) | 0} KB)`);
    if (release) {
      fs.rmSync(path.join(outDir, 'assets'), { recursive: true, force: true });
      const n = copyDir(ASSETS, path.join(outDir, 'assets'));
      fs.copyFileSync(path.join(ROOT, 'docs', 'images', 'preview.webp'), path.join(outDir, 'preview.webp'));
      for (const name of ['LICENSE', 'CREDITS.md']) {
        fs.copyFileSync(path.join(ROOT, name), path.join(outDir, name));
      }
      if(r.field) {
        const dest=path.join(outDir,'assets','_terrain_cache');
        fs.mkdirSync(dest,{recursive:true});
        fs.copyFileSync(path.join(ASSETS,'_terrain_cache',r.field+'.gz'),path.join(dest,r.field+'.gz'));
      }
      console.log(`copied ${n} asset files → ${outDir}/assets`);
    }
  }
}
