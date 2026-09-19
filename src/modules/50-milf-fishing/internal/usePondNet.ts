/**
 * The two ends of a shared dock.
 *
 * The **host** keeps the clock and everybody's pulls - its own, the stand-ins',
 * and each guest's as the guest reports them - and sends them twenty times a
 * second. Nothing else needs sending: the bites come from the seed and what
 * each pull landed comes from the pulls.
 *
 * A **guest** pulls at once on its own screen - its rod whips up and the fish
 * comes out the moment it clicks - and tells the host when it did, by its own
 * clock. Until the host has heard, the guest keeps its own pulls on top of what
 * the host says.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for
 * everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botPull } from './ai'
import { canPull, judgeEnd, leave, pull, tick, type Game } from './rules'
import { type Bite } from './pond'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot } from './wire'

const SEND_MS = 50
/** A guest repeats its pulls this often, and says them at once when there is a new one. */
const INTENT_MS = 200
const SNAP_SECONDS = 0.4

export interface Hands {
  /** Clicked since the last frame. */
  pulled: boolean
}

/** What your own click did this frame: landed a fish, landed nothing, or nothing happened. */
export type Pulled = Bite | null | undefined

export interface PondNet {
  advance(game: Game, dt: number, hands: Hands | null, paused: boolean): { changed: boolean; pulled: Pulled }
}

export function usePondNet(): PondNet {
  const intents = useRef(new Map<string, Intent>())
  /** How many of each guest's pulls the host has dealt with, this game. */
  const handled = useRef(new Map<string, number>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const toldAt = useRef(0)
  const told = useRef(-1)
  /** A guest's own pulls this game, by its own clock. */
  const mine = useRef<{ game: number; pulls: number[] }>({ game: -1, pulls: [] })

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const intent = decodeIntent(raw)
        if (intent) intents.current.set(from, intent)
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, hands: Hands | null, paused: boolean) => {
    const net = getNet()
    const now = performance.now()
    if (paused) return { changed: false, pulled: undefined }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, pulled: undefined }
      tick(game, dt)
      let pulled: Pulled = undefined
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && hands?.pulled) pulled = pull(game, me)
      botPull(game)
      game.players.forEach((p, index) => {
        if (p.bot || p.mine) return
        const intent = intents.current.get(p.id)
        if (!intent || intent.game !== game.id) return
        // Every pull beyond those already dealt with, at the guest's own reading.
        const key = `${game.id}:${p.id}`
        const done = handled.current.get(key) ?? 0
        for (let k = done; k < intent.pulls.length; k++) pull(game, index, intent.pulls[k])
        handled.current.set(key, Math.max(done, intent.pulls.length))
      })
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((p) => p.id))
        game.players.forEach((p, index) => {
          if (!p.bot && !p.mine && !p.left && !here.has(p.id)) leave(game, index)
        })
      }
      judgeEnd(game)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return { changed: true, pulled }
    }

    // A guest. The host's word first, then the clock, then our own hands.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return { changed: false, pulled: undefined }
    if (mine.current.game !== game.id) mine.current = { game: game.id, pulls: [] }
    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }
    const me = game.players.findIndex((p) => p.mine)
    let pulled: Pulled = undefined
    if (me >= 0) {
      const p = game.players[me]
      // Our own pulls the host has not heard yet stay on top of what it says.
      if (mine.current.pulls.length > p.pulls.length) p.pulls = [...p.pulls, ...mine.current.pulls.slice(p.pulls.length)]
      if (hands?.pulled && canPull(game, me)) {
        pulled = pull(game, me)
        if (pulled !== undefined) mine.current.pulls = [...p.pulls]
      }
      const count = mine.current.pulls.length
      if (!game.over && (count !== told.current || now - toldAt.current >= INTENT_MS)) {
        told.current = count
        toldAt.current = now
        sendToRoom(encodeIntent({ game: game.id, pulls: mine.current.pulls }))
      }
    }
    return { changed: true, pulled }
  }

  return { advance }
}
