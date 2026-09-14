/**
 * The lobby: make one, share the code, and pick what the party plays.
 *
 * Top left, behind one button, because it is the first thing you do and the
 * last thing you want to hunt for. It was in the debug panel, which is the
 * wrong place for the one panel that is not for debugging - that section is
 * now a line of status and a way in here.
 *
 * Lives in the app rather than in a module because it reads across three -
 * who is connected (`09-net`), what the party is doing (`10-party`), and what
 * it has chosen to play (`13-modes`) - and the composition root is the one
 * place allowed to know all of them.
 *
 * It selects a game. It does not start one, and it does not play one: starting
 * is the party dashboard's button, and the games themselves do not exist yet.
 */
import { useEffect, useRef, useState } from 'react'
import { joinLobby, leaveLobby, makeCode, useNet } from '../modules/09-net'
import { useParty } from '../modules/10-party'
import { MODES, chooseMode, useGameMode, useModeSync } from '../modules/13-modes'

export function LobbyPopup() {
  const [open, setOpen] = useState(false)
  const net = useNet()
  const party = useParty()
  const mode = useGameMode()

  // One subscription for the page. This component is always mounted - the
  // button is - so the lobby's choice stays in step whether the popup is open
  // or not, which it has to: a game can start while you are not looking at it.
  useModeSync()

  // Typed into and nothing else, so ordinary React state. Nothing in the world
  // reads them; `joinLobby` is what turns them into a lobby.
  const [code, setCode] = useState(() => makeCode())
  const [name, setName] = useState('player')

  const joined = net.status === 'joined'
  // The host picks the game, the same as the clock and the weather. Alone you
  // are your own host, so picking works before anybody else has arrived.
  const guest = joined && !net.host
  // Mid-game the choice is settled; changing it under people who are already
  // on the island is a way to break a game rather than a way to leave one.
  const locked = party.phase !== 'off'

  /**
   * The button and the popup together.
   *
   * The button has to be inside it, not just the card: closing is done on
   * mouse-down and opening on click, so a press on the button while the popup
   * is open would otherwise close it on the way down and open it again on the
   * way up - a button that cannot be pressed twice.
   */
  const shell = useRef<HTMLDivElement>(null)

  // Escape closes, and so does a click anywhere else - both of which people do
  // without thinking, and neither of which should reach the world behind.
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setOpen(false)
    }
    const down = (e: MouseEvent) => {
      if (!shell.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', key)
    // Captured, so it is seen before the canvas starts turning the camera with
    // the same press.
    window.addEventListener('mousedown', down, true)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('mousedown', down, true)
    }
  }, [open])

  return (
    <div ref={shell} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        style={{
          ...panel,
          ...button,
          width: 168,
          textAlign: 'left',
          borderColor: open ? 'rgba(255,255,255,0.3)' : 'transparent',
        }}
      >
        <span style={{ opacity: 0.55, letterSpacing: 0.6 }}>LOBBY</span>{' '}
        <span style={{ color: joined ? '#ffcf8a' : '#8d8a84' }}>
          {joined ? net.room : 'offline'}
        </span>
      </button>

      {open ? (
        <div style={popup}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ opacity: 0.55, letterSpacing: 0.6 }}>LOBBY</span>
            <button type="button" onClick={() => setOpen(false)} style={{ ...button, padding: '0 6px' }}>
              esc
            </button>
          </div>

          {/* A code to share, or one to type in. The relay only ever knows
              about rooms; what a game is stays entirely in the browser. */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
              placeholder="CODE"
              spellCheck={false}
              disabled={joined}
              style={{ ...field, width: 78, letterSpacing: 2, textAlign: 'center', color: '#ffcf8a' }}
            />
            <button
              type="button"
              onClick={() => setCode(makeCode())}
              disabled={joined}
              style={{ ...button, padding: '3px 7px' }}
              title="Make a new code"
            >
              new
            </button>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              placeholder="name"
              spellCheck={false}
              style={{ ...field, flex: 1, minWidth: 40 }}
            />
          </div>

          <button
            type="button"
            onClick={() => (joined ? leaveLobby() : joinLobby(code, name))}
            style={{
              ...button,
              width: '100%',
              marginTop: 6,
              padding: '4px 8px',
              background: joined ? 'rgba(255,255,255,0.06)' : '#e0a05a',
              color: joined ? '#f2ece2' : '#20222a',
            }}
          >
            {joined ? 'leave this lobby' : 'create or join'}
          </button>

          <div style={{ opacity: 0.5, marginTop: 5 }}>
            {joined
              ? `${net.peers} other${net.peers === 1 ? '' : 's'} here${net.host ? ', you host' : ''}`
              : net.status === 'connecting'
                ? 'connecting...'
                : net.status === 'error'
                  ? net.why
                  : 'share the code; anyone who types it is in the same world'}
          </div>

          <div style={rule} />

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ opacity: 0.55, letterSpacing: 0.6 }}>GAME</span>
            <span style={{ opacity: 0.4 }}>
              {guest ? 'the host picks' : locked ? 'settled for this round' : 'pick one'}
            </span>
          </div>

          {MODES.map((game) => {
            const picked = game.id === mode
            const pickable = !guest && !locked
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => chooseMode(game.id)}
                disabled={!pickable}
                style={{
                  ...button,
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 5,
                  padding: '6px 8px',
                  cursor: pickable ? 'pointer' : 'default',
                  borderColor: picked ? '#6fb6c8' : 'rgba(255,255,255,0.14)',
                  background: picked ? 'rgba(111,182,200,0.14)' : 'rgba(255,255,255,0.04)',
                  opacity: pickable || picked ? 1 : 0.5,
                }}
              >
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: picked ? '#9fd8e6' : '#f2ece2' }}>{game.title}</span>
                  <span style={{ opacity: 0.55 }}>
                    {picked ? 'chosen' : game.built ? '' : 'not built yet'}
                  </span>
                </span>
                <span style={{ display: 'block', opacity: 0.5, marginTop: 2 }}>{game.blurb}</span>
              </button>
            )
          })}

          <div style={{ opacity: 0.4, marginTop: 2 }}>
            everyone in the lobby plays the same one. start it in PARTY.
          </div>
        </div>
      ) : null}
    </div>
  )
}

const panel: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  background: 'rgba(20, 22, 26, 0.72)',
  color: '#f2ece2',
  font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  boxSizing: 'border-box',
  userSelect: 'none',
}

/**
 * Over the column rather than in it.
 *
 * The panels below are pinned to the same corner, and a popup that pushed them
 * down the screen every time it opened would be a panel, not a popup.
 */
const popup: React.CSSProperties = {
  ...panel,
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 6,
  width: 268,
  zIndex: 30,
  background: 'rgba(20, 22, 26, 0.94)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
}

const button: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 4,
  color: '#f2ece2',
  font: 'inherit',
  padding: '3px 8px',
  cursor: 'pointer',
}

const field: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 4,
  color: '#f2ece2',
  font: 'inherit',
  padding: '3px 6px',
  boxSizing: 'border-box',
}

const rule: React.CSSProperties = {
  height: 1,
  background: 'rgba(255,255,255,0.1)',
  margin: '9px 0',
}
