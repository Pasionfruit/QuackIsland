/**
 * The one thing the app mounts, and the only place that decides what is drawn.
 *
 * Three states and nothing else: shut, the dashboard, or one game. A game being
 * briefed is this module's own screen; a game that has started is the game's,
 * if it has registered one, and a placeholder saying so if it has not.
 *
 * **The three-two-one happens over the game.** Press play and the screen goes
 * black over the briefing; the game is mounted behind the black, so its first
 * frame - the expensive one, for anything with a canvas - happens unwatched;
 * then the black lifts off a game that is drawn, standing still, with a number
 * over it. It is held still by being told it is paused, which every game
 * already knows how to obey, so the countdown costs no game a single line.
 *
 * The clock for all of that lives here, and only here. The store has none of
 * its own - it is advanced by whoever is showing it - which is what lets the
 * whole of "black, three, two, one, go" be tested by calling `tickRun` with a
 * few numbers instead of waiting for it.
 *
 * **Escape means two different things, and which one depends on whether
 * anything is running.** On the dashboard or a briefing there is nothing to
 * lose, so it steps back the way the button does. Once a round is counting or
 * playing, stepping back would throw away a round you are in the middle of, so
 * it stops the round - for everybody - and puts a card over it instead. Escape
 * on a card somebody else put up does nothing, for the same reason the buttons
 * on it are theirs: see `Paused` and `pause.ts`.
 */
import { useEffect } from 'react'
import { getNet, useNet } from '../../09-net'
import { Briefing } from './Briefing'
import { Dashboard } from './Dashboard'
import { Paused } from './Paused'
import { Podium } from './PodiumScreen'
import { minigameById } from './catalogue'
import { FONT, ISLAND, bar, body, button, screen, wordmark } from './look'
import { Countdown, Curtain, Finish } from './Transitions'
import { buildFor, isHeld, isPausable, isShowingGame, isTimed, type MinigameRun } from './registry'
import { stopScreenSounds } from './sound'
import {
  backOut,
  pauseMinigame,
  resumeMinigame,
  tickMinigame,
  useMayControl,
  useMinigameScreen,
} from './state'

/** How often the countdown is advanced. Ten a second is smoother than it needs. */
const TICK_MS = 100

export function MinigameScreen() {
  const open = useMinigameScreen()
  const net = useNet()
  const mayControl = useMayControl()
  const showing = open.at !== 'closed'
  const run = open.at === 'game' ? open.run : null
  const ticking = run !== null && isTimed(run) && !run.paused
  // Read through the render rather than closed over, so the key handler never
  // acts on a phase that has moved on since it was installed.
  const pausable = run !== null && isPausable(run)
  const paused = run?.paused === true

  useEffect(() => {
    if (!showing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      // Nothing running: escape is still the way back. Something running:
      // stop it and ask, rather than throwing away a round in progress.
      // Already stopped: only whoever stopped it can take the card down, so
      // for anybody else escape is the same nothing the buttons are.
      if (!pausable) backOut()
      else if (!paused) pauseMinigame()
      else if (mayControl) resumeMinigame()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showing, pausable, paused, mayControl])

  useEffect(() => {
    if (!ticking) return
    const timer = window.setInterval(() => tickMinigame(TICK_MS / 1000), TICK_MS)
    return () => window.clearInterval(timer)
  }, [ticking])

  // Walking out mid-countdown must not leave the three-two-one playing to
  // nobody over the dashboard.
  useEffect(() => {
    if (!showing) stopScreenSounds()
  }, [showing])

  if (open.at === 'closed') return null
  if (open.at === 'dashboard') return <Dashboard />

  const current = open.run
  const build = buildFor(current.id)
  // The countdown is the game mounted and standing still. Every game stops dead
  // when it is told it is paused, so that is the lever - and it is why no game
  // has a line of code about counting down.
  const shown = isHeld(current) ? { ...current, paused: true } : current

  const over = (
    <>
      <Curtain run={current} />
      <Countdown run={current} />
      <Finish run={current} />
      {current.paused ? <PauseCard run={current} isHost={net.host} mayControl={mayControl} /> : null}
    </>
  )

  // Reading about it, or watching the black come down over that.
  if (!isShowingGame(current)) {
    return (
      <>
        <Briefing run={current} />
        {over}
      </>
    )
  }

  // Over, and the game said how everybody came out: the podium, in place of
  // the game. Taking the game down takes its canvas with it, so nothing is
  // drawn every frame under a page that covers it.
  if (current.phase === 'over' && current.standings) {
    return (
      <>
        <Podium run={current} />
        {over}
      </>
    )
  }

  if (!build) {
    return (
      <>
        <NotBuilt run={current} />
        {over}
      </>
    )
  }

  // Rendered as a component rather than called as a function, so a game's own
  // panel gets its own place to keep hooks. Called, its `useState` would
  // belong to this component instead, and switching games would hand the next
  // one the last one's state - which every game after the first would hit.
  const Panel = build.Panel
  return (
    <>
      <Panel key={`${current.id}:${current.started}`} run={shown} />
      {over}
    </>
  )
}

/** The card, handed everything it needs to name the person who put it up. */
function PauseCard({ run, isHost, mayControl }: { run: MinigameRun; isHost: boolean; mayControl: boolean }) {
  return <Paused isHost={isHost} pausedBy={run.pausedBy} me={getNet().id ?? 'you'} mayControl={mayControl} />
}

/**
 * The round started and there is no game in it.
 *
 * Honest rather than hidden: the countdown ran, the phase really is `playing`,
 * and what is missing is the game. This is what the whole screen is waiting
 * for somebody to replace, one `registerMinigame` at a time.
 */
function NotBuilt({ run }: { run: MinigameRun }) {
  const game = minigameById(run.id)
  return (
    <div style={screen}>
      <div style={bar}>
        <button type="button" onClick={backOut} style={button}>
          back
        </button>
        <span style={wordmark}>{game.title}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: ISLAND.fadedInk }}>playing</span>
      </div>
      <div style={{ ...body, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{ font: `700 26px/1.2 ${FONT}`, color: ISLAND.sand }}>Go!</div>
        <div style={{ color: ISLAND.deepSea, textAlign: 'center', maxWidth: 420 }}>
          This is where {game.title} would run. It has no build yet, so the
          round is empty - the countdown and the phase are real, the game is
          not.
        </div>
      </div>
    </div>
  )
}
