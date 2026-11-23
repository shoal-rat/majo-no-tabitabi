import { smoothstep } from '../core/util.js';
import { wakeDrive, wakeTurn } from './broom-wake.js';

// Short, world-fixed sections of the air displaced by the brush. Cross sections
// open and sink as they age. The two softened vortex cores spin in opposite directions.
const LIFE = 2.5;
export class BroomAirTrail {
  constructor() {
    this.sections = Array.from({ length: 48 }, () => ({}));
    this.clear();
  }
  clear() {
    this.next = 0;
    this.count = 0;
    this.lastX = NaN;
    this.lastZ = NaN;
  }
  record(pos, velocity, broom, surface, wet, time, world) {
    const last = this.sections[(this.next + this.sections.length - 1) % this.sections.length];
    const speed = Math.hypot(velocity.x, velocity.z);
    // Compare consecutive player positions. A continuous climb stops shedding
    // new sections, but the air already over the meadow must finish its roll.
    if (this.count && (time < last.time || Math.hypot(pos.x-this.lastX,pos.z-this.lastZ)>14)) this.clear();
    this.lastX=pos.x;
    this.lastZ=pos.z;
    const drive = wakeDrive(speed);
    const clearance = pos.y - surface;
    if (drive < .025 || clearance > 5) return;
    const dx = velocity.x/speed, dz = velocity.z/speed;
    const x = pos.x - .8*dx, z = pos.z - .8*dz;
    const spacing = 1.2 + 1.1*drive;
    if (this.count && time-last.time < .16 && Math.hypot(x-last.x,z-last.z) < spacing) return;
    const bare = wet || surface-world.heightAt(x,z)>1.8 || world.isReserved(x,z,0);
    // fill the ring slot in place (no per-section object)
    const s = this.sections[this.next];
    s.x = x; s.z = z; s.dx = dx; s.dz = dz; s.time = time; s.bare = bare; s.wet = !!wet; s.drive = drive; s.speed = speed;
    // Unsteady shedding: the strength gusts along the trail, so no two stretches are alike.
    s.gust = 1 + .09*Math.sin(time*7.3 + 1.7*Math.sin(time*2.9)) + .05*Math.sin(time*17.1);
    s.surface = surface; s.clearance = clearance; s.y = pos.y + .48; s.turn = wakeTurn(broom); s.half = spacing * .65;
    this.next = (this.next + 1) % this.sections.length;
    this.count = Math.min(this.count + 1, this.sections.length);
  }
  // Downwash between the cores, lift outside them, and an outward sweep
  // underneath. Read at the particle's current world position every frame.
  // hint = ring slot found for this particle last frame (this.hit): only the
  // sections around it and the newest few are searched, not the whole trail.
  sample(pos, time, out, hint = -1) {
    out.set(0,0,0);
    const ring = this.sections.length;
    let nearest = null, best = 36, lateral = 0;
    this.hit = -1;
    const near = hint >= 0 && this.count > 14;
    const span = near ? 15 : this.count;
    for (let n=0; n<span; n++) {
      // newest four, then the eleven around the hint
      const slot = near ? (n < 4 ? (this.next-1-n+ring)%ring : (hint-5+(n-4)+ring)%ring) : (this.next-1-n+ring)%ring;
      if (!near && n >= this.count) break;
      const back = (this.next-1-slot+ring)%ring;
      if (back >= this.count) continue;
      const s = this.sections[slot];
      const age = time-s.time;
      if (age >= LIFE) { if (!near) break; continue; }
      if (age < 0 || Math.abs(pos.y-s.y)>5) continue;
      const x=pos.x-s.x, z=pos.z-s.z;
      const side=z*s.dx-x*s.dz;
      const end=Math.max(0, Math.abs(x*s.dx+z*s.dz)-s.half);
      const dist=side*side+end*end;
      if (dist < best) { best=dist; nearest=s; lateral=side; this.hit=slot; }
    }
    if (!nearest) return out;
    const s=nearest, age=time-s.time;
    const open=1-Math.exp(-3.2*age);
    const deck=1-smoothstep(.7,4,s.clearance);
    const width=.48+open*(.6+1.15*s.drive)+deck*age*.50;
    const axisY=Math.max(s.surface+.58,s.y-.63*open);
    const dy=pos.y-axisY, imageY=pos.y+axisY-2*s.surface;
    const core=.30+.30*open+.14*age;
    const fade=(1-smoothstep(.6,LIFE,age))*(1-smoothstep(8,36,best));
    const circulation=(.85+5.8*s.drive)*fade*(s.gust??1);
    let across=0, up=0;
    for (let side=-1; side<=1; side+=2) {
      const gain=1+.36*s.turn*side;
      const offset=lateral-side*width*gain;
      const spin=side*gain*circulation/(offset*offset+dy*dy+core*core);
      // The opposite image vortex below the deck cancels the normal velocity
      // at the surface and sweeps caught petals outward along the ground.
      const imageSpin=side*gain*circulation/(offset*offset+imageY*imageY+core*core);
      across+=imageSpin*imageY-spin*dy;
      up+=(spin-imageSpin)*offset;
    }
    // Young cores carry flakes forward with the broom. The pocket opens and
    // loses its axial pull before the residual swirl has finished turning.
    const coreDistance=Math.abs(lateral)-width;
    const carry=s.speed*(.30+.66*s.drive)*fade*
      Math.exp(-2.4*age*age-.35*(coreDistance*coreDistance+dy*dy));
    return out.set(s.dx*carry-s.dz*across, up, s.dz*carry+s.dx*across);
  }
}
