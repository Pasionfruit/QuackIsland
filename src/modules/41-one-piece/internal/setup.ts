/**
 * Putting a game together: who is playing.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody else,
 * the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createGame, type Game } from './rules'

export { ME, myId }

export const SOLO_PLAYERS = 4
/** Eight colours, eight players. */
export const MAX_PLAYERS = 8

export function gameRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_PLAYERS, max: MAX_PLAYERS, standIn: (seat) => `puzzler ${seat}` })
}

/** A seed for the table - where the pieces start and how they are turned - and so an id to tell games apart. */
export const nextSeed = seedDealer('one-piece')

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

/** A game with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.over = false
  return game
}
