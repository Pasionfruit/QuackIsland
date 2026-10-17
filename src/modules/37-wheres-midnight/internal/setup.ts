/**
 * Putting a round together: who is searching.
 *
 * **The people in the lobby are the seekers**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody else,
 * the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createGame, type Game } from './rules'

export { ME, myId }

export const SOLO_SEEKERS = 4
export const MAX_SEEKERS = 8

export function gameRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_SEEKERS, max: MAX_SEEKERS, standIn: (seat) => `seeker ${seat}` })
}

/** A new junkyard, and an id to tell rounds apart. Not a secret: every browser draws where he is. */
export const nextSeed = seedDealer('wheres-midnight')

export interface GameSetup {
  seed?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

export function newGame({ seed = nextSeed(), roster = gameRoster(), me = myId() }: GameSetup = {}): Game {
  return createGame(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    seed || 1,
  )
}

/** A search with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  return { seed: 0, id: 0, elapsed: 0, over: false, players: [] }
}
