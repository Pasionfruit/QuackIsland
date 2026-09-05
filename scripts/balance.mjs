/**
 * The CPU-vs-CPU round robin the README's tuning section describes: every
 * ordered pair of fighters plays a batch of matches with both slots AI
 * controlled (SmashEngine's `cpu2` option, offline-testing only - a real
 * match only ever gives the built-in bot slot 1), and this reports each
 * matchup's and each fighter's win rate. A healthy roster keeps every
 * fighter somewhere around 45-55%; a wider spread than the roster's own
 * historical noise floor (run it with six identical fighters and see how
 * much a perfectly even matchup still wobbles) is real signal, not noise.
 *
 *   node scripts/balance.mjs
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const tmp = mkdtempSync(join(tmpdir(), 'balance-'))
const bundle = (entry, outfile) =>
  build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', outfile, logLevel: 'error' })

const engineOut = join(tmp, 'engine.mjs')
await bundle('src/games/smash/engine/engine.ts', engineOut)
const { SmashEngine } = await import(pathToFileURL(engineOut).href)

const charsOut = join(tmp, 'characters.mjs')
await bundle('src/games/smash/engine/characters.ts', charsOut)
const { ROSTER } = await import(pathToFileURL(charsOut).href)

const ids = ROSTER.map((c) => c.id)
const MATCHES_PER_PAIR = Number(process.argv[2] ?? 24)
const MAX_FRAMES = 60 * 60 * 2 // a 2-minute match-time ceiling; anything longer counts as a draw

function playOne(a, b) {
  const eng = new SmashEngine({ chars: [a, b], stocks: 2, cpu: true, cpu2: true, cpuLevel: 3 })
  let frames = 0
  while (eng.winner === null && frames < MAX_FRAMES) {
    eng.step()
    frames++
  }
  return eng.winner // null (drawn by the time limit), 0, or 1
}

const wins = new Map(ids.map((id) => [id, 0]))
const games = new Map(ids.map((id) => [id, 0]))
const results = []

for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i]
    const b = ids[j]
    let aWins = 0
    let bWins = 0
    for (let m = 0; m < MATCHES_PER_PAIR; m++) {
      const winner = playOne(a, b)
      if (winner === 0) aWins++
      else if (winner === 1) bWins++
    }
    const decided = aWins + bWins
    wins.set(a, wins.get(a) + aWins)
    wins.set(b, wins.get(b) + bWins)
    games.set(a, games.get(a) + decided)
    games.set(b, games.get(b) + decided)
    results.push({ a, b, aWins, bWins, decided })
  }
}

console.log('Per-matchup (share of decided games the first-named fighter won):')
for (const r of results) {
  const pct = r.decided ? ((r.aWins / r.decided) * 100).toFixed(0) : 'n/a'
  console.log(`  ${r.a.padEnd(15)} vs ${r.b.padEnd(15)} ${pct}% (${r.aWins}-${r.bWins}, ${r.decided - r.aWins - r.bWins} draws)`)
}

console.log('\nOverall win rate per fighter:')
for (const id of ids) {
  const g = games.get(id)
  const w = wins.get(id)
  console.log(`  ${id.padEnd(15)} ${g ? ((w / g) * 100).toFixed(1) : 'n/a'}%  (${w}/${g})`)
}
