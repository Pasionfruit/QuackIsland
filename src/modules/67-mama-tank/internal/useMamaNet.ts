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
 * The same lessons as every other synced minigame: a guest keeps listening
 * after the round ends; somebody who leaves the lobby is out; a pause stops
 * the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { claim, fire, judgeEnd, leave, look, report, runOver, tick, walk, type Claim, type Round, type Shot } from './rules'
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

type Heard = { from: string; round: number } & ({ kind: 'move'; x: number; z: number; yaw: number; pitch: number } | ({ kind: 'shot' } & Claim))

export function useMamaNet(): MamaNet {
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
    let shot: Shot | null = null

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
        walk(round, me, hands, dt)
        if (hands.fire) shot = fire(round, me, true)
      }
      botSteer(round, dt)
      // In the order they arrived, so a guest's last step comes before a shot it took from there.
      for (const said of heard.current.splice(0)) {
        const player = round.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.round !== round.id) continue
        if (said.kind === 'shot') {
          claim(round, player, said)
          continue
        }
        const key = `${round.id}:${said.from}`
        const last = heardAt.current.get(key) ?? 0
        report(round, player, said, said.yaw, said.pitch, round.elapsed - last)
        heardAt.current.set(key, round.elapsed)
      }
      // Whoever Mama Tank has driven over this frame, off positions already settled above.
      runOver(round)
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
      walk(round, me, hands, dt)
      if (hands.fire) {
        shot = fire(round, me, false)
        if (shot) {
          const victim = shot.hit >= 0 ? round.players[shot.hit].id : null
          sendToRoom(encodeShot(round.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, victim }))
        }
      }
    }
    if (mine && !round.over && now - reportedAt.current >= REPORT_MS) {
      reportedAt.current = now
      sendToRoom(encodeMove(round.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch }))
    }
    return { changed: true, shot }
  }

  return { advance }
}
