/**
 * Making fifteen updates a second look like sixty.
 *
 * Remote ducks are drawn a fixed delay behind live. That sounds like a
 * downside and is the whole trick: with `NET.delay` of history in hand there
 * is always a snapshot on either side of the moment being drawn, so the
 * position is an interpolation between two things that actually happened
 * rather than a guess about what happens next. Extrapolation is what makes
 * other players skate and rubber-band.
 *
 * All pure, so the awkward cases - a peer that stops sending, packets that
 * arrive out of order, an angle that wraps past pi - are checked in Node
 * rather than by having two browsers open and squinting.
 */
import { NET, type DuckState } from './protocol'

export interface Snapshot {
  /** Seconds, on the receiving client's own clock. */
  at: number
  state: DuckState
}

export interface Track {
  name: string
  /** The colour they chose, or null for the default. */
  colour: string | null
  snapshots: Snapshot[]
  /** When anything was last heard from this peer. */
  heard: number
}

export function createTrack(name: string): Track {
  return { name, colour: null, snapshots: [], heard: 0 }
}

/**
 * Files a snapshot.
 *
 * Out-of-order arrivals are dropped rather than sorted in: UDP-style reordering
 * does not happen on a WebSocket, so a packet that looks older than the newest
 * is a duplicate or a clock that jumped, and inserting it would rewind the duck.
 */
export function record(track: Track, at: number, state: DuckState): void {
  track.heard = at
  const newest = track.snapshots[track.snapshots.length - 1]
  if (newest && at <= newest.at) return
  track.snapshots.push({ at, state })
  while (track.snapshots.length > NET.history) track.snapshots.shift()
}

/** The shortest way round from one angle to another. */
export function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

function lerp(a: number, b: number, t: number): number {
  return (1 - t) * a + t * b
}

function blend(a: DuckState, b: DuckState, t: number): DuckState {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    // Through the short side, or a duck crossing north spins all the way round.
    facing: a.facing + shortestAngle(a.facing, b.facing) * t,
    lean: lerp(a.lean, b.lean, t),
    // Not interpolable, so it takes whichever snapshot is nearer.
    swimming: t < 0.5 ? a.swimming : b.swimming,
    speed: lerp(a.speed, b.speed, t),
  }
}

/**
 * Where a peer was `NET.delay` ago.
 *
 * Returns `null` only if nothing has ever been heard from them. Past the end
 * of the history it holds the last known position rather than sailing on: a
 * duck belonging to someone whose connection dropped should stand still, not
 * walk into the sea.
 */
export function sampleTrack(track: Track, now: number, delay = NET.delay): DuckState | null {
  const shots = track.snapshots
  if (shots.length === 0) return null
  if (shots.length === 1) return shots[0].state

  const target = now - delay

  if (target <= shots[0].at) return shots[0].state
  const last = shots[shots.length - 1]
  if (target >= last.at) return last.state

  for (let i = shots.length - 1; i > 0; i--) {
    const b = shots[i]
    const a = shots[i - 1]
    if (target >= a.at && target <= b.at) {
      const span = b.at - a.at
      const t = span > 1e-6 ? (target - a.at) / span : 1
      return blend(a.state, b.state, t)
    }
  }
  return last.state
}

/** Peers that have gone quiet for longer than the timeout. */
export function stale(tracks: Map<string, Track>, now: number, timeout = NET.timeout): string[] {
  const gone: string[] = []
  for (const [id, track] of tracks) {
    if (now - track.heard > timeout) gone.push(id)
  }
  return gone
}
