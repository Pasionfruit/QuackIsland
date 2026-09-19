/**
 * One game, on the wire.
 *
 * The host sends the clock and, for every player, **when they pulled** - and
 * that is all. The bites are the seed's, and what each pull landed is worked out
 * from the pulls on every screen, so no fish is ever sent.
 *
 * A guest sends **every pull it has made this game, by its own clock**. The host
 * takes those it has not seen yet, believing a reading up to half a second old,
 * so being further from the host is not being slower to pull. Sending the whole
 * list means a lost message loses nothing and a repeated one doubles nothing.
 */
import { LENGTH } from './pond'
import { MAX_PLAYERS } from './setup'
import { type Game, type Player } from './rules'

export const SNAPSHOT_TAG = 'mf'
export const INTENT_TAG = 'mf-in'

/** At most this many pulls a game: one every recast at the very most. */
const MOST = 40
const LATEST = (LENGTH + 1) * 100

/** `[id, pulls in cs, flags: 1 left]`. */
export type WirePlayer = [string, number[], number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const cs = (v: number) => Math.round(v * 100)

/** A list of pull times in hundredths: whole, in order, in the round. */
function pullsOk(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length > MOST) return false
  for (let i = 0; i < v.length; i++) if (!isCount(v[i]) || v[i] > LATEST || (i > 0 && v[i] <= v[i - 1])) return false
  return true
}

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    p: game.players.map((p): WirePlayer => [p.id, p.pulls.map(cs), p.left ? 1 : 0]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 3) return null
    const [id, pulls, flags] = raw
    if (typeof id !== 'string' || id.length === 0 || !pullsOk(pulls) || (flags !== 0 && flags !== 1)) return null
    players.push([id, pulls, flags])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, players }
}

/**
 * Brings a guest's copy into line with the host's, all but the clock, which the
 * caller eases. Everything is the host's; a guest's own pulls the host has not
 * heard yet are kept on by the caller.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  game.players = snap.players.map(([id, pulls, flags]) => {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? { id, mine: false, bot: false, pulls: [], left: false, leftAt: null }
    player.mine = id === me
    player.pulls = pulls.map((p) => p / 100)
    player.left = flags === 1
    return player
  })
  return game
}

export interface Intent {
  game: number
  /** Every pull so far this game, by the guest's own clock, seconds. */
  pulls: number[]
}

export function encodeIntent(i: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, g: i.game, p: i.pulls.map(cs) }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !pullsOk(message.p)) return null
  return { game: message.g as number, pulls: (message.p as number[]).map((p) => p / 100) }
}
