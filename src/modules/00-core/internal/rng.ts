/**
 * Deterministic randomness.
 *
 * Nothing in a module may call Math.random: a world that cannot be reproduced
 * cannot be tested, and two players would not see the same island. Everything
 * derives from CONVENTIONS.worldSeed through here.
 */

/** mulberry32 - small, fast, good enough for scattering scenery. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Derives a stable sub-seed from a parent seed and a label, so two features can
 * each have their own stream without one shifting the other when it changes.
 */
export function hashSeed(seed: number, label: string): number {
  let h = seed >>> 0
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0
  }
  return h >>> 0
}
