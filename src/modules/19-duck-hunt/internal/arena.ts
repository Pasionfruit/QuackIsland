/**
 * Where Duck Hunt happens, and where every balloon is at every moment.
 *
 * Pure arithmetic. A balloon is a few numbers - when it lets go, where from,
 * how fast it rises and how it sways - and where it is at any time is a
 * function of those and the clock. So the whole flight of every balloon in a
 * game is known from the seed the moment the game is dealt, and **a browser
 * never has to be told where a balloon is**: only whether it has been popped.
 *
 * World axes: x across, y up, z towards the camera. Balloons let go from the
 * arena floor and rise until they float out of the top of the view.
 */
import { createRng, hashSeed } from '../../00-core'

export const ARENA = {
  /** How long a game lasts, in seconds. */
  duration: 60,
  /** Seconds between waves of balloons. */
  wave: 2,
  /** The first wave lets go this far in, so nobody is shooting at the countdown. */
  firstWave: 0.4,
  /** No wave lets go this close to the end: a balloon nobody can reach is not a balloon. */
  lastWaveBefore: 2.5,

  /** Where balloons let go from: a rectangle of arena floor. */
  floor: { minX: -12, maxX: 12, minZ: -8, maxZ: 2 },
  /** How far apart two balloons of one wave let go, at least. */
  apart: 2.6,
  /** The height a balloon starts at, and the height it is gone by. */
  startY: 0.8,
  ceiling: 13,
  /** Rising speed, units a second, least and most. */
  rise: [1.6, 2.3] as readonly [number, number],
  /** How far a balloon sways side to side, and how fast. */
  sway: [0.3, 0.9] as readonly [number, number],
  swayRate: [0.8, 1.6] as readonly [number, number],

  /** How big a balloon is - and how big it is to hit. */
  radius: 0.85,

  /** Seconds between one shot and the next, hit or miss. */
  cooldown: 0.5,
  /**
   * How early a shot may arrive and still count, in seconds.
   *
   * A guest's clock runs a round trip behind the host's, so a guest who fires
   * the instant their own cooldown ends can reach the host a moment before the
   * host's has. Refusing that would make the fastest shooter the one whose
   * shots vanish.
   */
  cooldownGrace: 0.15,
  /** How long after floating out of view a balloon can still be popped. Same reason. */
  escapeGrace: 0.3,
} as const

/** Eight colours that do not look alike, one per player. */
export const COLOURS = [
  '#e8505b', // red
  '#3f8fd0', // blue
  '#f2b33d', // yellow
  '#4fb35a', // green
  '#9c4bb0', // purple
  '#f08a3c', // orange
  '#35bdbd', // teal
  '#ef7fb4', // pink
] as const

/**
 * Eight shapes, one per player, drawn on their balloons beside the colour.
 *
 * Two colours that look alike to somebody - red and green, blue and purple -
 * never share a shape, so nobody has to tell colours apart to play.
 */
export const EMBLEMS = ['dot', 'triangle', 'square', 'ring', 'diamond', 'star', 'hexagon', 'cross'] as const
export type Emblem = (typeof EMBLEMS)[number]

export interface Balloon {
  /** Its index in the schedule. What a shot names and a pop records. */
  id: number
  /** Whose it is: an index into the game's players. */
  owner: number
  /** When it lets go, in seconds from the start. */
  spawnAt: number
  x: number
  z: number
  /** Units a second, upwards. */
  speed: number
  /** Side-to-side sway: how far, how fast, and where in the swing it starts. */
  sway: number
  swayRate: number
  swayPhase: number
}

export interface Point {
  x: number
  y: number
  z: number
}

const between = (random: () => number, [low, high]: readonly [number, number]) => low + random() * (high - low)

/**
 * Every balloon of a game, in the order they let go.
 *
 * **In waves, one balloon per player per wave**, so everybody gets exactly as
 * many balloons as everybody else, and a player's luck is in where theirs
 * appear, not how many there are. Within a wave the balloons let go at the
 * same moment, spread over the floor and never on top of each other.
 */
export function schedule(seed: number, players: number): Balloon[] {
  const random = createRng(hashSeed(seed, 'duck-hunt:balloons'))
  const out: Balloon[] = []
  const { floor } = ARENA
  for (let at = ARENA.firstWave; at <= ARENA.duration - ARENA.lastWaveBefore; at += ARENA.wave) {
    const wave: { x: number; z: number }[] = []
    // Whose balloon goes where is shuffled too, so nobody's always lets go on
    // the same side.
    const owners = Array.from({ length: players }, (_, i) => i)
    for (let i = owners.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[owners[i], owners[j]] = [owners[j], owners[i]]
    }
    for (const owner of owners) {
      let spot = { x: 0, z: 0 }
      for (let tries = 0; tries < 12; tries++) {
        spot = { x: between(random, [floor.minX, floor.maxX]), z: between(random, [floor.minZ, floor.maxZ]) }
        if (wave.every((w) => Math.hypot(w.x - spot.x, w.z - spot.z) >= ARENA.apart)) break
      }
      wave.push(spot)
      out.push({
        id: out.length,
        owner,
        spawnAt: at,
        x: spot.x,
        z: spot.z,
        speed: between(random, ARENA.rise),
        sway: between(random, ARENA.sway),
        swayRate: between(random, ARENA.swayRate),
        swayPhase: random() * Math.PI * 2,
      })
    }
  }
  return out
}

/** How long a balloon is up, from letting go to floating out of the top. */
export function lifetime(balloon: Balloon): number {
  return (ARENA.ceiling - ARENA.startY) / balloon.speed
}

/** Where a balloon is at a moment, or `null` if it has not let go or has floated away. */
export function balloonAt(balloon: Balloon, time: number): Point | null {
  const age = time - balloon.spawnAt
  if (age < 0 || age > lifetime(balloon)) return null
  return {
    x: balloon.x + Math.sin(age * balloon.swayRate + balloon.swayPhase) * balloon.sway,
    y: ARENA.startY + age * balloon.speed,
    z: balloon.z,
  }
}

/** Whether a balloon can still be shot at a moment, allowing for the network. */
export function shootable(balloon: Balloon, time: number): boolean {
  const age = time - balloon.spawnAt
  return age >= 0 && age <= lifetime(balloon) + ARENA.escapeGrace
}

/**
 * The balloon a shot along a ray hits first, or `null` for a miss.
 *
 * `direction` need not be unit length. Popped balloons are not there to hit.
 * The nearest along the ray wins, so a balloon in front of another shields it.
 */
export function pickBalloon(
  balloons: readonly Balloon[],
  popped: ReadonlyMap<number, number>,
  origin: Point,
  direction: Point,
  time: number,
): { balloon: Balloon; point: Point } | null {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (length === 0) return null
  const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length }
  let best: { balloon: Balloon; point: Point; along: number } | null = null
  for (const balloon of balloons) {
    if (popped.has(balloon.id)) continue
    const at = balloonAt(balloon, time)
    if (!at) continue
    // Ray against sphere: the closest the ray passes to the middle.
    const to = { x: at.x - origin.x, y: at.y - origin.y, z: at.z - origin.z }
    const along = to.x * d.x + to.y * d.y + to.z * d.z
    if (along <= 0) continue
    const closest = Math.hypot(to.x - d.x * along, to.y - d.y * along, to.z - d.z * along)
    if (closest > ARENA.radius) continue
    const into = along - Math.sqrt(ARENA.radius * ARENA.radius - closest * closest)
    if (!best || into < best.along) {
      best = { balloon, along: into, point: { x: origin.x + d.x * into, y: origin.y + d.y * into, z: origin.z + d.z * into } }
    }
  }
  return best ? { balloon: best.balloon, point: best.point } : null
}

/**
 * Where everybody's crosshair is drawn: a wall across the middle of the
 * field, facing the camera. A crosshair is a direction, not a place, so to show
 * it in somebody else's window it is pinned to where that direction meets this
 * wall - every window's camera stands in nearly the same spot, so it lands on
 * nearly the same balloons there too.
 */
export const AIM_PLANE_Z = (ARENA.floor.minZ + ARENA.floor.maxZ) / 2

/** Where a ray from the camera meets the aiming wall, or `null` if it points away from it. */
export function aimAt(origin: Point, direction: Point): Point | null {
  if (direction.z >= -1e-6) return null
  const along = (AIM_PLANE_Z - origin.z) / direction.z
  if (along <= 0) return null
  return { x: origin.x + direction.x * along, y: origin.y + direction.y * along, z: AIM_PLANE_Z }
}

/** The arena's footprint and height, for the camera to fit. */
export const BOUNDS = {
  minX: ARENA.floor.minX - 2.5,
  maxX: ARENA.floor.maxX + 2.5,
  minZ: ARENA.floor.minZ - 2.5,
  maxZ: ARENA.floor.maxZ + 3,
  minY: -0.5,
  maxY: ARENA.ceiling - 1.5,
} as const
