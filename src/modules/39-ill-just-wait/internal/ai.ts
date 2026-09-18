/**
 * The stand-ins.
 *
 * A stand-in reads each target for a while, then winds its clock the short
 * way round to the answer at its own steady pace and confirms it. Its clock is
 * on show like anybody's, so it can be waited on and copied like anybody's.
 * Reading and winding are drawn from the seed, the reading longer for the
 * harder words. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { answerFor, stageOf, type Game } from './rules'
import { DIAL, TARGETS, wrap } from './wording'

/** Target by target, the least and most seconds a stand-in spends reading before it winds. */
export const BOT_READ: readonly (readonly [number, number])[] = [
  [5, 14],
  [9, 24],
  [14, 38],
]

/** How fast a stand-in winds, least and most, in minutes a second. */
export const BOT_WIND: readonly [number, number] = [25, 55]

/** How long a stand-in reads target `stage`, and how fast it then winds. */
export function botPace(game: Pick<Game, 'seed'>, bot: string, stage: number): { read: number; wind: number } {
  const random = createRng(hashSeed(game.seed, `ill-just-wait:bot:${bot}:${stage}`))
  const [lo, hi] = BOT_READ[Math.max(0, Math.min(BOT_READ.length - 1, stage))]
  // The mean of two draws: the middle more often than the ends.
  const read = lo + ((random() + random()) / 2) * (hi - lo)
  const wind = BOT_WIND[0] + random() * (BOT_WIND[1] - BOT_WIND[0])
  return { read, wind }
}

/**
 * Where each stand-in's clock is this frame, and the answers they give: a
 * stand-in whose hands have arrived confirms, at the moment they arrived.
 */
export function botMoves(game: Game): { player: number; minutes: number; answer: { stage: number; at: number } | null }[] {
  const out: { player: number; minutes: number; answer: { stage: number; at: number } | null }[] = []
  if (game.over) return out
  game.players.forEach((p, player) => {
    if (!p.bot || p.left) return
    const stage = stageOf(p)
    if (stage >= TARGETS) return
    const started = stage === 0 ? 0 : (p.solved[stage - 1] ?? 0)
    const { read, wind } = botPace(game, p.id, stage)
    const target = answerFor(game, stage)
    // The short way round: forward to it, or back from twelve.
    const forward = target <= DIAL / 2
    const distance = forward ? target : DIAL - target
    const winding = game.clock - started - read
    const travelled = Math.max(0, Math.min(distance, winding * wind))
    const minutes = wrap(forward ? travelled : -travelled)
    const answer = travelled >= distance ? { stage, at: started + read + distance / wind } : null
    out.push({ player, minutes, answer })
  })
  return out
}
