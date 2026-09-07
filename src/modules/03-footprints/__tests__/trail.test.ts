import { describe, expect, it } from 'vitest'
import { TRAIL, createTrail, fadeOf, stepTrail, type TrailState, type Walker } from '../internal/trail'

const flat = () => 0
const walker = (x: number, z: number, over: Partial<Walker> = {}): Walker => ({
  x,
  z,
  facing: 0,
  grounded: true,
  ...over,
})

/** Walks in a straight line, a metre at a time. */
function walkLine(metres: number): TrailState {
  const trail = createTrail()
  stepTrail(trail, walker(0, 0), 1 / 60, flat)
  for (let i = 1; i <= metres; i++) stepTrail(trail, walker(0, -i), 1 / 60, flat)
  return trail
}

const live = (t: TrailState) => t.prints.filter((p) => p.used)

describe('leaving prints', () => {
  it('leaves nothing before anything has moved', () => {
    const trail = createTrail()
    stepTrail(trail, walker(0, 0), 1 / 60, flat)
    expect(live(trail)).toHaveLength(0)
  })

  it('leaves nothing while standing still', () => {
    const trail = createTrail()
    for (let i = 0; i < 300; i++) stepTrail(trail, walker(0, 0), 1 / 60, flat)
    expect(live(trail)).toHaveLength(0)
  })

  it('spaces prints by distance walked, not by time', () => {
    const trail = walkLine(10)
    expect(live(trail).length).toBe(Math.floor(10 / TRAIL.stride))
  })

  it('leaves the same number however slowly you walk', () => {
    // Spacing by distance is the whole reason a slow walk does not bunch up.
    const slow = createTrail()
    stepTrail(slow, walker(0, 0), 1 / 60, flat)
    for (let i = 1; i <= 100; i++) stepTrail(slow, walker(0, -i / 10), 1 / 60, flat)
    expect(live(slow).length).toBe(live(walkLine(10)).length)
  })

  it('alternates feet', () => {
    const sides = live(walkLine(10)).map((p) => p.side)
    expect(sides.length).toBeGreaterThan(2)
    for (let i = 1; i < sides.length; i++) expect(sides[i]).not.toBe(sides[i - 1])
  })

  it('puts the two feet either side of the line of travel', () => {
    const prints = live(walkLine(6))
    const lefts = prints.filter((p) => p.side === 1).map((p) => p.x)
    const rights = prints.filter((p) => p.side === -1).map((p) => p.x)
    expect(lefts.length).toBeGreaterThan(0)
    expect(rights.length).toBeGreaterThan(0)
    expect(Math.min(...lefts)).toBeGreaterThan(Math.max(...rights))
  })

  it('leaves nothing while airborne', () => {
    const trail = createTrail()
    stepTrail(trail, walker(0, 0, { grounded: false }), 1 / 60, flat)
    for (let i = 1; i <= 10; i++) stepTrail(trail, walker(0, -i, { grounded: false }), 1 / 60, flat)
    expect(live(trail)).toHaveLength(0)
  })

  it('sits each print on the ground it was left on', () => {
    const hilly = (x: number, z: number) => Math.sin(x * 0.3) * 3 + z * 0.05
    const trail = createTrail()
    stepTrail(trail, walker(0, 0), 1 / 60, hilly)
    for (let i = 1; i <= 12; i++) stepTrail(trail, walker(i, -i), 1 / 60, hilly)
    expect(live(trail).length).toBeGreaterThan(0)
    for (const p of live(trail)) expect(p.y).toBeCloseTo(hilly(p.x, p.z), 6)
  })
})

describe('fading and recycling', () => {
  it('fades from fresh to gone over its life', () => {
    const trail = walkLine(4)
    const print = live(trail)[0]
    expect(fadeOf(print)).toBeGreaterThan(0.9)
    print.age = TRAIL.life / 2
    expect(fadeOf(print)).toBeCloseTo(0.5, 2)
    print.age = TRAIL.life
    expect(fadeOf(print)).toBe(0)
  })

  it('frees a slot once a print has faded', () => {
    const trail = walkLine(4)
    expect(live(trail).length).toBeGreaterThan(0)
    // Aged out in slices, since a single enormous delta is clamped.
    for (let i = 0; i < TRAIL.life * 8; i++) stepTrail(trail, null, 0.25, flat)
    expect(live(trail)).toHaveLength(0)
  })

  it('never exceeds its capacity, however far you walk', () => {
    const trail = createTrail()
    stepTrail(trail, walker(0, 0), 1 / 60, flat)
    for (let i = 1; i <= TRAIL.capacity * 3; i++) stepTrail(trail, walker(0, -i * 2), 1 / 60, flat)
    expect(live(trail).length).toBeLessThanOrEqual(TRAIL.capacity)
    expect(trail.prints).toHaveLength(TRAIL.capacity)
  })

  it('picks up cleanly after the walker disappears', () => {
    // The player module can be switched off in the panel mid-walk, and coming
    // back must not read as one enormous stride across the island.
    const trail = walkLine(6)
    const before = live(trail).length
    stepTrail(trail, null, 1 / 60, flat)
    stepTrail(trail, walker(50, 50), 1 / 60, flat)
    expect(live(trail).length).toBe(before)
  })
})
