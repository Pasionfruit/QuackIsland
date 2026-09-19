/**
 * The stand-ins.
 *
 * A stand-in looks at its pieces for a moment, then gets them in one at a
 * time, in an order of its own, each taking a few seconds of finding and
 * turning. When each one goes in is drawn from the seed, so a stand-in has no
 * state of its own: what it has in is a question of what time it is. Only ever
 * runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { PUZZLE, place, type Game } from './rules'

/** How long a stand-in looks before its first piece, least and most, in seconds. */
export const BOT_LOOK: readonly [number, number] = [1.2, 3]

/** How long each piece takes a stand-in, least and most, in seconds. */
export const BOT_PIECE: readonly [number, number] = [2.6, 5.6]

/** When a stand-in gets each of its pieces in: the piece, and seconds into the game. */
export function botPlan(game: Pick<Game, 'seed'>, bot: string): { piece: number; at: number }[] {
  const random = createRng(hashSeed(game.seed, `one-piece:bot:${bot}`))
  const order = Array.from({ length: PUZZLE.pieces }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  let at = BOT_LOOK[0] + random() * (BOT_LOOK[1] - BOT_LOOK[0])
  return order.map((piece) => {
    // The mean of two draws: the middle more often than the ends.
    at += BOT_PIECE[0] + ((random() + random()) / 2) * (BOT_PIECE[1] - BOT_PIECE[0])
    return { piece, at: Math.round(at * 100) / 100 }
  })
}

/** Which pieces a stand-in has in by `clock`, as a mask. */
export function botMask(game: Pick<Game, 'seed'>, bot: string, clock: number): number {
  return botPlan(game, bot).reduce((mask, step) => (step.at <= clock ? mask | (1 << step.piece) : mask), 0)
}

/** A frame of every stand-in: whatever it has in by now goes in. */
export function stepBots(game: Game): void {
  if (game.over) return
  game.players.forEach((p, player) => {
    if (!p.bot || p.left) return
    place(game, player, botMask(game, p.id, game.clock))
  })
}
