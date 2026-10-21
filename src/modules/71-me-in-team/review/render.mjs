import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { launch, sleep } from '../../../../.claude/skills/run-localrot/scripts/cdp.mjs'
const here=dirname(fileURLToPath(import.meta.url)),out=join(tmpdir(),'localrot-me-in-team-render')
mkdirSync(join(here,'screenshots'),{recursive:true})
const p=await launch({port:9550,out,name:'render',width:800,height:600})
try{
  await p.goto('http://localhost:5199/src/modules/71-me-in-team/preview.html');await p.waitFor(`!!document.querySelector('[data-preview-start]')`,60000)
  await p.eval(`document.querySelector('[data-preview-start]').click()`);await p.waitFor(`document.querySelector('[data-run-phase]')?.dataset.runPhase==='playing'`,20000);await sleep(1200)
  const layout=await p.eval(`({width:innerWidth,documentWidth:document.documentElement.scrollWidth,boardHeight:document.querySelector('[data-board]').getBoundingClientRect().height})`)
  const perf=await p.eval(`(async()=>{const c=await import('/src/modules/00-core/index.ts');return c.readPerf()})()`)
  if(layout.width!==layout.documentWidth||layout.boardHeight<250||perf.drawCalls<1||perf.drawCalls>100||perf.triangles>15000)throw Error('layout or rendering budget failed')
  copyFileSync(await p.shot('compact-layout.png'),join(here,'screenshots','compact-layout.png'))
  writeFileSync(join(here,'render-results.json'),JSON.stringify({at:new Date().toISOString(),layout,perf,consoleErrors:p.errors},null,2));console.log(JSON.stringify({layout,perf}))
}finally{p.close()}
