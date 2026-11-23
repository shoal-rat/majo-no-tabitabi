// Star knots 「结星」: small four-pointed gold glints where tied parts meet (and, brighter and pulsing, where a held part
// would tie). One THREE.Points draw for all of them; positions are written each frame into a preallocated buffer.
import * as THREE from 'three';
import { G } from '../core/game.js';

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,250,232,1)'); grd.addColorStop(0.25, 'rgba(255,226,150,.85)'); grd.addColorStop(1, 'rgba(255,200,110,0)');
  g.fillStyle = grd;
  // four long points and four short ones
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2, r = i % 4 === 0 ? 30 : i % 2 === 0 ? 13 : 6;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createKnots(max) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({ size: 0.42, map: starTexture(), vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'craft:knots'; pts.frustumCulled = false; pts.renderOrder = 6;
  G.scene?.add(pts);
  let n = 0;
  return {
    begin() { n = 0; },
    /** One glint at (x, y, z), brightness k (0..1.6). */
    add(x, y, z, k) {
      if (n >= max) return;
      const i = n * 3;
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
      col[i] = k; col[i + 1] = k * 0.86; col[i + 2] = k * 0.58;
      n++;
    },
    end() {
      geo.setDrawRange(0, n);
      if (n) { geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; }
      pts.visible = n > 0;
    },
    get count() { return n; },
  };
}
