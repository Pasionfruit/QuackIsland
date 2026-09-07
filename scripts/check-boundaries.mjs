/**
 * Module boundaries.
 *
 * Three rules, and the third is the one that earns this script its keep:
 *   1. Nothing may import into another module's internal/ - only index.ts is public.
 *   2. No relative import may escape its own module directory.
 *   3. Every cross-module import must be declared in that module's dependsOn.
 *
 * Rule 3 keeps the declared dependency graph honest, which is what makes the
 * unfreeze re-verification list trustworthy: when a frozen module is reopened,
 * we can say exactly who has to be re-checked. An editor lint rule cannot do
 * that because it does not know about the manifest.
 *
 * Also derives `dependents` from everyone's dependsOn and writes it back, so it
 * is never hand-maintained and never stale.
 */
import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { MODULES_DIR, ROOT, exists, fail, listFiles, ok, readPipeline, writePipeline } from './lib/pipeline.mjs'

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

function importsIn(file) {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const out = []
  let m
  while ((m = IMPORT_RE.exec(src)) !== null) out.push(m[1] ?? m[2])
  return out.filter(Boolean)
}

/** Which module a repo-relative path belongs to, or null for app/scripts. */
function moduleOf(rel) {
  const m = rel.match(/^src\/modules\/([^/]+)\//)
  return m ? m[1] : null
}

/** Resolve a relative specifier against the importing file, as a repo-relative path. */
function resolveRel(fromFile, spec) {
  const dir = join(ROOT, fromFile, '..')
  return relative(ROOT, join(dir, spec)).split(sep).join('/')
}

const pipeline = readPipeline()
const known = new Set(pipeline.modules.map((m) => m.id))
const problems = []
const used = new Map() // module id -> Set of module ids it imports

const roots = ['src']
const files = []
for (const r of roots) if (exists(join(ROOT, r))) files.push(...listFiles(join(ROOT, r)))
const sources = files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))

for (const file of sources) {
  const owner = moduleOf(file)
  for (const spec of importsIn(file)) {
    if (!spec.startsWith('.')) continue
    const target = resolveRel(file, spec)
    const targetModule = moduleOf(target + '/')

    if (owner && !targetModule && target.startsWith('src/')) {
      // A relative import that climbed out of its own module.
      if (!target.startsWith(`src/modules/${owner}/`)) {
        problems.push(`${file} reaches outside its module: ${spec}`)
      }
      continue
    }

    if (!targetModule) continue

    if (owner === targetModule) continue // inside itself, fine

    // Crossing a module boundary: it must land on the module's index, nothing deeper.
    const rest = target.slice(`src/modules/${targetModule}/`.length)
    if (rest !== '' && rest !== 'index' && rest !== 'index.ts' && rest !== 'index.tsx') {
      problems.push(`${file} deep-imports ${targetModule}/${rest} - only index.ts is public`)
    }
    if (!known.has(targetModule)) {
      problems.push(`${file} imports unknown module ${targetModule}`)
      continue
    }
    if (owner) {
      if (!used.has(owner)) used.set(owner, new Set())
      used.get(owner).add(targetModule)
    }
  }
}

// Rule 3: imports must match dependsOn.
for (const [id, deps] of used) {
  const mod = pipeline.modules.find((m) => m.id === id)
  if (!mod) continue
  const declared = new Set(mod.dependsOn ?? [])
  for (const d of deps) {
    if (!declared.has(d)) problems.push(`module ${id} imports ${d} but does not declare it in dependsOn`)
  }
}

// Derive dependents so the unfreeze impact list is always correct.
const dependents = new Map(pipeline.modules.map((m) => [m.id, new Set()]))
for (const m of pipeline.modules) {
  for (const d of m.dependsOn ?? []) dependents.get(d)?.add(m.id)
}
let changed = false
for (const m of pipeline.modules) {
  const next = [...(dependents.get(m.id) ?? [])].sort()
  if (JSON.stringify(next) !== JSON.stringify(m.dependents ?? [])) {
    m.dependents = next
    changed = true
  }
}
if (changed) writePipeline(pipeline)

console.log('\nboundaries\n')
if (problems.length === 0) {
  ok(`${sources.length} source files, no boundary violations`)
  if (changed) ok('dependents re-derived and written back')
  process.exit(0)
}
for (const p of problems) fail(p)
console.log(`\n${problems.length} boundary violation(s).\n`)
process.exit(1)
