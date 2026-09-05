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


/** How far out a fighter is, as a fraction of the way to the rim. */
function rim(eng, f) {
  const a = eng.arena
  const dx = (f.x - a.cx) / a.rx
  const dy = (f.y - a.cy) / a.ry
  return Math.sqrt(dx * dx + dy * dy)
}

// 1. Fighters start on the floor, at rest, and stay there.
{
  const eng = newMatch()
  const [a, b] = eng.fighters
  check('match reaches the fight phase', eng.phase === 'fight', eng.phase)
  check('both fighters are on the floor', rim(eng, a) < 1 && rim(eng, b) < 1)
  check('nobody drifts while idle', Math.abs(a.vx) < 0.01 && Math.abs(a.vy) < 0.01)
  check('fighters start facing each other', a.facing === 'right' && b.facing === 'left')
}

// 2. Movement is free in two axes, and facing follows the stick.
{
  const eng = newMatch()
  const [a] = eng.fighters
  const x0 = a.x
  run(eng, 24, held({ right: true }))
  check('holding right moves right', a.x > x0 + 4, `${x0} -> ${a.x}`)
  check('facing follows input', a.facing === 'right', a.facing)

  const y0 = a.y
  run(eng, 24, held({ up: true }))
  check('holding up moves up the floor', a.y < y0 - 4, `${y0} -> ${a.y}`)
  check('facing turns to up', a.facing === 'up', a.facing)

  // A diagonal must not outrun an axis.
  const e2 = newMatch()
  run(e2, 40, held({ right: true }))
  const straight = Math.hypot(e2.fighters[0].vx, e2.fighters[0].vy)
  const e3 = newMatch()
  run(e3, 40, held({ right: true, down: true }))
  const diagonal = Math.hypot(e3.fighters[0].vx, e3.fighters[0].vy)
  check('diagonals are not faster', diagonal <= straight + 0.02, `${diagonal} vs ${straight}`)
}

// 3. All eight moves exist and each is reachable by its own input.
{
  const cases = [
    ['attack', { attack: true }],
    ['attackSide', { attack: true, right: true }],
    ['attackUp', { attack: true, up: true }],
    ['attackDown', { attack: true, down: true }],
    ['special', { special: true }],
    ['specialSide', { special: true, right: true }],
    ['specialUp', { special: true, up: true }],
    ['specialDown', { special: true, down: true }],
  ]
  const wrong = []
  for (const [id, input] of cases) {
    const e = newMatch()
    const f = e.fighters[0]
    run(e, 1, held(input))
    if (!f.move || f.move.id !== id) wrong.push(`${id} -> ${f.move ? f.move.id : 'none'}`)
  }
  check('every input produces its move', wrong.length === 0, wrong.join('; '))
}

// 4. An attack in range deals damage and pushes the target away.
{
  const eng = newMatch()
  const [a, b] = eng.fighters
  b.x = a.x + 14
  b.y = a.y
  a.facing = 'right'
  run(eng, 1, held({ attack: true }))
  const mv = a.def.moves.attack
  run(eng, mv.startup + mv.active + 4)
  check('a landed jab deals its damage', b.percent === mv.damage, `${b.percent}`)
  check('a landed jab pushes the target away', b.x > a.x + 14, `${b.x} vs ${a.x}`)
  check('the target is in hitstun', b.hitstun > 0 || b.state === 'hitstun')
}

// 5. Knockback scales with damage: the whole point of the game.
{
  const dist = (percent) => {
    const eng = newMatch()
    const [a, b] = eng.fighters
    b.percent = percent
    b.x = a.x + 14
    b.y = a.y
    a.facing = 'right'
    run(eng, 1, held({ attack: true }))
    const mv = a.def.moves.attack
    run(eng, mv.startup + mv.active + 30)
    return b.x - a.x
  }
  const low = dist(0)
  const high = dist(140)
  check('a damaged fighter flies further', high > low * 1.4, `${low.toFixed(1)} -> ${high.toFixed(1)}`)
}

// 6. Weight sets how hard a hit launches you; deceleration sets how far that
//    launch carries. They are separate knobs and the roster uses both - diva is
//    the lightest fighter and also the one who skids to a stop soonest.
{
  const launch = (charId) => {
    const eng = newMatch({ chars: ['contrlzee', charId] })
    const [a, b] = eng.fighters
    b.percent = 80
    b.x = a.x + 14
    b.y = a.y
    a.facing = 'right'
    run(eng, 1, held({ attack: true }))
    const mv = a.def.moves.attack
    // Stop on the first frame the hitbox is live: peak knockback, before any
    // of it has bled off.
    run(eng, mv.startup + 1)
    let guard = 0
    while (b.hitstun === 0 && guard++ < 12) run(eng, 1)
    return Math.hypot(b.vx, b.vy)
  }
  const heavy = launch('teninchtoenail')
  const light = launch('diva')
  check(
    'the same hit launches the frog harder than the lion',
    light > heavy,
    `frog ${light.toFixed(2)} vs lion ${heavy.toFixed(2)}`,
  )

  const { ROSTER } = await import(pathToFileURL(charsOut).href)
  const frog = ROSTER.find((c) => c.id === 'diva')
  const lion = ROSTER.find((c) => c.id === 'teninchtoenail')
  check('the frog is the lightest fighter', ROSTER.every((c) => c.weight >= frog.weight))
  check('the lion is the heaviest fighter', ROSTER.every((c) => c.weight <= lion.weight))
  check('the frog stops soonest', ROSTER.every((c) => c.slide >= frog.slide))
}

// 7. Going over the rim costs a stock and respawns you clean.
{
  const eng = newMatch()
  const [a] = eng.fighters
  const stocks = a.stocks
  a.x = eng.arena.cx + eng.arena.rx + 20
  run(eng, 2)
  check('leaving the floor starts a fall', a.state === 'falling', a.state)
  run(eng, 40)
  check('the fall costs a stock', a.stocks === stocks - 1, `${a.stocks}`)
  run(eng, 140)
  check('respawn puts you back on the floor', rim(eng, a) < 1, `${rim(eng, a).toFixed(2)}`)
  check('respawn clears damage', a.percent === 0)
  check('respawn grants invulnerability', a.invuln > 0)
}

// 8. Last stock ends the match.
{
  const eng = newMatch({ stocks: 1 })
  const [a] = eng.fighters
  a.x = eng.arena.cx + eng.arena.rx + 20
  run(eng, 60)
  check('losing the last stock ends it', eng.phase === 'ko' || eng.phase === 'over')
  run(eng, 90)
  check('the other fighter wins', eng.winner === 1, `${eng.winner}`)
}

// 9. Radial moves hit from any side; directional ones do not.
{
  const hits = (input, dx) => {
    const eng = newMatch()
    const [a, b] = eng.fighters
    a.facing = 'right'
    b.x = a.x + dx
    b.y = a.y
    run(eng, 1, held(input))
    const mv = a.move
    run(eng, mv.startup + mv.active + 2)
    return b.percent > 0
  }
  check('a slam catches someone behind you', hits({ attack: true, down: true }, -14))
  check('a jab does not', !hits({ attack: true }, -14))
}

// 10. Fighters cannot stand inside each other.
{
  const eng = newMatch()
  const [a, b] = eng.fighters
  b.x = a.x + 1
  b.y = a.y
  run(eng, 4)
  const gap = Math.hypot(b.x - a.x, b.y - a.y)
  check('overlapping fighters push apart', gap > a.def.radius, `${gap.toFixed(1)}`)
}

// 11. The CPU plays: it damages a passive opponent and stays on the floor.
{
  const eng = new SmashEngine({ cpu: true, cpuLevel: 3, stocks: 3 })
  run(eng, 200)
  run(eng, 60 * 22)
  const [human, bot] = eng.fighters
  // Damage or a lost stock: a respawn clears percent, so percent alone is flaky.
  check(
    'the CPU beats up a passive player',
    human.percent > 0 || human.stocks < 3,
    `${human.percent}%, ${human.stocks} stocks`,
  )
  check('the CPU keeps itself on the floor', bot.stocks >= 2, `${bot.stocks} stocks left`)
}

// 12. A guest can rebuild the host's match from a snapshot alone.
{
  const host = newMatch()
  const guest = newMatch()
  run(host, 24, held({ right: true }))
  const [ha, hb] = host.fighters
  hb.x = ha.x + 14
  hb.y = ha.y
  ha.facing = 'right'
  run(host, 1, held({ attack: true }))
  const jm = ha.def.moves.attack
  run(host, jm.startup + jm.active + 1)

  guest.applySnapshot(host.snapshot())
  const [ga, gb] = guest.fighters
  check('snapshot carries position', Math.abs(ga.x - ha.x) < 0.02, `${ga.x} vs ${ha.x}`)
  check('snapshot carries damage', gb.percent === hb.percent, `${gb.percent} vs ${hb.percent}`)
  check('snapshot carries stocks', gb.stocks === hb.stocks)
  check('snapshot carries facing', ga.facing === ha.facing, `${ga.facing} vs ${ha.facing}`)
  check('snapshot carries state', ga.state === ha.state, `${ga.state} vs ${ha.state}`)

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
    hostWs.send(JSON.stringify({ t: 'relay', payload: { k: 'start', chars: ['contrlzee', 'ninjapenguin'], stocks: 3 } }))
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
  const { ROSTER, charById, playableId } = await import(pathToFileURL(charsOut).href)
  const MOVE_IDS = [
    'attack',
    'attackSide',
    'attackUp',
    'attackDown',
    'special',
    'specialSide',
    'specialUp',
    'specialDown',
  ]
  const problems = []
  for (const c of ROSTER) {
    for (const key of ['id', 'name', 'title', 'blurb']) {
      if (!c[key]) problems.push(`${c.id} is missing ${key}`)
    }
    for (const id of MOVE_IDS) {
      const m = c.moves[id]
      if (!m) {
        problems.push(`${c.id} has no ${id}`)
        continue
      }
      if (m.startup < 2 || m.startup > 16) problems.push(`${c.id}.${id} startup ${m.startup}`)
      if (m.active < 3 || m.active > 10) problems.push(`${c.id}.${id} active ${m.active}`)
      if (m.damage < 1 || m.damage > 20) problems.push(`${c.id}.${id} damage ${m.damage}`)
      if (!m.hit || m.hit.reach <= 0) problems.push(`${c.id}.${id} has no reach`)
    }
    if (c.weight < 0.7 || c.weight > 1.5) problems.push(`${c.id} weight ${c.weight}`)
    if (c.speed < 1.0 || c.speed > 2.6) problems.push(`${c.id} speed ${c.speed}`)
    if (c.radius < 6 || c.radius > 14) problems.push(`${c.id} radius ${c.radius}`)
  }
  check('every fighter is complete and in range', problems.length === 0, problems.slice(0, 4).join('; '))
  check('the roster has six fighters', ROSTER.length === 6, `${ROSTER.length}`)
  check('exactly one fighter is locked', ROSTER.filter((c) => c.locked).length === 1)
  check('every locked fighter says how to unlock', ROSTER.every((c) => !c.locked || c.unlockHint))
  check('playableId refuses a locked fighter', !charById(playableId('nightshift')).locked)
  const species = new Set(ROSTER.map((c) => c.avatar.species))
  check('every fighter is a different species', species.size === ROSTER.length, [...species].join(', '))
}

// 16. Every fighter can fight, and nobody is wildly out of line.
{
  const { ROSTER } = await import(pathToFileURL(charsOut).href)
  const mute = []
  const shoves = []
  for (const c of ROSTER) {
    const eng = newMatch({ chars: [c.id, 'contrlzee'] })
    const [a, b] = eng.fighters
    a.facing = 'right'
    b.x = a.x + 13
    b.y = a.y
    run(eng, 1, held({ attack: true }))
    const mv = a.def.moves.attack
    run(eng, mv.startup + mv.active + 3)
    if (b.percent <= 0) mute.push(c.id)

    const e2 = newMatch({ chars: [c.id, 'contrlzee'] })
    const [x, y] = e2.fighters
    x.facing = 'right'
    y.percent = 100
    y.x = x.x + 14
    y.y = x.y
    run(e2, 1, held({ attack: true, right: true }))
    const sm = x.def.moves.attackSide
    run(e2, sm.startup + sm.active + 40)
    shoves.push({ id: c.id, push: y.x - x.x })
  }
  check('every fighter can land a jab point blank', mute.length === 0, mute.join(', '))
  const pushes = shoves.map((k) => k.push)
  check(
    'side attacks all shift a target a comparable distance',
    Math.max(...pushes) < Math.min(...pushes) * 2.1,
    shoves.map((k) => `${k.id} ${k.push.toFixed(0)}`).join(', '),
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
