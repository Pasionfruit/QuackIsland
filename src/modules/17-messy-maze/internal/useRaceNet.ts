/**
 * The two ends of a shared race.
 *
 * The **host** runs the race: it hears which letters everybody is holding,
 * reads them through each racer's binding, steps the race, and sends it out. A
 * **guest** sends its letters and eases towards whatever comes back. One race
 * in the lobby, so nobody disagrees about who got in first or what anybody's
 * keys are.
 *
 * Alone, you are your own host with nobody listening - one path, not two.
 *
 * The same arrangement as Zombie Tag's, for the same reasons, and with the
 * same lessons already learned: keys are repeated and forgotten after a
 * silence, leaving says "nothing held", a guest keeps listening after the race
 * ends, and pausing in a lobby stops only your hands.
 */
import { useEffect, useRef } from 'react'
import { getNet, sendToRoom, subscribeRoom } from '../../09-net'
import { botDirections } from './ai'
import { directionFor } from './bindings'
import { stepRace, type Race } from './race'
import { myId } from './setup'
import type { Point } from './maze'
import {
  applySnapshot,
  decodeKeys,
  decodeSnapshot,
  encodeKeys,
  encodeSnapshot,
  type Snapshot,
} from './wire'

/** How often the host sends the race, in milliseconds. Twenty a second. */
const SEND_MS = 50
/** How often a guest repeats what it is holding, changed or not. */
const REPEAT_MS = 250
/** How long the host keeps acting on letters it has not heard again. */
const KEYS_TIMEOUT_MS = 1000
/** How quickly a guest's copy closes the gap to the host's, per second. */
const EASE_RATE = 18
/** Past this, a guest's racer is snapped rather than eased: it did not walk there. */
const SNAP_DISTANCE = 4

export interface RaceNet {
  /**
   * Moves the race on a frame: runs it on the host, follows it on a guest.
   * Returns whether anything changed, so the screen draws only when it has to.
   */
  advance(race: Race, dt: number, held: string, paused: boolean): boolean
}

export function useRaceNet(): RaceNet {
  const heard = useRef(new Map<string, { keys: string; at: number }>())
  const latest = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const saidAt = useRef(0)
  const lastSaid = useRef('')

  useEffect(() => {
    const stop = subscribeRoom((from, raw) => {
      if (getNet().host) {
        const keys = decodeKeys(raw)
        if (keys !== null) heard.current.set(from, { keys, at: performance.now() })
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = snap
    })
    return () => {
      stop()
      // Walking out of a race must not leave your racer walking.
      if (!getNet().host) sendToRoom(encodeKeys(''))
    }
  }, [])

  const advance = (race: Race, dt: number, held: string, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()
    const mine = paused ? '' : held

    if (net.host) {
      const shared = net.status === 'joined' && net.peers > 0
      let stepped = false
      if (!race.over && race.racers.length > 0 && (!paused || shared)) {
        const directions: Map<string, Point> = botDirections(race)
        const me = myId()
        for (const racer of race.racers) {
          if (racer.bot) continue
          let keys = ''
          if (racer.id === me) keys = mine
          else {
            const entry = heard.current.get(racer.id)
            if (entry && now - entry.at <= KEYS_TIMEOUT_MS) keys = entry.keys
          }
          // Read through the binding the racer has *now*, which is the whole
          // trick: a spin on this frame changes what those letters do on the next.
          directions.set(racer.id, directionFor(racer.binding, keys))
        }
        stepRace(race, directions, dt)
        stepped = true
      }
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(race))
      }
      return stepped
    }

    if (mine !== lastSaid.current || now - saidAt.current >= REPEAT_MS) {
      lastSaid.current = mine
      saidAt.current = now
      sendToRoom(encodeKeys(mine))
    }

    const snap = latest.current
    if (!snap) return false
    const newRace = race.seed !== snap.seed
    const was = new Map(race.racers.map((r) => [r.id, { x: r.x, y: r.y }]))
    applySnapshot(race, snap, myId())
    if (newRace) return true
    const rate = 1 - Math.exp(-EASE_RATE * Math.min(dt, 0.1))
    for (const racer of race.racers) {
      const from = was.get(racer.id)
      if (!from) continue
      if (Math.hypot(racer.x - from.x, racer.y - from.y) > SNAP_DISTANCE) continue
      racer.x = from.x + (racer.x - from.x) * rate
      racer.y = from.y + (racer.y - from.y) * rate
    }
    return true
  }

  return { advance }
}
