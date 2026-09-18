/**
 * The two ends of a shared race.
 *
 * The **host** runs the clock, takes everybody's account of their own race -
 * its own, the stand-ins', the guests' as they arrive - times the legs and the
 * finish, and sends the race out. A **guest** runs its own clock between
 * snapshots, eased towards the host's, counts its own clicks, presses and keys,
 * and says how it is getting on.
 *
 * **Your own race is counted on your own screen.** A click is a stroke the
 * moment you make it, not a round trip later; your lane and your sentence move
 * as fast as your hands do. The host holds what it is told to what fast hands
 * could honestly have done - see `report`.
 *
 * The same lessons as the other minigames: an account is repeated four times a
 * second and on every change; it is for one race; a guest keeps listening after
 * the race ends; somebody who leaves the lobby is not waited for; a pause stops the round for everybody. Alone, the clock stops.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSelf } from './ai'
import { COURSE, leave, report, stepRace, type Race, type Self } from './rules'
import { myId } from './setup'
import { applySnapshot, decodeIntent, decodeSnapshot, encodeIntent, encodeSnapshot, type Snapshot } from './wire'

const SEND_MS = 80
const REPEAT_MS = 250
/** Past this far apart, a guest's clock jumps to the host's rather than easing. */
const SNAP_SECONDS = 0.5

export interface RaceNet {
  /** Moves the race on a frame. `mine` is this browser's own account of its race. */
  advance(race: Race, dt: number, mine: Self, paused: boolean): boolean
}

export function useRaceNet(): RaceNet {
  const heard = useRef(new Map<string, { race: number; self: Self }>())
  const latest = useRef<{ snap: Snapshot; at: number } | null>(null)
  const applied = useRef<Snapshot | null>(null)
  const sentAt = useRef(0)
  const saidAt = useRef(0)
  const lastSaid = useRef('')

  useEffect(() => {
    return subscribeRoom((from, raw) => {
      if (getNet().host) {
        const said = decodeIntent(raw)
        if (said) heard.current.set(from, said)
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
  }, [])

  const advance = (race: Race, dt: number, mine: Self, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()

    // A pause is shared: whoever pressed it stopped the round for everybody,
    // so this stops dead - the host's own simulation included. A round that
    // carried on behind the card would make the card a lie. See
    // `15-minigames/internal/pause.ts`.
    if (paused) return false

    if (net.host) {
      if (race.racers.length === 0) return false
      if (!race.over) {
        report(race, myId(), mine)
        for (const racer of race.racers) if (racer.bot) report(race, racer.id, botSelf(race, racer))
        for (const [id, entry] of heard.current) if (entry.race === race.id) report(race, id, entry.self)
        if (net.status === 'joined') {
          // Somebody who has left the lobby is not coming back to the race.
          const here = new Set(getPeers().map((p) => p.id))
          for (const racer of race.racers) if (!racer.bot && racer.id !== myId() && !here.has(racer.id)) leave(race, racer.id)
        }
        stepRace(race, dt)
      }
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(race))
      }
      return true
    }

    // A guest. Nothing to say until there is a race to say it about.
    const said = `${race.id}:${mine.strokes}:${mine.pedals}:${mine.typed}:${mine.mistakes}`
    if (race.id !== 0 && (said !== lastSaid.current || now - saidAt.current >= REPEAT_MS)) {
      lastSaid.current = said
      saidAt.current = now
      sendToRoom(encodeIntent(mine, race.id))
    }

    const heardFrom = latest.current
    const localElapsed = race.elapsed
    if (heardFrom && heardFrom.snap !== applied.current) {
      applied.current = heardFrom.snap
      const newRace = race.id !== heardFrom.snap.id
      applySnapshot(race, heardFrom.snap, myId())
      if (!newRace) race.elapsed = localElapsed
    }
    if (race.racers.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (!race.over && heardFrom) {
      const ours = race.elapsed + step
      const hostNow = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const gap = hostNow - ours
      race.elapsed = Math.abs(gap) > SNAP_SECONDS ? hostNow : ours + gap * Math.min(1, step * 6)
      race.elapsed = Math.max(0, Math.min(COURSE.start + COURSE.timeLimit, race.elapsed))
    }

    // Our own race, as we counted it, before the host has heard.
    const me = race.racers.find((r) => r.mine)
    if (me && me.finishAt === null) {
      me.strokes = Math.max(me.strokes, mine.strokes)
      me.pedals = Math.max(me.pedals, mine.pedals)
      me.typed = Math.max(me.typed, mine.typed)
      me.mistakes = Math.max(me.mistakes, mine.mistakes)
    }
    return true
  }

  return { advance }
}
