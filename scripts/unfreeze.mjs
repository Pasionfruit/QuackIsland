/**
 * The escape hatch. Only a person runs this.
 *
 * Reopening a frozen module is allowed but deliberately expensive: it records
 * why, bumps the generation, and prints every dependent that will have to be
 * re-verified. That cost is the point - it makes getting a contract right the
 * first time cheaper than repairing it later.
 */
import { findModule, readPipeline, writePipeline } from './lib/pipeline.mjs'

const id = process.argv[2]
const reason = process.argv.slice(3).join(' ').replace(/^--\s*/, '').trim()
if (!id || !reason) {
  console.error('Usage: npm run unfreeze <module> -- "why this has to be reopened"')
  process.exit(1)
}
const pipeline = readPipeline()
const mod = findModule(pipeline, id)
if (!mod) {
  console.error(`Unknown module: ${id}`)
  process.exit(1)
}
if (mod.status !== 'passed') {
  console.error(`${id} is not frozen (status: ${mod.status}). Nothing to unfreeze.`)
  process.exit(1)
}

const at = new Date().toISOString()
mod.unfreezes = [...(mod.unfreezes ?? []), { at, reason, priorSha256: mod.freeze?.sha256 ?? null, generation: mod.generation }]
mod.generation = (mod.generation ?? 1) + 1
mod.status = 'in_progress'
mod.gate.machine = { status: 'unknown' }
mod.gate.human = { status: 'pending' }
mod.freeze = null
writePipeline(pipeline)

console.log(`\n${id} is unfrozen (generation ${mod.generation}).`)
console.log(`Reason recorded: ${reason}\n`)
console.log('Rules for the agent fixing it:')
console.log('  - You may ADD exports. You may not remove or change existing signatures.')
console.log('  - check:contracts will catch you if you do.\n')
const deps = mod.dependents ?? []
if (deps.length) {
  console.log('When this is re-gated, these must be re-verified by hand too:')
  for (const d of deps) console.log(`  - ${d}`)
  console.log('')
} else {
  console.log('Nothing depends on this yet, so nothing else needs re-verifying.\n')
}
