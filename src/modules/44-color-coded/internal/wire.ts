/**
 * One game, on the wire.
 *
 * The host sends the clock and every player: where they are, how high (falling
 * below), **how fast they are sliding**, which way they face, when they fell and
 * who knocked them, how many they have knocked off, whether they are running, and
 * whether they have left. The panels are not sent: the seed and the clock make
 * them.
 *
 * A guest sends what its hands are doing - which way it is walking, which way it
 * faces, and whether it is holding run - twenty times a second and whenever the
 * walk or the run changes. That is a state, not an event, so a repeated message
 * changes nothing and a lost one is made good by the next.
 */
import { HALF } from './arena'
import { MAX_PLAYERS } from './setup'
import { PUSH, ROUND, SLIDE, type Game, type Player } from './rules'

export const SNAPSHOT_TAG = 'cc'
export const INTENT_TAG = 'cc-in'

/** `[id, x cm, z cm, y cm, yaw mrad, out cs or -1, by or -1, kills, vx dm/s, vz dm/s, flags: 1 left, 2 running, 4 pushing]`. */
export type WirePlayer = [string, number, number, number, number, number, number, number, number, number, number]

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
/** How far out anybody can be, centimetres: a fall carries you on past the edge. */
const REACH = (HALF + 40) * 100
/** How fast anybody can be going, decimetres a second: the speed limit, and a little over for rounding. */
const FAST = Math.ceil(SLIDE.cap * 10) + 2
const dms = (v: number) => Math.max(-FAST, Math.min(FAST, Math.round(v * 10)))

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
        cm(Math.max(-REACH / 100, Math.min(REACH / 100, p.x))),
        cm(Math.max(-REACH / 100, Math.min(REACH / 100, p.z))),
        cm(p.y),
        Math.round(p.yaw * 1000),
        p.out === null ? -1 : cm(p.out),
        p.by ?? -1,
        p.kills,
        dms(p.vx),
        dms(p.vz),
        (p.left ? 1 : 0) | (p.run ? 2 : 0) | (game.elapsed - p.pushedAt < PUSH.show ? 4 : 0),
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
    if (!Array.isArray(raw) || raw.length !== 11) return null
    const [id, x, z, y, yaw, out, by, kills, vx, vz, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > REACH || !isInt(z) || Math.abs(z) > REACH) return null
    if (!isInt(y) || y > 0 || y < -ROUND.depth * 100 || !isInt(yaw) || Math.abs(yaw) > 3200) return null
    if (!(out === -1 || (isCount(out) && out <= (ROUND.limit + 1) * 100))) return null
    if (!isInt(by) || by < -1 || by >= count || !isCount(kills) || kills >= count) return null
    if (!isInt(vx) || Math.abs(vx) > FAST || !isInt(vz) || Math.abs(vz) > FAST) return null
    if (!isInt(flags) || flags < 0 || flags > 7) return null
    players.push([id, x, z, y, yaw, out, by, kills, vx, vz, flags])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, players }
}

/**
 * Brings a guest's copy into line with the host's, all but the clock, which the
 * caller eases. Everything is the host's - where everybody is included; a
 * guest's own player is eased towards it by the caller.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  game.players = snap.players.map(([id, x, z, y, yaw, out, by, kills, vx, vz, flags]) => {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? {
      id,
      mine: false,
      bot: false,
      x: 0,
      z: 0,
      y: 0,
      vy: 0,
      vx: 0,
      vz: 0,
      yaw: 0,
      mx: 0,
      mz: 0,
      run: false,
      out: null,
      by: null,
      kills: 0,
      knockedBy: null,
      knockedAt: -Infinity,
      pushedAt: -Infinity,
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
      vx: vx / 10,
      vz: vz / 10,
      run: (flags & 2) !== 0,
      left: (flags & 1) !== 0,
    })
    // Somebody shoving, as the host has it: shown from when it is first heard.
    if ((flags & 4) !== 0) {
      if (!(game.elapsed - player.pushedAt < PUSH.show)) player.pushedAt = game.elapsed
    } else if (game.elapsed - player.pushedAt < PUSH.show) player.pushedAt = -Infinity
    // A guest's own facing is its own mouse's; everybody else's is the host's.
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
  yaw: number
  /** Whether it is holding run. */
  run: boolean
  /** How many pushes it has asked for, ever: a count, so a lost message costs nothing and a repeated one does no harm. */
  push: number
}

const fixed = (v: number) => Math.round(v * 1000) / 1000

export function encodeIntent(i: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, g: i.game, x: fixed(i.mx), z: fixed(i.mz), y: fixed(i.yaw), r: i.run ? 1 : 0, p: i.push }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isNumber(message.y)) return null
  if (message.r !== 0 && message.r !== 1) return null
  if (!isCount(message.p)) return null
  if (Math.abs(message.x) > 1.01 || Math.abs(message.z) > 1.01 || Math.abs(message.y) > 4) return null
  return { game: message.g as number, mx: message.x, mz: message.z, yaw: message.y, run: message.r === 1, push: message.p as number }
}
