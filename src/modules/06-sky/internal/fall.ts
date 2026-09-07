/**
 * How rain and snow differ.
 *
 * One particle system draws both; these are the only things that change
 * between them. Kept out of the component so the numbers can be read, argued
 * with and tested without a canvas.
 */

export interface FallStyle {
  /** Half-width of a particle, in metres. */
  width: number
  /** Half-height. Rain is a streak, so this is much larger than the width. */
  height: number
  /** Metres per second, used when the weather does not say. */
  fall: number
  /** How far it wanders sideways on the way down, in metres. */
  drift: number
  /** 0 draws a streak, 1 draws a disc. */
  round: number
  opacity: number
  color: string
}

export const PRECIPITATION = {
  /**
   * The box of air around the camera that has weather in it, in metres.
   *
   * Big enough that its edge is never the thing you notice, small enough that
   * a few thousand particles still fill it.
   */
  box: 90,
  boxHeight: 60,
  /**
   * Particles allocated once, up front. Weather thins this out by fading the
   * tail of the list rather than rebuilding the buffers.
   */
  max: 5200,
  /** Seconds for precipitation to fade in or out. */
  fade: 2.5,

  rain: {
    width: 0.022,
    height: 0.62,
    fall: 26,
    drift: 0,
    round: 0,
    opacity: 0.34,
    color: '#cfe6f2',
  } as FallStyle,

  snow: {
    width: 0.05,
    height: 0.05,
    fall: 2.2,
    // Snow does not fall so much as get lost on the way down.
    drift: 0.55,
    round: 1,
    opacity: 0.85,
    color: '#ffffff',
  } as FallStyle,
} as const
