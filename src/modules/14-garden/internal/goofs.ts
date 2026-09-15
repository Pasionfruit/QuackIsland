/**
 * The rules of getting a round of Garden Goofs started, and of what it says
 * over the wire while it runs.
 *
 * All pure. Who has said they are ready to plant, what the party is taking in
 * between them, and what any of that arriving from another browser is allowed
 * to claim.
 *
 * **The loadout belongs to the party, not to a player.** Everybody picks from
 * one shelf into one set of packets, because it is one lawn and one pot of
 * seeds: two people bringing their own six animals to a shared board is two
 * people playing next to each other rather than together.
 */
import { GRID } from './grid'
import { DEFENDERS, isDefenderId, type DefenderId } from './pieces'
import { emptyRound, type Round } from './round'

export const GOOFS = {
  /**
   * How many kinds of animal the party takes into a round.
   *
   * Fewer than there are and fewer than the party would like, which is the
   * whole point of a loadout: with fifty animals to choose between, the round
   * is decided as much by what you left on the shelf as by what you brought.
   */
  handSize: 6,

  /**
   * What the shared pot starts at.
   *
   * Enough to get something in the ground before the first seed lands, and
   * not enough to fill a lane.
   */
  startingSeeds: 75,
} as const

/** Where a round has got to. Not the party's phase - this one is the game's. */
export type GardenPhase = 'off' | 'picking' | 'planting'

/** Everybody who has said they are done choosing, by peer id. */
export type Picked = readonly string[]

/**
 * A loadout, cleaned up, or `null` if it is not one.
 *
 * Duplicates are dropped rather than rejected - two people clicking the duck
 * is agreement, not a lie - but anything else wrong rejects the whole thing.
 * An empty loadout is allowed while the party is still choosing; what stops a
 * round starting on nothing is `canBegin`.
 */
export function validHand(value: unknown): DefenderId[] | null {
  if (!Array.isArray(value)) return null
  const out: DefenderId[] = []
  for (const entry of value) {
    if (!isDefenderId(entry)) return null
    if (!out.includes(entry)) out.push(entry)
  }
  return out.length <= GOOFS.handSize ? out : null
}

/** Whether the loadout is full, so the shelf can grey out the rest. */
export function handIsFull(hand: readonly DefenderId[]): boolean {
  return hand.length >= GOOFS.handSize
}

/**
 * The loadout with one animal added or taken out again.
 *
 * Anybody in the party may do this to anybody's choice, which is what "as a
 * team" means. A full loadout refuses another rather than pushing one out -
 * silently replacing somebody else's pick is the worst of both.
 */
export function toggle(hand: readonly DefenderId[], id: DefenderId): DefenderId[] {
  if (hand.includes(id)) return hand.filter((entry) => entry !== id)
  if (handIsFull(hand)) return [...hand]
  return [...hand, id]
}

/** Whether everybody who counts has said they are done choosing. */
export function everyoneHasPicked(ids: Iterable<string>, picked: Picked): boolean {
  let any = false
  for (const id of ids) {
    any = true
    if (!picked.includes(id)) return false
  }
  return any
}

/** How many are still choosing. What the menu counts down. */
export function waitingToPick(ids: Iterable<string>, picked: Picked): number {
  let waiting = 0
  for (const id of ids) if (!picked.includes(id)) waiting++
  return waiting
}

/**
 * Whether the party may start planting.
 *
 * Everybody has to be done, *and* there has to be something to plant. A round
 * that began on an empty loadout would be a lawn nobody could put anything on.
 */
export function canBegin(ids: Iterable<string>, picked: Picked, hand: readonly DefenderId[]): boolean {
  return hand.length > 0 && everyoneHasPicked(ids, picked)
}

/**
 * Where a round has got to.
 *
 * `playing` is the party's phase - the host pressed start - and the rest is
 * this game's own business. Picking comes first and everybody has to finish
 * it, because a round that began while somebody was still reading the shelf
 * would be a round they did not get to play.
 */
export function gardenPhase(
  playing: boolean,
  ids: Iterable<string>,
  picked: Picked,
  hand: readonly DefenderId[],
): GardenPhase {
  if (!playing) return 'off'
  return canBegin(ids, picked, hand) ? 'planting' : 'picking'
}

/**
 * The animals, in the order the shelf lists them.
 *
 * Grouped by what they are for rather than left in catalogue order, because
 * this list is meant to grow to fifty and fifty of anything in one flat column
 * is not a choice, it is a scroll. Within a group they stay in catalogue
 * order, so a party that has learned where the duck is keeps being right.
 */
export function shelf(): { role: string; animals: typeof DEFENDERS }[] {
  const roles = ['eats', 'walls', 'enriches'] as const
  const groups: { role: string; animals: typeof DEFENDERS }[] = []
  for (const role of roles) {
    const animals = DEFENDERS.filter((animal) => animal.role === role)
    if (animals.length) groups.push({ role, animals })
  }
  // Anything whose role nobody thought of still has to appear somewhere, or
  // adding a new kind of animal quietly loses it.
  const placed = new Set(groups.flatMap((g) => g.animals.map((a) => a.id)))
  const rest = DEFENDERS.filter((animal) => !placed.has(animal.id))
  if (rest.length) groups.push({ role: 'other', animals: rest })
  return groups
}

/** A Garden Goofs message, as it goes over the room channel. */
export interface GoofsMessage {
  /** The loadout the party has settled on. Anybody may change it. */
  hand?: DefenderId[]
  /** Whether the sender has said they are done choosing. Theirs alone. */
  done?: boolean
  /** The round, as the host has it. Only the host's copy counts. */
  round?: WireRound
  /** A guest asking for a seed. The host decides who got it. */
  claim?: number
  /** A guest asking to plant. The host decides whether it happened. */
  plant?: { row: number; col: number; id: DefenderId }
  /** Somebody newly arrived, asking where things stand. */
  ask?: boolean
}

/**
 * The round, small enough to send.
 *
 * Arrays of numbers rather than objects with names, because the relay refuses
 * anything over four kilobytes and a full lawn of ninety-six plants written
 * out longhand gets close enough to that to be worth not finding out in front
 * of somebody. An animal travels as its place in the catalogue.
 */
export interface WireRound {
  /** Seeds in the pot. */
  s: number
  /** Loose seeds: id, row, column, worth, seconds left. */
  l: [number, number, number, number, number][]
  /** Plants: row, column, index into `DEFENDERS`. */
  p: [number, number, number][]
}

function wholeNumber(value: unknown, most: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.floor(value)
  return rounded >= 0 && rounded <= most ? rounded : null
}

/**
 * Reads a round off the wire.
 *
 * The most dangerous thing in the protocol: a square off the edge of the lawn,
 * an animal that is not in the catalogue or a pot of NaN would all draw
 * something that cannot be clicked and cannot be cleared. Anything wrong
 * rejects the **whole** round rather than being patched up - half a lawn is
 * worse than a lawn that did not arrive, because the next one will.
 */
export function decodeRound(value: unknown): WireRound | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>

  const seeds = wholeNumber(raw.s, 1_000_000)
  if (seeds === null) return null

  if (!Array.isArray(raw.l) || !Array.isArray(raw.p)) return null
  if (raw.l.length > 64 || raw.p.length > GRID.rows * GRID.cols) return null

  const loose: WireRound['l'] = []
  for (const entry of raw.l) {
    if (!Array.isArray(entry) || entry.length !== 5) return null
    const id = wholeNumber(entry[0], Number.MAX_SAFE_INTEGER)
    const row = wholeNumber(entry[1], GRID.rows - 1)
    const col = wholeNumber(entry[2], GRID.cols - 1)
    const worth = wholeNumber(entry[3], 10_000)
    const left = typeof entry[4] === 'number' && Number.isFinite(entry[4]) ? entry[4] : null
    if (id === null || row === null || col === null || worth === null || left === null) return null
    loose.push([id, row, col, worth, Math.max(0, left)])
  }

  const plants: WireRound['p'] = []
  const seen = new Set<number>()
  for (const entry of raw.p) {
    if (!Array.isArray(entry) || entry.length !== 3) return null
    const row = wholeNumber(entry[0], GRID.rows - 1)
    const col = wholeNumber(entry[1], GRID.cols - 1)
    const kind = wholeNumber(entry[2], DEFENDERS.length - 1)
    if (row === null || col === null || kind === null) return null
    // Two animals in one square is a lawn that cannot be drawn.
    const square = row * GRID.cols + col
    if (seen.has(square)) return null
    seen.add(square)
    plants.push([row, col, kind])
  }

  return { s: seeds, l: loose, p: plants }
}

/**
 * Reads a message off the wire.
 *
 * As untrusted as everything else another browser sends, and rejecting the
 * whole message rather than half-reading it.
 */
export function decodeGoofs(message: Record<string, unknown>): GoofsMessage | null {
  if (message.t !== 'goofs') return null
  const out: GoofsMessage = {}

  if (message.hand !== undefined) {
    const hand = validHand(message.hand)
    if (!hand) return null
    out.hand = hand
  }

  if (message.done !== undefined) {
    if (typeof message.done !== 'boolean') return null
    out.done = message.done
  }

  if (message.round !== undefined) {
    const round = decodeRound(message.round)
    if (!round) return null
    out.round = round
  }

  if (message.claim !== undefined) {
    const claim = wholeNumber(message.claim, Number.MAX_SAFE_INTEGER)
    if (claim === null) return null
    out.claim = claim
  }

  if (message.plant !== undefined) {
    const want = message.plant as Record<string, unknown> | null
    if (!want || typeof want !== 'object') return null
    const row = wholeNumber(want.row, GRID.rows - 1)
    const col = wholeNumber(want.col, GRID.cols - 1)
    if (row === null || col === null || !isDefenderId(want.id)) return null
    out.plant = { row, col, id: want.id }
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

/** The round, packed small enough to send. */
export function toWire(round: Round): WireRound {
  return {
    s: Math.max(0, Math.floor(round.seeds)),
    l: round.loose.map((seed) => [
      seed.id,
      seed.row,
      seed.col,
      seed.worth,
      // Two decimals is a tenth of a frame, and the difference between a seed
      // and a seed is not worth the bytes.
      Math.round(Math.max(0, seed.left) * 100) / 100,
    ]),
    p: round.plants.map((plant) => [
      plant.row,
      plant.col,
      DEFENDERS.findIndex((animal) => animal.id === plant.id),
    ]),
  }
}

/**
 * The round, unpacked.
 *
 * Every index has already been through `decodeRound`, so this cannot be handed
 * an animal that is not in the catalogue or a square off the lawn.
 */
export function fromWire(wire: WireRound): Round {
  return {
    seeds: wire.s,
    loose: wire.l.map(([id, row, col, worth, left]) => ({ id, row, col, worth, left })),
    plants: wire.p.map(([row, col, kind]) => ({ row, col, id: DEFENDERS[kind].id })),
  }
}

/** An empty round with a full pot. What starting one looks like. */
export function freshRound(): Round {
  return emptyRound(GOOFS.startingSeeds)
}
