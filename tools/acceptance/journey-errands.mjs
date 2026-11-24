// Roadside errands (src/gameplay/errands*.js): all five run end to end in a private headless browser on a virtual clock
// (tools/trailer/clock.js) — talk through the real interact + dialogue (E / Enter, the first choice = yes), carry the
// letter and its reply on the broom, chase the painter's hat on the broom with a steering bot (a wind spell catches it
// and brings it back), light the shepherd's stove and freeze the ford with real spell casts (G.spells.cast), read the
// stray stars' note to the witch at the city road. Saves and reloads twice mid-errand (letter + ford half done, the hat
// in flight → in its snag after the reload) and once at the end, then shoots the journal page.
// Output: MV_JOURNEY_QA or .tmp/journey-errands (errands.json, journal-errands.png, map.png).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, serveGame } from '../../build.mjs';
import { launch, TMP } from '../cdp.mjs';
import { ERRANDS } from '../../src/data/errands.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.resolve(process.env.MV_JOURNEY_QA || path.join(TMP, 'journey-errands'));
await fs.mkdir(output, { recursive: true });
const bundle = await build({});
if (!bundle.ok) throw new Error(bundle.errors);
const { url, server } = await serveGame({ getBuild: async () => bundle });
const page = await launch({ width: 1280, height: 720 });
let failed = false;
try {
  const consoleErrors = [];
  page.on('Runtime.consoleAPICalled', (m) => {
    if (m.type !== 'error') return;
    const line = m.args.map((a) => a.value ?? a.description).join(' ').slice(0, 600);
    consoleErrors.push(line); console.error(line);
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: await fs.readFile(path.join(root, 'tools/trailer/clock.js'), 'utf8') });
  await page.goto(url + '?autostart=1&mute=1&quality=high&pr=1&dynres=0&allspells=1&pos=1000,-470');
  const deadline = Date.now() + 150000;
  while (!(await page.evaluate('window.__mvReady===true&&window.__rigClock.mode==="virtual"&&!!window.__game.errands?.ready'))) {
    if (Date.now() > deadline) throw new Error('boot timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
  const result = await page.evaluate(`(async()=>{
    const G=__game,P=G.player,T=__T,clock=__rigClock,V=G.THREE.Vector3,E=G.errands,N=E.travellers;
    const draw=G.renderFrame.bind(G);G.renderFrame=()=>{};
    const tick=async(n=1)=>{for(let i=0;i<n;i++)await clock.step(50);};
    const sec=(s)=>tick(Math.round(s*20));
    const fail=(m,o)=>{throw Error(m+' '+JSON.stringify(o||{}));};
    const out={talks:{},steps:{},save:{},hat:{},ford:{}};
    const press=async(code)=>{T.key(code,true);await tick(1);T.key(code,false);await tick(2);};
    G.state.abilities.broom=true;G.state.flags.majo_named=true;
    await tick(20);G.physics?.syncStatics?.();await tick(4);
    const step=(id)=>E.step(id)||(E.state(id)?.s==='done'?'done':null);
    // walk up to a traveller and talk: the prompt must be hers, the dialogue runs to its end (Enter = first choice)
    async function talk(id){
      if(P.onBroom){await press('KeyF');await sec(1.5);}
      N.home(id);const n=N.get(id);const f=n.def.face||0;
      // the actor's model loads in wall-clock time (fetch + parse) while this test steps a virtual clock that also holds
      // every page timer: start the load, then alternate a tiny virtual step (lets the loader's timers fire) with a real
      // frame (lets the network and decoder run) until it is ready, so a busy machine cannot run the wait out first
      if(n.def.asset&&G.assets?.load&&!G.assets.ready?.(n.def.asset)){G.assets.load(n.def.asset).catch(()=>{});
        for(let k=0;k<4000&&!G.assets.ready(n.def.asset);k++){await clock.step(4);await clock.present();}}
      for(let k=0;k<3&&!n.actor;k++){T.teleport(n.pos.x+Math.sin(f)*1.6,n.pos.z+Math.cos(f)*1.6);await sec(1.5);}
      for(let k=0;k<60&&!n.actor;k++)await tick(5);
      if(!n.actor)fail('traveller never appeared: '+id,{pos:n.pos.toArray(),on:n.on});
      T.teleport(n.pos.x+Math.sin(f)*1.6,n.pos.z+Math.cos(f)*1.6);await tick(8);
      const prompt=G.interact.current?.prompt?.()||null;
      await press('KeyE');
      let lines=0;
      for(let k=0;k<60&&!G.dialogue.active;k++)await tick(2);
      while(G.dialogue.active&&lines<80){await sec(0.6);await press('Enter');lines++;}
      await tick(6);
      (out.talks[id]||=[]).push({prompt,lines});
      if(!prompt||!prompt.includes(G.errands.nameOf(id)))fail('no talk prompt for '+id,{prompt,cur:G.interact.current?.prompt?.()});
      return lines;
    }
    const cast=(id,form,point)=>{const o=P.pos.clone().setY(P.pos.y+1.25);return G.spells.cast(id,form,{caster:P,point:point.clone(),dir:point.clone().sub(o).normalize()});};
    // steer the broom toward a moving point (same bot as the ring courses)
    async function flyTo(getTarget,until,maxFrames=4000){
      if(!P.onBroom){await press('KeyF');await tick(8);}
      if(!P.onBroom)fail('could not mount the broom');
      T.key('KeyW',true);let f=0;
      for(;f<maxFrames;f++){
        const tg=getTarget();if(!tg)break;
        const dx=tg.x-P.pos.x,dz=tg.z-P.pos.z;
        G.cam.yaw=Math.atan2(dx,dz)-Math.PI;
        const vy=Math.max(-10,Math.min(10,(tg.y-P.pos.y)*1.6)),sp=Math.max(6,P.speed*0.6);
        G.cam.pitch=Math.asin(Math.max(-0.95,Math.min(0.95,vy/sp)))-0.2;
        P.mana=P.maxMana;
        await tick();
        if(until())break;
      }
      T.key('KeyW',false);await tick(4);
      return f;
    }
    async function roundTrip(label,check){
      const before=JSON.stringify(G.state.errands);
      G.save.disabled=false;
      if(!G.save.write(true))fail('save write failed');
      G.save.reset();
      if(Object.keys(G.state.errands.list).length)fail('reset kept errands');
      if(!G.save.load())fail('save load failed');
      G.errands.start();await tick(10);
      const after=JSON.stringify(G.state.errands);
      G.save.erase();G.save.disabled=true;
      G.state.abilities.broom=true;
      out.save[label]={same:before===after,...(check?check():{})};
      if(before!==after)fail('save round trip changed errands '+label,{before,after});
    }
    const dust0=G.state.inventory.stardust,REWARDS=${JSON.stringify(Object.fromEntries(ERRANDS.map((e) => [e.id, e.reward])))};
    // the reward hops out as pickups and flies to her: within a few seconds the purse holds it
    out.paid={};
    async function finish(npc,id){
      const d0=G.state.inventory.stardust,inv0={...G.state.inventory};
      await talk(npc);await sec(3.5);
      const r=G.errands.state(id),want=REWARDS[id];
      const got=G.state.inventory.stardust-d0;
      const items=Object.fromEntries(Object.keys(want.items||{}).map((k)=>[k,(G.state.inventory[k]||0)-(inv0[k]||0)]));
      out.paid[id]={dust:got,items};
      if(r?.s!=='done')fail('errand not done after the last talk: '+id,{r});
      if(got<want.dust||Object.entries(want.items||{}).some(([k,n])=>items[k]<n))fail('reward not received: '+id,{got,items,want});
    }

    // ---- 1. the letter: Marta (north farm) → Greta (west farm) → the reply back, on the broom ----
    await talk('marta');
    if(step('er_letter')!=='deliver')fail('letter not accepted',{s:step('er_letter')});
    // ---- 4a. the ford: accept (needs ice; allspells) ----
    await talk('tomas');
    if(step('er_ford')!=='freeze')fail('ford not accepted',{s:step('er_ford')});
    // save → reload with two errands half done: steps kept, the carter back on the near bank
    await roundTrip('midway',()=>({letter:step('er_letter'),ford:step('er_ford'),carter:+N.get('tomas').pos.distanceTo(E.ford.start).toFixed(2)}));
    if(out.save.midway.letter!=='deliver'||out.save.midway.ford!=='freeze'||out.save.midway.carter>0.5)fail('midway reload lost errand state',out.save.midway);
    // fly the last stretch to Greta on the broom
    { N.home('greta');const g=N.get('greta').pos;T.teleport(g.x+70,g.z+40,g.y+25);await tick(4);
      const fr=await flyTo(()=>new V(g.x,g.y+3,g.z),()=>Math.hypot(P.pos.x-g.x,P.pos.z-g.z)<6,1600);
      out.steps.letterFlight={frames:fr,dist:+Math.hypot(P.pos.x-g.x,P.pos.z-g.z).toFixed(1)}; }
    await talk('greta');
    if(step('er_letter')!=='reply')fail('letter not delivered',{s:step('er_letter')});
    { const m=N.get('marta').pos;T.teleport(m.x-60,m.z+50,m.y+20);await tick(4);
      await flyTo(()=>new V(m.x,m.y+3,m.z),()=>Math.hypot(P.pos.x-m.x,P.pos.z-m.z)<6,1600); }
    await finish('marta','er_letter');
    if(step('er_letter')!=='done'||!G.state.errands.keep.recipe)fail('reply not brought back',{s:step('er_letter'),keep:G.state.errands.keep});
    out.steps.letter='done';

    // ---- 2. the hat: torn off in the talk, it rides the wind; save mid-flight → it waits in the snag; a gust brings it back ----
    await talk('otto');
    const H=E.hat;
    if(step('er_hat')!=='chase'||H.state!=='fly')fail('hat did not fly off',{s:step('er_hat'),state:H.state});
    const h0=H.pos.clone();await sec(4);
    out.hat.flew={m:+h0.distanceTo(H.pos).toFixed(1),up:+(H.pos.y-G.world.heightAt(H.pos.x,H.pos.z)).toFixed(1)};
    if(out.hat.flew.m<10)fail('hat barely moved',out.hat.flew);
    await roundTrip('hat',()=>({step:step('er_hat'),hat:H.state,atLanding:+H.pos.distanceTo(H.landing).toFixed(2)}));
    if(out.save.hat.hat!=='stuck'||out.save.hat.atLanding>0.5)fail('reloaded hat not in its snag',out.save.hat);
    // fly toward the snag; within 30 m blow a gust at the hat: it leaves the snag and comes to her; catch it on the broom
    { const L=H.landing;T.teleport(L.x-90,L.z+60,L.y+8);await tick(4);
      let gusted=false,gustAt=null;
      const fr=await flyTo(()=>H.state==='held'?null:(H.state==='fly'?H.pos:L),()=>{
        if(!gusted&&H.state==='stuck'&&P.pos.distanceTo(L)<30){gusted=true;gustAt=+P.pos.distanceTo(L).toFixed(1);cast('wind','small',L.clone());}
        return H.state==='held';
      },3000);
      out.hat.chase={frames:fr,gusted,gustAt,state:H.state,step:step('er_hat')};
      if(!gusted||H.state!=='held'||step('er_hat')!=='return')fail('hat chase failed',out.hat.chase); }
    await finish('otto','er_hat');
    if(step('er_hat')!=='done'||H.state!=='home'||!G.state.errands.keep.sketch)fail('hat not returned',{s:step('er_hat'),state:H.state});
    out.steps.hat='done';

    // ---- 3. the shepherd's stove: fire lights it ----
    await talk('hanna');
    if(step('er_stove')!=='light')fail('stove errand not accepted',{s:step('er_stove')});
    { const st=E.stove;T.teleport(st.pos.x+4,st.pos.z+4);await tick(6);
      cast('fire','small',st.pos.clone().setY(st.pos.y+0.5));await sec(2);
      out.steps.stoveLit=st.stove.lit;
      if(!st.stove.lit||step('er_stove')!=='warm')fail('stove not lit by fire',{lit:st.stove.lit,s:step('er_stove')}); }
    await finish('hanna','er_stove');
    if(step('er_stove')!=='done')fail('stove errand not finished');
    out.steps.stove='done';

    // ---- 4b. the ford: ice freezes it, the carter pushes the cart across, thanks on the far bank ----
    { const F=E.ford;await talk('tomas');   // the wait line
      T.teleport(F.start.x-F.n.x*3,F.start.z-F.n.z*3);await tick(6);
      cast('ice','big',F.mid.clone());await sec(1.5);
      out.ford.frozen=F.frozen>0;out.ford.crossing=F.crossing;out.ford.water=[F.a,F.b];
      if(!F.frozen||!F.crossing)fail('ford did not freeze',out.ford);
      // she can stand on the ice
      T.teleport(F.mid.x+F.u.x*1.2,F.mid.z+F.u.z*1.2,F.mid.y+1.5);await sec(1.5);
      out.ford.standY=+(P.pos.y-F.mid.y).toFixed(2);out.ford.swim=P.state==='swim';
      let t=0;while(F.crossing&&t<60){await sec(1);t++;}
      out.ford.secs=t;out.ford.carter=+N.get('tomas').pos.distanceTo(F.end).toFixed(2);
      if(step('er_ford')!=='across'||out.ford.carter>0.6)fail('cart did not cross',out.ford);
      if(out.ford.standY<0||out.ford.swim)fail('ice not walkable',out.ford); }
    await finish('tomas','er_ford');
    if(step('er_ford')!=='done')fail('ford errand not finished');
    out.steps.ford='done';

    // ---- 5. the stray stars: read the note (6 stars by touch) to the witch at the city road ----
    await talk('ilse');
    if(!['stars','tell'].includes(step('er_stars')))fail('stars errand not accepted',{s:step('er_stars')});
    { const want=['st_well_mouth','st_mill_cap','st_light_finial','st_pier_end','st_bridge_under','st_tree_crown','st_tower_top','st_oak_crown'];
      for(const id of want){if(step('er_stars')==='tell')break;const s=G.wilds.stars.find((x)=>x.id===id);if(s.got)continue;T.teleport(s.pos.x,s.pos.z,s.pos.y-0.9);await tick(4);}
      out.steps.starsFound=G.wilds.starCount();
      if(step('er_stars')!=='tell')fail('stars step did not complete',{n:G.wilds.starCount(),s:step('er_stars')}); }
    await finish('ilse','er_stars');
    if(step('er_stars')!=='done'||!G.state.errands.keep.jar)fail('stars errand not finished',{s:step('er_stars')});
    out.steps.stars='done';

    // ---- end: everything kept by a save round trip; the world restored from it ----
    await roundTrip('end',()=>({done:Object.values(G.state.errands.list).filter((r)=>r.s==='done').length,keep:Object.keys(G.state.errands.keep),hat:E.hat.state,stove:E.stove.stove.lit,carterFar:+N.get('tomas').pos.distanceTo(E.ford.end).toFixed(2)}));
    if(out.save.end.done!==5||out.save.end.hat!=='home'||!out.save.end.stove||out.save.end.carterFar>0.5)fail('end state not restored',out.save.end);
    out.dust={start:dust0,end:G.state.inventory.stardust};
    out.journal=E.journal();
    out.mapMarkers=(G.ui.providers.mapMarkers?.()||[]).filter((m)=>m.icon==='side').length;
    out.errors=T.errors();
    G.renderFrame=draw;
    return out;
  })()`, { timeout: 900000 });
  // ---- journal page (DOM) ----
  const stepN = (n) => page.evaluate(`(async()=>{for(let i=0;i<${n};i++)await __rigClock.step(50);return true;})()`);
  const journal = await page.evaluate(`(()=>{const G=__game;G.ui.openMenu('journal');
    const tab=[...document.querySelectorAll('.mn-subtabs .st')].find((e)=>e.textContent.includes('旅途见闻'));
    if(!tab)return {tab:false};tab.click();return {tab:true};})()`);
  await stepN(10);
  const rows = await page.evaluate(`(()=>{const rows=[...document.querySelectorAll('.mn-list .scroll .mn-row')];const r=rows.find((e)=>e.textContent.includes('路边的托付'));r?.dispatchEvent(new MouseEvent('mouseenter'));r?.scrollIntoView?.();return {n:rows.length,errands:!!r,text:r?.textContent||''};})()`);
  await stepN(10);
  await page.screenshot(path.join(output, 'journal-errands.png'));
  result.page = { journal, rows };
  if (!journal.tab || !rows.errands) throw new Error('errands journal row missing ' + JSON.stringify(result.page));
  await fs.writeFile(path.join(output, 'errands.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ steps: result.steps, paid: result.paid, hat: result.hat, ford: result.ford, save: result.save, dust: result.dust, talks: Object.fromEntries(Object.entries(result.talks).map(([k, v]) => [k, v.map((x) => x.lines)])), page: result.page }, null, 1));
  if (result.errors.length || consoleErrors.length) throw new Error('Game or renderer reported errors');
  console.log('journey-errands: PASS — ' + output);
} catch (e) {
  failed = true;
  console.error('journey-errands: FAIL — ' + (e?.message || e));
} finally { await page.close(); server.close(); }
process.exit(failed ? 1 : 0);
