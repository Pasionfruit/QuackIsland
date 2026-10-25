import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {games,scenes} from './inventory.mjs'
const pipeline=JSON.parse(fs.readFileSync('pipeline.json','utf8'))
const report=JSON.parse(fs.readFileSync('src/modules/76-minigame-art/review/integration.json','utf8'))
assert.equal(report.length,games.length-1)
for(const id of games){
 if(id==='41-one-piece')continue
 const scene=scenes[id],source=fs.readFileSync(scene.filename,'utf8')
 assert.ok(source.includes(`<MinigameArt game="${id.slice(3)}"`),`${id}: scene attachment`)
 assert.ok(source.includes("from '../../76-minigame-art'"),`${id}: public import`)
 const metadata=pipeline.modules.find(m=>m.id===id)??JSON.parse(fs.readFileSync(path.join('src/modules',id,'module-entry.json'),'utf8'))
 assert.ok(metadata.dependsOn.includes('76-minigame-art'),`${id}: declared dependency`)
 for(const file of fs.readdirSync(path.dirname(scene.filename)).filter(f=>f.endsWith('.tsx'))){
  const content=fs.readFileSync(path.join(path.dirname(scene.filename),file),'utf8')
  assert.ok(!/<boxGeometry\b/.test(content),`${id}/${file}: unconverted box`)
 }
}
console.log(`${report.length} 3D scenes attached, public dependencies declared, ${report.reduce((n,g)=>n+g.boxes,0)} box declarations upgraded; One Piece has native SVG artwork.`)
