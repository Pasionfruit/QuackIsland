/**
 * Putting a game together: who is in the kitchen.
 *
 * **The people in the lobby are the cooks**, host first - roster order is colour
 * order, not turn order, which is dealt at random - up to eight. Stand-ins fill
 * in only when there is nobody else, the same rule as the other minigames.
 */
import { lobbyRoster, ME, myId, type Seat } from '../../68-minigame-kit'
import { createGame, type Game } from './rules'

export { ME, myId }

export const SOLO_COOKS = 4
/** Eight colours. */
export const MAX_COOKS = 8

export function gameRoster(): Seat[] {
  return lobbyRoster({ solo: SOLO_COOKS, max: MAX_COOKS, standIn: (seat) => `cook ${seat}` })
}

/**
 * A secret, for a seed or a game id.
 *
 * The seed decides every recipe. Built from anything a guest could guess, it
 * could be brute-forced and the answers known before the chef starts - so it
 * comes from `crypto`, as Probable Stop's does, and is never sent.
 */
export function secret(): number {
  const out = new Uint32Array(1)
  globalThis.crypto.getRandomValues(out)
  return out[0]
}

export interface GameSetup {
  seed?: number
  id?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

export function newGame({ seed = secret(), id = secret() || 1, roster = gameRoster(), me = myId() }: GameSetup = {}): Game {
  return createGame(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    id,
  )
}

/** A kitchen with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.phase = 'cooking'
  game.picks = []
  game.used = []
  return game
}
