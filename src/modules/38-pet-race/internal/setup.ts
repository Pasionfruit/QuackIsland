/**
 * Putting a race together: who is on the line.
 *
 * **The people in the lobby are the racers**, host first - roster order is
 * colour order and lane order - up to eight. Stand-ins fill in only when there
 * is nobody else, the same rule as the other minigames. Alone it is you and
 * four of them, which is a five-lane race and one of most of the pets.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createGame, type Game } from './rules'

export { ME, myId }

export const SOLO_RACERS = 5
/** Eight colours, eight lanes. */
export const MAX_RACERS = 8

export function gameRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_RACERS, max: MAX_RACERS, standIn: (seat) => `stand-in ${seat}` })
}

/** A seed for the course and for what the stand-ins pick, and so an id to tell races apart. */
export const nextSeed = seedDealer('pet-race')

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

/** A course with nobody on it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.over = false
  return game
}
