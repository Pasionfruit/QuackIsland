/**
 * The session-opening read.
 *
 * `pipeline.json` is ~139KB, and ~94KB of that is 52 modules' blocks and
 * nonGoals - scratch state that belongs to whoever is working that module and
 * to nobody else. An agent that reads the whole manifest to find its one entry
 * spends tens of thousands of tokens on 51 modules it is forbidden to touch.
 *
 * This prints the same information an agent is actually allowed to act on:
 * the conventions, its own module in full, and the public contract of each
 * dependency. Nothing else.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { currentModule, findModule, moduleDir, readPipeline } from './lib/pipeline.mjs'

const pipeline = readPipeline()
const requested = process.argv[2]
const mod = requested ? findModule(pipeline, requested) : currentModule(pipeline)

if (requested && !mod) {
  console.error(`Unknown module: ${requested}`)
  process.exit(1)
}

const out = []
const say = (s = '') => out.push(s)

say('=== conventions ===')
for (const [k, v] of Object.entries(pipeline.conventions)) {
  say(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
}
say('=== budgets ===')
for (const [k, v] of Object.entries(pipeline.budgets)) say(`  ${k}: ${v}`)

const frozen = pipeline.modules.filter((m) => m.status === 'passed').map((m) => m.id)
say('')
say(`=== frozen (do not edit: ${frozen.length}) ===`)
say(frozen.length ? '  ' + frozen.join(' ') : '  none yet')

const counts = {}
for (const m of pipeline.modules) counts[m.status] = (counts[m.status] ?? 0) + 1
say('')
say('=== pipeline status ===')
say('  ' + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('  '))

if (!mod) {
  say('')
  say('=== your module ===')
  say('  NONE. No module is in_progress and none are planned.')
  say('  Every module is awaiting a human PASS, so there is no assigned work.')
  say('  Ask the human what to do before touching anything.')
  console.log(out.join('\n'))
  process.exit(0)
}

say('')
say(`=== your module: ${mod.id} (${mod.status}) ===`)
say(`  ${mod.title}`)
if (mod.blockers?.length) {
  say('  BLOCKERS:')
  for (const b of mod.blockers) say(`    - ${b}`)
}
if (mod.budgets) say(`  budgets: ${JSON.stringify(mod.budgets)}`)
if (mod.gate) say(`  gate: ${typeof mod.gate === 'object' ? JSON.stringify(mod.gate) : mod.gate}`)

if (mod.nonGoals?.length) {
  say('  nonGoals:')
  for (const n of mod.nonGoals) say(`    - ${n}`)
}

say('  blocks:')
for (const b of mod.blocks ?? []) say(`    [${b.status === 'done' ? 'x' : ' '}] ${b.id} ${b.title}`)

const md = join(moduleDir(mod.id), 'MODULE.md')
say(`  MODULE.md: ${existsSync(md) ? `src/modules/${mod.id}/MODULE.md (read it)` : 'not written yet (you write it)'}`)

say('')
say('=== your dependencies (public contract only) ===')
if (!mod.dependsOn?.length) say('  none')
for (const depId of mod.dependsOn ?? []) {
  const dep = findModule(pipeline, depId)
  say(`  ${depId} (${dep?.status ?? 'unknown'})`)
  const exports = dep?.contract?.exports ?? []
  say(exports.length ? `    exports: ${exports.join(', ')}` : '    exports: (none declared)')
  const depMd = join(moduleDir(depId), 'MODULE.md')
  if (existsSync(depMd)) say(`    read: src/modules/${depId}/MODULE.md`)
}

say('')
say('Anything not listed above is out of bounds. Do not open other modules.')

console.log(out.join('\n'))
