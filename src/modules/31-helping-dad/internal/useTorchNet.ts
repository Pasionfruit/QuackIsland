/**
 * The two ends of a shared maze.
 *
 * The **host** runs the game - the clock, its own torch, the stand-ins', the
 * guests' as they report, the end - and sends it. A **guest** moves its own torch
 * on its own screen - how close you steer to a wall is a matter of pixels and
 * milliseconds, and cannot wait for a round trip - and reports where it is.
 *
 * The host takes a guest's torch only as far as it could have got since it last
 * heard, and never through a wall; and places it by the host's clock.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import type { Point } from './maze'
import { ROUND, clock, judgeEnd, leave, report, steer, tick, type Game, type SteerResult } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 100
const REPORT_MS = 50
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

export interface TorchNet {
  /** Moves the game on a frame, with the mouse at `aim` on the ground. What happened to your own torch, if anything. */
  advance(game: Game, dt: number, aim: Point | null, paused: boolean): { changed: boolean; mine: SteerResult }
}

export function useTorchNet(): TorchNet {
  const heard = useRef<{ from: string; game: number; x: number; z: number; hits: number }[]>([])
  const heardAt = useRef(new Map<string, number>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const reportedAt = useRef(0)

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

  const advance = (game: Game, dt: number, aim: Point | null, paused: boolean) => {
    const net = getNet()
    const now = performance.now()
    let mine: SteerResult = null

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // so this stops dead - the host's own simulation included. A round that
    // carried on behind the card would make the card a lie. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return { changed: false, mine }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, mine }
      tick(game, dt)
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && !paused) mine = steer(game, me, aim, dt)
      botSteer(game, dt)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.game !== game.id) continue
        const last = heardAt.current.get(`${game.id}:${said.from}`) ?? ROUND.countdown
        report(game, player, { x: said.x, z: said.z }, said.hits, game.elapsed - last)
        if (clock(game) >= 0) heardAt.current.set(`${game.id}:${said.from}`, game.elapsed)
      }
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((torch, index) => {
          if (!torch.bot && !torch.mine && !torch.left && !here.has(torch.id)) leave(game, index)
        })
      }
      judgeEnd(game)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return { changed: true, mine }
    }

    // A guest. The host's word first, then the clock, then our own torch.
    const heardFrom = latest.current
    const before = { id: game.id, elapsed: game.elapsed }
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return { changed: false, mine }

    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before.id !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }

    const me = game.players.findIndex((p) => p.mine)
    const torch = game.players[me]
    if (torch && !paused) mine = steer(game, me, aim, dt)
    // Said until the host has us finished, or the game is over.
    const onHost = torch ? heardFrom?.snap.torches.find((t) => t[0] === torch.id) : undefined
    const hostHasUsDone = !!onHost && onHost[5] !== -1
    if (torch && !game.over && clock(game) >= 0 && !hostHasUsDone && now - reportedAt.current >= REPORT_MS) {
      reportedAt.current = now
      sendToRoom(encodeIntent(game.id, torch.x, torch.z, torch.hits))
    }
    return { changed: true, mine }
  }

  return { advance }
}
