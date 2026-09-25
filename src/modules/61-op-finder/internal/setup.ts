/**
 * Putting a round together: who is racing.
 *
 * **The people in the lobby are the racers**, host first - roster order is
 * colour order - up to eight. Stand-ins fill in only when there is nobody
 * else, the same rule as the other minigames.
 */
import { CONVENTIONS, hashSeed } from '../../00-core'
import { getNet, getPeers } from '../../09-net'
import { createRound, type Round } from './rules'

export const ME = 'you'
export const SOLO_PLAYERS = 4
export const MAX_PLAYERS = 8

export function myId(): string {
  return getNet().id ?? ME
}

export function roundRoster(): { id: string; bot: boolean }[] {
  const net = getNet()
  const mine = myId()
  const others = getPeers().map((p) => p.id)
  if (net.status !== 'joined' || others.length === 0) {
    return [
      { id: mine, bot: false },
      ...Array.from({ length: SOLO_PLAYERS - 1 }, (_, i) => ({ id: `solver ${i + 2}`, bot: true })),
    ]
  }
  return [mine, ...others].slice(0, MAX_PLAYERS).map((id) => ({ id, bot: false }))
}

let dealt = 0

/** A seed for the challenges and the stand-ins' timing, and an id to tell rounds apart. Nothing secret. */
export function nextSeed(): number {
  dealt += 1
  return hashSeed(CONVENTIONS.worldSeed, `op-finder:${getNet().room ?? 'solo'}:${dealt}:${Date.now()}`)
}

export interface RoundSetup {
  seed?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

export function newRound({ seed = nextSeed(), roster = roundRoster(), me = myId() }: RoundSetup = {}): Round {
  return createRound(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    seed || 1,
  )
}

/** A round with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingRound(): Round {
  return { seed: 0, id: 0, players: [], elapsed: 0, decidedAt: null, over: false }
}
