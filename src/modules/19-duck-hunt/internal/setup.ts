/**
 * Putting a game together: who is in it, and which balloons.
 *
 * **The people in the lobby are the players**, host first, and the roster order
 * is the colour order - player 0 is red with a dot, player 1 blue with a
 * triangle. Stand-ins fill in only when there is nobody else.
 */
import { lobbyRoster, ME, myId, seedDealer, type Seat } from '../../68-minigame-kit'
import { createGame, type Game } from './game'

export { ME, myId }

export const SOLO_PLAYERS = 4
/** Eight colours, eight shapes: the most a game can tell apart. */
export const MAX_PLAYERS = 8

/** Everybody in the lobby, host first - at most eight - or you and three stand-ins. */
export function gameRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_PLAYERS, max: MAX_PLAYERS, standIn: (seat) => `player ${seat}` })
}

/**
 * A seed for the next game's balloons. From the world seed, like everything
 * reproducible - where a balloon will be is no secret; it does not aim for you.
 */
export const nextSeed = seedDealer('duck-hunt')

export interface GameSetup {
  seed?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

export function newGame({ seed = nextSeed(), roster = gameRoster(), me = myId() }: GameSetup = {}): Game {
  return createGame(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    // The seed tells games apart well enough here: nothing hangs on keeping it.
    seed || 1,
  )
}

/** A game with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  return { seed: 0, id: 0, elapsed: 0, over: false, players: [], balloons: [], popped: new Map() }
}
