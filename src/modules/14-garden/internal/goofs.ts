/**
 * The rules of getting a round of Garden Goofs started.
 *
 * All pure. Who has chosen their animals, whether everybody has, what the
 * shared pot is worth, and what any of that arriving from another browser is
 * allowed to say.
 *
 * The game itself is still not here. This is the part that has to be right
 * before it can be: a menu that lets two people disagree about who has picked
 * is a game that never starts.
 */
import { DEFENDERS, defenderById, isDefenderId, type DefenderId } from './pieces'

export const GOOFS = {
  /**
   * How many kinds of animal you take into a round.
   *
   * Fewer than there are, on purpose. Three out of four is a decision every
   * round - bring the turtle or bring the frog - and four out of four is a
   * list you click through without reading.
   */
  handSize: 3,

  /**
   * What the shared pot starts at.
   *
   * Enough for two ducks and a rabbit, or one frog and change: you begin able
   * to do something, and not able to do everything.
   */
  startingSeeds: 50,
} as const

/** Where a round has got to. Not the party's phase - this one is the game's. */
export type GardenPhase = 'off' | 'picking' | 'planting'

/**
 * Everyone's hand, by peer id.
 *
 * A player is in here **only once they have confirmed**, which is what makes
 * "has everybody picked" a question with an answer. Half a hand is a draft and
 * lives in the menu, not here.
 */
export type Hands = Readonly<Record<string, readonly DefenderId[]>>

/**
 * A hand, cleaned up, or `null` if it is not one.
 *
 * Duplicates are dropped rather than rejected - clicking the duck twice is a
 * slip, not a lie - but anything else about it being wrong rejects the whole
 * thing. An empty hand is not a hand: you have to bring something.
 */
export function validHand(value: unknown): DefenderId[] | null {
  if (!Array.isArray(value)) return null
  const out: DefenderId[] = []
  for (const entry of value) {
    if (!isDefenderId(entry)) return null
    if (!out.includes(entry)) out.push(entry)
  }
  if (out.length === 0 || out.length > GOOFS.handSize) return null
  return out
}

/** Whether adding one more would be over the limit. */
export function handIsFull(hand: readonly DefenderId[]): boolean {
  return hand.length >= GOOFS.handSize
}

/** Whether everybody who counts has confirmed a hand. */
export function everyoneHasPicked(ids: Iterable<string>, hands: Hands): boolean {
  let any = false
  for (const id of ids) {
    any = true
    if (!hands[id]) return false
  }
  return any
}

/** How many are still choosing. What the menu counts down. */
export function waitingToPick(ids: Iterable<string>, hands: Hands): number {
  let waiting = 0
  for (const id of ids) if (!hands[id]) waiting++
  return waiting
}

/**
 * Where a round has got to.
 *
 * `playing` is the party's phase - the host pressed start - and the rest is
 * this game's own business. Picking comes first and everybody has to finish
 * it, because a round that began while somebody was still reading the menu
 * would be a round they did not get to play.
 */
export function gardenPhase(playing: boolean, ids: Iterable<string>, hands: Hands): GardenPhase {
  if (!playing) return 'off'
  return everyoneHasPicked(ids, hands) ? 'planting' : 'picking'
}

/** Whether the pot covers one of those. */
export function canAfford(seeds: number, id: DefenderId): boolean {
  return seeds >= defenderById(id).cost
}

/** The cheapest thing anybody could plant, for telling a player the pot is dry. */
export function cheapestCost(hand: readonly DefenderId[] = DEFENDERS.map((d) => d.id)): number {
  let least = Infinity
  for (const id of hand) least = Math.min(least, defenderById(id).cost)
  return Number.isFinite(least) ? least : 0
}

/** A Garden Goofs message, as it goes over the room channel. */
export interface GoofsMessage {
  /** The hand the sender has confirmed. */
  hand?: DefenderId[]
  /** What the shared pot is worth. Only the host's copy counts. */
  seeds?: number
  /** Somebody newly arrived, asking where things stand. */
  ask?: boolean
}

/**
 * Reads one off the wire.
 *
 * As untrusted as everything else another browser sends, and rejecting the
 * whole message rather than half-reading it. The dangerous one is the hand: an
 * animal nobody has heard of, or a hand of nine, would put something in the
 * menu that cannot be drawn and cannot be cleared.
 */
export function decodeGoofs(message: Record<string, unknown>): GoofsMessage | null {
  if (message.t !== 'goofs') return null
  const out: GoofsMessage = {}

  if (message.hand !== undefined) {
    const hand = validHand(message.hand)
    if (!hand) return null
    out.hand = hand
  }

  if (message.seeds !== undefined) {
    const seeds = message.seeds
    // A pot of NaN, of -1, or of a trillion are all the same kind of wrong.
    if (typeof seeds !== 'number' || !Number.isFinite(seeds) || seeds < 0) return null
    out.seeds = Math.floor(seeds)
  }

  if (message.ask !== undefined) {
    if (typeof message.ask !== 'boolean') return null
    out.ask = message.ask
  }

  return out
}

export function encodeGoofs(message: GoofsMessage): Record<string, unknown> {
  return { t: 'goofs', ...message }
}
