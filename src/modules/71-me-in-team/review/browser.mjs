// Uses the repo's run-localrot skill. Vite :5199 and relay :8791 must be running.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, sleep } from '../../../../.claude/skills/run-localrot/scripts/cdp.mjs'

const here=dirname(fileURLToPath(import.meta.url)),out=join(tmpdir(),'localrot-me-in-team-review')
mkdirSync(join(here,'screenshots'),{recursive:true})
const pages=[],checks=[]
const state=`(()=>{const el=document.querySelector('[data-team-game]');if(!el)return null;let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];while(f&&f.type?.name!=='TeamPanel')f=f.return;return f?.memoizedState?.memoizedState??null})()`
const assert=(ok,note)=>{if(!ok)throw Error(note)}
const read=(p)=>p.eval(state)
const key=(p,code,down)=>p.eval(`window.dispatchEvent(new KeyboardEvent('${down?'keydown':'keyup'}',{code:'${code}',key:'${code.slice(3).toLowerCase()}',bubbles:true}))`)
const lock=(p)=>p.eval(`Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.querySelector('[data-board]')});document.dispatchEvent(new Event('pointerlockchange'))`)
async function capture(p,name){copyFileSync(await p.shot(name),join(here,'screenshots',name))}
async function check(name,fn){const evidence=await fn();checks.push({name,ok:true,evidence});console.log('OK',name,JSON.stringify(evidence));writeFileSync(join(here,'browser-results.json'),JSON.stringify({at:new Date().toISOString(),checks},null,2))}
async function open(name,port){const p=await launch({port,out,name,width:1200,height:820});pages.push(p);await p.goto('http://localhost:5199/src/modules/71-me-in-team/preview.html');await p.waitFor('!!window.__teamPreview',60000);return p}
async function playing(p,id){await p.waitFor(`(()=>{const r=${state};return r&&r.elapsed>.15${id?`&&r.id!==${id}`:''}})()`,20000)}
async function drive(p,target){
  await lock(p);const end=Date.now()+12000;await key(p,'KeyW',true)
  try{while(Date.now()<end){
    const r=await read(p),me=r.players.find(p=>p.mine)
    if(Math.hypot(target.x-me.x,target.z-me.z)<.55||r.over)return r
    const want=Math.atan2(-(target.x-me.x),-(target.z-me.z)),turn=Math.atan2(Math.sin(me.yaw-want),Math.cos(me.yaw-want))
    await p.eval(`document.dispatchEvent(new MouseEvent('mousemove',{movementX:${Math.round(turn/.0028)},movementY:0,bubbles:true}))`)
    await sleep(60)
  }}finally{await key(p,'KeyW',false)}
  throw Error('waypoint not reached '+JSON.stringify(target))
}
let error=null
try{
  const solo=await open('solo',9540);await capture(solo,'welcome.png');await solo.eval(`document.querySelector('[data-preview-start]').click()`);await solo.waitFor(`!!${state}`,10000)
  await check('countdown blocks input',async()=>{await lock(solo);await key(solo,'KeyW',true);await sleep(250);await key(solo,'KeyW',false);const r=await read(solo);assert(r.elapsed===0&&r.players[0].z===18,'countdown moved a body');return{elapsed:r.elapsed,z:r.players[0].z}})
  await playing(solo);await lock(solo)
  await check('solo roster, stand-in chain, WASD and camera',async()=>{
    const before=await read(solo),me=before.players.find(p=>p.mine);assert(me.role==='solo'&&before.players.filter(p=>p.bot).length===4,'wrong solo deal')
    await key(solo,'KeyW',true);await sleep(350);await key(solo,'KeyW',false)
    await solo.eval(`document.dispatchEvent(new MouseEvent('mousemove',{movementX:40,movementY:-20,bubbles:true}))`);await sleep(250)
    const after=await read(solo),own=after.players.find(p=>p.mine),team=after.players.filter(p=>p.role==='team')
    assert(18-own.z>1,'W did not move');assert(Math.abs(own.yaw+.112)<.005&&Math.abs(own.pitch-.606)<.005,'mouse camera was not applied')
    const maxLink=Math.max(...team.slice(1).map((p,i)=>Math.hypot(p.x-team[i].x,p.z-team[i].z)))
    assert(maxLink<2.62,'stand-in chain broke');await capture(solo,'solo-course.png')
    const perf=await solo.eval(`(async()=>{const c=await import('/src/modules/00-core/index.ts');return c.readPerf()})()`)
    assert(perf.drawCalls>0&&perf.drawCalls<=100&&perf.triangles<=15000,'blank or over-budget rendering')
    return{people:after.players.length,maxLink,yaw:own.yaw,pitch:own.pitch,perf}
  })
  const host=await open('host',9541),b=await open('b',9542),c=await open('c',9543),lobby=[host,b,c]
  const code=await host.eval(`(()=>{const n=window.__teamPreview,code=n.makeCode();n.createLobby(code,'host');return code})()`)
  await host.waitFor(`window.__teamPreview.getNet().status==='joined'`,15000)
  for(const [i,p]of[b,c].entries())await p.eval(`window.__teamPreview.joinLobby('${code}','guest${i+1}')`)
  for(const p of lobby)await p.waitFor(`window.__teamPreview.getNet().peers===2`,20000)
  const ids=await Promise.all(lobby.map(p=>p.eval('window.__teamPreview.getNet().id')))
  await host.eval(`window.__teamPreview.chooseTheOne('${ids[0]}')`);await sleep(100);await host.eval(`document.querySelector('[data-preview-start]').click()`)
  for(const p of lobby)await playing(p)
  await check('three browsers agree on round and own bodies',async()=>{
    const views=await Promise.all(lobby.map(read));assert(views.every((r,i)=>r.id===views[0].id&&r.seed===views[0].seed&&r.soloId===ids[0]&&r.players.find(p=>p.mine)?.id===ids[i]),'round or own-body mismatch')
    return{id:views[0].id,soloId:ids[0],people:3}
  })
  await check('chain blocks the solo between teammates',async()=>{
    await lock(host);await key(host,'KeyW',true)
    await host.waitFor(`(${state}).players.find(p=>p.mine).z<2`,10000)
    await sleep(700);await key(host,'KeyW',false);await sleep(150)
    const r=await read(host),runner=r.players.find(p=>p.role==='solo')
    assert(runner.z>1.4&&runner.z<1.6,'runner crossed the chain')
    await capture(host,'chain-blocking.png');return{runnerZ:runner.z,chainZ:r.players.filter(p=>p.role==='team').map(p=>p.z)}
  })
  await check('a guest pulls an idle teammate through the authoritative chain',async()=>{
    const before=await read(host),idle=before.players.find(p=>p.id===ids[2]);await lock(b)
    await key(b,'KeyW',true);await sleep(1300);await key(b,'KeyW',false);await sleep(500)
    const after=await read(host),pulled=after.players.find(p=>p.id===ids[2]),team=after.players.filter(p=>p.role==='team'),length=Math.hypot(team[0].x-team[1].x,team[0].z-team[1].z)
    assert(pulled.z<idle.z-.5,'idle teammate never got pulled');assert(length<2.62,'guest stretched the chain')
    await capture(b,'guest-chain.png')
    return{idleBefore:idle.z,idleAfter:pulled.z,length}
  })
  await check('shared pause freezes all three clients',async()=>{
    await host.eval(`document.querySelector('[data-preview-pause]').click()`)
    for(const p of lobby)await p.waitFor(`document.querySelector('[data-paused]').dataset.paused==='true'`,10000)
    await sleep(200);const before=await Promise.all(lobby.map(read));await sleep(600);const after=await Promise.all(lobby.map(read))
    assert(after.every((r,i)=>r.elapsed===before[i].elapsed&&r.players.every((p,j)=>p.x===before[i].players[j].x&&p.z===before[i].players[j].z)),'pause moved time or bodies')
    await host.eval(`document.querySelector('[data-preview-pause]').click()`);await sleep(250)
    assert((await read(host)).elapsed>after[0].elapsed,'resume failed');return{clocks:after.map(r=>r.elapsed)}
  })
  const old=(await read(host)).id
  await host.eval(`window.__teamPreview.chooseTheOne('${ids[1]}')`);await sleep(100);await host.eval(`document.querySelector('[data-preview-start]').click()`)
  for(const p of lobby)await playing(p,old)
  await check('host-selected guest solo collects flags and escapes with real input',async()=>{
    const views=await Promise.all(lobby.map(read));assert(views.every(r=>r.soloId===ids[1]),'host selection did not stick')
    for(const target of [{x:-8,z:7},{x:-9,z:-7},{x:8,z:-6},{x:1,z:-10},{x:0,z:-16},{x:0,z:-21}])await drive(b,target)
    for(const p of lobby)await p.waitFor(`(${state})?.over===true`,15000)
    const ends=await Promise.all(lobby.map(read));assert(ends.every(r=>r.winner==='solo'&&r.checkpoint===3),'clients disagree about solo escape')
    await capture(b,'solo-wins.png');return{soloId:ids[1],elapsed:ends[0].elapsed,checkpoint:3,winner:'solo'}
  })
  const finalId=(await read(host)).id;await host.eval(`document.querySelector('[data-preview-start]').click()`);for(const p of lobby)await playing(p,finalId)
  await check('team departure re-forms chain and solo departure ends the round',async()=>{
    await c.eval(`window.__teamPreview.leaveLobby()`);await host.waitFor(`(${state}).players.find(p=>p.id==='${ids[2]}')?.left===true`,10000)
    const remaining=(await read(host)).players.filter(p=>p.role==='team'&&!p.left).length;assert(remaining===1,'departed teammate stayed in chain')
    await b.eval(`window.__teamPreview.leaveLobby()`);await host.waitFor(`(${state}).winner==='team'`,10000)
    return{remainingTeam:remaining,winner:(await read(host)).winner}
  })
  await check('real sixty-second team hold ending',async()=>{
    await solo.waitFor(`(${state})?.over===true`,85000);const end=await read(solo)
    assert(end.elapsed===60&&end.winner==='team','team did not win at 60 seconds');await capture(solo,'team-wins.png')
    return{elapsed:end.elapsed,winner:end.winner,checkpoint:end.checkpoint}
  })
}catch(e){error=e.stack;console.error(error);for(const p of pages)await p.shot(`failure-${p.name}.png`).catch(()=>{})}
finally{writeFileSync(join(here,'browser-results.json'),JSON.stringify({at:new Date().toISOString(),checks,error,consoleErrors:pages.flatMap(p=>p.errors.map(error=>({page:p.name,error})))},null,2));for(const p of pages)p.close();process.exit(error||pages.some(p=>p.errors.length)?1:0)}
