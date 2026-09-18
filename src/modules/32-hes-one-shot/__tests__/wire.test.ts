/**
 * One game on the wire - eight players shooting it out through a lossy relay.
 */
import { describe, expect, it } from 'vitest'
import { sightedBy, yawTowards } from '../internal/ai'
import { arenaFor, blocked } from '../internal/arena'
import { BODY, ROUND, claim, clock, createGame, fire, isStanding, look, report, stepGame, walk, type Game } from '../internal/rules'
import { waitingGame } from '../internal/setup'
import { lane } from './places'
import { applySnapshot, decodeMove, decodeShot, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 777002

function host(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 41)
}

function started(g: Game): Game {
  while (clock(g) < ROUND.guard) stepGame(g, 0.25)
  return g
}

const hear = (game: Game, me: string) => applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(game)))!, me)

describe('a snapshot', () => {
  it('carries every player, and a guest keeps its own where its own screen has it', () => {
    const game = started(host(3))
    const z = lane(SEED)
    Object.assign(game.players[0], { x: 0, z, yaw: -Math.PI / 2, pitch: -0.08 })
    Object.assign(game.players[1], { x: 6, z })
    fire(game, 0)
    const copy = hear(game, 'p3')
    expect(copy.players.map((p) => [p.id, p.mine, p.out, p.by, p.kills])).toEqual([
      ['p1', false, null, null, 1],
      ['p2', false, game.players[1].out, 0, 0],
      ['p3', true, null, null, 0],
    ])
    expect(copy.players[1].x).toBeCloseTo(6, 2)
    expect(copy.shots).toHaveLength(1)
    expect(copy.shots[0]).toMatchObject({ by: 0, hit: 1 })

    // The guest walks; the host has not heard. The same shot is not added twice.
    copy.players[2].x += 0.5
    const x = copy.players[2].x
    game.players[0].x -= 0.3
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[2].x).toBe(x)
    expect(copy.players[0].x).toBeCloseTo(-0.3, 2)
    expect(copy.shots).toHaveLength(1)

    // Being eliminated comes from the host; and once it is over, the host's word is everything.
    game.players[2].out = 12.5
    game.players[2].by = 1
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[2]).toMatchObject({ out: 12.5, by: 1, x })
    game.over = true
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p3')
    expect(copy.players[2].x).toBeCloseTo(game.players[2].x, 2)
    expect(copy.over).toBe(true)
  })

  it("does not draw a guest's own shot twice", () => {
    const game = started(host(2))
    const copy = hear(game, 'p2')
    Object.assign(game.players[1], { x: 0, z: lane(SEED), yaw: -Math.PI / 2 })
    Object.assign(copy.players[1], { x: 0, z: lane(SEED), yaw: -Math.PI / 2 })
    copy.elapsed = game.elapsed
    const local = fire(copy, 1, false)!
    expect(local.seq).toBe(0)
    claim(game, 1, { x: 0, z: lane(SEED), yaw: -Math.PI / 2, pitch: 0, victim: null })
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, 'p2')
    expect(copy.shots).toEqual([local])
  })

  it('is refused whole rather than half-read', () => {
    const game = started(host())
    Object.assign(game.players[0], { x: 0, z: lane(SEED), yaw: -Math.PI / 2 })
    fire(game, 0)
    const good = relay(encodeSnapshot(game))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'hd' })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, o: 2 })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['p1', 99999, 0, 0, -1, -1, 0, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['p1', 0, 0, 0, -1, 3, 0, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [['p1', 0, 0, 0, 9000, -1, 0, 0]] })).toBeNull()
    expect(decodeSnapshot({ ...good, h: [[1, 5, 0, 0, 0, 0, 0, 0, -1]] })).toBeNull()
    expect(decodeSnapshot({ ...good, h: [[0, 0, 0, 170, 0, 100, 170, 0, -1]] })).toBeNull()
  })

  it('fits in a relay message with eight in the arena and every shot at once', () => {
    const game = started(host(8))
    game.players.forEach((p) => Object.assign(p, { id: `player-${p.id}-with-a-long-id`, shotAt: -10 }))
    for (let i = 0; i < 8; i++) fire(game, i)
    for (let i = 0; i < 8; i++) game.shots.push({ ...game.shots[i], seq: 100 + i })
    expect(JSON.stringify(encodeSnapshot(game)).length).toBeLessThan(4096)
  })

  it('starts a guest afresh when the host starts a new game', () => {
    const copy = hear(started(host(3)), 'p2')
    copy.players[1].x += 1
    const next = createGame(SEED + 1, [{ id: 'p1' }, { id: 'p2' }], 42)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(next)))!, 'p2')
    expect(copy.id).toBe(42)
    expect(copy.shots).toEqual([])
    expect(copy.players[1].x).toBeCloseTo(next.players[1].x, 2)
  })
})

describe('what a guest sends', () => {
  it('comes back as what was sent, and is refused when it is not one', () => {
    expect(decodeMove(relay(encodeMove(41, { x: 1.23456, z: -2.5, yaw: 0.5, pitch: -0.25 })))).toEqual({ game: 41, x: 1.235, z: -2.5, yaw: 0.5, pitch: -0.25 })
    expect(decodeMove({ t: 'hos-mv', g: 41, x: 1, z: 99, y: 0, p: 0 })).toBeNull()
    expect(decodeMove({ t: 'hos-mv', g: 41, x: 1, z: 1, y: 0, p: 3 })).toBeNull()
    expect(decodeShot(relay(encodeShot(41, { x: 1, z: 2, yaw: 3, pitch: 0.1, victim: 'p2' })))).toEqual({ game: 41, x: 1, z: 2, yaw: 3, pitch: 0.1, victim: 'p2' })
    expect(decodeShot(relay(encodeShot(41, { x: 1, z: 2, yaw: 3, pitch: 0.1, victim: null })))!.victim).toBeNull()
    expect(decodeShot({ t: 'hos-sh', g: 41, x: 1, z: 2, y: 3, p: 0.1 })).toBeNull()
    expect(decodeShot(relay(encodeMove(41, { x: 1, z: 2, yaw: 3, pitch: 0 })))).toBeNull()
  })
})

describe('eight players in one arena', () => {
  it('end the same on every screen, with messages lost, every hit one a guest saw', () => {
    const game = started(host(8))
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const guests = game.players.map((p, index) => ({ id: p.id, index, copy: hear(game, p.id), lastHeard: game.elapsed, goal: { x: 0, z: 0 }, claims: 0 }))
    const claimedHits = new Map<string, number>()
    const dt = 1 / 30
    for (let frame = 0; !game.over && frame < 30 * 90; frame++) {
      for (const guest of guests.slice(1)) {
        const copy = guest.copy
        stepGame(copy, dt)
        copy.over = false
        const me = copy.players.findIndex((p) => p.mine)
        const mine = copy.players[me]
        if (frame % 60 === 0) guest.goal = { x: (random() * 2 - 1) * 12, z: (random() * 2 - 1) * 12 }
        // Aim at whoever its own screen can see, else walk.
        const seen = sightedBy(copy, me, null)
        const target = seen >= 0 ? copy.players[seen] : null
        const yaw = target ? yawTowards(mine, target) + (random() - 0.5) * 0.06 : yawTowards(mine, guest.goal)
        const pitch = target ? Math.atan2(1.2 - BODY.eye, Math.hypot(target.x - mine.x, target.z - mine.z)) : 0
        look(copy, me, yaw, pitch)
        walk(copy, me, { forward: target ? 0.3 : 1, right: 0 }, dt)
        const shot = target ? fire(copy, me, false) : null
        if (shot) {
          const victim = shot.hit >= 0 ? copy.players[shot.hit].id : null
          if (victim) claimedHits.set(`${guest.id}>${victim}`, (claimedHits.get(`${guest.id}>${victim}`) ?? 0) + 1)
          // Shots are never lost: the relay is a WebSocket. Only late.
          const said = decodeShot(relay(encodeShot(game.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, victim })))!
          claim(game, guest.index, said)
        }
        if (frame % 2 === 0 && random() > 0.25) {
          const said = decodeMove(relay(encodeMove(game.id, mine)))!
          report(game, guest.index, said, said.yaw, said.pitch, game.elapsed - guest.lastHeard)
          guest.lastHeard = game.elapsed
        }
      }
      stepGame(game, dt)
      if (frame % 2 === 0) {
        const wire = relay(encodeSnapshot(game))
        for (const guest of guests.slice(1)) if (random() > 0.2) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
      }
      for (const p of game.players) expect(blocked(arenaFor(SEED), p, BODY.radius)).toBe(false)
    }

    expect(game.over).toBe(true)
    const out = game.players.filter((p) => p.out !== null)
    expect(out.length).toBeGreaterThanOrEqual(4)
    // Every elimination was one the shooter's own screen saw.
    for (const p of out) {
      if (p.by === null) continue
      expect(claimedHits.get(`${game.players[p.by].id}>${p.id}`) ?? 0).toBeGreaterThan(0)
    }
    expect(game.players.filter(isStanding).length).toBeLessThanOrEqual(game.players.length - out.length)
    for (const guest of guests.slice(1)) {
      applySnapshot(guest.copy, decodeSnapshot(relay(encodeSnapshot(game)))!, guest.id)
      expect(guest.copy.players.map((p) => [p.out, p.by, p.kills])).toEqual(game.players.map((p) => [p.out, p.by, p.kills]))
    }
  })
})
