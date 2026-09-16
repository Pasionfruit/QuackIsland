/**
 * What the stand-ins do.
 *
 * A round alone needs somebody to punch, and somebody punching back. A stand-in
 * keeps off the edge, goes for whoever is nearest, lines up, waits a moment,
 * and throws - then pulls the arm back soon after. It sidesteps a fist coming
 * straight at it, some of the time.
 *
 * Seeded by the round, the stand-in and how many clicks it has made, so the
 * same round plays out the same way.
 */
import { createRng, hashSeed } from '../../00-core'
import { RING, fistAt, type Fighter, type Intent, type Round } from './rules'

/** How far inside the edge a stand-in starts heading back to the middle. */
const EDGE_MARGIN = 2.4
/** How closely a stand-in lines up before it throws, in radians. */
const AIM = 0.15
/**
 * Seconds at the start of a round before a stand-in throws anything.
 *
 * Their wait used to count from the start of the round, so they threw inside a
 * second - two of four were out before a person had found which pill was theirs.
 */
export const BOT_OPENING = 2.5

export function botIntent(round: Round, bot: Fighter): Intent {
  const random = createRng(hashSeed(round.seed, `punch-buggy:bot:${bot.id}:${bot.clicks}`))
  // Long enough that a person has time to see it coming and step aside.
  const wait = 0.7 + random() * 1
  const dodges = random() < 0.5
  const holdFor = 0.15 + random() * 0.35
  const since = round.elapsed - Math.max(bot.punchSince, bot.punch === 'in' ? BOT_OPENING : 0)
  let clicks = bot.clicks

  // Pull an arm back that has done its job.
  if ((bot.punch === 'held' && since >= holdFor) || (bot.punch === 'out' && since > 0.6)) clicks += 1

  // Off the edge is the one thing worse than being punched.
  const fromMiddle = Math.hypot(bot.x, bot.y)
  if (fromMiddle > RING.radius - EDGE_MARGIN) {
    return { x: -bot.x / fromMiddle, y: -bot.y / fromMiddle, clicks }
  }

  // A fist on its way out and coming this way: step out of its line.
  if (dodges) {
    for (const other of round.fighters) {
      if (other === bot || !other.alive || other.punch !== 'out') continue
      const fist = fistAt(other)
      const toMe = Math.atan2(bot.y - other.y, bot.x - other.x)
      const off = Math.abs(Math.atan2(Math.sin(toMe - other.facing), Math.cos(toMe - other.facing)))
      if (off < 0.35 && Math.hypot(bot.x - fist.x, bot.y - fist.y) < 4) {
        return { x: -Math.sin(other.facing), y: Math.cos(other.facing), clicks }
      }
    }
  }

  const target = round.fighters
    .filter((f) => f !== bot && f.alive)
    .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0]
  if (!target) return { x: 0, y: 0, clicks }

  const dx = target.x - bot.x
  const dy = target.y - bot.y
  const distance = Math.hypot(dx, dy)
  const heading = Math.atan2(dy, dx)
  const off = Math.abs(Math.atan2(Math.sin(heading - bot.facing), Math.cos(heading - bot.facing)))
  const inRange = distance <= RING.reach + RING.body * 2
  if (bot.punch === 'in' && inRange && off < AIM && round.elapsed >= BOT_OPENING && since >= wait) clicks += 1

  // Close in, and keep facing them - walking is how a body turns.
  const close = distance > RING.reach * 0.7 ? 1 : 0.25
  return { x: (dx / distance) * close, y: (dy / distance) * close, clicks }
}

export function botIntents(round: Round): Map<string, Intent> {
  const out = new Map<string, Intent>()
  if (round.over) return out
  for (const f of round.fighters) if (f.bot && f.alive) out.set(f.id, botIntent(round, f))
  return out
}
