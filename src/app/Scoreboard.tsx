/**
 * Everybody in the lobby, on Tab.
 *
 * Held down rather than toggled, which is what every game does and therefore
 * what hands expect. Tab's default is to move focus, so it has to be
 * cancelled - otherwise the first press walks the focus ring through the
 * panel and the second one leaves the page entirely.
 */
import { useEffect, useState } from 'react'
import { useNet, usePeers } from '../modules/09-net'
import { ME, useParty } from '../modules/10-party'

export function Scoreboard() {
  const [open, setOpen] = useState(false)
  const net = useNet()
  const peers = usePeers()
  const party = useParty()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Tab') return
      // Typing a lobby code should still be able to leave the field.
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      e.preventDefault()
      setOpen(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Tab') setOpen(false)
    }
    // Alt-tabbing away never delivers the key-up, so the board would stick.
    const blur = () => setOpen(false)

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  if (!open) return null

  const rows = [
    { id: ME, name: 'you', ping: null as number | null, host: net.host },
    ...peers.map((p) => ({ id: p.id, name: p.name, ping: p.ping, host: false })),
  ]

  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ opacity: 0.55, letterSpacing: 0.6 }}>
            {net.status === 'joined' ? `LOBBY ${net.room}` : 'NOT IN A LOBBY'}
          </span>
          <span style={{ opacity: 0.4 }}>
            {party.phase === 'playing'
              ? 'on the board'
              : party.phase === 'gathering'
                ? 'getting ready'
                : ''}
          </span>
        </div>

        <div style={{ ...row, opacity: 0.4 }}>
          <span style={nameCell}>player</span>
          <span style={pingCell}>ping</span>
          <span style={readyCell}>ready</span>
        </div>

        {rows.map((r) => (
          <div key={r.id} style={row}>
            <span style={{ ...nameCell, color: r.id === ME ? '#ffcf8a' : '#f2ece2' }}>
              {r.name}
              {r.host ? <span style={{ opacity: 0.45 }}> host</span> : null}
            </span>
            <span style={pingCell}>
              {/* Your own ping to yourself is not a thing, so it says so. */}
              {r.id === ME ? '—' : r.ping === null ? '…' : `${Math.round(r.ping)} ms`}
            </span>
            <span
              style={{
                ...readyCell,
                color: party.ready.has(r.id) ? '#6fb6c8' : '#6b6862',
              }}
            >
              {party.ready.has(r.id) ? 'ready' : 'not yet'}
            </span>
          </div>
        ))}

        {net.status !== 'joined' ? (
          <div style={{ opacity: 0.4, marginTop: 6 }}>
            open the lobby, top left, to make one or join one
          </div>
        ) : null}
      </div>
    </div>
  )
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // The world is still being played behind this; it must not swallow the mouse.
  pointerEvents: 'none',
  background: 'rgba(8, 10, 14, 0.35)',
}

const card: React.CSSProperties = {
  minWidth: 330,
  padding: '12px 14px',
  borderRadius: 10,
  background: 'rgba(20, 22, 26, 0.92)',
  color: '#f2ece2',
  font: '12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace',
  userSelect: 'none',
}

const row: React.CSSProperties = { display: 'flex', gap: 10 }
const nameCell: React.CSSProperties = { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }
const pingCell: React.CSSProperties = { width: 64, textAlign: 'right', opacity: 0.7 }
const readyCell: React.CSSProperties = { width: 58, textAlign: 'right' }
