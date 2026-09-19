/**
 * The two ends of a shared store.
 *
 * The **host** runs the game - the clock, everybody's walking, every pick-up,
 * put-back and ram, who is through, and the end - from its own hands, the
 * stand-ins', and what each guest says its hands are doing, and sends it twenty
 * times a second. Two people can reach for the same thing, and rams are physics
 * between bodies, so one screen owns all of it.
 *
 * A **guest** sends its hands - which way it walks, its clicks and its rams as
 * running counts - and draws what comes back. Its own player moves at once on
 * its own screen, round the shelves, and is eased towards where the host has
 * it; what it picked up, and a ram that lands on it, come from the host.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for
 * everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { BODY, click, isShopping, judgeEnd, leave, move, ram, steer, stunned, tick, type Game } from './rules'
import { collide } from './store'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot } from './wire'

const SEND_MS = 50
/** A guest repeats its hands this often, and says them at once when they change. */
const INTENT_MS = 100
const QUIET_MS = 500
const SNAP_SECONDS = 0.4

export interface Hands {
  mx: number
  mz: number
  /** Clicks, and rams, since the last frame. */
  clicks: number
  rams: number
}

/** What your own hands did this frame, for the sounds: took something, put something back, rammed. */
export interface Did {
  changed: boolean
  took: boolean
  put: boolean
  rammed: boolean
}

export interface StoreNet {
  advance(game: Game, dt: number, hands: Hands | null, paused: boolean): Did
}

const NOTHING: Did = { changed: false, took: false, put: false, rammed: false }

export function useStoreNet(): StoreNet {
  const intents = useRef(new Map<string, Intent & { at: number }>())
  const handled = useRef(new Map<string, number>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const toldAt = useRef(0)
  const told = useRef('')
  const counts = useRef({ game: -1, clicks: 0, rams: 0 })
  const own = useRef<{ host: { x: number; z: number } | null; drawn: { x: number; z: number } | null }>({ host: null, drawn: null })

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const intent = decodeIntent(raw)
        if (intent) intents.current.set(from, { ...intent, at: performance.now() })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (game: Game, dt: number, hands: Hands | null, paused: boolean) => {
    const net = getNet()
    const now = performance.now()
    if (paused) return NOTHING
    if (counts.current.game !== game.id) counts.current = { game: game.id, clicks: 0, rams: 0 }

    if (net.host) {
      if (game.players.length === 0) return NOTHING
      tick(game, dt)
      const did = { changed: true, took: false, put: false, rammed: false }
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && hands) {
        steer(game, me, hands.mx, hands.mz)
        for (let k = 0; k < hands.clicks; k++) {
          const done = click(game, me)
          if (done && 'took' in done) did.took = true
          if (done && 'put' in done) did.put = true
        }
        for (let k = 0; k < hands.rams; k++) if (ram(game, me)) did.rammed = true
      }
      botSteer(game)
      game.players.forEach((p, index) => {
        if (p.bot || p.mine) return
        const intent = intents.current.get(p.id)
        if (!intent || intent.game !== game.id || now - intent.at > QUIET_MS) {
          steer(game, index, 0, 0)
          return
        }
        steer(game, index, intent.mx, intent.mz)
        // Every click and ram beyond those already dealt with, once each.
        for (const [what, said] of [
          ['c', intent.clicks],
          ['r', intent.rams],
        ] as const) {
          const key = `${game.id}:${p.id}:${what}`
          const done = handled.current.get(key) ?? 0
          for (let k = done; k < said; k++) {
            if (what === 'c') click(game, index)
            else ram(game, index)
          }
          handled.current.set(key, Math.max(done, said))
        }
      })
      move(game, dt)
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
      return did
    }

    // A guest. The host's word first, then the clock, then our own hands.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
      const mine = game.players.find((p) => p.mine)
      own.current.host = mine ? { x: mine.x, z: mine.z } : null
      if (before !== game.id) own.current.drawn = null
    }
    if (game.players.length === 0) return NOTHING
    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }
    const mine = game.players.find((p) => p.mine)
    const did = { changed: true, took: false, put: false, rammed: false }
    if (mine && hands) {
      counts.current.clicks += hands.clicks
      counts.current.rams += hands.rams
      const shopping = isShopping(mine) && !game.over
      if (shopping && !stunned(game, mine) && Math.hypot(hands.mx, hands.mz) > 1e-6) mine.yaw = Math.atan2(-hands.mx, -hands.mz)
      // Walk at once on our own screen, round the shelves, and ease to where the host has us.
      const host = own.current.host
      if (host && shopping) {
        const step = Math.min(Math.max(dt, 0), 0.1)
        const drawn = own.current.drawn ?? { ...host }
        if (!stunned(game, mine)) {
          drawn.x += hands.mx * BODY.speed * step
          drawn.z += hands.mz * BODY.speed * step
        }
        const off = Math.hypot(host.x - drawn.x, host.z - drawn.z)
        const k = off > 2 ? 1 : Math.min(1, step * 6)
        drawn.x += (host.x - drawn.x) * k
        drawn.z += (host.z - drawn.z) * k
        collide(drawn, BODY.radius)
        own.current.drawn = drawn
        mine.x = drawn.x
        mine.z = drawn.z
      } else own.current.drawn = null
      const intent = { game: game.id, mx: hands.mx, mz: hands.mz, clicks: counts.current.clicks, rams: counts.current.rams }
      const said = `${intent.mx.toFixed(2)}:${intent.mz.toFixed(2)}:${intent.clicks}:${intent.rams}`
      if (!game.over && (said !== told.current || now - toldAt.current >= INTENT_MS)) {
        told.current = said
        toldAt.current = now
        sendToRoom(encodeIntent(intent))
      }
    }
    return did
  }

  return { advance }
}
