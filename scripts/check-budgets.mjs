/**
 * Budgets that can be measured honestly in Node: bundle size.
 *
 * Draw calls and frame time are deliberately NOT asserted here - measuring them
 * would mean rendering, and a software WebGL context in Node tells you that
 * calls were issued, not that the frame was fast. Those come from the perf HUD
 * during the human gate, and get recorded into pipeline.json `measured`.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, fail, ok, readPipeline } from './lib/pipeline.mjs'

const pipeline = readPipeline()
const dist = join(ROOT, 'dist', 'assets')

console.log('\nbudgets\n')

if (!existsSync(dist)) {
  ok('no dist yet - run npm run build first (the gate does this for you)')
  process.exit(0)
}

let totalGzip = 0
for (const f of readdirSync(dist)) {
  if (!f.endsWith('.js')) continue
  const buf = readFileSync(join(dist, f))
  totalGzip += gzipSync(buf).length
}
const kb = totalGzip / 1024
const limit = pipeline.budgets.bundleGzipKb

if (kb <= limit) {
  ok(`bundle ${kb.toFixed(1)} kB gzipped, under the ${limit} kB budget`)
  process.exit(0)
}
fail(`bundle ${kb.toFixed(1)} kB gzipped, over the ${limit} kB budget`)
console.log('')
process.exit(1)
