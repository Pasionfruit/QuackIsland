/**
 * The stand-ins.
 *
 * A stand-in's race is a function of the seed and the clock: it clicks, presses
 * and types at its own steady rates from the gun - a little slower than a person
 * going all out - and its typing loses a little time to mistakes. Only ever runs
 * on the host.
 */
import { createRng, hashSeed } from '../../00-core'
import { COURSE, raceClock, sentenceFor, type Race, type Racer, type Self } from './rules'

/** A stand-in's clicks or presses a second, least and most. A person going all out manages about eight. */
export const BOT_MASH: readonly [number, number] = [6, 7.5]
/** A stand-in's characters a second, least and most, mistakes and all. A quick typist manages six or seven. */
export const BOT_TYPE: readonly [number, number] = [3.2, 4.8]
/** How many mistakes a stand-in makes in a sentence, most. */
export const BOT_MISTAKES = 4

/** Where a stand-in's race has got to. */
export function botSelf(race: Race, bot: Racer): Self {
  const random = createRng(hashSeed(race.seed, `sprint-triathlon:bot:${bot.id}`))
  const swimRate = BOT_MASH[0] + random() * (BOT_MASH[1] - BOT_MASH[0])
  const bikeRate = BOT_MASH[0] + random() * (BOT_MASH[1] - BOT_MASH[0])
  const typeRate = BOT_TYPE[0] + random() * (BOT_TYPE[1] - BOT_TYPE[0])
  const mistakes = Math.floor(random() * (BOT_MISTAKES + 1))
  const sentence = sentenceFor(race.seed)

  const t = raceClock(race)
  const swimTime = COURSE.strokes / swimRate
  const bikeTime = COURSE.pedals / bikeRate
  const strokes = Math.min(COURSE.strokes, Math.floor(t * swimRate))
  const pedals = t < swimTime ? 0 : Math.min(COURSE.pedals, Math.floor((t - swimTime) * bikeRate))
  const running = t - swimTime - bikeTime
  const typed = running <= 0 ? 0 : Math.min(sentence.length, Math.floor(running * typeRate))
  const madeSoFar = running <= 0 ? 0 : Math.min(mistakes, Math.floor((typed / sentence.length) * (mistakes + 1)))
  return { strokes, pedals, typed, mistakes: madeSoFar, stumbling: 0 }
}
