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
import { Terrain, heightAt, worldBounds } from '../modules/01-terrain'
import { Player } from '../modules/02-player'
import { Footprints } from '../modules/03-footprints'
import { Water, swellAt } from '../modules/04-water'
import { Sky } from '../modules/06-sky'
import { Shore } from '../modules/07-shore'
import { Rocks, getSolidRocks, onRockAt, resolveRocks, standHeightAt } from '../modules/12-rocks'
import { AudioCues } from '../modules/08-audio'
import { NetPlayers } from '../modules/09-net'
import { ISLAND, Party, groundWithIsland } from '../modules/10-party'
import { getGameMode } from '../modules/13-modes'

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
    groundAt: standOn,
    bounds: currentBounds(),
    collide: pushOutOfRocks,
  })

/**
 * The volcano race, when the volcano race is the game being played.
 *
 * The island itself is drawn either way - it is a place you can swim to, not
 * something conjured when a game starts. What the choice gates is the part
 * that takes over your body: being moved onto the starting line.
 *
 * Deciding it here is the same seam as the ground and the swell. `10-party`
 * has never heard of a catalogue of games, `13-modes` has never heard of a
 * volcano, and this file is the one place allowed to know both.
 */
const PartyIfChosen = () =>
  createElement(Party, { active: () => getGameMode() === 'island', home: spawnSpot })

/**
 * Home: the middle of the spawn island, where a player starts.
 *
 * Read when a party is called off, so it is worked out then rather than
 * remembered from load - the tide moves, and a spot that was above the sand at
 * dawn is under the sea by midday.
 */
function spawnSpot(): { x: number; y: number; z: number } {
  return { x: 0, y: standOn(0, 0) + 0.6, z: 0 }
}

/** Prints land on whatever the ground currently is, for the same reason. */
const PrintsOnGround = () =>
  createElement(Footprints, { groundAt: standOn, printableAt: printableGround })

/** The sea knows about both islands, or it is drawn over one of them. */
const SeaOverBoth = () => createElement(Water, { depthAt: currentGround })

/** Whether the sea is currently being drawn. Read per frame; it is a toggle. */
function waterVisible(): boolean {
  return SCENE.find((e) => e.id === '04-water')?.enabled ?? false
}

/**
 * The ground, everywhere, all the time.
 *
 * Two islands in one sea: the spawn island at the origin and the party island
 * out across the water. Not switched by whether a game is running - the party
 * island is a place that exists, and you can swim to it.
 *
 * Deciding it here rather than in either module is the point: the player does
 * not know a board game exists, and the party module does not know how
 * footprints are drawn. The composition root is the one place allowed to know
 * both.
 *
 * The **sea** is given this too, and has to be: its depth is baked once from a
 * height function, and a sea that had never heard of the party island would be
 * drawn straight over the top of it.
 */
function currentGround(x: number, z: number): number {
  return groundWithIsland(x, z, heightAt)
}

/**
 * The ground, plus the tops of any rocks you are standing over.
 *
 * What the player and the footprints walk on. Standing on a rock is nothing
 * more than this: the ground reports the top of the rock, and everything the
 * player already does - falling, landing, the ground snap - works on a boulder
 * without knowing a boulder exists.
 *
 * The **sea** deliberately does not get this one. Its depth is baked once over
 * a hundred and thirty thousand vertices, and asking each of them about four
 * hundred rocks would be sixty million checks to make the water very slightly
 * shallower beside some boulders.
 */
function standOn(x: number, z: number): number {
  return standHeightAt(x, z, getSolidRocks(), currentGround(x, z))
}

/**
 * Pushes the body out of any rock it has walked into.
 *
 * This has to exist *because* of `standOn`: a ground function that reports the
 * top of a three-metre boulder will teleport you up it the moment you touch
 * its edge, because the controller snaps up to the ground whenever it finds
 * itself below it. Anything worth climbing has to be solid enough to stop you
 * walking through.
 */
function pushOutOfRocks(x: number, z: number, feetY: number, radius: number) {
  return resolveRocks(x, z, feetY, radius, getSolidRocks())
}

/**
 * Whether a footprint may be left here.
 *
 * Sand takes a print and stone does not. It matters more than it sounds,
 * because footprints are tilted by the *island's* normal - so a print left on
 * top of a boulder would lie flat on a rock that is not flat, at a height
 * decided by something it is not touching.
 */
function printableGround(x: number, z: number): boolean {
  return !onRockAt(x, z, getSolidRocks(), currentGround(x, z))
}

/**
 * How far you may wander.
 *
 * Wide enough to reach the party island and swim back, and no wider - past
 * this there is nothing but the edge of the sea plane, which is not a thing
 * anybody should be able to walk up to.
 */
function currentBounds(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const island = worldBounds()
  const margin = ISLAND.foot + 30
  return {
    minX: Math.min(island.minX, ISLAND.centreX - margin),
    maxX: Math.max(island.maxX, ISLAND.centreX + margin),
    minZ: Math.min(island.minZ, ISLAND.centreZ - margin),
    maxZ: Math.max(island.maxZ, ISLAND.centreZ + margin),
  }
}

export const SCENE: SceneEntry[] = [
  { id: '01-terrain', order: 10, enabled: true, Component: Terrain },
  { id: '02-player', order: 20, enabled: true, Component: PlayerOnSea },
  { id: '03-footprints', order: 30, enabled: true, Component: PrintsOnGround },
  { id: '04-water', order: 40, enabled: true, Component: SeaOverBoth },
  { id: '06-sky', order: 60, enabled: true, Component: Sky },
  { id: '07-shore', order: 70, enabled: true, Component: Shore },
  { id: '12-rocks', order: 75, enabled: true, Component: Rocks },
  { id: '08-audio', order: 80, enabled: true, Component: AudioCues },
  { id: '09-net', order: 90, enabled: true, Component: NetPlayers },
  { id: '10-party', order: 100, enabled: true, Component: PartyIfChosen },
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
