/**
 * The lake and what bites: the five fish, every player's bites for the round,
 * how far each rod bends when, and what a set of pulls lands.
 *
 * **Everything is arithmetic on the seed, the player and the clock.** Each
 * player has their own run of bites - when, how big, how long the fish stays on
 * - dealt from the seed before the round starts. A rod's bend at any moment is
 * worked out from that and the pulls its player has made. And **what anybody
 * has caught is worked out from their pulls alone**, by playing them back
 * against their bites - so the only thing that ever has to be agreed across the
 * lobby is when each pull happened.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

/** How long the round is, seconds. */
export const LENGTH = 25

/**
 * The five fish, smallest first: what they are called, what they weigh, how far
 * they bend the rod (0 straight, 1 bent double), and how they are drawn. **Your mom
 * is the heaviest** - and bends the rod double.
 */
export const FISH = [
  { name: 'perch', weight: [0.3, 0.8], bend: 0.18, colour: '#a8b84a', length: 0.35 },
  { name: 'bass', weight: [1.5, 3], bend: 0.36, colour: '#4f7f3a', length: 0.6 },
  { name: 'pike', weight: [4, 7], bend: 0.55, colour: '#708a5c', length: 0.95 },
  { name: 'catfish', weight: [10, 18], bend: 0.76, colour: '#4a4038', length: 1.4 },
  { name: 'your mom', weight: [25, 40], bend: 1, colour: '#c0619a', length: 1.9 },
] as const

/** How likely each fish is to be the one biting: the small ones often, the big ones rarely - and maybe never. */
export const ODDS = [0.4, 0.29, 0.18, 0.09, 0.04] as const

export const BITE = {
  /** When the first bite comes, soonest and latest. */
  first: [0.8, 2.5] as readonly [number, number],
  /** How long a fish stays on, shortest and longest, seconds - bigger ones a little longer. */
  hold: [1.1, 2.2] as readonly [number, number],
  /** The quiet between one fish letting go and the next biting, shortest and longest. */
  gap: [0.6, 3] as readonly [number, number],
  /** How long the rod takes to bend over as a fish takes it, and to straighten as it lets go. */
  ramp: 0.35,
  release: 0.25,
  /** How long after a bite starts it is on the hook: a pull before then is too soon. */
  hook: 0.12,
} as const

/** Seconds the line is out of the water after a pull, being cast again: nothing bites, and a click does nothing. */
export const RECAST = 1.2

export interface Bite {
  /** Its place in the player's run, from 0. */
  k: number
  start: number
  /** When the fish lets go. */
  end: number
  /** Which fish, 0 to 4. */
  size: number
  /** Kilograms, if landed. */
  weight: number
}

const runs = new Map<string, Bite[]>()

/** Which fish a roll of the dice in [0, 1) is. */
export function fishFor(roll: number): number {
  let acc = 0
  for (let s = 0; s < ODDS.length; s++) {
    acc += ODDS[s]
    if (roll < acc) return s
  }
  return ODDS.length - 1
}

/** A player's bites for the round, in order. The same seed and player, the same bites. */
export function bitesFor(seed: number, player: number): Bite[] {
  const key = `${seed}:${player}`
  const known = runs.get(key)
  if (known) return known
  const random = createRng(hashSeed(seed, `milf-fishing:bites:${player}`))
  const lerp = (r: readonly [number, number], k: number) => r[0] + (r[1] - r[0]) * k
  const bites: Bite[] = []
  let t = lerp(BITE.first, random())
  while (t < LENGTH - 0.5) {
    const size = fishFor(random())
    const hold = lerp(BITE.hold, random()) + size * 0.15
    const w = FISH[size].weight
    const weight = Math.round((w[0] + (w[1] - w[0]) * random()) * 10) / 10
    bites.push({ k: bites.length, start: t, end: Math.min(LENGTH, t + hold), size, weight })
    t += hold + BITE.release + lerp(BITE.gap, random())
  }
  runs.set(key, bites)
  if (runs.size > 64) runs.delete(runs.keys().next().value!)
  return bites
}

/** Whether a fish is on the hook at `t`: bitten long enough to hook, and not let go yet. */
export function hooked(bite: Bite, t: number): boolean {
  return t >= bite.start + BITE.hook && t < bite.end
}

export interface Played {
  /** The pulls that counted - clicks during a recast never do - in order. */
  pulls: number[]
  /** What each landed: a bite, or nothing. */
  landed: (Bite | null)[]
}

/**
 * A player's pulls played back against their bites: which counted, and what
 * each landed. A pull lands the fish on the hook at that moment, if there is
 * one and it has not been landed already; a pull while the line is still being
 * cast from the last one does not count at all.
 */
export function playBack(bites: readonly Bite[], pulls: readonly number[]): Played {
  const counted: number[] = []
  const landed: (Bite | null)[] = []
  const caught = new Set<number>()
  let last = -Infinity
  for (const at of pulls) {
    if (at - last < RECAST - 1e-9 || at < 0 || at > LENGTH) continue
    last = at
    counted.push(at)
    const bite = bites.find((b) => !caught.has(b.k) && hooked(b, at)) ?? null
    if (bite) caught.add(bite.k)
    landed.push(bite)
  }
  return { pulls: counted, landed }
}

export interface Bend {
  /** 0 straight, 1 bent double. */
  bend: number
  /** The bite bending it, or -1. */
  bite: number
  /** The line is out of the water, being cast again. */
  casting: boolean
}

/**
 * How far a player's rod is bent at `t`, given their pulls: bending over as a
 * fish takes it - as far as that fish bends it - tugging while it is on, and
 * straightening as it lets go. Straight while the line is being cast, and for
 * any fish already landed.
 */
export function bendAt(bites: readonly Bite[], pulls: readonly number[], t: number): Bend {
  const played = playBack(
    bites,
    pulls.filter((p) => p <= t),
  )
  const last = played.pulls.length ? played.pulls[played.pulls.length - 1] : -Infinity
  if (t - last < RECAST) return { bend: 0, bite: -1, casting: true }
  const caught = new Set(played.landed.filter((b): b is Bite => b !== null).map((b) => b.k))
  for (const b of bites) {
    if (caught.has(b.k) || t < b.start || t >= b.end + BITE.release) continue
    const level = FISH[b.size].bend
    let bend: number
    if (t < b.end) {
      const ramp = Math.min(1, (t - b.start) / BITE.ramp)
      // A fish on the line tugs.
      const tug = ramp >= 1 ? 0.07 * Math.sin((t - b.start) * 17 + b.k) + 0.04 * Math.sin((t - b.start) * 29 + b.k * 2) : 0
      bend = level * (ramp * (2 - ramp)) * (1 + tug)
    } else bend = level * (1 - (t - b.end) / BITE.release)
    return { bend: Math.max(0, bend), bite: b.k, casting: false }
  }
  return { bend: 0, bite: -1, casting: false }
}
