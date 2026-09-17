/**
 * The rules of Make The Cut, as arithmetic.
 *
 * Everybody stands on top of a tower with a web of strings running from its rim
 * out and up to tall poles standing round it: three strings for every player, and one
 * eliminating string fewer than there are players. A random player cuts first,
 * and the turn passes round the group. On your turn, walk to a string, aim at it
 * and cut it. A normal string: nothing happens. An eliminating string: you are
 * launched off the tower, and out. Last one on the tower wins.
 *
 * Nobody can tell the strings apart until one is cut. With one eliminating
 * string fewer than players, the last of them always leaves exactly one player
 * standing.
 *
 * Everything here is pure. The web's layout comes from a seed everybody knows,
 * since everybody draws it; which strings eliminate comes from a second, secret
 * one that is never sent.
 */
import { createRng, hashSeed } from '../../00-core'
import { PLAYER } from '../../02-player'

export const TOWER = {
  /** The tower top's radius. */
  radius: 6.5,
  /** How high the tower top is. */
  height: 9,
  /** A body, the island pill's own radius. */
  body: PLAYER.radius,
  /** How close to the rim a body's middle can go. */
  margin: 0.55,
  /** Walking pace, units a second; stand-ins walk a little slower. */
  speed: 6,
  botPace: 0.8,

  /** Strings for every player, and eliminating strings one fewer than players. */
  perPlayer: 3,
  /** Where strings are tied: this far from the middle, least and most... */
  far: [11.5, 14] as readonly [number, number],
  /**
   * ...and this high, on poles taller than the tower. Strings rise from the rim,
   * so none of them runs down out of sight behind the tower.
   */
  high: [10.8, 13] as readonly [number, number],
  /** How close a body's middle has to be to where a string meets the rim to cut it. */
  reach: 2.6,
  /** The host's allowance on reach, for a guest a round trip behind. */
  reachGrace: 0.6,
  /** How close the aim has to pass to a string to be on it. */
  aim: 0.45,

  /** Seconds choosing who goes first. */
  draw: 2.5,
  /** Seconds a turn lasts. After it, the nearest string is cut for you. */
  turn: 12,
  /** Seconds a cut's result is shown before the next turn. */
  result: 2.2,
} as const

export interface Point3 {
  x: number
  y: number
  z: number
}

/** A string: where it meets the rim, and where it is tied to its pole. */
export interface Strand {
  rim: Point3
  end: Point3
  /** Its angle round the tower, radians. */
  angle: number
}

/** How many strings for this many players. */
export function stringCount(players: number): number {
  return TOWER.perPlayer * players + Math.max(0, players - 1)
}

/** How many eliminating strings for this many players. */
export function deadlyCount(players: number): number {
  return Math.max(0, players - 1)
}

/** The web: strings evenly round the rim, each turned a little, tied off at their own distance and height. */
export function layWeb(seed: number, count: number): Strand[] {
  const random = createRng(hashSeed(seed, `make-the-cut:web:${count}`))
  const gap = (Math.PI * 2) / Math.max(1, count)
  return Array.from({ length: count }, (_, i) => {
    // Turned a little, and twisted a little on the way down - never so much that
    // two strings cross, seen from above.
    const angle = i * gap + (random() - 0.5) * gap * 0.4
    const twist = (random() - 0.5) * gap * 0.4
    const far = TOWER.far[0] + random() * (TOWER.far[1] - TOWER.far[0])
    const high = TOWER.high[0] + random() * (TOWER.high[1] - TOWER.high[0])
    return {
      angle,
      rim: { x: Math.cos(angle) * TOWER.radius, y: TOWER.height, z: Math.sin(angle) * TOWER.radius },
      end: { x: Math.cos(angle + twist) * far, y: high, z: Math.sin(angle + twist) * far },
    }
  })
}

const webs = new Map<string, Strand[]>()
/** The same web, laid once. */
export function webFor(seed: number, count: number): Strand[] {
  const key = `${seed}:${count}`
  let web = webs.get(key)
  if (!web) {
    web = layWeb(seed, count)
    if (webs.size > 16) webs.clear()
    webs.set(key, web)
  }
  return web
}

export type Phase = 'draw' | 'turn' | 'result' | 'over'
export const PHASES: readonly Phase[] = ['draw', 'turn', 'result', 'over']

export interface Cutter {
  id: string
  mine: boolean
  bot: boolean
  /** On the tower top: x across, y front to back (the world's z). */
  x: number
  y: number
  facing: number
  /** Out: the how-manyth, when, and which string did it - or -1 for leaving. */
  out: { order: number; at: number; string: number } | null
  cuts: number
  /** The last cut request taken from this cutter, so one said twice counts once. */
  seq: number
}

export interface Cut {
  player: number
  deadly: boolean
  at: number
}

/** What happened on the last turn. */
export interface Last {
  player: number
  string: number
  deadly: boolean
  /** Cut for them when their time ran out. */
  auto: boolean
}

export interface Game {
  /** The web's layout. Everybody's. */
  seed: number
  /** Which strings eliminate. The host's secret: never sent. */
  luck: number
  id: number
  players: Cutter[]
  /** How many strings: fixed at the start, from how many players there were. */
  count: number
  /** Per string, whether it eliminates. Only the host knows; a guest has it empty. */
  deadly: boolean[]
  /** Per string, who cut it and what it was, or null. */
  cut: (Cut | null)[]
  phase: Phase
  clock: number
  elapsed: number
  /** Whose turn, as a player index. During the draw, who will go first. */
  turn: number
  /** How many turns have been taken, so a cut can say which turn it is for. */
  turns: number
  last: Last | null
  outs: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export interface Intent {
  x: number
  y: number
}

/** Where everybody starts: spread round the middle of the tower top, facing out. */
export function spawns(count: number): { x: number; y: number; facing: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2
    const r = count === 1 ? 0 : TOWER.radius * 0.45
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, facing: a }
  })
}

export function createGame(seed: number, luck: number, entrants: readonly Entrant[], id = 1): Game {
  const random = createRng(hashSeed(luck, 'make-the-cut:luck'))
  const count = stringCount(entrants.length)
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const deadly = new Array<boolean>(count).fill(false)
  for (const i of order.slice(0, deadlyCount(entrants.length))) deadly[i] = true
  const starts = spawns(entrants.length)
  return {
    seed,
    luck,
    id,
    players: entrants.map((e, i) => ({
      id: e.id,
      mine: e.mine ?? false,
      bot: e.bot ?? false,
      ...starts[i],
      out: null,
      cuts: 0,
      seq: 0,
    })),
    count,
    deadly,
    cut: new Array<Cut | null>(count).fill(null),
    phase: entrants.length > 1 ? 'draw' : 'over',
    clock: 0,
    elapsed: 0,
    turn: entrants.length > 0 ? Math.floor(random() * entrants.length) : 0,
    turns: 0,
    last: null,
    outs: 0,
  }
}

export function standing(game: Game): Cutter[] {
  return game.players.filter((p) => !p.out)
}

/** Whose turn it is, or null outside the turns. */
export function whoseTurn(game: Game): number | null {
  return game.phase === 'turn' ? game.turn : null
}

/** How many eliminating strings are still uncut. Everybody can work this out. */
export function deadlyLeft(game: Game): number {
  return deadlyCount(game.players.length) - game.cut.filter((c) => c?.deadly).length
}

/** How far a cutter is from where a string meets the rim. */
export function distanceTo(game: Game, player: number, string: number): number {
  const cutter = game.players[player]
  const strand = webFor(game.seed, game.count)[string]
  if (!cutter || !strand) return Infinity
  return Math.hypot(cutter.x - strand.rim.x, cutter.y - strand.rim.z)
}

/** Whether a cutter can reach a string: uncut, and near enough where it meets the rim. */
export function inReach(game: Game, player: number, string: number, grace = 0): boolean {
  return string >= 0 && string < game.count && game.cut[string] === null && distanceTo(game, player, string) <= TOWER.reach + grace
}

/** The next player round from `after`, still standing. */
function nextFrom(game: Game, after: number): number {
  for (let step = 1; step <= game.players.length; step++) {
    const i = (after + step) % game.players.length
    if (!game.players[i].out) return i
  }
  return after
}

function knockOut(game: Game, player: number, string: number): void {
  const cutter = game.players[player]
  if (!cutter || cutter.out) return
  game.outs += 1
  cutter.out = { order: game.outs, at: game.elapsed, string }
}

/**
 * A cutter cuts a string. Only on their turn, only a string still whole, and -
 * unless it is being cut for them - only one in reach. `turn`, if given, must be
 * the turn it was asked for. Returns whether it counted.
 */
export function cut(game: Game, player: number, string: number, { auto = false, turn, grace = 0 }: { auto?: boolean; turn?: number; grace?: number } = {}): boolean {
  if (whoseTurn(game) !== player) return false
  if (turn !== undefined && turn !== game.turns) return false
  if (!Number.isInteger(string) || string < 0 || string >= game.count || game.cut[string] !== null) return false
  if (!auto && !inReach(game, player, string, grace)) return false
  const deadly = game.deadly[string] === true
  game.cut[string] = { player, deadly, at: game.elapsed }
  game.players[player].cuts += 1
  if (deadly) knockOut(game, player, string)
  game.last = { player, string, deadly, auto }
  game.turns += 1
  game.phase = 'result'
  game.clock = 0
  return true
}

/** The whole string nearest a cutter, for cutting when their time is up. */
export function nearestString(game: Game, player: number): number {
  let best = -1
  let bestDistance = Infinity
  for (let s = 0; s < game.count; s++) {
    if (game.cut[s] !== null) continue
    const d = distanceTo(game, player, s)
    if (d < bestDistance) {
      bestDistance = d
      best = s
    }
  }
  return best
}

/** A cutter who has left the lobby is out. If it was their turn, it passes on. */
export function leave(game: Game, player: number): void {
  const cutter = game.players[player]
  if (!cutter || cutter.out || game.phase === 'over') return
  knockOut(game, player, -1)
  if (standing(game).length <= 1) {
    game.phase = 'over'
    game.clock = 0
  } else if (game.turn === player && game.phase !== 'result') {
    game.turn = nextFrom(game, player)
    game.clock = 0
  }
}

/** Keeps a body on the tower top and out of everybody else. */
function settle(game: Game): void {
  const limit = TOWER.radius - TOWER.margin
  const bodies = game.players.filter((p) => !p.out)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]
        const b = bodies[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy)
        const clear = TOWER.body * 2
        if (d >= clear) continue
        const nx = d === 0 ? 1 : dx / d
        const ny = d === 0 ? 0 : dy / d
        const push = (clear - d) / 2
        a.x -= nx * push
        a.y -= ny * push
        b.x += nx * push
        b.y += ny * push
      }
    }
    for (const body of bodies) {
      const r = Math.hypot(body.x, body.y)
      if (r <= limit) continue
      body.x *= limit / r
      body.y *= limit / r
    }
  }
}

/** Moves one cutter by an intent, for a step. Exported so a guest can move its own body the same way. */
export function walk(cutter: Cutter, intent: Intent, step: number): void {
  const length = Math.hypot(intent.x, intent.y)
  if (length === 0 || cutter.out) return
  const pace = TOWER.speed * (cutter.bot ? TOWER.botPace : 1) * step * Math.min(1, length)
  cutter.x += (intent.x / length) * pace
  cutter.y += (intent.y / length) * pace
  cutter.facing = Math.atan2(intent.y, intent.x)
  const limit = TOWER.radius - TOWER.margin
  const r = Math.hypot(cutter.x, cutter.y)
  if (r > limit) {
    cutter.x *= limit / r
    cutter.y *= limit / r
  }
}

/**
 * One step: everybody walks, and the clock - the draw, a turn running out (the
 * nearest string is cut for you), a result shown, the next turn or the end.
 */
export function stepGame(game: Game, intents: ReadonlyMap<string, Intent>, dt: number): Game {
  const step = Math.min(Math.max(dt, 0), 0.05)
  game.elapsed += step
  for (const cutter of game.players) {
    const intent = intents.get(cutter.id)
    if (intent) walk(cutter, intent, step)
  }
  settle(game)
  if (game.phase === 'over') return game

  game.clock += step
  switch (game.phase) {
    case 'draw':
      if (game.clock >= TOWER.draw) {
        game.phase = 'turn'
        game.clock = 0
      }
      break
    case 'turn':
      if (game.clock >= TOWER.turn) cut(game, game.turn, nearestString(game, game.turn), { auto: true })
      break
    case 'result':
      if (game.clock < TOWER.result) break
      game.clock = 0
      if (standing(game).length <= 1) {
        game.phase = 'over'
      } else {
        game.turn = nextFrom(game, game.turn)
        game.phase = 'turn'
      }
      break
  }
  return game
}

/** Everybody, best first: whoever is still standing, then everybody out, the later the better. */
export function placings(game: Game): { cutter: Cutter; index: number; place: number }[] {
  const score = (c: Cutter) => (c.out ? c.out.order : Infinity)
  const ranked = game.players.map((cutter, index) => ({ cutter, index })).sort((a, b) => score(b.cutter) - score(a.cutter))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => score(other.cutter) > score(entry.cutter)).length,
  }))
}

/**
 * The string a ray from the camera is aimed at: the whole one it passes nearest
 * to, within `TOWER.aim` - the nearer to the camera if two are as near. Null if
 * none.
 */
export function aimAt(game: Game, origin: Point3, direction: Point3): number | null {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (length === 0) return null
  const d = { x: direction.x / length, y: direction.y / length, z: direction.z / length }
  const web = webFor(game.seed, game.count)
  let best: { string: number; distance: number; along: number } | null = null
  web.forEach((strand, string) => {
    if (game.cut[string] !== null) return
    const hit = rayToSegment(origin, d, strand.rim, strand.end)
    if (hit.distance > TOWER.aim) return
    const nearer = !best || hit.distance < best.distance - 1e-6 || (Math.abs(hit.distance - best.distance) <= 1e-6 && hit.along < best.along)
    if (nearer) best = { string, ...hit }
  })
  return best ? (best as { string: number }).string : null
}

/** The closest a ray (unit direction) passes to a segment, and how far along the ray that is. */
export function rayToSegment(origin: Point3, d: Point3, a: Point3, b: Point3): { distance: number; along: number } {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const w = { x: origin.x - a.x, y: origin.y - a.y, z: origin.z - a.z }
  const dot = (p: Point3, q: Point3) => p.x * q.x + p.y * q.y + p.z * q.z
  const uu = dot(u, u)
  const ud = dot(u, d)
  const uw = dot(u, w)
  const dw = dot(d, w)
  const denominator = uu - ud * ud
  // Parameter along the segment, 0 to 1, and along the ray, 0 or more.
  let s = denominator > 1e-9 ? (uw - ud * dw) / denominator : 0
  s = Math.min(1, Math.max(0, s))
  let t = ud * s - dw
  if (t < 0) {
    t = 0
    s = Math.min(1, Math.max(0, uw / uu))
  }
  const onRay = { x: origin.x + d.x * t, y: origin.y + d.y * t, z: origin.z + d.z * t }
  const onSegment = { x: a.x + u.x * s, y: a.y + u.y * s, z: a.z + u.z * s }
  return { distance: Math.hypot(onRay.x - onSegment.x, onRay.y - onSegment.y, onRay.z - onSegment.z), along: t }
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const
