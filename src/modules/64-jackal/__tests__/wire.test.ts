/**
 * One round on the wire: the snapshot, a guest's move, a guest Sniper's shot
 * claim - and a full lobby playing it out over a lossy relay.
 */
import { describe, expect, it } from 'vitest'
import { TOWER_Z } from '../internal/arena'
import { BODY, GUN, claim, createRound, fire, judgeEnd, look, report, runnersOf, sniperOf, tick, walkRunner, type Round } from '../internal/rules'
import { waitingRound } from '../internal/setup'
import { applySnapshot, decodeMove, decodeShot, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 20260925

function host(n = 4, chosen = 'p2'): Round {
  return createRound(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), chosen, 41)
}

const hear = (round: Round, me: string) => applySnapshot(waitingRound(), decodeSnapshot(relay(encodeSnapshot(round)))!, me)

describe('a snapshot', () => {
  it('carries who is the Sniper, every player and the winner once there is one', () => {
    const round = host(3)
    const sniper = sniperOf(round)!
    const runner = runnersOf(round)[0]
    Object.assign(sniper, { bullets: 4, lives: 2 })
    Object.assign(runner, { lives: 1, invulnerableUntil: 3.2, reachedBase: false })
    tick(round, 1.5)

    const copy = hear(round, 'p3')
    expect(copy.sniperId).toBe(sniper.id)
    expect(copy.players.find((p) => p.id === sniper.id)!.role).toBe('sniper')
    expect(copy.players.find((p) => p.id === runner.id)!.role).toBe('runner')
    expect(copy.players.find((p) => p.id === runner.id)!.lives).toBe(1)
    expect(copy.players.map((p) => p.mine)).toEqual([false, false, true])

    round.winner = 'sniper'
    round.over = true
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(round)))!, 'p3')
    expect(copy.winner).toBe('sniper')
    expect(copy.over).toBe(true)
  })

  it('keeps a guest walking its own copy between snapshots, not snapping it back', () => {
    const round = host(2)
    const copy = hear(round, 'p2')
    copy.players[1].x += 0.7
    const x = copy.players[1].x
    round.players[0].x -= 0.3
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(round)))!, 'p2')
    expect(copy.players[1].x).toBe(x)
    expect(copy.players[0].x).toBeCloseTo(-0.3, 2)
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
    expect(decodeSnapshot(withField(6, -1))).toBeNull()
    expect(decodeSnapshot(withField(10, 16))).toBeNull()
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
    expect(decodeMove(relay(encodeMove(41, { x: 1.23456, z: -2.5, yaw: 0.5, pitch: -0.25, y: 0.6, scoped: true })))).toEqual({
      round: 41,
      x: 1.235,
      z: -2.5,
      yaw: 0.5,
      pitch: -0.25,
      y: 0.6,
      scoped: true,
    })
    expect(decodeMove({ t: 'jkl-mv', g: 41, x: 999, z: 0, y: 0, p: 0, j: 0, c: 0 })).toBeNull()
    expect(decodeMove({ t: 'jkl-mv', g: 41, x: 1, z: 0, y: 0, p: 3, j: 0, c: 0 })).toBeNull()
    expect(decodeMove({ t: 'jkl-mv', g: 41, x: 1, z: 0, y: 0, p: 0, j: 900, c: 0 })).toBeNull()
    expect(decodeMove({ t: 'jkl-mv', g: 41, x: 1, z: 0, y: 0, p: 0, j: 0, c: 2 })).toBeNull()
    expect(decodeMove({ t: 'jkl-mv', g: 41, x: 1, z: 0, y: 0, p: 0 })).toBeNull()

    expect(decodeShot(relay(encodeShot(41, { x: 1, z: TOWER_Z, yaw: 3, pitch: 0.1, victim: 'p2' })))).toEqual({ round: 41, x: 1, z: TOWER_Z, yaw: 3, pitch: 0.1, victim: 'p2' })
    expect(decodeShot(relay(encodeShot(41, { x: 1, z: TOWER_Z, yaw: 3, pitch: 0.1, victim: null })))!.victim).toBeNull()
    expect(decodeShot({ t: 'jkl-sh', g: 41, x: 999, z: TOWER_Z, y: 3, p: 0.1, v: '' })).toBeNull()
    expect(decodeShot(relay(encodeMove(41, { x: 1, z: 2, yaw: 3, pitch: 0, y: 0, scoped: false })))).toBeNull()
  })
})

describe("the host disputes a claim it would not make itself", () => {
  it('refuses a hit the host\'s own trace says was blocked, or where the claimed victim was not near the ray', () => {
    const round = host(3, 'p1')
    const sniper = sniperOf(round)!
    const si = round.players.indexOf(sniper)
    const runner = runnersOf(round)[0]
    const ri = round.players.indexOf(runner)
    // Off to one side: nowhere near where the runner actually stands.
    const wide = decodeShot(relay(encodeShot(round.id, { x: sniper.x, z: sniper.z, yaw: 2.4, pitch: 0, victim: runner.id })))!
    const missed = claim(round, si, wide)!
    expect(missed.hit).toBe(-1)
    expect(runner.lives).toBe(2)
    // `tick` clamps a single step to 0.25 s (a backgrounded tab cannot skip a
    // reload), so waiting out the cooldown takes two of them.
    tick(round, 0.25)
    tick(round, GUN.cooldown - 0.25 + 0.01)

    // Straight down the lane, aimed correctly - a real hit, to show the true aim does connect.
    const dx = runner.x - sniper.x
    const dz = runner.z - sniper.z
    const yaw = Math.atan2(-dx, -dz)
    const pitch = Math.atan2(runner.y + BODY.height / 2 - (sniper.y + BODY.eye), Math.hypot(dx, dz))
    const said = decodeShot(relay(encodeShot(round.id, { x: sniper.x, z: sniper.z, yaw, pitch, victim: runner.id })))!
    const hit = claim(round, si, said)!
    expect(hit.hit).toBe(ri)
    expect(runner.lives).toBe(1)
  })
})

describe('a full lobby', () => {
  it('agrees on lives, who is down, who reached base and who won - with messages lost, a guest playing the Sniper', () => {
    const round = host(5, 'p2')
    let seed = 11
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const guests = round.players.slice(1).map((p, i) => ({ id: p.id, index: i + 1, copy: hear(round, p.id), lastHeard: 0 }))
    const dt = 1 / 30
    const heardMoves: { from: string; round: number; x: number; z: number; y: number; yaw: number; pitch: number; scoped: boolean }[] = []
    const heardShots: { from: string; round: number; x: number; z: number; yaw: number; pitch: number; victim: string | null }[] = []

    for (let frame = 0; !round.over && frame < 30 * 160; frame++) {
      for (const guest of guests) {
        const copy = guest.copy
        tick(copy, dt)
        const me = copy.players.findIndex((p) => p.mine)
        const mine = copy.players[me]
        if (!mine || !mine.alive) continue
        if (mine.role === 'sniper') {
          const targets = copy.players.filter((p) => p.role === 'runner' && p.alive && !p.left)
          const target = targets[frame % Math.max(1, targets.length)]
          if (target) {
            const dx = target.x - mine.x
            const dz = target.z - mine.z
            look(copy, me, Math.atan2(-dx, -dz) + (random() - 0.5) * 0.05, Math.atan2(target.y + BODY.height / 2 - (mine.y + BODY.eye), Math.hypot(dx, dz)))
            const shot = fire(copy, me, false)
            if (shot && random() > 0.2) {
              const victim = shot.hit >= 0 ? copy.players[shot.hit].id : null
              heardShots.push({ from: guest.id, round: copy.id, x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, victim })
            }
          }
        } else {
          const yaw = Math.atan2(-(0 - mine.x), -(TOWER_Z - mine.z))
          look(copy, me, yaw, 0)
          walkRunner(copy, me, { forward: 1, right: (random() - 0.5) * 0.6, jump: random() < 0.03 }, dt)
        }
        if (frame % 2 === 0 && random() > 0.2) {
          heardMoves.push({ from: guest.id, round: copy.id, x: mine.x, z: mine.z, y: mine.y, yaw: mine.yaw, pitch: mine.pitch, scoped: mine.scoped })
        }
      }

      for (const said of heardMoves.splice(0)) {
        const said2 = decodeMove(relay(encodeMove(said.round, said)))
        const player = round.players.findIndex((p) => p.id === said.from)
        if (!said2 || player < 0 || said2.round !== round.id) continue
        const guest = guests.find((g) => g.id === said.from)!
        report(round, player, said2, said2.yaw, said2.pitch, round.elapsed - guest.lastHeard, said2.y, said2.scoped)
        guest.lastHeard = round.elapsed
      }
      for (const said of heardShots.splice(0)) {
        const said2 = decodeShot(relay(encodeShot(said.round, said)))
        const player = round.players.findIndex((p) => p.id === said.from)
        if (!said2 || player < 0 || said2.round !== round.id) continue
        claim(round, player, said2)
      }
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
      expect(guest.copy.players.map((p) => [p.id, p.lives, p.alive, p.reachedBase])).toEqual(round.players.map((p) => [p.id, p.lives, p.alive, p.reachedBase]))
    }
  })
})
