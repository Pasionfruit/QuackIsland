import { useEffect, useLayoutEffect, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useNet } from '../../09-net'
import { disbandParty, useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { useMinigameScreen } from '../../15-minigames'
import { isVolcanoBoardParty, shouldBlockKey } from './guards'
import { setVolcanoPause, useVolcanoPause, useVolcanoPauseSync } from './state'

/**
 * Captures Escape before the minigame screen sees it. The board has no ticking
 * simulation between turns, so its shared pause card safely holds all input
 * until the elected host resumes.
 */
export function VolcanoPause() {
  const root = useRef<Root | null>(null)
  const mount = useRef<HTMLDivElement | null>(null)
  const net = useNet()
  const party = useParty()
  const mode = useGameMode()
  const minigame = useMinigameScreen()
  const paused = useVolcanoPause() === 'paused'
  useVolcanoPauseSync()
  const active = isVolcanoBoardParty(party.phase, mode, minigame.at)

  // Layout effects run before the existing minigame screen's normal key
  // effect, so Escape cannot fall through to a catalogue navigation handler.
  useLayoutEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (!shouldBlockKey(paused, event.code)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.code === 'Escape' && net.host) setVolcanoPause(paused ? 'running' : 'paused')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, net.host, paused])

  useEffect(() => {
    const host = document.createElement('div')
    host.dataset.volcanoPause = ''
    document.body.append(host)
    mount.current = host
    root.current = createRoot(host)
    return () => {
      root.current?.unmount()
      root.current = null
      mount.current?.remove()
      mount.current = null
    }
  }, [])

  useEffect(() => {
    root.current?.render(<PauseCard active={active && paused} host={net.host} />)
  }, [active, net.host, paused])

  return null
}

function PauseCard({ active, host }: { active: boolean; host: boolean }) {
  if (!active) return null
  return (
    <section aria-label="Volcano Island paused" style={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-label="Paused" style={styles.card}>
        <div style={styles.kicker}>VOLCANO ISLAND</div>
        <h2 style={styles.heading}>Paused</h2>
        <p style={styles.copy}>{host ? 'The party is waiting for you.' : 'The host has paused the party.'}</p>
        {host ? (
          <div style={styles.actions}>
            <button type="button" onClick={() => setVolcanoPause('running')} style={styles.resume}>resume</button>
            <button type="button" onClick={disbandParty} style={styles.leave}>leave the party</button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', background: 'rgba(5, 10, 17, 0.72)', color: '#f7f1e8', fontFamily: 'system-ui, sans-serif' },
  card: { width: 'min(360px, calc(100vw - 40px))', padding: '28px', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 16, background: 'rgba(20, 28, 39, 0.96)', boxShadow: '0 22px 72px rgba(0,0,0,0.48)', textAlign: 'center' },
  kicker: { color: '#f1b961', fontSize: 11, fontWeight: 800, letterSpacing: '0.16em' },
  heading: { margin: '8px 0', fontSize: 31, lineHeight: 1.05 },
  copy: { margin: '0 0 22px', color: '#cbd5e1', fontSize: 14 },
  actions: { display: 'grid', gap: 9 },
  resume: { border: 0, borderRadius: 8, background: '#f0b75a', color: '#1b1510', padding: '10px 14px', font: '700 14px system-ui, sans-serif', cursor: 'pointer' },
  leave: { border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, background: 'transparent', color: '#e6edf5', padding: '9px 14px', font: '600 14px system-ui, sans-serif', cursor: 'pointer' },
}
