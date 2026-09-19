/**
 * The cellar and the clock it runs on: a trapdoor in the middle of the floor
 * with a spider's nest under it, and rounds of creep, spring and reveal.
 *
 * **The whole schedule is arithmetic on the seed and the clock.** When each
 * round's trapdoor springs - a random moment - how long you have to react once
 * it does, and the little twitches it gives beforehand to fool you, all come
 * from the seed and the round number. So every screen works out for itself when
 * the lid will rattle and when the spider comes out, and none of it is sent.
 * Who it takes is the host's.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const CELLAR = {
  /** Half the cellar floor's width: room for the camera behind the ring. */
  half: 15,
  /** Half the trapdoor's side. */
  lid: 1,
  /** As close to the middle of the trapdoor as anybody can stand: at its edge. */
  near: 1.6,
  /** Where everybody starts each round, and as far back as anybody can go. */
  far: 9,
} as const

export const TIMING = {
  /** Seconds at the start of a round, back on the ring, before anybody can move. */
  ready: 1.5,
  /** The trapdoor springs this long into the creep, soonest and latest. */
  spring: [5, 15] as readonly [number, number],
  /** How long you have to click once it springs: in round one, and the least it shrinks to. */
  window: [0.62, 0.38] as readonly [number, number],
  /** How much the window shrinks each round. */
  shrink: 0.04,
  /** A moment more before the spider comes out, so a click still on the wire is counted. */
  grace: 0.25,
  /** Seconds of the spider, and who it took, before the next round. */
  reveal: 3.5,
} as const

/** More rounds than this and whoever is left shares first. */
export const MAX_ROUNDS = 12

export type Phase = 'ready' | 'creep' | 'reveal'

export interface Round {
  /** From 1. */
  round: number
  /** When the round starts, on the game's clock. */
  start: number
  /** When the creep starts. */
  creep: number
  /** When the trapdoor springs: from here, a click is a reaction. */
  springs: number
  /** How long after it springs a click still counts. */
  window: number
  /** When the spider comes out and the round is judged. */
  judged: number
  /** When the round ends and the next begins. */
  end: number
  /** Little rattles before the real thing, to fool you, on the game's clock. */
  twitches: number[]
}

export interface When {
  round: Round
  phase: Phase
  /** Seconds into the phase. */
  t: number
}

/** How long you have to react in round `round`. */
export function windowFor(round: number): number {
  return Math.max(TIMING.window[1], TIMING.window[0] - TIMING.shrink * (Math.max(1, round) - 1))
}

const schedules = new Map<number, Round[]>()

/** Every round a game can have, in order. The same seed, the same rounds. */
export function scheduleFor(seed: number): Round[] {
  const known = schedules.get(seed)
  if (known) return known
  const rounds: Round[] = []
  let start = 0
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const random = createRng(hashSeed(seed, `spidy-senses:round:${round}`))
    const creep = start + TIMING.ready
    const springs = creep + TIMING.spring[0] + random() * (TIMING.spring[1] - TIMING.spring[0])
    const window = windowFor(round)
    const judged = springs + window + TIMING.grace
    const end = judged + TIMING.reveal
    // Nought to two twitches, each a good while before the real thing and not on top of each other.
    const twitches: number[] = []
    const count = Math.floor(random() * 3)
    for (let k = 0; k < count; k++) {
      const at = creep + 1.5 + random() * Math.max(0, springs - creep - 3)
      if (at < springs - 1.2 && twitches.every((w) => Math.abs(w - at) > 1)) twitches.push(at)
    }
    twitches.sort((a, b) => a - b)
    rounds.push({ round, start, creep, springs, window, judged, end, twitches })
    start = end
  }
  schedules.set(seed, rounds)
  if (schedules.size > 16) schedules.delete(schedules.keys().next().value!)
  return rounds
}

/** Where the clock has got to: which round, which phase, how far in. Past the last round, the last round's reveal. */
export function when(seed: number, elapsed: number): When {
  const rounds = scheduleFor(seed)
  const e = Math.max(0, elapsed)
  const round = rounds.find((r) => e < r.end) ?? rounds[rounds.length - 1]
  if (e < round.creep) return { round, phase: 'ready', t: e - round.start }
  if (e < round.judged) return { round, phase: 'creep', t: e - round.creep }
  return { round, phase: 'reveal', t: e - round.judged }
}

/** Whether the trapdoor has sprung at `elapsed` and the spider is on its way: from the spring to the end of the round. */
export function sprung(seed: number, elapsed: number): boolean {
  const w = when(seed, elapsed)
  return elapsed >= w.round.springs && elapsed < w.round.end
}

/** How hard the lid is rattling at `elapsed`, 0 to 1: a twitch is a small one, the spring a big one that does not stop. */
export function rattle(seed: number, elapsed: number): number {
  const w = when(seed, elapsed)
  if (w.phase === 'reveal') return 0
  if (elapsed >= w.round.springs) return 1
  for (const at of w.round.twitches) {
    const since = elapsed - at
    if (since >= 0 && since < 0.35) return 0.35 * (1 - since / 0.35)
  }
  return 0
}

/** Where player `index` of `count` starts each round: round the ring, facing the trapdoor. */
export function spawnPoint(index: number, count: number): { x: number; z: number; yaw: number } {
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.PI / 4
  const x = Math.sin(angle) * CELLAR.far
  const z = Math.cos(angle) * CELLAR.far
  return { x, z, yaw: Math.atan2(x, z) }
}
