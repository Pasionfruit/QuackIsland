import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { heightAt, slopeAt } from '../../01-terrain'
import {
  IDLE_INPUT,
  PLAYER,
  STUN,
  createPlayer,
  stepPlayer,
  stunFall,
  type PlayerInput,
} from '../internal/controller'

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

  it('turns to face the way it is stepping, not the camera', () => {
    // Movement stays camera-relative - D is still screen-right - but the body
    // follows it round. A body side-stepping while facing the camera walks
    // sideways with its beak pointing at you, which is why this changed.
    for (const cameraYaw of [0, 1.2, Math.PI]) {
      const right = createPlayer(0, 0, flat(0))
      run(right, press({ right: true, cameraYaw }), 90)
      expect(Math.abs(shortest(right.facing - Math.atan2(right.x, right.z)))).toBeLessThan(0.05)
      // Which is a quarter turn off the camera, not lined up with it.
      expect(Math.abs(shortest(right.facing - cameraYaw))).toBeGreaterThan(1.4)

      const left = createPlayer(0, 0, flat(0))
      run(left, press({ left: true, cameraYaw }), 90)
      expect(Math.abs(shortest(left.facing - Math.atan2(left.x, left.z)))).toBeLessThan(0.05)
      // And the two face opposite ways.
      expect(Math.abs(shortest(left.facing - right.facing))).toBeGreaterThan(3)
    }
  })

  it('turns around to back up, rather than moon-walking', () => {
    // The old strafe model reversed down the beach still facing away, which is
    // exactly the thing a body with a front cannot do.
    const p = createPlayer(0, 0, flat(0))
    run(p, press({ back: true, cameraYaw: 0 }), 90)
    expect(Math.abs(shortest(p.facing - Math.PI))).toBeLessThan(0.05)
    // And it really did travel backwards relative to the camera.
    expect(p.z).toBeLessThan(0)
  })

  it('turns smoothly rather than snapping to a new heading', () => {
    // Whipping round in a frame reads as a glitch. `turnRate` caps it.
    const p = createPlayer(0, 0, flat(0))
    run(p, press({ forward: true, cameraYaw: 0 }), 60)
    const before = p.facing
    stepPlayer(p, press({ back: true, cameraYaw: 0 }), 1 / 60, flat(0))
    expect(Math.abs(shortest(p.facing - before))).toBeLessThanOrEqual(PLAYER.turnRate / 60 + 1e-9)
  })

  it('still walks where the camera points, whichever way the body ends up', () => {
    // The turn is cosmetic: it must not feed back into the movement basis, or
    // holding forward would send the body spiralling.
    for (const cameraYaw of [0.4, 2.2, 4.9]) {
      const p = createPlayer(0, 0, flat(0))
      run(p, press({ forward: true, cameraYaw }), 120)
      const heading = Math.atan2(p.x, p.z)
      expect(Math.abs(shortest(heading - cameraYaw))).toBeLessThan(0.02)
    }
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
    for (let i = 0; i < 600; i++) stepPlayer(p, press({ forward: true, right: true }), 1 / 60, flat(0), { bounds })
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

describe('swimming', () => {
  /** A shelf: land at negative x, deep water at positive x. */
  const shelf = (x: number): number => (x < 0 ? 4 : -6)
  const sea = { seaLevel: 0 }

  it('walks on ground that is above water', () => {
    const p = createPlayer(0, 0, flat(3))
    stepPlayer(p, press(), 1 / 60, flat(3), sea)
    expect(p.swimming).toBe(false)
    expect(p.grounded).toBe(true)
  })

  it('still walks in water too shallow to swim in', () => {
    // Ankle deep is wading, not swimming.
    const shallow = flat(-PLAYER.swimDepth * 0.5)
    const p = createPlayer(0, 0, shallow)
    stepPlayer(p, press(), 1 / 60, shallow, sea)
    expect(p.swimming).toBe(false)
  })

  it('swims once the bed drops out of its depth', () => {
    const deep = flat(-8)
    const p = createPlayer(0, 0, deep)
    run(p, press(), 60, deep)
    expect(p.swimming).toBe(true)
    expect(p.grounded).toBe(false)
  })

  it('floats at the surface rather than sinking to the bed', () => {
    const deep = flat(-30)
    const p = createPlayer(0, 0, deep)
    for (let i = 0; i < 300; i++) stepPlayer(p, press(), 1 / 60, deep, sea)
    expect(p.y).toBeCloseTo(-PLAYER.floatDepth, 2)
    // Nowhere near the bottom, whatever the depth.
    expect(p.y).toBeGreaterThan(-2)
  })

  it('surfaces after walking off a shelf instead of dropping to the bed', () => {
    const ground = (x: number) => shelf(x)
    const p = createPlayer(-4, 0, ground)
    // Facing +X, walk off the edge.
    for (let i = 0; i < 240; i++) {
      stepPlayer(p, press({ right: true, cameraYaw: Math.PI }), 1 / 60, ground, { seaLevel: 0 })
    }
    expect(p.x).toBeGreaterThan(0)
    expect(p.swimming).toBe(true)
    expect(p.y).toBeCloseTo(-PLAYER.floatDepth, 1)
  })

  it('swims slower than it walks', () => {
    const deep = flat(-8)
    const p = createPlayer(0, 0, deep)
    run(p, press(), 30, deep)
    stepPlayer(p, press({ forward: true, run: true }), 1 / 60, deep, sea)
    // Run is ignored in the water.
    expect(p.speed).toBe(PLAYER.swimSpeed)
    expect(PLAYER.swimSpeed).toBeLessThan(PLAYER.walkSpeed)
  })

  it('cannot jump out of deep water', () => {
    const deep = flat(-8)
    const p = createPlayer(0, 0, deep)
    run(p, press(), 60, deep)
    const before = p.y
    stepPlayer(p, press({ jump: true }), 1 / 60, deep, sea)
    expect(p.y).toBeCloseTo(before, 2)
  })

  it('tips flat while swimming somewhere, and stands back up on land', () => {
    const deep = flat(-8)
    const p = createPlayer(0, 0, deep)
    expect(p.lean).toBe(0)
    for (let i = 0; i < 120; i++) stepPlayer(p, press({ forward: true }), 1 / 60, deep, sea)
    expect(p.lean).toBeCloseTo(1, 2)
    // Back onto dry land.
    for (let i = 0; i < 120; i++) stepPlayer(p, press({ forward: true }), 1 / 60, flat(5), sea)
    expect(p.lean).toBeCloseTo(0, 2)
    expect(p.swimming).toBe(false)
  })

  it('tips over gradually rather than snapping flat', () => {
    const deep = flat(-8)
    const p = createPlayer(0, 0, deep)
    stepPlayer(p, press({ forward: true }), 1 / 60, deep, sea)
    expect(p.lean).toBeGreaterThan(0)
    expect(p.lean).toBeLessThan(0.2)
  })

  it('stands upright when floating still, rather than lying face down', () => {
    // Treading water. Letting go of the keys in deep water should stand the
    // body up without leaving the sea - you only lie flat to go somewhere.
    const deep = flat(-8)
    const p = createPlayer(0, 0, deep)
    for (let i = 0; i < 120; i++) stepPlayer(p, press({ forward: true }), 1 / 60, deep, sea)
    expect(p.lean).toBeCloseTo(1, 2)
    for (let i = 0; i < 120; i++) stepPlayer(p, press(), 1 / 60, deep, sea)
    expect(p.lean).toBeCloseTo(0, 2)
    // Still in the water, still floating - just upright.
    expect(p.swimming).toBe(true)
    expect(p.y).toBeCloseTo(-PLAYER.floatDepth, 2)
  })

  it('turns to face the way it is swimming, not the camera', () => {
    // The same rule as on land, checked here too because swimming takes a
    // different branch through the step and could drift from it.
    const deep = flat(-8)
    for (const cameraYaw of [0, 1.1, Math.PI / 2, 3.3, 5.2]) {
      const p = createPlayer(0, 0, deep)
      for (let i = 0; i < 240; i++) {
        stepPlayer(p, press({ right: true, cameraYaw }), 1 / 60, deep, sea)
      }
      // Travelling along screen-right, so that is where the body should point.
      const heading = Math.atan2(p.x, p.z)
      expect(Math.abs(shortest(p.facing - heading))).toBeLessThan(0.05)
      // And that is not where the camera is looking.
      expect(Math.abs(shortest(p.facing - cameraYaw))).toBeGreaterThan(1)
    }
  })

  it('points the same way swimming and walking, so wading ashore does not spin it', () => {
    // Body and water used to disagree about what `facing` meant, so leaving the
    // sea swung the body round for no reason the player could see.
    const deep = flat(-8)
    const cameraYaw = 2.2
    const p = createPlayer(0, 0, deep)
    for (let i = 0; i < 240; i++) stepPlayer(p, press({ right: true, cameraYaw }), 1 / 60, deep, sea)
    const swimming = p.facing
    for (let i = 0; i < 240; i++) stepPlayer(p, press({ right: true, cameraYaw }), 1 / 60, flat(3), sea)
    expect(p.swimming).toBe(false)
    expect(Math.abs(shortest(p.facing - swimming))).toBeLessThan(0.05)
  })

  it('does not spin on the spot while treading water', () => {
    const deep = flat(-8)
    const p = createPlayer(0, 0, deep)
    for (let i = 0; i < 60; i++) stepPlayer(p, press(), 1 / 60, deep, sea)
    const facing = p.facing
    for (let i = 0; i < 120; i++) stepPlayer(p, press({ cameraYaw: 4.5 }), 1 / 60, deep, sea)
    expect(p.facing).toBe(facing)
  })

  it('rides the swell when given one, and floats flat without', () => {
    // The surface is handed in, so the player never imports the water module.
    const deep = flat(-20)
    const swell = { seaLevel: 0, surfaceAt: (x: number) => Math.sin(x * 0.1) * 0.8 }
    const p = createPlayer(7, 0, deep)
    for (let i = 0; i < 300; i++) stepPlayer(p, press(), 1 / 60, deep, swell)
    expect(p.y).toBeCloseTo(Math.sin(7 * 0.1) * 0.8 - PLAYER.floatDepth, 2)

    const flatSea = createPlayer(7, 0, deep)
    for (let i = 0; i < 300; i++) stepPlayer(flatSea, press(), 1 / 60, deep, sea)
    expect(flatSea.y).toBeCloseTo(-PLAYER.floatDepth, 2)
  })

  it('decides whether to swim from the bed, never from the swell', () => {
    // A surface that heaves must not make wading flicker into swimming.
    const shallow = flat(-PLAYER.swimDepth * 0.5)
    const heaving = { seaLevel: 0, surfaceAt: (x: number, z: number) => Math.sin(x + z) * 3 }
    const p = createPlayer(0, 0, shallow)
    for (let i = 0; i < 200; i++) {
      stepPlayer(p, press({ forward: true }), 1 / 60, shallow, heaving)
      expect(p.swimming).toBe(false)
    }
  })

  it('does not flicker between walking and swimming at the exact depth', () => {
    // Whether you are out of your depth is a question about the bed, not about
    // where the body happens to be that frame - otherwise it oscillates.
    const edge = flat(-PLAYER.swimDepth)
    const p = createPlayer(0, 0, edge)
    const seen = new Set<boolean>()
    for (let i = 0; i < 200; i++) {
      stepPlayer(p, press({ forward: true }), 1 / 60, edge, sea)
      seen.add(p.swimming)
    }
    expect(seen.size).toBe(1)
  })
})

describe('staying on the ground', () => {
  // A constant slope falling away towards +x at the given angle, starting high
  // enough that a long run down it never reaches the water - otherwise the
  // body starts swimming and this stops being a test about ground at all.
  const ramp = (degrees: number): Ground => (x) => 140 - x * Math.tan((degrees * Math.PI) / 180)

  it('keeps its feet down running downhill', () => {
    // The bug this fixes: walking downhill, the ground falls away faster than
    // gravity pulls you into it. On the island's steepest ground a run drops
    // the ground about 30 cm in a frame while gravity moves you 4 mm, so the
    // body spends the whole descent a few centimetres off the sand. It looks
    // fine - and it left no footprints, because it was never grounded.
    const slope = ramp(46)
    const p = createPlayer(0, 0, slope)
    let airborne = 0
    for (let i = 0; i < 240; i++) {
      // cameraYaw of PI/2 sends forward along +x, which is downhill here.
      stepPlayer(p, press({ forward: true, run: true, cameraYaw: Math.PI / 2 }), 1 / 60, slope)
      if (!p.grounded) airborne++
      expect(p.y).toBeCloseTo(slope(p.x, p.z), 6)
    }
    expect(airborne).toBe(0)
  })

  it('keeps its feet down on the real island, everywhere steep', () => {
    // The synthetic ramp is smooth; the island is not. This runs off every
    // steep spot on it in eight directions.
    const spots: Array<[number, number]> = []
    for (let x = -280; x <= 280; x += 14) {
      for (let z = -280; z <= 280; z += 14) {
        if (heightAt(x, z) > 1 && slopeAt(x, z) > 0.5) spots.push([x, z])
      }
    }
    expect(spots.length).toBeGreaterThan(10)

    let airborne = 0
    for (const [sx, sz] of spots) {
      for (let d = 0; d < 8; d++) {
        const p = createPlayer(sx, sz, heightAt)
        const cameraYaw = (d / 8) * Math.PI * 2
        for (let i = 0; i < 30; i++) {
          stepPlayer(p, press({ forward: true, run: true, cameraYaw }), 1 / 60, heightAt, { seaLevel: 0 })
          // Swimming is allowed to be off the ground; dry land is not.
          if (heightAt(p.x, p.z) > 0.2 && !p.swimming && !p.grounded) airborne++
        }
      }
    }
    expect(airborne).toBe(0)
  })

  it('still leaves the ground when it jumps', () => {
    // The reach-down must not swallow a jump, including a jump taken while
    // running downhill, where the ground is falling away underneath.
    const slope = ramp(46)
    const p = createPlayer(0, 0, slope)
    run(p, press({ forward: true, run: true, cameraYaw: Math.PI / 2 }), 30, slope)
    expect(p.grounded).toBe(true)

    stepPlayer(p, press({ forward: true, run: true, jump: true, cameraYaw: Math.PI / 2 }), 1 / 60, slope)
    expect(p.grounded).toBe(false)
    let highest = 0
    for (let i = 0; i < 40; i++) {
      stepPlayer(p, press({ forward: true, run: true, cameraYaw: Math.PI / 2 }), 1 / 60, slope)
      highest = Math.max(highest, p.y - slope(p.x, p.z))
    }
    // A real hop clear of the ground, not a stifled one.
    expect(highest).toBeGreaterThan(1)
  })

  it('does not reach down a cliff it has walked off', () => {
    // The reach is short on purpose: stepping off a ledge should be a fall,
    // not a lift down.
    const cliff: Ground = (x) => (x < 5 ? 10 : 0)
    const p = createPlayer(0, 0, cliff)
    for (let i = 0; i < 40; i++) {
      stepPlayer(p, press({ forward: true, cameraYaw: Math.PI / 2 }), 1 / 60, cliff)
    }
    expect(p.x).toBeGreaterThan(5)
    // It fell rather than being placed at the bottom.
    expect(p.grounded).toBe(false)
    expect(p.y).toBeGreaterThan(0)
    expect(p.vy).toBeLessThan(0)
  })

  it('does not hover over a dip narrower than its reach', () => {
    // Landing on the far side is correct; skating over the hole is not. The
    // snap only ever puts the feet on the ground under them.
    const dip: Ground = (x) => (x > 2 && x < 2.3 ? -0.3 : 0)
    const p = createPlayer(0, 0, dip)
    for (let i = 0; i < 60; i++) {
      stepPlayer(p, press({ forward: true, cameraYaw: Math.PI / 2 }), 1 / 60, dip)
      expect(p.y).toBeCloseTo(dip(p.x, p.z), 6)
    }
  })
})

/**
 * Being knocked over.
 *
 * Temporary in the world - there is no rig yet - but the arithmetic is the
 * real thing, and it is what a minigame that pushes people about will lean on.
 */
describe('being stunned', () => {
  it('starts on its feet', () => {
    const p = createPlayer(0, 0, flat(0))
    expect(p.stun).toBe(0)
    expect(p.stunFor).toBe(0)
    expect(stunFall(p.stun, p.stunFor)).toBe(0)
  })

  it('goes nowhere while it is down, however hard you press', () => {
    const p = createPlayer(0, 0, flat(0))
    p.stun = 1
    p.stunFor = 1
    run(p, press({ forward: true, run: true, cameraYaw: 0 }), 30)
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.z).toBeCloseTo(0, 9)
    expect(p.speed).toBe(0)
  })

  it('cannot jump out of it either', () => {
    const p = createPlayer(0, 0, flat(0))
    p.stun = 1
    p.stunFor = 1
    stepPlayer(p, press({ jump: true }), 1 / 60, flat(0))
    expect(p.grounded).toBe(true)
    expect(p.y).toBeCloseTo(0, 9)
  })

  it('still falls, because gravity is not an instruction', () => {
    const p = createPlayer(0, 0, flat(0))
    p.y = 8
    p.grounded = false
    p.stun = 1
    p.stunFor = 1
    run(p, press(), 6)
    expect(p.y).toBeLessThan(8)
    expect(p.vy).toBeLessThan(0)
  })

  it('runs the clock down and gets back up on its own', () => {
    const p = createPlayer(0, 0, flat(0))
    p.stun = 0.5
    p.stunFor = 0.5
    run(p, press(), 30)
    expect(p.stun).toBe(0)
    expect(p.stunFor).toBe(0)

    // And takes instructions again the moment it is up.
    run(p, press({ forward: true, cameraYaw: 0 }), 10)
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(0)
  })

  it('never runs the clock past zero', () => {
    const p = createPlayer(0, 0, flat(0))
    p.stun = 1 / 120
    p.stunFor = 1 / 120
    run(p, press(), 5)
    expect(p.stun).toBe(0)
  })
})

describe('the falling animation', () => {
  it('is flat on the floor in the middle of a long stun', () => {
    expect(stunFall(1, 2)).toBe(1)
  })

  it('goes over and gets up, in that order', () => {
    const total = 2
    const down = stunFall(total - 0.05, total)
    const flatOut = stunFall(total / 2, total)
    const up = stunFall(0.05, total)

    expect(down).toBeGreaterThan(0)
    expect(down).toBeLessThan(1)
    expect(flatOut).toBe(1)
    expect(up).toBeGreaterThan(0)
    expect(up).toBeLessThan(1)
  })

  it('takes longer to get up than to go down', () => {
    expect(STUN.riseTime).toBeGreaterThan(STUN.fallTime)
  })

  it('starts and ends on its feet, whatever the stun was for', () => {
    for (const total of [0.15, 0.5, 1, 3]) {
      expect(stunFall(total, total)).toBeCloseTo(0, 6)
      expect(stunFall(0, total)).toBe(0)
    }
  })

  it('never leaves the body stuck part way over at the end of a short stun', () => {
    // A stun shorter than a fall plus a rise still has to come all the way
    // back up, or the body snaps upright from halfway.
    const total = 0.1
    expect(stunFall(0.0001, total)).toBeLessThan(0.1)
  })

  it('stays between flat and upright, always', () => {
    for (const total of [0.1, 0.4, 1, 5]) {
      for (let i = 0; i <= 40; i++) {
        const fall = stunFall((total * i) / 40, total)
        expect(fall).toBeGreaterThanOrEqual(0)
        expect(fall).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is nothing at all for a stun that never happened', () => {
    expect(stunFall(0, 0)).toBe(0)
    expect(stunFall(-1, 2)).toBe(0)
    expect(stunFall(1, 0)).toBe(0)
  })
})
