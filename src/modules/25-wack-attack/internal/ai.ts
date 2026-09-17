/**
 * The stand-ins.
 *
 * A stand-in goes for a mole it can get to in time - the golden one first -
 * walks until its hammer will land on the hole, and swings once the mole has
 * been up a moment. It lets some moles go, as a person would, and it walks a
 * little slower than a person. Off a mole, it stands still.
 *
 * Seeded by the round, the stand-in and the mole, so the same round plays out
 * the same way. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { FIELD, canSwing, holeAt, molesFor, whackOf, type Game, type Intent, type Mole, type Whacker } from './rules'

/** How long after a mole comes up a stand-in swings at it, least and most. */
export const BOT_REACTION: readonly [number, number] = [0.3, 0.65]
/** The chance a stand-in lets a given mole go. */
export const BOT_IGNORES = 0.45

function reactionTo(game: Game, bot: Whacker, mole: Mole): { ignores: boolean; reaction: number } {
  const random = createRng(hashSeed(game.seed, `wack-attack:bot:${bot.id}:${mole.id}`))
  return { ignores: random() < BOT_IGNORES, reaction: BOT_REACTION[0] + random() * (BOT_REACTION[1] - BOT_REACTION[0]) }
}

/** The mole a stand-in is going for, if any. */
export function botTarget(game: Game, player: number): Mole | null {
  const bot = game.players[player]
  if (!bot) return null
  const now = game.elapsed
  const pace = FIELD.speed * FIELD.botPace
  let best: { mole: Mole; score: number } | null = null
  for (const mole of molesFor(game.seed)) {
    if (mole.at > now + 0.4) break
    if (mole.at + mole.up < now || whackOf(game, mole.id)) continue
    const { ignores, reaction } = reactionTo(game, bot, mole)
    if (ignores) continue
    const hole = holeAt(mole.hole)
    const travel = Math.max(0, Math.hypot(hole.x - bot.x, hole.y - bot.y) - FIELD.strike) / pace
    const ready = Math.max(now + travel, mole.at + reaction)
    if (ready > mole.at + mole.up) continue
    // Golden first, then whichever can be got to soonest.
    const score = ready - (mole.golden ? 10 : 0)
    if (!best || score < best.score) best = { mole, score }
  }
  return best ? best.mole : null
}

/** Which way each stand-in walks this frame, and its running swing count. */
export function botIntents(game: Game): Map<string, Intent> {
  const out = new Map<string, Intent>()
  if (game.over) return out
  game.players.forEach((bot, player) => {
    if (!bot.bot) return
    const target = botTarget(game, player)
    let swings = bot.swings
    let x = 0
    let y = 0
    if (target) {
      const hole = holeAt(target.hole)
      const dx = hole.x - bot.x
      const dy = hole.y - bot.y
      const far = Math.hypot(dx, dy)
      if (far > FIELD.strike) {
        x = dx / far
        y = dy / far
      } else {
        // Close enough: face it, and swing once it has been up a moment.
        bot.facing = Math.atan2(dy, dx)
        const { reaction } = reactionTo(game, bot, target)
        if (game.elapsed >= target.at + reaction && canSwing(game, player)) swings += 1
      }
    }
    out.set(bot.id, { x, y, swings })
  })
  return out
}
