/**
 * 01-terrain - the public contract.
 *
 * The height function is the load-bearing part of this module and of a good
 * deal of the project: trees will sit on it, water will meet it, physics will
 * sample it, a character will walk on it. Treat it as the single source of
 * truth for where the ground is and what it is made of.
 *
 * Metres. +Y up. Sea level is exactly 0, so land is simply height > 0.
 */

export {
  TERRAIN,
  SEA_LEVEL,
  heightAt,
  heightAtBatch,
  sampleAt,
  slopeAt,
  surfaceAt,
  isLand,
  worldBounds,
  type TerrainConfig,
  type TerrainSample,
  type Surface,
} from './internal/island'

export { Terrain } from './internal/TerrainView'
