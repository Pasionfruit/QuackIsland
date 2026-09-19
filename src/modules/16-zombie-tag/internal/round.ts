/**
 * The rules of Zombie Tag, as arithmetic.
 *
 * No three.js, no React, no clock of its own. `stepRound` takes a round, what
 * everybody is pressing, and how long since last time, and gives back the
 * round a moment later. Everything interesting about the game - who catches
 * whom, what a push does, when it is over - is decided in here and can be
 * tested by calling a function with numbers.
 *
 * **The round is a roster, not a player plus some others.** Whether a body is
 * driven by a keyboard, by the steering in `ai.ts`, or one day by another
 * browser, is not something these rules know or care about. That is what makes
 * them the same rules for one player against six zombies as for eight people
 * in a lobby.
 */
import { ARENA, climbSpot, settle, type Point } from './arena'

export type Side = 'player' | 'zombie'

export interface Body {
  id: string
  x: number
  y: number
  side: Side
  /** Which way it last moved, in radians. For drawing a face on it. */
  facing: number
  /** Seconds left on the floor. A stunned body takes no instructions. */
  stun: number
  /** Seconds until this body may push again. Players only. */
  cooldown: number
  /**
   * Seconds left of becoming a zombie, or 0 for anybody who is not mid-turn.
   *
   * A turning body cannot catch and cannot move - see `ARENA.turnDelay` for
   * why the beat exists at all, and `ARENA.turnSpin` for the spin after it.
   */
  turning: number
  /**
   * How long this body lasted as a player, in seconds, or `null` while it is
   * still running. What the placings are worked out from.
   */
  caughtAt: number | null
  /** True for the body this browser is driving. */
  mine: boolean
}

export interface Round {
  bodies: Body[]
  /** Seconds since the round began. */
  elapsed: number
  /**
   * Nobody left to catch, and the last catch has finished turning. The round
   * is done.
   */
  over: boolean
  /**
   * Who won: the last player still running, or the last one taken if the
   * zombies got everybody at once.
   *
   * **Decided before the round is over.** The moment one player is left the
   * winner is settled and everything stops but the last catch's turn, which
   * plays out in full - see `finish`. A winner and not over is that moment.
   */
  winner: string | null
  /** How many lots of wall-climbers are in: see `climbIn`. */
  climbed: number
}

/** What a body is being told to do this frame. */
export interface Intent {
  /** Which way to go, as a unit-ish vector. Zero for standing still. */
  x: number
  y: number
  /** True on the frame the push key goes down. */
  push: boolean
}

export const NO_INTENT: Intent = Object.freeze({ x: 0, y: 0, push: false })

/**
 * The zombies that climb in over the walls once a round is under way.
 *
 * The six a round opens with are spread round the edge and outrun by anybody
 * paying attention, so a long round settles into a lap of the room. These are
 * the answer: **a fresh lot comes over the wall every fifteen seconds**, from
 * wherever they please, so the room keeps filling up and the way out of it that
 * worked a moment ago stops working.
 *
 * They are zombies nobody was ever caught by, so - like the six - they are left
 * out of the placings; see `placings`.
 */
export const CLIMB = {
  /** When the first lot comes over. */
  first: 15,
  /** And another lot this often after that. */
  every: 15,
  /** How many come each time. */
  each: 3,
  /** How many lots there are, at most. */
  waves: 3,
  /** How long one takes to come down off the wall, seconds. It chases all the way down. */
  drop: 0.7,
} as const

/** What the `index`th climber of wave `wave` is called. The same on every screen. */
export function climberId(wave: number, index: number): string {
  return `climber ${wave + 1}-${index + 1}`
}

/**
 * How far up the wall a climber still is at `elapsed`: 1 as it comes over, 0
 * once it is down, and 0 for everybody who did not climb in.
 *
 * Worked out from its name, so a guest that first hears of a climber halfway
 * down draws it halfway down rather than starting its drop again.
 */
export function climbing(id: string, elapsed: number): number {
  const wave = /^climber (\d+)-/.exec(id)
  if (!wave) return 0
  const since = elapsed - climbAt(Number(wave[1]) - 1)
  if (since < 0) return 0
  return Math.max(0, 1 - since / CLIMB.drop)
}

/** When wave `wave` comes over, in seconds since the round began. */
export function climbAt(wave: number): number {
  return CLIMB.first + wave * CLIMB.every
}

/**
 * Any wave whose moment has come, over the wall and into the round.
 *
 * Worked out from the clock rather than counted off, so a host and a guest
 * stepping the same round put the same zombies in the same places - and a
 * snapshot that arrives late finds them already there rather than adding them
 * twice.
 */
export function climbIn(round: Round): void {
  const due = Math.min(CLIMB.waves, Math.floor((round.elapsed - CLIMB.first) / CLIMB.every) + 1)
  for (let wave = round.climbed; wave < due; wave++) {
    for (let index = 0; index < CLIMB.each; index++) {
      const id = climberId(wave, index)
      if (round.bodies.some((b) => b.id === id)) continue
      round.bodies.push(createBody({ id, at: climbSpot(wave, index, CLIMB.each), side: 'zombie' }))
    }
  }
  round.climbed = Math.max(round.climbed, due)
}

export interface Spawn {
  id: string
  at: Point
  side: Side
  mine?: boolean
}

export function createBody({ id, at, side, mine = false }: Spawn): Body {
  return {
    id,
    x: at.x,
    y: at.y,
    side,
    // Players look inwards to start; the middle is where they all are.
    facing: Math.atan2(-at.y, -at.x),
    stun: 0,
    cooldown: 0,
    turning: 0,
    caughtAt: null,
    mine,
  }
}

export function createRound(spawns: readonly Spawn[]): Round {
  return { bodies: spawns.map(createBody), elapsed: 0, over: false, winner: null, climbed: 0 }
}

/** Everybody still running. The people the zombies are after. */
export function survivors(round: Round): Body[] {
  return round.bodies.filter((b) => b.side === 'player')
}

export function zombies(round: Round): Body[] {
  return round.bodies.filter((b) => b.side === 'zombie')
}

/** How fast this body moves, before anything stops it. */
export function speedOf(body: Body): number {
  return body.side === 'player' ? ARENA.playerSpeed : ARENA.zombieSpeed
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Turns a body into a zombie.
 *
 * Its cooldown goes with it - a zombie has nothing to push - and the moment it
 * was taken is written down, because that is its score. Surviving longer is
 * the only thing anybody is being measured on.
 */
function turn(body: Body, at: number): void {
  body.side = 'zombie'
  body.caughtAt = at
  body.cooldown = 0
  body.stun = 0
  body.turning = ARENA.turnTime
}

/** Counts a timer down by a step, snapping the sliver sixtieths leave behind. */
function countDown(value: number, step: number): number {
  if (value <= 0) return 0
  const left = Math.max(0, value - step)
  return left < 1e-6 ? 0 : left
}

/**
 * One step of the round.
 *
 * Mutates and returns the same round, the way the player controller next door
 * does: this runs every frame for up to fourteen bodies and a fresh object
 * graph per frame is garbage for nothing.
 *
 * `dt` is clamped, because a tab left in the background comes back with a huge
 * delta, and a zombie that moves four metres in one step steps straight over
 * somebody instead of catching them.
 */
export function stepRound(round: Round, intents: Map<string, Intent>, dt: number): Round {
  if (round.over) return round
  const step = Math.min(Math.max(dt, 0), 0.05)

  // The winner is settled and the last catch is still turning. Everybody
  // holds still and the clock holds with them - the winner's time is the
  // moment they were left alone - while the turn plays out, and then it is
  // over.
  if (round.winner !== null) {
    for (const body of round.bodies) body.turning = countDown(body.turning, step)
    finish(round)
    return round
  }

  round.elapsed += step
  // Whoever is due over the wall, before anybody moves: a climber chases from
  // the frame it lands.
  climbIn(round)

  for (const body of round.bodies) {
    // Snapped rather than clamped: counting a second down in sixtieths leaves
    // a sliver on the clock, and a sliver is still "stunned".
    body.stun = countDown(body.stun, step)
    body.cooldown = countDown(body.cooldown, step)
    body.turning = countDown(body.turning, step)
  }

  // Pushes first, so a push and the shove that follows it land on the same
  // frame rather than a frame apart.
  for (const body of round.bodies) {
    const intent = intents.get(body.id) ?? NO_INTENT
    if (!intent.push) continue
    shove(round, body)
  }

  for (const body of round.bodies) {
    const intent = intents.get(body.id) ?? NO_INTENT
    // Stunned bodies are still solid and still catchable. They just cannot go
    // anywhere, which is the whole point of stunning one. A body mid-turn is
    // the same: still in the way, going nowhere.
    if (body.stun > 0 || body.turning > 0) continue

    const length = Math.hypot(intent.x, intent.y)
    if (length === 0) continue
    // Normalised, or a diagonal is forty percent faster than a straight line.
    const pace = speedOf(body) * step
    const moved = { x: body.x + (intent.x / length) * pace, y: body.y + (intent.y / length) * pace }
    const where = settle(moved, ARENA.radius)
    body.x = where.x
    body.y = where.y
    body.facing = Math.atan2(intent.y, intent.x)
  }

  separate(round)
  catchPlayers(round)
  finish(round)
  return round
}

/**
 * A push: everybody else within reach goes down.
 *
 * Only a player may push, only at other players, and **the cooldown is spent
 * whether or not it connects**. A push that costs nothing when it misses is a
 * button you hold down; a push that costs three seconds is a decision.
 *
 * Zombies are not pushable. Being able to stun the thing chasing you would
 * make the chase a stalemate, and the push is there to disrupt the other
 * runners rather than to fight back.
 */
export function shove(round: Round, pusher: Body): boolean {
  if (pusher.side !== 'player' || pusher.cooldown > 0 || pusher.stun > 0) return false
  pusher.cooldown = ARENA.pushCooldown

  let landed = false
  for (const target of round.bodies) {
    if (target === pusher || target.side !== 'player') continue
    if (distance(pusher, target) > ARENA.pushRange) continue
    target.stun = ARENA.pushStun
    landed = true
  }
  return landed
}

/**
 * Keeps bodies out of each other.
 *
 * Collision between bodies is on, which matters more here than it looks: a
 * crowd of zombies that can stand inside one another is one zombie wearing six
 * hats, and running into a knot of them should be running into a wall.
 *
 * Both bodies give way equally, once per frame. Not a solver - two passes
 * would look better in a pile-up and cost twice as much for a game where a
 * pile-up means you have already been caught.
 */
function separate(round: Round): void {
  const bodies = round.bodies
  const minimum = ARENA.radius * 2
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]
      const b = bodies[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const apart = Math.hypot(dx, dy)
      if (apart >= minimum) continue
      if (apart === 0) {
        // Exactly on top of each other, which has no direction to push along.
        // Nudge along x rather than divide by zero.
        a.x -= minimum / 2
        b.x += minimum / 2
        continue
      }
      const shift = (minimum - apart) / 2
      const nx = dx / apart
      const ny = dy / apart
      a.x -= nx * shift
      a.y -= ny * shift
      b.x += nx * shift
      b.y += ny * shift
    }
  }
  for (const body of bodies) {
    const where = settle(body, ARENA.radius)
    body.x = where.x
    body.y = where.y
  }
}

/**
 * Anybody a zombie has reached joins them.
 *
 * Gathered before anything is turned, so being caught on the same frame as
 * somebody else is the same as being caught a frame apart - and so a player
 * who has just become a zombie cannot catch anybody else until the next step.
 * Everybody taken on one frame lasted exactly as long as each other.
 */
function catchPlayers(round: Round): void {
  // Anybody still mid-turn is not hunting yet. This is the delay doing its
  // job: without it, one catch in a crowd cascades through everybody touching
  // the person who was caught, on the frame it happens.
  const hunters = zombies(round).filter((z) => z.turning === 0)
  if (hunters.length === 0) return
  const taken: Body[] = []
  for (const player of survivors(round)) {
    if (hunters.some((z) => distance(z, player) <= ARENA.catchRange)) taken.push(player)
  }
  for (const body of taken) turn(body, round.elapsed)
}

/**
 * Whether there is anybody left to chase.
 *
 * Over at **one** player rather than none: a last survivor being chased by
 * thirteen zombies with nobody left to outlast is not a game, it is a lap of
 * honour. They have already won.
 *
 * **Won is not yet over.** The catch that left one player standing is still
 * turning, and the end of the round is that turn, so the winner is crowned
 * straight away and `over` waits until nobody is turning. `stepRound` freezes
 * everything else in the meantime, so the winner cannot be caught in the gap.
 *
 * If the last two are taken on the same frame there is no survivor to crown,
 * so the winner is whoever lasted longest - which, since they were caught
 * together, is a tie broken by the order they are stood in. That is a real
 * edge and it is better than no winner at all.
 */
function finish(round: Round): void {
  if (round.winner === null) {
    const left = survivors(round)
    if (left.length > 1) return
    round.winner = left.length === 1 ? left[0].id : lastTaken(round)
  }
  if (round.bodies.some((b) => b.turning > 0)) return
  round.over = true
}

/** Whoever lasted longest among the caught. Only asked when nobody is still running. */
function lastTaken(round: Round): string | null {
  let best: Body | null = null
  for (const body of round.bodies) {
    if (body.caughtAt === null) continue
    if (!best || body.caughtAt > (best.caughtAt ?? -1)) best = body
  }
  return best?.id ?? null
}

/**
 * Everybody who was ever a player, in the order they finished: the winner
 * first, then whoever lasted longest.
 *
 * Survival time is the score, which is what "survive as long as possible"
 * means when the round is over and you did not win it.
 *
 * **The six the round started with are left out.** They were never running, so
 * they never survived anything - and since an uncaught body sorts as having
 * lasted forever, leaving them in would put the original zombies at the top of
 * the scoreboard. A body that is a zombie and was never caught is one of them;
 * a body that was turned carries the moment it happened.
 */
export function placings(round: Round): Body[] {
  return round.bodies
    .filter((b) => !(b.side === 'zombie' && b.caughtAt === null))
    .sort((a, b) => (b.caughtAt ?? Infinity) - (a.caughtAt ?? Infinity))
}

/** How long a body lasted, for the scoreboard. The round's length if it never fell. */
export function survivedFor(body: Body, round: Round): number {
  return body.caughtAt ?? round.elapsed
}
