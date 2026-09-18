/**
 * The two ends of a shared search.
 *
 * The **host** runs the clock and settles every click - its own, the
 * stand-ins', and the guests' as they arrive - working out for itself what each
 * one landed on, and sends the search out.
 *
 * A **guest** sends its clicks and draws what comes back. It works out what a
 * click landed on the same way the host will, from the same seed, so **a miss
 * starts its cooldown at once** and **a find is shown as being checked** until
 * the host confirms it. A find is timed by the guest's own clock, so being
 * further from the host does not make you slower. Its clock and cooldowns run on
 * between snapshots.
 *
 * The same lessons as the other minigames: a click is said again until it is
 * taken and counts once; a guest keeps listening after the round ends; the host
 * never runs or sends a round nobody was dealt into; a pause stops the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botClicks } from './ai'
import { SEARCH, select, stepGame, type Game } from './rules'
import { myId } from './setup'
import type { Vec3 } from './view'
import { decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, applySnapshot, type Click, type Snapshot } from './wire'
import { look, yardFor } from './yard'

const SEND_MS = 80
const RESEND_MS = 150
const GIVE_UP_MS = 2500
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.5

export interface SearchNet {
  /** Moves the search on a frame. `clicked` is the direction of a click this frame, if there was one. */
  advance(game: Game, dt: number, clicked: Vec3 | undefined, paused: boolean): boolean
  /** Whether this browser has clicked him and is waiting for the host to say so. */
  checking(): boolean
}

export function useSearchNet(): SearchNet {
  const heard = useRef<{ from: string; click: Click }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const seq = useRef(0)
  const waiting = useRef<{ click: Click; find: boolean; firstAt: number; saidAt: number } | null>(null)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const click = decodeIntent(raw)
        if (click) heard.current.push({ from, click })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, clicked: Vec3 | undefined, paused: boolean): boolean => {
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
      if (clicked && !paused && me >= 0) select(game, me, clicked)
      botClicks(game)
      for (const { from, click } of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === from)
        if (player < 0 || click.game !== game.id) continue
        select(game, player, click.dir, { at: click.at, seq: click.seq })
      }
      stepGame(game, dt)

      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest. The host's word first, then the clock, then our own click.
    const heardFrom = latest.current
    const localElapsed = game.elapsed
    const fresh = !!heardFrom && heardFrom.snap !== applied.current
    const cooldowns = new Map(game.players.map((p) => [p.id, p.cooldown]))
    if (fresh) {
      applied.current = heardFrom.snap
      const sameRound = game.id === heardFrom.snap.id
      applySnapshot(game, heardFrom.snap, myId())
      game.elapsed = sameRound ? localElapsed : heardFrom.snap.elapsed
    }
    if (game.players.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (!game.over && heardFrom) {
      const ours = game.elapsed + step
      const hostNow = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const gap = hostNow - ours
      game.elapsed = Math.abs(gap) > SNAP_SECONDS ? hostNow : ours + gap * Math.min(1, step * 6)
      game.elapsed = Math.max(0, Math.min(SEARCH.duration, game.elapsed))
    }
    // Cooldowns run down between snapshots, or the wait counts down in tenths.
    for (const seeker of game.players) {
      const before = cooldowns.get(seeker.id)
      if (!fresh && before !== undefined) seeker.cooldown = Math.max(0, before - step)
    }

    const mine = game.players.find((p) => p.mine)
    const pending = waiting.current
    if (pending && (pending.click.game !== game.id || (mine && mine.seq >= pending.click.seq) || now - pending.firstAt > GIVE_UP_MS)) {
      waiting.current = null
    }

    if (clicked && mine && !paused && !game.over && mine.foundAt === null && !waiting.current && mine.cooldown <= 0) {
      seq.current = Math.max(seq.current, mine.seq) + 1
      const click: Click = { game: game.id, seq: seq.current, dir: clicked, at: game.elapsed }
      const find = look(yardFor(game.seed), clicked) === 'midnight'
      waiting.current = { click, find, firstAt: now, saidAt: now }
      sendToRoom(encodeIntent(click))
    }

    const said = waiting.current
    if (said && mine) {
      if (now - said.saidAt >= RESEND_MS) {
        said.saidAt = now
        sendToRoom(encodeIntent(said.click))
      }
      // A click that cannot be him has started our cooldown already.
      if (!said.find) mine.cooldown = Math.max(mine.cooldown, SEARCH.cooldown - (now - said.firstAt) / 1000)
    }
    return true
  }

  const checking = () => !!waiting.current && waiting.current.find

  return { advance, checking }
}
