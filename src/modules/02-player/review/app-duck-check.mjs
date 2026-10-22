import { launch,sleep } from '../../../../.claude/skills/run-localrot/scripts/cdp.mjs'
import { mkdtempSync,mkdirSync,copyFileSync,writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const out=mkdtempSync(join(tmpdir(),'localrot-app-ducks-'))
const here=new URL('.',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')
mkdirSync(join(here,'screenshots'),{recursive:true})
const pages=[],result={checks:[]}
const report=p=>p.eval(`(async()=>{const m=await import('/src/modules/02-player/review/scene-report.ts');return m.sceneReport()})()`)
const visible=r=>r.flatMap(s=>s.avatars).filter(a=>a.visible)
const api=(p,module,body)=>p.eval(`(async()=>{const m=await import('/src/modules/${module}/index.ts');${body}})()`)
async function open(name,port){const p=await launch({port,out,name});pages.push(p);await p.goto('http://localhost:5199/');await p.waitFor('Boolean(document.querySelector("canvas"))');await sleep(800);return p}
async function shot(p,name){copyFileSync(await p.shot(name),join(here,'screenshots',name))}
async function key(p,type,key,code){await p.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)})}
try {
 const host=await open('host',9565)
 result.home=await report(host);assert.equal(visible(result.home).length,1);assert.ok(visible(result.home).every(a=>a.duck))
 await shot(host,'home-duck.png');result.checks.push('The actual application home page mounts the shared duck model')
 console.log('Home duck verified')
 const code=await api(host,'09-net',"const code=m.makeCode();m.createLobby(code,'Duck host');return code")
 await host.waitFor("(async()=>{const m=await import('/src/modules/09-net/index.ts');return m.getNet().status==='joined'})()")
 const guest=await open('guest',9566)
 await api(guest,'09-net',`m.joinLobby(${JSON.stringify(code)},'Duck guest')`)
 await host.waitFor("(async()=>{const m=await import('/src/modules/09-net/index.ts');return m.getPeers().length===1})()")
 await guest.waitFor("(async()=>{const m=await import('/src/modules/09-net/index.ts');return m.getPeers().length===1})()")
 await sleep(500)
 const before=await api(guest,'02-player','return {...m.getPlayerState()}')
 await key(guest,'keyDown','d','KeyD');await sleep(550);await key(guest,'keyUp','d','KeyD');await sleep(350)
 const after=await api(guest,'02-player','return {...m.getPlayerState()}')
 assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.5)
 await api(guest,'02-player',"m.setFaceEmote('laugh')")
 await sleep(600)
 await host.waitFor("(async()=>{const m=await import('/src/modules/02-player/review/scene-report.ts');return m.sceneReport().flatMap(s=>s.avatars).some(a=>a.face==='duck-face-laugh')})()")
 result.lobby=await Promise.all([host,guest].map(report))
 assert.ok(result.lobby.every(r=>visible(r).length===2&&visible(r).every(a=>a.duck)))
 await shot(host,'lobby-ducks.png');await shot(guest,'lobby-ducks-guest.png')
 result.checks.push('Two separate browsers show local and remote ducks; native WASD movement works; guest laugh expression reaches host')
 await host.clickText('minigames')
 await host.waitFor("Boolean(document.querySelector('[data-minigame]'))")
 await host.pickMinigame('zombie-tag')
 await host.waitFor("Boolean(document.querySelector('[data-play]'))")
 await host.eval("document.querySelector('[data-play]').click()")
 const playing="(async()=>{const m=await import('/src/modules/15-minigames/index.ts');const s=m.getMinigameScreen();return s.at==='game'&&s.run.phase==='playing'})()"
 await Promise.all([host,guest].map(p=>p.waitFor(playing)))
 await sleep(1200)
 result.minigame=await Promise.all([host,guest].map(report))
 assert.ok(result.minigame.every(r=>visible(r).length>=2&&visible(r).every(a=>a.duck)))
 await shot(host,'zombie-tag-ducks.png')
 result.checks.push('Registered Zombie Tag inherits duck models for host and guest through the shared avatar contract')
 // Explicit art fixture through the public finish API, not a claimed gameplay win.
 await api(host,'15-minigames',"m.finishMinigame([{id:'art-1',name:'Duck first',place:1,colour:'#3f8fd6'},{id:'art-2',name:'Duck second',place:2,colour:'#e0563f'},{id:'art-3',name:'Duck third',place:3,colour:'#5eb85b'},{id:'art-4',name:'Duck fourth',place:4,colour:'#a45ee0'}])")
 await host.waitFor("Boolean(document.querySelector('[data-podium]'))")
 await sleep(1000);await shot(host,'podium-ducks.png')
 const podium=await host.eval("({figures:document.querySelectorAll('[data-pose]').length,pills:document.querySelectorAll('[data-podium] rect[rx=\"25\"],[data-podium] rect[rx=\"22\"]').length})")
 assert.equal(podium.figures,4);assert.equal(podium.pills,0)
 result.checks.push('Podium art fixture renders cheering, happy, straight and fallen ducks instead of capsule figures')
 result.errors=pages.flatMap(p=>p.errors);assert.deepEqual(result.errors,[])
 writeFileSync(join(here,'app-duck-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checks:result.checks,errors:result.errors},null,2))
}catch(e){for(const p of pages)await shot(p,`failure-${p.name}.png`).catch(()=>{});throw e}
finally{for(const p of pages)p.close()}
