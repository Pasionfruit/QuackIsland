/**
 * A round in progress: the seeds on the lawn, and what has been planted.
 *
 * All pure, and all of it takes the round as an argument and hands a new one
 * back. Nothing in here knows about a socket, a clock or a mouse - which is
 * what lets the host run these rules as the authority on what happened while
 * every guest runs the same file to draw the result.
 *
 * **The whole round is one small object.** That is a deliberate choice about
 * the network as much as about the code: the host sends the round after every
 * change rather than sending a description of the change. Deltas are smaller
 * and every one of them is a chance to end up with two lawns that disagree,
 * and the changes here happen at the speed of a person clicking - a plant
 * every few seconds, a seed every few - not sixty times a second.
 */
import { GRID, inGrid } from './grid'
import { defenderById, type DefenderId } from './pieces'

export const SEED = {
  /** Seconds between one seed appearing and the next, on average. */
  every: 5.5,
  /** How much earlier or later than that it can be. */
  jitter: 2.5,
  /**
   * How long a seed sits on the lawn before it is gone, in seconds.
   *
   * The whole of the clicking game. Long enough to cross the board for, short
   * enough that you cannot leave three of them lying there while you think.
   */
  life: 9,
  /** What one seed is worth to the shared pot. */
  worth: 25,
  /**
   * The most seeds that may be on the lawn at once.
   *
   * Without a cap, a party that stops clicking comes back to a lawn paved with
   * seeds and a pot that pays for everything.
   */
  most: 6,
} as const

/** One seed, sitting on the lawn, waiting to be clicked. */
export interface Seed {
  /** The host's own numbering. Unique for the round. */
  id: number
  row: number
  col: number
  /** What it pays into the pot. */
  worth: number
  /**
   * Seconds it had left when whoever is reading this last heard about it.
   *
   * Sent rather than an expiry time, because two browsers do not share a
   * clock: a timestamp from the host means nothing here, and "nine seconds
   * from when you read this" means the same everywhere.
   */
  left: number
}

/** One animal, planted. */
export interface Plant {
  row: number
  col: number
  id: DefenderId
}

/** Everything about a round that everybody has to agree on. */
export interface Round {
  /** The shared pot. */
  seeds: number
  /** What is on the lawn to be clicked. */
  loose: Seed[]
  /** What has been planted, at most one to a square. */
  plants: Plant[]
}

export function emptyRound(seeds: number): Round {
  return { seeds, loose: [], plants: [] }
}

/** How long until the next seed, in seconds. */
export function nextSpawnIn(random: () => number): number {
  return SEED.every + (random() * 2 - 1) * SEED.jitter
}

/**
 * Where the next seed lands, or `null` if the lawn is already full of them.
 *
 * Anywhere at all, planted squares included: a seed is a thing lying on the
 * grass, not a thing growing in it, and having to reach over your own turtle
 * to get one is the game working rather than the game being unfair.
 *
 * It will not land on a square that already has a seed, because two seeds in
 * one square is one seed you cannot click.
 */
export function spawnSeed(round: Round, id: number, random: () => number): Seed | null {
  if (round.loose.length >= SEED.most) return null

  const taken = new Set(round.loose.map((s) => s.row * GRID.cols + s.col))
  const free = GRID.rows * GRID.cols - taken.size
  if (free <= 0) return null

  // Walk to the nth free square rather than guessing and retrying: a retry
  // loop on a nearly full board is a loop with no upper bound on it.
  let nth = Math.floor(random() * free)
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.cols; col++) {
      if (taken.has(row * GRID.cols + col)) continue
      if (nth-- > 0) continue
      return { id, row, col, worth: SEED.worth, left: SEED.life }
    }
  }
  return null
}

/**
 * The lawn, a moment later.
 *
 * Seeds run down and the ones that reach zero are gone. Whoever is reading
 * this counts down their own copy, so a guest's seeds fade at the same rate
 * the host's do without the two of them sharing a clock.
 */
export function age(round: Round, delta: number): Round {
  if (!(delta > 0) || round.loose.length === 0) return round
  const loose: Seed[] = []
  for (const seed of round.loose) {
    const left = seed.left - delta
    if (left > 0) loose.push({ ...seed, left })
  }
  return { ...round, loose }
}

/** A seed, added to the lawn. */
export function addSeed(round: Round, seed: Seed): Round {
  return { ...round, loose: [...round.loose, seed] }
}

/**
 * Somebody clicked a seed.
 *
 * **First click wins, and a second one pays nothing.** Two players will click
 * the same seed - that is what a shared lawn is - and the loser must not be
 * told they earned twenty-five that nobody adds to the pot. The host is the
 * one running this, so the host's answer is the answer.
 */
export function claimSeed(round: Round, id: number): { round: Round; gained: number } {
  const seed = round.loose.find((s) => s.id === id)
  if (!seed) return { round, gained: 0 }
  return {
    round: {
      ...round,
      seeds: round.seeds + seed.worth,
      loose: round.loose.filter((s) => s.id !== id),
    },
    gained: seed.worth,
  }
}

/** What is planted in a square, if anything. */
export function plantAt(round: Round, row: number, col: number): Plant | null {
  return round.plants.find((p) => p.row === row && p.col === col) ?? null
}

/** Why a planting was refused, or `null` if it was not. */
export type Refusal = 'off the lawn' | 'not in the loadout' | 'square taken' | 'not enough seeds'

/**
 * Whether that animal may go in that square, right now.
 *
 * Every reason is checked in the order a player would notice them, and the
 * reason comes back as words because the interface has to say one of them out
 * loud - a drop that silently does nothing is a bug report.
 */
export function refusePlant(
  round: Round,
  hand: readonly DefenderId[],
  row: number,
  col: number,
  id: DefenderId,
): Refusal | null {
  if (!inGrid(row, col)) return 'off the lawn'
  if (!hand.includes(id)) return 'not in the loadout'
  if (plantAt(round, row, col)) return 'square taken'
  if (round.seeds < defenderById(id).cost) return 'not enough seeds'
  return null
}

/**
 * Plants one, and takes the cost out of the shared pot.
 *
 * Hands back the round unchanged if it was refused, so a caller that forgot to
 * check cannot spend seeds on a square it did not get.
 */
export function plant(
  round: Round,
  hand: readonly DefenderId[],
  row: number,
  col: number,
  id: DefenderId,
): { round: Round; refused: Refusal | null } {
  const refused = refusePlant(round, hand, row, col, id)
  if (refused) return { round, refused }
  return {
    round: {
      ...round,
      seeds: round.seeds - defenderById(id).cost,
      plants: [...round.plants, { row, col, id }],
    },
    refused: null,
  }
}

/** Digs one up again. Pays nothing back - you planted it, it is planted. */
export function uproot(round: Round, row: number, col: number): Round {
  if (!plantAt(round, row, col)) return round
  return { ...round, plants: round.plants.filter((p) => !(p.row === row && p.col === col)) }
}
