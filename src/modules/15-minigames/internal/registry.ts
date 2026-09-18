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
 * One game in it today: Zombie Tag, from `16-zombie-tag`, which registers
 * itself when that module is imported. The other forty have no build, so the
 * screen briefs them and then says so - see `MinigameScreen`.
 */
import type { ReactNode } from 'react'
import type { MinigameId } from './catalogue'
import type { Pauser } from './pause'

/**
 * Where a game is in its own life. The four every minigame has.
 *
 * `briefing` is reading about it, `counting` is the three-two-one, `playing`
 * is the game itself, `over` is afterwards. Every game gets the same four, so
 * a countdown is something the screen does rather than something forty-one
 * games each have to remember to do.
 */
export type RunPhase = 'briefing' | 'counting' | 'playing' | 'over'

export interface MinigameRun {
  id: MinigameId
  phase: RunPhase
  /** Seconds left of the three-two-one. Only meaningful while `counting`. */
  countdown: number
  /**
   * Stopped where it stands, with a card over it.
   *
   * **Shared**: anybody can stop the round and it stops for everybody. This is
   * the one thing a guest can press that moves every screen in the lobby - see
   * `pause.ts` for why, and for who is allowed to start it again.
   *
   * A game's own panel is handed this and is expected to stop dead on it, the
   * host's simulation included. A round that kept running behind the card would
   * make the card a lie.
   */
  paused: boolean
  /**
   * Who stopped it, or `null` while it is running.
   *
   * Always in step with `paused` - the two are only ever set together, by
   * `pauseRun` and `resumeRun` - and kept as two fields rather than one because
   * every game already reads the boolean and none of them care who.
   */
  pausedBy: Pauser | null
  /**
   * The game's own state, in whatever shape that game needs.
   *
   * `null` for a game that has no build yet, which is all of them. See the
   * note at the top of this file for why this is not typed more tightly.
   */
  game: unknown
}

/** How long the three-two-one runs, in seconds. Three, counted down to go. */
export const COUNT_FROM = 3

export interface MinigameBuild {
  /** The state this game starts a run with. Its shape is the game's business. */
  newGame: () => unknown
  /**
   * What the screen draws while this game is the one open.
   *
   * Handed the run, because the wrapper carries things a game has to obey and
   * cannot work out for itself - `paused`, above all. A game that kept
   * simulating through a pause card would be a pause card with a game going on
   * behind it.
   */
  Panel: (props: { run: MinigameRun }) => ReactNode
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
  return { id, phase: 'briefing', countdown: 0, paused: false, pausedBy: null, game: build ? build.newGame() : null }
}

/**
 * Press play: the briefing gives way to the three-two-one.
 *
 * The state is made **here**, at the start of the countdown, rather than when
 * the game finally begins - so a game that wants to draw its board behind the
 * numbers has a board to draw. Pressing play on a run that is already going is
 * not a restart; it does nothing.
 */
export function beginRun(run: MinigameRun): MinigameRun {
  if (run.phase !== 'briefing') return run
  const build = buildFor(run.id)
  return {
    ...run,
    phase: 'counting',
    countdown: COUNT_FROM,
    paused: false,
    pausedBy: null,
    game: build ? build.newGame() : null,
  }
}

/**
 * Start the whole round again, from the three-two-one and a new game.
 *
 * Not `beginRun` on the run you have - that only moves a briefing on, and a run
 * that is counting or playing is neither. A restart is a fresh run of the same
 * game taken straight to the countdown, which is exactly what `freshRun` and
 * `beginRun` are between them, and is why this is two calls and no new rules.
 */
export function restartRun(run: MinigameRun): MinigameRun {
  return beginRun(freshRun(run.id))
}

/**
 * Advances the countdown, and starts the game when it runs out.
 *
 * Pure, and the only thing that moves a run from `counting` to `playing` - so
 * the whole of "three, two, one, go" can be tested by calling this with a few
 * numbers instead of waiting three real seconds for it.
 */
export function tickRun(run: MinigameRun, dt: number): MinigameRun {
  // A paused countdown does not count. Pressing escape on "two" and coming
  // back to "two" is the only behaviour anybody would expect.
  if (run.phase !== 'counting' || run.paused) return run
  const left = run.countdown - Math.max(0, dt)
  if (left <= 0) return { ...run, phase: 'playing', countdown: 0 }
  return { ...run, countdown: left }
}

/**
 * Whether there is anything to pause: a round on, or a countdown into one.
 *
 * A briefing is not paused, it is just read - so escape on a briefing means
 * what it always meant, which is "take me back".
 */
export function isPausable(run: MinigameRun): boolean {
  return run.phase === 'counting' || run.phase === 'playing'
}

/** Stops it where it stands, and remembers who did. Does nothing to a briefing. */
export function pauseRun(run: MinigameRun, by: Pauser): MinigameRun {
  if (!isPausable(run) || run.paused) return run
  return { ...run, paused: true, pausedBy: by }
}

/** Starts it again from exactly where it stopped. */
export function resumeRun(run: MinigameRun): MinigameRun {
  if (!run.paused) return run
  return { ...run, paused: false, pausedBy: null }
}

/**
 * The number on the screen: 3, 2, 1, or `null` when there is none to show.
 *
 * Rounded **up**, so the three is up for the first second rather than for an
 * instant - counting down from three should show three numbers for a second
 * each, which is what anybody counting along expects.
 */
export function countShown(run: MinigameRun): number | null {
  if (run.phase !== 'counting' || run.countdown <= 0) return null
  return Math.ceil(run.countdown)
}
