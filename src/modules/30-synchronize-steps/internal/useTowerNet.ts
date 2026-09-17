/**
 * The two ends of a shared tower.
 *
 * The **host** runs the rounds - the clock, its own pick, the stand-ins', the
 * guests' as they arrive, the reveal and the moves - and sends it. A **guest**
 * sends its pick and draws what comes back, with its clock eased to the host's
 * so the round timer runs smoothly.
 *
 * A guest's own pick shows at once; everybody else's is "has picked" until the
 * reveal. A pick is said again every quarter second for the rest of the round -
 * a guest may change its mind, and the latest the host hears before the round
 * ends is the one that counts.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; pausing in a lobby stops only
 * your hands. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botChoices } from './ai'
import { TOWER, choose, leave, stepGame, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 100
const REPEAT_MS = 250
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.3

export interface TowerNet {
  /** Moves the game on a frame. `picked` is a number picked this frame, if any. */
  advance(game: Game, dt: number, picked: number | null, paused: boolean): boolean
}

export function useTowerNet(): TowerNet {
  const heard = useRef<{ from: string; game: number; round: number; pick: number }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const mine = useRef<{ game: number; round: number; pick: number; saidAt: number } | null>(null)

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
      if (picked !== null && !paused && me >= 0) choose(game, me, picked)
      for (const move of botChoices(game)) choose(game, move.player, move.pick)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player >= 0 && said.game === game.id) choose(game, player, said.pick, said.round)
      }
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((stepper, index) => {
          if (!stepper.bot && !stepper.mine && !stepper.out && !here.has(stepper.id)) leave(game, index)
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
    const before = { id: game.id, round: game.round, phase: game.phase, clock: game.clock }
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (heardFrom) {
      const hostClock = heardFrom.snap.clock + (now - heardFrom.at) / 1000
      const same = before.id === game.id && before.round === game.round && before.phase === game.phase
      const ours = before.clock + step
      game.clock = !same || Math.abs(hostClock - ours) > SNAP_SECONDS ? hostClock : ours + (hostClock - ours) * Math.min(1, step * 8)
      const limit = game.phase === 'choose' ? TOWER.choose : game.phase === 'reveal' ? TOWER.reveal : Infinity
      game.clock = Math.max(0, Math.min(limit, game.clock))
    }

    const me = game.players.findIndex((p) => p.mine)
    const stepper = game.players[me]
    if (mine.current && (mine.current.game !== game.id || mine.current.round !== game.round)) mine.current = null
    if (picked !== null && !paused && stepper && !stepper.out && game.phase === 'choose' && TOWER.options.includes(picked)) {
      mine.current = { game: game.id, round: game.round, pick: picked, saidAt: now }
      sendToRoom(encodeIntent(game.id, game.round, picked))
    }
    const said = mine.current
    if (said && stepper && game.phase === 'choose') {
      // Our own pick stands on our own screen whatever the host has shown yet.
      stepper.pick = said.pick
      if (now - said.saidAt >= REPEAT_MS) {
        said.saidAt = now
        sendToRoom(encodeIntent(said.game, said.round, said.pick))
      }
    }
    return true
  }

  return { advance }
}
