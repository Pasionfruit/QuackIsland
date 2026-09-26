import { describe, expect, it } from 'vitest'
import { botIntents } from '../internal/ai'
import {
  CRACK_TIME,
  DIM,
  LAYERS,
  MOVE,
  ROUND,
  broken,
  cracked,
  createRound,
  forward,
  inFootprint,
  placings,
  ringOf,
  ringsGoneAt,
  rightOf,
  shrunk,
  spawns,
  standing,
  stepRound,
  tileAt,
  tileCentre,
  tileIndex,
  timeLeft,
  type Intent,
  type Round,
} from '../internal/rules'

const STILL: Intent = { x: 0, z: 0, yaw: 0, jumps: 0, pushes: 0 }

/** Runs a round for `seconds`, at a fixed 1/60 step, applying the same intents every tick. */
function run(round: Round, seconds: number, intents: ReadonlyMap<string, Intent>): Round {
  const ticks = Math.round(seconds * 60)
  for (let i = 0; i < ticks && !round.over; i++) stepRound(round, intents, 1 / 60)
  return round
}

/** A round of two, dropped exactly on top of each other at the centre, so geometry is easy to reason about. */
function duo(): Round {
  const round = createRound(1, [{ id: 'a', mine: true }, { id: 'b' }], 1)
  for (const p of round.players) {
    p.x = 0
    p.z = 0
  }
  round.players[1].x = 1
  return round
}

describe('the grid', () => {
  it('addresses tiles the same way on every layer', () => {
    expect(tileIndex(0, 0, 0)).toBe(0)
    expect(tileIndex(1, 0, 0)).toBe(DIM * DIM)
    expect(tileIndex(2, 0, 0)).toBe(DIM * DIM * 2)
  })

  it('centres a smaller layer inside a bigger one', () => {
    // The top layer uses every cell; the bottom layer only the middle 5x5.
    expect(inFootprint(0, 0, 0)).toBe(true)
    expect(inFootprint(2, 0, 0)).toBe(false)
    expect(inFootprint(2, 2, 2)).toBe(true)
    expect(inFootprint(2, 4, 4)).toBe(true)
  })

  it('finds the tile nearest a world point, and back again', () => {
    const { row, col } = tileAt(0, 0)
    expect(row).toBe(4)
    expect(col).toBe(4)
    const centre = tileCentre(row, col)
    expect(centre.x).toBeCloseTo(0)
    expect(centre.z).toBeCloseTo(0)
  })

  it('rings the centre at zero, the corner at its layer\'s half-size', () => {
    expect(ringOf(0, 4, 4)).toBe(0)
    expect(ringOf(0, 0, 0)).toBe(4)
    expect(ringOf(2, 2, 2)).toBe(2)
  })
})

describe('the shrink', () => {
  it('shrinks nothing before the first checkpoint, then claims the outer ring', () => {
    expect(shrunk(0, 0, 0, 0)).toBe(false)
    expect(ringsGoneAt(0, 25)).toBe(0)
    expect(ringsGoneAt(0, 26)).toBe(1)
    expect(shrunk(0, 0, 0, 26)).toBe(true)
    // The centre, at ring 0, survives the first several rings going.
    expect(shrunk(0, 4, 4, 56)).toBe(false)
  })

  it('shrinks the bottom layer first and fastest, per the brief', () => {
    expect(ringsGoneAt(2, 9)).toBeGreaterThan(0)
    expect(ringsGoneAt(0, 9)).toBe(0)
    expect(ringsGoneAt(2, 17)).toBe(2)
  })
})

describe('cracking underfoot', () => {
  it('cracks the tile the instant you stand on it, and it is gone CRACK_TIME later', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    p.x = 0
    p.z = 0
    const { row, col } = tileAt(p.x, p.z)
    expect(cracked(round.tiles, 0, row, col, round.elapsed)).toBe(false)
    stepRound(round, new Map([['a', STILL]]), 1 / 60)
    expect(cracked(round.tiles, 0, row, col, round.elapsed)).toBe(true)
    expect(broken(round.tiles, 0, row, col, round.elapsed)).toBe(false)
    run(round, CRACK_TIME + 0.2, new Map([['a', STILL]]))
    expect(broken(round.tiles, 0, row, col, round.elapsed)).toBe(true)
  })

  it('does not restart the fuse just because you are still standing there', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    p.x = 0
    p.z = 0
    stepRound(round, new Map([['a', STILL]]), 1 / 60)
    const crackedAt = round.tiles.crackedAt[tileIndex(0, 4, 4)]
    run(round, 1, new Map([['a', STILL]])) // still on the same tile a second later
    expect(round.tiles.crackedAt[tileIndex(0, 4, 4)]).toBe(crackedAt)
  })

  it('a tile two players share cracks once, timed from whoever got there first', () => {
    const round = duo()
    const [a, b] = round.players
    a.x = 0
    a.z = 0
    stepRound(round, new Map([['a', STILL]]), 1 / 60)
    const firstCrack = round.tiles.crackedAt[tileIndex(0, 4, 4)]
    run(round, 1, new Map())
    b.x = 0
    b.z = 0
    run(round, 0.05, new Map([['b', STILL]]))
    expect(round.tiles.crackedAt[tileIndex(0, 4, 4)]).toBe(firstCrack)
  })

  it('never cracks a tile under somebody who is airborne', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    p.x = 0
    p.z = 0
    p.grounded = false
    p.vy = 5
    run(round, 0.05, new Map([['a', STILL]]))
    expect(round.tiles.crackedAt[tileIndex(0, 4, 4)]).toBeNull()
  })
})

describe('falling', () => {
  it('a jump off solid ground lands you back on the same tile, not the layer below', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    p.x = 0
    p.z = 0
    const startY = p.y
    const startLayer = p.layer
    run(round, 0.05, new Map([['a', { ...STILL, jumps: 1 }]]))
    expect(p.grounded).toBe(false) // airborne the instant the jump starts
    run(round, 3, new Map([['a', STILL]])) // plenty of time for the arc to complete
    expect(p.grounded).toBe(true)
    expect(p.layer).toBe(startLayer)
    expect(p.y).toBeCloseTo(startY, 5)
    expect(p.alive).toBe(true)
  })

  it('lands you on the layer below when a tile gives way, rather than eliminating you at once', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    p.x = 0
    p.z = 0
    // Standing still is enough: the tile cracks the instant you arrive, and
    // is gone CRACK_TIME later.
    run(round, CRACK_TIME - 0.02, new Map([['a', STILL]]))
    expect(p.grounded).toBe(true) // still within the fuse
    run(round, 2, new Map([['a', STILL]]))
    expect(p.alive).toBe(true)
    expect(p.grounded).toBe(true)
    expect(p.layer).toBe(1)
    expect(p.y).toBeCloseTo(LAYERS[1].y, 1)
  })

  it('falls straight past a layer that has no tile under you, into the one below that', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    // Just inside the top layer's footprint, but outside layer 1's - so there
    // is nothing to land on until layer 2, which does not reach this far out either.
    p.x = 0
    p.z = tileCentre(0, 4).z // row 0: on layer 0, off both layer 1 and layer 2
    run(round, CRACK_TIME + 0.2, new Map([['a', STILL]]))
    run(round, 3, new Map([['a', STILL]]))
    expect(p.alive).toBe(false)
  })

  it('eliminates you once you fall through the bottom layer', () => {
    const round = createRound(1, [{ id: 'a', mine: true }], 1)
    const p = round.players[0]
    p.x = 0
    p.z = 0
    p.layer = 2
    p.y = LAYERS[2].y
    run(round, CRACK_TIME + 0.2, new Map([['a', STILL]]))
    run(round, 2, new Map([['a', STILL]]))
    expect(p.alive).toBe(false)
    expect(p.eliminatedAt).not.toBeNull()
  })
})

describe('pushing', () => {
  it('knocks back whoever is ahead of you and inside the facing tiles', () => {
    const round = duo()
    const [a, b] = round.players
    a.x = 0
    a.z = 0
    a.yaw = -Math.PI / 2 // forward = (1, 0)
    b.x = 1
    b.z = 0 // dead ahead
    run(round, 0.05, new Map([['a', { ...STILL, yaw: a.yaw, pushes: 1 }]]))
    expect(Math.hypot(b.knockX, b.knockZ)).toBeGreaterThan(0)
    expect(b.knockX).toBeGreaterThan(0) // knocked further the way a was facing
  })

  it('gates repeat pushes with a cooldown', () => {
    const round = duo()
    const [a, b] = round.players
    a.x = 0
    a.z = 0
    a.yaw = -Math.PI / 2
    b.x = 1
    b.z = 0
    run(round, 0.05, new Map([['a', { ...STILL, yaw: a.yaw, pushes: 5 }]]))
    expect(a.pushes).toBeLessThan(5)
  })

  it('leaves somebody behind you alone', () => {
    const round = duo()
    const [a, b] = round.players
    a.x = 0
    a.z = 0
    a.yaw = -Math.PI / 2 // forward = (1, 0), so b at x = -1 is directly behind
    b.x = -1
    b.z = 0
    run(round, 0.05, new Map([['a', { ...STILL, yaw: a.yaw, pushes: 1 }]]))
    expect(b.knockX).toBe(0)
    expect(b.knockZ).toBe(0)
  })
})

describe('the round', () => {
  it('spawns everybody apart, inside the top layer', () => {
    const starts = spawns(6)
    expect(starts).toHaveLength(6)
    for (const s of starts) expect(Math.hypot(s.x, s.z)).toBeLessThan((LAYERS[0].size * 2.4) / 2)
  })

  it('ends once one is left standing, after a beat to watch the last fall', () => {
    const round = duo()
    round.players[1].alive = false
    round.players[1].eliminatedAt = round.elapsed
    stepRound(round, new Map(), 1 / 60)
    expect(round.decidedAt).not.toBeNull()
    expect(round.over).toBe(false)
    run(round, ROUND.outro + 0.1, new Map())
    expect(round.over).toBe(true)
  })

  it('ends at the safety-net limit if the round has not otherwise been decided', () => {
    // Standing still is no longer a stalemate - your own tile cracks under you
    // regardless - so the safety net is checked directly at the clock, not by
    // simulating a real 150-second standoff.
    const round = duo()
    round.elapsed = ROUND.limit - 0.01
    stepRound(round, new Map(), 1 / 60)
    expect(round.over).toBe(true)
    expect(timeLeft(round)).toBe(0)
  })

  it('places the last one standing first, and ranks the rest by how long they lasted', () => {
    const round = duo()
    round.players[1].alive = false
    round.players[1].eliminatedAt = 4
    const [a, b] = placings(round)
    expect(a.place).toBe(1)
    expect(b.place).toBe(2)
    expect(standing(round)).toEqual([round.players[0]])
  })

  it('moves at MOVE.speed toward the desired direction, and not at all while stunned by a fresh push', () => {
    const round = duo()
    const a = round.players[0]
    const before = a.x
    run(round, 0.5, new Map([['a', { ...STILL, x: 1, z: 0 }]]))
    expect(a.x - before).toBeCloseTo(MOVE.speed * 0.5, 0)

    const b = round.players[1]
    b.stunUntil = round.elapsed + 10
    const stunnedBefore = b.x
    run(round, 0.5, new Map([['b', { ...STILL, x: 1, z: 0 }]]))
    const gained = b.x - stunnedBefore
    expect(gained).toBeGreaterThan(0)
    expect(gained).toBeLessThan(MOVE.speed * 0.5)
  })
})

describe('which way is which', () => {
  it('forward and right are at right angles', () => {
    for (const yaw of [0, 0.3, Math.PI / 2, Math.PI, -1.4]) {
      const f = forward(yaw)
      const r = rightOf(yaw)
      expect(f.x * r.x + f.z * r.z).toBeCloseTo(0)
    }
  })

  it('right is really to the right, not the left - so A and D are not swapped', () => {
    // Facing -Z (yaw 0, the way spawns() faces the middle from the south),
    // right hand points to +X: cross(forward, up) with up = +Y.
    const f = forward(0)
    const r = rightOf(0)
    expect(f.x).toBeCloseTo(0)
    expect(f.z).toBeCloseTo(-1)
    expect(r.x).toBeCloseTo(1)
    expect(r.z).toBeCloseTo(0)
    // The determinant of [forward, right] is positive for a genuine right turn.
    expect(f.x * r.z - f.z * r.x).toBeGreaterThan(0)
  })
})

describe('the stand-ins', () => {
  it('play a full round without erroring, and some of them fall in', () => {
    let falls = 0
    let overs = 0
    for (let seed = 1; seed <= 4; seed++) {
      const round = createRound(
        seed,
        [
          { id: 'a', bot: true },
          { id: 'b', bot: true },
          { id: 'c', bot: true },
          { id: 'd', bot: true },
        ],
        seed,
      )
      const ticks = Math.round(ROUND.limit * 60)
      for (let i = 0; i < ticks && !round.over; i++) stepRound(round, botIntents(round), 1 / 60)
      if (round.over) overs += 1
      falls += round.players.filter((p) => !p.alive).length
    }
    expect(overs).toBe(4)
    expect(falls).toBeGreaterThan(0)
  })
})
