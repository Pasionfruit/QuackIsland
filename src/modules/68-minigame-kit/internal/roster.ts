/**
 * Who is playing, and a seed to play with - the part of every minigame's
 * `setup.ts` that was the same forty-one times over.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody
 * else: offline, or alone in a room. That rule is the same for every game, so
 * it lives here once; what a game still decides is how many stand-ins it
 * wants alone and what they are called.
 */
import { CONVENTIONS, hashSeed } from '../../00-core'
import { getNet, getPeers } from '../../09-net'

/** Your id when there is no room to have been given one by. */
export const ME = 'you'
/** Eight colours, eight players. */
export const MAX_PLAYERS = 8

/** One place at the table: a person, or a stand-in. */
export interface Seat {
  id: string
  bot: boolean
}

/** A seat, as a round is dealt it: with whether it is this browser's. */
export interface Entrant extends Seat {
  mine: boolean
}

export interface RosterRule {
  /** How many players a game wants when you are on your own, you included. */
  solo: number
  /** The stand-in in seat `seat`, counting you as seat 1 - so the first stand-in is seat 2. */
  standIn: (seat: number) => string
  /** At most this many people from the lobby. */
  max?: number
}

export function myId(): string {
  return getNet().id ?? ME
}

/** The lobby, or you and stand-ins when the lobby is only you. */
export function lobbyRoster({ solo, standIn, max = MAX_PLAYERS }: RosterRule): Seat[] {
  const net = getNet()
  const mine = myId()
  const others = getPeers().map((p) => p.id)
  if (net.status !== 'joined' || others.length === 0) {
    return [{ id: mine, bot: false }, ...Array.from({ length: Math.max(0, solo - 1) }, (_, i) => ({ id: standIn(i + 2), bot: true }))]
  }
  return [mine, ...others].slice(0, max).map((id) => ({ id, bot: false }))
}

/** A roster, marked with which seat is this browser's. */
export function entrantsOf(roster: readonly Seat[], me: string): Entrant[] {
  return roster.map((seat) => ({ id: seat.id, bot: seat.bot, mine: seat.id === me }))
}

/**
 * A seed dealer for one game: each call is a fresh seed, and so an id to tell
 * rounds apart. Mixed from the world seed, the room, a count and the clock -
 * reproducible from those, and never the same twice in one sitting.
 */
export function seedDealer(game: string): () => number {
  let dealt = 0
  return () => {
    dealt += 1
    return hashSeed(CONVENTIONS.worldSeed, `${game}:${getNet().room ?? 'solo'}:${dealt}:${Date.now()}`)
  }
}
