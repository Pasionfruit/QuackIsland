/**
 * The two ends of a shared race.
 *
 * The **host** runs the clock - which is the light, and the circle - takes
 * everybody's account of their own race, the stand-ins' and its own and the
 * guests' as they arrive, places whoever reaches the line, and sends the race
 * out. A **guest** runs its own clock between snapshots, eased towards the
 * host's, judges its own presses and pointer against it, and says how it is
 * getting on.
 *
 * **Your own race is judged on your own screen.** A press of space is a step, or
 * out, against the light you can see when you press it; the pointer is in the
 * circle you can see, or not. Judging it anywhere else would put a round trip
 * between you and the light, and a press made on green would land on red.
 *
 * The same arrangement, and the same lessons, as the other minigames: an account
 * is repeated four times a second and on every change; it is for one race; a
 * guest keeps listening after the race ends; the host never runs or sends a race
 * nobody was dealt into; pausing in a lobby stops only your hands.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { botSelf } from './ai'
import { LIGHT, racing, report, stepRace, type Race, type Self } from './rules'
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
  const lastRace = useRef({ id: 0, self: { steps: 0, out: null } as Self, elapsed: 0 })

  useEffect(() => {
    const stop = subscribeRoom((from, raw) => {
      if (getNet().host) {
        const said = decodeIntent(raw)
        if (said) heard.current.set(from, said)
        return
      }
      const snap = decodeSnapshot(raw)
      if (snap) latest.current = { snap, at: performance.now() }
    })
    return () => {
      stop()
      // Walking out of a race is out of it, rather than a lane left standing
      // until the clock runs out.
      const last = lastRace.current
      if (!getNet().host && last.id !== 0 && !last.self.out && last.self.steps < LIGHT.steps) {
        sendToRoom(encodeIntent({ steps: last.self.steps, out: { why: 'left', at: last.elapsed } }, last.id))
      }
    }
  }, [])

  const advance = (race: Race, dt: number, mine: Self, paused: boolean): boolean => {
    const net = getNet()
    const now = performance.now()
    lastRace.current = { id: race.id, self: mine, elapsed: race.elapsed }

    if (net.host) {
      if (race.racers.length === 0) return false
      const shared = net.status === 'joined' && net.peers > 0
      let stepped = false
      if (!race.over && (!paused || shared)) {
        report(race, myId(), mine)
        for (const racer of race.racers) if (racer.bot) report(race, racer.id, botSelf(race, racer))
        for (const [id, entry] of heard.current) if (entry.race === race.id) report(race, id, entry.self)
        if (net.status === 'joined') {
          // Somebody who has left the lobby is not coming back to this race.
          const here = new Set(getPeers().map((p) => p.id))
          for (const racer of race.racers) {
            if (racer.bot || racer.id === myId() || here.has(racer.id) || !racing(racer)) continue
            report(race, racer.id, { steps: racer.steps, out: { why: 'left', at: race.elapsed } })
          }
        }
        stepRace(race, dt)
        stepped = true
      }
      if (net.status === 'joined' && now - sentAt.current >= SEND_MS) {
        sentAt.current = now
        sendToRoom(encodeSnapshot(race))
      }
      return stepped
    }

    // A guest. Nothing to say until there is a race to say it about.
    const said = `${race.id}:${mine.steps}:${mine.out?.why ?? ''}`
    if (race.id !== 0 && (said !== lastSaid.current || now - saidAt.current >= REPEAT_MS)) {
      lastSaid.current = said
      saidAt.current = now
      sendToRoom(encodeIntent(mine, race.id))
    }

    const heardFrom = latest.current
    const localElapsed = race.elapsed
    const fresh = !!heardFrom && heardFrom.snap !== applied.current
    if (fresh) {
      applied.current = heardFrom.snap
      const newRace = race.id !== heardFrom.snap.id
      applySnapshot(race, heardFrom.snap, myId())
      if (!newRace) race.elapsed = localElapsed
    }
    if (race.racers.length === 0) return false

    const step = Math.min(Math.max(dt, 0), 0.25)
    if (!race.over && heardFrom) {
      // Our own clock runs on between snapshots, pulled towards where the host
      // was when it spoke plus the time since.
      const ours = race.elapsed + step
      const hostNow = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const gap = hostNow - ours
      race.elapsed = Math.abs(gap) > SNAP_SECONDS ? hostNow : ours + gap * Math.min(1, step * 6)
      race.elapsed = Math.max(0, Math.min(LIGHT.timeLimit, race.elapsed))
    }

    // Our own race, as we judged it, before the host has heard.
    const me = race.racers.find((r) => r.mine)
    if (me && me.finishedAt === null) {
      me.steps = Math.max(me.steps, Math.min(mine.steps, LIGHT.steps))
      if (mine.out && !me.out) me.out = { ...mine.out }
    }
    return true
  }

  return { advance }
}
