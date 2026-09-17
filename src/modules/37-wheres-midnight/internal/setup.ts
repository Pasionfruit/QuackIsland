/**
 * Putting a round together: who is searching.
 *
 * **The people in the lobby are the seekers**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody else,
 * the same rule as the other minigames.
 */
import { CONVENTIONS, hashSeed } from '../../00-core'
import { getNet, getPeers } from '../../09-net'
import { createGame, type Game } from './rules'

export const ME = 'you'
export const SOLO_SEEKERS = 4
export const MAX_SEEKERS = 8

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
      ...Array.from({ length: SOLO_SEEKERS - 1 }, (_, i) => ({ id: `seeker ${i + 2}`, bot: true })),
    ]
  }
  return [mine, ...others].slice(0, MAX_SEEKERS).map((id) => ({ id, bot: false }))
}

let dealt = 0

/** A new junkyard, and an id to tell rounds apart. Not a secret: every browser draws where she is. */
export function nextSeed(): number {
  dealt += 1
  return hashSeed(CONVENTIONS.worldSeed, `wheres-midnight:${getNet().room ?? 'solo'}:${dealt}:${Date.now()}`)
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

/** A search with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  return { seed: 0, id: 0, elapsed: 0, over: false, players: [] }
}
