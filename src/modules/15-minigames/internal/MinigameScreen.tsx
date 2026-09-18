/**
 * The one thing the app mounts, and the only place that decides what is drawn.
 *
 * Three states and nothing else: shut, the dashboard, or one game. A game
 * being briefed or counted down is this module's own screen; a game actually
 * playing is the game's, if it has registered one, and a placeholder saying so
 * if it has not.
 *
 * The countdown's clock lives here, and only here. The store has none of its
 * own - it is advanced by whoever is showing it - which is what lets the whole
 * of "three, two, one, go" be tested by calling `tickRun` with a few numbers
 * instead of waiting three real seconds for it.
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
import { minigameById } from './catalogue'
import { FONT, ISLAND, bar, body, button, screen, wordmark } from './look'
import { buildFor, isPausable, type MinigameRun } from './registry'
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
  const counting = run?.phase === 'counting' && !run.paused
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
    if (!counting) return
    const timer = window.setInterval(() => tickMinigame(TICK_MS / 1000), TICK_MS)
    return () => window.clearInterval(timer)
  }, [counting])

  if (open.at === 'closed') return null
  if (open.at === 'dashboard') return <Dashboard />

  // Reading about it, or counting into it. Both are this module's screen.
  if (open.run.phase === 'briefing' || open.run.phase === 'counting') {
    return (
      <>
        <Briefing run={open.run} />
        {open.run.paused ? <PauseCard run={open.run} isHost={net.host} mayControl={mayControl} /> : null}
      </>
    )
  }

  const build = buildFor(open.run.id)
  if (!build) {
    return (
      <>
        <NotBuilt run={open.run} />
        {open.run.paused ? <PauseCard run={open.run} isHost={net.host} mayControl={mayControl} /> : null}
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
      <Panel key={open.run.id} run={open.run} />
      {open.run.paused ? <PauseCard run={open.run} isHost={net.host} mayControl={mayControl} /> : null}
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
