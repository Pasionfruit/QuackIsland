/**
 * The place Zombie Tag happens in: a walled box with things to put between you
 * and whatever is chasing you.
 *
 * Flat arithmetic, in arena units, with no three.js and no React. The whole
 * board is visible at once - the camera never moves and never follows anybody -
 * so there is no depth here, no chunking and no culling. Two numbers and a
 * radius is the whole of a body's place in the world.
 *
 * **Everything is a rectangle or a circle.** Bodies are circles, obstacles are
 * rectangles, the arena is a rectangle. Every collision in the game is one of
 * those two shapes against the other, which is why there is exactly one
 * push-out function below rather than a physics engine.
 */

export const ARENA = {
  /** The playing field, in arena units. Wider than tall: it is a room. */
  width: 44,
  height: 28,

  /** How big a body is. Player and zombie alike - a fair chase needs fair hitboxes. */
  radius: 0.62,

  /**
   * How fast a player runs, in units a second.
   *
   * The zombies' speed is **derived** from this rather than written beside it,
   * because "players move twice as fast as zombies" is the rule and two numbers
   * that have to stay in a ratio will not. There is a test.
   */
  playerSpeed: 8.4,
  /** A zombie moves at exactly half a player's pace. Never edit this directly. */
  get zombieSpeed(): number {
    return this.playerSpeed / 2
  },

  /**
   * How close a zombie has to get to take somebody: touching, plus a reach.
   *
   * **The reach is load-bearing, not flavour.** Bodies are solid and are
   * pushed apart to exactly `radius * 2` every frame, so a catch range of
   * `radius * 2` is a range a zombie can never quite be inside - whether it
   * caught you would come down to which way the last floating-point division
   * rounded. Giving it arms slightly longer than its body is what makes
   * touching somebody mean catching them.
   */
  get catchRange(): number {
    return this.radius * 2 + 0.25
  },

  /** How far a push reaches. Close work: you have to commit to it. */
  pushRange: 2.6,
  /** Seconds before you can push again, hit or miss. */
  pushCooldown: 3,
  /** Seconds the pushed player spends on the floor. */
  pushStun: 1,

  /** How many zombies the round opens with. */
  zombies: 6,

  /**
   * How long somebody takes to turn, in seconds.
   *
   * A beat, and a load-bearing one. Without it a player caught in a crowd is a
   * zombie on the same frame, standing inside a knot of runners it can now
   * catch - so one catch cascades through everybody touching them before
   * anybody can react. A tenth of a second is long enough to see the turn
   * happen and long enough to get clear of it.
   *
   * While it runs, the body is neither use nor ornament: it cannot catch, and
   * it cannot move. It is mid-transformation.
   */
  turnDelay: 0.1,

  /** How far from the middle the players start, in a ring. */
  spawnRing: 2.4,
} as const

export interface Obstacle {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The furniture, as a fixed layout rather than a scatter.
 *
 * Hand-placed and symmetrical on both axes, which is not decoration: a chase
 * game where one corner has better cover than the other is a game decided by
 * where you spawned. Every player gets the same room.
 *
 * **The middle is deliberately clear.** Everybody spawns there, and spawning
 * inside a crate is the one failure that would make the round unplayable from
 * the first frame. There is a test that the spawn ring is empty.
 */
export const OBSTACLES: readonly Obstacle[] = Object.freeze(
  [
    // Four long blocks framing the centre, leaving lanes between them.
    { x: -13, y: -7.5, width: 7, height: 2 },
    { x: 13, y: -7.5, width: 7, height: 2 },
    { x: -13, y: 7.5, width: 7, height: 2 },
    { x: 13, y: 7.5, width: 7, height: 2 },

    // Two uprights close in, so the middle has cover without being a fort.
    { x: -6.5, y: 0, width: 2, height: 6.5 },
    { x: 6.5, y: 0, width: 2, height: 6.5 },

    // Crates along the top and bottom walls, to break up the long runs.
    { x: 0, y: -11, width: 6, height: 2 },
    { x: 0, y: 11, width: 6, height: 2 },

    // Corner pillars, to stop the corners being safe places to stand.
    { x: -17.5, y: 0, width: 2.4, height: 2.4 },
    { x: 17.5, y: 0, width: 2.4, height: 2.4 },
  ].map((o) => Object.freeze(o)),
)

/** Half the arena, which is the number most of the maths actually wants. */
export const HALF_W = ARENA.width / 2
export const HALF_H = ARENA.height / 2

export interface Point {
  x: number
  y: number
}

/**
 * Pushes a circle out of a rectangle, if it is in one.
 *
 * The one collision routine in the game. Finds the nearest point on the
 * rectangle to the circle's middle and, if that is closer than the radius,
 * shoves the circle straight out along that line.
 *
 * The case worth knowing about is a body whose middle is **inside** the
 * rectangle, which the nearest-point test cannot give a direction for - it
 * returns the middle itself, and a zero-length line has no direction. That
 * happens when something is moving fast enough to pass through a crate in one
 * frame, so it is resolved by pushing out of whichever wall is closest rather
 * than pretending it cannot happen.
 */
export function pushOutOfBox(at: Point, radius: number, box: Obstacle): Point {
  const halfW = box.width / 2
  const halfH = box.height / 2
  const dx = at.x - box.x
  const dy = at.y - box.y

  const inside = Math.abs(dx) < halfW && Math.abs(dy) < halfH
  if (inside) {
    // Out through the nearest wall. Comparing how far in it is on each axis.
    const outX = halfW - Math.abs(dx)
    const outY = halfH - Math.abs(dy)
    if (outX < outY) {
      return { x: box.x + Math.sign(dx || 1) * (halfW + radius), y: at.y }
    }
    return { x: at.x, y: box.y + Math.sign(dy || 1) * (halfH + radius) }
  }

  const nearestX = Math.max(box.x - halfW, Math.min(at.x, box.x + halfW))
  const nearestY = Math.max(box.y - halfH, Math.min(at.y, box.y + halfH))
  const awayX = at.x - nearestX
  const awayY = at.y - nearestY
  const distance = Math.hypot(awayX, awayY)
  if (distance >= radius) return at
  if (distance === 0) return at
  const push = radius / distance
  return { x: nearestX + awayX * push, y: nearestY + awayY * push }
}

/** Keeps a body inside the walls. The arena is enclosed; there is no way out. */
export function clampToArena(at: Point, radius: number): Point {
  return {
    x: Math.max(-HALF_W + radius, Math.min(HALF_W - radius, at.x)),
    y: Math.max(-HALF_H + radius, Math.min(HALF_H - radius, at.y)),
  }
}

/**
 * Where a body ends up after trying to move somewhere: out of every crate, and
 * inside the walls.
 *
 * Crates first and walls last, so a body squeezed against a wall by a crate
 * ends up inside the arena rather than shoved through it.
 */
export function settle(at: Point, radius: number): Point {
  let where = at
  for (const box of OBSTACLES) where = pushOutOfBox(where, radius, box)
  return clampToArena(where, radius)
}

/** Whether a point is inside any crate. For tests, and for placing things. */
export function inObstacle(at: Point, radius = 0): boolean {
  return OBSTACLES.some(
    (box) =>
      Math.abs(at.x - box.x) < box.width / 2 + radius &&
      Math.abs(at.y - box.y) < box.height / 2 + radius,
  )
}

/**
 * Where everybody starts: the players in a ring in the middle, as asked.
 *
 * Evenly spaced round a small circle, so nobody starts closer to the edge - or
 * to cover - than anybody else. The ring is small enough to read as "the
 * middle" and wide enough that bodies are not already overlapping.
 */
export function playerSpawns(count: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i < count; i++) {
    // One player stands dead centre rather than on a ring of one.
    if (count === 1) {
      out.push({ x: 0, y: 0 })
      break
    }
    const angle = (Math.PI * 2 * i) / count
    out.push({ x: Math.cos(angle) * ARENA.spawnRing, y: Math.sin(angle) * ARENA.spawnRing })
  }
  return out
}

/**
 * Where the zombies start: spread around the outside, facing in.
 *
 * On a ring just inside the walls, so a round opens with the middle
 * surrounded - which is the whole shape of the game - and with nobody close
 * enough to catch anybody in the first second.
 */
export function zombieSpawns(count: number): Point[] {
  const out: Point[] = []
  const inset = 1.6
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.PI / count
    const at = {
      x: Math.cos(angle) * (HALF_W - inset),
      y: Math.sin(angle) * (HALF_H - inset),
    }
    out.push(settle(at, ARENA.radius))
  }
  return out
}
