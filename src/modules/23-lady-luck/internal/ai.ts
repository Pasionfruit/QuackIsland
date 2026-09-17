/**
 * The stand-ins.
 *
 * A stand-in searches the field like anybody: each four-leaf clover that grows,
 * it spots somewhere between eight and twenty-four seconds after it grew - its
 * own time for each one - and clicks it if nobody has got there first. Now and
 * then it clicks a three-leaf clover by mistake, and waits out the cooldown like
 * anybody.
 *
 * Seeded by the secret, the stand-in and the clover, so the same round plays
 * out the same way. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { fieldFor, fourLeaf, type Game } from './rules'

/** How long after a four-leaf clover grows a stand-in spots it, least and most. */
export const BOT_SPOTS: readonly [number, number] = [8, 24]
/** A stand-in considers a misclick once in every window this long... */
export const BOT_MISS_EVERY = 5
/** ...and makes one this often. */
export const BOT_MISS_CHANCE = 0.35

/** The clicks the stand-ins make this frame. */
export function botClicks(game: Game): { player: number; clover: number }[] {
  const out: { player: number; clover: number }[] = []
  if (game.over) return out
  game.players.forEach((bot, player) => {
    if (!bot.bot || bot.cooldown > 0) return

    for (const lucky of game.lucky) {
      const random = createRng(hashSeed(game.luck, `lady-luck:bot:${bot.id}:${lucky.n}`))
      const after = BOT_SPOTS[0] + random() * (BOT_SPOTS[1] - BOT_SPOTS[0])
      if (game.elapsed - lucky.since >= after) {
        out.push({ player, clover: lucky.clover })
        return
      }
    }

    const window = Math.floor(game.elapsed / BOT_MISS_EVERY)
    if (window <= bot.missWindow) return
    const random = createRng(hashSeed(game.luck, `lady-luck:bot:${bot.id}:miss:${window}`))
    if (random() >= BOT_MISS_CHANCE) {
      bot.missWindow = window
      return
    }
    if (game.elapsed < (window + random()) * BOT_MISS_EVERY) return
    bot.missWindow = window
    const field = fieldFor(game.seed)
    const plain = field.map((_, i) => i).filter((i) => !fourLeaf(game, i))
    out.push({ player, clover: plain[Math.floor(random() * plain.length)] })
  })
  return out
}
