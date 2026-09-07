/**
 * The machine half of a gate.
 *
 * Runs everything that can be checked without a human looking at the screen,
 * and on success marks the module ready_for_review and regenerates its contract
 * snapshot. It does NOT pass the module - only a person can do that.
 */
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { declarationFor } from './check-contracts.mjs'
import { currentModule, findModule, moduleDir, readPipeline, writePipeline } from './lib/pipeline.mjs'

const pipeline = readPipeline()
const id = process.argv[2] ?? currentModule(pipeline)?.id
if (!id) {
  console.error('No module to gate. Pass one: npm run gate 01-terrain')
  process.exit(1)
}
const mod = findModule(pipeline, id)
if (!mod) {
  console.error(`Unknown module: ${id}`)
  process.exit(1)
}

const steps = [
  ['typecheck', 'npm run typecheck'],
  ['build', 'npm run build'],
  ['test', 'npm run test'],
  ['boundaries', 'node scripts/check-boundaries.mjs'],
  ['frozen', 'node scripts/check-frozen.mjs'],
  ['contracts', 'node scripts/check-contracts.mjs'],
  ['budgets', 'node scripts/check-budgets.mjs'],
]

console.log(`\n=== gate: ${id} ===`)
const started = Date.now()
for (const [name, cmd] of steps) {
  process.stdout.write(`\n--- ${name} ---\n`)
  try {
    execSync(cmd, { stdio: 'inherit' })
  } catch {
    console.log(`\nGATE RED: ${name} failed for ${id}.\n`)
    const fresh = readPipeline()
    findModule(fresh, id).gate.machine = { status: 'red', at: new Date().toISOString(), failed: name }
    writePipeline(fresh)
    process.exit(1)
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1)
const fresh = readPipeline()
const target = findModule(fresh, id)
target.gate.machine = { status: 'green', at: new Date().toISOString() }
if (target.status === 'planned' || target.status === 'in_progress' || target.status === 'blocks_complete') {
  target.status = 'ready_for_review'
}

// Snapshot the public contract so drift is detectable from here on.
const snap = declarationFor(id)
if (snap) {
  const p = join(moduleDir(id), 'contract.snapshot.d.ts')
  writeFileSync(p, snap + '\n', 'utf8')
  target.contract.snapshot = `src/modules/${id}/contract.snapshot.d.ts`
  const names = [...snap.matchAll(/declare (?:function|const|class) (\w+)|export \{([^}]*)\}/g)]
  if (names.length) target.contract.exports = [...new Set(snap.match(/^declare \w+ (\w+)/gm)?.map((s) => s.split(' ').pop()) ?? [])]
}
writePipeline(fresh)

console.log(`\nGATE GREEN: ${id} in ${secs}s.`)
console.log('This means it is ready for you to look at. It does not mean it passes.\n')

const md = join(moduleDir(id), 'MODULE.md')
if (existsSync(md)) {
  const text = readFileSync(md, 'utf8')
  const m = text.match(/##\s*How to review[\s\S]*?(?=\n## |$)/i)
  if (m) {
    console.log('--- what to check by hand ---')
    console.log(m[0].trim())
    console.log('')
  }
}
console.log(`When satisfied:  npm run gate:pass ${id} -- "your note"`)
console.log(`If not:          npm run gate:fail ${id} -- "what is wrong"\n`)
