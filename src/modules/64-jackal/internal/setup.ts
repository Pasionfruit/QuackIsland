/**
 * Putting a round together: who is in the lane, and who is the Sniper.
 *
 * **The people in the lobby are the players**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody
 * else, the same rule as the other minigames, and **a stand-in never plays
 * the Sniper**: alone, the human is the 1 and the stand-ins rush the tower.
 */
import { CONVENTIONS, hashSeed } from '../../00-core'
import { getNet, getPeers } from '../../09-net'
import { getTheOne } from '../../15-minigames'
import { createRound, type Round } from './rules'

export const ME = 'you'
/** You and four stand-ins: enough that the tower's defence is worth testing alone. */
export const SOLO_PLAYERS = 5
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
      ...Array.from({ length: SOLO_PLAYERS - 1 }, (_, i) => ({ id: `runner ${i + 2}`, bot: true })),
    ]
  }
  return [mine, ...others].slice(0, MAX_PLAYERS).map((id) => ({ id, bot: false }))
}

let dealt = 0

/** A seed for the lane, and so an id to tell rounds apart. */
export function nextSeed(): number {
  dealt += 1
  return hashSeed(CONVENTIONS.worldSeed, `jackal:${getNet().room ?? 'solo'}:${dealt}:${Date.now()}`)
}

export interface RoundSetup {
  seed?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
  /** Who the host has said is the 1 - `getTheOne()` by default; alone, nobody has, so the roster's first (the human) is it. */
  chosen?: string | null
}

export function newRound({ seed = nextSeed(), roster = gameRoster(), me = myId(), chosen = getTheOne() }: RoundSetup = {}): Round {
  return createRound(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    chosen,
    seed || 1,
  )
}

/** A lane with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingRound(): Round {
  return createRound(0, [], null, 0)
}
