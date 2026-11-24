// The water trial's lily bud (gameplay/wilds-pages.js MECH.bud): a bronze lily bud on a bronze stem in a dry stone basin;
// water fills the basin and the bud opens. Replaces fourteen boxes, a cylinder stem and five stretched spheres.
//   mech_basin      fourteen fitted kerb blocks round a 2.7 m circle (a low ring wall, tops dressed and worn), a dry
//                   cracked mud floor, moss on the north blocks
//   mech_bud_stem   the bronze stem: a flared foot, a node collar, five sepals cupping the bud's base
//   mech_bud_petal  ONE bronze petal (the game hinges five of them at the bud's base and opens them): a long cupped
//                   blade with a raised midrib, its tip flaring out
// INTENT
//  silhouette: closed, a tall pointed bud of five overlapping bronze petals on a slim stem; open, a lily flower.
//  the eye rests on: the petals' green-and-gold patina and midribs, the glowing heart (the game's), the sepals.
//  wear: verdigris on the up-facing and sheltered parts, polished gold on the petal edges and ribs.
// Coordinates: origin = ground at the basin's centre; the stem from y 0 to 1.0; the petal: hinge at its origin, along +Y
// (1.2 m), cupped toward -Z (the bud's axis), the game turns each about Y and tilts it about X.
//   node tools/sculpt/assets/mech_bud.mjs
import {
  prng, plane, Mesh, mossCap, piece, ringBlockPlanes, addGeo, lathe, sheetGeo, mat4,
  carvedStone, bronzePaint, writeAsset, sheet, setLod, col, mixc, ss, fbm,
} from './mech_lib.mjs';

function basin(lod) {
  setLod(lod);
  const mesh = new Mesh(), rnd = prng(171);
  const paint = carvedStone({ H: 1, seed: 171, warm: 0.4, base: 0.64, lichen: 0.5 });
  const bev = lod === 0 ? 0.03 : 0.04;
  const MOSS = lod === 0 ? { rings: 3, segs: 12 } : { rings: 2, segs: 8 };
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i * 360) / n + (rnd() - 0.5) * 3, a1 = ((i + 1) * 360) / n + (rnd() - 0.5) * 3;
    const top = 0.3 + rnd() * 0.12;
    const am = ((a0 + a1) / 2) * Math.PI / 180;
    const extra = [plane([(rnd() - 0.5) * 0.12, 1, (rnd() - 0.5) * 0.12], [Math.sin(am) * 2.7, top, Math.cos(am) * 2.7])];
    const P = piece(mesh, ringBlockPlanes(a0, a1, 2.45, 2.98, -0.6, top + 0.1, { gap: 0.01, floor: true, lean: 0.12, extra }), { bevel: (e) => (e.ka === 'floor' || e.kb === 'floor' ? 0 : e.corner ? bev * 0.7 : bev * (e.mid[1] > top - 0.1 ? 1.4 : 1)), paint, minAngle: 0.1 });
    if (Math.cos(am) < -0.2) mossCap(mesh, [P.planes], { at: [Math.sin(am) * 2.72, Math.cos(am) * 2.72], R: 0.2, T: 0.03, seed: 180 + i, ...MOSS });
  }
  // the dry floor: a shallow dish of cracked mud, a little higher at the rim
  const mud = (c) => {
    const { p } = c, r = Math.hypot(p[0], p[2]);
    const cell = Math.abs(Math.sin(p[0] * 9 + 1.3 * Math.sin(p[2] * 7)) * Math.sin(p[2] * 9 + 1.3 * Math.sin(p[0] * 7)));
    let v = mixc(col('#8a7258'), col('#6e5a44'), 0.5 + 0.5 * fbm(p[0] * 2, 0, p[2] * 2, 7, 2));
    v = mixc(v, col('#4a3c2e'), ss(0.06, 0.0, cell) * 0.6);
    return mixc(v, col('#5a6a3e'), ss(2.0, 2.45, r) * 0.35);
  };
  addGeo(mesh, lathe([[0, 0.035], [1.2, 0.045], [2.1, 0.07], [2.5, 0.1], [2.52, -0.1]], lod === 0 ? 40 : 24), { paint: mud, part: 'stone' });
  return mesh;
}

const patina = bronzePaint({ seed: 191, green: 0.5, metal: '#d0aa62', dark: '#9a7c48', verd: '#86c8b0' });
function stem(lod) {
  setLod(lod);
  const mesh = new Mesh(), seg = lod === 0 ? 14 : 9;
  addGeo(mesh, lathe([[0, -0.05], [0.22, -0.05], [0.24, 0.0], [0.14, 0.04], [0.085, 0.09], [0.07, 0.2], [0.062, 0.44], [0.085, 0.46], [0.088, 0.5], [0.062, 0.52], [0.055, 0.8], [0.07, 0.9], [0.11, 0.98], [0.0, 1.02]], seg), { paint: patina, part: 'bronze' });
  // five sepals between the petals' places, cupping the bud's foot
  for (let k = 0; k < 5; k++) {
    const yaw = (k + 0.5) / 5 * Math.PI * 2;
    const g = sheetGeo((u, v) => {
      const vv = v * 2 - 1, r = 0.1 + 0.12 * Math.sin(Math.PI * Math.min(1, u * 0.9)) + 0.05 * u, ph = vv * 0.5 * (1 - u * 0.7);
      return [Math.sin(ph) * r, 0.86 + u * 0.28, Math.cos(ph) * r + 0.03 * u * u];
    }, lod === 0 ? 8 : 4, lod === 0 ? 4 : 2, () => 0.018);
    addGeo(mesh, g, { paint: patina, part: 'bronze', matrix: mat4([0, 0, 0], [0, yaw, 0]) });
  }
  return mesh;
}
function petal(lod) {
  setLod(lod);
  const mesh = new Mesh();
  const r = (u) => 0.05 + 0.21 * Math.sin(Math.PI * Math.pow(u, 0.8)) * (1 - 0.25 * u);
  const f = (u, v) => {
    const vv = v * 2 - 1, phi = vv * 0.9 * (1 - 0.92 * Math.pow(u, 3)), R = r(u);
    // the midrib stands out a little along v = 0
    const rib = 0.012 * Math.exp(-vv * vv * 40) * Math.sin(Math.PI * u);
    return [Math.sin(phi) * (R + rib), 1.2 * u, Math.cos(phi) * (R + rib) - 0.05 + 0.08 * Math.pow(u, 4)];
  };
  const paint = (c) => {
    const base = patina(c);
    const edge = ss(0.55, 0.95, Math.abs(Math.atan2(c.p[0], c.p[2] + 0.05)) / 0.9);
    return mixc(base, col('#e2b868'), edge * 0.5);
  };
  addGeo(mesh, sheetGeo(f, lod === 0 ? 18 : 9, lod === 0 ? 10 : 5, (u) => 0.03 * (1 - 0.6 * u)), { paint, part: 'bronze' });
  return mesh;
}

async function main() {
  const out = [];
  for (const [name, fn, note] of [
    ['mech_basin', basin, 'Water page trial: basin of fourteen fitted kerb blocks round the lily bud (dressed worn tops, moss on the north blocks) with a dry cracked mud floor.'],
    ['mech_bud_stem', stem, 'Water page trial: bronze stem of the lily bud (flared foot, node collar, five sepals), green-gold patina.'],
    ['mech_bud_petal', petal, 'Water page trial: one bronze lily petal (cupped blade, raised midrib, flared tip; hinge at the origin): the game hinges five round the bud and opens them.'],
  ]) {
    const lods = [fn(0), fn(1)];
    const r = await writeAsset(name, lods, { source: 'tools/sculpt/assets/mech_bud.mjs (node, facet kit + three.js generators)', notes: note + ' Vertex colours on every LOD.', extras: { family: 'page_sites', mech: 'bud' } });
    console.log(name, 'tris', r.tris.join(' / '), 'KB', r.kb);
    out.push({ mesh: lods[0], az: 25, el: 25, label: name });
  }
  // the closed and the open bud assembled as the game does
  for (const [label, tilt] of [['closed', 0.12], ['open', 1.17]]) {
    const m = new Mesh();
    m.append(stem(0));
    const p = petal(0);
    for (let k = 0; k < 5; k++) {
      const yaw = (k / 5) * Math.PI * 2, c = Math.cos(tilt), s = Math.sin(tilt), cy = Math.cos(yaw), sy = Math.sin(yaw);
      m.append(p, { p: (q) => { let [x, y, z] = q; [y, z] = [y * c - z * s, y * s + z * c]; [x, z] = [x * cy + z * sy, -x * sy + z * cy]; return [x, y + 1.0, z]; }, n: (q) => { let [x, y, z] = q; [y, z] = [y * c - z * s, y * s + z * c]; [x, z] = [x * cy + z * sy, -x * sy + z * cy]; return [x, y, z]; } });
    }
    out.push({ mesh: m, az: 25, el: 15, label });
  }
  await sheet('mech_bud', out, { cols: 5, ts: 320 });
}
main().catch((e) => { console.error(e); process.exit(1); });
