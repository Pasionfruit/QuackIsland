/**
 * Headless smoke test for the Polyland Smash engine.
 *
 * The engine is deliberately DOM-free, so it can be bundled with esbuild and
 * driven straight from Node. Run with `npm run smoke`.
 */
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const out = join(mkdtempSync(join(tmpdir(), 'polyland-')), 'engine.mjs')
await build({
  entryPoints: ['src/games/smash/engine/engine.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: out,
  logLevel: 'error',
})

const { SmashEngine } = await import(pathToFileURL(out).href)

let failures = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

const idle = { left: false, right: false, up: false, down: false, attack: false, special: false }
const held = (over) => ({ ...idle, ...over })

/** Runs `n` ticks holding `a` for player 1 and `b` for player 2. */
function run(eng, n, a = idle, b = idle) {
  for (let i = 0; i < n; i++) {
    eng.setInput(0, a)
    eng.setInput(1, b)
    eng.step()
  }
}

function newMatch(opts = {}) {
  const eng = new SmashEngine({ cpu: false, stocks: 3, ...opts })
  run(eng, 200) // burn the countdown
  return eng
}

console.log('\nPolyland Smash - engine smoke test\n')

// 1. Fighters start standing on the stage and stay there.
{
  const eng = newMatch()
  const [a, b] = eng.fighters
  check('match reaches the fight phase', eng.phase === 'fight', eng.phase)
  check('both fighters are grounded at rest', a.grounded && b.grounded)
  check('nobody drifts while idle', Math.abs(a.vx) < 0.01 && Math.abs(b.vx) < 0.01)
}

// 2. Walking moves you, and running off the edge makes you fall.
{
  const eng = newMatch()
  const a = eng.fighters[0]
  const startX = a.x
  run(eng, 30, held({ right: true }))
  check('holding right walks forward', a.x > startX + 20, `moved ${(a.x - startX).toFixed(1)}px`)
  check('facing follows input', a.facing === 1)
  run(eng, 120, held({ right: true }))
  check('walking off the edge starts a fall', !a.grounded || a.state === 'dead')
}

// 3. Jumping: two jumps, then nothing until you land.
{
  const eng = newMatch()
  const a = eng.fighters[0]
  run(eng, 1, held({ up: true }))
  check('jump leaves the ground', a.vy < 0, `vy=${a.vy.toFixed(2)}`)
  run(eng, 6, idle)
  run(eng, 1, held({ up: true }))
  check('double jump is available', a.jumpsLeft === 0)
  const vyBefore = a.vy
  run(eng, 6, idle)
  run(eng, 1, held({ up: true }))
  check('third jump is refused', a.vy > vyBefore)
  run(eng, 200, idle)
  check('fighter lands again', a.grounded, `y=${a.y.toFixed(1)}`)
}

// 4. An attack in range deals damage and knockback.
{
  const eng = newMatch()
  const [a, b] = eng.fighters
  a.x = 200
  b.x = 214
  a.facing = 1
  const jab = a.def.moves.jab
  run(eng, 1, held({ attack: true }))
  run(eng, jab.startup + jab.active + 4, idle)
  check('jab damages the opponent', b.percent === jab.damage, `percent=${b.percent}`)
  check('jab launches the opponent', b.vx > 0 && b.vy < 0, `v=(${b.vx.toFixed(2)}, ${b.vy.toFixed(2)})`)
  check('victim is in hitstun', b.hitstun > 0 || b.state === 'hitstun')
  check('a move only connects once', a.hitTargets.has(1))
}

// 5. Knockback scales with damage, which is the whole point of the game.
{
  const measure = (percent) => {
    const eng = newMatch()
    const [a, b] = eng.fighters
    a.x = 200
    b.x = 214
    a.facing = 1
    b.percent = percent
    const jab = a.def.moves.jab
    run(eng, 1, held({ attack: true }))
    run(eng, jab.startup + jab.active + 1, idle)
    return Math.hypot(b.vx, b.vy)
  }
  const low = measure(0)
  const high = measure(120)
  check('knockback grows with percent', high > low * 2, `${low.toFixed(2)} -> ${high.toFixed(2)}`)
}

// 6. Heavier fighters take less knockback from the same hit.
{
  const measure = (victimId) => {
    const eng = new SmashEngine({ cpu: false, chars: ['vex', victimId] })
    run(eng, 200)
    const [a, b] = eng.fighters
    a.x = 200
    b.x = 214
    a.facing = 1
    b.percent = 60
    run(eng, 1, held({ attack: true }))
    run(eng, 8, idle)
    return Math.hypot(b.vx, b.vy)
  }
  const light = measure('vex')
  const heavy = measure('grum')
  check('weight resists knockback', heavy < light, `vex=${light.toFixed(2)} grum=${heavy.toFixed(2)}`)
}

// 7. Leaving the blast zone costs a stock and respawns you clean.
{
  const eng = newMatch()
  const b = eng.fighters[1]
  b.percent = 88
  b.x = 900
  run(eng, 1)
  check('blast zone takes a stock', b.stocks === 2, `stocks=${b.stocks}`)
  check('KO freezes the match briefly', eng.phase === 'ko')
  run(eng, 200)
  check('fighter respawns with 0%', b.percent === 0, `percent=${b.percent}`)
  check('fighter respawns invulnerable', b.invuln > 0)
  check('match resumes after the KO', eng.phase === 'fight', eng.phase)
}

// 8. Last stock ends the match.
{
  const eng = newMatch({ stocks: 1 })
  const b = eng.fighters[1]
  b.x = 900
  run(eng, 1)
  run(eng, 120)
  check('losing the last stock ends the match', eng.phase === 'over', eng.phase)
  check('the other player is the winner', eng.winner === 0, `winner=${eng.winner}`)
}

// 9. The recovery special sends you up and leaves you helpless.
{
  const eng = newMatch()
  const a = eng.fighters[0]
  run(eng, 1, held({ up: true }))
  run(eng, 10, idle)
  const yBefore = a.y
  run(eng, 1, held({ special: true }))
  const sp = a.def.moves.special
  run(eng, sp.startup + 2, idle)
  check('special rises', a.vy < -3, `vy=${a.vy.toFixed(2)}`)
  run(eng, sp.active + sp.recovery + 2, idle)
  check('special ends helpless in the air', a.state === 'helpless', a.state)
  check('special gained height', a.y < yBefore, `${yBefore.toFixed(1)} -> ${a.y.toFixed(1)}`)
  run(eng, 400, idle)
  check('helpless state ends on landing', a.state !== 'helpless', a.state)
}

// 10. Soft platforms: you can land on them and drop through them.
{
  const eng = newMatch()
  const a = eng.fighters[0]
  a.x = 178
  a.y = 100
  a.vy = 0
  a.grounded = false
  run(eng, 60, idle)
  check('lands on the soft platform', a.grounded && Math.abs(a.y - 156) < 1, `y=${a.y.toFixed(1)}`)
  run(eng, 1, held({ down: true }))
  run(eng, 10, held({ down: true }))
  check('down drops through the soft platform', a.y > 158, `y=${a.y.toFixed(1)}`)
  run(eng, 200, idle)
  check('falls to the main stage below', a.grounded && Math.abs(a.y - 206) < 1, `y=${a.y.toFixed(1)}`)
}

// 11. The main stage is solid: you cannot walk into its side.
{
  const eng = newMatch()
  const a = eng.fighters[0]
  a.x = 60
  a.y = 230
  a.grounded = false
  run(eng, 20, held({ right: true }))
  check('solid stage blocks you from the side', a.x < 100, `x=${a.x.toFixed(1)}`)
}

// 12. The CPU actually plays: it damages a passive opponent and stays alive.
{
  const eng = new SmashEngine({ cpu: true, cpuLevel: 3, stocks: 5 })
  run(eng, 200)
  const [a, b] = eng.fighters
  for (let i = 0; i < 3600 && eng.phase !== 'over'; i++) {
    eng.setInput(0, idle)
    eng.step()
  }
  check('CPU lands hits on a standing target', a.percent > 0, `player percent=${a.percent}`)
  check('CPU does not self-destruct constantly', b.stocks >= 3, `cpu stocks=${b.stocks}`)
  check('CPU stays on the stage', b.state !== 'dead' || b.stocks > 0)
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
writeFileSync(out, '') // leave nothing large behind
process.exit(failures === 0 ? 0 : 1)
