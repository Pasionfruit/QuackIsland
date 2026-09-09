/**
 * 04-water - the public contract.
 *
 * The sea, sitting at exactly the sea level the terrain module fixes at zero.
 * It renders and nothing else: whether a thing is in water is decided from the
 * terrain's height, not from here, so the player still swims with this module
 * switched off.
 */

export {
  SWELL,
  SWELL_MAX,
  swellAt,
  swellDisplace,
  swellGlsl,
  swellNormal,
  waveSpeed,
  type SwellWave,
} from './internal/swell'
export { DEEP_AT, WATER_HALF, WATER_SEGMENTS, Water, type WaterProps } from './internal/WaterView'
