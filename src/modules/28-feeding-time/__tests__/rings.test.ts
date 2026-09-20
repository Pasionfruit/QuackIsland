/**
 * The outline every ring of a player's colour is drawn with, so that it can be
 * seen on the pond whichever colour it is.
 */
import { describe, expect, it } from 'vitest'
import { OUTLINE, PALETTE } from '../internal/FeedingTimeScene'
import { COLOURS } from '../internal/rules'

/** Relative luminance of a `#rrggbb`, as WCAG has it. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('the rings', () => {
  it('have an outline that stands out against the pond, the sand and the grass', () => {
    for (const ground of [PALETTE.water, PALETTE.sand, PALETTE.grass]) expect(contrast(OUTLINE, ground), ground).toBeGreaterThan(4)
  })

  it('are needed: a player’s blue is almost the pond’s own, and the outline is what tells them apart', () => {
    // The blue that gave the trouble, against the water it lands on: hardly any contrast at all.
    const bluest = Math.min(...COLOURS.map((c) => contrast(c, PALETTE.water)))
    expect(bluest).toBeLessThan(1.3)
    // Every colour that is hard to see against the water has the dark edge round it to see it by.
    for (const c of COLOURS) if (contrast(c, PALETTE.water) < 1.5) expect(contrast(OUTLINE, c), c).toBeGreaterThan(3)
  })
})
