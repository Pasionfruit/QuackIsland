/**
 * 03-footprints - the public contract.
 *
 * Prints left in the sand as the player walks, fading over about half a
 * minute. Reads the player's live position and the terrain's height and
 * normal; owns nothing else.
 */

export {
  TRAIL,
  createTrail,
  stepTrail,
  fadeOf,
  strideFor,
  type Footprint,
  type TrailConfig,
  type TrailState,
  type Walker,
} from './internal/trail'

export { Footprints } from './internal/FootprintsView'
