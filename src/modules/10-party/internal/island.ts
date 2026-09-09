/**
 * The party island: a big volcano with a horseshoe crater, standing in the sea
 * a kilometre from home.
 *
 * Two things here are angular rather than radial, and they are the reason this
 * file is more than a piecewise function of distance:
 *
 * - **The outline is not a circle.** A radius warp by angle, applied before
 *   anything else looks at the distance, so the beach, the plateau and the
 *   cone are all pulled out of round by the same amount and stay concentric.
 * - **The crater is a horseshoe.** A wedge cut out of one side, deep at the
 *   summit and fading out down the flank, which is what a collapsed crater
 *   wall looks like from above.
 *
 * Everything is in island-local coordinates - distance and angle from its
 * middle - until the last step, so the maths can be checked without knowing
 * where in the world the island happens to be.
 */

export const ISLAND = {
  /**
   * Where the middle of it sits in the world.
   *
   * Two things pin this down. Its own foot reaches 380 m and the mainland's
   * coast about 200, so nearer than ~580 the two run into each other; the sea
   * reaches 1500 m, so further than 1120 it stands in open nothing.
   */
  centreX: 900,
  centreZ: 0,

  /**
   * The top of the volcano.
   *
   * A hundred and fifty metres, which is five times the tallest dune on the
   * mainland and taller than the island is from its beach to its plateau. It
   * is meant to be the thing you steer by from anywhere in the world.
   */
  summit: 150,
  /** The flat crater floor, before the horseshoe takes a bite out of it. */
  crater: 22,
  /**
   * The foot of the cone.
   *
   * Two hundred metres out of a 290 m island, so the volcano *is* the island -
   * there is a ring of plateau round its foot and then the beach, and nothing
   * else. That is what lets the track start at the island's edge and be
   * climbing from its first tile.
   */
  volcano: 200,

  /** The flat ring round the volcano's foot. */
  plateau: 9,
  /** How far that flat reaches before the beach starts. */
  plateauOuter: 235,
  /** Where the sand meets the water. */
  shore: 290,
  /** Where it has finished sinking to the sea bed. */
  foot: 380,
  /** How deep the sea bed is around it. Matches the mainland's. */
  seaBed: -22,
} as const

/**
 * How far out of round the island is, by angle.
 *
 * Three waves that do not share a factor, so the outline never repeats itself
 * round the island. The amplitudes are deliberately unequal: one big lobe
 * gives it a long side and a short side, and the smaller two break up the
 * curve so no stretch of coast is a plain arc.
 *
 * `mostest` is the largest the warp can ever be, and it matters - it is what
 * everything asking "am I on the island" has to allow for.
 */
export const OUTLINE = {
  waves: [
    { cycles: 2, amplitude: 0.132, phase: 0.7 },
    { cycles: 3, amplitude: 0.079, phase: -1.9 },
    { cycles: 5, amplitude: 0.046, phase: 2.4 },
  ],
  get mostest(): number {
    return OUTLINE.waves.reduce((sum, w) => sum + w.amplitude, 0)
  },
} as const

/**
 * The horseshoe: a wedge cut out of the crater and down one flank.
 *
 * Deep at the top and gone by the time it reaches the foot, so from above the
 * summit reads as a horseshoe and from the side as a breached wall with a
 * valley running out of it.
 */
export const BREACH = {
  /** Which way the horseshoe opens, in radians. */
  angle: -Math.PI * 0.35,
  /** Half the wedge, in radians. Beyond this the rim is untouched. */
  halfWidth: 0.52,
  /** How far below the rim the notch cuts, in metres. */
  depth: 44,
  /**
   * How far down the cone the valley runs, in crater radii.
   *
   * Kept short on purpose, and the reason is the road. The track wraps the
   * cone three times, so it crosses the breach once per lap whatever else is
   * true - and a valley that ran a third of the way down the mountain turned
   * two of those crossings into nineteen-metre plunges between one tile and
   * the next, which is a cliff rather than a road.
   *
   * Confined to the crater and just outside it, the two lower crossings miss
   * it entirely and the last one dips a few metres, which is a road going
   * through a gap in a wall - which is what the gap is for.
   */
  reach: 2.4,
} as const

/** Distance from the middle of the party island, in metres. Plain, unwarped. */
export function distanceFromIsland(x: number, z: number): number {
  return Math.hypot(x - ISLAND.centreX, z - ISLAND.centreZ)
}

/** The angle round the island, in radians. */
export function angleFromIsland(x: number, z: number): number {
  return Math.atan2(z - ISLAND.centreZ, x - ISLAND.centreX)
}

/**
 * How much wider the island is in this direction than a circle would be.
 *
 * Always positive and always near 1: the waves sum to well under 1, so this
 * can never fold the island inside out however the amplitudes are retuned.
 */
export function outlineAt(angle: number): number {
  let scale = 1
  for (const wave of OUTLINE.waves) {
    scale += wave.amplitude * Math.sin(angle * wave.cycles + wave.phase)
  }
  return scale
}

/**
 * The island-local radius of a world point: how far out it is, measured
 * against the island's own out-of-round outline rather than against a circle.
 *
 * This is the one conversion everything else is built on. Dividing by the
 * warp *before* the height is worked out is what keeps the beach, the plateau
 * and the cone concentric - warping them separately would have them drift
 * apart and cross.
 */
export function localRadius(x: number, z: number): number {
  return distanceFromIsland(x, z) / outlineAt(angleFromIsland(x, z))
}

/** Whether a point is anywhere on or around the party island. */
export function onPartyIsland(x: number, z: number): boolean {
  return localRadius(x, z) <= ISLAND.foot
}

/**
 * The furthest the island reaches in any direction, in metres.
 *
 * What anything sizing the world around it has to clear - the sea, and where
 * the island is allowed to sit.
 */
export function islandReach(): number {
  return ISLAND.foot * (1 + OUTLINE.mostest)
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** The shortest way round from one angle to another, in radians. */
function angleGap(a: number, b: number): number {
  const TAU = Math.PI * 2
  let d = Math.abs(((a - b) % TAU) + TAU) % TAU
  if (d > Math.PI) d = TAU - d
  return d
}

/**
 * The volcano in profile, before the horseshoe is cut out of it.
 *
 * Four parts: a flat crater floor, a cone down to the foot, a plateau, and a
 * beach into the sea. Still the honest radial shape of the island, which is
 * why the board and the tests both reach for it.
 */
export function partyHeightLocal(d: number): number {
  if (d <= ISLAND.crater) return ISLAND.summit

  if (d <= ISLAND.volcano) {
    // The cone: steep at the crater and easing out into the plateau.
    //
    // Deliberately *not* eased at both ends. A smoothstep here flattens the
    // top as well as the bottom, and what that gives you is a dome with a dent
    // in it rather than a volcano - the first fifty metres out from the rim
    // fell barely five, so there was no rim to breach and no cone to wrap.
    //
    // `1 - (1 - t)^2` is steepest exactly where a volcano should be: 58 degrees
    // at the crater's edge, easing to flat as it meets the plateau. The crease
    // it leaves at the rim is not a flaw, it is the rim.
    const t = (d - ISLAND.crater) / (ISLAND.volcano - ISLAND.crater)
    const fall = 1 - (1 - t) * (1 - t)
    return ISLAND.summit - (ISLAND.summit - ISLAND.plateau) * fall
  }

  if (d <= ISLAND.plateauOuter) return ISLAND.plateau

  if (d <= ISLAND.shore) {
    return ISLAND.plateau * (1 - smoothstep(ISLAND.plateauOuter, ISLAND.shore, d))
  }

  return ISLAND.seaBed * smoothstep(ISLAND.shore, ISLAND.foot, d)
}

/**
 * How deep the horseshoe cuts at a given local radius and angle.
 *
 * Zero everywhere outside the wedge, so most of the mountain never pays for
 * this. Both falloffs are smoothstepped: a hard edge would leave a wall down
 * the side of the valley that reads as a saw cut rather than a collapse.
 */
export function breachDepthAt(d: number, angle: number): number {
  const across = angleGap(angle, BREACH.angle)
  if (across >= BREACH.halfWidth) return 0
  const wedge = smoothstep(BREACH.halfWidth, 0, across)
  const down = smoothstep(ISLAND.crater * BREACH.reach, ISLAND.crater * 0.4, d)
  // Faded out of the very middle, and not for looks.
  //
  // At the exact centre every angle is the same point, so a notch that still
  // has depth there asks one point to be at several heights at once - which
  // comes out of the mesh as a cluster of vertical slivers round the middle of
  // the crater, and out of the ground function as a cliff with no width. The
  // crater floor keeps its middle; the horseshoe opens from just outside it.
  const middle = smoothstep(0, ISLAND.crater * 0.42, d)
  return BREACH.depth * wedge * down * middle
}

/** The island's height at a local radius and angle: the profile, less the breach. */
export function partyHeightLocalAt(d: number, angle: number): number {
  return partyHeightLocal(d) - breachDepthAt(d, angle)
}

/** The height of the party island at a world position. */
export function partyHeightAt(x: number, z: number): number {
  return partyHeightLocalAt(localRadius(x, z), angleFromIsland(x, z))
}

/**
 * The whole world's ground: the party island where it is, and whatever was
 * there before everywhere else.
 *
 * The composition root hands this to the player, the footprints and the sea,
 * so all three agree about where the ground is - which is what stops the water
 * being drawn over the top of an island it has never heard of.
 */
export function groundWithIsland(
  x: number,
  z: number,
  elsewhere: (x: number, z: number) => number,
): number {
  if (!onPartyIsland(x, z)) return elsewhere(x, z)
  // Past the beach the island has already reached the sea bed, so taking the
  // higher of the two blends it into whatever the mainland says is down there
  // rather than cutting a hole in the sea floor the shape of the island.
  return Math.max(partyHeightAt(x, z), elsewhere(x, z))
}
