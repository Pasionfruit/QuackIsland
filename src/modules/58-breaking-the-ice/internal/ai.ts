/**
 * What the stand-ins do.
 *
 * A round alone needs somebody else out there breaking the ice. A stand-in
 * keeps off any tile it knows is cracked, breaks the tile under whoever is
 * nearest when it can reach them, pushes them if it is already close enough
 * for that instead, and otherwise closes the distance. It never picks a fight
 * with a fall already under way - once it or its target is airborne, it just
 * gets clear.
 *
 * Seeded by the round, the stand-in and how many breaks it has thrown, so the
 * same round plays out the same way.
 */
import { createRng, hashSeed } from '../../00-core'
import { BREAK, PUSH, forward, tileAt, broken, type Intent, type Player, type Round } from './rules'

/** Seconds at the start of a round before a stand-in breaks anything. */
export const BOT_OPENING = 2

export function botIntent(round: Round, bot: Player): Intent {
  const random = createRng(hashSeed(round.seed, `breaking-the-ice:bot:${bot.id}:${bot.breaks + bot.pushes}`))
  const target = round.players
    .filter((p) => p !== bot && p.alive && p.grounded && p.layer === bot.layer)
    .sort((a, b) => Math.hypot(a.x - bot.x, a.z - bot.z) - Math.hypot(b.x - bot.x, b.z - bot.z))[0]

  let breaks = bot.breaks
  let pushes = bot.pushes
  let yaw = bot.yaw
  let x = 0
  let z = 0

  // Off the edge of your own footing is the one thing worse than a shove.
  const under = tileAt(bot.x, bot.z)
  const shaky = bot.grounded && broken(round.tiles, bot.layer, under.row, under.col, round.elapsed + 0.4)
  if (shaky) {
    const away = forward(bot.yaw)
    return { x: away.x, z: away.z, yaw: bot.yaw, breaks, jumps: bot.jumps, pushes }
  }

  if (target && bot.grounded && round.elapsed >= BOT_OPENING) {
    const dx = target.x - bot.x
    const dz = target.z - bot.z
    const distance = Math.hypot(dx, dz)
    yaw = Math.atan2(-dx, -dz)
    if (distance <= PUSH.reach * 0.9) {
      // Close enough to hurry them along - the falling has to finish the job.
      const wait = random() < 0.6
      if (!wait) pushes += 1
    } else if (distance <= BREAK.reach + 1.4) {
      const wait = random() < 0.35
      if (!wait) breaks += 1
    } else {
      const pace = distance > 3 ? 1 : 0.4
      x = (dx / distance) * pace
      z = (dz / distance) * pace
    }
  } else if (target) {
    const dx = target.x - bot.x
    const dz = target.z - bot.z
    yaw = Math.atan2(-dx, -dz)
  }

  return { x, z, yaw, breaks, jumps: bot.jumps, pushes }
}

export function botIntents(round: Round): Map<string, Intent> {
  const out = new Map<string, Intent>()
  if (round.over) return out
  for (const p of round.players) if (p.bot && p.alive) out.set(p.id, botIntent(round, p))
  return out
}
