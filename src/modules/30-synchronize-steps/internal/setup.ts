/**
 * Putting a game together: who is on the tower.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order and staircase order - up to eight. Stand-ins fill in only when
 * there is nobody else, the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createGame, type Game } from './rules'

export { ME, myId }

export const SOLO_STEPPERS = 4
/** Eight colours, eight staircases. */
export const MAX_STEPPERS = 8

export function gameRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_STEPPERS, max: MAX_STEPPERS, standIn: (seat) => `stepper ${seat}` })
}

/** A seed for picks made for players who did not pick, and so an id to tell games apart. */
export const nextSeed = seedDealer('synchronize-steps')

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

/** A tower with nobody on it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.phase = 'choose'
  return game
}
