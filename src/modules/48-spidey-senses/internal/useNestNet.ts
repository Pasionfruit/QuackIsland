/**
 * The two ends of a shared cellar.
 *
 * The **host** runs the game - the clock, everybody's creeping, every stop, who
 * the spider takes and the rounds - from its own hands, the stand-ins', and what
 * each guest says its hands are doing, and sends it twenty times a second. When
 * the trapdoor springs is not sent: every screen works it out from the seed.
 *
 * A **guest** sends which way it is creeping and, once it clicks, **when it
 * clicked by its own clock** - so it is judged on its reactions, not its ping.
 * Its own player creeps at once on its own screen and **stops dead the moment it
 * clicks**, without waiting to hear back; it is eased towards where the host has
 * it. Who the spider takes is the host's word.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out; a pause stops the round for
 * everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSteer } from './ai'
import { when } from './nest'
import { advanceRounds, canCreep, creep, isStanding, judgeEnd, leave, move, roundNow, steer, stop, tick, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot } from './wire'

const SEND_MS = 50
/** A guest repeats its hands this often, and says them at once when they change. */
const INTENT_MS = 100
const QUIET_MS = 500
const SNAP_SECONDS = 0.4

/** What your hands are doing this frame. */
export interface Hands {
  /** Creeping in (negative is back), and round. */
  toward: number
  around: number
  /** Clicked since the last frame. */
  clicked: boolean
}

export interface NestNet {
  /** Whether anything changed, and whether your click stopped you this frame. */
  advance(game: Game, dt: number, hands: Hands | null, paused: boolean): { changed: boolean; stopped: boolean }
}

export function useNestNet(): NestNet {
  const intents = useRef(new Map<string, Intent & { at: number }>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const toldAt = useRef(0)
  const told = useRef('')
  /** A guest's own click this round: when, by its clock. */
  const clicked = useRef<{ game: number; round: number; at: number } | null>(null)
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
    if (paused) return { changed: false, stopped: false }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, stopped: false }
      tick(game, dt)
      let stopped = false
      const me = game.players.findIndex((p) => p.mine)
      if (me >= 0 && hands) {
        steer(game, me, hands.toward, hands.around)
        if (hands.clicked) stopped = stop(game, me)
      }
      botSteer(game)
      const round = roundNow(game).round
      game.players.forEach((p, index) => {
        if (p.bot || p.mine) return
        const intent = intents.current.get(p.id)
        if (!intent || intent.game !== game.id || now - intent.at > QUIET_MS) steer(game, index, 0, 0)
        else steer(game, index, intent.toward, intent.around)
        // A click is believed from the guest's own clock, whenever it arrives in the round it was made.
        if (intent && intent.game === game.id && intent.stop && intent.stop.round === round && p.stoppedAt === null) stop(game, index, intent.stop.at)
      })
      advanceRounds(game)
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
      return { changed: true, stopped }
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
    if (game.players.length === 0) return { changed: false, stopped: false }
    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }

    const mine = game.players.find((p) => p.mine)
    let stopped = false
    if (mine && hands) {
      const round = when(game.seed, game.elapsed).round.round
      const mineNow = clicked.current && clicked.current.game === game.id && clicked.current.round === round ? clicked.current : null
      // Our own click stands until the host has it: we stop dead at once.
      if (mineNow && mine.stoppedAt === null && isStanding(mine)) mine.stoppedAt = mineNow.at
      if (hands.clicked && canCreep(game, mine)) {
        clicked.current = { game: game.id, round, at: game.elapsed }
        mine.stoppedAt = game.elapsed
        stopped = true
      }
      // Creep at once on our own screen, and ease to where the host has us.
      const host = own.current.host
      if (host && isStanding(mine) && !game.over) {
        const step = Math.min(Math.max(dt, 0), 0.1)
        const drawn = own.current.drawn ?? { ...host }
        if (canCreep(game, mine)) {
          const walker = { ...mine, x: drawn.x, z: drawn.z, toward: hands.toward, around: hands.around }
          creep(walker, step)
          drawn.x = walker.x
          drawn.z = walker.z
        }
        const off = Math.hypot(host.x - drawn.x, host.z - drawn.z)
        // Stopped, it settles gently onto where the host stopped it rather than sliding.
        const k = off > 1.5 ? 1 : Math.min(1, step * (mine.stoppedAt === null ? 4 : 2))
        drawn.x += (host.x - drawn.x) * k
        drawn.z += (host.z - drawn.z) * k
        own.current.drawn = drawn
        mine.x = drawn.x
        mine.z = drawn.z
        mine.yaw = Math.atan2(drawn.x, drawn.z)
      } else own.current.drawn = null

      const said = clicked.current && clicked.current.game === game.id && clicked.current.round === round ? clicked.current : null
      const intent: Intent = { game: game.id, toward: hands.toward, around: hands.around, stop: said ? { at: said.at, round: said.round } : null }
      const key = `${intent.toward.toFixed(2)}:${intent.around.toFixed(2)}:${said ? said.at.toFixed(2) : '-'}`
      if (!game.over && (key !== told.current || now - toldAt.current >= INTENT_MS)) {
        told.current = key
        toldAt.current = now
        sendToRoom(encodeIntent(intent))
      }
    }
    return { changed: true, stopped }
  }

  return { advance }
}

