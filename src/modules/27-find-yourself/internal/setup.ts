/**
 * Putting a game together: whose face goes under a cup.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody else,
 * the same rule as the other minigames.
 */
import { CONVENTIONS, hashSeed } from '../../00-core'
import { getNet, getPeers } from '../../09-net'
import { createGame, type Game } from './rules'

export const ME = 'you'
export const SOLO_FINDERS = 4
/** Eight colours. */
export const MAX_FINDERS = 8

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
      ...Array.from({ length: SOLO_FINDERS - 1 }, (_, i) => ({ id: `player ${i + 2}`, bot: true })),
    ]
  }
  return [mine, ...others].slice(0, MAX_FINDERS).map((id) => ({ id, bot: false }))
}

let dealt = 0

/**
 * A seed for the faces and the shuffles, and so an id to tell games apart. Not
 * a secret: every browser animates the same shuffle from it, and a browser that
 * can animate a shuffle can follow it.
 */
export function nextSeed(): number {
  dealt += 1
  return hashSeed(CONVENTIONS.worldSeed, `find-yourself:${getNet().room ?? 'solo'}:${dealt}:${Date.now()}`)
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
    seed || 1,
  )
}

/** A table with nobody at it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.phase = 'show'
  return game
}
