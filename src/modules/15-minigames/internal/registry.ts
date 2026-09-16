/**
 * Where a minigame stops being a tile on a dashboard and becomes a game.
 *
 * Forty-one of these are coming, so the thing that matters is what it costs to
 * add the next one. A build is two functions - the state it starts with, and
 * the screen that draws it - registered against an id from the catalogue. That
 * is the whole seam. Nothing here switches on which game it is, nothing here
 * imports a game, and adding the fortieth costs exactly what adding the first
 * did.
 *
 * **Each minigame keeps its own state, and only it knows the shape.** That is
 * why `newGame` returns `unknown`: Zombie Tag has zombies and survivors,
 * Perfect Game has a coconut and thirty crabs, and there is no useful type
 * that is both. The game that registers a build owns both halves of it, so it
 * is the one place that can narrow its own state - and the one place that
 * should. A common `MinigameRun` wrapper carries what is true of every game
 * regardless: which one it is, and whether it is being briefed, played or
 * over.
 *
 * Empty today, on purpose. Every game in the catalogue is at `template`, so
 * nothing has registered yet and the screen falls back to a template panel for
 * all of them - see `MinigameScreen`.
 */
import type { ReactNode } from 'react'
import type { MinigameId } from './catalogue'

/** Where a game is in its own life. The three every minigame has. */
export type RunPhase = 'briefing' | 'playing' | 'over'

export interface MinigameRun {
  id: MinigameId
  phase: RunPhase
  /**
   * The game's own state, in whatever shape that game needs.
   *
   * `null` for a game that has no build yet, which is all of them. See the
   * note at the top of this file for why this is not typed more tightly.
   */
  game: unknown
}

export interface MinigameBuild {
  /** The state this game starts a run with. Its shape is the game's business. */
  newGame: () => unknown
  /** What the screen draws while this game is the one open. */
  Panel: () => ReactNode
}

const BUILDS = new Map<MinigameId, MinigameBuild>()

/**
 * Hands a built game to the screen.
 *
 * Call it once, at module load, from the file that owns the game. Registering
 * twice against one id replaces the first - which is what you want while a
 * module is hot-reloading, and never happens otherwise.
 */
export function registerMinigame(id: MinigameId, build: MinigameBuild): void {
  BUILDS.set(id, build)
}

/** The build for a game, or `null` while it is still only a catalogue entry. */
export function buildFor(id: MinigameId): MinigameBuild | null {
  return BUILDS.get(id) ?? null
}

/** Whether this one can actually be played yet. */
export function isBuilt(id: MinigameId): boolean {
  return BUILDS.has(id)
}

/** Everything registered so far, for the dashboard's count and for tests. */
export function builtMinigames(): readonly MinigameId[] {
  return [...BUILDS.keys()]
}

/**
 * Empties the registry.
 *
 * For tests, which register fake builds to prove the seam works and must not
 * leave them lying around for the next test to find.
 */
export function forgetBuilds(): void {
  BUILDS.clear()
}

/**
 * A run of one game, at its beginning.
 *
 * Pure: the state it starts with comes from the game's own build, or is `null`
 * when there is no build to ask. Separate from the store that holds it so the
 * interesting half can be tested without mounting anything.
 */
export function freshRun(id: MinigameId): MinigameRun {
  const build = buildFor(id)
  return { id, phase: 'briefing', game: build ? build.newGame() : null }
}
