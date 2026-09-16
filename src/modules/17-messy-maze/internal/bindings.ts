/**
 * Which letters move you, and what happens to them on a spinning platform.
 *
 * A binding is four letters in a fixed order - **up, left, down, right** - so
 * WASD is literally the string `"WASD"`. Four characters is what goes on the
 * wire, what the HUD draws, and what a test compares; there is no object to
 * keep in step with it.
 *
 * **What a player is holding is letters, not directions.** The keyboard end
 * never decides which way a key goes. It reports "W and D are down", and the
 * rules read that through whatever binding the racer has *at that moment*. So
 * a platform can change your controls between one frame and the next, on the
 * host, and nothing that is holding a key has to be told.
 */
import { createRng, hashSeed } from '../../00-core'
import type { Point } from './maze'

/** What everybody starts with. */
export const START_BINDING = 'WASD'

/** The letters on a standard keyboard, which is every letter there is. */
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** The four directions, in binding order, as screen-space steps. */
const STEPS: readonly Point[] = [
  { x: 0, y: -1 }, // up: towards the far side of the board
  { x: -1, y: 0 }, // left
  { x: 0, y: 1 }, // down
  { x: 1, y: 0 }, // right
]

/** The arrows the HUD puts beside each letter, in binding order. */
export const ARROWS = ['↑', '←', '↓', '→'] as const

/** Whether a string is four different letters. What off the wire has to be. */
export function isBinding(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{4}$/.test(value) && new Set(value).size === 4
}

/**
 * Tidies whatever letters are held into one canonical string.
 *
 * Upper case, A to Z only, each once, in alphabetical order - so "holding W
 * then D" and "holding D then W" are the same message and do not look like a
 * change worth sending. Capped, because nobody holds more than a handful of
 * keys and a client sending the whole alphabet is not playing.
 */
export function heldLetters(keys: Iterable<string>): string {
  const out = new Set<string>()
  for (const raw of keys) {
    const letter = raw.toUpperCase()
    if (letter.length === 1 && letter >= 'A' && letter <= 'Z') out.add(letter)
  }
  return [...out].sort().join('').slice(0, 8)
}

/**
 * Which way a racer is trying to go, given their binding and what is held.
 *
 * Opposite keys cancel, the way they do everywhere else. The result is not
 * normalised - the rules do that - so it is one of nine directions and a test
 * can say exactly which.
 */
export function directionFor(binding: string, held: string): Point {
  let x = 0
  let y = 0
  for (let i = 0; i < 4; i++) {
    if (!held.includes(binding[i])) continue
    x += STEPS[i].x
    y += STEPS[i].y
  }
  return { x, y }
}

/**
 * A fresh binding, after a spin.
 *
 * **Four letters, none of which were in the binding before.** A spin that
 * happened to give you back W for up would be a spin that did nothing, and a
 * spin that moved W from up to left is crueller than random - the key you are
 * already holding would keep you moving, the wrong way. So everything you
 * were pressing stops meaning anything at all, which is exactly the moment the
 * game is about.
 *
 * Seeded by the race, the racer and how many times they have spun, so it is
 * the host's answer and it is the same answer every time the same thing
 * happens.
 */
export function rebind(seed: number, racer: string, spins: number, previous: string): string {
  const random = createRng(hashSeed(seed, `spin:${racer}:${spins}`))
  const pool = [...LETTERS].filter((letter) => !previous.includes(letter))
  // The first four of a shuffle, which is four different letters at random.
  for (let i = 0; i < 4; i++) {
    const pick = i + Math.floor(random() * (pool.length - i))
    const kept = pool[i]
    pool[i] = pool[pick]
    pool[pick] = kept
  }
  return pool.slice(0, 4).join('')
}
