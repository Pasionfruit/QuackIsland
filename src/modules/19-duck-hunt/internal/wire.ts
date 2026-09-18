/**
 * One game, on the wire.
 *
 * **Balloons are never sent.** Every balloon's whole flight follows from the
 * seed (see `schedule`), so a snapshot says only what cannot be worked out:
 * the clock, the scores and cooldowns, each player's last shot, and which of
 * the balloons still in the air have been popped, by whom.
 *
 * **A shot is an event, and events can be lost.** A guest numbers its shots and
 * says each one again until the host's snapshot shows that number dealt with;
 * the host deals with each number once. See `fire`.
 */
import { AIM_PLANE_Z, lifetime, type Point } from './arena'
import { createGame, type Game, type Shot } from './game'

export const SNAPSHOT_TAG = 'dh'
export const SHOT_TAG = 'dh-in'

/** `[id, score, shots, cooldown, seq, lastShot]` - `lastShot` 0 for none. */
export type WirePlayer = [string, number, number, number, number, WireShot | 0]
/** `[x, y, z, at, hit, own]`. */
export type WireShot = [number, number, number, number, 0 | 1, 0 | 1]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
  /** Balloon id to the index of whoever popped it - only balloons still in the air. */
  popped: Map<number, number>
}

export interface ShotMessage {
  seq: number
  balloon: number | null
  x: number
  y: number
  z: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function encodeSnapshot(game: Game): Record<string, unknown> {
  const popped: number[] = []
  for (const [balloon, by] of game.popped) {
    const b = game.balloons[balloon]
    // Once a balloon would have floated away there is nothing left to draw.
    if (b && b.spawnAt + lifetime(b) + 1 > game.elapsed) popped.push(balloon, by)
  }
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: r2(game.elapsed),
    o: game.over ? 1 : 0,
    p: game.players.map(
      (p): WirePlayer => [
        p.id,
        p.score,
        p.shots,
        r2(p.cooldown),
        p.seq,
        p.lastShot
          ? [r2(p.lastShot.x), r2(p.lastShot.y), r2(p.lastShot.z), r2(p.lastShot.at), p.lastShot.hit ? 1 : 0, p.lastShot.own ? 1 : 0]
          : 0,
      ],
    ),
    k: popped,
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  if (!Array.isArray(message.k) || message.k.length % 2 !== 0 || !message.k.every(isCount)) return null

  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 6) return null
    const [id, score, shots, cooldown, seq, shot] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (![score, shots, seq].every(isCount) || !isNumber(cooldown) || cooldown < 0) return null
    if (shot !== 0) {
      if (!Array.isArray(shot) || shot.length !== 6) return null
      const [x, y, z, at, hit, own] = shot
      if (![x, y, z, at].every(isNumber) || (hit !== 0 && hit !== 1) || (own !== 0 && own !== 1)) return null
    }
    players.push([id, score, shots, cooldown, seq, shot as WireShot | 0])
  }

  const popped = new Map<number, number>()
  const pairs = message.k as number[]
  for (let i = 0; i < pairs.length; i += 2) {
    if (pairs[i + 1] >= players.length) return null
    popped.set(pairs[i], pairs[i + 1])
  }

  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, players, popped }
}

export function encodeShot(shot: ShotMessage): Record<string, unknown> {
  return { t: SHOT_TAG, q: shot.seq, b: shot.balloon ?? -1, x: r2(shot.x), y: r2(shot.y), z: r2(shot.z) }
}

export function decodeShot(message: Record<string, unknown>): ShotMessage | null {
  if (message.t !== SHOT_TAG) return null
  if (!isCount(message.q) || (message.q as number) < 1) return null
  if (!Number.isInteger(message.b) || (message.b as number) < -1) return null
  if (![message.x, message.y, message.z].every(isNumber)) return null
  return {
    seq: message.q as number,
    balloon: message.b === -1 ? null : (message.b as number),
    x: message.x as number,
    y: message.y as number,
    z: message.z as number,
  }
}

/**
 * Where a player is aiming, sent by everybody - host and guests alike - straight
 * to everybody else. Not the host's business: a crosshair scores nothing, so it
 * need not wait on the host, and a round trip through it would only make every
 * other crosshair lag. `null` is a pointer that has left the field.
 *
 * Only `x` and `y`: every aim is on the wall at `AIM_PLANE_Z`.
 */
export const AIM_TAG = 'dh-aim'

export function encodeAim(aim: Point | null): Record<string, unknown> {
  return aim ? { t: AIM_TAG, x: r2(aim.x), y: r2(aim.y) } : { t: AIM_TAG, h: 1 }
}

/** `undefined` for anything that is not an aim, `null` for a hidden one. */
export function decodeAim(message: Record<string, unknown>): Point | null | undefined {
  if (message.t !== AIM_TAG) return undefined
  if (message.h === 1) return null
  const { x, y } = message
  // Anywhere near the field; nothing a peer sends is trusted.
  if (!isNumber(x) || !isNumber(y) || Math.abs(x) > 200 || Math.abs(y) > 200) return undefined
  return { x, y, z: AIM_PLANE_Z }
}

/**
 * Brings a guest's copy of the game into line with the host's.
 *
 * A different game id is a different game: it is dealt afresh from the seed,
 * balloons and all. The popped balloons are replaced outright - the host's list
 * is the truth. The clock is left to the caller, which eases it rather than
 * jumping it.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id || game.players.length !== snap.players.length) {
    const fresh = createGame(snap.seed, snap.players.map(([id]) => ({ id })), snap.id)
    Object.assign(game, fresh)
    game.elapsed = snap.elapsed
  }
  game.over = snap.over
  snap.players.forEach(([id, score, shots, cooldown, seq, shot], i) => {
    const player = game.players[i]
    player.id = id
    player.score = score
    player.shots = shots
    player.cooldown = cooldown
    player.seq = seq
    player.lastShot = shot === 0 ? null : toShot(shot)
    player.mine = id === me
  })
  game.popped = new Map(snap.popped)
  return game
}

function toShot([x, y, z, at, hit, own]: WireShot): Shot {
  return { x, y, z, at, hit: hit === 1, own: own === 1 }
}
