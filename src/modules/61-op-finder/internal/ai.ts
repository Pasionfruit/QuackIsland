/**
 * What the stand-ins do.
 *
 * A stand-in "solves" its current challenge after a pause of a few seconds,
 * sometimes getting it wrong once first and paying the same short lockout a
 * person would. Seeded per bot per stage, so the same round plays out the
 * same way every time it is replayed with the same seed - and a slower or
 * faster machine never changes who wins.
 */
import { createRng, hashSeed } from '../../00-core'
import { ANSWER, STAGE_COUNT, type Intent, type Player, type Round } from './rules'

/** How long a stand-in takes to solve one challenge, seconds, before any mistake. */
export const BOT_SOLVE = { min: 1.4, max: 4.2 } as const
/** How often a stand-in gets its first attempt wrong. */
export const BOT_MISTAKE_CHANCE = 0.25

export function botIntent(round: Round, bot: Player): Intent {
  if (bot.stage >= STAGE_COUNT) return { stage: bot.stage, mistakes: bot.mistakes }
  const random = createRng(hashSeed(round.seed, `op-finder:bot:${bot.id}:${bot.stage}`))
  const mistake = random() < BOT_MISTAKE_CHANCE
  const solveTime = BOT_SOLVE.min + random() * (BOT_SOLVE.max - BOT_SOLVE.min) + (mistake ? ANSWER.lockout : 0)
  const since = round.elapsed - Math.max(bot.lastAdvance, 0)
  if (since < solveTime) return { stage: bot.stage, mistakes: bot.mistakes }
  return { stage: bot.stage + 1, mistakes: bot.mistakes + (mistake ? 1 : 0) }
}

export function botIntents(round: Round): Map<string, Intent> {
  const out = new Map<string, Intent>()
  if (round.over) return out
  for (const p of round.players) if (p.bot) out.set(p.id, botIntent(round, p))
  return out
}
