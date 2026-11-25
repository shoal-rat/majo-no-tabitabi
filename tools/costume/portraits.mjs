#!/usr/bin/env node
// Dialogue portraits (src/ui/dialogue.js, the arched cameo beside the text): a head-and-shoulders picture of each speaker,
// rendered ONCE by the game itself (headless, tools/play.mjs + portraits.shot.js: the same lens, distance and framing round
// every head bone, the world hidden, drawn over a dark and a light flat ground), cut out by difference matting (as
// tools/costume/wardrobe-pics.mjs does), cropped to one 4:5 frame and written as small WebP files with alpha.
// Elaina gets one per outfit she talks in (elaina_<outfit>); the page picks the one she wears.
//   node tools/costume/portraits.mjs [--only fran,saya] [--no-shoot] (re-cut the last shots) [--no-install]
// Re-run it after a character's look changed (tools/journey/build-cast.mjs). No official art: in-game renders only.
// Out: assets/textures/ui/ui_portrait_<id>.webp (manifest ui_portrait_<id>, type texture), work files in .tmp/portraits/.
// Since 2026-11-25 the shipped portraits are PAINTED (docs/api/ui.md "Dialogue portraits"). Use this tool for the model
// reference renders (.tmp/play/portraits/<id>_light.png). It overwrites the painted files and manifest rows, so restore them
// afterwards (git checkout -- assets/textures/ui/ assets/manifest.json), unless the render is meant to ship.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const optv = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const IDS = (optv('only') || 'elaina_apprentice,elaina_elaina,fran,saya,mother,father,exam,innkeeper').split(',');
const tmpRoot = process.env.MV_TMP ? path.resolve(process.env.MV_TMP) : path.join(ROOT, '.tmp');
const WORK = path.join(tmpRoot, 'portraits'); fs.mkdirSync(WORK, { recursive: true });
const SHOTS = path.join(tmpRoot, 'play/portraits');
const OUTDIR = path.join(ROOT, 'assets/textures/ui');
const SIZE = 1200;                         // square shots (px)
const PX_PER_M = SIZE / (2 * 2.6 * Math.tan((28 / 2) * Math.PI / 180));   // lens 28 deg at 2.6 m (portraits.shot.js)
const ABOVE = 0.36, BELOW = 0.26;          // the frame: from 0.36 m over the head bone to 0.26 m under it (shoulders; tall hats are cut)
const OW = 320, OH = 400;                  // picture size (px), 4:5 like the cameo

if (!args.includes('--no-shoot')) {
  execFileSync('node', [path.join(ROOT, 'tools/play.mjs'), '--name', 'portraits', '--script', path.join(ROOT, 'tools/costume/portraits.shot.js'),
    '--size', `${SIZE}x${SIZE}`, '--quality', 'high', '--timeout', '300', '--params', `dynres=0&ids=${IDS.join(',')}`], { cwd: ROOT, stdio: 'inherit' });
}

async function load(f) { const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, w: info.width, h: info.height }; }
const corner = (im) => { const s = [0, 0, 0]; let n = 0; for (const [x0, y0] of [[4, 4], [im.w - 24, 4], [4, im.h - 24], [im.w - 24, im.h - 24]]) for (let y = y0; y < y0 + 20; y++) for (let x = x0; x < x0 + 20; x++) { const i = (y * im.w + x) * 3; for (let c = 0; c < 3; c++) s[c] += im.d[i + c]; n++; } return s.map((v) => v / n); };

const frag = {};
for (const id of IDS) {
  const fd = path.join(SHOTS, `${id}_dark.png`), fl = path.join(SHOTS, `${id}_light.png`);
  if (!fs.existsSync(fd) || !fs.existsSync(fl)) { console.warn(`${id}: no shots, skipped`); continue; }
  const dk = await load(fd), lt = await load(fl);
  const Bd = corner(dk), Bl = corner(lt), dB = Bl.map((v, c) => v - Bd[c]);
  const { w, h } = dk, rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, p = 0; p < w * h; p++, i += 3) {
    let t = 0; for (let c = 0; c < 3; c++) t += (lt.d[i + c] - dk.d[i + c]) / dB[c];
    let a = 1 - t / 3; a = a < 0.03 ? 0 : a > 0.985 ? 1 : a;
    for (let c = 0; c < 3; c++) rgba[p * 4 + c] = a > 0 ? Math.max(0, Math.min(255, Math.round((dk.d[i + c] - (1 - a) * Bd[c]) / a))) : 0;
    rgba[p * 4 + 3] = Math.round(a * 255);
  }
  // the head bone sits at the centre of every shot (portraits.shot.js aims there), so one box frames them all alike
  const cy = h / 2, top = Math.max(0, Math.round(cy - ABOVE * PX_PER_M)), bh = Math.min(h - top, Math.round((ABOVE + BELOW) * PX_PER_M));
  const bw = Math.round(bh * OW / OH), left = Math.max(0, Math.round(w / 2 - bw / 2));
  const file = path.join(OUTDIR, `ui_portrait_${id}.webp`); fs.mkdirSync(OUTDIR, { recursive: true });
  const buf = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).extract({ left, top, width: Math.min(bw, w - left), height: bh })
    .resize({ width: OW, height: OH, fit: 'cover' }).webp({ quality: 86, alphaQuality: 90, effort: 6 }).toBuffer();
  fs.writeFileSync(file, buf);
  await sharp(buf).flatten({ background: '#1c2744' }).jpeg({ quality: 88 }).toFile(path.join(WORK, `check_${id}.jpg`));
  console.log(`ui_portrait_${id}: ${path.relative(ROOT, file)} ${OW}x${OH}, ${(buf.length / 1024).toFixed(1)} KB`);
  frag[`ui_portrait_${id}`] = { file: `textures/ui/ui_portrait_${id}.webp`, type: 'texture', preload: false,
    license: 'In-game render of a project character; see the matching character asset for visual reference and credits.', size_px: [OW, OH],
    author: 'rendered for this project from the game itself (tools/costume/portraits.mjs)',
    source: `tools/costume/portraits.mjs: "${id}" head and shoulders, three-quarter, lens 28 deg, cut out by difference matting`,
    notes: 'dialogue portrait (src/ui/dialogue.js, the arched cameo); transparent around the figure, no text; the page draws the frame. Re-make after the character changes.' };
}
if (!args.includes('--no-install') && Object.keys(frag).length) {
  const f = path.join(WORK, 'manifest.fragment.json'); fs.writeFileSync(f, JSON.stringify(frag, null, 1));
  console.log(execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), f, '--replace'], { encoding: 'utf8' }).trim());
}
