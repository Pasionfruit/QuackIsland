import { describe, expect, it } from 'vitest'
import { IDLE_INPUT, PLAYER, createPlayer, stepPlayer, type PlayerInput } from '../internal/controller'

type Ground = (x: number, z: number) => number

/** Flat ground at a known height, so movement can be checked without the island. */
const flat = (h: number): Ground => () => h
const press = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...IDLE_INPUT, ...over })

/** Runs n frames at a steady 60fps. */
function run(state: ReturnType<typeof createPlayer>, input: PlayerInput, frames: number, ground: Ground = flat(0)) {
  for (let i = 0; i < frames; i++) stepPlayer(state, input, 1 / 60, ground)
  return state
}

describe('walking', () => {
  it('starts standing on the ground', () => {
    const p = createPlayer(0, 0, flat(12))
    expect(p.y).toBe(12)
    expect(p.grounded).toBe(true)
  })

  it('walks where the camera is looking, at every angle', () => {
    // The bug this replaces: the basis was built by rotating a vector with a
    // sign error, so forward matched the camera at one angle and was inverted
    // at another - which felt like the controls breaking whenever you looked
    // around while walking.
    for (const cameraYaw of [0, 0.7, Math.PI / 2, 2.4, Math.PI, 4.1, 5.9]) {
      const p = createPlayer(0, 0, flat(0))
      run(p, press({ forward: true, cameraYaw }), 30)
      const travelled = Math.hypot(p.x, p.z)
      expect(travelled).toBeGreaterThan(1)
      // Forward is (sin, cos) of the look angle, which is away from the camera.
      expect(p.x / travelled).toBeCloseTo(Math.sin(cameraYaw), 3)
      expect(p.z / travelled).toBeCloseTo(Math.cos(cameraYaw), 3)
    }
  })

  it('walks backwards straight back toward the camera', () => {
    for (const cameraYaw of [0, 1.2, Math.PI]) {
      const p = createPlayer(0, 0, flat(0))
      run(p, press({ back: true, cameraYaw }), 30)
      const travelled = Math.hypot(p.x, p.z)
      expect(p.x / travelled).toBeCloseTo(-Math.sin(cameraYaw), 3)
      expect(p.z / travelled).toBeCloseTo(-Math.cos(cameraYaw), 3)
    }
  })

  it('strafes square to the way it is looking', () => {
    for (const cameraYaw of [0, 1.2, Math.PI, 5.0]) {
      const p = createPlayer(0, 0, flat(0))
      run(p, press({ right: true, cameraYaw }), 30)
      const travelled = Math.hypot(p.x, p.z)
      // Right is forward turned a quarter: (cos, -sin).
      expect(p.x / travelled).toBeCloseTo(Math.cos(cameraYaw), 3)
      expect(p.z / travelled).toBeCloseTo(-Math.sin(cameraYaw), 3)
    }
  })

  it('keeps moving in a straight line while the camera turns under it', () => {
    // Looking around mid-stride should steer, not stutter or reverse.
    const p = createPlayer(0, 0, flat(0))
    let last = 0
    for (let i = 0; i < 120; i++) {
      stepPlayer(p, press({ forward: true, cameraYaw: i * 0.02 }), 1 / 60, flat(0))
      const travelled = Math.hypot(p.x, p.z)
      // Distance from the start never goes backwards on a smooth turn.
      expect(travelled).toBeGreaterThanOrEqual(last - 1e-6)
      last = travelled
    }
  })

  it('does not let diagonals outrun the cardinals', () => {
    // The classic bug: pressing two keys gives you a free 41% of speed.
    const straight = createPlayer(0, 0, flat(0))
    run(straight, press({ forward: true }), 60)
    const diagonal = createPlayer(0, 0, flat(0))
    run(diagonal, press({ forward: true, right: true }), 60)
    const a = Math.hypot(straight.x, straight.z)
    const b = Math.hypot(diagonal.x, diagonal.z)
    expect(b).toBeCloseTo(a, 3)
  })

  it('turns to face the way it is going', () => {
    const p = createPlayer(0, 0, flat(0))
    run(p, press({ right: true, cameraYaw: 0 }), 60)
    // Strafing right at yaw 0 walks toward +X, so the body should face +X.
    expect(Math.abs(p.facing - Math.PI / 2)).toBeLessThan(0.05)
  })

  it('stays inside the world when bounds are given', () => {
    const p = createPlayer(0, 0, flat(0))
    const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }
    for (let i = 0; i < 600; i++) stepPlayer(p, press({ forward: true, right: true }), 1 / 60, flat(0), bounds)
    expect(p.x).toBeLessThanOrEqual(5)
    expect(p.z).toBeGreaterThanOrEqual(-5)
  })
})

describe('jumping', () => {
  it('leaves the ground and comes back down', () => {
    const p = createPlayer(0, 0, flat(0))
    stepPlayer(p, press({ jump: true }), 1 / 60, flat(0))
    expect(p.grounded).toBe(false)
    expect(p.y).toBeGreaterThan(0)
    run(p, press(), 120)
    expect(p.grounded).toBe(true)
    expect(p.y).toBeCloseTo(0, 5)
  })

  it('cannot jump again in mid-air', () => {
    const p = createPlayer(0, 0, flat(0))
    stepPlayer(p, press({ jump: true }), 1 / 60, flat(0))
    const first = p.vy
    stepPlayer(p, press({ jump: true }), 1 / 60, flat(0))
    // Still falling under gravity, not re-launched.
    expect(p.vy).toBeLessThan(first)
  })

  it('reaches a sensible height', () => {
    const p = createPlayer(0, 0, flat(0))
    stepPlayer(p, press({ jump: true }), 1 / 60, flat(0))
    let peak = 0
    for (let i = 0; i < 200; i++) {
      stepPlayer(p, press(), 1 / 60, flat(0))
      peak = Math.max(peak, p.y)
    }
    expect(peak).toBeGreaterThan(1.5)
    expect(peak).toBeLessThan(4)
  })

  it('can jump again once it has landed', () => {
    const p = createPlayer(0, 0, flat(0))
    stepPlayer(p, press({ jump: true }), 1 / 60, flat(0))
    run(p, press(), 200)
    expect(p.grounded).toBe(true)
    stepPlayer(p, press({ jump: true }), 1 / 60, flat(0))
    expect(p.vy).toBeGreaterThan(0)
  })
})

describe('the ground', () => {
  it('never ends a frame underground, however rough the terrain', () => {
    // Ground snapping is also what carries the player up and down slopes, so
    // this is the slope test as well.
    const bumpy = (x: number, z: number) => Math.sin(x * 0.3) * 4 + Math.cos(z * 0.21) * 3
    const p = createPlayer(0, 0, bumpy)
    for (let i = 0; i < 900; i++) {
      stepPlayer(p, press({ forward: true, right: i % 3 === 0 }), 1 / 60, bumpy)
      expect(p.y).toBeGreaterThanOrEqual(bumpy(p.x, p.z) - 1e-6)
    }
  })

  it('follows the ground downhill without leaving it', () => {
    const slope = (x: number) => -x * 0.2
    const ground: Ground = (x) => slope(x)
    const p = createPlayer(0, 0, ground)
    run(p, press({ right: true }), 120, ground)
    expect(p.grounded).toBe(true)
    expect(p.y).toBeCloseTo(slope(p.x), 4)
  })

  it('survives a huge delta without teleporting through the island', () => {
    // A backgrounded tab comes back with an enormous frame time.
    const p = createPlayer(0, 0, flat(0))
    stepPlayer(p, press({ forward: true }), 30, flat(0))
    expect(Math.abs(p.z)).toBeLessThan(PLAYER.walkSpeed * 0.2)
  })

  it('ignores a negative or zero delta', () => {
    const p = createPlayer(0, 0, flat(0))
    const before = { ...p }
    stepPlayer(p, press({ forward: true }), -1, flat(0))
    expect(p.z).toBeCloseTo(before.z, 6)
  })
})
