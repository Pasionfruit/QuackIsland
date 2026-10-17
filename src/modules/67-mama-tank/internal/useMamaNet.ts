/**
 * The two ends of one shared field.
 *
 * The **host** runs the round - the clock, its own player, the mini-tank
 * stand-ins, every guest's move and shot, run-over, and the end - and sends
 * it fifteen times a second. A **guest** walks and aims on its own screen -
 * whichever role it is playing - and judges its own shot against what its
 * screen shows: the same reason `32-hes-one-shot` and `64-jackal` both do,
 * whether a target was in the crosshair is a matter of pixels and
 * milliseconds and cannot wait for a round trip.
 *
 * The host takes a guest's position only as far as it could have moved
 * since it last heard, and a claimed hit only if the host's own trace
 * agrees - see `claim` in `rules.ts`. Nobody is hit, run over, or the round
 * over, until the host says so. **Run-over needs no wire message at all**:
 * it is host-derived every tick straight off positions already trusted.
 *
 * The loop itself - the host/guest split, the pause, leavers, the clock
 * easing, how often each end speaks - is the arena base case,
 * `useArenaNet` in `68-minigame-kit`. What is here is only Mama Tank's rules
 * for it.
 */
import { useArenaNet, type ArenaRules } from '../../68-minigame-kit'
import { botSteer } from './ai'
import { claim, fire, judgeEnd, leave, look, report, runOver, tick, walk, type Claim, type Round, type Shot } from './rules'
import { applySnapshot, decodeMove, decodeShot, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot, type Snapshot } from './wire'

/** What your hands are doing this frame. */
export interface Hands {
  /** -1 to 1 each: S to W, A to D. */
  forward: number
  right: number
  yaw: number
  pitch: number
  /** The trigger was pulled since the last frame. */
  fire: boolean
}

export interface Advanced {
  changed: boolean
  /** The shot you fired this frame, if one went off. */
  shot: Shot | null
}

export interface MamaNet {
  advance(round: Round, dt: number, hands: Hands | null, paused: boolean): Advanced
}

type Heard = { round: number } & ({ kind: 'move'; x: number; z: number; yaw: number; pitch: number } | ({ kind: 'shot' } & Claim))

export const MAMA_ARENA: ArenaRules<Round, Hands, Heard, Snapshot, Shot> = {
  encodeSnapshot,
  decodeSnapshot,
  applySnapshot,
  decodeGuest(raw) {
    const move = decodeMove(raw)
    if (move) return { kind: 'move', ...move }
    const shot = decodeShot(raw)
    return shot ? { kind: 'shot', ...shot } : null
  },
  reportMove: (round, mine) => encodeMove(round.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch }),
  tick,
  drive(round, me, hands, dt, authoritative, say) {
    const mine = round.players[me]
    look(round, me, hands.yaw, hands.pitch)
    walk(round, me, hands, dt)
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
    else report(round, player, said, said.yaw, said.pitch, sinceLast())
  },
  // Whoever Mama Tank has driven over this frame, off positions already settled above.
  settle: runOver,
  leave,
  judgeEnd,
}

export function useMamaNet(): MamaNet {
  const link = useArenaNet(MAMA_ARENA)
  return {
    advance(round, dt, hands, paused) {
      const { changed, out } = link.advance(round, dt, hands, paused)
      return { changed, shot: out }
    },
  }
}
