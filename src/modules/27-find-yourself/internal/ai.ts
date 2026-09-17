/**
 * The stand-ins.
 *
 * A stand-in watches the shuffle like anybody, and loses track like anybody: it
 * picks its own cup four times in five in the first stage, a little over half
 * the time in the second, and a third of the time in the third - otherwise
 * another cup at random. It takes a moment to decide.
 *
 * Seeded by the game, the stand-in and the stage, so the same game plays out the
 * same way. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { cupCount, currentStage, facesBySlot, type Game } from './rules'

/** The chance a stand-in tracks its own cup, by stage. */
export const BOT_TRACKS: readonly number[] = [0.8, 0.55, 0.35]
/** How long a stand-in takes to pick, least and most. */
export const BOT_DECIDES: readonly [number, number] = [1.2, 4]

/** The picks the stand-ins make this frame. */
export function botPicks(game: Game): { player: number; slot: number }[] {
  const out: { player: number; slot: number }[] = []
  if (game.phase !== 'pick') return out
  const cups = cupCount(game.players.length)
  const bySlot = facesBySlot(currentStage(game))
  game.players.forEach((bot, player) => {
    if (!bot.bot || bot.picks[game.stage] !== null) return
    const random = createRng(hashSeed(game.seed, `find-yourself:bot:${bot.id}:${game.stage}`))
    const decides = BOT_DECIDES[0] + random() * (BOT_DECIDES[1] - BOT_DECIDES[0])
    if (game.clock < decides) return
    const own = bySlot.indexOf(player)
    if (random() < BOT_TRACKS[game.stage]) {
      out.push({ player, slot: own })
    } else {
      const others = Array.from({ length: cups }, (_, s) => s).filter((s) => s !== own)
      out.push({ player, slot: others[Math.floor(random() * others.length)] })
    }
  })
  return out
}
