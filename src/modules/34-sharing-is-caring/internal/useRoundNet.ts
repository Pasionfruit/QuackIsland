/**
 * The two ends of a shared round.
 *
 * The **host** runs the round: its own keys, the stand-ins', and every guest's
 * as they arrive, then sends where everybody is, who wears the crown and the
 * scores. A **guest** sends which way it is walking and eases towards what
 * comes back. One round in the lobby, so nobody disagrees about who has it.
 *
 * The same arrangement as the other minigames: intents are repeated and
 * forgotten after a silence; a guest walking out sends "standing still"; the
 * host never runs or sends a round nobody was dealt into; a pause stops the round for everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botIntents } from './ai'
import { stepRound, type Intent, type Round } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 50
const REPEAT_MS = 250
/** Past this, a guest stops walking on the host. */
const INTENT_TIMEOUT_MS = 1000
const EASE_RATE = 18
const SNAP_DISTANCE = 3

export interface RoundNet {
  /** Moves the round on a frame. `mine` is this browser's keys. */
  advance(round: Round, dt: number, mine: Intent, paused: boolean): boolean
}

export function useRoundNet(): RoundNet {
  const heard = useRef(new Map<string, { intent: Intent; round: number; at: number }>())
  const lastRound = useRef(0)
  const latest = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
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
      if (snap) latest.current = snap
    })
    return () => {
      stop()
      // Walking out of a round must not leave your body walking.
      if (!getNet().host) sendToRoom(encodeIntent({ x: 0, y: 0 }, lastRound.current))
    }
  }, [])

  const advance = (round: Round, dt: number, mine: Intent, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()
    const wish: Intent = paused ? { x: 0, y: 0 } : mine
    lastRound.current = round.id

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // so this stops dead - the host's own simulation included. A round that
    // carried on behind the card would make the card a lie. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return false

    if (net.host) {
      if (round.players.length === 0) return false
      let stepped = false
      if (!round.over && !paused) {
        const intents = botIntents(round)
        for (const [id, entry] of heard.current) {
          if (entry.round !== round.id || now - entry.at > INTENT_TIMEOUT_MS) continue
          intents.set(id, entry.intent)
        }
        intents.set(myId(), wish)
        stepRound(round, intents, dt)
        stepped = true
      }
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(round))
      }
      return stepped
    }

    // Nothing to say until there is a round to say it about.
    const said = `${round.id}:${wish.x.toFixed(2)}:${wish.y.toFixed(2)}:${wish.boost ? 1 : 0}`
    if (round.id !== 0 && (said !== lastSaid.current || now - saidAt.current >= REPEAT_MS)) {
      lastSaid.current = said
      saidAt.current = now
      sendToRoom(encodeIntent(wish, round.id))
    }

    const snap = latest.current
    if (!snap) return false
    const fresh = round.id !== snap.id
    const was = new Map(round.players.map((p) => [p.id, { x: p.x, y: p.y }]))
    applySnapshot(round, snap, myId())
    if (fresh) return true
    const rate = 1 - Math.exp(-EASE_RATE * Math.min(dt, 0.1))
    for (const p of round.players) {
      const from = was.get(p.id)
      if (!from || Math.hypot(p.x - from.x, p.y - from.y) > SNAP_DISTANCE) continue
      p.x = from.x + (p.x - from.x) * rate
      p.y = from.y + (p.y - from.y) * rate
    }
    return true
  }

  return { advance }
}
