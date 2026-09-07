/**
 * Shared read/write of pipeline.json, plus the file-hashing the freeze check
 * depends on. Everything that touches the manifest goes through here so the
 * formatting stays stable and diffs stay readable.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const ROOT = process.cwd()
export const MANIFEST = join(ROOT, 'pipeline.json')
export const MODULES_DIR = join(ROOT, 'src', 'modules')

export function readPipeline() {
  return JSON.parse(readFileSync(MANIFEST, 'utf8'))
}

export function writePipeline(data) {
  writeFileSync(MANIFEST, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export function findModule(pipeline, id) {
  return pipeline.modules.find((m) => m.id === id)
}

/** The module an agent should be working on: in progress first, else the first planned one. */
export function currentModule(pipeline) {
  return (
    pipeline.modules.find((m) => m.status === 'in_progress') ??
    pipeline.modules.find((m) => m.status === 'planned') ??
    null
  )
}

/** Every file under a directory, as repo-relative paths with forward slashes, sorted. */
export function listFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else out.push(relative(ROOT, full).split(sep).join('/'))
    }
  }
  walk(dir)
  return out.sort()
}

const TEXT = /\.(ts|tsx|js|jsx|mjs|json|md|css|glsl|txt)$/i

/**
 * Hashes a module's whole file tree.
 *
 * Line endings are normalised before hashing. This repo's .gitattributes is
 * `* text=auto`, so on Windows a checkout can legitimately differ from what was
 * hashed at freeze time - without this, a frozen module would fail its own
 * check after a fresh clone.
 */
export function hashTree(dir) {
  const files = listFiles(dir)
  const h = createHash('sha256')
  for (const rel of files) {
    h.update(rel)
    h.update('\0')
    const buf = readFileSync(join(ROOT, rel))
    h.update(TEXT.test(rel) ? Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : buf)
    h.update('\0')
  }
  return h.digest('hex')
}

/** Per-file hashes, so a failure can name exactly what changed. */
export function hashFiles(dir) {
  const out = {}
  for (const rel of listFiles(dir)) {
    const buf = readFileSync(join(ROOT, rel))
    const body = TEXT.test(rel) ? Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8') : buf
    out[rel] = createHash('sha256').update(body).digest('hex')
  }
  return out
}

export function moduleDir(id) {
  return join(MODULES_DIR, id)
}

export function exists(p) {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

export const ok = (msg) => console.log(`  ok    ${msg}`)
export const fail = (msg, detail = '') => console.log(`  FAIL  ${msg}${detail ? ` -- ${detail}` : ''}`)
