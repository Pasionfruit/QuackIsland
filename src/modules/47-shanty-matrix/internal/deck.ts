/**
 * The deck and the guns: a railed main deck on a pirate ship, and every
 * cannonball that will ever fly across it.
 *
 * **The whole barrage is arithmetic on the seed and the clock.** Which way each
 * ball comes from, where it crosses, how big and how fast it is and when it is
 * fired are dealt from the seed before the first one flies - so every screen
 * works out for itself where every ball is, and none of it is ever sent.
 *
 * A ball is **fired** far out at sea and shown from that moment, with its lane
 * lit across the deck; exactly `SHOT.warn` seconds later it reaches the rail,
 * skims across the planks at its own speed and flies off the far side into the
 * sea. The gaps between volleys shrink, the balls get quicker, and later on they
 * come two and three at a time.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const DECK = {
  /** Half the main deck's width, east to west, inside the rails. */
  halfX: 7,
  /** Half its length, bow (north) to stern. */
  halfZ: 9.5,
  /** How high the rails stand. */
  rail: 0.8,
} as const

export const SHOT = {
  /** Seconds from a ball being fired - and its lane lit - to it reaching the rail. */
  warn: 1.1,
  /** When the first one is fired. */
  first: 1.2,
  /** How big a ball is, smallest and largest radius, metres. */
  radius: [0.85, 1.45] as readonly [number, number],
  /** Seconds between volleys, at the start and once the barrage is at its fiercest. */
  gap: [1.7, 0.55] as readonly [number, number],
  /** Metres a second, slowest and fastest, at the start and at the fiercest. */
  speed: {
    start: [7, 11] as readonly [number, number],
    end: [12, 20] as readonly [number, number],
  },
  /** Seconds until the barrage is at its fiercest. */
  ramp: 56,
  /** Seconds between the balls of one volley. */
  stagger: 0.18,
  /** How far a ball flies on past the far rail before it is gone, metres. */
  tail: 14,
  /** How quickly it drops once past the rail: metres down for the square of metres on. */
  sink: 0.08,
} as const

/** When the barrage stops: whoever is still standing then shares first. */
export const LIMIT = 75

export interface Shot {
  /** Its place in the barrage, from 0. */
  k: number
  /** When it is fired, seconds on the round's clock. */
  fire: number
  /** The way it flies, a unit vector on the deck. */
  dx: number
  dz: number
  /** A point its line passes through: the nearest to the middle of the deck. */
  cx: number
  cz: number
  radius: number
  /** Metres a second. */
  speed: number
  /** How far along its line it touches the deck, and leaves it. */
  sIn: number
  sOut: number
}

export interface Ball {
  x: number
  y: number
  z: number
  /** How far along its line. */
  s: number
  /** Coming in from the sea, crossing the deck, or flying off. */
  stage: 'incoming' | 'deck' | 'outgoing'
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** How fierce the barrage is at `t`: 0 at the start, 1 from `SHOT.ramp` on. */
export function fierceness(t: number): number {
  return Math.min(1, Math.max(0, t) / SHOT.ramp)
}

/** How many balls a volley at `t` has, from a roll of the dice `roll` in [0, 1). */
export function volleySize(t: number, roll: number): number {
  if (t < 16) return 1
  if (t < 34) return roll < 0.4 ? 2 : 1
  if (t < 53) return roll < 0.25 ? 3 : roll < 0.75 ? 2 : 1
  return roll < 0.5 ? 3 : 2
}

/**
 * Where a line crosses the deck, grown by a ball's radius so that the ball
 * touching the rail counts: the stretch of `s` it is over the deck, or null if
 * it misses the deck altogether.
 */
export function crossing(cx: number, cz: number, dx: number, dz: number, radius: number): [number, number] | null {
  let lo = -Infinity
  let hi = Infinity
  const slab = (c: number, d: number, half: number) => {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(c) > half) lo = Infinity
      return
    }
    const a = (-half - c) / d
    const b = (half - c) / d
    lo = Math.max(lo, Math.min(a, b))
    hi = Math.min(hi, Math.max(a, b))
  }
  slab(cx, dx, DECK.halfX + radius)
  slab(cz, dz, DECK.halfZ + radius)
  return lo < hi ? [lo, hi] : null
}

const barrages = new Map<number, Shot[]>()

/** Every ball of a round, in the order they are fired. The same seed, the same barrage. */
export function barrageFor(seed: number): Shot[] {
  const known = barrages.get(seed)
  if (known) return known
  const random = createRng(hashSeed(seed, 'shanty-matrix:barrage'))
  const shots: Shot[] = []
  let t: number = SHOT.first
  while (t < LIMIT) {
    const f = fierceness(t)
    const count = volleySize(t, random())
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2
      const dx = Math.cos(angle)
      const dz = Math.sin(angle)
      // Across the deck anywhere, from rail to rail: the width of the deck side-on to its line.
      const nx = -dz
      const nz = dx
      const width = DECK.halfX * Math.abs(nx) + DECK.halfZ * Math.abs(nz)
      const offset = (random() * 2 - 1) * width * 0.92
      const radius = lerp(SHOT.radius[0], SHOT.radius[1], random())
      const slow = lerp(SHOT.speed.start[0], SHOT.speed.end[0], f)
      const fast = lerp(SHOT.speed.start[1], SHOT.speed.end[1], f)
      const speed = lerp(slow, fast, random())
      const cx = nx * offset
      const cz = nz * offset
      const [sIn, sOut] = crossing(cx, cz, dx, dz, radius) ?? [-radius, radius]
      shots.push({ k: shots.length, fire: Math.round((t + i * SHOT.stagger) * 1000) / 1000, dx, dz, cx, cz, radius, speed, sIn, sOut })
    }
    t += lerp(SHOT.gap[0], SHOT.gap[1], f) * (0.8 + random() * 0.4)
  }
  shots.sort((a, b) => a.fire - b.fire || a.k - b.k)
  shots.forEach((s, i) => (s.k = i))
  barrages.set(seed, shots)
  if (barrages.size > 16) barrages.delete(barrages.keys().next().value!)
  return shots
}

/** How long after it is fired a ball is gone, seconds. */
export function lifetime(shot: Shot): number {
  return SHOT.warn + (shot.sOut - shot.sIn + SHOT.tail) / shot.speed
}

/** Where a ball is at `t`, or null before it is fired and after it is gone. */
export function ballAt(shot: Shot, t: number): Ball | null {
  if (t < shot.fire) return null
  const s = shot.sIn + shot.speed * (t - shot.fire - SHOT.warn)
  if (s > shot.sOut + SHOT.tail) return null
  const x = shot.cx + shot.dx * s
  const z = shot.cz + shot.dz * s
  if (s < shot.sIn) {
    // Coming down out of the sky from the gun, onto the deck at the rail.
    return { x, z, y: shot.radius + (shot.sIn - s) * 0.32, s, stage: 'incoming' }
  }
  if (s <= shot.sOut) return { x, z, y: shot.radius, s, stage: 'deck' }
  const past = s - shot.sOut
  return { x, z, y: shot.radius - past * past * SHOT.sink, s, stage: 'outgoing' }
}

/** The longest any ball lives: none fired longer ago than this can still be flying. */
const LONGEST = SHOT.warn + (Math.hypot(DECK.halfX, DECK.halfZ) * 2 + SHOT.radius[1] * 2 + SHOT.tail) / SHOT.speed.start[0]

/** The balls fired by `t` and not yet gone. */
export function activeShots(seed: number, t: number): Shot[] {
  const shots = barrageFor(seed)
  // The first fired within a lifetime of `t`, by halving.
  let lo = 0
  let hi = shots.length
  const from = t - LONGEST
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (shots[mid].fire < from) lo = mid + 1
    else hi = mid
  }
  const out: Shot[] = []
  for (let i = lo; i < shots.length && shots[i].fire <= t; i++) {
    if (t - shots[i].fire <= lifetime(shots[i])) out.push(shots[i])
  }
  return out
}

/** How far a point is from a ball's line, sideways. */
export function offLine(shot: Shot, x: number, z: number): number {
  return Math.abs((x - shot.cx) * -shot.dz + (z - shot.cz) * shot.dx)
}

/** How far along a ball's line a point is. */
export function alongLine(shot: Shot, x: number, z: number): number {
  return (x - shot.cx) * shot.dx + (z - shot.cz) * shot.dz
}

/** Where player `index` of `count` starts: round a ring on the deck, facing the middle. */
export function spawnPoint(index: number, count: number): { x: number; z: number; yaw: number } {
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.PI / 8
  const r = count <= 1 ? 0 : 1
  const x = Math.sin(angle) * DECK.halfX * 0.55 * r
  const z = Math.cos(angle) * DECK.halfZ * 0.55 * r
  return { x, z, yaw: Math.atan2(x, z) }
}
