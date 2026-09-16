/**
 * One race, shared across a lobby.
 *
 * The host's race goes out as a snapshot and comes back as a guest's race;
 * a guest's held letters go the other way. What is worth checking is that
 * nothing is lost or garbled on the way - above all a binding, because a
 * guest shown the wrong four letters is a guest who cannot move.
 */
import { describe, expect, it } from 'vitest'
import { directionFor } from '../internal/bindings'
import { MAZES, mazeFor } from '../internal/maze'
import { createRace, stepRace, type Race } from '../internal/race'
import { waitingRace } from '../internal/setup'
import {
  applySnapshot,
  decodeKeys,
  decodeSnapshot,
  encodeKeys,
  encodeSnapshot,
} from '../internal/wire'

const SEED = 9001
/** The maze a race with that seed is in, unless told otherwise. */
const LAYOUT = SEED % MAZES.length
const overTheWire = (message: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(message)) as Record<string, unknown>

function hostRace(): Race {
  const race = createRace(SEED, [{ id: 'p1', mine: true }, { id: 'p2' }, { id: 'p3' }])
  // Somebody spun, somebody is in: the state that is easiest to garble.
  const [p1, p2] = race.racers
  p1.x = mazeFor(LAYOUT).platforms[0].at.x
  p1.y = mazeFor(LAYOUT).platforms[0].at.y
  stepRace(race, new Map(), 1 / 60)
  p2.touched = 0b101
  p2.x = 0
  p2.y = 0
  stepRace(race, new Map(), 1 / 60)
  return race
}

describe('a snapshot', () => {
  it('comes back as the race that went out', () => {
    const host = hostRace()
    const guest = applySnapshot(waitingRace(), decodeSnapshot(overTheWire(encodeSnapshot(host)))!, 'p2')

    expect(guest.seed).toBe(SEED)
    expect(guest.firstIn).toBeCloseTo(host.firstIn!, 1)
    expect(guest.racers.map((r) => r.id)).toEqual(['p1', 'p2', 'p3'])
    for (const racer of host.racers) {
      const copy = guest.racers.find((r) => r.id === racer.id)!
      expect(copy.x).toBeCloseTo(racer.x, 1)
      expect(copy.y).toBeCloseTo(racer.y, 1)
      expect(copy.binding).toBe(racer.binding)
      expect(copy.spins).toBe(racer.spins)
      expect(copy.touched).toBe(racer.touched)
      expect(copy.on).toBe(racer.on)
      expect(copy.place).toBe(racer.place)
      expect(copy.finishedAt === null).toBe(racer.finishedAt === null)
    }
  })

  it('carries a spun binding, so a guest is shown the keys the host is reading', () => {
    const host = hostRace()
    expect(host.racers[0].binding).not.toBe('WASD')
    const guest = applySnapshot(waitingRace(), decodeSnapshot(overTheWire(encodeSnapshot(host)))!, 'p1')
    expect(guest.racers[0].binding).toBe(host.racers[0].binding)
  })

  it('marks as yours the racer with your id, and no other', () => {
    const guest = applySnapshot(waitingRace(), decodeSnapshot(encodeSnapshot(hostRace()))!, 'p3')
    expect(guest.racers.filter((r) => r.mine).map((r) => r.id)).toEqual(['p3'])
  })

  it('moves the racers a guest already has rather than building new ones', () => {
    const host = hostRace()
    const guest = applySnapshot(waitingRace(), decodeSnapshot(encodeSnapshot(host))!, 'p2')
    const before = [...guest.racers]
    host.racers[2].x += 1
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(host))!, 'p2')
    guest.racers.forEach((racer, i) => expect(racer).toBe(before[i]))
  })

  it('deals a guest into a new race when the seed changes', () => {
    const guest = applySnapshot(waitingRace(), decodeSnapshot(encodeSnapshot(hostRace()))!, 'p2')
    guest.over = true
    const next = createRace(SEED + 1, [{ id: 'p1' }, { id: 'p2' }])
    applySnapshot(guest, decodeSnapshot(encodeSnapshot(next))!, 'p2')
    expect(guest.seed).toBe(SEED + 1)
    expect(guest.over).toBe(false)
    expect(guest.racers.map((r) => r.binding)).toEqual(['WASD', 'WASD'])
    expect(guest.racers.every((r) => r.place === null)).toBe(true)
  })

  it('is refused whole rather than half-read', () => {
    const good = overTheWire(encodeSnapshot(hostRace()))
    const racers = good.r as unknown[][]
    const withRacer = (i: number, value: unknown) => ({
      ...good,
      r: [racers[0].map((v, j) => (j === i ? value : v))],
    })

    expect(decodeSnapshot({ ...good, t: 'zt' })).toBeNull()
    expect(decodeSnapshot({ ...good, s: 1.5 })).toBeNull()
    expect(decodeSnapshot({ ...good, s: -3 })).toBeNull()
    expect(decodeSnapshot(withRacer(4, 'WWWW'))).toBeNull()
    expect(decodeSnapshot(withRacer(4, 'wasd'))).toBeNull()
    expect(decodeSnapshot(withRacer(1, 'left'))).toBeNull()
    expect(decodeSnapshot(withRacer(6, 0.5))).toBeNull()
    expect(decodeSnapshot({ ...good, r: [racers[0].slice(0, 10)] })).toBeNull()
  })

  it("refuses a race with nobody in it, which could only clear everybody else's", () => {
    expect(decodeSnapshot(overTheWire(encodeSnapshot(waitingRace())))).toBeNull()
  })

  it('fits in a relay message with a full lobby in it', () => {
    const full = createRace(
      SEED,
      Array.from({ length: 16 }, (_, i) => ({ id: `p${i + 1}` })),
    )
    expect(JSON.stringify(encodeSnapshot(full)).length).toBeLessThan(4096)
  })
})

describe("a guest's letters", () => {
  it('come back as what was held, tidied', () => {
    expect(decodeKeys(overTheWire(encodeKeys('dw')))).toBe('DW')
    expect(decodeKeys(overTheWire(encodeKeys('')))).toBe('')
  })

  it('are refused when they are not letters', () => {
    expect(decodeKeys({ t: 'mm-in', k: 5 })).toBeNull()
    expect(decodeKeys({ t: 'zt-in', k: 'W' })).toBeNull()
    // Anything that is not a letter is dropped; what is left is still letters.
    expect(decodeKeys({ t: 'mm-in', k: 'W1!<script>' })).toBe('CIPRSTW')
  })

  it('are read through the binding on the host, not the guest', () => {
    // The guest holds the same letter before and after a spin; what it does
    // is decided by whichever binding the host has for them at the time.
    const host = hostRace()
    const spun = host.racers[0]
    const held = decodeKeys(encodeKeys('W'))!
    expect(directionFor('WASD', held)).toEqual({ x: 0, y: -1 })
    expect(directionFor(spun.binding, held)).toEqual({ x: 0, y: 0 })
  })
})
