/**
 * The rules of Big Backs are Near, as arithmetic.
 *
 * **One player is the near-sighted Hunter**, dropped at the middle of a large
 * corn maze; everybody else is a **Hider**, scattered from a pen near one
 * edge. Hiders are much slower than the Hunter, so the maze - not speed - is
 * what keeps them alive: threading corn rows, and going properly still the
 * moment the chase gets close, since **standing still is the only way to
 * make no sound at all**. The Hunter can sprint to cover ground fast, at the
 * cost of hearing nothing while they do it. **The Hunter wins the instant
 * every Hider is caught or gone; the Hiders win as a team the instant the
 * clock runs out with at least one of them still free** - the round ends in
 * that same step, no outro to sit through.
 *
 * No jump, no vault, no y/vy at all: the brief lists no such control for
 * either role, so movement is flat 2D against the maze, closer to
 * `16-zombie-tag`'s simple circle-vs-box model than Jackal's height-aware
 * one. No three.js, no React, no clock of its own. Everything here is pure.
 */
import { PLAYER } from '../../02-player'
import { hiderSpawn, hunterSpawn, lineClear, mazeFor, slide, type Maze, type Point, type Vec3 } from './maze'

export type Role = 'hunter' | 'hider'

export const BODY = {
  radius: PLAYER.radius,
  eye: PLAYER.eyeHeight,
} as const

export const HIDER = {
  /** Metres a second: clearly slower than even the Hunter's own walk. */
  speed: 3.6,
} as const

export const HUNTER = {
  moveSpeed: 5.0,
  sprintSpeed: 8.0,
  /**
   * Metres a fresh footstep carries, no line-of-sight required - sound
   * carries round a corn row. Tighter than this and near-sightedness would
   * have no bite; wider and there would be nothing left to be near-sighted
   * about.
   */
  hearing: 13,
  /** Metres of clear render distance - tighter than hearing: you hear farther than you see, the whole point of "near-sighted". */
  sightRadius: 9,
} as const

/** Metres a Hider has to actually cover before a footstep fires. Standing still fires none at all. */
export const STRIDE = 1.2

export const CATCH = { radius: 1.3 } as const

export const ROUND = {
  /** The shared three-two-one runs before the round is let go; no countdown of its own. */
  countdown: 0,
  /** The brief's own 1.25 minutes - not a fallback tie-breaker, one of the two ways this round actually ends. */
  limit: 75,
} as const

/** How far up or down anybody can look, radians. */
export const PITCH_LIMIT = 1.35

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
}

/** The way a player looks, as a unit vector - a camera turned `YXZ` by (pitch, yaw). */
export function aimDirection(yaw: number, pitch: number): Vec3 {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }
}

/** Where a player's eyes are: a fixed eye height above the ground - nobody here ever leaves it. */
export function eyeOf(p: Point): Vec3 {
  return { x: p.x, y: BODY.eye, z: p.z }
}

export interface Player {
  id: string
  role: Role
  x: number
  z: number
  yaw: number
  pitch: number
  /** False once a Hider is caught. Always true for the Hunter. */
  alive: boolean
  left: boolean
  leftAt: number | null
  mine: boolean
  bot: boolean
  /** Hunter-only: drives speed, and mutes hearing entirely while held. */
  sprinting: boolean
  /** Hider-only bookkeeping: metres actually covered since the last footstep. */
  distanceSinceStep: number
  /** In `elapsed`, when a footstep last fired - `-Infinity` for nobody yet, and always for the Hunter. */
  steppedAt: number
}

export interface Round {
  seed: number
  id: number
  hunterId: string
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

/**
 * Who is the Hunter for this round: whoever the host picked as the 1, if
 * they are actually in the roster, or the roster's own first entry otherwise
 * - the same default the briefing itself falls back to before the host has
 * picked. Identical shape to Jackal's `resolveSniper`.
 */
export function resolveHunter(roster: readonly Entrant[], chosen: string | null): string {
  if (chosen !== null && roster.some((e) => e.id === chosen)) return chosen
  return roster[0]?.id ?? ''
}

export function createRound(seed: number, entrants: readonly Entrant[], chosen: string | null, id = 1): Round {
  const hunterId = resolveHunter(entrants, chosen)
  const hiders = entrants.filter((e) => e.id !== hunterId)
  return {
    seed,
    id,
    hunterId,
    elapsed: 0,
    winner: entrants.length === 0 ? 'hunter' : null,
    over: entrants.length === 0,
    players: entrants.map((e) => {
      const isHunter = e.id === hunterId
      if (isHunter) {
        const at = hunterSpawn(seed)
        return {
          id: e.id,
          role: 'hunter' as const,
          x: at.x,
          z: at.z,
          yaw: at.yaw,
          pitch: -0.1,
          alive: true,
          left: false,
          leftAt: null,
          mine: e.mine ?? false,
          bot: e.bot ?? false,
          sprinting: false,
          distanceSinceStep: 0,
          steppedAt: -Infinity,
        }
      }
      const index = hiders.findIndex((h) => h.id === e.id)
      const at = hiderSpawn(seed, hiders.length, index)
      return {
        id: e.id,
        role: 'hider' as const,
        x: at.x,
        z: at.z,
        yaw: at.yaw,
        pitch: 0,
        alive: true,
        left: false,
        leftAt: null,
        mine: e.mine ?? false,
        bot: e.bot ?? false,
        sprinting: false,
        distanceSinceStep: 0,
        steppedAt: -Infinity,
      }
    }),
  }
}

export function hunterOf(round: Pick<Round, 'players'>): Player | undefined {
  return round.players.find((p) => p.role === 'hunter')
}

export function hidersOf(round: Pick<Round, 'players'>): Player[] {
  return round.players.filter((p) => p.role === 'hider')
}

/** Standing and in the lobby - can still act or be caught. */
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
  /** Hunter-only: Shift is held. */
  sprint?: boolean
}

/** Moves a body of `radius` relative to where it looks, sliding round the maze - the shared arithmetic both roles move with. */
function moveRelative(maze: Maze, p: { x: number; z: number; yaw: number }, intent: Intent, pace: number): Point {
  let f = clamp(intent.forward, -1, 1)
  let r = clamp(intent.right, -1, 1)
  const length = Math.hypot(f, r)
  if (length < 1e-6) return { x: p.x, z: p.z }
  if (length > 1) {
    f /= length
    r /= length
  }
  const fx = -Math.sin(p.yaw)
  const fz = -Math.cos(p.yaw)
  const rx = Math.cos(p.yaw)
  const rz = -Math.sin(p.yaw)
  return slide(maze, p, (fx * f + rx * r) * pace, (fz * f + rz * r) * pace, BODY.radius)
}

/**
 * The footstep bookkeeping shared by a Hider's own local move and a guest
 * Hider's host-clamped `report`: **actually covered** ground only, never the
 * requested distance, so a slide stopped dead by a corn row logs nothing.
 * Crossing `STRIDE` resets the accumulator and stamps `steppedAt` - a pure,
 * host-derivable event off a position already trusted either way.
 */
function registerStep(p: Player, round: Round, moved: number): void {
  if (moved <= 1e-9) return
  p.distanceSinceStep += moved
  if (p.distanceSinceStep >= STRIDE) {
    p.distanceSinceStep = 0
    p.steppedAt = round.elapsed
  }
}

/**
 * Moves a Hider for `dt` seconds. Standing still moves nothing and fires no
 * footstep at all - **stillness is how you actually hide.**
 */
export function walkHider(round: Round, index: number, intent: Intent, dt: number): void {
  const p = round.players[index]
  if (!p || p.role !== 'hider' || !canAct(round, p)) return
  const step = Math.min(Math.max(dt, 0), 0.25)
  const pace = HIDER.speed * step
  const at = moveRelative(mazeFor(round.seed), p, intent, pace)
  const moved = Math.hypot(at.x - p.x, at.z - p.z)
  p.x = at.x
  p.z = at.z
  registerStep(p, round, moved)
}

/** Moves the Hunter for `dt` seconds. Sprinting is faster, and mutes hearing entirely for as long as it is held. */
export function walkHunter(round: Round, index: number, intent: Intent, dt: number): void {
  const p = round.players[index]
  if (!p || p.role !== 'hunter' || !canAct(round, p)) return
  const step = Math.min(Math.max(dt, 0), 0.25)
  p.sprinting = !!intent.sprint
  const pace = (p.sprinting ? HUNTER.sprintSpeed : HUNTER.moveSpeed) * step
  const at = moveRelative(mazeFor(round.seed), p, intent, pace)
  p.x = at.x
  p.z = at.z
}

/**
 * A guest says where it is and which way it looks - its own local copy has
 * already run `walkHunter`/`walkHider`, the same as Jackal's guests do. The
 * host takes the position only as far as it could have walked since it last
 * heard, and re-collides it against its own maze - the same shape as
 * Jackal's own `report`. A guest Hider's footstep bookkeeping runs here too,
 * off the actually-allowed distance, so a footstep the Hunter hears is
 * exactly as host-derivable for a networked Hider as for a bot or the host's
 * own body.
 */
export function report(round: Round, index: number, at: Point, yaw: number, pitch: number, since: number, sprint: boolean): void {
  const p = round.players[index]
  if (!p || !canAct(round, p)) return
  look(round, index, yaw, pitch)
  const speed = p.role === 'hunter' ? (sprint ? HUNTER.sprintSpeed : HUNTER.moveSpeed) : HIDER.speed
  if (p.role === 'hunter') p.sprinting = sprint
  const dx = at.x - p.x
  const dz = at.z - p.z
  const want = Math.hypot(dx, dz)
  if (want <= 1e-6) return
  const allowed = Math.max(0, since) * speed * 1.5 + 0.3
  const go = Math.min(want, allowed)
  const to = slide(mazeFor(round.seed), p, (dx / want) * go, (dz / want) * go, BODY.radius)
  const moved = Math.hypot(to.x - p.x, to.z - p.z)
  p.x = to.x
  p.z = to.z
  if (p.role === 'hider') registerStep(p, round, moved)
}

/**
 * The hearing radius the Hunter is actually listening with, this instant:
 * the full range while quiet, and **nothing at all while sprinting** - the
 * one deliberate mechanic beyond a literal reading of the brief, so Sprint is
 * a real choice (cover ground fast, or stop and listen) rather than a
 * strictly-dominant always-on toggle. See `MODULE.md` for why.
 */
export function hearingRadius(hunter: Pick<Player, 'sprinting'>): number {
  return hunter.sprinting ? 0 : HUNTER.hearing
}

export interface Ping {
  hiderId: string
  /** Metres away. */
  distance: number
  /** Radians, world yaw from the Hunter to the Hider - the HUD turns this into a bearing round the crosshair. */
  bearing: number
}

/**
 * How long a footstep stays "fresh" for HUD/audio purposes once it fires.
 *
 * Not an exact-tick match: the host only broadcasts a snapshot every
 * `SEND_MS` (see `wire.ts`), so a guest Hunter's screen sees `steppedAt`
 * arrive already a beat old, and a window - long enough to survive that gap,
 * short enough to still read as "just now" - is what makes the ping land the
 * same on every screen regardless of who is computing it.
 */
export const HEAR_WINDOW = 0.4

/**
 * Every footstep the Hunter can actually hear right now: a Hider whose last
 * `steppedAt` is within `HEAR_WINDOW` and `hearingRadius`. No line of sight
 * required - sound carries round a corn row. Pure off state everyone already
 * has, so every screen that computes it agrees without a wire message of its
 * own - and reading the Hunter's own local `sprinting` (see `report`/`mine`
 * handling in `wire.ts`) rather than a delayed echo of it is what keeps a
 * step taken mid-sprint muted even if the snapshot carrying it arrives a beat
 * after Shift was released.
 */
export function hearFootsteps(round: Round): Ping[] {
  const hunter = hunterOf(round)
  if (!hunter || !isStanding(hunter)) return []
  const radius = hearingRadius(hunter)
  if (radius <= 0) return []
  const out: Ping[] = []
  for (const p of hidersOf(round)) {
    if (!isStanding(p)) continue
    const since = round.elapsed - p.steppedAt
    if (since < 0 || since > HEAR_WINDOW) continue
    const dx = p.x - hunter.x
    const dz = p.z - hunter.z
    const distance = Math.hypot(dx, dz)
    if (distance > radius) continue
    out.push({ hiderId: p.id, distance, bearing: wrapAngle(Math.atan2(-dx, -dz) - hunter.yaw) })
  }
  return out
}

/**
 * Whether the Hunter catches a given Hider right now: within `CATCH.radius`
 * **and** a clear line through the maze - unlike Zombie Tag's open arena, a
 * maze puts a Hider one corn row over well within a flat radius check, and
 * that must never count. Host-computed every tick off already-trusted
 * positions; there is no claim to verify.
 */
export function catches(round: Round, hunter: Player, hider: Player): boolean {
  if (!isStanding(hunter) || !isStanding(hider) || hider.role !== 'hider') return false
  if (Math.hypot(hunter.x - hider.x, hunter.z - hider.z) > CATCH.radius) return false
  return lineClear(mazeFor(round.seed), eyeOf(hunter), eyeOf(hider))
}

/** Catches every Hider the Hunter can reach this instant. Host-only. */
export function catchHiders(round: Round): string[] {
  const hunter = hunterOf(round)
  if (!hunter || !isStanding(hunter)) return []
  const caught: string[] = []
  for (const p of hidersOf(round)) {
    if (isStanding(p) && catches(round, hunter, p)) {
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
 * 1. **The Hunter has left** - nobody left to catch anyone - the Hiders win
 *    outright. Checked first and on its own, unlike the equivalent case in
 *    Jackal's own `judgeEnd` (a departed sniper folded into "every runner
 *    down"), which reads confusingly for exactly this reason.
 * 2. **Every Hider is caught or gone** - the Hunter wins. This is also what
 *    covers "all Hiders left": a departed Hider counts the same as a caught
 *    one here, so there is no separate branch for it.
 * 3. **The clock has run out** with at least one Hider still free - the
 *    Hiders win as a team.
 *
 * Winner and `over` are set in the same step the condition is met - no
 * outro to sit through.
 */
export function judgeEnd(round: Round): boolean {
  if (round.over) return true
  const hunter = hunterOf(round)
  const hiders = hidersOf(round)
  if (hunter && hunter.left) {
    round.winner = 'hider'
    round.over = true
  } else if (hiders.length > 0 && hiders.every((p) => p.left || !p.alive)) {
    round.winner = 'hunter'
    round.over = true
  } else if (round.elapsed >= ROUND.limit) {
    round.winner = hiders.some((p) => isStanding(p)) ? 'hider' : 'hunter'
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
  catchHiders(round)
  judgeEnd(round)
  return round
}

/** Everybody, the Hunter first, for a results card: role and outcome. */
export function summarize(round: Round): { player: Player; index: number }[] {
  return round.players.map((player, index) => ({ player, index })).sort((a, b) => (a.player.role === b.player.role ? 0 : a.player.role === 'hunter' ? -1 : 1))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8414b', '#2f7fe0', '#f2b019', '#34b34a', '#9b5de5', '#f07b1f', '#1fb5ab', '#e85aa6'] as const
