// folk_cap — a soft wool cap with a short peak for the City of Magic townsmen (builders/mage-folk.js: rigid on the head
// bone of the baked crowd body). Origin = the point where the cap's inside meets the top of the head, +Z = the face side.
// INTENT
//  silhouette: a flat soft crown pulled forward over a short stiff peak; a button on top.
//  big forms: the crown / the peak / the band.
//  the eye rests on: the stitched panels meeting at the button, the peak's edge.
//  wear: the crown's front edge rubbed pale, the band darker with sweat.
//  must NOT look like: a beret, a helmet, a baseball cap.
//   SCULPT_THREADS=2 node tools/sculpt/assets/_smallprops.mjs tools/sculpt/assets/folk_cap.mjs [--quick]
import * as P from '../sdf.mjs';
import { FAR, C, mix, ss } from './containers_lib.mjs';

const R = 0.103, BY = -0.055;

export default {
  name: 'folk_cap', id: 'sculpt_folk_cap',
  voxel: 0.0014, lods: [1800, 600, 220], farFrom: 2, farVoxel: 1.8,
  ground: null, aoRange: 0.04, cavity: [0.003, 0.012], creaseAngle: 40,
  materials: { wool: { name: 'cloth', surface: 'none', look: { rim: 0.3 } } },
  notes: 'Wool cap with a short peak for the City of Magic townsmen (eight stitched panels, button, band, peak). Vertex colours on every LOD, no textures: drawn instanced and posed to the head bone on the CPU (builders/mage-folk.js).',

  build() {
    const far = FAR();
    // crown: a flattened dome, wider than the band and pulled forward, hollow below
    let crown = P.ellipsoid([R + 0.022, 0.055, R + 0.03]).at(0, BY + 0.03, 0.012)
      .cut(P.ellipsoid([R - 0.004, 0.062, R - 0.002]).at(0, BY + 0.0, 0))
      .cut(P.box([0.5, 0.2, 0.5]).at(0, BY - 0.1, 0));
    if (!far) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      crown = crown.groove([[0, BY + 0.086, 0.012], [dx * 0.07, BY + 0.07, 0.012 + dz * 0.075], [dx * 0.118, BY + 0.03, 0.012 + dz * 0.125]], { width: 0.0022 });
    }
    const band = P.lathe([[R + 0.002, BY - 0.002], [R + 0.002, BY + 0.02], [R - 0.008, BY + 0.02], [R - 0.008, BY - 0.002]], { smooth: 0.0015 });
    const button = P.ellipsoid([0.012, 0.007, 0.012]).at(0, BY + 0.088, 0.012);
    // the peak: a stiff half-disc under the crown's front
    const peak = P.ellipsoid([0.085, 0.006, 0.07]).at(0, BY + 0.004, R + 0.012).turn(-8, 0, 0)
      .intersect(P.box([0.3, 0.1, 0.12]).at(0, BY, R + 0.06));
    let all = crown.add(button).part('fc_crown', { mat: 'wool', paint: woolPaint('#5a5148', '#3e3832') });
    all = all.add(band.part('fc_band', { mat: 'wool', paint: woolPaint('#3a332e', '#2a2420') }));
    all = all.add(peak.part('fc_peak', { mat: 'wool', paint: woolPaint('#4a433c', '#2e2924') }));
    return all;
  },
};

function woolPaint(light, dark) {
  return (c) => {
    let col = mix(C(light), C(dark), 0.5 + 0.5 * P.fbm(c.x * 60, c.y * 60, c.z * 60, 3, 2));
    col = mix(col, C('#8a8076'), c.edge * 0.35);
    return mix(col, C('#1e1a16'), c.cavity * 0.6);
  };
}
