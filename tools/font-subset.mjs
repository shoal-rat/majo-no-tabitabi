#!/usr/bin/env node
// The four zh-CN faces ship as WOFF2 subsets: only the characters the game can show in them (every string in
// src/locales, the credit rows of assets/manifest.json) plus printable ASCII and the typographic marks below. (The HTML
// shell's boot screen and meta tags use system faces.) The boot then
// downloads about 2 MB of type instead of about 25 MB (docs/api/perf.md "Font subsets").
//
//   node tools/font-subset.mjs --check      exit 1 when a player-visible character is missing from a shipped face. Reads each
//                                           WOFF2's own character map (no Python needed), so it also catches a character the
//                                           source font never had. Run it after adding text (AGENTS.md V loc).
//   node tools/font-subset.mjs [face …]     rebuild the subsets: all faces, or the named ones (serif wenkai brush running).
//        [--src face=path.ttf]              a source other than the default below. The serif's variable source is not in the
//                                           repo: NotoSerifSC[wght].ttf from https://github.com/google/fonts/tree/main/ofl/notoserifsc
//                                           (`node tools/font-subset.mjs serif --src serif=/path/NotoSerifSC[wght].ttf`; an old-style
//                                           bare `<source.ttf>` argument still means the serif).
//                                           The other three sources are the full TTFs kept beside the subsets (assets/fonts/zh-CN,
//                                           not loaded by the game; tools/trailer/edit renders captions from them).
//   Rebuilding needs Python with fonttools + brotli: `pip install fonttools brotli` (FONTTOOLS_PY=/path/to/python).
//
// A character outside a subset is not lost: the browser draws that one glyph from the next face in the stack (Kaiti /
// Songti / serif), only in another hand. Licences: all four are SIL OFL 1.1; LXGW's Reserved Font Names may stay in a
// subset made for web delivery (its OFL text, ADDITIONAL PERMISSION), the other three reserve no name.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'assets/fonts/zh-CN');
// characters a face's SOURCE font does not have (written by a rebuild): the browser draws them from the next face in the
// stack, and --check does not count them as stale
const GAPS = path.join(ROOT, 'tools/font-subset.gaps.json');
const readGaps = () => { try { return JSON.parse(fs.readFileSync(GAPS, 'utf8')); } catch (e) { return {}; } };
const EXTRA = '“”‘’—–…·・《》〈〉「」『』【】〔〕、。，．！？：；（）～￥％＋－×÷＝•◆◇✦✧★☆○●◎↑↓←→⇄‹›«»°′″№';
/** face -> the subset it ships and its default source (null: pass --src) */
const FACES = {
  serif: { family: 'MV Serif', out: 'NotoSerifSC-UI.woff2', src: null },
  wenkai: { family: 'MV WenKai', out: 'LXGWWenKaiLite-UI.woff2', src: 'LXGWWenKaiLite-Regular.ttf' },
  brush: { family: 'MV Brush', out: 'MaShanZheng-UI.woff2', src: 'MaShanZheng-Regular.ttf' },
  running: { family: 'MV Running', out: 'ZhiMangXing-UI.woff2', src: 'ZhiMangXing-Regular.ttf' },
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(js|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Every character the game can put on screen in its own faces, sorted. */
function wanted() {
  const set = new Set();
  for (let c = 0x20; c < 0x7f; c++) set.add(String.fromCharCode(c));
  for (const c of EXTRA) set.add(c);
  let text = '';
  for (const f of walk(path.join(ROOT, 'src/locales'))) text += fs.readFileSync(f, 'utf8');
  try { for (const r of Object.values(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8')))) text += (r.author || '') + (r.license || ''); } catch (e) { /* credits optional */ }
  for (const c of text) if (c.codePointAt(0) >= 0x80 && !/\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}/u.test(c)) set.add(c);
  return [...set].sort();
}

// ---- reading a WOFF2's character map (the check needs no Python) ---------------------------------------------------
const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG',
  'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH',
  'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar',
  'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/** Set of code points a WOFF2 file maps (cmap 3.10 / 0.x format 12, else 3.1 format 4). */
export function woff2Chars(file) {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'wOF2') throw new Error(file + ': not a WOFF2 file');
  const numTables = b.readUInt16BE(12), compLen = b.readUInt32BE(20);
  let p = 48;
  const u128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const x = b[p++]; v = v * 128 + (x & 127); if (!(x & 128)) return v; } throw new Error('bad UIntBase128'); };
  const dir = [];
  for (let i = 0; i < numTables; i++) {
    const flags = b[p++];
    const tag = (flags & 63) === 63 ? b.toString('latin1', p, (p += 4)) : KNOWN[flags & 63];
    const version = flags >> 6;
    const orig = u128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    dir.push({ tag, len: transformed ? u128() : orig });
  }
  const data = zlib.brotliDecompressSync(b.subarray(p, p + compLen));
  let off = 0, cmap = null;
  for (const t of dir) { if (t.tag === 'cmap') cmap = data.subarray(off, off + t.len); off += t.len; }
  if (!cmap) throw new Error(file + ': no cmap table');
  const out = new Set();
  const n = cmap.readUInt16BE(2);
  const subs = [];
  for (let i = 0; i < n; i++) subs.push({ pl: cmap.readUInt16BE(4 + i * 8), en: cmap.readUInt16BE(6 + i * 8), at: cmap.readUInt32BE(8 + i * 8) });
  const pick = subs.find((s) => cmap.readUInt16BE(s.at) === 12) || subs.find((s) => s.pl === 3 && s.en === 1) || subs[0];
  const t = pick.at, fmt = cmap.readUInt16BE(t);
  if (fmt === 12) {
    const groups = cmap.readUInt32BE(t + 12);
    for (let g = 0; g < groups; g++) {
      const s = cmap.readUInt32BE(t + 16 + g * 12), e = cmap.readUInt32BE(t + 20 + g * 12), gid = cmap.readUInt32BE(t + 24 + g * 12);
      for (let c = s; c <= e; c++) if (gid + (c - s)) out.add(c);
    }
  } else if (fmt === 4) {
    const seg = cmap.readUInt16BE(t + 6) / 2, ends = t + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
    for (let i = 0; i < seg; i++) {
      const e = cmap.readUInt16BE(ends + i * 2), s = cmap.readUInt16BE(starts + i * 2), d = cmap.readInt16BE(deltas + i * 2), r = cmap.readUInt16BE(ranges + i * 2);
      for (let c = s; c <= e && c !== 0xffff; c++) {
        const gid = r === 0 ? (c + d) & 0xffff : cmap.readUInt16BE(ranges + i * 2 + r + (c - s) * 2);
        if (gid) out.add(c);
      }
    }
  } else throw new Error(file + ': cmap format ' + fmt + ' not read');
  return out;
}

// ---- --check ---------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args[0] === '--check') {
  const want = wanted().filter((c) => c.trim());
  const gaps = readGaps();
  let bad = 0;
  for (const [id, f] of Object.entries(FACES)) {
    const file = path.join(DIR, f.out);
    if (!fs.existsSync(file)) { console.log(`font-subset: ${id}: ${f.out} is missing`); bad++; continue; }
    const have = woff2Chars(file), gap = new Set(gaps[id] || '');
    const miss = want.filter((c) => !have.has(c.codePointAt(0)) && !gap.has(c));
    const fall = want.filter((c) => gap.has(c));
    if (fall.length) console.log(`font-subset: ${id}: ${fall.length} character(s) its source font lacks fall back to the next face: ${fall.join('')}`);
    if (miss.length) { bad++; console.log(`font-subset: ${id} (${f.family}, ${f.out}) lacks ${miss.length} character(s): ${miss.join('')}`); }
  }
  if (!bad) { console.log(`font-subset: all four faces cover the ${want.length} characters the game shows`); process.exit(0); }
  console.log('rebuild: node tools/font-subset.mjs [face …] (header of tools/font-subset.mjs); a character the source font lacks needs other text or another face');
  process.exit(1);
}

// ---- rebuild ---------------------------------------------------------------------------------------------------------
const srcOver = {};
const pick = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--src') { const [k, ...v] = String(args[++i] || '').split('='); srcOver[k] = v.join('='); }
  else if (/\.(ttf|otf)$/i.test(args[i])) srcOver.serif = args[i];
  else if (FACES[args[i]]) pick.push(args[i]);
  else { console.error('unknown argument ' + args[i] + ' (see the header of tools/font-subset.mjs)'); process.exit(2); }
}
if (!pick.length) pick.push(...(srcOver.serif ? ['serif'] : []), ...Object.keys(FACES).filter((k) => FACES[k].src && !pick.includes(k)));
const chars = wanted().join('');
const tmp = path.join(os.tmpdir(), `mv-font-subset-${process.pid}.txt`);
fs.writeFileSync(tmp, chars);
const py = process.env.FONTTOOLS_PY || 'python3';
const gaps = readGaps();
let failed = 0;
for (const id of pick) {
  const f = FACES[id];
  const src = srcOver[id] || (f.src && path.join(DIR, f.src));
  if (!src || !fs.existsSync(src)) { console.error(`${id}: no source font (pass --src ${id}=path.ttf; see the header)`); failed++; continue; }
  const out = path.join(DIR, f.out);
  const r = spawnSync(py, ['-m', 'fontTools.subset', path.resolve(src), `--text-file=${tmp}`, '--flavor=woff2',
    '--layout-features=kern,liga,locl,palt,halt,vpal,vhal', `--output-file=${out}`], { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`${id}: fontTools failed (pip install fonttools brotli; FONTTOOLS_PY picks the python)`); failed++; continue; }
  const have = woff2Chars(out);
  const lack = [...chars].filter((c) => c.trim() && !have.has(c.codePointAt(0)));
  gaps[id] = lack.join('');
  console.log(`wrote ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${have.size} characters` +
    (lack.length ? `; the source lacks ${lack.length}: ${lack.join('')}` : '') + ')');
}
fs.rmSync(tmp, { force: true });
fs.writeFileSync(GAPS, JSON.stringify(Object.fromEntries(Object.keys(FACES).filter((k) => gaps[k] !== undefined).map((k) => [k, gaps[k]])), null, 1) + '\n');
process.exit(failed ? 1 : 0);
