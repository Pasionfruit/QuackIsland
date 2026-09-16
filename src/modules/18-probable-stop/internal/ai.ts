/**
 * What the stand-ins choose.
 *
 * There is nothing to be clever about - which paths hold is chance, decided at
 * the reveal - so a stand-in is only there to be somebody to outlast, and to
 * look like a person while it does: it picks a path, sometimes wanders to
 * another partway through, and confirms at some point before time runs out.
 *
 * Seeded by the game, the round and the stand-in, so it is the same every time
 * - and seeded apart from the paths, so a stand-in knows no more than you do.
 */
import { createRng, hashSeed } from '../../00-core'
import { GAME, type Game, type Intent, type Player } from './game'

export function botIntent(game: Game, player: Player): Intent {
  const random = createRng(hashSeed(game.seed, `probable-stop:bot:${player.id}:${game.round}`))
  const first = Math.floor(random() * GAME.paths)
  const second = Math.floor(random() * GAME.paths)
  const changesAt = GAME.chooseTime * (0.2 + random() * 0.4)
  const confirmsAt = changesAt + (GAME.chooseTime - changesAt) * random() * 0.8

  const elapsed = GAME.chooseTime - game.clock
  return {
    round: game.round,
    pick: elapsed < changesAt ? first : second,
    confirmed: elapsed >= confirmsAt,
  }
}

/** Every stand-in still in, and what it wants this frame. */
export function botIntents(game: Game): Map<string, Intent> {
  const out = new Map<string, Intent>()
  if (game.phase !== 'choosing') return out
  for (const player of game.players) {
    if (player.bot && player.alive) out.set(player.id, botIntent(game, player))
  }
  return out
}
