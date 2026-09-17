/**
 * The rules of Lady Luck, as arithmetic.
 *
 * A meadow of three-leaf clovers, and hidden among them, always exactly three
 * four-leaf ones. Find one and click it: it is yours - ringed in your colour, and
 * nobody else can have it - and a new four-leaf clover grows somewhere else in
 * the field, well away from the other two. Most claimed when the minute is up
 * wins.
 *
 * A click that is not a free four-leaf clover - a three-leaf one, one somebody
 * has already claimed, bare grass - costs you a second before you can click
 * again. Clicking everything is slower than looking.
 *
 * Everything here is pure. The field comes from a seed everybody knows, since
 * everybody draws it; where the four-leaf clovers grow comes from a second,
 * secret one, so where the next one will be cannot be worked out in advance.
 */
import { createRng, hashSeed } from '../../00-core'

export const FIELD = {
  /** The meadow: clovers on a jittered grid. */
  columns: 20,
  rows: 11,
  spacing: 1.15,
  /**
   * How far a clover sits from its grid point, most. Small enough that no two
   * clovers' leaves overlap: counting leaves is the game.
   */
  jitter: 0.18,
  /** How close to a clover's middle a click has to land to be on it. */
  reach: 0.5,
  /** How big a clover is drawn, least and most, as a scale on the leaves. */
  scale: [0.88, 1.08] as readonly [number, number],

  /** How many four-leaf clovers are hidden at once. */
  hidden: 3,
  /** How far a new four-leaf clover grows from the others and from the one just claimed. */
  apart: 3.5,

  /** Seconds in a round. */
  duration: 60,
  /** Seconds before you can click again after a click that did not claim. */
  cooldown: 1,
  /**
   * A click this close to the end of the cooldown still counts. A guest's click
   * leaves when its own copy of the cooldown is done; the host's copy may be a
   * few frames behind.
   */
  cooldownGrace: 0.15,
} as const

export interface Clover {
  x: number
  z: number
  /** Which way its first leaf points, radians. */
  angle: number
  scale: number
  /** 0 to 1, how yellow-green rather than blue-green. */
  tint: number
}

/** The meadow for a seed: every clover's place, turn, size and shade. */
export function layField(seed: number): Clover[] {
  const random = createRng(hashSeed(seed, 'lady-luck:field'))
  const width = (FIELD.columns - 1) * FIELD.spacing
  const depth = (FIELD.rows - 1) * FIELD.spacing
  const out: Clover[] = []
  for (let row = 0; row < FIELD.rows; row++) {
    for (let column = 0; column < FIELD.columns; column++) {
      out.push({
        x: -width / 2 + column * FIELD.spacing + (random() * 2 - 1) * FIELD.jitter,
        z: -depth / 2 + row * FIELD.spacing + (random() * 2 - 1) * FIELD.jitter,
        angle: random() * Math.PI * 2,
        scale: FIELD.scale[0] + random() * (FIELD.scale[1] - FIELD.scale[0]),
        tint: random(),
      })
    }
  }
  return out
}

const fields = new Map<number, Clover[]>()
/** The same seed's field, laid once. */
export function fieldFor(seed: number): Clover[] {
  let field = fields.get(seed)
  if (!field) {
    field = layField(seed)
    if (fields.size > 16) fields.clear()
    fields.set(seed, field)
  }
  return field
}

export interface Hunter {
  id: string
  mine: boolean
  bot: boolean
  score: number
  misses: number
  /** Seconds before this hunter can click again. */
  cooldown: number
  /** The last click taken from this hunter, so a click said twice counts once. */
  seq: number
  /** The last click that did not claim, and when: for drawing it. */
  miss: { clover: number | null; at: number } | null
  /** A stand-in's last misclick window. Host only. */
  missWindow: number
}

/** A four-leaf clover still waiting to be found: which clover, the how-manyth to grow, and since when. */
export interface Lucky {
  clover: number
  n: number
  since: number
}

export interface Claim {
  clover: number
  player: number
  at: number
}

export interface Game {
  /** The field. Everybody's. */
  seed: number
  /** Where four-leaf clovers grow. The host's secret: never sent. */
  luck: number
  id: number
  elapsed: number
  over: boolean
  players: Hunter[]
  lucky: Lucky[]
  claims: Claim[]
  /** How many four-leaf clovers have grown. */
  grown: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

/** Whether a clover is a four-leaf one - hidden or claimed. */
export function fourLeaf(game: Game, clover: number): boolean {
  return game.lucky.some((l) => l.clover === clover) || game.claims.some((c) => c.clover === clover)
}

/**
 * Grows the next four-leaf clover: anywhere not already four-leaf, as far as it
 * can be from the others and from `awayFrom` - at least `FIELD.apart` if there
 * is room.
 */
function grow(game: Game, awayFrom: number | null): void {
  const field = fieldFor(game.seed)
  const random = createRng(hashSeed(game.luck, `lady-luck:grow:${game.grown}`))
  const others = [...game.lucky.map((l) => l.clover), ...(awayFrom === null ? [] : [awayFrom])]
  const free = field.map((_, i) => i).filter((i) => !fourLeaf(game, i))
  const far = free.filter((i) => others.every((o) => Math.hypot(field[i].x - field[o].x, field[i].z - field[o].z) >= FIELD.apart))
  const from = far.length > 0 ? far : free
  if (from.length === 0) return
  game.lucky.push({ clover: from[Math.floor(random() * from.length)], n: game.grown, since: game.elapsed })
  game.grown += 1
}

export function createGame(seed: number, luck: number, entrants: readonly Entrant[], id = 1): Game {
  const game: Game = {
    seed,
    luck,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      score: 0,
      misses: 0,
      cooldown: 0,
      seq: 0,
      miss: null,
      missWindow: -1,
    })),
    lucky: [],
    claims: [],
    grown: 0,
  }
  for (let i = 0; i < FIELD.hidden; i++) grow(game, null)
  return game
}

export type Outcome = 'claim' | 'miss' | 'ignored'

/**
 * A hunter clicks `clover` - or bare grass, for null.
 *
 * A free four-leaf clover is claimed, and another grows. Anything else is a
 * miss and starts the cooldown. Nothing counts during the cooldown, after the
 * round, or for a `seq` already dealt with.
 */
export function click(game: Game, player: number, clover: number | null, seq?: number): Outcome {
  const hunter = game.players[player]
  if (!hunter || game.over) return 'ignored'
  if (seq !== undefined) {
    if (seq <= hunter.seq) return 'ignored'
    hunter.seq = seq
  }
  if (hunter.cooldown > FIELD.cooldownGrace) return 'ignored'

  const found = clover === null ? -1 : game.lucky.findIndex((l) => l.clover === clover)
  if (found >= 0) {
    game.lucky.splice(found, 1)
    game.claims.push({ clover: clover as number, player, at: game.elapsed })
    hunter.score += 1
    hunter.cooldown = 0
    grow(game, clover)
    return 'claim'
  }
  hunter.misses += 1
  hunter.cooldown = FIELD.cooldown
  hunter.miss = { clover, at: game.elapsed }
  return 'miss'
}

export function stepGame(game: Game, dt: number): Game {
  if (game.over) return game
  const step = Math.min(Math.max(dt, 0), 0.25)
  game.elapsed = Math.min(FIELD.duration, game.elapsed + step)
  for (const hunter of game.players) hunter.cooldown = Math.max(0, hunter.cooldown - step)
  if (game.elapsed >= FIELD.duration) game.over = true
  return game
}

export function timeLeft(game: Game): number {
  return Math.max(0, FIELD.duration - game.elapsed)
}

/** The clover under a point on the ground, or null for bare grass. */
export function cloverAt(seed: number, x: number, z: number): number | null {
  const field = fieldFor(seed)
  let best: number | null = null
  let nearest: number = FIELD.reach
  for (let i = 0; i < field.length; i++) {
    const d = Math.hypot(field[i].x - x, field[i].z - z)
    if (d <= nearest) {
      nearest = d
      best = i
    }
  }
  return best
}

/** Everybody, best first, with their place. Level scores share a place. */
export function placings(game: Game): { hunter: Hunter; index: number; place: number }[] {
  const ranked = game.players.map((hunter, index) => ({ hunter, index })).sort((a, b) => b.hunter.score - a.hunter.score)
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => other.hunter.score > entry.hunter.score).length,
  }))
}

/**
 * Eight colours that do not look alike, one per player, in roster order. None of
 * them green, to stand out on the field, and none of them white, which is the
 * ring round a claim still waiting on the host.
 */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4', '#2e2e3c'] as const
