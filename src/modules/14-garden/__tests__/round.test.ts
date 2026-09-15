import { describe, expect, it } from 'vitest'
import { GRID, inGrid } from '../internal/grid'
import { GOOFS, decodeRound, fromWire, toWire } from '../internal/goofs'
import { DEFENDERS, defenderById } from '../internal/pieces'
import {
  SEED,
  addSeed,
  age,
  claimSeed,
  emptyRound,
  nextSpawnIn,
  plant,
  plantAt,
  refusePlant,
  spawnSeed,
  uproot,
  type Round,
  type Seed,
} from '../internal/round'

/** A generator that walks 0, 0.1, 0.2 ... so a test can say where a seed goes. */
function steps(...values: number[]): () => number {
  let at = 0
  return () => values[Math.min(at++, values.length - 1)]
}

const rich = (): Round => emptyRound(10_000)

describe('seeds landing on the lawn', () => {
  it('lands one somewhere on the board', () => {
    const seed = spawnSeed(emptyRound(0), 1, steps(0.5))
    expect(seed).not.toBeNull()
    expect(inGrid(seed!.row, seed!.col)).toBe(true)
    expect(seed!.worth).toBe(SEED.worth)
    expect(seed!.left).toBe(SEED.life)
  })

  it('can reach every square, including the far corner', () => {
    // A generator that always rounds down would keep dropping seeds in the
    // top-left and nobody would ever notice why the far lane felt quiet.
    const first = spawnSeed(emptyRound(0), 1, steps(0))
    const last = spawnSeed(emptyRound(0), 1, steps(0.999999))
    expect(first).toEqual(expect.objectContaining({ row: 0, col: 0 }))
    expect(last).toEqual(
      expect.objectContaining({ row: GRID.rows - 1, col: GRID.cols - 1 }),
    )
  })

  it('never drops two in one square', () => {
    // Two seeds in a square is one seed you cannot click.
    let round = emptyRound(0)
    for (let i = 0; i < SEED.most; i++) {
      const seed = spawnSeed(round, i + 1, steps(0))
      expect(seed).not.toBeNull()
      round = addSeed(round, seed!)
    }
    const squares = round.loose.map((s) => `${s.row},${s.col}`)
    expect(new Set(squares).size).toBe(squares.length)
  })

  it('stops once the lawn has enough on it', () => {
    let round = emptyRound(0)
    for (let i = 0; i < SEED.most; i++) {
      round = addSeed(round, spawnSeed(round, i + 1, steps(0.3))!)
    }
    // Without a cap a party that stops clicking comes back to a paved lawn.
    expect(spawnSeed(round, 99, steps(0.3))).toBeNull()
  })

  it('waits a different length of time each time, around the average', () => {
    expect(nextSpawnIn(steps(0.5))).toBeCloseTo(SEED.every, 9)
    expect(nextSpawnIn(steps(0))).toBeCloseTo(SEED.every - SEED.jitter, 9)
    expect(nextSpawnIn(steps(1))).toBeCloseTo(SEED.every + SEED.jitter, 9)
    expect(SEED.jitter).toBeLessThan(SEED.every)
  })
})

describe('seeds running out', () => {
  const seeded = (left: number): Round =>
    addSeed(emptyRound(0), { id: 1, row: 2, col: 3, worth: SEED.worth, left })

  it('counts down', () => {
    const round = age(seeded(SEED.life), 1)
    expect(round.loose[0].left).toBeCloseTo(SEED.life - 1, 9)
  })

  it('takes them away when they reach nothing', () => {
    expect(age(seeded(0.5), 0.6).loose).toHaveLength(0)
    expect(age(seeded(0.5), 0.4).loose).toHaveLength(1)
  })

  it('ignores time that did not pass', () => {
    const round = seeded(4)
    expect(age(round, 0)).toBe(round)
    expect(age(round, -3)).toBe(round)
  })
})

describe('clicking a seed', () => {
  const lawn = (): Round =>
    addSeed(emptyRound(100), { id: 7, row: 1, col: 1, worth: 25, left: 5 })

  it('pays into the shared pot and takes the seed away', () => {
    const { round, gained } = claimSeed(lawn(), 7)
    expect(gained).toBe(25)
    expect(round.seeds).toBe(125)
    expect(round.loose).toHaveLength(0)
  })

  it('pays the second person nothing', () => {
    // Two players *will* click the same seed. The loser must not be told they
    // earned twenty-five that nobody adds to the pot.
    const first = claimSeed(lawn(), 7)
    const second = claimSeed(first.round, 7)
    expect(second.gained).toBe(0)
    expect(second.round.seeds).toBe(first.round.seeds)
  })

  it('ignores a seed that was never there', () => {
    const { round, gained } = claimSeed(lawn(), 999)
    expect(gained).toBe(0)
    expect(round.seeds).toBe(100)
  })
})

describe('planting', () => {
  const hand = ['duck', 'turtle'] as const

  it('puts one down and takes the cost out of the pot', () => {
    const { round, refused } = plant(rich(), hand, 3, 4, 'duck')
    expect(refused).toBeNull()
    expect(round.seeds).toBe(10_000 - defenderById('duck').cost)
    expect(plantAt(round, 3, 4)?.id).toBe('duck')
  })

  it('refuses a square that is already taken', () => {
    const { round } = plant(rich(), hand, 3, 4, 'duck')
    const again = plant(round, hand, 3, 4, 'turtle')
    expect(again.refused).toBe('square taken')
    // And it must not have been paid for.
    expect(again.round).toBe(round)
  })

  it('refuses an animal the party did not bring', () => {
    expect(plant(rich(), hand, 0, 0, 'frog').refused).toBe('not in the loadout')
  })

  it('refuses a square off the lawn', () => {
    expect(plant(rich(), hand, -1, 0, 'duck').refused).toBe('off the lawn')
    expect(plant(rich(), hand, 0, GRID.cols, 'duck').refused).toBe('off the lawn')
    expect(plant(rich(), hand, 0.5, 0, 'duck').refused).toBe('off the lawn')
  })

  it('refuses what the pot cannot pay for, and charges nothing for trying', () => {
    const broke = emptyRound(defenderById('duck').cost - 1)
    const tried = plant(broke, hand, 0, 0, 'duck')
    expect(tried.refused).toBe('not enough seeds')
    expect(tried.round.seeds).toBe(broke.seeds)
    expect(tried.round.plants).toHaveLength(0)
  })

  it('digs one up again without paying anybody back', () => {
    const { round } = plant(rich(), hand, 2, 2, 'duck')
    const after = uproot(round, 2, 2)
    expect(plantAt(after, 2, 2)).toBeNull()
    expect(after.seeds).toBe(round.seeds)
    // And digging up an empty square changes nothing at all.
    expect(uproot(after, 2, 2)).toBe(after)
  })

  it('says why in words, because the screen has to say one of them out loud', () => {
    const why = refusePlant(rich(), hand, 0, 0, 'frog')
    expect(typeof why).toBe('string')
    expect(why).toMatch(/loadout/)
  })
})

describe('the round on the wire', () => {
  function busy(): Round {
    let round = emptyRound(250)
    round = addSeed(round, { id: 1, row: 0, col: 0, worth: 25, left: 8.256 })
    round = addSeed(round, { id: 2, row: 7, col: 11, worth: 25, left: 1.5 })
    return plant(round, ['duck', 'turtle'], 4, 4, 'turtle').round
  }

  it('round-trips through the transport, which is JSON', () => {
    const there = busy()
    const sent = JSON.parse(JSON.stringify(toWire(there)))
    const wire = decodeRound(sent)
    expect(wire).not.toBeNull()
    const back = fromWire(wire!)
    expect(back.seeds).toBe(there.seeds)
    expect(back.plants).toEqual(there.plants)
    expect(back.loose.map((s) => s.id)).toEqual([1, 2])
    // Seconds are rounded on the way out; a hundredth is a tenth of a frame.
    expect(back.loose[0].left).toBeCloseTo(8.26, 2)
  })

  it('stays well inside what the relay will carry', () => {
    // A full lawn, longhand, would be close enough to the four-kilobyte limit
    // to find out about it in front of somebody.
    let round = emptyRound(100_000)
    const hand = DEFENDERS.map((d) => d.id)
    for (let row = 0; row < GRID.rows; row++) {
      for (let col = 0; col < GRID.cols; col++) {
        round = plant(round, hand, row, col, 'duck').round
      }
    }
    round = { ...round, seeds: 9999 }
    for (let i = 0; i < SEED.most; i++) {
      round = addSeed(round, { id: i, row: 0, col: i, worth: 25, left: 9 })
    }
    expect(round.plants).toHaveLength(GRID.rows * GRID.cols)
    expect(JSON.stringify({ t: 'goofs', round: toWire(round) }).length).toBeLessThan(3000)
  })

  it('refuses a lawn it could not draw', () => {
    const good = toWire(busy())
    expect(decodeRound({ ...good, s: -1 })).toBeNull()
    expect(decodeRound({ ...good, s: Number.NaN })).toBeNull()
    expect(decodeRound({ ...good, p: [[GRID.rows, 0, 0]] })).toBeNull()
    expect(decodeRound({ ...good, p: [[0, GRID.cols, 0]] })).toBeNull()
    expect(decodeRound({ ...good, p: [[0, 0, DEFENDERS.length]] })).toBeNull()
    // Two animals in one square is a lawn that cannot be drawn.
    expect(decodeRound({ ...good, p: [[1, 1, 0], [1, 1, 1]] })).toBeNull()
    expect(decodeRound({ ...good, l: [[1, 0, 0, 25]] })).toBeNull()
    expect(decodeRound(null)).toBeNull()
    expect(decodeRound('round')).toBeNull()
  })

  it('refuses more plants than there are squares', () => {
    const many = Array.from({ length: GRID.rows * GRID.cols + 1 }, () => [0, 0, 0])
    expect(decodeRound({ s: 0, l: [], p: many })).toBeNull()
  })
})

describe('the pot pays for what the party brought', () => {
  it('starts able to plant something', () => {
    const cheapest = Math.min(...DEFENDERS.map((d) => d.cost))
    expect(GOOFS.startingSeeds).toBeGreaterThanOrEqual(cheapest)
  })

  it('is worth clicking a seed for', () => {
    // A seed that did not move you towards anything would be a chore.
    expect(SEED.worth).toBeGreaterThan(0)
    expect(SEED.life).toBeGreaterThan(2)
  })

  it('keeps a loose seed to a square that exists', () => {
    const seed: Seed = { id: 1, row: GRID.rows - 1, col: GRID.cols - 1, worth: 25, left: 3 }
    expect(inGrid(seed.row, seed.col)).toBe(true)
  })
})
