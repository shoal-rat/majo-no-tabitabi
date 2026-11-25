// Every picture in the UI is drawn here in code: SVG pictograms, the parchment grain, the starfield, the filigree frame,
// the star, the heading ornament and the astrolabe ring. No external images.
import { mulberry32, TAU } from '../core/util.js';

export const ELEMENTS = ['fire', 'water', 'ice', 'wind', 'thunder', 'earth', 'sun', 'moon'];
/** Display colours of the eight elements (also used for status icons and marker tints). */
export const EL_COLOR = {
  fire: '#ff7b47', water: '#5cb9ff', ice: '#b9eeff', wind: '#8ee6ab', thunder: '#cba6ff', earth: '#e0aa62', sun: '#ffd77c', moon: '#bcc9ff',
};
export const STATUS = ['burning', 'wet', 'frozen', 'shocked'];
export const STATUS_ICON = { burning: 'fire', wet: 'water', frozen: 'ice', shocked: 'thunder' };

const F = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const S = (d, w = 1.8, extra = '') => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const C = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${extra}/>`;
const HI = 'fill="#fff" fill-opacity=".5"';
const SH = 'fill="#000" fill-opacity=".28"';

/** name -> inner SVG markup on a 24×24 grid, drawn with currentColor. */
const ICONS = {
  // ---- eight elements ----
  fire: F('M12.3 2.2c.6 3.7 5.1 5.5 5.1 10.7a5.4 5.4 0 0 1-10.8 0c0-2.2 1-3.8 2.2-5.1.1 1.7.8 2.8 1.8 3.2-.4-3.2.3-6.5 1.7-8.8z')
    + F('M12 13.4c.5 1.5 2 2.1 2 3.7a2 2 0 0 1-4 0c0-1.5 1.3-2.2 2-3.7z', HI),
  water: F('M12 2.6c3.2 4.2 6.2 7.3 6.2 11a6.2 6.2 0 0 1-12.4 0c0-3.7 3-6.8 6.2-11z')
    + S('M9 14.2a3.1 3.1 0 0 0 2.7 3', 1.5, 'stroke="#fff" stroke-opacity=".6"'),
  ice: S('M12 2.8v18.4M4 7.4l16 9.2M4 16.6l16-9.2', 1.7)
    + S('M9.8 4.8 12 7l2.2-2.2M9.8 19.2 12 17l2.2 2.2M4.6 11.2l3-.8-.8-3M19.4 12.8l-3 .8.8 3M5.4 15.8l3 .8.8-3M18.6 8.2l-3-.8-.8 3', 1.4),
  wind: S('M3 8.6h9.2a2.7 2.7 0 1 0-2.6-3.4M3 12.6h14.6a3 3 0 1 1-2.9 3.8M3 16.6h7.2', 1.9),
  thunder: F('M13.8 2 5.6 13.4h5.2L9.2 22l9.2-12.2h-5.4z'),
  earth: F('M3.2 18.5 7 9l5-4.5 5.5 2.5 3.3 11.5z') + F('M12 4.5 17.5 7 10.5 12z', HI) + F('M7 9l3.5 3 3.5 6.5H3.2z', SH),
  sun: C(12, 12, 4.4) + S('M12 2.4V5M12 19v2.6M2.4 12H5M19 12h2.6M5.2 5.2 7 7M17 17l1.8 1.8M5.2 18.8 7 17M17 7l1.8-1.8', 1.8),
  moon: F('M15.8 3A9.3 9.3 0 1 0 21 14.6 7.4 7.4 0 0 1 15.8 3z'),
  // ---- abilities ----
  charm: F('M8 2.5h8v19l-4-2.6-4 2.6z') + S('M10.3 7h3.4M10.3 10.4h3.4M12 7v7', 1.3, 'stroke="#000" stroke-opacity=".45"'),
  broom: S('M3.6 20.4 13 11', 2) + F('M11.6 9.6 14.4 12.4l6.8-3-.6-3.8-2.2-2.2-3.8-.6z') + S('M14.2 6.4 17.6 9.8M16 4.6l3.4 3.4', 1, 'stroke="#000" stroke-opacity=".35"'),
  wings: F('M2.5 15.5c4.5-.5 7-3.5 9.5-9.5 1.2 2.8 1.2 5-.2 7.2 2.2-.7 4.2-2.4 5.7-4.7.3 3-.5 5.4-2.7 7.2 1.7-.1 3.2-.7 4.7-1.7-1.2 3.7-4.5 6-8.5 6-3.5 0-6.3-1.5-8.5-4.5z'),
  guard: F('M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z') + F('M12 5.2v13.6c3.3-1.3 5.5-4 5.5-7.6V7.2z', HI),
  dodge: S('M4 7h8M3 12h11M5 17h7', 1.8) + F('M13 5l8 7-8 7 2.5-7z'),
  shikigami: F('M2.5 9 11 11l2-6.5 2.5 6.5 6-1.5-5 5.5 1.5 5.5-5-3.5-6 2 3-5.5z'),
  kinkan: '<circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" stroke-width="2.4"/>' + C(12, 12, 5.6, 'fill="#000" fill-opacity=".55"') + C(17.6, 6.8, 1.7, 'fill="#fff"'),
  // ---- counters / items ----
  dango: S('M4.6 20.4 19.6 3.6', 1.3, 'stroke="#c9a36a"') + C(8.2, 16.2, 3.5, 'fill="#a8cf8e"') + C(12.2, 11.7, 3.5, 'fill="#fff5e6"') + C(16.2, 7.2, 3.5, 'fill="#f5a9bc"'),
  stardust: F('M12 2.5Q12.8 11.2 21.5 12 12.8 12.8 12 21.5 11.2 12.8 2.5 12 11.2 11.2 12 2.5z') + C(18.8, 5.2, 1.2) + C(5.4, 18.4, 0.9),
  moontear: F('M12 2.6c3.2 4.2 6.2 7.3 6.2 11a6.2 6.2 0 0 1-12.4 0c0-3.7 3-6.8 6.2-11z') + F('M13.6 9.6a4.2 4.2 0 1 0 2.6 6.6 3.4 3.4 0 0 1-2.6-6.6z', 'fill="#fff" fill-opacity=".75"'),
  heart: F('M12 20.6C5.6 15.6 3 12.6 3 9.3A4.6 4.6 0 0 1 12 7.4a4.6 4.6 0 0 1 9 1.9c0 3.3-2.6 6.3-9 11.3z'),
  spirit: F('M12 21.5a6 6 0 0 1-6-6c0-4 4.2-5.6 4.8-12 3.7 3.7 7.2 6.8 7.2 12a6 6 0 0 1-6 6z') + C(12, 15.6, 2.3, HI),
  // ---- markers ----
  quest: F('M12 2.2 19.2 12 12 21.8 4.8 12z') + F('M12 7.6 15.2 12 12 16.4 8.8 12z', HI),
  npc: C(12, 7.4, 3.7) + F('M5.2 20.6c.5-4.6 3.2-7.2 6.8-7.2s6.3 2.6 6.8 7.2z'),
  lantern: F('M4.6 9.4 12 4l7.4 5.4z') + F('M8 10.6h8v6H8z') + F('M10.2 12.2h3.6v3h-3.6z', 'fill="#fff" fill-opacity=".7"') + F('M9.4 17.6h5.2l1.6 3.2H7.8z'),
  greatlantern: F('M3.6 8.4 12 2.6l8.4 5.8z') + F('M6.6 9.6h10.8v8H6.6z') + C(12, 13.6, 2.6, 'fill="#fff" fill-opacity=".8"') + F('M5 18.6h14v2.8H5z'),
  chest: F('M4 11c0-3.4 2.6-5.4 8-5.4s8 2 8 5.4v8H4z') + F('M4 11h16v1.8H4z', SH) + C(12, 12.4, 1.6, 'fill="#fff" fill-opacity=".8"'),
  shop: F('M9 3.4h6l-1.4 3.4c3.4 1.4 5.4 4.8 5.4 8.2 0 3.4-2.6 5.4-7 5.4s-7-2-7-5.4c0-3.4 2-6.8 5.4-8.2z') + S('M9.6 6.9h4.8', 1.2, 'stroke="#000" stroke-opacity=".4"'),
  flag: S('M6 21.4V3', 1.8) + F('M6.8 4h12.2l-3.2 4 3.2 4H6.8z'),
  ema: F('M12 3 20.4 8.6V20H3.6V8.6z') + C(12, 8.4, 1.3, 'fill="#000" fill-opacity=".45"') + S('M8 13h8M8 16.2h5.6', 1.2, 'stroke="#000" stroke-opacity=".4"'),
  fox: F('M4 3.6 9 7.2h6l5-3.6-1 8.8c0 4.2-3 7.6-7 7.6s-7-3.4-7-7.6z') + C(9.2, 11.6, 1.1, 'fill="#000" fill-opacity=".6"') + C(14.8, 11.6, 1.1, 'fill="#000" fill-opacity=".6"'),
  torii: F('M2.6 5.2c3.2 1.1 15.6 1.1 18.8 0V8H2.6z') + F('M5 10h14v1.9H5z') + F('M7 8h2.2v13.4H7z') + F('M14.8 8H17v13.4h-2.2z'),
  eye: F('M2.4 12c3-5 6.1-7.2 9.6-7.2s6.6 2.2 9.6 7.2c-3 5-6.1 7.2-9.6 7.2s-6.6-2.2-9.6-7.2z') + C(12, 12, 3.2, 'fill="#000" fill-opacity=".7"'),
  star: F('M12 2.6l2.7 6.1 6.7.6-5 4.5 1.5 6.6L12 17l-5.9 3.4 1.5-6.6-5-4.5 6.7-.6z'),
  pin: F('M12 2.4a6.8 6.8 0 0 1 6.8 6.8c0 4.6-4.6 8.6-6.8 12.4-2.2-3.8-6.8-7.8-6.8-12.4A6.8 6.8 0 0 1 12 2.4z') + C(12, 9.2, 2.5, HI),
  dot: C(12, 12, 5),
  // ---- chrome ----
  lock: F('M6 10.6h12V21H6z') + S('M8.6 10.4V7.8a3.4 3.4 0 0 1 6.8 0v2.6', 1.9) + C(12, 15.6, 1.5, 'fill="#000" fill-opacity=".5"'),
  check: S('M4.4 12.8l5 5L20 5.8', 2.6),
  arrow: F('M12 2.6 19 20l-7-4.2L5 20z'),
  caret: F('M7 4l10 8-10 8z'),
  map: F('M3 5.6 9 3.4l6 2.2 6-2.2v15l-6 2.2-6-2.2-6 2.2z') + S('M9 3.6v14.6M15 5.6v14.8', 1.1, 'stroke="#000" stroke-opacity=".4"'),
  journal: F('M5 3h12.6a1.4 1.4 0 0 1 1.4 1.4V21H6.6A1.6 1.6 0 0 1 5 19.4z') + S('M8.4 3.2v17.6M11.4 8h4.8M11.4 11.4h4.8', 1.2, 'stroke="#000" stroke-opacity=".4"'),
  spells: F('M7.6 2.4h8.8v19.2L12 18.8l-4.4 2.8z')
    + '<circle cx="12" cy="9.4" r="2.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.2"/>' + S('M12 12.6v3.4', 1.2, 'stroke="#000" stroke-opacity=".5"'),
  items: F('M8.4 3h7.2l-1.2 3.6c3.8 1.5 5.6 4.9 5.6 8.2 0 3.8-2.8 6.2-8 6.2s-8-2.4-8-6.2c0-3.3 1.8-6.7 5.6-8.2z') + S('M8.8 6.8h6.4', 1.3, 'stroke="#000" stroke-opacity=".45"'),
  settings: S('M4 6.5h16M4 12h16M4 17.5h16', 1.6) + C(9, 6.5, 2.3) + C(15.5, 12, 2.3) + C(7.5, 17.5, 2.3),
  resume: F('M7 4.4 19 12 7 19.6z'),
  quit: S('M14 4.5H6v15h8M10.5 12H20M16.5 8.5 20 12l-3.5 3.5', 1.9),
  brush: S('M4 20c2.4-.3 3.8-1.3 4.6-3.3', 1.8) + F('M8.4 16.8 18.8 4.2a1.9 1.9 0 0 1 2.9 2.5L11.2 19.2c-1.3.3-2.5-.8-2.8-2.4z'),
  // ---- wardrobe (src/data/outfits.js): a robe on its stand, and her four outfits as garments (in their own colours) ----
  wardrobe: S('M2.5 5.2h19M12 2.6v2.6', 1.6) + F('M5 6.6 9.4 5.6h5.2L19 6.6l1.4 5.6-3.2.8V21H6.8v-8L3.6 12.2z')
    + S('M9.4 5.8 12 10l2.6-4.2', 1.2, 'stroke="#000" stroke-opacity=".45"'),
  // 日常服: white blouse with the yellow bow over the dark pleated skirt
  outfit_apprentice: F('M7 4.6 9.6 3.6h4.8l2.6 1 2.6 3.6-2.2 1.4-1.4-1.6V12.4H8.4V8L7 9.6 4.8 8.2z', 'fill="#f4efe6" stroke="#231f1d" stroke-opacity=".7" stroke-width=".8"')
    + F('M8.2 12.2h7.6l2.8 8c-2 .8-4.2 1.2-6.6 1.2s-4.6-.4-6.6-1.2z', 'fill="#3e3446" stroke="#231f1d" stroke-opacity=".6" stroke-width=".7"')
    + S('M10.2 12.8 9.4 20.8M12 12.8v8.8M13.8 12.8l.8 8', .7, 'stroke="#000" stroke-opacity=".3"')
    + F('M9.9 4.6 12 5.8l2.1-1.2-.3 2.4L12 6.3l-1.8.7z', 'fill="#e0b85a"') + S('M11.2 6.4 10.6 8.6M12.8 6.4l.6 2.2', .8, 'stroke="#c9963c"'),
  // 魔女服: her pointed hat with the lavender band
  outfit_witch: F('M5.8 15.7c2.1-3 3-9.2 7.2-12 2.6-1.7 5.3-.1 5.7 2.5-2.3-1.2-3.8-1.4-4.8.4l2.4 9z', 'fill="#5e506e" stroke="#342c42" stroke-width=".9"')
    + F('m7.5 12.8 7.7-1.7.6 2.1-9.1 2.2z', 'fill="#d9b9d4"') + F('M2 17c2.8-2 6.9-1.9 10.5-2.8 4-.9 6.1-1.3 9.6-1.2-2 2.4-4.6 3.9-9.2 5.1C7.7 19.5 3.5 19.4 2 17z', 'fill="#967a9e" stroke="#403548" stroke-width=".8"'),
  // 潮祭: white ruffled top and frill skirt with small black bows, a sheer shirt over the shoulders
  outfit_swim_a: S('M6.4 4.6 3.8 14.2M17.6 4.6l2.6 9.6', 2.2, 'stroke="#9fbcd2" stroke-opacity=".75"')
    + F('M8.2 6.6c1.2.9 2.5 1.3 3.8 1.3s2.6-.4 3.8-1.3l.8 3.4H7.4z', 'fill="#fbf6ea" stroke="#231f1d" stroke-opacity=".7" stroke-width=".8"')
    + S('M8.8 6.8 9.6 3.4M15.2 6.8l-.8-3.4', .9, 'stroke="#231f1d" stroke-opacity=".7"')
    + F('M7 12.4h10l1.8 6.2c-.9.6-1.8.5-2.6 0-.8.6-1.7.6-2.5 0-.8.6-1.7.6-2.5 0-.8.6-1.7.6-2.5 0-.8.5-1.7.6-2.5 0z', 'fill="#fbf6ea" stroke="#231f1d" stroke-opacity=".7" stroke-width=".8"')
    + C(12, 9.2, .75, 'fill="#231f1d"') + C(12, 13.4, .75, 'fill="#231f1d"'),
  // 暮海: deep indigo two-piece with lavender ruffles, the gold stars, a scrunchie
  outfit_swim_b: S('M9.4 6.2 10.6 2.8M14.6 6.2l-1.2-3.4', 1.1, 'stroke="#2e2a44"') + F('M7.8 5.8c1.6 1.1 2.8 1.5 4.2 1.5s2.6-.4 4.2-1.5l.8 4.2H7z', 'fill="#2e2a44"')
    + F('M6.6 9.6h10.8l-.8 1.8-1.4-.8-1.6.9-1.6-.9-1.6.9-1.6-.9-1.4.8z', 'fill="#c2a8dc"')
    + F('M7.4 13h9.2l-.6 5.6h-3.2L12 16.8l-.8 1.8H8z', 'fill="#2e2a44"')
    + F('M6.4 12.6h11.2l-.8 2-1.4-.9-1.7 1-1.7-1-1.7 1-1.7-1-1.4.9z', 'fill="#c2a8dc"')
    + C(9.2, 7.8, .55, 'fill="#e0b85a"') + C(14.8, 7.8, .55, 'fill="#e0b85a"') + C(19.4, 18.6, 1.5, 'fill="none" stroke="#d99bbd" stroke-width="1.1"'),
};
const ALIAS = {
  burning: 'fire', wet: 'water', frozen: 'ice', shocked: 'thunder', mana: 'spirit', life: 'heart', hp: 'heart',
  main: 'quest', side: 'quest', target: 'quest', boss: 'eye', enemy: 'eye', duel: 'eye', save: 'brush', checkpoint: 'brush',
  race: 'flag', lore: 'ema', kitsune: 'fox', teacher: 'npc', talk: 'npc', great: 'greatlantern', tear: 'moontear', coin: 'stardust',
  shrine: 'torii', place: 'pin', poi: 'pin', item: 'items', pickup: 'stardust', pouch: 'items', kite: 'flag', shide: 'charm',
};

export const hasIcon = (name) => !!(ICONS[name] || ICONS[ALIAS[name]]);
/** Inline SVG markup of an icon; unknown names give the plain diamond. */
export function iconSvg(name) {
  const body = ICONS[name] || ICONS[ALIAS[name]] || ICONS.quest;
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
}
/** An icon as canvas paths on its 24×24 grid, for systems that draw it into a canvas (src/fx/text.js): [{ d, w }] with w = 0
 *  for a filled path and w > 0 for a stroke of that width; circles come as { c: [cx, cy, r] }. The pale highlight and dark
 *  shading layers are left out (a canvas tints the shape as one piece). Unknown names give null. */
export function iconPaths(name) {
  const body = ICONS[name] || ICONS[ALIAS[name]];
  if (!body) return null;
  const out = [];
  for (const m of body.matchAll(/<(path|circle)\s([^>]*?)\/>/g)) {
    const a = m[2];
    if (/fill-opacity|stroke-opacity|stroke="#|fill="#/.test(a)) continue;
    if (m[1] === 'circle') {
      const n = (k) => Number((new RegExp(`\\b${k}="([^"]+)"`).exec(a) || [])[1]);
      if (/fill="none"/.test(a)) continue;
      out.push({ c: [n('cx'), n('cy'), n('r')] });
    } else {
      const d = (/\bd="([^"]+)"/.exec(a) || [])[1];
      if (!d) continue;
      const w = /fill="none"/.test(a) ? Number((/stroke-width="([^"]+)"/.exec(a) || [])[1]) || 1.8 : 0;
      out.push({ d, w });
    }
  }
  return out;
}
/** <i class="ic"> holding an icon. A name that is not an icon but is short (a glyph) is shown as text. */
export function icon(name, cls, parent) {
  const e = document.createElement('i');
  e.className = 'ic' + (cls ? ' ' + cls : '');
  setIcon(e, name);
  if (parent) parent.appendChild(e);
  return e;
}
export function setIcon(e, name) {
  if (e._ic === name) return e;
  e._ic = name;
  if (typeof name === 'string' && !hasIcon(name) && name.length > 0 && name.length <= 2) { e.textContent = name; e.classList.add('glyph'); }
  else { e.classList.remove('glyph'); e.innerHTML = iconSvg(name); }
  return e;
}

// ---- generated textures / masks (returned as CSS url() values) -----------------------------------------------
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// ---- grimoire ornaments (docs/api/ui.md "Grimoire round"): frames, rules, the astrolabe ring, parchment and stars ----

/** Frame for border-image (slice 36 of a 120 box): a hairline outer rule, an inner rule with notched corners, a four-point
 *  star in each corner and a dot where the inner rule ends. Colour is baked in (border-image cannot take currentColor). */
export function filigree(stroke = '#94712f', alpha = 0.8) {
  const corner = `<path d="M8 34V22a14 14 0 0 0 14-14h12" fill="none" stroke-width=".9"/>`
    + `<path d="M9.5 3.6l1.3 4.6 4.6 1.3-4.6 1.3-1.3 4.6-1.3-4.6-4.6-1.3 4.6-1.3z" stroke="none" fill="${stroke}"/>`
    + `<circle cx="8" cy="37.5" r="1.2" stroke="none" fill="${stroke}"/><circle cx="37.5" cy="8" r="1.2" stroke="none" fill="${stroke}"/>`;
  const g = (tr) => `<g transform="${tr}">${corner}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><g fill="none" stroke="${stroke}" stroke-opacity="${alpha}" fill-opacity="${alpha}">`
    + `<rect x="3.5" y="3.5" width="113" height="113" stroke-width="1"/>`
    + `<path d="M41 8H79M41 112H79M8 41V79M112 41V79" stroke-width=".9"/>`
    + g('') + g('translate(120 0) scale(-1 1)') + g('translate(0 120) scale(1 -1)') + g('translate(120 120) scale(-1 -1)')
    + `</g></svg>`;
  return svgUrl(svg);
}

/** Four-point star (mask). */
export function star4() {
  return svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5C11.3 16.9 7.1 12.7 1.5 12 7.1 11.3 11.3 7.1 12 1.5z" fill="#000"/></svg>');
}

/** A horizontal heading ornament (mask, 240 × 20): tapering rules, two small curls, a star in the middle. */
export function flourish() {
  const half = '<path d="M6 10C38 9.7 68 9.1 92 9.1v1.8C68 10.9 38 10.3 6 10z"/>'
    + '<path d="M96 10c3-4.6 8-5.2 10.6-2.4 1.8 2-.2 4.6-2.4 3.4-1.4-.8-.6-2.6.8-2.2-1.6-1.4-5.6-.4-8.4 1.6z"/>'
    + '<circle cx="111.4" cy="10" r="1.1"/>';
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 20"><g fill="#000">${half}<g transform="translate(240 0) scale(-1 1)">${half}</g>`
    + '<path d="M120 2.2c.5 4 3.3 7.3 7.6 7.8-4.3.5-7.1 3.8-7.6 7.8-.5-4-3.3-7.3-7.6-7.8 4.3-.5 7.1-3.8 7.6-7.8z"/></g></svg>');
}

/** The astrolabe ring (mask, 100 × 100): a fine double ring, 24 ticks (every sixth long) and four star points. */
export function astrolabe() {
  let ticks = '';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU, long = i % 6 === 0;
    const r0 = long ? 39.5 : 42.4, r1 = 46;
    ticks += `<path d="M${(50 + Math.sin(a) * r0).toFixed(2)} ${(50 - Math.cos(a) * r0).toFixed(2)}L${(50 + Math.sin(a) * r1).toFixed(2)} ${(50 - Math.cos(a) * r1).toFixed(2)}" stroke-width="${long ? 2.4 : 1.3}"/>`;
  }
  let pts = '';
  for (let i = 0; i < 4; i++) pts += `<path transform="rotate(${i * 90} 50 50)" d="M50 .8l1.6 4.4L50 8.6l-1.6-3.4z"/>`;
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="#000">`
    + '<circle cx="50" cy="50" r="46.6" stroke-width="2.4"/><circle cx="50" cy="50" r="39.6" stroke-width="1.2"/>' + ticks
    + `</g><g fill="#000">${pts}</g></svg>`);
}

/** Parchment grain: warm mottling and faint fibres (tiles; used with multiply over the parchment colour). */
export function parchTexture(seed = 7) {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = 244 + r() * 11;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v - 2; img.data[i * 4 + 2] = v - 7; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const wrap = [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N], [N, N], [-N, -N], [N, -N], [-N, N]];
  for (let i = 0; i < 26; i++) {        // soft mottling
    const x = r() * N, y = r() * N, rad = 18 + r() * 46;
    for (const [ox, oy] of wrap) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, `rgba(170,128,70,${0.025 + r() * 0.035})`); gr.addColorStop(1, 'rgba(170,128,70,0)');
      g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {        // fibres
    const x = r() * N, y = r() * N, a = r() * TAU, l = 5 + r() * 18;
    g.strokeStyle = r() < 0.5 ? `rgba(255,255,255,${0.2 + r() * 0.3})` : `rgba(130,100,60,${0.04 + r() * 0.06})`;
    g.lineWidth = 0.4 + r() * 0.6;
    for (const [ox, oy] of wrap.slice(0, 5)) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke(); }
  }
  return `url(${c.toDataURL('image/png')})`;
}

/** A sparse starfield (transparent tile) for night-glass covers. */
export function starfield(seed = 19) {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  for (let i = 0; i < 70; i++) {
    const x = r() * N, y = r() * N, big = r() < 0.12;
    g.fillStyle = `rgba(${r() < 0.3 ? '220,230,255' : '255,244,220'},${big ? 0.5 + r() * 0.3 : 0.12 + r() * 0.25})`;
    g.beginPath(); g.arc(x, y, big ? 0.9 + r() * 0.5 : 0.35 + r() * 0.45, 0, TAU); g.fill();
  }
  return `url(${c.toDataURL('image/png')})`;
}

/** A banner ribbon with swallowtail ends for border-image (240 × 40, slice 12 46 12 46 fill): a night-blue body, a brass
 *  hairline just inside its edge and a second one along the folds. Colour baked in (border-image cannot take currentColor). */
export function ribbon() {
  const body = 'M2 4H238L224 20L238 36H2L16 20Z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="40" viewBox="0 0 240 40">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22305a" stop-opacity=".9"/><stop offset="1" stop-color="#0e1428" stop-opacity=".82"/></linearGradient></defs>`
    + `<path d="${body}" fill="url(#g)"/>`
    + `<path d="M7 7.5H231L219.5 20L231 32.5H7L18.5 20Z" fill="none" stroke="#ecd9a4" stroke-opacity=".62" stroke-width="1"/>`
    + `<path d="${body}" fill="none" stroke="#ecd9a4" stroke-opacity=".3" stroke-width="1"/>`
    + `<path d="M30 7.5V32.5M210 7.5V32.5" stroke="#ecd9a4" stroke-opacity=".35" stroke-width=".8"/></svg>`;
  return svgUrl(svg);
}
