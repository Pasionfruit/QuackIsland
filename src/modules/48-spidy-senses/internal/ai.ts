/**
 * The stand-ins.
 *
 * Every round each stand-in makes up its mind afresh: **how close it dares go**
 * - its nerve - and whether, once there, it clicks and stops to be safe or
 * stands and waits to react. It creeps in to its spot. When the trapdoor
 * springs it clicks after its own reaction time, which is sometimes too slow.
 * A twitch of the lid now and then fools it into clicking early.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { CELLAR, when } from './nest'
import { canCreep, distance, steer, stop, type Game, type Player } from './rules'

export const BOT = {
  /** How far out from the trapdoor's edge it is content to stop, nearest and furthest, metres. */
  nerve: [0, 4.5] as readonly [number, number],
  /** Seconds from the spring to its click, quickest and slowest. */
  reaction: [0.2, 0.6] as readonly [number, number],
  /** The chance a twitch of the lid fools it into clicking. */
  fooled: 0.2,
  /** The chance it clicks the moment it reaches its spot, rather than waiting to react. */
  safe: 0.3,
} as const

interface Mind {
  round: number
  goal: number
  reaction: number
  safe: boolean
  /** The twitches that fool it, on the game's clock. */
  fooledBy: number[]
}

const minds = new Map<string, Mind>()

function mindFor(game: Game, bot: Player): Mind {
  const w = when(game.seed, game.elapsed)
  const key = `${game.id}:${game.seed}:${bot.id}`
  const known = minds.get(key)
  if (known && known.round === w.round.round) return known
  const random = createRng(hashSeed(game.seed, `spidy-senses:bot:${bot.id}:${w.round.round}`))
  const mind: Mind = {
    round: w.round.round,
    // Braver more often than not: the square pulls it towards the edge.
    goal: CELLAR.near + BOT.nerve[0] + random() ** 2 * (BOT.nerve[1] - BOT.nerve[0]),
    reaction: BOT.reaction[0] + random() * (BOT.reaction[1] - BOT.reaction[0]),
    safe: random() < BOT.safe,
    fooledBy: w.round.twitches.filter(() => random() < BOT.fooled),
  }
  minds.set(key, mind)
  if (minds.size > 64) minds.delete(minds.keys().next().value!)
  return mind
}

/** Moves every stand-in on: creeping in to its spot, and clicking. */
export function botSteer(game: Game): void {
  game.players.forEach((bot, index) => {
    if (!bot.bot || !canCreep(game, bot)) return
    const mind = mindFor(game, bot)
    const round = when(game.seed, game.elapsed).round
    const e = game.elapsed
    const spooked = e >= round.springs + mind.reaction || mind.fooledBy.some((at) => e >= at + mind.reaction && e < at + mind.reaction + 0.5)
    if (spooked) {
      steer(game, index, 0, 0)
      stop(game, index)
      return
    }
    const far = distance(bot) - mind.goal
    if (far > 0.02) {
      steer(game, index, Math.min(1, far * 2), 0)
      return
    }
    steer(game, index, 0, 0)
    if (mind.safe) stop(game, index)
  })
}
