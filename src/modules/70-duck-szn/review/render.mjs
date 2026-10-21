import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, sleep } from '../../../../.claude/skills/run-localrot/scripts/cdp.mjs'
const here=dirname(fileURLToPath(import.meta.url)),out=join(tmpdir(),'localrot-duck-szn-render')
mkdirSync(join(here,'screenshots'),{recursive:true})
const p=await launch({port:9530,out,name:'render',width:1200,height:820})
try {
  await p.goto('http://localhost:5199/src/modules/70-duck-szn/preview.html')
  await p.waitFor("!!document.querySelector('[data-preview-start]')",60000)
  await p.eval("document.querySelector('[data-preview-start]').click()")
  await p.waitFor("document.querySelector('[data-run-phase]')?.dataset.runPhase==='playing'",15000)
  await sleep(1500)
  const perf=await p.eval("(async()=>{const c=await import('/src/modules/00-core/index.ts');return c.readPerf()})()")
  console.log('render performance',JSON.stringify(perf))
  if(perf.drawCalls>100||perf.triangles>15000||perf.drawCalls===0)throw Error('render is blank or over the declared budget')
  copyFileSync(await p.shot('marsh-final.png'),join(here,'screenshots','marsh-final.png'))
  await p.send('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false})
  await sleep(300)
  copyFileSync(await p.shot('compact-layout.png'),join(here,'screenshots','compact-layout.png'))
  const layout=await p.eval("({width:innerWidth,documentWidth:document.documentElement.scrollWidth,boardHeight:document.querySelector('[data-board]').getBoundingClientRect().height})")
  if(layout.documentWidth>layout.width||layout.boardHeight<250)throw Error('compact layout overflow or unusable viewport')
  writeFileSync(join(here,'render-results.json'),JSON.stringify({at:new Date().toISOString(),perf,layout,consoleErrors:p.errors},null,2))
} finally {p.close()}
