import assert from 'node:assert/strict';
import { MathUtils, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import { wakeDrive } from '../../src/world/broom-wake.js';
import { FlightWake } from '../../src/world/water/flight-wake.js';
import { PressureField } from '../../src/world/water/pressure-field.js';
import { createWater } from '../../src/world/water.js';
import { world } from '../../src/world/ground.js';
import { createDataTexture, createNoiseTexture, DATA_N, refreshDataRect } from '../../src/world/terrain/textures.js';

const deep = () => 6;
function pass(tier = 2, fps = 60, turn = 0) {
  const f = new PressureField(tier,deep);
  const source = { x: 0, z: 0, dx: 0, dz: 1, speed: 28, drive: 1, turn };
  for (let frame = 1; frame <= 2*fps; frame++) {
    source.z = frame*source.speed/fps;
    f.advance(1/fps,frame/fps,source);
  }
  return f;
}

for (const tier of [0,2]) {
  const f = pass(tier);
  assert(f.heightAt(0,54) < -.6 && f.heightAt(1,54) < -.27);
  assert(f.heightAt(-2.8,54) > .12 && f.heightAt(2.8,54) > .12);
  assert.equal(f.heightAt(21,49),0);
  // Two separated crests arrive on the same side of an older cross section.
  assert(f.heightAt(2.7,34) > .12 && f.heightAt(5.4,34) < -.18 && f.heightAt(8,34) > .075);
  // Preserve world positions when scrolling in both directions and both axes.
  const before = [f.heightAt(0,54), f.heightAt(2.7,34)];
  f.moveTo(6,40); f.upload();
  assert.deepEqual([f.heightAt(0,54), f.heightAt(2.7,34)],before);
  f.moveTo(-4,47); f.upload();
  assert.deepEqual([f.heightAt(0,54), f.heightAt(2.7,34)],before);
  // The same point reverses slope and a wave arrives farther out after lift-off.
  const early = f.heightAt(7.2,50);
  for (let i=1;i<=30;i++) f.advance(1/60,2+i/60,null);
  assert(f.heightAt(7.2,50) > early+.07);
  assert(f.heightAt(5.1,50) < -.18);
  for (let i=31;i<=330;i++) f.advance(1/60,2+i/60,null);
  assert.equal(f.heightAt(7.2,50),0);
  assert.equal(f.mapping.z,0);
}

const f30 = pass(2,30), f120 = pass(2,120), bank = pass(2,60,1);
assert(bank.heightAt(-3,54) > bank.heightAt(3,54)+.4);
for (const [x,z] of [[0,54],[2.7,54],[2.7,34],[5.4,34]]) {
  assert(Math.abs(f30.heightAt(x,z)-f120.heightAt(x,z)) < .035);
}

// Compare lake transects in metres at the same 76 cm brush clearance.
// Distances behind a turning rider follow the travelled arc.
function skim(tier,speed,yaw = 0) {
  const field = new PressureField(tier,deep);
  const drive = wakeDrive(speed)*(1-MathUtils.smoothstep(.76,.12,1.65));
  function pose(t) {
    if (!yaw) return { x:0, z:speed*t, dx:0, dz:1 };
    const dx = Math.sin(t*yaw), dz = Math.cos(t*yaw);
    return { x:speed*(1-dz)/yaw, z:speed*dx/yaw, dx,dz };
  }
  for (let i=1; i<=180; i++) field.advance(1/60,i/60,{...pose(i/60), speed,drive,turn:yaw/.8});
  return {field,speed,pose};
}
function pairsAt({field,speed,pose},aft,side) {
  const p = pose(3-aft/speed), heights = [];
  for (let i=0; i<=76; i++) {
    const across = side*i*.25;
    heights.push(field.heightAt(p.x-p.dz*across,p.z+p.dx*across));
  }
  // Two crests must clear 4 cm each, with at least a metre between them
  // and a 2.7 cm dip. This excludes quantisation noise and broad plateaux.
  const peaks = [];
  for (let i=2; i<heights.length-1; i++) {
    if (heights[i]>.04 && heights[i]>=heights[i-1] && heights[i]>heights[i+1]) peaks.push(i);
  }
  const pairs = [];
  for (let i=1; i<peaks.length; i++) {
    const a=peaks[i-1], b=peaks[i], hollow=Math.min(...heights.slice(a+1,b));
    if (b-a>=4 && Math.min(heights[a],heights[b])-hollow>.027) {
      pairs.push({near:a*.25,far:b*.25,first:heights[a],second:heights[b],hollow});
    }
  }
  return pairs;
}
function tailLength(run) {
  let end=0, count=0;
  for (let aft=6; aft<=60; aft++) if (pairsAt(run,aft,1).length && pairsAt(run,aft,-1).length) {
    end=aft; count++;
  }
  return {end,count};
}
assert.equal(tailLength(skim(0,16)).end,0);
for (const tier of [0,1,2]) {
  const cruise = skim(tier,28), sprint = skim(tier,34);
  const a=tailLength(cruise), b=tailLength(sprint);
  assert(b.end-a.end>=17 && b.count-a.count>=12);
  assert(Math.max(...sprint.field.h) <= Math.max(...cruise.field.h)+.015);
  const turn=skim(tier,34,.68), outer=pairsAt(turn,18,1);
  const ridge=outer.find(p=>p.near>4 && p.far-p.near>2 && p.first>.13 && p.second>.13 && p.hollow<-.06);
  assert(ridge && !pairsAt(turn,18,-1).some(p=>p.first>.13 && p.second>.13));
  // Cut the drive at full speed. The detached outside front still moves out
  // across the old bank after the broom has climbed.
  const p=turn.pose(3-18/34), pt=ridge.far+2.5;
  const x=p.x-p.dz*pt,z=p.z+p.dx*pt, before=turn.field.heightAt(x,z);
  for (let i=1; i<=22; i++) turn.field.advance(1/60,3+i/60,null);
  assert(turn.field.heightAt(x,z)>before+.05);
  if (tier===1) {
    const coasting=skim(tier,34);
    const oldZ=3*34-20;
    // The previously emitted front is outside the new source footprint.
    // Its evolution should be identical whether the rider lifts or slows.
    for (let i=1; i<=18; i++) {
      const t=3+i/60;
      sprint.field.advance(1/60,t,null);
      coasting.field.advance(1/60,t,{x:0,z:3*34+16*i/60,dx:0,dz:1,speed:16,drive:.23,turn:0});
    }
    const crossSection=Array.from({length:21},(_,i)=>sprint.field.heightAt(i*.5,oldZ));
    assert(Math.max(...crossSection)>.07 && Math.min(...crossSection)<-.13);
    assert(crossSection.every((height,i)=>Math.abs(height-coasting.field.heightAt(i*.5,oldZ))<.012));
  }
  console.log('tier',tier,'double crests to',a.end,'/',b.end,'m at 28/34 m/s; bank crests',ridge.near,'/',ridge.far,'m from track');
}

// A narrow spit can divide the two halves of the footprint. Neither the
// moving pressure nor the subsequent free wave can jump to the other inlet.
const depth = x => x > .9 && x < 2.4 ? 0 : 4;
const shore = new PressureField(2,depth);
const source = { x: 0, z: 0, dx: 0, dz: 1, speed: 28, drive: 1, turn: -1 };
for(let f=1;f<=120;f++) {
  source.z = 28*f/60;
  shore.advance(1/60,f/60,source);
}
assert(shore.heightAt(0,54) < -.4);
for (let f=1; f<=50; f++) shore.advance(1/60,2+f/60,null);
for (let z=35; z<60; z+=2) for(let x=2.8; x<13; x+=.7) assert.equal(shore.heightAt(x,z),0);

// Actual emitter path: the outer boom of a banking brush should throw droplets
// from its lifted bank. Airborne time and wet re-entry are driven by the surface.
const holder = new Object3D();
const player = { onBroom: true, speed: 28, vel: new Vector3(0,0,28), broom: {holder, yawRate:1.05} };
const game = { scene: new Scene(), player };
const water = { level: 0, depthAt: deep, surfaceAt: (x,z) => wake.field.heightAt(x,z), ripple: () => true };
const wake = new FlightWake(game,water,0,deep);
for(let f=1;f<=120;f++) {
  holder.position.set(0,.22,f*28/60);
  wake.update(1/60,f/60);
}
const outside = wake.drops.filter(d=>d.size && d.pos.x < -2.3);
const inside = wake.drops.filter(d=>d.size && d.pos.x > 2.3);
assert(outside.length > inside.length*2);
assert(outside.some(d=>d.pos.x < -4 && d.pos.y > .3));
const emitted = wake.total;
holder.position.y = 7;
for(let f=1;f<=120;f++) wake.update(1/60,2+f/60);
assert.equal(wake.total,emitted);
assert(wake.rings > 0 && wake.landings > 0);
assert.equal(wake.mesh.count,0);
// Even a wet spray origin is rejected when the path from the bristles crosses land.
wake.tip.set(0,0,0); wake.field.depthAt = depth;
wake.drop(3,0,1,1,1,.04,true);
assert.equal(wake.total,emitted);

// Exercise the game API at the northern shore with the real two-metre terrain
// survey, then drain the lake while its cells are moving.
world.setTrialLake(true);
const terrain = createDataTexture(new Uint16Array(DATA_N*DATA_N*4));
const surveyShore = () => refreshDataRect(terrain,1700,1810,-245,-99);
surveyShore();
const camera = new PerspectiveCamera(), broom = new Object3D();
const dx = -Math.sin(.61), dz = Math.cos(.61);
const rider = { onBroom:true, speed:28, pos:new Vector3(), vel:new Vector3(28*dx,0,28*dz), broom:{holder:broom,yawRate:0} };
const lake = createWater({scene:new Scene(), camera, player:rider, world, quality:{name:'low'}, events:{on(){}}},
  {data:terrain,noise:createNoiseTexture()});
for (let i=0; i<94; i++) {
  const distance = 137+i*28/60;
  rider.pos.set(1854+dx*distance,.35,-312+dz*distance);
  broom.position.copy(rider.pos);
  camera.position.set(rider.pos.x-6*dx,3.3,rider.pos.z-6*dz);
  lake.update(1/60);
  if (i===0) {
    const first = lake.flightWakeStats();
    assert.equal(first.emitted,0);
    assert.equal(first.strength,0);
  }
}
const sampleX = rider.pos.x-2*dx, sampleZ = rider.pos.z-.96-2*dz;
assert.equal(lake.levelAt(sampleX,sampleZ),0);
const contact = lake.flightWakeStats().strength;
assert(contact>.5 && contact<=1);
// The skimming brush throws a plume of soft spray sprites as well as the beads.
const thrown = lake.flightWakeStats();
assert(thrown.plumeEmitted>40 && thrown.plume>0);
assert(lake.surfaceAt(sampleX,sampleZ)<-.20);
const region = lake.uniforms.wPressureRegion.value, map = lake.uniforms.wPressureMap.value.image;
const drainedCell = (Math.round((sampleZ-region.y)*region.z*map.width)*map.width+
  Math.round((sampleX-region.x)*region.z*map.width))*4;
assert(map.data[drainedCell]<120);
world.setTrialLake(false);
surveyShore();
lake.update(1/60);
assert.equal(lake.surfaceAt(sampleX,sampleZ),-Infinity);
assert.equal(lake.flightWakeStats().strength,0);
assert.equal(map.data[drainedCell],128);
assert.equal(map.data[drainedCell+3],0);
// Layer 1 of the pressure texture carries the trail foam copied from the shared wake map
// (alpha of a toroidal RGBA window): a coarser, wider window around the rider.
const foamField = new PressureField(1,deep), N = 16, wakeImage = new Uint8Array(N*N*4);
for (let z=4; z<12; z++) for (let x=5; x<10; x++) wakeImage[(z*N+x)*4+3] = 230;   // a foam strip, x = 5..10 m
foamField.paintFoam(wakeImage,{x:0,y:0,z:N,w:1},8,8);
const fm = foamField.foamMapping, fn = foamField.n, layer1 = fn*fn*4;
const foamCell = (x,z) => foamField.pixels[layer1+(Math.floor((z-fm.y)*fm.z*fn)*fn+Math.floor((x-fm.x)*fm.z*fn))*4+3];
assert(fm.z>0 && foamCell(7.6,8)>60 && foamCell(12,8)===0 && foamCell(7.6,30)===0);
assert(foamField.pixels.slice(0,layer1).every((v,i)=>i%4===3 ? v===0 : true));
foamField.paintFoam(null,{x:0,y:0,z:0,w:1},8,8);
assert(fm.z===0 && foamField.pixels.slice(layer1).every(v=>v===0));
console.log('PASS pressure waves: displacement, two crests, bank load, fixed-step timing, moving window, free propagation, shoreline, spray, plume, trail-foam layer and terrain changes.');
