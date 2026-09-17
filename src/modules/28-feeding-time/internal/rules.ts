/**
 * The rules of Feeding Time, as arithmetic.
 *
 * Ducks swim about a pond; everybody stands on the near bank with a pocket of
 * crackers. Hold the button in the bottom third of the screen and flick up into
 * the top third to throw one: the flick's lean is where it goes, and the flick's
 * speed is how far. A cracker that lands near a duck feeds it - a point - and
 * the duck is busy eating for a moment. Most ducks fed at a minute wins.
 *
 * Everything here is pure. Where every duck is at every moment is a function of
 * the seed, so every browser draws the same ducks without being told; which
 * crackers fed which ducks is the host's to say.
 */
import { createRng, hashSeed } from '../../00-core'

export const POND = {
  /** The pond: an ellipse, this far across and front to back from its middle... */
  radiusX: 12,
  radiusZ: 7.5,
  /** ...with its middle this far out from the bank. */
  centreZ: -9,
  /** The bank's edge, and where players stand behind it. */
  bankZ: -1,
  standZ: 1.2,
  /** Between players' spots along the bank. */
  spot: 2.6,

  /** How many ducks, least, and one more for every player past four. */
  ducks: 7,
  /** How fast a duck swims round its loop, least and most. */
  duckPace: [0.18, 0.34] as readonly [number, number],

  /** How close a cracker has to land to a duck to feed it. */
  feed: 1.25,
  /** How long a fed duck is busy eating. */
  eat: 1.6,
  /** How long a cracker flies: this, plus this much for every unit it goes. */
  flightBase: 0.3,
  flightPerUnit: 0.035,
  /** How long a cracker that fed nobody floats before it is gone. */
  float: 1.5,

  /** Seconds in a round. */
  duration: 60,
  /** Least time between one player's throws. */
  reload: 0.25,
  /**
   * How early the host takes a guest's throw. A guest's clock is eased towards
   * the host's, not locked to it; a throw its own screen allowed is not dropped
   * for being a few frames early by the host's.
   */
  reloadGrace: 0.08,
  /** How far a throw can go, least and most. */
  distance: [3, 20] as readonly [number, number],
  /** How far a throw can lean off straight ahead, radians. */
  lean: 1,
} as const

export const FLICK = {
  /** A flick starts in the bottom third of the view and throws on reaching the top third. */
  startBelow: 2 / 3,
  throwAbove: 1 / 3,
  /** Slower than this from press to the top third, and it is not a throw. */
  slowest: 0.7,
  /** A flick of this speed - view heights a second - throws the least distance... */
  slowSpeed: 0.5,
  /** ...and this speed or faster, the most. */
  fastSpeed: 3.2,
} as const

export interface Point {
  x: number
  z: number
}

export interface Throw {
  /** Radians off straight ahead - negative left, positive right. */
  angle: number
  distance: number
}

/**
 * A flick turned into a throw, or null if it was not one. `from` and `to` are
 * on the view, 0 to 1 across and down; `seconds` from press to reaching the top
 * third; `aspect` the view's width over its height, so a sideways lean is
 * measured the same way as the upward drag.
 */
export function flickToThrow(from: { x: number; y: number }, to: { x: number; y: number }, seconds: number, aspect: number): Throw | null {
  if (from.y < FLICK.startBelow || to.y > FLICK.throwAbove || seconds <= 0 || seconds > FLICK.slowest) return null
  const up = from.y - to.y
  const across = (to.x - from.x) * aspect
  const angle = Math.max(-POND.lean, Math.min(POND.lean, Math.atan2(across, up)))
  const speed = Math.hypot(up, across) / seconds
  const t = Math.min(1, Math.max(0, (speed - FLICK.slowSpeed) / (FLICK.fastSpeed - FLICK.slowSpeed)))
  return { angle, distance: POND.distance[0] + t * (POND.distance[1] - POND.distance[0]) }
}

/** Where player `index` of `count` stands on the bank. */
export function spotOf(index: number, count: number): Point {
  return { x: (index - (Math.max(1, count) - 1) / 2) * POND.spot, z: POND.standZ }
}

/** Where a throw from a spot lands. */
export function landing(from: Point, thrown: Throw): Point {
  return { x: from.x + Math.sin(thrown.angle) * thrown.distance, z: from.z - Math.cos(thrown.angle) * thrown.distance }
}

/** How long a throw of this distance is in the air. */
export function flightTime(distance: number): number {
  return POND.flightBase + distance * POND.flightPerUnit
}

/** Whether a point is on the water. */
export function onPond(p: Point): boolean {
  return ((p.x / POND.radiusX) ** 2 + ((p.z - POND.centreZ) / POND.radiusZ) ** 2) <= 1
}

export interface Duck {
  /** Its loop: a wobbly ellipse inside the pond. */
  rx: number
  rz: number
  cx: number
  cz: number
  pace: number
  phase: number
  wobble: number
}

/** How many ducks for this many players. */
export function duckCount(players: number): number {
  return POND.ducks + Math.max(0, players - 4)
}

/** Every duck's loop, from the seed. */
export function layDucks(seed: number, count: number): Duck[] {
  const random = createRng(hashSeed(seed, `feeding-time:ducks:${count}`))
  return Array.from({ length: count }, () => {
    const rx = POND.radiusX * (0.25 + random() * 0.5)
    const rz = POND.radiusZ * (0.25 + random() * 0.45)
    return {
      rx,
      rz,
      cx: (random() * 2 - 1) * (POND.radiusX * 0.8 - rx) * 0.6,
      cz: POND.centreZ + (random() * 2 - 1) * (POND.radiusZ * 0.8 - rz) * 0.6,
      pace: (POND.duckPace[0] + random() * (POND.duckPace[1] - POND.duckPace[0])) * (random() < 0.5 ? -1 : 1),
      phase: random() * Math.PI * 2,
      wobble: random() * Math.PI * 2,
    }
  })
}

const flocks = new Map<string, Duck[]>()
/** The same ducks, laid once. */
export function ducksFor(seed: number, count: number): Duck[] {
  const key = `${seed}:${count}`
  let ducks = flocks.get(key)
  if (!ducks) {
    ducks = layDucks(seed, count)
    if (flocks.size > 16) flocks.clear()
    flocks.set(key, ducks)
  }
  return ducks
}

/** Where a duck is at a moment, and which way it is heading. */
export function duckAt(duck: Duck, time: number): Point & { heading: number } {
  const a = duck.phase + duck.pace * time
  const w = 1 + Math.sin(a * 3 + duck.wobble) * 0.12
  const x = duck.cx + Math.cos(a) * duck.rx * w
  const z = duck.cz + Math.sin(a) * duck.rz * w
  const dx = -Math.sin(a) * duck.rx * Math.sign(duck.pace)
  const dz = Math.cos(a) * duck.rz * Math.sign(duck.pace)
  return { x, z, heading: Math.atan2(dz, dx) }
}

export interface Feeder {
  id: string
  mine: boolean
  bot: boolean
  score: number
  throws: number
  /** The last throw taken from this feeder, so a throw said twice counts once. */
  seq: number
  thrownAt: number
}

export interface Cracker {
  id: number
  player: number
  from: Point
  to: Point
  at: number
  lands: number
  /** Which duck it fed, once it has landed: a duck's index, or -1 for none. Null in the air. */
  fed: number | null
}

export interface Game {
  /** The ducks. Not a secret: every browser draws them. */
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Feeder[]
  /** Crackers in the air or still floating. */
  crackers: Cracker[]
  /** Per duck, until when it is busy eating. */
  eating: number[]
  nextCracker: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => ({ id: e.id, mine: e.mine ?? false, bot: e.bot ?? false, score: 0, throws: 0, seq: 0, thrownAt: -Infinity })),
    crackers: [],
    eating: new Array<number>(duckCount(entrants.length)).fill(-Infinity),
    nextCracker: 1,
  }
}

export function timeLeft(game: Game): number {
  return Math.max(0, POND.duration - game.elapsed)
}

/** Whether a player can throw again yet - allowing `grace` seconds early. */
export function canThrow(game: Game, player: number, grace = 0): boolean {
  const feeder = game.players[player]
  return !!feeder && !game.over && game.elapsed - feeder.thrownAt >= POND.reload - grace - 1e-9
}

/**
 * A player throws. Straight into the air, from their spot, landing a flight
 * later. Not during the reload, not after the round, not for a `seq` already
 * dealt with. Returns the cracker, or null.
 */
export function throwCracker(game: Game, player: number, thrown: Throw, seq?: number): Cracker | null {
  const feeder = game.players[player]
  if (!feeder || game.over) return null
  if (seq !== undefined) {
    if (seq <= feeder.seq) return null
    feeder.seq = seq
  }
  // A throw with a seq came from a guest: allow its clock being a little ahead.
  if (!canThrow(game, player, seq === undefined ? 0 : POND.reloadGrace)) return null
  const angle = Math.max(-POND.lean, Math.min(POND.lean, thrown.angle))
  const distance = Math.max(POND.distance[0], Math.min(POND.distance[1], thrown.distance))
  const from = spotOf(player, game.players.length)
  const cracker: Cracker = {
    id: game.nextCracker++,
    player,
    from,
    to: landing(from, { angle, distance }),
    at: game.elapsed,
    lands: game.elapsed + flightTime(distance),
    fed: null,
  }
  feeder.thrownAt = game.elapsed
  feeder.throws += 1
  game.crackers.push(cracker)
  return cracker
}

/**
 * A cracker lands: the nearest duck to it, within reach, not already eating, is
 * fed - a point to the thrower - and busy for a moment.
 */
function land(game: Game, cracker: Cracker): void {
  const ducks = ducksFor(game.seed, game.eating.length)
  let best: { duck: number; distance: number } | null = null
  if (onPond(cracker.to)) {
    ducks.forEach((duck, index) => {
      if (game.eating[index] > cracker.lands) return
      const at = duckAt(duck, cracker.lands)
      const d = Math.hypot(at.x - cracker.to.x, at.z - cracker.to.z)
      if (d <= POND.feed && (!best || d < best.distance)) best = { duck: index, distance: d }
    })
  }
  const fed = best as { duck: number } | null
  cracker.fed = fed ? fed.duck : -1
  if (fed) {
    game.eating[fed.duck] = cracker.lands + POND.eat
    game.players[cracker.player].score += 1
  }
}

/** One step: the clock, crackers landing in the order they land, old ones gone, and the end. */
export function stepGame(game: Game, dt: number): Game {
  if (game.over) return game
  game.elapsed = Math.min(POND.duration, game.elapsed + Math.min(Math.max(dt, 0), 0.25))
  const due = game.crackers.filter((c) => c.fed === null && c.lands <= game.elapsed).sort((a, b) => a.lands - b.lands)
  for (const cracker of due) land(game, cracker)
  game.crackers = game.crackers.filter((c) => c.fed === null || game.elapsed - c.lands < POND.float)
  if (game.elapsed >= POND.duration) {
    // Anything still in the air when the whistle goes lands on time, and counts.
    for (const cracker of game.crackers.filter((c) => c.fed === null).sort((a, b) => a.lands - b.lands)) land(game, cracker)
    game.over = true
  }
  return game
}

/** Everybody, best first, with their place. Level scores share a place. */
export function placings(game: Game): { feeder: Feeder; index: number; place: number }[] {
  const ranked = game.players.map((feeder, index) => ({ feeder, index })).sort((a, b) => b.feeder.score - a.feeder.score)
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => other.feeder.score > entry.feeder.score).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#9c4bb0', '#4fb35a', '#f08a3c', '#35bdbd', '#ef7fb4', '#2e2e3c'] as const
