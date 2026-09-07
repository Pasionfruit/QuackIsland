import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { IDLE_INPUT, PLAYER, createPlayer, stepPlayer, type PlayerInput } from '../internal/controller'

type Ground = (x: number, z: number) => number

/** Flat ground at a known height, so movement can be checked without the island. */
const flat = (h: number): Ground => () => h
const press = (over: Partial<PlayerInput> = {}): PlayerInput => ({ ...IDLE_INPUT, ...over })

/** Wraps an angle difference into -PI..PI so comparisons do not trip over the seam. */
function shortest(a: number): number {
  let d = a % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

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

  it('sends D to the right of the screen, and A to the left', () => {
    // Checked against a real camera rather than a hand-derived right vector.
    // Deriving it by hand is how this came out inverted in the first place -
    // the algebra looked fine and was wrong at every angle.
    for (const cameraYaw of [0, 1.2, Math.PI, 5.0]) {
      const camera = new PerspectiveCamera()
      const fx = Math.sin(cameraYaw)
      const fz = Math.cos(cameraYaw)
      camera.position.set(-fx * 9, 3, -fz * 9)
      camera.lookAt(new Vector3(0, 0, 0))
      camera.updateMatrixWorld()
      const screenRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)

      const d = createPlayer(0, 0, flat(0))
      run(d, press({ right: true, cameraYaw }), 30)
      const dDir = new Vector3(d.x, 0, d.z).normalize()
      expect(dDir.dot(screenRight)).toBeGreaterThan(0.99)

      const a = createPlayer(0, 0, flat(0))
      run(a, press({ left: true, cameraYaw }), 30)
      const aDir = new Vector3(a.x, 0, a.z).normalize()
      expect(aDir.dot(screenRight)).toBeLessThan(-0.99)
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

  it('keeps facing the camera while stepping sideways', () => {
    // The whole point of the strafe model: A and D slide you left and right
    // without the body pivoting to face the way it is stepping.
    for (const cameraYaw of [0, 1.2, Math.PI]) {
      const p = createPlayer(0, 0, flat(0))
      run(p, press({ right: true, cameraYaw }), 90)
      expect(Math.abs(shortest(p.facing - cameraYaw))).toBeLessThan(0.05)
      const left = createPlayer(0, 0, flat(0))
      run(left, press({ left: true, cameraYaw }), 90)
      expect(Math.abs(shortest(left.facing - cameraYaw))).toBeLessThan(0.05)
    }
  })

  it('faces the camera when backing up, rather than turning around', () => {
    const p = createPlayer(0, 0, flat(0))
    run(p, press({ back: true, cameraYaw: 0 }), 90)
    expect(Math.abs(shortest(p.facing))).toBeLessThan(0.05)
  })

  it('does not spin on the spot while you look around standing still', () => {
    const p = createPlayer(0, 0, flat(0))
    const before = p.facing
    for (let i = 0; i < 120; i++) stepPlayer(p, press({ cameraYaw: i * 0.05 }), 1 / 60, flat(0))
    expect(p.facing).toBe(before)
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

describe('running', () => {
  it('covers more ground with run held', () => {
    const walking = createPlayer(0, 0, flat(0))
    run(walking, press({ forward: true }), 60)
    const running = createPlayer(0, 0, flat(0))
    run(running, press({ forward: true, run: true }), 60)
    expect(Math.hypot(running.x, running.z)).toBeGreaterThan(Math.hypot(walking.x, walking.z) * 1.4)
  })

  it('runs at the run speed and walks at the walk speed', () => {
    const p = createPlayer(0, 0, flat(0))
    stepPlayer(p, press({ forward: true, run: true }), 1 / 60, flat(0))
    expect(p.speed).toBe(PLAYER.runSpeed)
    stepPlayer(p, press({ forward: true }), 1 / 60, flat(0))
    expect(p.speed).toBe(PLAYER.walkSpeed)
  })

  it('reports no speed when standing still, run held or not', () => {
    const p = createPlayer(0, 0, flat(0))
    stepPlayer(p, press({ run: true }), 1 / 60, flat(0))
    expect(p.speed).toBe(0)
  })

  it('does not make diagonals faster than cardinals', () => {
    const straight = createPlayer(0, 0, flat(0))
    run(straight, press({ forward: true, run: true }), 60)
    const diagonal = createPlayer(0, 0, flat(0))
    run(diagonal, press({ forward: true, right: true, run: true }), 60)
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(Math.hypot(straight.x, straight.z), 3)
  })

  it('still cannot walk through the ground at run speed', () => {
    const bumpy = (x: number, z: number) => Math.sin(x * 0.3) * 4 + Math.cos(z * 0.21) * 3
    const p = createPlayer(0, 0, bumpy)
    for (let i = 0; i < 600; i++) {
      stepPlayer(p, press({ forward: true, run: true, cameraYaw: i * 0.01 }), 1 / 60, bumpy)
      expect(p.y).toBeGreaterThanOrEqual(bumpy(p.x, p.z) - 1e-6)
    }
  })
})
