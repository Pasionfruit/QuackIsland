import { launch,sleep } from '../../../../.claude/skills/run-localrot/scripts/cdp.mjs'
import { mkdtempSync,copyFileSync,writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const out=mkdtempSync(join(tmpdir(),'localrot-tug-ducks-'))
const here=new URL('.',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')
const p=await launch({port:9564,out,name:'duck-models',width:1440,height:900})
const shot=async name=>copyFileSync(await p.shot(name),join(here,'screenshots',name))
const result={}
try {
 await p.goto('http://localhost:5199/src/modules/72-tug-of-war/preview.html')
 await p.waitFor('window.__tugPreview')
 await p.eval("document.querySelector('[data-preview-start]').click()")
 await p.waitFor("document.querySelector('[data-run-phase]')?.dataset.runPhase==='playing'")
 await sleep(200)
 await shot('ducks-playing.png')
 await p.eval("document.querySelector('[data-preview-pause]').click()")
 await sleep(400)
 result.game=await p.eval(`(async()=>{const c=await import('/src/modules/00-core/index.ts');return c.readPerf()})()`)
 assert.ok(result.game.drawCalls>0&&result.game.drawCalls<=100)
 assert.ok(result.game.triangles>0&&result.game.triangles<=15000)
 // Exercise the same native control after replacing the character meshes.
 await p.eval("document.querySelector('[data-preview-pause]').click();document.activeElement.blur()")
 await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'1',code:'Digit1',windowsVirtualKeyCode:49,text:'1'})
 await p.send('Input.dispatchKeyEvent',{type:'keyUp',key:'1',code:'Digit1',windowsVirtualKeyCode:49})
 await sleep(120)
 assert.equal(await p.eval("Number(document.querySelector('[data-correct]').dataset.correct)"),1)
 await p.send('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false});await sleep(200);await shot('ducks-compact.png')
 await p.eval("document.querySelector('[data-preview-pause]').click()")
 await p.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
 result.models=await p.eval(`(async()=>{const m=await import('/src/modules/72-tug-of-war/review/duck-view.ts');return m.renderDuckStudy()})()`)
 assert.ok(result.models.geometries.every(m=>m.finite&&m.triangles<3000))
 await shot('ducks-closeup.png')
 // Fresh page disposes the review renderer before the full-roster fixture.
 await p.goto('http://localhost:5199/src/modules/72-tug-of-war/preview.html')
 await p.waitFor('window.__tugPreview')
 await p.eval(`(async()=>{const m=await import('/src/modules/72-tug-of-war/review/duck-view.ts');m.renderFullTeamStudy()})()`)
 await sleep(600)
 result.eightPlayer=await p.eval(`(async()=>{const c=await import('/src/modules/00-core/index.ts');return c.readPerf()})()`)
 assert.ok(result.eightPlayer.drawCalls>0&&result.eightPlayer.drawCalls<=100)
 assert.ok(result.eightPlayer.triangles>0&&result.eightPlayer.triangles<=15000)
 await shot('ducks-eight-player.png')
 result.errors=p.errors;assert.deepEqual(p.errors,[])
 writeFileSync(join(here,'duck-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{p.close()}
