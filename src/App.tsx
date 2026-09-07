import { useCallback, useEffect, useState } from 'react'
import { Logo } from './components/Logo'
import { Dashboard } from './pages/Dashboard'
import { SmashPanel } from './games/smash/SmashPanel'
import { DuckPanel } from './games/duck/DuckPanel'
import { TankPanel } from './games/tank/TankPanel'
import { HidePanel } from './games/hide/HidePanel'
import { SketchPanel } from './games/sketch/SketchPanel'
import { CaseClosedPanel } from './games/caseclosed/CaseClosedPanel'
import { BuildBetrayPanel } from './games/buildbetray/BuildBetrayPanel'
import { PartyParadePanel } from './games/partyparade/PartyParadePanel'
import { gameById } from './games/registry'
import { TemplatePanel } from './games/TemplatePanel'

/** Games with a real panel; everything else gets the concept template. */
const PLAYABLE_GAMES = new Set([
  'smash',
  'duck-szn',
  'tank-trouble',
  'hide-and-seek',
  'sketch',
  'case-closed',
  'build-and-betray',
  'party-parade',
])

export type Route = { name: 'dashboard' } | { name: 'game'; id: string }

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const [section, id] = hash.split('/')
  if (section === 'game' && id) return { name: 'game', id }
  return { name: 'dashboard' }
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash)

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((next: Route) => {
    window.location.hash = next.name === 'game' ? `/game/${next.id}` : '/'
  }, [])

  const game = route.name === 'game' ? gameById(route.id) : undefined

  return (
    <div className="app">
      <header className="topbar">
        <Logo onClick={() => go({ name: 'dashboard' })} />
        <div className="spacer" />
        <span className="chip chip--gold">
          <span className="dot" /> Build 0.1.0
        </span>
        {route.name !== 'dashboard' && (
          <button className="btn btn--ghost btn--sm" onClick={() => go({ name: 'dashboard' })}>
            {'<'} Dashboard
          </button>
        )}
      </header>

      {route.name === 'dashboard' && <Dashboard onOpen={(id) => go({ name: 'game', id })} />}

      {route.name === 'game' && game?.id === 'smash' && <SmashPanel />}

      {route.name === 'game' && game?.id === 'duck-szn' && <DuckPanel />}

      {route.name === 'game' && game?.id === 'tank-trouble' && <TankPanel />}

      {route.name === 'game' && game?.id === 'hide-and-seek' && <HidePanel />}

      {route.name === 'game' && game?.id === 'sketch' && <SketchPanel />}

      {route.name === 'game' && game?.id === 'case-closed' && <CaseClosedPanel />}

      {route.name === 'game' && game?.id === 'build-and-betray' && <BuildBetrayPanel />}

      {route.name === 'game' && game?.id === 'party-parade' && <PartyParadePanel />}

      {route.name === 'game' && game && !PLAYABLE_GAMES.has(game.id) && (
        <TemplatePanel game={game} onBack={() => go({ name: 'dashboard' })} />
      )}

      {route.name === 'game' && !game && (
        <div className="panel">
          <div className="panel__title">404</div>
          <p className="muted">No such game in Animal Instinct.</p>
        </div>
      )}

      <footer className="footer">
        <span>Animal Instinct // a little camp of games</span>
        <span>Two on one keyboard, or host a room for friends</span>
      </footer>
    </div>
  )
}
