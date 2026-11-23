// Fast checks for the forces that cannot be verified from a single rendered frame.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { BroomAirTrail } from '../../src/world/broom-air-trail.js';
import { advanceBroomMotion } from '../../src/player/broom-motion.js';

const ground = { heightAt: () => 0, isReserved: () => false };
const flow = new BroomAirTrail();
const point = new Vector3();
const wind = new Vector3();
function layTrail(speed, turn=0, wet=false) {
  flow.clear();
  const velocity = new Vector3(0,0,speed);
  for (let f=0; f<=120; f++) {
    flow.record(point.set(0,.45,speed*f/60),velocity,{yawRate:turn},0,wet,f/60,ground);
  }
}
function sample(x,y,z,time=2) {
  return flow.sample(point.set(x,y,z),time,wind).clone();
}
layTrail(28);
const port = sample(-1,.25,54), starboard = sample(1,.25,54);
assert(port.x < 0 && starboard.x > 0);
assert(Math.abs(port.x+starboard.x)<1e-6);
assert(sample(0,.8,54).y < 0 && sample(1.8,.8,54).y > 0);
const freshCarry=sample(-.7,.9,54).z;
assert(freshCarry > 14 && freshCarry < 28);
assert(sample(-.7,.9,54,2.8).z < freshCarry*.4);
// Climbing away from a live section leaves it behind. Teleporting does not.
for(let f=1; f<=32; f++) flow.record(point.set(0,6,56+28*f/60),new Vector3(0,0,28),{yawRate:0},0,false,2+f/60,ground);
assert(sample(-.7,.9,54,2.54).length()>0);
flow.record(point.set(0,6,200),new Vector3(0,0,28),{yawRate:0},0,false,2.55,ground);
assert.equal(sample(-.7,.9,54,2.55).length(),0);
layTrail(28);
assert.equal(sample(0,10,54).length(),0);
assert.equal(sample(0,.8,54,5).length(),0);
assert.equal(sample(-1,0,54).y,0);
layTrail(28,1);
assert(sample(-1,.25,54).length() > sample(1,.25,54).length());
layTrail(16);
assert(sample(-1,.25,30).length() < port.length());
assert(flow.sections[(flow.next-1+flow.sections.length)%flow.sections.length].bare === false);
layTrail(28,0,true);
assert(flow.sections[(flow.next-1+flow.sections.length)%flow.sections.length].bare);
assert(flow.sections[(flow.next-1+flow.sections.length)%flow.sections.length].wet);
// A particle's last nearest section (hint) finds the same air as a full search of the trail;
// shedding is unsteady but bounded.
layTrail(28);
const full = sample(-1,.25,54), slot = flow.hit;
assert(slot >= 0 && flow.sample(point.set(-1,.25,54),2,wind,slot).distanceTo(full) < 1e-9);
assert(flow.sections.slice(0,flow.count).every(s=>s.gust>.85 && s.gust<1.15) && !flow.sections[0].wet);

function flyFor(rate,rise,boosting=true) {
  const b = {speed:16,gust:0,acceleration:0,heading:0,course:0,bank:0,
    yawRate:0,strafe:0,boosting,riseRate:rise};
  for(let i=0;i<rate;i++) advanceBroomMotion(b,{mx:0,my:1},.75,16,28,1/rate);
  return b;
}
const banked=flyFor(60,0);
assert(banked.speed>24 && banked.speed<28);
assert(banked.heading>banked.course && banked.course>0 && banked.bank<0);
assert(Math.abs(flyFor(30,0).speed-flyFor(120,0).speed)<.25);
assert(flyFor(60,-7,false).speed>16 && flyFor(60,7,false).speed<16);
banked.boosting=false;
for (let i=0;i<15;i++) advanceBroomMotion(banked,{mx:0,my:1},.75,16,28,1/60);
assert(banked.speed>24, 'the rider coasts when releasing boost');
for (let i=0;i<180;i++) advanceBroomMotion(banked,{mx:0,my:-1},.75,16,28,1/60);
assert.equal(banked.speed,-3.5);
console.log('PASS: bank-to-turn, carried speed, braking, dive energy, ground image and counter-rotating vortices');
