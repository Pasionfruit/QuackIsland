/**
 * Putting a round together: who is in it, and where they start.
 *
 * Separate from the rules so the rules never have to know where a roster came
 * from. Today it is you plus a few stand-in runners; when a round is synced
 * across a lobby it will be the people actually in it, and `newRound` is the
 * only thing that changes.
 */
import { ARENA, playerSpawns, zombieSpawns } from './arena'
import { createRound, type Round, type Spawn } from './round'

/** Who this browser is driving. Fixed, so the screen can always find itself. */
export const ME = 'you'

/**
 * How many runners are in the arena when it is just you.
 *
 * Zombie Tag is a game for two to eight. Four is the middle of that: enough
 * that the push has somebody to land on and that outlasting people means
 * something, few enough that the middle is not a scrum on the first frame.
 */
export const DEFAULT_RUNNERS = 4

export interface RoundSetup {
  /** How many players, including you. Two to eight. */
  players?: number
  /** How many zombies the round opens with. */
  zombies?: number
}

/**
 * A fresh round: everybody in the middle, the zombies spread round the outside.
 *
 * The first player in the roster is yours. The rest are named by number, and
 * nothing anywhere cares which is which - see `ai.ts` for why that matters.
 */
export function newRound({
  players = DEFAULT_RUNNERS,
  zombies = ARENA.zombies,
}: RoundSetup = {}): Round {
  const heads = Math.max(1, Math.min(8, Math.round(players)))
  const spawns: Spawn[] = []

  playerSpawns(heads).forEach((at, i) => {
    spawns.push({ id: i === 0 ? ME : `runner ${i}`, at, side: 'player', mine: i === 0 })
  })

  zombieSpawns(Math.max(0, Math.round(zombies))).forEach((at, i) => {
    spawns.push({ id: `zombie ${i + 1}`, at, side: 'zombie' })
  })

  return createRound(spawns)
}
