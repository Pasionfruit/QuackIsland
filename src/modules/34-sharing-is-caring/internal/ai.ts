/**
 * What the stand-ins do.
 *
 * A round alone needs somebody to take the crown off, and somebody to take it
 * off you. A stand-in goes for the crown while it sits in the middle, chases
 * whoever is wearing it, and runs from the nearest chasers when it is wearing
 * it - along the wall rather than into it.
 *
 * Deterministic: the same round plays out the same way. Each stand-in cuts a
 * corner of its own when it chases, from the seed, so four of them do not
 * arrive as one queue.
 */
import { createRng, hashSeed } from '../../00-core'
import { ARENA, holderOf, type Intent, type Round, type Wearer } from './rules'

/** Chasers further off than this are not worth running from. */
const THREAT = 6
/** How far inside the wall a runner starts turning along it. */
const EDGE_MARGIN = 2.2

export function botIntent(round: Round, bot: Wearer): Intent {
  const holder = holderOf(round)

  if (!holder) return toward(bot, 0, 0, 1)

  if (holder !== bot) {
    const random = createRng(hashSeed(round.seed, `sharing-is-caring:bot:${bot.id}`))
    // Aim a little to one side of the wearer, which heads off a runner rather than trailing it.
    const side = (random() - 0.5) * 1.2
    const dx = holder.x - bot.x
    const dy = holder.y - bot.y
    const d = Math.hypot(dx, dy) || 1
    const lead = Math.min(1.5, d * 0.25)
    return toward(bot, holder.x - (dy / d) * side * lead, holder.y + (dx / d) * side * lead, 1)
  }

  let fx = 0
  let fy = 0
  for (const other of round.players) {
    if (other === bot) continue
    const dx = bot.x - other.x
    const dy = bot.y - other.y
    const d = Math.hypot(dx, dy)
    if (d === 0 || d > THREAT) continue
    fx += dx / (d * d)
    fy += dy / (d * d)
  }
  const pressed = Math.hypot(fx, fy)
  if (pressed === 0) return { x: 0, y: 0 }
  fx /= pressed
  fy /= pressed

  const fromMiddle = Math.hypot(bot.x, bot.y)
  if (fromMiddle > ARENA.radius - ARENA.body - EDGE_MARGIN) {
    const ox = bot.x / fromMiddle
    const oy = bot.y / fromMiddle
    const outward = fx * ox + fy * oy
    if (outward > 0) {
      // Keep only the part of the escape that runs along the wall, and lean in off it.
      let tx = fx - ox * outward
      let ty = fy - oy * outward
      const along = Math.hypot(tx, ty)
      if (along < 1e-3) {
        tx = -oy
        ty = ox
      } else {
        tx /= along
        ty /= along
      }
      return { x: tx - ox * 0.35, y: ty - oy * 0.35 }
    }
  }
  return { x: fx, y: fy }
}

function toward(bot: Wearer, x: number, y: number, pace: number): Intent {
  const dx = x - bot.x
  const dy = y - bot.y
  const d = Math.hypot(dx, dy)
  if (d < 0.05) return { x: 0, y: 0 }
  return { x: (dx / d) * pace, y: (dy / d) * pace }
}

export function botIntents(round: Round): Map<string, Intent> {
  const out = new Map<string, Intent>()
  if (round.over) return out
  for (const p of round.players) if (p.bot) out.set(p.id, botIntent(round, p))
  return out
}
