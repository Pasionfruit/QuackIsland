/**
 * The rules of You're The Bomb, as arithmetic.
 *
 * Everybody against everybody, in a long room with bombs hidden in the floor.
 * **Get to the hole at the far end and drop through it before the rolling pin
 * comes.** Nobody can see the bombs - **Space scans**, showing you, and only you,
 * every bomb near where you stand for a few seconds. Step on one and it goes off:
 * you are out, and anybody near is knocked flying. **Shove** anybody in your way -
 * into a bomb, if you like.
 *
 * At 45 seconds the rolling pin comes through the door and rolls the length of
 * the room, and **anybody still in the room is crushed.** Whoever drops through
 * the hole first places first; after them, whoever lasted longest.
 *
 * Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import { ROOM, inHole, roomFor, spawnPoint, type Point } from './room'

export const BODY = {
  radius: PLAYER.radius,
  /** Metres a second. */
  speed: 4.6,
} as const

export const SCAN = {
  /** How far a scan sees, metres. */
  radius: 4,
  /** How long what it showed stays on your screen, seconds. */
  show: 4,
  /** Seconds between scans. */
  cooldown: 2,
} as const

export const BOMB = {
  /** How near a bomb your middle has to come to set it off. */
  trigger: 0.6,
  /** How far its blast knocks people, and how hard. */
  blast: 2.2,
  knock: 9,
} as const

export const PUSH = {
  reach: 1.7,
  arc: 1,
  impulse: 9,
  drag: 3.5,
  lunge: 2,
  cooldown: 0.8,
  /** How long after a shove a death is still credited to whoever shoved. */
  credit: 2.5,
} as const

export const PIN = {
  /** When the rolling pin reaches the room, seconds. */
  arrives: 45,
  /** How fast it rolls the length of the room, metres a second. */
  speed: 22,
  /** How big it is. */
  radius: 2.2,
  /** Where it starts: this far outside the door, for the 45 seconds of warning. */
  from: 26,
} as const

export const ROUND = {
  countdown: 0,
  /** Past this, the pin has rolled the whole room. */
  limit: PIN.arrives + (ROOM.halfZ * 2 + PIN.radius) / PIN.speed + 0.5,
} as const

export type How = 'bomb' | 'pin'

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  x: number
  z: number
  /** Knocked: velocity from a shove or a blast, wearing off. */
  kx: number
  kz: number
  /** Radians, facing (-sin yaw, -cos yaw): the way they last walked. */
  yaw: number
  mx: number
  mz: number
  /** When they dropped through the hole, or null. */
  escaped: number | null
  /** When they died, and how, or null. */
  out: number | null
  how: How | null
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
  /** The bombs that have gone off, by index into the room's bombs, and when. */
  blown: { bomb: number; at: number; by: number }[]
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

export function yawTowards(from: Point, to: Point): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    blown: [],
    players: entrants.map((e, index) => {
      const at = spawnPoint(index, entrants.length)
      return {
        id: e.id,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        x: at.x,
        z: at.z,
        kx: 0,
        kz: 0,
        yaw: at.yaw,
        mx: 0,
        mz: 0,
        escaped: null,
        out: null,
        how: null,
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

/** Still in the room: not out, not escaped, not gone. */
export function inRoom(p: Player): boolean {
  return p.out === null && p.escaped === null && !p.left
}

export function canAct(game: Game, p: Player | undefined): p is Player {
  return !!p && !game.over && clock(game) >= 0 && inRoom(p)
}

/** Where the rolling pin's middle is at `t`: outside the door, closing in, then through the room. */
export function pinZ(t: number): number {
  const door = ROOM.halfZ + PIN.radius
  if (t < PIN.arrives) return door + PIN.from * (1 - Math.max(0, t) / PIN.arrives)
  return door - (t - PIN.arrives) * PIN.speed
}

/** Which bombs are still live, as a set of indices. */
export function live(game: Game): Set<number> {
  const blown = new Set(game.blown.map((b) => b.bomb))
  const all = new Set<number>()
  roomFor(game.seed).bombs.forEach((_, i) => {
    if (!blown.has(i)) all.add(i)
  })
  return all
}

/** Which way a player wants to walk: `mx`, `mz` east and south, a length of at most one. They face it. */
export function steer(game: Game, player: number, mx: number, mz: number): void {
  const p = game.players[player]
  if (!p || !inRoom(p)) return
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
    if (i === player || !inRoom(q)) return
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

/** A player dies - by a bomb or the pin - credited to whoever shoved them just before. */
function die(game: Game, player: number, how: How): void {
  const p = game.players[player]
  if (!inRoom(p) || game.over) return
  p.out = round2(Math.max(0, clock(game)))
  p.how = how
  if (p.shovedBy !== null && game.elapsed - p.shovedAt <= PUSH.credit && game.players[p.shovedBy]) {
    p.by = p.shovedBy
    game.players[p.shovedBy].kills += 1
  }
}

/** A bomb goes off under `player`: they are out, and anybody near is knocked away from it. */
function blow(game: Game, bomb: number, player: number): void {
  const b = roomFor(game.seed).bombs[bomb]
  game.blown.push({ bomb, at: game.elapsed, by: player })
  die(game, player, 'bomb')
  game.players.forEach((q, i) => {
    if (i === player || !inRoom(q)) return
    const dx = q.x - b.x
    const dz = q.z - b.z
    const d = Math.hypot(dx, dz)
    if (d > BOMB.blast) return
    const k = BOMB.knock * (1 - d / BOMB.blast) + 2
    q.kx += (d > 1e-6 ? dx / d : 0) * k
    q.kz += (d > 1e-6 ? dz / d : 1) * k
  })
}

/**
 * Everybody moves on by `dt`: walking, knocked, kept apart and inside the walls -
 * and then the floor has its say. A live bomb under anybody goes off; the hole
 * takes anybody over it; the pin crushes anybody it has reached. Only the host, or alone.
 */
export function move(game: Game, dt: number): void {
  if (game.over) return
  const step = Math.min(Math.max(dt, 0), 0.1)
  const t = clock(game)
  if (t < 0) return
  const r = BODY.radius
  for (const p of game.players) {
    if (!inRoom(p)) continue
    const knocked = Math.hypot(p.kx, p.kz)
    const own = BODY.speed * (knocked > 4 ? 0.35 : 1)
    p.x = clamp(p.x + (p.mx * own + p.kx) * step, -ROOM.halfX + r, ROOM.halfX - r)
    p.z = clamp(p.z + (p.mz * own + p.kz) * step, -ROOM.halfZ + r, ROOM.halfZ - r)
    const wear = Math.exp(-PUSH.drag * step)
    p.kx *= wear
    p.kz *= wear
  }
  const here = game.players.filter(inRoom)
  for (let i = 0; i < here.length; i++) {
    for (let j = i + 1; j < here.length; j++) {
      const a = here[i]
      const b = here[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const d = Math.hypot(dx, dz)
      if (d >= r * 2) continue
      const nx = d > 1e-6 ? dx / d : 1
      const nz = d > 1e-6 ? dz / d : 0
      const over = (r * 2 - d) / 2
      a.x -= nx * over
      a.z -= nz * over
      b.x += nx * over
      b.z += nz * over
    }
  }
  const bombs = roomFor(game.seed).bombs
  const armed = live(game)
  game.players.forEach((p, i) => {
    if (!inRoom(p)) return
    for (const k of armed) {
      if (Math.hypot(bombs[k].x - p.x, bombs[k].z - p.z) <= BOMB.trigger) {
        blow(game, k, i)
        armed.delete(k)
        return
      }
    }
    if (inHole(p)) p.escaped = round2(t)
  })
  const pin = pinZ(t)
  game.players.forEach((p, i) => {
    if (inRoom(p) && p.z + BODY.radius >= pin - PIN.radius) die(game, i, 'pin')
  })
}

export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/** Over when nobody is left in the room, or the pin has rolled all of it. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  if (game.players.every((p) => !inRoom(p)) || clock(game) >= ROUND.limit) game.over = true
  return game.over
}

export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
  move(game, dt)
  judgeEnd(game)
  return game
}

export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (!p || p.left || game.over) return
  if (inRoom(p)) p.leftAt = round2(Math.max(0, clock(game)))
  p.left = true
}

/**
 * Everybody, best first: the escaped, the first out of the hole first; then the
 * dead, the last to die first - the pin takes those nearer the hole later, so
 * they place higher; then anybody who left while in the room.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player): [number, number] =>
    p.escaped !== null ? [0, p.escaped] : p.out !== null ? [1, -p.out] : p.left ? [2, -(p.leftAt ?? 0)] : [1, -Infinity]
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
