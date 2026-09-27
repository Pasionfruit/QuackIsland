/**
 * One round on the wire: the snapshot, a guest's move, a guest's shot claim
 * - either role - and a full lobby playing it out over a lossy relay.
 */
import { describe, expect, it } from 'vitest'
import { arenaFor, lineClear } from '../internal/arena'
import { MAMA, MINI, claim, createRound, eyeOf, fire, judgeEnd, look, mamaOf, minisOf, report, runOver, tick, walk, type Round } from '../internal/rules'
import { waitingRound } from '../internal/setup'
import { applySnapshot, decodeMove, decodeShot, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 20260927

function host(n = 4, chosen = 'p1'): Round {
  return createRound(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), chosen, 41)
}

const hear = (round: Round, me: string) => applySnapshot(waitingRound(), decodeSnapshot(relay(encodeSnapshot(round)))!, me)

/** The pitch that aims from a shooter's own eye height at a target's own vertical middle - the two roles' bodies are quite different heights. */
const pitchTo = (shooterEye: number, targetHeight: number, dx: number, dz: number) => Math.atan2(targetHeight / 2 - shooterEye, Math.hypot(dx, dz))

describe('a snapshot', () => {
  it('carries who drives Mama Tank, every player, hitsOnMama and the winner once there is one', () => {
    const round = host(3)
    const mama = mamaOf(round)!
    const mini = minisOf(round)[0]
    round.hitsOnMama = 2
    Object.assign(mini, { hits: 1 })
    tick(round, 1.5)

    const copy = hear(round, 'p3')
    expect(copy.mamaId).toBe(mama.id)
    expect(copy.players.find((p) => p.id === mama.id)!.role).toBe('mama')
    expect(copy.players.find((p) => p.id === mini.id)!.role).toBe('mini')
    expect(copy.players.find((p) => p.id === mini.id)!.hits).toBe(1)
    expect(copy.hitsOnMama).toBe(2)
    expect(copy.hitsNeeded).toBe(round.hitsNeeded)
    expect(copy.players.map((p) => p.mine)).toEqual([false, false, true])

    round.winner = 'mama'
    round.over = true
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(round)))!, 'p3')
    expect(copy.winner).toBe('mama')
    expect(copy.over).toBe(true)
  })

  it('keeps a guest driving its own copy between snapshots, not snapping it back', () => {
    const round = host(2)
    const copy = hear(round, 'p2')
    copy.players[1].x += 0.7
    const x = copy.players[1].x
    round.players[0].x -= 0.3
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(round)))!, 'p2')
    expect(copy.players[1].x).toBe(x)
    expect(copy.players[0].x).toBeCloseTo(-0.3, 2)
  })

  it("takes hits and being alive from the host even for your own player - those only ever change through a verified claim", () => {
    const round = host(2)
    const copy = hear(round, 'p2')
    const mini = round.players.find((p) => p.id === 'p2')!
    mini.alive = false
    mini.hits = 3
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(round)))!, 'p2')
    const mine = copy.players.find((p) => p.mine)!
    expect(mine.alive).toBe(false)
    expect(mine.hits).toBe(3)
  })

  it('is refused whole rather than half-read', () => {
    const round = host()
    const good = relay(encodeSnapshot(round))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'nope' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, w: 3 })).toBeNull()
    expect(decodeSnapshot({ ...good, o1: 'nobody-here' })).toBeNull()
    const p = good.p as unknown[][]
    const withField = (i: number, v: unknown) => ({ ...good, p: [p[0].map((x, j) => (j === i ? v : x))] })
    expect(decodeSnapshot(withField(1, 999999))).toBeNull()
    expect(decodeSnapshot(withField(5, -1))).toBeNull()
    expect(decodeSnapshot(withField(7, 9))).toBeNull()
  })

  it('fits in a relay message with eight players', () => {
    const round = host(8)
    round.players.forEach((p) => Object.assign(p, { id: `player-${p.id}-with-a-long-id` }))
    expect(JSON.stringify(encodeSnapshot(round)).length).toBeLessThan(2048)
  })

  it('starts a guest afresh when the host deals a new round', () => {
    const copy = hear(host(3), 'p2')
    copy.players[1].x += 1
    const next = createRound(SEED + 1, [{ id: 'p1' }, { id: 'p2' }], 'p1', 42)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(next)))!, 'p2')
    expect(copy.id).toBe(42)
    expect(copy.players[1].x).toBeCloseTo(next.players[1].x, 2)
  })
})

describe('what a guest sends', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeMove(relay(encodeMove(41, { x: 1.23456, z: -2.5, yaw: 0.5, pitch: -0.25 })))).toEqual({ round: 41, x: 1.235, z: -2.5, yaw: 0.5, pitch: -0.25 })
    expect(decodeMove({ t: 'mmt-mv', g: 41, x: 999, z: 0, y: 0, p: 0 })).toBeNull()
    expect(decodeMove({ t: 'mmt-mv', g: 41, x: 1, z: 0, y: 0, p: 3 })).toBeNull()
    expect(decodeMove({ t: 'mmt-mv', g: 41, x: 1, z: 0, y: 0 })).toBeNull()

    expect(decodeShot(relay(encodeShot(41, { x: 1, z: 2, yaw: 3, pitch: 0.1, victim: 'p2' })))).toEqual({ round: 41, x: 1, z: 2, yaw: 3, pitch: 0.1, victim: 'p2' })
    expect(decodeShot(relay(encodeShot(41, { x: 1, z: 2, yaw: 3, pitch: 0.1, victim: null })))!.victim).toBeNull()
    expect(decodeShot({ t: 'mmt-sh', g: 41, x: 999, z: 2, y: 3, p: 0.1, v: '' })).toBeNull()
    expect(decodeShot(relay(encodeMove(41, { x: 1, z: 2, yaw: 3, pitch: 0 })))).toBeNull()
  })
})

describe('the host disputes a claim it would not make itself, for a claim from either role', () => {
  it("refuses a mini tank's claim aimed off to one side - nowhere near where Mama Tank actually stands", () => {
    const round = host(3, 'p1')
    const mama = mamaOf(round)!
    const mini = minisOf(round)[0]
    mini.x = mama.x + 20
    mini.z = mama.z
    const wide = decodeShot(relay(encodeShot(round.id, { x: mini.x, z: mini.z, yaw: 2.4, pitch: 0, victim: mama.id })))!
    const missed = claim(round, round.players.indexOf(mini), wide)!
    expect(missed.hit).toBe(-1)
    expect(round.hitsOnMama).toBe(0)

    // `tick` clamps a single step to 0.25 s (a backgrounded tab cannot skip a
    // reload), so waiting out a mini tank's own cooldown takes several of them.
    for (let waited = 0; waited < MINI.cooldown + 0.05; waited += 0.25) tick(round, 0.25)

    const yaw = Math.atan2(-(mama.x - mini.x), -(mama.z - mini.z))
    const pitch = pitchTo(MINI.eye, MAMA.height, mama.x - mini.x, mama.z - mini.z)
    const said = decodeShot(relay(encodeShot(round.id, { x: mini.x, z: mini.z, yaw, pitch, victim: mama.id })))!
    const hit = claim(round, round.players.indexOf(mini), said)!
    expect(hit.hit).toBe(round.players.indexOf(mama))
    expect(round.hitsOnMama).toBe(1)
  })

  it("refuses Mama Tank's claim on a mini tank the host's own trace says was blocked by a rock", () => {
    const round = host(3, 'p1')
    const mama = mamaOf(round)!
    const mi = round.players.findIndex((p) => p.role === 'mini')
    const mini = round.players[mi]
    const arena = arenaFor(round.seed)
    const rock = arena.blocks.find((b) => !b.wall)!
    const midz = (rock.z0 + rock.z1) / 2
    mama.x = rock.x0 - 1
    mama.z = midz
    mini.x = rock.x1 + 1
    mini.z = midz
    expect(lineClear(arena, eyeOf(mama), eyeOf(mini))).toBe(false)

    const yaw = Math.atan2(-(mini.x - mama.x), -(mini.z - mama.z))
    const said = decodeShot(relay(encodeShot(round.id, { x: mama.x, z: mama.z, yaw, pitch: 0, victim: mini.id })))!
    const blocked = claim(round, round.players.indexOf(mama), said)!
    expect(blocked.hit).toBe(-1)
    expect(mini.alive).toBe(true)
  })
})

describe('a full lobby', () => {
  it('agrees on hitsOnMama, who is down and who won - with messages lost, over a real generated field', () => {
    const round = host(6, 'p2')
    let seed = 11
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const guests = round.players.slice(1).map((p, i) => ({ id: p.id, index: i + 1, copy: hear(round, p.id), lastHeard: 0 }))
    const dt = 1 / 30
    const heardMoves: { from: string; round: number; x: number; z: number; yaw: number; pitch: number }[] = []
    const heardShots: { from: string; round: number; x: number; z: number; yaw: number; pitch: number; victim: string | null }[] = []

    for (let frame = 0; !round.over && frame < 30 * 170; frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        tick(copy, dt)
        const me = copy.players.findIndex((p) => p.mine)
        const mine = copy.players[me]
        if (!mine || (mine.role === 'mini' && !mine.alive) || mine.left) continue
        const target = mine.role === 'mama' ? copy.players.find((p) => p.role === 'mini' && p.alive && !p.left) : mamaOf(copy)
        if (target) {
          const dx = target.x - mine.x
          const dz = target.z - mine.z
          look(copy, me, Math.atan2(-dx, -dz) + (random() - 0.5) * 0.05, 0)
          const shot = fire(copy, me, false)
          if (shot && random() > 0.2) {
            const victim = shot.hit >= 0 ? copy.players[shot.hit].id : null
            heardShots.push({ from: guest.id, round: copy.id, x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, victim })
          }
        }
        const gx = (target?.x ?? 0) - mine.x
        const gz = (target?.z ?? 0) - mine.z
        const gd = Math.hypot(gx, gz)
        if (gd > 1e-6) walk(copy, me, { forward: (gx * -Math.sin(mine.yaw) + gz * -Math.cos(mine.yaw)) / gd, right: (random() - 0.5) * 0.4 }, dt)
        if (frame % 2 === 0 && random() > 0.2) heardMoves.push({ from: guest.id, round: copy.id, x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch })
      }

      for (const said of heardMoves.splice(0)) {
        const said2 = decodeMove(relay(encodeMove(said.round, said)))
        const player = round.players.findIndex((p) => p.id === said.from)
        if (!said2 || player < 0 || said2.round !== round.id) continue
        const guest = guests.find((g) => g.id === said.from)!
        report(round, player, said2, said2.yaw, said2.pitch, round.elapsed - guest.lastHeard)
        guest.lastHeard = round.elapsed
      }
      for (const said of heardShots.splice(0)) {
        const said2 = decodeShot(relay(encodeShot(said.round, said)))
        const player = round.players.findIndex((p) => p.id === said.from)
        if (!said2 || player < 0 || said2.round !== round.id) continue
        claim(round, player, said2)
      }
      runOver(round)
      tick(round, dt)

      if (frame % 3 === 0) {
        const wire = relay(encodeSnapshot(round))
        for (const guest of guests) if (random() > 0.15) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
      }
      judgeEnd(round)
    }

    expect(round.over).toBe(true)
    expect(round.winner).not.toBeNull()
    for (const guest of guests) {
      applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(round)))!, guest.id)
      expect(guest.copy.winner).toBe(round.winner)
      expect(guest.copy.hitsOnMama).toBe(round.hitsOnMama)
      expect(guest.copy.players.map((p) => [p.id, p.alive, p.left])).toEqual(round.players.map((p) => [p.id, p.alive, p.left]))
    }
  })
})
