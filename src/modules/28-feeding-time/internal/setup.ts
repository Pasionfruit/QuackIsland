/**
 * Putting a round together: who stands on the bank.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order and bank order - up to eight. Stand-ins fill in only when there
 * is nobody else, the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createGame, type Game } from './rules'

export { ME, myId }

export const SOLO_FEEDERS = 4
/** Eight colours, eight spots on the bank. */
export const MAX_FEEDERS = 8

export function gameRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_FEEDERS, max: MAX_FEEDERS, standIn: (seat) => `feeder ${seat}` })
}

/** A seed for the ducks, and so an id to tell rounds apart. Not a secret: every browser draws the ducks. */
export const nextSeed = seedDealer('feeding-time')

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

/** A pond with nobody at it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.over = false
  return game
}
