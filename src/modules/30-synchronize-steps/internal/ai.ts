/**
 * The stand-ins.
 *
 * A stand-in knows the game: it wants a number nobody else picks. It guesses the
 * others will do what they did last round, and leans towards the numbers fewest
 * picked then - but it is a lean, not a certainty. It picks some time in the
 * first second and a half of a round.
 *
 * Seeded by the game, the stand-in and the round, so the same game plays out
 * the same way. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { TOWER, type Game } from './rules'

/** When in a round a stand-in picks, least and most. */
export const BOT_PICKS: readonly [number, number] = [0.3, 1.5]

/** The picks the stand-ins make this frame. */
export function botChoices(game: Game): { player: number; pick: number }[] {
  const out: { player: number; pick: number }[] = []
  if (game.phase !== 'choose') return out
  // How many picked each number last round, among everybody.
  const lastCounts = new Map<number, number>(TOWER.options.map((o) => [o, 0]))
  for (const p of game.players) if (p.last && !p.out) lastCounts.set(p.last.pick, (lastCounts.get(p.last.pick) ?? 0) + 1)
  game.players.forEach((bot, player) => {
    if (!bot.bot || bot.out || bot.pick !== null) return
    const random = createRng(hashSeed(game.seed, `synchronize-steps:bot:${bot.id}:${game.round}`))
    const when = BOT_PICKS[0] + random() * (BOT_PICKS[1] - BOT_PICKS[0])
    if (game.clock < when) return
    // Weight each number by how empty it was last time.
    const weights = TOWER.options.map((o) => 1 / (1 + (lastCounts.get(o) ?? 0)))
    const total = weights.reduce((a, b) => a + b, 0)
    let roll = random() * total
    let pick = TOWER.options[0]
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i]
      if (roll <= 0) {
        pick = TOWER.options[i]
        break
      }
    }
    out.push({ player, pick })
  })
  return out
}
