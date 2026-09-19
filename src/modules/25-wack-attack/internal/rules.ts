/**
 * The rules of Wack-Attack, as arithmetic.
 *
 * A fenced field with sixteen holes in it, four by four, and everybody walking
 * about it with a hammer. Moles pop out of the holes, stay up a moment, and go
 * back down. Walk over, swing, and the mole in front of you is whacked: a point
 * for an ordinary mole, five for the golden mole - which is rarer and does not
 * stay up long. First whack on a mole takes it. Most points at a minute wins.
 * A swing that lands on somebody's head instead stuns them: they cannot walk or
 * swing for a moment.
 *
 * Everything here is pure. Which mole comes out of which hole, when, and for
 * how long is a function of the seed, so every browser draws the same moles at
 * the same moment without being told; who whacked what is the host's to say.
 */
import { createRng, hashSeed } from '../../00-core'
import { PLAYER } from '../../02-player'

export const FIELD = {
  /** Holes, in a square grid. */
  columns: 4,
  rows: 4,
  /** Between holes. */
  spacing: 4.2,
  /** A hole's radius, drawn. */
  hole: 0.75,
  /** From the middle to the fence, across and front to back. */
  half: 8.6,
  /** A body, the island pill's own radius. */
  body: PLAYER.radius,
  /** Walking pace, units a second; stand-ins walk a little slower. */
  speed: 7.5,
  botPace: 0.8,

  /** Seconds in a round. */
  duration: 45,
  /** The first mole comes up this long after the start. */
  firstAt: 1.2,
  /** Seconds between moles coming up: at the start of the round, and by the end. */
  gapStart: [0.55, 0.95] as readonly [number, number],
  gapEnd: [0.3, 0.6] as readonly [number, number],
  /** How long an ordinary mole stays up, least and most. */
  up: [1.3, 2.1] as readonly [number, number],
  /** The golden mole: how often, and how long it stays up. */
  goldenChance: 0.12,
  goldenUp: [0.8, 1.1] as readonly [number, number],
  /** How long a mole takes to sink back into its hole, drawn. Nothing else comes out of it meanwhile. */
  sink: 0.3,

  /** Points: an ordinary mole, and the golden one. */
  points: { mole: 1, golden: 5 },

  /** Seconds between swings. */
  swing: 0.4,
  /**
   * The host takes a swing this much early. A guest's clock is eased towards the
   * host's, not locked to it, and a swing its own screen allowed must not be
   * dropped for being a few frames early by the host's.
   */
  swingGrace: 0.1,
  /** A swing lands this far in front of you... */
  strike: 0.95,
  /** ...and whacks a mole whose hole is within this of where it lands... */
  hit: 1.15,
  /** ...or within this of you, if you are standing over it. */
  under: 0.8,
  /**
   * A mole can still be whacked this long after it starts going down. The host
   * hears a guest's swing a moment after the guest made it.
   */
  downGrace: 0.2,

  /** A swing with no mole under it bonks a head within this of where it lands... */
  bonk: 0.7,
  /** ...which stuns that player - no walking, no swinging - this long... */
  stun: 1.5,
  /** ...after which they cannot be stunned again for this long, so nobody is stun-locked. */
  stunGuard: 1.5,
} as const

export interface Point {
  x: number
  y: number
}

/** Where a hole is, on the field: x across, y front to back (the world's z). */
export function holeAt(hole: number): Point {
  const column = hole % FIELD.columns
  const row = Math.floor(hole / FIELD.columns)
  return {
    x: (column - (FIELD.columns - 1) / 2) * FIELD.spacing,
    y: (row - (FIELD.rows - 1) / 2) * FIELD.spacing,
  }
}

export const HOLES = FIELD.columns * FIELD.rows

export interface Mole {
  id: number
  hole: number
  /** When it comes up, and for how long. */
  at: number
  up: number
  golden: boolean
}

const between = (random: () => number, [low, high]: readonly [number, number]) => low + random() * (high - low)

/**
 * Every mole of a round, in the order they come up. A mole never comes out of
 * a hole another mole is still in or sinking back into, nor out of the hole the
 * last one came from. Moles come up faster as the round goes on.
 */
export function schedule(seed: number): Mole[] {
  const random = createRng(hashSeed(seed, 'wack-attack:moles'))
  const moles: Mole[] = []
  let t = FIELD.firstAt
  let last = -1
  while (t < FIELD.duration - 0.5) {
    const busy = new Set(moles.filter((m) => m.at + m.up + FIELD.sink > t).map((m) => m.hole))
    const free = Array.from({ length: HOLES }, (_, i) => i).filter((h) => !busy.has(h) && h !== last)
    if (free.length > 0) {
      const hole = free[Math.floor(random() * free.length)]
      const golden = random() < FIELD.goldenChance
      moles.push({ id: moles.length, hole, at: t, up: between(random, golden ? FIELD.goldenUp : FIELD.up), golden })
      last = hole
    }
    const late = t / FIELD.duration
    const low = FIELD.gapStart[0] + (FIELD.gapEnd[0] - FIELD.gapStart[0]) * late
    const high = FIELD.gapStart[1] + (FIELD.gapEnd[1] - FIELD.gapStart[1]) * late
    t += low + random() * (high - low)
  }
  return moles
}

const schedules = new Map<number, Mole[]>()
/** The same seed's moles, worked out once. */
export function molesFor(seed: number): Mole[] {
  let moles = schedules.get(seed)
  if (!moles) {
    moles = schedule(seed)
    if (schedules.size > 16) schedules.clear()
    schedules.set(seed, moles)
  }
  return moles
}

export interface Whacker {
  id: string
  mine: boolean
  bot: boolean
  x: number
  y: number
  facing: number
  score: number
  whacks: number
  golden: number
  /** Swings dealt with so far, as a running count. */
  swings: number
  /** When the last swing started. */
  swungAt: number
  /** Until when this player is stunned. */
  stunnedUntil: number
  /** Heads bonked, as a running count. */
  bonks: number
}

export interface Whack {
  mole: number
  player: number
  at: number
}

export interface Game {
  /** The moles. Not a secret: knowing when a mole comes up does not walk you there. */
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Whacker[]
  whacks: Whack[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export interface Intent {
  x: number
  y: number
  /** Swings made, ever, this round. */
  swings: number
}

/** Where everybody starts: round the edge of the field, facing in. */
export function spawns(count: number): { x: number; y: number; facing: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * Math.PI * 2 + Math.PI / 4
    const r = FIELD.half * 0.85
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, facing: a + Math.PI }
  })
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  const starts = spawns(entrants.length)
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e, i) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      ...starts[i],
      score: 0,
      whacks: 0,
      golden: 0,
      swings: 0,
      swungAt: -Infinity,
      stunnedUntil: -Infinity,
      bonks: 0,
    })),
    whacks: [],
  }
}

export function timeLeft(game: Game): number {
  return Math.max(0, FIELD.duration - game.elapsed)
}

/** Whether a mole has been whacked, and by whom. */
export function whackOf(game: Game, mole: number): Whack | undefined {
  return game.whacks.find((w) => w.mole === mole)
}

/** Whether a mole is out of its hole at a moment - not counting a whack. */
export function isUp(mole: Mole, time: number): boolean {
  return time >= mole.at && time < mole.at + mole.up
}

/** Where a swing by this whacker lands. */
export function strikePoint(whacker: Whacker): Point {
  return { x: whacker.x + Math.cos(whacker.facing) * FIELD.strike, y: whacker.y + Math.sin(whacker.facing) * FIELD.strike }
}

/** Whether a whacker is seeing stars at a moment. */
export function isStunned(whacker: Whacker, time: number): boolean {
  return time < whacker.stunnedUntil
}

/** Whether a swing is ready - allowing `grace` seconds early. A stunned player cannot swing. */
export function canSwing(game: Game, player: number, grace = 0): boolean {
  const w = game.players[player]
  return !!w && !game.over && !isStunned(w, game.elapsed) && game.elapsed - w.swungAt >= FIELD.swing - grace - 1e-9
}

/** The head a swing would bonk: the nearest other player under the hammer who is not stunned or just over it. */
function headUnder(game: Game, player: number, at: Point): number {
  let best = -1
  let nearest: number = FIELD.bonk
  game.players.forEach((other, index) => {
    if (index === player || game.elapsed < other.stunnedUntil + FIELD.stunGuard) return
    const distance = Math.hypot(other.x - at.x, other.y - at.y)
    if (distance <= nearest) {
      nearest = distance
      best = index
    }
  })
  return best
}

/**
 * A swing. Whacks the mole it lands on - one that is up (or has only just
 * started back down), not whacked already, its hole under the hammer or under
 * you - the nearest if there are two. With no mole there, it bonks the head of
 * anybody standing where it lands, and stuns them. Returns the mole whacked,
 * null for a swing at no mole, or undefined when the swing was not ready.
 */
export function swing(game: Game, player: number): Mole | null | undefined {
  if (!canSwing(game, player, FIELD.swingGrace)) return undefined
  const whacker = game.players[player]
  whacker.swungAt = game.elapsed
  const at = strikePoint(whacker)
  const now = game.elapsed
  let best: { mole: Mole; distance: number } | null = null
  for (const mole of molesFor(game.seed)) {
    if (mole.at > now) break
    if (now > mole.at + mole.up + FIELD.downGrace || whackOf(game, mole.id)) continue
    const hole = holeAt(mole.hole)
    const fromStrike = Math.hypot(hole.x - at.x, hole.y - at.y)
    const fromBody = Math.hypot(hole.x - whacker.x, hole.y - whacker.y)
    if (fromStrike > FIELD.hit && fromBody > FIELD.under) continue
    const distance = Math.min(fromStrike, fromBody)
    if (!best || distance < best.distance) best = { mole, distance }
  }
  if (!best) {
    const head = headUnder(game, player, at)
    if (head >= 0) {
      game.players[head].stunnedUntil = now + FIELD.stun
      whacker.bonks += 1
    }
    return null
  }
  game.whacks.push({ mole: best.mole.id, player, at: now })
  whacker.score += best.mole.golden ? FIELD.points.golden : FIELD.points.mole
  whacker.whacks += 1
  if (best.mole.golden) whacker.golden += 1
  return best.mole
}

/** Moves one whacker by an intent, for a step. Exported so a guest can move its own body the same way. */
export function walk(whacker: Whacker, intent: { x: number; y: number }, step: number): void {
  const length = Math.hypot(intent.x, intent.y)
  if (length === 0) return
  const pace = FIELD.speed * (whacker.bot ? FIELD.botPace : 1) * step * Math.min(1, length)
  whacker.x += (intent.x / length) * pace
  whacker.y += (intent.y / length) * pace
  whacker.facing = Math.atan2(intent.y, intent.x)
  keepIn(whacker)
}

function keepIn(body: Point): void {
  const limit = FIELD.half - FIELD.body
  body.x = Math.max(-limit, Math.min(limit, body.x))
  body.y = Math.max(-limit, Math.min(limit, body.y))
}

/** Keeps bodies out of each other and inside the fence. */
function separate(game: Game): void {
  const bodies = game.players
  const minimum = FIELD.body * 2
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]
      const b = bodies[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const apart = Math.hypot(dx, dy)
      if (apart >= minimum) continue
      const nx = apart === 0 ? 1 : dx / apart
      const ny = apart === 0 ? 0 : dy / apart
      const shift = (minimum - apart) / 2
      a.x -= nx * shift
      a.y -= ny * shift
      b.x += nx * shift
      b.y += ny * shift
    }
  }
  for (const body of bodies) keepIn(body)
}

/**
 * One step: every swing beyond the ones already dealt with, everybody walks,
 * and the clock.
 */
export function stepGame(game: Game, intents: ReadonlyMap<string, Intent>, dt: number): Game {
  if (game.over) return game
  const step = Math.min(Math.max(dt, 0), 0.05)
  game.elapsed = Math.min(FIELD.duration, game.elapsed + step)
  game.players.forEach((whacker, player) => {
    const intent = intents.get(whacker.id)
    if (!intent) return
    // A swing asked for during the last one's cooldown is dropped, not saved up.
    while (whacker.swings < intent.swings) {
      whacker.swings += 1
      swing(game, player)
    }
  })
  for (const whacker of game.players) {
    const intent = intents.get(whacker.id)
    if (intent && !isStunned(whacker, game.elapsed)) walk(whacker, intent, step)
  }
  separate(game)
  if (game.elapsed >= FIELD.duration) game.over = true
  return game
}

/** Everybody, best first, with their place. Level scores share a place. */
export function placings(game: Game): { whacker: Whacker; index: number; place: number }[] {
  const ranked = game.players.map((whacker, index) => ({ whacker, index })).sort((a, b) => b.whacker.score - a.whacker.score)
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => other.whacker.score > entry.whacker.score).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. None of them gold. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#9c4bb0', '#4fb35a', '#f08a3c', '#35bdbd', '#ef7fb4', '#2e2e3c'] as const
