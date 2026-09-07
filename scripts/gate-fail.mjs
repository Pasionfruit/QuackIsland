/** Records a human rejection and sends the module back for changes. */
import { findModule, readPipeline, writePipeline } from './lib/pipeline.mjs'

const id = process.argv[2]
const reason = process.argv.slice(3).join(' ').replace(/^--\s*/, '').trim()
if (!id || !reason) {
  console.error('Usage: npm run gate:fail <module> -- "what is wrong"')
  process.exit(1)
}
const pipeline = readPipeline()
const mod = findModule(pipeline, id)
if (!mod) {
  console.error(`Unknown module: ${id}`)
  process.exit(1)
}
const at = new Date().toISOString()
mod.status = 'changes_requested'
mod.gate.human = { status: 'changes_requested', at, note: reason }
mod.gate.history = [...(mod.gate.history ?? []), { at, result: 'changes_requested', note: reason }]
writePipeline(pipeline)
console.log(`\n${id} sent back: ${reason}`)
console.log('The next agent will read this from pipeline.json.\n')
