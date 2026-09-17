/**
 * The rules of He's One Shot, as arithmetic.
 *
 * Everybody against everybody, in first person, with a gun that needs a second
 * and a half between shots. **One shot eliminates.** Being eliminated does not
 * take you out of it: you become a hunter - you still walk, and you still shoot
 * anybody who is left standing - but nobody can shoot you any more. The last
 * player to be eliminated wins. At a minute and fifteen, anybody still standing
 * shares first.
 *
 * A shot is instant and straight: from your eyes, the way you look, until it
 * meets a body, a box or the floor. Cover is taller than anybody's eyes, so
 * there is no shooting over it. A body is the island's capsule: a standing
 * cylinder, `BODY.radius` round and `BODY.height` tall.
 *
 * Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import { arenaFor, collide, rayHit, slab, slide, spawnPoint, type Point, type Vec3 } from './arena'

export const BODY = {
  radius: PLAYER.radius,
  height: PLAYER.height,
  eye: PLAYER.eyeHeight,
  /** Metres a second: a jog, not the island's sprint. */
  speed: 5.2,
} as const

export const GUN = {
  /** Seconds between shots. */
  cooldown: 1.5,
  /** How far a shot reaches: further than the arena is across. */
  range: 60,
} as const

export const ROUND = {
  countdown: 3,
  /** Seconds from the start to the end, a minute and fifteen. */
  limit: 75,
} as const

/** How far up or down anybody can look, radians. */
export const PITCH_LIMIT = 1.35

/**
 * How much the host gives a guest's shot, which the guest judged on its own
 * screen a moment ago: how far the shooter may be from where the host has them,
 * how far the shot may pass from where the host has its target, and how early
 * after the last shot it may arrive.
 */
export const CLAIM = { reach: 1.5, slack: 0.9, early: 0.3 } as const

/** How long a shot is kept, seconds, for drawing and for the wire. */
export const SHOT_LIFE = 1

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  x: number
  z: number
  /** Radians. Looking along (-sin yaw, -cos yaw): 0 looks north, -Z. */
  yaw: number
  /** Radians, up positive. */
  pitch: number
  /** When they were eliminated, seconds since the start, or null while standing. */
  out: number | null
  /** Who eliminated them, by index, or null. */
  by: number | null
  kills: number
  /** When they last shot, in `elapsed`. */
  shotAt: number
  left: boolean
  /** When they left, seconds since the start, if they left standing. */
  leftAt: number | null
}

export interface Shot {
  /** The host's count, for telling shots apart on the wire. */
  seq: number
  by: number
  from: Vec3
  to: Vec3
  /** Who it eliminated, by index, or -1. */
  hit: number
  /** When, in `elapsed`. */
  at: number
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the game was dealt, countdown included. */
  elapsed: number
  over: boolean
  players: Player[]
  shots: Shot[]
  /** The last shot number handed out, or - on a guest - heard from the host. */
  seq: number
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const round2 = (v: number) => Math.round(v * 100) / 100

/** An angle brought into -π..π. */
export function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    elapsed: 0,
    over: entrants.length === 0,
    shots: [],
    seq: 0,
    players: entrants.map((e, index) => {
      const at = spawnPoint(seed, entrants.length, index)
      return {
        id: e.id,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        x: at.x,
        z: at.z,
        yaw: at.yaw,
        pitch: 0,
        out: null,
        by: null,
        kills: 0,
        shotAt: -GUN.cooldown,
        left: false,
        leftAt: null,
      }
    }),
  }
}

/** Seconds since the start; negative during the countdown. */
export function clock(game: Game): number {
  return game.elapsed - ROUND.countdown
}

/** Still standing: can be shot. */
export function isStanding(p: Player): boolean {
  return p.out === null && !p.left
}

/** Eliminated, and still here hunting. */
export function isHunter(p: Player): boolean {
  return p.out !== null && !p.left
}

/** Whether a player can move and shoot just now - standing or hunting. */
export function canAct(game: Game, p: Player): boolean {
  return !game.over && clock(game) >= 0 && !p.left
}

/** The way a player looks, as a unit vector. The same as a camera turned `YXZ` by (pitch, yaw). */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }
}

/** Where a player's eyes are. */
export function eyeOf(p: Point): Vec3 {
  return { x: p.x, y: BODY.eye, z: p.z }
}

/** Turns a player to look this way. */
export function look(game: Game, player: number, yaw: number, pitch: number): void {
  const p = game.players[player]
  if (!p || p.left) return
  p.yaw = wrapAngle(yaw)
  p.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT)
}

/**
 * Walks a player for `dt` seconds: `forward` and `right` are each -1 to 1, the
 * way the keys are held, relative to where they look. Diagonals are no faster.
 */
export function walk(game: Game, player: number, intent: { forward: number; right: number }, dt: number): void {
  const p = game.players[player]
  if (!p || !canAct(game, p)) return
  let f = clamp(intent.forward, -1, 1)
  let r = clamp(intent.right, -1, 1)
  const length = Math.hypot(f, r)
  if (length < 1e-6) return
  if (length > 1) {
    f /= length
    r /= length
  }
  const step = BODY.speed * Math.min(Math.max(dt, 0), 0.25)
  // Forward is where they look, flat; right is a quarter turn clockwise from it, seen from above.
  const fx = -Math.sin(p.yaw)
  const fz = -Math.cos(p.yaw)
  const rx = Math.cos(p.yaw)
  const rz = -Math.sin(p.yaw)
  const at = slide(arenaFor(game.seed), p, (fx * f + rx * r) * step, (fz * f + rz * r) * step, BODY.radius)
  p.x = at.x
  p.z = at.z
}

/** Seconds until a player can shoot again. */
export function cooldownLeft(game: Game, p: Player): number {
  return Math.max(0, GUN.cooldown - (game.elapsed - p.shotAt))
}

export function canShoot(game: Game, p: Player): boolean {
  return canAct(game, p) && cooldownLeft(game, p) <= 1e-9
}

/**
 * How far along a ray it meets a standing body at `p` - a cylinder on the floor -
 * or null if it misses, or meets it only past `maxT`.
 */
export function bodyHit(from: Vec3, dir: Vec3, p: Point, maxT: number): number | null {
  const ox = from.x - p.x
  const oz = from.z - p.z
  const r = BODY.radius
  const a = dir.x * dir.x + dir.z * dir.z
  let t0 = -Infinity
  let t1 = Infinity
  if (a < 1e-12) {
    if (ox * ox + oz * oz > r * r) return null
  } else {
    const b = ox * dir.x + oz * dir.z
    const c = ox * ox + oz * oz - r * r
    const disc = b * b - a * c
    if (disc < 0) return null
    const s = Math.sqrt(disc)
    t0 = (-b - s) / a
    t1 = (-b + s) / a
  }
  const ys = slab(from.y, dir.y, 0, BODY.height)
  if (!ys) return null
  const enter = Math.max(t0, ys[0], 0)
  const exit = Math.min(t1, ys[1], maxT)
  return enter <= exit ? enter : null
}

/** Where a shot from `from` along `dir` ends, and who it meets first: -1 for nobody. */
export function trace(game: Game, shooter: number, from: Vec3, dir: Vec3): { t: number; hit: number } {
  let t = rayHit(arenaFor(game.seed), from, dir, GUN.range)
  let hit = -1
  game.players.forEach((p, index) => {
    if (index === shooter || !isStanding(p)) return
    const at = bodyHit(from, dir, p, t)
    if (at !== null && (hit < 0 || at < t)) {
      t = at
      hit = index
    }
  })
  return { t, hit }
}

const along = (from: Vec3, dir: Vec3, t: number): Vec3 => ({ x: from.x + dir.x * t, y: from.y + dir.y * t, z: from.z + dir.z * t })

/** Keeps a shot. Only the host numbers them: a guest's own, drawn before the host has heard, is 0. */
function record(game: Game, by: number, from: Vec3, to: Vec3, hit: number, numbered = true): Shot {
  if (numbered) game.seq += 1
  const shot: Shot = { seq: numbered ? game.seq : 0, by, from, to, hit, at: game.elapsed }
  game.shots.push(shot)
  return shot
}

/** Eliminates a standing player. Their place is fixed by when. Returns whether it happened. */
export function eliminate(game: Game, player: number, by: number | null): boolean {
  const p = game.players[player]
  if (!p || !isStanding(p) || game.over) return false
  p.out = round2(Math.max(0, clock(game)))
  p.by = by
  if (by !== null && game.players[by]) game.players[by].kills += 1
  return true
}

/**
 * A player pulls the trigger, where they stand and look. Nothing if they cannot
 * shoot yet. With `apply` - the host, or alone - whoever it meets is eliminated;
 * without - a guest, judging its own shot - it only says who that would be.
 */
export function fire(game: Game, player: number, apply = true): Shot | null {
  const p = game.players[player]
  if (!p || !canShoot(game, p)) return null
  const from = eyeOf(p)
  const dir = aimDirection(p.yaw, p.pitch)
  const { t, hit } = trace(game, player, from, dir)
  p.shotAt = game.elapsed
  const shot = record(game, player, from, along(from, dir, t), hit, apply)
  if (apply && hit >= 0) eliminate(game, hit, player)
  return shot
}

export interface Claim {
  x: number
  z: number
  yaw: number
  pitch: number
  /** Who the guest's own screen saw the shot meet, or null for nobody. */
  victim: string | null
}

/**
 * A guest's shot, as its own screen judged it, checked by the host.
 *
 * The shot is taken from where the guest says it stood, if that is near where
 * the host has it, and otherwise from where the host has it. A hit counts if the
 * shot passes near enough where the host has the victim - a guest sees
 * everybody a moment late - with nothing solid in between, and the victim is
 * still standing. A shot sooner after the last than the gun allows, give or take
 * the wire, is not a shot. The host never finds a hit the guest did not see.
 */
export function claim(game: Game, player: number, c: Claim): Shot | null {
  const p = game.players[player]
  if (!p || !canAct(game, p)) return null
  if (game.elapsed - p.shotAt < GUN.cooldown - CLAIM.early) return null
  const arena = arenaFor(game.seed)
  const stood = Math.hypot(c.x - p.x, c.z - p.z) <= CLAIM.reach ? collide(arena, { x: c.x, z: c.z }, BODY.radius) : p
  const from = eyeOf(stood)
  const dir = aimDirection(c.yaw, clamp(c.pitch, -PITCH_LIMIT, PITCH_LIMIT))
  p.shotAt = game.elapsed
  let t = rayHit(arena, from, dir, GUN.range)
  let hit = -1
  const victim = c.victim === null ? -1 : game.players.findIndex((q) => q.id === c.victim)
  const q = game.players[victim]
  if (q && victim !== player && isStanding(q)) {
    // The nearest the shot passes to the victim's middle, seen from above.
    const flat = dir.x * dir.x + dir.z * dir.z
    const tq = flat < 1e-9 ? 0 : ((q.x - from.x) * dir.x + (q.z - from.z) * dir.z) / flat
    const passes = along(from, dir, tq)
    const off = Math.hypot(passes.x - q.x, passes.z - q.z)
    if (tq > 0 && tq <= t + BODY.radius && off <= BODY.radius + CLAIM.slack && passes.y >= -CLAIM.slack && passes.y <= BODY.height + CLAIM.slack) {
      t = Math.min(tq, t)
      hit = victim
    }
  }
  const shot = record(game, player, from, along(from, dir, t), hit)
  if (hit >= 0) eliminate(game, hit, player)
  return shot
}

/**
 * A guest says where it is and which way it looks. The host takes the position
 * as far as the guest could have walked since it last heard - with some slack -
 * and not through anything.
 */
export function report(game: Game, player: number, at: Point, yaw: number, pitch: number, since: number): void {
  const p = game.players[player]
  if (!p || !canAct(game, p)) return
  look(game, player, yaw, pitch)
  const dx = at.x - p.x
  const dz = at.z - p.z
  const want = Math.hypot(dx, dz)
  if (want <= 1e-6) return
  const allowed = Math.max(0, since) * BODY.speed * 1.5 + 0.3
  const go = Math.min(want, allowed)
  const to = slide(arenaFor(game.seed), p, (dx / want) * go, (dz / want) * go, BODY.radius)
  p.x = to.x
  p.z = to.z
}

/** The clock, and old shots let go of - on every screen. */
export function tick(game: Game, dt: number): void {
  if (game.over) return
  game.elapsed += Math.min(Math.max(dt, 0), 0.25)
  if (game.shots.length > 0 && game.elapsed - game.shots[0].at > SHOT_LIFE) {
    game.shots = game.shots.filter((s) => game.elapsed - s.at <= SHOT_LIFE)
  }
}

/**
 * Whether the game is over: time is up, nobody is left standing, or there is
 * nobody left to shoot the last one standing. Only the host decides.
 */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const here = game.players.filter((p) => !p.left)
  const standing = here.filter((p) => p.out === null)
  if (clock(game) >= ROUND.limit || standing.length === 0 || here.length <= 1) game.over = true
  return game.over
}

/** One step of the clock, and the end - for the host, or alone. */
export function stepGame(game: Game, dt: number): Game {
  tick(game, dt)
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
 * Everybody, best first, with their place: anybody still standing at the end
 * shares first; then the eliminated, the last to go first; then anybody who left
 * while still standing, the last to leave first.
 */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const key = (p: Player): [number, number] => (p.out !== null ? [1, -p.out] : p.left ? [2, -(p.leftAt ?? 0)] : [0, 0])
  const better = (a: Player, b: Player) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] < kb[1] - 1e-9
  }
  const same = (a: Player, b: Player) => !better(a, b) && !better(b, a)
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => (same(a.player, b.player) ? a.index - b.index : better(a.player, b.player) ? -1 : 1))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => better(other.player, entry.player)).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
