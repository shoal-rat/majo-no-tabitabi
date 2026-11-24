// The sitting stone at the road shrine (gameplay/errands-props.js makeSeat; the witch of the stray-stars errand sits on
// it): a low field stone from exact planes (facet kit) with a broad top worn flat and smooth by sitting, bevelled edges
// that catch the light, a pale lichen bloom on the shoulders, a moss cushion along the back. Origin under the sitter's
// hips, top at 0.44 m, the stone reaching back from there (as the old one: ~0.95 x 0.6 m, centre at z -0.12).
import { Mesh, prng, fbm, ss, planeD, bevelPiece, emitPiece, hullPlanes, stonePaint, mossCap, FLOOR } from './props_activity_lib.mjs';

export const PARTS = {
  stone: { name: 'SeatStone', surface: 'rock', look: { rim: 0.22, wrap: 0.3 } },
  moss: { name: 'Moss', surface: 'none', look: { rim: 0.3, wrap: 0.5 } },
};
const L = [{ edge: 0.03, seat: 0.05, corners: true, moss: { rings: 4, segs: 14 } }, { edge: 0.04, seat: 0.06, corners: false, moss: { rings: 2, segs: 9 } }, { edge: 0, seat: 0, corners: false, moss: null }];

function buildLod(lod) {
  const o = L[lod], m = new Mesh(), rnd = prng(1907);
  const c = [0, 0.2, -0.12];
  const pl = hullPlanes(rnd, { size: [0.5, 0.32, 0.33], c, count: 11, cut: [0.86, 1], tilt: 0.3 });
  pl.push(planeD([0.02, 1, -0.04], 0.44, 'seat'));         // the worn seat, a hair lower at the front
  pl.push(planeD([0, 0.55, 1], 0.44 * 0.55 + 0.13, 'face'));   // the front shoulder under the knees, cut back
  pl.push(FLOOR(-0.04));
  const width = (e) => {
    if (e.ka === 'floor' || e.kb === 'floor') return 0;
    if (e.corner) return lod === 0 ? o.edge * 0.7 : 0;
    if (e.ka === 'seat' || e.kb === 'seat') return o.seat;    // the seat's rim: rounded by use
    if (lod === 1 && e.angle < 0.55) return 0;
    return o.edge;
  };
  const pc = bevelPiece(pl, width, { corners: o.corners, minAngle: lod ? 0.4 : 0.2 });
  const base = stonePaint({ H: 0.48, seed: 31, warm: 0.4 });
  emitPiece(m, pc, (q) => {
    const v = base(q);
    if (q.kind === 'seat') return [v[0] * 1.07, v[1] * 1.06, v[2] * 1.04];   // polished pale where people sit
    const lichen = ss(0.55, 0.75, fbm(q.p[0] * 9, q.p[1] * 9, q.p[2] * 9, 4, 2) * 0.5 + 0.5) * ss(0.1, 0.6, q.n[1]);
    return [v[0] * (1 + 0.12 * lichen), v[1] * (1 + 0.14 * lichen), v[2] * (1 + 0.04 * lichen)];
  }, { part: 'stone' });
  if (o.moss) mossCap(m, [pl], { at: [0.06, -0.3], R: 0.17, T: 0.03, seed: 9, ...o.moss, part: 'moss' });
  return m;
}

export default {
  name: 'seat_stone', parts: PARTS, lods: 3, views: [[30, 25], [200, 30]], sheetSize: 300,
  notes: 'The sitting stone at the road shrine (gameplay/errands-props.js makeSeat): facet-kit stone with a worn flat seat at 0.44 m, bevelled edges, lichen bloom, moss along the back. Origin under the sitter\'s hips; neutral stone (the game tints it).',
  build: buildLod,
};
