/**
 * One game on the wire - and a full lobby of eight playing through it.
 */
import { describe, expect, it } from 'vitest'
import { ARENA, balloonAt } from '../internal/arena'
import { createGame, fire, stepGame, type Game } from '../internal/game'
import { waitingGame } from '../internal/setup'
import { applySnapshot, decodeShot, decodeSnapshot, encodeShot, encodeSnapshot } from '../internal/wire'

const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>
const SEED = 555

function host(players = 3): Game {
  return createGame(SEED, Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}` })), 9)
}

describe('a snapshot', () => {
  it('comes back as the game that went out, balloons and all, without sending a balloon', () => {
    const g = host()
    while (g.elapsed < 5) stepGame(g, 0.1)
    const b = g.balloons.find((x) => x.owner === 1 && balloonAt(x, g.elapsed))!
    fire(g, { shooter: 1, balloon: b.id, point: balloonAt(b, g.elapsed)! })

    const wire = relay(encodeSnapshot(g))
    expect(JSON.stringify(wire)).not.toContain('"speed"')
    const copy = applySnapshot(waitingGame(), decodeSnapshot(wire)!, 'p2')
    expect(copy.balloons).toEqual(g.balloons)
    expect(copy.popped.get(b.id)).toBe(1)
    expect(copy.players.map((p) => [p.id, p.score, p.shots, p.seq])).toEqual(g.players.map((p) => [p.id, p.score, p.shots, p.seq]))
    expect(copy.players[1].lastShot).toMatchObject({ hit: true, own: true })
    expect(copy.players.filter((p) => p.mine).map((p) => p.id)).toEqual(['p2'])
  })

  it('stops mentioning a popped balloon once it would have floated away', () => {
    const g = host()
    while (g.elapsed < 3) stepGame(g, 0.1)
    const b = g.balloons.find((x) => balloonAt(x, g.elapsed))!
    fire(g, { shooter: 0, balloon: b.id, point: { x: 0, y: 0, z: 0 } })
    expect(decodeSnapshot(relay(encodeSnapshot(g)))!.popped.has(b.id)).toBe(true)
    while (!g.over) stepGame(g, 0.25)
    expect(decodeSnapshot(relay(encodeSnapshot(g)))!.popped.has(b.id)).toBe(false)
  })

  it('stays well inside a relay message with eight players, all popping', () => {
    const g = host(8)
    while (!g.over) {
      g.players.forEach((_, i) => {
        const b = g.balloons.find((x) => x.owner === i && !g.popped.has(x.id) && balloonAt(x, g.elapsed))
        if (b) fire(g, { shooter: i, balloon: b.id, point: balloonAt(b, g.elapsed)! })
      })
      expect(JSON.stringify(encodeSnapshot(g)).length).toBeLessThan(2500)
      stepGame(g, 0.25)
    }
  })

  it('deals a guest into a new game when the id changes', () => {
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(host())))!, 'p1')
    copy.popped.set(0, 0)
    const next = createGame(SEED + 1, [{ id: 'p1' }, { id: 'p2' }], 10)
    applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(next)))!, 'p1')
    expect(copy.id).toBe(10)
    expect(copy.players).toHaveLength(2)
    expect(copy.balloons).toEqual(next.balloons)
    expect(copy.popped.size).toBe(0)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host()))
    const players = good.p as unknown[][]
    expect(decodeSnapshot({ ...good, t: 'ps' })).toBeNull()
    expect(decodeSnapshot({ ...good, e: -1 })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, k: [1] })).toBeNull()
    expect(decodeSnapshot({ ...good, k: [1, 7] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [players[0].slice(0, 5)] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [[...players[0].slice(0, 5), [1, 2, 3, 4, 5, 6]]] })).toBeNull()
  })
})

describe('a shot message', () => {
  it('comes back as what was sent', () => {
    const shot = { seq: 4, balloon: 17, x: 1.5, y: 6.25, z: -3 }
    expect(decodeShot(relay(encodeShot(shot)))).toEqual(shot)
    expect(decodeShot(relay(encodeShot({ ...shot, balloon: null })))!.balloon).toBeNull()
  })

  it('is refused when it is not one', () => {
    expect(decodeShot({ t: 'dh-in', q: 0, b: 1, x: 0, y: 0, z: 0 })).toBeNull()
    expect(decodeShot({ t: 'dh-in', q: 1, b: -2, x: 0, y: 0, z: 0 })).toBeNull()
    expect(decodeShot({ t: 'dh-in', q: 1, b: 1, x: 'left', y: 0, z: 0 })).toBeNull()
  })
})

describe('eight people in one game', () => {
  it('agree on every pop and every score, with shots said more than once and some lost', () => {
    const g = host(8)
    const guests = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 2}`, copy: waitingGame(), seq: 0 }))
    const random = (() => {
      let s = 1
      return () => ((s = (s * 16807) % 2147483647) / 2147483647)
    })()
    let frame = 0

    while (!g.over) {
      for (const [n, guest] of guests.entries()) {
        const index = n + 1
        const mine = guest.copy.players[index]
        if (!mine || mine.cooldown > 0) continue
        const b = guest.copy.balloons.find((x) => x.owner === index && !guest.copy.popped.has(x.id) && balloonAt(x, guest.copy.elapsed))
        if (!b) continue
        guest.seq += 1
        // As the network hook does: the cooldown starts on your own screen the
        // moment you fire, not when the host's answer arrives.
        mine.cooldown = ARENA.cooldown
        const shot = relay(encodeShot({ seq: guest.seq, balloon: b.id, ...balloonAt(b, guest.copy.elapsed)! }))
        // Said three times; the first two lost a third of the time.
        for (let say = 0; say < 3; say++) {
          if (say < 2 && random() < 0.33) continue
          const heard = decodeShot(shot)!
          fire(g, { shooter: index, balloon: heard.balloon, point: heard, seq: heard.seq })
        }
      }
      stepGame(g, 1 / 20)
      if (frame++ % 2 === 0) {
        const wire = relay(encodeSnapshot(g))
        for (const guest of guests) {
          applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)
          // The clock is the network hook's to ease; here it simply follows.
          guest.copy.elapsed = g.elapsed
        }
      }
    }
    const wire = relay(encodeSnapshot(g))
    for (const guest of guests) applySnapshot(guest.copy, decodeSnapshot(wire)!, guest.id)

    for (const guest of guests) {
      expect(guest.copy.over).toBe(true)
      expect(guest.copy.players.map((p) => [p.id, p.score, p.shots])).toEqual(g.players.map((p) => [p.id, p.score, p.shots]))
    }
    // Every shot a guest took was taken once, however often it was said.
    for (const [n, guest] of guests.entries()) expect(g.players[n + 1].shots).toBe(guest.seq)
    for (const p of g.players.slice(1)) {
      expect(p.score).toBeGreaterThan(10)
      expect(p.score).toBe(p.shots)
    }
  })
})

describe('the cooldown on the wire', () => {
  it('is carried to the hundredth', () => {
    const g = host()
    fire(g, { shooter: 0, balloon: null, point: { x: 0, y: 0, z: 0 } })
    stepGame(g, 0.2)
    stepGame(g, 0.133)
    const copy = applySnapshot(waitingGame(), decodeSnapshot(relay(encodeSnapshot(g)))!, 'p1')
    expect(copy.players[0].cooldown).toBeCloseTo(ARENA.cooldown - 0.333, 2)
  })
})
