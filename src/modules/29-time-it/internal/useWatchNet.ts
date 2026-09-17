/**
 * The two ends of a shared round.
 *
 * The **host** runs the clock - which is the stopwatch - takes everybody's stop
 * (its own, the stand-ins', the guests' as they arrive), and sends who has
 * stopped. A **guest** runs its own clock between snapshots, eased towards the
 * host's, and times its own stop against it.
 *
 * **Your stop is timed on your own screen.** You are counting along with the
 * stopwatch you saw, so the stopwatch that counts is the one you saw - not the
 * host's, a round trip away. The host holds a guest's stop to no later than its
 * own stopwatch and a little.
 *
 * The same lessons as the other minigames: a stop is said again until taken and
 * counts once; a guest keeps listening after the round ends; somebody who leaves
 * the lobby is not waited for; pausing in a lobby stops only your hands. Alone,
 * the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botStops } from './ai'
import { WATCH, leave, stepGame, stop, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 100
const RESEND_MS = 150
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.3

export interface WatchNet {
  /**
   * Moves the round on a frame. `clicked` is the stopwatch reading at the moment
   * this browser clicked to stop, since the last frame, or null. Read at the
   * click rather than at the frame after it: a frame late, or a clock nudged
   * towards the host's in between, is time the player did not spend.
   */
  advance(game: Game, dt: number, clicked: number | null, paused: boolean): boolean
}

export function useWatchNet(): WatchNet {
  const heard = useRef<{ from: string; game: number; at: number }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const waiting = useRef<{ game: number; at: number; saidAt: number } | null>(null)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const said = decodeIntent(raw)
        if (said) heard.current.push({ from, ...said })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, clicked: number | null, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()

    if (net.host) {
      if (game.players.length === 0) return false
      const shared = net.status === 'joined' && net.peers > 0
      if (paused && !shared) return false
      const me = game.players.findIndex((p) => p.mine)
      // The clock has not been stepped to this frame yet, so a click since the
      // last frame reads up to a frame past it.
      if (clicked !== null && !paused && me >= 0) stop(game, me, clicked, Math.min(Math.max(dt, 0), 0.25))
      for (const move of botStops(game)) stop(game, move.player, move.at)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player >= 0 && said.game === game.id) stop(game, player, said.at, WATCH.grace)
      }
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((timer, index) => {
          if (!timer.bot && !timer.mine && !here.has(timer.id)) leave(game, index)
        })
      }
      stepGame(game, dt)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest. The host's word first, then the clock, then our own stop.
    const heardFrom = latest.current
    const localElapsed = game.elapsed
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      const sameRound = game.id === heardFrom.snap.id
      applySnapshot(game, heardFrom.snap, myId())
      if (sameRound && !game.over) game.elapsed = localElapsed
    }
    if (game.players.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (!game.over && heardFrom) {
      const ours = game.elapsed + step
      const hostNow = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const gap = hostNow - ours
      game.elapsed = Math.abs(gap) > SNAP_SECONDS ? hostNow : ours + gap * Math.min(1, step * 8)
      game.elapsed = Math.max(0, Math.min(WATCH.countdown + WATCH.limit, game.elapsed))
    }

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    const pending = waiting.current
    if (pending && pending.game !== game.id) waiting.current = null
    if (clicked !== null && clicked >= 0 && !paused && mine && !game.over && mine.stopped === null && !waiting.current) {
      const at = Math.round(clicked * 1000) / 1000
      waiting.current = { game: game.id, at, saidAt: now }
      mine.stopped = at
      sendToRoom(encodeIntent(game.id, at))
    }
    const said = waiting.current
    if (said && mine && !game.over) {
      // Our own stop stands on our own screen whatever the host has shown yet.
      mine.stopped = said.at
      if (now - said.saidAt >= RESEND_MS) {
        said.saidAt = now
        sendToRoom(encodeIntent(said.game, said.at))
      }
    }
    return true
  }

  return { advance }
}
