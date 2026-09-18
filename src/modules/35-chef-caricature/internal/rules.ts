/**
 * The rules of Chef Caricature, as arithmetic.
 *
 * **Turn by turn**, in an order from the seed, each player gets forty-five
 * seconds at the easel while everybody else watches. An outline of an ingredient
 * or a dish is on the board. **Hold the pen down and trace it without letting
 * go.** The moment your ink has gone all the way round and enclosed the shape -
 * no gap left in the outline - the drawing is accepted: the hungry duck eats it,
 * it is a point, and the next outline is up.
 * Let go before then and the attempt is wiped: start again on the same outline.
 * Nothing can be rubbed out or undone. Most dishes after everybody's turn wins.
 *
 * **Covered** means a point of the outline that ink passed within `TRACE.reach`
 * of. **Enclosed** means no stretch of the outline longer than `TRACE.gap` is
 * left uncovered, so the ink has closed the loop. **Tidy** means ink that stayed within `TRACE.stray` of the outline: an
 * attempt whose ink is mostly off the outline is a scribble, and is not accepted
 * however much it covers - so colouring in the whole board does not work.
 *
 * After an accepted drawing the pen has to come up before it draws again.
 *
 * Everything here is pure: the drawer's own screen, the host and everybody
 * watching run the same pen through it and get the same drawings.
 */
import { createRng, hashSeed } from '../../00-core'
import { SPACING, outlineFor, toOutline, toSegment, type Outline, type Pt } from './outlines'

export const TURN = {
  /** "Next up", seconds. */
  intro: 3,
  /** A turn at the easel, seconds. */
  length: 45,
  /** The dishes a turn fed the duck, shown for this long. */
  result: 3,
} as const

export const TRACE = {
  /** How near ink must come to a point of the outline to cover it, board units. */
  reach: 0.07,
  /** Ink further than this from the outline is off it. */
  stray: 0.13,
  /** The longest stretch of the outline that may be left uncovered and still count as enclosed, board units. */
  gap: 0.06,
  /** The share of the ink that must be on the outline. */
  tidy: 0.6,
  /** Ink closer than this to the last point is not recorded. */
  step: 0.004,
  /** How far off the board ink may go, in board units past its edge. */
  margin: 0.08,
} as const

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  /** Dishes accepted. */
  score: number
  left: boolean
}

export interface Stroke {
  /** The drawer's own count: each press of the pen is a new one. */
  id: number
  /** Board points, x then y, to the thousandth. */
  points: number[]
  /** Which of the outline's points it has covered. */
  covered: boolean[]
  count: number
  /** Ink laid, and how much of it on the outline, board units. */
  ink: number
  tidy: number
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the game was dealt. */
  elapsed: number
  over: boolean
  players: Player[]
  /** Who draws in which turn, by index. */
  order: number[]
  turn: number
  /** When this turn's drawing starts, in `elapsed`: its "next up" is before. */
  startsAt: number
  /** Which outline of the sequence is on the board: how many this turn has fed the duck. */
  outline: number
  stroke: Stroke | null
  /** The last stroke id begun this turn: a stroke is never begun twice. */
  strokes: number
  /** The pen must come up before it draws again: after an accepted drawing. */
  lift: boolean
  /** The last drawing the duck ate, for the flight to its beak, and when. */
  dish: { outline: number; points: number[]; at: number } | null
  /** When an attempt was last wiped. */
  erasedAt: number | null
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export type Phase = 'intro' | 'drawing' | 'result' | 'over'

const round3 = (v: number) => Math.round(v * 1000) / 1000

/** The turn order: everybody once, shuffled by the seed. */
export function turnOrder(seed: number, count: number): number[] {
  const random = createRng(hashSeed(seed, 'chef-caricature:order'))
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({ id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, score: 0, left: false })),
    order: turnOrder(seed, entrants.length),
    turn: 0,
    // The first cook starts on the minigame screen's "Start!" - it has just
    // counted three, two, one, and a "your turn in 3" after it would be a second
    // count. Every later turn keeps its intro: that is a hand-over, not a start.
    startsAt: 0,
    outline: 0,
    stroke: null,
    strokes: 0,
    lift: false,
    dish: null,
    erasedAt: null,
  }
}

/** What is happening just now. */
export function phase(game: Game): Phase {
  if (game.over) return 'over'
  if (game.elapsed < game.startsAt) return 'intro'
  return game.elapsed < game.startsAt + TURN.length ? 'drawing' : 'result'
}

/** Who is drawing this turn, by index. */
export function drawer(game: Game): number {
  return game.order[game.turn] ?? -1
}

/** Seconds of drawing left this turn. */
export function timeLeft(game: Game): number {
  return Math.max(0, Math.min(TURN.length, game.startsAt + TURN.length - game.elapsed))
}

/** The outline on the board. */
export function currentOutline(game: Game): Outline {
  return outlineFor(game.seed, game.outline)
}

/** How much of the outline an attempt has covered, 0 to 1. */
export function coverage(stroke: Stroke | null): number {
  return stroke && stroke.covered.length > 0 ? stroke.count / stroke.covered.length : 0
}

/** The longest stretch of the outline an attempt has left uncovered, board units; 0 once it is all covered. */
export function longestGap(stroke: Stroke | null): number {
  if (!stroke || stroke.covered.length === 0) return Infinity
  const n = stroke.covered.length
  if (stroke.count === n) return 0
  if (stroke.count === 0) return n * SPACING
  // Start just after a covered point, so a gap that wraps round is counted whole.
  const from = stroke.covered.indexOf(true) + 1
  let longest = 0
  let run = 0
  for (let i = 0; i < n; i++) {
    if (stroke.covered[(from + i) % n]) run = 0
    else longest = Math.max(longest, ++run)
  }
  return longest * SPACING
}

/** Whether an attempt has gone all the way round the outline, leaving no gap longer than `TRACE.gap`. */
export function enclosed(stroke: Stroke | null): boolean {
  return longestGap(stroke) <= TRACE.gap + 1e-9
}

/** How much of an attempt's ink is on the outline, 0 to 1; 1 with no ink yet. */
export function tidiness(stroke: Stroke | null): number {
  return stroke && stroke.ink > 1e-9 ? stroke.tidy / stroke.ink : 1
}

const onBoard = (v: number) => round3(Math.max(-1 - TRACE.margin, Math.min(1 + TRACE.margin, v)))

/** Lays ink from `a` to `b`: covers the outline near it, and measures how much of it is on the outline. */
function lay(stroke: Stroke, outline: Outline, a: Pt, b: Pt) {
  outline.points.forEach((q, i) => {
    if (!stroke.covered[i] && toSegment(q, a, b) <= TRACE.reach) {
      stroke.covered[i] = true
      stroke.count += 1
    }
  })
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const pieces = Math.max(1, Math.ceil(length / 0.02))
  for (let i = 0; i < pieces; i++) {
    const t = (i + 0.5) / pieces
    const mid = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    if (toOutline(outline, mid) <= TRACE.stray) stroke.tidy += length / pieces
  }
  stroke.ink += length
}

/**
 * The drawer puts the pen down at (`x`, `y`) on the board, starting attempt
 * `id` - by default the next. Nothing if it is not their turn to draw, the pen
 * is already down, it has not come up since the last dish, or that attempt was
 * begun before.
 */
export function penDown(game: Game, player: number, x: number, y: number, id = game.strokes + 1): boolean {
  if (phase(game) !== 'drawing' || player !== drawer(game) || game.players[player]?.left) return false
  if (game.stroke || game.lift || id <= game.strokes) return false
  const outline = currentOutline(game)
  const p = { x: onBoard(x), y: onBoard(y) }
  const stroke: Stroke = { id, points: [p.x, p.y], covered: new Array<boolean>(outline.points.length).fill(false), count: 0, ink: 0, tidy: 0 }
  lay(stroke, outline, p, p)
  game.stroke = stroke
  game.strokes = id
  return true
}

/**
 * The pen, still down, moves to (`x`, `y`). Returns 'accepted' the moment the
 * attempt has enclosed the outline, tidily enough - it is a point, and the
 * next outline goes up - 'drawn' otherwise, or null if the pen was not drawing.
 */
export function penMove(game: Game, player: number, x: number, y: number): 'accepted' | 'drawn' | null {
  const stroke = game.stroke
  if (!stroke || phase(game) !== 'drawing' || player !== drawer(game)) return null
  const n = stroke.points.length
  const last = { x: stroke.points[n - 2], y: stroke.points[n - 1] }
  const p = { x: onBoard(x), y: onBoard(y) }
  if (Math.hypot(p.x - last.x, p.y - last.y) < TRACE.step) return 'drawn'
  lay(stroke, currentOutline(game), last, p)
  stroke.points.push(p.x, p.y)
  if (enclosed(stroke) && tidiness(stroke) >= TRACE.tidy) {
    game.players[player].score += 1
    game.dish = { outline: game.outline, points: stroke.points, at: game.elapsed }
    game.outline += 1
    game.stroke = null
    game.lift = true
    return 'accepted'
  }
  return 'drawn'
}

/** The pen comes up. An attempt not yet accepted is wiped. Returns 'wiped' if one was. */
export function penUp(game: Game, player: number): 'wiped' | null {
  if (player !== drawer(game)) return null
  game.lift = false
  if (!game.stroke) return null
  game.stroke = null
  game.erasedAt = game.elapsed
  return 'wiped'
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
  if (game.stroke && phase(game) !== 'drawing') game.stroke = null
}

/** The next turn - skipping anybody who has left - or the end. */
function nextTurn(game: Game): void {
  let turn = game.turn + 1
  while (turn < game.order.length && game.players[game.order[turn]]?.left) turn += 1
  if (turn >= game.order.length) {
    game.over = true
    return
  }
  Object.assign(game, { turn, startsAt: game.elapsed + TURN.intro, outline: 0, stroke: null, strokes: 0, lift: false, dish: null, erasedAt: null })
}

/** One step of the clock and the turns - for the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  if (game.over) return game
  if (game.players[drawer(game)]?.left && phase(game) !== 'result') {
    // The drawer has gone: straight to their result.
    game.startsAt = game.elapsed - TURN.length
    game.stroke = null
  }
  if (game.elapsed >= game.startsAt + TURN.length + TURN.result) nextTurn(game)
  return game
}

/** A player who has left the lobby. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || game.over) return
  p.left = true
}

/** Everybody, best first, with their place: most dishes first, anybody who left last. Level scores share a place. */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player) => p.score - (p.left ? 1000 : 0)
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => key(b.player) - key(a.player) || a.index - b.index)
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => key(other.player) > key(entry.player)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
