/**
 * One game, on the wire.
 *
 * The host sends the clock and every player: where they are, how high (flung
 * overboard and falling), which way they face, when a ball took them and who
 * shoved them into it, how many they have shoved into one, when they last
 * shoved, and whether they have left. **The cannonballs are not sent**: the seed
 * and the clock make every one of them, on every screen.
 *
 * A guest sends what its hands are doing: which way it walks, and its shoves as
 * a running count, so a repeated message never doubles a shove and a lost one
 * never loses one.
 */
import { MAX_PLAYERS } from './setup'
import { ROUND, type Game, type Player } from './rules'

export const SNAPSHOT_TAG = 'sm'
export const INTENT_TAG = 'sm-in'

/** `[id, x cm, z cm, y cm, yaw mrad, out cs or -1, by or -1, kills, pushed at cs or -1, flags: 1 left]`. */
export type WirePlayer = [string, number, number, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cm = (v: number) => Math.round(v * 100)
/** How far out anybody can be, metres: a ball flings you well past the rail. */
const REACH = 80
/** How high a fling can take you, metres. */
const HIGH = 10
const LATEST = (ROUND.limit + 1) * 100

const within = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v))

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    p: game.players.map(
      (p): WirePlayer => [
        p.id,
        cm(within(p.x, REACH)),
        cm(within(p.z, REACH)),
        cm(Math.max(-ROUND.depth, Math.min(HIGH, p.y))),
        Math.round(p.yaw * 1000),
        p.out === null ? -1 : cm(p.out),
        p.by ?? -1,
        p.kills,
        p.pushedAt < 0 ? -1 : cm(p.pushedAt),
        p.left ? 1 : 0,
      ],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const count = message.p.length
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 10) return null
    const [id, x, z, y, yaw, out, by, kills, pushedAt, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > REACH * 100 || !isInt(z) || Math.abs(z) > REACH * 100) return null
    if (!isInt(y) || y > HIGH * 100 || y < -ROUND.depth * 100 || !isInt(yaw) || Math.abs(yaw) > 3200) return null
    if (!(out === -1 || (isCount(out) && out <= LATEST))) return null
    if (!isInt(by) || by < -1 || by >= count || !isCount(kills) || kills >= count) return null
    if (!isInt(pushedAt) || pushedAt < -1 || (flags !== 0 && flags !== 1)) return null
    players.push([id, x, z, y, yaw, out, by, kills, pushedAt, flags])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, players }
}

/**
 * Brings a guest's copy into line with the host's, all but the clock, which the
 * caller eases. Everything is the host's; a guest's own player is eased towards
 * where the host has it by the caller, and its facing is its own.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  game.players = snap.players.map(([id, x, z, y, yaw, out, by, kills, pushedAt, flags]) => {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? {
      id,
      mine: false,
      bot: false,
      x: 0,
      z: 0,
      y: 0,
      vy: 0,
      kx: 0,
      kz: 0,
      yaw: 0,
      mx: 0,
      mz: 0,
      out: null,
      by: null,
      kills: 0,
      pushedAt: -Infinity,
      shovedBy: null,
      shovedAt: -Infinity,
      left: false,
      leftAt: null,
    }
    player.mine = id === me
    Object.assign(player, {
      x: x / 100,
      z: z / 100,
      y: y / 100,
      out: out < 0 ? null : out / 100,
      by: by < 0 ? null : by,
      kills,
      pushedAt: pushedAt < 0 ? -Infinity : pushedAt / 100,
      left: flags === 1,
    })
    if (!player.mine || !known) player.yaw = yaw / 1000
    return player
  })
  return game
}

export interface Intent {
  game: number
  /** Which way it walks, east and south, each -1 to 1. */
  mx: number
  mz: number
  /** Every shove asked for so far this game. */
  clicks: number
}

const fixed = (v: number) => Math.round(v * 1000) / 1000

export function encodeIntent(i: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, g: i.game, x: fixed(i.mx), z: fixed(i.mz), c: i.clicks }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isCount(message.c)) return null
  if (Math.abs(message.x) > 1.01 || Math.abs(message.z) > 1.01) return null
  return { game: message.g as number, mx: message.x, mz: message.z, clicks: message.c }
}
