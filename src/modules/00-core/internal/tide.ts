/**
 * The tide.
 *
 * A world fact driven by the same clock as the day cycle, which is why it
 * lives here rather than in the water module: the player decides whether it is
 * out of its depth, the footprints decide whether they are under water, and
 * the sea decides where to draw itself. All three already depend on this
 * module, none of them should depend on each other, and the alternative is
 * threading the same number through three sets of props.
 *
 * What it is *not* is sea level. `SEA_LEVEL` stays exactly zero in the terrain
 * module and stays the datum everything measures from. This is the offset from
 * it, so the still-water line at any moment is `SEA_LEVEL + tideAt(t)`.
 *
 * Two constituents, because one is visibly a sine and nobody's tide is a sine:
 *
 * - **Semidiurnal**, twice a day. The main swing, and what a tide mostly is.
 * - **Diurnal**, once a day. Small, and its whole job is to make the two high
 *   tides of a day unequal - a higher high water and a lower high water. Real
 *   coasts do this and it is most of what stops the tide reading as a
 *   mechanical pump.
 *
 * Both are locked to the day cycle rather than to real time, so scrubbing the
 * day slider walks the tide through a full cycle. A tide you cannot reach by
 * scrubbing is a tide nobody will ever check.
 */
import { normaliseTime } from './lighting'

export const TIDE = {
  /** Metres above the datum. The twice-a-day swing. */
  semidiurnal: 0.72,
  /** Metres. Once a day, and what makes the day's two high tides unequal. */
  diurnal: 0.26,
  /**
   * Where in the day the tide sits at the start of the cycle, in turns.
   * Chosen so the day's higher high water falls in daylight, where it can
   * actually be looked at.
   */
  phase: 0.16,
} as const

/** The furthest the water can get from the datum, either way. */
export const TIDE_MAX = TIDE.semidiurnal + TIDE.diurnal

/** Lowest low water to highest high water, in metres. */
export const TIDE_RANGE = TIDE_MAX * 2

/**
 * Height of the still-water line above the datum at a moment of the day, in
 * metres. Pure, continuous, and periodic over one day.
 *
 * `dayTime` is a turn of the day cycle - 0 dawn, 0.25 daylight, 0.5 dusk,
 * 0.75 night - which is exactly what `getDayTime` returns. Values outside
 * 0..1 wrap, so yesterday and tomorrow both work.
 */
export function tideAt(dayTime: number): number {
  const u = normaliseTime(dayTime)
  const turn = Math.PI * 2
  return (
    TIDE.semidiurnal * Math.sin(turn * (2 * u + TIDE.phase)) +
    TIDE.diurnal * Math.sin(turn * (u + TIDE.phase))
  )
}

/**
 * Whether the tide is coming in or going out, for a readout. Derived from the
 * slope rather than tracked, so it cannot get out of step with the level.
 */
export function tideRising(dayTime: number): boolean {
  const ahead = 1 / 720
  return tideAt(dayTime + ahead) > tideAt(dayTime)
}
