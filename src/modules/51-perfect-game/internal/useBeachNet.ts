/**
 * The two ends of a shared beach.
 *
 * The **host** runs the clock and the turns, and takes the thrower's aim - its
 * own hands, a stand-in's, or what a guest thrower says - and their roll. It
 * sends a snapshot twenty times a second. The column, and the crabs a throw
 * hits, every screen works out for itself.
 *
 * **On a guest's own turn** its aim is its own: it moves and aims on its own
 * screen at once, rolls the moment it clicks, and tells the host where it is
 * aiming and when it rolled, by its own clock. Everybody else watches the aim as
 * the host sends it.
 *
 * The same lessons as the other minigames: a guest keeps listening after the
 * game ends; somebody who leaves the lobby is out, and a thrower who leaves
 * forfeits their turn; a pause stops the round for everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botAim } from './ai'
import { clampThrow } from './beach'
import { advanceTurn, aimTo, judgeEnd, leave, phaseOf, roll, tick, thrower, type Game } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Intent, type Snapshot } from './wire'

const SEND_MS = 50
const INTENT_MS = 50
const SNAP_SECONDS = 0.4

/** What your hands are doing this frame, on your turn: where you would stand and aim, and whether you clicked to roll. */
export interface Hands {
  aim: { x: number; z: number; angle: number }
  rolled: boolean
}

export interface BeachNet {
  /** Whether anything changed, and whether your click rolled it this frame. */
  advance(game: Game, dt: number, hands: Hands | null, paused: boolean): { changed: boolean; rolled: boolean }
}

export function useBeachNet(): BeachNet {
  const intents = useRef(new Map<string, Intent>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const toldAt = useRef(0)

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
    if (paused) return { changed: false, rolled: false }

    if (net.host) {
      if (game.players.length === 0) return { changed: false, rolled: false }
      tick(game, dt)
      let rolled = false
      const who = thrower(game)
      const p = game.players[who]
      if (p?.mine && hands) {
        aimTo(game, who, hands.aim.x, hands.aim.z, hands.aim.angle)
        if (hands.rolled) rolled = roll(game, who)
      } else if (p && !p.bot) {
        const intent = intents.current.get(p.id)
        if (intent && intent.game === game.id && intent.turn === game.turn) {
          aimTo(game, who, intent.aim.x, intent.aim.z, intent.aim.angle)
          if (intent.rolledAt !== null) roll(game, who, intent.rolledAt)
        }
      }
      botAim(game, dt)
      if (net.status === 'joined') {
        const here = new Set(getPeers().map((q) => q.id))
        game.players.forEach((q, index) => {
          if (!q.bot && !q.mine && !q.left && !here.has(q.id)) leave(game, index)
        })
      }
      advanceTurn(game)
      judgeEnd(game)
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return { changed: true, rolled }
    }

    // A guest. The host's word first, then the clock, then our own hands on our own turn.
    const heardFrom = latest.current
    const before = game.id
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return { changed: false, rolled: false }
    tick(game, dt)
    if (heardFrom && !game.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = game.elapsed
      game.elapsed =
        before !== game.id || Math.abs(hostElapsed - ours) > SNAP_SECONDS ? hostElapsed : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }
    let rolled = false
    const who = thrower(game)
    if (who >= 0 && game.players[who].mine && hands) {
      if (phaseOf(game) === 'aim') {
        game.aim = clampThrow(hands.aim.x, hands.aim.z, hands.aim.angle)
        if (hands.rolled) rolled = roll(game, who)
      }
      if (!game.over && now - toldAt.current >= INTENT_MS) {
        toldAt.current = now
        sendToRoom(encodeIntent({ game: game.id, turn: game.turn, aim: game.aim, rolledAt: game.rolledAt }))
      }
    }
    return { changed: true, rolled }
  }

  return { advance }
}
