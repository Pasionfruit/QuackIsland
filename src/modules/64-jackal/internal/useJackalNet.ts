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
 * The same lessons as the other minigames: a guest keeps listening after the
 * round ends; somebody who leaves the lobby is out; a pause stops the round
 * for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { claim, fire, judgeEnd, leave, look, moveSniper, report, tick, toggleScope, walkRunner, type Claim, type Round } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeMove, decodeShot, decodeSnapshot, encodeMove, encodeShot, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 66
const REPORT_MS = 50
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

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

type Heard = { from: string; round: number } & ({ kind: 'move'; x: number; z: number; y: number; yaw: number; pitch: number; scoped: boolean } | ({ kind: 'shot' } & Claim))

export function useJackalNet(): JackalNet {
  const heard = useRef<Heard[]>([])
  const heardAt = useRef(new Map<string, number>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const reportedAt = useRef(0)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const move = decodeMove(raw)
        if (move) {
          heard.current.push({ from, kind: 'move', ...move })
          return
        }
        const shot = decodeShot(raw)
        if (shot) heard.current.push({ from, kind: 'shot', ...shot })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (round: Round, dt: number, hands: Hands | null, paused: boolean): Advanced => {
    const net = getNet()
    const now = performance.now()
    let shot: { hit: number } | null = null

    // A pause is shared: the round stops dead for everybody, the host's own
    // simulation included, so a round never carries on behind the card. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return { changed: false, shot }

    if (net.host) {
      if (round.players.length === 0) return { changed: false, shot }
      tick(round, dt)
      const me = round.players.findIndex((p) => p.mine)
      const mine = round.players[me]
      if (mine && hands && !round.over) {
        look(round, me, hands.yaw, hands.pitch)
        if (mine.role === 'sniper') {
          toggleScope(round, me, hands.scoped)
          moveSniper(round, me, hands, dt)
          if (hands.fire) shot = fire(round, me, true)
        } else {
          walkRunner(round, me, hands, dt)
        }
      }
      botSteer(round, dt)
      for (const said of heard.current.splice(0)) {
        const player = round.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.round !== round.id) continue
        if (said.kind === 'shot') {
          claim(round, player, said)
          continue
        }
        const key = `${round.id}:${said.from}`
        const last = heardAt.current.get(key) ?? 0
        report(round, player, said, said.yaw, said.pitch, round.elapsed - last, said.y, said.scoped)
        heardAt.current.set(key, round.elapsed)
      }
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        round.players.forEach((p, index) => {
          if (!p.bot && !p.mine && !p.left && !here.has(p.id)) leave(round, index)
        })
      }
      judgeEnd(round)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(round))
      }
      return { changed: true, shot }
    }

    // A guest. The host's word first, then the clock, then our own hands.
    const heardFrom = latest.current
    const before = round.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(round, heardFrom.snap, myId())
    }
    if (round.players.length === 0) return { changed: false, shot }

    tick(round, dt)
    if (heardFrom && !round.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = round.elapsed
      round.elapsed =
        before !== round.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }

    const me = round.players.findIndex((p) => p.mine)
    const mine = round.players[me]
    if (mine && hands && !round.over) {
      look(round, me, hands.yaw, hands.pitch)
      if (mine.role === 'sniper') {
        toggleScope(round, me, hands.scoped)
        moveSniper(round, me, hands, dt)
        if (hands.fire) {
          shot = fire(round, me, false)
          if (shot) {
            const victim = shot.hit >= 0 ? round.players[shot.hit].id : null
            sendToRoom(encodeShot(round.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, victim }))
          }
        }
      } else {
        walkRunner(round, me, hands, dt)
      }
    }
    if (mine && !round.over && now - reportedAt.current >= REPORT_MS) {
      reportedAt.current = now
      sendToRoom(encodeMove(round.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, y: mine.y, scoped: mine.scoped }))
    }
    return { changed: true, shot }
  }

  return { advance }
}
