/**
 * The stand-ins.
 *
 * A stand-in watched the chef too, and remembers most of it: each ingredient's
 * count right four times in five, one off otherwise - and a little less each
 * recipe, as the chef speeds up. On its turn it thinks for a
 * moment and picks an item it believes still has a copy left in the recipe - or,
 * believing there is none, any item at all.
 *
 * Seeded by the game, the stand-in, the recipe and the turn, so the same game
 * plays out the same way. Only ever runs on the host, which has the recipe.
 */
import { createRng, hashSeed } from '../../00-core'
import { KITCHEN, claimedOf, whoseTurn, type Cook, type Game } from './rules'

/** The chance a stand-in remembers an ingredient's count right, in the first recipe. */
export const BOT_MEMORY = 0.8
/** How much worse it gets each recipe, as the chef speeds up, down to a coin toss. */
export const BOT_FORGETS = 0.05
/** How long a stand-in thinks, least and most. */
export const BOT_THINK: readonly [number, number] = [1.2, 3]

/** How many of each ingredient a stand-in believes went into this recipe. */
export function remembered(game: Game, bot: Cook): number[] {
  const random = createRng(hashSeed(game.seed, `let-him-cook:memory:${bot.id}:${game.recipe}`))
  const memory = Math.max(0.5, BOT_MEMORY - BOT_FORGETS * game.recipe)
  return game.used.map((n) => (random() < memory ? n : Math.max(0, n + (random() < 0.5 ? -1 : 1))))
}

/** A stand-in's pick, once it has thought long enough on its turn; null otherwise. */
export function botMove(game: Game): { player: number; slot: number } | null {
  const player = whoseTurn(game)
  if (player === null) return null
  const bot = game.players[player]
  if (!bot?.bot) return null
  const random = createRng(hashSeed(game.seed, `let-him-cook:bot:${bot.id}:${game.turn}`))
  const think = BOT_THINK[0] + random() * (BOT_THINK[1] - BOT_THINK[0])
  if (game.clock < think) return null

  const memory = remembered(game, bot)
  const open = Array.from({ length: KITCHEN.items }, (_, slot) => slot).filter((slot) => game.claimed[slot] === null)
  const believed = open.filter((slot) => memory[game.served[slot]] > claimedOf(game, game.served[slot]))
  const from = believed.length > 0 ? believed : open
  return { player, slot: from[Math.floor(random() * from.length)] }
}
