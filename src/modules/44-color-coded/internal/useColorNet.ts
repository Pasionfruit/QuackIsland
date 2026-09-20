/**
 * The two ends of a shared arena.
 *
 * The **host** runs the game - the clock, everybody's sliding, every collision,
 * who falls and the end - from its own hands, the stand-ins', and what each guest
 * says its hands are doing. It sends it twenty times a second. Collisions are
 * physics between bodies, so one screen has to own all of it.
 *
 * A **guest** sends its hands - where it is going, which way it faces, whether it
 * is running - and draws what comes back. So that sliding does not wait on the
 * round trip, its own player moves at once on its own screen, by the same
 * `slide` the host uses, and is eased towards where the host has it; a collision
 * that lands on it comes from the host, speed and all, and wins.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for
 * everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { clock, isStanding, judgeEnd, leave, move, slide, steer, tick, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot } from './wire'

const SEND_MS = 50
/** A guest says what its hands are doing this often - its facing no oftener - and on every change of walk or run. */
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
  /** Whether run is held. */
  run: boolean
}

export interface Advanced {
  changed: boolean
}

export interface ColorNet {
  advance(game: Game, dt: number, hands: Hands | null, paused: boolean): Advanced
}

export function useColorNet(): ColorNet {
  const intents = useRef(new Map<string, Intent & { at: number }>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const toldAt = useRef(0)
  const told = useRef('')
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

  const advance = (game: Game, dt: number, hands: Hands | null, paused: boolean): Advanced => {
    const net = getNet()
    const now = performance.now()
    if (paused) return { changed: false }

    if (net.host) {
      if (game.players.length === 0) return { changed: false }
      tick(game, dt)
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && hands && clock(game) >= 0) steer(game, me, hands.mx, hands.mz, hands.yaw, hands.run)
      botSteer(game)
      game.players.forEach((p, index) => {
        if (p.bot || p.mine) return
        const intent = intents.current.get(p.id)
        // Not heard from lately: hands off, and it slides to a stop.
        if (!intent || intent.game !== game.id || now - intent.at > QUIET_MS) steer(game, index, 0, 0, p.yaw)
        else steer(game, index, intent.mx, intent.mz, intent.yaw, intent.run)
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
      return { changed: true }
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
    if (game.players.length === 0) return { changed: false }
    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }

    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    if (mine && hands) {
      if (isStanding(mine) && !game.over) {
        mine.yaw = hands.yaw
        mine.mx = hands.mx
        mine.mz = hands.mz
        mine.run = hands.run
      }
      // Slide at once on our own screen, and ease to where the host has us. Its
      // speed for us comes with every snapshot, so a collision it saw is felt here.
      const host = own.current.host
      if (host && isStanding(mine) && !game.over) {
        const step = Math.min(Math.max(dt, 0), 0.1)
        const drawn = own.current.drawn ?? { ...host }
        if (clock(game) >= 0) {
          const v = slide(mine.vx, mine.vz, hands.mx, hands.mz, hands.run, step)
          mine.vx = v.vx
          mine.vz = v.vz
          drawn.x += mine.vx * step
          drawn.z += mine.vz * step
        }
        const off = Math.hypot(host.x - drawn.x, host.z - drawn.z)
        const k = off > 2.5 ? 1 : Math.min(1, step * 6)
        drawn.x += (host.x - drawn.x) * k
        drawn.z += (host.z - drawn.z) * k
        own.current.drawn = drawn
        mine.x = drawn.x
        mine.z = drawn.z
      } else own.current.drawn = null

      const intent = { game: game.id, mx: hands.mx, mz: hands.mz, yaw: hands.yaw, run: hands.run }
      // Walking and running go at once. Turning changes every frame the mouse moves, so it waits
      // its turn - the relay drops anybody sending more than sixty a second.
      const said = `${intent.mx.toFixed(2)}:${intent.mz.toFixed(2)}:${intent.run ? 1 : 0}`
      const turned = now - toldAt.current >= TURN_MS
      if (!game.over && (said !== told.current || turned)) {
        told.current = said
        toldAt.current = now
        sendToRoom(encodeIntent(intent))
      }
    }
    return { changed: true }
  }

  return { advance }
}
