/**
 * The stand-ins.
 *
 * A stand-in counts in its head like anybody, and like anybody gets worse the
 * longer it has to count: it stops somewhere around the target, off by up to a
 * tenth of it either way - more often close than far. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { stopwatch, targetFor, type Game } from './rules'

/** How far off a stand-in can be, as a share of the target. */
export const BOT_DRIFT = 0.1

/** When a stand-in means to stop, on the stopwatch. */
export function botStopAt(game: Game, bot: string): number {
  const random = createRng(hashSeed(game.seed, `time-it:bot:${bot}`))
  const target = targetFor(game.seed)
  // The mean of two draws: close more often than far.
  const off = ((random() * 2 - 1) + (random() * 2 - 1)) / 2
  return Math.max(0.5, target * (1 + off * BOT_DRIFT))
}

/** The stops the stand-ins make this frame. */
export function botStops(game: Game): { player: number; at: number }[] {
  const out: { player: number; at: number }[] = []
  if (game.over) return out
  const now = stopwatch(game)
  game.players.forEach((timer, player) => {
    if (!timer.bot || timer.stopped !== null) return
    const at = botStopAt(game, timer.id)
    if (now >= at) out.push({ player, at })
  })
  return out
}
