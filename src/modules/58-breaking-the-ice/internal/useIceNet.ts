/**
 * The two ends of a shared round.
 *
 * The **host** runs the round: its own keys, the stand-ins', and every
 * guest's as they arrive, then sends where everybody is - often, since
 * position wants to be smooth - and separately, the sparse set of ice a
 * player has actually damaged, only when it has changed and at least once a
 * second regardless, so a dropped message heals itself within a beat. A
 * **guest** sends its movement, yaw and running action counts, and eases
 * toward what comes back.
 *
 * The same arrangement, and the same lessons, as the other minigames: intents
 * are repeated and forgotten after a silence; a guest walking out sends
 * "standing still"; a guest keeps listening after the round ends; the host
 * never runs or sends a round nobody was dealt into; a pause stops the round
 * for everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botIntents } from './ai'
import { stepRound, type Intent, type Round } from './rules'
import { myId } from './setup'
import {
  applySnapshot,
  applyTiles,
  decodeIntent,
  decodeSnapshot,
  decodeTiles,
  encodeIntent,
  encodeSnapshot,
  encodeTiles,
  sparseDamage,
  type Snapshot,
  type TileSync,
} from './wire'

const SEND_MS = 50
const REPEAT_MS = 250
/** Past this, a guest stops moving on the host - but its counts are never forgotten. */
const INTENT_TIMEOUT_MS = 1000
const TILE_SYNC_MS = 1000
const EASE_RATE = 18
const SNAP_DISTANCE = 3

export interface RoundNet {
  /** Moves the round on a frame. `mine` is this browser's keys, yaw and counts. */
  advance(round: Round, dt: number, mine: Intent, paused: boolean): boolean
}

export function useIceNet(): RoundNet {
  const heard = useRef(new Map<string, { intent: Intent; round: number; at: number }>())
  const lastCounts = useRef({ breaks: 0, jumps: 0, pushes: 0 })
  const lastRound = useRef(0)
  const latest = useRef<Snapshot | null>(null)
  const latestTiles = useRef<TileSync | null>(null)
  const sentAt = useRef(0)
  const tilesSentAt = useRef(0)
  const lastTileDamage = useRef('')
  const saidAt = useRef(0)
  const lastSaid = useRef('')

  useEffect(() => {
    const stop = subscribeRoom((from, raw) => {
      if (getNet().host) {
        const said = decodeIntent(raw)
        if (said) heard.current.set(from, { ...said, at: performance.now() })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) {
        latest.current = snap
        return
      }
      const tiles = decodeTiles(raw)
      if (tiles) latestTiles.current = tiles
    })
    return () => {
      stop()
      // Walking out of a round must not leave your body moving.
      if (!getNet().host) {
        sendToRoom(encodeIntent({ x: 0, z: 0, yaw: 0, ...lastCounts.current }, lastRound.current))
      }
    }
  }, [])

  const advance = (round: Round, dt: number, mine: Intent, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()
    const wish: Intent = paused ? { ...mine, x: 0, z: 0 } : mine
    lastCounts.current = { breaks: wish.breaks, jumps: wish.jumps, pushes: wish.pushes }
    lastRound.current = round.id

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // the host's own simulation included, so a card behind it is never a lie.
    if (paused) return false

    if (net.host) {
      if (round.players.length === 0) return false
      let stepped = false
      if (!round.over) {
        const intents = botIntents(round)
        for (const [id, entry] of heard.current) {
          if (entry.round !== round.id) continue
          const quiet = now - entry.at > INTENT_TIMEOUT_MS
          intents.set(id, quiet ? { ...entry.intent, x: 0, z: 0 } : entry.intent)
        }
        intents.set(myId(), wish)
        stepRound(round, intents, dt)
        stepped = true
      }
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(round))
      }
      if (net.status === 'joined') {
        const damage = JSON.stringify(sparseDamage(round))
        const due = now - tilesSentAt.current >= TILE_SYNC_MS
        if (damage !== lastTileDamage.current || due) {
          lastTileDamage.current = damage
          tilesSentAt.current = now
          sendToRoom(encodeTiles(round))
        }
      }
      return stepped
    }

    const said = `${round.id}:${wish.x.toFixed(2)}:${wish.z.toFixed(2)}:${wish.yaw.toFixed(2)}:${wish.breaks}:${wish.jumps}:${wish.pushes}`
    if (round.id !== 0 && (said !== lastSaid.current || now - saidAt.current >= REPEAT_MS)) {
      lastSaid.current = said
      saidAt.current = now
      sendToRoom(encodeIntent(wish, round.id))
    }

    // Re-applied every frame, same as the snapshot below: idempotent, and it
    // means a tile sync that arrives for a round not yet begun on this guest
    // (its id does not match yet) is simply retried until `applySnapshot`
    // catches the round id up, a frame or two later.
    const tiles = latestTiles.current
    if (tiles) applyTiles(round, tiles)

    const snap = latest.current
    if (!snap) return false
    const fresh = round.id !== snap.id
    const was = new Map(round.players.map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]))
    applySnapshot(round, snap, myId())
    if (fresh) return true
    const rate = 1 - Math.exp(-EASE_RATE * Math.min(dt, 0.1))
    for (const p of round.players) {
      const from = was.get(p.id)
      if (!from || Math.hypot(p.x - from.x, p.z - from.z) > SNAP_DISTANCE) continue
      p.x = from.x + (p.x - from.x) * rate
      p.y = from.y + (p.y - from.y) * rate
      p.z = from.z + (p.z - from.z) * rate
    }
    return true
  }

  return { advance }
}
