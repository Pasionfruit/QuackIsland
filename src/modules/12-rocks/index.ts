/**
 * 12-rocks - the public contract.
 *
 * Rocks of every size around the island, from things you could kick to
 * boulders you have to walk round. Reads the terrain's height and slope to
 * decide where they rest; changes nothing about the ground they sit on.
 *
 * Distinct from `07-shore`, which does pebbles and shells along the water
 * line. A pebble on the strand has been carried there; a boulder is the island
 * showing through.
 */

export {
  ROCKS,
  ROCK_COLOURS,
  scatterClass,
  scatterRocks,
  settleHeight,
  type Ground,
  type Rock,
  type RockClass,
  type RockSize,
  type ScatterOptions,
} from './internal/rocks'

export { Rocks } from './internal/RocksView'
