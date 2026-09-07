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

export const SCENE: SceneEntry[] = [
  { id: '01-terrain', order: 10, enabled: true, Component: Terrain },
]
