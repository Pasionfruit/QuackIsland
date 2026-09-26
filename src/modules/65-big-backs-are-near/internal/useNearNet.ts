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
 * The same lessons as every other minigame: a guest keeps listening after
 * the round ends; somebody who leaves the lobby is out; a pause stops the
 * round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { catchHiders, hunterOf, judgeEnd, leave, look, report, tick, walkHider, walkHunter, type Round } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeMove, decodeSnapshot, encodeMove, encodeSnapshot, type Snapshot } from './wire'

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
  /** Hunter only: Shift is held. */
  sprint: boolean
}

export interface Advanced {
  changed: boolean
}

export interface NearNet {
  advance(round: Round, dt: number, hands: Hands | null, paused: boolean): Advanced
}

type Heard = { from: string; round: number; x: number; z: number; yaw: number; pitch: number; sprint: boolean }

export function useNearNet(): NearNet {
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
        if (move) heard.current.push({ from, ...move })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (round: Round, dt: number, hands: Hands | null, paused: boolean): Advanced => {
    const net = getNet()
    const now = performance.now()

    // A pause is shared: the round stops dead for everybody, the host's own
    // simulation included, so a round never carries on behind the card.
    if (paused) return { changed: false }

    if (net.host) {
      if (round.players.length === 0) return { changed: false }
      tick(round, dt)
      const me = round.players.findIndex((p) => p.mine)
      const mine = round.players[me]
      if (mine && hands && !round.over) {
        look(round, me, hands.yaw, hands.pitch)
        if (mine.role === 'hunter') walkHunter(round, me, hands, dt)
        else walkHider(round, me, hands, dt)
      }
      const hunter = hunterOf(round)
      botSteer(round, hunter, dt)
      for (const said of heard.current.splice(0)) {
        const player = round.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.round !== round.id) continue
        const key = `${round.id}:${said.from}`
        const last = heardAt.current.get(key) ?? 0
        report(round, player, said, said.yaw, said.pitch, round.elapsed - last, said.sprint)
        heardAt.current.set(key, round.elapsed)
      }
      catchHiders(round)
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
      return { changed: true }
    }

    // A guest. The host's word first, then the clock, then our own hands.
    const heardFrom = latest.current
    const before = round.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(round, heardFrom.snap, myId())
    }
    if (round.players.length === 0) return { changed: false }

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
      if (mine.role === 'hunter') walkHunter(round, me, hands, dt)
      else walkHider(round, me, hands, dt)
    }
    if (mine && !round.over && now - reportedAt.current >= REPORT_MS) {
      reportedAt.current = now
      sendToRoom(encodeMove(round.id, { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: mine.pitch, sprint: mine.sprinting }))
    }
    return { changed: true }
  }

  return { advance }
}
