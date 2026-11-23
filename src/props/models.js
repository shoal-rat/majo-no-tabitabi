// Prop visuals: procedural builders, "kits" (a type's geometry merged per material, centred on the collider centre)
// and the batching that draws every live prop in one draw call per material family (draw-call pass: BatchedMesh).
//
// A kit part may carry flags (set on a procedural child mesh via userData, inherited by its children):
//   cond: 'lit' | 'unlit'   only drawn while the prop is lit / unlit
//   swing: true             rotates about kit.pivot by prop.swing (bells, chimes)
//   glow: true              instance colour is NOT tinted by charring / wetness
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G } from '../core/game.js';
import { PAL, toon, flat, glow, own } from '../core/mats.js';
import { box, cyl, cone, sphere, ico, torus, grp } from '../core/geo.js';
import { M, rbox, lathe, rcyl, ring, ropeRing, tube, lumpy, plankCrate } from './shapes.js';
import { colourFamily } from '../world/builders/kit.js';

// ---- procedural builders ------------------------------------------------------------------------------------------
const flag = (o, k, v = true) => { o.userData[k] = v; return o; };
const lay = (m) => { m.rotation.x = Math.PI / 2; return m; };

const BUILDERS = {
  // 爆竹桶: lacquered staved keg, brass hoops, paper seal, a rope-bound bundle of rockets and a twisted fuse
  firework() {
    const red = M.lacquer(PAL.vermilion), redD = M.lacquer(PAL.vermilionDark), brass = M.brass(), white = M.paper(), dark = M.woodDark();
    const g = grp();
    // staves: a lathe with a gentle belly, then dark grooves between staves
    g.add(lathe([[0, 0], [0.27, 0], [0.29, 0.03], [0.315, 0.2], [0.325, 0.39], [0.315, 0.58], [0.29, 0.75], [0.27, 0.78], [0, 0.78]], red, 0, 0, 0, 24));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const s = rbox(0.012, 0.66, 0.02, redD, Math.cos(a) * 0.318, 0.39, Math.sin(a) * 0.318, 0.005, 1); s.rotation.y = -a; g.add(s);
    }
    for (const y of [0.1, 0.68]) g.add(ring(0.322, 0.024, brass, 0, y, 0, 28, 6));
    g.add(ring(0.33, 0.03, brass, 0, 0.39, 0, 28, 6));
    // paper seal with a red stamp
    const seal = rbox(0.3, 0.26, 0.02, white, 0, 0.4, 0.318, 0.008, 1); g.add(seal);
    g.add(rbox(0.11, 0.11, 0.022, M.lacquer(PAL.mikoRed), 0, 0.42, 0.33, 0.01, 1));
    g.add(rcyl(0.27, 0.27, 0.04, dark, 0, 0.79, 0, 20));
    const cols = [PAL.glowPink, PAL.gold, PAL.glowCyan, PAL.mikoRed, PAL.glowViolet, PAL.gold, PAL.glowCyan];
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2, rr = i === 6 ? 0 : 0.12;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, hh = 0.26 + (i % 3) * 0.06;
      g.add(rcyl(0.035, 0.035, hh, M.lacquer(cols[i]), x, 0.8 + hh / 2, z, 8, 0.008));
      g.add(cone(0.05, 0.1, white, x, 0.85 + hh, z, 8));
      g.add(ring(0.037, 0.008, brass, x, 0.82 + hh * 0.8, z, 10, 4));
    }
    g.add(ropeRing(0.17, 0.018, M.rope(), 0, 0.9, 0));
    g.add(tube([[0.2, 0.86, -0.06], [0.27, 0.95, -0.1], [0.24, 1.05, -0.16], [0.3, 1.1, -0.2]], 0.01, M.rope(), 10, 4));
    return g;
  },
  // 水瓮: glazed clay belly with a rope sling, wooden lid, water glinting under it
  water_jar() {
    const g = grp(
      lathe([[0.0, 0], [0.22, 0.0], [0.26, 0.02], [0.34, 0.12], [0.39, 0.34], [0.38, 0.5], [0.33, 0.66], [0.27, 0.77], [0.245, 0.82], [0.27, 0.86], [0.285, 0.89], [0.27, 0.91], [0.235, 0.88]], M.glaze(0x8a4a2e), 0, 0, 0, 28),
      lathe([[0.3, 0.6], [0.355, 0.56], [0.388, 0.46], [0.389, 0.36], [0.37, 0.2]], M.glaze(0x5f86b8), 0, 0, 0, 28),
      ropeRing(0.384, 0.026, M.rope(), 0, 0.52, 0),
      ropeRing(0.372, 0.02, M.rope(), 0, 0.44, 0),
      rcyl(0.226, 0.226, 0.02, toon(0x3f9fd0, { emissive: 0x0d3550, surface: 'none', look: { spec: 0.8, specPower: 90 } }), 0, 0.84, 0, 24, 0.004),
      rcyl(0.2, 0.21, 0.03, M.woodLight(), 0.04, 0.905, 0.03, 18, 0.008),
      rbox(0.04, 0.03, 0.03, M.woodDark(), 0.04, 0.93, 0.03, 0.008, 1),
      rbox(0.15, 0.19, 0.02, M.paper(), 0, 0.3, 0.375, 0.006, 1),
    );
    g.children[g.children.length - 1].rotation.x = -0.18;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; g.add(tube([[Math.cos(a) * 0.384, 0.52, Math.sin(a) * 0.384], [Math.cos(a) * 0.36, 0.66, Math.sin(a) * 0.36], [Math.cos(a) * 0.29, 0.79, Math.sin(a) * 0.29]], 0.012, M.rope(), 8, 4)); }
    return g;
  },
  iron_ball() {
    const iron = M.ironDark(), band = M.iron();
    const g = grp(sphere(0.3, iron, 0, 0, 0, 24, 16), ring(0.302, 0.022, band, 0, 0, 0, 32, 6));
    const v = ring(0.302, 0.018, band, 0, 0, 0, 32, 6); v.rotation.x = Math.PI / 2; g.add(v);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(sphere(0.022, band, Math.cos(a) * 0.31, 0, Math.sin(a) * 0.31, 6, 4)); }
    g.add(rcyl(0.05, 0.06, 0.08, band, 0, 0.32, 0, 10, 0.01));
    const h = torus(0.07, 0.016, band, 0, 0.39, 0, 6, 14); g.add(h);
    return g;
  },
  // 米袋: lumpy burlap with a gathered neck, rope tie and a paper tag
  sack() {
    const burlap = M.burlap();
    const g = grp(
      lumpy(0.36, burlap, 0, 0.3, 0, 0.06, 3, 20, 14, 1.05, 0.85, 0.9),
      lathe([[0.2, 0], [0.17, 0.05], [0.12, 0.12], [0.1, 0.16], [0.12, 0.2], [0.16, 0.24], [0.12, 0.27], [0, 0.26]], burlap, 0, 0.5, 0, 14),
      ropeRing(0.105, 0.02, M.ropeRed(), 0, 0.64, 0),
      tube([[0.09, 0.64, 0.06], [0.14, 0.58, 0.12], [0.13, 0.5, 0.15]], 0.01, M.ropeRed(), 8, 4),
      rbox(0.2, 0.13, 0.012, M.paper(), 0.0, 0.32, 0.305, 0.004, 1),
    );
    g.children[g.children.length - 1].rotation.x = -0.35;
    // folds near the neck
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const f = rbox(0.03, 0.2, 0.05, burlap, Math.cos(a) * 0.15, 0.56, Math.sin(a) * 0.15, 0.015, 2); f.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5); g.add(f); }
    return g;
  },
  crate_small() {
    return plankCrate(0.52, 0.46, 0.52, { planks: 3 });
  },
  // 稻草捆: soft bale, straw tufts and two twine bands
  hay() {
    const straw = M.straw(), dark = M.strawDark(), light = toon(0xead08a, { surface: 'thatch', look: { scale: 0.9 } });
    const g = grp(rbox(1.0, 0.56, 0.68, straw, 0, 0.28, 0, 0.09, 3), rbox(0.92, 0.05, 0.6, light, 0, 0.56, 0, 0.025, 2));
    for (const x of [-0.26, 0.26]) g.add(rbox(0.04, 0.6, 0.72, dark, x, 0.29, 0, 0.018, 2));
    for (let i = 0; i < 9; i++) {
      const s = rbox(0.18, 0.025, 0.04, i % 2 ? light : straw, -0.38 + (i % 5) * 0.19, 0.585, -0.22 + Math.floor(i / 5) * 0.32 + (i % 3) * 0.06, 0.01, 1);
      s.rotation.set(0.2 * (i % 3 - 1), i * 0.9, 0.15); g.add(s);
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const s = rbox(0.06, 0.02, 0.12, light, sx * 0.51, 0.12 + i * 0.12, -0.2 + (i % 2) * 0.35, 0.008, 1); s.rotation.set(0.3, 0, sx * 0.6); g.add(s); }
    return g;
  },
  snowball() {
    const snow = M.snow();
    return grp(lumpy(0.42, snow, 0, 0, 0, 0.05, 7, 20, 14), lumpy(0.16, snow, 0.26, 0.2, 0.2, 0.12, 2, 10, 8), lumpy(0.12, snow, -0.28, 0.12, -0.22, 0.12, 5, 10, 8),
      lumpy(0.09, snow, 0.05, -0.08, 0.38, 0.15, 9, 8, 6));
  },
  ice_block() {
    const ice = M.ice(), hi = toon(0xe6f7ff, { emissive: 0x2a5070, surface: 'none', look: { spec: 0.7, specPower: 80, rim: 0.7 } });
    const g = grp(rbox(0.78, 0.78, 0.78, ice, 0, 0, 0, 0.07, 3), rbox(0.5, 0.05, 0.6, hi, 0.05, 0.38, 0, 0.02, 2));
    // frosted cracks
    for (let i = 0; i < 3; i++) { const c = rbox(0.42 - i * 0.1, 0.012, 0.012, hi, -0.05 + i * 0.08, 0.1 - i * 0.18, 0.392, 0.005, 1); c.rotation.z = 0.5 - i * 0.45; g.add(c); }
    return g;
  },
  // 火盆: hammered iron bowl on three curled legs, brass lip
  brazier() {
    const iron = M.ironDark(), rim = M.bronze();
    const g = grp(
      lathe([[0.0, 0.48], [0.12, 0.48], [0.2, 0.52], [0.3, 0.6], [0.37, 0.7], [0.4, 0.76], [0.38, 0.77], [0.34, 0.7], [0.0, 0.66]], iron, 0, 0, 0, 22),
      ring(0.395, 0.03, rim, 0, 0.765, 0, 30, 6),
      ring(0.33, 0.016, rim, 0, 0.64, 0, 26, 5),
      rcyl(0.08, 0.12, 0.08, iron, 0, 0.45, 0, 12, 0.01),
    );
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      g.add(tube([[c * 0.12, 0.47, s * 0.12], [c * 0.2, 0.36, s * 0.2], [c * 0.27, 0.15, s * 0.27], [c * 0.3, 0.03, s * 0.3], [c * 0.35, 0.02, s * 0.35]], 0.026, iron, 12, 6));
      g.add(sphere(0.035, iron, c * 0.36, 0.03, s * 0.36, 8, 6));
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(sphere(0.016, rim, Math.cos(a) * 0.37, 0.7, Math.sin(a) * 0.37, 6, 4)); }
    g.add(flag(ico(0.2, glow(0xff6a2a, 1.6), 0, 0.74, 0, 1), 'cond', 'lit'));
    g.add(flag(lumpy(0.2, flat(0x2a2422, { surface: 'rock' }), 0, 0.7, 0, 0.25, 4, 10, 6, 1, 0.45, 1), 'cond', 'unlit'));
    g.add(flag(cone(0.2, 0.5, glow(PAL.lanternWarm, 2.6), 0, 1.0, 0, 7), 'cond', 'lit'));
    g.add(flag(cone(0.1, 0.32, glow(PAL.lanternHot, 3.2), 0, 1.0, 0, 6), 'cond', 'lit'));
    return g;
  },
  // 松明柱: tapered post, iron basket with rope wrap
  // 帆: a mast on a cross of two planks, a yard and a cream sailcloth bellied a little to the front (craft part)
  sail() {
    const wood = M.wood(), dark = M.woodDark(), cloth = toon(0xf1e6cd, { surface: 'cloth', look: { detail: 0.8, trans: 0.25 } });
    const g = grp(
      rbox(1.1, 0.08, 0.2, dark, 0, 0.04, 0, 0.02, 2), rbox(0.2, 0.08, 1.1, dark, 0, 0.04, 0, 0.02, 2),
      rcyl(0.045, 0.055, 2.3, wood, 0, 1.19, 0, 10, 0.01),
      rbox(1.5, 0.05, 0.05, wood, 0, 2.2, 0.02, 0.012, 1),
      ropeRing(0.06, 0.014, M.rope(), 0, 2.2, 0), ropeRing(0.06, 0.014, M.rope(), 0, 0.7, 0),
    );
    for (let i = 0; i < 5; i++) {   // the cloth in five panels, bellied forward in the middle
      const u = (i - 2) / 2, belly = 0.09 * (1 - u * u);
      g.add(rbox(0.29, 1.42, 0.02, cloth, u * 0.58, 1.43, 0.06 + belly, 0.004, 1));
    }
    return g;
  },
  torch_post() {
    const wood = M.woodDark(), iron = M.ironDark();
    const g = grp(
      lathe([[0.1, 0], [0.095, 0.05], [0.08, 0.6], [0.07, 1.86], [0.075, 1.9]], wood, 0, 0, 0, 9),
      lathe([[0.06, 1.86], [0.08, 1.9], [0.13, 2.02], [0.14, 2.04], [0.12, 2.04], [0.07, 1.93]], iron, 0, 0, 0, 10),
      ring(0.135, 0.012, M.bronze(), 0, 2.03, 0, 16, 4),
      ropeRing(0.085, 0.02, M.rope(), 0, 1.6, 0), ropeRing(0.083, 0.018, M.rope(), 0, 1.56, 0),
      rbox(0.24, 0.08, 0.24, M.stoneDark(), 0, 0.04, 0, 0.025, 2),
    );
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = rbox(0.012, 0.16, 0.012, iron, Math.cos(a) * 0.11, 1.97, Math.sin(a) * 0.11, 0.004, 1); b.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); g.add(b); }
    g.add(flag(cone(0.11, 0.32, glow(PAL.lanternWarm, 2.8), 0, 2.18, 0, 6), 'cond', 'lit'));
    g.add(flag(cone(0.05, 0.2, glow(PAL.lanternHot, 3.4), 0, 2.13, 0, 5), 'cond', 'lit'));
    return g;
  },
  // 灯笼柱: post + arm, a ribbed paper chouchin with lacquered caps
  lantern_post() {
    const wood = M.woodDark(), cap = M.lacquer(0x2b2238);
    const g = grp(
      lathe([[0.11, 0], [0.1, 0.06], [0.085, 0.6], [0.075, 2.3], [0.06, 2.34]], wood, 0, 0, 0, 9),
      rbox(0.72, 0.08, 0.08, wood, 0.3, 2.22, 0, 0.02, 2),
      rbox(0.05, 0.2, 0.05, wood, 0.08, 2.1, 0, 0.012, 1),
      rbox(0.07, 0.07, 0.07, M.brass(), 0.62, 2.22, 0, 0.015, 1),
      rbox(0.26, 0.08, 0.26, M.stoneDark(), 0, 0.04, 0, 0.025, 2),
    );
    g.children[2].rotation.z = -0.7;
    const prof = [[0.12, -0.27], [0.19, -0.21], [0.225, -0.1], [0.23, 0], [0.225, 0.1], [0.19, 0.21], [0.12, 0.27]];
    const paperU = lathe(prof, M.paperWarm(), 0.6, 1.82, 0, 16);
    const paperL = lathe(prof, glow(PAL.lanternWarm, 2.4), 0.6, 1.82, 0, 16);
    g.add(flag(paperU, 'cond', 'unlit'), flag(flag(paperL, 'cond', 'lit'), 'glow'));
    for (let i = -2; i <= 2; i++) { const y = 1.82 + i * 0.1, r = 0.232 - Math.abs(i) * 0.012 - (Math.abs(i) === 2 ? 0.02 : 0); g.add(ring(r, 0.006, cap, 0.6, y, 0, 18, 3)); }
    g.add(rcyl(0.13, 0.13, 0.05, cap, 0.6, 2.1, 0, 14, 0.01), rcyl(0.13, 0.13, 0.05, cap, 0.6, 1.54, 0, 14, 0.01), cyl(0.012, 0.012, 0.14, cap, 0.6, 2.16, 0, 4));
    g.add(tube([[0.6, 1.52, 0], [0.6, 1.44, 0.0], [0.6, 1.36, 0.01]], 0.01, M.ropeRed(), 4, 4));
    return g;
  },
  // 神铃: vermilion frame with a little tiled roof, bronze bell with a lip, red-white twisted rope
  shrine_bell() {
    const red = M.lacquer(PAL.vermilion), roof = toon(PAL.roofTile, { surface: 'tile', look: { spec: 0.25, specPower: 40 } }), bronze = M.bronze();
    const g = grp(
      rbox(0.13, 2.5, 0.13, red, -0.55, 1.25, 0, 0.025, 2), rbox(0.13, 2.5, 0.13, red, 0.55, 1.25, 0, 0.025, 2),
      rbox(1.44, 0.12, 0.16, red, 0, 2.4, 0, 0.025, 2), rbox(1.3, 0.08, 0.1, red, 0, 2.15, 0, 0.02, 2),
      rbox(1.64, 0.07, 0.56, roof, 0, 2.6, 0, 0.02, 2), rbox(1.5, 0.06, 0.42, roof, 0, 2.66, 0, 0.02, 2),
      rbox(0.3, 0.12, 0.3, M.stoneDark(), -0.55, 0.06, 0, 0.03, 2), rbox(0.3, 0.12, 0.3, M.stoneDark(), 0.55, 0.06, 0, 0.03, 2),
    );
    const sw = grp(
      lathe([[0.0, 1.84], [0.27, 1.84], [0.28, 1.86], [0.26, 1.9], [0.2, 2.02], [0.16, 2.16], [0.14, 2.24], [0.08, 2.29], [0, 2.3]], bronze, 0, 0, 0, 22),
      ring(0.255, 0.018, toon(0x8a6a2e, { surface: 'metal', look: { spec: 0.5, specPower: 40 } }), 0, 1.92, 0, 24, 5),
      ring(0.18, 0.012, toon(0x8a6a2e, { surface: 'metal', look: { spec: 0.5, specPower: 40 } }), 0, 2.12, 0, 20, 4),
      torus(0.05, 0.014, bronze, 0, 2.33, 0, 5, 12),
    );
    // twisted red / white rope: two helical strands
    const strand = (ph, m) => { const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * 22 + ph; pts.push([Math.cos(a) * 0.016, 1.86 - t * 0.96, Math.sin(a) * 0.016]); } return tube(pts, 0.017, m, 48, 5); };
    sw.add(strand(0, M.ropeRed()), strand(Math.PI, M.paper()));
    sw.add(rcyl(0.04, 0.03, 0.16, M.paper(), 0, 0.84, 0, 8, 0.01));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const t = rbox(0.02, 0.18, 0.008, M.ropeRed(), Math.cos(a) * 0.04, 0.7, Math.sin(a) * 0.04, 0.004, 1); t.rotation.y = -a; sw.add(t); }
    flag(sw, 'swing');
    g.add(sw);
    return g;
  },
  // 风铃: glass furin with a painted band, clapper and a paper tanzaku
  wind_chime() {
    const wood = M.woodDark();
    const g = grp(lathe([[0.06, 0], [0.055, 0.05], [0.05, 1.9]], wood, 0, 0, 0, 7), rbox(0.5, 0.05, 0.05, wood, 0.22, 1.88, 0, 0.012, 1), rbox(0.16, 0.06, 0.16, M.stoneDark(), 0, 0.03, 0, 0.02, 1));
    const glass = toon(0xcdeeff, { emissive: 0x204058, surface: 'none', look: { spec: 0.8, specPower: 80, rim: 0.7, trans: 0.4 } });
    const bell = lathe([[0.11, 1.66], [0.105, 1.7], [0.09, 1.75], [0.06, 1.78], [0.02, 1.79]], glass, 0.42, 0, 0, 16);
    const band = lathe([[0.108, 1.68], [0.1, 1.72]], toon(PAL.mikoRed, { surface: 'none', look: { spec: 0.4 } }), 0.42, 0, 0, 16);
    const sw = grp(bell, band, cyl(0.006, 0.006, 0.1, M.iron(), 0.42, 1.82, 0, 3), cyl(0.004, 0.004, 0.16, M.iron(), 0.42, 1.6, 0, 3),
      rcyl(0.018, 0.018, 0.02, glass, 0.42, 1.66, 0, 8, 0.004),
      rbox(0.075, 0.24, 0.006, M.paper(), 0.42, 1.42, 0, 0.003, 1), rbox(0.06, 0.012, 0.007, M.ropeRed(), 0.42, 1.48, 0, 0.002, 1));
    g.add(flag(sw, 'swing'));
    return g;
  },
};
/** Pivot (in builder space, before centring) the 'swing' parts rotate about. */
const PIVOTS = { shrine_bell: [0, 2.38, 0], wind_chime: [0.42, 1.87, 0] };

// ---- kits ---------------------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4();
function inherited(o, k) { for (let p = o; p; p = p.parent) if (p.userData && p.userData[k] !== undefined) return p.userData[k]; return undefined; }

function subRange(g, start, count) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    const arr = new Float32Array(count * a.itemSize);
    for (let i = 0; i < count; i++) for (let c = 0; c < a.itemSize; c++) arr[i * a.itemSize + c] = a.getComponent(start + i, c);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  return out;
}

/** Collapse a model / procedural group into parts { geo, mat, cond, swing, glow } (one per material+flags). */
function collect(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
    const cond = inherited(o, 'cond') || null, swing = !!inherited(o, 'swing'), glw = !!inherited(o, 'glow');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(_m.copy(o.matrixWorld));
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const pieces = Array.isArray(o.material) && g.groups.length
      ? g.groups.map((gr) => [subRange(g, gr.start, Math.min(gr.count, g.attributes.position.count - gr.start)), mats[gr.materialIndex] || mats[0]])
      : [[g, mats[0]]];
    for (const [pg, mat] of pieces) {
      if (!mat) continue;
      const key = mat.uuid + '|' + cond + '|' + swing + '|' + glw;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat, cond, swing, glow: glw || !!mat.isMeshBasicMaterial, geos: [] }));
      b.geos.push(pg);
    }
  });
  const parts = [];
  for (const b of buckets.values()) {
    const wantColor = !!b.mat.vertexColors;
    for (const g of b.geos) {
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv' && !(n === 'color' && wantColor)) g.deleteAttribute(n);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (wantColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      if (g.attributes.color && g.attributes.color.itemSize !== 3) {
        const a = g.attributes.color, c = new Float32Array(a.count * 3);
        for (let i = 0; i < a.count; i++) { c[i * 3] = a.getX(i); c[i * 3 + 1] = a.getY(i); c[i * 3 + 2] = a.getZ(i); }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      // refined glbs may carry interleaved / normalized-integer attributes: merge needs plain float32 everywhere
      for (const n of Object.keys(g.attributes)) {
        const a = g.attributes[n];
        if (!a.isInterleavedBufferAttribute && !a.normalized && a.array instanceof Float32Array) continue;
        const out = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
        g.setAttribute(n, new THREE.BufferAttribute(out, a.itemSize));
      }
      g.morphAttributes = {}; g.groups.length = 0;
    }
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (geo) parts.push({ geo, mat: b.mat, cond: b.cond, swing: b.swing, glow: b.glow });
  }
  return parts;
}

const kits = new Map();
const _box = new THREE.Box3(), _b2 = new THREE.Box3();

/** Kit of a catalogue type (built once, lazily). */
/**
 * Sculpted vessels (install round 2026-11-17, .tmp/sculpt/<name>/INSTALL.md): catalog type -> [G.sculpt type, asset id,
 * LOD node]. Every LOD of these GLBs is vertex-coloured with the old material names / surface tags, so a kit joins the
 * same BatchedMesh families as before. Only one LOD node is kept (the GLB holds three siblings). Off: ?sculpt=0.
 */
const SCULPT_PROPS = {
  pot: ['pot', 'sculpt_pot_clay', 0], barrel_large: ['barrel', 'sculpt_barrel_large', 0], bucket: ['bucket', 'sculpt_bucket_wood', 0],
  jar: ['jar', 'sculpt_jar_a', 0], cart: ['cart', 'sculpt_cart', 0],
};
function sculptKitRoot(type) {
  const e = SCULPT_PROPS[type];
  if (!e || !G.sculpt?.on?.(e[0])) return null;
  const root = G.assets?.model?.(e[1]);
  if (!root) return null;
  const keep = new RegExp('_LOD' + e[2] + '$'), drop = [];
  root.traverse((o) => { if (/_LOD\d$/.test(o.name || '') && !keep.test(o.name)) drop.push(o); });
  for (const o of drop) o.removeFromParent();
  root.userData.sculptKit = e[1];
  return root;
}
export function getKit(type, def) {
  let k = kits.get(type);
  if (k) return k;
  let root = sculptKitRoot(type);
  if (!root && def.model) root = G.assets?.model?.(def.model) || null;
  if (!root && def.build && BUILDERS[def.build]) root = BUILDERS[def.build]();
  if (!root) root = grp(box(0.6, 0.6, 0.6, toon(PAL.woodLight)));   // missing asset: never crash, show a plain box
  const wrap = new THREE.Group();
  wrap.add(root);
  if (def.scale) root.scale.multiplyScalar(def.scale);
  if (def.rotY) root.rotation.y = def.rotY;
  const parts = collect(wrap);
  _box.makeEmpty();
  for (const p of parts) { p.geo.computeBoundingBox(); _box.union(p.geo.boundingBox); }
  const c = _box.getCenter(new THREE.Vector3());
  const size = _box.getSize(new THREE.Vector3());
  for (const p of parts) { p.geo.translate(-c.x, -c.y, -c.z); p.geo.computeBoundingSphere(); }
  // model fire meshes (camp fire) only show while lit; andon-like lamps get a glowing core
  if (def.behave === 'fire') for (const p of parts) if (/fire|flame/i.test(p.mat.name || '')) p.cond = 'lit';
  if (def.glowPart) {
    const r = Math.min(size.x, size.z) * 0.3;
    const gg = new THREE.SphereGeometry(r, 10, 8); gg.scale(1, (size.y * 0.35) / r, 1); gg.translate(0, size.y * 0.08, 0);
    gg.computeBoundingSphere();
    parts.push({ geo: gg, mat: glow(PAL.lanternWarm, 2.4), cond: 'lit', swing: false, glow: true });
  }
  paintParts(parts, size, !!def.rolling);
  let pivot = null;
  if (PIVOTS[def.build]) { const pv = PIVOTS[def.build]; pivot = new THREE.Vector3(pv[0] - c.x, pv[1] - c.y, pv[2] - c.z); }
  let hullGeo = null;
  if (def.shape === 'hull') {
    const all = parts.map((p) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', p.geo.attributes.position); return g; });
    hullGeo = all.length === 1 ? all[0] : mergeGeometries(all, false);
  }
  k = { type, parts, size, pivot, hullGeo, ims: null, cap: 0, items: [], radius: size.length() / 2 };
  // a sculpted kit lays out like the model it replaces (place.js packs clusters by footprint): the old footprint, the
  // new height, so every placement record keeps its x / z and the record list (saves index it) stays the same
  if (root.userData.sculptKit && def.model) {
    const old = G.assets?.model?.(def.model);
    if (old) {
      if (def.scale) old.scale.multiplyScalar(def.scale);
      old.updateMatrixWorld(true);
      const ob = new THREE.Box3().setFromObject(old), os = ob.getSize(new THREE.Vector3());
      if (!ob.isEmpty()) k.layoutSize = new THREE.Vector3(os.x, size.y, os.z);
    }
  }
  kits.set(type, k);
  return k;
}

// ---- painted value gradient (Look round): every lit prop part is a touch darker and warmer at its foot and lighter at
// the top, like the site meshes (world/builders/kit.js shadeBaked), so a barrel or a pot sits on the ground instead of
// floating as one flat colour. Baked once per kit into a vertex colour; the material is a cached vertexColors clone,
// so the instanced draw calls stay the same. Rolling props get only the soft top light (no band that could end up on top).
const _pvc = new Map();
function paintParts(parts, size, rolling) {
  const h = Math.max(1e-3, size.y), y0 = -size.y / 2;
  for (const p of parts) {
    const m = p.mat;
    if (p.glow || !m || m.isMeshBasicMaterial || m.vertexColors || m.transparent || m.userData?.surface === 'none') continue;
    const P = p.geo.attributes.position, n = P.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ty = Math.min(1, Math.max(0, (P.getY(i) - y0) / h));
      const foot = rolling ? 0 : 1 - Math.min(1, ty / 0.22);
      const k = (0.93 + 0.1 * ty) * (1 - 0.12 * foot * foot);
      col[i * 3] = k * (1 - 0.02 * foot); col[i * 3 + 1] = k * (1 - 0.05 * foot); col[i * 3 + 2] = k * (1 - 0.09 * foot);
    }
    p.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    let v = _pvc.get(m);
    if (!v) { v = own(m); v.vertexColors = true; v.name = (m.name || '') + '+pvc'; _pvc.set(m, v); }
    p.mat = v;
  }
}

// ---- debris kits (one simple shape each; colour comes per instance) -------------------------------------------------
const DEBRIS_SHAPES = {
  plank: () => grp(rbox(0.34, 0.06, 0.1, toon(0xffffff, { surface: 'wood' }), 0, 0, 0, 0.014, 1), rbox(0.08, 0.05, 0.09, toon(0xd8d0c4, { surface: 'wood' }), 0.17, 0, 0, 0.01, 1)),
  shard: () => rbox(0.17, 0.035, 0.13, toon(0xffffff, { surface: 'earth', look: { spec: 0.2, detail: 0.5 } }), 0, 0, 0, 0.012, 1),
  chunk: () => lumpy(0.14, flat(0xffffff, { surface: 'rock' }), 0, 0, 0, 0.22, 3, 7, 5),
  sliver: () => rbox(0.2, 0.012, 0.09, toon(0xffffff, { surface: 'paper', look: { trans: 0.3 } }), 0, 0, 0, 0.005, 1),
  ball: () => sphere(0.07, toon(0xffffff, { surface: 'none', look: { spec: 0.25, specPower: 30 } }), 0, 0, 0, 10, 7),
  // destruction (terrain agent): thrown earth, broken stone, burst trunks
  clod: () => lumpy(0.15, toon(0xffffff, { surface: 'earth' }), 0, 0, 0, 0.32, 5, 7, 5, 1, 0.72, 0.9),
  rock: () => lumpy(0.14, flat(0xffffff, { surface: 'rock' }), 0, 0, 0, 0.3, 11, 5, 4, 1.1, 0.8, 0.95),
  splinter: () => rbox(0.52, 0.05, 0.08, toon(0xffffff, { surface: 'wood' }), 0, 0, 0, 0.01, 1),
};
/** Half extents of each debris shape (collider). */
export const DEBRIS_HALF = { plank: [0.17, 0.03, 0.05], shard: [0.085, 0.02, 0.065], chunk: [0.12, 0.12, 0.12], sliver: [0.1, 0.01, 0.045], ball: [0.06, 0.06, 0.06],
  clod: [0.13, 0.1, 0.12], rock: [0.13, 0.1, 0.12], splinter: [0.26, 0.025, 0.04] };
export function getDebrisKit(kind) {
  const id = 'debris:' + kind;
  let k = kits.get(id);
  if (k) return k;
  const parts = collect(grp(DEBRIS_SHAPES[kind]()));
  for (const p of parts) { p.geo.computeBoundingSphere(); p.debris = true; }
  k = { type: id, parts, size: new THREE.Vector3(), pivot: null, ims: null, cap: 0, items: [], radius: 0.2 };
  kits.set(id, k);
  return k;
}

// ---- batching (draw-call pass, docs/api/perf.md) -----------------------------------------------------------------
// Every kit part goes into a shared THREE.BatchedMesh per (material, attribute set): one draw call per material family
// for ALL live props of ALL types (was one InstancedMesh per type and material). Lit vertex-coloured parts are folded
// into a white family material first (their material colour multiplied into the vertex colour, world/builders/kit.js
// colourFamily), so a barrel and a crate of the same surface share one batch. Instances are culled one by one against
// the camera and the shadow cameras (BatchedMesh.perObjectFrustumCulled); hidden parts (cond) are set invisible.
// The API is unchanged: alloc / release / writeItem / writeColor work on kit slots.
const batches = new Map();
function batchFor(part) {
  const g = part.geo;
  const key = part.mat.uuid + '|' + Object.keys(g.attributes).sort().join(',') + '|' + (part.glow ? 'g' : '');
  let b = batches.get(key);
  if (!b) {
    const bm = new THREE.BatchedMesh(32, 8192, 0, part.mat);
    bm.name = 'props:' + (part.mat.name || part.mat.type);
    bm.castShadow = !part.glow; bm.receiveShadow = !part.glow;
    bm.frustumCulled = false;            // the batch's own sphere is not kept up to date; instances are culled one by one
    bm.perObjectFrustumCulled = true;
    bm.sortObjects = false;              // as the instanced kits (no per-frame sort on the CPU)
    bm.visible = false;
    G.scene.add(bm);
    b = { bm, n: 0 };
    batches.set(key, b);
  }
  return b;
}
function addGeo(b, geo) {
  const bm = b.bm, nv = geo.attributes.position.count;
  if (bm.unusedVertexCount < nv) {
    const max = bm._maxVertexCount, used = max - bm.unusedVertexCount;
    let v = max; while (v - used < nv) v *= 2;
    bm.setGeometrySize(v, 0);
  }
  return bm.addGeometry(geo);
}
function batchKit(kit) {
  if (kit.batched) return;
  kit.batched = true;
  for (const p of kit.parts) {
    // fold the colour of a lit vertex-coloured part into its vertex colours (one family material per surface)
    const fam = colourFamily(p.mat);
    if (fam && fam !== p.mat && p.geo.attributes.color) {
      const c = p.mat.color, a = p.geo.attributes.color.array;
      for (let i = 0; i < a.length; i += 3) { a[i] *= c.r; a[i + 1] *= c.g; a[i + 2] *= c.b; }
      p.geo.attributes.color.needsUpdate = true;
      p.mat = fam;
    }
    if (p.geo.index) p.geo = p.geo.toNonIndexed();   // every batch is non-indexed (kit parts already are, but the glow core)
    p.batch = batchFor(p);
    p.gid = addGeo(p.batch, p.geo);
  }
}
/** Give `item` (anything with .slot) an instance slot in the kit (one batch instance per kit part). */
export function alloc(kit, item) {
  batchKit(kit);
  item.slot = kit.items.length;
  kit.items.push(item);
  item.bids = kit.parts.map((p) => {
    const b = p.batch, bm = b.bm;
    if (bm.instanceCount >= bm.maxInstanceCount) bm.setInstanceCount(bm.maxInstanceCount * 2);
    const id = bm.addInstance(p.gid);
    bm.setColorAt(id, _one);
    b.n++; bm.visible = true;
    return id;
  });
}
/** Release item's slot (swap-remove of the slot list; the moved item is re-written by the caller's writer). */
export function release(kit, item, rewrite) {
  const i = item.slot;
  if (i == null || kit.items[i] !== item) return;
  if (item.bids) {
    kit.parts.forEach((p, j) => { const b = p.batch; b.bm.deleteInstance(item.bids[j]); b.n--; if (b.n <= 0) b.bm.visible = false; });
    item.bids = null;
  }
  const last = kit.items.pop();
  if (last !== item) { kit.items[i] = last; last.slot = i; rewrite?.(last); }
  item.slot = null;
}

const _M = new THREE.Matrix4(), _S = new THREE.Vector3(), _P = new THREE.Matrix4(), _R = new THREE.Matrix4();
const _one = new THREE.Color(1, 1, 1), _col = new THREE.Color();
/**
 * Write one item's matrices: pos/quat from obj (an Object3D proxy), uniform scale k (0 hides it), lit (cond parts),
 * swing angle (radians about the kit pivot, local x axis), swingZ (about z).
 */
export function writeItem(kit, slot, obj, k, lit, swing = 0, swingZ = 0) {
  const ids = kit.items[slot]?.bids;
  if (!ids) return;
  _S.copy(obj.scale).multiplyScalar(k);
  _M.compose(obj.position, obj.quaternion, _S);
  for (let i = 0; i < kit.parts.length; i++) {
    const p = kit.parts[i], bm = p.batch.bm, id = ids[i];
    const show = k > 0 && !((p.cond === 'lit' && !lit) || (p.cond === 'unlit' && lit));
    if (bm.getVisibleAt(id) !== show) bm.setVisibleAt(id, show);
    if (!show) continue;
    let m = _M;
    if (p.swing && kit.pivot && (swing || swingZ)) {
      const pv = kit.pivot;
      _R.makeRotationFromEuler(_eul.set(swing, 0, swingZ));
      _P.makeTranslation(pv.x, pv.y, pv.z).multiply(_R);
      _R.makeTranslation(-pv.x, -pv.y, -pv.z);
      _P.multiply(_R);
      _P.premultiply(_M);
      m = _P;
    }
    bm.setMatrixAt(id, m);
  }
}
const _eul = new THREE.Euler();
/** Instance colour of one item: `c` tints ordinary parts, glow parts get `g` (brightness factor). */
export function writeColor(kit, slot, c, g = 1) {
  const ids = kit.items[slot]?.bids;
  if (!ids) return;
  for (let i = 0; i < kit.parts.length; i++) {
    const p = kit.parts[i];
    if (p.glow) _col.setRGB(g, g, g); else _col.setRGB(c.r, c.g, c.b);
    p.batch.bm.setColorAt(ids[i], _col);
  }
}
export function kitStats() {
  let meshes = 0, visible = 0, tris = 0;
  for (const b of batches.values()) {
    meshes++;
    if (b.bm.visible) visible++;
  }
  for (const k of kits.values()) if (k.batched) for (const p of k.parts) tris += (p.geo.attributes.position.count / 3) * k.items.length;
  return { kits: kits.size, meshes, visible, tris: Math.round(tris) };
}
export function allKits() { return kits; }
