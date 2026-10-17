/**
 * The two ends of one shared maze.
 *
 * The **host** runs the round - the clock, its own player, the Hider
 * stand-ins, every guest's move, the catch, and the end - and sends it the
 * same cadence Jackal does. A **guest** walks and looks on its own screen,
 * and reports where it ended up; the host takes that only as far as it could
 * have walked since it last heard, and re-collides it against the maze - see
 * `report` in `rules.ts`.
 *
 * **There is nothing to claim.** A catch is host-derived every tick straight
 * off positions already trusted, so the wire here is strictly smaller than
 * Jackal's: one snapshot, one move report.
 *
 * The loop itself - the host/guest split, the pause, leavers, the clock
 * easing, how often each end speaks - is the arena base case,
 * `useArenaNet` in `68-minigame-kit`. What is here is only this game's rules
 * for it.
 */
import { useArenaNet, type ArenaRules } from '../../68-minigame-kit'
import { botSteer } from './ai'
import { catchHiders, hunterOf, judgeEnd, leave, look, report, tick, walkHider, walkHunter, type Round } from './rules'
import { applySnapshot, decodeMove, decodeSnapshot, encodeMove, encodeSnapshot, type Snapshot } from './wire'

/** What your hands are doing this frame. */
export interface Hands {
  /** -1 to 1 each: S to W, A to D. */
  forward: number
  right: number
  yaw: number
  pitch: number
  /** Hunter only: Shift is held. */
  sprint: boolean
}

export interface Advanced {
  changed: boolean
}

export interface NearNet {
  advance(round: Round, dt: number, hands: Hands | null, paused: boolean): Advanced
}

type Heard = { round: number; x: number; z: number; yaw: number; pitch: number; sprint: boolean }

export const NEAR_ARENA: ArenaRules<Round, Hands, Heard, Snapshot, never> = {
  encodeSnapshot,
  decodeSnapshot,
  applySnapshot,
  decodeGuest: decodeMove,
  reportMove: (round, mine) => encodeMove(round.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, sprint: mine.sprinting }),
  tick,
  drive(round, me, hands, dt) {
    look(round, me, hands.yaw, hands.pitch)
    if (round.players[me].role === 'hunter') walkHunter(round, me, hands, dt)
    else walkHider(round, me, hands, dt)
    return null
  },
  bots: (round, dt) => botSteer(round, hunterOf(round), dt),
  hear: (round, player, said, sinceLast) => report(round, player, said, said.yaw, said.pitch, sinceLast(), said.sprint),
  settle: catchHiders,
  leave,
  judgeEnd,
}

export function useNearNet(): NearNet {
  return useArenaNet(NEAR_ARENA)
}
