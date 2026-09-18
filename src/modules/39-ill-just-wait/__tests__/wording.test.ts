/**
 * The targets: that the words mean the answer.
 *
 * The generator builds its sentences backwards from the answer, so the one
 * thing worth proving is that a reader going forwards gets the same time. The
 * reader below is written separately from the generator - it knows English,
 * not the code - and every sentence from hundreds of seeds goes through it.
 */
import { describe, expect, it } from 'vitest'
import { TARGETS, digital, duration, hourOf, numberWord, targetFor, wordedTime, wrap } from '../internal/wording'

const WORDS = new Map<string, number>()
for (let n = 0; n < 60; n++) WORDS.set(numberWord(n), n)

const num = (s: string): number => {
  const n = WORDS.get(s)
  if (n === undefined) throw new Error(`not a number: ${s}`)
  return n
}

/** "4:05" */
function readDigital(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) throw new Error(`not a time: ${s}`)
  return wrap((Number(m[1]) % 12) * 60 + Number(m[2]))
}

/** "a quarter of an hour", "two and a half hours", "an hour and six minutes". */
function readDuration(s: string): number {
  const fixed: Record<string, number> = { 'a quarter of an hour': 15, 'half an hour': 30, 'three quarters of an hour': 45, 'an hour': 60, 'an hour and a half': 90 }
  if (s in fixed) return fixed[s]
  let m = /^([a-z-]+) minutes?$/.exec(s)
  if (m) return num(m[1])
  m = /^([a-z-]+) and a half hours$/.exec(s)
  if (m) return num(m[1]) * 60 + 30
  m = /^(an hour|([a-z-]+) hours)(?: and (a quarter|([a-z-]+) minutes?))?$/.exec(s)
  if (!m) throw new Error(`not a duration: ${s}`)
  const hours = m[1] === 'an hour' ? 1 : num(m[2])
  const extra = m[3] === undefined ? 0 : m[3] === 'a quarter' ? 15 : num(m[4])
  return hours * 60 + extra
}

/** "quarter past 3", "seventeen minutes after 4", "twenty-three to 9", "10 o'clock". */
function readWorded(s: string): number {
  const hour = (h: string) => (Number(h) % 12) * 60
  let m = /^(\d{1,2}) (?:o'clock|on the dot)$/.exec(s)
  if (m) return wrap(hour(m[1]))
  m = /^(?:a )?quarter (?:past|after) (\d{1,2})$/.exec(s)
  if (m) return wrap(hour(m[1]) + 15)
  m = /^half past (\d{1,2})$/.exec(s)
  if (m) return wrap(hour(m[1]) + 30)
  m = /^(?:a )?quarter (?:till|to) (\d{1,2})$/.exec(s)
  if (m) return wrap(hour(m[1]) - 15)
  m = /^([a-z-]+)(?: minutes?)? (past|after|to|till|before) (\d{1,2})$/.exec(s)
  if (!m) throw new Error(`not a worded time: ${s}`)
  const n = num(m[1])
  return wrap(hour(m[3]) + (m[2] === 'past' || m[2] === 'after' ? n : -n))
}

/** Any target, first, second or third. */
function read(text: string): number {
  const s = text.charAt(0).toLowerCase() + text.slice(1)
  let m = /^(?:quarter till|quarter to|a quarter before) (\d{1,2}:\d{2})$/.exec(s)
  if (m) return wrap(readDigital(m[1]) - 15)
  m = /^(?:quarter past|a quarter after) (\d{1,2}:\d{2})$/.exec(s)
  if (m) return wrap(readDigital(m[1]) + 15)
  m = /^in (.+) it will be (\d{1,2}:\d{2})$/.exec(s)
  if (m) return wrap(readDigital(m[2]) - readDuration(m[1]))
  m = /^(.+) ago it was (\d{1,2}:\d{2})$/.exec(s)
  if (m) return wrap(readDigital(m[2]) + readDuration(m[1]))
  m = /^halfway between (\d{1,2}:\d{2}) and (\d{1,2}:\d{2})$/.exec(s)
  if (m) {
    const a = readDigital(m[1])
    return wrap(a + wrap(readDigital(m[2]) - a) / 2)
  }
  m = /^(.+?) (before|till|after|past) (\d{1,2}:\d{2})$/.exec(s)
  if (m) return wrap(readDigital(m[3]) + (m[2] === 'after' || m[2] === 'past' ? 1 : -1) * readDuration(m[1]))
  // Plain against the hour, or a length of time from a time said that way.
  try {
    return readWorded(s)
  } catch {
    m = /^(.+? (?:minutes?|hours?|a quarter|a half)) (before|shy of|after|later than) (.+)$/.exec(s)
    if (!m) throw new Error(`cannot read: ${s}`)
    return wrap(readWorded(m[3]) + (m[2] === 'after' || m[2] === 'later than' ? 1 : -1) * readDuration(m[1]))
  }
}

const SEEDS = Array.from({ length: 400 }, (_, i) => (i + 1) * 104729)

describe('numbers and times', () => {
  it('says numbers the way people write them', () => {
    expect(numberWord(7)).toBe('seven')
    expect(numberWord(17)).toBe('seventeen')
    expect(numberWord(40)).toBe('forty')
    expect(numberWord(42)).toBe('forty-two')
  })

  it('reads a clock radio', () => {
    expect(digital(0)).toBe('12:00')
    expect(digital(3 * 60 + 50)).toBe('3:50')
    expect(digital(-10)).toBe('11:50')
    expect(hourOf(12 * 60 + 5)).toBe(12)
  })

  it('says a time against the hour', () => {
    const first = () => 0
    expect(wordedTime(3 * 60 + 15, first)).toBe('quarter past 3')
    expect(wordedTime(3 * 60 + 45, first)).toBe('quarter till 4')
    expect(wordedTime(11 * 60 + 45, first)).toBe('quarter till 12')
    expect(wordedTime(4 * 60 + 17, first)).toBe('seventeen minutes past 4')
    expect(wordedTime(8 * 60 + 37, first)).toBe('twenty-three minutes to 9')
    expect(wordedTime(8 * 60 + 40, first)).toBe('twenty to 9')
    expect(wordedTime(4 * 60 + 1, first)).toBe('one minute past 4')
  })

  it('says a length of time', () => {
    expect(duration(15)).toBe('a quarter of an hour')
    expect(duration(30)).toBe('half an hour')
    expect(duration(75)).toBe('an hour and a quarter')
    expect(duration(150)).toBe('two and a half hours')
    expect(duration(126)).toBe('two hours and six minutes')
    expect(duration(61)).toBe('an hour and one minute')
  })

  it('reads "Quarter till 4:05" as 3:50', () => {
    expect(read('Quarter till 4:05')).toBe(3 * 60 + 50)
  })
})

describe('the targets', () => {
  it('means exactly its answer, every time, for every target', () => {
    for (const seed of SEEDS) {
      for (let i = 0; i < TARGETS; i++) {
        const target = targetFor(seed, i)
        expect(read(target.text), `${target.text} (seed ${seed}, target ${i + 1})`).toBe(target.minutes)
      }
    }
  })

  it('never lands on 12:00, where every clock starts', () => {
    for (const seed of SEEDS) for (let i = 0; i < TARGETS; i++) expect(targetFor(seed, i).minutes).toBeGreaterThan(0)
  })

  it('is the same from the same seed', () => {
    expect(targetFor(99, 2)).toEqual(targetFor(99, 2))
  })

  it('is said against the hour first, then against a precise time, then in two steps', () => {
    for (const seed of SEEDS) {
      expect(targetFor(seed, 0).text).not.toMatch(/\d:\d\d/)
      expect(targetFor(seed, 1).text).toMatch(/\d:\d\d$/)
    }
    const shapes = new Set(
      SEEDS.map((seed) => {
        const t = targetFor(seed, 2).text
        return t.startsWith('In ') ? 'will be' : t.includes(' ago it was ') ? 'was' : t.startsWith('Halfway') ? 'halfway' : 'offset'
      }),
    )
    expect([...shapes].sort()).toEqual(['halfway', 'offset', 'was', 'will be'])
  })

  it('mostly lands on unusual minutes, and more so each time', () => {
    const odd = (i: number) => SEEDS.filter((seed) => targetFor(seed, i).minutes % 5 !== 0).length / SEEDS.length
    expect(odd(0)).toBeGreaterThan(0.4)
    expect(odd(1)).toBeGreaterThan(odd(0))
    expect(odd(2)).toBeGreaterThan(odd(1))
  })
})
