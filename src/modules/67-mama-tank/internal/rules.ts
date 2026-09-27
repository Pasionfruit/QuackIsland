/**
 * The rules of Mama Tank, as arithmetic.
 *
 * **One player drives Mama Tank**, a giant tank that starts on a hill at the
 * middle of the field; everyone else drives a **mini tank**, attacking from
 * below. Both roles share the same controls - WASD, mouse, left click - and
 * both can shoot: Mama Tank's cannon one-shots a mini tank, or eliminates one
 * by driving straight over it; a mini tank's own cannon is quicker but
 * lighter, chipping away at Mama Tank one hit at a time. **The mini tanks win
 * as a team the instant their combined hits on Mama Tank reach twice the
 * player count; otherwise - every mini tank eliminated, or the clock running
 * out first - Mama Tank wins.** The round ends in that same step, no outro to
 * sit through.
 *
 * The multi-shooter shape here is `32-hes-one-shot`'s own `fire()`/`claim()`
 * pattern, generalised: a shot is judged against one *named* victim, not
 * everyone, and a shooter's only legal targets are the other role's own
 * standing bodies - a mini tank's only target is Mama Tank, Mama Tank's only
 * targets are standing mini tanks, no friendly fire either direction. Unlike
 * that game, there is no position-rewind for a claim: a tank is not a
 * fast-dodging target, the same call Jackal already made for its own Sniper.
 *
 * **Running someone over** has no claim or wire message at all - a tank's
 * position is already continuously host-trusted the same way every module
 * here reports movement, so it is a plain host-computed proximity-plus-line-
 * of-sight check every tick, the same shape as `65-big-backs-are-near`'s own
 * `catchHiders()`.
 *
 * No jump, no y/vy for either role - flat 2D movement and collision, the same
 * simplification Big Backs made for its own maze. Mama Tank's hill is a
 * cosmetic set piece only; nothing here ever climbs it. Everything here is
 * pure.
 */
import { arenaFor, collide, lineClear, mamaSpawn, miniSpawn, rayHit, slab, slide, type Point, type Vec3 } from './arena'

export type Role = 'mama' | 'mini'

/**
 * Each role's own size, pace, gun and reach - one place both `eyeOf` and a
 * shot's own geometry read from, keyed by whichever role is asking. **Mama
 * Tank trades speed and rate of fire for a bigger body, a farther-reaching
 * cannon, and running a mini tank down**; a mini tank trades all of that for
 * quickness and a light gun that reloads fast enough to actually punish an
 * opening.
 */
export const MAMA = {
  radius: 2.4,
  height: 2,
  eye: 1.6,
  /** Metres a second: bulk traded for firepower - a little slower than a mini tank's own pace. */
  speed: 3.8,
  /** Seconds between shells: a slow reload on a heavy gun. */
  cooldown: 3.5,
  /** Metres: further than the field is across, either way - a heavy cannon reaches the whole field. */
  range: 150,
} as const

export const MINI = {
  radius: 1,
  height: 0.9,
  eye: 0.75,
  /** Metres a second: quick and light against Mama Tank's own bulk. */
  speed: 5.2,
  /** Seconds between shots: a light, quick-firing cannon. */
  cooldown: 1,
  /** Metres: shorter than Mama Tank's own reach - closing the distance is the whole job. */
  range: 100,
} as const

const statsOf = (role: Role) => (role === 'mama' ? MAMA : MINI)

/**
 * Where a mini tank tries to run Mama Tank down from below: both bodies'
 * radii, plus a small reach - the same shape `65-big-backs-are-near`'s own
 * `CATCH.radius` reasons about, sized up for two vehicle bodies instead of
 * two people.
 */
export const RUNOVER = { radius: MAMA.radius + MINI.radius + 0.6 } as const

export const ROUND = {
  /** The shared three-two-one runs before the round is let go; no countdown of its own. */
  countdown: 0,
  /** Seconds from the start to the end - one of the two ways this round actually ends, not a fallback tie-breaker. */
  limit: 150,
} as const

/** How far up or down anybody can look, radians. */
export const PITCH_LIMIT = 1.35

/** How much slack the host gives a claimed shot: how far the shooter may be from where the host has them, and how early after the last shot it may arrive. */
export const CLAIM = { reach: 1.6, early: 0.3 } as const

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
}

/** The way a player looks, as a unit vector - a camera turned `YXZ` by (pitch, yaw). */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }
}

/** Where a player's eyes are: fixed at their own role's eye height - nobody here ever leaves the ground. */
export function eyeOf(p: Point & { role: Role }): Vec3 {
  return { x: p.x, y: statsOf(p.role).eye, z: p.z }
}

export interface Player {
  id: string
  role: Role
  x: number
  z: number
  yaw: number
  pitch: number
  /** False once a mini tank is eliminated. Always true for Mama Tank - she is never eliminated, only out-scored. */
  alive: boolean
  left: boolean
  leftAt: number | null
  mine: boolean
  bot: boolean
  /** In `elapsed`, when they last fired. */
  shotAt: number
  /** How many of the round's hits on Mama Tank this player landed. Meaningful for a mini tank only. */
  hits: number
}

export interface Round {
  seed: number
  id: number
  mamaId: string
  players: Player[]
  elapsed: number
  hitsOnMama: number
  /** `round(playerCount * 2)`, the whole roster including Mama Tank, fixed at deal time. */
  hitsNeeded: number
  winner: Role | null
  over: boolean
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

/**
 * Who drives Mama Tank this round: whoever the host picked as the 1, if they
 * are actually in the roster, or the roster's own first entry otherwise - the
 * same default the briefing itself falls back to before the host has picked.
 * Identical shape to Jackal's `resolveSniper`/Big Backs' `resolveHunter`.
 */
export function resolveMama(roster: readonly Entrant[], chosen: string | null): string {
  if (chosen !== null && roster.some((e) => e.id === chosen)) return chosen
  return roster[0]?.id ?? ''
}

export function createRound(seed: number, entrants: readonly Entrant[], chosen: string | null, id = 1): Round {
  const mamaId = resolveMama(entrants, chosen)
  const minis = entrants.filter((e) => e.id !== mamaId)
  return {
    seed,
    id,
    mamaId,
    elapsed: 0,
    hitsOnMama: 0,
    hitsNeeded: Math.round(entrants.length * 2),
    winner: entrants.length === 0 ? 'mama' : null,
    over: entrants.length === 0,
    players: entrants.map((e) => {
      const isMama = e.id === mamaId
      if (isMama) {
        const at = mamaSpawn(seed)
        return {
          id: e.id,
          role: 'mama' as const,
          x: at.x,
          z: at.z,
          yaw: at.yaw,
          pitch: -0.05,
          alive: true,
          left: false,
          leftAt: null,
          mine: e.mine ?? false,
          bot: e.bot ?? false,
          shotAt: -MAMA.cooldown,
          hits: 0,
        }
      }
      const index = minis.findIndex((m) => m.id === e.id)
      const at = miniSpawn(seed, minis.length, index)
      return {
        id: e.id,
        role: 'mini' as const,
        x: at.x,
        z: at.z,
        yaw: at.yaw,
        pitch: 0,
        alive: true,
        left: false,
        leftAt: null,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        shotAt: -MINI.cooldown,
        hits: 0,
      }
    }),
  }
}

export function mamaOf(round: Pick<Round, 'players'>): Player | undefined {
  return round.players.find((p) => p.role === 'mama')
}

export function minisOf(round: Pick<Round, 'players'>): Player[] {
  return round.players.filter((p) => p.role === 'mini')
}

/** Standing and in the lobby - can still act, be shot, or run somebody over/be run over. */
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

export interface Intent {
  forward: number
  right: number
}

/** Moves a player for `dt` seconds, relative to where they look - the shared arithmetic both roles move with, at their own role's pace. */
export function walk(round: Round, index: number, intent: Intent, dt: number): void {
  const p = round.players[index]
  if (!p || !canAct(round, p)) return
  const step = Math.min(Math.max(dt, 0), 0.25)
  let f = clamp(intent.forward, -1, 1)
  let r = clamp(intent.right, -1, 1)
  const length = Math.hypot(f, r)
  if (length < 1e-6) return
  if (length > 1) {
    f /= length
    r /= length
  }
  const pace = statsOf(p.role).speed * step
  const fx = -Math.sin(p.yaw)
  const fz = -Math.cos(p.yaw)
  const rx = Math.cos(p.yaw)
  const rz = -Math.sin(p.yaw)
  const at = slide(arenaFor(round.seed), p, (fx * f + rx * r) * pace, (fz * f + rz * r) * pace, statsOf(p.role).radius)
  p.x = at.x
  p.z = at.z
}

/** Seconds until a player can fire again. */
export function cooldownLeft(round: Round, p: Player): number {
  return Math.max(0, statsOf(p.role).cooldown - (round.elapsed - p.shotAt))
}

export function canShoot(round: Round, p: Player): boolean {
  return canAct(round, p) && cooldownLeft(round, p) <= 1e-9
}

/** Whether `victim` is a legal target for a shot fired by `shooterRole`: no friendly fire either direction, only one side to shoot at from either role. */
export function isLegalTarget(shooterRole: Role, victim: Pick<Player, 'role'>): boolean {
  return shooterRole === 'mini' ? victim.role === 'mama' : victim.role === 'mini'
}

/**
 * How far along a ray it meets a standing body at `p` - a cylinder on the
 * floor, `radius` round and `height` tall (a role's own size) - or null if it
 * misses, or meets it only past `maxT`.
 */
export function bodyHit(from: Vec3, dir: Vec3, p: Point, radius: number, height: number, maxT: number): number | null {
  const ox = from.x - p.x
  const oz = from.z - p.z
  const a = dir.x * dir.x + dir.z * dir.z
  let t0 = -Infinity
  let t1 = Infinity
  if (a < 1e-12) {
    if (ox * ox + oz * oz > radius * radius) return null
  } else {
    const b = ox * dir.x + oz * dir.z
    const c = ox * ox + oz * oz - radius * radius
    const disc = b * b - a * c
    if (disc < 0) return null
    const s = Math.sqrt(disc)
    t0 = (-b - s) / a
    t1 = (-b + s) / a
  }
  const ys = slab(from.y, dir.y, 0, height)
  if (!ys) return null
  const enter = Math.max(t0, ys[0], 0)
  const exit = Math.min(t1, ys[1], maxT)
  return enter <= exit ? enter : null
}

/**
 * Where a shot from `from` along `dir` ends, and who it meets first: -1 for
 * nobody. Only ever tests the shooter's own legal targets - a mini tank's
 * only target is Mama Tank, Mama Tank's only targets are standing mini
 * tanks - the two-line role check that replaces He's One Shot's own
 * crew/`allied()` predicate.
 */
export function trace(round: Round, shooterIndex: number, from: Vec3, dir: Vec3): { t: number; hit: number } {
  const shooter = round.players[shooterIndex]
  let t = rayHit(arenaFor(round.seed), from, dir, shooter ? statsOf(shooter.role).range : 0)
  let hit = -1
  if (!shooter) return { t, hit }
  round.players.forEach((p, index) => {
    if (index === shooterIndex || !isStanding(p) || !isLegalTarget(shooter.role, p)) return
    const dims = statsOf(p.role)
    const at = bodyHit(from, dir, p, dims.radius, dims.height, t)
    if (at !== null && (hit < 0 || at < t)) {
      t = at
      hit = index
    }
  })
  return { t, hit }
}

const along = (from: Vec3, dir: Vec3, t: number): Vec3 => ({ x: from.x + dir.x * t, y: from.y + dir.y * t, z: from.z + dir.z * t })

export interface Shot {
  by: number
  from: Vec3
  to: Vec3
  /** Who it hit, by index, or -1. */
  hit: number
}

/**
 * A hit's effect, decided in one place, branching only on the victim's role:
 * on a mini tank, single-hit elimination, no lives; on Mama Tank, the
 * round's own hit count climbs and the shooter's own tally with it. Refuses
 * a stale hit against a victim no longer standing - the same guard `claim`
 * itself checks before ever attempting the geometry test, so a claim racing
 * an intervening elimination can never apply twice.
 */
function applyHit(round: Round, shooterIndex: number, victimIndex: number): boolean {
  const victim = round.players[victimIndex]
  if (!victim || !isStanding(victim)) return false
  if (victim.role === 'mama') {
    round.hitsOnMama += 1
    const shooter = round.players[shooterIndex]
    if (shooter) shooter.hits += 1
  } else {
    victim.alive = false
  }
  return true
}

/**
 * A player pulls the trigger, where they stand and look. Nothing if they
 * cannot fire yet. With `apply` - the host, or alone - whoever it meets is
 * hit; without - a guest, judging its own shot - it only says who that would
 * be.
 */
export function fire(round: Round, index: number, apply = true): Shot | null {
  const p = round.players[index]
  if (!p || !canShoot(round, p)) return null
  const from = eyeOf(p)
  const dir = aimDirection(p.yaw, p.pitch)
  const { t, hit } = trace(round, index, from, dir)
  p.shotAt = round.elapsed
  const shot: Shot = { by: index, from, to: along(from, dir, t), hit }
  if (apply && hit >= 0) applyHit(round, index, hit)
  return shot
}

export interface Claim {
  x: number
  z: number
  yaw: number
  pitch: number
  /** Who the shooter's own screen saw the shot meet, or null for nobody. */
  victim: string | null
}

/**
 * A guest's shot, as its own screen judged it, checked by the host - either
 * role, since Mama Tank is not always the host. The shot is taken from where
 * the guest says it stood, if that is near where the host has it, and
 * otherwise from where the host has it. A hit counts only if the named
 * victim is still standing, a legal target for this shooter's role, and the
 * host's own ray actually reaches them with nothing solid in between - no
 * position-rewind: a tank is not a fast-dodging target, the same call
 * Jackal already made for its own claim path.
 */
export function claim(round: Round, index: number, c: Claim): Shot | null {
  const p = round.players[index]
  if (!p || !canShoot(round, p)) return null
  if (round.elapsed - p.shotAt < statsOf(p.role).cooldown - CLAIM.early) return null
  const arena = arenaFor(round.seed)
  const stood = Math.hypot(c.x - p.x, c.z - p.z) <= CLAIM.reach ? collide(arena, { x: c.x, z: c.z }, statsOf(p.role).radius) : p
  const from = eyeOf({ x: stood.x, z: stood.z, role: p.role })
  const dir = aimDirection(c.yaw, clamp(c.pitch, -PITCH_LIMIT, PITCH_LIMIT))
  p.shotAt = round.elapsed
  let t = rayHit(arena, from, dir, statsOf(p.role).range)
  let hit = -1
  const victim = c.victim === null ? -1 : round.players.findIndex((q) => q.id === c.victim)
  const q = round.players[victim]
  if (q && victim !== index && isStanding(q) && isLegalTarget(p.role, q)) {
    const dims = statsOf(q.role)
    const at = bodyHit(from, dir, q, dims.radius, dims.height, t)
    if (at !== null) {
      t = Math.min(at, t)
      hit = victim
    }
  }
  const shot: Shot = { by: index, from, to: along(from, dir, t), hit }
  if (hit >= 0) applyHit(round, index, hit)
  return shot
}

/**
 * A guest says where it is and which way it looks. The host takes the
 * position as far as the guest could have moved since it last heard, with
 * some slack, and not through anything.
 */
export function report(round: Round, index: number, at: Point, yaw: number, pitch: number, since: number): void {
  const p = round.players[index]
  if (!p || !canAct(round, p)) return
  look(round, index, yaw, pitch)
  const dx = at.x - p.x
  const dz = at.z - p.z
  const want = Math.hypot(dx, dz)
  if (want <= 1e-6) return
  const allowed = Math.max(0, since) * statsOf(p.role).speed * 1.5 + 0.3
  const go = Math.min(want, allowed)
  const to = slide(arenaFor(round.seed), p, (dx / want) * go, (dz / want) * go, statsOf(p.role).radius)
  p.x = to.x
  p.z = to.z
}

/**
 * Whether Mama Tank runs a given mini tank down right now: within
 * `RUNOVER.radius` **and** a clear line through the field - two rocks apart,
 * a mama-tank-sized and mini-tank-sized body's combined radius can exceed a
 * rock's own thickness, so proximity alone could wrongly count a run-over
 * through cover. Host-computed off already-trusted positions; there is no
 * claim to verify.
 */
export function runsOver(round: Round, mama: Player, mini: Player): boolean {
  if (!isStanding(mama) || !isStanding(mini) || mini.role !== 'mini') return false
  if (Math.hypot(mama.x - mini.x, mama.z - mini.z) > RUNOVER.radius) return false
  return lineClear(arenaFor(round.seed), eyeOf(mama), eyeOf(mini))
}

/** Runs over every mini tank Mama Tank can reach this instant. Host-only, every tick, no claim or wire message at all. */
export function runOver(round: Round): string[] {
  const mama = mamaOf(round)
  if (!mama || !isStanding(mama)) return []
  const caught: string[] = []
  for (const p of minisOf(round)) {
    if (isStanding(p) && runsOver(round, mama, p)) {
      p.alive = false
      caught.push(p.id)
    }
  }
  return caught
}

export function tick(round: Round, dt: number): void {
  if (round.over) return
  round.elapsed += Math.min(Math.max(dt, 0), 0.25)
}

/**
 * Only the host decides, in an order that is never ambiguous about who left
 * and who won:
 *
 * 1. **Mama Tank has left** - nobody left to stop the mini tanks - they win
 *    outright. Checked first and on its own, the same unambiguous ruling
 *    Big Backs already applies to its own Hunter-leaves case, not Jackal's
 *    original, more confusing one.
 * 2. **`hitsOnMama` has reached `hitsNeeded`** - the mini tanks win as a
 *    team, the instant it happens.
 * 3. **No mini tank is still standing** - Mama Tank wins.
 * 4. **The clock has run out** - Mama Tank wins too: the brief's own
 *    "otherwise Mama Tank wins," one of the two ways this round actually
 *    ends, not a fallback tie-breaker.
 *
 * Winner and `over` are set in the same step the condition is met - no
 * outro to sit through.
 */
export function judgeEnd(round: Round): boolean {
  if (round.over) return true
  const mama = mamaOf(round)
  const minis = minisOf(round)
  if (mama && mama.left) {
    round.winner = 'mini'
    round.over = true
  } else if (round.hitsOnMama >= round.hitsNeeded) {
    round.winner = 'mini'
    round.over = true
  } else if (minis.length > 0 && minis.every((p) => p.left || !p.alive)) {
    round.winner = 'mama'
    round.over = true
  } else if (round.elapsed >= ROUND.limit) {
    round.winner = 'mama'
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

/** One step of the clock, run-over, and the end - for the host, or alone. */
export function stepRound(round: Round, dt: number): Round {
  tick(round, dt)
  runOver(round)
  judgeEnd(round)
  return round
}

/** Everybody, Mama Tank first, for a results card: role, alive/eliminated, hits contributed. */
export function summarize(round: Round): { player: Player; index: number }[] {
  return round.players.map((player, index) => ({ player, index })).sort((a, b) => (a.player.role === b.player.role ? 0 : a.player.role === 'mama' ? -1 : 1))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
