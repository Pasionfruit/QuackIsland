/**
 * The stand-ins.
 *
 * A race alone needs somebody to race. A stand-in's controls are not a key and
 * a pointer, so it is not judged the way a person is; instead its whole race is
 * a function of the seed and the clock. It presses at its own steady rate on
 * green, and on each red it has a small chance of slipping - pressing on red, or
 * letting the circle get away - a moment into it.
 */
import { createRng, hashSeed } from '../../00-core'
import { LIGHT, greenBefore, scheduleFor, type Race, type Racer, type Self } from './rules'

/** A stand-in's presses a second, least and most. A person mashing does about eight. */
export const BOT_RATE: readonly [number, number] = [5.5, 7.5]
/** The chance, each red, that a stand-in slips. */
export const BOT_SLIP = 0.1

/** Where a stand-in's race has got to at a moment. */
export function botSelf(race: Race, bot: Racer): Self {
  const random = createRng(hashSeed(race.seed, `i-see-the-light:bot:${bot.id}`))
  const rate = BOT_RATE[0] + random() * (BOT_RATE[1] - BOT_RATE[0])
  const t = race.elapsed

  for (const phase of scheduleFor(race.seed)) {
    if (phase.colour !== 'red' || phase.start > t) continue
    const slip = createRng(hashSeed(race.seed, `i-see-the-light:bot:${bot.id}:red:${phase.red}`))
    if (slip() >= BOT_SLIP) continue
    const at = phase.start + LIGHT.pointerGrace + slip() * (phase.end - phase.start - LIGHT.pointerGrace)
    if (at <= t) {
      return {
        steps: Math.min(LIGHT.steps, Math.floor(greenBefore(race.seed, at) * rate)),
        out: { why: slip() < 0.5 ? 'space' : 'pointer', at },
      }
    }
  }
  return { steps: Math.min(LIGHT.steps, Math.floor(greenBefore(race.seed, t) * rate)), out: null }
}
