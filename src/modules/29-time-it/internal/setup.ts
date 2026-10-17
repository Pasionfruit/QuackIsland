/**
 * Putting a round together: who is on the stage.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody else,
 * the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createGame, type Game } from './rules'

export { ME, myId }

export const SOLO_TIMERS = 4
/** Eight colours, eight buttons. */
export const MAX_TIMERS = 8

export function gameRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_TIMERS, max: MAX_TIMERS, standIn: (seat) => `timer ${seat}` })
}

/** A seed for the target, and so an id to tell rounds apart. Not a secret: the target is on everybody's screen. */
export const nextSeed = seedDealer('time-it')

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

/** A stage with nobody on it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.over = false
  return game
}
