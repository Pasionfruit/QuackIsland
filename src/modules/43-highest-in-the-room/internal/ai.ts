/**
 * The stand-ins.
 *
 * A stand-in reads the arrow and presses a key, over and over, each at its own
 * pace - a little quicker or slower every time, as a person is - and now and
 * then presses the wrong one. The quickest press about six keys a
 * second; the slowest about three and a half. A slip costs it four blocks, and it is a beat
 * slower on the press after one, as a person is after a mistake.
 *
 * Its own randomness comes from the seed. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { arrowFor, canPress, press, type Arrow, type Game } from './rules'

export const BOT = {
  /** Seconds between presses, quickest and slowest stand-in. */
  interval: [0.17, 0.3] as readonly [number, number],
  /** How much any one press varies either way, as a share of its interval. */
  wobble: 0.3,
  /** How often it presses the wrong key, most careful and least. */
  slip: [0.03, 0.08] as readonly [number, number],
  /** How much longer the press after a slip takes. */
  flustered: 1.8,
} as const

interface Mind {
  random: () => number
  interval: number
  slip: number
  next: number
  at: number
}

/** Keyed by game and stand-in, not held on the game, which the screen copies every frame. */
const minds = new Map<string, Mind>()

function mindFor(game: Game, id: string): Mind {
  const key = `${game.id}:${game.seed}:${id}`
  let mind = minds.get(key)
  if (!mind || game.elapsed < mind.at) {
    const random = createRng(hashSeed(game.seed, `highest-in-the-room:bot:${id}`))
    const interval = BOT.interval[0] + random() * (BOT.interval[1] - BOT.interval[0])
    const slip = BOT.slip[0] + random() * (BOT.slip[1] - BOT.slip[0])
    // A first reaction, then the rhythm.
    mind = { random, interval, slip, next: game.elapsed + 0.25 + random() * 0.3, at: game.elapsed }
    minds.set(key, mind)
    if (minds.size > 64) minds.delete(minds.keys().next().value!)
  }
  mind.at = game.elapsed
  return mind
}

/** Every stand-in presses whatever keys it is due to by now. */
export function botSteer(game: Game): void {
  game.players.forEach((bot, index) => {
    if (!bot.bot || !canPress(game, bot)) return
    const mind = mindFor(game, bot.id)
    // Catch up with every press it was due, however long the frame.
    for (let n = 0; n < 8 && game.elapsed >= mind.next && canPress(game, bot); n++) {
      const right = arrowFor(game, bot)
      const wrong = mind.random() < mind.slip
      const arrow = wrong ? (((right + 1 + Math.floor(mind.random() * 3)) % 4) as Arrow) : right
      const ok = press(game, index, arrow)
      const pace = mind.interval * (1 + (mind.random() * 2 - 1) * BOT.wobble) * (ok ? 1 : BOT.flustered)
      mind.next += pace
    }
  })
}
