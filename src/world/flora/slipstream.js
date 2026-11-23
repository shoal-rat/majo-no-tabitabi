import * as THREE from 'three';
import { BELL } from '../../data/bellcrown.js';
import { hookMaterial } from '../../core/mats.js';
import { farmWeight } from '../terrain/paddyLayout.js';
import { MeadowWakeField, wakeFieldSize } from './wake-field.js';

const smooth=THREE.MathUtils.smoothstep;

// Sample the same noise bands, pigments and foothold restrictions as the planted
// flower shader. A stamp surveys only the few square metres it crosses.
function meadowSurvey(G, bed) {
  const world=G.world, noise=G.terrain.noiseTexture.image;
  function noiseAt(x,z,scale,offset,channel) {
    const ix=THREE.MathUtils.euclideanModulo(Math.floor((x/scale+offset)*noise.width),noise.width);
    const iz=THREE.MathUtils.euclideanModulo(Math.floor((z/scale+offset)*noise.height),noise.height);
    return noise.data[(iz*noise.width+ix)*4+channel]/255;
  }
  const open=new THREE.Color(), regional=new THREE.Color(), shade=new THREE.Color();
  const rgb=(r,g,b)=>new THREE.Color(r,g,b);
  const corn=rgb(.055,.28,.85), white=rgb(.93,.96,.99), deep=rgb(.18,.21,.76), blue=rgb(.48,.68,.98);
  const yellow=rgb(.93,.72,.10), ivory=rgb(.95,.93,.84), red=rgb(.83,.16,.08);
  const violet=rgb(.42,.26,.78), pink=rgb(.86,.52,.70), sunset=rgb(.91,.22,.18), amber=rgb(.96,.54,.15);
  const cyan=rgb(.43,.74,.82), moon=rgb(.58,.48,.86);
  return (x,z)=>{
    if(world.isWater(x,z) || world.isReserved(x,z,0))return false;
    if(Math.abs(x-(BELL.boxX??BELL.x))<BELL.halfW && Math.abs(z-(BELL.boxZ??BELL.z))<BELL.halfD)return false;
    const h=world.heightAt(x,z), road=world.roadDist(x,z), river=world.riverDist(x,z);
    if(h<.55 || road<3.7 || river<10 || (G.terrain.scorchLayer?.at(x,z,'burn')??0)>.35) return false;
    const slope=world.slopeAt?.(x,z)??0;
    if(slope>.68 || farmWeight(x,z,h,slope,road,river)>.24) return false;
    if(h>86 && (world.mountainMask?.(x,z)??0)>.25) return false;
    const groundScars=G.flora?.grass?.uniforms.gCraters.value;
    if(groundScars) for(let i=0;i<groundScars.length;i++){ // a loop, not .some(): no closure per surveyed texel
      const c=groundScars[i];
      if(c.w>.4 && (x-c.x)**2+(z-c.y)**2<c.z*c.z)return false;
    }
    const broad=noiseAt(x,z,128,.31,1), detail=noiseAt(x,z,20,.42,2);
    const sand=.9+1.8*noiseAt(x,z,57,.77,2);
    if(river>40 && h<sand+.62)return false;
    const band=Math.sin((x*.78+z*.62)*.175+2.5*Math.sin((-x*.61+z*.79)*.069)+2.6*broad);
    const ribbon=smooth(band+(broad-.5)*1.4+(detail-.5)*.8,-.55,.64);
    const wet=1-smooth(river,17,33), forest=smooth(broad,.47,.70);
    const islands=noiseAt(x,z,15,.74,0);
    bed.cover=smooth(.14+.70*ribbon+.31*islands+.18*wet-.10*forest,.10,.73);
    bed.height=h;
    const patch=smooth(noiseAt(x,z,52,.12,0),.38,.62);
    const patchy=.5+.5*Math.sin(x*.0061+1.7*Math.sin(z*.0047))*Math.sin(z*.0053-.8+1.3*Math.sin(x*.0029));
    const east=smooth(x,700,1300),mid=smooth(x,-450,100)*(1-east),west=1-smooth(x,-1300,-800);
    open.copy(corn).lerp(white,smooth(patch,.16,.67));
    shade.copy(deep).lerp(blue,patch);
    const damp=Math.max(.72*forest,wet);
    open.lerp(shade,damp);
    bed.color.copy(open);
    bed.color.lerp(regional.copy(yellow).lerp(ivory,smooth(patch,.30,.75)),east*smooth(patchy,.25,.65));
    bed.color.lerp(regional.copy(red).lerp(ivory,smooth(patch,.45,.85)),mid*smooth(patchy,.45,.80)*.85);
    bed.color.lerp(regional.copy(violet).lerp(pink,smooth(patch,.35,.70)),west*smooth(patchy,.30,.70));
    bed.color.lerp(open,damp);
    const veil=world.veilAt?.(x,z)??0, night=smooth(veil,.56,.86);
    const dusk=Math.max(0,smooth(veil,.05,.34)-night);
    bed.color.lerp(regional.copy(sunset).lerp(amber,patch),dusk*(1-.83*wet));
    bed.color.lerp(regional.copy(cyan).lerp(moon,patch),night);
    return true;
  };
}

// The flight of the flakes (a seeded weight, grip and flutter per flake, the pocket of air that
// rides behind the rider, skittering where the wake still rakes the ground) is adapted from
// Petalwake (src/fx/particles.js, src/fx/windfx.js), MIT License, Copyright (c) 2026 Jacob Miller;
// the full notice is reproduced at the top of src/world/flora/wake-field.js.

// Grass bits torn off the blades in the wake (never reddened, never grey).
const BITS=[0x8fb45e,0x7aa24c,0xa9c46e,0x6b9443,0xb8c77a];

export function createSlipstream(G) {
  const q=G.quality||{};
  const tier=q.mobile?0:q.name==='low'?1:q.name==='med'?2:3;
  // Enough flakes that speed reads at a glance: a low cruise sheds a clear stream, a boost a dense one.
  const capacity=[260,380,640,1000][tier];
  const rate=[.55,.6,.8,1][tier];
  const geo=new THREE.BufferGeometry();
  // Smooth spoon-shaped lobes, a tapering base and a small crease along the rib.
  const rings=[[-.58,.012],[-.30,.17],[.02,.31],[.32,.39],[.54,.24]];
  const positions=[],colors=[],indices=[];
  for(let row=0;row<rings.length;row++){
    const [z,width]=rings[row],t=(z+.58)/1.12;
    for(let col=0;col<5;col++){
      const u=col*.5-1,edge=u*u;
      const x=width*u+.045*t*t;
      const y=.15*edge*Math.sin(Math.PI*t*.82)+.11*t*t+.055*u*t-.027*Math.exp(-9*edge)*Math.sin(Math.PI*t);
      const tip=t**5*(.12*edge+.07*Math.exp(-12*edge));
      positions.push(x,y,z-tip);
      const pigment=.80+.18*t+.04*edge-.035*Math.exp(-12*edge);
      colors.push(pigment+.02*t,pigment,pigment+.02*edge);
      if(row && col){
        const k=row*5+col;
        indices.push(k-6,k-1,k,k-6,k,k-5);
      }
    }
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  material.name='flora:loose-petals';
  material.userData.surface='none';
  material.userData.look={trans:.76,rim:.10,wrap:.61,shadowTint:.35};
  const flutter={value:0}, glow={value:.3};
  material.onBeforeCompile=shader=>{
    shader.uniforms.petalTime=flutter;
    shader.uniforms.petalGlow=glow;
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nuniform float petalTime;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        // The render pass owns viewMatrix. Chase, capture and reflection cameras
        // each thin the petals crossing their own near plane.
        float eyeDepth=-(viewMatrix*modelMatrix*instanceMatrix[3]).z;
        float tip=clamp((position.z+.58)/1.12,0.,1.);
        float pulse=petalTime*5.8+4.1*instanceColor.r+11.*instanceColor.g;
        transformed.y+=tip*tip*(.053*sin(pulse+tip)+.10*position.x*sin(pulse*1.37));
        transformed*=smoothstep(.80,1.65,eyeDepth);`);
    // Thin petals carry their own light: in the shade of the rider they stay
    // soft and coloured instead of turning grey.
    if(shader.fragmentShader) shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nuniform float petalGlow;')
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*petalGlow;');
  };
  material.customProgramCacheKey=()=>'loose-petals-lit2';
  hookMaterial(material);
  const mesh=new THREE.InstancedMesh(geo,material,capacity);
  mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
  mesh.name='flora:airborne-leaves';
  mesh.receiveShadow=!q.mobile;   // phones: unshadowed flakes (a cheaper fragment for hundreds of small cards)
  mesh.frustumCulled=false;
  mesh.count=0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(mesh);
  const pool=Array.from({length:capacity},()=>({
    pos:new THREE.Vector3(),vel:new THREE.Vector3(),color:new THREE.Color(),age:0,life:0,petal:true,size:0,
    seed:0,rx:0,ry:0,rz:0,sx:0,sy:0,sz:0,settled:false,floor:0,nextGroundCheck:0,hint:-1,nx:0,nz:0,lift:0,
  }));
  const field=new MeadowWakeField(wakeFieldSize(q)), bed={height:0,cover:0,color:new THREE.Color()};
  const survey=meadowSurvey(G,bed);
  const water=(x,z)=>!!G.world?.isWater?.(x,z);
  const pose=new THREE.Object3D(),air=new THREE.Vector3(),lastPos=new THREE.Vector3();
  const stats={petals:0,leaves:0,airborne:0};
  const area=field.cell*field.cell;
  let cursor=0,petalCredit=0,leafCredit=0,lastTime=-Infinity,previous=null,stamp=null,budget=0;
  const last={x:0,z:0,time:0,bare:false,wet:false};
  let hasPosition=false;

  function loft(x,z,side,pressure,petal) {
    if(budget<=0) return;
    budget--;
    const p=pool[cursor];
    cursor=(cursor+1)%capacity;
    const drive=stamp.drive, power=pressure*(1+.30*stamp.turn*side);
    const r=Math.random(), j=field.cell*.5;
    p.age=0; p.petal=petal; p.settled=false; p.hint=-1;
    p.seed=Math.random();
    p.life=petal?2.8+1.4*Math.random()+.6*drive:1.7+1.1*Math.random();
    p.size=petal?.11+.08*Math.random()+.02*drive:.16+.12*Math.random();
    p.rx=Math.random()*6.283; p.ry=Math.random()*6.283; p.rz=Math.random()*6.283;
    p.sx=(Math.random()-.5)*9; p.sy=(Math.random()-.5)*7; p.sz=(Math.random()-.5)*9;
    p.nx=-stamp.dz*side; p.nz=stamp.dx*side; p.lift=power;
    p.pos.set(x+(Math.random()-.5)*2*j,bed.height+(petal?.30+.45*Math.random():.12+.28*Math.random()),z+(Math.random()-.5)*2*j);
    p.floor=bed.height+.025;
    p.nextGroundCheck=.15+.12*Math.random();
    // Torn loose with little speed of their own: the vortices take them from here.
    // A few are flicked up and out hard enough to miss the cores altogether.
    const carry=stamp.speed*(.12+.30*drive)*(.4+.6*r), flick=Math.random()<.14?2+3*Math.random():0;
    const out=(.6+2.6*power)*Math.random()+flick;
    p.vel.set(stamp.dx*carry+p.nx*out+(Math.random()-.5)*1.6,
      .8+3.2*power*Math.random()+flick,stamp.dz*carry+p.nz*out+(Math.random()-.5)*1.6);
    if(petal) {
      p.color.copy(bed.color).multiplyScalar(.96+.14*Math.random());
      stats.petals++;
    } else {
      p.color.setHex(BITS[(Math.random()*BITS.length)|0]);
      stats.leaves++;
    }
  }
  function shed(x,z,side,pressure,loss) {
    // Petals: the share this pass takes off the flowers on each square metre.
    // Grass bits: torn off the blades wherever the downwash rakes the meadow.
    // (both rise with speed less steeply than the stamped pressure: a low cruise already sheds a
    // clear stream, a boost covers more ground with a wider swath and fills the air)
    const p=Math.sqrt(pressure);
    petalCredit+=(loss*4+p*.8)*bed.cover*area*rate;
    leafCredit+=p*area*(1-.4*bed.cover)*3.2*rate;
    while(petalCredit>=1){loft(x,z,side,pressure,true);petalCredit--;}
    while(leafCredit>=1){loft(x,z,side,pressure,false);leafCredit--;}
  }
  function update(dt,wind) {
    const p=G.player;
    if(!p) return;
    const time=G.time.t,trail=p.broom?.airTrail;
    const jump=hasPosition && p.pos.distanceToSquared(lastPos)>18**2;
    if(jump || time<lastTime) {
      for(const q of pool) q.age=q.life;
      previous=null; lastTime=-Infinity; petalCredit=leafCredit=0;
    }
    budget=Math.ceil(capacity*.12);
    if(p.state==='broom' && trail?.count) {
      const sections=trail.sections;
      for(let i=trail.count;i>0;i--) {
        const s=sections[(trail.next-i+sections.length)%sections.length];
        if(s.time<=lastTime || time-s.time>.30)continue;
        lastTime=s.time;
        const linked=previous && previous.wet===!!s.wet && (!previous.bare || previous.wet) && s.time-previous.time<.4 &&
          Math.hypot(s.x-previous.x,s.z-previous.z)<9;
        stamp=s;
        const back=Math.min(1.4,s.half??1);
        field.sweep(linked?previous.x:s.x-s.dx*back,linked?previous.z:s.z-s.dz*back,s,survey,shed,water);
        last.x=s.x; last.z=s.z; last.time=s.time; last.bare=s.bare; last.wet=!!s.wet; previous=last; // reused, no per-section object
      }
    } else previous=null;
    lastPos.copy(p.pos);
    hasPosition=true;
    field.refresh(p.pos.x,p.pos.z,time);
    flutter.value=time;
    glow.value=.42*(1-.65*smooth(G.env?.veil??0,.45,.85));
    let visible=0;
    const rv=p.state==='broom'?p.vel:null;
    for(const q of pool) {
      if(q.age>=q.life)continue;
      q.age+=dt;
      if(!q.settled) {
        if(trail) { trail.sample(q.pos,time,air,q.hint); q.hint=trail.hit??-1; } else air.set(0,0,0);
        const ws=Math.hypot(air.x,air.y,air.z);
        // No two flakes fly alike: from one seed each gets its weight, its grip on the
        // wake and its flutter (how hard and how fast it side-slips as it tumbles).
        const sd=q.seed, h1=(sd*7.31)%1, h2=(sd*13.7)%1, h3=(sd*29.3)%1;
        const grip=.90+.14*h3, s=sd*50, l=q.age, f1=4.4+5.2*h2;
        const tb=(.45+Math.min(ws,14)*.10)*(.45+1.35*h1);
        // The first outward/upward fold follows the passing brush; then the cores take over.
        const envelope=Math.exp(-1.1*q.age)*q.lift, angle=q.age*3.2;
        const fan=envelope*Math.cos(angle)*3.6, lift=envelope*Math.sin(angle+.6)*7;
        // The pocket of air riding behind the rider drags fresh flakes along with her for
        // half a second, so the swirl stays in front of the chase camera before it falls behind.
        const pocket=(q.petal?.82:.7)*Math.exp(-(q.age*q.age)/.3);
        const ax=wind.x*.40+air.x*grip+q.nx*fan+Math.sin(s+l*f1)*tb+(rv?rv.x:0)*pocket;
        const az=wind.z*.40+air.z*grip+q.nz*fan+Math.cos(s*1.3+l*f1*.81)*tb+(rv?rv.z:0)*pocket;
        const ay=air.y*grip+lift+Math.sin(s*.7+l*f1*1.38)*tb*.6;
        const drag=q.petal?7+7*h1:6+4*h1, grav=q.petal?5+3*h2:9+3*h2;
        const e=1-Math.exp(-drag*dt);
        q.vel.x+=(ax-q.vel.x)*e; q.vel.y+=(ay-q.vel.y)*e; q.vel.z+=(az-q.vel.z)*e;
        q.vel.y-=grav*dt;
        q.pos.addScaledVector(q.vel,dt);
        const tumble=Math.min(3.5,.35+.22*Math.hypot(q.vel.x-wind.x,q.vel.y,q.vel.z-wind.z))*dt;
        q.rx+=q.sx*tumble; q.ry+=q.sy*tumble; q.rz+=q.sz*tumble;
        if(q.age>=q.nextGroundCheck){
          q.floor=G.world.heightAt(q.pos.x,q.pos.z)+.025;
          q.nextGroundCheck=q.age+.2;
        }
        if(q.pos.y<q.floor) {
          q.pos.y=q.floor;
          if(ws>2.5) {
            // the wake is still raking the ground here: skitter along it
            q.vel.y=Math.abs(q.vel.y)*.25+ws*.05;
            q.vel.x+=(Math.random()-.5)*(1.2+ws*.22); q.vel.z+=(Math.random()-.5)*(1.2+ws*.22);
          } else {
            q.settled=true; q.vel.set(0,0,0);
            q.rx=-1.5708+(h1-.5)*.5; q.rz=(h2-.5)*.5;
            q.life=Math.min(q.life,q.age+(q.petal?2.2:1.3));
          }
        }
      }
      pose.position.copy(q.pos);
      pose.rotation.set(q.rx,q.ry,q.rz);
      const size=q.size*(.4+.6*Math.min(1,q.age*9))*(1-smooth(q.age,q.life-.35,q.life));
      if(q.petal) pose.scale.set(size,size,size);
      else pose.scale.set(size*.26,size*.5,size);
      pose.updateMatrix();
      mesh.setMatrixAt(visible,pose.matrix);
      mesh.setColorAt(visible++,q.color);
    }
    mesh.count=stats.airborne=visible;
    mesh.visible=visible>0;
    if(visible) {mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
  }
  return {mesh,field,stats,update};
}
