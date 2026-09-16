/**
 * One game, on the wire.
 *
 * The host runs the game and sends it out; a guest sends what it wants - which
 * path, confirmed or not, for which round. Both are state rather than events,
 * repeated, so a message the relay drops costs a moment rather than a choice.
 *
 * **The seed never goes out.** Which paths hold is worked out from it, so a
 * guest holding it could know the answers before the reveal. A snapshot
 * carries the game's `id` to tell one game from the next, and the safe paths
 * only once they have been decided.
 */
import { GAME, type Game, type Intent, type Phase, type Player } from './game'

/** Host to everybody: the game. Unique across the build. */
export const SNAPSHOT_TAG = 'ps'
/** Guest to host: what they want. */
export const INTENT_TAG = 'ps-in'

/** `[id, pick, confirmed, alive, outIn]`, with `outIn` -1 for somebody still in. */
export type WirePlayer = [string, number, 0 | 1, 0 | 1, number]

export interface Snapshot {
  id: number
  round: number
  phase: Phase
  clock: number
  safe: number[]
  players: WirePlayer[]
}

const PHASES: readonly Phase[] = ['choosing', 'reveal', 'over']
const isPath = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < GAME.paths
const isRound = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < GAME.rounds

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    r: game.round,
    h: PHASES.indexOf(game.phase),
    k: Math.round(game.clock * 100) / 100,
    s: game.safe,
    p: game.players.map(
      (p): WirePlayer => [p.id, p.pick, p.confirmed ? 1 : 0, p.alive ? 1 : 0, p.outIn ?? -1],
    ),
  }
}

/** Reads a snapshot, or `null` for anything that is not one - refused whole, never half-read. */
export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!Number.isInteger(message.g) || !isRound(message.r)) return null
  if (!Number.isInteger(message.h) || PHASES[message.h as number] === undefined) return null
  if (typeof message.k !== 'number' || !Number.isFinite(message.k) || message.k < 0) return null
  if (!Array.isArray(message.s) || !message.s.every(isPath) || message.s.length > GAME.paths) return null
  if (!Array.isArray(message.p)) return null

  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 5) return null
    const [id, pick, confirmed, alive, outIn] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!isPath(pick)) return null
    if ((confirmed !== 0 && confirmed !== 1) || (alive !== 0 && alive !== 1)) return null
    if (!(outIn === -1 || isRound(outIn))) return null
    players.push([id, pick, confirmed, alive, outIn])
  }
  // A real game always has somebody in it; an empty one would clear everybody's.
  if (players.length === 0) return null

  return {
    id: message.g as number,
    round: message.r as number,
    phase: PHASES[message.h as number],
    clock: message.k,
    safe: message.s as number[],
    players,
  }
}

export function encodeIntent(intent: Intent): Record<string, unknown> {
  return { t: INTENT_TAG, r: intent.round, p: intent.pick, c: intent.confirmed ? 1 : 0 }
}

export function decodeIntent(message: Record<string, unknown>): Intent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isRound(message.r) || !isPath(message.p)) return null
  if (message.c !== 0 && message.c !== 1) return null
  return { round: message.r, pick: message.p, confirmed: message.c === 1 }
}

/**
 * Brings a guest's copy of the game into line with the host's.
 *
 * Players are updated in place, because the scene keeps a body per player. A
 * different `id` is a different game, so the players are dealt afresh. The
 * guest's copy never has the seed - it does not need one.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) game.players = []
  game.id = snap.id
  game.round = snap.round
  game.phase = snap.phase
  game.clock = snap.clock
  game.safe = [...snap.safe]

  const seen = new Set<string>()
  for (const [id, pick, confirmed, alive, outIn] of snap.players) {
    seen.add(id)
    let player: Player | undefined = game.players.find((p) => p.id === id)
    if (!player) {
      player = { id, pick, confirmed: false, alive: true, outIn: null, mine: false, bot: false }
      game.players.push(player)
    }
    player.pick = pick
    player.confirmed = confirmed === 1
    player.alive = alive === 1
    player.outIn = outIn < 0 ? null : outIn
    player.mine = id === me
  }
  game.players = game.players.filter((p) => seen.has(p.id))
  return game
}
