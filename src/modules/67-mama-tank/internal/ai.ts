/**
 * The stand-ins - mini tanks only. **Mama Tank never a bot**: alone, the
 * human drives her and the stand-ins attack from below.
 *
 * Without a bot that actually fires, a bot-filled lobby could never reach
 * `hitsNeeded` at all except from the one human mini tank - so a stand-in
 * here is a real shooter, not just a mover: it heads for an attack position
 * within firing range of Mama Tank's last known spot, biased towards a spot
 * with cover nearby rather than open ground, and once there - with a clear
 * line of sight and its own cooldown ready - it fires, calling the same
 * `fire()` the host's own body uses (a bot is always host-simulated, so
 * there is no claim path for its shot). A basic reactive dodge nudges its
 * goal away from wherever Mama Tank's current aim happens to be pointing -
 * a flinch, not a plan, the same shape Jackal's own stand-ins duck away
 * from the Sniper's beam with.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { arenaFor, blocked, lineClear, openPoint, type Arena, type Point } from './arena'
import { MINI, aimDirection, canAct, canShoot, eyeOf, fire, isStanding, mamaOf, walk, wrapAngle, type Round } from './rules'

export const BOT = {
  /** How close to Mama Tank a stand-in tries to get before it holds and fires, metres. */
  approach: 26,
  /** How far off its own goal still counts as arrived. */
  arrived: 1.6,
  /** How long it can go without getting anywhere before it tries a new goal, seconds. */
  stuckAfter: 1.3,
  /** How close a piece of cover has to be to a candidate goal for it to be preferred. */
  coverNear: 4,
  /** How close Mama Tank's current aim line has to pass to be worth dodging, metres. */
  dodge: 3,
  /** How hard a dodge nudges the goal sideways, metres. */
  dodgeBy: 4,
  /** How fast it turns to face Mama Tank once it has a shot, radians a second. */
  turn: 3.2,
} as const

interface Mind {
  random: () => number
  goal: Point
  checkedAt: number
  checkedFrom: Point
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(round: Round, bot: { id: string; x: number; z: number }): Mind {
  const key = `${round.id}:${round.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || round.elapsed < mind.at) {
    const random = createRng(hashSeed(round.seed, `mama-tank:bot:${bot.id}`))
    mind = { random, goal: { x: bot.x, z: bot.z }, checkedAt: round.elapsed, checkedFrom: { x: bot.x, z: bot.z }, at: round.elapsed }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = round.elapsed
  return mind
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function nearCover(arena: Arena, p: Point): boolean {
  return arena.blocks.some((b) => !b.wall && Math.hypot(p.x - clamp(p.x, b.x0, b.x1), p.z - clamp(p.z, b.z0, b.z1)) < BOT.coverNear)
}

/** A goal somewhere inside firing range of Mama Tank, biased to land near a piece of cover rather than in the open. */
function attackGoal(arena: Arena, random: () => number, mama: Point): Point {
  let fallback: Point | null = null
  for (let i = 0; i < 40; i++) {
    const angle = random() * Math.PI * 2
    const range = BOT.approach * (0.5 + random() * 0.5)
    const p = { x: mama.x + Math.sin(angle) * range, z: mama.z + Math.cos(angle) * range }
    if (blocked(arena, p, MINI.radius + 0.4)) continue
    if (!fallback) fallback = p
    if (nearCover(arena, p)) return p
  }
  return fallback ?? openPoint(arena, random, MINI.radius)
}

function yawTowards(from: Point, to: Point): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

function turnTowards(from: number, to: number, most: number): number {
  const d = wrapAngle(to - from)
  return wrapAngle(from + Math.max(-most, Math.min(most, d)))
}

/** How close a point passes to the segment from `a` to `b`, in the ground plane. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.z - a.z)
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / len2, 0, 1)
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t))
}

/** How far out to project Mama Tank's current aim, purely for a stand-in's own dodge check - never a real, visible beam. */
const AIM_REACH = 200

/** Moves every stand-in mini tank on by `dt`: picks a goal, dodges Mama Tank's current aim, fires when it has a clear shot. */
export function botSteer(round: Round, dt: number): void {
  const step = Math.min(Math.max(dt, 0), 0.25)
  const arena = arenaFor(round.seed)
  const mama = mamaOf(round)
  round.players.forEach((bot, index) => {
    if (!bot.bot || bot.role !== 'mini' || !canAct(round, bot)) return
    if (!mama || !isStanding(mama)) return
    const mind = mindFor(round, bot)

    if (Math.hypot(mind.goal.x - bot.x, mind.goal.z - bot.z) < BOT.arrived) {
      mind.goal = attackGoal(arena, mind.random, mama)
      mind.checkedAt = round.elapsed
      mind.checkedFrom = { x: bot.x, z: bot.z }
    } else if (round.elapsed - mind.checkedAt > BOT.stuckAfter) {
      if (Math.hypot(bot.x - mind.checkedFrom.x, bot.z - mind.checkedFrom.z) < 0.6) mind.goal = attackGoal(arena, mind.random, mama)
      mind.checkedAt = round.elapsed
      mind.checkedFrom = { x: bot.x, z: bot.z }
    }

    // A flinch away from wherever Mama Tank is currently aiming, not a plan.
    const aim = aimDirection(mama.yaw, mama.pitch)
    const ahead = { x: mama.x + aim.x * AIM_REACH, z: mama.z + aim.z * AIM_REACH }
    if (distanceToSegment(bot, mama, ahead) < BOT.dodge) {
      const side = (bot.x - mama.x) * aim.z - (bot.z - mama.z) * aim.x
      const away = side >= 0 ? 1 : -1
      const perp = { x: -aim.z, z: aim.x }
      mind.goal = { x: mind.goal.x + away * perp.x * BOT.dodgeBy, z: mind.goal.z + away * perp.z * BOT.dodgeBy }
    }

    const gx = mind.goal.x - bot.x
    const gz = mind.goal.z - bot.z
    const gd = Math.hypot(gx, gz)

    const d = Math.hypot(mama.x - bot.x, mama.z - bot.z)
    const hasShot = d <= BOT.approach + 4 && lineClear(arena, eyeOf(bot), eyeOf(mama))
    if (hasShot) {
      bot.yaw = turnTowards(bot.yaw, yawTowards(bot, mama), BOT.turn * step)
      bot.pitch = 0
      if (canShoot(round, bot)) fire(round, index, true)
    } else if (gd > 1e-6) {
      bot.yaw = yawTowards(bot, mind.goal)
    }

    if (gd < 1e-6) return
    const ahead2 = aimDirection(bot.yaw, 0)
    const forward = (gx * ahead2.x + gz * ahead2.z) / gd
    const right = (gx * -ahead2.z + gz * ahead2.x) / gd
    walk(round, index, { forward, right }, step)
  })
}
