/**
 * Putting a round together: who is in the field.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody else,
 * the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createGame, type Game } from './rules'

export { ME, myId }

export const SOLO_WHACKERS = 4
/** Eight colours. */
export const MAX_WHACKERS = 8

export function gameRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_WHACKERS, max: MAX_WHACKERS, standIn: (seat) => `whacker ${seat}` })
}

/**
 * A seed for the moles, and so an id to tell rounds apart. Nothing secret:
 * every browser draws the same moles from it, and knowing when a mole comes up
 * does not walk you over to it.
 */
export const nextSeed = seedDealer('wack-attack')

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

/** A field with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.over = false
  return game
}
