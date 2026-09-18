/**
 * The stand-ins.
 *
 * A stand-in scrolls at its own pace, a little faster and a little slower as
 * it goes, and when an ad goes up it takes a moment to find the skip button
 * and click it. Pace and reactions are drawn from the seed. Only ever runs on
 * the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { blocked, finished, scroll, skipAd, type Game } from './rules'

/** How fast a stand-in scrolls, least and most, in reels a second. */
export const BOT_RATE: readonly [number, number] = [2.4, 3.6]

/** How long a stand-in takes to click a skip button, least and most, in seconds. */
export const BOT_REACT: readonly [number, number] = [0.45, 1.3]

/** A stand-in's scrolling pace, in reels a second. */
export function botRate(game: Pick<Game, 'seed'>, bot: string): number {
  const random = createRng(hashSeed(game.seed, `whats-your-rpm:bot:${bot}`))
  return BOT_RATE[0] + random() * (BOT_RATE[1] - BOT_RATE[0])
}

/** How long a stand-in takes over ad `index`. */
export function botReaction(game: Pick<Game, 'seed'>, bot: string, index: number): number {
  const random = createRng(hashSeed(game.seed, `whats-your-rpm:bot:${bot}:ad:${index}`))
  // The mean of two draws: the middle more often than the ends.
  return BOT_REACT[0] + ((random() + random()) / 2) * (BOT_REACT[1] - BOT_REACT[0])
}

/** A frame of every stand-in: scroll, or - with an ad up - click it once it has had its moment. */
export function stepBots(game: Game, dt: number): void {
  if (game.over) return
  const step = Math.min(Math.max(dt, 0), 0.25)
  game.players.forEach((p, player) => {
    if (!p.bot || p.left || finished(p) || game.over) return
    if (blocked(game, p)) {
      const since = game.clock - (p.blockedAt ?? game.clock)
      if (since >= botReaction(game, p.id, p.skipped)) skipAd(game, player, p.skipped)
      return
    }
    // A wobble, so a row of stand-ins does not move in step.
    const wobble = 1 + 0.25 * Math.sin(game.clock * 1.7 + player * 2.1)
    scroll(game, player, botRate(game, p.id) * wobble * step)
  })
}
