import { launch, sleep } from '../../../../.claude/skills/run-localrot/scripts/cdp.mjs'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const out=mkdtempSync(join(tmpdir(),'localrot-tug-'))
const here=new URL('.',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')
mkdirSync(join(here,'screenshots'),{recursive:true})
const pages=[]
const evidence={checks:[],screenshots:[]}
const url='http://localhost:5199/src/modules/72-tug-of-war/preview.html'
const state=`(()=>{const el=document.querySelector('[data-tug-game]');if(!el)return null;let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];while(f&&f.type?.name!=='TugPanel')f=f.return;return f?.memoizedState?.memoizedState??null})()`
const read=p=>p.eval(state)
const click=(p,selector)=>p.eval(`document.querySelector(${JSON.stringify(selector)}).click()`)
const tap=(p,key,extra={})=>p.eval(`(()=>{const o={key:${JSON.stringify(key)},code:${JSON.stringify(key==='1'?'Digit1':`Key${key}`)},bubbles:true,...${JSON.stringify(extra)}};window.dispatchEvent(new KeyboardEvent('keydown',o));window.dispatchEvent(new KeyboardEvent('keyup',o))})()`)
async function shot(p,name){copyFileSync(await p.shot(name),join(here,'screenshots',name));evidence.screenshots.push(name)}
async function open(name,port){const p=await launch({port,out,name});pages.push(p);await p.goto(url);await p.waitFor('window.__tugPreview');return p}
async function start(p,others=[]){await click(p,'[data-preview-start]');await Promise.all([p,...others].map(x=>x.waitFor("document.querySelector('[data-run-phase]')?.dataset.runPhase==='playing'")));await sleep(150)}
async function untilOver(p,key){for(let i=0;i<250;i++){if((await read(p)).over)return;if(key)await tap(p,key);await sleep(key?95:150)}throw Error('No winner')}
try {
 const solo=await open('solo',9560)
 await click(solo,'[data-preview-start]');await tap(solo,'1');await sleep(200)
 assert.equal((await read(solo)).players.find(p=>p.mine).correct,0)
 await solo.waitFor("document.querySelector('[data-run-phase]')?.dataset.runPhase==='playing'")
 await solo.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'1',code:'Digit1'}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'1',code:'Digit1'}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'1',code:'Digit1',repeat:true}))`)
 await sleep(180);assert.equal((await read(solo)).players.find(p=>p.mine).correct,1)
 await solo.eval(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'1',code:'Digit1'}))`)
 await shot(solo,'solo-playing.png')
 const perf=await solo.eval(`(async()=>{const c=await import('/src/modules/00-core/index.ts');return c.readPerf()})()`)
 evidence.performance=perf
 await untilOver(solo,'1');assert.equal((await read(solo)).winner,'solo');await shot(solo,'solo-wins.png')
 evidence.checks.push('Countdown ignores input; held/repeated keys count once; solo beats four bots with released key taps')
 await start(solo);await untilOver(solo);assert.equal((await read(solo)).winner,'team');await shot(solo,'team-wins.png')
 evidence.checks.push('Stand-ins type sequences and can pull to a team victory')
 await solo.eval(`window.__tugPreview.createLobby('TUGQA','Host')`)
 await solo.waitFor("window.__tugPreview.getNet().status==='joined'")
 const guest=await open('guest',9561), team=await open('team',9562)
 await guest.eval(`window.__tugPreview.joinLobby('TUGQA','Solo')`);await guest.waitFor("window.__tugPreview.getNet().status==='joined'")
 await team.eval(`window.__tugPreview.joinLobby('TUGQA','Team')`);await team.waitFor("window.__tugPreview.getNet().status==='joined'")
 await solo.waitFor('window.__tugPreview.getPeers().length===2')
 const gid=await guest.eval('window.__tugPreview.getNet().id')
 console.log('Guest net',await guest.eval('window.__tugPreview.getNet()'))
 await solo.eval(`window.__tugPreview.chooseTheOne(${JSON.stringify(gid)})`)
 await start(solo,[guest,team]);
 const rounds=await Promise.all([solo,guest,team].map(read));evidence.rosters=rounds.map(r=>({id:r.id,seed:r.seed,soloId:r.soloId,players:r.players.map(p=>({id:p.id,mine:p.mine,bot:p.bot}))}))
 assert.equal(rounds[0].soloId,gid);assert.ok(rounds.every(r=>r.seed===rounds[0].seed&&r.players.filter(p=>p.mine).length===1&&r.players.length===3))
 await click(solo,'[data-preview-pause]');await sleep(350)
 const paused=await read(solo);await tap(guest,'1');await sleep(500);assert.equal((await read(solo)).elapsed,paused.elapsed);assert.equal((await read(solo)).pull,paused.pull)
 await click(solo,'[data-preview-pause]');await sleep(350);assert.equal((await read(solo)).pull,0)
 evidence.checks.push('Three separate browsers agree on seeded roster and guest solo; shared pause freezes time and ignores input without buffering')
 const expected=()=>solo.eval("document.querySelector('[data-next-key]')?.dataset.nextKey")
 const first=await expected();await tap(solo,first);const projected=await expected();assert.notEqual(projected,first)
 const wrong=['A','S','D','F','J','K','L'].find(k=>k!==projected);await tap(solo,wrong);await sleep(350)
 const own=(await read(solo)).players.find(p=>p.mine);assert.equal(own.cursor,0);assert.equal(own.correct,1);assert.equal(own.mistakes,1)
 evidence.checks.push('Personal key display advances immediately before snapshots; wrong key resets progress without adding pull')
 await shot(solo,'team-playing.png');await shot(guest,'guest-solo.png')
 for(let i=0;i<150&&!(await read(solo)).over;i++){
   await Promise.all([solo,team].map(async p=>tap(p,await p.eval("document.querySelector('[data-next-key]').dataset.nextKey"))));await sleep(100)
 }
 await Promise.all([solo,guest,team].map(p=>p.waitFor(`${state}?.over===true`)))
 assert.ok((await Promise.all([solo,guest,team].map(read))).every(r=>r.winner==='team'))
 evidence.checks.push('Host and guest teammates type personal sequences to a team win replicated to all three browsers')
 await start(solo,[guest,team]);await untilOver(guest,'1');await sleep(500)
 assert.ok((await Promise.all([solo,guest,team].map(read))).every(r=>r.winner==='solo'))
 evidence.checks.push('Guest solo wins using keyboard intents; all clients receive final winner')
 await start(solo,[guest,team]);await guest.eval('window.__tugPreview.leaveLobby()');await solo.waitFor(`${state}?.over===true`);assert.equal((await read(solo)).winner,'team')
 evidence.checks.push('Solo departure awards team victory')
 await solo.send('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false})
 await start(solo,[team]);await sleep(250);await shot(solo,'compact-800.png')
 evidence.compact=await solo.eval(`({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON()})`)
 assert.equal(evidence.compact.width,evidence.compact.scroll)
 evidence.errors=pages.flatMap(p=>p.errors);assert.deepEqual(evidence.errors,[])
 writeFileSync(join(here,'browser-results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2))
} catch(e){for(const p of pages)await shot(p,`failure-${p.name}.png`).catch(()=>{});throw e}
finally{for(const p of pages)p.close()}
