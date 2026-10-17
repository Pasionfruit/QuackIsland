/**
 * The pieces every minigame's `wire.ts` is built from.
 *
 * Numbers go over the wire as integers in a fixed unit - centimetres,
 * milliradians, centiseconds - or as floats cut to a fixed number of places,
 * and come back through the same few guards. Those were re-declared in every
 * game; they live here once.
 *
 * On top of them, the three message shapes the real-time arena games all
 * share, each tagged per game so two games never read each other's traffic:
 *
 * - a **pose**: where a guest is and which way it looks, plus whatever extras
 *   its game needs (a jump height, a sprint key);
 * - a **claim**: a shot a guest fired, where from, which way, and who its own
 *   screen saw it hit - for the host to judge;
 * - a **one-vs-all header**: round id, seed, who the 1 is, the clock, the
 *   winner and whether it is over - the opening of every one-vs-all snapshot.
 */
import { MAX_PLAYERS } from './roster'

export const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
export const isInt = (v: unknown): v is number => Number.isInteger(v)
export const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/** Metres to whole centimetres. */
export const cm = (m: number) => Math.round(m * 100)
/** Radians to whole milliradians. */
export const mrad = (rad: number) => Math.round(rad * 1000)
/** Seconds to whole centiseconds, clamped to [0, 1000 s] - so `-Infinity` ("never") goes over as 0. */
export const cs = (s: number) => Math.round(Math.max(0, Math.min(100000, s)) * 100)
/** Three decimal places. */
export const fixed = (v: number) => Math.round(v * 1000) / 1000
/** Two decimal places. */
export const r2 = (v: number) => Math.round(v * 100) / 100

/** Any angle in milliradians, either way round: a little over π. */
export const MRAD_LIMIT = 3200

/**
 * The rows of a snapshot's player list, if it is one: a non-empty array of at
 * most `max` rows, each an array of exactly `width` items opening with a
 * non-empty id. What the numbers in a row mean is the game's to check.
 */
export function playerRows(raw: unknown, width: number, max = MAX_PLAYERS): [string, ...unknown[]][] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > max) return null
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== width || !isId(row[0])) return null
  }
  return raw as [string, ...unknown[]][]
}

/**
 * Folds the host's player rows into a guest's own copy.
 *
 * Everybody is replaced by what the host says, **except your own body**: its
 * position and look are yours, walked on your own screen, and only taken from
 * the host when you first appear or once the round is over. `shared` is what
 * is always the host's word; `owned` is what you keep for yourself meanwhile.
 */
export function mergePlayers<P extends { id: string; mine: boolean }, Row extends readonly [string, ...unknown[]]>(
  known: readonly P[],
  rows: readonly Row[],
  me: string,
  over: boolean,
  parts: { create(row: Row): P; shared(row: Row): Partial<P>; owned(row: Row): Partial<P> },
): P[] {
  return rows.map((row) => {
    const before = known.find((p) => p.id === row[0])
    const player = before ?? parts.create(row)
    player.mine = row[0] === me
    if (player.mine && before && !over) Object.assign(player, parts.shared(row))
    else Object.assign(player, parts.shared(row), parts.owned(row))
    return player
  })
}

/** A round a guest has just heard about starts from nobody. */
export function adoptRound(round: { id: number; players: unknown[] }, id: number): void {
  if (round.id === id) return
  round.players = []
  round.id = id
}

export interface Pose {
  x: number
  z: number
  yaw: number
  pitch: number
}

export interface PoseBounds {
  /** How far off the middle a pose may be, metres, each axis. */
  reachX: number
  reachZ: number
  /** How far a look may tip up or down, radians. */
  pitchLimit: number
}

/** A guest's pose, tagged per game, with any extra fields its game adds. */
export function encodePose(tag: string, round: number, pose: Pose, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { t: tag, g: round, x: fixed(pose.x), z: fixed(pose.z), y: fixed(pose.yaw), p: fixed(pose.pitch), ...extra }
}

/** A pose, if the message is one of this game's and in bounds. The game checks its own extras on the same message. */
export function decodePose(message: Record<string, unknown>, tag: string, bounds: PoseBounds): ({ round: number } & Pose) | null {
  if (message.t !== tag) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y) || !isNumber(message.p)) return null
  if (Math.abs(message.x) > bounds.reachX || Math.abs(message.z) > bounds.reachZ) return null
  if (Math.abs(message.p) > bounds.pitchLimit + 0.01) return null
  return { round: message.g, x: message.x, z: message.z, yaw: message.y, pitch: message.p }
}

/** A shot a guest says it fired: from where, which way, and who it saw it meet. */
export interface Claim extends Pose {
  victim: string | null
}

export function encodeClaim(tag: string, round: number, claim: Claim): Record<string, unknown> {
  return { t: tag, g: round, x: fixed(claim.x), z: fixed(claim.z), y: fixed(claim.yaw), p: fixed(claim.pitch), v: claim.victim ?? '' }
}

/** A claim, if the message is one of this game's and was fired from somewhere `from` allows. */
export function decodeClaim(
  message: Record<string, unknown>,
  tag: string,
  pitchLimit: number,
  from: (x: number, z: number) => boolean,
): ({ round: number } & Claim) | null {
  if (message.t !== tag) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y) || !isNumber(message.p) || typeof message.v !== 'string') return null
  if (!from(message.x, message.z)) return null
  if (Math.abs(message.p) > pitchLimit + 0.01) return null
  return { round: message.g, x: message.x, z: message.z, yaw: message.y, pitch: message.p, victim: message.v === '' ? null : message.v }
}

/** The two sides of a one-vs-all game, as the winner goes over the wire: 1 for the 1, 2 for the rest, 0 for nobody yet. */
export interface Sides<Role extends string> {
  encode(winner: Role | null): 0 | 1 | 2
  decode(code: number): Role | null
}

export function sides<Role extends string>(one: Role, rest: Role): Sides<Role> {
  return {
    encode: (winner) => (winner === one ? 1 : winner === rest ? 2 : 0),
    decode: (code) => (code === 1 ? one : code === 2 ? rest : null),
  }
}

export interface OneVsAllHeader<Role extends string> {
  id: number
  seed: number
  oneId: string
  elapsed: number
  winner: Role | null
  over: boolean
}

/** The opening fields of a one-vs-all snapshot. A game spreads its own fields and its `p` rows after it. */
export function encodeHeader<Role extends string>(tag: string, round: Omit<OneVsAllHeader<Role>, 'oneId'>, oneId: string, roles: Sides<Role>): Record<string, unknown> {
  return {
    t: tag,
    g: round.id,
    s: round.seed,
    o1: oneId,
    e: r2(round.elapsed),
    w: roles.encode(round.winner),
    ov: round.over ? 1 : 0,
  }
}

export function decodeHeader<Role extends string>(message: Record<string, unknown>, tag: string, roles: Sides<Role>): OneVsAllHeader<Role> | null {
  if (message.t !== tag) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (!isId(message.o1)) return null
  if (message.w !== 0 && message.w !== 1 && message.w !== 2) return null
  if (message.ov !== 0 && message.ov !== 1) return null
  return { id: message.g, seed: message.s, oneId: message.o1, elapsed: message.e, winner: roles.decode(message.w), over: message.ov === 1 }
}
