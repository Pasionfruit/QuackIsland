/**
 * The two ends of a shared kitchen.
 *
 * The **host** runs the game - the clock, the turns, the stand-ins - and decides
 * every dish by running the drawer's pen through the rules as it arrives. It
 * sends a snapshot ten times a second.
 *
 * **Whoever is drawing** - host or guest - draws on their own screen, where the
 * pen has to feel immediate, and sends their pen to everybody twenty times a
 * second. **Everybody watching** runs it through the same rules, so they see the
 * drawing as it is made and the duck eat it when it is done, and the host's
 * snapshot keeps the turn, the outline and the scores honest.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out, and a drawer who leaves ends
 * their turn; pausing in a lobby stops only your hands. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botDraw } from './ai'
import { drawer, leave, penDown, penMove, penUp, stepGame, tick, type Game } from './rules'
import { myId } from './setup'
import { MAX_POINTS, applyInk, applySnapshot, decodeInk, decodeSnapshot, encodeInk, encodeSnapshot, type Ink, type Snapshot } from './wire'

const SEND_MS = 100
const INK_MS = 50
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.4

export type PenResult = 'down' | 'accepted' | 'drawn' | 'wiped' | null

export interface InkNet {
  /** Moves the game on a frame. Whether anything changed. */
  advance(game: Game, dt: number, paused: boolean): boolean
  /** Your pen, at (`x`, `y`) on the board: going down, moving, or coming up. */
  pen(game: Game, kind: 'down' | 'move' | 'up', x: number, y: number): PenResult
}

export function useInkNet(): InkNet {
  const inks = useRef<{ from: string; ink: Ink }[]>([])
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const pending = useRef<Ink | null>(null)
  const inkedAt = useRef(0)

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      const ink = decodeInk(raw)
      if (ink) {
        inks.current.push({ from, ink })
        return
      }
      if (getNet().host) return
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const flush = () => {
    const ink = pending.current
    if (!ink || (ink.points.length === 0 && !ink.up)) return
    if (getNet().status === 'joined') sendToRoom(encodeInk(ink))
    inkedAt.current = performance.now()
    pending.current = ink.up ? null : { ...ink, points: [] }
  }

  /** Everybody's pen but your own, in the order it arrived, from whoever is drawing. */
  const drawOthers = (game: Game) => {
    for (const { from, ink } of inks.current.splice(0)) {
      const player = game.players.findIndex((p) => p.id === from)
      if (player >= 0 && player === drawer(game) && !game.players[player].mine) applyInk(game, player, ink)
    }
  }

  const advance = (game: Game, dt: number, paused: boolean) => {
    const net = getNet()
    const now = performance.now()
    if (pending.current && pending.current.points.length > 0 && now - inkedAt.current >= INK_MS) flush()

    if (net.host) {
      if (game.players.length === 0) return false
      const shared = net.status === 'joined' && net.peers > 0
      if (paused && !shared) return false
      drawOthers(game)
      botDraw(game, dt)
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

    // A guest. The host's word first, then the drawer's pen, then the clock.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return false
    drawOthers(game)
    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }
    return true
  }

  const pen = (game: Game, kind: 'down' | 'move' | 'up', x: number, y: number): PenResult => {
    const me = game.players.findIndex((p) => p.mine)
    if (me < 0 || me !== drawer(game)) return null
    // What goes on the wire is the point the stroke recorded - on the board, to the thousandth - not the raw pointer.
    const recorded = (points: number[]) => [Math.round(points[points.length - 2] * 1000), Math.round(points[points.length - 1] * 1000)]
    if (kind === 'down') {
      if (!penDown(game, me, x, y)) return null
      flush()
      pending.current = { game: game.id, turn: game.turn, outline: game.outline, stroke: game.stroke!.id, points: recorded(game.stroke!.points), up: false }
      return 'down'
    }
    if (kind === 'move') {
      const stroke = game.stroke
      if (!stroke) return null
      const had = stroke.points.length
      const result = penMove(game, me, x, y)
      if (result && pending.current?.stroke === stroke.id && stroke.points.length > had) pending.current.points.push(...recorded(stroke.points))
      if (pending.current && pending.current.points.length >= MAX_POINTS * 2) flush()
      if (result === 'accepted') flush()
      return result
    }
    const stroke = game.stroke?.id ?? game.strokes
    const result = penUp(game, me)
    if (!pending.current || pending.current.stroke !== stroke) {
      flush()
      pending.current = { game: game.id, turn: game.turn, outline: game.outline, stroke, points: [], up: false }
    }
    pending.current.up = true
    flush()
    return result
  }

  return { advance, pen }
}
