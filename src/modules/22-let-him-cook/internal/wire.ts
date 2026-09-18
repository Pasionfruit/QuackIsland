/**
 * One kitchen, on the wire.
 *
 * The host sends what everybody can see: the counter, the items the chef has
 * **taken so far** while cooking, the counter laid out again, who claimed what,
 * the line, what happened on the last turn, and where the baskets stand and how
 * far they rotate - everybody sees them move. **It never sends the recipe** -
 * not the seed, not how many of each ingredient went in, not the chef's picks
 * once the cooking is over. A guest that wants the answer has to watch for it,
 * like everybody else.
 *
 * A guest sends a pick: which game, which turn, which slot. Said again until the
 * turn moves on, and harmless to repeat - the host only takes a pick for the
 * turn it is on, from whoever's turn it is.
 */
import { INGREDIENTS, KITCHEN, PHASES, WHYS, pickTime, type Cook, type Game, type Pick } from './rules'

export const SNAPSHOT_TAG = 'lhc'
export const INTENT_TAG = 'lhc-in'

/** `[id, why (-1 for still in), out order, claims]`. */
export type WireCook = [string, number, number, number]

export interface Snapshot {
  id: number
  recipe: number
  phase: (typeof PHASES)[number]
  clock: number
  elapsed: number
  turned: number
  spin: number
  counter: number[]
  shown: number[]
  served: number[]
  claimed: (number | null)[]
  queue: number[]
  turn: number
  last: Pick | null
  cooks: WireCook[]
}

/** How far ahead of the chef's clock a pick is sent, so a guest has it before its moment comes. */
export const LOOKAHEAD = 0.4

const r2 = (n: number) => Math.round(n * 100) / 100
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0
const isSlot = (v: unknown): v is number => isCount(v) && (v as number) < KITCHEN.items
const kinds = (text: unknown): number[] | null => {
  if (typeof text !== 'string' || text.length !== KITCHEN.items || !/^[0-9]+$/.test(text)) return null
  const out = [...text].map(Number)
  return out.every((k) => k < INGREDIENTS.length) ? out : null
}

/** The chef's picks a guest may know about at this moment of the cooking. */
export function shownPicks(game: Game): number[] {
  if (game.phase !== 'cooking') return []
  return game.picks.filter((_, n) => pickTime(n, game.recipe) - KITCHEN.reach <= game.clock + LOOKAHEAD)
}

export function encodeSnapshot(game: Game): Record<string, unknown> {
  const last = game.last
  return {
    t: SNAPSHOT_TAG,
    g: game.id,
    r: game.recipe,
    p: PHASES.indexOf(game.phase),
    c: r2(game.clock),
    e: r2(game.elapsed),
    o: [game.turned, game.spin],
    k: game.counter.join(''),
    x: shownPicks(game),
    s: game.served.join(''),
    m: game.claimed.map((c) => (c === null ? -1 : c)),
    q: game.queue,
    n: game.turn,
    l: last ? [last.player, last.slot ?? -1, last.kind ?? -1, last.ok ? 1 : 0, last.why ? WHYS.indexOf(last.why) : -1] : 0,
    pl: game.players.map((c): WireCook => [c.id, c.out ? WHYS.indexOf(c.out.why) : -1, c.out ? c.out.order : 0, c.claims]),
  }
}

export function decodeSnapshot(message: Record<string, unknown>): Snapshot | null {
  if (message.t !== SNAPSHOT_TAG) return null
  if (!isCount(message.g) || !isCount(message.r) || !isCount(message.n)) return null
  if (!isCount(message.p) || PHASES[message.p as number] === undefined) return null
  if (!isNumber(message.c) || message.c < 0 || !isNumber(message.e) || message.e < 0) return null
  const counter = kinds(message.k)
  const served = kinds(message.s)
  if (!counter || !served) return null
  const isPlace = (v: unknown): v is number => isCount(v) && (v as number) < KITCHEN.places
  if (!Array.isArray(message.o) || message.o.length !== 2 || !message.o.every(isPlace)) return null
  const [turned, spin] = message.o as number[]

  if (!Array.isArray(message.pl) || message.pl.length === 0 || message.pl.length > 8) return null
  const players = message.pl.length
  const isPlayer = (v: unknown): v is number => isCount(v) && (v as number) < players
  const cooks: WireCook[] = []
  for (const raw of message.pl) {
    if (!Array.isArray(raw) || raw.length !== 4) return null
    const [id, why, order, claims] = raw
    if (typeof id !== 'string' || id.length === 0) return null
    if (!Number.isInteger(why) || why < -1 || why >= WHYS.length || !isCount(order) || !isCount(claims)) return null
    cooks.push([id, why, order, claims])
  }

  if (!Array.isArray(message.x) || message.x.length > KITCHEN.items || !message.x.every(isSlot)) return null
  if (!Array.isArray(message.m) || message.m.length !== KITCHEN.items) return null
  if (!message.m.every((c) => c === -1 || isPlayer(c))) return null
  if (!Array.isArray(message.q) || message.q.length > players || !message.q.every(isPlayer)) return null

  let last: Pick | null = null
  if (message.l !== 0) {
    if (!Array.isArray(message.l) || message.l.length !== 5) return null
    const [player, slot, kind, ok, why] = message.l
    if (!isPlayer(player) || !(slot === -1 || isSlot(slot))) return null
    if (!(kind === -1 || (isCount(kind) && kind < INGREDIENTS.length))) return null
    if ((ok !== 0 && ok !== 1) || !Number.isInteger(why) || why < -1 || why >= WHYS.length) return null
    last = { player, slot: slot === -1 ? null : slot, kind: kind === -1 ? null : kind, ok: ok === 1, why: why === -1 ? null : WHYS[why] }
  }

  return {
    id: message.g as number,
    recipe: message.r as number,
    phase: PHASES[message.p as number],
    clock: message.c,
    elapsed: message.e,
    turned,
    spin,
    counter,
    shown: message.x as number[],
    served,
    claimed: (message.m as number[]).map((c) => (c === -1 ? null : c)),
    queue: message.q as number[],
    turn: message.n as number,
    last,
    cooks,
  }
}

/**
 * Brings a guest's copy into line with the host's. Everything but the clock,
 * which the caller eases - see `useKitchenNet`. The recipe is not in a snapshot,
 * so a guest's `used` stays empty and its `picks` are only ever what it has been
 * shown.
 */
export function applySnapshot(game: Game, snap: Snapshot, me: string): Game {
  if (game.id !== snap.id) game.players = []
  // Picks shown during a recipe stay known until the next one, so the pot does
  // not empty the moment the cooking ends.
  if (game.id !== snap.id || game.recipe !== snap.recipe) game.picks = []
  if (snap.shown.length > game.picks.length) game.picks = [...snap.shown]

  game.id = snap.id
  game.seed = 0
  game.used = []
  game.recipe = snap.recipe
  game.phase = snap.phase
  game.elapsed = snap.elapsed
  game.turned = snap.turned
  game.spin = snap.spin
  game.counter = snap.counter
  game.served = snap.served
  game.claimed = snap.claimed
  game.queue = snap.queue
  game.turn = snap.turn
  game.last = snap.last
  game.outs = snap.cooks.filter((c) => c[1] >= 0).length

  const next: Cook[] = []
  for (const [id, why, order, claims] of snap.cooks) {
    const cook = game.players.find((c) => c.id === id) ?? { id, mine: false, bot: false, out: null, claims: 0 }
    Object.assign(cook, { mine: id === me, out: why < 0 ? null : { why: WHYS[why], order }, claims })
    next.push(cook)
  }
  game.players = next
  return game
}

export function encodeIntent(game: number, turn: number, slot: number): Record<string, unknown> {
  return { t: INTENT_TAG, g: game, n: turn, s: slot }
}

export function decodeIntent(message: Record<string, unknown>): { game: number; turn: number; slot: number } | null {
  if (message.t !== INTENT_TAG) return null
  if (!isCount(message.g) || !isCount(message.n) || !isSlot(message.s)) return null
  return { game: message.g as number, turn: message.n as number, slot: message.s as number }
}
