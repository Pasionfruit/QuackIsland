/**
 * The stand-ins.
 *
 * A stand-in reads the letter and types it after a reaction of its own - some
 * quicker than others, and never the same twice. Now and then its attention
 * wanders and it is slow; now and then it hits the wrong key, or does not get
 * round to trying at all. Tuned so a person paying attention wins more letters
 * than any one stand-in, but not all of them.
 *
 * Everything it does is worked out from the seed, so the same game plays out
 * the same way. Only ever runs on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { LETTERS, attempt, attemptOf, type Game } from './rules'

export const BOT = {
  /** A stand-in's usual reaction, seconds, the quickest stand-in and the slowest. */
  reaction: [0.6, 0.9] as readonly [number, number],
  /** How far either way a single reaction strays from its usual. */
  jitter: 0.2,
  /** The chance its attention wanders on a letter, and how much slower that makes it. */
  lapse: { chance: 0.12, extra: 0.8 },
  /** The chance it hits the wrong key, and the chance it does not try at all. */
  wrong: 0.07,
  miss: 0.04,
} as const

/** What stand-in `id` will do about letter `index`: when, seconds after it appears, and which key - or nothing. */
export function botPlan(seed: number, id: string, index: number, char: string): { reaction: number; key: string } | null {
  const usual = BOT.reaction[0] + createRng(hashSeed(seed, `keyboard-warrior:bot:${id}`))() * (BOT.reaction[1] - BOT.reaction[0])
  const random = createRng(hashSeed(seed, `keyboard-warrior:bot:${id}:${index}`))
  if (random() < BOT.miss) return null
  let reaction = usual + (random() * 2 - 1) * BOT.jitter
  if (random() < BOT.lapse.chance) reaction += BOT.lapse.extra * (0.5 + random())
  let key = char
  if (random() < BOT.wrong) {
    const others = LETTERS.replace(char, '')
    key = others[Math.floor(random() * others.length)]
  }
  return { reaction, key }
}

/** Every stand-in whose moment has come types its answer. */
export function botType(game: Game): void {
  const letter = game.letter
  if (game.over || letter.closedAt !== null || game.elapsed < letter.appearsAt) return
  game.players.forEach((p, index) => {
    if (!p.bot || p.left || attemptOf(game, index)) return
    const plan = botPlan(game.seed, p.id, letter.index, letter.char)
    if (plan && game.elapsed - letter.appearsAt >= plan.reaction) attempt(game, index, plan.key, plan.reaction)
  })
}
