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

const tmp = mkdtempSync(join(tmpdir(), 'polyland-'))
const out = join(tmp, 'engine.mjs')
const charsOut = join(tmp, 'characters.mjs')
const bundle = (entry, outfile) =>
  build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', outfile, logLevel: 'error' })
await bundle('src/games/smash/engine/engine.ts', out)
await bundle('src/games/smash/engine/characters.ts', charsOut)
const regOut = join(tmp, 'registry.mjs')
await bundle('src/games/registry.ts', regOut)

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
    const eng = new SmashEngine({ cpu: false, chars: ['basil', victimId] })
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
  const light = measure('basil')
  const heavy = measure('juniper')
  check('weight resists knockback', heavy < light, `basil=${light.toFixed(2)} juniper=${heavy.toFixed(2)}`)
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
  a.x = 176
  a.y = 100
  a.vy = 0
  a.grounded = false
  run(eng, 60, idle)
  check('lands on the soft platform', a.grounded && Math.abs(a.y - 152) < 1, `y=${a.y.toFixed(1)}`)
  run(eng, 1, held({ down: true }))
  run(eng, 10, held({ down: true }))
  check('down drops through the soft platform', a.y > 154, `y=${a.y.toFixed(1)}`)
  run(eng, 200, idle)
  check('falls to the main stage below', a.grounded && Math.abs(a.y - 202) < 1, `y=${a.y.toFixed(1)}`)
}

// 11. The main stage is solid: you cannot walk into its side.
{
  const eng = newMatch()
  const a = eng.fighters[0]
  a.x = 60
  a.y = 230
  a.grounded = false
  run(eng, 20, held({ right: true }))
  check('solid stage blocks you from the side', a.x < 96, `x=${a.x.toFixed(1)}`)
}

// 12. The CPU actually plays: it damages a passive opponent and stays alive.
{
  const eng = new SmashEngine({ cpu: true, cpuLevel: 3, stocks: 5 })
  run(eng, 200)
  const [a, b] = eng.fighters
  // Watch the whole match rather than the final frame: a good CPU KOs the
  // dummy, and a KO resets percent back to zero.
  let peak = 0
  const startStocks = a.stocks
  for (let i = 0; i < 3600 && eng.phase !== 'over'; i++) {
    eng.setInput(0, idle)
    eng.step()
    if (a.percent > peak) peak = a.percent
  }
  const taken = startStocks - a.stocks
  check(
    'CPU lands hits on a standing target',
    peak > 0 || taken > 0,
    `peak percent=${peak}, stocks taken=${taken}`,
  )
  check('CPU does not self-destruct constantly', b.stocks >= 3, `cpu stocks=${b.stocks}`)
  check('CPU stays on the stage', b.state !== 'dead' || b.stocks > 0)
}

// 12b. Regression: the CPU used to park on a soft platform directly above its
// target and stand there for the whole match, because the "drop down" branch
// only ran while airborne.
{
  const eng = new SmashEngine({ cpu: true, cpuLevel: 3, stocks: 5 })
  run(eng, 200)
  const [a, b] = eng.fighters
  // Put the CPU on the left plank, the player on the stage right below it.
  b.x = 176
  b.y = 152
  b.vx = 0
  b.vy = 0
  b.grounded = true
  a.x = 176
  a.y = 202
  let cameDown = false
  for (let i = 0; i < 400 && !cameDown; i++) {
    eng.setInput(0, idle)
    eng.step()
    if (b.y > 190) cameDown = true
  }
  check('CPU drops off a platform to reach a target below', cameDown, `cpu y=${b.y.toFixed(1)}`)
}

// 13. A guest can rebuild the host's match from a snapshot alone.
{
  const host = newMatch()
  const guest = newMatch()
  run(host, 24, held({ right: true }))
  const [ha, hb] = host.fighters
  hb.x = ha.x + 14
  run(host, 1, held({ attack: true }))
  run(host, ha.def.moves.jab.startup + ha.def.moves.jab.active + 1, idle)

  guest.applySnapshot(host.snapshot())
  const [ga, gb] = guest.fighters
  check('snapshot carries position', Math.abs(ga.x - ha.x) < 0.02, `${ga.x} vs ${ha.x}`)
  check('snapshot carries damage', gb.percent === hb.percent, `${gb.percent} vs ${hb.percent}`)
  check('snapshot carries stocks', gb.stocks === hb.stocks)
  check('snapshot carries state', ga.state === ha.state, `${ga.state} vs ${ha.state}`)
  check('guest rebuilds hit effects locally', guest.particles.length > 0)

  // And it keeps tracking as the host plays on.
  run(host, 30, held({ left: true }))
  guest.applySnapshot(host.snapshot())
  check('guest keeps following the host', Math.abs(guest.fighters[0].x - ha.x) < 0.02)

  const wire = JSON.stringify(host.snapshot())
  check('a snapshot is small enough to send 60x a second', wire.length < 700, `${wire.length} bytes`)
}

// 14. The relay server really does put two browsers in the same room.
{
  const { spawn } = await import('node:child_process')
  const { WebSocket } = await import('ws')
  const PORT = 8899
  const server = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  })

  const open = (url) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.once('open', () => resolve(ws))
      ws.once('error', reject)
    })
  const next = (ws, want) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${want}`)), 3000)
      const onMsg = (data) => {
        const msg = JSON.parse(String(data))
        if (msg.t === want) {
          clearTimeout(timer)
          ws.off('message', onMsg)
          resolve(msg)
        }
      }
      ws.on('message', onMsg)
    })

  try {
    // Give the server a moment to bind.
    let hostWs = null
    for (let i = 0; i < 20 && !hostWs; i++) {
      try {
        hostWs = await open(`ws://127.0.0.1:${PORT}`)
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    if (!hostWs) throw new Error('server never came up')

    hostWs.send(JSON.stringify({ t: 'host', game: 'smash', name: 'Host', max: 2 }))
    const hosted = await next(hostWs, 'hosted')
    check('host gets a room code', /^[A-Z0-9]{4}$/.test(hosted.code), hosted.code)
    check('host takes slot 0', hosted.slot === 0)

    const guestWs = await open(`ws://127.0.0.1:${PORT}`)
    guestWs.send(JSON.stringify({ t: 'join', code: hosted.code, name: 'Guest' }))
    const joined = await next(guestWs, 'joined')
    check('guest joins the room', joined.code === hosted.code)
    check('guest takes slot 1', joined.slot === 1)

    const peers = await next(hostWs, 'peers')
    check('host is told who is in the room', peers.players.length === 2, JSON.stringify(peers.players))

    const relayed = next(guestWs, 'relay')
    hostWs.send(JSON.stringify({ t: 'relay', payload: { k: 'start', chars: ['basil', 'juniper'], stocks: 3 } }))
    const got = await relayed
    check('payloads reach the other player', got.payload.k === 'start' && got.from === 0)

    const badWs = await open(`ws://127.0.0.1:${PORT}`)
    badWs.send(JSON.stringify({ t: 'join', code: 'ZZZZ', name: 'Nobody' }))
    const err = await next(badWs, 'error')
    check('joining a room that does not exist is rejected', /ZZZZ/.test(err.message), err.message)

    const closed = next(guestWs, 'closed')
    hostWs.close()
    const bye = await closed
    check('the room closes when the host leaves', /host left/i.test(bye.reason), bye.reason)

    guestWs.close()
    badWs.close()
  } catch (err) {
    check('relay server round trip', false, String(err.message ?? err))
  } finally {
    server.kill()
  }
}

// 15. Roster integrity: every fighter is complete and sanely tuned.
{
  const { ROSTER } = await import(pathToFileURL(charsOut).href)
  const ids = new Set()
  let bad = 0
  const problems = []
  for (const c of ROSTER) {
    if (ids.has(c.id)) problems.push(`duplicate id ${c.id}`)
    ids.add(c.id)
    for (const key of ['jab', 'side', 'up', 'down', 'special']) {
      const m = c.moves[key]
      if (!m) {
        problems.push(`${c.id} is missing ${key}`)
        continue
      }
      if (m.startup < 2 || m.startup > 16) problems.push(`${c.id}.${key} startup ${m.startup}`)
      if (m.damage < 1 || m.damage > 20) problems.push(`${c.id}.${key} damage ${m.damage}`)
      if (m.hit.w <= 0 || m.hit.h <= 0) problems.push(`${c.id}.${key} has an empty hitbox`)
      // A hitbox you cannot reach is a dead move.
      if (m.hit.x - m.hit.w / 2 > c.hurt.w) problems.push(`${c.id}.${key} hitbox is detached`)
    }
    if (!c.moves.special.helplessAfter) problems.push(`${c.id} special is not a recovery`)
    if (c.jumps < 2) problems.push(`${c.id} cannot double jump`)
    if (c.height < 20 || c.height > 42) problems.push(`${c.id} height ${c.height}`)
    if (c.hurt.h < 20) problems.push(`${c.id} hurtbox is tiny`)
  }
  bad = problems.length
  check('every fighter is complete and in range', bad === 0, problems.slice(0, 4).join('; '))
  check('the roster has twelve fighters', ROSTER.length === 12, `${ROSTER.length}`)
  check('both animals and campers are present', ROSTER.some((c) => c.art.kind === 'critter') && ROSTER.some((c) => c.art.kind === 'camper'))
}

// 16. Every fighter can actually fight: land a hit and get home from off-stage.
{
  const { ROSTER } = await import(pathToFileURL(charsOut).href)
  const cantHit = []
  const cantRecover = []

  for (const c of ROSTER) {
    // Can they connect a jab on a neighbour?
    const eng = newMatch({ chars: [c.id, 'basil'] })
    const [a, b] = eng.fighters
    a.x = 200
    b.x = 200 + (c.hurt.w + b.def.hurt.w) / 2 + 2
    a.facing = 1
    run(eng, 1, held({ attack: true }))
    run(eng, c.moves.jab.startup + c.moves.jab.active + 2, idle)
    if (b.percent <= 0) cantHit.push(c.id)

    // Dropped off the left edge at head height, can they get back?
    const r = newMatch({ chars: [c.id, 'basil'] })
    const me = r.fighters[0]
    me.x = 70
    me.y = 220
    me.vy = 1
    me.grounded = false
    me.jumpsLeft = c.jumps
    let home = false
    for (let i = 0; i < 240 && !home; i++) {
      // Hold right, jump early, then use the recovery special.
      const wantJump = i > 6 && i < 60 && i % 12 < 3 && me.jumpsLeft > 0
      const wantSpecial = i >= 60 && i < 200 && i % 24 < 3 && me.state !== 'helpless'
      run(r, 1, held({ right: true, up: wantJump, special: wantSpecial }))
      if (me.grounded && me.x > 96) home = true
      if (me.state === 'dead') break
    }
    if (!home) cantRecover.push(c.id)
  }

  check('every fighter can land a jab point blank', cantHit.length === 0, cantHit.join(', '))
  check('every fighter can recover from off the ledge', cantRecover.length === 0, cantRecover.join(', '))
}

// 17. No fighter is wildly out of line on raw killing power.
{
  const { ROSTER } = await import(pathToFileURL(charsOut).href)
  const kb = []
  for (const c of ROSTER) {
    const eng = newMatch({ chars: [c.id, 'basil'] })
    const [a, b] = eng.fighters
    a.x = 200
    b.x = 200 + (c.hurt.w + b.def.hurt.w) / 2
    a.facing = 1
    b.percent = 100
    const m = c.moves.side
    run(eng, 1, held({ attack: true, right: true }))
    run(eng, m.startup + m.active + 1, idle)
    kb.push([c.id, Math.hypot(b.vx, b.vy)])
  }
  const values = kb.map(([, v]) => v).filter((v) => v > 0)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  check(
    'side attacks all land within a sane power band',
    values.length === ROSTER.length && hi < lo * 2.2,
    kb.map(([id, v]) => `${id}:${v.toFixed(1)}`).join(' '),
  )
}

// 18. The game shelf itself: every entry is complete and paints without crashing.
{
  const { GAMES } = await import(pathToFileURL(regOut).href)
  const problems = []
  const ids = new Set()
  for (const g of GAMES) {
    if (ids.has(g.id)) problems.push(`duplicate id ${g.id}`)
    ids.add(g.id)
    if (!/^[a-z0-9-]+$/.test(g.id)) problems.push(`${g.id} is not url safe`)
    for (const key of ['title', 'tagline', 'genre', 'players', 'blurb']) {
      if (!g[key] || typeof g[key] !== 'string') problems.push(`${g.id} is missing ${key}`)
    }
    if (!Array.isArray(g.plan) || g.plan.length < 2) problems.push(`${g.id} has no plan`)
    if (typeof g.art !== 'function') problems.push(`${g.id} has no card art`)
    if (g.blurb && g.blurb.length > 200) problems.push(`${g.id} blurb is too long`)
  }
  check('every game entry is complete', problems.length === 0, problems.slice(0, 4).join('; '))
  check('the shelf has one playable game', GAMES.filter((g) => g.status === 'live').length === 1)
  check('every other game is marked concept', GAMES.every((g) => g.status === 'live' || g.status === 'concept'))
  check('party games are all 2-8 players', GAMES.filter((g) => g.status === 'concept').every((g) => g.players === '2-8 players'))

  // Paint each card into a stub context: this catches typos in the art code
  // that a type check cannot see.
  const calls = []
  const stub = new Proxy(
    {
      canvas: { width: 480, height: 270 },
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      getTransform: () => ({ a: 3 }),
      save() {}, restore() {}, beginPath() {}, closePath() {},
      moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, ellipse() {}, quadraticCurveTo() {},
      fill() {}, stroke() {}, fillRect() {}, clearRect() {}, fillText() {},
      translate() {}, rotate() {}, scale() {}, setTransform() {}, setLineDash() {},
      drawImage() {},
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop]
        return undefined
      },
      set() {
        return true
      },
    },
  )
  let painted = 0
  for (const g of GAMES) {
    try {
      for (const frame of [0, 37, 240]) g.art(stub, frame)
      painted++
    } catch (err) {
      calls.push(`${g.id}: ${err.message}`)
    }
  }
  check('every card paints without throwing', painted === GAMES.length, calls.slice(0, 3).join('; '))
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`)
writeFileSync(out, '') // leave nothing large behind
process.exit(failures === 0 ? 0 : 1)
