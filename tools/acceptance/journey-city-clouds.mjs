// Hold the broom above the south gate and follow the same cloud opening over the gate, western tower and rampart.
// The shaft pair renders the exact same simulation frame through the normal postprocessing toggle.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,serveGame} from '../../build.mjs';
import {launch,TMP} from '../cdp.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(process.env.MV_JOURNEY_QA||path.join(TMP,'journey-city-clouds'));
const quality=process.env.MV_QUALITY||'high';
await fs.mkdir(output,{recursive:true});
const bundle=await build({});
if(!bundle.ok)throw new Error(bundle.errors);
const {url,server}=await serveGame({getBuild:async()=>bundle});
let page;
try{
  page=await launch({width:1440,height:900});
  const renderErrors=[];
  page.on('Runtime.consoleAPICalled',m=>{if(m.type==='error')renderErrors.push(m.args.map(a=>a.value??a.description).join(' ').slice(0,900));});
  page.on('Runtime.exceptionThrown',m=>renderErrors.push(m.exceptionDetails?.exception?.description||m.exceptionDetails?.text));
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:await fs.readFile(path.join(root,'tools/trailer/clock.js'),'utf8')});
  await page.goto(url+'?autostart=1&quality='+quality+'&pr=1&mute=1&dynres=0');
  const deadline=Date.now()+150000;
  while(!(await page.evaluate('window.__mvReady===true&&window.__rigClock.mode==="virtual"'))){
    if(Date.now()>deadline)throw Error('city cloud flight boot timed out');
    await new Promise(r=>setTimeout(r,150));
  }
  const result=await page.evaluate('('+fly.toString()+')()',{timeout:260000});
  for(const [id,uri] of Object.entries(result.photos))await fs.writeFile(path.join(output,id+'.jpg'),Buffer.from(uri.split(',')[1],'base64'));
  delete result.photos;
  result.renderErrors=renderErrors;result.quality=quality;
  await fs.writeFile(path.join(output,'city-clouds.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  if(result.errors.length||renderErrors.length||result.failures.length)throw Error('city cloud acceptance failed: '+result.failures.join(', '));
}finally{await page?.close();server.close();}

async function fly(){
  const G=window.__game,P=G.player,clock=window.__rigClock,T=window.__T,Q=G.THREE;
  const step=()=>clock.step(50),render=G.renderFrame.bind(G);
  const still=()=>{},rnd=n=>Number(n.toFixed(3));
  const photos={},views=[],failures=[];
  const style=document.createElement('style');style.textContent='.mv-ui,.mv-ui *{visibility:hidden!important}';document.head.appendChild(style);
  const origin={x:-2134,z:-346};
  T.teleport(origin.x,origin.z,G.world.groundAt(origin.x,origin.z)+.04);
  G.state.abilities.broom=true;G.state.flags.majo_named=true;G.state.flags.majo_brooch=true;
  P.setOutfit('elaina',{quiet:true});P.yaw=-2.78;G.cam.yaw=P.yaw-Math.PI;G.cam.pitch=-.2;
  for(let i=0;i<7;i++)await step();
  // Wait for the playable UI and the outfit's asynchronous asset swap before pressing F. The swap loads and compiles in
  // wall-clock time while this test steps a virtual clock, so alternate a small virtual step with a real frame.
  for(let i=0;i<4000&&(G.mode!=='play'||P.outfit!=='elaina');i++){await clock.step(4);await clock.present();}
  for(let i=0;i<3&&!P.onBroom;i++){
    T.key('KeyF',true);await step();T.key('KeyF',false);
    if(!P.onBroom)for(let j=0;j<6;j++)await step();
  }
  if(!P.onBroom)throw Error('city flight mount failed: '+G.mode+' / '+P.state+' / '+P.outfit);
  T.key('Space',true);
  const start=G.time.t;
  let beams={contrast:-1},surveyed=false;
  const go=(from,to)=>T.viewCam(...from.toArray(),...to.toArray());
  async function sampleBeams(label,look=null){
    const sun=G.sky.uniforms.mvSunDir.value.clone();
    const canvas=document.createElement('canvas');canvas.width=200;canvas.height=125;
    const cx=canvas.getContext('2d',{willReadFrequently:true});
    const copy=()=>{cx.drawImage(G.renderer.domElement,0,0,200,125);return cx.getImageData(0,0,200,125).data;};

    for(const angle of (look?[.44,.64,.84]:[-1.0,-.68,-.36,0,.38,.76,1.55,2.64])){
      const heading=Math.atan2(sun.x,sun.z)+angle;
      const sight=new Q.Vector3(Math.sin(heading),look?.slope??.10,Math.cos(heading)).normalize();
      const from=look?new Q.Vector3(look.x,look.y,look.z):P.pos.clone().addScaledVector(sight,-5.6);
      if(!look)from.y+=1.35;
      const to=from.clone().addScaledVector(sight,100);go(from,to);
      G.renderFrame=()=>{
        const switchBack=G.post.flags.shafts;
        try{
          G.post.set('shafts',false);render();const off=copy(),shotOff=G.renderer.domElement.toDataURL('image/jpeg',.94);
          G.post.set('shafts',true);render();const on=copy();
          let sum=0,count=0,visible=0,max=0;const gains=[];
          for(let y=8;y<116;y++)for(let x=8;x<192;x++){
            const i=(x+y*200)*4,d=(on[i]-off[i])*.213+(on[i+1]-off[i+1])*.715+(on[i+2]-off[i+2])*.072;
            gains.push(d);sum+=d;max=Math.max(max,d);count++;if(d>=2)visible++;
          }
          gains.sort((a,b)=>a-b);
          // A shaft is bright beside shaded air. Prefer spatial contrast across the frame.
          const dark=gains[Math.floor(count*.25)],lit=gains[Math.floor(count*.97)];
          const contrast=lit-dark+sum/count*.18;
          if(contrast>beams.contrast){
            beams={sample:label,contrast:rnd(contrast),p25:rnd(dark),p97:rnd(lit),time:rnd(G.time.t-start),height:rnd(P.pos.y),eye:from.toArray().map(rnd),playTime:rnd(G.state.playTime),heading:rnd(heading),sunHeight:rnd(G.journeyWeather.state.sunElevation),meanGain:rnd(sum/count),fraction:rnd(visible/count),maxGain:rnd(max)};
            photos['shafts-off']=shotOff;photos['shafts-on']=G.renderer.domElement.toDataURL('image/jpeg',.94);
          }
        }finally{G.post.set('shafts',switchBack);}
      };
      await step();
    }
    T.cam();G.renderFrame=render;
  }
  for(let i=0;i<580&&P.pos.y<G.sky.cloudLayer().top+12;i++){
    G.renderFrame=i%25?still:render;await step();
    if(!surveyed&&P.pos.y>45){await sampleBeams('climb');surveyed=true;}
  }
  T.key('Space',false);
  G.renderFrame=still;for(let i=0;i<12;i++)await step();
  const targets={gate:new Q.Vector3(-2160,47,-459),tower:new Q.Vector3(-2194,56,-585),wall:new Q.Vector3(-2086,43,-497)};
  const city=new Q.Vector3(-2137,82,-538),eye=P.pos.clone().lerp(city,-.034);
  eye.x-=2.7;eye.y+=1.05;
  const quad=new Uint16Array(4), bytes=new Uint8Array(4);
  function read(rt,u,v,attachment=0){
    const x=Math.min(rt.width-1,Math.max(0,Math.floor(u*rt.width))),y=Math.min(rt.height-1,Math.max(0,Math.floor(v*rt.height)));
    if(rt.textures[attachment].type===Q.UnsignedByteType){
      G.renderer.readRenderTargetPixels(rt,x,y,1,1,bytes,0,attachment);return Array.from(bytes,x=>x/255);
    }
    G.renderer.readRenderTargetPixels(rt,x,y,1,1,quad,0,attachment);
    return Array.from(quad,Q.DataUtils.fromHalfFloat);
  }
  const columnPixels=new Uint8Array(16);
  function filteredColumn(target,u,v,channel){
    // Sample the centres of 2×2 RGBA8 texels, matching textureLod(..., 0) with clamp-to-edge.
    const x=Q.MathUtils.clamp(u*target.width-.5,0,target.width-1);
    const y=Q.MathUtils.clamp(v*target.height-.5,0,target.height-1);
    const x0=Math.floor(x),y0=Math.floor(y);
    const w=Math.min(2,target.width-x0),h=Math.min(2,target.height-y0);
    G.renderer.readRenderTargetPixels(target,x0,y0,w,h,columnPixels);
    const texel=(i,j)=>columnPixels[4*(j*w+i)+channel]/255;
    const row=j=>Q.MathUtils.lerp(texel(0,j),texel(w-1,j),x-x0);
    return Q.MathUtils.lerp(row(0),row(h-1),y-y0);
  }
  function sunTransmission(target,u,v,height,layer){
    // Match mvSunColumn and mvCloudSunAt: the green channel resolves the inner quarter.
    const nearU=(u-.5)*4+.5,nearV=(v-.5)*4+.5;
    const border=Math.min(nearU,1-nearU,nearV,1-nearV);
    const blend=Q.MathUtils.smoothstep(border,.015,.12);
    const near=blend>.001?filteredColumn(target,nearU,nearV,1):0;
    const wide=blend<.999?filteredColumn(target,u,v,0):0;
    const transmitted=blend<=.001?wide:blend>=.999?near:Q.MathUtils.lerp(wide,near,blend);
    const edge=Q.MathUtils.smoothstep(Math.min(u,1-u,v,1-v),0,.05);
    const within=1-Q.MathUtils.smoothstep(height,layer.base,layer.top);
    return Q.MathUtils.lerp(1,transmitted,edge*within);
  }
  function cloudView(){
    const rt=G.sky.mesh.material.uniforms.uLow.value.renderTarget;
    const pixelFor=p=>{const clip=p.clone().project(G.camera);return [(clip.x+1)/2,(clip.y+1)/2];};
    const column=G.post.pipe.scenePass.cloudShafts?.column,box=G.post.pipe.scenePass.cloudShafts?.box,sun=G.sky.uniforms.mvSunDir.value;
    const trans={};
    for(const [name,p] of Object.entries(targets)){
      const [u,v]=pixelFor(p);
      if(u<.04||u>.96||v<.04||v>.96)throw Error('camera cropped '+name+' '+u+','+v);
      const a=[];
      for(const dx of [-.009,0,.009])for(const dy of [-.009,0,.009])a.push(1-read(rt,u+dx,v+dy,1)[3]);
      const feature={x:rnd(u),y:rnd(1-v),visibility:rnd(a.reduce((a,b)=>a+b,0)/a.length)};
      if(column&&box?.w>.5){
        const layer=G.sky.cloudLayer();
        const lift=(layer.base-p.y)/Math.max(.055,sun.y);
        const uv=[(p.x+sun.x*lift-box.x)*box.z,(p.z+sun.z*lift-box.y)*box.z];
        if(uv.every(t=>t>=0&&t<=1))feature.sunTransmission=rnd(sunTransmission(column,...uv,p.y,layer));
      }
      trans[name]=feature;
    }
    let clear=0,thick=0,thin=0,n=0;const map=[];
    for(let y=0;y<9;y++)for(let x=0;x<15;x++){
      const o=read(rt,.13+.74*x/14,.13+.74*y/8,1)[3];n++;
      if(o<.3)clear++;else if(o>.76)thick++;else thin++;
      map.push(Math.round(o*255));
    }
    return {t:rnd(G.time.t-start),height:rnd(P.pos.y),...G.sky.cloudLayer(),landmarks:trans,clear:rnd(clear/n),thick:rnd(thick/n),thin:rnd(thin/n),map};
  }
  const hoveringSince=G.time.t;
  for(const seconds of [0,3,6,10,15,23,34,46,62,80,130,179,219,248,269,282,298,316,326,336,345,356,368,382]){
    while(G.time.t<hoveringSince+seconds)await step();
    go(eye,city);
    const id='city-'+String(seconds).padStart(2,'0');
    G.renderFrame=()=>{render();photos[id]=G.renderer.domElement.toDataURL('image/jpeg',.94);views.push({id,...cloudView()});};
    await step();G.renderFrame=still;
  }
  const maps=views.map(v=>v.map);
  let change=0;for(const m of maps.slice(1))change=Math.max(change,m.reduce((s,k,i)=>s+Math.abs(k-maps[0][i]),0)/(255*m.length));
  const dense=views.find(v=>v.thick>.83);
  const reopened=dense && views.find(v=>v.t>dense.t+25&&v.clear>.24&&v.thick<.67&&Object.values(v.landmarks).every(k=>k.visibility>.45));
  if(!reopened)failures.push('the weather did not reopen the city after the dense bank');
  for(const v of views)delete v.map;
  const best=views.reduce((a,b)=>score(a)>score(b)?a:b);
  function score(v){const a=Object.values(v.landmarks).map(t=>t.visibility);return Math.min(...a)*1.5+Math.min(v.thick,.30)+Math.min(v.thin,.22);}
  if(!views.some(v=>Object.values(v.landmarks).every(k=>k.visibility>.40)))failures.push('no moment with all three landmarks open');
  if(!views.some(v=>v.thick>.13&&v.clear>.12&&v.thin>.04))failures.push('cloud opening, translucent edge and dense bank did not coexist');
  if(change<.08)failures.push('insufficient cloud drift over the fixed city viewpoint');
  // Follow the same flight east of the wall. At this late-afternoon light angle shafts
  // cross the foreground meadow, with the city in the middle distance.
  T.cam();G.renderFrame=still;
  const lookout={x:-1986,y:45.625,z:-718,slope:Math.tan(.19)};
  const course=Math.atan2(lookout.x-P.pos.x,lookout.z-P.pos.z);
  T.key('KeyW',true);
  for(let i=0;i<700;i++){
    G.cam.yaw=course-Math.PI;G.cam.pitch=-.2;await step();
    if(Math.hypot(lookout.x-P.pos.x,lookout.z-P.pos.z)<23)break;
  }
  T.key('KeyW',false);G.cam.pitch=-.2;
  T.key('KeyC',true);
  for(let i=0;i<550&&P.pos.y>lookout.y+1.7;i++)await step();
  T.key('KeyC',false);for(let i=0;i<20;i++)await step();
  const arrival=P.pos.toArray().map(rnd);
  if(Math.hypot(P.pos.x-lookout.x,P.pos.z-lookout.z)>16||!P.onBroom)failures.push('broom missed the city meadow viewpoint');
  for(const t of [382,397]){
    G.renderFrame=still;while(G.state.playTime<t)await step();
    await sampleBeams('city-meadow',lookout);
  }
  if(beams.maxGain<3||beams.fraction<.002)failures.push('light shafts did not alter the rendered air');
  return {origin,eye:eye.toArray(),arrival,best:best.id,dense:dense?.id,reopened:reopened?.id,change:rnd(change),views,beams,photos,failures,errors:T.errors()};
}
