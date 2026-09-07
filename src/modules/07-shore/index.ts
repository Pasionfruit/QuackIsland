/**
 * 07-shore - the public contract.
 *
 * Shells and coloured pebbles along the water's edge. Reads the terrain's
 * height and slope to decide where things wash up; owns nothing else and
 * changes nothing about the ground it sits on.
 */

export {
  PALETTES,
  SHORE,
  scatterKind,
  scatterShore,
  type Ground,
  type Placement,
  type ScatterOptions,
  type ShoreKind,
} from './internal/scatter'

export { Shore } from './internal/ShoreView'
