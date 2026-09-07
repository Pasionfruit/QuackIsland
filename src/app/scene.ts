/**
 * The scene registry - the one mutable seam in the whole project.
 *
 * A new module appends one line here and edits nothing else. This file is
 * never frozen, on purpose: react-three-fiber composes by children, so
 * something has to stay writable or nothing could ever be added.
 *
 * `enabled` is the practical payoff: while gating a module you can switch
 * everything else off and look at it on its own.
 */
import { createElement } from 'react'
import type { SceneEntry } from '../modules/00-core'
import { Terrain } from '../modules/01-terrain'
import { Player } from '../modules/02-player'
import { Footprints } from '../modules/03-footprints'
import { Water, swellAt } from '../modules/04-water'
import { Sky } from '../modules/06-sky'
import { Shore } from '../modules/07-shore'
import { AudioCues } from '../modules/08-audio'
import { NetPlayers } from '../modules/09-net'

/**
 * The player, floating on the actual swell rather than on a flat mean level -
 * on an ocean that heaves the better part of a metre a body held at the mean
 * would submerge and surface as the crests went past.
 *
 * Handing the swell to the player is this file's job and not the player's:
 * `02-player` importing `04-water` would be backwards, and would stop the
 * player ever being frozen before the sea is. The player takes an optional
 * "where is the surface" function and knows nothing else about water.
 *
 * With the sea switched off there is no swell to ride, so the surface goes
 * flat - but the player still swims, because that decision comes from the
 * terrain. Walking into the sea with the water module off is the check that
 * the seam is the right way round.
 */
const PlayerOnSea = () =>
  createElement(Player, {
    surfaceAt: (x: number, z: number, time: number) => (waterVisible() ? swellAt(x, z, time) : 0),
  })

/** Whether the sea is currently being drawn. Read per frame; it is a toggle. */
function waterVisible(): boolean {
  return SCENE.find((e) => e.id === '04-water')?.enabled ?? false
}

export const SCENE: SceneEntry[] = [
  { id: '01-terrain', order: 10, enabled: true, Component: Terrain },
  { id: '02-player', order: 20, enabled: true, Component: PlayerOnSea },
  { id: '03-footprints', order: 30, enabled: true, Component: Footprints },
  { id: '04-water', order: 40, enabled: true, Component: Water },
  { id: '06-sky', order: 60, enabled: true, Component: Sky },
  { id: '07-shore', order: 70, enabled: true, Component: Shore },
  { id: '08-audio', order: 80, enabled: true, Component: AudioCues },
  { id: '09-net', order: 90, enabled: true, Component: NetPlayers },
]

// Toggling a module on or off has to reach the canvas, which is a different
// part of the tree from the panel doing the toggling.
let version = 0
const listeners = new Set<() => void>()

export function sceneVersion(): number {
  return version
}

export function subscribeScene(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setModuleEnabled(id: string, enabled: boolean): void {
  const entry = SCENE.find((e) => e.id === id)
  if (!entry || entry.enabled === enabled) return
  entry.enabled = enabled
  version++
  for (const l of listeners) l()
}
