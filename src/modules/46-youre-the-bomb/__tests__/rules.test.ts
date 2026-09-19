/**
 * The room and the rules: a way through, bombs, blasts, shoves, the hole and the pin.
 */
import { describe, expect, it } from 'vitest'
import { COLS, ROOM, ROWS, cellAt, cellMiddle, inHole, roomFor, scan, spawnPoint } from '../internal/room'
import { BODY, BOMB, PIN, PUSH, ROUND, createGame, inRoom, judgeEnd, leave, move, pinZ, placings, push, steer, stepGame, type Game } from '../internal/rules'

const SEED = 6060

function game(n = 3): Game {
  return createGame(SEED, Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })), 4)
}

function stand(g: Game, i: number, x: number, z: number, yaw = 0): void {
  Object.assign(g.players[i], { x, z, yaw, kx: 0, kz: 0, mx: 0, mz: 0 })
}

/** A square with no bomb in it or next to it, well into the room. */
function clearSpot(seed: number): { x: number; z: number } {
  const room = roomFor(seed)
  for (let row = 10; row < ROWS - 10; row++) {
    for (let col = 1; col < COLS - 1; col++) {
      const m = cellMiddle(row, col)
      if (room.bombs.every((b) => Math.hypot(b.x - m.x, b.z - m.z) > 3)) return m
    }
  }
  throw new Error('no clear spot')
}

describe('the room', () => {
  it('is the same for the same seed, with a different floor for another', () => {
    expect(roomFor(SEED)).toBe(roomFor(SEED))
    expect(JSON.stringify(roomFor(SEED + 1).bombs)).not.toBe(JSON.stringify(roomFor(SEED).bombs))
    expect(roomFor(SEED).bombs.length).toBeGreaterThan(20)
  })

  it('always has a way through: every square of it clear, joined side to side, start row to the hole', () => {
    for (const seed of [SEED, 1, 2, 3, 99, 12345]) {
      const room = roomFor(seed)
      const bombed = new Set(room.bombs.map((b) => `${b.row}:${b.col}`))
      expect(room.way[0].row).toBe(ROWS - 1)
      const hole = cellAt(ROOM.hole.x, ROOM.hole.z)!
      expect(room.way[room.way.length - 1]).toEqual(hole)
      room.way.forEach((w, i) => {
        expect(bombed.has(`${w.row}:${w.col}`)).toBe(false)
        if (i > 0) expect(Math.abs(w.row - room.way[i - 1].row) + Math.abs(w.col - room.way[i - 1].col)).toBe(1)
        // Walking the middle of every square on it sets nothing off.
        const m = cellMiddle(w.row, w.col)
        expect(room.bombs.every((b) => Math.hypot(b.x - m.x, b.z - m.z) > BOMB.trigger + BODY.radius)).toBe(true)
      })
    }
  })

  it('keeps the start and the hole clear, and starts everybody apart at the south end', () => {
    const room = roomFor(SEED)
    for (let n = 1; n <= 8; n++) {
      const spots = Array.from({ length: n }, (_, i) => spawnPoint(i, n))
      for (const s of spots) {
        expect(s.z).toBeGreaterThan(ROOM.halfZ - 4)
        expect(room.bombs.every((b) => Math.hypot(b.x - s.x, b.z - s.z) > 2)).toBe(true)
      }
    }
    expect(room.bombs.every((b) => Math.hypot(b.x - ROOM.hole.x, b.z - ROOM.hole.z) > ROOM.hole.radius + 1)).toBe(true)
  })

  it('scans out to a radius and no further', () => {
    const room = roomFor(SEED)
    const at = { x: 0, z: 0 }
    const seen = scan(room, at, 4)
    room.bombs.forEach((b, i) => expect(seen.includes(i)).toBe(Math.hypot(b.x, b.z) <= 4))
  })
})

describe('a bomb', () => {
  it('goes off under whoever steps on it: they are out, and anybody near is knocked away', () => {
    const g = game(3)
    const b = roomFor(SEED).bombs.find((x) => Math.abs(x.x) < ROOM.halfX - 2)!
    stand(g, 0, b.x, b.z + 0.5)
    stand(g, 1, b.x + 1.2, b.z)
    const clear = clearSpot(SEED)
    stand(g, 2, clear.x, clear.z)
    move(g, 0.01)
    expect(g.players[0]).toMatchObject({ how: 'bomb' })
    expect(g.players[0].out).not.toBe(null)
    expect(g.blown).toHaveLength(1)
    expect(g.players[1].out).toBe(null)
    expect(g.players[1].kx).toBeGreaterThan(3)
    // Once gone off, it is a scorch mark: nothing more.
    stand(g, 1, b.x, b.z)
    move(g, 0.01)
    expect(g.players[1].out).toBe(null)
  })

  it('shoved onto one, it is whoever shoved you who gets the credit', () => {
    const g = game(3)
    const b = roomFor(SEED).bombs.find((x) => Math.abs(x.x) < ROOM.halfX - 3)!
    stand(g, 1, b.x - 1.2, b.z)
    stand(g, 0, b.x - 2.4, b.z, -Math.PI / 2)
    const clear = clearSpot(SEED)
    stand(g, 2, clear.x, clear.z)
    expect(push(g, 0)).toEqual([1])
    for (let i = 0; i < 20 && g.players[1].out === null; i++) stepGame(g, 1 / 30)
    expect(g.players[1]).toMatchObject({ how: 'bomb', by: 0 })
    expect(g.players[0].kills).toBe(1)
  })
})

describe('a shove', () => {
  it('knocks whoever is in front and in reach, not behind, and not twice at once', () => {
    const g = game(3)
    const c = clearSpot(SEED)
    stand(g, 0, c.x, c.z, 0)
    stand(g, 1, c.x, c.z - 1.2)
    stand(g, 2, c.x, c.z + 1.2)
    expect(push(g, 0)).toEqual([1])
    expect(push(g, 0)).toBe(null)
    expect(g.players[1].kz).toBeLessThan(-PUSH.impulse * 0.9)
    expect(g.players[2].kz).toBe(0)
  })

  it('goes the way you last walked', () => {
    const g = game(2)
    const c = clearSpot(SEED)
    stand(g, 0, c.x, c.z)
    steer(g, 0, 1, 0)
    expect(g.players[0].yaw).toBeCloseTo(-Math.PI / 2, 6)
    steer(g, 0, 0, 0)
    expect(g.players[0].yaw).toBeCloseTo(-Math.PI / 2, 6)
  })
})

describe('the way out', () => {
  it('is the hole: over it, you have escaped', () => {
    const g = game(2)
    stand(g, 0, ROOM.hole.x, ROOM.hole.z + ROOM.hole.radius + 0.3)
    steer(g, 0, 0, -1)
    for (let i = 0; i < 20; i++) stepGame(g, 1 / 30)
    expect(g.players[0].escaped).not.toBe(null)
    expect(inRoom(g.players[0])).toBe(false)
    expect(inHole({ x: ROOM.hole.x + ROOM.hole.radius + 0.1, z: ROOM.hole.z })).toBe(false)
  })

  it('the pin waits outside for 45 seconds, then rolls through the room, and whoever it reaches is flattened', () => {
    expect(pinZ(0)).toBeGreaterThan(ROOM.halfZ + PIN.radius)
    expect(pinZ(PIN.arrives - 0.01)).toBeGreaterThan(ROOM.halfZ)
    expect(pinZ(PIN.arrives + 1)).toBeLessThan(pinZ(PIN.arrives))
    const g = game(3)
    const c = clearSpot(SEED)
    stand(g, 0, c.x, ROOM.halfZ - 1)
    stand(g, 1, c.x, c.z)
    stand(g, 2, ROOM.hole.x, ROOM.hole.z)
    stepGame(g, 0.01)
    expect(g.players[2].escaped).not.toBe(null)
    while (g.elapsed < PIN.arrives - 0.1) stepGame(g, 0.25)
    expect(g.players[0].out).toBe(null)
    while (!g.over) stepGame(g, 1 / 30)
    expect(g.players[0].how).toBe('pin')
    expect(g.players[1].how).toBe('pin')
    // Nearer the hole, flattened later.
    expect(g.players[1].out!).toBeGreaterThan(g.players[0].out!)
    expect(g.elapsed).toBeLessThanOrEqual(ROUND.limit + 0.3)
  })
})

describe('the end', () => {
  it('places the escaped first, the first out first; then the last to die', () => {
    const g = game(4)
    const c = clearSpot(SEED)
    stand(g, 0, ROOM.hole.x, ROOM.hole.z)
    stand(g, 1, c.x, c.z)
    stand(g, 2, c.x + 1.5, c.z + 3)
    stand(g, 3, c.x - 1.5, c.z - 3)
    stepGame(g, 0.1)
    stand(g, 1, ROOM.hole.x, ROOM.hole.z)
    stepGame(g, 0.1)
    while (!g.over) stepGame(g, 0.1)
    const order = placings(g)
    expect(order.map((e) => e.index)).toEqual([0, 1, 3, 2])
    expect(order.map((e) => e.place)).toEqual([1, 2, 3, 4])
  })

  it('is over as soon as nobody is left in the room', () => {
    const g = game(2)
    stand(g, 0, ROOM.hole.x, ROOM.hole.z)
    stepGame(g, 0.1)
    expect(judgeEnd(g)).toBe(false)
    leave(g, 1)
    expect(judgeEnd(g)).toBe(true)
    expect(placings(g).map((e) => e.index)).toEqual([0, 1])
  })
})
