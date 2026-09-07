/**
 * Public API drift on frozen modules.
 *
 * check-frozen already catches any edit, but it can only say "this file
 * changed". This regenerates the declaration for each module's index.ts and
 * diffs it against the committed snapshot, so drift reports as a changed
 * signature rather than a changed file - which is the difference between a
 * useful failure and a puzzling one.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fail, moduleDir, ok, readPipeline } from './lib/pipeline.mjs'

/** Emit a .d.ts for one module's public entry point. */
export function declarationFor(id) {
  const entry = join(moduleDir(id), 'index.ts')
  if (!existsSync(entry)) return null
  const out = mkdtempSync(join(tmpdir(), 'contract-'))
  try {
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['tsc', entry, '--declaration', '--emitDeclarationOnly', '--outDir', out,
       '--jsx', 'react-jsx', '--module', 'esnext', '--moduleResolution', 'bundler',
       '--target', 'ES2020', '--skipLibCheck', '--strict'],
      { stdio: 'pipe' },
    )
    const f = join(out, 'index.d.ts')
    return existsSync(f) ? readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim() : null
  } catch (err) {
    // tsc exits non-zero on type errors; typecheck reports those properly.
    const f = join(out, 'index.d.ts')
    return existsSync(f) ? readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim() : null
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pipeline = readPipeline()
  console.log('\ncontracts\n')
  let bad = 0
  const frozen = pipeline.modules.filter((m) => m.status === 'passed')
  if (frozen.length === 0) ok('nothing frozen yet')
  for (const mod of frozen) {
    const snapPath = join(moduleDir(mod.id), 'contract.snapshot.d.ts')
    if (!existsSync(snapPath)) {
      fail(`${mod.id} is frozen but has no contract snapshot`)
      bad++
      continue
    }
    const now = declarationFor(mod.id)
    const was = readFileSync(snapPath, 'utf8').replace(/\r\n/g, '\n').trim()
    if (now === was) {
      ok(`${mod.id} contract unchanged`)
      continue
    }
    bad++
    fail(`${mod.id} public contract has drifted`)
    const a = was.split('\n')
    const b = (now ?? '').split('\n')
    for (const line of a.filter((l) => !b.includes(l))) console.log(`          removed: ${line}`)
    for (const line of b.filter((l) => !a.includes(l))) console.log(`          added:   ${line}`)
  }
  console.log('')
  process.exit(bad === 0 ? 0 : 1)
}
