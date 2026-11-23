import assert from 'node:assert/strict';
import { Scene, ShaderLib, Vector3 } from 'three';
import { MeadowWakeField } from '../../src/world/flora/wake-field.js';
import { flowerPatch } from '../../src/world/flora/meadowFlowers.js';
import { createSlipstream } from '../../src/world/flora/slipstream.js';
import { BroomAirTrail } from '../../src/world/broom-air-trail.js';

const section = { x:0, z:2, dx:0, dz:1, drive:1, clearance:.45, turn:0, speed:28, time:1 };
const field = new MeadowWakeField();
const grows = (x,z) => x < 3;
let lost=0;
const release = (x,z,side,force,loss) => { lost+=loss; };
field.sweep(0,-3,section,grows,release);
const firstLoss=lost;
const left=field.at(-1.5,.5,1), right=field.at(1.5,.5,1);
assert(left.x<-.6 && right.x>.6 && left.flat>.6 && left.strip>.60);
assert.equal(field.at(3.5,.5,1).strip,0);
lost=0;
field.sweep(0,-3,{...section,time:2},grows,release);
assert(lost<firstLoss*.62);
// The laid channel stays readable for a while and rises again over 20-40 s.
assert(field.at(-1.5,.5,8).flat>left.flat*.6);
assert(field.at(-1.5,.5,30).flat<left.flat*.5);
assert.equal(field.at(-1.5,.5,45).flat,0);
// Stripped flowers regrow over one to two minutes.
assert(field.at(-1.5,.5,8).strip>left.strip*.8);
assert(field.at(-1.5,.5,38).strip<field.at(-1.5,.5,8).strip);
assert(field.at(-1.5,.5,100).strip<field.at(-1.5,.5,38).strip*.5);
assert.equal(field.at(-1.5,.5,130).strip,0);
field.refresh(0,0,2);
const before=field.texture.image.data.slice();
field.refresh(400,400,3);
assert(!field.texture.image.data.some((n,i)=>i%4===3 && n>0));
field.refresh(0,0,4);
assert(field.texture.image.data.some((n,i)=>i%4===3 && n>0 && before[i]>0));
const bank=new MeadowWakeField();
bank.sweep(0,-3,{...section,turn:1},()=>true);
assert(bank.at(-2.5,.5,1).strip>bank.at(2.5,.5,1).strip);
const cruise=new MeadowWakeField();
cruise.sweep(0,-3,{...section,drive:.38,speed:16},()=>true);
assert(cruise.at(-1.5,.5,1).strip<left.strip*.5);
// A faster pass lays a wider, deeper channel that takes longer to recover.
const fast=new MeadowWakeField();
fast.sweep(0,-3,section,()=>true);
assert(cruise.at(-3.5,.5,1).flat<fast.at(-3.5,.5,1).flat*.7);
assert(fast.at(-1.5,.5,25).flat/fast.at(-1.5,.5,1).flat>cruise.at(-1.5,.5,25).flat/cruise.at(-1.5,.5,1).flat+.1);
// Over water the same pass leaves foam (freshness 1 → 0 over ~20-40 s) and strips nothing.
const lake=new MeadowWakeField();
lake.sweep(0,-3,{...section,wet:true,bare:true},()=>false,null,()=>true);
assert(lake.at(0,.5,1).foam>.8 && lake.at(0,.5,1).strip===0 && lake.at(0,.5,1).flat===0);
assert(lake.at(0,.5,10).foam<lake.at(0,.5,1).foam*.45 && lake.at(0,.5,10).foam>.25);
assert.equal(lake.at(0,.5,60).foam,0);
assert.equal(new MeadowWakeField().at(0,.5,1).foam,0);
lake.refresh(0,0,1.1);
assert(lake.bounds.z>0 && lake.texture.wrapS===1000);

for(const far of [true,false]){
  const geo=flowerPatch(far), shapes=geo.getAttribute('aBlade2');
  const ranksByHead=new Map(),heads=geo.getAttribute('aBlade3'),stems=geo.getAttribute('aBlade');
  for(let i=0;i<shapes.count;i++) if(shapes.getX(i)===2){
    const key=[stems.getX(i),stems.getY(i),heads.getX(i),heads.getY(i),heads.getZ(i)].join('/');
    if(!ranksByHead.has(key)) ranksByHead.set(key,new Set());
    ranksByHead.get(key).add(shapes.getZ(i));
  }
  for(const ranks of ranksByHead.values()) assert.equal(ranks.size,far?5:6);
  const indices=geo.index.array;
  for(let i=0;i<indices.length;i+=3) if(shapes.getX(indices[i])===2) {
    assert.equal(shapes.getZ(indices[i]),shapes.getZ(indices[i+1]));
    assert.equal(shapes.getZ(indices[i]),shapes.getZ(indices[i+2]));
  }
}

function fly(surface, state='broom', clearance=.5) {
  const world={heightAt:()=>surface==='sand'?1:8, slopeAt:()=>surface==='cliff'?.9:0, isWater:()=>surface==='water',
    roadDist:()=>surface==='road'?1:30, riverDist:()=>80, isReserved:()=>surface==='bare'};
  const broom={yawRate:.4,airTrail:new BroomAirTrail()}, pos=new Vector3(1800,8+clearance,-330);
  const vel=new Vector3(0,0,28), wind=new Vector3(), G={quality:{name:'med'},world,scene:new Scene(),time:{t:0},
    terrain:{noiseTexture:{image:{width:1,height:1,data:[155,100,130,255]}},scorchLayer:{at:()=>surface==='burn'?.8:0}},
    player:{pos,vel,broom,state}};
  const slip=createSlipstream(G);
  for(let f=0;f<85;f++){
    G.time.t=f/60;pos.z+=28/60;
    if(state==='broom') broom.airTrail.record(pos,vel,broom,8,surface==='water',G.time.t,world);
    slip.update(1/60,wind);
  }
  return {slip,G,wind};
}
const live=fly('meadow');
assert(live.slip.mesh.count>=35);
assert(live.slip.stats.petals>35);
const flakes=live.slip.mesh,normals=flakes.geometry.getAttribute('normal');
assert(flakes.material.isMeshLambertMaterial && flakes.receiveShadow && flakes.material.userData.look.trans>.5);
const nx=Array.from({length:normals.count},(_,i)=>normals.getX(i));
assert(nx.length>=25 && Math.max(...nx)-Math.min(...nx)>.45);
const shader={uniforms:{},vertexShader:ShaderLib.lambert.vertexShader};
flakes.material.onBeforeCompile(shader);
assert(shader.vertexShader.includes('viewMatrix*modelMatrix*instanceMatrix[3]'));
assert(shader.vertexShader.includes('transformed*=smoothstep(.80,1.65,eyeDepth)'));
for(const kind of ['road','water','bare','sand','cliff','burn']) assert.equal(fly(kind).slip.mesh.count,0);
assert.equal(fly('meadow','ground').slip.mesh.count,0);
assert.equal(fly('meadow','broom',12).slip.mesh.count,0);
live.G.player.state='ground';
for(let f=0;f<300;f++){live.G.time.t+=1/60;live.slip.update(1/60,live.wind);}
assert.equal(live.slip.mesh.count,0);
console.log('PASS meadow wake: split blades, speed and bank, local shedding, regrowth, rolling window, ranked petals and surface masks.');
