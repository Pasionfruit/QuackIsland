/**
 * How the stand-ins shoot.
 *
 * A stand-in only exists so a game alone has somebody to beat, so it should be
 * beatable and look like a person: it takes a moment after its cooldown to line
 * up a shot, goes for one of its own balloons, and misses about a third of the
 * time. Seeded by the game, the stand-in and how many shots it has taken, so
 * the same game plays out the same way.
 */
import { createRng, hashSeed } from '../../00-core'
import { ARENA, balloonAt } from './arena'
import type { Fire, Game } from './game'

/** How often a stand-in's shot lands. */
export const BOT_ACCURACY = 0.65
/** How long, least and most, a stand-in takes to line up after it could shoot. */
export const BOT_AIM: readonly [number, number] = [0.35, 1.4]

/** The shot a stand-in takes this frame, or `null` if it is not shooting yet. */
export function botShot(game: Game, index: number): Fire | null {
  const bot = game.players[index]
  if (!bot || !bot.bot || game.over || bot.cooldown > 0) return null

  const random = createRng(hashSeed(game.seed, `duck-hunt:bot:${bot.id}:${bot.shots}`))
  const aim = BOT_AIM[0] + random() * (BOT_AIM[1] - BOT_AIM[0])
  const since = bot.lastShot ? game.elapsed - bot.lastShot.at - ARENA.cooldown : game.elapsed
  if (since < aim) return null

  // Its own balloons that are up and not popped, highest first: the ones about
  // to float away are the ones to go for.
  const mine = game.balloons
    .filter((b) => b.owner === index && !game.popped.has(b.id))
    .map((b) => ({ balloon: b, at: balloonAt(b, game.elapsed) }))
    .filter((x): x is { balloon: typeof x.balloon; at: NonNullable<typeof x.at> } => x.at !== null)
    .sort((a, b) => b.at.y - a.at.y)
  if (mine.length === 0) return null

  const target = mine[Math.floor(random() * Math.min(mine.length, 3))]
  if (random() < BOT_ACCURACY) return { shooter: index, balloon: target.balloon.id, point: target.at }
  // A miss: just wide of it.
  const off = (random() < 0.5 ? -1 : 1) * (ARENA.radius + 0.4 + random())
  return { shooter: index, balloon: null, point: { ...target.at, x: target.at.x + off } }
}

/** Every stand-in's shot this frame. */
export function botShots(game: Game): Fire[] {
  const out: Fire[] = []
  game.players.forEach((player, index) => {
    if (!player.bot) return
    const shot = botShot(game, index)
    if (shot) out.push(shot)
  })
  return out
}
