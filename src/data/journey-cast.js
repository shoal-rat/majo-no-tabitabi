// The journey's story cast: each person's model (story/episode-cast.js spawns them) and every anchor (JOURNEY_ANCHORS)
// the story puts them at. core/assets.js loads the ones standing near the save's position right after her own clothes,
// so the people around her are there when play starts.
import { JOURNEY_ANCHORS } from './journey-map.js';

export const CAST_ASSETS = {
  father: 'char_elaina_father',
  mother: 'char_elaina_mother',
  exam: 'char_exam_witch',
  fran: 'char_fran',
  saya: 'char_saya',
  innkeeper: 'char_innkeeper',
};
// keep in step with episode-cast.js homes(): a missing anchor only costs a later load, never a wrong placement
const CAST_PLACES = {
  father: ['home', 'farewell'],
  mother: ['home', 'farewell'],
  exam: ['townWitch'],
  fran: ['franDoor', 'franLesson', 'franTrial'],
  saya: ['gate', 'roof', 'innDesk', 'innRoom', 'practice'],
  innkeeper: ['shop'],
};

/** Models of the cast members who can stand within `r` metres of (x, z), nearest first. */
export function castNear(x, z, r = 450) {
  const out = [];
  for (const [who, places] of Object.entries(CAST_PLACES)) {
    let d = Infinity;
    for (const p of places) { const a = JOURNEY_ANCHORS[p]; if (a) d = Math.min(d, Math.hypot(a.x - x, a.z - z)); }
    if (d <= r) out.push([d, CAST_ASSETS[who]]);
  }
  return out.sort((a, b) => a[0] - b[0]).map((e) => e[1]).filter((a, i, l) => l.indexOf(a) === i);
}
