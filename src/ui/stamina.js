// 气力 ring: twelve gold petals by her shoulder that show her stamina (src/player/stamina.js). It appears only while the
// pool is not full or is being used, and fades a moment after it fills. Winded, the petals turn rose until it is full.
// ui.js creates it and calls late() after the camera moved (projection of her shoulder, like the foe plates).
import { G } from '../core/game.js';
import { clamp } from '../core/util.js';
import { UI, el } from './dom.js';
import { addCss } from './style.js';

addCss(`
.stam-ring { position: absolute; left: 0; top: 0; width: 34u; height: 34u; margin: -17u 0 0 -17u; pointer-events: none; opacity: 0;
  transition: opacity .35s; will-change: transform, opacity; filter: drop-shadow(0 0 2u rgba(8,6,14,.85)); }
.stam-ring.on { opacity: 1; }
.stam-ring svg { width: 100%; height: 100%; overflow: visible; }
.stam-ring .pt { fill: #ffe7a6; transition: fill .3s; }
.stam-ring .bk { fill: rgba(20,16,30,.42); }
.stam-ring.wind .pt { fill: #f2a0ae; }
.stam-ring.low .pt { animation: mv-pulse .5s infinite; }
`);

const N = 12;
const SVGNS = 'http://www.w3.org/2000/svg';

export function createStaminaRing(parent) {
  const root = el('div', 'stam-ring', parent);
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '-20 -20 40 40');
  root.appendChild(svg);
  const petals = [];
  // one petal: a pointed leaf from near the centre to the rim, rotated around the ring
  const leaf = 'M0,-6 C3.2,-9 3.2,-15 0,-18.5 C-3.2,-15 -3.2,-9 0,-6 Z';
  for (let i = 0; i < N; i++) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('transform', `rotate(${(i * 360) / N})`);
    const bk = document.createElementNS(SVGNS, 'path'); bk.setAttribute('d', leaf); bk.setAttribute('class', 'bk');
    const pt = document.createElementNS(SVGNS, 'path'); pt.setAttribute('d', leaf); pt.setAttribute('class', 'pt');
    g.appendChild(bk); g.appendChild(pt); svg.appendChild(g);
    petals.push({ pt, o: -1 });
  }
  const st = { on: false, x: -1, y: -1, wind: false, low: false, fullT: 0 };
  const setCls = (c, on) => root.classList.toggle(c, on);
  return {
    late(rdt = 0.016) {
      const P = G.player, cam = G.camera, S = P?.stam;
      const play = G.mode === 'play' && !!P && !!S && !P.dead && !G.dialogue?.active;
      const k = S ? clamp(S.value / Math.max(1, S.max)) : 1;
      if (S && (k < 0.999 || S.draining > 0.05)) st.fullT = 0; else st.fullT += rdt;
      const show = play && st.fullT < 0.9;
      if (show !== st.on) { st.on = show; setCls('on', show); }
      if (!show || !cam) return;
      if (S.winded !== st.wind) { st.wind = S.winded; setCls('wind', st.wind); }
      const low = !S.winded && k < 0.22;
      if (low !== st.low) { st.low = low; setCls('low', low); }
      // petals fill in order around the ring; the last one fades with the fraction left
      for (let i = 0; i < N; i++) {
        const o = Math.round(clamp(k * N - i) * 20) / 20;
        if (o !== petals[i].o) { petals[i].o = o; petals[i].pt.style.opacity = String(o); }
      }
      // beside her right shoulder in screen space
      const e = cam.matrixWorldInverse.elements, p = P.pos, y = p.y + (P.state === 'swim' ? 0.6 : 1.45);
      const vx = e[0] * p.x + e[4] * y + e[8] * p.z + e[12], vy = e[1] * p.x + e[5] * y + e[9] * p.z + e[13], vz = e[2] * p.x + e[6] * y + e[10] * p.z + e[14];
      if (vz > -0.3) return;
      const m = cam.projectionMatrix.elements, w = -vz;
      const nx = (m[0] * vx + m[8] * vz) / w, ny = (m[5] * vy + m[9] * vz) / w;
      const sx = Math.round((nx * 0.5 + 0.5) * UI.w + 46 * (UI.scale || 1)), sy = Math.round((-ny * 0.5 + 0.5) * UI.h);
      if (sx !== st.x || sy !== st.y) { st.x = sx; st.y = sy; root.style.transform = `translate3d(${sx}px,${sy}px,0)`; }
    },
  };
}
