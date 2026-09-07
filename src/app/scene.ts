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
import type { SceneEntry } from '../modules/00-core'
import { Terrain } from '../modules/01-terrain'
import { Player } from '../modules/02-player'

export const SCENE: SceneEntry[] = [
  { id: '01-terrain', order: 10, enabled: true, Component: Terrain },
  { id: '02-player', order: 20, enabled: true, Component: Player },
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
