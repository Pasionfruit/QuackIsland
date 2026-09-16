/**
 * The two ends of a shared round.
 *
 * The **host** runs the simulation, takes everybody's keys, and sends out
 * where everything ended up. A **guest** sends its keys and eases its own copy
 * towards whatever comes back. There is one simulation in the lobby and it is
 * the host's, which is what stops two browsers disagreeing about who was
 * caught.
 *
 * Alone, none of this is running: `getNet()` reports you host when there is no
 * lobby, so a solo round is the host path with nobody listening - one code
 * path, not two, and the one everybody exercises.
 *
 * The pure half - what a message looks like, what applying one does - is in
 * `wire.ts` and tested there. This is the part that has to touch a socket.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { crowdIntents } from './ai'
import { NO_INTENT, stepRound, type Intent, type Round } from './round'
import { myId } from './setup'
import {
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  easeTowards,
  encodeIntent,
  encodeSnapshot,
  hearIntent,
  SNAP_DISTANCE,
  type Snapshot,
} from './wire'

/**
 * How often the host sends the arena out, in milliseconds.
 *
 * Twenty a second. Frames are drawn three times that often and the gap is
 * eased across - see `easeTowards` - so this is about how much the wire can
 * carry rather than about how smooth it looks. With the duck updates the
 * island already sends, the host stays well inside the relay's sixty messages
 * a second.
 */
const SEND_MS = 50

/**
 * How often a guest repeats what it is pressing, in milliseconds, even when
 * nothing has changed.
 *
 * A player holding one direction has nothing new to say, but a host that
 * mounted a frame after the key went down never heard it the first time.
 * Saying it again four times a second is what makes a missed message a
 * quarter-second hiccup instead of a body that never moves.
 */
const REPEAT_MS = 250

/**
 * How long the host keeps acting on a guest's keys without hearing them again.
 *
 * Several repeats' worth, so one slow message is not a stumble. Past it the
 * guest has gone - closed the tab, dropped off - and their body stops where it
 * is rather than running into a wall for the rest of the round.
 */
const INTENT_TIMEOUT_MS = 1000

/** How quickly a guest's copy closes the gap to the host's, per second. */
const EASE_RATE = 18

export interface RoundNet {
  /**
   * Moves the round on by a frame: simulates on the host, follows on a guest.
   *
   * Returns whether anything changed, so the screen only asks React to draw
   * when there is something new to draw.
   */
  advance(round: Round, dt: number, mine: Intent, paused: boolean): boolean
}

/** A guest's keys, and when the host last heard them. */
interface Heard {
  intent: Intent
  at: number
}

/**
 * Wires a round into the lobby for as long as it is on screen.
 *
 * Returns one function the screen calls every frame. Everything else - the
 * subscription, the send timers, whose keys are whose - is kept in here.
 */
export function useRoundNet(): RoundNet {
  const heard = useRef(new Map<string, Heard>())
  const latest = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const saidAt = useRef(0)
  const lastSaid = useRef<Intent>(NO_INTENT)

  useEffect(() => {
    const stop = subscribeRoom((from, raw) => {
      if (getNet().host) {
        const intent = decodeIntent(raw)
        if (!intent) return
        const before = heard.current.get(from)?.intent
        heard.current.set(from, { intent: hearIntent(before, intent), at: performance.now() })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = snap
    })
    return () => {
      stop()
      // A guest walking out of a round must not leave their body running in
      // whatever direction they were last holding. The host would otherwise
      // keep it going until the timeout, straight into the nearest wall.
      if (!getNet().host) sendToRoom(encodeIntent(NO_INTENT))
    }
  }, [])

  const advance = (round: Round, dt: number, mine: Intent, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()
    // Pausing is personal. Alone, it stops the clock; in a lobby it stops only
    // your hands, because the round is everybody's and not yours to stop.
    const mineNow = paused ? NO_INTENT : mine

    if (net.host) {
      const shared = net.status === 'joined' && net.peers > 0
      let stepped = false
      if (!round.over && (!paused || shared)) {
        // Everything nobody is driving, then everybody who is.
        const intents = crowdIntents(round)
        for (const [id, entry] of heard.current) {
          intents.set(id, now - entry.at > INTENT_TIMEOUT_MS ? NO_INTENT : entry.intent)
          // A push is one frame's worth. Left in the map it would fire every
          // frame until the guest next said anything at all.
          if (entry.intent.push) entry.intent = { ...entry.intent, push: false }
        }
        intents.set(myId(), mineNow)
        stepRound(round, intents, dt)
        stepped = true
      }

      // Sent whether or not anything moved: a round that has just ended has
      // to reach everybody as ended, and a guest arriving late still needs to
      // be shown the board.
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(round))
      }
      return stepped
    }

    // A guest: say what you are pressing, and follow what comes back.
    if (changed(mineNow, lastSaid.current) || mineNow.push || now - saidAt.current >= REPEAT_MS) {
      // Remembered without the push, so the repeat does not throw it again.
      lastSaid.current = { ...mineNow, push: false }
      saidAt.current = now
      sendToRoom(encodeIntent(mineNow))
    }

    const snap = latest.current
    if (!snap) return false
    // Where the host says everything is, then eased towards over the frames
    // between one snapshot and the next.
    const was = new Map(round.bodies.map((b) => [b.id, { x: b.x, y: b.y }]))
    applySnapshot(round, snap, myId())
    const rate = 1 - Math.exp(-EASE_RATE * Math.min(dt, 0.1))
    for (const body of round.bodies) {
      const from = was.get(body.id)
      if (!from) continue
      // A body that has moved a long way has not walked there - it was caught
      // up after a gap in the messages, or dealt into a fresh round. Easing
      // that is watching somebody swim.
      if (Math.hypot(body.x - from.x, body.y - from.y) > SNAP_DISTANCE) continue
      body.x = easeTowards(from.x, body.x, rate)
      body.y = easeTowards(from.y, body.y, rate)
    }
    return true
  }

  return { advance }
}

/** Whether what somebody is pressing is different enough to be worth saying. */
function changed(now: Intent, before: Intent): boolean {
  return Math.abs(now.x - before.x) > 0.01 || Math.abs(now.y - before.y) > 0.01
}
