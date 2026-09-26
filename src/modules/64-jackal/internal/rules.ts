/**
 * The rules of Jackal, as arithmetic.
 *
 * **One player is the Sniper**, alone on top of a tower; everybody else is a
 * **Runner**, rushing the tower from a spawn line at the other end of the
 * lane, through crates, barrels and trees for cover. The Sniper's aiming laser
 * is traced every tick, hit or miss, so it is always visible to everybody -
 * that is what lets a runner see the danger and move. The Sniper has
 * `round(playerCount * 1.5)` bullets before being forced to reload, and can
 * unscope to move at full speed at the cost of a wider, less precise view.
 * Each runner has two lives: a hit costs one and buys a brief invulnerable
 * window, not a knockback or a respawn. **The Sniper wins by eliminating
 * every runner; the Runners win the instant one of them reaches the tower's
 * base** - the round ends in the same step, no outro to sit through.
 *
 * No three.js, no React, no clock of its own. Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import {
  FIELD,
  SPAWN_Z,
  TOWER_Z,
  arenaFor,
  atBase,
  clampToPlatform,
  rayHit,
  runnerSpawn,
  slab,
  slide,
  sniperSpawn,
  type Point,
  type Vec3,
} from './arena'

export type Role = 'sniper' | 'runner'

export const BODY = {
  radius: PLAYER.radius,
  height: PLAYER.height,
  eye: PLAYER.eyeHeight,
} as const

export const RUNNER = {
  /** Metres a second: a determined rush, quicker than the island's own walk. */
  speed: 6.4,
} as const

export const SNIPER = {
  /** Metres a second, unscoped, walking the platform. */
  moveSpeed: 4.2,
  /** What is left of that while scoped in: the trade-off for a steadier, narrower view. */
  scopedMoveFrac: 0.12,
} as const

/**
 * A jump goes up at `speed` under `gravity`, apex `speed² / 2 gravity` ≈ 1.44 m:
 * clear of the short cover (`crateHeight`, `barrelHeight`) with room to spare, and
 * well under the tall cover (`treeHeight`), which nothing jumps.
 */
export const JUMP = { speed: 7.2, gravity: 18, max: 1.44 } as const

export const LIVES_START = 2

/** Seconds a runner cannot lose another life for, once they have taken a hit. */
export const INVULN = { window: 1.5 } as const

export const GUN = {
  /** Seconds between shots. */
  cooldown: 0.4,
  /** How far a shot reaches: further than the lane is long. */
  range: 140,
  /** Seconds a forced reload takes, once the last bullet is spent. */
  reload: 2.4,
} as const

export const ROUND = {
  /** The shared three-two-one runs before the game is let go; no countdown of its own. */
  countdown: 0,
  /** Safety net: however the standoff sits, the round ends here - the Sniper's defence holds. */
  limit: 150,
} as const

/** How far up or down anybody can look, radians. */
export const PITCH_LIMIT = 1.35

/** How much slack the host gives a sniper's shot claim, taken on trust no further than this. */
export const CLAIM = { reach: 1.2, slack: 0.9, early: 0.3 } as const

export interface Player {
  id: string
  role: Role
  x: number
  z: number
  /** Feet off the ground - fixed at the platform's height for the sniper, who never falls. */
  y: number
  vy: number
  yaw: number
  pitch: number
  alive: boolean
  /** Runner-only, meaningfully: starts at `LIVES_START`. */
  lives: number
  /** In `elapsed`: no further life lost to a hit before this. */
  invulnerableUntil: number
  /** Runner-only: crossed into the tower's base zone. */
  reachedBase: boolean
  /** Sniper-only: starts at `round(playerCount * 1.5)`. */
  bullets: number
  /** Sniper-only, in `elapsed`: 0 while not reloading. */
  reloadingUntil: number
  /** Sniper-only: narrows the view and cuts movement to `SNIPER.scopedMoveFrac`. */
  scoped: boolean
  /** In `elapsed`, when they last fired. */
  shotAt: number
  mine: boolean
  bot: boolean
  left: boolean
  leftAt: number | null
}

export interface Round {
  seed: number
  id: number
  sniperId: string
  players: Player[]
  elapsed: number
  winner: Role | null
  over: boolean
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
}

/** The way a player looks, as a unit vector - a camera turned `YXZ` by (pitch, yaw). */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }
}

/** Where a player's eyes are: a body's eye height above their feet. */
export function eyeOf(p: Point & { y?: number }): Vec3 {
  return { x: p.x, y: BODY.eye + (p.y ?? 0), z: p.z }
}

/**
 * Who is the Sniper for this round: whoever the host picked as the 1, if they
 * are actually in the roster, or the roster's own first entry otherwise - the
 * same default the briefing itself falls back to before the host has picked.
 */
export function resolveSniper(roster: readonly Entrant[], chosen: string | null): string {
  if (chosen !== null && roster.some((e) => e.id === chosen)) return chosen
  return roster[0]?.id ?? ''
}

export function createRound(seed: number, entrants: readonly Entrant[], chosen: string | null, id = 1): Round {
  const sniperId = resolveSniper(entrants, chosen)
  const bullets = magazineSize(entrants.length)
  const runners = entrants.filter((e) => e.id !== sniperId)
  return {
    seed,
    id,
    sniperId,
    elapsed: 0,
    winner: entrants.length === 0 ? 'sniper' : null,
    over: entrants.length === 0,
    players: entrants.map((e) => {
      const isSniper = e.id === sniperId
      if (isSniper) {
        const at = sniperSpawn()
        return {
          id: e.id,
          role: 'sniper' as const,
          x: at.x,
          z: at.z,
          y: at.y,
          vy: 0,
          yaw: at.yaw,
          pitch: -0.15,
          alive: true,
          lives: LIVES_START,
          invulnerableUntil: 0,
          reachedBase: false,
          bullets,
          reloadingUntil: 0,
          scoped: false,
          shotAt: -GUN.cooldown,
          mine: e.mine ?? false,
          bot: e.bot ?? false,
          left: false,
          leftAt: null,
        }
      }
      const index = runners.findIndex((r) => r.id === e.id)
      const at = runnerSpawn(seed, runners.length, index)
      return {
        id: e.id,
        role: 'runner' as const,
        x: at.x,
        z: at.z,
        y: 0,
        vy: 0,
        yaw: at.yaw,
        pitch: 0,
        alive: true,
        lives: LIVES_START,
        invulnerableUntil: 0,
        reachedBase: false,
        bullets: 0,
        reloadingUntil: 0,
        scoped: false,
        shotAt: -Infinity,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        left: false,
        leftAt: null,
      }
    }),
  }
}

export function sniperOf(round: Pick<Round, 'players'>): Player | undefined {
  return round.players.find((p) => p.role === 'sniper')
}

export function runnersOf(round: Pick<Round, 'players'>): Player[] {
  return round.players.filter((p) => p.role === 'runner')
}

/** Standing and in the lobby - can still act, be shot, or reach base. */
export function isStanding(p: Player): boolean {
  return p.alive && !p.left
}

export function canAct(round: Round, p: Player): boolean {
  return !round.over && !p.left && p.alive
}

export function look(round: Round, index: number, yaw: number, pitch: number): void {
  const p = round.players[index]
  if (!p || p.left) return
  p.yaw = wrapAngle(yaw)
  p.pitch = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT)
}

export interface RunnerIntent {
  forward: number
  right: number
  jump?: boolean
}

/** Moves a runner for `dt` seconds, WASD relative to where they look, with a jump that vaults short cover. */
export function walkRunner(round: Round, index: number, intent: RunnerIntent, dt: number): void {
  const p = round.players[index]
  if (!p || p.role !== 'runner' || !canAct(round, p)) return
  const step = Math.min(Math.max(dt, 0), 0.25)
  if (intent.jump && p.y <= 1e-9 && p.vy <= 0) p.vy = JUMP.speed
  if (p.y > 0 || p.vy > 0) {
    p.vy -= JUMP.gravity * step
    p.y = Math.max(0, p.y + p.vy * step)
    if (p.y <= 1e-9) {
      p.y = 0
      p.vy = 0
    }
  }
  let f = clamp(intent.forward, -1, 1)
  let r = clamp(intent.right, -1, 1)
  const length = Math.hypot(f, r)
  if (length < 1e-6) {
    checkBase(p)
    return
  }
  if (length > 1) {
    f /= length
    r /= length
  }
  const pace = RUNNER.speed * step
  const fx = -Math.sin(p.yaw)
  const fz = -Math.cos(p.yaw)
  const rx = Math.cos(p.yaw)
  const rz = -Math.sin(p.yaw)
  const at = slide(arenaFor(round.seed), p, (fx * f + rx * r) * pace, (fz * f + rz * r) * pace, BODY.radius, p.y)
  p.x = at.x
  p.z = at.z
  checkBase(p)
}

function checkBase(p: Player): void {
  if (p.role === 'runner' && !p.reachedBase && atBase(p.x, p.z)) p.reachedBase = true
}

export interface SniperIntent {
  forward: number
  right: number
}

/** Moves the Sniper round the tower's platform - slowed hard while scoped in. */
export function moveSniper(round: Round, index: number, intent: SniperIntent, dt: number): void {
  const p = round.players[index]
  if (!p || p.role !== 'sniper' || !canAct(round, p)) return
  const step = Math.min(Math.max(dt, 0), 0.25)
  let f = clamp(intent.forward, -1, 1)
  let r = clamp(intent.right, -1, 1)
  const length = Math.hypot(f, r)
  if (length < 1e-6) return
  if (length > 1) {
    f /= length
    r /= length
  }
  const speed = SNIPER.moveSpeed * (p.scoped ? SNIPER.scopedMoveFrac : 1)
  const pace = speed * step
  const fx = -Math.sin(p.yaw)
  const fz = -Math.cos(p.yaw)
  const rx = Math.cos(p.yaw)
  const rz = -Math.sin(p.yaw)
  const at = clampToPlatform({ x: p.x + (fx * f + rx * r) * pace, z: p.z + (fz * f + rz * r) * pace })
  p.x = at.x
  p.z = at.z
}

export function toggleScope(round: Round, index: number, scoped: boolean): void {
  const p = round.players[index]
  if (!p || p.role !== 'sniper' || !canAct(round, p)) return
  p.scoped = scoped
}

export function cooldownLeft(round: Round, p: Player): number {
  return Math.max(0, GUN.cooldown - (round.elapsed - p.shotAt))
}

export function reloading(round: Round, p: Player): boolean {
  return round.elapsed < p.reloadingUntil
}

/**
 * How many bullets a full magazine holds - fixed for the round at
 * `round(playerCount * 1.5)`. `round.players` never shrinks (somebody who
 * leaves is marked `left`, not removed), so this is stable to recompute from
 * its length rather than carry as a field of its own - one less thing for
 * the wire to agree on.
 */
export function magazineSize(playerCount: number): number {
  return Math.round(playerCount * 1.5)
}

export function canShoot(round: Round, p: Player): boolean {
  return canAct(round, p) && p.role === 'sniper' && p.bullets > 0 && !reloading(round, p) && cooldownLeft(round, p) <= 1e-9
}

/**
 * How far along a ray it meets a standing body at `p` - a cylinder on the
 * floor - or null if it misses, or meets it only past `maxT`.
 */
export function bodyHit(from: Vec3, dir: Vec3, p: Point & { y?: number }, maxT: number): number | null {
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
  const feet = p.y ?? 0
  const ys = slab(from.y, dir.y, feet, feet + BODY.height)
  if (!ys) return null
  const enter = Math.max(t0, ys[0], 0)
  const exit = Math.min(t1, ys[1], maxT)
  return enter <= exit ? enter : null
}

/** Where a shot or the laser from `from` along `dir` ends, and who it meets first: -1 for nobody. */
export function trace(round: Round, from: Vec3, dir: Vec3): { t: number; hit: number } {
  let t = rayHit(arenaFor(round.seed), from, dir, GUN.range)
  let hit = -1
  round.players.forEach((p, index) => {
    if (p.role !== 'runner' || !isStanding(p)) return
    const at = bodyHit(from, dir, p, t)
    if (at !== null && (hit < 0 || at < t)) {
      t = at
      hit = index
    }
  })
  return { t, hit }
}

const along = (from: Vec3, dir: Vec3, t: number): Vec3 => ({ x: from.x + dir.x * t, y: from.y + dir.y * t, z: from.z + dir.z * t })

/**
 * The Sniper's aiming laser, this instant, whether or not the trigger is
 * pulled: from their eyes, the way they look, to whatever it meets first -
 * cover, a runner, or nothing. Traced every tick, so it is a pure function of
 * the round, and every screen agrees on it without a wire message of its own.
 */
export function laserOf(round: Round): { from: Vec3; to: Vec3; hit: string | null } | null {
  const sniper = sniperOf(round)
  if (!sniper || !isStanding(sniper)) return null
  const from = eyeOf(sniper)
  const dir = aimDirection(sniper.yaw, sniper.pitch)
  const { t, hit } = trace(round, from, dir)
  return { from, to: along(from, dir, t), hit: hit >= 0 ? round.players[hit].id : null }
}

/** A runner takes a hit: a life lost, unless still inside the invulnerable window from the last one. */
function applyHit(round: Round, index: number): boolean {
  const p = round.players[index]
  if (!p || p.role !== 'runner' || !isStanding(p)) return false
  if (round.elapsed < p.invulnerableUntil) return false
  p.lives -= 1
  if (p.lives <= 0) {
    p.lives = 0
    p.alive = false
  } else {
    p.invulnerableUntil = round.elapsed + INVULN.window
  }
  return true
}

/** The Sniper pulls the trigger. A bullet is spent whether it hits or misses; empty forces a reload. */
export function fire(round: Round, index: number, apply = true): { hit: number } | null {
  const p = round.players[index]
  if (!p || !canShoot(round, p)) return null
  const from = eyeOf(p)
  const dir = aimDirection(p.yaw, p.pitch)
  const { hit } = trace(round, from, dir)
  p.shotAt = round.elapsed
  p.bullets -= 1
  if (p.bullets <= 0) {
    p.bullets = 0
    p.reloadingUntil = round.elapsed + GUN.reload
  }
  if (apply && hit >= 0) applyHit(round, hit)
  return { hit }
}

export interface Claim {
  x: number
  z: number
  yaw: number
  pitch: number
  /** Who the sniper's own screen saw the shot meet, or null. */
  victim: string | null
}

/**
 * A guest sniper's shot, judged by the host: taken from where they say they
 * stood if that is near the platform, aimed the way they say, and a claimed
 * hit counts only if the host's own trace agrees the ray reaches that runner
 * with nothing solid in between.
 */
export function claim(round: Round, index: number, c: Claim): { hit: number } | null {
  const p = round.players[index]
  if (!p || !canShoot(round, p)) return null
  const stood = Math.hypot(c.x - p.x, c.z - p.z) <= CLAIM.reach ? clampToPlatform({ x: c.x, z: c.z }) : p
  const from = eyeOf({ x: stood.x, z: stood.z, y: p.y })
  const dir = aimDirection(c.yaw, clamp(c.pitch, -PITCH_LIMIT, PITCH_LIMIT))
  p.shotAt = round.elapsed
  p.bullets -= 1
  if (p.bullets <= 0) {
    p.bullets = 0
    p.reloadingUntil = round.elapsed + GUN.reload
  }
  const arena = arenaFor(round.seed)
  let t = rayHit(arena, from, dir, GUN.range)
  let hit = -1
  const victim = c.victim === null ? -1 : round.players.findIndex((q) => q.id === c.victim)
  const q = round.players[victim]
  if (q && q.role === 'runner' && isStanding(q)) {
    const at = bodyHit(from, dir, q, t)
    if (at !== null) {
      t = Math.min(at, t)
      hit = victim
    }
  }
  if (hit >= 0) applyHit(round, hit)
  return { hit }
}

/** A guest says where it is and which way it looks; the host moves it only as far as it could have got since it last heard. */
/**
 * A guest says where it is, how high, and which way it looks - its own local
 * copy has already run `walkRunner`/`moveSniper` and its own jump, the same
 * as `32-hes-one-shot`'s guests do. The host takes the position only as far
 * as it could have walked since it last heard, and the height only as high as
 * a jump goes, and re-collides both against its own arena.
 */
export function report(round: Round, index: number, at: Point, yaw: number, pitch: number, since: number, y: number, scoped: boolean): void {
  const p = round.players[index]
  if (!p || !canAct(round, p)) return
  look(round, index, yaw, pitch)
  if (p.role === 'sniper') {
    p.scoped = scoped
    const clamped = clampToPlatform(at)
    p.x = clamped.x
    p.z = clamped.z
    return
  }
  p.y = clamp(Number.isFinite(y) ? y : 0, 0, JUMP.max)
  const dx = at.x - p.x
  const dz = at.z - p.z
  const want = Math.hypot(dx, dz)
  if (want <= 1e-6) {
    checkBase(p)
    return
  }
  const allowed = Math.max(0, since) * RUNNER.speed * 1.5 + 0.3
  const go = Math.min(want, allowed)
  const to = slide(arenaFor(round.seed), p, (dx / want) * go, (dz / want) * go, BODY.radius, p.y)
  p.x = to.x
  p.z = to.z
  checkBase(p)
}

/** Once a forced reload's time is up, the magazine is full again - nothing else refills it. */
function resupply(round: Round): void {
  const full = magazineSize(round.players.length)
  for (const p of round.players) {
    if (p.role === 'sniper' && p.reloadingUntil > 0 && round.elapsed >= p.reloadingUntil) {
      p.bullets = full
      p.reloadingUntil = 0
    }
  }
}

export function tick(round: Round, dt: number): void {
  if (round.over) return
  round.elapsed += Math.min(Math.max(dt, 0), 0.25)
  resupply(round)
}

/** Only the host decides. Ends the instant a runner reaches base, or the last one goes down - same step, no outro. */
export function judgeEnd(round: Round): boolean {
  if (round.over) return true
  const sniper = sniperOf(round)
  const runners = runnersOf(round).filter((p) => !p.left)
  if (runners.some((p) => p.reachedBase)) {
    round.winner = 'runner'
    round.over = true
  } else if (runners.length === 0 || runners.every((p) => !p.alive) || (sniper && sniper.left)) {
    round.winner = 'sniper'
    round.over = true
  } else if (round.elapsed >= ROUND.limit) {
    round.winner = 'sniper'
    round.over = true
  }
  return round.over
}

export function leave(round: Round, index: number): void {
  const p = round.players[index]
  if (!p || p.left || round.over) return
  p.leftAt = round.elapsed
  p.left = true
}

/** One step of the clock and the end, for the host, or alone. */
export function stepRound(round: Round, dt: number): Round {
  tick(round, dt)
  judgeEnd(round)
  return round
}

/** Everybody, sniper first, for a results card: role, alive/eliminated, lives left or reached-base. */
export function summarize(round: Round): { player: Player; index: number }[] {
  return round.players.map((player, index) => ({ player, index })).sort((a, b) => (a.player.role === b.player.role ? 0 : a.player.role === 'sniper' ? -1 : 1))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const

export { SPAWN_Z, TOWER_Z, FIELD }
