/**
 * The two ends of a shared round.
 *
 * The **host** runs the clock and settles every click - its own, the
 * stand-ins', the guests' as they arrive, in the order they arrive - and sends
 * the field out. Two hunters clicking the same clover: the first click the host
 * takes claims it, and the second is a miss.
 *
 * A **guest** sends its clicks and draws what comes back. **A click that looks
 * like a claim on its own screen is shown as one being made** - a white ring
 * round the clover - until the host says whose it is. A click that cannot be a
 * claim starts its cooldown at once. Its clock and cooldowns run on between
 * snapshots.
 *
 * The same lessons as the other minigames: a click is said again until it is
 * taken and counts once; a guest keeps listening after the round ends; the host
 * never runs or sends a round nobody was dealt into; a pause stops the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botClicks } from './ai'
import { FIELD, click, stepGame, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 80
const RESEND_MS = 150
const GIVE_UP_MS = 2000
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.5

export interface FieldNet {
  /** Moves the round on a frame. `clicked` is a click this frame: a clover, null for grass, undefined for none. */
  advance(game: Game, dt: number, clicked: number | null | undefined, paused: boolean): boolean
  /** The clover this browser has clicked and hopes is a claim, until the host answers. */
  claiming(): number | null
}

export function useFieldNet(): FieldNet {
  const heard = useRef<{ from: string; game: number; seq: number; clover: number | null }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const seq = useRef(0)
  const waiting = useRef<{ game: number; seq: number; clover: number | null; claim: boolean; firstAt: number; saidAt: number } | null>(null)

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

  const advance = (game: Game, dt: number, clicked: number | null | undefined, paused: boolean): boolean => {
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
      if (clicked !== undefined && !paused && me >= 0) click(game, me, clicked)
      for (const bot of botClicks(game)) click(game, bot.player, bot.clover)
      for (const said of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === said.from)
        if (player < 0 || said.game !== game.id) continue
        click(game, player, said.clover, said.seq)
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
      game.elapsed = Math.max(0, Math.min(FIELD.duration, game.elapsed))
    }
    // Cooldowns run down between snapshots, or a ring fills in tenths.
    for (const hunter of game.players) {
      const before = cooldowns.get(hunter.id)
      if (!fresh && before !== undefined) hunter.cooldown = Math.max(0, before - step)
    }

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    const pending = waiting.current
    if (pending && (pending.game !== game.id || (mine && mine.seq >= pending.seq) || now - pending.firstAt > GIVE_UP_MS)) {
      waiting.current = null
    }

    if (clicked !== undefined && mine && !paused && !game.over && !waiting.current && mine.cooldown <= 0) {
      seq.current = Math.max(seq.current, mine.seq) + 1
      const claim = clicked !== null && game.lucky.some((l) => l.clover === clicked)
      waiting.current = { game: game.id, seq: seq.current, clover: clicked, claim, firstAt: now, saidAt: now }
      sendToRoom(encodeIntent(game.id, seq.current, clicked))
    }

    const said = waiting.current
    if (said && mine) {
      if (now - said.saidAt >= RESEND_MS) {
        said.saidAt = now
        sendToRoom(encodeIntent(said.game, said.seq, said.clover))
      }
      // A click that cannot be a claim has started our cooldown already.
      if (!said.claim) mine.cooldown = Math.max(mine.cooldown, FIELD.cooldown - (now - said.firstAt) / 1000)
    }
    return true
  }

  const claiming = () => {
    const said = waiting.current
    return said && said.claim ? said.clover : null
  }

  return { advance, claiming }
}
