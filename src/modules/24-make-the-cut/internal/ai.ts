/**
 * The stand-ins.
 *
 * A stand-in knows no more than anybody: every string looks the same. On its
 * turn it picks one of the three whole strings nearest it, walks over until it
 * is well in reach, thinks for a moment, and cuts. Off its turn it stands where
 * it is.
 *
 * Seeded by the secret, the stand-in and the turn, so the same game plays out
 * the same way. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { TOWER, distanceTo, webFor, whoseTurn, type Game, type Intent } from './rules'

/** How long a stand-in thinks once in reach, least and most. */
export const BOT_THINK: readonly [number, number] = [1.2, 3]

/**
 * The stand-ins' chosen strings, by game, turn and stand-in. Chosen once at the
 * start of a turn - the nearest strings change as a stand-in walks, and a choice
 * that moved with them would never be reached. Keyed by the game's id rather
 * than the object, which the screen copies every frame.
 */
const planned = new Map<string, number>()

/** The string a stand-in means to cut this turn, and how long it thinks first. */
export function botPlan(game: Game, player: number): { string: number; think: number } | null {
  const bot = game.players[player]
  if (!bot) return null
  const random = createRng(hashSeed(game.luck, `make-the-cut:bot:${bot.id}:${game.turns}`))
  const rank = Math.floor(random() * 3)
  const think = BOT_THINK[0] + random() * (BOT_THINK[1] - BOT_THINK[0])

  const key = `${game.id}:${game.seed}:${game.turns}:${player}`
  const held = planned.get(key)
  if (held !== undefined && game.cut[held] === null) return { string: held, think }

  // One of the three whole strings nearest it.
  const whole = Array.from({ length: game.count }, (_, s) => s).filter((s) => game.cut[s] === null)
  if (whole.length === 0) return null
  whole.sort((a, b) => distanceTo(game, player, a) - distanceTo(game, player, b))
  const string = whole[Math.min(rank, whole.length - 1)]
  if (planned.size > 256) planned.clear()
  planned.set(key, string)
  return { string, think }
}

/** Which way each stand-in walks this frame. */
export function botIntents(game: Game): Map<string, Intent> {
  const out = new Map<string, Intent>()
  const turn = whoseTurn(game)
  game.players.forEach((bot, player) => {
    if (!bot.bot || bot.out) return
    if (turn !== player) {
      out.set(bot.id, { x: 0, y: 0 })
      return
    }
    const plan = botPlan(game, player)
    if (!plan) return
    const rim = webFor(game.seed, game.count)[plan.string].rim
    const dx = rim.x - bot.x
    const dy = rim.z - bot.y
    const far = Math.hypot(dx, dy)
    out.set(bot.id, far > TOWER.reach * 0.6 ? { x: dx / far, y: dy / far } : { x: 0, y: 0 })
  })
  return out
}

/** A stand-in's cut, once it is in reach and has thought long enough on its turn. */
export function botCut(game: Game): { player: number; string: number } | null {
  const player = whoseTurn(game)
  if (player === null || !game.players[player]?.bot) return null
  const plan = botPlan(game, player)
  if (!plan || game.clock < plan.think) return null
  if (distanceTo(game, player, plan.string) > TOWER.reach * 0.9) return null
  return { player, string: plan.string }
}
