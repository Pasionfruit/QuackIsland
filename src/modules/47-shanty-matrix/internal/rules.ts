/**
 * The rules of Shanty Matrix, as arithmetic.
 *
 * Everybody against everybody on the main deck of a pirate ship, under a
 * barrage: **giant cannonballs fly across the deck from every direction, at
 * every speed.** Each one's lane lights up across the planks the moment it is
 * fired, a second before it gets there. **Anybody a ball touches is knocked
 * overboard, and is out.** Dodge them - and **shove** the others into their
 * way. Last one standing wins.
 *
 * A shove goes the way you last walked: anybody just in front of you is knocked
 * back a couple of metres. The rails keep everybody on the deck - only a
 * cannonball puts you over them.
 *
 * Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import { DECK, LIMIT, activeShots, ballAt, spawnPoint } from './deck'

export const BODY = {
  radius: PLAYER.radius,
  /** Metres a second. */
  speed: 5.2,
} as const

export const PUSH = {
  /** How far a shove reaches, middle to middle. */
  reach: 1.8,
  /** How wide, radians either side of where you face. */
  arc: 1,
  /** How hard it knocks them, metres a second. */
  impulse: 11,
  /** How quickly a knock wears off, per second. */
  drag: 3.8,
  /** A little step forward into it. */
  lunge: 2,
  /** Seconds between shoves. */
  cooldown: 0.8,
  /** How long after a shove a hit is still credited to whoever shoved, seconds. */
  credit: 2.5,
} as const

export const ROUND = {
  countdown: 0,
  /** Past this, whoever is standing shares first. */
  limit: LIMIT,
  /** How hard a ball flings you: a share of its speed, and upwards. */
  fling: 0.75,
  lift: 7,
  /** How fast you fall, and how far below the deck before you are gone from sight. */
  gravity: 16,
  depth: 12,
} as const

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  x: number
  z: number
  /** Height: 0 on the deck, flying and then falling once hit. */
  y: number
  vy: number
  /** Knocked: velocity from a shove or a ball, wearing off on the deck. */
  kx: number
  kz: number
  /** Radians, facing (-sin yaw, -cos yaw): the way they last walked. */
  yaw: number
  mx: number
  mz: number
  /** When a ball hit them - out - or null while standing. */
  out: number | null
  /** Who shoved them into it, or null. */
  by: number | null
  kills: number
  pushedAt: number
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

/** On the deck: not hit, not gone. */
export function isStanding(p: Player): boolean {
  return p.out === null && !p.left
}

export function canAct(game: Game, p: Player | undefined): p is Player {
  return !!p && !game.over && clock(game) >= 0 && isStanding(p)
}

/** How near a ball's middle has to come to a body's middle, on the deck, to hit it. */
export function hitRange(radius: number): number {
  return radius + BODY.radius * 0.85
}

/** Which way a player wants to walk: `mx`, `mz` east and south, a length of at most one. They face it. */
export function steer(game: Game, player: number, mx: number, mz: number): void {
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
  if (length > 1e-6) p.yaw = Math.atan2(-x, -z)
}

/** Turns a player to face `yaw` without walking - how a stand-in lines up a shove. */
export function face(game: Game, player: number, yaw: number): void {
  const p = game.players[player]
  if (p && isStanding(p)) p.yaw = wrapAngle(yaw)
}

export function cooldownLeft(game: Game, p: Player): number {
  return Math.max(0, PUSH.cooldown - (game.elapsed - p.pushedAt))
}

/** A shove, the way the player faces. Who it caught, by index - or null if they cannot shove yet. */
export function push(game: Game, player: number): number[] | null {
  const p = game.players[player]
  if (!canAct(game, p) || cooldownLeft(game, p) > 1e-9) return null
  p.pushedAt = game.elapsed
  const ahead = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) }
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

/** A ball hits a player: out, flung the way it was flying, credited to whoever shoved them just before. */
function hit(game: Game, player: number, at: number, dx: number, dz: number, speed: number): void {
  const p = game.players[player]
  if (!isStanding(p) || game.over) return
  p.out = round2(Math.max(0, at))
  p.kx = dx * speed * ROUND.fling
  p.kz = dz * speed * ROUND.fling
  p.vy = ROUND.lift
  p.mx = 0
  p.mz = 0
  if (p.shovedBy !== null && game.elapsed - p.shovedAt <= PUSH.credit && game.players[p.shovedBy]) {
    p.by = p.shovedBy
    game.players[p.shovedBy].kills += 1
  }
}

/** The longest a body moves between two looks for a ball, seconds: short enough that the fastest ball cannot jump a body. */
const SUBSTEP = 1 / 40

/**
 * Everybody moves on by `dt`: walking, knocked, kept apart and inside the rails -
 * and any ball on the deck that touches anybody sends them overboard. Those
 * already hit fly on and fall into the sea. Only the host, or alone.
 */
export function move(game: Game, dt: number): void {
  if (game.over) return
  const step = Math.min(Math.max(dt, 0), 0.1)
  const end = clock(game)
  const steps = Math.max(1, Math.ceil(step / SUBSTEP - 1e-9))
  const h = step / steps
  for (let n = 0; n < steps; n++) {
    const t = end - step + (n + 1) * h
    moveOnce(game, h, t)
  }
}

function moveOnce(game: Game, h: number, t: number): void {
  const r = BODY.radius
  const running = t >= 0
  for (const p of game.players) {
    if (p.left) continue
    if (p.out !== null) {
      // Overboard: momentum, up, and down into the sea - and there they stay.
      if (p.y <= -ROUND.depth) continue
      p.vy -= ROUND.gravity * h
      p.y = Math.max(-ROUND.depth, p.y + p.vy * h)
      p.x += p.kx * h
      p.z += p.kz * h
      continue
    }
    if (!running) continue
    const knocked = Math.hypot(p.kx, p.kz)
    const own = BODY.speed * (knocked > 4 ? 0.35 : 1)
    const nx = p.x + (p.mx * own + p.kx) * h
    const nz = p.z + (p.mz * own + p.kz) * h
    p.x = clamp(nx, -DECK.halfX + r, DECK.halfX - r)
    p.z = clamp(nz, -DECK.halfZ + r, DECK.halfZ - r)
    // Into the rail: the knock that way is spent.
    if (p.x !== nx) p.kx = 0
    if (p.z !== nz) p.kz = 0
    const wear = Math.exp(-PUSH.drag * h)
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
      if (d >= r * 2) continue
      const nx = d > 1e-6 ? dx / d : 1
      const nz = d > 1e-6 ? dz / d : 0
      const over = (r * 2 - d) / 2
      a.x = clamp(a.x - nx * over, -DECK.halfX + r, DECK.halfX - r)
      a.z = clamp(a.z - nz * over, -DECK.halfZ + r, DECK.halfZ - r)
      b.x = clamp(b.x + nx * over, -DECK.halfX + r, DECK.halfX - r)
      b.z = clamp(b.z + nz * over, -DECK.halfZ + r, DECK.halfZ - r)
    }
  }
  if (!running) return
  for (const shot of activeShots(game.seed, t)) {
    const ball = ballAt(shot, t)
    if (!ball || ball.stage !== 'deck') continue
    const reach = hitRange(shot.radius)
    game.players.forEach((p, i) => {
      if (isStanding(p) && Math.hypot(p.x - ball.x, p.z - ball.z) < reach) hit(game, i, t, shot.dx, shot.dz, shot.speed)
    })
  }
}

/** The clock, on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** Whether it is over: one standing or nobody, or the barrage is done. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const standing = game.players.filter(isStanding).length
  if (standing <= 1 || clock(game) >= ROUND.limit) game.over = true
  return game.over
}

/** One step: the clock, everybody moving and the balls, the end. For the host, or alone. */
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

/**
 * Everybody, best first, with their place: whoever is standing at the end
 * shares first; then the hit, the last to go first - two hit in the same
 * hundredth of a second share; then anybody who left standing, the last to
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
