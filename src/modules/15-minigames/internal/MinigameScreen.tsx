/**
 * The one thing the app mounts, and the only place that decides what is drawn.
 *
 * Three states and nothing else: shut, the dashboard, or one game. A game is
 * drawn by its own registered panel if it has one and by the shared template
 * if it does not, which is the fallback that makes forty-one template panels
 * exist without forty-one files having to.
 *
 * Escape steps back the same way the button does - out of a game to the
 * dashboard, out of the dashboard to the world.
 */
import { useEffect } from 'react'
import { Dashboard } from './Dashboard'
import { TemplatePanel } from './TemplatePanel'
import { buildFor } from './registry'
import { backOut, useMinigameScreen } from './state'

export function MinigameScreen() {
  const screen = useMinigameScreen()
  const open = screen.at !== 'closed'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') backOut()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (screen.at === 'closed') return null
  if (screen.at === 'dashboard') return <Dashboard />

  const build = buildFor(screen.run.id)
  if (!build) return <TemplatePanel run={screen.run} />

  // Rendered as a component rather than called as a function, so a game's own
  // panel gets its own place to keep hooks. Called, its `useState` would
  // belong to this component instead, and switching games would hand the next
  // one the last one's state - which every game after the first would hit.
  const Panel = build.Panel
  return <Panel key={screen.run.id} />
}
