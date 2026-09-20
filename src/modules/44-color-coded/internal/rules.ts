/**
 * The rules of Color Coded, as arithmetic.
 *
 * Everybody against everybody, on a grid of colour panels floating over
 * nothing. A giant wheel spins and lands on a colour; **two seconds to get onto
 * a panel of it**. Then every other panel drops away, and **anybody standing on
 * one falls, and is out.** The panels come back, the colours are dealt again -
 * with fewer of the wheel's colour every round - and it goes round again. Walk
 * or slide off the edge and you fall too. Last one standing wins.
 *
 * **The panels are ice.** Nobody stops when they let go and nobody turns on the
 * spot: a body has a velocity, and what the keys do is pull it towards where you
 * are pointing, at a rate - quick when walking, slow when running, very slow when
 * you have let go and are only sliding. **Hold run and you go nearly twice as fast
 * and turn about half as well.**
 *
 * **There is no shove. Bodies collide instead**, and a collision keeps its speed:
 * what one body had going towards another, mostly, the other now has. So a runner
 * into somebody standing still sends them off and stops nearly dead, and two
 * running at each other bounce. A hard enough hit is a knock, and if the one
 * knocked falls in the next couple of seconds it is credited to whoever knocked.
 *
 * Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import { HALF, ROUND_LENGTH, panelAt, solid, spawnPoint, when } from './arena'

export const BODY = {
  radius: PLAYER.radius,
  /** Top speed walking, and running, metres a second. */
  walk: 4.5,
  run: 8.5,
} as const

/**
 * The ice. Each is a rate, per second, at which a body's velocity closes on the
 * one it is being steered to - so the reciprocal is roughly how many seconds it
 * takes to get most of the way there.
 */
export const SLIDE = {
  /** Holding a direction, walking: a third of a second to come round to it. */
  grip: 3.2,
  /** Holding a direction, running: about twice that, and a much wider turn. */
  runGrip: 1.6,
  /** Holding nothing: it is a long slide to a stop - from a walk, most of six metres. */
  drift: 0.7,
  /** Nothing goes faster than this, whatever hit it: a runner into a runner is quick enough already. */
  cap: 12,
  /** Falling, there is no ice under you: what sideways speed you had wears off at this rate, so you tumble away below rather than sailing off across the sky. */
  air: 1.5,
} as const

export const BUMP = {
  /** How much of a collision's closing speed bounces back: 1 is billiard balls, 0 is clay. */
  bounce: 0.9,
  /** A collision closing at least this fast, metres a second, is a knock rather than a nudge. */
  hard: 2.5,
  /** How long after a knock a fall is still credited to whoever knocked, seconds. */
  credit: 2.5,
} as const

export const ROUND = {
  countdown: 0,
  /** Sixteen rounds, then whoever is standing shares first. */
  limit: ROUND_LENGTH * 16,
  /** How fast you fall, metres a second a second, and how far before you are gone from sight. */
  gravity: 25,
  depth: 30,
} as const

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  x: number
  z: number
  /** Height: 0 on a panel, falling below. */
  y: number
  vy: number
  /** How fast they are sliding, east and south, metres a second. */
  vx: number
  vz: number
  /** Radians. Facing (-sin yaw, -cos yaw): 0 faces north, -Z. */
  yaw: number
  /** Where they are trying to go: -1 to 1 each, east and south. */
  mx: number
  mz: number
  /** Whether they are holding run. */
  run: boolean
  /** When they fell - out - or null while standing. */
  out: number | null
  /** Who knocked them off, or null. */
  by: number | null
  kills: number
  /** Who last hit them hard, and when, in `elapsed`. */
  knockedBy: number | null
  knockedAt: number
  left: boolean
  leftAt: number | null
}

export interface Game {
  seed: number
  id: number
  elapsed: number
  over: boolean
  players: Player[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
}

/** The way a yaw faces, on the floor. */
export function facing(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) }
}

export function yawTowards(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    players: entrants.map((e, index) => {
      const at = spawnPoint(index, entrants.length)
      return {
        id: e.id,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        x: at.x,
        z: at.z,
        y: 0,
        vy: 0,
        vx: 0,
        vz: 0,
        yaw: at.yaw,
        mx: 0,
        mz: 0,
        run: false,
        out: null,
        by: null,
        kills: 0,
        knockedBy: null,
        knockedAt: -Infinity,
        left: false,
        leftAt: null,
      }
    }),
  }
}

export function clock(game: Game): number {
  return game.elapsed - ROUND.countdown
}

/** On the panels: not fallen, not gone. */
export function isStanding(p: Player): boolean {
  return p.out === null && !p.left
}

export function canAct(game: Game, p: Player | undefined): p is Player {
  return !!p && !game.over && clock(game) >= 0 && isStanding(p)
}

/** Whether there is a panel under a point just now. */
export function supported(game: Game, x: number, z: number): boolean {
  return solid(game.seed, clock(game), panelAt(x, z))
}

/** Where a player wants to go, whether they are running, and which way they face. `mx`, `mz` east and south, a length of at most one. */
export function steer(game: Game, player: number, mx: number, mz: number, yaw: number, run = false): void {
  const p = game.players[player]
  if (!p || !isStanding(p)) return
  let x = clamp(mx, -1, 1)
  let z = clamp(mz, -1, 1)
  const length = Math.hypot(x, z)
  if (length > 1) {
    x /= length
    z /= length
  }
  p.mx = x
  p.mz = z
  p.run = run
  p.yaw = wrapAngle(yaw)
}

/**
 * A body's velocity after `dt` of being steered: pulled towards where it is
 * pointing at `SLIDE.grip` - less if it is running - or, holding nothing, just
 * losing speed at `SLIDE.drift`. Pure, and exported so a guest can move its own
 * body the same way the host does.
 */
export function slide(vx: number, vz: number, mx: number, mz: number, run: boolean, dt: number): { vx: number; vz: number } {
  const held = Math.hypot(mx, mz) > 1e-6
  const top = run ? BODY.run : BODY.walk
  const rate = held ? (run ? SLIDE.runGrip : SLIDE.grip) : SLIDE.drift
  const k = 1 - Math.exp(-rate * Math.max(0, dt))
  const next = { vx: vx + ((held ? mx * top : 0) - vx) * k, vz: vz + ((held ? mz * top : 0) - vz) * k }
  return limit(next.vx, next.vz)
}

/** A velocity, kept under the speed limit. */
function limit(vx: number, vz: number): { vx: number; vz: number } {
  const speed = Math.hypot(vx, vz)
  return speed > SLIDE.cap ? { vx: (vx / speed) * SLIDE.cap, vz: (vz / speed) * SLIDE.cap } : { vx, vz }
}

/** How fast a player is going, metres a second. */
export function speedOf(p: Pick<Player, 'vx' | 'vz'>): number {
  return Math.hypot(p.vx, p.vz)
}

/** A player starts to fall: out, from this moment. Credited to whoever knocked them, if it was just now. */
function fall(game: Game, player: number): void {
  const p = game.players[player]
  if (!isStanding(p) || game.over) return
  p.out = round2(Math.max(0, clock(game)))
  p.vy = 0
  if (p.knockedBy !== null && game.elapsed - p.knockedAt <= BUMP.credit && game.players[p.knockedBy]) {
    p.by = p.knockedBy
    game.players[p.knockedBy].kills += 1
  }
}

/**
 * Bodies do not overlap, and a collision keeps its speed. Two bodies that touch
 * are pushed apart, half each, and the speed they were closing at along the line
 * between them is traded: `BUMP.bounce` of it comes back, so one body into a
 * still one gives most of what it had. Closing at `BUMP.hard` or more, whoever was
 * going faster into the other is credited with knocking it. Standing bodies only,
 * in index order, so it comes out the same everywhere.
 */
function collide(game: Game): void {
  const standing = game.players.map((p, index) => ({ p, index })).filter((e) => isStanding(e.p))
  for (let i = 0; i < standing.length; i++) {
    for (let j = i + 1; j < standing.length; j++) {
      const a = standing[i]
      const b = standing[j]
      const dx = b.p.x - a.p.x
      const dz = b.p.z - a.p.z
      const d = Math.hypot(dx, dz)
      const least = BODY.radius * 2
      if (d >= least) continue
      const nx = d > 1e-6 ? dx / d : 1
      const nz = d > 1e-6 ? dz / d : 0
      const over = (least - d) / 2
      a.p.x -= nx * over
      a.p.z -= nz * over
      b.p.x += nx * over
      b.p.z += nz * over
      // How fast each was going into the other, and so how fast they were closing.
      const into = { a: a.p.vx * nx + a.p.vz * nz, b: -(b.p.vx * nx + b.p.vz * nz) }
      const closing = into.a + into.b
      if (closing <= 0) continue
      const swap = ((1 + BUMP.bounce) * closing) / 2
      const va = limit(a.p.vx - nx * swap, a.p.vz - nz * swap)
      const vb = limit(b.p.vx + nx * swap, b.p.vz + nz * swap)
      Object.assign(a.p, va)
      Object.assign(b.p, vb)
      if (closing >= BUMP.hard) {
        const [hitter, hit] = into.a >= into.b ? [a, b] : [b, a]
        hit.p.knockedBy = hitter.index
        hit.p.knockedAt = game.elapsed
      }
    }
  }
}

/** The longest a step of the physics is: a runner covers under fifteen centimetres in it, well short of a body. */
const SUBSTEP = 1 / 60

/**
 * Everybody moves on by `dt`: sliding, hitting each other, and - with nothing
 * under them - falling. Only the host, or alone.
 */
export function move(game: Game, dt: number): void {
  if (game.over) return
  const step = Math.min(Math.max(dt, 0), 0.1)
  const parts = Math.max(1, Math.ceil(step / SUBSTEP - 1e-9))
  for (let k = 0; k < parts; k++) advance(game, step / parts)
}

function advance(game: Game, step: number): void {
  const running = clock(game) >= 0
  for (const p of game.players) {
    if (p.left) continue
    if (p.out !== null) {
      // Falling: momentum, and down.
      p.vy -= ROUND.gravity * step
      p.y = Math.max(-ROUND.depth, p.y + p.vy * step)
      const air = Math.exp(-SLIDE.air * step)
      p.vx *= air
      p.vz *= air
      p.x += p.vx * step
      p.z += p.vz * step
      continue
    }
    if (!running) continue
    const v = slide(p.vx, p.vz, p.mx, p.mz, p.run, step)
    p.vx = v.vx
    p.vz = v.vz
    p.x += p.vx * step
    p.z += p.vz * step
  }
  collide(game)
  if (!running) return
  game.players.forEach((p, i) => {
    if (isStanding(p) && !supported(game, p.x, p.z)) fall(game, i)
  })
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** Whether it is over: one standing or nobody, or time is up. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const standing = game.players.filter(isStanding).length
  if (standing <= 1 || clock(game) >= ROUND.limit) game.over = true
  return game.over
}

/** One step: the clock, everybody moving and falling, the end. For the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  move(game, dt)
  judgeEnd(game)
  return game
}

/** A player who has left the lobby. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  if (p.out === null) p.leftAt = round2(Math.max(0, clock(game)))
  p.left = true
}

/** The round the game is on, from 1. */
export function roundOf(game: Game): number {
  return when(clock(game)).round
}

/** How near the edge a point is, metres: negative off it. */
export function edgeRoom(x: number, z: number): number {
  return HALF - Math.max(Math.abs(x), Math.abs(z))
}

/**
 * Everybody, best first, with their place: whoever is standing at the end
 * shares first; then the fallen, the last to fall first - those who fell
 * together share; then anybody who left standing, the last to leave first.
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
