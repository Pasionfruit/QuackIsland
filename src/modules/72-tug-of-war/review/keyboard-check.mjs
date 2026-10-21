import { launch, sleep } from '../../../../.claude/skills/run-localrot/scripts/cdp.mjs'
import { mkdtempSync, copyFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const out=mkdtempSync(join(tmpdir(),'localrot-tug-keys-'))
const here=new URL('.',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')
const p=await launch({port:9563,out,name:'keyboard',width:1440,height:900})
const press=async(key,code)=>{
 await p.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,text:key,windowsVirtualKeyCode:key.charCodeAt(0)})
 await p.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:key.charCodeAt(0)})
}
try{
 await p.goto('http://localhost:5199/src/modules/72-tug-of-war/preview.html')
 await p.waitFor('window.__tugPreview')
 await p.eval("document.querySelector('[data-preview-start]').click()")
 await p.waitFor("document.querySelector('[data-run-phase]')?.dataset.runPhase==='playing'")
 await p.eval('document.activeElement.blur()')
 await press('1','Digit1');await sleep(150)
 assert.equal(await p.eval("Number(document.querySelector('[data-correct]').dataset.correct)"),1)
 await p.eval("document.querySelector('[aria-label=\"Player name\"]').focus()")
 await press('1','Digit1');await sleep(150)
 assert.equal(await p.eval("Number(document.querySelector('[data-correct]').dataset.correct)"),1)
 assert.ok((await p.eval("document.querySelector('[aria-label=\"Player name\"]').value")).includes('1'))
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:1,mobile:false})
 await sleep(200)
 const layout=await p.eval(`({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON()})`)
 assert.equal(layout.width,layout.scroll);assert.ok(layout.canvas.height>200)
 copyFileSync(await p.shot('narrow-390.png'),join(here,'screenshots','narrow-390.png'))
 assert.deepEqual(p.errors,[])
 writeFileSync(join(here,'keyboard-results.json'),JSON.stringify({checks:['Native CDP keypress pulls once','Typing in the player-name field does not pull','390px layout fits without horizontal scrolling'],layout,errors:p.errors},null,2))
 console.log('Native keyboard, editable field and narrow layout passed',layout)
}finally{p.close()}
