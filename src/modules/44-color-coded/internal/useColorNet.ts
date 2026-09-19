/**
 * The two ends of a shared arena.
 *
 * The **host** runs the game - the clock, everybody's walking, every shove, who
 * falls and the end - from its own hands, the stand-ins', and what each guest
 * says its hands are doing. It sends it twenty times a second. Shoving is
 * physics between bodies, so one screen has to own all of it.
 *
 * A **guest** sends its hands - where it is walking, which way it faces, its
 * clicks as a running count - and draws what comes back. So that walking does
 * not wait on the round trip, its own player moves at once on its own screen
 * and is eased towards where the host has it; a shove that lands on it comes
 * from the host and wins.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for
 * everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { BODY, clock, isStanding, judgeEnd, leave, move, push, steer, tick, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot } from './wire'

const SEND_MS = 50
/** A guest says what its hands are doing this often - its facing no oftener - and on every change of walk or click. */
const TURN_MS = 50
/** A guest the host has not heard from for this long stands still, ms. */
const QUIET_MS = 500
const SNAP_SECONDS = 0.4

/** What your hands are doing this frame. */
export interface Hands {
  /** Which way to walk, east and south, each -1 to 1. */
  mx: number
  mz: number
  yaw: number
  /** Clicks since the last frame. */
  clicks: number
}

export interface Pushed {
  changed: boolean
  /** You shoved this frame, and caught this many. */
  shoved: number | null
}

export interface ColorNet {
  advance(game: Game, dt: number, hands: Hands | null, paused: boolean): Pushed
}

export function useColorNet(): ColorNet {
  const intents = useRef(new Map<string, Intent & { at: number }>())
  /** How many of each guest's clicks the host has dealt with, this game. */
  const handled = useRef(new Map<string, number>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const toldAt = useRef(0)
  const told = useRef('')
  const clicks = useRef({ game: -1, count: 0 })
  /** A guest's own player: where the host last had it, and where it is drawn. */
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

  const advance = (game: Game, dt: number, hands: Hands | null, paused: boolean): Pushed => {
    const net = getNet()
    const now = performance.now()
    if (paused) return { changed: false, shoved: null }
    if (clicks.current.game !== game.id) clicks.current = { game: game.id, count: 0 }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, shoved: null }
      tick(game, dt)
      let shoved: number | null = null
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && hands && clock(game) >= 0) {
        steer(game, me, hands.mx, hands.mz, hands.yaw)
        for (let k = 0; k < hands.clicks; k++) {
          const caught = push(game, me)
          if (caught) shoved = caught.length
        }
      }
      botSteer(game)
      game.players.forEach((p, index) => {
        if (p.bot || p.mine) return
        const intent = intents.current.get(p.id)
        if (!intent || intent.game !== game.id || now - intent.at > QUIET_MS) {
          steer(game, index, 0, 0, p.yaw)
          return
        }
        steer(game, index, intent.mx, intent.mz, intent.yaw)
        const key = `${game.id}:${p.id}`
        const done = handled.current.get(key) ?? 0
        // Every click beyond those already dealt with is a shove - if the shove is ready.
        for (let k = done; k < intent.clicks; k++) push(game, index)
        handled.current.set(key, Math.max(done, intent.clicks))
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
      return { changed: true, shoved }
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
    if (game.players.length === 0) return { changed: false, shoved: null }
    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    let shoved: number | null = null
    if (mine && hands) {
      clicks.current.count += hands.clicks
      if (hands.clicks > 0) shoved = 0
      if (isStanding(mine) && !game.over) mine.yaw = hands.yaw
      // Walk at once on our own screen, and ease to where the host has us.
      const host = own.current.host
      if (host && isStanding(mine) && !game.over) {
        const step = Math.min(Math.max(dt, 0), 0.1)
        const drawn = own.current.drawn ?? { ...host }
        if (clock(game) >= 0) {
          drawn.x += hands.mx * BODY.speed * step
          drawn.z += hands.mz * BODY.speed * step
        }
        const off = Math.hypot(host.x - drawn.x, host.z - drawn.z)
        const k = off > 2.5 ? 1 : Math.min(1, step * 6)
        drawn.x += (host.x - drawn.x) * k
        drawn.z += (host.z - drawn.z) * k
        own.current.drawn = drawn
        mine.x = drawn.x
        mine.z = drawn.z
      } else own.current.drawn = null

      const intent = { game: game.id, mx: hands.mx, mz: hands.mz, yaw: hands.yaw, clicks: clicks.current.count }
      // Walking and clicks go at once. Turning changes every frame the mouse moves, so it waits
      // its turn - the relay drops anybody sending more than sixty a second.
      const said = `${intent.mx.toFixed(2)}:${intent.mz.toFixed(2)}:${intent.clicks}`
      const turned = now - toldAt.current >= TURN_MS
      if (!game.over && (said !== told.current || turned)) {
        told.current = said
        toldAt.current = now
        sendToRoom(encodeIntent(intent))
      }
    }
    return { changed: true, shoved }
  }

  return { advance }
}
