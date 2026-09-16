/**
 * One round, shared across a lobby.
 *
 * **The host runs the game and everybody else watches their own copy of it.**
 * There is exactly one simulation, in the host's browser, and the only things
 * that cross the wire are what a guest is pressing, going one way, and where
 * everything ended up, coming back. Two browsers cannot disagree about who was
 * caught, because only one of them is deciding.
 *
 * That is the same trade Garden Goofs makes with its seeds, and for the same
 * reason: the cost is a round trip before a guest sees their own key land, and
 * what it buys is that the two arenas cannot drift apart. A chase where each
 * browser ran its own zombies would have two different people winning it.
 *
 * All of this is pure. Encoding, decoding and applying a snapshot are
 * functions over plain values, so the part that is easy to get silently wrong
 * - a field read back in the wrong order, a body that never gets cleaned up -
 * is arithmetic a test can check rather than something you find out with two
 * browsers open.
 */
import { ARENA } from './arena'
import { createBody, type Intent, type Round } from './round'

/** The message tag for a snapshot, host to everybody. */
export const SNAPSHOT_TAG = 'zt'
/** The message tag for a guest's keys, guest to host. */
export const INTENT_TAG = 'zt-in'

/**
 * One body on the wire.
 *
 * A tuple rather than an object, and rounded to the centimetre, because this
 * goes out twenty times a second for up to fourteen bodies and the relay has a
 * four-kilobyte limit on a message. Named here once so the order cannot drift
 * between the two ends.
 *
 * `[id, x, y, side, facing, stun, cooldown, turning, caughtAt]`, with `side` 0
 * for a player and 1 for a zombie, and `caughtAt` -1 for nobody.
 *
 * `cooldown` is on it because a guest's push meter reads it: without it the
 * meter says ready for ever, however recently the push went out.
 */
export type WireBody = [string, number, number, number, number, number, number, number, number]

export interface Snapshot {
  elapsed: number
  over: boolean
  winner: string | null
  bodies: WireBody[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function encodeSnapshot(round: Round): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    e: round2(round.elapsed),
    o: round.over ? 1 : 0,
    w: round.winner ?? '',
    b: round.bodies.map(
      (body): WireBody => [
        body.id,
        round2(body.x),
        round2(body.y),
        body.side === 'zombie' ? 1 : 0,
        round2(body.facing),
        round2(body.stun),
        round2(body.cooldown),
        round2(body.turning),
        body.caughtAt === null ? -1 : round2(body.caughtAt),
      ],
    ),
  }
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Reads a snapshot off the wire, or `null` for anything that is not one.
 *
 * As untrusted as everything else another browser sends. A body with a missing
 * field is not half-applied - the whole message is refused - because a round
 * with one body at `NaN` is a round where nothing can be caught ever again.
 */
export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isNumber(message.e) || !Array.isArray(message.b)) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (typeof message.w !== 'string') return null

  const bodies: WireBody[] = []
  for (const raw of message.b) {
    if (!Array.isArray(raw) || raw.length !== 9) return null
    const [id, x, y, side, facing, stun, cooldown, turning, caughtAt] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (![x, y, facing, stun, cooldown, turning, caughtAt].every(isNumber)) return null
    if (side !== 0 && side !== 1) return null
    bodies.push([id, x, y, side, facing, stun, cooldown, turning, caughtAt])
  }

  return { elapsed: message.e, over: message.o === 1, winner: message.w || null, bodies }
}

export function encodeIntent(intent: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, x: round2(intent.x), y: round2(intent.y), p: intent.push ? 1 : 0 }
}

/** Reads a guest's keys. Clamped, because a client can send whatever it likes. */
export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isNumber(message.x) || !isNumber(message.y)) return null
  if (message.p !== 0 && message.p !== 1) return null
  // A direction longer than one would be a client asking to move faster than
  // everybody else. It is normalised by the rules anyway; this is belt as well.
  const length = Math.hypot(message.x, message.y)
  const scale = length > 1 ? 1 / length : 1
  return { x: message.x * scale, y: message.y * scale, push: message.p === 1 }
}

/**
 * Brings a guest's copy of the round into line with what the host sent.
 *
 * **Bodies are mutated rather than replaced.** The scene holds a three.js
 * group per body, keyed on the body object, so handing it a fresh array every
 * twentieth of a second would rebuild every avatar in the arena twenty times a
 * second. Matching by id and moving what is already there is what keeps that
 * from happening.
 *
 * Anybody in the snapshot who is not here yet is created; anybody here who is
 * no longer in the snapshot is dropped. Neither happens in practice mid-round -
 * the roster is fixed once it starts - but a guest who joins late gets the
 * whole arena from the first snapshot this way, with no special case for it.
 */
export function applySnapshot(round: Round, snap: Snapshot, me: string): Round {
  round.elapsed = snap.elapsed
  round.over = snap.over
  round.winner = snap.winner

  const seen = new Set<string>()
  for (const [id, x, y, side, facing, stun, cooldown, turning, caughtAt] of snap.bodies) {
    seen.add(id)
    let body = round.bodies.find((b) => b.id === id)
    if (!body) {
      body = createBody({ id, at: { x, y }, side: side === 1 ? 'zombie' : 'player' })
      round.bodies.push(body)
    }
    body.x = x
    body.y = y
    body.side = side === 1 ? 'zombie' : 'player'
    body.facing = facing
    body.stun = stun
    body.cooldown = cooldown
    body.turning = turning
    body.caughtAt = caughtAt < 0 ? null : caughtAt
    // Which one is yours is decided here and nowhere else: the host has no
    // opinion about whose browser it is sending to.
    body.mine = id === me
  }

  for (let i = round.bodies.length - 1; i >= 0; i--) {
    if (!seen.has(round.bodies[i].id)) round.bodies.splice(i, 1)
  }
  return round
}

/**
 * How far a guest's copy may be behind before it is snapped rather than eased.
 *
 * Snapshots arrive twenty times a second and frames are drawn sixty, so a body
 * is always a little behind where the host last put it, and easing across that
 * gap is what stops the arena stuttering. Past this much, easing would be
 * watching somebody swim across the room - a dropped burst of messages is
 * better taken on the chin.
 */
export const SNAP_DISTANCE = ARENA.radius * 6

/**
 * Eases one body towards where the host says it is.
 *
 * Called every frame, on a position that is updated twenty times a second.
 * `rate` is how much of the remaining gap to close this frame, worked out from
 * the frame time so it behaves the same at thirty frames as at a hundred and
 * forty.
 */
export function easeTowards(from: number, to: number, rate: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, rate))
}

/**
 * Folds a guest's newest keys into what the host last heard from them.
 *
 * The direction is simply replaced, but **a push is kept until it is spent**.
 * Two messages can land between one frame and the next - a push, then the key
 * being let go - and taking only the second would lose the push outright.
 */
export function hearIntent(before: Intent | undefined, heard: Intent): Intent {
  return { x: heard.x, y: heard.y, push: heard.push || (before?.push ?? false) }
}
