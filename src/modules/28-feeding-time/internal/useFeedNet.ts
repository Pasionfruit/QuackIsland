/**
 * The two ends of a shared pond.
 *
 * The **host** runs the round: the clock, every throw - its own, the stand-ins',
 * the guests' as they arrive - and every cracker landing, and sends it all. A
 * **guest** draws the ducks from the seed against a clock eased to the host's,
 * sends its throws, and draws what comes back.
 *
 * **A guest's own cracker leaves its hand at once.** It is drawn flying from the
 * moment of the flick, and handed over to the host's cracker once the host has
 * taken the throw; whether it fed a duck is the host's to say.
 *
 * The same lessons as the other minigames: a throw is said again until it is
 * taken and counts once; a guest keeps listening after the round ends; a pause stops the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botThrows } from './ai'
import { POND, canThrow, flightTime, landing, spotOf, stepGame, throwCracker, type Cracker, type Game, type Throw } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 80
const RESEND_MS = 150
const GIVE_UP_MS = 2000
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.5

export interface FeedNet {
  /** Moves the round on a frame. `thrown` is a throw let go this frame, if any. */
  advance(game: Game, dt: number, thrown: Throw | null, paused: boolean): boolean
  /** This browser's own throw that the host has not taken yet, drawn as a cracker. */
  pending(): Cracker | null
}

export function useFeedNet(): FeedNet {
  const heard = useRef<{ from: string; game: number; seq: number; thrown: Throw }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const seq = useRef(0)
  const waiting = useRef<{ game: number; seq: number; thrown: Throw; firstAt: number; saidAt: number; cracker: Cracker } | null>(null)

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

  const advance = (game: Game, dt: number, thrown: Throw | null, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // so this stops dead - the host's own simulation included. A round that
    // carried on behind the card would make the card a lie. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return false

    if (net.host) {
      if (game.players.length === 0) return false
      const me = game.players.findIndex((p) => p.mine)
      if (thrown && !paused && me >= 0) throwCracker(game, me, thrown)
      for (const move of botThrows(game)) throwCracker(game, move.player, move.thrown)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player >= 0 && said.game === game.id) throwCracker(game, player, said.thrown, said.seq)
      }
      stepGame(game, dt)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest. The host's word first, then the clock, then our own throw.
    const heardFrom = latest.current
    const localElapsed = game.elapsed
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      const sameRound = game.id === heardFrom.snap.id
      applySnapshot(game, heardFrom.snap, myId(), (player) => spotOf(player, heardFrom.snap.feeders.length))
      game.elapsed = sameRound ? localElapsed : heardFrom.snap.elapsed
    }
    if (game.players.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (!game.over && heardFrom) {
      const ours = game.elapsed + step
      const hostNow = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const gap = hostNow - ours
      game.elapsed = Math.abs(gap) > SNAP_SECONDS ? hostNow : ours + gap * Math.min(1, step * 6)
      game.elapsed = Math.max(0, Math.min(POND.duration, game.elapsed))
    }

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    const pending = waiting.current
    if (pending && (pending.game !== game.id || (mine && mine.seq >= pending.seq) || now - pending.firstAt > GIVE_UP_MS)) waiting.current = null

    if (thrown && mine && !paused && !game.over && !waiting.current && canThrow(game, me)) {
      seq.current = Math.max(seq.current, mine.seq) + 1
      const from = spotOf(me, game.players.length)
      const cracker: Cracker = { id: -seq.current, player: me, from, to: landing(from, thrown), at: game.elapsed, lands: game.elapsed + flightTime(thrown.distance), fed: null }
      waiting.current = { game: game.id, seq: seq.current, thrown, firstAt: now, saidAt: now, cracker }
      mine.thrownAt = game.elapsed
      sendToRoom(encodeIntent(game.id, seq.current, thrown))
    }
    const said = waiting.current
    if (said && now - said.saidAt >= RESEND_MS) {
      said.saidAt = now
      sendToRoom(encodeIntent(said.game, said.seq, said.thrown))
    }
    return true
  }

  return { advance, pending: () => waiting.current?.cracker ?? null }
}
