/**
 * Putting a round together: who is on the iceberg.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody
 * else, the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createRound, createTiles, type Round } from './rules'

export { ME, myId }

export const SOLO_PLAYERS = 4
/** Eight colours, eight starting spots round the top layer. */
export const MAX_PLAYERS = 8

export function roundRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_PLAYERS, max: MAX_PLAYERS, standIn: (seat) => `skater ${seat}` })
}

/** A seed for the stand-ins' timing, and an id to tell rounds apart. Nothing secret. */
export const nextSeed = seedDealer('breaking-the-ice')

export interface RoundSetup {
  seed?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

export function newRound({ seed = nextSeed(), roster = roundRoster(), me = myId() }: RoundSetup = {}): Round {
  return createRound(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    seed || 1,
  )
}

/** An iceberg with nobody on it yet, for a guest to hold until the host's first snapshot. */
export function waitingRound(): Round {
  return { seed: 0, id: 0, tiles: createTiles(), players: [], elapsed: 0, decidedAt: null, over: false }
}
