// The brush presses water down at its centre and lifts two shoulders. A passing
// pressure source leaves the free surface to propagate and shed spray on its own.
import * as THREE from 'three';
import { flowAt } from './maps.js';
import { wakeDrive, wakeTurn } from '../broom-wake.js';
import { PressureField } from './pressure-field.js';
import { WakeSpray } from './wake-spray.js';

const smooth = THREE.MathUtils.smoothstep;
const UP = new THREE.Vector3(0, 1, 0);

export class FlightWake {
  constructor(G, water, tier, depthAt) {
    this.G = G; this.water = water;
    this.field = new PressureField(tier, depthAt);
    this.source = {};
    this.capacity = [60, 100, 152][tier]; this.density = [.61, .84, 1][tier];
    this.drops = Array.from({length:this.capacity}, () => ({pos:new THREE.Vector3(), vel:new THREE.Vector3(), size:0, age:0}));
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4),
      new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.82, depthWrite:false, fog:true}), this.capacity);
    this.mesh.name = 'water:skimming droplets';
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = -6;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); G.scene.add(this.mesh);
    this.plume = new WakeSpray(G, tier);
    this.stamp = new THREE.Object3D(); this.tip = new THREE.Vector3(); this.unit = new THREE.Vector3();
    this.current = new THREE.Vector2();
    this.air = new THREE.Vector3();
    this.next = 0; this.seed = 945; this.accum = 0; this.ringCooldown = 0;
    this.total = 0; this.landings = 0; this.rings = 0; this.impacts = 0; this.strength = 0; this.clearance = 0;
  }
  random() { this.seed = (Math.imul(this.seed,1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  // Surface sampling is deferred until a drop is within reach of the crests. A drop
  // which lands on the bank simply stops; only an actual wet landing creates a ring.
  stepDrops(dt) {
    let count = 0;
    this.ringCooldown = Math.max(0, this.ringCooldown - dt);
    for (const d of this.drops) {
      if (!d.size) continue;
      d.age += dt;
      if (d.entrained && d.age < .55 && this.G.player?.broom?.airTrail) {
        this.G.player.broom.airTrail.sample(d.pos, this.G.time.t, this.air);
        const response = (1-Math.exp(-1.7*dt))*(1-d.age/.55);
        d.vel.addScaledVector(this.air,response);
      }
      d.pos.x += d.vel.x*dt; d.pos.z += d.vel.z*dt;
      d.pos.y += d.vel.y*dt - 4.905*dt*dt; d.vel.y -= 9.81*dt;
      const drag = Math.exp(-1.05*dt); d.vel.x *= drag; d.vel.z *= drag;
      const nearSurface = d.vel.y < 0 && d.pos.y < this.water.level + 1.6;
      const surface = nearSurface ? this.water.surfaceAt(d.pos.x,d.pos.z) : -Infinity;
      if (d.age > 2.35 || (nearSurface && (!Number.isFinite(surface) || d.pos.y <= surface))) {
        if (Number.isFinite(surface) && d.vel.y < 0 && d.pos.y <= surface) {
          this.landings++;
          if (!this.ringCooldown && this.water.ripple(d.pos.x,d.pos.z,Math.min(.39,.1+d.size*3))) {
            this.rings++; this.ringCooldown = .085;
          }
        }
        d.size = 0; continue;
      }
      this.unit.copy(d.vel).normalize();
      this.stamp.position.copy(d.pos); this.stamp.quaternion.setFromUnitVectors(UP,this.unit);
      const r = d.size*Math.min(1,.48+d.age*16);
      this.stamp.scale.set(r, r*Math.min(3.6,1.2+d.vel.length()*.32),r);
      this.stamp.updateMatrix(); this.mesh.setMatrixAt(count++,this.stamp.matrix);
    }
    this.mesh.count = count; this.mesh.visible = count>0;
    this.plume.update(dt, this.G.player?.broom?.airTrail, this.G.time?.t ?? 0);
    if (count) {
      this.mesh.instanceMatrix.needsUpdate=true;
      this.mesh.material.color.setHex((this.G.env?.veil??0)>.62?0x8cbacb:0xe3f4ff);
    }
  }
  drop(x,z,vx,vy,vz,radius,entrained=false) {
    const surface = this.water.surfaceAt(x,z);
    if (!Number.isFinite(surface) || this.water.depthAt(x,z)<.055) return;
    if (entrained) {
      const ox = x-this.tip.x, oz = z-this.tip.z;
      const steps = Math.ceil(Math.hypot(ox,oz)/.55);
      for (let i = 1; i < steps; i++) {
        if (this.field.depthAt(this.tip.x+ox*i/steps,this.tip.z+oz*i/steps)<.055) return;
      }
    }
    const d=this.drops[this.next]; this.next=(this.next+1)%this.capacity;
    d.pos.set(x,surface+.014,z); d.vel.set(vx,vy,vz); d.size=radius; d.age=0; d.entrained=entrained; this.total++;
  }
  impact(pos, power=1) {
    const depth=this.water.depthAt(pos.x,pos.z);
    if (depth<=.045) return false;
    const drive=Math.min(1.5,Math.max(.18,power))*smooth(depth,0,.60);
    const n=Math.ceil((12+30*drive)*this.density);
    const phase=this.random()*Math.PI*2;
    for (let j=0;j<n;j++) {
      const a=phase+Math.PI*2*(j+this.random()*.7)/n, r=this.random();
      const dx=Math.cos(a), dz=Math.sin(a), w=(.55+2.45*r)*drive;
      this.drop(pos.x+dx*r*.22,pos.z+dz*r*.22,w*dx,(1.95+this.random()*3.35)*drive,w*dz,.018+r*.037);
    }
    this.water.ripple(pos.x,pos.z,.3+.86*drive); this.impacts++; return true;
  }
  update(dt,t,refreshDepth) {
    const P=this.G.player;
    this.stepDrops(dt); this.strength=0;
    // The lower, outer bristle envelope expressed in the flight holder's axes.
    if (P?.onBroom && P.broom.holder.visible) {
      const tip=P.broom.holder.localToWorld(this.tip.set(0,-.09,-.96));
      const surface=this.water.surfaceAt(tip.x,tip.z);
      const current=flowAt(tip.x,tip.z,this.current);
      const vx=P.vel.x-current.x, vz=P.vel.z-current.y;
      const speed=Math.hypot(vx,vz);
      this.clearance=Number.isFinite(surface)?tip.y-surface+this.field.heightAt(tip.x,tip.z):Infinity;
      if (Number.isFinite(surface) && this.clearance<1.65 && speed>1.0 && P.speed>1.0) {
        const speedK=wakeDrive(speed), shore=smooth(this.water.depthAt(tip.x,tip.z),.065,.83);
        const turn=wakeTurn(P.broom);
        const drive=speedK*(1-smooth(this.clearance,.12,1.65))*shore;
        this.strength=drive;
        if (drive>.012) {
          const dx=vx/speed,dz=vz/speed;
          const src=this.source; // reused every frame (no per-frame object)
          src.x=tip.x; src.z=tip.z; src.dx=dx; src.dz=dz; src.speed=speed; src.drive=drive; src.turn=turn;
          const spray=speedK*(1-smooth(this.clearance,.30,1.36))*shore;
          // The plume grows faster than the beads: a dive or a boost throws a tall sheet.
          this.plume.spray(dt,tip,surface,dx,dz,vx,vz,spray*(.55+.65*speedK),turn);
          this.accum+=dt*(26+102*speedK)*spray*this.density;
          while(this.accum>=1) {
            this.accum--;
            const side=this.random()<.5+.30*turn?1:-1, r=this.random();
            const outside = side*turn, sideForce = 1 + .53*outside;
            // Tear off the shedding shoulders aft and outboard of the bristles.
            // A loaded outside bank throws a longer, higher sheet in a turn.
            const aft = (.28 + this.random()**1.5*3.9)*spray;
            const spread = side*((.60+drive*1.12)*sideForce + aft*.19 + .48*(r-.5));
            const outward = side*(1.35 + 4.2*r + 2.3*drive)*Math.sqrt(spray)*sideForce;
            const carry = (.8+this.random()*2.6)*spray;
            this.drop(tip.x-dx*aft-dz*spread,tip.z-dz*aft+dx*spread,current.x-dz*outward+dx*carry,
              .48+(1.35+3.25*this.random())*Math.sqrt(spray)*sideForce,current.y+dx*outward+dz*carry,
              .014 + r*r*(.017+.037*spray),true);
          }
        }
      }
    } else this.clearance=Infinity;
    if(this.strength<=.012)this.accum=0;
    this.field.advance(dt,t,this.strength>.012?this.source:null,refreshDepth);
  }
  stats(){
    let crest=0, trough=0;
    if(this.field.remaining) for(const h of this.field.h) { crest=Math.max(crest,h); trough=Math.min(trough,h); }
    return {clearance:Number.isFinite(this.clearance)?+this.clearance.toFixed(3):null,strength:+this.strength.toFixed(3),
      crest:+crest.toFixed(3),trough:+trough.toFixed(3),droplets:this.mesh.count,plume:this.plume.live,plumeEmitted:this.plume.emitted,emitted:this.total,returned:this.landings,rings:this.rings,impacts:this.impacts};
  }
}
