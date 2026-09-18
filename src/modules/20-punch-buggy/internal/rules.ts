/**
 * The rules of Punch Buggy, as arithmetic.
 *
 * A round platform floating over the sea, and everybody on it with a fist that
 * comes off. Click and it shoots out the way you are aiming; click again and it
 * comes back. A fist that reaches somebody's side or back on its way out knocks
 * them straight out of the round, even if their own arm is out; one that meets
 * their front - where their own fist is - or their arm short of their body is
 * blocked and only shoves them. An arm that is already out knocks
 * nobody out either - but it is solid, and a shove off the edge is out too.
 * After ten seconds the platform starts to shrink. Thirty seconds; the last one
 * standing wins.
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
  /**
   * Seconds between the knockout that decides the round and the round being
   * over, so everybody sees the last one out fly before Finish.
   */
  outro: 1.2,
  /** The platform's radius at the start. Past its edge is the sea. */
  radius: 11,
  /** When the platform starts to shrink, in round seconds. */
  shrinkFrom: 10,
  /** How small it has got by the end of the round. */
  radiusAtEnd: 4.5,
  /**
   * How far from the middle everybody starts, as a share of the radius. Well
   * out, so neighbours start further apart than a punch reaches.
   */
  spawnRing: 0.78,

  /** A body's radius: the island pill's own, so a punch lands where it looks like it does. */
  body: PLAYER.radius,
  /** Walking speed, units a second. */
  speed: 7,
  /** How much of that you keep while your arm is on its way back. */
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
   * Seconds you stand rooted after a throw before it can be pulled back. A
   * click inside it waits, and pulls back the moment it can. Until the arm is
   * on its way back you cannot walk at all.
   */
  commit: 0.5,
  /**
   * Half the angle, either side of where somebody faces, that their fist
   * guards. A punch that comes at them inside it is blocked; from the side or
   * behind, it is a knockout.
   */
  guard: Math.PI / 4,
  /** How far a blocked punch shoves whoever blocked it. */
  blockPush: 1.4,
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
 * or `held` back once `RING.commit` has passed; nothing else.
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
  /** When the punch was last thrown, in round seconds. It cannot come back until `RING.commit` after. */
  thrownAt: number
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
  /**
   * When it came down to one standing, or `null`. The round runs on for
   * `RING.outro` after - nobody moving, only the last one out still flying -
   * and then it is over.
   */
  decidedAt: number | null
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
  /**
   * Which way they are aiming, radians - towards the pointer. They face it
   * whenever their arm is home. Left out, they face the way they walk.
   */
  aim?: number
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
    decidedAt: null,
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
      thrownAt: -Infinity,
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

/**
 * How big the platform is at a moment of the round: all of it for the first
 * `RING.shrinkFrom` seconds, then steadily smaller, to `RING.radiusAtEnd` at
 * the end.
 */
export function radiusAt(elapsed: number): number {
  const k = Math.min(1, Math.max(0, (elapsed - RING.shrinkFrom) / (RING.duration - RING.shrinkFrom)))
  return RING.radius + (RING.radiusAtEnd - RING.radius) * k
}

/** Whether somebody's arm is out too recently to pull back. */
export function rooted(round: Round, f: Fighter): boolean {
  return (f.punch === 'out' || f.punch === 'held') && round.elapsed - f.thrownAt < RING.commit
}

/** Where a fighter's fist is. At their side when it is in. */
export function fistAt(f: Fighter): Point {
  const along = RING.body + f.reach
  return { x: f.x + Math.cos(f.facing) * along, y: f.y + Math.sin(f.facing) * along }
}

/** One click: out if it is in, back if it is out and has been for `RING.commit`. */
export function click(round: Round, f: Fighter): void {
  if (!f.alive || round.over) return
  if (f.punch === 'in') {
    setPunch(round, f, 'out')
    f.thrownAt = round.elapsed
  } else if ((f.punch === 'out' || f.punch === 'held') && !rooted(round, f)) {
    setPunch(round, f, 'back')
  }
}

/**
 * Whether a punch travelling `heading` comes at `f` inside the angle their fist
 * guards - at their front, rather than their side or back.
 */
export function guarded(f: Fighter, heading: number): boolean {
  // It comes from the opposite way to the way it is going.
  const from = heading + Math.PI
  return Math.abs(Math.atan2(Math.sin(from - f.facing), Math.cos(from - f.facing))) < RING.guard
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

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** The closest two segments come to each other; nought if they cross. */
function segmentsApart(a: Point, b: Point, c: Point, d: Point): number {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0
  return Math.min(
    toSegment(a, c, d).distance,
    toSegment(b, c, d).distance,
    toSegment(c, a, b).distance,
    toSegment(d, a, b).distance,
  )
}

function shove(round: Round, f: Fighter, by: Fighter, nx: number, ny: number, distance: number): void {
  f.x += nx * distance
  f.y += ny * distance
  f.shovedBy = by.id
  f.shovedAt = round.elapsed
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
 * In order: clicks; aiming and walking; fists moving - a fist on its way out
 * that meets somebody's side or back knocks them out, and one that meets their
 * arm, their fist or their front is blocked and shoves them, and either way it
 * stops there; arms shoving whoever they touch; bodies pushing each other
 * apart; anybody past the edge - which closes in after ten seconds - goes into
 * the sea. The round ends `RING.outro` after one is left standing, or at thirty
 * seconds.
 */
export function stepRound(round: Round, intents: ReadonlyMap<string, Intent>, dt: number): Round {
  if (round.over) return round
  const step = Math.min(Math.max(dt, 0), 0.05)
  round.elapsed += step

  // Decided: everybody holds still while the last one out flies, then it is over.
  if (round.decidedAt !== null) {
    if (round.elapsed - round.decidedAt >= RING.outro) round.over = true
    return round
  }

  for (const f of round.fighters) {
    const intent = intents.get(f.id)
    if (!intent || !f.alive) continue
    // Every click beyond the ones already dealt with, in turn. A click to pull
    // back too soon waits, and is dealt with the moment it can be.
    while (f.clicks < intent.clicks && !rooted(round, f)) {
      f.clicks += 1
      click(round, f)
    }
  }

  for (const f of round.fighters) {
    const intent = intents.get(f.id)
    if (!intent || !f.alive) continue
    const home = f.punch === 'in'
    // The arm goes where you were aiming when you threw it.
    const aiming = intent.aim !== undefined && Number.isFinite(intent.aim)
    if (home && aiming) f.facing = intent.aim!
    // Out, or held out, you stand where you threw it until it is on its way back.
    if (f.punch === 'out' || f.punch === 'held') continue
    const length = Math.hypot(intent.x, intent.y)
    if (length === 0) continue
    const pace = RING.speed * (home ? 1 : RING.armedPace) * (f.bot ? RING.botPace : 1) * step
    f.x += (intent.x / length) * pace
    f.y += (intent.y / length) * pace
    if (home && !aiming) f.facing = Math.atan2(intent.y, intent.x)
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
        // Their arm and fist, out in the way: a clash. The arm starts at the
        // edge of their body, so a punch that lands on the body is not also
        // counted as meeting the arm at its root.
        const shoulder = { x: other.x + Math.cos(other.facing) * RING.body, y: other.y + Math.sin(other.facing) * RING.body }
        const clash = other.reach > 0.05 && segmentsApart(from, to, shoulder, fistAt(other)) <= RING.fist + RING.arm
        const body = toSegment(other, from, to).distance <= RING.fist + RING.body
        if (!clash && !body) continue
        // A side or back landed is a knockout even with their arm out; only
        // their front, or an arm in the way short of the body, blocks.
        if (body && !guarded(other, f.facing)) {
          knockOut(round, other, 'punched', f.id)
        } else {
          shove(round, other, f, Math.cos(f.facing), Math.sin(f.facing), RING.blockPush)
        }
        setPunch(round, f, 'held')
        break
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
      shove(round, other, f, nx, ny, clear - distance)
    }
  }

  separate(round)

  const edge = radiusAt(round.elapsed)
  for (const f of round.fighters) {
    if (!f.alive || Math.hypot(f.x, f.y) <= edge) continue
    const recent = f.shovedBy !== null && round.elapsed - f.shovedAt <= RING.shoveMemory
    knockOut(round, f, 'fell', recent ? f.shovedBy : null)
  }

  const left = standing(round).length
  if ((round.fighters.length > 1 && left <= 1) || left === 0) {
    round.decidedAt = round.elapsed
  } else if (round.elapsed >= RING.duration) {
    round.over = true
    round.elapsed = RING.duration
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
