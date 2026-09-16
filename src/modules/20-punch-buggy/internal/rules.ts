/**
 * The rules of Punch Buggy, as arithmetic.
 *
 * A round platform floating over the sea, and everybody on it with a fist that
 * comes off. Click and it shoots out the way you are facing; click again and it
 * comes back. A fist that reaches somebody on its way out knocks them straight
 * out of the round. An arm that is already out does not - but it is solid, and
 * walking into people with it shoves them, and a shove off the edge is out too.
 * Thirty seconds; the last one standing wins.
 *
 * No three.js, no React, no clock of its own. `stepRound` takes a round, what
 * everybody is pressing and how long since last time, and gives back the round
 * a moment later. Whose intent came from a keyboard, another browser or the
 * stand-ins is not something it knows.
 *
 * World axes as the other minigames: the rules work in a flat x/y, and the
 * scene stands it up with y as the world's z.
 */
import { PLAYER } from '../../02-player'

export const RING = {
  /** How long a round lasts, in seconds. */
  duration: 30,
  /** The platform's radius. Past its edge is the sea. */
  radius: 11,
  /**
   * How far from the middle everybody starts, as a share of the radius. Well
   * out, so neighbours start further apart than a punch reaches.
   */
  spawnRing: 0.78,

  /** A body's radius: the island pill's own, so a punch lands where it looks like it does. */
  body: PLAYER.radius,
  /** Walking speed, units a second. */
  speed: 7,
  /** How much of that you keep with your arm out. Punching is a commitment. */
  armedPace: 0.6,
  /**
   * How much of it a stand-in gets. They never mistime a key, so they pay for
   * it in speed - at full pace they walked up and flattened a person before
   * that person had found which pill was theirs.
   */
  botPace: 0.8,

  /** How far a fist reaches, from the edge of your body. */
  reach: 6,
  /** How fast a fist goes out, and comes back, units a second. */
  outSpeed: 26,
  backSpeed: 30,
  /** How big a fist is. */
  fist: 0.45,
  /** How thick an arm is, for shoving. */
  arm: 0.2,
  /**
   * How long a shove is remembered, in seconds, for saying who knocked somebody
   * off. Falling off on your own a second after brushing past somebody is not
   * their doing.
   */
  shoveMemory: 1,
} as const

/**
 * Where a punch is.
 *
 * `in`: at your side, ready. `out`: flying out - the only time it knocks
 * anybody out. `held`: as far as it goes, or stopped on somebody, waiting to be
 * pulled back. `back`: on its way home. A click sends `in` out, and pulls `out`
 * or `held` back; nothing else.
 */
export type Punch = 'in' | 'out' | 'held' | 'back'
export const PUNCHES: readonly Punch[] = ['in', 'out', 'held', 'back']

/** How somebody went out: still in, punched, or off the edge. */
export type Out = 'in' | 'punched' | 'fell'

export interface Fighter {
  id: string
  x: number
  y: number
  /** Which way they face, radians. The way the fist goes. Locked while the arm is out. */
  facing: number
  alive: boolean
  /** When they went out, in round seconds, or `null`. */
  outAt: number | null
  how: Out
  /** Who punched them, or last shoved them before they fell. */
  by: string | null
  punch: Punch
  /** How far the fist is out, 0 to `RING.reach`. */
  reach: number
  /** When the punch last changed, in round seconds. The stand-ins time things by it. */
  punchSince: number
  /** How many clicks have been dealt with. Clicks arrive as a running count; see `Intent`. */
  clicks: number
  /** Who last shoved them with an arm, and when. */
  shovedBy: string | null
  shovedAt: number
  mine: boolean
  bot: boolean
}

export interface Round {
  /** For the stand-ins' timing. */
  seed: number
  /** Tells one round from the next on the wire. */
  id: number
  fighters: Fighter[]
  elapsed: number
  over: boolean
}

/**
 * What somebody wants this frame.
 *
 * `clicks` is **a running count** of every click they have made, not "clicked
 * this frame". Said again and again it means the same thing, so a message the
 * network drops or repeats never loses or doubles a punch: whoever runs the
 * round deals with the clicks beyond the ones already dealt with.
 */
export interface Intent {
  x: number
  y: number
  clicks: number
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

/** Where everybody starts: evenly round a ring, facing the middle. */
export function spawns(count: number): (Point & { facing: number })[] {
  const ring = RING.radius * RING.spawnRing
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
    fighters: entrants.map((e, i) => ({
      id: e.id,
      x: starts[i].x,
      y: starts[i].y,
      facing: starts[i].facing,
      alive: true,
      outAt: null,
      how: 'in',
      by: null,
      punch: 'in',
      reach: 0,
      punchSince: 0,
      clicks: 0,
      shovedBy: null,
      shovedAt: -Infinity,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
    })),
  }
}

export function standing(round: Round): Fighter[] {
  return round.fighters.filter((f) => f.alive)
}

/** Where a fighter's fist is. At their side when it is in. */
export function fistAt(f: Fighter): Point {
  const along = RING.body + f.reach
  return { x: f.x + Math.cos(f.facing) * along, y: f.y + Math.sin(f.facing) * along }
}

/** One click: out if it is in, back if it is out. */
export function click(round: Round, f: Fighter): void {
  if (!f.alive || round.over) return
  if (f.punch === 'in') setPunch(round, f, 'out')
  else if (f.punch === 'out' || f.punch === 'held') setPunch(round, f, 'back')
}

function setPunch(round: Round, f: Fighter, punch: Punch): void {
  f.punch = punch
  f.punchSince = round.elapsed
}

const toSegment = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
  const q = { x: a.x + dx * t, y: a.y + dy * t }
  return { point: q, distance: Math.hypot(p.x - q.x, p.y - q.y) }
}

function knockOut(round: Round, f: Fighter, how: Out, by: string | null): void {
  f.alive = false
  f.outAt = round.elapsed
  f.how = how
  f.by = by
  f.punch = 'in'
  f.reach = 0
}

/**
 * One step of the round.
 *
 * Mutates and returns the same round. `dt` is clamped, so a tab that comes back
 * from the background does not carry a fist through somebody without touching.
 *
 * In order: clicks; walking; fists moving, and a fist on its way out that
 * meets somebody knocks them out and stops there; arms shoving whoever they
 * touch; bodies pushing each other apart; anybody past the edge goes into the
 * sea; and the round ends at one left standing, or at thirty seconds.
 */
export function stepRound(round: Round, intents: ReadonlyMap<string, Intent>, dt: number): Round {
  if (round.over) return round
  const step = Math.min(Math.max(dt, 0), 0.05)
  round.elapsed += step

  for (const f of round.fighters) {
    const intent = intents.get(f.id)
    if (!intent || !f.alive) continue
    // Every click beyond the ones already dealt with, in turn.
    while (f.clicks < intent.clicks) {
      f.clicks += 1
      click(round, f)
    }
  }

  for (const f of round.fighters) {
    if (!f.alive) continue
    const intent = intents.get(f.id)
    const length = intent ? Math.hypot(intent.x, intent.y) : 0
    if (intent && length > 0) {
      const armed = f.punch !== 'in'
      const pace = RING.speed * (armed ? RING.armedPace : 1) * (f.bot ? RING.botPace : 1) * step
      f.x += (intent.x / length) * pace
      f.y += (intent.y / length) * pace
      // The arm goes where you were facing when you threw it.
      if (!armed) f.facing = Math.atan2(intent.y, intent.x)
    }
  }

  for (const f of round.fighters) {
    if (!f.alive) continue
    if (f.punch === 'out') {
      const from = fistAt(f)
      f.reach = Math.min(RING.reach, f.reach + RING.outSpeed * step)
      const to = fistAt(f)
      // Swept, so a fist fast enough to pass through somebody in one step still
      // meets them.
      for (const other of round.fighters) {
        if (other === f || !other.alive) continue
        if (toSegment(other, from, to).distance > RING.fist + RING.body) continue
        knockOut(round, other, 'punched', f.id)
        setPunch(round, f, 'held')
      }
      if (f.punch === 'out' && f.reach >= RING.reach) setPunch(round, f, 'held')
    } else if (f.punch === 'back') {
      f.reach = Math.max(0, f.reach - RING.backSpeed * step)
      if (f.reach === 0) setPunch(round, f, 'in')
    }
  }

  // Arms that are out are solid: whoever they touch is shoved clear of them.
  for (const f of round.fighters) {
    if (!f.alive || f.reach === 0) continue
    const shoulder = { x: f.x, y: f.y }
    const fist = fistAt(f)
    for (const other of round.fighters) {
      if (other === f || !other.alive) continue
      const { point, distance } = toSegment(other, shoulder, fist)
      const clear = RING.arm + RING.body
      if (distance >= clear) continue
      const nx = distance === 0 ? -Math.sin(f.facing) : (other.x - point.x) / distance
      const ny = distance === 0 ? Math.cos(f.facing) : (other.y - point.y) / distance
      other.x += nx * (clear - distance)
      other.y += ny * (clear - distance)
      other.shovedBy = f.id
      other.shovedAt = round.elapsed
    }
  }

  separate(round)

  for (const f of round.fighters) {
    if (!f.alive || Math.hypot(f.x, f.y) <= RING.radius) continue
    const recent = f.shovedBy !== null && round.elapsed - f.shovedAt <= RING.shoveMemory
    knockOut(round, f, 'fell', recent ? f.shovedBy : null)
  }

  const left = standing(round).length
  if ((round.fighters.length > 1 && left <= 1) || left === 0 || round.elapsed >= RING.duration) {
    round.over = true
    round.elapsed = Math.min(round.elapsed, RING.duration)
  }
  return round
}

/** Bodies are solid: anybody overlapping is pushed apart, half each. */
function separate(round: Round): void {
  const alive = standing(round)
  const minimum = RING.body * 2
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i]
      const b = alive[j]
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

export function timeLeft(round: Round): number {
  return Math.max(0, RING.duration - round.elapsed)
}

/**
 * Everybody, best first, with their place.
 *
 * Whoever is still standing at the end shares first - one of them if somebody
 * won outright, more if the clock ran out. Everybody else is ranked by how long
 * they lasted, and people who went out together share a place.
 */
export function placings(round: Round): { fighter: Fighter; index: number; place: number }[] {
  const score = (f: Fighter) => (f.alive ? Infinity : (f.outAt ?? 0))
  const ranked = round.fighters.map((fighter, index) => ({ fighter, index })).sort((a, b) => score(b.fighter) - score(a.fighter))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => score(other.fighter) > score(entry.fighter)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
