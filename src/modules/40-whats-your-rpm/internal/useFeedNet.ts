/**
 * The two ends of a shared game.
 *
 * The **host** runs the clock and the stand-ins, takes everybody's scrolling
 * (its own, the stand-ins', the guests' as they say it) and sends the lot. A
 * **guest** runs its own clock between snapshots, eased towards the host's,
 * and scrolls and skips on its own copy straight away - it has the whole feed,
 * so an ad goes up and comes down without waiting on anybody - and says how
 * far it has got ten times a second, and at once when it skips.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is not waited for; a pause stops
 * the game for everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { stepBots } from './ai'
import { FEED, leave, report, scroll, skipAd, stepGame, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot } from './wire'

const SEND_MS = 100
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

export interface FeedNet {
  /**
   * Moves the game on a frame. `reels` is how far this browser scrolled since
   * the last frame; `skip` is the ad it clicked the skip button of, or null.
   * Says whether anything moved.
   */
  advance(game: Game, dt: number, reels: number, skip: number | null, paused: boolean): boolean
}

export function useFeedNet(): FeedNet {
  const heard = useRef<{ from: string; intent: Intent }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)

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

  const advance = (game: Game, dt: number, reels: number, skip: number | null, paused: boolean) => {
    const net = getNet()
    const now = performance.now()

    // A pause is shared and stops the game dead - the host's included.
    if (paused) return false

    if (net.host) {
      if (game.players.length === 0) return false
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0) {
        if (skip !== null) skipAd(game, me, skip)
        scroll(game, me, reels)
      }
      stepBots(game, dt)
      for (const { from, intent } of heard.current.splice(0)) {
        const player = game.players.findIndex((p) => p.id === from)
        if (player < 0 || intent.game !== game.id) continue
        report(game, player, intent.progress, intent.skipped)
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

    // A guest. The host's word first, then the clock, then our own scrolling.
    const heardFrom = latest.current
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      const localClock = game.clock
      const sameGame = game.id === heardFrom.snap.id
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
      game.clock = Math.max(0, Math.min(FEED.limit, game.clock))
    }

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    if (mine && !game.over && !mine.left) {
      const skipped = skip !== null && skipAd(game, me, skip)
      // Not `ends`: getting to the end first is the host's to say.
      const was = mine.finishedAt
      scroll(game, me, reels, false)
      const finishing = was === null && mine.finishedAt !== null
      if (skipped || finishing || now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeIntent({ game: game.id, progress: mine.progress, skipped: mine.skipped }))
      }
    }
    return true
  }

  return { advance }
}
