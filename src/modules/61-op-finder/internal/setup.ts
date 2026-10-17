/**
 * Putting a round together: who is racing.
 *
 * **The people in the lobby are the racers**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody
 * else, the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createRound, type Round } from './rules'

export { ME, myId }

export const SOLO_PLAYERS = 4
export const MAX_PLAYERS = 8

export function roundRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_PLAYERS, max: MAX_PLAYERS, standIn: (seat) => `solver ${seat}` })
}

/** A seed for the challenges and the stand-ins' timing, and an id to tell rounds apart. Nothing secret. */
export const nextSeed = seedDealer('op-finder')

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

/** A round with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingRound(): Round {
  return { seed: 0, id: 0, players: [], elapsed: 0, decidedAt: null, over: false }
}
