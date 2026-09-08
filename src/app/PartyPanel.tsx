/**
 * The party dashboard, under the perf HUD.
 *
 * Lives in the app rather than in `10-party` because it reads across three
 * modules - who is in the lobby, who is ready, and whether you are the host -
 * and the composition root is the one place allowed to.
 */
import { useNet, usePeers } from '../modules/09-net'
import {
  ME,
  canStart,
  endGame,
  hostGame,
  setReady,
  startGame,
  useParty,
  waitingFor,
} from '../modules/10-party'

export function PartyPanel() {
  const net = useNet()
  const peers = usePeers()
  const party = useParty()

  // Everybody who has to be ready: the others, and you. The host readying up
  // is the same act as anybody else doing it.
  const everyone = [...peers.map((p) => p.id), ME]
  const ready = party.ready.has(ME)
  const waiting = waitingFor(everyone, party.ready)
  const startable = canStart(party.phase, net.host, everyone, party.ready)

  return (
    <div style={panel}>
      <div style={heading}>PARTY</div>

      {net.status !== 'joined' ? (
        <div style={{ opacity: 0.5 }}>join a lobby to play</div>
      ) : party.phase === 'off' ? (
        net.host ? (
          <button type="button" onClick={hostGame} style={{ ...button, width: '100%' }}>
            host a board game
          </button>
        ) : (
          <div style={{ opacity: 0.5 }}>waiting for the host</div>
        )
      ) : (
        <>
          <div style={{ opacity: 0.6, marginBottom: 4 }}>
            {party.phase === 'playing'
              ? 'on the board'
              : waiting === 0
                ? 'everybody ready'
                : `waiting on ${waiting}`}
          </div>

          {party.phase === 'gathering' ? (
            <button
              type="button"
              onClick={() => setReady(!ready)}
              style={{
                ...button,
                width: '100%',
                background: ready ? '#6fb6c8' : 'rgba(255,255,255,0.06)',
                color: ready ? '#16202a' : '#f2ece2',
              }}
            >
              {ready ? 'ready' : 'click when ready'}
            </button>
          ) : null}

          {net.host && party.phase === 'gathering' ? (
            <button
              type="button"
              onClick={startGame}
              disabled={!startable}
              style={{
                ...button,
                width: '100%',
                marginTop: 4,
                background: startable ? '#e0a05a' : 'none',
                color: startable ? '#20222a' : '#6b6862',
                cursor: startable ? 'pointer' : 'default',
              }}
            >
              start
            </button>
          ) : null}

          {/* Reachable only from 'gathering' or 'playing', so the phase check
              the compiler would reject here is not one worth writing. */}
          {net.host ? (
            <button
              type="button"
              onClick={endGame}
              style={{ ...button, width: '100%', marginTop: 4, opacity: 0.7 }}
            >
              {party.phase === 'playing' ? 'back to the island' : 'call it off'}
            </button>
          ) : null}
        </>
      )}

      <div style={{ opacity: 0.4, marginTop: 5 }}>tab for everyone</div>
    </div>
  )
}

const panel: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  background: 'rgba(20, 22, 26, 0.72)',
  color: '#f2ece2',
  font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  width: 168,
  boxSizing: 'border-box',
  userSelect: 'none',
}

const heading: React.CSSProperties = {
  opacity: 0.55,
  letterSpacing: 0.6,
  marginBottom: 4,
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
