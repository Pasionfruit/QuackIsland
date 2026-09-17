/**
 * One game, on the wire.
 *
 * The host sends the clock and every torch: where it is, whether it is held,
 * stunned, how many walls it has touched, when it finished, whether its player
 * has left. The maze is not sent - the seed makes it.
 *
 * A guest sends its own torch: where it is and how many walls it has touched.
 * Twenty times a second, the latest counts; the host decides whether it could
 * have got there.
 */
import { HALF } from './maze'
import { ROUND, type Game, type Torch } from './rules'

export const SNAPSHOT_TAG = 'hd'
export const INTENT_TAG = 'hd-in'

/** `[id, x cm, z cm, stun cs, hits, finished cs or -1, flags: 1 held, 2 left]`. */
export type WireTorch = [string, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  torches: WireTorch[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const REACH = { x: (HALF.x + 1) * 100, z: (HALF.z + 1) * 100 }

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    f: game.players.map(
      (t): WireTorch => [
        t.id,
        Math.round(t.x * 100),
        Math.round(t.z * 100),
        Math.round(t.stunned * 100),
        t.hits,
        t.finished === null ? -1 : Math.round(t.finished * 100),
        (t.held ? 1 : 0) | (t.left ? 2 : 0),
      ],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.f) || message.f.length === 0 || message.f.length > 8) return null
  const torches: WireTorch[] = []
  for (const raw of message.f) {
    if (!Array.isArray(raw) || raw.length !== 7) return null
    const [id, x, z, stun, hits, finished, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!Number.isInteger(x) || Math.abs(x) > REACH.x || !Number.isInteger(z) || Math.abs(z) > REACH.z) return null
    if (!isCount(stun) || stun > 150 || !isCount(hits) || !isCount(flags) || flags > 3) return null
    if (!(finished === -1 || (isCount(finished) && finished <= (ROUND.limit + 1) * 100))) return null
    torches.push([id, x, z, stun, hits, finished, flags])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, torches }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock,
 * which the caller eases. While the game is on, a guest's own torch stays where
 * its own screen has it - it is judged there - and takes from the host only a
 * finish, a leaving, and any walls the host knows of that it does not.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  const fresh = game.id !== snap.id
  if (fresh) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  const next: Torch[] = []
  for (const [id, x, z, stun, hits, finished, flags] of snap.torches) {
    const known = game.players.find((p) => p.id === id)
    const torch: Torch = known ?? { id, mine: false, bot: false, x: x / 100, z: z / 100, held: false, stunned: 0, hits: 0, finished: null, left: false }
    torch.mine = id === me
    const hostFinished = finished < 0 ? null : finished / 100
    if (torch.mine && known && !snap.over) {
      torch.hits = Math.max(torch.hits, hits)
      torch.finished = hostFinished ?? torch.finished
      torch.left = (flags & 2) !== 0
    } else {
      Object.assign(torch, { x: x / 100, z: z / 100, stunned: stun / 100, hits, finished: hostFinished, held: (flags & 1) !== 0, left: (flags & 2) !== 0 })
    }
    next.push(torch)
  }
  game.players = next
  return game
}

export function encodeIntent(game: number, x: number, z: number, hits: number): Record<string, unknown> {
  return { t: INTENT_TAG, g: game, x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000, h: hits }
}

export function decodeIntent(message: Record<string, unknown>): { game: number; x: number; z: number; hits: number } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.z) || !isCount(message.h)) return null
  if (Math.abs(message.x) > HALF.x + 1 || Math.abs(message.z) > HALF.z + 1) return null
  return { game: message.g as number, x: message.x, z: message.z, hits: message.h as number }
}
