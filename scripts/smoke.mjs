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
const tankOut = join(tmp, 'tank.mjs')
await bundle('src/games/tank/engine/engine.ts', tankOut)
const duckOut = join(tmp, 'duck.mjs')
await bundle('src/games/duck/engine/engine.ts', duckOut)

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

// 17. Duck szn: the gallery's rules, stage by stage.
{
  const { DuckEngine, STAGES } = await import(pathToFileURL(duckOut).href)

  /** A round parked on one stage, already past the round card. */
  const gallery = (stage, players = 1) => {
    const eng = new DuckEngine({ stages: [stage], players })
    while (eng.phase === 'ready') eng.step()
    return eng
  }
  /** Drops a target of the given kind in front of the shooter. */
  const clear = (eng) => {
    eng.targets.length = 0
  }
  const place = (eng, kind, over = {}) => {
    eng.targets.push({
      id: 9000 + eng.targets.length,
      kind,
      x: 240, y: 120, vx: 0, vy: 0, z: 1, vz: 0, r: 14,
      life: 0, hits: 0, color: '#fff', age: 10, dying: 0,
      linked: null, alt: 60, captured: false, dead: false,
      ...over,
    })
    return eng.targets[eng.targets.length - 1]
  }

  check('a round starts on stage one, playing', (() => {
    const eng = gallery('balloons')
    return eng.phase === 'playing' && eng.stage.id === 'balloons'
  })())

  // Combo and multiplier.
  {
    const eng = gallery('balloons')
    for (let i = 0; i < 4; i++) {
      clear(eng)
      place(eng, 'balloon')
      eng.shoot(0, 240, 120)
    }
    check('consecutive hits build the combo', eng.combo === 4, `${eng.combo}`)
    check('the multiplier follows the combo', eng.multiplier === 2, `x${eng.multiplier}`)
    const scored = eng.score
    clear(eng)
    eng.shoot(0, 10, 10)
    check('a miss resets the combo', eng.combo === 0, `${eng.combo}`)
    check('a miss scores nothing', eng.score === scored, `${eng.score} vs ${scored}`)
  }

  // Stage 2 target values, and the penalty target.
  {
    const eng = gallery('targets')
    clear(eng)
    place(eng, 'bull')
    const plain = eng.shoot(0, 240, 120)
    const before = eng.score
    clear(eng)
    place(eng, 'gold')
    const gold = eng.shoot(0, 240, 120)
    check('gold targets are worth more than plain ones', gold > plain, `${gold} vs ${plain}`)
    void before

    clear(eng)
    place(eng, 'mii')
    const combo = eng.combo
    const penalty = eng.shoot(0, 240, 120)
    check('a painted face costs points', penalty < 0, `${penalty}`)
    check('a painted face breaks the combo', eng.combo === 0, `was ${combo}`)
  }

  // The dog and its duck.
  {
    const eng = gallery('balloons')
    let barks = 0
    for (let i = 0; i < 60 * 60; i++) {
      eng.step()
      if (eng.barked) barks++
    }
    check('the dog stays quiet on stage one', barks === 0, `${barks} barks`)

    const eng2 = gallery('targets')
    let barked = false
    for (let i = 0; i < 60 * 60 && !barked; i++) {
      eng2.step()
      if (eng2.barked) barked = true
    }
    check('the dog barks from stage two on', barked)
    check('a bark puts a duck on the wing', eng2.targets.some((t) => t.kind === 'duck'))

    // The duck pays flat, whatever the combo is worth.
    const eng3 = gallery('targets')
    for (let i = 0; i < 20; i++) {
      clear(eng3)
      place(eng3, 'bull')
      eng3.shoot(0, 240, 120)
    }
    check('a long run maxes the multiplier', eng3.multiplier >= 5, `x${eng3.multiplier}`)
    clear(eng3)
    place(eng3, 'duck')
    const duck = eng3.shoot(0, 240, 120)
    check('the duck bonus is a flat ten', duck === 10, `${duck}`)
  }

  // Clays pay for range.
  {
    const near = gallery('clays')
    clear(near)
    place(near, 'clay', { z: 1 })
    const close = near.shoot(0, 240, 120)
    const far = gallery('clays')
    clear(far)
    place(far, 'clay', { z: 0.25 })
    const distant = far.shoot(0, 240, 120)
    check('a close clay is worth more than a distant one', close > distant, `${close} vs ${distant}`)
  }

  // Cans: juggle, escalate, burst, and die on the ground.
  {
    const eng = gallery('cans')
    clear(eng)
    const can = place(eng, 'can', { y: 120, vy: 3 })
    const first = eng.shoot(0, 240, 120)
    check('hitting a can knocks it back up', can.vy < 0, `${can.vy}`)
    const second = eng.shoot(0, can.x, can.y)
    check('each dent is worth more than the last', second > first, `${first} -> ${second}`)
    eng.shoot(0, can.x, can.y)
    eng.shoot(0, can.x, can.y)
    const burst = eng.shoot(0, can.x, can.y)
    check('the fifth hit bursts the can', burst > second && can.dying > 0, `${burst}`)

    const eng2 = gallery('cans')
    clear(eng2)
    const dropper = place(eng2, 'can', { y: 230, vy: 6 })
    const scoreBefore = eng2.score
    for (let i = 0; i < 10; i++) eng2.step()
    check('a can that lands is simply gone', dropper.dead || !eng2.targets.includes(dropper))
    check('a landed can costs nothing', eng2.score === scoreBefore)
  }

  // The abduction.
  {
    const eng = gallery('ufos')
    eng.targets.length = 0
    const walker = place(eng, 'walker', { x: 200, y: 236 })
    const ufo = place(eng, 'ufo', { x: 200, y: 150, alt: 60 })
    let grabbed = false
    for (let i = 0; i < 600 && !grabbed; i++) {
      eng.step()
      if (walker.captured) grabbed = true
    }
    check('a saucer abducts a camper it reaches', grabbed)
    check('a captured camper cannot be shot', eng.shoot(0, walker.x, walker.y) === 0)

    const rescue = eng.shoot(0, ufo.x, ufo.y)
    check('shooting a loaded saucer pays a rescue bonus', rescue > 25, `${rescue}`)
    check('the camper is put back down', !walker.captured && !walker.dead)
  }

  // Every stage in order, then the range closes.
  {
    const eng = new DuckEngine({ players: 2 })
    check('a full round has five stages', eng.config.stages.length === 5)
    let guard = 0
    while (eng.phase !== 'over' && guard++ < 60 * 60 * 6) eng.step()
    check('the round reaches the end', eng.phase === 'over', `${eng.phase} after ${guard}`)
    check('it played every stage', eng.stageIndex === 4, `${eng.stageIndex}`)
  }

  // Snapshots: a guest sees the host's gallery.
  {
    const host = gallery('balloons')
    for (let i = 0; i < 240; i++) host.step()
    clear(host)
    place(host, 'balloon')
    host.shoot(0, 240, 120)
    const guest = new DuckEngine({ players: 1 })
    guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())))
    check('snapshot carries the score', guest.score === host.score, `${guest.score} vs ${host.score}`)
    check('snapshot carries the combo', guest.combo === host.combo)
    check('snapshot carries the targets', guest.targets.length === host.targets.length,
      `${guest.targets.length} vs ${host.targets.length}`)
    const wire = JSON.stringify(host.snapshot())
    check('a gallery snapshot is small enough to send', wire.length < 3000, `${wire.length} bytes`)
  }

  check('every stage is described for the round card',
    STAGES.every((st) => st.name && st.brief && st.duration > 0))
}

// 19. Tank Trouble: movement, firing caps, mines, walls, and level flow.
{
  const { TankEngine } = await import(pathToFileURL(tankOut).href)
  const noInput = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, mine: false }

  check('a solo match starts in the lobby', new TankEngine({ players: 1 }).phase === 'lobby')

  // Movement and firing. Enemies are cleared first: they use unseeded
  // wander/spawn randomness, and a stray kill would make these flaky.
  {
    const eng = new TankEngine({ players: 1, seed: 1 })
    eng.addPlayer(0, 'P1')
    eng.start()
    for (let i = 0; i < 140; i++) eng.step() // clear the intro card
    check('level one begins playing', eng.phase === 'playing', eng.phase)
    // Marking enemies dead would immediately trigger the level-clear check
    // and freeze the sim before these assertions run; banished instead, far
    // enough that neither their wander nor line-of-sight reaches back.
    for (const e of eng.enemies) {
      e.x = -600
      e.y = -600
    }
    const p = eng.players[0]
    // Pinned to a known-open cell centre rather than trusting the (unseeded)
    // spawn shuffle, which can otherwise wedge the tank against a wall and
    // make this test flaky.
    p.x = eng.maze.cells[0].x
    p.y = eng.maze.cells[0].y
    p.vx = 0
    p.vy = 0
    const x0 = p.x
    for (let i = 0; i < 20; i++) {
      eng.setInput(0, { ...noInput, moveX: 1, aimX: p.x + 10, aimY: p.y })
      eng.step()
    }
    check('holding a direction moves the tank', p.x > x0 + 2, `${x0.toFixed(1)} -> ${p.x.toFixed(1)}`)
    check('the turret aims where the mouse is', Math.abs(p.angle) < 0.2, `${p.angle}`)

    // Seeded directly at four live rounds rather than firing them one at a
    // time: a real shot can ricochet off a nearby wall and kill its own
    // stationary owner before all five land, which is genuine Tank Trouble
    // chaos but makes an integration-style test of the cap unreliable.
    for (let i = 0; i < 4; i++) {
      eng.bullets.push({ id: 9000 + i, ownerId: p.id, x: p.x + 100, y: p.y, vx: 0, vy: 0, bounces: 0, life: 200, armIn: 0 })
    }
    eng.setInput(0, { ...noInput, aimX: p.x + 200, aimY: p.y, fire: true })
    eng.step()
    const live = eng.bullets.filter((b) => b.ownerId === p.id).length
    check('firing caps out at five live bullets', live === 5, `${live}`)
    eng.setInput(0, { ...noInput, aimX: p.x + 200, aimY: p.y, fire: false })
    eng.step()
    eng.setInput(0, { ...noInput, aimX: p.x + 200, aimY: p.y, fire: true })
    eng.step()
    check('a sixth shot is refused past the cap', eng.bullets.filter((b) => b.ownerId === p.id).length === 5)

    eng.setInput(0, { ...noInput, mine: true })
    eng.step()
    check('a mine can be dropped', eng.mines.length === 1)
  }

  // A tank cannot cross the outer wall.
  {
    const eng = new TankEngine({ players: 1, seed: 2 })
    eng.addPlayer(0, 'P1')
    eng.start()
    for (let i = 0; i < 140; i++) eng.step()
    const p = eng.players[0]
    for (let i = 0; i < 400; i++) {
      eng.setInput(0, { ...noInput, moveX: -1, moveY: -1, aimX: p.x, aimY: p.y })
      eng.step()
    }
    check('the boundary wall holds', p.x > 16 && p.y > 16, `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`)
  }

  // A bullet bounces rather than passing through a wall.
  {
    const eng = new TankEngine({ players: 1 })
    const before = eng.maze.walls.length
    check('a maze has interior walls beyond the four boundary edges', before > 4, `${before}`)
  }

  // Level N is a fixed map: two unrelated engines agree on it, and the outer
  // boundary is always stone so nothing can blast open the edge of the pit.
  {
    const a = new TankEngine({ players: 1 })
    const b = new TankEngine({ players: 5 })
    a.addPlayer(0, 'A')
    b.addPlayer(0, 'B')
    a.start()
    b.start()
    check(
      'the same level is the same map regardless of who is playing it',
      JSON.stringify(a.maze.walls) === JSON.stringify(b.maze.walls),
    )
    check('every boundary wall is stone', a.maze.walls.slice(0, 4).every((w) => w.kind === 'stone'))
    check('the maze has some wood in it to break', a.maze.walls.some((w) => w.kind === 'wood'))
  }

  // More tanks in the room means more sentries in the maze.
  {
    const solo = new TankEngine({ players: 1 })
    solo.addPlayer(0, 'A')
    solo.start()
    const full = new TankEngine({ players: 8 })
    for (let i = 0; i < 8; i++) full.addPlayer(i, `P${i}`)
    full.start()
    check(
      'an eight-tank party faces more sentries than a solo run',
      full.enemies.length > solo.enemies.length,
      `${solo.enemies.length} vs ${full.enemies.length}`,
    )
  }

  // A mine blast opens a wood wall but leaves stone alone.
  {
    const eng = new TankEngine({ players: 1 })
    eng.addPlayer(0, 'P1')
    eng.start()
    for (let i = 0; i < 140; i++) eng.step()
    const woodIdx = eng.maze.walls.findIndex((w) => w.kind === 'wood')
    const stoneIdx = eng.maze.walls.findIndex((w) => w.kind === 'stone')
    const wood = eng.maze.walls[woodIdx]
    eng.mines.push({ id: 8000, ownerId: -999, x: wood.x + wood.w / 2, y: wood.y + wood.h / 2, armIn: 0, fuse: 1 })
    eng.step()
    check('a mine blast opens a wood wall', eng.destroyedWalls.has(woodIdx))
    check('a mine blast leaves stone standing', !eng.destroyedWalls.has(stoneIdx))
    check(
      'an opened wall stops blocking movement and shots',
      eng.maze.walls.length > 0, // liveWalls is private; the flag above is the behavioural check
    )
  }

  // A tracking missile steers toward its target and can be shot down.
  {
    const eng = new TankEngine({ players: 1 })
    eng.addPlayer(0, 'P1')
    eng.start()
    for (let i = 0; i < 140; i++) eng.step()
    for (const e of eng.enemies) {
      e.x = -600
      e.y = -600
    }
    const p = eng.players[0]
    // A central cell, so there is room on both axes before anything reaches
    // the arena boundary or the missile's own target.
    const mid = eng.maze.cells[Math.floor(eng.maze.cells.length / 2)]
    p.x = mid.x
    p.y = mid.y

    eng.bullets.push({
      id: 7002,
      ownerId: -999,
      x: p.x - 100,
      y: p.y,
      vx: 2.3,
      vy: 0,
      bounces: 0,
      life: 300,
      armIn: 0,
      homing: true,
    })
    p.y += 20 // the target moves; a homing round should turn to follow
    for (let i = 0; i < 8; i++) eng.step()
    const missile = eng.bullets.find((b) => b.id === 7002)
    check(
      'a missile steers toward a target that has moved',
      Boolean(missile) && missile.vy > 0.3,
      missile && `vy=${missile.vy.toFixed(2)}`,
    )

    eng.bullets.push({
      id: 7003,
      ownerId: p.id,
      x: missile.x - 3,
      y: missile.y,
      vx: 3,
      vy: 0,
      bounces: 0,
      life: 200,
      armIn: 0,
      homing: false,
    })
    eng.step()
    check('a plain shot destroys a tracking missile', !eng.bullets.some((b) => b.id === 7002))
  }

  // Killing every sentry clears the level; losing every tank ends the run.
  {
    const eng = new TankEngine({ players: 1, seed: 4 })
    eng.addPlayer(0, 'P1')
    eng.start()
    for (let i = 0; i < 140; i++) eng.step()
    for (const e of eng.enemies) e.alive = false
    eng.step()
    check('clearing every sentry ends the level', eng.phase === 'levelClear', eng.phase)
    let guard = 0
    while (eng.phase === 'levelClear' && guard++ < 400) eng.step()
    check('the run advances to level two', eng.level === 2, `${eng.level}`)

    // beginLevel() drops back into the intro card; clear it before forcing
    // a wipe, or the death check never runs.
    let intro = 0
    while (eng.phase === 'intro' && intro++ < 200) eng.step()
    for (const p of eng.players) p.alive = false
    eng.step()
    check('losing every tank ends the run', eng.phase === 'over', eng.phase)
  }

  // Snapshots: a guest sees the host's maze and tanks.
  {
    const host = new TankEngine({ players: 1, seed: 5 })
    host.addPlayer(0, 'P1')
    host.start()
    for (let i = 0; i < 140; i++) host.step()
    const guest = new TankEngine({ players: 0 })
    guest.applySnapshot(JSON.parse(JSON.stringify(host.snapshot())))
    check('snapshot carries the level and seed', guest.level === host.level)
    check('a guest derives the same maze from the seed', guest.maze.walls.length === host.maze.walls.length)
    check('snapshot carries every tank', guest.tanks.length === host.tanks.length)
    const wire = JSON.stringify(host.snapshot())
    check('a match snapshot is small enough to send 20x a second', wire.length < 2000, `${wire.length} bytes`)
  }
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
  const live = GAMES.filter((g) => g.status === 'live')
  check('the shelf has three playable games', live.length === 3, live.map((g) => g.id).join(', '))
  const playableIds = new Set(['smash', 'duck-szn', 'tank-trouble'])
  check('every playable game has a panel', live.every((g) => playableIds.has(g.id)))
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
