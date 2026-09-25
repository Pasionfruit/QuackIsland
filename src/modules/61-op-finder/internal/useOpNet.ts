/**
 * The two ends of a shared round.
 *
 * The **host** runs the round: its own progress, the stand-ins', every
 * guest's as they report it, then sends where everybody has got to. A
 * **guest** sends its own running stage and mistake count, and answers its
 * own challenges locally the instant it makes a guess - it does not wait for
 * the host to say so, the same optimism every other minigame's own input
 * gets, before the next snapshot confirms or (rarely, if it somehow got
 * ahead of the anti-cheat floor) gently corrects it.
 *
 * The same arrangement as the other minigames: intents are repeated and
 * forgotten after a silence; a guest keeps listening after the round ends; a
 * pause stops the round for everybody.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botIntents } from './ai'
import { stepRound, type Intent, type Round } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 100
const REPEAT_MS = 300
/** Past this, a guest's own report is stale, but never forgotten. */
const INTENT_TIMEOUT_MS = 2000

export interface RoundNet {
  /** Moves the round on a frame. `mine` is this browser's own running stage and mistakes. */
  advance(round: Round, dt: number, mine: Intent, paused: boolean): boolean
}

export function useOpNet(): RoundNet {
  const heard = useRef(new Map<string, { intent: Intent; round: number; at: number }>())
  const lastMine = useRef<Intent>({ stage: 0, mistakes: 0 })
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
      // Walking out of a round must not leave the host still waiting on it.
      if (!getNet().host) sendToRoom(encodeIntent(lastMine.current, lastRound.current))
    }
  }, [])

  const advance = (round: Round, dt: number, mine: Intent, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()
    lastMine.current = mine
    lastRound.current = round.id

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // the host's own simulation included.
    if (paused) return false

    if (net.host) {
      if (round.players.length === 0) return false
      let stepped = false
      if (!round.over) {
        const intents = botIntents(round)
        for (const [id, entry] of heard.current) {
          if (entry.round !== round.id) continue
          if (now - entry.at > INTENT_TIMEOUT_MS) continue
          intents.set(id, entry.intent)
        }
        intents.set(myId(), mine)
        stepRound(round, intents, dt)
        stepped = true
      }
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(round))
      }
      return stepped
    }

    const said = `${round.id}:${mine.stage}:${mine.mistakes}`
    if (round.id !== 0 && (said !== lastSaid.current || now - saidAt.current >= REPEAT_MS)) {
      lastSaid.current = said
      saidAt.current = now
      sendToRoom(encodeIntent(mine, round.id))
    }

    const snap = latest.current
    if (!snap) return false
    applySnapshot(round, snap, myId())
    // Your own progress is never rolled back by a snapshot that has not
    // caught up yet - only ever forward, once the host's clamp agrees.
    const mySelf = round.players.find((p) => p.mine)
    if (mySelf && mySelf.stage < mine.stage) mySelf.stage = mine.stage
    return true
  }

  return { advance }
}
