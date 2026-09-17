/**
 * The rules of Sharing Is Caring, as arithmetic.
 *
 * A crown sits in the middle of a walled round arena. Walk into it and it is
 * yours; while you wear it you score a point a second. Anybody who bumps into
 * you takes it. After a minute, the most points wins.
 *
 * No three.js, no React, no clock of its own. `stepRound` takes a round, which
 * way everybody is walking and how long since last time, and gives back the
 * round a moment later.
 *
 * World axes as the other minigames: the rules work in a flat x/y, and the
 * scene stands it up with y as the world's z.
 */
import { PLAYER } from '../../02-player'

export const ARENA = {
  /** How long a round lasts, in seconds. */
  duration: 60,
  /** The arena's radius. Its edge is a wall. */
  radius: 11,
  /** How far from the middle everybody starts, as a share of the radius. */
  spawnRing: 0.8,
  /** A body's radius: the island pill's own, so a bump lands where it looks like it does. */
  body: PLAYER.radius,
  /** Walking speed, units a second. */
  speed: 7,
  /**
   * How much of that the wearer keeps. At full pace, one person running round
   * a circle can never be caught by one chaser; a crown has to cost something.
   */
  crownPace: 0.85,
  /** How much a stand-in gets. Enough to catch a person wearing the crown, never enough to outrun one chasing. */
  botPace: 0.9,
  /** How close to the crown's middle a body has to get to pick it up. */
  crown: 0.6,
  /** Points a second while wearing it. */
  rate: 1,
  /**
   * Seconds after the crown changes hands before it can change again. Without
   * it, two bodies still touching pass it back and forth every frame.
   */
  grace: 1.5,
  /**
   * How far from the new wearer a steal knocks everybody crowding them. A bump
   * should look like a bump, and it gives the new wearer a head start.
   */
  bump: 3,
  /**
   * Seconds whoever loses the crown stands dazed, unable to walk. Without it the
   * loser is still touching the new wearer when the grace runs out and takes it
   * straight back, and the crown changes hands every second for a minute.
   */
  daze: 1.2,
  /**
   * Seconds everybody else knocked back by a steal staggers. Knocked back but
   * free to walk, a ring of chasers closes on the new wearer before the grace is
   * out, and every hold lasts exactly as long as the grace.
   */
  stagger: 0.8,
} as const

export interface Wearer {
  id: string
  x: number
  y: number
  /** Which way they face, radians. The way they last walked. */
  facing: number
  /** Points, as seconds worn times the rate. Not rounded. */
  score: number
  /** How many times they took the crown, the first grab included. */
  takes: number
  /** Seconds left standing dazed after losing the crown. Zero when free to walk. */
  dazed: number
  mine: boolean
  bot: boolean
}

export interface Round {
  /** For anything seeded about a round. */
  seed: number
  /** Tells one round from the next on the wire. */
  id: number
  players: Wearer[]
  /** Who wears the crown, or `null` while it is still in the middle. */
  holder: string | null
  /** When it last changed hands, in round seconds. */
  heldSince: number
  elapsed: number
  over: boolean
}

/** Which way somebody wants to walk. A length over one is treated as one. */
export interface Intent {
  x: number
  y: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export interface Point {
  x: number
  y: number
}

/** Where everybody starts: evenly round a ring, facing the crown. */
export function spawns(count: number): (Point & { facing: number })[] {
  const ring = ARENA.radius * ARENA.spawnRing
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2
    const x = Math.cos(angle) * ring
    const y = Math.sin(angle) * ring
    return { x, y, facing: Math.atan2(-y, -x) }
  })
}

export function createRound(seed: number, entrants: readonly Entrant[], id = 1): Round {
  const starts = spawns(entrants.length)
  return {
    seed,
    id,
    elapsed: 0,
    over: false,
    holder: null,
    heldSince: 0,
    players: entrants.map((e, i) => ({
      id: e.id,
      x: starts[i].x,
      y: starts[i].y,
      facing: starts[i].facing,
      score: 0,
      takes: 0,
      dazed: 0,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
    })),
  }
}

export function holderOf(round: Round): Wearer | null {
  return round.holder === null ? null : (round.players.find((p) => p.id === round.holder) ?? null)
}

/** Whether the crown can change hands right now. */
export function canTake(round: Round): boolean {
  return round.holder === null || round.elapsed - round.heldSince >= ARENA.grace
}

function give(round: Round, to: Wearer): void {
  round.holder = to.id
  round.heldSince = round.elapsed
  to.takes += 1
}

/**
 * One step of the round.
 *
 * Mutates and returns the same round. `dt` is clamped, so a tab that comes back
 * from the background does not hand somebody thirty seconds of crown.
 *
 * In order: the wearer scores for the time just gone; everybody not dazed walks; the
 * crown is picked up or stolen; bodies push each other apart; the wall keeps
 * everybody in; and the round ends at a minute.
 */
export function stepRound(round: Round, intents: ReadonlyMap<string, Intent>, dt: number): Round {
  if (round.over) return round
  const step = Math.min(Math.max(dt, 0), 0.05, ARENA.duration - round.elapsed)
  round.elapsed += step

  const wearer = holderOf(round)
  if (wearer) wearer.score += ARENA.rate * step

  for (const p of round.players) {
    if (p.dazed > 0) {
      p.dazed = Math.max(0, p.dazed - step)
      continue
    }
    const intent = intents.get(p.id)
    const length = intent ? Math.hypot(intent.x, intent.y) : 0
    if (!intent || length === 0) continue
    const pace = ARENA.speed * (p.id === round.holder ? ARENA.crownPace : 1) * (p.bot ? ARENA.botPace : 1) * step
    const scale = Math.min(1, length) / length
    p.x += intent.x * scale * pace
    p.y += intent.y * scale * pace
    p.facing = Math.atan2(intent.y, intent.x)
  }

  if (round.holder === null) {
    // Nearest to the middle gets it, so two arriving on one frame is not decided by roster order.
    const reached = round.players
      .map((p) => ({ p, d: Math.hypot(p.x, p.y) }))
      .filter((each) => each.d <= ARENA.crown + ARENA.body)
      .sort((a, b) => a.d - b.d)[0]
    if (reached) give(round, reached.p)
  } else if (canTake(round)) {
    steal(round)
  }

  separate(round)
  for (const p of round.players) wall(p)

  if (round.elapsed >= ARENA.duration) {
    round.elapsed = ARENA.duration
    round.over = true
  }
  return round
}

/**
 * Anybody touching the wearer takes the crown - the closest, if several are, and
 * never somebody still dazed from losing it: the wearer running back into the
 * person they just took it from would otherwise hand it straight back.
 */
function steal(round: Round): void {
  const from = holderOf(round)
  if (!from) return
  const touch = ARENA.body * 2 + 0.05
  const thief = round.players
    .filter((p) => p !== from && p.dazed === 0)
    .map((p) => ({ p, d: Math.hypot(p.x - from.x, p.y - from.y) }))
    .filter((each) => each.d <= touch)
    .sort((a, b) => a.d - b.d)[0]
  if (!thief) return
  const wearer = thief.p
  give(round, wearer)
  from.dazed = ARENA.daze
  // Everybody crowding the new wearer is knocked back, not only the loser: in a
  // scrum somebody else is always touching, and the crown would change hands the
  // moment the grace ran out.
  for (const p of round.players) {
    if (p === wearer) continue
    const dx = p.x - wearer.x
    const dy = p.y - wearer.y
    const d = Math.hypot(dx, dy)
    if (d >= ARENA.bump) continue
    if (p !== from) p.dazed = Math.max(p.dazed, ARENA.stagger)
    const away = d === 0 ? wearer.facing + Math.PI : Math.atan2(dy, dx)
    p.x = wearer.x + Math.cos(away) * ARENA.bump
    p.y = wearer.y + Math.sin(away) * ARENA.bump
  }
}

/** Bodies are solid: anybody overlapping is pushed apart, half each. */
function separate(round: Round): void {
  const minimum = ARENA.body * 2
  const all = round.players
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const apart = Math.hypot(dx, dy)
      if (apart >= minimum) continue
      if (apart === 0) {
        a.x -= minimum / 2
        b.x += minimum / 2
        continue
      }
      const shift = (minimum - apart) / 2
      a.x -= (dx / apart) * shift
      a.y -= (dy / apart) * shift
      b.x += (dx / apart) * shift
      b.y += (dy / apart) * shift
    }
  }
}

/** The arena's edge is a wall: a body stops at it. */
function wall(p: Wearer): void {
  const limit = ARENA.radius - ARENA.body
  const d = Math.hypot(p.x, p.y)
  if (d <= limit) return
  p.x *= limit / d
  p.y *= limit / d
}

export function timeLeft(round: Round): number {
  return Math.max(0, ARENA.duration - round.elapsed)
}

/** A score as a whole number of points, the way the HUD and the results show it. */
export function points(score: number): number {
  return Math.floor(score + 1e-6)
}

/**
 * Everybody, most points first, with their place.
 *
 * Compared to the hundredth - what the wire carries - so a host and a guest
 * rank the same round the same way. Level scores share a place.
 */
export function placings(round: Round): { player: Wearer; index: number; place: number }[] {
  const key = (p: Wearer) => Math.round(p.score * 100)
  const ranked = round.players.map((player, index) => ({ player, index })).sort((a, b) => key(b.player) - key(a.player))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => key(other.player) > key(entry.player)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
