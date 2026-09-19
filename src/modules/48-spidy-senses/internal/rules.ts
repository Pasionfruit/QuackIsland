/**
 * The rules of Spidy Senses, as arithmetic.
 *
 * A game of chicken round a trapdoor with a spider's nest under it. Every round
 * everybody starts back on a ring round it and **creeps in** - slowly. A click
 * **stops you** where you stand for the rest of the round, and you are safe.
 *
 * At a random moment **the trapdoor springs**: the lid rattles and red eyes
 * glint under it. From then **you have a fraction of a second to click.** Anybody
 * who has not clicked by then - who reacted too late, or never stopped - **gets
 * the spider, and is out.**
 *
 * If nobody is too late, **the spider takes the chicken**: whoever stopped
 * furthest from the trapdoor. Level with somebody else, the one further from the
 * right moment goes - who stopped longest before the spring, or reacted slowest
 * after it. So stopping early is safe from the spider's jump and not from being
 * the chicken, and creeping close means betting on your reactions.
 *
 * Somebody goes every round. The last one left wins.
 *
 * Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import { CELLAR, scheduleFor, spawnPoint, when, type Round } from './nest'

export const BODY = {
  radius: PLAYER.radius,
  /** Metres a second: slowly. */
  speed: 0.75,
} as const

/** Distances nearer than this to each other are level, for picking the chicken, metres. */
export const LEVEL = 0.05

/** How long ago a guest's stop may say it happened, seconds - no earlier than that is believed. */
export const STOP_SLACK = 0.5

export type How = 'eaten' | 'chicken'

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  x: number
  z: number
  /** Radians, facing (-sin yaw, -cos yaw): always the trapdoor. */
  yaw: number
  /** Which way they are walking: towards the trapdoor (negative is away), and round it (anticlockwise seen from above). */
  toward: number
  around: number
  /** When they stopped this round, on the game's clock, or null while still creeping. */
  stoppedAt: number | null
  /** The round they went in, and how, or null. */
  out: number | null
  how: How | null
  /** When the spider took them, on the game's clock. */
  outAt: number | null
  left: boolean
  leftAt: number | null
}

export interface Game {
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Player[]
  /** The round everybody is placed for. */
  round: number
  /** The last round the spider has been out for. */
  judged: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    round: 1,
    judged: 0,
    players: entrants.map((e, index) => {
      const at = spawnPoint(index, entrants.length)
      return {
        id: e.id,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        x: at.x,
        z: at.z,
        yaw: at.yaw,
        toward: 0,
        around: 0,
        stoppedAt: null,
        out: null,
        how: null,
        outAt: null,
        left: false,
        leftAt: null,
      }
    }),
  }
}

/** Still in: not taken, not gone. */
export function isStanding(p: Player): boolean {
  return p.out === null && !p.left
}

/** The round the clock is in. */
export function roundNow(game: Game): Round {
  return when(game.seed, game.elapsed).round
}

/** Whether a player can still creep: in, not stopped, and in the creep. */
export function canCreep(game: Game, p: Player | undefined): p is Player {
  return !!p && !game.over && isStanding(p) && p.stoppedAt === null && when(game.seed, game.elapsed).phase === 'creep'
}

/** How far from the middle of the trapdoor. */
export function distance(p: { x: number; z: number }): number {
  return Math.hypot(p.x, p.z)
}

/** Which way a player wants to walk: towards the trapdoor and round it, each -1 to 1, a length of at most one. */
export function steer(game: Game, player: number, toward: number, around: number): void {
  const p = game.players[player]
  if (!p || !isStanding(p)) return
  let f = clamp(toward, -1, 1)
  let a = clamp(around, -1, 1)
  const length = Math.hypot(f, a)
  if (length > 1) {
    f /= length
    a /= length
  }
  p.toward = f
  p.around = a
}

/**
 * A click: the player stops where they are, for the rest of the round - at `at`
 * on the game's clock if given (a guest's own reading of when it clicked), but
 * never later than now, never more than `STOP_SLACK` before now, and never
 * before the creep began. Whether it stopped them.
 */
export function stop(game: Game, player: number, at?: number): boolean {
  const p = game.players[player]
  if (!canCreep(game, p)) return false
  const round = roundNow(game)
  const said = at ?? game.elapsed
  p.stoppedAt = round2(clamp(said, Math.max(round.creep, game.elapsed - STOP_SLACK), game.elapsed))
  p.toward = 0
  p.around = 0
  return true
}

/** Whether a stop at `stoppedAt` beat the spider in `round`: before it sprang, or quick enough after. */
export function inTime(round: Round, stoppedAt: number | null): boolean {
  return stoppedAt !== null && stoppedAt <= round.springs + round.window + 1e-9
}

/** How far a stop was from the right moment - the spring - either side of it, seconds. Never stopped is as far as there is. */
export function offMoment(round: Round, stoppedAt: number | null): number {
  return stoppedAt === null ? Infinity : Math.abs(stoppedAt - round.springs)
}

/**
 * Who the spider takes in `round`: everybody too late, or - if nobody was - the
 * chicken, furthest from the trapdoor; level with somebody, the one further
 * from the right moment. By index.
 */
export function victims(game: Game, round: Round): { who: number[]; how: How } {
  const standing = game.players.map((p, i) => ({ p, i })).filter(({ p }) => isStanding(p))
  const late = standing.filter(({ p }) => !inTime(round, p.stoppedAt)).map(({ i }) => i)
  if (late.length > 0) return { who: late, how: 'eaten' }
  const level = (p: Player) => Math.round(distance(p) / LEVEL)
  let worst: { p: Player; i: number }[] = []
  for (const entry of standing) {
    const w = worst[0]
    const worse = !w || level(entry.p) > level(w.p) || (level(entry.p) === level(w.p) && offMoment(round, entry.p.stoppedAt) > offMoment(round, w.p.stoppedAt) + 1e-9)
    const same = !!w && level(entry.p) === level(w.p) && Math.abs(offMoment(round, entry.p.stoppedAt) - offMoment(round, w.p.stoppedAt)) <= 1e-9
    if (worse) worst = [entry]
    else if (same) worst.push(entry)
  }
  // Exactly level with everybody, to the hundredth of a second: nobody is the chicken.
  if (worst.length === standing.length && standing.length > 1) return { who: [], how: 'chicken' }
  return { who: worst.map(({ i }) => i), how: 'chicken' }
}

/** The spider comes out for `round`: whoever it takes is out. */
export function judge(game: Game, round: Round): { who: number[]; how: How } {
  const result = victims(game, round)
  for (const i of result.who) {
    const p = game.players[i]
    p.out = round.round
    p.how = result.how
    p.outAt = round2(round.judged)
    p.toward = 0
    p.around = 0
  }
  game.judged = round.round
  return result
}

/** Everybody still in back on the ring for `round`, creeping again. */
export function startRound(game: Game, round: number): void {
  const standing = game.players.filter(isStanding)
  standing.forEach((p, k) => {
    const at = spawnPoint(k, standing.length)
    Object.assign(p, { x: at.x, z: at.z, yaw: at.yaw, toward: 0, around: 0, stoppedAt: null })
  })
  game.round = round
}

/**
 * Everybody moves on by `dt`: creeping in or back and round, never onto the
 * trapdoor nor back past the ring, kept apart - and a stopped player does not
 * budge for anybody. Only the host, or alone.
 */
export function move(game: Game, dt: number): void {
  if (game.over || when(game.seed, game.elapsed).phase !== 'creep') return
  const step = Math.min(Math.max(dt, 0), 0.1)
  for (const p of game.players) {
    if (!canCreep(game, p)) continue
    creep(p, step)
  }
  const here = game.players.filter(isStanding)
  const least = BODY.radius * 2
  for (let i = 0; i < here.length; i++) {
    for (let j = i + 1; j < here.length; j++) {
      const a = here[i]
      const b = here[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const d = Math.hypot(dx, dz)
      if (d >= least) continue
      const nx = d > 1e-6 ? dx / d : 1
      const nz = d > 1e-6 ? dz / d : 0
      const over = least - d
      // A stopped player is planted: whoever walked into them takes all of it.
      if (a.stoppedAt !== null && b.stoppedAt !== null) continue
      const share = a.stoppedAt !== null ? 0 : b.stoppedAt !== null ? 1 : 0.5
      a.x -= nx * over * share
      a.z -= nz * over * share
      b.x += nx * over * (1 - share)
      b.z += nz * over * (1 - share)
      ringIn(a)
      ringIn(b)
    }
  }
}

/** One player creeping for `step` seconds: in or back, and round. */
export function creep(p: Player, step: number): void {
  const r = Math.max(distance(p), 1e-6)
  const ux = p.x / r
  const uz = p.z / r
  // In is -u; round, anticlockwise from above, is (uz, -ux).
  p.x += (-ux * p.toward + uz * p.around) * BODY.speed * step
  p.z += (-uz * p.toward - ux * p.around) * BODY.speed * step
  ringIn(p)
}

/** Kept between the trapdoor's edge and the ring, facing the trapdoor. */
function ringIn(p: Player): void {
  const r = Math.max(distance(p), 1e-6)
  const k = clamp(r, CELLAR.near, CELLAR.far) / r
  p.x *= k
  p.z *= k
  p.yaw = Math.atan2(p.x, p.z)
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** A player who has left the lobby. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  if (p.out === null) p.leftAt = round2(game.elapsed)
  p.left = true
}

/**
 * Whether it is over: the last round played out, or one or nobody left outside
 * a reveal - a reveal plays to its end first, so the spider is seen. Only the
 * host decides.
 */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const rounds = scheduleFor(game.seed)
  const standing = game.players.filter(isStanding).length
  if (game.elapsed >= rounds[rounds.length - 1].end) game.over = true
  else if (standing <= 1 && when(game.seed, game.elapsed).phase !== 'reveal') game.over = true
  return game.over
}

/**
 * One step for the host, or alone: the clock; the spider for any round whose
 * moment has come; the end, or everybody back on the ring for a new round, once
 * a reveal is done; and everybody creeping.
 */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  advanceRounds(game)
  move(game, dt)
  return game
}

/** The spider for every round whose moment has passed; then the end, or a new round. Only the host. */
export function advanceRounds(game: Game): void {
  if (game.over) return
  for (const r of scheduleFor(game.seed)) {
    if (r.round <= game.judged) continue
    if (game.elapsed < r.judged) break
    judge(game, r)
  }
  if (judgeEnd(game)) return
  const now = roundNow(game)
  if (now.round > game.round) startRound(game, now.round)
}

/**
 * Everybody, best first, with their place: whoever is left at the end shares
 * first; then the rest, the later the round they went in the better - those
 * taken in the same round share; then anybody who left while in, the last to
 * leave first.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player): [number, number] => (p.out !== null ? [1, -p.out] : p.left ? [2, -(p.leftAt ?? 0)] : [0, 0])
  const better = (a: Player, b: Player) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] < kb[1] - 1e-9
  }
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => (better(a.player, b.player) ? -1 : better(b.player, a.player) ? 1 : a.index - b.index))
  return ranked.map((entry) => ({ ...entry, place: 1 + ranked.filter((other) => better(other.player, entry.player)).length }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const

