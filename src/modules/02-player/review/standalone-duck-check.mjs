import {launch,sleep} from '../../../../.claude/skills/run-localrot/scripts/cdp.mjs'
import {mkdtempSync,copyFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
const here=new URL('.',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')
const out=mkdtempSync(join(tmpdir(),'localrot-other-ducks-'))
const p=await launch({port:9567,out,name:'standalone-ducks'})
const result={}
try {
 for(const [module,start] of [['69-trust-me-bro','[data-start]'],['70-duck-szn','[data-preview-start]'],['71-me-in-team','[data-preview-start]']]){
  await p.goto(`http://localhost:5199/src/modules/${module}/preview.html`)
  await p.waitFor(`Boolean(document.querySelector(${JSON.stringify(start)}))`)
  await p.eval(`document.querySelector(${JSON.stringify(start)}).click()`)
  await p.waitFor('Boolean(document.querySelector("canvas"))')
  await sleep(4300)
  const report=await p.eval(`(async()=>{const m=await import('/src/modules/02-player/review/scene-report.ts');return m.sceneReport()})()`)
  const ducks=report.flatMap(r=>r.avatars).filter(a=>a.visible)
  assert.ok(ducks.length>=3);assert.ok(ducks.every(a=>a.duck))
  assert.ok(report.some(r=>r.render.calls>0&&r.render.triangles>0))
  result[module]={ducks:ducks.length,render:report.map(r=>r.render)}
  const name=`${module}-ducks.png`
  copyFileSync(await p.shot(name),join(here,'screenshots',name))
 }
 result.errors=p.errors;assert.deepEqual(result.errors,[])
 writeFileSync(join(here,'standalone-duck-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{p.close()}
