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
import type { Standing } from './podium'

/**
 * Where a game is in its own life. The six every minigame has.
 *
 * `briefing` is reading about it. `fading` is the screen going black over the
 * top of that. `counting` is the three-two-one - **over the game**, which is
 * mounted and drawn by then and simply not running yet. `playing` is the game
 * itself. `finishing` is two seconds of **Finish** with the game dimming behind
 * it, and `over` is the results.
 *
 * Every game gets the same six, so none of them has to remember to count down,
 * fade, or say Finish.
 */
export type RunPhase = 'briefing' | 'fading' | 'counting' | 'playing' | 'finishing' | 'over'

/**
 * How long each of the timed phases lasts, in seconds.
 *
 * `fade` is the black wiping in over the briefing. The game is mounted at the
 * far end of it, under a screen that is already fully black, so the first frame
 * of a three.js canvas - the expensive one - happens where nobody can see it.
 *
 * `dim` is the two seconds after a round ends: **Finish** over the top, the game
 * going dark behind it, and then the results.
 */
export const FADE = { in: 0.55, dim: 2 } as const

export interface MinigameRun {
  id: MinigameId
  phase: RunPhase
  /**
   * Seconds left of whichever timed phase this is: the fade in, the
   * three-two-one, or the two seconds of Finish. Zero the rest of the time.
   */
  countdown: number
  /**
   * How many times this run has been started, counting restarts.
   *
   * It is the game's identity as far as React is concerned: the screen keys the
   * game's panel on it, so a restart takes the panel down and puts a new one
   * up. Without it a restart would hand the same panel a new `run` and the
   * panel would carry on with the state it already had in its own `useState`,
   * which is every game's, and the round would not restart at all.
   */
  started: number
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
  /**
   * How everybody came out, as the game said when it finished - or `null`
   * until then, and for a game that did not say. What the podium is drawn
   * from; see `podium.ts`.
   */
  standings: Standing[] | null
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
  /**
   * The game counts its own three-two-one, later than the screen would.
   *
   * Pet Race opens on ten seconds of choosing a pet, and the race is what gets
   * counted in, not the choosing. For a game like that the screen only lifts
   * the black off it - no numbers, no sound - and the game shows `CountOver`
   * when its own moment comes, so the count looks and sounds the same.
   */
  ownCountdown?: boolean
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
  return { id, phase: 'briefing', countdown: 0, started: 0, paused: false, pausedBy: null, game: build ? build.newGame() : null, standings: null }
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
    phase: 'fading',
    countdown: FADE.in,
    started: run.started + 1,
    paused: false,
    pausedBy: null,
    game: build ? build.newGame() : null,
    standings: null,
  }
}

/**
 * The round is over: two seconds of **Finish** before the results.
 *
 * Called by the game, because the game is the only thing that knows - and it
 * hands over how everybody came out while it is at it, which is what the
 * podium is drawn from. It is the one thing a build has to say out loud, and saying it twice is nothing - which
 * matters, because it is said from a React effect watching a flag.
 *
 * Also from `over`: a game's own "again" button starts a new round inside a run
 * that is already over, and that round ending deserves its Finish as much as the
 * first one did. `useFinish` only says it on the edge, so this is never a loop.
 */
export function finishRun(run: MinigameRun, standings: readonly Standing[] | null = null): MinigameRun {
  if (run.phase !== 'playing' && run.phase !== 'over') return run
  return { ...run, phase: 'finishing', countdown: FADE.dim, paused: false, pausedBy: null, standings: standings ? [...standings] : null }
}

/**
 * Start the whole round again, from the three-two-one and a new game.
 *
 * Not `beginRun` on the run you have - that only moves a briefing on, and a run
 * that is counting or playing is neither. A restart is a fresh run of the same
 * game taken **straight to black and the count**: it cuts to the curtain rather
 * than fading down over the briefing, because the briefing is not what anybody
 * was looking at, and flashing it up just to cover it again is the description
 * screen coming back for half a second.
 */
export function restartRun(run: MinigameRun): MinigameRun {
  const begun = beginRun(freshRun(run.id))
  // Carries the count on rather than starting it over, so the panel that is up
  // is never handed the key it already has.
  return { ...begun, phase: 'counting', countdown: countLength(begun), started: run.started + 1 }
}

/**
 * How long this game's `counting` lasts: the three-two-one, or - for a game
 * that counts for itself - only as long as the black takes to lift.
 */
export function countLength(run: MinigameRun): number {
  return buildFor(run.id)?.ownCountdown ? FADE.in : COUNT_FROM
}

/** Whether the screen counts this game in, or leaves it to the game. */
export function screenCounts(run: MinigameRun): boolean {
  return !buildFor(run.id)?.ownCountdown
}

/** What each timed phase gives way to, and with how long on the clock. */
const NEXT: Partial<Record<RunPhase, { phase: RunPhase; countdown: number }>> = {
  fading: { phase: 'counting', countdown: COUNT_FROM },
  counting: { phase: 'playing', countdown: 0 },
  finishing: { phase: 'over', countdown: 0 },
}

/**
 * Advances whichever clock is running, and moves the phase on when it runs out.
 *
 * Pure, and the only thing that moves a run between the timed phases - so the
 * whole of "black, three, two, one, go" and "Finish, dim, results" can be
 * tested by calling this with a few numbers instead of waiting for it.
 */
export function tickRun(run: MinigameRun, dt: number): MinigameRun {
  // A paused countdown does not count. Pressing escape on "two" and coming
  // back to "two" is the only behaviour anybody would expect.
  const next = NEXT[run.phase]
  if (!next || run.paused) return run
  const left = run.countdown - Math.max(0, dt)
  if (left > 0) return { ...run, countdown: left }
  // What is left over runs on into the phase after. A frame the browser did not
  // give us must not make the three-two-one take four seconds, and a step long
  // enough to cross two phases has to cross both.
  const moved = { ...run, ...next }
  if (moved.phase === 'counting') moved.countdown = countLength(moved)
  return tickRun(moved, -left)
}

/** Whether the screen has a clock to run down just now. */
export function isTimed(run: MinigameRun): boolean {
  return NEXT[run.phase] !== undefined
}

/**
 * How black the screen is over the game, 0 to 1.
 *
 * One number for three different moments, because they are the same curtain:
 * down over the briefing, up off the game once it has loaded, and down again
 * over a round that has ended.
 */
export function curtain(run: MinigameRun): number {
  if (run.phase === 'fading') return 1 - run.countdown / FADE.in
  if (run.phase === 'counting') return Math.max(0, (run.countdown - (countLength(run) - FADE.in)) / FADE.in)
  if (run.phase === 'finishing') return 1 - run.countdown / FADE.dim
  return 0
}

/** Whether the game is mounted and drawn, whether or not it is running yet. */
export function isShowingGame(run: MinigameRun): boolean {
  return run.phase === 'counting' || run.phase === 'playing' || run.phase === 'finishing' || run.phase === 'over'
}

/**
 * Whether the game must be standing still, however it is being drawn.
 *
 * The three-two-one is the game mounted and frozen rather than a screen of its
 * own, and every game already stops dead when it is told it is paused - so this
 * is the same lever, pulled for a different reason. See `MinigameScreen`.
 */
export function isHeld(run: MinigameRun): boolean {
  return run.phase === 'counting'
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
  if (run.phase !== 'counting' || run.countdown <= 0 || !screenCounts(run)) return null
  return Math.ceil(run.countdown)
}
