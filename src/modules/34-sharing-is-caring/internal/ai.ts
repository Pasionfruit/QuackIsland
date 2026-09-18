/**
 * What the stand-ins do.
 *
 * A round alone needs somebody to take the crown off, and somebody to take it
 * off you. A stand-in goes for the crown while it sits in the middle, chases
 * whoever is wearing it, and runs from the nearest chasers when it is wearing
 * it - along the wall rather than into it. Every stand-in steers round the
 * rocks, and spends its boost when a lunge would reach the wearer (or the crown
 * before anybody else).
 *
 * Deterministic: the same round plays out the same way. Each stand-in cuts a
 * corner of its own when it chases, from the seed, so four of them do not
 * arrive as one queue.
 */
import { createRng, hashSeed } from '../../00-core'
import { ARENA, canBoost, holderOf, type Intent, type Round, type Wearer } from './rules'

/** Chasers further off than this are not worth running from. */
const THREAT = 6
/** How far inside the wall a runner starts turning along it. */
const EDGE_MARGIN = 2.2
/** How near the wearer a stand-in has to be to spend its boost: about what one covers. */
const LUNGE = 3.5
/** How far ahead a stand-in looks for a rock in its way. */
const LOOKAHEAD = 2.5

export function botIntent(round: Round, bot: Wearer): Intent {
  return steer(round, bot, want(round, bot))
}

/** Where a stand-in wants to go, before the rocks. */
function want(round: Round, bot: Wearer): Intent {
  const holder = holderOf(round)

  if (!holder) {
    const intent = toward(bot, 0, 0, 1)
    if (canBoost(round, bot) && Math.hypot(bot.x, bot.y) < LUNGE * 1.4) intent.boost = true
    return intent
  }

  if (holder !== bot) {
    const random = createRng(hashSeed(round.seed, `sharing-is-caring:bot:${bot.id}`))
    // Aim a little to one side of the wearer, which heads off a runner rather than trailing it.
    const side = (random() - 0.5) * 1.2
    const dx = holder.x - bot.x
    const dy = holder.y - bot.y
    const d = Math.hypot(dx, dy) || 1
    const lead = Math.min(1.5, d * 0.25)
    const intent = toward(bot, holder.x - (dy / d) * side * lead, holder.y + (dx / d) * side * lead, 1)
    if (canBoost(round, bot) && d < LUNGE) intent.boost = true
    return intent
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

/**
 * Round a rock rather than into it: a rock close ahead and near the line of
 * travel bends the way sideways, away from its middle.
 */
function steer(round: Round, bot: Wearer, intent: Intent): Intent {
  const length = Math.hypot(intent.x, intent.y)
  if (length === 0) return intent
  const ux = intent.x / length
  const uy = intent.y / length
  let sx = 0
  let sy = 0
  for (const rock of round.rocks) {
    const rx = rock.x - bot.x
    const ry = rock.y - bot.y
    const ahead = rx * ux + ry * uy
    if (ahead <= 0 || ahead > LOOKAHEAD + rock.r) continue
    const across = rx * -uy + ry * ux
    const clear = rock.r + ARENA.body + 0.3
    if (Math.abs(across) >= clear) continue
    // Push to whichever side the rock is not on, harder the nearer and more head-on it is.
    const side = across >= 0 ? -1 : 1
    const push = (1 - Math.abs(across) / clear) * (1 - ahead / (LOOKAHEAD + rock.r + 0.01)) * 2
    sx += -uy * side * push
    sy += ux * side * push
  }
  if (sx === 0 && sy === 0) return intent
  const x = ux + sx
  const y = uy + sy
  const d = Math.hypot(x, y) || 1
  return { ...intent, x: (x / d) * Math.min(1, length), y: (y / d) * Math.min(1, length) }
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
