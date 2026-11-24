// 晶傀 the crystal golem's sculpted body (round art-figures; tools/sculpt/assets/golem_rock.mjs): facet-kit boulders rigid
// on the mon_golem_big skeleton, so every clip, the scale and the hit box stay those of combat/types.js golem. Drawn as
// the type's `primitive` body (combat/enemy.js): its own cel stone (vertex colours, cool shade, cyan spirit rim — what
// the 'stone' tint gave the old golem), eyes and crystals in the golem's glow; the death keeps the stone crumble
// (userData.creature.style). GolemShards is the crystal crown the armour break hides. Off (?sculpt=0, a list without
// 'figures', ?crv=1, the GLB missing): the old body with the 'stone' tint.
import { G } from '../core/game.js';
import { glow, hookMaterial } from '../core/mats.js';

export const GOLEM_BODY = 'sculpt_golem_rock';
const tuned = new WeakMap();   // loaded material -> the one the golem draws with (shared by every golem)

/** true when the sculpted golem is in use (read when a golem spawns) */
export const rockGolemOn = () => !!G.sculpt?.on?.('figures') && !!G.assets?.ready?.(GOLEM_BODY);

/** a fresh golem body (clone of the sculpt, materials tuned once), or null */
export function makeRockGolem() {
  const m = G.assets?.model?.(GOLEM_BODY);
  if (!m) return null;
  m.traverse((o) => {
    if (!o.isMesh || o.userData.outline) return;
    const src = o.material;
    let t = tuned.get(src);
    if (!t) {
      const n = src?.name || '';
      if (/^Eye/.test(n)) t = glow(0xc8f4ff, 3);
      else if (/^Crystal/.test(n)) t = glow(0x9fd8ff, 2.2);
      else {
        t = src.clone(); t.userData.shared = true;
        // stone, not fur: a lighter cool shade and a little more of the body in the light (the 'fur' preset is k 0.52,
        // terminator 0.48: the pale facet stone read as charcoal)
        t.celU?.uShadeTint?.value.setRGB(0.72, 0.76, 0.92);
        if (t.celU?.uCelP) t.celU.uCelP.value.x = 0.42;
        t.setSpirit?.(0x6ff3ff, 0.32);
        // the creature path lights this body at about half of what a plain lit material gets (measured: white albedo
        // reads mid grey), which turned the pale painted stone charcoal; lift the albedo so it reads as the pale grey-violet
        // stone it is painted (the old golem got the same kind of lift: 'stone' tint colour + glow ramp)
        t.color.setRGB(1.85, 1.82, 2.0);
        hookMaterial(t);
      }
      tuned.set(src, t);
    }
    o.material = t;
    if (t.isMeshBasicMaterial) o.castShadow = false;
  });
  m.userData.creature = { style: 'stone' };
  return m;
}
