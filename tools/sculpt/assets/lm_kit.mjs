// Shared shapes and paint for the countryside landmark sculpts (lm_*.mjs; placed by src/world/builders/landmarks.js).
// Not an asset. Build any of them with the landmark driver (vertex colours on every LOD, no atlas: the pieces merge into
// the landmark's own baked meshes, so they may not carry textures):
//
//   SCULPT_THREADS=2 node tools/sculpt/assets/landmarks_lib.mjs tools/sculpt/assets/lm_<name>.mjs [--quick]
//
// Paint is sRGB albedo, a little lighter than the site colour it merges with (the game's cel light and the kit's baked
// AO only darken). Weather: rain and lichen come from local -X (the "west"), moss sits low and on north (-Z) faces.
import * as P from '../sdf.mjs';

export const hex = (h) => P.color(h);
export const mix = P.mix, ss = P.ss, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const fbm = P.fbm, cell = P.cellular, n3 = P.noise3;
const SQ2 = Math.SQRT2;

// ================================================================================================= shapes
/**
 * Box of full size [sx, sy, sz] centred on (0, sy/2, 0) whose four VERTICAL edges are chamfered by `c` (m), all edges
 * rounded by `r`. stop = [y0, y1, len]: a stop-chamfer — full chamfer between y0 + len and y1 - len, running out to a
 * square arris through a short pyramid stop at both ends (the mason's stop on a post).
 */
export function chamferPost([sx, sy, sz], { c = 0.04, r = 0.006, stop = null } = {}) {
  const hx = sx / 2 - r, hy = sy / 2 - r, hz = sz / 2 - r;
  const cAt = !stop ? () => c : (y) => c * clamp((y - stop[0]) / stop[2], 0, 1) * clamp((stop[1] - y) / stop[2], 0, 1);
  return new P.Shape((x, y, z) => {
    const yy = y - sy / 2;
    const qx = Math.abs(x) - hx, qy = Math.abs(yy) - hy, qz = Math.abs(z) - hz;
    const b = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
    const ch = (Math.abs(x) + Math.abs(z) - (sx / 2 + sz / 2 - cAt(y) * 1.4)) / SQ2;
    return Math.max(b, ch);
  }, [-sx / 2, 0, -sz / 2, sx / 2, sy, sz / 2], null, 1.15);
}

/**
 * A moulding run round a rectangle (plinth caps, collars, cornices): profile [[out, y], ...] measured OUT from the
 * rectangle's face (0 = flush with a w x d core, + = proud), turned round all four sides with mitred corners.
 */
export function moulding(w, d, profile, { smooth = 0.004 } = {}) {
  // a square lathe (4 sides, corners on the diagonals) scaled to the rectangle: exact on the faces, mitred at corners
  const half = Math.min(w, d) / 2;
  const prof = [[0, profile[0][1]], ...profile.map(([o, y]) => [(half + o) * SQ2, y]), [0, profile[profile.length - 1][1]]];
  const sq = P.lathe(prof, { sides: 4, smooth }).turn(0, 45, 0);
  if (Math.abs(w - d) < 1e-6) return sq;
  // stretch: model on the square, then lengthen the long axis by shifting the halves apart
  const ex = (w - d) / 2;
  return new P.Shape((x, y, z) => {
    if (ex > 0) { const ax = Math.abs(x); return sq.f(ax > ex ? Math.sign(x) * (ax - ex) : 0, y, z); }
    const az = Math.abs(z); return sq.f(x, y, az > -ex ? Math.sign(z) * (az + ex) : 0);
  }, [-w / 2 - 0.3, sq.b[1], -d / 2 - 0.3, w / 2 + 0.3, sq.b[4], d / 2 + 0.3], null, 1);
}

/** round-headed opening outline in XY: width w, springing at ys, sill at y0 (for P.extrude) */
export function archOutline(w, y0, ys, n = 18) {
  const r = w / 2, o = [[-r, y0], [r, y0], [r, ys]];
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; o.push([Math.cos(a) * r, ys + Math.sin(a) * r]); }
  o.push([-r, ys]);
  return o;
}

/**
 * Stone-slate courses on one roof slope. The slope runs down from the ridge line (y = yr at z = 0) to the eave at
 * z = ze, y = yr - rise, along X from -hl to +hl. Returns a Shape (+z slope; mirror('z') for both). Courses of
 * exposed length `course` (m), slates of mean width `sw`, thickness `t`; each slate a slightly tilted, rounded slab
 * with a jittered width, length and lift, so the lower edges read as a ragged line of individual stones.
 */
export function slateSlope({ yr, ze, rise, hl, over = 0.1, course = 0.11, sw = 0.16, t = 0.026, seed = 1, eaveOut = 0.1 } = {}) {
  const a = Math.atan2(rise, ze), ca = Math.cos(a), sa = Math.sin(a);
  const L = Math.hypot(ze, rise) + eaveOut;              // slope length along the fall incl. the eave overhang
  const nC = Math.ceil(L / course);
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const slate = (u, n, v, k, j) => {
    // slate j of course k: lower edge at u1 (down-slope), top tucked under the course above
    const u1 = Math.min(L, (k + 1) * course) + (hash(k, j) - 0.5) * 0.018;
    const u0 = u1 - course * 2.2;
    const off = (k % 2) * sw * 0.5;
    const v0 = -hl - over + j * sw + off + (hash(j, k + 7) - 0.5) * sw * 0.22, v1 = v0 + sw * (0.92 + hash(k + 3, j) * 0.2) - 0.012;
    const lift = hash(k + 11, j) * 0.005;
    // each slate lies on the two below it: tilted against the slope, its lower edge stands proud by about t
    const tilt = (1.25 + hash(j + 5, k) * 0.4) * t / (u1 - u0);
    const nn = n - lift - (u - u0) * tilt;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, hu = (u1 - u0) / 2, hv = (v1 - v0) / 2, rr = 0.009;
    const qu = Math.abs(u - cu) - hu + rr, qv = Math.abs(v - cv) - hv + rr, qn = Math.abs(nn - t / 2) - t / 2 + rr;
    return Math.hypot(Math.max(qu, 0), Math.max(qv, 0), Math.max(qn, 0)) + Math.min(Math.max(qu, qv, qn), 0) - rr;
  };
  const vMin = -hl - over, vMax = hl + over;
  return new P.Shape((x, y, z) => {
    const ry = y - yr;
    const u = z * ca - ry * sa, n = z * sa + ry * ca, v = x;   // down-slope, out of the slope, along the ridge
    if (u < -0.05 || u > L + 0.05 || v < vMin - 0.05 || v > vMax + 0.05) {
      const du = Math.max(-0.05 - u, 0, u - L - 0.05), dv = Math.max(vMin - 0.05 - v, 0, v - vMax - 0.05);
      return Math.hypot(du, dv, Math.max(Math.abs(n) - 0.1, 0)) + 0.02;
    }
    const k0 = Math.floor(u / course);
    let d = 1e9;
    for (let k = Math.max(0, k0 - 1); k <= Math.min(nC - 1, k0 + 1); k++) {
      const off = (k % 2) * sw * 0.5, j0 = Math.floor((v - vMin - off) / sw);
      for (let j = j0 - 1; j <= j0 + 1; j++) d = Math.min(d, slate(u, n, v, k, j));
    }
    // clip the slates to the slope's extent (verges)
    return Math.max(d, Math.abs(v) - (hl + over), -u - 0.02);
  }, [-hl - over - 0.05, yr - rise - 0.25, -0.1, hl + over + 0.05, yr + 0.12, ze + eaveOut * ca + 0.1], null, 1.3);
}

// ================================================================================================= paint
/** 0..1: how much a point faces the weather (local -X, a little -Z) */
export const weather = (nx, nz) => clamp(-nx * 0.85 - nz * 0.3, 0, 1);

/**
 * Weathered limestone / sandstone. base = [light, dark] hexes; o: { lichen 0..1, moss 0..1, foot (y of the ground
 * line), streak 0..1, worn 0..1 }.
 */
export function paintStone(c, base = ['#d2c9b1', '#b9af96'], o = {}) {
  const { x, y, z, nx, ny, nz, cavity, edge, broad, ao } = c;
  const lichen = o.lichen ?? 0.7, moss = o.moss ?? 0.6, foot = o.foot ?? 0, streak = o.streak ?? 0.6, worn = o.worn ?? 0.6;
  let col = mix(hex(base[0]), hex(base[1]), 0.5 + 0.5 * fbm(x * 1.6, y * 1.6, z * 1.6, 3, 3));
  // stone grain: fine mottle, a few darker sedimentary specks
  col = mix(col, hex(base[1]), ss(0.55, 0.9, 0.5 + 0.5 * fbm(x * 9, y * 9, z * 9, 5, 2)) * 0.35);
  const wx = weather(nx, nz), up = ss(0.35, 0.9, ny), side = 1 - Math.abs(ny);
  // rain streaks below ledges: vertical, on the weather side most
  const st = ss(0.2, 0.6, fbm(x * 11, y * 0.7, z * 11, 9, 3)) * side * (0.3 + 0.7 * wx) * streak;
  col = mix(col, hex('#9b907c'), st * 0.3);
  // lichen: pale yellow-grey crusts with a few orange rosettes, on the weather side and on tops
  const lc = ss(0.36, 0.2, cell(x * 6, y * 6, z * 6, 11)) * ss(-0.1, 0.5, fbm(x * 2.5, y * 2.5, z * 2.5, 12, 2)) * (0.35 + 0.65 * Math.max(wx, up * 0.7));
  col = mix(col, hex('#e4dcae'), lc * 0.6 * lichen);
  const lo = ss(0.16, 0.06, cell(x * 9 + 4, y * 9, z * 9, 13)) * ss(0.2, 0.6, fbm(x * 2, y * 2, z * 2, 14, 2)) * (0.4 + 0.6 * wx);
  col = mix(col, hex('#d39a4c'), lo * 0.5 * lichen);
  // moss: in the joints and hollows, low down, on the damp north side and on flat tops that hold water
  const low = ss(foot + 0.9, foot, y), north = clamp(-nz * 0.7 + 0.3, 0, 1);
  const m = clamp(cavity * 1.2 + Math.max(0, broad) * 0.6, 0, 1) * (0.4 + 0.6 * Math.max(low, north * 0.6)) + up * low * 0.4;
  col = mix(col, hex('#7f9450'), clamp(m, 0, 1) * 0.6 * moss);
  // damp foot
  col = mix(col, hex('#877b66'), ss(foot + 0.35, foot - 0.05, y) * 0.35);
  // worn, pale arrises
  col = mix(col, hex('#e6dfcc'), edge * 0.45 * worn);
  return col;
}

/** split grey-blue roofing slate, soft and pale: per-slate value drift, lichen spots, moss in the laps on the north */
export function paintSlate(c, o = {}) {
  const { x, y, z, nx, ny, nz, cavity, edge } = c;
  const id = fbm(Math.floor(x * 6.5) * 1.7, Math.floor(y * 9) * 2.3, Math.floor(z * 6.5) * 1.3, 21, 1);
  let col = mix(hex(o.light || '#aab0b2'), hex(o.dark || '#8a9196'), 0.5 + 0.5 * id);
  col = mix(col, hex('#a39d8f'), ss(0.3, 0.8, fbm(x * 3, y * 3, z * 3, 22, 2)) * 0.25);           // warm weathering
  const lc = ss(0.3, 0.15, cell(x * 10, y * 10, z * 10, 23)) * ss(0, 0.5, fbm(x * 2, y * 2, z * 2, 24, 2));
  col = mix(col, hex('#d5d2b0'), lc * 0.55);
  const north = clamp(-nz * 0.8 + 0.2, 0, 1);
  col = mix(col, hex('#6f8547'), clamp(cavity * 1.4, 0, 1) * (0.35 + 0.65 * north) * 0.7);
  col = mix(col, hex('#b4b8b6'), edge * 0.35);
  return col;
}

/** weathered timber, silvered on the weather side; grain runs along `axis` ('x' | 'y' | 'z') */
export function paintWood(c, base = ['#9a7c5c', '#6e5640'], axis = 'y') {
  const { x, y, z, nx, nz, cavity, edge } = c;
  const g = axis === 'x' ? fbm(x * 1.5, y * 40, z * 40, 31, 3) : axis === 'z' ? fbm(x * 40, y * 40, z * 1.5, 31, 3) : fbm(x * 40, y * 1.5, z * 40, 31, 3);
  let col = mix(hex(base[0]), hex(base[1]), 0.5 + 0.5 * g);
  col = mix(col, hex('#a8a197'), weather(nx, nz) * 0.45);
  col = mix(col, hex('#3f3328'), clamp(cavity * 1.3, 0, 1) * 0.5);
  col = mix(col, hex('#c4ad8c'), edge * 0.35);
  return col;
}

/** dark wrought iron with a little rust */
export function paintIron(c) {
  const { x, y, z, edge, cavity } = c;
  let col = mix(hex('#3d3a38'), hex('#4f4a45'), 0.5 + 0.5 * fbm(x * 20, y * 20, z * 20, 41, 2));
  col = mix(col, hex('#8a5a36'), ss(0.2, 0.7, fbm(x * 9, y * 9, z * 9, 42, 2)) * 0.35 + cavity * 0.2);
  return mix(col, hex('#77726b'), edge * 0.3);
}

// ================================================================================================= natural stones
const nz3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/**
 * Convex stone from planes [[nx, ny, nz, d], ...] (surface where n.p = d): crisp edges (blend k), rounding over to kSoft
 * where soft(x, y, z) > 0 (the weathered crown); a hard floor cut at y = floor (buried foot) unless floor is null.
 */
export function facetStone(planes, { k = 0.012, kSoft = 0.12, soft = null, floor = 0, bounds } = {}) {
  const PL = planes.map(([a, b, c, d]) => { const l = Math.hypot(a, b, c); return [a / l, b / l, c / l, d]; });
  const n = PL.length, v = new Float64Array(n);
  return new P.Shape((x, y, z) => {
    let m = -1e9;
    for (let i = 0; i < n; i++) { const p = PL[i]; v[i] = x * p[0] + y * p[1] + z * p[2] - p[3]; if (v[i] > m) m = v[i]; }
    let s = 0; for (let i = 0; i < n; i++) s += Math.exp((v[i] - m) / k);
    let d = m + k * Math.log(s);
    const w = soft ? soft(x, y, z) : 0;
    if (w > 0) { let s2 = 0; for (let i = 0; i < n; i++) s2 += Math.exp((v[i] - m) / kSoft); d += (m + kSoft * Math.log(s2) - kSoft * 0.35 - d) * Math.min(1, w); }
    return floor == null ? d : Math.max(d, floor - y);
  }, bounds || [-2, floor ?? -2, -2, 2, 6, 2], null, 1.15);
}
/** `count` planes round an ellipsoid of half-sizes `size` centred on c, each cut at 0.8..1.0 of its support */
export function stonePlanes(rnd, { size, c = [0, 0, 0], count = 10, cut = [0.82, 1.0], noUnder = true, extra = [] }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const yy = 1 - 2 * (i + 0.5) / count, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), a = i * 2.39996 + rnd() * 0.9;
    let n = nz3([Math.cos(a) * rr + (rnd() - 0.5) * 0.35, yy + (rnd() - 0.5) * 0.3, Math.sin(a) * rr + (rnd() - 0.5) * 0.35]);
    if (noUnder && n[1] < -0.05) n = nz3([n[0], -0.05 * Math.hypot(n[0], n[2]), n[2]]);
    const sup = Math.hypot(size[0] * n[0], size[1] * n[1], size[2] * n[2]);
    out.push([n[0], n[1], n[2], sup * (cut[0] + (cut[1] - cut[0]) * rnd()) + n[0] * c[0] + n[1] * c[1] + n[2] * c[2]]);
  }
  return out.concat(extra);
}
/** plane through `at` with outward normal n */
export const plane = (n, at) => { const u = nz3(n); return [u[0], u[1], u[2], u[0] * at[0] + u[1] * at[1] + u[2] * at[2]]; };
/** cup marks: shallow round hollows pecked into a face (prehistoric rock art), list of [x, y, z, r] */
export function cupMarks(body, list) {
  let s = body;
  for (const [x, y, z, r] of list) s = s.softCut(P.sphere(r).scale([1, 1, 0.5]).at(x, y, z), 0.01);
  return s;
}

/** sandstone of the old circles: warm, sun-bleached on top, heavy lichen on the weather side, moss low */
export const SARSEN = ['#ddcaa9', '#c3ad89'];
export const GRIT = ['#c9c4b8', '#aaa498'];   // grey moorland grit (stone circle, dolmen, cairns)

/**
 * Moss cushions: each a cluster of small domes, mostly sunk into the stone so only a low, lumpy cap shows. at = list of
 * [x, y (the stone's surface there), z, size]. Returns one Shape (give it the moss part, then softAdd it, k ~ 0.02).
 */
export function mossCushions(rnd, at) {
  let out = null;
  for (const [x, y, z, s] of at) {
    const n = 3 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, r = rnd() * s * 0.8, rr = s * (0.35 + rnd() * 0.35);
      const b = P.ellipsoid([rr, rr * 0.55, rr]).at(x + Math.cos(a) * r, y - rr * 0.25, z + Math.sin(a) * r);
      out = out ? out.add(b) : b;
    }
  }
  return out;
}
/** moss paint: olive in the hollows, fresher green on the domes' crowns */
export function paintMoss(c) { return mix(mix(hex('#7f9350'), hex('#a5b56a'), ss(0.2, 0.9, c.ny) * 0.6 + c.edge * 0.4), hex('#4f6233'), c.cavity * 0.7); }

/** the height of `shape`'s top surface over (x, z), marching down from y0 (null if it misses) */
export function dropTo(shape, x, z, y0) {
  let y = y0;
  for (let i = 0; i < 400; i++) {
    const d = shape.f(x, y, z);
    if (d < 1e-3) return y;
    y -= Math.max(d / (shape.lip || 1), 1e-3);
    if (y < y0 - 20) return null;
  }
  return null;
}
