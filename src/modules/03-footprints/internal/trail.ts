/**
 * Deciding where footprints go.
 *
 * Pure bookkeeping over a fixed ring of slots: no three.js, no React, so the
 * awkward parts - that prints alternate feet, that they are spaced by distance
 * walked rather than by time, that the oldest is recycled once the ring is
 * full - are all testable in Node.
 */

export interface Footprint {
  x: number
  z: number
  /** Ground height where it was left. */
  y: number
  /** Which way the foot pointed, radians. */
  facing: number
  /** Which foot, so the pair sit either side of the line of travel. */
  side: -1 | 1
  /** Seconds since it was left. Beyond `life` the slot is free. */
  age: number
  used: boolean
}

export interface TrailConfig {
  /** How many prints exist at once. The oldest is overwritten. */
  capacity: number
  /** Metres between prints. */
  stride: number
  /** Seconds before a print has faded away entirely. */
  life: number
  /** How far to either side of the walking line each foot lands. */
  spread: number
  /** The speed the base stride is measured at. Faster than this lengthens it. */
  strideSpeed: number
  /** The longest a stride may get, as a multiple of the base. */
  strideMax: number
}

export const TRAIL: TrailConfig = {
  capacity: 220,
  stride: 1.25,
  life: 26,
  spread: 0.34,
  strideSpeed: 9.5,
  strideMax: 1.75,
}

export interface TrailState {
  prints: Footprint[]
  /** Where the next print will be written. */
  cursor: number
  /** Metres walked since the last print. */
  sinceLast: number
  nextSide: -1 | 1
  lastX: number
  lastZ: number
  started: boolean
}

export function createTrail(config: TrailConfig = TRAIL): TrailState {
  return {
    prints: Array.from({ length: config.capacity }, () => ({
      x: 0,
      z: 0,
      y: 0,
      facing: 0,
      side: 1 as const,
      age: 0,
      used: false,
    })),
    cursor: 0,
    sinceLast: 0,
    nextSide: 1,
    lastX: 0,
    lastZ: 0,
    started: false,
  }
}

export interface Walker {
  x: number
  z: number
  /**
   * Which way the body points. Only used to orient a print when the walker has
   * barely moved; otherwise the direction of travel wins - a print should lie
   * along the way the foot went, and with a strafing body those are different
   * things.
   */
  facing: number
  grounded: boolean
  /** Optional. Running lengthens the stride, as it does in life. */
  speed?: number
}

/**
 * Ages every print and lays down new ones as the walker covers ground.
 *
 * Spacing is by distance rather than time on purpose: standing still should
 * leave nothing, and the prints should not bunch up when the walker slows.
 */
export function stepTrail(
  state: TrailState,
  walker: Walker | null,
  dt: number,
  groundAt: (x: number, z: number) => number,
  config: TrailConfig = TRAIL,
): TrailState {
  const step = Math.min(Math.max(dt, 0), 0.25)

  for (const p of state.prints) {
    if (!p.used) continue
    p.age += step
    if (p.age >= config.life) p.used = false
  }

  if (!walker) {
    state.started = false
    return state
  }

  if (!state.started) {
    state.lastX = walker.x
    state.lastZ = walker.z
    state.started = true
    return state
  }

  const dx = walker.x - state.lastX
  const dz = walker.z - state.lastZ
  const moved = Math.hypot(dx, dz)
  state.lastX = walker.x
  state.lastZ = walker.z

  // Lay the print along the way the foot actually went. With a body that
  // strafes, that is not the way it is facing - side-stepping while facing
  // forward would otherwise leave a line of prints all pointing sideways.
  // Below a hair of movement the direction is noise, so the body wins.
  const heading = moved > 1e-4 ? Math.atan2(dx, dz) : walker.facing

  // Nothing is left while airborne - you are not touching the sand.
  if (!walker.grounded) return state

  // Carry the remainder rather than zeroing it. Zeroing throws away whatever
  // was left over, so the spacing quietly becomes a function of how far the
  // walker happens to move per frame - prints every two metres at one frame
  // rate and every one and a quarter at another.
  const stride = strideFor(walker.speed, config)
  state.sinceLast = Math.min(state.sinceLast + moved, stride * 3)
  if (state.sinceLast < stride) return state
  state.sinceLast -= stride

  // Offset to the side of the line of travel, so the pair reads as a stride.
  const side = state.nextSide
  // Offset along the body's right, so side +1 really is the right foot.
  const ox = -Math.cos(heading) * config.spread * side
  const oz = Math.sin(heading) * config.spread * side
  const x = walker.x + ox
  const z = walker.z + oz

  const print = state.prints[state.cursor]
  print.x = x
  print.z = z
  print.y = groundAt(x, z)
  print.facing = heading
  print.side = side
  print.age = 0
  print.used = true

  state.cursor = (state.cursor + 1) % config.capacity
  state.nextSide = side === 1 ? -1 : 1
  return state
}

/**
 * How far apart this walker's prints should be.
 *
 * Someone running covers ground with longer strides, not with the same little
 * steps taken faster - keeping the spacing fixed makes a sprint read as a
 * shuffle.
 */
export function strideFor(speed: number | undefined, config: TrailConfig = TRAIL): number {
  if (!speed || speed <= config.strideSpeed) return config.stride
  const stretch = Math.min(config.strideMax, speed / config.strideSpeed)
  return config.stride * stretch
}

/** 1 when fresh, 0 once gone. */
export function fadeOf(print: Footprint, config: TrailConfig = TRAIL): number {
  if (!print.used) return 0
  return Math.max(0, 1 - print.age / config.life)
}
