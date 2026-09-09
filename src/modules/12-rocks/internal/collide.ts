/**
 * Bumping into rocks, and standing on them.
 *
 * Two halves, and only one of them is hard.
 *
 * **Standing on a rock is just a height function.** If the ground under you
 * reports the top of the rock when you are over one, everything the player
 * already does - falling, landing, the ground snap, footprints - works on a
 * boulder without knowing a boulder exists.
 *
 * **Bumping into one is the hard half**, and it exists precisely *because* of
 * the easy half: a ground function that returns the top of a three-metre
 * boulder will teleport you up it the moment you touch its edge, because the
 * controller snaps up to the ground whenever it finds itself below it. So
 * anything tall enough to be worth climbing has to be solid enough to stop you
 * walking through it.
 *
 * All pure, and all of it testable, which matters: the failure modes here are
 * standing inside a rock, standing in the air above one, and being unable to
 * get off one.
 */
import type { Rock } from './rocks'

export const COLLISION = {
  /**
   * How far up you will step without jumping, in metres.
   *
   * Below this a rock is a kerb: you walk over it and the ground snap lifts
   * you. Above it the rock is solid and you go round or over. Without this
   * every pebble on the island would stop you dead.
   */
  stepUp: 0.55,
  /**
   * How far above a rock's top your feet must be to pass over it.
   *
   * A little slack, so landing on a rock does not alternate between "on top"
   * and "pushed out" from one frame to the next.
   */
  clearance: 0.05,
  /** How many times to push out per step, for somebody wedged between two. */
  passes: 3,
} as const

/**
 * The half-extents of a rock in world axes.
 *
 * A rock is a unit sphere scaled to `(a, b, c)` and then tumbled, which makes
 * it an ellipsoid at an angle. The half-width of that along a world axis is
 * exactly `sqrt((m0*a)^2 + (m1*b)^2 + (m2*c)^2)` for that row of the rotation -
 * no sampling, no approximation.
 *
 * This is why it is worth computing rather than guessing: the placement used
 * `scaleY` as the half-height, which is only correct for a rock that has not
 * been turned. Every other rock was floating or buried by the difference.
 */
export function halfExtents(rock: Rock): { x: number; y: number; z: number } {
  const m = rotationXYZ(rock.turnX, rock.turnY, rock.turnZ)
  const a = rock.scaleX
  const b = rock.scaleY
  const c = rock.scaleZ
  return {
    x: Math.hypot(m[0] * a, m[1] * b, m[2] * c),
    y: Math.hypot(m[3] * a, m[4] * b, m[5] * c),
    z: Math.hypot(m[6] * a, m[7] * b, m[8] * c),
  }
}

/**
 * A rotation matrix from Euler angles in XYZ order, row-major.
 *
 * The same order and convention three.js uses for `Object3D.rotation`, which
 * is what actually draws the rock - a test checks the two agree, because a
 * collision shape at a different angle from the thing you can see is the worst
 * kind of wrong.
 */
export function rotationXYZ(x: number, y: number, z: number): number[] {
  const a = Math.cos(x)
  const b = Math.sin(x)
  const c = Math.cos(y)
  const d = Math.sin(y)
  const e = Math.cos(z)
  const f = Math.sin(z)

  const ae = a * e
  const af = a * f
  const be = b * e
  const bf = b * f

  return [
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c,
  ]
}

/** How high the top of a rock is. */
export function topOf(rock: Rock): number {
  return rock.y + halfExtents(rock).y * 2
}

/**
 * How wide a rock is, for walking into.
 *
 * The mean of the two horizontal half-extents rather than the larger: a rock
 * is an ellipse seen from above and this treats it as a circle, so taking the
 * larger would put an invisible wall round its narrow side.
 */
export function girthOf(rock: Rock): number {
  const half = halfExtents(rock)
  return (half.x + half.z) / 2
}

/** A rock with its collision shape already worked out. Built once. */
export interface SolidRock {
  x: number
  z: number
  /** Bottom of the rock. */
  base: number
  top: number
  girth: number
}

/**
 * Precomputes the collision shape of every rock.
 *
 * Once, at startup. `halfExtents` is six trigonometric calls and a few square
 * roots, and doing that for four hundred rocks inside the movement step would
 * be the most expensive thing in the frame by a wide margin.
 */
export function solidify(rocks: readonly Rock[]): SolidRock[] {
  return rocks.map((rock) => {
    const half = halfExtents(rock)
    return {
      x: rock.x,
      z: rock.z,
      base: rock.y,
      top: rock.y + half.y * 2,
      girth: (half.x + half.z) / 2,
    }
  })
}

/**
 * The ground, including the tops of any rocks you are standing over.
 *
 * Only the top: a rock you are *beside* is not ground, and a rock whose top is
 * below the ground is buried and does not count.
 */
export function standHeightAt(
  x: number,
  z: number,
  rocks: readonly SolidRock[],
  below: number,
): number {
  let height = below
  for (const rock of rocks) {
    if (rock.top <= height) continue
    const dx = x - rock.x
    const dz = z - rock.z
    if (dx * dx + dz * dz > rock.girth * rock.girth) continue
    height = rock.top
  }
  return height
}

/**
 * Whether what you are standing on is a rock rather than the island.
 *
 * One line, because it is exactly the question `standHeightAt` already answers,
 * asked the other way round - and asking it that way, rather than comparing two
 * separately computed heights, means the two can never disagree about which
 * rocks count.
 *
 * It needs the ground as well as the rocks, because a rock sunk below the
 * ground is buried, and standing over a buried rock is standing on the island.
 */
export function onRockAt(
  x: number,
  z: number,
  rocks: readonly SolidRock[],
  ground: number,
): boolean {
  return standHeightAt(x, z, rocks, ground) > ground
}

/**
 * Pushes a body out of any rock it is inside.
 *
 * Pushes rather than stops: sliding along a boulder is what a body does, and
 * stopping dead against one is the thing that makes a world feel like a set of
 * boxes. The push is along the line from the rock's middle, so walking into
 * one at an angle slides you round it.
 *
 * A rock is only solid if its top is more than a step above your feet.
 * Anything lower is a kerb you walk over, and anything below your feet is
 * something you are standing on or have jumped over.
 */
export function resolveRocks(
  x: number,
  z: number,
  feetY: number,
  bodyRadius: number,
  rocks: readonly SolidRock[],
): { x: number; z: number } {
  let outX = x
  let outZ = z

  for (let pass = 0; pass < COLLISION.passes; pass++) {
    let moved = false

    for (const rock of rocks) {
      // Over the top of it, or low enough to step onto.
      if (rock.top <= feetY + COLLISION.clearance) continue
      if (rock.top <= feetY + COLLISION.stepUp) continue
      // Buried, or you are under it somehow.
      if (rock.base > feetY + COLLISION.stepUp) continue

      const reach = rock.girth + bodyRadius
      const dx = outX - rock.x
      const dz = outZ - rock.z
      const distance = Math.hypot(dx, dz)
      if (distance >= reach) continue

      if (distance < 1e-6) {
        // Dead centre, so there is no direction to be pushed. Any one will do
        // and this at least never returns a NaN.
        outX = rock.x + reach
        moved = true
        continue
      }

      outX = rock.x + (dx / distance) * reach
      outZ = rock.z + (dz / distance) * reach
      moved = true
    }

    if (!moved) break
  }

  return { x: outX, z: outZ }
}
