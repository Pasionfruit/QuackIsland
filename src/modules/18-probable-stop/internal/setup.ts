/**
 * Putting a game together: who is in it.
 *
 * **The people in the lobby are the players**, host first, read when the host
 * starts. Stand-ins fill in only when there is nobody else - the same rule as
 * the other minigames - so there is somebody to outlast.
 */
import { getNet, getPeers } from '../../09-net'
import { createGame, type Game } from './game'

/** What this browser's player is called when there is no lobby to name it. */
export const ME = 'you'

/** How many players there are when nobody else is. */
export const SOLO_PLAYERS = 4

export function myId(): string {
  return getNet().id ?? ME
}

/** Everybody in the lobby, host first, or you and three stand-ins. */
export function gameRoster(): { id: string; bot: boolean }[] {
  const net = getNet()
  const mine = myId()
  const others = getPeers().map((p) => p.id)
  if (net.status !== 'joined' || others.length === 0) {
    return [
      { id: mine, bot: false },
      ...Array.from({ length: SOLO_PLAYERS - 1 }, (_, i) => ({ id: `player ${i + 2}`, bot: true })),
    ]
  }
  return [mine, ...others].map((id) => ({ id, bot: false }))
}

/**
 * A secret, for a seed or a game id.
 *
 * **Not a reproducibility seed like the rest of the build's**, and that is
 * why it comes from `crypto` rather than from the world seed. The seed decides
 * which paths hold. Built from things a guest could guess - the world seed,
 * the lobby, the time - it could be brute-forced and the reveal known in
 * advance. A game played *from* a given seed is still exactly reproducible,
 * which is what the tests rely on.
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

export function newGame({ seed = secret(), id = secret(), roster = gameRoster(), me = myId() }: GameSetup = {}): Game {
  return createGame(
    seed,
    roster.map((entry) => ({ id: entry.id, bot: entry.bot, mine: entry.id === me })),
    id,
  )
}

/** A game with nobody in it yet, for a guest to hold until the host's first snapshot. */
export function waitingGame(): Game {
  return { seed: 0, id: 0, round: 0, phase: 'choosing', clock: 0, safe: [], players: [] }
}
