/**
 * The two ends of a shared real-time arena - the net loop every arena
 * minigame runs, written once.
 *
 * The **host** runs the round: the clock, its own player, the stand-ins,
 * every guest's reported move and claim, whoever has left, and the end - and
 * sends the lot about fifteen times a second. A **guest** takes the host's
 * word first, then eases its clock toward the host's, then moves its own body
 * on its own screen and reports where it got to.
 *
 * The same lessons every game had learned separately: a guest keeps
 * listening after the round ends; somebody who leaves the lobby is out; a
 * pause stops the round for everybody, the host's simulation included. What
 * a game supplies is its rules, as an `ArenaRules` - what to do with your
 * hands, with the stand-ins, with a guest's message - and its wire.
 *
 * `createArenaLink` is the loop with nothing live in it, so it can be tested
 * with a fake room; `useArenaNet` is the same loop wired to the real one.
 */
import { useEffect, useRef } from 'react'
import { getNet, getPeers, sendToRoom, subscribeRoom } from '../../09-net'
import { myId } from './roster'

export interface ArenaPlayer {
  id: string
  mine: boolean
  bot: boolean
  left: boolean
}

export interface ArenaRound<P extends ArenaPlayer = ArenaPlayer> {
  id: number
  elapsed: number
  over: boolean
  players: P[]
}

/** Every message a guest sends the host carries the round it is about. */
export interface Said {
  round: number
}

export interface ArenaRules<R extends ArenaRound, Hands, M extends Said, S extends { elapsed: number }, Out> {
  /** How often the host sends, and a guest reports, in milliseconds. */
  sendMs?: number
  reportMs?: number
  /** Past this far apart, a guest's clock jumps to the host's rather than easing. */
  snapSeconds?: number

  encodeSnapshot(round: R): Record<string, unknown>
  decodeSnapshot(raw: Record<string, unknown>): S | null
  applySnapshot(round: R, snap: S, me: string): void
  /** Anything a guest may say to the host, or null for traffic that is not this game's. */
  decodeGuest(raw: Record<string, unknown>): M | null
  /** A guest's own body, as it reports it. */
  reportMove(round: R, mine: R['players'][number]): Record<string, unknown>

  /** The clock and anything else that runs on its own. */
  tick(round: R, dt: number): void
  /**
   * Your own hands on your own body. `authoritative` on the host; a guest
   * passes anything the host must judge - a shot - to `say`.
   */
  drive(round: R, me: number, hands: Hands, dt: number, authoritative: boolean, say: (message: Record<string, unknown>) => void): Out | null
  /** The stand-ins, on the host. */
  bots(round: R, dt: number): void
  /**
   * One message from a guest, on the host. `sinceLast` is how much round time
   * has passed since this guest's last call to it - and calling it marks now -
   * which is what a move is clamped against.
   */
  hear(round: R, player: number, message: M, sinceLast: () => number): void
  /** Anything decided off everybody's settled positions this frame, before the end is judged. */
  settle?(round: R): void
  leave(round: R, player: number): void
  judgeEnd(round: R): void
}

export interface Advanced<Out> {
  changed: boolean
  /** Whatever your hands did this frame that the screen wants to know about - a shot, say. */
  out: Out | null
}

/** The room, as the loop sees it. Real by default; a test hands in a fake. */
export interface ArenaRoom {
  host(): boolean
  joined(): boolean
  me(): string
  peers(): string[]
  send(message: Record<string, unknown>): void
  now(): number
}

// Every member reads the net when called, never at load: a game's tests mock
// `09-net` with only the two or three functions they need.
export const LIVE_ROOM: ArenaRoom = {
  host: () => getNet().host,
  joined: () => getNet().status === 'joined',
  me: () => myId(),
  peers: () => getPeers().map((p) => p.id),
  send: (message) => sendToRoom(message),
  now: () => performance.now(),
}

export interface ArenaLink<R extends ArenaRound, Hands, Out> {
  /** Everything heard from the room, fed in from its subscription. */
  hear(from: string, raw: Record<string, unknown>): void
  /** Moves the round on a frame. `hands` is null when this browser is only watching. */
  advance(round: R, dt: number, hands: Hands | null, paused: boolean): Advanced<Out>
}

const SEND_MS = 66
const REPORT_MS = 50
const SNAP_SECONDS = 0.4

export function createArenaLink<R extends ArenaRound, Hands, M extends Said, S extends { elapsed: number }, Out>(
  rules: ArenaRules<R, Hands, M, S, Out>,
  room: ArenaRoom = LIVE_ROOM,
): ArenaLink<R, Hands, Out> {
  const sendMs = rules.sendMs ?? SEND_MS
  const reportMs = rules.reportMs ?? REPORT_MS
  const snapSeconds = rules.snapSeconds ?? SNAP_SECONDS
  const heard: { from: string; message: M }[] = []
  const heardAt = new Map<string, number>()
  let latest: { snap: S; at: number } | null = null
  let applied: S | null = null
  let sentAt = -Infinity
  let reportedAt = -Infinity
  const quiet = () => {}

  const hostFrame = (round: R, dt: number, hands: Hands | null): Advanced<Out> => {
    if (round.players.length === 0) return { changed: false, out: null }
    let out: Out | null = null
    rules.tick(round, dt)
    const me = round.players.findIndex((p) => p.mine)
    if (me >= 0 && hands && !round.over) out = rules.drive(round, me, hands, dt, true, quiet)
    rules.bots(round, dt)
    // In the order they arrived, so a guest's last step comes before a shot it took from there.
    for (const { from, message } of heard.splice(0)) {
      const player = round.players.findIndex((p) => p.id === from)
      if (player < 0 || message.round !== round.id) continue
      const key = `${round.id}:${from}`
      const sinceLast = () => {
        const last = heardAt.get(key) ?? 0
        heardAt.set(key, round.elapsed)
        return round.elapsed - last
      }
      rules.hear(round, player, message, sinceLast)
    }
    rules.settle?.(round)
    if (room.joined()) {
      const here = new Set(room.peers())
      round.players.forEach((p, index) => {
        if (!p.bot && !p.mine && !p.left && !here.has(p.id)) rules.leave(round, index)
      })
    }
    rules.judgeEnd(round)
    const now = room.now()
    if (room.joined() && now - sentAt >= sendMs) {
      sentAt = now
      room.send(rules.encodeSnapshot(round))
    }
    return { changed: true, out }
  }

  const guestFrame = (round: R, dt: number, hands: Hands | null): Advanced<Out> => {
    const now = room.now()
    // The host's word first, then the clock, then our own hands.
    const heardFrom = latest
    const before = round.id
    if (heardFrom && heardFrom.snap !== applied) {
      applied = heardFrom.snap
      rules.applySnapshot(round, heardFrom.snap, room.me())
    }
    if (round.players.length === 0) return { changed: false, out: null }

    rules.tick(round, dt)
    if (heardFrom && !round.over) {
      const hostElapsed = heardFrom.snap.elapsed + (now - heardFrom.at) / 1000
      const ours = round.elapsed
      round.elapsed =
        before !== round.id || Math.abs(hostElapsed - ours) > snapSeconds
          ? hostElapsed
          : ours + (hostElapsed - ours) * Math.min(1, Math.min(Math.max(dt, 0), 0.25) * 4)
    }

    let out: Out | null = null
    const me = round.players.findIndex((p) => p.mine)
    const mine = round.players[me]
    if (mine && hands && !round.over) out = rules.drive(round, me, hands, dt, false, room.send)
    if (mine && !round.over && now - reportedAt >= reportMs) {
      reportedAt = now
      room.send(rules.reportMove(round, mine))
    }
    return { changed: true, out }
  }

  return {
    hear(from, raw) {
      if (room.host()) {
        const message = rules.decodeGuest(raw)
        if (message) heard.push({ from, message })
        return
      }
      const snap = rules.decodeSnapshot(raw)
      if (snap) latest = { snap, at: room.now() }
    },
    advance(round, dt, hands, paused) {
      // A pause is shared: the round stops dead for everybody, the host's own
      // simulation included, so a round never carries on behind the card.
      if (paused) return { changed: false, out: null }
      return room.host() ? hostFrame(round, dt, hands) : guestFrame(round, dt, hands)
    },
  }
}

/** The arena loop on the live room, for as long as the component is mounted. */
export function useArenaNet<R extends ArenaRound, Hands, M extends Said, S extends { elapsed: number }, Out>(
  rules: ArenaRules<R, Hands, M, S, Out>,
): ArenaLink<R, Hands, Out> {
  const link = useRef<ArenaLink<R, Hands, Out> | null>(null)
  if (link.current === null) link.current = createArenaLink(rules)
  const current = link.current
  useEffect(() => subscribeRoom((from, raw) => current.hear(from, raw)), [current])
  return current
}
