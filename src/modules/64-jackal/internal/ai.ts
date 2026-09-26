/**
 * The stand-ins - runners only. **A bot never plays the Sniper**: alone, the
 * human is the 1 and the stand-ins rush the tower for it to shoot at.
 *
 * A stand-in heads for a goal some way closer to the tower than it already
 * is, angling across the lane rather than down the middle of it, and jumps
 * whatever short cover stands in its way. When the Sniper's laser is close
 * enough to worry about, it steers away from the beam rather than through
 * it - not a plan, just a flinch, the same as a person would.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { advancePoint, arenaFor, blocked, type Point } from './arena'
import { BODY, JUMP, aimDirection, canAct, laserOf, walkRunner, type Round } from './rules'

export const BOT = {
  /** How close the goal has to be before a new one is picked. */
  arrived: 1.4,
  /** How long it can go without getting anywhere before it tries a new goal, seconds. */
  stuckAfter: 1.3,
  /** How far off the ground still counts as "in the way": under a jump clears it. */
  jumpChance: 0.5,
  /** How close the laser's line has to pass to be worth dodging, metres. */
  dodge: 2.2,
  /** How hard a dodge nudges the goal sideways, metres. */
  dodgeBy: 3.5,
} as const

interface Mind {
  random: () => number
  goal: Point
  checkedAt: number
  checkedFrom: Point
  at: number
}

const minds = new Map<string, Mind>()

function mindFor(round: Round, bot: { id: string; z: number; x: number }): Mind {
  const key = `${round.id}:${round.seed}:${bot.id}`
  let mind = minds.get(key)
  if (!mind || round.elapsed < mind.at) {
    const random = createRng(hashSeed(round.seed, `jackal:bot:${bot.id}`))
    mind = { random, goal: advancePoint(arenaFor(round.seed), random, bot.z), checkedAt: round.elapsed, checkedFrom: { x: bot.x, z: bot.z }, at: round.elapsed }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = round.elapsed
  return mind
}

/** The yaw that looks from `from` towards `to`. */
function yawTowards(from: Point, to: Point): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

/** How close a point passes to the segment from `a` to `b`, in the ground plane. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.z - a.z)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2))
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t))
}

/** Moves every stand-in runner on by `dt`: picks a goal, dodges the laser when it is close, jumps what is in the way. */
export function botSteer(round: Round, dt: number): void {
  const step = Math.min(Math.max(dt, 0), 0.25)
  const arena = arenaFor(round.seed)
  const beam = laserOf(round)
  round.players.forEach((bot, index) => {
    if (!bot.bot || bot.role !== 'runner' || !canAct(round, bot)) return
    const mind = mindFor(round, bot)

    if (Math.hypot(mind.goal.x - bot.x, mind.goal.z - bot.z) < BOT.arrived) {
      mind.goal = advancePoint(arena, mind.random, bot.z)
      mind.checkedAt = round.elapsed
      mind.checkedFrom = { x: bot.x, z: bot.z }
    } else if (round.elapsed - mind.checkedAt > BOT.stuckAfter) {
      if (Math.hypot(bot.x - mind.checkedFrom.x, bot.z - mind.checkedFrom.z) < 0.6) mind.goal = advancePoint(arena, mind.random, bot.z)
      mind.checkedAt = round.elapsed
      mind.checkedFrom = { x: bot.x, z: bot.z }
    }

    // A flinch away from the beam, not a plan: nudge the goal to whichever
    // side is further from the line the laser is actually drawing right now.
    if (beam && distanceToSegment(bot, beam.from, beam.to) < BOT.dodge) {
      const dx = beam.to.x - beam.from.x
      const dz = beam.to.z - beam.from.z
      const side = (bot.x - beam.from.x) * dz - (bot.z - beam.from.z) * dx
      const away = side >= 0 ? 1 : -1
      mind.goal = { x: mind.goal.x + away * BOT.dodgeBy, z: mind.goal.z }
    }

    const wantYaw = yawTowards(bot, mind.goal)
    bot.yaw = wantYaw
    bot.pitch = 0

    const gx = mind.goal.x - bot.x
    const gz = mind.goal.z - bot.z
    const gd = Math.hypot(gx, gz)
    if (gd < 1e-6) {
      walkRunner(round, index, { forward: 0, right: 0 }, step)
      return
    }
    const ahead = aimDirection(bot.yaw, 0)
    const forward = (gx * ahead.x + gz * ahead.z) / gd
    const right = (gx * -ahead.z + gz * ahead.x) / gd
    // A short piece of cover a step ahead, still in the way at this height: jump it.
    const nose = { x: bot.x + ahead.x * (BODY.radius + 0.3), z: bot.z + ahead.z * (BODY.radius + 0.3) }
    const jump = bot.y <= 1e-9 && blocked(arena, nose, BODY.radius, bot.y) && !blocked(arena, nose, BODY.radius, JUMP.max) && mind.random() < BOT.jumpChance
    walkRunner(round, index, { forward, right, jump }, step)
  })
}
