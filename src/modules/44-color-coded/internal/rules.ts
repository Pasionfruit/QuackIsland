/**
 * The rules of Color Coded, as arithmetic.
 *
 * Everybody against everybody, on a grid of colour panels floating over
 * nothing. A giant wheel spins and lands on a colour; **two seconds to get onto
 * a panel of it**, shoving anybody in your way. Then every other panel drops
 * away, and **anybody standing on one falls, and is out.** The panels come back,
 * the colours are dealt again - with fewer of the wheel's colour every round -
 * and it goes round again. Walk or be shoved off the edge and you fall too.
 * Last one standing wins.
 *
 * A shove goes the way you face: anybody standing just in front of you is
 * knocked back about a panel's width.
 *
 * Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import { HALF, ROUND_LENGTH, panelAt, solid, spawnPoint, when } from './arena'

export const BODY = {
  radius: PLAYER.radius,
  /** Metres a second. */
  speed: 5.5,
} as const

export const PUSH = {
  /** How far a shove reaches, middle to middle. */
  reach: 1.9,
  /** How wide, radians either side of where you face. */
  arc: 1,
  /** How hard it knocks them, metres a second. */
  impulse: 10,
  /** How quickly a knock wears off, per second. */
  drag: 3.5,
  /** A little step forward into it. */
  lunge: 2.5,
  /** Seconds between shoves. */
  cooldown: 0.75,
  /** How long after a shove a fall is still credited to whoever shoved, seconds. */
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
  /** Knocked: velocity from a shove, wearing off. */
  kx: number
  kz: number
  /** Radians. Facing (-sin yaw, -cos yaw): 0 faces north, -Z. */
  yaw: number
  /** Where they are trying to walk: -1 to 1 each, east and south. */
  mx: number
  mz: number
  /** When they fell - out - or null while standing. */
  out: number | null
  /** Who shoved them off, or null. */
  by: number | null
  kills: number
  /** When they last shoved, in `elapsed`. */
  pushedAt: number
  /** Who last shoved them, and when. */
  shovedBy: number | null
  shovedAt: number
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
        kx: 0,
        kz: 0,
        yaw: at.yaw,
        mx: 0,
        mz: 0,
        out: null,
        by: null,
        kills: 0,
        pushedAt: -PUSH.cooldown,
        shovedBy: null,
        shovedAt: -Infinity,
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

/** Where a player wants to walk and which way they face. `mx`, `mz` east and south, a length of at most one. */
export function steer(game: Game, player: number, mx: number, mz: number, yaw: number): void {
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
  p.yaw = wrapAngle(yaw)
}

export function cooldownLeft(game: Game, p: Player): number {
  return Math.max(0, PUSH.cooldown - (game.elapsed - p.pushedAt))
}

/**
 * A shove, the way the player faces: everybody standing within reach in front
 * of them is knocked straight away from them. Who it caught, by index - or null
 * if they cannot shove yet.
 */
export function push(game: Game, player: number): number[] | null {
  const p = game.players[player]
  if (!canAct(game, p) || cooldownLeft(game, p) > 1e-9) return null
  p.pushedAt = game.elapsed
  const ahead = facing(p.yaw)
  p.kx += ahead.x * PUSH.lunge
  p.kz += ahead.z * PUSH.lunge
  const caught: number[] = []
  game.players.forEach((q, i) => {
    if (i === player || !isStanding(q)) return
    const dx = q.x - p.x
    const dz = q.z - p.z
    const d = Math.hypot(dx, dz)
    if (d > PUSH.reach || d < 1e-6) return
    if (Math.abs(wrapAngle(Math.atan2(-dx, -dz) - p.yaw)) > PUSH.arc) return
    q.kx += (dx / d) * PUSH.impulse
    q.kz += (dz / d) * PUSH.impulse
    q.shovedBy = player
    q.shovedAt = game.elapsed
    caught.push(i)
  })
  return caught
}

/** A player starts to fall: out, from this moment. Credited to whoever shoved them, if it was just now. */
function fall(game: Game, player: number): void {
  const p = game.players[player]
  if (!isStanding(p) || game.over) return
  p.out = round2(Math.max(0, clock(game)))
  p.vy = 0
  if (p.shovedBy !== null && game.elapsed - p.shovedAt <= PUSH.credit && game.players[p.shovedBy]) {
    p.by = p.shovedBy
    game.players[p.shovedBy].kills += 1
  }
}

/**
 * Everybody moves on by `dt`: walking, knocked, kept apart, and - with nothing
 * under them - falling. Only the host, or alone.
 */
export function move(game: Game, dt: number): void {
  if (game.over) return
  const step = Math.min(Math.max(dt, 0), 0.1)
  const running = clock(game) >= 0
  for (const p of game.players) {
    if (p.left) continue
    if (p.out !== null) {
      // Falling: momentum, and down.
      p.vy -= ROUND.gravity * step
      p.y = Math.max(-ROUND.depth, p.y + p.vy * step)
      p.x += p.kx * step
      p.z += p.kz * step
      continue
    }
    if (!running) continue
    // Knocked hard, your own feet count for less.
    const knocked = Math.hypot(p.kx, p.kz)
    const own = BODY.speed * (knocked > 4 ? 0.35 : 1)
    p.x += (p.mx * own + p.kx) * step
    p.z += (p.mz * own + p.kz) * step
    const wear = Math.exp(-PUSH.drag * step)
    p.kx *= wear
    p.kz *= wear
  }
  // Bodies do not overlap: pushed apart, half each.
  const standing = game.players.filter(isStanding)
  for (let i = 0; i < standing.length; i++) {
    for (let j = i + 1; j < standing.length; j++) {
      const a = standing[i]
      const b = standing[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const d = Math.hypot(dx, dz)
      const least = BODY.radius * 2
      if (d >= least) continue
      const nx = d > 1e-6 ? dx / d : 1
      const nz = d > 1e-6 ? dz / d : 0
      const over = (least - d) / 2
      a.x -= nx * over
      a.z -= nz * over
      b.x += nx * over
      b.z += nz * over
    }
  }
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
