/**
 * One game, on the wire.
 *
 * The host sends the clock and every player: how high they are, which arrow
 * they are on, how many keys they have pressed and missed, when they were
 * knocked out, whether they have left. The arrows are not sent: the seed deals
 * them.
 *
 * A guest sends every key it presses, the moment it presses it, numbered. The
 * relay keeps a sender's messages in order, so the host - pressing the same key
 * on the same arrow - comes to the same answer the guest's own screen did.
 */
import { MAX_PLAYERS } from './setup'
import { ROUND, type Arrow, type Game, type Player } from './rules'

export const SNAPSHOT_TAG = 'hir'
export const PRESS_TAG = 'hir-k'

/** `[id, height, typed, inputs, misses, best, out cs or -1, flags: 1 left]`. */
export type WirePlayer = [string, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  elapsed: number
  over: boolean
  players: WirePlayer[]
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
/** Nobody presses more than this many keys in a game - twenty a second, flat out. */
const MOST = ROUND.limit * 20 + 100

export function encodeSnapshot(game: Game): Record<string, unknown> {
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    e: Math.round(game.elapsed * 100) / 100,
    o: game.over ? 1 : 0,
    p: game.players.map((p): WirePlayer => [p.id, p.height, p.typed, p.inputs, p.misses, p.best, p.out === null ? -1 : Math.round(p.out * 100), p.left ? 1 : 0]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isNumber(message.e) || message.e < 0) return null
  if (message.o !== 0 && message.o !== 1) return null
  if (!Array.isArray(message.p) || message.p.length === 0 || message.p.length > MAX_PLAYERS) return null
  const players: WirePlayer[] = []
  for (const raw of message.p) {
    if (!Array.isArray(raw) || raw.length !== 8) return null
    const [id, height, typed, inputs, misses, best, out, flags] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (![height, typed, inputs, misses, best].every((v) => isCount(v) && v <= MOST)) return null
    if (height > typed || typed + misses !== inputs || best < height) return null
    if (!(out === -1 || (isCount(out) && out <= (ROUND.limit + 1) * 100)) || (flags !== 0 && flags !== 1)) return null
    players.push([id, height, typed, inputs, misses, best, out, flags])
  }
  return { id: message.g as number, seed: message.s as number, elapsed: message.e, over: message.o === 1, players }
}

/**
 * Brings a guest's copy into line with the host's, all but the clock, which
 * the caller eases. A guest's own tower stays as its own screen has it until the
 * host has heard every key it pressed - then the host's word, which is the same
 * answer. Being knocked out and leaving are always the host's. Without `hold` -
 * the guest has not pressed anything for a while, so the host has heard all it
 * ever will - the host's word whatever it says.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string, hold = true): Game {
  if (game.id !== snap.id) {
    game.players = []
    game.elapsed = snap.elapsed
  }
  game.id = snap.id
  game.seed = snap.seed
  game.over = snap.over
  game.players = snap.players.map(([id, height, typed, inputs, misses, best, out, flags]) => {
    const known = game.players.find((p) => p.id === id)
    const player: Player = known ?? {
      id,
      mine: false,
      bot: false,
      height,
      typed,
      inputs,
      misses,
      best,
      out: null,
      left: false,
      leftAt: null,
      pressedAt: -Infinity,
      wrongAt: -Infinity,
    }
    player.mine = id === me
    const ahead = player.mine && !!known && !snap.over && hold && known.inputs > inputs
    if (!ahead) {
      // Somebody else's key: shown as a press the moment it is heard.
      if (known && inputs > known.inputs) {
        player.pressedAt = game.elapsed
        if (misses > known.misses) player.wrongAt = game.elapsed
      }
      Object.assign(player, { height, typed, inputs, misses, best })
    }
    player.out = out < 0 ? null : out / 100
    player.left = flags === 1
    return player
  })
  return game
}

export function encodePress(game: number, n: number, arrow: Arrow): Record<string, unknown> {
  return { t: PRESS_TAG, g: game, n, k: arrow }
}

export function decodePress(message: Record<string, unknown>): { game: number; n: number; arrow: Arrow } | null {
  if (message.t !== PRESS_TAG) return null
  if (!isCount(message.g) || !isCount(message.n) || message.n > MOST) return null
  if (message.k !== 0 && message.k !== 1 && message.k !== 2 && message.k !== 3) return null
  return { game: message.g as number, n: message.n, arrow: message.k }
}
