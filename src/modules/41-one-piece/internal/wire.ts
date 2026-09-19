/**
 * A game, on the wire.
 *
 * The host sends the seed - which is where everybody's pieces start - its
 * clock, and for every player which of their six pieces are in and when they
 * finished. **Everybody's progress is on show**, so it all goes to everybody.
 * Where anybody's loose pieces are lying never goes anywhere: it is nobody
 * else's business.
 *
 * A guest sends which of its pieces are in, at once when one clicks in and
 * a few times a second besides. It puts pieces in on its own table without
 * waiting; the host puts what it says into its copy, and is the only word on
 * when anybody finished.
 */
import { FULL, createGame, newPlayer, type Game, type Player } from './rules'

export const SNAPSHOT_TAG = 'op'
export const INTENT_TAG = 'op-in'

/** `[id, pieces in (mask), seconds in when finished or -1, left (0/1)]`. */
export type WirePlayer = [string, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  clock: number
  over: boolean
  players: WirePlayer[]
}

export interface Intent {
  game: number
  placed: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isMask = (v: unknown): v is number => isCount(v) && v <= FULL

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    c: r2(game.clock),
    o: game.over ? 1 : 0,
    p: game.players.map((p): WirePlayer => [p.id, p.placed, p.finishedAt ?? -1, p.left ? 1 : 0]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s)) return null
  if (!isNumber(message.c) || message.c < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > 8) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 4) return null
    const [id, placed, finishedAt, left] = raw
    if (typeof id !== 'string' || id.length === 0 || !isMask(placed)) return null
    if (!isNumber(finishedAt) || (finishedAt < 0 && finishedAt !== -1)) return null
    if (left !== 0 && left !== 1) return null
    players.push([id, placed, finishedAt, left])
  }
  return { id: message.g as number, seed: message.s as number, clock: message.c, over: message.o === 1, players }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock,
 * which the caller eases, and this browser's own pieces, which are whatever
 * either it or the host has in - it gets pieces in ahead of what the host has
 * heard. When it finished is the host's word once the host has one.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id || game.seed !== snap.seed) {
    const fresh = createGame(snap.seed, [], snap.id)
    game.players = fresh.players
    game.clock = snap.clock
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  if (snap.over) game.clock = snap.clock
  const next: Player[] = []
  for (const [id, placed, finishedAt, left] of snap.players) {
    const player = game.players.find((p) => p.id === id) ?? newPlayer(id)
    const mine = id === me
    player.mine = mine
    player.left = left === 1
    const theirs = finishedAt >= 0 ? finishedAt : null
    if (!mine || snap.over) {
      player.placed = placed
      player.finishedAt = theirs
    } else {
      player.placed |= placed
      player.finishedAt = theirs ?? player.finishedAt
    }
    next.push(player)
  }
  game.players = next
  return game
}

export function encodeIntent(intent: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, g: intent.game, m: intent.placed }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isMask(message.m)) return null
  return { game: message.g as number, placed: message.m }
}
