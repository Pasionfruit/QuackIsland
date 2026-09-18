/**
 * The two ends of a shared round.
 *
 * The **host** runs the round: everybody's walking and swings - its own, the
 * stand-ins', the guests' as they arrive - whacks and scores, and sends it all
 * twenty times a second. A **guest** sends which way it is walking and its
 * running swing count, and draws what comes back.
 *
 * **A guest walks its own body, and swings its own hammer, itself.** Lining up
 * with a hole a round trip behind your keys is miserable, so a guest moves its
 * own whacker the moment a key goes down, the same way the host does, and only
 * drifts back to the host's word - gently while walking, quickly once still, at
 * once if far out. Its hammer comes down the moment it clicks; whether the mole
 * was whacked, and by whom, is the host's to say. Everybody else eases towards
 * where the host says. The moles need nothing: every browser has them from the
 * seed, against a clock eased to the host's.
 *
 * The same lessons as the other minigames: intents are repeated and forgotten
 * after a silence; a swing is a running count; an intent is for one round; a
 * guest keeps listening after the round ends; a pause stops the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botIntents } from './ai'
import { FIELD, canSwing, stepGame, walk, type Game, type Intent } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 50
const REPEAT_MS = 250
/** Past this, a guest stops walking on the host - but its swings are never forgotten. */
const INTENT_TIMEOUT_MS = 1000
const EASE_RATE = 14
/** How fast a guest's own body drifts to the host's word: walking, and standing still. */
const OWN_DRIFT = { walking: 0.6, still: 5 }
/** Past this far from the host's word, a body jumps to it. */
const SNAP_DISTANCE = 2.5
const SNAP_SECONDS = 0.5

export interface FieldNet {
  /** Moves the round on a frame. `walking` is this browser's keys; `swung` whether it clicked this frame. */
  advance(game: Game, dt: number, walking: { x: number; y: number }, swung: boolean, paused: boolean): boolean
}

export function useFieldNet(): FieldNet {
  const heard = useRef(new Map<string, { intent: Intent; game: number; at: number }>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const saidAt = useRef(0)
  const lastSaid = useRef('')
  const swings = useRef({ game: 0, count: 0 })

  useEffect(() => {
    const stop = subscribeRoom((from, raw) => {
      if (getNet().host) {
        const said = decodeIntent(raw)
        if (said) heard.current.set(from, { ...said, at: performance.now() })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
    return () => {
      stop()
      // Walking out of the round must not leave your body walking.
      const said = swings.current
      if (!getNet().host && said.game !== 0) sendToRoom(encodeIntent({ x: 0, y: 0, swings: said.count }, said.game))
    }
  }, [])

  const advance = (game: Game, dt: number, walking: { x: number; y: number }, swung: boolean, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()
    const wish = paused ? { x: 0, y: 0 } : walking
    if (swings.current.game !== game.id) swings.current = { game: game.id, count: 0 }

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // so this stops dead - the host's own simulation included. A round that
    // carried on behind the card would make the card a lie. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return false

    if (net.host) {
      if (game.players.length === 0) return false

      const me = game.players.findIndex((p) => p.mine)
      const intents = botIntents(game)
      if (me >= 0) {
        if (swung && !paused && canSwing(game, me)) swings.current.count += 1
        intents.set(game.players[me].id, { ...wish, swings: swings.current.count })
      }
      for (const [id, entry] of heard.current) {
        // Last round's swings are not this round's.
        if (entry.game !== game.id) continue
        const quiet = now - entry.at > INTENT_TIMEOUT_MS
        intents.set(id, quiet ? { x: 0, y: 0, swings: entry.intent.swings } : entry.intent)
      }
      stepGame(game, intents, dt)

      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(game))
      }
      return true
    }

    // A guest. The host's word first.
    const heardFrom = latest.current
    const step = Math.min(Math.max(dt, 0), 0.1)
    const mineBefore = game.players.find((p) => p.mine)
    const ownBefore = mineBefore ? { x: mineBefore.x, y: mineBefore.y, facing: mineBefore.facing } : null
    const was = new Map(game.players.map((p) => [p.id, { x: p.x, y: p.y }]))
    const before = { id: game.id, elapsed: game.elapsed }
    let hostAt: Map<string, { x: number; y: number; facing: number }> | null = null
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      hostAt = applySnapshot(game, heardFrom.snap, myId())
    }
    if (game.players.length === 0) return false

    // The clock - which is the moles - runs on between snapshots.
    if (heardFrom && !game.over) {
      const hostNow = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = before.elapsed + step
      game.elapsed = before.id !== game.id || Math.abs(hostNow - ours) > SNAP_SECONDS ? hostNow : ours + (hostNow - ours) * Math.min(1, step * 6)
      game.elapsed = Math.max(0, Math.min(FIELD.duration, game.elapsed))
    }

    const rate = 1 - Math.exp(-EASE_RATE * step)
    for (const whacker of game.players) {
      const target = hostAt?.get(whacker.id) ?? null
      if (whacker.mine) {
        if (ownBefore) Object.assign(whacker, ownBefore)
        else if (target) Object.assign(whacker, target)
        if (!game.over) walk(whacker, wish, step)
        if (target) {
          const off = Math.hypot(target.x - whacker.x, target.y - whacker.y)
          if (off > SNAP_DISTANCE) {
            whacker.x = target.x
            whacker.y = target.y
          } else {
            const moving = Math.hypot(wish.x, wish.y) > 0
            const drift = 1 - Math.exp(-(moving ? OWN_DRIFT.walking : OWN_DRIFT.still) * Math.max(step, 0.05))
            whacker.x += (target.x - whacker.x) * drift
            whacker.y += (target.y - whacker.y) * drift
          }
        }
        continue
      }
      if (!target) continue
      const from = was.get(whacker.id)
      if (!from || Math.hypot(target.x - from.x, target.y - from.y) > SNAP_DISTANCE) {
        Object.assign(whacker, target)
      } else {
        whacker.x = from.x + (target.x - from.x) * rate
        whacker.y = from.y + (target.y - from.y) * rate
        whacker.facing = target.facing
      }
    }

    // Our own swing: the hammer comes down now, and the count goes to the host.
    const me = game.players.findIndex((p) => p.mine)
    const mine = game.players[me]
    let changed = false
    if (swung && !paused && mine && canSwing(game, me)) {
      swings.current.count += 1
      mine.swungAt = game.elapsed
      changed = true
    }
    const text = `${game.id}:${wish.x.toFixed(2)}:${wish.y.toFixed(2)}:${swings.current.count}`
    if (game.id !== 0 && (changed || text !== lastSaid.current || now - saidAt.current >= REPEAT_MS)) {
      lastSaid.current = text
      saidAt.current = now
      sendToRoom(encodeIntent({ ...wish, swings: swings.current.count }, game.id))
    }
    return true
  }

  return { advance }
}
