/**
 * The two ends of a shared game.
 *
 * The **host** runs the clock and the stand-ins, takes everybody's pieces (its
 * own, the stand-ins', the guests' as they say them) and sends the lot. A
 * **guest** runs its own clock between snapshots, eased towards the host's,
 * and puts pieces in on its own table straight away - its table is its own,
 * so nothing waits on anybody - and says which are in when one clicks in, and
 * a few times a second besides.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is not waited for; a pause stops
 * the game for everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { stepBots } from './ai'
import { PUZZLE, leave, place, stepGame, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot } from './wire'

const SEND_MS = 100
/** A guest says which pieces are in this often even when nothing changed, in case a message went missing. */
const REPEAT_MS = 400
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

export interface PuzzleNet {
  /**
   * Moves the game on a frame. `placed` is which of this browser's pieces are
   * in on its own table. Says whether anything moved.
   */
  advance(game: Game, dt: number, placed: number, paused: boolean): boolean
}

export function usePuzzleNet(): PuzzleNet {
  const heard = useRef<{ from: string; intent: Intent }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const said = useRef(-1)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const intent = decodeIntent(raw)
        if (intent) heard.current.push({ from, intent })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, placed: number, paused: boolean) => {
    const net = getNet()
    const now = performance.now()

    // A pause is shared and stops the game dead - the host's included.
    if (paused) return false

    if (net.host) {
      if (game.players.length === 0) return false
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0) place(game, me, placed)
      stepBots(game)
      for (const { from, intent } of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === from)
        if (player < 0 || intent.game !== game.id) continue
        place(game, player, intent.placed)
      }
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((p, index) => {
          if (!p.bot && !p.mine && !p.left && !here.has(p.id)) leave(game, index)
        })
      }
      stepGame(game, dt)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest. The host's word first, then the clock, then our own pieces.
    const heardFrom = latest.current
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      const localClock = game.clock
      const sameGame = game.id === heardFrom.snap.id
      if (!sameGame) said.current = -1
      applySnapshot(game, heardFrom.snap, myId())
      if (sameGame && !game.over) game.clock = localClock
    }
    if (game.players.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (!game.over && heardFrom && heardFrom.snap.id === game.id) {
      const ours = game.clock + step
      const hostNow = heardFrom.snap.clock + (now - heardFrom.at) / 1000
      const gap = hostNow - ours
      game.clock = Math.abs(gap) > SNAP_SECONDS ? hostNow : ours + gap * Math.min(1, step * 8)
      game.clock = Math.max(0, Math.min(PUZZLE.limit, game.clock))
    }

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    if (mine && !game.over && !mine.left) {
      place(game, me, placed)
      const changed = mine.placed !== said.current
      if ((changed && now - sentAt.current >= SEND_MS) || now - sentAt.current >= REPEAT_MS) {
        sentAt.current = now
        said.current = mine.placed
        sendToRoom(encodeIntent({ game: game.id, placed: mine.placed }))
      }
    }
    return true
  }

  return { advance }
}
