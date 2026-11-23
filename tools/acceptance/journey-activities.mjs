// The open country's discovery loop (src/gameplay/wilds*.js): one landmark puzzle of every kind solved by real spell
// casts (G.spells.cast, the same path the heroine's casts take), stray stars picked up by touch, a cairn lookout, one
// ring course flown on the broom by a steering bot, the save → reload round trip, the map / journal pages, and the six
// 残页试炼 page trials (seal → guardian → page → charged form).
// Private throwaway browser, virtual clock (tools/trailer/clock.js). Output: MV_JOURNEY_QA or .tmp/journey-activities.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, serveGame } from '../../build.mjs';
import { launch, TMP } from '../cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
// ACT_RINGS=all flies all three ring courses (medal calibration); by default only the heart course
const RING_IDS = process.env.ACT_RINGS === 'all' ? ['rc_heart', 'rc_coast', 'rc_vale'] : ['rc_heart'];
const output = path.resolve(process.env.MV_JOURNEY_QA || path.join(TMP, 'journey-activities'));
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
  await page.goto(url + '?autostart=1&mute=1&quality=high&pr=1&dynres=0&allspells=1&pos=2100,330');
  const deadline = Date.now() + 150000;
  while (!(await page.evaluate('window.__mvReady===true&&window.__rigClock.mode==="virtual"&&!!window.__game.wilds?.ready'))) {
    if (Date.now() > deadline) throw new Error('boot timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
  // ---- part 1: puzzles, stars, cairn, ring course, save round trip (all in the page) ----------------------------------
  const result = await page.evaluate(`(async()=>{
    const G=__game,P=G.player,T=__T,clock=__rigClock,V=G.THREE.Vector3;
    const draw=G.renderFrame.bind(G);G.renderFrame=()=>{};
    const tick=async(n=1)=>{for(let i=0;i<n;i++)await clock.step(50);};
    const sec=(s)=>tick(Math.round(s*20));
    const fail=(m,o)=>{throw Error(m+' '+JSON.stringify(o||{}));};
    const W=G.wilds,PZ=W.puzzles,out={puzzles:{},stars:{},ring:{},save:{}};
    await tick(20);G.physics?.syncStatics?.();await tick(4);
    const st=(id)=>PZ.state(id);
    const cast=(id,form,point)=>{const o=P.pos.clone().setY(P.pos.y+1.25);return G.spells.cast(id,form,{caster:P,point:point.clone(),dir:point.clone().sub(o).normalize()});};
    const stand=async(t,dist,dy)=>{T.teleport(t.x,t.z+dist,dy===undefined?undefined:t.y+dy);P.yaw=Math.PI;await tick(8);};
    const press=async(code)=>{T.key(code,true);await tick(1);T.key(code,false);await tick(3);};
    async function open(id){
      const p=PZ.get(id),c=p.chest.group.position;
      T.teleport(c.x,c.z+1.5,c.y+0.2);await tick(6);
      const prompt=G.interact.current?.prompt?.()||null;
      await press('KeyE');await tick(10);
      if(st(id)!=='open')fail('chest did not open: '+id,{prompt,state:st(id)});
      return prompt;
    }
    const dust0=G.state.inventory.stardust;
    // beacon: fire on the keep's iron basket
    { const p=PZ.get('pz_beacon_keep'),b=p.pos;
      T.teleport(b.x+3.5,b.z+3.5,b.y-1.6);await tick(8);
      const look=G.interact.current?.prompt?.();
      cast('fire','small',b.clone().setY(b.y-0.3));await sec(2.5);
      if(st('pz_beacon_keep')!=='solved')fail('beacon not lit by fire',{at:P.pos.toArray()});
      out.puzzles.beacon={lit:p.lit,open:await open('pz_beacon_keep')}; }
    // bramble: fire burns the thicket away
    { const p=PZ.get('pz_hermit_briar'),b=p.pos;
      await stand(b,7);
      cast('fire','small',b.clone().setY(b.y+0.8));await sec(1.5);
      const burning=!!p.reactor?.burning;await sec(8);
      if(st('pz_hermit_briar')!=='solved')fail('bramble did not burn away',{burning});
      out.puzzles.bramble={burning,open:await open('pz_hermit_briar')}; }
    // rubble: thunder shatters the stones
    { const p=PZ.get('pz_pass_rubble'),b=p.pos;
      await stand(b,8);
      cast('thunder','small',b.clone().setY(b.y+0.5));await sec(1.5);
      if(st('pz_pass_rubble')!=='solved')fail('rubble not shattered');
      out.puzzles.rubble={open:await open('pz_pass_rubble')}; }
    // drift: the chest slips away from her hand; a frost burst on the pool holds it
    { const p=PZ.get('pz_tarn_drift'),c=p.center;
      const a0=p.chest.group.position.clone();
      T.teleport(a0.x,a0.z,c.y+0.8);await sec(1.2);
      const slipped=+a0.distanceTo(p.chest.group.position).toFixed(2);
      await stand(c,10,1.0);
      cast('ice','big',c.clone());await sec(1.5);
      if(!p.frozen)fail('pool did not freeze');
      out.puzzles.drift={slipped,frozen:p.frozen,open:await open('pz_tarn_drift')};
      if(slipped<0.5)fail('drifting chest did not slip away',{slipped}); }
    // ember: water quenches the coals
    { const p=PZ.get('pz_charcoal_ember'),b=p.pos;
      await stand(b,7);
      cast('water','small',b.clone().setY(b.y+0.5));await sec(1.5);
      if(st('pz_charcoal_ember')!=='solved')fail('embers not quenched');
      out.puzzles.ember={open:await open('pz_charcoal_ember')}; }
    // circle: dry stones keep no lightning; rain, then one strike charges all thirteen
    { const p=PZ.get('pz_moor_circle'),c=p.pos,s0=p.stones[0];
      await stand(c,16);
      cast('thunder','small',new V(s0.x,s0.g+1,s0.z));await sec(1.5);
      const dry=p.stones.filter((s)=>s.charged>0).length;
      if(dry||st('pz_moor_circle'))fail('dry circle took the lightning',{dry});
      G.spells.cast('water','big',{caster:P,point:c.clone()});await sec(5);
      const wet=p.stones.filter((s)=>s.reactor?.wet>0).length;
      cast('thunder','small',new V(s0.x,s0.g+1,s0.z));await sec(1.5);
      if(st('pz_moor_circle')!=='solved')fail('wet circle not charged',{wet,charged:p.stones.filter((s)=>s.charged>0).length});
      await sec(2.2);
      out.puzzles.circle={dry,wet,open:await open('pz_moor_circle')}; }
    // wheel: three gusts spin it up
    { const p=PZ.get('pz_mill_wheel'),b=p.pos;
      await stand(b,7);
      for(let k=0;k<3;k++){cast('wind','small',b.clone().setY(b.y+2.5));await sec(0.9);}
      if(st('pz_mill_wheel')!=='solved')fail('wind wheel not spun up',{spin:p.spin});
      out.puzzles.wheel={spin:+p.spin.toFixed(2),open:await open('pz_mill_wheel')}; }
    // lantern: fire warms it, it rises on the wind, she catches it on the broom
    { const p=PZ.get('pz_tor_south_lantern'),b=p.pos;
      await stand(b,7);
      cast('fire','small',b.clone().setY(b.y+0.7));await sec(5);
      if(p.phase!=='rise')fail('sky lantern did not rise',{phase:p.phase});
      const rose=+(p.pos.y-p.home.y).toFixed(1);
      T.teleport(p.pos.x,p.pos.z,p.pos.y-1.2);await tick(4);
      if(st('pz_tor_south_lantern')!=='open')fail('sky lantern not caught');
      out.puzzles.lantern={rose}; }
    // ---- stray stars by touch + a cairn ----
    const want=['st_well_mouth','st_mill_cap','st_light_finial','st_pier_end','st_bridge_under','st_tree_crown','st_tower_top'];
    const n0=W.starCount();
    for(const id of want){const s=W.stars.find((x)=>x.id===id);T.teleport(s.pos.x,s.pos.z,s.pos.y-0.9);await tick(3);}
    out.stars.picked=W.starCount()-n0;out.stars.total=W.starTotal();out.stars.steps=G.state.wilds.steps;
    if(out.stars.picked!==want.length)fail('stars not picked up',{picked:out.stars.picked});
    { const l=G.wilds.resolveAt('cairn_southhill',{x:0,z:0,y:['h0',0]});
      T.teleport(l.x,l.z+1.6);await tick(6);
      const prompt=G.interact.current?.prompt?.()||null;
      await press('KeyE');await sec(2);
      out.stars.cairn={prompt,sighted:Object.keys(G.state.wilds.sighted).length};
      if(!G.state.wilds.cairns.cairn_southhill)fail('cairn lookout failed',out.stars.cairn); }
    out.found=Object.keys(G.state.wilds.lm).length;
    // ---- ring course(s), flown on the broom by a steering bot at cruise speed (no boost, broom level 0) ----
    out.ring={};
    const broomLv=G.state.upgrades.broom;G.state.upgrades.broom=0;
    for(const id of ${JSON.stringify(RING_IDS)}){
      const R=W.rings,c=R.courses.find((x)=>x.def.id===id),r0=c.rings[0];
      const back=r0.pos.clone().addScaledVector(r0.normal,-14);
      T.teleport(back.x,back.z,back.y);await tick(2);
      if(!P.onBroom){await press('KeyF');await tick(6);}
      if(!P.onBroom)fail('could not mount the broom');
      P.mana=P.maxMana;
      T.key('KeyW',true);
      let frames=0,lastNext=-1,stuck=0,aborts=0,wasRunning=false;
      for(;frames<6000;frames++){
        const target=R.running?R.next.pos:r0.pos;
        const dx=target.x-P.pos.x,dz=target.z-P.pos.z;
        G.cam.yaw=Math.atan2(dx,dz)-Math.PI;
        const vy=Math.max(-10,Math.min(10,(target.y-P.pos.y)*1.6)),sp=Math.max(6,P.speed*0.6);
        G.cam.pitch=Math.asin(Math.max(-0.95,Math.min(0.95,vy/sp)))-0.2;
        await tick();
        if(wasRunning&&!R.running&&!G.state.wilds.rings[id])aborts++;
        wasRunning=!!R.running;
        if(R.running&&R.next!==lastNext){lastNext=R.next;stuck=0;}else if(R.running&&++stuck>1200)break;
        if(!R.running&&frames>40&&G.state.wilds.rings[id])break;
      }
      T.key('KeyW',false);
      const rec=G.state.wilds.rings[id];
      out.ring[id]={rec,aborts,secs:+(frames*0.05).toFixed(1),len:Math.round(c.len),medals:c.def.medals};
      if(!rec||!(rec.best>0))fail('ring course not completed',out.ring[id]);
    }
    G.state.upgrades.broom=broomLv;
    // ---- save -> reload keeps everything ----
    { const before=JSON.stringify(G.state.wilds);
      G.save.disabled=false;
      if(!G.save.write(true))fail('save write failed');
      G.save.reset();
      if(Object.keys(G.state.wilds.stars).length)fail('reset kept stars');
      W.start();
      const hiddenAfterReset=W.stars.filter((s)=>s.got).length;
      if(!G.save.load())fail('save load failed');
      W.start();
      const after=JSON.stringify(G.state.wilds);
      const thicket=PZ.get('pz_hermit_briar').thicket.visible, pile=PZ.get('pz_pass_rubble').pile.visible, beacon=PZ.get('pz_beacon_keep').lit;
      out.save={same:before===after,hiddenAfterReset,starsGot:W.stars.filter((s)=>s.got).length,thicket,pile,beacon,opened:PZ.counts()};
      G.save.erase();G.save.disabled=true;
      if(before!==after||thicket||pile||!beacon||out.save.starsGot!==W.starCount())fail('save round trip lost state',out.save); }
    out.dust={start:dust0,end:G.state.inventory.stardust};
    out.upgrades={...G.state.upgrades};
    out.errors=T.errors();
    G.renderFrame=draw;
    return out;
  })()`, { timeout: 600000 });
  // ---- part 2: map and journal pages (DOM, so real screenshots) --------------------------------------------------------
  const step = (n) => page.evaluate(`(async()=>{for(let i=0;i<${n};i++)await __rigClock.step(50);return true;})()`);
  await page.evaluate(`(()=>{const G=__game,s=G.wilds.stars.find((x)=>x.id==='st_tree_roots');__T.teleport(560,250);G.ui.openMenu('map');return true;})()`);
  await step(30);
  await page.screenshot(path.join(output, 'map.png'));
  const journal = await page.evaluate(`(()=>{const G=__game;G.ui.openMenu('journal');
    const tab=[...document.querySelectorAll('.mn-subtabs .st')].find((e)=>e.textContent.includes('旅途见闻'));
    if(!tab)return {tab:false};tab.click();return {tab:true,text:tab.textContent};})()`);
  await step(10);
  await page.screenshot(path.join(output, 'journal-stars.png'));
  const rows = await page.evaluate(`(()=>{const rows=[...document.querySelectorAll('.mn-list .scroll .mn-row')];const r=rows.find((e)=>e.textContent.includes('古树原野'));r?.dispatchEvent(new MouseEvent('mouseenter'));return rows.map((e)=>e.textContent);})()`);
  await step(10);
  await page.screenshot(path.join(output, 'journal-region.png'));
  result.pages = { journal, rows };
  if (!journal.tab || rows.length < 8) throw new Error('journal page missing ' + JSON.stringify(result.pages));
  // ---- part 3: 残页试炼, the six tier-2 page trials (src/gameplay/wilds-pages.js) -----------------------------------------
  // The seal answers each element's SMALL form (real casts), but only for a named witch; the guardian wakes with a ward of
  // the site's element; wind's guardian is fought with real spells (ice breaks the wind ward, fire burns the pages); the
  // page then teaches level 2 with the learn ceremony. Also: leaving the arena puts the guardian back to sleep, a page
  // whose form she knows pays stardust, a page left lying survives a save round trip. One screenshot per site + guardian.
  await page.evaluate('__game.ui.closeMenu();true');
  await step(6);
  const trial = (body) => page.evaluate(`(async()=>{
    const G=__game,P=G.player,T=__T,clock=__rigClock,PG=G.wilds.pages;
    const tick=async(n=1)=>{for(let i=0;i<n;i++)await clock.step(50);};
    const sec=(s)=>tick(Math.round(s*20));
    const fail=(m,o)=>{throw Error(m+' '+JSON.stringify(o||{}));};
    const cast=(id,form,point,o)=>{const q=P.pos.clone().setY(P.pos.y+1.25);return G.spells.cast(id,form,{caster:P,point:point.clone(),dir:point.clone().sub(q).normalize(),...o});};
    const front=(s,d=8)=>{const dx=Math.sin(s.def.face),dz=Math.cos(s.def.face);return [s.center.x+dx*d,s.center.z+dz*d,dx,dz];};
    const go=async(s,d=8)=>{const [x,z]=front(s,d);T.teleport(x,z);P.yaw=s.def.face+Math.PI;P.hp=P.maxHp;P.mana=P.maxMana;await tick(10);};
    const view=(s,tx,ty,tz)=>{const [x,z,dx,dz]=front(s,11);const h=G.world.heightAt(s.center.x,s.center.z);T.viewCam(x+dz*4,h+4.6,z-dx*4,tx??s.center.x,ty??h+1.4,tz??s.center.z);};
    const answer=(s)=>{const el=s.def.el;
      if(s.def.mech==='candles'){for(const c of s.candles)cast('fire','small',c.pos.clone());}
      else if(s.def.mech==='rod')cast('thunder','small',s.rodTop.clone().setY(s.rodTop.y-3));
      else if(s.def.mech==='lectern')cast('earth','small',s.base.clone());
      else cast(el,'small',s.mechPos.clone());};
    const fire=async(s)=>{answer(s);if(s.def.mech==='candles')for(let k=0;k<5&&!s.candles.every((c)=>c.lit);k++){await sec(0.7);for(const c of s.candles)if(!c.lit)cast('fire','small',c.pos.clone());}};
    const waitGuardian=async(id)=>{for(let k=0;k<120&&!PG.guardian(id);k++)await tick(2);return PG.guardian(id);};
    const dismiss=async()=>{for(let k=0;k<30&&G.mode!=='play';k++){T.key(k%2?'Enter':'KeyE',true);await tick(1);T.key(k%2?'Enter':'KeyE',false);await tick(5);}};
    ${body}
  })()`, { timeout: 600000 });
  const shotTo = (name) => page.screenshot(path.join(output, name + '.png'));
  const pagesOut = {};
  // tier-1 kit only, an apprentice: the seal stays asleep
  pagesOut.asleep = await trial(`
    for(const el of ['wind','water','fire','ice','thunder','earth'])G.state.spells[el]=1;
    delete G.state.flags.majo_named;
    const s=PG.get('pg_wind');await go(s);await sec(1);
    const seen=PG.state('pg_wind');
    cast('wind','small',s.mechPos.clone());await sec(3);
    if(PG.state('pg_wind')!=='seen'||PG.phase('pg_wind')!=='idle'||PG.guardian('pg_wind'))fail('seal answered an apprentice',{st:PG.state('pg_wind'),ph:PG.phase('pg_wind')});
    G.state.flags.majo_named=true;
    return {seen,st:PG.state('pg_wind')};`);
  if (pagesOut.asleep.seen !== 'seen') throw new Error('wind site not sighted ' + JSON.stringify(pagesOut.asleep));
  const order = ['pg_wind', 'pg_thunder', 'pg_fire', 'pg_earth', 'pg_water', 'pg_ice'];
  for (const id of order) {
    // the site, then the small form at its mechanism, then the guardian's entrance
    await page.evaluate(`(async()=>{const G=__game,PG=G.wilds.pages,s=PG.get('${id}'),T=__T,P=G.player;
      const dx=Math.sin(s.def.face),dz=Math.cos(s.def.face);T.teleport(s.center.x+dx*8,s.center.z+dz*8);P.yaw=s.def.face+Math.PI;
      for(let i=0;i<30;i++)await __rigClock.step(50);
      const h=G.world.heightAt(s.center.x,s.center.z);T.viewCam(s.center.x+dx*11+dz*4,h+4.6,s.center.z+dz*11-dx*4,s.center.x,h+1.4,s.center.z);return true;})()`);
    await step(4);
    await shotTo('page-site-' + id.slice(3));
    const r = await trial(`
      const s=PG.get('${id}'),id='${id}',el=s.def.el;await go(s);
      if(PG.state(id)!=='seen')fail('site not sighted',{id,st:PG.state(id)});
      if('${id}'==='pg_ice')G.state.spells.ice=2;   // a page whose form she already knows
      await fire(s);
      const g=await waitGuardian(id);
      if(PG.state(id)!=='open'||!g)fail('seal did not wake the guardian',{id,st:PG.state(id),ph:PG.phase(id)});
      if(!g.elite||g.named!==id||g.ward?.el!==el)fail('guardian not an elite with a '+el+' ward',{id,type:g.type,ward:g.ward?.el,elite:g.elite});
      await sec(0.4);view(s,g.pos.x,g.pos.y+1.3,g.pos.z);
      return {id,type:g.type,hp:g.maxHp,ward:g.ward.el,wardMax:g.ward.max,affixes:g.affixes};`);
    await step(3);
    await shotTo('page-guardian-' + id.slice(3));
    await page.evaluate('__T.cam();true');
    pagesOut[id] = r;
    if (id === 'pg_wind') {
      // fought with real spells: ice breaks the wind ward (the counter), fire burns the pages
      pagesOut.fight = await trial(`
        const s=PG.get('pg_wind'),id='pg_wind';let g=PG.guardian(id),broke=null;
        const off=G.events.on?.('enemy:ward',(e)=>{if(e.enemy===g&&e.state==='break')broke=broke||{el:e.el,t:clock.now?.()};});
        const hp0=g.hp;let ice=0,fires=0;
        for(let k=0;k<30&&g.ward&&g.ward.hp>0&&!g.dead;k++){P.hp=P.maxHp;P.mana=P.maxMana;cast('ice','small',g.centerOut(new G.THREE.Vector3()),{target:g});ice++;await sec(0.7);}
        const wardBroken=!g.ward||g.ward.hp<=0;
        for(let k=0;k<40&&!g.dead;k++){P.hp=P.maxHp;P.mana=P.maxMana;cast('fire','small',g.centerOut(new G.THREE.Vector3()),{target:g});fires++;await sec(0.6);}
        const realKill=g.dead;
        if(!g.dead)G.combat.damage(g,99999,{force:true,element:'fire',source:P});
        await sec(1);
        if(!wardBroken)fail('ice did not break the wind ward',{ice,ward:g.ward&&g.ward.hp});
        return {ice,fires,wardBroken,realKill,hp0};`);
      if (!pagesOut.fight.realKill) console.log('note: wind guardian finished by force after ' + pagesOut.fight.fires + ' fireballs');
    } else if (id === 'pg_thunder') {
      // she flies off: the guardian sinks back into its seal; back in the arena, it wakes again
      pagesOut.recede = await trial(`
        const s=PG.get('pg_thunder'),id='pg_thunder';
        T.teleport(s.center.x+90,s.center.z+40);await sec(1.5);
        const gone=!PG.guardian(id)&&PG.phase(id)==='idle'&&PG.state(id)==='open';
        await go(s,6);const g=await waitGuardian(id);
        if(!gone||!g)fail('guardian did not recede / wake again',{gone,again:!!g});
        G.combat.damage(g,99999,{force:true,element:'earth',source:P});await sec(1);
        return {gone,again:!!g};`);
    } else {
      await trial(`const g=PG.guardian('${id}');G.combat.damage(g,99999,{force:true,element:'sun',source:P});await sec(1);return true;`);
    }
    if (id === 'pg_earth') {
      // a page left lying is still there after a save round trip
      pagesOut.save = await trial(`
        const id='pg_earth',s=PG.get(id);await sec(2);
        if(PG.state(id)!=='won'||!s.page.visible)fail('page did not drop',{st:PG.state(id)});
        T.teleport(s.center.x+60,s.center.z);await sec(1);
        G.save.disabled=false;if(!G.save.write(true))fail('save write failed');
        G.save.reset();G.wilds.start();
        const reset=PG.state(id);
        if(!G.save.load())fail('save load failed');G.wilds.start();
        const st=PG.state(id),visible=s.page.visible,lv={...G.state.spells};
        G.save.erase();G.save.disabled=true;
        if(st!=='won'||!visible||reset)fail('save round trip lost the page',{st,visible,reset});
        return {st,visible,wind:lv.wind,thunder:lv.thunder};`);
      if (pagesOut.save.wind !== 2 || pagesOut.save.thunder !== 2) throw new Error('levels lost in save round trip ' + JSON.stringify(pagesOut.save));
    }
    const got = await trial(`
      const id='${id}',s=PG.get(id),el=s.def.el;await sec(2.2);
      if(PG.state(id)!=='won')fail('page did not drop',{id,st:PG.state(id)});
      const lv0=G.spells.level(el),dust0=G.state.inventory.stardust;let ceremony=null;
      const learn=G.ui.learnSpell;G.ui.learnSpell=(o)=>{ceremony={id:o.id,name:o.name};return learn(o);};
      const pp=s.page.position;T.teleport(pp.x+0.4,pp.z+0.4,pp.y-0.9);await sec(1.5);
      G.ui.learnSpell=learn;
      const st=PG.state(id),lv=G.spells.level(el),menu=G.mode;
      await dismiss();await sec(2.5);
      return {st,lv0,lv,ceremony,menu,mode:G.mode,dust:G.state.inventory.stardust-dust0};`);
    pagesOut[id].page = got;
    if (got.st !== 'read' || got.lv !== 2) throw new Error('page did not teach level 2 ' + JSON.stringify({ id, got }));
    if (id === 'pg_ice' ? (got.ceremony || got.dust < 160) : (!got.ceremony || got.lv0 !== 1 || got.menu !== 'menu')) throw new Error('page reward wrong ' + JSON.stringify({ id, got }));
    if (got.mode !== 'play') throw new Error('learn ceremony did not close ' + JSON.stringify(got));
    if (id === 'pg_fire') { await step(2); await shotTo('page-ceremony-fire'); }
  }
  // the map shows six pins in the elements' colours, the journal one note per site
  pagesOut.journal = await page.evaluate(`(()=>{const G=__game;const m=G.wilds.markers().filter((x)=>['wind','thunder','fire','earth','water','ice'].includes(x.icon));
    const notes=G.ui.providers.lore().filter((n)=>n.id.startsWith('pg_'));return {pins:m.length,notes:notes.length,read:G.wilds.pages.counts()};})()`);
  if (pagesOut.journal.pins !== 6 || pagesOut.journal.notes !== 6 || pagesOut.journal.read.read !== 6) throw new Error('page trial pins / notes ' + JSON.stringify(pagesOut.journal));
  await page.evaluate(`(()=>{__T.teleport(-200,-300);__game.ui.openMenu('map');return true;})()`);
  await step(30);
  await shotTo('page-map');
  await page.evaluate('__game.ui.closeMenu();true');
  result.pageTrials = pagesOut;
  result.errors = result.errors.concat(await page.evaluate('__T.errors()'));
  await fs.writeFile(path.join(output, 'activities.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 1));
  if (result.errors.length || consoleErrors.length) throw new Error('Game or renderer reported errors');
  console.log('journey-activities: PASS — ' + output);
} catch (e) {
  failed = true;
  console.error('journey-activities: FAIL — ' + (e?.message || e));
} finally { await page.close(); server.close(); }
process.exit(failed ? 1 : 0);
