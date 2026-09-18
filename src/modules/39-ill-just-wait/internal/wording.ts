/**
 * The targets, and the words they are said in.
 *
 * A time on a twelve-hour clock is a number of minutes past twelve, 0 to 719.
 * Every target is picked first and the words are built backwards from
 * it, so whatever the sentence says, the answer is the number it was built
 * from - there is no parsing anywhere, and no way for the two to disagree.
 *
 * **Each target is said harder than the one before.**
 *
 * 1. Against the hour: "seventeen minutes past 4", "twenty-three to 9",
 *    "quarter till 12".
 * 2. Against a precise time: "Quarter till 4:05", "nineteen minutes after
 *    10:48" - an offset from a clock reading rather than from the hour.
 * 3. Two steps: an offset of hours and minutes from a time that is itself in
 *    words ("An hour and eleven minutes before twenty to 3"), a time it will
 *    be ("In two hours and six minutes it will be 1:14"), a time it was, or
 *    the time halfway between two others.
 *
 * Minutes are mostly not multiples of five, and more so each time. Nothing
 * lands on 12:00 exactly, because that is where every clock starts.
 */
import { createRng, hashSeed } from '../../00-core'

/** Minutes round a twelve-hour clock. */
export const DIAL = 720

/** How many targets a game has - three, one after another. */
export const TARGETS = 3

/** Wraps any number of minutes onto the clock, 0 to 719. */
export function wrap(minutes: number): number {
  return ((Math.round(minutes) % DIAL) + DIAL) % DIAL
}

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
]
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty']

/** 0 to 59 in words: "seventeen", "forty-two". */
export function numberWord(n: number): string {
  if (n < 20) return ONES[n]
  const ones = n % 10
  return ones ? `${TENS[Math.floor(n / 10)]}-${ONES[ones]}` : TENS[Math.floor(n / 10)]
}

/** The hour a time is in, as a clock face numbers it: 1 to 12. */
export function hourOf(minutes: number): number {
  const h = Math.floor(wrap(minutes) / 60)
  return h === 0 ? 12 : h
}

/** A time as a clock radio shows it: "4:05". */
export function digital(minutes: number): string {
  const m = wrap(minutes)
  return `${hourOf(m)}:${String(m % 60).padStart(2, '0')}`
}

type Random = () => number

const pick = <T>(random: Random, from: readonly T[]): T => from[Math.floor(random() * from.length) % from.length]
const between = (random: Random, lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))

/** A count of minutes on its own: "ten", "seventeen minutes", "one minute". Round numbers go without the word. */
function minutesWord(n: number): string {
  if (n % 5 === 0) return numberWord(n)
  return `${numberWord(n)} minute${n === 1 ? '' : 's'}`
}

/**
 * A time said against the hour, the way people say it: "quarter past 3",
 * "seventeen minutes after 4", "twenty-three to 9", "10 on the dot". The
 * variant is chosen by `random`; every one of them means the same time.
 */
export function wordedTime(minutes: number, random: Random): string {
  const m = wrap(minutes) % 60
  const hour = hourOf(minutes)
  const next = hourOf(minutes + 60)
  if (m === 0) return pick(random, [`${hour} o'clock`, `${hour} on the dot`])
  if (m === 15) return pick(random, [`quarter past ${hour}`, `a quarter after ${hour}`])
  if (m === 30) return `half past ${hour}`
  if (m === 45) return pick(random, [`quarter till ${next}`, `a quarter to ${next}`])
  if (m < 30) return `${minutesWord(m)} ${pick(random, ['past', 'after'])} ${hour}`
  return `${minutesWord(60 - m)} ${pick(random, ['to', 'till', 'before'])} ${next}`
}

/** A length of time: "half an hour", "an hour and a quarter", "two hours and six minutes". */
export function duration(n: number): string {
  const hours = Math.floor(n / 60)
  const m = n % 60
  if (hours === 0) {
    if (m === 15) return 'a quarter of an hour'
    if (m === 30) return 'half an hour'
    if (m === 45) return 'three quarters of an hour'
    return `${numberWord(m)} minute${m === 1 ? '' : 's'}`
  }
  const h = hours === 1 ? 'an hour' : `${numberWord(hours)} hours`
  if (m === 0) return h
  if (m === 15) return `${h} and a quarter`
  if (m === 30) return hours === 1 ? 'an hour and a half' : `${numberWord(hours)} and a half hours`
  return `${h} and ${numberWord(m)} minute${m === 1 ? '' : 's'}`
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export interface Target {
  /** The answer: minutes past twelve, 1 to 719. */
  minutes: number
  /** What goes at the top of the screen. */
  text: string
}

/**
 * The minute of the hour a target lands on. `odd` is the chance of a minute
 * that is not a multiple of five; the rest are the round ones people say.
 */
function targetMinutes(random: Random, odd: number): number {
  for (;;) {
    const hour = between(random, 0, 11)
    let m: number
    if (random() < odd) {
      do m = between(random, 1, 59)
      while (m % 5 === 0)
    } else {
      m = between(random, 0, 11) * 5
    }
    const t = hour * 60 + m
    if (t !== 0) return t
  }
}

/** The first: against the hour. */
function firstWords(random: Random): Target {
  const minutes = targetMinutes(random, 0.55)
  return { minutes, text: capital(wordedTime(minutes, random)) }
}

/** The second: an offset from a precise time - "Quarter till 4:05". */
function secondWords(random: Random): Target {
  const minutes = targetMinutes(random, 0.7)
  const offset = pick(random, [15, 15, 30, 45, 10, 20, between(random, 3, 58), between(random, 3, 58)])
  const before = random() < 0.5
  // "Before 4:05" means the answer is earlier, so the time said is later.
  const base = wrap(before ? minutes + offset : minutes - offset)
  let text: string
  if (offset === 15) {
    const words = before ? ['quarter till', 'quarter to', 'a quarter before'] : ['quarter past', 'a quarter after']
    text = `${pick(random, words)} ${digital(base)}`
  } else {
    const words = before ? ['before', 'till'] : ['after', 'past']
    text = `${duration(offset)} ${pick(random, words)} ${digital(base)}`
  }
  return { minutes, text: capital(text) }
}

/** The third: two steps, in one of four shapes. */
function thirdWords(random: Random): Target {
  const minutes = targetMinutes(random, 0.85)
  const shape = between(random, 0, 3)
  if (shape === 0) {
    // An offset of hours and minutes from a time in words.
    const offset = between(random, 1, 3) * 60 + between(random, 1, 59)
    const before = random() < 0.5
    const base = wrap(before ? minutes + offset : minutes - offset)
    const text = `${duration(offset)} ${before ? pick(random, ['before', 'shy of']) : pick(random, ['after', 'later than'])} ${wordedTime(base, random)}`
    return { minutes, text: capital(text) }
  }
  if (shape === 1) {
    // The time it will be, counted back from.
    const offset = between(random, 37, 200)
    return { minutes, text: `In ${duration(offset)} it will be ${digital(minutes + offset)}` }
  }
  if (shape === 2) {
    // The time it was, counted on from.
    const offset = between(random, 37, 200)
    return { minutes, text: `${capital(duration(offset))} ago it was ${digital(minutes - offset)}` }
  }
  // Halfway between two times, neither of them round.
  const half = between(random, 17, 150)
  return { minutes, text: `Halfway between ${digital(minutes - half)} and ${digital(minutes + half)}` }
}

const WORDINGS = [firstWords, secondWords, thirdWords] as const

/** Target number `index` (0, 1 or 2) of the game dealt with `seed`. */
export function targetFor(seed: number, index: number): Target {
  const r = Math.max(0, Math.min(TARGETS - 1, Math.floor(index)))
  const random = createRng(hashSeed(seed, `ill-just-wait:target:${r}`))
  return WORDINGS[r](random)
}
