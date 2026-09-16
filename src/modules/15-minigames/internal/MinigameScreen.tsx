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
 * Escape steps back the same way the button does - out of a game to the
 * dashboard, out of the dashboard to the world.
 */
import { useEffect } from 'react'
import { Briefing } from './Briefing'
import { Dashboard } from './Dashboard'
import { minigameById } from './catalogue'
import { FONT, ISLAND, bar, body, button, screen, wordmark } from './look'
import { buildFor, type MinigameRun } from './registry'
import { backOut, tickMinigame, useMinigameScreen } from './state'

/** How often the countdown is advanced. Ten a second is smoother than it needs. */
const TICK_MS = 100

export function MinigameScreen() {
  const open = useMinigameScreen()
  const showing = open.at !== 'closed'
  const counting = open.at === 'game' && open.run.phase === 'counting'

  useEffect(() => {
    if (!showing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') backOut()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showing])

  useEffect(() => {
    if (!counting) return
    const timer = window.setInterval(() => tickMinigame(TICK_MS / 1000), TICK_MS)
    return () => window.clearInterval(timer)
  }, [counting])

  if (open.at === 'closed') return null
  if (open.at === 'dashboard') return <Dashboard />

  // Reading about it, or counting into it. Both are this module's screen.
  if (open.run.phase === 'briefing' || open.run.phase === 'counting') {
    return <Briefing run={open.run} />
  }

  const build = buildFor(open.run.id)
  if (!build) return <NotBuilt run={open.run} />

  // Rendered as a component rather than called as a function, so a game's own
  // panel gets its own place to keep hooks. Called, its `useState` would
  // belong to this component instead, and switching games would hand the next
  // one the last one's state - which every game after the first would hit.
  const Panel = build.Panel
  return <Panel key={open.run.id} />
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
