/**
 * What the stand-ins do.
 *
 * The ice cracks under anybody's feet the moment they stand on it, stand-ins
 * included, so a round alone still wears the iceberg down. A stand-in keeps
 * off any tile it knows is about to give way, closes in on whoever is
 * nearest, and pushes them once it is close enough - toward a hole the ice
 * itself has already opened up. It never picks a fight with a fall already
 * under way - once it or its target is airborne, it just gets clear.
 *
 * Seeded by the round, the stand-in and how many pushes it has thrown, so the
 * same round plays out the same way.
 */
import { createRng, hashSeed } from '../../00-core'
import { PUSH, forward, tileAt, broken, type Intent, type Player, type Round } from './rules'

/** Seconds at the start of a round before a stand-in moves in on anybody. */
export const BOT_OPENING = 2

export function botIntent(round: Round, bot: Player): Intent {
  const random = createRng(hashSeed(round.seed, `breaking-the-ice:bot:${bot.id}:${bot.pushes}`))
  const target = round.players
    .filter((p) => p !== bot && p.alive && p.grounded && p.layer === bot.layer)
    .sort((a, b) => Math.hypot(a.x - bot.x, a.z - bot.z) - Math.hypot(b.x - bot.x, b.z - bot.z))[0]

  let pushes = bot.pushes
  let yaw = bot.yaw
  let x = 0
  let z = 0

  // Off the edge of your own footing is the one thing worse than a shove.
  const under = tileAt(bot.x, bot.z)
  const shaky = bot.grounded && broken(round.tiles, bot.layer, under.row, under.col, round.elapsed + 0.4)
  if (shaky) {
    const away = forward(bot.yaw)
    return { x: away.x, z: away.z, yaw: bot.yaw, jumps: bot.jumps, pushes }
  }

  if (target && bot.grounded && round.elapsed >= BOT_OPENING) {
    const dx = target.x - bot.x
    const dz = target.z - bot.z
    const distance = Math.hypot(dx, dz)
    yaw = Math.atan2(-dx, -dz)
    if (distance <= PUSH.reach * 0.9) {
      // Close enough to hurry them along - the cracking ice does the rest.
      const wait = random() < 0.6
      if (!wait) pushes += 1
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

  return { x, z, yaw, jumps: bot.jumps, pushes }
}

export function botIntents(round: Round): Map<string, Intent> {
  const out = new Map<string, Intent>()
  if (round.over) return out
  for (const p of round.players) if (p.bot && p.alive) out.set(p.id, botIntent(round, p))
  return out
}
