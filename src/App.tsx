import { useCallback, useEffect, useState } from 'react'
import { Logo } from './components/Logo'
import { Dashboard } from './pages/Dashboard'
import { SmashPanel } from './games/smash/SmashPanel'
import { gameById } from './games/registry'

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

      {route.name === 'game' && game && game.id !== 'smash' && (
        <div className="panel">
          <div className="panel__title">Not built yet</div>
          <h2 style={{ marginBottom: 10 }}>{game.title}</h2>
          <p className="muted">{game.blurb}</p>
          <button className="btn btn--sm" onClick={() => go({ name: 'dashboard' })}>
            Back to dashboard
          </button>
        </div>
      )}

      {route.name === 'game' && !game && (
        <div className="panel">
          <div className="panel__title">404</div>
          <p className="muted">No such game in Polyland.</p>
        </div>
      )}

      <footer className="footer">
        <span>Polyland // a little camp of games</span>
        <span>Two on one keyboard, or host a room for friends</span>
      </footer>
    </div>
  )
}
