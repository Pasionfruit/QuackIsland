// Run from the repo root. Needs Vite :5199 and the relay :8791.
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, sleep } from '../../../../.claude/skills/run-localrot/scripts/cdp.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(tmpdir(), 'localrot-duck-szn-review')
mkdirSync(out, { recursive: true }); mkdirSync(join(here, 'screenshots'), { recursive: true })
const pages = [], checks = []
const state = `(() => { const el=document.querySelector('[data-duck-szn]'); if(!el)return null;const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$'));let f=el[key];while(f&&f.type?.name!=='DuckSznPanel')f=f.return;return f?.memoizedState?.memoizedState??null })()`
const assert = (ok, message) => { if (!ok) throw Error(message) }
const key = (p, code, down) => p.eval(`window.dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}',{key:${JSON.stringify(code === 'Space' ? ' ' : code.slice(3).toLowerCase())},code:'${code}',bubbles:true}))`)
async function lock(p) {
  await p.eval(`Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.querySelector('[data-board]')});document.dispatchEvent(new Event('pointerlockchange'))`)
}
async function shot(p) { await p.eval(`document.querySelector('[data-board]').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}))`) }
async function screenshot(p, file) { const path = await p.shot(file); copyFileSync(path, join(here, 'screenshots', file)) }
async function check(name, fn) {
  const evidence = await fn(); checks.push({ name, ok: true, evidence }); console.log('OK', name, JSON.stringify(evidence))
  writeFileSync(join(here, 'browser-results.json'), JSON.stringify({ at: new Date().toISOString(), checks }, null, 2))
}
async function open(name, port) {
  const p = await launch({ port, out, name, width: 1200, height: 820 }); pages.push(p)
  await p.goto('http://localhost:5199/src/modules/70-duck-szn/preview.html')
  await p.waitFor('!!window.__duckPreview', 60000)
  return p
}
let error = null
try {
  const solo = await open('solo', 9520)
  await screenshot(solo, 'welcome.png')
  await solo.eval(`document.querySelector('[data-preview-start]').click()`)
  await solo.waitFor(`!!${state}`, 15000)
  await check('countdown ignores walking and firing', async () => {
    await lock(solo)
    const before = await solo.eval(state)
    await key(solo, 'KeyW', true); await shot(solo); await sleep(300); await key(solo, 'KeyW', false)
    const after = await solo.eval(state)
    assert(after.elapsed === 0 && after.players[0].shots === 0 && after.players[0].z === before.players[0].z, 'countdown accepted game input')
    return { elapsed: after.elapsed, shots: after.players[0].shots }
  })
  await solo.waitFor(`(${state})?.elapsed>0.2`, 15000); await lock(solo)
  await check('solo roster, WASD, mouse and firing cooldown', async () => {
    const initial = await solo.eval(state), me = initial.players.find(p => p.mine)
    assert(me.role === 'hunter' && initial.players.filter(p => p.bot).length === 4, 'solo deal is wrong')
    await key(solo, 'KeyW', true); await sleep(450); await key(solo, 'KeyW', false); await sleep(100)
    const walked = await solo.eval(state), walker = walked.players.find(p => p.mine)
    assert(Math.hypot(walker.x-me.x, walker.z-me.z)>1, 'W did not move')
    await solo.eval(`document.dispatchEvent(new MouseEvent('mousemove',{movementX:40,movementY:-15,bubbles:true}))`)
    await sleep(100)
    const aimed = (await solo.eval(state)).players.find(p => p.mine)
    assert(Math.abs(aimed.yaw-walker.yaw+40*0.0022)<0.005 && Math.abs(aimed.pitch-walker.pitch-15*0.0022)<0.005, 'mouse aiming uses the wrong direction or sensitivity')
    await shot(solo); await sleep(120); const first = await solo.eval(state)
    await shot(solo); await sleep(120); const second = await solo.eval(state)
    assert(first.players.find(p=>p.mine).shots===1 && second.players.find(p=>p.mine).shots===1, 'firing or cooldown failed')
    await screenshot(solo,'solo-hunter.png')
    return { role: me.role, people: initial.players.length, travelled: Math.hypot(walker.x-me.x,walker.z-me.z), yaw: aimed.yaw, pitch: aimed.pitch, shots: 1 }
  })

  const host = await open('host',9521), guest = await open('guest',9522)
  const code = await host.eval(`(()=>{const c=window.__duckPreview.makeCode();window.__duckPreview.createLobby(c,'host');return c})()`)
  await host.waitFor(`window.__duckPreview.getNet().status==='joined'`,15000)
  await guest.eval(`window.__duckPreview.joinLobby('${code}','guest')`)
  for(const p of [host,guest])await p.waitFor(`window.__duckPreview.getNet().peers===1`,15000)
  const guestId=await guest.eval('window.__duckPreview.getNet().id')
  await host.eval(`window.__duckPreview.chooseTheOne('${guestId}')`)
  await sleep(150);await host.eval(`document.querySelector('[data-preview-start]').click()`)
  for(const p of [host,guest])await p.waitFor(`(${state})?.elapsed>0.2`,15000)
  await check('host-selected guest hunter and matching round',async()=>{
    const views=await Promise.all([host,guest].map(p=>p.eval(state)))
    assert(views.every(r=>r.hunterId===guestId&&r.id===views[0].id&&r.seed===views[0].seed&&r.players.length===2),'round or role mismatch')
    assert(views[0].players.find(p=>p.mine).role==='duck'&&views[1].players.find(p=>p.mine).role==='hunter','own bodies wrong')
    await screenshot(host,'host-duck.png');await screenshot(guest,'guest-hunter.png')
    return {id:views[0].id,seed:views[0].seed,hunterId:guestId}
  })
  await check('duck hiding and movement reach the other browser',async()=>{
    await lock(host);await key(host,'Space',true);await key(host,'KeyW',true);await sleep(400);await key(host,'KeyW',false);await sleep(300)
    const view=await guest.eval(state), duck=view.players.find(p=>p.role==='duck')
    assert(duck.crouch,'hide did not reach guest')
    await screenshot(host,'duck-hiding.png')
    await key(host,'Space',false);await sleep(250)
    assert(!(await guest.eval(state)).players.find(p=>p.role==='duck').crouch,'hide key stayed stuck')
    return {crouch:true,x:duck.x,z:duck.z}
  })
  await check('guest hunter shot eliminates host duck',async()=>{
    await lock(guest)
    await guest.eval(`(()=>{const r=${state};const h=r.players.find(p=>p.mine),d=r.players.find(p=>p.role==='duck');const yaw=Math.atan2(-(d.x-h.x),-(d.z-h.z)),pitch=Math.atan2(.475-1.62,Math.hypot(d.x-h.x,d.z-h.z));document.dispatchEvent(new MouseEvent('mousemove',{movementX:Math.round((h.yaw-yaw)/.0022),movementY:Math.round((h.pitch-pitch)/.0022),bubbles:true}))})()`)
    await sleep(150);await shot(guest)
    for(const p of [host,guest])await p.waitFor(`(${state})?.over===true`,10000)
    const views=await Promise.all([host,guest].map(p=>p.eval(state)))
    assert(views.every(r=>r.winner==='hunter'&&r.players.find(p=>p.role==='duck').alive===false),'shot result disagrees')
    assert(views[0].players.find(p=>p.role==='hunter').kills===1,'host never credited the guest kill')
    await screenshot(guest,'hunter-wins.png')
    return {winner:views[0].winner,shots:views[0].players.find(p=>p.role==='hunter').shots,kills:1}
  })
  await host.eval(`document.querySelector('[data-preview-start]').click()`)
  for(const p of [host,guest])await p.waitFor(`(${state})?.elapsed>0.2`,15000)
  await check('shared pause and resume',async()=>{
    await host.eval(`document.querySelector('[data-preview-pause]').click()`)
    await guest.waitFor(`document.querySelector('[data-paused]').dataset.paused==='true'`,10000)
    await sleep(200);const before=await Promise.all([host,guest].map(p=>p.eval(`(${state}).elapsed`)))
    await sleep(600);const after=await Promise.all([host,guest].map(p=>p.eval(`(${state}).elapsed`)))
    assert(after.every((t,i)=>Math.abs(t-before[i])<.001),'pause advanced a game clock')
    await host.eval(`document.querySelector('[data-preview-pause]').click()`);await sleep(400)
    assert(await host.eval(`(${state}).elapsed`)>after[0],'clock failed to resume')
    return {before,after}
  })
  await check('departing guest hunter awards the ducks the round',async()=>{
    await guest.eval('window.__duckPreview.getNet();window.__duckPreview.chooseTheOne(null)')
    await guest.eval(`(async()=>{const n=await import('/src/modules/09-net/index.ts');n.leaveLobby()})()`)
    await host.waitFor(`(${state})?.winner==='duck'`,10000)
    return {winner:(await host.eval(state)).winner}
  })
  await check('real sixty-second solo survival ending',async()=>{
    await solo.waitFor(`(${state})?.over===true`,80000)
    const end=await solo.eval(state)
    assert(end.elapsed===60&&end.winner==='duck'&&end.players.some(p=>p.role==='duck'&&p.alive&&!p.left),'surviving ducks did not win at 60 seconds')
    await screenshot(solo,'ducks-win.png')
    return {elapsed:end.elapsed,winner:end.winner,survivors:end.players.filter(p=>p.role==='duck'&&p.alive&&!p.left).length}
  })
} catch(e) { error=e.stack;console.error(error);for(const p of pages)await p.shot(`failure-${p.name}.png`).catch(()=>{}) }
finally {
  const consoleErrors=pages.flatMap(p=>p.errors.map(error=>({page:p.name,error})))
  writeFileSync(join(here,'browser-results.json'),JSON.stringify({at:new Date().toISOString(),checks,error,consoleErrors},null,2))
  for(const p of pages)p.close()
  process.exit(error||consoleErrors.length?1:0)
}
