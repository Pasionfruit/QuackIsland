/**
 * 03-footprints - the public contract.
 *
 * Webbed duck prints left in the sand as the player walks, fading over about
 * half a minute. Reads the player's live position and the terrain's height and
 * normal; owns nothing else.
 */

export { DUCK_FOOT, duckFootAt, duckFootGlsl, type Toe } from './internal/foot'

export {
  SELF,
  TRAIL,
  createTrail,
  forgetWalker,
  stepTrail,
  stepTrails,
  fadeOf,
  strideFor,
  type Footprint,
  type TrailConfig,
  type TrailState,
  type Walker,
  type WalkerTrack,
} from './internal/trail'

export { Footprints, addWalker, removeWalker } from './internal/FootprintsView'
