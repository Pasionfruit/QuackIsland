/**
 * The human half of a gate. Only a person runs this.
 *
 * It refuses unless the machine gate is currently green, so "I looked at it and
 * it was fine" can never be recorded over a module that does not build.
 * Passing freezes the module: its file hashes are recorded here, and from this
 * point check-frozen will reject any edit to it.
 */
import { execSync } from 'node:child_process'
import { findModule, hashFiles, hashTree, moduleDir, readPipeline, writePipeline } from './lib/pipeline.mjs'

const id = process.argv[2]
const note = process.argv.slice(3).join(' ').replace(/^--\s*/, '').trim()
if (!id) {
  console.error('Usage: npm run gate:pass <module> -- "note"')
  process.exit(1)
}

const pipeline = readPipeline()
const mod = findModule(pipeline, id)
if (!mod) {
  console.error(`Unknown module: ${id}`)
  process.exit(1)
}
if (mod.status === 'passed') {
  console.error(`${id} is already passed and frozen.`)
  process.exit(1)
}
if (mod.gate?.machine?.status !== 'green') {
  console.error(`${id} has no green machine gate. Run: npm run gate ${id}`)
  process.exit(1)
}
if (!note) {
  console.error('A note is required - what did you check, and what convinced you?')
  process.exit(1)
}

let commit = 'unknown'
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim()
} catch {}

const dir = moduleDir(id)
const at = new Date().toISOString()
mod.status = 'passed'
mod.gate.human = { status: 'pass', at, note }
mod.gate.history = [...(mod.gate.history ?? []), { at, result: 'pass', note }]
mod.freeze = { sha256: hashTree(dir), files: hashFiles(dir), at, commit }
writePipeline(pipeline)

console.log(`\n${id} PASSED and is now frozen.`)
console.log(`  ${Object.keys(mod.freeze.files).length} files hashed. Any edit from here fails check:frozen.`)
console.log(`  To reopen it later: npm run unfreeze ${id} -- "reason"\n`)

const next = pipeline.modules.find((m) => m.status === 'planned')
if (next) console.log(`Next up: ${next.id} - ${next.title}\n`)
