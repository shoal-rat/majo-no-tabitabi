import * as THREE from 'three';
import { G } from '../../core/game.js';
import { box, cyl, cone, torus } from '../../core/geo.js';
import { mulberry32 } from '../../core/util.js';
import { Site, mat, beam, sculptVcMat } from './kit.js';
import { toon } from '../../core/mats.js';
import { WAYSIDES } from '../../data/waysides.js';
import { siteRock, rockLod, familyParts, siteRockMats, pieces } from '../rock-family.js';

const timber=mat.wood(0x755741), dark=mat.wood(0x4a4036), canvas=mat.cloth(0xdfcfa2);
const slate=mat.tile(0x6b7580), limestone=mat.stone(0xb4ac93), shale=mat.stone(0x8d9084);
const moss=mat.stone(0x879476), grain=mat.cloth(0xc2a76a);
const rockShape=new THREE.DodecahedronGeometry(1,0);

function rock(site,x,y,z,w,h,d,material,angle=0) {
  const stone=new THREE.Mesh(rockShape,material);
  stone.scale.set(w,h,d);
  site.add(stone,x,y,z,angle);
  return stone;
}
/** A family stone (world/rock-family.js) standing on (x, ground y, z): full size w x h x d, heading `angle`; the old blob
 *  when the family is off (?sculpt=0). */
function stone(site,shape,x,y,z,w,h,d,material,angle=0,lod=rockLod(false)) {
  const g=siteRock(shape,{w,h,d,tint:material.color.toArray(),lod});
  if(!g) return rock(site,x,y+h*.42,z,w*.54,h*.54,d*.54,material,angle);
  site.add(g,x,y,z,angle);
  return g;
}
// The sculpted tower mill (tools/sculpt/assets/mill_lake.mjs, G.sculpt type 'mill'): coursed limestone, timber frames,
// a flared fish-scale slate cap with its windshaft housing and tail pole; the sails turn about the hub. Same collider and
// roof platform as the old box tower. Every part in vertex colours on white copies of the site's surface materials.
const MILL_HUB=[0,9.15,4.0];
function millMats() {
  const vc=(m)=>sculptVcMat(m);
  return {
    MillStone_stone:vc(toon(0xa59c90,{surface:'stone',look:{detail:.3,bump:.35}})), MillTimber_wood:vc(toon(0x755741,{surface:'wood',look:{detail:.4}})),
    MillSlate_paint:vc(toon(0x6b7580,{surface:'paint',look:{detail:.2,spec:.08,specPower:40}})), MillCloth_cloth:vc(toon(0xdfcfa2,{surface:'cloth',look:{trans:.25}})),
    MillIron_metal:vc(toon(0x3c3d44,{surface:'metal',look:{spec:.3}})),
  };
}
function sculptedMill(site,ctx,y) {
  if(!G.sculpt?.on?.('mill')) return false;
  const q=G.quality||{}, lod=q.mobile||q.name==='low'?1:0, body=pieces('sculpt_mill_lake',lod), sail=pieces('sculpt_mill_lake_sails',lod);
  if(!body||!sail) return false;
  const M=millMats(), y0=y-.2;
  for(const [name,geo] of Object.entries(body)) { const m=new THREE.Mesh(geo,M[name]||M.MillStone_stone); m.castShadow=true; m.receiveShadow=true; site.add(m,0,y0,0); }
  const sails=new THREE.Group();
  for(const [name,geo] of Object.entries(sail)) { const m=new THREE.Mesh(geo,M[name]||M.MillTimber_wood); m.castShadow=true; m.receiveShadow=true; sails.add(m); }
  site.addDynamic(sails,MILL_HUB[0],y0+MILL_HUB[1],MILL_HUB[2]);
  ctx.tick((dt)=>{if(G.state?.flags?.journey_mill) sails.rotation.z+=dt*.34*(G.journeyWeather?.state.wind||1);});
  return true;
}
// The island's crown: family stones along the brink of the mill island's plateau, where the painted cliff begins, so
// the rim reads as rock from the lake and the meadow. They sit just inside the brink (the plateau's height is the same
// before and after the flood; only the slope below changes), skip the causeway and the road, and carry colliders.
function millCrown(site) {
  if(!G.sculpt?.on?.('rockfam')) return;
  const q=G.quality||{}, n=q.mobile||q.name==='low'?10:16, rnd=mulberry32(1818), shapes=['ledge','shelf','field','split','ledge','crag'];
  const tint=new THREE.Color(0x9c968a).toArray();
  for(let k=0;k<n;k++) {
    const phi=(k+.5)/n*Math.PI*2+(rnd()-.5)*.25, dx=Math.cos(phi), dz=Math.sin(phi);
    if(Math.abs(Math.atan2(dz,dx))<.45) { rnd(); rnd(); continue; }          // the causeway runs east
    const W=G.world, top=W.heightAt(site.x+dx*10,site.z+dz*10);
    let rb=0; for(let r=11;r<27;r+=.5) if(W.heightAt(site.x+dx*r,site.z+dz*r)<top-.8){rb=r;break;}
    const w=2+1.2*rnd(), h=1.1+.8*rnd();
    if(!rb) continue;
    const r=rb-1.1-w*.2, x=site.x+dx*r, z=site.z+dz*r;
    if(W.roadDist?.(x,z)<5) continue;
    const lx=site.lx(x,z), lz=site.lz(x,z), y=W.heightAt(x,z);
    const g=siteRock(shapes[k%shapes.length],{w,h,d:w*(.75+.2*rnd()),tint,sink:.18});
    if(!g) return;
    site.add(g,lx,y,lz,-phi-site.rot+Math.PI/2+(rnd()-.5)*.6);
    site.colCyl(lx,lz,w*.38,y-.3,y+h*.85);
  }
}
function mill(site,ctx) {
  const y=site.h(0,0);
  millCrown(site);
  if(sculptedMill(site,ctx,y)) { site.colCyl(0,0,3.1,y-.7,y+8.65); site.platDisc(0,0,2.25,y+8.4,.6); return; }
  site.add(cyl(2.45,3.15,8.7,limestone,0,y+4.05,0,12));
  site.add(cyl(2.57,2.62,.34,dark,0,y+8.25,0,12));
  site.add(cone(3.0,3.45,slate,0,y+9.98,0,12));
  site.colCyl(0,0,3.1,y-.7,y+8.65);
  site.platDisc(0,0,2.25,y+8.4,.6);
  for(const level of [1.18,4.08,6.37]) {
    const w=level<2?1.08:.67, h=level<2?2.25:.94, z=3.12-(level/8.7)*.69;
    site.add(box(w+.24,h+.24,.23,timber,0,y+level,z));
    site.add(box(w,h,.28,dark,0,y+level,z+.02));
    if(level>2) site.add(box(.08,h,.3,canvas,0,y+level,z+.035));
  }
  const sails=new THREE.Group();
  for (let i=0;i<4;i++) {
    const arm=new THREE.Group(); arm.rotation.z=i*Math.PI/2;
    arm.add(box(.13,5.95,.16,dark,0,2.94,0));
    arm.add(box(1.01,3.47,.052,canvas,.48,4.06,0));
    for(let j=0;j<8;j++) arm.add(box(1.16,.055,.09,timber,.48,2.36+j*.48,.06));
    arm.add(box(.075,3.56,.11,timber,.98,4.04,.055));
    sails.add(arm);
  }
  site.addDynamic(sails,0,y+6.8,2.94);
  ctx.tick((dt)=>{if(G.state?.flags?.journey_mill) sails.rotation.z+=dt*.34*(G.journeyWeather?.state.wind||1);});
}
/** A dry-stone wall along a site-local polyline [[x, z], ...]: the sculpted 2.4 m segment (wall_drystone, the same as the
 *  field walls) cut to whole segments, each pitched with the ground. false when the wall asset is off / missing. */
function wallRun(site,pts) {
  if(!G.sculpt?.on?.('drywall')) return false;
  const q=G.quality||{}, P=familyParts('sculpt_wall_drystone',q.mobile||q.name==='low'?1:0);
  if(!P) return false;
  const M=siteRockMats(), cum=[0];
  for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const at=(d)=>{let i=1;while(i<pts.length-1&&cum[i]<d)i++;const t=(d-cum[i-1])/Math.max(1e-6,cum[i]-cum[i-1]);return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t];};
  const total=cum[cum.length-1], n=Math.max(1,Math.round(total/2.4)), step=total/n;
  for(let k=0;k<n;k++) {
    const a=at(k*step), b=at((k+1)*step), mx=(a[0]+b[0])/2, mz=(a[1]+b[1])/2, chord=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const g=new THREE.Group();
    for(const [geo,m] of [[P.stone,M.stone],[P.moss,M.moss]]) if(geo){const mesh=new THREE.Mesh(geo,m);mesh.castShadow=!!(m===M.stone);mesh.receiveShadow=true;g.add(mesh);}
    g.scale.set(chord/2.4,1,1);
    site.add(g,mx,site.h(mx,mz)-.1,mz,Math.atan2(-(b[1]-a[1]),b[0]-a[0]));
    g.rotation.z=Math.atan2(site.h(b[0],b[1])-site.h(a[0],a[1]),chord);
  }
  return true;
}
function fold(site,random,wide) {
  const radius=wide?12:9, arc=[];
  for(let i=0;i<44;i++) { const a=.34+i*(Math.PI*2-.7)/43; arc.push([Math.sin(a)*radius,Math.cos(a)*6.4]); }
  const laid=wallRun(site,arc);
  for(let i=0;i<44;i++) {
    const a=.34+i*(Math.PI*2-.7)/43, x=Math.sin(a)*radius, z=Math.cos(a)*6.4;
    const base=site.h(x,z);
    if(!laid) for(let row=0;row<3;row++) {
      const angle=a+(row%2)*.055;
      rock(site, Math.sin(angle)*radius,base+.14+row*.31, Math.cos(angle)*6.4,
        .85+random()*.25,.34+random()*.08,.49,random()<.72?limestone:shale,-a);
    }
    if(i%2===0)site.colCyl(x,z,.72,base-.25,base+1.08);
  }
  for(let i=0;i<3;i++) {
    const x=-radius-1.4-i*1.95,z=-2.8+i*.78,y=site.h(x,z);
    const bale=cyl(.64,.65,1.55,grain,x,y+.63,z,16); bale.rotation.z=Math.PI/2; site.add(bale);
    for(const offset of [-.46,.46]) {
      const band=torus(.646,.022,timber,x+offset,y+.63,z);band.rotation.y=Math.PI/2;site.add(band);
    }
  }
}
function cart(site) {
  const y=site.h(0,0);
  site.add(box(1.84,.15,3.25,timber,0,y+.86,0));
  for(const x of [-.9,.9]){
    for(let row=0;row<3;row++)site.add(box(.11,.19,3.2,timber,x,y+1.01+row*.21,0));
    for (const z of [-1.3,1.3]) {
      const axle=cyl(.11,.11,.42,dark,x*1.15,y+.65,z);axle.rotation.z=Math.PI/2;site.add(axle);
      const ring=torus(.62,.064,dark,x*1.26,y+.65,z);ring.rotation.y=Math.PI/2;site.add(ring);
      for(let k=0;k<5;k++){
        const bar=box(.065,1.19,.065,timber,x*1.26,y+.65,z);bar.rotation.x=k*Math.PI/5;site.add(bar);
      }
    }
    site.add(beam(x,y+.83,1.2,x*.7,y+.36,3.13,.12,.12,timber));
  }
  for(let i=0;i<3;i++)site.add(cyl(.32,.42,.7,grain,(i-1)*.50,y+1.25,-.51+i*.38,9));
  site.colBox(0,0,1,1.6,0,y+.55,y+1.7);
}
// A spine of bedded stone breaking the turf: tilted slabs (the family's ledge / crag, leaning with the bedding) and
// loose stones fallen below them. Same random sequence and colliders as before, so the layout is unchanged.
function rockSpine(site,random,pass) {
  const count=pass?11:8;
  for(let i=0;i<count;i++){
    const x=(i-count/2)*1.76+random()*.5,z=Math.sin(i*.87)*2.4;
    const y=site.h(x,z),h=(pass?2.65:1.12)*(1+.65*Math.sin(i*1.9)+random()*.4);
    const w=1.16+random()*.60,d=1.37+random();
    const slab=stone(site,i%3===0?'crag':pass?'ledge':'split',x,y-.08*h,z,w*1.75,h*1.35,d*1.55,i%3===0?moss:shale,i*.51);
    slab.rotation.z=.24+random()*.16;
    site.colCyl(x,z,1.24,y-.2,y+h*1.3);
    for(let k=0;k<3;k++){
      const tx=x+random()*3-1.5,tz=z+random()*4.8+1.6;
      stone(site,k===1?'field':'cobble',tx,site.h(tx,tz)-.02,tz,1.0,.62,1.08,limestone,random()*6,Math.min(2,rockLod(false)+1));
    }
  }
}
// Boardwalk and stile give each detour a recognisable end, visible below a low-flying broom.
function observationPoint(site,bank) {
  const y=Math.max(.6,site.h(0,0))+(bank?.85:.62);
  const length=bank?6.4:3.6;
  for(let i=0;i<Math.ceil(length/.38);i++)site.add(box(2.65,.11,.36,timber,0,y,i*.38-length/2));
  for(const x of [-1.15,1.15])for(const z of [-length*.4,length*.4]){
    const g=site.h(x,z),high=y+1.08;
    site.add(cyl(.085,.13,high-g+.42,dark,x,(g+high-.42)/2,z,8));
  }
  site.add(beam(-1.15,y+1.01,length*.4,1.15,y+1.01,length*.4,.11,.14,timber));
  site.platBox(0,0,1.36,length/2,0,y+.065,.18);
  for(let i=0;i<3;i++){
    const z=-length*.5-1.05+i*.36,low=site.h(0,z),top=low+(y-low)*(i+1)/4;
    site.add(box(2.12,.17,.44,timber,0,top-.08,z));site.platBox(0,z,1.08,.23,0,top,.17);
  }
}
export async function buildWaysides(ctx){
  for(const p of WAYSIDES) {
    const site=new Site(p.id,p.x,p.z,p.angle), random=mulberry32(21931+p.x);
    if(p.id==='mill')mill(site,ctx);
    else if(p.id==='reedBank' || p.id==='lookout')observationPoint(site,p.id==='reedBank');
    else if(p.id.endsWith('Fold'))fold(site,random,p.id==='westFold');
    else if(p.id.endsWith('Cart'))cart(site);
    else rockSpine(site,random,p.id==='pass');
    await site.bakeSliced(ctx.step);
    ctx.place(p.id,{site,group:site.baked});
  }
}
