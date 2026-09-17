/**
 * The stand-ins.
 *
 * A stand-in picks a duck that is not eating, works out where it will be when a
 * cracker gets there, and throws - a little off, as hands are: the lean up to
 * seven degrees out, the distance up to a sixth. Some throws feed, some splash.
 * It throws every 1.1 to 2 seconds, slower than somebody flicking hard.
 *
 * Seeded by the game, the stand-in and how many throws it has made, so the same
 * round plays out the same way. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { POND, canThrow, duckAt, ducksFor, flightTime, spotOf, type Game, type Throw } from './rules'

/** How long between a stand-in's throws, least and most. */
export const BOT_EVERY: readonly [number, number] = [1.1, 2]
/** How far off a stand-in's lean can be, radians, and its distance, as a share. */
export const BOT_AIM = { lean: 0.13, distance: 0.16 } as const

/** The throws the stand-ins make this frame. */
export function botThrows(game: Game): { player: number; thrown: Throw }[] {
  const out: { player: number; thrown: Throw }[] = []
  if (game.over) return out
  const ducks = ducksFor(game.seed, game.eating.length)
  game.players.forEach((bot, player) => {
    if (!bot.bot || !canThrow(game, player)) return
    const random = createRng(hashSeed(game.seed, `feeding-time:bot:${bot.id}:${bot.throws}`))
    const wait = BOT_EVERY[0] + random() * (BOT_EVERY[1] - BOT_EVERY[0])
    if (game.elapsed - Math.max(bot.thrownAt, 0) < wait) return

    const from = spotOf(player, game.players.length)
    const hungry = ducks.map((_, i) => i).filter((i) => game.eating[i] <= game.elapsed + 0.5)
    if (hungry.length === 0) return
    const target = hungry[Math.floor(random() * hungry.length)]
    // Lead the duck: aim where it will be once the cracker arrives, twice over.
    let at = duckAt(ducks[target], game.elapsed)
    for (let i = 0; i < 2; i++) {
      const distance = Math.hypot(at.x - from.x, at.z - from.z)
      at = duckAt(ducks[target], game.elapsed + flightTime(distance))
    }
    const angle = Math.atan2(at.x - from.x, from.z - at.z) + (random() * 2 - 1) * BOT_AIM.lean
    const distance = Math.hypot(at.x - from.x, at.z - from.z) * (1 + (random() * 2 - 1) * BOT_AIM.distance)
    if (Math.abs(angle) > POND.lean) return
    out.push({ player, thrown: { angle, distance } })
  })
  return out
}
