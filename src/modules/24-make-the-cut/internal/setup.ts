/**
 * Putting a game together: who is on the tower.
 *
 * **The people in the lobby are the cutters**, host first - roster order is
 * colour order and turn order, from a random first cutter - up to eight.
 * Stand-ins fill in only when there is nobody else, the same rule as the other
 * minigames.
 */
import { getNet, getPeers } from '../../09-net'
import { createGame, type Game } from './rules'

export const ME = 'you'
export const SOLO_CUTTERS = 4
/** Eight colours. */
export const MAX_CUTTERS = 8

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
      ...Array.from({ length: SOLO_CUTTERS - 1 }, (_, i) => ({ id: `cutter ${i + 2}`, bot: true })),
    ]
  }
  return [mine, ...others].slice(0, MAX_CUTTERS).map((id) => ({ id, bot: false }))
}

/**
 * A secret, for which strings eliminate and who goes first. From `crypto`, as
 * Probable Stop's is: built from anything a guest could guess, the eliminating
 * strings could be worked out before a single cut.
 */
export function secret(): number {
  const out = new Uint32Array(1)
  globalThis.crypto.getRandomValues(out)
  return out[0]
}

export interface GameSetup {
  seed?: number
  luck?: number
  id?: number
  roster?: readonly { id: string; bot: boolean }[]
  me?: string
}

export function newGame({ seed = secret(), luck = secret(), id = secret() || 1, roster = gameRoster(), me = myId() }: GameSetup = {}): Game {
  return createGame(
    seed,
    luck,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    id,
  )
}

/** A tower with nobody on it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  const game = createGame(0, 0, [], 0)
  game.phase = 'draw'
  return game
}
