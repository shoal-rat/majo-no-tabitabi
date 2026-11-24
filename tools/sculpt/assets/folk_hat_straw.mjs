// folk_hat_straw — a market woman's / carter's straw sun hat for the City of Magic residents (builders/mage-folk.js:
// rigid on the head bone of the baked crowd body). Origin = the point where the crown's inside meets the top of the
// head (hair), +Y up, +Z = the face side.
// INTENT
//  silhouette: a low rounded crown on a wide brim that dips a little at front and back, a ribbon band tied at the side.
//  big forms: the brim / the crown / the band.
//  the eye rests on: the coiled straw rows (sewn plait), the ribbon's bow and tails, the brim's pale edge.
//  wear: sun-bleached on top, darker under the brim, the edge a little ragged.
//  must NOT look like: a witch hat, a bowl, a sombrero.
//   SCULPT_THREADS=2 node tools/sculpt/assets/_smallprops.mjs tools/sculpt/assets/folk_hat_straw.mjs [--quick]
import * as P from '../sdf.mjs';
import { pickMats, strawPaint, FAR, C, mix, ss } from './containers_lib.mjs';

const BR = 0.205, CR = 0.098, CH = 0.085, BY = -0.06;   // brim radius, crown radius / height, brim level under the origin

export default {
  name: 'folk_hat_straw', id: 'sculpt_folk_hat_straw',
  voxel: 0.0016, lods: [2200, 700, 260], farFrom: 2, farVoxel: 2.0,
  ground: null, aoRange: 0.05, cavity: [0.003, 0.014], creaseAngle: 40,
  materials: { straw: { name: 'straw', surface: 'thatch', look: { scale: 0.8 } }, ribbon: { name: 'cloth', surface: 'none', look: { rim: 0.3 } } },
  notes: 'Straw sun hat for the City of Magic residents (sewn plait crown and brim, ribbon band with a bow). Vertex colours on every LOD, no textures: drawn instanced and posed to the head bone on the CPU (builders/mage-folk.js).',

  build() {
    const far = FAR();
    // crown: a rounded dome open below (a shell), brim: a thin disc that rolls down a little front and back
    const crownOut = P.lathe([[0, BY + CH + 0.02], [CR * 0.7, BY + CH + 0.012], [CR * 0.97, BY + CH - 0.025], [CR, BY], [0, BY]], { smooth: 0.006 });
    const crown = crownOut.cut(P.ellipsoid([CR - 0.01, CH + 0.005, CR - 0.012]).at(0, BY - 0.002, 0));
    let brim = P.lathe([[0, BY - 0.004], [BR, BY - 0.002], [BR, BY + 0.004], [0, BY + 0.005]], { smooth: 0.002 })
      .warp((x, y, z, o) => { const r = Math.hypot(x, z) / BR; o[1] = -0.026 * r * r * (Math.abs(z) / Math.max(1e-6, Math.hypot(x, z))) ** 2 - 0.008 * r; });   // offset: dips front and back
    brim = brim.cut(P.cylinder(CR - 0.012, 0.2).at(0, BY - 0.1, 0));
    let hat = crown.add(brim);
    // the sewn plait: rings round the crown, a spiral of rows on the brim
    if (!far) hat = hat.strata({ spacing: 0.011, depth: 0.0016, width: 0.45, axis: 'y' }).warp((x, y, z, o) => {
      const r = Math.hypot(x, z);
      if (r > CR + 0.004 && y < BY + 0.02) o[1] = 0.0011 * Math.sin(r * 560 + Math.atan2(x, z) * 0.5);   // the brim's plait rows
    });
    let all = hat.part('fh_straw', { mat: 'straw', paint: hatPaint });
    // ribbon band round the crown's foot, a bow with two tails on the left side
    const band = P.lathe([[CR + 0.004, BY + 0.004], [CR + 0.003, BY + 0.03], [0, BY + 0.03], [0, BY + 0.004]], { smooth: 0.002 }).cut(P.cylinder(CR - 0.02, 0.1).at(0, BY - 0.02, 0));
    let bow = P.ellipsoid([0.012, 0.028, 0.03]).at(CR + 0.012, BY + 0.018, 0.022).turn(0, 0, 0)
      .add(P.ellipsoid([0.012, 0.028, 0.03]).at(CR + 0.012, BY + 0.018, -0.022))
      .add(P.sphere(0.012).at(CR + 0.012, BY + 0.018, 0));
    if (!far) bow = bow.add(P.tube([[CR + 0.012, BY + 0.01, 0.005], [CR + 0.02, BY - 0.02, 0.012], [CR + 0.03, BY - 0.05, 0.02]], 0.006, { aspect: 3, up: [1, 0, 0] }))
      .add(P.tube([[CR + 0.012, BY + 0.01, -0.005], [CR + 0.022, BY - 0.022, -0.016], [CR + 0.03, BY - 0.045, -0.03]], 0.006, { aspect: 3, up: [1, 0, 0] }));
    all = all.add(band.add(bow).part('fh_ribbon', { mat: 'ribbon', paint: (c) => mix(mix(C('#b8463c'), C('#e07a64'), c.edge * 0.5 + ss(0.2, 0.9, c.ny) * 0.2), C('#4a1a18'), c.cavity * 0.6) }));
    return all;
  },
};

function hatPaint(c) {
  let col = strawPaint({ light: '#f2d088', dark: '#d0a45e', seed: 8, cav: '#7a5a30' })(c);
  col = mix(col, C('#fae6b2'), ss(0.4, 0.95, c.ny) * 0.3);             // sun-bleached top
  col = mix(col, C('#a07a44'), ss(-0.3, -0.9, c.ny) * 0.3);            // under the brim
  return col;
}
