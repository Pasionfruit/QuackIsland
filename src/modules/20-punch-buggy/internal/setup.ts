/**
 * Putting a round together: who is on the platform.
 *
 * **The people in the lobby are the fighters**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody else,
 * the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createRound, type Round } from './rules'

export { ME, myId }

export const SOLO_FIGHTERS = 4
/** Eight colours, eight starting spots on the ring. */
export const MAX_FIGHTERS = 8

export function roundRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_FIGHTERS, max: MAX_FIGHTERS, standIn: (seat) => `fighter ${seat}` })
}

/** A seed for the stand-ins' timing, and an id to tell rounds apart. Nothing secret. */
export const nextSeed = seedDealer('punch-buggy')

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

/** A platform with nobody on it yet, for a guest to hold until the host's first snapshot. */
export function waitingRound(): Round {
  return { seed: 0, id: 0, fighters: [], elapsed: 0, decidedAt: null, over: false }
}
