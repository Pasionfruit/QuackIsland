/**
 * One game, on the wire.
 *
 * The host sends what everybody sees: the web's seed and size, the clock, whose
 * turn it is, every string cut - who cut it and whether it eliminated - and
 * where everybody is. **Never which uncut strings eliminate**, and never the
 * secret that decides it: a string's nature is only sent once it is cut.
 *
 * A guest sends which way it is walking, four times a second and on every
 * change, and - when it cuts - the string, the turn it cut on, and a number that
 * goes up with each cut, said again until the host has taken it.
 */
import { PHASES, type Cut, type Cutter, type Game, type Intent, type Last } from './rules'

export const SNAPSHOT_TAG = 'mc'
export const INTENT_TAG = 'mc-in'

/** `[id, x, y, facing, out order (0 for in), out string, out at, cuts, seq]`. */
export type WireCutter = [string, number, number, number, number, number, number, number, number]

export interface Snapshot {
  id: number
  seed: number
  count: number
  phase: (typeof PHASES)[number]
  clock: number
  elapsed: number
  turn: number
  turns: number
  last: Last | null
  cut: (Cut | null)[]
  cutters: WireCutter[]
}

/** The most strings there can be: eight players. */
const MOST_STRINGS = 3 * 8 + 7
const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

export function encodeSnapshot(game: Game): Record<string, unknown> {
  const cuts: [number, number, number, number][] = []
  game.cut.forEach((c, string) => {
    if (c) cuts.push([string, c.player, c.deadly ? 1 : 0, r2(c.at)])
  })
  const last = game.last
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    s: game.seed,
    k: game.count,
    p: PHASES.indexOf(game.phase),
    c: r2(game.clock),
    e: r2(game.elapsed),
    u: game.turn,
    n: game.turns,
    l: last ? [last.player, last.string, last.deadly ? 1 : 0, last.auto ? 1 : 0] : 0,
    x: cuts,
    f: game.players.map(
      (p): WireCutter => [p.id, r2(p.x), r2(p.y), r2(p.facing), p.out ? p.out.order : 0, p.out ? p.out.string : -1, p.out ? r2(p.out.at) : 0, p.cuts, p.seq],
    ),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.s) || !isCount(message.n)) return null
  if (!isCount(message.k) || (message.k as number) > MOST_STRINGS) return null
  if (!isCount(message.p) || PHASES[message.p as number] === undefined) return null
  if (!isNumber(message.c) || message.c < 0 || !isNumber(message.e) || message.e < 0) return null
  if (!Array.isArray(message.f) || message.f.length === 0 || message.f.length > 8) return null
  const players = message.f.length
  const count = message.k as number
  const isPlayer = (v: unknown): v is number => isCount(v) && (v as number) < players
  const isString = (v: unknown): v is number => isCount(v) && (v as number) < count
  if (!isPlayer(message.u)) return null

  const cutters: WireCutter[] = []
  for (const raw of message.f) {
    if (!Array.isArray(raw) || raw.length !== 9) return null
    const [id, x, y, facing, order, string, at, cuts, seq] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (![x, y, facing, at].every(isNumber) || !isCount(order) || !isCount(cuts) || !isCount(seq)) return null
    if (!(string === -1 || isString(string))) return null
    cutters.push([id, x, y, facing, order, string, at, cuts, seq])
  }

  if (!Array.isArray(message.x) || message.x.length > count) return null
  const cut: (Cut | null)[] = new Array<Cut | null>(count).fill(null)
  for (const raw of message.x) {
    if (!Array.isArray(raw) || raw.length !== 4) return null
    const [string, player, deadly, at] = raw
    if (!isString(string) || !isPlayer(player) || (deadly !== 0 && deadly !== 1) || !isNumber(at)) return null
    cut[string] = { player, deadly: deadly === 1, at }
  }

  let last: Last | null = null
  if (message.l !== 0) {
    if (!Array.isArray(message.l) || message.l.length !== 4) return null
    const [player, string, deadly, auto] = message.l
    if (!isPlayer(player) || !isString(string) || (deadly !== 0 && deadly !== 1) || (auto !== 0 && auto !== 1)) return null
    last = { player, string, deadly: deadly === 1, auto: auto === 1 }
  }

  return {
    id: message.g as number,
    seed: message.s as number,
    count,
    phase: PHASES[message.p as number],
    clock: message.c,
    elapsed: message.e,
    turn: message.u as number,
    turns: message.n as number,
    last,
    cut,
    cutters,
  }
}

/**
 * Brings a guest's copy into line with the host's: everything but the clocks
 * and positions, which the caller eases - see `useTowerNet`. Positions are
 * returned for it, by cutter id.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Map<string, { x: number; y: number; facing: number }> {
  if (game.id !== snap.id) game.players = []
  game.id = snap.id
  game.seed = snap.seed
  game.luck = 0
  game.count = snap.count
  game.deadly = []
  game.cut = snap.cut
  game.phase = snap.phase
  game.turn = snap.turn
  game.turns = snap.turns
  game.last = snap.last
  game.outs = snap.cutters.filter((c) => c[4] > 0).length

  const at = new Map<string, { x: number; y: number; facing: number }>()
  const next: Cutter[] = []
  for (const [id, x, y, facing, order, string, outAt, cuts, seq] of snap.cutters) {
    at.set(id, { x, y, facing })
    const cutter: Cutter = game.players.find((c) => c.id === id) ?? { id, mine: false, bot: false, x, y, facing, out: null, cuts: 0, seq: 0 }
    Object.assign(cutter, { mine: id === me, out: order > 0 ? { order, at: outAt, string } : null, cuts, seq })
    next.push(cutter)
  }
  game.players = next
  return at
}

export interface GuestIntent {
  game: number
  walk: Intent
  /** The last cut asked for: which string, on which turn, and its number. Null before the first. */
  cut: { seq: number; turn: number; string: number } | null
}

export function encodeIntent(intent: GuestIntent): Record<string, unknown> {
  const c = intent.cut
  return { t: INTENT_TAG, g: intent.game, x: r2(intent.walk.x), y: r2(intent.walk.y), q: c ? c.seq : 0, n: c ? c.turn : 0, s: c ? c.string : -1 }
}

/** A guest's intent, with the walk clamped to full speed: a client can send whatever it likes. */
export function decodeIntent(message: Record<string, unknown>): GuestIntent | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isNumber(message.x) || !isNumber(message.y)) return null
  if (!isCount(message.q) || !isCount(message.n) || !Number.isInteger(message.s) || (message.s as number) < -1) return null
  const length = Math.hypot(message.x, message.y)
  const scale = length > 1 ? 1 / length : 1
  const q = message.q as number
  return {
    game: message.g as number,
    walk: { x: message.x * scale, y: message.y * scale },
    cut: q > 0 && (message.s as number) >= 0 ? { seq: q, turn: message.n as number, string: message.s as number } : null,
  }
}
