/**
 * Putting a game together: who is in the office.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order - up to eight, one to a desk. Stand-ins fill in only when there
 * is nobody else, the same rule as the other minigames.
 */
import { CONVENTIONS, hashSeed } from '../../00-core'
import { getNet, getPeers } from '../../09-net'
import { createGame, type Game } from './rules'

export const ME = 'you'
/** You and four stand-ins: enough that somebody gets armed before you do. */
export const SOLO_PLAYERS = 5
/** Eight desks, eight colours, eight players. */
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

/** A seed for the office, and so an id to tell games apart. */
export function nextSeed(): number {
  dealt += 1
  return hashSeed(CONVENTIONS.worldSeed, `i-just-work-here:${getNet().room ?? 'solo'}:${dealt}:${Date.now()}`)
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

/** An office with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, [], 0)
  game.over = false
  return game
}
