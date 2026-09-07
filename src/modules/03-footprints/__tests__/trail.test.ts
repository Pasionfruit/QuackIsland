import { CircleGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { TRAIL, createTrail, fadeOf, stepTrail, strideFor, type TrailState, type Walker } from '../internal/trail'

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
    // walkLine travels along -Z, a heading of PI, so the walker's right is +X.
    const rightFoot = prints.filter((p) => p.side === 1).map((p) => p.x)
    const leftFoot = prints.filter((p) => p.side === -1).map((p) => p.x)
    expect(rightFoot.length).toBeGreaterThan(0)
    expect(leftFoot.length).toBeGreaterThan(0)
    expect(Math.min(...rightFoot)).toBeGreaterThan(Math.max(...leftFoot))
    // And they straddle the line rather than both landing on one side.
    expect(Math.min(...rightFoot)).toBeGreaterThan(0)
    expect(Math.max(...leftFoot)).toBeLessThan(0)
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

describe('running', () => {
  it('lengthens the stride rather than shuffling faster', () => {
    expect(strideFor(TRAIL.strideSpeed)).toBe(TRAIL.stride)
    expect(strideFor(TRAIL.strideSpeed * 1.8)).toBeGreaterThan(TRAIL.stride)
  })

  it('caps how long a stride can get', () => {
    expect(strideFor(1000)).toBeCloseTo(TRAIL.stride * TRAIL.strideMax, 6)
  })

  it('treats a missing or slow speed as a walk', () => {
    expect(strideFor(undefined)).toBe(TRAIL.stride)
    expect(strideFor(0)).toBe(TRAIL.stride)
    expect(strideFor(TRAIL.strideSpeed / 2)).toBe(TRAIL.stride)
  })

  it('leaves fewer prints over the same ground when running', () => {
    const walk = createTrail()
    stepTrail(walk, walker(0, 0, { speed: TRAIL.strideSpeed }), 1 / 60, flat)
    for (let i = 1; i <= 20; i++) {
      stepTrail(walk, walker(0, -i, { speed: TRAIL.strideSpeed }), 1 / 60, flat)
    }
    const sprint = createTrail()
    const fast = TRAIL.strideSpeed * 1.8
    stepTrail(sprint, walker(0, 0, { speed: fast }), 1 / 60, flat)
    for (let i = 1; i <= 20; i++) stepTrail(sprint, walker(0, -i, { speed: fast }), 1 / 60, flat)
    expect(live(sprint).length).toBeLessThan(live(walk).length)
  })
})

describe('the disc a print is drawn on', () => {
  it('lies flat once rotated, rather than standing on its edge', () => {
    // CircleGeometry is built in the XY plane, so its normal is +Z. Everything
    // here reasons in +Y-up terms, and aligning the disc's "up" to the ground
    // normal without this rotation left every print standing vertically.
    const g = new CircleGeometry(1, 14)
    g.rotateX(-Math.PI / 2)
    const pos = g.getAttribute('position')
    let spanX = 0
    let spanY = 0
    let spanZ = 0
    for (let i = 0; i < pos.count; i++) {
      spanX = Math.max(spanX, Math.abs(pos.getX(i)))
      spanY = Math.max(spanY, Math.abs(pos.getY(i)))
      spanZ = Math.max(spanZ, Math.abs(pos.getZ(i)))
    }
    // A fourteen-sided polygon, so its corners do not quite reach radius one
    // on every axis - roughly unit is the honest assertion here.
    expect(spanX).toBeGreaterThan(0.95)
    expect(spanZ).toBeGreaterThan(0.95)
    // Flat is the part that matters: no extent at all in the up axis.
    expect(spanY).toBeCloseTo(0, 6)
    g.dispose()
  })
})

describe('which way a print points', () => {
  it('lies along the way the foot went, not the way the body faces', () => {
    // The body strafes, so it can face north while stepping east. A print
    // pointing north there would look like the feet were sliding sideways.
    const trail = createTrail()
    // Facing +Z throughout, but walking along +X.
    stepTrail(trail, walker(0, 0, { facing: 0 }), 1 / 60, flat)
    for (let i = 1; i <= 10; i++) stepTrail(trail, walker(i, 0, { facing: 0 }), 1 / 60, flat)
    const prints = live(trail)
    expect(prints.length).toBeGreaterThan(0)
    // Travelling along +X is a heading of a quarter turn.
    for (const p of prints) expect(p.facing).toBeCloseTo(Math.PI / 2, 3)
  })

  it('follows the travel round a turn', () => {
    const trail = createTrail()
    stepTrail(trail, walker(0, 0, { facing: 0 }), 1 / 60, flat)
    for (let i = 1; i <= 30; i++) {
      const a = (i / 30) * (Math.PI / 2)
      stepTrail(trail, walker(Math.sin(a) * 8, Math.cos(a) * 8 - 8, { facing: 0 }), 1 / 60, flat)
    }
    const headings = live(trail).map((p) => p.facing)
    expect(headings.length).toBeGreaterThan(1)
    // The prints turn through the corner rather than all pointing one way.
    expect(Math.max(...headings) - Math.min(...headings)).toBeGreaterThan(0.3)
  })

  it('falls back to the body when the walker has barely moved', () => {
    // Below a hair of movement the direction is numerical noise.
    const trail = createTrail()
    stepTrail(trail, walker(0, 0, { facing: 1.2 }), 1 / 60, flat)
    for (let i = 1; i <= 40; i++) stepTrail(trail, walker(0, -i / 2, { facing: 1.2 }), 1 / 60, flat)
    // Moving along -Z is a heading of PI, not the body's 1.2.
    for (const p of live(trail)) expect(Math.abs(p.facing)).toBeCloseTo(Math.PI, 3)
  })
})
