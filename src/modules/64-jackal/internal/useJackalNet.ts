/**
 * The two ends of one shared lane.
 *
 * The **host** runs the round - the clock, its own player, the runner
 * stand-ins, every guest's move and the Sniper's shots, and the end - and
 * sends it fifteen times a second. A **guest** walks, aims and jumps on its
 * own screen - and, while it is the Sniper, judges its own shots against what
 * its screen shows, the same reason `32-hes-one-shot` does: whether a runner
 * was in the crosshair is a matter of pixels and milliseconds and cannot wait
 * for a round trip.
 *
 * The host takes a guest's position only as far as it could have walked since
 * it last heard, its height only as high as a jump goes, and a claimed hit
 * only if the host's own trace agrees - see `claim` in `rules.ts`. Nobody
 * loses a life, and the round is not over, until the host says so.
 *
 * The loop itself - the host/guest split, the pause, leavers, the clock
 * easing, how often each end speaks - is the arena base case,
 * `useArenaNet` in `68-minigame-kit`. What is here is only Jackal's rules
 * for it.
 */
import { useArenaNet, type ArenaRules } from '../../68-minigame-kit'
import { botSteer } from './ai'
import { claim, fire, judgeEnd, leave, look, moveSniper, report, tick, toggleScope, walkRunner, type Claim, type Round } from './rules'
import { applySnapshot, decodeMove, decodeShot, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot, type Snapshot } from './wire'

/** What your hands are doing this frame. */
export interface Hands {
  /** -1 to 1 each: S to W, A to D. */
  forward: number
  right: number
  yaw: number
  pitch: number
  /** Runner only: the jump key is held. */
  jump: boolean
  /** Sniper only: the right button is held - scoped in. */
  scoped: boolean
  /** Sniper only: the trigger was pulled since the last frame. */
  fire: boolean
}

export interface Advanced {
  changed: boolean
  /** The shot the local Sniper fired this frame, if one went off. */
  shot: { hit: number } | null
}

export interface JackalNet {
  advance(round: Round, dt: number, hands: Hands | null, paused: boolean): Advanced
}

type Heard = { round: number } & ({ kind: 'move'; x: number; z: number; y: number; yaw: number; pitch: number; scoped: boolean } | ({ kind: 'shot' } & Claim))

export const JACKAL_ARENA: ArenaRules<Round, Hands, Heard, Snapshot, { hit: number }> = {
  encodeSnapshot,
  decodeSnapshot,
  applySnapshot,
  decodeGuest(raw) {
    const move = decodeMove(raw)
    if (move) return { kind: 'move', ...move }
    const shot = decodeShot(raw)
    return shot ? { kind: 'shot', ...shot } : null
  },
  reportMove: (round, mine) => encodeMove(round.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, y: mine.y, scoped: mine.scoped }),
  tick,
  drive(round, me, hands, dt, authoritative, say) {
    const mine = round.players[me]
    look(round, me, hands.yaw, hands.pitch)
    if (mine.role !== 'sniper') {
      walkRunner(round, me, hands, dt)
      return null
    }
    toggleScope(round, me, hands.scoped)
    moveSniper(round, me, hands, dt)
    if (!hands.fire) return null
    const shot = fire(round, me, authoritative)
    if (shot && !authoritative) {
      const victim = shot.hit >= 0 ? round.players[shot.hit].id : null
      say(encodeShot(round.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, victim }))
    }
    return shot
  },
  bots: botSteer,
  hear(round, player, said, sinceLast) {
    if (said.kind === 'shot') claim(round, player, said)
    else report(round, player, said, said.yaw, said.pitch, sinceLast(), said.y, said.scoped)
  },
  leave,
  judgeEnd,
}

export function useJackalNet(): JackalNet {
  const link = useArenaNet(JACKAL_ARENA)
  return {
    advance(round, dt, hands, paused) {
      const { changed, out } = link.advance(round, dt, hands, paused)
      return { changed, shot: out }
    },
  }
}
