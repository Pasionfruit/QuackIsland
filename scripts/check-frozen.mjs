/**
 * The teeth on "a completed module is never edited again".
 *
 * Every module with status `passed` has its file tree hashed at freeze time.
 * This re-hashes and names exactly which files changed, so the failure is
 * actionable rather than just "something moved".
 */
import { fail, hashFiles, hashTree, moduleDir, ok, readPipeline, exists } from './lib/pipeline.mjs'

const pipeline = readPipeline()
const frozen = pipeline.modules.filter((m) => m.status === 'passed')

console.log('\nfrozen modules\n')

if (frozen.length === 0) {
  ok('nothing frozen yet')
  process.exit(0)
}

let bad = 0
for (const mod of frozen) {
  const dir = moduleDir(mod.id)
  if (!exists(dir)) {
    fail(`${mod.id} is marked passed but its directory is gone`)
    bad++
    continue
  }
  if (!mod.freeze?.sha256) {
    fail(`${mod.id} is marked passed but has no freeze hash recorded`)
    bad++
    continue
  }
  const now = hashTree(dir)
  if (now === mod.freeze.sha256) {
    ok(`${mod.id} untouched`)
    continue
  }
  bad++
  fail(`${mod.id} has been modified since it was frozen`)
  // Name the files, so this is fixable rather than mysterious.
  const before = mod.freeze.files ?? {}
  const after = hashFiles(dir)
  for (const f of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[f] === after[f]) continue
    const what = !before[f] ? 'added' : !after[f] ? 'deleted' : 'changed'
    console.log(`          ${what}: ${f}`)
  }
  console.log('        Revert these, or ask the human to run: npm run unfreeze ' + mod.id)
}

console.log('')
process.exit(bad === 0 ? 0 : 1)
