/**
 * A game, on the wire.
 *
 * The host sends the seed - which is the whole feed, reels and ads - its
 * clock, and for every player how far down the feed they are, how many ads
 * they have skipped and when they finished. **Everybody's progress is on
 * show**, so it all goes to everybody.
 *
 * A guest sends how far it has got and how many ads it has skipped, ten times
 * a second and at once on a skip. It scrolls and skips on its own screen
 * without waiting; the host puts what it says into its copy, and is the only
 * word on who got to the end first.
 */
import { ADS, FEED, createGame, newPlayer, type Game, type Player } from './rules'

export const SNAPSHOT_TAG = 'rpm'
export const INTENT_TAG = 'rpm-in'

/** `[id, progress, ads skipped, seconds in when finished or -1, left (0/1)]`. */
export type WirePlayer = [string, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  clock: number
  over: boolean
  players: WirePlayer[]
}

export interface Intent {
  game: number
  progress: number
  skipped: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isProgress = (v: unknown): v is number => isNumber(v) && v >= 0 && v <= FEED.reels
const isSkipped = (v: unknown): v is number => isCount(v) && v <= ADS.most

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    c: r2(game.clock),
    o: game.over ? 1 : 0,
    p: game.players.map((p): WirePlayer => [p.id, r2(p.progress), p.skipped, p.finishedAt ?? -1, p.left ? 1 : 0]),
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
    if (!Array.isArray(raw) || raw.length !== 5) return null
    const [id, progress, skipped, finishedAt, left] = raw
    if (typeof id !== 'string' || id.length === 0 || !isProgress(progress) || !isSkipped(skipped)) return null
    if (!isNumber(finishedAt) || (finishedAt < 0 && finishedAt !== -1)) return null
    if (left !== 0 && left !== 1) return null
    players.push([id, progress, skipped, finishedAt, left])
  }
  return { id: message.g as number, seed: message.s as number, clock: message.c, over: message.o === 1, players }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clock,
 * which the caller eases, and this browser's own place in the feed, which is
 * whichever of its own and the host's is further on - it scrolls ahead of
 * what the host has heard. Once the game is over the host's word is the only one.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id || game.seed !== snap.seed) {
    const fresh = createGame(snap.seed, [], snap.id)
    game.ads = fresh.ads
    game.players = []
    game.clock = snap.clock
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  if (snap.over) game.clock = snap.clock
  const next: Player[] = []
  for (const [id, progress, skipped, finishedAt, left] of snap.players) {
    const player = game.players.find((p) => p.id === id) ?? newPlayer(id)
    const mine = id === me
    player.mine = mine
    player.left = left === 1
    const theirs = finishedAt >= 0 ? finishedAt : null
    if (!mine || snap.over) {
      player.progress = progress
      player.skipped = skipped
      player.finishedAt = theirs
      if (!mine) player.blockedAt = null
    } else {
      if (skipped > player.skipped) player.blockedAt = null
      player.progress = Math.max(player.progress, progress)
      player.skipped = Math.max(player.skipped, skipped)
      player.finishedAt = theirs ?? player.finishedAt
    }
    next.push(player)
  }
  game.players = next
  return game
}

export function encodeIntent(intent: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, g: intent.game, p: r2(intent.progress), s: intent.skipped }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isProgress(message.p) || !isSkipped(message.s)) return null
  return { game: message.g as number, progress: message.p, skipped: message.s }
}
