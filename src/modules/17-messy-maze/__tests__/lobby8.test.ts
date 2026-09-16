/**
 * A full lobby: eight people in one Messy Maze race.
 *
 * Played out between a host and seven guests, every message through JSON and
 * back the way the relay hands it over. What is worth checking at eight rather
 * than two: the corners are shared out fairly, every guest sees one race, and a
 * guest who has been spun is shown its new letters and moves by them - on the
 * host, where the race is actually run.
 */
import { describe, expect, it } from 'vitest'
import { directionFor } from '../internal/bindings'
import { cellAt, cellCentre, exits, mazeFor, quarterOf, type Point } from '../internal/maze'
import { createRace, stepRace, type Race } from '../internal/race'
import { waitingRace } from '../internal/setup'
import {
  applySnapshot,
  decodeKeys,
  decodeSnapshot,
  encodeKeys,
  encodeSnapshot,
} from '../internal/wire'

const SEED = 8888
const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']
const HOST = IDS[0]
const GUESTS = IDS.slice(1)

const relay = (message: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(message)) as Record<string, unknown>

/** The letter, from a binding, that walks out of a cell through an opening. */
function letterOut(race: Race, id: string): { letter: string; toward: Point } {
  const racer = race.racers.find((r) => r.id === id)!
  const here = cellAt(racer)
  const next = exits(mazeFor(race.seed), here)[0]
  const step = { x: next.x - here.x, y: next.y - here.y }
  // Binding order is up, left, down, right.
  const index = step.y === -1 ? 0 : step.x === -1 ? 1 : step.y === 1 ? 2 : 3
  return { letter: racer.binding[index], toward: step }
}

/** One lobby: the host's race, a copy per guest, and the letters each is holding. */
function lobby() {
  const host = createRace(SEED, IDS.map((id) => ({ id, mine: id === HOST })))
  const guests = new Map(GUESTS.map((id) => [id, waitingRace()]))
  const held = new Map<string, string>()

  const frame = (n: number) => {
    const directions = new Map<string, Point>()
    for (const racer of host.racers) {
      directions.set(racer.id, directionFor(racer.binding, held.get(racer.id) ?? ''))
    }
    stepRace(host, directions, 1 / 60)
    if (n % 3 === 2) {
      const wire = relay(encodeSnapshot(host))
      expect(JSON.stringify(wire).length).toBeLessThan(4096)
      for (const [id, copy] of guests) applySnapshot(copy, decodeSnapshot(wire)!, id)
    }
  }
  const hold = (id: string, letters: string) => held.set(id, decodeKeys(relay(encodeKeys(letters)))!)
  return { host, guests, frame, hold }
}

describe('eight people in one race', () => {
  it('puts two in every corner, and nobody in a wall', () => {
    const race = createRace(SEED, IDS.map((id) => ({ id })))
    const quarters = race.racers.map((r) => quarterOf(cellAt(r)))
    for (let q = 0; q < 4; q++) expect(quarters.filter((x) => x === q)).toHaveLength(2)
    for (const racer of race.racers) {
      expect(cellCentre(cellAt(racer))).toEqual({ x: racer.x, y: racer.y })
    }
  })

  it('shows every guest the same race, with their own racer in it', () => {
    const { host, guests, frame } = lobby()
    for (let n = 0; n < 6; n++) frame(n)
    for (const [id, copy] of guests) {
      expect(copy.seed).toBe(host.seed)
      expect(copy.racers.map((r) => r.id)).toEqual(IDS)
      expect(copy.racers.filter((r) => r.mine).map((r) => r.id)).toEqual([id])
    }
  })

  it("moves each guest by their own letters, and nobody else's", () => {
    const { host, guests, frame, hold } = lobby()
    frame(2)
    const starts = new Map(host.racers.map((r) => [r.id, { x: r.x, y: r.y }]))
    const plans = new Map(GUESTS.map((id) => [id, letterOut(guests.get(id)!, id)]))
    for (const [id, plan] of plans) hold(id, plan.letter)
    for (let n = 0; n < 20; n++) frame(n)

    for (const [id, plan] of plans) {
      const racer = host.racers.find((r) => r.id === id)!
      const start = starts.get(id)!
      const moved = (racer.x - start.x) * plan.toward.x + (racer.y - start.y) * plan.toward.y
      expect(moved, id).toBeGreaterThan(1)
    }
    const me = host.racers.find((r) => r.id === HOST)!
    expect({ x: me.x, y: me.y }).toEqual(starts.get(HOST))
  })

  it("shows a spun guest their new letters, and moves them by those - not by WASD", () => {
    const { host, guests, frame, hold } = lobby()
    const id = 'p6'
    const racer = host.racers.find((r) => r.id === id)!
    const platform = mazeFor(SEED).platforms[3]
    racer.x = platform.at.x
    racer.y = platform.at.y
    // Long enough for the spin to finish and a snapshot to arrive.
    for (let n = 0; n < 40; n++) frame(n)

    const copy = guests.get(id)!.racers.find((r) => r.id === id)!
    expect(copy.binding).not.toBe('WASD')
    expect(copy.binding).toBe(racer.binding)
    expect(copy.touched).toBe(1 << platform.id)

    // The old letters do nothing now.
    const before = { x: racer.x, y: racer.y }
    hold(id, 'WASD')
    for (let n = 0; n < 20; n++) frame(n)
    expect({ x: racer.x, y: racer.y }).toEqual(before)

    // The letters the guest was shown do.
    const plan = letterOut(guests.get(id)!, id)
    hold(id, plan.letter)
    for (let n = 0; n < 20; n++) frame(n)
    expect((racer.x - before.x) * plan.toward.x + (racer.y - before.y) * plan.toward.y).toBeGreaterThan(1)
  })

  it('places all eight when they all get in', () => {
    const { host, frame } = lobby()
    const { platforms } = mazeFor(SEED)
    for (const racer of host.racers) racer.touched = (1 << platforms[0].id) | (1 << platforms[1].id)
    // Into the middle one a frame, last in the roster first.
    const order = [...host.racers].reverse()
    order.forEach((racer, n) => {
      racer.x = 0
      racer.y = 0
      frame(n)
    })
    expect(host.over).toBe(true)
    expect(order.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
