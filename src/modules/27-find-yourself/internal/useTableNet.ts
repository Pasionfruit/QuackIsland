/**
 * The two ends of a shared table.
 *
 * The **host** runs the game - the phases and their clock, its own pick, the
 * stand-ins', the guests' as they arrive, the scores - and sends it. A **guest**
 * animates the same shuffle from the seed against a clock eased to the host's,
 * sends its pick, and draws what comes back.
 *
 * A guest's own pick shows at once, ringed in its colour; everybody else's is
 * only "has picked" until the cups come up.
 *
 * The same lessons as the other minigames: a pick is said again until the host
 * has it and counts once; a guest keeps listening after the game ends; somebody
 * who leaves the lobby is not waited for; pausing in a lobby stops only your
 * hands. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botPicks } from './ai'
import { leave, phaseLength, pick, stepGame, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 100
const RESEND_MS = 150
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.3

export interface TableNet {
  /** Moves the game on a frame. `picked` is a slot clicked this frame, if any. */
  advance(game: Game, dt: number, picked: number | null, paused: boolean): boolean
}

export function useTableNet(): TableNet {
  const heard = useRef<{ from: string; game: number; stage: number; slot: number }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const waiting = useRef<{ game: number; stage: number; slot: number; saidAt: number } | null>(null)

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

  const advance = (game: Game, dt: number, picked: number | null, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()

    if (net.host) {
      if (game.players.length === 0) return false
      const shared = net.status === 'joined' && net.peers > 0
      if (paused && !shared) return false
      const me = game.players.findIndex((p) => p.mine)
      if (picked !== null && !paused && me >= 0) pick(game, me, picked)
      for (const move of botPicks(game)) pick(game, move.player, move.slot)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player >= 0 && said.game === game.id) pick(game, player, said.slot, said.stage)
      }
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((finder, index) => {
          if (!finder.bot && !finder.mine && !finder.left && !here.has(finder.id)) leave(game, index)
        })
      }
      stepGame(game, dt)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest. The host's word first, then the clock, then our own pick.
    const heardFrom = latest.current
    const before = { id: game.id, stage: game.stage, phase: game.phase, clock: game.clock }
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (heardFrom) {
      const hostClock = heardFrom.snap.clock + (now - heardFrom.at) / 1000
      const samePhase = before.id === game.id && before.stage === game.stage && before.phase === game.phase
      const ours = before.clock + step
      game.clock = !samePhase || Math.abs(hostClock - ours) > SNAP_SECONDS ? hostClock : ours + (hostClock - ours) * Math.min(1, step * 8)
      // Never past the end of the phase: the host says when it is over.
      game.clock = Math.max(0, Math.min(phaseLength(game), game.clock))
    }

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    const pending = waiting.current
    if (pending && (pending.game !== game.id || pending.stage !== game.stage || game.phase !== 'pick')) waiting.current = null
    if (picked !== null && !paused && mine && game.phase === 'pick' && !waiting.current && mine.picks[game.stage] === null) {
      waiting.current = { game: game.id, stage: game.stage, slot: picked, saidAt: now }
      mine.picks[game.stage] = picked
      sendToRoom(encodeIntent(game.id, game.stage, picked))
    }
    const said = waiting.current
    if (said && mine) {
      // Our own pick stands on our own screen whatever the host has shown yet.
      mine.picks[said.stage] = said.slot
      if (now - said.saidAt >= RESEND_MS) {
        said.saidAt = now
        sendToRoom(encodeIntent(said.game, said.stage, said.slot))
      }
    }
    return true
  }

  return { advance }
}
