#!/usr/bin/env node
// The painted pictures of the 衣装 page (src/ui/wardrobe.js): Elaina in each outfit, rendered ONCE by the game itself (headless,
// tools/play.mjs + wardrobe-pics.shot.js: standing, front three-quarter, the world hidden, drawn over a dark and a light flat
// ground), cut out by difference matting (the two frames differ only where the ground shows through: alpha and colour
// solve exactly, ink lines and soft edges included), cropped to one frame for all four, written as small WebP files with
// alpha and entered in the manifest (tools/manifest-patch.mjs, these ids only). No text is baked in; the frame round the
// picture is drawn by the page (brush-torn masks of the scroll).
//   node tools/costume/wardrobe-pics.mjs [--only elaina,swim_a] [--no-shoot] (re-cut the last shots) [--no-install]
// Re-run it after an outfit's look changed (tools/journey/build-cast.mjs, tools/journey/swimwear.mjs). --only keeps the shared
// frame only when the tallest outfit (the witch's hat: elaina) is among the ids.
// Out: assets/textures/ui/ui_outfit_<id>.webp (manifest ui_outfit_<id>, type texture), work files in .tmp/wardrobe-pics/.
// Since 2026-11-25 the shipped cards are PAINTED (docs/api/heroine.md "Wardrobe (journey)", "Pictures"). Use this tool for the
// model reference renders. It overwrites the painted files and manifest rows, so restore them afterwards
// (git checkout -- assets/textures/ui/ assets/manifest.json), unless the render is meant to ship.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const optv = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const IDS = (optv('only') || 'apprentice,elaina,swim_a,swim_b').split(',');
const tmpRoot = process.env.MV_TMP ? path.resolve(process.env.MV_TMP) : path.join(ROOT, '.tmp');
const WORK = path.join(tmpRoot, 'wardrobe-pics'); fs.mkdirSync(WORK, { recursive: true });
const SHOTS = path.join(tmpRoot, 'play/wardrobe_pics');
const OUTDIR = path.join(ROOT, 'assets/textures/ui');
const H = 640, ASPECT = 0.6;              // picture size (px): the card plate shows it with object-fit: contain

if (!args.includes('--no-shoot')) {
  execFileSync('node', [path.join(ROOT, 'tools/play.mjs'), '--name', 'wardrobe_pics', '--script', path.join(ROOT, 'tools/costume/wardrobe-pics.shot.js'),
    '--size', '1920x1080', '--quality', 'high', '--timeout', '240', '--params', `dynres=0&outfit=${IDS[0]}&ids=${IDS.join(',')}`], { cwd: ROOT, stdio: 'inherit' });
}

async function load(f) { const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: data, w: info.width, h: info.height }; }
const corner = (im) => { const s = [0, 0, 0]; let n = 0; for (const [x0, y0] of [[4, 4], [im.w - 24, 4], [4, im.h - 24], [im.w - 24, im.h - 24]]) for (let y = y0; y < y0 + 20; y++) for (let x = x0; x < x0 + 20; x++) { const i = (y * im.w + x) * 3; for (let c = 0; c < 3; c++) s[c] += im.d[i + c]; n++; } return s.map((v) => v / n); };

const frag = {};
const cuts = [];
for (const id of IDS) {
  const dk = await load(path.join(SHOTS, `${id}_dark.png`)), lt = await load(path.join(SHOTS, `${id}_light.png`));
  const Bd = corner(dk), Bl = corner(lt), dB = Bl.map((v, c) => v - Bd[c]);
  const { w, h } = dk, rgba = Buffer.alloc(w * h * 4);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0, p = 0; p < w * h; p++, i += 3) {
    let t = 0; for (let c = 0; c < 3; c++) t += (lt.d[i + c] - dk.d[i + c]) / dB[c];
    let a = 1 - t / 3; a = a < 0.03 ? 0 : a > 0.985 ? 1 : a;
    for (let c = 0; c < 3; c++) rgba[p * 4 + c] = a > 0 ? Math.max(0, Math.min(255, Math.round((dk.d[i + c] - (1 - a) * Bd[c]) / a))) : 0;
    rgba[p * 4 + 3] = Math.round(a * 255);
    if (a > 0.25) { const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  cuts.push({ id, rgba, w, h, box: [x0, y0, x1, y1] });
}
// one frame for all four (same scale, feet on the same line): the tallest figure fills the height
const fh = Math.max(...cuts.map((c) => c.box[3] - c.box[1])) * 1.035, fw = Math.round(fh * ASPECT);
for (const c of cuts) {
  const cx = Math.round((c.box[0] + c.box[2]) / 2), bottom = c.box[3] + Math.round(fh * 0.01);
  const left = Math.max(0, cx - (fw >> 1)), top = Math.max(0, Math.round(bottom - fh));
  const cw = Math.min(fw, c.w - left), ch = Math.min(Math.round(fh), c.h - top);
  const file = path.join(OUTDIR, `ui_outfit_${c.id}.webp`); fs.mkdirSync(OUTDIR, { recursive: true });
  const buf = await sharp(c.rgba, { raw: { width: c.w, height: c.h, channels: 4 } }).extract({ left, top, width: cw, height: ch })
    .resize({ height: H, width: Math.round(H * ASPECT), fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toBuffer();
  fs.writeFileSync(file, buf);
  await sharp(buf).flatten({ background: '#e8dcc0' }).jpeg({ quality: 85 }).toFile(path.join(WORK, `check_${c.id}.jpg`));
  console.log(`ui_outfit_${c.id}: ${path.relative(ROOT, file)} ${Math.round(H * ASPECT)}x${H}, ${(buf.length / 1024).toFixed(1)} KB (figure box ${c.box.join(',')})`);
  frag[`ui_outfit_${c.id}`] = { file: `textures/ui/ui_outfit_${c.id}.webp`, type: 'texture', preload: false, license: 'In-game render of the project heroine; see matching character asset for visual reference and credits.', size_px: [Math.round(H * ASPECT), H],
    author: 'rendered for this project from the game itself (tools/costume/wardrobe-pics.mjs)',
    source: `tools/costume/wardrobe-pics.mjs: Elaina in the "${c.id}" outfit (src/data/outfits.js), front three-quarter, cut out by difference matting`,
    notes: 'picture on the 衣装 page of the pause scroll (src/ui/wardrobe.js); transparent around her, no text; the page draws the frame. Re-make after a wardrobe rebuild.' };
}
if (!args.includes('--no-install')) {
  const f = path.join(WORK, 'manifest.fragment.json'); fs.writeFileSync(f, JSON.stringify(frag, null, 1));
  console.log(execFileSync('node', [path.join(ROOT, 'tools/manifest-patch.mjs'), f, '--replace'], { encoding: 'utf8' }).trim());
}
