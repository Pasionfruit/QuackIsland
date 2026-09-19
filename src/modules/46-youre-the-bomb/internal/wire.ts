/**
 * One game, on the wire.
 *
 * The host sends the clock, every player - where they are, which way they face,
 * when they escaped or died and how, who shoved them, how many they have shoved
 * to their end, when they last shoved, whether they have left - and every bomb
 * that has gone off. The room and its bombs are not sent: the seed makes them.
 * Scans are not sent either: a scan is yours alone, on your own screen.
 *
 * A guest sends what its hands are doing: which way it walks, and its clicks as
 * a running count, so a repeated message never doubles a shove.
 */
import { ROOM, roomFor } from './room'
import { MAX_PLAYERS } from './setup'
import { ROUND, type Game, type How, type Player } from './rules'

export const SNAPSHOT_TAG = 'ytb'
export const INTENT_TAG = 'ytb-in'

/** `[id, x cm, z cm, yaw mrad, escaped cs or -1, out cs or -1, how: 0 none 1 bomb 2 pin, by or -1, kills, pushed at cs or -1, flags: 1 left]`. */
export type WirePlayer = [string, number, number, number, number, number, number, number, number, number, number]
/** `[bomb, at cs, by]`. */
export type WireBlown = [number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
  blown: WireBlown[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isInt = (v: unknown): v is number => Number.isInteger(v)
const cm = (v: number) => Math.round(v * 100)
const HOW: readonly (How | null)[] = [null, 'bomb', 'pin']
const LATEST = (ROUND.limit + 1) * 100

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
        cm(p.x),
        cm(p.z),
        Math.round(p.yaw * 1000),
        p.escaped === null ? -1 : cm(p.escaped),
        p.out === null ? -1 : cm(p.out),
        HOW.indexOf(p.how),
        p.by ?? -1,
        p.kills,
        p.pushedAt < 0 ? -1 : cm(p.pushedAt),
        p.left ? 1 : 0,
      ],
    ),
    b: game.blown.map((b): WireBlown => [b.bomb, cm(b.at), b.by]),
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
    const [id, x, z, yaw, escaped, out, how, by, kills, pushedAt, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isInt(x) || Math.abs(x) > ROOM.halfX * 100 || !isInt(z) || Math.abs(z) > ROOM.halfZ * 100 || !isInt(yaw) || Math.abs(yaw) > 3200) return null
    if (!(escaped === -1 || (isCount(escaped) && escaped <= LATEST)) || !(out === -1 || (isCount(out) && out <= LATEST))) return null
    if ((escaped !== -1 && out !== -1) || !isInt(how) || how < 0 || how > 2 || (out === -1) !== (how === 0)) return null
    if (!isInt(by) || by < -1 || by >= count || !isCount(kills) || kills >= count || !isInt(pushedAt) || pushedAt < -1 || (flags !== 0 && flags !== 1)) return null
    players.push([id, x, z, yaw, escaped, out, how, by, kills, pushedAt, flags])
  }
  if (!Array.isArray(message.b)) return null
  const bombs = roomFor(message.s as number).bombs.length
  const blown: WireBlown[] = []
  for (const raw of message.b) {
    if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(isInt)) return null
    const [bomb, at, by] = raw as WireBlown
    if (bomb < 0 || bomb >= bombs || at < 0 || at > LATEST || by < 0 || by >= count) return null
    blown.push([bomb, at, by])
  }
  if (new Set(blown.map((b) => b[0])).size !== blown.length) return null
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, players, blown }
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
  game.players = snap.players.map(([id, x, z, yaw, escaped, out, how, by, kills, pushedAt, flags]) => {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? {
      id,
      mine: false,
      bot: false,
      x: 0,
      z: 0,
      kx: 0,
      kz: 0,
      yaw: 0,
      mx: 0,
      mz: 0,
      escaped: null,
      out: null,
      how: null,
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
      escaped: escaped < 0 ? null : escaped / 100,
      out: out < 0 ? null : out / 100,
      how: HOW[how],
      by: by < 0 ? null : by,
      kills,
      pushedAt: pushedAt < 0 ? -Infinity : pushedAt / 100,
      left: flags === 1,
    })
    if (!player.mine || !known) player.yaw = yaw / 1000
    return player
  })
  game.blown = snap.blown.map(([bomb, at, by]) => ({ bomb, at: at / 100, by }))
  return game
}

export interface Intent {
  game: number
  mx: number
  mz: number
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
