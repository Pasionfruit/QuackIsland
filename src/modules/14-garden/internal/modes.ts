/**
 * The three ways Garden Goofs can be played.
 *
 * A second choice under the first one: the lobby picks Garden Goofs, and
 * then picks which of these. Data rather than a switch statement, for the same
 * reason as the game catalogue itself - the lobby draws whatever is in here.
 *
 * None of them is implemented. What is decided is the *shape* of each, because
 * that is what a lobby has to be able to promise before anybody builds it.
 */

export type GardenMode = 'endless' | 'coop' | 'versus'

export interface GardenModeInfo {
  id: GardenMode
  title: string
  blurb: string
}

export const GARDEN_MODES: readonly GardenModeInfo[] = Object.freeze([
  Object.freeze({
    id: 'endless',
    title: 'Endless',
    blurb: 'Waves that keep coming. Hold the lawn for as long as you can.',
  }),
  Object.freeze({
    id: 'coop',
    title: 'Co-op',
    blurb: 'One lawn, six lanes, everybody planting. You hold it between you.',
  }),
  Object.freeze({
    id: 'versus',
    title: 'Versus',
    blurb: 'One side plants the lawn, the other side walks in to take it.',
  }),
]) as readonly GardenModeInfo[]

/**
 * What a lobby plays until somebody says otherwise.
 *
 * Endless, because it is the one that works with one player: a lobby of one
 * should never open on a mode that needs somebody else to turn up.
 */
export const DEFAULT_GARDEN_MODE: GardenMode = 'endless'

export function isGardenMode(value: unknown): value is GardenMode {
  return GARDEN_MODES.some((mode) => mode.id === value)
}

/** The entry for an id. Total on `GardenMode`. */
export function gardenModeById(id: GardenMode): GardenModeInfo {
  return GARDEN_MODES.find((mode) => mode.id === id) ?? GARDEN_MODES[0]
}

/**
 * The fewest players a mode makes sense with.
 *
 * Versus needs two sides and co-op needs somebody to co-operate with; endless
 * does not. The lobby reads this to say so, and to stop a party of one
 * starting a game that cannot begin.
 */
export function needsPlayers(id: GardenMode): number {
  return id === 'endless' ? 1 : 2
}
