/**
 * The stand-ins.
 *
 * A stand-in watched the chef too, and remembers most of the order: the right
 * ingredient in the right place four times in five, some other ingredient
 * otherwise - and a little less each recipe, as the chef speeds up. On its turn
 * it thinks for a moment and takes what it believes the recipe is up to - or,
 * if there is none of that left on the counter, any item at all.
 *
 * Seeded by the game, the stand-in, the recipe and the turn, so the same game
 * plays out the same way. Only ever runs on the host, which has the recipe.
 */
import { createRng, hashSeed } from '../../00-core'
import { KINDS, KITCHEN, dueIndex, recipeOrder, whoseTurn, type Cook, type Game } from './rules'

/** The chance a stand-in remembers a place in the order right, in the first recipe. */
export const BOT_MEMORY = 0.8
/** How much worse it gets each recipe, as the chef speeds up, down to a coin toss. */
export const BOT_FORGETS = 0.05
/** How long a stand-in thinks, least and most. */
export const BOT_THINK: readonly [number, number] = [1.2, 3]

/** The order a stand-in believes the chef cooked in: an ingredient per place. */
export function remembered(game: Game, bot: Cook): number[] {
  const random = createRng(hashSeed(game.seed, `let-him-cook:memory:${bot.id}:${game.recipe}`))
  const memory = Math.max(0.5, BOT_MEMORY - BOT_FORGETS * game.recipe)
  // A place it has forgotten is some other ingredient, not a blank: a stand-in
  // that knows it has forgotten would play more carefully than anybody can.
  return recipeOrder(game).map((kind) => (random() < memory ? kind : Math.floor(random() * KINDS)))
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
  const at = dueIndex(game)
  const believed = at < memory.length ? memory[at] : -1
  const open = Array.from({ length: KITCHEN.items }, (_, slot) => slot).filter((slot) => game.claimed[slot] === null)
  const wanted = open.filter((slot) => game.served[slot] === believed)
  const from = wanted.length > 0 ? wanted : open
  return { player, slot: from[Math.floor(random() * from.length)] }
}
