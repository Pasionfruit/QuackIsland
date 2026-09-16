/**
 * Putting a round together: who is in it, and where they start.
 *
 * Separate from the rules so the rules never have to know where a roster came
 * from. **The people in the lobby are the people in the arena** - the host
 * builds the roster from who is actually there when they press play, and the
 * stand-in runners only fill seats nobody is sitting in.
 */
import { getNet, getPeers } from '../../09-net'
import { ARENA, playerSpawns, zombieSpawns } from './arena'
import { createRound, type Round, type Spawn } from './round'

/** What this browser's own body is called when there is no lobby to name it. */
export const ME = 'you'

/**
 * How many bodies are in the arena when nobody else is.
 *
 * Zombie Tag is a game for two to eight, and pushing another player and
 * outlasting them are half the rules. Alone, there would be nothing to push
 * and nothing to outlast, so the empty seats are filled. With a lobby, they
 * are not: real people are better opponents than these are.
 */
export const SOLO_RUNNERS = 4

/** What this browser is called in a round: its lobby id, or `ME` when alone. */
export function myId(): string {
  return getNet().id ?? ME
}

export interface RoundSetup {
  /** Everybody playing, by id. The first is the host. */
  ids?: readonly string[]
  /** Which of them is this browser. */
  me?: string
  /** How many zombies the round opens with. */
  zombies?: number
}

/**
 * Everybody in the lobby, host first, or a solo roster when there is nobody
 * else.
 *
 * Read at the moment the host presses play rather than kept up to date:
 * somebody arriving mid-round is a spectator until the next one, which is far
 * better than a body appearing in the middle of a chase.
 *
 * **A lobby of one is solo.** Somebody who made a lobby and is waiting for
 * friends is still the only person in it, and a roster of one is a round that
 * ends on its first frame - one survivor is already a winner.
 */
export function lobbyRoster(): string[] {
  const net = getNet()
  const mine = myId()
  // Already in id order, compared as numbers - see `09-net`.
  const others = getPeers().map((p) => p.id)
  if (net.status !== 'joined' || others.length === 0) {
    return [mine, ...Array.from({ length: SOLO_RUNNERS - 1 }, (_, i) => `runner ${i + 1}`)]
  }
  // The host first. Only the host deals a round, so this is the order the
  // spawn ring is handed out in.
  return [mine, ...others]
}

/**
 * A fresh round: everybody in the middle, the zombies spread round the outside.
 *
 * `mine` is set from `me` rather than from position, because in a lobby the
 * body that is yours is wherever your id landed in the roster.
 */
export function newRound({
  ids = lobbyRoster(),
  me = myId(),
  zombies = ARENA.zombies,
}: RoundSetup = {}): Round {
  const heads = Math.max(1, Math.min(8, ids.length))
  const playing = ids.slice(0, heads)
  const spawns: Spawn[] = []

  playerSpawns(playing.length).forEach((at, i) => {
    spawns.push({ id: playing[i], at, side: 'player', mine: playing[i] === me })
  })

  zombieSpawns(Math.max(0, Math.round(zombies))).forEach((at, i) => {
    spawns.push({ id: `zombie ${i + 1}`, at, side: 'zombie' })
  })

  return createRound(spawns)
}

/**
 * An arena with nobody in it yet.
 *
 * What a guest starts with. The host's first snapshot is a frame or two away
 * and fills it; drawing a guessed roster in the meantime would mean bodies
 * appearing and then jumping as the real ones arrived.
 */
export function emptyRound(): Round {
  return createRound([])
}
