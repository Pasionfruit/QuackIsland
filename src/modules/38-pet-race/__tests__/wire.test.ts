/**
 * One race on the wire: the host's snapshot, a guest's hands and its pick, and
 * who is dealt in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const lobby = vi.hoisted(() => ({
  net: { status: 'joined', room: 'ABCDE', id: 'p1', peers: 0, host: true, why: null },
  peers: [] as { id: string; name: string; ping: null }[],
}))

vi.mock('../../09-net', () => ({
  getNet: () => lobby.net,
  getPeers: () => lobby.peers,
}))

import { TRACK, courseFor } from '../internal/course'
import { PETS } from '../internal/pets'
import { RACE, choose, createGame, phase, stepGame, type Game } from '../internal/rules'
import { MAX_RACERS, SOLO_RACERS, gameRoster, newGame, waitingGame } from '../internal/setup'
import { applySnapshot, decodeHands, decodeSnapshot, encodeHands, encodeSnapshot } from '../internal/wire'

const SEED = 104729
const relay = (m: Record<string, unknown>) => JSON.parse(JSON.stringify(m)) as Record<string, unknown>

function host(n = 3): Game {
  return createGame(
    SEED,
    Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, mine: i === 0 })),
    17,
  )
}

const hear = (game: Game, copy: Game, me: string) => applySnapshot(copy, decodeSnapshot(relay(encodeSnapshot(game)))!, me)

function toTheRace(g: Game, pets: readonly string[]) {
  pets.forEach((pet, i) => choose(g, i, pet as never))
  for (let t = 0; phase(g) !== 'racing'; t += 1 / 60) {
    if (t > 30) throw new Error('never started')
    stepGame(g, 1 / 60)
  }
}

describe('a snapshot', () => {
  it('carries the seed, the phase and everybody, and says which racer is yours', () => {
    const game = host(3)
    toTheRace(game, ['cat', 'rabbit', 'hamster'])
    game.hands[1] = { x: 0.5, z: -1, boost: true }
    for (let i = 0; i < 90; i++) stepGame(game, 1 / 60)

    const copy = hear(game, waitingGame(), 'p2')
    expect(copy).toMatchObject({ id: 17, seed: SEED, over: false, phase: 'racing' })
    expect(copy.racers.map((r) => [r.id, r.mine, r.pet])).toEqual([
      ['p1', false, 'cat'],
      ['p2', true, 'rabbit'],
      ['p3', false, 'hamster'],
    ])
    for (const [i, racer] of copy.racers.entries()) {
      expect(racer.x, `x ${i}`).toBeCloseTo(game.racers[i].x, 1)
      expect(racer.z, `z ${i}`).toBeCloseTo(game.racers[i].z, 1)
      expect(racer.stamina, `tank ${i}`).toBeCloseTo(game.racers[i].stamina, 1)
      expect(racer.taken, `treats ${i}`).toBe(game.racers[i].taken)
    }
    expect(copy.racers[1].boosting).toBe(true)
    // The seed is sent on purpose: everybody has to draw the same course.
    expect(courseFor(copy.seed).hedges).toEqual(courseFor(SEED).hedges)
  })

  it('carries a racer who has not chosen as exactly that, so a guest can see the table filling up', () => {
    const game = host(3)
    choose(game, 0, 'dog')
    const copy = hear(game, waitingGame(), 'p2')
    expect(copy.phase).toBe('choosing')
    expect(copy.racers.map((r) => r.pet)).toEqual(['dog', null, null])
  })

  it('tells a guest why the button is doing nothing: spending, or out of breath', () => {
    const game = host(1)
    toTheRace(game, ['cat'])
    game.hands[0] = { x: 0, z: -1, boost: true }
    for (let i = 0; i < 30; i++) stepGame(game, 1 / 60)
    expect(hear(game, waitingGame(), 'p9').racers[0]).toMatchObject({ boosting: true, winded: false })
    // Run it dry, holding the button the whole way. On the one frame the tank
    // runs out it is both still spending and already out of breath, and it gets
    // a breath back and spends it again after that - so wait for a frame where
    // it is winded and not boosting, which is the state worth telling a guest.
    for (let i = 0; i < 400 && !(game.racers[0].winded && !game.racers[0].boosting); i++) stepGame(game, 1 / 60)
    expect(game.racers[0].winded).toBe(true)
    expect(game.racers[0].boosting).toBe(false)
    expect(hear(game, waitingGame(), 'p9').racers[0]).toMatchObject({ boosting: false, winded: true })
  })

  it('carries who finished, when, and how far everybody else got', () => {
    const game = host(2)
    toTheRace(game, ['dog', 'fish'])
    Object.assign(game.racers[0], { z: -TRACK.length + 0.4 })
    game.hands[0] = { x: 0, z: -1, boost: false }
    for (let i = 0; i < 120 && !game.over; i++) stepGame(game, 1 / 60)
    const copy = hear(game, waitingGame(), 'p2')
    expect(copy.racers[0].finishedAt).toBeCloseTo(game.racers[0].finishedAt!, 2)
    expect(copy.racers[0].best).toBeCloseTo(TRACK.length, 1)
    expect(copy.racers[1].finishedAt).toBeNull()
    expect(copy.over).toBe(true)
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeSnapshot(host(3)))
    expect(decodeSnapshot(good)).not.toBeNull()
    expect(decodeSnapshot({ ...good, t: 'pr-in' })).toBeNull()
    expect(decodeSnapshot({ ...good, h: 7 })).toBeNull()
    expect(decodeSnapshot({ ...good, e: -1 })).toBeNull()
    expect(decodeSnapshot({ ...good, o: 2 })).toBeNull()
    expect(decodeSnapshot({ ...good, p: [] })).toBeNull()
    expect(decodeSnapshot({ ...good, p: Array.from({ length: MAX_RACERS + 1 }, () => ['x', 0, 0, 0, 0, 0, 0, 0, -1, 0, 0]) })).toBeNull()
    const rows = good.p as unknown[][]
    const bent = (at: number, to: unknown) => ({ ...good, p: rows.map((row, j) => (j === 0 ? row.map((v, k) => (k === at ? to : v)) : row)) })
    expect(decodeSnapshot(bent(0, ''))).toBeNull()
    // A pet that is not one of the five.
    expect(decodeSnapshot(bent(1, PETS.length))).toBeNull()
    expect(decodeSnapshot(bent(1, -2))).toBeNull()
    // Off the track, and off the end of it.
    expect(decodeSnapshot(bent(2, 99_999))).toBeNull()
    expect(decodeSnapshot(bent(3, -99_999))).toBeNull()
    // A tank bigger than any animal has, a burn that is not one of the three,
    // a finish after the race was over, and a distance past the finish.
    expect(decodeSnapshot(bent(5, 100_000))).toBeNull()
    expect(decodeSnapshot(bent(6, 3))).toBeNull()
    expect(decodeSnapshot(bent(8, RACE.length * 100 + 1))).toBeNull()
    expect(decodeSnapshot(bent(9, TRACK.length * 10 + 1))).toBeNull()
  })

  it('takes a copy from one race to the next without leaving the old field behind', () => {
    const first = host(3)
    const copy = hear(first, waitingGame(), 'p2')
    expect(copy.racers).toHaveLength(3)
    const second = createGame(SEED + 3, [{ id: 'p2' }, { id: 'p1' }], 18)
    hear(second, copy, 'p2')
    expect(copy.id).toBe(18)
    expect(copy.seed).toBe(SEED + 3)
    expect(copy.racers.map((r) => [r.id, r.mine])).toEqual([
      ['p2', true],
      ['p1', false],
    ])
  })
})

describe('a guest saying what its hands are doing', () => {
  it('carries the keys, the button and the pick, so changing your mind is just the next message', () => {
    const said = { game: 17, x: -1, z: 0.5, boost: true, pet: 'hamster' as const }
    expect(decodeHands(relay(encodeHands(said)))).toEqual(said)
    expect(decodeHands(relay(encodeHands({ ...said, pet: null })))).toEqual({ ...said, pet: null })
  })

  it('is refused whole rather than half-read', () => {
    const good = relay(encodeHands({ game: 1, x: 0, z: 0, boost: false, pet: null }))
    expect(decodeHands(good)).not.toBeNull()
    expect(decodeHands({ ...good, t: 'pr' })).toBeNull()
    expect(decodeHands({ ...good, x: 400 })).toBeNull()
    expect(decodeHands({ ...good, z: 1.5 })).toBeNull()
    expect(decodeHands({ ...good, b: 2 })).toBeNull()
    expect(decodeHands({ ...good, c: PETS.length })).toBeNull()
    expect(decodeHands({ ...good, c: -2 })).toBeNull()
  })
})

describe('the roster in a lobby', () => {
  beforeEach(() => {
    lobby.peers = []
  })

  it('is you and stand-ins when nobody else has arrived', () => {
    const roster = gameRoster()
    expect(roster).toHaveLength(SOLO_RACERS)
    expect(roster[0]).toEqual({ id: 'p1', bot: false })
    expect(roster.slice(1).every((r) => r.bot)).toBe(true)
  })

  it('is everybody in the lobby and no stand-ins, each in their own lane', () => {
    lobby.peers = [
      { id: 'p2', name: 'bea', ping: null },
      { id: 'p3', name: 'cal', ping: null },
    ]
    const game = newGame()
    expect(game.racers.map((r) => r.id)).toEqual(['p1', 'p2', 'p3'])
    expect(game.racers.some((r) => r.bot)).toBe(false)
    expect(game.racers.filter((r) => r.mine).map((r) => r.id)).toEqual(['p1'])
    expect(game.racers.every((r) => r.pet === null)).toBe(true)
  })

  it('stops at eight', () => {
    lobby.peers = Array.from({ length: 11 }, (_, i) => ({ id: `p${i + 2}`, name: `g${i}`, ping: null }))
    expect(gameRoster()).toHaveLength(MAX_RACERS)
  })

  it('gives a guest an empty course to hold until the host says otherwise', () => {
    const waiting = waitingGame()
    expect(waiting.racers).toEqual([])
    expect(waiting.over).toBe(false)
  })
})
