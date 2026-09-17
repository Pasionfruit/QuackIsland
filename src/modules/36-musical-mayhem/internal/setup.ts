/**
 * Putting a game together: who is on the floor.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody else,
 * the same rule as the other minigames. Alone it is you and five stand-ins: five
 * rounds of musical chairs.
 */
import { CONVENTIONS, hashSeed } from '../../00-core'
import { getNet, getPeers } from '../../09-net'
import { createGame, type Game } from './rules'

export const ME = 'you'
export const SOLO_PLAYERS = 6
/** Eight colours, eight players. */
export const MAX_PLAYERS = 8

export function myId(): string {
  return getNet().id ?? ME
}

export function gameRoster(): { id: string; bot: boolean }[] {
  const net = getNet()
  const mine = myId()
  const others = getPeers().map((p) => p.id)
  if (net.status !== 'joined' || others.length === 0) {
    return [
      { id: mine, bot: false },
      ...Array.from({ length: SOLO_PLAYERS - 1 }, (_, i) => ({ id: `stand-in ${i + 2}`, bot: true })),
    ]
  }
  return [mine, ...others].slice(0, MAX_PLAYERS).map((id) => ({ id, bot: false }))
}

let dealt = 0

/** A seed for how long the music plays. It is a secret: it never goes on the wire. */
export function nextSeed(): number {
  dealt += 1
  return hashSeed(CONVENTIONS.worldSeed, `musical-mayhem:${getNet().room ?? 'solo'}:${dealt}:${Date.now()}`)
}

/**
 * The id copies of one game agree on.
 *
 * A hash of the seed rather than the seed itself, because the id is sent and the
 * seed must not be: `musicFor` turns the seed into the exact moment the music
 * stops, and a guest able to work that out has no game left to play. A hash runs
 * one way only, so copies can still tell one game from the next.
 */
export function gameId(seed: number): number {
  return hashSeed(seed, 'musical-mayhem:id') || 1
}

export interface GameSetup {
  seed?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

export function newGame({ seed = nextSeed(), roster = gameRoster(), me = myId() }: GameSetup = {}): Game {
  return createGame(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    gameId(seed),
  )
}

/** A floor with nobody on it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.over = false
  return game
}
